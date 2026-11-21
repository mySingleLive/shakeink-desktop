import assert from 'node:assert/strict'
import {test} from 'node:test'
import {MockLanguageModelV4} from 'ai/test'
import type {JSONSchema7,LanguageModelV4StreamPart} from '@ai-sdk/provider'
import {createStructuredSceneContract,generateImportAiJson,runImportAi,readOnlyImportUsage,supportsStructuredScene} from '../../desktop/service/novel-import-ai'
import {serializeImportAiPayload,assertImportPayloadBudget,assertImportFixedPromptReserve} from '../../desktop/core/novel-import-ai-payload'
import {importRequestBudget} from '../../desktop/core/novel-import-budget-policy'
import {localModelRecord} from '../../desktop/service/models'
import {LOCAL_AUTHOR_ID} from '../../desktop/service/context'
import {StructuredGenerationError} from '../../src/lib/ai/generate'
import {runInsideLongTask} from '../../src/lib/long-task'
import type {PublicModel} from '../../desktop/core/settings'
import type {ImportAiRequest} from '../../desktop/shared/novel-import'
import type {ResolvedModel} from '../../src/lib/ai/provider'

const pub:PublicModel={id:'00000000-0000-4000-8000-000000000315',name:'合成场景说明模型',provider:'deepseek',protocol:'openai',endpoint:'https://api.deepseek.com',modelId:'deepseek-flash',kind:'TEXT',enabled:true,authRevision:1,contextWindow:1048576,keyMask:'synthetic',thinkingLevels:[],defaultThinking:'none'}
const texts=Array.from({length:8},(_,i)=>`合成场景第${i+1}处有不同地点事实；合成城、合成人物及合成钥匙均有记载。`)
const units=texts.map((text,i)=>({id:'spg-unit-'+i,fileId:'synthetic-source',start:texts.slice(0,i).join('').length,end:texts.slice(0,i+1).join('').length,text,kind:'body' as const}))
const request:ImportAiRequest={semanticVersion:1,operationId:'spg-synthetic',phase:'analyze',intent:'entity',kind:'scene',entityTarget:{id:'spg-scene',aliases:['合成小室'],evidenceOptions:units.map(u=>({unitId:u.id,quote:u.text}))},entities:[{id:'spg-parent',kind:'scene',name:'合成城',entityType:'PLACE'},{id:'spg-scene',kind:'scene',name:'合成场景',entityType:'PLACE',parentId:'spg-parent'},{id:'spg-character',kind:'character',name:'合成人物'},{id:'spg-item',kind:'item',name:'合成钥匙'}],artifacts:[],units,chapters:[{id:'spg-chapter',title:'合成章',start:0,end:units.at(-1)!.end}],workingRevision:0,instruction:'合成资料及作者确认内容完整保留。',models:{text:pub}}
const fields=['coordinates','reliability','attribution','temporalScope','exteriorDescription','interiorDescription','backstory','entryMethod'] as const
const large=(label:string)=>` \t${label}首😀\r\n`+'完整有据场景资料𠀀。\r\n'.repeat(2400)+`\r\n${label}尾  `
const wire={text:large('地点说明'),facts:{coordinates:'完整合成方位😀',reliability:'人物推测',attribution:'合成人物有据推测𠀀',temporalScope:'明确时间\r\n原排版',exteriorDescription:large('外部'),interiorDescription:large('内部'),backstory:large('历史'),entryMethod:large('进入')},references:{characterIndex:0,sceneIndex:0,itemIndex:0},primaryEvidence:{optionIndex:0},additionalEvidence:Array.from({length:7},(_,i)=>({optionIndex:i+1}))}
function description(schema:JSONSchema7){const text=schema.properties?.text;return text&&typeof text==='object'?text.description:undefined}
function grammar(schema:JSONSchema7){const copy=structuredClone(schema),text=copy.properties?.text;if(text&&typeof text==='object')delete text.description;return copy}
function guidance(value:unknown){
 assert.equal(typeof value,'string','text must carry a business description through the actual SDK schema')
 const text=value as string
 for(const word of ['当前目标','场景','资料说明','不同','有据','事实','关系','历史','时间','归属','应用','保存','无关','逐段'])assert.ok(text.includes(word),'grounded scene profile meaning includes '+word)
 assert.ok(/完整/u.test(text)&&/原文|正文/u.test(text))
}
function model(finishes:('stop'|'length')[],value:unknown=wire){let at=0;return new MockLanguageModelV4({doStream:async()=>{
 const finish=finishes[Math.min(at++,finishes.length-1)],text=JSON.stringify(value),parts:LanguageModelV4StreamPart[]=[{type:'stream-start',warnings:[]},{type:'text-start',id:'synthetic-profile'}]
 for(let i=0;i<text.length;i+=4096)parts.push({type:'text-delta',id:'synthetic-profile',delta:text.slice(i,i+4096)})
 parts.push({type:'text-end',id:'synthetic-profile'},{type:'finish',finishReason:{unified:finish,raw:finish==='length'?'max_output_tokens':'stop'},usage:{inputTokens:{total:7,noCache:7,cacheRead:0,cacheWrite:0},outputTokens:{total:11,text:11,reasoning:0}}})
 return{stream:new ReadableStream<LanguageModelV4StreamPart>({start(c){for(const part of parts)c.enqueue(part);c.close()}})}
 }})}
async function run(r:ImportAiRequest,m:MockLanguageModelV4,native=true){const pinned=r.models.text! as PublicModel,resolved={model:m,modelRecord:localModelRecord(pinned),providerOptions:{openai:{store:false}}} as ResolvedModel;return runInsideLongTask(()=>runImportAi(r,new AbortController().signal,{resolve:async role=>r.models[role]!,assert:async()=>{},generate:async(input,_model,signal,prompt)=>generateImportAiJson(input,{userId:LOCAL_AUTHOR_ID,resolvedModel:resolved,usage:readOnlyImportUsage,maxNetworkRetries:0,...(native?{structuredScene:true}:{})},signal,prompt)}))}
function expectedGrammar():JSONSchema7{
 const properties=Object.fromEntries(fields.map(field=>[field,{type:'string'}])),branch=(reliability:string[],attribution=false)=>({type:'object',properties:{...properties,reliability:{type:'string',enum:reliability},...(attribution?{attribution:{type:'string',pattern:'\\S'}}:{})},required:[...fields],additionalProperties:false}),option={type:'object',properties:{optionIndex:{type:'integer',minimum:0,maximum:7}},required:['optionIndex'],additionalProperties:false}
 return{type:'object',properties:{text:{type:'string',pattern:'\\S'},facts:{anyOf:[branch(['','客观事实']),branch(['角色有限事实','人物推测','可能不可靠'],true)]},references:{type:'object',properties:{characterIndex:{type:'integer',minimum:-1,maximum:0},sceneIndex:{type:'integer',minimum:-1,maximum:1},itemIndex:{type:'integer',minimum:-1,maximum:0}},required:['characterIndex','sceneIndex','itemIndex'],additionalProperties:false},primaryEvidence:option,additionalEvidence:{type:'array',items:option}},required:['text','facts','references','primaryEvidence','additionalEvidence'],additionalProperties:false} as JSONSchema7
}

test('SPG01/SPG03: real SDK receives scene-profile meaning and retains every large Unicode field and all eight citations',async()=>{
 const before=structuredClone(request),wireBefore=structuredClone(wire),m=model(['stop']),result=await run(request,m);assert.equal(m.doStreamCalls.length,1)
 const call=m.doStreamCalls[0];assert.equal(call.responseFormat?.type,'json');const schema=call.responseFormat?.type==='json'?call.responseFormat.schema as JSONSchema7:undefined;assert.ok(schema);const meaning=description(schema);guidance(meaning)
 assert.ok(JSON.stringify(call.prompt).includes(meaning!),'business meaning reaches the actual SDK prompt as well as responseFormat.schema')
 assert.equal(call.maxOutputTokens,32768);assert.deepEqual(result,createStructuredSceneContract(request).wireSchema.parse(wire));const artifact=result.artifacts![0]
 assert.ok(wire.text.length>27529);assert.equal(artifact.text,wire.text);for(const [field,value]of Object.entries(wire.facts)){assert.equal(artifact.facts[field],value);if(['exteriorDescription','interiorDescription','backstory','entryMethod'].includes(field))assert.ok(value.length>27529)}
 assert.deepEqual(artifact.evidence,request.entityTarget!.evidenceOptions);assert.deepEqual(artifact.sourceUnitIds,units.map(u=>u.id));assert.deepEqual(request,before);assert.deepEqual(wire,wireBefore)
 // Predetermined mock output proves transport and preservation, not a provider
 // obeying the wording or measured real token capacity.
})

test('SPG02: only the text description differs; complete payload, grammar and all indexed evidence stay unchanged',()=>{
 const before=structuredClone(request),c=createStructuredSceneContract(request),expected=JSON.parse(serializeImportAiPayload(request));expected.entities=request.entities!.map((entry,i)=>({...entry,referenceIndex:i===1?1:0}))
 assert.equal(c.payload,JSON.stringify(expected));assert.deepEqual(grammar(c.jsonSchema),expectedGrammar());assert.deepEqual(JSON.parse(c.payload).units,request.units);assert.deepEqual(JSON.parse(c.payload).entityTarget.evidenceOptions,request.entityTarget!.evidenceOptions!.map((entry,optionIndex)=>({...entry,optionIndex})));assert.deepEqual(request,before)
})

test('SPG04: complete JSON with length finish retains the same two-generation correction and refusal',async t=>{
 for(const permanent of [false,true])await t.test(permanent?'persistent length refuses':'length then stop restores',async()=>{
  const m=model(permanent?['length']:['length','stop'])
  if(permanent)await assert.rejects(run(request,m),e=>e instanceof StructuredGenerationError&&e.kind==='incomplete')
  else assert.deepEqual(await run(request,m),createStructuredSceneContract(request).wireSchema.parse(wire))
  assert.equal(m.doStreamCalls.length,2);for(const call of m.doStreamCalls){assert.equal(call.responseFormat?.type,'json');assert.equal(call.maxOutputTokens,32768);assert.deepEqual(call.responseFormat?.type==='json'?call.responseFormat.schema:undefined,createStructuredSceneContract(request).jsonSchema)}
 })
})

test('SPG05: annotation bytes use original guards and ordinary review keeps the existing text path',async t=>{
 await t.test('the annotation alone can exceed the complete original schema/payload budget',async()=>{
  const r=structuredClone(request),initial=createStructuredSceneContract(r);guidance(description(initial.jsonSchema));const budget=importRequestBudget(r,pub),oldSchema=JSON.stringify(grammar(initial.jsonSchema));r.instruction+='x'.repeat(budget.characters*3-initial.payload.length-oldSchema.length-1)
  const c=createStructuredSceneContract(r);assertImportPayloadBudget(r,c.payload+JSON.stringify(grammar(c.jsonSchema)),budget.characters,budget.maxUnits);assertImportFixedPromptReserve(c.prompt+JSON.stringify(c.jsonSchema),c.payload);let calls=0
  await assert.rejects(generateImportAiJson(r,{userId:LOCAL_AUTHOR_ID,resolvedModel:{} as ResolvedModel,structuredScene:true},new AbortController().signal,'unused',{generateText:async()=>{calls++;throw Error('must fail before generation')}}),/预算/u);assert.equal(calls,0)
 })
 await t.test('ordinary review is not given the native profile contract or output cap',async()=>{
  const r:ImportAiRequest={...structuredClone(request),phase:'review',intent:undefined,entityTarget:undefined,models:{text:pub,review:pub}},m=model(['stop'],{conflicts:[]});assert.equal(supportsStructuredScene(r,pub),false);assert.equal(supportsStructuredScene(request,{...pub,provider:'custom'}),false);const result=await run(r,m,false);assert.deepEqual(result,{conflicts:[]});assert.equal(m.doStreamCalls.length,1);assert.ok(m.doStreamCalls[0].responseFormat?.type!=='json');assert.equal(m.doStreamCalls[0].maxOutputTokens,undefined);assert.ok(!JSON.stringify(m.doStreamCalls[0].prompt).includes(String(description(createStructuredSceneContract(request).jsonSchema))),'ordinary SDK prompt cannot receive the complete native scene profile guidance')
 })
})
