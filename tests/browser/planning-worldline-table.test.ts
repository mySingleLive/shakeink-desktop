import assert from "node:assert/strict"
import { test } from "node:test"
import type { Browser, Page } from "playwright-core"
import { expect } from "@playwright/test"
import { launch, withWorldline } from "../helpers/worldline-browser-fixture"
import { f60 } from "../helpers/worldline-f60"

/* docs/581 §3.1–3.2 and §3.4 on the event table, fixture F60 (fixture-only: hierarchy, unplaced events, avatars). */
let browser: Browser
test.before(async () => { browser = await launch() })
test.after(async () => { await browser?.close() })
const table = async (page: Page) => { await page.getByRole("tab", { name: "事件表" }).click(); await page.locator("[data-event-table]").waitFor() }
const card = (page: Page, title: string) => page.locator(`[data-event-table] [data-event-card][aria-label="${title}"]`)

test("WU-30: cards start collapsed at 34px with dot, title, avatars and child count; no Markdown body rendered", () => withWorldline(browser, f60(), async page => {
  await table(page)
  const cards = page.locator("[data-event-table] [data-event-card]")
  assert.ok(await cards.count() >= 30)
  const heights = await cards.evaluateAll(list => list.slice(0, 20).map(e => Math.round(e.getBoundingClientRect().height)))
  assert.ok(heights.every(h => h === 34), JSON.stringify(heights))
  assert.equal(await page.locator("[data-event-table] [data-markdown-preview]").count(), 0)
  assert.ok(await cards.evaluateAll(list => list.every(e => e.getAttribute("aria-expanded") === "false")))
}))

test("WU-31: a click expands to type, time, body, people and menu; a second click collapses", () => withWorldline(browser, f60(), async page => {
  await table(page)
  const c = card(page, "学徒在旧书中发现星图")
  await c.locator("[data-card-title]").click()
  await expect(c).toHaveAttribute("aria-expanded", "true")
  await expect(c.locator("[data-card-tag]")).toHaveText("揭示")
  await expect(c.locator("[data-markdown-preview]")).toContainText("目击者称当晚雾气异常浓重")
  await expect(c.locator("summary")).toBeVisible()
  await c.locator("[data-card-title]").click()
  await expect(c).toHaveAttribute("aria-expanded", "false")
}))

test("WU-33/WU-34: type colours and importance sizes; legend hides a type and solos it (docs/591: hidden cards are not drawn)", () => withWorldline(browser, f60(), async page => {
  await table(page)
  const dot = (title: string) => page.locator(`[data-rail-dot][data-event-id="${(page as any)._ids?.[title] ?? ""}"]`)
  void dot
  const sizes = await page.locator("[data-rail-dot]:not([data-cluster])").evaluateAll(list => [...new Set(list.map(e => `${e.getAttribute("data-importance")}:${Math.round(e.getBoundingClientRect().width)}`))].sort())
  assert.deepEqual(sizes.filter(s => s.startsWith("1:") || s.startsWith("2:") || s.startsWith("3:")).map(s => s.split(":")[1]).filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => +a - +b), ["9", "13", "17"])
  const legend = page.locator("[data-legend-type]")
  assert.equal(await legend.count(), 7)
  await legend.filter({ hasText: "冲突" }).click()
  await expect(card(page, "巡夜队封锁北区码头")).toHaveCount(0)
  await expect(legend.filter({ hasText: "冲突" })).toHaveAttribute("aria-pressed", "false")
  await legend.filter({ hasText: "揭示" }).dblclick()
  await expect(card(page, "钟楼守夜人在雾夜失踪")).toHaveCount(0)
  await expect(card(page, "学徒在旧书中发现星图")).toHaveCount(1)
  // Every remaining card is 揭示 (its type colour variable is the 揭示 one).
  const vars = await page.locator("[data-event-table] [data-event-card]").evaluateAll(l => [...new Set(l.map(e => getComputedStyle(e).getPropertyValue("--ec").trim()))])
  assert.equal(vars.length, 1, JSON.stringify(vars))
}))

/* docs/591 LF-B1..LF-B4: the legend removes cards of a hidden type or importance and the views lay out the rest. */
const rootTops = (page: Page) => page.locator("[data-event-table] [data-event-card]").evaluateAll(list => list.map(e => Math.round(e.getBoundingClientRect().top)))
test("LF-B1: hiding a type re-lays the table: no gap is left where its cards were", () => withWorldline(browser, f60(), async page => {
  await table(page)
  const all = await page.locator("[data-event-table] [data-event-card]").count(), height = await page.locator("[data-event-table]").evaluate(e => e.scrollHeight)
  await page.locator('[data-legend-type="冲突"]').click()
  await expect.poll(() => page.locator("[data-event-table] [data-event-card]").count()).toBeLessThan(all)
  const after = await page.locator("[data-event-table]").evaluate(e => e.scrollHeight)
  assert.ok(after < height, `the table is shorter: ${height} → ${after}`)
  const tops = (await rootTops(page)).sort((a, b) => a - b), gaps = tops.slice(1).map((v, i) => v - tops[i]).filter(g => g > 0)
  assert.ok(Math.max(...gaps.slice(0, 20)) < 200, "no large hole between the first cards: " + JSON.stringify(gaps.slice(0, 20)))
  // In 等距 mode cards are packed: neighbouring root cards are one card step apart, as before filtering.
  await page.locator("[data-rail-mode-toggle]").getByRole("button", { name: "等距", exact: true }).click()
  const packed = (await rootTops(page)).sort((a, b) => a - b), steps = packed.slice(1).map((v, i) => v - packed[i]).filter(g => g > 0)
  assert.ok(Math.min(...steps.slice(0, 10)) >= 34 && Math.max(...steps.slice(0, 10)) < 120, "packed steps: " + JSON.stringify(steps.slice(0, 10)))
}))
test("LF-B9: when the filter leaves no event the table says so", () => withWorldline(browser, f60(), async page => {
  await table(page)
  for (const i of ["1", "2", "3"]) await page.locator(`[data-legend-importance="${i}"]`).click()
  await expect(page.locator("[data-filter-empty]")).toHaveText("筛选后没有事件")
  await expect(page.locator("[data-event-table] [data-event-card]")).toHaveCount(0)
}))
test("LF-B2: hiding an importance removes those events from the table and the event tree; showing it again restores them", () => withWorldline(browser, f60(), async page => {
  await table(page)
  const imp = page.locator('[data-legend-importance="1"]'), cards = page.locator("[data-event-table] [data-event-card]")
  const before = await cards.count()
  await imp.click();await expect(imp).toHaveAttribute("aria-pressed", "false")
  await expect.poll(() => cards.count()).toBeLessThan(before)
  // Every remaining rail dot is important or key; the tree lists no 一般 event.
  assert.deepEqual([...new Set(await page.locator("[data-rail-dot]:not([data-cluster])").evaluateAll(l => l.map(e => e.getAttribute("data-importance"))))].sort().filter(v => v === "1"), [])
  await expect(card(page, "学徒在旧书中发现星图")).toHaveCount(1)
  await expect(card(page, "王立大学建校")).toHaveCount(0)
  await imp.click();await expect(imp).toHaveAttribute("aria-pressed", "true");await expect.poll(() => cards.count()).toBe(before)
}))
test("LF-B3: a hidden parent hides its whole group in the table and the event tree", () => withWorldline(browser, f60(), async page => {
  await table(page)
  const group = page.locator('[data-event-group][data-parent-title="港口商会签下秘密契约"]')
  await expect(group).toHaveCount(1)
  await page.locator('[data-legend-type="谋划"]').click()
  await expect(group).toHaveCount(0)
  await expect(page.locator('[data-event-table] [data-event-card][aria-label^="港口商会签下秘密契约"]')).toHaveCount(0)
  assert.equal(await page.locator("[data-worldline-panel]").evaluate(e => e.textContent!.includes("港口商会签下秘密契约")), false, "nor in the event tree")
}))
test("LF-B4: the timeline view leaves out hidden types and importance levels", () => withWorldline(browser, f60(), async page => {
  const cards = page.locator("[data-worldline-panel] [data-event-card]")
  await expect.poll(() => cards.count()).toBeGreaterThan(0)
  const before = await cards.count()
  // Both are in the timeline before filtering (F60 opens on the 港口危机 window).
  await expect(page.locator('[data-worldline-panel] [data-event-card][aria-label="学徒在旧书中发现星图"]')).toHaveCount(1)
  await expect(page.locator('[data-worldline-panel] [data-event-card][aria-label="议员在宴会上遇刺未遂"]')).toHaveCount(1)
  await page.locator('[data-legend-type="揭示"]').click();await page.locator('[data-legend-importance="3"]').click()
  await expect.poll(() => cards.count()).toBeLessThan(before)
  await expect(page.locator('[data-worldline-panel] [data-event-card][aria-label="学徒在旧书中发现星图"]')).toHaveCount(0)
  await expect(page.locator('[data-worldline-panel] [data-event-card][aria-label="议员在宴会上遇刺未遂"]')).toHaveCount(0)
}))

test("WU-35: no ellipsis anywhere; docs/592 R1: titles too long for one line wrap to two, never line-clamped", () => withWorldline(browser, f60(), async page => {
  await table(page)
  assert.equal(await page.evaluate(() => [...document.querySelectorAll("[data-worldline-panel] *")].filter(e => getComputedStyle(e).textOverflow === "ellipsis").length), 0)
  await page.setViewportSize({ width: 900, height: 1000 })
  // F60's titles that faded at 900px before docs/592 all fit two lines, so they wrap instead of fading.
  await expect.poll(() => page.locator('[data-event-table] [data-event-card][data-title-lines="2"]').count()).toBeGreaterThan(0)
  assert.equal(await page.evaluate(() => [...document.querySelectorAll("[data-card-title]")].filter(e => !["none", ""].includes(getComputedStyle(e).webkitLineClamp)).length), 0)
}))

test("WU-36: collapsed cards show at most 4 avatars then +N, with no extra height", () => withWorldline(browser, f60(), async page => {
  await table(page)
  const withAv = page.locator("[data-event-table] [data-event-card]:has([data-avatars])")
  assert.ok(await withAv.count() > 0)
  const n = await withAv.first().locator("[data-avatars] > *").count()
  assert.ok(n <= 5)
  assert.equal(Math.round(await withAv.first().evaluate(e => e.getBoundingClientRect().height)), 34)
}))

test("WU-41/WU-42/WU-48: parents group their children; folding hides them and shows +N", () => withWorldline(browser, f60(), async page => {
  await table(page)
  const group = page.locator('[data-event-group][data-parent-title="港口商会签下秘密契约"]')
  await expect(group.locator("[data-event-card]")).toHaveCount(6)
  await group.locator("[data-fold]").first().click()
  // docs/592 R5: folded, the parent is a stacked card and its group box (with the children) is gone.
  await expect(group).toHaveCount(0)
  await expect(page.locator('[data-event-table] [data-event-card][aria-label="港口商会签下秘密契约"]')).toHaveAttribute("data-stacked", "")
  await expect(page.locator('[data-event-table] [data-event-card][aria-label^="港口商会签下秘密契约·"]')).toHaveCount(0)
  await expect(page.locator('[role="treeitem"][aria-label^="港口商会签下秘密契约"]')).toHaveAttribute("aria-expanded", "false")
}))

test("WU-43: one dot and one leader per card; year badges; break with 相隔", () => withWorldline(browser, f60(), async page => {
  await table(page)
  const cards = await page.locator("[data-event-table] [data-event-card][data-placed]").count()
  const leads = await page.locator("[data-rail-lead]").count()
  assert.equal(leads, cards)
  assert.ok(await page.locator("[data-rail-badge]").count() >= 2)
  await expect(page.locator("[data-rail-break]").first()).toContainText("相隔")
}))

test("WU-60/WU-62/WU-63/WU-65: tree locates cards; unplaced events are listed; search counts and steps", () => withWorldline(browser, f60(), async page => {
  await table(page)
  const tree = page.getByRole("tree", { name: "事件目录" })
  await expect(tree.getByRole("treeitem", { name: /某位学者的日记被人烧毁/ })).toBeVisible()
  await tree.getByRole("treeitem", { name: /星图指向南方群岛/ }).click()
  const target = card(page, "星图指向南方群岛")
  await expect(target).toHaveAttribute("data-selected", "")
  // Locate settles after two animation frames; poll the card position instead of reading it once.
  await expect.poll(async () => { const box = await target.boundingBox(), sc = await page.locator("[data-table-scroller]").boundingBox(); return Math.abs(box!.y - sc!.y - sc!.height / 3) }).toBeLessThanOrEqual(4)
  const search = page.getByRole("searchbox", { name: "搜索事件" })
  await search.fill("码头")
  await expect(page.locator("[data-search-count]")).toHaveText(/^1 \/ \d+$/)
  await search.press("Enter")
  await expect(page.locator("[data-search-count]")).toHaveText(/^2 \/ \d+$/)
  await search.fill("不存在的词")
  await expect(page.locator("[data-search-count]")).toHaveText("无结果")
  await search.press("Escape")
  await expect(search).toHaveValue("")
}))

test("WU-37: expand all / collapse all", () => withWorldline(browser, f60(), async page => {
  await table(page)
  const toggle = page.locator("[data-toggle-all]")
  await expect(toggle).toHaveText(/全部展开/)
  await toggle.click()
  await expect(toggle).toHaveText(/全部收起/)
  assert.ok(await page.locator('[data-event-table] [data-event-card][aria-expanded="false"]').count() === 0)
}))

test("WU-31b: the expanded body sits flush under the time row with no document-page padding", () => withWorldline(browser, f60(), async page => {
  await table(page)
  const c = card(page, "学徒在旧书中发现星图")
  await c.locator("[data-card-title]").click()
  await expect(c.locator("[data-markdown-preview]")).toBeVisible()
  const g = await c.evaluate(card => {
    const meta = card.querySelector("[data-card-tag]")!.parentElement!.getBoundingClientRect()
    const preview = card.querySelector("[data-text-preview]")!
    const first = preview.firstElementChild!.getBoundingClientRect()
    const last = preview.lastElementChild!.getBoundingClientRect()
    const next = card.querySelector("[data-markdown-preview]")!.nextElementSibling?.getBoundingClientRect()
    const cardBox = card.getBoundingClientRect()
    return { top: first.top - meta.bottom, left: first.left - meta.left, bottom: (next?.top ?? cardBox.bottom) - last.bottom, width: preview.getBoundingClientRect().width, cardWidth: cardBox.width }
  })
  assert.ok(g.top <= 12, `gap above body ${JSON.stringify(g)}`)
  assert.ok(Math.abs(g.left) <= 1, `body indented ${JSON.stringify(g)}`)
  assert.ok(g.bottom <= 18, `gap below body ${JSON.stringify(g)}`)
  assert.ok(g.width >= g.cardWidth - 60, `body narrowed ${JSON.stringify(g)}`)
}))
