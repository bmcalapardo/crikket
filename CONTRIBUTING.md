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

`Changelog.md` is the single history of changes. Its **last** `### vX.Y.Z` heading is the version in progress, and `apps/extension/package.json` `version` always matches it (the release workflow and automatic alpha builds read that version). CI fails a pull request that breaks either rule.

### Every pull request

Add one line under the last heading in `Changelog.md`, using your initials and the PR's commit subject:

```
- [BC] feat(extension): add screenshot crop stage before submit
```

Append only; earlier versions are history and stay as written. A PR with nothing worth recording (for example a typo fix) can carry the `skip-changelog` label instead.

### Choosing the version level

The version in progress reflects the largest change merged under it:

- **Patch** (`0.1.3` → `0.1.4`): fixes, small updates, and additions within existing features. This is the default.
- **Minor** (`0.1.3` → `0.2.0`): a new capability testers will notice, or a repo-wide change to tooling, CI, builds, releases, or major dependencies.
- **Major** (`0.x` → `1.0.0`): a breaking change, such as testers having to reinstall or older reports no longer working.

If your PR is a larger change than the version in progress allows, raise it in the same PR: rename the last heading and update `apps/extension/package.json` to match.

### Cutting a version

1. Copy the version's section from `Changelog.md` into `releases/vX.Y.Z.md` (see `releases/template.md`) and push the stable tag `extension-vX.Y.Z` (see the extension install docs).
2. The next pull request opens the next version: add a new `### vX.Y.Z` heading at the bottom of `Changelog.md` with its entry, and set `apps/extension/package.json` to that version, at the level its change calls for.

## Security

Do not open public issues for security vulnerabilities.

Please follow [SECURITY.md](./SECURITY.md) and report vulnerabilities privately.

## Questions

If anything is unclear, open an issue or start a discussion in the repository.
