# Implementation brief (shared by every issue agent)

You are implementing ONE GitHub issue in the Crikket monorepo (bun + turbo; WXT browser extension in
`apps/extension`, Hono/oRPC server in `apps/server`, Next.js web app in `apps/web`, shared packages in
`packages/*`, embeddable SDK in `sdks/capture`). Several other agents are working in parallel on other
issues in sibling worktrees, and another Claude session is hardening older branches. Stay strictly inside
your own worktree and branch.

## Your workspace
- Worktree and branch are given in your task prompt. They already exist, with `.env` files copied and
  `bun install` done. `cd` into the worktree for every command (use absolute paths).
- The branch's parent ref (given in the prompt) is the commit you build on. When you finish, the
  branch must contain EXACTLY ONE commit on top of that parent: `git rev-list --count <parent>..HEAD`
  must print 1.
- NEVER touch other worktrees, other branches, `master`, `prerelease/*`, `v030-base`, `v030-int`, or any
  remote branch other than your own. No `git reset --hard`, no `git checkout -- .`, no `git clean`,
  no rebases of shared refs, no branch deletion.

## HARD TIME LIMIT (today only; check with `date +%H:%M`)
The user needs the machine at 21:30 local time.
- Prefer focused checks (single-package `bun test`, `tsc` on one package) over full turbo runs.
- Do NOT start a commit (the hook is a full build plus tests) or any full `bun run build` / turbo run after
  21:00. If you are ready to commit before 21:00, commit and push.
- If you are not done by 21:00: stop coding and leave your work UNCOMMITTED in the worktree (don't
  stash it, don't delete it). Write a file `WIP-NOTES.md` at the worktree root covering what's done,
  what's left and the next steps (don't commit it), then report.
- By 21:15, every process you started (servers, watchers, test runs) must be stopped, and you must
  have sent your final report.

## Before coding
1. `gh issue view <N> --comments` for the full issue, and read the parent PRD:
   `docs/crikket-upgrades/PRD.md` (search it for the relevant section).
2. Read `CONTEXT.md` (domain language: Capture, Draft, Report, Annotation, Marker, Obscuring,
   Redaction, Reporter, Tester, Channel; use these terms in code and docs), `CONTRIBUTING.md`
   (commit and changelog conventions), and `docs/agents/domain.md`.
3. Study the existing code you'll extend, and match its style, naming and comment density. Biome
   (`ultracite`) formats on commit.

## While coding
- Meet every acceptance criterion in the issue. Prefer test-first where practical (`bun test` in each
  package; extension tests live in `apps/extension/test`, with happy-dom preloaded). There are
  condition-wait helpers in `apps/extension/test/wait-for.ts`; use them instead of fixed sleeps and
  tick counts, because the suite runs under heavy parallel load.
- Keep logic in pure, unit-testable modules (`apps/extension/lib/...`), with thin React hooks and
  components on top.
- If a criterion genuinely cannot be completed in this environment (it needs real signing credentials,
  a real browser picker, a deployed backend, etc.), build everything that can be built, put the
  limitation in the docs, and say so plainly in your final report. Never fake a passing check.
- Database changes: follow the existing drizzle setup in `packages/db` (look at how earlier schema
  changes and migrations were made), and keep the strict report payload schemas
  (`packages/bug-reports`) strict.
- Any NEW workspace subpath export that `apps/server` imports must point at `./src/*.ts`, not
  `./dist`, because Vercel builds the server without building workspace deps.
- Any local server you start (test harness, dev server, Bun.serve) must use a port in 4800-4899 (pick
  one derived from your issue number, e.g. 4800 + N). Ports 4700-4799 belong to another session.
  Stop every server you start before finishing.
- This is Windows with Git Bash. There is no Python; use `bun` for scripts.
- Run focused checks as you go: `bun run check-types`, `bun run test`, and `bun run build` in the
  packages you touched (or `bunx turbo run <task> --filter=<pkg>`).

## Changelog
Append one line at the very END of `Changelog.md` (under the last heading, `### v0.3.0`):
`- [BC] <your commit subject>`. Do not change any version numbers.

## Commit and push
- Commit subject: `category(scope): imperative summary (#N)`, e.g.
  `feat(extension): annotate with lines, arrows, shapes and text (#14)`. The body briefly explains
  what was built, key design decisions and known limitations. End the message with this trailer line:
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
- Write commit messages to a PRIVATE file, `i<N>-msg.txt` in the scratchpad (never a shared name such as
  `msg.txt`; other agents run in parallel). After committing, check `git log -1 --format=%s`.
- `.husky/pre-commit` runs the FULL `bun run build` and `bun run test`, then `ultracite fix`. It takes
  several minutes; give the commit command a long timeout (10 minutes). Never use `--no-verify`. If
  the hook fails, fix the cause and commit again.
- After a commit the hook leaves hundreds of files showing as modified that differ ONLY in line
  endings. Confirm with `git diff --ignore-cr-at-eol --name-only`, which should be empty. That noise is
  harmless; don't commit it. If it blocks a git operation, stash it with
  `git stash push -m "eol-noise <branch>"`; never discard it with reset or checkout.
- If you need a follow-up change, AMEND the single commit (`git commit --amend`); don't stack commits.
- Push: `git push -u origin <branch>` (after an amend: `git push --force-with-lease origin <branch>`).
  Do NOT open a pull request.

## Final report (your last message)
- Branch, final commit SHA, and `git rev-list --count <parent>..HEAD` (must be 1).
- Each acceptance criterion: done / partially done / not done, with a one-line note of where it's met.
- Tests added. Gate result (hook passed?). Push result.
- Deviations, limitations and anything the hardening reviewer should probe first.
Keep it under about 400 words.
