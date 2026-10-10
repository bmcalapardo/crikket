# Handoff: feature/report-environment (#25, "Tell developers what the tester was running")

## State
- **Branch:** `feature/report-environment`, local and origin both at **b0232cf**. That is the UNHARDENED implementation: one commit on local `v030-int` (fd2896d), and the hook passed.
- **Hardening (UPDATED, final state of the session):** the hardening is now committed as ONE separate commit, **b955e3d**, on branch **`wip/report-environment-hardening`** (based on b0232cf), which is pushed to origin. The full pre-commit hook PASSED: build, all tests and lint. The first hook run failed only on biome `noBitwiseOperators` in the test's mulberry32 PRNG; that was replaced with the repo's Park-Miller LCG, as in `annotations-fuzz.test.ts`.
  - **Why a separate branch:** folding it into `feature/report-environment` with `git commit --amend` was denied by the auto-mode classifier and is awaiting the user's approval. So `feature/report-environment` was deliberately left at b0232cf.
  - **To finish, once the user approves:** squash b955e3d into b0232cf. For example, on feature/report-environment run `git merge --ff-only wip/report-environment-hardening`, then `git reset --soft v030-int` and recommit with the combined message (the subject of b0232cf plus the "Hardening:" paragraph from b955e3d). Check the count is 1, run `git push --force-with-lease origin feature/report-environment`, then delete `wip/report-environment-hardening` locally and on origin.
  - **Files changed by b955e3d (11):** `apps/extension/lib/report-environment.ts`, `apps/extension/test/report-environment-hardening.test.ts`, `apps/web/package.json` (adds a `test` script), `apps/web/src/app/s/[id]/_components/bug-report-sidebar.tsx`, `.../types.ts`, `apps/web/src/lib/report-environment-view.ts`, `apps/web/test/report-environment-view.test.ts`, `packages/bug-reports/src/lib/report-payload-schema.ts`, `packages/bug-reports/src/procedures/get-bug-report.ts`, `packages/bug-reports/test/environment-persistence.test.ts` and `packages/bug-reports/test/report-payload-schema.test.ts`.
  - **Worktree `crikket-i25`:** nothing real is uncommitted (EOL noise only). The old `WIP-NOTES.md` is preserved as `crikket-8f-assets/report-environment.WIP-NOTES.md` in this handoff folder.
- **Base:** local `v030-int`. It must be rebuilt as a single commit on `prerelease/v0.3.0` once that exists.
- **Spec:** `gh issue view 25`; implementation detail in `git show b0232cf`.

## Acceptance criteria
Unit and schema tests only; there is no live DB or browser check.
- **Versioned `environment` jsonb column: done.** `packages/db/src/migrations/0001_report_environment.sql` adds it on `bug_report` and `bug_report_upload_session`.
- **`deviceInfo` unchanged: done.**
- **Contents: done.** Extension version, build SHA (`VITE_BUILD_SHA`, falling back to "local"), browser, OS, viewport, DPR, capture type and duration. The builder is `apps/extension/lib/report-environment.ts`.
- **Page URL and title setting, default on: done.** A diagnostics page checkbox, stored as `environmentIncludePage`.
- **Stable fields and version match: done.** `test/report-environment.test.ts`; the version is checked against package.json, not a real build.
- **Web sidebar: done.** `bug-report-sidebar.tsx`. A rendering test arrives only with the hardening commit b955e3d (wip/report-environment-hardening).
- **No secrets: done.** `redactUrl` runs in the extension; the hardening commit b955e3d (wip/report-environment-hardening) adds server-side redaction.

## Hardening (commit b955e3d on wip/report-environment-hardening)
- **Fixes:**
  - Control characters (including NUL, which breaks jsonb) are stripped.
  - Server-side `redactUrl` and `redactText` run via the src-pointing capture-core export.
  - The extension clamps every number and string to the server's limits, so reports aren't rejected.
  - `collectReportEnvironment` never throws.
  - The UA is capped at 1000 characters, with a ReDoS timing guard.
  - Client Hints (`navigator.userAgentData`) are preferred.
  - The web type is inferred from zod (`StoredReportEnvironment`), and rendering moved into a pure `describeEnvironment`.
- **Fuzz:** a 500-case seeded fuzz validated against the real zod schema.
- **Research:** https://developer.mozilla.org/en-US/docs/Web/API/NavigatorUAData

## Open decisions and checks
1. **Migration drift:** the migration also runs `SET DEFAULT 'public'` on `visibility` for both tables. The schema has said 'public' since b409c9a, but the 0000 baseline says 'private'; production was likely updated via `db:push`, which is unconfirmed. The statement is idempotent, and the agent recommends keeping it. User decision.
2. **Strict `schemaVersion: z.literal(1)`:** a newer client against an older server is rejected, so the extension and server must deploy together. Should it be relaxed? User decision.
3. **CPU-DoS check:** crikket-ec found a CPU DoS in #50's redaction pass. The hardening commit b955e3d runs that redaction on the server, so verify the zod `.max()` length caps run BEFORE the redact transform (zod applies the checks before `.transform`), and add a timing test with megabyte inputs.
4. **Out of scope:** `deviceInfo` has the same NUL and jsonb risk.
5. **NEXT:** #28 (tester label), stacked as one commit on this branch; it adds an optional field and keeps `schemaVersion`. Then #30 (channels) on #28, which adds `channel` to the environment. Then #31 and #32 on #30.
- **Overlaps:** this builds on #24 (`feature/diagnostics-page`) and the ingestion schemas that crikket-ec's round-2 testers may change. Expect a rebase.

## Suggested skills
- `mattpocock-skills:code-review`: review the hardening commit b955e3d (wip/report-environment-hardening) before amending.
- `mattpocock-skills:tdd`: #28.
- `mattpocock-skills:resolving-merge-conflicts`: the rebase after crikket-ec's amends.
- `mattpocock-skills:domain-modeling`: Tester versus Reporter terms for #28 (`CONTEXT.md`).
