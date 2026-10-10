# Handoff: feature/deflake-crop-step-test (v0.3.0)

- **Head:** 5ade9eb, one commit on v030-base 0fab60c. Not yet PRed. It was rebased last from crikket-v030b.
- **Commit:** `test(extension): wait on conditions instead of ticks and best-of-N timing so tests pass under load`.

## What it does (now 4 files)
- `apps/extension/test/crop-step.test.tsx` waits for the rendered `<img>` via the new `test/wait-for.ts` instead of `setTimeout(0)`. Under CPU load that tick raced React's scheduler and the object-URL effect.
- `sdks/capture/test/lib/sdk-test-harness.ts` raises the `waitFor` upper bound from 1 s to 10 s.
- One Changelog line under `### v0.3.0`.

## Evidence (from the original commit, 03e0097)
- **Before:** the full extension suite with 24 CPU-burner workers on 12 cores failed 11 of 15 runs.
- **After:** 50 of 50 passed.

## Needs fixing on the next amend
The commit message still describes the `annotation-render.test.ts` best-of-N change. That hunk dropped out on rebase because #52 (cbfad73) already contains it.
- **To fix:** rewrite the paragraph starting "The same load run exposed wall-clock budgets…" to say the change now lives in #52.
- **How:** `git commit --amend` (with the hook) in a clean worktree on this branch.

## Not changed (no failures seen)
- `debugger-session-*` 300 ms sleeps, which wait on a 250 ms timer.
- The 100 ms and 500 ms budgets in capture-core `normalize`/`redaction` tests. r2/redact saw the 3000 ms "redaction timing" test fail once (3926 ms) under 6-way Stryker contention; consider best-of-N there too, owner #50.

## Suggested skills
- mattpocock-skills:diagnosing-bugs: for any new flake, raise the repro rate under load first.
- mattpocock-skills:code-review
