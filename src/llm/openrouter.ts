import OpenAI from "openai"
import type { LlmProvider } from "./types.js"
import { llm } from "../config.js"

export function createOpenRouter(model: string): LlmProvider {
  const client = new OpenAI({
    apiKey: llm.openrouterApiKey!,
    baseURL: "https://openrouter.ai/api/v1",
  })

  return {
    async complete(system, user, maxTokens) {
      const res = await client.chat.completions.create({
        model,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      })
      return res.choices[0]?.message?.content ?? ""
    },
  }
}
