import type { Alert, Message } from "../../types.js"

export function detectAuthorAlerts(
  messages: Message[],
  trackedAuthors: string[],
): Alert[] {
  const tracked = new Set(trackedAuthors)
  return messages
    .filter((m) => tracked.has(m.author))
    .map((m) => ({ type: "author" as const, comment: m }))
}
