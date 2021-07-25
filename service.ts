export interface RunListenableServiceOptions {
  readonly command: string[];
  readonly port: number;
  readonly cwd?: string;
}

export interface RunListenableServiceResult {
  readonly denoRunOpts: Deno.RunOptions;
  readonly rsOpts: RunListenableServiceOptions;
  readonly process: Deno.Process<Deno.RunOptions>;
  readonly statusPromise: Promise<void>;
  readonly serviceIsRunning: () => boolean;
  readonly waitForListener: (timeoutMS: number) => Promise<boolean>;
  readonly stop: () => Promise<void>;
}

export function startListenableService(
  options: RunListenableServiceOptions,
): RunListenableServiceResult {
  const runOpts: Deno.RunOptions = {
    cmd: options.command,
    cwd: options.cwd,
    stdin: "null",
    stdout: "null",
    stderr: "null",
  };
  const p = Deno.run(runOpts);
  let serviceIsRunning = true;
  const statusPromise = p
    .status()
    .then((): void => {
      serviceIsRunning = false;
    })
    .catch((_): void => {}); // Ignores the error when closing the process.
  return {
    denoRunOpts: runOpts,
    process: p,
    rsOpts: options,
    statusPromise: statusPromise,
    serviceIsRunning: () => {
      return serviceIsRunning;
    },
    waitForListener: async (timeoutMS): Promise<boolean> => {
      const waitTime = 250;
      let waited = 0;
      while (true) {
        try {
          const conn = await Deno.connect({ port: options.port });
          conn.close();
          return true;
        } catch (_err) {
          Deno.sleepSync(waitTime);
          waited += waitTime;
          if (waited > timeoutMS) return false;
        }
      }
    },
    stop: async () => {
      Deno.kill(p.pid, Deno.Signal.SIGKILL);
      await statusPromise;
      p.close();
    },
  };
}
