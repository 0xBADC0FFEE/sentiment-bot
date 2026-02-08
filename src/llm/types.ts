export interface LlmProvider {
  complete(system: string, user: string, maxTokens: number): Promise<string>
}
