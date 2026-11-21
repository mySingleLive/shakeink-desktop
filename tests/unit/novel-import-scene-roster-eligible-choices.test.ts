import assert from 'node:assert/strict'
import {test} from 'node:test'
import {bridge,bad,good,request,planOf,wide,west,alias,anchor} from '../helpers/novel-import-claim-patch-fixture'
import {sceneRosterGenerationSchema} from '../../desktop/service/novel-import-ai'
import {StructuredGenerationError} from '../../src/lib/ai/generate'
import {staticRosterCorrection,explicitTargetedRosterReply} from '../helpers/novel-import-targeted-repair-fixture'
import {createSceneRosterRepairChoices} from '../../desktop/service/novel-import-scene-roster-repair-choices'
import {createSceneRosterFragmentTable} from '../../desktop/core/novel-import-scene-roster-fragments'
import {createSceneRosterRetention} from '../../desktop/service/novel-import-scene-roster-retention'
import {prepareSceneRosterClaimPatch,type SceneRosterPatchRow} from '../../desktop/service/novel-import-scene-roster-claim-patch'
import {createSceneRosterTargetedRepair} from '../../desktop/service/novel-import-scene-roster-targeted-repair'
import {validateSceneRosterRecord} from '../../desktop/core/novel-import-scene-identity'
import type {Anchor,SceneMentionRecord} from '../../desktop/shared/novel-import-scene-identity'

test('EC01: complete real SDK repair exposes every statically eligible original choice without dropping the global catalog',async()=>{
 const actual=await bridge(),second=actual.options[1];assert.ok('prompt'in second);const plan=planOf(second.prompt),r=request()
 for(const claim of plan.rows[0].patch!.claims){
  const refs=(claim as typeof claim&{eligibleChoiceRefs?:string[]}).eligibleChoiceRefs;assert.ok(Array.isArray(refs));assert.ok(refs.length>0);assert.deepEqual(refs,[...new Set(refs)])
  for(const ref of refs){const choice=plan.choices.find(choice=>choice.choiceRef===ref)!;assert.ok(choice);const text=r.units[choice.unitIndex].text.slice(choice.start,choice.end);if(claim.kind==='mention')assert.equal(text.split(claim.literal).length-1,1);if(claim.kind==='context')assert.ok(text.includes(claim.label))}
 }
 assert.deepEqual(actual.result,sceneRosterGenerationSchema(r).parse(good()));assert.equal(actual.options.length,2)
})

test('EC02: the actual context-window guard reports only its declared repair and claim with a fixed reason on the next generation',async()=>{
 let round=0,expectedRef='',expectedClaim='';const actual=await bridge(bad(),(reply,plan)=>{
  round++;const claim=plan.rows[0].patch!.claims.find(claim=>claim.kind==='context')!,action=reply.repairs[0].patch.claims.find(value=>value.claimRef===claim.claimRef)!;expectedRef=plan.rows[0].repairRef;expectedClaim=claim.claimRef
  if(round===1){const choice=plan.choices.find(choice=>choice.unitIndex===1&&request().units[1].text.slice(choice.start,choice.end)===west)!;assert.ok(choice);action.choiceRefs=[choice.choiceRef]}return reply
 });assert.equal(actual.options.length,3);const third=actual.options[2];assert.ok('prompt'in third);const first=actual.options[0];assert.ok('prompt'in first);const correction=staticRosterCorrection(third.prompt.slice(first.prompt.length));assert.ok(correction.includes(expectedRef));assert.ok(correction.includes(expectedClaim));assert.ok(correction.includes('context-window-missing'));assert.ok(correction.includes('本轮只返回repairs事务'))
})

test('EC03: a terminal exact guard retains the existing repair-transaction business label',async()=>{
 await assert.rejects(bridge(bad(),(reply,plan)=>{const claim=plan.rows[0].patch!.claims.find(claim=>claim.kind==='context')!,action=reply.repairs[0].patch.claims.find(value=>value.claimRef===claim.claimRef)!;action.choiceRefs=[plan.choices.find(choice=>choice.unitIndex===1)!.choiceRef];return reply}),error=>{assert.ok(error instanceof StructuredGenerationError);assert.equal(error.kind,'invalid_schema');assert.match(error.message,/修复事务/u);assert.ok(error.feedback.some(value=>value.includes('context-window-missing')));return true})
})

function prepared(){
 const r=request(),extra='远处的阅览间门已关闭。';r.units.push({id:'ec-extra',fileId:'synthetic',start:8000,end:8000+extra.length,text:extra,kind:'body'})
 const row=good().roster[0];row.mentions.push({literal:'阅览间',evidence:anchor(0,'EC_BAD')});row.context.push({label:'东宅',evidence:[anchor(0,'EC_BAD')]});row.links[0].evidence[1].quote='EC_BAD'
 const draft=[row,good().roster[1]],resolveAnchor=(v:unknown)=>({...v as Anchor}),retention=createSceneRosterRetention(r.units);retention.capture(draft as Parameters<typeof retention.capture>[0],resolveAnchor);const proofs=retention.verifiedRows(),table=createSceneRosterFragmentTable(r.units),choices=createSceneRosterRepairChoices(r.units,table)
 for(const value of draft)for(const mention of value.mentions)choices.forLiteral(mention.literal)
 const patch=prepareSceneRosterClaimPatch({draftHash:'c'.repeat(64),slot:0,rowCount:draft.length,row,proofs,units:r.units,choices,resolveAnchor});assert.ok(patch)
 const late=choices.addAnchor(anchor(0,'东宅的甲室有蓝色书架。'));choices.wholeUnits()
 return{r,row,draft,proofs,table,choices,patch,late,resolveAnchor}
}
test('EC04: the frozen display is the exact static predicate set over the completed, unchanged directory',()=>{
 const value=prepared(),before=structuredClone(value.choices.entries()),directory=value.choices.compactEntries(),display=value.patch.displayClaims()
 assert.ok(Object.isFrozen(display));for(const claim of display){assert.ok(Object.isFrozen(claim));assert.ok(Object.isFrozen(claim.eligibleChoiceRefs));const expected=directory.filter(choice=>{const text=value.r.units[choice.unitIndex].text.slice(choice.start,choice.end);return claim.kind==='mention'?choice.unitIndex===2:claim.kind==='context'?text.includes('东宅')&&text!==wide:text!==wide}).map(choice=>choice.choiceRef);assert.deepEqual(claim.eligibleChoiceRefs,expected)}
 assert.ok(display.find(claim=>claim.kind==='context')!.eligibleChoiceRefs.includes(value.late));assert.deepEqual(value.choices.entries(),before)
 assert.throws(()=>display[0].eligibleChoiceRefs.push('cf'+'f'.repeat(16)));const copy=structuredClone(display);copy[0].eligibleChoiceRefs.length=0;assert.deepEqual(value.patch.displayClaims(),display)
})

test('EC05: known guard errors are request-local and forged errors or later unknown candidates never inherit them',async()=>{
 const value=prepared(),canonical=(raw:unknown,slot:number)=>{const row=raw as SceneRosterPatchRow,record={name:row.mentions[0].literal,aliases:[...new Set(row.mentions.map(mention=>mention.literal).filter(literal=>literal!==row.mentions[0].literal))],...row} as SceneMentionRecord;validateSceneRosterRecord(record,slot,value.draft.length,value.r.units);return record},make=(binding:string)=>createSceneRosterTargetedRepair({draft:value.draft,proofs:value.proofs,units:value.r.units,table:value.table,validate:canonical,patch:{binding,read:row=>row as SceneRosterPatchRow,resolveAnchor:value.resolveAnchor}}),current=make('current'),other=make('other'),row=current.data.rows[0],decisions=row.patch!.claims.map(claim=>({claimRef:claim.claimRef,disposition:'resolve' as const,choiceRefs:[claim.eligibleChoiceRefs[0]]})),mention=row.patch!.claims.find(claim=>claim.kind==='mention')!,old=current.data.choices.find(choice=>choice.unitIndex===0&&value.r.units[0].text.slice(choice.start,choice.end)===alias)!
 assert.equal(current.feedback(Object.assign(Error('EC_PRIVATE_ERROR'),{claimRef:mention.claimRef,reason:'old-mention'})),undefined)
 const invalid=structuredClone(decisions);invalid.find(claim=>claim.claimRef===mention.claimRef)!.choiceRefs=[old.choiceRef];let thrown:unknown;try{current.apply([{repairRef:row.repairRef,disposition:'patch',patch:{claims:invalid}}])}catch(error){thrown=error}
 assert.ok(current.feedback(thrown)?.includes('old-mention'));assert.equal(other.feedback(thrown),undefined);assert.equal(current.feedback(undefined),undefined)
 let round=0;const actual=await bridge(bad(),(reply,plan)=>{round++;const claim=plan.rows[0].patch!.claims.find(claim=>claim.kind==='context')!,action=reply.repairs[0].patch.claims.find(value=>value.claimRef===claim.claimRef)!;if(round===1)action.choiceRefs=[plan.choices.find(choice=>choice.unitIndex===1)!.choiceRef];if(round===2)action.choiceRefs=['cf'+'e'.repeat(16)];return reply});assert.equal(actual.options.length,4)
 const first=actual.options[0],last=actual.options[3];assert.ok('prompt'in first&&'prompt'in last);const feedback=staticRosterCorrection(last.prompt.slice(first.prompt.length));assert.ok(!feedback.includes('context-window-missing'));assert.ok(!feedback.includes('cf'+'e'.repeat(16)));assert.ok(!feedback.includes('修复定位'))
})

test('EC06: original replace accepts valid windows outside its preferred candidates and retains original source labels on failure',async()=>{
 const r=request(),row=good();row.roster[0].mentions[1].evidence=anchor(0,r.units[0].text)
 const actual=await bridge(bad(),(_reply,plan,prompt,input)=>{const encoded=explicitTargetedRosterReply(prompt,row,input.units) as any,ref=encoded.repairs[0].replacement.mentions[1].evidence.choiceRef,candidates=(plan.rows[0] as any).candidates.find((candidate:any)=>candidate.literal==='阅览间').choiceRefs;assert.ok(!candidates.includes(ref));return encoded});assert.deepEqual(actual.result,sceneRosterGenerationSchema(r).parse(row))
 const wrong=good();wrong.roster[0].context[0].evidence=[anchor(1,west)]
 await assert.rejects(bridge(bad(),(_reply,_plan,prompt,input)=>explicitTargetedRosterReply(prompt,wrong,input.units)),error=>{assert.ok(error instanceof StructuredGenerationError);assert.match(error.message,/原文限定/u);assert.equal(error.kind,'invalid_schema');return true})
})
