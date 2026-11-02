import assert from 'node:assert/strict'
import {test} from 'node:test'
import {MockLanguageModelV4} from 'ai/test'
import type {JSONSchema7,LanguageModelV4StreamPart} from '@ai-sdk/provider'
import {z} from 'zod'
import {generateJSON,generateText,type GenerateUsage} from '../../src/lib/ai/generate'
import {generateImportAiJson,runImportAi,sceneRosterGenerationSchema,supportsStructuredSceneRoster,structuredSceneRosterModel,importGenerationModel} from '../../desktop/service/novel-import-ai'
import {createSceneRosterFragmentTable} from '../../desktop/core/novel-import-scene-roster-fragments'
import {explicitTargetedRosterReply} from '../helpers/novel-import-targeted-repair-fixture'
import {runInsideLongTask} from '../../src/lib/long-task'
import {localModelRecord,configureModelTransport} from '../../desktop/service/models'
import {ModelGateway} from '../../desktop/core/model-authorization'
import {ModelService} from '../../desktop/main/model-service'
import type {ModelRepository} from '../../desktop/main/model-repository'
import {JSON_OUTPUT_INSTRUCTION} from '../../src/lib/ai/json-output-instruction'
import {NovelImportController} from '../../desktop/main/novel-import'
import {serializeImportAiPayload,importAiPrompt,assertImportPayloadBudget} from '../../desktop/core/novel-import-ai-payload'
import {createImportBudgetPolicy,type ImportExecutionBudget} from '../../desktop/core/novel-import-budget-policy'
import {sceneRosterNativeSchema} from '../../desktop/core/novel-import-scene-roster-native'
import {LOCAL_AUTHOR_ID} from '../../desktop/service/context'
import type {PublicModel} from '../../desktop/core/settings'
import type {ImportAiRequest,ImportSession,ImportModel} from '../../desktop/shared/novel-import'
import type {ResolvedModel} from '../../src/lib/ai/provider'

const pub:PublicModel={id:'00000000-0000-4000-8000-000000000092',name:'合成清单模型',provider:'deepseek',protocol:'openai',endpoint:'https://api.deepseek.com',modelId:'deepseek-flash',kind:'TEXT',enabled:true,authRevision:1,contextWindow:1048576,keyMask:'synthetic',thinkingLevels:[],defaultThinking:'none'}
function request():ImportAiRequest{return{semanticVersion:1,operationId:'nr-op',phase:'analyze',intent:'roster',kind:'scene',sceneIdentity:{version:1,mode:'roster'},models:{text:pub,review:pub},units:['北宅。书房开门。南宅。书房开门。','红门，东室中留着铜钥匙。😀\r\n','西宅的乙室门已打开。'].map((text,i)=>({id:'nr-'+i,fileId:'synthetic-body',start:i*1000,end:i*1000+text.length,text,kind:'body'})),artifacts:[],workingRevision:0}}
function wire(){const r=request(),table=createSceneRosterFragmentTable(r.units);return{roster:[
 {mentions:[{literal:'书房',evidence:{unitIndex:0,fromFragment:0,toFragment:2}}],context:[{label:'北宅',evidence:[{unitIndex:0,fromFragment:0,toFragment:2}]}],links:[]},
 {mentions:[{literal:'红门，东室',evidence:{unitIndex:1,fromFragment:0,toFragment:2}}],context:[],links:[]},
 {mentions:[{literal:'乙室',evidence:{ref:table.units[2].fragments[0].ref}}],context:[{label:'西宅',evidence:[{ref:table.units[2].fragments[0].ref}]}],links:[]},
]}}
const resolved=(model:ResolvedModel['model'],pinned:PublicModel=pub):ResolvedModel=>({model,modelRecord:localModelRecord(pinned),providerOptions:{deepseek:{thinking:{type:'disabled'}},openai:{store:false}}})
async function sdkBridge(reply:(prompt:string,index:number)=>unknown,capacity=pub.contextWindow,usageFailure?:Error){
 const pinned={...pub,contextWindow:capacity},r=request();r.models={text:pinned,review:pinned}
 const before=structuredClone(r),prompts:string[]=[],usageRows:Parameters<GenerateUsage['recordUsage']>[0][]=[],usage:GenerateUsage={checkQuota:async()=>({tokenQuota:1e9,tokenUsed:0,remaining:1e9}),recordUsage:async row=>{usageRows.push(structuredClone(row));if(usageFailure)throw usageFailure;return .25}}
 let current=''
 const model=new MockLanguageModelV4({doStream:async()=>{
  const parts:LanguageModelV4StreamPart[]=[{type:'stream-start',warnings:[]},{type:'text-start',id:'nr-text'}]
  for(let at=0;at<current.length;at+=13)parts.push({type:'text-delta',id:'nr-text',delta:current.slice(at,at+13)})
  parts.push({type:'text-end',id:'nr-text'},{type:'finish',finishReason:{unified:'stop',raw:'stop'},usage:{inputTokens:{total:31,noCache:31,cacheRead:0,cacheWrite:0},outputTokens:{total:47,text:47,reasoning:0}}})
  return{stream:new ReadableStream({start(controller){for(const part of parts)controller.enqueue(part);controller.close()}})}
 }})
 const result=await runInsideLongTask(()=>runImportAi(r,new AbortController().signal,{resolve:async()=>pinned,assert:async()=>{},generate:async(input,_m,signal,prompt)=>generateImportAiJson(input,{userId:LOCAL_AUTHOR_ID,resolvedModel:resolved(model,pinned),usage,maxNetworkRetries:0,structuredSceneRoster:true},signal,prompt,{generateText:async options=>{const prompt='prompt'in options?options.prompt:'';prompts.push(prompt);current=JSON.stringify(reply(prompt,prompts.length));return generateText(options)}})}))
 assert.deepEqual(r,before);return{result,model,prompts,usageRows}
}
function native(call:{responseFormat?:{type:string;schema?:unknown}}){assert.equal(call.responseFormat?.type,'json','the real SDK receives a native JSON schema');return call.responseFormat!.schema as JSONSchema7}
function objectKeys(schema:unknown,optionalRecord=false):string[][]{const found:string[][]=[];const walk=(value:unknown)=>{if(!value||typeof value!=='object')return;if(Array.isArray(value)){value.forEach(walk);return}const row=value as Record<string,unknown>;if(row.type==='object'){assert.equal(row.additionalProperties,false);const keys=Object.keys(row.properties as object),hint=optionalRecord&&keys.length===6&&['mentions','context','links','name','aliases','primaryMentionIndex'].every(key=>keys.includes(key));assert.deepEqual(new Set(row.required as string[]),new Set(hint?['mentions','context','links']:keys));found.push(keys.sort())}Object.values(row).forEach(walk)};walk(schema);return found}

test('NR01: real SDK first schema preserves explicit spans needed for repeated fragments and a cross-fragment literal',async()=>{
 const value=wire(),actual=await sdkBridge(()=>value),schema=native(actual.model.doStreamCalls[0])
 assert.equal(schema.type,'object');assert.equal(schema.additionalProperties,false);assert.deepEqual(schema.required,['roster']);assert.deepEqual(actual.result,sceneRosterGenerationSchema(request()).parse(value));assert.equal(actual.model.doStreamCalls.length,1);assert.equal(actual.model.doStreamCalls[0].maxOutputTokens,undefined)
 const objects=objectKeys(schema);for(const fields of [['ref'],['quote','unitId'],['fromFragment','toFragment','unitIndex']])assert.ok(objects.some(keys=>JSON.stringify(keys)===JSON.stringify(fields)),'first native schema preserves '+fields.join('/'))
 assert.equal(actual.result.sceneRosterRecords![0].mentions[0].evidence.quote,'北宅。书房开门。');assert.equal(actual.result.sceneRosterRecords![1].mentions[0].literal,'红门，东室');assert.equal(actual.usageRows.length,1);assert.equal(actual.usageRows[0].promptTokens,31)
})
test('NR02: actual second SDK call prefers bound answers with full strict replacements while old typed replies preserve verified records',async()=>{
 const good=wire(),bad=structuredClone(good);Object.assign(bad.roster[2],{name:'乙室',aliases:[]});Object.assign(bad.roster[2].mentions[0],{evidence:{ref:'ef'+'0'.repeat(16)}})
 const actual=await sdkBridge((prompt,index)=>index===1?bad:explicitTargetedRosterReply(prompt,good,request().units)),first=native(actual.model.doStreamCalls[0]),second=native(actual.model.doStreamCalls[1])
 assert.deepEqual(first.required,['roster']);assert.deepEqual(second.required,['answers']);assert.equal(second.additionalProperties,false);assert.notDeepEqual(second,first);assert.equal(actual.model.doStreamCalls.length,2);assert.deepEqual(actual.result,sceneRosterGenerationSchema(request()).parse(good));assert.equal(actual.usageRows.length,2);for(const call of actual.model.doStreamCalls)assert.equal(call.maxOutputTokens,undefined)
 const objects=objectKeys(second);assert.ok(objects.some(keys=>JSON.stringify(keys)==='["choice"]'));for(const old of ['ref','quote','unitId','unitIndex','fromFragment','toFragment','choiceRef','repairRef','claimRef'])assert.ok(!objects.some(keys=>keys.includes(old)),'bound native schema cannot express '+old)
 const answers=second.properties!.answers as JSONSchema7;assert.equal(answers.type,'object');assert.equal(second.definitions,undefined);assert.equal(Object.hasOwn(second,'$defs'),false);assert.deepEqual(answers.required,['1'])
 const choiceCount=JSON.parse(actual.prompts[1].split('<scene-roster-targeted-repair>')[1].split('</scene-roster-targeted-repair>')[0]).choices.length
 const closed=(properties:Record<string,JSONSchema7>):JSONSchema7=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false}),list=(items:JSONSchema7,maxItems:number,minItems=0):JSONSchema7=>({type:'array',items,maxItems,minItems}),text:JSONSchema7={type:'string',minLength:1,pattern:'\\S',maxLength:300},integer:JSONSchema7={type:'integer',minimum:0,maximum:Number.MAX_SAFE_INTEGER},anchor=closed({choice:{type:'integer',minimum:1,maximum:choiceCount}}),common={mentions:list(closed({literal:text,evidence:anchor}),50000,1),context:list(closed({label:text,evidence:list(anchor,50000,1)}),50000),links:list(closed({targetIndex:integer,relation:{type:'string',enum:['same-place','different-place','parent']},evidence:list(anchor,50000,1)}),20000)}
 const records=[closed(common),closed({primaryMentionIndex:integer,...common}),closed({name:text,aliases:list(text,20),...common})]
 assert.deepEqual(answers,closed({'1':{anyOf:records}}),'the exact task key keeps all three original strict records and complete field limits')
 assert.equal(answers.additionalItems,undefined);assert.equal(Object.hasOwn(answers,'items'),false)
 const inline=(value:unknown):void=>{if(!value||typeof value!=='object')return;if(Array.isArray(value)){value.forEach(inline);return}const row=value as Record<string,unknown>;for(const key of ['$ref','definitions','$defs'])assert.equal(Object.hasOwn(row,key),false,'bound Native is completely inline');if(Object.hasOwn(row,'items'))assert.equal(Array.isArray(row.items),false,'bound Native never emits tuple items');Object.values(row).forEach(inline)};inline(second)

})
test('NR02: an unlocatable first root and a completed SDK usage failure never gain a stateless second generation',async()=>{
 let calls=0;await assert.rejects(sdkBridge(()=>{calls++;return[]}),/无法定位/u);assert.equal(calls,1)
 const failure=Object.assign(new Error('NR_ACTUAL_USAGE_FAILURE'),{code:'P2028'});calls=0;await assert.rejects(sdkBridge(()=>{calls++;return wire()},pub.contextWindow,failure),error=>error===failure);assert.equal(calls,1)
})
test('NR03: captured actual SDK prompts meet the v1 input boundary including exactly one wrapper and the phase schema',async t=>{
 const good=wire(),bad=structuredClone(good);Object.assign(bad.roster[2].mentions[0],{evidence:{ref:'ef'+'0'.repeat(16)}})
 for(const repaired of [false,true])await t.test(repaired?'repair actual prompt':'first actual prompt',async()=>{
  const reply=(prompt:string,index:number)=>!repaired||index>1?(index>1?explicitTargetedRosterReply(prompt,good,request().units):good):bad,baseline=await sdkBridge(reply),index=repaired?1:0,prompt=baseline.prompts[index],schema=native(baseline.model.doStreamCalls[index]),capacity=Buffer.byteLength(prompt+JSON.stringify(schema),'utf8')+6000
  const accepted=await sdkBridge(reply,capacity);assert.equal(accepted.model.doStreamCalls.length,repaired?2:1);assert.equal(accepted.prompts[index],prompt)
  let calls=0;await assert.rejects(sdkBridge((prompt,index)=>{calls++;return reply(prompt,index)},capacity-1),/预算/u);assert.equal(calls,repaired?1:0,'over-budget calls never reach the next real SDK generation')
 })
})
test('NR03: the original controller planner and service agree on actual first-schema overhead without losing any source units',async()=>{
 type Bare=Omit<ImportAiRequest,'models'|'operationId'>
 const controller=Object.create(NovelImportController.prototype) as {requestSnapshot(s:ImportSession,r:Bare):Bare;requestFits(r:Bare,b:ImportExecutionBudget,m?:ImportModel):boolean;stageRequests(s:ImportSession,units:ImportAiRequest['units'],b:ImportExecutionBudget,build:(units:ImportAiRequest['units'])=>Bare,full:boolean):Generator<Bare>},policy=createImportBudgetPolicy({text:pub,review:pub})!,budget:ImportExecutionBudget={version:2,...policy.text},units=request().units.slice(0,2),session={semanticVersion:1,artifacts:[],targets:['scene'],chapters:[],analysisGrant:{hash:'synthetic-grant',textModel:pub,reviewModel:pub},budgetPolicy:policy} as unknown as ImportSession,before=structuredClone(session)
 let padding=''
 const build=(batch:ImportAiRequest['units']):Bare=>({semanticVersion:1,phase:'analyze',intent:'roster',kind:'scene',sceneIdentity:{version:1,mode:'roster'},units:batch,artifacts:[],workingRevision:0,instruction:padding}),snapshot=(batch:ImportAiRequest['units'])=>controller.requestSnapshot(session,{...build(batch),executionBudget:budget}),schemaBytes=Buffer.byteLength(JSON.stringify(sceneRosterNativeSchema(request(),pub,'first')),'utf8'),base=serializeImportAiPayload(snapshot(units))
 padding='x'.repeat(budget.characters*3-schemaBytes-base.length)
 for(const extra of [0,1]){
  if(extra)padding+='x'
  const combined=snapshot(units),payload=serializeImportAiPayload(combined);assertImportPayloadBudget(combined,payload,budget.characters,budget.maxUnits);assert.equal(payload.length+schemaBytes,budget.characters*3+extra);assert.equal(controller.requestFits(combined,budget,pub),!extra)
  const packets=[...controller.stageRequests(session,units,budget,build,true)];assert.equal(packets.length,extra?2:1);assert.deepEqual(packets.flatMap(packet=>packet.units),units)
  let generations=0
  for(const packet of packets)await runImportAi({...packet,operationId:'nr-plan',models:{text:pub,review:pub}},new AbortController().signal,{resolve:async()=>pub,assert:async()=>{},generate:async(input,_m,signal,prompt)=>generateImportAiJson(input,{userId:LOCAL_AUTHOR_ID,resolvedModel:{} as ResolvedModel,structuredSceneRoster:true},signal,prompt,{generateText:async options=>{generations++;assert.ok(options.jsonOutputSchema);return{text:'{"roster":[]}',promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'}}})})
  assert.equal(generations,packets.length)
 }
 assert.deepEqual(session,before)
})
test('NR04: a trusted repair schema replaces only the second SDK responseFormat and never leaks its hook',async()=>{
 const first:JSONSchema7={type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false},second:JSONSchema7={type:'object',properties:{ok:{type:'boolean',const:true}},required:['ok'],additionalProperties:false},seen:Parameters<typeof generateText>[0][]=[]
 const repair=()=>({correction:'\nfixed-correction',jsonOutputSchema:second}),opts={userId:LOCAL_AUTHOR_ID,action:'nr-hook',prompt:'synthetic instruction',schema:z.strictObject({ok:z.literal(true)}),jsonOutputSchema:first,repair}
 const actual=await generateJSON(opts as unknown as Parameters<typeof generateJSON<{ok:true}>>[0],{generateText:async input=>{seen.push(input);assert.ok(!Object.hasOwn(input,'repair'));return{text:JSON.stringify({ok:seen.length===2}),promptTokens:1,completionTokens:2,cost:0,finishReason:'stop'}}})
 assert.deepEqual(actual.data,{ok:true});assert.deepEqual(seen[0].jsonOutputSchema,first);assert.deepEqual(seen[1].jsonOutputSchema,second);assert.equal(seen[1].maxOutputTokens,undefined);assert.ok('prompt'in seen[1]&&seen[1].prompt.endsWith('fixed-correction'))
})
test('NR04: generic and legacy string repairs retain byte-identical prompts and transport/usage failures never call repair',async t=>{
 const first:JSONSchema7={type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false}
 for(const useHook of [false,true])await t.test(useHook?'legacy string hook':'generic default correction',async()=>{
  const seen:Parameters<typeof generateText>[0][]=[],base='original synthetic prompt',custom='\nlegacy exact correction'
  await generateJSON({userId:LOCAL_AUTHOR_ID,action:'nr-generic',prompt:base,jsonOutputSchema:first,schema:z.strictObject({ok:z.literal(true)}),...(useHook?{repair:()=>custom}:{})},{generateText:async input=>{seen.push(input);assert.ok(!Object.hasOwn(input,'repair'));return{text:JSON.stringify({ok:seen.length===2}),promptTokens:1,completionTokens:1,cost:0,finishReason:'stop'}}})
  assert.equal(seen.length,2);for(const input of seen){assert.deepEqual(input.jsonOutputSchema,first);assert.equal(input.maxOutputTokens,undefined)}assert.ok('prompt'in seen[0]);assert.equal(seen[0].prompt,base+JSON_OUTPUT_INSTRUCTION);assert.ok('prompt'in seen[1]);if(useHook)assert.equal(seen[1].prompt,base+JSON_OUTPUT_INSTRUCTION+custom);else assert.ok(seen[1].prompt.startsWith(base+JSON_OUTPUT_INSTRUCTION+'\n\n上一次输出未通过结构校验'))
 })
 for(const label of ['transport','usage.record','abort'])await t.test(label,async()=>{let repairs=0,calls=0;const reason=Object.assign(new Error('NR-SYNTHETIC-'+label),{name:label==='abort'?'AbortError':'SyntheticFailure'});await assert.rejects(generateJSON({userId:LOCAL_AUTHOR_ID,action:'nr-failure',prompt:'synthetic',schema:z.object({ok:z.boolean()}),repair:()=>{repairs++;return'forbidden'}},{generateText:async()=>{calls++;throw reason}}),error=>error===reason);assert.equal(calls,1);assert.equal(repairs,0)})
})
function sse(value:unknown){const text=JSON.stringify(value),item={type:'message',id:'nr-message',status:'completed',role:'assistant',content:[{type:'output_text',text,annotations:[]}]},response={id:'nr-response',object:'response',created_at:0,status:'completed',model:pub.modelId,output:[item],usage:{input_tokens:1,output_tokens:1,total_tokens:2,input_tokens_details:{cached_tokens:0},output_tokens_details:{reasoning_tokens:0}}};return[{type:'response.created',response:{...response,status:'in_progress',output:[]}},{type:'response.output_item.added',output_index:0,item:{...item,status:'in_progress',content:[]}},{type:'response.content_part.added',item_id:item.id,output_index:0,content_index:0,part:{type:'output_text',text:'',annotations:[]}},{type:'response.output_text.delta',item_id:item.id,output_index:0,content_index:0,delta:text},{type:'response.output_text.done',item_id:item.id,output_index:0,content_index:0,text},{type:'response.output_item.done',output_index:0,item},{type:'response.completed',response}].map((value,sequence_number)=>'data: '+JSON.stringify({...value,sequence_number})+'\n\n').join('')}
test('NR04: the actual Responses SDK keeps gateway authorization, strict JSON and thinking-off with no output cap increase',async()=>{
 const r=request(),key='NR_SYNTHETIC_VAULT_KEY',bodies:Record<string,any>[]=[],gateway=new ModelGateway({keyFor:async()=>key,fetch:async(url,init)=>{assert.equal(new URL(String(url)).origin,'https://api.deepseek.com');assert.equal(new URL(String(url)).pathname,'/responses');assert.equal(new Headers(init?.headers).get('authorization'),'Bearer '+key);const body=JSON.parse(init!.body as string);bodies.push(body);assert.equal(body.model,pub.modelId);assert.equal(body.max_output_tokens,undefined);assert.equal(body.store,false);assert.equal(body.reasoning.effort,'none');assert.equal(body.text.format.type,'json_schema');assert.equal(body.text.format.strict,true);assert.deepEqual(body.text.format.schema.required,['roster']);return new Response(sse(wire()),{headers:{'content-type':'text/event-stream'}})}})
 gateway.replace(pub);const repository={read:async()=>({revision:1,models:[pub],settings:{agent:{textModelId:pub.id,reviewModelId:pub.id}}}),keyFor:async()=>key} as unknown as ModelRepository,main=new ModelService(repository,gateway)
 configureModelTransport(((method:string,value:any)=>{if(method==='model.start'){assert.ok(!JSON.stringify(value.headers).includes(key));return main.start(value)}if(method==='model.read')return main.read(value);if(method==='model.cancel')return main.cancel(value);throw Error('unexpected synthetic transport')}) as Parameters<typeof configureModelTransport>[0])
 const original=resolved(new MockLanguageModelV4()),before=structuredClone(original.providerOptions),light=importGenerationModel(r,original,pub),next=structuredSceneRosterModel(r,light,pub)
 try{
  assert.equal(supportsStructuredSceneRoster(r,pub),true);assert.equal(next.modelRecord,original.modelRecord);assert.deepEqual(original.providerOptions,before)
  for(const change of [{...r,phase:'review'},{...r,kind:'character'},{...r,intent:'entity'},{...r,sceneParentTargets:['target']},{...r,sceneIdentity:undefined}] as ImportAiRequest[])assert.equal(structuredSceneRosterModel(change,original,pub),original)
  for(const model of [{...pub,provider:'custom'},{...pub,protocol:'anthropic'},{...pub,endpoint:'https://api.deepseek.com/v1'},{...pub,endpoint:'https://api.deepseek.com?other=1'},{...pub,modelId:'unknown'}] as PublicModel[])assert.equal(structuredSceneRosterModel(r,original,model),original)
  assert.throws(()=>structuredSceneRosterModel(r,original,{...pub,authRevision:2}),/目标|目录|引用/)
  const usage:GenerateUsage={checkQuota:async()=>({tokenQuota:1e9,tokenUsed:0,remaining:1e9}),recordUsage:async()=>0}
  const result=await runInsideLongTask(()=>runImportAi(r,new AbortController().signal,{resolve:async()=>pub,assert:async()=>{},generate:async(input,_m,signal,prompt)=>generateImportAiJson(input,{userId:LOCAL_AUTHOR_ID,resolvedModel:next,usage,maxNetworkRetries:0,structuredSceneRoster:true},signal,prompt)}));assert.deepEqual(result,sceneRosterGenerationSchema(r).parse(wire()));assert.equal(bodies.length,1)
 }finally{await main.close();configureModelTransport(async()=>{throw Error('synthetic transport closed')})}
})
