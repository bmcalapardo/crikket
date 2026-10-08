import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { flushSync } from "react-dom"
import { createRoot, type Root } from "react-dom/client"

import { FormStep } from "../components/form-step"
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

const renderFormStep = (
  captureType: "video" | "screenshot",
  onEditScreenshot?: () => void
) => {
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)

  flushSync(() => {
    root?.render(
      <FormStep
        captureType={captureType}
        debuggerSummary={{ actions: 0, logs: 0, networkRequests: 0 }}
        initialTitle="Bug"
        isSubmitting={false}
        onCancel={() => undefined}
        onEditScreenshot={onEditScreenshot}
        onSubmit={() => undefined}
        preSubmitWarnings={[]}
        previewUrl={null}
        submitError={null}
        videoDurationMs={null}
      />
    )
  })

  return container
}

const findButton = (rendered: HTMLElement, text: string) =>
  [...rendered.querySelectorAll("button")].find((b) => b.textContent === text)

describe("FormStep", () => {
  it("lets a screenshot tester go back to edit the screenshot", () => {
    const onEditScreenshot = mock(() => undefined)
    const rendered = renderFormStep("screenshot", onEditScreenshot)

    findButton(rendered, "Edit Screenshot")?.click()

    expect(onEditScreenshot).toHaveBeenCalledTimes(1)
  })

  it("offers no screenshot editing for a video", () => {
    const rendered = renderFormStep("video")

    expect(findButton(rendered, "Edit Screenshot")).toBeUndefined()
  })
})
