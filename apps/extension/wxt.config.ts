import { defineConfig } from "wxt"
import { resolveBuildSha } from "./lib/build-sha"
import {
  EXTENSION_COMMANDS,
  EXTENSION_HOST_PERMISSIONS,
  EXTENSION_PERMISSIONS,
} from "./lib/manifest-contract"

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
    commands: EXTENSION_COMMANDS,
    permissions: EXTENSION_PERMISSIONS,
    host_permissions: EXTENSION_HOST_PERMISSIONS,

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
