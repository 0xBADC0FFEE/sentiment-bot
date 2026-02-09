const DEFAULT_LLM_URI = "anthropic://claude-haiku-4-5-20251001"

function parseLlm(uri: string) {
  const url = new URL(uri)
  return { provider: url.protocol.slice(0, -1), model: url.hostname + url.pathname }
}

const llmUri = process.env.LLM_MODEL || DEFAULT_LLM_URI
const { provider, model } = parseLlm(llmUri)

export const llm = {
  uri: llmUri,
  provider,
  model,
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

export const ONE_DAY_MS = 86_400_000

export const MAX_ITEMS = 2000
export const MIN_ITEMS = 10
export const MAX_OUTPUT_TOKENS = 4096

const CONTEXT_WINDOWS: Record<string, number> = {
  "anthropic://claude-haiku-4-5-20251001": 200_000,
  "gemini://gemini-2.5-flash": 1_000_000,
  "groq://llama-3.3-70b-versatile": 128_000,
  "openrouter://deepseek/deepseek-r1-0528:free": 163_840,
}

const DEFAULT_CONTEXT = 128_000

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 2.5)
}

export function getInputBudget(): number {
  const ctx = CONTEXT_WINDOWS[llm.uri]
  if (!ctx) console.warn(`Unknown context window for "${llm.uri}", using ${DEFAULT_CONTEXT}`)
  const PROMPT_OVERHEAD = 500
  return (ctx ?? DEFAULT_CONTEXT) - MAX_OUTPUT_TOKENS - PROMPT_OVERHEAD
}
