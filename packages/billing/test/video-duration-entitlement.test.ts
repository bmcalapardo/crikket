import { describe, expect, it } from "bun:test"
import { billingPlanEntitlementsConfig } from "../src/model"
import {
  evaluateVideoDuration,
  MAX_REPORTED_VIDEO_DURATION_MS,
} from "../src/service/entitlements/video-duration"

const PRO_LIMIT_MS = billingPlanEntitlementsConfig.pro
  .maxVideoDurationMs as number

describe("video duration entitlement", () => {
  it("measures playable length: a 4 minute video with a 5 minute pause fits a 10 minute plan", () => {
    // Wall clock was 9 minutes, but the client reports the playable 4.
    expect(
      evaluateVideoDuration({
        durationMs: 4 * 60_000,
        maxVideoDurationMs: PRO_LIMIT_MS,
      })
    ).toEqual({ ok: true })
  })

  it("rejects a playable length over the plan limit", () => {
    expect(
      evaluateVideoDuration({
        durationMs: PRO_LIMIT_MS + 1,
        maxVideoDurationMs: PRO_LIMIT_MS,
      })
    ).toEqual({ ok: false, reason: "exceeds_limit" })
  })

  it("allows exactly the limit", () => {
    expect(
      evaluateVideoDuration({
        durationMs: PRO_LIMIT_MS,
        maxVideoDurationMs: PRO_LIMIT_MS,
      })
    ).toEqual({ ok: true })
  })

  it("requires a duration when the plan has a limit", () => {
    for (const durationMs of [undefined, null]) {
      expect(
        evaluateVideoDuration({ durationMs, maxVideoDurationMs: PRO_LIMIT_MS })
      ).toEqual({ ok: false, reason: "missing" })
    }
  })

  it("does not let NaN, Infinity, negatives, huge or non-numeric values through", () => {
    const bad: unknown[] = [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      -1,
      -PRO_LIMIT_MS,
      Number.MAX_SAFE_INTEGER,
      MAX_REPORTED_VIDEO_DURATION_MS + 1,
      "1000",
      {},
      [],
    ]
    for (const durationMs of bad) {
      const verdict = evaluateVideoDuration({
        durationMs,
        maxVideoDurationMs: PRO_LIMIT_MS,
      })
      expect(verdict.ok).toBe(false)
    }
  })

  it("does not require a duration on a plan without a limit", () => {
    expect(
      evaluateVideoDuration({
        durationMs: undefined,
        maxVideoDurationMs: null,
      })
    ).toEqual({ ok: true })
  })

  it("rejects a 1000 value sweep around the limit consistently", () => {
    for (let i = -500; i < 500; i++) {
      const durationMs = PRO_LIMIT_MS + i
      const verdict = evaluateVideoDuration({
        durationMs,
        maxVideoDurationMs: PRO_LIMIT_MS,
      })
      expect(verdict.ok).toBe(durationMs <= PRO_LIMIT_MS)
    }
  })
})
