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

export interface ShellCmdStatusReporter {
  before?(
    writer: Deno.WriterSync,
    stdOut: Uint8Array,
    code: number,
    runOpts: Deno.RunOptions,
  ): void;
  after?(
    writer: Deno.WriterSync,
    stdOut: Uint8Array,
    code: number,
    runOpts: Deno.RunOptions,
  ): void;
}

export function postShellCmdBlockStatusReporter(
  heading: string,
): ShellCmdStatusReporter {
  return {
    before: (
      writer: Deno.WriterSync,
    ): void => {
      // if Deno.Run produced any output, add a heading
      writer.writeSync(new TextEncoder().encode(heading + "\n"));
    },
    after: (
      writer: Deno.WriterSync,
      stdOut: Uint8Array,
    ): void => {
      // if Deno.Run produced any output, add a blank line (otherwise nothing)
      const text = new TextDecoder().decode(stdOut);
      if (text.trim()) {
        writer.writeSync(new TextEncoder().encode(""));
      }
    },
  };
}

export function prepShellCmdStdOutReporter(
  reporter: ShellCmdStatusReporter,
): ShellCommandZeroStatusHandler {
  return (
    stdOut: Uint8Array,
    code: number,
    runOpts: Deno.RunOptions,
  ): void => {
    if (reporter.before) reporter.before(Deno.stdout, stdOut, code, runOpts);
    Deno.stdout.writeSync(stdOut);
    if (reporter.after) reporter.after(Deno.stdout, stdOut, code, runOpts);
  };
}

export function prepShellCmdStdErrReporter(
  reporter: ShellCmdStatusReporter,
): ShellCommandNonZeroStatusHandler {
  return (
    stdErrOutput: Uint8Array,
    code: number,
    stdOut: Uint8Array,
    runOpts: Deno.RunOptions,
  ): void => {
    if (reporter.before) {
      reporter.before(Deno.stderr, stdErrOutput, code, runOpts);
    }
    Deno.stdout.writeSync(stdOut);
    Deno.stderr.writeSync(stdErrOutput);
    if (reporter.after) {
      reporter.after(Deno.stderr, stdErrOutput, code, runOpts);
    }
  };
}

export function shellCmdStdOutHandler(rawOutput: Uint8Array): void {
  Deno.stdout.writeSync(rawOutput);
}

export function shellCmdStdErrHandler(rawOutput: Uint8Array): void {
  Deno.stderr.writeSync(rawOutput);
}

export async function runShellCommand(
  command: Deno.RunOptions | string,
  { dryRun, onSuccessStatus, onNonZeroStatus }: {
    readonly dryRun?: boolean;
    readonly onSuccessStatus?: ShellCommandZeroStatusHandler;
    readonly onNonZeroStatus?: ShellCommandNonZeroStatusHandler;
  },
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
    if (code === 0) {
      if (onSuccessStatus) {
        onSuccessStatus(stdOut, code, runOpts);
      }
    } else {
      const stdErr = await proc.stderrOutput();
      if (onNonZeroStatus) {
        onNonZeroStatus(stdErr, code, stdOut, runOpts);
      }
    }
    proc.close();
  }
}

//https://deno.land/x/shell_tag@v0.0.1
//https://deno.land/x/execute@v1.1.0
