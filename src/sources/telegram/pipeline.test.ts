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

function chanPeer(id: number) {
  return new Api.InputPeerChannel({ channelId: BigInt(id) as any, accessHash: BigInt(id * 10) as any })
}
function dmPeer(id: number) {
  return new Api.InputPeerUser({ userId: BigInt(id) as any, accessHash: BigInt(id * 10) as any })
}

function msg(id: string, ts: number, author = "@durov", chatId = "c"): Message {
  return { id, chatId, chatTitle: "T", author, text: id, date: new Date(ts * 1000) }
}

const mkAuthor = (username: string, userId: string) => ({ username, resolved: { userId, accessHash: "1" } })

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

describe("collectAuthorAlerts", () => {
  it("skips DM peers (InputPeerUser) — never invokes search on them", async () => {
    const search = vi.fn(async (_c: any, peer: any) =>
      peer instanceof Api.InputPeerChannel ? [msg("1", 100)] : [],
    )
    const result = await collectAuthorAlerts({
      client: {} as any,
      peers: [chanPeer(1), dmPeer(99)],
      resolvedAuthors: [mkAuthor("durov", "1")],
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

  it("aggregates from every (chat × author) and selects 10 globally oldest", async () => {
    // 2 chats × 2 authors × 4 msgs = 16 msgs total
    // chat 1, durov(1): 100, 200, 300, 400
    // chat 1, elvis(2): 150, 250, 350, 450
    // chat 2, durov(1):  50, 175, 275, 375
    // chat 2, elvis(2):  75, 125, 225, 325
    // pool (sorted): 50, 75, 100, 125, 150, 175, 200, 225, 250, 275, 300, 325, 350, 375, 400, 450
    // first 10:      50, 75, 100, 125, 150, 175, 200, 225, 250, 275  (newLastTs = 275)
    // MTProto messages.search min_date is exclusive (date > min_date per core.telegram.org docs),
    // so the boundary message won't be re-fetched on the next tick — no +1 needed.
    const dataset: Record<string, number[]> = {
      "ch1:1": [100, 200, 300, 400],
      "ch1:2": [150, 250, 350, 450],
      "ch2:1": [50, 175, 275, 375],
      "ch2:2": [75, 125, 225, 325],
    }
    const search = vi.fn(async (_c: any, peer: any, resolved: any) => {
      const peerKey = peer instanceof Api.InputPeerChannel ? `ch${peer.channelId}` : "?"
      const dates = dataset[`${peerKey}:${resolved.userId}`] ?? []
      return dates.map((d) => msg(`${peerKey}-${resolved.userId}-${d}`, d))
    })

    const result = await collectAuthorAlerts({
      client: {} as any,
      peers: [chanPeer(1), chanPeer(2)],
      resolvedAuthors: [mkAuthor("durov", "1"), mkAuthor("elvis", "2")],
      lastTs: 0,
      maxAlerts: 10,
      search,
      resolveContext: async () => ({ chatId: "-1001", chatTitle: "T" }),
      delay: () => Promise.resolve(),
    })

    expect(search).toHaveBeenCalledTimes(4)
    expect(result.alerts).toHaveLength(10)
    const dates = result.alerts.map((a: any) => Math.floor(a.comment.date.getTime() / 1000))
    expect(dates).toEqual([50, 75, 100, 125, 150, 175, 200, 225, 250, 275])
    expect(result.newLastTs).toBe(275)
  })

  it("pool smaller than maxAlerts → returns all, newLastTs = newest selected", async () => {
    const search = vi.fn(async () => [msg("a", 100), msg("b", 300), msg("c", 200)])
    const result = await collectAuthorAlerts({
      client: {} as any,
      peers: [chanPeer(1)],
      resolvedAuthors: [mkAuthor("durov", "1")],
      lastTs: 50,
      maxAlerts: 10,
      search,
      resolveContext: async () => ({ chatId: "-1001", chatTitle: "T" }),
      delay: () => Promise.resolve(),
    })
    expect(result.alerts).toHaveLength(3)
    expect(result.newLastTs).toBe(300)
  })

  it("empty pool → keeps lastTs unchanged", async () => {
    const search = vi.fn(async () => [])
    const result = await collectAuthorAlerts({
      client: {} as any,
      peers: [chanPeer(1)],
      resolvedAuthors: [mkAuthor("durov", "1")],
      lastTs: 999,
      maxAlerts: 10,
      search,
      resolveContext: async () => ({ chatId: "-1001", chatTitle: "T" }),
      delay: () => Promise.resolve(),
    })
    expect(result.alerts).toEqual([])
    expect(result.newLastTs).toBe(999)
  })

  it("PEER_ID_INVALID / USER_DEACTIVATED on author → eviction surfaced, loop continues", async () => {
    const search = vi.fn(async (_c: any, _peer: any, resolved: any) => {
      if (resolved.userId === "2") throw new Error("PEER_ID_INVALID")
      return [msg("1", 100)]
    })
    const result = await collectAuthorAlerts({
      client: {} as any,
      peers: [chanPeer(1)],
      resolvedAuthors: [mkAuthor("bad", "2"), mkAuthor("good", "1")],
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
    const search = vi.fn(async (_c: any, _peer: any, resolved: any) => {
      if (resolved.userId === "1") throw new Error("FLOOD_WAIT_42")
      return [msg("1", 100)]
    })
    const result = await collectAuthorAlerts({
      client: {} as any,
      peers: [chanPeer(1)],
      resolvedAuthors: [mkAuthor("a", "1"), mkAuthor("b", "2")],
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
