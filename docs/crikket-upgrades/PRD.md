# Crikket Bug Tester Upgrade PRD

## Document purpose

This document is the implementation specification for an AI coding agent working in `bmcalapardo/crikket`.

The agent should use Matt Pocock's `skills` workflow where available, especially:

- `/setup-matt-pocock-skills` once for repository configuration if the repo is not configured.
- `/tdd` for behavior-first, red → green → refactor development.
- `/implement` for execution against this PRD.
- `/code-review` before considering each feature slice complete.

**Deferred.** These slash commands do not exist in this repository, which has its own `.agents/skills/` (including `tdd` and `code-review`), `.cursor/skills/openspec-*`, and an `AGENTS.md` pointing at GitHub Issues. The maintainer is installing an optimised workflow separately. Until then, follow the intent — inspect context, agree seams, TDD, implement, review — using the repo's existing skills rather than installing a parallel set.

The current Matt Pocock skills recommend agreeing on public test seams before writing tests, using vertical slices rather than bulk test writing, running typechecks and focused tests regularly, and doing review after implementation rather than mixing refactoring into the TDD loop. See the referenced skills in the repository: https://github.com/mattpocock/skills

## Repository context

Repository: `bmcalapardo/crikket`
Default branch: `master`

Relevant current architecture observed on 2026-08-25:

- `apps/extension` is the browser extension application.
- Extension framework is WXT + React + TypeScript.
- The extension currently supports screenshot and video capture.
- The recorder has a dedicated review/submit stage.
- The debugger pipeline already captures actions, console/log data, and network request information, by instrumenting the page (patched `fetch`/XHR) rather than by attaching `chrome.debugger`.
- Capture context and device information are already included in submissions.
- The extension has keyboard shortcuts for starting video, starting screenshot capture, and stopping video.
- The extension package currently exposes Chromium and Firefox build/zip scripts.
- GitHub Actions currently publish Docker images and packages, but there is no dedicated tester-oriented extension release workflow.
- The current recorder review UI shows a media preview plus title, description, priority, visibility, captured debugger counts, warnings, and submit/cancel actions.

These existing capabilities must be reused wherever practical. Do not create parallel capture/debugging systems when existing services and seams can be extended.

## Product goal

Make Crikket significantly better for hands-on bug testers by improving the full workflow:

`Capture → Edit/Annotate → Review → Submit → Diagnose → Distribute/Update`

A successful implementation should make it easier for a tester to:

1. capture the exact part of the UI relevant to a bug;
2. explain the bug visually;
3. provide structured reproduction context;
4. survive transient upload/network problems without losing evidence;
5. diagnose when Crikket itself is broken;
6. install and update tester builds without building from source manually;
7. provide developers with enough environment/version information to reproduce issues.

## Non-goals

Do not turn Crikket into a general-purpose image editor, video editor, or observability platform.

Do not implement AI functionality in this release. AI-generated bug summaries and reproduction summaries are future work.

Do not redesign the entire web app or backend UI unless a change is required to support the extension workflow.

Do not weaken privacy or security to make capture easier.

Do not add speculative abstractions or framework migrations without a concrete requirement from this PRD.

# Locked decisions

These were settled by grilling this PRD against the codebase on 2026-08-25. Where a decision contradicts wording further down this document, the decision wins. Domain vocabulary lives in the root `CONTEXT.md`.

## Corrections to this document's stated facts

- The debugger pipeline works by **page instrumentation** (patched `fetch`/XHR in `capture-core`), not `chrome.debugger`. There is no `debugger` permission in the manifest, so CDP APIs such as `captureBeyondViewport` are unavailable.
- The live screenshot path is `chrome.tabs.captureVisibleTab` from the popup. The `getDisplayMedia` branch in `use-screen-capture.ts` is unreachable dead code.
- Existing hotkeys are manifest `commands`: `Alt+Shift+R` (start video), `Alt+Shift+C` (start screenshot), `Alt+Shift+S` (stop video). Chrome permits at most four `suggested_key` bindings in total.
- Report `metadata` and `deviceInfo` are validated by closed Zod schemas that silently strip unknown keys. New fields do not reach the database until those schemas are extended.
- There is no `test` task in `turbo.json`, so `turbo run test` is currently a no-op.
- `packages/billing`, `packages/bug-reports`, `packages/capture-core` and `sdks/capture` already have `bun test test` scripts. Only `apps/server` lacks one, leaving 2 unreachable test files rather than 13.
- The redaction filter lives in `packages/capture-core/src/debugger/engine/page/utils.ts`, not under the extension. The normalization to share it with is `packages/capture-core/src/debugger/normalize.ts`; `sdks/capture` has no `normalize.ts`, its equivalents are in `sdks/capture/src/utils.ts`.
- The server already answers `GET /` with `"OK"`. The `/health` endpoint in W4.3 is additive, not a rename.

## Process

1. This PRD is the canonical spec at `docs/crikket-upgrades/PRD.md`; plans go in `plans/`, developer-supplied context in `resources/`.
2. The work is tracked as 28 tracer-bullet vertical slices under the parent tracking issue [#8 Crikket Tester Upgrades](https://github.com/bmcalapardo/crikket/issues/8). Slices do not map one-to-one onto the numbered W-items: some W-items split across several slices (W1.2 spans four), and some slices merge parts of several W-items so that each one cuts a complete path through capture, submission, storage and the web report view.
3. **W0.1 is deferred.** The maintainer will install an optimised skills/workflow setup separately. Do not run a foreign setup skill as part of this PRD.

## Wave 0

4. W0.3 additionally adds the turbo `test` task, a `test` script for `apps/server` (2 currently-unreachable test files), and a DOM environment for extension component tests.
5. Playwright is introduced for extension E2E only. Bun test remains the unit/component runner.

## Wave 1

6. Edited images are lossless PNG at native pixel dimensions, never downscaled.
7. The annotation editor is hand-rolled on native Canvas 2D. No new drawing dependency.
8. Annotations are append-only with click-to-delete hit-testing. No selection handles, move or resize.
9. Opacity is in scope.
10. Obscuring (blur/pixelate) is baked destructively into the submitted image.
11. Performance budget: source images up to 3840×2160, with no draw interaction blocking the main thread for more than 100ms.
12. Crop maps CSS-pixel selections onto `captureVisibleTab`'s device-pixel output using the target tab's `devicePixelRatio`.
13. Full-page capture ships via scroll-and-stitch over `captureVisibleTab`. Documented limitations: Chromium rate-limits that call to roughly 2/sec, sticky headers duplicate across slices, and lazy-loaded content may not settle.
14. **W1.3 region capture is cut.** Capture-then-crop is the single path.
15. The unreachable `getDisplayMedia` screenshot branch is deleted as part of W1.1.

## Wave 2

16. Report duration is media time, excluding paused stretches. `durationMs` is redefined accordingly, so billing entitlements measure playable length rather than wall-clock.
17. `MediaRecorder` construction must be guarded with `isTypeSupported`, and trim must read the actual blob type rather than assuming VP9.
18. Trim snaps to keyframe boundaries with no re-encode, and the UI shows the real cut points rather than implying frame accuracy.
19. Markers store an offset from recording start **and** a wall-clock instant. Offsets are rebased when trim moves the start point; markers falling outside the trimmed range are dropped with a visible warning before submission.
20. `Alt+Shift+M` marks the bug moment, taking the fourth and final `suggested_key` slot. Pause/resume ships as a command with no default binding.
21. Expected behavior, actual behavior and reproduction steps become first-class columns, 3000 characters each.
22. Drafts persist form fields, the annotation model and the screenshot Blob in IndexedDB. The base64-in-`chrome.storage.local` handoff is retired. `unlimitedStorage` is not required.
23. Video drafts are not persisted. On recovery the typed fields return alongside an explicit "recording lost — re-record to submit" state, and an unload warning fires while a recording or unsubmitted video draft is live.
24. An upload failure keeps the video blob in memory and retryable for as long as the recorder page stays open.
25. Retry is manual only. There are no automatic retries.
26. Draft expiry is 24h, aligned to `BUG_REPORT_UPLOAD_SESSION_TTL_MS`. Expired drafts are removed silently.
27. Retry reuses the persisted `bugReportId` and capture upload target and re-finalizes the same report. It never mints a second report row.
28. Pending drafts surface as an extension icon badge plus a resumable, deletable list in the popup.
29. **W2.6 multiple attachments is deferred.** Clipboard paste and drag-drop remain in scope as ways to supply the single capture.

## Wave 3

30. Environment data goes in a new versioned `environment` jsonb column carrying an explicit `schemaVersion`. `deviceInfo` is left alone, being a wire contract shared with `sdks/capture`.
31. Metadata schemas become `.strict()`, so an unrecognised field is a loud validation error rather than a silent drop.
32. Minimal web rendering is in scope and required for every new field: expected/actual in the report body, environment in the sidebar, markers as a timestamp list, tester/channel as small metadata. No timeline scrubber, no redesign.
33. Build identity comes from a build-time define (`VITE_BUILD_SHA`) populated from `github.sha`, falling back to the literal `"local"` for developer builds.
34. Page URL and title are governed by a dedicated setting, defaulting to on.
35. Redaction hardening, all four parts: the strong filter in `packages/capture-core/src/debugger/engine/page/utils.ts` is shared with `packages/capture-core/src/debugger/normalize.ts` (which closes the same hole in `sdks/capture`); a server-side redaction pass runs at ingestion; bodies are JSON-parsed regardless of `Content-Type`; and sensitive values are masked rather than dropped.
36. Domain exclusion is a per-tester local list in `chrome.storage.local`. Exact hostname matches by default; `*.example.com` opts into subdomains. It gates both capture start **and** page-instrumentation injection. "admins" and "restricted" are struck from W3.3.
37. Diagnostics is a standalone extension page opened from the popup. Capability checks are API-presence checks plus a "last capture succeeded at" timestamp, never live probes, because capture requires a user gesture.
38. Diagnostics keeps a redacted ring buffer of the ~20 most recent errors, fed by extending `reportNonFatalError`.
39. Diagnostics-export assertions target `chrome.storage` dumps and echoed API responses, not auth tokens — better-auth cookies are HttpOnly and unreadable from the extension.
40. The Tester label is entered on the diagnostics page, capped at 40 characters of `[\w .-]`, and is **omitted from public reports**.

## Wave 4

41. Channel is explicit at build time and a build without one fails. An implicit `dev` channel applies only when `import.meta.env.DEV`.
42. Each channel has its own extension identity — name suffix, per-channel gecko ID, distinguishable icon — installable side by side.
43. Firefox artifacts are signed via AMO unlisted self-distribution, with a per-channel update manifest so testers auto-update.
44. Chromium alpha ships as a load-unpacked zip. Unlisted Chrome Web Store is the later path for beta/stable.
45. Because load-unpacked has no auto-update, the extension compares its build against the latest published release for its channel and shows an update-available notice in the popup and diagnostics.
46. Release tags are `extension-v*`. `apps/extension/package.json` is the version source of truth, and the workflow fails if the tag disagrees with it.
47. Extension versioning stays outside changesets.
48. Release verification hits a new `GET /health` returning status plus the deployed version/commit.
49. The release workflow runs the test suite; a failing suite blocks publication.
50. QA fixtures live in a new private `apps/qa-fixtures` app, deployable per channel.
51. E2E loads the unpacked build output via a Playwright persistent context. Screenshot E2E is automatable because `captureVisibleTab` needs no picker; video E2E is Chromium-only; Firefox release-artifact E2E is limited by signing.

## Cross-cutting

52. Failure actions are `Retry` / `Cancel`. "Save draft" is removed, since persistence is automatic.
53. Toolbar, dialogs and editor chrome are fully keyboard-operable. The drawing canvas is an explicit documented exception: keyboard-driven freehand drawing is not a realistic deliverable.

# Target release scope

The work is divided into four implementation waves. The agent should work in small vertical slices and keep each slice independently testable.

## Wave 0 — Test and release foundations

### W0.1 Repository/agent setup

If Matt Pocock's engineering skills are installed but repository config is missing, run `/setup-matt-pocock-skills` before implementation. Respect the repo's existing `CLAUDE.md`, `AGENTS.md`, `CONTEXT.md`, ADRs, and `docs/agents/*` configuration where present.

If the skills are not installed, do not block implementation solely on that. Continue using the intent of the workflow: inspect context, define seams, TDD, implement, review.

### W0.2 Establish test seams

Before writing tests, inspect the existing architecture and identify public seams for:

- screenshot capture;
- annotation/editing transformation;
- form submission;
- upload/retry behavior;
- debugger data submission;
- extension diagnostics;
- extension build/package generation.

Prefer public interfaces over implementation internals.

### W0.3 Baseline CI quality gates

Add or improve CI so a pull request can automatically run at minimum:

- dependency installation;
- type checking;
- extension build;
- focused tests;
- full automated test suite where available.

Do not remove existing CI behavior.

Acceptance criteria:

- A PR that breaks TypeScript or the extension build fails CI.
- CI outputs enough information for an agent/human to distinguish code failure from packaging failure.
- Existing package and Docker workflows continue to work.

# Wave 1 — Screenshot editing and capture improvements

## W1.1 Screenshot crop

### User story

As a bug tester, I want to crop a screenshot before submitting it so that I can focus developers on the relevant area.

### Requirements

- Add an edit step after screenshot capture and before final submission.
- Allow interactive rectangular crop.
- Preserve the crop at the correct pixel dimensions despite browser/device-pixel-ratio scaling.
- Allow canceling crop without losing the original capture.
- Allow resetting crop to the original image.
- Preserve image quality reasonably; do not unexpectedly downscale standard captures.
- The edited result, not the original, is submitted unless the tester explicitly resets the edit.

### Acceptance tests

- User captures a screenshot, crops a subregion, submits, and the uploaded artifact matches the crop.
- User opens crop, cancels, and the original image is unchanged.
- User crops then resets and gets the original image back.
- High-DPR screenshots do not produce a crop with incorrect coordinates.
- Crop cannot produce invalid zero-width/zero-height output.

## W1.2 Annotation editor

Create a lightweight screenshot annotation editor, conceptually similar to a focused MS Paint/Snagit bug-annotation tool.

### Required tools for this release

- freehand pen;
- line;
- arrow;
- rectangle;
- ellipse/circle;
- text;
- highlight;
- blur or pixelate/redaction;
- eraser: click an existing annotation to delete it (no move, resize, or restyle);
- undo;
- redo;
- stroke size;
- color;
- opacity.

### UX requirements

- Annotation editing must work with mouse input.
- Keyboard shortcuts must not conflict with existing extension shortcuts.
- The user must be able to finish editing and return to review.
- The user must be able to cancel edits and restore the original capture.
- The editor should fit naturally into the existing recorder flow rather than opening an unrelated browser page when avoidable.
- Do not introduce a canvas or drawing dependency. The editor is hand-rolled on native Canvas 2D, matching the existing screenshot pipeline.

### Important implementation guidance

Treat the editor as a transformation pipeline over an image rather than as an unrelated drawing app.

Prefer a serializable editor state so that undo/redo and tests can exercise behavior independently of rendering details.

Suggested conceptual model:

`source image -> normalized annotation model -> rendered output blob`

The exact library and internal representation are implementation decisions for the agent after inspecting the codebase.

### Acceptance tests

- Pen stroke appears on submitted screenshot.
- Arrow points from start to end and remains visible in the final image.
- Rectangle and ellipse maintain expected geometry.
- Text is visible in submitted image.
- Highlight composites with alpha: sampled pixels inside the highlight shift hue toward the highlight color while remaining distinguishable from each other, proving the underlying content still reads through.
- Obscuring reduces per-block pixel variance inside the selected region below a fixed threshold, and leaves variance outside the region unchanged.
- Undo removes the most recent edit.
- Redo restores the undone edit.
- Cancel restores the original capture.
- With a 3840×2160 source image, no single draw interaction blocks the main thread for more than 100ms.

## W1.3 Region capture — CUT

Cut from this release. Once full-page capture is a scroll-and-stitch (W1.4), pre-selecting a region only avoids stitching when the target already fits in one viewport — which capture-then-crop already achieves. Capture-then-crop is the single path.

## W1.4 Multiple screenshot sources

Two sources are in scope, both committed:

- current viewport screenshot, via `chrome.tabs.captureVisibleTab`;
- full-page screenshot, via scroll-and-stitch over repeated `captureVisibleTab` calls.

Full-page capture must document its known limitations rather than paper over them: Chromium rate-limits `captureVisibleTab` to roughly two calls per second, sticky headers duplicate across slices, and lazy-loaded content may not settle before a slice is taken.

CDP `captureBeyondViewport` is not available — the extension has no `debugger` permission, and adding one would surface a persistent "started debugging this browser" banner and conflict with DevTools.

# Wave 2 — Video and submission reliability

## W2.1 Video pause/resume

Add pause/resume to the recording workflow.

Requirements:

- Clear paused state in UI.
- Elapsed recording time excludes paused duration. `durationMs` is redefined to mean playable media length, which also becomes what billing entitlements measure.
- Final upload must remain playable.
- Pause/resume must not corrupt the media blob.

Acceptance tests:

- Start → pause → resume → stop produces a playable video.
- Multiple pause/resume cycles work.
- Duration metadata is consistent with the product definition of duration.

## W2.2 Video trimming

At minimum support trimming the beginning and end of a recording if technically practical with the current browser APIs.

If true in-browser re-encoding is unreliable, implement a smaller scoped version first and document the constraint rather than shipping a fragile transcoding layer.

Acceptance tests:

- Trimmed output starts and ends at the nearest keyframe boundary to the selected points, within one GOP length. The tolerance is stated in keyframe terms, not in seconds.
- Original capture remains restorable until submission.
- Canceling trim leaves the original intact.

## W2.3 Timeline markers

Allow the tester to mark the current point in a recording as the moment the bug occurred.

Requirements:

- Marker can be created while recording.
- Marker data is retained after recording.
- Review UI displays markers.
- Submission includes marker timestamps in structured metadata.

Suggested UX:

`Mark bug moment` button and a keyboard shortcut that does not collide with current shortcuts.

Acceptance test:

- Tester adds two markers during recording and both survive submission with monotonic timestamps.

## W2.4 Expected vs actual fields

Extend the review form with:

- Expected behavior;
- Actual behavior;
- Optional reproduction steps.

Keep existing title, description, priority, and visibility fields.

Validation should remain client-side and server-safe.

Acceptance tests:

- Fields are saved and submitted.
- Optional fields can remain empty.
- Maximum lengths are enforced consistently.

## W2.5 Upload retry and local draft safety

Implement resilient submission behavior.

Requirements:

- A failed upload must not silently discard the captured media.
- Show a clear failure reason/state.
- Offer retry without requiring a new capture when possible.
- Persist enough local draft state to survive accidental popup/recorder closure where browser storage limits permit.
- If offline or temporarily disconnected, keep the capture available for a retry instead of treating it as permanently lost.

Do not persist secrets or sensitive captured content beyond what is necessary to support recovery.

Acceptance tests:

- Forced upload failure leaves the capture recoverable.
- Retry succeeds after the server recovers.
- Closing/reopening the relevant extension UI can recover a draft when the platform allows it.
- Persisted draft storage contains only keys on an explicit whitelist. Asserted as a whitelist over persisted keys, not as an absence-of-plaintext claim: a draft necessarily holds a screenshot of the page, and both IndexedDB and `chrome.storage.local` are plaintext on disk.

## W2.6 Image input paths (multiple attachments deferred)

**Multiple attachments are deferred.** A report stores exactly one capture at a fixed storage key today; supporting several would need a new `bug_report_attachment` relation plus viewer work, which is out of scope for this release.

Still in scope, as alternative ways to supply that single capture — useful because OS screenshot tools can grab things the extension cannot, such as native dialogs or other applications:

- clipboard paste of an image;
- drag/drop image;
- file picker.

Acceptance tests:

- Pasting an image supplies the capture rather than navigating the UI.
- A dropped or picked image replaces the current capture and is the artifact submitted.
- Supplying an image this way still produces the same report metadata as an in-extension capture, minus capture-specific fields.

# Wave 3 — Diagnostics, privacy, and developer context

## W3.1 Automatic report environment metadata

Every submitted report should include structured version/environment data sufficient to answer "what was the tester running?".

Include where available:

- Crikket extension version;
- build/commit identifier for tester builds;
- browser name/version;
- operating system;
- viewport size;
- device pixel ratio;
- capture type;
- capture duration;
- current URL/page title subject to privacy controls.

Do not expose secrets.

Acceptance test:

- A test report contains a stable environment object with known fields.
- Version data matches the running extension build.

## W3.2 Sensitive-data redaction

Strengthen privacy around debugger and network data.

At minimum, redact known secret-bearing fields such as:

- Authorization headers;
- cookies;
- bearer tokens;
- API keys/secrets where identifiable;
- passwords in obvious form payloads.

Avoid presenting redaction as perfect protection. The system should use conservative defaults.

Acceptance tests:

- Synthetic Authorization header is redacted before submission.
- Synthetic cookie is redacted.
- Synthetic password field is not submitted in plain text.
- Non-sensitive request data remains useful.

## W3.3 Domain exclusion list

Allow a tester to configure, in their own extension, domains where capture is disabled.

Matching is by hostname: a plain entry matches that exact host, and `*.example.com` opts into subdomains. Protocol and port are not part of matching.

Exclusion must gate **both** capture start and page-instrumentation injection. Blocking only capture would still harvest console and network data from an excluded domain, since instrumentation is injected on `<all_urls>`.

Acceptance tests:

- On an excluded domain, capture cannot start and an explicit blocked state is shown.
- On an excluded domain, no console or network data is collected or submitted.
- Configuration persists.
- Exclusion matching is deterministic and documented, including the subdomain wildcard.

## W3.4 Extension diagnostics page

Add a diagnostics screen available from the extension.

It should report checks such as:

- extension version;
- build identifier;
- API connectivity;
- authentication state;
- screenshot availability;
- recording availability;
- debugger capture availability;
- storage availability;
- last error.

Add a button to copy/export a redacted diagnostics bundle.

Acceptance tests:

- A healthy installation reports every named check ID with a `pass` status. Checks are asserted by ID and status rather than by being "actionable".
- Simulated API failure produces an understandable failing check.
- Exported diagnostics do not contain auth tokens or cookies.

## W3.5 Tester ID / release channel metadata

Support optional tester/build-channel metadata such as:

- tester identifier;
- alpha/beta/stable channel;
- extension version;
- commit SHA/build ID.

Do not hard-code a specific person's identity into the extension.

# Wave 4 — Tester distribution and deployment

## W4.1 Dedicated extension release workflow

Create a GitHub Actions workflow specifically for tester-ready browser extension builds.

The workflow should:

1. trigger on an explicit extension release tag and allow manual dispatch;
2. install dependencies with the repo's supported package manager;
3. typecheck the extension;
4. build Chromium extension;
5. package Chromium artifact;
6. build Firefox extension;
7. package Firefox artifact;
8. attach artifacts to a GitHub Release or equivalent tester-visible release location;
9. record version/channel/build metadata.

Do not alter existing package publishing semantics unnecessarily.

Recommended tag format:

- `extension-vX.Y.Z-alpha.N`
- `extension-vX.Y.Z-beta.N`
- `extension-vX.Y.Z`

This prefix is fixed. Do not adapt it to a bare `vX.Y.Z` convention — that pattern already triggers `docker-publish.yml`. `apps/extension/package.json` is the version source of truth, and the workflow must fail if the pushed tag disagrees with it rather than rewriting the manifest.

Acceptance tests:

- Manual workflow dispatch produces both browser artifacts.
- A valid release tag produces artifacts with deterministic names.
- Build failure prevents publication of incomplete artifacts.
- Release notes identify supported browsers and version/channel.

## W4.2 Release channels

Support these conceptual channels:

- Alpha — active QA/internal testers;
- Beta — pilot users;
- Stable — production users.

The implementation must keep channel configuration separate from production configuration so alpha testers cannot accidentally target production unless explicitly configured.

Where possible, use environment variables or build-time configuration rather than hard-coded URLs.

## W4.3 Automated release verification

Add smoke checks after building/publishing.

At minimum verify:

- extension package exists;
- manifest is valid;
- expected commands/permissions exist;
- extension build can be loaded in automated browser tests where practical;
- backend health endpoint is reachable for the configured test environment.

## W4.4 Extension E2E tests

Add browser-level automated tests around the most important user journey.

Preferred flow:

`install/load extension → open test page → capture screenshot → annotate → submit → verify report`

Also test the critical video path where infrastructure supports it.

Use stable test seams. Avoid tests that assert implementation-specific DOM structure when user-visible behavior is sufficient.

## W4.5 QA smoke-test site

Add or document a dedicated test page/environment containing deterministic scenarios for:

- working UI;
- intentional console error;
- intentional network 500;
- slow request;
- broken image;
- form failure;
- long page;
- sensitive data fixture.

This should make it easy for both human testers and automated E2E tests to verify Crikket against known problems.

# Cross-cutting UX requirements

## Error handling

Every failure state must be actionable.

Bad:

`Upload failed`

Better:

`Upload failed because the server is unavailable.`

Actions:

`Retry` / `Cancel`

There is no explicit "Save draft" action — drafts persist automatically, and offering to save something already saved just makes a tester wonder what happens if they decline.

Do not hide errors behind console logs only.

## Accessibility

All new controls must have:

- visible/accessible labels;
- keyboard operation;
- focus states;
- sufficient contrast;
- tooltips or accessible names for icon-only controls.

The annotation editor's drawing canvas is the one documented exception to keyboard operation: its toolbar, dialogs and surrounding chrome must be fully keyboard-operable, but keyboard-driven freehand drawing is not a realistic deliverable and is explicitly out of scope.

## Performance

Editing and capture should remain responsive for normal tester workloads.

Avoid unnecessary re-encoding, cloning, or base64 conversion of large media blobs.

Prefer `Blob`, object URLs, typed data, and streaming/upload primitives already used by the repository when possible.

## Privacy

Sensitive data handling is a product requirement, not optional polish.

Do not add telemetry that captures page content, credentials, or arbitrary request payloads without a deliberate, documented design decision.

# Testing strategy

Follow TDD at agreed public seams.

Each vertical slice should follow:

1. state the behavior/seam under test;
2. write one failing test;
3. implement the smallest change that makes it pass;
4. run the focused test;
5. repeat;
6. refactor only in review stage;
7. run the broader test suite after the feature slice.

Required testing layers:

### Unit tests

Use for:

- crop coordinate transforms;
- annotation model operations;
- undo/redo;
- redaction logic;
- metadata normalization;
- release naming/version parsing;
- domain exclusion matching.

### Component tests

Use for:

- editor interactions;
- review form fields;
- retry states;
- diagnostics state rendering.

### Integration tests

Use for:

- capture → transform → submit boundaries;
- upload failure/retry;
- debugger payload redaction;
- report metadata assembly.

### E2E tests

Use for the highest-value tester journey, especially:

- extension loads;
- screenshot capture;
- annotation;
- submission;
- report availability.

### CI verification

At completion of each major wave:

- typecheck passes;
- focused tests pass;
- extension build passes.

At final completion:

- full test suite passes;
- extension packaging passes;
- E2E smoke tests pass where configured;
- existing Docker/package workflows remain valid.

# Definition of done

The overall project is done when all of the following are true:

- Screenshot crop works correctly on standard and high-DPR captures.
- Annotation editor supports the required tools, opacity, click-to-delete, and undo/redo.
- Full-page capture works via scroll-and-stitch, with its rate-limit, sticky-header and lazy-content limitations documented.
- Video pause/resume is reliable, and reported duration excludes paused stretches.
- Video trimming snaps to keyframe boundaries without re-encoding, and the UI reflects the real cut points.
- Expected vs actual fields are first-class columns in the report flow and are rendered in the web report view.
- Upload failures are recoverable without forcing a new capture, and a retry never produces a duplicate report row.
- Clipboard paste and drag-drop can supply the capture. (Multiple attachments are deferred.)
- Reports carry a versioned environment object including extension version, build SHA from `VITE_BUILD_SHA`, browser, OS, viewport and device pixel ratio, and the metadata schemas reject unknown fields rather than dropping them.
- Sensitive debugger/network values are masked, on both the client and a server-side ingestion pass, independent of request content type.
- Domain exclusions work, persist, and block page instrumentation as well as capture.
- Diagnostics page reports every named check by ID and status, and exports a redacted bundle.
- Tester label and channel/version metadata reach the Report and are visible in the web report view, with the tester label omitted from public reports.
- GitHub Actions produces tester-ready Chromium zips and AMO-signed Firefox artifacts with a per-channel update manifest.
- Release artifacts are attached to an explicit `extension-v*` release/tag workflow, which fails if the tag disagrees with `apps/extension/package.json`.
- Critical screenshot capture → annotate → submit path has automated E2E coverage.
- CI runs the test suite on pull requests **and** in the release workflow, so a failing suite blocks both merge and publication.
- Code review confirms the implementation matches this PRD and the repository's documented standards.

# Recommended implementation order

Do not attempt the entire project as one unbounded change.

Implement in this order:

1. Test/release foundations, including the turbo `test` task, the currently-unreachable package test scripts, and a DOM environment for extension component tests.
2. Server-side schema work: expected/actual/repro columns, the versioned `environment` column, `.strict()` metadata schemas, and minimal web rendering for the new fields. This comes early because every later wave silently no-ops without it.
3. Screenshot crop, including deletion of the dead `getDisplayMedia` branch.
4. Annotation model + undo/redo.
5. Annotation UI tools: pen, arrow, rectangle, ellipse, text, highlight, obscuring, opacity, click-to-delete.
6. Expected vs actual/reproduction fields (extension side).
7. Upload retry/draft preservation, including the pending-draft badge and list.
8. Video pause/resume.
9. Clipboard paste + drag-drop as capture sources.
10. Environment/version metadata and build SHA plumbing.
11. Redaction hardening and domain exclusions.
12. Diagnostics page, including the error ring buffer.
13. Full-page scroll-and-stitch capture.
14. Extension release workflow.
15. Release channels, per-channel identity, artifacts, and update manifests.
16. Extension E2E smoke tests.
17. QA smoke-test environment.

# Agent operating rules

- Start by inspecting the repo, current test setup, and relevant context/ADR files.
- Reuse existing Crikket capture/debugger/upload interfaces.
- Before adding tests, identify and state the public seam being tested.
- Prefer vertical slices and small commits.
- Run focused tests frequently.
- Run typechecking frequently.
- Do not silently broaden scope.
- Do not replace working architecture with a new framework just because it is familiar.
- When a browser platform limitation prevents a requirement, document the limitation and implement the safest viable subset instead of faking support.
- Never disable existing security/privacy protections to make a test pass.
- Before completion, run the applicable code-review skill against the PRD/spec and repository standards.
- The final implementation report must include: what changed, tests run, test results, known limitations, and release/deployment changes.

# Explicit acceptance scenarios

These scenarios should exist as executable tests or documented manual QA steps, with automation preferred for deterministic behavior.

### Scenario A — Annotated screenshot

1. Start screenshot capture.
2. Crop to the bug area.
3. Draw a red arrow.
4. Add a text label.
5. Blur a sensitive area.
6. Undo and redo one change.
7. Submit.
8. Verify the stored artifact contains the crop and all final annotations but not the undone annotation.

### Scenario B — Recoverable upload failure

1. Capture screenshot.
2. Complete the report.
3. Simulate API/upload failure.
4. Verify the capture remains available.
5. Restore connectivity.
6. Retry.
7. Verify one successful report exists and the capture is not duplicated.

### Scenario C — Video recording marker

1. Start recording.
2. Trigger a deterministic test bug.
3. Mark the bug moment.
4. Stop recording.
5. Submit.
6. Verify the report contains the marker timestamp.

### Scenario D — Privacy

1. Open the QA sensitive-data fixture.
2. Generate a request containing a synthetic token and cookie.
3. Capture a report.
4. Inspect the submitted debugger payload.
5. Verify secrets are redacted while useful request metadata remains.

### Scenario E — Tester release

1. Trigger the extension release workflow with an alpha tag.
2. Verify Chrome and Firefox artifacts are produced.
3. Verify manifests are valid.
4. Verify release notes include version/channel.
5. Load the artifacts in browser automation where supported.
6. Run Scenario A against the release artifact.

# Deliverables

The agent should produce:

- implementation code;
- tests;
- E2E tests for the core flow;
- CI/release workflow changes;
- documentation for tester installation and release channels;
- a concise implementation summary;
- a list of any deferred requirements and why they were deferred.

Do not consider the work complete merely because the application compiles. The acceptance scenarios and release path are part of the feature.

## Source context

This PRD was created after reviewing the current `bmcalapardo/crikket` repository, including the extension structure, recorder implementation, review form, capture/debugger libraries, extension build configuration, and existing GitHub Actions workflows.

Relevant repository paths include:

- `apps/extension/entrypoints/recorder/App.tsx`
- `apps/extension/components/form-step.tsx`
- `apps/extension/components/popup-capture-actions.tsx`
- `apps/extension/lib/bug-report-upload.ts`
- `apps/extension/lib/capture-context.ts`
- `apps/extension/lib/recorder-submit.ts`
- `apps/extension/lib/bug-report-debugger/`
- `apps/extension/wxt.config.ts`
- `apps/extension/package.json`
- `.github/workflows/publish.yml`
- `.github/workflows/docker-publish.yml`

These paths are starting points, not hard-coded implementation locations. The agent should follow the repository's actual architecture as it exists at implementation time.
