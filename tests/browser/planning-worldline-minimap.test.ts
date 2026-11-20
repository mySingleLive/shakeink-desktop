import assert from "node:assert/strict"
import { test } from "node:test"
import type { Browser, Page } from "playwright-core"
import { expect } from "@playwright/test"
import { launch, withWorldline, type WorldlineView } from "../helpers/worldline-browser-fixture"
import { f60 } from "../helpers/worldline-f60"

/* docs/595 MM-B1: the minimap with 30 rail segments (a long family in segment 2). Synthetic data on the in-memory
 * fixture API, not a real-target proof. */
let browser: Browser
test.before(async () => { browser = await launch() })
test.after(async () => { await browser?.close() })

const Y = 8640
/** 30 segments 2000 years apart, 1 … 20 roots one year apart; root s2k0 lasts 45,000 years. */
function mm30(): WorldlineView {
  const events: Record<string, unknown>[] = []
  for (let i = 0; i < 30; i++) {
    const c = 1 + ((i * 7) % 20)
    for (let k = 0; k < c; k++) events.push({ id: `s${i}k${k}`, line: "w", parent: null, title: `段${i + 1}事件${k + 1}`, fact: "", category: "其他", importance: 1, people: [],
      duration: i === 2 && k === 0 ? 45000 * Y : 0, time: { kind: "exact", value: (i * 2000 + k) * Y, precision: "year" } })
  }
  return { version: 1, characters: [], materials: [], readonly: false, history: [], proposals: [], data: { schemaVersion: 1,
    worlds: [{ id: "w", name: "主世界线", calendar: { kind: "fixed", epoch: "新历元年", hoursPerDay: 24, daysPerMonth: 30, monthsPerYear: 12 } }],
    events, periods: [], lines: [], cards: [], volumes: [], chapters: [], connections: [] } }
}
const frames = (page: Page, n = 3) => page.evaluate(n => new Promise<void>(r => { const f = (k: number) => k ? requestAnimationFrame(() => f(k - 1)) : r(); f(n) }), n)
const openTimeline = async (page: Page) => { await page.evaluate("globalThis.__name = f => f"); await page.getByRole("tab", { name: "时间线" }).click(); await page.locator("[data-minimap]").waitFor(); await frames(page) }
/** Segment boxes and marks in minimap px; the marks are in root order (sorted by start). */
const read = (page: Page) => page.evaluate(() => {
  const m = document.querySelector<HTMLElement>("[data-minimap]")!
  return { width: m.getBoundingClientRect().width, segs: [...m.querySelectorAll<HTMLElement>("u")].map(u => [parseFloat(u.style.left), parseFloat(u.style.width)]), marks: [...m.querySelectorAll<HTMLElement>("i")].map(i => parseFloat(i.style.left)) }
})
const counts = Array.from({ length: 30 }, (_, i) => 1 + ((i * 7) % 20))

for (const width of [1440, 820])
  test(`MM-B1 (${width}px): every mark is drawn in its own segment box; a click or a frame drag on segment k shows k's events`, () => withWorldline(browser, mm30(), async page => {
    await openTimeline(page)
    const r = await read(page)
    assert.equal(r.segs.length, 30)
    assert.equal(r.marks.length, counts.reduce((a, b) => a + b, 0))
    let m = 0
    counts.forEach((c, i) => { const [x0, w] = r.segs[i]; for (let k = 0; k < c; k++, m++) assert.ok(r.marks[m] >= x0 - 0.5 && r.marks[m] <= x0 + w + 0.5, `mark s${i}k${k} at ${r.marks[m]} outside seg ${i} [${x0}, ${x0 + w}]`) })
    const slots = new Set(r.marks.map(x => Math.floor(x / 2))).size
    assert.ok(slots >= 60, `2px slots used: ${slots}`)
    const box = (await page.locator("[data-minimap]").boundingBox())!
    // The first view fits all 58,000 years; zoom in (wheel over the lane) until the window is under 1500 years.
    const lane = (await page.locator("[data-timeline-lane]").boundingBox())!
    const view = () => page.evaluate(() => { const t = document.querySelector("[data-timeline]")!; return { start: Number(t.getAttribute("data-view-start")), span: Number(t.getAttribute("data-view-span")) } })
    await page.mouse.move(lane.x + lane.width / 2, lane.y + 60)
    for (let i = 0; i < 60 && (await view()).span > 1500 * Y; i++) { await page.mouse.wheel(0, -100); await frames(page, 2) }
    assert.ok((await view()).span <= 1500 * Y)
    // Segment k's roots start at k × 2000 years; the window must hold some of them.
    const inView = async (seg: number) => { const v = await view(), c = counts[seg]; return Array.from({ length: c }, (_, k) => (seg * 2000 + k) * Y).some(t => t >= v.start && t <= v.start + v.span) }
    for (const k of [5, 17, 28]) {
      const [x0, w] = r.segs[k]
      await page.mouse.click(box.x + x0 + w / 2, box.y + box.height / 2); await frames(page, 4)
      assert.ok(await inView(k), `click on segment ${k}`)
    }
    // Drag the frame by its left edge onto the start of segment 12 (20 roots over 19 years); the window then starts there.
    await page.mouse.click(box.x + r.segs[3][0] + r.segs[3][1] / 2, box.y + box.height / 2); await frames(page, 4)
    const frame = (await page.locator("[data-minimap] b").boundingBox())!, [x12] = r.segs[12]
    assert.ok(counts[12] >= 5)
    await page.mouse.move(frame.x + 1, box.y + box.height / 2); await page.mouse.down()
    await page.mouse.move(box.x + x12 + 1, box.y + box.height / 2, { steps: 6 }); await page.mouse.up(); await frames(page, 4)
    assert.ok(await inView(12), "drag onto segment 12")
  }, { width }))

/* docs/596 MM-B2 … MM-B8: the minimap moves the view up, down, left and right; it is 120px high. Fixtures F60 (with
 * character changes for MM-B3), mm30; in-memory API, not a real-target proof. */
const MH = 90, MTOP = 8
/** F60 with character changes on three placed roots, so there are change rows under the families (WU-57). */
function withChanges(): WorldlineView {
  const v = f60(), d = v.data as any
  d.events.filter((e: any) => e.time.kind === "exact" && e.parent === null && e.time.value > 0).slice(5, 8)
    .forEach((e: any, i: number) => { e.changes = [{ id: `ch${i}`, character: "c-allen", dimension: "身份", before: `旧${i}`, after: `新${i}`, at: "end" }] })
  return v
}
const state = (page: Page) => page.evaluate(() => {
  const t = document.querySelector<HTMLElement>("[data-timeline]")!, m = document.querySelector<HTMLElement>("[data-minimap]")!
  const lane = document.querySelector<HTMLElement>("[data-timeline-lane]")!, f = m.querySelector<HTMLElement>("b")!
  return { start: Number(t.dataset.viewStart), span: Number(t.dataset.viewSpan), y: Number(t.dataset.viewY), laneH: lane.clientHeight, laneW: lane.clientWidth - 28,
    H: Number(m.dataset.contentHeight), frameTop: parseFloat(f.style.top), frameH: parseFloat(f.style.height), now: m.getAttribute("aria-valuenow") }
})
const mbox = async (page: Page) => (await page.locator("[data-minimap]").boundingBox())!
/** Zoom the canvas in (wheel over the lane) until the window spans at most `max` hours. */
async function zoomIn(page: Page, max: number) {
  const l = (await page.locator("[data-timeline-lane]").boundingBox())!
  await page.mouse.move(l.x + l.width / 2, l.y + 60)
  for (let i = 0; i < 80 && (await state(page)).span > max; i++) { await page.mouse.wheel(0, -100); await frames(page, 2) }
}
/** Move the canvas vertically with ⌘ + wheel (docs/584). */
async function panY(page: Page, dy: number) {
  const l = (await page.locator("[data-timeline-lane]").boundingBox())!
  await page.mouse.move(l.x + l.width / 2, l.y + l.height / 2)
  await page.keyboard.down("Meta"); await page.mouse.wheel(0, dy); await page.keyboard.up("Meta"); await frames(page, 3)
}

test("MM-B2: the minimap is 120px high; packed roots sit at their card's height, roots outside the build range in the bottom row", () => withWorldline(browser, f60(), async page => {
  await openTimeline(page)
  const b = await mbox(page)
  assert.ok(Math.abs(b.height - 120) <= 1, `height ${b.height}`)
  const pairs = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-minimap] i[data-mini-row='packed']")].map(i => {
    const card = document.querySelector<HTMLElement>(`[data-timeline-plane] [data-event="${i.dataset.miniRoot}"]`)
    return card ? [parseFloat(card.style.top), parseFloat(i.style.top)] : null
  }).filter((x): x is number[] => !!x))
  assert.ok(pairs.length >= 5, `packed marks with a card: ${pairs.length}`)
  pairs.sort((a, b) => a[0] - b[0])
  for (let i = 1; i < pairs.length; i++) assert.ok(pairs[i][1] >= pairs[i - 1][1] - 1e-6, `mini top follows card top: ${JSON.stringify(pairs)}`)
  // Zoomed in, the two ancient roots (~200,000 years back) are outside the build range: bottom row.
  await zoomIn(page, 24 * 30 * 12 * 50)
  const rows = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-minimap] i[data-mini-root]")].map(i => [i.dataset.miniRow, parseFloat(i.style.top)] as const))
  const out = rows.filter(r => r[0] === "out")
  assert.ok(out.length >= 2, `bottom-row marks: ${out.length}`)
  for (const r of out) assert.ok(r[1] >= MTOP + MH, `bottom row top ${r[1]}`)
}))

test("MM-B3: character change rows count in the content height; panned down to them, the frame sits on their band", () => withWorldline(browser, withChanges(), async page => {
  await openTimeline(page)
  const band = page.locator("[data-minimap] [data-mini-lanes]")
  await expect(band).toHaveCount(1)
  const laneTop = await page.getByRole("group", { name: "艾伦变化轨道" }).evaluate(e => parseFloat((e as HTMLElement).style.top))
  const s0 = await state(page)
  assert.ok(s0.H > laneTop, `content height ${s0.H} covers the change rows at ${laneTop}`)
  // Bring the change rows to the top of the lane: y = −(laneTop − 20).
  await panY(page, laneTop - 20 + s0.y)
  const s1 = await state(page), bandTop = await band.evaluate(e => parseFloat((e as HTMLElement).style.top))
  // The frame is held inside the drawing area (code review P3-3): top = min(MTOP + MH − frameH, MTOP + −y / H × MH).
  assert.ok(Math.abs(s1.frameTop - Math.min(MTOP + MH - s1.frameH, Math.max(MTOP, MTOP + (-s1.y / s1.H) * MH))) <= 1, `frame top ${s1.frameTop}`)
  // The band lies inside the frame (the frame may be held at the bottom of the drawing area).
  assert.ok(bandTop >= s1.frameTop - 1 && bandTop <= s1.frameTop + s1.frameH + 1, `band ${bandTop} inside the frame ${s1.frameTop} + ${s1.frameH}`)
}))

test("MM-B4: a click outside the frame centres the view there, in time and in height", () => withWorldline(browser, withChanges(), async page => {
  await openTimeline(page)
  // Jump to the dense 1348–1349 stretch (the widest segment) and zoom to 20 days in a short lane: the frame is small
  // and linear in x there, and the content (families plus the change rows) is taller than the lane.
  await page.setViewportSize({ width: 1440, height: 560 }); await frames(page, 4)
  const seg = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-minimap] u")].map(u => [parseFloat(u.style.left), parseFloat(u.style.width)]).sort((x, y) => y[1] - x[1])[0])
  await zoomIn(page, 24 * 20)
  let b = await mbox(page)
  await page.mouse.click(b.x + seg[0] + 0.3 * seg[1], b.y + MTOP + 4); await frames(page, 4)
  await page.mouse.move(5, 5); await frames(page, 4)
  const s = await state(page)
  assert.ok(s.H > s.laneH, `content ${s.H} taller than the lane ${s.laneH}`)
  const fl = await page.evaluate(() => { const f = document.querySelector<HTMLElement>("[data-minimap] b")!; return [parseFloat(f.style.left), parseFloat(f.style.width)] })
  assert.ok(fl[0] >= seg[0] && fl[0] + fl[1] <= seg[0] + seg[1], `frame ${fl} inside the widest segment ${seg}`)
  // Inside the build range [start − 3·span, start + 4·span] (the layout the vertical axis describes stays, docs/596
  // §2.3): 1½ frame widths right of the frame's middle. Here the frame is ~110px wide (20 days of the dense segment).
  assert.ok(fl[1] > 20 && fl[1] < 140, `frame width ${fl[1]}`)
  const px = fl[0] + fl[1] / 2 + 1.5 * fl[1]
  assert.ok(px < seg[0] + seg[1] - fl[1] / 2, `spot ${px} inside the segment`)
  b = await mbox(page)
  const py = MTOP + 0.85 * MH
  await page.mouse.click(b.x + px, b.y + py); await frames(page, 4)
  const a = await state(page)
  // The target height uses the content height at the press.
  const want = 0.85 * s.H, centre = -a.y + s.laneH / 2, edge = Math.abs(-a.y - (s.H - s.laneH)) <= 1
  assert.ok(Math.abs(centre - want) <= (s.H / MH) * 2 || edge, `centre ${centre} vs ${want}`)
  assert.notEqual(a.y, s.y, "y moved")
  const f = await page.evaluate(() => { const f = document.querySelector<HTMLElement>("[data-minimap] b")!; return parseFloat(f.style.left) + parseFloat(f.style.width) / 2 })
  assert.ok(Math.abs(f - px) <= 1.5, `frame middle ${f} vs click ${px}`)
}))

test("MM-B4b: when the content fits in one screen, a click low on the minimap keeps y", () => withWorldline(browser, f60(), async page => {
  await openTimeline(page)
  await zoomIn(page, 24 * 30 * 12 * 6)
  const s = await state(page)
  assert.ok(s.H <= s.laneH, `content ${s.H} fits the lane ${s.laneH}`)
  const b = await mbox(page)
  await page.mouse.click(b.x + 20, b.y + MTOP + 0.85 * MH); await frames(page, 4)
  assert.equal((await state(page)).y, s.y)
}))

/** withChanges, a 560px-high window, zoomed to 20 days in the dense 1348–1349 segment: the content is taller than the
 * lane (families plus the change rows), so vertical moves are not swallowed by the limit (code review P2-2). */
async function tallView(page: Page) {
  await openTimeline(page)
  await page.setViewportSize({ width: 1440, height: 560 }); await frames(page, 4)
  await zoomIn(page, 24 * 20)
  const seg = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-minimap] u")].map(u => [parseFloat(u.style.left), parseFloat(u.style.width)]).sort((x, y) => y[1] - x[1])[0])
  const b = await mbox(page)
  await page.mouse.click(b.x + seg[0] + 0.3 * seg[1], b.y + MTOP + 4); await frames(page, 4)
  await page.mouse.move(5, 5); await frames(page, 4)
  return state(page)
}

test("MM-B4c: a click outside the build range (a far time) keeps y", () => withWorldline(browser, withChanges(), async page => {
  const s = await tallView(page)
  // Move down first so a kept y is not 0 by chance.
  await page.getByRole("slider", { name: /全局缩略/ }).focus(); await page.keyboard.press("ArrowDown"); await frames(page, 2)
  const s1 = await state(page)
  assert.ok(s1.y < s.y, "moved down")
  const b = await mbox(page)
  await page.mouse.click(b.x + 4, b.y + MTOP + 0.8 * MH); await frames(page, 4)
  const a = await state(page)
  assert.ok(a.start < s1.start - 100 * s1.span, "jumped far back in time")
  assert.equal(a.y, s1.y, "y kept")
}))

test("MM-B5: dragging the frame by (+40, +20) moves it 40px right and y by 20 × H / 90; a press alone keeps y", () => withWorldline(browser, withChanges(), async page => {
  const s0 = await tallView(page)
  assert.ok(s0.H - s0.laneH > (20 * s0.H) / MH - s0.y, `room to move down: H ${s0.H}, lane ${s0.laneH}, y ${s0.y}`)
  const fr = (await page.locator("[data-minimap] b").boundingBox())!, fl0 = await page.locator("[data-minimap] b").evaluate(e => parseFloat((e as HTMLElement).style.left))
  const x0 = fr.x + Math.min(fr.width / 2, 20), y0 = fr.y + Math.min(fr.height / 2, 4)
  await page.mouse.move(x0, y0); await page.mouse.down(); await frames(page, 2)
  assert.equal((await state(page)).y, s0.y, "press keeps y")
  await page.mouse.move(x0 + 40, y0 + 20, { steps: 6 }); await frames(page, 2)
  const s1 = await state(page), fl1 = await page.locator("[data-minimap] b").evaluate(e => parseFloat((e as HTMLElement).style.left))
  await page.mouse.up()
  assert.ok(Math.abs(s1.y - (s0.y - (20 * s0.H) / MH)) <= 1, `y ${s0.y} → ${s1.y}, want ${s0.y - (20 * s0.H) / MH}`)
  assert.ok(Math.abs(fl1 - fl0 - 40) <= 1, `frame left ${fl0} → ${fl1}`)
}))

test("MM-B6: with the minimap focused, ↓ twice moves the view down by half a lane; aria-valuenow is unchanged; ← → still pan", () => withWorldline(browser, withChanges(), async page => {
  const s0 = await tallView(page)
  assert.ok(s0.H - s0.laneH >= s0.laneH / 2 - s0.y, "room for half a lane")
  const mm = page.getByRole("slider", { name: /全局缩略/ })
  await mm.focus()
  await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowDown"); await frames(page, 2)
  const s1 = await state(page)
  assert.ok(Math.abs(s1.y - (s0.y - s0.laneH / 2)) <= 1, `y ${s0.y} → ${s1.y}`)
  assert.equal(s1.now, s0.now)
  await page.keyboard.press("ArrowUp"); await frames(page, 2)
  assert.ok(Math.abs((await state(page)).y - (s0.y - s0.laneH / 4)) <= 1, "↑ moves back a quarter")
  await page.keyboard.press("ArrowRight"); await expect.poll(async () => (await state(page)).now).not.toBe(s0.now)
}))

test("MM-B7: Esc during a minimap drag puts start and y back", () => withWorldline(browser, withChanges(), async page => {
  const s0 = await tallView(page)
  const fr = (await page.locator("[data-minimap] b").boundingBox())!
  await page.mouse.move(fr.x + Math.min(fr.width / 2, 20), fr.y + 3); await page.mouse.down()
  await page.mouse.move(fr.x + Math.min(fr.width / 2, 20) + 30, fr.y + 15, { steps: 5 }); await frames(page, 2)
  const mid = await state(page)
  assert.ok(mid.start !== s0.start && mid.y !== s0.y, `the drag moved both: ${JSON.stringify([s0.y, mid.y])}`)
  await page.keyboard.press("Escape"); await page.mouse.up(); await frames(page, 2)
  const s1 = await state(page)
  assert.equal(s1.start, s0.start); assert.equal(s1.y, s0.y)
}))

test("MM-B9: an editor opened on a card above the minimap keeps its save button clear of the minimap", () => withWorldline(browser, f60(), async page => {
  await openTimeline(page)
  await page.setViewportSize({ width: 1440, height: 640 }); await frames(page, 4)
  const mm = await mbox(page)
  // The lowest card that overlaps the minimap in x and whose title is fully visible above it (so it can be clicked).
  const id = await page.evaluate(m => {
    const lane = document.querySelector("[data-timeline-lane]")!.getBoundingClientRect()
    let best: { id: string; y: number } | null = null
    for (const c of document.querySelectorAll<HTMLElement>("[data-timeline-plane] [data-event-card]")) {
      const r = c.getBoundingClientRect(), t = c.querySelector("h3")?.getBoundingClientRect()
      if (!t || r.right < m.x || r.left > m.x + m.width || t.top < lane.top + 4 || t.bottom > m.y - 4) continue
      if (!best || r.y > best.y) best = { id: c.dataset.eventId!, y: r.y }
    }
    return best?.id ?? null
  }, mm)
  assert.ok(id, "a clickable card overlaps the minimap in x")
  await page.locator(`[data-timeline-plane] [data-event-card][data-event-id="${id}"] h3`).dblclick()
  const save = page.getByRole("button", { name: "保存事件", exact: true })
  await expect(save).toBeVisible(); await page.waitForTimeout(200)
  const r = (await save.boundingBox())!
  assert.ok(r.y + r.height <= mm.y + 1 || r.x > mm.x + mm.width || r.x + r.width < mm.x, `save ${JSON.stringify(r)} under the minimap ${JSON.stringify(mm)}`)
}))

test("MM-B8: clicking the centre of a 4px one-root segment brings that root into the window", () => withWorldline(browser, mm30(), async page => {
  await openTimeline(page)
  const r = await read(page)
  const k = counts.findIndex((c, i) => c === 1 && i > 0 && i < 29)
  assert.ok(k > 0 && r.segs[k][1] <= 4.5, `one-root segment ${k} width ${r.segs[k]?.[1]}`)
  const lane = (await page.locator("[data-timeline-lane]").boundingBox())!
  await page.mouse.move(lane.x + lane.width / 2, lane.y + 60)
  for (let i = 0; i < 60 && (await state(page)).span > 1500 * Y; i++) { await page.mouse.wheel(0, -100); await frames(page, 2) }
  const b = await mbox(page)
  await page.mouse.click(b.x + r.segs[k][0] + r.segs[k][1] / 2, b.y + b.height / 2); await frames(page, 4)
  const v = await state(page), t = k * 2000 * Y
  assert.ok(t >= v.start && t <= v.start + v.span, `root of segment ${k} at ${t / Y}y in [${v.start / Y}, ${(v.start + v.span) / Y}]`)
}))
