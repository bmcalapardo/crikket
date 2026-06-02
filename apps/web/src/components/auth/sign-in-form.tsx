"use client"

import { authClient } from "@crikket/auth/client"
import { env } from "@crikket/env/web"
import { Icons } from "@crikket/ui/components/icons"
import { Loader } from "@crikket/ui/components/loader"
import { Button } from "@crikket/ui/components/ui/button"
import { Field, FieldError, FieldLabel } from "@crikket/ui/components/ui/field"
import { Input } from "@crikket/ui/components/ui/input"
import { useForm } from "@tanstack/react-form"
import Link from "next/link"
import { useRouter } from "nextjs-toploader/app"
import { parseAsString, useQueryState } from "nuqs"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { AuthShell } from "@/components/auth/auth-shell"
import { getAuthErrorMessage } from "@/lib/auth"
import { loginFormSchema } from "@/lib/schema/auth"

export function SignInForm() {
  const router = useRouter()
  const [emailQuery] = useQueryState("email", parseAsString.withDefault(""))
  const [callbackUrlQuery] = useQueryState(
    "callbackURL",
    parseAsString.withDefault(env.NEXT_PUBLIC_APP_URL)
  )
  const { data: session, isPending } = authClient.useSession()
  const [isSocialSignInPending, setIsSocialSignInPending] = useState(false)
  const isGoogleAuthEnabled = env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED
  const callbackURL = useMemo(() => {
    try {
      const appUrl = new URL(env.NEXT_PUBLIC_APP_URL)
      const parsed = new URL(callbackUrlQuery, appUrl)

      if (parsed.origin !== appUrl.origin) {
        return env.NEXT_PUBLIC_APP_URL
      }

      return parsed.toString()
    } catch {
      return env.NEXT_PUBLIC_APP_URL
    }
  }, [callbackUrlQuery])

  const form = useForm({
    defaultValues: {
      email: emailQuery,
      password: "",
    },
    validators: {
      onChange: loginFormSchema,
    },
    onSubmit: async ({ value }) => {
      const result = await authClient.signIn
        .email({
          email: value.email,
          password: value.password,
          callbackURL,
        })
        .catch(() => null)

      if (!result) {
        toast.error(
          "Unable to reach the auth server. Please try again in a moment."
        )
        return
      }

      if (result.error) {
        toast.error(getAuthErrorMessage(result.error))
        return
      }

      toast.success("Signed in successfully.")
      router.push("/")
    },
  })

  useEffect(() => {
    if (isPending || !session) {
      return
    }

    router.replace("/")
  }, [router, session, isPending])

  const handleGoogleSignIn = async () => {
    setIsSocialSignInPending(true)

    const result = await authClient.signIn
      .social({
        provider: "google",
        callbackURL,
      })
      .catch(() => null)

    if (!result) {
      toast.error("Unable to reach the auth server. Please try again.")
      setIsSocialSignInPending(false)
      return
    }

    if (result.error) {
      toast.error(getAuthErrorMessage(result.error))
    }

    setIsSocialSignInPending(false)
  }

  if (isPending) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader />
      </div>
    )
  }

  if (session) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader />
      </div>
    )
  }

  return (
    <AuthShell
      description="Sign in to your account to continue"
      title="Welcome back"
    >
      {isGoogleAuthEnabled ? (
        <>
          <Button
            className="h-12 w-full font-semibold text-base shadow-sm transition-all hover:bg-muted/50 hover:shadow-md active:scale-[0.98]"
            disabled={isSocialSignInPending || form.state.isSubmitting}
            onClick={handleGoogleSignIn}
            type="button"
            variant="outline"
          >
            <Icons.google className="mr-3 h-5 w-5" />
            Continue with Google
          </Button>
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-muted border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 font-medium text-muted-foreground">
                Or continue with email
              </span>
            </div>
          </div>
        </>
      ) : null}

      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          form.handleSubmit()
        }}
      >
        <form.Field name="email">
          {(field) => {
            const isInvalid =
              field.state.meta.isTouched && field.state.meta.errors.length > 0

            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>Email</FieldLabel>
                <Input
                  aria-invalid={isInvalid}
                  autoComplete="email"
                  id={field.name}
                  name={field.name}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  placeholder="you@example.com"
                  required
                  type="email"
                  value={field.state.value}
                />
                {isInvalid ? (
                  <FieldError errors={field.state.meta.errors} />
                ) : null}
              </Field>
            )
          }}
        </form.Field>

        <form.Field name="password">
          {(field) => {
            const isInvalid =
              field.state.meta.isTouched && field.state.meta.errors.length > 0

            return (
              <Field data-invalid={isInvalid}>
                <div className="flex items-center justify-between">
                  <FieldLabel htmlFor={field.name}>Password</FieldLabel>
                  <Link
                    className="text-muted-foreground text-sm transition hover:text-foreground"
                    href="/forgot-password"
                  >
                    Forgot password?
                  </Link>
                </div>
                <Input
                  aria-invalid={isInvalid}
                  autoComplete="current-password"
                  id={field.name}
                  name={field.name}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  placeholder="••••••••"
                  required
                  type="password"
                  value={field.state.value}
                />
                {isInvalid ? (
                  <FieldError errors={field.state.meta.errors} />
                ) : null}
              </Field>
            )
          }}
        </form.Field>

        <Button
          className="h-11 w-full font-semibold"
          disabled={form.state.isSubmitting || isSocialSignInPending}
          type="submit"
        >
          {form.state.isSubmitting ? "Signing in..." : "Sign in"}
        </Button>
      </form>

      <p className="text-center text-muted-foreground text-sm">
        Don&apos;t have an account?{" "}
        <Link
          className="font-medium text-foreground hover:underline"
          href="/register"
        >
          Sign up
        </Link>
      </p>
    </AuthShell>
  )
}
