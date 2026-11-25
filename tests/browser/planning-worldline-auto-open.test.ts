import assert from "node:assert/strict"
import { test } from "node:test"
import type { Browser, Page } from "playwright-core"
import { expect } from "@playwright/test"
import { launch, revealTimelineCard, withWorldline } from "../helpers/worldline-browser-fixture"
import { ZOOM_GAP, zoomView } from "../helpers/worldline-zoom"

/* docs/597 ZB-37 … ZB-46: auto-open at zoom level 0. Fixture zoomView (tests/helpers/worldline-zoom.ts; `leavesOnly`
 * gives 24 leaf roots 720 h apart, so the gap between two open cards is d − 420 px) on the in-memory fixture API, not a
 * real-target proof. Expected values follow docs/597 §6 (enter at gap ≥ 24, keep at gap ≥ 20, open cards 420 wide). */
let browser: Browser
test.before(async () => { browser = await launch() })
test.after(async () => { await browser?.close() })

const Z = { zoomLevels: true } as const
const W = (view: Parameters<typeof withWorldline>[1], body: (page: Page) => Promise<void>, options?: Parameters<typeof withWorldline>[3]) =>
  withWorldline(browser, view, async page => { await page.evaluate("globalThis.__name = f => f"); await body(page) }, options)
const frames = (page: Page, n = 3) => page.evaluate(n => new Promise<void>(r => { const f = (k: number) => k ? requestAnimationFrame(() => f(k - 1)) : r(); f(n) }), n)
const tab = (page: Page, name: "时间线" | "事件表") => page.getByRole("tab", { name }).first().click()
const openTimeline = async (page: Page) => { await tab(page, "时间线"); await page.locator("[data-timeline-plane]").first().waitFor(); await frames(page) }
const cardById = (page: Page, id: string) => page.locator(`[data-timeline-plane] [data-event-card][data-event-id="${id}"]`)
const posts = (page: Page) => page.evaluate(() => (globalThis as any).posts.length as number)
const renders = (page: Page) => page.evaluate(() => ({ ...(globalThis as any).renders })) as Promise<Record<string, number>>
const reset = (page: Page) => page.evaluate(() => { (globalThis as any).renders = {} })
const root = (panel: number | null) => (panel === null ? "document" : `document.querySelectorAll("[data-fixture-panel]")[${panel}]`)
const dOf = (page: Page, panel: number | null = null) => page.evaluate(`(() => { const p = ${root(panel)}; const t = p.querySelector("[data-timeline]"), w = p.querySelector("[data-timeline-lane]").clientWidth - 28; return ${ZOOM_GAP} * w / Number(t.getAttribute("data-view-span")) })()`) as Promise<number>
/** Timeline cards whose box meets the lane: count, open count, least gap between neighbours by x, open widths. */
const inView = (page: Page, panel: number | null = null) => page.evaluate(`(() => {
  const p = ${root(panel)}, lane = p.querySelector("[data-timeline-lane]").getBoundingClientRect()
  const cs = [...p.querySelectorAll("[data-timeline-plane] [data-event-card]")].map(e => ({ id: e.dataset.eventId, open: e.getAttribute("aria-expanded") === "true", r: e.getBoundingClientRect() }))
    .filter(c => c.r.width > 0 && c.r.right > lane.left && c.r.left < lane.right && c.r.bottom > lane.top && c.r.top < lane.bottom)
  const s = [...cs].sort((a, b) => a.r.left - b.r.left)
  let minGap = Infinity
  for (let i = 1; i < s.length; i++) minGap = Math.min(minGap, s[i].r.left - s[i - 1].r.right)
  return { n: cs.length, open: cs.filter(c => c.open).length, minGap, ids: cs.map(c => c.id), openIds: cs.filter(c => c.open).map(c => c.id), widths: cs.filter(c => c.open).map(c => Math.round(c.r.width)) }
})()`) as Promise<{ n: number; open: number; minGap: number; ids: string[]; openIds: string[]; widths: number[] }>
/** Wheel until d is inside [lo, hi): coarse ×1.2 steps, then fine ×1.009 ones, the pointer on event `at` when drawn. */
async function zoomTo(page: Page, lo: number, hi: number, at?: string, panel: number | null = null) {
  const lanes = page.locator("[data-timeline-lane]")
  const l = (await (panel === null ? lanes.first() : page.locator("[data-fixture-panel]").nth(panel).locator("[data-timeline-lane]")).boundingBox())!
  await page.mouse.move(l.x + l.width / 2, l.y + 40)
  for (let i = 0; i < 300; i++) {
    const d = await dOf(page, panel)
    if (d >= lo && d < hi) return d
    if (at) {
      const scope = panel === null ? page : page.locator("[data-fixture-panel]").nth(panel)
      const b = await scope.locator(`[data-timeline-plane] [data-event-id="${at}"]`).first().boundingBox().catch(() => null)
      if (b && b.x + 2 > l.x && b.x + 2 < l.x + l.width) await page.mouse.move(b.x + 2, Math.min(Math.max(b.y + 6, l.y + 10), l.y + l.height - 10))
    }
    const far = d > hi * 1.25 || d < lo / 1.25
    await page.mouse.wheel(0, (d >= hi ? 1 : -1) * (far ? 100 : 5))
    await frames(page, 2)
  }
  throw Error(`d did not reach [${lo}, ${hi}): ${await dOf(page, panel)}`)
}
/** All in-view cards open, at least two of them, 420 wide, neighbours at least `gap` apart. */
async function allOpen(page: Page, gap: number, panel: number | null = null) {
  const v = await inView(page, panel)
  assert.ok(v.n >= 2, `at least two cards in view: ${JSON.stringify(v)}`)
  assert.equal(v.open, v.n, `all open: ${JSON.stringify(v)}`)
  assert.ok(v.widths.every(w => w === 420), `widths ${v.widths}`)
  assert.ok(v.minGap >= gap - 0.5, `least gap ${v.minGap} ≥ ${gap}`)
  return v
}
const noneOpen = async (page: Page, panel: number | null = null) => {
  const v = await inView(page, panel)
  assert.ok(v.n >= 1, "cards in view")
  assert.equal(v.open, 0, `none open: ${JSON.stringify(v)}`)
}
const leaves = () => zoomView(24, { leavesOnly: true })

test("ZB-37: leaves: closed below d 430; at 445 ≤ d < 460 every card in view opens, 420 wide, ≥ 24 apart; no save; the event table stays closed", () => W(leaves(), async page => {
  await openTimeline(page)
  await zoomTo(page, 300, 430, "r6"); await frames(page)
  await noneOpen(page)
  await zoomTo(page, 445, 460, "r6"); await frames(page)
  await allOpen(page, 24)
  // docs/600: the table auto-opens by its own crowding; at its reset (level 1) nothing opens, and openCards is untouched.
  // docs/601: the aligned table never auto-opens, so the check runs in linear mode (等距), where it could.
  await tab(page, "事件表"); await frames(page)
  await page.locator("[data-rail-mode-toggle]").getByRole("button", { name: "等距", exact: true }).click(); await frames(page)
  await expect(page.locator('[data-event-card][aria-expanded="true"]')).toHaveCount(0)
  await tab(page, "时间线"); await frames(page, 4)
  await allOpen(page, 24)
  assert.equal(await posts(page), 0)
}, Z))

test("ZB-38: hysteresis: open stays at 440.5 ≤ d < 443.5, closes below 438, and does not reopen in the band until d ≥ 445", () => W(leaves(), async page => {
  await openTimeline(page)
  await zoomTo(page, 445, 460, "r6"); await frames(page)
  await allOpen(page, 24)
  await zoomTo(page, 440.5, 443.5, "r6"); await frames(page)
  await allOpen(page, 20)
  await zoomTo(page, 400, 438, "r6"); await frames(page)
  await noneOpen(page)
  await zoomTo(page, 440.5, 443.5, "r6"); await frames(page)
  await noneOpen(page)
  await zoomTo(page, 445, 460, "r6"); await frames(page)
  await allOpen(page, 24)
}, Z))

test("ZB-39: zoomView at 445 ≤ d < 460 opens the leaves around r15; panning r8's family (children 30px apart) into view closes all; back reopens", () => W(zoomView(), async page => {
  await openTimeline(page)
  await zoomTo(page, 445, 460, "r15"); await frames(page)
  await revealTimelineCard(page, cardById(page, "r15"))
  await allOpen(page, 24)
  const l = (await page.locator("[data-timeline-lane]").boundingBox())!
  await page.mouse.move(l.x + l.width / 2, l.y + 40)
  const hasR8 = async () => (await inView(page)).ids.some(id => id.startsWith("r8c"))
  for (let i = 0; i < 80 && !(await hasR8()); i++) { await page.mouse.wheel(-60, 0); await frames(page, 2) }
  assert.ok(await hasR8(), "r8's children in view")
  await frames(page)
  await noneOpen(page)
  const clear = async () => { const v = await inView(page); return v.ids.includes("r15") && !v.ids.some(id => id.startsWith("r8")) }
  for (let i = 0; i < 80 && !(await clear()); i++) { await page.mouse.wheel(60, 0); await frames(page, 2) }
  assert.ok(await clear(), "back at r15")
  await frames(page)
  await allOpen(page, 24)
}, Z))

test("ZB-40: collapsing an auto-opened card keeps it closed (top unchanged) through a pan over empty rows; zooming out and back reopens it", () => W(leaves(), async page => {
  await openTimeline(page)
  await zoomTo(page, 445, 460, "r6"); await frames(page)
  const k = cardById(page, "r6")
  await revealTimelineCard(page, k)
  await allOpen(page, 24)
  const before = (await k.boundingBox())!.y
  await k.locator("[data-card-expand]").click(); await frames(page)
  await expect(k).toHaveAttribute("aria-expanded", "false")
  assert.ok(Math.abs((await k.boundingBox())!.y - before) <= 1, "r6 stays under the pointer")
  const v = await inView(page)
  assert.equal(v.open, v.n - 1, "only r6 closed")
  // ⌘ + wheel moves the rows: scroll the cards out of the lane (no card in view) and back.
  const l = (await page.locator("[data-timeline-lane]").boundingBox())!
  await page.mouse.move(l.x + l.width / 2, l.y + 40)
  await page.keyboard.down("Meta")
  for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, 200); await frames(page, 1) }
  await frames(page)
  assert.equal((await inView(page)).n, 0, "no card in view")
  for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, -200); await frames(page, 1) }
  await page.keyboard.up("Meta")
  await frames(page)
  await expect(k).toHaveAttribute("aria-expanded", "false")
  assert.equal((await inView(page)).open, (await inView(page)).n - 1)
  await zoomTo(page, 300, 430, "r6"); await frames(page)
  await noneOpen(page)
  await zoomTo(page, 445, 460, "r6"); await frames(page)
  await expect(k).toHaveAttribute("aria-expanded", "true")
  await allOpen(page, 24)
  // docs/600: the table's own level (reset 1) does not auto-open r6; the timeline's closed set does not leak into it.
  await tab(page, "事件表"); await frames(page)
  await page.locator("[data-rail-mode-toggle]").getByRole("button", { name: "等距", exact: true }).click(); await frames(page)
  await expect(page.locator('[data-event-card][data-event-id="r6"]')).toHaveAttribute("aria-expanded", "false")
}, Z))

test("ZB-41: while auto-open is on, 30 pan frames and 6 zoom steps render PlanningWorkspace 0 times; a pan frame renders only cards entering the DOM", () => W(leaves(), async page => {
  await openTimeline(page)
  await zoomTo(page, 445, 460, "r6"); await frames(page)
  await allOpen(page, 24)
  const l = (await page.locator("[data-timeline-lane]").boundingBox())!
  await page.mouse.move(l.x + l.width / 2, l.y + 40)
  const ids = () => page.evaluate(() => [...document.querySelectorAll("[data-timeline-plane] [data-event-card]")].map(e => (e as HTMLElement).dataset.eventId!))
  const seen = new Set(await ids())
  await reset(page)
  let entered = 0
  for (let i = 0; i < 30; i++) {
    await page.mouse.wheel(20, 0); await frames(page, 1)
    for (const id of await ids()) if (!seen.has(id)) { seen.add(id); entered++ }
  }
  const r = await renders(page)
  assert.equal(r.PlanningWorkspace ?? 0, 0, "pan")
  // Cards already in the DOM never re-render on a pan frame (stable card context); only entering cards mount.
  assert.ok((r.EventCard ?? 0) <= entered * 2, `EventCard renders ${r.EventCard} for ${entered} entering cards`)
  await allOpen(page, 24)
  await reset(page)
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -5); await frames(page, 1) }
  assert.equal((await renders(page)).PlanningWorkspace ?? 0, 0, "zoom")
  await allOpen(page, 24)
}, { ...Z, profiling: true }))

test("ZB-42: with zoom levels off nothing opens at d ≥ 445; without a Provider (product default) it opens", async () => {
  await W(leaves(), async page => {
    await openTimeline(page)
    await zoomTo(page, 445, 460, "r6"); await frames(page)
    await noneOpen(page)
  })
  await W(leaves(), async page => {
    await openTimeline(page)
    await zoomTo(page, 445, 460, "r6"); await frames(page)
    await allOpen(page, 24)
  }, { zoomLevels: "default" })
})

/** Plane-relative top of a card's positioned box (the layout y, before the plane's translate). */
const planeTop = (page: Page, id: string) => page.locator(`[data-timeline-plane] [data-event="${id}"]`).evaluate(e => parseFloat((e as HTMLElement).style.top))
test("ZB-43: r6 sits under r5's bar at a different layout y closed and open; on the steps that open and close it keeps its screen top (±1px)", () => W(zoomView(24, { leavesOnly: true, longRoot: 5 }), async page => {
  await openTimeline(page)
  await zoomTo(page, 420, 435, "r6"); await frames(page)
  const k = cardById(page, "r6")
  await revealTimelineCard(page, k)
  const step = async (dy: number) => {
    const b = (await k.boundingBox())!, t0 = await planeTop(page, "r6")
    await page.mouse.move(b.x + 4, b.y + 8)
    const open0 = (await inView(page)).open
    await page.mouse.wheel(0, dy); await frames(page, 3)
    const changed = (await inView(page)).open !== open0
    // The anchor must have work to do: the two layouts put r6 at different y (code review P2-1).
    if (changed) assert.ok(Math.abs((await planeTop(page, "r6")) - t0) > 10, `layout y ${t0} → ${await planeTop(page, "r6")}`)
    return { moved: Math.abs((await k.boundingBox())!.y - b.y), changed }
  }
  let entered = false
  for (let i = 0; i < 40 && !entered; i++) { const s = await step(-5); if (s.changed) { entered = true; assert.ok(s.moved <= 1, `enter moved ${s.moved}`) } }
  assert.ok(entered, "opened")
  await allOpen(page, 20)
  let left = false
  for (let i = 0; i < 40 && !left; i++) { const s = await step(5); if (s.changed) { left = true; assert.ok(s.moved <= 1, `leave moved ${s.moved}`) } }
  assert.ok(left, "closed")
  await noneOpen(page)
}, Z))

test("ZB-44: zoomView at d ≥ 6670 on r2: its header and children all open, the children d/15 − 420 apart (≥ 24) on one row", () => W(zoomView(), async page => {
  await openTimeline(page)
  const d = await zoomTo(page, 6670, 6900, "r2c0"); await frames(page, 4)
  const k0 = cardById(page, "r2c0"), k1 = cardById(page, "r2c1")
  await revealTimelineCard(page, k0)
  const v = await inView(page)
  assert.ok(v.ids.includes("r2c0") && v.ids.includes("r2c1"), `children in view: ${v.ids}`)
  assert.equal(v.open, v.n, `all open: ${JSON.stringify(v)}`)
  const [a, b] = [(await k0.boundingBox())!, (await k1.boundingBox())!]
  assert.ok(Math.abs(a.y - b.y) <= 0.5, "one row")
  const gap = b.x - (a.x + a.width)
  assert.ok(Math.abs(gap - (48 * (await dOf(page))) / 720 + 420) <= 1 && gap >= 24 - 0.5, `gap ${gap} at d ${d}`)
}, Z))

test("ZB-45: double click edits an auto-opened card and saving keeps it open after zoom-out; a single click does not change what is open", () => W(leaves(), async page => {
  await openTimeline(page)
  await zoomTo(page, 445, 460, "r6"); await frames(page)
  const k = cardById(page, "r6")
  await revealTimelineCard(page, k)
  const v0 = await allOpen(page, 24)
  // docs/599: the head gained a 24px 新建子事件 button; pick a card whose title is not under the tree splitter.
  const lane0 = (await page.locator("[data-timeline-lane]").boundingBox())!
  let other = v0.ids.find(id => id !== "r6")!
  for (const id of v0.ids.filter(id => id !== "r6")) { const t = await cardById(page, id).locator("[data-card-title]").boundingBox(); if (t && t.x > lane0.x + 12) { other = id; break } }
  await cardById(page, other).locator("[data-card-title]").click(); await frames(page)
  assert.deepEqual((await inView(page)).openIds.sort(), v0.openIds.sort(), "a click selects only")
  await k.locator("[data-card-title]").dblclick()
  await page.getByLabel("事件标题").fill("改过的标题")
  await page.getByRole("button", { name: "保存", exact: true }).click()
  await expect.poll(() => posts(page)).toBe(1)
  await zoomTo(page, 300, 430, "r6"); await frames(page)
  await expect(k).toHaveAttribute("aria-expanded", "true")
  const v = await inView(page)
  assert.deepEqual(v.openIds, ["r6"], `only the edited card stays open: ${JSON.stringify(v)}`)
}, Z))

test("ZB-46: two panels: only the zoomed-in one auto-opens", () => W(leaves(), async page => {
  const panels = page.locator("[data-fixture-panel]")
  await panels.nth(0).getByRole("tab", { name: "时间线" }).click()
  await panels.nth(1).getByRole("tab", { name: "时间线" }).click()
  await frames(page, 4)
  await zoomTo(page, 445, 460, "r6", 0); await frames(page)
  await allOpen(page, 24, 0)
  await noneOpen(page, 1)
}, { ...Z, panels: 2 }))
