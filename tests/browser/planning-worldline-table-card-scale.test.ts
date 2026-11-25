import assert from "node:assert/strict"
import { test } from "node:test"
import type { Browser, Page } from "playwright-core"
import { expect } from "@playwright/test"
import { launch, withWorldline } from "../helpers/worldline-browser-fixture"
import { f885 } from "../helpers/worldline-f885"
import { zoomView } from "../helpers/worldline-zoom"
import * as L from "../../src/lib/planning/worldline-layout"

/* docs/602 TSB-*: event-table zoom stops: collapsed cards scale 1–1.2, every step changes something, both ends stop,
 * all cards open past the size maximum. In-memory fixture API, not a real-target proof. */
let browser: Browser
test.before(async () => { browser = await launch() })
test.after(async () => { await browser?.close() })

const Z = { zoomLevels: true } as const
const W = (view: Parameters<typeof withWorldline>[1], body: (page: Page) => Promise<void>, options: Parameters<typeof withWorldline>[3] = Z) =>
  withWorldline(browser, view, async page => { await page.evaluate("globalThis.__name = f => f"); await body(page) }, options)
const frames = (page: Page, n = 3) => page.evaluate(n => new Promise<void>(r => { const f = (k: number) => k ? requestAnimationFrame(() => f(k - 1)) : r(); f(n) }), n)
const table = (page: Page) => page.locator("[data-event-table]")
const attr = async (page: Page, name: string) => table(page).getAttribute(name)
const scale = async (page: Page) => Number(await attr(page, "data-card-scale"))
const level = async (page: Page) => Number(await attr(page, "data-zoom-level"))
const allOpen = async (page: Page) => (await attr(page, "data-auto-open")) !== null
const tcard = (page: Page, id: string) => page.locator(`[data-event-table] [data-event-card][data-event-id="${id}"]`)
const posts = (page: Page) => page.evaluate(() => (globalThis as any).posts.length as number)
const zoomIn = (page: Page) => page.getByRole("button", { name: "放大" })
const zoomOut = (page: Page) => page.getByRole("button", { name: "缩小" })
const mode = (page: Page, name: "对齐" | "等距") => page.locator("[data-rail-mode-toggle]").getByRole("button", { name, exact: true })
async function openTable(page: Page) {
  await page.getByRole("tab", { name: "事件表" }).click()
  await table(page).waitFor()
  await frames(page)
}
/** One Ctrl + wheel step over the table; `y` is the pointer in the scroller (default 1/3). */
async function step(page: Page, dir: 1 | -1, y?: number) {
  const r = (await page.locator("[data-table-scroller]").boundingBox())!
  await page.mouse.move(r.x + r.width * 0.6, r.y + (y ?? r.height / 3))
  await page.keyboard.down("Control"); await page.mouse.wheel(0, dir > 0 ? -100 : 100); await page.keyboard.up("Control")
  await frames(page, 2)
}
/** Everything a step can change on screen (the % readout excluded). */
const look = (page: Page) => page.evaluate(() => {
  const t = document.querySelector<HTMLElement>("[data-event-table]")!
  const cards = [...t.querySelectorAll<HTMLElement>("[data-event-card]")]
  return JSON.stringify({
    scale: t.dataset.cardScale, level: t.dataset.zoomLevel, open: t.hasAttribute("data-auto-open"),
    cards: cards.length, points: t.querySelectorAll("[data-event-point]").length, stacked: t.querySelectorAll("[data-event-card][data-stacked]").length,
    expanded: cards.filter(c => c.getAttribute("aria-expanded") === "true").length,
    // Linear mode: root head positions (the stretch), rounded to 0.5px.
    tops: cards.slice(0, 40).map(c => Math.round(c.getBoundingClientRect().top * 2)),
    // Linear mode: the rail date labels follow the zoom (railLevel).
    labels: [...t.querySelectorAll("[data-rail-label]")].slice(0, 12).map(l => l.textContent),
  })
})
const readout = (page: Page) => page.locator("[data-zoom-value]").innerText()
/** Steps in one direction until the button disables; asserts each step changes the look. Returns the looks. */
async function walk(page: Page, dir: 1 | -1, max = 120) {
  const out = [await look(page)]
  const btn = dir > 0 ? zoomIn(page) : zoomOut(page)
  for (let i = 0; i < max && !(await btn.isDisabled()); i++) {
    await step(page, dir)
    const l = await look(page)
    assert.notEqual(l, out.at(-1), `step ${i + 1} (${dir > 0 ? "in" : "out"}) changes nothing on screen`)
    out.push(l)
  }
  await expect(btn).toBeDisabled()
  return out
}
/** Ten more steps past a bound change nothing, not even the readout; the first step back changes the look. */
async function bound(page: Page, dir: 1 | -1) {
  const l0 = await look(page), r0 = await readout(page)
  for (let i = 0; i < 10; i++) await step(page, dir)
  assert.equal(await look(page), l0, "past the bound nothing changes")
  assert.equal(await readout(page), r0, "the readout does not move either")
  await step(page, dir > 0 ? -1 : 1)
  assert.notEqual(await look(page), l0, "the first step back changes at once")
}
/** EventTable firstVisible: the first card or point whose bottom is more than 8px into the scroller; y = its rail dot
 * (the head line the view anchor keeps). */
const firstInView = (page: Page) => page.evaluate(() => {
  const s = document.querySelector("[data-table-scroller]")!.getBoundingClientRect()
  const c = [...document.querySelectorAll<HTMLElement>("[data-event-table] [data-event-card], [data-event-table] [data-event-point]")]
    .filter(e => !e.parentElement!.closest("[data-event-card]"))
    .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
    .find(e => e.getBoundingClientRect().bottom > s.top + 8)!
  return c.dataset.eventId!
})
const dotOf = async (page: Page, id: string) => { const b = (await page.locator(`[data-event-table] [data-rail-dot][data-ids~="${id}"]`).boundingBox())!; return b.y + b.height / 2 }
/** Waits for measured heights of opened cards (ResizeObserver → one frame). */
const settle = async (page: Page) => { await page.waitForTimeout(120); await frames(page, 4) }

test("TSB-01: at the reset collapsed cards are 1.1×: zoom box, 37.4px single line, unchanged computed font, width = layout × 1.1", () => W(zoomView(24), async page => {
  await openTable(page)
  assert.equal(await scale(page), 1.1)
  const m = await page.evaluate(() => {
    const c = [...document.querySelectorAll<HTMLElement>('[data-event-table] [data-event-card]:not([data-stacked])')].find(e => e.querySelector('[data-lines="1"]') && e.getAttribute("aria-expanded") !== "true" && e.closest("[data-event-group]")?.querySelector("[data-event-card]") !== e)!
    const box = c.closest<HTMLElement>("[data-card-zoom]")!
    return { zoom: Number(box.dataset.cardZoom), css: getComputedStyle(box).zoom, h: c.getBoundingClientRect().height, font: getComputedStyle(c.querySelector('[data-lines="1"]')!).fontSize, w: c.getBoundingClientRect().width, boxW: parseFloat(box.style.width) }
  })
  assert.equal(m.zoom, 1.1); assert.equal(Number(m.css), 1.1)
  assert.ok(Math.abs(m.h - 34 * 1.1) <= 1, `height ${m.h}`)
  assert.equal(m.font, "13px")
  assert.ok(Math.abs(m.w - m.boxW * 1.1) <= 1, `width ${m.w} vs ${m.boxW} × 1.1`)
}))

test("TSB-02: aligned: every step up changes the look; the last one opens all cards; the top stops; one step back closes", () => W(zoomView(24), async page => {
  await openTable(page)
  const looks = await walk(page, 1)
  assert.ok(looks.length >= 4)
  assert.equal(await allOpen(page), true)
  assert.equal(JSON.parse(looks.at(-2)!).open, false, "all-open is the last stop")
  assert.equal(await scale(page), 1.2)
  await bound(page, 1)
  assert.equal(await allOpen(page), false)
  assert.equal(await scale(page), 1.2)
  assert.equal(await posts(page), 0)
}))

test("TSB-03: aligned: every step down changes the look; at scale 1 each step changes the level; the floor stops", () => W(zoomView(24), async page => {
  await openTable(page)
  const looks = (await walk(page, -1)).map(l => JSON.parse(l))
  const at1 = looks.filter(l => l.scale === "1")
  // zoomView(24) has parents and every importance: each level 2 → 6 shows something new, so stops go one level at a
  // time (a skip past a level would miss a change, test review P2-2).
  // The first scale-1 stop is the scale step itself (level 2 still); then one level per stop.
  assert.deepEqual(at1.map(l => Number(l.level)), [2, 3, 4, 5, 6], `levels at scale 1: ${at1.map(l => l.level)}`)
  assert.equal(await level(page), 6)
  await bound(page, -1)
}))

for (const long of [false, true])
  test(`TSB-04${long ? "b (300-character facts, open cards taller than the stretch)" : ""}: linear: all open is not the top; later steps change only the spacing; the top stops`, () => W(zoomView(24, { leavesOnly: true, ...(long ? { fact: Object.fromEntries(Array.from({ length: 24 }, (_, i) => [i, "事".repeat(300)])) } : {}) }), async page => {
  await openTable(page)
  await mode(page, "等距").click(); await frames(page)
  const looks = (await walk(page, 1)).map(l => JSON.parse(l))
  const open = looks.filter(l => l.open)
  assert.ok(open.length >= 2, `${open.length} stops while all open`)
  // Levels 1 and 0 look the same (no points, no folding); the cards stay 1.2× and all open.
  assert.ok(open.every(l => l.scale === "1.2" && Number(l.level) <= 1 && l.expanded === l.cards), "after all open the cards stay as they are")
  assert.ok(open.slice(1).some((l, i) => JSON.stringify(l.tops) !== JSON.stringify(open[i].tops)), "the spacing still grows after all open")
  await bound(page, 1)
}))

/** Titles of collapsed single-line cards at their own width (narrower than the slot) and whether each is cut. */
const titleFit = (page: Page) => page.evaluate(() => {
  const out: Record<string, boolean> = {}
  for (const t of document.querySelectorAll<HTMLElement>('[data-event-table] [data-event-card]:not([aria-expanded="true"]):not([data-stacked]) [data-card-title][data-lines="1"]')) {
    const c = t.closest<HTMLElement>("[data-event-card]")!, box = c.closest<HTMLElement>("[data-card-zoom]")
    if (box && c.getBoundingClientRect().width >= box.parentElement!.getBoundingClientRect().width - 1) continue
    if (c.closest("[data-event-group]")?.querySelector("[data-event-card]") === c) continue
    out[c.dataset.eventId!] = t.hasAttribute("data-fade") || t.scrollWidth > t.clientWidth + 1
  }
  return out
})
/** zoomView(24) with titles between 220px and the slot: 12–20 CJK characters, so the width estimate decides. */
const midTitles = () => { const v = zoomView(24) as any; v.data.events.forEach((e: any, i: number) => { if (!e.parent) e.title = `${"测".repeat(12 + (i % 9))}${i}` }); return v }

test("TSB-05: titles uncut at scale 1 stay uncut at 1.1 and 1.2 (width estimate, test review P1-3); group heads fill their box; stacks match the box", () => W(midTitles(), async page => {
  await openTable(page)
  for (let i = 0; i < 12 && (await scale(page)) > 1; i++) await step(page, -1)
  assert.equal(await scale(page), 1); await frames(page, 3)
  // Level 3 here (cards fold): compare the same ids at each scale, wherever they are cards with one line.
  const base = await titleFit(page)
  for (let i = 0; i < 20 && (await scale(page)) < 1.2; i++) {
    await step(page, 1); await frames(page, 3)
    const now = await titleFit(page), s0 = await scale(page)
    const bad = Object.entries(now).filter(([id, cut]) => cut && base[id] === false)
    assert.deepEqual(bad, [], `cut at ${s0} but not at 1`)
  }
  assert.equal(await scale(page), 1.2)
  assert.ok(Object.values(await titleFit(page)).length >= 6, "enough titles at their own width")
  await page.locator('[data-event-table] [data-event-card][data-event-id="r8"] [data-fold]').first().click(); await frames(page)
  const heads = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-event-table] [data-event-group]")].map(g => { const h = g.querySelector<HTMLElement>("[data-event-card]")!; return Math.abs(h.getBoundingClientRect().width - g.getBoundingClientRect().width) }))
  assert.ok(heads.length > 0 && heads.every(d => d <= 1), `group heads ${heads}`)
  const st = tcard(page, "r8")
  await expect(st).toHaveAttribute("data-stacked", "")
  const sb = (await st.boundingBox())!, wb = (await st.locator("xpath=ancestor::*[@data-card-zoom][1]").boundingBox())!
  assert.ok(Math.abs(sb.width - wb.width) <= 1, `stack ${sb.width} vs box ${wb.width}`)
}))
test("TSB-06: aligned rail dots sit on card head lines (±0.5px) at scale 1, 1.1, 1.2 and all open", () => W(zoomView(24), async page => {
  await openTable(page)
  const check = async (tag: string) => {
    await settle(page)
    const bad = await page.evaluate(() => {
      const out: string[] = []
      const sc = document.querySelector("[data-table-scroller]")!.getBoundingClientRect()
      for (const d of document.querySelectorAll<HTMLElement>("[data-event-table] [data-rail-dot]:not([data-cluster])")) {
        const id = d.dataset.eventId!, c = document.querySelector<HTMLElement>(`[data-event-table] [data-event-card][data-event-id="${id}"], [data-event-table] [data-event-point][data-event-id="${id}"]`)
        if (!c) continue
        const r = d.getBoundingClientRect(), dot = r.top + r.height / 2
        if (dot < sc.top || dot > sc.bottom) continue
        // The head line: a point's middle; an open card's head row middle (RM-B2); a collapsed card's first title line
        // (18px × the card zoom).
        const z = Number(c.closest<HTMLElement>("[data-card-zoom]")?.dataset.cardZoom ?? 1)
        const row = (c.getAttribute("aria-expanded") === "true" ? c.firstElementChild! : c.querySelector("[data-card-title]") ?? c).getBoundingClientRect()
        const head = c.matches("[data-event-point]") || c.getAttribute("aria-expanded") === "true" ? row.top + row.height / 2 : row.top + 9 * z
        if (Math.abs(dot - head) > 0.5) out.push(`${id} ${dot.toFixed(2)} vs ${head.toFixed(2)}`)
      }
      return out
    })
    assert.deepEqual(bad, [], tag)
  }
  await check("1.1")
  for (let i = 0; i < 6; i++) await step(page, 1)
  assert.equal(await scale(page), 1.2); await check("1.2")
  await step(page, 1); assert.equal(await allOpen(page), true); await check("all open")
  for (let i = 0; i < 13 && (await scale(page)) > 1; i++) await step(page, -1)
  assert.equal(await scale(page), 1); await check("1.0")
}))

test("TSB-07: all open: every placed card open (group heads too), pending closed, a user-folded parent opens without its children; openCards untouched", () => W(zoomView(24, { pending: 2 }), async page => {
  await openTable(page)
  await page.locator('[data-event-table] [data-event-card][data-event-id="r8"] [data-fold]').first().click(); await frames(page)
  for (let i = 0; i < 30 && !(await zoomIn(page).isDisabled()); i++) await step(page, 1)
  assert.equal(await allOpen(page), true)
  await settle(page)
  const r = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-event-table] [data-event-card]")].map(c => [c.dataset.eventId!, c.getAttribute("aria-expanded")]))
  for (const [id, x] of r) assert.equal(x, id!.startsWith("u") ? "false" : "true", id!)
  await expect(tcard(page, "r2")).toHaveAttribute("aria-expanded", "true")
  await expect(tcard(page, "r8")).toHaveAttribute("aria-expanded", "true")
  await expect(page.locator('[data-event-table] [data-event-id^="r8c"]')).toHaveCount(0)
  await page.getByRole("tab", { name: "时间线" }).click(); await frames(page)
  await expect(page.locator('[data-event-card][aria-expanded="true"]')).toHaveCount(0)
  assert.equal(await posts(page), 0)
}))

test("TSB-08: all open: a click closes a card after 260 ms; a double click edits; leaving and coming back reopens it", () => W(zoomView(24, { leavesOnly: true }), async page => {
  await openTable(page)
  for (let i = 0; i < 30 && !(await zoomIn(page).isDisabled()); i++) await step(page, 1)
  await settle(page)
  const c = tcard(page, "r1"); await c.scrollIntoViewIfNeeded(); await settle(page)
  await expect(c).toHaveAttribute("aria-expanded", "true")
  const hb = (await c.locator("[data-card-title]").boundingBox())!
  await page.mouse.click(hb.x + 10, hb.y + hb.height / 2)
  await page.waitForTimeout(150)
  await expect(c).toHaveAttribute("aria-expanded", "true")
  await expect.poll(() => c.getAttribute("aria-expanded"), { timeout: 2000 }).toBe("false")
  await expect(c).toHaveAttribute("data-selected", "")
  const e = tcard(page, "r2"); await e.scrollIntoViewIfNeeded(); await settle(page)
  await e.locator("[data-card-title]").dblclick()
  await expect(e).toHaveAttribute("data-editing", "")
  await e.getByRole("button", { name: "取消", exact: true }).click(); await page.waitForTimeout(400)
  await expect(e).toHaveAttribute("aria-expanded", "true")
  await step(page, -1); await frames(page)
  assert.equal(await allOpen(page), false)
  await step(page, 1); await settle(page)
  await expect(tcard(page, "r1")).toHaveAttribute("aria-expanded", "true")
  assert.equal(await posts(page), 0)
}))

test("TSB-09: the card under the pointer stays put across a scale step and the all-open step; the toolbar keeps the first card in view", () => W(zoomView(24, { leavesOnly: true }), async page => {
  await openTable(page)
  const sc = page.locator("[data-table-scroller]")
  await sc.evaluate(e => { e.scrollTop = 200 }); await frames(page)
  const sb = (await sc.boundingBox())!
  const pick = await page.evaluate(() => {
    const s = document.querySelector("[data-table-scroller]")!.getBoundingClientRect()
    const c = [...document.querySelectorAll<HTMLElement>("[data-event-table] [data-event-card]")].find(e => e.getBoundingClientRect().top > s.top + s.height / 3)!
    return c.dataset.eventId!
  })
  // The pointer on the card's head line (its rail dot): the anchor is that card itself (docs/600 §9.5, f = 1).
  const dotY = async () => { const b = (await page.locator(`[data-event-table] [data-rail-dot][data-ids~="${pick}"]`).boundingBox())!; return b.y + b.height / 2 }
  const y0 = await dotY()
  const py = y0 - sb.y
  for (let i = 0; i < 6; i++) await step(page, 1, py)
  await settle(page)
  assert.ok(Math.abs((await dotY()) - y0) <= 1, `scale steps keep the card head under the pointer (${(await dotY()) - y0})`)
  await step(page, 1, py); assert.equal(await allOpen(page), true); await settle(page)
  assert.ok(Math.abs((await dotY()) - y0) <= 1, `the all-open step keeps it (${(await dotY()) - y0})`)
  await step(page, -1, py); await settle(page)
  const first = await firstInView(page), fy = await dotOf(page, first)
  await zoomIn(page).click(); await settle(page)
  assert.equal(await allOpen(page), true)
  assert.ok(Math.abs((await dotOf(page, first)) - fy) <= 1, `the toolbar + into all open keeps the first card (${first}: ${(await dotOf(page, first)) - fy})`)
  // Across a size step: toolbar −, then 复位 (test review P2-6).
  for (const act of ["−", "复位"] as const) {
    await zoomOut(page).click(); await settle(page)
    const id = await firstInView(page), y = await dotOf(page, id), s0 = await scale(page)
    await (act === "−" ? zoomOut(page) : page.getByRole("button", { name: "复位" })).click(); await settle(page)
    assert.notEqual(await scale(page), s0, `${act} changes the scale`)
    assert.ok(Math.abs((await dotOf(page, id)) - y) <= 1, `${act} keeps the first card (${id}: ${(await dotOf(page, id)) - y})`)
  }
  await zoomIn(page).click(); await settle(page)
  for (let i = 0; i < 10 && !(await allOpen(page)); i++) { await zoomIn(page).click(); await settle(page) }

}))

test("TSB-10: a zoom-out step at scale 1 goes straight to the next level change, the readout moving many steps at once", () => W(zoomView(24), async page => {
  await openTable(page)
  for (let i = 0; i < 40 && (await level(page)) < 3; i++) await step(page, -1)
  assert.equal(await level(page), 3); assert.equal(await scale(page), 1)
  const r0 = parseInt(await readout(page))
  await step(page, -1)
  assert.equal(await level(page), 4)
  const r1 = parseInt(await readout(page))
  // One wheel step is ×1/1.15; more than two steps' worth means skipped steps.
  assert.ok(r1 < r0 / 1.15 / 1.15, `${r0}% → ${r1}%`)
}))

test("TSB-11: after a step that changes the scale, opening a card in view keeps the scroll", () => W(zoomView(24, { leavesOnly: true }), async page => {
  await openTable(page)
  const sc = page.locator("[data-table-scroller]")
  await zoomIn(page).click(); await settle(page)
  await sc.evaluate(e => { e.scrollTop = 300 }); await frames(page)
  const top = await sc.evaluate(e => e.scrollTop)
  const id = await page.evaluate(() => { const s = document.querySelector("[data-table-scroller]")!.getBoundingClientRect(); return [...document.querySelectorAll<HTMLElement>("[data-event-table] [data-event-card]")].find(e => e.getBoundingClientRect().top > s.top + 100)!.dataset.eventId! })
  await tcard(page, id).locator("[data-card-title]").click(); await page.waitForTimeout(400); await settle(page)
  assert.ok(Math.abs((await sc.evaluate(e => e.scrollTop)) - top) <= 1, "the scroll stays")
}))

test("TSB-12: levels off (fixture default): no card scale, no zoom box, no all-open; steps are plain clamped steps", () => W(zoomView(24), async page => {
  await openTable(page)
  assert.equal(await attr(page, "data-card-scale"), null)
  await expect(page.locator("[data-event-table] [data-card-zoom]")).toHaveCount(0)
  // Levels off: plain clamped steps, as docs/601 — ceil(ln(max / fit) / ln 1.15) to the top (test review P2-4).
  const v = zoomView(24) as any, tree = L.eventTree(v.data.events, v.data), ad = L.adapterFor(v.data, "w", null as any)
  const b = L.tableZoomBounds(tree, ad), want = Math.ceil(Math.log(b.max / b.fit) / L.TABLE_WHEEL_STEP - 1e-9)
  let n = 0
  for (; n < 80 && !(await zoomIn(page).isDisabled()); n++) await step(page, 1)
  assert.equal(n, want, `${n} steps to the top`)
  assert.equal(await attr(page, "data-auto-open"), null)
  await expect(page.locator('[data-event-table] [data-event-card][aria-expanded="true"]')).toHaveCount(0)
}, {}))

test("TSB-13 (P2-1): the zoom level keeps its hysteresis from the level drawn under a legend filter", () => W(zoomView(24), async page => {
  await openTable(page)
  // At the reset d = 40 (level 1, entered from above). Hiding 重要 makes the median gap larger: level 2 is drawn. Showing
  // them again puts d back at 40, inside the 40–46 band: hysteresis from the drawn level 2 keeps 2, while a level kept
  // only from the last zoom step (1) would draw 1 (test review P1-2).
  const d0 = Number(await attr(page, "data-crowding")), l0 = await level(page)
  assert.equal(l0, 1)
  const legend = page.locator('[data-legend-importance="2"]')
  await legend.click(); await frames(page)
  assert.equal(await level(page), 2, "level 2 under the filter")
  await legend.click(); await frames(page)
  assert.equal(Number(await attr(page, "data-crowding")), d0)
  const want = L.zoomLevel(d0, 2)
  assert.equal(want, 2); assert.notEqual(want, L.zoomLevel(d0, l0 as L.ZoomLevel), "the scene tells the two rules apart")
  assert.equal(await level(page), want)
}))
test("TSB-14: linear past all open, then aligned: + is greyed, the readout stays, the first − closes; the first card in view stays", () => W(zoomView(24, { leavesOnly: true }), async page => {
  await openTable(page)
  await mode(page, "等距").click(); await frames(page)
  for (let i = 0; i < 80 && !(await zoomIn(page).isDisabled()); i++) await step(page, 1)
  await settle(page)
  // At the linear top the gaps pass the viewport: bring r12's head to the upper third, so the first card is in view.
  await page.locator("[data-table-scroller]").evaluate(e => {
    const c = document.querySelector<HTMLElement>('[data-event-table] [data-event-card][data-event-id="r12"]')!
    e.scrollTop += c.getBoundingClientRect().top - e.getBoundingClientRect().top - e.clientHeight / 3
  }); await settle(page)
  const first = await firstInView(page), fy = await dotOf(page, first)
  assert.equal(first, "r12")
  await mode(page, "对齐").click(); await settle(page)
  await expect(zoomIn(page)).toBeDisabled()
  assert.match(await readout(page), /^\d+%$/, "aligned reads %")
  assert.ok(Math.abs((await dotOf(page, first)) - fy) <= 1, `the first card in view stays (${first}: ${(await dotOf(page, first)) - fy})`)
  await zoomOut(page).click(); await frames(page)
  assert.equal(await allOpen(page), false)
}))

for (const counting of [false, true])
  test(`TSB-15${counting ? "b (F885, profiling): PlanningWorkspace renders once per step" : " (F885, production bundle): a step commits in under 100 ms at p95; the all-open step under 400 ms"}`, () => W(f885(), async page => {
  await openTable(page)
  { const r = (await page.locator("[data-table-scroller]").boundingBox())!; await page.mouse.move(r.x + r.width * 0.6, r.y + r.height / 3); await page.waitForTimeout(600) }
  // The event tree's current row is set by the first scroll (onScrollTop): scroll once before counting renders.
  await page.locator("[data-table-scroller]").evaluate(e => { e.scrollTop = 1 }); await frames(page, 2)
  const timed = async (dir: 1 | -1) => {
    const r = (await page.locator("[data-table-scroller]").boundingBox())!
    await page.mouse.move(r.x + r.width * 0.6, r.y + r.height / 3)
    const took = page.evaluate(() => new Promise<number>(res => {
      window.addEventListener("wheel", e => { const t0 = e.timeStamp; requestAnimationFrame(() => setTimeout(() => res(performance.now() - t0), 0)) }, { once: true, capture: true })
    }))
    const before = await page.evaluate(() => (globalThis as any).renders?.PlanningWorkspace ?? 0), row0 = await firstInView(page)
    await page.keyboard.down("Control"); await page.mouse.wheel(0, dir > 0 ? -100 : 100); await page.keyboard.up("Control")
    const ms = await took
    await frames(page, 2)
    const after = await page.evaluate(() => (globalThis as any).renders?.PlanningWorkspace ?? 0)
    // One render for the step; a second only when the cards' new size moved another row to the top of the view (the
    // event tree's current row, onScrollTop).
    const extra = (await firstInView(page)) !== row0 ? 1 : 0
    if (counting) assert.ok(after - before <= 1 + extra, `PlanningWorkspace renders ${after - before} (row changed: ${!!extra})`)
    return ms
  }
  const t: number[] = []
  let openMs = -1
  for (let i = 0; i < 40 && !(await zoomIn(page).isDisabled()); i++) {
    const wasOpen = await allOpen(page), ms = await timed(1)
    if (!wasOpen && (await allOpen(page))) openMs = ms; else t.push(ms)
  }
  for (let i = 0; i < 20; i++) t.push(await timed(-1))
  if (counting) return
  t.sort((a, b) => a - b)
  const p95 = t[Math.floor(t.length * 0.95)]
  assert.ok(p95 < 100, `p95 ${p95.toFixed(1)} ms`)
  assert.ok(openMs >= 0 && openMs < 400, `all-open step ${openMs.toFixed(1)} ms`)
}, { ...Z, profiling: counting }))

test("TSB-16 (P2-5): a dense work opens at its zoom limit with no points left, even below level 1", () => W((() => {
  const v = zoomView(24) as any
  // Roots 0.75 h apart: the zoom limit (60 px per hour) is d = 45 < 46, still level 2, so all-open comes at the limit
  // (eOpen = hi, plan §9.3) and the 一般 time points must open as cards.
  v.data.events = v.data.events.filter((e: any) => !e.parent).map((e: any, i: number) => ({ ...e, duration: 0, time: { kind: "exact", value: 1000 * 8640 + i * 0.75, precision: "hour" } }))
  return v
})(), async page => {
  await openTable(page)
  // The reset (d 40) is entered from above as level 1; zoom out to level 2 first, then the way up keeps 2 below 46.
  for (let i = 0; i < 10 && (await level(page)) < 2; i++) await step(page, -1)
  assert.equal(await level(page), 2)
  for (let i = 0; i < 40 && !(await zoomIn(page).isDisabled()); i++) await step(page, 1)
  await settle(page)
  assert.equal(await allOpen(page), true)
  assert.equal(await level(page), 2, "still level 2 at the limit")
  await expect(page.locator("[data-event-table] [data-event-point]")).toHaveCount(0)
  await expect(page.locator('[data-event-table] [data-event-card][aria-expanded="false"]')).toHaveCount(0)
}))

test("TSB-17 (G5): crossing scale 1 does not remount a collapsed card", () => W(zoomView(24, { leavesOnly: true }), async page => {
  await openTable(page)
  for (let i = 0; i < 12 && (await scale(page)) > 1.02; i++) await step(page, -1)
  const id = await firstInView(page)
  await page.evaluate(id => { (globalThis as any).__card = document.querySelector(`[data-event-table] [data-event-card][data-event-id="${id}"]`) }, id)
  await step(page, -1); assert.equal(await scale(page), 1)
  assert.equal(await page.evaluate(id => (globalThis as any).__card === document.querySelector(`[data-event-table] [data-event-card][data-event-id="${id}"]`), id), true)
}))

test("TSB-18 (G4): a locate within 400 ms of a wheel step lands on the located card, not the wheel anchor", () => W(zoomView(24, { leavesOnly: true }), async page => {
  await openTable(page)
  await step(page, 1)
  await page.locator(`[role="tree"] [data-tree-id="r20"]`).first().click()
  await settle(page); await page.waitForTimeout(450); await frames(page, 3)
  const r = (await tcard(page, "r20").boundingBox())!, sc = (await page.locator("[data-table-scroller]").boundingBox())!
  assert.ok(r.y >= sc.y && r.y + r.height <= sc.y + sc.height, "the located card stays in view")
}))
