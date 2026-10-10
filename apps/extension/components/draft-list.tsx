import { reportNonFatalError } from "@crikket/shared/lib/errors"
import { Button } from "@crikket/ui/components/ui/button"
import { useDrafts } from "@/hooks/use-drafts"
import type { Draft } from "@/lib/draft-store"

function draftLabel(draft: Draft): string {
  return (
    draft.form?.title.trim() ||
    draft.context.title?.trim() ||
    "Screenshot draft"
  )
}

export function DraftList() {
  const { drafts, remove, resume } = useDrafts()

  if (drafts.length === 0) {
    return null
  }

  const report = (message: string) => (error: unknown) =>
    reportNonFatalError(message, error)

  return (
    <div className="space-y-2 rounded-md border p-3">
      <p className="font-medium text-sm">Pending drafts</p>
      <ul className="space-y-2">
        {drafts.map((draft) => (
          <li className="flex items-center gap-2" key={draft.id}>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{draftLabel(draft)}</p>
              <p className="text-muted-foreground text-xs">
                {new Date(draft.updatedAt).toLocaleString()}
              </p>
            </div>
            <Button
              onClick={() =>
                resume(draft).catch(report("Failed to resume the draft"))
              }
              size="sm"
              variant="outline"
            >
              Resume
            </Button>
            <Button
              onClick={() =>
                remove(draft).catch(report("Failed to delete the draft"))
              }
              size="sm"
              variant="ghost"
            >
              Delete
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}
