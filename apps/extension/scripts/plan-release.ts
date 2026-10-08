import { appendFileSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

export type ReleaseChannel = "alpha" | "beta" | "stable"

export interface ReleasePlan {
  artifacts: {
    chromium: string
    firefox: string
  }
  channel: ReleaseChannel
  notes: string
  prerelease: boolean
  tag: string
  version: string
}

const TAG_PATTERN = /^extension-v(\d+\.\d+\.\d+)(?:-(alpha|beta)\.(\d+))?$/
const BUILD_NUMBER_PATTERN = /^[1-9]\d*$/

// A pushed or dispatched tag wins. A merge to master has no tag, so it
// becomes an alpha of the current package version, numbered by the
// workflow run so every merge gets a unique, increasing tag.
export function resolveReleaseTag(input: {
  alphaBuildNumber: string
  packageVersion: string
  releaseTag: string
}): string {
  if (input.releaseTag) {
    return input.releaseTag
  }

  if (!input.alphaBuildNumber) {
    throw new Error(
      "No release tag given. Push an extension-v* tag, dispatch with a tag, or merge to master for an automatic alpha."
    )
  }

  if (!BUILD_NUMBER_PATTERN.test(input.alphaBuildNumber)) {
    throw new Error(
      `Invalid alpha build number "${input.alphaBuildNumber}". Expected a positive integer.`
    )
  }

  return `extension-v${input.packageVersion}-alpha.${input.alphaBuildNumber}`
}

export function parseReleaseTag(tag: string): {
  channel: ReleaseChannel
  version: string
} {
  const match = TAG_PATTERN.exec(tag)
  if (!match) {
    throw new Error(
      `Invalid release tag "${tag}". Expected extension-vX.Y.Z, extension-vX.Y.Z-alpha.N or extension-vX.Y.Z-beta.N.`
    )
  }
  const [, core, prerelease, counter] = match
  return {
    channel: (prerelease as ReleaseChannel | undefined) ?? "stable",
    version: prerelease ? `${core}-${prerelease}.${counter}` : core,
  }
}

export function planRelease(input: {
  packageVersion: string
  tag: string
}): ReleasePlan {
  const { channel, version } = parseReleaseTag(input.tag)
  const baseVersion = version.split("-")[0]

  // The tag only selects the channel and prerelease counter; the core
  // X.Y.Z must match package.json, which is never rewritten.
  if (baseVersion !== input.packageVersion) {
    throw new Error(
      `Tag "${input.tag}" does not match apps/extension/package.json version ${input.packageVersion}. Bump the package version or fix the tag; the manifest is never rewritten.`
    )
  }

  const stem = `crikket-extension-${version}`
  const artifacts = {
    chromium: `${stem}-chromium.zip`,
    firefox: `${stem}-firefox.zip`,
  }

  return {
    artifacts,
    channel,
    notes: [
      `Crikket browser extension ${version}`,
      "",
      `- Version: ${version}`,
      `- Channel: ${channel}`,
      "- Supported browsers: Chromium (Chrome, Edge, Brave) and Firefox",
      "",
      "Downloads:",
      `- Chromium: \`${artifacts.chromium}\` (unzip, then load unpacked)`,
      `- Firefox: \`${artifacts.firefox}\``,
      "",
    ].join("\n"),
    prerelease: channel !== "stable",
    tag: input.tag,
    version,
  }
}

function main() {
  const packageJson = JSON.parse(
    readFileSync(resolve(import.meta.dir, "../package.json"), "utf8")
  ) as { version: string }
  const tag = resolveReleaseTag({
    alphaBuildNumber: process.env.ALPHA_BUILD_NUMBER ?? "",
    packageVersion: packageJson.version,
    releaseTag: process.env.RELEASE_TAG ?? "",
  })

  const plan = planRelease({ packageVersion: packageJson.version, tag })

  const notesPath = resolve(process.env.RUNNER_TEMP ?? ".", "release-notes.md")
  writeFileSync(notesPath, plan.notes)

  const outputs = {
    channel: plan.channel,
    chromium_artifact: plan.artifacts.chromium,
    firefox_artifact: plan.artifacts.firefox,
    notes_path: notesPath,
    prerelease: String(plan.prerelease),
    tag: plan.tag,
    version: plan.version,
  }
  const lines = Object.entries(outputs).map(([k, v]) => `${k}=${v}`)

  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join("\n")}\n`)
  }
  console.log(lines.join("\n"))
}

if (import.meta.main) {
  try {
    main()
  } catch (error) {
    console.error(`::error::${(error as Error).message}`)
    process.exit(1)
  }
}
