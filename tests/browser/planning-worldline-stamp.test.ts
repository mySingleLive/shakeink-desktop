import assert from "node:assert/strict"
import { test } from "node:test"
import type { Browser, Page } from "playwright-core"
import { expect } from "@playwright/test"
import { launch, withWorldline, type WorldlineView } from "../helpers/worldline-browser-fixture"
import { f60 } from "../helpers/worldline-f60"

/* docs/585 TS-B1 … TS-B5: timeline card stamps one precision finer than the axis. Fixed calendar 24 h / 30 d / 12 m.
 * Every expected text below is worked out by hand from the fixture values (not by calling the page's code). */
let browser: Browser
test.before(async () => { browser = await launch() })
test.after(async () => { await browser?.close() })

const H = 1, D = 24, M = 30 * D, Y = 12 * M
const root = (page: Page) => page.locator("[data-timeline]")
const axis = (page: Page) => root(page).getAttribute("data-axis-precision")
const card = (page: Page, title: string) => page.locator(`[data-timeline-plane] [data-event-card][aria-label="${title}"]`)
// A stamp and its card share the .tcard wrapper ([data-event]); a clipped card has a clip note between them.
const stamp = (page: Page, title: string) => card(page, title).locator("xpath=ancestor::*[@data-event][1]/*[@data-stamp]")
const openTimeline = async (page: Page) => { await page.getByRole("tab", { name: "时间线" }).click(); await page.locator("[data-timeline-plane]").waitFor() }

type Ev = Record<string, unknown> & { title: string }
/** A small worldline of its own (one family per event) so a wheel zoom keeps the target card in view. */
function view(events: Ev[]): WorldlineView {
  const base = f60()
  const data = base.data as Record<string, unknown>
  return { ...base, data: { ...data, periods: [], events: events.map((e, i) => ({ id: `s${i + 1}`, line: "w", parent: null, category: "其他", importance: 1, people: [], fact: "", duration: 0, ...e })) } }
}
/** Wheel-zooms in on the card until the axis reads `want` (never past it). */
async function zoomTo(page: Page, title: string, want: string) {
  const order = ["year", "month", "day", "hour"]
  for (let k = 0; k < 120 && (await axis(page)) !== want; k++) {
    const now = order.indexOf((await axis(page))!)
    const b = (await card(page, title).locator("[data-card-title]").boundingBox())!
    await page.mouse.move(b.x + 20, b.y + b.height / 2)
    await page.mouse.wheel(0, now < order.indexOf(want) ? -120 : 120)
    await page.waitForTimeout(40)
  }
  assert.equal(await axis(page), want, `axis reaches ${want}`)
}

test("TS-B1: a month record reads 343年5月 on a year axis, 约343年5月1日 on month and day axes", () => withWorldline(browser, view([
  { title: "七王盟约签订", time: { kind: "exact", value: 342 * Y + 4 * M, precision: "month" } },
  { title: "远处的旧事", time: { kind: "exact", value: 330 * Y, precision: "year" } },
]), async page => {
  await openTimeline(page)
  await zoomTo(page, "七王盟约签订", "year")
  await expect(stamp(page, "七王盟约签订")).toHaveText("343年5月")
  await zoomTo(page, "七王盟约签订", "month")
  await expect(stamp(page, "七王盟约签订")).toHaveText("约343年5月1日")
  await zoomTo(page, "七王盟约签订", "day")
  await expect(stamp(page, "七王盟约签订")).toHaveText("约343年5月1日")
}))

test("TS-B2: on a day axis a day record at 0:00 reads the day; +15 h reads 约…下午; an hour record reads 09:00", () => withWorldline(browser, view([
  { title: "王立大学建校", time: { kind: "exact", value: 1178 * Y + 8 * M + 11 * D, precision: "day" } },
  { title: "午后钟声", time: { kind: "exact", value: 1178 * Y + 8 * M + 11 * D + 15 * H, precision: "day" } },
  { title: "清晨集会", time: { kind: "exact", value: 1178 * Y + 8 * M + 11 * D + 9 * H, precision: "hour" } },
]), async page => {
  await openTimeline(page)
  await zoomTo(page, "王立大学建校", "day")
  await expect(stamp(page, "王立大学建校")).toHaveText("1179年9月12日")
  await expect(stamp(page, "午后钟声")).toHaveText("约1179年9月12日下午")
  await expect(stamp(page, "清晨集会")).toHaveText("1179年9月12日 09:00")
}))

test("TS-B3: a family end takes 约 from the node that gives it; a tie with the parent takes none", () => withWorldline(browser, view([
  { title: "港口夜议", time: { kind: "exact", value: 1349 * Y + 5 * M + 11 * D, precision: "day" } },
  { title: "港口夜议·散会", parent: "s1", time: { kind: "exact", value: 1349 * Y + 5 * M + 11 * D + 6 * H, precision: "month" } },
  { title: "十日围城", duration: 10 * D, time: { kind: "exact", value: 1349 * Y + 7 * M, precision: "day" } },
  { title: "十日围城·收尾", parent: "s3", duration: 5 * D, time: { kind: "exact", value: 1349 * Y + 7 * M + 5 * D, precision: "month" } },
]), async page => {
  await openTimeline(page)
  const range = (t: string) => card(page, t).locator("xpath=ancestor::*[@data-event][1]/*[@data-family-range]")
  for (const want of ["year", "month", "day"] as const) {
    await zoomTo(page, "十日围城", want)
    // 1349Y+7M = 1350年8月1日; +10 天 = 1350年8月11日. The child ends with the parent: a tie, so no 约 at the end.
    await expect(range("十日围城")).toHaveText({ year: "1350年8月 → 1350年8月", month: "1350年8月1日 → 1350年8月11日", day: "1350年8月1日 → 1350年8月11日" }[want])
  }
  await zoomTo(page, "港口夜议", "month")
  // 1349Y+5M+11D = 1350年6月12日; the end comes from the month child 6 hours later.
  await expect(range("港口夜议")).toHaveText("1350年6月12日 → 约1350年6月12日")
  await zoomTo(page, "港口夜议", "day")
  await expect(range("港口夜议")).toHaveText("1350年6月12日 → 约1350年6月12日上午")
}))

test("TS-B4: a middle-button pan keeps the axis precision and every stamp", () => withWorldline(browser, f60(), async page => {
  await openTimeline(page)
  const read = () => page.locator("[data-timeline-plane] [data-stamp]").evaluateAll(xs => xs.map(x => `${x.closest("[data-event]")!.getAttribute("data-event")}=${x.textContent}`).sort())
  const a0 = await axis(page), s0 = await read()
  assert.ok(s0.length > 3)
  const l = (await page.locator("[data-timeline-lane]").boundingBox())!
  const x = l.x + l.width - 60, y = l.y + 40
  await page.mouse.move(x, y); await page.mouse.down({ button: "middle" })
  for (let k = 1; k <= 8; k++) await page.mouse.move(x - 10 * k, y + 4 * k)
  await page.mouse.up({ button: "middle" })
  assert.equal(await axis(page), a0)
  // Cards that scroll out of the rendered band drop out; every card rendered both times keeps its exact text.
  const after = new Map((await read()).map(s => s.split("=") as [string, string]))
  let same = 0
  for (const [title, text] of s0.map(s => s.split("=") as [string, string])) if (after.has(title)) { assert.equal(after.get(title), text, `stamp of ${title} after a pan`); same++ }
  assert.ok(same > 3, `${same} cards rendered before and after`)
}))

test("TS-B5: stamps stay inside their card, never overlap, and a clipped one shows its full text on hover and box-selects upward", () => withWorldline(browser, view([
  // A one-character title gives the 150 px minimum card; a window event far in the future reads
  // 约12345678901年12月30日下午 (wider than the 146 px the stamp gets), so its stamp is clipped.
  { title: "甲", time: { kind: "window", precision: "day", value: 12345678900 * Y + 11 * M + 29 * D + 15 * H, end: 12345678900 * Y + 11 * M + 29 * D + 16 * H } },
  { title: "乙", time: { kind: "exact", value: 12345678900 * Y + 11 * M + 29 * D + 20 * H, precision: "year" } },
  { title: "丙", time: { kind: "exact", value: 12345678900 * Y + 11 * M + 29 * D + 22 * H, precision: "day" } },
]), async page => {
  await openTimeline(page)
  await zoomTo(page, "甲", "day")
  const boxes = await page.locator("[data-timeline-plane] [data-stamp]").evaluateAll(xs => xs.map(x => {
    const r = x.getBoundingClientRect(), c = x.parentElement!.querySelector("[data-event-card]")!.getBoundingClientRect()
    return { id: x.closest("[data-event]")!.getAttribute("data-event"), l: r.left, r: r.right, t: r.top, b: r.bottom, cl: c.left, cr: c.right, title: x.getAttribute("title"), text: x.textContent, clipped: x.scrollWidth > x.clientWidth }
  }))
  for (const b of boxes) {
    assert.ok(b.r <= b.cr + 0.5 && b.l >= b.cl - 0.5, `stamp ${b.id} inside its card`)
    assert.equal(b.title, b.text, "title holds the full text")
  }
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const p = boxes[i], q = boxes[j]
    assert.ok(p.r <= q.l || q.r <= p.l || p.b <= q.t || q.b <= p.t, "stamps do not overlap")
  }
  const clipped = boxes.find(b => b.id === "s1")!
  assert.ok(clipped.clipped, "the narrow card's stamp is clipped")
  assert.equal(clipped.title, "约12345678901年12月30日下午")
  const s = stamp(page, "甲")
  const r = (await s.boundingBox())!
  const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest("[data-stamp]")?.getAttribute("title") ?? null, [r.x + r.width / 2, r.y + r.height / 2])
  assert.equal(hit, clipped.title, "the clipped stamp takes the pointer, so its full title shows on hover")
  const before = await page.evaluate(() => JSON.stringify((window as any).planningState().data.events.map((e: any) => e.time)))
  const posts0 = await page.evaluate(() => (window as any).posts.length)
  await page.mouse.move(r.x + 4, r.y + r.height / 2); await page.mouse.down()
  for (let k = 1; k <= 6; k++) await page.mouse.move(r.x + 4 + 12 * k, r.y + r.height / 2 - 8 * k)
  await expect(page.locator("[data-select-rect]")).toHaveCount(1)
  await page.mouse.up()
  assert.equal(await card(page, "甲").getAttribute("data-selected"), null, "a press on the stamp does not select its card")
  assert.equal(await page.evaluate(() => (window as any).posts.length), posts0, "no save")
  assert.equal(await page.evaluate(() => JSON.stringify((window as any).planningState().data.events.map((e: any) => e.time))), before, "no time change")
}))
