import { env } from "@crikket/env/server"
import { Redis } from "@upstash/redis"

import { writeAuthDebugLog } from "./write-auth-debug-log"

const hasUpstashConfig = Boolean(
  env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
)

const upstashRedis = hasUpstashConfig
  ? new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null

const logSecondaryStorageOperation = (
  operation: "get" | "set" | "delete",
  key: string,
  phase: "start" | "finished" | "error",
  data: Record<string, unknown> = {}
): void => {
  writeAuthDebugLog({
    hypothesisId: "F",
    location: "packages/auth/src/lib/auth-secondary-storage.ts",
    message: `secondary-storage-${operation}-${phase}`,
    data: {
      keyPrefix: key.slice(0, 48),
      keyLength: key.length,
      ...data,
    },
  })
}

export const authSecondaryStorage = upstashRedis
  ? {
      get: async (key: string) => {
        const startedAt = Date.now()
        logSecondaryStorageOperation("get", key, "start")

        try {
          const value = await upstashRedis.get<string>(key)
          logSecondaryStorageOperation("get", key, "finished", {
            durationMs: Date.now() - startedAt,
            hit: value !== null && value !== undefined,
          })
          return value ?? null
        } catch (error) {
          logSecondaryStorageOperation("get", key, "error", {
            durationMs: Date.now() - startedAt,
            error: error instanceof Error ? error.message : "unknown-error",
          })
          throw error
        }
      },
      set: async (key: string, value: string, ttl?: number) => {
        const startedAt = Date.now()
        logSecondaryStorageOperation("set", key, "start", {
          hasTtl: Boolean(ttl),
        })

        try {
          if (ttl) {
            await upstashRedis.set(key, value, { ex: ttl })
          } else {
            await upstashRedis.set(key, value)
          }

          logSecondaryStorageOperation("set", key, "finished", {
            durationMs: Date.now() - startedAt,
          })
        } catch (error) {
          logSecondaryStorageOperation("set", key, "error", {
            durationMs: Date.now() - startedAt,
            error: error instanceof Error ? error.message : "unknown-error",
          })
          throw error
        }
      },
      delete: async (key: string) => {
        const startedAt = Date.now()
        logSecondaryStorageOperation("delete", key, "start")

        try {
          await upstashRedis.del(key)
          logSecondaryStorageOperation("delete", key, "finished", {
            durationMs: Date.now() - startedAt,
          })
        } catch (error) {
          logSecondaryStorageOperation("delete", key, "error", {
            durationMs: Date.now() - startedAt,
            error: error instanceof Error ? error.message : "unknown-error",
          })
          throw error
        }
      },
    }
  : undefined

export const authRateLimitStorage = authSecondaryStorage
  ? ("secondary-storage" as const)
  : ("memory" as const)
