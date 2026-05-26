import { mock } from "bun:test"
import { BILLING_SRC } from "./paths"

type PolarPayloadModule = typeof import("../../src/service/polar-payload")

export async function mockPolarPayloadModule(
  overrides: Partial<PolarPayloadModule> = {}
): Promise<void> {
  const original = await import(`${BILLING_SRC}/service/polar-payload.ts`)

  mock.module(`${BILLING_SRC}/service/polar-payload.ts`, () => ({
    ...original,
    ...overrides,
  }))
}
