import { TelegramClient } from "telegram"
import { Api } from "telegram/tl/index.js"
import type { Message } from "../../types.js"

const MAX_REACTIONS = 3

function extractReactions(msg: Api.Message): Message["reactions"] {
  const results = msg.reactions?.results
  if (!results?.length) return undefined
  const top = results
    .filter((r): r is Api.ReactionCount & { reaction: Api.ReactionEmoji } => r.reaction instanceof Api.ReactionEmoji)
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_REACTIONS)
    .map((r) => ({ emoji: r.reaction.emoticon, count: r.count }))
  return top.length ? top : undefined
}

export async function getFolderChats(
  client: TelegramClient,
  folderName: string,
): Promise<Api.TypeInputPeer[]> {
  const filters = await client.invoke(new Api.messages.GetDialogFilters())
  const folder = filters.filters.find(
    (f) => "title" in f && f.title && typeof f.title === "object" && "text" in f.title && f.title.text === folderName,
  )
  if (!folder || !("includePeers" in folder)) {
    throw new Error(`Folder "${folderName}" not found`)
  }
  const pinned = "pinnedPeers" in folder ? folder.pinnedPeers : []
  return [...pinned, ...folder.includePeers]
}

function extractAuthorName(msg: Api.Message): string {
  const s = msg.sender
  if (s instanceof Api.User) return s.username ? `@${s.username}` : s.firstName ?? `user:${s.id}`
  if (s instanceof Api.Channel) return s.username ? `@${s.username}` : s.title ?? `channel:${s.id}`
  return msg.postAuthor ?? "channel"
}

const LIMITS = [10, 20, 40, 80, 100, 200] as const
const MAX_BATCHES = 50
const DELAY_MIN = 100
const DELAY_MAX = 500

const randomDelay = () => new Promise((r) => setTimeout(r, DELAY_MIN + Math.random() * (DELAY_MAX - DELAY_MIN)))

async function readChat(
  client: TelegramClient,
  peer: Api.TypeInputPeer,
  sinceTs: number,
  log: (msg: string) => void,
): Promise<Message[]> {
  const entity = await client.getEntity(peer)
  const chatId = "id" in entity ? String(entity.id) : "unknown"
  const chatTitle =
    ("title" in entity ? entity.title : undefined) ??
    ("firstName" in entity ? entity.firstName : undefined) ??
    chatId

  if ("bot" in entity && entity.bot) {
    log(`  ${chatTitle}: skipped (bot)`)
    return []
  }

  const msgs: Message[] = []
  let offsetId = 0

  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    if (batch > 0) await randomDelay()
    const limit = LIMITS[Math.min(batch, LIMITS.length - 1)]
    const raw = await client.getMessages(entity, { limit, offsetId })

    if (raw.length === 0) break

    let batchHasNew = false
    for (const msg of raw) {
      if (!msg.date || msg.date * 1000 < sinceTs) continue
      batchHasNew = true
      if (!msg.message) continue
      msgs.push({
        id: String(msg.id),
        chatId,
        chatTitle,
        author: extractAuthorName(msg),
        text: msg.message,
        date: new Date(msg.date * 1000),
        reactions: extractReactions(msg),
      })
    }

    offsetId = raw[raw.length - 1].id
    if (!batchHasNew) break
  }

  log(`  ${chatTitle}: ${msgs.length} msgs`)
  return msgs
}

export async function readMessages(
  client: TelegramClient,
  peers: Api.TypeInputPeer[],
  since: Date,
  log: (msg: string) => void,
): Promise<Message[]> {
  const sinceTs = since.getTime()
  const all: Message[] = []

  for (const peer of peers) {
    try {
      const msgs = await readChat(client, peer, sinceTs, log)
      all.push(...msgs)
    } catch (e) {
      log(`  Error reading peer: ${e}`)
    }
  }

  return all
}
