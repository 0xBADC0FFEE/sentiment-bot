export interface Message {
  id: string
  chatId: string
  chatTitle: string
  author: string
  text: string
  date: Date
  replyTo?: string
  reactions?: { emoji: string; count: number }[]
  likes?: number
  images?: string[]
  articleTitle?: string
  articleUrl?: string
  commentUrl?: string
}

export type HotAlert = { type: "hot"; comment: Message }

export type Alert =
  | { type: "trends"; summary: string; sourceLabel?: string; customPrompt?: string; dateRange?: { from: Date; to: Date }; itemCount?: number }
  | { type: "topics"; summary: string; sourceLabel?: string; dateRange?: { from: Date; to: Date }; itemCount?: number }
  | { type: "author"; comment: Message }
  | HotAlert
