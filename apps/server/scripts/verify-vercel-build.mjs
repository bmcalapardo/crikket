import { access } from "node:fs/promises"

try {
  await access("dist/index.mjs")
} catch {
  throw new Error(
    'Vercel build artifact missing: dist/index.mjs. Run "bun run build" in apps/server.'
  )
}
