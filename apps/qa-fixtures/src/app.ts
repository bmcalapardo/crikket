import { Hono } from "hono"
import {
  FAKE_COOKIE_NAME,
  FAKE_COOKIE_VALUE,
  FAKE_TOKEN,
  FORM_FAILURE_BODY,
  NETWORK_500_BODY,
  parseSlowMs,
} from "./fixtures"
import {
  brokenImagePage,
  consoleErrorPage,
  formFailurePage,
  indexPage,
  longPage,
  network500Page,
  sensitivePage,
  slowPage,
  workingPage,
} from "./pages"

export interface AppOptions {
  // Injected so tests can assert the requested delay without waiting for it.
  sleep?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

export function createApp(options: AppOptions = {}) {
  const sleep = options.sleep ?? defaultSleep
  const app = new Hono()

  // Never cache: every scenario must behave the same on every load.
  app.use("*", async (c, next) => {
    await next()
    c.header("cache-control", "no-store")
  })

  app.get("/", (c) => c.html(indexPage()))
  app.get("/healthz", (c) => c.json({ ok: true }))

  app.get("/scenarios/working", (c) => c.html(workingPage()))
  app.get("/scenarios/console-error", (c) => c.html(consoleErrorPage()))
  app.get("/scenarios/network-500", (c) => c.html(network500Page()))
  app.get("/scenarios/slow", (c) =>
    c.html(slowPage(parseSlowMs(c.req.query("ms"))))
  )
  app.get("/scenarios/broken-image", (c) => c.html(brokenImagePage()))
  app.get("/scenarios/form-failure", (c) => c.html(formFailurePage()))
  app.get("/scenarios/long-page", (c) => c.html(longPage()))
  app.get("/scenarios/sensitive", (c) => {
    c.header(
      "set-cookie",
      `${FAKE_COOKIE_NAME}=${FAKE_COOKIE_VALUE}; Path=/; SameSite=Lax`
    )
    return c.html(sensitivePage())
  })

  app.all("/api/error", (c) => c.json(NETWORK_500_BODY, 500))

  app.all("/api/slow", async (c) => {
    const ms = parseSlowMs(c.req.query("ms"))
    await sleep(ms)
    return c.json({ ok: true, delayedMs: ms })
  })

  app.post("/api/form", (c) => c.json(FORM_FAILURE_BODY, 422))

  app.post("/api/sensitive", (c) => {
    c.header(
      "set-cookie",
      `${FAKE_COOKIE_NAME}=${FAKE_COOKIE_VALUE}; Path=/; SameSite=Lax`
    )
    return c.json({ ok: true, access_token: FAKE_TOKEN })
  })

  app.get("/assets/missing.png", (c) => c.body("Not found", 404))

  return app
}
