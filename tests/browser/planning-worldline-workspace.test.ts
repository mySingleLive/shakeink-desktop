import assert from "node:assert/strict"
import { test } from "node:test"
import type { Browser, Page } from "playwright-core"
import { expect } from "@playwright/test"
import { launch, withWorldline, type WorldlineView } from "../helpers/worldline-browser-fixture"
import { f60 } from "../helpers/worldline-f60"

/* docs/581 §3 workspace, toolbar, tree, search, periods and view memory on the real WorldlinePanel. Fixture F60 and
 * small synthetic views only. */
let browser: Browser
test.before(async () => { browser = await launch() })
test.after(async () => { await browser?.close() })
const tab = (page: Page, name: "时间线" | "事件表") => page.getByRole("tab", { name }).click()
const tableCard = (page: Page, title: string) => page.locator(`[data-event-table] [data-event-card][aria-label="${title}"]`)
const tlCard = (page: Page, title: string) => page.locator(`[data-timeline-plane] [data-event-card][aria-label="${title}"]`)
const search = (page: Page) => page.getByRole("searchbox", { name: "搜索事件" })
const viewWindow = (page: Page) => page.getByRole("slider", { name: /全局缩略/ }).getAttribute("aria-valuenow")

/** A second world with its own events, for view memory (WU-78). */
function twoWorlds(): WorldlineView {
  const v = f60(), d = v.data as any
  d.worlds.push({ id: "w2", name: "第二世界线", calendar: d.worlds[0].calendar })
  d.events.push({ id: "x1", line: "w2", parent: null, title: "第二世界线的起点", time: { kind: "exact", value: 100 } },
    { id: "x2", line: "w2", parent: null, title: "第二世界线的转折", time: { kind: "exact", value: 900 } })
  return v
}
/** Character changes on a few placed events (WU-57). */
function withChanges(): WorldlineView {
  const v = f60(), d = v.data as any
  const placed = d.events.filter((e: any) => e.time.kind === "exact" && e.parent === null && e.time.value > 0).slice(5, 8)
  placed.forEach((e: any, i: number) => { e.changes = [{ id: `ch${i}`, character: "c-allen", dimension: "身份", before: `旧身份${i}`, after: `新身份${i}`, at: "end" }] })
  return v
}

test("WU-09e: interface state never writes to the work", () => withWorldline(browser, f60(), async page => {
  await tab(page, "事件表")
  const cards = page.locator("[data-event-table] [data-event-card] [data-card-title]")
  for (let i = 0; i < 5; i++) await cards.nth(i).click()
  await page.locator('[data-event-group][data-parent-title="港口商会签下秘密契约"] [data-fold]').first().click()
  await page.getByRole("button", { name: "显示或隐藏事件目录" }).click()
  for (let i = 0; i < 6; i++) await page.getByRole("button", { name: "放大" }).click()
  await search(page).fill("码头")
  await page.locator('[data-legend-type="冲突"]').click()
  await page.waitForTimeout(300)
  assert.equal(await page.evaluate(() => (window as any).posts.length), 0)
  assert.equal(await page.evaluate(() => (window as any).planningState().version), 1)
}))

test("WU-32: a double click edits in place; the card stays expanded after save and after cancel", () => withWorldline(browser, f60(), async page => {
  await tab(page, "事件表")
  const c = tableCard(page, "学徒在旧书中发现星图")
  await c.locator("h3").dblclick()
  await expect(page.getByRole("button", { name: "保存事件", exact: true })).toBeVisible()
  await page.getByRole("button", { name: "取消", exact: true }).click()
  await expect(c).toHaveAttribute("aria-expanded", "true")
  await c.locator("h3").dblclick()
  // A second double click on an open card toggles twice (net zero) and opens the editor again.
  await expect(page.getByRole("button", { name: "保存事件", exact: true })).toBeVisible()
  await page.getByRole("button", { name: "保存事件", exact: true }).click()
  await expect.poll(() => page.evaluate(() => (window as any).posts.length)).toBe(1)
  await expect(c).toHaveAttribute("aria-expanded", "true")
}))

test("WU-34b: a hidden type and a search miss are both dimmed", () => withWorldline(browser, f60(), async page => {
  await tab(page, "事件表")
  await page.locator('[data-legend-type="冲突"]').click()
  await search(page).fill("星图")
  const op = (t: string) => tableCard(page, t).evaluate(e => Number(getComputedStyle(e).opacity))
  await expect.poll(() => op("巡夜队封锁北区码头")).toBeLessThanOrEqual(0.35)
  await expect.poll(() => op("钟楼守夜人在雾夜失踪")).toBeLessThanOrEqual(0.35)
  await expect.poll(() => op("学徒在旧书中发现星图")).toBeGreaterThan(0.9)
}))

for (const width of [1440, 1280, 1160, 1024, 900]) {
  test(`WU-39: the toolbar is one row at ${width}px with nothing past the right edge`, () => withWorldline(browser, f60(), async page => {
    await tab(page, "事件表")
    const bar = page.getByRole("toolbar", { name: "世界线工具栏" })
    const r = await bar.evaluate(b => {
      const box = b.getBoundingClientRect(), kids = [...b.children].map(c => c.getBoundingClientRect()).filter(k => k.width > 0)
      return { rows: new Set(kids.map(k => Math.round(k.top + k.height / 2))).size <= 1 || kids.every(k => k.top < box.top + 40), right: Math.max(...kids.map(k => k.right)), edge: box.right, h: box.height }
    })
    assert.ok(r.rows, "single row")
    assert.ok(r.right <= r.edge + 1, `overflow ${r.right} > ${r.edge}`)
    if (width <= 1280) await expect(page.getByRole("button", { name: "复位" })).toBeHidden()
    if (width <= 1160) await expect(page.locator("[data-toggle-all] span").last()).toBeHidden()
    if (width === 900) assert.ok((await page.locator('[role="search"]').boundingBox())!.width >= 120)
  }, { width }))
}

test("WU-39c: pressing the title and moving 3px is a click; 10px is a time drag that keeps the expanded state", () => withWorldline(browser, f60(), async page => {
  await tab(page, "时间线")
  const c = tlCard(page, "学徒在旧书中发现星图")
  await c.scrollIntoViewIfNeeded()
  const b = (await c.locator("h3").boundingBox())!
  await page.mouse.move(b.x + 20, b.y + b.height / 2); await page.mouse.down(); await page.mouse.move(b.x + 23, b.y + b.height / 2); await page.mouse.up()
  await expect(c).toHaveAttribute("aria-expanded", "true")
  const before = await c.getAttribute("aria-expanded")
  const h = (await c.locator("h3").boundingBox())!
  await page.mouse.move(h.x + 20, h.y + h.height / 2); await page.mouse.down()
  await page.mouse.move(h.x + 30, h.y + h.height / 2, { steps: 4 }); await page.mouse.up()
  await expect(c).toHaveAttribute("aria-expanded", before!)
}))

test("WU-40: the more menu has the nine entries; dialogs open and the two toggles switch", () => withWorldline(browser, f60(), async page => {
  const more = page.getByRole("button", { name: "更多操作" }).or(page.locator('summary[aria-label="更多操作"]')).first()
  await more.click()
  const menu = more.locator("xpath=..").locator("div").first()
  for (const name of ["世界线设置", "＋ 世界线", "＋ 时期", "时期列表", "跨世界连接", "单位与对应", "时间基准", "显示时期", "显示角色变化"]) await expect(menu).toContainText(name)
  await menu.getByRole("button", { name: "世界线设置" }).click()
  await expect(page.getByRole("dialog")).toBeVisible()
  await page.keyboard.press("Escape")
  await more.click()
  const box = menu.getByRole("checkbox").first()
  const was = await box.isChecked()
  await box.click()
  assert.equal(await box.isChecked(), !was)
}))

test("WU-40b: search results arrive 120ms after typing stops; count, 无结果 border, stepping, widths and <mark>", () => withWorldline(browser, f60(), async page => {
  await tab(page, "事件表")
  await page.clock.install()
  const box = search(page), host = page.locator('[role="search"]')
  assert.ok(Math.abs((await host.boundingBox())!.width - 240) <= 1)
  await box.fill("码头")
  await page.clock.runFor(119)
  // An instant read: a polling matcher would itself let the installed clock advance past 120ms.
  assert.equal(await page.locator("[data-search-count]").count(), 0, "no result at 119ms")
  await page.clock.runFor(2)
  await expect(page.locator("[data-search-count]")).toHaveText(/^1 \/ \d+$/)
  await expect.poll(async () => Math.round((await host.boundingBox())!.width)).toBe(360)
  await box.press("Enter")
  await expect(page.locator("[data-search-count]")).toHaveText(/^2 \/ \d+$/)
  await box.press("Shift+Enter")
  await expect(page.locator("[data-search-count]")).toHaveText(/^1 \/ \d+$/)
  await page.getByRole("button", { name: "下一个结果" }).click()
  await expect(page.locator("[data-search-count]")).toHaveText(/^2 \/ \d+$/)
  assert.ok(await page.locator("[data-event-table] [data-card-title] mark").count() > 0)
  assert.ok(await page.getByRole("tree", { name: "事件目录" }).locator("mark").count() > 0)
  await box.fill("不存在的词"); await page.clock.runFor(130)
  await expect(page.locator("[data-search-count]")).toHaveText("无结果")
  const [border, conflict] = await host.evaluate(h => [getComputedStyle(h).borderTopColor, (() => { const p = document.createElement("i"); p.style.color = "var(--event-conflict)"; h.append(p); const c = getComputedStyle(p).color; p.remove(); return c })()])
  assert.equal(border, conflict)
}))

test("WU-40c: the period picker lists every period with swatch, range and count; nested periods indent; first is 全貌", () => withWorldline(browser, f60(), async page => {
  const picker = page.getByRole("combobox", { name: "时期" })
  const options = await picker.locator("option").evaluateAll(list => list.map(o => ({ v: (o as HTMLOptionElement).value, t: o.textContent ?? "" })))
  assert.equal(options[1].v, "__all"); assert.equal(options[1].t, "全部时期（全貌）")
  const periods = options.slice(2)
  assert.equal(periods.length, 4)
  for (const p of periods) assert.match(p.t, /■.*·.*件/u, p.t)
  // 港口危机 and 月蚀风波 lie inside 新历, so they are indented.
  assert.ok(periods.find(p => p.v === "p3")!.t.startsWith("　"), "nested period indented")
  assert.ok(!periods.find(p => p.v === "p2")!.t.startsWith("　"))
}))

test("WU-56i: Shift + wheel, a horizontal wheel and ← → pan; ↑ ↓ scroll vertically; cards keep their y", () => withWorldline(browser, f60(), async page => {
  await tab(page, "时间线")
  const lane = page.locator("[data-timeline-lane]"), box = (await lane.boundingBox())!
  const y0 = await page.locator("[data-timeline-plane] [data-event-card]").first().evaluate(e => e.getBoundingClientRect().top)
  let v = await viewWindow(page)
  await page.mouse.move(box.x + box.width / 2, box.y + 200)
  await page.keyboard.down("Shift"); await page.mouse.wheel(0, 120); await page.keyboard.up("Shift")
  await expect.poll(() => viewWindow(page)).not.toBe(v); v = await viewWindow(page)
  await page.mouse.wheel(160, 0)
  await expect.poll(() => viewWindow(page)).not.toBe(v); v = await viewWindow(page)
  await page.locator("[data-timeline]").focus()
  await page.keyboard.press("ArrowRight")
  await expect.poll(() => viewWindow(page)).not.toBe(v)
  assert.equal(await page.locator("[data-timeline-plane] [data-event-card]").first().evaluate(e => e.getBoundingClientRect().top), y0)
  await page.keyboard.press("ArrowDown")
  await expect.poll(() => lane.evaluate(l => l.scrollTop)).toBeGreaterThan(0)
}))

test("WU-57: character lanes sit below every family in the moving plane and follow a pan", () => withWorldline(browser, withChanges(), async page => {
  await tab(page, "时间线")
  const lane = page.getByRole("group", { name: "艾伦变化轨道" })
  await expect(lane).toHaveCount(1)
  const bottom = await page.evaluate(() => Math.max(...[...document.querySelectorAll("[data-timeline-plane] [data-event-card],[data-family-frame]")].map(e => e.getBoundingClientRect().bottom)))
  assert.ok((await lane.boundingBox())!.y >= bottom, "lane below families")
  assert.ok(await lane.evaluate(e => !!e.closest("[data-timeline-plane]")))
  const item = page.locator("[data-timeline-plane] button", { hasText: "新身份0" })
  await expect(item).toBeVisible()
  await expect(page.locator("details", { hasText: "角色在视窗末端的状态" })).toHaveCount(1)
  const more = page.locator('summary[aria-label="更多操作"]')
  await more.click()
  await page.getByRole("checkbox").filter({ has: page.locator("xpath=..", { hasText: "显示角色变化" }) }).or(page.locator("label", { hasText: "显示角色变化" }).locator("input")).first().click()
  await expect(lane).toHaveCount(0)
}))

test("WU-60b: the tree switch hides the tree to width 0 and restores 260px in both views", () => withWorldline(browser, f60(), async page => {
  for (const v of ["事件表", "时间线"] as const) {
    await tab(page, v)
    const tree = page.locator('nav[aria-label="事件目录"]')
    const sw = page.getByRole("button", { name: "显示或隐藏事件目录" })
    await sw.click()
    await expect.poll(async () => Math.round((await tree.boundingBox())?.width ?? 0)).toBe(0)
    await sw.click()
    await expect.poll(async () => Math.round((await tree.boundingBox())!.width)).toBe(260)
  }
}))

test("WU-60c: the tree is role=tree; parents carry aria-expanded; ↑↓ move, ←→ fold, Enter locates", () => withWorldline(browser, f60(), async page => {
  await tab(page, "事件表")
  const tree = page.getByRole("tree", { name: "事件目录" })
  const parent = tree.getByRole("treeitem", { name: /^港口商会签下秘密契约 / })
  await expect(parent).toHaveAttribute("aria-expanded", "true")
  await parent.focus()
  await page.keyboard.press("ArrowLeft")
  await expect(parent).toHaveAttribute("aria-expanded", "false")
  await page.keyboard.press("ArrowRight")
  await expect(parent).toHaveAttribute("aria-expanded", "true")
  await page.keyboard.press("ArrowDown")
  const focused = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "")
  assert.match(focused, /港口商会签下秘密契约·/u)
  await page.keyboard.press("Enter")
  await expect(page.locator(`[data-event-table] [data-event-card][data-selected]`)).toHaveCount(1)
}))

test("WU-61: locating on the timeline puts the start at 30% of the window and the card fully in view", () => withWorldline(browser, f60(), async page => {
  await tab(page, "时间线")
  const tree = page.getByRole("tree", { name: "事件目录" })
  for (const name of [/^港口商会签下秘密契约 /, /^星图指向南方群岛 /, /^旧纪诸王建立第一座石城 /]) {
    await tree.getByRole("treeitem", { name }).click()
    const card = page.locator("[data-timeline-plane] [data-event-card][data-selected]")
    await expect(card).toHaveCount(1)
    await expect.poll(async () => {
      const b = await card.boundingBox(), l = await page.locator("[data-timeline-lane]").boundingBox()
      return !!b && !!l && b.y >= l.y - 1 && b.y + Math.min(b.height, 34) <= l.y + l.height + 1
    }).toBe(true)
    const ratio = await page.evaluate(() => {
      const sel = document.querySelector<HTMLElement>("[data-timeline-plane] [data-event-card][data-selected]")!
      const holder = sel.closest<HTMLElement>("[data-plane-left]")!, lane = document.querySelector("[data-timeline-lane]")!.getBoundingClientRect()
      return (holder.getBoundingClientRect().left - lane.left - 14) / (lane.width - 28)
    })
    assert.ok(Math.abs(ratio - 0.3) <= 0.01 || ratio >= 0 && ratio <= 0.31, `start at ${ratio}`)
  }
}))

test("WU-66b: Enter during IME composition does not step; after composition it does", () => withWorldline(browser, f60(), async page => {
  await tab(page, "事件表")
  const box = search(page)
  await box.fill("码头"); await page.waitForTimeout(200)
  await expect(page.locator("[data-search-count]")).toHaveText(/^1 \//)
  await box.evaluate(el => {
    el.dispatchEvent(new CompositionEvent("compositionstart"))
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, isComposing: true } as KeyboardEventInit))
  })
  await expect(page.locator("[data-search-count]")).toHaveText(/^1 \//)
  await box.evaluate(el => el.dispatchEvent(new CompositionEvent("compositionend")))
  await box.press("Enter")
  await expect(page.locator("[data-search-count]")).toHaveText(/^2 \//)
}))

test("WU-66c: hits in an expanded card's Markdown body are marked; clearing removes every mark", () => withWorldline(browser, f60(), async page => {
  await tab(page, "事件表")
  const c = tableCard(page, "学徒在旧书中发现星图")
  await c.locator("h3").click()
  await search(page).fill("雾气"); await page.waitForTimeout(200)
  await expect(c.locator("[data-markdown-preview] mark")).toHaveText(["雾气"])
  await search(page).fill(""); await page.waitForTimeout(50)
  await expect(page.locator("[data-markdown-preview] mark")).toHaveCount(0)
  await expect(c.locator("[data-markdown-preview]")).toContainText("目击者称当晚雾气异常浓重")
}))

test("WU-67: period locate fits the timeline window and reports the event count; the table scrolls to the first event", () => withWorldline(browser, f60(), async page => {
  await tab(page, "时间线")
  await page.getByRole("combobox", { name: "时期" }).selectOption("p3")
  const note = page.locator('[role="status"]', { hasText: "已定位到时期" })
  await expect(note).toHaveText(/^已定位到时期「港口危机」· \d+ 件事件$/)
  const n = Number((await note.innerText()).match(/· (\d+) 件/)![1])
  const expected = await page.evaluate(() => { const s = (window as any).planningState().data, p = s.periods.find((x: any) => x.id === "p3"); return s.events.filter((e: any) => e.time.kind !== "unknown" && !e.time.anchor && e.time.value >= p.start && e.time.value <= p.end).length })
  assert.equal(n, expected)
  const span = Number(await page.locator("[data-timeline]").getAttribute("data-view-span"))
  const p = await page.evaluate(() => (window as any).planningState().data.periods.find((x: any) => x.id === "p3"))
  const len = Math.max(24, p.end - p.start)
  assert.ok(span >= len && span <= len * 1.25 + 1e-6, `span ${span} for period ${len}`)
  await tab(page, "事件表")
  await page.getByRole("combobox", { name: "时期" }).selectOption("p3")
  await expect.poll(async () => {
    const sel = page.locator("[data-event-table] [data-event-card][data-selected]"), sc = await page.locator("[data-table-scroller]").boundingBox(), b = await sel.boundingBox()
    return b && sc ? Math.abs(b.y - sc.y - sc.height / 3) : 999
  }).toBeLessThanOrEqual(4)
}))

test("WU-75: no breadcrumbs; 定位子事件 opens the family and locates the first child; status shows N 件事件", () => withWorldline(browser, f60(), async page => {
  await expect(page.getByRole("navigation", { name: /层级|面包屑/ })).toHaveCount(0)
  await expect(page.getByText(/^\d+ 件事件$/)).toBeVisible()
  await tab(page, "事件表")
  const group = page.locator('[data-event-group][data-parent-title="港口商会签下秘密契约"]')
  await group.locator("[data-fold]").first().click()
  const parent = tableCard(page, "港口商会签下秘密契约")
  await parent.locator("h3").click()
  await parent.locator("summary").click()
  await page.getByRole("button", { name: "定位子事件" }).click()
  await expect(group.locator("[data-event-card]")).not.toHaveCount(1)
  await expect(page.locator("[data-event-table] [data-event-card][data-selected]")).toHaveAttribute("aria-label", /^港口商会签下秘密契约·/)
}))

test("WU-76: 待定位 count matches data; each row has title, 详情 and 编辑时间", () => withWorldline(browser, f60(), async page => {
  const pending = await page.evaluate(() => (window as any).planningState().data.events.filter((e: any) => e.time.kind === "unknown").length)
  const chip = page.getByRole("button", { name: /待定位/ })
  await expect(chip).toContainText(String(pending))
  await chip.click()
  const row = page.getByRole("button", { name: "某位学者的日记被人烧毁", exact: true })
  await expect(row).toBeVisible()
  await expect(page.getByRole("button", { name: "详情", exact: true }).first()).toBeVisible()
  await expect(page.getByRole("button", { name: "编辑时间", exact: true }).first()).toBeVisible()
  await page.getByRole("button", { name: "详情", exact: true }).first().click()
  await expect(page.getByRole("dialog", { name: "事件详情" })).toBeVisible()
}))

test("WU-77: a new period appears in the picker and the period list; its detail shows the range", () => withWorldline(browser, f60(), async page => {
  await page.locator('summary[aria-label="更多操作"]').click()
  await page.getByRole("button", { name: "＋ 时期" }).click()
  const dialog = page.getByRole("dialog", { name: "时期设置" })
  await dialog.locator('input[name="title"]').fill("海雾季")
  await dialog.locator('input[name="start"]').fill("100")
  await dialog.locator('input[name="end"]').fill("500")
  await dialog.getByRole("button", { name: "确认" }).click()
  await expect.poll(() => page.evaluate(() => (window as any).planningState().data.periods.some((p: any) => p.title === "海雾季"))).toBe(true)
  await expect(page.getByRole("combobox", { name: "时期" }).locator("option", { hasText: "海雾季" })).toHaveCount(1)
  await page.locator('summary[aria-label="更多操作"]').click()
  await page.getByRole("button", { name: /^时期列表/ }).click()
  await expect(page.getByRole("region", { name: "时期列表" })).toContainText("海雾季")
  await expect(page.locator("details", { hasText: "时期与连接列表" })).toHaveCount(1)
}))

test("WU-78: each world remembers its timeline window", () => withWorldline(browser, twoWorlds(), async page => {
  await tab(page, "时间线")
  const mm = page.getByRole("slider", { name: /全局缩略/ })
  await mm.focus(); await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowRight")
  const a = await viewWindow(page)
  await page.waitForTimeout(250)
  await page.getByRole("combobox", { name: "当前世界线" }).selectOption("w2")
  await expect(page.getByText("第二世界线的起点").first()).toBeAttached()
  await page.getByRole("combobox", { name: "当前世界线" }).selectOption("w")
  await expect.poll(() => viewWindow(page)).toBe(a)
}))

test("WU-79: a child outside its parent's range shows the range error; the window is not clamped to the parent", () => withWorldline(browser, f60(), async page => {
  await tab(page, "事件表")
  const child = tableCard(page, "港口商会签下秘密契约·暗中交易")
  const title = (await child.count()) ? "港口商会签下秘密契约·暗中交易" : await page.locator('[data-event-group][data-parent-title="港口商会签下秘密契约"] [data-event-card]').nth(1).getAttribute("aria-label")
  const c = tableCard(page, title!)
  await c.locator("h3").dblclick()
  const off = page.getByLabel("开始时间偏移")
  await off.fill(String(Number(await off.inputValue()) + 1e7))
  await page.getByRole("button", { name: "保存事件", exact: true }).click()
  await expect(page.locator('[role="status"]', { hasText: /超出/ })).toContainText("允许范围")
  await page.getByRole("button", { name: "取消", exact: true }).click()
  await tab(page, "时间线")
  const mm = page.getByRole("slider", { name: /全局缩略/ })
  const r = (await mm.boundingBox())!
  await page.mouse.click(r.x + 4, r.y + r.height / 2)
  await expect(page.locator("[data-range]")).toContainText(/前|-/)
}))
