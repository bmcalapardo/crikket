// biome-ignore-all lint/suspicious/noBitwiseOperators: seeded PRNG and EBML bytes
import { describe, expect, it } from "bun:test"
import {
  pickRecorderMimeType,
  resolveRecordingMimeType,
} from "../lib/recorder-mime"
import { currentTrim, type VideoTrim } from "../lib/video-trim"
import {
  analyzeWebm,
  snapToKeyframes,
  trimWebm,
  WebmTrimError,
} from "../lib/webm-trim"
import { buildWebm, frames } from "./webm-fixture"

/** mulberry32: small seeded PRNG so failures reproduce. */
function prng(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d_2b_79_f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    const mixed = t + Math.imul(t ^ (t >>> 7), 61 | t)
    t ^= mixed
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

function mustOnlyThrowTrimError(bytes: Uint8Array) {
  try {
    const a = analyzeWebm(bytes)
    const r = trimWebm(bytes, 0, a.durationMs / 2)
    if (r.bytes.length > bytes.length + 4096 || r.endMs <= r.startMs) {
      throw new Error("trim output out of bounds")
    }
  } catch (error) {
    if (!(error instanceof WebmTrimError)) {
      throw error
    }
  }
}

describe("webm-trim fuzz", () => {
  const base = buildWebm({
    frames: frames(8),
    audio: true,
    withBlockGroup: true,
  })

  it("never throws anything but WebmTrimError on truncation", () => {
    for (let n = 0; n < base.length; n++) {
      mustOnlyThrowTrimError(base.slice(0, n))
    }
  })

  it("survives seeded bit flips and byte stomps", () => {
    const rand = prng(1234)
    const stomps = [0x00, 0xff, 0x01, 0x80, 0x7f]
    for (let i = 0; i < 3000; i++) {
      const copy = base.slice()
      const flips = 1 + Math.floor(rand() * 6)
      for (let f = 0; f < flips; f++) {
        const at = Math.floor(rand() * copy.length)
        copy[at] =
          rand() < 0.5
            ? (copy[at] as number) ^ (1 << Math.floor(rand() * 8))
            : (stomps[Math.floor(rand() * stomps.length)] as number)
      }
      mustOnlyThrowTrimError(copy)
    }
  })

  it("survives random bytes with a valid prefix", () => {
    const rand = prng(99)
    for (let i = 0; i < 500; i++) {
      const tail = Uint8Array.from({ length: 200 }, () =>
        Math.floor(rand() * 256)
      )
      const head = base.slice(0, 40 + Math.floor(rand() * 60))
      const all = new Uint8Array(head.length + tail.length)
      all.set(head)
      all.set(tail, head.length)
      mustOnlyThrowTrimError(all)
      mustOnlyThrowTrimError(tail)
    }
  })

  it("rejects a zero timecode scale as malformed", () => {
    const bytes = buildWebm({ frames: frames(3) })
    const at = bytes.findIndex(
      (b, i) => b === 0x2a && bytes[i + 1] === 0xd7 && bytes[i + 2] === 0xb1
    )
    const copy = bytes.slice()
    copy[at + 4] = 0
    copy[at + 5] = 0
    copy[at + 6] = 0
    expect(() => analyzeWebm(copy)).toThrow(WebmTrimError)
  })

  it("rejects a huge DocType without a giant argument list", () => {
    const header = [0x1a, 0x45, 0xdf, 0xa3, 0x01, 0, 0, 0, 0, 0x06, 0x1a, 0xaa]
    const doc = [0x42, 0x82, 0x01, 0, 0, 0, 0, 0x06, 0x1a, 0x80]
    const out = new Uint8Array(header.length + doc.length + 400_000).fill(0x61)
    out.set(header)
    out.set(doc, header.length)
    expect(() => analyzeWebm(out)).toThrow(WebmTrimError)
  })

  it("rejects oversized sizes and unknown sizes in odd places", () => {
    const huge = Uint8Array.from([
      0x1a, 0x45, 0xdf, 0xa3, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
      0x18, 0x53, 0x80, 0x67, 0x01, 0x00, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    ])
    expect(() => analyzeWebm(huge)).toThrow(WebmTrimError)
    mustOnlyThrowTrimError(Uint8Array.from([0xff, 0xff, 0xff, 0xff, 0xff]))
    mustOnlyThrowTrimError(new Uint8Array(0))
    mustOnlyThrowTrimError(new Uint8Array(64))
  })
})

describe("webm-trim structure edge cases", () => {
  it("drops a block cut off by truncation instead of keeping a stub", () => {
    const bytes = buildWebm({ frames: frames(4), framesPerCluster: 4 })
    const out = trimWebm(bytes.slice(0, bytes.length - 2), 0, 10_000)
    expect(analyzeWebm(out.bytes).keyframesMs.length).toBeGreaterThan(0)
  })

  it("handles a recording with a single keyframe", () => {
    const fr = [
      { ms: 0, key: true },
      { ms: 33, key: false },
      { ms: 66, key: false },
    ]
    const out = trimWebm(buildWebm({ frames: fr }), 40, 60)
    expect(out.startMs).toBe(0)
    expect(out.endMs).toBeGreaterThan(0)
  })

  it("rejects a recording with no keyframes", () => {
    const bytes = buildWebm({
      frames: [
        { ms: 0, key: false },
        { ms: 33, key: false },
      ],
    })
    expect(() => trimWebm(bytes, 0, 100)).toThrow(WebmTrimError)
  })

  it("starts at zero even if the recording timestamps do not", () => {
    const shifted = frames(4).map((f) => ({ ...f, ms: f.ms + 7000 }))
    const bytes = buildWebm({ frames: shifted })
    expect(analyzeWebm(bytes).keyframesMs[0]).toBe(0)
    const out = trimWebm(bytes, 1000, 3000)
    expect(analyzeWebm(out.bytes).keyframesMs[0]).toBe(0)
  })

  it("preserves a pause gap in media timestamps when trimming around it", () => {
    const fr = [
      ...frames(2),
      { ms: 9000, key: true },
      { ms: 9033, key: false },
      { ms: 10_000, key: true },
    ]
    const bytes = buildWebm({ frames: fr, framesPerCluster: 2 })
    const out = trimWebm(bytes, 1000, 10_000)
    expect(out.startMs).toBe(1000)
    expect(out.endMs).toBe(10_000)
    expect(analyzeWebm(out.bytes).keyframesMs).toEqual([0, 8000])
  })

  it("keeps non-monotonic relative timecodes intact", () => {
    const bytes = buildWebm({
      frames: [
        { ms: 1000, key: true },
        { ms: 1500, key: false },
        { ms: 2000, key: true },
        { ms: 2500, key: false },
      ],
      framesPerCluster: 4,
    })
    const out = trimWebm(bytes, 0, 10_000)
    expect(analyzeWebm(out.bytes).keyframesMs).toEqual([0, 1000])
  })

  it("ignores blocks for tracks Tracks never declared", () => {
    const bytes = buildWebm({ frames: frames(3) })
    // Track number byte of the first SimpleBlock: 0x81 -> 0x85 (undeclared).
    const at = bytes.findIndex((b, i) => b === 0xa3 && bytes[i + 2] === 0x81)
    const copy = bytes.slice()
    copy[at + 2] = 0x85
    const a = analyzeWebm(copy)
    // The first keyframe vanished; the remaining two are still 1 s apart.
    expect(a.keyframesMs.length).toBe(2)
    expect((a.keyframesMs[1] as number) - (a.keyframesMs[0] as number)).toBe(
      1000
    )
  })

  it("splits clusters whose rebased offsets would overflow int16", () => {
    const fr = [
      { ms: 0, key: true },
      { ms: 100, key: true },
      { ms: 200, key: true },
    ]
    const bytes = buildWebm({ frames: fr, framesPerCluster: 3 })
    const copy = bytes.slice()
    const blocks: number[] = []
    copy.forEach((v, i) => {
      if (v === 0xa3 && copy[i + 1] === 0x87) blocks.push(i)
    })
    // Second block at -30000 and third at +30000 relative to the cluster.
    copy[(blocks[1] as number) + 3] = 0x8a
    copy[(blocks[1] as number) + 4] = 0xd0
    copy[(blocks[2] as number) + 3] = 0x75
    copy[(blocks[2] as number) + 4] = 0x30
    const before = analyzeWebm(copy)
    const out = trimWebm(copy, 0, 1e9)
    const again = analyzeWebm(out.bytes)
    expect(again.keyframesMs).toEqual(before.keyframesMs)
    expect(again.durationMs).toBe(before.durationMs)
  })

  it("re-trimming an already trimmed file is stable", () => {
    const bytes = buildWebm({ frames: frames(8) })
    const once = trimWebm(bytes, 2000, 6000)
    const twice = trimWebm(once.bytes, 0, once.durationMs)
    expect(twice.durationMs).toBe(once.durationMs)
    const inner = trimWebm(once.bytes, 1000, 3000)
    expect(inner.startMs).toBe(1000)
    expect(analyzeWebm(inner.bytes).keyframesMs[0]).toBe(0)
  })
})

describe("snapToKeyframes with hostile input", () => {
  const analysis = { keyframesMs: [0, 1000, 2000], durationMs: 3000 }

  it("treats NaN as no preference and clamps infinities", () => {
    expect(snapToKeyframes(analysis, Number.NaN, Number.NaN)).toEqual({
      startMs: 0,
      endMs: 3000,
    })
    expect(
      snapToKeyframes(
        analysis,
        Number.NEGATIVE_INFINITY,
        Number.POSITIVE_INFINITY
      )
    ).toEqual({ startMs: 0, endMs: 3000 })
  })

  it("never yields an empty range", () => {
    const cases: [number, number][] = [
      [2000, 0],
      [1000, 1000],
      [9e9, 9e9],
      [-5, -5],
      [2999, 3000],
    ]
    for (const [s, e] of cases) {
      const cut = snapToKeyframes(analysis, s, e)
      expect(cut.endMs).toBeGreaterThan(cut.startMs)
    }
  })
})

describe("stale trims", () => {
  it("ignores a trim cut from a different capture", () => {
    const a = new Blob(["a"])
    const b = new Blob(["b"])
    const trim: VideoTrim = {
      blob: new Blob(["t"]),
      source: a,
      startMs: 0,
      endMs: 1,
      durationMs: 1,
    }
    expect(currentTrim(a, trim)).toBe(trim)
    expect(currentTrim(b, trim)).toBeNull()
    expect(currentTrim(null, trim)).toBeNull()
  })
})

describe("stress", () => {
  /** Hour-long recording with audio (5 s clusters), built without spreads. */
  function hourLong(): Uint8Array {
    const parts: Uint8Array[] = []
    const push = (...b: number[]) => parts.push(Uint8Array.from(b))
    push(0x1a, 0x45, 0xdf, 0xa3, 0x87, 0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d)
    push(0x18, 0x53, 0x80, 0x67, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff)
    push(0x15, 0x49, 0xa9, 0x66, 0x87, 0x2a, 0xd7, 0xb1, 0x83, 0x0f, 0x42, 0x40)
    push(
      ...[0x16, 0x54, 0xae, 0x6b, 0x90],
      ...[0xae, 0x86, 0xd7, 0x81, 0x01, 0x83, 0x81, 0x01],
      ...[0xae, 0x86, 0xd7, 0x81, 0x02, 0x83, 0x81, 0x02]
    )
    for (let c = 0; c < 720; c++) {
      const kids: number[] = []
      const base = c * 5000
      kids.push(
        0xe7,
        0x83,
        (base >> 16) & 0xff,
        (base >> 8) & 0xff,
        base & 0xff
      )
      for (let f = 0; f < 150; f++) {
        const rel = Math.round(f * 33.33)
        kids.push(0xa3, 0x87, 0x81, rel >> 8, rel & 0xff, f === 0 ? 0x80 : 0)
        kids.push(1, 2, 3)
      }
      for (let a = 0; a < 250; a++) {
        const rel = a * 20
        kids.push(0xa3, 0x87, 0x82, rel >> 8, rel & 0xff, 0x80, 1, 2, 3)
      }
      push(
        0x1f,
        0x43,
        0xb6,
        0x75,
        0x01,
        0xff,
        0xff,
        0xff,
        0xff,
        0xff,
        0xff,
        0xff
      )
      parts.push(Uint8Array.from(kids))
    }
    const total = parts.reduce((n, p) => n + p.length, 0)
    const out = new Uint8Array(total)
    let o = 0
    for (const p of parts) {
      out.set(p, o)
      o += p.length
    }
    return out
  }

  it("trims an hour-long recording in bounded time and size", () => {
    const bytes = hourLong()
    let best = Number.POSITIVE_INFINITY
    let result: ReturnType<typeof trimWebm> | undefined
    for (let i = 0; i < 2; i++) {
      const t = performance.now()
      result = trimWebm(bytes, 600_000, 3_000_000)
      best = Math.min(best, performance.now() - t)
    }
    expect(best).toBeLessThan(20_000)
    const r = result as ReturnType<typeof trimWebm>
    expect(r.bytes.length).toBeLessThan(bytes.length)
    expect(r.durationMs).toBeGreaterThan(2_300_000)
    expect(analyzeWebm(r.bytes).keyframesMs[0]).toBe(0)
  })
})

describe("recorder mime fallback", () => {
  it("falls back to the browser default when isTypeSupported is missing or says no", () => {
    expect(pickRecorderMimeType(undefined)).toBeUndefined()
    expect(pickRecorderMimeType(() => false)).toBeUndefined()
    expect(
      pickRecorderMimeType(() => {
        throw new Error("boom")
      })
    ).toBeUndefined()
  })

  it("picks vp8 on a Firefox-style browser without vp9 or mp4", () => {
    const firefox = (t: string) => t.startsWith("video/webm")
    expect(pickRecorderMimeType(firefox)).toBe("video/webm;codecs=vp9")
    const vp8Only = (t: string) =>
      t === "video/webm;codecs=vp8" || t === "video/webm"
    expect(pickRecorderMimeType(vp8Only)).toBe("video/webm;codecs=vp8")
  })

  it("resolves the real type, tolerating an empty recorder type", () => {
    expect(resolveRecordingMimeType("", undefined)).toBe("video/webm")
    expect(resolveRecordingMimeType("", "video/mp4")).toBe("video/mp4")
    expect(resolveRecordingMimeType("video/webm;codecs=vp8", "x")).toBe(
      "video/webm;codecs=vp8"
    )
  })
})
