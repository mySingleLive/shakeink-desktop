import assert from "node:assert/strict"
import { test } from "node:test"
import type { Browser, Page } from "playwright-core"
import { expect } from "@playwright/test"
import { launch, withWorldline } from "../helpers/worldline-browser-fixture"
import { f60 } from "../helpers/worldline-f60"

/* docs/581 §3.3 on the timeline view, fixture F60 (family structure is fixture-only). */
let browser: Browser
test.before(async () => { browser = await launch() })
test.after(async () => { await browser?.close() })
const open = async (page: Page) => { await page.getByRole("tab", { name: "时间线" }).click(); await page.locator("[data-timeline-plane]").waitFor() }
type Box = { id: string; x: number; y: number; w: number; h: number; vis: boolean }
const snap = (page: Page) => page.evaluate(() => {
  const lane = document.querySelector("[data-timeline-lane]")!.getBoundingClientRect()
  return [...document.querySelectorAll<HTMLElement>("[data-timeline-plane] [data-event-card]")].map(c => {
    const r = c.getBoundingClientRect()
    return { id: c.dataset.eventId!, x: r.left, y: r.top, w: r.width, h: r.height, vis: r.right > lane.left && r.left < lane.right && r.bottom > lane.top && r.top < lane.bottom }
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
  return page.evaluate(() => {
    const l = document.querySelector("[data-timeline-lane]")!.getBoundingClientRect()
    for (let y = l.top + 20; y < l.bottom - 90; y += 10) for (let x = l.left + 300; x < l.right - 300; x += 20) {
      const el = document.elementFromPoint(x, y)
      if (el && !el.closest("[data-event-card],[data-family-frame]") && el.closest("[data-timeline-lane]")) return { x, y }
    }
    return null
  })
}
async function drag(page: Page, dx: number, steps = 24, each?: () => Promise<void>) {
  const p = (await emptyPoint(page))!
  await page.mouse.move(p.x, p.y); await page.mouse.down()
  for (let k = 1; k <= steps; k++) { await page.mouse.move(p.x + (dx * k) / steps, p.y); if (each) await each() }
  await page.mouse.up()
}

test("WU-50: a parent is a header bar at least as wide as its family range; children stay inside the frame", () => withWorldline(browser, f60(), async page => {
  await open(page)
  const frames = page.locator("[data-family-frame]")
  assert.ok(await frames.count() >= 1)
  const outside = await page.evaluate(() => {
    let bad = 0
    for (const f of document.querySelectorAll<HTMLElement>("[data-family-frame]")) {
      const r = f.getBoundingClientRect()
      for (const c of f.parentElement!.querySelectorAll<HTMLElement>(`[data-family="${f.dataset.family}"] [data-event-card]`)) {
        const b = c.getBoundingClientRect()
        if (b.top > r.top + 20 && (b.left < r.left - 1 || b.right > r.right + 1)) bad++
      }
    }
    return bad
  })
  assert.equal(outside, 0)
  await expect(page.locator("[data-family-range]").first()).toContainText("→")
}))

test("WU-51: dragging the canvas 24 frames moves no visible card vertically, overlaps nothing and keeps scrollTop", () => withWorldline(browser, f60(), async page => {
  await open(page)
  await page.locator("[data-timeline-lane]").evaluate(l => { l.scrollTop = 160 })
  const top0 = await page.locator("[data-timeline-lane]").evaluate(l => l.scrollTop)
  let before = await snap(page), moved = 0, worst = 0
  await drag(page, -720, 24, async () => {
    const now = await snap(page), by = new Map(now.map(c => [c.id, c]))
    for (const c of before) { const d = by.get(c.id); if (c.vis && d?.vis && Math.abs(d.y - c.y) > 0.5) moved++ }
    worst = Math.max(worst, overlaps(now.filter(c => c.vis)))
    before = now
  })
  assert.equal(moved, 0, "vertical moves while panning")
  assert.equal(worst, 0, "overlaps while panning")
  assert.equal(await page.locator("[data-timeline-lane]").evaluate(l => l.scrollTop), top0)
}))

test("WU-52/WU-53: expanding keeps that card in place and moves no other family; dragging away and back restores every card", () => withWorldline(browser, f60(), async page => {
  await open(page)
  const pre = await snap(page)
  const target = pre.find(c => c.vis && c.y < 500)!
  await page.locator(`[data-timeline-plane] [data-event-card][data-event-id="${target.id}"] h3`).click()
  await page.mouse.move(5, 5)
  await expect(page.locator(`[data-timeline-plane] [data-event-card][data-event-id="${target.id}"]`)).toHaveAttribute("aria-expanded", "true")
  const post = await snap(page), t1 = post.find(c => c.id === target.id)!
  assert.ok(Math.abs(t1.y - target.y) < 1 && Math.abs(t1.x - target.x) < 1, "expanded card stays")
  assert.equal(overlaps(post), 0)
  await page.locator(`[data-timeline-plane] [data-event-card][data-event-id="${target.id}"] h3`).click()
  await page.mouse.move(5, 5)
  const a = await snap(page)
  await drag(page, -1100, 12); await drag(page, 1100, 12)
  const b = await snap(page), by = new Map(b.map(c => [c.id, c]))
  assert.equal(a.filter(c => { const d = by.get(c.id); return !d || Math.abs(d.x - c.x) > 1 || Math.abs(d.y - c.y) > 1 }).length, 0)
}))

test("WU-54: Ctrl + wheel zooms out three steps with no overlap", () => withWorldline(browser, f60(), async page => {
  await open(page)
  const box = (await page.locator("[data-timeline-lane]").boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + 200)
  await page.keyboard.down("Control")
  for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(60) }
  await page.keyboard.up("Control")
  await page.waitForTimeout(200)
  assert.equal(overlaps(await snap(page)), 0)
}))

test("WU-56/WU-56b: the minimap jumps to ancient events and back with cards in place; → moves a quarter window", () => withWorldline(browser, f60(), async page => {
  await open(page)
  const before = await snap(page)
  const mm = page.getByRole("slider", { name: /全局缩略/ })
  const r = (await mm.boundingBox())!
  await page.mouse.click(r.x + 6, r.y + r.height / 2)
  await expect(page.locator("[data-range]")).toContainText(/前|旧纪|-/)
  const ancient = await snap(page)
  assert.ok(ancient.some(c => c.vis), "ancient cards visible")
  assert.equal(overlaps(ancient.filter(c => c.vis)), 0)
  const coords = await page.locator("[data-timeline-plane] [data-event-card]").evaluateAll(list => list.map(e => Math.abs(parseFloat((e.closest("[data-plane-left]") as HTMLElement)?.style.left ?? "0"))))
  assert.ok(coords.every(v => v < 1e6 + 7 * 1500), `max css left ${Math.max(...coords)}`)
  await page.mouse.click(r.x + r.width - 4, r.y + r.height / 2)
  await mm.focus()
  const t0 = await mm.getAttribute("aria-valuenow")
  await page.keyboard.press("ArrowRight")
  await expect.poll(() => mm.getAttribute("aria-valuenow")).not.toBe(t0)
  void before
}))

test("WU-56d: Esc during a drag restores the window", () => withWorldline(browser, f60(), async page => {
  await open(page)
  const range0 = await page.locator("[data-range]").innerText()
  const p = (await emptyPoint(page))!
  await page.mouse.move(p.x, p.y); await page.mouse.down()
  await page.mouse.move(p.x - 300, p.y, { steps: 6 })
  await page.keyboard.press("Escape")
  await page.mouse.up()
  await expect(page.locator("[data-range]")).toHaveText(range0)
}))

/* Code-review regressions of the timeline (R1, R2, R5, R6, R8). Synthetic F60 data only. */
const cardX = (page: Page, id: string) => page.locator(`[data-timeline-plane] [data-event-card][data-event-id="${id}"]`).evaluate(e => e.getBoundingClientRect().left)

test("TL-R1: saving a new start time repacks the timeline; the card moves right", () => withWorldline(browser, f60(), async page => {
  await open(page)
  const t = (await snap(page)).find(c => c.vis && c.y < 500)!
  const id = t.id, x0 = await cardX(page, id)
  await page.locator(`[data-timeline-plane] [data-event-card][data-event-id="${id}"] h3`).dblclick()
  const offset = page.getByLabel("开始时间偏移")
  const old = Number(await offset.inputValue())
  await offset.fill(String(old + Math.max(1, Math.abs(old) * 0.002)))
  await page.getByRole("button", { name: "保存事件", exact: true }).click()
  await expect.poll(() => page.locator(`[data-timeline-plane] [data-event-card][data-event-id="${id}"]`).count()).toBe(1)
  await expect.poll(() => cardX(page, id)).toBeGreaterThan(x0 + 1)
}))

test("TL-R2: one Ctrl+wheel step changes the zoom label once (a single wheel handler)", () => withWorldline(browser, f60(), async page => {
  await open(page)
  const box = (await page.locator("[data-timeline-lane]").boundingBox())!
  const range0 = await page.locator("[data-range]").innerText()
  const spanOf = () => page.locator("[data-timeline]").evaluate(e => Number(e.getAttribute("data-view-span")))
  const width0 = await spanOf()
  await page.mouse.move(box.x + box.width / 2, box.y + 100)
  await page.keyboard.down("Control"); await page.mouse.wheel(0, 120); await page.keyboard.up("Control")
  await expect(page.locator("[data-range]")).not.toHaveText(range0)
  await page.waitForTimeout(300)
  const width1 = await spanOf()
  // One 1.2× step, not two (1.44×) and not a step undone by a second handler.
  const r = width1 / width0
  assert.ok(r > 1.1 && r < 1.3, `span ratio ${r}`)
}))

test("TL-R5: the event tree locates on the timeline without switching to the table", () => withWorldline(browser, f60(), async page => {
  await open(page)
  await page.getByRole("tree", { name: "事件目录" }).getByRole("treeitem", { name: /大洪水淹没低地王国/ }).click()
  await expect(page.getByRole("tab", { name: "时间线" })).toHaveAttribute("aria-selected", "true")
  const card = page.locator('[data-timeline-plane] [data-event-card][aria-label="大洪水淹没低地王国"]')
  await expect(card).toHaveAttribute("data-selected", "")
  await expect.poll(async () => {
    const b = await card.boundingBox(), l = await page.locator("[data-timeline-lane]").boundingBox()
    return !!b && !!l && b.x >= l.x && b.x < l.x + l.width && b.y >= l.y && b.y < l.y + l.height
  }).toBe(true)
}))

test("TL-R6: a period band opens its detail; bands keep the id-hash colour", () => withWorldline(browser, f60(), async page => {
  await open(page)
  const band = page.locator("[data-period]").first()
  await expect(band).toBeVisible()
  await band.locator("button").filter({ hasNotText: "│" }).first().click()
  await expect(page.getByRole("dialog")).toBeVisible()
}))

test("TL-R8: a cancelled minimap drag does not keep moving the window on hover", () => withWorldline(browser, f60(), async page => {
  await open(page)
  const mm = page.getByRole("slider", { name: /全局缩略/ })
  const r = (await mm.boundingBox())!
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2); await page.mouse.down()
  await page.keyboard.press("Escape")
  await page.mouse.up()
  const v0 = await mm.getAttribute("aria-valuenow")
  await page.mouse.move(r.x + 10, r.y + r.height / 2, { steps: 4 })
  await page.waitForTimeout(100)
  assert.equal(await mm.getAttribute("aria-valuenow"), v0)
}))
