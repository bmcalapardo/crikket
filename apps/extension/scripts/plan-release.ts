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

const PRERELEASE_BRANCH_PATTERN = /^prerelease\/v(\d+\.\d+\.\d+)$/

// A pushed or dispatched tag wins. Otherwise the branch picks the channel:
// a push to prerelease/vX.Y.Z is an alpha, a push to master (the merged
// block) is a beta. Both are numbered by the workflow run, which is unique
// and increasing across the whole workflow, so an alpha and a beta can never
// share a tag. Semver orders X.Y.Z-alpha.N < X.Y.Z-beta.N < X.Y.Z whatever N is.
export function resolveReleaseTag(input: {
  branch: string
  buildNumber: string
  packageVersion: string
  releaseTag: string
}): string {
  if (input.releaseTag) {
    return input.releaseTag
  }

  if (!input.buildNumber) {
    throw new Error(
      "No release tag given. Push an extension-v* tag, dispatch with a tag, push to prerelease/vX.Y.Z for an automatic alpha, or merge to master for an automatic beta."
    )
  }

  if (!BUILD_NUMBER_PATTERN.test(input.buildNumber)) {
    throw new Error(
      `Invalid build number "${input.buildNumber}". Expected a positive integer.`
    )
  }

  if (input.branch === "master") {
    return `extension-v${input.packageVersion}-beta.${input.buildNumber}`
  }

  const branchMatch = PRERELEASE_BRANCH_PATTERN.exec(input.branch)
  if (!branchMatch) {
    throw new Error(
      `Branch "${input.branch}" does not publish releases. Only prerelease/vX.Y.Z (alpha) and master (beta) do.`
    )
  }
  if (branchMatch[1] !== input.packageVersion) {
    throw new Error(
      `Branch "${input.branch}" does not match apps/extension/package.json version ${input.packageVersion}. Bump the package version or fix the branch name.`
    )
  }
  return `extension-v${input.packageVersion}-alpha.${input.buildNumber}`
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
    branch: process.env.RELEASE_BRANCH ?? "",
    buildNumber: process.env.BUILD_NUMBER ?? "",
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
