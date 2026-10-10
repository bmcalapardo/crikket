# Handoff: feature/diagnostics-page (issue #24, v0.3.0)

- **Head:** 5e0e058, one commit on v030-base 0fab60c. Not yet PRed; it targets prerelease/v0.3.0 once that exists. The worktree was crikket-f-diag (EOL noise only).
- **Commit:** `feat(extension): add a diagnostics page that reports named checks and exports a redacted bundle (#24)`.

## What it does (27 files; see `git show --stat 5e0e058`)
- **Checks:** `apps/extension/lib/diagnostics/checks.ts` runs nine named checks (version, build SHA, API, auth, screenshot, recording, debugger, storage, last error), each pass/warn/fail with a timeout and abort. It never rejects.
- **Error log:** `error-log.ts` keeps a ring buffer of 20 errors, redacted via `@crikket/capture-core/debugger/redaction`. It redacts a 10k window, then slices to 500 characters.
- **Bundle:** `bundle.ts` builds a redacted export: checks, echoed API responses, errors and a `chrome.storage` dump with auth keys masked, values over 1 KB omitted, and at most 200 keys.
- **Wiring:** `environment.ts` hits `/rpc/healthCheck` and `/api/auth/get-session`.
- **Page:** `components/diagnostics-page.tsx` + `entrypoints/diagnostics/`, with a popup button.
- **Build SHA:** `lib/build-sha.ts` + `wxt.config.ts` define `VITE_BUILD_SHA` from `github.sha` (ci.yml, extension-release.yml), falling back to "local". `turbo.json` lists `VITE_BUILD_SHA` in the build env.
- **Shared:** `packages/shared/src/lib/errors.ts` gains `addNonFatalErrorListener`.

## Acceptance criteria (#24)
All are met in tests: check IDs and status, a simulated API failure, the ring buffer, export redaction, the build SHA, and keyboard/a11y structure.
- **Coordinator check:** a turbo build with `VITE_BUILD_SHA=cafe1234beef` embeds that value in the bundle.
- **Mutation checks by the author:** removing redaction failed 11 tests; removing the timeout failed 3.

## Round 2
- **r2/redact:** probed with canaries; no leaks except by design. Storage KEYS stay readable (only values are masked), and free text with no key=value shape is not masked.
- **r2/ext:** `installErrorLog` is a per-context singleton (no double install).
- **No r2 commits** are owned by this branch.

## Overlap with #20 (feature/pause-resume-recording)
Both edit `apps/extension/hooks/use-screen-capture.ts`. Resolution, already used in v030-int and r2-int:
1. Take #20's version of the file.
2. Add `import { recordCaptureSuccess } from "@/lib/diagnostics/last-capture"`.
3. Call `recordCaptureSuccess("video")` in #20's single `stopRecording` path, right after `setIsPaused(false)`.
Whichever branch merges second into prerelease/v0.3.0 must carry this.

## Needs a real browser
`chrome.*` APIs, the live checks against a deployed API, the clipboard and download link, the popup's `chrome.tabs.create`, and tabbing through the page. The `/api/auth/get-session` path was inferred from the web middleware and is not confirmed on the server.

## Downstream
crikket-8f's #25/#27/#28/#32 hang settings off this page. Send it the new SHA after any amend.

## Suggested skills
- mattpocock-skills:code-review
- security-review: the export-bundle contents.
- mattpocock-skills:resolving-merge-conflicts: the #20 overlap.
