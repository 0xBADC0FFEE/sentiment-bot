import type { Source } from "./types.js"
import { createTelegramSource } from "./telegram/index.js"
import { createAlenkaSource } from "./alenka/index.js"

let cached: Source[] | undefined

export function getSources(): Source[] {
  cached ??= [createTelegramSource(), createAlenkaSource()]
  return cached
}

export function getSource(name: string): Source {
  const src = getSources().find((s) => s.name === name)
  if (!src) throw new Error(`Unknown source: ${name}`)
  return src
}
