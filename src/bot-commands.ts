import type { Bot, Context } from "grammy"
import ms from "ms"
import { hostname } from "node:os"
import type { Store, Session } from "./store.js"
import { startKeyboard, sourceKeyboard, promptKeyboard, resolveButton, DEFAULT_DURATION_MS, type ButtonAction } from "./keyboard.js"
import { getSources } from "./sources/registry.js"
import { runTrends, runTopics, runAuthors, runHot } from "./pipeline.js"
import { followUp } from "./analyzer.js"
import { llm, telegram } from "./config.js"

const CALLBACK_PREFIX = "prompt:"
const TYPING_INTERVAL_MS = 4000
const ADMIN_DENIED = "⛔ Только для админа."

function chatId(ctx: Context): string {
  return ctx.chat!.id.toString()
}

function isAdmin(userId: number | undefined): boolean {
  return userId?.toString() === telegram.adminId
}

const adminOnly = (fn: (ctx: Context) => Promise<unknown>, reply?: string) =>
  async (ctx: Context) => {
    if (!isAdmin(ctx.from?.id)) {
      if (reply) await ctx.reply(reply)
      return
    }
    return fn(ctx)
  }

async function withTyping<T>(ctx: Context, fn: () => Promise<T>): Promise<T> {
  await ctx.replyWithChatAction("typing")
  const interval = setInterval(() => ctx.replyWithChatAction("typing").catch(() => {}), TYPING_INTERVAL_MS)
  try {
    return await fn()
  } finally {
    clearInterval(interval)
  }
}

async function resolveSource(store: Store, chat: string): Promise<string> {
  return (await store.getUserSource(chat)) || getSources()[0].name
}

function parseDuration(input: string): number | undefined {
  const val = ms(input as ms.StringValue)
  return typeof val === "number" && val > 0 ? val : undefined
}

function parseCommandArgs(raw: string | undefined): { durationMs: number; customArg: string | undefined } {
  const parts = raw?.trim().split(/\s+/).filter(Boolean) ?? []
  const durationMs = parts.length ? (parseDuration(parts[0]) ?? DEFAULT_DURATION_MS) : DEFAULT_DURATION_MS
  const customArg = parts.slice(1).join(" ").trim() || undefined
  return { durationMs, customArg }
}

async function execWithReply<T>(
  ctx: Context,
  label: string,
  run: () => Promise<T>,
  format: (r: T) => string,
): Promise<void> {
  try {
    const result = await withTyping(ctx, run)
    await ctx.reply(format(result))
  } catch (e) {
    console.error(`${label} error:`, e)
    await ctx.reply(`❌ Ошибка: ${String(e)}`)
  }
}

async function runAndReply(
  ctx: Context, store: Store, sourceName: string,
  durationMs: number, mode: "trends" | "topics", custom?: string,
): Promise<void> {
  const chat = chatId(ctx)
  const since = new Date(Date.now() - durationMs)
  const run = mode === "trends"
    ? () => runTrends(sourceName, { store, since, customPrompt: custom })
    : () => runTopics(sourceName, { store, since, extraTopics: custom ? [custom] : undefined })

  try {
    const result = await withTyping(ctx, run)
    if (result.session) {
      await store.setSession(chat, result.session)
      await store.clearPending(chat)
    }
    if (!result.sent) await ctx.reply(`ℹ️ ${result.messages} сообщений — недостаточно или нет данных.`)
  } catch (e) {
    console.error(`${mode} error:`, e)
    await ctx.reply(`❌ Ошибка: ${String(e)}`)
  }
}

function handleAuthors(ctx: Context, store: Store) {
  return execWithReply(ctx, "Authors", () => runAuthors({ store }),
    (r) => `✅ ${r.comments} комментариев, ${r.alerts} алертов.`)
}

function handleHot(ctx: Context, store: Store) {
  return execWithReply(ctx, "Hot", () => runHot({ store }),
    (r) => `✅ ${r.total} топ-комментариев, ${r.alerts} горячих.`)
}

async function handleStatus(ctx: Context, store: Store) {
  const runtime = process.env.VERCEL ? "Vercel" : `Local (${hostname()})`
  const [folder, subs, topics, authors, authorsId] = await Promise.all([
    store.getFolder(),
    store.getSubscribers(),
    store.getTrackedTopics(),
    store.getTrackedAuthors(),
    store.getLastId("authors"),
  ])
  const sourceNames = getSources().map((s) => s.label).join(", ")
  await ctx.reply(
    `ℹ️ Статус:\n• Runtime: ${runtime}\n• LLM: ${llm.uri}\n• Sources: ${sourceNames}\n• Папка TG: ${folder ?? "—"}\n• Топиков: ${topics.length}\n• Авторов: ${authors.length}\n• Authors lastId: ${authorsId ?? "—"}\n• Подписчиков: ${subs.length}`,
  )
}

async function handleStart(ctx: Context, store: Store) {
  await store.addSubscriber(chatId(ctx))
  await ctx.reply("✅ Подписка оформлена.", { reply_markup: startKeyboard() })
}

async function handleFolder(ctx: Context, store: Store) {
  const name = ctx.match?.toString().trim()
  if (!name) {
    const current = await store.getFolder()
    return ctx.reply(current ? `📂 Текущая папка: ${current}` : "Папка не задана. /folder <имя>")
  }
  await store.setFolder(name)
  await ctx.reply(`✅ Папка: ${name}`)
}

async function showAnalysisPicker(ctx: Context, store: Store, chat: string, durationMs: number): Promise<void> {
  await store.setPending(chat, durationMs)
  const topics = await store.getTrackedTopics()
  await ctx.reply("Выберите анализ или введите свой промпт:", {
    reply_markup: promptKeyboard(topics.length > 0),
  })
}

async function dispatchButton(ctx: Context, store: Store, action: NonNullable<ButtonAction>): Promise<void> {
  const chat = chatId(ctx)
  await store.clearSession(chat)

  switch (action.type) {
    case "source": {
      await store.setUserSource(chat, action.source.name)
      await ctx.reply(`${action.source.label} выбран.`, { reply_markup: sourceKeyboard(action.source) })
      break
    }
    case "analysis": {
      await showAnalysisPicker(ctx, store, chat, action.durationMs)
      break
    }
    case "authors": {
      await handleAuthors(ctx, store)
      break
    }
    case "hot": {
      await handleHot(ctx, store)
      break
    }
    case "status": {
      await handleStatus(ctx, store)
      break
    }
    case "back": {
      await store.setUserSource(chat, "")
      await ctx.reply("Выберите источник:", { reply_markup: startKeyboard() })
      break
    }
  }
}

type TextState =
  | { kind: "pending"; durationMs: number }
  | { kind: "session"; session: Session }
  | { kind: "source" }
  | { kind: "none" }

async function resolveTextState(store: Store, chat: string): Promise<TextState> {
  const durationMs = await store.getPending(chat)
  if (durationMs) return { kind: "pending", durationMs }
  const session = await store.getSession(chat)
  if (session) return { kind: "session", session }
  const source = await store.getUserSource(chat)
  if (source) return { kind: "source" }
  return { kind: "none" }
}

async function handleText(ctx: Context, store: Store, text: string): Promise<void> {
  const chat = chatId(ctx)
  const state = await resolveTextState(store, chat)

  switch (state.kind) {
    case "pending": {
      const sourceName = await resolveSource(store, chat)
      await runAndReply(ctx, store, sourceName, state.durationMs, "trends", text)
      return
    }
    case "session": {
      await execWithReply(ctx, "Follow-up",
        async () => {
          const result = await followUp(state.session, text)
          await store.setSession(chat, result.session)
          return result
        },
        (r) => r.text)
      return
    }
    case "source": {
      const customDuration = parseDuration(text)
      if (customDuration) {
        await showAnalysisPicker(ctx, store, chat, customDuration)
      } else {
        const sourceName = await resolveSource(store, chat)
        await runAndReply(ctx, store, sourceName, DEFAULT_DURATION_MS, "trends", text)
      }
      return
    }
    case "none": {
      await ctx.reply("Нет активного контекста. Выберите источник.")
    }
  }
}

interface ToggleConfig {
  title: string
  emptyMsg: string
  addMsg: (name: string) => string
  removeMsg: (name: string) => string
  getAll: () => Promise<string[]>
  isTracked: (name: string) => Promise<boolean>
  track: (name: string) => Promise<void>
  untrack: (name: string) => Promise<void>
}

function toggleCommand(store: Store, cfg: ToggleConfig) {
  return adminOnly(async (ctx: Context) => {
    const name = ctx.match?.toString().trim()
    if (!name) {
      const items = await cfg.getAll()
      if (!items.length) return ctx.reply(cfg.emptyMsg)
      return ctx.reply(`${cfg.title}:\n${items.map((t) => `• <code>${t}</code>`).join("\n")}`, { parse_mode: "HTML" })
    }
    if (await cfg.isTracked(name)) {
      await cfg.untrack(name)
      await ctx.reply(cfg.removeMsg(name))
    } else {
      await cfg.track(name)
      await ctx.reply(cfg.addMsg(name))
    }
  }, ADMIN_DENIED)
}

function analysisCommand(store: Store, mode: "trends" | "topics") {
  return adminOnly(async (ctx: Context) => {
    const { durationMs, customArg } = parseCommandArgs(ctx.match?.toString())
    const sourceName = await resolveSource(store, chatId(ctx))
    await runAndReply(ctx, store, sourceName, durationMs, mode, customArg)
  })
}

export function registerCommands(bot: Bot, store: Store) {
  bot.use(async (ctx, next) => {
    const text = ctx.message?.text
    if (text?.startsWith("/")) {
      await store.clearSession(chatId(ctx))
    }
    await next()
  })

  bot.command("start", async (ctx) => handleStart(ctx, store))
  bot.command("folder", adminOnly((ctx) => handleFolder(ctx, store), ADMIN_DENIED))

  bot.command("topic", toggleCommand(store, {
    title: "🏷️ Топики",
    emptyMsg: "Нет топиков. /topic <название>",
    addMsg: (n) => `✅ Топик добавлен: ${n}`,
    removeMsg: (n) => `🗑️ Топик удалён: ${n}`,
    getAll: () => store.getTrackedTopics(),
    isTracked: (n) => store.isTrackedTopic(n),
    track: (n) => store.trackTopic(n),
    untrack: (n) => store.untrackTopic(n),
  }))

  bot.command("follow", toggleCommand(store, {
    title: "📝 Авторы",
    emptyMsg: "Нет авторов. /follow <имя>",
    addMsg: (n) => `✅ Отслеживаю: ${n}`,
    removeMsg: (n) => `🗑️ Больше не отслеживаю: ${n}`,
    getAll: () => store.getTrackedAuthors(),
    isTracked: (n) => store.isTrackedAuthor(n),
    track: (n) => store.trackAuthor(n),
    untrack: (n) => store.untrackAuthor(n),
  }))

  bot.command("status", adminOnly(async (ctx) => handleStatus(ctx, store)))
  bot.command("trends", analysisCommand(store, "trends"))
  bot.command("topics", analysisCommand(store, "topics"))

  bot.on("callback_query:data", async (ctx) => {
    if (!isAdmin(ctx.from?.id)) return ctx.answerCallbackQuery()
    const data = ctx.callbackQuery.data
    if (!data.startsWith(CALLBACK_PREFIX)) return ctx.answerCallbackQuery()

    const chat = chatId(ctx)
    const durationMs = await store.getPending(chat)
    if (!durationMs) {
      await ctx.answerCallbackQuery({ text: "Сессия истекла. Выберите период заново." })
      return
    }

    await ctx.answerCallbackQuery()

    const mode = data.slice(CALLBACK_PREFIX.length) as "trends" | "topics"
    const sourceName = await resolveSource(store, chat)
    await runAndReply(ctx, store, sourceName, durationMs, mode)
  })

  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text
    const action = resolveButton(text)
    if (action) {
      if (!isAdmin(ctx.from?.id)) return
      return dispatchButton(ctx, store, action)
    }
    if (!isAdmin(ctx.from?.id)) return
    await handleText(ctx, store, text)
  })
}

export async function setCommandMenu(bot: Bot) {
  await bot.api.setMyCommands([
    { command: "start", description: "Запуск бота" },
    { command: "folder", description: "Папка для мониторинга TG" },
    { command: "trends", description: "Анализ трендов" },
    { command: "topic", description: "Добавить/удалить топик" },
    { command: "topics", description: "Анализ по топикам" },
    { command: "follow", description: "Отслеживать автора" },
    { command: "status", description: "Статус бота" },
  ])
}
