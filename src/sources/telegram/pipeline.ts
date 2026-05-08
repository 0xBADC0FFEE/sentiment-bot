import type { TelegramClient } from "telegram"
import { Api } from "telegram/tl/index.js"
import { Store, type ResolvedTgUser } from "../../store.js"
import { Api as BotApi } from "grammy"
import type { Alert } from "../../types.js"
import { telegram } from "../../config.js"
import { searchAuthorMessages as defaultSearch, type ChatContext } from "./search.js"
import { createClient as defaultCreateClient } from "./client.js"
import { broadcastAlert as defaultBroadcastAlert } from "../../telegram.js"
import {
  getFolderChats as defaultGetFolderChats,
  filterRecentPeers as defaultFilterRecentPeersImpl,
} from "./reader.js"

const DEFAULT_MAX_ALERTS = 10
const DELAY_MIN = 100
const DELAY_MAX = 500

const randomDelay = () =>
  new Promise<void>((r) => setTimeout(r, DELAY_MIN + Math.random() * (DELAY_MAX - DELAY_MIN)))

export interface ResolvedAuthor {
  username: string
  resolved: ResolvedTgUser
}

export interface CollectDeps {
  client: TelegramClient
  peers: Api.TypeInputPeer[]
  resolvedAuthors: ResolvedAuthor[]
  lastTs: number
  maxAlerts: number
  search?: typeof defaultSearch
  resolveContext?: (client: TelegramClient, peer: Api.TypeInputPeer) => Promise<ChatContext>
  delay?: () => Promise<void>
  log?: (msg: string) => void
}

export interface CollectResult {
  alerts: Alert[]
  newLastTs: number
  evictions: string[]
}

export async function collectAuthorAlerts(deps: CollectDeps): Promise<CollectResult> {
  const { client, peers, resolvedAuthors, lastTs, maxAlerts } = deps
  const search = deps.search ?? defaultSearch
  const resolveContext = deps.resolveContext ?? defaultResolveContext
  const delay = deps.delay ?? randomDelay
  const log = deps.log ?? (() => {})

  const alerts: Alert[] = []
  let runningMax = lastTs
  const evictions: string[] = []

  for (const peer of peers) {
    if (peer instanceof Api.InputPeerUser) continue
    let ctx: ChatContext
    try {
      ctx = await resolveContext(client, peer)
    } catch (e) {
      log(`  resolveContext failed: ${e}`)
      continue
    }
    for (const author of resolvedAuthors) {
      if (alerts.length >= maxAlerts) break
      await delay()
      try {
        const result = await search(client, peer, author.resolved, lastTs, ctx, `@${author.username}`)
        for (const m of result.messages) {
          if (alerts.length >= maxAlerts) break
          alerts.push({ type: "author", comment: m })
        }
        if (result.newLastTs > runningMax) runningMax = result.newLastTs
      } catch (e) {
        const errMsg = String(e)
        if (errMsg.includes("PEER_ID_INVALID") || errMsg.includes("USER_DEACTIVATED")) {
          if (!evictions.includes(author.username)) evictions.push(author.username)
        } else {
          log(`  search failed for @${author.username}: ${e}`)
        }
      }
    }
    if (alerts.length >= maxAlerts) break
  }

  return { alerts, newLastTs: runningMax, evictions }
}

async function defaultResolveContext(
  client: TelegramClient,
  peer: Api.TypeInputPeer,
): Promise<ChatContext> {
  const entity = await client.getEntity(peer)
  const chatId = "id" in entity ? String(entity.id) : "unknown"
  const chatTitle =
    ("title" in entity ? entity.title : undefined) ??
    ("firstName" in entity ? entity.firstName : undefined) ??
    chatId
  const chatUsername = "username" in entity ? entity.username ?? undefined : undefined
  return { chatId, chatTitle, chatUsername }
}

export interface TelegramAuthorsOpts {
  store?: Store
  api?: BotApi
  maxAlerts?: number
  createClient?: () => Promise<TelegramClient>
  collect?: typeof collectAuthorAlerts
  getFolderChats?: (client: TelegramClient, folder: string) => Promise<Api.TypeInputPeer[]>
  filterRecentPeers?: (
    client: TelegramClient,
    peers: Api.TypeInputPeer[],
    sinceTs: number,
  ) => Promise<Api.TypeInputPeer[]>
  broadcastAlert?: typeof defaultBroadcastAlert
}

export interface TelegramAuthorsResult {
  alerts: number
}

export async function runTelegramAuthors(
  opts: TelegramAuthorsOpts = {},
): Promise<TelegramAuthorsResult> {
  const store = opts.store ?? new Store()
  const tracked = await store.getTrackedAuthors("telegram")
  if (tracked.length === 0) return { alerts: 0 }

  const lastTs = await store.getTgAuthorsLastTs()
  if (lastTs == null) {
    await store.setTgAuthorsLastTs(Math.floor(Date.now() / 1000))
    return { alerts: 0 }
  }

  const folder = await store.getFolder()
  if (!folder) throw new Error("No folder configured. Use /folder <name>.")

  const api = opts.api ?? new BotApi(telegram.botToken)
  const maxAlerts = opts.maxAlerts ?? DEFAULT_MAX_ALERTS
  const createClient = opts.createClient ?? defaultCreateClient
  const collect = opts.collect ?? collectAuthorAlerts
  const getFolderChats = opts.getFolderChats ?? defaultGetFolderChats
  const filterRecentPeers = opts.filterRecentPeers ?? defaultFilterRecentPeers
  const broadcastAlert = opts.broadcastAlert ?? defaultBroadcastAlert

  const client = await createClient()
  try {
    const resolvedAuthors = await resolveAllAuthors(store, client, tracked)
    if (resolvedAuthors.length === 0) return { alerts: 0 }

    const peers = await getFolderChats(client, folder)
    const active = await filterRecentPeers(client, peers, lastTs * 1000)

    const result = await collect({
      client,
      peers: active,
      resolvedAuthors,
      lastTs,
      maxAlerts,
    })

    for (const username of result.evictions) {
      await store.deleteResolvedTgUser(username)
    }

    if (result.alerts.length > 0) {
      const subs = await store.getSubscribers()
      for (const alert of result.alerts) {
        await broadcastAlert(api, subs, alert)
      }
    }

    await store.setTgAuthorsLastTs(result.newLastTs)
    return { alerts: result.alerts.length }
  } finally {
    await client.disconnect()
  }
}

async function resolveAllAuthors(
  store: Store,
  client: TelegramClient,
  usernames: string[],
): Promise<ResolvedAuthor[]> {
  const out: ResolvedAuthor[] = []
  for (const username of usernames) {
    const cached = await store.getResolvedTgUser(username)
    if (cached) {
      out.push({ username, resolved: cached })
      continue
    }
    try {
      const res = await client.invoke(new Api.contacts.ResolveUsername({ username }))
      const user = res.users.find((u): u is Api.User => u instanceof Api.User)
      if (user && user.accessHash !== undefined) {
        const resolved: ResolvedTgUser = {
          userId: user.id.toString(),
          accessHash: user.accessHash.toString(),
        }
        await store.setResolvedTgUser(username, resolved)
        out.push({ username, resolved })
      }
    } catch (e) {
      console.log(`  resolve @${username} failed: ${e}`)
    }
  }
  return out
}

async function defaultFilterRecentPeers(
  client: TelegramClient,
  peers: Api.TypeInputPeer[],
  sinceTs: number,
): Promise<Api.TypeInputPeer[]> {
  return defaultFilterRecentPeersImpl(client, peers, sinceTs, () => {})
}
