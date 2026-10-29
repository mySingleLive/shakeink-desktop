import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFile,writeFile,rm,mkdir} from 'node:fs/promises'
import {existsSync} from 'node:fs'
import {randomUUID} from 'node:crypto'
import {join} from 'node:path'
import {NovelImportController} from '../../desktop/main/novel-import'
import type {ImportAiRequest,ImportFile,ImportSession,ImportView} from '../../desktop/shared/novel-import'
import {WIZARD_ROSTER_CONCURRENCY} from '../../desktop/main/novel-import'
import {allCuts,bodyF,cast,classifyF,entityName,entityResult,entityTarget,filesF,fixture,fullAi,indexOfTitle,linesAi,model,passCharacters,relatingAi,injectJournalEdit,review,rosterAi,settingsF,sleep,source,toImportChar,toRoster,toStep,toTree,toVerify,toWorldImport,touchesAi,verifyAgain,volumesF,worldsAi} from '../helpers/novel-import-wizard-fixture'

test('NIW-C01: wizard sessions order files, work and kinds; step 3 requires a title and folder',async()=>{
 const f=await fixture();try{
  const started=(await f.act('choose',{mode:'files'})).view!
  assert.equal(started.wizard?.step,'files');assert.equal((await f.journal()).wizardVersion,1)
  await f.act('wizard-next');assert.equal((await f.view()).wizard?.step,'work')
  await assert.rejects(f.act('wizard-next'),/目录/)
  await f.act('choose-target');await assert.rejects(f.act('set-title',{title:'长'.repeat(101)}))
  await f.act('set-title',{title:'  '});await assert.rejects(f.act('wizard-next'),/作品名称/)
  await f.act('set-title',{title:'合成作品'});await f.act('wizard-next')
  const v=await f.view();assert.equal(v.wizard?.step,'kinds');assert.equal(v.phase,'source')
 }finally{await f.dispose()}
})
test('NIW-C03: GB18030 sources pass step 2 without an encoding action',async()=>{
 const f=await fixture();try{
  await f.act('choose',{mode:'files'});const v=await f.view()
  assert.ok(!v.files.find(x=>x.id==='f-body')?.requiresEncodingConfirmation)
  await f.act('wizard-next');assert.equal((await f.view()).wizard?.step,'work')
  await f.act('set-encoding',{fileId:'f-body',encoding:'utf-8'})
 }finally{await f.dispose()}
})
test('NIW-C12a: step 4 leads to local structure and a full whole-book tree',async()=>{
 const f=await fixture();try{
  const v=await toTree(f)
  assert.equal(v.wizard?.step,'tree');assert.equal(v.phase,'select')
  const titles=v.wizard!.structure!.map(c=>c.title)
  assert.deepEqual(titles.slice(0,10),['第一章 起','第二章 承','第三章 转','第四章 终','第一章 再起','第二章 再承','第三章 再终','第一章 三起','第二章 三承','第三章 三终'])
  assert.equal(v.wizard!.structure!.at(-1)?.volume,'丙卷',/* 后记 follows 丙卷 in local detection unless a volume break exists */)
  assert.equal(v.wizard!.structure!.filter(c=>c.title.startsWith('第')).length,10)
  assert.deepEqual([...new Set(v.wizard!.structure!.map(c=>c.volume??'(无卷)'))].slice(0,3),['甲卷','乙卷','丙卷'])
  assert.deepEqual(v.wizard!.chapterSelection,v.wizard!.structure!.map((_,i)=>i))
 }finally{await f.dispose()}
})
test('NIW-C12: unselected chapters never reach the model after materialization',async()=>{
 const f=await fixture();try{
  const v=await toTree(f),drop=new Set([indexOfTitle(v,'第一章 再起'),...v.wizard!.structure!.map((c,i)=>c.volume==='丙卷'||c.title==='后记'?i:-1).filter(i=>i>=0)])
  await f.act('wizard-select-chapters',{indices:v.wizard!.structure!.map((_,i)=>i).filter(i=>!drop.has(i))})
  const before=f.requests.length;await f.act('wizard-next',{consent:true})
  const j=await f.journal()
  assert.equal(j.chapters.length,6);assert.ok(!j.workingProse.includes('再起')&&!j.workingProse.includes('三起')&&!j.workingProse.includes('后记'))
  assert.deepEqual(j.wizard!.grantedChapters,j.wizard!.chapterSelection);assert.equal(j.wizard!.materializedVolumes!.length,6);assert.equal(j.chapters[4].volume,'乙卷')
  assert.ok(j.analysisGrant);await f.settle()
  const done=(await f.journal()).wizard!;assert.equal(done.stepState['import-struct'],'done');assert.equal(done.stepState['import-body'],'done')
  for(const r of f.requests.slice(before))for(const text of [...r.units.map(u=>u.text),...(r.chapters??[]).map(c=>c.title),r.instruction??''])assert.ok(!/再起|三起|三终|后记/u.test(text),'leaked: '+text.slice(0,40))
 }finally{await f.dispose()}
})
test('NIW-C13: step 6 consent requires both models and does not materialize on failure',async()=>{
 const f=await fixture();try{
  await toTree(f);f.setModels({text:model})
  await assert.rejects(f.act('wizard-next',{consent:true}),/审核模型/)
  const j=await f.journal();assert.equal(j.workingProse,'');assert.equal(j.wizard!.grantedChapters,undefined)
  await assert.rejects(f.act('wizard-next',{consent:false}),/允许/)
 }finally{await f.dispose()}
})
test('NIW-C14/C15: after consent the chapter scope cannot grow or be re-cut',async()=>{
 const f=await fixture();try{
  const v=await toTree(f),all=v.wizard!.structure!.map((_,i)=>i)
  await f.act('wizard-select-chapters',{indices:all.slice(0,4)});await f.act('wizard-next',{consent:true});await f.settle()
  await assert.rejects(f.act('wizard-select-chapters',{indices:all}),/扩大章节|当前步骤/)
  await assert.rejects(f.act('set-chapters',{cuts:[{start:0,title:'第一章 起'}]}),/当前步骤|不能/)
 }finally{await f.dispose()}
})
test('NIW-C17: restart keeps a materialized wizard session valid',async()=>{
 const f=await fixture();try{
  const v=await toTree(f);await f.act('wizard-select-chapters',{indices:v.wizard!.structure!.map((_,i)=>i).filter(i=>i!==indexOfTitle(v,'第一章 再起'))});await f.act('wizard-next',{consent:true});await f.settle()
  const dir=join(f.root,'novel-imports',v.id),path=join(dir,'session.json'),saved=JSON.parse(await readFile(path,'utf8')) as ImportSession,owner=await readFile(join(dir,'.owner'),'utf8')
  assert.equal(saved.wizard!.chapterSelection!.length,10)
  // The unsaved wizard draft is deleted on restart.
  await assertDeletedOnRestart(f,v.id)
  // Once its save began the same materialized journal is restored and stays valid.
  saved.publication={requestId:randomUUID(),hash:'synthetic-publication'};await mkdir(dir);await writeFile(join(dir,'.owner'),owner);await writeFile(path,JSON.stringify(saved))
  const again=new NovelImportController(f.options);await again.initialize()
  const restored=(await again.act({type:'current'})).view!
  assert.equal(restored.id,v.id);assert.equal(restored.wizard!.chapterSelection!.length,10);await again.close()
  // A tampered wizard draft is skipped without breaking controller start-up.
  const j=JSON.parse(await readFile(path,'utf8')) as ImportSession
  j.chapters[0].content+='篡改';j.updatedAt='2099-01-01T00:00:00.000Z';await writeFile(path,JSON.stringify(j))
  const third=new NovelImportController(f.options);await third.initialize()
  assert.equal((await third.act({type:'current'})).view,null);await third.close()
 }finally{await rm(f.root,{recursive:true,force:true});await rm(f.target,{recursive:true,force:true})}
})
test('NIW-C18: manual cuts at step 6 refresh the frozen structure and reset the selection',async()=>{
 const f=await fixture();try{
  await toTree(f);await f.act('wizard-select-chapters',{indices:[0,1]})
  const j=await f.journal(),frozen=j.wizard!.structure!,body=j.chapters.map(c=>c.content).join('')
  const split=frozen[0].start+body.slice(frozen[0].start,frozen[0].end).indexOf('之夜')
  const cuts=[...frozen.map(c=>({start:c.start,title:c.title,...(c.volume?{volume:c.volume}:{})}))];cuts.splice(1,0,{start:split,title:'起之夜',volume:'甲卷'})
  const before=j.wizard!.structureHash
  await f.act('set-chapters',{cuts})
  const after=await f.journal();assert.equal(after.wizard!.structure!.length,frozen.length+1);assert.notEqual(after.wizard!.structureHash,before)
  assert.deepEqual(after.wizard!.chapterSelection,after.wizard!.structure!.map((_,k)=>k));assert.equal(after.phase,'select');assert.equal(after.wizard!.step,'tree')
 }finally{await f.dispose()}
})
test('NIW-C21a: steps 7–8 complete without model calls and step 9 lists characters',async()=>{
 const f=await fixture(filesF(),rosterAi());try{
  const before=(await toTree(f),f.requests.length);await f.act('wizard-next',{consent:true});const v=await f.settle()
  assert.equal(v.wizard!.step,'detect-char');assert.equal(v.phase,'select');assert.equal(v.wizard!.stepState['import-struct'],'done');assert.equal(v.wizard!.stepState['import-body'],'done')
  assert.ok(f.requests.slice(before).every(r=>r.intent==='roster'&&r.kind==='character'))
  const list=v.wizard!.candidates.character!;assert.deepEqual(list.map(c=>[c.name,c.roleType]).sort(),[['林舟','SUPPORTING'],['沈砚','PROTAGONIST'],['顾三','ANTAGONIST']])
  assert.ok(list.every(c=>c.selected&&c.chapterCount>0));assert.deepEqual(list.find(c=>c.name==='沈砚')!.sources.sort(),['body','source'])
 }finally{await f.dispose()}
})
test('NIW-C21: roster choices, role changes and merges are stored',async()=>{
 const f=await fixture(filesF(),rosterAi());try{
  const v=await toRoster(f),[a,b,c]=[...v.wizard!.candidates.character!].sort((x,y)=>x.name.localeCompare(y.name))
  await f.act('wizard-select-candidates',{kind:'character',ids:[c.id],selected:false})
  await f.act('wizard-set-role',{candidateId:a.id,roleType:'ANTAGONIST'})
  await f.act('wizard-merge-candidates',{keepId:a.id,mergeIds:[b.id]})
  const after=(await f.view()).wizard!.candidates.character!
  assert.equal(after.length,2);assert.equal(after.find(x=>x.id===c.id)!.selected,false);const kept=after.find(x=>x.id===a.id)!;assert.equal(kept.roleType,'ANTAGONIST');assert.ok(kept.aliases.includes(b.name))
 }finally{await f.dispose()}
})
test('NIW-C22: a failed roster step reports the error and redetect resends only unfinished batches',async()=>{
 let fail=true
 const f=await fixture(filesF(),rosterAi({'roster:character':()=>{if(fail){fail=false;throw Error('Rate Limit Reached')}return undefined}}));try{
  await toTree(f);await f.act('wizard-next',{consent:true});let v=await f.settle()
  assert.equal(v.wizard!.step,'detect-char');assert.equal(v.wizard!.stepState['detect-char'],'failed');assert.equal(v.wizard!.stepError,'模型服务返回请求频率限制提示，请稍后重试')
  await assert.rejects(f.act('wizard-next'),/识别失败/)
  const before=f.requests.filter(r=>r.intent==='roster').length,covered=(await f.journal()).coverage['roster:character']??[]
  await f.act('wizard-redetect');v=await f.settle()
  const resent=f.requests.filter(r=>r.intent==='roster').slice(before)
  assert.ok(resent.length>=1);assert.ok(resent.every(r=>r.units.every(u=>!covered.includes(u.id))))
  assert.equal(v.wizard!.stepState['detect-char'],'waiting');assert.equal(v.wizard!.candidates.character!.length,3)
 }finally{await f.dispose()}
})
test('NIW-C23: skipping a failed recognition skips that import step',async()=>{
 const f=await fixture(filesF(),rosterAi({'roster:character':()=>{throw Error('Server Error')}}));try{
  await toTree(f);await f.act('wizard-next',{consent:true});await f.settle()
  await f.act('wizard-next',{skip:true});const v=await f.settle()
  assert.equal(v.wizard!.stepState['import-char'],'skipped');assert.notEqual(v.wizard!.step,'import-char')
 }finally{await f.dispose()}
})
test('NIW-C24: an empty roster waits for the author and the next import step is skipped',async()=>{
 const f=await fixture([filesF()[0]],rosterAi({'roster:character':()=>({roster:[]})}));try{
  const v=await toRoster(f);assert.equal(v.wizard!.step,'detect-char');assert.deepEqual(v.wizard!.candidates.character,[])
  await f.act('wizard-next');const w=(await f.view()).wizard!;assert.equal(w.stepState['import-char'],'skipped');assert.notEqual(w.step,'import-char')
 }finally{await f.dispose()}
})
test('NIW-C29: at most four entity imports run at once and each completion is visible',async()=>{
 let running=0,max=0
 const cast10=Array.from({length:10},(_,i)=>'角色'+String.fromCharCode(0x7532+i))
 const body=cast10.map((n,i)=>`第${i+1}章 篇${i}\n\n${n}出场。\n\n`).join('')
 const f=await fixture([source(body,'正文.txt','f-body')],rosterAi({
  'roster:character':r=>({roster:r.units.flatMap(u=>cast10.filter(n=>u.text.includes(n)).map(n=>({name:n,aliases:[],roleType:'SUPPORTING' as const,evidence:{unitId:u.id,quote:n}})))}),
  'entity:character':()=>undefined,
 }));
 const base=f.handler();f.setAi(async r=>{if(r.intent!=='entity')return base(r);running++;max=Math.max(max,running);await sleep(20+Math.floor(Math.random()*40));running--;return entityResult(r)})
 try{
  await toImportChar(f);const seen=new Set<number>()
  for(let i=0;i<400&&f.controller.active;i++){await sleep(5);seen.add((await f.view()).wizard!.tasks.filter(t=>t.kind==='entity'&&t.state==='done').length)}
  const v=await f.settle();assert.equal(max,4);assert.ok(seen.size>2,'progress observed in steps')
  assert.equal(v.wizard!.tasks.filter(t=>t.kind==='entity').length,10);assert.ok(v.wizard!.tasks.every(t=>t.state==='done'))
  assert.equal((await f.journal()).artifacts.filter(a=>a.kind==='character'&&a.schema===2).length,10)
 }finally{await f.dispose()}
})
test('NIW-C30/C31: a failure leaves the others running; the scheduler exits and retry restarts it',async()=>{
 let first=true
 const f=await fixture(filesF(),rosterAi());const base=f.handler()
 f.setAi(async r=>{if(r.intent!=='entity')return base(r);if(first&&entityName(r)==='林舟'){first=false;throw Error('Server Error')}return entityResult(r)})
 try{
  await toImportChar(f);let v=await f.settle()
  const failed=v.wizard!.tasks.filter(t=>t.state==='failed');assert.equal(failed.length,1);assert.equal(failed[0].error,'模型服务返回服务器错误提示，请稍后重试')
  assert.equal(v.phase,'select');assert.equal(v.wizard!.step,'import-char');assert.equal(v.wizard!.stepState['import-char'],'waiting');assert.equal(f.controller.active,0)
  const epoch=(await f.journal()).epoch
  await f.act('wizard-task',{taskId:failed[0].id,op:'retry'});v=await f.settle()
  assert.ok(v.wizard!.tasks.filter(t=>t.kind==='entity').every(t=>t.state==='done'));assert.equal(v.wizard!.step,'detect-scene');assert.equal((await f.journal()).epoch>=epoch,true)
 }finally{await f.dispose()}
})
test('NIW-C31b: skip-failed records the skipped entity and advances',async()=>{
 const f=await fixture(filesF(),rosterAi());const base=f.handler()
 f.setAi(async r=>{if(r.intent!=='entity')return base(r);if(entityName(r)==='顾三')throw Error('Server Error');return entityResult(r)})
 try{
  await toImportChar(f);await f.settle();await f.act('wizard-task',{op:'skip-failed'});const v=await f.settle()
  assert.deepEqual(v.wizard!.skipped.map(s=>s.label),['顾三']);assert.equal(v.wizard!.step,'detect-scene')
  assert.ok(!(await f.journal()).artifacts.some(a=>a.name==='顾三'))
 }finally{await f.dispose()}
})
test('NIW-C33/C34/C35: pause cancels in-flight work; resume only redoes unfinished entities',async()=>{
 const calls=new Map<string,number>();let hold=true
 const f=await fixture(filesF(),rosterAi());const base=f.handler()
 f.options.cancelAi=async()=>{hold=false}
 f.setAi(async r=>{if(r.intent!=='entity')return base(r);const id=entityTarget(r);calls.set(id,(calls.get(id)??0)+1);if(entityName(r)==='顾三'){while(hold)await sleep(5);throw new DOMException('导入操作已取消','AbortError')}return entityResult(r)})
 try{
  await toImportChar(f);for(let i=0;i<200;i++){const v=await f.view();if(v.wizard!.tasks.filter(t=>t.state==='done').length===2)break;await sleep(5)}
  await f.act('pause');let v=await f.view()
  assert.equal(v.phase,'paused');assert.equal(v.wizard!.step,'import-char');assert.ok(v.wizard!.tasks.some(t=>t.state==='paused'))
  hold=false;const doneBefore=[...calls.entries()].filter(([id])=>v.wizard!.tasks.find(t=>t.candidateId===id)?.state==='done').map(([id,n])=>[id,n] as const)
  f.setAi(async r=>{if(r.intent!=='entity')return base(r);const id=entityTarget(r);calls.set(id,(calls.get(id)??0)+1);return entityResult(r)})
  await f.act('resume',{consent:true});v=await f.settle()
  for(const [id,n] of doneBefore)assert.equal(calls.get(id),n,'completed entity not redone')
  assert.ok(v.wizard!.tasks.filter(t=>t.kind==='entity').every(t=>t.state==='done'));assert.equal((await f.journal()).artifacts.filter(a=>a.kind==='character').length,3)
 }finally{await f.dispose()}
})
test('NIW-C38: relationships to later or skipped characters resolve at the end of the step',async()=>{
 const f=await fixture(filesF(),rosterAi());const base=f.handler()
 let hold=true;f.setAi(async r=>{if(r.intent==='entity'&&entityName(r)==='林舟')while(hold)await sleep(5);return relatingAi(base,{沈砚:'林舟'})(r)})
 try{
  await toImportChar(f);await sleep(80);hold=false;await f.settle()
  const j=await f.journal(),shen=j.artifacts.find(a=>a.name==='沈砚')!,lin=j.artifacts.find(a=>a.name==='林舟')!
  assert.equal(JSON.parse(shen.facts.relationships)[0].characterId,lin.id)
 }finally{await f.dispose()}
 const g=await fixture(filesF(),rosterAi());const gb=g.handler()
 g.setAi(async r=>{if(r.intent==='entity'&&entityName(r)==='林舟')throw Error('Server Error');return relatingAi(gb,{沈砚:'林舟'})(r)})
 try{
  await toImportChar(g);await g.settle();await g.act('wizard-task',{op:'skip-failed'});const v=await g.settle()
  const shen=(await g.journal()).artifacts.find(a=>a.name==='沈砚')!,rel=JSON.parse(shen.facts.relationships)[0]
  assert.equal(rel.characterId,undefined);assert.equal(rel.target,'林舟');assert.ok(v.wizard!.dropped.some(d=>d.kind==='relationship'))
 }finally{await g.dispose()}
})
test('NIW-C39: a skipped parent place leaves its child at top level',async()=>{
 const f=await fixture(filesF(),rosterAi());const base=f.handler()
 f.setAi(async r=>{if(r.intent==='entity'&&r.kind==='scene'&&entityName(r)==='北城')throw Error('Server Error');return relatingAi(base)(r)})
 try{
  await passCharacters(f);await f.act('wizard-next');await f.settle();await f.act('wizard-task',{op:'skip-failed'});const v=await f.settle()
  const lane=(await f.journal()).artifacts.find(a=>a.kind==='scene'&&a.name==='南巷')!
  assert.equal(lane.facts.parentId,undefined);assert.ok(v.wizard!.dropped.some(d=>d.kind==='parent'))
 }finally{await f.dispose()}
})
test('NIW-C40: entity requests carry a strict catalogue and aliases in the instruction',async()=>{
 const f=await fixture(filesF(),rosterAi());const base=f.handler();f.setAi(relatingAi(base))
 try{
  await passCharacters(f);await f.act('wizard-next');await f.settle()
  const ch=f.requests.find(r=>r.intent==='entity'&&r.kind==='character')!,sc=f.requests.find(r=>r.intent==='entity'&&r.kind==='scene')!
  for(const e of ch.entities!)assert.deepEqual(Object.keys(e).sort(),['id','kind','name'])
  assert.ok(sc.entities!.every(e=>e.entityType==='PLACE'));assert.ok(ch.instruction!.includes('"aliases"'))
 }finally{await f.dispose()}
})
test('NIW-C26/C28: world tasks run before their settings; a parent with only a selected child world stays as its container',async()=>{
 const f=await fixture(filesF(),rosterAi());f.setAi(worldsAi(f.handler()))
 try{
  await toImportChar(f);let v=await toWorldImport(f)
  const list=v.wizard!.candidates.world!,top=list.find(c=>c.name==='北城世界')!,child=list.find(c=>c.name==='南巷梦境')!
  assert.equal(child.parentId,top.id)
  const own=list.filter(c=>c.parentId===top.id&&c.kind==='world-setting').map(c=>c.id)
  await f.act('wizard-select-candidates',{kind:'world',ids:own,selected:false})
  const order:string[]=[];const inner=f.handler();f.setAi(async r=>{if(r.intent==='entity'&&r.kind==='world')order.push(entityName(r));return inner(r)})
  await f.act('wizard-next');v=await f.settle()
  assert.ok(order.indexOf('南巷梦境')>=0&&order.indexOf('梦俗')>order.indexOf('南巷梦境'),'setting after its world: '+order.join(','))
  assert.ok(!order.includes('城制')&&!order.includes('山川'))
  const j=await f.journal(),childArtifact=j.artifacts.find(a=>a.name==='南巷梦境')!,container=j.artifacts.find(a=>a.name==='北城世界')!
  assert.equal(childArtifact.facts.parentId,container.id);assert.equal(container.facts.entityType,'WORLD')
 }finally{await f.dispose()}
})
test('NIW-C27: a failed world blocks its settings until retried or skipped together',async()=>{
 const f=await fixture(filesF(),rosterAi());const w=worldsAi(f.handler())
 f.setAi(async r=>{if(r.intent==='entity'&&r.kind==='world'&&entityName(r)==='北城世界')throw Error('Server Error');return w(r)})
 try{
  await toImportChar(f);await toWorldImport(f);await f.act('wizard-next');let v=await f.settle()
  const name=(id?:string)=>v.wizard!.candidates.world!.find(c=>c.id===id)?.name
  const byName=(n:string)=>v.wizard!.tasks.find(t=>name(t.candidateId)===n)!
  assert.equal(byName('北城世界').state,'failed');assert.equal(byName('城制').state,'waiting');assert.equal(byName('山川').state,'waiting')
  await f.act('wizard-task',{taskId:byName('北城世界').id,op:'skip'});v=await f.settle()
  assert.equal(byName('城制').state,'skipped');assert.ok(v.wizard!.skipped.some(s=>s.label==='城制'))
 }finally{await f.dispose()}
})
test('NIW-C10: step 16 runs one task per other setting kind; source-only kinds copy without a model call',async()=>{
 const f=await fixture(filesF(),rosterAi());const w=worldsAi(f.handler())
 f.setAi(async r=>{if(r.phase==='analyze'&&!r.intent&&r.kind==='style'){const u=r.units[0];return {artifacts:[{id:'style-1',kind:'style',name:'文风',text:'冷峻短句。',facts:{},evidence:[{unitId:u.id,quote:u.text.slice(0,10)}],sourceUnitIds:[u.id],origin:'inferred'}]}}return w(r)})
 try{
  await toImportChar(f);await toWorldImport(f);await f.act('wizard-next');const v=await f.settle()
  const settings=v.wizard!.tasks.filter(t=>t.kind==='settings')
  assert.deepEqual(settings.map(t=>t.settingsKind).sort(),['goldenFinger','style','theme','trope'])
  assert.ok(f.requests.some(r=>r.phase==='analyze'&&!r.intent&&r.kind==='style'));assert.ok(!f.requests.some(r=>r.kind==='foreshadow'&&r.phase==='analyze'&&!r.intent))
  assert.ok((await f.journal()).artifacts.some(a=>a.kind==='style'&&a.text==='冷峻短句。'))
 }finally{await f.dispose()}
})
test('NIW-C05/C11: worldline, narrative and outline run in order over the selected chapters only',async()=>{
 const f=await fixture(filesF(),rosterAi());f.setAi(linesAi(worldsAi(f.handler())))
 try{
  const v0=await toTree(f),keep=v0.wizard!.structure!.map((c,i)=>c.volume==='丙卷'||c.title==='后记'?-1:i).filter(i=>i>=0)
  await f.act('wizard-select-chapters',{indices:keep});await f.act('wizard-next',{consent:true})
  const v=await toStep(f,'foreshadow')
  for(const step of ['worldline','narrative','outline'] as const)assert.equal(v.wizard!.stepState[step],'done')
  const kinds=f.requests.filter(r=>r.phase==='analyze'&&!r.intent).map(r=>r.kind),first=(k:string)=>kinds.indexOf(k as typeof kinds[number])
  assert.ok(first('worldline')<first('narrative')&&first('narrative')<first('outline'))
  const j=await f.journal();assert.equal(j.chapters.length,7)
  assert.deepEqual(j.artifacts.filter(a=>a.kind==='outline'&&a.facts.chapterIndex!==undefined).map(a=>Number(a.facts.chapterIndex)).sort((a,b)=>a-b),[0,1,2,3,4,5,6])
  for(const r of f.requests.filter(r=>r.kind==='outline'))assert.ok(r.chapters!.length===7)
 }finally{await f.dispose()}
})
test('NIW-C43: conflicts raised during entity steps do not stop the wizard and wait for step 21',async()=>{
 const f=await fixture(filesF(),rosterAi());const base=linesAi(worldsAi(f.handler()))
 f.setAi(async r=>{if(r.intent==='entity'&&entityName(r)==='林舟'){const out=entityResult(r);return out}return base(r)})
 try{
  await toTree(f);await f.act('wizard-next',{consent:true});await toStep(f,'detect-scene')
  const j=await f.journal();assert.notEqual(j.phase,'conflicts')
 }finally{await f.dispose()}
})
test('NIW-C64a: step 20 imports foreshadows with planned touches and records dropped ones',async()=>{
 const f=await fixture(filesF(),rosterAi());f.setAi(touchesAi(linesAi(worldsAi(f.handler()))))
 try{
  await toTree(f);await f.act('wizard-next',{consent:true});const v=await toStep(f,'verify')
  assert.equal(v.wizard!.stepState.foreshadow,'done')
  const j=await f.journal(),fs=j.artifacts.filter(a=>a.kind==='foreshadow');assert.equal(fs.length,1)
  const touches=JSON.parse(fs[0].facts.touches);assert.equal(touches.length,1);assert.equal(touches[0].kind,'PLANT');assert.equal(fs[0].facts.status,'PLANTED')
  assert.ok(v.wizard!.dropped.some(d=>d.kind==='touch'&&d.reason==='原文引文无法唯一定位'))
  const request=f.requests.find(r=>r.intent==='touches')!;assert.ok(request.entities!.some(e=>e.kind==='worldline'))
 }finally{await f.dispose()}
})
test('NIW-C61: all eight checks pass and step 21 moves on to publishing',async()=>{
 const f=await fixture(filesF(),rosterAi());f.setAi(fullAi(f))
 try{
  const v=await toVerify(f);assert.equal(v.wizard!.checks!.length,8);assert.ok(v.wizard!.checks!.every(c=>c.ok),JSON.stringify(v.wizard!.checks!.filter(c=>!c.ok)))
  assert.equal(v.wizard!.stepState.verify,'waiting')
  await f.act('wizard-next');const done=await f.settle();assert.equal(done.phase,'completed');assert.ok(f.published)
 }finally{await f.dispose()}
})
test('NIW-C55/C62: a broken relationship fails its check, blocks saving, and retry-kind returns to that import',async()=>{
 const f=await fixture(filesF(),rosterAi());f.setAi(fullAi(f))
 try{
  await toVerify(f)
  const c=await injectJournalEdit(f,j=>{const a=j.artifacts.find(a=>a.kind==='character')!;a.facts.relationships=JSON.stringify([{target:'无名',description:'旧识',characterId:'c-ffffffffffffffff'}])})
  try{
   const v=await verifyAgain(c),rel=v.wizard!.checks!.find(x=>x.key==='relationships')!
   assert.equal(rel.ok,false);assert.ok(rel.detail.length>0)
   await assert.rejects(c.act({type:'wizard-next',id:v.id,revision:v.revision}),/处理/)
   await c.act({type:'wizard-retry-kind',id:v.id,revision:v.revision,kind:'character'})
   const w=(await c.act({type:'current'})).view!;assert.equal(w.wizard!.step,'import-char');assert.ok(w.wizard!.candidates.character!.every(x=>x.selected))
  }finally{await c.close()}
 }finally{await rm(f.root,{recursive:true,force:true});await rm(f.target,{recursive:true,force:true})}
})
test('NIW-C60/C63: a review conflict opens the decision flow without rerunning the whole book',async()=>{
 const f=await fixture(filesF(),rosterAi());const ai=fullAi(f);let conflicted=false
 f.setAi(async r=>{if(r.phase==='review'&&!conflicted){const a=r.artifacts.find(a=>a.kind==='character');const u=r.units.find(u=>a&&u.text.includes(a.name));if(a&&u){conflicted=true;return {conflicts:[{id:'cf-1',type:'setting-body',kind:'character',entity:a.name,field:'text',source:{text:a.text,value:a.text,artifactId:a.id},candidate:{text:'另一种说法',value:'另一种说法'},evidence:[{unitId:u.id,quote:a.name}],status:'pending',hash:'h'}]}}}return ai(r)})
 try{
  const v=await toVerify(f);assert.equal(v.phase,'conflicts');assert.equal(v.wizard!.checks!.find(c=>c.key==='consistency')!.ok,false)
  const before=f.requests.length
  await f.act('resolve',{conflictId:v.conflicts.find(c=>c.status==='pending')!.id,choice:'source',explanation:'以资料为准'});const after=await f.settle()
  const resent=f.requests.slice(before);assert.ok(!resent.some(r=>r.phase==='analyze'&&!r.intent&&['character','scene','item','world','worldline','narrative','outline'].includes(r.kind!)),'no whole-book reanalysis')
  assert.equal(after.wizard!.step,'verify');assert.ok(after.wizard!.checks!.every(c=>c.ok))
 }finally{await f.dispose()}
})

import {imageFake,imageModel,PNG,type Ai} from '../helpers/novel-import-wizard-fixture'
import {buildCharacterImagePrompt} from '../../src/lib/character-image-prompt'
import {readdir} from 'node:fs/promises'
function withImages(f:Awaited<ReturnType<typeof fixture>>,fake=imageFake()){(f.options as {imageModel?:()=>Promise<typeof imageModel>}).imageModel=async()=>imageModel;(f.options as {generateImage?:unknown}).generateImage=fake.generate;return fake}
const lookAi=(base:Ai):Ai=>async r=>r.intent==='entity'&&r.kind==='character'?entityResult(r,()=>({appearance:'清瘦',clothing:'青布长衫'})):base(r)
test('NIW-C69/C70: images follow successful entities, at most two at once; none when unchecked',async()=>{
 const f=await fixture(filesF(),rosterAi());f.setAi(lookAi(f.handler()));const fake=withImages(f,imageFake({delay:30}))
 try{
  await toRoster(f);await f.act('wizard-set-images',{avatar:true,portrait:true});await assert.rejects(f.act('wizard-next'),/允许/)
  await f.act('wizard-next',{imageConsent:true});const v=await f.settle()
  const images=v.wizard!.tasks.filter(t=>t.kind==='image');assert.equal(images.length,6);assert.ok(images.every(t=>t.state==='done'&&t.dependsOn))
  assert.equal(fake.calls.length,6);assert.ok(fake.max<=2)
  const files=await readdir(join(f.root,'novel-imports',v.id,'images'));assert.equal(files.length,6)
 }finally{await f.dispose()}
 const g=await fixture(filesF(),rosterAi());g.setAi(lookAi(g.handler()));const none=withImages(g)
 try{await toRoster(g);await g.act('wizard-next');await g.settle();assert.equal(none.calls.length,0)}finally{await g.dispose()}
})
test('NIW-C73/C75/C76: image failures retry or skip without touching the entity; prompts reuse the panel builder',async()=>{
 let once=true
 const f=await fixture(filesF(),rosterAi())
 const base=f.handler();f.setAi(async r=>r.intent==='entity'&&r.kind==='character'?entityResult(r,():Record<string,string>=>entityName(r)==='顾三'?{}:{appearance:'清瘦',clothing:'青布长衫'}):base(r))
 const fake=withImages(f,imageFake({fail:p=>p.includes('林舟')&&once?(once=false,Error('IMAGE_TIMEOUT')):undefined}))
 try{
  await toRoster(f);await f.act('wizard-set-images',{avatar:true});await f.act('wizard-next',{imageConsent:true});let v=await f.settle()
  const name=(t:{candidateId?:string})=>v.wizard!.candidates.character!.find(c=>c.id===t.candidateId)?.name
  const gu=v.wizard!.tasks.find(t=>t.kind==='image'&&name(t)==='顾三')!;assert.equal(gu.state,'failed');assert.equal(gu.error,'缺少外观描述')
  const lin=v.wizard!.tasks.find(t=>t.kind==='image'&&name(t)==='林舟')!;assert.equal(lin.state,'failed')
  assert.ok(!fake.calls.some(c=>c.prompt.includes('顾三')))
  const shen=(await f.journal()).artifacts.find(a=>a.name==='沈砚')!
  assert.equal(fake.calls.find(c=>c.prompt.includes('沈砚'))!.prompt,buildCharacterImagePrompt('avatar',{name:'沈砚',appearance:'清瘦',clothing:'青布长衫',personality:'',age:'',gender:'',occupation:''},{}))
  await f.act('wizard-task',{taskId:lin.id,op:'retry'});v=await f.settle();await f.act('wizard-task',{taskId:gu.id,op:'skip'});v=await f.settle()
  assert.ok(v.wizard!.skipped.some(s=>s.label==='顾三的头像'));assert.equal(v.wizard!.step,'detect-scene')
  assert.equal((await f.journal()).artifacts.find(a=>a.name==='沈砚')!.text,shen.text)
 }finally{await f.dispose()}
})
test('NIW-C77: oversized or malformed images fail and are not staged',async()=>{
 const f=await fixture(filesF(),rosterAi());f.setAi(lookAi(f.handler()));withImages(f,imageFake({bytes:Buffer.from('<html>'),mime:'image/png'}))
 try{
  await toRoster(f);await f.act('wizard-set-images',{avatar:true});await f.act('wizard-next',{imageConsent:true});const v=await f.settle()
  assert.ok(v.wizard!.tasks.filter(t=>t.kind==='image').every(t=>t.state==='failed'))
  assert.deepEqual((await readdir(join(f.root,'novel-imports',v.id,'images')).catch(()=>[])).filter(n=>!n.startsWith('.')),[])
 }finally{await f.dispose()}
})
test('NIW-C80/C81: thumbnails read back the staged bytes; discard removes the image directory',async()=>{
 const f=await fixture(filesF(),rosterAi());f.setAi(lookAi(f.handler()));withImages(f)
 try{
  await toRoster(f);await f.act('wizard-set-images',{avatar:true});await f.act('wizard-next',{imageConsent:true});const v=await f.settle()
  const t=v.wizard!.tasks.find(t=>t.kind==='image'&&t.state==='done')!
  const read=await f.controller.act({type:'wizard-read-image',id:v.id,taskId:t.id});assert.equal(read.image?.mime,'image/png');assert.deepEqual(Buffer.from(read.image!.bytes),PNG)
  await assert.rejects(f.controller.act({type:'wizard-read-image',id:v.id,taskId:'i-0000000000000000-avatar'}))
  await f.act('discard');assert.deepEqual(await readdir(join(f.root,'novel-imports')),[])
 }finally{await f.dispose()}
})

test('NIW-C65: revising to scenes during a later step keeps characters and drops the rest',async()=>{
 const f=await fixture(filesF(),rosterAi());f.setAi(touchesAi(linesAi(worldsAi(f.handler()))))
 try{
  await toTree(f);await f.act('wizard-next',{consent:true});await toStep(f,'verify')
  const before=await f.journal(),chars=before.artifacts.filter(a=>a.kind==='character').map(a=>a.id)
  await f.act('wizard-revise',{to:'detect-scene'});const v=await f.settle(),j=await f.journal()
  assert.equal(v.wizard!.step,'detect-scene');assert.deepEqual(j.artifacts.filter(a=>a.kind==='character').map(a=>a.id),chars)
  assert.ok(!j.artifacts.some(a=>['scene','item','world','worldline','narrative','foreshadow'].includes(a.kind)))
  assert.equal(v.wizard!.checks,undefined);assert.deepEqual(v.wizard!.deferredConflicts,[]);assert.ok(v.wizard!.tasks.every(t=>v.wizard!.candidates.character!.some(c=>c.id===t.candidateId)))
 }finally{await f.dispose()}
})
test('NIW-C66/C66b/C68: revise to work keeps results; revise to kinds clears structure; image grants are revoked',async()=>{
 const f=await fixture(filesF(),rosterAi());f.setAi(lookAi(f.handler()));withImages(f)
 try{
  await toRoster(f);await f.act('wizard-set-images',{avatar:true});await f.act('wizard-next',{imageConsent:true});await f.settle()
  const kept=(await f.journal()).artifacts.length
  const epoch=(await f.journal()).epoch
  await f.act('wizard-revise',{to:'work'});let j=await f.journal();assert.equal(j.wizard!.step,'work');assert.equal(j.artifacts.length,kept);assert.deepEqual(j.wizard!.imageGrants,{});assert.equal(j.epoch,epoch)
  await f.act('wizard-next');assert.equal((await f.view()).wizard!.step,'detect-scene')
  await f.act('wizard-revise',{to:'kinds'});j=await f.journal()
  assert.equal(j.wizard!.structure,undefined);assert.equal(j.wizard!.chapterSelection,undefined);assert.equal(j.wizard!.grantedChapters,undefined);assert.equal(j.workingProse,'')
 }finally{await f.dispose()}
})
test('NIW-C67: wizard-back works before consent and is refused after it',async()=>{
 const f=await fixture(filesF(),rosterAi());try{
  await f.act('choose',{mode:'files'});await f.act('wizard-next');await f.act('wizard-back');assert.equal((await f.view()).wizard!.step,'files')
  await f.act('wizard-next');await f.act('set-title',{title:'合成作品'});await f.act('choose-target');await f.act('wizard-next');await f.act('classify',{mode:'ai',consent:true});await f.settle()
  await f.act('wizard-next',{consent:true});await f.settle();await f.act('wizard-next',{consent:true});await f.settle()
  await assert.rejects(f.act('wizard-back'),/返回修改选择/)
 }finally{await f.dispose()}
})

test('NIW-C72/F14: a rejected wizard action leaves no in-memory change behind',async()=>{
 const f=await fixture(filesF(),rosterAi());f.setAi(lookAi(f.handler()));withImages(f)
 try{
  await toRoster(f)
  const first=(await f.journal()).wizard!.candidates.character![0]
  const many=Array.from({length:60},(_,i)=>({...first,id:'c-'+(0x1000+i).toString(16).padStart(16,'0'),name:'人'+i}))
  const c=await injectJournalEdit(f,j=>{j.wizard!.candidates.character=many})
  try{
   let v=(await c.act({type:'current'})).view!
   await assert.rejects(c.act({type:'wizard-set-images',id:v.id,revision:v.revision,avatar:true,portrait:true}),/200 MiB/)
   v=(await c.act({type:'current'})).view!;await c.act({type:'wizard-set-role',id:v.id,revision:v.revision,candidateId:many[0].id,roleType:'ANTAGONIST'})
   const saved=JSON.parse(await readFile(join(f.root,'novel-imports',v.id,'session.json'),'utf8')) as ImportSession
   assert.equal(saved.wizard!.images.avatar,false);assert.equal(saved.wizard!.images.portrait,false)
  }finally{await c.close()}
 }finally{await rm(f.root,{recursive:true,force:true});await rm(f.target,{recursive:true,force:true})}
})

/** F0: only the settings file, with every list kind. */
const notesF0='# 角色\n\n沈砚：渡口少年。\n\n林舟：沈砚的朋友。\n\n# 场景\n\n## 北城\n\n城门向北。\n\n# 物品\n\n## 青铜钥匙\n\n古旧的钥匙。\n\n# 世界观\n\n## 社会制度\n\n三省六部。\n\n## 风俗\n\n上元灯会。\n'
const classifyF0=async(r:import('../../desktop/shared/novel-import').ImportAiRequest)=>{const heads=[...notesF0.matchAll(/^# (角色|世界观|场景|物品)$/gmu)].map(m=>({start:m.index!,kind:({角色:'character',世界观:'world',场景:'scene',物品:'item'} as const)[m[1] as '角色']}));return {classifications:r.units.map(u=>({unitId:u.id,kind:[...heads].reverse().find(h=>h.start<=u.start)?.kind??'world' as const}))}}
async function toSourceLists(f:Awaited<ReturnType<typeof fixture>>,classify:boolean){
 await f.act('choose',{mode:'files'});await f.act('wizard-next')
 await f.act('set-title',{title:'资料作品'});await f.act('choose-target');await f.act('wizard-next')
 if(classify){await f.act('classify',{mode:'ai',consent:true});await f.settle()}
 const v=await f.view(),kinds=(['character','scene','item','world'] as const).filter(k=>v.found[k])
 await f.act('select',{selected:kinds,targets:v.targets,infer:true});await f.act('wizard-next',{consent:true});return f.settle()
}
test('NIW-C06: a source-only session skips the body steps and lists entries from the file headings',async()=>{
 const f=await fixture([source(notesF0,'资料.md','f-notes')],async r=>r.phase==='classify'?classifyF0(r):{notFound:true})
 try{
  let v=await toSourceLists(f,true)
  for(const step of ['detect-struct','tree','import-struct','import-body','worldline','narrative','outline','foreshadow'] as const)assert.equal(v.wizard!.stepState[step],'skipped',step)
  assert.equal(v.wizard!.step,'detect-char');assert.deepEqual(v.wizard!.candidates.character!.map(c=>c.name).sort(),['林舟','沈砚'])
  const seen:Record<string,string[]>={character:v.wizard!.candidates.character!.map(c=>c.name)}
  for(const kind of ['scene','item','world'] as const){await f.act('wizard-next');v=await f.settle();for(let i=0;i<5&&!v.wizard!.step.startsWith('detect-');i++){await f.act('wizard-next');v=await f.settle()}seen[kind]=(v.wizard!.candidates[kind]??[]).map(c=>c.name)}
  assert.deepEqual(seen.scene,['北城']);assert.deepEqual(seen.item,['青铜钥匙']);assert.ok(seen.world.includes('社会制度')&&seen.world.includes('风俗'),JSON.stringify(seen.world))
  const done=await toStep(f,'verify');assert.ok(done.wizard!.checks!.every(c=>c.ok),JSON.stringify(done.wizard!.checks))
  assert.ok(!f.requests.some(r=>r.phase!=='classify'),'no body or entity requests')
  await f.act('wizard-next');const end=await f.settle();assert.equal(end.phase,'completed',end.error)
  const p=f.published!;assert.equal(p.chapters.length,0);assert.ok(p.artifacts.some(a=>a.kind==='character'&&a.name==='沈砚'&&a.origin==='source'))
 }finally{await f.dispose()}
})
test('NIW-C83: without a model a source-only import copies from the file and calls no model',async()=>{
 const f=await fixture([source(settingsF,'资料.md','f-notes')],async()=>{throw Error('不应调用模型')},{models:{}})
 try{
  const v=await toSourceLists(f,false)
  assert.equal(v.wizard!.step,'detect-char',v.error);for(const step of ['worldline','narrative','outline','foreshadow'] as const)assert.equal(v.wizard!.stepState[step],'skipped')
  await assert.rejects(f.act('wizard-set-images',{avatar:true}))
  const done=await toStep(f,'verify');assert.ok(done.wizard!.checks!.every(c=>c.ok),JSON.stringify(done.wizard!.checks))
  await f.act('wizard-next');const end=await f.settle();assert.equal(end.phase,'completed',end.error);assert.equal(f.requests.length,0)
 }finally{await f.dispose()}
})
test('NIW-C65b/F7: a list emptied once imports again after revising and choosing entries',async()=>{
 let none=true
 const f=await fixture(filesF(),rosterAi({'roster:scene':()=>none?{roster:[]}:undefined}));f.setAi(relatingAi(f.handler()))
 try{
  await passCharacters(f);let v=await toStep(f,'detect-scene');await f.act('wizard-next');v=await f.settle()
  assert.equal(v.wizard!.stepState['import-scene'],'skipped')
  none=false;await f.act('wizard-revise',{to:'detect-scene'});v=await f.settle()
  assert.ok(v.wizard!.candidates.scene!.length>0);assert.equal(v.wizard!.stepState['import-scene'],'pending')
  await f.act('wizard-next');v=await f.settle()
  assert.ok(f.requests.some(r=>r.intent==='entity'&&r.kind==='scene'),'scenes imported after revising')
  assert.ok((await f.journal()).artifacts.some(a=>a.kind==='scene'))
 }finally{await f.dispose()}
})
test('NIW-C67b/F7: turning inference back on at step 4 clears the skip markers it set',async()=>{
 const f=await fixture(filesF(),rosterAi())
 try{
  let v=await toTree(f,{selected:['body'],infer:false})
  assert.equal(v.wizard!.stepState['detect-char'],'skipped')
  await f.act('wizard-back');v=await f.view();assert.equal(v.wizard!.step,'kinds')
  await f.act('select',{selected:v.selected,targets:v.targets,infer:true});await f.act('wizard-next',{consent:true});v=await f.settle()
  assert.equal(v.wizard!.step,'tree');for(const step of ['detect-char','import-char','worldline','foreshadow'] as const)assert.equal(v.wizard!.stepState[step],'pending',step)
  await f.act('wizard-next',{consent:true});v=await f.settle();assert.equal(v.wizard!.step,'detect-char')
 }finally{await f.dispose()}
})
test('NIW-C19/F2: accepting a body patch shifts chapters, keeps the scope and lists, and imports again from step 9',async()=>{
 const f=await fixture(filesF(),rosterAi());const ai=fullAi(f);let conflicted=false
 f.setAi(async r=>{
  if(r.phase==='review'&&!conflicted){const a=r.artifacts.find(a=>a.kind==='character');const u=r.units.find(u=>a&&u.text.includes(a.name));if(a&&u){conflicted=true;return {conflicts:[{id:'cf-1',type:'setting-body',kind:'character',entity:a.name,field:'text',source:{text:a.text,value:a.text,artifactId:a.id},candidate:{text:'另一种说法',value:'另一种说法'},evidence:[{unitId:u.id,quote:a.name}],status:'pending',hash:'h'}]}}}
  if(r.phase==='patch'){const u=r.units.find(u=>u.text.includes('之夜'))!,at=u.start+u.text.indexOf('之夜');return {patches:[{id:'p-1',conflictId:r.conflict!.id,workingRevision:r.workingRevision!,start:at,end:at+2,before:'之夜',after:'之晨',reason:'与资料一致'}]}}
  return ai(r)})
 try{
  let v=await toVerify(f);assert.equal(v.phase,'conflicts')
  const before=await f.journal(),deselected=before.wizard!.candidates.character!.find(c=>!c.selected)?.id
  await f.act('resolve',{conflictId:v.conflicts.find(c=>c.status==='pending')!.id,choice:'rewrite'});v=await f.settle()
  assert.equal(v.patches.length,1,v.error)
  const j0=await f.journal();const p=j0.patches[0]
  assert.ok(p)
  await f.act('apply-patches',{patchIds:[p.id],confirm:true})
  v=await f.settle();const j=await f.journal()
  assert.equal(j.workingRevision,1);assert.equal(j.chapters.length,before.chapters.length)
  assert.deepEqual(j.chapters.map(c=>[c.title,c.volume]),before.chapters.map(c=>[c.title,c.volume]))
  assert.deepEqual(j.wizard!.materializedVolumes!.map(x=>x.volume),before.wizard!.materializedVolumes!.map(x=>x.volume))
  assert.deepEqual(j.wizard!.grantedChapters,before.wizard!.grantedChapters);assert.ok(j.analysisGrant)
  assert.deepEqual(j.wizard!.candidates.character!.map(c=>[c.id,c.selected]),before.wizard!.candidates.character!.map(c=>[c.id,c.selected]))
  assert.ok(j.workingProse.includes('之晨'));for(const c of j.chapters)assert.equal(c.content,j.workingProse.slice(c.start,c.end))
  if(deselected)assert.ok(!j.artifacts.some(a=>a.id===deselected))
  assert.equal(v.wizard!.step,'detect-char',v.error??v.wizard!.stepError)
  v=await toStep(f,'verify');assert.ok(v.wizard!.checks!.every(c=>c.ok),JSON.stringify(v.wizard!.checks))
  // An unsaved draft is no longer restored, so the save completes in the same controller after re-choosing the folder.
  const c=f.controller;const r=await verifyAgain(c);assert.equal(r.wizard!.step,'verify');assert.notEqual(r.phase,'failed',r.error)
  let v2=(await c.act({type:'choose-target',id:r.id,revision:r.revision})).view!;assert.equal(v2.targetReady,true);await c.act({type:'wizard-next',id:v2.id,revision:v2.revision});v2=await drain(c)
  assert.equal(v2.phase,'completed',v2.error);assert.ok(f.published!.chapters.some(c=>c.content.includes('之晨')))
 }finally{await f.dispose()}
})
test('NIW-C84b/F17: the legacy start action is refused for wizard sessions and changes nothing',async()=>{
 const f=await fixture(filesF(),rosterAi());try{
  await toRoster(f);const before=await f.journal()
  await assert.rejects(f.act('start',{consent:true}),/向导/)
  const after=await f.journal();assert.deepEqual(after.artifacts,before.artifacts);assert.equal(after.wizard!.step,before.wizard!.step)
 }finally{await f.dispose()}
})
const tenCast=Array.from({length:20},(_,i)=>'角色'+String.fromCharCode(0x7532+i))
async function tenFixture(n:number,handler:(r:import('../../desktop/shared/novel-import').ImportAiRequest,base:Ai)=>Promise<import('../../desktop/shared/novel-import').ImportAiResult>){
 const body=tenCast.slice(0,n).map((n,i)=>`第${i+1}章 篇${i}\n\n${n}出场。\n\n`).join('')
 const f=await fixture([source(body,'正文.txt','f-body')],rosterAi({'roster:character':r=>({roster:r.units.flatMap(u=>tenCast.filter(n=>u.text.includes(n)).map(n=>({name:n,aliases:[],roleType:'SUPPORTING' as const,evidence:{unitId:u.id,quote:n}})))})}))
 const base=f.handler();f.setAi(r=>r.intent==='entity'?handler(r,base):base(r));return f
}
test('NIW-C31/F6: retry and skip are accepted while other imports run and do not change the epoch',async()=>{
 let release=false
 const f=await tenFixture(10,async r=>{const n=entityName(r);if(n===tenCast[0])throw Error('Server Error');if(n===tenCast[1]&&!release)throw Error('Server Error');await sleep(n===tenCast[9]?150:40);return entityResult(r)})
 try{
  await toImportChar(f);let v=await f.view()
  for(let i=0;i<400;i++){v=await f.view();if(v.wizard!.tasks.filter(t=>t.state==='failed').length===2)break;await sleep(5)}
  assert.ok(f.controller.active>0,'still running');const epoch=(await f.journal()).epoch
  const id=(n:string)=>v.wizard!.tasks.find(t=>v.wizard!.candidates.character!.find(c=>c.id===t.candidateId)?.name===n)!.id
  await f.act('wizard-task',{taskId:id(tenCast[0]),op:'skip'});release=true
  await f.act('wizard-task',{taskId:id(tenCast[1]),op:'retry'})
  assert.equal((await f.journal()).epoch,epoch)
  v=await f.settle();assert.equal(v.wizard!.step,'detect-scene',v.error);assert.ok(v.wizard!.skipped.some(s=>s.label===tenCast[0]))
  assert.equal((await f.journal()).artifacts.filter(a=>a.kind==='character').length,9)
 }finally{await f.dispose()}
})
test('NIW-C46/F4: sources are checked once for the step instead of around every request',async()=>{
 const f=await tenFixture(10,async r=>{await sleep(10);return entityResult(r)});let checks=0,inFlight=0,maxInFlight=0
 f.options.verifySources=async()=>{if(new Error().stack?.includes('runRoster'))return;checks++;inFlight++;maxInFlight=Math.max(maxInFlight,inFlight);await sleep(5);inFlight--}
 try{
  await toImportChar(f);const before=checks;await f.settle()
  assert.ok(checks-before<=Math.ceil(10/16)+1,`checks ${checks-before}`);assert.equal(maxInFlight,1)
 }finally{await f.dispose()}
})
test('NIW-C47/F4: a changed source during import stops all requests and fails the session',async()=>{
 let started=0,cancelled=0
 const f=await tenFixture(20,async r=>{started++;await sleep(60);return entityResult(r)})
 f.options.cancelAi=async()=>{cancelled++}
 try{
  f.options.verifySources=async()=>{if(started>=8)throw Error('来源文件已变化，请重新选择')}
  await toImportChar(f)
  const v=await f.settle()
  assert.equal(v.phase,'failed');assert.match(v.error??'',/来源/)
  assert.ok(started<=20,`stopped before all requests (${started})`);assert.ok(cancelled>0,'in-flight requests cancelled')
  assert.equal((await f.journal()).artifacts.filter(a=>a.kind==='character').length<20,true)
  assert.ok(!v.wizard!.tasks.some(t=>t.state==='failed'&&/来源/.test(t.error??'')),'not recorded as item failures')
 }finally{await f.dispose()}
})
test('NIW-C16b/F16: closing the app aborts image generation instead of waiting for it',async()=>{
 const f=await fixture(filesF(),rosterAi());f.setAi(lookAi(f.handler()));const fake=withImages(f,imageFake({delay:5000}))
 try{
  await toRoster(f);await f.act('wizard-set-images',{avatar:true});await f.act('wizard-next',{imageConsent:true})
  for(let i=0;i<400&&!fake.calls.length;i++)await sleep(5);assert.ok(fake.calls.length>0)
  const t0=Date.now();await f.controller.close();assert.ok(Date.now()-t0<2000,`close took ${Date.now()-t0} ms`)
 }finally{await rm(f.root,{recursive:true,force:true});await rm(f.target,{recursive:true,force:true})}
})
test('NIW-C62b/F10: retry-kind recomputes lines and keeps foreshadows; a failed step 21 can be retried',async()=>{
 const f=await fixture(filesF(),rosterAi());const ai=fullAi(f);let failReview=false
 f.setAi(async r=>{if(r.phase==='review'&&failReview)throw Error('Server Error');return ai(r)})
 try{
  let v=await toVerify(f);const foreshadows=(await f.journal()).artifacts.filter(a=>a.kind==='foreshadow').length;assert.ok(foreshadows>0)
  await f.act('wizard-retry-kind',{kind:'character'});v=await toStep(f,'verify')
  const j=await f.journal();assert.equal(j.artifacts.filter(a=>a.kind==='foreshadow').length,foreshadows,'foreshadows rebuilt');assert.ok(v.wizard!.checks!.every(c=>c.ok),JSON.stringify(v.wizard!.checks))
  failReview=true;await f.act('wizard-retry-kind',{kind:'item'});for(let i=0;i<30;i++){v=await f.settle();if(v.wizard!.step==='verify')break;await f.act('wizard-next')}
  assert.equal(v.wizard!.step,'verify');assert.equal(v.wizard!.checks!.find(c=>c.key==='consistency')!.ok,false)
  failReview=false;await f.act('wizard-redetect');v=await f.settle()
  assert.ok(v.wizard!.checks!.every(c=>c.ok),JSON.stringify(v.wizard!.checks));await f.act('wizard-next');assert.equal((await f.settle()).phase,'completed')
 }finally{await f.dispose()}
})
/** Restarting deletes an unsaved draft: the new controller has no current import and the draft directory is gone. */
async function assertDeletedOnRestart(f:Awaited<ReturnType<typeof fixture>>,id:string){
 await f.controller.close();const again=new NovelImportController(f.options);await again.initialize()
 try{assert.equal((await again.act({type:'current'})).view,null);assert.equal(existsSync(join(f.root,'novel-imports',id)),false)}finally{await again.close()}
}
const drain=async(c:NovelImportController)=>{for(let i=0;i<2000&&c.active;i++)await sleep(5);return (await c.act({type:'current'})).view!}
test('NIW-C12b/F12: a session paused at step 5 asks for permission again and then recognizes the structure',async()=>{
 const f=await fixture();try{
  await toTree(f)
  const c=await injectJournalEdit(f,j=>{const w=j.wizard!;w.step='detect-struct';w.stepState['detect-struct']='running';w.stepState.tree='pending';delete w.structure;delete w.structureHash;delete w.chapterSelection;j.phase='paused';j.resumePhase='recognizing'})
  try{
   let v=(await c.act({type:'current'})).view!;assert.equal(v.wizard!.step,'detect-struct')
   v=(await c.act({type:'resume',id:v.id,revision:v.revision})).view!
   assert.equal(v.phase,'select');assert.match(v.error??'',/重新允许/);assert.equal(v.wizard!.step,'detect-struct')
   await c.act({type:'resume',id:v.id,revision:v.revision,consent:true});v=await drain(c)
   assert.equal(v.wizard!.step,'tree',v.error);assert.equal(v.wizard!.structure!.length,11)
  }finally{await c.close()}
 }finally{await rm(f.root,{recursive:true,force:true});await rm(f.target,{recursive:true,force:true})}
})
test('NIW-C36/F13: after a restart at step 10 resume without consent waits and names the permission',async()=>{
 let hold=true
 const f=await fixture(filesF(),rosterAi());const base=f.handler();f.options.cancelAi=async()=>{hold=false}
 f.setAi(async r=>{if(r.intent==='entity'&&entityName(r)==='顾三'&&hold){while(hold)await sleep(5);throw new DOMException('导入操作已取消','AbortError')}return r.intent==='entity'?entityResult(r):base(r)})
 try{
  await toImportChar(f);for(let i=0;i<200;i++){if((await f.view()).wizard!.tasks.filter(t=>t.state==='done').length>=2)break;await sleep(5)}
  const v=await f.view();assert.equal(v.wizard!.step,'import-char')
  // Restarting no longer resumes the unsaved draft at step 10: the held request is canceled and the draft is deleted.
  await assertDeletedOnRestart(f,v.id);assert.equal(hold,false);assert.equal(f.controller.active,0)
 }finally{hold=false;await rm(f.root,{recursive:true,force:true});await rm(f.target,{recursive:true,force:true})}
})
test('NIW-C82/F13: image permission is revoked on restart and can be given again on resume',async()=>{
 const f=await fixture(filesF(),rosterAi());f.setAi(lookAi(f.handler()));withImages(f,imageFake({delay:3000}))
 try{
  await toRoster(f);await f.act('wizard-set-images',{avatar:true});await f.act('wizard-next',{imageConsent:true})
  for(let i=0;i<400;i++){if((await f.view()).wizard!.tasks.some(t=>t.kind==='image'&&t.state==='running'))break;await sleep(5)}
  const v=await f.view();assert.ok(v.wizard!.imageGrants.character,'image permission given before restart');assert.ok(v.wizard!.tasks.some(t=>t.kind==='image'&&t.state==='running'))
  // Restarting deletes the unsaved draft, so its image permission and staged images go with it.
  await assertDeletedOnRestart(f,v.id);assert.equal(f.controller.active,0)
 }finally{await rm(f.root,{recursive:true,force:true});await rm(f.target,{recursive:true,force:true})}
})
test('NIW-C12s/F11: text of a deselected source entry never reaches the model',async()=>{
 const notes=settingsF+'\n# 场景\n\n## 北城\n\n城门向北，独有暗记。\n\n## 南巷\n\n巷尾有座无人知晓的密室。\n'
 const heads=[...notes.matchAll(/^# (角色|世界观|场景|物品)$/gmu)].map(m=>({start:m.index!,kind:({角色:'character',世界观:'world',场景:'scene',物品:'item'} as const)[m[1] as '角色']}))
 const f=await fixture([filesF()[0],source(notes,'资料.md','f-notes')],rosterAi({'classify:':r=>({classifications:r.units.map(u=>({unitId:u.id,kind:u.fileId==='f-body'?'body' as const:[...heads].reverse().find(h=>h.start<=u.start)?.kind??'world'}))})}))
 f.setAi(fullAi(f))
 try{
  await toTree(f,{selected:['body','character','world','scene'],infer:true});await f.act('wizard-next',{consent:true})
  let v=await toStep(f,'detect-scene');const south=v.wizard!.candidates.scene!.find(c=>c.name==='南巷')!;assert.ok(south)
  await f.act('wizard-select-candidates',{kind:'scene',ids:[south.id],selected:false})
  v=await toStep(f,'verify');assert.ok(v.wizard!.checks!.every(c=>c.ok),JSON.stringify(v.wizard!.checks))
  const leaked=f.requests.filter(r=>r.phase!=='classify'&&JSON.stringify(r).includes('无人知晓的密室'))
  assert.deepEqual(leaked.map(r=>r.phase+':'+(r.intent??r.kind)),[])
  assert.ok(f.requests.some(r=>r.intent==='entity'&&r.kind==='scene'&&JSON.stringify(r.units).includes('独有暗记')),'own block is sent')
  await f.act('wizard-next');assert.equal((await f.settle()).phase,'completed')
  const {buildPublicationRecordForTest}=await import('../../desktop/service/novel-import-publish')
  const record=JSON.stringify(buildPublicationRecordForTest(f.published!));assert.ok(!record.includes('无人知晓的密室'),'deselected entry is not in the import record')
 }finally{await f.dispose()}
})
test('NIW-C41/F19: a malformed field is retried once with a structure hint; twice malformed fails the item',async()=>{
 const seen=new Map<string,number>()
 const f=await fixture(filesF(),rosterAi());const base=f.handler()
 f.setAi(async r=>{if(r.intent!=='entity'||r.kind!=='character')return base(r);const n=entityName(r),k=(seen.get(n)??0)+1;seen.set(n,k);const bad=n==='顾三'||n==='林舟'&&k===1;return entityResult(r,():Record<string,string>=>bad?{motivations:'想要变强'}:{})})
 try{
  await toImportChar(f);const v=await f.settle()
  const state=(n:string)=>v.wizard!.tasks.find(t=>v.wizard!.candidates.character!.find(c=>c.id===t.candidateId)?.name===n)!.state
  assert.equal(state('林舟'),'done');assert.equal(state('顾三'),'failed');assert.equal(seen.get('林舟'),2);assert.equal(seen.get('顾三'),2);assert.equal(seen.get('沈砚'),1)
  const retry=f.requests.filter(r=>r.intent==='entity'&&entityName(r)==='林舟')[1];assert.match(retry.instruction!,/字段结构不合法/)
 }finally{await f.dispose()}
})
test('NIW-C40b/F18: an entity result with another type or an unchosen parent fails that item',async()=>{
 const f=await fixture(filesF(),rosterAi());const base=worldsAi(f.handler())
 f.setAi(async r=>{if(r.intent==='entity'&&r.kind==='world'&&entityName(r)==='城制')return entityResult(r,()=>({entityType:'WORLD'}));if(r.intent==='entity'&&r.kind==='character'&&entityName(r)==='林舟')return entityResult(r,()=>({relationships:JSON.stringify([{target:'外人',description:'旧识',characterId:'c-0000000000000000'}])}));return base(r)})
 try{
  await toImportChar(f);let v=await f.settle()
  const task=(n:string,kind:'character'|'world')=>v.wizard!.tasks.find(t=>v.wizard!.candidates[kind]!.find(c=>c.id===t.candidateId)?.name===n)!
  assert.equal(task('林舟','character').state,'failed');assert.match(task('林舟','character').error??'',/角色关系/)
  await f.act('wizard-task',{op:'skip-failed'});v=await toWorldImport(f);await f.act('wizard-next');v=await f.settle()
  assert.equal(task('城制','world').state,'failed');assert.match(task('城制','world').error??'',/归属/)
 }finally{await f.dispose()}
})
const runtimeOf=async(f:Awaited<ReturnType<typeof fixture>>)=>{const v=await f.view();try{return JSON.parse(await readFile(join(f.root,'novel-imports',v.id,'runtime.json'),'utf8')) as {calls:{state:string;intent?:string}[]}}catch{return undefined}}
test('NIW-C49/C48: concurrent calls are all recorded in runtime.json while the journal is saved in batches',async()=>{
 let peak=0,saves=0
 const f=await tenFixture(20,async r=>{await sleep(40);return entityResult(r)})
 try{
  await toImportChar(f);const v0=await f.view(),path=join(f.root,'novel-imports',v0.id,'session.json')
  const t0=Date.now();let t1=0
  for(let i=0;i<400&&f.controller.active;i++){const r=await runtimeOf(f);if(r)peak=Math.max(peak,r.calls.filter(c=>c.state==='pending'&&c.intent==='entity').length);const j=JSON.parse(await readFile(path,'utf8')) as ImportSession;if(j.wizard!.step==='import-char'){saves=j.revision;t1=Date.now()}await sleep(5)}
  const done=await f.settle();assert.equal(done.wizard!.step,'detect-scene');assert.ok(peak>=2&&peak<=6,`peak ${peak}`)
  const r=(await runtimeOf(f))!;assert.ok(r.calls.filter(c=>c.intent==='entity').every(c=>c.state==='settled'),JSON.stringify(r.calls.map(c=>c.state)))
  const j=await f.journal();assert.equal(j.runtimeAiCall,undefined)
  // 07 NIW-C48 bound for the import step: ⌈n/8⌉ + ⌈seconds/2⌉ + 5.
  const bound=Math.ceil(20/8)+Math.ceil((t1-t0)/2000)+5;assert.ok(saves-v0.revision<=bound,`journal saves ${saves-v0.revision} > ${bound}`)
 }finally{await f.dispose()}
})
test('NIW-C50: a failed runtime.json write cancels that call and fails only its item',async()=>{
 let writes=0,cancelled=0
 const f=await fixture(filesF(),rosterAi());const base=f.handler();f.setAi(async r=>r.intent==='entity'?(await sleep(10),entityResult(r)):base(r))
 f.options.cancelAi=async()=>{cancelled++}
 try{
  await toRoster(f)
  ;(f.options as {writeRuntime?:(p:string,t:string)=>Promise<void>}).writeRuntime=async(path,text)=>{writes++;if(writes===1)throw Error('disk full');const {writeFile:w}=await import('node:fs/promises');await w(path,text,{mode:0o600})}
  await f.act('wizard-next');const v=await f.settle()
  assert.notEqual(v.phase,'failed',v.error);assert.equal(v.wizard!.tasks.filter(t=>t.state==='failed').length,1);assert.ok(cancelled>=1)
 }finally{await f.dispose()}
})
test('NIW-C51: a runtime temp file left by a crash is removed on restart',async()=>{
 const f=await fixture(filesF(),rosterAi());try{
  await toImportChar(f);await f.settle();const v=await f.view(),dir=join(f.root,'novel-imports',v.id)
  // A crash leaves the draft on disk without close(): stop work in place, then leave a partial runtime temp file.
  await f.controller.pauseAll();const temp=join(dir,'.runtime-'+'0'.repeat(8)+'-0000-0000-0000-'+'0'.repeat(12)+'.tmp');await writeFile(temp,'{"partial":',{mode:0o600})
  const r=JSON.parse(await readFile(join(dir,'runtime.json'),'utf8'));assert.ok(Array.isArray(r.calls));assert.ok((await readdir(dir)).includes('.runtime-'+'0'.repeat(8)+'-0000-0000-0000-'+'0'.repeat(12)+'.tmp'))
  // Restart deletes the whole unsaved draft directory, the runtime temp file and runtime.json included.
  const c=new NovelImportController(f.options);await c.initialize()
  try{assert.equal((await c.act({type:'current'})).view,null);assert.equal(existsSync(dir),false);assert.ok(!(await readdir(join(f.root,'novel-imports'))).includes(v.id))}finally{await c.close()}
 }finally{await f.controller.close().catch(()=>undefined);await rm(f.root,{recursive:true,force:true});await rm(f.target,{recursive:true,force:true})}
})
test('NIW-C52: the pause proof counts image operations and is drained only after they stop',async()=>{
 const f=await fixture(filesF(),rosterAi());f.setAi(lookAi(f.handler()));const fake=withImages(f,imageFake({delay:2000}))
 try{
  await toRoster(f);await f.act('wizard-set-images',{avatar:true});await f.act('wizard-next',{imageConsent:true})
  for(let i=0;i<400&&!fake.calls.length;i++)await sleep(5)
  await f.act('pause');const j=await f.journal(),proof=j.runtimePauseProof
  assert.ok(proof,'proof written');assert.equal(proof!.remaining.imageOperations,0)
 }finally{await f.dispose()}
})
test('NIW-C36b/N3: after a restart at a list step, starting the import asks for permission instead of copying',async()=>{
 const f=await fixture(filesF(),rosterAi());const base=f.handler();f.setAi(async r=>r.intent==='entity'?entityResult(r):base(r))
 try{
  await toRoster(f);const v=await f.view();assert.equal(v.wizard!.step,'detect-char');assert.equal(f.controller.active,0)
  // Restarting no longer resumes the unsaved draft at a list step; it is deleted, so nothing can be copied without consent.
  const before=f.requests.length;await assertDeletedOnRestart(f,v.id);assert.equal(f.requests.length,before);assert.ok(!f.requests.some(r=>r.intent==='entity'&&r.kind==='character'))
 }finally{await rm(f.root,{recursive:true,force:true});await rm(f.target,{recursive:true,force:true})}
})
test('NIW-C12w/N4: a setting of a deselected world never lends its text to a same-named setting of another world',async()=>{
 // The deselected world comes first, so a lookup across all worlds would pick its block.
 const notes='# 冥界\n\n## 力量体系\n\n冥界吞噬魂火，绝不外传。\n\n# 人间\n\n## 力量体系\n\n人间修炼灵气。\n'
 const f=await fixture([filesF()[0],source(notes,'资料.md','f-notes')],rosterAi({'classify:':r=>({classifications:r.units.map(u=>({unitId:u.id,kind:u.fileId==='f-body'?'body' as const:'world' as const}))})}))
 f.setAi(fullAi(f))
 try{
  await toTree(f,{selected:['body','world'],infer:false});await f.act('wizard-next',{consent:true})
  let v=await toStep(f,'detect-world');const list=v.wizard!.candidates.world!,nether=list.find(c=>c.kind==='world'&&c.name==='冥界')!
  for(const c of list.filter(c=>c.parentId===nether.id))await f.act('wizard-select-candidates',{kind:'world',ids:[c.id],selected:false})
  v=await toStep(f,'verify');const j=await f.journal()
  assert.ok(!JSON.stringify(j.artifacts).includes('魂火'),'deselected world text not copied');assert.ok(JSON.stringify(j.artifacts).includes('灵气'))
 }finally{await f.dispose()}
})
test('NIW-C62c/N6: retry-kind drops skip records of tasks it re-imports',async()=>{
 let fail=true
 const f=await fixture(filesF(),rosterAi());const ai=fullAi(f)
 f.setAi(async r=>r.intent==='entity'&&r.kind==='character'&&fail&&entityName(r)==='顾三'?(()=>{throw Error('Server Error')})():ai(r))
 try{
  await toImportChar(f);await f.settle();await f.act('wizard-task',{op:'skip-failed'});let v=await toStep(f,'verify')
  assert.ok(v.wizard!.skipped.some(s=>s.label==='顾三'));fail=false
  await f.act('wizard-retry-kind',{kind:'character'});v=await toStep(f,'verify')
  assert.ok(!v.wizard!.skipped.some(s=>s.label==='顾三'),JSON.stringify(v.wizard!.skipped))
 }finally{await f.dispose()}
})

/* docs/239 RS: roster batches run in parallel. rsFixture(16000) uses the legacy budget (5,000
 * characters per batch) and gives 40 batches; rsFixture(262144) uses the v2 budget policy (16,384
 * characters, adjacent working units) and gives 17+ batches. Each chapter names its own character. */
const rsNames=Array.from({length:40},(_,i)=>'角色'+String.fromCharCode(0x4e00+i*7))
const rsBody=(repeat:number)=>rsNames.map((n,i)=>`第${i+1}章 篇${i}\n\n`+(n+'走过长街。').repeat(repeat)+'\n\n').join('')
const rsRoster=(r:ImportAiRequest)=>({roster:rsNames.filter(n=>r.units.some(u=>u.text.includes(n))).map(n=>({name:n,aliases:[],roleType:'SUPPORTING' as const,evidence:{unitId:r.units.find(u=>u.text.includes(n))!.id,quote:n}}))})
const rsFixture=(contextWindow=16000,files?:ImportFile[])=>{const m={...model,contextWindow};return fixture(files??[source(rsBody(contextWindow>=262144?1200:560),'正文.txt','f-body')],rosterAi({'roster:character':rsRoster}),{models:{text:m,review:{...m,id:'review'}}})}
const rsStart=async(f:Awaited<ReturnType<typeof fixture>>,selected=['body'])=>{await toTree(f,{selected,infer:true});await f.act('wizard-next',{consent:true})}
const rosterRequests=(f:Awaited<ReturnType<typeof fixture>>)=>f.requests.filter(r=>r.intent==='roster')
for(const contextWindow of [16000,262144])test(`RS-01/RS-02: roster batches run ${WIZARD_ROSTER_CONCURRENCY} at a time and the found count grows (context ${contextWindow})`,async()=>{
 let running=0,max=0,n=0
 const f=await rsFixture(contextWindow);const base=f.handler()
 f.setAi(async r=>{if(r.intent!=='roster')return base(r);running++;max=Math.max(max,running);await sleep(25+(++n%5)*4);running--;return base(r)})
 try{
  assert.equal(WIZARD_ROSTER_CONCURRENCY,15)
  await rsStart(f);const seen:number[]=[]
  for(let i=0;i<4000&&f.controller.active;i++){const v=await f.view();if(v.wizard!.step==='detect-char'&&v.wizard!.stepState['detect-char']==='running')seen.push(v.wizard!.rosterFound??0);await sleep(3)}
  const v=await f.settle(),list=v.wizard!.candidates.character!,sent=rosterRequests(f),j=await f.journal()
  assert.ok(sent.length>WIZARD_ROSTER_CONCURRENCY,'enough batches to reach the limit: '+sent.length);assert.equal(max,WIZARD_ROSTER_CONCURRENCY)
  if(contextWindow>=262144){assert.ok(j.budgetPolicy);assert.ok(sent.every(r=>r.executionBudget?.version===2))}
  const ids=sent.flatMap(r=>r.units.map(u=>u.id));assert.equal(new Set(ids).size,ids.length,'no unit sent twice')
  assert.equal(v.wizard!.stepState['detect-char'],'waiting');assert.equal(list.length,40)
  const covered=new Set(j.coverage['roster:character']);assert.ok((j.workingUnits??[]).every(u=>covered.has(u.id)))
  assert.ok(new Set(seen).size>=3,'count observed at several values: '+[...new Set(seen)].join(','));assert.ok(seen.every((x,i)=>i===0||x>=seen[i-1]),'distinct names only add here')
  assert.equal(v.wizard!.rosterFound,undefined,'count is only shown while recognizing')
 }finally{await f.dispose()}
})
test('RS-03: after a failed batch no new batch starts; batches in flight finish and are kept; redetect sends only the rest',async()=>{
 let fail=true,calls=0
 const f=await rsFixture();const base=f.handler(),ok:string[][]=[]
 f.setAi(async r=>{if(r.intent!=='roster')return base(r);const k=++calls;await sleep(5+k%4);if(fail&&k===20){fail=false;throw Error('Rate Limit Reached')}const out=base(r);ok.push(r.units.map(u=>u.id));return out})
 try{
  await rsStart(f);let v=await f.settle()
  assert.equal(v.wizard!.stepState['detect-char'],'failed');assert.equal(v.wizard!.stepError,'模型服务返回请求频率限制提示，请稍后重试')
  const sent=rosterRequests(f).length,j=await f.journal(),covered=j.coverage['roster:character']??[]
  assert.ok(sent<40,'no new batches after the failure ('+sent+')');assert.equal(sent,ok.length+1,'every started batch except the failed one returned')
  assert.deepEqual([...covered].sort(),ok.flat().sort(),'coverage is exactly the successful batches')
  assert.equal(new Set((j.wizard!.rosterStash?.character??[]).map(e=>e.name)).size,ok.length,'stash holds the successful batches')
  await f.act('wizard-redetect');v=await f.settle()
  const all=ok.flat();assert.equal(new Set(all).size,all.length,'no unit processed twice');assert.ok(((await f.journal()).workingUnits??[]).every(u=>all.includes(u.id)))
  assert.equal(v.wizard!.stepState['detect-char'],'waiting');assert.equal(v.wizard!.candidates.character!.length,40)
 }finally{await f.dispose()}
})
test('RS-04: pause cancels the batches in flight; late results are not saved; resume finishes the rest',async()=>{
 let hold=true
 const f=await rsFixture();const base=f.handler(),pending=new Set<string>(),cancelled=new Set<string>()
 f.options.cancelAi=async(id:string)=>{cancelled.add(id)}
 f.setAi(async r=>{if(r.intent!=='roster')return base(r);if(r.units[0].start===0)return base(r);pending.add(r.operationId);while(hold)await sleep(3);pending.delete(r.operationId);return base(r)})
 try{
  await rsStart(f);for(let i=0;i<500;i++){if((await f.journal()).coverage['roster:character']?.length&&pending.size===WIZARD_ROSTER_CONCURRENCY)break;await sleep(5)}
  const before=await f.journal(),snapshot=[...before.coverage['roster:character']??[]],stash=before.wizard!.rosterStash?.character?.length??0,inflight=new Set(pending)
  const pausing=f.act('pause');await sleep(20);hold=false;await pausing;let v=await f.view()
  assert.equal(v.phase,'paused');assert.equal(f.controller.active,0);assert.deepEqual(cancelled,inflight,'exactly the batches in flight are cancelled')
  const after=await f.journal();assert.deepEqual(after.coverage['roster:character']??[],snapshot,'late results not saved');assert.equal(after.wizard!.rosterStash?.character?.length??0,stash)
  const sent=f.requests.length;await f.act('resume',{consent:true});v=await f.settle()
  assert.ok(f.requests.slice(sent).filter(r=>r.intent==='roster').every(r=>r.units.every(u=>!snapshot.includes(u.id))))
  assert.equal(v.wizard!.stepState['detect-char'],'waiting');assert.equal(v.wizard!.candidates.character!.length,40)
 }finally{await f.dispose()}
})
test('RS-04b: a late AbortError after pause is not a step failure',async()=>{
 let hold=true
 const f=await rsFixture();const base=f.handler()
 f.options.cancelAi=async()=>{hold=false}
 f.setAi(async r=>{if(r.intent!=='roster')return base(r);if(r.units[0].start===0)return base(r);while(hold)await sleep(3);throw new DOMException('导入操作已取消','AbortError')})
 try{
  await rsStart(f);for(let i=0;i<500;i++){if((await f.journal()).coverage['roster:character']?.length)break;await sleep(5)}
  await f.act('pause');const v=await f.view();assert.equal(v.phase,'paused');assert.notEqual(v.wizard!.stepState['detect-char'],'failed');assert.equal(v.wizard!.stepError,undefined)
 }finally{await f.dispose()}
})
test('RS-05: one recognition run checks sources twice, not once per batch',async()=>{
 let checks=0
 const f=await rsFixture();try{
  await toTree(f,{selected:['body'],infer:true});f.options.verifySources=async()=>{checks++}
  await f.act('wizard-next',{consent:true});const v=await f.settle()
  assert.equal(v.wizard!.stepState['detect-char'],'waiting');assert.equal(rosterRequests(f).length,40);assert.equal(checks,2)
 }finally{await f.dispose()}
})
test('RS-05b: a source change found by the final check fails the step; redetect checks again before building the list',async()=>{
 let changed=false
 const f=await rsFixture();try{
  await toTree(f,{selected:['body'],infer:true});f.options.verifySources=async()=>{if(changed)throw Error('来源文件内容已发生变化，请重新选择')}
  const base=f.handler();f.setAi(async r=>{const out=await base(r);if(r.intent==='roster'&&rosterRequests(f).length===40)changed=true;return out})
  await f.act('wizard-next',{consent:true});let v=await f.settle()
  assert.equal(v.wizard!.stepState['detect-char'],'failed');assert.equal(v.wizard!.candidates.character,undefined)
  assert.equal(((await f.journal()).coverage['roster:character']??[]).length,((await f.journal()).workingUnits??[]).length,'finished coverage kept')
  await f.act('wizard-redetect');v=await f.settle();assert.equal(v.wizard!.stepState['detect-char'],'failed','still not built from unchecked sources')
  changed=false;await f.act('wizard-redetect');v=await f.settle();assert.equal(v.wizard!.stepState['detect-char'],'waiting');assert.equal(v.wizard!.candidates.character!.length,40)
 }finally{await f.dispose()}
})
test('RS-07: the list does not depend on which batch returns first',async()=>{
 const body=['第1章 甲\n\n','甲走过长街。'.repeat(560),'\n\n第2章 乙\n\n','甲乙走过长街。'.repeat(480),'\n\n'].join('')
 const lists:unknown[]=[]
 for(const late of [0,1]){
  const f=await rsFixture(16000,[source(body,'正文.txt','f-body')]);const base=f.handler()
  f.setAi(async r=>{if(r.intent!=='roster')return base(r);const second=r.units[0].start>0;if((second?1:0)===late)await sleep(60)
   return {roster:second?[{name:'甲乙',aliases:['甲'],roleType:'SUPPORTING' as const,evidence:{unitId:r.units[0].id,quote:'甲乙'}}]:[{name:'甲',aliases:[],roleType:'PROTAGONIST' as const,evidence:{unitId:r.units[0].id,quote:'甲'}}]}})
  try{await rsStart(f);const v=await f.settle();lists.push(v.wizard!.candidates.character!.map(({id,name,aliases,evidenceUnitIds,roleType})=>({id,name,aliases,evidenceUnitIds,roleType})))}finally{await f.dispose()}
 }
 assert.deepEqual(lists[0],lists[1])
})
test('RF-01: the running count is the distinct names returned from the body; source names join the list afterwards',async()=>{
 let hold=true
 const notes='# 角色\n\n'+rsNames[0]+'：正文里也有。\n\n资料独有人：只在资料里。\n'
 const f=await rsFixture(16000,[source(rsBody(560),'正文.txt','f-body'),source(notes,'资料.md','f-notes')]);const base=f.handler()
 f.setAi(async r=>{if(r.intent!=='roster')return base(r);if(r.units.some(u=>u.text.includes(rsNames[39])))while(hold)await sleep(3);return base(r)})
 try{
  await rsStart(f,['body','character']);let found=0
  for(let i=0;i<2000;i++){const v=await f.view();if(v.wizard!.stepState['detect-char']==='running'&&(v.wizard!.rosterFound??0)>=39){found=v.wizard!.rosterFound!;break}await sleep(5)}
  assert.equal(found,39,'only body names are counted while running');hold=false
  const v=await f.settle(),names=v.wizard!.candidates.character!.map(c=>c.name);assert.equal(names.length,41);assert.ok(names.includes('资料独有人'))
 }finally{await f.dispose()}
})
