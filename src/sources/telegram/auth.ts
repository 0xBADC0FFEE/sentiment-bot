import "dotenv/config"
import { TelegramClient } from "telegram"
import { StringSession } from "telegram/sessions/index.js"
import qrcode from "qrcode-terminal"
import readline from "readline"

const apiId = Number(process.env.TG_API_ID!)
const apiHash = process.env.TG_API_HASH!

if (!apiId || !apiHash) {
  console.error("TG_API_ID or TG_API_HASH missing in .env")
  process.exit(1)
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const ask = (q: string) => new Promise<string>((resolve) => rl.question(q, resolve))

const session = new StringSession("")
const client = new TelegramClient(session, apiId, apiHash, {
  connectionRetries: 5,
})

console.log("Connecting...")
await client.connect()
console.log("Connected!\n")

const method = await ask("Login method — [1] QR code (recommended)  [2] Phone code: ")

if (method.trim() === "2") {
  await client.start({
    phoneNumber: () => ask("Phone (e.g. +1234567890): "),
    phoneCode: () => ask("Code from Telegram: "),
    password: () => ask("2FA password: "),
    onError: (err) => console.error("Error:", err.message),
  })
} else {
  console.log("\nScan the QR code with your Telegram app:")
  console.log("  Phone → Settings → Devices → Link Desktop Device\n")

  await client.signInUserWithQrCode(
    { apiId, apiHash },
    {
      qrCode: async (code) => {
        const url = `tg://login?token=${code.token.toString("base64url")}`
        qrcode.generate(url, { small: true })
        console.log(`\nExpires in ${Math.round((code.expires * 1000 - Date.now()) / 1000)}s — waiting for scan...`)
      },
      password: async (hint) => {
        return await ask(`2FA password${hint ? ` (hint: ${hint})` : ""}: `)
      },
      onError: async (err) => {
        console.error("Error:", err.message)
        return true
      },
    }
  )
}

console.log("\nAuthorized! Save this as TG_SESSION in .env:\n")
console.log(client.session.save())

await client.disconnect()
rl.close()
