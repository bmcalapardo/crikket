# Handoff: r2/webserver (round-2 web/server trust-boundary testing)

- **Head:** bbc0594, 3 commits on r2-int 7c22896. Local; pushed to origin for reference only. Route the commits; don't PR the branch.
- **Worktree:** crikket-r2-webserver. Its apps/extension/.env was copied from .env.example.

## Commits and routing
| SHA | Subject | Owner | Notes |
|---|---|---|---|
| a5a8c5e | reject untrusted browser origins on /rpc to close cross-site POST CSRF | new-hardening | **W1 (HIGH)**: `isTrustedRpcOrigin` + `createRpcOriginGuard` in `apps/server/src/cors-origin.ts`, applied to `/rpc/*` in `index.ts`. Test: `test/rpc-csrf.test.ts` |
| 4b5eeba | reject non-http schemes and embedded credentials in appOriginSchema | feature/extension-rpc-errors | **W4** (low) |
| bbc0594 | property-test resolveCorsOrigin against a reference model | new-hardening | Adds fast-check to apps/server (bun.lock). 3000 runs, seeded. cors-origin.ts Stryker score went to 100% |

## W1 details and caveat
- **The hole:** the prod session cookie is `SameSite=None; Secure; HttpOnly` (`packages/auth/src/index.ts`), and oRPC parses a body with no Content-Type as JSON. So a cross-site `fetch(..., {mode:"no-cors", credentials:"include", body: Blob})` runs mutations with no preflight.
- **Red/green:** before, an in-process oRPC through Hono returned 200 and the row was inserted. After, it returns 403.
- **The guard:** Origins outside `CORS_ORIGINS`/`BETTER_AUTH_URL` and the extension schemes are rejected. No-Origin requests (SSR, curl) are unchanged.
- **BEFORE SHIPPING:** verify the web app's own `/rpc` (a Next rewrite to the server) still arrives with an allowed Origin in a deployed or preview environment. Otherwise the web app's own RPC calls break.
- **Gaps:** `/api-reference` (the OpenAPI handler) is not covered; `/api/auth/*` relies on better-auth's own origin check, which was not tested.

## Needs the user's decision
- **W2 (HIGH, pre-existing on master):** `auth.assignOrganization` in `packages/api/src/routers/auth.ts` is a `publicProcedure`. It inserts a `member` row for any `orgId` from any signed-in session, and `listOrganizations` (also public) lists every org id. Sign-up has `requireEmailVerification: false`. Options: invite-only, a verified matching-domain check, or removal.
- **W3 (medium):** the middleware's `@medgrocer.com` gate is a case-sensitive `endsWith` and ignores `emailVerified`. Recommendation: lower-case the email and require verification.
- **W6:** CORS reflects any `chrome-extension://`/`moz-extension://` origin with credentials. Recommendation: allow-list the production Chromium extension ID (pin it via the manifest `key`) and keep `moz-extension` for non-cookie routes only.
- **W5 (low):** the middleware matcher `(?!...api/auth|rpc)` has no boundary, so `/rpcfoo` and `/api/authfoo` skip it. Nothing lives there.

## Refuted
- **W7:** embed-path confusion (exact `c.req.path` match) and the CORS lookalikes.
- No mutation accepts GET (`StrictGetMethodPlugin`). text/plain and urlencoded bodies give 400.

## Not tested
Middleware fail-closed and Host/X-Forwarded-Host SSRF; the auth proxy's header spoofing and open redirects; real Set-Cookie attributes; real-browser CSRF confirmation; `Vary: Origin`.

## Incident
This agent ran `taskkill /F /IM bun.exe`, which hit the other session's processes. crikket-8f confirmed nothing was lost. Rule: kill by PID only.

## Suggested skills
- security-review: W1 verification, and W2/W3 once decided.
- mattpocock-skills:tdd
- mattpocock-skills:diagnosing-bugs
