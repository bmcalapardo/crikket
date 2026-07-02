import { randomUUID } from "node:crypto"
import { sendEmailVerificationOtpStrictProcedure } from "@crikket/auth/procedures/email-otp"
import { db } from "@crikket/db"
import { member } from "@crikket/db/schema/auth"
import { z } from "zod"
import { publicProcedure } from "../index"

export const authRouter = {
  sendEmailVerificationOtpStrict: sendEmailVerificationOtpStrictProcedure,

  assignOrganization: publicProcedure
    .input(z.object({ orgId: z.string() }))
    .handler(async (options) => {
      // 1. Safe extraction matching the exact object property visible in your error message
      const context = options.context

      // 2. Structural safety checks to prevent runtime failures
      if (!context.session?.user) {
        throw new Error("UNAUTHORIZED")
      }

      // 3. Drill down into the user object populated by Better Auth
      const userId = context.session.user.id

      // 4. Execute the relational mapping transaction inside your Drizzle table
      await db.insert(member).values({
        id: randomUUID(),
        organizationId: options.input.orgId, // Grab orgId safely from the validated input property
        userId,
        role: "member",
        createdAt: new Date(),
      })

      return { success: true }
    }),
}
