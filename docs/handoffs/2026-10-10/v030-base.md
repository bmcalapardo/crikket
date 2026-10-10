# Handoff: v030-base (temporary v0.3.0 base)

- **Ref:** v030-base 0fab60c (local; pushed to origin as a reference branch). v030-base2 is the same commit and stays local.
- **Purpose:** v0.3.0 work had to start before the 0.2.0 PRs merged, so this ref stands in for `prerelease/v0.3.0`. All six 0.3.0 branches are exactly one commit on top of it.

## Contents (first-parent history)
1. **07bcc63** `chore(release): open v0.2.0`, which is origin/prerelease/v0.2.0.
2. **Merges of the 0.2.0 PR heads, in this order:**
   - 8ac60b8 (#51)
   - dbe3560 (#47)
   - 0f251d1 (#48)
   - 6e870c3 (#50)
   - cbfad73 (#52): the merge resolved the App.tsx import conflict with #48 by keeping both imports.
3. **0fab60c** `chore(release): open v0.3.0`: `### v0.3.0` heading + apps/extension/package.json 0.3.0.
- **Verification:** the full pre-commit hook (turbo build + test + ultracite) passed on each merge commit and on the opener. This needed a fresh `bun install` after the #50 merge (new workspace dependency).

## Replacing it with the real base (once 0.2.0 merges)
1. Create `prerelease/v0.3.0` from the merged `prerelease/v0.2.0` tip, then add the "open v0.3.0" commit. Reuse 0fab60c's message: `git log -1 --format=%B 0fab60c`.
2. For each 0.3.0 branch: `git rebase --onto prerelease/v0.3.0 v030-base <branch>`. If any 0.2.0 PR was amended after 0fab60c (for example the round-2 folds), expect small conflicts in the files it touched.
3. Resolve the #20/#24 overlap in `apps/extension/hooks/use-screen-capture.ts` only when merging those two branches. See feature__pause-resume-recording.md.
4. Delete v030-base and v030-base2 (local and origin) once the real base exists. Tell crikket-8f.

## Integration caveats
See INDEX-testing-session.md, "Integration caveats": r2-int is missing qa-fixtures, plus the EOL noise, `.env` copies, stale installs, the crikket-8f ownership split, and the port ranges.

## Suggested skills
- mattpocock-skills:resolving-merge-conflicts
- mattpocock-skills:code-review: review the rebased stack.
