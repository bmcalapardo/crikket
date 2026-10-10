# Handoff: feature/screenshot-draft-recovery (#18, "Recover a screenshot draft after closing the extension")

## State
- **Branch:** `feature/screenshot-draft-recovery`, local and origin both at **23f5f99**. It is one commit on local `v030-int` (fd2896d), and the hook passed (269 extension tests).
- **Worktree:** `C:/Users/Brandon/Documents/Work/Code/crikket-i18`, clean (EOL-only noise).
- **Base:** local `v030-int`. It must be rebuilt as a single commit on `prerelease/v0.3.0` once that exists.
- **Spec:** `gh issue view 18`; detail in `git show 23f5f99` ("Hardening:" paragraph).

## Acceptance criteria
Verified against fake-indexeddb in unit tests. The badge, popup list and recovery flow have not been run in a real extension.
- **IndexedDB persistence: done.** `apps/extension/lib/draft-store.ts` persists form fields, annotation history, Blobs, context and an `upload` slot.
- **Base64-in-chrome.storage handoff retired: done.** The popup writes a Blob Draft and the recorder loads `?draftId=` (`use-popup-capture.ts`, `use-recorder-init.ts`). `unlimitedStorage` is not needed.
- **Recovery with annotations intact: done at store level.** There is a 250 ms autosave in recorder `App.tsx`, and the draft is deleted on submit or cancel.
- **24h expiry: done.** `BUG_REPORT_UPLOAD_SESSION_TTL_MS` moved to `packages/shared/src/constants/bug-report.ts`, and the `shared` exports point at `./src`, so it is Vercel-safe. A clean server build without dist was NOT run.
- **Badge: done.** `lib/draft-badge.ts`, plus a 30-minute `chrome.alarms` sweep.
- **Popup list: done.** `DraftList`.
- **Whitelist test: done.** `test/draft-store.test.ts` uses `DRAFT_PERSISTED_FIELDS`.

## Tests and hardening
- **Test files:** `test/draft-store.test.ts` and `test/draft-store-hardening.test.ts`.
- **Hardening fixes:**
  - `store.update()` writes only if the row still exists, so autosave can't resurrect a deleted draft.
  - `isUsableDraft` filters and deletes corrupt or future rows.
  - A NaN or missing `createdAt` now counts as expired.
  - A failed open is retried, and `onversionchange` closes the connection.
  - The alarm is created only if missing.
- **Stress:** 120 drafts with 256 KB blobs, and 1500 rapid updates. Races covered: a delete versus 20 in-flight updates, and two writers.
- **Research gap:** none was done; it came from memory. Verify against MDN IDBFactory.open, versionchange and QuotaExceededError, and developer.chrome.com `chrome.alarms` and the service-worker lifecycle.

## Open decisions and next steps
1. **User decision:** keep the new `alarms` permission? The agent says it's justified: without it the badge only refreshes when the background wakes or the popup opens.
2. **Not fixed:**
   - An edit within 250 ms of closing the tab is lost; flush on `pagehide`.
   - A quota error on save is only logged, with no warning to the tester.
   - Two tabs on one draft: last write wins, with no revision guard.
   - Concurrent badge syncs can show a stale count.
   - There is no `createdAt` index (adding one needs a DB version bump).
   - Firefox and private-mode IndexedDB are untested.
3. **Quota test:** `test/debugger-session-quota.test.ts` still uses `pendingScreenshot` as a stand-in large write; rename it for clarity.
4. **NEXT:** #19 (retry failed upload), stacked as one commit on this branch. Use the draft's `upload` slot (`bugReportId` plus `captureUploadTarget`, kept stable) so a retry re-finalizes the same report.
- **Overlaps:**
  - #17 `feature/full-page-capture` still writes the old `pendingScreenshot` handoff. Whichever lands second must move #17 onto this draft store.
  - crikket-ec's #48 (`feature/fix-extension-session-origin`) and `feature/extension-rpc-errors` touch `recorder-submit.ts` and `orpc.ts`, which #19 will touch. Expect a rebase after crikket-ec's round-2 amends.

## Suggested skills
- `mattpocock-skills:research`: IndexedDB and alarms primary sources.
- `mattpocock-skills:tdd`: #19.
- `mattpocock-skills:resolving-merge-conflicts`: the #17 integration and rebase.
