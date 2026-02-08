# sentiment-bot: merge tg-invest-trends + alenka-trends

## Goal

One bot, multiple pluggable data sources, clean dynamic UI.

## Sources

Each source implements:

```typescript
type Capability = "trends" | "topics" | string  // extensible

interface Source {
  name: string                          // "telegram" | "alenka"
  label: string                         // "📡 TG" | "📡 Alenka"
  capabilities: Capability[]            // common + source-specific
  fetchMessages(since: Date): Promise<Message[]>
}
```

Common capabilities (trends, topics) handled by shared analyzer.
Source-specific (authors, hot) implemented inside source module.

## Dynamic Keyboard

Start:
```
[ 📡 TG ]  [ 📡 Alenka ]
[ ℹ️ Статус ]
```

After selecting source (e.g. Alenka):
```
[ 📊 24ч ] [ 📊 3д ] [ 📊 7д ]
[ 🏷️ 24ч ] [ 🏷️ 3д ] [ 🏷️ 7д ]
[ ✍️ Авторы ] [ 🔥 Hot ]
[ ◀️ Назад ]
```

Buttons generated dynamically from `source.capabilities`.

## Project Structure

```
sentiment-bot/
├── api/
│   ├── bot.ts
│   └── cron/
│       ├── telegram-trends.ts
│       ├── alenka-trends.ts
│       ├── alenka-authors.ts
│       └── alenka-hot.ts
├── src/
│   ├── config.ts
│   ├── types.ts
│   ├── store.ts
│   ├── analyzer.ts
│   ├── telegram.ts
│   ├── bot-commands.ts
│   ├── keyboard.ts
│   ├── pipeline.ts
│   ├── dev.ts
│   ├── llm/
│   │   ├── index.ts
│   │   ├── types.ts
│   │   ├── anthropic.ts
│   │   ├── gemini.ts
│   │   ├── groq.ts
│   │   └── openrouter.ts
│   └── sources/
│       ├── types.ts
│       ├── registry.ts
│       ├── telegram/
│       │   ├── index.ts
│       │   ├── client.ts
│       │   ├── auth.ts
│       │   └── reader.ts
│       └── alenka/
│           ├── index.ts
│           ├── scraper.ts
│           ├── authors.ts
│           └── hot.ts
```

## Pipeline

```
cron endpoint → getSource(name) → source.fetchMessages(since)
  → analyzeTrends(messages) → broadcast(subscribers)
```

Source-specific crons call source methods directly.

## Store (Redis)

```
subscribers              → set of chat IDs
user:{chatId}:source     → active source name (keyboard state)
source:telegram:folder   → folder name
source:alenka:cookie     → auth cookie (TTL 24h)
source:alenka:lastId     → last processed comment ID
topics:tracked           → set (shared across sources)
authors:tracked          → set (alenka-specific)
hot:seen                 → set (alenka-specific)
```

## Cron Endpoints

No built-in cron scheduling. All endpoints are hooks for cron-job.org.
Protected by `Authorization: Bearer $CRON_SECRET`.

## Subscriptions

All subscribers receive alerts from all sources. No per-source subscription.

## Topics

Shared across all sources. One `/topic` command manages the global list.

## Migration Plan

**Copy as-is:** llm/*, vercel.json, tsconfig.json

**Merge & refactor:**
- config.ts — combine env vars from both projects
- analyzer.ts — unified formatMessages() accepting Message[]
- telegram.ts — merge broadcast/split/format + author/hot formatters
- store.ts — new, with source namespaces
- pipeline.ts — generalized runTrends(sourceName, since), runTopics(sourceName, since)
- bot-commands.ts — rewrite with dynamic keyboard + source selection

**New:**
- sources/types.ts — Source interface
- sources/registry.ts — source lookup
- keyboard.ts — keyboard builder from capabilities
- sources/telegram/index.ts — wraps reader
- sources/alenka/index.ts — wraps scraper
