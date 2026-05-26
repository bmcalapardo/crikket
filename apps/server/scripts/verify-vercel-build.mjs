import { access, mkdir } from "node:fs/promises"

await mkdir("api/_bundle", { recursive: true })

const requiredArtifacts = ["dist/index.mjs", "api/_bundle/app.mjs"]

for (const artifactPath of requiredArtifacts) {
  try {
    await access(artifactPath)
  } catch {
    throw new Error(
      `Build artifact missing: ${artifactPath}. Run "bun run build" in apps/server.`
    )
  }
}
