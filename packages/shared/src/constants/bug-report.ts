export const BUG_REPORT_STATUS_OPTIONS = {
  open: "open",
  inProgress: "in_progress",
  resolved: "resolved",
  closed: "closed",
} as const

export type BugReportStatus =
  (typeof BUG_REPORT_STATUS_OPTIONS)[keyof typeof BUG_REPORT_STATUS_OPTIONS]

export const BUG_REPORT_VISIBILITY_OPTIONS = {
  public: "public",
  private: "private",
} as const

export type BugReportVisibility =
  (typeof BUG_REPORT_VISIBILITY_OPTIONS)[keyof typeof BUG_REPORT_VISIBILITY_OPTIONS]

export const BUG_REPORT_SUBMISSION_STATUS_OPTIONS = {
  processing: "processing",
  ready: "ready",
  failed: "failed",
} as const

export type BugReportSubmissionStatus =
  (typeof BUG_REPORT_SUBMISSION_STATUS_OPTIONS)[keyof typeof BUG_REPORT_SUBMISSION_STATUS_OPTIONS]

export const BUG_REPORT_DEBUGGER_INGESTION_STATUS_OPTIONS = {
  notUploaded: "not_uploaded",
  pending: "pending",
  processing: "processing",
  completed: "completed",
  failed: "failed",
} as const

export type BugReportDebuggerIngestionStatus =
  (typeof BUG_REPORT_DEBUGGER_INGESTION_STATUS_OPTIONS)[keyof typeof BUG_REPORT_DEBUGGER_INGESTION_STATUS_OPTIONS]

export const BUG_REPORT_SORT_OPTIONS = {
  newest: "newest",
  oldest: "oldest",
  updated: "updated",
  priorityHigh: "priority_high",
  priorityLow: "priority_low",
} as const

export type BugReportSort =
  (typeof BUG_REPORT_SORT_OPTIONS)[keyof typeof BUG_REPORT_SORT_OPTIONS]

// How long a started upload, and a screenshot Draft waiting to be resumed,
// stay valid. One value so a Draft never outlives the session it would resume.
export const BUG_REPORT_UPLOAD_SESSION_TTL_MS = 24 * 60 * 60 * 1000
