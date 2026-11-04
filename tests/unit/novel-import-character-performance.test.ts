import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFile} from 'node:fs/promises'
import {join} from 'node:path'
import * as ai from '../../desktop/service/novel-import-ai'
import {acquireLongTask,longTaskQueue} from '../../src/lib/long-task'
import type {ImportAiRequest} from '../../desktop/shared/novel-import'
import type {ResolvedModel} from '../../src/lib/ai/provider'
import {fixture,source,rosterAi,entityResult,toImportChar,sleep} from '../helpers/novel-import-wizard-fixture'

const names=Array.from({length:64},(_,i)=>'性能角色'+String(i).padStart(2,'0')),scenes=Array.from({length:8},(_,i)=>'性能场景'+i)
async function performanceFixture(){
 const body=names.map((n,i)=>`第${i+1}章 篇${i}\n\n${n}走过${scenes[i%scenes.length]}。\n\n`).join('')
 const roster=(labels:string[])=>((r:ImportAiRequest)=>({roster:r.units.flatMap(u=>labels.filter(name=>u.text.includes(name)).map(name=>({name,aliases:[],roleType:'SUPPORTING' as const,evidence:{unitId:u.id,quote:name}})))}))
 const f=await fixture([source(body,'正文.txt','f-body')],rosterAi({'roster:character':roster(names),'roster:scene':r=>({roster:roster(scenes)(r).roster.map(({roleType:_role,...c})=>c)})})),base=f.handler()
 const pending=new Map<string,{request:ImportAiRequest;resolve:()=>void;reject:()=>void}>(),canceled=new Set<string>();let open=false,running=0,peak=0,sceneRunning=0,scenePeak=0
 const output=(r:ImportAiRequest)=>entityResult(r,():Record<string,string>=>r.kind==='character'?{roleType:r.entityTarget!.roleType!,relationships:JSON.stringify([{target:r.entities!.find(e=>e.id!==r.entityTarget!.id)!.name,description:'合成关系',characterId:r.entities!.find(e=>e.id!==r.entityTarget!.id)!.id}])}:{})
 f.setAi(async r=>{
  if(r.intent!=='entity')return base(r)
  if(r.kind==='scene'){sceneRunning++;scenePeak=Math.max(scenePeak,sceneRunning);try{await sleep(30);return output(r)}finally{sceneRunning--}}
  running++;peak=Math.max(peak,running)
  try{if(!open)await new Promise<void>((resolve,reject)=>pending.set(r.operationId,{request:r,resolve,reject:()=>reject(new DOMException('已取消','AbortError'))}));return output(r)}finally{pending.delete(r.operationId);running--}
 })
 f.options.cancelAi=async id=>{const p=pending.get(id);if(p){canceled.add(id);p.reject()}}
 return {f,pending,canceled,get peak(){return peak},get scenePeak(){return scenePeak},releaseAll(){open=true;for(const p of pending.values())p.resolve()}}
}
async function until(check:()=>boolean|Promise<boolean>){const end=Date.now()+5000;while(!await check()){if(Date.now()>end)break;await sleep(5)}}
const runtime=async(f:Awaited<ReturnType<typeof fixture>>)=>JSON.parse(await readFile(join(f.root,'novel-imports',(await f.view()).id,'runtime.json'),'utf8'))

test('CP-13a/CP-01: characters reach 31 concurrent requests and the eight scenes use their own pool',async()=>{
 const p=await performanceFixture(),f=p.f
 try{
  await toImportChar(f);await until(()=>p.pending.size===31);assert.equal(p.pending.size,31)
  await until(async()=>(await runtime(f)).calls.filter((c:{state:string})=>c.state==='pending').length===31)
  assert.equal((await runtime(f)).calls.filter((c:{state:string})=>c.state==='pending').length,31)
  p.releaseAll();let v=await f.settle();assert.equal(p.peak,31);assert.equal(v.wizard!.step,'detect-scene');assert.ok(v.wizard!.tasks.every(t=>t.state==='done'))
  const j=await f.journal();assert.deepEqual(j.artifacts.map(a=>a.id).sort(),j.wizard!.candidates.character!.map(c=>c.id).sort());assert.deepEqual(j.wizard!.dropped,[])
  await f.act('wizard-next');v=await f.settle();assert.equal(p.scenePeak,8);assert.ok(v.wizard!.tasks.every(t=>t.state==='done'))
 }finally{p.releaseAll();await f.dispose()}
})

test('CP-13b/CP-04: pausing drains exactly 31 pending calls and resume preserves the eight committed characters',async()=>{
 const p=await performanceFixture(),f=p.f
 const cache=(f.controller as unknown as {runtimeScopeCache:{resolve(s:unknown,g:unknown,compute:()=>string):string}}).runtimeScopeCache,resolve=cache.resolve.bind(cache);let computes=0;cache.resolve=(s,g,compute)=>resolve(s,g,()=>{computes++;return compute()})
 try{
  await toImportChar(f);await until(()=>p.pending.size===31);assert.equal(p.pending.size,31)
  for(const pending of [...p.pending.values()].slice(0,8))pending.resolve()
  await until(async()=>p.pending.size===31&&(await f.journal()).wizard!.tasks.filter(t=>t.state==='done').length===8)
  const before=await f.journal(),done=before.wizard!.tasks.filter(t=>t.state==='done').map(t=>t.candidateId!),inflight=new Set(p.pending.keys());assert.equal(done.length,8);assert.equal(inflight.size,31);assert.equal(computes,1)
  await f.act('pause');const paused=await f.journal()
  assert.deepEqual(p.canceled,inflight);assert.deepEqual(paused.artifacts,before.artifacts);assert.equal(f.controller.active,0)
  assert.equal(paused.runtimePauseProof!.state,'drained');assert.equal(paused.runtimePauseProof!.calls.length,31);assert.ok(Object.values(paused.runtimePauseProof!.remaining).every(n=>n===0))
  p.releaseAll();await f.act('resume',{consent:true});const v=await f.settle();assert.equal(v.wizard!.step,'detect-scene');assert.ok(v.wizard!.tasks.every(t=>t.state==='done'))
  const requests=f.requests.filter(r=>r.intent==='entity'&&r.kind==='character');for(const id of done)assert.equal(requests.filter(r=>r.entityTarget!.id===id).length,1)
  assert.equal(requests.length,64+31);assert.equal(computes,2,'resume computes a new epoch scope while keeping completed tasks')
 }finally{p.releaseAll();await f.dispose()}
})

const api=ai as typeof ai&{importGenerationModel?:(request:ImportAiRequest,resolved:ResolvedModel,model:Record<string,unknown>)=>ResolvedModel;runImportGenerationLane?:<T>(request:ImportAiRequest,work:()=>Promise<T>)=>Promise<T>}
const character={semanticVersion:1,phase:'analyze',intent:'entity',kind:'character'} as ImportAiRequest
test('CP-02: production generation policy limits light thinking to roster and character/scene/item entity extraction (docs/493)',()=>{
 assert.equal(typeof api.importGenerationModel,'function')
 const resolved={model:{} as ResolvedModel['model'],modelRecord:{} as ResolvedModel['modelRecord'],providerOptions:{openai:{store:false},original:{kept:true}} as unknown as ResolvedModel['providerOptions']},saved={provider:'deepseek',protocol:'openai',modelId:'deepseek-flash',thinkingLevels:['low','high'],defaultThinking:'high'},before=structuredClone(saved)
 const light=api.importGenerationModel!(character,resolved,saved);assert.deepEqual(light.providerOptions,{openai:{store:false},original:{kept:true},deepseek:{thinking:{type:'disabled'}}});assert.equal(light.model,resolved.model);assert.deepEqual(saved,before)
 for(const request of [{...character,intent:'roster'},{...character,kind:'scene'},{...character,intent:undefined},{...character,kind:'scene',intent:undefined},{...character,kind:'item'},{...character,kind:'world'},{...character,intent:'reconcile'},{...character,phase:'review'},{...character,phase:'patch'},{...character,semanticVersion:undefined}]){
  const output=api.importGenerationModel!(request as ImportAiRequest,resolved,saved)
  assert.equal(output===resolved,request.intent!=='roster'&&!((request.kind==='scene'||request.kind==='item'||request.kind==='world')&&request.intent==='entity'))
 }
 const anthropic=api.importGenerationModel!(character,resolved,{...saved,protocol:'anthropic'});assert.ok(!Object.hasOwn(anthropic.providerOptions!,'deepseek'))
})

test('CP-03: production character lane bypasses two occupied chat slots; ordinary imports wait',async()=>{
 assert.equal(typeof api.runImportGenerationLane,'function')
 const oldLimit=longTaskQueue.limit,first=await acquireLongTask(undefined,2),second=await acquireLongTask(undefined,2),controller=new AbortController();let ordinaryEntered=false
 try{
  const result=await api.runImportGenerationLane!(character,async()=>{const release=await acquireLongTask(controller.signal,2);release();return 'character-done'})
  assert.equal(result,'character-done');assert.equal(longTaskQueue.active,2);assert.equal(longTaskQueue.waiting,0)
  const ordinary=api.runImportGenerationLane!({...character,intent:undefined},async()=>{const release=await acquireLongTask(controller.signal,2);ordinaryEntered=true;release()})
  await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(ordinaryEntered,false);assert.equal(longTaskQueue.waiting,1)
  first();await ordinary;assert.equal(ordinaryEntered,true)
 }finally{controller.abort();first();second();longTaskQueue.setLimit(oldLimit)}
})
