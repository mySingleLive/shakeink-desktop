import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFile} from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
import {build} from 'esbuild'
import {chromium,type Browser,type Page} from 'playwright-core'
import type {} from '../helpers/novel-import-wizard-ui-fixture'

let browser:Browser,bundle:string,css:string
test.before(async()=>{
 const result=await build({entryPoints:['tests/helpers/novel-import-wizard-ui-fixture.tsx'],bundle:true,platform:'browser',format:'iife',write:false,tsconfig:'tsconfig.json',loader:{'.css':'empty'},logLevel:'silent'});bundle=result.outputFiles[0].text
 css=await readFile('design/assets/web-tokens.css','utf8')+'\n.desktop-dialog-surface{translate:-50% -50%}\n'+await readFile('src/components/desktop/novel-import.css','utf8')
 browser=await chromium.launch({headless:true,executablePath:process.env.SHAKEINK_TEST_CHROMIUM??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'})
})
test.after(async()=>{await browser?.close()})
async function mount(options:Record<string,unknown>,run:(page:Page)=>Promise<void>,view={width:1280,height:800},motion:'reduce'|'no-preference'='reduce'){
 const page=await browser.newPage({viewport:view,reducedMotion:motion}),errors:string[]=[]
 page.setDefaultTimeout(6000);page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>route.abort())
 try{await page.setContent('<div id="app"></div>');await page.evaluate('globalThis.__name=t=>t');await page.addStyleTag({content:css});await page.addScriptTag({content:bundle});await page.evaluate(o=>window.mountWizard(o as never),options);await page.getByRole('dialog').waitFor();await run(page);assert.deepEqual(errors,[])}finally{await page.close()}
}
const calls=(page:Page)=>page.evaluate(()=>window.wizardFixture.calls) as Promise<{type:string;[k:string]:unknown}[]>
const dialog=(page:Page)=>page.locator('.ni-dialog')
const closeConfirmation=(page:Page)=>page.getByRole('dialog',{name:'关闭导入？',exact:true})
const businessCalls=async(page:Page)=>(await calls(page)).filter(call=>call.type!=='current')
const idle=(page:Page)=>page.waitForFunction(()=>window.wizardFixture.state().busy===0)
async function waitAction(page:Page,type:string,count=1){
 try{await page.waitForFunction(({type,count})=>window.wizardFixture.calls.filter(call=>call.type===type).length>=count,{type,count})}
 catch(error){const state=await page.evaluate(()=>({calls:window.wizardFixture.calls,view:window.wizardFixture.view(),state:window.wizardFixture.state()}));throw Error(`等待 ${type} 第 ${count} 次动作失败：${JSON.stringify(state)}`,{cause:error})}
}

for(const reselect of [false,true])test(`NIW-B01: edited title is saved before ${reselect?'reselecting':'the first directory selection'}`,()=>mount({step:'work',deferredTitle:true},async page=>{
 const d=dialog(page);if(reselect)await page.evaluate(()=>window.wizardFixture.set(v=>{v.targetLabel='已选目录 A';v.targetReady=true}))
 await idle(page);const revision=await page.evaluate(()=>window.wizardFixture.view().revision),button=d.getByRole('button',{name:'选择目录',exact:true})
 await d.getByLabel('作品名称',{exact:true}).fill('隔离新标题');await button.click();await waitAction(page,'set-title')
 assert.equal((await businessCalls(page)).some(call=>call.type==='choose-target'),false);assert.equal(await button.isDisabled(),true)
 await page.evaluate(()=>window.wizardFixture.releaseTitle());await waitAction(page,'choose-target')
 await page.waitForFunction(revision=>window.wizardFixture.state().busy===0&&window.wizardFixture.view().revision===revision+2&&window.wizardFixture.view().targetLabel==='作品目录',revision)
 const actions=await businessCalls(page);assert.deepEqual(actions.map(call=>call.type),['set-title','choose-target']);assert.deepEqual(actions.map(call=>call.revision),[revision,revision+1])
 assert.equal(await d.getByLabel('作品名称',{exact:true}).inputValue(),'隔离新标题');assert.equal(await button.isDisabled(),false)
}))

test('NIW-B01: unchanged title supports success, reselection, cancellation and another selection',()=>mount({step:'work',targetReplies:[{kind:'success',label:'隔离目录 A'},{kind:'success',label:'隔离目录 B'},{kind:'cancel'},{kind:'success',label:'隔离目录 C'}]},async page=>{
 const d=dialog(page),button=d.getByRole('button',{name:'选择目录',exact:true}),initial=await page.evaluate(()=>window.wizardFixture.view().revision)
 for(const [index,label] of ['隔离目录 A','隔离目录 B','隔离目录 B','隔离目录 C'].entries()){
  await button.click();await page.waitForFunction(({revision,label})=>window.wizardFixture.state().busy===0&&window.wizardFixture.view().revision===revision&&window.wizardFixture.view().targetLabel===label,{revision:initial+index+1,label})
  assert.equal(await button.isDisabled(),false)
 }
 const actions=await businessCalls(page);assert.deepEqual(actions.map(call=>call.type),Array(4).fill('choose-target'));assert.deepEqual(actions.map(call=>call.revision),[initial,initial+1,initial+2,initial+3])
}))

test('NIW-B01: a failed title save blocks directory selection and can be retried',()=>mount({step:'work',titleFailures:1},async page=>{
 const d=dialog(page),button=d.getByRole('button',{name:'选择目录',exact:true}),initial=await page.evaluate(()=>window.wizardFixture.view().revision)
 await d.getByLabel('作品名称',{exact:true}).fill('隔离重试标题');await button.click();await d.getByText('隔离标题保存失败',{exact:true}).waitFor();await idle(page)
 let actions=await businessCalls(page);assert.deepEqual(actions.map(call=>call.type),['set-title']);assert.equal(actions[0].revision,initial)
 await button.click();await waitAction(page,'choose-target');await page.waitForFunction(revision=>window.wizardFixture.state().busy===0&&window.wizardFixture.state().error===null&&window.wizardFixture.view().revision===revision+2,initial)
 actions=await businessCalls(page);assert.deepEqual(actions.map(call=>call.type),['set-title','set-title','choose-target']);assert.deepEqual(actions.map(call=>call.revision),[initial,initial,initial+1])
}))

test('NIW-B01: continue shares the successful title-save gate',()=>mount({step:'work',deferredTitle:true},async page=>{
 const d=dialog(page);await page.evaluate(()=>window.wizardFixture.set(v=>{v.targetLabel='隔离目录 A';v.targetReady=true}));await idle(page)
 const initial=await page.evaluate(()=>window.wizardFixture.view().revision);await d.getByLabel('作品名称',{exact:true}).fill('隔离继续标题');await d.getByRole('button',{name:'继续',exact:true}).click();await waitAction(page,'set-title')
 assert.equal((await businessCalls(page)).some(call=>call.type==='wizard-next'),false);await page.evaluate(()=>window.wizardFixture.releaseTitle());await waitAction(page,'wizard-next')
 await page.waitForFunction(revision=>window.wizardFixture.state().busy===0&&window.wizardFixture.view().revision===revision+2,initial)
 const actions=await businessCalls(page);assert.deepEqual(actions.map(call=>call.type),['set-title','wizard-next']);assert.deepEqual(actions.map(call=>call.revision),[initial,initial+1])
}))

test('NIW-B01: continue is blocked when the title save fails',()=>mount({step:'work',titleFailures:1},async page=>{
 const d=dialog(page);await page.evaluate(()=>window.wizardFixture.set(v=>{v.targetLabel='隔离目录 A';v.targetReady=true}));await idle(page)
 await d.getByLabel('作品名称',{exact:true}).fill('隔离失败标题');await d.getByRole('button',{name:'继续',exact:true}).click();await d.getByText('隔离标题保存失败',{exact:true}).waitFor();await idle(page)
 const actions=await businessCalls(page);assert.deepEqual(actions.map(call=>call.type),['set-title']);assert.equal((await calls(page)).some(call=>call.type==='wizard-next'),false)
}))

test('NIW-B01: back shares the successful title-save gate',()=>mount({step:'work',deferredTitle:true},async page=>{
 const d=dialog(page);await idle(page);const initial=await page.evaluate(()=>window.wizardFixture.view().revision)
 await d.getByLabel('作品名称',{exact:true}).fill('隔离返回标题');await d.getByRole('button',{name:'上一步',exact:true}).click();await waitAction(page,'set-title')
 assert.equal((await businessCalls(page)).some(call=>call.type==='wizard-back'),false);await page.evaluate(()=>window.wizardFixture.releaseTitle());await waitAction(page,'wizard-back')
 await page.waitForFunction(revision=>window.wizardFixture.state().busy===0&&window.wizardFixture.view().revision===revision+2,initial)
 const actions=await businessCalls(page);assert.deepEqual(actions.map(call=>call.type),['set-title','wizard-back']);assert.deepEqual(actions.map(call=>call.revision),[initial,initial+1])
}))

test('NIW-B01: back is blocked by a failed title save and preserves the draft for retry',()=>mount({step:'work',titleFailures:1},async page=>{
 const d=dialog(page),button=d.getByRole('button',{name:'上一步',exact:true});await idle(page);const initial=await page.evaluate(()=>window.wizardFixture.view().revision)
 await d.getByLabel('作品名称',{exact:true}).fill('隔离返回重试标题');await button.click();await d.getByText('隔离标题保存失败',{exact:true}).waitFor();await idle(page)
 let actions=await businessCalls(page);assert.deepEqual(actions.map(call=>call.type),['set-title']);assert.equal(await d.getByLabel('作品名称',{exact:true}).inputValue(),'隔离返回重试标题')
 await button.click();await waitAction(page,'wizard-back');await page.waitForFunction(revision=>window.wizardFixture.state().busy===0&&window.wizardFixture.view().revision===revision+2,initial)
 actions=await businessCalls(page);assert.deepEqual(actions.map(call=>call.type),['set-title','set-title','wizard-back']);assert.deepEqual(actions.map(call=>call.revision),[initial,initial,initial+1])
}))

test('NIW-B01: an in-flight directory picker suppresses duplicate clicks but not a later deliberate selection',async()=>{
 for(const first of [{kind:'success',label:'隔离目录 A'},{kind:'cancel'}])await mount({step:'work',deferredTarget:true,targetReplies:[first,{kind:'success',label:'隔离目录 C'}]},async page=>{
  const d=dialog(page),button=d.getByRole('button',{name:'选择目录',exact:true}),initial=await page.evaluate(()=>window.wizardFixture.view().revision)
  await idle(page);await button.click();await waitAction(page,'choose-target');assert.equal(await button.isDisabled(),true)
  const box=await button.boundingBox();assert.ok(box);await page.mouse.click(box.x+box.width/2,box.y+box.height/2);await page.evaluate(()=>window.wizardFixture.releaseTarget())
  await page.waitForFunction(revision=>window.wizardFixture.state().busy===0&&window.wizardFixture.view().revision===revision+1,initial);assert.equal((await businessCalls(page)).filter(call=>call.type==='choose-target').length,1)
  await button.click();await waitAction(page,'choose-target',2);await page.evaluate(()=>window.wizardFixture.releaseTarget());await page.waitForFunction(revision=>window.wizardFixture.state().busy===0&&window.wizardFixture.view().revision===revision+2,initial)
  const actions=(await businessCalls(page)).filter(call=>call.type==='choose-target');assert.equal(actions.length,2);assert.deepEqual(actions.map(call=>call.revision),[initial,initial+1]);assert.equal(await page.evaluate(()=>window.wizardFixture.view().targetLabel),'隔离目录 C')
 })
})

test('NIW-B01/B03: step titles; files show automatic encoding without a confirm button',()=>mount({step:'files'},async page=>{
 const d=dialog(page);await d.getByRole('heading',{name:'确认文件'}).waitFor()
 assert.match(await d.innerText(),/GB18030（自动识别）/);assert.equal(await d.getByRole('button',{name:'确认编码'}).count(),0)
 await d.getByRole('button',{name:'编码不对？'}).click();const select=d.getByRole('combobox',{name:'正文.txt 编码'});assert.deepEqual(await select.locator('option').allInnerTexts(),['UTF-8','UTF-16LE','UTF-16BE','GB18030'])
}))
test('NIW-B01: the files step has no verbatim-copy notice',()=>mount({step:'files'},async page=>{
 const d=dialog(page);await d.getByRole('heading',{name:'确认文件'}).waitFor();const text=await d.innerText()
 assert.doesNotMatch(text,/正文逐字拷贝|来源文件不会被修改|编码按文件内容自动识别/u);assert.equal(await d.locator('.ni-notice').count(),0)
}))
test('NIW-B01: the wizard opens with a waiting state as soon as the picker closes',()=>mount({step:'files',choosing:true},async page=>{
 const d=dialog(page);await d.getByRole('heading',{name:'确认文件'}).waitFor()
 const status=d.getByRole('status');await status.getByText('正在读取文件',{exact:true}).waitFor();assert.equal(await status.getAttribute('aria-busy'),'true')
 assert.equal(await d.locator('.ni-spinner').count(),1);assert.equal(await d.getByRole('button',{name:'继续'}).isDisabled(),true);assert.equal(await d.getByText('正文.txt').count(),0)
 await page.evaluate(()=>window.wizardFixture.releaseChoose())
 await d.getByText('正文.txt',{exact:true}).waitFor();await idle(page)
 assert.equal(await d.getByText('正在读取文件').count(),0);assert.equal(await d.getByRole('button',{name:'继续'}).isDisabled(),false);assert.equal(await page.getByRole('dialog').count(),1)
}))
test('NIW-B01: step 3 needs a folder before continuing',()=>mount({step:'work'},async page=>{
 const d=dialog(page);await d.getByRole('heading',{name:'作品与目录'}).waitFor();assert.equal(await d.getByRole('button',{name:'继续'}).isDisabled(),true)
}))
test('NIW-B02: step rail and stage bar',()=>mount({step:'import-char',phase:'running'},async page=>{
 const d=dialog(page);await d.getByRole('button',{name:/第 10 \/ 22 步 · 导入角色/}).click()
 const items=d.locator('.ni-w-steps li');assert.equal(await items.count(),22);assert.match(await items.nth(0).innerText(),/已完成/)
 assert.equal(await d.locator('.ni-w-stages li').count(),6);assert.equal(await d.locator('.ni-w-stages li[aria-current=step]').innerText().then(t=>t.includes('角色')),true)
}))
test('LP-13: steps 17–20 sit under the 剧情 stage; no 线索 label remains',()=>mount({step:'worldline',phase:'running'},async page=>{
 const d=dialog(page),current=await d.locator('.ni-w-stages li[aria-current=step]').innerText()
 assert.match(current,/剧情/u);assert.doesNotMatch(await d.locator('.ni-w-stages').innerText(),/线索/u)
 assert.match(await d.locator('.ni-w-stage-now').innerText(),/阶段 5 \/ 6 · 剧情 · /u)
}))
test('NIW-B02: narrow window shows a one-line stage summary',()=>mount({step:'import-char',phase:'running'},async page=>{
 const d=dialog(page);assert.equal(await d.locator('.ni-w-stages').isVisible(),false);assert.match(await d.locator('.ni-w-stage-now').innerText(),/阶段 3 \/ 6 · 角色 · 场景 · 物品 · 第 10 \/ 22 步/)
},{width:390,height:700}))
test('NIW-B04: chapter tree tri-state, counts, search scope and consent button',()=>mount({step:'tree'},async page=>{
 const d=dialog(page);assert.ok((await d.getByRole('checkbox',{name:/^选择 第/}).evaluateAll(e=>e.every(x=>(x as HTMLInputElement).checked))))
 await d.getByRole('checkbox',{name:'选择 第一章 再起'}).click();const last=(await calls(page)).at(-1)!;assert.equal(last.type,'wizard-select-chapters');assert.equal((last.indices as number[]).length,10)
 await page.evaluate(()=>window.wizardFixture.set(v=>{v.wizard!.chapterSelection=v.wizard!.chapterSelection!.filter(i=>i!==3)}))
 assert.equal(await d.getByRole('checkbox',{name:'选择 乙卷'}).evaluate(e=>(e as HTMLInputElement).indeterminate),true)
 assert.match(await d.innerText(),/2 \/ 3 章/);assert.match(await d.innerText(),/已选 10 \/ 11 章 · 4 卷/)
 await d.getByRole('textbox',{name:'搜索章名'}).fill('再');await d.getByRole('checkbox',{name:'选择匹配的章节：乙卷'}).click()
 const scoped=(await calls(page)).at(-1)!;assert.ok([3,4,5].every(i=>(scoped.indices as number[]).includes(i)))
 assert.match(await d.innerText(),/发送范围/);assert.match(await d.innerText(),/受控文本模型/);await d.getByRole('button',{name:'允许分析并导入'}).waitFor()
 await page.evaluate(()=>window.wizardFixture.set(v=>{v.wizard!.chapterSelection=[]}));assert.equal(await d.getByRole('button',{name:'允许分析并导入'}).isDisabled(),true);assert.match(await d.innerText(),/请至少选择一章/)
}))
test('NIW-B05: character rows show only name and type; details and role editing',()=>mount({step:'detect-char'},async page=>{
 const d=dialog(page),row=d.locator('.ni-w-list .ni-w-node').first()
 assert.ok(!/章|资料/u.test(await row.innerText()));assert.match(await d.innerText(),/已选 3 \/ 3/)
 await d.getByRole('button',{name:'详情'}).first().click();assert.match(await d.innerText(),/别名：砚哥 · 出场 3 章 · 来源：资料 \+ 正文/)
 await d.getByRole('button',{name:'林舟：配角，点击修改类型'}).click();await d.getByRole('combobox',{name:'林舟 类型'}).selectOption('ANTAGONIST')
 const set=(await calls(page)).at(-1)!;assert.equal(set.type,'wizard-set-role');assert.equal(set.roleType,'ANTAGONIST')
 assert.equal(await row.getByRole('checkbox').count(),1,'one selection checkbox per row');assert.equal(await d.getByRole('button',{name:'合并为同一角色'}).count(),0)
 const into=d.getByRole('combobox',{name:/^将 .+ 合并到$/}).first(),merge=d.getByRole('button',{name:'合并',exact:true}).first()
 assert.equal(await merge.isDisabled(),true);const target=await into.locator('option').nth(1).getAttribute('value');await into.selectOption(target!);await merge.click()
 const merged=(await calls(page)).at(-1)!;assert.equal(merged.type,'wizard-merge-candidates');assert.equal(merged.keepId,target);assert.equal((merged.mergeIds as string[]).length,1);assert.notEqual((merged.mergeIds as string[])[0],target)
}))
test('NIW-B06: image options default unchecked, change the button and need an image model',()=>mount({step:'detect-char'},async page=>{
 const d=dialog(page),avatar=d.getByRole('checkbox',{name:'生成头像'}),portrait=d.getByRole('checkbox',{name:'生成立绘'})
 assert.equal(await avatar.isChecked(),false);assert.equal(await portrait.isChecked(),false);assert.match(await d.innerText(),/受控图像模型/)
 await avatar.click();await portrait.click();assert.equal((await calls(page)).filter(c=>c.type==='wizard-set-images').length,2)
 await page.evaluate(()=>window.wizardFixture.set(v=>{v.wizard!.images.avatar=true;v.wizard!.images.portrait=true}))
 await d.getByRole('button',{name:'导入 3 个角色并生成头像与立绘'}).click();const next=(await calls(page)).at(-1)!;assert.equal(next.type,'wizard-next');assert.equal(next.imageConsent,true)
}))
test('NIW-B06: without an image model the options are disabled',()=>mount({step:'detect-scene',noImageModel:true},async page=>{
 const d=dialog(page);assert.equal(await d.getByRole('checkbox',{name:'生成外景图'}).isDisabled(),true);assert.equal(await d.getByRole('checkbox',{name:'生成内景图'}).isDisabled(),true);await d.getByRole('button',{name:'配置模型'}).waitFor()
}))
test('NIW-B07: task cards with checkmarks, failures, image chips and progress',()=>mount({step:'import-char',phase:'running',failing:true},async page=>{
 const d=dialog(page),done=d.locator('.ni-w-ent[data-s=done]').first()
 assert.equal(await done.locator('.ni-w-ok').count()>0,true);assert.match(await done.innerText(),/已完成/)
 await d.locator('.ni-w-ent[data-s=failed]').getByRole('button',{name:'重试'}).waitFor();await d.locator('.ni-w-ent[data-s=failed]').getByRole('button',{name:'跳过'}).waitFor()
 assert.match(await d.locator('#ni-w-live').innerText(),/已完成 1 \/ 3 · 头像 1 \/ 3 · 1 项失败/)
 await d.getByRole('button',{name:'跳过失败项并继续（1）'}).click();assert.equal((await calls(page)).at(-1)!.op,'skip-failed')
 assert.equal(await d.getByRole('progressbar').getAttribute('aria-valuenow'),'2')
 await page.waitForFunction(()=>!!document.querySelector('.ni-w-chip[data-s=done] img'))
}))
test('NIW-B08: the world tree nests child worlds and cascades selection',()=>mount({step:'detect-world'},async page=>{
 const d=dialog(page),parent=d.locator('li',{has:page.getByRole('checkbox',{name:'选择 北城世界 及其下全部设定'})}).first()
 assert.equal(await parent.getByRole('checkbox',{name:'选择 南巷梦境 及其下全部设定'}).count(),1)
 await d.getByRole('checkbox',{name:'选择 北城世界 及其下全部设定'}).click();const sent=(await calls(page)).at(-1)!;assert.equal(sent.type,'wizard-select-candidates');assert.equal(sent.selected,false)
 await page.evaluate(()=>window.wizardFixture.set(v=>{const c=v.wizard!.candidates.world!.find(c=>c.name==='梦俗')!;c.selected=false}))
 assert.equal(await d.getByRole('checkbox',{name:'选择 北城世界 及其下全部设定'}).evaluate(e=>(e as HTMLInputElement).indeterminate),true)
}))
test('WU-01/WU-02: world cards and tree rows show their setting type with a distinct icon',()=>mount({step:'import-world'},async page=>{
 const d=dialog(page),card=(n:string)=>d.locator('.ni-w-ent',{hasText:n}).first()
 const icon=(n:string)=>card(n).locator('.ni-w-quill svg').getAttribute('class')
 for(const [n,tag] of [['北城世界','世界'],['城制','社会环境'],['山川','地理'],['梦俗','人文环境']] as const)assert.equal(await card(n).locator('.ni-w-tag').innerText(),tag,n)
 const classes=await Promise.all(['北城世界','城制','山川','梦俗'].map(icon));assert.equal(new Set(classes).size,4,classes.join(' | '))
 assert.match(await card('主题').locator('.ni-w-quill svg').getAttribute('class')??'',/sparkles/)
 // All nine setting types and the world itself have different icons (507 WU-01).
 const types=['LEVEL_SYSTEM','POWER_SYSTEM','CONCEPT','FACTION','MAP','SOCIETY','CULTURE','GEOGRAPHY','WORLD_HISTORY']
 await page.evaluate(t=>window.wizardFixture.set(v=>{const w=v.wizard!,base=w.candidates.world![1];w.candidates.world=[w.candidates.world![0],...t.map((settingType,k)=>({...base,id:'ws-'+String(k).padStart(16,'0'),name:'类型'+k,settingType:settingType as typeof base.settingType}))];w.tasks=w.candidates.world!.map((c,k)=>({id:'e-'+String(k).padStart(16,'0'),kind:'entity' as const,candidateId:c.id,state:'waiting' as const,attempts:0}))}),types)
 const all=await Promise.all(['北城世界',...types.map((_,k)=>'类型'+k)].map(icon));assert.equal(new Set(all).size,10,all.join(' | '))
}))
test('WU-02: the world tree puts a type icon before each setting tag',()=>mount({step:'detect-world'},async page=>{
 const d=dialog(page),rows=d.locator('.ni-w-tree .ni-w-node:has(.ni-w-tag)')
 assert.ok(await rows.count()>=3);for(let k=0;k<await rows.count();k++)assert.equal(await rows.nth(k).locator('svg.ni-w-type').count(),1)
}))
test('NIW-B10: verify lists checks, blocks saving on problems and shows skipped items',()=>mount({step:'verify',checksBad:true},async page=>{
 const d=dialog(page);assert.equal(await d.locator('.ni-w-checks li').count(),8);await d.getByRole('button',{name:'重试导入角色'}).waitFor()
 assert.equal(await d.getByRole('button',{name:'保存作品'}).isDisabled(),true);assert.match(await d.innerText(),/已跳过 2 项/);assert.match(await d.innerText(),/林舟的头像/)
}))
test('SU-01: verify shows other-setting repairs only when recorded (docs/515)',async()=>{
 await mount({step:'verify',linesDropped:true},async page=>{const text=await dialog(page).innerText();assert.match(text,/部分剧情关联已修正/);assert.match(text,/叙事线：丢弃 3 个无法对应已导入实体的关联/);assert.doesNotMatch(text,/部分设定条目已修正/)})
 await mount({step:'verify',settingsDropped:true},async page=>{const text=await dialog(page).innerText();assert.match(text,/部分设定条目已修正/);assert.match(text,/主题：丢弃 2 条无法定位的原文引文/);assert.doesNotMatch(text,/南巷：/)})
 await mount({step:'verify'},async page=>{assert.doesNotMatch(await dialog(page).innerText(),/部分设定条目已修正/)})
})
test('NIW-B12/B13/IA-B03: pause text, the revise list, and stopping deletes without a second prompt',()=>mount({step:'import-char',phase:'paused'},async page=>{
 const d=dialog(page);assert.match(await d.locator('#ni-w-live').innerText(),/^已暂停 · /);await d.getByRole('button',{name:'继续导入'}).waitFor()
 await d.getByRole('button',{name:'返回修改选择'}).click();assert.match(await d.innerText(),/第 9 步 · 识别角色/);assert.match(await d.innerText(),/将丢弃第 10 步的结果/)
 await d.getByRole('button',{name:'取消'}).click();assert.equal(await d.getByRole('button',{name:'收起'}).count(),0);assert.doesNotMatch(await d.innerText(),/后台继续/)
 await d.getByRole('button',{name:'停止导入'}).click();await d.waitFor({state:'hidden'})
 const after=await calls(page);assert.equal(after.at(-1)!.type,'cancel');assert.equal(after.some(c=>c.type==='discard'),false);assert.equal(await page.locator('.ni-task-button').count(),0)
}))
test('NIW-B14: recognition failure and empty roster screens',async()=>{
 await mount({step:'detect-char',recognitionFailed:true},async page=>{const d=dialog(page);assert.match(await d.getByRole('alert').innerText(),/识别失败/);await d.getByRole('button',{name:'重新识别'}).waitFor();await d.getByRole('button',{name:'跳过此步骤'}).waitFor()})
 await mount({step:'detect-char',empty:true},async page=>{const d=dialog(page);assert.match(await d.innerText(),/未识别到角色/);await d.getByRole('button',{name:'跳过'}).waitFor()})
})
test('NICC-B01: closing during setup still deletes directly',()=>mount({step:'files'},async page=>{
 await dialog(page).getByRole('button',{name:'关闭导入窗口',exact:true}).click();await dialog(page).waitFor({state:'hidden'})
 assert.equal(await closeConfirmation(page).count(),0);assert.deepEqual((await businessCalls(page)).map(c=>c.type),['cancel'])
}))
test('NICC-B02: closing a running wizard traps focus in the warning and can continue safely',()=>mount({step:'import-char',phase:'running'},async page=>{
 const d=dialog(page),c=closeConfirmation(page),close=()=>d.getByRole('button',{name:'关闭导入窗口',exact:true}).click()
 await close();await c.waitFor();assert.match(await c.innerText(),/已导入的内容会被删除/);assert.match(await c.innerText(),/原始文件不会更改/)
 assert.equal(await page.locator('[data-slot="dialog-content"]').count(),2);assert.equal(await page.locator('[data-slot="dialog-overlay"]').count(),1);assert.equal((await businessCalls(page)).filter(x=>x.type==='cancel').length,0)
 for(const key of ['Tab','Tab','Shift+Tab','Shift+Tab']){await page.keyboard.press(key);const focus=await page.evaluate(()=>{const active=document.activeElement as HTMLElement;return{inside:document.querySelector('.ni-close-confirm')!.contains(active)||active.hasAttribute('data-base-ui-focus-guard'),active:active?.outerHTML}});assert.equal(focus.inside,true,key+': '+focus.active)}
 await c.getByRole('button',{name:'继续导入',exact:true}).click();await c.waitFor({state:'hidden'});assert.equal(await d.isVisible(),true);assert.equal(await d.evaluate((node)=>node.contains(document.activeElement)),true)
 await page.keyboard.press('Escape');await c.waitFor();await page.keyboard.press('Escape');await c.waitFor({state:'hidden'});assert.equal(await d.isVisible(),true);assert.equal((await businessCalls(page)).filter(x=>x.type==='cancel').length,0)
 await close();await c.waitFor();await page.mouse.click(8,8);await page.waitForTimeout(100);assert.equal(await c.isVisible(),true);assert.equal((await businessCalls(page)).filter(x=>x.type==='cancel').length,0)
 await c.getByRole('button',{name:'继续导入',exact:true}).click();await c.waitFor({state:'hidden'});assert.equal(await d.isVisible(),true);assert.equal(await d.evaluate((node)=>node.contains(document.activeElement)),true)
}))
test('NICC-B03/NIW-B15: a partially imported wizard confirms before Esc deletes it',()=>mount({step:'import-char',phase:'select'},async page=>{
 const d=dialog(page),c=closeConfirmation(page);await page.keyboard.press('Escape');await c.waitFor();assert.equal((await businessCalls(page)).filter(x=>x.type==='cancel').length,0)
 await c.getByRole('button',{name:'确认关闭并删除',exact:true}).click();await c.waitFor({state:'hidden'});await d.waitFor({state:'hidden'})
 assert.equal((await businessCalls(page)).filter(x=>x.type==='cancel').length,1);assert.equal(await page.locator('.ni-task-button').count(),0)
}))
test('NICC-B04: a deferred deletion ignores repeated confirmation, Escape and backdrop',()=>mount({step:'import-char',phase:'running',deferredCancel:true},async page=>{
 const d=dialog(page),c=closeConfirmation(page);await d.getByRole('button',{name:'关闭导入窗口',exact:true}).click();const confirm=c.getByRole('button',{name:'确认关闭并删除',exact:true})
 await confirm.evaluate((button:HTMLButtonElement)=>{button.click();button.click()});await waitAction(page,'cancel');await page.waitForFunction(()=>window.wizardFixture.state().busy>0)
 assert.equal(await confirm.isDisabled(),true);assert.equal(await c.getByRole('button',{name:'继续导入',exact:true}).isDisabled(),true)
 await confirm.dispatchEvent('click');await page.keyboard.press('Escape');await page.mouse.click(8,8);assert.equal((await businessCalls(page)).filter(x=>x.type==='cancel').length,1);assert.equal(await c.isVisible(),true);assert.equal(await d.isVisible(),true)
 await page.evaluate(()=>window.wizardFixture.releaseCancel());await c.waitFor({state:'hidden'});await d.waitFor({state:'hidden'});assert.equal((await businessCalls(page)).filter(x=>x.type==='cancel').length,1)
}))
test('NICC-B05/IA-B03: explicit stop during recognition still deletes without a warning',()=>mount({step:'detect-char',phase:'running'},async page=>{
 const d=dialog(page);await d.getByRole('button',{name:'停止导入',exact:true}).click();await d.waitFor({state:'hidden'});assert.equal(await closeConfirmation(page).count(),0);assert.deepEqual((await businessCalls(page)).map(x=>x.type),['cancel'])
}))
test('NIW-B16: focus stays on a toggled chapter checkbox',()=>mount({step:'tree'},async page=>{
 const box=dialog(page).getByRole('checkbox',{name:'选择 第三章 转'});await box.focus();await page.keyboard.press('Space')
 await page.evaluate(()=>window.wizardFixture.set(v=>{v.wizard!.chapterSelection=v.wizard!.chapterSelection!.filter(i=>i!==2)}))
 assert.equal(await page.evaluate(()=>(document.activeElement as HTMLElement).getAttribute('aria-label')),'选择 第三章 转')
}))
test('NIW-B17: search waits for IME composition to end',()=>mount({step:'detect-char'},async page=>{
 const box=dialog(page).getByRole('textbox',{name:'搜索名称或别名'})
 await box.dispatchEvent('compositionstart');await box.fill('林');assert.equal(await dialog(page).locator('.ni-w-list .ni-w-node').count(),3)
 await box.dispatchEvent('compositionend');assert.equal(await dialog(page).locator('.ni-w-list .ni-w-node').count(),1)
}))
test('NIW-B18: reduced motion shows text instead of spinners',()=>mount({step:'import-char',phase:'running'},async page=>{
 const running=dialog(page).locator('.ni-w-ent[data-s=running]').first()
 assert.equal(await running.locator('.ni-w-rm').evaluate(e=>getComputedStyle(e).display!=='none'),true)
 assert.equal(await dialog(page).locator('.ni-spinner').first().evaluate(e=>getComputedStyle(e).animationName),'none')
}))
for(const theme of ['paper','ink'])for(const width of [1280,390])test(`NIW-B19: ${theme} ${width} has no horizontal overflow and the first task card is visible`,()=>mount({step:'import-char',phase:'running',theme},async page=>{
 assert.ok(await page.evaluate(()=>document.scrollingElement!.scrollWidth<=document.scrollingElement!.clientWidth))
 const top=await dialog(page).locator('.ni-w-ent').first().evaluate(e=>e.getBoundingClientRect().top);assert.ok(top<(width===390?700:800))
},{width,height:width===390?700:800}))
test('NIW-B20: without a model inference is disabled and the tree offers copy-only',async()=>{
 await mount({step:'kinds',noModel:true},async page=>{const cards=dialog(page).locator('.ni-target-card input');assert.ok(await cards.evaluateAll(e=>e.every(x=>(x as HTMLInputElement).disabled)))})
 await mount({step:'tree',noModel:true},async page=>{assert.match(await dialog(page).innerText(),/仅拷贝/);await dialog(page).getByRole('button',{name:'开始导入'}).waitFor()})
})
test('NIW-B21: prototype sample values do not appear in product code',()=>{
 const samples=['雾港夜行','林默','艾琳','老约翰','白鸦','薇拉','卡尔文','灰袍主教','雾港城','灯塔区','钟楼街','星图残页','黑羽怀表','雾海世界','梦境层','示例文本模型','示例审核模型']
 const paths=['src/components/desktop/NovelImportWizard.tsx','src/components/desktop/NovelImportDialog.tsx','src/lib/desktop/novel-import-wizard.ts','desktop']
 let found=''
 try{found=execFileSync('grep',['-rlE',samples.join('|'),...paths],{encoding:'utf8'})}catch(error){if((error as {status?:number}).status!==1)throw error}
 assert.equal(found.trim(),'',found)
})

test('RB-01/RB-02/RB-03: recognition shows a live found count',async()=>{
 await mount({step:'detect-char',phase:'running',rosterFound:12},async page=>{const d=dialog(page);await d.getByRole('heading',{name:'正在识别角色'}).waitFor();const line=d.getByText('已识别 12 个角色',{exact:true});await line.waitFor();assert.equal(await line.getAttribute('aria-live'),'polite')})
 await mount({step:'detect-char',phase:'running'},async page=>{await dialog(page).getByText('已识别 0 个角色',{exact:true}).waitFor()})
 await mount({step:'detect-scene',phase:'running',rosterFound:3},async page=>{await dialog(page).getByText('已识别 3 个场景',{exact:true}).waitFor()})
})
