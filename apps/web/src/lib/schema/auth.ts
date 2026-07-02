import * as z from "zod"

import { organizationFormSchema } from "@/lib/schema/organization"

export const loginFormSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
})

const registerOrganizationModes = ["join", "create"] as const

export const registerFormSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    email: z.email("Enter a valid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Confirm password is required"),
    orgMode: z.enum(registerOrganizationModes),
    orgId: z.string(),
    orgName: z.string(),
    orgSlug: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })
  .superRefine((value, context) => {
    if (value.orgMode === "join" && value.orgId.length === 0) {
      context.addIssue({
        code: "custom",
        message: "Organization is required",
        path: ["orgId"],
      })
      return
    }

    if (value.orgMode !== "create") {
      return
    }

    const organizationResult = organizationFormSchema.safeParse({
      name: value.orgName,
      slug: value.orgSlug,
    })

    if (organizationResult.success) {
      return
    }

    for (const issue of organizationResult.error.issues) {
      const fieldName = issue.path[0]
      if (fieldName === "name") {
        context.addIssue({ ...issue, path: ["orgName"] })
      }
      if (fieldName === "slug") {
        context.addIssue({ ...issue, path: ["orgSlug"] })
      }
    }
  })

export type RegisterOrganizationMode =
  (typeof registerOrganizationModes)[number]

export type RegisterFormValues = {
  name: string
  email: string
  password: string
  confirmPassword: string
  orgMode: RegisterOrganizationMode
  orgId: string
  orgName: string
  orgSlug: string
}

export const verifyEmailOtpFormSchema = z.object({
  otp: z.string().length(6, "Code must be 6 digits"),
})

export const forgotPasswordRequestSchema = z.object({
  email: z.email("Enter a valid email address"),
})

export const forgotPasswordResetSchema = z
  .object({
    email: z.email("Enter a valid email address"),
    otp: z.string().length(6, "Code must be 6 digits"),
    newPassword: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Confirm password is required"),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })
