import assert from 'node:assert/strict'
import {test} from 'node:test'
import {fixture,toSceneRoster,allCuts,source} from '../helpers/novel-import-wizard-fixture'
import {runImportAi,generateImportAiJson} from '../../desktop/service/novel-import-ai'
import {StructuredGenerationError} from '../../src/lib/ai/generate'
import type {ImportAiRequest,ImportAiResult} from '../../desktop/shared/novel-import'
import type {ResolvedModel} from '../../src/lib/ai/provider'

// Six chapters, each naming one concrete place; the first two share a locator so a link task is planned.
const places=['甲城东宅的书房有蓝色墙壁。','甲城东宅的阅览室有红色墙壁。','丙城南宅的花厅有绿色墙壁。','丁城北宅的客堂有白色墙壁。','戊城中宅的暖阁有黄色墙壁。','己城外宅的茶室有灰色墙壁。']
const literal=(quote:string)=>quote.match(/的(.{2,3})有/u)![1],locator=(quote:string)=>quote.match(/^(.{4})的/u)![1]
const text=places.map((p,i)=>`第${i+1}章 地点${i}\n\n${p}${'风声。'.repeat(4000)}\n\n`).join('')
type Hook=(r:ImportAiRequest)=>void

async function sceneFixture(hook:Hook){
 const f=await fixture([source(text,'合成正文.txt','f-body')],async r=>{
  if(r.intent==='structure')return allCuts(r)
  if(r.phase==='classify')return {classifications:r.units.map(u=>({unitId:u.id,kind:'body'}))}
  hook(r)
  let raw:unknown
  if(r.sceneIdentity?.mode==='roster')raw={roster:places.flatMap(quote=>r.units.filter(u=>u.text.includes(quote)).map(u=>({name:literal(quote),aliases:[],mentions:[{literal:literal(quote),evidence:{unitId:u.id,quote}}],context:[{label:locator(quote),evidence:[{unitId:u.id,quote}]}],links:[]})))}
  // 486 adds a scene-list cleanup stage after links; this fixture keeps every entry (neutral answer).
  else if((r.sceneIdentity as {mode?:string}|undefined)?.mode==='cleanup')raw={sceneCleanup:(r.sceneIdentity as unknown as {focus:{index:number}[]}).focus.map(f=>({index:f.index,action:'keep'}))}
  else if(r.sceneIdentity?.mode==='links')raw={sceneIdentityDecisions:r.sceneIdentity.tasks.map(t=>({taskIndex:t.taskIndex,result:'unknown',evidence:[]}))}
  else return {notFound:true}
  return runImportAi(r,new AbortController().signal,{resolve:async role=>r.models[role]!,assert:async()=>{},generate:async(input,_m,signal,prompt)=>generateImportAiJson(input,{userId:'synthetic-retry',resolvedModel:{} as ResolvedModel},signal,prompt,{generateText:async()=>({text:JSON.stringify(raw),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'})})}) as Promise<ImportAiResult>
 })
 return f
}
const rosterRequests=(f:Awaited<ReturnType<typeof fixture>>)=>f.requests.filter(r=>r.sceneIdentity?.mode==='roster')
const touches=(r:ImportAiRequest,quote:string)=>r.units.some(u=>u.text.includes(quote))

test('SR-01: a structurally rejected roster batch is split and every unit is still recognized',async()=>{
 let rejected=0
 const f=await sceneFixture(r=>{if(r.sceneIdentity?.mode==='roster'&&r.units.length>1&&touches(r,places[3])&&rejected<2){rejected++;throw Error('模型返回结构不完整')}})
 try{
  const view=await toSceneRoster(f),s=await f.journal()
  assert.equal(view.wizard!.stepState['detect-scene'],'waiting',view.wizard!.stepError);assert.equal(view.wizard!.stepError,undefined)
  assert.ok(rejected>=1);assert.ok(rosterRequests(f).length>1,'the rejected batch was re-requested in smaller parts')
  assert.deepEqual([...s.coverage['roster:scene']!].sort(),s.workingUnits!.map(u=>u.id).sort())
  assert.equal(view.wizard!.candidates.scene!.length,places.length)
 }finally{await f.dispose()}
})

test('SR-02: a single unit that keeps failing stops after a bounded number of fresh attempts and keeps other progress',async()=>{
 let failing=0
 const f=await sceneFixture(r=>{if(r.sceneIdentity?.mode==='roster'&&touches(r,places[2])){failing++;throw Error('模型返回的场景清单结构无效（修复事务），请重新识别')}})
 try{
  const view=await toSceneRoster(f),s=await f.journal()
  assert.equal(view.wizard!.stepState['detect-scene'],'failed');assert.equal(view.wizard!.stepError,'模型返回的场景清单结构无效（修复事务），请重新识别')
  const single=rosterRequests(f).filter(r=>r.units.length===1&&touches(r,places[2])).length
  assert.equal(single,3,'one split request plus two fresh attempts for the isolated unit');assert.ok(failing>=3)
  const covered=new Set(s.coverage['roster:scene']);assert.ok(!s.workingUnits!.filter(u=>u.text.includes(places[2])).some(u=>covered.has(u.id)),'the failed unit is never marked covered')
  assert.ok(covered.size>0,'successful parts are kept for redetect')
 }finally{await f.dispose()}
})

test('SR-03: transport and authorization failures are not retried',async t=>{
 for(const message of ['模型接口请求失败（HTTP 500）','AUTHORIZATION_REVOKED','请重新允许发送本次导入范围','模型配置或授权已变化，未采用返回结果','本地服务已断开'])await t.test(message,async()=>{
  let calls=0
  const f=await sceneFixture(r=>{if(r.sceneIdentity?.mode==='roster'){calls++;throw Error(message)}})
  try{const view=await toSceneRoster(f);assert.equal(view.wizard!.stepState['detect-scene'],'failed');assert.equal(calls,rosterRequests(f).length);const ids=rosterRequests(f).flatMap(r=>r.units.map(u=>u.id));assert.equal(new Set(ids).size,ids.length,'no unit was requested again')}finally{await f.dispose()}
 })
})

test('SR-04: a structurally rejected identity link wave is re-planned and completed',async()=>{
 let rejected=0
 const f=await sceneFixture(r=>{if(r.sceneIdentity?.mode==='links'&&rejected<1){rejected++;throw Error('模型返回结构不完整')}})
 try{
  const view=await toSceneRoster(f),s=await f.journal()
  assert.ok(f.requests.filter(r=>r.sceneIdentity?.mode==='links').length>=2,'the rejected wave was planned again')
  assert.equal(view.wizard!.stepState['detect-scene'],'waiting',view.wizard!.stepError);assert.equal(rejected,1)
  assert.ok(s.wizard!.sceneIdentity!.linkTasks.every(task=>task.result),'every planned task has a decision after the retry wave')
 }finally{await f.dispose()}
})

test('SR-05: a root-level schema issue no longer renders empty brackets',()=>{
 assert.equal(new StructuredGenerationError('invalid_schema',['']).message,'模型返回结构不完整')
 assert.equal(new StructuredGenerationError('invalid_schema',['','roster']).message,'模型返回结构不完整（roster）')
 assert.equal(new StructuredGenerationError('invalid_schema',['classifications']).message,'模型返回结构不完整（classifications）')
})

test('SR-06: a link pair whose material cannot fit one request is recorded unknown and the rest is still planned',async()=>{
 const {createSceneIdentityLedger,appendSceneRosterBatch,planSceneIdentityLinkWave}=await import('../../desktop/core/novel-import-scene-identity')
 const quotes=['甲城东宅的书房有蓝色墙壁。','甲城东宅的阅览室有红色墙壁。','乙城西宅的花厅有绿色墙壁。','乙城西宅的暖阁有黄色墙壁。']
 let at=0;const units=quotes.map((text,i)=>{const u={id:'u'+i,fileId:'working-0',start:at,end:at+text.length,text,kind:'body' as const};at+=text.length;return u}),sources={workingRevision:0,workingUnits:units,sourceBlocks:[]}
 const records=quotes.map((quote,i)=>({name:literal(quote),aliases:[],mentions:[{literal:literal(quote),evidence:{unitId:'u'+i,quote}}],context:[{label:locator(quote),evidence:[{unitId:'u'+i,quote}]}],links:[]}))
 const ledger=appendSceneRosterBatch(createSceneIdentityLedger(sources),records,units,sources)
 // Only the 甲城 pair is too large for any request.
 const plan=planSceneIdentityLinkWave(ledger,sources,packet=>!packet.units.some(u=>u.id==='u0'),31)
 assert.equal(plan.pendingTaskCount,1);assert.equal(plan.packets.length,1);assert.equal(plan.packets[0].context.tasks.length,1)
 const unknown=plan.ledger.linkTasks.filter(t=>t.result);assert.equal(unknown.length,1);assert.deepEqual(unknown[0].result,{outcome:'unknown',evidence:[]})
 assert.equal(plan.ledger.relations.length,ledger.relations.length,'no relation is invented for the oversized pair')
 assert.equal(plan.ledger.identities.length,ledger.identities.length,'both places keep their own identity')
 const again=planSceneIdentityLinkWave(plan.ledger,sources,packet=>!packet.units.some(u=>u.id==='u0'),31)
 assert.equal(again.packets.filter(p=>p.units.some(u=>u.id==='u0')).length,0,'the recorded pair is not planned again')
})

test('SR-07: every per-batch scene roster reply failure is retried by splitting',async t=>{
 for(const message of ['场景绑定修复结构超过模型预算，请保留资料后重试','场景绑定修复答案无效，请按当前任务顺序完整作答','场景清单完整纠错资料超过模型预算，请保留资料后重试','场景清单定点修复事务无效，请完整修复指定记录并保留已核实资料','场景清单绑定修复决定无效，请逐项解决当前未证资料','场景清单错误无法定位到可修复记录，请重新识别','模型输出未完整结束'])await t.test(message,async()=>{
  let rejected=0
  const f=await sceneFixture(r=>{if(r.sceneIdentity?.mode==='roster'&&r.units.length>1&&touches(r,places[3])&&rejected<1){rejected++;throw Error(message)}})
  try{const view=await toSceneRoster(f),s=await f.journal();assert.equal(view.wizard!.stepState['detect-scene'],'waiting',view.wizard!.stepError);assert.equal(rejected,1);assert.deepEqual([...s.coverage['roster:scene']!].sort(),s.workingUnits!.map(u=>u.id).sort())}finally{await f.dispose()}
 })
})

test('SR-08: appending batches together gives the same members, records, relations and identities as one at a time',async()=>{
 const {createSceneIdentityLedger,appendSceneRosterBatch,appendSceneRosterBatches}=await import('../../desktop/core/novel-import-scene-identity')
 let at=0;const units=places.map((text,i)=>{const u={id:'u'+i,fileId:'working-0',start:at,end:at+text.length,text,kind:'body' as const};at+=text.length;return u}),sources={workingRevision:0,workingUnits:units,sourceBlocks:[]}
 const record=(i:number,links:{targetIndex:number;relation:'same-place'|'different-place'|'parent';evidence:{unitId:string;quote:string}[]}[]=[])=>({name:literal(places[i]),aliases:[],mentions:[{literal:literal(places[i]),evidence:{unitId:'u'+i,quote:places[i]}}],context:[{label:locator(places[i]),evidence:[{unitId:'u'+i,quote:places[i]}]}],links})
 const batches=[{records:[record(0),record(1,[{targetIndex:0,relation:'different-place',evidence:[{unitId:'u1',quote:places[1]}]}])],units:units.slice(0,2)},{records:[record(2)],units:units.slice(2,3)},{records:[record(3),record(4),record(5)],units:units.slice(3)}]
 const base=createSceneIdentityLedger(sources);let one=base;for(const b of batches)one=appendSceneRosterBatch(one,b.records,b.units,sources)
 const all=appendSceneRosterBatches(base,batches,sources),shape=(l:typeof one)=>({members:l.members,records:l.records,relations:l.relations,identities:l.identities.map(({id,memberKeys,recordKeys,state,nameParts,parent})=>({id,memberKeys,recordKeys,state,nameParts,parent}))})
 assert.deepEqual(shape(all),shape(one));assert.equal(all.identities.length,places.length)
})
