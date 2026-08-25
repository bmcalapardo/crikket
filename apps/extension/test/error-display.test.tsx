import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { flushSync } from "react-dom"
import { createRoot, type Root } from "react-dom/client"

import { ErrorDisplay } from "../components/error-display"
import { registerDomEnvironment } from "../happydom"

let container: HTMLDivElement | undefined
let root: Root | undefined

beforeEach(async () => {
  await registerDomEnvironment()
})

afterEach(() => {
  root?.unmount()
  container?.remove()
  root = undefined
  container = undefined
})

const renderErrorDisplay = (
  error: string | null,
  onRetry: () => void = () => undefined
) => {
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)

  flushSync(() => {
    root?.render(<ErrorDisplay error={error} onRetry={onRetry} />)
  })

  return container
}

describe("ErrorDisplay", () => {
  it("renders nothing when there is no error", () => {
    const rendered = renderErrorDisplay(null)

    expect(rendered.textContent).toBe("")
  })

  it("shows the error and retries when Try Again is clicked", () => {
    const onRetry = mock(() => undefined)
    const rendered = renderErrorDisplay("Network failed", onRetry)

    expect(rendered.textContent).toContain("Network failed")
    expect(rendered.textContent).toContain("Try Again")

    rendered.querySelector("button")?.click()
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
