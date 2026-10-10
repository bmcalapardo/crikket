import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

import {
  branchVersion,
  type CheckInput,
  checkChangelog,
  compareVersions,
  LINE_PATTERN,
  parseChangelog,
} from "../scripts/check-changelog"

const HISTORY = `### v0.1.2
- [BC] app(update): add visiblity field to report generation

### v0.1.3
- [BC] ci: gate pull requests on typecheck, extension build, and tests
- [BC] feat(extension): add screenshot crop stage before submit
`

const NEW_LINE = "- [BC] feat(extension): annotate screenshots"

const BLOCK = `${HISTORY}
### v0.2.0
- [BC] ci(release): open the block
`

function run(overrides: Partial<CheckInput>): string[] {
  return checkChangelog({
    baseChangelog: HISTORY,
    baseRef: "master",
    headChangelog: HISTORY,
    headRef: "feature/x",
    labels: [],
    packageVersion: "0.1.3",
    ...overrides,
  })
}

describe("LINE_PATTERN", () => {
  test.each([
    "- [BC] feat(extension): add screenshot crop stage before submit",
    "- [BC] ci: gate pull requests on typecheck, extension build, and tests",
    "- [BC] app(update): make bug reports default public",
    "- [AB] fix(api/v2): handle empty body",
  ])("accepts %j", (line) => {
    expect(LINE_PATTERN.test(line)).toBe(true)
  })

  test.each([
    "- feat(extension): no initials",
    "- [bc] feat: lowercase initials",
    "- [BC] Feat: capital type",
    "- [BC] feat(Extension): capital scope",
    "- [BC] feat(): empty scope",
    "- [BC] feat(extension) missing colon",
    "- [BC] feat(extension):",
    "- [BC] feat(extension):no space",
    "* [BC] feat: wrong bullet",
  ])("rejects %j", (line) => {
    expect(LINE_PATTERN.test(line)).toBe(false)
  })

  test("every line of the existing Changelog.md history passes", () => {
    const text = readFileSync(
      new URL("../../../Changelog.md", import.meta.url),
      "utf8"
    )
    const lines = parseChangelog(text).flatMap((section) => section.lines)
    expect(lines.length).toBeGreaterThan(0)
    expect(lines.filter((line) => !LINE_PATTERN.test(line))).toEqual([])
  })
})

describe("helpers", () => {
  test("branchVersion reads prerelease/vX.Y.Z only", () => {
    expect(branchVersion("prerelease/v0.2.0")).toBe("0.2.0")
    expect(branchVersion("prerelease/v0.2")).toBeNull()
    expect(branchVersion("feature/prerelease/v0.2.0")).toBeNull()
  })

  test("compareVersions compares numerically", () => {
    expect(compareVersions("0.10.0", "0.9.0")).toBeGreaterThan(0)
    expect(compareVersions("0.2.0", "0.2.0")).toBe(0)
    expect(compareVersions("0.1.9", "0.2.0")).toBeLessThan(0)
  })

  test("parseChangelog groups lines under headings and ignores blanks", () => {
    expect(
      parseChangelog(BLOCK).map((s) => [s.version, s.lines.length])
    ).toEqual([
      ["0.1.2", 1],
      ["0.1.3", 2],
      ["0.2.0", 1],
    ])
  })
})

describe("PR into prerelease/vX.Y.Z", () => {
  const into = {
    baseChangelog: BLOCK,
    baseRef: "prerelease/v0.2.0",
    headRef: "feature/y",
    packageVersion: "0.2.0",
  }

  test("accepts one appended line under the block heading", () => {
    expect(run({ ...into, headChangelog: `${BLOCK}${NEW_LINE}\n` })).toEqual([])
  })

  test("requires a changelog line unless labeled skip-changelog", () => {
    expect(run({ ...into, headChangelog: BLOCK })[0]).toContain("Add a")
    expect(
      run({ ...into, headChangelog: BLOCK, labels: ["skip-changelog"] })
    ).toEqual([])
  })

  test("rejects a malformed added line", () => {
    const errors = run({ ...into, headChangelog: `${BLOCK}- [BC] oops\n` })
    expect(errors.join()).toContain("does not match")
  })

  test("rejects an edit to earlier versions", () => {
    const edited = BLOCK.replace("add visiblity", "add visibility")
    expect(
      run({ ...into, headChangelog: `${edited}${NEW_LINE}\n` }).join()
    ).toContain("history")
  })

  test("rejects an edit to existing lines in the block section", () => {
    const edited = BLOCK.replace("open the block", "open a block")
    expect(
      run({ ...into, headChangelog: `${edited}${NEW_LINE}\n` }).join()
    ).toContain("Only append")
  })

  test("rejects a line added above the block's existing lines", () => {
    const head = BLOCK.replace("### v0.2.0\n", `### v0.2.0\n${NEW_LINE}\n`)
    expect(run({ ...into, headChangelog: head }).join()).toContain(
      "Only append"
    )
  })

  test("rejects a line appended under an earlier heading", () => {
    const head = BLOCK.replace("### v0.1.3\n", `### v0.1.3\n${NEW_LINE}\n`)
    expect(run({ ...into, headChangelog: head }).join()).toContain("history")
  })

  test("rejects a last heading that differs from the branch version", () => {
    expect(
      run({
        ...into,
        baseRef: "prerelease/v0.3.0",
        headChangelog: `${BLOCK}${NEW_LINE}\n`,
      }).join()
    ).toContain("branch version is v0.3.0")
  })

  test("rejects a package.json version that differs from the branch version", () => {
    expect(
      run({
        ...into,
        headChangelog: `${BLOCK}${NEW_LINE}\n`,
        packageVersion: "0.1.3",
      }).join()
    ).toContain("package.json version 0.1.3")
  })

  test("the opening PR may add the block heading and its first line", () => {
    expect(
      run({ ...into, baseChangelog: HISTORY, headChangelog: BLOCK })
    ).toEqual([])
  })

  test("the opening PR may rename an unreleased last heading", () => {
    expect(
      run({
        ...into,
        baseChangelog: HISTORY,
        headChangelog: `${HISTORY.replace("### v0.1.3", "### v0.2.0")}${NEW_LINE}\n`,
      })
    ).toEqual([])
  })

  test("rejects a repeated block heading", () => {
    expect(
      run({
        ...into,
        headChangelog: `${BLOCK}\n### v0.2.0\n${NEW_LINE}\n`,
      }).join()
    ).toContain("more than once")
  })

  test("rejects targeting a branch that is not prerelease/vX.Y.Z", () => {
    expect(
      run({ ...into, baseRef: "prerelease/next", headChangelog: BLOCK }).join()
    ).toContain("not a prerelease/vX.Y.Z branch")
  })
})

describe("PR into master", () => {
  const block = {
    baseChangelog: HISTORY,
    headChangelog: BLOCK,
    headRef: "prerelease/v0.2.0",
    packageVersion: "0.2.0",
  }

  test("accepts a finished block from its prerelease branch", () => {
    expect(run(block)).toEqual([])
  })

  test("exempts only the changesets release PR into master", () => {
    expect(run({ headRef: "changeset-release/master" })).toEqual([])
    expect(run({ headRef: "changeset-release/other" }).join()).toContain(
      "must come from a prerelease/vX.Y.Z branch"
    )
    expect(
      run({
        baseRef: "prerelease/v0.2.0",
        headRef: "changeset-release/master",
      }).join()
    ).not.toBe("")
  })

  test("rejects a block whose branch, heading or package disagree", () => {
    expect(run({ ...block, headRef: "prerelease/v0.3.0" }).join()).toContain(
      "branch version is v0.3.0"
    )
    expect(run({ ...block, packageVersion: "0.1.3" }).join()).toContain(
      "package.json version 0.1.3"
    )
  })

  test("rejects an empty block section", () => {
    expect(
      run({ ...block, headChangelog: `${HISTORY}\n### v0.2.0\n` }).join()
    ).toContain("is empty")
  })

  test("rejects a malformed line anywhere in the block", () => {
    expect(
      run({ ...block, headChangelog: `${BLOCK}- [BC] Fix stuff\n` }).join()
    ).toContain("does not match")
  })

  test("rejects a block older than master", () => {
    expect(
      run({
        ...block,
        baseChangelog: BLOCK,
        headChangelog: BLOCK.replace("v0.2.0", "v0.1.9"),
        headRef: "prerelease/v0.1.9",
        packageVersion: "0.1.9",
      }).join()
    ).toContain("older than")
  })

  test.each([
    "feature/x",
    "fix/x",
    "hotfix",
    "nothotfix/x",
  ])("a direct PR from %j fails with a pointer to the prerelease flow", (headRef) => {
    const errors = run({ headChangelog: `${HISTORY}${NEW_LINE}\n`, headRef })
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain("prerelease/vX.Y.Z")
    expect(errors[0]).toContain("hotfix/")
  })

  test("a skip-changelog label does not unlock a direct feature PR", () => {
    expect(
      run({ headChangelog: HISTORY, labels: ["skip-changelog"] })
    ).toHaveLength(1)
  })

  test("a hotfix/ PR needs a changelog line and a synced version", () => {
    const hotfix = { headRef: "hotfix/crash" }
    expect(
      run({ ...hotfix, headChangelog: `${HISTORY}${NEW_LINE}\n` })
    ).toEqual([])
    expect(run({ ...hotfix, headChangelog: HISTORY })[0]).toContain("Add a")
    expect(
      run({
        ...hotfix,
        headChangelog: `${HISTORY}${NEW_LINE}\n`,
        packageVersion: "0.1.2",
      }).join()
    ).toContain("does not match the last Changelog.md heading")
    expect(
      run({
        ...hotfix,
        headChangelog: HISTORY,
        labels: ["skip-changelog"],
      })
    ).toEqual([])
  })

  test("rejects a block that rewrites master's history", () => {
    expect(
      run({
        ...block,
        headChangelog: BLOCK.replace("crop stage", "CROP stage"),
      }).join()
    ).toContain("history")
    expect(
      run({
        ...block,
        headChangelog: BLOCK.replace(
          "- [BC] ci: gate pull requests on typecheck, extension build, and tests\n",
          ""
        ),
      }).join()
    ).toContain("history")
  })

  test("rejects a repeated heading in a block", () => {
    expect(
      run({
        ...block,
        headChangelog: `${BLOCK}\n### v0.2.0\n${NEW_LINE}\n`,
      }).join()
    ).toContain("more than once")
  })

  test("a hotfix cannot rewrite history", () => {
    const hotfix = { headRef: "hotfix/crash", labels: ["skip-changelog"] }
    expect(
      run({
        ...hotfix,
        headChangelog: HISTORY.replace("crop stage", "CROP stage"),
      }).join()
    ).toContain("history")
    expect(
      run({
        ...hotfix,
        headChangelog: HISTORY.replace("### v0.1.2\n", ""),
      }).join()
    ).toContain("history")
  })

  test("a hotfix may open a new patch heading once the version shipped", () => {
    const head = `${HISTORY}\n### v0.1.4\n${NEW_LINE}\n`
    expect(
      run({
        headChangelog: head,
        headRef: "hotfix/crash",
        packageVersion: "0.1.4",
      })
    ).toEqual([])
  })

  test("a feature branch gets no exception into master", () => {
    expect(
      run({
        headChangelog: BLOCK,
        headRef: "feature/prerelease-branches",
        packageVersion: "0.2.0",
      })
    ).toHaveLength(1)
  })
})
