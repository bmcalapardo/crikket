import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { createRoot, type Root } from "react-dom/client"
import { registerDomEnvironment } from "../happydom"
import { useObjectUrl } from "../hooks/use-object-url"

let root: Root | undefined
let container: HTMLDivElement | undefined
const created = new Set<string>()
const revoked = new Set<string>()
const original = { c: URL.createObjectURL, r: URL.revokeObjectURL }

beforeEach(async () => {
  await registerDomEnvironment()
  created.clear()
  revoked.clear()
  let n = 0
  URL.createObjectURL = () => {
    const u = `blob:test/${n++}`
    created.add(u)
    return u
  }
  URL.revokeObjectURL = (u: string) => {
    revoked.add(u)
  }
})

afterEach(() => {
  root?.unmount()
  container?.remove()
  URL.createObjectURL = original.c
  URL.revokeObjectURL = original.r
})

function Probe({ blob }: { blob: Blob | null }) {
  useObjectUrl(blob)
  return null
}

describe("useObjectUrl", () => {
  it("balances create/revoke over 20 blob swaps plus unmount", async () => {
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    for (let i = 0; i < 20; i++) {
      root.render(<Probe blob={i % 5 === 4 ? null : new Blob([`${i}`])} />)
      await new Promise((r) => setTimeout(r, 0))
    }
    root.unmount()
    root = undefined
    expect(created.size).toBeGreaterThan(10)
    expect([...created].filter((u) => !revoked.has(u))).toEqual([])
  })
})
