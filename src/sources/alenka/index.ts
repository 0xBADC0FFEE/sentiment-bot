import type { Source } from "../types.js"
import type { Message } from "../../types.js"
import { alenka, MAX_ITEMS } from "../../config.js"
import { Store } from "../../store.js"
import type { Comment } from "./scraper.js"
import { login, scrapeNewComments } from "./scraper.js"

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

export { auth as alenkaAuth }

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

export function createAlenkaSource(): Source {
  return {
    name: "alenka",
    label: "📡 Alenka",
    capabilities: ["trends", "topics", "authors", "hot"],

    async fetchMessages(since: Date): Promise<Message[]> {
      const store = new Store()
      const cookie = await auth(store)
      const comments = await scrapeNewComments(cookie, {
        maxComments: MAX_ITEMS,
        maxAge: since,
      })
      return comments.map(toMessage)
    },
  }
}
