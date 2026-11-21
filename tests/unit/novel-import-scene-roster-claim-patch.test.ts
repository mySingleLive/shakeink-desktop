import assert from 'node:assert/strict'
import {test} from 'node:test'
import {sceneRosterGenerationSchema} from '../../desktop/service/novel-import-ai'
import {prepareSceneRosterClaimPatch,type SceneRosterPatchRow} from '../../desktop/service/novel-import-scene-roster-claim-patch'
import {createSceneRosterRepairChoices} from '../../desktop/service/novel-import-scene-roster-repair-choices'
import {createSceneRosterFragmentTable} from '../../desktop/core/novel-import-scene-roster-fragments'
import {createSceneRosterRetention} from '../../desktop/service/novel-import-scene-roster-retention'
import {validateSceneRosterRecords} from '../../desktop/core/novel-import-scene-identity'
import type {Anchor,SceneMentionRecord} from '../../desktop/shared/novel-import-scene-identity'
import {wide,alias,west,pub,request,anchor,good,bad,planOf,patchReply,bridge} from '../helpers/novel-import-claim-patch-fixture'
import {StructuredGenerationError} from '../../src/lib/ai/generate'
import {explicitTargetedRosterReply} from '../helpers/novel-import-targeted-repair-fixture'
import {boundPlanOf} from '../helpers/novel-import-bound-decisions-fixture'
import {assertBoundNativeShape} from '../helpers/novel-import-bound-native-shape-fixture'

function assertBoundNative(options:{jsonOutputSchema?:unknown;prompt?:string}){
 assert.ok(typeof options.prompt==='string');assertBoundNativeShape(options.jsonOutputSchema,boundPlanOf(options.prompt))
}

test('CP01: explicit bound claims repair only unproven positions through the real SDK and preserve the complete application-owned base',async()=>{
 const actual=await bridge();assert.deepEqual(actual.result,sceneRosterGenerationSchema(request()).parse(good()));assert.equal(actual.options.length,2);assert.equal(actual.usageRows.length,2)
 const second=actual.options[1];assert.ok('prompt'in second);const plan=planOf(second.prompt);assert.deepEqual(plan.rows[0].patch?.claims.map(claim=>claim.kind),['mention','context','link']);assert.deepEqual(actual.model.doStreamCalls.map(call=>call.responseFormat?.type==='json'?call.responseFormat.schema?.required:undefined),[['roster'],['answers']]);assertBoundNative(second);assert.equal(actual.model.doStreamCalls[1].maxOutputTokens,undefined)
})

function purePatch(row:SceneRosterPatchRow,r=request()){const draft=[row,good().roster[1]],retention=createSceneRosterRetention(r.units),resolveAnchor=(value:unknown)=>({...value as Anchor});retention.capture(draft as Parameters<typeof retention.capture>[0],resolveAnchor);const choices=createSceneRosterRepairChoices(r.units,createSceneRosterFragmentTable(r.units));for(const value of draft)for(const mention of value.mentions)choices.forLiteral(mention.literal);choices.wholeUnits();return{r,choices,patch:prepareSceneRosterClaimPatch({draftHash:'a'.repeat(64),slot:0,rowCount:draft.length,row,proofs:retention.verifiedRows(),units:r.units,choices,resolveAnchor})}}
function canonical(row:SceneRosterPatchRow):SceneMentionRecord{return{name:row.mentions[0].literal,aliases:[...new Set(row.mentions.slice(1).map(value=>value.literal).filter(value=>value!==row.mentions[0].literal))],...row} as SceneMentionRecord}
test('CP-Q1: insufficient distinct source occurrences make the complete row ineligible instead of creating an unsatisfiable patch',()=>{
 const row=good().roster[0];row.mentions=[row.mentions[0],{literal:'阅览间',evidence:anchor(0,'CP_BAD_A')},{literal:'阅览间',evidence:anchor(0,'CP_BAD_B')}]
 assert.equal(purePatch(row).patch,undefined)
})
test('CP-Q2: rejecting every unproven link position preserves its already-proved source components without a false resolve-borrow error',()=>{
 const row=good().roster[0];row.mentions=[row.mentions[0]];row.context=[];row.links=[{targetIndex:1,relation:'different-place',evidence:[anchor(0,wide)]},{targetIndex:1,relation:'different-place',evidence:[anchor(0,wide),anchor(0,'CP_BAD')]}]
 const actual=purePatch(row);assert.ok(actual.patch);const result=actual.patch.apply(actual.patch.data.map(claim=>({claimRef:claim.claimRef,disposition:'reject'})))
 const expected=structuredClone(row);expected.links[1].evidence.pop();assert.deepEqual(result,expected);validateSceneRosterRecords([canonical(result),canonical(good().roster[1])],actual.r.units)
})
test('CP-Q3: new unresolved occurrences cannot become a shared bridge between two previously separate source owners',async()=>{
 const r=request(),common='远处的共用厅门打开。';r.units.push({id:'cp-unit-2',fileId:'synthetic',start:8000,end:8000+common.length,text:common,kind:'body'})
 const draft=good();draft.roster[0].context=[];draft.roster[0].links=[];draft.roster[0].mentions[1].evidence.quote='CP_BAD_ALIAS';for(const row of draft.roster)row.mentions.push({literal:'共用厅',evidence:anchor(0,'CP_BAD_COMMON')})
 await assert.rejects(bridge(draft,(_reply,plan)=>({repairs:plan.rows.map(row=>({repairRef:row.repairRef,disposition:'patch',patch:{claims:row.patch!.claims.map(claim=>{const quote=(claim as {literal?:string}).literal==='阅览间'?alias:common,unitIndex=quote===alias?0:2,choice=plan.choices.find(choice=>choice.unitIndex===unitIndex&&r.units[unitIndex].text.slice(choice.start,choice.end)===quote);assert.ok(choice);return{claimRef:claim.claimRef,disposition:'resolve',choiceRefs:[choice.choiceRef]}})}}))}),{request:r}),error=>error instanceof StructuredGenerationError&&error.kind==='invalid_schema')
})

test('CP02: patch decisions form a strict closed set and cannot change bound strings, positions, permissions or private choices',async t=>{
 const variants:[string,(reply:any,plan:ReturnType<typeof planOf>)=>unknown][]=[
  ['missing claim',reply=>{reply.repairs[0].patch.claims.pop();return reply}],
  ['duplicate claim',reply=>{reply.repairs[0].patch.claims[1]=structuredClone(reply.repairs[0].patch.claims[0]);return reply}],
  ['unknown claim',reply=>{reply.repairs[0].patch.claims[0].claimRef='pc'+'f'.repeat(16);return reply}],
  ['unknown row',reply=>{reply.repairs[0].repairRef='rr'+'f'.repeat(16);return reply}],
  ['free literal',reply=>{reply.repairs[0].patch.claims[0].literal='CP_RAW_ONLY_SECRET';return reply}],
  ['free label',reply=>{reply.repairs[0].patch.claims[1].label='CP_RAW_ONLY_SECRET';return reply}],
  ['free endpoint',reply=>{reply.repairs[0].patch.claims[2].targetIndex=0;return reply}],
  ['free relation',reply=>{reply.repairs[0].patch.claims[2].relation='same-place';return reply}],
  ['foreign choice',reply=>{reply.repairs[0].patch.claims[0].choiceRefs=['cf'+'f'.repeat(16)];return reply}],
  ['coordinate choice',reply=>{reply.repairs[0].patch.claims[0].choiceRefs=[{choiceRef:'cf'+'f'.repeat(16),unitIndex:0,start:0,end:1}];return reply}],
  ['multiple mention windows',reply=>{reply.repairs[0].patch.claims[0].choiceRefs.push(reply.repairs[0].patch.claims[1].choiceRefs[0]);return reply}],
  ['duplicate group window',reply=>{reply.repairs[0].patch.claims[1].choiceRefs.push(reply.repairs[0].patch.claims[1].choiceRefs[0]);return reply}],
  ['reject source-present mention',reply=>{reply.repairs[0].patch.claims[0]={claimRef:reply.repairs[0].patch.claims[0].claimRef,disposition:'reject'};return reply}],
  ['reject with hidden choices',reply=>{reply.repairs[0].patch.claims[1].disposition='reject';return reply}],
  ['mixed replacement',reply=>{reply.repairs[0].replacement=good().roster[0];return reply}],
  ['free add array',reply=>{reply.repairs[0].patch.add=[];return reply}],
  ['missing all decisions',reply=>{reply.repairs[0].patch.claims=[];return reply}],
  ['wrong root',()=>good()],
 ]
 for(const [label,change]of variants)await t.test(label,async()=>{const options:Parameters<typeof import('../../src/lib/ai/generate').generateText>[0][]=[];await assert.rejects(bridge(bad(),change,{options}),error=>{assert.ok(error instanceof StructuredGenerationError);assert.equal(error.kind,'invalid_schema');assert.ok(!JSON.stringify({message:error.message,feedback:error.feedback}).includes('CP_RAW_ONLY_SECRET'));return true});assert.equal(options.length,4);for(const value of options.slice(1))assertBoundNative(value)})
})

test('CP03: partial groups keep every verified original position and may reject only explicitly unproven positions',async()=>{
 const first=bad();first.roster[0].context[0].evidence=[anchor(0,wide),anchor(0,'CP_BAD_CONTEXT')]
 const result=await bridge(first,(reply,plan)=>{for(const claim of reply.repairs[0].patch.claims){const descriptor=plan.rows[0].patch!.claims.find(value=>value.claimRef===claim.claimRef)!;if(descriptor.kind==='context')Object.assign(claim,{disposition:'reject'});if(descriptor.kind==='context')delete (claim as {choiceRefs?:string[]}).choiceRefs}return reply})
 assert.deepEqual(result.result,sceneRosterGenerationSchema(request()).parse(good()))
 const absent=bad();absent.roster[0].mentions.push({literal:'CP_NO_SOURCE_LITERAL',evidence:anchor(0,'CP_BAD')})
 const accepted=await bridge(absent,(reply,plan)=>{for(const claim of reply.repairs[0].patch.claims){const descriptor=plan.rows[0].patch!.claims.find(value=>value.claimRef===claim.claimRef)!;if(descriptor.kind==='mention'&&descriptor.literal==='CP_NO_SOURCE_LITERAL'){Object.assign(claim,{disposition:'reject'});delete (claim as {choiceRefs?:string[]}).choiceRefs}}return reply})
 assert.deepEqual(accepted.result,sceneRosterGenerationSchema(request()).parse(good()))
})

test('CP04: unknown, legacy, malformed or non-decomposable records keep the complete original replace path',async t=>{
 const fragments=createSceneRosterFragmentTable(request().units).units[0].fragments;let endFragment=0,length=0;while(length<wide.length)length+=fragments[endFragment++].text.length;assert.equal(length,wide.length)
 const variants:[string,(row:any)=>void][]=[
  ['unknown record key',row=>{row.note='CP_UNKNOWN'}],
  ['unknown mention key',row=>{row.mentions[0].note='CP_UNKNOWN'}],
  ['unknown context key',row=>{row.context[0].note='CP_UNKNOWN'}],
  ['unknown link key',row=>{row.links[0].note='CP_UNKNOWN'}],
  ['legacy name aliases',row=>{row.name='甲室';row.aliases=['阅览间']}],
  ['legacy primary',row=>{row.primaryMentionIndex=0}],
  ['mixed anchor',row=>{row.mentions[1].evidence.ref='ef'+'f'.repeat(16)}],
  ['duplicate unresolved position',row=>{row.mentions.push(structuredClone(row.mentions[1]))}],
  ['same context component in two legal encodings',row=>{row.context[0].evidence=[anchor(0,wide),{unitIndex:0,fromFragment:0,toFragment:endFragment}]}],
  ['same link component in two legal encodings',row=>{row.links[0].evidence.splice(1,0,{unitIndex:0,fromFragment:0,toFragment:endFragment})}],
  ['unbound link endpoint',row=>{row.links[0].targetIndex=20}],
 ]
 for(const [label,change]of variants)await t.test(label,async()=>{const first=bad();change(first.roster[0]);const actual=await bridge(first,(_reply,plan,prompt,r)=>{if(label==='unbound link endpoint'){const links=plan.rows[0].patch?.claims.filter(claim=>claim.kind==='link');assert.equal(links?.length,2);assert.ok(links?.every(claim=>claim.canReject&&'eligibleChoiceRefs'in claim&&Array.isArray(claim.eligibleChoiceRefs)&&claim.eligibleChoiceRefs.length===0))}else assert.equal(plan.rows[0].patch,undefined);return explicitTargetedRosterReply(prompt,good(),r.units)});assert.deepEqual(actual.result,sceneRosterGenerationSchema(request()).parse(good()));assert.equal(actual.options.length,2);assertBoundNative(actual.options[1])})
})

test('CP05: claim capabilities cannot be replayed across changed source, ordering or working versions',async t=>{
 const first=await bridge(),value=first.options[1];assert.ok('prompt'in value);const oldReply=patchReply(planOf(value.prompt),request())
 for(const [label,change]of [['working revision',(r:ReturnType<typeof request>)=>{r.workingRevision=1}],['source order',(r:ReturnType<typeof request>)=>{r.units.reverse()}],['source bytes',(r:ReturnType<typeof request>)=>{r.units[0].text+='新增有据材料。';r.units[0].end=r.units[0].start+r.units[0].text.length}]] as const)await t.test(label,async()=>{const r=request();change(r);await assert.rejects(bridge(bad(),()=>oldReply,{request:r}),error=>error instanceof StructuredGenerationError&&error.kind==='invalid_schema')})
})

test('CP06: old source facts cannot be borrowed as new claims even through a different valid mention window',()=>{
 const r=request(),extra='远处阅览间的窗户关闭。';r.units.push({id:'cp-unit-2',fileId:'synthetic',start:8000,end:8000+extra.length,text:extra,kind:'body'})
 const row=good().roster[0];row.context=[];row.links=[];row.mentions.push({literal:'阅览间',evidence:anchor(0,'CP_BAD')});const actual=purePatch(row,r);assert.ok(actual.patch)
 const sameOccurrence=anchor(0,r.units[0].text);validateSceneRosterRecords([canonical({...row,mentions:[row.mentions[0],{literal:'阅览间',evidence:sameOccurrence}]})],r.units)
 const oldRef=actual.choices.addAnchor(sameOccurrence,'阅览间'),claim=actual.patch.data[0];assert.throws(()=>actual.patch!.apply([{claimRef:claim.claimRef,disposition:'resolve',choiceRefs:[oldRef]}]))
 const newRef=actual.choices.addAnchor(anchor(2,extra),'阅览间'),result=actual.patch.apply([{claimRef:claim.claimRef,disposition:'resolve',choiceRefs:[newRef]}]);assert.deepEqual(result.mentions.slice(0,2),row.mentions.slice(0,2));assert.deepEqual(result.mentions[2],{literal:'阅览间',evidence:anchor(2,extra)})
 for(const kind of ['context','link']){
  const value=good().roster[0];value.mentions=[value.mentions[0]]
  if(kind==='context'){value.links=[];value.context.push({label:'东宅',evidence:[anchor(0,'CP_BAD')]})}
  else{value.context=[];value.links.push({targetIndex:1,relation:'different-place',evidence:[anchor(0,wide),anchor(0,'CP_BAD')]})}
  const prepared=purePatch(value);assert.ok(prepared.patch);const selected=prepared.choices.addAnchor(kind==='context'?anchor(0,wide):anchor(1,west))
  assert.throws(()=>prepared.patch!.apply(prepared.patch!.data.map(claim=>({claimRef:claim.claimRef,disposition:'resolve',choiceRefs:[selected]}))))
 }
})

test('CP07: multiple unproven evidence positions remain separate bound decisions in their original group',async()=>{
 const first=bad();first.roster[0].context[0].evidence=[anchor(0,'CP_BAD_ONE'),anchor(0,'CP_BAD_TWO')]
 const actual=await bridge(first,(reply,plan)=>{const contexts=plan.rows[0].patch!.claims.filter(claim=>claim.kind==='context');assert.deepEqual(contexts.map(claim=>claim.evidenceIndex),[0,1]);const last=reply.repairs[0].patch.claims.find(claim=>claim.claimRef===contexts[1].claimRef)!;Object.assign(last,{disposition:'reject'});delete (last as {choiceRefs?:string[]}).choiceRefs;return reply});assert.deepEqual(actual.result,sceneRosterGenerationSchema(request()).parse(good()))
})

test('CP08: mixed patch and replace cannot share a new occurrence to bridge frozen owners',async()=>{
 const r=request(),common='远处的共用厅门打开。';r.units.push({id:'cp-unit-2',fileId:'synthetic',start:8000,end:8000+common.length,text:common,kind:'body'})
 const draft=good();draft.roster[0].context=[];draft.roster[0].links=[];draft.roster[0].mentions[1].evidence.quote='CP_BAD_ALIAS';for(const row of draft.roster)row.mentions.push({literal:'共用厅',evidence:anchor(0,'CP_BAD_COMMON')})
 await assert.rejects(bridge(draft,(_reply,plan,prompt)=>{
  const output={repairs:plan.rows.map(row=>row.slot===1?{repairRef:row.repairRef,disposition:'replace',replacement:{mentions:[good().roster[1].mentions[0],{literal:'共用厅',evidence:anchor(2,common)}],context:[],links:[]}}:{repairRef:row.repairRef,disposition:'patch',patch:{claims:row.patch!.claims.map(claim=>{const quote=claim.kind==='mention'&&claim.literal==='阅览间'?alias:common,unitIndex=quote===alias?0:2,choice=plan.choices.find(choice=>choice.unitIndex===unitIndex&&r.units[unitIndex].text.slice(choice.start,choice.end)===quote);assert.ok(choice);return{claimRef:claim.claimRef,disposition:'resolve',choiceRefs:[choice.choiceRef]}})}})}
  return explicitTargetedRosterReply(prompt,output,r.units)
 },{request:r}),error=>error instanceof StructuredGenerationError&&error.kind==='invalid_schema')
})
