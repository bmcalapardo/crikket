import { createEnv } from "@t3-oss/env-core"
import { appOriginSchema } from "./app-origin"

export const env = createEnv({
  clientPrefix: "VITE_",
  client: {
    VITE_APP_URL: appOriginSchema,
  },
  runtimeEnv: import.meta.env,
  emptyStringAsUndefined: true,
})
