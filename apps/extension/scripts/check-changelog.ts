import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

export interface Section {
  lines: string[]
  version: string
}

const LINE_BREAK = /\r?\n/
const HEADING_PATTERN = /^### v(\d+\.\d+\.\d+)\s*$/
const PRERELEASE_BRANCH_PATTERN = /^prerelease\/v(\d+\.\d+\.\d+)$/

// `- [BC] feat(extension): subject`. The scope is optional because history
// has lines like `- [BC] ci: gate pull requests ...`, and the type is any
// lowercase word because history also uses `app(update): ...`.
export const LINE_PATTERN =
  /^- \[[A-Z]{2,5}\] [a-z]+(?:\([a-z0-9][a-z0-9._/-]*\))?: \S.*$/

const SKIP_CHANGELOG = "skip-changelog"
const MISSING_LINE =
  "Add a '- [Initials] type(scope): subject' line under the last version heading in Changelog.md, or label the PR skip-changelog."

export const HOTFIX_PREFIX = "hotfix/"

const CHANGESETS_RELEASE_BRANCH = "changeset-release/master"

export const PRERELEASE_BRANCH_HINT =
  "Open a prerelease/vX.Y.Z branch from master, target your PR at it, and merge the finished block to master (CONTRIBUTING.md, Changelog and Versioning). Urgent fixes use a hotfix/ branch instead."

export function parseChangelog(text: string): Section[] {
  const sections: Section[] = []
  for (const raw of text.split(LINE_BREAK)) {
    const line = raw.trimEnd()
    const heading = HEADING_PATTERN.exec(line)
    if (heading) {
      sections.push({ lines: [], version: heading[1] })
    } else if (line.trim() !== "" && sections.length > 0) {
      sections.at(-1)?.lines.push(line)
    }
  }
  return sections
}

export function branchVersion(ref: string): string | null {
  return PRERELEASE_BRANCH_PATTERN.exec(ref)?.[1] ?? null
}

export function compareVersions(a: string, b: string): number {
  const left = a.split(".").map(Number)
  const right = b.split(".").map(Number)
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) {
      return left[i] - right[i]
    }
  }
  return 0
}

const sameSection = (a: Section, b: Section) =>
  a.version === b.version &&
  a.lines.length === b.lines.length &&
  a.lines.every((line, i) => line === b.lines[i])

const sameSections = (a: Section[], b: Section[]) =>
  a.length === b.length && a.every((section, i) => sameSection(section, b[i]))

function lineErrors(lines: string[]): string[] {
  return lines
    .filter((line) => !LINE_PATTERN.test(line))
    .map(
      (line) =>
        `Changelog line "${line}" does not match "- [Initials] type(scope): subject" (CONTRIBUTING.md, Changelog and Versioning).`
    )
}

// Everything above the last heading is history: the head either keeps all of
// the base's sections and adds one heading, or keeps all but its last section
// and only appends lines to that one (which may be renamed to a new version).
function historyErrors(base: Section[], head: Section[]): string[] {
  const baseLast = base.at(-1)
  const last = head.at(-1)
  if (!(baseLast && last)) {
    return []
  }
  const opensNewHeading =
    head.length === base.length + 1 && sameSections(head.slice(0, -1), base)
  const appendsToLast =
    head.length === base.length &&
    sameSections(head.slice(0, -1), base.slice(0, -1)) &&
    baseLast.lines.every((line, i) => last.lines[i] === line)
  return opensNewHeading || appendsToLast
    ? []
    : [
        "Earlier versions in Changelog.md are history; only append under the last heading.",
      ]
}

function duplicateErrors(head: Section[]): string[] {
  const versions = head.map((section) => section.version)
  const repeated = new Set(
    versions.filter((version, i) => versions.indexOf(version) !== i)
  )
  return [...repeated].map(
    (version) =>
      `The v${version} heading appears in Changelog.md more than once.`
  )
}

export interface CheckInput {
  baseChangelog: string
  baseRef: string
  headChangelog: string
  headRef: string
  labels: string[]
  packageVersion: string
}

function checkVersions(
  version: string,
  head: Section[],
  packageVersion: string
): string[] {
  const errors: string[] = duplicateErrors(head)
  const last = head.at(-1)
  if (!last) {
    return ["Changelog.md has no '### vX.Y.Z' heading."]
  }
  if (last.version !== version) {
    errors.push(
      `The last Changelog.md heading is v${last.version} but the branch version is v${version}.`
    )
  }
  if (packageVersion !== version) {
    errors.push(
      `apps/extension/package.json version ${packageVersion} does not match v${version}.`
    )
  }
  return errors
}

// Feature PR into prerelease/vX.Y.Z: append-only changelog under the
// block's heading, and the block's version everywhere.
function checkIntoPrerelease(input: CheckInput, version: string): string[] {
  const base = parseChangelog(input.baseChangelog)
  const head = parseChangelog(input.headChangelog)
  const errors = checkVersions(version, head, input.packageVersion)
  const last = head.at(-1)
  const baseLast = base.at(-1)
  if (!(last && baseLast)) {
    return errors
  }

  // Opening the block adds a new heading; otherwise the base already has
  // the block's heading (or an unreleased last one that is renamed to it).
  const opensNewHeading = head.length === base.length + 1
  const history = opensNewHeading ? base : base.slice(0, -1)
  if (
    (!opensNewHeading && head.length !== base.length) ||
    !sameSections(head.slice(0, history.length), history)
  ) {
    errors.push(
      "Earlier versions in Changelog.md are history; only append under the last heading."
    )
    return errors
  }
  const baseLines = opensNewHeading ? [] : baseLast.lines
  if (!baseLines.every((line, i) => last.lines[i] === line)) {
    errors.push(
      "Only append new lines to the end of the last Changelog.md section."
    )
    return errors
  }

  const added = last.lines.slice(baseLines.length)
  if (added.length === 0 && !input.labels.includes(SKIP_CHANGELOG)) {
    errors.push(MISSING_LINE)
  }
  return [...errors, ...lineErrors(added)]
}

// Block PR into master: the whole block is validated before it ships.
function checkBlockIntoMaster(input: CheckInput, version: string): string[] {
  const head = parseChangelog(input.headChangelog)
  const base = parseChangelog(input.baseChangelog)
  const errors = [
    ...checkVersions(version, head, input.packageVersion),
    ...historyErrors(base, head),
  ]
  const last = head.at(-1)
  const baseLast = base.at(-1)
  if (last?.version === version) {
    if (last.lines.length === 0) {
      errors.push(`The v${version} section of Changelog.md is empty.`)
    }
    errors.push(...lineErrors(last.lines))
  }
  if (baseLast && compareVersions(version, baseLast.version) < 0) {
    errors.push(
      `Block version v${version} is older than master's v${baseLast.version}.`
    )
  }
  return errors
}

// Hotfix PR straight into master: a changelog line under the
// last heading, or a new patch heading if that version already shipped, and a synced version,
// no block.
function checkHotfix(input: CheckInput): string[] {
  const base = parseChangelog(input.baseChangelog)
  const head = parseChangelog(input.headChangelog)
  const errors: string[] = [
    ...duplicateErrors(head),
    ...historyErrors(base, head),
  ]
  const last = head.at(-1)
  if (last && last.version !== input.packageVersion) {
    errors.push(
      `Extension version ${input.packageVersion} does not match the last Changelog.md heading v${last.version}.`
    )
  }
  if (!input.labels.includes(SKIP_CHANGELOG)) {
    const baseLast = base.at(-1)
    const prior =
      baseLast && baseLast.version === last?.version ? baseLast.lines : []
    const added = last ? last.lines.slice(prior.length) : []
    if (added.length === 0) {
      errors.push(MISSING_LINE)
    }
    errors.push(...lineErrors(added))
  }
  return errors
}

export function checkChangelog(input: CheckInput): string[] {
  if (input.baseRef === "master") {
    // The changesets "Version Packages" PR only touches package changelogs.
    // Match its exact branch, so a prefix can't bypass the checks.
    if (input.headRef === CHANGESETS_RELEASE_BRANCH) {
      return []
    }
    const block = branchVersion(input.headRef)
    if (block) {
      return checkBlockIntoMaster(input, block)
    }
    if (input.headRef.startsWith(HOTFIX_PREFIX)) {
      return checkHotfix(input)
    }
    return [
      `PRs into master must come from a prerelease/vX.Y.Z branch, not "${input.headRef}". ${PRERELEASE_BRANCH_HINT}`,
    ]
  }

  const version = branchVersion(input.baseRef)
  if (!version) {
    return [
      `"${input.baseRef}" is not a prerelease/vX.Y.Z branch, so PRs cannot target it.`,
    ]
  }
  return checkIntoPrerelease(input, version)
}

function git(...args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8" })
}

function main() {
  const baseRef = process.env.BASE_REF ?? ""
  const headRef = process.env.HEAD_REF ?? ""
  const labels = JSON.parse(process.env.PR_LABELS || "[]") as string[]

  const mergeBase = git("merge-base", `origin/${baseRef}`, "HEAD").trim()
  const root = resolve(import.meta.dir, "../../..")
  const packageJson = JSON.parse(
    readFileSync(resolve(root, "apps/extension/package.json"), "utf8")
  ) as { version: string }

  const errors = checkChangelog({
    baseChangelog: git("show", `${mergeBase}:Changelog.md`),
    baseRef,
    headChangelog: readFileSync(resolve(root, "Changelog.md"), "utf8"),
    headRef,
    labels,
    packageVersion: packageJson.version,
  })

  if (errors.length > 0) {
    for (const message of errors) {
      console.error(`::error file=Changelog.md::${message}`)
    }
    process.exit(1)
  }
  console.log(`Changelog checks passed for ${headRef} -> ${baseRef}.`)
}

if (import.meta.main) {
  main()
}
