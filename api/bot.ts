import type { IncomingMessage, ServerResponse } from "node:http"
import { Bot } from "grammy"
import { waitUntil } from "@vercel/functions"
import { Store } from "../src/store.js"
import { registerCommands } from "../src/bot-commands.js"

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!)
const store = new Store()
registerCommands(bot, store)

console.log("bot handler initialized")

let initPromise: Promise<void> | undefined
function ensureInit() {
  initPromise ??= bot.init()
  return initPromise
}

function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on("data", (chunk: Buffer) => chunks.push(chunk))
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()))
      } catch (e) {
        reject(e)
      }
    })
    req.on("error", reject)
  })
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const [body] = await Promise.all([parseBody(req), ensureInit()])
    res.writeHead(200).end()
    waitUntil(bot.handleUpdate(body as Parameters<typeof bot.handleUpdate>[0]))
  } catch (e) {
    console.error("Bot webhook error:", e)
    res.writeHead(200).end()
  }
}
