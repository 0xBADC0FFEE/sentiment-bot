import type { TelegramClient } from "telegram"
import { Api } from "telegram/tl/index.js"
import type { Message } from "../../types.js"
import type { ResolvedTgUser } from "../../store.js"
import { buildMessageLink } from "./link.js"

const SEARCH_LIMIT = 100
const MAX_PER_TICK = 10

export interface ChatContext {
  chatId: string
  chatTitle: string
  chatUsername?: string
}

export interface SearchResult {
  messages: Message[]
  newLastTs: number
}

function sumReactions(msg: Api.Message): number | undefined {
  const results = msg.reactions?.results
  if (!results?.length) return undefined
  return results.reduce((sum, r) => sum + r.count, 0)
}

function toMessage(msg: Api.Message, ctx: ChatContext, author: string): Message {
  return {
    id: String(msg.id),
    chatId: ctx.chatId,
    chatTitle: ctx.chatTitle,
    author,
    text: msg.message ?? "",
    date: new Date(msg.date * 1000),
    likes: sumReactions(msg),
    linkTitle: ctx.chatTitle,
    linkUrl: buildMessageLink(ctx.chatId, msg.id, ctx.chatUsername),
  }
}

export async function searchAuthorMessages(
  client: TelegramClient,
  peer: Api.TypeInputPeer,
  resolvedUser: ResolvedTgUser,
  sinceTs: number,
  ctx: ChatContext,
  authorLabel = "",
): Promise<SearchResult> {
  const fromId = new Api.InputPeerUser({
    userId: BigInt(resolvedUser.userId) as any,
    accessHash: BigInt(resolvedUser.accessHash) as any,
  })

  const res = await client.invoke(
    new Api.messages.Search({
      peer,
      fromId,
      q: "",
      filter: new Api.InputMessagesFilterEmpty(),
      minDate: sinceTs,
      maxDate: 0,
      offsetId: 0,
      addOffset: 0,
      limit: SEARCH_LIMIT,
      maxId: 0,
      minId: 0,
      hash: BigInt(0) as any,
    }),
  )

  const raw = (res as { messages: Api.Message[] }).messages.filter(
    (m): m is Api.Message => m instanceof Api.Message,
  )

  if (raw.length === 0) return { messages: [], newLastTs: sinceTs }

  const oldestFirst = [...raw].sort((a, b) => a.date - b.date)

  if (oldestFirst.length === SEARCH_LIMIT) {
    const slice = oldestFirst.slice(0, MAX_PER_TICK)
    return {
      messages: slice.map((m) => toMessage(m, ctx, authorLabel)),
      newLastTs: slice[slice.length - 1].date,
    }
  }

  return {
    messages: oldestFirst.map((m) => toMessage(m, ctx, authorLabel)),
    newLastTs: oldestFirst[oldestFirst.length - 1].date,
  }
}
