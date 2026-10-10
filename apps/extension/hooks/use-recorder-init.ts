import { useEffect, useRef } from "react"
import { readDraftIdFromSearch } from "@/lib/draft-session"
import { createDraftStore, type Draft } from "@/lib/draft-store"

export type CaptureType = "video" | "screenshot"

interface UseRecorderInitProps {
  onCaptureTypeChange: (type: CaptureType) => void
  onDraftLoaded: (draft: Draft) => void
  onStartRecording: () => void
  onError: (error: string) => void
}

export function useRecorderInit({
  onCaptureTypeChange,
  onDraftLoaded,
  onStartRecording,
  onError,
}: UseRecorderInitProps) {
  const autoStartChecked = useRef(false)
  // Callers pass inline callbacks, so this effect re-runs on every render. The
  // Draft must load once, or a re-load would overwrite the tester's edits.
  const draftLoadStarted = useRef(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const type = (params.get("captureType") as CaptureType) || "video"
    onCaptureTypeChange(type)

    if (type === "screenshot") {
      const draftId = readDraftIdFromSearch(window.location.search)
      if (!draftId || draftLoadStarted.current) {
        return
      }
      draftLoadStarted.current = true
      const store = createDraftStore()
      store
        .get(draftId)
        .then((draft) => {
          if (!draft) {
            onError(
              "This draft is no longer available. It may have expired or been deleted."
            )
            return
          }
          onDraftLoaded(draft)
        })
        .catch((err) => {
          console.error("Failed to load screenshot draft:", err)
          onError("Failed to load screenshot")
        })
        .finally(() => store.close())
    } else if (type === "video") {
      if (autoStartChecked.current) {
        return
      }
      autoStartChecked.current = true

      chrome.storage.local.get(["startRecordingImmediately"], (result) => {
        if (result.startRecordingImmediately) {
          chrome.storage.local.remove(["startRecordingImmediately"])
          onStartRecording()
        }
      })
    }
  }, [onCaptureTypeChange, onDraftLoaded, onStartRecording, onError])
}
