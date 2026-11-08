import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { chromium, type Browser, type Page } from 'playwright-core'

// IA-B01..B10: real NovelImportDialog behind the controlled public bridge (tests/helpers/novel-import-ui-fixture.tsx).
let browser:Browser,bundle:string,css:string
test.before(async()=>{
 const result=await build({entryPoints:['tests/helpers/novel-import-ui-fixture.tsx'],bundle:true,platform:'browser',format:'iife',write:false,tsconfig:'tsconfig.json',loader:{'.css':'empty'},logLevel:'silent'})
 bundle=result.outputFiles[0].text
 css=await readFile('design/assets/web-tokens.css','utf8')+'\n.desktop-dialog-surface{translate:-50% -50%}\n'+await readFile('src/components/desktop/novel-import.css','utf8')
 browser=await chromium.launch({headless:true,executablePath:process.env.SHAKEINK_TEST_CHROMIUM??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'})
})
test.after(async()=>{await browser?.close()})
async function fixture(options:Record<string,unknown>,run:(page:Page)=>Promise<void>){
 const page=await browser.newPage({viewport:{width:1280,height:800},reducedMotion:'reduce'}),errors:string[]=[]
 page.setDefaultTimeout(6000);page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>route.abort())
 try{await page.setContent('<base href="https://novel-import.test/"><div id="app"></div>');await page.evaluate('globalThis.__name=target=>target');await page.addStyleTag({content:css});await page.addScriptTag({content:bundle});await page.evaluate(o=>(window as any).mountNovelImport(o),options);await page.getByRole('button',{name:'导入作品',exact:true}).click();await page.getByRole('dialog').waitFor();await run(page);assert.deepEqual(errors,[])}finally{await page.close()}
}
const fx=(page:Page)=>({calls:()=>page.evaluate(()=>(window as any).novelImportFixture.calls.map((c:any)=>c.type) as string[]),set:(v:unknown)=>page.evaluate(v=>(window as any).novelImportFixture.set(v),v as any),eval:<T>(fn:string)=>page.evaluate(fn) as Promise<T>})
const cancels=async(page:Page)=>(await fx(page).calls()).filter(t=>t==='cancel').length
const interrupted=(page:Page)=>page.getByText('导入已中断并删除，请重新导入作品',{exact:true})

const close=async(page:Page,how:'Escape'|'backdrop'|'button')=>{if(how==='Escape')await page.keyboard.press('Escape');else if(how==='backdrop')await page.mouse.click(8,8);else await page.locator('.ni-dialog').getByRole('button',{name:'关闭导入窗口',exact:true}).click()}
const confirmation=(page:Page)=>page.getByRole('dialog',{name:'关闭导入？',exact:true})
for(const how of ['Escape','backdrop','button'] as const)for(const phase of ['source','select','confirm','failed'])test(`IA-B01/NICC-B10: ${how} on early ${phase} deletes directly`,()=>fixture({phase},async page=>{
 const d=page.locator('.ni-dialog');await close(page,how);await d.waitFor({state:'hidden'});assert.equal(await confirmation(page).count(),0);assert.equal(await cancels(page),1);assert.equal(await page.locator('.ni-task-button').count(),0)
 await page.waitForTimeout(150);assert.equal(await interrupted(page).count(),0,'a cancel the user started is not reported as an interruption')
}))
for(const how of ['Escape','backdrop','button'] as const)for(const phase of ['recognizing','running','paused','conflicts'])test(`IA-B01/NICC-B11: ${how} on active ${phase} requires confirmation`,()=>fixture({phase},async page=>{
 const d=page.locator('.ni-dialog'),c=confirmation(page);await close(page,how);await c.waitFor();assert.equal(await cancels(page),0)
 await c.getByRole('button',{name:'继续导入',exact:true}).click();await c.waitFor({state:'hidden'});assert.equal(await d.isVisible(),true);assert.equal(await cancels(page),0)
 await close(page,how);await c.getByRole('button',{name:'确认关闭并删除',exact:true}).click();await c.waitFor({state:'hidden'});await d.waitFor({state:'hidden'});assert.equal(await cancels(page),1);assert.equal(await page.locator('.ni-task-button').count(),0)
 await page.waitForTimeout(150);assert.equal(await interrupted(page).count(),0,'a cancel the user started is not reported as an interruption')
}))
for(const phase of ['recognizing','running','paused','failed','conflicts'])test(`NICC-B12: explicit cancel on ${phase} still deletes directly`,()=>fixture({phase},async page=>{
 const d=page.locator('.ni-dialog');await d.getByRole('button',{name:'取消导入',exact:true}).first().click();await d.waitFor({state:'hidden'});assert.equal(await confirmation(page).count(),0);assert.equal(await cancels(page),1)
}))

test('IA-B02: no keep-draft, discard, later or collapse controls on unfinished screens',async()=>{
 for(const phase of ['source','select','confirm','running','paused','failed','conflicts'])await fixture({phase},async page=>{
  const d=page.getByRole('dialog');const text=await d.innerText()
  for(const name of ['停止并保留草稿','丢弃导入草稿','稍后处理','收起'])assert.equal(await d.getByRole('button',{name,exact:true}).count(),0,phase+': '+name)
  assert.doesNotMatch(text,/收起窗口|保留草稿|后台/)
 })
})

test('IA-B04: clicking 导入作品 again asks before replacing; going back keeps the import',()=>fixture({phase:'select'},async page=>{
 const d=page.getByRole('dialog');const before=(await fx(page).calls()).length
 await page.locator('#fixture-import').evaluate((b:HTMLButtonElement)=>b.click())
 await d.getByRole('heading',{name:'开始新的导入？',exact:true}).waitFor();assert.match(await d.innerText(),/当前导入《隔离测试作品》尚未完成。开始新的导入会停止并删除它，原始文件不会更改。/)
 await d.getByRole('button',{name:'返回当前导入',exact:true}).click();await d.getByRole('heading',{name:'选择内容',exact:true}).waitFor();assert.deepEqual((await fx(page).calls()).slice(before),[])
 await page.locator('#fixture-import').evaluate((b:HTMLButtonElement)=>b.click());await d.getByRole('button',{name:'删除并重新选择',exact:true}).click()
 await page.waitForFunction(()=>(window as any).novelImportFixture.calls.at(-1)?.type==='choose');assert.deepEqual((await fx(page).calls()).slice(before),['cancel','choose']);await d.waitFor()
 assert.equal(await page.evaluate(()=>(window as any).novelImportFixture.view().id),'7d2c0e5a-4a0f-4c1e-9d55-1f0b6c1e2a30')
}))

test('IA-B04b: a started save reopens instead of offering replacement',()=>fixture({phase:'failed',publication:true},async page=>{
 const d=page.getByRole('dialog');await page.keyboard.press('Escape');await d.waitFor({state:'hidden'});assert.equal(await cancels(page),0)
 await page.locator('#fixture-import').evaluate((b:HTMLButtonElement)=>b.click());await d.waitFor();assert.equal(await d.getByRole('heading',{name:'开始新的导入？'}).count(),0);assert.equal(await cancels(page),0)
}))

test('IA-B04c: when replacement cannot delete, no new picker opens and the kept directory is reported',()=>fixture({phase:'select',cancelMode:'unknown-files'},async page=>{
 const d=page.getByRole('dialog');const before=(await fx(page).calls()).filter(t=>t==='choose').length
 await page.locator('#fixture-import').evaluate((b:HTMLButtonElement)=>b.click());await d.getByRole('button',{name:'删除并重新选择',exact:true}).click()
 await page.getByText('导入草稿目录含未知文件，已保留：60103f7f-b69b-4d56-a228-417c8b7b6053',{exact:true}).waitFor();await d.waitFor({state:'hidden'})
 assert.equal((await fx(page).calls()).filter(t=>t==='choose').length,before)
}))

test('IA-B05: configuring models suspends instead of deleting, and returns to the same screen',()=>fixture({noModels:true},async page=>{
 const d=page.getByRole('dialog');await d.getByRole('button',{name:'识别内容',exact:true}).click();await d.getByRole('heading',{name:'确认识别范围',exact:true}).waitFor()
 await d.getByRole('button',{name:'配置模型',exact:true}).first().click();await page.evaluate(()=>(window as any).novelImportFixture.setSuspended(true));await d.waitFor({state:'hidden'})
 assert.deepEqual(await page.evaluate(()=>(window as any).novelImportFixture.settings),['models']);assert.equal(await cancels(page),0)
 await page.evaluate(()=>(window as any).novelImportFixture.setSuspended(false));await d.getByRole('heading',{name:'确认识别范围',exact:true}).waitFor();assert.equal(await cancels(page),0)
}))

test('IA-B05b: neither model entry point closes the import dialog',async()=>{
 for(const file of ['src/components/desktop/NovelImportDialog.tsx','src/components/desktop/NovelImportWizard.tsx']){const source=await readFile(file,'utf8');for(const match of source.matchAll(/desktop:settings-section/gu)){const around=source.slice(Math.max(0,match.index-160),match.index);assert.doesNotMatch(around,/hideNovelImport\(\)/u,file)}}
})

test('IA-B06: a started save only collapses and the task bar reopens it',()=>fixture({phase:'failed',publication:true},async page=>{
 const d=page.getByRole('dialog');await d.getByRole('button',{name:'收起',exact:true}).first().click();await d.waitFor({state:'hidden'});assert.equal(await cancels(page),0)
 await page.locator('.ni-task-button').click();await d.waitFor();await page.keyboard.press('Escape');await d.waitFor({state:'hidden'});assert.equal(await cancels(page),0)
}))

test('IA-B07: closing a completed import never deletes it',()=>fixture({phase:'running'},async page=>{
 const d=page.getByRole('dialog');await page.evaluate(()=>(window as any).novelImportFixture.complete());await d.getByRole('heading',{name:'导入完成',exact:true}).waitFor()
 await d.getByRole('button',{name:'关闭',exact:true}).click();await d.waitFor({state:'hidden'});assert.equal(await cancels(page),0);assert.match(await page.locator('.ni-task-button').innerText(),/导入完成/)
}))

test('IA-B08: when deletion keeps unknown files the dialog still closes with the error',()=>fixture({phase:'select',cancelMode:'unknown-files'},async page=>{
 const d=page.getByRole('dialog');await page.keyboard.press('Escape');await d.waitFor({state:'hidden'})
 await page.getByText('导入草稿目录含未知文件，已保留：60103f7f-b69b-4d56-a228-417c8b7b6053',{exact:true}).waitFor();assert.equal(await interrupted(page).count(),0)
}))

test('IA-B08b: deletion refused because saving started keeps the dialog open with the reason',()=>fixture({phase:'select',cancelMode:'publication'},async page=>{
 const d=page.getByRole('dialog');await d.getByRole('button',{name:'关闭导入窗口',exact:true}).click();await d.getByRole('alert').getByText('保存已开始，不能删除这次导入，请重试保存',{exact:true}).waitFor();assert.equal(await d.isVisible(),true)
}))

test('NICC-B13: a refused confirmed deletion returns to the import and unlocks closing',()=>fixture({phase:'running',cancelMode:'publication'},async page=>{
 const d=page.locator('.ni-dialog'),c=confirmation(page);await d.getByRole('button',{name:'关闭导入窗口',exact:true}).click();await c.getByRole('button',{name:'确认关闭并删除',exact:true}).click()
 await c.waitFor({state:'hidden'});await d.getByRole('alert').getByText('保存已开始，不能删除这次导入，请重试保存',{exact:true}).waitFor();assert.equal(await d.isVisible(),true);assert.equal(await fx(page).eval('window.novelImportFixture.state().busy'),0)
 await d.getByRole('button',{name:'关闭导入窗口',exact:true}).click();await c.waitFor();assert.equal(await cancels(page),1)
}))

test('NICC-B14: a confirmed deletion with retained unknown files leaves no stale warning',()=>fixture({phase:'running',cancelMode:'unknown-files'},async page=>{
 const d=page.locator('.ni-dialog'),c=confirmation(page);await d.getByRole('button',{name:'关闭导入窗口',exact:true}).click();await c.getByRole('button',{name:'确认关闭并删除',exact:true}).click()
 await c.waitFor({state:'hidden'});await d.waitFor({state:'hidden'});await page.getByText('导入草稿目录含未知文件，已保留：60103f7f-b69b-4d56-a228-417c8b7b6053',{exact:true}).waitFor();assert.equal(await interrupted(page).count(),0);assert.equal(await fx(page).eval('window.novelImportFixture.state().busy'),0)
 await page.locator('#fixture-import').click();await d.waitFor();assert.equal(await c.count(),0)
}))

test('NICC-B15: suspending, hiding or replacing the view clears the warning without deleting',()=>fixture({phase:'running'},async page=>{
 const d=page.locator('.ni-dialog'),c=confirmation(page),open=()=>d.getByRole('button',{name:'关闭导入窗口',exact:true}).click()
 await open();await page.evaluate(()=>(window as any).novelImportFixture.setSuspended(true));await d.waitFor({state:'hidden'});assert.equal(await c.count(),0)
 await page.evaluate(()=>(window as any).novelImportFixture.setSuspended(false));await d.waitFor();assert.equal(await c.count(),0);assert.equal(await cancels(page),0)
 await open();await page.evaluate(()=>(window as any).novelImportFixture.setOpen(false));await d.waitFor({state:'hidden'});await page.evaluate(()=>(window as any).novelImportFixture.setOpen(true));await d.waitFor();assert.equal(await c.count(),0)
 await open();await fx(page).set({id:'7d2c0e5a-4a0f-4c1e-9d55-1f0b6c1e2a30'});await c.waitFor({state:'hidden'});assert.equal(await d.isVisible(),true);assert.equal(await cancels(page),0)
}))

test('NICC-B16: dismissing replace keeps the current active import without another warning',()=>fixture({phase:'running'},async page=>{
 const d=page.locator('.ni-dialog');await page.locator('#fixture-import').evaluate((b:HTMLButtonElement)=>b.click());await d.getByRole('heading',{name:'开始新的导入？',exact:true}).waitFor()
 await d.getByRole('button',{name:'关闭导入窗口',exact:true}).click();await d.getByRole('heading',{name:'正在导入',exact:true}).waitFor();assert.equal(await confirmation(page).count(),0);assert.equal(await cancels(page),0)
}))

test('IA-B09: a deletion the user did not start is explained',()=>fixture({phase:'running'},async page=>{
 const d=page.getByRole('dialog');await page.evaluate(()=>(window as any).novelImportFixture.pushView(null));await d.waitFor({state:'hidden'});await interrupted(page).waitFor()
}))

test('IA-B10: opening and closing the import record does not delete',()=>fixture({phase:'running'},async page=>{
 const d=page.getByRole('dialog');await page.evaluate(()=>(window as any).novelImportFixture.complete());await d.getByRole('button',{name:'查看导入记录',exact:true}).click()
 const record=page.getByRole('dialog').filter({hasText:'导入记录'});await record.waitFor();await page.keyboard.press('Escape');await page.waitForTimeout(150);assert.equal(await cancels(page),0)
}))

test('IA-B04d: dismissing the replace prompt keeps the current import',()=>fixture({phase:'select'},async page=>{
 const d=page.getByRole('dialog');const before=(await fx(page).calls()).length
 await page.locator('#fixture-import').evaluate((b:HTMLButtonElement)=>b.click());await d.getByRole('heading',{name:'开始新的导入？',exact:true}).waitFor()
 await page.keyboard.press('Escape');await d.getByRole('heading',{name:'选择内容',exact:true}).waitFor();assert.deepEqual((await fx(page).calls()).slice(before),[])
 await page.locator('#fixture-import').evaluate((b:HTMLButtonElement)=>b.click());await d.getByRole('button',{name:'关闭导入窗口',exact:true}).click();await d.getByRole('heading',{name:'选择内容',exact:true}).waitFor();assert.equal(await cancels(page),0)
}))

test('IA-B02b: no source text promises that collapsing or stopping keeps the import',async()=>{
 for(const file of ['src/components/desktop/NovelImportDialog.tsx','src/components/desktop/NovelImportWizard.tsx'])assert.doesNotMatch(await readFile(file,'utf8'),/收起窗口|保留草稿|后台继续|后台结果/u,file)
})
