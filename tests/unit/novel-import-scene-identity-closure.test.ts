import assert from 'node:assert/strict'
import {test} from 'node:test'
import {fixture,source,allCuts} from '../helpers/novel-import-wizard-fixture'
import {runImportAi,generateImportAiJson} from '../../desktop/service/novel-import-ai'
import {importLeaseTarget,buildPublicationRecordForTest} from '../../desktop/service/novel-import-publish'
import {expectedSceneOwnershipKeys,sceneIdentityMemberships,assertSceneIdentityLedger} from '../../desktop/core/novel-import-scene-identity'
import {sceneOwnedUnits} from '../../desktop/main/novel-import-scene-identity'
import {serializeImportAiPayload} from '../../desktop/core/novel-import-ai-payload'
import {importArtifactSemanticHash} from '../../desktop/core/novel-import-semantics'
import {importReviewTaskKeys} from '../../desktop/core/novel-import-review-tasks'
import type {ImportAiRequest,ImportSession,ImportTarget} from '../../desktop/shared/novel-import'
import type {SceneIdentityLedger} from '../../desktop/shared/novel-import-scene-identity'
import type {ResolvedModel} from '../../src/lib/ai/provider'

// Only synthetic material and predetermined JSON. The original controller,
// service, schema bridge, task planner and publication admission remain real.
const east='甲城东宅里的书房有蓝色墙壁。',west='乙城西宅里的书房有红色墙壁。'
type F=Awaited<ReturnType<typeof fixture>>
const owner=(f:F)=>(f.controller as unknown as {session:ImportSession}).session
async function compiled(request:ImportAiRequest,raw:unknown){
 return runImportAi(request,new AbortController().signal,{resolve:async role=>request.models[role]!,assert:async()=>{},generate:async(input,_model,signal,prompt)=>generateImportAiJson(input,{userId:'synthetic-scene-closure',resolvedModel:{} as ResolvedModel},signal,prompt,{generateText:async()=>({text:JSON.stringify(raw),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'})})})
}
async function sceneFixture(mixed=false){
 const body='第一章 东宅\n\n'+east+'其余叙述。'.repeat(120)+'\n\n第二章 西宅\n\n'+west+'院外下雨。'.repeat(120)+'\n'
 return fixture([source(body,'合成正文.txt','f-body')],async r=>{
  if(r.intent==='structure')return allCuts(r)
  if(r.phase==='classify')return {classifications:r.units.map(u=>({unitId:u.id,kind:'body'}))}
  if(r.intent==='roster'&&r.kind==='character')return compiled(r,{roster:[]})
  if(r.sceneIdentity?.mode==='roster')return compiled(r,{roster:[east,west].flatMap(quote=>r.units.filter(u=>u.text.includes(quote)).map(u=>({name:'书房',aliases:[],mentions:[{literal:'书房',evidence:{unitId:u.id,quote}}],context:[{label:quote.slice(0,4),evidence:[{unitId:u.id,quote}]}],links:[]})))})
  // 486 adds a scene-list cleanup stage after links; this fixture keeps every entry (neutral answer).
  if((r.sceneIdentity as {mode?:string}|undefined)?.mode==='cleanup')return compiled(r,{sceneCleanup:(r.sceneIdentity as unknown as {focus:{index:number}[]}).focus.map(f=>({index:f.index,action:'keep'}))})
  if(r.sceneIdentity?.mode==='links')return compiled(r,{sceneIdentityDecisions:r.sceneIdentity.tasks.map(t=>({taskIndex:t.taskIndex,result:'unknown',evidence:[]}))})
  if(r.intent==='entity'){
   assert.equal(r.kind,'scene');assert.equal(r.sceneIdentity?.mode,'ownership')
   const own=r.sceneIdentity!.mode==='ownership'?r.sceneIdentity!.memberships.find(m=>m.identityId===r.entityTarget!.id)!:undefined
   assert.ok(own);const range=own.ownedRanges[0],unit=r.units.find(u=>u.id===range.unitId)!,quote=unit.text.slice(range.start,range.end),entity=r.entities!.find(e=>e.id===r.entityTarget!.id)!
   return compiled(r,{artifacts:[{id:entity.id,kind:'scene',name:entity.name,text:quote+'该地点的合成资料。',facts:{coordinates:quote.slice(0,4)},evidence:[{unitId:unit.id,quote}],origin:'inferred'}]})
  }
  if(r.phase==='review')return compiled(r,{conflicts:[],missingTargets:[]})
  throw Error('unexpected synthetic stage '+JSON.stringify([mixed,r.phase,r.intent,r.kind]))
 })
}
async function prepare(f:F,selected:string[],targets:ImportTarget[],infer=true){
 await f.act('choose',{mode:'files'});await f.act('wizard-next');await f.act('set-title',{title:'合成归属闭环'});await f.act('choose-target');await f.act('wizard-next')
 if(selected.includes('body')){await f.act('classify',{mode:'ai',consent:true});await f.settle()}
 await f.act('select',{selected,targets,infer});await f.act('wizard-next',{consent:true})
 for(let i=0;i<8;i++){const v=await f.settle();if(v.wizard!.step==='detect-scene'){assert.equal(v.wizard!.stepState['detect-scene'],'waiting',v.wizard!.stepError);return v}assert.equal(v.wizard!.stepState[v.wizard!.step],'waiting',v.wizard!.stepError);await f.act('wizard-next',{consent:true})}
 throw Error('synthetic normal actions did not reach scene roster')
}
async function importAndReview(f:F){await f.act('wizard-next');const v=await f.settle();assert.equal(v.wizard!.step,'verify');assert.ok(v.wizard!.checks?.every(c=>c.ok),JSON.stringify(v.wizard!.checks));return owner(f)}
function assertOwnership(s:ImportSession){const ledger=s.wizard!.sceneIdentity!,selected=new Set(s.wizard!.candidates.scene!.filter(c=>c.selected).map(c=>c.id)),keys=expectedSceneOwnershipKeys(ledger,s.artifacts,selected);assert.deepEqual([...ledger.ownershipReviewed].sort(),[...keys].sort());assert.equal(new Set(ledger.ownershipReviewed).size,keys.length);return keys}

test('CI-C01/10: current body units are dispatched again when only ownership credit has become stale',async()=>{
 const f=await sceneFixture();try{
  await prepare(f,['body'],['scene']);let s=await importAndReview(f);assert.equal(s.artifacts.length,2);const oldKeys=assertOwnership(s),beforeProse=s.workingProse,beforeChapters=structuredClone(s.chapters),beforeArtifacts=structuredClone(s.artifacts),bodyCoverage=[...s.coverage.review]
  // Controlled current-owner test precondition, not a user edit or journal
  // resume: retain completed body coverage but change the complete artifact.
  s.artifacts[0].text+='\n'+s.artifacts[0].evidence[0].quote;s.wizard!.sceneIdentity!.ownershipReviewed=[];s.coverage.reviewFacts=[];delete s.semanticState!.verifiedHash
  const changed=structuredClone(s.artifacts),changedHash=importArtifactSemanticHash(s.artifacts[0]),c=f.controller as any;await c.save(s,false);assert.equal(c.validJournal(structuredClone(s),s.id),true)
  const count=f.requests.length;await c.review(s,s.epoch);s=owner(f)
  const dispatched=f.requests.slice(count).filter(r=>r.phase==='review'&&!r.instruction?.includes('确定性分片'))
  assert.ok(dispatched.length>0,'completed body coverage cannot suppress the missing ownership recheck')
  const actual=new Set(dispatched.flatMap(r=>r.units.map(u=>u.id))),memberUnits=s.wizard!.sceneIdentity!.members.flatMap(m=>m.origin==='body'?[m.range.unitId]:[]);assert.ok(memberUnits.every(id=>actual.has(id)))
  assert.deepEqual(s.coverage.review,bodyCoverage);assert.deepEqual(s.coverage.reviewFacts,importReviewTaskKeys(s));const nextKeys=assertOwnership(s);assert.notDeepEqual(nextKeys,oldKeys);assert.equal(importArtifactSemanticHash(s.artifacts[0]),changedHash);assert.deepEqual(s.artifacts,changed);assert.equal(s.workingProse,beforeProse);assert.deepEqual(s.chapters,beforeChapters);assert.deepEqual(s.artifacts[1],beforeArtifacts[1])
 }finally{await f.dispose()}
})

test('CI-C02/13: fresh mixed scene/character targets retain raw review and complete real publication admission',async()=>{
 const f=await sceneFixture(true);try{
  await prepare(f,['body'],['scene','character']);const s=await importAndReview(f);assert.equal(s.artifacts.filter(a=>a.kind==='scene').length,2);assert.equal(s.artifacts.filter(a=>a.kind==='character').length,0);assertOwnership(s)
  const review=f.requests.filter(r=>r.phase==='review');assert.ok(review.length>0)
  for(const request of review){assert.deepEqual(request.selectedTargets,['scene','character']);assert.equal(request.executionLane,'wizard-review-v1','docs/539: mixed wizard targets review on the chapter lane');assert.equal(request.sceneIdentity?.mode,'ownership');const payload=JSON.parse(serializeImportAiPayload(request));assert.ok(payload.units.every((u:Record<string,unknown>)=>!Object.hasOwn(u,'unitIndex')));assert.ok(payload.artifacts.every((a:Record<string,unknown>)=>!Object.hasOwn(a,'artifactIndex')))}
  assert.deepEqual(s.wizard!.skipped,[]);assert.deepEqual(s.wizard!.dropped,[]);await f.act('wizard-next');await f.settle();assert.equal((await f.view()).phase,'completed');assert.ok(f.published)
  let admitted=0;const published=f.published!,works={importLeaseTarget:async()=>{admitted++;throw Error('SYNTHETIC_CLOSURE_LEASE')}} as unknown as Parameters<typeof importLeaseTarget>[0]
  await assert.rejects(importLeaseTarget(works,{session:published,selection:published.target!,importHash:published.publication!.hash!},()=>{}),/SYNTHETIC_CLOSURE_LEASE/u);assert.equal(admitted,1)
 }finally{await f.dispose()}
})

test('CI-C04/13: pending author conflicts stay visible when ownership still requires later review',async()=>{
 const f=await sceneFixture();try{
  await prepare(f,['body'],['scene']);const s=await importAndReview(f),c=f.controller as any,request=f.requests.find(r=>r.phase==='review'&&!r.instruction?.includes('确定性分片'))!,artifact=s.artifacts[0],evidence=artifact.evidence[0]
  const accepted=await compiled(request,{conflicts:[{id:'closure-author-conflict',hash:'closure-author-hash',type:'setting-body',kind:'scene',entity:artifact.name,field:'coordinates',source:{artifactId:artifact.id,text:artifact.facts.coordinates,value:artifact.facts.coordinates},candidate:{text:'合成正文中的另一定位解释',value:'另一个有据候选位置',unitId:evidence.unitId},evidence:[evidence],status:'pending'}],missingTargets:[]})
  assert.equal(accepted.conflicts?.length,1,'the pending conflict passes the actual service and JSON schema before the main control')
  // Controlled partial-progress owner, not a real provider failure or resume:
  // the author must resolve the real pending conflict before more AI review.
  c.addConflicts(s,accepted.conflicts!);s.wizard!.sceneIdentity!.ownershipReviewed=[];s.phase='conflicts';s.semanticState!.stage='review';delete s.semanticState!.verifiedHash;await c.save(s,false);assert.equal(c.validJournal(structuredClone(s),s.id),true)
  const before=structuredClone(s),calls=f.requests.length;await c.runVerify(s,s.epoch);const result=owner(f)
  assert.equal(result.phase,'conflicts','an unfinished ownership proof cannot replace the normal author-conflict state with a generic review failure')
  assert.equal(result.wizard!.stepState.verify,'waiting');assert.equal(result.wizard!.stepError,undefined);assert.ok(result.wizard!.deferredConflicts.includes(accepted.conflicts![0].id));assert.equal(result.wizard!.checks!.find(check=>check.key==='consistency')!.ok,false);assert.deepEqual(result.conflicts,before.conflicts);assert.deepEqual(result.artifacts,before.artifacts);assert.deepEqual(result.wizard!.sceneIdentity!.ownershipReviewed,[]);assert.equal(f.requests.length,calls,'the pending-author state must not silently send more review requests')
 }finally{await f.dispose()}
})

test('CI-C05/13: the publication record keeps an independent strict identity ledger through JSON roundtrip',async()=>{
 const f=await sceneFixture();try{
  await prepare(f,['body'],['scene']);const s=await importAndReview(f),before=structuredClone(s.wizard!.sceneIdentity!),record=buildPublicationRecordForTest(s) as unknown as {wizard:{sceneIdentityVersion?:1;sceneIdentity?:SceneIdentityLedger}}
  assert.equal(record.wizard.sceneIdentityVersion,1,'the durable publication record must retain the admitted identity protocol version')
  assert.deepEqual(record.wizard.sceneIdentity,before);assert.notEqual(record.wizard.sceneIdentity,s.wizard!.sceneIdentity);assert.notEqual(record.wizard.sceneIdentity!.members,s.wizard!.sceneIdentity!.members)
  const restored=JSON.parse(JSON.stringify(record)) as typeof record;assert.equal(restored.wizard.sceneIdentityVersion,1);assert.deepEqual(restored.wizard.sceneIdentity,before);assert.doesNotThrow(()=>assertSceneIdentityLedger(restored.wizard.sceneIdentity!));record.wizard.sceneIdentity!.identityRevision++;assert.deepEqual(s.wizard!.sceneIdentity,before,'record mutation cannot mutate the admitted owner before publication')
  const legacy=structuredClone(s);delete legacy.wizard!.sceneIdentityVersion;delete legacy.wizard!.sceneIdentity;const old=buildPublicationRecordForTest(legacy) as unknown as typeof record;assert.equal(Object.hasOwn(old.wizard,'sceneIdentityVersion'),false);assert.equal(Object.hasOwn(old.wizard,'sceneIdentity'),false)
 }finally{await f.dispose()}
})

// No blank paragraph: the original source splitter creates one real unit
// spanning both blocks and their heading-only gap, without private mutation.
const sourceA='## 同一书房\ncoordinates: 合成东宅\n第一份完整原值😀。\n',sourceB='## 同一书房\ncoordinates: 合成东宅\n第二份完整原值𠀀。\n',sourceGap='## 仅用于间隔\n',sourceText='# 场景\n'+sourceA+sourceGap+sourceB
for(const infer of [false,true])test('CI-C03/12: author-merged same-ID source blocks retain complete values '+(infer?'with AI review':'without a model'),async()=>{
 const files=[...(infer?[source('第一章 合成\n\n院外下着雨。\n','正文.txt','f-body')]:[]),source(sourceText,'场景.md','f-scenes')]
 const f=await fixture(files,async r=>{
  if(!infer)throw Error('source-only must not send a model request')
  if(r.intent==='structure')return allCuts(r)
  if(r.phase==='classify')return {classifications:r.units.map(u=>({unitId:u.id,kind:u.fileId==='f-body'?'body':'scene'}))}
  if(r.sceneIdentity?.mode==='roster')return compiled(r,{roster:[]})
  // 486 adds a scene-list cleanup stage after links; this fixture keeps every entry (neutral answer).
  if((r.sceneIdentity as {mode?:string}|undefined)?.mode==='cleanup')return compiled(r,{sceneCleanup:(r.sceneIdentity as unknown as {focus:{index:number}[]}).focus.map(f=>({index:f.index,action:'keep'}))})
  if(r.sceneIdentity?.mode==='links')return compiled(r,{sceneIdentityDecisions:r.sceneIdentity.tasks.map(t=>({taskIndex:t.taskIndex,result:'unknown',evidence:[]}))})
  if(r.phase==='review')return compiled(r,{conflicts:[],missingTargets:[]})
  throw Error('source fixture unexpectedly generated entity content')
 },infer?{}:{models:{}})
 try{
  await prepare(f,infer?['body','scene']:['scene'],['scene'],infer);let s=owner(f);const l=s.wizard!.sceneIdentity!;assert.equal(l.identities.length,2);assert.ok(l.members.every(m=>m.origin==='source-block'))
  await f.act('wizard-scene-identity',{op:'partition',expectedLedgerHash:l.ledgerHash,explanation:'合成两份资料属于同一书房，完整保留两块原值。',identityIds:l.identities.map(i=>i.id),parts:[{memberKeys:l.members.map(m=>m.key),state:'source-scoped',nameParts:[{kind:'literal',key:l.members[0].key}],parent:{state:'unknown'}}]})
  s=owner(f);const c=f.controller as any,sources=c.sceneSources(s),identity=s.wizard!.sceneIdentity!.identities[0],material=sceneOwnedUnits(s.wizard!.sceneIdentity!,sources,identity.id);assert.equal(new Set(sources.sourceBlocks.flatMap((b:any)=>b.units.map((u:any)=>u.id))).size,1,'the original source splitter actually produced same-ID block slices');assert.equal(new Set(material.map(u=>u.id)).size,material.length,'same-ID slices are reconstructed as one actual request unit')
  assert.ok(material.some(u=>u.text.includes(sourceA+sourceGap+sourceB)));const memberships=sceneIdentityMemberships(s.wizard!.sceneIdentity!,material,sources),owned=memberships.find(m=>m.identityId===identity.id)!.ownedRanges.map(r=>material.find(u=>u.id===r.unitId)!.text.slice(r.start,r.end)).join('');assert.equal(owned,sourceA+sourceB);assert.equal(owned.includes(sourceGap),false)
  s=await importAndReview(f);assert.equal(s.artifacts.length,1);assert.equal(s.artifacts[0].text,sourceA+'\n\n'+sourceB);assert.equal(s.artifacts[0].facts.coordinates,'合成东宅');assert.equal(s.artifacts[0].origin,'source');assertOwnership(s);assert.deepEqual(s.wizard!.skipped,[]);assert.deepEqual(s.wizard!.dropped,[])
  if(infer){const review=f.requests.filter(r=>r.phase==='review');assert.ok(review.some(r=>r.units.some(u=>u.text.includes(sourceA+sourceGap+sourceB))),'an actual review request retains both complete blocks and their real material gap');assert.equal(f.requests.filter(r=>r.intent==='entity').length,0);for(const r of review){assert.equal(new Set(r.units.map(u=>u.id)).size,r.units.length);assert.equal(r.sceneIdentity?.mode,'ownership');if(r.sceneIdentity?.mode==='ownership')for(const range of r.sceneIdentity.memberships.find(m=>m.identityId===identity.id)?.ownedRanges??[])assert.equal(r.units.find(u=>u.id===range.unitId)!.text.slice(range.start,range.end).includes(sourceGap),false)}}else assert.equal(f.requests.length,0)
 }finally{await f.dispose()}
})
