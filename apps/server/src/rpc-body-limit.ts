import { bodyLimit } from "hono/body-limit"

export const MAX_RPC_REQUEST_BODY_BYTES = 110 * 1024 * 1024

export function buildPayloadTooLargeResponse(maxBytes: number): Response {
  return new Response(
    JSON.stringify({
      code: "PAYLOAD_TOO_LARGE",
      message: `Request body exceeds ${Math.floor(maxBytes / (1024 * 1024))} MB limit.`,
    }),
    {
      status: 413,
      headers: {
        "content-type": "application/json",
      },
    }
  )
}

// Enforced while the body streams in, so requests without a Content-Length
// (chunked) or with a lying one cannot be buffered past the cap.
export function rpcBodyLimit(maxBytes = MAX_RPC_REQUEST_BODY_BYTES) {
  return bodyLimit({
    maxSize: maxBytes,
    onError: () => buildPayloadTooLargeResponse(maxBytes),
  })
}
