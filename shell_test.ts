import { testingAsserts as ta } from "./deps-test.ts";
import * as mod from "./mod.ts";

Deno.test(`Test Git shell error`, async () => {
  const testDir = Deno.makeTempDirSync();
  let errorEncountered;
  await mod.runShellCommand(
    { cmd: mod.commandComponents("git status -s"), cwd: testDir },
    {
      dryRun: false,
      onSuccessStatus: mod.shellCmdStdOutHandler,
      onNonZeroStatus: (stdErrOutput: Uint8Array): void => {
        errorEncountered = stdErrOutput;
      },
    },
  );
  ta.assert(errorEncountered);
  Deno.removeSync(testDir, { recursive: true });
});

Deno.test(`Test Git shell success`, async () => {
  const testDir = Deno.makeTempDirSync();
  let statusMessage: unknown;
  let errorEncountered: unknown;
  await mod.runShellCommand(
    "git status -s",
    {
      dryRun: false,
      onSuccessStatus: (stdOut: Uint8Array): void => {
        statusMessage = stdOut;
      },
      onNonZeroStatus: (stdErrOutput: Uint8Array): void => {
        errorEncountered = stdErrOutput;
      },
    },
  );
  ta.assert(statusMessage, "Status should be reported");
  ta.assert(
    typeof errorEncountered === "undefined",
    "No error should be encountered",
  );
  Deno.removeSync(testDir, { recursive: true });
});
