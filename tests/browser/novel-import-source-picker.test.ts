import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFile} from 'node:fs/promises'
import {build} from 'esbuild'
import {chromium,type Browser,type Page} from 'playwright-core'
import type {} from '../helpers/novel-import-source-picker-fixture'

let browser:Browser,bundle:string,css:string
test.before(async()=>{
 const result=await build({entryPoints:['tests/helpers/novel-import-source-picker-fixture.tsx'],bundle:true,platform:'browser',format:'iife',write:false,tsconfig:'tsconfig.json',loader:{'.css':'empty'},logLevel:'silent'})
 bundle=result.outputFiles[0].text
 css=await readFile('design/assets/web-tokens.css','utf8')+'\n.desktop-dialog-surface{translate:-50% -50%}\n'+await readFile('src/components/desktop/novel-import-source-picker.css','utf8')
 browser=await chromium.launch({headless:true,executablePath:process.env.SHAKEINK_TEST_CHROMIUM??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'})
})
test.after(async()=>{await browser?.close()})
async function fixture(options:Record<string,unknown>,run:(page:Page)=>Promise<void>,open=true){
 const page=await browser.newPage({viewport:{width:1280,height:800},reducedMotion:'reduce'}),errors:string[]=[]
 page.setDefaultTimeout(7000);page.on('pageerror',error=>errors.push(error.message))
 await page.route('**/*',async route=>{const match=new URL(route.request().url()).pathname.match(/^\/import-file-icons\/(text|markdown|word|pdf|html)\.svg$/);if(match)await route.fulfill({contentType:'image/svg+xml',body:await readFile('public/import-file-icons/'+match[1]+'.svg')});else await route.abort()})
 try{await page.setContent('<base href="https://source-picker.test/"><div id="app"></div>');await page.evaluate('globalThis.__name=target=>target');await page.addStyleTag({content:css});await page.addScriptTag({content:bundle});await page.evaluate(value=>window.mountSourcePicker(value),options);if(open)await page.getByRole('dialog').waitFor();await run(page);assert.deepEqual(errors,[])}finally{await page.close()}
}
const calls=(page:Page)=>page.evaluate(()=>window.sourcePickerFixture.calls)
const state=(page:Page)=>page.evaluate(()=>window.sourcePickerFixture.state())

test('CP-U01: real metadata rows/icons, disabled items, current directory, filtering and cross-directory removal',()=>fixture({},async page=>{
 const d=page.getByRole('dialog');assert.equal(await d.getByRole('combobox').count(),0);assert.equal(await d.locator('.nisp-file-icon img').count(),7)
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('.nisp-file-icon img')).every(image=>(image as HTMLImageElement).naturalWidth>0))
 assert.equal(await d.getByRole('button',{name:'选择',exact:true}).isDisabled(),true);assert.equal(await d.getByRole('checkbox',{name:'选择 封面.png',exact:true}).isDisabled(),true)
 await d.getByRole('checkbox',{name:'选择 正文.txt',exact:true}).check();await d.getByRole('checkbox',{name:'选择 大纲.md',exact:true}).check()
 await d.getByRole('searchbox',{name:'筛选当前文件夹',exact:true}).fill('没有这个名称');await d.getByText('没有匹配的项目',{exact:true}).waitFor();assert.equal((await state(page)).view.selected.length,2)
 await d.getByRole('button',{name:'清空筛选',exact:true}).click();await d.getByRole('button',{name:'打开文件夹 小说原稿',exact:true}).click();await d.getByRole('checkbox',{name:'选择 第01章.txt',exact:true}).waitFor()
 assert.equal((await state(page)).view.selected.length,2);await d.getByRole('checkbox',{name:'选中当前文件夹 小说原稿',exact:true}).check();assert.equal((await state(page)).view.selected.length,3)
 await d.getByRole('button',{name:'移除 正文.txt',exact:true}).click();assert.equal((await state(page)).view.selected.length,2);assert.equal(await d.evaluate(element=>element.contains(document.activeElement)),true)
 await d.getByRole('button',{name:'选择',exact:true}).click();await d.waitFor({state:'hidden'})
 const actions=await calls(page);assert.ok(actions.every((action:any)=>!('path'in action)&&!('paths'in action)));assert.equal(actions.at(-1).type,'confirm')
}))

test('CP-U01: folder double click restores only its first-click selection before navigating',async()=>{
 for(const initiallySelected of [false,true])await fixture({},async page=>{
  const d=page.getByRole('dialog');await d.getByRole('checkbox',{name:'选择 正文.txt',exact:true}).check()
  if(initiallySelected)await d.getByRole('checkbox',{name:'选择 小说原稿',exact:true}).check()
  await d.locator('.nisp-entry-name').filter({hasText:'小说原稿'}).dblclick({delay:350})
  await d.getByRole('checkbox',{name:'选择 第01章.txt',exact:true}).waitFor();const value=(await state(page)).view,ids=await page.evaluate(()=>window.sourcePickerFixture.ids)
  assert.equal(value.selected.some((entry:any)=>entry.id===ids.novel),initiallySelected);assert.equal(value.selected.some((entry:any)=>entry.id===ids.body),true)
  assert.equal((await calls(page)).at(-1).type,'navigate')
 })
})

test('CP-U02: errors, empty/loading, keyboard navigation and short viewports retain focus and footer',()=>fixture({},async page=>{
 const d=page.getByRole('dialog'),first=d.locator('.nisp-entry').first();await first.focus();await page.keyboard.press('ArrowDown');assert.equal(await d.locator('.nisp-entry').nth(1).evaluate(element=>element===document.activeElement),true)
 await page.keyboard.press('Space');assert.equal((await state(page)).view.selected.length,1)
 await first.focus();await page.keyboard.press('Enter');await d.getByRole('checkbox',{name:'选择 第01章.txt',exact:true}).waitFor();assert.equal(await d.evaluate(element=>element.contains(document.activeElement)),true)
 for(const [width,height,theme] of [[680,460,'ink'],[390,640,'paper'],[900,520,'paper']] as const){await page.setViewportSize({width,height});await page.evaluate(value=>document.documentElement.className=value,theme);const rect=await d.boundingBox(),footer=await d.locator('.nisp-footer').boundingBox();assert.ok(rect&&footer&&rect.x>=8&&rect.y>=8&&rect.x+rect.width<=width-8&&rect.y+rect.height<=height-8&&footer.y+footer.height<=height-8,JSON.stringify({rect,footer,width,height}));assert.equal(await d.evaluate(element=>element.scrollWidth<=element.clientWidth),true)}
 await page.evaluate(()=>window.sourcePickerFixture.set({phase:'loading'}));await d.getByText('正在载入文件夹',{exact:true}).waitFor();assert.equal(await d.getByRole('button',{name:'取消',exact:true}).isEnabled(),true)
 await page.evaluate(()=>window.sourcePickerFixture.set({phase:'ready',entries:[],error:'无法访问这个文件夹，请选择其他位置。'}));await d.getByRole('alert').waitFor();assert.equal((await state(page)).view.selected.length,1)
 await page.evaluate(()=>window.sourcePickerFixture.empty());await d.getByText('这个文件夹是空的',{exact:true}).waitFor()
 for(let i=0;i<12;i++){await page.keyboard.press('Tab');await page.waitForFunction(()=>document.querySelector('[role="dialog"]')?.contains(document.activeElement))}
 await page.keyboard.press('Escape');await d.waitFor({state:'hidden'});const action=(await calls(page)).at(-1);assert.equal(action.type,'cancel');assert.equal('revision'in action,false)
}))

test('CP-L01: immediate cancel bypasses navigation/checking and late replies/events cannot reopen or replace a new picker',async()=>{
 for(const kind of ['navigate','confirm'] as const)await fixture({deferNavigate:kind==='navigate',deferConfirm:kind==='confirm'},async page=>{
  const d=page.getByRole('dialog');if(kind==='navigate')await d.getByRole('button',{name:'打开文件夹 小说原稿',exact:true}).click();else{await d.getByRole('checkbox',{name:'选择 正文.txt',exact:true}).check();await d.getByRole('button',{name:'选择',exact:true}).click()}
  await page.waitForFunction(type=>window.sourcePickerFixture.calls.some((action:any)=>action.type===type),kind)
  await d.getByRole('button',{name:'取消',exact:true}).click();await d.waitFor({state:'hidden'});assert.equal((await calls(page)).at(-1).type,'cancel')
  await page.evaluate(()=>window.sourcePickerFixture.openNew());await d.waitFor();const id=(await state(page)).view.id
  await d.getByRole('checkbox',{name:'选择 正文.txt',exact:true}).check()
  await page.evaluate(type=>window.sourcePickerFixture.release(type),kind);await page.waitForTimeout(50);assert.equal((await state(page)).view.id,id);assert.equal((await state(page)).busy,0)
 })
})

test('CP-L01: canceled initial current response is retired and suspension/unmount release the pending choose',async()=>{await fixture({deferCurrent:true},async page=>{
 await page.evaluate(()=>window.sourcePickerFixture.emit());const d=page.getByRole('dialog');await d.waitFor();await page.keyboard.press('Escape');await d.waitFor({state:'hidden'})
 await page.evaluate(()=>window.sourcePickerFixture.release('current'));await page.waitForTimeout(50);assert.equal((await state(page)).view,null)
 await page.evaluate(()=>window.sourcePickerFixture.openNew());await d.waitFor();await page.evaluate(()=>window.sourcePickerFixture.suspend(true));await d.waitFor({state:'hidden'});assert.equal((await calls(page)).at(-1).type,'cancel')
},false);await fixture({deferCurrent:true},async page=>{
 await page.evaluate(()=>window.sourcePickerFixture.unmount());await page.evaluate(()=>window.sourcePickerFixture.release('current'));await page.waitForFunction(()=>window.sourcePickerFixture.calls.some((action:any)=>action.type==='cancel'));assert.equal((await state(page)).view,null)
},false)})
