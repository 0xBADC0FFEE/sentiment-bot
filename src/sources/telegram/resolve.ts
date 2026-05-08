import { Api } from "telegram/tl/index.js"
import { createClient } from "./client.js"
import type { ResolvedTgUser } from "../../store.js"

export async function resolveTgUsername(username: string): Promise<ResolvedTgUser | null> {
  const client = await createClient()
  try {
    const res = await client.invoke(new Api.contacts.ResolveUsername({ username }))
    const user = res.users.find((u): u is Api.User => u instanceof Api.User)
    if (!user || user.accessHash === undefined) return null
    return { userId: user.id.toString(), accessHash: user.accessHash.toString() }
  } catch {
    return null
  } finally {
    await client.disconnect()
  }
}
