import { testingAsserts as ta } from "./deps-test.ts";
import { fs } from "./deps.ts";
import * as mod from "./mod.ts";

const rejectEntries = mod.walkShellCmdEntryRejectGlobFilter(
  ".",
  ".git",
  ".git/**",
);

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
      return `ls -l ${ctx.walkEntry.path}`;
    },
    {
      entryFilter: rejectEntries,
      ...mod.quietShellOutputOptions,
    },
  );
  ta.assert(result.totalEntriesEncountered > 0);
  ta.assertEquals(result.filteredEntriesEncountered, 9);
});

export interface EnhancedRunShellCommandResult
  extends mod.RunShellCommandResult {
  readonly isEnhancedRunShellCommandResult: true;
  readonly successful: boolean;
}

export function isEnhancedRunShellCommandResult(
  r: mod.RunShellCommandResult,
): r is EnhancedRunShellCommandResult {
  return "isEnhancedRunShellCommandResult" in r;
}

export interface EnhancedWalkShellCommandResult
  extends mod.WalkShellCommandResult {
  readonly isEnhancedWalkShellCommandResult: true;
  results: mod.RunShellCommandResult[];
  successfulEntries: () => mod.RunShellCommandResult[];
}

export function isEnhancedWalkShellCommandResult(
  r: mod.WalkShellCommandResult,
): r is EnhancedWalkShellCommandResult {
  return "isEnhancedWalkShellCommandResult" in r;
}

Deno.test(`Test walk command execution with walkOptions per walk entry and verify each entry's success`, async () => {
  const results: mod.RunShellCommandResult[] = [];
  const result = await mod.walkShellCommand(
    fs.walkSync("."),
    (ctx): [
      Deno.RunOptions | string,
      mod.RunShellCommandOptions,
    ] => {
      return [`ls -l ${ctx.walkEntry.path}`, {
        enhanceRunShellCommandResult: (rscr): EnhancedRunShellCommandResult => {
          return {
            ...rscr,
            isEnhancedRunShellCommandResult: true,
            successful: mod.isDryRunResult(rscr)
              ? true
              : (mod.isExecutionResult(rscr) ? rscr.code == 0 : false),
          };
        },
        ...mod.quietShellOutputOptions,
      }];
    },
    {
      entryFilter: rejectEntries,
      onRunShellCommandResult: (ctx) => {
        results.push(ctx);
      },
      enhanceWalkResult: (wscr): EnhancedWalkShellCommandResult => {
        return {
          ...wscr,
          isEnhancedWalkShellCommandResult: true,
          results: results,
          successfulEntries: (): mod.RunShellCommandResult[] => {
            return results.filter((r) =>
              isEnhancedRunShellCommandResult(r) && r.successful
            );
          },
        };
      },
    },
  );
  ta.assert(result.totalEntriesEncountered > 0);
  ta.assertEquals(result.filteredEntriesEncountered, 9);
  ta.assert(isEnhancedWalkShellCommandResult(result));
  if (isEnhancedWalkShellCommandResult(result)) {
    ta.assertEquals(
      result.successfulEntries().length,
      9,
      "Each command executed should have been successful",
    );
  }
});

// set this to true to try the walk on stdout, helps increase code coverage for
// those functions that only emit to console (the test cases above are "quiet")
const debugToStdOut = false;

if (debugToStdOut) {
  await mod.walkShellCommand(fs.walkSync("."), (ctx) => {
    return `echo "${ctx.walkEntryIndex} ${ctx.walkEntryRelPath}"`;
  }, { entryFilter: rejectEntries });
}
