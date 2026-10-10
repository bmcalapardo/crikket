// Turns the stored environment (jsonb, optional, versioned) into labelled text
// rows. Pure and defensive: the value crossed a trust boundary and may be
// absent, partial, or from a newer schemaVersion. Everything returned is a
// plain string, so React renders it as text, never as HTML.
export interface EnvironmentRow {
  label: string
  value: string
  breakAll?: boolean
}

const MAX_CELL = 2048

function text(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, MAX_CELL) : null
}

function positive(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function describeEnvironment(environment: unknown): EnvironmentRow[] {
  const env = record(environment)
  if (!env) {
    return []
  }
  const rows: EnvironmentRow[] = []
  const add = (label: string, value: string | null, breakAll = false) => {
    if (value) {
      rows.push({ label, value, breakAll })
    }
  }

  const version = text(env.extensionVersion)
  const sha = text(env.buildSha)
  add("Extension", version && sha ? `${version} (${sha.slice(0, 7)})` : version)

  const browser = record(env.browser)
  add(
    "Browser",
    [text(browser?.name), text(browser?.version)].filter(Boolean).join(" ") ||
      null
  )
  add("OS", text(env.os))

  const viewport = record(env.viewport)
  const width = positive(viewport?.width)
  const height = positive(viewport?.height)
  if (width && height) {
    const ratio = positive(env.devicePixelRatio)
    add("Viewport", `${width}x${height}${ratio ? ` @${ratio}x` : ""}`)
  }

  const capture = record(env.capture)
  const type = text(capture?.type)
  const duration = positive(capture?.durationMs)
  add(
    "Capture",
    type === "video" && duration
      ? `video, ${(duration / 1000).toFixed(1)}s`
      : type
  )

  const page = record(env.page)
  add("Page URL", text(page?.url), true)
  add("Page title", text(page?.title))
  return rows
}
