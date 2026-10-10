import { beforeEach, describe, expect, it } from "bun:test"
import { Blob as NodeBlob } from "node:buffer"
import { IDBFactory } from "fake-indexeddb"
import { formatDraftBadge, syncDraftBadge } from "../lib/draft-badge"
import { createScreenshotDraft } from "../lib/draft-session"
import {
  createDraftStore,
  DRAFT_TTL_MS,
  type Draft,
  type DraftStoreOptions,
  isDraftExpired,
  isUsableDraft,
  toPersistedDraft,
} from "../lib/draft-store"

const png = (n = 4) => new NodeBlob([new Uint8Array(n)], { type: "image/png" })
let idb: IDBFactory
let clock: number
const open = (o: DraftStoreOptions = {}) =>
  createDraftStore({ idb, now: () => clock, ...o })
const mk = (): Draft =>
  createScreenshotDraft({
    capture: png() as never,
    context: { title: "P", url: "https://e.com/" },
    debuggerSessionId: null,
    now: clock,
  })

// Writes a raw row, bypassing the store's whitelist.
async function rawPut(row: unknown): Promise<void> {
  const store = open()
  await store.list() // ensures the schema exists
  store.close()
  await new Promise<void>((resolve, reject) => {
    const req = idb.open("crikket-drafts")
    req.onsuccess = () => {
      const tx = req.result.transaction("drafts", "readwrite")
      tx.objectStore("drafts").put(row)
      tx.oncomplete = () => {
        req.result.close()
        resolve()
      }
      tx.onerror = () => reject(tx.error)
    }
  })
}

beforeEach(() => {
  idb = new IDBFactory()
  clock = 10_000_000_000
})

describe("expiry edge cases", () => {
  it("expires a Draft with a NaN, missing or non-numeric createdAt", () => {
    for (const createdAt of [
      Number.NaN,
      undefined,
      null,
      "x",
      Number.POSITIVE_INFINITY,
    ]) {
      expect(isDraftExpired({ createdAt } as never, clock)).toBe(true)
    }
  })
  it("keeps a Draft when the system clock is set backwards", () => {
    expect(isDraftExpired({ createdAt: clock + 5_000_000 }, clock)).toBe(false)
  })
  it("expires exactly at the TTL boundary", () => {
    expect(isDraftExpired({ createdAt: clock - DRAFT_TTL_MS }, clock)).toBe(
      true
    )
    expect(isDraftExpired({ createdAt: clock - DRAFT_TTL_MS + 1 }, clock)).toBe(
      false
    )
  })
})

describe("corrupt rows", () => {
  it("never surfaces rows with missing fields, wrong types or no Blob", async () => {
    await rawPut({ id: "no-capture", createdAt: clock, updatedAt: clock })
    await rawPut({
      id: "nan",
      captureType: "screenshot",
      capture: png(),
      createdAt: Number.NaN,
      updatedAt: 1,
      context: {},
    })
    await rawPut({
      id: "future-type",
      captureType: "video",
      capture: png(),
      createdAt: clock,
      updatedAt: clock,
      context: {},
    })
    const good = mk()
    const store = open()
    await store.put(good)
    expect((await store.list()).map((d) => d.id)).toEqual([good.id])
    expect(await store.get("no-capture")).toBeNull()
    store.close()
  })
  it("removes corrupt rows so the count and badge do not drift", async () => {
    await rawPut({ id: "junk" })
    const store = open()
    expect(await store.list()).toEqual([])
    expect(await store.get("junk")).toBeNull()
    store.close()
  })
  it("isUsableDraft rejects non-objects", () => {
    for (const v of [null, undefined, 1, "x", [], {}]) {
      expect(isUsableDraft(v)).toBe(false)
    }
  })
})

describe("races", () => {
  it("update never resurrects a deleted Draft", async () => {
    const store = open()
    const d = mk()
    await store.put(d)
    await store.delete(d.id)
    expect(await store.update({ ...d, updatedAt: clock + 1 })).toBe(false)
    expect(await store.get(d.id)).toBeNull()
    store.close()
  })
  it("a delete racing in-flight updates always wins", async () => {
    const store = open()
    const d = mk()
    await store.put(d)
    const writes = Array.from({ length: 20 }, (_, i) =>
      store.update({ ...d, updatedAt: clock + i })
    )
    const del = store.delete(d.id)
    const late = store.update({ ...d, updatedAt: clock + 99 })
    await Promise.all([...writes, del])
    expect(await late).toBe(false)
    expect(await store.get(d.id)).toBeNull()
    store.close()
  })
  it("two writers: last write wins and the row stays whole", async () => {
    const a = open()
    const b = open()
    const d = mk()
    await a.put(d)
    await a.update({
      ...d,
      updatedAt: clock + 1,
      form: { title: "A" } as never,
    })
    await b.update({
      ...d,
      updatedAt: clock + 2,
      form: { title: "B" } as never,
    })
    const got = await a.get(d.id)
    expect(got?.form?.title).toBe("B")
    expect(got?.capture.size).toBe(4)
    a.close()
    b.close()
  })
})

describe("open failures", () => {
  it("retries after a failed open instead of caching the rejection", async () => {
    let fail = true
    const flaky = {
      open: (...args: Parameters<IDBFactory["open"]>) => {
        if (fail) {
          fail = false
          throw new Error("open failed")
        }
        return idb.open(...args)
      },
    } as unknown as IDBFactory
    const store = open({ idb: flaky })
    await expect(store.list()).rejects.toThrow()
    expect(await store.list()).toEqual([])
    store.close()
  })
  it("a rejected put leaves earlier Drafts intact", async () => {
    const store = open()
    const d = mk()
    await store.put(d)
    const bad = { ...d, id: "x", context: { title: () => 1 } } as never
    await expect(store.put(bad)).rejects.toBeDefined()
    expect(await store.get(d.id)).not.toBeNull()
    store.close()
  })
  it("yields its connection to a newer schema upgrade", async () => {
    const store = open()
    await store.list()
    const upgraded = await new Promise<boolean>((resolve) => {
      const req = idb.open("crikket-drafts", 2)
      req.onsuccess = () => {
        req.result.close()
        resolve(true)
      }
      req.onblocked = () => resolve(false)
    })
    expect(upgraded).toBe(true)
    store.close()
  })
})

describe("whitelist and hostile input", () => {
  it("does not copy __proto__ or extra keys into persisted rows", () => {
    const hostile = JSON.parse(
      '{"__proto__":{"polluted":true},"constructor":"x","extra":1}'
    )
    const out = toPersistedDraft({
      ...mk(),
      context: hostile,
      form: hostile,
    } as never) as unknown as Record<string, unknown>
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined()
    expect(Object.keys(out.context as object).sort()).toEqual(["title", "url"])
    expect(Object.keys(out.form as object).sort()).toEqual([
      "description",
      "priority",
      "title",
      "visibility",
    ])
  })
  it("persists no debugger data, only its session id", () => {
    const out = toPersistedDraft({
      ...mk(),
      debuggerSessionId: "s",
      events: [{ headers: { authorization: "x" } }],
      debuggerData: {},
    } as never) as unknown as Record<string, unknown>
    expect(out.events).toBeUndefined()
    expect(out.debuggerData).toBeUndefined()
    expect(out.debuggerSessionId).toBe("s")
  })
})

describe("badge", () => {
  it("formats 0, negative, 99, 100 and huge counts", () => {
    expect([0, -3, 99, 100, 5000].map(formatDraftBadge)).toEqual([
      "",
      "",
      "99",
      "99+",
      "99+",
    ])
  })
  it("count matches the store after concurrent create, delete and expiry", async () => {
    const store = open()
    const ds = Array.from({ length: 30 }, (_, i) => ({
      ...mk(),
      id: `d${i}`,
      createdAt: i % 3 === 0 ? clock - DRAFT_TTL_MS - 1 : clock,
    }))
    await Promise.all(ds.map((d) => store.put(d)))
    await Promise.all(ds.slice(0, 6).map((d) => store.delete(d.id)))
    let text = ""
    const count = await syncDraftBadge(store, {
      setBadgeText: ({ text: t }) => {
        text = t
      },
      setBadgeBackgroundColor: () => undefined,
    })
    expect(String(count)).toBe(text)
    expect(count).toBe((await store.list()).length)
    store.close()
  })
})

describe("stress", () => {
  it("handles 120 Drafts with 256 KB blobs and 1500 rapid updates", async () => {
    const store = open()
    const base = mk()
    const big = png(256 * 1024) as never
    for (let i = 0; i < 120; i++) {
      await store.put({ ...base, id: `s${i}`, capture: big })
    }
    expect((await store.list()).length).toBe(120)
    const target = { ...base, id: "s0", capture: big }
    const ops: Promise<boolean>[] = []
    for (let i = 0; i < 1500; i++) {
      ops.push(store.update({ ...target, updatedAt: clock + i }))
    }
    expect((await Promise.all(ops)).every(Boolean)).toBe(true)
    expect((await store.get("s0"))?.updatedAt).toBe(clock + 1499)
    expect((await store.list()).length).toBe(120)
    store.close()
  }, 120_000)
})
