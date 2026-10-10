# Handoff: feature/ci-path-filters (v0.3.0)

- **Head:** 11d28e2, one commit on v030-base 0fab60c. Not yet PRed. The worktree was crikket-f-harden.
- **Commit:** `ci: widen docker and extension release path filters and run docker checks on prerelease PRs`.

## What it does
- **`docker-publish.yml`:** the PR paths now include `.dockerignore` and `apps/*/package.json`. A workspace package.json change can break `bun install --frozen-lockfile` inside Docker. The PR trigger now also covers `prerelease/**`.
- **`extension-release.yml`:** the push paths now include every workspace package in the extension's dependency graph that was missing (api, auth, billing, bug-reports, config, db), plus root `package.json`, `bun.lock`, `turbo.json` and `tsconfig.json`.
- **Verification:** actionlint 1.7.7 is clean.

## Deliberately not changed
- **`publish.yml`:** the dry run shares a `concurrency` group with the real publish and uses `cancel-in-progress: true`. Running it on more PRs could cancel an in-flight master publish, so it needs its own change.

## Round 2 (r2/cifix)
- actionlint is clean and there are no injection findings in these lines.
- zizmor's general findings (unpinned actions, `persist-credentials`, workflow-level permissions) apply repo-wide; see r2__cifix.md.
- **No r2 commits** are owned by this branch.

## Follow-ups
- Once **#24** merges, check that its `VITE_BUILD_SHA` env additions in `extension-release.yml` don't conflict here. They touch different lines; v030-int and r2-int merged cleanly.
- Consider adding `apps/qa-fixtures/**` filters if a fixtures image is ever published. #34 adds no image.

## Suggested skills
- security-review
- mattpocock-skills:code-review
