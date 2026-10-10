import { handle } from "hono/vercel"
import { createApp } from "../src/app"

export default handle(createApp())
