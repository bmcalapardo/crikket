import { useCallback, useRef, useState } from "react"
import { readAndClearCaptureTabId } from "@/lib/capture-context"
import { recordCaptureSuccess } from "@/lib/diagnostics/last-capture"
import { requestTabCaptureStream } from "@/lib/display-media"

export interface UseScreenCaptureReturn {
  isRecording: boolean
  recordedBlob: Blob | null
  error: string | null
  startRecording: () => Promise<boolean>
  stopRecording: () => Promise<Blob | null>
  reset: () => void
  setRecordedBlob: (blob: Blob | null) => void
}

export function useScreenCapture(): UseScreenCaptureReturn {
  const [isRecording, setIsRecording] = useState(false)
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const startRecording = useCallback(async (): Promise<boolean> => {
    try {
      setError(null)
      setRecordedBlob(null)

      const captureTabId = await readAndClearCaptureTabId()
      if (!captureTabId) {
        throw new Error(
          "Could not lock the source tab. Please start recording from the extension popup."
        )
      }

      const stream = await requestTabCaptureStream(captureTabId)

      streamRef.current = stream

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "video/webm;codecs=vp9",
      })

      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" })
        setRecordedBlob(blob)
        setIsRecording(false)
        recordCaptureSuccess("video")

        for (const track of stream.getTracks()) {
          track.stop()
        }
      }
      stream.getVideoTracks()[0].onended = () => {
        if (mediaRecorderRef.current?.state === "recording") {
          mediaRecorderRef.current.stop()
        }
      }

      mediaRecorder.start(1000)
      setIsRecording(true)
      return true
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to start recording"
      setError(message)
      setIsRecording(false)
      return false
    }
  }, [])

  const stopRecording = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      if (
        !mediaRecorderRef.current ||
        mediaRecorderRef.current.state !== "recording"
      ) {
        resolve(null)
        return
      }

      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" })
        setRecordedBlob(blob)
        setIsRecording(false)
        recordCaptureSuccess("video")

        if (streamRef.current) {
          for (const track of streamRef.current.getTracks()) {
            track.stop()
          }
        }

        resolve(blob)
      }

      mediaRecorderRef.current.stop()
    })
  }, [])

  const reset = useCallback(() => {
    setRecordedBlob(null)
    setError(null)
    setIsRecording(false)

    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop()
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop()
      }
    }
  }, [])

  return {
    isRecording,
    recordedBlob,
    error,
    startRecording,
    stopRecording,
    reset,
    setRecordedBlob,
  }
}
