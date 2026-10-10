import { reportNonFatalError } from "@crikket/shared/lib/errors"
import { useCallback, useEffect, useState } from "react"
import { syncDraftBadge } from "@/lib/draft-badge"
import { buildDraftRecorderUrl } from "@/lib/draft-session"
import { createDraftStore, type Draft } from "@/lib/draft-store"

export function useDrafts() {
  const [drafts, setDrafts] = useState<Draft[]>([])

  const refresh = useCallback(async () => {
    const store = createDraftStore()
    try {
      // Listing drops expired Drafts; the badge is brought in line with it.
      setDrafts(await store.list())
      await syncDraftBadge(store)
    } finally {
      store.close()
    }
  }, [])

  useEffect(() => {
    refresh().catch((error: unknown) => {
      reportNonFatalError("Failed to load screenshot drafts", error)
    })
  }, [refresh])

  const resume = useCallback(async (draft: Draft) => {
    await chrome.tabs.create({
      url: buildDraftRecorderUrl(
        (path) => chrome.runtime.getURL(path),
        draft.id,
        draft.debuggerSessionId
      ),
    })
    window.close()
  }, [])

  const remove = useCallback(
    async (draft: Draft) => {
      const store = createDraftStore()
      try {
        await store.delete(draft.id)
      } finally {
        store.close()
      }
      await refresh()
    },
    [refresh]
  )

  return { drafts, remove, resume }
}
