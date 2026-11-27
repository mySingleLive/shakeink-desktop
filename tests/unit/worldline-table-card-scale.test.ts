/* docs/602: event-table zoom stops: card scale, both ends stop, every step changes something, all open (plan §2, §9, §10.1). */
import assert from "node:assert/strict"
import { test } from "node:test"
import { planningSchema, type PlanningData } from "../../src/lib/planning/domain"
import * as L from "../../src/lib/planning/worldline-layout"
import { zoomView } from "../helpers/worldline-zoom"
import { f885 } from "../helpers/worldline-f885"

const FIXED24 = { kind: "fixed", epoch: "故事开始", hoursPerDay: 24, daysPerMonth: 30, monthsPerYear: 12, eras: [] } as const
type Ev = { id: string; at: number | null; parent?: string; dur?: number; importance?: number }
function plan(events: Ev[], calendar: unknown = FIXED24): PlanningData {
  return planningSchema.parse({ worlds: [{ id: "w", name: "主世界线", calendar }], characters: [], events: events.map(e => ({
    id: e.id, line: "w", title: e.id, fact: "", parent: e.parent ?? null, category: "其他", importance: e.importance ?? 1, people: [], ongoing: false,
    duration: e.dur ?? 0, time: e.at === null ? { kind: "unknown" } : { kind: "exact", value: e.at, end: null, precision: "day", label: "" } })) })
}
const A = L.createCalendarAdapter(FIXED24 as any)
const treeOf = (d: PlanningData) => L.eventTree(d.events, d)
const viewTree = (v: any) => { const d = v.data, w = d.worlds[0].id; return { tree: L.eventTree(d.events.filter((e: any) => e.line === w), d), ad: L.adapterFor(d, w, null as any) } }
type Keep = { folded?: Set<string>; cards?: Set<string> }
const model = (tree: L.EventTree, ad: L.CalendarAdapter, levels = true, keep: Keep = {}) =>
  L.tableZoomModel(tree, ad, L.tableZoomBounds(tree, ad, { levels }), levels, { folded: keep.folded ?? new Set(), cards: keep.cards ?? new Set() })
const W = L.TABLE_WHEEL_STEP, E = L.TABLE_CARD_SCALE_SPAN
type Mode = "aligned" | "linear"
/** Walks wheel steps in one direction until null, tracking the drawn level like PlanningWorkspace; returns the stops. */
function walk(m: L.TableZoomModel, mode: Mode, dir: 1 | -1, from = 0, size = W) {
  let e = from, level = L.tableZoomLevelAt(m, from, 0)
  const stops: { e: number; level: L.ZoomLevel; v: L.TableZoomView }[] = [{ e, level, v: L.tableZoomView(m, e, level) }]
  for (let i = 0; i < 500; i++) {
    const n = L.tableZoomStep(m, mode, { e, level }, dir, size)
    if (n === null) break
    e = n; level = L.tableZoomLevelAt(m, e, level)
    stops.push({ e, level, v: L.tableZoomView(m, e, level) })
  }
  return { stops, e, level }
}
/** Code review P2-3: what the table really draws at a stop, from zoomPlan + tableLayout as EventTable builds them
 * (auto-folds, points, hidden, kept cards, the stretch cap, aligned equal gaps), plus the rail label level in linear
 * mode. Open cards are 120 px (a measured height, not the model's estimate). Not a copy of the model's signature. */
function drawn(tree: L.EventTree, ad: L.CalendarAdapter, m: L.TableZoomModel, mode: Mode, at: { e: number; level: L.ZoomLevel }, keep: Keep = {}) {
  const folded = keep.folded ?? new Set<string>(), kept = keep.cards ?? new Set<string>()
  const v = L.tableZoomView(m, at.e, at.level), k = m.fit * Math.exp(at.e)
  // Kept cards (selected, a search hit) are cards, not open ones (EventTable keepCards vs shownOpen).
  const open = new Set<string>()
  if (v.open) for (const n of tree.byId.values()) if (n.start !== null) open.add(n.id)
  const p = L.zoomPlan(tree, v.level, v.scale, { cards: new Set([...kept, ...open]), unfolded: new Set(), showAll: false, folded })
  const viewFolded = new Set([...folded, ...p.autoFolded]), heights = Object.fromEntries([...open].map(id => [id, 120]))
  const d = L.tableCrowding(m.gap, k), equal = mode === "aligned"
  const lay = L.tableLayout(tree, heights, equal ? 0 : k, ad, { expanded: open, folded: viewFolded, widths: L.tableWidths(900, false), plan: { points: p.points, hidden: p.hidden, scale: p.scale }, gapMax: equal ? undefined : L.tableGapFor(d), stretchChildren: true, equalGaps: equal })
  // Linear rail: the date text each placed card's label shows at this rail level (what is drawn, not the level name).
  const rl = equal ? null : L.railLevel(k, ad)
  const texts = rl ? lay.cards.filter(c => c.start !== null).map(c => ad.railText(c.start!, rl, tree.byId.get(c.id)!.event.time)) : []
  return JSON.stringify([lay.cards.map(c => [c.id, Math.round(c.top * 2), Math.round(c.height * 2), c.point, c.stacked, c.expanded]), texts])
}
/** Every stop differs from the one before, and every skipped wheel position looks like the stop it left (review P2-3). */
function assertStops(tree: L.EventTree, ad: L.CalendarAdapter, m: L.TableZoomModel, mode: Mode, dir: 1 | -1, keep: Keep = {}) {
  let e = 0, level = L.tableZoomLevelAt(m, 0, 0), dead = 0, skippedChange = 0, stops = 0
  for (let i = 0; i < 500; i++) {
    const n = L.tableZoomStep(m, mode, { e, level }, dir, W)
    if (n === null) break
    const from = drawn(tree, ad, m, mode, { e, level }, keep)
    for (let x = e + dir * W; dir > 0 ? x < n - 1e-9 : x > n + 1e-9; x += dir * W)
      if (drawn(tree, ad, m, mode, { e: x, level: L.tableZoomLevelAt(m, x, level) }, keep) !== from) skippedChange++
    const nl = L.tableZoomLevelAt(m, n, level)
    if (drawn(tree, ad, m, mode, { e: n, level: nl }, keep) === from) dead++
    e = n; level = nl; stops++
  }
  return { dead, skippedChange, stops, e, level }
}
/** Aligned look of a stop (scale, open, drawn layout) for the per-step checks below. */
const look = (tree: L.EventTree, ad: L.CalendarAdapter, m: L.TableZoomModel, s: { e: number; level: L.ZoomLevel }) => drawn(tree, ad, m, "aligned", s) + L.tableZoomView(m, s.e, s.level).scale

test("TS-01: tableCardScale is 1 … 1.2, 1.1 at the reset, linear over E = 6 wheel steps, 3 decimals", () => {
  assert.equal(L.tableCardScale(-Infinity), 1)
  assert.equal(L.tableCardScale(-E), 1)
  assert.equal(L.tableCardScale(-2 * E), 1)
  assert.equal(L.tableCardScale(-E / 2), 1.05)
  assert.equal(L.tableCardScale(0), 1.1)
  assert.equal(L.tableCardScale(E / 2), 1.15)
  assert.equal(L.tableCardScale(E), 1.2)
  assert.equal(L.tableCardScale(Infinity), 1.2)
  assert.equal(L.tableCardScale(W), 1.117)
  assert.ok(Math.abs(E - 6 * Math.log(1.15)) < 1e-12)
})

test("TS-02: tableZoomModel: bounds from tableZoomBounds; eOpen = max(E, eL1) + one step, capped at hi; none when hi ≤ 0", () => {
  const { tree, ad } = viewTree(zoomView(24))
  const b = L.tableZoomBounds(tree, ad, { levels: true }), m = model(tree, ad)
  assert.ok(Math.abs(m.lo - Math.log(b.min / b.fit)) < 1e-12 && Math.abs(m.hi - Math.log(b.max / b.fit)) < 1e-12)
  const eL1 = Math.log(L.ZOOM_POINTS * L.ZOOM_HYSTERESIS / (m.gap! * m.fit))
  assert.ok(Math.abs(m.eOpen - (Math.max(E, eL1) + W)) < 1e-12)
  // Levels off: never open.
  assert.equal(model(tree, ad, false).eOpen, Infinity)
  // hi ≤ 0: two roots 1 h apart on a fixed calendar, fit ≥ 60 / hour → the reset is the top.
  const t2 = treeOf(plan([{ id: "a", at: 0 }, { id: "b", at: 0.2 }, { id: "c", at: 0.4 }]))
  const m2 = model(t2, A)
  assert.ok(m2.hi <= 1e-9, `hi ${m2.hi}`); assert.equal(m2.eOpen, Infinity)
  // Dense (eL1 + one step > hi > 0): open at hi.
  // Roots 1 h apart: fit 40, hi = ln(60 / 40) < E + one step.
  const t3 = treeOf(plan(Array.from({ length: 6 }, (_, i) => ({ id: `r${i}`, at: i }))))
  const m3 = model(t3, A)
  assert.ok(m3.hi > 0 && Math.max(E, Math.log(46 / (m3.gap! * m3.fit))) + W > m3.hi, `dense: hi ${m3.hi}`)
  assert.equal(m3.eOpen, m3.hi)
})

test("TS-03: tableZoomView: levels off is scale 1, level 0, never open; open exactly from eOpen", () => {
  const { tree, ad } = viewTree(zoomView(24))
  const off = model(tree, ad, false)
  assert.deepEqual(L.tableZoomView(off, 2, 3), { level: 0, scale: 1, open: false })
  const m = model(tree, ad)
  assert.equal(L.tableZoomView(m, m.eOpen, 0).open, true)
  assert.equal(L.tableZoomView(m, m.eOpen - 0.01, 0).open, false)
  assert.equal(L.tableZoomView(m, 0, 2).scale, 1.1)
})

for (const mode of ["aligned", "linear"] as const)
  test(`TS-04 (${mode}): from the reset every step up and down changes the look; both ends stop; the first step back changes`, () => {
    const { tree, ad } = viewTree(zoomView(24))
    const m = model(tree, ad)
    const up = walk(m, mode, 1)
    assert.ok(up.stops.at(-1)!.v.open, "the top is all open")
    if (mode === "aligned") {
      for (let i = 1; i < up.stops.length; i++) assert.notEqual(look(tree, ad, m, up.stops[i]), look(tree, ad, m, up.stops[i - 1]), `aligned step ${i} up changes the look`)
      const firstOpen = up.stops.findIndex(s => s.v.open)
      assert.equal(firstOpen, up.stops.length - 1, "aligned: open is the last stop")
      assert.ok(Math.abs(up.e - m.eOpen) < 1e-9)
    } else assert.ok(up.e >= m.eOpen - 1e-9)
    assert.equal(L.tableZoomStep(m, mode, { e: up.e, level: up.level }, 1, W), null, "the top stops")
    const back = L.tableZoomStep(m, mode, { e: up.e, level: up.level }, -1, W)!
    assert.ok(back !== null && back < up.e)
    if (mode === "aligned") assert.equal(L.tableZoomView(m, back, L.tableZoomLevelAt(m, back, up.level)).open, false, "one step back closes")
    const down = walk(m, "aligned", -1)
    for (let i = 1; i < down.stops.length; i++) assert.notEqual(look(tree, ad, m, down.stops[i]), look(tree, ad, m, down.stops[i - 1]), `step ${i} down changes the look`)
    assert.equal(down.stops.at(-1)!.v.scale, 1)
    assert.equal(down.level, 6)
    assert.equal(L.tableZoomStep(m, "aligned", { e: down.e, level: down.level }, -1, W), null, "the floor stops")
    const fwd = L.tableZoomStep(m, "aligned", { e: down.e, level: down.level }, 1, W)
    assert.ok(fwd !== null)
    assert.notEqual(look(tree, ad, m, { e: fwd!, level: L.tableZoomLevelAt(m, fwd!, down.level) }), look(tree, ad, m, down.stops.at(-1)!), "the first step up from the floor changes")
  })

test("TS-04b: below scale 1 the aligned zoom-out steps skip straight to the next level change", () => {
  const { tree, ad } = viewTree(zoomView(24))
  const m = model(tree, ad)
  const down = walk(m, "aligned", -1).stops.filter(s => s.v.scale === 1)
  for (let i = 1; i < down.length; i++) assert.notEqual(down[i].level, down[i - 1].level, `stop ${i} changes the level`)
  assert.ok(down.some((s, i) => i && s.e < down[i - 1].e - 1.5 * W), "at least one step skips")
})

test("TS-05 (P1-1): linear, at level 4 a pair across a hidden event that still stretches is not skipped", () => {
  // 40 一般 roots 1 h apart keep the median gap at 1 h (level 4 at k 2). After them, 关键 roots 20 h apart with a 一般 root
  // between (10 h each side): at level 4 the 一般 hide and the drawn pair k_i–k_i+1 stretches 20·k, while the
  // unfiltered pairs (10·k, and 8·k from the last 一般 to k0) stay ≤ 24 at k 2 → 2.3.
  const evs: Ev[] = []
  for (let i = 0; i < 40; i++) evs.push({ id: `d${i}`, at: i, importance: 1 })
  for (let i = 0; i < 12; i++) { evs.push({ id: `k${i}`, at: 47 + i * 20, importance: 3 }); if (i < 11) evs.push({ id: `n${i}`, at: 57 + i * 20, importance: 1 }) }
  const tree = treeOf(plan(evs)), m = model(tree, A)
  const e = Math.log(2 / m.fit), level = L.tableZoomLevelAt(m, e, 4)
  assert.equal(level, 4, `level at k 2 (d ${(m.gap! * 2).toFixed(2)})`)
  assert.ok(e + W < -E, "the card scale is already 1 here")
  const next = L.tableZoomStep(m, "linear", { e, level }, 1, W)
  assert.ok(next !== null && Math.abs(next - (e + W)) < 1e-9, `one step, not skipped (got ${next === null ? null : ((next - e) / W).toFixed(2)} steps)`)
})

test("TS-06 (P1-1): linear, segments that merge once 一般 events hide are compared on the merged pair", () => {
  // 一般 roots 1 h apart keep the median at 1 h, so a 1000 h hole (over the 720 h break) splits the rail; with them
  // hidden the 关键 roots (median 100 h, limit 2000 h) form one segment and the cross-hole pair (1000 h) stretches.
  const evs: Ev[] = []
  for (let i = 0; i < 20; i++) evs.push({ id: `n${i}`, at: i, importance: 1 })
  for (const [i, at] of [0, 100, 200, 1200, 1300, 1400].entries()) evs.push({ id: `k${i}`, at, importance: 3 })
  const tree = treeOf(plan(evs))
  const shown = L.railSegments(tree.roots.filter(r => r.event.importance >= 2), A).length
  const all = L.railSegments(tree.roots, A).length
  assert.ok(shown < all, `segments merge when 一般 hide (${all} → ${shown})`)
  const m = model(tree, A)
  const pairs = m.pairs[m.levelClass[4]]
  const dts = (a: Float64Array) => [...a].filter((_, i) => i % 5 === 0)
  assert.ok(dts(pairs).some(t => Math.abs(t - 1000) < 1e-9), "the merged cross-hole pair is in the level-4 pairs")
  assert.ok(!dts(m.pairs[m.levelClass[0]]).some(t => Math.abs(t - 1000) < 1e-9), "and not in the unfiltered pairs")
  // Review P3-1: and the step there is not skipped (the real layout changes at every stop and nowhere in between).
  const r = assertStops(tree, A, m, "linear", -1)
  assert.equal(r.skippedChange, 0)
})

test("TS-07: linear, all open is not the top: later steps still change the stretch, then the top stops", () => {
  const { tree, ad } = viewTree(zoomView(24))
  const m = model(tree, ad)
  const up = walk(m, "linear", 1)
  const afterOpen = up.stops.filter(s => s.v.open)
  assert.ok(afterOpen.length >= 2, `linear stops after all open: ${afterOpen.length}`)
  assert.ok(up.e > m.eOpen)
})

test("TS-08: the toolbar step and the wheel step agree on whether a direction still has a change", () => {
  const { tree, ad } = viewTree(zoomView(24))
  const m = model(tree, ad)
  for (const mode of ["aligned", "linear"] as const) {
    const top = walk(m, mode, 1), bottom = walk(m, mode, -1)
    const probes = [0, top.e, bottom.e, ...Array.from({ length: 10 }, (_, i) => bottom.e + (top.e - bottom.e) * (i + 0.5) / 10)]
    for (const e of probes) {
      const level = L.tableZoomLevelAt(m, e, 0)
      for (const dir of [1, -1] as const)
        assert.equal(L.tableZoomStep(m, mode, { e, level }, dir, L.TABLE_BUTTON_STEP) === null, L.tableZoomStep(m, mode, { e, level }, dir, W) === null, `${mode} e ${e.toFixed(3)} dir ${dir}`)
    }
  }
})

test("TS-09: levels off, a step is e + step clamped (docs/601); null at a bound", () => {
  const { tree, ad } = viewTree(zoomView(24))
  const m = model(tree, ad, false)
  assert.ok(Math.abs(L.tableZoomStep(m, "aligned", { e: 0, level: 0 }, 1, W)! - W) < 1e-12)
  assert.equal(L.tableZoomStep(m, "aligned", { e: m.hi, level: 0 }, 1, W), null)
  assert.equal(L.tableZoomStep(m, "aligned", { e: m.lo, level: 0 }, -1, W), null)
})

test("TS-10: a level change that changes nothing in this tree is skipped (no parents: 2 → 3; no 一般: 3 → 4)", () => {
  const leaves = treeOf(plan(Array.from({ length: 24 }, (_, i) => ({ id: `r${i}`, at: i * 720, importance: (i % 3) + 1 }))))
  const m = model(leaves, A)
  const down = walk(m, "aligned", -1).stops
  assert.ok(!down.some((s, i) => i && s.level === 3 && s.v.scale === down[i - 1].v.scale), "no stop for level 3 without parents")
  const noNormal = treeOf(plan(Array.from({ length: 24 }, (_, i) => ({ id: `r${i}`, at: i * 720, importance: (i % 2) + 2 }))))
  const m2 = model(noNormal, A)
  // Once the scale is 1 only level changes remain; 2, 3 and 4 change nothing here, so no such stop.
  const d2 = walk(m2, "aligned", -1).stops
  const levelOnly = d2.filter((s, i) => i && s.v.scale === 1 && d2[i - 1].v.scale === 1)
  assert.deepEqual(levelOnly.map(s => s.level), [5, 6], `stops: ${d2.map(s => `${s.level}@${s.v.scale}`)}`)
})

test("TS-11: zoomLevel is idempotent from every starting level", () => {
  for (let p = 0; p <= 6; p++)
    for (let i = 0; i < 400; i++) {
      const d = 0.05 * Math.pow(10000, i / 399), once = L.zoomLevel(d, p as L.ZoomLevel)
      assert.equal(L.zoomLevel(d, once), once, `d ${d} from ${p}`)
    }
})

test("TS-12: tableLayout at scale 1.2: collapsed heights and heads × 1.2; open cards and points not; widths in scaled px; slack +3 with a plan", () => {
  const t = treeOf(plan([{ id: "a", at: 0 }, { id: "s", at: 300, dur: 48 }, { id: "s1", at: 310, parent: "s" },
    { id: "g", at: 600, dur: 48 }, { id: "g1", at: 610, parent: "g" }, { id: "o", at: 900 }, { id: "p", at: 1200 }]))
  const widths = L.tableWidths(900, false)
  const lay = L.tableLayout(t, { o: 150 }, 0, A, { plan: { points: new Set(["p"]), hidden: new Set(), scale: 1.2 }, folded: new Set(["s"]), expanded: new Set(["o"]), widths })
  const a = lay.byId.get("a")!, s = lay.byId.get("s")!, g = lay.byId.get("g")!, o = lay.byId.get("o")!, p = lay.byId.get("p")!
  const near = (x: number, y: number) => Math.abs(x - y) < 1e-9
  assert.ok(near(a.height, 34 * 1.2) && near(a.head - a.top, 17 * 1.2) && a.zoom === 1.2)
  assert.ok(near(s.height, 48 * 1.2) && near(s.head - s.top, 20 * 1.2))
  assert.ok(near(g.height, 36 * 1.2) && near(g.head - g.top, 18 * 1.2))
  assert.equal(o.height, 150); assert.equal(o.zoom, 1)
  assert.equal(p.height, L.POINT_HEIGHT); assert.equal(p.zoom, 1)
  assert.ok(near(g.width * 1.2, widths.group(0)), "a group head fills its box on screen")
  assert.ok(a.width >= 220 && a.width <= widths.slot(0) / 1.2)
  // Slack: a title whose own width passes 220 is 3px wider with a plan than without (scale 1).
  const long = treeOf(plan([{ id: "x".repeat(40), at: 0 }]))
  const w0 = L.tableLayout(long, {}, 0, A, { widths }).cards[0].width
  const w1 = L.tableLayout(long, {}, 0, A, { widths, plan: { points: new Set(), hidden: new Set(), scale: 1 } }).cards[0].width
  assert.equal(w1 - w0, 3)
})

test("TS-13: a step on the F885 tree takes under 5 ms (median of 50); both directions at the top under 10 ms", () => {
  const { tree, ad } = viewTree(f885())
  const m = model(tree, ad)
  for (const mode of ["aligned", "linear"] as const) {
    const t: number[] = []
    for (let i = 0; i < 50; i++) { const s = performance.now(); L.tableZoomStep(m, mode, { e: 0, level: L.tableZoomLevelAt(m, 0, 0) }, i % 2 ? 1 : -1, W); t.push(performance.now() - s) }
    t.sort((x, y) => x - y)
    assert.ok(t[25] < 5, `${mode} median ${t[25].toFixed(2)} ms`)
    const top = walk(m, mode, 1)
    const s = performance.now()
    L.tableZoomStep(m, mode, { e: top.e, level: top.level }, 1, W); L.tableZoomStep(m, mode, { e: top.e, level: top.level }, -1, W)
    assert.ok(performance.now() - s < 10, `${mode} at the top`)
  }
})

/* docs/602 §12 (code review P1-1, P2-1, P2-2): the model follows what zoomPlan draws, folds and kept cards included. */
for (const mode of ["aligned", "linear"] as const)
  for (const dir of [1, -1] as const)
    test(`TS-14 (${mode}, ${dir > 0 ? "in" : "out"}): on zoomView, F885 and the review shapes every stop changes the real layout and no skipped position does`, () => {
      // fold2: 60 roots 1 h apart and a parent with 6 children 30 h apart (dense roots, a wide family).
      const fold2: Ev[] = [...Array.from({ length: 60 }, (_, i) => ({ id: `r${i}`, at: i, importance: (i % 3) + 1 })), { id: "p", at: 70, dur: 200, importance: 2 },
        ...Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, at: 70 + i * 30, parent: "p", importance: 1 }))]
      // kids: roots 重要 / 关键 only, every 一般 event is a phase child.
      const kids: Ev[] = Array.from({ length: 24 }, (_, i) => ({ id: `r${i}`, at: i * 720, importance: (i % 2) + 2, dur: i % 4 ? 0 : 192 }))
        .flatMap(r => [r, ...(r.dur ? [0, 1, 2].map(k => ({ id: `${r.id}c${k}`, at: r.at! + (k + 1) * 48, parent: r.id, importance: 1 })) : [])])
      // keep: 40 一般 roots, 关键 k0 / k1 with a 一般 root s between them, s selected.
      const keep: Ev[] = [...Array.from({ length: 40 }, (_, i) => ({ id: `n${i}`, at: i, importance: 1 })), { id: "k0", at: 100, importance: 3 }, { id: "s", at: 250, importance: 1 }, { id: "k1", at: 300, importance: 3 }]
      const cases: [string, L.EventTree, L.CalendarAdapter, Keep][] = [
        ["zoomView", ...(Object.values(viewTree(zoomView(24))) as [L.EventTree, L.CalendarAdapter]), {}],
        ["F885", ...(Object.values(viewTree(f885())) as [L.EventTree, L.CalendarAdapter]), {}],
        ["fold2", treeOf(plan(fold2)), A, {}],
        ["fold2 user-folded", treeOf(plan(fold2)), A, { folded: new Set(["p"]) }],
        ["kids", treeOf(plan(kids)), A, {}],
        ["keep (s selected)", treeOf(plan(keep)), A, { cards: new Set(["s"]) }],
      ]
      for (const [name, tree, ad, k] of cases) {
        const m = model(tree, ad, true, k)
        const r = assertStops(tree, ad, m, mode, dir, k)
        assert.equal(r.skippedChange, 0, `${name}: a skipped position changed the layout`)
        // Open cards in the model are 3/4 of the estimate; measured 120 px cards may leave a dead step after all-open
        // in linear mode (review P3-1, the safe direction). Everywhere else none.
        assert.ok(r.dead <= (mode === "linear" && dir > 0 ? 3 : 0), `${name}: ${r.dead} dead steps of ${r.stops}`)
      }
    })
