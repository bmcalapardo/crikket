import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { flushSync } from "react-dom"
import { createRoot, type Root } from "react-dom/client"

import { AnnotateStep } from "../components/annotate-step"
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

const renderStep = (
  onCancel: () => void = () => undefined,
  options: {
    hasAppliedCrop?: boolean
    onReset?: () => void
    removedCount?: number
  } = {}
) => {
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  flushSync(() => {
    root?.render(
      <AnnotateStep
        hasAppliedCrop={options.hasAppliedCrop ?? false}
        imageBlob={new Blob(["fake-png-bytes"], { type: "image/png" })}
        initialHistory={null}
        onCancel={onCancel}
        onDone={() => undefined}
        onResetToOriginal={options.onReset ?? (() => undefined)}
        removedCount={options.removedCount ?? 0}
      />
    )
  })
  return container
}

const byLabel = (rendered: HTMLElement, label: string) =>
  rendered.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)

describe("AnnotateStep", () => {
  it("gives every icon button an accessible name", () => {
    const rendered = renderStep()
    for (const label of [
      "Pen",
      "Eraser",
      "Line",
      "Arrow",
      "Rectangle",
      "Ellipse",
      "Text",
      "Undo",
      "Redo",
    ]) {
      expect(byLabel(rendered, label)).not.toBeNull()
    }
  })

  it("exposes the tools as a labelled toolbar of native buttons", () => {
    const rendered = renderStep()
    const toolbar = rendered.querySelector('[role="toolbar"]')
    expect(toolbar?.getAttribute("aria-label")).toBe("Annotation tools")
    for (const button of toolbar?.querySelectorAll("button") ?? []) {
      expect(button.getAttribute("type")).toBe("button")
    }
    expect(byLabel(rendered, "Arrow")?.getAttribute("aria-keyshortcuts")).toBe(
      "A"
    )
  })

  it("selects a tool from its shortcut key", () => {
    const rendered = renderStep()
    flushSync(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "r" }))
    })
    expect(byLabel(rendered, "Rectangle")?.getAttribute("aria-pressed")).toBe(
      "true"
    )
  })

  it("starts with nothing to undo or redo", () => {
    const rendered = renderStep()
    expect(byLabel(rendered, "Undo")?.hasAttribute("disabled")).toBe(true)
    expect(byLabel(rendered, "Redo")?.hasAttribute("disabled")).toBe(true)
  })

  it("starts on the pen and switches to the eraser", () => {
    const rendered = renderStep()
    expect(byLabel(rendered, "Pen")?.getAttribute("aria-pressed")).toBe("true")

    flushSync(() => byLabel(rendered, "Eraser")?.click())

    expect(byLabel(rendered, "Eraser")?.getAttribute("aria-pressed")).toBe(
      "true"
    )
    expect(byLabel(rendered, "Pen")?.getAttribute("aria-pressed")).toBe("false")
  })

  it("cancels without finishing", () => {
    const onCancel = mock(() => undefined)
    const rendered = renderStep(onCancel)
    const cancel = [...rendered.querySelectorAll("button")].find(
      (b) => b.textContent === "Cancel"
    )
    cancel?.click()
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it("offers Reset to Original only when there is something to reset", () => {
    const untouched = renderStep()
    const find = (root: HTMLElement) =>
      [...root.querySelectorAll("button")].find(
        (b) => b.textContent === "Reset to Original"
      )
    expect(find(untouched)?.hasAttribute("disabled")).toBe(true)
    root?.unmount()
    untouched.remove()

    const onReset = mock(() => undefined)
    const cropped = renderStep(undefined, { hasAppliedCrop: true, onReset })
    expect(find(cropped)?.hasAttribute("disabled")).toBe(false)
    find(cropped)?.click()
    expect(onReset).toHaveBeenCalledTimes(1)
  })
})

describe("AnnotateStep Done", () => {
  it("keeps the tester on the step when the annotated image can't be rendered", async () => {
    const onDone = mock(() => undefined)
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    flushSync(() => {
      root?.render(
        <AnnotateStep
          hasAppliedCrop={false}
          imageBlob={new Blob(["fake-png-bytes"], { type: "image/png" })}
          initialHistory={{
            annotations: [
              {
                id: "a",
                kind: "pen",
                color: "#ff0000",
                width: 4,
                points: [{ x: 1, y: 1 }],
              },
            ],
            undoStack: [],
            redoStack: [],
          }}
          onCancel={() => undefined}
          onDone={onDone}
          onResetToOriginal={() => undefined}
          removedCount={0}
        />
      )
    })
    const rendered = container
    // happy-dom never loads the image, and has no canvas to render onto.
    await new Promise((resolve) => setTimeout(resolve, 0))
    flushSync(() => {
      rendered.querySelector("img")?.dispatchEvent(new Event("load"))
    })
    const done = [...rendered.querySelectorAll("button")].find(
      (b) => b.textContent === "Done"
    )
    expect(done?.hasAttribute("disabled")).toBe(false)

    done?.click()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(onDone).not.toHaveBeenCalled()
    expect(rendered.querySelector('[role="alert"]')?.textContent).toContain(
      "couldn't be saved"
    )
  })
})

describe("AnnotateStep crop warning", () => {
  it("warns how many annotations a crop change removed", () => {
    const rendered = renderStep(undefined, { removedCount: 2 })
    expect(rendered.querySelector("output")?.textContent).toContain(
      "2 annotations"
    )
  })

  it("shows no warning when nothing was removed", () => {
    expect(renderStep().querySelector("output")).toBeNull()
  })

  it("says clicking an annotation deletes it with the default pen", () => {
    expect(renderStep().textContent).toContain("Click an annotation to delete")
  })
})
