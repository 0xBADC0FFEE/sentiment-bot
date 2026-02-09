import { llm } from "../config.js"
import { createOpenAICompatible } from "./openai-compatible.js"

export const createOpenRouter = (model: string) =>
  createOpenAICompatible("https://openrouter.ai/api/v1", llm.openrouterApiKey!, model)
