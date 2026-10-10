# Hardening brief: negative, attack and stress testing for one issue branch

A different agent just implemented a GitHub issue on this branch and pushed it. Your job is to make it
robust and reliable: be adversarial, find where it breaks, prove it with tests, and fix it. Read
`brief-implement.md` (same folder as this file) first: every workspace, git, changelog, commit, port
and EOL-noise rule there applies to you too.

## Scope
- Review ONLY the branch's single commit: `git show <parent>..HEAD` (parent ref is in your prompt),
  against the issue (`gh issue view <N>`) and its PRD section (`docs/crikket-upgrades/PRD.md`).
- First check spec compliance: is every acceptance criterion actually met, and do the tests really
  prove it? Missing or faked criteria are the highest-severity findings.

## Research (required)
Use WebSearch/WebFetch (load them via ToolSearch: `select:WebSearch,WebFetch`) to check the platform
APIs and techniques the change relies on against PRIMARY sources: MDN, Chrome extension docs
(developer.chrome.com), Firefox extension docs (extensionworkshop.com / MDN WebExtensions), WHATWG and
W3C specs, the library's own docs or issue tracker, GitHub Actions docs. Look for documented
limits, quotas, rate limits, browser differences, known bugs and security pitfalls that apply. Every
pitfall you find must either become a test or a code fix, or be stated as a documented limitation.
Mention the most important sources (URLs) in your final report.

## Attack it
Write tests that try to break the change. Consider whichever of these apply:
- **Negative inputs:** malformed, empty, missing, wrong-typed, oversized, unicode/RTL, NaN/Infinity,
  negative, out-of-range, duplicate and stale (expired) data. Also hostile strings: script/HTML
  injection, path traversal, prototype-pollution keys such as `__proto__`.
- **Failure paths:** network errors, rejected promises, storage quota exceeded, IndexedDB blocked or
  aborted, permission denied, tab closed mid-operation, extension context invalidated, server
  4xx/5xx, timeouts, partial writes.
- **Concurrency and races:** double-clicks, rapid repeated commands, overlapping async operations,
  unmount mid-flight, interleaved events, re-entrancy.
- **Stress:** large volumes (thousands of annotations, huge pages, long recordings, many drafts),
  repeated cycles (memory and listener leaks, object-URL leaks), boundary sizes. Assert bounded
  time/memory where it matters, but make every timing assertion robust under heavy CPU load
  (warm-up, generous ceilings, best-of-N), since the suite runs with many agents in parallel.
- **Security and privacy:** leaking secrets or PII, obscured pixels being recoverable, unvalidated
  data crossing a trust boundary (content script → extension → server), CSP, schema strictness.
- **Fuzz/property tests** for pure logic (seeded PRNG, so failures are reproducible).

Tests must be deterministic: seeded randomness, no fixed sleeps, and condition waits via
`apps/extension/test/wait-for.ts`.

## Fix
Fix every real defect you find, with a regression test. Don't gold-plate; refactor only where
needed for correctness. If a fix is out of this issue's scope (a pre-existing bug elsewhere), don't
fix it; list it in your report instead.

## Finish
- Fold everything into the branch's SINGLE commit: `git commit --amend`. Keep the subject. Add a
  short "Hardening:" paragraph to the body summarising what was tested and fixed, and keep the
  Co-Authored-By trailer last. The pre-commit hook must pass (full build + tests).
- `git rev-list --count <parent>..HEAD` must print 1.
- `git push --force-with-lease origin <branch>`.

## Final report (under about 450 words)
- Branch, new SHA, count check, push result.
- Defects found and fixed, by severity, each with its regression test.
- Negative, stress and fuzz tests added: what each covers.
- Research sources and the pitfalls they surfaced.
- Remaining risks and limitations, plus out-of-scope bugs you found.
