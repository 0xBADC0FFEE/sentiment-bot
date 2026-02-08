import type { LlmProvider } from "./types.js"
import { createAnthropic } from "./anthropic.js"
import { createGemini } from "./gemini.js"
import { createGroq } from "./groq.js"
import { createOpenRouter } from "./openrouter.js"
import { llm } from "../config.js"

export type { LlmProvider } from "./types.js"

const providers: Record<string, (model: string) => LlmProvider> = {
  anthropic: createAnthropic,
  gemini: createGemini,
  groq: createGroq,
  openrouter: createOpenRouter,
}

export function createProvider(): LlmProvider {
  const factory = providers[llm.provider]
  if (!factory) throw new Error(`Unknown LLM_PROVIDER: ${llm.provider}`)
  return factory(llm.model)
}
