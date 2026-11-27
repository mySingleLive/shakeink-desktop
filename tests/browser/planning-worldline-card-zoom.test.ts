import assert from "node:assert/strict"
import { test } from "node:test"
import type { Browser, Locator, Page } from "playwright-core"
import { expect } from "@playwright/test"
import { launch, revealTimelineCard, withWorldline } from "../helpers/worldline-browser-fixture"
import { f60 } from "../helpers/worldline-f60"
import { f885 } from "../helpers/worldline-f885"
import { ZOOM_GAP, zoomView } from "../helpers/worldline-zoom"

/* docs/592 ZB-01 … ZB-27, docs/593 ZB-28 … ZB-33: two-line titles, timeline zoom levels, time points, stacked parents, hover. Fixtures zoomView
 * (tests/helpers/worldline-zoom.ts), F60 and F885 on the in-memory fixture API (not a real-target proof, §8). Zoom
 * levels are on (`zoomLevels: true`). Expected values follow docs/592 / docs/593 (thresholds 160 / 40 / 10 / 2.5 / 0.6 /
 * 0.15 px, ×1.15 back;
 * zoom 0.75 at d ≤ 40), not the page's code. d is read from the page: 720 h × plot width / window span. */
let browser: Browser
test.before(async () => { browser = await launch() })
test.after(async () => { await browser?.close() })

const Z = { zoomLevels: true } as const
/** tsx names arrow functions with __name(); page.evaluate bodies need it defined in the page (as RM-B* do). */
const W = (view: Parameters<typeof withWorldline>[1], body: (page: Page) => Promise<void>, options?: Parameters<typeof withWorldline>[3]) =>
  withWorldline(browser, view, async page => { await page.evaluate("globalThis.__name = f => f"); await body(page) }, options)
const frames = (page: Page, n = 3) => page.evaluate(n => new Promise<void>(r => { const f = (k: number) => k ? requestAnimationFrame(() => f(k - 1)) : r(); f(n) }), n)
const tab = (page: Page, name: "时间线" | "事件表") => page.getByRole("tab", { name }).click()
const openTimeline = async (page: Page) => { await tab(page, "时间线"); await page.locator("[data-timeline-plane]").waitFor(); await frames(page) }
const card = (page: Page, title: string) => page.locator(`[data-timeline-plane] [data-event-card][aria-label="${title}"]`)
const cardById = (page: Page, id: string) => page.locator(`[data-timeline-plane] [data-event-card][data-event-id="${id}"]`)
const pointById = (page: Page, id: string) => page.locator(`[data-timeline-plane] [data-event-point][data-event-id="${id}"]`)
const posts = (page: Page) => page.evaluate(() => (globalThis as any).posts.length as number)
/** Crowding d in px: the median root gap (720 h for zoomView) on screen. */
const dOf = (page: Page, gap = ZOOM_GAP) => page.evaluate(g => {
  const t = document.querySelector("[data-timeline]")!, w = document.querySelector("[data-timeline-lane]")!.clientWidth - 28
  return (g * w) / Number(t.getAttribute("data-view-span"))
}, gap)
/** Wheel until d is inside [lo, hi): coarse steps (×1.2) then fine ones (×1.009, review round 2). The wheel sits on
 * event `at` (card or point) when it is drawn, so zooming keeps that event at its x; else at the lane centre. */
async function zoomTo(page: Page, lo: number, hi: number, at?: string, gap = ZOOM_GAP) {
  const l = (await page.locator("[data-timeline-lane]").boundingBox())!
  await page.mouse.move(l.x + l.width / 2, l.y + 40)
  for (let i = 0; i < 200; i++) {
    const d = await dOf(page, gap)
    if (d >= lo && d < hi) return d
    if (at) {
      const b = await page.locator(`[data-timeline-plane] [data-event-id="${at}"]`).first().boundingBox().catch(() => null)
      if (b && b.x > l.x && b.x < l.x + l.width) await page.mouse.move(b.x + 2, Math.min(Math.max(b.y + 6, l.y + 10), l.y + l.height - 10))
    }
    const far = d > hi * 1.25 || d < lo / 1.25
    await page.mouse.wheel(0, (d >= hi ? 1 : -1) * (far ? 100 : 5))
    await frames(page, 2)
  }
  throw Error(`d did not reach [${lo}, ${hi}): ${await dOf(page, gap)}`)
}
const rect = (l: Locator) => l.evaluate(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } })
/** Natural line count of a title at its rendered width (a free copy, same font), for ZB-01 / ZB-02. */
const naturalLines = (l: Locator) => l.evaluate(t => {
  const c = t.cloneNode(true) as HTMLElement, cs = getComputedStyle(t)
  Object.assign(c.style, { position: "absolute", visibility: "hidden", height: "auto", whiteSpace: "normal", wordBreak: "break-all", width: `${t.clientWidth}px`, font: cs.font, lineHeight: "18px", maskImage: "none" })
  t.parentElement!.appendChild(c)
  const n = Math.round(c.scrollHeight / 18)
  c.remove()
  return n
})

test("ZB-01: timeline, level 0: each collapsed card is one or two title lines, never fewer than it needs; the head sits on line 1", () => W(zoomView(), async page => {
  await openTimeline(page)
  await zoomTo(page, 160, 1e9)
  const cards = page.locator("[data-timeline-plane] [data-event-card][aria-expanded='false']")
  assert.ok(await cards.count() >= 6)
  let two = 0
  for (const c of await cards.all()) {
    const lines = Number(await c.getAttribute("data-title-lines")), n = await naturalLines(c.locator("[data-card-title]"))
    assert.ok(Math.min(n, 2) <= lines, `${await c.getAttribute("aria-label")}: needs ${n}, laid out ${lines}`)
    const stacked = await c.getAttribute("data-stacked") !== null
    assert.ok(Math.abs((await rect(c)).h - ((stacked ? 40 : 34) + (lines - 1) * 18)) <= 1)
    if (lines === 2) {
      two++
      const title = await rect(c.locator("[data-card-title]")), line1 = title.y + 9
      for (const sel of ["[data-card-expand]", "summary"]) { const b = await rect(c.locator(sel).first()); assert.ok(Math.abs(b.y + b.h / 2 - line1) <= 1, `${sel} on line 1`) }
      assert.equal(await c.locator("[data-card-title]").evaluate(e => getComputedStyle(e).webkitLineClamp), "none")
    }
  }
  assert.ok(two > 0, "the long titles wrap")
  assert.equal(await page.evaluate(() => [...document.querySelectorAll("[data-timeline-plane] [data-event-card] *")].filter(e => !e.closest("[data-stamp]") && getComputedStyle(e).textOverflow === "ellipsis").length), 0)
}, Z))

// docs/600 (需求导致): the event table has its own zoom levels now; with them on the reset view is level 1 (cards at
// 0.75). ZB-02 tests the two-line titles, so it runs with levels off; TZB-11 covers the heights with levels on.
test("ZB-02: event table at 470px: lines never fewer than needed, heights follow them, gaps exactly 6 / 4, dots on line 1", () => W(zoomView(), async page => {
  await tab(page, "事件表")
  await page.locator("[data-event-table] [data-event-card]").first().waitFor()
  await frames(page)
  const sc = await rect(page.locator("[data-table-scroller]"))
  const cards = await page.locator("[data-event-table] [data-event-card]").all()
  let two = 0, headTwo = 0
  for (const c of cards) {
    const r = await rect(c)
    if (r.y < sc.y || r.y + r.h > sc.y + sc.h) continue
    const lines = Number(await c.getAttribute("data-title-lines")), n = await naturalLines(c.locator("[data-card-title]"))
    assert.ok(Math.min(n, 2) <= lines, `${await c.getAttribute("aria-label")}: needs ${n}, laid out ${lines}`)
    const head = await c.evaluate(e => !!e.closest("[data-event-group]") && e.closest("[data-event-group]")!.querySelector(":scope > div > [data-event-card]") === e), stacked = await c.getAttribute("data-stacked") !== null
    const want = (head ? 36 : stacked ? 40 : 34) + (lines - 1) * 18
    assert.ok(Math.abs(r.h - want) <= 1, `${await c.getAttribute("aria-label")} ${r.h} ≠ ${want}`)
    if (lines === 2) { two++; if (head) headTwo++ }
    const id = (await c.getAttribute("data-event-id"))!, dot = page.locator(`[data-rail-dot][data-ids~="${id}"]`)
    if (await dot.count()) { const d = await rect(dot.first()), t = await rect(c.locator("[data-card-title]")); assert.ok(Math.abs(d.y + d.h / 2 - (t.y + 9)) <= 1, `${id} dot on line 1`) }
  }
  assert.ok(two > 0, "two-line cards in a narrow panel")
  assert.ok(headTwo > 0, "a two-line group header")
  // Adjacent top-level slots are exactly 6 apart; a header's first child 4 below it.
  const tops = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-event-table] > div:last-child > *")].map(e => { const r = e.getBoundingClientRect(); return [r.top, r.bottom] }).sort((a, b) => a[0] - b[0]))
  for (let i = 1; i < Math.min(tops.length, 12); i++) assert.ok(Math.abs(tops[i][0] - tops[i - 1][1] - 6) <= 1, `gap ${i}: ${tops[i][0] - tops[i - 1][1]}`)
  const g = page.locator("[data-event-group]").first(), cs = await g.locator("[data-event-card]").all()
  const h0 = await rect(cs[0]), c1 = await rect(cs[1])
  assert.ok(Math.abs(c1.y - (h0.y + h0.h) - 4) <= 1)
}, { width: 470 }))
test("ZB-03: collapsed cards keep their size at d ≥ 160 and are 0.75 of it at d < 40; open cards stay 420 at zoom 1", () => W(zoomView(), async page => {
  await openTimeline(page)
  // r1 is 重要, so it stays a card down to level 3.
  const k = cardById(page, "r1")
  await zoomTo(page, 160, 1e9, "r1"); await revealTimelineCard(page, k)
  const full = await rect(k)
  await zoomTo(page, 400, 1e9, "r1"); await revealTimelineCard(page, k)
  assert.ok(Math.abs((await rect(k)).w - full.w) <= 1, "no growth past full size")
  await zoomTo(page, 60, 100, "r1"); await revealTimelineCard(page, k)
  const mid = await rect(k)
  assert.ok(mid.w < full.w - 1 && mid.w > full.w * 0.75 + 1, `between: ${mid.w} of ${full.w}`)
  await zoomTo(page, 30, 39.5, "r1"); await revealTimelineCard(page, k)
  const q = await rect(k)
  assert.ok(Math.abs(q.w / full.w - 0.75) <= 0.01, `width ratio ${q.w / full.w}`)
  assert.ok(Math.abs((await rect(k.locator("[data-card-title]"))).h - 18 * 0.75 * Number(await k.getAttribute("data-title-lines"))) <= 0.5)
  await k.locator("[data-card-expand]").click(); await frames(page)
  await expect.poll(() => rect(k).then(r => Math.round(r.w))).toBe(420)
  assert.equal(await k.locator("xpath=ancestor::*[@data-card-zoom][1]").getAttribute("data-card-zoom"), "1")
}, Z))

test("ZB-04: at 10 ≤ d < 40 一般 events are points: 6px dot, muted date and title, the long title fades, no ellipsis", () => W(zoomView(), async page => {
  await openTimeline(page)
  await zoomTo(page, 12, 39)
  for (const id of ["r0", "r3", "r6"]) { await expect(pointById(page, id)).toHaveCount(1); await expect(cardById(page, id)).toHaveCount(0) }
  await expect(cardById(page, "r1")).toHaveCount(1)
  const p = pointById(page, "r3")
  assert.equal(Math.round((await rect(p.locator(":scope > span:first-child > span"))).w), 6)
  const muted = await page.evaluate(() => { const el = document.createElement("i"); el.style.color = "var(--muted-foreground)"; document.querySelector("[data-worldline-panel]")!.appendChild(el); const c = getComputedStyle(el).color; el.remove(); return c })
  assert.equal(await p.locator("[data-point-time]").evaluate(e => getComputedStyle(e).color), muted)
  assert.equal(await p.locator("[data-point-title]").evaluate(e => getComputedStyle(e).color), muted)
  const long = pointById(page, "r3").locator("[data-point-title]")
  await expect(long).toHaveAttribute("data-fade", "")
  assert.notEqual(await long.evaluate(e => getComputedStyle(e).maskImage || getComputedStyle(e).webkitMaskImage), "none")
  assert.equal(await page.evaluate(() => [...document.querySelectorAll("[data-event-point] *")].filter(e => getComputedStyle(e).textOverflow === "ellipsis").length), 0)
}, Z))

test("ZB-05: at 2.5 ≤ d < 10 every parent is stacked; its fold button opens only it, on the timeline only", () => W(zoomView(), async page => {
  await openTimeline(page)
  await zoomTo(page, 3, 9.5)
  for (const id of ["r2", "r4", "r8"]) await expect(cardById(page, id)).toHaveAttribute("data-stacked", "")
  await expect(page.locator('[data-timeline-plane] [data-event-id^="r2c"]')).toHaveCount(0)
  const treeOpen = () => page.locator('[role="treeitem"][aria-expanded]').evaluateAll(l => l.map(e => e.getAttribute("aria-expanded")))
  const before = await treeOpen()
  assert.ok(before.every(x => x === "true"), "tree families stay open")
  await revealTimelineCard(page, cardById(page, "r2"))
  await cardById(page, "r2").locator("[data-fold]").click(); await frames(page)
  await expect(cardById(page, "r2")).not.toHaveAttribute("data-stacked", "")
  await expect(page.locator('[data-timeline-plane] [data-event-id^="r2c"]')).not.toHaveCount(0)
  await expect(cardById(page, "r8")).toHaveAttribute("data-stacked", "")
  assert.deepEqual(await treeOpen(), before)
  await cardById(page, "r2").locator("[data-fold]").click(); await frames(page)
  await expect(cardById(page, "r2")).toHaveAttribute("data-stacked", "")
  await zoomTo(page, 12, 39)
  for (const id of ["r2", "r4", "r8"]) await expect(cardById(page, id)).not.toHaveAttribute("data-stacked", "")
  // docs/600: the event table follows its own crowding, not the timeline's level (its reset here is level 1: no stack).
  await tab(page, "事件表")
  await expect(page.locator("[data-event-table] [data-event-card][data-stacked]")).toHaveCount(0)
  assert.equal(await posts(page), 0)
}, Z))

test("ZB-05b: a family folded in the event table opens and folds again on the timeline at level 3; the table keeps it folded", () => W(zoomView(), async page => {
  await tab(page, "事件表")
  await page.locator('[data-event-table] [data-event-card][data-event-id="r2"] [data-fold]').click()
  await expect(page.locator('[data-event-table] [data-event-card][data-event-id="r2"]')).toHaveAttribute("data-stacked", "")
  await openTimeline(page)
  await zoomTo(page, 3, 9.5)
  await revealTimelineCard(page, cardById(page, "r2"))
  await cardById(page, "r2").locator("[data-fold]").click(); await frames(page)
  await expect(cardById(page, "r2")).not.toHaveAttribute("data-stacked", "")
  await cardById(page, "r2").locator("[data-fold]").click(); await frames(page)
  await expect(cardById(page, "r2")).toHaveAttribute("data-stacked", "")
  await tab(page, "事件表")
  await expect(page.locator('[data-event-table] [data-event-card][data-event-id="r2"]')).toHaveAttribute("data-stacked", "")
}, Z))
test("ZB-06: at 0.15 ≤ d < 0.6 only 关键 events are cards, 重要 are points, 一般 are gone; the note counts 9 and toggles", () => W(zoomView(), async page => {
  await openTimeline(page)
  await zoomTo(page, 0.2, 0.55, "r4")
  await frames(page)
  // docs/593 §4.2, checked against zoomPlan: the 7 关键 roots (r4, r5, r11, r14, r17, r20, r23) are cards; the 7 重要
  // roots and r2, r8 (一般 parents of a 重要 child) are points; the other 一般 roots are hidden.
  const note = page.locator("[data-zoom-note]")
  await expect(note).toHaveText(/^9 个重要事件显示为时间点/)
  const order = await page.evaluate(() => { const a = document.querySelector("[aria-live=polite]")!, b = document.querySelector("[data-zoom-note]")!; return !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) })
  assert.ok(order, "the note follows 「N 件事件」 on the status line")
  await expect(pointById(page, "r1")).toHaveCount(1); await expect(cardById(page, "r1")).toHaveCount(0)
  for (const id of ["r0", "r3"]) await expect(page.locator(`[data-timeline-plane] [data-event-id="${id}"]`)).toHaveCount(0)
  await expect(cardById(page, "r4")).toHaveCount(1)
  await note.getByRole("button", { name: "显示为卡片" }).click(); await frames(page)
  await expect(page.locator("[data-timeline-plane] [data-event-point]")).toHaveCount(0)
  await expect(cardById(page, "r1")).toHaveCount(1)
  await expect(page.locator('[data-timeline-plane] [data-event-id="r0"]')).toHaveCount(0)
  await expect(note).toHaveText(/^重要事件已显示为卡片/)
  await note.getByRole("button", { name: "改回时间点" }).click(); await frames(page)
  await expect(page.locator("[data-timeline-plane] [data-event-point]")).not.toHaveCount(0)
  // showAll belongs to the 重要 points: at the 一般 point levels it is off again.
  await note.getByRole("button", { name: "显示为卡片" }).click(); await frames(page)
  await zoomTo(page, 12, 39, "r4")
  await expect(note).toHaveText(/个一般事件显示为时间点/)
  await expect(page.locator("[data-timeline-plane] [data-event-point]")).not.toHaveCount(0)
}, Z))

test("ZB-07: hysteresis: points stay between d 40 and 46 on the way up, leave above 46, and do not come back in the band", () => W(zoomView(), async page => {
  await openTimeline(page)
  await zoomTo(page, 37, 39.5)
  const pts = () => page.locator("[data-timeline-plane] [data-event-point]").count()
  assert.ok(await pts() > 0)
  await zoomTo(page, 41, 45.5)
  assert.ok(await pts() > 0, `still points at d ${await dOf(page)}`)
  await zoomTo(page, 46.5, 60)
  assert.equal(await pts(), 0)
  await zoomTo(page, 41, 45.5)
  assert.equal(await pts(), 0, `no points back at d ${await dOf(page)}`)
}, Z))

test("ZB-08: at level 6 a tree click on a 一般 child makes it a card in view, opens its family, and leaves the table folding", () => W(zoomView(), async page => {
  await openTimeline(page)
  await zoomTo(page, 0.02, 0.13, "r4")
  await expect(page.locator('[data-timeline-plane] [data-event-id="r8c0"]')).toHaveCount(0)
  await page.locator('[role="treeitem"]').filter({ hasText: "·阶段1" }).nth(1).click()
  await expect(cardById(page, "r8c0")).toHaveCount(1)
  await expect(cardById(page, "r8")).not.toHaveAttribute("data-stacked", "")
  // The locate moves the canvas over two frames (PlanningWorkspace.locateWorldEvent); poll until it settles in the lane.
  await expect.poll(async () => { const lane = await rect(page.locator("[data-timeline-lane]")), c = await rect(cardById(page, "r8c0")); return c.y >= lane.y && c.y + c.h <= lane.y + lane.h && c.x >= lane.x && c.x < lane.x + lane.w }).toBe(true)
  // docs/600: the table keeps its own level (reset level 1), so the timeline's level-6 folding does not reach it.
  await tab(page, "事件表")
  await expect(page.locator("[data-event-table] [data-event-card][data-stacked]")).toHaveCount(0)
}, Z))

test("ZB-09: clicking a point selects it as a card and Delete still works (focus stays on the timeline)", () => W(zoomView(), async page => {
  await openTimeline(page)
  await zoomTo(page, 12, 39)
  const p = pointById(page, "r6")
  await revealTimelineCard(page, p)
  await p.click()
  await expect(cardById(page, "r6")).toHaveAttribute("data-selected", "")
  assert.equal(await page.evaluate(() => !!document.activeElement?.closest("[data-timeline]")), true)
  await page.keyboard.press("Delete")
  await expect(page.getByRole("dialog")).toContainText(/删除/)
}, Z))

test("ZB-10: a double click on a point (root, and a child inside an open family) opens the editor once", () => W(zoomView(), async page => {
  await openTimeline(page)
  await zoomTo(page, 12, 39)
  for (const id of ["r6", "r2c0"]) {
    const p = pointById(page, id)
    await revealTimelineCard(page, p)
    const b = (await p.boundingBox())!
    await page.mouse.dblclick(b.x + 4, b.y + b.height / 2)
    await expect(page.getByRole("button", { name: "保存", exact: true })).toHaveCount(1)
    await expect(page.getByText("请先保存或取消当前事件编辑")).toHaveCount(0)
    await page.getByRole("button", { name: "取消", exact: true }).first().click()
    await expect(page.getByRole("button", { name: "保存", exact: true })).toHaveCount(0)
  }
}, Z))

test("ZB-11: a box over three points selects all three, and they become cards", () => W(zoomView(), async page => {
  await openTimeline(page)
  await zoomTo(page, 12, 39)
  const ids = ["r12", "r15", "r18"]
  await revealTimelineCard(page, pointById(page, ids[0]))
  const bs = await Promise.all(ids.map(id => pointById(page, id).boundingBox()))
  assert.ok(bs.every(Boolean), "points rendered")
  const x0 = Math.min(...bs.map(b => b!.x)) - 8, y0 = Math.min(...bs.map(b => b!.y)) - 8
  const x1 = Math.max(...bs.map(b => b!.x + 20)) + 8, y1 = Math.max(...bs.map(b => b!.y + b!.height)) + 8
  await page.mouse.move(x0, y0); await page.mouse.down(); await page.mouse.move(x1, y1, { steps: 6 }); await page.mouse.up()
  for (const id of ids) await expect(cardById(page, id)).toHaveAttribute("data-selected", "")
}, Z))
test("ZB-12: dragging a parent's title moves its point children with it in the preview; a dragged 重要 card saves its new time", () => W(zoomView(), async page => {
  await openTimeline(page)
  await zoomTo(page, 12, 39, "r8")
  // r8 is 一般 but has a 重要 child, so it is a card with an open family; its two 一般 children are points.
  const parent = cardById(page, "r8"), child = pointById(page, "r8c0")
  await revealTimelineCard(page, parent)
  await expect(child).toHaveCount(1)
  const t = (await parent.locator("[data-card-title]").boundingBox())!
  const dx0 = (await child.boundingBox())!.x - (await parent.boundingBox())!.x
  await page.mouse.move(t.x + 20, t.y + t.height / 2); await page.mouse.down()
  await page.mouse.move(t.x + 80, t.y + t.height / 2, { steps: 6 })
  const dx1 = (await child.boundingBox())!.x - (await parent.boundingBox())!.x
  assert.ok(Math.abs(dx1 - dx0) <= 1, `child follows: ${dx0} → ${dx1}`)
  assert.equal(await page.locator("[data-ruler-hot]").count(), 0, "no hover pill while dragging")
  // Back to the start before releasing: a parent cannot move past its own children (the planning schema keeps them
  // inside its span), which is outside docs/592. The save is checked on a leaf below.
  await page.mouse.move(t.x + 20, t.y + t.height / 2, { steps: 6 }); await page.mouse.up()
  assert.equal(await posts(page), 0)
  const leaf = cardById(page, "r10")
  await revealTimelineCard(page, leaf)
  const before = await page.evaluate(() => (globalThis as any).planningState().data.events.find((e: any) => e.id === "r10").time.value)
  const h = (await leaf.locator("[data-card-title]").boundingBox())!
  await page.mouse.move(h.x + 20, h.y + h.height / 2); await page.mouse.down()
  await page.mouse.move(h.x + 80, h.y + h.height / 2, { steps: 6 }); await page.mouse.up()
  await expect.poll(() => page.evaluate(() => (globalThis as any).planningState().data.events.find((e: any) => e.id === "r10").time.value)).toBeGreaterThan(before)
}, Z))

test("ZB-13: hovering a card or a point lights its date, a ruler pill at its time and a guide line; leaving clears them", () => W(zoomView(), async page => {
  await openTimeline(page)
  await zoomTo(page, 12, 39)
  for (const target of [cardById(page, "r1"), pointById(page, "r3")]) {
    await revealTimelineCard(page, target)
    await target.hover(); await frames(page)
    const isCard = await target.evaluate(e => e.matches("[data-event-card]"))
    const date = isCard ? target.locator("xpath=ancestor::*[@data-event][1]/*[@data-stamp]") : target.locator("[data-point-time]")
    const colours = () => date.evaluate(d => {
      // The --ec of the card or point itself (the point sets its own on its box).
      const host = d.closest<HTMLElement>("[data-event-point], [data-event]")!, probe = document.createElement("i")
      probe.style.color = "var(--ec)"; host.appendChild(probe); const ec = getComputedStyle(probe).color; probe.remove()
      return JSON.stringify([getComputedStyle(d).backgroundColor === ec, getComputedStyle(d).color])
    })
    // The date eases in over 0.15s (worldline.module.css), so poll until the transition ends.
    await expect.poll(colours).toBe(JSON.stringify([true, "rgb(255, 255, 255)"]))
    const pill = page.locator("[data-ruler-hot]"), guide = page.locator("[data-hover-guide]")
    await expect(pill).toHaveCount(1); await expect(guide).toHaveCount(1)
    assert.equal((await pill.textContent())!.trim(), (await date.textContent())!.split(" → ")[0].trim())
    const want = await page.evaluate(id => {
      const t = document.querySelector("[data-timeline]")!, lane = document.querySelector("[data-timeline-lane]")!.getBoundingClientRect()
      const span = Number(t.getAttribute("data-view-span")), start = Number(t.getAttribute("data-view-start")), w = lane.width - 28
      const ev = (globalThis as any).planningState().data.events.find((e: any) => e.id === id)
      return lane.left + 14 + (ev.time.value - start) * (w / span)
    }, (await target.getAttribute("data-event-id"))!)
    const p = (await pill.boundingBox())!, g = (await guide.boundingBox())!
    assert.ok(Math.abs(p.x + p.width / 2 - want) <= 1, `pill ${p.x + p.width / 2} vs ${want}`)
    assert.ok(Math.abs(g.x - want) <= 1, `guide ${g.x} vs ${want}`)
    await page.mouse.move(5, 5); await frames(page)
    await expect(pill).toHaveCount(0); await expect(guide).toHaveCount(0)
  }
}, Z))

test("ZB-14: a folded parent in the table is a stacked card: no box, 48 high, 12px corners, layers inside the 8px; 6 to the next", () => W(f60(), async page => {
  await tab(page, "事件表")
  await page.locator('[data-event-group][data-parent-title="港口商会签下秘密契约"] [data-fold]').first().click()
  const c = page.locator('[data-event-table] [data-event-card][aria-label="港口商会签下秘密契约"]'), wrap = c.locator("xpath=..")
  await expect(c).toHaveAttribute("data-stacked", "")
  await expect(page.locator('[data-event-group][data-parent-title="港口商会签下秘密契约"]')).toHaveCount(0)
  assert.ok(Math.abs((await rect(wrap)).h - 48) <= 1)
  assert.equal(await c.evaluate(e => getComputedStyle(e).borderRadius), "12px")
  assert.equal(await wrap.evaluate(e => getComputedStyle(e, "::after").bottom), "0px")
  assert.equal(await wrap.evaluate(e => getComputedStyle(e).paddingBottom), "8px")
  const slot = await rect(wrap.locator("xpath=.."))
  const next = await page.evaluate(top => Math.min(...[...document.querySelectorAll<HTMLElement>("[data-event-table] > div:last-child > *")].map(e => e.getBoundingClientRect().top).filter(t => t > top + 1)), slot.y)
  assert.ok(Math.abs(next - (slot.y + slot.h) - 6) <= 1, `next ${next - slot.y - slot.h}`)
  await c.locator("[data-fold]").click()
  await expect(page.locator('[data-event-group][data-parent-title="港口商会签下秘密契约"]')).toHaveCount(1)
}))
test("ZB-15: a folded timeline parent is a stacked leaf: its own collapsed width, no frame or track, 48 × zoom high", () => W(zoomView(), async page => {
  await openTimeline(page)
  await zoomTo(page, 160, 1e9, "r2")
  const c = cardById(page, "r2")
  await revealTimelineCard(page, c)
  const box = c.locator("xpath=ancestor::*[@data-event][1]")
  const familyW = (await rect(page.locator('[data-family-frame][data-family="r2"]'))).w
  await c.locator("[data-fold]").click(); await frames(page)
  await expect(c).toHaveAttribute("data-stacked", "")
  const w = (await rect(box)).w, h = (await rect(c.locator("xpath=.."))).h
  // Its own head width (150–340), not the family's time span it had while open (code review: compare with the frame).
  assert.ok(w <= 340 && w >= 150 && w < familyW - 1, `leaf width ${w} vs family ${familyW}`)
  assert.ok(Math.abs(h - 48) <= 1, `stacked height ${h}`)
  await expect(page.locator('[data-family-frame][data-family="r2"]')).toHaveCount(0)
  for (const theme of ["ink", "paper"] as const) {
    await page.evaluate(t => { document.documentElement.className = t }, theme)
    await c.screenshot({ path: `${process.env.HOME}/shakeink-test-roots/worldline-ui-583-evidence/592/zb15-${theme}.png` }).catch(() => {})
  }
}, Z))

test("ZB-16: a worldline without 关键 events at level 6 keeps its 重要 events as points, drops 一般, no 「视图内没有事件」", () => W(zoomView(60, { withKey: false }), async page => {
  await openTimeline(page)
  await zoomTo(page, 0.02, 0.13, "r1")
  await frames(page, 4)
  // docs/593 §1.2: hiding stops at the highest importance present (重要), so the 重要 roots stay as points.
  await expect(pointById(page, "r1")).toHaveCount(1)
  await expect(page.locator('[data-timeline-plane] [data-event-id="r0"]')).toHaveCount(0)
  await expect(page.locator("[data-zoom-note]")).toHaveText(/个重要事件显示为时间点/)
  await expect(page.locator("[data-empty-view]")).toHaveCount(0)
  const lane = await rect(page.locator("[data-timeline-lane]"))
  const inside = await page.locator("[data-timeline-plane] [data-event-point]").evaluateAll((l, lane) => l.filter(e => { const r = e.getBoundingClientRect(); return r.x >= lane.x && r.right <= lane.x + lane.w && r.y >= lane.y && r.bottom <= lane.y + lane.h }).length, lane)
  assert.ok(inside > 0, "points in the lane")
}, Z))

test("ZB-17: the edited 一般 event stays a card with its draft when the zoom reaches level 6", () => W(zoomView(), async page => {
  await openTimeline(page)
  await zoomTo(page, 160, 1e9, "r6")
  const c = cardById(page, "r6")
  await revealTimelineCard(page, c)
  await c.locator("[data-card-title]").dblclick()
  const title = page.getByLabel("事件标题")
  await title.fill("改过的标题草稿")
  await zoomTo(page, 0.02, 0.13, "r6")
  await expect(cardById(page, "r6")).toHaveCount(1)
  await expect(pointById(page, "r6")).toHaveCount(0)
  await expect(page.getByLabel("事件标题")).toHaveValue("改过的标题草稿")
}, Z))

test("ZB-18: of two 一般 search hits, the current one is a card and the other a point; the next hit swaps them", () => W(zoomView(), async page => {
  await openTimeline(page)
  await zoomTo(page, 12, 39)
  // 北塔钟声 is the title of r0, r6, r12 and r18, all 一般 (SHORT[0], every sixth root).
  await page.getByRole("searchbox", { name: "搜索事件" }).fill("北塔钟声")
  await frames(page, 4)
  const hits = ["r0", "r6", "r12", "r18"]
  // The search moves the canvas to the current hit; the other hits may be outside the built range, so count the kinds
  // of the ones rendered and require the current hit (data-hit) to be a card.
  await expect(page.locator("[data-timeline-plane] [data-event-card][data-hit]")).toHaveCount(1)
  const kinds = () => Promise.all(hits.map(async id => (await cardById(page, id).count()) ? "card" : (await pointById(page, id).count()) ? "point" : "none"))
  const a = await kinds(), first = await page.locator("[data-event-card][data-hit]").getAttribute("data-event-id")
  assert.equal(a.filter(k => k === "card").length, 1, JSON.stringify(a))
  assert.ok(a.includes("point"), `another hit is a point: ${JSON.stringify(a)}`)
  await page.getByRole("searchbox", { name: "搜索事件" }).press("Enter"); await frames(page, 4)
  await expect(page.locator("[data-event-card][data-hit]")).not.toHaveAttribute("data-event-id", first!)
  const b = await kinds()
  assert.equal(b.filter(k => k === "card").length, 1, JSON.stringify(b))
  assert.equal(b[hits.indexOf(first!)], "point", "the previous hit went back to a point")
}, Z))
const renders = (page: Page) => page.evaluate(() => ({ ...(globalThis as any).renders })) as Promise<Record<string, number>>
const reset = (page: Page) => page.evaluate(() => { (globalThis as any).renders = {} })

test("ZB-19: crossing 40 / 10 / 2.5 / 0.6 / 0.15, 显示为卡片, an auto-folded fold button and hovering 20 cards render PlanningWorkspace 0 times", () => W(zoomView(60), async page => {
  await openTimeline(page)
  // Positive control: a view switch renders the workspace.
  await reset(page)
  await tab(page, "事件表"); await tab(page, "时间线"); await frames(page)
  assert.ok(((await renders(page)).PlanningWorkspace ?? 0) > 0, "the counter works")
  await zoomTo(page, 160, 1e9)
  await reset(page)
  const l = (await page.locator("[data-timeline-lane]").boundingBox())!
  await page.mouse.move(l.x + l.width / 2, l.y + 40)
  for (let i = 0; i < 90 && (await dOf(page)) > 0.1; i++) { await page.mouse.wheel(0, 100); await frames(page, 1) }
  assert.ok((await dOf(page)) < 0.15, "crossed every threshold")
  assert.equal((await renders(page)).PlanningWorkspace ?? 0, 0, "zoom steps")
  // docs/593 review P1-2: the note button and the fold click at the levels that have them (2 and 3).
  await zoomTo(page, 12, 39)
  await reset(page)
  await page.locator("[data-zoom-note] button").click(); await frames(page)
  await page.locator("[data-zoom-note] button").click(); await frames(page)
  assert.equal((await renders(page)).PlanningWorkspace ?? 0, 0, "显示为卡片 / 改回时间点")
  // Bring r2 into view with the tree (a locate renders the workspace), then measure only the fold click.
  await page.locator('[role="treeitem"]').filter({ hasText: /^旧书星图3/ }).first().click()
  const p = cardById(page, "r2")
  await expect(p).toHaveCount(1); await revealTimelineCard(page, p); await frames(page, 4); await reset(page)
  await zoomTo(page, 3, 9.5, "r2"); await revealTimelineCard(page, p); await frames(page, 4); await reset(page)
  await p.locator("[data-fold]").click(); await frames(page)
  // The click must do something (code review P1-2: a selected parent's fold used to be a no-op).
  await expect(p).not.toHaveAttribute("data-stacked", "")
  assert.equal((await renders(page)).PlanningWorkspace ?? 0, 0, "fold on the timeline")
  await reset(page)
  const cards = await page.locator("[data-timeline-plane] [data-event-card], [data-timeline-plane] [data-event-point]").all()
  for (const c of cards.slice(0, 20)) { const b = await c.boundingBox(); if (b) await page.mouse.move(b.x + 6, b.y + 6) }
  assert.equal((await renders(page)).PlanningWorkspace ?? 0, 0, "hover")
}, { ...Z, profiling: true }))

/** docs/593 review P1-1: F885 opens at d ≈ 0.4–1.4 (median root gap 36 h). */
const F885_GAP = 36
async function panAndBox(page: Page) {
  await reset(page)
  const l = (await page.locator("[data-timeline-lane]").boundingBox())!
  const empty = await page.evaluate(() => {
    const r = document.querySelector("[data-timeline-lane]")!.getBoundingClientRect()
    for (let y = r.top + 20; y < r.bottom - 90; y += 10) for (let x = r.left + 200; x < r.right - 200; x += 20) {
      const el = document.elementFromPoint(x, y)
      if (el && !el.closest("[data-event-card],[data-event-point],[data-family-frame],button") && el.closest("[data-timeline-lane]")) return { x, y }
    }
    return null
  })
  assert.ok(empty, "an empty spot"); void l
  // Frame intervals from requestAnimationFrame (the Long Tasks API only reports ≥ 50ms, code review P2).
  await page.evaluate(() => { const g = globalThis as any; g.__fr = []; let last = performance.now(); const f = (t: number) => { g.__fr.push(t - last); last = t; if (g.__fr.length < 2000) requestAnimationFrame(f) }; requestAnimationFrame(f) })
  const frameStats = () => page.evaluate(() => { const a = [...(globalThis as any).__fr].slice(2).sort((x: number, y: number) => x - y); return { n: a.length, p95: a[Math.floor(a.length * 0.95)] } })
  await page.mouse.move(empty!.x, empty!.y); await page.mouse.down({ button: "middle" })
  for (let k = 1; k <= 30; k++) await page.mouse.move(empty!.x - k * 10, empty!.y)
  await page.mouse.up({ button: "middle" })
  await page.mouse.move(empty!.x, empty!.y); await page.mouse.down()
  for (let k = 1; k <= 30; k++) await page.mouse.move(empty!.x + k * 6, empty!.y + k * 4)
  // Counted before the release: the finished box selects what it covers, and a selection renders the workspace.
  assert.equal((await renders(page)).PlanningWorkspace ?? 0, 0)
  await page.mouse.up()
  const st = await frameStats()
  // Headless Chromium paces rAF at 60Hz; a frame that misses its slot shows up as ≥ 33ms. p95 under one slot.
  assert.ok(st.n > 20 && st.p95 < 20, `frames ${JSON.stringify(st)}`)
}
test("ZB-20: F885 at level 4 (all cards) and level 5 (points): 30 pan and 30 box frames render PlanningWorkspace 0 times, p95 under 20ms", () => W(f885(), async page => {
  await openTimeline(page)
  const d = await dOf(page, F885_GAP)
  assert.ok(d >= 0.6 && d < 2.5, `opens at level 4: d ${d}`)
  assert.equal(await page.locator("[data-timeline-plane] [data-event-point]").count(), 0, "level 4 has no points")
  await panAndBox(page)
  await page.keyboard.press("Escape")
  await zoomTo(page, 0.2, 0.55, undefined, F885_GAP)
  assert.ok(await page.locator("[data-timeline-plane] [data-event-point]").count() > 0, "level 5 has points")
  await panAndBox(page)
}, { ...Z, profiling: true }))

test("ZB-23: at zoom 0.75 a stacked card's fold button and dot sit on its title's first line", () => W(zoomView(), async page => {
  await openTimeline(page)
  await zoomTo(page, 3, 9.5)
  const c = cardById(page, "r8")
  await revealTimelineCard(page, c)
  await expect(c).toHaveAttribute("data-stacked", "")
  const t = await rect(c.locator("[data-card-title]")), line = t.y + (18 * 0.75) / 2
  for (const sel of ["[data-fold]", "[data-card-expand]"]) { const b = await rect(c.locator(sel)); assert.ok(Math.abs(b.y + b.h / 2 - line) <= 1, `${sel} ${b.y + b.h / 2} vs ${line}`) }
}, Z))

test("ZB-24: two worldline panels: only the zoomed-out one shows the zoom note", () => W(zoomView(), async page => {
  const panels = page.locator("[data-fixture-panel]")
  await panels.nth(0).getByRole("tab", { name: "时间线" }).click()
  await panels.nth(1).getByRole("tab", { name: "时间线" }).click()
  await frames(page, 4)
  const l = (await panels.nth(0).locator("[data-timeline-lane]").boundingBox())!
  await page.mouse.move(l.x + l.width / 2, l.y + 30)
  // docs/593 review P1-2: stop at the 一般 point levels (levels 4 and 6 have no note).
  for (let i = 0; i < 30; i++) {
    const d = await panels.nth(0).evaluate((p, g) => { const t = p.querySelector("[data-timeline]")!, w = p.querySelector("[data-timeline-lane]")!.clientWidth - 28; return g * w / Number(t.getAttribute("data-view-span")) }, ZOOM_GAP)
    if (d < 39) break
    await page.mouse.wheel(0, 100); await frames(page, 1)
  }
  // Code review P2: the panel must actually be at the 一般 point levels (the narrow panels may open below them).
  if (await panels.nth(0).evaluate((p, g) => { const t = p.querySelector("[data-timeline]")!, w = p.querySelector("[data-timeline-lane]")!.clientWidth - 28; return g * w / Number(t.getAttribute("data-view-span")) }, ZOOM_GAP) < 10)
    for (let i = 0; i < 30; i++) {
      const d = await panels.nth(0).evaluate((p, g) => { const t = p.querySelector("[data-timeline]")!, w = p.querySelector("[data-timeline-lane]")!.clientWidth - 28; return g * w / Number(t.getAttribute("data-view-span")) }, ZOOM_GAP)
      if (d >= 12) break
      await page.mouse.wheel(0, -20); await frames(page, 1)
    }
  const d0 = await panels.nth(0).evaluate((p, g) => { const t = p.querySelector("[data-timeline]")!, w = p.querySelector("[data-timeline-lane]")!.clientWidth - 28; return g * w / Number(t.getAttribute("data-view-span")) }, ZOOM_GAP)
  assert.ok(d0 >= 10 && d0 < 40, `panel 0 at d ${d0}`)
  const l1 = (await panels.nth(1).locator("[data-timeline-lane]").boundingBox())!
  await page.mouse.move(l1.x + l1.width / 2, l1.y + 30)
  for (let i = 0; i < 30; i++) { await page.mouse.wheel(0, -100); await frames(page, 1) }
  await expect(panels.nth(0).locator("[data-zoom-note]")).toHaveCount(1)
  await expect(panels.nth(1).locator("[data-zoom-note]")).toHaveCount(0)
}, { ...Z, panels: 2 }))

test("ZB-21: without a Provider (the product default) zoom levels are on: F885 opens with its 一般 roots hidden", () => W(f885(), async page => {
  await openTimeline(page)
  assert.ok((await dOf(page, F885_GAP)) < 2.5)
  await expect(page.locator('[data-timeline-plane] [data-event-id="n1"]')).toHaveCount(0)
  await expect(page.locator('[data-timeline-plane] [data-event-card][data-importance="2"]').first()).toBeAttached()
  // Code review P2: not a vertical clip. No 一般 event is drawn at all, except as a stacked parent of a 重要 child.
  assert.equal(await page.locator('[data-timeline-plane] [data-event-point][data-importance="1"], [data-timeline-plane] [data-event-card][data-importance="1"]:not([data-stacked])').count(), 0)
}, { zoomLevels: "default" }))

test("ZB-22: zooming, 显示为卡片, opening an auto-folded family and hovering never save the work", () => W(zoomView(), async page => {
  await openTimeline(page)
  await zoomTo(page, 0.2, 0.55, "r4")
  await page.locator("[data-zoom-note] button").click(); await frames(page)
  await page.locator("[data-zoom-note] button").click(); await frames(page)
  await zoomTo(page, 3, 9.5, "r2")
  await revealTimelineCard(page, cardById(page, "r2"))
  await cardById(page, "r2").locator("[data-fold]").click(); await frames(page)
  await cardById(page, "r2").hover(); await frames(page)
  assert.equal(await posts(page), 0)
}, Z))

test("ZB-25: a title still too long for two lines fades the end of its second line (no ellipsis, no line clamp)", () => W(zoomView(), async page => {
  await page.evaluate(() => { const s = (globalThis as any).planningState(); s.data.events.find((e: any) => e.id === "r1").title = "码头工人在雨夜里连续罢工三天之后商会终于派人前来谈判而谈判又在第二天清晨破裂所有人都在等消息"; (globalThis as any).refetchWorldline() })
  await openTimeline(page)
  await zoomTo(page, 160, 1e9, "r1")
  const c = cardById(page, "r1")
  await revealTimelineCard(page, c)
  await expect(c).toHaveAttribute("data-title-lines", "2")
  const t = c.locator("[data-card-title]")
  await expect(t).toHaveAttribute("data-fade", "")
  assert.notEqual(await t.evaluate(e => getComputedStyle(e).maskImage || getComputedStyle(e).webkitMaskImage), "none")
  assert.equal(await t.evaluate(e => getComputedStyle(e).textOverflow), "clip")
  assert.equal(await t.evaluate(e => getComputedStyle(e).webkitLineClamp), "none")
  assert.ok(Math.abs((await rect(t)).h - 36) <= 0.5)
}, Z))

test("ZB-26: on the timeline the fold button reports the shown state: auto-folded is 展开 / aria-expanded false, unfolded flips it", () => W(zoomView(), async page => {
  await openTimeline(page)
  await zoomTo(page, 3, 9.5, "r2")
  const c = cardById(page, "r2")
  await revealTimelineCard(page, c)
  const fold = c.locator("[data-fold]")
  await expect(fold).toHaveAttribute("aria-expanded", "false")
  await expect(fold).toHaveAttribute("aria-label", /^展开/)
  await fold.click(); await frames(page)
  await expect(fold).toHaveAttribute("aria-expanded", "true")
  await expect(fold).toHaveAttribute("aria-label", /^折叠/)
}, Z))

test("ZB-27: a timeline parent card keeps its type-tinted header (approved design), at zoom 1 and below", () => W(zoomView(), async page => {
  await openTimeline(page)
  for (const [lo, hi] of [[160, 1e9], [41, 100]] as const) {
    await zoomTo(page, lo, hi, "r8")
    const c = cardById(page, "r8")
    await revealTimelineCard(page, c)
    const bg = await c.evaluate(e => getComputedStyle(e).backgroundImage)
    const leaf = await cardById(page, "r1").evaluate(e => getComputedStyle(e).backgroundImage).catch(() => "")
    assert.match(bg, /linear-gradient/)
    assert.notEqual(bg, leaf, "the parent header differs from a leaf card")
  }
}, Z))

test("ZB-28: at 0.6 ≤ d < 2.5 the 一般 events are gone; 重要 and 关键 are cards, parents stacked, no zoom note", () => W(zoomView(), async page => {
  await openTimeline(page)
  await zoomTo(page, 0.7, 2.4, "r4")
  for (const id of ["r0", "r3", "r6"]) await expect(page.locator(`[data-timeline-plane] [data-event-id="${id}"]`)).toHaveCount(0)
  for (const id of ["r1", "r5"]) await expect(cardById(page, id)).toHaveCount(1)
  await expect(cardById(page, "r2")).toHaveAttribute("data-stacked", "")
  await expect(page.locator("[data-timeline-plane] [data-event-point]")).toHaveCount(0)
  await expect(page.locator("[data-zoom-note]")).toHaveCount(0)
}, Z))

test("ZB-29: at d < 0.15 only the 7 关键 roots are cards, no points, no note; back past 0.15 × 1.15 the 重要 points return", () => W(zoomView(), async page => {
  await openTimeline(page)
  await zoomTo(page, 0.02, 0.13, "r4")
  const ids = await page.locator("[data-timeline-plane] [data-event-card]").evaluateAll(l => [...new Set(l.map(e => e.getAttribute("data-event-id")))].sort())
  // The plane draws a build range around the window; every card drawn is a 关键 root (r4 stacked with its 一般 children).
  assert.ok(ids.length > 0 && ids.every(id => ["r4", "r5", "r11", "r14", "r17", "r20", "r23"].includes(id!)), ids.join())
  await expect(cardById(page, "r4")).toHaveAttribute("data-stacked", "")
  await expect(page.locator("[data-timeline-plane] [data-event-point]")).toHaveCount(0)
  await expect(page.locator("[data-zoom-note]")).toHaveCount(0)
  await zoomTo(page, 0.152, 0.17, "r4")
  await expect(page.locator("[data-timeline-plane] [data-event-point]")).toHaveCount(0)
  await zoomTo(page, 0.18, 0.55, "r4")
  await expect(page.locator("[data-timeline-plane] [data-event-point]")).not.toHaveCount(0)
}, Z))

test("ZB-30: the minimap, the event tree and the legend counts are the same at level 0 and level 6", () => W(zoomView(), async page => {
  await openTimeline(page)
  const read = () => page.evaluate(() => ({
    // docs/596: every root keeps one mark (laid out at its height, or in the bottom row when hidden or out of range).
    mini: document.querySelectorAll("[data-minimap] i[data-mini-root]").length,
    tree: document.querySelectorAll('[role="treeitem"]').length,
    count: document.querySelector("[data-filter-count]")?.textContent ?? document.querySelector("[aria-live=polite]")?.textContent,
  }))
  await zoomTo(page, 160, 1e9)
  const a = await read()
  await zoomTo(page, 0.02, 0.13, "r4")
  assert.deepEqual(await read(), a)
}, Z))

test("ZB-31: at level 6 a located 一般 parent folds; its fold button shows its children as cards and folds them again", () => W(zoomView(), async page => {
  await openTimeline(page)
  await zoomTo(page, 0.02, 0.13, "r4")
  await expect(page.locator('[data-timeline-plane] [data-event-id="r2"]')).toHaveCount(0)
  await page.locator('[role="treeitem"][data-tree-id="r2"]').click()
  const p = cardById(page, "r2")
  await expect(p).toHaveCount(1); await revealTimelineCard(page, p)
  await expect(p).toHaveAttribute("data-stacked", "")
  await p.locator("[data-fold]").click(); await frames(page)
  await expect(p).not.toHaveAttribute("data-stacked", "")
  await expect(p.locator("[data-fold]")).toHaveAttribute("aria-expanded", "true")
  await expect(page.locator('[data-timeline-plane] [data-event-card][data-event-id^="r2c"]')).toHaveCount(3)
  await p.locator("[data-fold]").click(); await frames(page)
  await expect(p).toHaveAttribute("data-stacked", "")
  await expect(page.locator('[data-timeline-plane] [data-event-id^="r2c"]')).toHaveCount(0)
}, Z))

test("ZB-32: when the event under the wheel is hidden, the drawn event nearest the pointer lands 6px above it; the lane never empties", () => W(zoomView(), async page => {
  await openTimeline(page)
  // Code review P1: the position itself, not just a non-empty lane (a small fixture keeps something in the lane anyway).
  // Nearest in x to the pointer (distance to the box), then in y, as the fallback picks from the layout.
  const nearest = (px: number, py: number) => page.evaluate(([px, py]) => {
    let best: { top: number; dx: number; dy: number } | null = null
    for (const e of document.querySelectorAll("[data-timeline-plane] [data-event-card], [data-timeline-plane] [data-event-point]")) {
      const b = e.getBoundingClientRect(); if (!(b.width > 0)) continue
      const dx = Math.max(0, b.left - px, px - b.right), dy = Math.abs(b.top - py)
      if (!best || dx < best.dx - 0.5 || (Math.abs(dx - best.dx) <= 0.5 && dy < best.dy)) best = { top: b.top, dx, dy }
    }
    return best
  }, [px, py])
  for (const [id, lo, hi, stop] of [["r6", 2.6, 3.5, 2.2], ["r7", 0.16, 0.2, 0.12]] as const) {
    await zoomTo(page, lo, hi, id)
    // Push the plane down so the anchor sits low in the lane: without the fallback, the shrunken canvas stays put.
    const el = page.locator(`[data-timeline-plane] [data-event-id="${id}"]`).first()
    const b = (await el.boundingBox())!
    await page.mouse.move(b.x + 3, b.y + 6)
    let crossed = false
    for (let i = 0; i < 40 && (await dOf(page)) > stop; i++) {
      await page.mouse.wheel(0, 20); await frames(page, 3)
      await expect(page.locator("[data-empty-view]")).toHaveCount(0)
      if (!crossed && (await page.locator(`[data-timeline-plane] [data-event-id="${id}"]`).count()) === 0) {
        crossed = true
        const n = await nearest(b.x + 3, b.y + 6)
        assert.ok(n && Math.abs(n.top - (b.y + 6 - 6)) <= 3, `fallback top ${n?.top} vs ${b.y}`)
      }
    }
    assert.ok(crossed, `${id} was hidden on the way past ${stop}`)
  }
}, Z))

test("ZB-33: with 关键 hidden in the legend, level 6 keeps the 重要 events as points and the note counts them", () => W(zoomView(), async page => {
  await openTimeline(page)
  await page.locator('[data-legend-importance="3"]').click(); await frames(page)
  await zoomTo(page, 0.02, 0.13, "r1")
  await expect(pointById(page, "r1")).toHaveCount(1)
  await expect(page.locator('[data-timeline-plane] [data-event-id="r0"]')).toHaveCount(0)
  await expect(page.locator("[data-zoom-note]")).toHaveText(/个重要事件显示为时间点/)
}, Z))

/* docs/594 ZB-34 … ZB-36: hovering a time point shows its whole title above the other cards; the title does not move. */
const bgVar = (page: Page) => page.evaluate(() => { const el = document.createElement("i"); el.style.backgroundColor = "var(--background)"; document.querySelector("[data-worldline-panel]")!.appendChild(el); const c = getComputedStyle(el).backgroundColor; el.remove(); return c })
const pointParts = (p: Locator) => p.evaluate(e => {
  const r = (q: string) => { const b = e.querySelector(q)!.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width } }
  const t = e.querySelector<HTMLElement>("[data-point-title]")!
  return { dot: r(":scope > span:first-child"), time: r("[data-point-time]"), title: r("[data-point-title]"), clipped: t.scrollWidth > t.clientWidth + 1, text: t.textContent }
})

for (const [id, lo, hi] of [["r3", 20, 26], ["r8", 0.2, 0.55]] as const)
  test(`ZB-34 (${id}): hovering a point shows its whole title, no fade, same left edge, opaque backing; leaving restores the fade`, () => W(zoomView(), async page => {
    await openTimeline(page)
    await zoomTo(page, lo, hi, id)
    const p = pointById(page, id)
    await revealTimelineCard(page, p)
    // zoomTo leaves the pointer on the point; move off so the "before" read is not hovered.
    await page.mouse.move(5, 5); await frames(page)
    const t = p.locator("[data-point-title]")
    await expect(t).toHaveAttribute("data-fade", "")
    const before = await pointParts(p)
    assert.ok(before.clipped && before.title.w <= 94.5, `clipped before: ${before.title.w}`)
    if (id === "r8") await expect(p.locator(":scope > b")).toHaveText(/▸ \d+/)
    await t.hover(); await frames(page)
    const after = await pointParts(p)
    const title = await page.evaluate(i => (globalThis as any).planningState().data.events.find((e: any) => e.id === i).title, id)
    assert.equal(after.text, title)
    assert.ok(!after.clipped, "whole title")
    assert.ok(after.title.w > before.title.w + 20, `wider: ${after.title.w} vs ${before.title.w}`)
    for (const k of ["dot", "time", "title"] as const) {
      assert.ok(Math.abs(after[k].x - before[k].x) <= 0.5 && Math.abs(after[k].y - before[k].y) <= 0.5, `${k} moved`)
    }
    assert.equal(await t.evaluate(e => getComputedStyle(e).maskImage || getComputedStyle(e).webkitMaskImage), "none")
    assert.equal(await p.evaluate(e => getComputedStyle(e).backgroundColor), await bgVar(page))
    if (id === "r8") {
      const b = await rect(p.locator(":scope > b")), box = await rect(p)
      assert.ok(b.x + b.w <= box.x + box.w + 0.5, "▸ N inside the backing")
    }
    await page.mouse.move(5, 5); await frames(page)
    await expect.poll(() => pointParts(p).then(r => Math.round(r.title.w))).toBe(Math.round(before.title.w))
    await expect(t).toHaveAttribute("data-fade", "")
    assert.notEqual(await t.evaluate(e => getComputedStyle(e).maskImage || getComputedStyle(e).webkitMaskImage), "none")
  }, Z))

test("ZB-35: at 17.5 ≤ d < 24.4 a hovered point's whole title covers the card under it; a press there selects the point", () => W(zoomView(), async page => {
  await openTimeline(page)
  await zoomTo(page, 17.5, 24.4)
  await page.mouse.move(5, 5); await frames(page)
  // In zoomView r3's whole title runs over a card (r16, r17, r19 or r20) for 17.5 ≤ d < 24.4 (docs/594 §5). A point whose whole title (scrollWidth) would run over a card on its own line, and a spot 3px inside that card.
  const hit = await page.evaluate(() => {
    for (const pt of document.querySelectorAll<HTMLElement>("[data-timeline-plane] [data-event-point]")) {
      const t = pt.querySelector<HTMLElement>("[data-point-title]")!, r = t.getBoundingClientRect(), full = r.x + t.scrollWidth, y = r.y + r.height / 2
      for (const c of document.querySelectorAll<HTMLElement>("[data-timeline-plane] [data-event-card]")) {
        const b = c.getBoundingClientRect()
        const x = Math.max(b.left, r.right) + 3
        if (b.top < y && b.bottom > y && x + 3 < Math.min(full, b.right)) return { id: pt.dataset.eventId!, card: c.dataset.eventId!, x, y }
      }
    }
    return null
  })
  assert.ok(hit, "some point's whole title runs over a card at this zoom")
  const at = () => page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-event-card],[data-event-point]")?.dataset.eventId ?? null, [hit.x, hit.y])
  assert.equal(await at(), hit.card, "not hovered, the spot is the card")
  const p = pointById(page, hit.id), t = p.locator("[data-point-title]")
  await t.hover({ position: { x: 4, y: 6 } }); await frames(page)
  assert.equal(await at(), hit.id, "hovered, the title is on top")
  const pz = Number(await p.evaluate(e => getComputedStyle(e.parentElement!).zIndex))
  const cardZ = await page.evaluate(() => Math.max(...[...document.querySelectorAll("[data-timeline-plane] [data-event-card]")].map(c => Number(getComputedStyle(c.closest("[data-event]")!).zIndex) || 0)))
  assert.ok(pz > cardZ, `point z ${pz} over cards ${cardZ}`)
  // Moving along the title onto the covered spot keeps the hover; a press there selects the point (it becomes a card).
  await page.mouse.move(hit.x, hit.y, { steps: 4 }); await frames(page)
  assert.equal(await at(), hit.id)
  await page.mouse.down(); await page.mouse.up(); await frames(page)
  await expect(cardById(page, hit.id)).toHaveCount(1)
  await expect(cardById(page, hit.id)).toHaveAttribute("data-selected", "")
  await expect(cardById(page, hit.card)).not.toHaveAttribute("data-selected", "")
}, Z))

test("ZB-36: a dimmed point is opaque while hovered and dimmed again after", () => W(zoomView(), async page => {
  await openTimeline(page)
  await zoomTo(page, 20, 26, "r3")
  await page.getByRole("searchbox", { name: "搜索事件" }).fill("北塔钟声")
  const p = pointById(page, "r3"), op = () => p.evaluate(e => Number(getComputedStyle(e).opacity))
  await revealTimelineCard(page, p)
  // zoomTo leaves the pointer on r3; move off so the dimmed read is not hovered (code review P2-1).
  await page.mouse.move(5, 5); await frames(page)
  await expect.poll(op).toBeLessThanOrEqual(0.35)
  await p.locator("[data-point-title]").hover()
  await expect.poll(op).toBe(1)
  await page.mouse.move(5, 5)
  await expect.poll(op).toBeLessThanOrEqual(0.35)
}, Z))
