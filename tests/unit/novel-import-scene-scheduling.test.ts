// Compatibility: controller cases here use genuine versionless scene journals.
import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {runImportGenerationLane,importGenerationModel} from '../../desktop/service/novel-import-ai'
import {acquireLongTask,longTaskQueue} from '../../src/lib/long-task'
import type {ImportAiRequest,ImportSession,ImportGrant} from '../../desktop/shared/novel-import'
import type {ResolvedModel} from '../../src/lib/ai/provider'
import {legacySceneFixture,source,rosterAi,entityResult,sleep,toImportScene} from '../helpers/novel-import-wizard-fixture'
const request={semanticVersion:1,phase:'analyze',intent:'entity',kind:'scene'} as ImportAiRequest
test('SI-07a: scene lane uses its own scheduler and the extraction policy preserves unrelated model options',async()=>{
 const resolved={model:{},modelRecord:{},providerOptions:{deepseek:{thinking:{type:'enabled'}},openai:{store:false}}} as unknown as ResolvedModel
 const output=importGenerationModel(request,resolved,{provider:'deepseek',protocol:'openai',modelId:'synthetic',thinkingLevels:['low','high'],defaultThinking:'high'})
 assert.deepEqual(output.providerOptions,{deepseek:{thinking:{type:'disabled'}},openai:{store:false}});assert.deepEqual(resolved.providerOptions,{deepseek:{thinking:{type:'enabled'}},openai:{store:false}})
 const previous=longTaskQueue.limit,first=await acquireLongTask(undefined,2),second=await acquireLongTask(undefined,2),abort=new AbortController()
 let entered=false
 const pending=runImportGenerationLane(request,async()=>{const release=await acquireLongTask(abort.signal,2);entered=true;release();return 'scene-done'});void pending.catch(()=>{})
 try{await new Promise<void>(r=>setImmediate(r));assert.equal(entered,true,'scene requests must not queue behind chat slots');assert.equal(await pending,'scene-done');assert.equal(longTaskQueue.active,2);assert.equal(longTaskQueue.waiting,0)}
 finally{abort.abort();first();second();await pending.catch(()=>{});longTaskQueue.setLimit(previous)}
})
test('SI-07b: sixty-four complete scenes reach the bounded 31 call pool without losing any IDs',async()=>{
 const names=Array.from({length:64},(_,i)=>'并发合成地点'+String(i).padStart(2,'0')),body=names.map((n,i)=>`第${i+1}章 地点${i}\n\n${n}。\n\n`).join('')
 const f=await legacySceneFixture([source(body,'正文.txt','f-body')],rosterAi({'roster:scene':r=>({roster:r.units.flatMap(u=>names.filter(name=>u.text.includes(name)).map(name=>({name,aliases:[],evidence:{unitId:u.id,quote:name}})))})})),base=f.handler();let active=0,maximum=0
 f.setAi(async r=>{if(r.intent!=='entity')return base(r);active++;maximum=Math.max(maximum,active);try{await sleep(80);return entityResult(r,()=>({backstory:'完整合成场景背景-'+r.entityTarget!.id}))}finally{active--}})
 try{await toImportScene(f);const v=await f.settle(),s=await f.journal();assert.equal(maximum,31);assert.equal(v.wizard!.step,'verify');assert.equal(active,0);assert.equal(s.artifacts.length,64);assert.ok(s.wizard!.tasks.every(t=>t.state==='done'));assert.deepEqual(s.artifacts.map(a=>a.id).sort(),s.wizard!.candidates.scene!.map(c=>c.id).sort());for(const a of s.artifacts)assert.equal(a.facts.backstory,'完整合成场景背景-'+a.id)}finally{await f.dispose()}
})
test('SI-07c: pausing 31 actual scene calls drains the complete proof before a clean resume',async()=>{
 const names=Array.from({length:64},(_,i)=>'暂停合成地点'+String(i).padStart(2,'0')),body=names.map((n,i)=>`第${i+1}章 地点${i}\n\n${n}。\n\n`).join('')
 const f=await legacySceneFixture([source(body,'正文.txt','f-body')],rosterAi({'roster:scene':r=>({roster:r.units.flatMap(u=>names.filter(name=>u.text.includes(name)).map(name=>({name,aliases:[],evidence:{unitId:u.id,quote:name}})))})})),base=f.handler(),pending=new Map<string,{resolve:()=>void;reject:()=>void}>(),canceled=new Set<string>();let open=false
 const cache=(f.controller as unknown as {runtimeScopeCache:{resolve(s:ImportSession,g:ImportGrant,compute:()=>string):string}}).runtimeScopeCache,resolve=cache.resolve.bind(cache);let scopeComputes=0
 cache.resolve=(s,g,compute)=>resolve(s,g,()=>{scopeComputes++;return compute()})
 f.setAi(async r=>{if(r.intent!=='entity')return base(r);if(!open)try{await new Promise<void>((resolve,reject)=>pending.set(r.operationId,{resolve,reject:()=>reject(new DOMException('取消','AbortError'))}))}finally{pending.delete(r.operationId)}return entityResult(r)})
 f.options.cancelAi=async id=>{const call=pending.get(id);if(call){canceled.add(id);call.reject()}}
 try{await toImportScene(f);const deadline=Date.now()+5000;while(pending.size!==31){assert.ok(Date.now()<deadline,'31 scene calls started');await sleep(5)}
  const before=await f.journal();let running:{operationId:string}[]=[];const runtimeDeadline=Date.now()+5000
  while(running.length!==31){const runtime=JSON.parse(await readFile(join(f.root,'novel-imports',before.id,'runtime.json'),'utf8'));running=runtime.calls.filter((c:{kind:string;state:string})=>c.kind==='scene'&&c.state==='pending');assert.ok(Date.now()<runtimeDeadline,'31 calls persisted to runtime.json');if(running.length!==31)await sleep(5)}
  assert.equal(running.length,31);assert.deepEqual(running.map((c:{operationId:string})=>c.operationId).sort(),[...pending.keys()].sort());assert.equal(scopeComputes,1)
  await f.act('pause');const s=await f.journal(),proof=s.runtimePauseProof!;assert.equal(proof.state,'drained');assert.equal(proof.calls.length,31);assert.ok(proof.calls.every(c=>c.kind==='scene'));assert.deepEqual([...canceled].sort(),proof.calls.map(c=>c.operationId).sort());assert.ok(Object.values(proof.remaining).every(n=>n===0));assert.equal(pending.size,0);assert.equal(s.artifacts.length,0)
  open=true;await f.act('resume',{consent:true});const v=await f.settle(),done=await f.journal();assert.equal(v.wizard!.step,'verify');assert.equal(done.artifacts.length,64);assert.ok(done.wizard!.tasks.every(t=>t.state==='done'));assert.equal(scopeComputes,2)
 }finally{open=true;for(const p of pending.values())p.resolve();await f.dispose()}
})
