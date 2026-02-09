# Sentiment Bot

[Русская версия](README.ru.md)

Multi-source investment sentiment analyzer. Scrapes [Alenka.Capital](https://alenka.capital) comments and monitors Telegram folders, then uses LLM to detect trends, analyze topics, and alert on tracked authors. Runs as a Telegram bot on Vercel serverless.

## Features

- **Trends** — LLM-powered market sentiment summary with ticker extraction
- **Topics** — targeted analysis of tracked topics (e.g. "Газпром", "ставка ЦБ")
- **Author alerts** — real-time notifications when tracked authors comment
- **Hot comments** — alerts for high-engagement comments (15+ likes)
- **Follow-up chat** — ask follow-up questions about analysis results (1h session, stored in Redis)
- **Custom prompts** — `/trends 7d Что с нефтью?` sends custom question over the data
- **Multi-provider LLM** — Anthropic, Gemini, Groq, OpenRouter via single `LLM_MODEL` env var
- **Editable prompts** — system/trends/topics prompts live in `prompts/*.md`

## Data Sources

| Source | What | Capabilities |
|--------|------|--------------|
| Alenka.Capital | Article comments via scraping | trends, topics, authors, hot |
| Telegram | Messages from monitored folder via MTProto | trends, topics |

## Quick Start

```bash
cp .env.example .env
# Fill in required env vars (see below)

npm install
npm run dev:bot    # Local polling mode
```

### Deploy to Vercel

Push to `main` — Vercel auto-deploys. Set env vars in project settings.

Cron jobs (in `vercel.json`):
- `/api/cron/alenka-trends` — daily trends
- `/api/cron/telegram-trends` — daily trends
- `/api/cron/alenka-authors` — every 1-2h
- `/api/cron/alenka-hot` — every 30m-1h

## Environment Variables

```bash
# Required
TELEGRAM_BOT_TOKEN=         # From @BotFather
TELEGRAM_ADMIN_ID=          # Your Telegram user ID
KV_REST_API_URL=            # Upstash Redis URL
KV_REST_API_TOKEN=          # Upstash Redis token

# Alenka source
ALENKA_LOGIN=
ALENKA_PASSWORD=

# Telegram source (MTProto)
TG_API_ID=                  # From my.telegram.org
TG_API_HASH=
TG_SESSION=                 # Generate: npm run auth

# LLM (default: anthropic://claude-haiku-4-5-20251001)
LLM_MODEL=                  # {provider}://{model}
ANTHROPIC_API_KEY=          # Only active provider key needed
GEMINI_API_KEY=
GROQ_API_KEY=
OPENROUTER_API_KEY=

# Vercel
CRON_SECRET=                # Auth for cron endpoints
PROD_WEBHOOK_URL=           # Restored after dev:bot exits
```

## Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Subscribe to alerts |
| `/trends [duration] [prompt]` | Analyze trends (default 24h). Optional custom prompt |
| `/topics [duration] [topic]` | Analyze tracked topics. Optional ad-hoc topic |
| `/topic <name>` | Add/remove tracked topic |
| `/follow <name>` | Add/remove tracked author |
| `/folder <name>` | Set Telegram folder to monitor |
| `/status` | Show bot status |

After `/trends` or `/topics`, send free text to ask follow-up questions in the same context. Any command or button resets the session.

## LLM Providers

| URI | Context | Notes |
|-----|---------|-------|
| `anthropic://claude-haiku-4-5-20251001` | 200k | Default |
| `gemini://gemini-2.5-flash` | 1M | Free tier available |
| `groq://llama-3.3-70b-versatile` | 128k | Fast inference |
| `openrouter://deepseek/deepseek-r1-0528:free` | 164k | Free |

## [Bot Flow](FLOW.md)

## Project Structure

```
api/                    Vercel serverless handlers + cron jobs
src/
  bot-commands.ts       Telegram command handlers + follow-up routing
  analyzer.ts           LLM analysis (analyze, followUp, formatItems)
  pipeline.ts           Orchestration (runTrends, runTopics, runAuthors, runHot)
  store.ts              Upstash Redis state (subscribers, topics, sessions)
  keyboard.ts           Telegram reply keyboard
  telegram.ts           Bot utilities (broadcast, formatAlert)
  config.ts             Env config + token budgeting
  llm/                  LLM provider implementations
  sources/
    alenka/             Scraper, author/hot alert detection
    telegram/           MTProto client, folder reader
prompts/                Editable LLM prompts (system.md, trends.md, topics.md)
```

## Development

```bash
npm run dev:bot      # Bot in polling mode (auto-restores webhook on Ctrl+C)
npm run dev          # Vercel local emulator
npm run auth         # Generate Telegram session string
npm run webhook      # Restore webhook URL
npm test             # Run tests
npm run test:watch   # Watch mode
```

## Troubleshooting

**Bot not responding:** Check webhook (`curl https://api.telegram.org/bot$TOKEN/getWebhookInfo`). If empty, run `npm run webhook`.

**`dev:bot` cleared webhook:** Normal — it switches to polling. Ctrl+C restores it. Force-kill won't — run `npm run webhook`.

**Alenka auth fails:** Delete `source:alenka:cookie` key in Upstash, re-run cron.

**`TG_SESSION` expired:** Run `npm run auth`, scan QR, update `.env`.

## License

ISC
