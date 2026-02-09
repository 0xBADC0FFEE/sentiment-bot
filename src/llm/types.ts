export interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

export interface LlmProvider {
  complete(system: string, user: string, maxTokens: number): Promise<string>
  chat(system: string, messages: ChatMessage[], maxTokens: number): Promise<string>
}
