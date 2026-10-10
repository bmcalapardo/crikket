import { describe, expect, test } from "bun:test"
import { LOCAL_BUILD_SHA, resolveBuildSha } from "../lib/build-sha"

describe("resolveBuildSha", () => {
  test("uses the commit CI provides", () => {
    expect(resolveBuildSha("0123abcd")).toBe("0123abcd")
  })

  test("falls back to local when none is set", () => {
    expect(resolveBuildSha(undefined)).toBe(LOCAL_BUILD_SHA)
    expect(resolveBuildSha("")).toBe("local")
    expect(resolveBuildSha("   ")).toBe("local")
  })
})
