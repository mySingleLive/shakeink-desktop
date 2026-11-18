import assert from "node:assert/strict"
import { test } from "node:test"
import type { Browser, Page } from "playwright-core"
import { expect } from "@playwright/test"
import { civilDays } from "../../src/lib/planning/era-calendar"
import { launch, withWorldline, type WorldlineView } from "../helpers/worldline-browser-fixture"

/* docs/586 RL-B1 … RL-B5: event-table rail labels follow the zoom (time stretch). Synthetic data on an era calendar;
 * every expected text and count is worked out by hand in docs/586 (not by calling the page's code). */
let browser: Browser
test.before(async () => { browser = await launch() })
test.after(async () => { await browser?.close() })

const H = 24, FIFTH = civilDays(200001, 1, 1) * H
const D5 = (y: number, m: number, d: number) => FIFTH + civilDays(y, m, d) * H
const CALENDAR = { kind: "gregorian", epoch: "0001-01-01T00:00:00Z", hoursPerDay: 24, daysPerMonth: 30, monthsPerYear: 12, eras: [{ name: "第四纪", start: 0 }, { name: "第五纪", start: FIFTH }] }
/** D1 (precision year, 0:00) and D2 (precision day, 15:00): 30 roots 72 h apart from 第五纪1349-06-01. */
function view(precision: "year" | "day", hour: number): WorldlineView {
  const events = Array.from({ length: 30 }, (_, i) => ({
    id: `e${i}`, line: "w", parent: null, title: `事件${i}`, category: "其他", importance: 1, people: [], fact: "", duration: 0,
    time: { kind: "exact", value: D5(1349, 6, 1) + i * 72 + hour, precision },
  }))
  return {
    version: 1,
    data: { schemaVersion: 1, worlds: [{ id: "w", name: "主世界线", calendar: CALENDAR }], events, periods: [], lines: [], cards: [], volumes: [], chapters: [], connections: [] },
    characters: [], materials: [], readonly: false, history: [], proposals: [],
  }
}
const table = async (page: Page) => { await page.getByRole("tab", { name: "事件表" }).click(); await page.locator("[data-event-table]").waitFor() }
const level = (page: Page) => page.locator("[data-zoom-value]")
const zoomIn = (page: Page) => page.getByRole("button", { name: "放大" })
const zoomOut = (page: Page) => page.getByRole("button", { name: "缩小" })
const labels = (page: Page) => page.locator("[data-rail-label]").allInnerTexts()
const press = async (b: ReturnType<typeof zoomIn>, n: number) => { for (let i = 0; i < n; i++) await b.click() }
const cardTop = (page: Page, id: string) => page.locator(`[data-event-table] [data-event-card][data-event-id="${id}"]`).evaluate(e => e.getBoundingClientRect().top)

test("RL-B1: at reset the rail reads months with 约 for year records, three labels", () => withWorldline(browser, view("year", 0), async page => {
  await table(page)
  await expect(level(page)).toHaveText("月")
  await expect.poll(() => labels(page)).toEqual(["约1349年6月", "约1349年7月", "约1349年8月"])
  assert.ok(await page.locator("[data-rail-label]").evaluateAll(l => l.every(e => e.getAttribute("data-rail-level") === "month")))
}))

test("RL-B2: zooming in steps month → day → 上下午; spacing follows Δt × k", () => withWorldline(browser, view("year", 0), async page => {
  await table(page)
  await press(zoomIn(page), 1)
  await expect(level(page)).toHaveText("月")
  await press(zoomIn(page), 1)
  await expect(level(page)).toHaveText("日")
  await expect.poll(async () => (await labels(page)).slice(0, 3)).toEqual(["约6月1日", "约6月4日", "约6月7日"])
  const gap = (await cardTop(page, "e1")) - (await cardTop(page, "e0"))
  assert.ok(Math.abs(gap - 72 * (40 / 72) * 1.25 ** 2) <= 1, `card gap ${gap}`)
  await press(zoomIn(page), 2)
  await expect(level(page)).toHaveText("日")
  await press(zoomIn(page), 1)
  await expect(level(page)).toHaveText("上下午")
  await expect.poll(async () => (await labels(page))[0]).toBe("约6月1日")
}))

test("RL-B3: reset, zoom out to years (no labels, badge stays), back without drift, and the − button stops at the floor", () => withWorldline(browser, view("year", 0), async page => {
  await table(page)
  await press(zoomIn(page), 2)
  await page.getByRole("button", { name: "复位" }).click()
  await expect(level(page)).toHaveText("月")
  await expect.poll(() => labels(page)).toEqual(["约1349年6月", "约1349年7月", "约1349年8月"])
  await press(zoomOut(page), 14)
  await expect(level(page)).toHaveText("月")
  await press(zoomOut(page), 1)
  await expect(level(page)).toHaveText("年")
  await expect.poll(() => labels(page)).toEqual([])
  await expect(page.locator("[data-rail-badge='year']").filter({ hasText: "第五纪1349年" }).first()).toBeAttached()
  await press(zoomIn(page), 15)
  await expect(level(page)).toHaveText("月")
  await expect.poll(() => labels(page)).toEqual(["约1349年6月", "约1349年7月", "约1349年8月"])
  let n = 0
  while (await zoomOut(page).isEnabled() && n < 60) { await zoomOut(page).click(); n++ }
  assert.ok(n >= 30 && n <= 40, `presses to the floor: ${n}`)
  await expect(zoomOut(page)).toBeDisabled()
  await expect(level(page)).toHaveText("年")
}))

test("RL-B4: scrolling keeps every label text and level", () => withWorldline(browser, view("year", 0), async page => {
  await table(page)
  await press(zoomIn(page), 2)
  await expect(level(page)).toHaveText("日")
  const read = () => page.locator("[data-rail-label]").evaluateAll(l => l.map(e => `${e.getAttribute("data-label-for")}=${e.textContent}@${e.getAttribute("data-rail-level")}`))
  const before = await read()
  assert.ok(before.length > 0 && before.every(s => s.endsWith("@day")), JSON.stringify(before.slice(0, 3)))
  await page.locator("[data-table-scroller]").evaluate(e => { e.scrollTop = 1000 })
  await page.waitForTimeout(200)
  const after = new Map((await read()).map(s => [s.split("=")[0], s]))
  for (const s of before) if (after.has(s.split("=")[0])) assert.equal(after.get(s.split("=")[0]), s)
  assert.ok(after.size > 0)
}))

test("RL-B5: a narrow panel drops the month before 下午 and keeps every label inside the scroller", () => withWorldline(browser, view("day", 15), async page => {
  await table(page)
  await press(zoomIn(page), 2)
  await expect(level(page)).toHaveText("日")
  await expect.poll(async () => (await labels(page)).slice(0, 2)).toEqual(["6月1日", "6月4日"])
  await press(zoomIn(page), 3)
  await expect(level(page)).toHaveText("上下午")
  await expect.poll(async () => (await labels(page)).slice(0, 2)).toEqual(["约1日下午", "约4日下午"])
  const left = await page.locator("[data-table-scroller]").evaluate(e => e.getBoundingClientRect().left)
  const lefts = await page.locator("[data-rail-label]").evaluateAll(l => l.map(e => e.getBoundingClientRect().left))
  assert.ok(lefts.length > 0 && lefts.every(x => x >= left - 0.5), JSON.stringify({ left, lefts: lefts.slice(0, 5) }))
  assert.equal(await page.evaluate(() => [...document.querySelectorAll("[data-worldline-panel] *")].filter(e => getComputedStyle(e).textOverflow === "ellipsis").length), 0)
}, { width: 470 }))
