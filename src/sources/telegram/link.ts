export function buildMessageLink(chatId: string, msgId: number, chatUsername?: string): string {
  if (chatUsername) return `https://t.me/${chatUsername}/${msgId}`
  const stripped = chatId.startsWith("-100") ? chatId.slice(4) : chatId.replace(/^-/, "")
  return `https://t.me/c/${stripped}/${msgId}`
}
