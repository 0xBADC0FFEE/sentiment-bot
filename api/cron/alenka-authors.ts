import type { IncomingMessage, ServerResponse } from "node:http"
import { runAuthors } from "../../src/pipeline.js"

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const authHeader = req.headers.authorization
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    res.statusCode = 401
    res.end("Unauthorized")
    return
  }

  try {
    const result = await runAuthors({ onLog: console.log })
    res.setHeader("Content-Type", "application/json")
    res.end(JSON.stringify({ ok: true, ...result }))
  } catch (e) {
    console.error("Cron alenka-authors error:", e)
    res.statusCode = 500
    res.setHeader("Content-Type", "application/json")
    res.end(JSON.stringify({ error: String(e) }))
  }
}
