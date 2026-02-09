import * as cheerio from "cheerio"

const BASE = "https://alenka.capital"

export interface Comment {
  id: string
  author: string
  authorId: string
  replyTo?: string
  text: string
  articleTitle: string
  articleUrl: string
  date: Date
  likes: number
  commentUrl: string
  images?: string[]
}

export async function login(username: string, password: string): Promise<string> {
  const getRes = await fetch(`${BASE}/login/`, { redirect: "manual" })
  const getSetCookies = getRes.headers.getSetCookie()
  const html = await getRes.text()

  const csrfMatch = html.match(/id="login_form"[\s\S]*?name="_csrf"\s+value="([^"]+)"/)
  if (!csrfMatch) throw new Error("Login failed: no CSRF token found")

  const allCookies = getSetCookies.map(c => c.split(";")[0]).join("; ")

  const res = await fetch(`${BASE}/login/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: allCookies,
    },
    body: new URLSearchParams({
      _csrf: csrfMatch[1],
      "FormLogin[login]": username,
      "FormLogin[password]": password,
    }),
    redirect: "manual",
  })

  const postSetCookies = res.headers.getSetCookie()
  const identityCookie = postSetCookies.find(c => c.startsWith("_identity="))
  if (!identityCookie) throw new Error("Login failed: no _identity cookie")
  return identityCookie.split(";")[0]
}

export function parseLikes(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  const cleaned = trimmed.replace(/\+$/, "")
  const n = parseInt(cleaned, 10)
  return isNaN(n) ? 0 : n
}

export function parseDate(text: string): Date {
  const m = text.trim().match(/(\d{2})\.(\d{2})\.(\d{4}),\s*(\d{2}):(\d{2})/)
  if (!m) throw new Error(`Cannot parse date: "${text}"`)
  const [, day, month, year, hour, minute] = m
  return new Date(`${year}-${month}-${day}T${hour}:${minute}:00+03:00`)
}

export function parseComments(html: string): Comment[] {
  const $ = cheerio.load(html)
  const comments: Comment[] = []

  $(".comments__item").each((_, el) => {
    const $el = $(el)

    const classAttr = $el.attr("class") ?? ""
    const idMatch = classAttr.match(/comments__item(\d+)/)
    if (!idMatch) return
    const id = idMatch[1]

    const authorDiv = $el.find(".comments__author > div").first()
    const authorLink = authorDiv.find("a").first()
    const author = authorLink.text().trim()
    const authorHref = authorLink.attr("href") ?? ""
    const authorIdMatch = authorHref.match(/\/personal\/(\d+)\//)
    const authorId = authorIdMatch?.[1] ?? ""

    let replyTo: string | undefined
    const allLinks = authorDiv.find("a")
    if (allLinks.length > 1) {
      replyTo = allLinks.eq(1).text().trim()
    }

    const $text = $el.find(".comments__text")
    $text.find("br").replaceWith("\n")
    const text = $text.text().trim()

    const images = $el
      .find(".attachment__item .attachment__zoom")
      .map((_, a) => $(a).attr("href"))
      .get()
      .filter(Boolean) as string[]

    const articleLink = $el.find(".comments__text").next("div").find("a").first()
    const articleTitle = articleLink.text().trim()
    const articleUrl = articleLink.attr("href") ?? ""

    const timeText = $el.find("time.comments__time").text().trim()
    let date: Date
    try {
      date = parseDate(timeText)
    } catch {
      date = new Date()
    }

    const likesText = $el.find(".comments__like-count").text().trim()
    const likes = parseLikes(likesText)

    const goHref = $el.find(".comments__option_go").attr("href") ?? ""
    const commentUrl = goHref ? `${BASE}${goHref}` : ""

    comments.push({
      id,
      author,
      authorId,
      replyTo,
      text,
      articleTitle,
      articleUrl,
      date,
      likes,
      commentUrl,
      ...(images.length > 0 && { images }),
    })
  })

  return comments
}

async function fetchCommentPage(
  path: string,
  cookie: string,
  page = 1,
): Promise<string> {
  const pageSuffix = page > 1 ? `page_${page}/` : ""
  const url = `${BASE}${path}${pageSuffix}`
  const res = await fetch(url, { headers: { Cookie: cookie } })
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${url}`)
  return res.text()
}

export interface ScrapeOpts {
  lastSeenId?: string | number
  maxComments?: number
  maxAge?: Date
  onPage?: (comments: Comment[]) => Promise<void>
}

export async function scrapeNewComments(
  cookie: string,
  opts: ScrapeOpts = {},
): Promise<Comment[]> {
  const { lastSeenId, maxComments, maxAge, onPage } = opts
  const all: Comment[] = []

  for (let page = 1; ; page++) {
    const html = await fetchCommentPage("/comment/last/", cookie, page)
    const comments = parseComments(html)
    if (comments.length === 0) break

    const pageComments: Comment[] = []
    let foundCutoff = false
    for (const c of comments) {
      if (lastSeenId && Number(c.id) <= Number(lastSeenId)) {
        foundCutoff = true
        break
      }
      if (maxAge && c.date < maxAge) {
        foundCutoff = true
        break
      }
      pageComments.push(c)
      if (maxComments && all.length + pageComments.length >= maxComments) {
        foundCutoff = true
        break
      }
    }

    all.push(...pageComments)
    if (onPage && pageComments.length > 0) await onPage(pageComments)
    if (foundCutoff) break
  }

  return all
}

function parseLastPage(html: string): number {
  const $ = cheerio.load(html)
  let max = 1
  $(".paginator__link").each((_, el) => {
    const href = $(el).attr("href") ?? ""
    const m = href.match(/page_(\d+)/)
    if (m) max = Math.max(max, Number(m[1]))
  })
  return max
}

export async function scrapeTopComments(cookie: string): Promise<Comment[]> {
  const page1 = await fetchCommentPage("/comment/top_2/", cookie)
  const lastPage = parseLastPage(page1)
  const all = parseComments(page1)

  for (let page = 2; page <= lastPage; page++) {
    const html = await fetchCommentPage("/comment/top_2/", cookie, page)
    all.push(...parseComments(html))
  }
  return all
}
