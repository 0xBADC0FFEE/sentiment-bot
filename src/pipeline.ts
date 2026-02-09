import { Store } from "./store.js"
import { getSource } from "./sources/registry.js"
import { alenkaAuth, detectAuthorAlerts, detectHotAlerts, toMessage } from "./sources/alenka/index.js"
import { scrapeNewComments, scrapeTopComments } from "./sources/alenka/scraper.js"
import { analyze, TRENDS_PROMPT, buildTopicsPrompt, toItems } from "./analyzer.js"
import type { Session } from "./store.js"
import { createBot, formatAlert, broadcast } from "./telegram.js"
import { telegram, MIN_ITEMS, ONE_DAY_MS } from "./config.js"
import type { Alert, Message } from "./types.js"
import type { Bot } from "grammy"

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

function resolveOpts(opts: PipelineOpts) {
  return {
    store: opts.store ?? new Store(),
    bot: createBot(opts.botToken ?? telegram.botToken),
  }
}

// --- Shared helpers ---

async function broadcastAlert(bot: Bot, subs: string[], alert: Alert) {
  const images = alert.type === "author" || alert.type === "hot" ? alert.comment.images : undefined
  await broadcast(bot, subs, formatAlert(alert), images)
}

// --- Generic: unified analysis (trends/topics) ---

export interface AnalysisResult {
  messages: number
  sent: boolean
  session?: Session
}

export type TrendsResult = AnalysisResult
export type TopicsResult = AnalysisResult

interface RunAnalysisOpts {
  alertType: "trends" | "topics"
  prompt: string
  messages: Message[]
  store: Store
  bot: Bot
}

async function runAnalysis(opts: RunAnalysisOpts): Promise<AnalysisResult> {
  if (opts.messages.length < MIN_ITEMS) {
    console.log(`  Need ≥${MIN_ITEMS}, skipping`)
    return { messages: opts.messages.length, sent: false }
  }

  console.log(`🧠 Analyzing ${opts.alertType}...`)
  const result = await analyze(toItems(opts.messages), { prompt: opts.prompt })

  if (!result) {
    console.log(`  No meaningful ${opts.alertType}`)
  } else {
    const range = dateRange(opts.messages)
    const alert: Alert = { type: opts.alertType, summary: result.text, dateRange: range, itemCount: result.itemCount }
    const subs = await opts.store.getSubscribers()
    console.log(`📢 Sending to ${subs.length} subscribers`)
    await broadcast(opts.bot, subs, formatAlert(alert))
  }

  console.log("✅ Done")
  return { messages: opts.messages.length, sent: !!result, session: result?.session }
}

export async function runTrends(sourceName: string, opts: PipelineOpts = {}): Promise<TrendsResult> {
  const { store, bot } = resolveOpts(opts)
  const since = opts.since ?? new Date(Date.now() - ONE_DAY_MS)
  const source = getSource(sourceName)

  console.log(`📥 Fetching ${source.label} messages since ${since.toISOString()}...`)
  const messages = await source.fetchMessages(since)
  console.log(`  ${messages.length} messages`)

  const prompt = opts.customPrompt ? `${opts.customPrompt}\n\nДанные:\n\n{data}` : TRENDS_PROMPT
  return runAnalysis({ alertType: "trends", prompt, messages, store, bot })
}

export async function runTopics(sourceName: string, opts: PipelineOpts = {}): Promise<TopicsResult> {
  const { store, bot } = resolveOpts(opts)
  const since = opts.since ?? new Date(Date.now() - ONE_DAY_MS)
  const source = getSource(sourceName)

  const topics = opts.extraTopics?.length ? opts.extraTopics : await store.getTrackedTopics()
  if (topics.length === 0) {
    console.log("❌ No topics tracked. Use /topic <name>.")
    return { messages: 0, sent: false }
  }

  console.log(`🏷️ Analyzing topics [${topics.join(", ")}]...`)
  console.log(`📥 Fetching ${source.label} messages since ${since.toISOString()}...`)
  const messages = await source.fetchMessages(since)
  console.log(`  ${messages.length} messages`)

  return runAnalysis({ alertType: "topics", prompt: buildTopicsPrompt(topics), messages, store, bot })
}

// --- Alenka-specific: authors ---

export interface AuthorsResult {
  comments: number
  alerts: number
}

export async function runAuthors(opts: PipelineOpts = {}): Promise<AuthorsResult> {
  const { store, bot } = resolveOpts(opts)

  console.log("🔑 Auth...")
  const cookie = await alenkaAuth(store)

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

  const tracked = await store.getTrackedAuthors()
  const subs = await store.getSubscribers()
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
  const { store, bot } = resolveOpts(opts)

  console.log("🔑 Auth...")
  const cookie = await alenkaAuth(store)

  console.log("🔥 Scraping top comments...")
  const comments = await scrapeTopComments(cookie)
  console.log(`  ${comments.length} top comments`)

  const msgs = comments.map(toMessage)

  const seenIds = new Set<string>()
  for (const m of msgs) {
    if (await store.isHotSeen(m.id)) seenIds.add(m.id)
  }

  const alerts = detectHotAlerts(msgs, seenIds)
  for (const a of alerts) {
    await store.markHotSeen(a.comment.id)
  }

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
