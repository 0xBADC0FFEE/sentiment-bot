import type { Bot, Context } from "grammy"
import ms from "ms"
import { hostname } from "node:os"
import type { Store } from "./store.js"
import { startKeyboard, sourceKeyboard, promptKeyboard, resolveButton, DEFAULT_DURATION_MS } from "./keyboard.js"
import { getSource, getSources } from "./sources/registry.js"
import { runTrends, runTopics, runAuthors, runHot } from "./pipeline.js"
import { followUp } from "./analyzer.js"
import { llm, telegram } from "./config.js"

function isAdmin(userId: number | undefined): boolean {
  return userId?.toString() === telegram.adminId
}

async function withTyping<T>(ctx: Context, fn: () => Promise<T>): Promise<T> {
  await ctx.replyWithChatAction("typing")
  const interval = setInterval(() => ctx.replyWithChatAction("typing").catch(() => {}), 4000)
  try {
    return await fn()
  } finally {
    clearInterval(interval)
  }
}

function parseDuration(input: string): number | undefined {
  const val = ms(input as ms.StringValue)
  return typeof val === "number" && val > 0 ? val : undefined
}

export function registerCommands(bot: Bot, store: Store) {
  // Middleware: clear session on any /command
  bot.use(async (ctx, next) => {
    const text = ctx.message?.text
    if (text?.startsWith("/")) {
      await store.clearSession(ctx.chat!.id.toString())
    }
    await next()
  })

  // /start — subscribe + show source keyboard
  bot.command("start", async (ctx) => {
    await store.addSubscriber(ctx.chat.id.toString())
    await ctx.reply("✅ Подписка оформлена.", { reply_markup: startKeyboard() })
  })

  // /folder <name> — set telegram folder (admin)
  bot.command("folder", async (ctx) => {
    if (!isAdmin(ctx.from?.id)) return ctx.reply("⛔ Только для админа.")
    const name = ctx.match?.trim()
    if (!name) {
      const current = await store.getFolder()
      return ctx.reply(current ? `📂 Текущая папка: ${current}` : "Папка не задана. /folder <имя>")
    }
    await store.setFolder(name)
    await ctx.reply(`✅ Папка: ${name}`)
  })

  // /topic [name] — toggle tracked topic or list
  bot.command("topic", async (ctx) => {
    if (!isAdmin(ctx.from?.id)) return ctx.reply("⛔ Только для админа.")
    const name = ctx.match?.trim()
    if (!name) {
      const topics = await store.getTrackedTopics()
      if (!topics.length) return ctx.reply("Нет топиков. /topic <название>")
      return ctx.reply(`🏷️ Топики:\n${topics.map((t) => `• <code>${t}</code>`).join("\n")}`, { parse_mode: "HTML" })
    }
    if (await store.isTrackedTopic(name)) {
      await store.untrackTopic(name)
      await ctx.reply(`🗑️ Топик удалён: ${name}`)
    } else {
      await store.trackTopic(name)
      await ctx.reply(`✅ Топик добавлен: ${name}`)
    }
  })

  // /follow [name] — toggle tracked author or list
  bot.command("follow", async (ctx) => {
    if (!isAdmin(ctx.from?.id)) return ctx.reply("⛔ Только для админа.")
    const name = ctx.match?.trim()
    if (!name) {
      const authors = await store.getTrackedAuthors()
      if (!authors.length) return ctx.reply("Нет авторов. /follow <имя>")
      return ctx.reply(`📝 Авторы:\n${authors.map((a) => `• <code>${a}</code>`).join("\n")}`, { parse_mode: "HTML" })
    }
    if (await store.isTrackedAuthor(name)) {
      await store.untrackAuthor(name)
      await ctx.reply(`🗑️ Больше не отслеживаю: ${name}`)
    } else {
      await store.trackAuthor(name)
      await ctx.reply(`✅ Отслеживаю: ${name}`)
    }
  })

  // /status
  bot.command("status", async (ctx) => {
    if (!isAdmin(ctx.from?.id)) return
    await handleStatus(ctx, store)
  })

  // /trends [duration] [custom prompt] — manual trigger
  bot.command("trends", async (ctx) => {
    if (!isAdmin(ctx.from?.id)) return
    const arg = ctx.match?.trim()
    const parts = arg ? arg.split(/\s+/) : []
    const durationMs = parts.length ? (parseDuration(parts[0]) ?? DEFAULT_DURATION_MS) : DEFAULT_DURATION_MS
    const customPrompt = parts.slice(1).join(" ").trim() || undefined
    const sourceName = (await store.getUserSource(ctx.chat.id.toString())) || getSources()[0].name
    await handleTrends(ctx, store, sourceName, durationMs, customPrompt)
  })

  // /topics [duration] [adhoc topic] — manual trigger
  bot.command("topics", async (ctx) => {
    if (!isAdmin(ctx.from?.id)) return
    const arg = ctx.match?.trim()
    const parts = arg ? arg.split(/\s+/) : []
    const durationMs = parts.length ? (parseDuration(parts[0]) ?? DEFAULT_DURATION_MS) : DEFAULT_DURATION_MS
    const adhocTopic = parts.slice(1).join(" ").trim() || undefined
    const sourceName = (await store.getUserSource(ctx.chat.id.toString())) || getSources()[0].name
    await handleTopics(ctx, store, sourceName, durationMs, adhocTopic)
  })

  // Inline prompt buttons
  bot.on("callback_query:data", async (ctx) => {
    if (!isAdmin(ctx.from?.id)) return ctx.answerCallbackQuery()
    const data = ctx.callbackQuery.data
    if (!data.startsWith("prompt:")) return ctx.answerCallbackQuery()

    const chatId = ctx.chat!.id.toString()
    const durationMs = await store.getPending(chatId)
    if (!durationMs) {
      await ctx.answerCallbackQuery({ text: "Сессия истекла. Выберите период заново." })
      return
    }

    await ctx.answerCallbackQuery()

    const sourceName = (await store.getUserSource(chatId)) || getSources()[0].name
    let hasSession = false
    if (data === "prompt:trends") {
      hasSession = await handleTrends(ctx, store, sourceName, durationMs)
    } else if (data === "prompt:topics") {
      hasSession = await handleTopics(ctx, store, sourceName, durationMs)
    }

    if (hasSession) {
      await store.clearPending(chatId)
    }
  })

  // Text messages: keyboard buttons or follow-up
  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text
    const action = resolveButton(text)

    // Keyboard button → clear session + handle
    if (action) {
      if (!isAdmin(ctx.from?.id)) return
      const chatId = ctx.chat.id.toString()
      await store.clearSession(chatId)

      switch (action.type) {
        case "source": {
          await store.setUserSource(chatId, action.source.name)
          await ctx.reply(`${action.source.label} выбран.`, { reply_markup: sourceKeyboard(action.source) })
          break
        }
        case "analysis": {
          await store.setPending(chatId, action.durationMs)
          const topics = await store.getTrackedTopics()
          await ctx.reply("Выберите анализ или введите свой промпт:", {
            reply_markup: promptKeyboard(topics.length > 0),
          })
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
          await store.setUserSource(chatId, "")
          await ctx.reply("Выберите источник:", { reply_markup: startKeyboard() })
          break
        }
      }
      return
    }

    // Free text → custom prompt or follow-up
    if (!isAdmin(ctx.from?.id)) return
    const chatId = ctx.chat.id.toString()

    // Pending analysis → treat text as custom prompt
    const durationMs = await store.getPending(chatId)
    if (durationMs) {
      const sourceName = (await store.getUserSource(chatId)) || getSources()[0].name
      const hasSession = await handleTrends(ctx, store, sourceName, durationMs, text)
      if (hasSession) await store.clearPending(chatId)
      return
    }

    // Existing session → follow-up
    const session = await store.getSession(chatId)
    if (!session) {
      // Source selected but no analysis yet → expect duration
      const source = await store.getUserSource(chatId)
      if (source) {
        const customDuration = parseDuration(text)
        if (customDuration) {
          await store.setPending(chatId, customDuration)
          const topics = await store.getTrackedTopics()
          await ctx.reply("Выберите анализ или введите свой промпт:", {
            reply_markup: promptKeyboard(topics.length > 0),
          })
        } else {
          // Not a duration → treat as custom prompt with default 24h
          const sourceName = source || getSources()[0].name
          const hasSession = await handleTrends(ctx, store, sourceName, DEFAULT_DURATION_MS, text)
          if (hasSession) await store.clearPending(chatId)
        }
        return
      }
      await ctx.reply("Нет активного контекста. Выберите источник.")
      return
    }

    try {
      const result = await withTyping(ctx, () => followUp(session, text))
      await store.setSession(chatId, result.session)
      await ctx.reply(result.text)
    } catch (e) {
      console.error("Follow-up error:", e)
      await ctx.reply(`❌ Ошибка: ${String(e)}`)
    }
  })
}

async function handleAnalysis(
  ctx: Context,
  store: Store,
  label: string,
  run: () => Promise<{ messages: number; sent: boolean; session?: import("./store.js").Session }>,
): Promise<boolean> {
  try {
    const chatId = ctx.chat!.id.toString()
    const result = await withTyping(ctx, run)
    if (result.session) await store.setSession(chatId, result.session)
    if (!result.sent) await ctx.reply(`ℹ️ ${result.messages} сообщений — недостаточно или нет данных.`)
    return !!result.session
  } catch (e) {
    console.error(`${label} error:`, e)
    await ctx.reply(`❌ Ошибка: ${String(e)}`)
    return false
  }
}

async function handleTrends(ctx: Context, store: Store, sourceName: string, durationMs: number, customPrompt?: string): Promise<boolean> {
  const since = new Date(Date.now() - durationMs)
  return handleAnalysis(ctx, store, "Trends", () =>
    runTrends(sourceName, { store, since, customPrompt }),
  )
}

async function handleTopics(ctx: Context, store: Store, sourceName: string, durationMs: number, adhocTopic?: string): Promise<boolean> {
  const since = new Date(Date.now() - durationMs)
  const extraTopics = adhocTopic ? [adhocTopic] : undefined
  return handleAnalysis(ctx, store, "Topics", () =>
    runTopics(sourceName, { store, since, extraTopics }),
  )
}

async function handleAuthors(ctx: Context, store: Store) {
  try {
    const result = await withTyping(ctx, () => runAuthors({ store }))
    await ctx.reply(`✅ ${result.comments} комментариев, ${result.alerts} алертов.`)
  } catch (e) {
    console.error("Authors error:", e)
    await ctx.reply(`❌ Ошибка: ${String(e)}`)
  }
}

async function handleHot(ctx: Context, store: Store) {
  try {
    const result = await withTyping(ctx, () => runHot({ store }))
    await ctx.reply(`✅ ${result.total} топ-комментариев, ${result.alerts} горячих.`)
  } catch (e) {
    console.error("Hot error:", e)
    await ctx.reply(`❌ Ошибка: ${String(e)}`)
  }
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
