import {
  BUG_REPORT_UPLOAD_SESSION_TTL_MS,
  type BugReportVisibility,
} from "@crikket/shared/constants/bug-report"
import type { Priority } from "@crikket/shared/constants/priorities"
import type { AnnotationHistory } from "@/lib/annotations"
import type { CaptureContext } from "@/lib/capture-context"
import type { Rect } from "@/lib/screenshot-crop"

// A Draft is a Capture the tester has not submitted yet, kept in IndexedDB so
// closing the recorder does not lose it. IndexedDB stores Blobs natively, so
// the screenshot is never base64-encoded and needs no unlimitedStorage.
//
// Both IndexedDB and chrome.storage.local are plaintext on disk, and a Draft
// necessarily holds a screenshot of the page. The persisted shape is therefore
// an explicit whitelist (DRAFT_PERSISTED_FIELDS); nothing else is written.

export const DRAFT_TTL_MS = BUG_REPORT_UPLOAD_SESSION_TTL_MS

const DB_NAME = "crikket-drafts"
const DB_VERSION = 1
const STORE_NAME = "drafts"

export interface DraftFormFields {
  description: string
  priority: Priority
  title: string
  visibility: BugReportVisibility
}

// Set once a submit has created the report and is retrying its uploads.
export interface DraftUploadState {
  bugReportId: string
  captureUploadTarget: Record<string, unknown>
}

export interface Draft {
  annotated: Blob | null
  // The annotation model, in native pixels of the crop (or of the Capture).
  annotations: AnnotationHistory | null
  capture: Blob
  captureType: "screenshot"
  context: CaptureContext
  createdAt: number
  cropRect: Rect | null
  debuggerSessionId: string | null
  edited: Blob | null
  form: DraftFormFields | null
  id: string
  updatedAt: number
  upload: DraftUploadState | null
}

export const DRAFT_PERSISTED_FIELDS = [
  "annotated",
  "annotations",
  "capture",
  "captureType",
  "context",
  "createdAt",
  "cropRect",
  "debuggerSessionId",
  "edited",
  "form",
  "id",
  "updatedAt",
  "upload",
] as const satisfies readonly (keyof Draft)[]

export const DRAFT_FORM_PERSISTED_FIELDS = [
  "description",
  "priority",
  "title",
  "visibility",
] as const satisfies readonly (keyof DraftFormFields)[]

export const DRAFT_CONTEXT_PERSISTED_FIELDS = ["title", "url"] as const

function pick<T extends object, K extends keyof T>(
  value: T,
  keys: readonly K[]
): Pick<T, K> {
  const out = {} as Pick<T, K>
  for (const key of keys) {
    out[key] = value[key]
  }
  return out
}

/** Projects a Draft onto exactly the whitelisted persisted fields. */
export function toPersistedDraft(draft: Draft): Draft {
  return {
    ...pick(draft, DRAFT_PERSISTED_FIELDS),
    context: pick(draft.context, DRAFT_CONTEXT_PERSISTED_FIELDS),
    form: draft.form ? pick(draft.form, DRAFT_FORM_PERSISTED_FIELDS) : null,
    upload: draft.upload
      ? {
          bugReportId: draft.upload.bugReportId,
          captureUploadTarget: draft.upload.captureUploadTarget,
        }
      : null,
  }
}

export function isDraftExpired(
  draft: Pick<Draft, "createdAt">,
  now: number,
  ttlMs: number = DRAFT_TTL_MS
): boolean {
  // A missing or non-numeric timestamp would make `now - createdAt` NaN, which
  // compares false to everything, so the Draft would never expire. Treat it as
  // expired. A clock set backwards gives a negative age and keeps the Draft.
  if (
    typeof draft.createdAt !== "number" ||
    !Number.isFinite(draft.createdAt)
  ) {
    return true
  }
  return now - draft.createdAt >= ttlMs
}

function isBlob(value: unknown): value is Blob {
  return (
    typeof Blob !== "undefined" &&
    (value instanceof Blob ||
      Object.prototype.toString.call(value) === "[object Blob]")
  )
}

/**
 * Whether a stored row is usable as a Draft. Rows come from disk, so they may
 * be corrupt or written by another build; the UI must never see them.
 */
export function isUsableDraft(row: unknown): row is Draft {
  if (typeof row !== "object" || row === null) {
    return false
  }
  const d = row as Record<string, unknown>
  return (
    typeof d.id === "string" &&
    d.id.length > 0 &&
    d.captureType === "screenshot" &&
    isBlob(d.capture) &&
    typeof d.createdAt === "number" &&
    Number.isFinite(d.createdAt) &&
    typeof d.updatedAt === "number" &&
    Number.isFinite(d.updatedAt) &&
    typeof d.context === "object" &&
    d.context !== null
  )
}

export function newDraftId(): string {
  return crypto.randomUUID()
}

export interface DraftStoreOptions {
  idb?: IDBFactory
  now?: () => number
  ttlMs?: number
}

export interface DraftStore {
  close: () => void
  delete: (id: string) => Promise<void>
  /** The Draft, or null if it is missing or expired (expired is removed). */
  get: (id: string) => Promise<Draft | null>
  /** Live Drafts, most recently updated first. Expired ones are removed. */
  list: () => Promise<Draft[]>
  put: (draft: Draft) => Promise<void>
  /**
   * Saves an edit to a Draft that is still stored; resolves to false (and
   * writes nothing) if it was deleted meanwhile, so a late autosave cannot
   * resurrect a Draft that was submitted, cancelled or deleted elsewhere.
   */
  update: (draft: Draft) => Promise<boolean>
  /** Removes expired Drafts; resolves to how many were removed. */
  purgeExpired: () => Promise<number>
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

function openDatabase(idb: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = idb.open(DB_NAME, DB_VERSION)
    request.onblocked = () =>
      reject(new Error("The draft database is blocked by another context"))
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: "id" })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export function createDraftStore(options: DraftStoreOptions = {}): DraftStore {
  const idb = options.idb ?? indexedDB
  const now = options.now ?? Date.now
  const ttlMs = options.ttlMs ?? DRAFT_TTL_MS
  let dbPromise: Promise<IDBDatabase> | null = null

  const db = () => {
    if (!dbPromise) {
      const opened = openDatabase(idb).then((conn) => {
        // Let another context upgrade the schema instead of blocking it.
        conn.onversionchange = () => {
          conn.close()
          if (dbPromise === opened) {
            dbPromise = null
          }
        }
        return conn
      })
      dbPromise = opened
      // A failed open must not be cached forever; the next call retries.
      opened.catch(() => {
        if (dbPromise === opened) {
          dbPromise = null
        }
      })
    }
    return dbPromise
  }

  const readAll = async (): Promise<Draft[]> => {
    const conn = await db()
    const tx = conn.transaction(STORE_NAME, "readonly")
    const rows: unknown[] = await requestToPromise(
      tx.objectStore(STORE_NAME).getAll()
    )
    const usable = rows.filter(isUsableDraft)
    // Corrupt rows can never be shown or resumed; drop them.
    const corrupt = rows
      .filter((row) => !isUsableDraft(row))
      .map((row) => (row as { id?: unknown } | null)?.id)
      .filter((id): id is string => typeof id === "string")
    if (corrupt.length > 0) {
      await remove(corrupt).catch(() => undefined)
    }
    return usable
  }

  const remove = async (ids: string[]): Promise<void> => {
    if (ids.length === 0) {
      return
    }
    const conn = await db()
    const tx = conn.transaction(STORE_NAME, "readwrite")
    for (const id of ids) {
      tx.objectStore(STORE_NAME).delete(id)
    }
    await transactionDone(tx)
  }

  const purgeExpired = async (): Promise<number> => {
    const at = now()
    const expired = (await readAll()).filter((d) =>
      isDraftExpired(d, at, ttlMs)
    )
    await remove(expired.map((d) => d.id))
    return expired.length
  }

  return {
    async put(draft) {
      const conn = await db()
      const tx = conn.transaction(STORE_NAME, "readwrite")
      tx.objectStore(STORE_NAME).put(toPersistedDraft(draft))
      await transactionDone(tx)
    },
    async update(draft) {
      const conn = await db()
      const tx = conn.transaction(STORE_NAME, "readwrite")
      const store = tx.objectStore(STORE_NAME)
      const existing = await requestToPromise(store.getKey(draft.id))
      if (existing === undefined) {
        return false
      }
      store.put(toPersistedDraft(draft))
      await transactionDone(tx)
      return true
    },
    async get(id) {
      const conn = await db()
      const tx = conn.transaction(STORE_NAME, "readonly")
      const draft = (await requestToPromise(
        tx.objectStore(STORE_NAME).get(id)
      )) as Draft | undefined
      if (!draft) {
        return null
      }
      if (!isUsableDraft(draft)) {
        await remove([id]).catch(() => undefined)
        return null
      }
      if (isDraftExpired(draft, now(), ttlMs)) {
        await remove([id])
        return null
      }
      return draft
    },
    async list() {
      await purgeExpired()
      const drafts = await readAll()
      return drafts.sort((a, b) => b.updatedAt - a.updatedAt)
    },
    delete: (id) => remove([id]),
    purgeExpired,
    close() {
      dbPromise?.then((conn) => conn.close()).catch(() => undefined)
      dbPromise = null
    },
  }
}
