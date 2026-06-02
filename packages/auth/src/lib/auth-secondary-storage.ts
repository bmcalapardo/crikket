import { env } from "@crikket/env/server"
import { Redis } from "@upstash/redis"

const hasUpstashConfig = Boolean(
  env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
)

const upstashRedis = hasUpstashConfig
  ? new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null

export const authSecondaryStorage = upstashRedis
  ? {
      get: async (key: string) => {
        const value = await upstashRedis.get<string>(key)
        return value ?? null
      },
      set: async (key: string, value: string, ttl?: number) => {
        if (ttl) {
          await upstashRedis.set(key, value, { ex: ttl })
          return
        }

        await upstashRedis.set(key, value)
      },
      delete: async (key: string) => {
        await upstashRedis.del(key)
      },
    }
  : undefined

export const authRateLimitStorage = authSecondaryStorage
  ? ("secondary-storage" as const)
  : ("memory" as const)
