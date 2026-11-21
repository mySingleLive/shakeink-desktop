import assert from "node:assert/strict"
import { test } from "node:test"
import type { Browser } from "playwright-core"
import { expect } from "@playwright/test"
import { launch, withWorldline, type WorldlineView } from "../helpers/worldline-browser-fixture"

/* docs/581 WU-09c: the event editor edits category and importance; a frozen prehistory event shows them read-only
 * in its detail dialog. Synthetic data only. */
const view = (): WorldlineView => ({
  version: 1,
  data: {
    schemaVersion: 1,
    worlds: [
      { id: "w", name: "主世界线" },
      { id: "fk", name: "分支", fork: { source: "w", event: "e1", version: 1, events: [{ id: "e0", line: "fk", title: "旧城失火", category: "变故", importance: 2, time: { kind: "exact", value: 12 } }], periods: [], calendar: {} } },
    ],
    events: [
      { id: "e0", line: "w", title: "旧城失火", category: "变故", importance: 2, time: { kind: "exact", value: 12 } },
      { id: "e1", line: "w", title: "渡口相遇", time: { kind: "exact", value: 24 } },
    ],
    lines: [], periods: [], cards: [], volumes: [], chapters: [], connections: [],
  },
  characters: [], materials: [], readonly: false, history: [], proposals: [],
})

let browser: Browser
test.before(async () => { browser = await launch() })
test.after(async () => { await browser?.close() })

test("WU-09c: the editor saves category and importance; the detail dialog shows them", () => withWorldline(browser, view(), async page => {
  await page.getByRole("tab", { name: "事件表" }).click()
  const card = page.locator('article[aria-label="渡口相遇"]')
  await card.locator("h3").dblclick()
  await page.getByLabel("事件类型").selectOption("揭示")
  await page.getByRole("radio", { name: "关键" }).check()
  await page.getByRole("button", { name: "保存事件", exact: true }).click()
  await expect.poll(() => page.evaluate(() => (window as any).planningState().data.events.find((e: any) => e.id === "e1"))).toMatchObject({ category: "揭示", importance: 3 })
  await page.locator('article[aria-label="渡口相遇"] h3').click()
  await page.locator('article[aria-label="渡口相遇"]').locator("summary").click()
  await page.getByRole("button", { name: "详情", exact: true }).click()
  await expect(page.getByRole("dialog", { name: "事件详情" })).toContainText("揭示 · 关键")
}))

test("WU-09c: a frozen prehistory event's detail shows category and importance with no editable control", () => withWorldline(browser, view(), async page => {
  await page.getByRole("combobox", { name: "当前世界线" }).selectOption("fk")
  await page.getByRole("tab", { name: "事件表" }).click()
  await page.locator('article[aria-label="旧城失火"] h3').click()
  await page.locator('article[aria-label="旧城失火"]').locator("summary").click()
  await page.getByRole("button", { name: "详情", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "事件详情" })
  await expect(dialog).toContainText("变故 · 重要")
  assert.equal(await dialog.locator("select, input, textarea").count(), 0)
}))
