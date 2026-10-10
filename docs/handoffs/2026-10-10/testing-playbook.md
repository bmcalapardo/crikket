# Crikket negative / attack / stress testing playbook

Scope: read-only research on branch `feature/fix-extension-session-origin`. Tool verdicts in section 3 were executed on this machine (Windows 11, Bun 1.3.14, Node 24.13). Observations marked **[code]** come from reading the repo; **[verified]** were run. Everything else is a hypothesis to test. `apps/qa-fixtures` does not exist in this working tree, so section 2.8 is written from the task description.

## 1. Definitions and yield

| Kind | Question it answers | Typical oracle |
|---|---|---|
| Negative testing | Does the system reject or survive invalid, missing, out-of-range, wrong-state input gracefully? | 4xx / typed error, no crash, no state corruption |
| Attack (adversarial/security) testing | Can a hostile actor (malicious page, other extension, other origin, fork PR, tampering client) make it do something it should not? | Trust-boundary violation, data exposure, privilege gain |
| Stress testing | What happens at and beyond capacity (size, rate, duration, concurrency)? | Latency/error curve, memory growth, graceful degradation, recovery |

Differences: negative = unintended *input*; attack = intentional *adversary with a goal*; stress = *volume/time*, input is valid. They overlap (a JSON bomb is all three).
Refs: OWASP WSTG https://owasp.org/www-project-web-security-testing-guide/ ; OWASP ASVS https://owasp.org/www-project-application-security-verification-standard/

Bug yield per hour for this repo (best first):
1. **Error guessing + boundary values on trust boundaries** (CORS origin string, postMessage payload, durationMs, redaction patterns). Minutes each; code reading alone produced ~6 candidate defects below.
2. **State-transition testing** of recorder (idle/recording/paused/stopped/error), upload session, release tags. Bugs cluster at illegal transitions.
3. **Property-based testing (fast-check)** on pure functions: normalize, redaction, screenshot-edits, plan-release, resolveCorsOrigin. 20-40 min per module. https://fast-check.dev/docs/introduction/
4. **Metamorphic / differential**: redact(redact(x)) == redact(x); JSON-body vs form-body redaction hide the same secret; server redaction vs capture-core redaction agree; extension output always passes the server zod schema. No oracle needed.
5. **Model-based** (fast-check commands) for recorder state machine and annotation undo/redo. https://fast-check.dev/docs/advanced/model-based-testing/
6. **Fuzzing** (Jazzer.js / jsfuzz) for parsers of untrusted bytes (normalize, multipart/form parser). Setup cost higher on Windows; try fast-check with `fc.json()`/`fc.object()` + huge-string arbitraries first. https://github.com/CodeIntelligenceTesting/jazzer.js , https://gitlab.com/gitlab-org/security-products/analyzers/fuzzers/jsfuzz
7. **Mutation testing** (Stryker) measures test strength, it does not find bugs. Run on small security-critical modules only (cors-origin, entitlements, plan-release). https://stryker-mutator.io/docs/stryker-js/introduction/
8. **Fault injection/chaos**: drop network mid-upload, S3 presign expiry, throw in `chrome.storage`, `MediaRecorder` error events, Polar webhook duplicate/out-of-order (partly covered in packages/billing/test).
9. **Load/soak/spike**: after correctness. https://grafana.com/docs/k6/latest/testing-guides/test-types/
10. **Concurrency/race**: double finalize, parallel upload-session create, quota check-then-insert (TOCTOU).

## 2. Per-component checklists

### 2.1 Extension: page bridge (window.postMessage) and content script
**[code]** `apps/extension/lib/bug-report-debugger/content.ts`: handler checks `event.source !== window`, then `isDebuggerContentBridgePayload(event.data)`, then enqueues `events`. Chrome's own example uses the same `event.source` check and does not discuss `event.origin` (https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts). Because instrumentation runs in the page MAIN world, *any script on the page (third-party, XSS) can post to the same window*, so `event.source === window` proves nothing about the sender. Guidance: https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage#security_concerns , https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/11-Client-side_Testing/11-Testing_Web_Messaging

- [ ] From DevTools console on any page: post a valid bridge shape with forged network events (`url`, `responseBody`). Expected today: accepted into report. Decide if acceptable (integrity of tester-visible data only) or add per-session nonce / MessageChannel handshake.
- [ ] Forged events with `__proto__`, `constructor`, `prototype` keys; ensure `normalize` never merges into prototypes. https://portswigger.net/web-security/prototype-pollution
- [ ] Flood: 100k forged events in a loop; check queue bound, BATCH_SIZE flush timers, content-script memory, `chrome.runtime` message size limit.
- [ ] Huge single field (50 MB string), depth-10k nesting, 1M-element array, throwing getter, mixed types (null, NaN, Infinity, negative/1970/year-3000 timestamps).
- [ ] Extension reloaded/disabled mid-page: `chrome.runtime.sendMessage` throws "Extension context invalidated" inside flush; must not surface unhandled errors in the host page.
- [ ] Host-page robustness: page overrides `fetch`/`XMLHttpRequest`/`JSON.stringify`/`Array.prototype`; strict CSP; sandboxed iframes; `about:blank`/`data:` frames; PDF viewer; `file://`. Instrumentation must never break the host page.
- [ ] Body capture of `fetch(url,{body: ReadableStream|FormData|Blob|URLSearchParams})` must not consume/alter the request and must cap size.

### 2.2 Extension: message passing, storage, manifest
Docs: https://developer.chrome.com/docs/extensions/develop/concepts/messaging , https://developer.chrome.com/docs/extensions/develop/migrate/improve-security , https://developer.chrome.com/docs/extensions/reference/manifest/web-accessible-resources
**[code]** `wxt.config.ts`: permissions `activeTab, scripting, storage, tabCapture, tabs`; `host_permissions: <all_urls>`.
- [ ] Enumerate every `runtime.onMessage` listener (background `engine/background/index.ts`, `use-recording-session.ts`, `use-recorder-recording-sync.ts`, `recorder-submit.ts`). Check `sender.id === chrome.runtime.id` and, for content-script senders, `sender.tab`/`sender.url`. Send crafted messages (unknown `type`, missing fields, other tab's id, huge payload). Expect typed rejection, no cross-tab data, worker survives.
- [ ] Confirm no `externally_connectable` / `onMessageExternal` so websites cannot message the extension.
- [ ] `web_accessible_resources`: inspect built `.output/*/manifest.json`; every entry is fetchable by any page. Verify `matches` is narrow and recorder/popup HTML is not accessible (clickjacking via iframe): `fetch('chrome-extension://<id>/recorder.html')` from a normal page.
- [ ] Extension-page CSP: no `unsafe-eval`, no remote scripts; grep the build for `eval(` / `new Function`.
- [ ] Diagnostics chrome.storage dump export: seed storage with tokens, tester label and captured bodies; confirm export redacts or warns; filename from user input cannot traverse; export cannot be triggered by a web page.
- [ ] chrome.storage quota: fill to limit and assert graceful failure (extend `apps/extension/test/debugger-session-quota.test.ts`).
- [ ] chrome.commands hotkeys in each recorder state and on restricted pages (chrome://, Web Store, PDF viewer, view-source:): must fail with a visible error, not hang.
- [ ] Firefox: `tabCapture` unsupported; verify fallback. moz-extension UUID is random per install.
- [ ] URL building (`apps/extension/test/app-urls.test.ts`): fuzz APP_URL and any `next=`/`returnTo` with `//evil.com`, `/\evil.com`, `javascript:`, `https://app.example.com.evil.com`, `https://app@evil.com`. https://cheatsheetseries.owasp.org/cheatsheets/Unvalidated_Redirects_and_Forwards_Cheat_Sheet.html

### 2.3 Extension: recorder, screenshots, canvas editor
Docs: https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder , https://developer.mozilla.org/en-US/docs/Web/API/URL/revokeObjectURL_static
- [ ] Model-based state machine: events {start, pause, resume, stop, tabClosed, streamEnded, hotkey, popupClosed, submit}; illegal sequences (pause idle, resume twice, stop while paused, start twice, tab navigates/closes, user clicks browser "Stop sharing"). Invariants: `MediaRecorder.state` == UI state; all tracks stopped; no orphan recorder tab.
- [ ] Pause/resume duration math: `durationMs` excludes paused time and matches blob; 500 cycles; system clock change (Markers carry wall-clock + video position per CONTEXT.md).
- [ ] Soak 60 min on a busy page: recorder process memory, chunk array growth (`ondataavailable` without timeslice), blob size vs server 110 MiB cap **[code]**: what does the user see when exceeded?
- [ ] Object URL leaks: grep `createObjectURL`; each needs `revokeObjectURL` on unmount/replace. Spy test over 200 screenshot/crop/re-record cycles asserting balance.
- [ ] Canvas: extreme sizes (8K at DPR 3, 1x1, zero area, negative drag, out-of-bounds), canvas area limits make `toBlob` return null; 10k strokes; huge text; undo/redo x1000. Property tests on `screenshot-edits.ts`: undo(apply(e)) == identity, no NaN coordinates.
- [ ] Obscuring correctness: property test that pixels under an obscure region differ in the *exported* image regardless of later annotations/resizes (privacy claim in CONTEXT.md).
- [ ] Permission denial: picker cancelled, revoked mid-stream, no audio device, DRM black frames.
- [ ] Chaos: stop the MV3 service worker mid-recording (chrome://serviceworker-internals); recorder page must own state.

### 2.4 apps/web: middleware, auth proxy, /rpc proxy
Docs: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html , https://portswigger.net/web-security/cors , https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/11-Client-side_Testing/07-Testing_Cross_Origin_Resource_Sharing
**[code]** `apps/web/middleware.ts`:
- Public check is `pathname.startsWith("/login" | "/register" | "/verify-email" | "/s/" ...)`: **`/login-anything`, `/registerX` are public prefixes.** Test protected paths starting with a public string; encoded/odd variants (`/%73/`, `//s/`, `/./s/`, `/LOGIN`), and `/_next/data/...`.
- Domain gate is `email.endsWith("@medgrocer.com")`: test unverified-email sign-up as `anything@medgrocer.com` (is `emailVerified` enforced?), `x@medgrocer.com.evil.com`, uppercase, `a@b@medgrocer.com`. Sign-up code changed on this branch (`sign-up-form.tsx`, `sign-up-organization.ts`).
- Middleware calls `/api/auth/get-session` via `new URL(path, request.url)` forwarding the cookie: Host / `X-Forwarded-Host` poisoning could redirect the session fetch (SSRF/cookie leak). Test with deployed-like config.
- catch branch redirects to /login (fail-closed): confirm by blocking the auth endpoint. Check `matcher` coverage of `/rpc`, `/api`, assets.
Auth proxy `/api/auth`:
- [ ] Spoofed `X-Forwarded-For/Host/Proto`, `Origin`, duplicate `Cookie` headers through `buildAuthHandlerRequest` (`apps/server/src/build-auth-handler-request.ts`): no IP/origin spoofing of rate-limit or better-auth origin checks. `Set-Cookie` returned with correct Domain/SameSite/Secure/Path.
- [ ] better-auth `trustedOrigins`: `Origin: null` and `https://evil.com` on state-changing auth endpoints must be rejected.
- [ ] `callbackURL`/`redirectTo`/`next` open redirect list (above).
- [ ] Rate limits and account enumeration on sign-in, sign-up, forgot-password. https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/03-Identity_Management_Testing/04-Testing_for_Account_Enumeration_and_Guessable_User_Account
/rpc proxy called with cookies by the extension:
- [ ] Preflight and actual responses from both web proxy and server; who sets CORS?
- [ ] CSRF: HTML form from evil.com POST `text/plain` / urlencoded to a mutating oRPC route. If JSON is parsed regardless of content-type and cookies are `SameSite=None` (cross-site extension use may force that), it is CSRF-able. Check cookie attributes; check no mutation accepts GET.
- [ ] Cookie-authenticated call from a non-allow-listed origin must fail even with a valid body; capture-token/public-key auth vs cookie on the same procedure.

### 2.5 apps/server: CORS with credentials (highest value)
**[code]** `apps/server/src/cors-origin.ts` + `index.ts` (`credentials: true`):
```
OPEN_EMBED_PATHS.has(path) && origin.trim().length>0 -> return origin
EXTENSION_ORIGIN_PREFIXES.some(p => origin.startsWith(p)) -> return origin
```
- **Any** extension origin (`chrome-extension://*`, `moz-extension://*`) is reflected with `Access-Control-Allow-Credentials: true`. A hostile extension with host permission can make credentialed reads/writes as the user (if cookie SameSite allows). Mitigation candidates: allow-list production extension ID(s) (stable via manifest `key`), accept moz-extension only for non-cookie routes. Test: curl with unknown ID -> ACAO must not be reflected.
- `startsWith` also matches `chrome-extension://evil`; validate shape `/^chrome-extension:\/\/[a-p]{32}$/`, `/^moz-extension:\/\/[0-9a-f-]{36}$/`.
- Origins `null`, `"null"`, empty, whitespace, trailing slash, uppercase scheme, `:443`, `https://app.example.com.evil.com`, `https://evilapp.example.com` against `allowedOrigins`. Property test: for random s not in list/prefix/embed path, result === fallback.
- Embed paths reflect any origin by design: credentials/cookies must be ignored there. Path confusion: `/api/embed/capture-token/`, `/../../rpc/x`, `%2e%2e`, `//`, case. `c.req.path` vs router-normalized path mismatch is a classic bypass.
- `Vary: Origin` on allowed, disallowed and non-CORS responses; test A then B to same URL through any cache/CDN. https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Vary
- Preflight: no auth, not counted against user rate limits, sensible `Max-Age`. `fallbackOrigin` must be concrete (never `*` with credentials).
- Refs: https://portswigger.net/web-security/cors , https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS

### 2.6 apps/server + packages/bug-reports: ingestion
**[code]** body cap `MAX_RPC_REQUEST_BODY_BYTES = 110 MiB` is enforced early only when a numeric `content-length` header exists (`index.ts`).
- [ ] Chunked body (no Content-Length) of 500 MB, lying/negative/duplicate Content-Length: is the cap enforced by runtime, or buffered? Watch RSS (Node `http.request` + `write` loop; autocannon cannot do this).
- [ ] JSON: depth 100k, 1M keys, 100 MB string, duplicate keys, `__proto__`, lone surrogates, NUL, BOM, 1e999, 2^53+1; `durationMs` string/float/negative/NaN. Expect fast 4xx, bounded memory/time.
- [ ] Find unbounded arrays in `report-payload-schema.ts` (strings are capped, durationMs <= 24 h **[code]**); push 1M network/console/marker/annotation items.
- [ ] Billing bypass **[code]** `entitlements.ts`: video limit trusts client `payload.metadata.durationMs`. Send `durationMs:1000` with a multi-hour video; spoof kind (`screenshot` + video blob); other tenant's org id; plan downgrade between session create and finalize (TOCTOU); finalize twice; finalize without upload; upload larger than declared; expired/foreign presigned URL. Fix direction: server-derived duration (ffprobe) or per-plan byte cap. https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/10-Business_Logic_Testing/README
- [ ] AuthZ/IDOR: matrix of visibility x role x anonymous x share-token on read/list/delete (extend `read-access-policy.test.ts`); signed URL tampering (byte flip, expiry extension, swapped key) in `signed-url-utils.test.ts`.
- [ ] Server redaction second pass: canary secrets everywhere; check redaction vs truncation order (secret cut in half escapes regex) and vs decoding (URL/base64).
- [ ] Stored XSS: title/description/console message/URL/tester label in web app and `/s/` share page: `<img onerror>`, `javascript:` links, SVG, filename `"><`. https://portswigger.net/web-security/cross-site-scripting/stored
- [ ] Rate limiting (`@upstash/ratelimit`): XFF rotation, IPv6 /64 rotation; behaviour when Redis is down (fail-open vs closed must be deliberate).
- [ ] 500 responses must not leak stack/SQL/S3 keys (`onError` logs only; verify body).

### 2.7 packages/capture-core: redaction, normalization, ReDoS
**[code]** `REDACTABLE_FIELD_PATTERN` (`engine/page/utils.ts:28`): `/((?:access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|client[_-]?secret|password|passwd|pwd|authorization|cookie|session[_-]?id)\s*[:=]\s*)([^&\s",;]+)/gi`.
**[verified]**:
- `authorization: Bearer abc.def` -> `authorization: [R] abc.def`: only the scheme word is redacted, **the token leaks** on any path using this regex (free text, bodies, URLs).
- `{"password":"hunter2"}` unchanged by this regex (the `"` before `:` breaks the match); confirm structured JSON redaction covers it elsewhere.
Recall (leak) tests, table-driven + property-based: key variants (`Api-Key`, `apiKey`, `x_auth_token`, `secret`, `private_key`, `jwt`, `bearer`), values with spaces/quotes/percent-encoding/unicode, URL userinfo (`https://u:pw@host`), fragments (`#access_token=`), nested JSON arrays, multipart parts, base64 JSON, `Set-Cookie`, GraphQL variables, DSNs, WebSocket frames, `console.log(obj)` serialisations, error stacks. Oracle: seed `CANARY_<random>` in each position and grep the serialized report.
Metamorphic: `redact(redact(x)) === redact(x)`; JSON stays valid; non-secret text unchanged.
ReDoS methods (https://owasp.org/www-community/attacks/Regular_expression_Denial_of_Service_-_ReDoS):
1. Static: `recheck` over every regex literal in `packages/capture-core/src` and `packages/bug-reports/src`; fail on `vulnerable`. Note it returned `unknown` for the big pattern above.
2. Dynamic: `"password=".repeat(n)`, `"password:" + " ".repeat(n)`, `"a".repeat(n)` for n=1e3..1e6; assert ~linear (n x10 -> time x<=15). `\s*[:=]\s*` is a polynomial risk with long whitespace.
3. Input cap must happen *before* regexing on every path (`truncate`/MAX_TEXT_LENGTH exists); test headers and multipart too.
4. 50 MB body in the page context blocks the main thread: budget <50 ms per 1 MB.
Normalization (`normalize.ts`): `normalize(arbitraryJson)` never throws, output conforms to payload type, size <= caps, idempotent.

### 2.8 apps/qa-fixtures (absent here; test on merge)
- [ ] `?ms=`: cap (negative, NaN, `1e9`, `0x10`, repeated params). 5k concurrent `?ms=30000` exhausts sockets/memory; cap at ~10 s and global in-flight limit. https://owasp.org/www-community/attacks/Denial_of_Service
- [ ] Reflected XSS in any echo (error pages): `<script>`, `"><svg onload=1>`, `</title>`; explicit charset, `X-Content-Type-Options: nosniff`. https://portswigger.net/web-security/cross-site-scripting/reflected
- [ ] Header injection: query values echoed into headers/`Location` with `%0d%0a`; assert rejection. https://owasp.org/www-community/vulnerabilities/CRLF_Injection
- [ ] Fake secrets obviously fake and not matching real provider patterns (push protection).
- [ ] Never set cookies with a Domain broader than the fixtures host (could shadow real session cookies); bind 127.0.0.1 by default; Host/DNS-rebinding check.

### 2.9 .github/workflows
Docs: https://docs.github.com/en/actions/reference/security/secure-use , https://securitylab.github.com/resources/github-actions-preventing-pwn-requests/ , https://securitylab.github.com/resources/github-actions-untrusted-input/
**[code]** (grep): `changelog.yml` uses `github.head_ref`/labels (BASE_REF via env: good); `extension-release.yml` feeds `inputs.tag`/`github.ref_name` into `RELEASE_TAG` env then plan script, and interpolates `steps.plan.outputs.*` inside `run:` (`cp ... "${{ steps.plan.outputs.notes_path }}"`); `docker-publish.yml` pushes with `GITHUB_TOKEN`, `cache-to: type=gha,mode=max`. No `pull_request_target` found.
- [ ] Run `actionlint` and `zizmor` first (section 3).
- [ ] Script injection: any `${{ github.head_ref | pull_request.title | inputs.* | ref_name | steps.*.outputs.* }}` inside `run:`/`github-script` must go through `env:` and be quoted. Sandbox repo test: branch/tag/label named `a";echo pwned;"`, `` $(id) ``, leading `-`. Docs recommend intermediate env vars.
- [ ] plan-release.ts: tags `v1.2.3; rm`, `v1.2.3-../..`, `refs/tags/..`, `v01.2.3`, `v1.2.3+build`, newline in values (`$GITHUB_OUTPUT` injection can add extra outputs), huge, unicode, weird `prerelease/vX.Y.Z` suffix. Property: output matches `^[A-Za-z0-9._-]+$`, no newline.
- [ ] Keep `pull_request_target`/`workflow_run` out; add CI guard `grep -rn pull_request_target .github`. If ever added: never check out PR head with secrets; treat artifacts from PR runs as untrusted (Security Lab).
- [ ] `permissions:` default `contents: read` in all 6 workflows, write scopes per job; repo setting "read" default.
- [ ] Actions pinned to full commit SHA; Dependabot for actions; `persist-credentials: false` on checkout when not pushing.
- [ ] Cache poisoning: do release/publish jobs restore caches (bun, `type=gha`) that branch PRs can write? Use separate keys/no cache for release; `bun install --frozen-lockfile`.
- [ ] Artifact poisoning: release job downloads only same-run artifacts; publish sha256 in notes.
- [ ] Tag/branch protection: who can push `v*`/`prerelease/*`; hotfix environment must restrict deployment branches/tags so a branch-edited workflow cannot bypass approval; secrets only in the environment.
- [ ] Changelog script: branch names with spaces, unicode, leading dash (option injection into git/gh), 255 chars.

## 3. Tooling verdicts (verified here unless noted)

| Need | Verdict | Evidence |
|---|---|---|
| fast-check under `bun test` | **Works** | `fc.assert(fc.property(...))` in `bun:test`: 2 pass; failing property throws. |
| StrykerJS with Bun | **Works only via `command` runner** (no bun plugin). No per-test coverage so whole suite runs per mutant: scope `mutate` to 1-3 files. | `@stryker-mutator/core@10.0.0` + `commandRunner.command = "bun test"` killed 2/2 mutants on a toy file in 6 s. Docs: command runner has no coverage analysis https://stryker-mutator.io/docs/stryker-js/configuration/ |
| ReDoS checker | **`recheck` works under Node.** Prints `Invalid or corrupt jarfile ... recheck-jar` noise then falls back to its JS engine: `^(a+)+$` vulnerable/exponential, `^[a-z]+$` safe/linear. Under Bun 1.3.14 a run with an options argument **crashed Bun**; use `node script.mjs` and default options. Complex capture regex returned `unknown`: supplement with dynamic timing (2.7). Alternative: `redos-detector`. https://makenowjust-labs.github.io/recheck/ | |
| Load, no Docker | `autocannon` via bun **works** (v8.0.0). `oha`: `winget install hatoo.oha` (winget lists 1.16.0; not installed) or release exe https://github.com/hatoo/oha/releases . `k6`: `winget install k6 --source winget` or MSI https://dl.k6.io/msi/k6-latest-amd64.msi (docs verified, not installed). | |
| Fuzzing | `jsfuzz` is pure JS (lowest friction). Jazzer.js needs a native addon build on Windows: not tried, use WSL if wanted. Prefer fast-check first. | |
| Workflow lint | `actionlint` (`winget install rhysd.actionlint`) and `zizmor` (`uvx zizmor .github/workflows`) - not run here. https://github.com/zizmorcore/zizmor | |

Commands (repo root):
```
bun add -d fast-check --cwd packages/capture-core
bun test packages/capture-core/test

# mutation, inside apps/server: stryker.conf.json
# {"testRunner":"command","commandRunner":{"command":"bun test test/cors-origin.test.ts"},
#  "mutate":["src/cors-origin.ts"],"coverageAnalysis":"off","reporters":["clear-text","html"],"disableTypeChecks":true}
bun add -d @stryker-mutator/core
bunx stryker run

# ReDoS (Node, not Bun): scripts/redos-scan.mjs does: import {check} from "recheck"; await check(src, flags)
bun add -d recheck
node scripts/redos-scan.mjs

# load (replace route with a real one)
bunx autocannon -c 50 -d 30 -m POST -H "content-type: application/json" -b "{}" http://localhost:3000/rpc/health
winget install hatoo.oha ; oha -z 30s -c 200 http://localhost:3000/health
winget install k6 --source winget ; k6 run --vus 100 --duration 60s load.js

# CORS probes
curl -i -X OPTIONS http://localhost:3000/rpc/x -H "Origin: chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" -H "Access-Control-Request-Method: POST"
curl -i http://localhost:3000/rpc/x -H "Origin: null"

# workflows
winget install rhysd.actionlint ; actionlint ; uvx zizmor .github/workflows
```
Load notes: autocannon https://github.com/mcollina/autocannon ; k6 test types https://grafana.com/docs/k6/latest/testing-guides/test-types/ ; oha https://github.com/hatoo/oha . Mock Upstash/Polar/S3 or use dev resources; never load-test Vercel prod.
Windows/Bun notes: repo uses happy-dom (`happydom.ts`, `preload-dom.ts`), which lacks `MediaRecorder`, canvas `toBlob` and `chrome.*`: stub, or use Playwright persistent context with `--load-extension` for real extension tests (Chromium only) https://playwright.dev/docs/chrome-extensions .

## 4. Round 2: top 25 tests
Effort: S <1 h, M 1-3 h, L half day+.

| # | Component | Technique | Test | Failure signal | Effort |
|---|---|---|---|---|---|
| 1 | server CORS | Error guessing + property | `resolveCorsOrigin` with unknown extension IDs, `chrome-extension://x`, `null`, empty, lookalikes; credentialed curl | ACAO reflected for arbitrary extension with credentials | S |
| 2 | server CORS | Differential | Origin A then B on same URL via cache/Vercel preview; check `Vary: Origin` | Missing Vary / wrong ACAO served | S |
| 3 | server/web | CSRF attack | Cross-site `text/plain` form POST to mutating `/rpc` with cookie; inspect SameSite | 2xx without preflight | M |
| 4 | server embed paths | Path confusion | `/api/embed/capture-token/../..`, encoded, `//` with arbitrary Origin | Cookie-auth route reachable with reflected origin | S |
| 5 | bug-reports billing | Business-logic attack | `durationMs:1` with long real video; `screenshot` kind with video blob | Upload accepted beyond plan | M |
| 6 | server ingestion | Stress/negative | Chunked 500 MB body without Content-Length; monitor RSS | Memory spike / accepted past 110 MiB | M |
| 7 | server ingestion | Fuzz/negative | JSON bombs: depth 100k, 1M keys, `__proto__`, unbounded arrays | 500/timeout/OOM instead of fast 4xx | M |
| 8 | capture-core redaction | Metamorphic + canary | Canary secrets in 20 positions incl. `Authorization: Bearer x` | Canary present (Bearer leak **[verified]**) | M |
| 9 | capture-core redaction | Property | Idempotence, JSON validity, non-secret unchanged (fast-check) | Shrunk counterexample | M |
| 10 | capture-core regexes | ReDoS static+dynamic | `recheck` all regexes + n-scaling timing | `vulnerable` or superlinear growth | S |
| 11 | server vs capture-core | Differential | Same payload through both redaction passes | Divergent outputs | M |
| 12 | web middleware | Error guessing | `/login-x`, `/s/..`, encoded, case variants; unverified `@medgrocer.com` sign-up | Protected content served / gate bypass | M |
| 13 | web auth proxy | Attack | Spoofed `X-Forwarded-*`/`Host`/`Origin: null`; `callbackURL=//evil.com` | Rate-limit spoof, open redirect, cross-origin sign-in | M |
| 14 | extension bridge | Attack | Console-forged events, 100k flood, proto keys | Forged data accepted w/o nonce; memory growth; pollution | M |
| 15 | extension messaging | Attack | Crafted `runtime.sendMessage` per handler | Handler acts without sender check; worker dies | L |
| 16 | extension manifest | Static review | Built manifest: WAR, CSP, no externally_connectable; fetch WAR from page | Recorder/popup fetchable or iframable by sites | S |
| 17 | extension recorder | Model-based | fast-check commands incl. tab-close, stream-ended | Illegal state; leaked tracks/recorders | L |
| 18 | extension recorder | Soak | 60 min + 100 pause/resume; memory; duration vs blob | Linear memory growth; duration drift; upload crash | L |
| 19 | extension canvas | Boundary + resource | Huge/zero/negative crop, 8K DPR3, 10k annotations, `toBlob` null | Unhandled null/NaN, OOM, silent blank export | M |
| 20 | extension blobs | Leak test | Spy `createObjectURL` vs `revokeObjectURL` over 200 captures | Unbalanced counts | S |
| 21 | CI workflows | Static + injection | actionlint + zizmor; sandbox branch/tag `a";id;"`; label; `\n` in plan outputs | Command runs / extra output / unpinned actions | M |
| 22 | plan-release.ts | Property | Random tag/branch -> whitelist regex, no newline | Metachar in output or unhandled throw | S |
| 23 | CI cache/artifact | Review + experiment | Does release restore caches PR branches can write? gha cache scope | Release built from branch-writable cache | M |
| 24 | rate limiting | Fault injection + stress | Break Upstash URL; XFF rotation with oha 200 conns | Silent fail-open / bypass | M |
| 25 | test strength | Mutation | Stryker (command) on `cors-origin.ts`, `entitlements.ts`, `plan-release.ts` | Surviving mutants = untested branches; target >=90% | M |

Order: 1-5, 8, 10, 12, 16, 21 first (cheap, high severity), then 6, 7, 14, 22, 25, then the rest. Each finding becomes a `bun test` regression test in the nearest `test/` folder with the attack string as fixture.

## Caveats
- Most issues above are candidates from code reading, not confirmed exploits; only items marked **[verified]** and the tool verdicts were executed.
- The extension-origin CORS reflection may be a deliberate trade-off (Firefox UUID per install); decide whether cookie-authenticated routes may accept any extension origin.
- Fetched and read this session: Stryker configuration, GitHub secure-use, Security Lab pwn requests, Chrome content-scripts, k6 install docs. Other URLs are standard primary docs but were not re-fetched.
