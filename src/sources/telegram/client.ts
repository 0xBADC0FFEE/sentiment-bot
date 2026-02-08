import { TelegramClient } from "telegram"
import { StringSession } from "telegram/sessions/index.js"
import { telegram } from "../../config.js"

const CONNECT_TIMEOUT = 15_000

export async function createClient(): Promise<TelegramClient> {
  const { apiId, apiHash, session: sessionStr } = telegram
  const session = new StringSession(sessionStr)

  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 3,
  })

  await Promise.race([
    client.connect(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("MTProto connect timeout — re-run: npm run auth")), CONNECT_TIMEOUT),
    ),
  ])
  return client
}
