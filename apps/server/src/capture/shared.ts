import {
  isCaptureOriginAllowed,
  isCapturePublicKeyActive,
  resolveCapturePublicKey,
} from "@crikket/bug-reports/lib/capture-public-key"
import { ORPCError } from "@orpc/server"
import { z } from "zod"
import { logCaptureSecurityError, logCaptureSecurityEvent } from "./logging"
import {
  assertCaptureRequestBodyLength,
  buildCaptureRateLimitErrorResponse,
  evaluateCaptureSubmitRateLimit,
  getCaptureRequestOrigin,
} from "./security"

export interface AuthorizedCaptureRequest {
  keyId: string
  organizationId: string
  origin: string
  publicKeyId: string
  rateLimitHeaders: Record<string, string>
}

export function buildJsonResponse(
  payload: unknown,
  init?: ResponseInit
): Response {
  return new Response(JSON.stringify(payload), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers,
    },
  })
}

export function toCaptureErrorResponse(
  error: unknown,
  context: {
    keyId?: string | null
    method: string
    origin?: string | null
    route: string
  }
): Response {
  logCaptureSecurityError({
    error,
    keyId: context.keyId,
    method: context.method,
    origin: context.origin,
    route: context.route,
  })

  if (error instanceof ORPCError) {
    return buildJsonResponse(error.toJSON(), {
      status: error.status,
    })
  }

  if (error instanceof z.ZodError) {
    return buildJsonResponse(
      {
        code: "BAD_REQUEST",
        issues: error.issues,
        message: "Invalid capture request payload.",
      },
      {
        status: 400,
      }
    )
  }

  // The real error is logged above; never echo SQL, storage or env details.
  return buildJsonResponse(
    {
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to process capture request.",
    },
    {
      status: 500,
    }
  )
}

export async function authorizeCaptureSubmitRequest(input: {
  request: Request
  route: string
}): Promise<AuthorizedCaptureRequest | Response> {
  assertCaptureRequestBodyLength(input.request)

  const publicKey = input.request.headers.get("x-crikket-public-key")?.trim()
  if (!publicKey) {
    throw new ORPCError("UNAUTHORIZED", {
      data: {
        reasonCode: "missing_public_key",
      },
      message: "Capture public key is required.",
    })
  }

  const resolvedKey = await resolveCapturePublicKey(publicKey)
  if (!resolvedKey) {
    throw new ORPCError("UNAUTHORIZED", {
      data: {
        reasonCode: "invalid_public_key",
      },
      message: "Capture public key is invalid.",
    })
  }

  if (!isCapturePublicKeyActive(resolvedKey)) {
    throw new ORPCError("UNAUTHORIZED", {
      data: {
        reasonCode: "inactive_public_key",
      },
      message: "Capture public key is no longer active.",
    })
  }

  const origin = getCaptureRequestOrigin(input.request)
  if (!origin) {
    throw new ORPCError("FORBIDDEN", {
      data: {
        reasonCode: "missing_origin",
      },
      message: "Capture submission origin is required.",
    })
  }

  if (
    !isCaptureOriginAllowed({
      origin,
      record: resolvedKey,
    })
  ) {
    throw new ORPCError("FORBIDDEN", {
      data: {
        reasonCode: "disallowed_origin",
      },
      message: "Capture submission origin is not allowed for this key.",
    })
  }

  const rateLimitDecision = await evaluateCaptureSubmitRateLimit({
    keyId: resolvedKey.id,
    origin,
    request: input.request,
  })
  if (!rateLimitDecision.allowed) {
    logCaptureSecurityEvent({
      decision: "rejected",
      keyId: resolvedKey.id,
      method: input.request.method,
      origin,
      reasonCode: "rate_limited",
      route: input.route,
      status: 429,
    })
    return buildCaptureRateLimitErrorResponse(rateLimitDecision)
  }

  return {
    keyId: resolvedKey.id,
    organizationId: resolvedKey.organizationId,
    origin,
    publicKeyId: resolvedKey.id,
    rateLimitHeaders: rateLimitDecision.headers,
  }
}
