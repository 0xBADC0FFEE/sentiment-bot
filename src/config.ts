const DEFAULT_MODELS: Record<string, string> = {
  anthropic: "claude-haiku-4-5-20251001",
  gemini: "gemini-2.5-flash",
  groq: "llama-3.3-70b-versatile",
  openrouter: "deepseek/deepseek-r1-0528:free",
}

const provider = process.env.LLM_PROVIDER ?? "anthropic"

export const llm = {
  provider,
  model: process.env.LLM_MODEL || DEFAULT_MODELS[provider] || "unknown",
  geminiApiKey: process.env.GEMINI_API_KEY,
  groqApiKey: process.env.GROQ_API_KEY,
  openrouterApiKey: process.env.OPENROUTER_API_KEY,
}

export const telegram = {
  botToken: process.env.TELEGRAM_BOT_TOKEN!,
  adminId: process.env.TELEGRAM_ADMIN_ID?.trim(),
  apiId: Number(process.env.TG_API_ID!),
  apiHash: process.env.TG_API_HASH!,
  session: process.env.TG_SESSION ?? "",
}

export const alenka = {
  login: process.env.ALENKA_LOGIN!,
  password: process.env.ALENKA_PASSWORD!,
}

export const kv = {
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
}

export const MAX_ITEMS = 2000
export const MIN_ITEMS = 10

const CONTEXT_WINDOWS: Record<string, number> = {
  "claude-haiku-4-5-20251001": 200_000,
  "gemini-2.5-flash": 1_000_000,
  "llama-3.3-70b-versatile": 128_000,
  "deepseek/deepseek-r1-0528:free": 163_840,
}

const DEFAULT_CONTEXT = 128_000

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 2.5)
}

export function getInputBudget(): number {
  const ctx = CONTEXT_WINDOWS[llm.model]
  if (!ctx) console.warn(`Unknown context window for "${llm.model}", using ${DEFAULT_CONTEXT}`)
  return (ctx ?? DEFAULT_CONTEXT) - 4096 - 500
}
