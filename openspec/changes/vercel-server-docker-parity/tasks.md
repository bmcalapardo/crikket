## 1. Build pipeline

- [x] 1.1 Update `apps/server/package.json` build script to run `tsdown` and copy `dist/index.mjs` to `api/server.mjs`
- [x] 1.2 Move `tsdown` from `devDependencies` to `dependencies` so Vercel always runs the bundler
- [x] 1.3 Add `api/server.mjs` to `apps/server/.gitignore` (generated artifact)

## 2. Vercel entry and config

- [x] 2.1 Update `apps/server/api/index.js` to import from `./server.mjs` (add `hono/vercel` `handle()` if plain export fails on deploy)
- [x] 2.2 Simplify `apps/server/vercel.json`: remove `functions.includeFiles`, keep rewrite `destination` as `/api`
- [x] 2.3 Add `apps/server/public/.gitkeep` for empty static output directory

## 3. Documentation

- [x] 3.1 Update `apps/docs/content/docs/deployment/vercel.mdx` with colocated `api/server.mjs` layout, install command from monorepo root, Output Directory `public`, and env domain alignment
- [x] 3.2 Document post-deploy verification (`curl /` → `OK`, no `src/index.js` in function logs)

## 4. Verification

- [ ] 4.1 Run `bun run build` locally in `apps/server` and confirm `api/server.mjs` exists
- [ ] 4.2 Deploy to Vercel server project with documented settings and confirm production health check
