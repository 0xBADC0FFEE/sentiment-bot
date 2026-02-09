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

  private key(k: string) {
    return k
  }

  // Subscribers (shared across all sources)
  async addSubscriber(chatId: string): Promise<void> {
    await this.redis.sadd(this.key("subscribers"), chatId)
  }

  async removeSubscriber(chatId: string): Promise<void> {
    await this.redis.srem(this.key("subscribers"), chatId)
  }

  async getSubscribers(): Promise<string[]> {
    return this.redis.smembers(this.key("subscribers"))
  }

  // User active source (keyboard state)
  async setUserSource(chatId: string, source: string): Promise<void> {
    await this.redis.set(this.key(`user:${chatId}:source`), source)
  }

  async getUserSource(chatId: string): Promise<string | null> {
    return this.redis.get<string>(this.key(`user:${chatId}:source`))
  }

  // Source-namespaced: telegram folder
  async getFolder(): Promise<string | null> {
    return this.redis.get<string>(this.key("source:telegram:folder"))
  }

  async setFolder(name: string): Promise<void> {
    await this.redis.set(this.key("source:telegram:folder"), name)
  }

  // Source-namespaced: alenka auth cookie
  async getAuthCookie(): Promise<string | null> {
    return this.redis.get<string>(this.key("source:alenka:cookie"))
  }

  async setAuthCookie(cookie: string): Promise<void> {
    await this.redis.set(this.key("source:alenka:cookie"), cookie, { ex: 86400 })
  }

  // Source-namespaced: alenka lastId
  async getLastId(feature: "trends" | "authors"): Promise<string | null> {
    return this.redis.get<string>(this.key(`source:alenka:${feature}:lastId`))
  }

  async setLastId(feature: "trends" | "authors", id: string): Promise<void> {
    await this.redis.set(this.key(`source:alenka:${feature}:lastId`), id)
  }

  // Topics (shared across all sources)
  async trackTopic(name: string): Promise<void> {
    await this.redis.sadd(this.key("topics:tracked"), name)
  }

  async untrackTopic(name: string): Promise<void> {
    await this.redis.srem(this.key("topics:tracked"), name)
  }

  async getTrackedTopics(): Promise<string[]> {
    return this.redis.smembers(this.key("topics:tracked"))
  }

  async isTrackedTopic(name: string): Promise<boolean> {
    return (await this.redis.sismember(this.key("topics:tracked"), name)) === 1
  }

  // Authors (alenka-specific)
  async trackAuthor(name: string): Promise<void> {
    await this.redis.sadd(this.key("authors:tracked"), name)
  }

  async untrackAuthor(name: string): Promise<void> {
    await this.redis.srem(this.key("authors:tracked"), name)
  }

  async getTrackedAuthors(): Promise<string[]> {
    return this.redis.smembers(this.key("authors:tracked"))
  }

  async isTrackedAuthor(name: string): Promise<boolean> {
    return (await this.redis.sismember(this.key("authors:tracked"), name)) === 1
  }

  // Hot comments seen (alenka-specific, 3-day TTL per comment)
  async isHotSeen(commentId: string): Promise<boolean> {
    return (await this.redis.exists(this.key(`hot:seen:${commentId}`))) === 1
  }

  async markHotSeen(commentId: string): Promise<void> {
    await this.redis.set(this.key(`hot:seen:${commentId}`), 1, { ex: 259200 })
  }

  // Chat session (1-hour TTL)
  async getSession(chatId: string): Promise<Session | null> {
    return this.redis.get<Session>(this.key(`chat:session:${chatId}`))
  }

  async setSession(chatId: string, session: Session): Promise<void> {
    await this.redis.set(this.key(`chat:session:${chatId}`), session, { ex: 3600 })
  }

  async clearSession(chatId: string): Promise<void> {
    await this.redis.del(this.key(`chat:session:${chatId}`))
  }
}
