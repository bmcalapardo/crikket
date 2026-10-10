import { serve } from "bun"
import { createApp } from "./app"

const port = Number(process.env.PORT) || 4100
// Loopback by default so a local run is not reachable from the LAN; the
// Dockerfile sets HOST=0.0.0.0 for container use.
const hostname = process.env.HOST || "127.0.0.1"

serve({ port, hostname, fetch: createApp().fetch })
console.log(`[qa-fixtures] listening on http://${hostname}:${port}`)
