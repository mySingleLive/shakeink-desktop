import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFile} from 'node:fs/promises'
import {join} from 'node:path'
import * as runtime from '../../desktop/core/novel-import-runtime-proof'
import {importScopeHash} from '../../desktop/core/novel-import'
import type {ImportSession,ImportGrant,ImportAiRequest} from '../../desktop/shared/novel-import'
import {fixture,legacySceneFixture,source,rosterAi,entityResult,toImportChar,toImportScene,toRoster,toSceneRoster,sleep} from '../helpers/novel-import-wizard-fixture'

type Cache={resolve(s:ImportSession,g:ImportGrant,compute:()=>string):string}
const api=runtime as typeof runtime&{ImportRuntimeScopeCache?:new()=>Cache}
for(const kind of ['character','scene'] as const)test('CP-15a '+kind+': the real 64-entity controller path computes the complete scope once, with independent payload hashes',async()=>{
 const names=Array.from({length:64},(_,i)=>'指纹角色'+i),body=names.map((name,i)=>`第${i+1}章 篇${i}\n\n${name}记录往事。\n\n`).join('')
 const f=await (kind==='scene'?legacySceneFixture:fixture)([source(body,'正文.txt','f-body')],rosterAi({['roster:'+kind]:r=>({roster:r.units.flatMap(u=>names.filter(name=>u.text.includes(name)).map(name=>({name,aliases:[],...(kind==='character'?{roleType:'SUPPORTING' as const}:{}),evidence:{unitId:u.id,quote:name}})))})}),{promptLayout:'legacy'}),base=f.handler()
 const c=f.controller as unknown as {runtimeScopeCache:Cache;session:ImportSession;ai(s:ImportSession,e:number,r:unknown,verified:boolean):Promise<unknown>};try{assert.ok(c.runtimeScopeCache,'production cache is installed')}catch(error){await f.dispose();throw error}
 const observed:runtime.ImportRuntimeCallIdentity[]=[],tracker=(f.controller as unknown as {runtime:runtime.ImportRuntimeProofTracker}).runtime,invoke=tracker.invoke.bind(tracker) as typeof tracker.invoke;tracker.invoke=<T>(id:runtime.ImportRuntimeCallIdentity,work:()=>Promise<T>)=>{const p=invoke(id,work);if(id.intent==='entity')observed.push(structuredClone(id));return p}
 const original=c.runtimeScopeCache.resolve.bind(c.runtimeScopeCache);let computes=0,resolves=0,entered=0,open!:()=>void;const gate=new Promise<void>(r=>open=r)
 // Scene roster and link waves share the same cached scope; only entity resolves are counted here.
 c.runtimeScopeCache.resolve=(s,g,compute)=>{if(s.wizard?.step?.startsWith('import-'))resolves++;return original(s,g,()=>{computes++;return compute()})}
 f.setAi(async r=>{if(r.intent!=='entity')return base(r);entered++;await gate;return entityResult(r,():Record<string,string>=>kind==='character'?{roleType:r.entityTarget!.roleType!}:{})})
 try{await (kind==='character'?toImportChar(f):toImportScene(f));for(let i=0;i<1000&&entered<31;i++)await sleep(5);assert.equal(entered,31);assert.equal(computes,1);open();const v=await f.settle(),s=await f.journal();assert.equal(v.wizard!.step,kind==='character'?'detect-scene':'verify');assert.equal(resolves,64);assert.equal(computes,1)
  const rt=JSON.parse(await readFile(join(f.root,'novel-imports',s.id,'runtime.json'),'utf8')),calls=rt.calls.filter((r:{intent:string})=>r.intent==='entity');assert.equal(observed.length,64);const expected=importScopeHash(s,'analyze');assert.ok(observed.every(r=>r.scopeHash===expected));assert.equal(new Set(observed.map(r=>r.payloadHash)).size,64);assert.ok(calls.length>0&&calls.every((r:{operationId:string;scopeHash:string})=>r.scopeHash===expected&&observed.some(c=>c.operationId===r.operationId)),'bounded runtime ledger retains the exact observed identities')
  const {operationId:_id,models:_models,...request}=f.requests.find(r=>r.intent==='entity')!;await c.ai(c.session,c.session.epoch,request,false);assert.equal(resolves,64,'unverified calls keep full hashing');await c.ai(c.session,c.session.epoch,{...request,intent:undefined,entityTarget:undefined},true);assert.equal(resolves,64,'ordinary analysis keeps full hashing')
  assert.ok(!JSON.stringify(s).includes('runtimeScopeCache'))
 }finally{open?.();await f.dispose()}
})

test('CP-15b: every scope lifetime key invalidates; mismatched computations never populate the cache',()=>{
 assert.ok(api.ImportRuntimeScopeCache);const cache=new api.ImportRuntimeScopeCache!();let s={id:'synthetic-session',epoch:1,workingRevision:0,analysisGrant:{hash:'valid'}} as ImportSession,n:number=0
 const get=()=>cache.resolve(s,s.analysisGrant!,()=>{n++;return s.analysisGrant!.hash});get();get();assert.equal(n,1)
 for(const mutate of [()=>{s={...s}},()=>{s.id+='next'},()=>{s.epoch++},()=>{s.workingRevision++},()=>{s.analysisGrant={...s.analysisGrant!}},()=>{s.analysisGrant!.hash+='next'}]){const before:number=n;mutate();get();get();assert.equal(n,before+1)}
 s.epoch++;let attempts=0;for(let i=0;i<2;i++)assert.throws(()=>cache.resolve(s,s.analysisGrant!,()=>{attempts++;return 'wrong'}),/授权|范围/);assert.equal(attempts,2);get();assert.equal(n,8)
})

for(const kind of ['character','scene'] as const)for(const warmed of [false,true])test(`CP-15c ${kind}: ${warmed?'invalidated warm':'first'} wrong grant results in zero entity AI calls`,async()=>{
 const f=await (kind==='scene'?legacySceneFixture:fixture)(undefined,rosterAi())
 try{await (kind==='character'?toRoster(f):toSceneRoster(f));const c=f.controller as unknown as {runtimeScopeCache:Cache;session:ImportSession};assert.ok(c.runtimeScopeCache);const s=c.session
  if(warmed)c.runtimeScopeCache.resolve(s,s.analysisGrant!,()=>importScopeHash(s,'analyze'))
  s.epoch++;s.analysisGrant={...s.analysisGrant!,hash:'wrong-grant'};await f.act('wizard-next');await f.settle();assert.equal(f.requests.filter(r=>r.intent==='entity').length,0);assert.ok((await f.view()).wizard!.tasks.some(t=>t.state==='failed'))
 }finally{await f.dispose()}
})
