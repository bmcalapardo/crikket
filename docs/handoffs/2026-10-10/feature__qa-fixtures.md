# Handoff: feature/qa-fixtures (issue #34, v0.3.0)

- **Head:** 323bd5f, one commit on v030-base 0fab60c. Not yet PRed. The worktree was crikket-f-qa.
- **Commit:** `feat(qa-fixtures): add a known-bad page with deterministic bug scenarios (#34)`.

## What it does
A new private app `apps/qa-fixtures` (Hono on Bun, server-rendered HTML) with eight deterministic scenarios under `/scenarios/*`: working, console-error, network-500, slow (`?ms=`, capped at 10 s), broken-image, form-failure, long-page (exactly 12000px) and sensitive (fake token, cookie and password, all `qa-fixture-fake-*-do-not-use`).
- **Deploy:** `vercel.json` + `api/index.ts` for Vercel, and a Dockerfile on port 4100.
- **Docs:** a README and `apps/docs/content/docs/deployment/qa-fixtures.mdx`. bun.lock is updated.

## Acceptance criteria (#34)
- **Met in tests (30 tests):** the scenarios are deterministic (100× loops), the long-page height is exact, and the fake secrets are masked by Redaction (`test/sensitive.test.ts`).
- **Not done:** deployment per channel needs the user to create Vercel projects (Root Directory `apps/qa-fixtures`, one per Alpha/Beta/Stable) or use the Docker image. No deploy was run.

## Round 2 hardening: NOT yet committed
- **The patch:** saved in this folder as `qa-fixtures-hardening.patch`; the full modified tree is `qa-fixtures-modified/`. Line endings are LF; apply with `git apply --ignore-whitespace`.
- **Changes:**
  - **Q1 (DoS, medium, confirmed):** a global in-flight cap of `MAX_IN_FLIGHT_SLOW = 100` on `/api/slow`. Excess requests get a 503 with `retry-after`; the cap is injectable as `maxInFlightSlow`. Load test: 3000 connections for 15 s gave 31.8k 503s, and `/healthz` stayed responsive.
  - `x-content-type-options: nosniff` on every response.
  - **Q5:** `src/index.ts` binds `HOST` (default 127.0.0.1); the Dockerfile sets `HOST=0.0.0.0`.
  - Three tests: nosniff, cap-then-release, and no reflection or CRLF.
- **Refuted:** reflected XSS, CRLF header injection, cookie shadowing (host-only, `SameSite=Lax`), and the fake secrets tripping push protection.
- **Untested:** Bun's default 10 s `idleTimeout` against `ms=10000` exactly may cut the response at the cap.
- **To finish:**
  1. Apply the patch on feature/qa-fixtures and run the app's tests.
  2. `git commit --amend` into 323bd5f (one commit), with the hook.
  3. Tell crikket-8f the new SHA.

## Integration warning
**r2-int does NOT contain this branch**: the merge was refused and misreported as "clean". The full-integration gates have therefore never run with qa-fixtures merged alongside the other five 0.3.0 branches. crikket-8f's v030-int does include it (all 6 changelog lines are present). Re-verify with `git merge-base --is-ancestor` when rebuilding.

## Suggested skills
- mattpocock-skills:tdd
- security-review
- mattpocock-skills:code-review
