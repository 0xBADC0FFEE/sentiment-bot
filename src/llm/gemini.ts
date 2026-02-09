import { GoogleGenAI } from "@google/genai"
import type { ChatMessage, LlmProvider } from "./types.js"
import { llm } from "../config.js"

function toGeminiContents(messages: ChatMessage[]) {
  return messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }))
}

export function createGemini(model: string): LlmProvider {
  const client = new GoogleGenAI({ apiKey: llm.geminiApiKey! })

  return {
    async complete(system, user, maxTokens) {
      const res = await client.models.generateContent({
        model,
        contents: user,
        config: {
          systemInstruction: system,
          maxOutputTokens: maxTokens,
          thinkingConfig: { thinkingBudget: 0 },
        },
      })
      return res.text ?? ""
    },

    async chat(system, messages, maxTokens) {
      const res = await client.models.generateContent({
        model,
        contents: toGeminiContents(messages),
        config: {
          systemInstruction: system,
          maxOutputTokens: maxTokens,
          thinkingConfig: { thinkingBudget: 0 },
        },
      })
      return res.text ?? ""
    },
  }
}
