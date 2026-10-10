// The annotation editor's keyboard shortcuts as data, so a test can check
// them against the extension commands in wxt.config.ts. Every extension
// command is an Alt+Shift chord; editor shortcuts must never use Alt, and
// tool keys are bare letters that are ignored while typing in a field.
export type AnnotationTool =
  | "pen"
  | "eraser"
  | "line"
  | "arrow"
  | "rectangle"
  | "ellipse"
  | "text"

export const TOOL_KEYS: Record<AnnotationTool, string> = {
  pen: "p",
  eraser: "e",
  line: "l",
  arrow: "a",
  rectangle: "r",
  ellipse: "o",
  text: "t",
}

export const HISTORY_CHORDS = ["Ctrl+Z", "Ctrl+Shift+Z", "Ctrl+Y"] as const

/** Every chord the editor listens for, in "Ctrl+Shift+Z" notation. */
export function editorChords(): string[] {
  return [
    ...HISTORY_CHORDS,
    ...Object.values(TOOL_KEYS).map((key) => key.toUpperCase()),
  ]
}

/** The tool a plain key press selects, or null. Modified presses (including
 * Alt, which the extension commands use) never match. */
export function toolForKey(event: {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
}): AnnotationTool | null {
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
    return null
  }
  const key = event.key.toLowerCase()
  for (const [tool, toolKey] of Object.entries(TOOL_KEYS)) {
    if (toolKey === key) return tool as AnnotationTool
  }
  return null
}
