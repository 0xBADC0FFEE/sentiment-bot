import { createProvider } from "./llm/index.js"
import { MAX_ITEMS, MIN_ITEMS, estimateTokens, getInputBudget } from "./config.js"
import type { Message } from "./types.js"
import type { Session } from "./store.js"

export interface Item {
  text: string
  author: string
  date: Date
  groupKey: string
  groupTitle: string
  replyTo?: string
  meta?: string
}

export function toItems(messages: Message[]): Item[] {
  return messages.map((m) => ({
    text: m.text,
    author: m.author,
    date: m.date,
    groupKey: m.chatId,
    groupTitle: m.chatTitle,
    replyTo: m.replyTo,
    meta: formatMeta(m),
  }))
}

function formatMeta(m: Message): string | undefined {
  if (m.reactions?.length) {
    return m.reactions.map((r) => `${r.emoji}${r.count}`).join(" ")
  }
  if (m.likes !== undefined && m.likes !== 0) {
    return m.likes > 0 ? `👍${m.likes}` : `👎${Math.abs(m.likes)}`
  }
  return undefined
}

export function groupBy(items: Item[]): Map<string, Item[]> {
  const groups = new Map<string, Item[]>()
  for (const item of items) {
    if (!groups.has(item.groupKey)) groups.set(item.groupKey, [])
    groups.get(item.groupKey)!.push(item)
  }
  return groups
}

function formatDate(date: Date): string {
  return date.toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  })
}

export function formatItems(items: Item[], tokenBudget = Infinity): { text: string; count: number } {
  const capped = items.slice(0, MAX_ITEMS)
  const groups = groupBy(capped)
  const sections: string[] = []
  let tokens = 0
  let count = 0

  outer:
  for (const [, group] of groups) {
    const header = `# ${group[0].groupTitle}`
    tokens += estimateTokens(header + "\n")
    if (tokens > tokenBudget) break
    sections.push(header)
    for (const item of group) {
      const reply = item.replyTo ? ` →${item.replyTo}` : ""
      const meta = item.meta ? ` (${item.meta})` : ""
      const text = item.text.replace(/\n+/g, " ")
      const line = `${formatDate(item.date)} | ${item.author}${reply}${meta}: "${text}"`
      tokens += estimateTokens(line + "\n")
      if (tokens > tokenBudget) break outer
      sections.push(line)
      count++
    }
    sections.push("")
  }

  return { text: sections.join("\n"), count }
}

// --- Prompt constants ---

export const ANALYST_SYSTEM =
  "Ты аналитик российского фондового рынка. Анализируешь сообщения с инвестиционных площадок. Пиши максимально кратко, жертвуя грамматикой ради краткости. Отвечай plain text без Markdown-разметки (без #, **, ---, ```). Используй только символы • для списков и пустые строки для разделения секций."

export const TRENDS_PROMPT =
  "Проанализируй сообщения ниже. Определи компании и тикеры из контекста обсуждений, даже если они упомянуты сокращённо или неточно.\n\n{data}\n\nНапиши краткий обзор (2-3 предложения об общем настроении на рынке), затем тезисы по компаниям:\n• Компания (ТИКЕР) — настроение — краткий тезис\n\nФормат: plain text, без Markdown. Максимум 15 тезисов.\n\nЕсли значимых трендов нет, ответь: НЕТ ТРЕНДОВ"

export function buildTopicsPrompt(topics: string[]): string {
  const topicList = topics.map((t) => `• ${t}`).join("\n")
  return `Сообщения:\n\n{data}\n\nИнтересующие топики:\n${topicList}\n\nЗадача: для каждого топика собери всё, что обсуждают в сообщениях. Каждый топик может содержать несколько ключевых слов через запятую — это синонимы одного топика. Ищи широко — любые формы слов, сокращения, сленг, косвенные упоминания.\n\nДля каждого найденного топика выведи 2-3 тезиса по 1-3 предложения. Пиши максимально кратко, жертвуя грамматикой ради краткости.\n\nФормат:\nНАЗВАНИЕ ТОПИКА\n• тезис\n• тезис\n\nПропусти топик только если он вообще никак не упоминается. Если ни один топик не найден, ответь: НЕТ ДАННЫХ`
}

// --- Unified analyze ---

export interface AnalysisResult {
  text: string
  itemCount: number
  session: Session
}

export async function analyze(
  items: Item[],
  opts: { system?: string; prompt: string },
): Promise<AnalysisResult | null> {
  if (items.length < MIN_ITEMS) return null

  const system = opts.system ?? ANALYST_SYSTEM
  const budget = getInputBudget() - estimateTokens(system) - estimateTokens(opts.prompt)
  const formatted = formatItems(items, budget)

  const userMessage = opts.prompt.replace("{data}", formatted.text)

  const llm = createProvider()
  const text = await llm.complete(system, userMessage, 4096)

  if (text.includes("НЕТ ТРЕНДОВ") || text.includes("НЕТ ДАННЫХ")) return null

  return {
    text,
    itemCount: formatted.count,
    session: {
      system,
      messages: [
        { role: "user", content: userMessage },
        { role: "assistant", content: text },
      ],
    },
  }
}

// --- Follow-up ---

export async function followUp(
  session: Session,
  userMessage: string,
): Promise<{ text: string; session: Session }> {
  const messages = [...session.messages, { role: "user" as const, content: userMessage }]

  const llm = createProvider()
  const text = await llm.chat(session.system, messages, 4096)

  messages.push({ role: "assistant", content: text })

  return { text, session: { system: session.system, messages } }
}
