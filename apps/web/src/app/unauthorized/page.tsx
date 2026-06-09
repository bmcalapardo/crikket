// apps/web/src/app/unauthorized/page.tsx
"use client"

import { authClient } from "@crikket/auth/client" // Adjust path based on your exact packages export[cite: 1]
import { useRouter } from "next/navigation"
import { useEffect } from "react"

export default function UnauthorizedPage() {
  const router = useRouter()

  useEffect(() => {
    // Automatically wipe the local/cookie session upon landing
    const clearInvalidSession = async () => {
      await authClient.signOut({
        fetchOptions: {
          onSuccess: () => {
            console.log("Invalid email session successfully destroyed.")
          },
        },
      })
    }

    clearInvalidSession()
  }, [])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 text-center text-foreground">
      <div className="max-w-md rounded-lg border border-destructive/20 bg-destructive/5 p-8 shadow-sm">
        <h1 className="mb-4 font-bold text-2xl text-destructive">
          Access Restricted
        </h1>
        <p className="mb-6 text-muted-foreground">
          This system is strictly reserved for internal team operations. Please
          ensure you sign in using a corporate <strong>@medgrocer.com</strong>{" "}
          email account.
        </p>

        <button
          className="w-full rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          onClick={() => router.push("/login")}
        >
          Return to Login
        </button>
      </div>
    </div>
  )
}
