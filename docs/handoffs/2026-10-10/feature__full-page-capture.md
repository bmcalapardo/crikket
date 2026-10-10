# Handoff: feature/full-page-capture (#17, "Capture a whole scrollable page")

## State
- **Branch:** `feature/full-page-capture`, local and origin both at **1041a93**. It is one commit on local `v030-int` (fd2896d), and the hook passed.
- **Worktree:** `C:/Users/Brandon/Documents/Work/Code/crikket-i17`, clean (EOL-only noise).
- **Base:** local `v030-int`. It must be rebuilt as a single commit on `prerelease/v0.3.0` once that exists (see `README-crikket-8f-plan.md`).
- **Spec:** `gh issue view 17`; full detail in `git show 1041a93` (the body has a "Hardening:" paragraph).

## Acceptance criteria
Verified by unit tests with injected fake chrome deps; nothing has been run in a real browser.
- **Full-page option producing one image: done.** "Capture Full Page" is in `apps/extension/components/popup-capture-actions.tsx`, and the logic is in `lib/full-page-capture.ts` and `lib/full-page-plan.ts`.
- **Same crop and annotate stage: done.** It is stored as `pendingScreenshot` and opens the recorder with `captureType=screenshot`.
- **Rate limit: done in unit tests.** Slices are paced 600 ms apart, and a `MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND` error is retried 6 times.
- **Limitations documented: done.** See `apps/docs/content/docs/extension/index.mdx`, "Full-Page Screenshots".
- **Viewport capture unchanged: done.** Checked by code reading.

## Tests and hardening
- **Test files:** `test/full-page-plan.test.ts` and `test/full-page-capture.test.ts`.
- **Hardening fixes:**
  - It now aborts if the tab navigates or closes mid-capture (URL check per slice).
  - Truncation is surfaced via a `notice=truncated` URL parameter, shown in the App banner. That banner is error-styled, so a neutral style is better.
  - Encoding uses a PNG, then JPEG 0.9/0.7/0.5/0.3 budget ladder (`encodeWithinBudget`).
  - chrome://, the Web Store and the PDF viewer give a friendly error. This depends on matching Chrome's error text and hasn't been triggered for real.
  - A non-image result is rejected.
- **Fuzz:** 2,000 seeded pages run through `planFullPageCapture`.
- **Research gap:** the hardening agent's "research" came from memory, not fetched sources. Redo it against developer.chrome.com `tabs.captureVisibleTab` and `storage` quotas.

## Known gaps and next steps
1. **Popup closing:** the capture runs in the popup, so closing it aborts the capture. Move the slice and stitch loop into the background service worker, using OffscreenCanvas and createImageBitmap.
2. **Draft store conflict with #18:** #18 (`feature/screenshot-draft-recovery`) retires the `pendingScreenshot` chrome.storage handoff this branch uses. Whichever lands second must switch #17 to #18's draft store (`lib/draft-store.ts`, recorder `?draftId=`). It will then no longer need the JPEG budget ladder.
3. **Not handled:** the 250 ms settle is a guess, nested scroll containers and horizontal overflow aren't stitched, infinite-scroll growth is ignored, and browser zoom is unexamined.
4. **Real-browser check:** do one on the qa-fixtures app (#34) when the machine is free.
- **Overlaps with crikket-ec branches:** low. It touches popup and recorder init, which #52 and #48 also touch.

## Suggested skills
- `mattpocock-skills:research`: Chrome capture and storage quotas.
- `mattpocock-skills:tdd`: the service-worker move.
- `mattpocock-skills:resolving-merge-conflicts`: the #18 integration.
- `run`: a real-browser check.
