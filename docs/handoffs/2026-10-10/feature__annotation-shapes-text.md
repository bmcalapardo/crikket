# Handoff: feature/annotation-shapes-text (#14, "Annotate with lines, arrows, shapes and text")

## State
- **Branch:** `feature/annotation-shapes-text`, local and origin both at **309747e**. It is one commit on local `v030-int` (fd2896d), and the hook passed.
- **Worktree:** `C:/Users/Brandon/Documents/Work/Code/crikket-i14`, clean (EOL-only noise).
- **Base:** local `v030-int`. It must be rebuilt as a single commit on `prerelease/v0.3.0` once that exists.
- **Spec:** `gh issue view 14`; detail in `git show 309747e` ("Hardening:" paragraph).
- **Process note:** the first hardening amend briefly carried the #17 message from a shared `msg.txt`. It was re-amended, and the subject is correct now.

## Acceptance criteria
Verified by unit tests (recording-canvas draw calls plus hit-tests). There is no real-pixel or browser check, because happy-dom has no raster canvas.
- **Arrow, line, rectangle, ellipse and text render in the final image: done.** See `lib/annotations.ts` (the `Annotation` union of Pen, Shape and Text), `lib/annotation-render.ts`, `hooks/use-annotation-editor.ts` and `components/annotate-step.tsx`.
- **Undo, redo and click-to-delete for every tool: done.** Via `hitTest` and `commitAnnotation`.
- **Keyboard-operable toolbar with accessible names: done.** `role="toolbar"` with `aria-label` and `aria-keyshortcuts`; the tool letters are P, E, L, A, R, O, T.
- **No collision with extension commands: done.** `test/annotation-shortcuts.test.ts` parses `wxt.config.ts`.

## Tests and hardening
- **Test files:** `test/annotation-shapes.test.ts`, `test/annotation-shortcuts.test.ts` and `test/annotation-hardening.test.tsx`; `annotations-fuzz.test.ts` is extended with an all-kinds seeded fuzz.
- **Hardening fixes:**
  - Enter followed by blur, or repeated Enter, no longer double-commits; Escape then blur no longer commits.
  - Enter during IME composition is ignored.
  - Zero-length, NaN or missing-point shapes are rejected.
  - Text partly inside a crop is kept.
  - `normalizeAnnotationText` with `MAX_TEXT_LENGTH` of 200 handles control characters, whitespace and surrogate pairs.
- **Stress:** a 3000-annotation undo/redo round trip, and hit-testing 5000 annotations (best-of-5, 2 s ceiling).
- **Research:** W3C APG toolbar pattern, https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/

## Known gaps and next steps
1. **Roving tabindex:** add arrow-key, Home and End navigation per the APG. It's not done; each button is its own tab stop.
2. **Text hit box:** it is estimated at 0.6 times the font size; use `ctx.measureText` instead. Text near the right edge clips.
3. **Keyboard handling:** tool letters assume a Latin layout (they match on `event.key`), and holding Ctrl+Z auto-repeats undo.
4. **NEXT:** #15 (stroke size, colour and opacity), stacked as one commit on this branch. Every annotation already carries `color` and `width`, so add opacity there. Then #16 (highlight and obscure) on #15: add kinds to the union and to the `drawAnnotation` and `hitsAnnotation` switches.
- **Overlaps with crikket-ec branches:** this builds directly on #52 (`feature/annotation-editor`). Expect a rebase after crikket-ec's round-2 amends to #52.

## Suggested skills
- `mattpocock-skills:tdd`: #15 and #16.
- `mattpocock-skills:resolving-merge-conflicts`: the rebase onto the amended #52.
- `mattpocock-skills:code-review`: before the prerelease rebuild.
