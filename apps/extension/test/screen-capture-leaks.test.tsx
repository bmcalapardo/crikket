import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { flushSync } from "react-dom"
import { createRoot, type Root } from "react-dom/client"
import { registerDomEnvironment } from "../happydom"
import { useScreenCapture } from "../hooks/use-screen-capture"
import { CAPTURE_TAB_ID_STORAGE_KEY } from "../lib/capture-context"

type G = Record<string, unknown>
const g = globalThis as unknown as G
const saved: G = {}
let root: Root | undefined
let container: HTMLDivElement | undefined
let api: ReturnType<typeof useScreenCapture> | undefined

function Probe() {
  api = useScreenCapture()
  return null
}

let stopped = 0
const fakeStream = () => {
  const track = {
    onended: null,
    stop() {
      stopped += 1
    },
  }
  return {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  }
}

beforeEach(async () => {
  await registerDomEnvironment()
  stopped = 0
  for (const k of ["chrome", "MediaRecorder"]) saved[k] = g[k]
  g.chrome = {
    runtime: { lastError: undefined },
    storage: {
      local: {
        get: async () => ({ [CAPTURE_TAB_ID_STORAGE_KEY]: 7 }),
        remove: async () => undefined,
        set: async () => undefined,
      },
    },
    tabCapture: {
      getMediaStreamId: (_o: unknown, cb: (id: string) => void) => cb("id"),
    },
  }
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: async () => fakeStream() },
  })
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  flushSync(() => root?.render(<Probe />))
})

afterEach(() => {
  root?.unmount()
  container?.remove()
  for (const k of Object.keys(saved)) g[k] = saved[k]
})

describe("useScreenCapture exit paths", () => {
  it("stops the capture tracks when MediaRecorder construction fails", async () => {
    g.MediaRecorder = class {
      constructor() {
        throw new Error("NotSupportedError: vp9 unsupported")
      }
    }
    const ok = await api?.startRecording()
    expect(ok).toBe(false)
    expect(stopped).toBe(1)
  })
})
