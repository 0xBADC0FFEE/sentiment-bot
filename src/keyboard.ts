import { Keyboard } from "grammy"
import type { Source } from "./sources/types.js"
import { getSources } from "./sources/registry.js"

export const BTN = {
  status: "ℹ️ Статус",
  back: "◀️ Назад",
} as const

const DURATION_LABELS = {
  "24h": { trends: "📊 24ч", topics: "🏷️ 24ч" },
  "3d": { trends: "📊 3д", topics: "🏷️ 3д" },
  "7d": { trends: "📊 7д", topics: "🏷️ 7д" },
} as const

export const DURATIONS: Record<string, number> = {
  "24h": 86_400_000,
  "3d": 3 * 86_400_000,
  "7d": 7 * 86_400_000,
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

  if (caps.includes("trends")) {
    kb.text(DURATION_LABELS["24h"].trends)
      .text(DURATION_LABELS["3d"].trends)
      .text(DURATION_LABELS["7d"].trends)
      .row()
  }
  if (caps.includes("topics")) {
    kb.text(DURATION_LABELS["24h"].topics)
      .text(DURATION_LABELS["3d"].topics)
      .text(DURATION_LABELS["7d"].topics)
      .row()
  }

  const extraCaps = caps.filter((c) => c !== "trends" && c !== "topics")
  for (const cap of extraCaps) {
    const label = CAPABILITY_BUTTONS[cap]
    if (label) kb.text(label)
  }
  if (extraCaps.length > 0) kb.row()

  kb.text(BTN.back)
  return kb.persistent().resized()
}

// --- Button label → action resolution ---

export type ButtonAction =
  | { type: "source"; source: Source }
  | { type: "trends"; durationMs: number }
  | { type: "topics"; durationMs: number }
  | { type: "authors" }
  | { type: "hot" }
  | { type: "status" }
  | { type: "back" }
  | null

export function resolveButton(text: string): ButtonAction {
  if (text === BTN.status) return { type: "status" }
  if (text === BTN.back) return { type: "back" }

  // Source label?
  const source = getSources().find((s) => s.label === text)
  if (source) return { type: "source", source }

  // Trends duration?
  for (const [key, labels] of Object.entries(DURATION_LABELS)) {
    if (text === labels.trends) return { type: "trends", durationMs: DURATIONS[key] }
    if (text === labels.topics) return { type: "topics", durationMs: DURATIONS[key] }
  }

  // Capability buttons?
  for (const [cap, label] of Object.entries(CAPABILITY_BUTTONS)) {
    if (text === label) return { type: cap as "authors" | "hot" }
  }

  return null
}
