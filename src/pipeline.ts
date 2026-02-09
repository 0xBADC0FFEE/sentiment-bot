import { Store } from "./store.js"
import { getSource } from "./sources/registry.js"
import { alenkaAuth, detectAuthorAlerts, detectHotAlerts, toMessage } from "./sources/alenka/index.js"
import { fetchCommentPage, parseComments, scrapeTopComments } from "./sources/alenka/scraper.js"
import { analyze, TRENDS_PROMPT, buildTopicsPrompt, toItems } from "./analyzer.js"
import type { Session } from "./store.js"
import { createBot, formatAlert, broadcast } from "./telegram.js"
import { telegram, MIN_ITEMS, MAX_ITEMS, ONE_DAY_MS } from "./config.js"
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
  onLog?: (msg: string) => void
}

function resolveOpts(opts: PipelineOpts) {
  return {
    log: opts.onLog ?? (() => {}),
    store: opts.store ?? new Store(),
    bot: createBot(opts.botToken ?? telegram.botToken),
  }
}

// --- Generic: trends for any source ---

export interface TrendsResult {
  messages: number
  sent: boolean
  session?: Session
}

export async function runTrends(sourceName: string, opts: PipelineOpts = {}): Promise<TrendsResult> {
  const { log, store, bot } = resolveOpts(opts)
  const since = opts.since ?? new Date(Date.now() - ONE_DAY_MS)
  const source = getSource(sourceName)

  log(`📥 Fetching ${source.label} messages since ${since.toISOString()}...`)
  const messages = await source.fetchMessages(since)
  log(`  ${messages.length} messages`)

  if (messages.length < MIN_ITEMS) {
    log(`  Need ≥${MIN_ITEMS}, skipping`)
    return { messages: messages.length, sent: false }
  }

  const prompt = opts.customPrompt ? `${opts.customPrompt}\n\nДанные:\n\n{data}` : TRENDS_PROMPT

  log(`🧠 Analyzing trends...`)
  const result = await analyze(toItems(messages), { prompt })

  if (!result) {
    log("  No meaningful trends")
  } else {
    const range = dateRange(messages)
    const alert: Alert = { type: "trends", summary: result.text, dateRange: range, itemCount: result.itemCount }
    const subs = await store.getSubscribers()
    log(`📢 Sending to ${subs.length} subscribers`)
    await broadcast(bot, subs, formatAlert(alert))
  }

  log("✅ Done")
  return { messages: messages.length, sent: !!result, session: result?.session }
}

// --- Generic: topics for any source ---

export interface TopicsResult {
  messages: number
  sent: boolean
  session?: Session
}

export async function runTopics(sourceName: string, opts: PipelineOpts = {}): Promise<TopicsResult> {
  const { log, store, bot } = resolveOpts(opts)
  const since = opts.since ?? new Date(Date.now() - ONE_DAY_MS)
  const source = getSource(sourceName)

  const topics = opts.extraTopics?.length ? opts.extraTopics : await store.getTrackedTopics()
  if (topics.length === 0) {
    log("❌ No topics tracked. Use /topic <name>.")
    return { messages: 0, sent: false }
  }

  log(`🏷️ Analyzing topics [${topics.join(", ")}]...`)

  log(`📥 Fetching ${source.label} messages since ${since.toISOString()}...`)
  const messages = await source.fetchMessages(since)
  log(`  ${messages.length} messages`)

  if (messages.length < MIN_ITEMS) {
    log(`  Need ≥${MIN_ITEMS}, skipping`)
    return { messages: messages.length, sent: false }
  }

  const result = await analyze(toItems(messages), { prompt: buildTopicsPrompt(topics) })

  if (!result) {
    log("  No topic data")
  } else {
    const range = dateRange(messages)
    const alert: Alert = { type: "topics", summary: result.text, dateRange: range, itemCount: result.itemCount }
    const subs = await store.getSubscribers()
    log(`📢 Sending to ${subs.length} subscribers`)
    await broadcast(bot, subs, formatAlert(alert))
  }

  log("✅ Done")
  return { messages: messages.length, sent: !!result, session: result?.session }
}

// --- Alenka-specific: authors ---

export interface AuthorsResult {
  comments: number
  alerts: number
}

const COMMENTS_PER_PAGE = 10
const START_PAGE_BUFFER = 2

export async function runAuthors(opts: PipelineOpts = {}): Promise<AuthorsResult> {
  const { log, store, bot } = resolveOpts(opts)

  log("🔑 Auth...")
  const cookie = await alenkaAuth(store)

  const page1Html = await fetchCommentPage("/comment/last/", cookie, 1)
  const page1Comments = parseComments(page1Html)
  if (page1Comments.length === 0) {
    log("  No comments found")
    return { comments: 0, alerts: 0 }
  }
  const latestId = Number(page1Comments[0].id)

  const lastId = await store.getLastId("authors")

  if (!lastId) {
    await store.setLastId("authors", String(latestId))
    log(`  Initialized lastId to ${latestId}`)
    return { comments: 0, alerts: 0 }
  }

  const lastSeenId = Number(lastId)
  if (latestId <= lastSeenId) {
    log("  No new comments")
    return { comments: 0, alerts: 0 }
  }

  const tracked = await store.getTrackedAuthors()
  const subs = await store.getSubscribers()
  log(`👤 Tracked: ${tracked.length ? tracked.join(", ") : "none"}`)

  const startPage = Math.ceil((latestId - lastSeenId) / COMMENTS_PER_PAGE) + START_PAGE_BUFFER
  log(`📥 Scraping pages ${startPage}→1 (lastId=${lastId}, latest=${latestId})...`)

  let totalComments = 0
  let totalAlerts = 0

  for (let page = startPage; page >= 1; page--) {
    const html = await fetchCommentPage("/comment/last/", cookie, page)
    const comments = parseComments(html)
    if (comments.length === 0) continue

    const fresh = comments
      .filter((c) => Number(c.id) > lastSeenId)
      .reverse()

    if (fresh.length === 0) continue
    totalComments += fresh.length

    const msgs = fresh.map(toMessage)

    const alerts = detectAuthorAlerts(msgs, tracked)
    totalAlerts += alerts.length
    for (const alert of alerts) {
      const images = alert.type === "author" ? alert.comment.images : undefined
      await broadcast(bot, subs, formatAlert(alert), images)
    }

    const pageMaxId = String(Math.max(...fresh.map((c) => Number(c.id))))
    await store.setLastId("authors", pageMaxId)

    if (alerts.length > 0) log(`  page ${page}: +${alerts.length} alerts`)
  }

  log(`  ${totalComments} comments, ${totalAlerts} alerts total`)
  log("✅ Done")
  return { comments: totalComments, alerts: totalAlerts }
}

// --- Alenka-specific: hot ---

export interface HotResult {
  total: number
  alerts: number
}

export async function runHot(opts: PipelineOpts = {}): Promise<HotResult> {
  const { log, store, bot } = resolveOpts(opts)

  log("🔑 Auth...")
  const cookie = await alenkaAuth(store)

  log("🔥 Scraping top comments...")
  const comments = await scrapeTopComments(cookie)
  log(`  ${comments.length} top comments`)

  const msgs = comments.map(toMessage)

  const seenIds = new Set<string>()
  for (const m of msgs) {
    if (await store.isHotSeen(m.id)) seenIds.add(m.id)
  }

  const alerts = detectHotAlerts(msgs, seenIds)
  for (const a of alerts) {
    if (a.type === "hot") await store.markHotSeen(a.comment.id)
  }

  log(`  ${alerts.length} hot alerts`)

  if (alerts.length > 0) {
    const subs = await store.getSubscribers()
    for (const alert of alerts) {
      const images = alert.type === "hot" ? alert.comment.images : undefined
      await broadcast(bot, subs, formatAlert(alert), images)
    }
  }

  log("✅ Done")
  return { total: msgs.length, alerts: alerts.length }
}
