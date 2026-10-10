import type { AppRouterClient } from "@crikket/api/routers/index"

import { env } from "@crikket/env/extension"
import { createORPCClient } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import { getRpcUrl } from "./app-urls"

/**
 * Extension-specific ORPC client
 * Simplified version without Next.js dependencies since extensions run only in browser context
 */
export function createExtensionClient(appUrl: string): AppRouterClient {
  const link = new RPCLink({
    url: getRpcUrl(appUrl),
    async fetch(url, options) {
      const response = await fetch(url, {
        ...options,
        credentials: "include",
      })

      // RPC goes through the web app, so a web page here means something in
      // front of the server answered instead: a login redirect, deployment
      // protection, or a wrong app URL. Treating it as data would report a
      // submission that never happened as a success.
      if (
        response.ok &&
        response.headers.get("content-type")?.includes("text/html")
      ) {
        throw new Error(
          "Crikket returned a web page instead of an API response. Sign in to Crikket in a browser tab, then retry."
        )
      }

      return response
    },
  })

  return createORPCClient(link)
}

export const client: AppRouterClient = createExtensionClient(env.VITE_APP_URL)
