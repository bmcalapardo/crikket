import { Button } from "@crikket/ui/components/ui/button"
import { useCallback, useEffect, useMemo, useState } from "react"
import type { VideoTrim } from "@/lib/video-trim"
import {
  analyzeWebm,
  isTrimmableMimeType,
  snapToKeyframes,
  trimUnavailableMessage,
  trimWebm,
  type WebmAnalysis,
} from "@/lib/webm-trim"

interface TrimStepProps {
  /** The untouched original capture; trimming always starts from it. */
  original: Blob
  onApply: (trim: VideoTrim) => void
  onCancel: () => void
}

type Loaded =
  | { status: "loading" }
  | { status: "unavailable"; message: string }
  | { status: "ready"; analysis: WebmAnalysis; bytes: Uint8Array }

function formatMs(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`
}

export function TrimStep({ original, onApply, onCancel }: TrimStepProps) {
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" })
  const [requestedStart, setRequestedStart] = useState(0)
  const [requestedEnd, setRequestedEnd] = useState(0)
  const [isApplying, setIsApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!isTrimmableMimeType(original.type)) {
      setLoaded({
        status: "unavailable",
        message: trimUnavailableMessage(original.type),
      })
      return
    }
    original
      .arrayBuffer()
      .then((buffer) => {
        if (cancelled) {
          return
        }
        const bytes = new Uint8Array(buffer)
        const analysis = analyzeWebm(bytes)
        setRequestedStart(0)
        setRequestedEnd(analysis.durationMs)
        setLoaded({ status: "ready", analysis, bytes })
      })
      .catch(() => {
        if (!cancelled) {
          setLoaded({
            status: "unavailable",
            message:
              "This recording could not be read for trimming, so the full recording will be submitted.",
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [original])

  const cut = useMemo(
    () =>
      loaded.status === "ready"
        ? snapToKeyframes(loaded.analysis, requestedStart, requestedEnd)
        : null,
    [loaded, requestedStart, requestedEnd]
  )

  const handleApply = useCallback(() => {
    if (loaded.status !== "ready") {
      return
    }
    setIsApplying(true)
    setError(null)
    try {
      const result = trimWebm(loaded.bytes, requestedStart, requestedEnd)
      onApply({
        blob: new Blob([result.bytes as BlobPart], { type: original.type }),
        source: original,
        startMs: result.startMs,
        endMs: result.endMs,
        durationMs: result.durationMs,
      })
    } catch {
      setError("Trimming failed. The original recording is unchanged.")
      setIsApplying(false)
    }
  }, [loaded, onApply, original, requestedEnd, requestedStart])

  if (loaded.status === "loading") {
    return <p className="text-muted-foreground text-sm">Reading recording...</p>
  }

  if (loaded.status === "unavailable") {
    return (
      <div className="space-y-4" data-testid="trim-unavailable">
        <p className="text-sm">{loaded.message}</p>
        <Button onClick={onCancel} type="button" variant="outline">
          Back
        </Button>
      </div>
    )
  }

  const { analysis } = loaded
  const max = Math.ceil(analysis.durationMs)

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
        <label className="block space-y-1 text-sm">
          <span>Start</span>
          <input
            className="w-full"
            max={max}
            min={0}
            onChange={(event) => setRequestedStart(Number(event.target.value))}
            type="range"
            value={requestedStart}
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span>End</span>
          <input
            className="w-full"
            max={max}
            min={0}
            onChange={(event) => setRequestedEnd(Number(event.target.value))}
            type="range"
            value={requestedEnd}
          />
        </label>
        {cut ? (
          <p className="font-medium text-sm" data-testid="trim-cut">
            Cut: {formatMs(cut.startMs)} to {formatMs(cut.endMs)} (
            {formatMs(cut.endMs - cut.startMs)} of{" "}
            {formatMs(analysis.durationMs)})
          </p>
        ) : null}
        <p className="text-muted-foreground text-xs">
          Trimming does not re-encode, so cuts land on keyframes. The real cut
          can differ from the handles by less than one keyframe interval
          (longest in this recording: {formatMs(analysis.maxKeyframeGapMs)}).
        </p>
      </div>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      <div className="flex gap-2">
        <Button disabled={isApplying} onClick={handleApply} type="button">
          Apply trim
        </Button>
        <Button onClick={onCancel} type="button" variant="outline">
          Cancel
        </Button>
      </div>
    </div>
  )
}
