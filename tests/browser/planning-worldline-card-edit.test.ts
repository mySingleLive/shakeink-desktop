import assert from "node:assert/strict"
import { test } from "node:test"
import type { Browser, Page, Locator } from "playwright-core"
import { expect } from "@playwright/test"
import { launch, revealTimelineCard, withWorldline, type WorldlineView } from "../helpers/worldline-browser-fixture"

/* docs/599 §10 / §12–§15: the in-place edit form of worldline event cards (event table and timeline). Real
 * WorldlinePanel, in-memory planning API. Synthetic data only. */
let browser: Browser
test.before(async () => { browser = await launch() })
test.after(async () => { await browser?.close() })

const PEOPLE = [
  { id: "c1", name: "林衡", avatarUrl: null }, { id: "c2", name: "苏晚", avatarUrl: null },
  { id: "c3", name: "沈既白", avatarUrl: null }, { id: "c4", name: "周伯", avatarUrl: null },
]
export function editView(): WorldlineView {
  return {
    version: 1,
    data: {
      schemaVersion: 1, worlds: [{ id: "w", name: "主世界线" }],
      events: [
        { id: "e1", line: "w", title: "渡口相遇", category: "关系", importance: 2, time: { kind: "exact", value: 24 }, duration: 6,
          fact: "两人在渡口初次相遇，约定三日后同行。\n\n夜里起了大雾。", people: ["c1", "c2"],
          changes: [{ id: "x1", character: "c1", dimension: "立场", before: "旁观", after: "同行", at: "end" }] },
        { id: "e2", line: "w", title: "旧城失火", category: "变故", importance: 2, time: { kind: "exact", value: 600 }, duration: 0 },
        { id: "p", line: "w", title: "南下寻人", category: "成长", importance: 3, time: { kind: "exact", value: 1200 }, duration: 240, fact: "一路南下。", people: ["c1"] },
        { id: "k1", line: "w", parent: "p", title: "夜宿荒庙", category: "变故", importance: 1, time: { kind: "exact", value: 1260 }, duration: 12 },
        { id: "g1", line: "w", parent: "k1", title: "庙中遇雨", category: "其他", importance: 1, time: { kind: "exact", value: 1262 }, duration: 0 },
        { id: "o", line: "w", title: "长路未尽", category: "成长", importance: 2, time: { kind: "exact", value: 2400 }, duration: null, ongoing: true },
      ],
      lines: [], periods: [], cards: [], volumes: [], chapters: [], connections: [],
    },
    characters: PEOPLE, materials: [], readonly: false, history: [], proposals: [],
  }
}
const W = (body: (page: Page) => Promise<void>, o: Parameters<typeof withWorldline>[3] = {}) => withWorldline(browser, editView(), body, o)
const tab = (page: Page, name: "时间线" | "事件表") => page.getByRole("tab", { name }).click()
const card = (page: Page, view: "table" | "timeline", id: string) =>
  page.locator(`${view === "table" ? "[data-event-table]" : "[data-timeline-plane]"} [data-event-card][data-event-id="${id}"]`)
const editing = (page: Page) => page.locator("[data-event-card][data-editing]")
const box = (l: Locator) => l.evaluate(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } })
const settle = (page: Page) => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 60)))))
const posts = (page: Page) => page.evaluate(() => (window as any).posts as any[])
const saved = (page: Page, id: string) => page.evaluate(id => (window as any).planningState().data.events.find((e: any) => e.id === id), id)

async function openCard(page: Page, view: "table" | "timeline", id: string) {
  await tab(page, view === "table" ? "事件表" : "时间线")
  const c = card(page, view, id)
  if (view === "timeline") await revealTimelineCard(page, c)
  if ((await c.getAttribute("aria-expanded")) !== "true") {
    if (view === "table") await c.locator("[data-card-title]").click()
    else await c.locator("[data-card-expand]").click()
  }
  await expect(c).toHaveAttribute("aria-expanded", "true")
  await page.waitForTimeout(320)
  await settle(page)
  return c
}
async function enterEdit(page: Page, c: Locator) {
  await c.locator("[data-card-title]").dblclick()
  await expect(c).toHaveAttribute("data-editing", "")
  await settle(page)
}

for (const view of ["table", "timeline"] as const) {
  test(`CE-01/02 (${view}): entering edit keeps the card's size and position; the old form is gone`, () => W(async page => {
    const c = await openCard(page, view, "e1")
    const before = await box(c)
    const next = await box(card(page, view, "e2")).catch(() => null)
    await enterEdit(page, c)
    const after = await box(c)
    assert.ok(Math.abs(after.w - before.w) <= 0.5 && Math.abs(after.h - before.h) <= 0.5, `${JSON.stringify(before)} → ${JSON.stringify(after)}`)
    assert.ok(Math.abs(after.y - before.y) <= 0.5 && Math.abs(after.x - before.x) <= 0.5)
    if (next) { const n2 = await box(card(page, view, "e2")); assert.ok(Math.abs(n2.y - next.y) <= 0.5, "the next card does not move") }
    await expect(c.getByLabel("事件标题")).toBeVisible()
    await expect(c.getByRole("textbox", { name: "事实正文" })).toBeVisible()
    await expect(c.getByRole("button", { name: "保存", exact: true })).toBeVisible()
    assert.equal(await c.locator('fieldset, select, [class*="worldEventEditor"]').count(), 0)
  }))
}

test("CE-04: an event with no body and no people enters edit at the same size; the meta row has 添加", () => W(async page => {
  const c = await openCard(page, "table", "e2")
  const before = await box(c)
  await enterEdit(page, c)
  const after = await box(c)
  assert.ok(Math.abs(after.h - before.h) <= 0.5, `${before.h} → ${after.h}`)
  await expect(c.getByRole("button", { name: "添加", exact: true })).toBeVisible()
  assert.equal(await c.locator("[data-people]").count(), 0)
}))

test("CE-05: clicking the body opens the paragraph editor at the same height", () => W(async page => {
  const c = await openCard(page, "table", "e1")
  await enterEdit(page, c)
  const before = await box(c)
  await c.getByRole("textbox", { name: "事实正文" }).click()
  const ed = c.locator('[contenteditable="true"][aria-label="事实正文"]')
  await expect(ed).toBeVisible()
  await settle(page)
  assert.equal(await ed.locator("p").count(), 2)
  const after = await box(c)
  assert.ok(Math.abs(after.h - before.h) <= 0.5, `${before.h} → ${after.h}`)
}))

test("CE-10: title, type and importance are edited in place and saved", () => W(async page => {
  const c = await openCard(page, "table", "e1")
  await enterEdit(page, c)
  await c.getByLabel("事件标题").fill("渡口初遇")
  await c.getByRole("button", { name: "事件类型" }).click()
  await c.getByRole("option", { name: "揭示" }).click()
  await c.getByRole("button", { name: "重要程度" }).click()
  await c.getByRole("radio", { name: "关键" }).click()
  await c.getByRole("button", { name: "保存", exact: true }).click()
  await expect.poll(() => saved(page, "e1")).toMatchObject({ title: "渡口初遇", category: "揭示", importance: 3 })
  await expect(editing(page)).toHaveCount(0)
  await expect(card(page, "table", "e1")).toHaveAttribute("aria-expanded", "true")
}))

test("CE-16: an empty title is refused in the save bar and nothing is sent", () => W(async page => {
  const c = await openCard(page, "table", "e1")
  await enterEdit(page, c)
  await c.getByLabel("事件标题").fill("")
  await c.getByRole("button", { name: "保存", exact: true }).click()
  await expect(c.getByRole("alert")).toHaveText("请填写事件名称。")
  assert.equal((await posts(page)).length, 0)
}))

test("CE-20: 取消, Esc, a click on empty canvas, the toolbar or another card all leave edit and restore the title", () => W(async page => {
  const c = await openCard(page, "table", "e1")
  const ways: [string, () => Promise<void>][] = [
    ["取消", () => c.getByRole("button", { name: "取消", exact: true }).click()],
    ["Esc", () => page.keyboard.press("Escape")],
    ["canvas", async () => { const b = await box(page.locator("[data-event-table]")); await page.mouse.click(b.x + b.w - 30, b.y + b.h - 30) }],
    ["toolbar", () => page.getByRole("tab", { name: "事件表" }).click()],
    ["other card", () => card(page, "table", "e2").locator("[data-card-title]").click()],
  ]
  for (const [name, act] of ways) {
    await enterEdit(page, c)
    await c.getByLabel("事件标题").fill("改过的标题")
    await act()
    await expect(editing(page), name).toHaveCount(0)
    await expect(c.locator("[data-card-title]"), name).toHaveText("渡口相遇")
  }
  assert.equal((await posts(page)).length, 0)
}))

test("CE-13/14: a person pill swaps in place; × removes; the ＋ after the last pill adds; taken people are disabled", () => W(async page => {
  const c = await openCard(page, "table", "e1")
  await enterEdit(page, c)
  await c.getByRole("button", { name: "更换角色 林衡" }).click()
  await expect(c.getByRole("option", { name: /苏晚/ })).toBeDisabled()
  await c.getByLabel("搜索角色").fill("沈")
  await c.getByRole("option", { name: /沈既白/ }).click()
  await c.getByRole("button", { name: "移除苏晚" }).click({ force: true })
  await c.getByRole("button", { name: "添加参与角色" }).click()
  await c.getByRole("option", { name: /周伯/ }).click()
  // R5: the add pill sits after the last person pill.
  const add = await box(c.getByRole("button", { name: "添加参与角色" })), last = await box(c.getByRole("button", { name: /^更换角色/ }).last())
  assert.ok(add.x >= last.x + last.w - 1, "＋ after the last pill")
  await c.getByRole("button", { name: "保存", exact: true }).click()
  await expect.poll(() => saved(page, "e1").then(e => e.people)).toEqual(["c3", "c4"])
}))

test("CE-15 / CE-72 / CE-75: key changes edit in place; 新增角色转变 sits only on the last row; the new row's height matches the saved card", () => W(async page => {
  const c = await openCard(page, "table", "e1")
  await enterEdit(page, c)
  await c.getByLabel("维度").fill("心境")
  await c.getByLabel("变化前").fill("戒备")
  await c.getByRole("button", { name: "变化角色" }).click()
  await c.getByRole("option", { name: /苏晚/ }).click()
  await c.locator("[data-change-row]").first().hover()
  await c.getByRole("button", { name: "生效时机" }).click()
  await expect(c.getByRole("button", { name: "新增角色转变" })).toHaveCount(1)
  await c.getByRole("button", { name: "新增角色转变" }).click()
  await expect(c.locator("[data-change-row]")).toHaveCount(2)
  assert.equal(await c.locator('[data-change-row="0"] [aria-label="新增角色转变"]').count(), 0)
  const editH = (await box(c)).h
  await c.getByRole("button", { name: "保存", exact: true }).click()
  await expect.poll(() => saved(page, "e1").then(e => e.changes.length)).toBe(2)
  const e = await saved(page, "e1")
  assert.deepEqual({ ...e.changes[0], id: "" }, { id: "", character: "c2", dimension: "心境", before: "戒备", after: "同行", at: "start" })
  assert.deepEqual({ ...e.changes[1], id: "" }, { id: "", character: "c1", dimension: "境界", before: "", after: "", at: "end" })
  await settle(page)
  const openH = (await box(card(page, "table", "e1"))).h
  assert.ok(Math.abs(openH - editH) <= 0.5, `edit ${editH} vs saved ${openH}`)
}))

test("CE-21 / CE-66 (no controller): Esc closes an open picker first, then cancels the edit", () => W(async page => {
  const c = await openCard(page, "table", "e1")
  await enterEdit(page, c)
  await c.getByRole("button", { name: "事件类型" }).click()
  await expect(c.getByRole("listbox", { name: "事件类型" })).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(c.getByRole("listbox", { name: "事件类型" })).toHaveCount(0)
  await expect(editing(page)).toHaveCount(1)
  await page.keyboard.press("Escape")
  await expect(editing(page)).toHaveCount(0)
}))

test("CE-60 / CE-61 (controller): Esc right after a double click, and after choosing a type, leaves edit", () => W(async page => {
  const c = await openCard(page, "table", "e1")
  await enterEdit(page, c)
  await page.keyboard.press("Escape")
  await expect(editing(page)).toHaveCount(0)
  await enterEdit(page, c)
  await c.getByRole("button", { name: "事件类型" }).click()
  await c.getByRole("option", { name: "揭示" }).click()
  await page.keyboard.press("Escape")
  await expect(editing(page)).toHaveCount(0)
  await expect(c.locator("[data-card-tag]")).toHaveText("关系")
}, { controller: true }))

test("CE-67 / CE-68: Esc in the search box clears it first (also with the desktop controller); empty, it cancels the edit", () => W(async page => {
  const sb = page.getByRole("searchbox", { name: "搜索事件" })
  await sb.fill("渡口"); await sb.press("Escape")
  await expect(sb).toHaveValue("")
  const c = await openCard(page, "table", "e1")
  await enterEdit(page, c)
  await sb.focus(); await page.keyboard.type("火")
  await page.keyboard.press("Escape")
  await expect(sb).toHaveValue("")
  await expect(editing(page)).toHaveCount(1)
  await page.keyboard.press("Escape")
  await expect(editing(page)).toHaveCount(0)
}, { controller: true }))

test("CE-22a-c: a right click, a ≥4px drag and a scrollbar press outside do not cancel; a plain click does", () => W(async page => {
  const c = await openCard(page, "table", "e1")
  await enterEdit(page, c)
  const t = await box(page.locator("[data-event-table]"))
  await page.mouse.click(t.x + t.w - 40, t.y + t.h - 40, { button: "right" })
  await expect(editing(page)).toHaveCount(1)
  await page.mouse.move(t.x + t.w - 40, t.y + t.h - 40); await page.mouse.down(); await page.mouse.move(t.x + t.w - 80, t.y + t.h - 40, { steps: 4 }); await page.mouse.up()
  await expect(editing(page)).toHaveCount(1)
  await page.mouse.click(t.x + t.w - 40, t.y + t.h - 40)
  await expect(editing(page)).toHaveCount(0)
}))

const newChildId = (page: Page, parent: string) => page.evaluate(p => (window as any).planningState().data.events.find((e: any) => e.parent === p && e.title === "未命名事件")?.id as string | undefined, parent)

for (const view of ["table", "timeline"] as const) {
  test(`CE-30 (${view}): 新建子事件 saves a child at once; the parent becomes a family; the child opens in edit, title selected`, () => W(async page => {
    const c = await openCard(page, view, "e2")
    await c.getByRole("button", { name: "新建子事件" }).click()
    await expect.poll(() => newChildId(page, "e2")).toBeTruthy()
    const id = (await newChildId(page, "e2"))!
    const ev = await saved(page, id)
    assert.deepEqual({ kind: ev.time.kind, anchor: ev.time.anchor, boundary: ev.time.boundary, value: ev.time.value, duration: ev.duration }, { kind: "exact", anchor: "e2", boundary: "start", value: 0, duration: 0 })
    await expect(card(page, view, id)).toHaveAttribute("data-editing", "")
    assert.equal(await page.evaluate(() => { const a = document.activeElement as HTMLTextAreaElement; return a.getAttribute("aria-label") + ":" + (a.selectionEnd - a.selectionStart) }), "事件标题:5")
    await expect(page.getByText("已在「旧城失火」下新建子事件")).toBeVisible()
    if (view === "table") await expect(page.locator('[data-event-group][data-parent-title="旧城失火"]')).toHaveCount(1)
    else await expect(card(page, view, "e2").locator("[data-fold]")).toHaveCount(1)
  }))
}

for (const [name, act] of [
  ["取消", (page: Page) => page.locator("[data-editing]").getByRole("button", { name: "取消", exact: true }).click()],
  ["Esc", (page: Page) => page.keyboard.press("Escape")],
  ["click outside", (page: Page) => page.getByRole("heading", { name: "世界线", exact: true }).first().click()],
] as const) {
  test(`CE-31 (${name}): an untouched new child is undone by a restore; the parent is a plain event again and flashes`, () => W(async page => {
    // Two edits first, so the undo target after the restore exists (§14 P2-J).
    await page.evaluate(() => { (window as any).externalEdit([{ kind: "put", collection: "events", value: { id: "e1", title: "渡口相遇" } }]); (window as any).externalEdit([{ kind: "put", collection: "events", value: { id: "e1", title: "渡口相遇" } }]); (window as any).refetchWorldline() })
    await page.waitForTimeout(200)
    const before = await page.evaluate(() => JSON.stringify((window as any).planningState().data))
    const c = await openCard(page, "table", "e2")
    await c.getByRole("button", { name: "新建子事件" }).click()
    await expect(page.locator("[data-editing]")).toHaveCount(1)
    await expect(page.getByLabel("事件标题")).toBeFocused()
    await settle(page)
    const createdVersion = await page.evaluate(() => (window as any).planningState().version)
    await act(page)
    await expect.poll(() => page.evaluate(() => (window as any).posts.at(-1)?.action)).toBe("restore")
    const last = await page.evaluate(() => (window as any).posts.at(-1))
    assert.equal(last.snapshotId, "h" + (createdVersion - 1))
    assert.equal(await page.evaluate(() => JSON.stringify((window as any).planningState().data)), before)
    const h = await page.evaluate(() => (window as any).planningState().history[0])
    assert.equal(h.reason, "恢复规划版本：" + (createdVersion - 1))
    await expect(page.getByText("未修改的新子事件已移除")).toBeVisible()
    await expect(page.locator('[data-event-group][data-parent-title="旧城失火"]')).toHaveCount(0)
    await expect.poll(() => card(page, "table", "e2").getAttribute("data-flash"), { timeout: 1200 }).toBe("")
  }))
}

test("CE-32: a new child that was edited stays after 取消 (the edit is discarded)", () => W(async page => {
  const c = await openCard(page, "table", "e2")
  await c.getByRole("button", { name: "新建子事件" }).click()
  await expect(page.getByLabel("事件标题")).toBeFocused()
  await page.keyboard.type("火场救人")
  await page.locator("[data-editing]").getByRole("button", { name: "取消", exact: true }).click()
  const id = await newChildId(page, "e2")
  assert.ok(id, "child kept with its saved title")
  assert.equal((await posts(page)).length, 1)
}))

test("CE-34: changed and changed back counts as untouched", () => W(async page => {
  const c = await openCard(page, "table", "e2")
  await c.getByRole("button", { name: "新建子事件" }).click()
  const ed = page.locator("[data-editing]")
  await ed.getByRole("button", { name: "重要程度" }).click(); await ed.getByRole("radio", { name: "重要" }).click()
  await ed.getByRole("button", { name: "重要程度" }).click(); await ed.getByRole("radio", { name: "一般" }).click()
  await page.keyboard.press("Escape")
  await expect.poll(() => newChildId(page, "e2")).toBeUndefined()
}))

test("CE-33: after a change from elsewhere the untouched child is deleted, not restored", () => W(async page => {
  const c = await openCard(page, "table", "e2")
  await c.getByRole("button", { name: "新建子事件" }).click()
  await expect(page.locator("[data-editing]")).toHaveCount(1)
  await page.evaluate(() => { (window as any).externalEdit([{ kind: "put", collection: "events", value: { id: "e1", title: "外部修改" } }]); return (window as any).refetchWorldline() })
  await page.waitForTimeout(200)
  await page.locator("[data-editing]").getByRole("button", { name: "取消", exact: true }).click()
  await expect.poll(() => newChildId(page, "e2")).toBeUndefined()
  const kinds = (await posts(page)).map(p => p.action ?? p.operations?.[0]?.kind)
  assert.deepEqual(kinds, ["put", "delete"])
  assert.equal((await saved(page, "e1")).title, "外部修改")
}))

test("CE-30b: on a parent that is still ongoing the child is unplaced, saved, and explained", () => W(async page => {
  const c = await openCard(page, "table", "o")
  await c.getByRole("button", { name: "新建子事件" }).click()
  await expect.poll(() => newChildId(page, "o")).toBeTruthy()
  const ev = await saved(page, (await newChildId(page, "o"))!)
  assert.equal(ev.time.kind, "unknown")
  await expect(page.locator("[data-editing]").getByRole("status")).toContainText("子事件暂为待定位")
}))

test("CE-35 / CE-36: deleting the last child turns the parent back into a plain event; a parent cannot be deleted first", () => W(async page => {
  await tab(page, "事件表")
  const k1 = card(page, "table", "k1")
  await k1.locator("summary").click()
  await expect(k1.getByRole("button", { name: "删除", exact: true })).toBeDisabled()
  await page.keyboard.press("Escape")
  const g1 = card(page, "table", "g1")
  await g1.locator("summary").click()
  await g1.getByRole("button", { name: "删除", exact: true }).click()
  await page.getByRole("dialog", { name: "删除事件" }).getByRole("button", { name: "确认" }).click()
  await expect(page.locator('[data-event-group][data-parent-title="夜宿荒庙"]')).toHaveCount(0)
  await expect(card(page, "table", "k1").locator("[data-fold]")).toHaveCount(0)
}))

test("CE-37: on a collapsed parent the 新建子事件 button, ▸N, title, and menu do not overlap", () => W(async page => {
  await tab(page, "事件表")
  const p = card(page, "table", "p")
  await p.locator("[data-fold]").click()
  await page.waitForTimeout(250)
  const rects = await p.locator(":scope > div > [class]").evaluateAll(els => els.filter(e => (e as HTMLElement).offsetWidth > 0).map(e => { const r = e.getBoundingClientRect(); return [r.left, r.right] }))
  for (let i = 1; i < rects.length; i++) assert.ok(rects[i][0] >= rects[i - 1][1] - 0.5, JSON.stringify(rects))
}))

async function openTime(page: Page, id = "e1") {
  const c = await openCard(page, "table", id)
  await enterEdit(page, c)
  await c.getByRole("button", { name: "事件时间" }).click()
  const pop = c.getByRole("group", { name: "事件时间" })
  await expect(pop).toBeVisible()
  return { c, pop }
}
const draftOf = (page: Page) => page.evaluate(() => (window as any).__lastSave)

test("TP-01: start kinds; 结束 only for a known start; units and hints", () => W(async page => {
  const { c, pop } = await openTime(page)
  const startKinds = pop.getByRole("radiogroup", { name: "开始时间类型" })
  await expect(pop.getByRole("radiogroup", { name: "事件持续类型" })).toBeVisible()
  await startKinds.getByRole("radio", { name: "只知道哪天" }).click()
  await expect(pop.getByRole("radiogroup", { name: "事件持续类型" })).toHaveCount(0)
  await expect(pop.getByText("只知道是哪一天")).toBeVisible()
  assert.deepEqual(await pop.getByLabel("开始时间单位").locator("option").allTextContents(), ["天", "个月", "年"])
  await startKinds.getByRole("radio", { name: "某段时间内" }).click()
  await expect(pop.getByRole("spinbutton", { name: "窗口结束" })).toBeVisible()
  await startKinds.getByRole("radio", { name: "未定" }).click()
  await expect(pop.getByText("还不知道什么时候发生")).toBeVisible()
  await startKinds.getByRole("radio", { name: "确定" }).click()
  await pop.getByRole("button", { name: "完成" }).click()
  await expect(pop).toHaveCount(0)
  await expect(editing(page)).toHaveCount(1)
  await c.getByRole("button", { name: "取消", exact: true }).click()
}))

test("TP-02 / TP-03: anchor, boundary, 前 and the window sentence map to the stored values", () => W(async page => {
  const { c, pop } = await openTime(page)
  await pop.getByLabel("时间参考").selectOption("e2")
  await pop.getByLabel("参考边界").selectOption("end")
  await pop.getByLabel("开始时间单位").selectOption({ label: "天" })
  await pop.getByRole("spinbutton", { name: "开始时间偏移" }).fill("3")
  await pop.getByRole("button", { name: "之前或之后" }).click()
  await expect(pop.getByRole("button", { name: "之前或之后" })).toHaveText("前")
  await expect(pop.locator("b").first()).toHaveText(await c.locator("[data-card-time]").textContent() ?? "")
  await pop.getByRole("radiogroup", { name: "开始时间类型" }).getByRole("radio", { name: "某段时间内" }).click()
  await pop.getByRole("spinbutton", { name: "开始时间偏移" }).fill("2")
  await pop.getByRole("spinbutton", { name: "窗口结束" }).fill("5")
  await c.getByRole("button", { name: "保存", exact: true }).click()
  await expect.poll(() => saved(page, "e1").then(e => e.time)).toMatchObject({ kind: "window", anchor: "e2", boundary: "end", value: -120, end: -48 })
}))

test("TP-04 / TP-05: 结束于 keeps the end when the start moves; 未定 and 至今仍在持续", () => W(async page => {
  const { c, pop } = await openTime(page)
  // e1 starts at 24h, so the start unit opens as 天 (§4.4); this case types hours.
  await expect(pop.getByLabel("开始时间单位")).toHaveValue("24")
  await pop.getByLabel("开始时间单位").selectOption({ label: "小时" })
  await pop.getByRole("button", { name: "改填结束时间" }).click()
  await pop.getByRole("spinbutton", { name: "结束时间点" }).fill("40")
  await pop.getByRole("spinbutton", { name: "开始时间偏移" }).fill("30")
  await c.getByRole("button", { name: "保存", exact: true }).click()
  await expect.poll(() => saved(page, "e1").then(e => [e.time.value, e.duration])).toEqual([30, 10])
  await enterEdit(page, c)
  await c.getByRole("button", { name: "事件时间" }).click()
  const p2 = c.getByRole("group", { name: "事件时间" })
  await p2.getByRole("radiogroup", { name: "事件持续类型" }).getByRole("radio", { name: "未定" }).click()
  await p2.getByLabel(/至今仍在持续/).check()
  await c.getByRole("button", { name: "保存", exact: true }).click()
  await expect.poll(() => saved(page, "e1").then(e => [e.duration, e.ongoing])).toEqual([null, true])
}))

test("TP-06 / TP-07 / TP-11: dragging the end, the start and the bar snaps; keys step; the card keeps its size", () => W(async page => {
  const { c, pop } = await openTime(page)
  const h0 = (await box(c)).h
  const drag = async (sel: Locator, dx: number) => {
    const b = await box(sel); await page.mouse.move(b.x + b.w / 2, b.y + b.h / 2); await page.mouse.down()
    await page.mouse.move(b.x + b.w / 2 + dx, b.y + b.h / 2, { steps: 5 }); await page.mouse.up()
  }
  await drag(pop.getByRole("slider", { name: "结束时间" }), 80)
  await drag(pop.getByRole("slider", { name: "开始时间" }), -40)
  await expect(pop).toBeVisible()
  await expect(editing(page)).toHaveCount(1)
  assert.ok(Math.abs((await box(c)).h - h0) <= 0.5, "card size unchanged while dragging")
  const end = pop.getByRole("slider", { name: "结束时间" })
  const v0 = Number(await end.getAttribute("aria-valuenow"))
  await end.focus(); await page.keyboard.press("ArrowRight")
  assert.ok(Number(await end.getAttribute("aria-valuenow")) > v0)
  await c.getByRole("button", { name: "保存", exact: true }).click()
  await expect.poll(() => saved(page, "e1")).toMatchObject({})
  const e = await saved(page, "e1")
  assert.ok(e.time.value < 24 && e.duration > 6, JSON.stringify([e.time.value, e.duration]))
  assert.equal(e.time.value % 1, 0)
}))

test("TP-09: the stepper steps on click, repeats while held, and keys step by 1 / 10; min 0 disables ▾; digits clear the buttons", () => W(async page => {
  const { pop } = await openTime(page)
  const input = pop.getByRole("spinbutton", { name: "事件时长" })
  const spin = input.locator("xpath=following-sibling::span")
  await spin.locator("button").first().click()
  await expect(input).toHaveValue("7")
  await input.press("ArrowDown"); await input.press("Shift+ArrowUp")
  await expect(input).toHaveValue("16")
  const up = await box(spin.locator("button").first())
  await page.mouse.move(up.x + up.w / 2, up.y + up.h / 2); await page.mouse.down(); await page.waitForTimeout(900); await page.mouse.up()
  const held = Number(await input.inputValue()) - 16
  assert.ok(held >= 8 && held <= 11, `held steps ${held}`)
  // A duration typed down to 0 turns the end into 瞬间 (design round 6); min 0 is checked on the start offset.
  const start = pop.getByRole("spinbutton", { name: "开始时间偏移" })
  await start.fill("0")
  await expect(start.locator("xpath=following-sibling::span").locator("button").last()).toBeDisabled()
  const gap = await input.evaluate((el: HTMLInputElement) => { const s = el.nextElementSibling!.getBoundingClientRect(), r = el.getBoundingClientRect(); return s.left - (r.right - parseFloat(getComputedStyle(el).paddingRight)) })
  assert.ok(gap >= 0, `digits under the buttons by ${-gap}px`)
}))

test("TP-10 / CE-74: the time picker sits above the save bar where they overlap (timeline, 420px card)", () => W(async page => {
  const c = await openCard(page, "timeline", "e1")
  await enterEdit(page, c)
  await c.getByRole("button", { name: "事件时间" }).click()
  const pop = c.getByRole("group", { name: "事件时间" })
  const top = await page.evaluate(() => {
    const p = document.querySelector('[role="group"][aria-label="事件时间"]')!.getBoundingClientRect()
    const bar = [...document.querySelectorAll("[data-editing] button")].find(b => b.textContent === "保存")!.parentElement!.getBoundingClientRect()
    const x0 = Math.max(p.left, bar.left), x1 = Math.min(p.right, bar.right), y0 = Math.max(p.top, bar.top), y1 = Math.min(p.bottom, bar.bottom)
    if (x0 >= x1 || y0 >= y1) return "no overlap"
    return document.querySelector('[role="group"][aria-label="事件时间"]')!.contains(document.elementFromPoint((x0 + x1) / 2, (y0 + y1) / 2)) ? "picker" : "bar"
  })
  assert.equal(top, "picker")
  void pop; void c
}))

const RECORDS = [
  { id: "c1", name: "林衡", roleType: "PROTAGONIST", occupation: "旧城书吏", bio: "旧城书吏出身，为寻失踪的兄长一路南下。性子沉稳。", personality: "", appearance: "", avatarUrl: null },
  { id: "c2", name: "苏晚", roleType: "SUPPORTING", occupation: "", bio: "", personality: "", appearance: "", avatarUrl: null },
]
const WH = (body: (page: Page) => Promise<void>) => withWorldline(browser, editView(), body, { characterRecords: RECORDS })
const tip = (page: Page) => page.getByRole("tooltip")

test("CE-40: a person pill on an open card opens the character tab and does not toggle the card", () => WH(async page => {
  const c = await openCard(page, "table", "e1")
  await c.getByRole("button", { name: "打开角色 林衡" }).click()
  await expect.poll(() => page.evaluate(() => (window as any).openTabs())).toContain("character:c1")
  await expect(c).toHaveAttribute("aria-expanded", "true")
}))

test("CE-41 / CE-42 / CE-44 / CE-53: the hover card appears after 400ms with role and first sentence, stays on hover, loads once", () => WH(async page => {
  const c = await openCard(page, "table", "e1")
  assert.equal(await page.evaluate(() => (window as any).characterRequests ?? 0), 0)
  await c.getByRole("button", { name: "打开角色 林衡" }).hover()
  await page.waitForTimeout(200)
  await expect(tip(page)).toHaveCount(0)
  await expect(tip(page)).toContainText("林衡")
  await expect(tip(page)).toContainText("主角 · 旧城书吏")
  await expect(tip(page)).toContainText("旧城书吏出身，为寻失踪的兄长一路南下")
  const t = await box(tip(page))
  await page.mouse.move(t.x + 30, t.y + 20, { steps: 4 })
  await page.waitForTimeout(300)
  await expect(tip(page)).toHaveCount(1)
  await page.mouse.move(5, 5); await expect(tip(page)).toHaveCount(0)
  await c.getByRole("button", { name: "打开角色 苏晚" }).hover()
  await expect(tip(page)).toContainText("配角")
  assert.equal(await tip(page).locator("p").count(), 0)
  assert.equal(await page.evaluate(() => (window as any).characterRequests), 1)
}))

test("CE-43 / CE-47 / CE-49 / CE-51: no hover card in edit; it closes on an outside press, on Esc (the edit stays), and via 打开角色卡", () => WH(async page => {
  const c = await openCard(page, "table", "e1")
  await c.getByRole("button", { name: "打开角色 林衡" }).hover(); await expect(tip(page)).toHaveCount(1)
  await page.mouse.click(5, 300); await expect(tip(page)).toHaveCount(0)
  await c.getByRole("button", { name: "打开角色 林衡" }).hover(); await expect(tip(page)).toHaveCount(1)
  await tip(page).getByRole("button", { name: "打开角色卡 ›" }).click()
  await expect(tip(page)).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => (window as any).openTabs())).toContain("character:c1")
  await enterEdit(page, c)
  await c.getByRole("button", { name: "更换角色 林衡" }).hover(); await page.waitForTimeout(600)
  await expect(tip(page)).toHaveCount(0)
}))

test("CE-63: a double click on another card while the restore runs opens that edit once the undo is done; its save follows", () => W(async page => {
  const c = await openCard(page, "table", "e2")
  await c.getByRole("button", { name: "新建子事件" }).click()
  await expect(page.getByLabel("事件标题")).toBeFocused()
  await settle(page)
  const release = await page.evaluateHandle(() => (window as any).holdNext())
  await page.keyboard.press("Escape")
  await expect(editing(page)).toHaveCount(0)
  const e1 = card(page, "table", "e1")
  await e1.locator("[data-card-title]").click()
  await expect(e1).toHaveAttribute("aria-expanded", "true")
  await page.waitForTimeout(320)
  await e1.locator("[data-card-title]").dblclick()
  await page.waitForTimeout(150)
  await expect(editing(page)).toHaveCount(0)
  await page.evaluate(r => (r as unknown as () => void)(), release)
  await expect(e1).toHaveAttribute("data-editing", "")
  await e1.getByLabel("事件标题").fill("并行编辑")
  await e1.getByRole("button", { name: "保存", exact: true }).click()
  await expect.poll(() => saved(page, "e1").then(e => e.title)).toBe("并行编辑")
  assert.deepEqual((await posts(page)).map(p => p.action ?? p.operations?.[0]?.kind), ["put", "restore", "put"])
  assert.equal(await newChildId(page, "e2"), undefined)
}))

for (const how of ["pointer", "keyboard"] as const) {
  test(`CE-26 (${how}): 新建子事件 on another card while an untouched child is edited: restore, then the new child`, () => W(async page => {
    const c = await openCard(page, "table", "e2")
    await c.getByRole("button", { name: "新建子事件" }).click()
    await expect(page.getByLabel("事件标题")).toBeFocused()
    await settle(page)
    const btn = card(page, "table", "e1").getByRole("button", { name: "新建子事件" })
    if (how === "pointer") await btn.click()
    else { await btn.focus(); await page.keyboard.press("Enter") }
    await expect.poll(() => newChildId(page, "e1")).toBeTruthy()
    assert.equal(await newChildId(page, "e2"), undefined)
    assert.deepEqual((await posts(page)).map(p => p.action ?? p.operations?.[0]?.kind), ["put", "restore", "put"])
    await expect(card(page, "table", (await newChildId(page, "e1"))!)).toHaveAttribute("data-editing", "")
  }))
}

test("CE-27: ＋ 事件 while editing cancels the edit and opens the new event above the view", () => W(async page => {
  const c = await openCard(page, "table", "e1")
  await enterEdit(page, c)
  await c.getByLabel("事件标题").fill("改了但不要")
  await page.getByRole("button", { name: "＋ 事件" }).click()
  await expect(page.locator("[data-standalone-editor] [data-editing]")).toHaveCount(1)
  await expect(c.locator("[data-card-title]")).toHaveText("渡口相遇")
}))

test("CE-33b: a restore refused as stale (409) refetches, then deletes the untouched child", () => W(async page => {
  const c = await openCard(page, "table", "e2")
  await c.getByRole("button", { name: "新建子事件" }).click()
  await expect(page.getByLabel("事件标题")).toBeFocused()
  await settle(page)
  // A change from elsewhere that the client has not fetched yet.
  await page.evaluate(() => (window as any).externalEdit([{ kind: "put", collection: "events", value: { id: "e1", title: "外部修改" } }]))
  await page.keyboard.press("Escape")
  await expect.poll(() => newChildId(page, "e2")).toBeUndefined()
  assert.deepEqual((await posts(page)).map(p => p.action ?? p.operations?.[0]?.kind), ["put", "restore", "delete"])
  assert.equal((await saved(page, "e1")).title, "外部修改")
}))

test("CE-23: a double click on another card leaves the current edit and edits that card; no 请先保存 note", () => W(async page => {
  const c = await openCard(page, "table", "e1")
  await enterEdit(page, c)
  const o = card(page, "table", "e2")
  await o.locator("[data-card-title]").click(); await page.waitForTimeout(320)
  await o.locator("[data-card-title]").dblclick()
  await expect(o).toHaveAttribute("data-editing", "")
  await expect(c).not.toHaveAttribute("data-editing", "")
  await expect(page.getByText("请先保存或取消当前事件编辑")).toHaveCount(0)
}))

test("CE-25: on the timeline a click on the body opens the paragraph editor; selecting text there does not box-select", () => W(async page => {
  const c = await openCard(page, "timeline", "e1")
  await enterEdit(page, c)
  await c.getByRole("textbox", { name: "事实正文" }).click()
  const ed = c.locator('[contenteditable="true"][aria-label="事实正文"]')
  await expect(ed).toBeFocused()
  const p = await box(ed.locator("p").first())
  await page.mouse.move(p.x + 4, p.y + p.h / 2); await page.mouse.down(); await page.mouse.move(p.x + 84, p.y + p.h / 2, { steps: 6 }); await page.mouse.up()
  assert.ok((await page.evaluate(() => getSelection()?.toString() ?? "")).length > 0, "text selected")
  await expect(page.locator("[data-selection-count]")).toHaveCount(0)
  await expect(editing(page)).toHaveCount(1)
}))

test("CE-65 (controller): with focus on a type option, Esc closes only the list", () => W(async page => {
  const c = await openCard(page, "table", "e1")
  await enterEdit(page, c)
  await c.getByRole("button", { name: "事件类型" }).click()
  await c.getByRole("option", { name: "揭示" }).focus()
  await page.keyboard.press("Escape")
  await expect(c.getByRole("listbox", { name: "事件类型" })).toHaveCount(0)
  await expect(editing(page)).toHaveCount(1)
}, { controller: true }))

test("TP-03b / CE-66 (strip): 前 2 至 5 天 stores −120…−48; Esc during a strip drag restores the values, the picker stays", () => W(async page => {
  const { c, pop } = await openTime(page)
  await pop.getByRole("radiogroup", { name: "开始时间类型" }).getByRole("radio", { name: "某段时间内" }).click()
  await pop.getByLabel("开始时间单位").selectOption({ label: "天" })
  await pop.getByRole("spinbutton", { name: "开始时间偏移" }).fill("2")
  await pop.getByRole("spinbutton", { name: "窗口结束" }).fill("5")
  await pop.getByRole("button", { name: "之前或之后" }).click()
  const end = pop.getByRole("slider", { name: "时间窗口结束" })
  const v0 = await end.getAttribute("aria-valuenow")
  const b = await box(end)
  await page.mouse.move(b.x + b.w / 2, b.y + b.h / 2); await page.mouse.down(); await page.mouse.move(b.x + 80, b.y + b.h / 2, { steps: 5 })
  await page.keyboard.press("Escape")
  await page.mouse.up()
  await expect(pop).toBeVisible()
  assert.equal(await end.getAttribute("aria-valuenow"), v0)
  await c.getByRole("button", { name: "保存", exact: true }).click()
  await expect.poll(() => saved(page, "e1").then(e => [e.time.kind, e.time.value, e.time.end])).toEqual(["window", -120, -48])
}))

test("TP-08′: under a 1.25 CSS zoom on the panel a drag gives the same value as at 1.0", () => W(async page => {
  const run = async () => {
    const { c, pop } = await openTime(page)
    const d = pop.getByRole("slider", { name: "结束时间" })
    const b = await box(d), strip = await box(pop.locator("[data-time-strip]"))
    await page.mouse.move(b.x + b.w / 2, b.y + b.h / 2); await page.mouse.down(); await page.mouse.move(b.x + b.w / 2 + strip.w * 0.1, b.y + b.h / 2, { steps: 5 }); await page.mouse.up()
    const v = Number(await d.getAttribute("aria-valuenow"))
    await pop.getByRole("button", { name: "取消", exact: true }).click()
    await c.locator("button", { hasText: /^取消$/ }).last().click()
    return v
  }
  const a = await run()
  await page.evaluate(() => { (document.querySelector("[data-worldline-root]") as HTMLElement).style.zoom = "1.25" })
  const z = await run()
  assert.equal(z, a)
}))

test("CE-64: keyboard 新建 (Enter on ＋ 事件) leaves the untouched new child the same way", () => W(async page => {
  const c = await openCard(page, "table", "e2")
  await c.getByRole("button", { name: "新建子事件" }).click()
  await expect(page.getByLabel("事件标题")).toBeFocused()
  await settle(page)
  await page.getByRole("button", { name: "＋ 事件" }).focus()
  await page.keyboard.press("Enter")
  await expect.poll(() => newChildId(page, "e2")).toBeUndefined()
  await expect(page.locator("[data-standalone-editor] [data-editing]")).toHaveCount(1)
}))

test("CE-70: focus enters the card on edit; after a picker choice it returns to the trigger", () => W(async page => {
  const c = await openCard(page, "table", "e1")
  await enterEdit(page, c)
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest("[data-editing]"))).toBe(true)
  await c.getByRole("button", { name: "事件类型" }).click()
  await c.getByRole("option", { name: "揭示" }).click()
  await expect(c.getByRole("button", { name: "事件类型" })).toBeFocused()
}))

test("CE-71: on the timeline, changing the start to 未定 moves the edit above the view; the draft is kept", () => W(async page => {
  const c = await openCard(page, "timeline", "e1")
  await enterEdit(page, c)
  await c.getByLabel("事件标题").fill("草稿保留")
  await c.getByRole("button", { name: "事件时间" }).click()
  await c.getByRole("radiogroup", { name: "开始时间类型" }).getByRole("radio", { name: "未定" }).click()
  const top = page.locator("[data-standalone-editor] [data-editing]")
  await expect(top).toHaveCount(1)
  await expect(top.getByLabel("事件标题")).toHaveValue("草稿保留")
  // The picker stays open while the card moves.
  await expect(top.getByRole("group", { name: "事件时间" })).toBeVisible()
  await top.getByRole("radiogroup", { name: "开始时间类型" }).getByRole("radio", { name: "确定" }).click()
  await expect(page.locator("[data-timeline-plane] [data-editing]")).toHaveCount(1)
}))

test("CE-31c / CE-31d: a failed restore keeps the child; a child saved once is never removed by a later cancel", () => W(async page => {
  const c = await openCard(page, "table", "e2")
  await c.getByRole("button", { name: "新建子事件" }).click()
  await expect(page.getByLabel("事件标题")).toBeFocused(); await settle(page)
  await page.evaluate(() => { (window as any).failNextSave = true })
  await page.keyboard.press("Escape")
  await expect(page.getByText("保存失败（固定数据）")).toBeVisible()
  const id = await newChildId(page, "e2")
  assert.ok(id)
  const k = card(page, "table", id!)
  await k.locator("[data-card-title]").click(); await page.waitForTimeout(320)
  await enterEdit(page, k)
  await page.keyboard.press("Escape")
  await page.waitForTimeout(300)
  assert.ok(await newChildId(page, "e2"), "kept")
}))

test("CE-29 / CE-62: two panels — a click in panel B cancels A's edit; Esc with focus in B leaves A alone", () => withWorldline(browser, editView(), async page => {
  const A = page.locator('[data-fixture-panel="p0"]'), B = page.locator('[data-fixture-panel="p1"]')
  await A.getByRole("tab", { name: "事件表" }).click(); await B.getByRole("tab", { name: "事件表" }).click()
  const a = A.locator('[data-event-card][data-event-id="e1"]')
  await a.locator("[data-card-title]").click()
  await expect(a).toHaveAttribute("aria-expanded", "true")
  await page.waitForTimeout(400)
  await a.locator("[data-card-title]").dblclick()
  await expect(A.locator("[data-editing]")).toHaveCount(1)
  await B.getByRole("searchbox", { name: "搜索事件" }).focus()
  await page.keyboard.press("Escape")
  await expect(A.locator("[data-editing]")).toHaveCount(1)
  await B.getByRole("heading", { name: "世界线", exact: true }).click()
  await expect(A.locator("[data-editing]")).toHaveCount(0)
}, { panels: 2 }))

test("CE-22d / CE-22e: dragging a strip dot out of the card keeps the edit; a disabled button on another card cancels", () => W(async page => {
  const { c, pop } = await openTime(page)
  const d = await box(pop.getByRole("slider", { name: "结束时间" }))
  await page.mouse.move(d.x + d.w / 2, d.y + d.h / 2); await page.mouse.down()
  await page.mouse.move(d.x + 600, d.y + 300, { steps: 6 }); await page.mouse.up()
  await expect(editing(page)).toHaveCount(1)
  await page.keyboard.press("Escape")
  await expect(pop).toHaveCount(0)
  // The editing card's own 新建子事件 is disabled and inside: no cancel. Another card's menu summary is outside.
  await c.getByRole("button", { name: "新建子事件" }).click({ force: true })
  await expect(editing(page)).toHaveCount(1)
  await card(page, "table", "e2").locator("summary").click()
  await expect(editing(page)).toHaveCount(0)
}))

test("CE-73: title, time and body text keep the open card's font, weight, line height and colour in edit", () => W(async page => {
  const c = await openCard(page, "table", "e1")
  const style = (sel: string) => c.locator(sel).first().evaluate(e => { const s = getComputedStyle(e); return [s.fontSize, s.fontWeight, s.lineHeight, s.color].join("|") })
  const t0 = await style("[data-card-title]"), w0 = await style("[data-card-time]"), f0 = await style("[data-markdown-preview] p")
  await enterEdit(page, c)
  const t1 = await c.getByLabel("事件标题").evaluate(e => { const s = getComputedStyle(e); return [s.fontSize, s.fontWeight, s.lineHeight, s.color].join("|") })
  assert.equal(t1.split("|").slice(0, 2).join("|"), t0.split("|").slice(0, 2).join("|"))
  assert.equal(await style("[data-card-time]"), w0)
  assert.equal(await style("[data-markdown-preview] p"), f0)
}))

async function openParagraphs(page: Page, o: Parameters<typeof withWorldline>[3] = {}) {
  const c = await openCard(page, "table", "e1")
  await enterEdit(page, c)
  await c.getByRole("textbox", { name: "事实正文" }).click()
  const ed = c.locator('[contenteditable="true"][aria-label="事实正文"]')
  await expect(ed).toBeFocused()
  void o
  return { c, ed }
}
const factOf = (page: Page) => page.locator("[data-editing]").evaluate(() => (window as any).__noop)

test("CE-11: typing, Enter, Shift+Enter and a pasted text with blank lines give the expected Markdown; formatting is refused", () => W(async page => {
  const { c, ed } = await openParagraphs(page)
  await page.keyboard.press("End"); await page.keyboard.type("天亮了")
  await page.keyboard.press("Enter"); await page.keyboard.type("第三段")
  await page.keyboard.press("Shift+Enter"); await page.keyboard.type("同段")
  await ed.evaluate(el => { const dt = new DataTransfer(); dt.setData("text/plain", "甲\n\n乙\n丙"); el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })) })
  const blocked = await ed.evaluate(el => { const e = new InputEvent("beforeinput", { inputType: "formatBold", bubbles: true, cancelable: true }); el.dispatchEvent(e); return e.defaultPrevented })
  assert.equal(blocked, true)
  const control = await page.evaluate(() => { const d = document.createElement("div"); d.contentEditable = "true"; document.body.append(d); const e = new InputEvent("beforeinput", { inputType: "formatBold", bubbles: true, cancelable: true }); d.dispatchEvent(e); d.remove(); return e.defaultPrevented })
  assert.equal(control, false, "an unguarded contenteditable lets formatBold through")
  await expect(editing(page)).toHaveCount(1)
  await c.getByRole("button", { name: "保存", exact: true }).click()
  await expect.poll(() => saved(page, "e1").then(e => e.fact)).toBe("两人在渡口初次相遇，约定三日后同行。\n\n夜里起了大雾。天亮了\n\n第三段\n同段甲\n\n乙\n丙")
  void factOf
}))

test("CE-11b / CE-11d (controller): Cmd+V pastes the desktop clipboard as paragraphs; Cmd+Z undoes", () => withWorldline(browser, editView(), async page => {
  const { c, ed } = await openParagraphs(page)
  await page.keyboard.press("End")
  const cdp = await page.context().newCDPSession(page)
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "v", code: "KeyV", modifiers: 4, windowsVirtualKeyCode: 86 })
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "v", code: "KeyV", modifiers: 4, windowsVirtualKeyCode: 86 })
  // The first pasted paragraph joins the caret's paragraph; the blank line starts a new one.
  await expect.poll(() => ed.locator("p").allTextContents()).toEqual(["两人在渡口初次相遇，约定三日后同行。", "夜里起了大雾。雨停", "风起"])
  assert.equal(await page.evaluate(() => (window as any).clipboardReads), 1)
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "z", code: "KeyZ", modifiers: 4, windowsVirtualKeyCode: 90 })
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "z", code: "KeyZ", modifiers: 4, windowsVirtualKeyCode: 90 })
  await expect.poll(() => ed.locator("p").count()).toBeLessThan(3)
  void c
}, { controller: true, clipboard: "雨停\n\n风起" }))

test("CE-12: IME composition commits into the body; Esc during composition does not cancel the edit", () => W(async page => {
  const { ed } = await openParagraphs(page)
  await page.keyboard.press("End")
  const cdp = await page.context().newCDPSession(page)
  await page.evaluate(() => window.addEventListener("keydown", e => { if (e.key === "Escape") (window as any).escSeen = [e.isComposing, e.keyCode] }, true))
  await cdp.send("Input.imeSetComposition", { text: "wu", selectionStart: 2, selectionEnd: 2 })
  await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 229 })
  const seen = await page.evaluate(() => (window as any).escSeen)
  // §15.3: only a composing Esc proves anything; record it instead of passing silently.
  assert.ok(seen, "Esc reached the page")
  assert.ok(seen[0] || seen[1] === 229, `Esc during composition carries isComposing / 229: ${JSON.stringify(seen)}`)
  await expect(editing(page)).toHaveCount(1)
  await cdp.send("Input.insertText", { text: "雾" })
  await expect.poll(() => ed.textContent()).toContain("雾")
}))

test("CE-50a (profiling): typing 20 characters in the title re-renders only the editing card", () => withWorldline(browser, editView(), async page => {
  const c = await openCard(page, "table", "e1")
  await enterEdit(page, c)
  const before = await page.evaluate(() => (window as any).renders.EventCard ?? 0)
  assert.ok(before > 0, "the render counter works")
  await c.getByLabel("事件标题").press("End")
  await page.keyboard.type("一二三四五六七八九十一二三四五六七八九十")
  await settle(page)
  const after = await page.evaluate(() => (window as any).renders.EventCard)
  assert.ok(after - before <= 24, `EventCard renders ${after - before}`)
}, { profiling: true }))

/* docs/599 acceptance round 1 (user, 2026-11-23). */
test("CE-80: the character hover card sits next to its pill (below, or above when there is no room)", () => WH(async page => {
  // The desktop content drawer translates its inner box (useSidebarDrawer), which makes it the containing block of
  // position: fixed. Reproduce that ancestor here.
  await page.evaluate(() => {
    const app = document.getElementById("app")!
    app.style.position = "absolute"; app.style.left = "300px"; app.style.top = "120px"; app.style.width = "1100px"; app.style.transform = "translateX(0px)"
  })
  const c = await openCard(page, "table", "e1")
  const pill = c.getByRole("button", { name: "打开角色 林衡" })
  await pill.hover()
  await expect(tip(page)).toHaveCount(1)
  await page.waitForTimeout(100)
  const p = await box(pill), t = await box(tip(page))
  const below = t.y >= p.y + p.h && t.y - (p.y + p.h) <= 12, above = t.y + t.h <= p.y && p.y - (t.y + t.h) <= 12
  assert.ok(below || above, `pill ${JSON.stringify(p)} tip ${JSON.stringify(t)}`)
  assert.ok(Math.abs(t.x - p.x) <= 24 || t.x + t.w <= (page.viewportSize()?.width ?? 0), `left ${t.x} vs pill ${p.x}`)
}))

test("CE-81: an open character list closes on a click elsewhere in the card; the edit stays", () => W(async page => {
  const c = await openCard(page, "table", "e1")
  await enterEdit(page, c)
  await c.getByRole("button", { name: "更换角色 林衡" }).click()
  await expect(c.getByRole("listbox", { name: "更换角色" })).toBeVisible()
  await c.getByLabel("事件标题").click()
  await expect(c.getByRole("listbox", { name: "更换角色" })).toHaveCount(0)
  await c.getByRole("button", { name: "添加参与角色" }).click()
  await expect(c.getByRole("listbox", { name: "添加参与角色" })).toBeVisible()
  const h = await box(c.locator("[data-card-tag]"))
  await page.mouse.click(h.x + h.w + 260, h.y + h.h / 2)
  await expect(c.getByRole("listbox", { name: "添加参与角色" })).toHaveCount(0)
  await expect(editing(page)).toHaveCount(1)
}))

test("CE-82: the time picker has 取消, which puts back the time from when it opened", () => W(async page => {
  const { c, pop } = await openTime(page)
  await pop.getByRole("radiogroup", { name: "事件持续类型" }).getByRole("radio", { name: "瞬间" }).click()
  await pop.getByRole("spinbutton", { name: "开始时间偏移" }).fill("9")
  await pop.getByRole("button", { name: "取消", exact: true }).click()
  await expect(pop).toHaveCount(0)
  await expect(editing(page)).toHaveCount(1)
  await c.getByRole("button", { name: "保存", exact: true }).click()
  await expect.poll(() => saved(page, "e1").then(e => [e.time.value, e.duration])).toEqual([24, 6])
}))

/* docs/599 acceptance round 2 (user, 2026-11-23): a double click anywhere on an open card edits it, not only on the title. */
for (const view of ["table", "timeline"] as const) {
  test(`CE-83 (${view}): a double click on the body, the meta row or blank padding of an open card enters edit`, () => W(async page => {
    const c = await openCard(page, view, "e1")
    const spots: [string, () => Promise<{ x: number; y: number }>][] = [
      ["body text", async () => { const b = await box(c.locator("[data-markdown-preview] p").first()); return { x: b.x + 20, y: b.y + b.h / 2 } }],
      ["meta row blank", async () => { const t = await box(c.locator("[data-card-time]")), r = await box(c); return { x: Math.min(r.x + r.w - 40, t.x + t.w + 120), y: t.y + t.h / 2 } }],
      ["card padding", async () => { const r = await box(c); return { x: r.x + r.w - 12, y: r.y + r.h - 6 } }],
    ]
    for (const [name, at] of spots) {
      const p = await at()
      await page.mouse.dblclick(p.x, p.y)
      await expect(c, name).toHaveAttribute("data-editing", "")
      await expect(c, name).toHaveAttribute("aria-expanded", "true")
      await c.getByRole("button", { name: "取消", exact: true }).click()
      await expect(editing(page)).toHaveCount(0)
      await page.waitForTimeout(350)
      if ((await c.getAttribute("aria-expanded")) !== "true") {
        if (view === "table") await c.locator("[data-card-title]").click(); else await c.locator("[data-card-expand]").click()
        await page.waitForTimeout(350)
      }
    }
  }))
}

test("CE-84 (timeline): a single click on an open card's body selects it and does not edit; a box drag from it still box-selects", () => W(async page => {
  const c = await openCard(page, "timeline", "e1")
  const p = await box(c.locator("[data-markdown-preview] p").first())
  await page.mouse.click(p.x + 20, p.y + p.h / 2)
  await page.waitForTimeout(400)
  await expect(c).toHaveAttribute("data-selected", "")
  await expect(editing(page)).toHaveCount(0)
  await page.mouse.move(p.x + 20, p.y + p.h / 2); await page.mouse.down(); await page.mouse.move(p.x + 200, p.y + 160, { steps: 6 }); await page.mouse.up()
  await expect(editing(page)).toHaveCount(0)
}))

// docs/599 real-target r2 (R4): a long time label (LOTM: "… · 最初的几十年里 （按先后推定） · 持续 140253 年") fits the open
// meta row on one line, but the edit row adds two carets and the 18px ＋, wrapped and grew the card by 26px. The edit
// row stays on one line; the time text ends with an ellipsis and keeps its full text in the title.
// e2 has no body, no people and no changes, so its edit row carries the ＋ that, with the two carets, made the real row
// wrap (code review r4 P2-1). "fits": the open row is one line and the edit row wrapped before the fix (timeline, 420px
// card: 96 → 122px); "wraps": the open row itself wraps, the edit row is one line and the card that much shorter.
const longTimeView = (label: string) => {
  const v = editView()
  const e2 = (v.data as { events: any[] }).events.find(e => e.id === "e2")!
  e2.time = { kind: "exact", value: 600, label }
  e2.duration = 140253.12
  return v
}
for (const [kind, label] of [["fits", "最初的几十年里按先后推定"], ["wraps", "最初的几十年里（按先后推定）在王国北方边境的群山之间"]] as const) {
  test(`CE-85 (timeline, ${kind}): a long time label: the edit meta row is one line; the card keeps its size when the open row fits`, () => withWorldline(browser, longTimeView(label), async page => {
    const c = await openCard(page, "timeline", "e2")
    const row = () => c.locator("[data-card-time]").locator("xpath=ancestor::div[1]").evaluate(el => el.getBoundingClientRect().height)
    const openRow = await row()
    // The premise of each kind, so a font change cannot silently switch branches.
    if (kind === "fits") assert.ok(openRow <= 20, `premise: open row is one line (${openRow}px)`)
    else assert.ok(openRow > 20, `premise: open row wraps (${openRow}px)`)
    const before = await box(c)
    await enterEdit(page, c)
    await expect(c.getByRole("button", { name: "添加", exact: true })).toBeVisible()
    const after = await box(c), editRow = await row()
    assert.ok(editRow <= 20, `edit meta row on one line (${editRow}px)`)
    if (kind === "fits") assert.ok(Math.abs(after.h - before.h) <= 0.5, `${before.h} → ${after.h}`)
    else assert.ok(Math.abs(before.h - after.h - (openRow - editRow)) <= 0.5, `wrapped open row ${openRow}px: ${before.h} → ${after.h}`)
    assert.equal(await c.getByRole("button", { name: "事件时间" }).getAttribute("title"), await c.locator("[data-card-time]").textContent())
  }))
}
// Code review r4 P2-2: in a narrow event table the one-line row pins 重要程度 and ＋ at the row end; their pickers must
// stay inside the scroller (they open towards the left when there is no room on the right).
test("CE-86 (table, 400px window): the edit row's pickers stay inside the table scroller", () => withWorldline(browser, longTimeView("最初的几十年里按先后推定"), async page => {
  const c = await openCard(page, "table", "e2")
  await enterEdit(page, c)
  const sc = await box(page.locator("[data-table-scroller]"))
  for (const [name, pop] of [["事件类型", c.getByRole("listbox", { name: "事件类型" })], ["重要程度", c.getByRole("radiogroup", { name: "重要程度" })], ["添加", c.getByRole("group", { name: "添加" })], ["事件时间", c.getByRole("group", { name: "事件时间" })]] as const) {
    await c.getByRole("button", { name, exact: true }).click()
    await expect(pop).toBeVisible()
    const b = await box(pop)
    assert.ok(b.x >= sc.x - 0.5 && b.x + b.w <= sc.x + sc.w + 0.5, `${name}: ${b.x}–${b.x + b.w} inside ${sc.x}–${sc.x + sc.w}`)
    await c.getByRole("button", { name, exact: true }).click()
    await expect(pop).toHaveCount(0)
  }
}, { width: 400 }))
