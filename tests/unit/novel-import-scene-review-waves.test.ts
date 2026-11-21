// Compatibility: controller cases here use genuine versionless scene journals.
import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {importReviewTaskKeys} from '../../desktop/core/novel-import-review-tasks'
import {workingImportUnits,importScopeHash} from '../../desktop/core/novel-import'
import {runImportGenerationLane,importGenerationModel,runImportAi} from '../../desktop/service/novel-import-ai'
import {acquireLongTask,longTaskQueue} from '../../src/lib/long-task'
import type {ImportAiRequest,ImportAiResult,ImportSession,ImportConflict} from '../../desktop/shared/novel-import'
import type {ResolvedModel} from '../../src/lib/ai/provider'
import {legacySceneFixture,source,rosterAi,entityResult,model,review,sleep,toImportScene} from '../helpers/novel-import-wizard-fixture'

// Synthetic text only. Exercise the original controller planner, ai/runtime,
// candidate journal writer and final validators, never a provider.
type F=Awaited<ReturnType<typeof legacySceneFixture>>
type Controller={session:ImportSession;operations:Set<string>;review(s:ImportSession,e:number):Promise<void>;serial<T>(f:()=>Promise<T>):Promise<T>;save:Function;recordRuntime:Function;owner:Function;candidateBlocked:boolean}
const c=(f:F)=>f.controller as unknown as Controller
const body='第一章 合成\n\n北城。'+('合成完整原文。'.repeat(6200))
const isBody=(r:Pick<ImportAiRequest,'instruction'>)=>r.instruction?.startsWith('核对资料与正文事实')??false
const empty=()=>({conflicts:[]} as ImportAiResult)
const clean=(r:ImportAiRequest)=>{const {operationId:_operation,executionLane:_lane,...rest}=r as ImportAiRequest&{executionLane?:string};return rest}
function conflict(r:ImportAiRequest,id='wave-conflict'):ImportConflict{return {id,hash:id,type:'body-body',kind:'scene',entity:'北城',field:'coordinates',source:{text:'合成甲',value:'甲',unitId:r.units[0].id},candidate:{text:'合成乙',value:'乙',unitId:r.units[0].id},evidence:[{unitId:r.units[0].id,quote:r.units[0].text.slice(0,8)}],status:'pending'}}
async function setup(){
 const base=rosterAi(),f=await legacySceneFixture([source(body,'正文.txt','f-body')],async r=>r.intent==='entity'?entityResult(r,()=>({coordinates:'0,0',exteriorDescription:'合成外观'})):base(r),{models:{text:model,review:{...review,contextWindow:8000}}})
 await toImportScene(f);await f.settle();assert.equal((await f.view()).wizard!.step,'verify')
 // Make multiple complete text/fact review packets without changing geometry.
 const s=c(f).session;s.artifacts[0].text='完整资料首。'+'合成场景介绍。'.repeat(160)+'完整资料尾。'
 s.coverage.review=[];s.coverage.reviewFacts=[];delete s.semanticState
 f.requests.length=0;return f
}
async function until(check:()=>boolean,label:string){for(let i=0;i<1000;i++){if(check())return;await sleep(5)}assert.ok(check(),label)}
function deferred(f:F){
 const pending:{request:ImportAiRequest;resolve:(v:ImportAiResult)=>void;reject:(e:unknown)=>void}[]=[],all:ImportAiRequest[]=[];let active=0,max=0,open=false
 f.setAi(async request=>{all.push(request);active++;max=Math.max(max,active);try{return open?empty():await new Promise<ImportAiResult>((resolve,reject)=>pending.push({request,resolve,reject}))}finally{active--}})
 return {pending,all,get max(){return max},get active(){return active},open(){open=true},release(){for(const p of pending.splice(0))p.resolve(empty())}}
}
async function sequentialPlan(f:F){
 const s=c(f).session,old=s.wizardVersion,wizard=s.wizard;delete s.wizardVersion;delete s.wizard
 f.setAi(async()=>empty());try{await c(f).review(s,s.epoch);return f.requests.map(clean)}finally{s.wizardVersion=old;s.wizard=wizard;s.coverage.review=[];s.coverage.reviewFacts=[];delete s.semanticState;f.requests.length=0}
}

test('RW01: one bounded wave preserves the original packets, body/facts barrier and author conflict gate',async()=>{
 const f=await setup();let done:Promise<void>|undefined,cleanup:(()=>void)|undefined
 try{
  const expected=await sequentialPlan(f),s=c(f).session,w=s.wizard,units=workingImportUnits(s).map(u=>u.id),keys=importReviewTaskKeys(s),gate=deferred(f),business=structuredClone({artifacts:s.artifacts,originalProse:s.originalProse,workingProse:s.workingProse,chapters:s.chapters,decisions:s.decisions})
  cleanup=()=>{gate.open();gate.release()};assert.ok(expected.filter(isBody).length>31);assert.ok(expected.filter(r=>!isBody(r)).length>=3)
  done=c(f).review(s,s.epoch);void done.catch(()=>{})
  await until(()=>gate.pending.length===31,'31 review packets start before awaiting their results')
  assert.equal(gate.all.length,31);assert.ok(gate.all.every(isBody));assert.equal(gate.active,31)
  const first=gate.pending.splice(0);first.at(-1)!.resolve({conflicts:[conflict(first.at(-1)!.request)]})
  for(const p of first.slice(0,-1).reverse())p.resolve(empty())
  await until(()=>gate.pending.length===expected.filter(isBody).length-31,'tail body wave is pending')
  assert.ok(gate.all.every(isBody),'no facts while the last body wave is still in flight');assert.ok(c(f).operations.size>0)
  gate.open();gate.release();await done
  assert.equal(gate.max,31);assert.equal(gate.active,0);assert.deepEqual(gate.all.map(clean),expected)
  const firstFact=gate.all.findIndex(r=>!isBody(r));assert.ok(gate.all.slice(0,firstFact).every(isBody));assert.ok(gate.all.slice(firstFact).every(r=>!isBody(r)))
  assert.deepEqual(s.coverage.review,units);assert.deepEqual(s.coverage.reviewFacts,keys);assert.equal(s.wizard,w,'runVerify must retain its live wizard object')
  assert.deepEqual({artifacts:s.artifacts,originalProse:s.originalProse,workingProse:s.workingProse,chapters:s.chapters,decisions:s.decisions},business)
  assert.equal(s.conflicts.filter(x=>x.status==='pending').length,1);await assert.rejects(f.act('wizard-next'),/处理校验/);assert.equal(f.published,undefined)
  const disk=await f.journal();assert.deepEqual(disk.coverage.reviewFacts,keys);assert.deepEqual(disk.coverage.review,units)
 }finally{cleanup?.();await done?.catch(()=>{});await f.dispose()}
})

test('RW02: a failed packet preserves other valid results, stops later waves, and resumes frozen fact keys in order',async t=>{
 for(const mode of ['model','late-evidence','facts-gap'] as const)await t.test(mode,async()=>{
  const f=await setup();let done:Promise<void>|undefined,cleanup:(()=>void)|undefined
  try{
   const expected=await sequentialPlan(f),s=c(f).session,keys=importReviewTaskKeys(s),gate=deferred(f)
   cleanup=()=>{gate.open();gate.release()};if(mode==='facts-gap')s.coverage.review=workingImportUnits(s).map(u=>u.id)
   done=c(f).review(s,s.epoch);void done.catch(()=>{})
   await until(()=>gate.pending.length===(mode==='facts-gap'?expected.filter(r=>!isBody(r)).length:31),'the complete first wave is in flight')
   const batch=gate.pending.splice(0),bad=batch[Math.floor(batch.length/2)],badIds=bad.request.units.map(u=>u.id)
   for(const p of batch.reverse()){
    if(p!==bad)p.resolve(empty())
    else if(mode==='late-evidence'){const raw=conflict(p.request);raw.evidence=[{unitId:p.request.units[0].id,quote:'RW-INVALID-PRIVATE-SYNTHETIC'}];p.resolve({conflicts:[raw]})}
    else p.reject(Error('模型返回结构或类别无效，请重试'))
   }
   await assert.rejects(done);assert.equal(gate.active,0);assert.equal(gate.all.length,batch.length,'no next wave after a failure')
   const partial=await f.journal();assert.equal(partial.conflicts.length,0,'late invalid results receive no conflict credit')
   if(mode!=='facts-gap')assert.deepEqual(partial.coverage.review,[...batch].reverse().filter(p=>p!==bad).flatMap(p=>p.request.units.map(u=>u.id)),'every other successful packet must be credited in original order')
   else {
    const factPackets=expected.filter(r=>!isBody(r));let offset=0
    const expectedCredit=factPackets.flatMap(r=>{const span=keys.slice(offset,offset+r.artifacts.length);offset+=r.artifacts.length;return JSON.stringify(r)===JSON.stringify(clean(bad.request))?[]:span})
    assert.equal(offset,keys.length);assert.deepEqual(partial.coverage.reviewFacts,expectedCredit,'every other full fact packet must be credited')
   }
   const credited=new Set(partial.coverage.review??[]),factCredit=new Set(partial.coverage.reviewFacts??[]),again:ImportAiRequest[]=[]
   f.setAi(async r=>{again.push(r);return empty()});await c(f).review(s,s.epoch)
   assert.ok(again.filter(isBody).flatMap(r=>r.units).every(u=>!credited.has(u.id)),'successful body units are not paid twice')
   assert.deepEqual(s.coverage.reviewFacts,keys,'facts resume restores original full task order')
   assert.deepEqual(s.coverage.review,workingImportUnits(s).map(u=>u.id));assert.ok(factCredit.size<keys.length||mode!=='facts-gap')
   assert.equal(new Set(s.coverage.reviewFacts).size,keys.length)
   if(mode==='facts-gap'){assert.equal(again.length,1,'only the failed full fact packet is retried');assert.deepEqual(clean(again[0]),clean(bad.request))}
  }finally{cleanup?.();await done?.catch(()=>{});await f.dispose()}
 })
})

test('RW03: serial-boundary invalidation and journal failures cannot credit uncommitted review work',async t=>{
 for(const mode of ['epoch','pause','authorization','source','queued-authorization','runtime','pre-rename','post-rename'] as const)await t.test(mode,async()=>{
  const f=await setup(),s=c(f).session,stateBefore=structuredClone(s.semanticState),original={save:c(f).save,recordRuntime:c(f).recordRuntime,owner:c(f).owner};let done:Promise<void>|undefined,unlock:(()=>void)|undefined,cleanup:(()=>void)|undefined
  try{
   const gate=deferred(f);cleanup=()=>{gate.open();gate.release()};let broken=false;const canceled=new Set<string>()
   f.options.cancelAi=async id=>{canceled.add(id);gate.pending.find(p=>p.request.operationId===id)?.reject(new DOMException('取消合成复核','AbortError'))}
   if(mode==='runtime')c(f).recordRuntime=async()=>{throw Error('合成runtime写入失败')}
   done=c(f).review(s,s.epoch);void done.catch(()=>{})
   if(mode==='runtime'){await until(()=>gate.all.length>0,'runtime call started');gate.release();await assert.rejects(done);assert.deepEqual(s.coverage.review,[]);assert.equal(c(f).operations.size,0);assert.equal(gate.active,0);assert.equal(canceled.size,gate.all.length);return}
   await until(()=>gate.pending.length===31,'31 controlled review requests')
   if(mode==='pause'){
    await f.act('pause');await assert.rejects(done);assert.equal(canceled.size,31);assert.equal(gate.active,0);assert.equal(c(f).operations.size,0)
    assert.deepEqual(s.coverage.review,[]);assert.equal(s.runtimePauseProof?.state,'drained');assert.ok(s.runtimePauseProof?.calls.every(call=>call.state==='settled'));return
   }
   if(mode==='queued-authorization'){
    const lock=new Promise<void>(resolve=>unlock=resolve);void c(f).serial(()=>lock)
   }
   const pending=gate.pending.splice(0);for(const p of pending)p.resolve(empty())
   if(mode==='epoch')s.epoch++
   else if(mode==='authorization'||mode==='queued-authorization'){
    if(mode==='queued-authorization')await until(()=>c(f).operations.size===0,'all ai final checks finish while commit waits for serial boundary')
    f.setModels({text:model,review:{...review,contextWindow:8000,authRevision:2}})
   }
   else if(mode==='source')f.options.verifySources=async()=>{throw Error('来源hash变化')}
   else if(mode==='pre-rename')c(f).save=async(candidate:ImportSession,...rest:unknown[])=>{if(candidate!==s){broken=true;throw Error('合成candidate写入失败')}return original.save.call(f.controller,candidate,...rest)}
   else if(mode==='post-rename'){
    c(f).save=async(candidate:ImportSession,notify:unknown,onCommit?:()=>void)=>{
     if(candidate===s)return original.save.call(f.controller,candidate,notify,onCommit)
     return original.save.call(f.controller,candidate,notify,()=>{onCommit?.();broken=true;throw Error('合成rename已提交后异常')})
    }
   }
   unlock?.();await assert.rejects(done)
   assert.equal(gate.all.length,31);assert.equal(gate.active,0)
   if(mode==='post-rename'){assert.ok(broken);assert.equal(c(f).candidateBlocked,true,'a committed uncertain write blocks subsequent work');await assert.rejects(f.act('wizard-next'))}
   else {assert.deepEqual(s.coverage.review,[]);assert.deepEqual((await f.journal()).coverage.review,[]);assert.equal(s.conflicts.length,0);assert.deepEqual(s.semanticState,stateBefore);if(mode==='pre-rename')assert.ok(broken)}
  }finally{unlock?.();cleanup?.();c(f).save=original.save;c(f).recordRuntime=original.recordRuntime;c(f).owner=original.owner;await done?.catch(()=>{});await f.dispose()}
 })
})

test('RW04 main control: combined targets retain one in-flight packet and never emit the review lane marker',async()=>{
 const f=await setup();let done:Promise<void>|undefined,cleanup:(()=>void)|undefined
 try{
  const s=c(f).session;s.targets=['scene','world'];s.analysisGrant!.hash=importScopeHash(s,'analyze');delete s.semanticState
  const gate=deferred(f);cleanup=()=>{gate.open();gate.release()};done=c(f).review(s,s.epoch);void done.catch(()=>{})
  await until(()=>gate.pending.length===1,'original sequential request starts');await new Promise<void>(r=>setImmediate(r));assert.equal(gate.all.length,1)
  gate.open();gate.release();await done;assert.equal(gate.max,1);assert.ok(gate.all.every(r=>(r as ImportAiRequest&{executionLane?:string}).executionLane===undefined))
 }finally{cleanup?.();await done?.catch(()=>{});await f.dispose()}
})

test('RW04: only the marked ordinary scene review bypasses chat slots and never changes review thinking',async()=>{
 const scope={semanticVersion:1,phase:'review',selectedTargets:['scene'],executionLane:'scene-review-wave-v1'} as unknown as ImportAiRequest
 const resolved={model:{},modelRecord:{},providerOptions:{deepseek:{thinking:{type:'enabled'}},openai:{store:false,reasoningEffort:'high'}}} as unknown as ResolvedModel
 assert.equal(importGenerationModel(scope,resolved,{provider:'deepseek',protocol:'openai',defaultThinking:'high',thinkingLevels:['low','high']}),resolved)
 const previous=longTaskQueue.limit,first=await acquireLongTask(undefined,2),second=await acquireLongTask(undefined,2),abort=new AbortController();let entered=false
 const pending=runImportGenerationLane(scope,async()=>{const release=await acquireLongTask(abort.signal,2);entered=true;release()});void pending.catch(()=>{})
 try{await new Promise<void>(r=>setImmediate(r));assert.equal(entered,true,'bounded review lane must reach its own scheduler');await pending;assert.equal(longTaskQueue.active,2);assert.equal(longTaskQueue.waiting,0)}
 finally{abort.abort();first();second();await pending.catch(()=>{});longTaskQueue.setLimit(previous)}
 for(const extra of [{executionLane:undefined},{conflict:{}},{selectedTargets:['scene','world']},{semanticVersion:undefined},{phase:'analyze'},{intent:'reconcile'}]){
  const input={...scope,...extra} as ImportAiRequest,a=await acquireLongTask(undefined,2),b=await acquireLongTask(undefined,2),stop=new AbortController();let ran=false
  const task=runImportGenerationLane(input,async()=>{const release=await acquireLongTask(stop.signal,2);ran=true;release()});void task.catch(()=>{})
  try{await new Promise<void>(r=>setImmediate(r));assert.equal(ran,false,'unmarked or ineligible requests retain the original slot')}
  finally{stop.abort();a();b();await task.catch(()=>{});longTaskQueue.setLimit(previous)}
 }
 const input={...scope,operationId:'rw-invalid-lane',units:[],artifacts:[],models:{text:model,review}} as ImportAiRequest
 let calls=0;await assert.rejects(runImportAi({...input,executionLane:'PRIVATE-INVALID-LANE'} as unknown as ImportAiRequest,new AbortController().signal,{resolve:async()=>{calls++;return review},assert:async()=>{},generate:async()=>empty()}),/通道|调度|lane/);assert.equal(calls,0)
})

test('RW03 RPC denial: fixed authorization messages remain global after RpcPeer discards error metadata',async t=>{
 for(const message of ['AUTHORIZATION_REVOKED','所选模型的密钥不可用，请在设置中重新配置'])await t.test(message,async()=>{
  const f=await setup(),s=c(f).session,before=structuredClone(s.semanticState),gate=deferred(f);let done:Promise<void>|undefined
  try{
   done=c(f).review(s,s.epoch);void done.catch(()=>{});await until(()=>gate.pending.length===31,'bounded wave with unchanged public model snapshots')
   const calls=gate.pending.splice(0);for(const [i,p]of calls.entries())i===15?p.reject(new Error(message)):p.resolve(empty())
   await assert.rejects(done);assert.equal(gate.all.length,31);assert.equal(gate.active,0)
   assert.deepEqual(s.coverage.review,[],'RPC authorization denial invalidates every success in the wave')
   assert.deepEqual((await f.journal()).coverage.review,[]);assert.deepEqual(s.semanticState,before)
  }finally{gate.open();gate.release();await done?.catch(()=>{});await f.dispose()}
 })
})
