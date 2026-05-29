import { env } from "@crikket/env/server"
import { render } from "@react-email/render"
import type { ReactElement } from "react"
import { Resend } from "resend"

import { writeAuthDebugLog } from "../write-auth-debug-log"

type SendAuthEmailInput = {
  to: string
  subject: string
  text: string
  react: ReactElement
}

const resendClient = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null
const fromEmail = env.RESEND_FROM_EMAIL
const fromName = "Crikket"

export const sendAuthEmail = async ({
  to,
  subject,
  text,
  react,
}: SendAuthEmailInput): Promise<void> => {
  const emailStartedAt = Date.now()
  writeAuthDebugLog({
    hypothesisId: "B",
    location: "packages/auth/src/lib/email/send-auth-email.ts",
    message: "resend-send-start",
    data: {
      hasResendKey: Boolean(resendClient),
      hasFromEmail: Boolean(fromEmail),
    },
  })
  if (!resendClient) {
    if (env.NODE_ENV === "production") {
      throw new Error(
        "Missing RESEND_API_KEY. Set RESEND_API_KEY in apps/server/.env."
      )
    }

    console.warn(
      `[email] Missing RESEND_API_KEY in apps/server/.env. Skipping email delivery for ${to}.`
    )

    return
  }

  if (!fromEmail) {
    throw new Error(
      "Missing RESEND_FROM_EMAIL. Set RESEND_FROM_EMAIL in apps/server/.env."
    )
  }

  const html = await render(react)

  const { error } = await resendClient.emails.send({
    from: `${fromName} <${fromEmail}>`,
    to,
    subject,
    html,
    text,
  })

  if (error) {
    throw new Error(`Failed to send auth email: ${error.message}`)
  }

  writeAuthDebugLog({
    hypothesisId: "B",
    location: "packages/auth/src/lib/email/send-auth-email.ts",
    message: "resend-send-finished",
    data: { durationMs: Date.now() - emailStartedAt },
  })
}
