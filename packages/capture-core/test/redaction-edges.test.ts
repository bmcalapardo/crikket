import { describe, expect, it } from "bun:test"

import {
  isRedactableEntry,
  isSensitiveName,
  redactBody,
  redactHeaderValue,
  redactNetworkRequest,
  redactStructuredValue,
  redactText,
  redactUrl,
} from "../src/debugger/redaction"

const S = "SECRETVALUE123"
const MASK = "[REDACTED]"

// Written from a Stryker run on redaction.ts: each case pins behaviour that a
// mutant could change without any earlier test noticing, and every one of
// those changes is a potential undetected leak.

describe("sensitive names", () => {
  it("ignores empty and whitespace-only names, and trims others", () => {
    expect(isSensitiveName("")).toBe(false)
    expect(isSensitiveName("   ")).toBe(false)
    expect(isSensitiveName("  Token  ")).toBe(true)
  })

  it("masks non-numeric values under a name containing 'tokens'", () => {
    expect(isRedactableEntry("max_tokens", "abc")).toBe(true)
    expect(isRedactableEntry("max_tokens", 5)).toBe(false)
    expect(isRedactableEntry("password", 5)).toBe(true)
    expect(isRedactableEntry("password", true)).toBe(false)
    expect(isRedactableEntry("password", null)).toBe(false)
  })
})

describe("URL parameters", () => {
  it("masks every URL-only secret name", () => {
    for (const name of [
      "auth",
      "credentials",
      "key",
      "x-amz-credential",
      "x-amz-signature",
      "x-goog-signature",
    ]) {
      expect(redactUrl(`/p?${name}=${S}`)).toBe(`/p?${name}=${MASK}`)
      expect(redactUrl(`/p?${name.toUpperCase()}=${S}`)).not.toContain(S)
    }
  })

  it("keeps empty values and survives malformed percent-encoding", () => {
    expect(redactUrl("/p?token=&q=1")).toBe("/p?token=&q=1")
    expect(redactUrl(`/p?%zzpassword=${S}`)).not.toContain(S)
    expect(redactUrl(`/p?q=%E0%A4%A&token=${S}`)).not.toContain(S)
  })

  it("masks a nested secret in a param value but not a plain one", () => {
    const nested = encodeURIComponent(`/cb?token=${S}`)
    expect(redactUrl(`/p?next=${nested}&q=1`)).toBe(`/p?next=${MASK}&q=1`)
    expect(redactUrl("/p?next=%2Fhome&q=1")).toBe("/p?next=%2Fhome&q=1")
  })
})

describe("headers", () => {
  it("keeps cookie names and masks every value", () => {
    expect(redactHeaderValue("cookie", `a=${S}; b=2`)).toBe(
      `a=${MASK}; b=${MASK}`
    )
    expect(redactHeaderValue("  Cookie ", `a=${S}`)).toBe(`a=${MASK}`)
    expect(redactHeaderValue("cookie", `Path=/x; a=${S}`)).toBe(
      `Path=${MASK}; a=${MASK}`
    )
    expect(redactHeaderValue("cookie", S)).toBe(MASK)
    expect(redactHeaderValue("cookie", "  ")).toBe("  ")
  })

  it("keeps Set-Cookie attributes readable and masks the values", () => {
    const value = `sid=${S}; Domain=x.com; Expires=Wed, 01 Jan 2031 00:00:00 GMT; HttpOnly; Max-Age=5; Partitioned; Path=/; Priority=High; SameSite=Lax; Secure`
    const out = redactHeaderValue("set-cookie", value)
    expect(out).not.toContain(S)
    expect(out).toContain(`sid=${MASK}`)
    for (const attribute of [
      "Domain=x.com",
      "Max-Age=5",
      "Priority=High",
      "SameSite=Lax",
      "Path=/",
    ]) {
      expect(out).toContain(attribute)
    }
  })

  it("keeps only the scheme of an Authorization value", () => {
    expect(redactHeaderValue("authorization", `Bearer ${S}`)).toBe(
      `Bearer ${MASK}`
    )
    expect(redactHeaderValue("authorization", `  Bearer   ${S}`)).toBe(
      `Bearer ${MASK}`
    )
    expect(redactHeaderValue("proxy-authorization", `Basic ${S}`)).toBe(
      `Basic ${MASK}`
    )
    expect(redactHeaderValue("authorization", `-- Bearer ${S}`)).toBe(MASK)
    expect(redactHeaderValue("authorization", S)).toBe(MASK)
    expect(redactHeaderValue("x-api-key", `Bearer ${S}`)).toBe(MASK)
    expect(redactHeaderValue("accept", "text/html")).toBe("text/html")
  })
})

describe("text values", () => {
  it("masks a whole JWT including a long signature", () => {
    const jwt = `eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTYifQ.${"s".repeat(40)}`
    expect(redactText(`a ${jwt} b`)).toBe(`a ${MASK} b`)
  })

  it("masks a bare Bearer token whatever the spacing", () => {
    expect(redactText(`Bearer   tok${S}`)).toBe(`Bearer ${MASK}`)
    expect(redactText("Bearer authentication is used")).toBe(
      "Bearer authentication is used"
    )
  })

  it("masks quoted values, closed or cut off, and keeps the scheme", () => {
    expect(redactText(`{"password":"${S}","a":1}`)).toBe(
      `{"password":"${MASK}","a":1}`
    )
    expect(redactText(`{"password":"${S}`)).toBe(`{"password":"${MASK}`)
    expect(redactText(`password='${S}' x`)).toBe(`password='${MASK}' x`)
    expect(redactText(String.raw`{"password":"ab\"${S}"}`)).toBe(
      `{"password":"${MASK}"}`
    )
    expect(redactText(`password:"${S}\nnext`)).toBe(`password:"${MASK}\nnext`)
    expect(redactText(`authorization: "Basic ${S}"`)).toBe(
      `authorization: "Basic ${MASK}"`
    )
    expect(redactText(`authorization: "Bearer  ${S}"`)).toBe(
      `authorization: "Bearer  ${MASK}"`
    )
    expect(redactText(`password: "x Bearer ${S}"`)).toBe(`password: "${MASK}"`)
    expect(redactText('{"password":""}')).toBe('{"password":""}')
  })

  it("masks values inside JSON that is escaped into a string", () => {
    expect(redactText(String.raw`{\"password\":\"${S}\",\"a\":1}`)).toBe(
      String.raw`{\"password\":\"${MASK}\",\"a\":1}`
    )
    // Cut off before the closing escaped quote: masked to the end.
    expect(redactText(String.raw`{\"password\":\"${S}`)).toBe(
      String.raw`{\"password\":\"${MASK}`
    )
    expect(redactText(String.raw`{\"token\":\'${S}\'}`)).toBe(
      String.raw`{\"token\":\'${MASK}\'}`
    )
    // The value stops at the line end; a lone backslash is not a quote.
    expect(redactText(`{\\"password\\":\\"${S}\nnext`)).toBe(
      `{\\"password\\":\\"${MASK}\nnext`
    )
    expect(redactText(String.raw`{\"authorization\":\"Bearer ${S}\"}`)).toBe(
      String.raw`{\"authorization\":\"Bearer ${MASK}\"}`
    )
    expect(redactText(String.raw`{\"password\":\"\"}`)).toBe(
      String.raw`{\"password\":\"\"}`
    )
    expect(redactText(String.raw`path C:\password=${S}`)).not.toContain(S)
  })

  it("trims unquoted values and keeps booleans and nulls readable", () => {
    expect(redactText(`password=  ${S}  &x=1`)).toBe(`password=  ${MASK}&x=1`)
    expect(redactText("password=true&x=1")).toBe("password=true&x=1")
    expect(redactText("password=false&x=1")).toBe("password=false&x=1")
    expect(redactText("token=null&x=1")).toBe("token=null&x=1")
    expect(redactText("token=&x=1")).toBe("token=&x=1")
    expect(redactText(`token=${S}`)).toBe(`token=${MASK}`)
  })

  it("masks a Cookie line to its end, with or without a newline", () => {
    expect(redactText(`Cookie: sid=${S}; o=1`)).toBe(
      `Cookie: sid=${MASK}; o=${MASK}`
    )
    expect(redactText(`Cookie: sid=${S}9\nnext=1`)).toBe(
      `Cookie: sid=${MASK}\nnext=1`
    )
    expect(redactText(`Set-Cookie: sid=${S}; Path=/; HttpOnly`)).toBe(
      `Set-Cookie: sid=${MASK}; Path=/; HttpOnly`
    )
    expect(redactText(`cookie: "${S}"`)).not.toContain(S)
    expect(redactText(`cookie=${S}`)).not.toContain(S)
  })
})

describe("bodies", () => {
  it("returns a body with nothing to redact byte for byte", () => {
    const body = '  { "a": 1,\n  "b": [1, 2] }  '
    expect(redactBody(body)).toBe(body)
    expect(redactBody("plain text")).toBe("plain text")
  })

  it("parses JSON with surrounding whitespace and arrays", () => {
    expect(redactBody(`  {"password":"${S}"}\n`)).toBe(`{"password":"${MASK}"}`)
    expect(redactBody(`[{"password":"${S}"}]`)).toBe(`[{"password":"${MASK}"}]`)
  })

  it("replaces values nested past the depth limit", () => {
    const nest = (levels: number) => {
      let value: unknown = "leaf"
      for (let index = 0; index < levels; index++) {
        value = [value]
      }
      return value
    }
    expect(JSON.stringify(redactStructuredValue(nest(31)))).toContain("leaf")
    expect(JSON.stringify(redactStructuredValue(nest(32)))).not.toContain(
      "leaf"
    )
    expect(JSON.stringify(redactStructuredValue(nest(32)))).toContain(
      "[MaxDepth]"
    )
    const objects = (levels: number) => {
      let value: unknown = { a: "leaf" }
      for (let index = 0; index < levels; index++) {
        value = { n: value }
      }
      return value
    }
    expect(JSON.stringify(redactStructuredValue(objects(40)))).toContain(
      "[MaxDepth]"
    )
  })

  it("leaves a non-sensitive form body exactly as sent", () => {
    expect(redactBody("q=a%20b&x=1", "application/x-www-form-urlencoded")).toBe(
      "q=a%20b&x=1"
    )
    expect(
      redactBody(`q=1&password=${S}`, "APPLICATION/X-WWW-FORM-URLENCODED")
    ).toBe(`q=1&password=${encodeURIComponent(MASK)}`)
  })

  it("redacts a network request, using each side's Content-Type", () => {
    const form = "application/x-www-form-urlencoded"
    const request = redactNetworkRequest({
      url: `/p?token=${S}`,
      requestHeaders: { "content-type": form, authorization: `Bearer ${S}` },
      responseHeaders: { "content-type": form, "set-cookie": `a=${S}` },
      requestBody: `password=${S}`,
      responseBody: `password=${S}`,
    })
    expect(JSON.stringify(request)).not.toContain(S)

    const bare = redactNetworkRequest({ url: "/p" })
    expect(bare.requestBody).toBeUndefined()
    expect(bare.responseBody).toBeUndefined()
    expect(bare.requestHeaders).toBeUndefined()
  })
})

describe("multipart bodies", () => {
  const part = (name: string, value: string, extra = "") =>
    `Content-Disposition: form-data; name="${name}"${extra}\r\n\r\n${value}\r\n`

  it("finds the boundary quoted or not, with trailing parameters", () => {
    const body = `--b\r\n${part("password", S)}--b\r\n${part("title", "hi")}--b--`
    for (const contentType of [
      "multipart/form-data; boundary=b",
      'multipart/form-data; boundary="b"',
      "multipart/form-data; boundary=b; charset=utf-8",
      "MULTIPART/FORM-DATA; BOUNDARY=b",
    ]) {
      const out = redactBody(body, contentType)
      expect(out).not.toContain(S)
      expect(out).toContain("hi")
    }
  })

  it("detects a multipart body without a Content-Type", () => {
    const crlf = `--b\r\n${part("password", S)}--b--`
    expect(redactBody(crlf)).not.toContain(S)
    const lf = `--b\nContent-Disposition: form-data; name="password"\n\n${S}\n--b--`
    expect(redactBody(lf)).not.toContain(S)
    expect(
      redactBody(lf.replace("Content-Disposition", "CONTENT-DISPOSITION"))
    ).not.toContain(S)
  })

  it("masks every value line and keeps the line endings", () => {
    const body = `--b\r\n${part("password", `l1\r\n${S}`)}--b\r\n${part("title", "hi")}--b--`
    const out = redactBody(body, "multipart/form-data; boundary=b")
    expect(out).toBe(
      `--b\r\nContent-Disposition: form-data; name="password"\r\n\r\n${MASK}\r\n${MASK}\r\n--b\r\n${part("title", "hi")}--b--`
    )
  })

  it("keeps the field name across extra part headers", () => {
    const body = `--b\r\nContent-Disposition: form-data; name="token"\r\nContent-Type: text/plain\r\n\r\n${S}\r\n--b--`
    expect(redactBody(body, "multipart/form-data; boundary=b")).not.toContain(S)
  })

  it("does not treat a preamble as a part", () => {
    const body = `preamble ${S}\r\n--b\r\n${part("title", "hi")}--b--`
    const out = redactBody(body, "multipart/form-data; boundary=b")
    expect(out).toContain("hi")
    expect(out).toContain("preamble")
  })

  it("resets the field after the closing delimiter", () => {
    const body = `--b\r\n${part("password", S)}--b--\r\nepilogue`
    expect(redactBody(body, "multipart/form-data; boundary=b")).toContain(
      "epilogue"
    )
  })
})
