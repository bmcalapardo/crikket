import { describe, expect, test } from "bun:test"

import {
  parseReleaseTag,
  planRelease,
  resolveReleaseTag,
} from "../scripts/plan-release"

const INVALID_TAG = /Invalid release tag/
const MISMATCH = /does not match apps\/extension\/package\.json/
const INVALID_BUILD_NUMBER = /Invalid build number/
const NO_TAG = /No release tag/
const BRANCH_MISMATCH = MISMATCH
const NO_RELEASE_BRANCH = /does not publish releases/

describe("parseReleaseTag", () => {
  test("derives the stable channel from extension-vX.Y.Z", () => {
    expect(parseReleaseTag("extension-v0.1.2")).toEqual({
      channel: "stable",
      version: "0.1.2",
    })
  })

  test("derives alpha and beta channels from prerelease tags", () => {
    expect(parseReleaseTag("extension-v0.1.2-alpha.3")).toEqual({
      channel: "alpha",
      version: "0.1.2-alpha.3",
    })
    expect(parseReleaseTag("extension-v1.20.3-beta.10")).toEqual({
      channel: "beta",
      version: "1.20.3-beta.10",
    })
  })

  test.each([
    "",
    "v0.1.2",
    "extension-0.1.2",
    "extension-v0.1",
    "extension-v0.1.2-rc.1",
    "extension-v0.1.2-alpha",
    "extension-v0.1.2-alpha.",
    "extension-v0.1.2-alpha.1.2",
    "extension-v0.1.2-gamma.1",
    "extension-v0.1.2 ",
    "xextension-v0.1.2",
    "extension-v0.1.2\nextension-v0.1.3",
  ])("rejects invalid tag %j", (tag) => {
    expect(() => parseReleaseTag(tag)).toThrow(INVALID_TAG)
  })
})

describe("planRelease", () => {
  test("produces deterministic artifact names and prerelease flag", () => {
    const plan = planRelease({
      packageVersion: "0.1.2",
      tag: "extension-v0.1.2-alpha.1",
    })
    expect(plan.artifacts).toEqual({
      chromium: "crikket-extension-0.1.2-alpha.1-chromium.zip",
      firefox: "crikket-extension-0.1.2-alpha.1-firefox.zip",
    })
    expect(plan.prerelease).toBe(true)
    expect(plan.channel).toBe("alpha")
    expect(plan.tag).toBe("extension-v0.1.2-alpha.1")
  })

  test("stable releases are not prereleases", () => {
    const plan = planRelease({
      packageVersion: "0.1.2",
      tag: "extension-v0.1.2",
    })
    expect(plan.prerelease).toBe(false)
    expect(plan.artifacts.chromium).toBe("crikket-extension-0.1.2-chromium.zip")
  })

  test("release notes state browsers, version and channel", () => {
    const { notes } = planRelease({
      packageVersion: "0.1.2",
      tag: "extension-v0.1.2-beta.2",
    })
    expect(notes).toContain("Version: 0.1.2-beta.2")
    expect(notes).toContain("Channel: beta")
    expect(notes).toContain("Chromium")
    expect(notes).toContain("Firefox")
  })

  test("fails when the tag version disagrees with package.json", () => {
    expect(() =>
      planRelease({ packageVersion: "0.1.2", tag: "extension-v0.1.3" })
    ).toThrow(MISMATCH)
    expect(() =>
      planRelease({ packageVersion: "0.1.2", tag: "extension-v0.2.2-alpha.1" })
    ).toThrow(MISMATCH)
  })

  test("fails on an invalid tag before comparing versions", () => {
    expect(() =>
      planRelease({ packageVersion: "0.1.2", tag: "v0.1.2" })
    ).toThrow(INVALID_TAG)
  })
})

describe("resolveReleaseTag", () => {
  const base = {
    branch: "",
    buildNumber: "",
    packageVersion: "0.2.0",
    releaseTag: "",
  }

  test("a push to prerelease/vX.Y.Z becomes an alpha", () => {
    const tag = resolveReleaseTag({
      ...base,
      branch: "prerelease/v0.2.0",
      buildNumber: "57",
    })

    expect(tag).toBe("extension-v0.2.0-alpha.57")
    expect(planRelease({ packageVersion: "0.2.0", tag }).channel).toBe("alpha")
  })

  test("a push to master becomes a beta", () => {
    const tag = resolveReleaseTag({
      ...base,
      branch: "master",
      buildNumber: "58",
    })

    expect(tag).toBe("extension-v0.2.0-beta.58")
    expect(planRelease({ packageVersion: "0.2.0", tag }).channel).toBe("beta")
  })

  test("alpha and beta never share a tag, even for the same number", () => {
    const alpha = resolveReleaseTag({
      ...base,
      branch: "prerelease/v0.2.0",
      buildNumber: "60",
    })
    const beta = resolveReleaseTag({
      ...base,
      branch: "master",
      buildNumber: "60",
    })

    expect(alpha).not.toBe(beta)
  })

  test("fails when the prerelease branch version differs from package.json", () => {
    expect(() =>
      resolveReleaseTag({
        ...base,
        branch: "prerelease/v0.3.0",
        buildNumber: "5",
      })
    ).toThrow(BRANCH_MISMATCH)
  })

  test.each([
    "feature/x",
    "prerelease/v0.2",
    "prerelease/v0.2.0-rc",
    "prerelease/0.2.0",
    "",
  ])("branch %j does not publish releases", (branch) => {
    expect(() =>
      resolveReleaseTag({ ...base, branch, buildNumber: "5" })
    ).toThrow(NO_RELEASE_BRANCH)
  })

  test("a pushed or dispatched tag is used as-is, whatever the branch", () => {
    expect(
      resolveReleaseTag({
        ...base,
        branch: "master",
        releaseTag: "extension-v0.2.0-beta.1",
      })
    ).toBe("extension-v0.2.0-beta.1")
  })

  test.each([
    "0",
    "-1",
    "1.5",
    "abc",
    " 7",
  ])("rejects build number %j", (buildNumber) => {
    expect(() =>
      resolveReleaseTag({ ...base, branch: "master", buildNumber })
    ).toThrow(INVALID_BUILD_NUMBER)
  })

  test("fails when neither a tag nor a build number is given", () => {
    expect(() => resolveReleaseTag(base)).toThrow(NO_TAG)
  })
})
