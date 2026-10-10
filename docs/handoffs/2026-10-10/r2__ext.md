# Handoff: r2/ext (round-2 extension attack/state testing)

- **Head:** 461e704, 6 commits on r2-int 7c22896. Local; pushed to origin for reference only. Never open a PR from it; route the commits to their owners.
- **Worktree:** crikket-r2-ext. Run tests with `bun test --env-file=.env.example <file>` from apps/extension.

## Commits and routing (each failed first, then passed)
| SHA | Subject | Owner | Notes |
|---|---|---|---|
| 7b66fdf | bound the debugger content-bridge queue against page floods | new-hardening | **E1** (DoS): `lib/bug-report-debugger/content.ts` keeps the newest 1000 events. A 100k flood used to drain for seconds. Test: `test/content-bridge-flood.test.ts` |
| a1bcd68 | model-based test for the pausable recording controller | feature/pause-resume-recording | Adds fast-check. **Strip the unrelated bun.lock 0.2.0→0.3.0 version-line change.** |
| 60a02dd | model-based test for annotation history across crop changes | feature/annotation-editor | Needs fast-check (from a1bcd68). Add the devDependency on #52 separately |
| 5192f34 | show an error when Apply Crop can't render the cropped image | feature/annotation-editor | **E3**: silent no-op on a null crop |
| 95af4e8 | revoke the recorder preview object URL | new-hardening | **E2** (leak, also on master): new `hooks/use-object-url.ts`. Test: `test/object-url-leaks.test.tsx` |
| 461e704 | stop the capture stream when recording fails to start | feature/pause-resume-recording | **E4** (leak) in `hooks/use-screen-capture.ts` |

- **Routing:**
  - **Owner branches:** cherry-pick onto the owner, then squash into its single commit. For #52, which is a pushed PR, force-push with lease and update the PR body.
  - **new-hardening:** 7b66fdf and 95af4e8 go on a new 0.3.0 branch, for example feature/extension-leak-hardening, with one Changelog line under `### v0.3.0`.

## Reported only
- **Background `onMessage` has no sender check** (`engine/background/index.ts`, pre-existing, low). Privileged types (START_SESSION, GET_SESSION_SNAPSHOT, DISCARD_SESSION, MARK_RECORDING_STARTED) are accepted from any sender. A page can't reach them, because there is no `externally_connectable` and the content script only forwards `events`. Recommendation: reject privileged types when `sender.tab` is set or `sender.id !== chrome.runtime.id`.
- **Page-bridge nonce:** not warranted, because the MAIN world is untrusted and any nonce is readable there. Normalize rebuilds objects, so `__proto__` keys don't pollute.
- **Page-side queue** `engine/page/event-queue.ts` is unbounded. Cap it, and cap the per-message array (owner #50 area).
- **Request bodies** in `engine/page/network/fetch/context.ts` are fully buffered before truncation; memory only. Bodies are never consumed.
- **Manifests are fine:** Chrome MV3 has no web_accessible_resources, no externally_connectable, no eval. `activeTab`/`tabs` might be reducible (a product call). The description is still a placeholder.
- **Firefox:** the MV2 build guards `chrome.scripting`, so it likely gets no debugger instrumentation. Unverified.

## Not tested
Canvas extremes (no canvas in happy-dom), hotkeys on chrome:// or the Web Store, live crafted messages against the service worker, and Stryker.

## Suggested skills
- mattpocock-skills:resolving-merge-conflicts: the cherry-picks.
- mattpocock-skills:code-review
- security-review: the sender-check hardening.
