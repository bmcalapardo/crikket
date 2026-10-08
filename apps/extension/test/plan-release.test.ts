import { describe, expect, test } from "bun:test"

import {
  parseReleaseTag,
  planRelease,
  resolveReleaseTag,
} from "../scripts/plan-release"

const INVALID_TAG = /Invalid release tag/
const MISMATCH = /does not match apps\/extension\/package\.json/
const INVALID_BUILD_NUMBER = /Invalid alpha build number/
const NO_TAG = /No release tag/

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
  test("a merge to master gets an alpha tag from the package version and build number", () => {
    const tag = resolveReleaseTag({
      alphaBuildNumber: "57",
      packageVersion: "0.1.2",
      releaseTag: "",
    })

    expect(tag).toBe("extension-v0.1.2-alpha.57")
    expect(planRelease({ packageVersion: "0.1.2", tag }).channel).toBe("alpha")
  })

  test("a pushed or dispatched tag is used as-is", () => {
    expect(
      resolveReleaseTag({
        alphaBuildNumber: "",
        packageVersion: "0.1.2",
        releaseTag: "extension-v0.1.2-beta.1",
      })
    ).toBe("extension-v0.1.2-beta.1")
  })

  test.each([
    "0",
    "-1",
    "1.5",
    "abc",
    " 7",
  ])("rejects alpha build number %j", (alphaBuildNumber) => {
    expect(() =>
      resolveReleaseTag({
        alphaBuildNumber,
        packageVersion: "0.1.2",
        releaseTag: "",
      })
    ).toThrow(INVALID_BUILD_NUMBER)
  })

  test("fails when neither a tag nor an alpha build number is given", () => {
    expect(() =>
      resolveReleaseTag({
        alphaBuildNumber: "",
        packageVersion: "0.1.2",
        releaseTag: "",
      })
    ).toThrow(NO_TAG)
  })
})
