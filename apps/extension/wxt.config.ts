import { defineConfig } from "wxt"
import { resolveBuildSha } from "./lib/build-sha"

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  // CI sets VITE_BUILD_SHA from github.sha; developer builds report "local".
  vite: () => ({
    define: {
      "import.meta.env.VITE_BUILD_SHA": JSON.stringify(
        resolveBuildSha(process.env.VITE_BUILD_SHA)
      ),
    },
  }),
  manifest: {
    name: "Crikket",
    short_name: "Crikket",
    action: {
      default_title: "Crikket",
      default_popup: "popup.html",
    },
    commands: {
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
    },
    permissions: ["activeTab", "scripting", "storage", "tabCapture", "tabs"],
    host_permissions: ["<all_urls>"],

    browser_specific_settings: {
      gecko: {
        id: "crikket-alpha@medgrocer", // Make sure this matches your alpha testing ID
        strict_min_version: "140.0",
        data_collection_permissions: {
          required: ["none"],
        },
      } as unknown as Record<string, unknown>,
    },
  },
})
