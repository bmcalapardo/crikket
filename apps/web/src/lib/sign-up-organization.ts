import { authClient } from "@crikket/auth/client"

import { orpc } from "@/utils/orpc"

export const joinOrganizationAfterSignUp = async (organizationId: string) => {
  await orpc.auth.assignOrganization.call({ orgId: organizationId })
  await authClient.organization.setActive({
    organizationId,
  })
}

export const createOrganizationAfterSignUp = async (input: {
  name: string
  slug: string
}) => {
  const { data, error } = await authClient.organization.create({
    name: input.name,
    slug: input.slug,
  })

  if (error) {
    throw error
  }

  if (!data?.id) {
    throw new Error("Organization was created without an id")
  }

  await authClient.organization.setActive({
    organizationId: data.id,
  })
}
