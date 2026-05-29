import {
  authRateLimitStorage,
  authSecondaryStorage,
} from "@crikket/auth/lib/auth-secondary-storage"
import { probeDatabaseReachability } from "@crikket/db/probe-database-reachability"
import { env } from "@crikket/env/server"

import { writeDebugLog } from "./debug-log"

const DEFAULT_PROBE_TIMEOUT_MS = 8000

type ProbeResult = {
  ok: boolean
  durationMs: number
  error?: string
}

const runWithTimeout = async <T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> => {
  return await Promise.race([
    operation(),
    new Promise<T>((_resolve, reject) => {
      setTimeout(() => {
        reject(new Error(timeoutMessage))
      }, timeoutMs)
    }),
  ])
}

export const probeUpstashReachability = async (
  timeoutMs = DEFAULT_PROBE_TIMEOUT_MS
): Promise<ProbeResult> => {
  const startedAt = Date.now()

  if (!authSecondaryStorage) {
    return {
      ok: true,
      durationMs: Date.now() - startedAt,
    }
  }

  const probeKey = `crikket:debug:ping:${Date.now()}`

  try {
    await runWithTimeout(
      async () => {
        await authSecondaryStorage.set(probeKey, "1", 30)
        await authSecondaryStorage.get(probeKey)
        await authSecondaryStorage.delete(probeKey)
      },
      timeoutMs,
      "upstash-probe-timeout"
    )

    return { ok: true, durationMs: Date.now() - startedAt }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "unknown-upstash-probe-error"

    return {
      ok: false,
      durationMs: Date.now() - startedAt,
      error: errorMessage,
    }
  }
}

export const logAuthDependencySnapshot = (): void => {
  writeDebugLog({
    hypothesisId: "G",
    location: "apps/server/src/auth-debug-probes.ts",
    message: "auth-dependency-snapshot",
    data: {
      rateLimitStorage: authRateLimitStorage,
      hasUpstashSecondaryStorage: Boolean(authSecondaryStorage),
      enablePayments: env.ENABLE_PAYMENTS,
      hasPolarAccessToken: Boolean(env.POLAR_ACCESS_TOKEN),
      hasResendApiKey: Boolean(env.RESEND_API_KEY),
      hasResendFromEmail: Boolean(env.RESEND_FROM_EMAIL),
      nodeEnv: env.NODE_ENV,
    },
  })
}

export const runAuthPreHandlerProbes = async (
  authPath: string
): Promise<void> => {
  logAuthDependencySnapshot()

  const dbProbe = await probeDatabaseReachability(DEFAULT_PROBE_TIMEOUT_MS)
  writeDebugLog({
    hypothesisId: "G",
    location: "apps/server/src/auth-debug-probes.ts",
    message: "db-probe-result",
    data: { authPath, ...dbProbe },
  })

  const upstashProbe = await probeUpstashReachability()
  writeDebugLog({
    hypothesisId: "F",
    location: "apps/server/src/auth-debug-probes.ts",
    message: "upstash-probe-result",
    data: { authPath, ...upstashProbe },
  })
}
