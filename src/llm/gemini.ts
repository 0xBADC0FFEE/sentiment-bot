import { GoogleGenAI } from "@google/genai"
import type { LlmProvider } from "./types.js"
import { llm } from "../config.js"

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
  }
}
