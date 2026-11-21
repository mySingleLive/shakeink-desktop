import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'
import { chromium, type Browser, type Page } from 'playwright-core'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwindcss from '@tailwindcss/postcss'

// Real application styles: modal stacking, row height and fault colors depend on them.
const cssPath = resolve('src/app/globals.css')
const styles = postcss([tailwindcss()]).process(readFileSync(cssPath, 'utf8'), { from: cssPath }).then(r => r.css + '\n' + readFileSync('src/app/desktop.css', 'utf8'))

const bundle = build({ stdin: { loader: 'tsx', resolveDir: process.cwd(), contents: `
import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {SidebarTree} from './src/components/layout/SidebarTree';
import {ContentTabs} from './src/components/layout/ContentTabs';
import {useTabsStore} from './src/stores/tabs';
import {appendCreatedNovel} from './src/lib/novel-list';import {Toaster} from './src/components/ui/sonner';import {useChatStore} from './src/stores/chat';import {useDesktopStore} from './src/stores/desktop';import {DesktopCommandController} from './src/components/desktop/DesktopCommandController';
window.mountWorksFixture=({healthy=false,reason='stale-lease',bridge=true,empty=false,globalError=false,extra=[],controller=false,conversationError=false}={})=>{
 const workId='b3bd663e-0b87-480c-b6ad-6eaa1488d6cb';
 const summary={id:'healthy',title:'可用作品',coverUrl:null,status:'DRAFT',currentStage:'PLANNING',createdAt:'2026-01-01',updatedAt:'2026-01-01'};
 let body={novels:healthy?[summary]:[],unavailableWorks:empty?[]:[{workId,novelId:'unavailable',title:'待恢复作品',reason},...extra]};
 const calls=[],repairs=[],errors=[],requests=[],textMenus=[];let reads=0,removeReply={status:200,body:null},removeGate=null;
 window.fetch=async (input,init)=>{const path=String(input),method=init?.method??'GET';requests.push({path,method});if(path==='/api/novels'){reads++;if(globalError)throw Error('private-native-path-key');return Response.json(body)}
 if(path.startsWith('/api/works/')&&method==='DELETE'){if(removeGate)await removeGate.promise;const id=path.slice('/api/works/'.length),row=body.unavailableWorks.find(w=>w.workId===id);if(removeReply.reject)throw Error('private-native-path-key');if(removeReply.raw)return new Response(removeReply.raw,{status:removeReply.status});if(removeReply.status===200&&row)body={...body,unavailableWorks:body.unavailableWorks.filter(w=>w.workId!==id)};return Response.json(removeReply.body??(removeReply.status===200?{ok:true,workId:id,novelId:row?.novelId}:{error:'x'}),{status:removeReply.status})}
 if(path.includes('/conversations')){if(conversationError)throw Error("Error invoking remote method 'desktop:request': Error: ENOENT: no such file or directory, stat '/private/var/folders/private-native-path-key/w-1'");return Response.json({conversations:[]})}
 if(path.includes('/worlds'))return Response.json({worlds:[]});
 return Response.json({novel:{...summary,volumes:[],characters:[],theme:null},characters:[],scenarios:[],scenes:[],settings:[]})};
 window.desktop=bridge?{repairWorkLease:action=>{calls.push(action);const p=Promise.withResolvers();repairs.push(p);return p.promise},showTextContextMenu:async request=>{textMenus.push(request);return {requestId:request.requestId,command:null}},cancelTextContextMenu:async()=>{},command:async()=>{},onEvent:()=>()=>{},readClipboardText:async()=>'',writeClipboardText:async()=>{}}:undefined;
 useDesktopStore.setState({bootstrap:{platform:'darwin',dataRoot:'root-a',settings:{appearance:{zoom:1},shortcuts:{win32:{},darwin:{}}}}});
 useChatStore.setState({draftNovelId:null,conversationId:null,newConversationRequested:false});
 const query=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity}}});
 useTabsStore.setState({tabs:[{id:'faulted-tab',type:'theme',novelId:'unavailable',title:'异常作品面板'},{id:'workid-tab',type:'theme',novelId:workId,title:'误用编号面板'}],activeTabId:'workid-tab'});const root=createRoot(document.getElementById('app'));
 flushSync(()=>root.render(<QueryClientProvider client={query}><div style={{width:280}}><SidebarTree user={{id:'local-author',name:'隔离作者',email:''}}/></div><input id='text-control' aria-label='文本输入' defaultValue='可编辑'/>{controller?<DesktopCommandController/>:null}<Toaster/><ContentTabs fullscreen={false} onToggleFullscreen={()=>{}} onToggleContent={()=>{}}/></QueryClientProvider>));
 window.worksFixture={calls,repairs,workId,requests,textMenus,reads:()=>reads,tabs:()=>useTabsStore.getState().tabs.map(t=>t.id),chat:()=>useChatStore.getState(),setChat:value=>useChatStore.setState(value),setRemove:value=>removeReply=value,holdRemove:()=>{removeGate=Promise.withResolvers()},releaseRemove:()=>{removeGate?.resolve();removeGate=null},setRoot:value=>useDesktopStore.setState(s=>({bootstrap:{...s.bootstrap,dataRoot:value}})),query,healthy:summary,append:()=>query.setQueryData(['novels'],current=>appendCreatedNovel(current,{...summary,id:'created',title:'新建作品'})),setBody:value=>body=value,setError:value=>globalError=value,resolve:value=>repairs.at(-1).resolve(value),reject:()=>repairs.at(-1).reject(Error('private-native-path-key')),unmount:()=>root.unmount()};
};` }, bundle: true, platform: 'browser', format: 'iife', write: false, tsconfig: 'tsconfig.json', plugins: [{ name: 'unrelated-tab-bodies', setup(api) {
  api.onResolve({ filter: /^@\/components\/content\/(registry|StagedSaveSurface|StoryWorkflowPanel)$/ }, args => ({ path: args.path, namespace: 'works-fixture' }))
  api.onLoad({ filter: /.*/, namespace: 'works-fixture' }, () => ({ loader: 'tsx', contents: `export const renderTabContent=()=>null;export const StagedSaveSurface=({children})=>children;export const StagedInterceptionBootstrap=()=>null;export const StorySources=()=>null;export const StoryActivityBanner=()=>null;export const StoryLivePreview=()=>null;` }))
} }], loader: { '.css': 'empty' } }).then(result => result.outputFiles![0].text)

let browser: Browser
test.before(async () => { browser = await chromium.launch({ headless: true, executablePath: process.env.SHAKEINK_TEST_CHROMIUM }) })
test.after(async () => { await browser?.close() })
async function scenario(options: Record<string, unknown>, run: (page: Page) => Promise<void>) {
  const page = await browser.newPage(), errors: string[] = []
  page.setDefaultTimeout(5000)
  page.on('pageerror', error => errors.push(error.message))
  try {
    await page.route('**/*', route => route.abort()); await page.setContent('<div id="app"></div>')
    // about:blank is not a secure context; the real app runs in one with crypto.randomUUID.
    await page.evaluate(() => { if (!crypto.randomUUID) (crypto as any).randomUUID = () => '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c => (Number(c) ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> Number(c) / 4).toString(16)) })
    await page.addStyleTag({ content: await styles }); await page.addScriptTag({ content: await bundle })
    await page.evaluate(options => (window as any).mountWorksFixture(options), options)
    // v8 replaces the former heading with the real semantic navigation Tabs.
    await page.getByRole('tablist', { name: '导航分类', exact: true }).waitFor()
    assert.equal(await page.getByRole('tablist', { name: '导航分类', exact: true }).getByRole('tab').count(), 5)
    await run(page); assert.deepEqual(errors, [])
  } finally { await page.close() }
}
const W = 'b3bd663e-0b87-480c-b6ad-6eaa1488d6cb'
const node = (page: Page, title = '待恢复作品') => page.locator('.tree-row', { hasText: title })
const menu = (page: Page) => page.getByRole('menu')
const item = (page: Page, name: string) => page.getByRole('menuitem', { name, exact: true })
const items = async (page: Page) => (await page.getByRole('menuitem').allInnerTexts()).map(text => text.trim())
async function openMenu(page: Page, title = '待恢复作品') { await node(page, title).click(); await menu(page).waitFor() }
async function closeMenu(page: Page) { await page.keyboard.press('Escape'); await menu(page).waitFor({ state: 'detached' }) }
const fixture = (page: Page) => page.evaluate(() => (window as any).worksFixture)
const extra = [
  { workId: '11111111-1111-4111-8111-111111111111', novelId: 'n-missing', title: '缺失作品', reason: 'missing' },
  { workId: '22222222-2222-4222-8222-222222222222', novelId: 'n-in-use', title: '占用作品', reason: 'in-use' },
  { workId: '33333333-3333-4333-8333-333333333333', novelId: 'n-changed', title: '变化作品', reason: 'changed' },
  { workId: '44444444-4444-4444-8444-444444444444', novelId: 'n-damaged', title: '损坏作品', reason: 'damaged' },
  { workId: '55555555-5555-4555-8555-555555555555', novelId: 'n-unknown', title: '未知作品', reason: 'unavailable' },
]

test('WN-40/06: faulted works are ordinary navigation rows; no card, no global reload button, never an empty library', () => scenario({ healthy: true, extra }, async page => {
  await node(page).waitFor()
  assert.equal(await page.getByLabel('暂不可用的作品', { exact: true }).count(), 0)
  assert.equal(await page.getByRole('button', { name: '重新加载作品', exact: true }).count(), 0)
  for (const title of ['待恢复作品', ...extra.map(w => w.title)]) {
    const row = node(page, title)
    assert.equal(await row.count(), 1, title)
    assert.equal(await row.getAttribute('role'), 'button')
    assert.equal(await row.getAttribute('aria-haspopup'), 'menu')
    assert.equal(await row.getByRole('button', { name: '展开', exact: true }).count(), 0)
  }
  assert.doesNotMatch(await page.locator('body').innerText(), /还没有小说|作品加载失败/)
  assert.equal(await page.evaluate(() => (window as any).worksFixture.reads()), 1)
}))

test('WN-41: icons carry the error or warning tone per reason', () => scenario({ healthy: true, extra }, async page => {
  await node(page).waitFor()
  const tone = (title: string) => node(page, title).locator('[data-fault-icon]').getAttribute('data-fault-icon')
  assert.equal(await tone('待恢复作品'), 'warning'); assert.equal(await tone('占用作品'), 'warning')
  for (const title of ['缺失作品', '变化作品', '损坏作品', '未知作品']) assert.equal(await tone(title), 'error', title)
  assert.equal(await node(page, '可用作品').locator('[data-fault-icon]').count(), 0)
  assert.equal(await node(page, '待恢复作品').getAttribute('data-fault'), 'warning')
  assert.equal(await node(page, '缺失作品').getAttribute('data-fault'), 'error')
}))

test("WN-42'/43': click, Enter, Space, … and right-click open the same reason-specific menu without opening a tab", () => scenario({ healthy: true, extra }, async page => {
  await node(page).waitFor()
  const expected = ['修复作品锁', '重新加载作品', '删除']
  await node(page).click(); await menu(page).waitFor(); await page.waitForTimeout(300)
  assert.equal(await menu(page).isVisible(), true); assert.deepEqual(await items(page), expected)
  assert.equal(await node(page).getAttribute('aria-expanded'), 'true')
  assert.equal(await page.getByRole('menu').getByText('作品锁未释放', { exact: true }).count(), 1)
  await closeMenu(page)
  for (const key of ['Enter', ' ']) { await node(page).focus(); await page.keyboard.press(key); await menu(page).waitFor(); assert.deepEqual(await items(page), expected); await closeMenu(page) }
  await node(page).hover(); await node(page).getByRole('button', { name: '作品操作', exact: true }).click(); await menu(page).waitFor(); assert.deepEqual(await items(page), expected); await closeMenu(page)
  await node(page).click({ button: 'right' }); await menu(page).waitFor(); assert.deepEqual(await items(page), expected); await closeMenu(page)
  assert.equal(await page.getByRole('tab', { name: '待恢复作品', exact: true }).count(), 0)
  const labels: Record<string, string> = { 缺失作品: '作品目录不可用', 占用作品: '作品正在别处使用', 变化作品: '作品目录已变化', 损坏作品: '作品数据无法读取', 未知作品: '作品暂不可用' }
  for (const [title, label] of Object.entries(labels)) {
    await openMenu(page, title)
    assert.deepEqual(await items(page), ['重新加载作品', '删除'], title)
    assert.equal(await menu(page).getByText(label, { exact: true }).count(), 1, title)
    assert.equal(await menu(page).locator('[data-slot="dropdown-menu-separator"]').count(), 1)
    await closeMenu(page)
  }
}))

for (const options of [{ reason: 'unavailable' }, { bridge: false }]) test(`WL-06/WN-43: no unsafe repair entry ${JSON.stringify(options)}`, () => scenario(options, async page => {
  await openMenu(page); assert.deepEqual(await items(page), ['重新加载作品', '删除'])
}))

test("WN-44': the hover card explains category, cause and next step", () => scenario({ extra }, async page => {
  await node(page, '缺失作品').hover()
  const card = page.locator('[data-sidebar-hover-card]')
  await card.waitFor()
  const text = await card.innerText()
  for (const part of ['缺失作品', '作品目录不可用', '作品目录已被移动、改名或删除，内容无法读取。', '恢复目录后重新加载，或从作品列表中删除。']) assert.ok(text.includes(part), part)
}))

test('WL-05/WN-45: real SidebarTree and ContentTabs share the list; healthy tree stays usable and menu reload recovers', () => scenario({ healthy: true }, async page => {
  await node(page).waitFor(); await page.getByText('可用作品', { exact: true }).click()
  assert.equal(await page.getByRole('tab', { name: '可用作品', exact: true }).count(), 1)
  await page.evaluate(() => { const f = (window as any).worksFixture; f.setBody({ novels: [f.healthy], unavailableWorks: [] }) })
  await openMenu(page); await item(page, '重新加载作品').click()
  await node(page).waitFor({ state: 'detached' })
  assert.equal(await page.evaluate(() => (window as any).worksFixture.reads()), 2)
}))
test('WL-05: creation cache update preserves unavailable entries for both real observers', () => scenario({ healthy: true }, async page => {
  await node(page).waitFor(); await page.evaluate(() => (window as any).worksFixture.append())
  await page.getByText('新建作品', { exact: true }).waitFor()
  assert.equal(await node(page).count(), 1)
  assert.equal(await page.evaluate(() => (window as any).worksFixture.query.getQueryData(['novels']).unavailableWorks.length), 1)
}))
test('WL-05: ordinary Web response without desktop metadata remains compatible', () => scenario({}, async page => {
  await node(page).waitFor(); await page.evaluate(() => { const f = (window as any).worksFixture; f.setBody({ novels: [f.healthy] }) })
  await openMenu(page); await item(page, '重新加载作品').click(); await page.getByText('可用作品', { exact: true }).waitFor()
  assert.equal(await node(page).count(), 0)
}))

test("WL-07/WN-46'/47: repair is single-flight; cancellation and safe rejection allow retry; busy state stays visible", () => scenario({}, async page => {
  await openMenu(page)
  await page.evaluate(() => { const el = [...document.querySelectorAll('[role=menuitem]')].find(e => e.textContent?.includes('修复作品锁')) as HTMLElement; el.click(); el.click() })
  assert.deepEqual(await page.evaluate(() => (window as any).worksFixture.calls), [{ type: 'start', workId: W }])
  await node(page).getByText('修复中', { exact: true }).waitFor()
  await openMenu(page)
  assert.equal(await item(page, '正在准备修复…').isDisabled(), true)
  assert.equal(await item(page, '重新加载作品').isDisabled(), true)
  assert.equal(await item(page, '删除').isDisabled(), true)
  await closeMenu(page)
  await page.evaluate(() => (window as any).worksFixture.resolve('cancelled'))
  await openMenu(page); await item(page, '修复作品锁').click()
  await page.evaluate(() => (window as any).worksFixture.reject())
  await page.getByText('暂时无法开始锁修复，原文件已保留，请重试。', { exact: true }).waitFor()
  assert.doesNotMatch(await page.locator('body').innerText(), /private-native-path-key|修复成功/)
  await openMenu(page); await item(page, '修复作品锁').click()
  assert.equal(await page.evaluate(() => (window as any).worksFixture.calls.length), 3)
  await page.evaluate(() => (window as any).worksFixture.resolve('cancelled'))
}))
for (const [result, label] of [['pending', '修复交接待完成'], ['restarting', '正在重新启动…']]) test(`WL-07: ${result} never offers a second start or claims success`, () => scenario({}, async page => {
  await openMenu(page); await item(page, '修复作品锁').click(); await page.evaluate(result => (window as any).worksFixture.resolve(result), result)
  await node(page).getByText('待重启', { exact: true }).waitFor()
  await openMenu(page)
  assert.equal(await item(page, '修复作品锁').count(), 0); assert.equal(await item(page, label).isDisabled(), true)
  assert.doesNotMatch(await page.locator('body').innerText(), /修复成功|修复完成/)
}))
test("WN-59': changing the data root resets repair state; a stale promise cannot restore it", () => scenario({}, async page => {
  await openMenu(page); await item(page, '修复作品锁').click(); await node(page).getByText('修复中', { exact: true }).waitFor()
  await page.evaluate(() => (window as any).worksFixture.setRoot('root-b'))
  await node(page).getByText('修复中', { exact: true }).waitFor({ state: 'detached' })
  await page.evaluate(() => (window as any).worksFixture.resolve('pending'))
  await page.waitForTimeout(100)
  await openMenu(page); assert.equal(await item(page, '修复作品锁').isDisabled(), false)
}))

test('WL-04/06/WN-58: global failure stays an error and hides previous faulted nodes', () => scenario({}, async page => {
  await node(page).waitFor(); await page.evaluate(() => (window as any).worksFixture.setError(true))
  await openMenu(page); await item(page, '重新加载作品').click(); await page.getByText('作品加载失败', { exact: true }).waitFor()
  assert.equal(await node(page).count(), 0)
  assert.doesNotMatch(await page.locator('body').innerText(), /private-native-path-key|还没有小说/)
  assert.equal(await page.getByRole('button', { name: '重新加载作品', exact: true }).count(), 1)
}))
test('WL-04/06: global request failure on first load never exposes faulted nodes', () => scenario({ globalError: true }, async page => {
  await page.getByText('作品加载失败', { exact: true }).waitFor()
  assert.equal(await node(page).count(), 0); assert.doesNotMatch(await page.locator('body').innerText(), /private-native-path-key|还没有小说/)
}))

test("WN-48'/49: delete opens a React dialog; cancel sends nothing; stale-lease warns to repair first", () => scenario({ extra }, async page => {
  await openMenu(page, '缺失作品'); await item(page, '删除').click()
  const dialog = page.getByRole('dialog'); await dialog.waitFor()
  assert.equal(await dialog.getByRole('heading', { name: '删除作品', exact: true }).count(), 1)
  const text = await dialog.innerText()
  for (const part of ['《缺失作品》', '与该作品关联的对话将一并删除。', '作品目录中的文件不会被改动。', '目录恢复后，可通过“打开作品目录”重新加入。']) assert.ok(text.includes(part), part)
  await dialog.getByRole('button', { name: '取消', exact: true }).click(); await dialog.waitFor({ state: 'detached' })
  await openMenu(page); await item(page, '删除').click(); await dialog.waitFor()
  const lease = await dialog.innerText()
  assert.ok(lease.includes('建议先使用“修复作品锁”')); assert.ok(!lease.includes('可通过“打开作品目录”重新加入'))
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  assert.equal((await page.evaluate(() => (window as any).worksFixture.requests)).filter((r: any) => r.method === 'DELETE').length, 0)
}))

test("WN-50'/50b: confirming deletes once, closes only that novel's tabs, refreshes lists and starts a new chat if needed", () => scenario({ healthy: true }, async page => {
  await page.evaluate(() => (window as any).worksFixture.setChat({ draftNovelId: 'unavailable', conversationId: 'faulted-conversation' }))
  await openMenu(page); await item(page, '删除').click()
  const dialog = page.getByRole('dialog'); await dialog.waitFor()
  const before = (await page.evaluate(() => (window as any).worksFixture.requests)).length
  await dialog.getByRole('button', { name: '确认删除', exact: true }).click()
  await dialog.waitFor({ state: 'detached' })
  await page.getByText('作品已从列表中删除', { exact: true }).waitFor()
  const requests = (await page.evaluate(() => (window as any).worksFixture.requests)).slice(before)
  assert.deepEqual(requests.filter((r: any) => r.method === 'DELETE'), [{ path: `/api/works/${W}`, method: 'DELETE' }])
  assert.ok(requests.some((r: any) => r.path === '/api/novels'))
  assert.ok(requests.some((r: any) => r.path === '/api/chat/conversations'))
  assert.deepEqual(await page.evaluate(() => (window as any).worksFixture.tabs()), ['workid-tab'])
  assert.equal(await page.evaluate(() => (window as any).worksFixture.chat().newConversationRequested), true)
  await node(page).waitFor({ state: 'detached' })
}))
test('WN-50b: a concurrent removal reported as not found is treated as done', () => scenario({}, async page => {
  await page.evaluate(() => (window as any).worksFixture.setRemove({ status: 404, body: { error: '作品不存在或已从列表中删除', code: 'WORK_NOT_FOUND' } }))
  await openMenu(page); await item(page, '删除').click()
  await page.getByRole('dialog').getByRole('button', { name: '确认删除', exact: true }).click()
  await page.getByRole('dialog').waitFor({ state: 'detached' })
}))
test("WN-51'/52: failures keep the dialog open with safe text and allow a second confirm", () => scenario({}, async page => {
  await page.evaluate(() => (window as any).worksFixture.setRemove({ status: 409, body: { error: '作品仍有任务在运行，请稍后重试', code: 'WORK_BUSY' } }))
  await openMenu(page); await item(page, '删除').click()
  const dialog = page.getByRole('dialog'), confirm = dialog.getByRole('button', { name: '确认删除', exact: true })
  await confirm.click(); await dialog.getByRole('alert').getByText('作品仍有任务在运行，请稍后重试').waitFor()
  await page.evaluate(() => (window as any).worksFixture.setRemove({ status: 500, raw: '<html>private-native-path-key</html>' }))
  await confirm.click(); await dialog.getByRole('alert').getByText('暂时无法删除作品，原数据已保留，请重试。').waitFor()
  await page.evaluate(() => (window as any).worksFixture.setRemove({ status: 200, reject: true }))
  await confirm.click(); await dialog.getByRole('alert').getByText('暂时无法删除作品，原数据已保留，请重试。').waitFor()
  assert.doesNotMatch(await dialog.innerText(), /private-native-path-key/)
  assert.equal((await page.evaluate(() => (window as any).worksFixture.requests)).filter((r: any) => r.method === 'DELETE').length, 3)
}))
test("WN-53': a pending delete is single-flight and the dialog cannot be dismissed", () => scenario({}, async page => {
  await page.evaluate(() => (window as any).worksFixture.holdRemove())
  await openMenu(page); await item(page, '删除').click()
  const dialog = page.getByRole('dialog')
  await page.evaluate(() => { const b = [...document.querySelectorAll('[role=dialog] button')].find(e => e.textContent?.includes('确认删除')) as HTMLButtonElement; b.click(); b.click() })
  await dialog.getByRole('button', { name: '正在删除…', exact: true }).waitFor()
  assert.equal(await dialog.getByRole('button', { name: '取消', exact: true }).isDisabled(), true)
  await page.keyboard.press('Escape'); await page.waitForTimeout(100); assert.equal(await dialog.isVisible(), true)
  assert.equal((await page.evaluate(() => (window as any).worksFixture.requests)).filter((r: any) => r.method === 'DELETE').length, 1)
  await page.evaluate(() => (window as any).worksFixture.releaseRemove()); await dialog.waitFor({ state: 'detached' })
}))
test("WN-54': while reloading, repair and delete are disabled", () => scenario({}, async page => {
  await node(page).waitFor()
  await page.evaluate(() => { const f = (window as any).worksFixture; const original = window.fetch; window.fetch = (async (input: any, init: any) => { if (String(input) === '/api/novels') await new Promise(() => {}); return original(input, init) }) as any; f.query.invalidateQueries({ queryKey: ['novels'] }) })
  await openMenu(page)
  assert.equal(await item(page, '正在重新加载…').isDisabled(), true)
  assert.equal(await item(page, '修复作品锁').isDisabled(), true)
  assert.equal(await item(page, '删除').isDisabled(), true)
}))

test('WN-55: other navigation views use the same icon, menu and one-line explanation', () => scenario({ extra }, async page => {
  await page.getByRole('tab', { name: '设定', exact: true }).click()
  const group = page.locator('.nav-work-group', { hasText: '缺失作品' })
  await group.waitFor()
  assert.equal(await group.locator('.nav-group-toggle [data-fault-icon="error"]').count(), 1)
  assert.equal(await group.locator('.nav-group-toggle').getAttribute('data-fault'), 'error')
  assert.ok((await group.innerText()).includes('作品目录不可用，恢复目录后重新加载，或从作品列表中删除。'))
  assert.equal(await group.locator('.rounded-md.border').count(), 0)
  await group.getByRole('button', { name: '作品操作', exact: true }).click(); await menu(page).waitFor(); assert.deepEqual(await items(page), ['重新加载作品', '删除']); await closeMenu(page)
  await group.locator('.nav-group-heading').click({ button: 'right' }); await menu(page).waitFor(); assert.deepEqual(await items(page), ['重新加载作品', '删除'])
}))

test("WN-56': a healthy work keeps its menu; right-click opens the same items and left click still opens the work", () => scenario({ healthy: true }, async page => {
  const healthy = node(page, '可用作品'); await healthy.waitFor()
  await healthy.hover(); await healthy.getByRole('button', { name: '小说操作', exact: true }).click(); await menu(page).waitFor()
  const dots = await items(page); assert.deepEqual(dots, ['重命名', '删除'])
  assert.equal(await menu(page).locator('[data-slot="dropdown-menu-separator"]').count(), 0)
  await closeMenu(page)
  await healthy.click({ button: 'right' }); await menu(page).waitFor(); assert.deepEqual(await items(page), dots)
  await item(page, '重命名').click(); await page.getByRole('dialog').waitFor(); await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'detached' })
  await healthy.click(); assert.equal(await menu(page).count(), 0)
  assert.equal(await page.getByRole('tab', { name: '可用作品', exact: true }).count(), 1)
  await page.getByRole('tab', { name: '设定', exact: true }).click()
  await page.locator('.nav-work-group', { hasText: '可用作品' }).locator('.nav-group-heading').click({ button: 'right' })
  await page.waitForTimeout(150); assert.equal(await menu(page).count(), 0)
}))

test("WN-57': navigation rows never open the text context menu; inputs still do", () => scenario({ healthy: true, controller: true }, async page => {
  await node(page).waitFor()
  await page.locator('#text-control').click({ button: 'right' })
  await page.waitForFunction(() => (window as any).worksFixture.textMenus.length === 1)
  for (const target of [node(page), node(page, '可用作品'), node(page).locator('.nav-label')]) {
    await target.click({ button: 'right' }); await menu(page).waitFor(); await page.waitForTimeout(150)
    await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('[role=menu][data-open]'))
  }
  assert.equal(await page.evaluate(() => (window as any).worksFixture.textMenus.length), 1)
}))

test('WN-42b: closing a row-opened menu returns focus to the visible row, not the hidden … trigger', () => scenario({}, async page => {
  await node(page).focus(); await page.keyboard.press('Enter'); await menu(page).waitFor()
  await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('[role=menu][data-open]'))
  await page.waitForFunction(() => document.activeElement?.classList.contains('tree-row'))
  assert.equal(await page.evaluate(() => (document.activeElement as HTMLElement).getAttribute('aria-label')), '待恢复作品')
}))
test('WN-42c: right-click hides an open hover card for faulted and healthy rows', () => scenario({ healthy: true }, async page => {
  const card = page.locator('[data-sidebar-hover-card]')
  for (const title of ['待恢复作品', '可用作品']) {
    await node(page, title).hover(); await card.waitFor()
    await node(page, title).click({ button: 'right' }); await menu(page).waitFor()
    await card.waitFor({ state: 'detached' })
    await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('[role=menu][data-open]'))
    await page.mouse.move(900, 650); await page.waitForTimeout(300)
  }
}))
test('WN-57b: with the desktop shortcut controller mounted, Escape closes a right-click menu whose focus stayed on the row', () => scenario({ healthy: true, controller: true }, async page => {
  for (const title of ['待恢复作品', '可用作品']) {
    await node(page, title).click({ button: 'right' }); await menu(page).waitFor(); await page.waitForTimeout(150)
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => !document.querySelector('[role=menu][data-open]'), null, { timeout: 2000 })
  }
}))
test('CV-01: a rejected conversation request shows a safe message in both sidebar sections, never the native path', () => scenario({ healthy: true, conversationError: true }, async page => {
  const guide = page.getByRole('alert').filter({ hasText: '重试指引会话' })
  await guide.waitFor()
  assert.ok((await guide.innerText()).includes('加载会话列表失败'))
  await page.getByRole('tab', { name: '对话', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: '重试对话' }).first().waitFor()
  const text = await page.locator('body').innerText()
  assert.doesNotMatch(text, /private-native-path-key|ENOENT|desktop:request|\/private\/var/)
}))
