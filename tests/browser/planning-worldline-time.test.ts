import assert from "node:assert/strict"
import { test } from "node:test"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { build } from "esbuild"
import postcss from "postcss"
import tailwindcss from "@tailwindcss/postcss"
import { chromium, type Browser, type Page } from "playwright-core"
import { expect } from "@playwright/test"

// docs/571 WT-55: imported worldline event time display only (day precision, exact-event label). React, the real
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
    worlds: [{ id: "world-a", name: "主世界线", calendar: { kind: "gregorian", epoch: "1349-06-26" } }],
    lines: [{ id: "line-a", name: "主叙事线", primary: true }],
    events: [
      { id: "ev-a", line: "world-a", parent: null, title: "东溪看水与抬高的桥址", time: { kind: "exact", value: 12, precision: "day", label: "6月26日 （按先后推定）" } },
      { id: "ev-b", line: "world-a", parent: null, title: "东宫失言案", time: { kind: "exact", value: 48, precision: "day", label: "1349年6月28日凌晨" } },
      { id: "ev-c", line: "world-a", parent: null, title: "旧式时点", time: { kind: "exact", value: 60 } },
      { id: "ev-d", line: "world-a", parent: null, title: "候选窗口", time: { kind: "window", value: 72, end: 96, label: "某个周末" } },
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
  stdin: { loader: "tsx", resolveDir: process.cwd(), sourcefile: "planning-worldline-time-fixture.tsx", contents: `
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
  outfile: "planning-worldline-time-fixture.js", loader: { ".css": "local-css" },
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{ name: "unmounted-monaco-boundary", setup(build) {
    build.onResolve({ filter: /\/MonacoMarkdownEditor$/ }, () => ({ path: "unmounted-monaco", namespace: "planning-time-fixture" }))
    build.onLoad({ filter: /.*/, namespace: "planning-time-fixture" }, () => ({
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

// docs/573 EC-73/EC-74: an era calendar (synthetic names). Year 1349 starts at civilDays(1349,1,1)×24 hours.
const Y = 24 * 365.2425, Y1349 = 492347 * 24, JUNE28 = Y1349 + (31 + 28 + 31 + 30 + 31 + 27) * 24
const ERA_FIXTURE = {
  ...FIXTURE,
  data: {
    ...FIXTURE.data,
    worlds: [{ id: "world-a", name: "主世界线", calendar: { kind: "gregorian", epoch: "0001-01-01T00:00:00Z", eras: [{ name: "青石纪", start: -2000 * Y }, { name: "赤铜纪", start: 0 }] } }],
    events: [
      { id: "ev-old", line: "world-a", parent: null, title: "远古旧城倾覆", time: { kind: "exact", value: -1000 * Y, precision: "era", label: "（按先后推定）" } },
      ...Array.from({ length: 4 }, (_, i) => ({ id: "ev-x" + i, line: "world-a", parent: null, title: "远古余波" + i, time: { kind: "exact", value: -999 * Y + i * Y, precision: "era", label: "" } })),
      { id: "ev-ago", line: "world-a", parent: null, title: "二十年前的旧案", time: { kind: "exact", value: Y1349 - 20 * Y, precision: "year", label: "二十多年前" } },
      { id: "ev-a", line: "world-a", parent: null, title: "东溪看水与抬高的桥址", time: { kind: "exact", value: JUNE28, precision: "day", label: "赤铜纪1349年6月28日凌晨" } },
      ...Array.from({ length: 94 }, (_, i) => ({ id: "ev-m" + i, line: "world-a", parent: null, title: "主线事件" + i, time: { kind: "exact", value: JUNE28 + 24 + i * 24, precision: "day", label: "" } })),
    ],
    periods: [
      { id: "import-era-0", line: "world-a", title: "青石纪", start: -2000 * Y, end: 0 },
      { id: "import-era-1", line: "world-a", title: "赤铜纪", start: 0, end: null, ongoing: true },
    ],
  },
}

async function scenario(mode: "world" | "narrative", run: (page: Page) => Promise<void>, fixture: unknown = FIXTURE) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 })
  const errors: string[] = []
  page.setDefaultTimeout(5000)
  page.on("pageerror", error => errors.push(error.message))
  page.on("console", message => { if (message.type() === "error" && !message.text().includes("Failed to load resource")) errors.push(message.text()) })
  try {
    await page.route("**/*", route => route.request().isNavigationRequest()
      ? route.fulfill({ contentType: "text/html", body: '<html class="ink"><body><div id="app" style="height:100vh"></div></body></html>' })
      : route.abort())
    await page.goto("http://127.0.0.1:1/planning-worldline-time-isolated")
    const compiled = await bundle
    await page.addStyleTag({ content: `${await stylesheet}\n${compiled.css}` })
    await page.addScriptTag({ content: compiled.js })
    await page.evaluate(options => (window as any).mountPlanning(options.mode, options.fixture), { mode, fixture })
    await page.locator(`summary[aria-label="${mode === "world" ? "东溪看水与抬高的桥址" : "序列一·穷县"}更多操作"]`).waitFor()
    await run(page)
    assert.deepEqual(errors, [], "worldline time fixture must run without page errors")
  } finally {
    await page.evaluate(() => (window as any).disposePlanning?.()).catch(() => {})
    await page.close()
  }
}

test("WT-55 世界线事件卡：日精度只显示日期，exact 事件显示时间文字", () => scenario("world", async page => {
  await page.getByRole("tab", { name: "事件表" }).click() // docs/581 §7: the view switch is a tab
  // The card is the nearest ancestor of the title heading that holds the time line (<small>).
  // docs/581 §7 (redesign run): cards start collapsed; expand one before reading its time row.
  const row = async (title: string) => { const h = page.getByRole("heading", { name: title, exact: true }), card = h.locator("xpath=ancestor::article[1]"); if ((await card.getAttribute("aria-expanded")) !== "true") await h.click(); return h.locator("xpath=ancestor::*[.//small][1]//small[@data-card-time]").first().innerText() }
  const a = await row("东溪看水与抬高的桥址"), b = await row("东宫失言案"), c = await row("旧式时点"), d = await row("候选窗口")
  assert.match(a, /^1349-06-26 · 6月26日 （按先后推定） · 时点/u, a)
  assert.match(b, /^1349-06-28 · 1349年6月28日凌晨 · 时点/u, b)
  assert.match(c, /^1349-06-28 12:00 · 时点/u, c)
  assert.match(d, /某个周末/u, d); assert.doesNotMatch(d, /^1349-06-29 · 某个周末/u, "window events keep their own display")
}))

test("EC-73 纪元日历：事件卡按精度显示纪年", () => scenario("world", async page => {
  await page.getByRole("tab", { name: "事件表" }).click() // docs/581 §7: the view switch is a tab
  // docs/581 §7 (redesign run): cards start collapsed; expand one before reading its time row.
  const row = async (title: string) => { const h = page.getByRole("heading", { name: title, exact: true }), card = h.locator("xpath=ancestor::article[1]"); if ((await card.getAttribute("aria-expanded")) !== "true") await h.click(); return h.locator("xpath=ancestor::*[.//small][1]//small[@data-card-time]").first().innerText() }
  assert.match(await row("东溪看水与抬高的桥址"), /^赤铜纪1349年6月28日 · 赤铜纪1349年6月28日凌晨 · 时点/u)
  assert.match(await row("远古旧城倾覆"), /^青石纪 · （按先后推定） · 时点/u)
  assert.match(await row("二十年前的旧案"), /^赤铜纪1329年 · 二十多年前 · 时点/u)
}, ERA_FIXTURE))

test("EC-74 纪元日历：初始时间轴对准主线，全貌包含远古事件", () => scenario("world", async page => {
  await page.getByRole("tab", { name: "时间线" }).click() // docs/581 §7
  const visible = async (title: RegExp) => {
    const box = await page.locator("[class*=timeline]").first().boundingBox()
    let n = 0
    for (const h of await page.getByRole("heading", { name: title }).all()) { const b = await h.boundingBox(); if (b && box && b.x >= box.x && b.x + 10 <= box.x + box.width) n++ }
    return n
  }
  assert.ok(await visible(/^主线事件/u) >= 10, "the first view shows the main story")
  assert.equal(await visible(/^远古/u), 0, "distant backstory starts outside the first view")
  // docs/581 §7 (redesign run): 全貌 moved into the period picker as 全部时期（全貌） (577 §9).
  await page.getByRole("combobox", { name: "时期" }).selectOption("__all")
  assert.ok(await visible(/^远古旧城倾覆$/u) >= 1, "全貌 includes the earlier era")
}, ERA_FIXTURE))
