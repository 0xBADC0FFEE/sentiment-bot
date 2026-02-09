import { llm } from "../config.js"
import { createOpenAICompatible } from "./openai-compatible.js"

export const createGroq = (model: string) =>
  createOpenAICompatible("https://api.groq.com/openai/v1", llm.groqApiKey!, model)
