# Handoff: feature/extension-rpc-errors (v0.3.0, follow-up to #48)

- **Head:** 9ff9c73, one commit on v030-base 0fab60c. Not yet PRed. The worktree was crikket-f-harden.
- **Commit:** `app(fix): show the sign-in message for opaque redirects and require an origin-only VITE_APP_URL`.

## What it does
- **Sign-in message:** `apps/extension/lib/orpc.ts` treats an `opaqueredirect` response, any 3xx, or an OK-with-HTML response as "Sign in to Crikket in a browser tab, then retry", instead of a vague "Failed to submit".
- **Origin-only URL:** the new `packages/env/src/app-origin.ts` exports `appOriginSchema` (path "/" only, no query or hash), used for `VITE_APP_URL` in `packages/env/src/extension.ts`.
- **Tests:** `apps/extension/test/{orpc,app-origin}.test.ts`.

## Origin
Round 1 on #48 suggested this: in real browsers oRPC's `redirect: "manual"` gives an opaqueredirect, and `VITE_APP_URL` with a path was accepted but silently dropped.

## Round 2: fold in
- **r2/webserver 4b5eeba** `app(fix): reject non-http schemes and embedded credentials in appOriginSchema` (Owner: feature/extension-rpc-errors).
  - **W4 (low):** the schema used to accept `https://user:pw@evil`, `file:///` and `ftp://`.
  - **Stryker:** app-origin.ts went from 85.37% to 100%.
- **How to fold in:**
  1. `git cherry-pick 4b5eeba` on this branch.
  2. `git reset --soft 0fab60c`, then `git commit -C 9ff9c73`, plus one sentence.

## Checked and fine (r2/webserver)
`getRpcUrl`/`getLoginUrl`/`getShareUrl` handle hostile input correctly; IDN is normalised to punycode, and IPv6 and `:443` work.

## Not done
- A review of whether a redirect could be tricked into looking like success. Code reading suggests not; no test.
- Real-browser behaviour of opaqueredirect.

## Downstream
crikket-8f's #19 (upload retry) may touch `orpc.ts`. Send it the new SHA.

## Suggested skills
- mattpocock-skills:tdd
- mattpocock-skills:code-review
