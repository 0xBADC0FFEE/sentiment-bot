import { describe, it, expect, vi } from "vitest"
import { Api } from "telegram/tl/index.js"
import { searchAuthorMessages } from "./search.js"
import type { ResolvedTgUser } from "../../store.js"

const author: ResolvedTgUser = { userId: "100", accessHash: "200" }
const peer = new Api.InputPeerChannel({ channelId: BigInt(123) as any, accessHash: BigInt(456) as any })

function makeMsg(id: number, date: number, text: string, reactions?: { count: number }[]): Api.Message {
  const reactionsObj = reactions
    ? new Api.MessageReactions({
        results: reactions.map(
          (r) => new Api.ReactionCount({ reaction: new Api.ReactionEmoji({ emoticon: "👍" }), count: r.count }),
        ),
      })
    : undefined
  const m = Object.create(Api.Message.prototype) as Api.Message
  Object.assign(m, { id, date, message: text, reactions: reactionsObj })
  return m
}

function mockClient(messages: Api.Message[]) {
  return { invoke: vi.fn().mockResolvedValue({ messages }) } as any
}

describe("searchAuthorMessages", () => {
  it("returns empty list when no messages", async () => {
    const client = mockClient([])
    const result = await searchAuthorMessages(client, peer, author, 1000, {
      chatId: "-1001234567890",
      chatTitle: "Test",
    })
    expect(result).toEqual([])
  })

  it("returns all messages oldest-first", async () => {
    // Telegram returns newest-first
    const raw = [makeMsg(3, 300, "c"), makeMsg(2, 200, "b"), makeMsg(1, 100, "a")]
    const client = mockClient(raw)
    const result = await searchAuthorMessages(client, peer, author, 50, {
      chatId: "-1001234567890",
      chatTitle: "Test",
    })
    expect(result.map((m) => m.text)).toEqual(["a", "b", "c"])
  })

  it("does not cap — returns up to SEARCH_LIMIT messages", async () => {
    const raw = Array.from({ length: 100 }, (_, i) => makeMsg(100 - i, 1000 - i, `m${100 - i}`))
    const client = mockClient(raw)
    const result = await searchAuthorMessages(client, peer, author, 0, {
      chatId: "-1001234567890",
      chatTitle: "Test",
    })
    expect(result).toHaveLength(100)
    expect(result.slice(0, 3).map((m) => m.text)).toEqual(["m1", "m2", "m3"])
    expect(result.at(-1)!.text).toBe("m100")
  })

  it("aggregates likes as sum of all reactions counts", async () => {
    const raw = [makeMsg(1, 100, "x", [{ count: 5 }, { count: 3 }, { count: 2 }])]
    const client = mockClient(raw)
    const result = await searchAuthorMessages(client, peer, author, 0, {
      chatId: "-1001234567890",
      chatTitle: "Test",
    })
    expect(result[0].likes).toBe(10)
  })

  it("populates linkTitle, linkUrl via buildMessageLink", async () => {
    const raw = [makeMsg(42, 100, "x")]
    const clientPub = mockClient(raw)
    const pub = await searchAuthorMessages(clientPub, peer, author, 0, {
      chatId: "-1001234567890",
      chatTitle: "Public",
      chatUsername: "durov",
    })
    expect(pub[0].linkTitle).toBe("Public")
    expect(pub[0].linkUrl).toBe("https://t.me/durov/42")

    const clientPriv = mockClient([makeMsg(7, 100, "y")])
    const priv = await searchAuthorMessages(clientPriv, peer, author, 0, {
      chatId: "-1001234567890",
      chatTitle: "Private",
    })
    expect(priv[0].linkUrl).toBe("https://t.me/c/1234567890/7")
  })

  it("invokes messages.Search with correct params", async () => {
    const client = mockClient([])
    await searchAuthorMessages(client, peer, author, 12345, {
      chatId: "-1001234567890",
      chatTitle: "Test",
    })
    const call = client.invoke.mock.calls[0][0]
    expect(call).toBeInstanceOf(Api.messages.Search)
    expect(call.minDate).toBe(12345)
    expect(call.limit).toBe(100)
    expect(call.q).toBe("")
    expect(call.filter).toBeInstanceOf(Api.InputMessagesFilterEmpty)
    expect(call.fromId).toBeInstanceOf(Api.InputPeerUser)
  })
})
