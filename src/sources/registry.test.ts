import { describe, it, expect } from "vitest"
import { getSources, getSource } from "./registry.js"

describe("registry", () => {
  it("getSources returns alenka and telegram", () => {
    const sources = getSources()
    expect(sources).toHaveLength(2)
    expect(sources.map((s) => s.name)).toEqual(["alenka", "telegram"])
  })

  it("getSource returns by name", () => {
    const source = getSource("telegram")
    expect(source.name).toBe("telegram")
    expect(source.label).toBe("📡 TG")
    expect(source.capabilities).toContain("trends")
  })

  it("getSource throws for unknown name", () => {
    expect(() => getSource("unknown")).toThrow("Unknown source: unknown")
  })

  it("alenka has all capabilities", () => {
    const source = getSource("alenka")
    expect(source.capabilities).toEqual(["trends", "topics", "authors", "hot"])
  })

  it("telegram has trends and topics", () => {
    const source = getSource("telegram")
    expect(source.capabilities).toEqual(["trends", "topics"])
  })
})
