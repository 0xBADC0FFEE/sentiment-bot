import { describe, it, expect } from "vitest"
import { groupBy, formatItems, type Item } from "./analyzer.js"
import { MAX_ITEMS } from "./config.js"

const makeItem = (text: string, overrides: Partial<Item> = {}): Item => ({
  text,
  author: "Test",
  date: new Date(),
  groupKey: "g1",
  groupTitle: "Group",
  ...overrides,
})

describe("groupBy", () => {
  it("groups items by groupKey", () => {
    const items = [
      makeItem("a", { groupKey: "k1" }),
      makeItem("b", { groupKey: "k2" }),
      makeItem("c", { groupKey: "k1" }),
    ]
    const groups = groupBy(items)
    expect(groups.size).toBe(2)
    expect(groups.get("k1")).toHaveLength(2)
    expect(groups.get("k2")).toHaveLength(1)
  })

  it("returns empty map for empty array", () => {
    expect(groupBy([]).size).toBe(0)
  })
})

describe("formatItems", () => {
  it("includes group title as header", () => {
    const items = [makeItem("test text", { groupTitle: "Отчёт ВТБ" })]
    const formatted = formatItems(items)
    expect(formatted).toContain("# Отчёт ВТБ")
    expect(formatted).toContain("test text")
  })

  it("includes replyTo context", () => {
    const items = [makeItem("согласен", { replyTo: "user1" })]
    const formatted = formatItems(items)
    expect(formatted).toContain("→user1")
  })

  it("strips newlines from text", () => {
    const items = [makeItem("line1\nline2\n\nline3")]
    const formatted = formatItems(items)
    expect(formatted).toContain("line1 line2 line3")
  })

  it("formats meta in parentheses", () => {
    const items = [makeItem("hello", { author: "Alice", meta: "👍5" })]
    const formatted = formatItems(items)
    expect(formatted).toContain('Alice (👍5): "hello"')
  })

  it("omits meta when absent", () => {
    const items = [makeItem("neutral", { author: "Eve" })]
    const formatted = formatItems(items)
    expect(formatted).toContain('Eve: "neutral"')
    expect(formatted).not.toContain("(")
  })

  it("includes date", () => {
    const date = new Date(2025, 1, 8, 14, 32)
    const items = [makeItem("text", { author: "Ana", date })]
    const formatted = formatItems(items)
    expect(formatted).toMatch(/8 фев.*14:32 \| Ana: "text"/)
  })

  it(`caps at MAX_ITEMS (${MAX_ITEMS})`, () => {
    const items = Array.from({ length: MAX_ITEMS + 100 }, (_, i) =>
      makeItem(`m${i}`),
    )
    const formatted = formatItems(items)
    expect(formatted).not.toContain(`m${MAX_ITEMS}`)
    expect(formatted).toContain(`m${MAX_ITEMS - 1}`)
  })
})
