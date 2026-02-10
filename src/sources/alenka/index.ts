import type { Source } from "../types.js"
import type { Message } from "../../types.js"
import { alenka, MAX_ITEMS } from "../../config.js"
import type { Store } from "../../store.js"
import type { Comment } from "./scraper.js"
import { AuthExpiredError, login, scrapeNewComments } from "./scraper.js"

export { detectAuthorAlerts } from "./authors.js"
export { detectHotAlerts } from "./hot.js"

async function auth(store: Store): Promise<string> {
  let cookie = await store.getAuthCookie()
  if (!cookie) {
    cookie = await login(alenka.login, alenka.password)
    await store.setAuthCookie(cookie)
  }
  return cookie
}

export async function withAuthRetry<T>(
  store: Store,
  fn: (cookie: string) => Promise<T>,
): Promise<T> {
  const cookie = await auth(store)
  try {
    return await fn(cookie)
  } catch (e) {
    if (e instanceof AuthExpiredError) {
      console.log("Cookie expired, re-authenticating...")
      await store.deleteAuthCookie()
      const fresh = await auth(store)
      return fn(fresh)
    }
    throw e
  }
}

export function toMessage(c: Comment): Message {
  return {
    id: c.id,
    chatId: c.articleUrl || "__no_group__",
    chatTitle: c.articleTitle || "Без статьи",
    author: c.author,
    text: c.text,
    date: c.date,
    replyTo: c.replyTo,
    likes: c.likes,
    images: c.images,
    articleTitle: c.articleTitle,
    articleUrl: c.articleUrl,
    commentUrl: c.commentUrl,
  }
}

export function createAlenkaSource(store: Store): Source {
  return {
    name: "alenka",
    label: "📡 Alenka",
    displayName: "Alenka",
    capabilities: ["trends", "topics", "authors", "hot"],

    async fetchMessages(since: Date): Promise<Message[]> {
      return withAuthRetry(store, async (cookie) => {
        const comments = await scrapeNewComments(cookie, {
          maxComments: MAX_ITEMS,
          maxAge: since,
        })
        return comments.map(toMessage)
      })
    },
  }
}
