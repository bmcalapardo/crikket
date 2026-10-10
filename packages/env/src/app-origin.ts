import { z } from "zod"

// The extension resolves absolute paths (/rpc, /login) against the app URL, so
// anything beyond the origin would be dropped without warning. Credentials in
// the URL or a non-web scheme would also be carried into every RPC request.
export const appOriginSchema = z
  .url()
  .refine(
    (value) => {
      if (!URL.canParse(value)) {
        return true // z.url() already reports it
      }
      const url = new URL(value)
      return url.pathname === "/" && !url.search && !url.hash
    },
    { message: "Must be an origin only: no path, query or hash" }
  )
  .refine(
    (value) => {
      if (!URL.canParse(value)) {
        return true
      }
      const url = new URL(value)
      return (
        (url.protocol === "https:" || url.protocol === "http:") &&
        !url.username &&
        !url.password
      )
    },
    { message: "Must be an http(s) origin without credentials" }
  )
