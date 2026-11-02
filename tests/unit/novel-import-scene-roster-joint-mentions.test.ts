import assert from 'node:assert/strict'
import {test} from 'node:test'
import {bridgeBound} from '../helpers/novel-import-bound-decisions-fixture'
import {request as baseRequest} from '../helpers/novel-import-claim-patch-fixture'
import {sceneRosterGenerationSchema} from '../../desktop/service/novel-import-ai'
import {prepareSceneRosterClaimPatch,type SceneRosterPatchRow,type SceneRosterPatchProof} from '../../desktop/service/novel-import-scene-roster-claim-patch'
import {createSceneRosterRepairChoices} from '../../desktop/service/novel-import-scene-roster-repair-choices'
import {createSceneRosterFragmentTable} from '../../desktop/core/novel-import-scene-roster-fragments'
import {createSceneRosterBoundDecisions,compileBoundGroup,SCENE_BOUND_LIMITS} from '../../desktop/service/novel-import-scene-roster-bound-decisions'
import type {SceneRosterTargetedPlan} from '../../desktop/service/novel-import-scene-roster-targeted-repair'
import type {ImportUnit} from '../../desktop/shared/novel-import'
import {sceneAnchorSchema} from '../../desktop/shared/novel-import-scene-identity'

function compileFixture(row:SceneRosterPatchRow,units:ImportUnit[],proofs:SceneRosterPatchProof[]=[{mentions:[],context:[],links:[]}],draft:SceneRosterPatchRow[]=[row]){
 const before=structuredClone({row,units,proofs}),choices=createSceneRosterRepairChoices(units,createSceneRosterFragmentTable(units)),patch=prepareSceneRosterClaimPatch({draftHash:'JM_SYNTHETIC',slot:0,rowCount:draft.length,row,units,proofs,choices,resolveAnchor:value=>sceneAnchorSchema.parse(value)})
 assert.ok(patch);choices.wholeUnits();const plan:SceneRosterTargetedPlan={choices:choices.compactEntries(),rows:[{slot:0,repairRef:'rr'+'1'.repeat(16),canReject:false,requiredSpellings:[],candidates:[],keep:{mentions:[],context:[],links:[]},patch:{claims:patch.displayClaims()}}]},deck=createSceneRosterBoundDecisions({plan,draft,groups:()=>patch.boundGroups()})
 assert.deepEqual({row,units,proofs},before);return{patch,choices,plan,deck}
}

function fixture(){
 const r=baseRequest();r.units=['左侧甲室。尾白。','右侧甲室。尾白。'].map((text,index)=>({id:'joint-mention-'+index,fileId:'synthetic-joint',kind:'body',start:index*1000,end:index*1000+text.length,text}))
 const first={roster:[{mentions:[{literal:'甲室',evidence:{unitId:r.units[0].id,quote:'JM_UNMATCHED_A'}},{literal:'甲室',evidence:{unitId:r.units[1].id,quote:'JM_UNMATCHED_B'}}],context:[],links:[]}]},correct={roster:[{mentions:[{literal:'甲室',evidence:{unitId:r.units[0].id,quote:'左侧甲室。'}},{literal:'甲室',evidence:{unitId:r.units[1].id,quote:'右侧甲室。'}}],context:[],links:[]}]}
 return{r,first,correct}
}
test('JM01: fresh joint selections reject a repeated occurrence and preserve complete explicit distinct windows',async()=>{
 const f=fixture(),actual=await bridgeBound(f.first,({deck,generation})=>{assert.equal(deck.tasks.length,1);const task=deck.tasks[0];assert.equal(task.kind,'selection');if(task.kind!=='selection')throw Error('JM_SELECTION_REQUIRED');const numbers=f.correct.roster[0].mentions.map(m=>{const at=deck.choices.findIndex(c=>f.r.units[c.unitIndex].id===m.evidence.unitId&&f.r.units[c.unitIndex].text.slice(c.start,c.end)===m.evidence.quote);assert.ok(at>=0);return at+1});return{answers:{'1':{claimChoices:{'1':[numbers[0]],'2':[numbers[generation===2?0:1]]}}}}},{request:f.r})
 assert.equal(actual.options.length,3)
 assert.deepEqual(actual.result,sceneRosterGenerationSchema(f.r).parse(f.correct))
})
test('JM02: the complete handwritten small-domain oracle retains every legal full-window combination and no same-occurrence pair',()=>{
 const f=fixture(),value=compileFixture(f.first.roster[0],f.r.units),task=value.deck.data.tasks[0]
 assert.equal(value.deck.data.tasks.length,1);assert.equal(task.kind,'selection');if(task.kind!=='selection')throw Error('JM_SELECTION_REQUIRED')
 assert.deepEqual(task.claimIndexes,[0,1]);assert.deepEqual(value.plan.choices.map(choice=>[choice.unitIndex,f.r.units[choice.unitIndex].text.slice(choice.start,choice.end)]),[[0,'左侧甲室。'],[1,'右侧甲室。'],[0,f.r.units[0].text],[1,f.r.units[1].text]])
 const expected=[[[1],[2]],[[1],[4]],[[2],[1]],[[2],[3]],[[3],[2]],[[3],[4]],[[4],[1]],[[4],[3]]]
 assert.deepEqual(task.options,expected)
 const group=value.patch.boundGroups()[0],refs=value.plan.choices.map(choice=>choice.choiceRef)
 assert.throws(()=>group.validate([{claimRef:group.claimRefs[0],disposition:'resolve',choiceRefs:[refs[0]]},{claimRef:group.claimRefs[1],disposition:'resolve',choiceRefs:[refs[2]]}]),'different CF/full windows at one occurrence remain the same member')
 for(const option of expected)group.validate(option.map((numbers,index)=>({claimRef:group.claimRefs[index],disposition:'resolve' as const,choiceRefs:numbers.map(number=>refs[number-1])})))
})
test('JM03: exact literal groups use first-appearance order and original interleaved claim order before the unchanged context/link groups',()=>{
 const texts=['基室在东宅。','甲室。','甲室。','乙室。','Å室。A\u030A室。','目标室。'],units=texts.map((text,index)=>({id:'jm-order-'+index,fileId:'synthetic-order',kind:'body' as const,start:index*1000,end:index*1000+text.length,text})),anchor=(index:number)=>({unitId:units[index].id,quote:units[index].text}),row:SceneRosterPatchRow={mentions:[{literal:'基室',evidence:anchor(0)},...['甲室','乙室','甲室','Å室','A\u030A室'].map((literal,index)=>({literal,evidence:{unitId:units[0].id,quote:'JM_ORDER_BAD_'+index}}))],context:[{label:'东宅',evidence:[{unitId:units[0].id,quote:'JM_CONTEXT_BAD'}]}],links:[{targetIndex:1,relation:'different-place',evidence:[{unitId:units[0].id,quote:'JM_LINK_BAD'}]}]},proofs:SceneRosterPatchProof[]=[{mentions:[{literal:'基室',evidence:anchor(0)}],context:[],links:[]},{mentions:[{literal:'目标室',evidence:anchor(5)}],context:[],links:[]}],value=compileFixture(row,units,proofs,[row,{mentions:[{literal:'目标室',evidence:anchor(5)}],context:[],links:[]}]),before=structuredClone(value.patch.data),groups=value.patch.boundGroups(),index=(ref:string)=>value.patch.data.findIndex(claim=>claim.claimRef===ref)
 assert.deepEqual(groups.map(group=>group.claimRefs.map(index)),[[0,2],[1],[3],[4],[5],[6]])
 assert.deepEqual(value.deck.data.tasks.map(task=>task.kind==='selection'?task.claimIndexes:[]),[[0,2],[1],[3],[4],[5],[6]])
 assert.deepEqual(value.patch.data,before)
})

/** Distinct complete windows deliberately share a source occurrence. The
 * requested counts describe test inputs, never a truncated production domain. */
function limitFixture(weights:readonly[number,number],singles:readonly number[]=[],singleFirst=false){
 const literals=['甲室','甲室',...['乙室','丙室','丁室','戊室','己室'].slice(0,singles.length)],counts=[...weights,...singles],units=literals.map((literal,index)=>{const text=literal+String.fromCharCode(97+index).repeat(300);return{id:'jm-cap-'+index,fileId:'synthetic-cap',kind:'body' as const,start:index*1000,end:index*1000+text.length,text}}),choices=createSceneRosterRepairChoices(units,createSceneRosterFragmentTable(units))
 units.forEach((unit,index)=>{choices.addAnchor({unitId:unit.id,quote:unit.text},literals[index]);for(let at=0;at<counts[index]-1;at++)choices.addAnchor({unitId:unit.id,quote:unit.text.slice(0,literals[index].length+at)},literals[index])})
 const mentions=literals.map((literal,index)=>({literal,evidence:{unitId:units[index].id,quote:'JM_CAP_UNMATCHED_'+index}})),row:SceneRosterPatchRow={mentions:singleFirst?[...mentions.slice(2),...mentions.slice(0,2)]:mentions,context:[],links:[]}
 function patchFor(slot:number,rowCount=1){const patch=prepareSceneRosterClaimPatch({draftHash:'JM_CAP_SYNTHETIC',slot,rowCount,row,units,proofs:Array.from({length:slot+1},()=>({mentions:[],context:[],links:[]})),choices,resolveAnchor:value=>sceneAnchorSchema.parse(value)});assert.ok(patch);return patch}
 const patch=patchFor(0);choices.wholeUnits()
 function planFor(patches:ReturnType<typeof patchFor>[]){const plan:SceneRosterTargetedPlan={choices:choices.compactEntries(),rows:patches.map((current,slot)=>({slot,repairRef:'rr'+slot.toString(16).padStart(16,'0'),canReject:false,requiredSpellings:[],candidates:[],keep:{mentions:[],context:[],links:[]},patch:{claims:current.displayClaims()}}))};return plan}
 return{units,choices,row,patch,patchFor,planFor}
}
test('JM04: all256 legal full-window assignments survive, while the next source-window domain falls back as one complete row',()=>{
 assert.deepEqual(SCENE_BOUND_LIMITS,{options:256,rowSteps:4096,requestSteps:65536})
 const exact=limitFixture([8,16]),plan=exact.planFor([exact.patch]),deck=createSceneRosterBoundDecisions({plan,draft:[exact.row],groups:()=>exact.patch.boundGroups()}),task=deck.data.tasks[0]
 assert.equal(task.kind,'selection');if(task.kind!=='selection')throw Error('JM_SELECTION_REQUIRED');assert.equal(task.options.length,256);assert.equal(plan.choices.length,24)
 const larger=limitFixture([8,17],[1],true),full=larger.planFor([larger.patch]),before=structuredClone(full),fallback=createSceneRosterBoundDecisions({plan:full,draft:[larger.row],groups:()=>larger.patch.boundGroups()})
 assert.deepEqual(larger.patch.boundGroups().map(group=>group.claimRefs.length),[1,2],'a prior successful group must not remain after a later group exceeds the cap')
 assert.equal(fallback.data.tasks.length,1);assert.equal(fallback.data.tasks[0].kind,'claims');assert.equal(fallback.data.choices.length,26);assert.deepEqual(full,before)
 const mention=full.rows[0].patch!.claims.find(claim=>claim.kind==='mention'&&claim.literal==='甲室');assert.ok(mention);assert.equal(mention.eligibleChoiceRefs.length,25)
})
function naturalSteps(value:ReturnType<typeof limitFixture>,plan:SceneRosterTargetedPlan){let count=0;for(const group of value.patch.boundGroups())compileBoundGroup(plan.rows[0],group,new Map(plan.choices.map((choice,index)=>[choice.choiceRef,index+1])),()=>{count++});return count}
test('JM05: the real row budget admits complete work at4095/4096 and rejects the whole row at4097 without a partial group',()=>{
 for(const[expected,singles]of [[4095,[255,255,251,1,1]],[4096,[255,255,254]],[4097,[255,255,253,1]]]as const){const value=limitFixture([8,16],singles),plan=value.planFor([value.patch]);assert.equal(naturalSteps(value,plan),expected)
  const deck=createSceneRosterBoundDecisions({plan,draft:[value.row],groups:()=>value.patch.boundGroups()})
  if(expected<=4096){assert.equal(deck.data.tasks.length,value.patch.boundGroups().length);assert.ok(deck.data.tasks.every(task=>task.kind==='selection'))}else{assert.equal(deck.data.tasks.length,1);assert.equal(deck.data.tasks[0].kind,'claims')}
  assert.equal(deck.data.choices.length,24+singles.reduce((total,n)=>total+n,0))
 }
})
test('JM06: request work accumulates across rows to exactly65536, and the next tick rejects a whole untouched row',()=>{
 const value=limitFixture([8,16],[255,255,254]),patches=Array.from({length:17},(_,slot)=>slot?value.patchFor(slot,17):value.patch),plan=value.planFor(patches),before=structuredClone(plan),validations=Array(17).fill(0)
 assert.equal(naturalSteps(value,plan),4096)
 const deck=createSceneRosterBoundDecisions({plan,draft:patches.map(()=>value.row),groups:slot=>patches[slot].boundGroups().map(group=>({...group,validate(decisions){validations[slot]++;group.validate(decisions)}}))})
 assert.equal(deck.data.tasks.filter(task=>task.kind==='selection').length,16*4)
 assert.deepEqual(deck.data.tasks.filter(task=>task.kind==='claims').map(task=>task.slot),[16]);assert.ok(validations.slice(0,16).every(count=>count>0));assert.equal(validations[16],0)
 assert.equal(16*4096,SCENE_BOUND_LIMITS.requestSteps);assert.deepEqual(plan,before);assert.equal(deck.data.choices.length,788)
})
