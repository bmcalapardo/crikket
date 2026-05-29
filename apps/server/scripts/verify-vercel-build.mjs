import { access } from "node:fs/promises"

const requiredArtifacts = ["dist/index.mjs", "api/_handler.js"]

for (const artifactPath of requiredArtifacts) {
  try {
    await access(artifactPath)
  } catch {
    throw new Error(
      `Build artifact missing: ${artifactPath}. Run "bun run build" in apps/server.`
    )
  }
}
