import type { ConsoleLevel, Reporter } from "./types"

interface ConsoleCaptureInput {
  reporter: Reporter
  postConsole: (level: ConsoleLevel, args: unknown[]) => void
}

export function installConsoleCapture(input: ConsoleCaptureInput): void {
  const { reporter, postConsole } = input

  const consoleLevels: ConsoleLevel[] = [
    "log",
    "info",
    "warn",
    "error",
    "debug",
  ]

  // Add a capturing lock to prevent infinite recursion
  let isCapturing = false

  for (const level of consoleLevels) {
    const original = console[level]

    // Safety check: ensure the method actually exists in the current environment
    if (typeof original !== "function") continue

    // Use standard function instead of arrow to respect potential calling contexts
    console[level] = (...args: unknown[]) => {
      // If we are already capturing, bypass to the original to prevent stack overflow
      if (isCapturing) {
        return original.apply(console, args)
      }

      isCapturing = true

      try {
        postConsole(level, args)
      } catch (error) {
        // Since isCapturing is true, this error will route safely to the original console
        reporter.reportNonFatalError(
          "Failed to post console event in debugger instrumentation",
          error
        )
      } finally {
        isCapturing = false
      }

      // Execute the original log using apply to maintain correct context
      return original.apply(console, args)
    }
  }
}
