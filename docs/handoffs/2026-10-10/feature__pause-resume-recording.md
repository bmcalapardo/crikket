# Handoff: feature/pause-resume-recording (issue #20, v0.3.0)

- **Head:** fc23ce3, one commit on v030-base 0fab60c. Not yet PRed. The worktree was crikket-f-pause.
- **Commit:** `feat(extension): pause and resume a recording, billing only playable length (#20)`.

## What it does (23 files; `git show --stat fc23ce3`)
- **Controller:** `apps/extension/lib/pausable-recording.ts` is a pure clock plus a controller wrapping `MediaRecorder.pause()`/`resume()`.
- **Hook and UI:** `hooks/use-screen-capture.ts` exposes `isPaused`, `pauseRecording`, `resumeRecording` and `getDurationMs`. A paused UI appears in `components/recording-step.tsx` and the popup (status hooks, `capture-context.ts`).
- **Hotkey:** the command `toggle-pause-recording` has no `suggested_key` (`wxt.config.ts`, `recorder-hotkey-commands.ts`).
- **Billing:** `durationMs` now means playable length. `packages/billing/src/service/entitlements/video-duration.ts` (`evaluateVideoDuration`) is used by `packages/bug-reports/src/lib/entitlements.ts`. It rejects NaN, Infinity, negative and over-24h values. Previously a `NaN` duration passed plan limits.

## Acceptance criteria (#20)
- **Met in tests:** the paused UI, start/pause/resume/stop, 2000 cycles with gapless chunks, playable-length duration, billing with entitlement tests, and the hotkey without a default key.
- **Not verified:** that the WebM actually plays after many pauses needs a real browser.

## Round 2: fold in (Owner: feature/pause-resume-recording)
- **r2/ext a1bcd68** `test(extension): model-based test for the pausable recording controller` (`test/pausable-recording-model.test.ts`, fast-check with 500 runs and a seed; no bugs found). It adds fast-check to apps/extension/package.json + bun.lock. **Strip the unrelated bun.lock version-line change** (0.2.0→0.3.0) that it dragged in; keep only the fast-check lines.
- **r2/ext 461e704** `app(fix): stop the capture stream when recording fails to start`. If `new MediaRecorder` or `controller.start` threw, the tab stream stayed shared. The catch now disposes and stops the tracks (`test/screen-capture-leaks.test.tsx`).
- **r2/ingest c39277b** `test(billing): kill surviving entitlement mutants`. Stryker: video-duration.ts went from 94.3% to 98.1%; overall from 80.4% to 86.6%.
- **How to fold in:**
  1. `git switch feature/pause-resume-recording` in a clean worktree.
  2. `git cherry-pick a1bcd68 461e704 c39277b`, fixing bun.lock as above.
  3. `git reset --soft 0fab60c`, then `git commit -C fc23ce3`, plus one sentence.
  4. Tell crikket-8f the new SHA. Its #21 trim-recording and #22 markers sit on this.

## Reported, not fixed (product decisions; see r2__ingest.md)
- **Length is unverified:** the server never probes the media, so a modified client can under-report its length.
- **Entitlements only at create:** they are checked at upload-session create, not at finalize.
- **No upload byte cap:** presigned PUTs have none, and finalize trusts the client-reported sizes.
- **Recommended mitigation:**
  - add a per-plan byte cap, checked at finalize with a HEAD on the stored object;
  - presign the PUT with a fixed ContentLength;
  - re-run the entitlement check at finalize.

## Overlap with #24
`hooks/use-screen-capture.ts`: take this branch's file and add the `recordCaptureSuccess("video")` import and call in `stopRecording`. Full resolution is in feature__diagnostics-page.md.

## Needs a real browser
- a playable WebM after multiple pauses, with correct seeking;
- the tab-capture indicator while paused, and released on stop or close;
- the key binding in chrome://extensions/shortcuts;
- whether `dataavailable` fires on `pause()`.

## Suggested skills
- mattpocock-skills:tdd
- mattpocock-skills:resolving-merge-conflicts
- mattpocock-skills:code-review
