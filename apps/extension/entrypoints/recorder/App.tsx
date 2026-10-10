import {
  buildDebuggerSubmissionPayload,
  hasDebuggerPayloadData,
} from "@crikket/capture-core/debugger/payload"
import { readDebuggerSessionIdFromSearch } from "@crikket/capture-core/debugger/recorder-session"
import type { BugReportDebuggerPayload } from "@crikket/capture-core/debugger/types"
import { env } from "@crikket/env/extension"
import type { BugReportVisibility } from "@crikket/shared/constants/bug-report"
import type { Priority } from "@crikket/shared/constants/priorities"
import { reportNonFatalError } from "@crikket/shared/lib/errors"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@crikket/ui/components/ui/card"
import { AlertCircle } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AnnotateStep } from "@/components/annotate-step"
import { CropStep } from "@/components/crop-step"
import { FormStep } from "@/components/form-step"
import { RecordingStep } from "@/components/recording-step"
import { SuccessStep } from "@/components/success-step"
import { useCaptureContext } from "@/hooks/use-capture-context"
import { useCommandShortcuts } from "@/hooks/use-command-shortcuts"
import { type CaptureType, useRecorderInit } from "@/hooks/use-recorder-init"
import { useRecorderRecordingSync } from "@/hooks/use-recorder-recording-sync"
import { useScreenCapture } from "@/hooks/use-screen-capture"
import { useTimer } from "@/hooks/use-timer"
import type { AnnotationHistory } from "@/lib/annotations"
import { getLoginUrl, getShareUrl } from "@/lib/app-urls"
import {
  discardDebuggerSession,
  getDebuggerSessionSnapshot,
  markDebuggerRecordingStarted,
} from "@/lib/bug-report-debugger/client"
import { submitBugReportWithUploads } from "@/lib/bug-report-upload"
import type { RecorderState } from "@/lib/recorder-state"
import {
  buildCaptureContextSubmissionData,
  type DebuggerCaptureSummary,
  dedupeMessages,
  EMPTY_DEBUGGER_SUMMARY,
  getDebuggerCaptureSummary,
  getSubmissionErrorMessage,
  isUnauthorizedSubmissionError,
  normalizeOptionalText,
} from "@/lib/recorder-submit"
import type { Rect } from "@/lib/screenshot-crop"
import {
  annotationBase,
  applyAnnotations,
  applyScreenshotEdit,
  resetCrop,
  resetScreenshotEdits,
  type ScreenshotEdits,
  screenshotToSubmit,
  startScreenshotEdits,
} from "@/lib/screenshot-edits"
import { formatDuration, getDeviceInfo } from "@/lib/utils"

interface DebuggerSubmissionInput {
  sessionId: string | null
  payload: BugReportDebuggerPayload | undefined
  summary: DebuggerCaptureSummary
  warnings: string[]
}

const STATE_DESCRIPTIONS: Record<RecorderState, string> = {
  idle: "Waiting for capture",
  recording: "Recording in progress...",
  editing: "Crop the screenshot",
  annotating: "Annotate the screenshot",
  stopped: "Review and submit",
  submitting: "Review and submit",
  success: "Report submitted!",
}

interface RecorderStepContentProps {
  error: string | null
  state: RecorderState
  duration: number
  stopRecordingShortcut: string | null
  onStopRecording: () => Promise<void>
  screenshotEdits: ScreenshotEdits | null
  onCropApply: (blob: Blob, rect: Rect) => void
  onCropReset: () => void
  onCropSkip: () => void
  onAnnotateDone: (history: AnnotationHistory, blob: Blob | null) => void
  onAnnotateCancel: () => void
  onAnnotateReset: () => void
  onEditScreenshot: () => void
  captureType: CaptureType
  debuggerSummary: DebuggerCaptureSummary
  suggestedTitle: string
  onCancel: () => void
  onSubmit: (values: {
    title: string
    description: string
    priority: Priority
    visibility: BugReportVisibility
  }) => void
  preSubmitWarnings: string[]
  previewUrl: string | null
  submitError: string | null
  videoDurationMs: number | null
  resultUrl: string
  submissionWarnings: string[]
}

function RecorderStepContent({
  error,
  state,
  duration,
  stopRecordingShortcut,
  onStopRecording,
  screenshotEdits,
  onCropApply,
  onCropReset,
  onCropSkip,
  onAnnotateDone,
  onAnnotateCancel,
  onAnnotateReset,
  onEditScreenshot,
  captureType,
  debuggerSummary,
  suggestedTitle,
  onCancel,
  onSubmit,
  preSubmitWarnings,
  previewUrl,
  submitError,
  videoDurationMs,
  resultUrl,
  submissionWarnings,
}: RecorderStepContentProps) {
  const isEditStage = state === "editing" || state === "annotating"

  return (
    <>
      {error ? (
        <div className="flex items-center gap-2 rounded-md bg-destructive/15 p-4 text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span className="font-medium text-sm">{error}</span>
        </div>
      ) : null}

      {state === "idle" ? (
        <p className="text-center text-muted-foreground">
          No active capture. Start from the extension popup.
        </p>
      ) : null}

      {state === "recording" ? (
        <RecordingStep
          duration={duration}
          onStopRecording={onStopRecording}
          stopRecordingShortcut={stopRecordingShortcut}
        />
      ) : null}

      {state === "editing" && screenshotEdits ? (
        <CropStep
          hasAppliedEdit={screenshotEdits.edited !== null}
          imageBlob={screenshotEdits.capture}
          onApply={onCropApply}
          onResetEdit={onCropReset}
          onSkip={onCropSkip}
        />
      ) : null}

      {state === "annotating" && screenshotEdits ? (
        <AnnotateStep
          hasAppliedCrop={screenshotEdits.edited !== null}
          imageBlob={annotationBase(screenshotEdits)}
          initialHistory={screenshotEdits.annotations}
          onCancel={onAnnotateCancel}
          onDone={onAnnotateDone}
          onResetToOriginal={onAnnotateReset}
          removedCount={screenshotEdits.removedByCrop}
        />
      ) : null}

      {/* Kept mounted (hidden) while editing so typed form fields survive a
          trip back to the edit stage. */}
      {state === "stopped" ||
      state === "submitting" ||
      (isEditStage && screenshotEdits) ? (
        <div hidden={isEditStage}>
          <FormStep
            captureType={captureType}
            debuggerSummary={debuggerSummary}
            initialTitle={suggestedTitle}
            isSubmitting={state === "submitting"}
            onCancel={onCancel}
            onEditScreenshot={onEditScreenshot}
            onSubmit={onSubmit}
            preSubmitWarnings={preSubmitWarnings}
            previewUrl={previewUrl}
            submitError={submitError}
            videoDurationMs={videoDurationMs}
          />
        </div>
      ) : null}

      {state === "success" ? (
        <SuccessStep
          onClose={() => window.close()}
          onCopyLink={() => navigator.clipboard.writeText(resultUrl)}
          onOpenRecording={() => window.open(resultUrl, "_blank")}
          warnings={submissionWarnings}
        />
      ) : null}
    </>
  )
}

function App() {
  const shortcuts = useCommandShortcuts()
  const [state, setState] = useState<RecorderState>("idle")
  const [screenshotEdits, setScreenshotEdits] =
    useState<ScreenshotEdits | null>(null)
  // Crop and annotate are one edit session. This is what the edits were when
  // the tester entered editing, and what Cancel returns to.
  const editSessionStartRef = useRef<ScreenshotEdits | null>(null)
  const [captureType, setCaptureType] = useState<CaptureType>("video")
  const [startTime, setStartTime] = useState<number | null>(null)
  const [recordedDurationMs, setRecordedDurationMs] = useState<number | null>(
    null
  )
  const [resultUrl, setResultUrl] = useState("")
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submissionWarnings, setSubmissionWarnings] = useState<string[]>([])
  const [preSubmitWarnings, setPreSubmitWarnings] = useState<string[]>([])
  const [debuggerSummary, setDebuggerSummary] =
    useState<DebuggerCaptureSummary>(EMPTY_DEBUGGER_SUMMARY)
  const debuggerSessionId = useMemo(
    () => readDebuggerSessionIdFromSearch(window.location.search),
    []
  )

  const captureContext = useCaptureContext()

  const {
    startRecording: startCapture,
    stopRecording: stopCapture,
    recordedBlob,
    error: captureError,
    reset: resetCapture,
  } = useScreenCapture()

  const duration = useTimer(startTime, state === "recording")

  const clearDebuggerState = useCallback(async () => {
    if (debuggerSessionId) {
      await discardDebuggerSession(debuggerSessionId).catch(
        (error: unknown) => {
          reportNonFatalError(
            "Failed to discard debugger session during reset",
            error
          )
        }
      )
    }
  }, [debuggerSessionId])

  const getDebuggerSubmissionInput = useCallback(async () => {
    const warnings: string[] = []
    const sessionId = debuggerSessionId
    if (!sessionId) {
      warnings.push(
        "Debugger session was not found. This report may be missing captured logs."
      )
      return {
        sessionId: null,
        payload: undefined,
        summary: EMPTY_DEBUGGER_SUMMARY,
        warnings,
      } satisfies DebuggerSubmissionInput
    }

    const snapshot = await getDebuggerSessionSnapshot(sessionId).catch(
      (error: unknown) => {
        reportNonFatalError(
          `Failed to load debugger snapshot for session ${sessionId}`,
          error
        )
        return null
      }
    )

    if (!snapshot) {
      warnings.push(
        "Debugger snapshot could not be loaded. This report may be missing captured logs."
      )
      return {
        sessionId,
        payload: undefined,
        summary: EMPTY_DEBUGGER_SUMMARY,
        warnings,
      } satisfies DebuggerSubmissionInput
    }

    const payload = buildDebuggerSubmissionPayload(snapshot)
    const summary = getDebuggerCaptureSummary(payload)
    const hasPayloadData = hasDebuggerPayloadData(payload)

    if (!hasPayloadData) {
      warnings.push(
        "No debugger events were captured yet. Reproduce the issue once before submitting if you need network/action logs."
      )
    } else if (summary.networkRequests === 0) {
      warnings.push(
        "No network requests were captured in this recording. API-level debugging data may be incomplete."
      )
    }

    return {
      sessionId,
      payload: hasPayloadData ? payload : undefined,
      summary,
      warnings,
    } satisfies DebuggerSubmissionInput
  }, [debuggerSessionId])

  const handleStopRecording = useCallback(async () => {
    const stoppedAt = Date.now()
    await stopCapture()
    if (startTime) {
      setRecordedDurationMs(Math.max(0, stoppedAt - startTime))
    }
    setState("stopped")
  }, [startTime, stopCapture])

  useRecorderRecordingSync({
    captureType,
    onStopFromPopup: handleStopRecording,
    state,
  })

  const startVideoCapture = useCallback(async () => {
    const success = await startCapture()
    if (success) {
      const startedAt = Date.now()
      const sessionId = debuggerSessionId
      if (sessionId) {
        await markDebuggerRecordingStarted({
          sessionId,
          recordingStartedAt: startedAt,
        }).catch((error: unknown) => {
          reportNonFatalError(
            `Failed to mark debugger recording start for session ${sessionId}`,
            error
          )
        })
      }

      setStartTime(startedAt)
      setRecordedDurationMs(null)
      setState("recording")
    }
  }, [debuggerSessionId, startCapture])

  useEffect(() => {
    if (state === "recording" && recordedBlob) {
      if (startTime) {
        setRecordedDurationMs(Math.max(0, Date.now() - startTime))
      }
      setState("stopped")
    }
  }, [recordedBlob, startTime, state])

  useEffect(() => {
    if (state !== "stopped") {
      setPreSubmitWarnings([])
      return
    }

    let isCancelled = false

    getDebuggerSubmissionInput()
      .then((debuggerInput) => {
        if (isCancelled) {
          return
        }

        setDebuggerSummary(debuggerInput.summary)
        setPreSubmitWarnings(debuggerInput.warnings)
      })
      .catch((error: unknown) => {
        reportNonFatalError(
          "Failed to inspect debugger data before bug report submission",
          error
        )
        if (isCancelled) {
          return
        }

        setDebuggerSummary(EMPTY_DEBUGGER_SUMMARY)
        setPreSubmitWarnings([
          "Could not validate debugger data before submitting.",
        ])
      })

    return () => {
      isCancelled = true
    }
  }, [getDebuggerSubmissionInput, state])

  useRecorderInit({
    onCaptureTypeChange: setCaptureType,
    onScreenshotLoaded: (blob) => {
      const edits = startScreenshotEdits(blob)
      editSessionStartRef.current = edits
      setScreenshotEdits(edits)
      setRecordedDurationMs(null)
      setState("editing")
    },
    onStartRecording: startVideoCapture,
    onError: (err) => setSubmitError(err),
  })

  // Crop is followed by annotation, which then hands over to review.
  const handleCropApply = useCallback((blob: Blob, rect: Rect) => {
    setScreenshotEdits((edits) =>
      edits ? applyScreenshotEdit(edits, blob, rect) : edits
    )
    setState("annotating")
  }, [])

  const handleCropReset = useCallback(() => {
    setScreenshotEdits((edits) => (edits ? resetCrop(edits) : edits))
  }, [])

  const handleCropSkip = useCallback(() => {
    setState("annotating")
  }, [])

  const handleAnnotateDone = useCallback(
    (history: AnnotationHistory, blob: Blob | null) => {
      setScreenshotEdits((edits) =>
        edits ? applyAnnotations(edits, history, blob) : edits
      )
      setState("stopped")
    },
    []
  )

  // Back to the raw Capture, then on to review.
  const handleAnnotateReset = useCallback(() => {
    setScreenshotEdits((edits) => (edits ? resetScreenshotEdits(edits) : edits))
    setState("stopped")
  }, [])

  // Abandons the whole edit session, crop included.
  const handleAnnotateCancel = useCallback(() => {
    setScreenshotEdits(editSessionStartRef.current)
    setState("stopped")
  }, [])

  const handleEditScreenshot = useCallback(() => {
    editSessionStartRef.current = screenshotEdits
    setState("editing")
  }, [screenshotEdits])

  const handleReset = () => {
    resetCapture()
    setScreenshotEdits(null)
    setState("idle")
    setResultUrl("")
    setSubmitError(null)
    setSubmissionWarnings([])
    setPreSubmitWarnings([])
    setDebuggerSummary(EMPTY_DEBUGGER_SUMMARY)
    setRecordedDurationMs(null)
    setStartTime(null)
    clearDebuggerState().catch((error: unknown) => {
      reportNonFatalError("Failed to clear debugger state after reset", error)
    })
  }

  const screenshotBlob = screenshotEdits
    ? screenshotToSubmit(screenshotEdits)
    : null
  const activeBlob = captureType === "video" ? recordedBlob : screenshotBlob

  const handleSubmit = async (values: {
    title: string
    description: string
    priority: Priority
    visibility: BugReportVisibility
  }) => {
    const blob = activeBlob
    if (!blob || blob.size === 0) {
      setSubmitError("Capture data is missing. Please capture again.")
      setState("stopped")
      return
    }

    setState("submitting")
    setSubmitError(null)
    setSubmissionWarnings([])

    try {
      const durationMs =
        captureType === "video"
          ? Math.max(
              0,
              recordedDurationMs ?? (startTime ? Date.now() - startTime : 0)
            )
          : 0
      const debuggerSubmission = await getDebuggerSubmissionInput()
      const captureContextSubmissionData =
        buildCaptureContextSubmissionData(captureContext)
      const warnings = [
        ...debuggerSubmission.warnings,
        ...captureContextSubmissionData.warnings,
      ]

      const result = await submitBugReportWithUploads({
        attachment: blob,
        attachmentType: captureType,
        title: normalizeOptionalText(values.title, 200),
        priority: values.priority,
        visibility: values.visibility,
        description: normalizeOptionalText(values.description, 3000),
        url: captureContextSubmissionData.normalizedUrl,
        metadata: {
          duration: formatDuration(durationMs),
          durationMs,
          pageTitle: captureContextSubmissionData.normalizedPageTitle,
        },
        deviceInfo: getDeviceInfo(),
        debuggerPayload: debuggerSubmission.payload,
        debuggerSummary: debuggerSubmission.summary,
      })

      if (debuggerSubmission.sessionId) {
        await discardDebuggerSession(debuggerSubmission.sessionId).catch(
          (error: unknown) => {
            reportNonFatalError(
              `Failed to discard debugger session ${debuggerSubmission.sessionId} after submission`,
              error
            )
          }
        )
      }

      setResultUrl(getShareUrl(env.VITE_APP_URL, result.shareUrl))
      setSubmissionWarnings(
        dedupeMessages([...warnings, ...(result.warnings ?? [])])
      )
      setState("success")
    } catch (error) {
      if (isUnauthorizedSubmissionError(error)) {
        window.open(
          getLoginUrl(env.VITE_APP_URL),
          "_blank",
          "noopener,noreferrer"
        )
      }
      setSubmitError(getSubmissionErrorMessage(error))
      setState("stopped")
    }
  }

  const suggestedTitle =
    captureContext.title?.trim() ||
    (captureType === "video" ? "Video bug report" : "Screenshot bug report")
  const previewUrl = useMemo(() => {
    if (!activeBlob) return null
    return URL.createObjectURL(activeBlob)
  }, [activeBlob])

  const error = captureError || submitError

  useEffect(() => {
    if (state === "recording") {
      document.title = `Recording ${formatDuration(duration)} - Crikket`
      return
    }

    document.title = "Crikket Bug Report"
  }, [duration, state])

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100/80 p-6 sm:p-8">
      <Card className="w-full max-w-3xl border-border/80 shadow-lg shadow-slate-950/5">
        <CardHeader className="gap-2 border-b bg-muted/20 text-left">
          <CardTitle className="flex items-center gap-2 text-xl sm:text-2xl">
            Crikket Bug Report
          </CardTitle>
          <CardDescription className="text-sm">
            {STATE_DESCRIPTIONS[state]}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 px-6 py-6">
          <RecorderStepContent
            captureType={captureType}
            debuggerSummary={debuggerSummary}
            duration={duration}
            error={error}
            onAnnotateCancel={handleAnnotateCancel}
            onAnnotateDone={handleAnnotateDone}
            onAnnotateReset={handleAnnotateReset}
            onCancel={handleReset}
            onCropApply={handleCropApply}
            onCropReset={handleCropReset}
            onCropSkip={handleCropSkip}
            onEditScreenshot={handleEditScreenshot}
            onStopRecording={handleStopRecording}
            onSubmit={handleSubmit}
            preSubmitWarnings={preSubmitWarnings}
            previewUrl={previewUrl}
            resultUrl={resultUrl}
            screenshotEdits={screenshotEdits}
            state={state}
            stopRecordingShortcut={shortcuts.stopRecording}
            submissionWarnings={submissionWarnings}
            submitError={submitError}
            suggestedTitle={suggestedTitle}
            videoDurationMs={
              captureType === "video"
                ? (recordedDurationMs ?? (duration > 0 ? duration : null))
                : null
            }
          />
        </CardContent>
      </Card>
    </div>
  )
}

export default App
