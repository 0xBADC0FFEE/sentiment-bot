import type { Source } from "../types.js"
import type { Message } from "../../types.js"
import type { Store } from "../../store.js"
import { createClient } from "./client.js"
import { getFolderChats, readMessages } from "./reader.js"

export function createTelegramSource(store: Store): Source {
  return {
    name: "telegram",
    label: "Telegram",
    displayName: "Telegram",
    iconId: "5810150084930702668",
    capabilities: ["trends", "topics"],

    async fetchMessages(since: Date): Promise<Message[]> {
      const folderName = await store.getFolder()
      if (!folderName) throw new Error("No folder configured. Use /folder <name>.")

      const client = await createClient()
      try {
        const peers = await getFolderChats(client, folderName)
        return await readMessages(client, peers, since, console.log)
      } finally {
        await client.disconnect()
      }
    },
  }
}
