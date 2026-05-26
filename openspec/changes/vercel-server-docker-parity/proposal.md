## Why

The `apps/server` Vercel deployment has been unstable because it uses a different runtime model than the proven Docker path: a thin `api/index.js` handler imports a bundle from `dist/`, while Vercel's serverless packager often omits `dist/` from the function filesystem. Docker runs a single `tsdown` output (`dist/index.mjs`) after a full monorepo install. Aligning Vercel with that model removes recurring `ERR_MODULE_NOT_FOUND` errors (`@crikket/api` `.ts` imports, missing `dist/index.mjs`, static serving of handler source) and gives one documented deployment contract.

## What Changes

- Colocate the production bundle beside the Vercel serverless entry (`api/server.mjs`) so file tracing ships the app with the function—no `../dist/` import or `includeFiles` workaround.
- Update the server `build` script to produce the same `tsdown` bundle Docker uses, then copy it into `api/server.mjs` (or equivalent single-artifact output).
- Simplify `vercel.json` to rewrites only; remove `functions.includeFiles` for `dist/**`.
- Add an empty `public/` directory for Vercel static output when Framework Preset is **Other**.
- Update `api/index.js` to import the colocated bundle (optionally via `hono/vercel` `handle()` for Vercel compatibility).
- Update deployment docs (`apps/docs/content/docs/deployment/vercel.mdx`) with dashboard settings that match this layout.
- Move `tsdown` to `dependencies` (or document install-from-root) so production builds always run the bundler on Vercel.

## Capabilities

### New Capabilities

- `vercel-server-deploy`: Production deployment of `apps/server` on Vercel using a Docker-equivalent bundle layout, build pipeline, routing, and documented project settings.

### Modified Capabilities

<!-- None: no existing openspec/specs requirements -->

## Impact

- **Code**: `apps/server/package.json`, `api/index.js`, `vercel.json`, `tsdown.config.ts` (if needed), `.gitignore`, new `public/.gitkeep`, optional `api/server.mjs` gitignore entry.
- **Docs**: `apps/docs/content/docs/deployment/vercel.mdx`.
- **Vercel dashboard**: Server project must use Framework **Other**, `bun run build`, Output Directory `public`, monorepo install from root; redeploy required.
- **Not affected**: Docker/Caddy paths, web app Vercel project, runtime API behavior, env var names.
