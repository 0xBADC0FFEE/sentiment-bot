import { describe, it, expect } from "vitest"
import { splitMessage, formatTrendsSummary, formatAuthorAlert, formatHotAlert, formatAlert } from "./telegram.js"
import type { Message } from "./types.js"

describe("splitMessage", () => {
  it("returns single part when under limit", () => {
    expect(splitMessage("short")).toEqual(["short"])
  })

  it("returns single part at exact limit", () => {
    const text = "a".repeat(4096)
    expect(splitMessage(text)).toEqual([text])
  })

  it("splits on newline when over limit", () => {
    const line = "x".repeat(2000)
    const text = `${line}\n${line}\n${line}`
    const parts = splitMessage(text)
    expect(parts.length).toBeGreaterThan(1)
    for (const p of parts) {
      expect(p.length).toBeLessThanOrEqual(4096)
    }
  })

  it("falls back to hard cut when no newline", () => {
    const text = "x".repeat(5000)
    const parts = splitMessage(text)
    expect(parts.length).toBe(2)
    expect(parts[0].length).toBe(4096)
  })
})

describe("formatTrendsSummary", () => {
  it("prepends header", () => {
    const out = formatTrendsSummary("test")
    expect(out).toContain("Обзор трендов")
  })

  it("includes source label", () => {
    const out = formatTrendsSummary("test", "Alenka")
    expect(out).toContain("Обзор трендов")
    expect(out).toContain("· Alenka")
  })

  it("uses custom prompt as title", () => {
    const out = formatTrendsSummary("test", "Alenka", "найди золото")
    expect(out).toContain("найди золото")
    expect(out).not.toContain("Обзор трендов")
  })

  it("escapes HTML entities", () => {
    const out = formatTrendsSummary("<b>AT&T</b>")
    expect(out).toContain("&lt;b&gt;")
    expect(out).toContain("&amp;")
    expect(out).not.toContain("<b>AT")
  })
})

const comment: Message = {
  id: "123", author: "Элвис Марламов",
  chatId: "c1", chatTitle: "Test",
  text: "Эффект золота", articleTitle: "Предложи новость!",
  articleUrl: "https://alenka.capital/a/1",
  date: new Date(), likes: 5,
  commentUrl: "https://alenka.capital/a/1?comm_find=123",
  images: ["https://cdn.alenka.capital/abc.png"],
}

describe("formatAuthorAlert", () => {
  it("formats tracked author message", () => {
    const msg = formatAuthorAlert(comment)
    expect(msg).toContain("✍️")
    expect(msg).toContain("Элвис Марламов")
    expect(msg).toContain("Эффект золота")
    expect(msg).toContain("Предложи новость!</a>")
  })
})

describe("formatHotAlert", () => {
  it("formats hot comment without reply", () => {
    const hot = { ...comment, likes: 36 }
    const msg = formatHotAlert(hot)
    expect(msg).toContain("🔥")
    expect(msg).toContain("36+")
    expect(msg).not.toContain("→")
  })

  it("formats negative likes without trailing +", () => {
    const hot = { ...comment, likes: -1 }
    const msg = formatHotAlert(hot)
    expect(msg).toContain("-1")
    expect(msg).not.toContain("-1+")
  })

  it("formats hot comment with reply", () => {
    const hot = { ...comment, likes: 36, replyTo: "Satoshi" }
    const msg = formatHotAlert(hot)
    expect(msg).toContain("→ Satoshi")
  })
})

describe("formatAlert", () => {
  it("delegates to correct formatter", () => {
    const msg = formatAlert({ type: "author", comment })
    expect(msg).toContain("✍️")
  })

  it("formats trends alert with source", () => {
    const msg = formatAlert({ type: "trends", summary: "Test summary", sourceLabel: "Alenka" })
    expect(msg).toContain("Test summary")
    expect(msg).toContain("Alenka")
  })
})
