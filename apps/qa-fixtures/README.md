# QA fixtures

A deliberately broken site to point Crikket at. Testers use it by hand and automated E2E uses it for assertions. Every problem is deterministic: the same URL gives the same failure on every load.

It is private, never published to npm or the extension stores, and not part of the SDK or extension builds.

## Stack

A tiny [Hono](https://hono.dev) app on Bun, with server-rendered HTML strings and no client framework or build tooling. Hono is already a repo dependency (`apps/server`) and runs unchanged on Bun, Docker and Vercel, and plain HTML keeps the page content (console output, requests, DOM) exactly what the tests say it is.

## Run it

```bash
bun run --filter qa-fixtures dev     # http://localhost:4100
PORT=5000 bun run --filter qa-fixtures start
bun run --filter qa-fixtures test
```

## Scenarios

| Page | What it does | Expected report evidence |
| --- | --- | --- |
| `/scenarios/working` | Counter button, no errors | Clean report (control) |
| `/scenarios/console-error` | One `console.error` on load | Exactly one console error: `[qa-fixtures] intentional console error: this is a known-bad page` |
| `/scenarios/network-500` | Fetches `/api/error` on load | A failed request, status 500 |
| `/scenarios/slow` | Fetches `/api/slow?ms=N` on load | A request taking about N ms. Default 3000, capped at 10000; bad values use the default |
| `/scenarios/broken-image` | `<img src="/assets/missing.png">` | A 404 request |
| `/scenarios/form-failure` | Submit the form | `POST /api/form` returns 422 and the error shows on the page |
| `/scenarios/long-page` | 20 sections of 600px | A 12000px content block (`#long-content`), for scroll-and-stitch |
| `/scenarios/sensitive` | Fake token, cookie and password | See below |

The API routes can also be hit directly: `/api/error`, `/api/slow`, `/api/form` (POST), `/api/sensitive` (POST), `/assets/missing.png`, and `/healthz`.

### Sensitive data

The page sets the cookie `qa_session_token`, has a password field prefilled with a fake password, logs lines containing a fake token and password to the console, and POSTs to `/api/sensitive?api_key=...` with an `Authorization: Bearer` header and a password in the body. Open the resulting report: none of these values may appear:

- `qa-fixture-fake-token-do-not-use`
- `qa-fixture-fake-session-do-not-use`
- `qa-fixture-fake-password-do-not-use`
- `qa-fixture-fake-apikey-do-not-use`

The values are plainly fake and match no real provider token format. A test runs the fixture's traffic through the Redaction module (`@crikket/capture-core/debugger/redaction`) and fails if any survive. Redaction covers debugger data only, not screenshots, so the password field is still visible in a screenshot.

## Deploy per channel

Each Channel (Alpha, Beta, Stable) gets its own deployment so testers can point a build at the matching fixture site.

**Vercel**: create one project per channel from this repo, with Root Directory `apps/qa-fixtures` (the included `vercel.json` handles install, build and routing), and assign a domain per channel, for example `qa-alpha.example.com`. No environment variables are needed. Deploy only when this app changes (Ignored Build Step, or leave on for every push; the app is tiny).

**Docker**: build from the repo root and run on port 4100:

```bash
docker build -f apps/qa-fixtures/Dockerfile -t crikket-qa-fixtures .
docker run --rm -p 4100:4100 crikket-qa-fixtures
```

The image is not published by CI; build it where you need it.
