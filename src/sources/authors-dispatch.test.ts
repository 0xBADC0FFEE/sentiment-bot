import { describe, it, expect, vi } from "vitest"
import { runAuthorsForSource } from "./authors-dispatch.js"

describe("runAuthorsForSource", () => {
  it("source=alenka → calls runAuthors with opts", async () => {
    const runAlenka = vi.fn().mockResolvedValue({ comments: 5, alerts: 2 })
    const runTelegram = vi.fn().mockResolvedValue({ alerts: 0 })
    const opts = { maxAlerts: 10 } as any
    const result = await runAuthorsForSource("alenka", opts, { runAlenka, runTelegram })
    expect(runAlenka).toHaveBeenCalledWith(opts)
    expect(runTelegram).not.toHaveBeenCalled()
    expect(result).toEqual({ alerts: 2, comments: 5 })
  })

  it("source=telegram → calls runTelegramAuthors with opts", async () => {
    const runAlenka = vi.fn().mockResolvedValue({ comments: 0, alerts: 0 })
    const runTelegram = vi.fn().mockResolvedValue({ alerts: 7 })
    const opts = { maxAlerts: 10 } as any
    const result = await runAuthorsForSource("telegram", opts, { runAlenka, runTelegram })
    expect(runTelegram).toHaveBeenCalledWith(opts)
    expect(runAlenka).not.toHaveBeenCalled()
    expect(result).toEqual({ alerts: 7 })
  })
})
