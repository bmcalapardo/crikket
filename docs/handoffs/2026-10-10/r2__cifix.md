# Handoff: r2/cifix (round-2 CI/release + qa-fixtures testing)

- **Head:** f795b42, 1 commit on r2-int 7c22896. Local; pushed to origin for reference only. Route the commit; don't PR the branch.
- **Worktree:** crikket-r2-cifix.

## Commit and routing
- **f795b42** `test(extension): add hostile-input tests for release planning scripts` (Owner: feature/prerelease-branches, #51). It adds `apps/extension/test/plan-release-hostile.test.ts` with no new dependency. It covers 3000 hostile tags and branches, a check that GITHUB_OUTPUT gets exactly 7 keys, and newline rejection. **No injection found**; it's a durable guard. Fold it into #51 as described in feature__prerelease-branches.md.

## qa-fixtures hardening (owner feature/qa-fixtures, #34): patch only
- **Files:** `qa-fixtures-hardening.patch` and `qa-fixtures-modified/` in this folder.
- **Contents:** the in-flight cap on /api/slow (Q1 DoS), nosniff, and binding to 127.0.0.1.
- **How to apply:** see feature__qa-fixtures.md.
- **Why it isn't committed:** r2-int lacked apps/qa-fixtures (a misreported merge), so the agent overlaid it into its worktree for testing only.

## Workflow findings (actionlint clean; zizmor offline)
- **unpinned-uses:** all actions are pinned by tag. Recommendation: SHA pins + `.github/dependabot.yml`. There is no CODEOWNERS file either.
- **artipacked:** all 7 workflows check out without `persist-credentials: false`; only version-packages pushes.
- **template-injection:** `extension-release.yml` `steps.plan.outputs.*` in `run:`. Accepted: f795b42 proves the values are regex-safe. Hardening: `env:` indirection (#51).
- **excessive-permissions:**
  - docker-publish.yml has `packages: write` at workflow level (#47 area);
  - publish.yml has `id-token: write` on PR runs.
- **No** `pull_request_target` or `workflow_run`. head_ref and labels go through `env:` and are quoted.
- **Caches:** fork PRs can't poison the release caches. Docker gha has `scope=service`, and the release only downloads same-run artifacts.

## GitHub settings the USER must configure (they can't be enforced in the repo)
1. CODEOWNERS on `.github/workflows/**`, plus required code-owner review. `hotfix-approval.yml` runs on `pull_request`, so a PR can edit the workflow to drop `environment:`.
2. A tag-protection ruleset for `extension-v*`, plus an environment gate on the publish job. Anyone with write access can tag, or run workflow_dispatch with `publish=true`.
3. If npm trusted publishing is used, bind it to master and/or an environment, because PR runs have `id-token: write`.
4. Branch protection on master and `prerelease/*`, requiring the changelog, ci and hotfix-approval checks.
5. The repo's default workflow permissions set to read.

## Not done
- Stryker on check-changelog.ts and plan-release.ts.
- Applying the workflow hardening edits.
- A pwn-request guard test.
- zizmor's online audits (impostor commits, cache).

## Suggested skills
- security-review: the workflow hardening.
- mattpocock-skills:code-review
