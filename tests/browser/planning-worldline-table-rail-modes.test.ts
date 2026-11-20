import assert from "node:assert/strict"
import { test } from "node:test"
import type { Browser, Page } from "playwright-core"
import { expect } from "@playwright/test"
import { civilDays } from "../../src/lib/planning/era-calendar"
import { launch, withWorldline, type WorldlineView } from "../helpers/worldline-browser-fixture"
import { f60 } from "../helpers/worldline-f60"
import { f885 } from "../helpers/worldline-f885"

/* docs/588 RM-B1 … RM-B8: aligned / equidistant event-table rail, group headers, label hover. F60, F885 and a small
 * synthetic step-back worldline; expected values follow docs/588 (not the page's code). */
let browser: Browser
test.before(async () => { browser = await launch() })
test.after(async () => { await browser?.close() })

const prep = (page: Page) => page.evaluate("globalThis.__name = f => f")
const table = async (page: Page) => { await prep(page); await page.getByRole("tab", { name: "事件表" }).click(); await page.locator("[data-event-table] [data-event-card]").first().waitFor() }
const toggle = (page: Page) => page.locator("[data-rail-mode-toggle]")
const mode = (page: Page, name: "对齐" | "等距") => toggle(page).getByRole("button", { name, exact: true })
const scroller = (page: Page) => page.locator("[data-table-scroller]")
const frames = (page: Page, n = 4) => page.evaluate(n => new Promise<void>(r => { const f = (k: number) => k ? requestAnimationFrame(() => f(k - 1)) : r(); f(n) }), n)
const settle = async (page: Page) => { await frames(page); await page.waitForTimeout(120); await frames(page) }
const setScroll = async (page: Page, top: number) => { await scroller(page).evaluate((e, top) => { e.scrollTop = top }, top); await settle(page) }
const rect = (el: Element) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height } }

/** Screen y of each in-view card head (the middle of its `.head` row) against its rail dot centre and lead ends. */
const alignment = (page: Page) => page.evaluate(() => {
  const sc = document.querySelector("[data-table-scroller]")!.getBoundingClientRect()
  const out: { id: string; head: number; dot: number | null; lead: [number, number] | null }[] = []
  for (const card of document.querySelectorAll<HTMLElement>("[data-event-table] [data-event-card][data-placed]")) {
    const id = card.dataset.eventId!, row = card.firstElementChild!.getBoundingClientRect()
    const head = row.top + row.height / 2
    if (head < sc.top + 10 || head > sc.bottom - 10) continue
    const dot = document.querySelector<HTMLElement>(`[data-rail-dot][data-ids~="${CSS.escape(id)}"]`)
    const lead = document.querySelector<SVGPathElement>(`[data-rail-lead="${CSS.escape(id)}"]`)
    let ends: [number, number] | null = null
    if (lead) {
      const svg = lead.ownerSVGElement!.getBoundingClientRect(), len = lead.getTotalLength()
      ends = [svg.top + lead.getPointAtLength(0).y, svg.top + lead.getPointAtLength(len).y]
    }
    out.push({ id, head, dot: dot ? dot.getBoundingClientRect().top + dot.getBoundingClientRect().height / 2 : null, lead: ends })
  }
  return out
})
const assertAligned = (rows: Awaited<ReturnType<typeof alignment>>, label: string) => {
  assert.ok(rows.length >= 5, `${label}: ${rows.length} cards in view`)
  for (const r of rows) {
    assert.ok(r.dot !== null && Math.abs(r.dot - r.head) <= 1, `${label} ${r.id}: dot ${r.dot} head ${r.head}`)
    assert.ok(r.lead && Math.abs(r.lead[0] - r.head) <= 1 && Math.abs(r.lead[1] - r.head) <= 1, `${label} ${r.id}: lead ${r.lead} head ${r.head}`)
  }
}

const H = 24, FIFTH = civilDays(200001, 1, 1) * H
const D5 = (y: number, m: number, d: number) => FIFTH + civilDays(y, m, d) * H
/** RM-04 shape: A (04-01) with A1 (12-20); B (06-01) with B1 (06-05) and B2 (1341-01-03): B and B1 step back. */
const CALENDAR = { kind: "gregorian", epoch: "0001-01-01T00:00:00Z", hoursPerDay: 24, daysPerMonth: 30, monthsPerYear: 12, eras: [{ name: "第四纪", start: 0 }, { name: "第五纪", start: FIFTH }] }
const viewOf = (events: unknown[]): WorldlineView => ({
  version: 1,
  data: { schemaVersion: 1, worlds: [{ id: "w", name: "主世界线", calendar: CALENDAR }], events, periods: [], lines: [], cards: [], volumes: [], chapters: [], connections: [] },
  characters: [], materials: [], readonly: false, history: [], proposals: [],
})
/** 20 roots three days apart, plus three events in the same hour after r5: one linear cluster of 3. */
function clustered(): WorldlineView {
  const ev = (id: string, at: number) => ({ id, line: "w", parent: null, title: id, category: "其他", importance: 1, people: [], fact: "", duration: 0, time: { kind: "exact", value: at, precision: "day" } })
  return viewOf([...Array.from({ length: 20 }, (_, i) => ev(`r${i}`, D5(1340, 3, 1) + i * 72)), ...["s0", "s1", "s2"].map((id, k) => ev(id, D5(1340, 3, 1) + 5 * 72 + 36 + k * 0.1))])
}
function backs(): WorldlineView {
  const ev = (id: string, title: string, at: number, parent: string | null = null, duration = 0) => ({
    id, line: "w", parent, title, category: "其他", importance: 1, people: [], fact: "", duration, time: { kind: "exact", value: at, precision: "day" },
  })
  const events = [
    ev("A", "甲家族", D5(1340, 4, 1), null, 300 * H), ev("A1", "甲家族·后事", D5(1340, 12, 20), "A"),
    ev("B", "乙家族", D5(1340, 6, 1), null, 240 * H), ev("B1", "乙家族·开端", D5(1340, 6, 5), "B"), ev("B2", "乙家族·新年", D5(1341, 1, 3), "B"),
  ]
  return viewOf(events)
}

test("RM-B1: aligned by default; the toggle sits top right, stays put while scrolling, covers no card at the top, keyboard works", () => withWorldline(browser, f60(), async page => {
  await table(page)
  await expect(mode(page, "对齐")).toHaveAttribute("aria-pressed", "true")
  await expect(mode(page, "等距")).toHaveAttribute("aria-pressed", "false")
  const place = () => page.evaluate(() => {
    const t = document.querySelector("[data-rail-mode-toggle]")!.getBoundingClientRect(), s = document.querySelector("[data-table-scroller]")!
    const sr = s.getBoundingClientRect()
    return { right: sr.right - (s as HTMLElement).offsetWidth + s.clientWidth - t.right, top: t.top - sr.top, x: t.left, y: t.top }
  })
  const at0 = await place()
  assert.ok(at0.right >= 0 && at0.right <= 30, `right gap ${at0.right}`); assert.ok(at0.top >= 0 && at0.top <= 16, `top gap ${at0.top}`)
  const hits = await page.evaluate(() => {
    const t = document.querySelector("[data-rail-mode-toggle]")!.getBoundingClientRect()
    return [...document.querySelectorAll("[data-event-table] [data-event-card]")].map(c => c.getBoundingClientRect()).filter(r => r.left < t.right && r.right > t.left && r.top < t.bottom && r.bottom > t.top).length
  })
  assert.equal(hits, 0)
  await setScroll(page, 1000)
  const at1 = await place()
  assert.ok(Math.abs(at1.x - at0.x) <= 0.5 && Math.abs(at1.y - at0.y) <= 0.5, JSON.stringify([at0, at1]))
  // Keyboard: Tab from 对齐 reaches 等距; Space switches.
  await mode(page, "对齐").focus()
  await page.keyboard.press("Tab")
  await expect(mode(page, "等距")).toBeFocused()
  await page.keyboard.press("Space")
  await expect(mode(page, "等距")).toHaveAttribute("aria-pressed", "true")
  await page.getByRole("tab", { name: "时间线" }).click()
  await expect(toggle(page)).toHaveCount(0)
}))

test("RM-B2: aligned dots and leads sit on every in-view card head, collapsed, expanded and grandchildren; F60", () => withWorldline(browser, f60(), async page => {
  await table(page)
  await setScroll(page, 0)
  assertAligned(await alignment(page), "top")
  const grand = page.locator('[data-event-table] [data-event-card][aria-label$="冲突中有人受伤"]').first()
  await grand.scrollIntoViewIfNeeded(); await settle(page)
  const rows = await alignment(page), gid = await grand.getAttribute("data-event-id")
  assert.ok(rows.some(r => r.id === gid), "grandchild in view")
  assertAligned(rows, "grandchild")
  // Expand a leaf and a parent header: the dot follows the expanded head row.
  const leaf = page.locator("[data-event-table] [data-event-card][data-placed]:not([class*=groupHead])").nth(3)
  await leaf.locator("[data-card-title]").click(); await settle(page)
  const header = page.locator("[data-event-table] [data-event-group] [data-event-card]").first()
  await header.locator("[data-card-title]").click(); await settle(page)
  await leaf.scrollIntoViewIfNeeded(); await settle(page)
  assertAligned(await alignment(page), "expanded")
}))

test("RM-B2b: F885 (virtualized) stays aligned in the middle of the table", () => withWorldline(browser, f885(), async page => {
  await table(page)
  await scroller(page).evaluate(e => { e.scrollTop = e.scrollHeight * 0.5 }); await settle(page)
  assertAligned(await alignment(page), "F885 middle")
}))

test("RM-B3: switching modes keeps the scroll and card positions; zoom reads % aligned and the level linear; mode survives a view switch", () => withWorldline(browser, f60(), async page => {
  await table(page)
  await setScroll(page, 600)
  const snap = () => page.evaluate(() => ({ top: document.querySelector("[data-table-scroller]")!.scrollTop, cards: [...document.querySelectorAll<HTMLElement>("[data-event-table] [data-event-card]")].slice(0, 30).map(c => [c.dataset.eventId, Math.round(c.getBoundingClientRect().top)]) }))
  const before = await snap()
  const zoom = page.locator("[data-zoom-value]")
  await expect(zoom).toHaveText("100%")
  await mode(page, "等距").click(); await settle(page)
  assert.deepEqual(await snap(), before)
  assert.match(await zoom.innerText(), /^(年|月|日|上下午|时分|按事件)$/)
  await mode(page, "对齐").click(); await settle(page)
  assert.deepEqual(await snap(), before)
  await page.getByRole("button", { name: "放大" }).click()
  await expect(zoom).toHaveText("125%")
  const box = await scroller(page).boundingBox()
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await page.keyboard.down("Control"); await page.mouse.wheel(0, -100); await page.keyboard.up("Control")
  await expect(zoom).toHaveText("144%")
  await mode(page, "等距").click()
  await page.getByRole("tab", { name: "时间线" }).click()
  await page.getByRole("tab", { name: "事件表" }).click()
  await expect(mode(page, "等距")).toHaveAttribute("aria-pressed", "true")
}))

test("RM-B4: hovering a rail date lights the label, dot, lead and card; the guide shows aligned; a keyboard mode switch under a still pointer clears it", () => withWorldline(browser, f60(), async page => {
  await table(page)
  await setScroll(page, 400)
  const label = page.locator("[data-rail-label]").filter({ hasText: /月|日/ }).nth(2)
  const ids = (await label.getAttribute("data-ids"))!.split(" ")
  assert.equal(ids.length, 1)
  await label.hover(); await settle(page)
  const id = ids[0]
  await expect(label).toHaveClass(/hot/)
  await expect(page.locator(`[data-rail-dot][data-ids="${id}"]`)).toHaveClass(/hot/)
  await expect(page.locator(`[data-rail-lead="${id}"]`)).toHaveClass(/hot/)
  await expect(page.locator(`[data-event-table] [data-event-card][data-event-id="${id}"]`)).toHaveAttribute("data-hot", "")
  await expect(page.locator(`[data-rail-guide="${id}"]`)).toHaveCount(1)
  // Switch by keyboard so the pointer never leaves the label: only the mode change can clear the hover (code review M3).
  await mode(page, "等距").focus()
  await page.keyboard.press("Enter"); await settle(page)
  await expect(mode(page, "等距")).toHaveAttribute("aria-pressed", "true")
  await expect(page.locator(`[data-event-table] [data-event-card][data-event-id="${id}"]`)).not.toHaveAttribute("data-hot", "")
  await expect(page.locator("[data-rail-guide]")).toHaveCount(0)
  await page.mouse.move(5, 5); await settle(page)
  await expect(page.locator("[data-event-table] [data-event-card][data-hot]")).toHaveCount(0)
}))

test("RM-B4b: linear mode, hovering a cluster's label lights every card in it", () => withWorldline(browser, clustered(), async page => {
  await table(page)
  await mode(page, "等距").click(); await settle(page)
  // Reset reads months (every label is 1340年3月 and hides); two steps in reach the day level (k ≈ 0.87 px/h).
  for (let i = 0; i < 2; i++) await page.getByRole("button", { name: "放大" }).click()
  await expect(page.locator("[data-zoom-value]")).toHaveText("日")
  const dot = page.locator("[data-rail-dot][data-cluster]")
  await expect(dot).toHaveCount(1)
  const ids = (await dot.getAttribute("data-ids"))!
  assert.deepEqual(ids.split(" ").sort(), ["s0", "s1", "s2"])
  await page.locator(`[data-rail-label][data-ids="${ids}"]`).hover(); await settle(page)
  for (const id of ["s0", "s1", "s2"]) await expect(page.locator(`[data-event-table] [data-event-card][data-event-id="${id}"]`)).toHaveAttribute("data-hot", "")
  await expect(page.locator("[data-event-table] [data-event-card][data-hot]")).toHaveCount(3)
}))

test("RM-B5: the parent card heads its box: full width, flush top, 36px, children 4px below; folded it is a stacked card (docs/592 R5); expanded header still full width", () => withWorldline(browser, f60(), async page => {
  await table(page)
  const group = page.locator('[data-event-group][data-parent-title="港口商会签下秘密契约"]').first()
  const geo = () => group.evaluate(g => {
    const head = g.querySelector(":scope > div > [data-event-card]")!, child = g.querySelectorAll(":scope > div > [data-event-card]")[1] ?? g.querySelector(":scope [data-event-group] [data-event-card]")
    const r = (e: Element | null) => { if (!e) return null; const x = e.getBoundingClientRect(); return { l: x.left, r: x.right, t: x.top, b: x.bottom, h: x.height } }
    return { box: r(g)!, head: r(head)!, child: r(child) }
  })
  const g = await geo()
  assert.ok(Math.abs(g.head.l - g.box.l) <= 1 && Math.abs(g.head.r - g.box.r) <= 1, JSON.stringify(g))
  assert.ok(Math.abs(g.head.t - g.box.t) <= 1, JSON.stringify(g))
  assert.equal(Math.round(g.head.h), 36)
  assert.ok(g.child && Math.abs(g.child.t - g.head.b - 4) <= 1, JSON.stringify(g))
  const parentCard = page.locator('[data-event-table] [data-event-card][aria-label="港口商会签下秘密契约"]')
  await group.locator("[data-fold]").first().click(); await settle(page)
  // docs/592 R5: folded, the parent is a stacked card (40 + 8 peek) as wide as the box was; there is no box.
  await expect(page.locator('[data-event-group][data-parent-title="港口商会签下秘密契约"]')).toHaveCount(0)
  await expect(parentCard).toHaveAttribute("data-stacked", "")
  const wrap = parentCard.locator("xpath=..")
  assert.equal(Math.round(await wrap.evaluate(e => e.getBoundingClientRect().height)), 48)
  assert.ok(Math.abs(await wrap.evaluate(e => e.getBoundingClientRect().width) - g.box.r + g.box.l) <= 1)
  await parentCard.locator("[data-fold]").click(); await settle(page)
  await group.locator("[data-event-card] [data-card-title]").first().click(); await settle(page)
  const open = await geo()
  assert.ok(Math.abs(open.head.l - open.box.l) <= 1 && Math.abs(open.head.r - open.box.r) <= 1, JSON.stringify(open))
}))

test("RM-B6: a step back reads ↺, has a title, a hollow dot and a dashed run", () => withWorldline(browser, backs(), async page => {
  await table(page)
  const back = page.locator("[data-rail-label]").filter({ hasText: /^↺/ })
  await expect(back).toHaveText(["↺ 6月1日", "↺ 6月5日"])
  await expect(back.first()).toHaveAttribute("title", "早于上一事件")
  await expect(page.locator("[data-rail-back-dot]")).toHaveCount(2)
  await expect(page.locator("[data-rail-back]")).toHaveCount(1)
  await expect(page.locator("[data-rail-badge]")).toHaveText(["第五纪1340年", "第五纪1341年"])
  // Hovered, a step-back label is white on the type color like any hot label (real-app e1 found it dim).
  await back.first().hover()
  await expect.poll(() => back.first().evaluate(e => getComputedStyle(e).color)).toBe("rgb(255, 255, 255)")
}))

test("RM-B7: in a narrow panel the toggle fits the scroller without its prefix and does not touch the sticky year", () => withWorldline(browser, f60(), async page => {
  await table(page)
  await setScroll(page, 1500)
  const r = await page.evaluate(() => {
    const t = document.querySelector("[data-rail-mode-toggle]")!, s = document.querySelector("[data-table-scroller]")!.getBoundingClientRect()
    const y = document.querySelector("[data-sticky-year] span")?.getBoundingClientRect() ?? null
    const tr = t.getBoundingClientRect()
    const labels = [...document.querySelectorAll("[data-rail-label]")].map(l => l.getBoundingClientRect()).filter(l => l.bottom > s.top && l.top < s.bottom)
    return { t: { l: tr.left, r: tr.right, t: tr.top, b: tr.bottom }, s: { l: s.left, r: s.right }, y: y && { l: y.left, r: y.right, t: y.top, b: y.bottom }, prefix: getComputedStyle(t.querySelector("span")!).display, labelsOut: labels.filter(l => l.left < s.left || l.right > s.right).length }
  })
  assert.ok(r.t.l >= r.s.l && r.t.r <= r.s.r, JSON.stringify(r))
  assert.equal(r.prefix, "none")
  assert.ok(r.y, "sticky year shown")
  assert.ok(r.y!.r <= r.t.l || r.y!.l >= r.t.r || r.y!.b <= r.t.t || r.y!.t >= r.t.b, JSON.stringify(r))
  assert.equal(r.labelsOut, 0)
}, { width: 470 }))

test("RM-B8: aligned locate brings a header and a grandchild to the upper third; an open card menu sits above the toggle", () => withWorldline(browser, f60(), async page => {
  await table(page)
  const tree = page.getByRole("tree", { name: "事件目录" })
  for (const name of ["港口商会签下秘密契约", "港口商会签下秘密契约·冲突中有人受伤"]) {
    await tree.locator(`[role="treeitem"][aria-label^="${name}"]`).first().click()
    // WU-62 口径（planning-worldline-table-scale inUpperThird）: the card top within 4px of one third of the scroller.
    await expect.poll(() => page.evaluate(n => {
      const sc = document.querySelector("[data-table-scroller]")!
      const c = [...document.querySelectorAll<HTMLElement>("[data-event-table] [data-event-card]")].find(e => e.getAttribute("aria-label") === n)
      return c ? Math.abs(c.getBoundingClientRect().top - sc.getBoundingClientRect().top - sc.clientHeight / 3) : Infinity
    }, name)).toBeLessThanOrEqual(4)
  }
  // Open a card's menu, then scroll so the open menu passes under the toggle (code review M2: the overlap must happen).
  await setScroll(page, 0)
  const first = page.locator("[data-event-table] [data-event-card]").first()
  await first.locator("[data-card-title]").click(); await settle(page)
  await first.locator("[data-card-menu] summary").click()
  const menuSel = "[data-card-menu][open] > :not(summary)"
  await page.locator(menuSel).first().waitFor()
  const shift = await page.evaluate(sel => {
    const t = document.querySelector("[data-rail-mode-toggle]")!.getBoundingClientRect(), m = document.querySelector(sel)!.getBoundingClientRect()
    return { dy: m.top - t.top + 4, overlapX: m.left < t.right && m.right > t.left, mRight: m.right, tLeft: t.left }
  }, menuSel)
  assert.ok(shift.overlapX, `menu and toggle share columns: ${JSON.stringify(shift)}`)
  await scroller(page).evaluate((e, dy) => { e.scrollTop += dy }, shift.dy); await settle(page)
  const onTop = await page.evaluate(sel => {
    const t = document.querySelector("[data-rail-mode-toggle]")!.getBoundingClientRect(), menu = document.querySelector(sel)!
    const m = menu.getBoundingClientRect()
    const x = (Math.max(t.left, m.left) + Math.min(t.right, m.right)) / 2, y = (Math.max(t.top, m.top) + Math.min(t.bottom, m.bottom)) / 2
    if (Math.max(t.left, m.left) >= Math.min(t.right, m.right) || Math.max(t.top, m.top) >= Math.min(t.bottom, m.bottom)) return "no overlap"
    return menu.contains(document.elementFromPoint(x, y)) ? "menu" : "toggle"
  }, menuSel)
  assert.equal(onTop, "menu")
}))

test("RM-B9: aligned by default, every placed card in view has its date label next to its dot (docs/588 验收)", () => withWorldline(browser, f60(), async page => {
  await table(page)
  for (const at of [0, 600, 1500]) {
    await setScroll(page, at)
    const missing = await page.evaluate(() => {
      const sc = document.querySelector("[data-table-scroller]")!.getBoundingClientRect(), out: string[] = []
      for (const card of document.querySelectorAll<HTMLElement>("[data-event-table] [data-event-card][data-placed]")) {
        const r = card.getBoundingClientRect()
        if (r.top < sc.top + 10 || r.bottom > sc.bottom - 10) continue
        const id = card.dataset.eventId!, label = document.querySelector<HTMLElement>(`[data-rail-label][data-ids="${CSS.escape(id)}"]`)
        const head = card.firstElementChild!.getBoundingClientRect()
        if (!label || !label.textContent || Math.abs(label.getBoundingClientRect().top + label.getBoundingClientRect().height / 2 - (head.top + head.height / 2)) > 1) out.push(id)
      }
      return out
    })
    assert.deepEqual(missing, [], `scroll ${at}`)
  }
  // Same date text as the event directory row (docs/588 验收 2026-11-19), for every non step-back label rendered.
  const diff = await page.evaluate(() => {
    const out: string[] = []
    let n = 0
    for (const l of document.querySelectorAll<HTMLElement>("[data-rail-label]")) {
      if (l.textContent!.startsWith("↺")) continue
      const row = document.querySelector<HTMLElement>(`[role="treeitem"][data-tree-id="${CSS.escape(l.dataset.ids!)}"]`)
      // A parent row prefixes its child count ("5 · "); the date is what follows.
      const t = row?.querySelector("[class*=treeTime]")?.textContent?.trim().replace(/^\+?\d+ · /, "")
      if (!t) continue
      n++
      if (t !== l.textContent) out.push(`${l.dataset.ids}: ${l.textContent} ≠ ${t}`)
    }
    return { n, out }
  })
  assert.ok(diff.n >= 20, `compared ${diff.n}`)
  assert.deepEqual(diff.out, [])
}))
