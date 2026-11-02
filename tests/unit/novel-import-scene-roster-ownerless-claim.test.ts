import assert from 'node:assert/strict'
import {test} from 'node:test'
import {bridgeBound,boundReplacement} from '../helpers/novel-import-bound-decisions-fixture'
import {request as baseRequest} from '../helpers/novel-import-claim-patch-fixture'
import {claimsDeck} from '../helpers/novel-import-claims-integration-fixture'
import {sceneRosterGenerationSchema} from '../../desktop/service/novel-import-ai'
import {prepareSceneRosterClaimPatch,type SceneRosterPatchRow,type SceneRosterPatchProof,type SceneRosterPatchDecision} from '../../desktop/service/novel-import-scene-roster-claim-patch'
import {createSceneRosterFragmentTable,restoreSceneRosterFragmentAnchor} from '../../desktop/core/novel-import-scene-roster-fragments'
import {createSceneRosterRepairChoices} from '../../desktop/service/novel-import-scene-roster-repair-choices'
import {sceneAnchorSchema} from '../../desktop/shared/novel-import-scene-identity'
import type {ImportAiRequest} from '../../desktop/shared/novel-import'

function fixture(){
 const r=baseRequest();r.units=['东宅的甲室。','西宅的乙室。'].map((text,index)=>({id:'ownerless-'+index,fileId:'synthetic-ownerless',kind:'body',start:index*1000,end:index*1000+text.length,text}))
 const anchor=(index:number)=>({unitId:r.units[index].id,quote:r.units[index].text}),correct={mentions:[{literal:'甲室',evidence:anchor(0)}],context:[{label:'东宅',evidence:[anchor(0)]}],links:[]},other={mentions:[{literal:'乙室',evidence:anchor(1)}],context:[],links:[]},wrong={...correct,mentions:[{literal:'甲室',evidence:anchor(1)}]}
 return{r,correct,other,wrong,first:{roster:[wrong,other]}}
}
test('OC01: a strict ownerless record explicitly resolves both mention and raw-valid context through the original business gates',async()=>{
 const f=fixture(),actual=await bridgeBound(f.first,({deck,prompt})=>{assert.deepEqual(deck.tasks.map(task=>task.kind),['claims']);const task=deck.tasks[0];assert.equal(task.slot,0);assert.equal(task.kind,'claims');if(task.kind!=='claims')throw Error('OC_CLAIMS_REQUIRED');assert.deepEqual(task.claimIndexes,[0,1]);const n=deck.choices.findIndex(choice=>choice.unitIndex===0&&f.r.units[0].text.slice(choice.start,choice.end)===f.r.units[0].text)+1;assert.ok(n>0);assert.deepEqual(task.domains,[{kind:'mention',canReject:false,choices:[n]},{kind:'context',canReject:true,choices:[n]}]);assert.deepEqual(claimsDeck(prompt).plan.rows[0].keep,{mentions:[],context:[],links:[]});return{answers:{'1':{claimChoices:{'1':[n],'2':[n]}}}}},{request:f.r})
 assert.equal(actual.options.length,2)
 assert.deepEqual(actual.result,sceneRosterGenerationSchema(f.r).parse({roster:[f.correct,f.other]}))
})
function prepare(row:SceneRosterPatchRow,r:ImportAiRequest=fixture().r,proofs:SceneRosterPatchProof[]=[{mentions:[],context:[],links:[]}]){
 const before=structuredClone({row,units:r.units,proofs}),table=createSceneRosterFragmentTable(r.units),choices=createSceneRosterRepairChoices(r.units,table),resolveAnchor=(value:unknown)=>{
  const raw=sceneAnchorSchema.safeParse(value);if(raw.success)return raw.data
  if(value&&typeof value==='object'&&!Array.isArray(value)&&'ref'in value&&typeof value.ref==='string'&&Reflect.ownKeys(value).length===1)return table.resolve(value.ref)
  return restoreSceneRosterFragmentAnchor(value as Parameters<typeof restoreSceneRosterFragmentAnchor>[0],r.units)
 },patch=prepareSceneRosterClaimPatch({draftHash:'OWNERLESS_SYNTHETIC',slot:0,rowCount:2,row,proofs,units:r.units,choices,resolveAnchor})
 choices.wholeUnits();assert.deepEqual({row,units:r.units,proofs},before)
 return{patch,choices,claims:patch?.displayClaims()}
}
test('OC02: raw-valid ownerless context is an explicit claim and never pending proof; every original position needs an explicit decision',()=>{
 const f=fixture(),current=prepare(f.wrong,f.r);assert.ok(current.patch);assert.deepEqual(current.patch.data.map(claim=>claim.kind),['mention','context'])
 assert.ok(current.choices.compactEntries().every(choice=>!choice.preserved))
 const refs=current.choices.forLiteral('甲室');assert.equal(refs.length,1)
 const decisions:SceneRosterPatchDecision[]=current.patch.data.map(claim=>({claimRef:claim.claimRef,disposition:'resolve',choiceRefs:refs}))
 const resolved=current.patch.apply(decisions);assert.deepEqual(resolved,f.correct)
 for(const bad of[decisions.slice(0,1),[decisions[0],decisions[0]],[...decisions,{...decisions[0],claimRef:'pc'+'f'.repeat(16)}],decisions.map((decision,index)=>index?decision:{...decision,claimRef:'pc'+'f'.repeat(16)})])assert.throws(()=>current.patch!.apply(bad))
 const context=current.patch.data[1];assert.equal(context.kind,'context');assert.equal(context.canReject,true)
 const explicitReject:SceneRosterPatchDecision[]=[decisions[0],{claimRef:context.claimRef,disposition:'reject'}];assert.deepEqual(current.patch.apply(explicitReject),{...f.correct,context:[]})
 assert.throws(()=>current.patch!.apply([{claimRef:current.patch!.data[0].claimRef,disposition:'reject'},decisions[1]]))
 assert.throws(()=>current.patch!.apply(decisions.map(decision=>({...decision,disposition:'resolve',choiceRefs:['cf'+'f'.repeat(16)]}))))
 const wrongWindows=current.choices.compactEntries().filter(choice=>choice.unitIndex===1);assert.equal(wrongWindows.length,1)
 assert.throws(()=>current.patch!.apply([decisions[0],{claimRef:context.claimRef,disposition:'resolve',choiceRefs:[wrongWindows[0].choiceRef]}]),'a real but label-mismatching source window still fails the original group validator')
})
test('OC03: ownerless links require explicit pending decisions; owner-bound proof, duplicate-position and insufficient-occurrence fallbacks remain',()=>{
 const f=fixture(),row=():SceneRosterPatchRow=>structuredClone(f.wrong)
 const links=row();links.links=[{targetIndex:1,relation:'different-place',evidence:[f.correct.mentions[0].evidence]}];const pending=prepare(links,f.r);assert.ok(pending.patch);assert.deepEqual(pending.patch.data.map(claim=>claim.kind),['mention','context','link']);assert.ok(pending.choices.compactEntries().every(choice=>!choice.preserved));assert.throws(()=>pending.patch!.apply([]))
 const owned=row();owned.mentions=structuredClone(f.correct.mentions);assert.equal(prepare(owned,f.r,[{mentions:structuredClone(f.correct.mentions),context:[],links:[]}]).patch,undefined,'an old owner cannot turn a missing old context proof into a new claim')
 const duplicateMention=row();duplicateMention.mentions.push(structuredClone(duplicateMention.mentions[0]));assert.equal(prepare(duplicateMention,f.r).patch,undefined)
 const duplicateGroup=row();duplicateGroup.context.push(structuredClone(duplicateGroup.context[0]));assert.equal(prepare(duplicateGroup,f.r).patch,undefined)
 const duplicateEvidence=row();duplicateEvidence.context[0].evidence.push(structuredClone(duplicateEvidence.context[0].evidence[0]));assert.equal(prepare(duplicateEvidence,f.r).patch,undefined)
 const insufficient=row();insufficient.mentions.push({literal:'甲室',evidence:{unitId:f.r.units[0].id,quote:'OC_UNMATCHED'}});assert.equal(prepare(insufficient,f.r).patch,undefined)
 assert.equal(prepare(row(),f.r,[{mentions:[],context:[],links:[]},{mentions:structuredClone(f.correct.mentions),context:[],links:[]}]).patch,undefined,'already-owned occurrences remain unavailable')
 const boundary=baseRequest();boundary.units=['甲','室乙室。'].map((text,index)=>({id:'ownerless-boundary-'+index,fileId:'contiguous',kind:'body',start:index,end:index+text.length,text}));assert.equal(prepare({mentions:[{literal:'甲室',evidence:{unitId:boundary.units[0].id,quote:'OC_UNMATCHED'}}],context:[],links:[]},boundary).patch,undefined,'cross-unit-only presence is not converted to an anchor')
})
test('OC04: old context facts cannot be borrowed and joint group windows are never silently deduplicated',()=>{
 const f=fixture(),proofs:SceneRosterPatchProof[]=[{mentions:[],context:[],links:[]},{mentions:structuredClone(f.other.mentions),context:structuredClone(f.correct.context).map(context=>({label:context.label,evidence:context.evidence[0]})),links:[]}],borrow=prepare(f.wrong,f.r,proofs);assert.ok(borrow.patch)
 const ref=borrow.choices.forLiteral('甲室');assert.equal(ref.length,1);assert.deepEqual(borrow.claims?.find(claim=>claim.kind==='context')?.eligibleChoiceRefs,[])
 assert.throws(()=>borrow.patch!.apply(borrow.patch!.data.map(claim=>({claimRef:claim.claimRef,disposition:'resolve',choiceRefs:ref}))))
 const row:SceneRosterPatchRow=structuredClone(f.wrong);row.context[0].evidence.push(structuredClone(f.other.mentions[0].evidence));const joint=prepare(row,f.r);assert.ok(joint.patch);assert.equal(joint.patch.data.length,3)
 const resolve:SceneRosterPatchDecision[]=joint.patch.data.map(claim=>({claimRef:claim.claimRef,disposition:'resolve',choiceRefs:joint.choices.forLiteral('甲室')}));assert.throws(()=>joint.patch!.apply(resolve))
 const explicit:SceneRosterPatchDecision[]=[resolve[0],resolve[1],{claimRef:joint.patch.data[2].claimRef,disposition:'reject'}];assert.deepEqual(joint.patch.apply(explicit),f.correct)
})
test('OC05: metadata, unknown keys and partial types still use complete replacement through the unchanged strict caller',async t=>{
 for(const mode of['legacy','primary','unknown','partial']as const)await t.test(mode,async()=>{
  const f=fixture(),row:Record<string,unknown>=structuredClone(f.wrong)
  if(mode==='legacy')Object.assign(row,{name:'甲室',aliases:[]});else if(mode==='primary')row.primaryMentionIndex=0;else if(mode==='unknown')row.unknown='OC_UNKNOWN';else row.context=[{label:'东宅',evidence:f.correct.mentions[0].evidence}]
  const actual=await bridgeBound({roster:[row,f.other]},({deck,prompt})=>{assert.deepEqual(deck.tasks.map(task=>task.kind),['replacement']);return{answers:{'1':boundReplacement(prompt,f.correct,f.r)}}},{request:f.r})
  assert.equal(actual.options.length,2);assert.deepEqual(actual.result,sceneRosterGenerationSchema(f.r).parse({roster:[f.correct,f.other]}))
 })
})
test('OC06: illegal local answers and empty source ranges remain rejected for all four generations without automatic selection',async t=>{
 for(const mode of['zero','shared-number','missing']as const)await t.test(mode,async()=>{
  const f=fixture(),options:Parameters<typeof import('../../src/lib/ai/generate').generateText>[0][]=[]
  await assert.rejects(bridgeBound(f.first,()=>({answers:mode==='missing'?{'1':1}:{'1':mode==='zero'?0:2,'2':1}}),{request:f.r,options}),error=>!!error&&typeof error==='object'&&'kind'in error&&error.kind==='invalid_schema');assert.equal(options.length,4)
 })
 const f=fixture(),first={roster:[{...f.wrong,mentions:[{literal:'甲室',evidence:{unitIndex:0,fromFragment:0,toFragment:0}}]},f.other]},before=structuredClone(first),options:Parameters<typeof import('../../src/lib/ai/generate').generateText>[0][]=[]
 assert.equal(sceneRosterGenerationSchema(f.r).safeParse(first).success,false)
 await assert.rejects(bridgeBound(first,()=>first,{request:f.r,options}),error=>!!error&&typeof error==='object'&&'kind'in error&&error.kind==='invalid_schema');assert.equal(options.length,4);assert.deepEqual(first,before)
})
