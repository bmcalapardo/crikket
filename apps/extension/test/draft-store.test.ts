import { beforeEach, describe, expect, it } from "bun:test"
import { Blob as NodeBlob } from "node:buffer"
import { BUG_REPORT_UPLOAD_SESSION_TTL_MS } from "@crikket/shared/constants/bug-report"
import { IDBFactory } from "fake-indexeddb"
import { addAnnotation, createAnnotationHistory } from "../lib/annotations"
import { formatDraftBadge, syncDraftBadge } from "../lib/draft-badge"
import {
  buildDraftRecorderUrl,
  createScreenshotDraft,
  editsFromDraft,
  hasDraftProgress,
  readDraftIdFromSearch,
  updateDraft,
} from "../lib/draft-session"
import {
  createDraftStore,
  DRAFT_CONTEXT_PERSISTED_FIELDS,
  DRAFT_FORM_PERSISTED_FIELDS,
  DRAFT_PERSISTED_FIELDS,
  DRAFT_TTL_MS,
  type DraftStore,
  type DraftStoreOptions,
} from "../lib/draft-store"
import { startScreenshotEdits } from "../lib/screenshot-edits"

// happy-dom's Blob is not structured-cloneable by fake-indexeddb; the node Blob
// is, which is what real IndexedDB does with a browser Blob.
const png = () =>
  new NodeBlob([new Uint8Array([1, 2, 3, 4])], { type: "image/png" })

let idb: IDBFactory
let clock: number

const open = (options: DraftStoreOptions = {}): DraftStore =>
  createDraftStore({ idb, now: () => clock, ...options })

const newDraft = () =>
  createScreenshotDraft({
    capture: png(),
    context: { title: "Page", url: "https://example.com/" },
    debuggerSessionId: "dbg-1",
    now: clock,
  })

beforeEach(() => {
  idb = new IDBFactory()
  clock = 1_000_000
})

describe("draft TTL", () => {
  it("is the upload session TTL, not a duplicate of it", () => {
    expect(DRAFT_TTL_MS).toBe(BUG_REPORT_UPLOAD_SESSION_TTL_MS)
    expect(DRAFT_TTL_MS).toBe(24 * 60 * 60 * 1000)
  })
})

describe("draft store", () => {
  it("round-trips form fields, annotations and the screenshot Blob", async () => {
    const store = open()
    const history = addAnnotation(createAnnotationHistory(), {
      id: "a1",
      kind: "pen",
      color: "#f00",
      width: 4,
      points: [
        { x: 1, y: 2 },
        { x: 3, y: 4 },
      ],
    })
    const draft = updateDraft(newDraft(), {
      edits: {
        ...startScreenshotEdits(png()),
        annotations: history,
      },
      form: {
        title: "T",
        description: "D",
        priority: "none",
        visibility: "public",
      } as never,
      now: clock + 5,
    })
    await store.put(draft)

    const loaded = await store.get(draft.id)
    expect(loaded?.annotations).toEqual(history)
    expect(loaded?.form?.title).toBe("T")
    expect(loaded?.capture.size).toBe(4)
    expect(loaded?.capture.type).toBe("image/png")
    expect(hasDraftProgress(loaded as never)).toBe(true)
    expect(editsFromDraft(loaded as never).annotations).toEqual(history)
    store.close()
  })

  it("persists only whitelisted keys and fields", async () => {
    const store = open()
    const draft = {
      ...newDraft(),
      form: {
        title: "T",
        description: "D",
        priority: "none",
        visibility: "public",
        sneaky: "x",
      },
      context: { title: "P", url: "https://e.com/", cookie: "secret" },
      upload: {
        bugReportId: "r1",
        captureUploadTarget: { url: "u" },
        token: "nope",
      },
      stray: "should not persist",
    } as never
    await store.put(draft)

    const raw = await new Promise<Record<string, unknown>[]>(
      (resolve, reject) => {
        const request = idb.open("crikket-drafts")
        request.onsuccess = () => {
          const all = request.result
            .transaction("drafts")
            .objectStore("drafts")
            .getAll()
          all.onsuccess = () => resolve(all.result)
          all.onerror = () => reject(all.error)
        }
      }
    )
    expect(raw).toHaveLength(1)
    const row = raw[0] as Record<string, Record<string, unknown>>
    expect(Object.keys(row).sort()).toEqual([...DRAFT_PERSISTED_FIELDS].sort())
    expect(Object.keys(row.form as object).sort()).toEqual(
      [...DRAFT_FORM_PERSISTED_FIELDS].sort()
    )
    expect(Object.keys(row.context as object).sort()).toEqual(
      [...DRAFT_CONTEXT_PERSISTED_FIELDS].sort()
    )
    expect(Object.keys(row.upload as object).sort()).toEqual([
      "bugReportId",
      "captureUploadTarget",
    ])
    store.close()
  })

  it("removes expired drafts silently on get and list", async () => {
    const store = open()
    const draft = newDraft()
    await store.put(draft)
    const fresh = { ...newDraft(), createdAt: clock + DRAFT_TTL_MS - 1 }
    await store.put(fresh)

    clock += DRAFT_TTL_MS
    expect(await store.get(draft.id)).toBeNull()
    expect((await store.list()).map((d) => d.id)).toEqual([fresh.id])

    clock += DRAFT_TTL_MS
    expect(await store.purgeExpired()).toBe(1)
    expect(await store.list()).toEqual([])
    store.close()
  })

  it("deletes a draft", async () => {
    const store = open()
    const draft = newDraft()
    await store.put(draft)
    await store.delete(draft.id)
    expect(await store.get(draft.id)).toBeNull()
    store.close()
  })

  it("keeps the upload state for retries", async () => {
    const store = open()
    const draft = updateDraft(newDraft(), {
      edits: startScreenshotEdits(png()),
      form: null,
      now: clock,
      upload: { bugReportId: "r1", captureUploadTarget: { key: "k" } },
    })
    await store.put(draft)
    expect((await store.get(draft.id))?.upload?.bugReportId).toBe("r1")
    store.close()
  })
})

describe("draft badge", () => {
  it("tracks create, delete and expiry", async () => {
    const store = open()
    const texts: string[] = []
    const action = {
      setBadgeText: ({ text }: { text: string }) => {
        texts.push(text)
      },
      setBadgeBackgroundColor: () => undefined,
    }
    const a = newDraft()
    await store.put(a)
    await syncDraftBadge(store, action)
    await store.put(newDraft())
    await syncDraftBadge(store, action)
    await store.delete(a.id)
    await syncDraftBadge(store, action)
    clock += DRAFT_TTL_MS
    await syncDraftBadge(store, action)
    expect(texts).toEqual(["1", "2", "1", ""])
    expect(formatDraftBadge(150)).toBe("99+")
    store.close()
  })
})

describe("draft urls", () => {
  it("round-trips the draft id and carries the debugger session", () => {
    const url = buildDraftRecorderUrl(
      (path) => `chrome-extension://abc${path}`,
      "id 1",
      "dbg"
    )
    const search = new URL(url).search
    expect(readDraftIdFromSearch(search)).toBe("id 1")
    expect(new URLSearchParams(search).get("debuggerSessionId")).toBe("dbg")
    expect(new URLSearchParams(search).get("captureType")).toBe("screenshot")
  })
})
