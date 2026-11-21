import assert from 'node:assert/strict'
import {test} from 'node:test'
import {bridge,bad,good,request,patchReply,planOf} from '../helpers/novel-import-claim-patch-fixture'
import {bridgeBound,boundReply,boundPlanOf,boundReplacement} from '../helpers/novel-import-bound-decisions-fixture'
import {sceneRosterGenerationSchema} from '../../desktop/service/novel-import-ai'
import {sceneRosterKeyedInlineSchema,createSceneRosterBoundDecisions} from '../../desktop/service/novel-import-scene-roster-bound-decisions'
import {StructuredGenerationError} from '../../src/lib/ai/generate'

test('PC01: a fresh complete classified patch starts directly as one complete claims task and passes every original final gate',async()=>{
 const before=bad(),actual=await bridge(before,(reply,plan,prompt,r)=>{const deck=boundPlanOf(prompt);assert.equal(deck.tasks.length,1);const task=deck.tasks[0];assert.equal(task.kind,'claims');if(task.kind!=='claims')throw Error('TEST_CLAIMS_REQUIRED');assert.deepEqual(task.claimIndexes,plan.rows[0].patch!.claims.map((_,index)=>index));assert.deepEqual(task.domains,plan.rows[0].patch!.claims.map(claim=>{assert.ok('eligibleChoiceRefs'in claim&&Array.isArray(claim.eligibleChoiceRefs));return{kind:claim.kind,canReject:claim.canReject,choices:claim.eligibleChoiceRefs.map((ref:unknown)=>{assert.ok(typeof ref==='string');return plan.choices.findIndex(choice=>choice.choiceRef===ref)+1})}}));return boundReply(prompt,reply,r)})
 assert.equal(actual.options.length,2);assert.deepEqual(actual.result,sceneRosterGenerationSchema(request()).parse(good()));assert.deepEqual(before,bad())
})
const absent=()=>({mentions:[{literal:'原文没有的阁间',evidence:{unitId:request().units[0].id,quote:'PC_UNPROVEN'}}],context:[],links:[]})
test('PC02: a fully classified wholly absent row with no proof gets only the exact Native zero leaf, requiring explicit model rejection',async()=>{
 const r=request(),first={roster:[absent(),good().roster[1]]},actual=await bridgeBound(first,({deck})=>{assert.equal(deck.tasks.length,1);const task=deck.tasks[0];assert.equal(task.kind,'replacement');assert.equal((task as {primaryRejectOnly?:true}).primaryRejectOnly,true);return{answers:{'1':0}}})
 const schema=actual.options[1].jsonOutputSchema!;assert.deepEqual((schema.properties!.answers as any).properties['1'],{type:'integer',enum:[0]});assert.equal(actual.options.length,2);assert.deepEqual(actual.result,sceneRosterGenerationSchema(r).parse({roster:[good().roster[1]]}))
})

import {z} from 'zod'
import {createHash} from 'node:crypto'
import {sceneMentionRecordSchema,sceneAnchorSchema,type Anchor} from '../../desktop/shared/novel-import-scene-identity'
import {validateSceneRosterRecord} from '../../desktop/core/novel-import-scene-identity'
import {createSceneRosterTargetedRepair} from '../../desktop/service/novel-import-scene-roster-targeted-repair'
import {createSceneRosterFragmentTable} from '../../desktop/core/novel-import-scene-roster-fragments'
import type {SceneRosterPatchProof} from '../../desktop/service/novel-import-scene-roster-claim-patch'
import type {ImportUnit} from '../../desktop/shared/novel-import'
import {claimsCandidateFixture} from '../helpers/novel-import-claims-bound-fixture'
const preferred=z.strictObject({mentions:sceneMentionRecordSchema.shape.mentions,context:sceneMentionRecordSchema.shape.context,links:sceneMentionRecordSchema.shape.links})
const emptyProof=():SceneRosterPatchProof=>({mentions:[],context:[],links:[]})
function transaction(draft:unknown[]=[absent()],units:ImportUnit[]=request().units,proofs:SceneRosterPatchProof[]=draft.map(emptyProof)){
 return createSceneRosterTargetedRepair({draft,units,proofs,table:createSceneRosterFragmentTable(units),validate:(raw,slot)=>{const row=preferred.parse(raw),name=row.mentions[0].literal,record={name,aliases:[...new Set(row.mentions.map(m=>m.literal).filter(literal=>literal!==name))],...row};validateSceneRosterRecord(record,slot,draft.length,units);return record},patch:{binding:'PC_SYNTHETIC_BINDING',read:raw=>{const parsed=preferred.safeParse(raw);return parsed.success?parsed.data:undefined},resolveAnchor:raw=>sceneAnchorSchema.parse(raw)}})
}
const firstTask=(value:ReturnType<typeof transaction>)=>value.bound.data.tasks.find(task=>task.slot===0)!
test('PC03: only strict complete source-absent records without any proof or fixed incoming relation receive primary-zero',async t=>{
 const r=request(),anchor:Anchor={unitId:r.units[0].id,quote:r.units[0].text},west=good().roster[1]
 const cases:[string,()=>ReturnType<typeof transaction>][]=[
  ['unknown outer field',()=>transaction([{...absent(),unknown:true}])],
  ['legacy metadata',()=>transaction([{...absent(),name:'原文没有的阁间',aliases:[]}])],
  ['primary metadata',()=>transaction([{...absent(),primaryMentionIndex:0}])],
  ['partial shape',()=>{const row:any=absent();delete row.links;return transaction([row])}],
  ['unknown evidence key',()=>{const row:any=absent();row.mentions[0].evidence.extra=true;return transaction([row])}],
  ['duplicate occurrence classification',()=>{const row=absent();row.mentions.push(structuredClone(row.mentions[0]));return transaction([row])}],
  ['no raw spelling',()=>{const row=absent();row.mentions[0].literal='';return transaction([row])}],
  ['source-present spelling',()=>{const row=absent();row.mentions[0].literal='甲室';return transaction([row])}],
  ['mention proof',()=>transaction([absent()],r.units,[{...emptyProof(),mentions:[{literal:'甲室',evidence:anchor}]}])],
  ['context proof',()=>transaction([absent()],r.units,[{...emptyProof(),context:[{label:'东宅',evidence:anchor}]}])],
  ['link proof',()=>transaction([absent(),west],r.units,[{...emptyProof(),links:[{targetIndex:1,relation:'different-place',evidence:[anchor]}]},{...emptyProof(),mentions:west.mentions}])],
  ['immutable good incoming relation',()=>{const held={...west,links:[{targetIndex:0,relation:'different-place',evidence:[west.mentions[0].evidence]}]};return transaction([absent(),held])}],
  ['cross-unit source presence',()=>{const row=absent();row.mentions[0].literal='合成跨界';const parts=['合成跨','界'],units=parts.map((text,i)=>({id:'pc-boundary-'+i,fileId:'same-source',kind:'body' as const,start:i?3:0,end:(i?3:0)+text.length,text}));return transaction([row],units)}],
  ['empty eligible domain is still existing source',()=>{const row=absent();row.mentions[0].literal='乙室';return transaction([row,west],r.units,[emptyProof(),{...emptyProof(),mentions:west.mentions}])}],
 ]
 for(const[label,make]of cases)await t.test(label,()=>{const value=make(),task=firstTask(value);assert.equal(Object.hasOwn(task,'primaryRejectOnly'),false);if(task.kind==='replacement'){const native=(sceneRosterKeyedInlineSchema(value.bound.data.tasks,value.data.choices.length).properties!.answers as any).properties['1'];assert.ok(Array.isArray(native.anyOf),'full original replacement branches remain available');if(label==='immutable good incoming relation')assert.equal(task.boundCanReject,false)}if(label.includes('source')||label==='source-present spelling')assert.equal(value.data.rows[0].canReject,false)})
})

test('PC04: primary zero is Native-only; source-correct new names remain accepted through bound and explicit legacy replacement',async t=>{
 const r=request(),first={roster:[absent(),good().roster[1]]},replacement={mentions:[{literal:'甲室',evidence:{unitId:r.units[0].id,quote:r.units[0].text}}],context:[],links:[]},expected=sceneRosterGenerationSchema(r).parse({roster:[replacement,good().roster[1]]})
 for(const legacy of[false,true])await t.test(legacy?'explicit legacy':'bound replacement',async()=>{const actual=await bridgeBound(first,({prompt,request:actual,deck})=>{assert.equal((deck.tasks[0]as{primaryRejectOnly?:true}).primaryRejectOnly,true);if(!legacy)return{answers:{'1':boundReplacement(prompt,replacement,actual)}};const plan=planOf(prompt),choice=plan.choices.find(choice=>choice.unitIndex===0&&choice.start===0&&choice.end===r.units[0].text.length);assert.ok(choice);return{repairs:[{repairRef:plan.rows[0].repairRef,disposition:'replace',replacement:{...replacement,mentions:[{literal:'甲室',evidence:{choiceRef:choice.choiceRef}}]}}]}});assert.deepEqual(actual.result,expected);assert.equal(actual.options.length,2)})
 for(const variant of['missing','wrong-source','dangling']as const)await t.test(variant,async()=>{const options:Parameters<typeof import('../../src/lib/ai/generate').generateText>[0][]=[],draft=structuredClone(first);if(variant==='dangling')draft.roster[1]={...draft.roster[1],links:[{targetIndex:0,relation:'different-place',evidence:[draft.roster[1].mentions[0].evidence]}]};await assert.rejects(bridgeBound(draft,({prompt,request:actual})=>variant==='missing'?{answers:{}}:variant==='dangling'?{answers:{'1':0}}:{answers:{'1':boundReplacement(prompt,{...replacement,mentions:[{literal:'原文没有的阁间',evidence:replacement.mentions[0].evidence}]},actual)}},{options}),error=>error instanceof StructuredGenerationError&&error.kind==='invalid_schema');assert.equal(options.length,4)})
})

test('PC05: fresh claims never guess integers, singleton arrays or selection wrappers and execute zero untrusted accessors',()=>{
 const row=absent();row.mentions[0].literal='甲室';const fresh=transaction([row]),deck=fresh.bound,task=deck.data.tasks[0];assert.equal(task.kind,'claims');deck.activate()
 for(const value of[1,[3],{selection:1},{claimChoices:{}},{claimChoices:{'1':[]}}, {claimChoices:{'1':[0]}},{claimChoices:{'1':[1]},extra:true}])assert.throws(()=>deck.decodeRoot({answers:{'1':value}},()=>{throw Error('TEST_NO_REPLACEMENT_FALLBACK')}))
 let reads=0;const getter={};Object.defineProperty(getter,'claimChoices',{get(){reads++;return{'1':[1]}},enumerable:true});assert.throws(()=>deck.decodeRoot({answers:{'1':getter}},v=>v));const proxy=new Proxy({}, {ownKeys(){reads++;return[]},get(){reads++;return undefined}});assert.throws(()=>deck.decodeRoot(proxy,v=>v));assert.equal(reads,0)
})

test('PC06: fresh preparation advances only claims to complete replacement once, while the explicit legacy factory keeps both old transitions',()=>{
 const row=absent();row.mentions[0].literal='甲室';const fresh=transaction([row]),old=fresh.bound;assert.equal(old.data.tasks[0].kind,'claims');assert.equal(old.transitions,0);assert.equal(fresh.preferReplacement(),true);assert.equal(fresh.bound.data.tasks[0].kind,'replacement');assert.equal(fresh.bound.transitions,1);assert.equal(fresh.preferReplacement(),false);assert.throws(()=>old.advance(0));fresh.bound.activate();assert.throws(()=>fresh.preferReplacement())
 const claim=fresh.data.rows[0].patch!.claims[0],legacy=createSceneRosterBoundDecisions({plan:fresh.data,draft:[row],groups:()=>[{claimRefs:[claim.claimRef],validate(){}}]});assert.equal(legacy.data.tasks[0].kind,'selection');const claims=legacy.advance(0);assert.equal(claims.data.tasks[0].kind,'claims');const replacement=claims.advance(0);assert.equal(replacement.data.tasks[0].kind,'replacement');assert.equal(replacement.transitions,2);assert.equal(replacement.next(),undefined);replacement.activate();assert.throws(()=>replacement.next())
})

test('PC07: old six-task Native capability stays byte-identical and primary zero is the same independently pinned leaf',()=>{
 const f=claimsCandidateFixture(),schema=sceneRosterKeyedInlineSchema(f.deck.data.tasks,f.plan.choices.length);assert.equal(Buffer.byteLength(JSON.stringify(schema)),19491);assert.equal(createHash('sha256').update(JSON.stringify(schema)).digest('hex'),'e3b3997558bfc48b647b12b75c36dff3c9c50b12c83c36daa01370529eba9c52')
 const t=transaction(),task=firstTask(t);assert.equal(task.kind,'replacement');assert.equal((task as{primaryRejectOnly?:true}).primaryRejectOnly,true);const primary=(sceneRosterKeyedInlineSchema(t.bound.data.tasks,t.data.choices.length).properties!.answers as any).properties['1'];assert.deepEqual(primary,{type:'integer',enum:[0]});assert.deepEqual(primary,(schema.properties!.answers as any).properties['5'].anyOf[0]);assert.throws(()=>t.bound.decodeRoot({answers:{}},v=>v));assert.deepEqual(t.bound.decodeRoot({answers:{'1':0}},v=>v),[{repairRef:t.data.rows[0].repairRef,disposition:'reject'}])
})

test('PC08: a mutable bad-row incoming link does not disable primary zero, but the unchanged full remap still rejects its deleted endpoint',async()=>{
 const first={roster:[{...good().roster[0],unknown:'PC_FORCE_REPLACEMENT'},absent()]},options:Parameters<typeof import('../../src/lib/ai/generate').generateText>[0][]=[]
 await assert.rejects(bridgeBound(first,({prompt,request:r,deck})=>{assert.equal(deck.tasks.length,2);assert.equal(deck.tasks[0].kind,'replacement');assert.equal(deck.tasks[1].kind,'replacement');assert.equal((deck.tasks[1]as{primaryRejectOnly?:true}).primaryRejectOnly,true);return{answers:{'1':boundReplacement(prompt,good().roster[0],r),'2':0}}},{options}),error=>error instanceof StructuredGenerationError&&error.kind==='invalid_schema')
 assert.equal(options.length,4)
})
