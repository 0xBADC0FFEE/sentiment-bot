import Anthropic from "@anthropic-ai/sdk"
import type { LlmProvider } from "./types.js"

export function createAnthropic(model: string): LlmProvider {
  const client = new Anthropic()

  return {
    async complete(system, user, maxTokens) {
      const res = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: user }],
      })
      return res.content[0].type === "text" ? res.content[0].text : ""
    },

    async chat(system, messages, maxTokens) {
      const res = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system,
        messages,
      })
      return res.content[0].type === "text" ? res.content[0].text : ""
    },
  }
}
