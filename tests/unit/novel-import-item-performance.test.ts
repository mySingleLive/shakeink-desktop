import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {importGenerationModel,runImportGenerationLane,runImportAi,generateImportAiJson} from '../../desktop/service/novel-import-ai'
import {importScopeHash} from '../../desktop/core/novel-import'
import {importNativeMappings} from '../../desktop/core/novel-import-semantic-state'
import * as controllerModule from '../../desktop/main/novel-import'
import {acquireLongTask,longTaskQueue} from '../../src/lib/long-task'
import type {ImportAiRequest,ImportSession,ImportGrant} from '../../desktop/shared/novel-import'
import type {ImportRuntimeCallIdentity,ImportRuntimeProofTracker} from '../../desktop/core/novel-import-runtime-proof'
import type {ResolvedModel} from '../../src/lib/ai/provider'
import {fixture,source,rosterAi,entityResult,toImportItem,sleep} from '../helpers/novel-import-wizard-fixture'

/* docs/494. Synthetic item names only. Item 2 has an alias that appears alone in chapter 1. */
const names=Array.from({length:64},(_,i)=>'合成器物'+String(i).padStart(2,'0')),alias='合成别称乙'
type Fixture=Awaited<ReturnType<typeof fixture>>
async function itemFixture(){
 const body=names.map((n,i)=>`第${i+1}章 篇${i}\n\n他取出${n}。${i===0?names[1]+'也在桌上，旁边是'+alias+'。':''}${'风声。'.repeat(160)}\n\n`).join('')
 return fixture([source(body,'正文.txt','f-body')],rosterAi({'roster:item':r=>({roster:r.units.flatMap(u=>names.filter(n=>u.text.includes(n)).map(name=>({name,aliases:name===names[2]?[alias]:[],itemType:'器物',important:true,category:'item' as const,evidence:{unitId:u.id,quote:name}})))})}),{promptLayout:'legacy'})
}
async function until(check:()=>boolean|Promise<boolean>){const end=Date.now()+5000;while(!await check()){if(Date.now()>end)break;await sleep(5)}}
const runtime=async(f:Fixture)=>JSON.parse(await readFile(join(f.root,'novel-imports',(await f.view()).id,'runtime.json'),'utf8'))
/** The catalog JSON is the first instruction line; a correction hint follows on a new line. */
const catalogOf=(r:ImportAiRequest)=>{const line=r.instruction!.split('\n')[0];return JSON.parse(line.slice(line.indexOf('['))) as {id:string}[]}
function gated(f:Fixture){
 const base=f.handler(),pending=new Map<string,{resolve:()=>void;reject:()=>void}>(),canceled=new Set<string>();let open=false,running=0,peak=0
 f.setAi(async r=>{
  if(r.intent!=='entity')return base(r)
  running++;peak=Math.max(peak,running)
  try{if(!open)await new Promise<void>((resolve,reject)=>pending.set(r.operationId,{resolve,reject:()=>reject(new DOMException('已取消','AbortError'))}));return entityResult(r)}finally{pending.delete(r.operationId);running--}
 })
 f.options.cancelAi=async id=>{const p=pending.get(id);if(p){canceled.add(id);p.reject()}}
 return {pending,canceled,get peak(){return peak},releaseAll(){open=true;for(const p of pending.values())p.resolve()}}
}

test('IP-01: items reach 31 concurrent requests and every selected item is imported; other pools keep their sizes',async()=>{
 const pools=controllerModule as unknown as Record<string,number>;assert.equal(pools.WIZARD_ITEM_CONCURRENCY,31);assert.equal(pools.WIZARD_WORLD_CONCURRENCY,31,'world shares the 31 lanes since docs/506');assert.equal(pools.WIZARD_ENTITY_CONCURRENCY,undefined);assert.equal(pools.WIZARD_IMAGE_CONCURRENCY,2)
 const f=await itemFixture(),p=gated(f)
 try{
  await toImportItem(f);await until(()=>p.pending.size===31);assert.equal(p.pending.size,31)
  await until(async()=>(await runtime(f)).calls.filter((c:{state:string})=>c.state==='pending').length===31)
  assert.equal((await runtime(f)).calls.filter((c:{state:string})=>c.state==='pending').length,31)
  p.releaseAll();const v=await f.settle(),s=await f.journal();assert.equal(p.peak,31);assert.equal(v.wizard!.step,'verify')
  assert.ok(s.wizard!.tasks.every(t=>t.kind==='entity'),'no image tasks');assert.equal(s.wizard!.tasks.length,64);assert.ok(s.wizard!.tasks.every(t=>t.state==='done'))
  assert.deepEqual(s.artifacts.filter(a=>a.kind==='item').map(a=>a.id).sort(),s.wizard!.candidates.item!.map(c=>c.id).sort());assert.deepEqual(s.wizard!.dropped,[]);assert.deepEqual(s.wizard!.skipped,[])
 }finally{p.releaseAll();await f.dispose()}
})

test('IP-02: pausing drains exactly 31 pending item calls and resume keeps the eight committed items',async()=>{
 const f=await itemFixture(),p=gated(f)
 try{
  await toImportItem(f);await until(()=>p.pending.size===31)
  for(const pending of [...p.pending.values()].slice(0,8))pending.resolve()
  await until(async()=>p.pending.size===31&&(await f.journal()).wizard!.tasks.filter(t=>t.state==='done').length===8)
  const before=await f.journal(),done=before.wizard!.tasks.filter(t=>t.state==='done').map(t=>t.candidateId!),inflight=new Set(p.pending.keys());assert.equal(done.length,8);assert.equal(inflight.size,31)
  await f.act('pause');const paused=await f.journal()
  assert.deepEqual(p.canceled,inflight);assert.deepEqual(paused.artifacts,before.artifacts);assert.equal(f.controller.active,0)
  assert.equal(paused.runtimePauseProof!.state,'drained');assert.equal(paused.runtimePauseProof!.calls.length,31);assert.ok(Object.values(paused.runtimePauseProof!.remaining).every(n=>n===0))
  p.releaseAll();await f.act('resume',{consent:true});const v=await f.settle(),s=await f.journal();assert.equal(v.wizard!.step,'verify');assert.ok(s.wizard!.tasks.every(t=>t.state==='done'))
  const requests=f.requests.filter(r=>r.intent==='entity'&&r.kind==='item');for(const id of done)assert.equal(requests.filter(r=>r.entityTarget!.id===id).length,1)
  assert.equal(requests.length,64+31)
 }finally{p.releaseAll();await f.dispose()}
})

const item={semanticVersion:1,phase:'analyze',intent:'entity',kind:'item'} as ImportAiRequest
test('IP-03: item entity extraction uses the light policy; ordinary item analysis and other phases keep the original model',()=>{
 const resolved={model:{},modelRecord:{},providerOptions:{deepseek:{thinking:{type:'enabled'}},openai:{store:false}}} as unknown as ResolvedModel,saved={provider:'deepseek',protocol:'openai',modelId:'synthetic',thinkingLevels:['low','high'],defaultThinking:'high'},before=structuredClone(saved),options=structuredClone(resolved.providerOptions)
 const out=importGenerationModel(item,resolved,saved);assert.deepEqual(out.providerOptions,{deepseek:{thinking:{type:'disabled'}},openai:{store:false}});assert.equal(out.model,resolved.model);assert.deepEqual(resolved.providerOptions,options);assert.deepEqual(saved,before)
 for(const r of [{...item,intent:undefined},{...item,intent:'reconcile'},{...item,phase:'review'},{...item,phase:'patch'},{...item,kind:'world',intent:undefined},{...item,semanticVersion:undefined}])assert.equal(importGenerationModel(r as ImportAiRequest,resolved,saved),resolved)
 assert.equal(importGenerationModel(item,resolved,{...saved,protocol:'anthropic'}),resolved,'DeepSeek on the Anthropic protocol keeps its saved options')
})

test('IP-04: item entity requests bypass two occupied chat slots; ordinary item analysis waits',async()=>{
 const previous=longTaskQueue.limit,first=await acquireLongTask(undefined,2),second=await acquireLongTask(undefined,2),abort=new AbortController();let ordinaryEntered=false
 try{
  let entered=false;const lane=runImportGenerationLane(item,async()=>{const release=await acquireLongTask(abort.signal,2);entered=true;release();return 'item-done'});void lane.catch(()=>{})
  await new Promise<void>(r=>setImmediate(r));assert.equal(entered,true,'item requests must not queue behind chat slots');assert.equal(await lane,'item-done');assert.equal(longTaskQueue.active,2);assert.equal(longTaskQueue.waiting,0)
  const ordinary=runImportGenerationLane({...item,intent:undefined},async()=>{const release=await acquireLongTask(abort.signal,2);ordinaryEntered=true;release()})
  await new Promise<void>(r=>setImmediate(r));assert.equal(ordinaryEntered,false);assert.equal(longTaskQueue.waiting,1)
  first();await ordinary;assert.equal(ordinaryEntered,true)
 }finally{abort.abort();first();second();longTaskQueue.setLimit(previous)}
})

test('IP-05/IP-06: the scope is computed once, payloads stay distinct, and the prompt catalog is trimmed while entities stay complete',async()=>{
 const f=await itemFixture(),base=f.handler()
 type Cache={resolve(s:ImportSession,g:ImportGrant,compute:()=>string):string}
 const c=f.controller as unknown as {runtimeScopeCache:Cache;runtime:ImportRuntimeProofTracker;session:ImportSession;ai(s:ImportSession,e:number,r:unknown,verified:boolean):Promise<unknown>},original=c.runtimeScopeCache.resolve.bind(c.runtimeScopeCache)
 let computes=0,itemResolves=0,allResolves=0
 c.runtimeScopeCache.resolve=(s,g,compute)=>{allResolves++;if(s.wizard?.step==='import-item')itemResolves++;return original(s,g,()=>{computes++;return compute()})}
 const observed:ImportRuntimeCallIdentity[]=[],invoke=c.runtime.invoke.bind(c.runtime) as typeof c.runtime.invoke;c.runtime.invoke=<T>(id:ImportRuntimeCallIdentity,work:()=>Promise<T>)=>{if(id.intent==='entity')observed.push(structuredClone(id));return invoke(id,work)}
 // One item first answers with nothing, so the controller's single correction runs with its hint.
 let retried:string|undefined
 f.setAi(async r=>{if(r.intent!=='entity')return base(r);if(!retried&&r.entities!.find(e=>e.id===r.entityTarget!.id)!.name===names[5]){retried=r.entityTarget!.id;return {artifacts:[]}}return entityResult(r)})
 try{
  await toImportItem(f);await f.settle();const s=await f.journal(),list=s.wizard!.candidates.item!
  assert.ok(s.wizard!.tasks.every(t=>t.state==='done'))
  // docs/500: items use the indexed evidence protocol (IE-06 reverses the 494 IP-06 expectation).
  const again=f.requests.filter(r=>r.intent==='entity'&&r.entityTarget!.id===retried);assert.equal(again.length,2);assert.ok(again[1].instruction!.includes('sourceUnitIds由应用计算'));assert.ok(!again[1].instruction!.includes('sourceUnitIds与evidence.unitId逐字复制units[].id'))
  // IE-01: every request carries 1-8 verified options naming the item.
  for(const r of f.requests.filter(r=>r.intent==='entity')){const own=list.find(c=>c.id===r.entityTarget!.id)!,options=r.entityTarget!.evidenceOptions!;assert.ok(options.length>=1&&options.length<=8);for(const o of options){const u=r.units.find(u=>u.id===o.unitId)!;assert.ok(u.text.includes(o.quote));assert.ok([own.name,...own.aliases].some(n=>o.quote.includes(n)))}}
  assert.equal(itemResolves,65);assert.equal(computes,1);assert.equal(observed.length,65);const expected=importScopeHash(s,'analyze');assert.ok(observed.every(r=>r.scopeHash===expected));assert.equal(new Set(observed.map(r=>r.payloadHash)).size,65)
  let trimmed=false,related=false,aliasOnly=false
  for(const r of f.requests.filter(r=>r.intent==='entity')){
   assert.deepEqual(r.entities!.map(e=>e.id).sort(),list.map(c=>c.id).sort())
   const prose=r.units.map(u=>u.text).join(''),want=list.filter(c=>c.id===r.entityTarget!.id||[c.name,...c.aliases].some(n=>prose.includes(n))).map(c=>c.id).sort()
   const catalog=catalogOf(r);assert.deepEqual(catalog.map(c=>c.id).sort(),want);trimmed||=catalog.length<list.length;related||=catalog.length>1
   const aliased=list.find(c=>c.name===names[2])!;if(r.entityTarget!.id!==aliased.id&&prose.includes(alias)&&!prose.includes(names[2])){assert.ok(catalog.some(c=>c.id===aliased.id));aliasOnly=true}
  }
  assert.ok(trimmed);assert.ok(related);assert.ok(aliasOnly,'an item mentioned only by its alias stays in the catalog')
  // Negative cases: unverified calls and ordinary item analysis keep complete hashing.
  const resolvesBefore=allResolves,{operationId:_id,models:_models,...request}=f.requests.find(r=>r.intent==='entity')!
  await c.ai(c.session,c.session.epoch,request,false);assert.equal(allResolves,resolvesBefore,'unverified item calls keep full hashing')
  await c.ai(c.session,c.session.epoch,{...request,intent:undefined,entityTarget:undefined},true);assert.equal(allResolves,resolvesBefore,'ordinary item analysis keeps full hashing')
 }finally{await f.dispose()}
})

test('IE-03: a no-match item quote gets one controller correction that asks for an option index; persistent bad quotes fail',async()=>{
 for(const persistent of [false,true]){
  const f=await itemFixture(),base=f.handler();let target:string|undefined
  const bad=(r:ImportAiRequest)=>{const out=entityResult(r);out.artifacts![0].evidence=[{unitId:r.units[0].id,quote:'模型虚构的不存在原文片段'}];return out}
  f.setAi(async r=>{if(r.intent!=='entity')return base(r);const name=r.entities!.find(e=>e.id===r.entityTarget!.id)!.name;if(name!==names[7])return entityResult(r);target=r.entityTarget!.id
   const good=entityResult(r);good.artifacts![0].evidence=[{optionIndex:0} as never];delete (good.artifacts![0] as {sourceUnitIds?:string[]}).sourceUnitIds
   // Both generations of the first controller request misquote; the controller correction then cites an option.
   const answer=persistent||!r.instruction!.includes('\n')?bad(r):good
   return runImportAi(r,new AbortController().signal,{resolve:async()=>r.models.text,assert:async()=>{},generate:async(input,_m,signal,prompt)=>generateImportAiJson(input,{userId:'item-synthetic-user',resolvedModel:{} as ResolvedModel,maxNetworkRetries:0},signal,prompt,{generateText:async()=>({text:JSON.stringify(answer),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'})})})})
  try{
   await toImportItem(f);await f.settle();const s=await f.journal(),task=s.wizard!.tasks.find(t=>t.candidateId===target)!,requests=f.requests.filter(r=>r.intent==='entity'&&r.entityTarget!.id===target)
   assert.equal(requests.length,2,'exactly one controller correction');assert.ok(requests[1].entityTarget!.evidenceOptions?.length,'the correction keeps the verified options');assert.ok(requests[1].instruction!.includes('原文引文未通过定位校验'));assert.ok(requests[1].instruction!.includes('optionIndex'))
   if(persistent){assert.equal(task.state,'failed');assert.match(task.error!,/模型证据无法定位（no-match）/u)}
   else{assert.equal(task.state,'done');const a=s.artifacts.find(a=>a.id===target)!,option=requests[1].entityTarget!.evidenceOptions![0];assert.deepEqual(a.evidence,[{unitId:option.unitId,quote:option.quote}]);assert.deepEqual(a.sourceUnitIds,[option.unitId])}
  }finally{await f.dispose()}
 }
})

test('IC-02 controller: persistent invalid item facts fail after one controller request; valid panel facts map natively',async()=>{
 const f=await itemFixture(),base=f.handler();let target:string|undefined;const generations=new Map<string,number>()
 const panel={appearance:'合成外观',effects:JSON.stringify([{name:'合成',description:'合成作用'}]),aliases:'[]',tags:JSON.stringify(['合成'])}
 f.setAi(async r=>{if(r.intent!=='entity')return base(r);const name=r.entities!.find(e=>e.id===r.entityTarget!.id)!.name,bad=name===names[9];if(bad)target=r.entityTarget!.id
  const raw=entityResult(r,()=>bad?{...panel,effects:JSON.stringify({name:'非法'})}:panel)
  return runImportAi(r,new AbortController().signal,{resolve:async()=>r.models.text,assert:async()=>{},generate:async(input,_m,signal,prompt)=>generateImportAiJson(input,{userId:'item-synthetic-user',resolvedModel:{} as ResolvedModel,maxNetworkRetries:0},signal,prompt,{generateText:async()=>{generations.set(r.entityTarget!.id,(generations.get(r.entityTarget!.id)??0)+1);return {text:JSON.stringify(raw),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'}}})})})
 try{
  await toImportItem(f);await f.settle();const s=await f.journal(),task=s.wizard!.tasks.find(t=>t.candidateId===target)!
  assert.equal(f.requests.filter(r=>r.intent==='entity'&&r.entityTarget!.id===target).length,1,'the controller does not retry a used-up structural correction');assert.equal(generations.get(target!),2)
  assert.equal(task.state,'failed');assert.equal(task.attempts,1);assert.equal(task.error,'模型返回结构不完整（artifacts.0.facts）')
  const stored=s.artifacts.filter(a=>a.kind==='item');assert.equal(stored.length,63);assert.ok(stored.every(a=>a.schema===2&&a.facts.appearance==='合成外观'))
  const mapped=importNativeMappings(stored);assert.equal(mapped.projectableIds.length,63);assert.deepEqual(mapped.mappingWarnings,[])
 }finally{await f.dispose()}
})
