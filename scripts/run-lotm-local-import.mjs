import {_electron as electron} from 'playwright'
import {expect} from '@playwright/test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {mkdir,readFile,writeFile,stat} from 'node:fs/promises'
import {join,resolve} from 'node:path'

const exec=promisify(execFile),repo=resolve('.'),root='/private/tmp/shakeink-lotm-local-20261028',appRoot='/private/tmp/shakeink-lotm-runtime-20261027/app-data'
const run=JSON.parse(await readFile(process.env.LOTM_RUN_METADATA??join(root,'run.json'),'utf8')),expected=JSON.parse(await readFile(join(root,'expected-chapters.json'),'utf8')),gaps=JSON.parse(await readFile(join(root,'non-narrative.json'),'utf8'))
const targets=['outline','theme','style','character','item','scene','world','foreshadow','trope','worldline','narrative']
const controlled=process.env.LOTM_CONTROLLED_PICKER==='1',volumeGreen=process.env.LOTM_EXPECT_VOLUME_GREEN==='1',structureAi=process.env.LOTM_STRUCTURE_AI==='1'
let app,page
const evidence=join(root,(process.env.LOTM_EVIDENCE_LABEL??(controlled?'controlled':'initial'))+'-evidence');await mkdir(evidence,{recursive:true})
const save=async(name,value)=>writeFile(join(evidence,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'})
const stage=async(name,details={})=>{await writeFile(join(root,'driver-stage.json'),JSON.stringify({name,...details},null,2)+'\n');console.log(JSON.stringify({name,...details}))}
const current=()=>page.evaluate(()=>window.desktop.novelImport({type:'current'}))
const screenshot=name=>page.screenshot({path:join(evidence,name+'.png')})
const osa=async script=>exec('/usr/bin/osascript',['-e',script],{timeout:20000})
async function nativePath(path){
 if(controlled)return
 await page.waitForTimeout(1500)
 const escaped=path.replaceAll('\\','\\\\').replaceAll('"','\\"')
 await osa(`tell application "System Events"\nkeystroke "g" using {command down, shift down}\ndelay 0.5\nkeystroke "${escaped}"\nkey code 36\nend tell`)
}
async function waitRevision(previous){await expect.poll(async()=>((await current()).view?.revision??-1),{timeout:30000}).toBeGreaterThan(previous)}
async function setRange(fileId,start,end,kind){
 const before=(await current()).view
 const response=await page.evaluate(({id,revision,fileId,start,end,kind})=>window.desktop.novelImport({type:'set-range',id,revision,fileId,start,end,kind}),{id:before.id,revision:before.revision,fileId,start,end,kind})
 assert.ok(response.view);return response.view.revision
}
async function close(){
 if(!app)return
 const exited=new Promise(resolveExit=>app.process().once('exit',(code,signal)=>resolveExit({code,signal})))
 await app.evaluate(({app})=>app.quit())
 const result=await exited;app=null
 return result
}
try{
 app=await electron.launch({executablePath:process.env.LOTM_ELECTRON_RUNTIME||undefined,args:[repo],env:{...process.env,SHAKEINK_TEST_ROOT:appRoot},timeout:60000})
 app.process().stderr.on('data',bytes=>{for(const line of bytes.toString().split(/\r?\n/))if(/^(?:[A-Za-z]*Error: )?(?:模型返回结构不完整.*|模型输出未完整结束|模型未返回可解析的 JSON|模型返回结构或类别无效，请重试|章界不属于候选或重复|多候选必须指定candidateId并忽略其余候选|章标题不能为空或含无效字符|章标题不属于真实候选|卷名不属于真实候选或前序卷归属|卷归属不能回跳或重复使用卷名|忽略候选无效或与章界重复|每个卷章候选必须有且仅有一个决定|不能删除本地已确认的强制章界|卷章候选没有完整决定|卷章结构只能用于分类阶段|全书至少需要一个章界)\s*$/.test(line))process.stderr.write(line+'\n')})
 page=await app.firstWindow({timeout:60000});page.setDefaultTimeout(60000)
 const errors=[];page.on('pageerror',error=>errors.push(error.message))
 await app.evaluate(({app,BrowserWindow})=>{app.focus({steal:true});BrowserWindow.getAllWindows()[0].show();BrowserWindow.getAllWindows()[0].focus()})
 await page.getByRole('button',{name:'导入作品',exact:true}).waitFor({timeout:60000})
 const boot=await page.evaluate(()=>window.desktop.bootstrap())
 const publicModels=boot.models.map(model=>Object.fromEntries(['id','name','modelId','provider','protocol','endpoint','contextWindow'].filter(key=>model[key]!==undefined).map(key=>[key,model[key]])))
 await save('bootstrap.json',{dataRoot:boot.dataRoot,models:publicModels,pickerMode:controlled?'controlled-fallback-native-blocked':'actual-native'})
 assert.equal(boot.dataRoot,appRoot)
 let view
 if(process.env.LOTM_RESUME_SESSION==='1'&&process.env.LOTM_RESET_SESSION==='1'){
  view=(await current()).view;assert.ok(view,'expected the superseded session');assert.equal(view.publication,undefined);const backup=join(root,'superseded-H05',view.id,'session.json');await stat(backup)
  await page.evaluate(({id,revision})=>window.desktop.novelImport({type:'discard',id,revision}),{id:view.id,revision:view.revision});assert.equal((await current()).view,null)
  await save('reset-old-session.json',{oldSessionId:view.id,backup});await stage('reset-old-session',{oldSessionId:view.id})
 }else if(process.env.LOTM_RESUME_SESSION==='1'){
  view=(await current()).view;assert.ok(view,'expected a retained import session')
  await page.locator('.ni-task-button').click();const continueButton=page.getByRole('button',{name:'继续导入',exact:true});if(await continueButton.isVisible())await continueButton.click()
  await expect.poll(async()=>{const phase=(await current()).view?.phase;if(phase==='failed')throw Error('恢复会话失败');return phase==='source'||phase==='select'},{timeout:60000}).toBe(true)
  if(await page.getByRole('heading',{name:'选择内容',exact:true}).isVisible())await page.getByRole('button',{name:'返回来源',exact:true}).click();await page.getByRole('heading',{name:'核对来源',exact:true}).waitFor();view=(await current()).view
 }else{
  assert.equal((await current()).view,null)
  if(controlled)await app.evaluate(({dialog},path)=>{globalThis.__lotmNativePath=path;dialog.showOpenDialog=async()=>({canceled:false,filePaths:[globalThis.__lotmNativePath]})},run.sourcePath)
  await stage(controlled?'controlled-source':'native-source',{path:run.sourcePath})
  await page.getByRole('button',{name:'导入作品',exact:true}).click();await nativePath(run.sourcePath)
  try{await page.getByRole('heading',{name:'核对来源',exact:true}).waitFor({timeout:12000})}catch(error){if(controlled)throw error;await osa('tell application "System Events" to key code 36');await page.getByRole('heading',{name:'核对来源',exact:true}).waitFor({timeout:60000})}
  view=(await current()).view
 }
 assert.equal(view.files.length,1);assert.equal(view.files[0].hash,run.sourceSha256);assert.equal(view.files[0].characters,run.utf16Characters)
 await save('source-view.json',{id:view.id,revision:view.revision,phase:view.phase,files:view.files,found:view.found,chapters:view.chapters.length})
 await screenshot('source')
 await page.getByRole('button',{name:/^核对(?:原文| .+)$/}).click()
 if(view.files[0].requiresEncodingConfirmation){
  await page.getByLabel('文本编码',{exact:true}).selectOption('gb18030')
  const beforeEncoding=(await current()).view.revision;await page.getByRole('button',{name:'应用编码',exact:true}).click();await waitRevision(beforeEncoding)
 }
 const first=await page.evaluate(({id,fileId})=>window.desktop.novelImport({type:'read-source',id,fileId,offset:0,limit:32768}),{id:view.id,fileId:view.files[0].id})
 assert.equal(first.source.total,run.utf16Characters);assert.equal(first.source.text.length,32768);assert.ok(!first.source.text.includes('\ufffd'))
 await screenshot('encoding-confirmed')
 const excluded=gaps.map(row=>({start:row.range[0],end:row.range[1]})).filter(row=>row.end>row.start).sort((a,b)=>a.start-b.start),bodyRanges=[]
 let bodyStart=0
 for(const row of excluded){assert.ok(row.start>=bodyStart);if(row.start>bodyStart)bodyRanges.push([bodyStart,row.start]);bodyStart=row.end}
 if(bodyStart<run.utf16Characters)bodyRanges.push([bodyStart,run.utf16Characters])
 const sourceText=JSON.parse(await readFile(join(appRoot,'novel-imports',view.id,'session.json'),'utf8')).files[0].text
 assert.equal(createHash('sha256').update(bodyRanges.map(([start,end])=>sourceText.slice(start,end)).join('')).digest('hex'),run.expectedBodySha256)
 const ranges=[...bodyRanges.map(([start,end])=>({start,end,kind:'body'})),...excluded.map(row=>({...row,kind:'excluded'}))].sort((a,b)=>b.start-a.start)
 const coalesce=units=>{const groups=[];for(const unit of units.map(({start,end,kind})=>({start,end,kind})).sort((a,b)=>a.start-b.start)){const previous=groups.at(-1);if(previous&&previous.kind===unit.kind&&previous.end===unit.start)previous.end=unit.end;else groups.push(unit)}return groups}
 const expectedUnits=coalesce(ranges)
 const currentUnits=async()=>{const journal=JSON.parse(await readFile(join(appRoot,'novel-imports',view.id,'session.json'),'utf8'));return coalesce(journal.units)}
 const stale=async()=>{if(!structureAi)return false;const chapters=JSON.parse(await readFile(join(appRoot,'novel-imports',view.id,'session.json'),'utf8')).chapters;return chapters.length!==expected.length||chapters.some((chapter,index)=>chapter.title!==expected[index].title||chapter.start!==expected[index].start||chapter.end!==expected[index].end||chapter.volume!==expected[index].volumeName)}
 const correctable=async()=>{const journal=JSON.parse(await readFile(join(appRoot,'novel-imports',view.id,'session.json'),'utf8')),chapters=journal.chapters;if(!journal.chapterDetection?.structureDecision||journal.publication||journal.artifacts.length||chapters.length!==expected.length||!chapters.every((chapter,index)=>chapter.title===expected[index].title&&chapter.volume===expected[index].volumeName))return false;const different=chapters.filter((chapter,index)=>chapter.start!==expected[index].start||chapter.end!==expected[index].end);return different.length===2&&chapters[1393].end===expected[1394].start+5&&chapters[1394].start===expected[1394].start+5&&sourceText.slice(expected[1394].sourceStart,expected[1394].sourceStart+5).trim()==='番外'}
 const rangePreserved=JSON.stringify(await currentUnits())===JSON.stringify(expectedUnits)
 if(structureAi&&rangePreserved&&await stale()){
  const journal=JSON.parse(await readFile(join(appRoot,'novel-imports',view.id,'session.json'),'utf8'))
  if(journal.chapterDetection?.mode==='manual'&&!journal.structureDraft&&!(await correctable())){
   const unit=journal.units.find(unit=>unit.kind==='body'&&sourceText.indexOf('\n',unit.start)>=unit.start&&sourceText.indexOf('\n',unit.start)<unit.end),end=sourceText.indexOf('\n',unit.start)+1
   assert.ok(end>unit.start&&end<unit.end);await setRange(view.files[0].id,unit.start,end,'body');await save('stale-structure-reset.json',{unitId:unit.id,start:unit.start,end,kind:'body',bodyUnchanged:true})
  }
 }
 let preserved=JSON.stringify(await currentUnits())===JSON.stringify(expectedUnits)&&!(await stale())
 await page.getByRole('button',{name:'完成核对',exact:true}).click()
 const recognized=async()=>{const phase=(await current()).view?.phase;if(phase==='failed')throw Error('真实结构识别失败');return phase==='select'||phase==='source'}
 if(preserved){
  await page.getByRole('button',{name:'识别内容',exact:true}).click();await page.getByRole('button',{name:structureAi?'允许识别':'仅本地分类',exact:true}).click()
  if(structureAi)await expect.poll(recognized,{timeout:1800000}).toBe(true)
  else await page.waitForTimeout(500)
 }
 if(await page.getByRole('heading',{name:'选择内容',exact:true}).isVisible())await page.getByRole('button',{name:'查看正文来源',exact:true}).click()
 else await page.getByRole('button',{name:/^核对(?:原文| .+)$/}).click()
 preserved=JSON.stringify(await currentUnits())===JSON.stringify(expectedUnits)&&!(await stale())
 if(!preserved)for(const range of ranges)await setRange(view.files[0].id,range.start,range.end,range.kind)
 await save('ranges-confirmed.json',{bodyRanges,gaps:gaps.map(row=>row.range),count:ranges.length,preserved})
 await page.getByRole('button',{name:'完成核对',exact:true}).click()
 for(let attempt=0;attempt<2;attempt++){
  if((await current()).view.phase==='source'||await page.getByRole('heading',{name:'核对来源',exact:true}).isVisible()){
   await page.getByRole('button',{name:'识别内容',exact:true}).click();await page.getByRole('button',{name:structureAi?'允许识别':'仅本地分类',exact:true}).click()
   if(structureAi)await expect.poll(recognized,{timeout:1800000}).toBe(true)
   else await page.waitForTimeout(500)
  }
  const journal=JSON.parse(await readFile(join(appRoot,'novel-imports',view.id,'session.json'),'utf8')),unknown=journal.units.filter(unit=>unit.kind==='unknown')
  if(!unknown.length)break
  assert.equal(attempt,0,'来源片段仍未按冻结范围完成归类')
  const kinds=new Set()
  for(const unit of unknown){const range=ranges.find(row=>unit.start>=row.start&&unit.end<=row.end);assert.ok(range,'未确认片段跨越独立边界：'+unit.start);kinds.add(range.kind);await setRange(view.files[0].id,unit.start,unit.end,range.kind)}
  await save('unresolved-ranges-confirmed.json',{count:unknown.length,kinds:[...kinds]})
 }
 await page.getByRole('heading',{name:'选择内容',exact:true}).waitFor()
 for(const kind of ['outline','theme','style','world','character','scene','item','foreshadow','goldenFinger','trope','worldline','narrative']){
  if((await current()).view.selected.includes(kind)){await page.locator('#ni-source-'+kind).click();await expect.poll(async()=>(await current()).view.selected.includes(kind)).toBe(false)}
 }
 for(const kind of targets){const input=page.locator('#ni-target-'+kind);if(!await input.isChecked()){await input.click();await expect.poll(async()=>(await current()).view.targets.includes(kind)).toBe(true)}}
 const golden=page.locator('#ni-target-goldenFinger');if(await golden.isChecked()){await golden.click();await expect.poll(async()=>(await current()).view.targets.includes('goldenFinger')).toBe(false)}
 await expect.poll(async()=>JSON.stringify((await current()).view.selected)).toBe(JSON.stringify(['body']))
 await expect.poll(async()=>JSON.stringify([...(await current()).view.targets].sort())).toBe(JSON.stringify([...targets].sort()))
 await screenshot('exact-selection')
 await page.getByRole('button',{name:'返回来源',exact:true}).click()
 await page.getByRole('button',{name:'核对卷章',exact:true}).click()
 view=(await current()).view
 if(structureAi){const correction=await stale();if(correction)assert.ok(await correctable(),'只允许对唯一番外父标题边界进行正式人工确认');assert.equal(view.chapters.length,expected.length);for(const [index,chapter]of view.chapters.entries()){const expectedChapter=expected[index];assert.equal(chapter.title,expectedChapter.title);assert.equal(chapter.volume,expectedChapter.volumeName);if(!correction){assert.equal(chapter.start,expectedChapter.start);assert.equal(chapter.end,expectedChapter.end)}}await save('structure-model.json',{sessionId:view.id,chapterCount:view.chapters.length,volumeNames:run.volumeNames,volumeChapterCounts:run.volumeChapterCounts,structureModelUsed:true,manualBoundaryConfirmationRequired:correction})}
 await save('automatic-chapters-red.json',{chapterCount:view.chapters.length,unassignedCount:view.chapters.filter(c=>!c.volume).length,last:view.chapters.at(-1),diagnostic:view.chapterDetection})
 await screenshot('automatic-chapters-red')
 if(volumeGreen){
  await screenshot('volume-manual-before-submit')
  view=(await current()).view;const cuts=expected.map(c=>({start:c.start,title:c.title,volume:c.volumeName}))
  await page.evaluate(({id,revision,cuts})=>window.desktop.novelImport({type:'set-chapters',id,revision,cuts}),{id:view.id,revision:view.revision,cuts})
  await expect.poll(async()=>((await current()).view?.chapters.length??0),{timeout:60000}).toBe(1402)
  view=(await current()).view
  for(const [index,chapter]of view.chapters.entries()){const expectedChapter=expected[index];assert.equal(chapter.title,expectedChapter.title);assert.equal(chapter.start,expectedChapter.start);assert.equal(chapter.end,expectedChapter.end);assert.equal(chapter.volume,expectedChapter.volumeName)}
  const groups=[];for(const chapter of view.chapters){const previous=groups.at(-1);if(previous&&previous.name===chapter.volume)previous.count++;else groups.push({name:chapter.volume,count:1})}
  assert.deepEqual(groups.map(g=>g.name),run.volumeNames);assert.deepEqual(groups.map(g=>g.count),run.volumeChapterCounts)
  const reset=JSON.parse(await readFile(join(appRoot,'novel-imports',view.id,'session.json'),'utf8'))
  assert.equal(reset.artifacts.length,0);assert.deepEqual(reset.coverage,{});assert.equal(reset.analysisGrant,undefined);assert.equal(reset.semanticState,undefined);assert.equal(reset.detailedOutlineIds,undefined);assert.equal(reset.structureGrant,undefined);assert.ok(reset.chapters.every(c=>!c.outline));assert.equal(reset.phase,'confirm')
  await writeFile(join(root,'ordered-session.json'),JSON.stringify({sessionId:view.id,structureAi,artifactCount:reset.artifacts.length,coverage:reset.coverage},null,2)+'\n',{flag:'wx'})
  await save('volume-manual-green.json',{sessionId:view.id,createdAt:reset.createdAt,chapterCount:view.chapters.length,groups,sourceSha256:run.sourceSha256,targets:view.targets,selected:view.selected,invalidation:{artifacts:0,coverage:{},analysisGrant:false,semanticState:false,detailedOutlineIds:false,chapterOutlines:0}})
  await page.getByRole('button',{name:'核对卷章',exact:true}).click();await screenshot('volume-manual-green')
  await stage('volume-green',{sessionId:view.id,groups,invalidated:true})
 }else{
  const cuts=expected.map(c=>({start:c.start,title:c.title,volume:c.volumeName}))
  let volumeError=''
  try{await page.evaluate(({id,revision,cuts})=>window.desktop.novelImport({type:'set-chapters',id,revision,cuts}),{id:view.id,revision:view.revision,cuts})}catch(error){volumeError=String(error?.message??error)}
  await save('volume-manual-red.json',{expectedVolumes:9,expectedChapters:1402,error:volumeError})
  assert.match(volumeError,/卷|volume/i)
  await stage('volume-red',{error:volumeError,sessionId:view.id})
 }
 const exit=await close();await save((volumeGreen?'volume-green':'initial')+'-exit.json',exit)
 assert.deepEqual(errors,[])
 await stage(volumeGreen?'volume-green-closed':'initial-complete-red-retained',{exit})
}catch(error){
 await stage('initial-driver-failed',{error:String(error?.stack??error)})
 if(page)await screenshot('driver-failure').catch(()=>{})
 throw error
}finally{if(app)await app.close().catch(()=>{})}
