import { describe, expect, it } from "bun:test"
import {
  createPausableRecorder,
  IDLE_CLOCK,
  pauseClock,
  playableDurationMs,
  type RecorderLike,
  resumeClock,
  startClock,
  stopClock,
} from "../lib/pausable-recording"

describe("recording clock", () => {
  it("excludes paused stretches from the playable duration", () => {
    let clock = startClock(1000)
    clock = pauseClock(clock, 3000) // 2s recorded
    expect(playableDurationMs(clock, 99_000)).toBe(2000)
    clock = resumeClock(clock, 50_000) // 47s paused, not counted
    expect(playableDurationMs(clock, 51_000)).toBe(3000)
    expect(stopClock(clock, 53_000)).toEqual({
      status: "stopped",
      durationMs: 5000,
    })
  })

  it("stops while paused without counting the pause", () => {
    const clock = pauseClock(startClock(0), 4000)
    expect(stopClock(clock, 1_000_000)).toEqual({
      status: "stopped",
      durationMs: 4000,
    })
  })

  it("ignores invalid transitions", () => {
    const recording = startClock(0)
    const paused = pauseClock(recording, 10)
    expect(pauseClock(paused, 20)).toBe(paused)
    expect(resumeClock(recording, 20)).toBe(recording)
    expect(pauseClock(IDLE_CLOCK, 5)).toBe(IDLE_CLOCK)
    expect(resumeClock(IDLE_CLOCK, 5)).toBe(IDLE_CLOCK)
    expect(stopClock(IDLE_CLOCK, 5)).toBe(IDLE_CLOCK)
    const stopped = stopClock(recording, 100)
    expect(pauseClock(stopped, 200)).toBe(stopped)
    expect(resumeClock(stopped, 200)).toBe(stopped)
    expect(stopClock(stopped, 300)).toBe(stopped)
  })

  it("never lets time run backwards or produce NaN", () => {
    let clock = startClock(10_000)
    clock = pauseClock(clock, 12_000)
    // The clock jumps back before the pause, then yields NaN.
    clock = resumeClock(clock, 5000)
    expect(playableDurationMs(clock, 1000)).toBe(2000)
    expect(playableDurationMs(clock, Number.NaN)).toBe(2000)
    clock = pauseClock(clock, Number.NaN)
    expect(playableDurationMs(clock, 0)).toBe(2000)
    clock = resumeClock(clock, 12_500)
    clock = stopClock(clock, 12_400) // out of order stop
    expect(clock).toEqual({ status: "stopped", durationMs: 2000 })
  })

  it("never reports a negative or non-finite duration for any garbage", () => {
    const garbage = [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      -1,
      0,
      Number.MAX_SAFE_INTEGER,
    ]
    for (const a of garbage) {
      for (const b of garbage) {
        for (const c of garbage) {
          const clock = stopClock(
            resumeClock(pauseClock(startClock(a), b), c),
            a
          )
          const ms = playableDurationMs(clock, b)
          expect(Number.isFinite(ms)).toBe(true)
          expect(ms).toBeGreaterThanOrEqual(0)
        }
      }
    }
  })
})

/** MediaRecorder behaving per spec: events are async, bad calls throw. */
class FakeRecorder implements RecorderLike {
  state: "inactive" | "paused" | "recording" = "inactive"
  ondataavailable: ((event: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  seq = 0

  start() {
    if (this.state !== "inactive") {
      throw new Error("InvalidStateError")
    }
    this.state = "recording"
  }
  pause() {
    if (this.state === "inactive") {
      throw new Error("InvalidStateError")
    }
    this.state = "paused"
  }
  resume() {
    if (this.state === "inactive") {
      throw new Error("InvalidStateError")
    }
    this.state = "recording"
  }
  stop() {
    if (this.state === "inactive") {
      throw new Error("InvalidStateError")
    }
    this.state = "inactive"
    queueMicrotask(() => {
      this.emit()
      this.onstop?.()
    })
  }
  /** One timeslice elapsing; the real recorder emits nothing while paused. */
  tick() {
    if (this.state === "recording") {
      this.emit()
    }
  }
  private emit() {
    this.ondataavailable?.({ data: new Blob([`${this.seq++},`]) })
  }
}

function setup() {
  let t = 0
  const recorder = new FakeRecorder()
  const rec = createPausableRecorder({ now: () => t, recorder })
  return {
    rec,
    recorder,
    advance: (ms: number) => {
      t += ms
    },
    setTime: (ms: number) => {
      t = ms
    },
  }
}

describe("pausable recorder", () => {
  it("start, pause, resume, stop yields the playable length", async () => {
    const { rec, recorder, advance } = setup()
    rec.start(1000)
    advance(2000)
    recorder.tick()
    expect(rec.pause()).toBe(true)
    expect(recorder.state).toBe("paused")
    advance(300_000)
    recorder.tick() // nothing is emitted while paused
    expect(rec.getDurationMs()).toBe(2000)
    expect(rec.resume()).toBe(true)
    advance(1500)
    recorder.tick()
    const result = await rec.stop()
    expect(result?.durationMs).toBe(3500)
    expect(await new Blob(result?.chunks ?? []).text()).toBe("0,1,2,")
  })

  it("stops while paused", async () => {
    const { rec, recorder, advance } = setup()
    rec.start()
    advance(1000)
    rec.pause()
    advance(60_000)
    const result = await rec.stop()
    expect(recorder.state).toBe("inactive")
    expect(result?.durationMs).toBe(1000)
  })

  it("ignores double pause, resume when not paused and calls after stop", async () => {
    const { rec, advance } = setup()
    expect(rec.pause()).toBe(false)
    expect(rec.resume()).toBe(false)
    expect(await rec.stop()).toBeNull()
    rec.start()
    advance(100)
    expect(rec.resume()).toBe(false)
    expect(rec.pause()).toBe(true)
    expect(rec.pause()).toBe(false)
    advance(100)
    expect(rec.resume()).toBe(true)
    expect(rec.resume()).toBe(false)
    advance(100)
    const first = await rec.stop()
    expect(first?.durationMs).toBe(200)
    expect(rec.pause()).toBe(false)
    expect(rec.resume()).toBe(false)
    expect(await rec.stop()).toBeNull()
    expect(rec.getDurationMs()).toBe(200)
  })

  it("does not start twice", () => {
    const { rec } = setup()
    rec.start()
    expect(() => rec.start()).not.toThrow()
    expect(rec.getClock().status).toBe("recording")
  })

  it("keeps the clock unchanged if the recorder refuses to pause", () => {
    const { rec, recorder, advance } = setup()
    rec.start()
    advance(500)
    recorder.pause = () => {
      throw new Error("InvalidStateError")
    }
    expect(() => rec.pause()).toThrow()
    expect(rec.getClock().status).toBe("recording")
    advance(500)
    expect(rec.getDurationMs()).toBe(1000)
  })

  it("survives 2000 rapid pause/resume cycles with an exact duration and ordered chunks", async () => {
    const { rec, recorder, advance } = setup()
    rec.start(1000)
    let expectedMs = 0
    for (let i = 0; i < 2000; i++) {
      advance(7) // recorded
      expectedMs += 7
      recorder.tick()
      expect(rec.pause()).toBe(true)
      advance(13) // paused
      recorder.tick()
      expect(rec.resume()).toBe(true)
    }
    advance(5)
    expectedMs += 5
    const result = await rec.stop()
    expect(result?.durationMs).toBe(expectedMs)
    // 2000 live ticks plus the final flush on stop, in order, no gaps.
    const seqs = (await new Blob(result?.chunks ?? []).text())
      .split(",")
      .filter(Boolean)
      .map(Number)
    expect(seqs).toHaveLength(2001)
    expect(seqs).toEqual(seqs.map((_, i) => i))
  })

  it("never over-counts when the clock jumps backwards", async () => {
    const { rec, advance, setTime } = setup()
    setTime(100_000)
    rec.start()
    advance(1000)
    rec.pause()
    setTime(50_000) // NTP step back during the pause
    rec.resume()
    advance(1000)
    setTime(10_000) // and again while recording
    const result = await rec.stop()
    // The second segment is lost to the clamp, never inflated. Production
    // feeds performance.now(), which is monotonic, so this is a backstop.
    expect(result?.durationMs).toBe(1000)
  })

  it("drops late chunks that arrive after stop finished", async () => {
    const { rec, recorder } = setup()
    rec.start()
    recorder.tick()
    const result = await rec.stop()
    recorder.ondataavailable?.({ data: new Blob(["late"]) })
    expect(result?.chunks).toHaveLength(2)
    expect(rec.getChunks()).toHaveLength(2)
  })

  it("closing the recorder page while paused releases the recorder", () => {
    const { rec, recorder, advance } = setup()
    rec.start()
    advance(1000)
    rec.pause()
    rec.dispose()
    expect(recorder.state).toBe("inactive")
    expect(() => rec.dispose()).not.toThrow()
    expect(rec.getClock()).toEqual({ status: "stopped", durationMs: 1000 })
    expect(rec.pause()).toBe(false)
  })

  it("resolves concurrent stops without hanging", async () => {
    const { rec, advance } = setup()
    rec.start()
    advance(10)
    const [a, b] = await Promise.all([rec.stop(), rec.stop()])
    expect(a?.durationMs).toBe(10)
    expect(b).toBeNull()
  })
})
