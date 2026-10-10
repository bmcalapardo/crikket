import { describe, expect, it } from "bun:test"
import {
  pickRecorderMimeType,
  resolveRecordingMimeType,
} from "../lib/recorder-mime"
import {
  submittedDurationMs,
  trimStartOffsetMs,
  videoToSubmit,
} from "../lib/video-trim"
import {
  analyzeWebm,
  isTrimmableMimeType,
  snapToKeyframes,
  trimUnavailableMessage,
  trimWebm,
  WebmTrimError,
} from "../lib/webm-trim"
import { buildWebm, frames } from "./webm-fixture"

// --- Tests ------------------------------------------------------------------

describe("analyzeWebm", () => {
  it("finds keyframes and duration in a MediaRecorder-style stream", () => {
    const bytes = buildWebm({
      frames: frames(6),
      unknownSegment: true,
      unknownCluster: true,
    })
    const analysis = analyzeWebm(bytes)
    expect(analysis.keyframesMs).toEqual([0, 1000, 2000, 3000, 4000, 5000])
    expect(analysis.durationMs).toBe(6000)
    expect(analysis.maxKeyframeGapMs).toBe(1000)
  })

  it("reads known-size structure and BlockGroup keyframes", () => {
    const bytes = buildWebm({ frames: frames(3), withBlockGroup: true })
    expect(analyzeWebm(bytes).keyframesMs).toEqual([0, 1000, 2000])
  })

  it("treats only video keyframes as cut points when audio is present", () => {
    const bytes = buildWebm({ frames: frames(3), audio: true })
    expect(analyzeWebm(bytes).keyframesMs).toEqual([0, 1000, 2000])
  })

  it("rejects non-WebM data as an unsupported container", () => {
    const mp4 = Uint8Array.from([
      0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0,
      0x69, 0x73, 0x6f, 0x6d, 0x6d, 0x70, 0x34, 0x31,
    ])
    expect(() => analyzeWebm(mp4)).toThrow(WebmTrimError)
    try {
      analyzeWebm(mp4)
    } catch (error) {
      expect((error as WebmTrimError).reason).toBe("unsupported-container")
    }
  })

  it("rejects a non-webm Matroska doctype it does not know", () => {
    const bytes = buildWebm({ frames: frames(2), docType: "other" })
    expect(() => analyzeWebm(bytes)).toThrow(WebmTrimError)
  })

  it("tolerates a truncated final block", () => {
    const bytes = buildWebm({
      frames: frames(3),
      unknownSegment: true,
      unknownCluster: true,
    })
    const analysis = analyzeWebm(bytes.subarray(0, bytes.length - 3))
    expect(analysis.keyframesMs).toEqual([0, 1000, 2000])
  })
})

describe("snapToKeyframes", () => {
  const analysis = { durationMs: 6000, keyframesMs: [0, 1000, 2000, 3000] }

  it("snaps to the nearest keyframe, within half a GOP", () => {
    expect(snapToKeyframes(analysis, 1400, 3600)).toEqual({
      startMs: 1000,
      endMs: 3000,
    })
    expect(snapToKeyframes(analysis, 1600, 5000)).toEqual({
      startMs: 2000,
      endMs: 6000,
    })
  })

  it("never returns an empty range", () => {
    const cut = snapToKeyframes(analysis, 2000, 2100)
    expect(cut.startMs).toBe(2000)
    expect(cut.endMs).toBeGreaterThan(cut.startMs)
  })
})

describe("trimWebm", () => {
  it("starts the output at keyframe 0 and rebases timecodes", () => {
    const source = buildWebm({
      frames: frames(6),
      unknownSegment: true,
      unknownCluster: true,
    })
    const result = trimWebm(source, 2050, 4020)
    expect(result.startMs).toBe(2000)
    expect(result.endMs).toBe(4000)
    expect(result.durationMs).toBe(2000)

    const out = analyzeWebm(result.bytes)
    expect(out.keyframesMs).toEqual([0, 1000])
    expect(out.durationMs).toBe(2000)
  })

  it("keeps the tail when the end is past the last keyframe", () => {
    const source = buildWebm({ frames: frames(6) })
    const result = trimWebm(source, 3000, 99_999)
    expect(result.endMs).toBe(6000)
    const out = analyzeWebm(result.bytes)
    expect(out.keyframesMs).toEqual([0, 1000, 2000])
    expect(out.durationMs).toBe(3000)
  })

  it("keeps audio blocks in range and drops those outside", () => {
    const source = buildWebm({ frames: frames(4), audio: true })
    const result = trimWebm(source, 1000, 3000)
    const out = analyzeWebm(result.bytes)
    expect(out.keyframesMs).toEqual([0, 1000])
    // 20 frames x (video + audio) in range.
    const sizeInRange = result.bytes.length
    expect(sizeInRange).toBeLessThan(source.length)
  })

  it("preserves BlockGroup frames", () => {
    const source = buildWebm({ frames: frames(4), withBlockGroup: true })
    const result = trimWebm(source, 1000, 3000)
    expect(analyzeWebm(result.bytes).keyframesMs).toEqual([0, 1000])
  })

  it("output is itself trimmable (valid known-size structure)", () => {
    const source = buildWebm({
      frames: frames(8),
      unknownSegment: true,
      unknownCluster: true,
    })
    const once = trimWebm(source, 1000, 7000)
    const twice = trimWebm(once.bytes, 2000, 4000)
    expect(twice.startMs).toBe(2000)
    expect(twice.durationMs).toBe(2000)
    // Composed offset from the original recording.
    expect(once.startMs + twice.startMs).toBe(3000)
  })

  it("throws for unsupported containers rather than emitting a file", () => {
    expect(() => trimWebm(Uint8Array.from([0, 0, 0, 24, 102]), 0, 1)).toThrow(
      WebmTrimError
    )
  })
})

describe("mime handling", () => {
  it("prefers vp9, then vp8, plain webm, then mp4", () => {
    expect(pickRecorderMimeType(() => true)).toBe("video/webm;codecs=vp9")
    expect(pickRecorderMimeType((t) => !t.includes("vp9"))).toBe(
      "video/webm;codecs=vp8"
    )
    expect(pickRecorderMimeType((t) => t === "video/webm")).toBe("video/webm")
    expect(pickRecorderMimeType((t) => t === "video/mp4")).toBe("video/mp4")
  })

  it("falls back to the browser default when nothing matches or probing fails", () => {
    expect(pickRecorderMimeType(() => false)).toBeUndefined()
    expect(pickRecorderMimeType(undefined)).toBeUndefined()
    expect(
      pickRecorderMimeType(() => {
        throw new Error("boom")
      })
    ).toBeUndefined()
  })

  it("reads the recorder's real type", () => {
    expect(resolveRecordingMimeType("video/webm;codecs=vp8", "x")).toBe(
      "video/webm;codecs=vp8"
    )
    expect(resolveRecordingMimeType("", "video/mp4")).toBe("video/mp4")
    expect(resolveRecordingMimeType(undefined, undefined)).toBe("video/webm")
  })

  it("only allows trimming WebM/Matroska and explains why otherwise", () => {
    expect(isTrimmableMimeType("video/webm;codecs=vp9")).toBe(true)
    expect(isTrimmableMimeType("video/mp4")).toBe(false)
    expect(trimUnavailableMessage("video/mp4;codecs=avc1")).toContain(
      "video/mp4"
    )
  })
})

describe("video trim state", () => {
  const original = new Blob(["orig"])
  const trimmed = new Blob(["t"])
  const trim = { blob: trimmed, startMs: 2000, endMs: 4000, durationMs: 2000 }

  it("submits the trim but leaves the original available", () => {
    expect(videoToSubmit(original, trim)).toBe(trimmed)
    expect(videoToSubmit(original, null)).toBe(original)
  })

  it("exposes the real start offset and the trimmed duration", () => {
    expect(trimStartOffsetMs(trim)).toBe(2000)
    expect(trimStartOffsetMs(null)).toBe(0)
    expect(submittedDurationMs(trim, 9000)).toBe(2000)
    expect(submittedDurationMs(null, 9000)).toBe(9000)
  })
})
