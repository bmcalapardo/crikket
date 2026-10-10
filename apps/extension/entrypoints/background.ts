import { reportNonFatalError } from "@crikket/shared/lib/errors"
import { registerDebuggerBackgroundListeners } from "@/lib/bug-report-debugger/engine/background"
import { installErrorLog } from "@/lib/diagnostics/error-log"
import {
  DRAFT_EXPIRY_ALARM,
  DRAFT_EXPIRY_CHECK_MINUTES,
  syncDraftBadge,
} from "@/lib/draft-badge"
import { createDraftStore } from "@/lib/draft-store"
import { handleRecorderHotkeyCommand } from "@/lib/recorder-hotkey-commands"

// Expired Drafts are removed here, so the icon badge stays accurate even when
// no extension page is open.
async function refreshDraftBadge(): Promise<void> {
  const store = createDraftStore()
  try {
    await syncDraftBadge(store)
  } finally {
    store.close()
  }
}

export default defineBackground(() => {
  installErrorLog()
  registerDebuggerBackgroundListeners()

  const refresh = () => {
    refreshDraftBadge().catch((error: unknown) => {
      reportNonFatalError("Failed to refresh the draft badge", error)
    })
  }
  refresh()
  chrome.runtime.onStartup.addListener(refresh)
  chrome.runtime.onInstalled.addListener(refresh)
  // create() replaces an existing alarm and restarts its period, so a worker
  // that wakes more often than the period would never let it fire.
  chrome.alarms
    .get(DRAFT_EXPIRY_ALARM)
    .then((existing) => {
      if (!existing) {
        chrome.alarms.create(DRAFT_EXPIRY_ALARM, {
          periodInMinutes: DRAFT_EXPIRY_CHECK_MINUTES,
        })
      }
    })
    .catch((error: unknown) => {
      reportNonFatalError("Failed to schedule the draft expiry sweep", error)
    })
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === DRAFT_EXPIRY_ALARM) {
      refresh()
    }
  })

  chrome.commands.onCommand.addListener((command) => {
    handleRecorderHotkeyCommand(command).catch(async (error: unknown) => {
      reportNonFatalError("Failed to execute recorder hotkey command", error)
      try {
        await chrome.action.openPopup()
      } catch (openPopupError) {
        reportNonFatalError(
          "Failed to open popup after hotkey failure",
          openPopupError
        )
      }
    })
  })
})
