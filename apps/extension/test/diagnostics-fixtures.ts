import type {
  DiagnosticsEnvironment,
  HttpEcho,
} from "../lib/diagnostics/checks"

export const NEVER = new Promise<never>(() => undefined)

export const okEcho: HttpEcho = {
  status: 200,
  contentType: "application/json",
  body: '{"json":"OK"}',
}

export const signedInEcho: HttpEcho = {
  status: 200,
  contentType: "application/json",
  body: '{"user":{"id":"u1"},"session":{"id":"s1"}}',
}

// A browser where everything works.
export function healthyEnvironment(
  overrides: Partial<DiagnosticsEnvironment> = {}
): DiagnosticsEnvironment {
  return {
    version: "0.3.0",
    buildSha: "abc1234",
    appUrl: "https://crikket.example.test",
    probeApi: () => Promise.resolve(okEcho),
    probeSession: () => Promise.resolve(signedInEcho),
    missingApis: () => [],
    probeStorage: () => Promise.resolve(),
    getLastCapture: () => Promise.resolve({ screenshot: 1_700_000_000_000 }),
    listErrors: () => Promise.resolve([]),
    ...overrides,
  }
}
