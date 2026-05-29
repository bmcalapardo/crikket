import { sql } from "drizzle-orm"

import { db } from "./index"

type DatabaseProbeResult = {
  ok: boolean
  durationMs: number
  error?: string
}

export const probeDatabaseReachability = async (
  timeoutMs = 8000
): Promise<DatabaseProbeResult> => {
  const startedAt = Date.now()

  try {
    await Promise.race([
      db.execute(sql`select 1 as ping`),
      new Promise<never>((_resolve, reject) => {
        setTimeout(() => {
          reject(new Error("db-probe-timeout"))
        }, timeoutMs)
      }),
    ])

    return { ok: true, durationMs: Date.now() - startedAt }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "unknown-db-probe-error"

    return {
      ok: false,
      durationMs: Date.now() - startedAt,
      error: errorMessage,
    }
  }
}
