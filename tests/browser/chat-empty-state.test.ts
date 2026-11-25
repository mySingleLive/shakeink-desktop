import assert from "node:assert/strict"
import { test as nodeTest } from "node:test"
import { readFile } from "node:fs/promises"
import { resolve, sep } from "node:path"
import { build } from "esbuild"
import postcss from "postcss"
import tailwindcss from "@tailwindcss/postcss"
import { chromium, type Browser, type Page } from "playwright-core"

const test = Object.assign((name: string, run: () => Promise<void>) => nodeTest(name, { timeout: 180_000 }, run), { before: nodeTest.before, after: nodeTest.after })
// Product platform fixtures do not change Chromium's host-native editing keys.
const nativeUndo = process.platform === "darwin" ? "Meta+z" : "Control+z"
const nativeRedo = process.platform === "win32" ? "Control+y" : process.platform === "darwin" ? "Meta+Shift+z" : "Control+Shift+z"

// Full production ChatPanel, useAgentChat, composer and CreateNovelDialog run
// together. Only HTTP responses and synthetic account data are controlled.
// This fixture has no listening server, provider connection or OS clipboard.
// It is component evidence, not native Electron / supplier acceptance.
const cssPath = resolve("src/app/globals.css")
const stylesheet = (async () => (await postcss([tailwindcss()]).process(await readFile(cssPath, "utf8"), { from: cssPath })).css + "\n" + await readFile("src/app/desktop.css", "utf8"))()
const bundle = build({ stdin: { loader: "tsx", sourcefile: "chat-empty-state-browser-fixture.tsx", resolveDir: process.cwd(), contents: `
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {ThemeProvider} from 'next-themes';
import {ChatPanel} from './src/components/layout/ChatPanel';
import {CreateNovelDialog} from './src/components/layout/CreateNovelDialog';
import {useChatStore} from './src/stores/chat';import {useDesktopStore} from './src/stores/desktop';import {useTabsStore} from './src/stores/tabs';
import {useCardSelection} from './src/components/chat/use-card-selection';
import {editorToText} from './src/components/chat/composer-editor';
import {defaultState} from './desktop/core/settings';import {desktopCommandTargets} from './src/lib/desktop/command-runtime';
import {chatSessionKey} from './src/lib/chat-session';
import {dispatchChatSendMessage} from './src/components/chat/ui-events';
globalThis.mountChatEmpty=(options={})=>{
 sessionStorage.clear();localStorage.clear();
 const model={id:'11111111-1111-4111-8111-111111111111',name:'合成组件模型',provider:'openai',modelId:'fixture',tier:'NORMAL',contextWindow:0,free:false,thinkingEfforts:[]};
 const state=structuredClone(defaultState);state.settings.agent.textModelId=options.defaultModel?model.id:null;
 const bootstrap={...state,revision:1,platform:'win32',systemDark:options.theme==='ink',version:'fixture',draftSessionId:'fixture-session'};
 const bridgeCalls=[],unexpected=[];
 // An unexpected bridge access fails visibly. No permissive/no-op Proxy.
 window.desktop=Object.freeze({
  readClipboardText:async()=>{bridgeCalls.push('readClipboardText');return ''},
  writeClipboardText:async text=>{bridgeCalls.push(['writeClipboardText',text])},
  command:async id=>{bridgeCalls.push(['command',id])},
  novelImport:async action=>{bridgeCalls.push(['novelImport',action.type]);return {view:null}},
 });
 useDesktopStore.setState({bootstrap,saving:0,error:null});useTabsStore.setState({tabs:[],activeTabId:null});useCardSelection.setState({selection:null});
 useChatStore.setState({accountId:null,recoveryStatus:'restoring',recoveryNotice:null,storageNotice:null,conversationId:null,requestedConversationId:null,
  newConversationRequested:false,newConversationPayload:null,draft:'',draftNovelId:null,pendingNovelTitle:null,pendingNovelPosition:null,novelCreationRequestId:null,
  creatingNovel:false,isGenerating:false,suspendedExecution:false,pendingQuestion:null,pendingPlan:null,pendingRequest:null,queuedMessages:[],queuePaused:false,
  modelChoice:{modelId:null,effort:null},modelChoiceExplicit:false,mode:'standard',modeExplicit:false});
 const calls=[],loads=new Map(),gates=new Map();let models=options.models===false?[]:[model],defaultModelId=options.responseDefault?model.id:null,wizardError=false,storageWriteFails=false,lastLoaded=null,chatReject=null;
 const nativeStorageSet=Storage.prototype.setItem;
 Storage.prototype.setItem=function(key,value){if(storageWriteFails&&key===chatSessionKey('fixture-author'))throw Error('controlled fixture storage failure');return nativeStorageSet.call(this,key,value)};
 const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:0},mutations:{retry:false}}});
 const detail=(id,extra={})=>({conversation:{id,novelId:null,modelId:null,title:'合成会话'},messages:[],...extra});
 const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
 window.fetch=async(input,init={})=>{
  const path=String(input),method=init.method||'GET',body=init.body?JSON.parse(init.body):null;calls.push({path,method,body});
  if(path==='/api/models'&&method==='GET')return json({models,defaultModelId});
  if(path==='/api/novels'&&method==='GET')return json({novels:[],unavailableWorks:[]});
  if(path==='/api/novels'&&method==='POST')return json({novel:{id:'fixture-created-work',title:body.title}},201);
  if(path==='/api/chat/conversations'&&method==='GET')return json({conversations:[]});
  if(path.startsWith('/api/templates/wizard')&&method==='GET')return wizardError?json({error:'合成本地模板读取失败'},500):json({templates:[],revision:1});
  if(path==='/api/chat'&&method==='POST'){
   if(chatReject)return json({error:chatReject.message,code:chatReject.code},409);
   const events=[{type:'start',messageId:'fixture-assistant'},{type:'text-start',id:'fixture-text'},{type:'text-delta',id:'fixture-text',delta:'受控组件响应'},{type:'text-end',id:'fixture-text'},{type:'finish',finishReason:'stop'}];
   return new Response(events.map(e=>'data: '+JSON.stringify(e)+'\\n\\n').join(''),{headers:{'content-type':'text/event-stream','X-Conversation-Id':'fixture-sent-conversation'}});
  }
  const chat=/^\\/api\\/chat\\/conversations\\/([^/]+)$/.exec(path);
  if(chat&&method==='GET'){
   const id=chat[1],gate=gates.get(id);if(gate)await gate.promise;
   const value=loads.get(id);if(value?.reject)throw Error(value.reject);lastLoaded=id;return json(value?.body??detail(id),value?.status??200);
  }
  if(chat&&method==='PATCH')return json({conversation:{id:chat[1],...body}});
  // CES-11：回合成功收尾的后台标题请求（fire-and-forget）与 skipQuestion 的跳过端点；
  // lastLoaded 供 interaction 存根回读当前会话 id（applyTurnState 守卫要求 conversationId 匹配）
  if(/^\\/api\\/chat\\/conversations\\/[^/]+\\/title$/.test(path)&&method==='POST')return json({changed:false,reason:'not-default'});
  const turnInteraction=/^\\/api\\/chat\\/turns\\/([^/]+)\\/interaction$/.exec(path);
  if(turnInteraction&&method==='POST'){
   if(turnInteraction[1]==='ces11-turn-fail')return json({error:'合成跳过失败'},500);
   return json({turn:{id:turnInteraction[1],conversationId:lastLoaded,latestAttemptId:'fixture-attempt',status:'succeeded',interaction:null},attempts:[],messages:[],recovery:{latest:true,canRetry:false,canResume:false,hasEffects:false,unknownExternal:false}});
  }
  if(/^\\/api\\/chat\\/conversations\\/[^/]+\\/sop-plan$/.test(path))return json({active:null,recent:[]});
  const novel=/^\\/api\\/novels\\/([^/]+)(?:\\/(.*))?$/.exec(path);
  if(novel&&method==='GET'){
   const [,id,part]=novel;if(!part)return json({novel:{id,title:'合成关联作品',characters:[],settings:[],volumes:[]}});
   if(part==='story-workflow')return json({workflow:null});if(part==='scenes/factions')return json({factions:[]});if(part==='attributes')return json({definitions:[]});
   const candPrefix='chapters/chapter/candidates/';if(part.startsWith(candPrefix)){const id=part.slice(candPrefix.length),gate=gates.get('candidate:'+id);if(gate)await gate.promise;return json({candidate:{id,chapterId:'chapter',status:'ready',content:'合成候选正文',contentHash:'a'.repeat(64),baseVersion:1,wordCount:6,checks:[]}}); }
   if(part==='chapters/chapter')return json({chapter:{id:'chapter',title:'合成章',index:1,version:1,content:'合成正文',wordCount:4,status:'DRAFT'}});
   if(['worlds','characters','items','scenes','settings'].includes(part))return json({[part]:[]});
  }
  unexpected.push({path,method});throw Error('unexpected fixture API '+method+' '+path);
 };
 const root=createRoot(document.getElementById('app'));let setWidth,setHeight,setSideWizard;
 function App(){const [width,widthSet]=useState(options.width??1000),[height,heightSet]=useState(options.height??900),[sideWizard,sideSet]=useState(false);setWidth=widthSet;setHeight=heightSet;setSideWizard=sideSet;
  return <ThemeProvider attribute='class' themes={['paper','ink']} enableSystem={false} forcedTheme={options.theme||'paper'}><QueryClientProvider client={client}><div id='fixture-panel' style={{width,height,position:'relative'}}><ChatPanel userId='fixture-author'/></div><CreateNovelDialog open={sideWizard} onOpenChange={sideSet} novels={[]}/></QueryClientProvider></ThemeProvider>;
 }
 document.documentElement.classList.toggle('ink',options.theme==='ink');document.documentElement.classList.toggle('paper',options.theme!=='ink');
 flushSync(()=>root.render(<App/>));let pinnedEditor,pinnedChip;
 return {model,calls,bridgeCalls,unexpected,client,
  patch:value=>flushSync(()=>useChatStore.setState(value)),state:()=>{const s=useChatStore.getState();return {accountId:s.accountId,draftId:s.draftId,conversationId:s.conversationId,draft:s.draft,draftNovelId:s.draftNovelId,pendingNovelTitle:s.pendingNovelTitle,pendingNovelPosition:s.pendingNovelPosition,novelCreationRequestId:s.novelCreationRequestId,queuedMessages:s.queuedMessages,queuePaused:s.queuePaused,recoveryStatus:s.recoveryStatus,recoveryNotice:s.recoveryNotice,modelChoice:s.modelChoice,modelChoiceExplicit:s.modelChoiceExplicit,isGenerating:s.isGenerating,pendingQuestion:s.pendingQuestion,draftAction:s.draftAction,selection:useCardSelection.getState().selection}},
  editor:()=>document.querySelector('[data-testid="composer-editor"]'),source:()=>editorToText(document.querySelector('[data-testid="composer-editor"]')),
  pin:()=>{pinnedEditor=document.querySelector('[data-testid="composer-editor"]');pinnedChip=pinnedEditor?.querySelector('.composer-chip')},sameEditor:()=>pinnedEditor===document.querySelector('[data-testid="composer-editor"]'),sameChip:()=>pinnedChip===document.querySelector('[data-testid="composer-editor"]')?.querySelector('.composer-chip'),
  choose:()=>flushSync(()=>useChatStore.getState().setModelChoice({modelId:model.id,effort:null})),
  catalog:(available,withDefault=false)=>{models=available?[model]:[];defaultModelId=withDefault?model.id:null;flushSync(()=>client.setQueryData(['chat-models'],{models,defaultModelId}))},
  command:id=>desktopCommandTargets.execute(id,document.querySelector('[data-testid="composer-editor"]')),
  external:(text,novelId,options)=>dispatchChatSendMessage(text,novelId,options),
  request:id=>useChatStore.getState().requestConversation(id),newDraft:payload=>useChatStore.getState().requestNewConversation(payload),
  response:(id,status=200,extra={})=>loads.set(id,{status,body:status===200?detail(id,extra):{error:'合成加载失败'}}),reject:id=>loads.set(id,{reject:'合成网络失败'}),
  chatReject:(code,message)=>{chatReject={code,message}},
  defer:id=>{let release;const promise=new Promise(yes=>release=yes);gates.set(id,{promise,release})},release:id=>{const gate=gates.get(id);gate.release();gates.delete(id)},
  select:value=>flushSync(()=>useCardSelection.setState({selection:value})),
  wizardFailure:value=>{wizardError=value;return client.invalidateQueries({queryKey:['desktop','wizard-templates']})},
  failStorage:value=>storageWriteFails=value,
  sideWizard:()=>flushSync(()=>setSideWizard(true)),resize:(width,height)=>flushSync(()=>{setWidth(width);setHeight(height)}),
  unmount:()=>{root.unmount();client.clear()},
 };
};` }, bundle: true, platform: "browser", format: "esm", outfile: "chat-empty-state-fixture.js", external: ["/brand/*"], loader: { ".ttf": "dataurl" }, define: { "process.env.NODE_ENV": '"development"', "process.env": "{}" }, minify: true, write: false, tsconfig: "tsconfig.json" }).then(result => ({ script: result.outputFiles!.find(file => file.path.endsWith(".js"))!.text, css: result.outputFiles!.find(file => file.path.endsWith(".css"))?.text ?? "" }))

let browser: Browser
test.before(async () => { if (process.env.SHAKEINK_CES_DIAGNOSTIC) process.stdout.write("CES fixture: launch\n"); browser = await chromium.launch({ headless: true, timeout: 60_000, ...(process.env.SHAKEINK_TEST_CHROMIUM ? { executablePath: process.env.SHAKEINK_TEST_CHROMIUM } : {}) }); if (process.env.SHAKEINK_CES_DIAGNOSTIC) process.stdout.write("CES fixture: launched\n") })
test.after(async () => { await browser?.close() })
async function frames(page: Page) { await page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done())))) }
const welcome = (page: Page) => page.getByTestId("chat-empty-state")
const editor = (page: Page) => page.getByTestId("composer-editor")
const action = (page: Page, name: string) => welcome(page).getByRole("button", { name: new RegExp("^" + name) })
async function scenario(options: Record<string, unknown>, run: (page: Page) => Promise<void>) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } }), errors: string[] = []
  const diagnostic = (step: string) => { if (process.env.SHAKEINK_CES_DIAGNOSTIC) process.stdout.write("CES fixture: " + step + "\n") }
  // This full production bundle decodes the approved sprite sheets and Monaco
  // dependencies. Give navigation/setup an environment budget, without changing
  // any geometry, frame, draft or business assertions.
  page.setDefaultTimeout(30_000); page.setDefaultNavigationTimeout(60_000); page.on("pageerror", error => errors.push(error.message))
  try {
    await page.route("**/*", async route => {
      const url = new URL(route.request().url())
      if (route.request().isNavigationRequest()) { await route.fulfill({ contentType: "text/html", body: "<div id='app'></div>" }); return }
      const asset = resolve("public", "." + decodeURIComponent(url.pathname)), root = resolve("public")
      if (asset.startsWith(root + sep)) {
        try { const body = await readFile(asset); await route.fulfill({ body, contentType: asset.endsWith(".png") ? "image/png" : asset.endsWith(".svg") ? "image/svg+xml" : "application/octet-stream" }); return } catch { /* Missing assets remain failed requests, never fallback demo images. */ }
      }
      await route.abort()
    })
    await page.goto("http://127.0.0.1:1/chat-empty-state-component"); diagnostic("document")
    const fixtureBundle = await bundle
    diagnostic("bundle")
    await page.addStyleTag({ content: await stylesheet }); if (fixtureBundle.css) await page.addStyleTag({ content: fixtureBundle.css })
    diagnostic("styles")
    await page.addScriptTag({ content: fixtureBundle.script, type: "module" })
    diagnostic("script")
    await page.waitForFunction(() => typeof (window as any).mountChatEmpty === "function")
    await page.evaluate(options => { (window as any).f = (window as any).mountChatEmpty(options) }, options)
    diagnostic("mounted")
    await page.waitForFunction(() => (window as any).f.state().recoveryStatus === "ready")
    await page.bringToFront(); await frames(page); diagnostic("ready"); await run(page)
    assert.deepEqual(await page.evaluate(() => (window as any).f.unexpected), [], "only declared local API fixture routes may be used")
    assert.deepEqual(errors, [], "the full production component must not throw")
  } catch (error) { if (errors.length) throw new Error("Full component fixture errors: " + errors.join("; "), { cause: error }); throw error }
  finally { await page.evaluate(() => (window as any).f?.unmount()).catch(() => {}); await page.close() }
}
async function posts(page: Page) { return page.evaluate(() => (window as any).f.calls.filter((call: any) => call.method === "POST")) }
async function selected(page: Page, names: string[]) {
  const dialog = page.getByRole("dialog")
  for (const name of names) assert.equal(await dialog.getByRole("button", { name, exact: true }).getAttribute("aria-pressed"), "true", name + " must be selected")
}

test("CES-01a full ChatPanel first restore with paused empty queue exposes all seven approved entries", () => scenario({}, async page => {
  assert.equal(await page.evaluate(() => (window as any).f.state().queuePaused), true)
  await welcome(page).waitFor()
  assert.equal(await welcome(page).getByRole("button").count(), 7)
  for (const name of ["创建作品", "新角色", "新世界观", "新场景", "仙侠", "历史", "科幻"]) await action(page, name).waitFor()
  assert.equal(await editor(page).count(), 1)
  assert.equal(await page.getByRole("button", { name: "发送", exact: true }).isDisabled(), true)
  assert.deepEqual(await posts(page), [])
}))

test("CES-01b actual pending, recovery, queue and owned-card states suppress welcome without hiding original controls", () => scenario({}, async page => {
  await welcome(page).waitFor()
  const blockers = [
    [{ recoveryStatus: "restoring" }, "正在恢复会话"],
    [{ creatingNovel: true, pendingNovelTitle: "合成待建作品" }, "正在创建"],
    [{ recoveryNotice: "合成执行恢复通知" }, "合成执行恢复通知"],
    [{ pendingRequest: { clientRequestId: "fixture-pending", body: '{"message":"待确认"}' } }, "上次发送结果待确认"],
    [{ pendingPlan: { id: "fixture-plan", turnId: "fixture-turn", revision: 1, payload: { title: "合成待批准计划" } } }, "合成待批准计划"],
    [{ queuedMessages: [{ id: "fixture-q", text: "合成排队草稿" }], queuePaused: true }, "合成排队草稿"],
    [{ pendingQuestion: { markerStyle: "letters", questions: [{ question: "合成待答问题", options: ["合成选择"] }] } }, "合成待答问题"],
  ] as const
  for (const [patch, text] of blockers) {
    await page.evaluate(patch => (window as any).f.patch(patch), patch); await frames(page)
    assert.equal(await welcome(page).count(), 0, JSON.stringify(patch))
    assert.ok(await page.getByText(text, { exact: false }).first().isVisible(), text + " must remain visible")
    await page.evaluate(() => (window as any).f.patch({ recoveryStatus: "ready", creatingNovel: false, pendingNovelTitle: null, recoveryNotice: null, storageNotice: null, pendingRequest: null, pendingPlan: null, pendingQuestion: null, queuedMessages: [], queuePaused: true }))
    await welcome(page).waitFor()
  }
  await page.evaluate(() => { const f = (window as any).f; f.failStorage(true); f.patch({ draft: "合成失败存储草稿" }) })
  await frames(page); assert.equal(await welcome(page).count(), 0)
  assert.ok(await page.getByText("草稿暂未写入本地存储，刷新前请复制草稿", { exact: true }).isVisible())
  await page.evaluate(() => { const f = (window as any).f; f.failStorage(false); f.patch({ draft: "" }) }); await welcome(page).waitFor()
  for (const patch of [{ isGenerating: true }, { suspendedExecution: true }]) {
    await page.evaluate(patch => (window as any).f.patch(patch), patch); await frames(page); assert.equal(await welcome(page).count(), 0)
    await page.evaluate(() => (window as any).f.patch({ isGenerating: false, suspendedExecution: false, pendingNovelTitle: null })); await welcome(page).waitFor()
  }
  await page.evaluate(() => (window as any).f.patch({ pendingNovelTitle: "合成待创建作品" })); await welcome(page).waitFor()
  assert.ok(await page.getByText("《合成待创建作品》（待创建）", { exact: true }).isVisible())
  await page.evaluate(() => (window as any).f.patch({ pendingNovelTitle: null }))
  await page.evaluate(() => { const f = (window as any).f; f.patch({ draftNovelId: "fixture-work" }); f.select({ conversationId: null, novelId: "unrelated-work", chapterId: "chapter", chapterTitle: "合成章", candidateId: "candidate", label: "合成候选" }) })
  await welcome(page).waitFor()
  await page.evaluate(() => { const f = (window as any).f; f.select({ conversationId: null, novelId: "fixture-work", chapterId: "chapter", chapterTitle: "合成章", candidateId: "candidate", label: "合成候选" }) })
  await frames(page); assert.equal(await welcome(page).count(), 0)
  assert.equal(await page.getByTestId("candidate-action-panel").isVisible(), true, "zero-message owned selection must retain the original candidate slot")
}))

for (const [name, marker, body] of [
  ["新角色", "【角色】", "・成长弧线与剧情作用："],
  ["新世界观", "【世界观】", "・可以推动故事的冲突与秘密："],
  ["新场景", "【场景】", "・场景的剧情作用与潜在冲突："],
] as const) test(`CES-04 ${name} appends once with live chip DOM, native undo/redo and composer focus preserved`, () => scenario({}, async page => {
  await welcome(page).waitFor()
  const initial = "合成原稿 @[角色/青岚](character:fixture-char)"
  await page.evaluate(initial => (window as any).f.patch({ draft: initial }), initial)
  await editor(page).locator(".composer-chip").waitFor(); await page.evaluate(() => (window as any).f.pin())
  await action(page, name).click()
  const state = await page.evaluate(() => (window as any).f.state())
  assert.ok(state.draft.startsWith(initial + "\n\n" + marker + "\n")); assert.ok(state.draft.endsWith(body))
  assert.equal(await page.evaluate(() => (window as any).f.source()), state.draft)
  assert.equal(await page.evaluate(() => (window as any).f.sameEditor() && (window as any).f.sameChip()), true)
  assert.equal(await editor(page).evaluate(el => document.activeElement === el), true)
  await editor(page).press(nativeUndo); await frames(page)
  assert.equal(await page.evaluate(() => (window as any).f.state().draft), initial)
  await editor(page).press(nativeRedo); await frames(page)
  assert.equal(await page.evaluate(() => (window as any).f.state().draft), state.draft)
  await action(page, name).click(); assert.equal(await page.evaluate(() => (window as any).f.state().draft), state.draft)
  assert.equal(await editor(page).evaluate(el => document.activeElement === el), true)
  assert.deepEqual(await posts(page), [])
}))

test("CES-04b synthetic composition state blocks quick prompt until compositionend without truncating text", () => scenario({}, async page => {
  await welcome(page).waitFor(); await page.evaluate(() => (window as any).f.patch({ draft: "尚在输入的合成草稿" }))
  await editor(page).dispatchEvent("compositionstart", { data: "尚" })
  const card = action(page, "新角色")
  if (!(await card.isDisabled())) await card.click()
  assert.equal(await page.evaluate(() => (window as any).f.state().draft), "尚在输入的合成草稿")
  await editor(page).dispatchEvent("compositionend", { data: "尚" }); await card.click()
  assert.match(await page.evaluate(() => (window as any).f.state().draft), /^尚在输入的合成草稿\n\n【角色】/)
}))

for (const [genre, tags] of [
  ["仙侠", ["古典仙侠", "修仙界", "热血", "升级流"]],
  ["历史", ["架空历史", "古代", "正剧", "权谋"]],
  ["科幻", ["星际文明", "星际", "烧脑", "经营"]],
] as const) test(`CES-02 ${genre} opens original wizard preset, remains editable and never contaminates normal/sidebar entry`, () => scenario({}, async page => {
  await welcome(page).waitFor(); await action(page, genre).click(); await page.getByRole("dialog").waitFor()
  await selected(page, ["男频", "长篇", genre, ...tags])
  await page.getByRole("dialog").getByRole("button", { name: "不限", exact: true }).first().click()
  await page.evaluate(() => (window as any).f.patch({ draft: "父状态重渲染" })); await frames(page)
  assert.equal(await page.getByRole("dialog").getByRole("button", { name: "不限", exact: true }).first().getAttribute("aria-pressed"), "true")
  await page.getByRole("dialog").getByRole("button", { name: "取消", exact: true }).click(); await page.getByRole("dialog").waitFor({ state: "hidden" })
  assert.equal(await page.evaluate(() => (window as any).f.state().draft), "父状态重渲染")
  await action(page, "创建作品").click(); await page.getByRole("dialog").waitFor()
  assert.equal(await page.getByRole("dialog").getByRole("button", { name: "全部", exact: true }).getAttribute("aria-pressed"), "true")
  assert.equal(await page.getByRole("dialog").getByRole("button", { name: "男频", exact: true }).getAttribute("aria-pressed"), "false")
  await page.getByRole("dialog").getByRole("button", { name: "取消", exact: true }).click(); await page.getByRole("dialog").waitFor({ state: "hidden" })
  await page.evaluate(() => (window as any).f.sideWizard()); await page.getByRole("dialog").waitFor()
  assert.equal(await page.getByRole("dialog").getByRole("button", { name: "全部", exact: true }).getAttribute("aria-pressed"), "true")
  assert.equal(await page.getByRole("dialog").getByRole("button", { name: "男频", exact: true }).getAttribute("aria-pressed"), "false")
  assert.deepEqual(await posts(page), [])
}))

test("CES-03 original wizard replacement requires confirmation and prepares a new unassociated unsent work", () => scenario({}, async page => {
  await welcome(page).waitFor(); await page.evaluate(() => (window as any).f.patch({ draft: "必须保留的原稿", draftNovelId: "fixture-old-work" }))
  const originalDraftId = await page.evaluate(() => (window as any).f.state().draftId)
  await action(page, "仙侠").click(); const dialog = page.getByRole("dialog"); await dialog.waitFor()
  await dialog.getByRole("button", { name: "确定", exact: true }).click()
  assert.equal(await page.evaluate(() => (window as any).f.state().draft), "必须保留的原稿")
  await dialog.getByRole("button", { name: "热血", exact: true }).click()
  assert.equal(await dialog.getByRole("button", { name: "仍要替换", exact: true }).count(), 0)
  await dialog.getByRole("button", { name: "热血", exact: true }).click()
  await dialog.getByRole("button", { name: "确定", exact: true }).click()
  await dialog.getByRole("button", { name: "仍要替换", exact: true }).click(); await dialog.waitFor({ state: "hidden" })
  const state = await page.evaluate(() => (window as any).f.state())
  assert.notEqual(state.draftId, originalDraftId); assert.equal(state.conversationId, null); assert.equal(state.draftNovelId, null)
  assert.match(state.draft, /我的作品定位：/); assert.match(state.draft, /・题材：仙侠/)
  assert.deepEqual(state.pendingNovelPosition, { channel: "男频", length: "长篇", genre: "仙侠", tags: ["古典仙侠", "修仙界", "热血", "升级流"] })
  assert.ok(state.pendingNovelTitle); assert.ok(state.novelCreationRequestId); assert.deepEqual(await posts(page), [])
  assert.equal(await editor(page).evaluate(element => document.activeElement === element), true, "confirmed wizard must focus the prepared original composer")
  assert.equal(await page.getByRole("button", { name: "发送", exact: true }).isDisabled(), true)
}))

test("CES-05a a response default is never selected; deleted/unselected models cannot submit or create pending work", () => scenario({ responseDefault: true }, async page => {
  await welcome(page).waitFor(); await action(page, "新角色").click()
  assert.equal(await page.evaluate(() => (window as any).f.state().modelChoice.modelId), null)
  assert.equal(await page.getByRole("button", { name: "发送", exact: true }).isDisabled(), true)
  assert.equal(await page.evaluate(() => (window as any).f.command("ai.send")), false); assert.deepEqual(await posts(page), [])
  await page.evaluate(() => { const f = (window as any).f; f.choose(); f.catalog(false); f.patch({ pendingNovelTitle: "不可提前创建", novelCreationRequestId: "fixture-stable-create-request" }) })
  await frames(page); const before = await page.evaluate(() => (window as any).f.state())
  assert.equal(await page.getByRole("button", { name: "发送", exact: true }).isDisabled(), true)
  assert.equal(await page.evaluate(() => (window as any).f.command("ai.send")), false)
  const after = await page.evaluate(() => (window as any).f.state())
  assert.equal(after.draft, before.draft); assert.equal(after.pendingNovelTitle, before.pendingNovelTitle); assert.equal(after.novelCreationRequestId, before.novelCreationRequestId)
  assert.deepEqual(await posts(page), [])
}))

test("CES-05b automatic queue retains its head without a live selected model and resumes only after valid selection", () => scenario({ models: false }, async page => {
  await welcome(page).waitFor()
  await page.evaluate(() => (window as any).f.patch({ queuedMessages: [{ id: "fixture-queue-head", text: "不得丢失的合成队首" }], queuePaused: false }))
  await page.waitForTimeout(120)
  assert.deepEqual(await page.evaluate(() => (window as any).f.state().queuedMessages), [{ id: "fixture-queue-head", text: "不得丢失的合成队首" }]); assert.deepEqual(await posts(page), [])
  await page.evaluate(() => (window as any).f.catalog(true, true)); await page.waitForTimeout(60)
  assert.equal(await page.evaluate(() => (window as any).f.state().queuedMessages.length), 1); assert.deepEqual(await posts(page), [])
  await page.evaluate(() => (window as any).f.choose())
  await page.waitForFunction(() => !(window as any).f.state().isGenerating && (window as any).f.calls.some((call: any) => call.path === "/api/chat/conversations/fixture-sent-conversation/title" && call.method === "POST"))
  const sent = await posts(page); assert.deepEqual(sent.map((call: any) => call.path), ["/api/chat", "/api/chat/conversations/fixture-sent-conversation/title"]); assert.equal(sent[0].body.message, "不得丢失的合成队首");assert.equal(sent[1].body,null)
  assert.equal(await page.evaluate(() => (window as any).f.state().queuedMessages.length), 0)
}))

test("CES-05d no-model external action is retained in paused queue before question, selection or draft-action side effects", () => scenario({ models: false }, async page => {
  await welcome(page).waitFor()
  await page.evaluate(() => { const f = (window as any).f; f.patch({ draftNovelId: "fixture-work", draft: "保留已有草稿", draftAction: { kind: "question" }, pendingQuestion: { markerStyle: "letters", questions: [{ question: "保持当前待答", options: ["待答选项"] }] } }); f.select({ conversationId: null, novelId: "fixture-work", chapterId: "chapter", chapterTitle: "合成章", candidateId: "candidate", label: "合成候选" }) })
  const before = await page.evaluate(() => (window as any).f.state())
  const action = { kind: "improve", targetType: "CHAPTER_CONTENT", targetId: "chapter" }
  await page.evaluate(action => (window as any).f.external("不得丢失的外部改进意图", "fixture-work", { action }), action); await frames(page)
  const after = await page.evaluate(() => (window as any).f.state())
  assert.equal(after.draft, before.draft); assert.deepEqual(after.pendingQuestion, before.pendingQuestion); assert.deepEqual(after.selection, before.selection); assert.deepEqual(after.draftAction, before.draftAction)
  assert.equal(after.queuePaused, true); assert.equal(after.queuedMessages.length, 1); assert.equal(after.queuedMessages[0].text, "不得丢失的外部改进意图"); assert.deepEqual(after.queuedMessages[0].action, action)
  assert.deepEqual(await posts(page), []); assert.equal(await page.getByText("保持当前待答", { exact: true }).isVisible(), true)
}))

test("CES-05e clicking original candidate improve without a model preserves selected slot and queues the complete intent", () => scenario({ models: false }, async page => {
  await welcome(page).waitFor()
  await page.evaluate(() => { const f = (window as any).f; f.patch({ draftNovelId: "fixture-work", draft: "保留候选讨论草稿" }); f.select({ conversationId: null, novelId: "fixture-work", chapterId: "chapter", chapterTitle: "合成章", candidateId: "candidate", label: "合成候选" }) })
  await page.getByTestId("cap-option-improve").waitFor()
  const before = await page.evaluate(() => (window as any).f.state())
  await page.getByTestId("cap-option-improve").click(); await frames(page)
  const after = await page.evaluate(() => (window as any).f.state())
  assert.deepEqual(after.selection, before.selection); assert.equal(after.draft, before.draft); assert.equal(after.queuePaused, true)
  assert.equal(after.queuedMessages.length, 1); assert.match(after.queuedMessages[0].text, /chapterId: chapter，candidateId: candidate/); assert.match(after.queuedMessages[0].text, /为基础改进，再抽 3 份候选/)
  assert.equal(await page.getByTestId("candidate-action-panel").isVisible(), true); assert.deepEqual(await posts(page), [])
}))

test("CES-05c inherited default stays implicit until original send; first message preserves composer node and valid creation linkage", () => scenario({ defaultModel: true }, async page => {
  await welcome(page).waitFor(); await action(page, "科幻").click(); const dialog = page.getByRole("dialog"); await dialog.waitFor()
  await dialog.getByRole("button", { name: "确定", exact: true }).click(); await dialog.waitFor({ state: "hidden" })
  assert.equal(await editor(page).evaluate(element => document.activeElement === element), true)
  assert.equal(await page.evaluate(() => (window as any).f.state().modelChoiceExplicit), false)
  await page.evaluate(() => { const f = (window as any).f; f.pin(); f.editor().focus() })
  assert.equal(await page.evaluate(() => (window as any).f.command("ai.send")), true)
  await page.waitForFunction(() => !(window as any).f.state().isGenerating && (window as any).f.calls.some((call: any) => call.path === "/api/chat/conversations/fixture-sent-conversation/title" && call.method === "POST"))
  const sent = await posts(page)
  assert.deepEqual(sent.map((call: any) => call.path), ["/api/novels", "/api/chat", "/api/chat/conversations/fixture-sent-conversation/title"]);assert.equal(sent[2].body,null)
  assert.equal(sent[0].body.position.genre, "科幻"); assert.equal(sent[1].body.novelId, "fixture-created-work")
  assert.equal(Object.hasOwn(sent[1].body, "modelId"), false, "inherited model must still be captured atomically by the original backend boundary")
  assert.equal(await page.evaluate(() => (window as any).f.sameEditor()), true); assert.equal(await editor(page).count(), 1); assert.equal(await welcome(page).count(), 0)
  await page.evaluate(() => (window as any).f.newDraft()); await welcome(page).waitFor()
  assert.equal(await page.evaluate(() => (window as any).f.sameEditor()), true)
}))

test("CES-06 loading failure stays visible, retries clear it and late old responses cannot poison a new draft", () => scenario({}, async page => {
  await welcome(page).waitFor()
  await page.evaluate(() => { const f = (window as any).f; f.response("fixture-failed-load", 500); f.request("fixture-failed-load") })
  await page.getByRole("alert").filter({ hasText: /加载会话失败|合成加载失败/ }).waitFor()
  assert.equal(await welcome(page).count(), 0)
  await page.evaluate(() => (window as any).f.response("fixture-failed-load"))
  await page.getByRole("button", { name: /重试加载|重新加载|重试/ }).first().click(); await welcome(page).waitFor()
  await page.evaluate(() => { const f = (window as any).f; f.defer("fixture-late-load"); f.response("fixture-late-load", 500); f.request("fixture-late-load") })
  await page.waitForFunction(() => (window as any).f.calls.some((call: any) => call.path === "/api/chat/conversations/fixture-late-load"))
  await page.evaluate(() => (window as any).f.newDraft({ novelId: null, draft: "新归属合成草稿" })); await welcome(page).waitFor()
  const draftId = await page.evaluate(() => (window as any).f.state().draftId)
  await page.evaluate(() => (window as any).f.release("fixture-late-load")); await frames(page)
  assert.equal(await page.evaluate(() => (window as any).f.state().draftId), draftId)
  assert.equal(await page.evaluate(() => (window as any).f.state().draft), "新归属合成草稿")
  assert.equal(await page.getByRole("alert").count(), 0); await welcome(page).waitFor()
  assert.deepEqual(await posts(page), [])
}))

test("CES-06b continuing with a new accepted send clears a prior failed navigation alert", () => scenario({}, async page => {
  await welcome(page).waitFor()
  await page.evaluate(() => { const f=(window as any).f; f.response("fixture-abandoned-load",500); f.request("fixture-abandoned-load") })
  await page.getByRole("alert").filter({hasText:/加载会话失败/}).waitFor()
  await page.evaluate(() => (window as any).f.choose())
  await page.getByTestId("composer-editor").fill("继续当前草稿的新回合")
  await page.evaluate(() => (window as any).f.patch({pendingRequest:{clientRequestId:"fixture-pending",body:JSON.stringify({message:"另一个待核对回合"})}}))
  await page.getByRole("button",{name:"发送",exact:true}).click();await frames(page)
  assert.equal(await page.getByRole("alert").filter({hasText:/加载会话失败/}).count(),1)
  assert.deepEqual(await posts(page),[])
  await page.evaluate(() => (window as any).f.patch({pendingRequest:null}))
  await page.getByRole("button",{name:"发送",exact:true}).click()
  await page.waitForFunction(() => (window as any).f.calls.some((call:any)=>call.path==="/api/chat"&&call.method==="POST") && !(window as any).f.state().isGenerating)
  assert.equal(await page.getByRole("alert").filter({hasText:/加载会话失败/}).count(),0)
}))

test("CES-07/08 real hover expands once, reverses, preserves static icons and pauses for reduced motion and original modal", () => scenario({}, async page => {
  await welcome(page).waitFor()
  const card = action(page, "新角色"), art = card.locator('[data-role="card-art"]')
  const icons = await welcome(page).locator(".chat-empty-symbol").evaluateAll(elements => elements.map(element => ({ src: (element as HTMLImageElement).src, frame: element.getAttribute("data-frame") })))
  await card.hover(); await page.waitForFunction(() => document.querySelector('[data-action="character"] [data-role="card-art"]')?.getAttribute("data-frame") === "12")
  await page.waitForTimeout(150); assert.equal(await art.getAttribute("data-frame"), "12")
  await page.mouse.move(1390, 990); await page.waitForFunction(() => document.querySelector('[data-action="character"] [data-role="card-art"]')?.getAttribute("data-frame") === "0")
  await card.hover(); await page.waitForTimeout(180)
  const partial = Number(await art.getAttribute("data-frame")); assert.ok(partial > 0 && partial < 12)
  await page.mouse.move(1390, 990); await page.waitForTimeout(70); const reverse = Number(await art.getAttribute("data-frame")); assert.ok(reverse <= partial)
  await card.hover(); await page.waitForFunction(() => document.querySelector('[data-action="character"] [data-role="card-art"]')?.getAttribute("data-frame") === "12")
  await page.emulateMedia({ reducedMotion: "reduce" }); await page.waitForFunction(() => document.querySelector('[data-action="character"] [data-role="card-art"]')?.getAttribute("data-frame") === "0")
  assert.equal(await welcome(page).getAttribute("data-motion"), "paused")
  await page.emulateMedia({ reducedMotion: "no-preference" }); await action(page, "创建作品").click(); await page.getByRole("dialog").waitFor()
  assert.equal(await welcome(page).getAttribute("data-motion"), "paused")
  assert.deepEqual(await welcome(page).locator(".chat-empty-symbol").evaluateAll(elements => elements.map(element => ({ src: (element as HTMLImageElement).src, frame: element.getAttribute("data-frame") }))), icons)
  assert.equal(await welcome(page).locator('[data-role="card-art"]').evaluateAll(elements => elements.every(element => element.getAttribute("data-frame") === "0")), true)
  assert.deepEqual(await posts(page), [])
}))

for (const theme of ["paper", "ink"] as const) test(`CES-09 ${theme} uses real ThemeProvider, local images and aligned responsive welcome/composer`, () => scenario({ theme }, async page => {
  await welcome(page).waitFor()
  assert.equal(await page.evaluate(theme => document.documentElement.classList.contains(theme), theme), true)
  await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>(".chat-empty-state img")].every(image => image.complete && image.naturalWidth > 0))
  const colors = await welcome(page).locator('[data-role="card-art"]').evaluateAll(elements => elements.map(element => ({ filter: getComputedStyle(element).filter, opacity: getComputedStyle(element).opacity })))
  for (const color of colors) { assert.ok(color.filter.includes("grayscale(1)")); assert.equal(color.opacity, "0.5"); assert.equal(color.filter.includes("sepia(0.5)"), theme === "paper") }
  for (const width of [1000, 560, 480, 479, 320]) {
    await page.evaluate(width => (window as any).f.resize(width, 900), width); await frames(page)
    const layout = await page.evaluate(() => {
      const group = document.querySelector(".chat-empty-actions")!.getBoundingClientRect(), composer = document.querySelector(".chat-empty-composer")!.getBoundingClientRect()
      const cards = [...document.querySelectorAll(".chat-empty-action")].map(element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, subtitle: !!element.querySelector("small")?.textContent } })
      return { group: { x: group.x, width: group.width }, composer: { x: composer.x, width: composer.width }, cards }
    })
    assert.ok(Math.abs(layout.group.x - layout.composer.x) < 1); assert.ok(Math.abs(layout.group.width - layout.composer.width) < 1); assert.ok(layout.group.width <= 800)
    assert.ok(layout.cards.every(card => card.height === 114 && card.subtitle)); assert.ok(layout.cards.every(card => Math.abs(card.width - layout.cards[0].width) < 1))
    assert.equal(Math.abs(layout.cards[0].x - layout.cards[1].x) < 1, width < 480)
  }
  await page.setViewportSize({ width: 1000, height: 520 }); await page.evaluate(() => (window as any).f.resize(320, 480)); await frames(page)
  for (const name of ["创建作品", "新角色", "新世界观", "新场景", "仙侠", "历史", "科幻"]) {
    const button = action(page, name); await button.evaluate(element => element.scrollIntoView({ block: "center", behavior: "instant" })); await frames(page)
    const reachable = await button.evaluate(element => { const r = element.getBoundingClientRect(), s = element.closest(".chat-empty-state")!.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return r.y >= s.y - 1 && r.bottom <= s.bottom + 1 && (hit === element || element.contains(hit)) })
    assert.equal(reachable, true, name + " must fit in the short scroll viewport and receive pointer input")
    assert.ok(await editor(page).isVisible())
  }
  assert.deepEqual(await posts(page), [])
}))

// --- CES-10: a selected draw card must stay visible while the taller action
// panel takes over the composer dock (card-panel-scroll 2026-10-16). ---
function ces10Filler(id: string, lines: number) {
  // Paragraph-separated content: single \n soft-wraps in markdown and would not
  // create real scroll height (blank-line paragraphs do).
  return { id, role: "ASSISTANT", content: Array.from({ length: lines }, (_, i) => `合成填充正文段落 ${i + 1}，用于撑开消息列表滚动高度。`).join("\n\n"), toolCalls: [], interaction: null, parts: null }
}
const ces10DrawMessage = {
  id: "ces10-m-draw", role: "ASSISTANT", content: "合成抽卡结果。", toolCalls: [{
    toolCallId: "ces10-tc-draw", toolName: "drawChapterCandidates", input: null,
    output: { ok: true, draw: { drawId: "ces10-draw", chapterId: "chapter", chapterTitle: "合成章", wordMin: 0, wordBudget: 0, failures: [], candidates: [
      { id: "candidate", variant: "alpha", label: "合成角度甲", status: "ready", hardChecks: [], wordCount: 6, excerpt: "合成候选甲摘录正文，用于点击选中与遮挡检验。" },
      { id: "candidate-b", variant: "beta", label: "合成角度乙", status: "ready", hardChecks: [], wordCount: 6, excerpt: "合成候选乙摘录正文，用于点击选中与遮挡检验。" },
      { id: "candidate-c", variant: "gamma", label: "合成角度丙", status: "ready", hardChecks: [], wordCount: 6, excerpt: "合成候选丙摘录正文，用于换卡后的遮挡检验。" },
    ] } },
  }], interaction: null, parts: null,
}
async function ces10Load(page: Page, messages: unknown[]) {
  await page.evaluate(msgs => {
    const f = (window as any).f
    f.response("fixture-scroll-conv", 200, { conversation: { id: "fixture-scroll-conv", novelId: "fixture-work", modelId: null, title: "合成会话" }, messages: msgs })
    f.request("fixture-scroll-conv")
  }, messages as any)
  await page.getByTestId("candidate-card-alpha").waitFor()
  // Wait only for initial font/entrance setup and the real message scroller.
  // A transformed child can overflow an overflow-visible message wrapper;
  // that wrapper is not the scroll viewport, even when scrollHeight is larger.
  await page.waitForFunction(() => {
    const group = document.querySelector('[data-testid="candidate-draw-card"]')
    if (!group) return false
    let s = group.parentElement as HTMLElement | null
    while (s && !["auto", "scroll"].includes(getComputedStyle(s).overflowY)) s = s.parentElement
    if (!s || s === document.body || s === document.documentElement || document.fonts.status !== "loaded") return false
    for (let ancestor: Element | null = group; ancestor; ancestor = ancestor.parentElement) {
      if (ancestor.getAnimations().some(animation => animation.pending || animation.playState === "running")) return false
      if (ancestor === s) break
    }
    return s.scrollHeight - s.clientHeight > 1 && s.scrollHeight - s.scrollTop - s.clientHeight < 40
  })
  await frames(page)
}
async function ces10Geometry(page: Page) {
  return page.evaluate(() => {
    const group = document.querySelector('[data-testid="candidate-draw-card"]')!
    let scroller = group.parentElement as HTMLElement | null
    while (scroller && !["auto", "scroll"].includes(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement
    if (!scroller || scroller === document.body || scroller === document.documentElement) throw Error("CES-10 requires the real message scroll viewport")
    const lr = scroller.getBoundingClientRect(), tr = group.getBoundingClientRect()
    return { listTop: lr.top, listBottom: lr.bottom, groupTop: tr.top, groupBottom: tr.bottom, scrollTop: scroller.scrollTop }
  })
}
type Ces10Geometry = { listTop: number; listBottom: number; groupTop: number; groupBottom: number; scrollTop: number }
function ces10ExpectVisible(g: Ces10Geometry, note: string) {
  assert.ok(g.groupTop >= g.listTop - 1 && g.groupBottom <= g.listBottom + 1, `${note}: group must be fully inside the message viewport: ${JSON.stringify(g)}`)
}

test("CES-10a selecting a bottom draw card keeps its group fully visible above the growing action panel", () => scenario({}, async page => {
  await ces10Load(page, [ces10Filler("ces10-m1", 40), ces10Filler("ces10-m2", 40), ces10Filler("ces10-m3", 40), ces10DrawMessage])
  ces10ExpectVisible(await ces10Geometry(page), "group visible at the bottom before selection")
  await page.getByTestId("candidate-card-alpha").click()
  await page.getByTestId("candidate-action-panel").waitFor()
  ces10ExpectVisible(await ces10Geometry(page), "stage-1 panel swap")
  await page.getByTestId("cap-option-improve").waitFor()
  await frames(page)
  ces10ExpectVisible(await ces10Geometry(page), "stage-2 panel options loaded")
}))

test("CES-10b selecting a mid-viewport history draw card does not move the scroller", () => scenario({}, async page => {
  await ces10Load(page, [ces10Filler("ces10-m1", 40), ces10DrawMessage, ces10Filler("ces10-m2", 40), ces10Filler("ces10-m3", 40), ces10Filler("ces10-m4", 40)])
  await page.evaluate(() => {
    const group = document.querySelector('[data-testid="candidate-draw-card"]') as HTMLElement
    let scroller = group.parentElement as HTMLElement | null
    while (scroller && scroller.scrollHeight - scroller.clientHeight < 1) scroller = scroller.parentElement
    group.scrollIntoView({ block: "start" })
    scroller!.scrollTop -= 40
  })
  await frames(page)
  const before = await ces10Geometry(page)
  assert.ok(before.groupTop - before.listTop > 8 && before.listBottom - before.groupBottom > 8, `precheck: group fully visible with >8px margins on every side: ${JSON.stringify(before)}`)
  assert.ok(before.listBottom - before.groupBottom > 320, `precheck: bottom margin must exceed the panel's full growth so the guard cannot fail for coverage reasons: ${JSON.stringify(before)}`)
  await page.getByTestId("candidate-card-alpha").click()
  await page.getByTestId("cap-option-improve").waitFor()
  await frames(page)
  const after = await ces10Geometry(page)
  assert.ok(Math.abs(after.scrollTop - before.scrollTop) <= 2, `scroller must not move when the selected card is already fully visible: ${before.scrollTop} -> ${after.scrollTop}`)
  ces10ExpectVisible(after, "mid-viewport group stays visible")
}))

test("CES-10c switching to another card in the group keeps the group fully visible", () => scenario({}, async page => {
  await ces10Load(page, [ces10Filler("ces10-m1", 40), ces10Filler("ces10-m2", 40), ces10Filler("ces10-m3", 40), ces10DrawMessage])
  await page.getByTestId("candidate-card-alpha").click()
  await page.getByTestId("cap-option-improve").waitFor()
  await frames(page)
  await page.getByTestId("candidate-card-gamma").click()
  // Deterministic stage-2 wait for the C card: its detail lands in the query
  // cache (groups unmount/remount around it; a plain option waitFor could hit
  // the stale row, and Playwright's pre-click auto-scroll must not mask it).
  await page.waitForFunction(() => (window as any).f.client.getQueryData(["content-candidates", "detail", "chapter", "candidate-c"]) != null)
  await frames(page)
  ces10ExpectVisible(await ces10Geometry(page), "after switching to card C and its options loading")
}))


// Observe the real child commit in a microtask, before ResizeObserver can
// compensate on a later rendering opportunity. The API gate guarantees that
// loading and the complete action rows occupy two distinct React commits.
async function ces10ObserveDockGrowth(page: Page) {
  await page.evaluate(`(() => {
    const w = window; w.ces10Growth = []; w.ces10DockHeight = null;
    w.ces10Observer = new MutationObserver(() => {
      const panel = document.querySelector('[data-testid="candidate-action-panel"]');
      if (!panel) { w.ces10DockHeight = null; return; }
      const dockHeight = panel.parentElement.offsetHeight, previousDockHeight = w.ces10DockHeight;
      w.ces10DockHeight = dockHeight;
      if (previousDockHeight === null || dockHeight <= previousDockHeight) return;
      const group = document.querySelector('[data-testid="candidate-draw-card"]');
      let list = group.parentElement;
      while (!['auto', 'scroll'].includes(getComputedStyle(list).overflowY)) list = list.parentElement;
      const lr = list.getBoundingClientRect(), gr = group.getBoundingClientRect();
      w.ces10Growth.push({previousDockHeight, dockHeight, listTop:lr.top, listBottom:lr.bottom, groupTop:gr.top, groupBottom:gr.bottom, scrollTop:list.scrollTop});
    });
    w.ces10Observer.observe(document.querySelector('.chatpane'), {subtree:true, childList:true, characterData:true});
  })()`)
}

test("CES-10d child detail commit keeps the selected group visible before ResizeObserver and compensates once", () => scenario({}, async page => {
  await ces10Load(page, [ces10Filler("ces10-m1", 40), ces10Filler("ces10-m2", 40), ces10Filler("ces10-m3", 40), ces10DrawMessage])
  await page.evaluate(() => (window as any).f.defer("candidate:candidate"))
  await ces10ObserveDockGrowth(page)
  try {
    await page.getByTestId("candidate-card-alpha").click()
    await page.getByText("正在读取候选状态…", { exact: true }).waitFor()
    const loading = await ces10Geometry(page)
    await page.evaluate(() => (window as any).f.release("candidate:candidate"))
    await page.getByTestId("cap-option-improve").waitFor()
    const growth = await page.evaluate(() => (window as any).ces10Growth) as (Ces10Geometry & {previousDockHeight:number;dockHeight:number})[]
    assert.ok(growth.length > 0, "the controlled detail response must produce a distinct growing child commit")
    ces10ExpectVisible(growth[0], "first child growth microtask before ResizeObserver")
    assert.ok(Math.abs(growth[0].scrollTop - loading.scrollTop - (growth[0].dockHeight - growth[0].previousDockHeight)) <= 1, "the child commit applies the original positive dock delta once")
    await frames(page)
    assert.ok(Math.abs((await ces10Geometry(page)).scrollTop - growth[0].scrollTop) <= 1, "the following ResizeObserver must not compensate the same growth again")
    await page.keyboard.press("Escape")
    await editor(page).waitFor()
    await page.getByTestId("candidate-card-alpha").click()
    await page.getByTestId("cap-option-improve").waitFor()
    const reopened = await ces10Geometry(page)
    ces10ExpectVisible(reopened, "cached panel reopening starts with a fresh dock baseline")
    await frames(page)
    assert.ok(Math.abs((await ces10Geometry(page)).scrollTop - reopened.scrollTop) <= 1, "a closed panel's old observer cannot replay a consumed delta")
  } finally { await page.evaluate(() => (window as any).ces10Observer?.disconnect()) }
}))

test("CES-10e asynchronous panel growth preserves the viewport after scrolling up to read history", () => scenario({}, async page => {
  await ces10Load(page, [ces10Filler("ces10-m1", 40), ces10Filler("ces10-m2", 40), ces10Filler("ces10-m3", 40), ces10DrawMessage])
  await page.evaluate(() => (window as any).f.defer("candidate:candidate"))
  await ces10ObserveDockGrowth(page)
  try {
    await page.getByTestId("candidate-card-alpha").click()
    await page.getByText("正在读取候选状态…", { exact: true }).waitFor()
    await page.evaluate(() => {
      const group = document.querySelector('[data-testid="candidate-draw-card"]')!
      let list = group.parentElement!
      while (!["auto", "scroll"].includes(getComputedStyle(list).overflowY)) list = list.parentElement!
      list.scrollTop -= 500
    })
    await frames(page)
    const reading = await ces10Geometry(page)
    await page.evaluate(() => (window as any).f.release("candidate:candidate"))
    await page.getByTestId("cap-option-improve").waitFor()
    const growth = await page.evaluate(() => (window as any).ces10Growth) as Ces10Geometry[]
    assert.ok(growth.length > 0, "detail response must grow the actual panel while reading history")
    assert.ok(Math.abs(growth[0].scrollTop - reading.scrollTop) <= 1, "child layout must preserve an upward reading position")
    await frames(page)
    assert.ok(Math.abs((await ces10Geometry(page)).scrollTop - reading.scrollTop) <= 1, "ResizeObserver must also preserve the upward reading position")
  } finally { await page.evaluate(() => (window as any).ces10Observer?.disconnect()) }
}))

// --- CES-11: 问答/选卡面板选项必须立即处理（panel-answer-queue 2026-10-16） ---
// 修复前：选卡操作面板「继续改进这张」等选项在待答问答下被 handleSendCardMessage
// 入队，queuePaused+pendingQuestion 双闸门锁死永不发送。修复后：先 skipQuestion
// 退出待答问答再立即 sendText，不入队。布点要求见
// docs/reviews/2026-10-16-panel-answer-queue-test-cases.md。
async function ces11Load(page: Page, messages: unknown[]) {
  await page.evaluate(msgs => {
    const f = (window as any).f
    f.response("fixture-scroll-conv", 200, { conversation: { id: "fixture-scroll-conv", novelId: "fixture-work", modelId: null, title: "合成会话" }, messages: msgs })
    f.request("fixture-scroll-conv")
  }, messages as any)
}
/** 带服务端 interaction 的待答问答布点；drawRedraw=true 时为同章选稿问答（触发槽位覆盖） */
function ces11Question(turnId: string, drawRedraw: boolean) {
  return {
    queuePaused: true,
    pendingQuestion: {
      markerStyle: "letters",
      questions: [{ question: "合成选稿问答：如何处理本章候选？", options: ["采用合成角度甲", "直接换一批"] }],
      interaction: { turnId, id: "ces11-ia", revision: 1, action: "answer" },
      ...(drawRedraw ? { drawRedraw: { drawId: "ces10-draw", chapterId: "chapter", chapterTitle: "合成章" } } : {}),
    },
  }
}
async function ces11Posts(page: Page) { return page.evaluate(() => (window as any).f.calls.filter((call: any) => call.method === "POST")) }
const ces11ChatDone = () => (window as any).f.calls.some((call: any) => call.path === "/api/chat" && call.method === "POST") && !(window as any).f.state().isGenerating

test("CES-11a pending draw question + card improve skips the question and sends immediately, never queued", () => scenario({}, async page => {
  await ces11Load(page, [ces10Filler("ces11-m1", 8), ces10DrawMessage])
  await page.getByTestId("candidate-card-alpha").waitFor()
  await page.evaluate(patch => { const f = (window as any).f; f.choose(); f.patch(patch) }, ces11Question("ces11-turn", true))
  await page.getByTestId("candidate-card-alpha").click()
  await page.getByTestId("cap-option-improve").waitFor(); await frames(page)
  assert.equal(await page.getByTestId("candidate-action-panel").isVisible(), true, "selected card takes over the composer slot")
  assert.equal(await page.getByTestId("ask-user-panel").count(), 0, "ask panel yields to the card panel but the question stays pending")
  await page.getByTestId("cap-option-improve").click()
  await frames(page)
  assert.equal(await page.evaluate(() => (window as any).f.state().queuedMessages.length), 0, "panel answer must never enter the queue")
  await page.waitForFunction(ces11ChatDone)
  const posts = await ces11Posts(page)
  const skip = posts.find((call: any) => call.path === "/api/chat/turns/ces11-turn/interaction")
  const chat = posts.find((call: any) => call.path === "/api/chat")
  assert.ok(skip, "the pending question must be skipped before executing")
  assert.ok(chat, "the improve message must be sent immediately")
  assert.ok(posts.indexOf(skip) < posts.indexOf(chat), "skip must happen before the send")
  assert.deepEqual(skip.body, { id: "ces11-ia", revision: 1, action: "skip" })
  assert.match(chat.body.message, /chapterId: chapter，candidateId: candidate/)
  assert.match(chat.body.message, /为基础改进，再抽 3 份候选/)
  assert.equal(chat.body.interaction, undefined, "a skipped question must not ride along as an answer interaction")
  const state = await page.evaluate(() => (window as any).f.state())
  assert.equal(state.pendingQuestion, null, "question panel closes")
  assert.equal(state.selection, null, "card action panel closes")
  await frames(page)
  assert.equal(await page.getByTestId("candidate-action-panel").count(), 0)
  assert.equal(await page.getByTestId("ask-user-panel").count(), 0)
  assert.equal(await page.getByText("排队消息等待确认", { exact: false }).count(), 0)
}))

test("CES-11b external panel message with an unrelated pending question also skips and sends immediately", () => scenario({}, async page => {
  await ces11Load(page, [])
  await page.evaluate(patch => { const f = (window as any).f; f.choose(); f.patch(patch) }, ces11Question("ces11-turn", false))
  await page.getByTestId("ask-user-panel").waitFor()
  const text = "以《合成章》候选稿 合成角度甲（chapterId: chapter，candidateId: candidate）为基础改进，再抽 3 份候选。我的意见：（无具体意见，按三个改进方向各自判断）"
  await page.evaluate(t => (window as any).f.external(t, "fixture-work"), text)
  await frames(page)
  assert.equal(await page.evaluate(() => (window as any).f.state().queuedMessages.length), 0, "panel-originated message must never enter the queue")
  await page.waitForFunction(ces11ChatDone)
  const posts = await ces11Posts(page)
  const skip = posts.find((call: any) => call.path === "/api/chat/turns/ces11-turn/interaction")
  const chat = posts.find((call: any) => call.path === "/api/chat")
  assert.ok(skip && chat, "skip then immediate send")
  assert.ok(posts.indexOf(skip) < posts.indexOf(chat), "skip must happen before the send")
  assert.equal(chat.body.message, text)
  assert.equal(chat.body.interaction, undefined)
  assert.equal(await page.evaluate(() => (window as any).f.state().pendingQuestion), null)
  await frames(page)
  assert.equal(await page.getByTestId("ask-user-panel").count(), 0)
}))

test("CES-11c AskUserPanel answers keep the direct answer channel with interaction attached, no skip", () => scenario({}, async page => {
  await page.evaluate(() => { const f = (window as any).f; f.choose(); f.patch({ pendingQuestion: { markerStyle: "letters", questions: [{ question: "合成待答问题", options: ["合成选择"] }], interaction: { turnId: "ces11-turn-c", id: "ces11-ia-c", revision: 1, action: "answer" } } }) })
  await page.getByTestId("ask-user-panel").waitFor()
  await page.getByTestId("ask-option-0-0").click()
  await page.waitForFunction(ces11ChatDone)
  const posts = await ces11Posts(page)
  const chat = posts.find((call: any) => call.path === "/api/chat")
  assert.ok(chat, "answer must be sent immediately")
  assert.deepEqual(chat.body.interaction, { turnId: "ces11-turn-c", id: "ces11-ia-c", revision: 1, action: "answer" })
  assert.match(chat.body.message, /^【回答问题】合成待答问题\n我的回答：合成选择$/)
  assert.equal(posts.some((call: any) => /\/interaction$/.test(call.path)), false, "answers must not skip the question")
  assert.equal(await page.evaluate(() => (window as any).f.state().queuedMessages.length), 0)
  assert.equal(await page.evaluate(() => (window as any).f.state().pendingQuestion), null)
}))

test("CES-11d card options clicked while generating still queue (approved §2.5 boundary)", () => scenario({}, async page => {
  await ces11Load(page, [ces10Filler("ces11-m1", 8), ces10DrawMessage])
  await page.getByTestId("candidate-card-alpha").waitFor()
  await page.evaluate(() => (window as any).f.choose())
  await page.getByTestId("candidate-card-alpha").click()
  await page.getByTestId("cap-option-improve").waitFor()
  await page.evaluate(() => (window as any).f.patch({ isGenerating: true }))
  await page.getByTestId("cap-option-improve").click(); await frames(page)
  const state = await page.evaluate(() => (window as any).f.state())
  assert.equal(state.queuedMessages.length, 1)
  assert.match(state.queuedMessages[0].text, /为基础改进，再抽 3 份候选/)
  assert.equal(await page.evaluate(() => (window as any).f.calls.some((call: any) => call.path === "/api/chat" && call.method === "POST")), false)
  assert.equal(await page.getByTestId("candidate-action-panel").isVisible(), true, "queued actions keep the source card selected")
}))

test("CES-11e a failed skip falls back to the queue with the question and intent preserved", () => scenario({}, async page => {
  await ces11Load(page, [ces10Filler("ces11-m1", 8), ces10DrawMessage])
  await page.getByTestId("candidate-card-alpha").waitFor()
  await page.evaluate(patch => { const f = (window as any).f; f.choose(); f.patch(patch) }, ces11Question("ces11-turn-fail", true))
  await page.getByTestId("candidate-card-alpha").click()
  await page.getByTestId("cap-option-improve").waitFor()
  await page.getByTestId("cap-option-improve").click(); await frames(page)
  await page.waitForFunction(() => (window as any).f.calls.some((call: any) => call.path === "/api/chat/turns/ces11-turn-fail/interaction" && call.method === "POST"))
  await frames(page)
  assert.equal(await page.evaluate(() => (window as any).f.calls.some((call: any) => call.path === "/api/chat" && call.method === "POST")), false, "a failed skip must not send")
  const state = await page.evaluate(() => (window as any).f.state())
  assert.equal(state.queuedMessages.length, 1, "the intent falls back to the queue, never silently dropped")
  assert.match(state.queuedMessages[0].text, /为基础改进，再抽 3 份候选/)
  assert.ok(state.pendingQuestion, "the unanswered question survives a failed skip")
  assert.equal(await page.getByTestId("candidate-action-panel").isVisible(), true)
}))

// --- CES-12: 失效 interaction 不得复活问答面板（interaction-stale-terminal 2026-10-21） ---
// 修复前：提交答案撞 409 INTERACTION_STALE 后，错误卡显示「生成中断」且旧问答面板恢复；
// 修复后：面板关闭、已填答案回填输入框、错误卡改称「提问已失效」且不提供「作为新消息重发」。
test("CES-12 stale answer closes the panel, keeps the filled answer and labels the card as expired", () => scenario({}, async page => {
  await page.evaluate(() => {
    const f = (window as any).f
    f.choose()
    f.patch({ pendingQuestion: {
      markerStyle: "letters",
      questions: [{ question: "合成待答问题", options: ["合成选择"] }],
      interaction: { turnId: "ces12-turn", id: "ces12-ia", revision: 1, action: "answer" },
    } })
    f.chatReject("INTERACTION_STALE", "原提案或调整范围已变化，请重新核对")
  })
  await page.getByTestId("ask-user-panel").waitFor()
  await page.getByTestId("ask-option-0-0").click()
  await page.waitForFunction(ces11ChatDone)
  await frames(page)
  const state = await page.evaluate(() => (window as any).f.state())
  assert.equal(state.pendingQuestion, null, "the stale question panel must close")
  assert.equal(state.isGenerating, false)
  const expected = "【回答问题】合成待答问题\n我的回答：合成选择"
  assert.equal(state.draft, expected, "the filled answer must be backfilled")
  assert.equal(await page.evaluate(() => (window as any).f.source()), expected, "the composer must show the backfilled answer")
  assert.equal(await page.getByTestId("ask-user-panel").count(), 0)
  assert.equal(await page.getByText("提问已失效", { exact: true }).count(), 1, "the card must not claim generation was interrupted")
  assert.equal(await page.getByText("生成中断", { exact: true }).count(), 0)
  assert.equal(await page.getByRole("button", { name: "作为新消息重发" }).count(), 0)
}))

test("CES-13 novel picker exposes 打开作品 / 导入作品 that reuse the native file.open command and the sidebar import entry", () => scenario({}, async page => {
  const picker = page.getByRole("button", { name: "选择要创作的小说" })
  const state = await page.evaluate(() => (window as any).f.state())
  await picker.click()
  await page.getByRole("menuitem", { name: "导入作品" }).waitFor()
  const items = await page.getByRole("menuitem").allInnerTexts()
  assert.deepEqual(items.map(text => text.trim()).slice(0, 3), ["新建作品", "打开作品", "导入作品"])
  await page.getByRole("menuitem", { name: "打开作品" }).click()
  await picker.click()
  await page.getByRole("menuitem", { name: "导入作品" }).click()
  await page.waitForFunction(() => (window as any).f.bridgeCalls.length >= 2)
  assert.deepEqual(await page.evaluate(() => (window as any).f.bridgeCalls), [["command", "file.open"], ["novelImport", "choose"]])
  const after = await page.evaluate(() => (window as any).f.state())
  assert.equal(after.draftNovelId, state.draftNovelId, "opening/importing must not change the conversation association")
  assert.equal(after.pendingNovelTitle, state.pendingNovelTitle)
  assert.deepEqual(await posts(page), [])
}))
