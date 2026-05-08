import "dotenv/config"
import { Redis } from "@upstash/redis"
import { kv } from "../src/config.js"

const OLD = "authors:tracked"
const NEW = "authors:tracked:alenka"

const redis = new Redis({ url: kv.url, token: kv.token })

const members = await redis.smembers(OLD)
if (!members.length) {
  console.log(`No-op: ${OLD} empty.`)
  process.exit(0)
}

await redis.sadd(NEW, members[0], ...members.slice(1))
await redis.del(OLD)
console.log(`Migrated ${members.length} authors → ${NEW}: ${members.join(", ")}`)
