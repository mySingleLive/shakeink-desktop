/* docs/600 §14.2 TZ-02: the event-table layout projection that must stay identical when no zoom option is given.
 * tests/fixtures/table-layout-600-before.json was written from this projection on 9dca205 (before docs/600). */
import { zoomView } from "./worldline-zoom"
import { f885 } from "./worldline-f885"
import * as L from "../../src/lib/planning/worldline-layout"

const r = (x: number) => Math.round(x * 100) / 100
export function tableLayoutProjection(): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [name, v, world] of [["zoomView24", zoomView(24), "w"], ["f885", f885(), null]] as const) {
    const data = (v as any).data, w = world ?? data.worlds[0].id
    const ad = L.adapterFor(data, w, null as any)
    const tree = L.eventTree(data.events.filter((e: any) => e.line === w), data)
    const b = L.tableZoomBounds(tree, ad)
    for (const [tag, k] of [["fit", b.fit], ["x4", b.fit * 4], ["zero", 0]] as const) {
      const lay = L.tableLayout(tree, {}, k, ad, { widths: L.tableWidths(900, false) })
      out[`${name}:${tag}`] = {
        height: r(lay.height),
        cards: lay.cards.map(c => [c.id, r(c.top), r(c.height), c.left, r(c.head), c.lines, c.stacked ? 1 : 0, c.groupHead ? 1 : 0, c.expanded ? 1 : 0, c.segment]),
        groups: lay.groups.map(g => [g.id, r(g.top), r(g.bottom), g.left]),
        breaks: lay.breaks.map(b => [b.kind, r(b.top), b.from, b.to]),
        segments: lay.segments.map(s => [s.index, r(s.y0), r(s.y1), s.heads.length]),
      }
    }
  }
  return out
}
