# Handoff: feature/annotation-editor (PR #52, closes #13)

- **Head:** origin cbfad73, one commit on prerelease/v0.2.0 (07bcc63). The local ref (07162a4) is stale; never push it.
- **PR:** https://github.com/bmcalapardo/crikket/pull/52, base prerelease/v0.2.0.
- **Status:** ready. Fold in two round-2 commits.

## What it does
An annotate step after crop: Pen, Eraser, Undo/Redo, Reset to Original, Cancel and Done, with click-to-delete. Crop changes reproject annotations and drop out-of-bounds ones with a warning. Done renders once at native resolution.
- **Files:** `apps/extension/components/{annotate-step,crop-step}.tsx`, `hooks/use-annotation-{editor,shortcuts}.ts`, `hooks/use-screenshot-crop.ts`, `lib/{annotations,annotation-render,screenshot-edits,recorder-state}.ts`, and `entrypoints/recorder/App.tsx`, plus their tests.

## Round 1 (done, already in cbfad73)
- **Render failure at Done:** the tester now stays on the step with a `role="alert"` error, instead of silently submitting without annotations (`annotate-step.test.tsx`).
- **History fuzz:** `test/annotations-fuzz.test.ts` (4 seeds × 300 steps against a reference model).
- **Draw-budget tests:** in `annotation-render.test.ts` they use best-of-N timing; they had failed 10 of 15 runs under load.

## Round 2: fold in (Owner: feature/annotation-editor)
- **r2/ext 60a02dd** `test(extension): model-based test for annotation history across crop changes` (`test/screenshot-edits-model.test.ts`). It needs fast-check, which r2/ext a1bcd68 adds to `apps/extension/package.json` and bun.lock. a1bcd68 is owned by #20, so for #52 add `fast-check` as a devDependency yourself, run `bun install`, and commit only the lock lines fast-check needs.
- **r2/ext 5192f34** `app(fix): show an error when Apply Crop can't render the cropped image` (`components/crop-step.tsx` + `test/crop-step.test.tsx`). Apply Crop used to do nothing silently when `applyCrop` returned null.
- **How to fold in:**
  1. Make a detached worktree at origin/feature/annotation-editor.
  2. Cherry-pick both, resolving the fast-check dependency as above.
  3. Squash into one commit with `git reset --soft 07bcc63` and `git commit -C cbfad73`, plus one sentence.
  4. Force-push with `--force-with-lease=feature/annotation-editor:cbfad73`.
  5. Update the PR body.

## Reported, not fixed
- **Lost pointerup:** a lost pointerup/cancel without pointer capture could wedge drawing until Cancel. `pointercancel` is handled and capture is used, so this is low risk; an `onLostPointerCapture` handler would close it.

## Needs a real browser
Native-resolution `toBlob` time at 4K+, pointer capture, high-DPR sizing, image-load failure, and canvas extremes (1×1, 8K at DPR 3, 10k strokes). happy-dom has no canvas.

## Known conflict
- **#48:** an adjacent import line in `entrypoints/recorder/App.tsx`. Keep both imports.

## Downstream
- **crikket-8f:** its #14/#15/#16 (annotation shapes, style, highlight/obscure) and #23 build on this code. Send it the new SHA after amending.

## Suggested skills
- mattpocock-skills:tdd
- mattpocock-skills:resolving-merge-conflicts
- mattpocock-skills:code-review
