import { getOrganizationEntitlements } from "@crikket/billing/service/entitlements/organization-entitlements"
import { evaluateVideoDuration } from "@crikket/billing/service/entitlements/video-duration"
import { ORPCError } from "@orpc/server"

export interface CreateBugReportEntitlementInput {
  attachmentType: "video" | "screenshot"
  metadata?: {
    durationMs?: number
  }
}

export async function assertCreateBugReportEntitlements(input: {
  organizationId: string
  payload: CreateBugReportEntitlementInput
}): Promise<void> {
  const entitlements = await getOrganizationEntitlements(input.organizationId)

  if (!entitlements.canCreateBugReports) {
    throw new ORPCError("FORBIDDEN", {
      message:
        "This organization is on the free plan. Upgrade to Pro to create bug reports.",
    })
  }

  if (input.payload.attachmentType !== "video") {
    return
  }

  if (!entitlements.canUploadVideo) {
    throw new ORPCError("FORBIDDEN", {
      message:
        "Video uploads are not available for this organization plan. Upgrade to Pro to continue.",
    })
  }

  // durationMs is the playable length (paused stretches excluded); that is
  // what the plan limit is measured against. See video-duration.ts for what is
  // and is not enforceable against a client-reported value.
  const verdict = evaluateVideoDuration({
    durationMs: input.payload.metadata?.durationMs,
    maxVideoDurationMs: entitlements.maxVideoDurationMs,
  })
  if (verdict.ok) {
    return
  }

  if (verdict.reason === "missing") {
    throw new ORPCError("BAD_REQUEST", {
      message: "Video duration metadata is required for video uploads.",
    })
  }

  if (verdict.reason === "invalid") {
    throw new ORPCError("BAD_REQUEST", {
      message: "Video duration metadata is invalid.",
    })
  }

  throw new ORPCError("FORBIDDEN", {
    message: "Video exceeds your organization plan duration limit.",
  })
}
