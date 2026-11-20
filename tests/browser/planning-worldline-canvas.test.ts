import assert from "node:assert/strict"
import { test } from "node:test"
import type { Browser, Page } from "playwright-core"
import { expect } from "@playwright/test"
import { launch, revealTimelineCard, withWorldline, type WorldlineView } from "../helpers/worldline-browser-fixture"
import { f60 } from "../helpers/worldline-f60"
import { f885 } from "../helpers/worldline-f885"

/* docs/583: collapsed card widths follow the title (CW-10 … CW-13), the timeline canvas drags in every direction
 * (CP-01, CP-02) and the wheel zooms, Shift + wheel pans, ⌘/Alt + wheel scrolls (CP-03 … CP-07). Synthetic data only. */
let browser: Browser
test.before(async () => { browser = await launch() })
test.after(async () => { await browser?.close() })
const tab = (page: Page, name: "时间线" | "事件表") => page.getByRole("tab", { name }).click()
const openTimeline = async (page: Page) => { await tab(page, "时间线"); await page.locator("[data-timeline-plane]").waitFor() }
const lane = (page: Page) => page.locator("[data-timeline-lane]")
const viewWindow = (page: Page) => page.getByRole("slider", { name: /全局缩略/ }).getAttribute("aria-valuenow")
const spanOf = (page: Page) => page.locator("[data-timeline]").evaluate(e => Number(e.getAttribute("data-view-span")))
/** docs/584: the vertical offset is the store's y; "scrollTop" here means −y, the old scroll position. */
const scrollTop = (page: Page) => page.locator("[data-timeline]").evaluate(e => -Number(e.getAttribute("data-view-y")) + 0)
type Box = { id: string; x: number; y: number; w: number; h: number; vis: boolean }
const snap = (page: Page) => page.evaluate(() => {
  const l = document.querySelector("[data-timeline-lane]")!.getBoundingClientRect()
  return [...document.querySelectorAll<HTMLElement>("[data-timeline-plane] [data-event-card]")].map(c => {
    const r = c.getBoundingClientRect()
    return { id: c.dataset.eventId!, x: r.left, y: r.top, w: r.width, h: r.height, vis: r.right > l.left && r.left < l.right && r.bottom > l.top && r.top < l.bottom }
  })
}) as Promise<Box[]>
const overlaps = (list: Box[]) => {
  let n = 0
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j]
    if (a.x < b.x + b.w - 1 && a.x + a.w > b.x + 1 && a.y < b.y + b.h - 1 && a.y + a.h > b.y + 1) n++
  }
  return n
}
async function emptyPoint(page: Page) {
  return (await page.evaluate(() => {
    const l = document.querySelector("[data-timeline-lane]")!.getBoundingClientRect()
    for (let y = l.top + 140; y < l.bottom - 90; y += 10) for (let x = l.left + 360; x < l.right - 200; x += 20) {
      const el = document.elementFromPoint(x, y)
      if (el && !el.closest("[data-event-card],[data-family-frame],[data-minimap]") && el.closest("[data-timeline-lane]")) return { x, y }
    }
    return null
  }))!
}
/** Moves the canvas down by 160px with two ↓ (80px each) and records the baseline, so every "scrollTop" below reads
 * as before (160 after this). The canvas is unbounded (docs/584), so there is always room both ways. */
let base = 0
async function scrollable(page: Page) {
  await page.locator("[data-timeline]").focus()
  const start = await scrollTop(page)
  for (let i = 0; i < 2; i++) await page.keyboard.press("ArrowDown")
  assert.equal(await scrollTop(page) - start, 160)
  base = start
}
const rel = async (page: Page) => (await scrollTop(page)) - base
/** Width the head of a collapsed card needs: every head child's box, the 9px gaps, padding and border. */
const slack = (page: Page, id: string) => page.locator(`[data-timeline-plane] [data-event-card][data-event-id="${id}"]`).evaluate(card => {
  const head = card.firstElementChild as HTMLElement, title = head.querySelector<HTMLElement>("[data-card-title]")!
  const range = document.createRange(); range.selectNodeContents(title)
  const text = range.getBoundingClientRect().width
  const others = [...head.children].filter(c => c !== title).reduce((n, c) => n + c.getBoundingClientRect().width, 0)
  const need = 2 + 14 + 6 + others + text + 9 * (head.children.length - 1)
  return card.getBoundingClientRect().width - need
})

test("CW-10: timeline collapsed cards follow their titles within [150, 340] / [150, 300]; open is 420; no overlap", () => withWorldline(browser, f60(), async page => {
  await openTimeline(page)
  const cards = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-timeline-plane] [data-event-card]")].map(c => {
    const t = c.querySelector<HTMLElement>("[data-card-title]")!
    return { id: c.dataset.eventId!, title: t.textContent!, w: Math.round(c.getBoundingClientRect().width), fade: t.hasAttribute("data-fade"), parent: !!c.querySelector("[data-fold]"), depth: c.closest<HTMLElement>("[data-event]")!.dataset.family !== c.dataset.eventId }
  }))
  assert.ok(cards.length >= 10)
  assert.ok(new Set(cards.map(c => c.w)).size > 3, `widths vary: ${cards.map(c => c.w)}`)
  for (const c of cards) {
    const cap = c.depth ? 300 : 340
    if (!c.parent) assert.ok(c.w >= 150 && c.w <= cap, `${c.title} ${c.w}`)
    else assert.ok(c.w >= 260, `parent ${c.title} ${c.w}`)
  }
  const short = cards.find(c => c.title === "七王盟约签订")!, long = cards.find(c => c.title === "钟楼守夜人在雾夜失踪")!
  assert.ok(short.w < long.w, `${short.w} < ${long.w}`)
  for (const c of cards.filter(c => !c.parent && c.w < (c.depth ? 300 : 340))) {
    assert.equal(c.fade, false, `${c.title} fades at ${c.w}`)
    const s = await slack(page, c.id)
    assert.ok(s >= -1 && s <= 24, `${c.title} slack ${s}`)
  }
  assert.equal(overlaps((await snap(page)).filter(b => b.vis)), 0)
  const t = page.locator(`[data-timeline-plane] [data-event-card][aria-label="七王盟约签订"]`)
  await t.locator("[data-card-expand]").click()
  await expect.poll(() => t.evaluate(e => Math.round(e.getBoundingClientRect().width))).toBe(420)
}))

test("CW-11: table collapsed cards follow their titles within [220, 880]; expanding one leaves the others", () => withWorldline(browser, f60(), async page => {
  await tab(page, "事件表")
  // docs/588 §1: a parent card heads its group box at the box's full width; the title-width rule is for the others.
  const widths = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll<HTMLElement>("[data-event-table] [data-event-card]")].filter(c => !c.closest("[data-event-group]") || c.parentElement!.parentElement!.querySelector(":scope > div > [data-event-card]") !== c).map(c => [c.getAttribute("aria-label")!, Math.round(c.getBoundingClientRect().width)])))
  assert.ok(await page.locator("[data-event-group]").evaluateAll(gs => gs.every(g => Math.abs(g.querySelector(":scope > div > [data-event-card]")!.getBoundingClientRect().width - g.getBoundingClientRect().width) <= 1)))
  const w0 = await widths()
  const all = Object.values(w0)
  assert.ok(new Set(all).size > 3, `widths vary: ${all}`)
  assert.ok(all.every(w => w >= 220 && w <= 880), JSON.stringify(w0))
  assert.ok(w0["七王盟约签订"] < w0["钟楼守夜人在雾夜失踪"])
  const c = page.locator(`[data-event-table] [data-event-card][aria-label="七王盟约签订"]`)
  await c.locator("h3").click()
  await expect(c).toHaveAttribute("aria-expanded", "true")
  assert.ok(await c.evaluate(e => e.getBoundingClientRect().width) <= 920)
  const w1 = await widths()
  for (const [k, v] of Object.entries(w0)) if (k !== "七王盟约签订" && k in w1) assert.equal(w1[k], v, k)
  assert.ok(await page.locator("[data-event-group]").evaluateAll(gs => gs.every(g => g.getBoundingClientRect().width <= 940)))
}))

test("CW-12: at 470px the table's collapsed cards stay inside the card column", () => withWorldline(browser, f60(), async page => {
  await tab(page, "事件表")
  const out = await page.evaluate(() => {
    const col = document.querySelector("[data-event-table]")!.getBoundingClientRect()
    return [...document.querySelectorAll<HTMLElement>("[data-event-table] [data-event-card]")].filter(c => c.getBoundingClientRect().right > col.right + 1).length
  })
  assert.equal(out, 0)
}, { width: 470 }))

/** One leaf with three known people; removing them from the character list narrows that card (583 CW-13). */
function withPeople(): WorldlineView {
  const v = f60(), d = v.data as any
  const leaf = d.events.find((e: any) => e.title === "七王盟约签订")
  leaf.people = v.characters.slice(0, 3).map(c => c.id)
  return v
}
test("CW-13: removing a card's people from the character list narrows it to the no-people width", () => withWorldline(browser, withPeople(), async page => {
  await openTimeline(page)
  const card = page.locator(`[data-timeline-plane] [data-event-card][aria-label="七王盟约签订"]`)
  const w0 = await card.evaluate(e => e.getBoundingClientRect().width)
  const ids = await card.evaluate(() => (globalThis as any).planningState().data.events.find((e: any) => e.title === "七王盟约签订").people as string[])
  await page.evaluate(gone => { const s = (globalThis as any).planningState(); s.characters = s.characters.filter((c: any) => !gone.includes(c.id)); return (globalThis as any).refetchWorldline() }, ids)
  await expect.poll(() => card.evaluate(e => e.getBoundingClientRect().width)).toBeLessThan(w0 - 20)
  await expect(card.locator("[data-avatars]")).toHaveCount(0)
  const s = await slack(page, await card.getAttribute("data-event-id") as string)
  assert.ok(s >= -1 && s <= 24, `slack ${s}`)
  assert.equal(overlaps((await snap(page)).filter(b => b.vis)), 0)
}))

test("CP-01: a diagonal drag pans the window and scrolls the lane; cards only scroll; no text selected; click keeps arrow keys", () => withWorldline(browser, f60(), async page => {
  await openTimeline(page)
  await scrollable(page)
  const v0 = await viewWindow(page), before = await snap(page)
  const p = await emptyPoint(page)
  // docs/584: the canvas pans with the middle button.
  await page.mouse.move(p.x, p.y); await page.mouse.down({ button: "middle" })
  let worst = 0
  for (let k = 1; k <= 12; k++) { await page.mouse.move(p.x - 300 * k / 12, p.y - 120 * k / 12); worst = Math.max(worst, overlaps((await snap(page)).filter(b => b.vis))) }
  await page.mouse.up({ button: "middle" })
  assert.notEqual(await viewWindow(page), v0)
  assert.ok(Math.abs(await rel(page) - 280) <= 2, `scrollTop ${await rel(page)}`)
  assert.equal(worst, 0)
  assert.equal(await page.evaluate(() => getSelection()!.toString()), "")
  // Same scale, so every card kept its plane y: the visible ones moved up by the scrolled amount.
  const after = new Map((await snap(page)).map(b => [b.id, b]))
  const dys = before.filter(b => after.has(b.id)).map(b => Math.round(after.get(b.id)!.y - b.y))
  assert.ok(dys.length > 3 && dys.every(d => Math.abs(d + 120) <= 2), JSON.stringify(dys))
  // A click on empty space still focuses the timeline: → pans.
  const q = await emptyPoint(page)
  await page.mouse.click(q.x, q.y)
  const v1 = await viewWindow(page)
  await page.keyboard.press("ArrowRight")
  await expect.poll(() => viewWindow(page)).not.toBe(v1)
}))

test("CP-02: Esc during a diagonal drag restores both the window and the lane scroll", () => withWorldline(browser, f60(), async page => {
  await openTimeline(page)
  await scrollable(page)
  const v0 = await viewWindow(page)
  const p = await emptyPoint(page)
  await page.mouse.move(p.x, p.y); await page.mouse.down({ button: "middle" })
  await page.mouse.move(p.x - 250, p.y - 100, { steps: 6 })
  assert.notEqual(await rel(page), 160)
  await page.keyboard.press("Escape")
  await page.mouse.up({ button: "middle" })
  assert.equal(await viewWindow(page), v0)
  assert.equal(await rel(page), 160)
}))

test("CP-03: the plain wheel zooms around the pointer: time and card under it stay; 120 and 100 deltas are one step", () => withWorldline(browser, f60(), async page => {
  await openTimeline(page)
  const title = page.locator(`[data-timeline-plane] [data-event-card][aria-label="钟楼守夜人在雾夜失踪"] [data-card-title]`)
  const r0 = (await title.boundingBox())!
  const px = r0.x + 20, py = r0.y + r0.height / 2
  await page.mouse.move(px, py)
  const at = () => page.evaluate(x => {
    const tl = document.querySelector<HTMLElement>("[data-timeline]")!, mm = document.querySelector<HTMLElement>("[data-minimap]")!
    const lane = document.querySelector("[data-timeline-lane]")!.getBoundingClientRect()
    const span = Number(tl.dataset.viewSpan), start = Number(mm.getAttribute("aria-valuenow"))
    return start + ((x - lane.left - 14) / (lane.width - 28)) * span
  }, px)
  const s0 = await spanOf(page), t0 = await at(), top0 = await scrollTop(page)
  await page.mouse.wheel(0, 120)
  await expect.poll(() => spanOf(page)).not.toBe(s0)
  await page.waitForTimeout(150)
  const s1 = await spanOf(page)
  assert.ok(s1 / s0 > 1.1 && s1 / s0 < 1.3, `ratio ${s1 / s0}`)
  // The time under the pointer stays within 2px.
  assert.ok(Math.abs(await at() - t0) / s1 * (await lane(page).evaluate(l => l.clientWidth - 28)) < 2 + 1, "time under the pointer")
  const r1 = (await title.boundingBox())!
  assert.ok(Math.abs(r1.y - r0.y) < 2, `card y ${r0.y} → ${r1.y}`)
  void top0
  await page.mouse.wheel(0, -120)
  await expect.poll(() => spanOf(page)).toBeLessThan(s1)
  await page.waitForTimeout(150)
  const s2 = await spanOf(page)
  await page.mouse.wheel(0, 100)
  await expect.poll(() => spanOf(page)).not.toBe(s2)
  await page.waitForTimeout(150)
  const r = (await spanOf(page)) / s2
  assert.ok(r > 1.1 && r < 1.3, `100 ratio ${r}`)
}))

test("CP-04: Alt + wheel and ⌘ + wheel only scroll the lane", () => withWorldline(browser, f60(), async page => {
  await openTimeline(page)
  await scrollable(page)
  const p = await emptyPoint(page)
  await page.mouse.move(p.x, p.y)
  const v0 = await viewWindow(page), s0 = await spanOf(page)
  await page.keyboard.down("Alt"); await page.mouse.wheel(0, 120); await page.keyboard.up("Alt")
  await expect.poll(() => rel(page)).toBeGreaterThan(270)
  assert.ok(Math.abs(await rel(page) - 280) <= 2)
  await page.keyboard.down("Meta"); await page.mouse.wheel(0, -120); await page.keyboard.up("Meta")
  await expect.poll(() => rel(page)).toBeLessThan(170)
  assert.ok(Math.abs(await rel(page) - 160) <= 2)
  assert.equal(await viewWindow(page), v0)
  assert.equal(await spanOf(page), s0)
}))

test("CP-05: Shift + wheel pans only, from deltaY or from macOS's converted deltaX", () => withWorldline(browser, f60(), async page => {
  await openTimeline(page)
  await scrollable(page)
  const p = await emptyPoint(page)
  await page.mouse.move(p.x, p.y)
  const s0 = await spanOf(page)
  let v = await viewWindow(page)
  await page.keyboard.down("Shift"); await page.mouse.wheel(0, 120); await page.keyboard.up("Shift")
  await expect.poll(() => viewWindow(page)).not.toBe(v); v = await viewWindow(page)
  await page.keyboard.down("Shift"); await page.mouse.wheel(120, 0); await page.keyboard.up("Shift")
  await expect.poll(() => viewWindow(page)).not.toBe(v)
  assert.equal(await spanOf(page), s0)
  assert.equal(await rel(page), 160)
}))

/** One extra root event whose fact is a wide Markdown table (583 CP-06); the shared F60 stays unchanged. */
function withTable(): WorldlineView {
  const v = f60(), d = v.data as any
  const host = d.events.find((e: any) => e.title === "七王盟约签订")
  const cols = Array.from({ length: 14 }, (_, i) => `列${i + 1}很宽的表头文字`)
  host.fact = `开头一段普通文字，用来放置指针。\n\n| ${cols.join(" | ")} |\n|${cols.map(() => "---").join("|")}|\n| ${cols.map((_, i) => `单元格内容${i}`).join(" | ")} |`
  return v
}
test("CP-06: a wheel over a scrollable table inside an open card scrolls the table until its end; elsewhere it zooms", () => withWorldline(browser, withTable(), async page => {
  await openTimeline(page)
  const card = page.locator(`[data-timeline-plane] [data-event-card][aria-label="七王盟约签订"]`)
  // docs/592 R1: two-line titles make the families taller; bring the card into the lane first.
  await revealTimelineCard(page, card)
  await card.locator("[data-card-expand]").click()
  const table = card.locator("table")
  await table.waitFor()
  const scroller = card.locator("[data-markdown-preview] table").evaluateHandle(t => {
    let el: HTMLElement | null = t as HTMLElement
    while (el && el.scrollWidth <= el.clientWidth + 1) el = el.parentElement
    return el
  })
  const left = () => scroller.then(h => h.evaluate(e => (e as HTMLElement).scrollLeft))
  const tb = (await table.boundingBox())!
  await page.mouse.move(tb.x + 30, tb.y + tb.height / 2)
  const v0 = await viewWindow(page), s0 = await spanOf(page)
  await page.mouse.wheel(120, 0)
  await expect.poll(left).toBeGreaterThan(0)
  assert.equal(await viewWindow(page), v0)
  // Ctrl + wheel over the table still zooms.
  await page.keyboard.down("Control"); await page.mouse.wheel(0, 120); await page.keyboard.up("Control")
  await expect.poll(() => spanOf(page)).not.toBe(s0)
  // At the table's right end a horizontal wheel pans the window.
  await scroller.then(h => h.evaluate(e => { (e as HTMLElement).scrollLeft = 1e6 }))
  const v1 = await viewWindow(page)
  await page.mouse.wheel(120, 0)
  await expect.poll(() => viewWindow(page)).not.toBe(v1)
  // Over the plain paragraph the plain wheel zooms.
  const para = (await card.locator("[data-markdown-preview] p").first().boundingBox())!
  await page.mouse.move(para.x + 10, para.y + para.height / 2)
  const s1 = await spanOf(page)
  await page.mouse.wheel(0, 120)
  await expect.poll(() => spanOf(page)).not.toBe(s1)
}))

test("CP-07: 30 small wheel steps on F885 zoom out steadily with at most two long tasks and no overlap", () => withWorldline(browser, f885(), async page => {
  await openTimeline(page)
  const box = (await lane(page).boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.evaluate(() => {
    (globalThis as any).longTasks = 0
    new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.duration > 50) (globalThis as any).longTasks++ }).observe({ type: "longtask" })
  })
  const s0 = await spanOf(page)
  const spans: number[] = []
  for (let i = 0; i < 30; i++) { await page.mouse.wheel(0, 4); await page.waitForTimeout(8); spans.push(await spanOf(page)) }
  await page.waitForTimeout(300)
  const s1 = await spanOf(page)
  assert.ok(s1 > s0 * 1.2, `span ${s0} → ${s1}`)
  for (let i = 1; i < spans.length; i++) assert.ok(spans[i] >= spans[i - 1], `monotonic at ${i}`)
  const long = await page.evaluate(() => (globalThis as any).longTasks as number)
  console.log(`CP-07 long tasks > 50ms: ${long}`)
  assert.ok(long <= 2, `long tasks ${long}`)
  assert.equal(overlaps((await snap(page)).filter(b => b.vis)), 0)
}))

test("CP-08: footer and zoom-control hints describe the new wheel rules per platform and view", async () => {
  await withWorldline(browser, f60(), async page => {
    await openTimeline(page)
    await expect(page.getByText("拖动空白处移动画布 · 滚轮缩放 · Shift + 滚轮横移 · ⌘/⌥ + 滚轮竖移 · 双击卡片原位编辑")).toBeVisible()
    await expect(page.locator("[title='缩放时间轴间距（也可滚轮）']")).toHaveCount(1)
    await tab(page, "事件表")
    await expect(page.locator("[title='缩放时间轴（也可 Ctrl + 滚轮）']")).toHaveCount(1)
  }, { controller: true })
  await withWorldline(browser, f60(), async page => {
    await openTimeline(page)
    await expect(page.getByText("拖动空白处移动画布 · 滚轮缩放 · Shift + 滚轮横移 · Alt + 滚轮竖移 · 双击卡片原位编辑")).toBeVisible()
  })
})

test("CW-14: a single click on an open card collapses it shortly after; a double click on it opens the editor", () => withWorldline(browser, f60(), async page => {
  await tab(page, "事件表")
  const c = page.locator(`[data-event-table] [data-event-card][aria-label="七王盟约签订"]`)
  await c.locator("h3").click()
  await expect(c).toHaveAttribute("aria-expanded", "true")
  await c.locator("h3").click()
  await expect(c).toHaveAttribute("aria-expanded", "false", { timeout: 1000 })
  await c.locator("h3").click()
  await expect(c).toHaveAttribute("aria-expanded", "true")
  await c.locator("h3").dblclick()
  await expect(page.getByRole("button", { name: "保存事件", exact: true })).toBeVisible()
  await expect(c).toHaveAttribute("aria-expanded", "true")
}))

test("CW-15: a click on another card during a pending collapse still collapses the first; 全部展开 cancels it", () => withWorldline(browser, f60(), async page => {
  await tab(page, "事件表")
  const a = page.locator(`[data-event-table] [data-event-card][aria-label="七王盟约签订"]`)
  const b = page.locator(`[data-event-table] [data-event-card][aria-label="王立大学建校"]`)
  await a.locator("h3").click()
  await expect(a).toHaveAttribute("aria-expanded", "true")
  await a.locator("h3").click()
  await b.locator("h3").click()
  await expect(b).toHaveAttribute("aria-expanded", "true")
  await expect(a).toHaveAttribute("aria-expanded", "false")
  await page.waitForTimeout(400)
  await expect(a).toHaveAttribute("aria-expanded", "false")
  // A pending collapse, then 全部展开: every card stays open.
  await b.locator("h3").click()
  await page.locator("[data-toggle-all]").click()
  await page.waitForTimeout(400)
  await expect(b).toHaveAttribute("aria-expanded", "true")
  await expect(page.locator("[data-toggle-all]")).toContainText("全部收起")
}))

test("CP-09: Shift + vertical wheel over a scrollable table scrolls the table before the canvas pans", () => withWorldline(browser, withTable(), async page => {
  await openTimeline(page)
  const card = page.locator(`[data-timeline-plane] [data-event-card][aria-label="七王盟约签订"]`)
  await card.locator("[data-card-expand]").click()
  const table = card.locator("table"); await table.waitFor()
  const tb = (await table.boundingBox())!
  await page.mouse.move(tb.x + 30, tb.y + tb.height / 2)
  const v0 = await viewWindow(page)
  await page.keyboard.down("Shift"); await page.mouse.wheel(0, 120); await page.keyboard.up("Shift")
  await expect.poll(() => table.evaluate(t => t.scrollLeft)).toBeGreaterThan(0)
  assert.equal(await viewWindow(page), v0)
}))
