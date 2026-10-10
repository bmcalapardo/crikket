interface NonFatalErrorOptions {
  once?: boolean
}

type NonFatalErrorListener = (context: string, error: unknown) => void

const reportedContexts = new Set<string>()
const listeners = new Set<NonFatalErrorListener>()

// Lets a surface (the extension's diagnostics page) observe every non-fatal
// error without each call site knowing about it. Returns an unsubscribe.
export function addNonFatalErrorListener(
  listener: NonFatalErrorListener
): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function reportNonFatalError(
  context: string,
  error: unknown,
  options?: NonFatalErrorOptions
): void {
  if (options?.once) {
    if (reportedContexts.has(context)) {
      return
    }

    reportedContexts.add(context)
  }

  console.warn(`[Non-fatal] ${context}`, error)

  for (const listener of listeners) {
    try {
      listener(context, error)
    } catch {
      // A broken listener must never turn a non-fatal error into a fatal one.
    }
  }
}

interface ErrorWithCode {
  code?: unknown
}

export function isErrorWithCode(
  error: unknown,
  code: string
): error is Error & ErrorWithCode {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as ErrorWithCode).code === code
  )
}
