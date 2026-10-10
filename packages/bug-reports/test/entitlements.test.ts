import { beforeEach, describe, expect, it, mock } from "bun:test"
import type { EntitlementSnapshot } from "@crikket/billing/model"

const state = {
  entitlements: {} as Partial<EntitlementSnapshot>,
}

mock.module(
  "@crikket/billing/service/entitlements/organization-entitlements",
  () => ({
    getOrganizationEntitlements: () => Promise.resolve(state.entitlements),
  })
)

const { assertCreateBugReportEntitlements } = await import(
  "../src/lib/entitlements"
)

const PRO_LIMIT_MS = 600_000

function useProPlan(maxVideoDurationMs: number | null = PRO_LIMIT_MS) {
  state.entitlements = {
    canCreateBugReports: true,
    canUploadVideo: true,
    maxVideoDurationMs,
  }
}

function submit(durationMs: unknown) {
  return assertCreateBugReportEntitlements({
    organizationId: "org",
    payload: {
      attachmentType: "video",
      metadata: { durationMs: durationMs as number | undefined },
    },
  })
}

describe("video entitlements measure playable duration", () => {
  beforeEach(() => useProPlan())

  it("accepts a playable length within the limit", async () => {
    await expect(submit(4 * 60_000)).resolves.toBeUndefined()
    await expect(submit(PRO_LIMIT_MS)).resolves.toBeUndefined()
  })

  it("rejects a playable length over the limit", async () => {
    await expect(submit(PRO_LIMIT_MS + 1)).rejects.toMatchObject({
      code: "FORBIDDEN",
    })
  })

  it("requires a duration on limited plans", async () => {
    await expect(submit(undefined)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    })
  })

  it("rejects NaN, negative and infinite durations instead of letting them pass", async () => {
    for (const bad of [
      Number.NaN,
      -5,
      Number.NEGATIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER,
    ]) {
      await expect(submit(bad)).rejects.toMatchObject({ code: "BAD_REQUEST" })
    }
  })

  it("does not require a duration when the plan is unlimited", async () => {
    useProPlan(null)
    await expect(submit(undefined)).resolves.toBeUndefined()
  })

  it("still blocks plans that cannot upload video", async () => {
    state.entitlements = {
      canCreateBugReports: true,
      canUploadVideo: false,
      maxVideoDurationMs: 0,
    }
    await expect(submit(1)).rejects.toMatchObject({ code: "FORBIDDEN" })
  })

  it("blocks organizations that cannot create bug reports at all", async () => {
    state.entitlements = {
      canCreateBugReports: false,
      canUploadVideo: true,
      maxVideoDurationMs: null,
    }
    await expect(submit(1)).rejects.toMatchObject({ code: "FORBIDDEN" })
    await expect(
      assertCreateBugReportEntitlements({
        organizationId: "org",
        payload: { attachmentType: "screenshot" },
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
  })

  it("treats a video with no metadata object as missing duration", async () => {
    await expect(
      assertCreateBugReportEntitlements({
        organizationId: "org",
        payload: { attachmentType: "video" },
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  })

  it("does not look at duration for screenshots", async () => {
    await expect(
      assertCreateBugReportEntitlements({
        organizationId: "org",
        payload: { attachmentType: "screenshot" },
      })
    ).resolves.toBeUndefined()
  })
})
