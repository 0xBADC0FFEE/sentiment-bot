import type { IncomingMessage, ServerResponse } from "node:http"

type CronHandler = (req: IncomingMessage, res: ServerResponse) => void

export function withCronAuth(name: string, fn: () => Promise<object>): CronHandler {
  return async (req, res) => {
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
      res.statusCode = 401
      res.end("Unauthorized")
      return
    }

    try {
      const result = await fn()
      res.setHeader("Content-Type", "application/json")
      res.end(JSON.stringify(Object.assign({ ok: true }, result)))
    } catch (e) {
      console.error(`Cron ${name} error:`, e)
      res.statusCode = 500
      res.setHeader("Content-Type", "application/json")
      res.end(JSON.stringify({ error: String(e) }))
    }
  }
}
