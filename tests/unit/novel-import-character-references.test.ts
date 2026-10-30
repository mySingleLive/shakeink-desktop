import assert from 'node:assert/strict'
import {test} from 'node:test'
import {runImportAi} from '../../desktop/service/novel-import-ai'
import {importNativeMappings} from '../../desktop/core/novel-import-semantic-state'
import type {ImportAiRequest,ImportArtifact,ImportSession} from '../../desktop/shared/novel-import'
import {fixture,source,rosterAi,entityName,entityResult,entityTarget,toImportChar,sleep,model} from '../helpers/novel-import-wizard-fixture'

test('CI-01: committed forward relationships do not block later entity snapshots through the real service validator',async()=>{
 const names=Array.from({length:64},(_,i)=>'合成角色'+String.fromCharCode(0x7532+i))
 const body=names.map((name,i)=>`第${i+1}章 篇${i}\n\n${name}出场。\n\n`).join('')
 const f=await fixture([source(body,'正文.txt','f-body')],rosterAi({'roster:character':r=>({roster:r.units.flatMap(u=>names.filter(name=>u.text.includes(name)).map(name=>({name,aliases:[],roleType:'SUPPORTING' as const,evidence:{unitId:u.id,quote:name}})))})}))
 const base=f.handler();let generated=0,observed=false,newRequestAfterCommit=false
 f.setAi(async r=>{
  if(r.intent!=='entity')return base(r)
  if(observed)newRequestAfterCommit=true
  const index=generated++
  if(index>=8&&!observed){
   const deadline=Date.now()+5000
   for(;;){const j=await f.journal();if(j.artifacts.length>=8){assert.ok(!j.artifacts.some(a=>a.name===names.at(-1)));observed=true;break}assert.ok(Date.now()<deadline,'the first batch must commit before more results return');await sleep(5)}
  }
  const targetName=entityName(r)===names.at(-1)?names[0]:names.at(-1)!,target=r.entities!.find(e=>e.name===targetName)!
  return runImportAi(r,new AbortController().signal,{
   resolve:async()=>model,assert:async()=>{},
   generate:async()=>entityResult(r,()=>({relationships:JSON.stringify([{target:target.name,description:'合成旧识',characterId:target.id}])})),
  })
 })
 try{
  await toImportChar(f);const v=await f.settle(),j=await f.journal()
  assert.ok(observed,'a partial catalog with unresolved forward links was actually saved')
  assert.equal(v.wizard!.step,'detect-scene',JSON.stringify(v.wizard!.tasks.filter(t=>t.state==='failed')))
  assert.ok(newRequestAfterCommit,'new snapshots are assembled after that partial commit')
  assert.equal(v.wizard!.tasks.length,64);assert.ok(v.wizard!.tasks.every(t=>t.state==='done'))
  const ids=j.artifacts.map(a=>a.id).sort();assert.deepEqual(ids,j.wizard!.candidates.character!.map(c=>c.id).sort())
  for(const a of j.artifacts){const relations=JSON.parse(a.facts.relationships);assert.equal(relations.length,1);assert.ok(ids.includes(relations[0].characterId));assert.equal(relations[0].target,a.name===names.at(-1)?names[0]:names.at(-1))}
  assert.equal(importNativeMappings(j).projectableIds.length,64);assert.deepEqual(j.wizard!.dropped,[]);assert.deepEqual(j.wizard!.skipped,[])
 }finally{await f.dispose()}
})

const partial:ImportArtifact={id:'partial-character',kind:'character',name:'合成角色甲',text:'合成资料',origin:'inferred',sourceUnitIds:['u'],evidence:[{unitId:'u',quote:'合成'}],facts:{roleType:'SUPPORTING',relationships:JSON.stringify([{target:'合成角色乙',description:'旧识',characterId:'later-character'}])}}
test('CI-02: default catalogs remain strict; explicit catalogs including empty arrays are used directly',async()=>{
 const f=await fixture(undefined,rosterAi())
 try{
  await toImportChar(f);await f.settle()
  const session={...await f.journal(),artifacts:[partial]} as ImportSession
  const controller=f.controller as unknown as {requestSnapshot(s:ImportSession,r:Partial<ImportAiRequest>):ImportAiRequest}
  const request={phase:'analyze' as const,intent:'entity' as const,kind:'character' as const,units:[],artifacts:[],workingRevision:0}
  assert.throws(()=>controller.requestSnapshot(session,request),/导入实体引用类型或归属无效/)
  for(const entities of [[],[{id:'later-character',kind:'character' as const,name:'合成角色乙'}]]){
   const before=structuredClone(session),snapshot=controller.requestSnapshot(session,{...request,entities})
   assert.deepEqual(snapshot.entities,entities);assert.deepEqual(session,before)
  }
 }finally{await f.dispose()}
})

test('CI-03: service rejects unknown or wrong-type relationship IDs and preserves valid forward links',async()=>{
 const f=await fixture(undefined,rosterAi());const base=f.handler()
 f.setAi(async r=>r.intent==='entity'?entityResult(r):base(r))
 try{
  await toImportChar(f);await f.settle()
  const r=f.requests.find(r=>r.intent==='entity')!
  assert.ok(r)
  const other=r.entities!.find(e=>e.id!==entityTarget(r))!,raw=entityResult(r,()=>({relationships:JSON.stringify([{target:other.name,description:'旧识',characterId:other.id}])}))
  raw.artifacts![0].facts.roleType=r.entityTarget!.roleType!
  const run=(request:ImportAiRequest)=>runImportAi(request,new AbortController().signal,{resolve:async()=>model,assert:async()=>{},generate:async()=>structuredClone(raw)})
  await assert.rejects(run({...r,entities:r.entities!.filter(e=>e.id!==other.id)}),/引用/)
  await assert.rejects(run({...r,entities:r.entities!.map(e=>e.id===other.id?{id:e.id,kind:'scene',name:e.name,entityType:'PLACE'}:e)}),/引用/)
  const accepted=await run(r);assert.deepEqual(accepted.artifacts![0].facts,raw.artifacts![0].facts)
 }finally{await f.dispose()}
})
