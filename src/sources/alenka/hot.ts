import type { HotAlert, Message } from "../../types.js"

const HOT_THRESHOLD = 15

export function detectHotAlerts(
  messages: Message[],
  seenIds: Set<string>,
  threshold = HOT_THRESHOLD,
): HotAlert[] {
  return messages
    .filter((m) => (m.likes ?? 0) >= threshold && !seenIds.has(m.id))
    .map((m) => ({ type: "hot" as const, comment: m }))
}
