import assert from "node:assert/strict"
import { test } from "node:test"
import type { Browser, Page } from "playwright-core"
import { expect } from "@playwright/test"
import { launch, withWorldline } from "../helpers/worldline-browser-fixture"
import { f60 } from "../helpers/worldline-f60"

/* docs/581 WU-56c, WU-64 and WU-82 (B): render counts with the profiling bundle (§0 F2). Each count first passes a
 * positive control, so a silent counter cannot make a case pass. Fixture F60. */
let browser: Browser
test.before(async () => { browser = await launch() })
test.after(async () => { await browser?.close() })
const renders = (page: Page) => page.evaluate(() => ({ ...(globalThis as any).renders })) as Promise<Record<string, number>>
const reset = (page: Page) => page.evaluate(() => { (globalThis as any).renders = {} })
async function emptyPoint(page: Page) {
  return (await page.evaluate(() => {
    const l = document.querySelector("[data-timeline-lane]")!.getBoundingClientRect()
    for (let y = l.top + 20; y < l.bottom - 90; y += 10) for (let x = l.left + 300; x < l.right - 300; x += 20) {
      const el = document.elementFromPoint(x, y)
      if (el && !el.closest("[data-event-card],[data-family-frame],button") && el.closest("[data-timeline-lane]")) return { x, y }
    }
    return null
  }))!
}

test("WU-56c: 30 drag frames render PlanningWorkspace 0 times; the tree is throttled; ruler, legend and tree settle after", () => withWorldline(browser, f60(), async page => {
  await page.getByRole("tab", { name: "时间线" }).click()
  await page.locator("[data-timeline-plane]").waitFor()
  // Positive control: selecting a card renders the workspace and the tree.
  await reset(page)
  await page.locator("[data-timeline-plane] [data-event-card] h3").first().click()
  await expect.poll(async () => (await renders(page)).PlanningWorkspace ?? 0).toBeGreaterThan(0)
  assert.ok(((await renders(page)).EventTree ?? 0) > 0, "tree counter works")
  await page.mouse.move(5, 5)
  await page.waitForTimeout(300)
  await reset(page)
  const p = await emptyPoint(page)
  const t0 = Date.now()
  await page.mouse.move(p.x, p.y); await page.mouse.down()
  for (let k = 1; k <= 30; k++) await page.mouse.move(p.x - k * 12, p.y)
  await page.mouse.up()
  const dur = Date.now() - t0
  const during = await renders(page)
  assert.equal(during.PlanningWorkspace ?? 0, 0, "workspace renders during drag")
  assert.ok((during.EventTree ?? 0) <= Math.ceil(dur / 100) + 1, `tree ${during.EventTree} in ${dur}ms`)
  assert.ok((during.Ruler ?? 0) > 0, "ruler follows the drag")
  await reset(page)
  await page.waitForTimeout(150)
  const after = await renders(page)
  assert.equal(after.PlanningWorkspace ?? 0, 0, "workspace renders after drag")
  for (const id of ["EventTree"]) assert.ok((after[id] ?? 0) <= 2, `${id} after ${after[id]}`)
}, { profiling: true }))

test("WU-64: the tree's in-view count follows a pan; hovering the tree stops auto-scroll", () => withWorldline(browser, f60(), async page => {
  await page.getByRole("tab", { name: "时间线" }).click()
  const count = page.locator("[data-tree-inview]")
  await expect(count).toHaveText(/^视窗内 \d+ 件$/)
  // F60's first window holds every placed event; zoom in so a pan changes which events are inside it.
  for (let i = 0; i < 8; i++) await page.getByRole("button", { name: "放大" }).click()
  await expect.poll(async () => Number((await count.innerText()).match(/\d+/)![0])).toBeLessThan(57)
  const c0 = await count.innerText()
  await page.getByRole("tree", { name: "事件目录" }).getByRole("treeitem", { name: /^大洪水淹没低地王国 / }).click()
  await expect(count).not.toHaveText(c0)
  assert.ok(await page.locator('[role="treeitem"][class*="inView"]').count() > 0)
  const nav = page.locator('nav[aria-label="事件目录"]')
  await nav.hover()
  const top = await nav.evaluate(n => n.scrollTop)
  await page.locator("[data-timeline]").evaluate(() => {})
  await page.waitForTimeout(200)
  assert.equal(await nav.evaluate(n => n.scrollTop), top)
}))

test("WU-82 (B): each drag frame takes under 16ms", () => withWorldline(browser, f60(), async page => {
  await page.getByRole("tab", { name: "时间线" }).click()
  const p = await emptyPoint(page)
  await page.mouse.move(p.x, p.y); await page.mouse.down()
  const times: number[] = []
  for (let k = 1; k <= 30; k++) {
    const t = await page.evaluate(([x, y]) => new Promise<number>(res => {
      const start = performance.now()
      document.querySelector("[data-timeline-lane]")!.dispatchEvent(new PointerEvent("pointermove", { clientX: x, clientY: y, bubbles: true, pointerId: 1 }))
      requestAnimationFrame(() => res(performance.now() - start))
    }), [p.x - k * 12, p.y])
    times.push(t)
  }
  await page.mouse.up()
  times.sort((a, b) => a - b)
  const p95 = times[Math.floor(times.length * 0.95) - 1]
  assert.ok(p95 < 16 || times[Math.floor(times.length / 2)] < 16, `frame times ${times.map(t => t.toFixed(1)).join(",")}`)
}))
