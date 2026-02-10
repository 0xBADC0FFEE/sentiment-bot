import { describe, it, expect } from "vitest"
import { resolveButton } from "./keyboard.js"

describe("resolveButton", () => {
  it("resolves source labels", () => {
    const action = resolveButton("📡 TG")
    expect(action).not.toBeNull()
    expect(action!.type).toBe("source")
  })

  it("resolves alenka source", () => {
    const action = resolveButton("📡 Alenka")
    expect(action).not.toBeNull()
    expect(action!.type).toBe("source")
  })

  it("resolves duration buttons", () => {
    expect(resolveButton("24h")).toEqual({ type: "analysis", durationMs: 86_400_000 })
    expect(resolveButton("3d")).toEqual({ type: "analysis", durationMs: 3 * 86_400_000 })
    expect(resolveButton("1w")).toEqual({ type: "analysis", durationMs: 7 * 86_400_000 })
  })

  it("resolves authors button", () => {
    const action = resolveButton("✍️ Авторы")
    expect(action).toEqual({ type: "authors" })
  })

  it("resolves hot button", () => {
    const action = resolveButton("🔥 Горячие")
    expect(action).toEqual({ type: "hot" })
  })

  it("resolves status button", () => {
    const action = resolveButton("ℹ️ Статус")
    expect(action).toEqual({ type: "status" })
  })

  it("resolves back button with source name", () => {
    expect(resolveButton("◀️ Alenka")).toEqual({ type: "back" })
    expect(resolveButton("◀️ TG")).toEqual({ type: "back" })
  })

  it("returns null for unknown text", () => {
    expect(resolveButton("random text")).toBeNull()
  })
})
