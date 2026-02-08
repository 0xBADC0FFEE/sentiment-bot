import "dotenv/config"

const token = process.env.TELEGRAM_BOT_TOKEN
const url = process.env.PROD_WEBHOOK_URL

if (!token || !url) {
  console.error("Missing TELEGRAM_BOT_TOKEN or PROD_WEBHOOK_URL")
  process.exit(1)
}

const res = await fetch(
  `https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(url)}&drop_pending_updates=true`,
)
const data = await res.json()
console.log(data)
