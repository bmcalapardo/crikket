import { handle } from "hono/vercel"
import app from "./server.mjs"

export default handle(app)
