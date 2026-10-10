import { describe, expect, it } from "bun:test"
import fc from "fast-check"
import {
  createPausableRecorder,
  type RecorderLike,
} from "../lib/pausable-recording"

type Cmd =
  | { t: "start" }
  | { t: "pause" }
  | { t: "resume" }
  | { t: "stop" }
  | { t: "dispose" }
  | { t: "trackEnded" }
  | { t: "chunk" }
  | { t: "tick"; ms: number }

const cmd: fc.Arbitrary<Cmd> = fc.oneof(
  fc.constant({ t: "start" } as const),
  fc.constant({ t: "pause" } as const),
  fc.constant({ t: "resume" } as const),
  fc.constant({ t: "stop" } as const),
  fc.constant({ t: "dispose" } as const),
  fc.constant({ t: "trackEnded" } as const),
  fc.constant({ t: "chunk" } as const),
  fc.integer({ min: 0, max: 5000 }).map((ms) => ({ t: "tick", ms }) as const)
)

function fakeRecorder() {
  let state: RecorderLike["state"] = "inactive"
  let stops = 0
  const r: RecorderLike = {
    ondataavailable: null,
    onstop: null,
    get state() {
      return state
    },
    start() {
      if (state !== "inactive") throw new Error("start twice")
      state = "recording"
    },
    pause() {
      if (state !== "recording") throw new Error("bad pause")
      state = "paused"
    },
    resume() {
      if (state !== "paused") throw new Error("bad resume")
      state = "recording"
    },
    stop() {
      if (state === "inactive") throw new Error("double stop")
      stops += 1
      state = "inactive"
      queueMicrotask(() => r.onstop?.())
    },
  }
  return { r, stops: () => stops }
}

describe("pausable recorder: model based", () => {
  it("matches a reference model over random command sequences", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(cmd, { maxLength: 60 }), async (cmds) => {
        let clock = 1000
        const { r, stops } = fakeRecorder()
        const rec = createPausableRecorder({ now: () => clock, recorder: r })
        // reference model
        let m: "idle" | "recording" | "paused" | "stopped" = "idle"
        let acc = 0
        let seg = 0
        let chunks = 0
        let expectedStops = 0
        const dur = () => (m === "recording" ? acc + (clock - seg) : acc)

        for (const c of cmds) {
          switch (c.t) {
            case "tick":
              clock += c.ms
              break
            case "start":
              rec.start()
              if (m === "idle") {
                m = "recording"
                seg = clock
              }
              break
            case "pause": {
              const res = rec.pause()
              expect(res).toBe(m === "recording")
              if (m === "recording") {
                acc += clock - seg
                m = "paused"
              }
              break
            }
            case "resume": {
              const res = rec.resume()
              expect(res).toBe(m === "paused")
              if (m === "paused") {
                seg = clock
                m = "recording"
              }
              break
            }
            case "chunk":
              // A real MediaRecorder emits only while recording.
              if (r.state === "recording") {
                r.ondataavailable?.({ data: new Blob(["x"]) })
                if (m === "recording") chunks += 1
              }
              break
            case "stop": {
              const res = await rec.stop()
              if (m === "recording" || m === "paused") {
                expect(res).not.toBeNull()
                expect(res?.durationMs).toBe(dur())
                expect(res?.chunks.length).toBe(chunks)
                acc = dur()
                m = "stopped"
                expectedStops += 1
              } else {
                expect(res).toBeNull()
              }
              break
            }
            case "trackEnded":
            case "dispose":
              rec.dispose()
              if (m === "recording" || m === "paused") {
                acc = dur()
                m = "stopped"
                expectedStops += 1
              }
              break
            default:
              break
          }
          expect(rec.getDurationMs()).toBe(m === "idle" ? 0 : dur())
          expect(stops()).toBe(expectedStops)
          expect(stops()).toBeLessThanOrEqual(1)
        }
      }),
      { numRuns: 500, seed: 20_260_310 }
    )
  })
})
