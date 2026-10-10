import { describe, expect, test } from "bun:test"
import { environmentInputSchema } from "../../../packages/bug-reports/src/lib/report-payload-schema"
import {
  browserFromClientHints,
  buildReportEnvironment,
  collectReportEnvironment,
  INCLUDE_PAGE_STORAGE_KEY,
  osFromClientHints,
  parseBrowser,
  parseIncludePage,
  parseOs,
  readIncludePage,
} from "../lib/report-environment"

const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"

const base = {
  buildSha: "abc1234",
  captureType: "video" as const,
  durationMs: 1500.4,
  extensionVersion: "0.1.4",
  includePage: true,
  pageTitle: "Checkout",
  pageUrl: "https://shop.example.com/cart?token=SUPERSECRET123&step=2",
  platform: "Win32",
  userAgent: CHROME_UA,
  viewport: { width: 1280, height: 720 },
  devicePixelRatio: 2,
}

// Park-Miller LCG, seeded so a failure reproduces from its seed.
function rng(seed: number) {
  let state = seed
  return () => {
    state = (state * 16_807) % 2_147_483_647
    return state / 2_147_483_647
  }
}

describe("environment survives the server schema (drift guard)", () => {
  test("a normal environment validates against the real schema", () => {
    expect(
      environmentInputSchema.safeParse(buildReportEnvironment(base)).success
    ).toBeTrue()
  })

  test("hostile inputs are clamped so the Report is never rejected", () => {
    const hostile = [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      -5,
      0,
      1e12,
      0.4,
    ]
    for (const value of hostile) {
      const environment = buildReportEnvironment({
        ...base,
        devicePixelRatio: value,
        durationMs: value,
        viewport: { width: value, height: value },
        userAgent: `Chrome/${"1".repeat(500)}`,
        extensionVersion: "9".repeat(500),
        buildSha: "f".repeat(500),
        platform: "p".repeat(500),
        pageTitle: "t".repeat(5000),
        pageUrl: `https://x.example/${"a".repeat(10_000)}`,
      })
      expect(environmentInputSchema.safeParse(environment).success).toBeTrue()
    }
  })

  test("seeded fuzz: random inputs always produce a valid environment", () => {
    const random = rng(25)
    const numbers = [Number.NaN, Number.POSITIVE_INFINITY, -1, 0, 1, 1e6, 0.5]
    const pick = (items: number[]) =>
      items[Math.floor(random() * items.length)] as number
    const alphabet = "ab/ ;()._-0123456789\u0000‮<>\"'ChromeEdgFirefoxOPR"
    for (let i = 0; i < 500; i++) {
      let ua = ""
      const length = Math.floor(random() * 300)
      for (let j = 0; j < length; j++) {
        ua += alphabet[Math.floor(random() * alphabet.length)]
      }
      const environment = buildReportEnvironment({
        ...base,
        userAgent: ua,
        platform: ua.slice(0, 20),
        devicePixelRatio: pick(numbers),
        durationMs: pick(numbers),
        viewport: { width: pick(numbers), height: pick(numbers) },
      })
      expect(environmentInputSchema.safeParse(environment).success).toBeTrue()
    }
  })
})

describe("user agent parsing, odd agents", () => {
  const opera = `${CHROME_UA} OPR/112.0.0.0`
  const edge = `${CHROME_UA} Edg/126.0.0.0`
  const firefoxEsr =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:115.0) Gecko/20100101 Firefox/115.0"
  const linux =
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
  const chromeOs =
    "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
  const mac =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"

  test("browsers", () => {
    expect(parseBrowser(opera).name).toBe("Opera")
    expect(parseBrowser(edge).name).toBe("Edge")
    expect(parseBrowser(firefoxEsr)).toEqual({
      name: "Firefox",
      version: "115.0",
    })
    expect(parseBrowser(linux).name).toBe("Chrome")
    // Brave deliberately sends the Chrome UA; it cannot be told apart here.
    expect(parseBrowser(mac).name).toBe("Chrome")
    expect(
      parseBrowser(
        "Mozilla/5.0 (Linux; Android 14) SamsungBrowser/25.0 Chrome/121"
      ).name
    ).toBe("Samsung Internet")
  })

  test("OS: ChromeOS is not Linux, Android is not Linux, iPhone is not macOS", () => {
    expect(parseOs(chromeOs)).toBe("ChromeOS")
    expect(parseOs(linux)).toBe("Linux")
    expect(parseOs("Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/126")).toBe(
      "Android"
    )
    expect(
      parseOs("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)")
    ).toBe("iOS")
    expect(parseOs(mac)).toBe("macOS")
  })

  test("the empty string and junk do not throw", () => {
    expect(parseBrowser("")).toEqual({ name: "Unknown" })
    expect(parseOs("")).toBe("Unknown")
    expect(parseOs("", "")).toBe("Unknown")
    expect(parseBrowser(undefined as unknown as string)).toEqual({
      name: "Unknown",
    })
    expect(parseOs(null as unknown as string, "Win32")).toBe("Win32")
  })

  test("pathological agents finish fast (ReDoS guard)", () => {
    const attacks = [
      "Version/1 ".repeat(50_000),
      `Version/${"1.".repeat(100_000)}`,
      "Edg/".repeat(50_000),
      "Chrome/".repeat(100_000),
      "Mac OS X".repeat(100_000),
    ]
    let best = Number.POSITIVE_INFINITY
    for (let attempt = 0; attempt < 3; attempt++) {
      const started = performance.now()
      for (const attack of attacks) {
        parseBrowser(attack)
        parseOs(attack)
      }
      best = Math.min(best, performance.now() - started)
    }
    expect(best).toBeLessThan(2000)
  })
})

describe("client hints", () => {
  test("names the product, skipping GREASE and the engine brand", () => {
    expect(
      browserFromClientHints({
        brands: [
          { brand: "Not/A)Brand", version: "8" },
          { brand: "Chromium", version: "126" },
          { brand: "Microsoft Edge", version: "126" },
        ],
        fullVersionList: [
          { brand: "Not/A)Brand", version: "8.0.0.0" },
          { brand: "Chromium", version: "126.0.6478.62" },
          { brand: "Microsoft Edge", version: "126.0.2592.81" },
        ],
      })
    ).toEqual({ name: "Edge", version: "126.0.2592.81" })
  })

  test("falls back to the low-entropy brands, and to nothing", () => {
    expect(
      browserFromClientHints({
        brands: [{ brand: "Google Chrome", version: "126" }],
      })
    ).toEqual({ name: "Chrome", version: "126" })
    expect(browserFromClientHints(undefined)).toBeUndefined()
    expect(
      browserFromClientHints({ brands: "bogus" as unknown as [] })
    ).toBeUndefined()
    expect(
      browserFromClientHints({
        brands: [{ brand: "Not A;Brand", version: "8" }],
      })
    ).toBeUndefined()
  })

  test("platform maps; unknown and prototype keys fall through", () => {
    expect(osFromClientHints({ platform: "Chrome OS" })).toBe("ChromeOS")
    expect(osFromClientHints({ platform: "Windows" })).toBe("Windows")
    expect(osFromClientHints({ platform: "__proto__" })).toBeUndefined()
    expect(osFromClientHints({ platform: "constructor" })).toBeUndefined()
    expect(osFromClientHints({ platform: "" })).toBeUndefined()
  })

  test("hints win over a reduced or spoofed user agent", () => {
    const environment = buildReportEnvironment({
      ...base,
      clientHints: {
        brands: [{ brand: "Google Chrome", version: "127" }],
        platform: "Linux",
      },
    })
    expect(environment.browser).toEqual({ name: "Chrome", version: "127" })
    expect(environment.os).toBe("Linux")
  })
})

describe("page inclusion setting", () => {
  const g = globalThis as unknown as { chrome?: unknown }
  const original = g.chrome
  const withStorage = (get: () => unknown) => {
    g.chrome = { storage: { local: { get } } }
  }

  test("defaults ON for missing, corrupt and wrong-typed values", () => {
    for (const stored of [undefined, null, "false", 0, "", {}, [], "no", 1]) {
      expect(parseIncludePage(stored)).toBe(true)
    }
    expect(parseIncludePage(false)).toBe(false)
  })

  test("reading defaults ON when storage is empty, null or throws", async () => {
    try {
      withStorage(() => Promise.resolve({}))
      expect(await readIncludePage()).toBe(true)
      withStorage(() => Promise.resolve(undefined))
      expect(await readIncludePage()).toBe(true)
      withStorage(() => Promise.resolve({ [INCLUDE_PAGE_STORAGE_KEY]: "off" }))
      expect(await readIncludePage()).toBe(true)
      withStorage(() => Promise.reject(new Error("context invalidated")))
      expect(await readIncludePage()).toBe(true)
      withStorage(() => {
        throw new Error("sync failure")
      })
      expect(await readIncludePage()).toBe(true)
      withStorage(() => Promise.resolve({ [INCLUDE_PAGE_STORAGE_KEY]: false }))
      expect(await readIncludePage()).toBe(false)
    } finally {
      g.chrome = original
    }
  })

  test("collecting never throws: a broken chrome API yields no environment", async () => {
    try {
      g.chrome = {
        runtime: {
          getManifest: () => {
            throw new Error("Extension context invalidated.")
          },
        },
        storage: { local: { get: () => Promise.resolve({}) } },
      }
      expect(
        await collectReportEnvironment({ captureType: "video", durationMs: 1 })
      ).toBeUndefined()
    } finally {
      g.chrome = original
    }
  })
})
