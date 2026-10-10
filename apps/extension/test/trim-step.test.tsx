import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { flushSync } from "react-dom"
import { createRoot, type Root } from "react-dom/client"

import { TrimStep } from "../components/trim-step"
import { registerDomEnvironment } from "../happydom"
import { waitFor } from "./wait-for"
import { buildWebm, frames } from "./webm-fixture"

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

const render = (
  original: Blob,
  onApply: (trim: { startMs: number; endMs: number }) => void = () => undefined,
  onCancel: () => void = () => undefined
) => {
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  flushSync(() => {
    root?.render(
      <TrimStep onApply={onApply} onCancel={onCancel} original={original} />
    )
  })
  return container
}

describe("TrimStep", () => {
  it("says trim is unavailable for mp4 and offers a way back", async () => {
    const onCancel = mock(() => undefined)
    const el = render(
      new Blob(["x"], { type: "video/mp4;codecs=avc1" }),
      undefined,
      onCancel
    )
    await waitFor(
      () => el.querySelector("[data-testid=trim-unavailable]") !== null,
      "unavailable message"
    )
    expect(el.textContent).toContain("video/mp4")
    el.querySelector("button")?.click()
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it("shows the real snapped cut points and applies the trim", async () => {
    const webm = buildWebm({ frames: frames(6) })
    const onApply = mock(
      (_trim: { startMs: number; endMs: number }) => undefined
    )
    const el = render(
      new Blob([webm as BlobPart], { type: "video/webm;codecs=vp9" }),
      onApply
    )
    await waitFor(
      () => el.querySelector("[data-testid=trim-cut]") !== null,
      "trim controls"
    )
    expect(el.querySelector("[data-testid=trim-cut]")?.textContent).toContain(
      "0.00s to 6.00s"
    )
    const buttons = [...el.querySelectorAll("button")]
    buttons.find((b) => b.textContent === "Apply trim")?.click()
    expect(onApply).toHaveBeenCalledTimes(1)
    const trim = onApply.mock.calls[0]?.[0]
    expect(trim?.startMs).toBe(0)
    expect(trim?.endMs).toBe(6000)
  })
})
