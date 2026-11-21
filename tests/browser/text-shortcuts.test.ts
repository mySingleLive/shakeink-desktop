import test from "node:test"
import assert from "node:assert/strict"
import { build } from "esbuild"
import { chromium, type Browser, type Page } from "playwright-core"

// docs/598 §3.6/§4. Real DesktopCommandController, React inputs, installed
// Monaco and Chromium editing. Keys are sent with CDP Input.dispatchKeyEvent
// WITHOUT editing `commands`, so — as in the Electron app with menu shortcuts
// ignored — Chromium performs no copy/paste/undo by itself (TSB-08 proves it).
// The desktop clipboard bridge is in memory; this is not native OS acceptance.
const contents = `
import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
import * as monaco from 'monaco-editor';
import {Input} from './src/components/ui/input';import {DesktopCommandController} from './src/components/desktop/DesktopCommandController';
import {Dialog,DialogContent,DialogTitle} from './src/components/ui/dialog';
import {bindMonacoTextContext} from './src/lib/desktop/monaco-text-context';
import {useDesktopStore} from './src/stores/desktop';import {defaultState} from './desktop/core/settings';
import {initializeStartupCommandCatalog} from './src/lib/desktop/startup-command-catalog';
// As in DesktopApp: the installed catalog (with Monaco's own bindings such as suggestWidgetCopy on Cmd+C).
initializeStartupCommandCatalog('darwin');
self.MonacoEnvironment={getWorker:()=>new Worker('/monaco-worker.js',{type:'module'})};
const f=window.f={clipboard:'paste-fixture',writes:[],reads:0,copies:[],errors:[],dialog:false};
window.desktop={writeClipboardText:async text=>{f.writes.push(text)},readClipboardText:async()=>{f.reads++;return f.clipboard},showTextContextMenu:async state=>({requestId:state.requestId,command:null}),cancelTextContextMenu:async()=>{}};
// A real copy event carries what Chromium would put on the clipboard.
// Record what each copy/cut event puts on the clipboard: data a handler set
// (Monaco, the composer) when present, else Chromium's default (the selection).
for(const type of ['copy','cut'])window.addEventListener(type,event=>{const set=event.clipboardData?.getData('text/plain');const el=document.activeElement;const native=el&&'selectionStart' in el&&typeof el.selectionStart==='number'?el.value.slice(el.selectionStart,el.selectionEnd):getSelection().toString();f.copies.push(event.defaultPrevented&&set?set:native)});
useDesktopStore.setState({bootstrap:{...defaultState,platform:'darwin'}});
function App({dialog}){return <>
 <DesktopCommandController/>
 <Input aria-label='plain' defaultValue='alpha beta'/>
 <Input aria-label='number' type='number' defaultValue='12'/>
 <Input aria-label='email' type='email' defaultValue='a@b.c'/>
 <Input aria-label='API Key' type='password' data-desktop-clipboard='api-key' defaultValue='secret-key'/>
 <p id='p1' data-text-preview>First message text</p>
 <p id='p2' data-text-preview>Second message text</p>
 <div role='menu' id='menu'><input aria-label='menu search' onKeyDown={e=>e.stopPropagation()} defaultValue='query'/></div>
 <div id='editor' style={{width:600,height:160}}/>
 <Dialog open={dialog}><DialogContent><DialogTitle>Dialog</DialogTitle><button id='in-dialog'>OK</button></DialogContent></Dialog>
</>}
const root=createRoot(document.getElementById('app'));const render=dialog=>flushSync(()=>root.render(<App dialog={dialog}/>));render(false);
const model=monaco.editor.createModel('Line one\\nLine two','markdown');
const editor=monaco.editor.create(document.getElementById('editor'),{model,minimap:{enabled:false},automaticLayout:true,fontSize:14,lineHeight:20});
const unbind=bindMonacoTextContext(editor);
Object.assign(f,{editor,model,
 override:overrides=>useDesktopStore.setState(state=>({bootstrap:{...state.bootstrap,settings:{...state.bootstrap.settings,shortcuts:{...state.bootstrap.settings.shortcuts,darwin:overrides}}}})),
 openDialog:()=>render(true),
 selectNodes:(a,b)=>{const r=document.createRange();r.setStart(document.getElementById(a).firstChild,0);const end=document.getElementById(b).firstChild;r.setEnd(end,end.length);const s=getSelection();s.removeAllRanges();s.addRange(r)},
 readOnly:value=>editor.updateOptions({readOnly:value}),
 dispose:()=>{unbind();editor.dispose();model.dispose();flushSync(()=>root.unmount())}});
`
const bundled = Promise.all([
  build({ stdin: { contents, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false, platform: "browser", format: "esm", outfile: "text-shortcuts-fixture.js", loader: { ".ttf": "dataurl" }, define: { "process.env.NODE_ENV": '"development"' }, tsconfig: "tsconfig.json", minify: true,
    plugins: [{ name: "memory-toast", setup(build) { build.onResolve({ filter: /^sonner$/ }, args => ({ path: args.path, namespace: "fixture" })); build.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: "export const toast={info:x=>window.f.errors.push(x),error:x=>window.f.errors.push(x)};export const Toaster=()=>null" })) } }] }),
  build({ entryPoints: ["node_modules/monaco-editor/esm/vs/editor/editor.worker.js"], bundle: true, write: false, platform: "browser", format: "esm", minify: true }),
]).then(([main, worker]) => ({ script: main.outputFiles!.find(file => file.path.endsWith(".js"))!.text, css: main.outputFiles!.find(file => file.path.endsWith(".css"))?.text ?? "", worker: worker.outputFiles![0].text }))

let browser: Browser
test.before(async () => { browser = await chromium.launch({ headless: true, ...(process.env.SHAKEINK_TEST_CHROMIUM ? { executablePath: process.env.SHAKEINK_TEST_CHROMIUM } : {}) }) })
test.after(async () => { await browser?.close() })

async function scenario(run: (page: Page, key: (key: string, mods?: string[]) => Promise<void>) => Promise<void>) {
  const context = await browser.newContext({ viewport: { width: 900, height: 700 } }), page = await context.newPage(), pageErrors: string[] = []
  page.setDefaultTimeout(15000); page.on("pageerror", error => pageErrors.push(error.message))
  try {
    const built = await bundled
    await context.route("**/*", async route => {
      const path = new URL(route.request().url()).pathname
      if (path === "/monaco-worker.js") { await route.fulfill({ contentType: "text/javascript", body: built.worker }); return }
      if (route.request().isNavigationRequest()) { await route.fulfill({ contentType: "text/html", body: '<div id="app"></div>' }); return }
      await route.abort()
    })
    await page.goto("http://127.0.0.1:1/text-shortcuts")
    await page.evaluate(() => { if (typeof crypto.randomUUID !== "function") { let n = 0; Object.defineProperty(crypto, "randomUUID", { configurable: true, value: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}` }) } })
    await page.addStyleTag({ content: built.css }); await page.addScriptTag({ content: built.script, type: "module" })
    await page.waitForFunction(() => !!(window as any).f?.editor); await page.bringToFront()
    const cdp = await context.newCDPSession(page)
    const modifiers = { Alt: 1, Control: 2, Meta: 4, Shift: 8 } as const
    const key = async (name: string, mods: string[] = ["Meta"]) => {
      const bits = mods.reduce((sum, mod) => sum | modifiers[mod as keyof typeof modifiers], 0)
      const upper = name.toUpperCase(), code = `Key${upper}`, keyCode = upper.charCodeAt(0)
      await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: name, code, windowsVirtualKeyCode: keyCode, modifiers: bits })
      await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: name, code, windowsVirtualKeyCode: keyCode, modifiers: bits })
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
    }
    await run(page, key); assert.deepEqual(pageErrors, [])
  } finally { await page.evaluate(() => (window as any).f?.dispose()).catch(() => {}); await context.close() }
}
const f = (page: Page) => page.evaluate(() => { const f = (window as any).f; return { writes: [...f.writes], copies: [...f.copies], reads: f.reads, errors: [...f.errors] } })
const select = (page: Page, label: string, start: number, end: number) => page.getByLabel(label, { exact: true }).evaluate((el: HTMLInputElement, [start, end]) => { el.focus(); el.setSelectionRange(start, end) }, [start, end] as const)
const value = (page: Page, label: string) => page.getByLabel(label, { exact: true }).inputValue()

test("TSB-01: an input copies, pastes, cuts, selects all, undoes, redoes and pastes plain text", async () => scenario(async (page, key) => {
  await select(page, "plain", 0, 5); await key("c")
  assert.deepEqual((await f(page)).copies, ["alpha"])
  await select(page, "plain", 10, 10); await key("v")
  assert.equal(await value(page, "plain"), "alpha betapaste-fixture")
  await key("z"); assert.equal(await value(page, "plain"), "alpha beta")
  await key("z", ["Meta", "Shift"]); assert.equal(await value(page, "plain"), "alpha betapaste-fixture")
  await select(page, "plain", 0, 6); await key("x")
  assert.equal(await value(page, "plain"), "betapaste-fixture"); assert.deepEqual((await f(page)).copies.at(-1), "alpha ")
  await key("a"); assert.deepEqual(await page.getByLabel("plain", { exact: true }).evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd]), [0, 17])
  await page.evaluate(() => { (window as any).f.clipboard = "PLAIN" }); await select(page, "plain", 0, 0); await key("v", ["Meta", "Shift"])
  assert.equal(await value(page, "plain"), "PLAINbetapaste-fixture")
  assert.deepEqual((await f(page)).errors, [])
}))

test("TSB-02: number and email inputs accept paste", async () => scenario(async (page, key) => {
  await page.evaluate(() => { (window as any).f.clipboard = "3" })
  // email/number expose no selectionStart; they are not installInputCommands controls and use the text-context source.
  await page.getByLabel("email", { exact: true }).focus(); await page.getByLabel("email", { exact: true }).evaluate((el: HTMLInputElement) => { el.select() })
  await key("v"); assert.equal(await value(page, "email"), "3")
  await page.getByLabel("number", { exact: true }).focus(); await page.getByLabel("number", { exact: true }).evaluate((el: HTMLInputElement) => { el.select() })
  await key("v"); assert.equal(await value(page, "number"), "3")
}))

test("TSB-03: read-only text copies a single source or a spanning selection; nothing else changes it", async () => scenario(async (page, key) => {
  await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); (window as any).f.selectNodes("p1", "p1") })
  await key("c"); assert.deepEqual((await f(page)).writes, ["First message text"])
  await page.evaluate(() => (window as any).f.selectNodes("p1", "p2"))
  await key("c"); assert.match((await f(page)).copies.at(-1)!, /^First message text\s+Second message text$/)
  const html = await page.locator("#p1").innerHTML()
  for (const name of ["v", "x", "z"]) await key(name)
  await key("a")
  assert.equal(await page.locator("#p1").innerHTML(), html)
  assert.match(await page.evaluate(() => getSelection()!.toString()), /^First message text\s+Second message text$/, "select all does not take over read-only text")
  assert.equal((await f(page)).reads, 0)
}))

test("TSB-04: with a dialog open, a background selection is not copied", async () => scenario(async (page, key) => {
  await page.evaluate(() => (window as any).f.selectNodes("p1", "p2"))
  await page.evaluate(() => (window as any).f.openDialog()); await page.locator("#in-dialog").focus()
  await page.evaluate(() => (window as any).f.selectNodes("p1", "p1"))
  await key("c")
  const result = await f(page); assert.deepEqual(result.writes, []); assert.deepEqual(result.copies, [])
  assert.deepEqual(result.errors, [], "an intended barrier is not reported as a failure")
}))

test("TSB-05: an input inside a menu that stops propagation still edits", async () => scenario(async (page, key) => {
  await select(page, "menu search", 0, 5); await key("c"); assert.deepEqual((await f(page)).copies, ["query"])
  await select(page, "menu search", 5, 5); await key("v"); assert.equal(await value(page, "menu search"), "querypaste-fixture")
}))

test("TSB-06: a masked API Key never copies or cuts", async () => scenario(async (page, key) => {
  await select(page, "API Key", 0, 6); await key("c"); await key("x")
  const result = await f(page); assert.deepEqual(result.writes, []); assert.deepEqual(result.copies, [])
  assert.equal(await value(page, "API Key"), "secret-key")
}))

test("TSB-07: removed and rebound copy keys follow the settings", async () => scenario(async (page, key) => {
  await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); const w = window as any; w.f.override({ "text.copy": [] }); w.f.selectNodes("p1", "p1") })
  await key("c"); assert.deepEqual((await f(page)).writes, [])
  await page.evaluate(() => (window as any).f.override({ "text.copy": ["Cmd+Alt+C"] }))
  await key("c", ["Meta", "Alt"]); assert.deepEqual((await f(page)).writes, ["First message text"])
}))

test("TSM-01: editable Monaco copies, cuts and pastes through its adapter; undo stays with Monaco", async () => scenario(async (page, key) => {
  await page.evaluate(() => { const e = (window as any).f.editor; e.focus(); e.setSelection({ startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 9 }) })
  await key("c"); assert.deepEqual((await f(page)).copies.at(-1), "Line one")
  await page.evaluate(() => { const e = (window as any).f.editor; e.setPosition({ lineNumber: 2, column: 9 }) })
  await key("v"); await page.waitForFunction(() => (window as any).f.model.getValue().includes("paste-fixture"))
  assert.equal(await page.evaluate(() => (window as any).f.model.getValue()), "Line one\nLine twopaste-fixture")
  await key("z"); assert.equal(await page.evaluate(() => (window as any).f.model.getValue()), "Line one\nLine two", "the paste is one undo step")
  await page.evaluate(() => { const e = (window as any).f.editor; e.setSelection({ startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 6 }) })
  await key("x"); assert.equal(await page.evaluate(() => (window as any).f.model.getValue()), "one\nLine two")
}))

test("TSM-02: read-only Monaco copies but never pastes or cuts", async () => scenario(async (page, key) => {
  await page.evaluate(() => { const w = (window as any).f; w.readOnly(true); w.editor.focus(); w.editor.setSelection({ startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 5 }) })
  await key("v"); await key("x")
  assert.equal(await page.evaluate(() => (window as any).f.model.getValue()), "Line one\nLine two")
  await key("c"); assert.deepEqual((await f(page)).copies.at(-1), "Line")
  assert.equal((await f(page)).reads, 0)
}))

test("TSM-03: Monaco's find input pastes into itself, not the manuscript", async () => scenario(async (page, key) => {
  await page.evaluate(() => { const e = (window as any).f.editor; e.focus(); e.getAction("actions.find").run() })
  const find = page.locator(".monaco-editor .find-widget textarea, .monaco-editor .find-widget input").first()
  await find.waitFor(); await find.focus()
  await key("v")
  assert.match(await find.inputValue(), /paste-fixture/)
  assert.equal(await page.evaluate(() => (window as any).f.model.getValue()), "Line one\nLine two")
}))

test("TSM-04: Monaco chords whose second key is a text key stay with Monaco (Cmd+K Cmd+X trims trailing space)", async () => scenario(async (page, key) => {
  await page.evaluate(() => { const w = (window as any).f; w.model.setValue("Line one   \nLine two"); w.editor.focus(); w.editor.setPosition({ lineNumber: 2, column: 3 }) })
  await key("k"); await key("x")
  assert.equal(await page.evaluate(() => (window as any).f.model.getValue()), "Line one\nLine two")
  assert.deepEqual((await f(page)).copies, [], "the second key is not a cut")
}))
