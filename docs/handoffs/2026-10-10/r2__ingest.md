# Handoff: r2/ingest (round-2 ingestion attack/stress testing)

- **Head:** c39277b, 4 commits on r2-int 7c22896. Local; pushed to origin for reference only. Route the commits; don't PR the branch.
- **Worktree:** crikket-r2-ingest.

## Commits and routing
| SHA | Subject | Owner | Notes |
|---|---|---|---|
| 5dce84b | enforce the RPC body cap while streaming, not only via Content-Length | new-hardening | **I1** (high DoS). `apps/server/src/rpc-body-limit.ts` (`hono/body-limit` on `/rpc/*`). A 1000 MB chunked body was buffered (RSS 420 MB→1.7 GB). Test: `test/rpc-body-limit.test.ts`. The red evidence was a manual measurement, not a test run against the old code |
| 1cbce61 | bound the stored and decompressed debugger payload size | new-hardening | **I2** (high DoS): gzip bomb in `ingestion-jobs.ts` (a 261 KB file inflated to 256 MB). New `packages/bug-reports/src/lib/debugger-payload.ts`, 64 MB cap |
| 0b556db | stop echoing internal error messages from capture routes | new-hardening | **I3** (medium info leak): `apps/server/src/capture/shared.ts` returned raw SQL/S3 messages |
| c39277b | kill surviving entitlement mutants | feature/pause-resume-recording | **I9**: Stryker on video-duration.ts went from 94.3% to 98.1% |

- **Routing:** new-hardening commits go on a new 0.3.0 branch, for example feature/ingestion-limits, with a Changelog line. c39277b squashes into #20.

## Reported only (decisions or follow-ups)
- **I4, BLOCKER for #50:** the server redaction pass has no CPU budget (about 117 s for 2000 items with 3000-key metadata). Details and the fix are in feature__harden-redaction.md.
- **I5:** entitlements are checked only at upload-session create, not at finalize, so a plan downgrade inside the 24 h TTL is not re-checked. Finalize could re-run `assertCreateBugReportEntitlements`.
- **I6:** presigned PUTs have no byte cap, and `captureSizeBytes`/`debuggerSizeBytes` at finalize are client-reported and unverified. Recommendation:
  - a per-plan byte cap, checked at finalize with a HEAD, deleting over-cap objects;
  - presigning with a fixed ContentLength.
  This also mitigates the documented "server can't know true video length" limit.
- **I7:** a concurrent finalize can't create duplicates (a PK violation rolls it back). The loser gets a generic 500 now; arguably it should be a 409. A post-commit failure leaves `submissionStatus=processing`; orphan cleanup is assumed, untested.
- **I8:** no stored XSS. There is no dangerouslySetInnerHTML or markdown, and fields render as text. `z.string().url()` allows `javascript:`, but no href is built from report data; an https-only refinement would be cheap insurance.

## Not tested
JSON-bomb fuzz (depth, key count, `__proto__`; only the schema was read), a live DB race, the autocannon load/soak test, and browser rendering.

## Suggested skills
- mattpocock-skills:diagnosing-bugs: build red loops for I1/I2 against the old code before merging the fixes.
- security-review
- mattpocock-skills:tdd
