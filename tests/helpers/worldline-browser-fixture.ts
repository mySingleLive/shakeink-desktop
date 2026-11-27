/* docs/581 §0: browser harness for the real WorldlinePanel with an in-memory planning API.
 * React, PlanningWorkspace, the planning CSS module and the stores are real. GET/POST /api/novels/:id/planning is an
 * in-page fixture that applies the real applyPlanningOperations, so saves read back. Synthetic data only; this is not
 * a local database, supplier, native Electron or installed-package proof. */
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { build } from "esbuild"
import postcss from "postcss"
import tailwindcss from "@tailwindcss/postcss"
import { chromium, type Browser, type Page } from "playwright-core"

export const NOVEL = "fixture-novel"

const stylesheet = (async () => {
  const path = resolve("src/app/globals.css")
  const [globals, desktop] = await Promise.all([readFile(path, "utf8"), readFile(resolve("src/app/desktop.css"), "utf8")])
  return (await postcss([tailwindcss()]).process(`${globals}\n${desktop}`, { from: path })).css
})()

/** `profiling` swaps in react-dom/profiling and a development build (docs/581 §0, render-count cases only). */
export function bundleWorldline(options: { profiling?: boolean } = {}) {
  return build({
    stdin: { loader: "tsx", resolveDir: process.cwd(), sourcefile: "worldline-browser-fixture.tsx", contents: `
import React,{Profiler} from 'react';
import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {WorldlinePanel} from './src/components/content/planning/PlanningWorkspace';
import {TimelineZoomLevelsContext} from './src/components/content/planning/worldline/EventTimeline';
import {applyPlanningOperations,planningSchema} from './src/lib/planning/domain';
import {useChatStore} from './src/stores/chat';
import {useTabsStore,buildTabId} from './src/stores/tabs';
import {DesktopCommandController} from './src/components/desktop/DesktopCommandController';
import {useDesktopStore} from './src/stores/desktop';import {defaultState} from './desktop/core/settings';
globalThis.renders={};globalThis.__renderProbe=(id)=>{globalThis.renders[id]=(globalThis.renders[id]??0)+1};
const onRender=(id)=>{globalThis.renders[id]=(globalThis.renders[id]??0)+1};
globalThis.mountWorldline=(view,mount={})=>{
 window.desktop=mount.controller?{command:async()=>{},readClipboardText:async()=>{globalThis.clipboardReads++;return mount.clipboard??''},showTextContextMenu:async()=>globalThis.nextContextCommand??null,settings:async()=>{throw Error('unexpected settings write')}}:{};
 if(mount.controller)useDesktopStore.setState({bootstrap:{...defaultState,platform:'darwin'}});
 globalThis.shortcutOverrides=overrides=>useDesktopStore.setState(state=>({bootstrap:{...state.bootstrap,settings:{...state.bootstrap.settings,shortcuts:{...state.bootstrap.settings.shortcuts,darwin:overrides}}}}));
 useChatStore.setState({draft:'',draftNovelId:null});
 let state={...view,data:planningSchema.parse(view.data)};
 // docs/599 §13.6 / §15.2: history rows as the server writes them (src/lib/services/planning.ts:344-356): one row per
 // version holding the data after that commit; a restore's row says which version it restored. The initial version
 // has its own row, as a work created on the server does.
 const snapshots=new Map();
 if(!state.history.some(h=>h.version===state.version)){state={...state,history:[{id:'h'+state.version,version:state.version,reason:'初始'},...state.history]};snapshots.set('h'+state.version,state.data)}
 globalThis.posts=[];
 // docs/599 §15.5: holdNext() parks the next POST until release(); externalEdit(ops) is a change from elsewhere (AI).
 let held=null;
 globalThis.holdNext=()=>{let release;const gate=new Promise(r=>{release=r});held=gate;return release};
 const commit=(data,reason)=>{const version=state.version+1,id='h'+version;snapshots.set(id,data);state={...state,version,data,history:[{id,version,reason},...state.history]}};
 globalThis.externalEdit=ops=>commit(applyPlanningOperations(state.data,ops),'修改');
 globalThis.clipboardReads=0;
 window.fetch=async(input,init)=>{
  const path=String(input),method=(init&&init.method)||'GET';
  if(path==='/api/novels/${NOVEL}/characters'&&method==='GET'){globalThis.characterRequests=(globalThis.characterRequests??0)+1;return Response.json({characters:mount.characterRecords??[]})}
  if(path!=='/api/novels/${NOVEL}/planning')throw Error('Unexpected fixture request '+method+' '+path);
  if(method==='GET')return Response.json(state);
  const body=JSON.parse(init.body);globalThis.posts.push(body);
  if(held){const gate=held;held=null;await gate}
  if(body.expectedVersion!==state.version)return Response.json({error:'版本已变化'},{status:409});
  if(globalThis.failNextSave){globalThis.failNextSave=false;return Response.json({error:'保存失败（固定数据）'},{status:500})}
  if(body.action==='restore'){
   const row=state.history.find(h=>h.id===body.snapshotId);
   commit(snapshots.get(body.snapshotId)??state.data,'恢复规划版本：'+(row?row.version:state.version));
  }else commit(applyPlanningOperations(state.data,body.operations),'修改');
  return Response.json(state);
 };
 globalThis.planningState=()=>state;
 const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity},mutations:{retry:false}}});
 const root=createRoot(document.getElementById('app'));
 // docs/592 §7.1: zoom levels are off unless a case asks for them ('default' mounts without a Provider).
 const zoomed=(el)=>mount.zoomLevels==='default'?el:<TimelineZoomLevelsContext.Provider value={mount.zoomLevels===true}>{el}</TimelineZoomLevelsContext.Provider>;
 const panel=(key)=><div key={key} data-fixture-panel={key} style={{height:mount.panels>1?'50vh':'100vh',overflow:'auto'}}>{zoomed(<WorldlinePanel novelId='${NOVEL}' refId={mount.refId}/>)}</div>;
 flushSync(()=>root.render(<QueryClientProvider client={client}>{mount.controller?<DesktopCommandController/>:null}<Profiler id="workspace" onRender={onRender}>{Array.from({length:mount.panels??1},(_,i)=>panel('p'+i))}</Profiler></QueryClientProvider>));
 globalThis.requestWorldFocus=(target)=>useTabsStore.getState().requestPanelFocus(buildTabId('worldline','${NOVEL}'),target);
 globalThis.disposeWorldline=()=>{flushSync(()=>root.unmount());client.clear()};
 globalThis.refetchWorldline=()=>client.invalidateQueries();
 globalThis.chatDraft=()=>useChatStore.getState().draft;
 globalThis.openTabs=()=>useTabsStore.getState().tabs.map(t=>t.id);
};
` },
    bundle: true, write: false, platform: "browser", format: "iife", tsconfig: "tsconfig.json",
    outfile: "worldline-browser-fixture.js", loader: { ".css": "local-css" },
    define: { "process.env.NODE_ENV": options.profiling ? '"development"' : '"production"' },
    alias: options.profiling ? { "react-dom/client": "react-dom/profiling" } : {},
    plugins: [{ name: "unmounted-monaco-boundary", setup(b) {
      b.onResolve({ filter: /\/MonacoMarkdownEditor$/ }, () => ({ path: "unmounted-monaco", namespace: "worldline-fixture" }))
      b.onLoad({ filter: /.*/, namespace: "worldline-fixture" }, () => ({
        contents: "export default function MonacoMarkdownEditor(props){return React.createElement('textarea',{'aria-label':props['aria-label']??'事实正文',defaultValue:props.value,onChange:e=>props.onChange?.(e.target.value)})};import React from 'react'", loader: "js", resolveDir: process.cwd(),
      }))
    } }],
  }).then(result => ({
    js: result.outputFiles!.find(file => file.path.endsWith(".js"))!.text,
    css: result.outputFiles!.filter(file => file.path.endsWith(".css")).map(file => file.text).join("\n"),
  }))
}

export function launch() {
  return chromium.launch({ headless: true, ...(process.env.SHAKEINK_TEST_CHROMIUM ? { executablePath: process.env.SHAKEINK_TEST_CHROMIUM } : {}) })
}

export interface WorldlineView { version: number; data: unknown; characters: { id: string; name: string; avatarUrl: string | null }[]; materials: unknown[]; readonly: boolean; history: unknown[]; proposals: unknown[] }

/** Opens a page, mounts the panel with `view`, runs `body`, and fails on any page error. */
export async function withWorldline(browser: Browser, view: WorldlineView, body: (page: Page) => Promise<void>, options: { profiling?: boolean; theme?: "ink" | "paper"; width?: number; refId?: string; panels?: number; controller?: boolean; reducedMotion?: boolean; zoomLevels?: boolean | "default"; clipboard?: string; characterRecords?: unknown[] } = {}) {
  const page = await browser.newPage({ viewport: { width: options.width ?? 1440, height: 1000 }, deviceScaleFactor: 1 })
  const errors: string[] = []
  page.setDefaultTimeout(5000)
  page.on("pageerror", error => errors.push(error.message))
  page.on("console", message => { if (message.type() === "error" && !message.text().includes("Failed to load resource")) errors.push(message.text()) })
  try {
    await page.route("**/*", route => route.request().isNavigationRequest()
      ? route.fulfill({ contentType: "text/html", body: `<html class="${options.theme ?? "ink"}"><body><div id="app" style="height:100vh"></div></body></html>` })
      : route.abort())
    await page.goto("http://127.0.0.1:1/worldline-isolated")
    const compiled = await bundleWorldline({ profiling: options.profiling })
    await page.addStyleTag({ content: `${await stylesheet}\n${compiled.css}` })
    await page.addScriptTag({ content: compiled.js })
    if (options.reducedMotion) await page.emulateMedia({ reducedMotion: "reduce" })
    await page.evaluate(([v, m]) => (window as any).mountWorldline(v, m), [view, { refId: options.refId, panels: options.panels, controller: options.controller, zoomLevels: options.zoomLevels ?? false, clipboard: options.clipboard, characterRecords: options.characterRecords }] as const)
    await page.getByRole("heading", { name: "世界线", exact: true }).first().waitFor()
    await body(page)
    if (errors.length) throw Error("page errors: " + errors.join(" | "))
  } finally {
    await page.evaluate(() => (window as any).disposeWorldline?.()).catch(() => {})
    await page.close()
  }
}

/** docs/592: R1's two-line titles make families taller, so a card a case expects in view at first open may sit under
 * the lane's bottom edge. Moves the canvas with the arrow keys (80px per press, as a user would, no selection or
 * locate) until the card is inside the lane. The timeline must be open. */
export async function revealTimelineCard(page: Page, card: import("playwright-core").Locator) {
  const lane = page.locator("[data-timeline-lane]")
  // A card outside the rendered band or the built range is not in the DOM: fail here, not in a later click timeout.
  await card.first().waitFor({ state: "attached", timeout: 3000 })
  for (let i = 0; i < 60; i++) {
    const [c, l, m] = await Promise.all([card.boundingBox(), lane.boundingBox(), page.locator("[data-minimap]").first().boundingBox().catch(() => null)])
    if (!c || !l) return
    // docs/596: the minimap is 120px high; a card that overlaps it in x must end above it to be clickable.
    const bottom = m && c.x < m.x + m.width && c.x + c.width > m.x ? Math.min(l.y + l.height - 60, m.y - 8) : l.y + l.height - 60
    if (c.y >= l.y + 8 && c.y + c.height <= bottom) return
    await page.locator("[data-timeline]").focus()
    await page.keyboard.press(c.y + c.height > bottom ? "ArrowDown" : "ArrowUp")
    await page.waitForTimeout(16)
  }
}
