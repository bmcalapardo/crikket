// biome-ignore-all lint/suspicious/noBitwiseOperators: EBML is a bit-level binary format
/**
 * Lossless WebM/Matroska trim, with no re-encode.
 *
 * MediaRecorder output is a live stream: the Segment and Clusters often have
 * unknown sizes, and there is no Cues or Duration. This module parses just
 * enough of the EBML structure to find every Block and which video Blocks are
 * keyframes, then writes a new, well-formed file that keeps the EBML header,
 * Segment Info (plus a Duration) and Tracks, and only the Blocks from one
 * keyframe to another, with timecodes rebased so the output starts at 0.
 *
 * Because nothing is re-encoded the cut can only land on a keyframe. The cut
 * points are therefore snapped to keyframes, and callers should show the
 * snapped times. A requested point moves by at most half the gap between its
 * neighbouring keyframes, so always less than one GOP; `maxKeyframeGapMs`
 * reports the worst GOP in the recording.
 *
 * Only WebM/Matroska is supported; anything else (e.g. mp4) is reported as
 * unavailable rather than risking a corrupt file.
 */

const ID = {
  ebml: 0x1a_45_df_a3,
  segment: 0x18_53_80_67,
  seekHead: 0x11_4d_9b_74,
  info: 0x15_49_a9_66,
  tracks: 0x16_54_ae_6b,
  cluster: 0x1f_43_b6_75,
  cues: 0x1c_53_bb_6b,
  tags: 0x12_54_c3_67,
  chapters: 0x10_43_a7_70,
  attachments: 0x19_41_a4_69,
  timecodeScale: 0x2a_d7_b1,
  duration: 0x44_89,
  timecode: 0xe7,
  simpleBlock: 0xa3,
  blockGroup: 0xa0,
  block: 0xa1,
  referenceBlock: 0xfb,
  trackEntry: 0xae,
  trackNumber: 0xd7,
  trackType: 0x83,
  docType: 0x42_82,
} as const

const LEVEL1_IDS = new Set<number>([
  ID.seekHead,
  ID.info,
  ID.tracks,
  ID.cluster,
  ID.cues,
  ID.tags,
  ID.chapters,
  ID.attachments,
])

const DEFAULT_TIMECODE_SCALE = 1_000_000
const DEFAULT_FRAME_MS = 33
const VIDEO_TRACK_TYPE = 1

export type TrimUnavailableReason = "unsupported-container" | "malformed"

export class WebmTrimError extends Error {
  readonly reason: TrimUnavailableReason
  constructor(reason: TrimUnavailableReason, message: string) {
    super(message)
    this.name = "WebmTrimError"
    this.reason = reason
  }
}

export function isTrimmableMimeType(mimeType: string): boolean {
  const base = mimeType.split(";")[0]?.trim().toLowerCase() ?? ""
  return base === "video/webm" || base === "video/x-matroska"
}

export function trimUnavailableMessage(mimeType: string): string {
  const label = mimeType.split(";")[0]?.trim() || "this format"
  return `Trimming is not available for ${label} recordings. Only WebM can be trimmed without re-encoding, so the full recording will be submitted.`
}

interface Element {
  dataEnd: number
  dataStart: number
  end: number
  id: number
  start: number
  /** Declared size runs past the readable bytes (clamped to them). */
  truncated: boolean
  unknownSize: boolean
}

/** Length of an EBML variable-length integer from its first byte, or 0. */
function vintLength(first: number, max: number): number {
  for (let len = 1; len <= max; len++) {
    if (first & (0x80 >> (len - 1))) {
      return len
    }
  }
  return 0
}

/** Reads an element header at `pos`, or null if the bytes are truncated. */
function readElement(
  bytes: Uint8Array,
  pos: number,
  limit: number
): Element | null {
  const bound = Math.min(limit, bytes.length)
  if (pos >= bound) {
    return null
  }
  const idLen = vintLength(bytes[pos] as number, 4)
  if (idLen === 0 || pos + idLen >= bound) {
    return null
  }
  let id = 0
  for (let i = 0; i < idLen; i++) {
    id = id * 256 + (bytes[pos + i] as number)
  }

  const sizeStart = pos + idLen
  const sizeFirst = bytes[sizeStart] as number
  const sizeLen = vintLength(sizeFirst, 8)
  if (sizeLen === 0 || sizeStart + sizeLen > bound) {
    return null
  }
  let size = sizeFirst & (0xff >> sizeLen)
  let allOnes = size === 0xff >> sizeLen
  for (let i = 1; i < sizeLen; i++) {
    const b = bytes[sizeStart + i] as number
    size = size * 256 + b
    allOnes = allOnes && b === 0xff
  }

  const dataStart = sizeStart + sizeLen
  const declaredEnd = allOnes ? bound : dataStart + size
  const truncated = !allOnes && declaredEnd > limit
  const dataEnd = Math.min(declaredEnd, bound)
  return {
    id,
    start: pos,
    dataStart,
    dataEnd,
    end: dataEnd,
    truncated,
    unknownSize: allOnes,
  }
}

function readUint(bytes: Uint8Array, start: number, end: number): number {
  let value = 0
  for (let i = start; i < end; i++) {
    value = value * 256 + (bytes[i] as number)
  }
  return value
}

function readTrackNumber(bytes: Uint8Array, pos: number) {
  const first = bytes[pos] as number
  const len = vintLength(first, 8) || 1
  let value = first & (0xff >> len)
  for (let i = 1; i < len; i++) {
    value = value * 256 + (bytes[pos + i] as number)
  }
  return { len, value }
}

interface ParsedBlock {
  /** Absolute time in timecode units. */
  absTime: number
  isKeyframe: boolean
  raw: Uint8Array
  /** Offset of the 2-byte relative timecode, relative to `raw`. */
  timecodeOffset: number
  track: number
}

interface ParsedWebm {
  blocks: ParsedBlock[]
  /** Block indexes grouped by source cluster. */
  clusterOf: number[]
  ebmlHeader: Uint8Array
  infoChildren: Uint8Array[]
  timecodeScale: number
  tracksRaw: Uint8Array
  trackNumbers: Set<number>
  videoTrack: number | null
}

function parseBlockHeader(bytes: Uint8Array, el: Element) {
  const track = readTrackNumber(bytes, el.dataStart)
  const tcPos = el.dataStart + track.len
  if (tcPos + 3 > el.dataEnd) {
    return null
  }
  const raw = (bytes[tcPos] as number) * 256 + (bytes[tcPos + 1] as number)
  const rel = raw >= 0x80_00 ? raw - 0x1_00_00 : raw
  return { track: track.value, tcPos, rel, flags: bytes[tcPos + 2] as number }
}

function parseBlockGroup(bytes: Uint8Array, group: Element) {
  let header: ReturnType<typeof parseBlockHeader> = null
  let hasReference = false
  let pos = group.dataStart
  while (pos < group.dataEnd) {
    const sub = readElement(bytes, pos, group.dataEnd)
    if (!sub || sub.truncated || sub.dataEnd > group.dataEnd) {
      break
    }
    if (sub.id === ID.block) {
      header = parseBlockHeader(bytes, sub)
    } else if (sub.id === ID.referenceBlock) {
      hasReference = true
    }
    pos = sub.end
  }
  return { header, hasReference }
}

/**
 * Parses a Cluster's children. Returns the blocks and where the cluster
 * actually ends (which matters for unknown-size clusters).
 */
function parseCluster(
  bytes: Uint8Array,
  cluster: Element,
  clusterIndex: number,
  out: ParsedWebm
): number {
  let clusterTime = 0
  let pos = cluster.dataStart
  while (pos < cluster.dataEnd) {
    const child = readElement(bytes, pos, cluster.dataEnd)
    // An unknown-size Cluster ends at the next level-1 element.
    if (
      !child ||
      LEVEL1_IDS.has(child.id) ||
      child.unknownSize ||
      child.truncated ||
      child.dataEnd > cluster.dataEnd
    ) {
      break
    }
    if (child.id === ID.timecode) {
      clusterTime = readUint(bytes, child.dataStart, child.dataEnd)
      if (!Number.isSafeInteger(clusterTime)) {
        throw new WebmTrimError("malformed", "WebM cluster time is invalid.")
      }
    } else if (child.id === ID.simpleBlock) {
      const header = parseBlockHeader(bytes, child)
      if (header) {
        out.blocks.push({
          track: header.track,
          absTime: clusterTime + header.rel,
          isKeyframe: (header.flags & 0x80) !== 0,
          raw: bytes.subarray(child.start, child.end),
          timecodeOffset: header.tcPos - child.start,
        })
        out.clusterOf.push(clusterIndex)
      }
    } else if (child.id === ID.blockGroup) {
      const { header, hasReference } = parseBlockGroup(bytes, child)
      if (header) {
        out.blocks.push({
          track: header.track,
          absTime: clusterTime + header.rel,
          isKeyframe: !hasReference,
          raw: bytes.subarray(child.start, child.end),
          timecodeOffset: header.tcPos - child.start,
        })
        out.clusterOf.push(clusterIndex)
      }
    }
    pos = child.end
  }
  return pos
}

/** The direct children of `parent`, stopping at the first unreadable one. */
function* childrenOf(bytes: Uint8Array, parent: Element) {
  let pos = parent.dataStart
  while (pos < parent.dataEnd) {
    const child = readElement(bytes, pos, parent.dataEnd)
    if (!child) {
      return
    }
    yield child
    pos = child.end
  }
}

function scanTracks(bytes: Uint8Array, tracks: Element, out: ParsedWebm): void {
  for (const entry of childrenOf(bytes, tracks)) {
    if (entry.id !== ID.trackEntry) {
      continue
    }
    let number: number | null = null
    let type: number | null = null
    for (const sub of childrenOf(bytes, entry)) {
      if (sub.id === ID.trackNumber) {
        number = readUint(bytes, sub.dataStart, sub.dataEnd)
      } else if (sub.id === ID.trackType) {
        type = readUint(bytes, sub.dataStart, sub.dataEnd)
      }
    }
    if (number !== null) {
      out.trackNumbers.add(number)
    }
    if (
      type === VIDEO_TRACK_TYPE &&
      number !== null &&
      out.videoTrack === null
    ) {
      out.videoTrack = number
    }
  }
}

function readDocType(bytes: Uint8Array, header: Element): string {
  let pos = header.dataStart
  while (pos < header.dataEnd) {
    const el = readElement(bytes, pos, header.dataEnd)
    if (!el) {
      break
    }
    if (el.id === ID.docType) {
      // Cap the read: a hostile DocType must not become a huge argument list.
      const end = Math.min(el.dataEnd, el.dataStart + 16)
      return String.fromCharCode(...bytes.subarray(el.dataStart, end))
    }
    pos = el.end
  }
  return ""
}

function parseInfo(bytes: Uint8Array, info: Element, out: ParsedWebm) {
  let pos = info.dataStart
  while (pos < info.dataEnd) {
    const child = readElement(bytes, pos, info.dataEnd)
    if (!child) {
      break
    }
    if (child.id === ID.timecodeScale) {
      out.timecodeScale = readUint(bytes, child.dataStart, child.dataEnd)
    } else if (child.id !== ID.duration) {
      out.infoChildren.push(bytes.subarray(child.start, child.end))
    }
    pos = child.end
  }
}

function readValidatedHeader(bytes: Uint8Array): Element {
  const header = readElement(bytes, 0, bytes.length)
  if (!header || header.id !== ID.ebml || header.dataEnd > bytes.length) {
    throw new WebmTrimError(
      "unsupported-container",
      "Not a WebM/Matroska file."
    )
  }
  const docType = readDocType(bytes, header)
  if (docType !== "webm" && docType !== "matroska") {
    throw new WebmTrimError(
      "unsupported-container",
      "Not a WebM/Matroska file."
    )
  }
  return header
}

/** Drops blocks for track numbers Tracks never declared. */
function dropUnknownTracks(parsed: ParsedWebm) {
  if (parsed.trackNumbers.size === 0) {
    return
  }
  const blocks: ParsedBlock[] = []
  const clusterOf: number[] = []
  parsed.blocks.forEach((block, i) => {
    if (parsed.trackNumbers.has(block.track)) {
      blocks.push(block)
      clusterOf.push(parsed.clusterOf[i] as number)
    }
  })
  parsed.blocks = blocks
  parsed.clusterOf = clusterOf
}

function validateParsed(parsed: ParsedWebm, sawTracks: boolean): ParsedWebm {
  dropUnknownTracks(parsed)
  const scaleOk =
    parsed.timecodeScale > 0 && Number.isFinite(parsed.timecodeScale)
  if (!sawTracks || parsed.blocks.length === 0 || !scaleOk) {
    throw new WebmTrimError("malformed", "WebM has no tracks or frames.")
  }
  return parsed
}

function parseWebm(bytes: Uint8Array): ParsedWebm {
  const header = readValidatedHeader(bytes)
  const segment = readElement(bytes, header.end, bytes.length)
  if (!segment || segment.id !== ID.segment) {
    throw new WebmTrimError("malformed", "WebM has no Segment.")
  }
  const segmentEnd = Math.min(segment.dataEnd, bytes.length)

  const parsed: ParsedWebm = {
    ebmlHeader: bytes.subarray(0, header.end),
    infoChildren: [],
    timecodeScale: DEFAULT_TIMECODE_SCALE,
    tracksRaw: new Uint8Array(0),
    trackNumbers: new Set(),
    videoTrack: null,
    blocks: [],
    clusterOf: [],
  }
  let sawTracks = false
  let clusterIndex = 0

  let pos = segment.dataStart
  while (pos < segmentEnd) {
    const el = readElement(bytes, pos, segmentEnd)
    if (!el) {
      break
    }
    if (el.id === ID.cluster) {
      const end = parseCluster(bytes, el, clusterIndex++, parsed)
      pos = el.unknownSize ? end : el.end
      continue
    }
    if (el.dataEnd <= segmentEnd && !el.truncated) {
      if (el.id === ID.info) {
        parseInfo(bytes, el, parsed)
      } else if (el.id === ID.tracks) {
        sawTracks = true
        parsed.tracksRaw = bytes.subarray(el.start, el.end)
        scanTracks(bytes, el, parsed)
      }
    }
    pos = el.end
  }

  return validateParsed(parsed, sawTracks)
}

export interface WebmAnalysis {
  durationMs: number
  /** Video keyframe times, ms from the first frame, ascending. */
  keyframesMs: number[]
  /** Longest gap between neighbouring keyframes (the worst-case GOP). */
  maxKeyframeGapMs: number
}

function toMs(units: number, scale: number): number {
  return (units * scale) / 1_000_000
}

function analyzeParsed(parsed: ParsedWebm) {
  const { blocks, timecodeScale: scale, videoTrack } = parsed
  let t0 = Number.POSITIVE_INFINITY
  for (const b of blocks) {
    if (b.absTime < t0) {
      t0 = b.absTime
    }
  }
  const isVideo = (b: ParsedBlock) =>
    videoTrack === null || b.track === videoTrack

  const keyframesMs = [
    ...new Set(
      blocks
        .filter((b) => b.isKeyframe && isVideo(b))
        .map((b) => toMs(b.absTime - t0, scale))
    ),
  ].sort((a, b) => a - b)

  const frameTimes = blocks
    .filter(isVideo)
    .map((b) => toMs(b.absTime - t0, scale))
    .sort((a, b) => a - b)
  const last = frameTimes.at(-1) as number
  const delta = frameTimes.length > 1 ? last - (frameTimes.at(-2) as number) : 0
  const durationMs = last + (delta > 0 ? delta : DEFAULT_FRAME_MS)

  let maxKeyframeGapMs = durationMs
  if (keyframesMs.length > 0) {
    const bounds = [...keyframesMs, durationMs]
    maxKeyframeGapMs = 0
    for (let i = 1; i < bounds.length; i++) {
      maxKeyframeGapMs = Math.max(
        maxKeyframeGapMs,
        (bounds[i] as number) - (bounds[i - 1] as number)
      )
    }
  }
  return { t0, durationMs, keyframesMs, maxKeyframeGapMs }
}

/** Finds the keyframes of a WebM. Throws `WebmTrimError` if it can't be trimmed. */
export function analyzeWebm(bytes: Uint8Array): WebmAnalysis {
  const { durationMs, keyframesMs, maxKeyframeGapMs } = analyzeParsed(
    parseWebm(bytes)
  )
  if (keyframesMs.length === 0) {
    throw new WebmTrimError("malformed", "WebM has no keyframes.")
  }
  return { durationMs, keyframesMs, maxKeyframeGapMs }
}

export interface TrimCut {
  /** Real end of the cut, ms from the start of the original recording. */
  endMs: number
  /** Real start of the cut, ms from the start of the original recording. */
  startMs: number
}

function nearest(candidates: number[], target: number): number {
  let best = candidates[0] as number
  for (const c of candidates) {
    if (Math.abs(c - target) < Math.abs(best - target)) {
      best = c
    }
  }
  return best
}

/**
 * Snaps requested cut points to the nearest keyframes. The start is a keyframe;
 * the end is a keyframe or the end of the recording. The result is never empty:
 * the end is always after the start.
 */
export function snapToKeyframes(
  analysis: Pick<WebmAnalysis, "durationMs" | "keyframesMs">,
  requestedStartMs: number,
  requestedEndMs: number
): TrimCut {
  const { keyframesMs, durationMs } = analysis
  // NaN (e.g. a cleared slider) means "no preference": keep the whole range.
  const clamp = (v: number, fallback: number) =>
    Number.isNaN(v) ? fallback : Math.min(Math.max(v, 0), durationMs)
  const wantStart = clamp(requestedStartMs, 0)
  const wantEnd = clamp(requestedEndMs, durationMs)
  const startMs = nearest(keyframesMs, wantStart)
  const ends = [...keyframesMs, durationMs].filter((t) => t > startMs)
  if (ends.length === 0) {
    return { startMs, endMs: durationMs }
  }
  return { startMs, endMs: nearest(ends, wantEnd) }
}

function idBytes(id: number): Uint8Array {
  const out: number[] = []
  let v = id
  while (v > 0) {
    out.unshift(v % 256)
    v = Math.floor(v / 256)
  }
  return Uint8Array.from(out)
}

/** Always 8 bytes: simple, and valid for any size we produce. */
function sizeBytes(value: number): Uint8Array {
  const out = new Uint8Array(8)
  out[0] = 0x01
  let v = value
  for (let i = 7; i >= 1; i--) {
    out[i] = v % 256
    v = Math.floor(v / 256)
  }
  return out
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

function element(id: number, payload: Uint8Array): Uint8Array {
  return concat([idBytes(id), sizeBytes(payload.length), payload])
}

function uintPayload(value: number): Uint8Array {
  const bytes: number[] = []
  let v = value
  do {
    bytes.unshift(v % 256)
    v = Math.floor(v / 256)
  } while (v > 0)
  return Uint8Array.from(bytes)
}

function float64Payload(value: number): Uint8Array {
  const out = new Uint8Array(8)
  new DataView(out.buffer).setFloat64(0, value)
  return out
}

export interface TrimResult extends TrimCut {
  bytes: Uint8Array
  durationMs: number
}

/**
 * Cuts `[startMs, endMs)` (snapped to keyframes) out of a WebM without
 * re-encoding. Times are ms from the start of the original recording.
 */
export function trimWebm(
  bytes: Uint8Array,
  requestedStartMs: number,
  requestedEndMs: number
): TrimResult {
  const parsed = parseWebm(bytes)
  const analysis = analyzeParsed(parsed)
  if (analysis.keyframesMs.length === 0) {
    throw new WebmTrimError("malformed", "WebM has no keyframes.")
  }
  const cut = snapToKeyframes(analysis, requestedStartMs, requestedEndMs)

  const scale = parsed.timecodeScale
  const unitsPerMs = 1_000_000 / scale
  const startUnits = Math.round(cut.startMs * unitsPerMs) + analysis.t0
  const endUnits =
    cut.endMs >= analysis.durationMs
      ? Number.POSITIVE_INFINITY
      : Math.round(cut.endMs * unitsPerMs) + analysis.t0

  const plans = planClusters(parsed, startUnits, endUnits)

  const durationMs = cut.endMs - cut.startMs
  const info = element(
    ID.info,
    concat([
      element(ID.timecodeScale, uintPayload(scale)),
      ...parsed.infoChildren,
      element(ID.duration, float64Payload(durationMs * unitsPerMs)),
    ])
  )
  return {
    bytes: assemble(parsed, info, plans),
    startMs: cut.startMs,
    endMs: cut.endMs,
    durationMs,
  }
}

/**
 * Groups the kept blocks by source cluster, preserving order, then splits any
 * group whose relative timecodes would overflow an int16.
 */
function planClusters(
  parsed: ParsedWebm,
  startUnits: number,
  endUnits: number
): ClusterPlan[] {
  const groups = new Map<number, ParsedBlock[]>()
  parsed.blocks.forEach((block, i) => {
    if (block.absTime < startUnits || block.absTime >= endUnits) {
      return
    }
    const key = parsed.clusterOf[i] as number
    const group = groups.get(key)
    if (group) {
      group.push(block)
    } else {
      groups.set(key, [block])
    }
  })
  const plans: ClusterPlan[] = []
  for (const kept of groups.values()) {
    let plan: ClusterPlan | null = null
    for (const block of kept) {
      const rel = plan ? block.absTime - plan.base : 0
      if (!plan || rel < -0x80_00 || rel > 0x7f_ff) {
        plan = {
          base: block.absTime,
          blocks: [],
          tcPayload: uintPayload(block.absTime - startUnits),
        }
        plans.push(plan)
      }
      plan.blocks.push(block)
    }
  }
  return plans
}

interface ClusterPlan {
  base: number
  blocks: ParsedBlock[]
  tcPayload: Uint8Array
}

/**
 * Writes the output into ONE buffer sized up front, copying each Block once
 * and patching its relative timecode in place (no per-block clones).
 */
function assemble(
  parsed: ParsedWebm,
  info: Uint8Array,
  plans: ClusterPlan[]
): Uint8Array {
  const clusterIdLen = idBytes(ID.cluster).length
  const tcIdLen = idBytes(ID.timecode).length
  const payloadSizes = plans.map(
    (plan) =>
      tcIdLen +
      8 +
      plan.tcPayload.length +
      plan.blocks.reduce((n, block) => n + block.raw.length, 0)
  )
  const clustersLen = payloadSizes.reduce(
    (n, size) => n + clusterIdLen + 8 + size,
    0
  )
  const segmentPayloadLen = info.length + parsed.tracksRaw.length + clustersLen
  const segIdLen = idBytes(ID.segment).length
  const out = new Uint8Array(
    parsed.ebmlHeader.length + segIdLen + 8 + segmentPayloadLen
  )
  let o = 0
  const put = (data: Uint8Array) => {
    out.set(data, o)
    o += data.length
  }
  put(parsed.ebmlHeader)
  put(idBytes(ID.segment))
  put(sizeBytes(segmentPayloadLen))
  put(info)
  put(parsed.tracksRaw)
  plans.forEach((plan, i) => {
    put(idBytes(ID.cluster))
    put(sizeBytes(payloadSizes[i] as number))
    put(idBytes(ID.timecode))
    put(sizeBytes(plan.tcPayload.length))
    put(plan.tcPayload)
    for (const block of plan.blocks) {
      const at = o
      put(block.raw)
      const rel = block.absTime - plan.base
      out[at + block.timecodeOffset] = (rel >> 8) & 0xff
      out[at + block.timecodeOffset + 1] = rel & 0xff
    }
  })
  return out
}
