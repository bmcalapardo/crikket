"use client"

import { authClient } from "@crikket/auth/client"
import { env } from "@crikket/env/web"
import { Loader } from "@crikket/ui/components/loader"
import { Button } from "@crikket/ui/components/ui/button"
import { Field, FieldError, FieldLabel } from "@crikket/ui/components/ui/field"
import { Input } from "@crikket/ui/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@crikket/ui/components/ui/select"
import { useForm } from "@tanstack/react-form"
import Link from "next/link"
import { useRouter } from "nextjs-toploader/app"
import { useEffect } from "react"
import { toast } from "sonner"
import { AuthShell } from "@/components/auth/auth-shell"
import { AUTH_MIN_PASSWORD_LENGTH, getAuthErrorMessage } from "@/lib/auth"
import { registerFormSchema } from "@/lib/schema/auth"
import { orpc } from "@/utils/orpc"

interface SignUpFormProps {
  organizations: { id: string; name: string }[]
}

export function SignUpForm({ organizations }: SignUpFormProps) {
  const router = useRouter()
  const { data: session, isPending } = authClient.useSession()

  const form = useForm({
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
      orgId: "",
    },
    validators: {
      onChange: registerFormSchema,
    },
    onSubmit: async ({ value }) => {
      const result = await authClient.signUp
        .email({
          name: value.name,
          email: value.email,
          password: value.password,
          callbackURL: env.NEXT_PUBLIC_APP_URL,
        })
        .catch(() => null)

      if (!result) {
        toast.error("Unable to reach the auth server. Please try again.")
        return
      }

      if (result.error) {
        toast.error(getAuthErrorMessage(result.error))
        return
      }

      if (value.orgId) {
        try {
          await orpc.auth.assignOrganization.call({ orgId: value.orgId })
        } catch (err) {
          console.error("Failed to assign organization", err)
          toast.error("Account created, but failed to join organization.")
        }
      }

      if (result.data?.token) {
        toast.success("Account created successfully.")
        router.push("/")
        return
      }

      toast.success("Account created. Sign in to continue.")
      router.push(`/login?email=${encodeURIComponent(value.email)}`)
    },
  })

  useEffect(() => {
    if (session) {
      router.replace("/")
    }
  }, [router, session])

  if (isPending) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader />
      </div>
    )
  }

  if (session) {
    return null
  }

  return (
    <AuthShell
      description="Create your account to get started"
      title="Create account"
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          form.handleSubmit()
        }}
      >
        <form.Field name="orgId">
          {(field) => {
            const isInvalid =
              field.state.meta.isTouched && field.state.meta.errors.length > 0
            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>
                  Department / Organization
                </FieldLabel>
                <Select
                  onValueChange={(value) => field.handleChange(value ?? "")}
                  value={field.state.value}
                >
                  <SelectTrigger aria-invalid={isInvalid} id={field.name}>
                    <SelectValue placeholder="Select your organization" />
                  </SelectTrigger>
                  <SelectContent>
                    {organizations.map((org) => (
                      <SelectItem key={org.id} value={org.id}>
                        {org.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isInvalid ? (
                  <FieldError errors={field.state.meta.errors} />
                ) : null}
              </Field>
            )
          }}
        </form.Field>
        <form.Field name="name">
          {(field) => {
            const isInvalid =
              field.state.meta.isTouched && field.state.meta.errors.length > 0

            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>Department</FieldLabel>
                <Input
                  aria-invalid={isInvalid}
                  autoComplete="name"
                  id={field.name}
                  name={field.name}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  placeholder="Your name"
                  required
                  value={field.state.value}
                />
                {isInvalid ? (
                  <FieldError errors={field.state.meta.errors} />
                ) : null}
              </Field>
            )
          }}
        </form.Field>

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
                <FieldLabel htmlFor={field.name}>Password</FieldLabel>
                <Input
                  aria-invalid={isInvalid}
                  autoComplete="new-password"
                  id={field.name}
                  minLength={AUTH_MIN_PASSWORD_LENGTH}
                  name={field.name}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  placeholder="••••••••"
                  required
                  type="password"
                  value={field.state.value}
                />
                <p className="text-muted-foreground text-xs">
                  Use at least {AUTH_MIN_PASSWORD_LENGTH} characters.
                </p>
                {isInvalid ? (
                  <FieldError errors={field.state.meta.errors} />
                ) : null}
              </Field>
            )
          }}
        </form.Field>

        <form.Field name="confirmPassword">
          {(field) => {
            const isInvalid =
              field.state.meta.isTouched && field.state.meta.errors.length > 0

            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>Confirm password</FieldLabel>
                <Input
                  aria-invalid={isInvalid}
                  autoComplete="new-password"
                  id={field.name}
                  minLength={AUTH_MIN_PASSWORD_LENGTH}
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
          disabled={form.state.isSubmitting}
          type="submit"
        >
          {form.state.isSubmitting ? "Creating account..." : "Sign up"}
        </Button>
      </form>

      <p className="text-center text-muted-foreground text-sm">
        Already have an account?{" "}
        <Link
          className="font-medium text-foreground hover:underline"
          href="/login"
        >
          Sign in
        </Link>
      </p>
    </AuthShell>
  )
}
