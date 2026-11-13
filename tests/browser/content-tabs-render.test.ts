import assert from "node:assert/strict"
import test from "node:test"
import { chromium, type Browser } from "playwright-core"
import { frames, withContentTabs } from "../helpers/content-tabs-fixture"

/* docs/542–543 IQ-20..23: with many tabs, a tab change re-renders only the panels whose visibility or record changed. */
let browser: Browser
test.before(async () => { browser = await chromium.launch({ headless: true, ...(process.env.SHAKEINK_TEST_CHROMIUM ? { executablePath: process.env.SHAKEINK_TEST_CHROMIUM } : {}) }) })
test.after(async () => { await browser?.close() })
const fx = (page: import("playwright-core").Page, script: string) => page.evaluate(script)

test("IQ-20: activating a tab renders only the old and the new active panel", () => withContentTabs(browser, { count: 40, width: 900 }, async page => {
  await fx(page, "window.tabsFixture.clearRenders()")
  await fx(page, "window.tabsFixture.activate('t20')"); await frames(page)
  const renders = await fx(page, "window.tabsFixture.renders()") as Record<string, number>
  assert.deepEqual(Object.keys(renders).sort(), ["t0", "t20"], JSON.stringify(renders))
}))

test("IQ-21: opening a tab renders the new panel and the previously active one only", () => withContentTabs(browser, { count: 40, width: 900 }, async page => {
  await fx(page, "window.tabsFixture.clearRenders()")
  await fx(page, "window.tabsFixture.open({id:'t-new',title:'新标签',type:'theme',novelId:'isolated-tabs'})"); await frames(page)
  const renders = await fx(page, "window.tabsFixture.renders()") as Record<string, number>
  assert.deepEqual(Object.keys(renders).sort(), ["t-new", "t0"], JSON.stringify(renders))
}))

test("IQ-22: moving or closing an inactive tab renders no other panel; the active draft survives", () => withContentTabs(browser, { count: 40, width: 900 }, async page => {
  await page.getByRole("textbox", { name: "草稿 t0", exact: true }).fill("保留草稿")
  const instance = await page.locator('[data-panel-id="t0"]').getAttribute("data-instance")
  await fx(page, "window.tabsFixture.clearRenders()")
  await fx(page, "window.tabsFixture.move('t30',2)"); await fx(page, "window.tabsFixture.close('t31')"); await frames(page)
  assert.deepEqual(await fx(page, "window.tabsFixture.renders()"), {})
  assert.equal(await page.locator('[data-panel-id="t0"]').getAttribute("data-instance"), instance)
  assert.equal(await page.getByRole("textbox", { name: "草稿 t0", exact: true }).inputValue(), "保留草稿")
  assert.equal(await page.locator('[data-panel-id="t31"]').count(), 0)
}))

test("IQ-23: renaming one tab re-renders only that panel", () => withContentTabs(browser, { count: 40, width: 900 }, async page => {
  await fx(page, "window.tabsFixture.clearRenders()")
  await fx(page, "window.tabsFixture.rename('t7','改名')"); await frames(page)
  assert.deepEqual(await fx(page, "window.tabsFixture.renders()"), { t7: 1 })
}))
