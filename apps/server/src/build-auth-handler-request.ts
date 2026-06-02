import type { Context } from "hono"

export const buildAuthHandlerRequest = async (
  context: Context
): Promise<Request> => {
  if (context.req.method !== "POST") {
    return context.req.raw
  }

  const body = await context.req.text()

  return new Request(context.req.url, {
    method: context.req.method,
    headers: context.req.raw.headers,
    body,
  })
}
