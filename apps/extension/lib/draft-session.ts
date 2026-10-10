import { appendDebuggerSessionIdToUrl } from "@crikket/capture-core/debugger/recorder-session"
import type { CaptureContext } from "@/lib/capture-context"
import {
  type Draft,
  type DraftFormFields,
  type DraftUploadState,
  newDraftId,
} from "@/lib/draft-store"
import type { ScreenshotEdits } from "@/lib/screenshot-edits"

export const DRAFT_ID_PARAM = "draftId"

export function readDraftIdFromSearch(search: string): string | null {
  const id = new URLSearchParams(search).get(DRAFT_ID_PARAM)?.trim()
  return id || null
}

/** The recorder page that resumes a screenshot Draft. */
export function buildDraftRecorderUrl(
  getUrl: (path: string) => string,
  draftId: string,
  debuggerSessionId: string | null
): string {
  const url = getUrl(
    `/recorder.html?captureType=screenshot&${DRAFT_ID_PARAM}=${encodeURIComponent(draftId)}`
  )
  return debuggerSessionId
    ? appendDebuggerSessionIdToUrl(url, debuggerSessionId)
    : url
}

export function createScreenshotDraft(input: {
  capture: Blob
  context: CaptureContext
  debuggerSessionId: string | null
  now: number
}): Draft {
  return {
    id: newDraftId(),
    captureType: "screenshot",
    createdAt: input.now,
    updatedAt: input.now,
    capture: input.capture,
    edited: null,
    cropRect: null,
    annotations: null,
    annotated: null,
    form: null,
    context: input.context,
    debuggerSessionId: input.debuggerSessionId,
    upload: null,
  }
}

/** The Draft with the tester's latest edits and form fields folded in. */
export function updateDraft(
  draft: Draft,
  changes: {
    edits: ScreenshotEdits
    form: DraftFormFields | null
    now: number
    upload?: DraftUploadState | null
  }
): Draft {
  return {
    ...draft,
    capture: changes.edits.capture,
    edited: changes.edits.edited,
    cropRect: changes.edits.cropRect,
    annotations: changes.edits.annotations,
    annotated: changes.edits.annotated,
    form: changes.form,
    upload: changes.upload === undefined ? draft.upload : changes.upload,
    updatedAt: changes.now,
  }
}

export function editsFromDraft(draft: Draft): ScreenshotEdits {
  return {
    capture: draft.capture,
    edited: draft.edited,
    cropRect: draft.cropRect,
    annotations: draft.annotations,
    annotated: draft.annotated,
    removedByCrop: 0,
  }
}

/** Whether the tester already got past the first crop of this Draft. */
export function hasDraftProgress(draft: Draft): boolean {
  return Boolean(
    draft.form || draft.edited || draft.annotations || draft.annotated
  )
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl)
  return await response.blob()
}
