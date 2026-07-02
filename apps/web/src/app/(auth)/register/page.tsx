import { db, organization } from "@crikket/db"
import type { Metadata } from "next"
import { SignUpForm } from "@/components/auth/sign-up-form"

export const metadata: Metadata = {
  title: "Create Account",
  description: "Create your Crikket account.",
}

export default async function RegisterPage() {
  const organizations = await db
    .select({
      id: organization.id,
      name: organization.name,
    })
    .from(organization)

  return <SignUpForm organizations={organizations} />
}
