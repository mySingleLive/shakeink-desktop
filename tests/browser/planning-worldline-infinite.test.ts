import assert from "node:assert/strict"
import { test } from "node:test"
import type { Browser, Page } from "playwright-core"
import { expect } from "@playwright/test"
import { launch, revealTimelineCard, withWorldline, type WorldlineView } from "../helpers/worldline-browser-fixture"
import { f60 } from "../helpers/worldline-f60"
import { f885 } from "../helpers/worldline-f885"

/* docs/584: infinite timeline canvas (IC-10 … IC-17), left-click selection and box selection, the expand button and
 * batch time / delete / quote (IC-20 … IC-26). Synthetic data only. */
let browser: Browser
test.before(async () => { browser = await launch() })
test.after(async () => { await browser?.close() })
const openTimeline = async (page: Page) => { await page.getByRole("tab", { name: "时间线" }).click(); await page.locator("[data-timeline-plane]").waitFor() }
const lane = (page: Page) => page.locator("[data-timeline-lane]")
const root = (page: Page) => page.locator("[data-timeline]")
const viewY = (page: Page) => root(page).evaluate(e => Number(e.getAttribute("data-view-y")))
const viewStart = (page: Page) => root(page).evaluate(e => Number(e.getAttribute("data-view-start")))
const card = (page: Page, title: string) => page.locator(`[data-timeline-plane] [data-event-card][aria-label="${title}"]`)
const posts = (page: Page) => page.evaluate(() => (window as any).posts.length as number)
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
/** Middle-button drag from (x, y) by (dx, dy) in `steps` moves; `each` runs after every move. */
async function middleDrag(page: Page, x: number, y: number, dx: number, dy: number, steps = 12, each?: () => Promise<void>) {
  await page.mouse.move(x, y); await page.mouse.down({ button: "middle" })
  for (let k = 1; k <= steps; k++) { await page.mouse.move(x + dx * k / steps, y + dy * k / steps); if (each) await each() }
  await page.mouse.up({ button: "middle" })
}
const center = async (page: Page, title: string) => { const b = (await card(page, title).locator("[data-card-title]").boundingBox())!; return { x: b.x + b.width / 2, y: b.y + b.height / 2 } }

test("IC-10: the first open centres the packed cards; the right-most card is fully visible", () => withWorldline(browser, f60(), async page => {
  await openTimeline(page)
  await expect.poll(async () => {
    const r = await page.evaluate(() => {
      const l = document.querySelector("[data-timeline-lane]")!.getBoundingClientRect()
      const cards = [...document.querySelectorAll<HTMLElement>("[data-timeline-plane] [data-event-card]")].map(c => c.getBoundingClientRect()).filter(b => b.right > l.left && b.left < l.right)
      const left = Math.min(...cards.map(b => b.left)), right = Math.max(...cards.map(b => b.right)), top = Math.min(...cards.map(b => b.top)), bottom = Math.max(...cards.map(b => b.bottom))
      return { dx: Math.abs((left + right) / 2 - (l.left + l.right) / 2) / l.width, dy: bottom - top <= l.height ? Math.abs((top + bottom) / 2 - (l.top + l.bottom) / 2) / l.height : 0, rightIn: right <= l.right + 1 }
    })
    return r.dx < 0.1 && r.dy < 0.1 && r.rightIn
  }).toBe(true)
}))

test("IC-10b: a tree locate is not overridden by the first-open centring", () => withWorldline(browser, f60(), async page => {
  await openTimeline(page)
  const c = card(page, "破译石板的学者失踪")
  await page.getByRole("treeitem", { name: /^破译石板的学者失踪/ }).click()
  await expect.poll(() => c.evaluate(e => { const l = document.querySelector("[data-timeline-lane]")!.getBoundingClientRect(), b = e.getBoundingClientRect(); return b.top >= l.top && b.bottom <= l.bottom && b.left >= l.left - 1 && b.left <= l.right })).toBe(true)
}))

test("IC-11: the middle button drags 3000px down and right without a bound; dragging back restores every card", () => withWorldline(browser, f60(), async page => {
  await openTimeline(page)
  const p = await emptyPoint(page)
  const y0 = await viewY(page), s0 = await viewStart(page), before = await snap(page)
  const ys: number[] = [], ss: number[] = []
  let worst = 0
  await middleDrag(page, p.x, p.y, 3000, 3000, 30, async () => { ys.push(await viewY(page)); ss.push(await viewStart(page)); worst = Math.max(worst, overlaps((await snap(page)).filter(b => b.vis))) })
  for (let i = 1; i < ys.length; i++) { assert.ok(ys[i] >= ys[i - 1], `y monotonic at ${i}`); assert.ok(ss[i] <= ss[i - 1], `start monotonic at ${i}`) }
  assert.ok(Math.abs(await viewY(page) - y0 - 3000) <= 2, `y ${await viewY(page)}`)
  assert.ok(await viewStart(page) < s0)
  assert.equal(worst, 0)
  await middleDrag(page, p.x, p.y, -3000, -3000, 30)
  const after = new Map((await snap(page)).map(b => [b.id, b]))
  const off = before.filter(b => b.vis).filter(b => { const a = after.get(b.id); return !a || Math.abs(a.x - b.x) > 1 || Math.abs(a.y - b.y) > 1 })
  assert.equal(off.length, 0, JSON.stringify(off.slice(0, 3)))
  assert.equal(await lane(page).evaluate(l => l.scrollTop), 0)
}))

test("IC-11b: the editor is revealed by moving y; focusing its fields never scrolls the lane", () => withWorldline(browser, f60(), async page => {
  await openTimeline(page)
  // docs/592 R1: two-line titles make the families taller; bring the card into the lane first.
  await revealTimelineCard(page, card(page, "学徒在旧书中发现星图"))
  await card(page, "学徒在旧书中发现星图").locator("h3").dblclick()
  const save = page.getByRole("button", { name: "保存", exact: true })
  await expect(save).toBeVisible()
  await page.waitForTimeout(150)
  // The save button is inside the lane (revealed), and the lane's own scroll is 0.
  const inLane = await save.evaluate(b => { const l = document.querySelector("[data-timeline-lane]")!.getBoundingClientRect(), r = b.getBoundingClientRect(); return r.top >= l.top && r.bottom <= l.bottom })
  assert.ok(inLane, "save button in the lane")
  const y1 = await viewY(page)
  await page.getByLabel("事件标题").focus()
  await page.waitForTimeout(100)
  assert.equal(await lane(page).evaluate(l => l.scrollTop), 0)
  assert.equal(await viewY(page), y1)
}))

test("IC-12: with no card in view a 复位 button appears and brings cards back", () => withWorldline(browser, f60(), async page => {
  await openTimeline(page)
  const p = await emptyPoint(page)
  await middleDrag(page, p.x, p.y, 0, 6000, 6)
  const back = page.locator("[data-empty-view]").getByRole("button", { name: "复位" })
  await expect(back).toBeVisible()
  await expect(page.locator("[data-empty-view]")).toContainText("视图内没有事件")
  await back.click()
  await expect.poll(async () => (await snap(page)).filter(b => b.vis).length).toBeGreaterThan(0)
}))

test("IC-13: Space + left drag pans; Space in the search box types; Space on a focused card button presses it; after a card click Space pans", () => withWorldline(browser, f60(), async page => {
  await openTimeline(page)
  await root(page).focus()
  const p = await emptyPoint(page)
  let s = await viewStart(page)
  await page.keyboard.down("Space")
  await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(p.x - 200, p.y + 80, { steps: 6 }); await page.mouse.up()
  await page.keyboard.up("Space")
  assert.ok(await viewStart(page) > s, "panned left drag → later start")
  assert.equal(await page.locator("[data-event-card][data-selected]").count(), 0, "no box selection while Space is held")
  // Search box: Space types a space.
  const search = page.getByRole("searchbox", { name: "搜索事件" })
  await search.focus(); await page.keyboard.type("钟 楼")
  await expect(search).toHaveValue("钟 楼")
  await search.fill("")
  // A focused expand button: Space presses it.
  const c = card(page, "七王盟约签订")
  await c.locator("[data-card-expand]").focus()
  await page.keyboard.press("Space")
  await expect(c).toHaveAttribute("aria-expanded", "true")
  // After clicking a card, Space + drag pans.
  await card(page, "王立大学建校").locator("h3").click()
  s = await viewStart(page)
  const q = await emptyPoint(page)
  await page.keyboard.down("Space")
  await page.mouse.move(q.x, q.y); await page.mouse.down(); await page.mouse.move(q.x + 150, q.y, { steps: 5 }); await page.mouse.up()
  await page.keyboard.up("Space")
  assert.ok(await viewStart(page) < s)
}))

test("IC-14: middle or Space + left on a card title or a period pans and never changes time", () => withWorldline(browser, f60(), async page => {
  await openTimeline(page)
  // docs/592 R1: two-line titles make the families taller; bring the card into the lane first.
  await revealTimelineCard(page, card(page, "学徒在旧书中发现星图"))
  const t = await center(page, "学徒在旧书中发现星图")
  let s = await viewStart(page)
  await middleDrag(page, t.x, t.y, -160, 0, 6)
  assert.ok(await viewStart(page) > s); assert.equal(await posts(page), 0)
  assert.equal(await page.locator("[data-event-card][data-selected]").count(), 0)
  await root(page).focus()
  const t2 = await center(page, "学徒在旧书中发现星图")
  s = await viewStart(page)
  await page.keyboard.down("Space")
  await page.mouse.move(t2.x, t2.y); await page.mouse.down(); await page.mouse.move(t2.x - 160, t2.y, { steps: 6 }); await page.mouse.up()
  await page.keyboard.up("Space")
  assert.ok(await viewStart(page) > s); assert.equal(await posts(page), 0)
  // Periods: the band and its edge.
  const band = page.locator("[data-period]").filter({ hasText: "港口危机" }).first()
  const b = (await band.boundingBox())!
  s = await viewStart(page)
  await middleDrag(page, b.x + b.width / 2, b.y + b.height / 2, -120, 0, 6)
  assert.ok(await viewStart(page) > s); assert.equal(await posts(page), 0)
  const edge = page.getByRole("button", { name: /^调整.*开始$/ }).first()
  if (await edge.count()) {
    const e = (await edge.boundingBox())!
    s = await viewStart(page)
    await root(page).focus()
    await page.keyboard.down("Space")
    await page.mouse.move(e.x + 2, e.y + e.height / 2); await page.mouse.down(); await page.mouse.move(e.x - 100, e.y + e.height / 2, { steps: 5 }); await page.mouse.up()
    await page.keyboard.up("Space")
    assert.ok(await viewStart(page) > s); assert.equal(await posts(page), 0)
  }
}))

test("IC-15: Esc during a middle pan and a Space pan restores start and y", () => withWorldline(browser, f60(), async page => {
  await openTimeline(page)
  const p = await emptyPoint(page)
  const s0 = await viewStart(page), y0 = await viewY(page)
  await page.mouse.move(p.x, p.y); await page.mouse.down({ button: "middle" })
  await page.mouse.move(p.x - 200, p.y + 150, { steps: 5 })
  assert.notEqual(await viewY(page), y0)
  await page.keyboard.press("Escape"); await page.mouse.up({ button: "middle" })
  assert.equal(await viewStart(page), s0); assert.equal(await viewY(page), y0)
  await root(page).focus()
  await page.keyboard.down("Space")
  await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(p.x + 150, p.y - 100, { steps: 5 })
  await page.keyboard.press("Escape"); await page.mouse.up(); await page.keyboard.up("Space")
  assert.equal(await viewStart(page), s0); assert.equal(await viewY(page), y0)
}))

test("IC-16: wheel zoom keeps the card under the pointer at its screen y", () => withWorldline(browser, f60(), async page => {
  await openTimeline(page)
  const t = card(page, "钟楼守夜人在雾夜失踪").locator("[data-card-title]")
  const r0 = (await t.boundingBox())!
  await page.mouse.move(r0.x + 20, r0.y + r0.height / 2)
  const s0 = await viewStart(page)
  await page.mouse.wheel(0, 120)
  await expect.poll(() => viewStart(page)).not.toBe(s0)
  await page.waitForTimeout(150)
  assert.ok(Math.abs((await t.boundingBox())!.y - r0.y) < 2)
  assert.equal(await lane(page).evaluate(l => l.scrollTop), 0)
}))

/** A second world, for view memory (IC-17) and selection clearing (IC-26). */
function twoWorlds(): WorldlineView {
  const v = f60(), d = v.data as any
  d.worlds.push({ id: "w2", name: "第二世界线", calendar: d.worlds[0].calendar })
  d.events.push({ id: "x1", line: "w2", parent: null, title: "第二世界线的起点", time: { kind: "exact", value: 100 } })
  return v
}
test("IC-17: y is remembered per world", () => withWorldline(browser, twoWorlds(), async page => {
  await openTimeline(page)
  const p = await emptyPoint(page)
  const y0 = await viewY(page)
  await middleDrag(page, p.x, p.y, 0, 400, 6)
  const y1 = await viewY(page)
  assert.ok(Math.abs(y1 - y0 - 400) <= 2, `dragged y ${y0} → ${y1}`)
  await page.getByRole("combobox", { name: "当前世界线" }).selectOption({ label: "第二世界线" })
  await expect(card(page, "第二世界线的起点")).toHaveCount(1)
  await page.getByRole("combobox", { name: "当前世界线" }).selectOption({ label: "主世界线" })
  await expect.poll(() => viewY(page)).toBe(y1)
}))

test("IC-20: a click selects without expanding; empty click clears; ⌘ toggles; Shift adds; detail follows the primary", () => withWorldline(browser, f60(), async page => {
  await openTimeline(page)
  const a = card(page, "七王盟约签订"), b = card(page, "王立大学建校")
  await a.locator("h3").click()
  await expect(a).toHaveAttribute("data-selected", "")
  await expect(a).toHaveAttribute("aria-expanded", "false")
  const p = await emptyPoint(page)
  await page.mouse.click(p.x, p.y)
  await expect(page.locator("[data-timeline-plane] [data-event-card][data-selected]")).toHaveCount(0)
  await a.locator("h3").click()
  await b.locator("h3").click({ modifiers: ["Meta"] })
  await expect(page.locator("[data-timeline-plane] [data-event-card][data-selected]")).toHaveCount(2)
  await expect(page.locator("[data-selection-count]")).toHaveText("已选 2 个事件")
  await b.locator("h3").click({ modifiers: ["Meta"] })
  await expect(page.locator("[data-timeline-plane] [data-event-card][data-selected]")).toHaveCount(1)
  await expect(page.getByRole("button", { name: "查看事件详情" })).toBeEnabled()
  await b.locator("h3").click({ modifiers: ["Shift"] })
  await expect(page.locator("[data-timeline-plane] [data-event-card][data-selected]")).toHaveCount(2)
  // ⌘-click off the primary (b): the primary falls back to a, so the detail button stays enabled.
  await b.locator("h3").click({ modifiers: ["Meta"] })
  await expect(page.getByRole("button", { name: "查看事件详情" })).toBeEnabled()
}))

test("IC-21: a left drag from empty space box-selects; ⌘ adds; nothing pans or saves", () => withWorldline(browser, f60(), async page => {
  await openTimeline(page)
  const boxes = (await snap(page)).filter(b => b.vis).sort((a, b) => a.x - b.x || a.y - b.y)
  const pick = boxes.slice(0, 3)
  const l = (await lane(page).boundingBox())!
  const x0 = Math.max(l.x + 2, Math.min(...pick.map(b => b.x)) - 6), y0 = Math.min(...pick.map(b => b.y)) - 6
  const x1 = Math.max(...pick.map(b => b.x + 20)), y1 = Math.max(...pick.map(b => b.y + 10))
  const inside = boxes.filter(b => b.x < x1 && b.x + b.w > x0 && b.y < y1 && b.y + b.h > y0).map(b => b.id).sort()
  const s0 = await viewStart(page)
  await page.mouse.move(x0, y0); await page.mouse.down()
  await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 3 })
  await expect(page.locator("[data-select-rect]")).toBeVisible()
  await page.mouse.move(x1, y1, { steps: 3 }); await page.mouse.up()
  await expect(page.locator("[data-select-rect]")).toHaveCount(0)
  const sel = await page.locator("[data-timeline-plane] [data-event-card][data-selected]").evaluateAll(l => l.map(e => (e as HTMLElement).dataset.eventId!).sort())
  assert.deepEqual(sel, inside)
  assert.ok(inside.length >= 2)
  assert.equal(await viewStart(page), s0); assert.equal(await posts(page), 0)
  // ⌘ + a second box adds.
  const other = boxes.find(b => !inside.includes(b.id))!
  await page.keyboard.down("Meta")
  await page.mouse.move(other.x - 4, other.y - 4); await page.mouse.down(); await page.mouse.move(other.x + 10, other.y + 10, { steps: 3 }); await page.mouse.up()
  await page.keyboard.up("Meta")
  await expect(page.locator("[data-timeline-plane] [data-event-card][data-selected]")).toHaveCount(inside.length + 1)
}))

test("IC-21 (F885): a box selection includes cards outside the rendered band", () => withWorldline(browser, f885(), async page => {
  await openTimeline(page)
  const l = (await lane(page).boundingBox())!
  // Zoom out so many families stack beyond the rendered band, then box the whole lane height several times over.
  await page.mouse.move(l.x + l.width / 2, l.y + l.height / 2)
  for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(60) }
  await page.mouse.move(l.x + 4, l.y + 4); await page.mouse.down(); await page.mouse.move(l.x + l.width - 4, l.y + l.height - 4, { steps: 4 }); await page.mouse.up()
  // Every packed card inside the box is selected, by layout: the count equals the cards whose plane box meets the
  // lane, rendered or not (vband renders only part of them).
  const n = await page.locator("[data-selection-count]").evaluate(e => Number(e.textContent!.match(/\d+/)![0]))
  const inBand = await page.locator("[data-timeline-plane] [data-event-card][data-selected]").count()
  assert.ok(n >= 2, `selected ${n}`)
  assert.ok(n >= inBand, `${n} ≥ ${inBand}`)
}))

test("IC-21b: 30 box-selection frames render PlanningWorkspace 0 times", () => withWorldline(browser, f60(), async page => {
  await openTimeline(page)
  // Positive control: a selection does render the workspace, so the counter works in this bundle.
  await page.evaluate(() => { (globalThis as any).renders = {} })
  await card(page, "七王盟约签订").locator("h3").click()
  await expect.poll(() => page.evaluate(() => (globalThis as any).renders.PlanningWorkspace ?? 0)).toBeGreaterThan(0)
  const p = await emptyPoint(page)
  await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(p.x + 6, p.y + 6)
  await page.waitForTimeout(50)
  const before = await page.evaluate(() => (globalThis as any).renders.PlanningWorkspace ?? 0)
  for (let k = 1; k <= 30; k++) await page.mouse.move(p.x + 6 + k * 4, p.y + 6 + k * 3)
  const during = await page.evaluate(() => (globalThis as any).renders.PlanningWorkspace ?? 0)
  await page.mouse.up()
  assert.equal(during - before, 0)
  await expect(page.locator("[data-select-rect]")).toHaveCount(0)
}, { profiling: true }))

test("IC-22: the expand button toggles at once; a click does not expand; a double click edits", () => withWorldline(browser, f60(), async page => {
  await openTimeline(page)
  const c = card(page, "七王盟约签订")
  await c.locator("[data-card-expand]").click()
  await expect(c).toHaveAttribute("aria-expanded", "true")
  await expect(c.locator("[data-card-expand]")).toHaveAttribute("aria-label", "收起七王盟约签订")
  await c.locator("[data-card-expand]").click()
  await expect(c).toHaveAttribute("aria-expanded", "false", { timeout: 100 })
  await c.locator("h3").click()
  await page.waitForTimeout(350)
  await expect(c).toHaveAttribute("aria-expanded", "false")
  await c.locator("h3").dblclick()
  await expect(page.getByRole("button", { name: "保存", exact: true })).toBeVisible()
}))

/** A, B, C with C anchored to B (IC-23). */
function withAnchor(): WorldlineView {
  const v = f60(), d = v.data as any
  const b = d.events.find((e: any) => e.title === "王立大学建校")
  const c = d.events.find((e: any) => e.title === "钟楼守夜人在雾夜失踪")
  c.time = { kind: "exact", value: 50000, precision: "day", anchor: b.id, boundary: "start" }
  return v
}
test("IC-23: dragging one selected title moves the selection by one Δ; anchored events follow without their own put", () => withWorldline(browser, withAnchor(), async page => {
  await openTimeline(page)
  const titles = ["七王盟约签订", "王立大学建校", "钟楼守夜人在雾夜失踪"]
  await card(page, titles[0]).locator("h3").click()
  for (const t of titles.slice(1)) await card(page, t).locator("h3").click({ modifiers: ["Meta"] })
  await expect(page.locator("[data-selection-count]")).toHaveText("已选 3 个事件")
  const x0 = await Promise.all(titles.map(t => card(page, t).evaluate(e => e.getBoundingClientRect().left)))
  const h = await center(page, titles[0])
  await page.mouse.move(h.x, h.y); await page.mouse.down()
  await page.mouse.move(h.x + 60, h.y, { steps: 6 })
  const mid = await Promise.all(titles.map(t => card(page, t).evaluate(e => e.getBoundingClientRect().left)))
  for (let i = 0; i < 3; i++) assert.ok(mid[i] - x0[i] > 30, `${titles[i]} previews ${mid[i] - x0[i]}`)
  await page.mouse.up()
  await expect.poll(() => posts(page)).toBe(1)
  const ops = await page.evaluate(() => (window as any).posts[0].operations.map((o: any) => o.value.title).sort())
  assert.deepEqual(ops, ["七王盟约签订", "王立大学建校"].sort())
}))

test("IC-24: Backspace deletes the selection in one save; undo restores both; a blocked delete deletes nothing; the search box only edits", () => withWorldline(browser, f60(), async page => {
  await openTimeline(page)
  const a = "七王盟约签订", b = "王立大学建校"
  await card(page, a).locator("h3").click()
  await card(page, b).locator("h3").click({ modifiers: ["Meta"] })
  await page.keyboard.press("Backspace")
  const dialog = page.getByRole("dialog", { name: "删除事件" })
  await expect(dialog).toContainText("删除 2 个事件")
  await expect(dialog).toContainText(a); await expect(dialog).toContainText(b)
  await dialog.getByRole("button", { name: "确认" }).click()
  await expect.poll(() => posts(page)).toBe(1)
  assert.deepEqual(await page.evaluate(() => (window as any).posts[0].operations.map((o: any) => o.kind)), ["delete", "delete"])
  await expect(card(page, a)).toHaveCount(0); await expect(card(page, b)).toHaveCount(0)
  await page.getByRole("button", { name: "撤销上次规划修改" }).click()
  await expect(card(page, a)).toHaveCount(1); await expect(card(page, b)).toHaveCount(1)
  // A parent with a child outside the selection plus a plain card: the save fails as a whole.
  const n = await posts(page)
  await card(page, "港口商会签下秘密契约").locator("h3").click()
  await card(page, a).locator("h3").click({ modifiers: ["Meta"] })
  await page.keyboard.press("Backspace")
  await page.getByRole("dialog", { name: "删除事件" }).getByRole("button", { name: "确认" }).click()
  await expect.poll(() => posts(page)).toBe(n + 1)
  await expect(card(page, a)).toHaveCount(1)
  await expect(card(page, "港口商会签下秘密契约")).toHaveCount(1)
  // The search box keeps Backspace.
  const search = page.getByRole("searchbox", { name: "搜索事件" })
  await search.fill("钟楼"); await search.press("Backspace")
  await expect(search).toHaveValue("钟")
  await expect(page.getByRole("dialog", { name: "删除事件" })).toHaveCount(0)
}, { controller: true }))

test("IC-24 (Windows): Delete opens the batch delete confirmation", () => withWorldline(browser, f60(), async page => {
  await openTimeline(page)
  await card(page, "七王盟约签订").locator("h3").click()
  // The test host is macOS, where Chromium turns Ctrl + click into a context menu; Shift adds on every platform.
  await card(page, "王立大学建校").locator("h3").click({ modifiers: ["Shift"] })
  await page.keyboard.press("Delete")
  await expect(page.getByRole("dialog", { name: "删除事件" })).toContainText("删除 2 个事件")
}))

test("IC-25: the menu quotes the selection to chat in time order", () => withWorldline(browser, f60(), async page => {
  await openTimeline(page)
  await card(page, "王立大学建校").locator("h3").click()
  await card(page, "七王盟约签订").locator("h3").click({ modifiers: ["Meta"] })
  const c = card(page, "七王盟约签订")
  await c.locator("summary").click()
  await c.getByRole("button", { name: "引用所选 2 个事件到对话" }).click()
  const draft = await page.evaluate(() => (globalThis as any).chatDraft?.() as string)
  const lines = draft.split("\n").filter(Boolean)
  assert.equal(lines.length, 2)
  assert.ok(lines[0].includes("七王盟约签订") && lines[1].includes("王立大学建校"), draft)
}))

test("IC-26: deleting a selected event and switching worlds clean the selection", () => withWorldline(browser, twoWorlds(), async page => {
  await openTimeline(page)
  await card(page, "七王盟约签订").locator("h3").click()
  await card(page, "王立大学建校").locator("h3").click({ modifiers: ["Meta"] })
  await card(page, "钟楼守夜人在雾夜失踪").locator("h3").click({ modifiers: ["Meta"] })
  await expect(page.locator("[data-selection-count]")).toHaveText("已选 3 个事件")
  const c = card(page, "七王盟约签订")
  await c.locator("summary").click()
  await c.getByRole("button", { name: "删除", exact: true }).click()
  await page.getByRole("dialog", { name: "删除事件" }).getByRole("button", { name: "确认" }).click()
  await expect(page.locator("[data-selection-count]")).toHaveText("已选 2 个事件")
  await page.getByRole("combobox", { name: "当前世界线" }).selectOption({ label: "第二世界线" })
  await expect(page.locator("[data-selection-count]")).toHaveCount(0)
}))

/** A fork with one frozen prehistory event and one own event (docs/584 code review: batch delete skips nothing). */
function forked(): WorldlineView {
  return {
    version: 1,
    data: { schemaVersion: 1, worlds: [{ id: "w", name: "主世界线" }, { id: "fk", name: "分支", fork: { source: "w", event: "e1", version: 1, events: [{ id: "e0", line: "fk", title: "旧城失火", time: { kind: "exact", value: 12 } }], periods: [], calendar: {} } }],
      events: [{ id: "e0", line: "w", title: "旧城失火", time: { kind: "exact", value: 12 } }, { id: "e1", line: "w", title: "渡口相遇", time: { kind: "exact", value: 24 } }, { id: "f1", line: "fk", title: "分支后的事件", time: { kind: "exact", value: 48 } }],
      lines: [], periods: [], cards: [], volumes: [], chapters: [], connections: [] },
    characters: [], materials: [], readonly: false, history: [], proposals: [],
  }
}
test("IC-27: a selection holding frozen prehistory cannot be batch deleted (key and menu)", () => withWorldline(browser, forked(), async page => {
  await page.getByRole("combobox", { name: "当前世界线" }).selectOption("fk")
  await openTimeline(page)
  await card(page, "旧城失火").locator("h3").click()
  await card(page, "分支后的事件").locator("h3").click({ modifiers: ["Meta"] })
  await expect(page.locator("[data-selection-count]")).toHaveText("已选 2 个事件")
  await page.keyboard.press("Backspace")
  await expect(page.getByRole("dialog", { name: "删除事件" })).toHaveCount(0)
  await expect(page.getByText("所选事件中有冻结前史，不能删除")).toBeVisible()
  const c = card(page, "旧城失火")
  await c.locator("summary").click()
  await expect(c.getByRole("button", { name: "删除所选 2 个事件" })).toBeDisabled()
  assert.equal(await posts(page), 0)
}, { controller: true }))
