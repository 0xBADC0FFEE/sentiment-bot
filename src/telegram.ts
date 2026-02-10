import { Api, type InlineKeyboard, InputMediaBuilder } from "grammy"
import type { Alert, Message } from "./types.js"

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

function formatSummaryAlert(emoji: string, title: string, summary: string, sourceLabel?: string, dateRange?: { from: Date; to: Date }, itemCount?: number): string {
  const source = sourceLabel ? ` · ${sourceLabel}` : ""
  const range = dateRange ? ` · ${shortDate(dateRange.from)}–${shortDate(dateRange.to)}` : ""
  const count = itemCount ? ` · ${itemCount} сообщ.` : ""
  return `${emoji} <b>${title}</b>${source}${range}${count}\n\n${esc(summary)}`
}

export function formatTrendsSummary(summary: string, sourceLabel?: string, customPrompt?: string, dateRange?: { from: Date; to: Date }, itemCount?: number): string {
  const title = customPrompt || "Обзор трендов"
  return formatSummaryAlert("📊", title, summary, sourceLabel, dateRange, itemCount)
}

export function formatTopicsSummary(summary: string, sourceLabel?: string, dateRange?: { from: Date; to: Date }, itemCount?: number): string {
  return formatSummaryAlert("🏷️", "Обзор топиков", summary, sourceLabel, dateRange, itemCount)
}

export function formatAlert(alert: Alert): string {
  switch (alert.type) {
    case "author": return formatAuthorAlert(alert.comment)
    case "hot": return formatHotAlert(alert.comment)
    case "trends": return formatTrendsSummary(alert.summary, alert.sourceLabel, alert.customPrompt, alert.dateRange, alert.itemCount)
    case "topics": return formatTopicsSummary(alert.summary, alert.sourceLabel, alert.dateRange, alert.itemCount)
  }
}

export async function broadcast(
  api: Api,
  chatIds: string[],
  message: string,
  images?: string[],
  replyMarkup?: InlineKeyboard,
): Promise<void> {
  for (const chatId of chatIds) {
    try {
      if (images && images.length === 1) {
        await api.sendPhoto(chatId, images[0], {
          caption: message,
          parse_mode: "HTML",
        })
      } else if (images && images.length > 1) {
        const media = images.map((url, i) =>
          InputMediaBuilder.photo(url, i === 0 ? { caption: message, parse_mode: "HTML" } : {}),
        )
        await api.sendMediaGroup(chatId, media)
      } else {
        const parts = splitMessage(message)
        for (let i = 0; i < parts.length; i++) {
          const isLast = i === parts.length - 1
          await api.sendMessage(chatId, parts[i], {
            parse_mode: "HTML",
            ...(isLast && replyMarkup ? { reply_markup: replyMarkup } : {}),
          })
        }
      }
    } catch (e) {
      console.error(`Failed to send to ${chatId}:`, e)
    }
  }
}

export async function broadcastAlert(api: Api, subs: string[], alert: Alert, replyMarkup?: InlineKeyboard): Promise<void> {
  const images = alert.type === "author" || alert.type === "hot" ? alert.comment.images : undefined
  await broadcast(api, subs, formatAlert(alert), images, replyMarkup)
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
