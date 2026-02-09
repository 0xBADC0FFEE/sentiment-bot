import type { Source } from "./types.js"
import { Store } from "../store.js"
import { createTelegramSource } from "./telegram/index.js"
import { createAlenkaSource } from "./alenka/index.js"

let cached: Source[] | undefined

export function getSources(): Source[] {
  if (!cached) {
    const store = new Store()
    cached = [createAlenkaSource(store), createTelegramSource(store)]
  }
  return cached
}

export function getSource(name: string): Source {
  const src = getSources().find((s) => s.name === name)
  if (!src) throw new Error(`Unknown source: ${name}`)
  return src
}
