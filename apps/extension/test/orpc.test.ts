import { afterEach, describe, expect, mock, test } from "bun:test"

import { createExtensionClient } from "../lib/orpc"
import {
  getSubmissionErrorMessage,
  isUnauthorizedSubmissionError,
} from "../lib/recorder-submit"

// The alpha deploy runs the web app and the server on different sites
// (crikket-web-*.vercel.app, crikket-server-*.vercel.app). Signing in sets the
// session cookie on the web app's origin only, so RPC must go there too.
const APP_URL = "https://crikket-web.example.test"

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe("createExtensionClient", () => {
  test("sends RPC to the web app's origin with the session cookie", async () => {
    const fetchMock = mock(
      (_input: Request | string | URL, _init?: RequestInit) =>
        Promise.resolve(
          Response.json(
            { json: { defined: false, code: "UNAUTHORIZED", status: 401 } },
            { status: 401 }
          )
        )
    )
    globalThis.fetch = fetchMock as unknown as typeof fetch

    await createExtensionClient(APP_URL)
      .bugReport.finalizeUpload({ id: "report-1" })
      .catch(() => undefined)

    const [input, init] = fetchMock.mock.calls[0] ?? []
    const requestUrl = new URL(
      input instanceof Request ? input.url : `${input}`
    )
    expect(requestUrl.origin).toBe(APP_URL)
    expect(requestUrl.pathname).toStartWith("/rpc/")
    expect(init?.credentials).toBe("include")
  })
})

describe("createExtensionClient failure modes", () => {
  const callWith = async (response: () => Promise<Response>) => {
    globalThis.fetch = mock(response) as unknown as typeof fetch
    try {
      await createExtensionClient(APP_URL).bugReport.finalizeUpload({
        id: "report-1",
      })
    } catch (error) {
      return error
    }
    return undefined
  }

  test("reports a 401 as an unauthorized session, so sign-in is offered", async () => {
    const error = await callWith(() =>
      Promise.resolve(
        Response.json(
          { json: { defined: false, code: "UNAUTHORIZED", status: 401 } },
          { status: 401 }
        )
      )
    )

    expect(isUnauthorizedSubmissionError(error)).toBe(true)
    expect(getSubmissionErrorMessage(error)).toStartWith("Unauthorized session")
  })

  test("rejects a web page served in place of an API response", async () => {
    const error = await callWith(() =>
      Promise.resolve(
        new Response("<html>Sign in</html>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        })
      )
    )

    expect(error).toBeInstanceOf(Error)
    expect(getSubmissionErrorMessage(error)).toContain("web page")
  })

  test("blames the connection, not storage, when Crikket is unreachable", async () => {
    const error = await callWith(() =>
      Promise.reject(new TypeError("Failed to fetch"))
    )
    const message = getSubmissionErrorMessage(error)

    expect(message).not.toContain("storage")
    expect(message).toContain("reach Crikket")
  })
})
