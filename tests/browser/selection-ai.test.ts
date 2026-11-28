import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { build } from "esbuild"
import postcss from "postcss"
import tailwindcss from "@tailwindcss/postcss"
import { chromium, type Browser, type CDPSession, type Page } from "playwright-core"

// docs/612 §4–§8 (SA). Real ChapterContentPanel, MarkdownEditor (Monaco), CommentablePreview, CommentComposer,
// ChapterHistory, DesktopCommandController, globals.css + desktop.css, Chromium. Only the local source API
// (including the selection-ai SSE) and the Electron bridge are stubbed. Not an Electron run.
const css = (async () => {
  const path = resolve("src/app/globals.css")
  return (await postcss([tailwindcss()]).process(await readFile(path, "utf8"), { from: path })).css + "\n" + await readFile("src/app/desktop.css", "utf8")
})()
const contents = String.raw`
import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';import {ThemeProvider,useTheme} from 'next-themes';import {Toaster} from 'sonner';
import {ChapterContentPanel} from './src/components/content/ChapterContentPanel';
import {CommentDraftAccount} from './src/components/comments/comment-drafts';
import {DesktopCommandController} from './src/components/desktop/DesktopCommandController';
import {useDesktopCommands} from './src/lib/desktop/use-command-target';
import {selectionAiEscapeOwner} from './src/lib/desktop/selection-ai-escape';
import {useDesktopStore} from './src/stores/desktop';import {useChatStore} from './src/stores/chat';import {defaultState} from './desktop/core/settings';
import {initializeStartupCommandCatalog} from './src/lib/desktop/startup-command-catalog';
import * as monacoApi from 'monaco-editor';
/* An edit through Monaco's public executeEdits fires the same change events as typing (headless CDP key input does
   not reach Monaco's EditContext reliably). */
window.monacoType=(offset,text)=>{const ed=monacoApi.editor.getEditors()[0],m=ed.getModel(),p=m.getPositionAt(offset);ed.focus();ed.executeEdits('test',[{range:{startLineNumber:p.lineNumber,startColumn:p.column,endLineNumber:p.lineNumber,endColumn:p.column},text}])};
import {installTextPreviewSelection} from './src/lib/desktop/text-selection';
initializeStartupCommandCatalog('darwin');
self.MonacoEnvironment={getWorker:()=>new Worker('/monaco-worker.js',{type:'module'})};
const P=(head,c,n)=>head+c.repeat(n)+'。';
const BODY=[P('甲段','春',30),P('乙段','夏',60),P('丙段','秋',30),P('丁段','冬',30),P('戊段','雪',30),P('己段','风',30)].join('\n\n');
const now='2026-11-29T00:00:00.000Z';
const f=window.f={requests:[],writes:[],probes:{aiStop:0,fileSave:0},threads:[],versions:[],streams:[],chapter:{id:'c1',volumeId:'v1',index:1,title:'第一章 绯红',outline:'大纲',content:BODY,wordCount:0,status:'WRITTEN',version:1,volume:{id:'v1',novelId:'n1',index:1,title:'第一部 小丑',summary:''}},models:[{id:'m1',name:'模型一',provider:'custom',modelId:'x1',tier:'NORMAL',contextWindow:0,free:false,thinkingEfforts:[]},{id:'m2',name:'模型二',provider:'custom',modelId:'x2',tier:'NORMAL',contextWindow:0,free:false,thinkingEfforts:[]}],commitFail:null};
f.BODY=BODY;
const sse=()=>{let ctrl;const body=new ReadableStream({start(c){ctrl=c}});const enc=new TextEncoder();const s={push:(type,data={})=>ctrl.enqueue(enc.encode('data: '+JSON.stringify({type,data})+'\n\n')),end:()=>{try{ctrl.close()}catch{}},aborted:false};f.streams.push(s);return {body,s}};
const versionRow=(v,reason,content)=>({id:'ver-'+v,version:v,createdAt:new Date(Date.parse(now)+v*1000).toISOString(),reason,wordCount:content.replace(/\s/g,'').length,restorable:true,content});
f.versions.push(versionRow(1,'正文更新',BODY));
const originalFetch=window.fetch.bind(window);
window.fetch=async(input,init={})=>{
 const url=String(input),method=(init.method||'GET').toUpperCase();
 if(!url.startsWith('/api/'))return originalFetch(input,init);
 const path=url.split('?')[0];const body=init.body?JSON.parse(init.body):null;f.requests.push({method,path,body});
 const ch=f.chapter;
 if(path==='/api/novels/n1/chapters/c1'&&method==='GET')return Response.json({chapter:ch});
 if(path==='/api/novels/n1/chapters/c1'&&method==='PATCH'){Object.assign(ch,{content:body.content,version:ch.version+1});f.versions.push(versionRow(ch.version,'正文更新',body.content));return Response.json({chapter:ch})}
 if(path.endsWith('/selection-ai')&&method==='POST'){const {body:stream,s}=sse();init.signal?.addEventListener('abort',()=>{s.aborted=true});s.request=body;return new Response(stream,{headers:{'content-type':'text/event-stream'}})}
 if(path.endsWith('/selection-ai/commit')){
  if(f.commitFail){const e=f.commitFail;f.commitFail=null;return Response.json({error:e.message,code:e.code},{status:409})}
  if(body.expectedVersion!==ch.version)return Response.json({error:'稿件已有新修订',code:'VERSION_CONFLICT'},{status:409});
  if(ch.content.slice(body.start,body.end)!==body.quote)return Response.json({error:'选中的原文已改动',code:'SELECTION_CHANGED'},{status:409});
  const before=ch.content,content=before.slice(0,body.start)+body.replacement+before.slice(body.end);
  const name={polish:'润色',expand:'扩写',shrink:'缩写',continue:'续写',rewrite:'重写',summary:'总结'}[body.action];
  f.versions.push(versionRow(ch.version+1,'AI '+name+'前',before));f.versions.push(versionRow(ch.version+2,'AI '+name,content));
  Object.assign(ch,{content,version:ch.version+2});f.lastCommit={operationId:body.operationId,before,name};
  return Response.json({receipt:{operationId:body.operationId,chapterId:'c1',version:ch.version,contentHash:'h',previousWordCount:0,wordCount:0,deltaWordCount:0,snapshotId:'s'},content})
 }
 if(path.endsWith('/selection-ai/undo')){
  const last=f.lastCommit;if(!last||body.replacementOperationId!==last.operationId||body.expectedVersion!==ch.version)return Response.json({error:'无法撤销',code:'SELECTION_UNDO_STALE'},{status:409});
  Object.assign(ch,{content:last.before,version:ch.version+1});f.versions.push(versionRow(ch.version,'撤销 AI '+last.name,last.before));
  return Response.json({receipt:{operationId:body.operationId,chapterId:'c1',version:ch.version,contentHash:'h',previousWordCount:0,wordCount:0,deltaWordCount:0,snapshotId:'s'},content:last.before})
 }
 if(path.endsWith('/versions'))return Response.json({versions:[...f.versions].reverse().map(({content,...v})=>v),nextCursor:null});
 const vm=path.match(/\/versions\/(ver-\d+)$/);if(vm){const v=f.versions.find(x=>x.id===vm[1]);return Response.json({version:{...v,contentHash:'h'}})}
 if(path.endsWith('/candidates'))return Response.json({candidates:[],nextCursor:null});
 if(path.endsWith('/comments')&&method==='GET')return Response.json({threads:f.threads});
 if(path.endsWith('/comments')&&method==='POST'){const t={id:'t-'+f.threads.length,novelId:'n1',targetType:'CHAPTER_CONTENT',targetId:'c1',parentId:null,quote:body.quote,prefix:body.prefix??null,suffix:body.suffix??null,startOffset:body.startOffset,endOffset:body.endOffset,authorType:'USER',authorId:'local-author',authorName:'作者',content:body.content,status:'OPEN',reviewId:null,createdAt:now,updatedAt:now,replies:[]};f.threads.push(t);return Response.json({comment:t})}
 if(path.includes('/score-report'))return Response.json({report:{targetType:'CHAPTER_CONTENT',targetId:'c1',targetLabel:'第一章',contentKind:'prose',supportsReaderPanel:true,score:null,scoredAt:null,stale:false,reviewing:false,contentEmpty:false,dimensions:[],agents:[],history:[]}});
 if(path.endsWith('/foreshadows'))return Response.json({foreshadows:[]});
 if(path==='/api/models')return Response.json({defaultModelId:f.models[0]?.id??null,models:f.models});
 if(path==='/api/novels/n1')return Response.json({novel:{id:'n1',title:'作品',volumes:[],characters:[{id:'c-lin',name:'林简',roleType:'PROTAGONIST'}],settings:[],theme:null},jobs:[]});
 return Response.json({});
};
window.desktop={command:async()=>{},onEvent:()=>()=>{},showTextContextMenu:async r=>({requestId:r.requestId,command:null}),cancelTextContextMenu:async()=>{},readClipboardText:async()=>'',writeClipboardText:async t=>{f.writes.push(t)}};
installTextPreviewSelection(document);
f.setPlatform=(platform,shortcuts={})=>useDesktopStore.setState({bootstrap:{...defaultState,platform,settings:{...defaultState.settings,shortcuts:{darwin:{},win32:{},linux:{},[platform]:shortcuts}}}});
f.setPlatform('darwin');
useChatStore.setState({modelChoice:{modelId:'m1',effort:null}});
f.chatModel=()=>useChatStore.getState().modelChoice;
f.chatGenerating=false;
function Probes(){useDesktopCommands({'ai.stop':{enabled:()=>f.chatGenerating&&!selectionAiEscapeOwner(),run:()=>{f.probes.aiStop++}},'file.save':{enabled:()=>true,run:()=>{f.probes.fileSave++}}});return null}
function ThemeBridge(){const {setTheme}=useTheme();f.setTheme=setTheme;return null}
f.mount=(width)=>{
 const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity},mutations:{retry:false}}});
 const root=createRoot(document.getElementById('app'));
 flushSync(()=>root.render(<ThemeProvider attribute='class' defaultTheme='paper' themes={['paper','ink']} enableSystem={false} disableTransitionOnChange>
  <QueryClientProvider client={client}><CommentDraftAccount userId='local-author'><DesktopCommandController/><Probes/><ThemeBridge/>
   <div id='panel' style={{width,height:760,display:'flex',flexDirection:'column'}}><ChapterContentPanel novelId='n1' refId='c1'/></div><Toaster/></CommentDraftAccount></QueryClientProvider></ThemeProvider>));
 f.unmount=()=>flushSync(()=>root.unmount());
};
`
const bundled = Promise.all([
  build({ stdin: { contents, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false, platform: "browser", format: "esm", outfile: "selection-ai-fixture.js",
    loader: { ".ttf": "dataurl" }, define: { "process.env.NODE_ENV": '"development"' }, tsconfig: "tsconfig.json", minify: true }),
  build({ entryPoints: ["node_modules/monaco-editor/esm/vs/editor/editor.worker.js"], bundle: true, write: false, platform: "browser", format: "esm", minify: true }),
  css,
]).then(([main, worker, styles]) => ({ script: main.outputFiles!.find(file => file.path.endsWith(".js"))!.text, css: styles + "\n" + (main.outputFiles!.find(file => file.path.endsWith(".css"))?.text ?? ""), worker: worker.outputFiles![0].text }))

let browser: Browser
test.before(async () => { browser = await chromium.launch({ headless: true, ...(process.env.SHAKEINK_TEST_CHROMIUM ? { executablePath: process.env.SHAKEINK_TEST_CHROMIUM } : {}) }) })
test.after(async () => { await browser?.close() })

type Key = (key: string, mods?: string[], code?: string, keyCode?: number) => Promise<void>
interface Ctx { page: Page; key: Key; cdp: CDPSession }
const frames = (page: Page) => page.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))))
const ev = <T,>(page: Page, expr: string) => page.evaluate(`(()=>{const f=window.f;return ${expr}})()`) as Promise<T>
async function scenario(options: { width?: number; setup?: string; mode?: "preview" | "edit" | "split" }, run: (ctx: Ctx) => Promise<void>) {
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
    // tsx keeps function names via an __name helper inside evaluate callbacks; provide it in the page.
    await page.addInitScript(() => { (globalThis as { __name?: unknown }).__name = (fn: unknown) => fn })
    await page.goto("http://127.0.0.1:1/selection-ai")
    await page.addStyleTag({ content: built.css }); await page.addScriptTag({ content: built.script, type: "module" })
    await page.waitForFunction(() => !!(window as any).f?.mount)
    if (options.setup) await page.evaluate(options.setup)
    await page.evaluate(w => (window as any).f.mount(w), options.width ?? 1200)
    await page.locator(".markdown-body:visible").first().waitFor()
    if (options.mode && options.mode !== "preview") { await page.getByRole("button", { name: options.mode === "edit" ? "编辑" : "分屏", exact: true }).click(); await page.locator(".monaco-editor .view-lines").first().waitFor() }
    await page.bringToFront()
    const cdp = await context.newCDPSession(page)
    const modifiers = { Alt: 1, Control: 2, Meta: 4, Shift: 8 } as const
    const key: Key = async (name, mods = [], code, keyCode) => {
      const bits = mods.reduce((sum, mod) => sum | modifiers[mod as keyof typeof modifiers], 0)
      const upper = name.length === 1 ? name.toUpperCase() : name
      const c = code ?? (name.length === 1 ? `Key${upper}` : name)
      const k = keyCode ?? ({ Escape: 27, Enter: 13, ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, Tab: 9 } as Record<string, number>)[name] ?? upper.charCodeAt(0)
      await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: name, code: c, windowsVirtualKeyCode: k, modifiers: bits, ...(name === "Enter" && !bits ? { text: "\r" } : {}) })
      if (name === "Enter" && !(bits & 4)) await cdp.send("Input.dispatchKeyEvent", { type: "char", key: name, text: "\r", modifiers: bits })
      await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: name, code: c, windowsVirtualKeyCode: k, modifiers: bits })
      await frames(page)
    }
    await run({ page, key, cdp }); assert.deepEqual(pageErrors, [])
  } finally { await page.evaluate(() => (window as any).f?.unmount?.()).catch(() => {}); await context.close() }
}

/** Real mouse drag over characters [from, to) of the preview block `index` (0-based). Returns the selected text. */
async function dragPreview(page: Page, index: number, from: number, to: number) {
  const pts = await page.locator(".markdown-body [data-block]").nth(index).evaluate((block, [a, z]) => {
    const at = (k: number) => { const w = document.createTreeWalker(block, NodeFilter.SHOW_TEXT); let t: Text | null; while ((t = w.nextNode() as Text | null)) { if (k < t.length) return [t, k] as const; k -= t.length } return null }
    const r = document.createRange(), [t1, o1] = at(a as number)!, [t2, o2] = at((z as number) - 1)!
    block.scrollIntoView({ block: "center" })
    r.setStart(t1, o1); r.setEnd(t1, o1 + 1); const s = r.getBoundingClientRect()
    r.setStart(t2, o2); r.setEnd(t2, o2 + 1); const e = r.getBoundingClientRect()
    return { sx: s.left + 1, sy: s.top + s.height / 2, ex: e.right - 1, ey: e.top + e.height / 2 }
  }, [from, to] as const)
  await page.mouse.move(pts.sx, pts.sy); await page.mouse.down(); await page.mouse.move(pts.ex, pts.ey, { steps: 8 }); await page.mouse.up()
  await frames(page)
  return { ...pts, text: await page.evaluate(() => getSelection()!.toString()) }
}
/** Real mouse drag in Monaco over source offsets [from, to). */
async function dragMonaco(page: Page, from: number, to: number) {
  const pts = await page.evaluate(([a, z]) => {
    const host = document.querySelector(".monaco-editor") as HTMLElement & { __editor?: unknown }
    const lines = ([...document.querySelectorAll(".monaco-editor .view-line")] as HTMLElement[]).sort((x, y) => parseFloat(x.style.top) - parseFloat(y.style.top))
    const text = (window as any).f.chapter.content as string
    const pos = (offset: number) => { const before = text.slice(0, offset).split("\n"); return { line: before.length, col: before.at(-1)!.length } }
    const point = (offset: number, end: boolean) => {
      const { line, col } = pos(offset)
      const height = parseFloat(getComputedStyle(lines[0]).height)
      const el = lines.find(l => Math.round(parseFloat(l.style.top)) === Math.round((line - 1) * height)) ?? lines[line - 1] ?? lines[lines.length - 1]
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let t: Text | null, k = end ? col - 1 : col
      while ((t = w.nextNode() as Text | null)) { if (k < t.length) { const r = document.createRange(); r.setStart(t, k); r.setEnd(t, k + 1); const b = r.getBoundingClientRect(); return { x: end ? b.right - 1 : b.left + 1, y: b.top + b.height / 2 } } k -= t.length }
      const b = el.getBoundingClientRect(); return { x: b.left + 4, y: b.top + b.height / 2 }
    }
    void host
    const s = point(a as number, false), e = point(z as number, true)
    return { sx: s.x, sy: s.y, ex: e.x, ey: e.y }
  }, [from, to] as const)
  await page.mouse.move(pts.sx, pts.sy); await page.mouse.down(); await page.mouse.move(pts.ex, pts.ey, { steps: 8 }); await page.mouse.up()
  await frames(page); await page.waitForTimeout(30); await frames(page)
  return pts
}
const toolbar = (page: Page) => page.getByRole("toolbar", { name: "AI 助手" })
const requestBox = (page: Page) => page.locator(".selection-ai-request")
const panel = (page: Page) => page.locator(".selection-ai-panel")
const lastStream = (page: Page) => ev<{ request: Record<string, unknown>; aborted: boolean }>(page, "{...f.streams.at(-1),push:undefined,end:undefined}")
const push = (page: Page, type: string, data: object = {}) => page.evaluate(([t, d]) => (window as any).f.streams.at(-1).push(t, d), [type, data] as const)
const end = (page: Page) => page.evaluate(() => (window as any).f.streams.at(-1).end())
async function finish(page: Page, text: string) { await push(page, "text-delta", { delta: text }); await push(page, "done", { finishReason: "stop" }); await end(page); await panel(page).locator(".selection-ai-btn", { hasText: "重试" }).waitFor() }
const box = (page: Page, sel: string) => page.locator(sel).first().evaluate(el => el.getBoundingClientRect().toJSON() as DOMRect)

// ---------------- §4 toolbar ----------------
test("SA-01/05/16: preview drag shows the toolbar under the selection, in order, without the old comment button", () => scenario({}, async ({ page }) => {
  const pts = await dragPreview(page, 1, 3, 30)
  await toolbar(page).waitFor()
  const tb = await box(page, ".selection-ai-toolbar")
  assert.equal(Math.round(tb.height), 34)
  assert.ok(tb.top - pts.ey > 4 && tb.top - pts.ey < 40, `toolbar ${tb.top} vs line ${pts.ey}`)
  const labels = await toolbar(page).locator("button").evaluateAll(bs => bs.map(b => b.getAttribute("aria-label") ?? b.textContent!.trim()))
  assert.deepEqual(labels, ["添加评论", "输入修改要求", "润色", "扩写", "续写", "更多 AI 修改"])
  assert.equal(await page.locator(".text-comment-add-btn:not([data-testid])").count(), 0)
}))

test("SA-02/03: edit and split views show the toolbar too", () => scenario({ mode: "split" }, async ({ page }) => {
  const text = await ev<string>(page, "f.chapter.content")
  const at = text.indexOf("乙段") + 4
  const pts = await dragMonaco(page, at, at + 20)
  await toolbar(page).waitFor()
  const tb = await box(page, ".selection-ai-toolbar")
  assert.ok(tb.top > pts.ey, "below the Monaco selection")
  assert.equal(await page.locator(".monaco-editor .selection-ai-toolbar").count(), 0, "not inside Monaco DOM")
  await page.mouse.click(5, 5); await frames(page)
  const p = await dragPreview(page, 2, 2, 20)
  await toolbar(page).waitFor()
  assert.ok((await box(page, ".selection-ai-toolbar")).top > p.ey)
}))

test("SA-06: ⋯ menu lists six functions and runs one", () => scenario({}, async ({ page }) => {
  await dragPreview(page, 1, 3, 30); await toolbar(page).waitFor()
  await page.getByRole("button", { name: "更多 AI 修改" }).click()
  const items = page.getByRole("menuitem"); await items.first().waitFor()
  assert.deepEqual((await items.allInnerTexts()).map(t => t.split("\n")[0]), ["润色", "扩写", "缩写", "续写", "重写", "总结"])
  await items.nth(2).click()
  await panel(page).waitFor()
  assert.equal((await lastStream(page)).request.action, "shrink")
}))

test("SA-09/10: closing conditions and review view", () => scenario({}, async ({ page }) => {
  await dragPreview(page, 1, 3, 30); await toolbar(page).waitFor()
  const far = await box(page, ".markdown-body [data-block=\"0\"]")
  await page.mouse.click(far.left + 20, far.top + 4); await frames(page)
  assert.equal(await toolbar(page).count(), 0, "click elsewhere closes")
  await dragPreview(page, 1, 3, 30); await toolbar(page).waitFor()
  await page.getByRole("button", { name: "评审", exact: true }).click(); await frames(page)
  assert.equal(await toolbar(page).count(), 0, "switching view closes")
}))

test("SA-11: no model disables functions and sends nothing", () => scenario({ setup: "window.f.models=[]" }, async ({ page, key }) => {
  await dragPreview(page, 1, 3, 30); await toolbar(page).waitFor()
  for (const name of ["润色", "扩写", "续写"]) {
    const b = toolbar(page).getByRole("button", { name, exact: true })
    assert.equal(await b.isDisabled(), true); assert.equal(await b.getAttribute("title"), "请先在 设置 → 模型 中添加模型")
  }
  await toolbar(page).getByRole("button", { name: "输入修改要求" }).click()
  await requestBox(page).waitFor()
  await page.keyboard.type("要求"); await key("Enter")
  assert.equal((await ev<string>(page, "document.querySelector('.selection-ai-request-editor').innerText")).includes("\n"), false, "Enter does not insert a newline")
  assert.equal(await ev<number>(page, "f.requests.filter(r=>r.path.endsWith('/selection-ai')).length"), 0)
}))

test("SA-13: narrow panel collapses the request button", () => scenario({ width: 460 }, async ({ page }) => {
  await dragPreview(page, 1, 3, 20); await toolbar(page).waitFor()
  assert.equal(await page.locator(".selection-ai-toolbar.compact").count(), 1)
  const tb = await box(page, ".selection-ai-toolbar"), root = await box(page, ".desktop-markdown-editor")
  assert.ok(tb.left >= root.left && tb.right <= root.right)
}))

// ---------------- §5 comment ----------------
test("SA-20/21: 添加评论 opens the existing composer and posts the selection", () => scenario({}, async ({ page, key }) => {
  const sel = await dragPreview(page, 3, 2, 12); await toolbar(page).waitFor()
  await toolbar(page).getByRole("button", { name: "添加评论" }).click()
  assert.equal(await toolbar(page).count(), 0)
  const ta = page.locator("[data-comment-composer] textarea"); await ta.waitFor()
  assert.equal(await ta.evaluate(el => el === document.activeElement), true)
  const after = await page.locator("div.my-2[data-comment-composer]").evaluate(el => !!(el.compareDocumentPosition(document.querySelectorAll("[data-block]")[3]) & Node.DOCUMENT_POSITION_PRECEDING))
  assert.equal(after, true, "composer after the selection block")
  await page.keyboard.type("示例评论"); await key("Enter", ["Meta"])
  await page.waitForFunction(() => (window as any).f.requests.some((r: { method: string; path: string }) => r.method === "POST" && r.path.endsWith("/comments")))
  const post = await ev<{ quote: string; startOffset: number; endOffset: number }>(page, "f.requests.find(r=>r.method==='POST'&&r.path.endsWith('/comments')).body")
  assert.equal(post.quote, sel.text)
  assert.equal(await ev<string>(page, `f.chapter.content.slice(${post.startOffset},${post.endOffset})`), sel.text)
}))

// The existing composer closes (keeping its draft) on any press outside it, as before docs/612. So the toolbar is absent
// while the composer is open, and a drag elsewhere closes the composer first and then shows the toolbar for it.
test("SA-24: no toolbar while the composer is open; a drag elsewhere closes it first", () => scenario({}, async ({ page }) => {
  await dragPreview(page, 3, 2, 12); await toolbar(page).waitFor()
  await toolbar(page).getByRole("button", { name: "添加评论" }).click()
  const ta = page.locator("[data-comment-composer] textarea"); await ta.waitFor()
  await page.keyboard.type("草稿"); await ta.selectText(); await frames(page)
  assert.equal(await toolbar(page).count(), 0, "selecting inside the composer does not open the toolbar")
  await dragPreview(page, 1, 3, 20)
  assert.equal(await page.locator("[data-comment-composer]").count(), 0)
  await toolbar(page).waitFor()
}))

// ---------------- §6 request box ----------------
test("SA-30/33/34/35/36/38: request box layout, caret arrows, Cmd+arrows, Enter", () => scenario({}, async ({ page, key }) => {
  const sel = await dragPreview(page, 1, 3, 30); await toolbar(page).waitFor()
  await toolbar(page).getByRole("button", { name: "输入修改要求" }).click()
  await requestBox(page).waitFor(); await frames(page)
  assert.equal(await toolbar(page).count(), 0)
  assert.equal(Math.round((await box(page, ".selection-ai-request")).width), 560)
  assert.equal(await ev<boolean>(page, "document.activeElement?.classList.contains('selection-ai-request-editor')"), true)
  assert.equal(await requestBox(page).locator(".selection-ai-quote-count").innerText(), `已选 ${sel.text.replace(/\s/g, "").length} 字`)
  for (const absent of ["发送", "标准模式", "计划模式", "添加图片"]) assert.equal(await requestBox(page).getByText(absent, { exact: true }).count(), 0, absent)
  const picked = () => requestBox(page).locator('[aria-pressed="true"]').getAttribute("data-fn")
  assert.equal(await picked(), "polish")
  assert.equal(await requestBox(page).locator("kbd").count(), 0)
  await page.keyboard.type("第一行"); await key("Enter", ["Shift"]); await page.keyboard.type("第二行")
  const caret = () => page.evaluate(() => { const s = getSelection()!, ed = document.querySelector(".selection-ai-request-editor")!; const r = document.createRange(); r.selectNodeContents(ed); r.setEnd(s.focusNode!, s.focusOffset); return r.toString().length })
  const c0 = await caret(); await key("ArrowUp"); const c1 = await caret()
  assert.ok(c1 < c0, "ArrowUp moves the caret"); assert.equal(await picked(), "polish")
  await key("ArrowDown", ["Meta"]); await key("ArrowDown", ["Meta"])
  assert.equal(await picked(), "shrink"); assert.equal(await caret(), c1, "Cmd+Down keeps the caret")
  assert.match(await requestBox(page).locator(".selection-ai-hint").innerText(), /^Enter 执行缩写 · ⌘↑↓ 选择功能/)
  await key("ArrowUp", ["Meta"]); await key("ArrowUp", ["Meta"]); await key("ArrowUp", ["Meta"])
  assert.equal(await picked(), "summary", "wraps")
  await key("ArrowDown", ["Alt"]); assert.equal(await picked(), "summary", "Alt does not pick on macOS")
  await key("Enter")
  await panel(page).waitFor()
  const req = (await lastStream(page)).request
  assert.equal(req.action, "summary"); assert.match(String(req.requirement), /第一行[\s\S]*第二行/); assert.equal(req.modelId, "m1")
}))

test("SA-37/40: Windows Alt+arrows and rebinding", () => scenario({ setup: "window.f.setPlatform('win32',{'selectionAi.run':['Ctrl+Enter']})" }, async ({ page, key }) => {
  await dragPreview(page, 1, 3, 30); await toolbar(page).waitFor()
  await toolbar(page).getByRole("button", { name: "输入修改要求" }).click(); await requestBox(page).waitFor(); await frames(page)
  await key("ArrowDown", ["Alt"])
  assert.equal(await requestBox(page).locator('[aria-pressed="true"]').getAttribute("data-fn"), "expand")
  assert.match(await requestBox(page).locator(".selection-ai-hint").innerText(), /Alt\+↑↓ 选择功能/)
  assert.match(await requestBox(page).locator(".selection-ai-hint").innerText(), /^Ctrl\+Enter 执行扩写/)
  await key("Enter")
  assert.equal(await panel(page).count(), 0, "plain Enter no longer runs")
  await key("Enter", ["Control"])
  await panel(page).waitFor()
  assert.equal((await lastStream(page)).request.action, "expand")
}))

test("SA-43: model choice is per request and does not touch the chat", () => scenario({}, async ({ page }) => {
  await dragPreview(page, 1, 3, 30); await toolbar(page).waitFor()
  await toolbar(page).getByRole("button", { name: "输入修改要求" }).click(); await requestBox(page).waitFor()
  await requestBox(page).getByRole("button", { name: "模型与思考强度（仅本次修改）" }).click()
  await page.getByRole("menuitem", { name: "模型二" }).click()
  await requestBox(page).locator('[data-fn="rewrite"]').click()
  await panel(page).waitFor()
  assert.equal((await lastStream(page)).request.modelId, "m2")
  assert.deepEqual(await ev(page, "f.chatModel()"), { modelId: "m1", effort: null })
}))

test("SA-44/45: Tab into the list, arrows move the pick, click runs", () => scenario({}, async ({ page, key }) => {
  await dragPreview(page, 1, 3, 30); await toolbar(page).waitFor()
  await toolbar(page).getByRole("button", { name: "输入修改要求" }).click(); await requestBox(page).waitFor(); await frames(page)
  await key("Tab")
  assert.equal(await ev<string>(page, "document.activeElement?.dataset.fn"), "polish")
  await key("ArrowDown")
  assert.equal(await ev<string>(page, "document.activeElement?.dataset.fn"), "expand")
  assert.equal(await requestBox(page).locator('[aria-pressed="true"]').getAttribute("data-fn"), "expand")
  await key("ArrowUp"); await key("ArrowUp")
  assert.equal(await ev<boolean>(page, "document.activeElement?.classList.contains('selection-ai-request-editor')"), true)
  await requestBox(page).locator('[data-fn="rewrite"]').click()
  await panel(page).waitFor()
  assert.equal((await lastStream(page)).request.action, "rewrite")
}))

test("SA-46/46c/47: Escape layers, chat stop yields, global commands still work", () => scenario({ setup: "window.f.chatGenerating=true" }, async ({ page, key }) => {
  await dragPreview(page, 1, 3, 30); await toolbar(page).waitFor()
  await toolbar(page).getByRole("button", { name: "输入修改要求" }).click(); await requestBox(page).waitFor(); await frames(page)
  await key("s", ["Meta"])
  assert.equal(await ev<number>(page, "f.probes.fileSave"), 1, "Cmd+S still works while the request box is open")
  await key("Escape")
  assert.equal(await requestBox(page).count(), 0); await toolbar(page).waitFor()
  assert.equal(await ev<number>(page, "f.probes.aiStop"), 0)
  await key("Escape")
  assert.equal(await toolbar(page).count(), 0)
  assert.equal(await ev<number>(page, "f.probes.aiStop"), 0)
  await key("Escape")
  assert.equal(await ev<number>(page, "f.probes.aiStop"), 1, "with no layer, Escape stops the chat")
}))

test("SA-48: request kept for the same selection, reset for a new one", () => scenario({}, async ({ page, key }) => {
  await dragPreview(page, 1, 3, 30); await toolbar(page).waitFor()
  await toolbar(page).getByRole("button", { name: "输入修改要求" }).click(); await requestBox(page).waitFor(); await frames(page)
  await page.keyboard.type("保留的要求"); await key("ArrowDown", ["Meta"])
  await key("Escape"); await toolbar(page).waitFor()
  await toolbar(page).getByRole("button", { name: "输入修改要求" }).click(); await requestBox(page).waitFor()
  assert.equal(await requestBox(page).locator(".selection-ai-request-editor").innerText(), "保留的要求")
  assert.equal(await requestBox(page).locator('[aria-pressed="true"]').getAttribute("data-fn"), "expand")
}))

// ---------------- §7 panel / replace / undo ----------------
test("SA-60/61/63/66/67/69/72/77/78: stream, stop, resume, done, retry, replace, undo", () => scenario({}, async ({ page }) => {
  const sel = await dragPreview(page, 1, 3, 30); await toolbar(page).waitFor()
  await toolbar(page).getByRole("button", { name: "润色", exact: true }).click()
  await panel(page).waitFor()
  const req = (await lastStream(page)).request
  assert.equal(req.baseVersion, 1); assert.equal(req.quote, sel.text)
  await page.waitForTimeout(250) // entrance animation (translateY 8px → 0)
  const pb = await box(page, ".selection-ai-panel"), root = await box(page, ".desktop-markdown-editor")
  assert.ok(Math.abs(root.bottom - pb.bottom - 42) <= 2, `bottom gap ${root.bottom - pb.bottom}`)
  assert.ok(Math.abs((pb.left + pb.right) / 2 - (root.left + root.right) / 2) <= 2)
  assert.equal(await page.locator("mark.selection-ai-range").first().innerText().then(t => sel.text.startsWith(t) || t.length > 0), true)
  await push(page, "text-delta", { delta: "第一句。" }); await frames(page)
  assert.match(await panel(page).locator(".selection-ai-state").innerText(), /润色中[\s\S]*已生成 4 字/)
  await panel(page).getByRole("button", { name: "停止" }).click()
  assert.equal((await lastStream(page)).aborted, true)
  assert.match(await panel(page).locator(".selection-ai-state").innerText(), /已停止/)
  assert.equal(await panel(page).getByRole("button", { name: "替换" }).count(), 0)
  await panel(page).getByRole("button", { name: "继续" }).click()
  assert.equal((await lastStream(page)).request.continuation, "第一句。")
  await finish(page, "第二句。")
  assert.deepEqual(await panel(page).locator(".selection-ai-foot .selection-ai-btn").allInnerTexts(), ["放弃", "重试", "替换"])
  assert.match(await panel(page).locator(".selection-ai-state").innerText(), /润色完成/)
  await page.waitForTimeout(260) // 160 → 260 px over 200 ms
  assert.ok(Math.round((await box(page, ".selection-ai-stream")).height) >= 258)
  await panel(page).getByRole("button", { name: "重试" }).click()
  const retry = (await lastStream(page)).request
  assert.equal(retry.action, "polish"); assert.equal(retry.baseVersion, 1); assert.equal(retry.continuation, undefined)
  assert.match(await panel(page).locator(".selection-ai-state").innerText(), /第 2 次/)
  await finish(page, "重写后的句子。")
  assert.equal(await ev<number>(page, "f.requests.filter(r=>r.path.endsWith('/commit')).length"), 0)
  await panel(page).getByRole("button", { name: "替换" }).click()
  await page.locator(".selection-ai-undo").waitFor()
  const commit = await ev<{ start: number; end: number; quote: string; replacement: string; expectedVersion: number }>(page, "f.requests.find(r=>r.path.endsWith('/commit')).body")
  assert.equal(commit.quote, sel.text); assert.equal(commit.replacement, "重写后的句子。"); assert.equal(commit.expectedVersion, 1)
  await page.waitForFunction(() => document.querySelector(".markdown-body")!.textContent!.includes("重写后的句子。"))
  assert.equal(await panel(page).count(), 0)
  await page.locator(".selection-ai-undo").getByRole("button", { name: "撤销" }).click()
  await page.waitForFunction(() => !document.querySelector(".markdown-body")!.textContent!.includes("重写后的句子。"))
  const undo = await ev<{ replacementOperationId: string }>(page, "f.requests.find(r=>r.path.endsWith('/undo')).body")
  assert.equal(undo.replacementOperationId, await ev<string>(page, "f.lastCommit.operationId"))
}))

test("SA-68/70/76: failure, continuation display, discard", () => scenario({}, async ({ page }) => {
  await dragPreview(page, 1, 3, 30); await toolbar(page).waitFor()
  await toolbar(page).getByRole("button", { name: "续写", exact: true }).click(); await panel(page).waitFor()
  await push(page, "done", { finishReason: "length" }); await end(page)
  await panel(page).locator(".selection-ai-state.error").waitFor()
  assert.equal(await panel(page).getByRole("button", { name: "继续" }).count(), 1)
  await panel(page).getByRole("button", { name: "继续" }).click()
  await finish(page, "续写内容。")
  assert.equal(await panel(page).locator("p.orig").count() > 0, true, "original shown before the continuation")
  const before = await ev<string>(page, "f.chapter.content")
  await panel(page).getByRole("button", { name: "放弃" }).click()
  assert.equal(await panel(page).count(), 0); assert.equal(await page.locator("mark.selection-ai-range").count(), 0)
  assert.equal(await ev<string>(page, "f.chapter.content"), before)
}))

test("SA-75: conflict on replace keeps the result for copying", () => scenario({ setup: "window.f.commitFail={code:'SELECTION_CHANGED',message:'选中的原文已改动'}" }, async ({ page }) => {
  await dragPreview(page, 1, 3, 30); await toolbar(page).waitFor()
  await toolbar(page).getByRole("button", { name: "润色", exact: true }).click(); await panel(page).waitFor()
  await finish(page, "结果文字。")
  await panel(page).getByRole("button", { name: "替换" }).click()
  await panel(page).getByRole("button", { name: "复制结果" }).waitFor()
  await panel(page).getByRole("button", { name: "复制结果" }).click()
  await page.waitForFunction(() => (window as any).f.writes.length > 0)
  assert.equal(await ev<string>(page, "f.writes.at(-1)"), "结果文字。")
}))

test("SA-79: Cmd+Z in the editor undoes the replacement once", () => scenario({ mode: "edit" }, async ({ page, key }) => {
  const text = await ev<string>(page, "f.chapter.content")
  const at = text.indexOf("乙段") + 4
  await dragMonaco(page, at, at + 20); await toolbar(page).waitFor()
  await toolbar(page).getByRole("button", { name: "润色", exact: true }).click(); await panel(page).waitFor()
  await finish(page, "新的句子。")
  await panel(page).getByRole("button", { name: "替换" }).click()
  await page.locator(".selection-ai-undo").waitFor()
  await page.locator(".monaco-editor textarea, .monaco-editor .native-edit-context").first().focus()
  await key("z", ["Meta"], "KeyZ", 90)
  await page.waitForFunction(() => (window as any).f.requests.some((r: { path: string }) => r.path.endsWith("/undo")))
}))

// ---------------- §8 history ----------------
test("SA-90/91/92: version history shows reason tags and fresh rows", () => scenario({}, async ({ page }) => {
  await dragPreview(page, 1, 3, 30); await toolbar(page).waitFor()
  await toolbar(page).getByRole("button", { name: "润色", exact: true }).click(); await panel(page).waitFor()
  await finish(page, "替换文字。")
  await panel(page).getByRole("button", { name: "替换" }).click(); await page.locator(".selection-ai-undo").waitFor()
  await page.getByRole("button", { name: "正文功能菜单" }).click()
  await page.getByRole("menuitem", { name: "版本历史" }).click()
  const list = page.getByRole("list", { name: "正文版本列表" }); await list.waitFor()
  await list.locator(".history-reason").first().waitFor()
  const tags = await list.locator(".history-reason").evaluateAll(els => els.map(el => [el.textContent, el.classList.contains("ai")]))
  assert.deepEqual(tags.slice(0, 3), [["AI 润色", true], ["AI 润色前", true], ["正文更新", false]])
  assert.equal(await list.locator(".history-row-fresh").count(), 2)
  await list.locator("button", { hasText: "AI 润色前" }).click()
  await page.getByRole("button", { name: "恢复为当前稿" }).waitFor()
  assert.equal(await page.locator("h2 + p .history-reason.ai").innerText(), "AI 润色前")
}))

test("SA-79b: a rebound text.undo and the 编辑 → 撤销 menu also undo the replacement", () => scenario({ mode: "edit", setup: "window.f.setPlatform('darwin',{'text.undo':['Cmd+Shift+U']})" }, async ({ page, key }) => {
  const replace = async () => {
    const text = await ev<string>(page, "f.chapter.content"), at = text.indexOf("丙段") + 3
    await dragMonaco(page, at, at + 12); await toolbar(page).waitFor()
    await toolbar(page).getByRole("button", { name: "润色", exact: true }).click(); await panel(page).waitFor()
    await finish(page, "改后。")
    await panel(page).getByRole("button", { name: "替换" }).click(); await page.locator(".selection-ai-undo").waitFor()
    await page.locator(".monaco-editor textarea, .monaco-editor .native-edit-context").first().focus()
  }
  const undos = () => ev<number>(page, "f.requests.filter(r=>r.path.endsWith('/undo')).length")
  await replace()
  await key("U", ["Meta", "Shift"], "KeyU", 85)
  await page.waitForFunction(() => (window as any).f.requests.filter((r: { path: string }) => r.path.endsWith("/undo")).length === 1)
  await replace()
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("desktop:command", { detail: "text.undo" })))
  await page.waitForFunction(() => (window as any).f.requests.filter((r: { path: string }) => r.path.endsWith("/undo")).length === 2)
  // with nothing to undo on the server, the menu undo falls back to Monaco's own undo (no request)
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("desktop:command", { detail: "text.undo" }))); await frames(page)
  assert.equal(await undos(), 2)
}))

// ---- code review regressions ----
test("SA-73/74 (edit view): edits before the selection while processing move the replace range; retry keeps the base", () => scenario({ mode: "edit" }, async ({ page }) => {
  const text = await ev<string>(page, "f.chapter.content"), at = text.indexOf("乙段") + 4
  await dragMonaco(page, at, at + 20); await toolbar(page).waitFor()
  const quote = await ev<string>(page, `f.chapter.content.slice(${at},${at + 20})`)
  await toolbar(page).getByRole("button", { name: "润色", exact: true }).click(); await panel(page).waitFor()
  // insert 5 characters at the very start of the manuscript (before the selection)
  await page.evaluate(() => (window as any).monacoType(0, "开头五个字")); await frames(page); await page.waitForTimeout(1000)
  // Chapter autosave PATCHes go through the three-stage save layer (src/lib/staged-save.ts) in this harness, so the
  // stub chapter version stays 1; the server-side version path is covered by SAC-05/06 (integration).
  assert.doesNotMatch(await panel(page).locator(".selection-ai-state").innerText(), /选中原文已改动/)
  await panel(page).getByRole("button", { name: "停止" }).click()
  await panel(page).getByRole("button", { name: "继续" }).click()
  assert.equal((await lastStream(page)).request.baseVersion, 1, "continue keeps the original base")
  await finish(page, "替换后。")
  assert.doesNotMatch(await panel(page).locator(".selection-ai-state").innerText(), /选中原文已改动/)
  await panel(page).getByRole("button", { name: "替换" }).click(); await page.locator(".selection-ai-undo").waitFor()
  const commit = await ev<{ start: number; end: number; quote: string; expectedVersion: number }>(page, "f.requests.find(r=>r.path.endsWith('/commit')).body")
  assert.deepEqual([commit.start, commit.end, commit.quote], [at + 5, at + 25, quote])
  assert.equal(commit.expectedVersion, await ev<number>(page, "f.chapter.version") - 2, "expectedVersion is the editor's version at replace time")
}))

test("SA-74 (preview): offsets also move when the text changes outside the selection", () => scenario({}, async ({ page }) => {
  const sel = await dragPreview(page, 2, 2, 14); await toolbar(page).waitFor()
  await toolbar(page).getByRole("button", { name: "润色", exact: true }).click(); await panel(page).waitFor()
  const start = (await lastStream(page)).request.start as number
  // an external-looking local edit before the selection: go to edit view, type at the start, come back
  await page.getByRole("button", { name: "编辑", exact: true }).click(); await page.locator(".monaco-editor .view-lines").first().waitFor()
  await page.evaluate(() => (window as any).monacoType(0, "三个字")); await frames(page)
  await page.getByRole("button", { name: "预览", exact: true }).click(); await frames(page)
  await finish(page, "新句。")
  await panel(page).getByRole("button", { name: "替换" }).click(); await page.locator(".selection-ai-undo").waitFor()
  const commit = await ev<{ start: number; quote: string }>(page, "f.requests.find(r=>r.path.endsWith('/commit')).body")
  assert.equal(commit.start, start + 3); assert.equal(commit.quote, sel.text)
}))

test("code review 4: in split view the comment opens in the pane that was selected, and still works after leaving split", () => scenario({ mode: "split" }, async ({ page }) => {
  const text = await ev<string>(page, "f.chapter.content"), at = text.indexOf("丁段") + 2
  await dragMonaco(page, at, at + 6); await toolbar(page).waitFor()
  await toolbar(page).getByRole("button", { name: "添加评论" }).click()
  await page.locator(".monaco-editor [data-comment-composer], .monaco-editor .view-zones [data-comment-composer], [data-comment-composer]").first().waitFor()
  const inMonaco = await page.evaluate(() => !!document.querySelector("[data-comment-composer]")?.closest(".monaco-editor"))
  assert.equal(inMonaco, true, "Monaco selection opens the Monaco composer")
  await page.keyboard.press("Escape").catch(() => {})
  await page.getByRole("button", { name: "编辑", exact: true }).click(); await frames(page)
  await page.mouse.click(5, 5)
  await dragMonaco(page, at + 10, at + 16); await toolbar(page).waitFor()
  assert.equal(await toolbar(page).getByRole("button", { name: "添加评论" }).isDisabled(), false, "opener survives the preview unmount")
}))

test("code review: a double click on 替换 commits once and never strands the toolbar", () => scenario({}, async ({ page }) => {
  await dragPreview(page, 1, 3, 30); await toolbar(page).waitFor()
  await toolbar(page).getByRole("button", { name: "润色", exact: true }).click(); await panel(page).waitFor()
  await finish(page, "一次。")
  await panel(page).getByRole("button", { name: "替换" }).dblclick()
  await page.locator(".selection-ai-undo").waitFor()
  assert.equal(await ev<number>(page, "f.requests.filter(r=>r.path.endsWith('/commit')).length"), 1)
  await page.locator(".selection-ai-undo").getByRole("button", { name: "关闭" }).click()
  await dragPreview(page, 3, 2, 12); await toolbar(page).waitFor()
}))

// ---- user 2026-11-29: double-click word selection also shows the toolbar ----
async function wordPoint(page: Page, index: number, offset: number) {
  return page.locator(".markdown-body [data-block]").nth(index).evaluate((block, k) => {
    block.scrollIntoView({ block: "center" })
    const w = document.createTreeWalker(block, NodeFilter.SHOW_TEXT); let t: Text | null, left = k as number
    while ((t = w.nextNode() as Text | null)) { if (left < t.length) break; left -= t.length }
    const r = document.createRange(); r.setStart(t!, left); r.setEnd(t!, left + 1); const b = r.getBoundingClientRect()
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 }
  }, offset)
}
test("SA-04b: double-click in the preview selects a word and shows the toolbar under it", () => scenario({}, async ({ page }) => {
  const p = await wordPoint(page, 1, 10)
  await page.mouse.dblclick(p.x, p.y); await frames(page)
  const selected = await page.evaluate(() => getSelection()!.toString())
  assert.ok(selected.length > 0, "the browser selected something")
  await toolbar(page).waitFor({ timeout: 3000 })
  const tb = await box(page, ".selection-ai-toolbar")
  assert.ok(tb.top > p.y && tb.top - p.y < 50, `toolbar ${tb.top} vs word ${p.y}`)
  await toolbar(page).getByRole("button", { name: "润色", exact: true }).click(); await panel(page).waitFor()
  assert.equal((await lastStream(page)).request.quote, selected)
}))
test("SA-04c: double-click in Monaco shows the toolbar", () => scenario({ mode: "edit" }, async ({ page }) => {
  const line = page.locator(".monaco-editor .view-line").nth(2)
  const lb = (await line.boundingBox())!
  await page.mouse.dblclick(lb.x + 120, lb.y + lb.height / 2); await frames(page); await page.waitForTimeout(50)
  await toolbar(page).waitFor({ timeout: 3000 })
}))
test("SA-04d: triple-click in the preview selects the paragraph and shows the toolbar", () => scenario({}, async ({ page }) => {
  const p = await wordPoint(page, 2, 6)
  await page.mouse.click(p.x, p.y, { clickCount: 3 }); await frames(page)
  await toolbar(page).waitFor({ timeout: 3000 })
}))
test("SA-04e: CDP double-click (raw press/release pairs) in Monaco and preview shows the toolbar", () => scenario({ mode: "split" }, async ({ page, cdp }) => {
  const dbl = async (x: number, y: number) => {
    for (const [type, count] of [["mousePressed", 1], ["mouseReleased", 1], ["mousePressed", 2], ["mouseReleased", 2]] as const) await cdp.send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: count })
    await frames(page); await page.waitForTimeout(80)
  }
  const line = (await page.locator(".monaco-editor .view-line").nth(2).boundingBox())!
  await dbl(line.x + 120, line.y + line.height / 2)
  await toolbar(page).waitFor({ timeout: 3000 })
  await page.mouse.click(5, 5); await frames(page)
  const p = await wordPoint(page, 3, 8)
  await dbl(p.x, p.y)
  await toolbar(page).waitFor({ timeout: 3000 })
}))

// ---- user 2026-11-29: every way of selecting text shows the toolbar ----
const raw = async (page: Page, cdp: CDPSession, x: number, y: number, clicks: number, modifiers = 0) => {
  for (let c = 1; c <= clicks; c++) {
    await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: c, modifiers })
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: c, modifiers })
  }
  await frames(page); await page.waitForTimeout(80)
}
const closeToolbar = async (page: Page) => { await page.mouse.click(5, 5); await frames(page); assert.equal(await toolbar(page).count(), 0) }

test("SA-04g (preview): triple-click, Shift+click, drag released outside, 全选 menu, Cmd+A", () => scenario({}, async ({ page, cdp, key }) => {
  // triple-click with raw press/release pairs
  let p = await wordPoint(page, 2, 6)
  await raw(page, cdp, p.x, p.y, 3); await toolbar(page).waitFor({ timeout: 3000 })
  await closeToolbar(page)
  // click then Shift+click to extend
  p = await wordPoint(page, 1, 3); const q = await wordPoint(page, 1, 25)
  await page.mouse.click(p.x, p.y); await raw(page, cdp, q.x, q.y, 1, 8)
  await toolbar(page).waitFor({ timeout: 3000 })
  await closeToolbar(page)
  // drag that is released outside the manuscript (over the page margin at the far left)
  p = await wordPoint(page, 3, 3)
  await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(p.x + 200, p.y, { steps: 6 }); await page.mouse.move(2, p.y + 300, { steps: 6 }); await page.mouse.up()
  await frames(page)
  assert.ok((await page.evaluate(() => getSelection()!.toString())).length > 0)
  await toolbar(page).waitFor({ timeout: 3000 })
  await closeToolbar(page)
  // 正文功能菜单 → 全选
  await page.getByRole("button", { name: "正文功能菜单" }).click()
  await page.getByRole("menuitem", { name: "全选", exact: true }).click()
  await toolbar(page).waitFor({ timeout: 3000 })
  const tb = await box(page, ".selection-ai-toolbar"), root = await box(page, ".desktop-markdown-editor")
  assert.ok(tb.top >= root.top && tb.bottom <= root.bottom, "a long selection keeps the toolbar inside the editor")
  await closeToolbar(page)
  // Cmd+A with focus in the preview
  p = await wordPoint(page, 1, 3); await page.mouse.click(p.x, p.y); await frames(page)
  await key("a", ["Meta"])
  await toolbar(page).waitFor({ timeout: 3000 })
}))

test("SA-04h (edit): triple-click, Shift+arrows, Cmd+A, Shift+click, drag released outside", () => scenario({ mode: "edit" }, async ({ page, cdp, key }) => {
  const line = async (n: number) => (await page.locator(".monaco-editor .view-line").nth(n).boundingBox())!
  let l = await line(2)
  await raw(page, cdp, l.x + 120, l.y + l.height / 2, 3); await toolbar(page).waitFor({ timeout: 3000 })
  await closeToolbar(page)
  // keyboard: caret, then Shift+→ ×6
  l = await line(4); await page.mouse.click(l.x + 60, l.y + l.height / 2); await frames(page)
  for (let i = 0; i < 6; i++) await key("ArrowRight", ["Shift"])
  await toolbar(page).waitFor({ timeout: 3000 })
  await closeToolbar(page)
  // Cmd+A
  l = await line(0); await page.mouse.click(l.x + 60, l.y + l.height / 2); await frames(page)
  await key("a", ["Meta"])
  await toolbar(page).waitFor({ timeout: 3000 })
  const tb = await box(page, ".selection-ai-toolbar"), root = await box(page, ".desktop-markdown-editor")
  assert.ok(tb.top >= root.top && tb.bottom <= root.bottom)
  await closeToolbar(page)
  // click then Shift+click
  l = await line(2); const m = await line(4)
  await page.mouse.click(l.x + 40, l.y + l.height / 2); await raw(page, cdp, m.x + 200, m.y + m.height / 2, 1, 8)
  await toolbar(page).waitFor({ timeout: 3000 })
  await closeToolbar(page)
  // drag released outside the editor
  l = await line(6)
  await page.mouse.move(l.x + 40, l.y + l.height / 2); await page.mouse.down(); await page.mouse.move(l.x + 300, l.y + l.height / 2, { steps: 6 }); await page.mouse.move(l.x + 300, 890, { steps: 6 }); await page.mouse.up()
  await frames(page); await page.waitForTimeout(60)
  await toolbar(page).waitFor({ timeout: 3000 })
}))
