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
import {applyPlanningOperations,planningSchema} from './src/lib/planning/domain';
import {useChatStore} from './src/stores/chat';
globalThis.renders={};
const onRender=(id)=>{globalThis.renders[id]=(globalThis.renders[id]??0)+1};
globalThis.mountWorldline=(view)=>{
 window.desktop={};
 useChatStore.setState({draft:'',draftNovelId:null});
 let state={...view,data:planningSchema.parse(view.data)};
 globalThis.posts=[];
 window.fetch=async(input,init)=>{
  const path=String(input),method=(init&&init.method)||'GET';
  if(path!=='/api/novels/${NOVEL}/planning')throw Error('Unexpected fixture request '+method+' '+path);
  if(method==='GET')return Response.json(state);
  const body=JSON.parse(init.body);globalThis.posts.push(body);
  if(body.expectedVersion!==state.version)return Response.json({error:'版本已变化'},{status:409});
  if(globalThis.failNextSave){globalThis.failNextSave=false;return Response.json({error:'保存失败（固定数据）'},{status:500})}
  const data=body.action==='restore'?state.data:applyPlanningOperations(state.data,body.operations);
  state={...state,version:state.version+1,data,history:[{id:'h'+state.version,version:state.version,reason:body.action==='restore'?'恢复规划版本：'+state.version:'修改'},...state.history]};
  return Response.json(state);
 };
 globalThis.planningState=()=>state;
 const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity},mutations:{retry:false}}});
 const root=createRoot(document.getElementById('app'));
 flushSync(()=>root.render(<QueryClientProvider client={client}><Profiler id="workspace" onRender={onRender}><WorldlinePanel novelId='${NOVEL}'/></Profiler></QueryClientProvider>));
 globalThis.disposeWorldline=()=>{flushSync(()=>root.unmount());client.clear()};
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
export async function withWorldline(browser: Browser, view: WorldlineView, body: (page: Page) => Promise<void>, options: { profiling?: boolean; theme?: "ink" | "paper"; width?: number } = {}) {
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
    await page.evaluate(v => (window as any).mountWorldline(v), view)
    await page.getByRole("heading", { name: "世界线", exact: true }).waitFor()
    await body(page)
    if (errors.length) throw Error("page errors: " + errors.join(" | "))
  } finally {
    await page.evaluate(() => (window as any).disposeWorldline?.()).catch(() => {})
    await page.close()
  }
}
