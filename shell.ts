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

export interface RunShellCommandResult {
  readonly isRunShellCommandResult: true;
  denoRunOpts: Deno.RunOptions;
  rsCmdOpts: RunShellCommandOptions;
}

export interface ShellCommandDryRunResult extends RunShellCommandResult {
  readonly isShellCommandDryRunResult: true;
}

export function isDryRunResult(
  r: RunShellCommandResult,
): r is ShellCommandDryRunResult {
  return "isShellCommandDryRunResult" in r;
}

export interface RunShellCommandExecResult extends RunShellCommandResult {
  readonly isRunShellCommandExecResult: true;
  readonly code: number;
  readonly stdOut: Uint8Array;
  readonly stdErrOutput: Uint8Array;
}

export function isExecutionResult(
  r: RunShellCommandResult,
): r is RunShellCommandExecResult {
  return "isRunShellCommandExecResult" in r;
}

export interface ShellCommandStatusHandler {
  (er: RunShellCommandExecResult): void;
}

export interface RunShellCommandOptions {
  readonly dryRun?: boolean;
  readonly onDryRun?: (drr: ShellCommandDryRunResult) => void;
  readonly onCmdComplete?: ShellCommandStatusHandler;
}

export const quietShellOutputOptions: RunShellCommandOptions = {
  onDryRun: (): void => {},
  onCmdComplete: (): void => {},
};

export const cliVerboseShellOutputOptions: RunShellCommandOptions = {
  onDryRun: (drr: ShellCommandDryRunResult): void => {
    if (drr.denoRunOpts.cwd) {
      console.log(`cd ${drr.denoRunOpts.cwd}`);
    }
    if (drr.denoRunOpts.env) {
      console.dir(drr.denoRunOpts.env);
    }
    console.log(drr.denoRunOpts.cmd.join(" "));
  },
  onCmdComplete: (er: RunShellCommandExecResult): void => {
    const writer = er.code == 0 ? Deno.stdout : Deno.stderr;
    writer.writeSync(er.code == 0 ? er.stdOut : er.stdErrOutput);
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
    ctx: RunShellCommandResult,
  ) => CliVerboseShellBlockHeaderResult,
  override?: RunShellCommandOptions,
): RunShellCommandOptions {
  return {
    onDryRun: (drr: ShellCommandDryRunResult): void => {
      const header = blockHeader(drr);
      if (header.headerText) {
        Deno.stdout.writeSync(encode(header.headerText));
      }
      if (drr.denoRunOpts.cwd) {
        console.log(`cd ${drr.denoRunOpts.cwd}`);
      }
      if (drr.denoRunOpts.env) {
        console.dir(drr.denoRunOpts.env);
      }
      console.log(drr.denoRunOpts.cmd.join(" "));
      if (header.separatorText) {
        Deno.stdout.writeSync(encode(header.separatorText));
      }
    },
    onCmdComplete: override?.onCmdComplete ||
      ((er: RunShellCommandExecResult): void => {
        const writer = er.code == 0 ? Deno.stdout : Deno.stderr;
        const header = blockHeader(er);
        if (header.headerText) {
          writer.writeSync(encode(header.headerText));
        }
        if (!header.hideBlock) {
          writer.writeSync(er.code == 0 ? er.stdOut : er.stdErrOutput);
        }
        if (header.separatorText) {
          writer.writeSync(encode(header.separatorText));
        }
      }),
  };
}

export async function runShellCommand(
  command: Deno.RunOptions | string,
  rsCmdOpts: RunShellCommandOptions = {},
): Promise<RunShellCommandResult> {
  const denoRunOpts = typeof command === "string"
    ? {
      cmd: commandComponents(command),
    }
    : command;
  if (rsCmdOpts.dryRun) {
    const result: ShellCommandDryRunResult = {
      isRunShellCommandResult: true,
      isShellCommandDryRunResult: true,
      denoRunOpts: denoRunOpts,
      rsCmdOpts,
    };
    if (rsCmdOpts.onDryRun) {
      rsCmdOpts.onDryRun(result);
    }
    return result;
  } else {
    denoRunOpts.stdout = "piped";
    denoRunOpts.stderr = "piped";

    const proc = Deno.run(denoRunOpts);
    const { code } = await proc.status();
    const stdOut = await proc.output();
    const stdErrOutput = await proc.stderrOutput();
    const result: RunShellCommandExecResult = {
      isRunShellCommandResult: true,
      isRunShellCommandExecResult: true,
      stdOut,
      code,
      stdErrOutput,
      denoRunOpts,
      rsCmdOpts,
    };
    if (rsCmdOpts.onCmdComplete) {
      rsCmdOpts.onCmdComplete(result);
    }
    proc.close();
    return result;
  }
}

export interface WalkShellCommandOptions extends RunShellCommandOptions {
  readonly entryFilter?: (ctx: WalkShellEntryContext) => boolean;
  readonly relPathSupplier?: (we: fs.WalkEntry) => string;
  readonly onRunShellCommand?: (
    ctx: WalkShellEntryCmdResultContext,
  ) => void;
  readonly enhanceResult?: (
    r: WalkShellCommandResult,
  ) => WalkShellCommandResult;
}

export interface WalkShellEntryContext {
  we: fs.WalkEntry;
  relPath: string;
  index: number;
}

export interface WalkShellEntryCmdResultContext {
  execResult: RunShellCommandResult;
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
        let rsCmdOptions = runParams.length > 1
          ? runParams[1]
          : walkShellOptions;
        rsCmdOptions = {
          ...rsCmdOptions,
          ...cliVerboseShellBlockOutputOptions(blockHeader, rsCmdOptions),
        };
        const rscResult = await runShellCommand(cmd, rsCmdOptions);
        if (walkShellOptions.onRunShellCommand) {
          walkShellOptions.onRunShellCommand(
            { ...context, execResult: rscResult },
          );
        }
      } else {
        const rsCmdOptions = {
          ...walkShellOptions,
          ...cliVerboseShellBlockOutputOptions(blockHeader, walkShellOptions),
        };
        const rscResult = await runShellCommand(runParams, rsCmdOptions);
        if (walkShellOptions.onRunShellCommand) {
          walkShellOptions.onRunShellCommand(
            { ...context, execResult: rscResult },
          );
        }
      }
      filteredIndex++;
    }
    fileIndex++;
  }
  const result: WalkShellCommandResult = {
    totalEntriesProcessed: fileIndex,
    filteredEntriesProcessed: filteredIndex,
  };
  return walkShellOptions.enhanceResult
    ? walkShellOptions.enhanceResult(result)
    : result;
}
