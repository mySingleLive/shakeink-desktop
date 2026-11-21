import assert from "node:assert/strict"
import { test } from "node:test"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { build } from "esbuild"
import postcss from "postcss"
import tailwindcss from "@tailwindcss/postcss"
import { chromium, type Browser, type Page } from "playwright-core"
import { expect } from "@playwright/test"

// CM-01..10 card "..." menu dismissal checks only. React, the real
// WorldlinePanel/NarrativePanel (PlanningWorkspace), planning CSS module and
// stores are real. GET /api/novels/:id/planning is an isolated memory fixture,
// not a local database, supplier, native Electron or installed-package proof.
// The unrelated lazy Monaco module is replaced by a throwing boundary: this
// group never opens the card/event editors, so rendering it must fail here.
const stylesheet = (async () => {
  const path = resolve("src/app/globals.css")
  const [globals, desktop] = await Promise.all([
    readFile(path, "utf8"), readFile(resolve("src/app/desktop.css"), "utf8"),
  ])
  return (await postcss([tailwindcss()]).process(`${globals}\n${desktop}`, { from: path })).css
})()

const NOVEL = "fixture-novel"
const FIXTURE = {
  version: 1,
  data: {
    schemaVersion: 1,
    worlds: [{ id: "world-a", name: "大靖主线" }],
    lines: [{ id: "line-a", name: "主叙事线", primary: true }],
    events: [
      { id: "ev-a", line: "world-a", parent: null, title: "东溪看水与抬高的桥址", time: { kind: "exact", value: 24 } },
      { id: "ev-b", line: "world-a", parent: null, title: "东宫失言案", time: { kind: "exact", value: 48 } },
    ],
    periods: [],
    cards: [
      {
        id: "card-a", line: "line-a", title: "序列一·穷县",
        tellings: [{
          id: "t-a", narrator: "萧砚",
          refs: [{ line: "world-a", event: "ev-a", reveal: "萧砚当众对出存粮数", withheld: "账房早已亏空" }],
        }],
      },
      { id: "card-b", line: "line-a", title: "渡口的水", tellings: [{ id: "t-b", narrator: "萧砚" }] },
    ],
    volumes: [], chapters: [], connections: [],
  },
  characters: [], materials: [], readonly: false, history: [], proposals: [],
}

const bundle = build({
  stdin: { loader: "tsx", resolveDir: process.cwd(), sourcefile: "planning-card-menu-fixture.tsx", contents: `
import React from 'react';
import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {WorldlinePanel,NarrativePanel} from './src/components/content/planning/PlanningWorkspace';
import {TimelineZoomLevelsContext} from './src/components/content/planning/worldline/EventTimeline';
import {useChatStore} from './src/stores/chat';
globalThis.mountPlanning=(mode,fixture)=>{
 window.desktop={};
 useChatStore.setState({draft:'',draftNovelId:null});
 window.fetch=async(input,init)=>{
  const path=String(input),method=(init&&init.method)||'GET';
  if(method==='GET'&&path==='/api/novels/${NOVEL}/planning')return Response.json(fixture);
  throw Error('Unexpected planning fixture request '+method+' '+path);
 };
 const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity},mutations:{retry:false}}});
 const root=createRoot(document.getElementById('app'));
 flushSync(()=>root.render(<QueryClientProvider client={client}><TimelineZoomLevelsContext.Provider value={false}>{mode==='world'?<WorldlinePanel novelId='${NOVEL}'/>:<NarrativePanel novelId='${NOVEL}'/>}</TimelineZoomLevelsContext.Provider></QueryClientProvider>));
 globalThis.disposePlanning=()=>{flushSync(()=>root.unmount());client.clear()};
 globalThis.chatDraft=()=>useChatStore.getState().draft;
};
` },
  bundle: true, write: false, platform: "browser", format: "iife", tsconfig: "tsconfig.json",
  outfile: "planning-card-menu-fixture.js", loader: { ".css": "local-css" },
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{ name: "unmounted-monaco-boundary", setup(build) {
    build.onResolve({ filter: /\/MonacoMarkdownEditor$/ }, () => ({ path: "unmounted-monaco", namespace: "planning-menu-fixture" }))
    build.onLoad({ filter: /.*/, namespace: "planning-menu-fixture" }, () => ({
      contents: "export default function MonacoMarkdownEditor(){throw Error('Monaco is outside this menu fixture')}", loader: "js",
    }))
  } }],
}).then(result => ({
  js: result.outputFiles!.find(file => file.path.endsWith(".js"))!.text,
  css: result.outputFiles!.filter(file => file.path.endsWith(".css")).map(file => file.text).join("\n"),
}))

let browser: Browser
test.before(async () => {
  browser = await chromium.launch({ headless: true, ...(process.env.SHAKEINK_TEST_CHROMIUM ? { executablePath: process.env.SHAKEINK_TEST_CHROMIUM } : {}) })
})
test.after(async () => { await browser?.close() })

async function scenario(mode: "world" | "narrative", run: (page: Page) => Promise<void>) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 })
  const errors: string[] = []
  page.setDefaultTimeout(5000)
  page.on("pageerror", error => errors.push(error.message))
  page.on("console", message => { if (message.type() === "error" && !message.text().includes("Failed to load resource")) errors.push(message.text()) })
  try {
    await page.route("**/*", route => route.request().isNavigationRequest()
      ? route.fulfill({ contentType: "text/html", body: '<html class="ink"><body><div id="app" style="height:100vh"></div></body></html>' })
      : route.abort())
    await page.goto("http://127.0.0.1:1/planning-card-menu-isolated")
    const compiled = await bundle
    await page.addStyleTag({ content: `${await stylesheet}\n${compiled.css}` })
    await page.addScriptTag({ content: compiled.js })
    await page.evaluate(options => (window as any).mountPlanning(options.mode, options.fixture), { mode, fixture: FIXTURE })
    // docs/581 §7 (redesign run): expand the world card under test before waiting for its menu.
    if (mode === "world") await expandWorldCard(page, "东溪看水与抬高的桥址")
    await page.locator(`summary[aria-label="${mode === "world" ? "东溪看水与抬高的桥址" : "序列一·穷县"}更多操作"]`).waitFor()
    await run(page)
    assert.deepEqual(errors, [], "planning card menu fixture must run without page errors")
  } finally {
    await page.evaluate(() => (window as any).disposePlanning?.()).catch(() => {})
    await page.close()
  }
}

/** docs/581 §7 (H1, I3): in the redesign, world cards start collapsed and their menu is outside the DOM until expanded. */
async function expandWorldCard(page: Page, title: string) {
  const card = page.locator(`article[aria-label="${title}"]`).first()
  if ((await card.getAttribute("aria-expanded")) === "false") await card.locator("h3").click()
  await expect(card).toHaveAttribute("aria-expanded", "true")
}
function cardMenu(page: Page, title: string) {
  const summary = page.locator(`summary[aria-label="${title}更多操作"]`)
  const details = summary.locator("xpath=..")
  const menu = details.locator("div").first()
  return { summary, details, menu }
}

async function expectMenuOpen(details: ReturnType<typeof cardMenu>["details"], menu: ReturnType<typeof cardMenu>["menu"]) {
  await expect(details).toHaveJSProperty("open", true)
  await expect(menu).toBeVisible()
}
async function expectMenuClosed(details: ReturnType<typeof cardMenu>["details"], menu: ReturnType<typeof cardMenu>["menu"]) {
  await expect(details).toHaveJSProperty("open", false)
  await expect(menu).not.toBeVisible()
}

test("CM-01 叙事线卡片菜单：点击菜单外区域关闭", () => scenario("narrative", async page => {
  const { summary, details, menu } = cardMenu(page, "序列一·穷县")
  await summary.click()
  await expectMenuOpen(details, menu)
  await page.getByRole("heading", { name: "叙事线", exact: true }).click()
  await expectMenuClosed(details, menu)
}))

test("CM-02 世界线时间线事件菜单：点击菜单外区域关闭，z-index 联动回落", () => scenario("world", async page => {
  const holder = page.locator('[data-event="ev-a"]')
  const baseline = await holder.evaluate(el => getComputedStyle(el).zIndex)
  const { summary, details, menu } = cardMenu(page, "东溪看水与抬高的桥址")
  await summary.click()
  await expectMenuOpen(details, menu)
  assert.equal(await holder.evaluate(el => getComputedStyle(el).zIndex), "9", "打开菜单的卡片经 .eventCard:has(details[open]) 抬升")
  await page.getByRole("heading", { name: "世界线", exact: true }).click()
  await expectMenuClosed(details, menu)
  assert.equal(await holder.evaluate(el => getComputedStyle(el).zIndex), baseline, "关闭后 z-index 回落到布局基线")
}))

test("CM-03 世界线事件表事件菜单：点击菜单外区域关闭", () => scenario("world", async page => {
  // docs/581 §7: the view switch is a tab now (redesign run); the menu assertions below are unchanged.
  await page.getByRole("tab", { name: "事件表" }).click()
  await expect(page.getByRole("tab", { name: "事件表" })).toHaveAttribute("aria-selected", "true")
  await expandWorldCard(page, "东宫失言案")
  const { summary, details, menu } = cardMenu(page, "东宫失言案")
  await summary.click()
  await expectMenuOpen(details, menu)
  await page.getByRole("heading", { name: "世界线", exact: true }).click()
  await expectMenuClosed(details, menu)
}))

test("CM-04 打开另一卡片菜单时互斥关闭", () => scenario("narrative", async page => {
  const first = cardMenu(page, "序列一·穷县"), second = cardMenu(page, "渡口的水")
  await first.summary.click()
  await expectMenuOpen(first.details, first.menu)
  await second.summary.click()
  await expectMenuClosed(first.details, first.menu)
  await expectMenuOpen(second.details, second.menu)
}))

test("CM-05 菜单项「引用到对话」执行后菜单关闭且业务回调先执行", () => scenario("narrative", async page => {
  const { summary, details, menu } = cardMenu(page, "序列一·穷县")
  await summary.click()
  await expectMenuOpen(details, menu)
  await menu.getByRole("button", { name: "引用到对话", exact: true }).click()
  await expectMenuClosed(details, menu)
  assert.ok((await page.evaluate(() => (window as any).chatDraft())).includes(`【叙事卡片：序列一·穷县；ID=card-a；作品=${NOVEL}】`), "菜单项 onClick 先于关闭执行")
}))

test("CM-06 Escape 关闭菜单并归还焦点给 summary", () => scenario("world", async page => {
  const { summary, details, menu } = cardMenu(page, "东溪看水与抬高的桥址")
  await summary.click()
  await expectMenuOpen(details, menu)
  await menu.getByRole("button", { name: "引用到对话", exact: true }).focus()
  await page.keyboard.press("Escape")
  await expectMenuClosed(details, menu)
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute("aria-label"))).toBe("东溪看水与抬高的桥址更多操作")
}))

test("CM-07 summary 二次点击原生开合保持", () => scenario("narrative", async page => {
  const { summary, details, menu } = cardMenu(page, "序列一·穷县")
  await summary.click()
  await expectMenuOpen(details, menu)
  await summary.click()
  await expectMenuClosed(details, menu)
}))

test("CM-08 卡片内披露区（含嵌套）不受外部点击影响", () => scenario("narrative", async page => {
  const card = page.getByRole("article", { name: "序列一·穷县", exact: true })
  const disclosure = card.locator("details", { has: page.getByText("本次披露与事实参照", { exact: true }) })
  const nested = disclosure.locator("details", { has: page.getByText("作者事实", { exact: true }) })
  await disclosure.locator("summary").first().click()
  await expect(disclosure).toHaveJSProperty("open", true)
  await nested.locator("summary").first().click()
  await expect(nested).toHaveJSProperty("open", true)
  await page.getByRole("heading", { name: "叙事线", exact: true }).click()
  await expect(disclosure).toHaveJSProperty("open", true)
  await expect(nested).toHaveJSProperty("open", true)
}))

test("CM-09 菜单层内非按钮空白点击不关闭", () => scenario("narrative", async page => {
  const { summary, details, menu } = cardMenu(page, "渡口的水")
  await summary.click()
  await expectMenuOpen(details, menu)
  const box = await menu.boundingBox()
  assert.ok(box, "菜单层有布局框")
  await page.mouse.click(box.x + box.width / 2, box.y + box.height - 3)
  await expectMenuOpen(details, menu)
}))

test("CM-10 菜单项「详情」打开对话框时菜单关闭且焦点入对话框", () => scenario("world", async page => {
  await page.getByRole("tab", { name: "事件表" }).click() // docs/581 §7
  await expandWorldCard(page, "东宫失言案")
  const { summary, details, menu } = cardMenu(page, "东宫失言案")
  await summary.click()
  await expectMenuOpen(details, menu)
  await menu.getByRole("button", { name: "详情", exact: true }).click()
  await expectMenuClosed(details, menu)
  await expect(page.getByRole("dialog")).toBeVisible()
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true)
}))
