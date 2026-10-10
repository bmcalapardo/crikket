// biome-ignore-all lint/suspicious/noBitwiseOperators: EBML is a bit-level binary format
/** Builds synthetic WebM files (EBML bytes) for the trim tests. */
// --- Synthetic WebM builder -------------------------------------------------

const enc = (n: number): number[] => {
  const out: number[] = []
  let v = n
  do {
    out.unshift(v % 256)
    v = Math.floor(v / 256)
  } while (v > 0)
  return out
}
const idBytes = (id: number) => enc(id)
const UNKNOWN = [0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]
// Sizes up to 16383 via 2-byte vint.
const el = (id: number, payload: number[]) => {
  if (payload.length < 127) {
    return [...idBytes(id), 0x80 | payload.length, ...payload]
  }
  return [
    ...idBytes(id),
    0x40 | (payload.length >> 8),
    payload.length & 0xff,
    ...payload,
  ]
}
const str = (s: string) => [...s].map((c) => c.charCodeAt(0))

export function simpleBlock(
  track: number,
  rel: number,
  key: boolean,
  fill: number
) {
  const r = rel < 0 ? rel + 0x1_00_00 : rel
  return el(0xa3, [
    0x80 | track,
    r >> 8,
    r & 0xff,
    key ? 0x80 : 0x00,
    fill,
    fill,
    fill,
  ])
}

export interface Frame {
  key: boolean
  ms: number
}

export interface BuildOptions {
  audio?: boolean
  docType?: string
  /** Frames per cluster; clusters start at their first frame's time. */
  framesPerCluster?: number
  frames: Frame[]
  unknownCluster?: boolean
  unknownSegment?: boolean
  withBlockGroup?: boolean
}

export function buildWebm(opts: BuildOptions): Uint8Array {
  const header = el(0x1a_45_df_a3, [
    ...el(0x42_82, str(opts.docType ?? "webm")),
  ])
  const info = el(0x15_49_a9_66, [
    ...el(0x2a_d7_b1, enc(1_000_000)),
    ...el(0x4d_80, str("synthetic")),
  ])
  const tracks = el(0x16_54_ae_6b, [
    ...el(0xae, [...el(0xd7, [1]), ...el(0x83, [1])]),
    ...(opts.audio ? el(0xae, [...el(0xd7, [2]), ...el(0x83, [2])]) : []),
  ])
  const per = opts.framesPerCluster ?? 4
  const clusters: number[] = []
  for (let i = 0; i < opts.frames.length; i += per) {
    const slice = opts.frames.slice(i, i + per)
    const base = (slice[0] as Frame).ms
    const children: number[] = [...el(0xe7, enc(base))]
    for (const f of slice) {
      if (opts.withBlockGroup && !f.key) {
        // Non-key frame as a BlockGroup with a ReferenceBlock.
        const rel = f.ms - base
        children.push(
          ...el(0xa0, [
            ...el(0xa1, [0x81, rel >> 8, rel & 0xff, 0x00, 7, 7, 7]),
            ...el(0xfb, [0xff]),
          ])
        )
      } else {
        children.push(...simpleBlock(1, f.ms - base, f.key, 9))
      }
      if (opts.audio) {
        children.push(...simpleBlock(2, f.ms - base, false, 5))
      }
    }
    if (opts.unknownCluster) {
      clusters.push(...idBytes(0x1f_43_b6_75), ...UNKNOWN, ...children)
    } else {
      clusters.push(...el(0x1f_43_b6_75, children))
    }
  }
  const body = [...info, ...tracks, ...clusters]
  const segment = opts.unknownSegment
    ? [...idBytes(0x18_53_80_67), ...UNKNOWN, ...body]
    : [
        ...idBytes(0x18_53_80_67),
        0x01,
        0,
        0,
        0,
        (body.length >> 24) & 0xff,
        (body.length >> 16) & 0xff,
        (body.length >> 8) & 0xff,
        body.length & 0xff,
        ...body,
      ]
  return Uint8Array.from([...header, ...segment])
}

/** 10 fps, a keyframe every 1s, `seconds` long. */
export function frames(seconds: number): Frame[] {
  return Array.from({ length: seconds * 10 }, (_, i) => ({
    ms: i * 100,
    key: i % 10 === 0,
  }))
}
