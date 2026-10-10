# Handoff: feature/trim-recording (#21, "Trim the start and end of a recording")

## State
- **Branch:** `feature/trim-recording`, local and origin both at **a49c872**. It is one commit on local `v030-int` (fd2896d), and the hook passed (288 extension tests).
- **Worktree:** `C:/Users/Brandon/Documents/Work/Code/crikket-i21`, clean (EOL-only noise).
- **Base:** local `v030-int`. It must be rebuilt as a single commit on `prerelease/v0.3.0` once that exists.
- **Spec:** `gh issue view 21`; detail in `git show a49c872` ("Hardening:" paragraph).

## Acceptance criteria
Verified by unit tests on synthetic EBML. The output has NOT been played or seeked in a real browser.
- **`isTypeSupported` guard: done.** `lib/recorder-mime.ts` tries vp9, then vp8, then webm, then mp4, then the default; it is used in `hooks/use-screen-capture.ts`.
- **Reads the actual blob type: done.** It uses `recorder.mimeType` with fallbacks.
- **Keyframe-snapped trim with no re-encode: done.** `lib/webm-trim.ts` is a pure EBML parser and rewriter with no external library. It rebases timecodes to 0, writes known sizes and a Duration, and splits clusters on int16 overflow.
- **UI shows the real cut points: done.** `components/trim-step.tsx`. Unsupported containers such as mp4 show "Trimming is not available…".
- **Original restorable and cancel-safe: done.** `lib/video-trim.ts` `VideoTrim` carries `source`, and `currentTrim()` rejects stale trims. The wiring is in recorder `App.tsx` and `FormStep`.
- **Tolerance in keyframe terms: done.** A cut moves by at most half the neighbouring keyframe gap.

## Tests and hardening
- **Test files:** `test/webm-trim.test.ts`, `test/trim-step.test.tsx`, `test/webm-trim-hardening.test.ts`, and the `test/webm-fixture.ts` builder.
- **Hardening fixes:**
  - `Math.min(...arr)` overflowed on long recordings; replaced with loops.
  - The DocType is capped.
  - Element sizes are clamped to the buffer, and truncated blocks are dropped.
  - A zero timecode scale is rejected.
  - Blocks for undeclared tracks are dropped.
  - NaN and Infinity cut points are handled.
  - Output goes into one pre-sized buffer, and preview object URLs are revoked.
- **Fuzz:** every truncation prefix, 3000 bit-flip and byte-stomp variants, and 500 random tails. Only `WebmTrimError` may escape.
- **Stress:** an hour-long synthetic recording (720 clusters), under a 20 s ceiling.
- **Research:** RFC 9559 (Matroska), and https://blog.addpipe.com/duration-in-webm-videos-produced-by-chrome/ (Chrome output has no Cues and no Duration; crbug 561606, 569840, 599134, 642012).

## Known gaps and next steps
1. **Real-browser playback:** do a real Chrome and Firefox check that the trimmed MediaRecorder output plays and seeks. Seeking is linear because no Cues are written; consider writing Cues.
2. **Trim limits:** only the first video track is used, and the trim is held in memory.
3. **NEXT:** #22 (bug-moment markers), stacked as one commit on this branch. Use `trimStartOffsetMs(trim)` and `submittedDurationMs` from `lib/video-trim.ts` (kept stable) to rebase and drop markers. `FormStep` and the recorder state (`trimming`) are the touch points.
- **Overlaps with crikket-ec branches:** this builds on #20 (`feature/pause-resume-recording`: `lib/pausable-recording.ts`, `hooks/use-screen-capture.ts`). Expect a rebase after crikket-ec's round-2 amends.

## Suggested skills
- `mattpocock-skills:tdd`: #22.
- `mattpocock-skills:resolving-merge-conflicts`: the rebase onto the amended #20.
- `run`: a real playback check.
