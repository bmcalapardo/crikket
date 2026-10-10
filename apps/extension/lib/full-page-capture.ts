import {
  type FullPageMetrics,
  isCaptureRateLimitError,
  nextCaptureDelay,
  planFullPageCapture,
} from "@/lib/full-page-plan"

const SCROLL_SETTLE_MS = 250
const MAX_RATE_LIMIT_RETRIES = 6
const RATE_LIMIT_BACKOFF_MS = 700
/** chrome.storage.local has no unlimitedStorage here, so stay under its quota. */
const MAX_STORED_DATA_URL_LENGTH = 8_000_000

export interface PageScrollState {
  scrollY: number
  /** Address of the page the script ran on, to notice navigation mid-capture. */
  href?: string
}

export const PAGE_CHANGED_MESSAGE =
  "The page changed while capturing the full page. Try again once it has finished loading."
export const RESTRICTED_PAGE_MESSAGE =
  "This page can't be captured as a full page. Browser pages, the Chrome Web Store and the PDF viewer block scrolling capture; use Capture Screenshot instead."
export const TOO_LARGE_MESSAGE =
  "The full-page capture is too large to hand over to the editor. Try a shorter page."
export const TRUNCATED_NOTICE =
  "This page is taller than the browser can stitch, so the capture stops partway down the page."

function assertSamePage(expected: string | undefined, state: PageScrollState) {
  if (
    expected !== undefined &&
    state.href !== undefined &&
    state.href !== expected
  ) {
    throw new Error(PAGE_CHANGED_MESSAGE)
  }
}

export interface FullPageCaptureDeps {
  measure: () => Promise<FullPageMetrics & PageScrollState>
  scrollTo: (y: number) => Promise<PageScrollState>
  captureVisible: () => Promise<string>
  now: () => number
  sleep: (ms: number) => Promise<void>
}

export interface CapturedSlice {
  dataUrl: string
  /** Where the page was actually scrolled to, in CSS pixels. */
  scrollY: number
}

export interface FullPageCaptureResult {
  slices: CapturedSlice[]
  plan: ReturnType<typeof planFullPageCapture>
  devicePixelRatio: number
}

async function captureWithRetry(
  deps: FullPageCaptureDeps,
  lastCaptureAt: number | null
): Promise<{ dataUrl: string; capturedAt: number }> {
  let last = lastCaptureAt
  for (let attempt = 0; ; attempt++) {
    const wait = nextCaptureDelay({ now: deps.now(), lastCaptureAt: last })
    if (wait > 0) {
      await deps.sleep(wait)
    }
    try {
      const dataUrl = await deps.captureVisible()
      return { dataUrl, capturedAt: deps.now() }
    } catch (error) {
      last = deps.now()
      if (
        !isCaptureRateLimitError(error) ||
        attempt >= MAX_RATE_LIMIT_RETRIES
      ) {
        throw error
      }
      await deps.sleep(RATE_LIMIT_BACKOFF_MS)
    }
  }
}

/** Scrolls through the page capturing each slice, paced for Chromium's
 * `captureVisibleTab` rate limit. The original scroll position is restored
 * even when a capture fails. */
export async function captureFullPageSlices(
  deps: FullPageCaptureDeps
): Promise<FullPageCaptureResult> {
  const metrics = await deps.measure()
  const startHref = metrics.href
  const plan = planFullPageCapture(metrics)
  const slices: CapturedSlice[] = []
  let lastCaptureAt: number | null = null
  let pageChanged = false

  try {
    for (const offset of plan.scrollOffsets) {
      const state = await deps.scrollTo(offset)
      assertSamePage(startHref, state)
      await deps.sleep(SCROLL_SETTLE_MS)
      const { dataUrl, capturedAt } = await captureWithRetry(
        deps,
        lastCaptureAt
      )
      lastCaptureAt = capturedAt
      if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
        throw new Error("The browser returned an unusable screenshot.")
      }
      slices.push({ dataUrl, scrollY: state.scrollY })
    }
  } catch (error) {
    pageChanged =
      error instanceof Error && error.message === PAGE_CHANGED_MESSAGE
    throw error
  } finally {
    // Never scroll a different page the tab has since navigated to.
    if (!pageChanged) {
      await deps.scrollTo(metrics.scrollY).catch(() => undefined)
    }
  }

  return { slices, plan, devicePixelRatio: metrics.devicePixelRatio }
}

/** Draws the slices onto one canvas and returns a data URL. */
export async function stitchSlices(
  result: FullPageCaptureResult
): Promise<string> {
  const { plan, slices, devicePixelRatio } = result
  const canvas = document.createElement("canvas")
  canvas.width = plan.canvasWidth
  canvas.height = plan.canvasHeight
  const context = canvas.getContext("2d")
  if (!context) {
    throw new Error("Could not create a canvas to stitch the full page.")
  }

  for (const slice of slices) {
    const blob = await (await fetch(slice.dataUrl)).blob()
    const bitmap = await createImageBitmap(blob)
    context.drawImage(bitmap, 0, Math.round(slice.scrollY * devicePixelRatio))
    bitmap.close()
  }

  return encodeWithinBudget(canvas)
}

/** PNG first, then ever lossier JPEG, until the data URL fits the storage
 * budget. Throws rather than letting chrome.storage reject an oversize value. */
export function encodeWithinBudget(
  canvas: Pick<HTMLCanvasElement, "toDataURL">,
  budget = MAX_STORED_DATA_URL_LENGTH
): string {
  const png = canvas.toDataURL("image/png")
  if (png.length <= budget) {
    return png
  }
  for (const quality of [0.9, 0.7, 0.5, 0.3]) {
    const jpeg = canvas.toDataURL("image/jpeg", quality)
    if (jpeg.length <= budget) {
      return jpeg
    }
  }
  throw new Error(TOO_LARGE_MESSAGE)
}

const RESTRICTED_PATTERN =
  /cannot access|extensions gallery|chrome:\/\/|cannot be scripted/i
const TAB_GONE_PATTERN = /no tab with id|frame with id.*was removed/i

function explainScriptError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error)
  if (TAB_GONE_PATTERN.test(message)) {
    return new Error(PAGE_CHANGED_MESSAGE)
  }
  if (RESTRICTED_PATTERN.test(message)) {
    return new Error(RESTRICTED_PAGE_MESSAGE)
  }
  return error instanceof Error ? error : new Error(message)
}

/** Wires the capture to a real tab through chrome.scripting and chrome.tabs. */
export function createTabCaptureDeps(
  tabId: number,
  windowId: number
): FullPageCaptureDeps {
  return {
    measure: async () => {
      const [injection] = await chrome.scripting
        .executeScript({
          target: { tabId },
          func: () => ({
            href: location.href,
            pageHeight: Math.max(
              document.documentElement.scrollHeight,
              document.body?.scrollHeight ?? 0
            ),
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            devicePixelRatio: window.devicePixelRatio,
            scrollY: window.scrollY,
          }),
        })
        .catch((error) => {
          throw explainScriptError(error)
        })
      if (!injection?.result) {
        throw new Error(RESTRICTED_PAGE_MESSAGE)
      }
      return injection.result
    },
    scrollTo: async (y) => {
      const [injection] = await chrome.scripting
        .executeScript({
          target: { tabId },
          args: [y],
          func: (top: number) => {
            window.scrollTo({ top, left: window.scrollX, behavior: "instant" })
            return { scrollY: window.scrollY, href: location.href }
          },
        })
        .catch((error) => {
          throw explainScriptError(error)
        })
      if (!injection?.result) {
        throw new Error(PAGE_CHANGED_MESSAGE)
      }
      return injection.result
    },
    captureVisible: () =>
      chrome.tabs.captureVisibleTab(windowId, { format: "png" }),
    now: () => Date.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  }
}
