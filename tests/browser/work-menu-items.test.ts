import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'
import { chromium, type Browser, type Page } from 'playwright-core'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwindcss from '@tailwindcss/postcss'

// docs/609 WM-*: the real SidebarTree work menu with the real ScenesPanel and ForeshadowPanel
// mounted in ContentTabs. Other tab bodies render nothing. In-memory API, not a real target.
const cssPath = resolve('src/app/globals.css')
const styles = postcss([tailwindcss()]).process(readFileSync(cssPath, 'utf8'), { from: cssPath }).then(r => r.css + '\n' + readFileSync('src/app/desktop.css', 'utf8'))

const bundle = build({ stdin: { loader: 'tsx', resolveDir: process.cwd(), contents: `
import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {SidebarTree} from './src/components/layout/SidebarTree';
import {ContentTabs} from './src/components/layout/ContentTabs';
import {useTabsStore} from './src/stores/tabs';import {useSceneUiStore,registerSceneLeaveGuard} from './src/stores/scene-ui';
import {Toaster} from './src/components/ui/sonner';import {useChatStore} from './src/stores/chat';import {useDesktopStore} from './src/stores/desktop';
window.mountMenuFixture=({cacheForeshadows=true}={})=>{
 const now='2026-01-01T00:00:00.000Z';
 const work=(id,title)=>({id,title,coverUrl:null,status:'DRAFT',currentStage:'PLANNING',createdAt:now,updatedAt:now});
 const novels=[work('work-a','可用作品甲'),work('work-b','可用作品乙')];
 const foreshadow=(id,novelId,title)=>({id,novelId,title,content:'',note:'',expectation:'',plannedChapter:null,status:'PLANNED',touches:[],mentionCount:0,createdAt:now,updatedAt:now});
 const lists={};for(const n of novels)lists[n.id]={characters:[],items:[],worlds:[],scenes:[],foreshadows:[foreshadow('f-1',n.id,'未命名伏笔 1')]};
 const requests=[],fails=new Map(),holds=new Map(),rejects=new Set();let reads=0,serial=0;
 const match=(map,path,method)=>[...map.keys()].find(key=>(method+' '+path).includes(key));
 window.fetch=async(input,init)=>{const path=String(input),method=init?.method??'GET',body=init?.body?JSON.parse(String(init.body)):undefined;requests.push({path,method,body});
  const rejectKey=[...rejects].find(key=>(method+' '+path).includes(key));if(rejectKey)throw Error('隔离网络失败');
  const holdKey=match(holds,path,method);if(holdKey)await holds.get(holdKey).promise;
  const failKey=match(fails,path,method);if(failKey){const f=fails.get(failKey);return Response.json({error:f.error},{status:f.status})}
  if(path==='/api/novels'){reads++;return Response.json({novels,unavailableWorks:[]})}
  if(path.includes('/conversations'))return Response.json({conversations:[]});
  const m=path.match(/^\\/api\\/novels\\/([^/?]+)(?:\\/([^/?]+))?/);const id=m?.[1],kind=m?.[2],list=lists[id];
  if(list&&method==='POST'){const n=++serial;
   if(kind==='characters'){const record={id:'character-'+n,novelId:id,name:body.name,roleType:body.roleType,bio:'',personality:'',avatarUrl:null};list.characters.push(record);return Response.json({character:record},{status:201})}
   if(kind==='items'){const record={id:'item-'+n,novelId:id,name:body.name,description:'',iconUrl:null,aliases:[],tags:[],levels:[]};list.items.push(record);return Response.json({item:record},{status:201})}
   if(kind==='worlds'){const record={id:'world-'+n,novelId:id,name:body.name,parentId:body.parentId,description:''};list.worlds.push(record);return Response.json({world:record},{status:201})}
   if(kind==='foreshadows'){const record=foreshadow('foreshadow-'+n,id,body.title);list.foreshadows.push(record);return Response.json({foreshadow:record},{status:201})}}
  if(list&&kind==='foreshadows')return Response.json({foreshadows:list.foreshadows});
  if(list&&kind==='worlds')return Response.json({worlds:list.worlds});
  if(list&&kind==='scenes')return Response.json({scenes:list.scenes});
  if(list&&kind==='characters')return Response.json({characters:list.characters});
  if(list&&kind==='items')return Response.json({items:list.items});
  if(list&&kind==='scenarios')return Response.json({scenarios:[]});
  if(list&&kind==='outline')return Response.json({volumes:[]});
  if(list&&!kind)return Response.json({novel:{...novels.find(n=>n.id===id),volumes:[],characters:[],settings:[],theme:null}});
  return Response.json({})};
 window.desktop={showTextContextMenu:async request=>({requestId:request.requestId,command:null}),cancelTextContextMenu:async()=>{},command:async()=>{},onEvent:()=>()=>{},readClipboardText:async()=>'',writeClipboardText:async()=>{}};
 useDesktopStore.setState({bootstrap:{platform:'darwin',dataRoot:'root-a',settings:{appearance:{theme:'paper',uiFont:'system',uiFontSize:14,zoom:1,bodyFont:'serif',bodyFontSize:16,lineHeight:1.8,lineNumbers:false,wordWrap:false},shortcuts:{win32:{},darwin:{}}}}});
 useChatStore.setState({accountId:'isolated-account',draftNovelId:null,conversationId:null,newConversationRequested:false});
 useSceneUiStore.setState({prefs:{},drafts:{},action:null});
 useTabsStore.setState({tabs:[],activeTabId:null,panelFocus:null});
 const query=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity,refetchOnWindowFocus:false},mutations:{retry:false}}});
 for(const n of novels){query.setQueryData(['scenes',n.id],{scenes:[]});query.setQueryData(['scene-factions',n.id],{factions:[]});query.setQueryData(['outline',n.id],{volumes:[]});if(cacheForeshadows)query.setQueryData(['foreshadows',n.id],{foreshadows:[...lists[n.id].foreshadows]})}
 let gate=null,guardCalls=0,unguard=()=>{};
 const root=createRoot(document.getElementById('app'));
 flushSync(()=>root.render(<QueryClientProvider client={query}><div style={{display:'flex',height:'100vh'}}><div style={{width:280,flexShrink:0}}><SidebarTree user={{id:'local-author',name:'隔离作者',email:''}}/></div><div style={{flex:1,minWidth:0,height:'100%'}}><ContentTabs fullscreen={false} onToggleFullscreen={()=>{}} onToggleContent={()=>{}}/></div></div><Toaster/></QueryClientProvider>));
 window.menuFixture={requests:()=>requests,reads:()=>reads,
  posts:kind=>requests.filter(r=>r.method==='POST'&&r.path.endsWith('/'+kind)),
  tabs:()=>useTabsStore.getState().tabs.map(t=>t.id),activeTabId:()=>useTabsStore.getState().activeTabId,
  sceneAction:()=>useSceneUiStore.getState().action,scenePref:novelId=>useSceneUiStore.getState().prefs['isolated-account:'+novelId+':workspace']??null,setScenePref:(novelId,pref)=>useSceneUiStore.getState().setPref('isolated-account:'+novelId+':workspace',pref),panelFocus:()=>useTabsStore.getState().panelFocus,
  open:tab=>useTabsStore.getState().openTab(tab),
  fail:(key,status,error)=>fails.set(key,{status,error}),clearFail:key=>fails.delete(key),
  hold:key=>holds.set(key,Promise.withResolvers()),release:key=>{holds.get(key)?.resolve();holds.delete(key)},
  reject:key=>rejects.add(key),
  guard:(tabId,mode)=>{unguard();gate=mode==='hold'?Promise.withResolvers():null;const hold=gate;unguard=registerSceneLeaveGuard(tabId,()=>{guardCalls++;return mode==='reject'?Promise.reject(Error('隔离场景草稿尚未保存')):hold.promise})},unguard:()=>{unguard();unguard=()=>{}},
  guardCalls:()=>guardCalls,releaseGuard:()=>gate?.resolve(),
  unmount:()=>root.unmount()};
};` }, bundle: true, platform: 'browser', format: 'iife', write: false, tsconfig: 'tsconfig.json', plugins: [{ name: 'menu-tab-bodies', setup(api) {
  api.onResolve({ filter: /^@\/components\/content\/(registry|StagedSaveSurface|StoryWorkflowPanel)$/ }, args => ({ path: args.path, namespace: 'menu-fixture' }))
  api.onLoad({ filter: /registry$/, namespace: 'menu-fixture' }, () => ({ loader: 'tsx', resolveDir: process.cwd(), contents: `import React from 'react';import {ScenesPanel} from './src/components/content/ScenesPanel';import {ForeshadowPanel} from './src/components/content/ForeshadowPanel';
export const renderTabContent=tab=>tab.type==='scenes'?<ScenesPanel novelId={tab.novelId}/>:tab.type==='foreshadow'?<div style={{height:600}} data-testid='foreshadow-body'><ForeshadowPanel novelId={tab.novelId}/></div>:null;` }))
  api.onLoad({ filter: /(StagedSaveSurface|StoryWorkflowPanel)$/, namespace: 'menu-fixture' }, () => ({ loader: 'tsx', contents: `export const StagedSaveSurface=({children})=>children;export const StagedInterceptionBootstrap=()=>null;export const StorySources=()=>null;export const StoryActivityBanner=()=>null;export const StoryLivePreview=()=>null;` }))
} }], loader: { '.css': 'empty' }, logOverride: { 'empty-import-meta': 'silent' } }).then(result => result.outputFiles![0].text)

let browser: Browser
test.before(async () => { browser = await chromium.launch({ headless: true, executablePath: process.env.SHAKEINK_TEST_CHROMIUM }) })
test.after(async () => { await browser?.close() })
async function scenario(options: Record<string, unknown>, run: (page: Page) => Promise<void>) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } }), errors: string[] = []
  page.setDefaultTimeout(5000)
  page.on('pageerror', error => errors.push(error.message))
  try {
    await page.route('**/*', route => route.abort()); await page.setContent('<div id="app"></div>')
    await page.evaluate(() => { if (!crypto.randomUUID) (crypto as any).randomUUID = () => '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c => (Number(c) ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> Number(c) / 4).toString(16)) })
    await page.addStyleTag({ content: await styles }); await page.addScriptTag({ content: await bundle })
    await page.evaluate(options => (window as any).mountMenuFixture(options), options)
    await row(page, '可用作品甲').waitFor()
    await run(page); assert.deepEqual(errors, [])
  } finally { await page.close() }
}
const fx = (page: Page) => ({
  get: <T>(fn: string, ...args: unknown[]) => page.evaluate(([fn, args]) => (window as any).menuFixture[fn as string](...(args as unknown[])), [fn, args] as const) as Promise<T>,
})
const row = (page: Page, title: string) => page.locator('.sidebar-navigation .tree-row', { hasText: title }).first()
const menu = (page: Page) => page.getByRole('menu')
const item = (page: Page, name: string) => menu(page).getByRole('menuitem', { name, exact: true })
async function openDots(page: Page, title = '可用作品甲') { const r = row(page, title); await r.hover(); await r.getByRole('button', { name: '小说操作', exact: true }).click(); await menu(page).waitFor() }
async function openContext(page: Page, title = '可用作品甲') { await row(page, title).click({ button: 'right' }); await menu(page).waitFor() }
async function choose(page: Page, name: string, title = '可用作品甲') { await openDots(page, title); await item(page, name).click(); await menu(page).waitFor({ state: 'detached' }) }
async function until(check: () => Promise<boolean>, label: string) { const end = Date.now() + 5000; while (!(await check())) { if (Date.now() > end) throw Error('timed out: ' + label); await new Promise(r => setTimeout(r, 20)) } }
const toast = (page: Page, text: string) => page.locator('[data-sonner-toast]', { hasText: text }).first()
const rootDialog = (page: Page) => page.getByRole('dialog', { name: '创建根场景', exact: true })
const sceneTab = { id: 'scene:s1', type: 'scene', novelId: 'work-a', refId: 's1', title: '隔离场景' }
const otherTab = { id: 'theme:work-b', type: 'theme', novelId: 'work-b', title: '主题' }

test('WM-01 编辑 opens and re-activates the single 主题 tab', () => scenario({}, async page => {
  const f = fx(page)
  await choose(page, '编辑'); assert.equal(await f.get('activeTabId'), 'theme:work-a')
  await page.getByRole('tab', { name: /主题/ }).first().waitFor()
  await choose(page, '编辑'); assert.deepEqual((await f.get<string[]>('tabs')).filter(id => id === 'theme:work-a'), ['theme:work-a'])
}))

test('WM-02/03 创建角色 and 创建物品 post the panel bodies, open the new tab and toast', () => scenario({}, async page => {
  const f = fx(page), before = await f.get<number>('reads')
  await choose(page, '创建角色')
  await until(async () => (await f.get('activeTabId')) === 'character:character-1', 'character tab')
  assert.deepEqual((await f.get<any[]>('posts', 'characters')).map(r => [r.path, r.body]), [['/api/novels/work-a/characters', { name: '新角色', roleType: 'PROTAGONIST' }]])
  await toast(page, '已创建角色「新角色」，点击编辑资料').waitFor()
  await until(async () => (await f.get<number>('reads')) > before, 'novels refetched')
  await choose(page, '创建物品')
  await until(async () => (await f.get('activeTabId')) === 'item:item-2', 'item tab')
  assert.deepEqual((await f.get<any[]>('posts', 'items')).map(r => [r.path, r.body]), [['/api/novels/work-a/items', { name: '新物品' }]])
  await toast(page, '已创建物品「新物品」，点击编辑资料').waitFor()
}))

test('WM-04 every create item shows the server message and opens nothing on failure', () => scenario({}, async page => {
  const f = fx(page)
  for (const [kind, name] of [['characters', '创建角色'], ['items', '创建物品'], ['foreshadows', '创建伏笔']] as const) {
    await f.get('fail', `POST /api/novels/work-a/${kind}`, 500, `隔离服务端拒绝-${kind}`)
    const tabs = await f.get('tabs'), active = await f.get('activeTabId')
    await choose(page, name); await toast(page, `隔离服务端拒绝-${kind}`).waitFor()
    assert.deepEqual(await f.get('tabs'), tabs); assert.equal(await f.get('activeTabId'), active)
  }
  await f.get('fail', 'POST /api/novels/work-a/worlds', 500, '隔离服务端拒绝-worlds')
  await choose(page, '创建世界'); const dialog = page.getByRole('dialog', { name: '新建世界', exact: true })
  await dialog.getByRole('textbox').fill('隔离世界'); await dialog.getByRole('button', { name: '创建', exact: true }).click()
  await toast(page, '隔离服务端拒绝-worlds').waitFor(); assert.equal(await f.get('activeTabId'), null)
}))

test('WM-04b a failed foreshadow list read shows its message and posts nothing', () => scenario({ cacheForeshadows: false }, async page => {
  const f = fx(page)
  await f.get('fail', 'GET /api/novels/work-a/foreshadows', 500, '隔离伏笔列表失败')
  await choose(page, '创建伏笔'); await toast(page, '隔离伏笔列表失败').waitFor()
  assert.deepEqual(await f.get('posts', 'foreshadows'), [])
}))

test('WM-04c a thrown fetch shows the same raw message as the panel and opens nothing', () => scenario({}, async page => {
  const f = fx(page)
  await f.get('reject', 'POST /api/novels/work-a/characters')
  await choose(page, '创建角色'); await toast(page, '隔离网络失败').waitFor(); assert.deepEqual(await f.get('tabs'), [])
}))

test('WM-05 a pending create disables that item for its work only, and posts once', () => scenario({}, async page => {
  const f = fx(page)
  for (const [kind, name] of [['characters', '创建角色'], ['items', '创建物品'], ['foreshadows', '创建伏笔']] as const) {
    const key = `POST /api/novels/work-a/${kind}`; await f.get('hold', key)
    await choose(page, name); await until(async () => (await f.get<any[]>('posts', kind)).length === 1, kind + ' posted')
    await openDots(page); assert.equal(await item(page, name).isDisabled(), true); await page.keyboard.press('Escape'); await menu(page).waitFor({ state: 'detached' })
    await openDots(page, '可用作品乙'); assert.equal(await item(page, name).isDisabled(), false); await page.keyboard.press('Escape'); await menu(page).waitFor({ state: 'detached' })
    await f.get('release', key)
    await until(async () => { await openDots(page); const ok = !(await item(page, name).isDisabled()); await page.keyboard.press('Escape'); await menu(page).waitFor({ state: 'detached' }); return ok }, name + ' re-enabled')
    assert.equal((await f.get<any[]>('posts', kind)).length, 1)
  }
  const key = 'POST /api/novels/work-a/worlds'; await f.get('hold', key)
  await choose(page, '创建世界'); const dialog = page.getByRole('dialog', { name: '新建世界', exact: true })
  await dialog.getByRole('textbox').fill('隔离世界'); await dialog.getByRole('button', { name: '创建', exact: true }).click()
  await until(async () => (await f.get<any[]>('posts', 'worlds')).length === 1, 'world posted')
  await until(() => dialog.getByRole('button', { name: '创建', exact: true }).isDisabled(), 'world submit disabled while pending')
  await f.get('release', key); await dialog.waitFor({ state: 'detached' }); assert.equal((await f.get<any[]>('posts', 'worlds')).length, 1)
}))

test('WM-05b two works creating at once each keep their own item disabled and post once', () => scenario({}, async page => {
  const f = fx(page)
  for (const [kind, name] of [['characters', '创建角色'], ['items', '创建物品'], ['foreshadows', '创建伏笔']] as const) {
    const a = `POST /api/novels/work-a/${kind}`, b = `POST /api/novels/work-b/${kind}`
    await f.get('hold', a); await f.get('hold', b)
    await choose(page, name); await choose(page, name, '可用作品乙')
    await until(async () => (await f.get<any[]>('posts', kind)).length === 2, kind + ' both posted')
    const disabled = async (title: string) => { await openDots(page, title); const value = await item(page, name).isDisabled(); await page.keyboard.press('Escape'); await menu(page).waitFor({ state: 'detached' }); return value }
    assert.equal(await disabled('可用作品甲'), true); assert.equal(await disabled('可用作品乙'), true)
    await f.get('release', a); await until(async () => !(await disabled('可用作品甲')), 'work-a re-enabled')
    assert.equal(await disabled('可用作品乙'), true)
    await f.get('release', b); await until(async () => !(await disabled('可用作品乙')), 'work-b re-enabled')
    const posts = await f.get<any[]>('posts', kind)
    assert.deepEqual(posts.map(r => r.path).sort(), [`/api/novels/work-a/${kind}`, `/api/novels/work-b/${kind}`])
  }
}))

async function expectRootSceneDialog(page: Page) {
  const f = fx(page)
  await rootDialog(page).waitFor(); assert.ok((await rootDialog(page).innerText()).includes('根场景可包含任意层级的子场景'))
  assert.equal(await f.get('activeTabId'), 'scenes:work-a'); assert.equal(await f.get('sceneAction'), null)
  await page.keyboard.press('Escape'); await rootDialog(page).waitFor({ state: 'detached' })
}
async function expectNoLeftoverSceneRequest(page: Page) {
  const f = fx(page)
  assert.equal(await f.get('sceneAction'), null)
  await f.get('open', { id: 'scenes:work-a', type: 'scenes', novelId: 'work-a', title: '场景' })
  await until(async () => (await f.get('activeTabId')) === 'scenes:work-a', 'scenes opened manually')
  await page.getByRole('heading', { name: '场景', exact: true }).waitFor(); await page.waitForTimeout(150)
  assert.equal(await rootDialog(page).count(), 0)
}

test('WM-06a/b/c 创建场景 opens the root-scene dialog whether the 场景 tab is closed, open in the background or active', () => scenario({}, async page => {
  const f = fx(page)
  await choose(page, '创建场景'); await expectRootSceneDialog(page)
  await f.get('open', otherTab); await until(async () => (await f.get('activeTabId')) === otherTab.id, 'other tab')
  await choose(page, '创建场景'); await expectRootSceneDialog(page)
  await choose(page, '创建场景'); await expectRootSceneDialog(page)
}))

test('WM-06d a failing scene leave guard keeps the tab, shows its error and leaves no request', () => scenario({}, async page => {
  const f = fx(page)
  await f.get('open', sceneTab); await until(async () => (await f.get('activeTabId')) === sceneTab.id, 'scene tab')
  await f.get('guard', sceneTab.id, 'reject')
  await f.get('setScenePref', 'work-a', { scope: 's1', search: '雨' })
  await choose(page, '创建场景'); await toast(page, '隔离场景草稿尚未保存').waitFor()
  assert.equal(await f.get('activeTabId'), sceneTab.id); assert.equal(await rootDialog(page).count(), 0)
  assert.deepEqual(await f.get('scenePref', 'work-a'), { scope: 's1', search: '雨' }, 'a refused navigation leaves the scene filters alone')
  await f.get('setScenePref', 'work-a', { scope: null, search: '' })
  await f.get('unguard')
  await expectNoLeftoverSceneRequest(page)
}))

test('WM-06e a pending guard that is released then opens the root-scene dialog', () => scenario({}, async page => {
  const f = fx(page)
  await f.get('open', sceneTab); await until(async () => (await f.get('activeTabId')) === sceneTab.id, 'scene tab')
  await f.get('guard', sceneTab.id, 'hold')
  await choose(page, '创建场景'); await until(async () => (await f.get<number>('guardCalls')) === 1, 'guard called')
  await page.waitForTimeout(100); assert.equal(await rootDialog(page).count(), 0); assert.equal(await f.get('activeTabId'), sceneTab.id)
  await f.get('releaseGuard'); await expectRootSceneDialog(page)
}))

test('WM-06f leaving to another tab while the guard is pending cancels the scene request', () => scenario({}, async page => {
  const f = fx(page)
  await f.get('open', otherTab); await f.get('open', sceneTab); await until(async () => (await f.get('activeTabId')) === sceneTab.id, 'scene tab')
  await f.get('guard', sceneTab.id, 'hold')
  await choose(page, '创建场景'); await until(async () => (await f.get<number>('guardCalls')) === 1, 'menu guard')
  await page.getByRole('tab', { name: /主题/ }).first().click(); await until(async () => (await f.get<number>('guardCalls')) === 2, 'tab guard')
  await f.get('releaseGuard'); await until(async () => (await f.get('activeTabId')) === otherTab.id, 'user tab active')
  await page.waitForTimeout(100); assert.equal(await rootDialog(page).count(), 0)
  await f.get('unguard')
  await expectNoLeftoverSceneRequest(page)
}))

test('WM-07a/b 创建情景 opens the create dialog and returns focus to the work row from … and right-click', () => scenario({}, async page => {
  for (const open of [openDots, openContext]) {
    await open(page); await item(page, '创建情景').click()
    const dialog = page.getByRole('dialog', { name: '新建情景试验场', exact: true }); await dialog.waitFor()
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' })
    await until(async () => page.evaluate(() => document.activeElement === document.querySelector('[data-work-row="work-a"] .tree-row')), 'focus on the work row itself')
  }
}))

test('WM-08 创建世界 asks for a name, posts a top-level world and opens it', () => scenario({}, async page => {
  const f = fx(page)
  await choose(page, '创建世界'); const dialog = page.getByRole('dialog', { name: '新建世界', exact: true })
  await dialog.getByRole('textbox').fill('隔离世界'); await dialog.getByRole('button', { name: '创建', exact: true }).click()
  await until(async () => String(await f.get('activeTabId')).startsWith('world:world-'), 'world tab')
  assert.deepEqual((await f.get<any[]>('posts', 'worlds')).map(r => r.body), [{ name: '隔离世界', parentId: null }])
}))

const foreshadowRow = (page: Page, title: string) => page.getByTestId('foreshadow-body').getByRole('button', { name: new RegExp(`^${title}`) })
async function selectedForeshadow(page: Page) { return page.getByTestId('foreshadow-body').locator('button.bg-selected-surface').innerText() }

test('WM-09a 创建伏笔 takes the next free name, selects the new item and toasts', () => scenario({}, async page => {
  const f = fx(page)
  await choose(page, '创建伏笔')
  await until(async () => (await f.get('activeTabId')) === 'foreshadow:work-a', 'foreshadow tab')
  await foreshadowRow(page, '未命名伏笔 2').waitFor(); await until(async () => (await selectedForeshadow(page)).includes('未命名伏笔 2'), 'new item selected')
  assert.deepEqual((await f.get<any[]>('posts', 'foreshadows')).map(r => r.body), [{ title: '未命名伏笔 2' }])
  await toast(page, '已创建伏笔「未命名伏笔 2」').waitFor(); assert.equal(await f.get('panelFocus'), null)
}))

test('WM-09b with the 伏笔 tab open on another item, the new item becomes selected', () => scenario({}, async page => {
  const f = fx(page)
  await f.get('open', { id: 'foreshadow:work-a', type: 'foreshadow', novelId: 'work-a', title: '伏笔' })
  await foreshadowRow(page, '未命名伏笔 1').click(); await until(async () => (await selectedForeshadow(page)).includes('未命名伏笔 1'), 'first selected')
  await choose(page, '创建伏笔'); await until(async () => (await selectedForeshadow(page)).includes('未命名伏笔 2'), 'new item selected')
}))

async function postedAfterReads(page: Page) {
  const f = fx(page)
  await choose(page, '创建伏笔'); await until(async () => (await f.get<any[]>('posts', 'foreshadows')).length === 1, 'posted')
  const reqs = await f.get<any[]>('requests'), post = reqs.findIndex(r => r.method === 'POST' && r.path.endsWith('/foreshadows'))
  return { reads: reqs.slice(0, post).filter(r => r.method === 'GET' && r.path === '/api/novels/work-a/foreshadows').length, body: reqs[post].body }
}
test('WM-09c a cached foreshadow list is used without a GET', () => scenario({}, async page => {
  assert.deepEqual(await postedAfterReads(page), { reads: 0, body: { title: '未命名伏笔 2' } })
}))
test('WM-09d an uncached list is read once before posting and names from it', () => scenario({ cacheForeshadows: false }, async page => {
  assert.deepEqual(await postedAfterReads(page), { reads: 1, body: { title: '未命名伏笔 2' } })
}))

async function expectFirstForeshadowSelected(page: Page) {
  const f = fx(page)
  assert.equal(await f.get('panelFocus'), null)
  await f.get('open', { id: 'foreshadow:work-a', type: 'foreshadow', novelId: 'work-a', title: '伏笔' })
  await foreshadowRow(page, '未命名伏笔 2').waitFor(); await page.waitForTimeout(100)
  assert.ok((await selectedForeshadow(page)).includes('未命名伏笔 1'))
}

test('WM-10 a failing guard: the foreshadow is created and announced but not opened or focused', () => scenario({}, async page => {
  const f = fx(page)
  await f.get('open', sceneTab); await until(async () => (await f.get('activeTabId')) === sceneTab.id, 'scene tab')
  await f.get('guard', sceneTab.id, 'reject')
  await choose(page, '创建伏笔'); await toast(page, '已创建伏笔「未命名伏笔 2」').waitFor(); await toast(page, '隔离场景草稿尚未保存').waitFor()
  assert.equal((await f.get<any[]>('posts', 'foreshadows')).length, 1); assert.equal(await f.get('activeTabId'), sceneTab.id)
  await f.get('unguard')
  await expectFirstForeshadowSelected(page)
}))

test('WM-10b a pre-empted pending guard: created and announced, no error, nothing opened or focused', () => scenario({}, async page => {
  const f = fx(page)
  await f.get('open', otherTab); await f.get('open', sceneTab); await until(async () => (await f.get('activeTabId')) === sceneTab.id, 'scene tab')
  await f.get('guard', sceneTab.id, 'hold')
  await choose(page, '创建伏笔'); await until(async () => (await f.get<number>('guardCalls')) === 1, 'menu guard')
  await page.getByRole('tab', { name: /主题/ }).first().click(); await until(async () => (await f.get<number>('guardCalls')) === 2, 'tab guard')
  await f.get('releaseGuard'); await until(async () => (await f.get('activeTabId')) === otherTab.id, 'user tab')
  await toast(page, '已创建伏笔「未命名伏笔 2」').waitFor(); assert.equal(await toast(page, '隔离场景草稿尚未保存').count(), 0)
  assert.equal((await f.get<any[]>('posts', 'foreshadows')).length, 1)
  await f.get('unguard')
  await expectFirstForeshadowSelected(page)
}))

test('WM-11 the panel + button still names via nextForeshadowTitle and shows no toast', () => scenario({}, async page => {
  const f = fx(page)
  await f.get('open', { id: 'foreshadow:work-a', type: 'foreshadow', novelId: 'work-a', title: '伏笔' })
  await page.getByTestId('foreshadow-body').getByRole('button', { name: '新建伏笔', exact: true }).click()
  await until(async () => (await f.get<any[]>('posts', 'foreshadows')).length === 1, 'posted')
  assert.deepEqual((await f.get<any[]>('posts', 'foreshadows'))[0].body, { title: '未命名伏笔 2' })
  await page.waitForTimeout(150); assert.equal(await toast(page, '已创建伏笔').count(), 0)
}))

test('WM-12 both export submenus list the four formats', () => scenario({}, async page => {
  for (const name of ['导出大纲', '导出正文']) {
    await openDots(page); await item(page, name).hover()
    const sub = page.getByRole('menu').last(); await sub.getByRole('menuitem', { name: 'PDF (.pdf)', exact: true }).waitFor()
    assert.deepEqual((await sub.getByRole('menuitem').allInnerTexts()).map(t => t.trim()), ['TXT 文本 (.txt)', 'Markdown (.md)', 'Word (.docx)', 'PDF (.pdf)'])
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await until(async () => (await menu(page).count()) === 0, 'menus closed')
  }
}))
