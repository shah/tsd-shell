import { assertEquals } from "https://deno.land/std@0.70.0/testing/asserts.ts";
import { testingAsserts as ta } from "./deps-test.ts";
import { fs } from "./deps.ts";
import * as mod from "./mod.ts";

Deno.test(`Test Git command execution (non-zero result)`, async () => {
  const testDir = Deno.makeTempDirSync();
  let statusMessage: unknown;
  let errorEncountered: unknown;
  await mod.runShellCommand(
    { cmd: mod.commandComponents("git status -s"), cwd: testDir },
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
  ta.assert(errorEncountered, "Error should be reported");
  ta.assert(
    typeof statusMessage === "undefined",
    "STDOUT should be empty",
  );
  Deno.removeSync(testDir, { recursive: true });
});

Deno.test(`Test Git command execution (zero result)`, async () => {
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
});

Deno.test(`Test walk command execution`, async () => {
  const result = await mod.walkShellCommand(
    fs.walkSync("."),
    (ctx): string => {
      return `ls -l ${ctx.we.path}`;
    },
    {
      entryFilter: (ctx: mod.WalkShellEntryContext): boolean => {
        if (ctx.we.isDirectory && ctx.we.name == ".git") return false;
        if (ctx.we.path.startsWith(".git")) return false;
        return true;
      },
      ...mod.quietShellOutputOptions,
    },
  );
  assertEquals(result.totalEntriesProcessed, 83);
  assertEquals(result.filteredEntriesProcessed, 10);
});
