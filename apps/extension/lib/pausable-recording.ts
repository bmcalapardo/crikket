/**
 * Pause/resume for a video Capture, split into two seams that can be tested
 * without a browser:
 *
 * - a pure clock (`RecordingClock`) that accounts for the playable length of
 *   the recording, i.e. the time spent recording, excluding paused stretches;
 * - a controller (`createPausableRecorder`) that keeps the clock and a
 *   MediaRecorder-shaped object in step.
 *
 * Invalid transitions (pause when not recording, resume when not paused, any
 * move after stop) are no-ops rather than errors: hotkeys, the popup and the
 * recorder page can race, and the second request must not corrupt anything.
 * Timestamps are untrusted; they are clamped so time never runs backwards.
 */

export type RecordingClock =
  | { status: "idle" }
  | {
      status: "recording"
      accumulatedMs: number
      segmentStartedAt: number
      lastSeenAt: number
    }
  | { status: "paused"; accumulatedMs: number; lastSeenAt: number }
  | { status: "stopped"; durationMs: number }

export const IDLE_CLOCK: RecordingClock = { status: "idle" }

function lastSeenAt(clock: RecordingClock, fallback: number): number {
  return clock.status === "recording" || clock.status === "paused"
    ? clock.lastSeenAt
    : fallback
}

/** Clamps an untrusted timestamp so it is finite and never before `floor`. */
function monotonic(now: number, floor: number): number {
  if (!Number.isFinite(now)) {
    return floor
  }
  return Math.max(now, floor)
}

export function startClock(now: number): RecordingClock {
  const at = Number.isFinite(now) ? now : 0
  return {
    status: "recording",
    accumulatedMs: 0,
    segmentStartedAt: at,
    lastSeenAt: at,
  }
}

export function playableDurationMs(clock: RecordingClock, now: number): number {
  switch (clock.status) {
    case "idle":
      return 0
    case "paused":
      return clock.accumulatedMs
    case "stopped":
      return clock.durationMs
    case "recording": {
      const at = monotonic(now, clock.lastSeenAt)
      return clock.accumulatedMs + (at - clock.segmentStartedAt)
    }
    default:
      return 0
  }
}

export function pauseClock(clock: RecordingClock, now: number): RecordingClock {
  if (clock.status !== "recording") {
    return clock
  }
  const at = monotonic(now, clock.lastSeenAt)
  return {
    status: "paused",
    accumulatedMs: clock.accumulatedMs + (at - clock.segmentStartedAt),
    lastSeenAt: at,
  }
}

export function resumeClock(
  clock: RecordingClock,
  now: number
): RecordingClock {
  if (clock.status !== "paused") {
    return clock
  }
  const at = monotonic(now, clock.lastSeenAt)
  return {
    status: "recording",
    accumulatedMs: clock.accumulatedMs,
    segmentStartedAt: at,
    lastSeenAt: at,
  }
}

export function stopClock(clock: RecordingClock, now: number): RecordingClock {
  if (clock.status !== "recording" && clock.status !== "paused") {
    return clock
  }
  return {
    status: "stopped",
    durationMs: playableDurationMs(clock, monotonic(now, lastSeenAt(clock, 0))),
  }
}

/** The slice of MediaRecorder that the controller depends on. */
export interface RecorderLike {
  ondataavailable: ((event: { data: Blob }) => void) | null
  onstop: (() => void) | null
  pause(): void
  readonly state: "inactive" | "paused" | "recording"
  resume(): void
  start(timeslice?: number): void
  stop(): void
}

export interface PausableRecorder {
  /** Stops the recorder if it is still live; never throws. For page teardown. */
  dispose(): void
  getChunks(): Blob[]
  getClock(): RecordingClock
  getDurationMs(): number
  /** Returns true if the recorder was paused by this call. */
  pause(): boolean
  /** Returns true if the recorder was resumed by this call. */
  resume(): boolean
  start(timeslice?: number): void
  /** Resolves null if there was nothing to stop. */
  stop(): Promise<{ chunks: Blob[]; durationMs: number } | null>
}

export function createPausableRecorder(options: {
  now: () => number
  recorder: RecorderLike
}): PausableRecorder {
  const { recorder, now } = options
  let clock: RecordingClock = IDLE_CLOCK
  let chunks: Blob[] = []
  let accepting = false
  let stopWaiters: Array<() => void> = []

  recorder.ondataavailable = (event) => {
    if (accepting && event.data.size > 0) {
      chunks.push(event.data)
    }
  }

  recorder.onstop = () => {
    accepting = false
    const waiters = stopWaiters
    stopWaiters = []
    for (const resolve of waiters) {
      resolve()
    }
  }

  return {
    start(timeslice) {
      if (clock.status !== "idle") {
        return
      }
      chunks = []
      accepting = true
      recorder.start(timeslice)
      clock = startClock(now())
    },

    pause() {
      if (clock.status !== "recording" || recorder.state !== "recording") {
        return false
      }
      recorder.pause()
      clock = pauseClock(clock, now())
      return true
    },

    resume() {
      if (clock.status !== "paused" || recorder.state !== "paused") {
        return false
      }
      recorder.resume()
      clock = resumeClock(clock, now())
      return true
    },

    async stop() {
      if (
        (clock.status !== "recording" && clock.status !== "paused") ||
        recorder.state === "inactive"
      ) {
        return null
      }
      const finished = new Promise<void>((resolve) => {
        stopWaiters.push(resolve)
      })
      clock = stopClock(clock, now())
      recorder.stop()
      await finished
      return { chunks: [...chunks], durationMs: playableDurationMs(clock, 0) }
    },

    dispose() {
      try {
        if (recorder.state !== "inactive") {
          clock = stopClock(clock, now())
          recorder.stop()
        }
      } catch {
        // The recorder is already gone; nothing left to release.
      }
      accepting = false
    },

    getChunks: () => [...chunks],
    getClock: () => clock,
    getDurationMs: () => playableDurationMs(clock, now()),
  }
}
