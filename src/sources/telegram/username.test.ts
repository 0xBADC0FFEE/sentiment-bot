import { describe, it, expect } from "vitest"
import { normalizeTgUsername } from "./username.js"

describe("normalizeTgUsername", () => {
  it("strips @ and lowercases", () => {
    expect(normalizeTgUsername("@DUROV")).toBe("durov")
  })

  it("returns null without leading @", () => {
    expect(normalizeTgUsername("durov")).toBeNull()
  })

  it("returns null for empty body after @", () => {
    expect(normalizeTgUsername("@")).toBeNull()
  })
})
