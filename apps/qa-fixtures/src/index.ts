import { serve } from "bun"
import { createApp } from "./app"

const port = Number(process.env.PORT) || 4100

serve({ port, fetch: createApp().fetch })
console.log(`[qa-fixtures] listening on http://localhost:${port}`)
