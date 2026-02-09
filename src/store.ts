import { Redis } from "@upstash/redis"
import { kv } from "./config.js"
import type { ChatMessage } from "./llm/types.js"

export interface Session {
  system: string
  messages: ChatMessage[]
}

const ONE_DAY = 86_400
const THREE_DAYS = 3 * ONE_DAY
const FIVE_MINUTES = 300
const ONE_HOUR = 3_600

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
    await this.redis.set("source:alenka:cookie", cookie, { ex: ONE_DAY })
  }

  // Source-namespaced: alenka lastId
  async getLastId(feature: "trends" | "authors"): Promise<string | null> {
    return this.redis.get<string>(`source:alenka:${feature}:lastId`)
  }

  async setLastId(feature: "trends" | "authors", id: string): Promise<void> {
    await this.redis.set(`source:alenka:${feature}:lastId`, id)
  }

  // Generic tracked set helpers
  private trackedSet(key: string) {
    return {
      add: (name: string) => this.redis.sadd(key, name) as Promise<unknown> as Promise<void>,
      remove: (name: string) => this.redis.srem(key, name) as Promise<unknown> as Promise<void>,
      members: () => this.redis.smembers(key),
      has: async (name: string) => (await this.redis.sismember(key, name)) === 1,
    }
  }

  private topics = this.trackedSet("topics:tracked")
  private authors = this.trackedSet("authors:tracked")

  // Topics (shared across all sources)
  trackTopic = (name: string) => this.topics.add(name)
  untrackTopic = (name: string) => this.topics.remove(name)
  getTrackedTopics = () => this.topics.members()
  isTrackedTopic = (name: string) => this.topics.has(name)

  // Authors (alenka-specific)
  trackAuthor = (name: string) => this.authors.add(name)
  untrackAuthor = (name: string) => this.authors.remove(name)
  getTrackedAuthors = () => this.authors.members()
  isTrackedAuthor = (name: string) => this.authors.has(name)

  // Hot comments seen (alenka-specific, 3-day TTL per comment)
  async isHotSeen(commentId: string): Promise<boolean> {
    return (await this.redis.exists(`hot:seen:${commentId}`)) === 1
  }

  async markHotSeen(commentId: string): Promise<void> {
    await this.redis.set(`hot:seen:${commentId}`, 1, { ex: THREE_DAYS })
  }

  // Pending analysis (5-minute TTL)
  async setPending(chatId: string, durationMs: number): Promise<void> {
    await this.redis.set(`user:${chatId}:pending`, durationMs, { ex: FIVE_MINUTES })
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
    await this.redis.set(`chat:session:${chatId}`, session, { ex: ONE_HOUR })
  }

  async clearSession(chatId: string): Promise<void> {
    await this.redis.del(`chat:session:${chatId}`)
  }
}
