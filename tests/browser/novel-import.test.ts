import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { chromium, type Browser, type Page } from 'playwright-core'
import { verifyImportPopupPosition } from '../helpers/novel-import-css-check.mjs'

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
 page.setDefaultTimeout(6000);page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',async route=>{const file=new URL(route.request().url()).pathname.match(/^\/import-file-icons\/(text|markdown|word|pdf|html)\.svg$/);if(file)await route.fulfill({contentType:'image/svg+xml',body:await readFile(`public/import-file-icons/${file[1]}.svg`)});else await route.abort()})
 try{await page.setContent('<base href="https://novel-import.test/"><div id="app"></div>');await page.evaluate('globalThis.__name=target=>target');await page.addStyleTag({content:css});await page.addScriptTag({content:bundle});await page.evaluate(o=>(window as any).mountNovelImport(o),options);await page.getByRole('button',{name:'导入作品',exact:true}).click();if(!options.chooseError&&!options.deferredChoose)await page.getByRole('dialog').waitFor();await run(page);assert.deepEqual(errors,[])}finally{await page.close()}
}
const calls=(page:Page)=>page.evaluate(()=>(window as any).novelImportFixture.calls)

test('NI-U01: source inclusion, real file icons, order, complete paged text and manual range/encoding/chapter controls',()=>fixture({},async page=>{
 const dialog=page.getByRole('dialog');assert.equal(await dialog.locator('.ni-file-icon img').count(),3)
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('.ni-file-icon img')).every(img=>(img as HTMLImageElement).naturalWidth>0))
 await dialog.getByRole('checkbox',{name:'纳入 正文.txt',exact:true}).uncheck();assert.equal((await calls(page)).at(-1).type,'include')
 await dialog.getByRole('checkbox',{name:'纳入 正文.txt',exact:true}).check()
 await dialog.getByRole('button',{name:'上移 角色.md',exact:true}).click();assert.equal((await calls(page)).at(-1).type,'move')
 await dialog.getByRole('button',{name:'核对 正文.txt',exact:true}).click();await dialog.getByText('林舟十七岁，来到渡口。',{exact:false}).waitFor()
 await dialog.getByLabel('片段类别',{exact:true}).selectOption('character');await dialog.getByRole('button',{name:'确认片段分类',exact:true}).click();assert.equal((await calls(page)).filter((c:any)=>c.type==='set-range').at(-1).kind,'character')
 await dialog.getByLabel('文本编码',{exact:true}).selectOption('gb18030');await dialog.getByRole('button',{name:'应用编码',exact:true}).click();assert.equal((await calls(page)).filter((c:any)=>c.type==='set-encoding').at(-1).encoding,'gb18030')
 await dialog.getByRole('button',{name:'返回来源',exact:true}).click();await dialog.getByRole('button',{name:'核对卷章',exact:true}).click()
 await dialog.getByRole('button',{name:'确认卷章边界',exact:true}).click();assert.equal((await calls(page)).at(-1).type,'set-chapters')
}))
test('LOTM-L-V04: chapter editor submits explicit manual volume names and preserves them on reconfirmation',()=>fixture({},async page=>{
 const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'核对卷章',exact:true}).click()
 await dialog.getByLabel('第 1 章卷名',{exact:true}).fill('愚者');await dialog.getByRole('button',{name:'添加章节起点',exact:true}).click()
 await dialog.getByLabel('第 2 章标题',{exact:true}).fill('一个普通人的日常（一）');await dialog.getByLabel('第 2 章卷名',{exact:true}).fill('番外')
 await dialog.getByRole('button',{name:'确认卷章边界',exact:true}).click();let action=(await calls(page)).at(-1);assert.equal(action.type,'set-chapters');assert.deepEqual(action.cuts.map((c:any)=>c.volume),['愚者','番外'])
 await dialog.getByRole('button',{name:'核对卷章',exact:true}).click();assert.equal(await dialog.getByLabel('第 1 章卷名',{exact:true}).inputValue(),'愚者');assert.equal(await dialog.getByLabel('第 2 章卷名',{exact:true}).inputValue(),'番外');await dialog.getByRole('button',{name:'确认卷章边界',exact:true}).click();action=(await calls(page)).at(-1);assert.deepEqual(action.cuts.map((c:any)=>c.volume),['愚者','番外'])
}))
test('NI-U02: v4 ordinary source checkboxes, always expanded inference cards, independent selection and no-body eligibility',()=>fixture({phase:'select'},async page=>{
 assert.throws(()=>verifyImportPopupPosition('/* source header */\n[data-slot="dialog-content"].ni-dialog{transform:translate(-50%,-50%)}','regression'),/must reuse/)
 verifyImportPopupPosition(await readFile('src/components/desktop/novel-import.css','utf8'),'source')
 const d=page.getByRole('dialog');assert.equal(await d.locator('.ni-direct-options input').count(),13);assert.equal(await d.locator('.ni-target-card').count(),12)
 // Match the independent `translate` property supplied by the real shared Tailwind popup.
 await page.addStyleTag({content:'.desktop-dialog-surface{translate:-50% -50%}'})
 const productionBounds=await d.boundingBox();assert.ok(productionBounds&&productionBounds.x>=16&&productionBounds.y>=16&&productionBounds.x+productionBounds.width<=1280-16&&productionBounds.y+productionBounds.height<=800-16,JSON.stringify(productionBounds))
 assert.equal(await d.getByRole('button',{name:/展开补全|收起补全/}).count(),0)
 const card=d.locator('.ni-target-card:has(#ni-target-scene)');const rect=await card.boundingBox();await card.click({position:{x:rect!.width-4,y:rect!.height-4}});assert.equal(await d.locator('#ni-target-scene').isChecked(),false)
 await d.locator('#ni-source-character').uncheck();assert.equal(await d.locator('#ni-target-character').isChecked(),true)
 await d.locator('#ni-infer').uncheck();assert.equal(await d.locator('.ni-target-card').count(),12);assert.equal(await d.locator('.ni-target-card input:disabled').count(),12)
 await d.locator('#ni-infer').check();assert.equal(await d.locator('#ni-target-scene').isChecked(),false)
 await d.getByRole('button',{name:'查看正文来源',exact:true}).click();await d.getByRole('button',{name:'返回选择',exact:true}).click();assert.equal(await d.locator('#ni-target-scene').isChecked(),false)
 for(const [width,height,theme] of [[390,640,'paper'],[680,460,'ink']] as const){await page.setViewportSize({width,height});await page.evaluate(t=>document.documentElement.className=t,theme);const box=await d.boundingBox();assert.ok(box&&box.x>=8&&box.y>=8&&box.x+box.width<=width-8&&box.y+box.height<=height-8,JSON.stringify({box,width,height}));assert.equal(await d.evaluate(el=>el.scrollWidth<=el.clientWidth),true);assert.equal(await d.locator('.ni-target-card').first().evaluate(el=>getComputedStyle(el).cursor),'pointer')}
 await d.locator('#ni-source-body').uncheck();assert.equal(await d.locator('.ni-target-card').count(),0)
 await d.getByRole('button',{name:'返回来源',exact:true}).click();const sourceBounds=await d.boundingBox();assert.ok(sourceBounds&&sourceBounds.x>=16&&sourceBounds.y>=16&&sourceBounds.x+sourceBounds.width<=680-16&&sourceBounds.y+sourceBounds.height<=460-16,JSON.stringify(sourceBounds))
}))
test('NI-U03: classification consent precedes pending recognition; leaving recognition deletes the import, no-model local path',async()=>{await fixture({},async page=>{
 const d=page.getByRole('dialog');await d.getByRole('button',{name:'识别内容',exact:true}).click();assert.equal((await calls(page)).some((c:any)=>c.type==='classify'),false)
 await d.getByRole('button',{name:'允许识别',exact:true}).click();await d.getByRole('heading',{name:'内容识别中',exact:true}).waitFor();assert.equal(await d.locator('[aria-busy="true"]').count(),1)
 assert.equal(await d.getByRole('button',{name:'收起',exact:true}).count(),0);await page.evaluate(()=>(window as any).novelImportFixture.completeRecognition());await d.getByText('根据正文补全以下内容',{exact:true}).waitFor()
 await page.evaluate(()=>(window as any).novelImportFixture.set({phase:'failed',error:'请核对来源分类'}));await d.getByRole('button',{name:'返回核对来源',exact:true}).click();await d.getByRole('heading',{name:'核对来源',exact:true}).waitFor()
});await fixture({noModels:true},async page=>{const d=page.getByRole('dialog');await d.getByRole('button',{name:'识别内容',exact:true}).click();assert.equal(await d.getByRole('button',{name:'允许识别',exact:true}).isDisabled(),true);await d.getByRole('button',{name:'仅本地分类',exact:true}).click();assert.equal((await calls(page)).at(-1).mode,'local');assert.equal((await calls(page)).at(-1).consent,false);assert.equal(await d.getByRole('heading',{name:'内容识别中',exact:true}).count(),0)})})
test('NI-U04: title, isolated target and pinned model/range consent gate the real start action',async()=>{await fixture({phase:'select'},async page=>{
 const d=page.getByRole('dialog');await d.getByRole('button',{name:'继续',exact:true}).click();assert.equal(await d.getByRole('button',{name:'允许分析并导入',exact:true}).isDisabled(),true)
 const confirmationBounds=await d.boundingBox();assert.ok(confirmationBounds&&confirmationBounds.x>=16&&confirmationBounds.y>=16&&confirmationBounds.x+confirmationBounds.width<=1280-16&&confirmationBounds.y+confirmationBounds.height<=800-16,JSON.stringify(confirmationBounds))
 await d.getByRole('button',{name:'选择目录',exact:true}).click();await d.getByLabel('作品名称',{exact:true}).fill('');assert.equal(await d.getByRole('button',{name:'允许分析并导入',exact:true}).isDisabled(),true)
 await d.getByLabel('作品名称',{exact:true}).fill('新隔离作品');await d.getByRole('button',{name:'允许分析并导入',exact:true}).click()
 assert.equal((await calls(page)).at(-1).type,'start');assert.equal((await calls(page)).at(-1).consent,true)
 await page.evaluate(()=>(window as any).novelImportFixture.set({phase:'confirm',models:{},publication:{requestId:'frozen-request'},targetReady:false}));assert.equal(await d.getByLabel('作品名称',{exact:true}).isDisabled(),true);await d.getByRole('button',{name:'选择目录',exact:true}).click();await d.getByRole('button',{name:'继续保存原作品',exact:true}).click();assert.equal((await calls(page)).at(-1).type,'start');assert.equal((await calls(page)).at(-1).consent,false)
});await fixture({phase:'select',noModels:true,noBody:true},async page=>{const d=page.getByRole('dialog');assert.equal(await d.locator('.ni-target-card').count(),0);await d.getByRole('button',{name:'继续',exact:true}).click();await d.getByRole('button',{name:'选择目录',exact:true}).click();await d.getByRole('button',{name:'开始导入',exact:true}).click();assert.equal((await calls(page)).at(-1).type,'start');assert.equal((await calls(page)).at(-1).consent,false)});await fixture({phase:'select',deferredTitle:true},async page=>{const d=page.getByRole('dialog');await d.getByRole('button',{name:'继续',exact:true}).click();await d.getByLabel('作品名称',{exact:true}).fill('等待IPC保存的标题');await d.getByRole('button',{name:'选择目录',exact:true}).click();await page.waitForFunction(()=>(window as any).novelImportFixture.calls.some((call:any)=>call.type==='set-title'));assert.equal((await calls(page)).filter((call:any)=>call.type==='choose-target').length,0);await page.evaluate(()=>(window as any).novelImportFixture.releaseTitle());await page.waitForFunction(()=>(window as any).novelImportFixture.calls.some((call:any)=>call.type==='choose-target'));const commands=(await calls(page)).filter((call:any)=>call.type==='set-title'||call.type==='choose-target');assert.deepEqual(commands.map((call:any)=>call.type),['set-title','choose-target']);assert.equal(commands[0].title,'等待IPC保存的标题');assert.equal(commands[1].revision,commands[0].revision+1)})})
test('NI-U05/IA-B01: pause/resume, cancel deletes and the next import is new, completed close only hides',async()=>{await fixture({phase:'running'},async page=>{
 const d=page.getByRole('dialog');await page.evaluate(()=>(window as any).novelImportFixture.set({steps:[{key:'body',label:'拷贝正文',state:'done',completed:1,total:1}]}));await d.getByText('导入正文',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>(window as any).novelImportFixture.view().steps[0].label),'拷贝正文');await d.getByRole('button',{name:'暂停',exact:true}).click();assert.equal((await calls(page)).at(-1).type,'pause')
 await d.getByRole('button',{name:'继续导入',exact:true}).click();assert.equal((await calls(page)).at(-1).type,'resume')
 assert.equal(await d.getByRole('button',{name:'收起',exact:true}).count(),0);await d.getByRole('button',{name:'取消导入',exact:true}).click();await d.waitFor({state:'hidden'});assert.equal((await calls(page)).at(-1).type,'cancel');assert.equal(await page.evaluate(()=>(window as any).novelImportFixture.deleted()),true)
 await page.getByRole('button',{name:'导入作品',exact:true}).click();assert.equal((await calls(page)).at(-1).type,'choose');await d.waitFor();assert.equal(await page.evaluate(()=>(window as any).novelImportFixture.novelsInvalidated()),false);await page.evaluate(()=>(window as any).novelImportFixture.complete());await d.getByRole('heading',{name:'导入完成',exact:true}).waitFor();await page.waitForFunction(()=>(window as any).novelImportFixture.novelsInvalidated()===true);await page.keyboard.press('Escape');await d.waitFor({state:'hidden'})
 assert.equal((await calls(page)).filter((c:any)=>c.type==='cancel').length,1,'closing a completed import never deletes')
});await fixture({phase:'running'},async page=>{const d=page.getByRole('dialog');assert.equal(await page.evaluate(()=>(window as any).novelImportFixture.novelsInvalidated()),false);await page.evaluate(()=>(window as any).novelImportFixture.complete());await page.waitForFunction(()=>(window as any).novelImportFixture.novelsInvalidated()===true);await d.getByRole('heading',{name:'导入完成',exact:true}).waitFor()})})
test('NI-U06: conflict has no default; source explanation, setting confirmation, patch preview and selected second approval',()=>fixture({phase:'running',deferredPatch:true},async page=>{
 await page.evaluate(()=>(window as any).novelImportFixture.conflict());const d=page.getByRole('dialog')
 assert.equal(await d.locator('input[name="ni-decision"]:checked').count(),0)
 await d.getByRole('radio',{name:'坚持导入原设定',exact:true}).check();assert.equal(await d.getByRole('button',{name:'提交决定并复核',exact:true}).isDisabled(),true)
 await d.getByLabel('补充解释或依据',{exact:true}).fill('核对两处纪年')
 assert.equal(await d.getByRole('button',{name:'稍后处理',exact:true}).count(),0);assert.equal(await d.getByLabel('补充解释或依据',{exact:true}).inputValue(),'核对两处纪年')
 await d.getByRole('radio',{name:'使用正文推断的设定',exact:true}).check();assert.equal(await d.getByRole('button',{name:'提交决定并复核',exact:true}).isDisabled(),true);await d.getByRole('checkbox',{name:'确认采用此推断，提交后继续复核',exact:true}).check();assert.equal(await d.getByRole('button',{name:'提交决定并复核',exact:true}).isDisabled(),false)
 await d.getByRole('radio',{name:'保持原设定，但修改正文',exact:true}).check();await d.getByRole('button',{name:'查看正文修改',exact:true}).click()
 await d.getByText('正在生成正文修改提案，请稍候。',{exact:true}).waitFor();await page.evaluate(()=>(window as any).novelImportFixture.completePatches())
 assert.equal(await d.getByRole('button',{name:'确认修改导入副本',exact:true}).isDisabled(),true)
 await d.getByRole('checkbox',{name:'应用这一处修改',exact:true}).check();await d.getByRole('button',{name:'确认修改导入副本',exact:true}).click();assert.equal((await calls(page)).at(-1).type,'apply-patches')
 assert.equal(await d.getByRole('button',{name:'允许分析并导入',exact:true}).count(),1)
 await page.evaluate(()=>(window as any).novelImportFixture.conflict('source-source'));assert.equal(await d.getByRole('radio',{name:'保留来源 A',exact:true}).count(),1);assert.equal(await d.getByRole('radio',{name:'保持原设定，但修改正文',exact:true}).count(),0)
 await page.evaluate(()=>(window as any).novelImportFixture.conflict('body-body'));await d.getByRole('radio',{name:'保留正文并补充解释',exact:true}).waitFor();assert.equal(await d.getByRole('radio',{name:'使用正文推断的设定',exact:true}).count(),0);assert.equal(await d.getByRole('radio',{name:'修改正文导入副本',exact:true}).count(),1)
 await d.getByRole('button',{name:'重新确认分析范围',exact:true}).click();await d.getByRole('button',{name:'选择目录',exact:true}).click();await d.getByRole('button',{name:'允许分析并导入',exact:true}).click();await d.getByRole('heading',{name:'核对冲突',exact:true}).waitFor();assert.equal((await calls(page)).at(-1).consent,true)
}))
test('NI-U07: result opens original work tabs, original outline record pages and modal keyboard remain usable',async()=>{await fixture({phase:'running'},async page=>{
 await page.evaluate(()=>(window as any).novelImportFixture.complete());const d=page.getByRole('dialog');await d.getByRole('heading',{name:'导入完成',exact:true}).waitFor();await page.waitForFunction(()=>(window as any).novelImportFixture.novelsInvalidated()===true)
 for(let i=0;i<8;i++){await page.keyboard.press('Tab');await page.waitForFunction(()=>document.querySelector('[role="dialog"]')?.contains(document.activeElement))}
 await d.getByRole('button',{name:'查看导入记录',exact:true}).click();await page.getByText('原始大纲',{exact:true}).waitFor();await page.getByRole('button',{name:'原始大纲',exact:true}).click();await page.getByText('原始大纲全文，逐字保留。',{exact:true}).waitFor()
 await page.evaluate(()=>(window as any).novelImportFixture.set({publication:{requestId:'import-2',workId:'work-2',novelId:'different-novel'}}));await page.getByRole('button',{name:'原始大纲',exact:true}).waitFor();assert.equal(await page.evaluate(()=>(window as any).novelImportFixture.requests.filter((url:string)=>url.includes('/different-novel/')&&url.includes('material=')).length),0)
 await page.evaluate(()=>(window as any).novelImportFixture.set({publication:{requestId:'import-1',workId:'work-1',novelId:'isolated-novel'}}));await page.getByRole('button',{name:'原始大纲',exact:true}).waitFor()
 await page.getByRole('button',{name:'关闭导入记录',exact:true}).click();await d.getByRole('button',{name:'打开作品',exact:true}).click();assert.deepEqual(await page.evaluate(()=>(window as any).novelImportFixture.tabs().map((tab:any)=>({id:tab.id,type:tab.type,novelId:tab.novelId}))),[{id:'novel:isolated-novel',type:'novel',novelId:'isolated-novel'}])
});await fixture({phase:'running',longRecord:true},async page=>{await page.evaluate(()=>(window as any).novelImportFixture.complete());await page.getByRole('dialog').getByRole('button',{name:'查看导入记录',exact:true}).click();await page.getByRole('button',{name:'原始大纲',exact:true}).click();const d=page.getByRole('dialog');await d.locator('.ni-source-text').waitFor();await d.getByRole('button',{name:'下一页',exact:true}).click();await page.waitForFunction(()=>(window as any).novelImportFixture.requests.at(-1).includes('offset=32767'));await d.getByRole('button',{name:'下一页',exact:true}).click();await page.waitForFunction(()=>(window as any).novelImportFixture.requests.at(-1).includes('offset=65534'));await d.getByRole('button',{name:'上一页',exact:true}).click();await page.waitForFunction(()=>(window as any).novelImportFixture.requests.at(-1).includes('offset=32766'));assert.equal(await d.locator('.ni-source-text').evaluate(el=>el.textContent!.codePointAt(0)),0x1f58b);await d.getByRole('button',{name:'下一页',exact:true}).click();await page.waitForFunction(()=>(window as any).novelImportFixture.requests.at(-1).includes('offset=65533'))})})

// UP-04 only: controlled bridge validates real React intent, not native OS support.
test('NI-U08: unified source entry and append omit mode; Windows uses the same source entry',async()=>{
 await fixture({deferredChoose:true},async page=>{await page.getByRole('button',{name:'导入作品',exact:true}).click();assert.equal((await calls(page)).filter((call:any)=>call.type==='choose').length,1);await page.evaluate(()=>(window as any).novelImportFixture.releaseChoose());await page.getByRole('dialog').waitFor()})
 await fixture({chooseError:true},async page=>{await page.getByText('所选来源中没有可导入的文本文件，请重新选择',{exact:true}).waitFor();assert.equal(await page.getByRole('dialog').count(),0)})
 await fixture({},async page=>{const d=page.getByRole('dialog');assert.deepEqual((await calls(page)).find((call:any)=>call.type==='choose'),{type:'choose'});assert.equal(await d.getByRole('button',{name:'添加文件夹',exact:true}).count(),0);await d.getByRole('button',{name:'添加来源',exact:true}).click();assert.deepEqual((await calls(page)).at(-1),{type:'choose',append:true})})
 await fixture({platform:'win32'},async page=>{const d=page.getByRole('dialog');assert.equal(await d.getByRole('button',{name:'添加文件夹',exact:true}).count(),0);await d.getByRole('button',{name:'添加来源',exact:true}).click();assert.deepEqual((await calls(page)).at(-1),{type:'choose',append:true})})
})

// SR-UI: real React with a controlled bridge, not native picker/FS acceptance.
test('NI-U12: same-source reselection preserves the draft, exposes failures and never sends AI',async t=>{
 await t.test('per-file actions preserve source/selection/chapter identity and fit both themes',()=>fixture({},async page=>{
  const d=page.getByRole('dialog'),before=await page.evaluate(()=>(window as any).novelImportFixture.view())
  for(const name of ['正文.txt','角色.md','大纲.docx'])assert.equal(await d.getByRole('button',{name:'重新选择 '+name,exact:true}).count(),1)
  await d.getByRole('button',{name:'重新选择 角色.md',exact:true}).click()
  await page.waitForFunction(()=>(window as any).novelImportFixture.state().busy===0)
  const action=(await calls(page)).filter((c:any)=>c.type==='reselect-source').at(-1)
  assert.deepEqual(action,{type:'reselect-source',fileId:'f2',id:before.id,revision:before.revision})
  const after=await page.evaluate(()=>(window as any).novelImportFixture.view())
  for(const key of ['id','title','files','selected','targets','infer','chapters'])assert.deepEqual(after[key],before[key],key)
  assert.equal((await calls(page)).some((c:any)=>['classify','start','discard'].includes(c.type)),false)
  for(const theme of ['paper','ink']){
   await page.setViewportSize({width:390,height:640});await page.evaluate(v=>document.documentElement.className=v,theme)
   assert.equal(await d.evaluate(el=>el.scrollWidth<=el.clientWidth),true)
   const b=await d.getByRole('button',{name:'重新选择 正文.txt',exact:true}).boundingBox(),box=await d.boundingBox()
   assert.ok(b&&box&&b.x>=box.x&&b.x+b.width<=box.x+box.width,JSON.stringify({theme,b,box}))
  }
  await d.getByRole('button',{name:'核对 正文.txt',exact:true}).click();await d.getByText('林舟十七岁，来到渡口。',{exact:false}).waitFor()
  await d.getByRole('button',{name:'返回来源',exact:true}).click();await d.getByRole('button',{name:'重新选择 正文.txt',exact:true}).click()
  await page.waitForFunction(()=>(window as any).novelImportFixture.state().busy===0)
  await d.getByRole('button',{name:'核对 正文.txt',exact:true}).click();await d.getByText('林舟十七岁，来到渡口。',{exact:false}).waitFor()
 }))
 await t.test('native selection in progress disables actions without a duplicate mutation',()=>fixture({reselectMode:'deferred'},async page=>{
  const d=page.getByRole('dialog'),button=d.getByRole('button',{name:'重新选择 正文.txt',exact:true})
  await button.click();await page.waitForFunction(()=>(window as any).novelImportFixture.calls.some((c:any)=>c.type==='reselect-source'))
  assert.equal(await button.isDisabled(),true);assert.equal(await d.getByRole('button',{name:'添加来源',exact:true}).isDisabled(),true)
  assert.equal((await calls(page)).filter((c:any)=>c.type==='reselect-source').length,1)
  await page.evaluate(()=>(window as any).novelImportFixture.releaseReselect());await page.waitForFunction(()=>(window as any).novelImportFixture.state().busy===0)
  assert.equal(await button.isEnabled(),true);assert.equal((await calls(page)).some((c:any)=>['classify','start','discard'].includes(c.type)),false)
 }))
 for(const mode of ['cancel','error'])await t.test(mode+' keeps the same visible source draft',()=>fixture({reselectMode:mode},async page=>{
  const d=page.getByRole('dialog'),before=await page.evaluate(()=>(window as any).novelImportFixture.view())
  await d.getByRole('button',{name:'重新选择 正文.txt',exact:true}).click();await page.waitForFunction(()=>(window as any).novelImportFixture.state().busy===0)
  assert.deepEqual(await page.evaluate(()=>(window as any).novelImportFixture.view()),before)
  assert.equal(await d.getByRole('heading',{name:'核对来源',exact:true}).isVisible(),true)
  if(mode==='error')await d.getByText('所选文件与原来源不一致，原草稿保持不变',{exact:true}).waitFor()
  assert.equal((await calls(page)).some((c:any)=>['classify','start','discard'].includes(c.type)),false)
 }))
 await t.test('started import/publication/modified draft and unsupported files have no refresh action',()=>fixture({},async page=>{
  const d=page.getByRole('dialog');await d.getByRole('button',{name:'重新选择 正文.txt',exact:true}).waitFor()
  for(const state of [{steps:[{key:'body',label:'导入正文',state:'done',completed:1,total:1}]},{steps:[],publication:{requestId:'synthetic-started'}},{publication:undefined,modified:true}]){
   await page.evaluate(v=>(window as any).novelImportFixture.set(v),state)
   assert.equal(await d.getByRole('button',{name:/^重新选择 /}).count(),0)
  }
  const files=await page.evaluate(()=>(window as any).novelImportFixture.view().files)
  await page.evaluate(v=>(window as any).novelImportFixture.set({modified:false,files:v.map((f:any)=>({...f,format:'unsupported',hash:'',characters:0}))}),files)
  assert.equal(await d.getByRole('button',{name:/^重新选择 /}).count(),0)
 }))
})
/* docs/558 CC-30..CC-35: the wizard step-21 conflict screen. */
test('CC-30..CC-35: the step-21 conflict states what differs, offers three decisions and submits without a model review',()=>fixture({phase:'running'},async page=>{
 await page.evaluate(()=>(window as any).novelImportFixture.wizardConflict());const d=page.getByRole('dialog');
 await d.getByText('第 1 / 2 处矛盾',{exact:true}).waitFor()
 assert.match(await d.getByRole('heading',{level:3}).innerText(),/「灰雾空间」（金手指）的「触发条件」与正文说法不一致/)
 assert.match(await d.innerText(),/矛盾点：资料写需默念咒文，原文只写逆走四步/)
 assert.equal(await d.getByRole('heading',{name:'现在的设定',exact:true}).count(),1);assert.equal(await d.getByRole('heading',{name:'按正文应为',exact:true}).count(),1)
 assert.equal(await d.locator('del').first().innerText(),'并默念咒文')
 assert.match(await d.innerText(),/第一部 小丑 · 第一章 起/);assert.doesNotMatch(await d.innerText(),/working-|trigger|正文片段 A/)
 assert.equal(await d.locator('input[name="ni-decision"]:checked').count(),0)
 const confirm=d.getByRole('button',{name:'确认并处理下一处',exact:true});assert.equal(await confirm.isDisabled(),true)
 for(const name of ['以正文为准','保留现在的设定','自己填写这一项'])assert.equal(await d.getByRole('radio',{name:new RegExp(name)}).count(),1)
 await d.getByRole('radio',{name:/自己填写这一项/}).check();const box=d.getByLabel('填写这一项',{exact:true});assert.equal(await box.inputValue(),'逆走四步并默念咒文')
 await box.fill('');assert.equal(await confirm.isDisabled(),true);await box.fill('逆走四步');assert.equal(await confirm.isDisabled(),false)
 await d.getByRole('radio',{name:/保留现在的设定/}).check();await confirm.click()
 const last=(await calls(page)).at(-1);assert.equal(last.type,'resolve');assert.equal(last.choice,'source');assert.equal(last.explanation,undefined);assert.equal('mergedText' in last,false)
 assert.equal(await d.getByText('正在复核这项决定，请稍候。').count(),0)
 // CC-32: an unavailable decision is disabled with its reason.
 await page.evaluate(()=>(window as any).novelImportFixture.wizardConflict({total:1,choices:[{choice:'inferred',available:false,reason:'正文给出的值不是有效的角色类型'},{choice:'source',available:true},{choice:'merge',available:false,reason:'这一项有固定格式，不能直接填写'}]}))
 await d.getByRole('button',{name:'确认',exact:true}).waitFor()
 assert.equal(await d.getByRole('radio',{name:/以正文为准/}).isDisabled(),true);assert.match(await d.innerText(),/正文给出的值不是有效的角色类型/)
 // CC-35: back to the checks.
 await d.getByRole('button',{name:'返回校验',exact:true}).click();assert.equal(await d.getByText('第 1 / 1 处矛盾').count(),0)
}))
