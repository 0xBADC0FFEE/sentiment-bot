import { describe, it, expect } from "vitest"
import { buildMessageLink } from "./link.js"

describe("buildMessageLink", () => {
  it("public chat with username → t.me/{username}/{msgId}", () => {
    expect(buildMessageLink("-1001234567890", 42, "durov")).toBe("https://t.me/durov/42")
  })

  it("private chat without username → t.me/c/{strippedId}/{msgId}", () => {
    expect(buildMessageLink("-1001234567890", 42)).toBe("https://t.me/c/1234567890/42")
  })

  it("strips -100 prefix from BigInt-safe chatId", () => {
    expect(buildMessageLink("-1009999999999999", 1)).toBe("https://t.me/c/9999999999999/1")
  })

  it("private chatId without -100 prefix passes through unsigned abs", () => {
    expect(buildMessageLink("-12345", 7)).toBe("https://t.me/c/12345/7")
  })
})
