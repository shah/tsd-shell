import { fs, path } from "./deps.ts";

export function commandComponents(command: string): string[] {
  // split components of the command with double-quotes support
  const splitCmdRegExp = /[^\s"]+|"([^"]*)"/gi;
  const components = [];

  let match: RegExpExecArray | null;
  do {
    //Each call to exec returns the next regex match as an array
    match = splitCmdRegExp.exec(command);
    if (match != null) {
      //Index 1 in the array is the captured group if it exists
      //Index 0 is the matched text, which we use if no captured group exists
      components.push(match[1] ? match[1] : match[0]);
    }
  } while (match != null);

  return components;
}

export interface ShellCommandZeroStatusHandler {
  (
    stdOut: Uint8Array,
    code: number,
    runOpts: Deno.RunOptions,
  ): void;
}

export interface ShellCommandNonZeroStatusHandler {
  (
    stdErrOutput: Uint8Array,
    code: number,
    stdOut: Uint8Array,
    runOpts: Deno.RunOptions,
  ): void;
}

export interface RunShellCommandOptions {
  readonly dryRun?: boolean;
  readonly onSuccessStatus?: ShellCommandZeroStatusHandler;
  readonly onNonZeroStatus?: ShellCommandNonZeroStatusHandler;
}

export const quietShellOutputOptions: RunShellCommandOptions = {
  onSuccessStatus: (): void => {},
  onNonZeroStatus: (): void => {},
};

export const cliVerboseShellOutputOptions: RunShellCommandOptions = {
  onSuccessStatus: (rawOutput: Uint8Array): void => {
    Deno.stdout.writeSync(rawOutput);
  },
  onNonZeroStatus: (rawOutput: Uint8Array): void => {
    Deno.stderr.writeSync(rawOutput);
  },
};

export interface CliVerboseShellBlockHeaderResult {
  headerText?: Uint8Array | string;
  hideBlock?: boolean;
  separatorText?: Uint8Array | string;
}

export function encode(input: Uint8Array | string): Uint8Array {
  return typeof input === "string" ? new TextEncoder().encode(input) : input;
}

export function cliVerboseShellBlockOutputOptions(
  blockHeader: (
    code: number,
    runOpts: Deno.RunOptions,
    stdOut: Uint8Array,
    stdErrOutput?: Uint8Array,
  ) => CliVerboseShellBlockHeaderResult,
  override?: RunShellCommandOptions,
): RunShellCommandOptions {
  return {
    onSuccessStatus: override?.onSuccessStatus || ((
      stdOut: Uint8Array,
      code: number,
      runOpts: Deno.RunOptions,
    ): void => {
      const header = blockHeader(code, runOpts, stdOut);
      if (header.headerText) {
        Deno.stdout.writeSync(encode(header.headerText));
      }
      if (!header.hideBlock) Deno.stdout.writeSync(stdOut);
      if (header.separatorText) {
        Deno.stdout.writeSync(encode(header.separatorText));
      }
    }),
    onNonZeroStatus: override?.onNonZeroStatus || ((
      stdErrOutput: Uint8Array,
      code: number,
      stdOut: Uint8Array,
      runOpts: Deno.RunOptions,
    ): void => {
      const header = blockHeader(code, runOpts, stdOut, stdErrOutput);
      if (header.headerText) {
        Deno.stderr.writeSync(encode(header.headerText));
      }
      if (!header.hideBlock) Deno.stderr.writeSync(stdErrOutput);
      if (header.separatorText) {
        Deno.stderr.writeSync(encode(header.separatorText));
      }
    }),
  };
}

export async function runShellCommand(
  command: Deno.RunOptions | string,
  { dryRun, onSuccessStatus, onNonZeroStatus }: RunShellCommandOptions = {},
): Promise<void> {
  const runOpts = typeof command === "string"
    ? {
      cmd: commandComponents(command),
    }
    : command;
  if (dryRun) {
    if (runOpts.cwd) {
      console.log(`cd ${runOpts.cwd}`);
    }
    if (runOpts.env) {
      console.dir(runOpts.env);
    }
    console.log(runOpts.cmd.join(" "));
  } else {
    runOpts.stdout = "piped";
    runOpts.stderr = "piped";

    const proc = Deno.run(runOpts);
    const { code } = await proc.status();
    const stdOut = await proc.output();
    const stdErr = await proc.stderrOutput();
    if (code === 0) {
      if (onSuccessStatus) {
        onSuccessStatus(stdOut, code, runOpts);
      }
    } else {
      if (onNonZeroStatus) {
        onNonZeroStatus(stdErr, code, stdOut, runOpts);
      }
    }
    proc.close();
  }
}

export interface WalkShellCommandOptions extends RunShellCommandOptions {
  readonly entryFilter?: (ctx: WalkShellEntryContext) => boolean;
  readonly relPathSupplier?: (we: fs.WalkEntry) => string;
}

export interface WalkShellEntryContext {
  we: fs.WalkEntry;
  relPath: string;
  index: number;
}

export interface WalkShellCommandSupplier {
  (ctx: WalkShellEntryContext): (Deno.RunOptions | string) | [
    Deno.RunOptions | string,
    RunShellCommandOptions,
  ];
}

export interface WalkShellCommandResult {
  readonly totalEntriesProcessed: number;
  readonly filteredEntriesProcessed: number;
}

export async function walkShellCommand(
  walkEntries: IterableIterator<fs.WalkEntry>,
  command: WalkShellCommandSupplier,
  walkShellOptions: WalkShellCommandOptions = {},
): Promise<WalkShellCommandResult> {
  let [fileIndex, filteredIndex] = [0, 0];
  const { entryFilter, relPathSupplier } = walkShellOptions;
  for (const we of walkEntries) {
    const relPath = relPathSupplier
      ? relPathSupplier(we)
      : path.relative(Deno.cwd(), we.path);
    const context = { we: we, relPath: relPath, index: filteredIndex };
    if (!entryFilter || (entryFilter && entryFilter(context))) {
      const blockHeader = (): CliVerboseShellBlockHeaderResult => {
        return {
          headerText: `${relPath}\n`,
          separatorText: "\n",
        };
      };
      const runParams = command(context);
      if (Array.isArray(runParams)) {
        const cmd = runParams[0];
        const rsCmdOptions = runParams.length > 1
          ? runParams[1]
          : walkShellOptions;
        await runShellCommand(cmd, {
          ...rsCmdOptions,
          ...walkShellOptions,
          ...cliVerboseShellBlockOutputOptions(blockHeader, walkShellOptions),
        });
      } else {
        await runShellCommand(runParams, {
          ...walkShellOptions,
          ...cliVerboseShellBlockOutputOptions(blockHeader, walkShellOptions),
        });
      }
      filteredIndex++;
    }
    fileIndex++;
  }
  return {
    totalEntriesProcessed: fileIndex,
    filteredEntriesProcessed: filteredIndex,
  };
}
