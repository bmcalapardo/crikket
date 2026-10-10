import { gunzipSync } from "node:zlib"

/** Hard ceiling for a debugger artifact, stored or after decompression. */
export const MAX_DEBUGGER_PAYLOAD_BYTES = 64 * 1024 * 1024

// The artifact is uploaded straight to object storage by the client, so its
// size and gzip ratio are attacker-controlled. Bound both before parsing.
export function decodeDebuggerPayload(
  stored: Buffer,
  contentEncoding: string | null
): Buffer {
  if (stored.byteLength > MAX_DEBUGGER_PAYLOAD_BYTES) {
    throw new Error("Debugger payload exceeds the maximum allowed size.")
  }

  if (contentEncoding !== "gzip") {
    return stored
  }

  try {
    return gunzipSync(stored, { maxOutputLength: MAX_DEBUGGER_PAYLOAD_BYTES })
  } catch (error) {
    if (error instanceof RangeError) {
      throw new Error(
        "Debugger payload exceeds the maximum allowed size when decompressed."
      )
    }
    throw error
  }
}
