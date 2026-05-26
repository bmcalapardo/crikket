import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test"
import { ensureBillingTestEnv } from "./utils/env"
import { BILLING_SRC } from "./utils/paths"

ensureBillingTestEnv()

let extractProviderEventId: typeof import("../src/service/polar-payload").extractProviderEventId

beforeAll(async () => {
  mock.restore()
  ;({ extractProviderEventId } = await import(
    `${BILLING_SRC}/service/polar-payload.ts`
  ))
})

afterAll(() => {
  mock.restore()
})

describe("extractProviderEventId flow", () => {
  it("uses provider event id when present", () => {
    const providerEventId = extractProviderEventId(
      {
        id: "evt_123",
        type: "subscription.updated",
      },
      "subscription.updated"
    )

    expect(providerEventId).toBe("polar:event:evt_123")
  })

  it("builds deterministic fallback ids when provider event id is missing", () => {
    const payload = {
      type: "subscription.updated",
      data: {
        subscriptionId: "sub_123",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    }

    const first = extractProviderEventId(payload, "subscription.updated")
    const second = extractProviderEventId(payload, "subscription.updated")

    expect(first).toBe(second)
    expect(
      first.startsWith("polar:fallback:subscription.updated:sub_123:")
    ).toBe(true)
  })

  it("keeps fallback id stable when payload keys are reordered", () => {
    const payloadA = {
      type: "subscription.updated",
      data: {
        subscriptionId: "sub_123",
        createdAt: "2026-01-01T00:00:00.000Z",
        metadata: {
          referenceId: "org_1",
          source: "polar",
        },
      },
    }
    const payloadB = {
      data: {
        metadata: {
          source: "polar",
          referenceId: "org_1",
        },
        createdAt: "2026-01-01T00:00:00.000Z",
        subscriptionId: "sub_123",
      },
      type: "subscription.updated",
    }

    const first = extractProviderEventId(payloadA, "subscription.updated")
    const second = extractProviderEventId(payloadB, "subscription.updated")

    expect(first).toBe(second)
  })
})
