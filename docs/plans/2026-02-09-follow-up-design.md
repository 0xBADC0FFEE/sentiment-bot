# Follow-up messages: multi-turn LLM conversations

## Summary

Add ability to continue dialog with LLM after /trends or /topics analysis. Plain text messages = follow-up questions in the same context. Any command or keyboard button resets the session.

## Requirements

- 1-hour TTL session in Redis (Upstash, already integrated)
- Free text → follow-up if session exists, hint if not
- Any /command → clear session + handle normally
- Any keyboard button → clear session + handle normally
- /trends and /topics create new session after analysis
- `/trends [duration] [custom prompt]` — custom prompt replaces hardcoded one
- Max session size: ~600 KB (fits Upstash 1 MB value limit)

## Session schema (Redis)

```
key:   chat:session:{chatId}
TTL:   3600 (1 hour)
value: JSON { system: string, messages: ChatMessage[] }
```

ChatMessage = `{ role: "user" | "assistant", content: string }`

Session created after successful analyze(). Each follow-up: read → append user+assistant → write (resets TTL).

## Changes

### 1. `src/llm/types.ts`

```ts
export interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

export interface LlmProvider {
  complete(system: string, user: string, maxTokens: number): Promise<string>
  chat(system: string, messages: ChatMessage[], maxTokens: number): Promise<string>
}
```

### 2. Provider implementations (anthropic, groq, openrouter, gemini)

Each gets `chat()` method. Trivial — all APIs already support `messages[]`.

- Anthropic: `client.messages.create({ messages })` — already accepts array
- Groq/OpenRouter: `client.chat.completions.create({ messages })` — same
- Gemini: `client.models.generateContent({ contents: history })` — different format, supports history

### 3. `src/store.ts`

```ts
interface Session {
  system: string
  messages: ChatMessage[]
}

async getSession(chatId: string): Promise<Session | null>
async setSession(chatId: string, session: Session): Promise<void>  // ex: 3600
async clearSession(chatId: string): Promise<void>
```

### 4. `src/analyzer.ts`

Replace `analyzeTrends()` + `analyzeTopics()` with:

```ts
const ANALYST_SYSTEM = "Ты аналитик российского фондового рынка..."

const TRENDS_PROMPT = "Проанализируй сообщения...\n\n{data}\n\nНапиши краткий обзор..."
const TOPICS_PROMPT = "Сообщения:\n\n{data}\n\nТопики:\n{topics}\n\nЗадача:..."

interface AnalysisResult {
  text: string
  itemCount: number
  session: Session
}

// First call — analyze with data
async function analyze(items: Item[], opts: {
  system?: string   // default: ANALYST_SYSTEM
  prompt: string    // {data} replaced with formatted items
}): Promise<AnalysisResult | null>

// Follow-up — chat with history
async function followUp(session: Session, userMessage: string): Promise<{
  text: string
  session: Session  // updated with new turns
}>
```

Caller builds the prompt:
- `/trends 7d` → `analyze(items, { prompt: TRENDS_PROMPT })`
- `/trends 7d Что с нефтью?` → `analyze(items, { prompt: "Что с нефтью?\n\nДанные:\n\n{data}" })`
- `/topics 7d` → `analyze(items, { prompt: buildTopicsPrompt(topics) })`
- Free text → `followUp(session, "Подробнее про Сбер")`

### 5. `src/pipeline.ts`

Adapt `runTrends/runTopics` to use unified `analyze()`. Return session alongside result for saving.

### 6. `src/bot-commands.ts`

**Middleware** (before all command handlers):
```ts
bot.use(async (ctx, next) => {
  const text = ctx.message?.text
  if (text?.startsWith("/")) {
    await store.clearSession(ctx.chat!.id.toString())
  }
  await next()
})
```

**Keyboard button handler**: clearSession before handling action.

**Follow-up handler** (in `message:text`, when resolveButton returns null):
```ts
if (!action) {
  if (!isAdmin(ctx.from?.id)) return
  const chatId = ctx.chat.id.toString()
  const session = await store.getSession(chatId)
  if (!session) {
    return ctx.reply("Нет активного контекста. Запустите /trends или /topics.")
  }
  // follow-up
  const result = await withTyping(ctx, () => followUp(session, text))
  await store.setSession(chatId, result.session)
  await ctx.reply(result.text)
  return
}
```

**Custom prompt in /trends**:
```ts
bot.command("trends", async (ctx) => {
  const arg = ctx.match?.trim()
  const parts = arg ? arg.split(/\s+/) : []
  const durationMs = parts.length ? (parseDuration(parts[0]) ?? 86_400_000) : 86_400_000
  const customPrompt = parts.slice(1).join(" ").trim() || undefined
  await handleTrends(ctx, store, sourceName, durationMs, customPrompt)
})
```

## Unchanged files

`src/config.ts`, `src/types.ts`, `src/sources/*`, `src/keyboard.ts`, `src/telegram.ts`

## Implementation order

1. `llm/types.ts` + 4 providers (chat method)
2. `store.ts` (session CRUD)
3. `analyzer.ts` (unified analyze + followUp + exported prompt constants)
4. `pipeline.ts` (adapt to new analyze signature)
5. `bot-commands.ts` (middleware + routing + custom prompts)
