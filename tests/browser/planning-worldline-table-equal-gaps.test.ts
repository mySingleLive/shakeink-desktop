import assert from "node:assert/strict"
import { test } from "node:test"
import type { Browser, Page } from "playwright-core"
import { expect } from "@playwright/test"
import { launch, withWorldline } from "../helpers/worldline-browser-fixture"
import { f60 } from "../helpers/worldline-f60"
import { f885 } from "../helpers/worldline-f885"
import { zoomView } from "../helpers/worldline-zoom"

/* docs/601 EGB-*: the aligned (default) event table lays cards out with equal gaps, full-size cards at every level,
 * rail marks in widened gaps only, and no auto-open. In-memory fixture API, not a real-target proof. */
let browser: Browser
test.before(async () => { browser = await launch() })
test.after(async () => { await browser?.close() })

const Z = { zoomLevels: true } as const
const W = (view: Parameters<typeof withWorldline>[1], body: (page: Page) => Promise<void>, options: Parameters<typeof withWorldline>[3] = Z) =>
  withWorldline(browser, view, async page => { await page.evaluate("globalThis.__name = f => f"); await body(page) }, options)
const frames = (page: Page, n = 3) => page.evaluate(n => new Promise<void>(r => { const f = (k: number) => k ? requestAnimationFrame(() => f(k - 1)) : r(); f(n) }), n)
const level = async (page: Page) => Number(await page.locator("[data-event-table]").getAttribute("data-zoom-level"))
const mode = (page: Page, name: "对齐" | "等距") => page.locator("[data-rail-mode-toggle]").getByRole("button", { name, exact: true })
async function openTable(page: Page) {
  await page.getByRole("tab", { name: "事件表" }).click()
  await page.locator("[data-event-table]").waitFor()
  await frames(page)
}
async function step(page: Page, dir: 1 | -1) {
  const r = (await page.locator("[data-table-scroller]").boundingBox())!
  await page.mouse.move(r.x + r.width * 0.6, r.y + r.height / 3)
  await page.keyboard.down("Control"); await page.mouse.wheel(0, dir > 0 ? -100 : 100); await page.keyboard.up("Control")
  await frames(page, 2)
}
// docs/602: no idle decision any more; the wait covers measured heights of opened cards.
const settle = async (page: Page) => { await page.waitForTimeout(220); await frames(page, 3); await page.waitForTimeout(220); await frames(page, 2) }
/** In-view same-level neighbours (cards and points that share a parent box), DOM gaps bottom → top, in px. The
 * rail marks between two of them (a year badge or a break text) are returned with their gap. */
const neighbourGaps = (page: Page) => page.evaluate(() => {
  const sc = document.querySelector("[data-table-scroller]")!.getBoundingClientRect()
  const rows = [...document.querySelectorAll<HTMLElement>("[data-event-table] [data-event-card], [data-event-table] [data-event-point]")]
    .filter(e => !e.parentElement!.closest("[data-event-card]"))
    .map(e => {
      // A group box has no id: it is named by its head card (its first card). The head's block is the whole box.
      const group = e.closest("[data-event-group]")
      const headOf = (g: Element | null) => g?.querySelector<HTMLElement>("[data-event-card]")?.dataset.eventId ?? ""
      const head = !!group && headOf(group) === e.dataset.eventId
      const box = (head ? group! : e).getBoundingClientRect()
      const owner = head ? group!.parentElement!.closest("[data-event-group]") : group
      return { id: e.dataset.eventId!, owner: headOf(owner), top: box.top, bottom: box.bottom }
    })
    .filter(r => r.top >= sc.top && r.bottom <= sc.bottom)
  const marks = [...document.querySelectorAll<HTMLElement>("[data-rail-badge], [data-rail-break]")].map(e => e.getBoundingClientRect()).map(r => (r.top + r.bottom) / 2)
  const by = new Map<string, typeof rows>()
  for (const r of rows) (by.get(r.owner) ?? by.set(r.owner, []).get(r.owner)!).push(r)
  const out: { a: string; b: string; gap: number; marked: boolean }[] = []
  for (const list of by.values()) {
    list.sort((x, y) => x.top - y.top)
    for (let i = 1; i < list.length; i++) out.push({ a: list[i - 1].id, b: list[i].id, gap: list[i].top - list[i - 1].bottom, marked: marks.some(m => m > list[i - 1].top && m < list[i].bottom) })
  }
  return out
})
/** Rail texts in view (date labels, year badges, break texts) that overlap one another. */
const railOverlaps = (page: Page) => page.evaluate(() => {
  const sc = document.querySelector("[data-table-scroller]")!.getBoundingClientRect()
  const els = [...document.querySelectorAll<HTMLElement>("[data-rail-label], [data-rail-badge], [data-rail-break]")].filter(e => (e.textContent ?? "").trim())
  const boxes = els.map(e => {
    // A break is a full-width flex row: measure its text, not the row.
    const r = e.matches("[data-rail-break]") ? (() => { const g = document.createRange(); g.selectNodeContents(e); return g.getBoundingClientRect() })() : e.getBoundingClientRect()
    return { t: (e.textContent ?? "").trim(), r }
  }).filter(b => b.r.bottom > sc.top && b.r.top < sc.bottom && b.r.width > 0)
  const hits: string[] = []
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i].r, b = boxes[j].r
    if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) hits.push(`${boxes[i].t} × ${boxes[j].t}`)
  }
  return hits
})

test("EGB-01: aligned, same-level neighbours in view are 6px apart (±1) unless a rail mark sits between; still so after zooming in 6 steps and out to level 2", () => W(zoomView(24), async page => {
  await openTable(page)
  const check = async (tag: string) => {
    const g = await neighbourGaps(page)
    assert.ok(g.filter(x => !x.marked).length >= 4, `${tag}: too few neighbours ${JSON.stringify(g)}`)
    for (const x of g) if (!x.marked) assert.ok(Math.abs(x.gap - 6) <= 1, `${tag}: ${x.a} → ${x.b} gap ${x.gap}`)
      else assert.ok(x.gap <= 40, `${tag}: a mark gap is only as wide as its mark (${x.a} → ${x.b} ${x.gap})`)
  }
  await check("reset")
  for (let i = 0; i < 6; i++) await step(page, 1)
  await check("in")
  for (let i = 0; i < 60 && (await level(page)) < 2; i++) await step(page, -1)
  await check("level 2")
}))

test("EGB-02 (docs/602 S1): every zoom box is at the card scale; at level 3 (scale 1) a collapsed title has the same font size as with zoom levels off, and the card is 34 high", async () => {
  let zoomed = { font: "", h: 0 }
  await W(zoomView(24), async page => {
    await openTable(page)
    const title = () => page.locator('[data-event-table] [data-event-card]:not([data-stacked]) [data-lines="1"]').first()
    for (let i = 0; i < 60 && (await level(page)) < 3; i++) {
      await step(page, -1)
      const bad = await page.evaluate(() => { const t = document.querySelector<HTMLElement>("[data-event-table]")!; return [...t.querySelectorAll<HTMLElement>("[data-card-zoom]")].filter(b => b.dataset.cardZoom !== t.dataset.cardScale).length })
      assert.equal(bad, 0)
    }
    assert.equal(await page.locator("[data-event-table]").getAttribute("data-card-scale"), "1")
    zoomed = await title().evaluate(e => ({ font: getComputedStyle(e).fontSize, h: e.closest("[data-event-card]")!.getBoundingClientRect().height }))
  })
  assert.ok(Math.abs(zoomed.h - 34) <= 1, `card ${zoomed.h}`)
  // Baseline with zoom levels off (code review P3: not compared with itself).
  await W(zoomView(24), async page => {
    await openTable(page)
    assert.equal(await page.locator('[data-event-table] [data-event-card]:not([data-stacked]) [data-lines="1"]').first().evaluate(e => getComputedStyle(e).fontSize), zoomed.font)
  }, {})
})

test("EGB-03: F60 aligned: every 相隔 text shows, between its two cards; rail texts never overlap, at reset and at level 2", () => W(f60(), async page => {
  await openTable(page)
  const sc = page.locator("[data-table-scroller]")
  const scan = async (tag: string) => {
    const max = await sc.evaluate(e => e.scrollHeight - e.clientHeight)
    let breaks = 0
    for (let y = 0; y <= max; y += 300) {
      await sc.evaluate((e, y) => { e.scrollTop = y }, y); await frames(page, 2)
      assert.deepEqual(await railOverlaps(page), [], `${tag} at ${y}`)
      breaks = Math.max(breaks, await page.locator("[data-rail-break='gap']").count())
    }
    return breaks
  }
  const n = await scan("reset")
  assert.ok(n > 0)
  await expect(page.locator("[data-rail-break='gap']").first()).toContainText("相隔")
  // The text sits between the last card above and the first card below.
  const pos = await page.evaluate(() => {
    const b = document.querySelector("[data-rail-break='gap']")!.getBoundingClientRect(), mid = (b.top + b.bottom) / 2
    const cs = [...document.querySelectorAll<HTMLElement>("[data-event-table] [data-event-card]")].map(e => e.getBoundingClientRect())
    const above = cs.filter(c => c.bottom <= mid + 0.5).sort((x, y) => y.bottom - x.bottom)[0], below = cs.filter(c => c.top >= mid - 0.5).sort((x, y) => x.top - y.top)[0]
    return { mid, above: above?.bottom, below: below?.top }
  })
  assert.ok(pos.above !== undefined && pos.below !== undefined && pos.mid > pos.above && pos.mid < pos.below, JSON.stringify(pos))
  await sc.evaluate(e => { e.scrollTop = 0 })
  for (let i = 0; i < 60 && (await level(page)) < 2; i++) await step(page, -1)
  await scan("level 2")
}))

test("EGB-04 (docs/602 S5/S7): aligned opens every card at its zoom-in limit, one step past the size maximum; so does linear", () => W(zoomView(24, { leavesOnly: true }), async page => {
  await openTable(page)
  for (let i = 0; i < 60 && !(await page.getByRole("button", { name: "放大" }).isDisabled()); i++) await step(page, 1)
  await settle(page)
  await expect(page.locator("[data-event-table][data-auto-open]")).toHaveCount(1)
  await expect(page.locator('[data-event-table] [data-event-card][aria-expanded="false"]')).toHaveCount(0)
  await step(page, -1); await settle(page)
  await expect(page.locator("[data-event-table][data-auto-open]")).toHaveCount(0)
  await mode(page, "等距").click(); await settle(page)
  await step(page, 1); await settle(page)
  await expect(page.locator("[data-event-table][data-auto-open]")).toHaveCount(1)
}))

test("EGB-06: linear mode keeps the time stretch and the 46px break", () => W(zoomView(24, { leavesOnly: true, farRoot: true }), async page => {
  await openTable(page)
  await mode(page, "等距").click(); await frames(page)
  const spacing = () => page.evaluate(() => { const t = [...document.querySelectorAll<HTMLElement>("[data-event-table] [data-event-card]")].map(e => e.getBoundingClientRect().top).sort((a, b) => a - b); return t[2] - t[1] })
  const s0 = await spacing()
  for (let i = 0; i < 4; i++) await step(page, 1)
  assert.ok((await spacing()) > s0, "spacing grows with the zoom")
  assert.equal(await page.locator("[data-rail-break='gap']").evaluate(e => e.getBoundingClientRect().height), 46)
}))

test("EGB-07: aligned rail dots sit on card heads and point lines (±0.5px) at reset and at level 2", () => W(zoomView(24), async page => {
  await openTable(page)
  const worst = () => page.evaluate(() => {
    let w = 0, n = 0
    for (const d of document.querySelectorAll<HTMLElement>("[data-rail-dot]")) {
      const id = d.dataset.eventId!, el = document.querySelector<HTMLElement>(`[data-event-table] [data-event-card][data-event-id="${id}"] [data-event-head], [data-event-table] [data-event-card][data-event-id="${id}"] > div, [data-event-table] [data-event-point][data-event-id="${id}"]`)
      if (!el) continue
      const r = d.getBoundingClientRect(), e = el.getBoundingClientRect()
      // docs/602: a collapsed head is 32 / 36 px × its zoom box's scale.
      const z = Number(el.closest<HTMLElement>("[data-card-zoom]")?.dataset.cardZoom ?? 1)
      const head = el.matches("[data-event-point]") ? e.top + e.height / 2 : e.top + Math.min(e.height, (el.closest("[data-event-group]")?.querySelector("[data-event-card]") === el.closest("[data-event-card]") ? 36 : 32) * z) / 2
      w = Math.max(w, Math.abs(r.top + r.height / 2 - head)); n++
    }
    return { w, n }
  })
  const a = await worst()
  assert.ok(a.n > 5 && a.w <= 0.5, JSON.stringify(a))
  for (let i = 0; i < 60 && (await level(page)) < 2; i++) await step(page, -1)
  const b = await worst()
  assert.ok(b.n > 5 && b.w <= 0.5, JSON.stringify(b))
}))

test("EGB-08 (screenshot shape): a family, aligned, at reset and at the size maximum (one step before all open): children 6 apart, the first one 4 below the head", () => W(zoomView(24), async page => {
  await openTable(page)
  for (const zoomIn of [0, 1]) {
  // docs/602: + up to card scale 1.2, the last stop before all open.
  for (let i = 0; i < 20 && zoomIn && (await page.locator("[data-event-table]").getAttribute("data-card-scale")) !== "1.2"; i++) await step(page, 1)
  // The box headed by r2 (its head card sits in a zoom box with levels on, docs/602).
  const boxOf = `[data-event-group][data-parent-title="${await page.locator('[data-event-table] [data-event-card][data-event-id="r2"] [data-card-title]').first().innerText()}"]`
  await page.locator(boxOf).evaluate(e => e.scrollIntoView({ block: "center" })); await frames(page)
  const g = await page.locator(boxOf).evaluate(box => {
    const rows = [...box.children].filter(c => c.querySelector("[data-event-card],[data-event-point]")).map(c => c.getBoundingClientRect())
    return rows.slice(1).map((r, i) => r.top - rows[i].bottom)
  })
  assert.equal(g.length, 3, JSON.stringify(g))
  assert.ok(Math.abs(g[0] - 4) <= 1, `head → first child ${g[0]}`)
  for (const x of g.slice(1)) assert.ok(Math.abs(x - 6) <= 1, `+${zoomIn}: child gap ${x}`)
  }
}))

test("EGB-09 (F885): the aligned table at reset has no rail text overlap and no gap over 70px between cards in view", () => W(f885(), async page => {
  await openTable(page)
  const sc = page.locator("[data-table-scroller]")
  const max = await sc.evaluate(e => e.scrollHeight - e.clientHeight)
  for (const at of [0, 0.25, 0.5, 0.75]) {
    await sc.evaluate((e, y) => { e.scrollTop = y }, max * at); await frames(page, 3)
    assert.deepEqual(await railOverlaps(page), [], `at ${at}`)
    for (const x of await neighbourGaps(page)) assert.ok(x.gap <= 70, `at ${at}: ${x.a} → ${x.b} ${x.gap}`)
  }
}))

/* docs/601 code review P1-1: a wheel step that keeps the layout (aligned, same level) must leave no anchor behind. */
const firstInView = (page: Page) => page.evaluate(() => {
  const q = document.querySelector("[data-table-scroller]")!.getBoundingClientRect()
  // The app's anchor (EventTable firstVisible): the first card or point whose bottom is more than 8px into the view.
  return [...document.querySelectorAll<HTMLElement>("[data-event-table] [data-event-card], [data-event-table] [data-event-point]")].map(e => { const r = e.getBoundingClientRect(); return { id: e.dataset.eventId!, top: r.top, bottom: r.bottom } }).filter(c => c.bottom > q.top + 8).sort((a, b) => a.top - b.top)[0]
})
test("EGB-10: aligned, a wheel step within a level, a scroll, then expanding a card in view keeps the scroll", () => W(f60(), async page => {
  await openTable(page)
  const sc = page.locator("[data-table-scroller]")
  const l0 = await level(page)
  await step(page, 1); assert.equal(await level(page), l0)
  await page.waitForTimeout(500)
  await page.mouse.move(10, 10)
  await sc.evaluate(e => { e.scrollTop = 900 }); await frames(page, 3)
  const top = await sc.evaluate(e => e.scrollTop)
  // A card well inside the view (a click on a partly hidden one may scroll it in).
  const id = await page.evaluate(() => { const q = document.querySelector("[data-table-scroller]")!.getBoundingClientRect(); return [...document.querySelectorAll<HTMLElement>("[data-event-table] [data-event-card]:not([data-stacked])")].find(e => { const r = e.getBoundingClientRect(); return r.top > q.top + 120 && r.bottom < q.bottom - 120 && !e.closest("[data-event-group]") })!.dataset.eventId! })
  await page.locator(`[data-event-table] [data-event-card][data-event-id="${id}"] > div`).first().click()
  await page.waitForTimeout(500); await frames(page, 3)
  assert.ok(Math.abs((await sc.evaluate(e => e.scrollTop)) - top) <= 2, `scroll ${top} → ${await sc.evaluate(e => e.scrollTop)}`)
}))
test("EGB-11: aligned, a wheel step within a level, a scroll, then a mode switch keeps the first card in view", () => W(f60(), async page => {
  await openTable(page)
  const sc = page.locator("[data-table-scroller]")
  const l0 = await level(page)
  await step(page, 1); assert.equal(await level(page), l0)
  await page.waitForTimeout(500)
  await sc.evaluate(e => { e.scrollTop = 900 }); await frames(page, 3)
  const a = await firstInView(page)
  await mode(page, "等距").click(); await page.waitForTimeout(300); await frames(page, 3)
  const b = await page.locator(`[data-event-table] :is([data-event-card], [data-event-point])[data-event-id="${a.id}"]`).first().boundingBox()
  assert.ok(b && Math.abs(b.y - a.top) <= 1, `${a.id} ${a.top} → ${b?.y}`)
}))
