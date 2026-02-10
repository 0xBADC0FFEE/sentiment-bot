import type { Message } from "../types.js"

export type Capability = "trends" | "topics" | "authors" | "hot"

export interface Source {
  name: string
  label: string
  displayName: string
  iconId?: string
  capabilities: Capability[]
  fetchMessages(since: Date): Promise<Message[]>
}
