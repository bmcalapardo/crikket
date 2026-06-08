import "@crikket/env/web"
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  typedRoutes: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
      {
        protocol: "http",
        hostname: "**",
      },
    ],
  },
  async rewrites() {
    const rewrites: { source: string; destination: string }[] = []

    if (process.env.NEXT_PUBLIC_SERVER_URL) {
      // Existing auth proxy
      rewrites.push({
        source: "/api/auth/:path*",
        destination: `${process.env.NEXT_PUBLIC_SERVER_URL}/api/auth/:path*`,
      })

      // New ORPC proxy
      rewrites.push({
        source: "/rpc/:path*",
        destination: `${process.env.NEXT_PUBLIC_SERVER_URL}/rpc/:path*`,
      })
    }

    if (process.env.NEXT_PUBLIC_POSTHOG_HOST) {
      rewrites.push({
        source: "/ph/:path*",
        destination: `${process.env.NEXT_PUBLIC_POSTHOG_HOST}/:path*`,
      })
    }

    return rewrites
  },
}

export default nextConfig
