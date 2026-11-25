/* docs/601: aligned-mode event table with equal gaps (plan §2, §8). */
import assert from "node:assert/strict"
import { test } from "node:test"
import { planningSchema, type PlanningData } from "../../src/lib/planning/domain"
import * as L from "../../src/lib/planning/worldline-layout"
import { zoomView } from "../helpers/worldline-zoom"
import { f885 } from "../helpers/worldline-f885"

const FIXED24 = { kind: "fixed", epoch: "故事开始", hoursPerDay: 24, daysPerMonth: 30, monthsPerYear: 12, eras: [] } as const
const YEAR = 24 * 30 * 12
type Ev = { id: string; at: number | null; parent?: string }
function plan(events: Ev[], calendar: unknown = FIXED24): PlanningData {
  return planningSchema.parse({ worlds: [{ id: "w", name: "主世界线", calendar }], characters: [], events: events.map(e => ({
    id: e.id, line: "w", title: e.id, fact: "", parent: e.parent ?? null, category: "其他", importance: 1, people: [], ongoing: false,
    duration: 0, time: e.at === null ? { kind: "unknown" } : { kind: "exact", value: e.at, end: null, precision: "day", label: "" } })) })
}
const A = L.createCalendarAdapter(FIXED24 as any)
const treeOf = (d: PlanningData) => L.eventTree(d.events, d)
const viewTree = (v: any) => { const d = v.data, w = d.worlds[0].id; return { tree: L.eventTree(d.events.filter((e: any) => e.line === w), d), ad: L.adapterFor(d, w, null as any) } }
/** Same-level neighbours: block bottom → next block top (blocks of one level, in order, not across a break). */
function levelGaps(lay: L.TableLayout) {
  const out: number[] = [], by = new Map<string, L.TableBlock[]>()
  for (const b of lay.blocks) (by.get(b.level) ?? by.set(b.level, []).get(b.level)!).push(b)
  const brk = (a: number, b: number) => lay.breaks.some(k => k.top >= a && k.top <= b)
  for (const list of by.values()) for (let i = 1; i < list.length; i++) if (!brk(list[i - 1].bottom, list[i].top)) out.push(list[i].top - list[i - 1].bottom)
  return out
}

test("EG-01: equalGaps: same-level neighbours are CARD_GAP apart, whatever k; card tops do not move with k", () => {
  const { tree, ad } = viewTree(zoomView(24))
  const b = L.tableZoomBounds(tree, ad)
  const opt = { widths: L.tableWidths(900, false), equalGaps: true, stretchChildren: true }
  const a = L.tableLayout(tree, {}, b.fit, ad, opt), z = L.tableLayout(tree, {}, b.fit * 40, ad, opt)
  const gaps = levelGaps(a)
  assert.ok(gaps.length > 20)
  for (const g of gaps) assert.equal(g, L.CARD_GAP)
  assert.deepEqual(z.cards.map(c => c.top), a.cards.map(c => c.top))
  assert.equal(a.equal, true)
  assert.equal(L.tableLayout(tree, {}, b.fit, ad, {}).equal, false)
})

test("EG-02 / EGB-08 shape: family children are CARD_GAP apart, 4 below the head, with stretchChildren", () => {
  const { tree, ad } = viewTree(zoomView(24))
  const lay = L.tableLayout(tree, {}, L.tableZoomBounds(tree, ad).fit * 40, ad, { equalGaps: true, stretchChildren: true, gapMax: 1200 })
  const kids = lay.blocks.filter(b => b.level === "r2")
  assert.equal(kids.length, 3)
  for (let i = 1; i < kids.length; i++) assert.equal(kids[i].top - kids[i - 1].bottom, L.CARD_GAP)
  const head = lay.byId.get("r2")!
  assert.equal(kids[0].top - (head.top + head.height), L.GROUP_HEAD_GAP)
})

test("EG-03: a segment break widens only that gap: next head = last head + 62 (years), text line at last head + 20", () => {
  const t = treeOf(plan([{ id: "a", at: 0 }, { id: "b", at: 24 }, { id: "c", at: 80 * YEAR }, { id: "d", at: 80 * YEAR + 24 }]))
  const lay = L.tableLayout(t, {}, 0.01, A, { equalGaps: true })
  const [a, b, c, d] = ["a", "b", "c", "d"].map(id => lay.byId.get(id)!)
  assert.equal(b.top - (a.top + a.height), L.CARD_GAP)
  assert.equal(d.top - (c.top + c.height), L.CARD_GAP)
  assert.equal(c.head - b.head, L.RAIL_BREAK_SPAN)
  const k = lay.breaks.find(x => x.kind === "gap")!
  assert.equal(k.top + k.height / 2, b.head + 20)
})

test("EG-03b: the pending break and a calendar without years: next head = last head + 40, text in the middle", () => {
  const t = treeOf(plan([{ id: "a", at: 0 }, { id: "p", at: null }]))
  const lay = L.tableLayout(t, {}, 0.01, A, { equalGaps: true })
  const a = lay.byId.get("a")!, p = lay.byId.get("p")!
  assert.equal(p.head - a.head, L.RAIL_MARK_SPAN)
  const k = lay.breaks.find(x => x.kind === "pending")!
  assert.equal(k.top + k.height / 2, (a.head + p.head) / 2)
})

test("EG-07: a year change between points widens to 40; between collapsed cards it stays 40; points in one year are 24 apart", () => {
  // One segment (gaps of a day or two), a year change between b and c.
  const evs = [{ id: "a", at: YEAR - 48 }, { id: "b", at: YEAR - 24 }, { id: "c", at: YEAR }, { id: "d", at: YEAR + 24 }]
  const t = treeOf(plan(evs))
  const pts = L.tableLayout(t, {}, 0.01, A, { equalGaps: true, plan: { points: new Set(["a", "b", "c", "d"]), hidden: new Set(), scale: 1 } })
  const h = (l: L.TableLayout, id: string) => l.byId.get(id)!.head
  assert.equal(h(pts, "b") - h(pts, "a"), L.POINT_HEIGHT + L.CARD_GAP)
  assert.equal(h(pts, "c") - h(pts, "b"), L.RAIL_MARK_SPAN)
  assert.equal(h(pts, "d") - h(pts, "c"), L.POINT_HEIGHT + L.CARD_GAP)
  const cards = L.tableLayout(t, {}, 0.01, A, { equalGaps: true })
  assert.equal(h(cards, "c") - h(cards, "b"), L.CARD_HEIGHT + L.CARD_GAP)
})

test("EG-05: aligned rail on an equal layout: dots on heads, segment lines apart ≥ 8, a later segment's year badge 20 above its first head", () => {
  const t = treeOf(plan([{ id: "a", at: 0 }, { id: "b", at: 24 }, { id: "c", at: 80 * YEAR }, { id: "d", at: 80 * YEAR + 24 }]))
  const lay = L.tableLayout(t, {}, 0.01, A, { equalGaps: true })
  const m = L.alignedRailMarks(lay, A)
  for (const c of lay.cards) assert.equal(m.points.get(c.id), c.head)
  const [l0, l1] = m.lines
  assert.equal(l0.top, lay.byId.get("a")!.head - 22)
  assert.ok(l1.top - (l0.top + l0.height) >= 8)
  assert.equal(l1.top + l1.height, lay.byId.get("d")!.head + 22)
  const second = m.badges.filter(b => b.kind === "year" && b.segment === 1)
  assert.equal(second[0].y, lay.byId.get("c")!.head - 20)
  assert.equal(m.badges.filter(b => b.segment === 0)[0].y, lay.byId.get("a")!.head - 22)
})

test("EG-06: points are 18 high and CARD_GAP apart; a hidden root leaves no gap", () => {
  const t = treeOf(plan([{ id: "a", at: 0 }, { id: "b", at: 24 }, { id: "c", at: 48 }]))
  const lay = L.tableLayout(t, {}, 0.01, A, { equalGaps: true, plan: { points: new Set(["a", "c"]), hidden: new Set(["b"]), scale: 1 } })
  const a = lay.byId.get("a")!, c = lay.byId.get("c")!
  assert.equal(a.height, L.POINT_HEIGHT)
  assert.equal(c.top - (a.top + a.height), L.CARD_GAP)
  assert.equal(lay.byId.has("b"), false)
})

test("EG-04: without equalGaps, f885 at fit keeps its 46px breaks and time stretch", () => {
  const { tree, ad } = viewTree(f885())
  const lay = L.tableLayout(tree, {}, L.tableZoomBounds(tree, ad).fit, ad, {})
  assert.ok(lay.breaks.length > 0)
  for (const b of lay.breaks) assert.equal(b.height, L.BREAK_HEIGHT)
})

test("EG-09 (code review P2): after an expanded last card the break text sits below its bottom, and the next head leaves room for it", () => {
  const t = treeOf(plan([{ id: "a", at: 0 }, { id: "b", at: 24 }, { id: "c", at: 80 * YEAR }, { id: "d", at: 80 * YEAR + 24 }]))
  const lay = L.tableLayout(t, { b: 300 }, 0.01, A, { equalGaps: true, expanded: new Set(["b"]) })
  assert.equal(lay.breaks.length, 1)
  const b = lay.byId.get("b")!, c = lay.byId.get("c")!, k = lay.breaks[0]
  // The text line's middle is below the card body (the line is in the rail column, so its top half may sit beside the
  // card's last pixels, as it does after a collapsed card).
  assert.ok(k.top + k.height / 2 >= b.top + b.height, `text middle ${k.top + k.height / 2} below card bottom ${b.top + b.height}`)
  assert.ok(c.top >= k.top + k.height, `next card ${c.top} below the text ${k.top + k.height}`)
  // The next segment's badge (20 above its head) clears the text line.
  assert.ok(c.head - 20 - 9.5 >= k.top + k.height, "badge clears the text")
})

test("EG-10: a segment break on a calendar without years: text in the middle, heads 40 apart, no year badge", () => {
  const MONTHS = { kind: "fixed", epoch: "开始", hoursPerDay: 24, daysPerMonth: 30, monthsPerYear: null, eras: [] }
  const ad = L.createCalendarAdapter(MONTHS as any)
  const evs = [{ id: "a", at: 0 }, { id: "b", at: 24 }, { id: "c", at: 24 * 3000 }, { id: "d", at: 24 * 3001 }]
  const t = treeOf(plan(evs, MONTHS))
  const lay = L.tableLayout(t, {}, 0.01, ad, { equalGaps: true })
  assert.equal(lay.breaks.length, 1)
  assert.equal(L.alignedRailMarks(lay, ad).badges.length, 0)
  const b = lay.byId.get("b")!, c = lay.byId.get("c")!, k = lay.breaks[0]
  assert.equal(c.head - b.head, L.RAIL_MARK_SPAN)
  assert.equal(k.top + k.height / 2, (b.head + c.head) / 2)
})
