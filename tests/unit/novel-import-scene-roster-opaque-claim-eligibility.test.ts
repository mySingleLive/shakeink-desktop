import assert from 'node:assert/strict'
import {test} from 'node:test'
import {claimsFixture,claimsBridge} from '../helpers/novel-import-claims-integration-fixture'
import {sceneRosterGenerationSchema} from '../../desktop/service/novel-import-ai'
import {prepareSceneRosterClaimPatch,type SceneRosterPatchRow,type SceneRosterPatchProof,type SceneRosterPatchDecision} from '../../desktop/service/novel-import-scene-roster-claim-patch'
import {createSceneRosterFragmentTable,restoreSceneRosterFragmentAnchor} from '../../desktop/core/novel-import-scene-roster-fragments'
import {createSceneRosterRepairChoices} from '../../desktop/service/novel-import-scene-roster-repair-choices'
import {sceneAnchorSchema} from '../../desktop/shared/novel-import-scene-identity'
import {z} from 'zod'
import {boundReplacement} from '../helpers/novel-import-bound-decisions-fixture'

test('OE01: a closed lexical-bad EF is only a pending position, never a first-answer source proof',async()=>{
 const f=claimsFixture(['甲室在东宅。','乙室在西宅。']),row={mentions:[{literal:'甲室',evidence:{ref:'ef'+'a'.repeat(18)}}],context:[{label:'东宅',evidence:[{ref:'ef'+'b'.repeat(18)}]}],links:[]},other={mentions:[{literal:'乙室',evidence:f.anchor(1)}],context:[],links:[]},first={roster:[row,other]},correct={roster:[{mentions:[{literal:'甲室',evidence:f.anchor(0)}],context:[{label:'东宅',evidence:[f.anchor(0)]}],links:[]},other]}
 assert.equal(sceneRosterGenerationSchema(f.request).safeParse(first).success,false)
 const actual=await claimsBridge(first,({deck})=>{assert.deepEqual(deck.tasks.map(task=>task.kind),['claims']);assert.deepEqual(deck.tasks[0].claimIndexes,[0,1]);assert.deepEqual(deck.tasks[0].domains?.map(domain=>[domain.kind,domain.canReject]),[['mention',false],['context',true]]);assert.deepEqual(deck.plan.rows[0].keep,{mentions:[],context:[],links:[]});const n=deck.plan.choices.findIndex(choice=>choice.unitIndex===0&&f.request.units[0].text.slice(choice.start,choice.end)===f.request.units[0].text)+1;assert.ok(n>0);assert.ok(deck.tasks[0].domains?.every(domain=>domain.choices.includes(n)));return{answers:{'1':{claimChoices:{'1':[n],'2':[n]}}}}},{request:f.request})
 assert.equal(actual.options.length,2);assert.deepEqual(actual.result,sceneRosterGenerationSchema(f.request).parse(correct))
})

function pure(row:SceneRosterPatchRow,rowCount:number,proofs:SceneRosterPatchProof[]){
 const f=claimsFixture(['甲室在东宅。','乙室在西宅。','丙室在南宅。']),table=createSceneRosterFragmentTable(f.request.units),choices=createSceneRosterRepairChoices(f.request.units,table),before=structuredClone({row,proofs,units:f.request.units}),reference=z.union([sceneAnchorSchema,z.strictObject({ref:z.string().regex(/^ef[0-9a-f]{16}$/u)}),z.strictObject({unitIndex:z.number().int().nonnegative(),fromFragment:z.number().int().nonnegative(),toFragment:z.number().int().nonnegative()})]),patch=prepareSceneRosterClaimPatch({draftHash:'OE_SYNTHETIC',slot:0,rowCount,row,proofs,units:f.request.units,choices,resolveAnchor:value=>{const source=reference.parse(value);return'ref'in source?table.resolve(source.ref):'unitIndex'in source?restoreSceneRosterFragmentAnchor(source,f.request.units):source}})
 choices.wholeUnits();assert.deepEqual({row,proofs,units:f.request.units},before);return{...f,patch,choices}
}
test('OE02: ownerless and unproved-target link components are all pending, including raw-valid windows',()=>{
 const f=claimsFixture(['甲室在东宅。','乙室在西宅。','丙室在南宅。']),row:SceneRosterPatchRow={mentions:[{literal:'甲室',evidence:{ref:'ef'+'a'.repeat(18)}}],context:[{label:'东宅',evidence:[f.anchor(0)]}],links:[{targetIndex:2,relation:'different-place',evidence:[f.anchor(0),f.anchor(1)]}]},v=pure(row,3,[{mentions:[],context:[],links:[]}]);assert.ok(v.patch)
 assert.deepEqual(v.patch.data.map(claim=>claim.kind),['mention','context','link','link']);assert.ok(v.choices.compactEntries().every(choice=>!choice.preserved))
 const display=v.patch.displayClaims();assert.ok(display.filter(claim=>claim.kind==='link').every(claim=>claim.eligibleChoiceRefs.length>0),'the real rowCount, not the shorter proofs array, binds target2')
 const decisions:SceneRosterPatchDecision[]=display.map(claim=>({claimRef:claim.claimRef,disposition:'resolve',choiceRefs:[claim.eligibleChoiceRefs[claim.kind==='link'&&claim.evidenceIndex===1?1:0]]}));assert.deepEqual(v.patch.apply(decisions),{...row,mentions:[{literal:'甲室',evidence:f.anchor(0)}]})
 const owned:SceneRosterPatchRow={...row,mentions:[{literal:'甲室',evidence:f.anchor(0)}],context:[]},w=pure(owned,3,[{mentions:[{literal:'甲室',evidence:f.anchor(0)}],context:[],links:[]}]);assert.ok(w.patch);assert.deepEqual(w.patch.data.map(claim=>claim.kind),['link','link']);assert.equal(w.choices.compactEntries().filter(choice=>choice.preserved).length,1,'only the old mention window is frozen')
})
test('OE03: self and out-of-range endpoints have explicit reject-only positions; original apply also refuses every resolve',()=>{
 const f=claimsFixture(['甲室在东宅。','乙室在西宅。','丙室在南宅。']),proof={mentions:[{literal:'甲室',evidence:f.anchor(0)},{literal:'乙室',evidence:f.anchor(1)}],context:[],links:[]}
 for(const targetIndex of[0,2,5000]){const row:SceneRosterPatchRow={...structuredClone(proof),links:[{targetIndex,relation:'parent',evidence:[f.anchor(0),{ref:'ef'+'b'.repeat(18)}]}]},v=pure(row,2,[proof]);assert.ok(v.patch);assert.equal(v.patch.data.length,2);assert.ok(v.patch.displayClaims().every(claim=>claim.kind==='link'&&claim.canReject&&claim.eligibleChoiceRefs.length===0))
  const reject=v.patch.data.map(claim=>({claimRef:claim.claimRef,disposition:'reject' as const}));assert.deepEqual(v.patch.apply(reject),proof)
  const ref=v.choices.forLiteral('甲室')[0];for(let at=0;at<2;at++){const resolve:SceneRosterPatchDecision[]=reject.map((value,index)=>index===at?{claimRef:value.claimRef,disposition:'resolve',choiceRefs:[ref]}:value);assert.throws(()=>v.patch!.apply(resolve));assert.throws(()=>v.patch!.boundGroups()[0].validate(resolve))}
 }
})
test('OE04: the real SDK bridge preserves both old atoms while explicitly rejecting a self link',async()=>{
 const f=claimsFixture(['甲室在东宅。','乙室在西宅。']),proof={mentions:[{literal:'甲室',evidence:f.anchor(0)},{literal:'乙室',evidence:f.anchor(1)}],context:[],links:[]},first={roster:[{...proof,links:[{targetIndex:0,relation:'parent',evidence:[f.anchor(0)]}]}]},actual=await claimsBridge(first,({deck})=>{assert.deepEqual(deck.tasks.map(task=>task.kind),['claims']);assert.deepEqual(deck.tasks[0].claimIndexes,[0]);assert.deepEqual(deck.tasks[0].domains,[{kind:'link',canReject:true,choices:[]}]);assert.equal(deck.plan.rows[0].keep.mentions.length,2);return{answers:{'1':{claimChoices:{'1':[]}}}}},{request:f.request});assert.equal(actual.options.length,2);assert.deepEqual(actual.result,sceneRosterGenerationSchema(f.request).parse({roster:[proof]}))
})
test('OE05: non-string, mixed, nested-extra and metadata rows remain complete replacements; no malformed token becomes proof',async t=>{
 for(const mode of['non-string','mixed','nested-extra','legacy','primary','ref-array']as const)await t.test(mode,async()=>{
  const f=claimsFixture(['甲室在东宅。']),correct={mentions:[{literal:'甲室',evidence:f.anchor(0)}],context:[],links:[]},row:Record<string,unknown>=structuredClone(correct),mention=row.mentions as Record<string,unknown>[]
  if(mode==='non-string')mention[0].evidence={ref:42};else if(mode==='mixed')mention[0].evidence={ref:'ef'+'a'.repeat(18),unitId:f.request.units[0].id};else if(mode==='nested-extra')Object.assign(mention[0],{note:'OE_PRIVATE_SENTINEL'});else if(mode==='ref-array')mention[0].evidence=[{ref:'ef'+'a'.repeat(18)}];else{mention[0].evidence={ref:'ef'+'a'.repeat(18)};if(mode==='legacy')Object.assign(row,{name:'甲室',aliases:[]});else row.primaryMentionIndex=0}
  const actual=await claimsBridge({roster:[row]},({deck,prompt})=>{assert.deepEqual(deck.tasks.map(task=>task.kind),['replacement']);return{answers:{'1':boundReplacement(prompt,correct,f.request)}}},{request:f.request});assert.equal(actual.options.length,2);assert.deepEqual(actual.result,sceneRosterGenerationSchema(f.request).parse({roster:[correct]}))
 })
})
test('OE06: empty half-open references and malformed refs are never directly accepted, and unknown sibling proof fields do not loosen sources',()=>{
 const f=claimsFixture(['甲室在东宅。']);for(const evidence of[{unitIndex:0,fromFragment:0,toFragment:0},{ref:'ef'+'a'.repeat(18)},{ref:'ef'+'a'.repeat(16),extra:true},[{ref:'ef'+'a'.repeat(16)}]])assert.equal(sceneRosterGenerationSchema(f.request).safeParse({roster:[{mentions:[{literal:'甲室',evidence}],context:[],links:[]}]}).success,false)
})
