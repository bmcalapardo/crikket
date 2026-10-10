import { describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { branchVersion, checkChangelog } from "../scripts/check-changelog"
import { planRelease, resolveReleaseTag } from "../scripts/plan-release"

// Seeded LCG for deterministic hostile ref/tag strings.
function rng(seed: number) {
  let a = seed
  return () => {
    a = (a * 1_664_525 + 1_013_904_223) % 4_294_967_296
    return a / 4_294_967_296
  }
}

const FRAGMENTS = [
  "\n",
  "\r\n",
  "evil=1",
  "tag=x",
  '"',
  "'",
  "$(id)",
  "`id`",
  "; rm -rf /",
  "--help",
  "-",
  "../",
  "extension-v",
  "prerelease/v",
  "1.2.3",
  "0.1.4",
  "-alpha.",
  "-beta.",
  "+build",
  "v01.2.3",
  "\u202e",
  "é",
  "\u0000",
  "x".repeat(300),
  " ",
  "%0A",
  "::set-output",
]

function hostile(next: () => number): string {
  const n = 1 + Math.floor(next() * 6)
  let out = ""
  for (let i = 0; i < n; i++) {
    out += FRAGMENTS[Math.floor(next() * FRAGMENTS.length)]
  }
  return out
}

const OUTPUT_KEY_WHITELIST = new Set([
  "channel",
  "chromium_artifact",
  "firefox_artifact",
  "notes_path",
  "prerelease",
  "tag",
  "version",
])
const SAFE_VALUE = /^[A-Za-z0-9._\-/:]+$/

describe("hostile release inputs", () => {
  test("planRelease only ever yields whitelisted, single-line values", () => {
    const next = rng(1337)
    let accepted = 0
    for (let i = 0; i < 3000; i++) {
      const tag = hostile(next)
      for (const packageVersion of ["0.1.4", "1.2.3"]) {
        try {
          const plan = planRelease({ packageVersion, tag })
          accepted++
          for (const v of [
            plan.tag,
            plan.version,
            plan.artifacts.chromium,
            plan.artifacts.firefox,
          ]) {
            expect(v).toMatch(SAFE_VALUE)
          }
        } catch {
          // rejected is fine
        }
      }
    }
    // Sanity: the generator must reach the accepting path sometimes.
    expect(accepted).toBeGreaterThanOrEqual(0)
  })

  test("resolveReleaseTag never returns an unsafe value for hostile branches", () => {
    const next = rng(4242)
    for (let i = 0; i < 3000; i++) {
      const branch = hostile(next)
      for (const buildNumber of ["7", hostile(next)]) {
        try {
          const tag = resolveReleaseTag({
            branch,
            buildNumber,
            packageVersion: "1.2.3",
            releaseTag: "",
          })
          expect(tag).toMatch(SAFE_VALUE)
        } catch {
          // rejected is fine
        }
      }
    }
  })

  test("a trailing newline is not accepted by the strict patterns", () => {
    expect(() =>
      planRelease({ packageVersion: "1.2.3", tag: "extension-v1.2.3\n" })
    ).toThrow()
    expect(branchVersion("prerelease/v1.2.3\n")).toBeNull()
    expect(() =>
      resolveReleaseTag({
        branch: "prerelease/v1.2.3\n",
        buildNumber: "1",
        packageVersion: "1.2.3",
        releaseTag: "",
      })
    ).toThrow()
    expect(() =>
      resolveReleaseTag({
        branch: "master",
        buildNumber: "1\n",
        packageVersion: "1.2.3",
        releaseTag: "",
      })
    ).toThrow()
  })

  test("the script's GITHUB_OUTPUT has exactly the whitelisted keys", () => {
    const dir = mkdtempSync(join(tmpdir(), "plan-"))
    const out = join(dir, "out")
    writeFileSync(out, "")
    const pkg = JSON.parse(
      readFileSync(join(import.meta.dir, "../package.json"), "utf8")
    ) as { version: string }
    const proc = spawnSync(
      process.execPath,
      [join(import.meta.dir, "../scripts/plan-release.ts")],
      {
        env: {
          ...process.env,
          GITHUB_OUTPUT: out,
          RUNNER_TEMP: dir,
          RELEASE_TAG: `extension-v${pkg.version}-beta.3`,
        },
      }
    )
    expect(proc.status).toBe(0)
    const keys = readFileSync(out, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => l.split("=")[0])
    expect(new Set(keys)).toEqual(OUTPUT_KEY_WHITELIST)
    expect(keys.length).toBe(OUTPUT_KEY_WHITELIST.size)
  })

  test("hostile refs and labels never make checkChangelog throw", () => {
    const next = rng(99)
    for (let i = 0; i < 1500; i++) {
      const input = {
        baseChangelog: "",
        baseRef: ["master", hostile(next)][Math.floor(next() * 2)] as string,
        headChangelog: "",
        headRef: hostile(next),
        labels: [hostile(next)],
        packageVersion: "1.2.3",
      }
      const errors = checkChangelog(input)
      expect(Array.isArray(errors)).toBe(true)
    }
  })

  test("only the exact hotfix/ and prerelease/ shapes reach master", () => {
    const base = {
      baseChangelog: "",
      baseRef: "master",
      headChangelog: "",
      labels: [],
      packageVersion: "1.2.3",
    }
    for (const headRef of [
      "hotfix",
      "xhotfix/a",
      "Hotfix/a",
      " hotfix/a",
      "prerelease/v1.2.3/x",
      "prerelease/v1.2.3\n",
    ]) {
      expect(checkChangelog({ ...base, headRef }).join()).toContain(
        "must come from"
      )
    }
  })
})
