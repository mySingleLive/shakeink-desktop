import assert from "node:assert/strict"
import { test } from "node:test"
import type { Browser, Page } from "playwright-core"
import { expect } from "@playwright/test"
import { launch, withWorldline } from "../helpers/worldline-browser-fixture"
import { f60 } from "../helpers/worldline-f60"
import { f885, fCount } from "../helpers/worldline-f885"

/* docs/581 §3.2 WU-44–WU-47c and §5 WU-80/WU-81 (B layer, production build) / WU-83 on the event table, fixtures F60 and
 * F885 (synthetic). Timings are browser-fixture numbers, not the real Electron (E layer) measurement. */
let browser: Browser
test.before(async () => { browser = await launch() })
test.after(async () => { await browser?.close() })
// tsx keeps function names with a __name helper that does not exist inside page.evaluate.
const prep = (page: Page) => page.evaluate("globalThis.__name = f => f")
const table = async (page: Page) => { await prep(page); await page.getByRole("tab", { name: "事件表" }).click(); await page.locator("[data-event-table]").waitFor() }
const scroller = (page: Page) => page.locator("[data-table-scroller]")
const cardById = (page: Page, id: string) => page.locator(`[data-event-table] [data-event-card][data-event-id="${id}"]`)
const frames = (page: Page, n = 3) => page.evaluate(n => new Promise<void>(r => { const f = (k: number) => k ? requestAnimationFrame(() => f(k - 1)) : r(); f(n) }), n)
const settle = async (page: Page) => { await frames(page, 4); await page.waitForTimeout(150); await frames(page, 4) }
const setScroll = (page: Page, top: number) => scroller(page).evaluate((e, top) => { e.scrollTop = top }, top)
/** Screen y of a card relative to the scroller top, or null when it is not in the DOM. */
const cardY = (page: Page, id: string) => page.evaluate(id => {
  const sc = document.querySelector("[data-table-scroller]")!, el = sc.querySelector(`[data-event-card][data-event-id="${CSS.escape(id)}"]`)
  return el ? el.getBoundingClientRect().top - sc.getBoundingClientRect().top : null
}, id)
/** The card at the vertical middle of the scroller, and its screen position. */
const cardAtMiddle = (page: Page) => page.evaluate(() => {
  const sc = document.querySelector("[data-table-scroller]")!.getBoundingClientRect()
  const cards = [...document.querySelectorAll<HTMLElement>("[data-event-table] [data-event-card]")]
  for (let dy = 0; dy < 200; dy += 4) for (const y of [sc.top + sc.height / 2 + dy, sc.top + sc.height / 2 - dy]) {
    const hit = cards.find(c => { const r = c.getBoundingClientRect(); return /^n\d+$/.test(c.dataset.eventId!) && r.top + 4 < y && r.bottom - 4 > y && r.height <= 40 })
    if (hit) { const r = hit.getBoundingClientRect(); return { id: hit.dataset.eventId!, x: r.left + 40, y: r.top + r.height / 2 } }
  }
  return null
})
const tableOverlaps = (page: Page) => page.evaluate(() => {
  const list = [...document.querySelectorAll<HTMLElement>("[data-event-table] [data-event-card]")].map(c => c.getBoundingClientRect())
  let n = 0
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j]
    if (a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1) n++
  }
  return { n, cards: list.length }
})
const inUpperThird = (page: Page, id: string) => expect.poll(async () => {
  const y = await cardY(page, id), h = await scroller(page).evaluate(e => e.clientHeight)
  return y === null ? Infinity : Math.abs(y - h / 3)
}).toBeLessThanOrEqual(4)

test("WU-44: hovering a card thickens its lead to 1.6, enlarges its dot and shows its hidden time label", () => withWorldline(browser, f60(), async page => {
  await table(page)
  const id = await page.evaluate(() => {
    const labelled = new Set([...document.querySelectorAll<HTMLElement>("[data-rail-label]")].flatMap(l => l.dataset.labelFor!.split(" ")))
    // The last such dot: a recent day-precision event, whose label text is never empty.
    const dot = [...document.querySelectorAll<HTMLElement>("[data-rail-dot]:not([data-cluster])")].reverse().find(d => !labelled.has(d.dataset.eventId!))
    return dot?.dataset.eventId ?? null
  })
  assert.ok(id, "a dot without a visible label exists in F60")
  const lead = page.locator(`[data-rail-lead="${id}"]`), dot = page.locator(`[data-rail-dot][data-event-id="${id}"]`)
  assert.equal(await lead.evaluate(e => getComputedStyle(e).strokeWidth), "1px")
  const size = () => dot.evaluate(e => e.getBoundingClientRect().width)
  const w0 = await size()
  await page.locator(`[data-label-for~="${id}"]`).waitFor({ state: "detached" })
  await cardById(page, id!).locator("[data-card-title]").hover()
  await expect.poll(() => lead.evaluate(e => getComputedStyle(e).strokeWidth)).toBe("1.6px")
  await expect.poll(size).toBeGreaterThan(w0 + 1)
  await expect(page.locator(`[data-label-for~="${id}"]`)).toBeVisible()
  await page.mouse.move(5, 5)
  await expect.poll(() => lead.evaluate(e => getComputedStyle(e).strokeWidth)).toBe("1px")
}))

test("WU-45 / WU-47 (pointer anchor): Ctrl + wheel zooms in with the card under the pointer fixed; max 400%; 复位 returns 100%", () => withWorldline(browser, f885(), async page => {
  await table(page)
  const zoomValue = page.locator("[data-zoom-value]")
  await expect(zoomValue).toHaveText("100%")
  await setScroll(page, 12000)
  await settle(page)
  const at = (await cardAtMiddle(page))!
  assert.ok(/^n\d+$/.test(at.id), at.id)
  let next = ""
  for (let k = +at.id.slice(1) + 1; !next && k < +at.id.slice(1) + 6; k++) if (await cardY(page, `n${k}`) !== null) next = `n${k}`
  assert.ok(next, "a following root card is rendered")
  const gap = async () => (await cardY(page, next))! - (await cardY(page, at.id))!
  const gap0 = await gap()
  await page.mouse.move(at.x, at.y)
  await page.keyboard.down("Control")
  for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, -100); await page.waitForTimeout(80) }
  await page.keyboard.up("Control")
  await settle(page)
  const z = Number((await zoomValue.textContent())!.replace("%", ""))
  assert.ok(z > 100, `zoom ${z}`)
  const y1 = (await cardY(page, at.id))!
  assert.ok(Math.abs(y1 + 17 - at.y + (await scroller(page).boundingBox())!.y) < 2, `pointer card moved: ${at.y} → ${y1}`)
  assert.ok(await gap() > gap0 + 1, `root spacing grows: ${gap0} → ${await gap()}`)
  await page.keyboard.down("Control")
  for (let i = 0; i < 15; i++) { await page.mouse.wheel(0, -100); await page.waitForTimeout(40) }
  await page.keyboard.up("Control")
  await expect(zoomValue).toHaveText("400%")
  await page.keyboard.down("Control"); await page.mouse.wheel(0, -100); await page.keyboard.up("Control")
  await page.waitForTimeout(100)
  await expect(zoomValue).toHaveText("400%")
  await page.getByRole("button", { name: "复位" }).click()
  await expect(zoomValue).toHaveText("100%")
}))

test("WU-46: the sticky block shows the last year badge scrolled past and is empty back at the top", () => withWorldline(browser, f885(), async page => {
  await table(page)
  const sticky = page.locator("[data-sticky-year]")
  const badges = () => page.evaluate(() => {
    const sc = document.querySelector("[data-table-scroller]")!, top = sc.getBoundingClientRect().top
    return [...document.querySelectorAll<HTMLElement>('[data-rail-badge="year"]')].map(b => { const r = b.getBoundingClientRect(); return { y: r.top + r.height / 2 - top + sc.scrollTop, text: b.textContent! } })
  })
  // The year-1349 badge sits inside the long recent segment; find it by scrolling down until it is rendered.
  let target: { y: number; text: string } | undefined
  for (let s = 0; s < 40000 && !target; s += 800) {
    await setScroll(page, s); await settle(page)
    target = (await badges()).find(b => b.text.includes("1349"))
  }
  assert.ok(target, "a 1349 year badge is rendered")
  await setScroll(page, target!.y + 60); await settle(page)
  const top = await scroller(page).evaluate(e => e.scrollTop)
  const passed = (await badges()).filter(b => b.y < top).sort((a, b) => b.y - a.y)[0]
  assert.equal(passed.text, target!.text)
  await expect(sticky).toHaveText(passed.text)
  await setScroll(page, 10); await settle(page)
  await expect(sticky).toHaveText("")
}))

test("WU-47: F885 renders fewer than 200 cards; tree, search and period locate off-screen cards", () => withWorldline(browser, f885(), async page => {
  await table(page)
  await expect(page.locator("[data-event-table]")).toHaveAttribute("data-virtual", "")
  const count = await page.locator("[data-event-table] [data-event-card]").count()
  assert.ok(count > 0 && count < 200, `card DOM count ${count}`)
  assert.equal(await cardById(page, "n700").count(), 0, "n700 starts off-screen and unrendered")
  // Tree: click a far row.
  const tree = page.getByRole("tree", { name: "事件目录" })
  const row = tree.locator('[role="treeitem"][data-tree-id="n700"]')
  await row.scrollIntoViewIfNeeded()
  await row.click()
  await expect(cardById(page, "n700")).toHaveAttribute("data-selected", "")
  await inUpperThird(page, "n700")
  assert.ok(await page.locator("[data-event-table] [data-event-card]").count() < 200)
  // Search: a unique title near the start, after scrolling away.
  await setScroll(page, 0); await settle(page)
  const search = page.getByRole("searchbox", { name: "搜索事件" })
  await search.fill("近事650·")
  await expect(page.locator("[data-search-count]")).toHaveText("1 / 1")
  await search.press("Enter")
  await expect(cardById(page, "n650")).toHaveAttribute("data-hit", "")
  await inUpperThird(page, "n650")
  await search.press("Escape")
  // Period: 钟楼风波 (第五纪1349-03-01 … 06-01) locates its first event.
  await setScroll(page, 0); await settle(page)
  await page.getByRole("combobox", { name: "时期" }).selectOption("p-1349")
  const selected = page.locator("[data-event-table] [data-event-card][data-selected]")
  await expect(selected).toHaveCount(1)
  const id = (await selected.getAttribute("data-event-id"))!
  await inUpperThird(page, id)
}))

test("WU-47b: all expanded, scrolling up while cards above get measured keeps the first visible card in place; Ctrl + wheel keeps the pointer card", () => withWorldline(browser, f885(), async page => {
  await table(page)
  await page.locator("[data-toggle-all]").click()
  await expect(page.locator("[data-toggle-all]")).toHaveText(/全部收起/)
  const total = await scroller(page).evaluate(e => e.scrollHeight)
  await setScroll(page, Math.round(total / 2)); await settle(page)
  for (let step = 0; step < 3; step++) {
    const before = await page.evaluate(() => {
      const sc = document.querySelector<HTMLElement>("[data-table-scroller]")!
      sc.scrollTop -= sc.clientHeight
      const top = sc.getBoundingClientRect().top
      const first = [...sc.querySelectorAll<HTMLElement>("[data-event-card]")].map(c => ({ id: c.dataset.eventId!, y: c.getBoundingClientRect().top - top })).filter(c => c.y >= 0).sort((a, b) => a.y - b.y)[0]
      return first
    })
    assert.ok(before, "a card is in view after scrolling up")
    await settle(page)
    const after = await cardY(page, before.id)
    assert.ok(after !== null && Math.abs(after - before.y) < 2, `step ${step}: ${before.id} moved ${before.y} → ${after}`)
  }
  const at = (await page.evaluate(() => {
    const sc = document.querySelector("[data-table-scroller]")!.getBoundingClientRect()
    const c = [...document.querySelectorAll<HTMLElement>("[data-event-table] [data-event-card]")].map(c => ({ id: c.dataset.eventId!, r: c.getBoundingClientRect() }))
      .find(c => c.r.top > sc.top + 40 && c.r.top < sc.top + sc.height - 80)
    return c ? { id: c.id, x: c.r.left + 40, y: c.r.top + 10, top: c.r.top - sc.top } : null
  }))!
  await page.mouse.move(at.x, at.y)
  await page.keyboard.down("Control")
  for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, -100); await page.waitForTimeout(80) }
  await page.keyboard.up("Control")
  await settle(page)
  const y = await cardY(page, at.id)
  assert.ok(y !== null && Math.abs(y - at.top) < 2, `pointer card moved ${at.top} → ${y}`)
}))

test("WU-47c: 301 events stay virtualized through fold and unfold; 300 events render every unfolded card at any viewport", async () => {
  await withWorldline(browser, fCount(301), async page => {
    await table(page)
    const t = page.locator("[data-event-table]")
    await expect(t).toHaveAttribute("data-virtual", "")
    assert.ok(await page.locator("[data-event-table] [data-event-card]").count() < 301)
    await cardById(page, "p0").locator("[data-fold]").click()
    await expect(cardById(page, "p0c0")).toHaveCount(0)
    await expect(t).toHaveAttribute("data-virtual", "")
    await cardById(page, "p0").locator("[data-fold]").click()
    await expect(cardById(page, "p0c0")).toHaveCount(1)
    await expect(t).toHaveAttribute("data-virtual", "")
  })
  await withWorldline(browser, fCount(300), async page => {
    await table(page)
    const t = page.locator("[data-event-table]")
    assert.equal(await t.getAttribute("data-virtual"), null)
    assert.equal(await page.locator("[data-event-table] [data-event-card]").count(), 300)
    await page.setViewportSize({ width: 1440, height: 600 }); await settle(page)
    assert.equal(await page.locator("[data-event-table] [data-event-card]").count(), 300)
    await setScroll(page, 5000); await settle(page)
    assert.equal(await page.locator("[data-event-table] [data-event-card]").count(), 300)
    await cardById(page, "p0").locator("[data-fold]").click()
    await expect(page.locator("[data-event-table] [data-event-card]")).toHaveCount(295)
  })
})

test("WU-80 / WU-81 (B layer): F885 table first render < 500 ms; expanding one card relayouts < 100 ms", () => withWorldline(browser, f885(), async page => {
  await prep(page)
  const first = await page.evaluate(() => new Promise<number>(resolve => {
    const tab = [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find(t => t.textContent === "事件表")!
    const t0 = performance.now()
    tab.click()
    const wait = () => document.querySelector("[data-event-table] [data-event-card]") ? requestAnimationFrame(() => resolve(performance.now() - t0)) : requestAnimationFrame(wait)
    wait()
  }))
  console.log(`WU-80 B: table first render ${first.toFixed(1)} ms`)
  assert.ok(first < 500, `first render ${first} ms`)
  await settle(page)
  const relayout = await page.evaluate(() => new Promise<number>((resolve, reject) => {
    const sc = document.querySelector("[data-table-scroller]")!
    const cards = [...sc.querySelectorAll<HTMLElement>("[data-event-card]")].filter(c => /^[na]\d+$/.test(c.dataset.eventId!))
    const at = cards.findIndex((c, i) => i > 2 && i + 1 < cards.length && cards[i + 1].getBoundingClientRect().top > c.getBoundingClientRect().bottom)
    if (at < 0) return reject(Error("no pair of root cards in view: " + cards.length))
    const card = cards[at], id = card.dataset.eventId!, nextId = cards[at + 1].dataset.eventId!
    const t0 = performance.now()
    card.querySelector<HTMLElement>("[data-card-title]")!.click()
    const check = () => {
      const a = sc.querySelector(`[data-event-card][data-event-id="${id}"]`)!.getBoundingClientRect()
      const b = sc.querySelector(`[data-event-card][data-event-id="${nextId}"]`)?.getBoundingClientRect()
      if (a.height > 40 && b && b.top >= a.bottom - 1) return resolve(performance.now() - t0)
      if (performance.now() - t0 > 2000) return reject(Error("relayout did not settle"))
      requestAnimationFrame(check)
    }
    requestAnimationFrame(check)
  }))
  console.log(`WU-81 B: expand one card to relayout ${relayout.toFixed(1)} ms`)
  assert.ok(relayout < 100, `relayout ${relayout} ms`)
}))

test("WU-83: F885 all expanded has 0 card overlaps in the table and in the timeline", () => withWorldline(browser, f885(), async page => {
  await table(page)
  await page.locator("[data-toggle-all]").click()
  await expect(page.locator("[data-toggle-all]")).toHaveText(/全部收起/)
  const total = await scroller(page).evaluate(e => e.scrollHeight)
  for (const f of [0, 0.25, 0.5, 0.75, 0.98]) {
    await setScroll(page, Math.round(total * f)); await settle(page)
    const o = await tableOverlaps(page)
    assert.ok(o.cards > 0, `cards rendered at ${f}`)
    assert.equal(o.n, 0, `table overlaps at ${f} (${o.cards} cards)`)
  }
  await page.getByRole("tab", { name: "时间线" }).click()
  await page.locator("[data-timeline-plane]").waitFor()
  const toggle = page.locator("[data-toggle-all]")
  if (!/全部收起/.test((await toggle.textContent()) ?? "")) await toggle.click()
  await expect(toggle).toHaveText(/全部收起/)
  await settle(page)
  const n = await page.evaluate(() => {
    const list = [...document.querySelectorAll<HTMLElement>("[data-timeline-plane] [data-event-card]")].map(c => c.getBoundingClientRect())
    let n = 0
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j]
      if (a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1) n++
    }
    return n
  })
  assert.equal(n, 0, "timeline overlaps")
}))
