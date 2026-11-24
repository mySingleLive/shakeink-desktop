/* docs/600: event-table zoom levels (plan §8–§14). */
import assert from "node:assert/strict"
import { test } from "node:test"
import { readFileSync } from "node:fs"
import { tableLayoutProjection } from "../helpers/table-layout-600-snapshot"

test("TZ-02: with no zoom option the table layout equals the docs/599 output (snapshot from 9dca205)", () => {
  const before = JSON.parse(readFileSync(new URL("../fixtures/table-layout-600-before.json", import.meta.url), "utf8"))
  assert.deepEqual(JSON.parse(JSON.stringify(tableLayoutProjection())), before)
})

import { planningSchema, type PlanningData } from "../../src/lib/planning/domain"
import * as L from "../../src/lib/planning/worldline-layout"

const FIXED24 = { kind: "fixed", epoch: "故事开始", hoursPerDay: 24, daysPerMonth: 30, monthsPerYear: 12, eras: [] } as const
type Ev = { id: string; at: number | null; parent?: string; dur?: number; importance?: number; fact?: string }
function plan(events: Ev[], calendar: unknown = FIXED24): PlanningData {
  return planningSchema.parse({ worlds: [{ id: "w", name: "主世界线", calendar }], characters: [], events: events.map(e => ({
    id: e.id, line: "w", title: e.id, fact: e.fact ?? "", parent: e.parent ?? null, category: "其他", importance: e.importance ?? 1, people: [], ongoing: false,
    duration: e.dur ?? 0, time: e.at === null ? { kind: "unknown" } : { kind: "exact", value: e.at, end: null, precision: "day", label: "" } })) })
}
const treeOf = (d: PlanningData) => L.eventTree(d.events, d)
const A = L.createCalendarAdapter(FIXED24 as any)
const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps

test("TZ-01: tableCrowding is gap × k; no gap gives Infinity", () => {
  assert.equal(L.tableCrowding(null, 0.5), Infinity)
  assert.equal(L.tableCrowding(100, 0.5), 50)
})

test("TZ-03: a point is 18 high, head at its middle, zoom 1; a parent point is one card with no group", () => {
  const t = treeOf(plan([{ id: "a", at: 0 }, { id: "p", at: 240, dur: 48 }, { id: "c", at: 260, parent: "p" }]))
  const lay = L.tableLayout(t, {}, 0, A, { plan: { points: new Set(["a", "p"]), hidden: new Set(), scale: 0.75 } })
  const a = lay.byId.get("a")!
  assert.equal(a.point, true); assert.equal(a.height, L.POINT_HEIGHT); assert.equal(a.head, a.top + L.POINT_HEIGHT / 2); assert.equal(a.zoom, 1)
  assert.equal(lay.byId.get("p")!.point, true); assert.equal(lay.byId.has("c"), false); assert.equal(lay.groups.length, 0)
})

test("TZ-04: hidden roots leave the layout and the stretch; a parent with every child hidden is stacked; unplaced children stay", () => {
  const t = treeOf(plan([{ id: "r0", at: 0 }, { id: "r1", at: 48 }, { id: "r2", at: 96 },
    { id: "p", at: 200, dur: 48 }, { id: "k", at: 210, parent: "p" },
    { id: "q", at: 400, dur: 48 }, { id: "q1", at: 410, parent: "q" }, { id: "q2", at: null, parent: "q" }]))
  const lay = L.tableLayout(t, {}, 1, A, { plan: { points: new Set(), hidden: new Set(["r1", "k"]), scale: 1 } })
  assert.equal(lay.byId.has("r1"), false)
  // r2 stretches from r0 now (96 h × k 1 = 96, under 240).
  assert.ok(close(lay.byId.get("r2")!.top - lay.byId.get("r0")!.top, 96))
  assert.equal(lay.byId.get("p")!.stacked, true); assert.ok(!lay.groups.some(g => g.id === "p"))
  assert.ok(lay.byId.has("q2"), "an unplaced child stays in the table")
})

test("TZ-05: scale 0.75 multiplies collapsed heights and head offsets only; open cards and widths stay unscaled", () => {
  const t = treeOf(plan([{ id: "a", at: 0 }, { id: "s", at: 300, dur: 48 }, { id: "s1", at: 310, parent: "s" },
    { id: "g", at: 600, dur: 48 }, { id: "g1", at: 610, parent: "g" }, { id: "o", at: 900 }]))
  const p = { points: new Set<string>(), hidden: new Set<string>(), scale: 0.75 }
  const lay = L.tableLayout(t, { o: 150 }, 0, A, { plan: p, folded: new Set(["s"]), expanded: new Set(["o"]), widths: L.tableWidths(900, false) })
  const a = lay.byId.get("a")!, s = lay.byId.get("s")!, g = lay.byId.get("g")!, o = lay.byId.get("o")!
  assert.equal(a.height, 25.5); assert.equal(a.head - a.top, 12.75); assert.equal(a.zoom, 0.75)
  assert.equal(s.height, 36); assert.equal(s.head - s.top, 15)
  assert.equal(g.height, 27); assert.equal(g.head - g.top, 13.5)
  assert.equal(o.height, 150); assert.equal(o.zoom, 1)
  // Widths are in the zoomed coordinates: the slot is slot / 0.75 wide there, a group head fills its box on screen.
  assert.ok(a.width >= 220 && a.width <= L.tableWidths(900, false).slot(0) / 0.75); assert.equal(g.width * 0.75, L.tableWidths(900, false).group(0))
  const two = L.tableLayout(treeOf(plan([{ id: "x", at: 0 }])), {}, 0, A, { plan: p })
  assert.equal(two.byId.get("x")!.height, 25.5)
})

test("TZ-06: tableZoomBounds with levels reaches level 6; without the option it is unchanged", () => {
  const years = L.createCalendarAdapter({ kind: "years", epoch: "元年" } as any)
  const yt = treeOf(plan([{ id: "a", at: 0 }, { id: "b", at: 1 }, { id: "c", at: 2 }], { kind: "years", epoch: "元年" }))
  assert.ok(close(L.tableZoomBounds(yt, years, { levels: true }).min, 0.12))
  assert.deepEqual(L.tableZoomBounds(yt, years), L.tableZoomBounds(yt, years, { levels: false }))
  const ft = treeOf(plan(Array.from({ length: 5 }, (_, i) => ({ id: `r${i}`, at: i * 720 }))))
  assert.ok(close(L.tableZoomBounds(ft, A, { levels: true }).min, 0.12 / 720))
  assert.equal(L.tableZoomBounds(ft, A, { levels: true }).fit, L.tableZoomBounds(ft, A).fit)
})

test("TZ-08: gapMax lifts the stretch cap; gapFor grows with d from 240 to 1200", () => {
  const t = treeOf(plan([{ id: "a", at: 0 }, { id: "b", at: 500 }]))
  const gap = (o: object) => { const l = L.tableLayout(t, {}, 1, A, o); return l.byId.get("b")!.top - l.byId.get("a")!.top }
  assert.equal(gap({}), 240); assert.equal(gap({ gapMax: 1200 }), 500)
  assert.equal(L.tableGapFor(100), 240); assert.equal(L.tableGapFor(160), 240); assert.equal(L.tableGapFor(400), 600); assert.equal(L.tableGapFor(1e6), 1200)
})

test("TZ-09: stretchChildren spaces children by time; the first child follows the header; without it RL-02 holds", () => {
  const t = treeOf(plan([{ id: "p", at: 0, dur: 2000 }, { id: "c1", at: 24, parent: "p" }, { id: "c2", at: 264, parent: "p" }, { id: "c3", at: 274, parent: "p" }]))
  const on = L.tableLayout(t, {}, 1, A, { gapMax: 1200, stretchChildren: true }), off = L.tableLayout(t, {}, 1, A)
  const top = (l: L.TableLayout, id: string) => l.byId.get(id)!.top
  assert.equal(top(on, "c1"), top(off, "c1"))
  assert.equal(top(on, "c2") - top(on, "c1"), 240)
  assert.equal(top(on, "c3") - top(on, "c2"), L.CARD_HEIGHT + L.CARD_GAP, "10 h is less than a stacked card")
  assert.equal(top(off, "c2") - top(off, "c1"), L.CARD_HEIGHT + L.CARD_GAP)
})

test("TZ-07/10: tableAutoOpenFits compares block tops of the closed and the open layout; group heads never open", () => {
  const ev = [{ id: "a", at: 0 }, { id: "b", at: 200 }, { id: "c", at: 400 }]
  const t = treeOf(plan(ev))
  const opts = { gapMax: 1200, stretchChildren: true }
  const closed = L.tableLayout(t, {}, 1, A, opts)
  const mk = (h: number) => L.tableLayout(t, { a: h, b: h, c: h }, 1, A, { ...opts, expanded: new Set(["a", "b", "c"]) })
  const view = { top: 0, bottom: 1000 }
  // Block a is 200 apart from b: an open height of 200 − 24 fits, one more px does not.
  assert.equal(L.tableAutoOpenFits(closed, mk(176), view, 24), true)
  assert.equal(L.tableAutoOpenFits(closed, mk(177), view, 24), false)
  assert.equal(L.tableAutoOpenFits(closed, mk(188), view, 12), true, "keep gap")
  assert.equal(L.tableAutoOpenFits(closed, mk(177), { top: 5000, bottom: 6000 }, 24), null, "no block in view")
  // A family whose span pushes the next root while closed never fits.
  const fam = treeOf(plan([{ id: "p", at: 0, dur: 400 }, { id: "k1", at: 10, parent: "p" }, { id: "k2", at: 150, parent: "p" }, { id: "q", at: 100 }]))
  const fc = L.tableLayout(fam, {}, 1, A, opts), fo = L.tableLayout(fam, { k1: 40, k2: 40, q: 40 }, 1, A, { ...opts, expanded: new Set(["k1", "k2", "q"]) })
  assert.equal(L.tableAutoOpenFits(fc, fo, view, 24), false)
  // A tall card above the view pushes the later blocks in the open layout; the blocks in view still fit (code review
  // r2: the check is relative to the open layout).
  const tall = treeOf(plan([{ id: "a", at: 0 }, { id: "b", at: 200 }, { id: "c", at: 400 }, { id: "e", at: 600 }]))
  const tc = L.tableLayout(tall, {}, 1, A, opts), to = L.tableLayout(tall, { a: 900, b: 100, c: 100, e: 100 }, 1, A, { ...opts, expanded: new Set(["a", "b", "c", "e"]) })
  const cTop = to.byId.get("c")!.top
  assert.equal(L.tableAutoOpenFits(tc, to, { top: cTop - 10, bottom: cTop + 150 }, 24), true)
  assert.equal(L.tableAutoOpenFits(tc, to, { top: 0, bottom: 300 }, 24), false, "a itself does not fit")
  // Pending blocks are not compared.
  const pend = treeOf(plan([{ id: "a", at: 0 }, { id: "z", at: null }]))
  assert.equal(L.tableAutoOpenFits(L.tableLayout(pend, {}, 1, A, opts), L.tableLayout(pend, { a: 100, z: 100 }, 1, A, { ...opts, expanded: new Set(["a", "z"]) }), view, 24), true)
})

test("TZ-11: projectAnchor restores a card or the interpolated pointer and clamps to the scroll range", () => {
  const t = treeOf(plan([{ id: "a", at: 0 }, { id: "b", at: 200 }, { id: "z", at: null }]))
  const lay = L.tableLayout(t, {}, 1, A)
  const ha = lay.byId.get("a")!.head, hb = lay.byId.get("b")!.head
  assert.equal(L.projectAnchor(lay, { a: "b", offset: 100 }, 10_000, 40), hb + 40 - 100)
  assert.equal(L.projectAnchor(lay, { a: "a", b: "b", f: 0.5, offset: 50 }, 10_000, 40), (ha + hb) / 2 + 40 - 50)
  assert.equal(L.projectAnchor(lay, { a: "a", b: "b", f: 0.5, offset: 0 }, 50, 40), 50, "clamped to maxScroll")
  assert.equal(L.projectAnchor(lay, { a: "a", offset: 9999 }, 50, 40), 0, "clamped to 0")
  assert.equal(L.projectAnchor(lay, { a: "a", offset: 0 }, -20, 40), 0, "negative maxScroll is 0")
  assert.equal(L.projectAnchor(lay, { a: "a", b: "z", f: 0.5, offset: 0 }, 10_000, 40), L.projectAnchor(lay, { a: "a", offset: 0 }, 10_000, 40), "a pending b falls back to a")
  assert.equal(L.projectAnchor(lay, { a: "gone", offset: 0 }, 10_000, 40), null)
  // §8.6 P2-1: a hidden anchor falls back to the last card starting at or before its time.
  assert.equal(L.projectAnchor(lay, { a: "gone", t: 150, offset: 0 }, 10_000, 40), ha + 40)
  assert.equal(L.projectAnchor(lay, { a: "gone", t: 250, offset: 0 }, 10_000, 40), hb + 40)
  assert.equal(L.projectAnchor(lay, { a: "gone", t: 150, b: "b", f: 0.5, offset: 0 }, 10_000, 40), (ha + hb) / 2 + 40, "between the fallback and b")
})

test("TZ-12: zoomLevel hysteresis at the 40 and 10 boundaries", () => {
  assert.equal(L.zoomLevel(40, 2), 2); assert.equal(L.zoomLevel(45.9, 2), 2); assert.equal(L.zoomLevel(46.1, 2), 1)
  assert.equal(L.zoomLevel(11.4, 3), 3); assert.equal(L.zoomLevel(11.6, 3), 2)
  assert.equal(L.zoomLevel(40, 0), 1)
})

test("TZ-13: isProgrammaticScroll matches a written scrollTop within 1px", () => {
  assert.equal(L.isProgrammaticScroll(null, 100), false)
  assert.equal(L.isProgrammaticScroll(100, 100), true)
  assert.equal(L.isProgrammaticScroll(100, 101), true)
  assert.equal(L.isProgrammaticScroll(100, 102), false)
})

test("TZ-14: decideAutoOpen latches after an exit; only user input clears it", () => {
  assert.deepEqual(L.decideAutoOpen({ on: true, latched: false, fits: false, input: false }), { on: false, latched: true })
  assert.deepEqual(L.decideAutoOpen({ on: false, latched: true, fits: true, input: false }), { on: false, latched: true })
  assert.deepEqual(L.decideAutoOpen({ on: false, latched: true, fits: true, input: true }), { on: true, latched: false })
  assert.deepEqual(L.decideAutoOpen({ on: false, latched: false, fits: true, input: false }), { on: true, latched: false })
  assert.deepEqual(L.decideAutoOpen({ on: true, latched: false, fits: null, input: false }), { on: true, latched: false })
  assert.deepEqual(L.decideAutoOpen({ on: false, latched: true, fits: false, input: true }), { on: false, latched: false })
})
