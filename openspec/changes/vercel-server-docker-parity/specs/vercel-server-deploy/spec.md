## ADDED Requirements

### Requirement: Server build produces Docker-equivalent bundle

The `apps/server` build script SHALL run `tsdown` with the existing configuration (ESM output, `noExternal` for `@crikket/*` packages) and SHALL produce a single bundled application file equivalent to `dist/index.mjs` used by the Docker image.

#### Scenario: Build output matches Docker artifact

- **WHEN** `bun run build` is executed in `apps/server` after a monorepo install
- **THEN** `dist/index.mjs` exists and contains the bundled server application
- **AND** `api/server.mjs` exists as a copy of that bundle for Vercel deployment

### Requirement: Vercel serverless entry colocates with bundle

The Vercel serverless handler SHALL live at `api/index.js` and SHALL import the application from `./server.mjs` in the same directory. The handler SHALL NOT import from `../dist/index.mjs`.

#### Scenario: Handler imports sibling bundle

- **WHEN** the Vercel function at `api/index.js` is invoked
- **THEN** the runtime resolves `./server.mjs` from the `api/` directory without requiring a separate `dist/` tree in the function package

### Requirement: Vercel routing exposes full Hono app at root

The deployment configuration SHALL rewrite all HTTP paths to the `/api` serverless function so routes defined in the bundled app (including `GET /`, `/api/auth/*`, and `/rpc`) behave the same as the Docker deployment.

#### Scenario: Health check at root

- **WHEN** a client sends `GET /` to the deployed server URL
- **THEN** the response body is `OK` with a successful status code

#### Scenario: Auth routes reachable

- **WHEN** a client sends a request to `/api/auth/*` on the deployed server URL
- **THEN** the request is handled by the Better Auth handler in the bundled application

### Requirement: Vercel configuration avoids static mis-serving

The project SHALL NOT rely on `vercel.json#functions.includeFiles` to ship the application bundle. The `vercel.json` for `apps/server` SHALL configure rewrites to `/api` only. An empty `public/` directory SHALL exist for static output when using Framework Preset **Other**.

#### Scenario: Root does not return handler source

- **WHEN** a client sends `GET /` to the deployed server URL
- **THEN** the response is not the raw source text of `api/index.js`

### Requirement: Documented Vercel project settings

Deployment documentation SHALL specify server project settings: Root Directory `apps/server`, Framework Preset **Other**, Build Command `bun run build`, Install Command from monorepo root with frozen lockfile, Output Directory `public`, and enabled "Include source files outside of the Root Directory". Documentation SHALL state that `BETTER_AUTH_URL` and `NEXT_PUBLIC_SERVER_URL` MUST use the server/API domain, not the web app domain.

#### Scenario: Operator can configure from docs

- **WHEN** an operator follows the Vercel deployment guide for `apps/server`
- **THEN** they can configure Vercel project settings without using the Hono Framework Preset or `dist/` as the static output directory
