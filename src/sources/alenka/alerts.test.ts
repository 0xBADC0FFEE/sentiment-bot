import { describe, it, expect } from "vitest"
import { detectAuthorAlerts } from "./authors.js"
import { detectHotAlerts } from "./hot.js"
import type { Message } from "../../types.js"

const makeMessage = (overrides: Partial<Message> = {}): Message => ({
  id: "1", author: "Test", chatId: "c1", chatTitle: "Test",
  text: "hello", date: new Date(), likes: 0,
  ...overrides,
})

describe("detectAuthorAlerts", () => {
  it("returns alert for tracked author", () => {
    const messages = [makeMessage({ author: "Элвис Марламов" })]
    const tracked = ["Элвис Марламов"]
    const alerts = detectAuthorAlerts(messages, tracked)
    expect(alerts).toHaveLength(1)
    expect(alerts[0].type).toBe("author")
  })

  it("returns empty for non-tracked author", () => {
    const messages = [makeMessage({ author: "Nobody" })]
    const tracked = ["Элвис Марламов"]
    expect(detectAuthorAlerts(messages, tracked)).toHaveLength(0)
  })

  it("handles multiple tracked authors", () => {
    const messages = [
      makeMessage({ author: "A" }),
      makeMessage({ author: "B" }),
      makeMessage({ author: "C" }),
    ]
    const alerts = detectAuthorAlerts(messages, ["A", "C"])
    expect(alerts).toHaveLength(2)
  })
})

describe("detectHotAlerts", () => {
  it("returns alert for message with 15+ likes", () => {
    const messages = [makeMessage({ id: "hot1", likes: 20 })]
    const seen = new Set<string>()
    const alerts = detectHotAlerts(messages, seen)
    expect(alerts).toHaveLength(1)
    expect(alerts[0].type).toBe("hot")
  })

  it("skips already-seen hot message", () => {
    const messages = [makeMessage({ id: "hot1", likes: 20 })]
    const seen = new Set(["hot1"])
    expect(detectHotAlerts(messages, seen)).toHaveLength(0)
  })

  it("skips message below threshold", () => {
    const messages = [makeMessage({ likes: 5 })]
    const seen = new Set<string>()
    expect(detectHotAlerts(messages, seen)).toHaveLength(0)
  })

  it("respects custom threshold", () => {
    const messages = [makeMessage({ likes: 8 })]
    const seen = new Set<string>()
    expect(detectHotAlerts(messages, seen, 5)).toHaveLength(1)
    expect(detectHotAlerts(messages, seen, 10)).toHaveLength(0)
  })
})
