import { useEffect } from "react"

interface UseAnnotationShortcutsOptions {
  undo: () => void
  redo: () => void
}

// Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z and Ctrl/Cmd+Y. The extension's own commands
// are all Alt+Shift chords, so these cannot collide with them.
export function useAnnotationShortcuts({
  undo,
  redo,
}: UseAnnotationShortcutsOptions) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
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
  }, [undo, redo])
}
