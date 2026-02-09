import OpenAI from "openai"
import type { LlmProvider } from "./types.js"
import { llm } from "../config.js"

export function createGroq(model: string): LlmProvider {
  const client = new OpenAI({
    apiKey: llm.groqApiKey!,
    baseURL: "https://api.groq.com/openai/v1",
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

    async chat(system, messages, maxTokens) {
      const res = await client.chat.completions.create({
        model,
        max_tokens: maxTokens,
        messages: [{ role: "system" as const, content: system }, ...messages],
      })
      return res.choices[0]?.message?.content ?? ""
    },
  }
}
