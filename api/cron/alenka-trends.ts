import type { IncomingMessage, ServerResponse } from "node:http"
import { runTrends } from "../../src/pipeline.js"

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const authHeader = req.headers.authorization
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    res.statusCode = 401
    res.end("Unauthorized")
    return
  }

  try {
    const since = new Date(Date.now() - 86_400_000)
    const result = await runTrends("alenka", { since, onLog: console.log })
    res.setHeader("Content-Type", "application/json")
    res.end(JSON.stringify({ ok: true, ...result }))
  } catch (e) {
    console.error("Cron alenka-trends error:", e)
    res.statusCode = 500
    res.setHeader("Content-Type", "application/json")
    res.end(JSON.stringify({ error: String(e) }))
  }
}
