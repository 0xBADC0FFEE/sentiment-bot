import "dotenv/config"
import { Bot } from "grammy"
import { Store } from "./store.js"
import { registerCommands, setCommandMenu } from "./bot-commands.js"
import { telegram } from "./config.js"

const bot = new Bot(telegram.botToken)
const store = new Store()
registerCommands(bot, store)

const PROD_WEBHOOK = process.env.PROD_WEBHOOK_URL ?? ""

await setCommandMenu(bot)
bot.start({
  drop_pending_updates: true,
  onStart: () => console.log("Bot running in polling mode..."),
})

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    await bot.stop()
    if (PROD_WEBHOOK) {
      await bot.api.setWebhook(PROD_WEBHOOK, { drop_pending_updates: true })
      console.log("Webhook restored:", PROD_WEBHOOK)
    }
    process.exit(0)
  })
}
