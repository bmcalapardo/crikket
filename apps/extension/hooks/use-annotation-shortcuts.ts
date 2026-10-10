import { useEffect } from "react"
import { type AnnotationTool, toolForKey } from "@/lib/annotation-shortcuts"

interface UseAnnotationShortcutsOptions {
  undo: () => void
  redo: () => void
  selectTool: (tool: AnnotationTool) => void
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  )
}

// Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl/Cmd+Y and bare tool letters. The
// extension's own commands are all Alt+Shift chords, so none of these can
// collide with them (see annotation-shortcuts.test.ts).
export function useAnnotationShortcuts({
  undo,
  redo,
  selectTool,
}: UseAnnotationShortcutsOptions) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return
      const tool = toolForKey(event)
      if (tool) {
        event.preventDefault()
        selectTool(tool)
        return
      }
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return
      const key = event.key.toLowerCase()
      if (key === "z" && !event.shiftKey) {
        event.preventDefault()
        undo()
      } else if ((key === "z" && event.shiftKey) || key === "y") {
        event.preventDefault()
        redo()
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [undo, redo, selectTool])
}
