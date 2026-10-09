import {
  redactMetadata,
  redactNetworkRequest,
  redactText,
} from "@crikket/capture-core/debugger/redaction"
import { z } from "zod"

const MAX_OFFSET_MS = 24 * 60 * 60 * 1000

const debuggerMetadataSchema = z.record(z.string(), z.unknown()).optional()
const debuggerHeadersSchema = z.record(z.string(), z.string()).optional()

const debuggerActionSchema = z.object({
  type: z.string().min(1).max(80),
  target: z.string().max(1000).optional(),
  timestamp: z.string().datetime({ offset: true }),
  offset: z
    .number()
    .int()
    .nonnegative()
    .max(MAX_OFFSET_MS)
    .nullable()
    .optional(),
  metadata: debuggerMetadataSchema,
})

const debuggerLogSchema = z.object({
  level: z.enum(["log", "info", "warn", "error", "debug"]),
  message: z.string().min(1).max(4000),
  timestamp: z.string().datetime({ offset: true }),
  offset: z
    .number()
    .int()
    .nonnegative()
    .max(MAX_OFFSET_MS)
    .nullable()
    .optional(),
  metadata: debuggerMetadataSchema,
})

const debuggerNetworkRequestSchema = z.object({
  method: z.string().min(1).max(20),
  url: z.string().min(1).max(4096),
  status: z.number().int().nonnegative().max(999).optional(),
  duration: z.number().int().nonnegative().max(MAX_OFFSET_MS).optional(),
  requestHeaders: debuggerHeadersSchema,
  responseHeaders: debuggerHeadersSchema,
  requestBody: z.string().max(8000).optional(),
  responseBody: z.string().max(8000).optional(),
  timestamp: z.string().datetime({ offset: true }),
  offset: z
    .number()
    .int()
    .nonnegative()
    .max(MAX_OFFSET_MS)
    .nullable()
    .optional(),
})

export type DebuggerAction = z.infer<typeof debuggerActionSchema>
export type DebuggerLog = z.infer<typeof debuggerLogSchema>
export type DebuggerNetworkRequest = z.infer<
  typeof debuggerNetworkRequestSchema
>

export interface ParsedDebuggerData {
  actions: DebuggerAction[]
  logs: DebuggerLog[]
  networkRequests: DebuggerNetworkRequest[]
}

// Server-side Redaction pass at ingestion. The stored artifact comes from the
// client, and an outdated or tampered client may have skipped its own filter,
// so every item is redacted again here before it can be saved.
export function parseDebuggerData(
  input: { actions: unknown[]; logs: unknown[]; networkRequests: unknown[] },
  warnings: string[]
): ParsedDebuggerData {
  const actions = parseDebuggerItems(
    input.actions,
    debuggerActionSchema,
    "action events",
    warnings
  )
  const logs = parseDebuggerItems(
    input.logs,
    debuggerLogSchema,
    "log events",
    warnings
  )
  const networkRequests = parseDebuggerItems(
    input.networkRequests,
    debuggerNetworkRequestSchema,
    "network requests",
    warnings
  )

  return {
    actions: actions.map((action) => ({
      ...action,
      metadata: action.metadata && redactMetadata(action.metadata),
    })),
    logs: logs.map((log) => ({
      ...log,
      message: redactText(log.message),
      metadata: log.metadata && redactMetadata(log.metadata),
    })),
    networkRequests: networkRequests.map(redactNetworkRequest),
  }
}

function parseDebuggerItems<TParsed>(
  input: unknown[],
  schema: z.ZodType<TParsed>,
  label: string,
  warnings: string[]
): TParsed[] {
  const parsedItems: TParsed[] = []
  let droppedCount = 0

  for (const candidate of input) {
    const parsed = schema.safeParse(candidate)
    if (!parsed.success) {
      droppedCount += 1
      continue
    }

    parsedItems.push(parsed.data)
  }

  if (droppedCount > 0) {
    warnings.push(
      `Skipped ${droppedCount} invalid debugger ${label} before saving.`
    )
  }

  return parsedItems
}
