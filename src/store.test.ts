import { describe, it, expect, vi, beforeEach } from "vitest"
import { Store } from "./store.js"

function mockRedis() {
  return {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    sadd: vi.fn(),
    srem: vi.fn(),
    smembers: vi.fn(),
    sismember: vi.fn(),
    exists: vi.fn(),
  }
}

describe("Store", () => {
  let store: Store
  let redis: ReturnType<typeof mockRedis>

  beforeEach(() => {
    redis = mockRedis()
    store = new Store(redis as any)
  })

  it("addSubscriber adds chat ID", async () => {
    redis.sadd.mockResolvedValue(1)
    await store.addSubscriber("111")
    expect(redis.sadd).toHaveBeenCalledWith("subscribers", "111")
  })

  it("getSubscribers returns set members", async () => {
    redis.smembers.mockResolvedValue(["111", "222"])
    expect(await store.getSubscribers()).toEqual(["111", "222"])
  })

  it("setUserSource stores value", async () => {
    redis.set.mockResolvedValue("OK")
    await store.setUserSource("123", "telegram")
    expect(redis.set).toHaveBeenCalledWith("user:123:source", "telegram")
  })

  it("getUserSource returns value", async () => {
    redis.get.mockResolvedValue("alenka")
    expect(await store.getUserSource("123")).toBe("alenka")
  })

  it("getFolder uses source:telegram:folder key", async () => {
    redis.get.mockResolvedValue(null)
    await store.getFolder()
    expect(redis.get).toHaveBeenCalledWith("source:telegram:folder")
  })

  it("setFolder stores value", async () => {
    redis.set.mockResolvedValue("OK")
    await store.setFolder("invest")
    expect(redis.set).toHaveBeenCalledWith("source:telegram:folder", "invest")
  })

  it("getAuthCookie uses source:alenka:cookie key", async () => {
    redis.get.mockResolvedValue(null)
    await store.getAuthCookie()
    expect(redis.get).toHaveBeenCalledWith("source:alenka:cookie")
  })

  it("setAuthCookie stores with TTL", async () => {
    redis.set.mockResolvedValue("OK")
    await store.setAuthCookie("_identity=abc")
    expect(redis.set).toHaveBeenCalledWith("source:alenka:cookie", "_identity=abc", { ex: 86400 })
  })

  it("deleteAuthCookie deletes key", async () => {
    redis.del.mockResolvedValue(1)
    await store.deleteAuthCookie()
    expect(redis.del).toHaveBeenCalledWith("source:alenka:cookie")
  })

  it("getLastId uses namespaced key", async () => {
    redis.get.mockResolvedValue("12345")
    expect(await store.getLastId("authors")).toBe("12345")
    expect(redis.get).toHaveBeenCalledWith("source:alenka:authors:lastId")
  })

  it("setLastId stores value", async () => {
    redis.set.mockResolvedValue("OK")
    await store.setLastId("authors", "99999")
    expect(redis.set).toHaveBeenCalledWith("source:alenka:authors:lastId", "99999")
  })

  it("trackTopic adds to set", async () => {
    redis.sadd.mockResolvedValue(1)
    await store.trackTopic("SBER")
    expect(redis.sadd).toHaveBeenCalledWith("topics:tracked", "SBER")
  })

  it("trackAuthor adds to set", async () => {
    redis.sadd.mockResolvedValue(1)
    await store.trackAuthor("elvis")
    expect(redis.sadd).toHaveBeenCalledWith("authors:tracked", "elvis")
  })

  it("isHotSeen checks existence", async () => {
    redis.exists.mockResolvedValue(0)
    expect(await store.isHotSeen("c123")).toBe(false)
    expect(redis.exists).toHaveBeenCalledWith("hot:seen:c123")
  })

  it("markHotSeen sets key with TTL", async () => {
    redis.set.mockResolvedValue("OK")
    await store.markHotSeen("c123")
    expect(redis.set).toHaveBeenCalledWith("hot:seen:c123", 1, { ex: 259200 })
  })
})
