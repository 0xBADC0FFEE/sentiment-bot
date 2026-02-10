import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { AuthExpiredError, parseLikes, parseDate, parseComments } from "./scraper.js"

describe("AuthExpiredError", () => {
  it("is an Error with descriptive message", () => {
    const err = new AuthExpiredError()
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toBe("Auth cookie expired")
  })
})

describe("parseLikes", () => {
  it("parses positive likes", () => {
    expect(parseLikes("38+")).toBe(38)
    expect(parseLikes("1+")).toBe(1)
    expect(parseLikes("7+")).toBe(7)
  })

  it("parses negative likes", () => {
    expect(parseLikes("-3+")).toBe(-3)
    expect(parseLikes("-1+")).toBe(-1)
  })

  it("parses zero / empty", () => {
    expect(parseLikes("")).toBe(0)
    expect(parseLikes("  ")).toBe(0)
    expect(parseLikes("0+")).toBe(0)
  })
})

describe("parseDate", () => {
  it("parses dd.mm.yyyy, HH:MM format", () => {
    const d = parseDate("05.02.2026, 14:30")
    expect(d.getUTCFullYear()).toBe(2026)
    expect(d.getUTCMonth()).toBe(1)
    expect(d.getUTCDate()).toBe(5)
    expect(d.getUTCHours()).toBe(11)
    expect(d.getUTCMinutes()).toBe(30)
  })

  it("throws on invalid format", () => {
    expect(() => parseDate("invalid")).toThrow()
  })
})

describe("parseComments", () => {
  it("parses comment-last.html fixture", () => {
    const html = readFileSync("src/fixtures/comment-last.html", "utf-8")
    const comments = parseComments(html)

    expect(comments.length).toBeGreaterThan(0)

    const first = comments[0]
    expect(first.id).toBe("897832")
    expect(first.author).toBe("Игорь Чирков")
    expect(first.authorId).toBe("3133")
    expect(first.replyTo).toBeUndefined()
    expect(first.text).toContain("Рад за них")
    expect(first.articleTitle).toBe("Dow Jones 50000")
    expect(first.articleUrl).toBe("/post/dow_jones_50000_115649/")
    expect(first.likes).toBe(0)
    expect(first.commentUrl).toContain("comm_find=897832")
    expect(first.date).toBeInstanceOf(Date)

    const second = comments[1]
    expect(second.id).toBe("897831")
    expect(second.replyTo).toBe("Алекандр Холкин")
    expect(second.authorId).toBe("4530")
  })

  it("preserves line breaks from <br> tags", () => {
    const html = `
      <div class="comments__item comments__item111">
        <div class="comments__author"><div><a href="/personal/1/">User</a></div></div>
        <div class="comments__text">Line one<br>Line two<br/>Line three</div>
        <div><a href="/post/test/">Article</a></div>
        <time class="comments__time">01.01.2026, 12:00</time>
        <span class="comments__like-count">0+</span>
        <a class="comments__option_go" href="/post/test/?comm_find=111"></a>
      </div>`
    const [c] = parseComments(html)
    expect(c.text).toBe("Line one\nLine two\nLine three")
  })

  it("extracts attachment images", () => {
    const html = `
      <div class="comments__item comments__item222">
        <div class="comments__author"><div><a href="/personal/2/">Author</a></div></div>
        <div class="comments__text">Check this out</div>
        <div><a href="/post/test/">Article</a></div>
        <time class="comments__time">01.01.2026, 12:00</time>
        <span class="comments__like-count">5+</span>
        <a class="comments__option_go" href="/post/test/?comm_find=222"></a>
        <div class="attachment">
          <div class="attachment__list">
            <div class="attachment__item">
              <img class="attachment__photo" src="https://cdn.alenka.capital/pv_abc.png">
              <a class="attachment__zoom" href="https://cdn.alenka.capital/abc.png"></a>
            </div>
            <div class="attachment__item">
              <img class="attachment__photo" src="https://cdn.alenka.capital/pv_def.png">
              <a class="attachment__zoom" href="https://cdn.alenka.capital/def.png"></a>
            </div>
          </div>
        </div>
      </div>`
    const [c] = parseComments(html)
    expect(c.images).toEqual([
      "https://cdn.alenka.capital/abc.png",
      "https://cdn.alenka.capital/def.png",
    ])
  })

  it("omits images field when no attachments", () => {
    const html = `
      <div class="comments__item comments__item333">
        <div class="comments__author"><div><a href="/personal/3/">Author</a></div></div>
        <div class="comments__text">No pics</div>
        <div><a href="/post/test/">Article</a></div>
        <time class="comments__time">01.01.2026, 12:00</time>
        <span class="comments__like-count">0+</span>
        <a class="comments__option_go" href="/post/test/?comm_find=333"></a>
      </div>`
    const [c] = parseComments(html)
    expect(c.images).toBeUndefined()
  })

  it("parses comment-top.html fixture", () => {
    const html = readFileSync("src/fixtures/comment-top.html", "utf-8")
    const comments = parseComments(html)

    expect(comments.length).toBeGreaterThan(0)

    const first = comments[0]
    expect(first.likes).toBeGreaterThan(0)
    expect(first.id).toBeTruthy()
    expect(first.author).toBeTruthy()
    expect(first.articleTitle).toBeTruthy()
  })
})
