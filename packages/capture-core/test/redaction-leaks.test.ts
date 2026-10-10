import { describe, expect, it } from "bun:test"

import {
  isSensitiveName,
  redactBody,
  redactHeaders,
  redactStructuredValue,
  redactText,
  redactUrl,
} from "../src/debugger/redaction"

const SECRET = "SECRETVALUE123"
const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTYifQ.abcDEF123_-sig"

describe("redaction leak regressions", () => {
  it("treats jwt names as sensitive", () => {
    expect(isSensitiveName("jwt")).toBe(true)
    expect(redactHeaders({ "x-jwt": SECRET })["x-jwt"]).not.toContain(SECRET)
    expect(redactText(`jwt=${SECRET}`)).not.toContain(SECRET)
  })

  it("masks JWT-shaped values under innocuous names", () => {
    expect(redactBody(JSON.stringify({ foo: JWT }))).not.toContain("abcDEF123")
    expect(redactText(`got ${JWT} ok`)).not.toContain("abcDEF123")
    expect(redactBody(JWT)).not.toContain("abcDEF123")
  })

  it("masks OAuth and signature URL params", () => {
    for (const name of ["code", "sig", "signature", "auth", "credential"]) {
      for (const url of [
        `https://a.com/p?x=1&${name}=${SECRET}&y=2`,
        `/p?${name}=${SECRET}`,
        `https://a.com/p#/cb?${name}=${SECRET}`,
        `https://a.com/p#${name}=${SECRET}&z=1`,
      ]) {
        expect(redactUrl(url)).not.toContain(SECRET)
      }
    }
    expect(redactUrl("/p?code=abc&x=1")).toBe("/p?code=[REDACTED]&x=1")
  })

  it("keeps non-secret code fields in bodies readable", () => {
    expect(redactBody('{"code":404,"status_code":"x"}')).toBe(
      '{"code":404,"status_code":"x"}'
    )
  })

  it("decodes percent-encoded param names in URLs", () => {
    expect(redactUrl(`/p?%61pi_key=${SECRET}&q=1`)).not.toContain(SECRET)
    expect(redactUrl(`/p#%74oken=${SECRET}`)).not.toContain(SECRET)
    expect(redactUrl("/p?q=a%20b&x=1")).toBe("/p?q=a%20b&x=1")
  })

  it("masks URL param values containing separators like commas", () => {
    expect(redactUrl(`/p?password=a,${SECRET};b&q=1`)).not.toContain(SECRET)
  })

  it("masks userinfo passwords in URLs", () => {
    const out = redactUrl(`https://user:${SECRET}@host.com/x`)
    expect(out).not.toContain(SECRET)
    expect(out).toContain("host.com/x")
  })

  it("masks multipart form fields with sensitive names", () => {
    const body = `--b\r\nContent-Disposition: form-data; name="api_key"\r\n\r\n${SECRET}\r\n--b\r\nContent-Disposition: form-data; name="title"\r\n\r\nhello\r\n--b--`
    const out = redactBody(body, "multipart/form-data; boundary=b")
    expect(out).not.toContain(SECRET)
    expect(out).toContain("hello")
    expect(out).toContain('name="api_key"')
  })

  it("keeps masking a multipart value whose lines start with --", () => {
    const body = `--b\r\nContent-Disposition: form-data; name="password"\r\n\r\nfirst\r\n--${SECRET}\r\n--b--`
    const out = redactBody(body, "multipart/form-data; boundary=b")
    expect(out).not.toContain(SECRET)
    expect(out).not.toContain("first")
  })

  it("masks every pair in a Cookie line within text", () => {
    const out = redactText(`Cookie: sid=${SECRET}; other=${SECRET}2\nnext`)
    expect(out).not.toContain(SECRET)
    expect(out).toContain("sid=")
    expect(out).toContain("next")
  })

  it("masks lowercase bearer tokens", () => {
    expect(redactText(`bearer ${SECRET}`)).not.toContain(SECRET)
  })
})

// Seeded property loop: a secret planted under a sensitive name at a random
// path, in a random encoding, never survives, and prose around it does.
describe("redaction fuzz", () => {
  const NAMES = [
    "password",
    "apiKey",
    "api-key",
    "api_key",
    "API_KEY",
    "clientSecret",
    "client_secret",
    "refresh_token",
    "id_token",
    "privateKey",
    "session",
    "sessionid",
    "jwt",
    "access_token",
    "Authorization",
  ]
  const FILLER = ["a", "b", "items", "data", "user", "list", "x1"]

  function rng(seed: number) {
    let state = seed
    return () => {
      state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296
      return state / 4_294_967_296
    }
  }

  it("never leaks planted secrets and keeps shape", () => {
    const next = rng(20_260_101)
    const pick = <T>(items: readonly T[]): T =>
      items[Math.floor(next() * items.length)] as T

    for (let i = 0; i < 3000; i++) {
      const secret = `SECRET${i}x${Math.floor(next() * 1e9)}`
      const name = pick(NAMES)
      const depth = Math.floor(next() * 8)
      let node: unknown = { [name]: secret, keep: "visible" }
      for (let d = 0; d < depth; d++) {
        const key = pick(FILLER)
        node = next() < 0.4 ? [node, { n: 1 }] : { [key]: node, flag: true }
      }

      const json = JSON.stringify(node)
      const body = redactBody(json)
      expect(body).not.toContain(secret)
      expect(body).toContain("visible")
      expect(() => JSON.parse(body)).not.toThrow()

      const structured = JSON.stringify(redactStructuredValue(node))
      expect(structured).not.toContain(secret)

      // Truncated anywhere after the secret starts, the prefix still masks.
      const cut = json.indexOf(secret) + 1 + Math.floor(next() * secret.length)
      expect(redactBody(json.slice(0, cut))).not.toContain(
        secret.slice(0, Math.max(6, cut - json.indexOf(secret)))
      )

      expect(
        redactBody(`a=1&${name}=${secret}`, "application/x-www-form-urlencoded")
      ).not.toContain(secret)
      expect(redactText(`log ${name}: ${secret} done`)).not.toContain(secret)
      expect(redactUrl(`/p?x=1&${name}=${secret}`)).not.toContain(secret)
      expect(redactUrl(`/p#/cb?${name}=${secret}`)).not.toContain(secret)
    }
  })
})

describe("redaction timing", () => {
  const ADVERSARIAL = [
    "Bearer ".repeat(100_000),
    `"password":"${"\\".repeat(100_000)}`,
    `password=${"=".repeat(100_000)}`,
    `${'"'.repeat(100_000)}`,
    `${"a=".repeat(100_000)}`,
    `${"token:".repeat(50_000)}`,
    `${"eyJ".repeat(50_000)}`,
    `${"?a&".repeat(50_000)}`,
    `--b\r\nContent-Disposition: form-data; name="x"${"\r\nx".repeat(50_000)}`,
    `${"//a:".repeat(50_000)}`,
  ]

  it("stays near-linear on adversarial input", () => {
    redactText("warmup token=1")
    for (const input of ADVERSARIAL) {
      const start = performance.now()
      redactText(input)
      redactUrl(input)
      redactBody(input)
      redactBody(input, "multipart/form-data; boundary=b")
      expect(performance.now() - start).toBeLessThan(3000)
    }
  })
})

describe("redaction leak regressions, round 2", () => {
  it("masks userinfo with an empty user (redis://:pw@host)", () => {
    const out = redactText(`redis://:${SECRET}@h:6379`)
    expect(out).not.toContain(SECRET)
    expect(out).toContain("@h:6379")
    expect(redactUrl(`rediss://:${SECRET}@h`)).not.toContain(SECRET)
  })

  it("masks values in JSON that is embedded as an escaped string", () => {
    const inner = JSON.stringify({ password: SECRET, keep: "visible" })
    const logLine = JSON.stringify({ msg: inner })
    const out = redactText(logLine)
    expect(out).not.toContain(SECRET)
    expect(out).toContain("visible")
    expect(redactText(out)).toBe(out)
    expect(redactText(`got ${JSON.stringify(inner)} end`)).not.toContain(SECRET)
  })

  it("masks a JWT whose signature was cut off", () => {
    expect(redactText(`t eyJhbGciOiJIUzI1NiJ9.eyJ${SECRET}`)).not.toContain(
      SECRET
    )
    expect(redactText("alg eyJhbGciOiJIUzI1NiJ9 only")).toBe(
      "alg eyJhbGciOiJIUzI1NiJ9 only"
    )
  })

  it("treats passphrase, bearer and auth as sensitive names", () => {
    for (const name of ["passphrase", "bearer", "auth", "Auth"]) {
      expect(redactBody(JSON.stringify({ [name]: SECRET }))).not.toContain(
        SECRET
      )
    }
    expect(isSensitiveName("author")).toBe(false)
    expect(redactBody('{"auth":true}')).toBe('{"auth":true}')
  })

  it("masks a URL that carries a secret inside an encoded param value", () => {
    const nested = encodeURIComponent(`https://a.com/cb?access_token=${SECRET}`)
    const out = redactUrl(`https://b.com/login?redirect=${nested}&q=1`)
    expect(out).not.toContain(SECRET)
    expect(out).toContain("&q=1")
    expect(redactUrl("/p?next=%2Fhome%3Ftab%3D2&q=1")).toBe(
      "/p?next=%2Fhome%3Ftab%3D2&q=1"
    )
  })
})
