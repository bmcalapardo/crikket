# Contributing to Crikket

Thanks for your interest in contributing to Crikket.

This guide explains how to set up your local environment, make changes, and open high-quality pull requests.

## Code of Conduct

By participating, you agree to be respectful and constructive in discussions and reviews.

## Prerequisites

- [Bun](https://bun.sh) (see `packageManager` in the root `package.json`)
- Git
- Environment variables for the app(s) you plan to run

## Project Structure

This repository is a Turborepo monorepo.

```
apps/
└── web
└── server
└── docs
└── extension
packages/
```

## Getting Started

1. Fork and clone the repository.

2. Install dependencies from the repo root:

```bash
bun install
```

3. Create environment files from the provided examples:

```bash
cp .env.example .env
cp apps/web/.env.example apps/web/.env
cp apps/server/.env.example apps/server/.env
cp apps/docs/.env.example apps/docs/.env
cp apps/extension/.env.example apps/extension/.env
```

4. Fill in required environment values in the `.env` files you created.

5. Start development:

```bash
bun run dev
```

Run a specific app when needed:

```bash
bun run dev:web
bun run dev:server
```

## Database Commands

From the repository root:

```bash
bun run db:generate
bun run db:migrate
bun run db:push
bun run db:studio
```

## Code Quality

This project uses [Ultracite](https://www.ultracite.ai) (Biome-based linting/formatting) and Turborepo type checks.

Before opening a pull request, run:

```bash
bun run fix
bun run check
bun run check-types
bun run build
```

## Making Changes

- Keep changes focused and scoped to a single feature or fix.
- Prefer small, reviewable pull requests.
- Follow existing code patterns and naming conventions.
- Update documentation when behavior, APIs, or setup steps change.

## Pull Request Guidelines

When opening a PR:

- Use a clear title that explains intent.
- Describe what changed and why.
- Include screenshots/videos for UI changes.
- Link related issues if applicable.

## Commit Convention

Before you create a Pull Request, please check whether your commits comply with
the commit conventions used in this repository.

When you create a commit we kindly ask you to follow the convention
`category(scope or module): message` in your commit message while using one of
the following categories:

- `feat / feature`: all changes that introduce completely new code or new
  features
- `fix`: changes that fix a bug (ideally you will additionally reference an
  issue if present)
- `refactor`: any code related change that is not a fix nor a feature
- `docs`: changing existing or creating new documentation (i.e. README, docs for
  usage of a lib or cli usage)
- `build`: all changes regarding the build of the software, changes to
  dependencies or the addition of new dependencies
- `test`: all changes regarding tests (adding new tests or changing existing
  ones)
- `ci`: all changes regarding the configuration of continuous integration (i.e.
  github actions, ci system)
- `chore`: all changes to the repository that do not fit into any of the above
  categories

  e.g. `feat(components): add new prop to the avatar component`

If you are interested in the detailed specification you can visit
https://www.conventionalcommits.org/ or check out the
[Angular Commit Message Guidelines](https://github.com/angular/angular/blob/22b96b9/CONTRIBUTING.md#-commit-message-guidelines).

## Changelog and Versioning

`Changelog.md` is the single history of changes. Its **last** `### vX.Y.Z` heading is the version in progress, and `apps/extension/package.json` `version` always matches it (the release workflow and automatic builds read that version). CI fails a pull request that breaks either rule.

Changes are grouped into **blocks**, one per version. Each block lives on its own `prerelease/vX.Y.Z` branch, so the changelog can be reviewed before the block reaches `master`.

### Opening a block

Cut `prerelease/vX.Y.Z` from `master`. Its first pull request (or a direct first commit) adds the `### vX.Y.Z` heading at the bottom of `Changelog.md`, with its first line, and sets `apps/extension/package.json` to `X.Y.Z`. Pick the version level below, and see [Cutting a version](#cutting-a-version) for when the previous version counts as shipped.

### Every feature pull request

Branch from the block's prerelease branch and open the PR **into** `prerelease/vX.Y.Z`, not `master`. Add one line under the last heading in `Changelog.md`, using your initials and the PR's commit subject:

```
- [BC] feat(extension): add screenshot crop stage before submit
```

The format is `- [Initials] type(scope): subject`: initials in capitals, a lowercase type, an optional lowercase scope, then a subject. Append only; earlier versions and lines already in the block stay as written. A PR with nothing worth recording (for example a typo fix) can carry the `skip-changelog` label instead.

### Choosing the version level

The version in progress reflects the largest change merged under it:

- **Patch** (`0.1.3` → `0.1.4`): fixes, small updates, and additions within existing features. This is the default.
- **Minor** (`0.1.3` → `0.2.0`): a new capability testers will notice, or a repo-wide change to tooling, CI, builds, releases, or major dependencies.
- **Major** (`0.x` → `1.0.0`): a breaking change, such as testers having to reinstall or older reports no longer working.

If a feature PR is a larger change than the block allows, raise the version in the same PR: rename the last heading and update `apps/extension/package.json`, then rename the branch to match (`prerelease/vX.Y.Z` must equal both).

### Merging the block

When the block is ready, open one PR from `prerelease/vX.Y.Z` into `master`. CI checks that the branch version equals the last heading and `package.json`, and that the block's section is non-empty and every line follows the format. Merging it publishes a beta, `extension-vX.Y.Z-beta.N`.

Every push to `prerelease/vX.Y.Z` (that is, every merged feature PR) publishes an alpha, `extension-vX.Y.Z-alpha.N`. `N` is the workflow run number, so it always increases and an alpha and a beta never share a tag.

### Hotfixes

A PR into `master` must come from a `prerelease/vX.Y.Z` branch or from a branch named `hotfix/...`. Anything else is rejected. A hotfix PR also needs the maintainer to approve the `hotfix-approval` deployment in the Actions tab. Add its changelog line under `master`'s last heading; if that version already has a stable tag, open the next patch heading and bump `package.json` instead. Any open block then merges `master` into its prerelease branch and resolves the changelog conflict.

### Cutting a version

1. Copy the version's section from `Changelog.md` into `releases/vX.Y.Z.md` (see `releases/template.md`) and push the stable tag `extension-vX.Y.Z` (see the extension install docs).
2. The next block opens the next version, as described in [Opening a block](#opening-a-block).

## Security

Do not open public issues for security vulnerabilities.

Please follow [SECURITY.md](./SECURITY.md) and report vulnerabilities privately.

## Questions

If anything is unclear, open an issue or start a discussion in the repository.
