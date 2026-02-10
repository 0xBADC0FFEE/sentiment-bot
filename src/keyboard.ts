import { InlineKeyboard, Keyboard } from "grammy"
import ms from "ms"
import type { Source } from "./sources/types.js"
import { getSources } from "./sources/registry.js"
import { ONE_DAY_MS } from "./config.js"

export const BTN = {
  status: "ℹ️ Статус",
  backPrefix: "◀️ ",
} as const

export const DEFAULT_DURATION_MS = ONE_DAY_MS

export const DURATIONS: Record<string, number> = {
  "24h": ONE_DAY_MS,
  "3d": 3 * ONE_DAY_MS,
  "1w": 7 * ONE_DAY_MS,
}

const CAPABILITY_BUTTONS: Record<string, string> = {
  authors: "✍️ Авторы",
  hot: "🔥 Горячие",
}

export function startKeyboard(): Keyboard {
  const kb = new Keyboard()
  const sources = getSources()
  for (const src of sources) {
    kb.text(src.label)
  }
  kb.row().text(BTN.status)
  return kb.persistent().resized()
}

export function sourceKeyboard(source: Source): Keyboard {
  const kb = new Keyboard()
  const caps = source.capabilities
  const hasAnalysis = caps.includes("trends") || caps.includes("topics")

  if (hasAnalysis) {
    for (const key of Object.keys(DURATIONS)) {
      kb.text(key)
    }
    kb.row()
  }

  const extraCaps = caps.filter((c) => c !== "trends" && c !== "topics")
  for (const cap of extraCaps) {
    const label = CAPABILITY_BUTTONS[cap]
    if (label) kb.text(label)
  }
  if (extraCaps.length > 0) kb.row()

  kb.text(`${BTN.backPrefix}${source.displayName}`)
  return kb.persistent().resized()
}

export function promptKeyboard(hasTopics: boolean): InlineKeyboard {
  const kb = new InlineKeyboard().text("📊 Тренды", "prompt:trends")
  if (hasTopics) kb.text("🏷️ Топики", "prompt:topics")
  return kb
}

// --- Inline repeat button ---

export const REPEAT_PREFIX = "repeat:"

export function repeatKeyboard(source: string, durationMs: number, mode: "trends" | "topics"): InlineKeyboard {
  return new InlineKeyboard().text("🔄 Повторить", `${REPEAT_PREFIX}${source}:${ms(durationMs)}:${mode}`)
}

// --- Button label → action resolution ---

export type ButtonAction =
  | { type: "source"; source: Source }
  | { type: "analysis"; durationMs: number }
  | { type: "authors" }
  | { type: "hot" }
  | { type: "status" }
  | { type: "back" }
  | null

export function resolveButton(text: string): ButtonAction {
  if (text === BTN.status) return { type: "status" }
  if (text.startsWith(BTN.backPrefix)) return { type: "back" }

  // Source label?
  const source = getSources().find((s) => s.label === text)
  if (source) return { type: "source", source }

  // Duration?
  if (text in DURATIONS) return { type: "analysis", durationMs: DURATIONS[text] }

  // Capability buttons?
  for (const [cap, label] of Object.entries(CAPABILITY_BUTTONS)) {
    if (text === label) return { type: cap as "authors" | "hot" }
  }

  return null
}
