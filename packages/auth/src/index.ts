import { assertHostedPaymentsConfiguration } from "@crikket/billing/service/checkout/shared"
import { assertOrganizationCanAddMembers } from "@crikket/billing/service/entitlements/organization-entitlements"
import { processPolarWebhookPayload } from "@crikket/billing/service/webhooks/process-polar-webhook-payload"
import { db } from "@crikket/db"
import * as schema from "@crikket/db/schema/auth"
import { getPolarSdkConfig } from "@crikket/env/polar"
import { env } from "@crikket/env/server"
import { checkout, polar, portal, webhooks } from "@polar-sh/better-auth"
import { Polar } from "@polar-sh/sdk"
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { APIError } from "better-auth/api"
import { admin } from "better-auth/plugins/admin"
import { emailOTP } from "better-auth/plugins/email-otp"
import { organization } from "better-auth/plugins/organization"
import {
  authRateLimitStorage,
  authSecondaryStorage,
} from "./lib/auth-secondary-storage"
import {
  sendEmailOtpEmail,
  sendEmailVerificationLinkEmail,
  sendOrganizationInvitationEmail,
} from "./lib/email/auth-emails"
import { writeAuthDebugLog } from "./lib/write-auth-debug-log"

const MINUTE = 60
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const allowedSignupDomains = env.ALLOWED_SIGNUP_DOMAINS

const isProduction = env.NODE_ENV === "production"
const trustedOrigins = Array.from(
  new Set([env.BETTER_AUTH_URL, ...env.CORS_ORIGINS])
)
const crossSubDomainCookies = env.BETTER_AUTH_COOKIE_DOMAIN
  ? {
      enabled: true,
      domain: env.BETTER_AUTH_COOKIE_DOMAIN,
    }
  : undefined

const socialProviders =
  env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? {
        google: {
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
        },
      }
    : undefined

type CheckoutProductSlug = "pro" | "pro-yearly" | "studio" | "studio-yearly"

const checkoutProducts = [
  env.POLAR_PRO_PRODUCT_ID
    ? ({ productId: env.POLAR_PRO_PRODUCT_ID, slug: "pro" } as const)
    : null,
  env.POLAR_PRO_YEARLY_PRODUCT_ID
    ? ({
        productId: env.POLAR_PRO_YEARLY_PRODUCT_ID,
        slug: "pro-yearly",
      } as const)
    : null,
  env.POLAR_STUDIO_PRODUCT_ID
    ? ({ productId: env.POLAR_STUDIO_PRODUCT_ID, slug: "studio" } as const)
    : null,
  env.POLAR_STUDIO_YEARLY_PRODUCT_ID
    ? ({
        productId: env.POLAR_STUDIO_YEARLY_PRODUCT_ID,
        slug: "studio-yearly",
      } as const)
    : null,
].filter(
  (product): product is { productId: string; slug: CheckoutProductSlug } =>
    Boolean(product)
)

const polarCheckout = checkout({
  products: checkoutProducts,
  successUrl: env.POLAR_SUCCESS_URL,
  authenticatedUsersOnly: true,
})

const polarPortal = portal()
const polarClient = new Polar(getPolarSdkConfig())

const paymentsPlugins = env.ENABLE_PAYMENTS
  ? (() => {
      assertHostedPaymentsConfiguration()

      const webhookSecret = env.POLAR_WEBHOOK_SECRET
      if (!webhookSecret) {
        throw new Error("ENABLE_PAYMENTS=true requires POLAR_WEBHOOK_SECRET")
      }

      return [
        polar({
          client: polarClient,
          createCustomerOnSignUp: env.POLAR_CREATE_CUSTOMER_ON_SIGN_UP,
          enableCustomerPortal: true,
          use: [
            polarCheckout,
            polarPortal,
            webhooks({
              secret: webhookSecret,
              onPayload: async (payload) => {
                await processPolarWebhookPayload(
                  payload as Record<string, unknown>
                )
              },
            }),
          ],
        }),
      ]
    })()
  : []

writeAuthDebugLog({
  hypothesisId: "C",
  location: "packages/auth/src/index.ts:payments-init",
  message: "auth-payments-config",
  data: {
    enablePayments: env.ENABLE_PAYMENTS,
    hasPolarAccessToken: Boolean(env.POLAR_ACCESS_TOKEN),
    createCustomerOnSignUp: env.POLAR_CREATE_CUSTOMER_ON_SIGN_UP,
    rateLimitStorage: authRateLimitStorage,
    hasUpstashConfig: Boolean(authSecondaryStorage),
    paymentsPluginCount: paymentsPlugins.length,
  },
})

export const auth = betterAuth({
  appName: "crikket",
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  ...(authSecondaryStorage ? { secondaryStorage: authSecondaryStorage } : {}),
  trustedOrigins,
  ...(socialProviders ? { socialProviders } : {}),
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          writeAuthDebugLog({
            hypothesisId: "A",
            location: "packages/auth/src/index.ts:user-create-before",
            message: "user-create-hook-start",
            data: { hasEmail: Boolean(user.email) },
          })
          await Promise.resolve()

          const email = user.email?.toLowerCase() ?? ""
          const domain = email.split("@")[1] ?? ""

          const allowAll = allowedSignupDomains.includes("*")
          if (
            !allowAll &&
            allowedSignupDomains.length > 0 &&
            !allowedSignupDomains.includes(domain)
          ) {
            throw new APIError("UNPROCESSABLE_ENTITY", {
              message: `Sign up is only available for ${allowedSignupDomains.filter((d) => d !== "*").join(", ")} domains.`,
            })
          }

          writeAuthDebugLog({
            hypothesisId: "A",
            location: "packages/auth/src/index.ts:user-create-before",
            message: "user-create-hook-finished",
            data: {
              domainAllowed: allowAll || allowedSignupDomains.includes(domain),
            },
          })
        },
        after: async () => {
          writeAuthDebugLog({
            hypothesisId: "A",
            location: "packages/auth/src/index.ts:user-create-after",
            message: "user-create-hook-after",
          })
          await Promise.resolve()
        },
      },
    },
    account: {
      create: {
        before: async (account) => {
          writeAuthDebugLog({
            hypothesisId: "A",
            location: "packages/auth/src/index.ts:account-create-before",
            message: "account-create-hook-start",
            data: { providerId: account.providerId },
          })
          await Promise.resolve()
        },
        after: async () => {
          writeAuthDebugLog({
            hypothesisId: "A",
            location: "packages/auth/src/index.ts:account-create-after",
            message: "account-create-hook-finished",
          })
          await Promise.resolve()
        },
      },
    },
    verification: {
      create: {
        before: async (verification) => {
          writeAuthDebugLog({
            hypothesisId: "B",
            location: "packages/auth/src/index.ts:verification-create-before",
            message: "verification-create-hook-start",
            data: { identifierPrefix: verification.identifier.slice(0, 8) },
          })
          await Promise.resolve()
        },
        after: async () => {
          writeAuthDebugLog({
            hypothesisId: "B",
            location: "packages/auth/src/index.ts:verification-create-after",
            message: "verification-create-hook-finished",
          })
          await Promise.resolve()
        },
      },
    },
    session: {
      create: {
        before: async () => {
          writeAuthDebugLog({
            hypothesisId: "A",
            location: "packages/auth/src/index.ts:session-create-before",
            message: "session-create-hook-start",
          })
          await Promise.resolve()
        },
        after: async () => {
          writeAuthDebugLog({
            hypothesisId: "A",
            location: "packages/auth/src/index.ts:session-create-after",
            message: "session-create-hook-finished",
          })
          await Promise.resolve()
        },
      },
    },
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmailVerificationLinkEmail({
        email: user.email,
        verificationUrl: url,
      })
    },
    sendOnSignUp: false,
    sendOnSignIn: false,
    expiresIn: DAY,
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
  },
  session: {
    expiresIn: 14 * DAY,
    updateAge: DAY,
    cookieCache: {
      enabled: true,
      maxAge: HOUR,
    },
  },
  rateLimit: {
    enabled: true,
    storage: authRateLimitStorage,
    window: MINUTE,
    max: 100,
    customRules: {
      "/sign-in/email": {
        window: MINUTE,
        max: 5,
      },
      "/sign-up/email": {
        window: MINUTE,
        max: 3,
      },
      "/email-otp/request-password-reset": {
        window: MINUTE,
        max: 5,
      },
      "/email-otp/send-verification-otp": {
        window: MINUTE,
        max: 5,
      },
      "/email-otp/reset-password": {
        window: MINUTE,
        max: 5,
      },
    },
  },
  advanced: {
    useSecureCookies: isProduction,
    ...(crossSubDomainCookies ? { crossSubDomainCookies } : {}),
    defaultCookieAttributes: {
      sameSite: isProduction ? "none" : "lax",
      secure: isProduction,
      httpOnly: true,
    },
  },
  plugins: [
    admin(),
    organization({
      sendInvitationEmail: async (data) => {
        await sendOrganizationInvitationEmail({
          email: data.email,
          invitationId: data.id,
          inviterName: data.inviter.user.name,
          organizationName: data.organization.name,
          role: data.role,
        })
      },
      organizationHooks: {
        beforeAcceptInvitation: async ({ invitation }) => {
          await assertOrganizationCanAddMembers(invitation.organizationId)
        },
        beforeCreateInvitation: async ({ invitation }) => {
          await assertOrganizationCanAddMembers(invitation.organizationId)
        },
      },
    }),
    emailOTP({
      sendVerificationOTP: async ({ email, otp, type }) => {
        const otpStartedAt = Date.now()
        writeAuthDebugLog({
          hypothesisId: "B",
          location: "packages/auth/src/index.ts:sendVerificationOTP",
          message: "otp-email-start",
          data: { type, hasEmail: Boolean(email) },
        })
        await sendEmailOtpEmail({
          email,
          otp,
          type,
        })
        writeAuthDebugLog({
          hypothesisId: "B",
          location: "packages/auth/src/index.ts:sendVerificationOTP",
          message: "otp-email-finished",
          data: { type, durationMs: Date.now() - otpStartedAt },
        })
      },
      sendVerificationOnSignUp: true,
      overrideDefaultEmailVerification: true,
      expiresIn: 10 * MINUTE,
      otpLength: 6,
      allowedAttempts: 5,
      storeOTP: "hashed",
    }),
    ...paymentsPlugins,
  ],
})
