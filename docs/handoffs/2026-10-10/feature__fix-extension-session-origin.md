# Handoff: feature/fix-extension-session-origin (PR #48)

- **Head:** origin 0f251d1, one commit on prerelease/v0.2.0 (07bcc63). The local ref (da9f168, still based on the old v0.1.4) is stale; never push it.
- **PR:** https://github.com/bmcalapardo/crikket/pull/48, base prerelease/v0.2.0.
- **Status:** ready. Unchanged in both rounds.

## What it does
The extension sends RPC to `VITE_APP_URL/rpc`, the web app's `/rpc` proxy, instead of the server origin, so that the session cookie set by the web app's `/api/auth` proxy is sent. This fixes "Unauthorized session. Sign in again" on every submit.
- **Files:** `apps/extension/lib/{app-urls,orpc,recorder-submit}.ts`, `apps/extension/entrypoints/recorder/App.tsx`, `packages/env/src/extension.ts`, `apps/extension/.env.example`, the docs, and the release workflow env.

## Verification
- **Round 1:**
  - a CORS fuzz over 20k origins against a reference model;
  - spoof cases: null, lookalike domains, schemes, ports and extension-scheme tricks;
  - 5000 hostile share paths;
  - a live oRPC client against a local Bun.serve, with 500 parallel calls.
  All passed, and the gates are green.
- **Round 2** (r2/webserver):
  - app-urls fuzz (`getRpcUrl`/`getLoginUrl`/`getShareUrl` with `//evil`, `/\evil`, `javascript:`, IDN, IPv6) behaved correctly;
  - no r2 commit is owned by #48. The related tightenings landed in feature/extension-rpc-errors.

## Known conflict
- **#52:** both add an import on adjacent lines of `apps/extension/entrypoints/recorder/App.tsx`. Resolution: keep both, `import type { AnnotationHistory } from "@/lib/annotations"` then `import { getLoginUrl, getShareUrl } from "@/lib/app-urls"`. Whichever PR merges second needs a rebase onto the updated prerelease/v0.2.0.

## Follow-ups already handled elsewhere
- **Opaque-redirect / 3xx shown as a vague failure:** fixed in feature/extension-rpc-errors (0.3.0).
- **`VITE_APP_URL` with a path, userinfo or a non-http scheme:** rejected by `appOriginSchema` in feature/extension-rpc-errors, plus r2/webserver 4b5eeba.
- **Related security findings** (pre-existing, not #48's code; see r2__webserver.md):
  - **W1:** CSRF on `/rpc`, fixed as new-hardening.
  - **W6:** CORS reflects any extension origin with credentials. Recommendation only.

## Not testable locally
The real Vercel deployment: the cookie on the web origin and the `/rpc` rewrite forwarding cookies and Origin. Needs deployed cookies and a DB.

## Next steps
Merge after #51. Rebase if #52 lands first.

## Suggested skills
- mattpocock-skills:resolving-merge-conflicts: the App.tsx import conflict.
- mattpocock-skills:code-review
