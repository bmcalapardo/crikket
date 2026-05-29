import { spawnSync } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..")
const entryPath = join(packageRoot, "src/vercel.ts")
const outputPath = join(packageRoot, "api/_handler.js")

const result = spawnSync(
  "bun",
  ["build", entryPath, "--outfile", outputPath, "--target", "node", "--minify"],
  { cwd: packageRoot, stdio: "inherit", shell: process.platform === "win32" }
)

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}
