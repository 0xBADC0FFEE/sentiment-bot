import { Api } from "grammy"
import { Store } from "../../store.js"
import { broadcastAlert } from "../../telegram.js"
import { telegram } from "../../config.js"
import { withAuthRetry, toMessage, detectAuthorAlerts, detectHotAlerts } from "./index.js"
import { scrapeNewComments, scrapeTopComments } from "./scraper.js"

export interface AlenkaOpts {
  store?: Store
  api?: Api
}

function defaults(opts: AlenkaOpts) {
  const store = opts.store ?? new Store()
  const api = opts.api ?? new Api(telegram.botToken)
  return { store, api }
}

// --- Authors ---

export interface AuthorsResult {
  comments: number
  alerts: number
}

export async function runAuthors(opts: AlenkaOpts = {}): Promise<AuthorsResult> {
  const { store, api } = defaults(opts)

  return withAuthRetry(store, async (cookie) => {
    const lastId = await store.getLastId("authors")

    if (!lastId) {
      const [first] = await scrapeNewComments(cookie, { maxComments: 1 })
      if (!first) {
        console.log("  No comments found")
        return { comments: 0, alerts: 0 }
      }
      await store.setLastId("authors", first.id)
      console.log(`  Initialized lastId to ${first.id}`)
      return { comments: 0, alerts: 0 }
    }

    const [tracked, subs] = await Promise.all([store.getTrackedAuthors(), store.getSubscribers()])
    console.log(`Tracked: ${tracked.length ? tracked.join(", ") : "none"}`)
    console.log(`Scraping new comments (lastId=${lastId})...`)

    let totalComments = 0
    let totalAlerts = 0

    await scrapeNewComments(cookie, {
      lastSeenId: lastId,
      async onPage(comments) {
        const msgs = [...comments].reverse().map(toMessage)
        const alerts = detectAuthorAlerts(msgs, tracked)
        for (const alert of alerts) {
          await broadcastAlert(api, subs, alert)
        }

        const maxId = String(Math.max(...comments.map((c) => Number(c.id))))
        await store.setLastId("authors", maxId)

        totalComments += msgs.length
        totalAlerts += alerts.length
      },
    })

    if (totalAlerts > 0) console.log(`  +${totalAlerts} alerts`)
    console.log(`  ${totalComments} comments, ${totalAlerts} alerts total`)
    console.log("Done")
    return { comments: totalComments, alerts: totalAlerts }
  })
}

// --- Hot ---

export interface HotResult {
  total: number
  alerts: number
}

export async function runHot(opts: AlenkaOpts = {}): Promise<HotResult> {
  const { store, api } = defaults(opts)

  return withAuthRetry(store, async (cookie) => {
    console.log("Scraping top comments...")
    const comments = await scrapeTopComments(cookie)
    console.log(`  ${comments.length} top comments`)

    const msgs = comments.map(toMessage)

    const seenFlags = await Promise.all(msgs.map((m) => store.isHotSeen(m.id)))
    const seenIds = new Set(msgs.filter((_, i) => seenFlags[i]).map((m) => m.id))

    const alerts = detectHotAlerts(msgs, seenIds)
    await Promise.all(alerts.map((a) => store.markHotSeen(a.comment.id)))

    console.log(`  ${alerts.length} hot alerts`)

    if (alerts.length > 0) {
      const subs = await store.getSubscribers()
      for (const alert of alerts) {
        await broadcastAlert(api, subs, alert)
      }
    }

    console.log("Done")
    return { total: msgs.length, alerts: alerts.length }
  })
}
