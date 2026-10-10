# Handoff: feature/prerelease-branches (PR #51)

- **Head:** origin 8ac60b8, one commit on prerelease/v0.2.0 (07bcc63). The local ref (70f93c3) is stale; never push it.
- **PR:** https://github.com/bmcalapardo/crikket/pull/51, base prerelease/v0.2.0.
- **Status:** ready, **merge first**. #51 adds CI triggers for `prerelease/**`; until it merges, #48/#50/#52 only get Vercel checks.

## What it does
It routes features through `prerelease/vX.Y.Z` block branches with changelog checks:
- `apps/extension/scripts/check-changelog.ts` (+ `test/check-changelog.test.ts`) validates the changelog;
- `scripts/plan-release.ts` plans releases;
- the workflows changed are `changelog.yml`, `ci.yml`, `extension-release.yml` and `hotfix-approval.yml`;
- the CONTRIBUTING.md process docs are updated.
The PR body has a full summary and a "Negative and stress testing" section.

## Round 1 (done, already in 8ac60b8)
- **Fuzz:** about 75 fixture cases and 20k+20k seeded fuzz, with 0 mismatches. actionlint is clean.
- **Fixed:**
  - a repeated `### vX.Y.Z` heading was accepted;
  - block and hotfix PRs into master could rewrite earlier changelog history (`historyErrors`);
  - any `changeset-release/*` branch was exempt; now only `changeset-release/master` is (`CHANGESETS_RELEASE_BRANCH`, checked inside `checkChangelog`).

## Round 2: fold in
- **r2/cifix f795b42** `test(extension): add hostile-input tests for release planning scripts` (Owner: feature/prerelease-branches). It adds `apps/extension/test/plan-release-hostile.test.ts`: a seeded LCG fuzz with 3000 hostile tags/branches, a GITHUB_OUTPUT key whitelist, and trailing-newline rejection. It found no injection; it's a durable guard.
- **How to fold in:**
  1. Make a detached worktree at origin/feature/prerelease-branches.
  2. `git cherry-pick f795b42`.
  3. `git reset --soft HEAD~2`, then commit with the original message (`git commit -C 8ac60b8`), plus one sentence about the hostile-input tests.
  4. `git push --force-with-lease=feature/prerelease-branches:8ac60b8 origin HEAD:feature/prerelease-branches`.
  5. Add a line to the PR body.

## Reported, not fixed (owner #51 for the files it introduced)
These come from zizmor, offline (see r2__cifix.md):
- **template-injection:** `extension-release.yml` interpolates `steps.plan.outputs.*` in `run:` (around lines 112-114). The values are regex-proven safe by f795b42; hardening would route them via `env:`.
- **artipacked:** checkouts don't set `persist-credentials: false`.
- **unpinned-uses:** actions are pinned by tag, not SHA.
- **Repo settings the user must configure:**
  - `hotfix-approval.yml` runs on `pull_request`, so a PR can edit the workflow to drop `environment:`. Needs CODEOWNERS plus required code-owner review on `.github/workflows/**`.
  - Branch protection must require the changelog, ci and hotfix-approval checks on master and `prerelease/*`.
- **Minor:** a malformed `PR_LABELS` env value gives a stack trace instead of `::error`; a hotfix may open any heading, not only a patch bump; prose above the first heading is not checked.

## Known conflicts
- **#47** also edits `extension-release.yml` and the Changelog; they auto-merge.

## Next steps
1. Fold f795b42 in (above).
2. Optionally apply the `env:` indirection and `persist-credentials: false` hardening in its own follow-up, or in #51 before merge.
3. Merge #51 first.

## Suggested skills
- mattpocock-skills:code-review: review the folded commit against CONTRIBUTING.md.
- security-review: the workflow-injection hardening.
- mattpocock-skills:resolving-merge-conflicts: if a Changelog conflict appears at merge time.
