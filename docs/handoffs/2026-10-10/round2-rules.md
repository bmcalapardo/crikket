# Round 2 testing: shared rules (read fully before starting)

Repo: C:/Users/Brandon/Documents/Work/Code/crikket (bmcalapardo/crikket). Read CONTEXT.md and CONTRIBUTING.md.
Playbook (methods, tools, candidate attacks): scratchpad/testing-playbook.md in this same folder.
CAUTION: the playbook was written against an OLD checkout (before PR #50's redaction rewrite and before the 0.3.0 branches).
Every [code]/[verified] claim in it must be re-verified on your tree before you act on it.

## Setup
- Integration ref `r2-int` = canonical base `v030-base` (0fab60c: prerelease/v0.2.0 + the five 0.2.0 PR heads + "open v0.3.0")
  plus the six 0.3.0 branches merged. It is the code under test.
- Create your own worktree: `git -C C:/Users/Brandon/Documents/Work/Code/crikket worktree add -b r2/<area> C:/Users/Brandon/Documents/Work/Code/crikket-r2-<area> r2-int`
- Copy apps/web/.env, apps/server/.env, apps/docs/.env from C:/Users/Brandon/Documents/Work/Code/crikket-r2-int (never print them), then `bun install --frozen-lockfile`.
- Work ONLY in your worktree. Never touch other worktrees, branches or refs. In particular, crikket-base, crikket-v030 and
  crikket-v030-int belong to another Claude session working in this repo. Never run `git add -u`, `git add -A`,
  `git checkout -- .`, `git reset --hard`, `git stash`, or anything that rewrites refs other than your own r2/<area> branch.
- No pushing, no PRs, no GitHub writes.
- Remote services in the .env files (database, S3, Upstash, Polar and so on) are shared dev resources. NEVER load-test or fuzz
  them. Run servers in-process (`app.request(...)` / Bun.serve on localhost) with those dependencies mocked or stubbed.
  Load tests only against localhost.

## Who owns which file (route each fix to its owner)
0.2.0 PRs (base prerelease/v0.2.0):
- #51 feature/prerelease-branches: .github/workflows/{changelog,ci,extension-release,hotfix-approval}.yml, apps/extension/scripts/{check-changelog,plan-release}.ts (+tests), CONTRIBUTING.md
- #47 feature/trim-pr-checks: .github/workflows/{docker-publish,publish,extension-release}.yml path filters
- #48 feature/fix-extension-session-origin: apps/extension/lib/{app-urls,orpc,recorder-submit}.ts, packages/env/src/extension.ts, recorder/App.tsx RPC/login bits
- #50 feature/harden-redaction: packages/capture-core/src/debugger/{redaction,normalize}.ts, capture-core engine/page/** network/header capture, packages/bug-reports/src/lib/{debugger,debugger-items}.ts
- #52 feature/annotation-editor: apps/extension annotate-step, crop-step, use-annotation-*, use-screenshot-crop, lib/{annotations,annotation-render,screenshot-edits,recorder-state}.ts
0.3.0 branches (base v030-base):
- feature/diagnostics-page (#24): apps/extension/lib/diagnostics/**, components/diagnostics-page.tsx, entrypoints/diagnostics/**, lib/build-sha.ts, packages/shared/src/lib/errors.ts, turbo.json env
- feature/pause-resume-recording (#20): lib/pausable-recording.ts, use-screen-capture.ts, recording-step, popup recording status, hotkey commands, packages/billing/src/service/entitlements/video-duration.ts, packages/bug-reports/src/lib/entitlements.ts
- feature/qa-fixtures (#34): apps/qa-fixtures/**
- feature/extension-rpc-errors: apps/extension/lib/orpc.ts (redirect handling), packages/env/src/app-origin.ts
- feature/deflake-crop-step-test: extension test waits
- feature/ci-path-filters: workflow path filters
Anything else (for example apps/server/src/cors-origin.ts, apps/web/middleware.ts, the auth proxy, upload sessions, pre-existing
code on master) is "pre-existing". Fix it only if the fix is small, safe and clearly correct, as Owner: new-hardening. If the right
behaviour is a product decision (for example allow-listing extension IDs, which breaks Firefox's random moz-extension UUIDs),
do NOT fix it: report it with a recommendation.

## Method (the "diagnosing bugs" discipline, applied to negative/attack/stress testing)
1. For each candidate, first build a tight, deterministic, agent-runnable loop that goes RED if the bug exists (a bun test at the
   right seam, an in-process HTTP request, a CLI call). Run it. No loop, no claim.
2. If it goes red: minimise the repro, state the confirmed hypothesis, write the regression test at the correct seam (watch it fail),
   apply the minimal fix, watch it pass, and re-run the loop. If no correct seam exists, say so.
3. If it stays green, keep the loop as a durable test if it adds coverage (fast <2s, seeded, deterministic). Otherwise discard it.
4. Rank by severity: security/data-leak > data loss/corruption > crash/hang/DoS > wrong result > robustness/UX.
5. Mutation testing (Stryker, command runner) measures test strength. Use it on small security-critical files and add tests to
   kill meaningful surviving mutants.

## Tooling (verified on this machine)
- fast-check works under `bun test`. You may add it as a devDependency of the package whose tests use it (commit bun.lock with it).
- Stryker: only via the command runner (`bun test <files>`), with coverageAnalysis "off" and mutate scoped to 1-3 files.
  Install it in a scratch dir OUTSIDE the repo or with `bunx`. Never commit Stryker config or deps.
- recheck (ReDoS): run under Node, not Bun, from a scratch dir. Ignore the "corrupt jarfile" noise.
- autocannon via bunx for load against localhost only. actionlint and zizmor: download or `uvx` into a scratch dir.
- Scratch dir for throwaway harnesses: C:/Users/Brandon/AppData/Local/Temp/claude/C--Users-Brandon-Documents-Work-Code-crikket/b2c3dcaf-14a1-4f7b-b8ce-3335b3339e0b/scratchpad/r2-<area>/

## Committing fixes (on your r2/<area> branch only)
- ONE commit per fix, conventional subject (`app(fix): ...`, `test(...): ...`). The FIRST line of the body is exactly
  `Owner: <branch name or new-hardening>`, so the coordinator can route it. A commit must touch only files of one owner.
- Do NOT edit Changelog.md.
- Stage explicit paths only (`git add <path> ...`).
- The pre-commit hook runs full build + test + `ultracite fix`. Never use --no-verify.
- On Windows the hook leaves hundreds of EOL-only "modified" files. Leave them alone; confirm with
  `git diff --ignore-cr-at-eol --name-only` that nothing real is uncommitted.
- If the hook fails on a flaky test unrelated to you, re-run it once and report the flake with its name.

## Report (concise)
- A findings table: id, severity, owner, confirmed or refuted, fixed / reported-only, and the loop command.
- For each fix: the red-then-green evidence and the commit SHA.
- Mutation scores before and after, for any file you ran Stryker on.
- Items you could not test, and why.
