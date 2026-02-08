import "dotenv/config"
import ms from "ms"
import { writeFileSync } from "fs"
import { MAX_ITEMS, estimateTokens } from "../src/config.js"
import { getSource } from "../src/sources/registry.js"
import { formatItems, toItems } from "../src/analyzer.js"

const sourceName = process.argv[2] ?? "telegram"
const arg = process.argv[3] ?? "24h"
const duration = ms(arg as ms.StringValue)
if (!duration || duration <= 0) {
  console.error(`Invalid duration: ${arg}. Examples: 12h, 3d, 1w`)
  process.exit(1)
}

const since = new Date(Date.now() - duration)
const source = getSource(sourceName)

console.error(`Source: ${source.label}`)
console.error(`Since: ${since.toISOString()} (${arg})`)

const messages = await source.fetchMessages(since)
console.error(`${messages.length} messages total`)

if (messages.length === 0) {
  console.error("No messages found")
  process.exit(0)
}

const { text: formatted, count: promptMsgCount } = formatItems(toItems(messages))

const system =
  "Ты аналитик российского фондового рынка. Анализируешь сообщения с инвестиционных площадок. Пиши максимально кратко, жертвуя грамматикой ради краткости. Отвечай plain text без Markdown-разметки (без #, **, ---, ```). Используй только символы • для списков и пустые строки для разделения секций."

const user = `Проанализируй сообщения ниже. Определи компании и тикеры из контекста обсуждений, даже если они упомянуты сокращённо или неточно.

${formatted}

Напиши краткий обзор (2-3 предложения об общем настроении на рынке), затем тезисы по компаниям:
• Компания (ТИКЕР) — настроение — краткий тезис

Формат: plain text, без Markdown. Максимум 15 тезисов.

Если значимых трендов нет, ответь: НЕТ ТРЕНДОВ`

const systemTokensEst = estimateTokens(system)
const userTokensEst = estimateTokens(user)
const totalTokensEst = systemTokensEst + userTokensEst

const md = `# LLM Request — /trends (${source.label})

**Duration:** ${arg} (since ${since.toISOString()})
**Messages:** ${messages.length} fetched, ${promptMsgCount} in prompt (max: ${MAX_ITEMS})
**System prompt:** ~${systemTokensEst} tokens (${system.length} chars)
**User prompt:** ~${userTokensEst} tokens (${user.length} chars)
**Total input:** ~${totalTokensEst} tokens (${system.length + user.length} chars)
**Formatted messages:** ${formatted.length} chars
**Est. input cost:** $${(totalTokensEst / 1_000_000).toFixed(4)}

## System prompt

${system}

## User prompt

${user}
`

writeFileSync("claude-request.md", md)
console.error("Written to claude-request.md")
console.error(`\nStats:`)
console.error(`  Messages: ${messages.length}`)
console.error(`  Formatted: ${formatted.length} chars`)
console.error(`  Est. tokens: ~${totalTokensEst}`)
console.error(`  Est. cost: $${(totalTokensEst / 1_000_000).toFixed(4)}`)
