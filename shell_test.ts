import { testingAsserts as ta } from "./deps-test.ts";
import { fs } from "./deps.ts";
import * as mod from "./mod.ts";

Deno.test(`Test Git command execution (non-zero result)`, async () => {
  const testDir = Deno.makeTempDirSync();
  const result = await mod.runShellCommand(
    { cmd: mod.commandComponents("git status"), cwd: testDir },
  );
  ta.assert(mod.isExecutionResult(result));
  if (mod.isExecutionResult(result)) {
    ta.assert(
      result.stdErrOutput,
      "Error should be reported since testDir is not a Git repo",
    );
    ta.assertEquals(result.code, 128);
  }
  Deno.removeSync(testDir, { recursive: true });
});

Deno.test(`Test Git command execution (zero result)`, async () => {
  let cmdCodeEncountered = false;
  const result = await mod.runShellCommand(
    "git status",
    {
      onCmdComplete: (execResult) => {
        cmdCodeEncountered = true;
        ta.assertEquals(execResult.code, 0, "Command result should be zero");
        ta.assert(execResult.stdOut.length > 0, "stdout should have content");
        ta.assert(
          execResult.stdErrOutput.length == 0,
          "stderr should not have content",
        );
      },
    },
  );
  ta.assert(mod.isExecutionResult(result));
  ta.assert(
    cmdCodeEncountered,
    "Code not encountered, onCmdComplete did not execute",
  );
});

Deno.test(`Test Git command execution (dry run)`, async () => {
  let drrEncountered = false;
  let occEncountered = false;
  const result = await mod.runShellCommand(
    "git status -s",
    {
      dryRun: true,
      onDryRun: (drr) => {
        drrEncountered = true;
        ta.assertEquals(drr.denoRunOpts.cmd, ["git", "status", "-s"]);
      },
      onCmdComplete: () => {
        occEncountered = true;
      },
    },
  );
  ta.assert(mod.isDryRunResult(result));
  ta.assert(
    drrEncountered,
    "drr not encountered, onDryRun did not execute",
  );
  ta.assert(
    !occEncountered,
    "occ encountered, onCmdComplete should not execute",
  );
});

Deno.test(`Test walk command execution with a single walkOptions for all walk entries`, async () => {
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
  ta.assert(result.totalEntriesProcessed > 0);
  ta.assertEquals(result.filteredEntriesProcessed, 10);
});

Deno.test(`Test walk command execution with walkOptions per walk entry and verify each entry's success`, async () => {
  const results: mod.RunShellCommandResult[] = [];
  const result = await mod.walkShellCommand(
    fs.walkSync("."),
    (ctx): [
      Deno.RunOptions | string,
      mod.RunShellCommandOptions,
    ] => {
      return [`ls -l ${ctx.we.path}`, mod.quietShellOutputOptions];
    },
    {
      entryFilter: (ctx: mod.WalkShellEntryContext): boolean => {
        if (ctx.we.isDirectory && ctx.we.name == ".git") return false;
        if (ctx.we.path.startsWith(".git")) return false;
        return true;
      },
      onRunShellCommand: (we, result) => {
        results.push(result);
      },
    },
  );
  ta.assertEquals(
    results.filter((r) => mod.isExecutionResult(r) && r.code == 0).length,
    10,
    "Each command executed should have been successful",
  );
  ta.assert(result.totalEntriesProcessed > 0);
  ta.assertEquals(result.filteredEntriesProcessed, 10);
});
