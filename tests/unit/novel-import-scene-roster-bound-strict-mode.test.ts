import assert from 'node:assert/strict'
import {test} from 'node:test'
import {sceneRosterBoundNativeSchema} from '../../desktop/service/novel-import-scene-roster-bound-decisions'
import {bridgeBound,boundReplacement} from '../helpers/novel-import-bound-decisions-fixture'
import {bad,good,pub as fixtureModel} from '../helpers/novel-import-claim-patch-fixture'
test('SM04: actual bound native output uses the tested six-property advisory record with only three required arrays',()=>{const schema=sceneRosterBoundNativeSchema([{kind:'replacement',slot:0,canReject:false,boundCanReject:false}],3),items=(schema.properties!.answers as any).items;assert.equal(items.type,'object');assert.deepEqual(Object.keys(items.properties),['mentions','context','links','name','aliases','primaryMentionIndex']);assert.deepEqual(items.required,['mentions','context','links'])})
test('SM04b: activated keyed Native keeps the original strict true default and resolved model in the real SDK bridge',async()=>{const first={roster:[{...bad().roster[0],unknown:'SM_FORCE_REPLACEMENT'},good().roster[1]]},actual=await bridgeBound(first,({prompt,request})=>({answers:[boundReplacement(prompt,good().roster[0],request)]}));assert.equal(actual.options.length,2);assert.equal(actual.options[1].resolvedModel?.providerOptions?.openai?.strictJsonSchema??true,true);assert.equal(actual.options[0].resolvedModel,actual.options[1].resolvedModel);assert.equal(actual.options[0].resolvedModel?.model,actual.options[1].resolvedModel?.model);assert.equal(actual.options[0].resolvedModel?.modelRecord,actual.options[1].resolvedModel?.modelRecord)})

import Ajv from 'ajv'
import {createHash} from 'node:crypto'
import {MockLanguageModelV4} from 'ai/test'
import type {LanguageModelV4StreamPart} from '@ai-sdk/provider'
import {generateText,StructuredGenerationError,type GenerateUsage} from '../../src/lib/ai/generate'
import {generateImportAiJson,runImportAi,sceneRosterGenerationSchema} from '../../desktop/service/novel-import-ai'
import {request as defaultRequest} from '../helpers/novel-import-claim-patch-fixture'
import {localModelRecord} from '../../desktop/service/models'
import {LOCAL_AUTHOR_ID} from '../../desktop/service/context'
import {runInsideLongTask} from '../../src/lib/long-task'
import type {ResolvedModel} from '../../src/lib/ai/provider'
import type {ImportAiRequest} from '../../desktop/shared/novel-import'
type Spec={value?:unknown;raw?:string}
async function phaseBridge(reply:(prompt:string,index:number,r:ImportAiRequest)=>Spec,native=true){
 const r=defaultRequest(),before=structuredClone(r),options:Parameters<typeof generateText>[0][]=[],usageRows:unknown[]=[];let spec:Spec={}
 const model=new MockLanguageModelV4({doStream:async()=>{const parts:LanguageModelV4StreamPart[]=[{type:'stream-start',warnings:[]},{type:'text-start',id:'sm'},{type:'text-delta',id:'sm',delta:spec.raw??JSON.stringify(spec.value)},{type:'text-end',id:'sm'},{type:'finish',finishReason:{unified:'stop',raw:'stop'},usage:{inputTokens:{total:3,noCache:3,cacheRead:0,cacheWrite:0},outputTokens:{total:5,text:5,reasoning:0}}}];return{stream:new ReadableStream({start(controller){parts.forEach(part=>controller.enqueue(part));controller.close()}})}}})
 const resolved:ResolvedModel={model,modelRecord:localModelRecord(fixtureModel),providerOptions:{openai:{strictJsonSchema:true,store:false,reasoningEffort:'none'}}},providerBefore=structuredClone(resolved.providerOptions),usage:GenerateUsage={checkQuota:async()=>({tokenQuota:1e9,tokenUsed:0,remaining:1e9}),recordUsage:async row=>{usageRows.push(row);return 0}}
 let result:unknown,error:unknown
 try{result=await runInsideLongTask(()=>runImportAi(r,new AbortController().signal,{resolve:async()=>r.models.text!,assert:async()=>{},generate:async(input,_model,signal,prompt)=>generateImportAiJson(input,{userId:LOCAL_AUTHOR_ID,resolvedModel:resolved,structuredSceneRoster:native,usage,maxNetworkRetries:0},signal,prompt,{generateText:async current=>{options.push(current);spec=reply('prompt'in current?current.prompt:'',options.length,r);return generateText(current)}})}))}catch(value){error=value}
 assert.deepEqual(r,before);assert.deepEqual(resolved.providerOptions,providerBefore);for(const current of options){assert.equal(current.resolvedModel?.model,model);assert.equal(current.resolvedModel?.modelRecord,resolved.modelRecord)}return{result,error,options,model,resolved,usageRows}
}
const failed=()=>({roster:[{...bad().roster[0],unknown:'SM_TYPED_DRAFT'},good().roster[1]]})
const correct=(prompt:string,r:ImportAiRequest)=>({answers:[boundReplacement(prompt,good().roster[0],r)]})
const flags=(actual:Awaited<ReturnType<typeof phaseBridge>>)=>actual.options.map(value=>value.resolvedModel?.providerOptions?.openai?.strictJsonSchema)
test('SM04c: all trusted Native stages preserve strict true regardless of generation count or prompt contents',async()=>{
 const initial=await phaseBridge(()=>({value:good()}));assert.equal(initial.error,undefined);assert.deepEqual(flags(initial),[true]);assert.equal(initial.options[0].resolvedModel,initial.resolved)
 const unparsed=await phaseBridge((prompt,index,r)=>index===1?{raw:'{"roster":['}:index===2?{value:failed()}:{value:correct(prompt,r)});assert.equal(unparsed.error,undefined);assert.deepEqual(flags(unparsed),[true,true,true]);assert.deepEqual(unparsed.model.doStreamCalls.map(call=>call.responseFormat?.type==='json'?call.responseFormat.schema?.required:undefined),[['roster'],['roster'],['answers']])
 const root=await phaseBridge((_prompt,index)=>({value:index===1?{...good(),extra:true}:index===2?failed():good()}));assert.equal(root.error,undefined);assert.deepEqual(flags(root),[true,true,true]);for(const value of root.options)assert.equal(value.resolvedModel,root.resolved)
 const repeated=await phaseBridge((prompt,index,r)=>index===1?{value:failed()}:index===2?{raw:'{"answers":['}:index===3?{value:{answers:[{...boundReplacement(prompt,good().roster[0],r),name:'甲室'}]}}:{value:correct(prompt,r)});assert.equal(repeated.error,undefined);assert.deepEqual(flags(repeated),[true,true,true,true]);assert.equal(repeated.usageRows.length,4);assert.equal(repeated.options[1].resolvedModel,repeated.options[2].resolvedModel);assert.equal(repeated.options[2].resolvedModel,repeated.options[3].resolvedModel);assert.deepEqual(repeated.result,sceneRosterGenerationSchema(defaultRequest()).parse(good()))
 const plain=await phaseBridge((prompt,index,r)=>index===1?{value:failed()}:{value:correct(prompt,r)},false);assert.equal(plain.error,undefined);assert.deepEqual(flags(plain),[true,true]);for(const value of plain.options)assert.equal(value.resolvedModel,plain.resolved)
})

test('SM05: legacy advisory Native accepts partial and mixed metadata while the unchanged real business bridge rejects it',async t=>{
 for(const [label,metadata]of [['name only',{name:'甲室'}],['aliases only',{aliases:['阅览间']}],['mixed',{name:'甲室',aliases:['阅览间'],primaryMentionIndex:0}]] as const)await t.test(label,async()=>{
  let nativeChecks=0;const actual=await phaseBridge((prompt,index,r)=>{if(index===1)return{value:failed()};const value={answers:[{...boundReplacement(prompt,good().roster[0],r),...metadata}]},schema=sceneRosterBoundNativeSchema([{kind:'replacement',slot:0,canReject:false,boundCanReject:false}],JSON.parse(prompt.match(/<scene-roster-targeted-repair>(.*?)<\/scene-roster-targeted-repair>/su)![1]).choices.length);assert.equal(new Ajv({strict:false}).compile(schema)(value),true);nativeChecks++;return{value}})
  assert.ok(actual.error instanceof StructuredGenerationError);assert.equal(actual.error.kind,'invalid_schema');assert.equal(actual.result,undefined);assert.equal(actual.options.length,4);assert.equal(nativeChecks,3);assert.deepEqual(flags(actual),[true,true,true,true])
 })
 await t.test('unknown keys remain invalid in both Native and the real bridge',async()=>{let checked=0;const actual=await phaseBridge((prompt,index,r)=>{if(index===1)return{value:failed()};const value={answers:[{...boundReplacement(prompt,good().roster[0],r),unknown:'SM_PRIVATE_SENTINEL'}]},schema=sceneRosterBoundNativeSchema([{kind:'replacement',slot:0,canReject:false,boundCanReject:false}],JSON.parse(prompt.match(/<scene-roster-targeted-repair>(.*?)<\/scene-roster-targeted-repair>/su)![1]).choices.length);assert.equal(new Ajv({strict:false}).compile(schema)(value),false);checked++;return{value}});assert.ok(actual.error instanceof StructuredGenerationError);assert.equal(actual.options.length,4);assert.equal(checked,3);assert.ok(!JSON.stringify({message:actual.error.message,feedback:actual.error.feedback}).includes('SM_PRIVATE_SENTINEL'))})
})

test('SM04d: the product factory reproduces the exact successfully tested R60 five-task schema',()=>{const selection={kind:'selection' as const,slot:0,claimIndexes:[0],claims:[],options:[[[1]],[[2]]]},replace=(slot:number,canReject=false)=>({kind:'replacement' as const,slot,canReject,boundCanReject:canReject}),json=JSON.stringify(sceneRosterBoundNativeSchema([selection,replace(1),replace(2),replace(3),replace(4,true)],3));assert.equal(Buffer.byteLength(json),1953);assert.equal(createHash('sha256').update(json).digest('hex'),'a4714f84ef7da4ba3bb488e96dc32430c2c904ee08e2b1c78693b74244039646')})

test('SM04e: unrelated scene and character entity generation preserves the original strict model options',async()=>{
 for(const kind of ['scene','character'] as const){const r=defaultRequest();r.kind=kind;r.intent='entity';delete r.sceneIdentity;r.entityTarget={id:'sm-entity',aliases:[],...(kind==='character'?{roleType:'SUPPORTING' as const}:{})};r.entities=[{id:'sm-entity',kind,name:'合成实体',...(kind==='scene'?{entityType:'PLACE' as const}:{})}];const model={} as never,resolved:ResolvedModel={model,modelRecord:localModelRecord(fixtureModel),providerOptions:{openai:{strictJsonSchema:true,store:false}}},failure=new Error('SM_CONTROLLED_EXTERNAL_STOP');let seen:Parameters<typeof generateText>[0]|undefined
  await assert.rejects(generateImportAiJson(r,{userId:LOCAL_AUTHOR_ID,resolvedModel:resolved,maxNetworkRetries:0},new AbortController().signal,'synthetic entity prompt',{generateText:async options=>{seen=options;throw failure}}),error=>error===failure)
  assert.equal(seen?.resolvedModel,resolved);assert.equal(seen?.resolvedModel?.providerOptions?.openai?.strictJsonSchema,true)
 }
})
