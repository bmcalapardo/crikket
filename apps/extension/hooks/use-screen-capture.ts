import { useCallback, useEffect, useRef, useState } from "react"
import { readAndClearCaptureTabId } from "@/lib/capture-context"
import { recordCaptureSuccess } from "@/lib/diagnostics/last-capture"
import { requestTabCaptureStream } from "@/lib/display-media"
import {
  createPausableRecorder,
  type PausableRecorder,
  type RecorderLike,
} from "@/lib/pausable-recording"
import {
  pickRecorderMimeType,
  resolveRecordingMimeType,
} from "@/lib/recorder-mime"

export interface UseScreenCaptureReturn {
  error: string | null
  /** Playable length so far, excluding paused stretches. */
  getDurationMs: () => number
  isPaused: boolean
  isRecording: boolean
  pauseRecording: () => boolean
  recordedBlob: Blob | null
  reset: () => void
  resumeRecording: () => boolean
  setRecordedBlob: (blob: Blob | null) => void
  startRecording: () => Promise<boolean>
  stopRecording: () => Promise<Blob | null>
}

function stopTracks(stream: MediaStream | null) {
  if (!stream) {
    return
  }
  for (const track of stream.getTracks()) {
    track.stop()
  }
}

export function useScreenCapture(): UseScreenCaptureReturn {
  const [isRecording, setIsRecording] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  const [error, setError] = useState<string | null>(null)

  const controllerRef = useRef<PausableRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const mimeTypeRef = useRef<string>("video/webm")

  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    const controller = controllerRef.current
    if (!controller) {
      return null
    }

    const result = await controller.stop()
    if (!result) {
      return null
    }

    const blob = new Blob(result.chunks, { type: mimeTypeRef.current })
    setRecordedBlob(blob)
    setIsRecording(false)
    setIsPaused(false)
    recordCaptureSuccess("video")
    stopTracks(streamRef.current)
    return blob
  }, [])

  const startRecording = useCallback(async (): Promise<boolean> => {
    try {
      setError(null)
      setRecordedBlob(null)
      setIsPaused(false)

      const captureTabId = await readAndClearCaptureTabId()
      if (!captureTabId) {
        throw new Error(
          "Could not lock the source tab. Please start recording from the extension popup."
        )
      }

      const stream = await requestTabCaptureStream(captureTabId)

      streamRef.current = stream

      // Not every browser supports VP9; probe, and fall back to the
      // browser default if nothing in the preference list is supported.
      const requestedMimeType = pickRecorderMimeType(
        typeof MediaRecorder.isTypeSupported === "function"
          ? (type) => MediaRecorder.isTypeSupported(type)
          : undefined
      )
      const mediaRecorder = requestedMimeType
        ? new MediaRecorder(stream, { mimeType: requestedMimeType })
        : new MediaRecorder(stream)
      // Trim reads the blob type, so record what the recorder really produces.
      mimeTypeRef.current = resolveRecordingMimeType(
        mediaRecorder.mimeType,
        requestedMimeType
      )
      // performance.now() is monotonic, so wall-clock adjustments cannot bend
      // the playable duration.
      const controller = createPausableRecorder({
        now: () => performance.now(),
        // MediaRecorder's handlers take a BlobEvent; the controller only reads
        // `data`, so the narrower RecorderLike shape is safe.
        recorder: mediaRecorder as unknown as RecorderLike,
      })
      controllerRef.current = controller

      // A tab that ends (closed, navigated away from capture) stops the
      // recording whether it was running or paused.
      stream.getVideoTracks()[0].onended = () => {
        stopRecording()
      }

      controller.start(1000)
      setIsRecording(true)
      return true
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to start recording"
      setError(message)
      setIsRecording(false)
      return false
    }
  }, [stopRecording])

  const pauseRecording = useCallback((): boolean => {
    try {
      const paused = controllerRef.current?.pause() ?? false
      if (paused) {
        setIsPaused(true)
      }
      return paused
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to pause recording")
      return false
    }
  }, [])

  const resumeRecording = useCallback((): boolean => {
    try {
      const resumed = controllerRef.current?.resume() ?? false
      if (resumed) {
        setIsPaused(false)
      }
      return resumed
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to resume recording"
      )
      return false
    }
  }, [])

  const getDurationMs = useCallback(
    () => Math.max(0, Math.round(controllerRef.current?.getDurationMs() ?? 0)),
    []
  )

  const reset = useCallback(() => {
    setRecordedBlob(null)
    setError(null)
    setIsRecording(false)
    setIsPaused(false)

    controllerRef.current?.dispose()
    controllerRef.current = null
    stopTracks(streamRef.current)
  }, [])

  // Closing the recorder page, including while paused, must not leave the
  // capture stream (and its "sharing this tab" indicator) alive.
  useEffect(
    () => () => {
      controllerRef.current?.dispose()
      stopTracks(streamRef.current)
    },
    []
  )

  return {
    isRecording,
    isPaused,
    recordedBlob,
    error,
    getDurationMs,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    reset,
    setRecordedBlob,
  }
}
