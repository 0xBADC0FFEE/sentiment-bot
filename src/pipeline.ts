import { Store } from "./store.js"
import { getSource } from "./sources/registry.js"
import { alenkaAuth, detectAuthorAlerts, detectHotAlerts, toMessage } from "./sources/alenka/index.js"
import { scrapeNewComments, scrapeTopComments } from "./sources/alenka/scraper.js"
import { analyze, TRENDS_PROMPT, buildTopicsPrompt, toItems } from "./analyzer.js"
import type { Session } from "./store.js"
import { Bot } from "grammy"
import { formatAlert, broadcast } from "./telegram.js"
import { telegram, MIN_ITEMS, ONE_DAY_MS } from "./config.js"
import type { Alert, Message } from "./types.js"

function dateRange(messages: Message[]) {
  const dates = messages.map((m) => m.date.getTime())
  return { from: new Date(Math.min(...dates)), to: new Date(Math.max(...dates)) }
}

export interface PipelineOpts {
  store?: Store
  botToken?: string
  since?: Date
  extraTopics?: string[]
  customPrompt?: string
}

function defaults(opts: PipelineOpts) {
  const store = opts.store ?? new Store()
  const bot = new Bot(opts.botToken ?? telegram.botToken)
  return { store, bot }
}

async function resolveAlenka(opts: PipelineOpts) {
  const { store, bot } = defaults(opts)
  console.log("🔑 Auth...")
  const cookie = await alenkaAuth(store)
  return { store, bot, cookie }
}

async function broadcastAlert(bot: Bot, subs: string[], alert: Alert) {
  const images = alert.type === "author" || alert.type === "hot" ? alert.comment.images : undefined
  await broadcast(bot, subs, formatAlert(alert), images)
}

// --- Generic: unified analysis (trends/topics) ---

export interface PipelineResult {
  messages: number
  sent: boolean
  session?: Session
}

async function analyzeAndBroadcast(
  alertType: "trends" | "topics",
  prompt: string,
  messages: Message[],
  store: Store,
  bot: Bot,
): Promise<PipelineResult> {
  if (messages.length < MIN_ITEMS) {
    console.log(`  Need ≥${MIN_ITEMS}, skipping`)
    return { messages: messages.length, sent: false }
  }

  console.log(`🧠 Analyzing ${alertType}...`)
  const result = await analyze(toItems(messages), { prompt })

  if (!result) {
    console.log(`  No meaningful ${alertType}`)
  } else {
    const range = dateRange(messages)
    const alert: Alert = { type: alertType, summary: result.text, dateRange: range, itemCount: result.itemCount }
    const subs = await store.getSubscribers()
    console.log(`📢 Sending to ${subs.length} subscribers`)
    await broadcastAlert(bot, subs, alert)
  }

  console.log("✅ Done")
  return { messages: messages.length, sent: !!result, session: result?.session }
}

async function fetchAndAnalyze(
  sourceName: string,
  alertType: "trends" | "topics",
  prompt: string,
  opts: PipelineOpts,
): Promise<PipelineResult> {
  const { store, bot } = defaults(opts)
  const since = opts.since ?? new Date(Date.now() - ONE_DAY_MS)
  const source = getSource(sourceName)

  console.log(`📥 Fetching ${source.label} messages since ${since.toISOString()}...`)
  const messages = await source.fetchMessages(since)
  console.log(`  ${messages.length} messages`)

  return analyzeAndBroadcast(alertType, prompt, messages, store, bot)
}

export function runTrends(sourceName: string, opts: PipelineOpts = {}): Promise<PipelineResult> {
  const prompt = opts.customPrompt ? `${opts.customPrompt}\n\nДанные:\n\n{data}` : TRENDS_PROMPT
  return fetchAndAnalyze(sourceName, "trends", prompt, opts)
}

export async function runTopics(sourceName: string, opts: PipelineOpts = {}): Promise<PipelineResult> {
  const { store } = defaults(opts)
  const topics = opts.extraTopics?.length ? opts.extraTopics : await store.getTrackedTopics()
  if (topics.length === 0) {
    console.log("❌ No topics tracked. Use /topic <name>.")
    return { messages: 0, sent: false }
  }
  console.log(`🏷️ Analyzing topics [${topics.join(", ")}]...`)
  return fetchAndAnalyze(sourceName, "topics", buildTopicsPrompt(topics), { ...opts, store })
}

// --- Alenka-specific: authors ---

export interface AuthorsResult {
  comments: number
  alerts: number
}

export async function runAuthors(opts: PipelineOpts = {}): Promise<AuthorsResult> {
  const { store, bot, cookie } = await resolveAlenka(opts)
  const lastId = await store.getLastId("authors")

  if (!lastId) {
    const [first] = await scrapeNewComments(cookie, { maxComments: 1 })
    if (!first) {
      console.log("  No comments found")
      return { comments: 0, alerts: 0 }
    }
    await store.setLastId("authors", first.id)
    console.log(`  Initialized lastId to ${first.id}`)
    return { comments: 0, alerts: 0 }
  }

  const [tracked, subs] = await Promise.all([store.getTrackedAuthors(), store.getSubscribers()])
  console.log(`👤 Tracked: ${tracked.length ? tracked.join(", ") : "none"}`)
  console.log(`📥 Scraping new comments (lastId=${lastId})...`)

  let totalComments = 0
  let totalAlerts = 0

  await scrapeNewComments(cookie, {
    lastSeenId: lastId,
    onPage: async (comments) => {
      const msgs = [...comments].reverse().map(toMessage)
      totalComments += msgs.length

      const alerts = detectAuthorAlerts(msgs, tracked)
      totalAlerts += alerts.length
      for (const alert of alerts) {
        await broadcastAlert(bot, subs, alert)
      }

      const pageMaxId = String(Math.max(...comments.map((c) => Number(c.id))))
      await store.setLastId("authors", pageMaxId)

      if (alerts.length > 0) console.log(`  +${alerts.length} alerts`)
    },
  })

  console.log(`  ${totalComments} comments, ${totalAlerts} alerts total`)
  console.log("✅ Done")
  return { comments: totalComments, alerts: totalAlerts }
}

// --- Alenka-specific: hot ---

export interface HotResult {
  total: number
  alerts: number
}

export async function runHot(opts: PipelineOpts = {}): Promise<HotResult> {
  const { store, bot, cookie } = await resolveAlenka(opts)

  console.log("🔥 Scraping top comments...")
  const comments = await scrapeTopComments(cookie)
  console.log(`  ${comments.length} top comments`)

  const msgs = comments.map(toMessage)

  const seenFlags = await Promise.all(msgs.map((m) => store.isHotSeen(m.id)))
  const seenIds = new Set(msgs.filter((_, i) => seenFlags[i]).map((m) => m.id))

  const alerts = detectHotAlerts(msgs, seenIds)
  await Promise.all(alerts.map((a) => store.markHotSeen(a.comment.id)))

  console.log(`  ${alerts.length} hot alerts`)

  if (alerts.length > 0) {
    const subs = await store.getSubscribers()
    for (const alert of alerts) {
      await broadcastAlert(bot, subs, alert)
    }
  }

  console.log("✅ Done")
  return { total: msgs.length, alerts: alerts.length }
}
