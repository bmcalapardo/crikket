import type { DraftStore } from "@/lib/draft-store"

export const DRAFT_BADGE_COLOR = "#d97706"
export const DRAFT_EXPIRY_ALARM = "crikket-draft-expiry"
export const DRAFT_EXPIRY_CHECK_MINUTES = 30

export function formatDraftBadge(count: number): string {
  if (count <= 0) {
    return ""
  }
  return count > 99 ? "99+" : String(count)
}

interface BadgeApi {
  setBadgeBackgroundColor: (details: { color: string }) => unknown
  setBadgeText: (details: { text: string }) => unknown
}

/**
 * Drops expired Drafts, then shows the number still pending on the extension
 * icon. Call after any create, delete or expiry so the badge never drifts.
 */
export async function syncDraftBadge(
  store: Pick<DraftStore, "list">,
  action: BadgeApi = chrome.action
): Promise<number> {
  const count = (await store.list()).length
  await action.setBadgeText({ text: formatDraftBadge(count) })
  if (count > 0) {
    await action.setBadgeBackgroundColor({ color: DRAFT_BADGE_COLOR })
  }
  return count
}
