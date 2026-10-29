export function getLoginUrl(appUrl: string): string {
  return new URL("/login", appUrl).toString()
}

// The share path comes from the server. One that would resolve to another
// origin (an absolute or protocol-relative URL, "/\host", javascript:) or
// cannot be parsed falls back to the web app's home page.
export function getShareUrl(appUrl: string, sharePath: string): string {
  try {
    const shareUrl = new URL(sharePath, appUrl)
    if (shareUrl.origin === new URL(appUrl).origin) {
      return shareUrl.toString()
    }
  } catch {
    // Falls back to the home page below.
  }

  return new URL("/", appUrl).toString()
}

// RPC goes through the web app's /rpc proxy: signing in sets the session cookie
// on the web app's origin, and the server's own origin may never receive it.
export function getRpcUrl(appUrl: string): string {
  return new URL("/rpc", appUrl).toString()
}
