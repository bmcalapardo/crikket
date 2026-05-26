## Context

`apps/server` runs in production via Docker by building `dist/index.mjs` with `tsdown` (`noExternal: /@crikket\/.*/`) after a monorepo `bun install`, then executing that single bundle. Vercel deployment evolved separately: Framework Preset **Hono** ran transpiled `src/index.ts` (breaking on workspace `.ts` exports), then **Other** with `api/index.js` importing `../dist/index.mjs` plus `includeFiles` and `public` output—each fix addressed one failure mode while the split entry/bundle layout remained fragile.

Stakeholders: operators deploying split-origin (`app.*` + `api.*`) on Vercel; developers using Docker/Caddy locally.

## Goals / Non-Goals

**Goals:**

- Vercel serverless runs the same bundled application artifact Docker uses (same `tsdown` config, same workspace inlining).
- Serverless entry and bundle are colocated under `api/` so Vercel file tracing includes the bundle without `includeFiles`.
- Documented, reproducible Vercel project settings (Framework, build, install, output).
- `GET /` returns `OK` after deploy; auth/RPC routes reachable at same paths as Docker.

**Non-Goals:**

- Changing Docker or Caddy deployment paths.
- Moving server off Vercel or changing web app deployment.
- Prebuilding all `packages/*` to published JS (bundle-at-server-build remains the strategy).
- Fixing Supabase/env configuration (document alignment only).

## Decisions

### 1. Colocated bundle: `api/server.mjs`

**Choice:** After `tsdown` writes `dist/index.mjs`, copy to `api/server.mjs`. `api/index.js` imports `./server.mjs`.

**Rationale:** Docker runs one file on disk; Vercel's packager reliably traces sibling imports from `api/index.js`. Avoids `../dist/` crossing directories and removes `vercel.json#functions.includeFiles`.

**Alternatives considered:**

- Keep `dist/` + `includeFiles` — already failed in production.
- Hono preset + `src/index.ts` — cannot load workspace `.ts` exports at runtime.
- `tsdown` `outDir: ./api` with `clean: true` — would delete `api/index.js` unless carefully scoped.

### 2. Build script

**Choice:** `"build": "tsdown && cp dist/index.mjs api/server.mjs"` (use cross-platform copy if Windows CI matters, e.g. `bun -e` or a tiny script).

**Rationale:** Reuses existing `tsdown.config.ts` unchanged; Docker `CMD` can keep using `dist/index.mjs`.

### 3. Vercel handler export

**Choice:** `api/index.js` imports default app from `./server.mjs` and exports it. Evaluate `hono/vercel` `handle(app)` if plain `export default app` fails on Vercel; prefer minimal change first.

**Rationale:** `src/index.ts` already `export default app`; bundled output preserves that.

### 4. `vercel.json`

**Choice:** Rewrites only—`destination: "/api"` (no `.js` extension). Remove `functions` block.

### 5. Static output

**Choice:** Add `public/.gitkeep`; Vercel Output Directory override = `public`.

**Rationale:** Satisfies **Other** framework static output check without deploying `.` as static root (which exposed `api/index.js` as text).

### 6. Dependencies

**Choice:** Move `tsdown` to `dependencies` (or ensure install command installs devDeps). Keep `@crikket/*` in `dependencies` (already done).

**Rationale:** Guarantees `bun run build` on Vercel even with production-oriented install edge cases.

### 7. Install command (documented)

**Choice:** Recommend `cd ../.. && bun install --frozen-lockfile` with "Include outside root" enabled.

**Rationale:** Matches Docker monorepo install; workspace packages must link before `tsdown`.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| `api/server.mjs` large; cold start size | Same as Docker bundle; acceptable; monitor Vercel limits |
| `cp` not portable on Windows dev | Use `bun` copy or document WSL; CI/Vercel is Linux |
| Generated `api/server.mjs` committed by mistake | Add to `.gitignore` |
| Production deployment still on old Hono settings | Docs + redeploy; verify logs show `api/server.mjs` not `src/index.js` |
| Build runs but copy step skipped | Fail build if `api/server.mjs` missing (optional postbuild check in tasks) |

## Migration Plan

1. Merge code/docs changes.
2. Vercel server project: Framework **Other**, Build `bun run build`, Install from monorepo root, Output `public`, include outside root **On**.
3. Redeploy server; confirm build log shows `tsdown` and no `public` / `dist` errors.
4. `curl https://<server>/` → `OK`.
5. Verify sign-up/session against correct `DATABASE_URL` / `BETTER_AUTH_URL` (server domain).
6. Rollback: revert commit; redeploy previous deployment in Vercel dashboard.

## Open Questions

- Whether `handle()` from `hono/vercel` is required for this Vercel runtime version (validate on first deploy after apply).
- Whether to add a `postbuild` assert script for `api/server.mjs` existence in CI.
