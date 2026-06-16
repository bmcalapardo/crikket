interface TabCaptureConstraints extends MediaTrackConstraints {
  mandatory?: {
    chromeMediaSource: "tab"
    chromeMediaSourceId: string
  }
}

/**
 * Captures a media stream for recording.
 * Automatically uses chrome.tabCapture if available (Chrome),
 * otherwise falls back to standard getDisplayMedia (Firefox/Edge).
 */
export const requestTabCaptureStream = async (
  tabId: number
): Promise<MediaStream> => {
  // 1. Chrome Pipeline: Try tabCapture first
  if (
    typeof chrome !== "undefined" &&
    chrome.tabCapture &&
    typeof chrome.tabCapture.getMediaStreamId === "function"
  ) {
    try {
      const streamId = await new Promise<string>((resolve, reject) => {
        chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (id) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message))
          } else {
            resolve(id)
          }
        })
      })

      return await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: "tab",
            chromeMediaSourceId: streamId,
          },
        } as TabCaptureConstraints,
      })
    } catch (error) {
      console.warn(
        "chrome.tabCapture failed, trying getDisplayMedia fallback...",
        error
      )
    }
  }

  // 2. Firefox Fallback Pipeline: Standard Web API
  console.log("Using standard navigator.mediaDevices.getDisplayMedia fallback.")

  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error(
      "Screen and tab recording APIs are not supported in this browser context."
    )
  }

  // This will trigger Firefox's native, secure permission prompt
  // allowing the user to select the specific tab, window, or screen.
  return await navigator.mediaDevices.getDisplayMedia({
    video: {
      frameRate: { ideal: 30, max: 60 },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
    audio: false, // matching original hook settings
  })
}
