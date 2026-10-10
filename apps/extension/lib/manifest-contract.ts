// The extension's keyboard commands and permissions. wxt.config.ts builds the
// manifest from these, and scripts/verify-release.ts checks the packaged
// manifest against them, so the two cannot drift.
export const EXTENSION_COMMANDS = {
  "start-video-recording": {
    description: "Start video recording",
    suggested_key: {
      default: "Alt+Shift+R",
      mac: "Alt+Shift+R",
    },
  },
  "start-screenshot-capture": {
    description: "Start screenshot capture",
    suggested_key: {
      default: "Alt+Shift+C",
      mac: "Alt+Shift+C",
    },
  },
  "stop-video-recording": {
    description: "Stop video recording",
    suggested_key: {
      default: "Alt+Shift+S",
      mac: "Alt+Shift+S",
    },
  },
  // No suggested_key: all four slots are taken. Testers can bind one at
  // chrome://extensions/shortcuts.
  "toggle-pause-recording": {
    description: "Pause or resume video recording",
  },
}

export const EXTENSION_PERMISSIONS = [
  "activeTab",
  "scripting",
  "storage",
  "tabCapture",
  "tabs",
]

export const EXTENSION_HOST_PERMISSIONS = ["<all_urls>"]
