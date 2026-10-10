# Handoff: crikket-8f phase-2 open-issue plan (all branches)

Session crikket-8f, 2026-10-10. The user asked for a branch and subagent per remaining open issue (excluding #40 GCP, which is phase 3 / 1.0.0), then a negative and stress hardening pass per branch, then commit and push. No PRs.

The peer session crikket-ec owns the 0.2.0 PR branches (#47, #48, #50, #51, #52), the six 0.3.0 branches, `v030-base`, `r2-int` and `r2/*`. This session owns the `feature/*` issue branches below, `v030-int`, and the worktrees `crikket-base` and `crikket-i*`.

## Base: local `v030-int` @ fd2896d (never pushed; don't push it)
- It starts from `0fab60c` (canonical `v030-base`): prerelease/v0.2.0, plus merges of the PR heads 8ac60b8 (#51), dbe3560 (#47), 0f251d1 (#48), 6e870c3 (#50) and cbfad73 (#52), plus "chore(release): open v0.3.0".
- On top of that, it merges the six 0.3.0 branches: feature/diagnostics-page 5e0e058 (#24), feature/pause-resume-recording fc23ce3 (#20), feature/qa-fixtures 323bd5f (#34), feature/extension-rpc-errors 9ff9c73, feature/deflake-crop-step-test 5ade9eb and feature/ci-path-filters 11d28e2.
- The #20 and #24 conflict in `apps/extension/hooks/use-screen-capture.ts` was resolved by taking #20's file and adding `recordCaptureSuccess("video")` (plus its import) in #20's single `stopRecording` path.
- Gate on fd2896d: `check-types`, `build` and `test` all pass (after `bun install`).
- When crikket-ec amends its branches after round-2 testing, it sends old→new SHAs. Then rebuild `v030-int` and `git rebase --onto` each stack.
- Before any PR, every issue branch must be rebuilt as a SINGLE commit on the real `prerelease/v0.3.0`, without the v030-int merges. crikket-ec will create that branch from the merged 0.2.0 tip.

## Stack layout (each branch is one commit on its parent)

| Issue | Branch | Parent | State |
|---|---|---|---|
| #14 | feature/annotation-shapes-text | v030-int | pushed and hardened |
| #15 | (not started) | #14 | todo |
| #16 | (not started) | #15 | todo |
| #18 | feature/screenshot-draft-recovery | v030-int | pushed and hardened |
| #19 | (not started) | #18 | todo |
| #21 | feature/trim-recording | v030-int | pushed and hardened |
| #22 | (not started) | #21 | todo |
| #25 | feature/report-environment | v030-int | pushed (b0232cf, unhardened). The hardening is a separate pushed commit, b955e3d on `wip/report-environment-hardening`, to squash in once the user approves |
| #28 | (not started) | #25 | todo |
| #30 | (not started) | #28 | todo |
| #31, #32 | (not started) | #30 | todo |
| #17 | feature/full-page-capture | v030-int | pushed and hardened |
| #23, #27 | (not started) | v030-int | todo |
| #33 | feature/release-smoke-checks | v030-int | pushed (10314a0), hook passed; not hardened yet |
| #35 | (not started) | local merge of #16 and #19 | todo |
| #36 | (not started) | local merge of #35 and #22 | todo |

Issue dependency text: `gh issue view <N>` ("Blocked by"). Parent PRD: `docs/crikket-upgrades/PRD.md`, and #8 is the parent issue.

## Tooling and conventions
- **Agent briefs** (reusable as-is) are copied into `crikket-8f-assets/` next to this file. The originals were in a session-scoped scratchpad.
  - `brief-implement.md` (its "HARD TIME LIMIT" section was specific to 2026-10-10, so drop it);
  - `brief-harden.md`;
  - `setup-wt.sh <N> <branch> <parent>`, which creates `../crikket-i<N>`, copies the `.env` files and runs `bun install`.
  `crikket-8f-assets/` also preserves the old WIP-NOTES for #25 and #33.
- **Commit messages:** each agent writes to a PRIVATE file `i<N>-msg.txt`. A shared `msg.txt` got clobbered once. Check `git log -1 --format=%s` after every commit.
- **Ports:** agents' local servers use 4800-4899. crikket-ec uses 4700-4799.
- **No `merge=union`:** don't add a `.git/info/attributes` `Changelog.md merge=union` rule. Resolve Changelog conflicts explicitly (append-only lines under `### v0.3.0`), and count lines after each merge.
- **EOL noise:** the pre-commit hook (full build, tests, `ultracite fix`) leaves hundreds of files modified by line endings only. Verify with `git diff --ignore-cr-at-eol --name-only` (it should be empty). If it blocks checkout or cherry-pick, stash it with a message. `git reset --hard` is blocked by the auto-mode classifier.
- **Killing processes:** stop them by PID only, never `taskkill /IM bun.exe`.
- **No Python** on this machine; use bun for scripts.
- **One commit per branch:** fold follow-ups in with `commit --amend` and use `push --force-with-lease`.
- **Vercel:** any workspace export the server consumes must point at `./src`, not `./dist`.

## Open user decisions (all branches)
- #18 added the `alarms` permission.
- #25's migration also sets the `visibility` default to `'public'`.
- #25's strict `schemaVersion: 1` handshake forces the extension and server to deploy together.
- #25's hardening is on `wip/report-environment-hardening` (b955e3d, hook passed). Squashing it into `feature/report-environment` awaits user approval, because the amend was denied by the classifier.

## Suggested skills
- `mattpocock-skills:tdd`: when implementing the remaining issues.
- `mattpocock-skills:code-review`: review each branch against its issue before rebuilding on prerelease/v0.3.0.
- `mattpocock-skills:resolving-merge-conflicts`: when rebasing the stacks after crikket-ec's SHA batch.
- `mattpocock-skills:research`: redo the hardening research for #17 and #18 from primary sources.
- `run`: only when the user wants a real-browser check and the machine is free.
