import assert from 'node:assert/strict'
import {test} from 'node:test'
import {z} from 'zod'
import {MockLanguageModelV4} from 'ai/test'
import type {JSONSchema7,LanguageModelV4StreamPart} from '@ai-sdk/provider'
import {generateText,generateJSON,StructuredGenerationError,type GenerateUsage} from '../../src/lib/ai/generate'
import {runInsideLongTask} from '../../src/lib/long-task'
import {runInChatExecution} from '../../src/lib/chat-execution'
import {localModelRecord} from '../../desktop/service/models'
import {LOCAL_AUTHOR_ID} from '../../desktop/service/context'
import {createStructuredSceneContract,generateImportAiJson,runImportAi} from '../../desktop/service/novel-import-ai'
import type {PublicModel} from '../../desktop/core/settings'
import type {ImportAiRequest} from '../../desktop/shared/novel-import'
import type {ResolvedModel} from '../../src/lib/ai/provider'

const pub:PublicModel={id:'00000000-0000-4000-8000-000000000091',name:'合成分块模型',provider:'deepseek',protocol:'openai',endpoint:'https://api.deepseek.com',modelId:'deepseek-flash',kind:'TEXT',enabled:true,authRevision:1,contextWindow:1048576,keyMask:'synthetic',thinkingLevels:[],defaultThinking:'none'}
const nativeSchema:JSONSchema7={type:'object',properties:{marker:{type:'string'},text:{type:'string'}},required:['marker','text'],additionalProperties:false}
type Spec={text:string;finish?:'stop'|'length';textEnd?:boolean;delay?:number;halt?:{afterDeltas:number;reason:Error;abort?:()=>void}}
function chunks(specs:Spec[],size=11){let invoked=0;return new MockLanguageModelV4({doStream:async()=>{
 const spec=specs[Math.min(invoked++,specs.length-1)],parts:LanguageModelV4StreamPart[]=[{type:'stream-start',warnings:[]},{type:'text-start',id:'synthetic-text'}]
 for(let i=0;i<spec.text.length;i+=size)parts.push({type:'text-delta',id:'synthetic-text',delta:spec.text.slice(i,i+size)})
 if(spec.textEnd!==false)parts.push({type:'text-end',id:'synthetic-text'})
 parts.push({type:'finish',finishReason:{unified:spec.finish??'stop',raw:spec.finish==='length'?'max_output_tokens':'stop'},usage:{inputTokens:{total:111,noCache:111,cacheRead:0,cacheWrite:0},outputTokens:{total:222,text:222,reasoning:0}}})
 let at=0,emitted=0
 return{stream:new ReadableStream<LanguageModelV4StreamPart>({async pull(controller){
  if(spec.delay)await new Promise(resolve=>setTimeout(resolve,spec.delay))
  if(spec.halt&&emitted>=spec.halt.afterDeltas){spec.halt.abort?.();controller.error(spec.halt.reason);return}
  const part=parts[at++];if(!part){controller.close();return}if(part.type==='text-delta')emitted++;controller.enqueue(part)
 }})}
}})}
function usage(){let checks=0;const rows:Parameters<GenerateUsage['recordUsage']>[0][]=[];const callbacks:GenerateUsage={checkQuota:async()=>{checks++;return{tokenQuota:Number.MAX_SAFE_INTEGER,tokenUsed:0,remaining:Number.MAX_SAFE_INTEGER}},recordUsage:async row=>{rows.push(structuredClone(row));return 0.75}};return{callbacks,rows,get checks(){return checks}}}
const resolved=(model:ResolvedModel['model']):ResolvedModel=>({model,modelRecord:localModelRecord(pub),providerOptions:{openai:{store:false}}})
function options(model:ResolvedModel['model'],observed:ReturnType<typeof usage>){return{userId:LOCAL_AUTHOR_ID,action:'novel.import.analyze',prompt:'Synthetic structured output',resolvedModel:resolved(model),usage:observed.callbacks,maxNetworkRetries:0,maxOutputTokens:32768,jsonOutputSchema:nativeSchema}}
async function countPrefixParses<T>(full:string,marker:string,run:()=>Promise<T>){
 const original=JSON.parse;let incomplete=0,complete=0
 JSON.parse=function(...args:Parameters<typeof JSON.parse>){const text=args[0];if(typeof text==='string'&&text.includes(marker)){if(text===full)complete++;else if(full.startsWith(text))incomplete++}return Reflect.apply(original,JSON,args)}
 try{return{value:await run(),counts:()=>({incomplete,complete})}}finally{JSON.parse=original}
}

// Global JSON.parse is wrapped only inside each awaited, serial subtest. The
// wrapper delegates every parse unchanged and is restored before assertions.
test('SB01: native schema streams parse no incomplete JSON prefixes and preserve final text, tokens and one usage callback',async t=>{
 for(const textEnd of [true,false])await t.test(textEnd?'text-end flush':'finish-step without text-end flush',async()=>{
  const marker='SB01-COUNT-ONLY-'+(textEnd?'TEXT-END':'FINISH-STEP'),value={marker,text:'完整合成资料😀𠀀'.repeat(1200)},full=JSON.stringify(value),model=chunks([{text:full,textEnd}],7),observed=usage(),original=JSON.parse
  const result=await countPrefixParses(full,marker,()=>runInsideLongTask(()=>generateJSON({...options(model,observed),schema:z.strictObject({marker:z.literal(marker),text:z.string()})})))
  assert.equal(JSON.parse,original,'the counter always restores the real parser');assert.deepEqual(result.value.data,value);assert.equal(result.value.promptTokens,111);assert.equal(result.value.completionTokens,222);assert.equal(result.value.cost,0.75);assert.equal(result.value.finishReason,'stop')
  assert.equal(observed.checks,1);assert.equal(observed.rows.length,1);assert.equal(observed.rows[0].promptTokens,111);assert.equal(observed.rows[0].completionTokens,222);assert.equal(observed.rows[0].action,'novel.import.analyze');assert.equal(model.doStreamCalls.length,1)
  const call=model.doStreamCalls[0];assert.equal(call.responseFormat?.type,'json');assert.deepEqual(call.responseFormat?.type==='json'?call.responseFormat.schema:undefined,nativeSchema);assert.equal(call.maxOutputTokens,32768)
  const count=result.counts();t.diagnostic(JSON.stringify({deltaCount:Math.ceil(full.length/7),...count}));assert.equal(count.incomplete,0,'SDK must not repeatedly parse known incomplete prefixes when partial objects are unused');assert.ok(count.complete>=1&&count.complete<=2,'final real JSON/Zod parsing remains bounded and mandatory')
 })
})

test('SB02: final local parsing, schema validation and finish reason retain the original bounded correction',async t=>{
 const marker='SB02-COMPLETE-VALIDATION',good=JSON.stringify({marker,text:'完整合法资料'}),schema=z.strictObject({marker:z.literal(marker),text:z.string().min(1)})
 for(const [name,bad,kind,finish]of [
  ['invalid final JSON','{"marker":"'+marker+'","text":','invalid_json','stop'],
  ['invalid final schema',JSON.stringify({marker,text:42}),'invalid_schema','stop'],
  ['complete valid JSON but length finish',good,'incomplete','length']
 ] as const)await t.test(name,async()=>{
  const model=chunks([{text:bad,finish}],3),observed=usage()
  await assert.rejects(runInsideLongTask(()=>generateJSON({...options(model,observed),schema})),error=>error instanceof StructuredGenerationError&&error.kind===kind)
  assert.equal(model.doStreamCalls.length,2,'persistent final failures never gain a third generation');assert.equal(observed.checks,2);assert.equal(observed.rows.length,2,'completed provider attempts are still accounted even if local parsing rejects')
  for(const call of model.doStreamCalls){assert.equal(call.responseFormat?.type,'json');assert.equal(call.maxOutputTokens,32768)}
 })
 await t.test('one existing correction recovers and preserves both attempts usage',async()=>{
  const model=chunks([{text:JSON.stringify({marker,text:42})},{text:good}],4),observed=usage(),result=await runInsideLongTask(()=>generateJSON({...options(model,observed),schema}))
  assert.deepEqual(result.data,{marker,text:'完整合法资料'});assert.equal(model.doStreamCalls.length,2);assert.equal(observed.rows.length,2);assert.equal(result.promptTokens,222);assert.equal(result.completionTokens,444);assert.equal(result.cost,1.5)
 })
})

test('SB03: large Unicode scene fields and evidence reach canonical gates intact while ordinary text keeps previews',async t=>{
 await t.test('complete scene wire through actual production bridge',async()=>{
  const one='合成场景内有铜门，门边放着钥匙。',two='合成人物在合成场景等待，远方是合成城。',request:ImportAiRequest={semanticVersion:1,operationId:'sb03-scene',phase:'analyze',intent:'entity',kind:'scene',entityTarget:{id:'sb-scene',aliases:[],evidenceOptions:[{unitId:'sb-one',quote:one},{unitId:'sb-two',quote:two}]},entities:[{id:'sb-parent',kind:'scene',name:'合成城',entityType:'PLACE'},{id:'sb-scene',kind:'scene',name:'合成场景',entityType:'PLACE',parentId:'sb-parent'},{id:'sb-character',kind:'character',name:'合成人物'},{id:'sb-item',kind:'item',name:'钥匙'}],artifacts:[],units:[{id:'sb-one',fileId:'synthetic-source',start:0,end:one.length,text:one,kind:'body'},{id:'sb-two',fileId:'synthetic-source',start:one.length,end:one.length+two.length,text:two,kind:'body'}],workingRevision:0,models:{text:pub}}
  const value={text:'完整正文首😀'+ '有据场景正文𠀀'.repeat(1600)+'完整正文尾',facts:{coordinates:'完整方位😀',reliability:'人物推测',attribution:'合成人物有据推断𠀀',temporalScope:'当前片段\r\n保留原排版',exteriorDescription:'外观首'+ '外部资料😀'.repeat(500)+'外观尾',interiorDescription:'内观首'+ '内部资料𠀀'.repeat(500)+'内观尾',backstory:'背景首'+ '背景资料😀'.repeat(500)+'背景尾',entryMethod:'进入首'+ '进入资料𠀀'.repeat(500)+'进入尾'},references:{characterIndex:0,sceneIndex:0,itemIndex:0},primaryEvidence:{optionIndex:0},additionalEvidence:[{optionIndex:1}]},before=structuredClone(request),wireBefore=structuredClone(value),model=chunks([{text:JSON.stringify(value)}],113),observed=usage();let assertions=0
  const actual=await runInsideLongTask(()=>runImportAi(request,new AbortController().signal,{resolve:async()=>pub,assert:async()=>{assertions++},generate:async(r,_m,signal,prompt)=>generateImportAiJson(r,{userId:LOCAL_AUTHOR_ID,resolvedModel:resolved(model),usage:observed.callbacks,maxNetworkRetries:0,structuredScene:true},signal,prompt)}))
  assert.deepEqual(actual,createStructuredSceneContract(request).wireSchema.parse(value));assert.equal(actual.artifacts![0].text,value.text);for(const [field,text]of Object.entries(value.facts))assert.equal(actual.artifacts![0].facts[field],text);assert.deepEqual(actual.artifacts![0].evidence,request.entityTarget!.evidenceOptions);assert.equal(assertions,2);assert.equal(observed.rows.length,1);assert.equal(model.doStreamCalls.length,1);assert.equal(model.doStreamCalls[0].maxOutputTokens,32768);assert.deepEqual(request,before);assert.deepEqual(value,wireBefore)
 })
 await t.test('ordinary text mode preserves full chunks and final preview',async()=>{
  const text='首段😀\r\n中段𠀀\n完整尾段',wire=JSON.stringify({text}),model=chunks([{text:wire,delay:30}],5),observed=usage(),events:{storyDraft?:{text:string}}[]=[]
  const {jsonOutputSchema:_schema,maxOutputTokens:_cap,...base}=options(model,observed)
  const result=await runInsideLongTask(()=>runInChatExecution({userId:LOCAL_AUTHOR_ID,conversationId:'synthetic-conversation',turnId:'synthetic-turn',attemptId:'synthetic-attempt',epoch:1,progress:event=>events.push(event)},()=>generateText({...base,preview:true})))
  assert.equal(result.text,wire);assert.equal(result.finishReason,'stop');assert.equal(observed.rows.length,1);assert.ok(events.length>=3);assert.equal(events[0].storyDraft?.text,'');assert.equal(events.at(-1)?.storyDraft?.text,text);assert.ok(model.doStreamCalls[0].responseFormat?.type!=='json');assert.equal(model.doStreamCalls[0].maxOutputTokens,undefined)
 })
})

test('SB04: midstream cancellation and original transport errors never become successful usage or hidden retries',async t=>{
 for(const cancelled of [true,false])await t.test(cancelled?'midstream abort':'midstream transport failure',async()=>{
  const controller=new AbortController(),failure=Object.assign(new Error('SB04-SYNTHETIC-'+(cancelled?'ABORT':'TRANSPORT')),{name:cancelled?'AbortError':'SyntheticTransportError'}),model=chunks([{text:JSON.stringify({marker:'SB04-MIDSTREAM',text:'完整但未结束的合成流'.repeat(500)}),halt:{afterDeltas:5,reason:failure,...(cancelled?{abort:()=>controller.abort(failure)}:{})}}],7),observed=usage()
  await assert.rejects(runInsideLongTask(()=>generateJSON({...options(model,observed),abortSignal:controller.signal,schema:z.strictObject({marker:z.string(),text:z.string()})})),error=>error===failure)
  assert.equal(model.doStreamCalls.length,1);assert.equal(observed.checks,1);assert.equal(observed.rows.length,0,'partial or failed provider streams never receive a successful usage return')
 })
})
