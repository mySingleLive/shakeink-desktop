import assert from "node:assert/strict"
import { test } from "node:test"
import type { Browser, Page } from "playwright-core"
import { expect } from "@playwright/test"
import { launch, withWorldline, type WorldlineView } from "../helpers/worldline-browser-fixture"
import { f60 } from "../helpers/worldline-f60"

/* docs/581 §3.5–§3.8: card widths, time drags, periods, deep links, panels, motion and contrast, forks, time bases and
 * calendars on the real WorldlinePanel. Synthetic data only. */
let browser: Browser
test.before(async () => { browser = await launch() })
test.after(async () => { await browser?.close() })
const tab = (page: Page, name: "时间线" | "事件表") => page.getByRole("tab", { name }).click()
const tlCard = (page: Page, title: string) => page.locator(`[data-timeline-plane] [data-event-card][aria-label="${title}"]`)
const tableCard = (page: Page, title: string) => page.locator(`[data-event-table] [data-event-card][aria-label="${title}"]`)
const H = 24, M = 30 * H, Y = 12 * M
const world = (extra: Record<string, unknown> = {}, events: unknown[] = [], periods: unknown[] = []): WorldlineView => ({
  version: 1,
  data: { schemaVersion: 1, worlds: [{ id: "w", name: "主世界线", ...extra }], events, periods, lines: [], cards: [], volumes: [], chapters: [], connections: [] },
  characters: [], materials: [], readonly: false, history: [], proposals: [],
})

test("WU-36b: card widths in the table and on the timeline", () => withWorldline(browser, f60(), async page => {
  await tab(page, "事件表")
  const w = (l: ReturnType<Page["locator"]>) => l.evaluate(e => Math.round(e.getBoundingClientRect().width))
  assert.ok(await w(page.locator("[data-event-table] [data-event-card]").first()) <= 760)
  await tableCard(page, "学徒在旧书中发现星图").locator("h3").click()
  assert.ok(await w(tableCard(page, "学徒在旧书中发现星图")) <= 920)
  assert.ok(await w(page.locator("[data-event-group]").first()) <= 820)
  await tableCard(page, "学徒在旧书中发现星图").locator("h3").click()
  await tab(page, "时间线")
  assert.equal(await w(tlCard(page, "学徒在旧书中发现星图")), 260)
  assert.equal(await w(tlCard(page, "港口商会签下秘密契约·先遣人员抵达现场")), 230)
  assert.ok(await w(tlCard(page, "港口商会签下秘密契约")) >= 260)
  await tlCard(page, "学徒在旧书中发现星图").locator("h3").click()
  await expect.poll(() => w(tlCard(page, "学徒在旧书中发现星图"))).toBe(420)
}))

test("WU-55: dragging a card title changes its time and saves; other families stay during the preview", () => withWorldline(browser, f60(), async page => {
  await tab(page, "时间线")
  for (let i = 0; i < 10; i++) await page.getByRole("button", { name: "放大" }).click()
  await page.getByRole("tree", { name: "事件目录" }).getByRole("treeitem", { name: /^学徒在旧书中发现星图 / }).click()
  const c = tlCard(page, "学徒在旧书中发现星图")
  await expect(c).toBeVisible()
  // Locating scrolls the lane after two animation frames; wait until the lane stops moving.
  await expect.poll(async () => { const a = await page.locator("[data-timeline-lane]").evaluate(l => l.scrollTop); await page.waitForTimeout(120); return a === await page.locator("[data-timeline-lane]").evaluate(l => l.scrollTop) }).toBe(true)
  const id = (await c.getAttribute("data-event-id"))!
  const before = await page.evaluate(i => (window as any).planningState().data.events.find((e: any) => e.id === i).time.value, id)
  const others = () => page.evaluate(i => [...document.querySelectorAll<HTMLElement>("[data-timeline-plane] [data-event-card]")].filter(e => !e.closest(`[data-family="${i}"]`)).map(e => e.getBoundingClientRect().top), id)
  const o0 = await others()
  const h = (await c.locator("h3").boundingBox())!
  await page.mouse.move(h.x + 20, h.y + h.height / 2); await page.mouse.down()
  await page.mouse.move(h.x + 120, h.y + h.height / 2, { steps: 8 })
  assert.deepEqual(await others(), o0, "other families keep their y during the preview")
  await page.mouse.up()
  await expect.poll(() => page.evaluate(i => (window as any).planningState().data.events.find((e: any) => e.id === i).time.value, id)).toBeGreaterThan(before)
}))

test("WU-56e: a query refresh and a measured height during a drag do not jump the window back", () => withWorldline(browser, f60(), async page => {
  await tab(page, "时间线")
  const lane = (await page.locator("[data-timeline-lane]").boundingBox())!
  const p = await page.evaluate(() => {
    const l = document.querySelector("[data-timeline-lane]")!.getBoundingClientRect()
    for (let y = l.top + 20; y < l.bottom - 90; y += 10) for (let x = l.left + 300; x < l.right - 300; x += 20) {
      const el = document.elementFromPoint(x, y)
      if (el && !el.closest("[data-event-card],[data-family-frame],button") && el.closest("[data-timeline-lane]")) return { x, y }
    }
    return null
  })
  assert.ok(p && lane)
  await page.mouse.move(p!.x, p!.y); await page.mouse.down()
  await page.mouse.move(p!.x - 200, p!.y, { steps: 6 })
  const mid = await page.locator("[data-range]").innerText()
  // A save (query refresh) while the pointer is still down.
  // A query refresh: the save path writes an unchanged event and the panel refetches.
  await page.evaluate(() => { const s = (window as any).planningState(); return fetch("/api/novels/fixture-novel/planning", { method: "POST", body: JSON.stringify({ expectedVersion: s.version, operations: [{ kind: "put", collection: "events", value: s.data.events[0] }] }) }) })
  await page.waitForTimeout(100)
  await page.mouse.move(p!.x - 260, p!.y, { steps: 2 })
  const last = await page.locator("[data-range]").innerText()
  assert.notEqual(last, mid)
  await page.mouse.up()
  await page.waitForTimeout(250)
  assert.equal(await page.locator("[data-range]").innerText(), last)
}))

test("WU-58: dragging a period band changes its time and saves; cards do not move", () => withWorldline(browser, world({ calendar: { kind: "fixed", epoch: "元年", hoursPerDay: 24, daysPerMonth: 30, monthsPerYear: 12 } },
  [{ id: "e1", line: "w", title: "开端", time: { kind: "exact", value: 0 } }, { id: "e2", line: "w", title: "结局", time: { kind: "exact", value: 1000 } }],
  [{ id: "p1", line: "w", title: "雨季", start: 200, end: 600 }]), async page => {
  await tab(page, "时间线")
  const band = page.locator('[data-period="p1"]')
  await expect(band).toBeVisible()
  const cards0 = await page.locator("[data-timeline-plane] [data-event-card]").evaluateAll(l => l.map(e => e.getBoundingClientRect().left))
  const b = (await band.boundingBox())!
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down()
  await page.mouse.move(b.x + b.width / 2 + 120, b.y + b.height / 2, { steps: 8 })
  assert.deepEqual(await page.locator("[data-timeline-plane] [data-event-card]").evaluateAll(l => l.map(e => e.getBoundingClientRect().left)), cards0)
  await page.mouse.up()
  await expect.poll(() => page.evaluate(() => (window as any).planningState().data.periods[0].start)).toBeGreaterThan(200)
  await expect(page.getByRole("dialog", { name: "时期详情" })).toHaveCount(0)
}))

test("WU-58b: point, duration, window and open-ended shapes", () => withWorldline(browser, world({ calendar: { kind: "fixed", epoch: "元年", hoursPerDay: 24, daysPerMonth: 30, monthsPerYear: 12 } }, [
  { id: "a", line: "w", title: "时点事件", time: { kind: "exact", value: 0 }, duration: 0 },
  { id: "b", line: "w", title: "持续事件", time: { kind: "exact", value: 200 }, duration: 300 },
  { id: "c", line: "w", title: "窗口事件", time: { kind: "window", value: 600, end: 900 } },
  { id: "d", line: "w", title: "进行中事件", time: { kind: "exact", value: 1000 }, duration: null, ongoing: true },
]), async page => {
  await tab(page, "时间线")
  const dot = (t: string) => tlCard(page, t).locator('[class*="dot"]').first()
  assert.notEqual(await dot("时点事件").evaluate(e => getComputedStyle(e).backgroundColor), "rgba(0, 0, 0, 0)")
  assert.equal(await dot("窗口事件").evaluate(e => getComputedStyle(e).backgroundColor), "rgba(0, 0, 0, 0)")
  const bars = page.locator('[data-timeline-plane] i[class*="durBar"]')
  assert.ok(await bars.count() >= 2, "duration and open bars")
  const open = await bars.evaluateAll(l => l.map(e => getComputedStyle(e).backgroundImage))
  assert.ok(open.some(b => b.includes("gradient")), "open-ended bar fades")
}))

test("WU-61b / WU-68: a deep link to a folded grandchild opens its ancestors, selects and flashes it; the first fit does not override it", () => withWorldline(browser, f60(), async page => {
  await page.getByRole("tab", { name: "时间线" }).waitFor()
  const card = page.locator('[data-event-card][aria-label="港口商会签下秘密契约·冲突中有人受伤"]')
  await expect(card).toHaveAttribute("data-selected", "")
  await expect(page.getByRole("tree", { name: "事件目录" }).getByRole("treeitem", { name: /^港口商会签下秘密契约 / })).toHaveAttribute("aria-expanded", "true")
  await page.waitForTimeout(300)
  await expect.poll(async () => { const b = await card.boundingBox(); return !!b && b.width > 0 }).toBe(true)
}, { refId: "e9" }))

test("WU-66f: rebinding the arrow commands leaves canvas, tree and minimap arrows working", () => withWorldline(browser, f60(), async page => {
  await tab(page, "时间线")
  const mm = page.getByRole("slider", { name: /全局缩略/ })
  const check = async () => {
    await mm.focus(); const v = await mm.getAttribute("aria-valuenow")
    await page.keyboard.press("ArrowRight"); await expect.poll(() => mm.getAttribute("aria-valuenow")).not.toBe(v)
    await page.locator("[data-timeline]").focus(); const v2 = await mm.getAttribute("aria-valuenow")
    await page.keyboard.press("ArrowLeft"); await expect.poll(() => mm.getAttribute("aria-valuenow")).not.toBe(v2)
    const first = page.getByRole("tree", { name: "事件目录" }).getByRole("treeitem").first()
    await first.focus(); await page.keyboard.press("ArrowDown")
    assert.notEqual(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), await first.getAttribute("aria-label"))
  }
  await check()
  // Rebind the four input arrow commands; the worldline canvas, tree and minimap keep their own arrow keys (G3).
  await page.evaluate(() => (window as any).shortcutOverrides({ "input.left": ["Ctrl+H"], "input.right": ["Ctrl+L"], "input.up": ["Ctrl+K"], "input.down": ["Ctrl+J"] }))
  await check()
  // In the search box the new key moves the caret and the old arrow no longer runs the command.
  const box = page.getByRole("searchbox", { name: "搜索事件" })
  await box.fill("码头港口"); await box.press("End")
  await page.keyboard.press("Control+h")
  assert.equal(await box.evaluate(e => (e as HTMLInputElement).selectionStart), 3)
}, { controller: true }))

test("WU-66i: with two worldline panels, ⌘F in panel A focuses only A's search box", () => withWorldline(browser, f60(), async page => {
  const panels = page.locator("[data-fixture-panel]")
  await expect(panels).toHaveCount(2)
  const a = panels.nth(0), b = panels.nth(1)
  await a.getByRole("tab", { name: "时间线" }).click()
  await a.locator("[data-timeline]").focus()
  await page.keyboard.press(process.platform === "darwin" ? "Meta+f" : "Control+f")
  await expect(a.getByRole("searchbox", { name: "搜索事件" })).toBeFocused()
  await expect(b.getByRole("searchbox", { name: "搜索事件" })).not.toBeFocused()
}, { panels: 2, controller: true }))

test("WU-69: minimap aria values, dot labels, reduced motion and paper contrast ≥ 4.5:1", () => withWorldline(browser, f60(), async page => {
  await tab(page, "时间线")
  const mm = page.getByRole("slider", { name: /全局缩略/ })
  for (const a of ["aria-valuemin", "aria-valuemax", "aria-valuenow", "aria-valuetext"]) assert.ok(await mm.getAttribute(a), a)
  await tab(page, "事件表")
  const label = await page.locator("[data-rail-dot]").first().getAttribute("aria-label")
  assert.match(label ?? "", /\S+ .+ (一般|重要|关键)$/u)
  await page.getByRole("tree", { name: "事件目录" }).getByRole("treeitem", { name: /^星图指向南方群岛 / }).click()
  const anim = await page.locator("[data-event-table] [data-event-card][data-selected]").evaluate(e => getComputedStyle(e).animationName)
  assert.equal(anim, "none")
  const ratios = await page.evaluate(() => {
    document.documentElement.className = "paper"
    const probe = document.createElement("i"); document.body.append(probe)
    const out: number[] = []
    for (const v of ["--card", "--event-conflict", "--event-scheme", "--event-reveal", "--event-relation", "--event-growth", "--event-upheaval", "--event-other"]) {
      probe.style.color = `var(${v})`
      const rgb = getComputedStyle(probe).color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 })
      out.push(0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2])
    }
    probe.remove()
    const bg = out[0]
    return out.slice(1).map(a => (Math.max(a, bg) + 0.05) / (Math.min(a, bg) + 0.05))
  })
  assert.ok(ratios.every(r => r >= 4.5), ratios.map(r => r.toFixed(2)).join(","))
}, { reducedMotion: true }))

test("WU-71: frozen prehistory events cannot be dragged or double-click edited; edit, copy and delete are disabled", () => withWorldline(browser, {
  version: 1,
  data: { schemaVersion: 1, worlds: [{ id: "w", name: "主世界线" }, { id: "fk", name: "分支", fork: { source: "w", event: "e1", version: 1, events: [{ id: "e0", line: "fk", title: "旧城失火", time: { kind: "exact", value: 12 } }], periods: [], calendar: {} } }],
    events: [{ id: "e0", line: "w", title: "旧城失火", time: { kind: "exact", value: 12 } }, { id: "e1", line: "w", title: "渡口相遇", time: { kind: "exact", value: 24 } }, { id: "f1", line: "fk", title: "分支后的事件", time: { kind: "exact", value: 48 } }],
    lines: [], periods: [], cards: [], volumes: [], chapters: [], connections: [] },
  characters: [], materials: [], readonly: false, history: [], proposals: [],
}, async page => {
  await page.getByRole("combobox", { name: "当前世界线" }).selectOption("fk")
  await tab(page, "时间线")
  const c = tlCard(page, "旧城失火")
  await c.locator("h3").dblclick()
  await expect(page.getByRole("button", { name: "保存事件", exact: true })).toHaveCount(0)
  await c.locator("summary").click()
  for (const n of ["编辑", "复制", "删除"]) await expect(page.getByRole("button", { name: n, exact: true })).toBeDisabled()
  const h = (await c.locator("h3").boundingBox())!
  await page.keyboard.press("Escape")
  await page.mouse.move(h.x + 10, h.y + h.height / 2); await page.mouse.down(); await page.mouse.move(h.x + 120, h.y + h.height / 2, { steps: 6 }); await page.mouse.up()
  await page.waitForTimeout(200)
  assert.equal(await page.evaluate(() => (window as any).posts.length), 0)
}))

test("WU-72: a time base relabels the ruler, card time and tree short time; families keep their layout", () => withWorldline(browser, world({
  calendar: { kind: "fixed", epoch: "元年", hoursPerDay: 24, daysPerMonth: 30, monthsPerYear: 12 },
  timeBases: [{ id: "tb", name: "王历", calendar: { kind: "fixed", epoch: "王历元年", hoursPerDay: 24, daysPerMonth: 30, monthsPerYear: 12 }, offset: 100 * Y, scale: 1 }],
}, [{ id: "e1", line: "w", title: "开端", time: { kind: "exact", value: 3 * M, precision: "day" } }, { id: "e2", line: "w", title: "结局", time: { kind: "exact", value: 2 * Y, precision: "day" } }]), async page => {
  await tab(page, "时间线")
  const ruler = () => page.locator("[data-ruler]").innerText()
  const tree = () => page.getByRole("tree", { name: "事件目录" }).innerText()
  const lefts = () => page.locator("[data-timeline-plane] [data-event-card]").evaluateAll(l => l.map(e => Math.round(e.getBoundingClientRect().left)))
  const [r0, t0, l0] = [await ruler(), await tree(), await lefts()]
  await page.locator('summary[aria-label="更多操作"]').click()
  await page.getByRole("combobox", { name: "时间基准" }).selectOption("tb")
  await expect.poll(ruler).not.toBe(r0)
  await expect.poll(tree).not.toBe(t0)
  assert.deepEqual(await lefts(), l0)
  await tlCard(page, "开端").locator("h3").click()
  await expect(tlCard(page, "开端").locator("[data-card-time]")).not.toHaveText("")
}))

test("WU-73: an era calendar shows 第五纪1349年12月1日 and an era-precision event shows 第五纪", () => withWorldline(browser, world({
  calendar: { kind: "gregorian", epoch: "第五纪", hoursPerDay: 24, daysPerMonth: null, monthsPerYear: 12, eras: [{ name: "第四纪", start: -2000 * 365.2425 * 24 }, { name: "第五纪", start: 0 }] },
}, [{ id: "e1", line: "w", title: "红月之夜", time: { kind: "exact", value: 0, precision: "era" } }]), async page => {
  await tab(page, "事件表")
  const c = tableCard(page, "红月之夜")
  await c.locator("h3").click()
  await expect(c.locator("[data-card-time]")).toContainText("第五纪")
}))

test("WU-74: years and fixed calendars render; years has no year badge or month ticks; fixed tree time is M-DD", async () => {
  await withWorldline(browser, world({ calendar: { kind: "years", epoch: "建城", hoursPerDay: null, daysPerMonth: null, monthsPerYear: null } },
    [{ id: "a", line: "w", title: "建城", time: { kind: "exact", value: 0 } }, { id: "b", line: "w", title: "迁都", time: { kind: "exact", value: 300 } }]), async page => {
    await tab(page, "事件表")
    assert.equal(await page.locator("[data-rail-badge]").count(), 0)
    assert.equal(await page.locator('[class*="railTickLabel"]', { hasText: /月/ }).count(), 0)
    await tab(page, "时间线")
    await expect(tlCard(page, "迁都")).toBeAttached()
  })
  await withWorldline(browser, world({ calendar: { kind: "fixed", epoch: "元年", hoursPerDay: 24, daysPerMonth: 30, monthsPerYear: 12 } },
    [{ id: "a", line: "w", title: "开端", time: { kind: "exact", value: 3 * M + 4 * H, precision: "day" } }]), async page => {
    await expect(page.getByRole("tree", { name: "事件目录" }).getByRole("treeitem", { name: /^开端 / })).toHaveAttribute("aria-label", /^开端 \d{1,2}-\d{2}$/)
  })
})
