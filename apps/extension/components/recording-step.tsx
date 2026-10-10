import { Button } from "@crikket/ui/components/ui/button"
import { ShortcutKbd } from "@/components/shortcut-kbd"
import { formatDuration } from "../lib/utils"

interface RecordingStepProps {
  duration: number
  isPaused: boolean
  onStopRecording: () => void
  onTogglePause: () => void
  stopRecordingShortcut: string | null
  togglePauseShortcut: string | null
}

export function RecordingStep({
  duration,
  isPaused,
  onStopRecording,
  onTogglePause,
  stopRecordingShortcut,
  togglePauseShortcut,
}: RecordingStepProps) {
  return (
    <div className="flex flex-col items-center justify-center space-y-6 py-12">
      <div
        className={
          isPaused
            ? "w-full max-w-sm rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-center"
            : "w-full max-w-sm rounded-md border border-destructive/20 bg-destructive/5 p-4 text-center"
        }
        data-paused={isPaused}
      >
        <p
          aria-live="polite"
          className={
            isPaused
              ? "font-medium text-amber-700 text-sm"
              : "font-medium text-destructive text-sm"
          }
        >
          {isPaused ? "Recording paused" : "Recording now"}
        </p>
        <p
          className={
            isPaused
              ? "font-mono font-semibold text-5xl text-amber-700"
              : "font-mono font-semibold text-5xl text-destructive"
          }
        >
          {formatDuration(duration)}
        </p>
        {isPaused ? (
          <p className="mt-1 text-amber-700 text-xs">
            Paused time is not recorded or counted toward your plan.
          </p>
        ) : null}
      </div>

      <Button
        className="flex min-w-[200px] items-center gap-3 font-semibold text-lg"
        onClick={onTogglePause}
        size="lg"
        variant="outline"
      >
        <span>{isPaused ? "▶ Resume Recording" : "⏸ Pause Recording"}</span>
        <ShortcutKbd shortcut={togglePauseShortcut} />
      </Button>

      <Button
        className="flex min-w-[200px] items-center gap-3 font-semibold text-lg"
        onClick={onStopRecording}
        size="lg"
        variant="destructive"
      >
        <span>⏹ Stop Recording</span>
        <ShortcutKbd
          className="bg-destructive-foreground/15 text-destructive-foreground"
          shortcut={stopRecordingShortcut}
        />
      </Button>

      <p className="max-w-md text-center text-muted-foreground text-sm">
        Click "Stop Recording" when you're done capturing the issue. You'll be
        able to add details and submit your bug report next.
      </p>
    </div>
  )
}
