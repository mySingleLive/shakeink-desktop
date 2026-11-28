import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { build } from "esbuild"
import postcss from "postcss"
import tailwindcss from "@tailwindcss/postcss"
import { chromium, type Browser, type CDPSession, type Page } from "playwright-core"

// docs/611 §0.2 / §9.1. Real ChapterContentPanel, MarkdownEditor, CommentablePreview,
// CandidatePanel, DesktopCommandController, globals.css + desktop.css and Chromium.
// Only the local source API and the Electron bridge are stubbed. Not an Electron run.
const css = (async () => {
  const path = resolve("src/app/globals.css")
  return (await postcss([tailwindcss()]).process(await readFile(path, "utf8"), { from: path })).css + "\n" + await readFile("src/app/desktop.css", "utf8")
})()
const contents = String.raw`
import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';import {ThemeProvider,useTheme} from 'next-themes';import {Toaster} from 'sonner';
import {ChapterContentPanel} from './src/components/content/ChapterContentPanel';import {CandidatePanel} from './src/components/content/CandidatePanel';
import {MarkdownEditor} from './src/components/editor/MarkdownEditor';
import {CommentDraftAccount} from './src/components/comments/comment-drafts';
import {DesktopCommandController} from './src/components/desktop/DesktopCommandController';
import {useDesktopCommands} from './src/lib/desktop/use-command-target';
import {useDesktopStore} from './src/stores/desktop';import {defaultState} from './desktop/core/settings';
import {initializeStartupCommandCatalog} from './src/lib/desktop/startup-command-catalog';
import {installTextPreviewSelection} from './src/lib/desktop/text-selection';
import {desktopFontFamily} from './src/lib/desktop/appearance';
initializeStartupCommandCatalog('darwin');
self.MonacoEnvironment={getWorker:()=>new Worker('/monaco-worker.js',{type:'module'})};
const para=(c,n)=>c.repeat(n)+'。';
const BODY=['甲段'+para('春',40),'乙段'+para('夏',40),'丙段'+para('秋',40),'丁段'+para('冬',40)].join('\n\n');
const LONG=Array.from({length:4},(_,i)=>'戊'.repeat(309)).join('\n\n');
const chapters={
 c1:{id:'c1',volumeId:'v1',index:1,title:'第一章 绯红',outline:'大纲',content:BODY,wordCount:0,status:'WRITTEN',version:1,volume:{id:'v1',novelId:'n1',index:1,title:'第一部 小丑',summary:''}},
 c2:{id:'c2',volumeId:'v2',index:3,title:'灯下来客',outline:'大纲',content:LONG,wordCount:0,status:'WRITTEN',version:1,volume:{id:'v2',novelId:'n1',index:2,title:'青石巷',summary:''}},
};
const f=window.f={requests:[],writes:[],menus:0,probes:{aiStop:0,fileSave:0},threads:[],references:[],stream:null,chapters};
const now='2026-11-28T00:00:00.000Z';
f.thread=(quote,start)=>({id:'t-'+f.threads.length,novelId:'n1',targetType:'CHAPTER_CONTENT',targetId:'c1',parentId:null,quote,prefix:null,suffix:null,startOffset:start,endOffset:start+quote.length,authorType:'USER',authorId:'local-author',authorName:'作者',content:'意见',status:'OPEN',reviewId:null,createdAt:now,updatedAt:now,replies:[]});
f.reference=(quote,start)=>({id:'f1',novelId:'n1',title:'红月伏笔',content:'',note:'',expectation:'',plannedChapter:null,status:'PLANTED',mentionCount:1,createdAt:now,updatedAt:now,
 touches:[{id:'tc1',foreshadowId:'f1',kind:'PLANT',summary:'埋下',chapterId:'c1',targetLabel:'第一章',score:null,scoreComment:'',scoredAt:null,createdAt:now,
  references:[{id:'r1',touchId:'tc1',targetType:'CHAPTER_CONTENT',targetId:'c1',label:'第一章',missing:false,quote,prefix:null,suffix:null,startOffset:start,endOffset:start+quote.length,anchor:{start,end:start+quote.length},status:'located',anchorSource:'selection',updatedAt:now}]}]});
const sse=()=>{let push;const body=new ReadableStream({start(c){push=c}});const enc=new TextEncoder();f.stream={push:e=>push.enqueue(enc.encode('data: '+JSON.stringify(e)+'\n\n')),end:()=>push.close()};return body};
const originalFetch=window.fetch.bind(window);
window.fetch=async(input,init={})=>{
 const url=String(input),method=(init.method||'GET').toUpperCase();
 if(!url.startsWith('/api/'))return originalFetch(input,init);
 const path=url.split('?')[0];f.requests.push({method,path,body:init.body?JSON.parse(init.body):null});
 const m=path.match(/^\/api\/novels\/n1\/chapters\/(c\d)$/);
 if(m&&method==='GET')return Response.json({chapter:f.chapters[m[1]]});
 if(m&&method==='PATCH'){const b=JSON.parse(init.body);const ch=f.chapters[m[1]];Object.assign(ch,{content:b.content,version:ch.version+1});return Response.json({chapter:ch})}
 if(path.endsWith('/generate')&&method==='POST')return new Response(sse(),{headers:{'content-type':'text/event-stream'}});
 if(path.endsWith('/candidates/k1'))return Response.json({candidate:{id:'k1',chapterId:'c1',status:'ready',content:BODY,contentHash:'h',baseVersion:1,wordCount:10}});
 if(path.endsWith('/candidates'))return Response.json({candidates:[{id:'k1',status:'ready',wordCount:10,createdAt:now,baseVersion:1}],nextCursor:null});
 if(path.match(/\/candidates\/k1$/))return Response.json({candidate:{id:'k1',status:'ready',content:BODY,contentHash:'h',baseVersion:1,createdAt:now}});
 if(path.endsWith('/versions'))return Response.json({versions:[{id:'ver-1',version:1,createdAt:now,restorable:true,wordCount:3}],nextCursor:null});
 if(path.endsWith('/versions/ver-1'))return Response.json({version:{id:'ver-1',version:1,createdAt:now,content:'旧版正文。',contentHash:'h0'}});
 if(path.endsWith('/comments')&&method==='GET')return Response.json({threads:f.threads});
 if(path.endsWith('/comments')&&method==='POST'){const b=JSON.parse(init.body);const t=f.thread(b.quote,b.startOffset);f.threads.push(t);return Response.json({comment:t})}
 if(path.includes('/score-report'))return Response.json({report:{targetType:'CHAPTER_CONTENT',targetId:'c1',targetLabel:'第一章',contentKind:'prose',supportsReaderPanel:true,score:null,scoredAt:null,stale:false,reviewing:false,contentEmpty:false,dimensions:[],agents:[],history:[]}});
 if(path.endsWith('/foreshadows'))return Response.json({foreshadows:f.references});
 if(path==='/api/novels/n1')return Response.json({novel:{id:'n1',title:'作品',volumes:[],characters:[],settings:[],theme:null},jobs:[]});
 return Response.json({});
};
window.desktop={command:async()=>{},onEvent:()=>()=>{},showTextContextMenu:async r=>{f.menus++;return {requestId:r.requestId,command:null}},cancelTextContextMenu:async()=>{},readClipboardText:async()=>'',writeClipboardText:async t=>{f.writes.push(t)}};
f.localFonts=null;window.queryLocalFonts=async()=>{if(!f.localFonts)throw new Error('denied');return f.localFonts.map(family=>({family}))};
installTextPreviewSelection(document);
const bootstrap={...defaultState,platform:'darwin',settings:{...defaultState.settings,appearance:{...defaultState.settings.appearance,bodyFontSize:16,lineHeight:1.8,bodyFont:'serif'}}};
useDesktopStore.setState({bootstrap});
const rootStyle=document.documentElement.style;
rootStyle.setProperty('--desktop-body-size','16px');rootStyle.setProperty('--desktop-body-line-height','1.8');rootStyle.setProperty('--desktop-body-font',desktopFontFamily('serif',true));rootStyle.setProperty('--font-ui',desktopFontFamily('system'));
f.setBodyFont=font=>rootStyle.setProperty('--desktop-body-font',desktopFontFamily(font,true));
function Probes(){useDesktopCommands({'ai.stop':{enabled:()=>true,run:()=>{f.probes.aiStop++}},'file.save':{enabled:()=>true,run:()=>{f.probes.fileSave++}}});return null}
function ThemeBridge(){const {setTheme}=useTheme();f.setTheme=setTheme;return null}
f.mount=(mode,width,refId='c1')=>{
 const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity},mutations:{retry:false}}});
 const body=mode==='candidate'?<CandidatePanel novelId='n1' refId='k1' chapterId='c1'/>
  :mode==='plain'?<MarkdownEditor value={BODY} onChange={()=>{}} defaultMode='preview' commentsTarget={{novelId:'n1',targetType:'SETTING',targetId:'s1'}}/>
  :mode==='tabs'?<><div hidden><ChapterContentPanel novelId='n1' refId='c2'/></div><ChapterContentPanel novelId='n1' refId={refId}/></>
  :<ChapterContentPanel novelId='n1' refId={refId}/>;
 const root=createRoot(document.getElementById('app'));
 flushSync(()=>root.render(<ThemeProvider attribute='class' defaultTheme='paper' themes={['paper','ink']} enableSystem={false} disableTransitionOnChange>
  <QueryClientProvider client={client}><CommentDraftAccount userId='local-author'><DesktopCommandController/><Probes/><ThemeBridge/>
   <div id='panel' style={{width,height:760,display:'flex',flexDirection:'column'}}>{body}</div><Toaster/></CommentDraftAccount></QueryClientProvider></ThemeProvider>));
 f.unmount=()=>flushSync(()=>root.unmount());
};
`
const bundled = Promise.all([
  build({ stdin: { contents, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false, platform: "browser", format: "esm", outfile: "chapter-reader-fixture.js",
    loader: { ".ttf": "dataurl" }, define: { "process.env.NODE_ENV": '"development"' }, tsconfig: "tsconfig.json", minify: true }),
  build({ entryPoints: ["node_modules/monaco-editor/esm/vs/editor/editor.worker.js"], bundle: true, write: false, platform: "browser", format: "esm", minify: true }),
  css,
]).then(([main, worker, styles]) => ({ script: main.outputFiles!.find(file => file.path.endsWith(".js"))!.text, css: styles + "\n" + (main.outputFiles!.find(file => file.path.endsWith(".css"))?.text ?? ""), worker: worker.outputFiles![0].text }))

let browser: Browser
test.before(async () => { browser = await chromium.launch({ headless: true, ...(process.env.SHAKEINK_TEST_CHROMIUM ? { executablePath: process.env.SHAKEINK_TEST_CHROMIUM } : {}) }) })
test.after(async () => { await browser?.close() })

type Key = (key: string, mods?: string[], code?: string, keyCode?: number) => Promise<void>
interface Ctx { page: Page; key: Key; cdp: CDPSession; remount: (mode?: string, width?: number, refId?: string) => Promise<void> }
async function scenario(options: { mode?: string; width?: number; refId?: string; setup?: string }, run: (ctx: Ctx) => Promise<void>) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } }), page = await context.newPage(), pageErrors: string[] = []
  page.setDefaultTimeout(15000); page.on("pageerror", error => pageErrors.push(error.message))
  try {
    const built = await bundled
    await context.route("**/*", async route => {
      const path = new URL(route.request().url()).pathname
      if (path === "/monaco-worker.js" || path.endsWith("editor.worker.js")) { await route.fulfill({ contentType: "text/javascript", body: built.worker }); return }
      if (route.request().isNavigationRequest()) { await route.fulfill({ contentType: "text/html", body: '<html lang="zh-CN"><body><div id="app"></div></body></html>' }); return }
      await route.abort()
    })
    await page.goto("http://127.0.0.1:1/chapter-reader")
    await page.addStyleTag({ content: built.css }); await page.addScriptTag({ content: built.script, type: "module" })
    await page.waitForFunction(() => !!(window as any).f?.mount)
    if (options.setup) await page.evaluate(options.setup)
    const remount = async (mode = options.mode ?? "chapter", width = options.width ?? 1200, refId = options.refId ?? "c1") => {
      await page.evaluate(([m, w, r]) => { const f = (window as any).f; f.unmount?.(); f.mount(m, w, r) }, [mode, width, refId] as const)
      await page.locator(".markdown-body:visible").first().waitFor()
    }
    await remount(); await page.bringToFront()
    const cdp = await context.newCDPSession(page)
    const modifiers = { Alt: 1, Control: 2, Meta: 4, Shift: 8 } as const
    const key: Key = async (name, mods = [], code, keyCode) => {
      const bits = mods.reduce((sum, mod) => sum | modifiers[mod as keyof typeof modifiers], 0)
      const upper = name.length === 1 ? name.toUpperCase() : name
      const c = code ?? (name.length === 1 ? `Key${upper}` : name), k = keyCode ?? (name === "Escape" ? 27 : upper.charCodeAt(0))
      await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: name, code: c, windowsVirtualKeyCode: k, modifiers: bits })
      await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: name, code: c, windowsVirtualKeyCode: k, modifiers: bits })
      await frames(page)
    }
    await run({ page, key, cdp, remount }); assert.deepEqual(pageErrors, [])
  } finally { await page.evaluate(() => (window as any).f?.unmount?.()).catch(() => {}); await context.close() }
}
const frames = (page: Page) => page.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))))
const style = (page: Page, selector: string, props: string[], pseudo?: string) => page.locator(selector).first().evaluate((el, [p, ps]) => {
  const s = getComputedStyle(el, ps as string | undefined); return Object.fromEntries((p as string[]).map(k => [k, s.getPropertyValue(k)]))
}, [props, pseudo] as const)
const f = <T,>(page: Page, expr: string) => page.evaluate(`(()=>{const f=window.f;return ${expr}})()`) as Promise<T>
const settingsButton = (page: Page) => page.getByRole("button", { name: "阅读设置", exact: true })
const popup = (page: Page) => page.getByRole("dialog", { name: "阅读设置" })
const openSettings = async (page: Page) => { if (!(await popup(page).isVisible())) await settingsButton(page).click(); await popup(page).waitFor() }
const pressed = (page: Page, name: string) => popup(page).getByRole("button", { name, exact: true })
const toggle = (page: Page, name: string) => popup(page).getByRole("switch", { name, exact: true })
const head = (page: Page) => page.getByRole("group", { name: "章节信息", exact: true })
const pageBg = async (page: Page) => (await style(page, ".chapter-reader-page", ["background-color"]))["background-color"]
const firstP = "[data-block] p"
// ---------- §2 header and layout ----------
test("CR611-01/02/03/04/05/06/07/08: default reader layout (paper, wide)", () => scenario({}, async ({ page }) => {
  const h = head(page)
  assert.equal(await h.locator(".chapter-reader-volume").innerText(), "第一部 小丑")
  assert.equal(await h.locator(".chapter-reader-number").innerText(), "第一章")
  assert.equal(await h.locator(".chapter-reader-title").innerText(), "绯红")
  const words = await page.locator(".desktop-markdown-editor span.font-mono").first().innerText()
  const n = words.replace(/^字数\s*/, "")
  // 2026-11-28 user: WRITTEN (已生成) is not shown in the header; other statuses are.
  assert.deepEqual(await h.locator(".chapter-reader-meta > span").allInnerTexts(), [`${n} 字`])
  assert.equal(await h.evaluate(el => !!el.compareDocumentPosition(document.querySelector("[data-block]")!) && (el.compareDocumentPosition(document.querySelector("[data-block]")!) & Node.DOCUMENT_POSITION_FOLLOWING) > 0), true)
  assert.equal((await style(page, '[role="group"][aria-label="章节信息"]', ["text-align"]))["text-align"], "center")
  // CR611-02
  assert.equal((await style(page, ".chapter-reader-head h1", ["font-size"]))["font-size"], "28.8px")
  const num = await style(page, ".chapter-reader-number", ["color", "font-size"])
  assert.equal(num.color, "rgb(176, 53, 36)"); assert.equal(num["font-size"], "16.128px")
  // CR611-03
  const crumb = page.locator("h2.chapter-crumb")
  assert.equal((await crumb.innerText()).replace(/\s+/g, " "), "第一部 小丑 › 第一章 绯红")
  assert.equal(await crumb.getAttribute("title"), "第一部 小丑 › 第一章 绯红")
  assert.equal((await style(page, "h2.chapter-crumb", ["white-space"]))["white-space"], "nowrap")
  assert.equal((await style(page, ".chapter-crumb-chapter", ["text-overflow"]))["text-overflow"], "ellipsis")
  assert.ok(await page.getByText("已生成", { exact: true }).first().isVisible())
  assert.ok(await page.getByRole("button", { name: "正文功能菜单", exact: true }).isVisible())
  assert.equal(await page.getByText(/第 1 卷 · 第 1 章《/).count(), 0)
  // CR611-04
  const geo = await page.evaluate(() => { const s = document.querySelector(".chapter-reader")!.getBoundingClientRect(), p = document.querySelector(".chapter-reader-page")!.getBoundingClientRect(); return { width: p.width, left: p.left - s.left, right: s.right - p.right } })
  assert.equal(geo.width, 900); assert.ok(Math.abs(geo.left - geo.right) <= 1, JSON.stringify(geo))
  const pg = await style(page, ".chapter-reader-page", ["background-color", "box-shadow", "color"])
  assert.equal(pg["background-color"], "rgb(251, 246, 233)"); assert.notEqual(pg["box-shadow"], "none"); assert.equal(pg.color, "rgb(51, 41, 28)")
  assert.equal((await style(page, ".chapter-reader", ["background-color"]))["background-color"], "rgb(239, 231, 210)")
  // CR611-05 (settings say 16px / 1.8; the reader overrides them)
  const p = await style(page, firstP, ["font-size", "line-height", "text-indent", "margin-top", "margin-bottom", "text-align", "letter-spacing", "font-family"])
  assert.deepEqual([p["font-size"], p["line-height"], p["text-indent"], p["margin-top"], p["margin-bottom"], p["text-align"], p["letter-spacing"]], ["18px", "35.1px", "36px", "0px", "13.5px", "justify", "0.36px"])
  assert.match(p["font-family"], /Noto Serif SC/)
  // UI font: html uses font-sans = var(--font-ui)
  const ui = await page.evaluate(() => getComputedStyle(document.documentElement).fontFamily)
  assert.match(ui, /^system-ui/)
  for (const sel of [".chapter-reader-meta", ".chapter-reader-end small"]) assert.equal((await style(page, sel, ["font-family"]))["font-family"], ui, sel)
  // CR611-06
  const indents = await page.locator("[data-preview-chrome], [data-preview-chrome] *").evaluateAll(els => els.map(el => getComputedStyle(el).textIndent))
  assert.ok(indents.length > 0 && indents.every(v => v === "0px"), JSON.stringify(indents))
  // CR611-07
  const end = page.locator(".chapter-reader-end")
  assert.equal(await end.locator("> span").innerText(), "本章完"); assert.equal(await end.locator("small").innerText(), `${n} 字`)
  assert.equal(await end.evaluate(el => !!(el.compareDocumentPosition(document.querySelectorAll("[data-block]")[3]) & Node.DOCUMENT_POSITION_PRECEDING)), true)
  assert.equal(await page.locator(".chapter-reader-ornament").innerText(), "")
  // CR611-08
  assert.equal((await style(page, ".chapter-reader-head h1", ["content"], "::after")).content, "none")
  assert.equal((await style(page, ".chapter-reader-head h1", ["border-left-width"]))["border-left-width"], "0px")
}))

test("CR611-01c: statuses other than 已生成 are shown in the header", () => scenario({}, async ({ page, remount }) => {
  for (const [status, label] of [["OUTLINE", "大纲待评审"], ["REVIEWED", "评审通过"], ["CHAPTER_REVIEWED", "正文已评审"], ["FINAL", "已定稿"]]) {
    await page.evaluate(st => { (window as any).f.chapters.c1.status = st }, status); await remount()
    assert.deepEqual((await head(page).locator(".chapter-reader-meta > span").allInnerTexts()).slice(1), [label], status)
  }
  await page.evaluate(() => { (window as any).f.chapters.c1.status = "WRITTEN" }); await remount()
  assert.equal(await head(page).getByText("已生成").count(), 0)
  assert.ok(await page.locator("h2.chapter-crumb ~ *").getByText("已生成", { exact: true }).first().isVisible(), "top bar badge still shows it")
}))

test("CR611-01b: thousands separator matches the toolbar", () => scenario({ refId: "c2" }, async ({ page }) => {
  assert.equal(await page.locator(".desktop-markdown-editor span.font-mono").first().innerText(), "字数 1,236")
  assert.equal(await head(page).locator(".chapter-reader-meta > span").first().innerText(), "1,236 字")
  // CR611-12
  assert.equal(await head(page).locator(".chapter-reader-volume").innerText(), "第二卷 · 青石巷")
  assert.equal(await head(page).locator(".chapter-reader-number").innerText(), "第三章")
  assert.equal(await head(page).locator(".chapter-reader-title").innerText(), "灯下来客")
  assert.equal((await page.locator("h2.chapter-crumb").innerText()).replace(/\s+/g, " "), "第二卷 青石巷 › 第三章 灯下来客")
}))

test("CR611-13/14: titles that carry their own number", () => scenario({ setup: "f.chapters.c1.title='第三章'" }, async ({ page, remount }) => {
  assert.equal(await head(page).locator(".chapter-reader-number").count(), 0)
  assert.equal(await head(page).locator("h1").innerText(), "第三章")
  await page.evaluate(() => { (window as any).f.chapters.c1.title = "第1章：开端" }); await remount()
  assert.equal(await head(page).locator(".chapter-reader-number").innerText(), "第1章")
  assert.equal(await head(page).locator(".chapter-reader-title").innerText(), "开端")
}))

test("CR611-05b/09: body font follows settings; ink theme colours", () => scenario({}, async ({ page }) => {
  await page.evaluate(() => (window as any).f.setBodyFont("system")); await frames(page)
  assert.match((await style(page, firstP, ["font-family"]))["font-family"], /^system-ui/)
  await page.evaluate(() => (window as any).f.setBodyFont("serif"))
  await page.evaluate(() => (window as any).f.setTheme("ink")); await page.waitForFunction(() => document.documentElement.classList.contains("ink"))
  const pg = await style(page, ".chapter-reader-page", ["background-color", "color", "box-shadow"])
  assert.equal(pg["background-color"], "rgb(26, 23, 22)"); assert.equal(pg.color, "rgb(214, 206, 196)"); assert.notEqual(pg["box-shadow"], "none")
  assert.equal((await style(page, ".chapter-reader", ["background-color"]))["background-color"], "rgb(15, 13, 12)")
  assert.equal((await style(page, ".chapter-reader-number", ["color"])).color, "rgb(224, 122, 95)")
  assert.match((await style(page, firstP, ["font-family"]))["font-family"], /Noto Serif SC/)
}))

test("CR611-10/11: narrow panel fills the page and keeps the comment button off the text", () => scenario({ width: 560 }, async ({ page }) => {
  const geo = await page.evaluate(() => {
    const s = document.querySelector<HTMLElement>(".chapter-reader")!, p = document.querySelector<HTMLElement>(".chapter-reader-page")!
    const sr = s.getBoundingClientRect(), pr = p.getBoundingClientRect()
    const below = document.elementFromPoint(pr.left + 20, Math.min(pr.bottom, sr.bottom) - 10)
    return { inner: s.clientWidth, width: pr.width, height: pr.height, view: s.clientHeight, belowIsPage: !!below?.closest(".chapter-reader-page") }
  })
  assert.equal(geo.width, geo.inner); assert.ok(geo.height >= geo.view, JSON.stringify(geo)); assert.ok(geo.belowIsPage)
  const pg = await style(page, ".chapter-reader-page", ["box-shadow", "padding-left"])
  assert.equal(pg["box-shadow"], "none"); assert.equal(pg["padding-left"], "40px")
  const p1 = page.locator(firstP).first(); await p1.hover()
  const btn = page.getByTestId("text-comment-block-add"); await btn.waitFor()
  const [b, t] = [await btn.boundingBox(), await p1.evaluate(el => { const r = document.createRange(); r.selectNodeContents(el); return r.getClientRects()[0].left })]
  assert.ok(b!.x + b!.width <= t + 0.5, `${b!.x + b!.width} <= ${t}`)
}))
test("CR611-11b: narrow toolbar keeps existing controls on one line", () => scenario({ width: 509 }, async ({ page }) => {
  const h = await page.evaluate(() => {
    const bar = document.querySelector(".desktop-markdown-editor > div")!
    const [bar0, words, flag, trigger] = [bar, bar.querySelector("span.font-mono")!, bar.querySelector(".foreshadow-add")!, bar.querySelector(".chapter-reader-trigger")!].map(el => Math.round(el.getBoundingClientRect().height))
    return { bar: bar0, words, flag, trigger }
  })
  // Single-line heights, the same as without the reader (words 16px, 标注伏笔 23px).
  assert.deepEqual([h.bar, h.words, h.flag], [36, 16, 23], JSON.stringify(h))
  assert.ok(h.trigger <= 24, JSON.stringify(h))
  assert.equal(await settingsButton(page).locator(".chapter-reader-trigger-text").evaluate(el => el.getBoundingClientRect().width), 1)
  await settingsButton(page).click(); await popup(page).waitFor()
}))

// ---------- §3 reader settings ----------
test("CR611-20/21/21b/22/23/24/25/26: settings popover", () => scenario({}, async ({ page }) => {
  // CR611-20: before the mode switch
  const order = await page.evaluate(() => { const b = [...document.querySelectorAll("button")]; return [b.findIndex(x => x.classList.contains("chapter-reader-trigger")), b.findIndex(x => x.textContent?.trim() === "编辑")] })
  assert.ok(order[0] >= 0 && order[0] < order[1], JSON.stringify(order))
  assert.equal((await settingsButton(page).textContent())!.trim(), "Aa阅读设置")
  assert.ok(await settingsButton(page).locator(".chapter-reader-trigger-text").isVisible(), "label shown at full width")
  await openSettings(page)
  for (const label of ["章首对齐", "章首显示", "字号", "背景（宣纸）"]) assert.ok(await popup(page).getByText(label, { exact: true }).isVisible(), label)
  // CR611-21
  assert.equal(await pressed(page, "居中").getAttribute("aria-pressed"), "true")
  for (const n of ["显示卷名", "显示章节号", "显示字数"]) assert.equal(await toggle(page, n).getAttribute("aria-checked"), "true", n)
  assert.equal(await pressed(page, "18").getAttribute("aria-pressed"), "true")
  assert.deepEqual(await popup(page).locator(".chapter-reader-swatch").evaluateAll(els => els.map(e => e.getAttribute("aria-label"))), ["米黄（默认）", "护眼绿", "纯白"])
  assert.equal(await pressed(page, "米黄（默认）").getAttribute("aria-pressed"), "true")
  // CR611-21c (2026-11-28 user: the three 宣纸 swatches looked identical): each swatch shows its own colour
  const swatchColours = () => popup(page).locator(".chapter-reader-swatch").evaluateAll(els => els.map(e => getComputedStyle(e).backgroundColor))
  assert.deepEqual(await swatchColours(), ["rgb(251, 246, 233)", "rgb(227, 238, 219)", "rgb(255, 255, 255)"])
  // CR611-21b: selection ring
  assert.equal(((await style(page, '.chapter-reader-swatch[aria-pressed="true"]', ["box-shadow"]))["box-shadow"].match(/rgb/g) ?? []).length, 2)
  // CR611-22
  await pressed(page, "左对齐").click()
  assert.equal((await style(page, '[role="group"][aria-label="章节信息"]', ["text-align"]))["text-align"], "left")
  const orn = await style(page, ".chapter-reader-ornament", ["width", "height", "background-color"], "::after")
  assert.deepEqual([orn.width, orn.height, orn["background-color"]], ["48px", "2px", "rgb(176, 53, 36)"])
  assert.equal((await style(page, ".chapter-reader-ornament i", ["display"])).display, "none")
  assert.equal((await style(page, ".chapter-reader-ornament", ["display"], "::before")).display, "none")
  assert.ok(await popup(page).isVisible())
  // CR611-23/24/25
  await toggle(page, "显示卷名").click(); assert.equal(await head(page).getByText("第一部 小丑").count(), 0); assert.ok(await head(page).getByText("绯红").isVisible())
  await popup(page).locator(".chapter-reader-toggle").filter({ hasText: "章节号" }).locator("span").first().click()
  assert.equal(await head(page).locator("h1").innerText(), "绯红", "row text toggles too")
  await toggle(page, "显示字数").click()
  assert.deepEqual(await head(page).locator(".chapter-reader-meta > span").allInnerTexts(), [])
  assert.equal(await page.locator(".chapter-reader-end").innerText(), "本章完")
  // CR611-26
  const words = await page.locator(".desktop-markdown-editor span.font-mono").first().innerText()
  for (const size of [16, 20, 22]) {
    await pressed(page, String(size)).click()
    assert.equal((await style(page, firstP, ["font-size"]))["font-size"], `${size}px`)
    assert.equal((await style(page, ".chapter-reader-head h1", ["font-size"]))["font-size"], `${+(size * 1.6).toFixed(3)}px`)
  }
  assert.equal(await page.locator(".desktop-markdown-editor span.font-mono").first().innerText(), words)
}))

test("CR611-27/28/29: per-theme background palettes are remembered separately", () => scenario({}, async ({ page }) => {
  await openSettings(page)
  await pressed(page, "护眼绿").click(); assert.equal(await pageBg(page), "rgb(227, 238, 219)"); assert.equal((await style(page, ".chapter-reader-page", ["color"])).color, "rgb(38, 51, 31)")
  await pressed(page, "纯白").click(); assert.equal(await pageBg(page), "rgb(255, 255, 255)"); assert.equal((await style(page, ".chapter-reader-page", ["color"])).color, "rgb(34, 34, 34)")
  await pressed(page, "护眼绿").click()
  await page.evaluate(() => (window as any).f.setTheme("ink")); await page.waitForFunction(() => document.documentElement.classList.contains("ink"))
  assert.equal(await pageBg(page), "rgb(26, 23, 22)")
  await openSettings(page)
  assert.ok(await popup(page).getByText("背景（玄墨）", { exact: true }).isVisible())
  assert.deepEqual(await popup(page).locator(".chapter-reader-swatch").evaluateAll(els => els.map(e => e.getAttribute("aria-label"))), ["玄石（默认）", "墨绿", "夜蓝", "纯黑"])
  assert.equal(await pressed(page, "玄石（默认）").getAttribute("aria-pressed"), "true")
  assert.equal((await style(page, '.chapter-reader-swatch[aria-pressed="false"]', ["border-top-color"]))["border-top-color"], "rgba(255, 248, 240, 0.22)") // CR611-21b
  assert.deepEqual(await popup(page).locator(".chapter-reader-swatch").evaluateAll(els => els.map(e => getComputedStyle(e).backgroundColor)),
    ["rgb(26, 23, 22)", "rgb(21, 32, 27)", "rgb(22, 27, 37)", "rgb(5, 5, 5)"], "CR611-21c ink")
  for (const [name, bg] of [["墨绿", "rgb(21, 32, 27)"], ["夜蓝", "rgb(22, 27, 37)"], ["纯黑", "rgb(5, 5, 5)"]]) { await pressed(page, name).click(); assert.equal(await pageBg(page), bg, name) }
  await pressed(page, "夜蓝").click()
  await page.evaluate(() => (window as any).f.setTheme("paper")); await page.waitForFunction(() => document.documentElement.classList.contains("paper"))
  assert.equal(await pageBg(page), "rgb(227, 238, 219)")
  await openSettings(page); assert.equal(await pressed(page, "护眼绿").getAttribute("aria-pressed"), "true")
  await page.evaluate(() => (window as any).f.setTheme("ink")); await page.waitForFunction(() => document.documentElement.classList.contains("ink"))
  assert.equal(await pageBg(page), "rgb(22, 27, 37)")
  await openSettings(page); assert.equal(await pressed(page, "夜蓝").getAttribute("aria-pressed"), "true")
}))

test("CR611-30/31: settings persist across reload and chapters, and never write the work", () => scenario({}, async ({ page, remount }) => {
  await openSettings(page)
  await pressed(page, "左对齐").click(); await toggle(page, "显示字数").click(); await pressed(page, "20").click(); await pressed(page, "护眼绿").click()
  const check = async () => {
    assert.equal((await style(page, '[role="group"][aria-label="章节信息"]', ["text-align"]))["text-align"], "left")
    assert.equal(await head(page).getByText(/字$/).count(), 0)
    assert.equal((await style(page, firstP, ["font-size"]))["font-size"], "20px")
    assert.equal(await pageBg(page), "rgb(227, 238, 219)")
  }
  await check()
  await page.reload(); const built = await bundled
  await page.addStyleTag({ content: built.css }); await page.addScriptTag({ content: built.script, type: "module" })
  await page.waitForFunction(() => !!(window as any).f?.mount); await remount()
  await check()
  await remount("chapter", 1200, "c2"); await check()
  const writes = await f<{ method: string }[]>(page, "f.requests.filter(r=>r.method!=='GET')")
  assert.deepEqual(writes, [])
  assert.equal(await f<string>(page, "f.chapters.c1.version"), 1)
}))
// ---------- §4 popover dismissal ----------
test("CR611-40..47: inside clicks keep it open, outside clicks close it and still act", () => scenario({}, async ({ page }) => {
  await openSettings(page)
  await toggle(page, "显示卷名").click(); await pressed(page, "20").click(); await pressed(page, "纯白").click(); await pressed(page, "左对齐").click()
  assert.ok(await popup(page).isVisible(), "CR611-40")
  assert.equal(await pageBg(page), "rgb(255, 255, 255)")
  const outside: [string, () => Promise<void>][] = [
    ["CR611-41 body", () => page.locator(firstP).nth(0).click()],
    ["CR611-42 header", () => head(page).locator("h1").click()],
    ["CR611-43 desk", async () => { const box = (await page.locator(".chapter-reader").boundingBox())!; await page.mouse.click(box.x + 12, box.y + 300) }],
    ["CR611-44 crumb", () => page.locator("h2.chapter-crumb").click()],
    ["CR611-45 word count", () => page.locator(".desktop-markdown-editor span.font-mono").first().click()],
    ["CR611-41b comments toggle acts", () => page.getByTitle("显示/隐藏所有评论").click()],
  ]
  for (const [name, act] of outside) {
    await openSettings(page); await act(); await popup(page).waitFor({ state: "hidden" }).catch(() => {})
    assert.equal(await popup(page).isVisible(), false, name)
  }
  // CR611-41b: the outside click on the comments toggle also took effect
  assert.ok(await page.getByTitle("显示/隐藏所有评论").locator("svg.lucide-message-square-off").count() === 1, "comments toggled off")
  // CR611-47
  await openSettings(page); await settingsButton(page).click(); await popup(page).waitFor({ state: "hidden" })
  // CR611-46: the click on 编辑 also switches the mode
  await openSettings(page); await page.getByRole("button", { name: "编辑", exact: true }).click()
  await popup(page).waitFor({ state: "hidden" }); await page.locator(".monaco-editor").first().waitFor()
  assert.equal(await settingsButton(page).count(), 0)
}))

test("CR611-48/49: Esc closes it; global commands are held while it is open", () => scenario({}, async ({ page, key }) => {
  await openSettings(page); await key("Escape")
  await popup(page).waitFor({ state: "hidden" })
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains("chapter-reader-trigger")), true)
  assert.equal(await f<number>(page, "f.probes.aiStop"), 0)
  await openSettings(page); await page.keyboard.press("Escape"); await popup(page).waitFor({ state: "hidden" })
  // CR611-49
  await openSettings(page)
  await key("s", ["Meta"]); await page.evaluate(() => window.dispatchEvent(new CustomEvent("desktop:command", { detail: "file.save" }))); await frames(page)
  assert.equal(await f<number>(page, "f.probes.fileSave"), 0)
  await page.locator(firstP).nth(1).click(); await popup(page).waitFor({ state: "hidden" })
  await key("s", ["Meta"]); assert.equal(await f<number>(page, "f.probes.fileSave"), 1)
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("desktop:command", { detail: "file.save" }))); await frames(page)
  assert.equal(await f<number>(page, "f.probes.fileSave"), 2)
}))

// ---------- §5 body behaviour ----------
const BODY_TEXT = (page: Page) => f<string>(page, "f.chapters.c1.content")
/** Select [from,to) characters of the text inside the n-th paragraph. */
const selectIn = (page: Page, n: number, from: number, to: number) => page.locator(firstP).nth(n).evaluate((el, [a, b]) => {
  const t = el.firstChild as Text, r = document.createRange(); r.setStart(t, a as number); r.setEnd(t, b as number)
  const s = getSelection()!; s.removeAllRanges(); s.addRange(r)
}, [from, to] as const)

test("CR611-50: 全选 selects only the body", () => scenario({}, async ({ page }) => {
  await page.getByRole("button", { name: "正文功能菜单", exact: true }).click()
  await page.getByRole("menuitem", { name: "全选", exact: true }).click(); await frames(page)
  const text = await page.evaluate(() => getSelection()!.toString())
  for (const s of ["甲段", "丁段"]) assert.ok(text.includes(s), s)
  for (const s of ["第一部", "绯红", "本章完", "已生成"]) assert.ok(!text.includes(s), s)
}))

test("CR611-51: empty body — header shows, no end marker, select-all copies nothing from the header", () => scenario({ setup: "f.chapters.c1.content=''" }, async ({ page, key }) => {
  assert.ok(await head(page).isVisible()); assert.equal(await page.locator(".chapter-reader-end").count(), 0)
  await page.locator(".chapter-reader").click({ position: { x: 12, y: 300 }, force: true })
  assert.ok(await page.evaluate(() => !!document.activeElement?.closest(".desktop-markdown-editor")), "focus is in the editor")
  await key("a", ["Meta"])
  const selected = await page.evaluate(() => getSelection()!.toString())
  for (const s of ["第一部", "绯红", "已生成"]) assert.ok(!selected.includes(s), selected)
  await key("c", ["Meta"])
  const writes = await f<string[]>(page, "f.writes")
  assert.ok(writes.every(w => !/第一部|绯红|已生成/.test(w)), JSON.stringify(writes))
}))

test("CR611-51b: with a body, Cmd+A/Cmd+C copies the body and nothing from the header", () => scenario({}, async ({ page, key }) => {
  await page.locator(firstP).first().click()
  await key("a", ["Meta"]); await key("c", ["Meta"])
  const writes = await f<string[]>(page, "f.writes")
  assert.equal(writes.length, 1, JSON.stringify(writes))
  assert.ok(writes[0].startsWith("甲段"), writes[0].slice(0, 20))
  for (const s of ["第一部", "绯红", "本章完", "已生成"]) assert.ok(!writes[0].includes(s), s)
}))

test("CR611-52/53/54: comments still anchor to the body", () => scenario({ setup: "f.threads.push(f.thread(f.chapters.c1.content.split('\\n\\n')[1].slice(0,6), f.chapters.c1.content.indexOf('乙段')))" }, async ({ page }) => {
  // CR611-54
  await page.locator("mark.text-comment-anchor").first().waitFor()
  assert.equal(await page.locator("mark.text-comment-anchor").first().innerText(), "乙段夏夏夏夏")
  // CR611-52
  const body = await BODY_TEXT(page), start = body.indexOf("丙段") + 2
  await selectIn(page, 2, 2, 6)
  const p3 = page.locator(firstP).nth(2), box = (await p3.boundingBox())!
  await page.mouse.move(box.x + 60, box.y + 10); await page.mouse.down(); await page.mouse.up()
  // docs/612 (approved v9): selecting text shows the AI toolbar, whose first button opens the same comment composer;
  // the old per-selection round button is hidden. Bring the selection into view so the toolbar is visible.
  await p3.evaluate(el => el.scrollIntoView({ block: "center" }))
  await selectIn(page, 2, 2, 6); await p3.dispatchEvent("mouseup")
  await page.getByRole("toolbar", { name: "AI 助手" }).getByRole("button", { name: "添加评论" }).click()
  await page.getByRole("textbox").last().fill("意见")
  await page.getByRole("button", { name: /^(发表|评论|提交)/ }).last().click()
  await page.waitForFunction(() => (window as any).f.requests.some((r: any) => r.method === "POST" && r.path.endsWith("/comments")))
  const post = await f<{ body: { quote: string; startOffset: number; endOffset: number } }>(page, "f.requests.find(r=>r.method==='POST'&&r.path.endsWith('/comments'))")
  assert.deepEqual([post.body.quote, post.body.startOffset, post.body.endOffset], [body.slice(start, start + 4), start, start + 4])
  // CR611-53
  await page.locator(firstP).nth(3).hover()
  const btn = page.getByTestId("text-comment-block-add"); await btn.waitFor()
  const [b, pg] = [(await btn.boundingBox())!, (await page.locator(".chapter-reader-page").boundingBox())!]
  const textLeft = await page.locator(firstP).nth(3).evaluate(el => el.getBoundingClientRect().left)
  assert.ok(b.x >= pg.x && b.x + b.width <= textLeft + 0.5, JSON.stringify({ b, pg, textLeft }))
}))

test("CR611-55/55b/55c/55d: the header is UI, not body text", () => scenario({}, async ({ page }) => {
  assert.equal((await style(page, ".chapter-reader-head h1", ["user-select"]))["user-select"], "none")
  const h1 = (await head(page).locator("h1").boundingBox())!, p1 = (await page.locator(firstP).first().boundingBox())!
  await page.mouse.move(h1.x + h1.width / 2, h1.y + h1.height / 2); await page.mouse.down()
  await page.mouse.move(p1.x + p1.width / 2, p1.y + 10, { steps: 8 }); await page.mouse.up(); await frames(page)
  assert.ok(!(await page.evaluate(() => getSelection()!.toString())).includes("绯红"))
  assert.equal(await page.getByTitle("添加评论").count(), 0, "CR611-55b")
  assert.ok(await page.getByRole("button", { name: "标注伏笔", exact: true }).isDisabled(), "CR611-55b")
  await page.evaluate(() => getSelection()!.removeAllRanges())
  // CR611-55c
  await page.getByTestId("text-comment-block-add").waitFor({ state: "hidden" }).catch(() => {})
  const hb = (await head(page).locator("h1").boundingBox())!
  for (const dx of [0.3, 0.5, 0.7]) await page.mouse.move(hb.x + hb.width * dx, hb.y + hb.height / 2)
  await page.getByTestId("text-comment-block-add").waitFor({ state: "hidden" })
  assert.equal(await page.getByTestId("text-comment-block-add").count(), 0)
  // CR611-55d
  await head(page).locator("h1").click({ button: "right" }); await frames(page)
  const afterHead = await f<number>(page, "f.menus")
  await page.locator(firstP).first().click({ button: "right" }); await frames(page)
  assert.equal(afterHead, 0); assert.ok((await f<number>(page, "f.menus")) > 0)
}))

test("CR611-55e: foreshadow marks stay in the body", () => scenario({ setup: "f.references.push(f.reference('乙段夏夏', f.chapters.c1.content.indexOf('乙段')))" }, async ({ page }) => {
  const mark = page.locator("mark.foreshadow-mark").first(); await mark.waitFor()
  assert.equal(await mark.evaluate(el => el.closest("[data-block]")?.getAttribute("data-block")), "1")
}))

test("CR611-56/57: split keeps the reader (narrow), edit and review drop it", () => scenario({}, async ({ page }) => {
  await page.getByRole("button", { name: "分屏", exact: true }).click(); await page.locator(".monaco-editor").first().waitFor()
  assert.ok(await head(page).isVisible())
  assert.equal((await style(page, ".chapter-reader-page", ["box-shadow"]))["box-shadow"], "none")
  assert.ok(await settingsButton(page).isVisible())
  await page.getByRole("button", { name: "编辑", exact: true }).click(); await frames(page)
  assert.equal(await head(page).count(), 0); assert.equal(await settingsButton(page).count(), 0)
  await page.getByRole("button", { name: "评审", exact: true }).click(); await frames(page)
  assert.equal(await head(page).count(), 0); assert.equal(await settingsButton(page).count(), 0)
}))

test("CR611-58: no end marker while generating; it returns after the commit", () => scenario({}, async ({ page }) => {
  await page.getByRole("button", { name: "正文功能菜单", exact: true }).click()
  await page.getByRole("menuitem", { name: "重新生成正文", exact: true }).click()
  await page.waitForFunction(() => !!(window as any).f.stream)
  await page.getByText(/正在生成候选稿/).waitFor()
  assert.ok(await head(page).isVisible()); assert.equal(await page.locator(".chapter-reader-end").count(), 0)
  await page.evaluate(() => {
    const f = (window as any).f, next = f.chapters.c1.content + "\n\n新段落。"
    f.chapters.c1 = { ...f.chapters.c1, content: next, version: 2 }
    f.stream.push({ type: "draft-delta", data: { delta: "新段落。" } })
    f.stream.push({ type: "content-committed", data: { operationId: "op", chapterId: "c1", version: 2, contentHash: "h2", previousWordCount: 0, wordCount: 0, deltaWordCount: 0, snapshotId: "s" } })
    f.stream.end()
  })
  await page.locator(".chapter-reader-end").waitFor()
  assert.equal(await page.locator(".chapter-reader-end > span").innerText(), "本章完")
}))

test("CR611-59: other commentable previews are unchanged", () => scenario({ mode: "candidate" }, async ({ page, remount }) => {
  for (const mode of ["candidate", "plain"]) {
    await remount(mode); await page.locator(firstP).first().waitFor()
    assert.equal(await page.locator(".chapter-reader, [data-preview-chrome], [data-reader-size]").count(), 0, mode)
    assert.equal(await settingsButton(page).count(), 0, mode)
    assert.equal(await page.locator(firstP).first().evaluate(el => el.closest("[data-block]")!.parentElement!.className), "relative mx-auto max-w-[720px] px-11 pb-24 pt-8", mode)
    const p = await style(page, firstP, ["font-size", "text-indent", "margin-top", "margin-bottom"])
    const expected = mode === "candidate" ? ["16px", "32px", "7.2px", "7.2px"] : ["16px", "0px", "12px", "12px"]
    assert.deepEqual([p["font-size"], p["text-indent"], p["margin-top"], p["margin-bottom"]], expected, mode)
  }
}))

test("CR611-60a/60b: history and candidate comparison previews are unchanged", () => scenario({}, async ({ page }) => {
  // History sits in .desktop-markdown-editor (16px setting → 32px); the comparison MarkdownPreview keeps globals' 15px (→ 30px).
  const plainPreview = async (scope: ReturnType<Page["locator"]>, indent: string) => {
    const p = scope.locator(".markdown-body p").first(); await p.waitFor()
    assert.equal(await scope.locator(".chapter-reader, [data-preview-chrome]").count(), 0)
    assert.equal(await p.evaluate(el => getComputedStyle(el).textIndent), indent)
  }
  await page.getByRole("button", { name: "正文功能菜单", exact: true }).click()
  await page.getByRole("menuitem", { name: "版本历史", exact: true }).click()
  await page.getByRole("button", { name: /修订 1/ }).first().click()
  await plainPreview(page.locator('section[aria-label="历史正文"]'), "32px")
  await page.getByRole("button", { name: "返回版本列表", exact: true }).click()
  await page.getByRole("button", { name: "返回正文", exact: true }).click()
  await page.getByRole("button", { name: "正文功能菜单", exact: true }).click()
  await page.getByRole("menuitem", { name: "候选稿", exact: true }).click()
  await page.getByRole("dialog").getByRole("button", { name: /可采用/ }).first().click()
  await plainPreview(page.getByRole("dialog").locator("section").filter({ hasText: "候选稿" }).last(), "30px")
}))

// ---------- 2026-11-28 user: Ctrl + wheel resizes the book page, not the text; smooth, fine, up to full panel ----------
const wheelAt = async (page: Page, cdp: CDPSession, selector: string, deltaY: number, ctrl = true) => {
  const box = (await page.locator(selector).first().boundingBox())!
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: box.x + box.width / 2, y: box.y + Math.min(box.height / 2, 200), deltaX: 0, deltaY, modifiers: ctrl ? 2 : 0 })
}
const settled = (page: Page) => page.waitForFunction(() => !document.querySelector<HTMLElement>(".chapter-reader")?.dataset.readerZooming)
const pageWidth = (page: Page) => page.locator(".chapter-reader-page").evaluate(el => Math.round(el.getBoundingClientRect().width))
const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("chapter-reader-v1") ?? "{}").state ?? {})

test("CR611-70: one Ctrl + wheel notch scales the page ~12.7%, animated; text and browser zoom stay", () => scenario({}, async ({ page, cdp }) => {
  const font = await style(page, firstP, ["font-size"])
  assert.equal(await pageWidth(page), 900)
  // Sample every frame while the width eases toward its target.
  await page.evaluate(`(() => { window.samples = []; const el = document.querySelector(".chapter-reader-page"); const tick = () => { window.samples.push(Math.round(el.getBoundingClientRect().width)); if (window.samples.length < 40) requestAnimationFrame(tick) }; requestAnimationFrame(tick) })()`)
  await wheelAt(page, cdp, firstP, -100); await settled(page)
  const w1 = await pageWidth(page)
  assert.ok(Math.abs(w1 - 900 * Math.exp(0.12)) <= 2, String(w1))
  const samples = await page.evaluate(() => (window as any).samples as number[])
  const between = new Set(samples.filter(v => v > 902 && v < w1 - 2))
  assert.ok(between.size >= 3, `intermediate widths ${JSON.stringify(samples)}`)
  assert.deepEqual(await style(page, firstP, ["font-size"]), font)
  assert.equal((await style(page, ".chapter-reader-head h1", ["font-size"]))["font-size"], "28.8px")
  assert.equal(await page.evaluate(() => window.visualViewport!.scale), 1)
  assert.equal((await stored(page)).pageWidth, w1)
  await wheelAt(page, cdp, firstP, 100); await settled(page)
  assert.ok(Math.abs((await pageWidth(page)) - 900) <= 2)
}))

test("CR611-70b: fine steps — a small pinch delta moves the page by a few px", () => scenario({}, async ({ page, cdp }) => {
  await wheelAt(page, cdp, firstP, -8); await settled(page)
  const w = await pageWidth(page)
  assert.ok(w > 900 && w <= 912, String(w))
  for (let i = 0; i < 5; i++) await wheelAt(page, cdp, firstP, -8)
  await settled(page)
  const w2 = await pageWidth(page)
  assert.ok(w2 > w && w2 - w <= 60, `${w} → ${w2}`)
}))

test("CR611-71: plain wheel scrolls and keeps the width", () => scenario({}, async ({ page, cdp }) => {
  const top = await page.locator(".chapter-reader").evaluate(el => el.scrollTop)
  await wheelAt(page, cdp, firstP, 200, false); await page.waitForTimeout(150)
  assert.equal(await pageWidth(page), 900)
  assert.ok((await page.locator(".chapter-reader").evaluate(el => el.scrollTop)) > top)
}))

test("CR611-72: zooming in fills the whole panel with no page edge; zooming out leaves it; minimum 540 (60%)", () => scenario({}, async ({ page, cdp }) => {
  for (let i = 0; i < 12; i++) await wheelAt(page, cdp, firstP, -100)
  await settled(page)
  const room = await page.locator(".chapter-reader").evaluate(el => el.clientWidth)
  assert.equal(await page.locator(".chapter-reader").getAttribute("data-reader-fill"), "true")
  assert.equal(await pageWidth(page), room)
  const pg = await style(page, ".chapter-reader-page", ["box-shadow", "border-top-left-radius", "margin-top"])
  assert.deepEqual([pg["box-shadow"], pg["border-top-left-radius"], pg["margin-top"]], ["none", "0px", "0px"])
  // No desk anywhere: the four panel corners are the page.
  const corners = await page.evaluate(() => {
    const s = document.querySelector(".chapter-reader")!.getBoundingClientRect()
    return [[s.left + 2, s.top + 2], [s.right - 2, s.top + 2], [s.left + 2, s.bottom - 2], [s.right - 2, s.bottom - 2]].map(([x, y]) => !!document.elementFromPoint(x, y)?.closest(".chapter-reader-page"))
  })
  assert.deepEqual(corners, [true, true, true, true])
  assert.equal((await stored(page)).pageFill, true)
  await wheelAt(page, cdp, firstP, 100); await settled(page)
  assert.equal(await page.locator(".chapter-reader").getAttribute("data-reader-fill"), "false")
  const out = await pageWidth(page)
  assert.ok(out < room && out > room * 0.8, `${out} / ${room}`)
  assert.equal((await stored(page)).pageFill, false)
  for (let i = 0; i < 30; i++) await wheelAt(page, cdp, firstP, 100)
  await settled(page)
  assert.equal(await pageWidth(page), 540)
}))

test("CR611-72b: approaching full width the desk margin shrinks continuously (no jump)", () => scenario({}, async ({ page, cdp }) => {
  const room = await page.locator(".chapter-reader").evaluate(el => el.clientWidth)
  const seen: number[] = []
  for (let i = 0; i < 40; i++) {
    await wheelAt(page, cdp, firstP, -12); await settled(page)
    const m = await page.locator(".chapter-reader-page").evaluate(el => parseFloat(getComputedStyle(el).marginTop))
    seen.push(m)
    if ((await pageWidth(page)) >= room) break
  }
  assert.ok(seen.some(v => v > 0 && v < 28), JSON.stringify(seen))
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i] <= seen[i - 1] + 0.01, JSON.stringify(seen))
}))

test("CR611-73: the line under the pointer stays in place", () => scenario({ refId: "c2" }, async ({ page, cdp }) => {
  const target = page.locator(firstP).nth(2)
  await page.locator(".chapter-reader").evaluate((el, t) => { el.scrollTop += (t as HTMLElement).getBoundingClientRect().top - el.getBoundingClientRect().top - 120 }, await target.elementHandle())
  const box = (await target.boundingBox())!, px = box.x + 40, py = box.y + 30
  const ratio = (py - box.y) / box.height
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: px, y: py, deltaX: 0, deltaY: 300, modifiers: 2 })
  await settled(page)
  assert.ok(Math.abs((await pageWidth(page)) - 720) <= 2, String(await pageWidth(page)))
  const after = (await target.boundingBox())!
  assert.ok(Math.abs(after.y + after.height * ratio - py) <= 3, JSON.stringify({ py, after }))
}))

test("CR611-74: width and fill persist across reload and chapters", () => scenario({}, async ({ page, cdp, remount }) => {
  await wheelAt(page, cdp, firstP, -100); await settled(page)
  const w = await pageWidth(page)
  const reload = async () => {
    await page.reload(); const built = await bundled
    await page.addStyleTag({ content: built.css }); await page.addScriptTag({ content: built.script, type: "module" })
    await page.waitForFunction(() => !!(window as any).f?.mount); await remount()
  }
  await reload(); assert.equal(await pageWidth(page), w)
  await remount("chapter", 1200, "c2"); assert.equal(await pageWidth(page), w)
  for (let i = 0; i < 12; i++) await wheelAt(page, cdp, firstP, -100)
  await settled(page); await reload()
  assert.equal(await page.locator(".chapter-reader").getAttribute("data-reader-fill"), "true")
  assert.equal(await pageWidth(page), await page.locator(".chapter-reader").evaluate(el => el.clientWidth))
}))

test("CR611-75: narrow panels always fill; other previews ignore Ctrl + wheel", () => scenario({ width: 560 }, async ({ page, cdp, remount }) => {
  const before = await page.evaluate(() => localStorage.getItem("chapter-reader-v1"))
  await wheelAt(page, cdp, firstP, -100); await page.waitForTimeout(100)
  assert.equal(await pageWidth(page), await page.locator(".chapter-reader").evaluate(el => el.clientWidth))
  assert.equal(await page.evaluate(() => localStorage.getItem("chapter-reader-v1")), before)
  assert.equal(await page.evaluate(() => window.visualViewport!.scale), 1)
  await remount("candidate", 1200); await page.locator(firstP).first().waitFor()
  await wheelAt(page, cdp, firstP, -100); await page.waitForTimeout(100)
  assert.equal(await page.evaluate(() => localStorage.getItem("chapter-reader-v1")), before)
  assert.equal(await page.locator(".chapter-reader").count(), 0)
}))

// ---------- 2026-11-28 user: 阅读设置 gains 正文字体 and 页面缩放 (slider + percentage, default 100%) ----------
const fontOf = (page: Page, selector = firstP) => style(page, selector, ["font-family"]).then(s => s["font-family"])
const zoomSlider = (page: Page) => popup(page).getByRole("slider", { name: "页面缩放", exact: true })
const zoomBox = (page: Page) => popup(page).getByRole("textbox", { name: "页面缩放百分比", exact: true })
/** What the 页面缩放 row reads: "100%" or "铺满". */
const zoomText = async (page: Page) => { const v = await zoomBox(page).inputValue(); return v === "铺满" ? v : `${v}%` }
const setSlider = (page: Page, position: number) => zoomSlider(page).evaluate((el: HTMLInputElement, v) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, String(v)); el.dispatchEvent(new Event("input", { bubbles: true }))
}, position)
const fontSelect = (page: Page) => popup(page).getByRole("combobox", { name: "正文字体", exact: true })
const typePercent = async (page: Page, text: string, commit: "Enter" | "blur" = "Enter") => {
  const box = zoomBox(page); await box.click(); await box.fill(text)
  if (commit === "Enter") await box.press("Enter"); else await popup(page).getByText("页面缩放", { exact: true }).click()
}
test("CR611-80: 正文字体 dropdown — dozens of grouped fonts, installed ones usable, missing ones marked", () => scenario({ setup: "f.localFonts=['Kaiti SC','PingFang SC','STFangsong','Songti SC','LXGW WenKai','某本机字体']" }, async ({ page }) => {
  await openSettings(page)
  const select = fontSelect(page)
  assert.equal(await select.evaluate(el => el.tagName), "SELECT")
  const groups = await select.locator("optgroup").evaluateAll(els => els.map(e => e.getAttribute("label")))
  assert.deepEqual(groups, ["宋体 / 明体", "楷体", "黑体", "仿宋", "其他", "本机字体"])
  const options = await select.locator("option").evaluateAll(els => els.map(e => ({ v: (e as HTMLOptionElement).value, t: e.textContent, d: (e as HTMLOptionElement).disabled })))
  const builtIn = options.filter(o => o.v !== "inherit" && !o.v.startsWith("local:"))
  assert.ok(builtIn.length >= 28, `built-in fonts: ${builtIn.length}`)
  assert.equal(options[0].t, "跟随设置"); assert.equal(await select.inputValue(), "inherit")
  for (const name of ["宋体", "楷体", "黑体", "仿宋", "微软雅黑", "思源宋体", "思源黑体", "霞鹜文楷", "苹方", "华文中宋", "方正书宋"]) assert.ok(options.some(o => o.t?.startsWith(name)), name)
  // installed (per the local font list) are enabled; others carry 「（未安装）」 and are disabled
  const byText = (t: string) => options.find(o => o.t?.startsWith(t))!
  assert.equal(byText("霞鹜文楷").d, false); assert.ok(!byText("霞鹜文楷").t!.includes("未安装"))
  assert.equal(byText("方正书宋").d, true); assert.ok(byText("方正书宋").t!.includes("（未安装）"))
  // the local group lists the rest of the machine's fonts
  assert.ok(options.some(o => o.v === "local:某本机字体" && o.t === "某本机字体"))
  // choosing applies to body and header; the popover stays open
  for (const [label, re] of [["楷体", /^"Kaiti SC"/], ["苹方", /^"PingFang SC"/], ["华文仿宋", /^"?STFangsong"?,/], ["霞鹜文楷", /^"LXGW WenKai"/]] as const) {
    await select.selectOption({ value: byText(label).v })
    assert.match(await fontOf(page), re, label); assert.match(await fontOf(page, ".chapter-reader-head h1"), re, label + " header")
    assert.ok(await popup(page).isVisible())
  }
  await select.selectOption("local:某本机字体"); assert.match(await fontOf(page), /^"?某本机字体"?,/)
  assert.equal((await stored(page)).font, "local:某本机字体")
  // 跟随设置 still follows 设置 › 正文字体; meta lines keep the UI font
  await page.evaluate(() => (window as any).f.setBodyFont("system")); await select.selectOption("inherit"); assert.match(await fontOf(page), /^system-ui/)
  await select.selectOption({ value: byText("楷体").v }); assert.match(await fontOf(page, ".chapter-reader-meta"), /^system-ui/)
}))

test("CR611-80b: a chosen font that is not installed falls back to 宋体 and says so; old saved values keep working", () => scenario({ setup: "f.localFonts=['Kaiti SC']" }, async ({ page, remount }) => {
  // A value saved by the previous version (short id "kai") is read back after reload.
  const reload = async (state: object) => {
    await page.evaluate(st => localStorage.setItem("chapter-reader-v1", JSON.stringify({ state: st, version: 0 })), state)
    await page.reload(); const built = await bundled
    await page.addStyleTag({ content: built.css }); await page.addScriptTag({ content: built.script, type: "module" })
    await page.waitForFunction(() => !!(window as any).f?.mount); await page.evaluate(() => { (window as any).f.localFonts = ["Kaiti SC"] }); await remount()
  }
  await reload({ font: "kai" })
  assert.match(await fontOf(page), /^"Kaiti SC"/, "old value kai still works")
  await openSettings(page)
  const select = fontSelect(page)
  assert.equal(await select.locator("option:checked").textContent(), "楷体")
  await reload({ font: "fz-shusong" })
  assert.match(await fontOf(page), /^"?FZShuSong-Z01"?,.*"Noto Serif SC"/, "the stack still ends in 宋体 so text renders")
  await openSettings(page)
  assert.ok(await popup(page).getByText("此字体未安装，正文暂以宋体显示", { exact: false }).isVisible())
}))

test("CR611-81: 页面缩放 slider — 100% (900px) in the middle, 60% at the left end, 铺满 at the right end", () => scenario({}, async ({ page, cdp }) => {
  await openSettings(page)
  const room = await page.locator(".chapter-reader").evaluate(el => el.clientWidth)
  const slider = zoomSlider(page), max = Math.floor(room / 900 * 100)
  assert.deepEqual([await slider.getAttribute("min"), await slider.getAttribute("max")], ["0", "1000"])
  assert.equal(await slider.inputValue(), "500", "100% is the middle of the track")
  assert.equal(await zoomText(page), "100%"); assert.equal(await slider.getAttribute("aria-valuetext"), "100%")
  assert.equal(await pageWidth(page), 900)
  // the thumb is drawn in the middle of the track
  const [track, thumbX] = [(await slider.boundingBox())!, await slider.evaluate(el => { const r = el.getBoundingClientRect(); return r.left + r.width / 2 })]
  assert.ok(Math.abs(thumbX - (track.x + track.width / 2)) <= 1)
  await setSlider(page, 250); assert.equal(await zoomText(page), "80%"); assert.equal(await pageWidth(page), 720)
  await setSlider(page, 0); assert.equal(await zoomText(page), "60%"); assert.equal(await pageWidth(page), 540)
  await setSlider(page, 750); assert.equal(await zoomText(page), `${Math.round((100 + max) / 2)}%`)
  // keyboard on the slider: one press is 1%
  await setSlider(page, 500); await slider.focus()
  await page.keyboard.press("ArrowRight"); assert.equal(await zoomText(page), "101%"); assert.equal(await pageWidth(page), 909)
  await page.keyboard.press("ArrowLeft"); await page.keyboard.press("ArrowLeft"); assert.equal(await zoomText(page), "99%"); assert.equal(await pageWidth(page), 891)
  // after typing in the box, focusing the slider and pressing arrows keeps moving it (focus stays on the slider)
  await typePercent(page, "100"); await slider.focus()
  for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowLeft")
  assert.equal(await zoomText(page), "95%"); assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "页面缩放")
  // the right end fills the panel
  await setSlider(page, 1000)
  assert.equal(await zoomText(page), "铺满"); assert.equal(await slider.getAttribute("aria-valuetext"), "铺满")
  assert.equal(await page.locator(".chapter-reader").getAttribute("data-reader-fill"), "true"); assert.equal(await pageWidth(page), room)
  assert.ok(await popup(page).isVisible(), "slider use keeps the popover open")
  // Ctrl + wheel and the slider stay in sync
  await page.locator(firstP).first().click(); await popup(page).waitFor({ state: "hidden" })
  await wheelAt(page, cdp, firstP, 100); await settled(page)
  const w = await pageWidth(page)
  await openSettings(page); assert.equal(await zoomText(page), `${Math.round(w / 9)}%`)
  assert.equal((await style(page, firstP, ["font-size"]))["font-size"], "18px")
}))

test("CR611-84: typing a percentage sets the page width (Enter or blur, clamped, ↑/↓, invalid input restored)", () => scenario({}, async ({ page }) => {
  await openSettings(page)
  const room = await page.locator(".chapter-reader").evaluate(el => el.clientWidth), max = Math.floor(room / 900 * 100)
  await typePercent(page, "85"); assert.equal(await pageWidth(page), 765); assert.equal(await zoomText(page), "85%")
  assert.equal(await zoomSlider(page).inputValue(), String(Math.round((85 - 60) / 40 * 500)))
  await typePercent(page, "120", "blur"); assert.equal(await pageWidth(page), 1080); assert.equal(await zoomText(page), "120%")
  await typePercent(page, "75%"); assert.equal(await pageWidth(page), 675, "a trailing % is accepted")
  await typePercent(page, "10"); assert.equal(await zoomText(page), "60%"); assert.equal(await pageWidth(page), 540)
  await typePercent(page, String(max + 50)); assert.equal(await zoomText(page), "铺满"); assert.equal(await pageWidth(page), room)
  await typePercent(page, "abc"); assert.equal(await zoomText(page), "铺满", "invalid input restores the current value")
  await typePercent(page, "100")
  const box = zoomBox(page); await box.focus()
  await box.press("ArrowUp"); assert.equal(await zoomText(page), "101%"); assert.equal(await pageWidth(page), 909)
  await box.press("ArrowDown"); await box.press("ArrowDown"); assert.equal(await zoomText(page), "99%")
  // Esc while typing restores the value and closes the popover
  await box.fill("70"); await box.press("Escape")
  await popup(page).waitFor({ state: "hidden" }); assert.equal(await pageWidth(page), 891)
  assert.equal((await stored(page)).pageWidth, 891)
}))

test("CR611-82: narrow panel — slider disabled and shows 铺满", () => scenario({ width: 560 }, async ({ page }) => {
  await openSettings(page)
  assert.ok(await zoomSlider(page).isDisabled()); assert.ok(await zoomBox(page).isDisabled()); assert.equal(await zoomText(page), "铺满")
}))

test("CR611-83: with another chapter tab mounted but hidden, the slider and Ctrl + wheel zoom the visible page", () => scenario({ mode: "tabs" }, async ({ page, cdp }) => {
  assert.equal(await page.locator(".chapter-reader").count(), 2)
  const visible = page.locator(".chapter-reader:visible .chapter-reader-page")
  await openSettings(page)
  assert.equal(await zoomSlider(page).isDisabled(), false, "slider enabled")
  await setSlider(page, 250)
  assert.equal(await visible.evaluate(el => Math.round(el.getBoundingClientRect().width)), 720)
  assert.equal(await zoomText(page), "80%")
  await page.keyboard.press("Escape").catch(() => {}); await popup(page).waitFor({ state: "hidden" }).catch(() => {})
  const box = (await page.locator(".chapter-reader:visible [data-block] p").first().boundingBox())!
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: box.x + 40, y: box.y + 10, deltaX: 0, deltaY: -100, modifiers: 2 })
  await page.waitForFunction(() => ![...document.querySelectorAll<HTMLElement>(".chapter-reader")].some(el => el.dataset.readerZooming))
  assert.ok(await visible.evaluate(el => Math.round(el.getBoundingClientRect().width)) > 720)
}))
