import { reportNonFatalError } from "@crikket/shared/lib/errors"
import { useEffect } from "react"
import type { CaptureType } from "@/hooks/use-recorder-init"
import {
  RECORDER_TAB_ID_STORAGE_KEY,
  RECORDING_COUNTDOWN_ENDS_AT_STORAGE_KEY,
  RECORDING_IN_PROGRESS_STORAGE_KEY,
  RECORDING_PAUSED_MS_STORAGE_KEY,
  RECORDING_STARTED_AT_STORAGE_KEY,
} from "@/lib/capture-context"
import { TOGGLE_PAUSE_RECORDING_MESSAGE } from "@/lib/recorder-hotkey-commands"
import type { RecorderState } from "@/lib/recorder-state"

interface UseRecorderRecordingSyncProps {
  captureType: CaptureType
  /** Playable length so far, excluding paused stretches. */
  getDurationMs: () => number
  state: RecorderState
  onStopFromPopup: () => Promise<void>
  onTogglePause: () => void
}

export function useRecorderRecordingSync({
  captureType,
  getDurationMs,
  onStopFromPopup,
  onTogglePause,
  state,
}: UseRecorderRecordingSyncProps) {
  useEffect(() => {
    const clearRecordingFlags = async () => {
      await chrome.storage.local.set({
        [RECORDING_IN_PROGRESS_STORAGE_KEY]: false,
      })
      await chrome.storage.local.remove([
        RECORDER_TAB_ID_STORAGE_KEY,
        RECORDING_COUNTDOWN_ENDS_AT_STORAGE_KEY,
        RECORDING_PAUSED_MS_STORAGE_KEY,
        RECORDING_STARTED_AT_STORAGE_KEY,
      ])
    }

    const syncRecordingState = async () => {
      if (captureType !== "video") {
        await clearRecordingFlags()
        return
      }

      if (state === "idle") {
        const result = await chrome.storage.local.get([
          RECORDING_IN_PROGRESS_STORAGE_KEY,
          RECORDING_COUNTDOWN_ENDS_AT_STORAGE_KEY,
        ])
        const isRecordingInProgress = Boolean(
          result[RECORDING_IN_PROGRESS_STORAGE_KEY]
        )
        const hasActiveCountdown =
          typeof result[RECORDING_COUNTDOWN_ENDS_AT_STORAGE_KEY] === "number"

        if (isRecordingInProgress && !hasActiveCountdown) {
          await clearRecordingFlags()
        }
        return
      }

      if (state === "recording") {
        const currentTab = await chrome.tabs.getCurrent()
        // The popup shows now - startedAt, so anchor it to the playable
        // length: time already spent paused must not show up as elapsed.
        await chrome.storage.local.set({
          [RECORDING_IN_PROGRESS_STORAGE_KEY]: true,
          [RECORDING_STARTED_AT_STORAGE_KEY]: Date.now() - getDurationMs(),
          [RECORDER_TAB_ID_STORAGE_KEY]: currentTab?.id,
        })
        await chrome.storage.local.remove([
          RECORDING_COUNTDOWN_ENDS_AT_STORAGE_KEY,
          RECORDING_PAUSED_MS_STORAGE_KEY,
        ])
        return
      }

      if (state === "paused") {
        const currentTab = await chrome.tabs.getCurrent()
        await chrome.storage.local.set({
          [RECORDING_IN_PROGRESS_STORAGE_KEY]: true,
          [RECORDING_PAUSED_MS_STORAGE_KEY]: getDurationMs(),
          [RECORDER_TAB_ID_STORAGE_KEY]: currentTab?.id,
        })
        return
      }

      await clearRecordingFlags()
    }

    syncRecordingState().catch((error: unknown) => {
      reportNonFatalError("Failed to sync recorder recording state", error)
    })
  }, [captureType, getDurationMs, state])

  useEffect(() => {
    const handleMessage = (message: { type?: string }) => {
      if (message.type === TOGGLE_PAUSE_RECORDING_MESSAGE) {
        if (state === "recording" || state === "paused") {
          onTogglePause()
        }
        return
      }
      if (message.type !== "STOP_RECORDING_FROM_POPUP") return
      if (state !== "recording" && state !== "paused") return
      onStopFromPopup().catch((error: unknown) => {
        reportNonFatalError(
          "Failed to stop recording from popup trigger",
          error
        )
      })
    }

    chrome.runtime.onMessage.addListener(handleMessage)

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage)
    }
  }, [onStopFromPopup, onTogglePause, state])

  useEffect(() => {
    return () => {
      chrome.storage.local.set({
        [RECORDING_IN_PROGRESS_STORAGE_KEY]: false,
      })
      chrome.storage.local.remove([
        RECORDER_TAB_ID_STORAGE_KEY,
        RECORDING_COUNTDOWN_ENDS_AT_STORAGE_KEY,
        RECORDING_PAUSED_MS_STORAGE_KEY,
        RECORDING_STARTED_AT_STORAGE_KEY,
      ])
    }
  }, [])
}
