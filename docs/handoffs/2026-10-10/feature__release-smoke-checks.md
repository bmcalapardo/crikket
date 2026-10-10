# Handoff: feature/release-smoke-checks (#33, "Verify a release before testers download it")

## State
- **Branch (UPDATED, final state of the session):** `feature/release-smoke-checks` @ **10314a0**, ONE commit on `v030-int` (fd2896d), pushed to origin. The full pre-commit hook PASSED: build, all tests and lint.
  - **Subject:** `feat(server): add GET /health and verify the extension release before it is published (#33)`.
  - **Fixes before committing:**
    - `pause-command.test.ts` now reads the command declarations from `lib/manifest-contract.ts`.
    - Biome lint: `verifyManifest` was split into `verifyManifestBasics`, `verifyCommands` and `verifyPermissions` to pass cognitive complexity, with unchanged behaviour.
    - Two inline regexes in `verify-release.test.ts` became substring `toThrow("…")`.
  - **History:** the earlier 20:27 hook run failed on `pause-command.test.ts`, and its hung process tree was killed by PID.
- **Worktree `crikket-i33`:** nothing real is uncommitted (EOL noise only). The old `WIP-NOTES.md` is preserved as `crikket-8f-assets/release-smoke-checks.WIP-NOTES.md`.
- **Not done yet:** a hardening pass.
- **Base:** local `v030-int`. It must be rebuilt as a single commit on `prerelease/v0.3.0` once that exists.

## Acceptance criteria
Unit tests only, with an injected fetch.
- **`GET /health` returns status, version and commit: done.** `apps/server/src/health.ts` reads `APP_VERSION`, then `GIT_COMMIT_SHA`, then `VERCEL_GIT_COMMIT_SHA`, reporting "unknown" when unset. It sends `cache-control: no-store`, and is registered after CORS and before rate-limit and session. Tests: `apps/server/test/health.test.ts`.
- **`GET /` unchanged: done by code reading.** No test imports `index.ts`.
- **Package exists, manifest valid, commands and permissions asserted: done.** `apps/extension/scripts/verify-release.ts` reads the zip itself (stored and deflate entries only). `lib/manifest-contract.ts` is the single source of truth, also used by `wxt.config.ts`.
- **Backend health reachable for the target: done.** It is injectable, has `--skip-health`, and adds a web rewrite `/server-health` to the server's `/health` (excluded from the middleware). The env vars are `EXTENSION_SERVER_URL` and `EXTENSION_APP_URL`.
- **Failure blocks the release: done.** A "Verify release" step in the workflow before "Name artifacts", with `publish` needing `build`. Triggers and path filters are untouched.

## Known gaps and next steps
1. Run a hardening pass using `brief-harden.md` (see `README-crikket-8f-plan.md`). Probe first:
   - the zip parser against a REAL `wxt zip` output and malformed zips (zip bombs, ZIP64, data descriptors);
   - a health-check timeout and retry policy;
   - the `/server-health` rewrite exposure.
2. Nothing in deploy sets `APP_VERSION` yet, so the version reads "unknown".
3. The real backend check can't pass until a server with `/health` and the web rewrite is deployed.
- **Overlaps:** this touches the workflow files that crikket-ec's `feature/ci-path-filters` and #51 changed, plus `apps/web/middleware.ts` (#48 area). Expect a rebase.

## Suggested skills
- `mattpocock-skills:code-review`: before committing.
- `mattpocock-skills:tdd`: hardening tests.
- `mattpocock-skills:resolving-merge-conflicts`: after crikket-ec's amends.
