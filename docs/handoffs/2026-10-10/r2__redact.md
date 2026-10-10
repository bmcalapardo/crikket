# Handoff: r2/redact (round-2 Redaction adversarial testing)

- **Head:** 627ae08, 2 commits on r2-int 7c22896. Local; pushed to origin for reference only. Route the commits; don't PR the branch.
- **Worktree:** crikket-r2-redact.

## Commits and routing (both Owner: feature/harden-redaction, #50)
- **d9732a1** `app(fix): close five redaction leaks found by round 2 canary testing`, in `packages/capture-core/src/debugger/redaction.ts` + `test/redaction-leaks.test.ts`. Each leak has a regression test that failed first:
  - **R1:** `redis://:SECRET@h:6379`; the userinfo regex required a non-empty user.
  - **R2:** JSON embedded in a string (backslash-escaped quotes), for example console messages.
  - **R3:** a JWT whose signature was cut by a cap kept its payload claims.
  - **R4:** `passphrase`, `bearer` and exact `auth` keys. `author`, `oauth-state` and `{"auth":true}` are untouched.
  - **R5:** a secret inside a percent-encoded URL param value. The value is now masked whole when decoding reveals a secret.
  It bundles five fixes in one commit, which is fine since everything squashes into #50.
- **627ae08** `test(capture-core): pin redaction edge cases found by mutation testing` (`test/redaction-edges.test.ts`, 24 tests).
- **Fold into #50** together with the I4 fix; see feature__harden-redaction.md.

## Measurements
- **Stryker:** redaction.ts went from 65.4% (202 survivors) to 86.0% (82 survivors, mostly equivalent).
- **ReDoS:** dynamic n-scaling from 1e3 to 1e6 on 18 adversarial shapes is linear. The worst case is about 250 ms/MB on uncapped input; the page context caps at 4000 characters first.
- **Truncation:** cuts at every position across 11 shapes. No prefix leak for JSON, nested JSON, text, form, URL, fragment, Cookie or multipart.
- **Differential:** about 70 canaries through client `normalizeDebuggerEvent` vs server `redactNetworkRequest` are identical, and the server pass on client output is idempotent.
- **Old playbook claims refuted:** the "Bearer leak" and `{"password":...}` are both masked on current code.
- **Flake:** the existing "redaction timing" test (3000 ms budget) failed once at 3926 ms under 6-way contention. Consider best-of-N.

## Residual gaps (document under "conservative, not guaranteed"; fixing would over-redact)
- **Names:** credentials, ssh_key, key, otp, pin, ssn, card, cvv, dsn, connectionString and STRIPE_SK.
- **Formats:**
  - `{name:"X-Api-Key", value:...}` pair JSON;
  - XML `<password>`;
  - `curl -u user:pw`;
  - `password => "x"`;
  - `password%3Dx`;
  - zero-width characters in keys;
  - path tokens such as `/reset/<token>/confirm`.
- **Truncations:**
  - userinfo cut before the `@`;
  - a Bearer token cut to 5-7 characters;
  - a JWT cut inside its header (the header isn't secret).
- **Diagnostics bundle (#24):** storage KEYS are readable; free text without a key=value shape is not masked.

## Not done
Stryker on normalize.ts, a `recheck` static scan (it runs under Node, not Bun), a fast-check property suite, multi-process fuzz of extension payload building, and running the qa-fixtures sensitive test.

## Rule disclosure
It ran `pkill -f stryker` once (matching on the command line). No sign it hit anything else.

## Suggested skills
- mattpocock-skills:tdd
- security-review
- mattpocock-skills:code-review
