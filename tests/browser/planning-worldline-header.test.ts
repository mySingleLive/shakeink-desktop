import assert from "node:assert/strict"
import { test } from "node:test"
import type { Browser } from "playwright-core"
import { expect } from "@playwright/test"
import { launch, withWorldline, type WorldlineView } from "../helpers/worldline-browser-fixture"

/* docs/581 WU-38, WU-39d, WU-39e: the worldline panel header. Synthetic data only. */
const view = (over: Partial<WorldlineView> = {}): WorldlineView => ({
  version: 3,
  data: { schemaVersion: 1, worlds: [{ id: "w", name: "主世界线" }], events: [{ id: "e1", line: "w", title: "渡口相遇", time: { kind: "exact", value: 24 } }], lines: [], periods: [], cards: [], volumes: [], chapters: [], connections: [] },
  characters: [], materials: [], readonly: false, history: [{ id: "h2", version: 2, reason: "修改" }], proposals: [], ...over,
})
let browser: Browser
test.before(async () => { browser = await launch() })
test.after(async () => { await browser?.close() })

const header = (page: import("playwright-core").Page) => page.locator('[data-worldline-header]')
const editTitle = async (page: import("playwright-core").Page, title: string) => {
  await page.getByRole("tab", { name: "事件表" }).click()
  await page.locator('article[aria-label="渡口相遇"] h3').dblclick()
  await page.getByLabel("事件标题").fill(title)
  await page.getByRole("button", { name: "保存", exact: true }).click()
}

test("WU-39d: the header shows 已保存 after a save and 保存失败 after a failure, independent of other notices", () => withWorldline(browser, view(), async page => {
  await editTitle(page, "渡口重逢")
  await expect(header(page).locator("[data-save-state]")).toHaveText("已保存")
  await page.evaluate(() => { (window as any).failNextSave = true })
  await page.getByRole("tab", { name: "事件表" }).click()
  await page.locator('article[aria-label="渡口重逢"] h3').dblclick()
  await page.getByLabel("事件标题").fill("渡口离别")
  await page.getByRole("button", { name: "保存", exact: true }).click()
  await expect(header(page).locator("[data-save-state]")).toHaveText("保存失败")
}))
test("WU-39d: a read-only work shows a 只读 badge", () => withWorldline(browser, view({ readonly: true }), async page => {
  await expect(header(page).getByText("只读", { exact: true })).toBeVisible()
}))
test("WU-39e: the version badge shows the version; undo restores and creates a new version", () => withWorldline(browser, view(), async page => {
  await expect(header(page).locator("[data-version-badge]")).toHaveText("v3")
  const undo = header(page).getByRole("button", { name: "撤销上次规划修改" })
  await expect(undo).toBeEnabled()
  await undo.click()
  await expect(header(page).locator("[data-version-badge]")).toHaveText("v4")
  assert.equal(await page.evaluate(() => (window as any).posts.at(-1).action), "restore")
}))
test("WU-39e: undo is disabled without history", () => withWorldline(browser, view({ history: [] }), async page => {
  await expect(header(page).getByRole("button", { name: "撤销上次规划修改" })).toBeDisabled()
}))
test("WU-38: the header title is 18px / 500; ink and paper themes", async () => {
  for (const theme of ["ink", "paper"] as const) await withWorldline(browser, view(), async page => {
    const h2 = header(page).getByRole("heading", { name: "世界线", exact: true })
    assert.deepEqual(await h2.evaluate(e => [getComputedStyle(e).fontSize, getComputedStyle(e).fontWeight]), ["18px", "500"], theme)
  }, { theme })
})
