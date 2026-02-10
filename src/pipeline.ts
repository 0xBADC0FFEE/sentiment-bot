import { Store } from "./store.js"
import { getSource } from "./sources/registry.js"
import { analyze, TRENDS_PROMPT, buildTopicsPrompt, toItems } from "./analyzer.js"
import type { Session } from "./store.js"
import { Api } from "grammy"
import { broadcastAlert } from "./telegram.js"
import { telegram, MIN_ITEMS, ONE_DAY_MS } from "./config.js"
import type { Alert, Message } from "./types.js"

function dateRange(messages: Message[]) {
  const dates = messages.map((m) => m.date.getTime())
  return { from: new Date(Math.min(...dates)), to: new Date(Math.max(...dates)) }
}

export interface PipelineOpts {
  store?: Store
  api?: Api
  since?: Date
  extraTopics?: string[]
  customPrompt?: string
}

function defaults(opts: PipelineOpts) {
  const store = opts.store ?? new Store()
  const api = opts.api ?? new Api(telegram.botToken)
  return { store, api }
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
  api: Api,
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
    await broadcastAlert(api, subs, alert)
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
  const { store, api } = defaults(opts)
  const since = opts.since ?? new Date(Date.now() - ONE_DAY_MS)
  const source = getSource(sourceName)

  console.log(`📥 Fetching ${source.label} messages since ${since.toISOString()}...`)
  const messages = await source.fetchMessages(since)
  console.log(`  ${messages.length} messages`)

  return analyzeAndBroadcast(alertType, prompt, messages, store, api)
}

export function runTrends(sourceName: string, opts: PipelineOpts = {}): Promise<PipelineResult> {
  const prompt = opts.customPrompt
    ? `<task>\n${opts.customPrompt}\n</task>\n\n<data>\n{data}\n</data>`
    : TRENDS_PROMPT
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
