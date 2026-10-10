import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import { DiagnosticsPage } from "../components/diagnostics-page"
import { registerDomEnvironment } from "../happydom"
import { CHECK_IDS } from "../lib/diagnostics/checks"
import { healthyEnvironment, NEVER } from "./diagnostics-fixtures"

const SECRET = "SUPERSECRETVALUE123"

let container: HTMLDivElement | undefined
let root: Root | undefined

beforeEach(async () => {
  await registerDomEnvironment()
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
})

async function renderPage(
  props: Partial<Parameters<typeof DiagnosticsPage>[0]> = {}
) {
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    await Promise.resolve()
    root?.render(
      <DiagnosticsPage
        environment={healthyEnvironment()}
        loadStorage={() => Promise.resolve({})}
        timeoutMs={30}
        {...props}
      />
    )
  })
  return container
}

const row = (rendered: HTMLElement, id: string) =>
  rendered.querySelector<HTMLElement>(`[data-check-id="${id}"]`)

const buttonNamed = (rendered: HTMLElement, name: string) =>
  [...rendered.querySelectorAll("button")].find(
    (button) => button.textContent?.trim() === name
  )

describe("DiagnosticsPage", () => {
  it("shows every named check with a pass status on a healthy install", async () => {
    const rendered = await renderPage()

    for (const id of CHECK_IDS) {
      expect(row(rendered, id)?.dataset.status).toBe("pass")
    }
    expect(rendered.querySelector("h1")?.textContent).toBe(
      "Crikket diagnostics"
    )
  })

  it("shows a failing check in words for a simulated API failure", async () => {
    const rendered = await renderPage({
      environment: healthyEnvironment({
        probeApi: () => Promise.reject(new TypeError("Failed to fetch")),
      }),
    })

    const api = row(rendered, "api-connectivity")
    expect(api?.dataset.status).toBe("fail")
    expect(api?.textContent).toContain("Fail")
    expect(api?.textContent).toContain("Could not reach")
  })

  it("still renders when the API never answers", async () => {
    const rendered = await renderPage({
      environment: healthyEnvironment({ probeApi: () => NEVER }),
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60))
    })

    expect(row(rendered, "api-connectivity")?.dataset.status).toBe("fail")
  })

  it("lists recent errors, newest first, as shown by the ring buffer", async () => {
    const rendered = await renderPage({
      environment: healthyEnvironment({
        listErrors: () =>
          Promise.resolve([
            { at: 1, context: "Older", message: "first" },
            { at: 2, context: "Newer", message: "second" },
          ]),
      }),
    })

    const items = [
      ...rendered.querySelectorAll('ol[aria-label="Recent errors"] li'),
    ]
    expect(items.map((item) => item.querySelector("p")?.textContent)).toEqual([
      "Newer",
      "Older",
    ])
  })

  it("copies a redacted bundle to the clipboard", async () => {
    const writeClipboard = mock((_text: string) => Promise.resolve())
    const rendered = await renderPage({
      writeClipboard,
      loadStorage: () =>
        Promise.resolve({ authToken: SECRET, captureTabId: 7 }),
    })

    await act(async () => {
      buttonNamed(rendered, "Copy diagnostics bundle")?.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const copied = writeClipboard.mock.calls[0]?.[0] ?? ""
    expect(copied).toContain("api-connectivity")
    expect(copied).not.toContain(SECRET)
    expect(rendered.querySelector("output")?.textContent).toContain("copied")
  })

  it("says so, and offers the download, when copying fails", async () => {
    const rendered = await renderPage({
      writeClipboard: () => Promise.reject(new Error("denied")),
    })

    await act(async () => {
      buttonNamed(rendered, "Copy diagnostics bundle")?.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(rendered.querySelector("output")?.textContent).toContain(
      "Download diagnostics bundle"
    )
  })

  it("downloads the redacted bundle as a file", async () => {
    const saveFile = mock((_name: string, _text: string) => undefined)
    const rendered = await renderPage({
      saveFile,
      loadStorage: () => Promise.resolve({ password: SECRET }),
    })

    await act(async () => {
      buttonNamed(rendered, "Download diagnostics bundle")?.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(saveFile.mock.calls[0]?.[0]).toBe("crikket-diagnostics.json")
    expect(saveFile.mock.calls[0]?.[1]).not.toContain(SECRET)
  })

  it("is keyboard operable: real labelled buttons, a labelled list, a live region", async () => {
    const rendered = await renderPage()

    for (const button of rendered.querySelectorAll("button")) {
      expect(button.tagName).toBe("BUTTON")
      expect(button.getAttribute("tabindex")).not.toBe("-1")
      expect(button.textContent?.trim().length).toBeGreaterThan(0)
    }
    expect(rendered.querySelectorAll("button")).toHaveLength(3)
    expect(
      rendered.querySelector('ul[aria-label="Diagnostic checks"]')
    ).not.toBeNull()
    expect(rendered.querySelector('output[aria-live="polite"]')).not.toBeNull()
    expect(rendered.querySelectorAll("main")).toHaveLength(1)
    // Status is conveyed as text, not only colour.
    expect(row(rendered, "storage-availability")?.textContent).toContain("Pass")
  })
})
