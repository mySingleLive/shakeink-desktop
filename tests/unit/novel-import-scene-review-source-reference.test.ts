import assert from 'node:assert/strict'
import {test} from 'node:test'
import {NovelImportController} from '../../desktop/main/novel-import'
import {generateImportAiJson,importAiResponseSchema,runImportAi} from '../../desktop/service/novel-import-ai'
import {serializeImportAiPayload,importAiPrompt,assertImportPayloadBudget,assertImportFixedPromptReserve} from '../../desktop/core/novel-import-ai-payload'
import {createImportReviewProjection,assertImportReviewProjection} from '../../desktop/core/novel-import-semantics'
import {createImportSemanticState} from '../../desktop/core/novel-import-semantic-state'
import {workingImportUnits} from '../../desktop/core/novel-import'
import {importRequestBudget} from '../../desktop/core/novel-import-budget-policy'
import {StructuredGenerationError} from '../../src/lib/ai/generate'
import type {ResolvedModel} from '../../src/lib/ai/provider'
import type {ImportAiRequest,ImportArtifact,ImportModel} from '../../desktop/shared/novel-import'
import {IMPORT_SCENE_REVIEW_SOURCE_GUIDANCE} from '../../desktop/shared/novel-import-scene-review'
import {legacySceneFixture,rosterAi,entityResult,toImportScene} from '../helpers/novel-import-wizard-fixture'

const model:ImportModel={id:'sv-review',name:'合成版本复核模型',modelId:'synthetic',endpoint:'https://source.invalid/v1',authRevision:1,contextWindow:1048576},context={userId:'synthetic-source-reference',resolvedModel:{} as ResolvedModel}
const long=' \t首哨兵😀\r\n'+'完整场景背景𠀀。'.repeat(90)+'\r\n末哨兵  ',body='合成场景甲和合成场景乙在原文中均有完整记载。',secret='SV-EXTRA-SYNTHETIC-SECRET'
function artifact(id:string,name:string):ImportArtifact{return{id,kind:'scene',schema:2,name,text:'全文首😀'+ '甲'.repeat(700)+'全文尾𠀀',facts:{entityType:'PLACE',coordinates:'',backstory:long,exteriorDescription:'完整外观'},evidence:[{unitId:'sv-unit',quote:body}],sourceUnitIds:['sv-unit'],origin:'inferred'}}
function request():ImportAiRequest{const artifacts=[artifact('sv-a','合成场景甲'),artifact('sv-b','合成场景乙')];return{semanticVersion:1,operationId:'sv-op',phase:'review',selectedTargets:['scene'],models:{text:{...model,id:'sv-text'},review:model},units:[{id:'sv-unit',fileId:'synthetic-source',start:0,end:body.length,text:body,kind:'body'}],artifacts,reviewProjection:artifacts.map(a=>createImportReviewProjection(a,a,{start:0,end:a.text.length})),workingRevision:0,instruction:'作者确认决定与完整资料必须保留。'}}
function conflict(source:unknown={artifactIndex:0},candidate:unknown={text:'完整候选说明',value:'有据的候选修订',unitId:'sv-unit'},type:'setting-body'|'source-source'|'body-body'='setting-body',field='backstory'){return{id:'sv-conflict',hash:'sv-hash',type,kind:'body',entity:'合成陈述',field,source,candidate,evidence:[{unitIndex:0}],status:'pending'}}
const generated=(value:unknown)=>({text:JSON.stringify(value),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'})
async function bridge(r:ImportAiRequest,sequence:unknown[],prompts:string[]=[]){return runImportAi(r,new AbortController().signal,{resolve:async role=>r.models[role]!,assert:async()=>{},generate:async(input,_m,signal,prompt)=>generateImportAiJson(input,context,signal,prompt,{generateText:async opts=>{prompts.push('prompt'in opts?opts.prompt:'');return generated(sequence[Math.min(prompts.length-1,sequence.length-1)])}})})}

test('SV01: real JSON bridge binds complete source values and preserves actual candidate proposals',async t=>{
 for(const sourceSource of [false,true])await t.test(sourceSource?'source-source binds both sides':'setting-body preserves the proposal',async()=>{
  const r=request(),before=structuredClone(r),source={artifactIndex:1},candidate=sourceSource?{artifactIndex:0}:{text:'候选原说明',value:'真正的候选提案😀',unitId:'sv-unit'},raw={conflicts:[conflict(source,candidate,sourceSource?'source-source':'setting-body')]},snapshot=structuredClone(raw),result=await bridge(r,[raw]),c=result.conflicts![0]
  assert.deepEqual(c.source,{artifactId:'sv-b',text:long,value:long});assert.equal(c.kind,'body');assert.equal(c.type,sourceSource?'source-source':'setting-body');assert.ok(long.length>512)
  assert.deepEqual(c.candidate,sourceSource?{artifactId:'sv-a',text:long,value:long}:candidate);assert.ok(!JSON.stringify(result).includes('artifactIndex'));assert.deepEqual(r,before);assert.deepEqual(raw,snapshot)
  const canonicalRaw={conflicts:[{...raw.conflicts[0],source:{artifactId:'sv-b',text:long,value:long},candidate:c.candidate}]};assert.deepEqual(result,await bridge(r,[canonicalRaw]))
  const empty=await bridge(r,[{conflicts:[conflict({artifactIndex:0},undefined,'setting-body','coordinates')]}]);assert.deepEqual(empty.conflicts![0].source,{artifactId:'sv-a',text:'',value:''})
  const other=request();other.artifacts=other.artifacts.slice(1);other.reviewProjection=other.reviewProjection!.slice(1);assert.equal((await bridge(other,[{conflicts:[conflict({artifactIndex:0})]}])).conflicts![0].source.artifactId,'sv-b','the same index is local to each packet')
 })
 await t.test('accepted references pass the original decision version guard; wrong old source remains blocked',async()=>{
  const f=await legacySceneFixture(undefined,rosterAi()),base=f.handler();f.setAi(async r=>r.intent==='entity'?entityResult(r,()=>({backstory:long})):base(r))
  try{await toImportScene(f);await f.settle();const saved=await f.journal(),a=saved.artifacts[0],b=saved.artifacts[1],units=workingImportUnits(saved),r:ImportAiRequest={...request(),models:{text:saved.analysisGrant!.textModel,review:saved.analysisGrant!.reviewModel},units,artifacts:[a,b],reviewProjection:[a,b].map(v=>createImportReviewProjection(v,v,{start:0,end:v.text.length}))}
   for(const [type,choices]of [['setting-body',['source','inferred']],['source-source',['a','b']]] as const){const raw=conflict({artifactIndex:0},type==='source-source'?{artifactIndex:1}:{text:'候选',value:'完整候选背景',unitId:units[0].id},type);raw.evidence=[{unitIndex:0}];const accepted=(await bridge(r,[{conflicts:[raw]}])).conflicts![0]
    for(const choice of choices){const owner=structuredClone(saved);owner.conflicts=[structuredClone(accepted)];owner.semanticState=createImportSemanticState(owner);const initial=JSON.stringify(owner),sentinel=new Error('synthetic post-version boundary');let reached=0,writes=0,ai=0
     const controller=Object.create(NovelImportController.prototype) as any;controller.session=owner;controller.options={models:async()=>({text:owner.analysisGrant!.textModel,review:owner.analysisGrant!.reviewModel})};controller.semanticRepairs=()=>{reached++;throw sentinel};controller.ai=async()=>{ai++;throw Error('forbidden model')};controller.save=async()=>{writes++;throw Error('forbidden write')};controller.launch=()=>{ai++;throw Error('forbidden launch')}
     await assert.rejects(controller.semanticDecision(owner,{type:'resolve',choice,explanation:'合成作者决定'},owner.conflicts[0],owner.artifacts.find(v=>v.id===accepted.source.artifactId)),e=>e===sentinel);assert.equal(reached,1);assert.equal(writes,0);assert.equal(ai,0);assert.equal(JSON.stringify(owner),initial)
     const wrongOwner=structuredClone(owner);wrongOwner.conflicts[0].source.value=secret;controller.session=wrongOwner;await assert.rejects(controller.semanticDecision(wrongOwner,{type:'resolve',choice,explanation:'合成作者决定'},wrongOwner.conflicts[0],wrongOwner.artifacts.find(v=>v.id===wrongOwner.conflicts[0].source.artifactId)),/冲突决定与当前设定版本不匹配/)
    }
   }
  }finally{await f.dispose()}
 })
})

test('SV02: unavailable, mismatched and malformed sources fail rather than being silently repaired',async t=>{
 const r=request(),rawSource={artifactId:'sv-a',text:'原说明无需重写',value:long}
 await t.test('explicit bad raw corrects once through a safe fixed instruction',async()=>{
  const bad={conflicts:[conflict({...rawSource,value:secret})]},good={conflicts:[conflict({artifactIndex:0})]},prompts:string[]=[];assert.deepEqual((await bridge(r,[bad,good],prompts)).conflicts![0].source,{artifactId:'sv-a',text:long,value:long});assert.equal(prompts.length,2);const feedback=prompts[1].slice(prompts[0].length);assert.ok(feedback.includes(IMPORT_SCENE_REVIEW_SOURCE_GUIDANCE));assert.ok(IMPORT_SCENE_REVIEW_SOURCE_GUIDANCE.length<=250);for(const value of [secret,long,'sv-a','sv-b',body,r.instruction!])assert.ok(!feedback.includes(value))
  prompts.length=0;await assert.rejects(bridge(r,[bad],prompts),e=>e instanceof StructuredGenerationError&&e.kind==='invalid_schema');assert.equal(prompts.length,2);assert.equal(importAiResponseSchema(r).safeParse(bad).success,false)
  const valid=await bridge(r,[{conflicts:[conflict(rawSource)]}]);assert.deepEqual(valid.conflicts![0].source,rawSource,'correct raw source remains unchanged')
  assert.equal(importAiResponseSchema(r).safeParse({conflicts:[conflict({artifactIndex:0},{...rawSource,value:secret},'source-source')]}).success,false,'an existing candidate value is checked on the source-source side')
 })
 await t.test('strict reference shape, field proof and candidate side',async()=>{
  for(const source of [{artifactIndex:-1},{artifactIndex:2},{artifactIndex:0.5},{artifactIndex:'0'},{artifactIndex:0,value:secret},{artifactIndex:0,field:'backstory'},{artifactIndex:0,[secret]:undefined}])assert.equal(importAiResponseSchema(r).safeParse({conflicts:[conflict(source)]}).success,false)
  assert.equal(importAiResponseSchema(r).safeParse({conflicts:[conflict({artifactIndex:0},{artifactIndex:1})]}).success,false,'a proposal is not rebound to the current field')
  for(const field of ['notAField','entryMethod'])for(const source of [{artifactIndex:0},{...rawSource,value:''}])assert.equal(importAiResponseSchema(r).safeParse({conflicts:[conflict(source,undefined,'setting-body',field)]}).success,false,'unknown and unprovided fields cannot become empty values')
  const partial={...r,artifacts:r.artifacts.map(a=>({...a,text:''})),reviewProjection:r.reviewProjection!.map(({textRange:_range,...p})=>p)}
  for(const source of [{artifactIndex:0},{artifactId:'sv-a',text:'明确但未提供的全文',value:r.artifacts[0].text}]){const prompts:string[]=[];await assert.rejects(bridge(partial,[{conflicts:[conflict(source,undefined,'setting-body','text')]}],prompts),e=>e instanceof StructuredGenerationError&&e.kind==='invalid_schema');assert.equal(prompts.length,2)}
 })
 await t.test('complete overlapping text reconstructs exactly, gaps and inconsistent identity do not',async()=>{
  const a=r.artifacts[0],first={...a,text:a.text.slice(0,600),facts:{}},second={...a,text:a.text.slice(500),facts:{}},split={...r,artifacts:[first,second],reviewProjection:[createImportReviewProjection(a,first,{start:0,end:600}),createImportReviewProjection(a,second,{start:500,end:a.text.length})]};const actual=await bridge(split,[{conflicts:[conflict({artifactIndex:1},undefined,'setting-body','text')]}]);assert.equal(actual.conflicts![0].source.value,a.text)
  const gap={...split,artifacts:[first,{...second,text:a.text.slice(601)}],reviewProjection:[split.reviewProjection![0],{...split.reviewProjection![1],textRange:{start:601,end:a.text.length}}]};assert.equal(importAiResponseSchema(gap).safeParse({conflicts:[conflict({artifactIndex:0},undefined,'setting-body','text')]}).success,false)
  const mismatch={...split,artifacts:[first,{...second,schema:undefined}]};assertImportReviewProjection(mismatch.artifacts,mismatch.reviewProjection);assert.throws(()=>serializeImportAiPayload(mismatch),/投影|资料|版本|一致/)
  const overlap={...split,artifacts:[first,{...second,text:'错'+second.text.slice(1)}]};assertImportReviewProjection(overlap.artifacts,overlap.reviewProjection);assert.throws(()=>serializeImportAiPayload(overlap),/投影|资料|版本|一致/)
  const conflictingFacts={...r,artifacts:[a,{...a,facts:{...a.facts,backstory:secret}}],reviewProjection:[r.reviewProjection![0],r.reviewProjection![0]]};assertImportReviewProjection(conflictingFacts.artifacts,conflictingFacts.reviewProjection);assert.throws(()=>serializeImportAiPayload(conflictingFacts),/投影|资料|版本|一致/)
 })
})

test('SV03: metadata budgets, original protocol isolation and final authorization remain binding',async t=>{
 const r=request(),before=structuredClone(r),sent=JSON.parse(serializeImportAiPayload(r));for(const [index,a]of sent.artifacts.entries()){const {artifactIndex,bindableFields,...original}=a;assert.equal(artifactIndex,index);assert.deepEqual(original,r.artifacts[index]);assert.ok(bindableFields.includes('text')&&bindableFields.includes('backstory'))}assert.deepEqual(r,before);assertImportFixedPromptReserve(importAiPrompt(r),serializeImportAiPayload(r))
 await t.test('new source metadata counts in the complete payload budget',async()=>{const input=request(),budget=importRequestBudget(input,model),old=serializeImportAiPayload({...input,selectedTargets:['scene','world']});input.instruction+='x'.repeat(budget.characters*3-old.length-20);assertImportPayloadBudget(input,serializeImportAiPayload({...input,selectedTargets:['scene','world']}),budget.characters,budget.maxUnits);let calls=0;await assert.rejects(runImportAi(input,new AbortController().signal,{resolve:async()=>model,assert:async()=>{},generate:async()=>{calls++;return{conflicts:[]}}}),/预算/);assert.equal(calls,0)})
 await t.test('author conflict and other targets retain old raw source values and byte data',async()=>{const others:ImportAiRequest[]=[{...r,selectedTargets:['character']},{...r,conflict:conflict(rawSourceFor(r)) as any}];for(const other of others){const payload=serializeImportAiPayload(other);assert.ok(JSON.parse(payload).artifacts.every((a:Record<string,unknown>)=>!Object.hasOwn(a,'artifactIndex')));const raw={conflicts:[{...conflict({...rawSourceFor(r),value:secret}),evidence:[{unitId:'sv-unit',quote:body}]}]};assert.equal(importAiResponseSchema(other).safeParse(raw).success,true)}})
 await t.test('final authorization still rejects a decoded index',async()=>{let assertions=0,calls=0;const failure=new Error('synthetic final revoked');await assert.rejects(runImportAi(r,new AbortController().signal,{resolve:async()=>model,assert:async()=>{if(++assertions===2)throw failure},generate:async(input,_m,signal,prompt)=>generateImportAiJson(input,context,signal,prompt,{generateText:async()=>{calls++;return generated({conflicts:[conflict()]})}})}),e=>e===failure);assert.equal(calls,1)})
})
function rawSourceFor(r:ImportAiRequest){return{artifactId:r.artifacts[0].id,text:r.artifacts[0].facts.backstory,value:r.artifacts[0].facts.backstory}}
