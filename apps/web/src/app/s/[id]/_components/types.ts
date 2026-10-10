export type OrpcClient = typeof import("@/utils/orpc").client
export type SharedBugReport = Awaited<
  ReturnType<OrpcClient["bugReport"]["getById"]>
>

export type SharedBugReportDebuggerEvents = Awaited<
  ReturnType<OrpcClient["bugReport"]["getDebuggerEvents"]>
>
export type DebuggerAction = SharedBugReportDebuggerEvents["actions"][number]
export type DebuggerLog = SharedBugReportDebuggerEvents["logs"][number]

export type SharedNetworkRequestsPage = Awaited<
  ReturnType<OrpcClient["bugReport"]["getNetworkRequests"]>
>
export type DebuggerNetworkRequest = SharedNetworkRequestsPage["items"][number]

export type DebuggerTimelineKind = "action" | "log" | "network"

export interface DebuggerTimelineEntry {
  id: string
  kind: DebuggerTimelineKind
  label: string
  detail: string
  timestamp: string
  offset: number | null
}

// Inferred from the server's schema, so it cannot drift. Still read defensively
// (see describeEnvironment): the stored value may be absent or newer.
export type ReportEnvironment = NonNullable<SharedBugReport["environment"]>

export interface DeviceInfo {
  browser?: string
  os?: string
  viewport?: string
}
