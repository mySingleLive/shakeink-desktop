import assert from'node:assert/strict'
import{test}from'node:test'
import type{JSONSchema7}from'@ai-sdk/provider'
import{assertSceneRosterKeyedInlineBudget,assertSceneRosterNativeBudget,SCENE_ROSTER_KEYED_SCHEMA_MAX_BYTES}from'../../desktop/core/novel-import-scene-roster-native'
import{serializeImportAiPayload,assertImportPayloadBudget,assertImportFixedPromptReserve,IMPORT_JSON_WRAPPER_RESERVE_BYTES}from'../../desktop/core/novel-import-ai-payload'
import{importBudgetProfile}from'../../desktop/core/novel-import-budget-policy'
import{JSON_OUTPUT_INSTRUCTION}from'../../src/lib/ai/json-output-instruction'
import{request as fixtureRequest}from'../helpers/novel-import-claim-patch-fixture'
const bytes=(value:string)=>Buffer.byteLength(value,'utf8')
const shaped=(n:number):JSONSchema7=>{const schema={type:'object' as const,description:'界😀'},room=n-bytes(JSON.stringify(schema));assert.ok(room>=0);schema.description+='x'.repeat(room);assert.equal(bytes(JSON.stringify(schema)),n);return schema}
const setup=()=>{const r=fixtureRequest(),model=r.models.text!,budget={version:2 as const,...importBudgetProfile(model.contextWindow,2)},payload=serializeImportAiPayload(r),prompt=payload+JSON_OUTPUT_INSTRUCTION;return{r,model,budget,payload,prompt}}
test('IB01: schema has its own exact UTF8 65536-byte boundary while complete prompt keeps the original reserve',()=>{const{r,model,budget,payload,prompt}=setup();assert.equal(SCENE_ROSTER_KEYED_SCHEMA_MAX_BYTES,65536);for(const n of[65535,65536,65537]){const schema=shaped(n);if(n<=65536)assert.doesNotThrow(()=>assertSceneRosterKeyedInlineBudget(r,model,budget,payload,prompt,schema));else assert.throws(()=>assertSceneRosterKeyedInlineBudget(r,model,budget,payload,prompt,schema),/结构超过/)}const schema=shaped(200),room=65536-IMPORT_JSON_WRAPPER_RESERVE_BYTES-bytes(prompt)+bytes(payload);for(const plus of[-1,0,1]){const actual=prompt+'x'.repeat(room+plus);assert.equal(bytes(actual)-bytes(payload)+16384,65536+plus);if(plus<=0)assert.doesNotThrow(()=>assertSceneRosterKeyedInlineBudget(r,model,budget,payload,actual,schema));else assert.throws(()=>assertSceneRosterKeyedInlineBudget(r,model,budget,payload,actual,schema),/预算预留/)}})
test('IB02: source character/unit/envelope gates stay finite and combined allowance is explicitly larger',()=>{const{r,model,budget}=setup(),schema=shaped(65536);const payloadRoom=budget.characters*3;for(const plus of[0,1]){const candidate=structuredClone(r);candidate.instruction='x'.repeat(payloadRoom);let payload=serializeImportAiPayload(candidate);candidate.instruction='x'.repeat(candidate.instruction.length-(payload.length-payloadRoom-plus));payload=serializeImportAiPayload(candidate);assert.equal(payload.length,payloadRoom+plus);const actual=payload+JSON_OUTPUT_INSTRUCTION;if(!plus){assertImportPayloadBudget(candidate,payload,budget.characters,budget.maxUnits);assert.throws(()=>assertSceneRosterNativeBudget(candidate,model,budget,payload,actual,'repair',schema),/预算/);assert.doesNotThrow(()=>assertSceneRosterKeyedInlineBudget(candidate,model,budget,payload,actual,schema))}else assert.throws(()=>assertSceneRosterKeyedInlineBudget(candidate,model,budget,payload,actual,schema),/预算/)}for(const kind of['chars','units']){const candidate=structuredClone(r);candidate.units=kind==='chars'?[{...r.units[0],text:'x'.repeat(budget.characters+1),end:budget.characters+1}]:Array.from({length:budget.maxUnits+1},(_,i)=>({id:'u'+i,fileId:'f',kind:'body' as const,start:i,end:i+1,text:'x'}));assert.throws(()=>assertSceneRosterKeyedInlineBudget(candidate,model,budget,'{}','{}',shaped(200)),/预算/)}})
test('IB03: complete prompt plus schema plus6000 is checked for both budget versions and unknown16K fallback',()=>{const{r,model,payload,prompt}=setup(),schema=shaped(2000),actual=prompt+'x'.repeat(2000),required=bytes(actual)+bytes(JSON.stringify(schema))+6000;for(const version of[1,2]as const)for(const delta of[0,-1]){const pinned={...model,contextWindow:required+delta},budget={version,...importBudgetProfile(model.contextWindow,version)};if(!delta)assert.doesNotThrow(()=>assertSceneRosterKeyedInlineBudget(r,pinned,budget,payload,actual,schema));else assert.throws(()=>assertSceneRosterKeyedInlineBudget(r,pinned,budget,payload,actual,schema),/容量预算/)}for(const capacity of[0,undefined])for(const version of[1,2]as const)for(const plus of[0,1]){const pinned={...model,contextWindow:capacity},budget={version,...importBudgetProfile(model.contextWindow,version)},padding=16000-6000-bytes(prompt)-bytes(JSON.stringify(schema));assert.ok(padding>0);const actual=prompt+'x'.repeat(padding+plus);if(!plus)assert.doesNotThrow(()=>assertSceneRosterKeyedInlineBudget(r,pinned,budget,payload,actual,schema));else assert.throws(()=>assertSceneRosterKeyedInlineBudget(r,pinned,budget,payload,actual,schema),/容量预算/)}})
test('IB04: arbitrary schema text or wrong request/model never grants the keyed-specific allowance',()=>{const{r,model,budget,payload,prompt}=setup(),schema=shaped(4000);for(const patch of[{sceneIdentity:undefined},{intent:'entity'},{kind:'character'},{semanticVersion:undefined}])assert.throws(()=>assertSceneRosterKeyedInlineBudget({...r,...patch}as typeof r,model,budget,payload,prompt,schema),/不支持/);assert.throws(()=>assertSceneRosterKeyedInlineBudget(r,{...model,provider:'other'},budget,payload,prompt,schema),/不支持/);assertImportFixedPromptReserve(prompt,payload)})

import {MockLanguageModelV4} from 'ai/test'
import type {LanguageModelV4StreamPart} from '@ai-sdk/provider'
import {generateImportAiJson,runImportAi,sceneRosterGenerationSchema} from '../../desktop/service/novel-import-ai'
import {generateText,type GenerateUsage} from '../../src/lib/ai/generate'
import {localModelRecord} from '../../desktop/service/models'
import {LOCAL_AUTHOR_ID} from '../../desktop/service/context'
import {runInsideLongTask} from '../../src/lib/long-task'
import {bad,good,patchReply,planOf,pub as fixturePub} from '../helpers/novel-import-claim-patch-fixture'
import {boundReply} from '../helpers/novel-import-bound-decisions-fixture'
import type {ResolvedModel} from '../../src/lib/ai/provider'
import type {PublicModel} from '../../desktop/core/settings'
type Role='text'|'review'
type ActualOptions=Parameters<typeof generateText>[0]
async function actualRoleBridge(role:Role,target:number,capacity:number,options:ActualOptions[]){
 const r=fixtureRequest();r.models={text:{...r.models.text!,id:'00000000-0000-4000-8000-000000000096'},review:{...r.models.review!,id:'00000000-0000-4000-8000-000000000097'}};r.models[role]!.contextWindow=capacity
 const selected=r.models[role]!;assert.ok(selected.protocol==='openai'||selected.protocol==='anthropic')
 const before=structuredClone(r),pinned:PublicModel={...fixturePub,...selected,protocol:selected.protocol,kind:fixturePub.kind},failed:unknown[]=[],usageRows:unknown[]=[];let output:unknown
 const model=new MockLanguageModelV4({doStream:async()=>{const parts:LanguageModelV4StreamPart[]=[{type:'stream-start',warnings:[]},{type:'text-start',id:'ib-role'},{type:'text-delta',id:'ib-role',delta:JSON.stringify(output)},{type:'text-end',id:'ib-role'},{type:'finish',finishReason:{unified:'stop',raw:'stop'},usage:{inputTokens:{total:3,noCache:3,cacheRead:0,cacheWrite:0},outputTokens:{total:5,text:5,reasoning:0}}}];return{stream:new ReadableStream({start(controller){parts.forEach(part=>controller.enqueue(part));controller.close()}})}}})
 const resolved:ResolvedModel={model,modelRecord:localModelRecord(pinned),providerOptions:{openai:{store:false,strictJsonSchema:true}}},usage:GenerateUsage={checkQuota:async()=>({tokenQuota:1e9,tokenUsed:0,remaining:1e9}),recordUsage:async value=>{usageRows.push(value);return 0}}
 let result:Awaited<ReturnType<typeof runImportAi>>
 try{result=await runInsideLongTask(()=>runImportAi(r,new AbortController().signal,{resolve:async selected=>r.models[selected]!,assert:async()=>{},generate:async(input,_model,signal,prompt)=>generateImportAiJson(input,{userId:LOCAL_AUTHOR_ID,role,resolvedModel:resolved,structuredSceneRoster:true,usage,maxNetworkRetries:0},signal,prompt,{generateText:async current=>{
  options.push(current)
  if(options.length===1)output=bad()
  else{assert.ok('prompt'in current);const p=current.prompt,legacy=boundReply(p,patchReply(planOf(p),r),r),answer={answers:Object.fromEntries(legacy.answers.map((value:unknown,index:number)=>[String(index+1),value]))};if(options.length<target){output={...answer,IB_UNTRUSTED_CURRENT_PADDING:'x'.repeat(options.length*4096)};failed.push(structuredClone(output))}else output=answer}
  return generateText(current)
 }})},{role}))}finally{assert.deepEqual(r,before)}
 return{result,model,failed,usageRows,capacity:pinned.contextWindow,request:r}
}
const actualPrompt=(options:ActualOptions)=>{assert.ok('prompt'in options);assert.ok(options.jsonOutputSchema);return options.prompt}
const completeRequired=(options:ActualOptions)=>bytes(actualPrompt(options))+bytes(JSON.stringify(options.jsonOutputSchema))+6000
test('IB05: actual SDK generations two through four use the selected role complete prompt/schema context before another call',async t=>{
 for(const role of ['text','review']as const)for(const target of[2,3,4])await t.test(role+' generation '+target,async()=>{
  const baseline:ActualOptions[]=[],run=await actualRoleBridge(role,target,1048576,baseline),last=baseline[target-1],required=completeRequired(last)
  assert.equal(baseline.length,target);assert.equal(run.model.doStreamCalls.length,target);assert.deepEqual(run.result,sceneRosterGenerationSchema(fixtureRequest()).parse(good()))
  for(const prior of baseline.slice(0,-1))assert.ok(completeRequired(prior)<required,'the selected generation is the binding context boundary')
  const prompt=actualPrompt(last),frames=[...prompt.matchAll(/<previous-scene-roster-output>(.*?)<\/previous-scene-roster-output>/gsu)].map(match=>JSON.parse(match[1]))
  assert.ok(frames.some(frame=>frame.format==='json'&&JSON.stringify(frame.value)===JSON.stringify(bad())),'complete original draft stays present')
  if(target>2)assert.ok(frames.some(frame=>frame.format==='json'&&JSON.stringify(frame.value)===JSON.stringify(run.failed.at(-1))),'complete current failed reply stays present')
  const exact:ActualOptions[]=[],accepted=await actualRoleBridge(role,target,required,exact)
  assert.equal(exact.length,target);assert.equal(accepted.model.doStreamCalls.length,target);assert.equal(accepted.usageRows.length,target);assert.equal(completeRequired(exact[target-1]),accepted.capacity);assert.equal(actualPrompt(exact[target-1]),prompt);assert.deepEqual(exact[target-1].jsonOutputSchema,last.jsonOutputSchema)
  const tooSmall:ActualOptions[]=[];await assert.rejects(actualRoleBridge(role,target,required-1,tooSmall),/预算/u);assert.equal(tooSmall.length,target-1,'primary claims are already the smaller representation; one byte short blocks the next actual SDK invocation')
 })
})
