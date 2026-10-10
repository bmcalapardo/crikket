# Handoff: feature/harden-redaction (PR #50, closes #26)

- **Head:** origin 6e870c3, one commit on prerelease/v0.2.0 (07bcc63). The local ref (a608846) is stale; never push it.
- **PR:** https://github.com/bmcalapardo/crikket/pull/50, base prerelease/v0.2.0.
- **Status: BLOCKED. Do not merge until I4 is fixed.**

## What it does
One DOM-free Redaction module, `packages/capture-core/src/debugger/redaction.ts`. It is used by page instrumentation (`engine/page/**`), by `normalizeDebuggerEvent` (`debugger/normalize.ts`), and by a NEW server-side pass in `packages/bug-reports/src/lib/{debugger,debugger-items}.ts` (`parseDebuggerData`) before persistence. Masks, never drops. Full rationale is in the commit message (`git log -1 6e870c3`) and the PR body.

## Round 1 (done, already in 6e870c3)
- **Vercel server build:** the `./debugger/redaction` export in `packages/capture-core/package.json` now points at `src/` (Vercel builds apps/server without building workspace dist).
- **Flaky timing test:** the oversized-body test in `normalize.test.ts` was deflaked.
- **Leaks fixed:** 9 leaks (JWT, URL-only secret params, userinfo, percent-encoded names, multipart, multi-pair Cookie, lowercase bearer), plus multipart `--` value lines.
- **Durable tests:** `test/redaction-leaks.test.ts`, a 3000-payload seeded fuzz and a backtracking guard.

## BLOCKER: I4 server redaction-pass CPU DoS (from r2/ingest; not fixed)
- **Symptom:** `parseDebuggerData` runs synchronously, inline in finalize. 2000 log items with 3000-key metadata of 200-char strings took **about 117 s**. Network items with max bodies and 200 headers took about 9.8 s.
- **Cause:** `debuggerMetadataSchema = z.record(z.string(), z.unknown())` is unbounded in keys, depth and string length. Header maps are unbounded too, and there is no total budget.
- **Fix to implement (test-first):**
  - bound the metadata to about 50 keys and about 2 KB per string, with a depth limit;
  - bound header entry counts;
  - add a total item-bytes budget per payload, rejecting with a 4xx;
  - optionally move the pass off the request path.
- **Red loop:** a bun test calling `parseDebuggerData` with 2000 items × 3000-key metadata, asserting it rejects fast (under about 1 s). The scratch bench was deleted, so rebuild it from this description.

## Round 2: fold in (Owner: feature/harden-redaction)
- **r2/redact d9732a1** `app(fix): close five redaction leaks found by round 2 canary testing`. Each has a regression test in `redaction-leaks.test.ts`:
  - R1: `redis://:SECRET@h` (the userinfo regex required a user);
  - R2: escaped JSON inside strings (console messages);
  - R3: a truncated JWT kept its payload;
  - R4: `passphrase`/`bearer`/exact `auth` keys;
  - R5: a secret inside a percent-encoded param value.
- **r2/redact 627ae08** `test(capture-core): pin redaction edge cases found by mutation testing` (`test/redaction-edges.test.ts`, 24 tests). The Stryker score on redaction.ts went from 65.4% to 86.0%.
- **How to fold in:**
  1. Make a detached worktree at origin/feature/harden-redaction.
  2. `git cherry-pick d9732a1 627ae08`.
  3. Commit the I4 fix test-first.
  4. `git reset --soft 07bcc63`, then commit with the original message (`git commit -C 6e870c3`) plus a paragraph on R1-R5 and I4.
  5. Force-push with `--force-with-lease=feature/harden-redaction:6e870c3`.
  6. Update the PR body's testing section.

## Reported only (document as "conservative, not guaranteed")
See r2__redact.md for the full list: unusual names (credentials, otp, pin, cvv…), XML bodies, `curl -u`, path-embedded tokens, short truncations of a Bearer token or userinfo, zero-width characters in keys. From r2/ext:
- the page-side queue (`engine/page/event-queue.ts`) is unbounded;
- request-body capture (`engine/page/network/fetch/context.ts`) buffers the whole body before truncating, which is a memory cost only.

## Not done
Stryker on normalize.ts, a `recheck` static ReDoS scan (dynamic n-scaling showed everything linear), and a fast-check property suite.

## Merge notes
- **Merge last** among the 0.2.0 PRs.
- **After merge,** existing worktrees need `bun install` (the new bug-reports → capture-core dependency).

## Suggested skills
- mattpocock-skills:diagnosing-bugs: build the I4 red loop first.
- mattpocock-skills:tdd
- security-review
- mattpocock-skills:code-review
