import { describe, expect, test } from "bun:test"
import { createApp } from "../src/app"
import {
  CONSOLE_ERROR_MESSAGE,
  DEFAULT_SLOW_MS,
  FORM_FAILURE_BODY,
  LONG_PAGE_HEIGHT_PX,
  LONG_PAGE_SECTION_COUNT,
  MAX_SLOW_MS,
  NETWORK_500_BODY,
  parseSlowMs,
} from "../src/fixtures"
import { SCENARIOS } from "../src/pages"

const REPEAT = 100
const SCRIPT_PATTERN = /<script>([\s\S]*?)<\/script>/
// Looped tests do 100 full page loads each; give slow CI machines headroom.
const LOOP_TIMEOUT_MS = 30_000
const noSleep = () => Promise.resolve()

function inlineScript(html: string): string {
  return SCRIPT_PATTERN.exec(html)?.[1] ?? ""
}

// Runs a page's own inline script against a recording console and a fetch
// that is wired to the app, so the test exercises exactly what ships.
async function runPage(path: string) {
  const app = createApp({ sleep: noSleep })
  const html = await (await app.request(path)).text()
  const logs = { error: [] as string[], log: [] as string[] }
  interface FakeElement {
    addEventListener: () => void
    textContent: string
  }
  const elements = new Map<string, FakeElement>()
  const element = (id: string) => {
    if (!elements.has(id)) {
      elements.set(id, { textContent: "", addEventListener: () => undefined })
    }
    return elements.get(id) as FakeElement
  }
  const pending: Promise<unknown>[] = []
  const fakeFetch = (url: string, init?: RequestInit) => {
    const request = Promise.resolve(app.request(url, init))
    pending.push(request)
    return request
  }
  const fakeDocument = { getElementById: element }
  new Function("console", "document", "fetch", inlineScript(html))(
    {
      error: (message: string) => logs.error.push(message),
      log: (message: string) => logs.log.push(message),
    },
    fakeDocument,
    fakeFetch
  )
  await Promise.all(pending)
  await new Promise((resolve) => setImmediate(resolve))
  return { html, logs, element }
}

describe("scenario index", () => {
  test("lists every scenario and each one serves a page", async () => {
    const app = createApp({ sleep: noSleep })
    const index = await (await app.request("/")).text()
    expect(SCENARIOS).toHaveLength(8)
    for (const scenario of SCENARIOS) {
      expect(index).toContain(`href="${scenario.path}"`)
      const response = await app.request(scenario.path)
      expect(response.status).toBe(200)
      expect(response.headers.get("cache-control")).toBe("no-store")
    }
  })
})

describe("working UI", () => {
  test("loads with no console errors", async () => {
    const { html, logs } = await runPage("/scenarios/working")
    expect(html).toContain('id="counter"')
    expect(logs.error).toEqual([])
  })
})

describe("console error", () => {
  test(
    "fires exactly one console.error per load",
    async () => {
      for (let i = 0; i < REPEAT; i++) {
        const { logs } = await runPage("/scenarios/console-error")
        expect(logs.error).toEqual([CONSOLE_ERROR_MESSAGE])
      }
    },
    LOOP_TIMEOUT_MS
  )

  test("no other scenario logs a console.error", async () => {
    for (const scenario of SCENARIOS) {
      if (scenario.slug === "console-error") {
        continue
      }
      const { logs } = await runPage(scenario.path)
      expect(logs.error).toEqual([])
    }
  })
})

describe("network 500", () => {
  test("the route returns 500 with the same body every time", async () => {
    const app = createApp()
    for (let i = 0; i < REPEAT; i++) {
      const response = await app.request("/api/error")
      expect(response.status).toBe(500)
      expect(await response.json()).toEqual(NETWORK_500_BODY)
    }
  })

  test("the page requests it on load and shows the status", async () => {
    const { element } = await runPage("/scenarios/network-500")
    expect(element("result").textContent).toBe("Response status: 500")
  })
})

describe("slow request", () => {
  test("delays by the ?ms= value, defaulting to a fixed time", async () => {
    const delays: number[] = []
    const app = createApp({
      sleep: (ms) => {
        delays.push(ms)
        return Promise.resolve()
      },
    })
    await app.request("/api/slow")
    await app.request("/api/slow?ms=250")
    expect(delays).toEqual([DEFAULT_SLOW_MS, 250])
  })

  test("really waits for the requested time", async () => {
    const app = createApp()
    const start = performance.now()
    const response = await app.request("/api/slow?ms=200")
    const elapsed = performance.now() - start
    expect(response.status).toBe(200)
    expect(elapsed).toBeGreaterThanOrEqual(150)
    expect(elapsed).toBeLessThan(1000)
  })

  test("the page requests the same delay it was given", async () => {
    const { html, element } = await runPage("/scenarios/slow?ms=1234")
    expect(html).toContain("/api/slow?ms=1234")
    expect(element("result").textContent).toBe("Response status: 200")
  })
})

describe("slow request input handling", () => {
  test("caps huge delays instead of hanging", async () => {
    const delays: number[] = []
    const app = createApp({
      sleep: (ms) => {
        delays.push(ms)
        return Promise.resolve()
      },
    })
    for (const ms of ["999999999", "99999999999999", "10001"]) {
      await app.request(`/api/slow?ms=${ms}`)
    }
    // Over-long digit strings are malformed, so they fall back to the default.
    await app.request(`/api/slow?ms=${"9".repeat(500)}`)
    expect(delays).toEqual([
      MAX_SLOW_MS,
      MAX_SLOW_MS,
      MAX_SLOW_MS,
      DEFAULT_SLOW_MS,
    ])
    expect(Math.max(...delays)).toBeLessThanOrEqual(MAX_SLOW_MS)
  })

  test("malformed values fall back to the default", () => {
    const malformed = [
      "",
      "abc",
      "-5",
      "1.5",
      "1e9",
      "NaN",
      "Infinity",
      "0x10",
      " 5",
      "5 ",
      "+5",
      "5; drop",
      "\u0000",
    ]
    for (const raw of malformed) {
      expect(parseSlowMs(raw)).toBe(DEFAULT_SLOW_MS)
    }
    expect(parseSlowMs(null)).toBe(DEFAULT_SLOW_MS)
    expect(parseSlowMs(undefined)).toBe(DEFAULT_SLOW_MS)
    expect(parseSlowMs("0")).toBe(0)
  })

  test("repeated or odd query params never throw", async () => {
    const app = createApp({ sleep: noSleep })
    for (const query of ["?ms=1&ms=2", "?ms[]=1", "?ms=%ZZ", "?ms=%00", "?"]) {
      expect((await app.request(`/api/slow${query}`)).status).toBe(200)
      expect((await app.request(`/scenarios/slow${query}`)).status).toBe(200)
    }
  })

  test("a reflected delay is only ever a number", async () => {
    const app = createApp({ sleep: noSleep })
    const html = await (
      await app.request("/scenarios/slow?ms=<script>alert(1)</script>")
    ).text()
    expect(html).not.toContain("alert(1)")
  })
})

describe("broken image", () => {
  test("the image URL always 404s", async () => {
    const app = createApp()
    const html = await (await app.request("/scenarios/broken-image")).text()
    expect(html).toContain('src="/assets/missing.png"')
    for (let i = 0; i < REPEAT; i++) {
      expect((await app.request("/assets/missing.png")).status).toBe(404)
    }
  })
})

describe("form failure", () => {
  test("submitting always returns 422 with the same errors", async () => {
    const app = createApp()
    for (let i = 0; i < REPEAT; i++) {
      const response = await app.request("/api/form", {
        method: "POST",
        body: JSON.stringify({ email: `anything-${i}@example.com` }),
      })
      expect(response.status).toBe(422)
      expect(await response.json()).toEqual(FORM_FAILURE_BODY)
    }
  })

  test("the page ships a form that posts to it", async () => {
    const app = createApp()
    const html = await (await app.request("/scenarios/form-failure")).text()
    expect(html).toContain('<form id="signup">')
    expect(inlineScript(html)).toContain('"/api/form"')
  })
})

describe("long page", () => {
  test("has a stable, known content height", async () => {
    const app = createApp()
    const first = await (await app.request("/scenarios/long-page")).text()
    for (let i = 0; i < REPEAT; i++) {
      const html = await (await app.request("/scenarios/long-page")).text()
      expect(html).toBe(first)
    }
    expect(LONG_PAGE_HEIGHT_PX).toBe(12_000)
    expect(first).toContain('id="long-content" style="height:12000px"')
    expect(first.match(/<section /g)).toHaveLength(LONG_PAGE_SECTION_COUNT)
    expect(first.match(/height:600px/g)).toHaveLength(LONG_PAGE_SECTION_COUNT)
  })

  test("is much taller than any realistic viewport", () => {
    expect(LONG_PAGE_HEIGHT_PX).toBeGreaterThanOrEqual(10 * 1080)
  })
})
