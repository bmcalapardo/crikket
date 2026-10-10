import { Button } from "@crikket/ui/components/ui/button"
import { useCallback, useEffect, useState } from "react"
import { buildDiagnosticsBundle } from "@/lib/diagnostics/bundle"
import {
  type CheckStatus,
  type DiagnosticsEnvironment,
  type DiagnosticsReport,
  runChecks,
} from "@/lib/diagnostics/checks"
import type { ErrorLogEntry } from "@/lib/diagnostics/error-log"

interface DiagnosticsPageProps {
  environment: DiagnosticsEnvironment
  loadStorage: () => Promise<Record<string, unknown>>
  timeoutMs?: number
  now?: () => number
  writeClipboard?: (text: string) => Promise<void>
  saveFile?: (filename: string, text: string) => void
}

const STATUS_TEXT: Record<CheckStatus, string> = {
  pass: "Pass",
  warn: "Warning",
  fail: "Fail",
}

const STATUS_CLASS: Record<CheckStatus, string> = {
  pass: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  fail: "text-destructive",
}

function defaultWriteClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text)
}

function defaultSaveFile(filename: string, text: string): void {
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/json" })
  )
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function DiagnosticsPage({
  environment,
  loadStorage,
  timeoutMs,
  now = Date.now,
  writeClipboard = defaultWriteClipboard,
  saveFile = defaultSaveFile,
}: DiagnosticsPageProps) {
  const [report, setReport] = useState<DiagnosticsReport | null>(null)
  const [errors, setErrors] = useState<ErrorLogEntry[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [notice, setNotice] = useState("")

  const run = useCallback(async () => {
    setIsRunning(true)
    setNotice("")
    const next = await runChecks(environment, { timeoutMs })
    setReport(next)
    try {
      setErrors(await environment.listErrors())
    } catch {
      setErrors([])
    }
    setIsRunning(false)
  }, [environment, timeoutMs])

  useEffect(() => {
    run()
  }, [run])

  const buildBundle = async (): Promise<string | undefined> => {
    if (!report) {
      return
    }
    let storage: Record<string, unknown> = {}
    try {
      storage = await loadStorage()
    } catch {
      // The bundle still helps without a storage dump.
    }
    return buildDiagnosticsBundle({
      generatedAt: now(),
      version: environment.version,
      buildSha: environment.buildSha,
      appUrl: environment.appUrl,
      report,
      errors,
      storage,
    })
  }

  const copyBundle = async () => {
    const bundle = await buildBundle()
    if (!bundle) {
      return
    }
    try {
      await writeClipboard(bundle)
      setNotice("Diagnostics bundle copied to the clipboard.")
    } catch {
      setNotice("Could not copy. Use Download diagnostics bundle instead.")
    }
  }

  const downloadBundle = async () => {
    const bundle = await buildBundle()
    if (!bundle) {
      return
    }
    saveFile("crikket-diagnostics.json", bundle)
    setNotice("Diagnostics bundle downloaded.")
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="font-medium font-mono text-xl">Crikket diagnostics</h1>
        <p className="text-muted-foreground text-sm">
          Checks what Crikket needs to work. Secrets are removed from the recent
          errors and the exported bundle.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <Button disabled={isRunning} onClick={run} variant="outline">
          {isRunning ? "Running checks…" : "Run checks again"}
        </Button>
        <Button disabled={!report} onClick={copyBundle} variant="outline">
          Copy diagnostics bundle
        </Button>
        <Button disabled={!report} onClick={downloadBundle} variant="outline">
          Download diagnostics bundle
        </Button>
      </div>

      <output aria-live="polite" className="block min-h-5 text-sm">
        {notice}
      </output>

      <section aria-labelledby="checks-heading" className="space-y-2">
        <h2 className="font-medium text-base" id="checks-heading">
          Checks
        </h2>
        <ul
          aria-busy={isRunning}
          aria-label="Diagnostic checks"
          className="space-y-2"
        >
          {report?.checks.map((check) => (
            <li
              className="rounded-md border p-3"
              data-check-id={check.id}
              data-status={check.status}
              key={check.id}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm">{check.label}</span>
                <span
                  className={`font-medium text-sm ${STATUS_CLASS[check.status]}`}
                >
                  {STATUS_TEXT[check.status]}
                </span>
              </div>
              <p className="mt-1 text-muted-foreground text-xs">
                {check.summary}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="errors-heading" className="space-y-2">
        <h2 className="font-medium text-base" id="errors-heading">
          Recent errors
        </h2>
        {errors.length === 0 ? (
          <p className="text-muted-foreground text-sm">No errors recorded.</p>
        ) : (
          <ol aria-label="Recent errors" className="space-y-2">
            {[...errors].reverse().map((entry) => (
              <li
                className="rounded-md border p-3 text-xs"
                key={`${entry.at}-${entry.context}-${entry.message}`}
              >
                <time dateTime={new Date(entry.at).toISOString()}>
                  {new Date(entry.at).toLocaleString()}
                </time>
                <p className="font-medium">{entry.context}</p>
                <p className="break-words text-muted-foreground">
                  {entry.message}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  )
}
