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

export type Alert =
  | { type: "trends"; summary: string; dateRange?: { from: Date; to: Date }; itemCount?: number }
  | { type: "topics"; summary: string; dateRange?: { from: Date; to: Date }; itemCount?: number }
  | { type: "author"; comment: Message }
  | { type: "hot"; comment: Message }
