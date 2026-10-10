import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { flushSync } from "react-dom"
import { createRoot, type Root } from "react-dom/client"

import { RecordingStep } from "../components/recording-step"
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

const render = (isPaused: boolean, onTogglePause = () => undefined) => {
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  flushSync(() => {
    root?.render(
      <RecordingStep
        duration={65_000}
        isPaused={isPaused}
        onStopRecording={() => undefined}
        onTogglePause={onTogglePause}
        stopRecordingShortcut={null}
        togglePauseShortcut={null}
      />
    )
  })
  return container
}

describe("RecordingStep", () => {
  it("shows a running recording with a pause action", () => {
    const view = render(false)
    expect(view.textContent).toContain("Recording now")
    expect(view.textContent).toContain("Pause Recording")
    expect(view.textContent).toContain("01:05")
    expect(view.querySelector("[data-paused='true']")).toBeNull()
  })

  it("makes the paused state unmistakable and offers resume", () => {
    const view = render(true)
    expect(view.textContent).toContain("Recording paused")
    expect(view.textContent).not.toContain("Recording now")
    expect(view.textContent).toContain("Resume Recording")
    expect(view.textContent).toContain("01:05")
    expect(view.querySelector("[data-paused='true']")).not.toBeNull()
  })

  it("toggles pause from the button", () => {
    const onTogglePause = mock(() => undefined)
    const view = render(false, onTogglePause)
    const button = [...view.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Pause Recording")
    )
    button?.click()
    expect(onTogglePause).toHaveBeenCalledTimes(1)
  })
})
