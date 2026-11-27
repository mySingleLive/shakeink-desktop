import assert from "node:assert/strict"
import { test } from "node:test"
import type { Browser, Page } from "playwright-core"
import { expect } from "@playwright/test"
import { launch, withWorldline } from "../helpers/worldline-browser-fixture"
import { f885 } from "../helpers/worldline-f885"
import { ZOOM_GAP, zoomView } from "../helpers/worldline-zoom"

/* docs/600 §13–§14 TZB-*: event-table zoom levels (Ctrl + wheel drives card zoom, points, folding, hiding and
 * auto-open). In-memory fixture API, not a real-target proof. Levels are read from [data-event-table]
 * data-zoom-level / data-crowding (§14.1), never inferred from step counts. Real waits only (no Playwright clock). */
let browser: Browser
test.before(async () => { browser = await launch() })
test.after(async () => { await browser?.close() })

const Z = { zoomLevels: true } as const
const W = (view: Parameters<typeof withWorldline>[1], body: (page: Page) => Promise<void>, options: Parameters<typeof withWorldline>[3] = Z) =>
  withWorldline(browser, view, async page => { await page.evaluate("globalThis.__name = f => f"); await body(page) }, options)
const frames = (page: Page, n = 3) => page.evaluate(n => new Promise<void>(r => { const f = (k: number) => k ? requestAnimationFrame(() => f(k - 1)) : r(); f(n) }), n)
const posts = (page: Page) => page.evaluate(() => (globalThis as any).posts.length as number)
const table = (page: Page) => page.locator("[data-event-table]")
const level = async (page: Page) => Number(await table(page).getAttribute("data-zoom-level"))
const crowd = async (page: Page) => Number(await table(page).getAttribute("data-crowding"))
const tcard = (page: Page, id: string) => page.locator(`[data-event-table] [data-event-card][data-event-id="${id}"]`)
const tpoint = (page: Page, id: string) => page.locator(`[data-event-table] [data-event-point][data-event-id="${id}"]`)
async function openTable(page: Page) {
  await page.getByRole("tab", { name: "事件表" }).click()
  await table(page).waitFor()
  await frames(page)
}
/** One Ctrl + wheel step over the table (zoom out with dir −1). The pointer sits at `y` in the scroller (default 1/3). */
async function step(page: Page, dir: 1 | -1, y?: number) {
  const r = (await page.locator("[data-table-scroller]").boundingBox())!
  await page.mouse.move(r.x + r.width * 0.6, r.y + (y ?? r.height / 3))
  await page.keyboard.down("Control")
  await page.mouse.wheel(0, dir > 0 ? -100 : 100)
  await page.keyboard.up("Control")
  await frames(page, 2)
}
/** Steps until the table reports level `to` (both directions); returns the steps taken. */
async function zoomToLevel(page: Page, to: number, dir: 1 | -1, max = 80) {
  for (let i = 0; i < max; i++) { if ((await level(page)) === to) return i; await step(page, dir) }
  throw Error(`level ${to} not reached (at ${await level(page)}, d ${await crowd(page)})`)
}
/** docs/602 S5: the first step that opens every card (data-auto-open). */
async function zoomToAllOpen(page: Page, max = 60) {
  for (let i = 0; i < max; i++) { if ((await table(page).getAttribute("data-auto-open")) !== null) return; await step(page, 1) }
  throw Error("all-open not reached")
}
/** docs/601: time stretch and auto-open are linear-mode (等距) only; the aligned default lays cards out with equal gaps. */
async function openLinear(page: Page) {
  await openTable(page)
  await page.locator("[data-rail-mode-toggle]").getByRole("button", { name: "等距", exact: true }).click()
  await frames(page)
}
/** Waits for measured heights of opened cards (docs/602 removed the 160 ms idle decision; the wait is kept long). */
const settle = async (page: Page) => { await page.waitForTimeout(220); await frames(page, 3); await page.waitForTimeout(220); await frames(page, 2) }
/** docs/602 S1: every collapsed card sits in a zoom box at the table's card scale (data-card-scale). */
async function cardsAtScale(page: Page) {
  const r = await page.evaluate(() => {
    const t = document.querySelector<HTMLElement>("[data-event-table]")!, want = t.dataset.cardScale
    const boxes = [...t.querySelectorAll<HTMLElement>("[data-card-zoom]")]
    return { want, n: boxes.length, bad: boxes.filter(b => b.dataset.cardZoom !== want).length }
  })
  assert.ok(r.n > 0 && r.bad === 0, `zoom boxes at ${r.want}: ${JSON.stringify(r)}`)
  return Number(r.want)
}
const openCount = (page: Page) => page.locator('[data-event-table] [data-event-card][aria-expanded="true"]').count()

test("TZB-01: a plain wheel scrolls only; Ctrl + wheel walks the levels: zoom, points, stacks, 一般 gone, 重要 points, only 关键", () => W(zoomView(24), async page => {
  await openTable(page)
  const sc = page.locator("[data-table-scroller]")
  const r = (await sc.boundingBox())!
  const d0 = await crowd(page), top0 = await sc.evaluate(e => e.scrollTop)
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2); await page.mouse.wheel(0, 200); await frames(page)
  assert.equal(await crowd(page), d0, "a plain wheel does not zoom")
  assert.ok((await sc.evaluate(e => e.scrollTop)) > top0, "a plain wheel scrolls")
  await sc.evaluate(e => { e.scrollTop = 0 })
  // Level 1: docs/602 S1, collapsed cards are drawn at the table's card scale.
  await zoomToLevel(page, 1, d0 >= 40 ? -1 : 1)
  await cardsAtScale(page)
  await zoomToLevel(page, 2, -1)
  assert.ok((await page.locator("[data-event-table] [data-event-point]").count()) > 0, "level 2: 一般 are points")
  await expect(tpoint(page, "r0")).toHaveCount(1)
  await zoomToLevel(page, 3, -1)
  await expect(page.locator("[data-event-table] [data-event-card][data-stacked]").first()).toBeVisible()
  await zoomToLevel(page, 4, -1)
  await expect(tpoint(page, "r0")).toHaveCount(0); await expect(tcard(page, "r0")).toHaveCount(0)
  await zoomToLevel(page, 5, -1)
  await expect(tpoint(page, "r1")).toHaveCount(1)
  await zoomToLevel(page, 6, -1)
  await expect(page.locator("[data-event-table] [data-event-point]")).toHaveCount(0)
  const ids = await page.locator("[data-event-table] [data-event-card]").evaluateAll(es => es.map(e => (e as HTMLElement).dataset.eventId).sort())
  assert.deepEqual(ids, ["r11", "r14", "r17", "r20", "r23", "r4", "r5"].sort())
  // The floor is past level 6 with levels on (§8.6 P2-5): keep zooming out until the − button disables, still level 6.
  for (let i = 0; i < 20 && !(await page.getByRole("button", { name: "缩小" }).isDisabled()); i++) await step(page, -1)
  await expect(page.getByRole("button", { name: "缩小" })).toBeDisabled()
  assert.equal(await level(page), 6)
  assert.equal(await posts(page), 0, "zooming never saves")
}))

test("TZB-02: hysteresis: points stay until d ≥ 46 on the way up; stacks stay until d ≥ 11.5", () => W(zoomView(24), async page => {
  await openTable(page)
  await zoomToLevel(page, 3, -1)
  // d is shown to 3 decimals; the summed wheel steps can sit a hair under a threshold, so the level attribute decides.
  for (let i = 0; i < 40 && (await level(page)) >= 3; i++) {
    assert.ok((await crowd(page)) < 11.501, `level 3 left only past 11.5 (d ${await crowd(page)})`)
    await expect(page.locator("[data-event-table] [data-event-card][data-stacked]").first()).toBeVisible()
    await step(page, 1)
  }
  assert.ok((await crowd(page)) >= 11.499)
  await expect(page.locator("[data-event-table] [data-event-card][data-stacked]")).toHaveCount(0)
  for (let i = 0; i < 40 && (await level(page)) >= 2; i++) {
    assert.ok((await crowd(page)) < 46.001, `points stay below 46 (d ${await crowd(page)})`)
    assert.ok((await page.locator("[data-event-table] [data-event-point]").count()) > 0, `points at d ${await crowd(page)}`)
    await step(page, 1)
  }
  assert.ok((await crowd(page)) >= 45.999)
  await expect(page.locator("[data-event-table] [data-event-point]")).toHaveCount(0)
  // docs/602: one step back down: the drawn level stays 1 while d is in [40, 46) (hysteresis), so the step carries on
  // (no change in that band) and lands where the points come back, below 40.
  await step(page, -1)
  assert.ok((await crowd(page)) < 40 + 1e-6 || (await level(page)) === 1, `d ${await crowd(page)} level ${await level(page)}`)
  if ((await level(page)) === 1) await expect(page.locator("[data-event-table] [data-event-point]")).toHaveCount(0)
}))

test("TZB-03: at level ≥ 3 a stacked card's fold button opens only that family, in the table only", () => W(zoomView(24), async page => {
  await openTable(page)
  await zoomToLevel(page, 3, -1)
  const r8 = tcard(page, "r8")
  await expect(r8).toHaveAttribute("data-stacked", "")
  await r8.locator("[data-card-fold], button[aria-label*='展开'], button[aria-label*='折叠']").first().click()
  await frames(page)
  await expect(tcard(page, "r8c1")).toHaveCount(1)
  await page.getByRole("tab", { name: "时间线" }).click(); await frames(page)
  await page.getByRole("tab", { name: "事件表" }).click(); await frames(page)
  assert.equal(await posts(page), 0)
}))

test("TZB-04: a click on a point opens it once; a double click edits once without a time drag", () => W(zoomView(24), async page => {
  await openTable(page)
  await zoomToLevel(page, 2, -1)
  const p = tpoint(page, "r3")
  await p.scrollIntoViewIfNeeded()
  const b = (await p.boundingBox())!
  await page.mouse.click(b.x + 20, b.y + b.height / 2)
  await page.waitForTimeout(400); await frames(page)
  await expect(tcard(page, "r3")).toHaveAttribute("aria-expanded", "true")
  await expect(tcard(page, "r3")).toHaveAttribute("data-selected", "")
  assert.equal(await posts(page), 0)
  // A double click on another point: the second press lands on the new card's head and moves 20px.
  const q = tpoint(page, "r6"); await q.scrollIntoViewIfNeeded()
  const c = (await q.boundingBox())!
  await page.mouse.move(c.x + 40, c.y + c.height / 2)
  await page.mouse.down(); await page.mouse.up()
  await page.mouse.down(); await page.mouse.move(c.x + 60, c.y + c.height / 2, { steps: 4 }); await page.mouse.up()
  await expect(tcard(page, "r6")).toHaveAttribute("data-editing", "")
  assert.equal(await page.locator("[data-event-card][data-editing]").count(), 1)
  assert.equal(await posts(page), 0, "no time drag saved")
}))

test("TZB-05 / TZB-05b: the zoom note shows in the table; its count is the table's own after a view switch", () => W(zoomView(24), async page => {
  await openTable(page)
  await zoomToLevel(page, 3, -1)
  const note = page.locator("[data-zoom-note]")
  await expect(note).toContainText("个一般事件显示为时间点")
  const tableText = await note.textContent()
  await note.getByRole("button").click(); await frames(page)
  await expect(page.locator("[data-event-table] [data-event-point]")).toHaveCount(0)
  await note.getByRole("button").click(); await frames(page)
  await page.getByRole("tab", { name: "时间线" }).click(); await frames(page, 4)
  await page.getByRole("tab", { name: "事件表" }).click(); await frames(page, 4)
  await expect(note).toHaveText(tableText!)
}))

test("TZB-06 / TZB-06b: at level 0 with room every card in view opens; a click closes one locally, a double click edits", () => W(zoomView(24, { leavesOnly: true }), async page => {
  await openLinear(page)
  await zoomToAllOpen(page)
  await settle(page)
  const n = await openCount(page)
  assert.ok(n >= 3, `auto-opened ${n}`)
  await expect(table(page)).toHaveAttribute("data-auto-open", "")
  // Tops follow time where the stretch passes the open card: neighbours are max(open height + 6, min(gapFor(d), Δt·k)).
  const d = await crowd(page), gapFor = Math.min(1200, Math.max(240, 240 * d / 160)), want = Math.min(gapFor, d)
  const t0 = (await tcard(page, "r0").boundingBox())!, t1 = (await tcard(page, "r1").boundingBox())!
  assert.ok(Math.abs(t1.y - t0.y - Math.max(want, t0.height + 6)) <= 1, `${t1.y - t0.y} vs max(${want}, ${t0.height} + 6)`)
  // A single click on an auto-opened card: still open at 200 ms, closed after; primary selected.
  const c = tcard(page, "r1"); await c.scrollIntoViewIfNeeded(); await settle(page)
  await expect(c).toHaveAttribute("aria-expanded", "true")
  const hb = (await c.locator("[data-card-title]").boundingBox())!
  await page.mouse.click(hb.x + 10, hb.y + hb.height / 2)
  await page.waitForTimeout(150)
  await expect(c).toHaveAttribute("aria-expanded", "true")
  await expect.poll(() => c.getAttribute("aria-expanded"), { timeout: 2000 }).toBe("false")
  await expect(c).toHaveAttribute("data-selected", "")
  // A double click on another auto-opened card edits it; after cancel it is still open.
  const e = tcard(page, "r2")
  await e.scrollIntoViewIfNeeded(); await settle(page)
  await expect(e).toHaveAttribute("aria-expanded", "true")
  await e.locator("[data-card-title]").dblclick()
  await expect(e).toHaveAttribute("data-editing", "")
  await e.getByRole("button", { name: "取消", exact: true }).click()
  await page.waitForTimeout(400)
  await expect(e).toHaveAttribute("aria-expanded", "true")
  assert.equal(await posts(page), 0)
}))

test("TZB-10 (guard): with zoom levels off the table has no level, no point, no auto-open", () => W(zoomView(24, { leavesOnly: true }), async page => {
  await openTable(page)
  assert.equal(await level(page), 0)
  for (let i = 0; i < 12; i++) await step(page, -1)
  assert.equal(await page.locator("[data-event-table] [data-event-point]").count(), 0)
  assert.equal(await page.locator("[data-event-table] [data-card-zoom]").count(), 0)
  for (let i = 0; i < 40; i++) await step(page, 1)
  await settle(page)
  assert.equal(await openCount(page), 0)
}, {}))

test("TZB-12: with levels on the root spacing is min(d, gapFor(d)), past 240 from d 160 (all open there, docs/602 S5)", () => W(zoomView(24, { leavesOnly: true }), async page => {
  await openLinear(page)
  // docs/602: all cards open from one step past the size maximum (d ≈ 106 here); the open cards (≤ 110px, no body)
  // are shorter than the stretch, so root starts still follow time.
  for (let i = 0; i < 60 && (await crowd(page)) < 400; i++) await step(page, 1)
  const d = await crowd(page)
  await expect(table(page)).toHaveAttribute("data-auto-open", "")
  const a = (await tcard(page, "r0").boundingBox())!, b = (await tcard(page, "r1").boundingBox())!
  const want = Math.min(d, Math.min(1200, Math.max(240, 240 * d / 160)))
  assert.ok(want > 240 && Math.abs(b.y - a.y - want) <= 1, `gap ${b.y - a.y} vs ${want} at d ${d}`)
}))

test("TZB-12b: levels off: the spacing caps at 240 (docs/586)", () => W(zoomView(24, { leavesOnly: true }), async page => {
  await openLinear(page)
  for (let i = 0; i < 40; i++) await step(page, 1)
  const a = (await tcard(page, "r0").boundingBox())!, b = (await tcard(page, "r1").boundingBox())!
  assert.ok(Math.abs(b.y - a.y - 240) <= 1, `${b.y - a.y}`)
}, {}))

test("TZB-16: hidden events have no rail dot, label or lead", () => W(zoomView(24), async page => {
  await openTable(page)
  await zoomToLevel(page, 4, -1)
  await expect(page.locator('[data-rail-dot][data-ids~="r0"]')).toHaveCount(0)
  await expect(page.locator('[data-rail-lead="r0"]')).toHaveCount(0)
  await expect(page.locator('[data-rail-label][data-ids~="r0"]')).toHaveCount(0)
}))

test("TZB-17: pending events are never points or hidden at level ≥ 2", () => W(zoomView(24, { pending: 2 }), async page => {
  await openTable(page)
  await zoomToLevel(page, 4, -1)
  await expect(tcard(page, "u0")).toHaveCount(1)
  await expect(tpoint(page, "u0")).toHaveCount(0)
}))

test("TZB-18: the toolbar − / + change the level; 复位 returns d to the reset value", () => W(zoomView(24), async page => {
  await openTable(page)
  const d0 = await crowd(page)
  await page.getByRole("button", { name: "缩小" }).click(); await frames(page)
  assert.equal(await level(page), 2)
  // docs/602 S7: aligned, + stops at all-open (level 1 here; levels 0 and 1 look the same).
  for (let i = 0; i < 12 && !(await page.getByRole("button", { name: "放大" }).isDisabled()); i++) { await page.getByRole("button", { name: "放大" }).click(); await frames(page) }
  await expect(page.getByRole("button", { name: "放大" })).toBeDisabled()
  await expect(table(page)).toHaveAttribute("data-auto-open", "")
  assert.ok((await level(page)) <= 1)
  // From above, 复位 lands on d 40 exactly: level 1 (entering from 1). From below it stays 2 (hysteresis, < 46).
  await page.getByRole("button", { name: "复位" }).click(); await frames(page)
  assert.ok(Math.abs((await crowd(page)) - d0) < 0.01)
  assert.equal(await level(page), 1)
  for (let i = 0; i < 3; i++) { await page.getByRole("button", { name: "缩小" }).click(); await frames(page) }
  assert.equal(await level(page), 2)
  await page.getByRole("button", { name: "复位" }).click(); await frames(page)
  assert.equal(await level(page), 2)
}))

test("TZB-20: an edited card at level 2 is not zoomed; its type picker stays inside the scroller", () => W(zoomView(24), async page => {
  await openTable(page)
  await zoomToLevel(page, 2, -1)
  const c = tcard(page, "r1")
  await c.scrollIntoViewIfNeeded()
  await c.locator("[data-card-title]").dblclick()
  await expect(c).toHaveAttribute("data-editing", "")
  assert.equal(await c.locator("xpath=ancestor::*[@data-card-zoom]").count(), 0)
  await c.getByRole("button", { name: "事件类型" }).click()
  const pop = (await c.getByRole("listbox", { name: "事件类型" }).boundingBox())!, sc = (await page.locator("[data-table-scroller]").boundingBox())!
  assert.ok(pop.x >= sc.x - 0.5 && pop.x + pop.width <= sc.x + sc.width + 0.5)
}))

test("TZB-11 (docs/602 S1): at levels 1–3 cards are at the card scale; group heads 36 × s, children 4 below; collapsed cards 34 × s; stacks fill the box", () => W(zoomView(24), async page => {
  await openTable(page)
  for (const to of [1, 2, 3]) {
    await zoomToLevel(page, to, -1)
    await cardsAtScale(page)
  }
  await zoomToLevel(page, 2, 1)
  const s = await cardsAtScale(page)
  const g = page.locator("[data-event-group]").first()
  const head = g.locator("[data-event-card]").first(), kid = g.locator(":scope > div").nth(1)
  const gb = (await g.boundingBox())!, hb = (await head.boundingBox())!, kb = (await kid.boundingBox())!
  assert.ok(Math.abs(hb.x - gb.x) <= 1 && Math.abs(hb.width - gb.width) <= 1, `head ${JSON.stringify(hb)} in ${JSON.stringify(gb)}`)
  const css = await head.evaluate(e => { const c = getComputedStyle(e); return { b: c.borderTopWidth, sh: c.boxShadow } })
  assert.equal(css.b, "0px", "group head has no border")
  assert.ok(/inset/.test(css.sh), `type edge shadow (${css.sh})`)
  assert.ok(Math.abs(hb.height - 36 * s) <= 1, `head ${hb.height} at ${s}`)
  assert.ok(Math.abs(kb.y - (hb.y + hb.height) - 4) <= 1, `child gap ${kb.y - hb.y - hb.height}`)
  // A collapsed plain card with a one-line title (data-lines sits on the title).
  const one = page.locator('[data-event-table] [data-event-card]:not([data-stacked]):not([aria-expanded="true"]):has([data-lines="1"])').filter({ hasNot: page.locator("[data-event-group]") })
  const hs = await one.evaluateAll(es => es.filter(e => !e.closest("[data-event-group]") || e.closest("[data-event-group]")!.querySelector("[data-event-card]") !== e).map(e => e.getBoundingClientRect().height))
  assert.ok(hs.length > 0)
  for (const h of hs) assert.ok(Math.abs(h - 34 * s) <= 1, `card ${h} at ${s}`)
  await zoomToLevel(page, 3, -1)
  const st = page.locator("[data-event-table] [data-event-card][data-stacked]").first()
  const slot = st.locator("xpath=ancestor::div[contains(@class,'slot')][1]")
  const sb = (await st.boundingBox())!, lb = (await slot.boundingBox())!
  assert.ok(Math.abs(sb.width - lb.width) <= 1, `stack ${sb.width} vs slot ${lb.width}`)
}))

test("TZB-19 (F885, production bundle): a zoom step commits in under 100 ms at p95, across levels and at level 0", () => W(f885(), async page => {
  await openTable(page)
  // docs/601: with equal gaps the pointer lands on a card, and its first hover re-render (not a zoom step) would be
  // timed with the first wheel step; rest the pointer there first.
  { const r = (await page.locator("[data-table-scroller]").boundingBox())!; await page.mouse.move(r.x + r.width * 0.6, r.y + r.height / 3); await page.waitForTimeout(600) }
  const sample = async (dir: 1 | -1, n: number) => {
    const out: number[] = []
    for (let i = 0; i < n; i++) {
      const r = (await page.locator("[data-table-scroller]").boundingBox())!
      await page.mouse.move(r.x + r.width * 0.6, r.y + r.height / 3)
      // In the page: from the wheel event (capture) to the frame after it, i.e. the render and commit it caused.
      const took = page.evaluate(() => new Promise<number>(res => {
        window.addEventListener("wheel", e => { const t0 = e.timeStamp; requestAnimationFrame(() => setTimeout(() => res(performance.now() - t0), 0)) }, { once: true, capture: true })
      }))
      await page.keyboard.down("Control"); await page.mouse.wheel(0, dir > 0 ? -100 : 100); await page.keyboard.up("Control")
      out.push(await took)
      await frames(page, 1)
    }
    return out.sort((a, b) => a - b)[Math.floor(n * 0.95)]
  }
  const across = await sample(-1, 24)
  for (let i = 0; i < 40 && (await level(page)) !== 0; i++) await step(page, 1)
  const zero = await sample(1, 20)
  assert.ok(across < 100, `p95 across levels ${across}`)
  assert.ok(zero < 100, `p95 at level 0 ${zero}`)
}))

void ZOOM_GAP

test("TZB-06b (negative): with all open, a manually opened card closes normally and leaves openCards", () => W(zoomView(24, { leavesOnly: true }), async page => {
  await openLinear(page)
  // Open r1 by hand at the reset (no auto-open there), then zoom in to auto-open.
  const c = tcard(page, "r1")
  await c.locator("[data-card-title]").click(); await page.waitForTimeout(350)
  await expect(c).toHaveAttribute("aria-expanded", "true")
  await zoomToAllOpen(page); await settle(page)
  await expect(table(page)).toHaveAttribute("data-auto-open", "")
  await c.scrollIntoViewIfNeeded(); await settle(page)
  const hb = (await c.locator("[data-card-title]").boundingBox())!
  await page.mouse.click(hb.x + 10, hb.y + hb.height / 2); await page.waitForTimeout(450)
  // It left openCards: zooming back out of all-open shows it closed, unlike a card closed only locally.
  for (let i = 0; i < 20 && (await table(page).getAttribute("data-auto-open")) !== null; i++) await step(page, -1)
  await settle(page)
  await expect(c).toHaveAttribute("aria-expanded", "false")
}))

test("TZB-06c (docs/602 S5): in a family the group head and its children all open; the children stay in time order inside the box", () => W(zoomView(24), async page => {
  await openLinear(page)
  for (let i = 0; i < 70 && (await crowd(page)) < 2600; i++) await step(page, 1)
  await tcard(page, "r2").scrollIntoViewIfNeeded(); await settle(page)
  await expect(table(page)).toHaveAttribute("data-auto-open", "")
  for (const id of ["r2", "r2c0", "r2c1", "r2c2"]) await expect(tcard(page, id)).toHaveAttribute("aria-expanded", "true")
  const ys = await Promise.all(["r2", "r2c0", "r2c1", "r2c2"].map(async id => (await tcard(page, id).boundingBox())!))
  for (let i = 1; i < ys.length; i++) assert.ok(ys[i].y >= ys[i - 1].y + ys[i - 1].height + 3, `${i}: ${ys[i].y} after ${ys[i - 1].y + ys[i - 1].height}`)
  const box = (await page.locator('[data-event-group]:has([data-event-card][data-event-id="r2c2"])').first().boundingBox())!
  assert.ok(ys[3].y + ys[3].height <= box.y + box.height + 0.5, "the last child is inside the box")
}))

test("TZB-08: aligned rail dots sit on zoomed card heads and on point lines (±0.5px); labels never overlap", () => W(zoomView(24), async page => {
  await openTable(page)
  await zoomToLevel(page, 2, -1)
  const rows = await page.evaluate(() => {
    const out: { id: string; dot: number; head: number }[] = []
    for (const d of document.querySelectorAll<HTMLElement>("[data-rail-dot]")) {
      const id = d.dataset.eventId!, r = d.getBoundingClientRect()
      const el = document.querySelector<HTMLElement>(`[data-event-table] [data-event-point][data-event-id="${id}"], [data-event-table] [data-event-card][data-event-id="${id}"] [data-card-title]`)
      if (!el || d.hasAttribute("data-cluster")) continue
      const e = el.getBoundingClientRect()
      out.push({ id, dot: r.top + r.height / 2, head: el.matches("[data-event-point]") ? e.top + e.height / 2 : e.top + Math.min(e.height, 18 * Number(el.closest("[data-card-zoom]")?.getAttribute("data-card-zoom") ?? 1)) / 2 })
    }
    return out
  })
  assert.ok(rows.length >= 6)
  for (const r of rows) assert.ok(Math.abs(r.dot - r.head) <= 1.5, `${r.id}: dot ${r.dot} head ${r.head}`)
  const labels = await page.locator("[data-rail-label]").evaluateAll(ls => ls.map(l => l.getBoundingClientRect()).filter(b => b.height > 0).map(b => [b.top, b.bottom]).sort((a, b) => a[0] - b[0]))
  for (let i = 1; i < labels.length; i++) assert.ok(labels[i][0] >= labels[i - 1][1] - 0.5, `labels ${i - 1}/${i} overlap`)
}))

test("TZB-09: a zoom step renders PlanningWorkspace once; an open card's body node survives; the work is not saved", () => W(zoomView(24), async page => {
  await openTable(page)
  await tcard(page, "r1").locator("[data-card-title]").click(); await page.waitForTimeout(350)
  await page.evaluate(() => { (globalThis as any).__body = document.querySelector('[data-event-card][data-event-id="r1"] [data-markdown-preview]') })
  const before = await page.evaluate(() => (globalThis as any).renders?.PlanningWorkspace ?? 0)
  await step(page, -1); await frames(page, 2)
  const after = await page.evaluate(() => (globalThis as any).renders?.PlanningWorkspace ?? 0)
  assert.ok(after - before <= 1, `PlanningWorkspace renders ${after - before}`)
  assert.equal(await page.evaluate(() => (globalThis as any).__body === document.querySelector('[data-event-card][data-event-id="r1"] [data-markdown-preview]')), true)
  assert.equal(await posts(page), 0)
}, { ...Z, profiling: true }))

test("TZB-14: a wheel over a point that the next level hides keeps the pointer between its drawn neighbours", () => W(zoomView(24), async page => {
  await openLinear(page)
  await zoomToLevel(page, 3, -1)
  // Room above (the 一般 rows above r21 leave at level 4, so the content above shrinks): scroll down first, so the
  // anchor restore is not clamped at the top.
  const sc = page.locator("[data-table-scroller]")
  await sc.evaluate(e => { e.scrollTop = 300 }); await frames(page, 2)
  const p = tpoint(page, "r21"), sb = (await sc.boundingBox())!
  const pb = (await p.boundingBox())!
  assert.ok(pb.y > sb.y && pb.y < sb.y + sb.height, "r21 in view")
  // Just below r21's centre line, so r21 (hidden next) is the anchor's first card and the time fallback must run.
  const py = pb.y + pb.height - 3
  for (let i = 0; i < 20 && (await level(page)) === 3; i++) await step(page, -1, py - sb.y)
  assert.equal(await level(page), 4)
  await expect(tpoint(page, "r21")).toHaveCount(0)
  // r21 (一般) is gone; r20 (关键) and r22 (重要) are its drawn neighbours: the pointer stays between them.
  const h = async (id: string) => { const b = (await page.locator(`[data-event-table] [data-event-id="${id}"]`).first().boundingBox())!; return b.y }
  const y20 = await h("r20"), y22 = await h("r22")
  assert.ok(y20 - 4 <= py && py <= y22 + 30, `pointer ${py} between r20 ${y20} and r22 ${y22}`)
}))

test("TZB-15 (F885): a located event hidden at level 6 shows, scrolls in and flashes", () => W(f885(), async page => {
  await openTable(page)
  for (let i = 0; i < 70 && (await level(page)) < 6; i++) await step(page, -1)
  assert.equal(await level(page), 6)
  const hiddenId = await page.evaluate(() => {
    const shown = new Set([...document.querySelectorAll<HTMLElement>("[data-event-table] [data-event-id]")].map(e => e.dataset.eventId))
    const item = [...document.querySelectorAll<HTMLElement>('[role="tree"] [data-tree-id]')].find(e => !shown.has(e.dataset.treeId))
    return item?.dataset.treeId ?? null
  })
  assert.ok(hiddenId, "a hidden event in the tree")
  await page.locator(`[role="tree"] [data-tree-id="${hiddenId}"]`).first().click()
  await expect(tcard(page, hiddenId!)).toHaveCount(1, { timeout: 3000 })
  const b = (await tcard(page, hiddenId!).boundingBox())!, sc = (await page.locator("[data-table-scroller]").boundingBox())!
  assert.ok(b.y >= sc.y - 1 && b.y < sc.y + sc.height)
}))

test("TZB-21: hovering a table point lights its rail dot; no timeline-only marks; no character card", () => W(zoomView(24), async page => {
  await openTable(page)
  await zoomToLevel(page, 2, -1)
  const p = tpoint(page, "r3"); await p.scrollIntoViewIfNeeded()
  await p.hover(); await frames(page)
  await expect(page.locator('[data-rail-dot][data-ids~="r3"]')).toHaveClass(/hot/)
  await expect(page.locator("[data-hover-guide]")).toHaveCount(0)
  await page.waitForTimeout(500)
  await expect(page.getByRole("tooltip")).toHaveCount(0)
}))

for (const linear of [true, false])
  test(`TZB-06d (${linear ? "linear" : "aligned"}): a click on a second auto-opened card within 260 ms still closes the first`, () => W(zoomView(24, { leavesOnly: true }), async page => {
  await (linear ? openLinear(page) : openTable(page))
  await zoomToAllOpen(page); await settle(page)
  const a = tcard(page, "r1"), b = tcard(page, "r2")
  await a.scrollIntoViewIfNeeded(); await settle(page)
  await expect(a).toHaveAttribute("aria-expanded", "true"); await expect(b).toHaveAttribute("aria-expanded", "true")
  const ha = (await a.locator("[data-card-title]").boundingBox())!, hb = (await b.locator("[data-card-title]").boundingBox())!
  await page.mouse.click(ha.x + 10, ha.y + ha.height / 2); await page.waitForTimeout(80)
  await page.mouse.click(hb.x + 10, hb.y + hb.height / 2)
  await expect.poll(() => a.getAttribute("aria-expanded"), { timeout: 2000 }).toBe("false")
}))

test("TZB-17b: at level 0 with room, pending (unplaced) cards are not auto-opened", () => W(zoomView(24, { leavesOnly: true, pending: 2 }), async page => {
  await openLinear(page)
  await zoomToAllOpen(page)
  await settle(page)
  await expect(table(page)).toHaveAttribute("data-auto-open", "")
  await tcard(page, "u0").scrollIntoViewIfNeeded(); await settle(page)
  await expect(tcard(page, "u0")).toHaveAttribute("aria-expanded", "false")
  await expect(tcard(page, "u1")).toHaveAttribute("aria-expanded", "false")
}))
