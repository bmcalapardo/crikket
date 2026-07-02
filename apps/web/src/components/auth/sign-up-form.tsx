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
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { useRouter } from "nextjs-toploader/app"
import { useEffect, useMemo } from "react"
import { toast } from "sonner"
import { AuthShell } from "@/components/auth/auth-shell"
import { AUTH_MIN_PASSWORD_LENGTH, getAuthErrorMessage } from "@/lib/auth"
import {
  shouldAutoSyncOrganizationSlug,
  slugifyOrganizationName,
} from "@/lib/organization"
import {
  type RegisterOrganizationMode,
  registerFormSchema,
} from "@/lib/schema/auth"
import {
  createOrganizationAfterSignUp,
  joinOrganizationAfterSignUp,
} from "@/lib/sign-up-organization"
import { orpc } from "@/utils/orpc"

const REGISTER_ORGANIZATION_MODE_LABELS: Record<
  RegisterOrganizationMode,
  string
> = {
  join: "Join an existing organization",
  create: "Create a new organization",
}

export function SignUpForm() {
  const router = useRouter()
  const { data: session, isPending } = authClient.useSession()
  const { data: organizations = [], isPending: isOrganizationsPending } =
    useQuery(orpc.auth.listOrganizations.queryOptions())
  const defaultOrgMode = useMemo<RegisterOrganizationMode>(
    () => (organizations.length > 0 ? "join" : "create"),
    [organizations.length]
  )

  const form = useForm({
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
      orgMode: defaultOrgMode,
      orgId: "",
      orgName: "",
      orgSlug: "",
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

      try {
        if (value.orgMode === "join") {
          await joinOrganizationAfterSignUp(value.orgId)
        } else {
          await createOrganizationAfterSignUp({
            name: value.orgName,
            slug: value.orgSlug,
          })
        }
      } catch (organizationError) {
        console.error("Failed to set up organization", organizationError)
        toast.error("Account created, but failed to set up your organization.")
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

  useEffect(() => {
    form.setFieldValue("orgMode", defaultOrgMode)
  }, [defaultOrgMode, form])

  if (isPending || isOrganizationsPending) {
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
        <form.Field name="orgMode">
          {(field) => {
            const isInvalid =
              field.state.meta.isTouched && field.state.meta.errors.length > 0

            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>Organization setup</FieldLabel>
                <Select
                  onValueChange={(value) => {
                    if (value === "join" || value === "create") {
                      field.handleChange(value)
                    }
                  }}
                  value={field.state.value}
                >
                  <SelectTrigger aria-invalid={isInvalid} id={field.name}>
                    <SelectValue placeholder="Choose how to set up your organization">
                      {REGISTER_ORGANIZATION_MODE_LABELS[field.state.value]}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="join">
                      Join an existing organization
                    </SelectItem>
                    <SelectItem value="create">
                      Create a new organization
                    </SelectItem>
                  </SelectContent>
                </Select>
                {isInvalid ? (
                  <FieldError errors={field.state.meta.errors} />
                ) : null}
              </Field>
            )
          }}
        </form.Field>

        <form.Field name="orgMode">
          {(modeField) =>
            modeField.state.value === "join" ? (
              <form.Field name="orgId">
                {(field) => {
                  const isInvalid =
                    field.state.meta.isTouched &&
                    field.state.meta.errors.length > 0
                  const selectedOrganization = organizations.find(
                    (organization) => organization.id === field.state.value
                  )

                  return (
                    <Field data-invalid={isInvalid}>
                      <FieldLabel htmlFor={field.name}>
                        Department / Organization
                      </FieldLabel>
                      <Select
                        onValueChange={(value) =>
                          field.handleChange(value ?? "")
                        }
                        value={field.state.value}
                      >
                        <SelectTrigger aria-invalid={isInvalid} id={field.name}>
                          <SelectValue placeholder="Select your organization">
                            {selectedOrganization?.name}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {organizations.map((organization) => (
                            <SelectItem
                              key={organization.id}
                              value={organization.id}
                            >
                              {organization.name}
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
            ) : (
              <>
                <form.Field name="orgName">
                  {(field) => {
                    const isInvalid =
                      field.state.meta.isTouched &&
                      field.state.meta.errors.length > 0

                    return (
                      <Field data-invalid={isInvalid}>
                        <FieldLabel htmlFor={field.name}>
                          Organization name
                        </FieldLabel>
                        <Input
                          aria-invalid={isInvalid}
                          autoComplete="organization"
                          id={field.name}
                          name={field.name}
                          onBlur={field.handleBlur}
                          onChange={(event) => {
                            const nextName = event.target.value
                            const previousName = field.state.value

                            field.handleChange(nextName)

                            const currentSlug = form.getFieldValue("orgSlug")
                            if (
                              shouldAutoSyncOrganizationSlug(
                                currentSlug,
                                previousName
                              )
                            ) {
                              form.setFieldValue(
                                "orgSlug",
                                slugifyOrganizationName(nextName)
                              )
                            }
                          }}
                          placeholder="Acme Corp"
                          value={field.state.value}
                        />
                        {isInvalid ? (
                          <FieldError errors={field.state.meta.errors} />
                        ) : null}
                      </Field>
                    )
                  }}
                </form.Field>

                <form.Field name="orgSlug">
                  {(field) => {
                    const isInvalid =
                      field.state.meta.isTouched &&
                      field.state.meta.errors.length > 0

                    return (
                      <Field data-invalid={isInvalid}>
                        <FieldLabel htmlFor={field.name}>
                          Organization slug
                        </FieldLabel>
                        <Input
                          aria-invalid={isInvalid}
                          id={field.name}
                          name={field.name}
                          onBlur={field.handleBlur}
                          onChange={(event) =>
                            field.handleChange(event.target.value)
                          }
                          placeholder="acme-corp"
                          value={field.state.value}
                        />
                        {isInvalid ? (
                          <FieldError errors={field.state.meta.errors} />
                        ) : null}
                      </Field>
                    )
                  }}
                </form.Field>
              </>
            )
          }
        </form.Field>

        <form.Field name="name">
          {(field) => {
            const isInvalid =
              field.state.meta.isTouched && field.state.meta.errors.length > 0

            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>Name</FieldLabel>
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
