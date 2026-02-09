import { Bot, InputMediaBuilder } from "grammy"
import type { Alert, Message } from "./types.js"

export function createBot(token: string) {
  return new Bot(token)
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s
}

function formatDateShort(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0")
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const hours = String(d.getHours()).padStart(2, "0")
  const minutes = String(d.getMinutes()).padStart(2, "0")
  return `${day}.${month} ${hours}:${minutes}`
}

function shortDate(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0")
  const month = String(d.getMonth() + 1).padStart(2, "0")
  return `${day}.${month}`
}

function formatCommentAlert(emoji: string, c: Message): string {
  const reply = c.replyTo ? ` → ${esc(c.replyTo)}` : ""
  const likes = c.likes ? ` · ${c.likes > 0 ? `${c.likes}+` : c.likes}` : ""
  const link = c.commentUrl && c.articleTitle
    ? `<a href="${c.commentUrl}">${esc(c.articleTitle)}</a>`
    : ""
  return `${emoji} <b>${esc(c.author)}</b>${reply} · ${formatDateShort(c.date)}${likes}

"${esc(truncate(c.text, 200))}"

${link}`
}

export function formatAuthorAlert(c: Message): string {
  return formatCommentAlert("✍️", c)
}

export function formatHotAlert(c: Message): string {
  return formatCommentAlert("🔥", c)
}

export function formatTrendsSummary(summary: string, dateRange?: { from: Date; to: Date }, itemCount?: number): string {
  const range = dateRange ? ` · ${shortDate(dateRange.from)}–${shortDate(dateRange.to)}` : ""
  const count = itemCount ? ` · ${itemCount} сообщ.` : ""
  return `📊 <b>Обзор трендов</b>${range}${count}\n\n${esc(summary)}`
}

export function formatTopicsSummary(summary: string, dateRange?: { from: Date; to: Date }, itemCount?: number): string {
  const range = dateRange ? ` · ${shortDate(dateRange.from)}–${shortDate(dateRange.to)}` : ""
  const count = itemCount ? ` · ${itemCount} сообщ.` : ""
  return `🏷️ <b>Обзор топиков</b>${range}${count}\n\n${esc(summary)}`
}

export function formatAlert(alert: Alert): string {
  switch (alert.type) {
    case "author": return formatAuthorAlert(alert.comment)
    case "hot": return formatHotAlert(alert.comment)
    case "trends": return formatTrendsSummary(alert.summary, alert.dateRange, alert.itemCount)
    case "topics": return formatTopicsSummary(alert.summary, alert.dateRange, alert.itemCount)
  }
}

export async function broadcast(
  bot: Bot,
  chatIds: string[],
  message: string,
  images?: string[],
): Promise<void> {
  for (const chatId of chatIds) {
    try {
      if (images && images.length === 1) {
        await bot.api.sendPhoto(chatId, images[0], {
          caption: message,
          parse_mode: "HTML",
        })
      } else if (images && images.length > 1) {
        const media = images.map((url, i) =>
          InputMediaBuilder.photo(url, i === 0 ? { caption: message, parse_mode: "HTML" } : {}),
        )
        await bot.api.sendMediaGroup(chatId, media)
      } else {
        const parts = splitMessage(message)
        for (const part of parts) {
          await bot.api.sendMessage(chatId, part, { parse_mode: "HTML" })
        }
      }
    } catch (e) {
      console.error(`Failed to send to ${chatId}:`, e)
    }
  }
}

const TG_LIMIT = 4096

export function splitMessage(text: string): string[] {
  if (text.length <= TG_LIMIT) return [text]
  const parts: string[] = []
  let rest = text
  while (rest.length > 0) {
    if (rest.length <= TG_LIMIT) {
      parts.push(rest)
      break
    }
    let cut = rest.lastIndexOf("\n", TG_LIMIT)
    if (cut <= 0) cut = TG_LIMIT
    parts.push(rest.slice(0, cut))
    rest = rest.slice(cut).replace(/^\n/, "")
  }
  return parts
}
