import { handle } from "hono/vercel"
import app from "./_bundle/app.mjs"

export default handle(app)
