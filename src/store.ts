import { Redis } from "@upstash/redis"
import { kv } from "./config.js"
import type { ChatMessage } from "./llm/types.js"

export interface Session {
  system: string
  messages: ChatMessage[]
}

export class Store {
  private redis: Redis

  constructor(redis?: Redis) {
    this.redis =
      redis ??
      new Redis({
        url: kv.url,
        token: kv.token,
      })
  }

  // Subscribers (shared across all sources)
  async addSubscriber(chatId: string): Promise<void> {
    await this.redis.sadd("subscribers", chatId)
  }

  async removeSubscriber(chatId: string): Promise<void> {
    await this.redis.srem("subscribers", chatId)
  }

  async getSubscribers(): Promise<string[]> {
    return this.redis.smembers("subscribers")
  }

  // User active source (keyboard state)
  async setUserSource(chatId: string, source: string): Promise<void> {
    await this.redis.set(`user:${chatId}:source`, source)
  }

  async getUserSource(chatId: string): Promise<string | null> {
    return this.redis.get<string>(`user:${chatId}:source`)
  }

  // Source-namespaced: telegram folder
  async getFolder(): Promise<string | null> {
    return this.redis.get<string>("source:telegram:folder")
  }

  async setFolder(name: string): Promise<void> {
    await this.redis.set("source:telegram:folder", name)
  }

  // Source-namespaced: alenka auth cookie
  async getAuthCookie(): Promise<string | null> {
    return this.redis.get<string>("source:alenka:cookie")
  }

  async setAuthCookie(cookie: string): Promise<void> {
    await this.redis.set("source:alenka:cookie", cookie, { ex: 86400 })
  }

  // Source-namespaced: alenka lastId
  async getLastId(feature: "trends" | "authors"): Promise<string | null> {
    return this.redis.get<string>(`source:alenka:${feature}:lastId`)
  }

  async setLastId(feature: "trends" | "authors", id: string): Promise<void> {
    await this.redis.set(`source:alenka:${feature}:lastId`, id)
  }

  // Topics (shared across all sources)
  async trackTopic(name: string): Promise<void> {
    await this.redis.sadd("topics:tracked", name)
  }

  async untrackTopic(name: string): Promise<void> {
    await this.redis.srem("topics:tracked", name)
  }

  async getTrackedTopics(): Promise<string[]> {
    return this.redis.smembers("topics:tracked")
  }

  async isTrackedTopic(name: string): Promise<boolean> {
    return (await this.redis.sismember("topics:tracked", name)) === 1
  }

  // Authors (alenka-specific)
  async trackAuthor(name: string): Promise<void> {
    await this.redis.sadd("authors:tracked", name)
  }

  async untrackAuthor(name: string): Promise<void> {
    await this.redis.srem("authors:tracked", name)
  }

  async getTrackedAuthors(): Promise<string[]> {
    return this.redis.smembers("authors:tracked")
  }

  async isTrackedAuthor(name: string): Promise<boolean> {
    return (await this.redis.sismember("authors:tracked", name)) === 1
  }

  // Hot comments seen (alenka-specific, 3-day TTL per comment)
  async isHotSeen(commentId: string): Promise<boolean> {
    return (await this.redis.exists(`hot:seen:${commentId}`)) === 1
  }

  async markHotSeen(commentId: string): Promise<void> {
    await this.redis.set(`hot:seen:${commentId}`, 1, { ex: 259200 })
  }

  // Pending analysis (5-minute TTL)
  async setPending(chatId: string, durationMs: number): Promise<void> {
    await this.redis.set(`user:${chatId}:pending`, durationMs, { ex: 300 })
  }

  async getPending(chatId: string): Promise<number | null> {
    return this.redis.get<number>(`user:${chatId}:pending`)
  }

  async clearPending(chatId: string): Promise<void> {
    await this.redis.del(`user:${chatId}:pending`)
  }

  // Chat session (1-hour TTL)
  async getSession(chatId: string): Promise<Session | null> {
    return this.redis.get<Session>(`chat:session:${chatId}`)
  }

  async setSession(chatId: string, session: Session): Promise<void> {
    await this.redis.set(`chat:session:${chatId}`, session, { ex: 3600 })
  }

  async clearSession(chatId: string): Promise<void> {
    await this.redis.del(`chat:session:${chatId}`)
  }
}
