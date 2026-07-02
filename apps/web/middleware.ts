// apps/web/middleware.ts
import { type NextRequest, NextResponse } from "next/server"

export async function middleware(request: NextRequest) {
  const url = request.nextUrl.clone()

  // Whitelist approach: Only these routes are accessible without an authorized corporate account
  const publicRoutes = [
    "/login",
    "/register",
    "/forgot-password",
    "/verify-email",
    "/unauthorized",
    "/s/",
  ]
  const isPublicRoute = publicRoutes.some((route) =>
    url.pathname.startsWith(route)
  )

  // If it's not a public route, treat it as strictly protected
  if (!isPublicRoute) {
    try {
      const sessionResponse = await fetch(
        new URL("/api/auth/get-session", request.url).toString(),
        {
          headers: {
            cookie: request.headers.get("cookie") || "",
          },
        }
      )

      // Better Auth returns { user, session } directly at root level
      const sessionData = await sessionResponse.json()
      const user = sessionData?.user

      // 1. If no valid user session is found, bounce to login
      if (!user) {
        url.pathname = "/login"
        return NextResponse.redirect(url)
      }

      // 2. Enforce company domain mapping
      const email = user.email
      const allowedDomain = "@medgrocer.com"

      if (!email?.endsWith(allowedDomain)) {
        url.pathname = "/unauthorized"
        return NextResponse.redirect(url)
      }
    } catch (error) {
      console.error("Middleware Authentication Check Failed:", error)
      url.pathname = "/login"
      return NextResponse.redirect(url)
    }
  }

  return NextResponse.next()
}

export const config = {
  // Protect all routes except static assets, internal Next images, favicon, and the Auth API handlers itself
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/auth).*)"],
}
