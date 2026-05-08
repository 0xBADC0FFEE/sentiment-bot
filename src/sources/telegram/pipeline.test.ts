import { describe, it, expect, vi } from "vitest"
import { Api } from "telegram/tl/index.js"
import { collectAuthorAlerts, runTelegramAuthors } from "./pipeline.js"
import type { Message } from "../../types.js"

function fakeStore(overrides: Partial<Record<string, any>> = {}) {
  return {
    getTrackedAuthors: vi.fn().mockResolvedValue(["durov"]),
    getTgAuthorsLastTs: vi.fn().mockResolvedValue(null),
    setTgAuthorsLastTs: vi.fn().mockResolvedValue(undefined),
    getResolvedTgUser: vi.fn().mockResolvedValue({ userId: "1", accessHash: "2" }),
    setResolvedTgUser: vi.fn().mockResolvedValue(undefined),
    deleteResolvedTgUser: vi.fn().mockResolvedValue(undefined),
    getFolder: vi.fn().mockResolvedValue("invest"),
    getSubscribers: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as any
}

describe("runTelegramAuthors", () => {
  it("cold-start: empty lastTs sets to now and returns 0 alerts without contacting client", async () => {
    const store = fakeStore({ getTgAuthorsLastTs: vi.fn().mockResolvedValue(null) })
    const createClient = vi.fn()

    const before = Math.floor(Date.now() / 1000)
    const result = await runTelegramAuthors({ store, createClient } as any)
    const after = Math.floor(Date.now() / 1000)

    expect(result.alerts).toBe(0)
    expect(createClient).not.toHaveBeenCalled()
    expect(store.setTgAuthorsLastTs).toHaveBeenCalledTimes(1)
    const ts = store.setTgAuthorsLastTs.mock.calls[0][0]
    expect(ts).toBeGreaterThanOrEqual(before)
    expect(ts).toBeLessThanOrEqual(after)
  })

  it("empty tracked authors → returns 0 alerts without creating client or touching lastTs", async () => {
    const store = fakeStore({ getTrackedAuthors: vi.fn().mockResolvedValue([]) })
    const createClient = vi.fn()

    const result = await runTelegramAuthors({ store, createClient } as any)

    expect(result.alerts).toBe(0)
    expect(createClient).not.toHaveBeenCalled()
    expect(store.getTgAuthorsLastTs).not.toHaveBeenCalled()
    expect(store.setTgAuthorsLastTs).not.toHaveBeenCalled()
  })
})

const author = { username: "durov", resolved: { userId: "1", accessHash: "2" } }

function chanPeer(id: number) {
  return new Api.InputPeerChannel({ channelId: BigInt(id) as any, accessHash: BigInt(id * 10) as any })
}
function dmPeer(id: number) {
  return new Api.InputPeerUser({ userId: BigInt(id) as any, accessHash: BigInt(id * 10) as any })
}

function fakeSearch(per: Map<string, Message[]>) {
  return vi.fn(async (_client: any, peer: any, _resolved: any, sinceTs: number) => {
    const key = peer instanceof Api.InputPeerChannel ? `ch:${peer.channelId}` : peer instanceof Api.InputPeerUser ? `u:${peer.userId}` : "?"
    const msgs = per.get(key) ?? []
    const newLastTs = msgs.length ? Math.max(...msgs.map((m) => Math.floor(m.date.getTime() / 1000))) : sinceTs
    return { messages: msgs, newLastTs }
  })
}

function msg(id: string, ts: number, text = id): Message {
  return { id, chatId: "c", chatTitle: "T", author: "@durov", text, date: new Date(ts * 1000) }
}

describe("collectAuthorAlerts", () => {
  it("skips DM peers (InputPeerUser) — never invokes search on them", async () => {
    const search = fakeSearch(new Map([["ch:1", [msg("1", 100)]]]))
    const result = await collectAuthorAlerts({
      client: {} as any,
      peers: [chanPeer(1), dmPeer(99)],
      resolvedAuthors: [author],
      lastTs: 0,
      maxAlerts: 10,
      search,
      resolveContext: async () => ({ chatId: "-1001", chatTitle: "T" }),
      delay: () => Promise.resolve(),
    })
    expect(result.alerts).toHaveLength(1)
    expect(search).toHaveBeenCalledTimes(1)
    const calledPeer = search.mock.calls[0][1]
    expect(calledPeer).toBeInstanceOf(Api.InputPeerChannel)
  })

  it("truncates total alerts to maxAlerts", async () => {
    const many = Array.from({ length: 8 }, (_, i) => msg(String(i + 1), 100 + i))
    const search = fakeSearch(new Map([["ch:1", many], ["ch:2", many]]))
    const result = await collectAuthorAlerts({
      client: {} as any,
      peers: [chanPeer(1), chanPeer(2)],
      resolvedAuthors: [author],
      lastTs: 0,
      maxAlerts: 10,
      search,
      resolveContext: async () => ({ chatId: "-1001", chatTitle: "T" }),
      delay: () => Promise.resolve(),
    })
    expect(result.alerts).toHaveLength(10)
  })

  it("PEER_ID_INVALID / USER_DEACTIVATED on author → eviction surfaced, loop continues with next author", async () => {
    const goodAuthor = { username: "good", resolved: { userId: "1", accessHash: "1" } }
    const badAuthor = { username: "bad", resolved: { userId: "2", accessHash: "2" } }
    const search = vi.fn(async (_c: any, _peer: any, resolved: any) => {
      if (resolved.userId === "2") throw new Error("PEER_ID_INVALID")
      return { messages: [msg("1", 100)], newLastTs: 100 }
    })
    const result = await collectAuthorAlerts({
      client: {} as any,
      peers: [chanPeer(1)],
      resolvedAuthors: [badAuthor, goodAuthor],
      lastTs: 0,
      maxAlerts: 10,
      search,
      resolveContext: async () => ({ chatId: "-1001", chatTitle: "T" }),
      delay: () => Promise.resolve(),
    })
    expect(result.evictions).toEqual(["bad"])
    expect(result.alerts).toHaveLength(1)
  })

  it("non-eviction errors are not surfaced as evictions but loop continues", async () => {
    const a = { username: "a", resolved: { userId: "1", accessHash: "1" } }
    const b = { username: "b", resolved: { userId: "2", accessHash: "2" } }
    const search = vi.fn(async (_c: any, _peer: any, resolved: any) => {
      if (resolved.userId === "1") throw new Error("FLOOD_WAIT_42")
      return { messages: [msg("1", 100)], newLastTs: 100 }
    })
    const result = await collectAuthorAlerts({
      client: {} as any,
      peers: [chanPeer(1)],
      resolvedAuthors: [a, b],
      lastTs: 0,
      maxAlerts: 10,
      search,
      resolveContext: async () => ({ chatId: "-1001", chatTitle: "T" }),
      delay: () => Promise.resolve(),
    })
    expect(result.evictions).toEqual([])
    expect(result.alerts).toHaveLength(1)
  })
})

describe("runTelegramAuthors orchestrator", () => {
  it("persists collect.newLastTs via setTgAuthorsLastTs and broadcasts alerts", async () => {
    const store = fakeStore({
      getTrackedAuthors: vi.fn().mockResolvedValue(["durov"]),
      getTgAuthorsLastTs: vi.fn().mockResolvedValue(1000),
      getResolvedTgUser: vi.fn().mockResolvedValue({ userId: "1", accessHash: "2" }),
      getSubscribers: vi.fn().mockResolvedValue(["chat-A"]),
    })
    const fakeClient = { disconnect: vi.fn().mockResolvedValue(undefined), invoke: vi.fn() }
    const createClient = vi.fn().mockResolvedValue(fakeClient)
    const collect = vi.fn().mockResolvedValue({
      alerts: [{ type: "author", comment: msg("1", 200) }],
      newLastTs: 5555,
      evictions: [],
    })
    const getFolderChats = vi.fn().mockResolvedValue([chanPeer(1)])
    const filterRecentPeers = vi.fn(async (_c: any, peers: any) => peers)
    const broadcastAlert = vi.fn().mockResolvedValue(undefined)

    const result = await runTelegramAuthors({
      store, createClient, collect, getFolderChats, filterRecentPeers, broadcastAlert,
      api: {} as any,
    } as any)

    expect(result.alerts).toBe(1)
    expect(store.setTgAuthorsLastTs).toHaveBeenCalledWith(5555)
    expect(broadcastAlert).toHaveBeenCalledTimes(1)
    expect(fakeClient.disconnect).toHaveBeenCalled()
  })

  it("evictions trigger deleteResolvedTgUser per username", async () => {
    const store = fakeStore({
      getTrackedAuthors: vi.fn().mockResolvedValue(["bad", "good"]),
      getTgAuthorsLastTs: vi.fn().mockResolvedValue(1000),
      getResolvedTgUser: vi.fn().mockResolvedValue({ userId: "1", accessHash: "2" }),
    })
    const fakeClient = { disconnect: vi.fn().mockResolvedValue(undefined) }
    const collect = vi.fn().mockResolvedValue({ alerts: [], newLastTs: 1000, evictions: ["bad"] })

    await runTelegramAuthors({
      store,
      createClient: vi.fn().mockResolvedValue(fakeClient),
      collect,
      getFolderChats: vi.fn().mockResolvedValue([chanPeer(1)]),
      filterRecentPeers: vi.fn(async (_c: any, p: any) => p),
      broadcastAlert: vi.fn(),
      api: {} as any,
    } as any)

    expect(store.deleteResolvedTgUser).toHaveBeenCalledWith("bad")
    expect(store.deleteResolvedTgUser).toHaveBeenCalledTimes(1)
  })
})
