import { Button } from "@crikket/ui/components/ui/button"
import {
  ArrowUpRight,
  Circle,
  Eraser,
  Minus,
  Pencil,
  Redo2,
  Square,
  Type,
  Undo2,
} from "lucide-react"
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react"
import {
  type AnnotationTool,
  useAnnotationEditor,
} from "@/hooks/use-annotation-editor"
import { TOOL_KEYS } from "@/lib/annotation-shortcuts"
import { type AnnotationHistory, MAX_TEXT_LENGTH } from "@/lib/annotations"

interface AnnotateStepProps {
  // The image to draw on: the crop if there is one, else the Capture.
  imageBlob: Blob
  // Model from an earlier visit, so annotations can be reopened and undone.
  initialHistory: AnnotationHistory | null
  hasAppliedCrop: boolean
  // Annotations the latest crop change dropped for falling outside the crop.
  removedCount: number
  // `blob` is null when nothing is drawn; the image underneath is then
  // submitted as-is.
  onDone: (history: AnnotationHistory, blob: Blob | null) => void
  // Abandons the whole edit session (crop included), back to what the tester
  // had when they entered editing.
  onCancel: () => void
  // Discards the crop and every annotation, back to the original Capture.
  onResetToOriginal: () => void
}

const TOOLS: Record<
  AnnotationTool,
  { label: string; hint: string; cursor: string; icon: ReactNode }
> = {
  pen: {
    label: "Pen",
    hint: "Draw on the screenshot to point out the problem. Click an annotation to delete it.",
    cursor: "cursor-crosshair",
    icon: <Pencil />,
  },
  eraser: {
    label: "Eraser",
    hint: "Click an annotation to delete it. Undo brings it back.",
    cursor: "cursor-pointer",
    icon: <Eraser />,
  },
  line: {
    label: "Line",
    hint: "Drag to draw a straight line. Click an annotation to delete it.",
    cursor: "cursor-crosshair",
    icon: <Minus />,
  },
  arrow: {
    label: "Arrow",
    hint: "Drag from the tail to where the arrow should point. Click an annotation to delete it.",
    cursor: "cursor-crosshair",
    icon: <ArrowUpRight />,
  },
  rectangle: {
    label: "Rectangle",
    hint: "Drag to draw a rectangle. Click an annotation to delete it.",
    cursor: "cursor-crosshair",
    icon: <Square />,
  },
  ellipse: {
    label: "Ellipse",
    hint: "Drag to draw an ellipse. Click an annotation to delete it.",
    cursor: "cursor-crosshair",
    icon: <Circle />,
  },
  text: {
    label: "Text",
    hint: "Click where the text should go, type, then press Enter. Click a text annotation to delete it.",
    cursor: "cursor-text",
    icon: <Type />,
  },
}

interface TextEntryProps {
  // Position as percentages of the image, so it tracks the displayed size.
  left: number
  top: number
  onCommit: (text: string) => void
  onCancel: () => void
}

export function TextEntry({ left, top, onCommit, onCancel }: TextEntryProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  // Enter, Escape and blur can all fire for one entry (unmounting the focused
  // input blurs it), so only the first one counts.
  const settledRef = useRef(false)
  const settle = (action: () => void) => {
    if (settledRef.current) return
    settledRef.current = true
    action()
  }
  useEffect(() => {
    inputRef.current?.focus()
  }, [])
  return (
    <input
      aria-label="Annotation text"
      className="absolute min-w-40 rounded border bg-background px-2 py-1 text-sm"
      maxLength={MAX_TEXT_LENGTH}
      onBlur={(event) => {
        const { value } = event.currentTarget
        settle(() => onCommit(value))
      }}
      onKeyDown={(event) => {
        // Enter or Escape during IME composition belong to the IME.
        if (event.nativeEvent.isComposing || event.key === "Process") return
        if (event.key === "Enter") {
          event.preventDefault()
          const { value } = event.currentTarget
          settle(() => onCommit(value))
        } else if (event.key === "Escape") {
          event.preventDefault()
          event.stopPropagation()
          settle(onCancel)
        }
      }}
      ref={inputRef}
      style={{ left: `${left}%`, top: `${top}%` }}
      type="text"
    />
  )
}

interface IconButtonProps {
  label: string
  title?: string
  pressed?: boolean
  shortcut?: string
  disabled: boolean
  onClick: () => void
  children: ReactNode
}

function IconButton({
  label,
  title,
  pressed,
  shortcut,
  disabled,
  onClick,
  children,
}: IconButtonProps) {
  return (
    <Button
      aria-keyshortcuts={shortcut}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      size="icon"
      title={title ?? label}
      type="button"
      variant={pressed ? "default" : "outline"}
    >
      {children}
    </Button>
  )
}

export function AnnotateStep({
  imageBlob,
  initialHistory,
  hasAppliedCrop,
  removedCount,
  onDone,
  onCancel,
  onResetToOriginal,
}: AnnotateStepProps) {
  const editor = useAnnotationEditor(imageBlob, initialHistory)
  const [isFinishing, setIsFinishing] = useState(false)
  const [renderFailed, setRenderFailed] = useState(false)
  const activeTool = TOOLS[editor.tool]

  const handleDone = useCallback(async () => {
    setIsFinishing(true)
    setRenderFailed(false)
    try {
      const { history, blob } = await editor.renderAnnotated()
      // Without a rendered image, finishing would quietly submit the
      // screenshot without the annotations the tester just drew.
      if (history.annotations.length > 0 && !blob) {
        setRenderFailed(true)
        return
      }
      onDone(history, blob)
    } finally {
      setIsFinishing(false)
    }
  }, [editor, onDone])

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">{activeTool.hint}</p>

      {removedCount > 0 ? (
        <output className="block rounded-md bg-amber-500/15 p-3 text-amber-900 text-sm dark:text-amber-200">
          {removedCount === 1
            ? "1 annotation fell outside the new crop and was removed."
            : `${removedCount} annotations fell outside the new crop and were removed.`}
        </output>
      ) : null}

      {renderFailed ? (
        <p className="text-destructive text-sm" role="alert">
          The annotated screenshot couldn't be saved. Try Done again, or Cancel
          to go back without annotations.
        </p>
      ) : null}

      <div
        aria-label="Annotation tools"
        className="flex flex-wrap gap-2"
        role="toolbar"
      >
        {(Object.keys(TOOLS) as AnnotationTool[]).map((tool) => (
          <IconButton
            disabled={isFinishing}
            key={tool}
            label={TOOLS[tool].label}
            onClick={() => editor.setTool(tool)}
            pressed={editor.tool === tool}
            shortcut={TOOL_KEYS[tool].toUpperCase()}
            title={`${TOOLS[tool].label} (${TOOL_KEYS[tool].toUpperCase()})`}
          >
            {TOOLS[tool].icon}
          </IconButton>
        ))}
        <IconButton
          disabled={!editor.canUndo || isFinishing}
          label="Undo"
          onClick={editor.undo}
          title="Undo (Ctrl+Z)"
        >
          <Undo2 />
        </IconButton>
        <IconButton
          disabled={!editor.canRedo || isFinishing}
          label="Redo"
          onClick={editor.redo}
          title="Redo (Ctrl+Shift+Z)"
        >
          <Redo2 />
        </IconButton>
      </div>

      <div className="relative touch-none select-none overflow-hidden rounded-xl border bg-black shadow-sm">
        {editor.imageUrl ? (
          // biome-ignore lint/a11y/noNoninteractiveElementInteractions: onLoad is an image lifecycle event, not user interaction
          <img
            alt="Screenshot to annotate"
            className="block h-auto w-full"
            draggable={false}
            onLoad={editor.handleImageLoad}
            ref={editor.imgRef}
            src={editor.imageUrl}
          />
        ) : null}
        <canvas
          className="pointer-events-none absolute inset-0 h-full w-full"
          ref={editor.committedCanvasRef}
        />
        <canvas
          aria-label="Annotation surface"
          className={`absolute inset-0 h-full w-full ${activeTool.cursor}`}
          onPointerCancel={editor.handlePointerCancel}
          onPointerDown={editor.handlePointerDown}
          onPointerMove={editor.handlePointerMove}
          onPointerUp={editor.handlePointerUp}
          ref={editor.liveStrokeCanvasRef}
          role="img"
        />
        {editor.pendingText && editor.naturalSize ? (
          <TextEntry
            left={(editor.pendingText.x / editor.naturalSize.width) * 100}
            onCancel={editor.cancelText}
            onCommit={editor.commitText}
            top={(editor.pendingText.y / editor.naturalSize.height) * 100}
          />
        ) : null}
      </div>

      <div className="flex flex-wrap gap-3">
        <Button
          className="flex-1"
          disabled={
            isFinishing ||
            !(hasAppliedCrop || editor.history.annotations.length > 0)
          }
          onClick={onResetToOriginal}
          type="button"
          variant="outline"
        >
          Reset to Original
        </Button>
        <Button
          className="flex-1"
          disabled={isFinishing}
          onClick={onCancel}
          type="button"
          variant="outline"
        >
          Cancel
        </Button>
        <Button
          className="flex-1"
          disabled={isFinishing || !editor.naturalSize}
          onClick={handleDone}
          type="button"
        >
          {isFinishing ? "Saving..." : "Done"}
        </Button>
      </div>
    </div>
  )
}
