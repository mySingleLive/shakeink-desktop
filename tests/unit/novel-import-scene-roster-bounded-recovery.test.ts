import assert from 'node:assert/strict'
import {test} from 'node:test'
import {z} from 'zod'
import {MockLanguageModelV4} from 'ai/test'
import type {LanguageModelV4StreamPart} from '@ai-sdk/provider'
import {generateJSON,generateText,StructuredGenerationError,type GenerateUsage} from '../../src/lib/ai/generate'
import {runImportAi,generateImportAiJson,sceneRosterGenerationSchema} from '../../desktop/service/novel-import-ai'
import {localModelRecord} from '../../desktop/service/models'
import {LOCAL_AUTHOR_ID} from '../../desktop/service/context'
import {runInsideLongTask} from '../../src/lib/long-task'
import {explicitTargetedRosterReply} from '../helpers/novel-import-targeted-repair-fixture'
import type {ImportAiRequest} from '../../desktop/shared/novel-import'
import type {PublicModel} from '../../desktop/core/settings'
import type {ResolvedModel} from '../../src/lib/ai/provider'
import {serializeImportAiPayload,IMPORT_JSON_WRAPPER_RESERVE_BYTES} from '../../desktop/core/novel-import-ai-payload'

const pub:PublicModel={id:'00000000-0000-4000-8000-000000000093',name:'合成有限恢复模型',provider:'deepseek',protocol:'openai',endpoint:'https://api.deepseek.com',modelId:'deepseek-flash',kind:'TEXT',enabled:true,authRevision:1,contextWindow:1048576,keyMask:'synthetic',thinkingLevels:[],defaultThinking:'none'}
const a='东宅的甲室门打开。',alias='又称阅览间。',b='西宅的乙室门已关闭。',malformed='{"roster":[{"mentions":[{"literal":"甲室"}]}',secret='BR_UNTRUSTED_BROKEN_TEXT'
function request():ImportAiRequest{return{semanticVersion:1,operationId:'br-operation',phase:'analyze',intent:'roster',kind:'scene',sceneIdentity:{version:1,mode:'roster'},models:{text:pub,review:pub},units:[a+'\r\n'+alias,b].map((text,i)=>({id:'br-'+i,fileId:'synthetic-body',start:i*1000,end:i*1000+text.length,text,kind:'body'})),artifacts:[],workingRevision:0}}
const anchor=(unit:number,quote:string)=>({unitId:'br-'+unit,quote})
function good(){return{roster:[{mentions:[{literal:'甲室',evidence:anchor(0,request().units[0].text)},{literal:'阅览间',evidence:anchor(0,alias)}],context:[{label:'东宅',evidence:[anchor(0,a)]}],links:[{targetIndex:1,relation:'different-place',evidence:[anchor(0,a),anchor(1,b)]}]},{mentions:[{literal:'乙室',evidence:anchor(1,b)}],context:[],links:[]}]}}
function bad(){const value=good();value.roster[0].mentions[1].evidence.quote='BR_BAD_QUOTE';return value}
function plan(prompt:string){const open='<scene-roster-targeted-repair>',start=prompt.lastIndexOf(open);assert.ok(start>=0);return JSON.parse(prompt.slice(start+open.length,prompt.indexOf('</scene-roster-targeted-repair>',start)))}
const dataFrames=(prompt:string)=>[...prompt.matchAll(/<previous-scene-roster-output>(.*?)<\/previous-scene-roster-output>/gsu)].map(match=>JSON.parse(match[1]))
type Spec={raw?:string;value?:unknown;finish?:'stop'|'length'|'content-filter'}
async function bridge(reply:(prompt:string,index:number)=>Spec,config:{capacity?:number;failure?:Error;quotaAt?:number;usageAt?:number;transportAt?:number;abortAt?:number;finalAuth?:boolean}={}){
 const pinned={...pub,contextWindow:config.capacity??pub.contextWindow},r=request();r.models={text:pinned,review:pinned}
 const before=structuredClone(r),options:Parameters<typeof generateText>[0][]=[],rows:Parameters<GenerateUsage['recordUsage']>[0][]=[],controller=new AbortController();let current:Spec={},checks=0,assertions=0
 const model=new MockLanguageModelV4({doStream:async()=>{
  if(config.transportAt===options.length)throw config.failure
  const text=current.raw??JSON.stringify(current.value),parts:LanguageModelV4StreamPart[]=[{type:'stream-start',warnings:[]},{type:'text-start',id:'br-stream'}]
  for(let at=0;at<text.length;at+=11)parts.push({type:'text-delta',id:'br-stream',delta:text.slice(at,at+11)})
  parts.push({type:'text-end',id:'br-stream'},{type:'finish',finishReason:{unified:current.finish??'stop',raw:current.finish??'stop'},usage:{inputTokens:{total:11,noCache:11,cacheRead:0,cacheWrite:0},outputTokens:{total:22,text:22,reasoning:0}}})
  return{stream:new ReadableStream({start(controller){for(const part of parts)controller.enqueue(part);controller.close()}})}
 }})
 const usage:GenerateUsage={checkQuota:async()=>{checks++;if(checks===config.quotaAt)throw config.failure;return{tokenQuota:1e9,tokenUsed:0,remaining:1e9}},recordUsage:async row=>{rows.push(structuredClone(row));if(rows.length===config.usageAt)throw config.failure;return .25}},resolved:ResolvedModel={model,modelRecord:localModelRecord(pinned),providerOptions:{openai:{store:false}}}
 let result:unknown,error:unknown
 try{result=await runInsideLongTask(()=>runImportAi(r,controller.signal,{resolve:async()=>pinned,assert:async()=>{assertions++;if(config.finalAuth&&assertions===2)throw config.failure},generate:async(input,_m,signal,prompt)=>generateImportAiJson(input,{userId:LOCAL_AUTHOR_ID,resolvedModel:resolved,structuredSceneRoster:true,usage,maxNetworkRetries:0},signal,prompt,{generateText:async value=>{assert.ok(!Object.hasOwn(value,'maxGenerations'));options.push(value);current=reply('prompt'in value?value.prompt:'',options.length);if(config.abortAt===options.length)controller.abort(config.failure);return generateText(value)}})}))}catch(value){error=value}
 assert.deepEqual(r,before);return{result,error,options,model,rows,checks,assertions}
}

test('BR01: a stop-ended malformed first response can be fully reidentified on the same first native schema',async()=>{
 const actual=await bridge((_prompt,index)=>index===1?{raw:malformed+secret}:{value:good()});assert.equal(actual.error,undefined);assert.deepEqual(actual.result,sceneRosterGenerationSchema(request()).parse(good()));assert.equal(actual.model.doStreamCalls.length,2);assert.equal(actual.checks,2);assert.equal(actual.rows.length,2);assert.equal(actual.assertions,2);assert.deepEqual(actual.model.doStreamCalls.map(call=>call.responseFormat?.type==='json'?call.responseFormat.schema?.required:undefined),[['roster'],['roster']]);for(const call of actual.model.doStreamCalls)assert.equal(call.maxOutputTokens,undefined)
 const second=actual.options[1];assert.ok('prompt'in second);assert.ok(second.prompt.includes(secret));assert.equal(second.prompt.includes('<scene-roster-targeted-repair>'),false)
})
test('BR02: malformed JSON, then a grounded draft, then exact CF repair preserve complete source facts',async()=>{
 const actual=await bridge((prompt,index)=>index===1?{raw:malformed}:index===2?{value:bad()}:{value:explicitTargetedRosterReply(prompt,good(),request().units)});assert.equal(actual.error,undefined);assert.deepEqual(actual.result,sceneRosterGenerationSchema(request()).parse(good()));assert.equal(actual.model.doStreamCalls.length,3);assert.equal(actual.rows.length,3);assert.equal(actual.checks,3);assert.deepEqual(actual.model.doStreamCalls.map(call=>call.responseFormat?.type==='json'?call.responseFormat.schema?.required:undefined),[['roster'],['roster'],['answers']]);assert.ok('prompt'in actual.options[2]);assert.ok(plan(actual.options[2].prompt).rows.length===1)
})
test('BR03: every typed retry uses the one frozen original draft and plan, never a failed repairs response as a new draft',async()=>{
 let frozenPlan:unknown,wrongReply:unknown
 const actual=await bridge((prompt,index)=>{if(index===1)return{value:bad()};const current=plan(prompt);if(index===2){frozenPlan=structuredClone(current);wrongReply=explicitTargetedRosterReply(prompt,good(),request().units);(wrongReply as any).repairs[0].replacement.context[0].label='无据限定';return{value:wrongReply}}assert.deepEqual(current,frozenPlan);const frames=dataFrames(prompt);assert.ok(frames.some(frame=>JSON.stringify(frame.value)===JSON.stringify(bad())),'the complete original draft remains visible');assert.ok(frames.some(frame=>JSON.stringify(frame.value)===JSON.stringify(wrongReply)),'the entire current failed repairs response remains visible');return{value:explicitTargetedRosterReply(prompt,good(),request().units)}})
 assert.equal(actual.error,undefined);assert.equal(actual.model.doStreamCalls.length,3);assert.deepEqual(actual.result,sceneRosterGenerationSchema(request()).parse(good()))
})
test('BR03: malformed JSON after draft freeze stays on the exact same typed transaction and native repair schema',async()=>{
 let frozenPlan:unknown
 const raw='{"repairs":[',actual=await bridge((prompt,index)=>{if(index===1)return{value:bad()};if(index===2){frozenPlan=structuredClone(plan(prompt));return{raw}}assert.deepEqual(plan(prompt),frozenPlan);const frames=dataFrames(prompt);assert.ok(frames.some(frame=>frame.format==='text'&&frame.value===raw));assert.ok(frames.some(frame=>JSON.stringify(frame.value)===JSON.stringify(bad())));return{value:explicitTargetedRosterReply(prompt,good(),request().units)}})
 assert.equal(actual.error,undefined);assert.equal(actual.options.length,3);assert.deepEqual(actual.result,sceneRosterGenerationSchema(request()).parse(good()));assert.deepEqual(actual.model.doStreamCalls.map(call=>call.responseFormat?.type==='json'?call.responseFormat.schema?.required:undefined),[['roster'],['answers'],['answers']])
})
test('BR07: the trusted generation budget is bounded, stripped from SDK options and accumulates every actual generation',async()=>{
 let calls=0;const output=await generateJSON({userId:'br',action:'synthetic',prompt:'original',schema:z.strictObject({ok:z.literal(true)}),...{maxGenerations:4}} as Parameters<typeof generateJSON<{ok:true}>>[0],{generateText:async options=>{assert.ok(!Object.hasOwn(options,'maxGenerations'));calls++;return{text:JSON.stringify({ok:calls===4}),promptTokens:calls,completionTokens:calls*2,cost:.25,finishReason:'stop'}}});assert.equal(calls,4);assert.equal(output.promptTokens,10);assert.equal(output.completionTokens,20);assert.equal(output.cost,1)
})
test('BR03: four typed generations remain one atomic transaction and discard superseded failure history',async()=>{
 const marker2='无据限定第二次',marker3='无据限定第三次并保留较长当前回复',plans:string[]=[]
 const actual=await bridge((prompt,index)=>{if(index===1)return{value:bad()};plans.push(JSON.stringify(plan(prompt)));if(index===4){assert.equal(prompt.includes(marker2),false);assert.ok(prompt.includes(marker3));assert.ok(dataFrames(prompt).some(frame=>JSON.stringify(frame.value)===JSON.stringify(bad())));return{value:explicitTargetedRosterReply(prompt,good(),request().units)}}const reply=explicitTargetedRosterReply(prompt,good(),request().units) as any;reply.repairs[0].replacement.context[0].label=index===2?marker2:marker3;return{value:reply}})
 assert.equal(actual.error,undefined);assert.equal(actual.options.length,4);assert.equal(new Set(plans).size,1);assert.deepEqual(actual.result,sceneRosterGenerationSchema(request()).parse(good()));assert.equal(actual.rows.length,4)
})
test('BR01/03: persistent malformed or invalid typed replies fail after exactly four real SDK generations',async t=>{
 for(const typed of [false,true])await t.test(typed?'frozen typed':'unparsed and empty output',async()=>{
  for(const empty of typed?[false]:[false,true]){const actual=await bridge((prompt,index)=>!typed?{raw:empty?' ':malformed}:index===1?{value:bad()}:(()=>{const reply=explicitTargetedRosterReply(prompt,good(),request().units) as any;reply.repairs[0].replacement.context[0].label='始终没有来源';return{value:reply}})());assert.ok(actual.error instanceof StructuredGenerationError);assert.equal(actual.error.kind,typed?'invalid_schema':'invalid_json');assert.equal(actual.result,undefined);assert.equal(actual.options.length,4);assert.equal(actual.model.doStreamCalls.length,4);assert.equal(actual.checks,4);assert.equal(actual.rows.length,4)}
 })
})
test('BR04: source, original full windows, ownership groups and relationship gates reject every repeated invalid proposal',async t=>{
 const changes:[string,(value:any)=>void][]=[['delete verified mention',row=>row.mentions.shift()],['shorten original whole window',(row)=>{row.mentions[0].evidence=row.context[0].evidence[0]}],['delete original context',row=>row.context=[]],['delete original link',row=>row.links=[]],['invent ungrounded context',row=>row.context[0].label='不在原文的限定'],['dangling link',row=>row.links[0].targetIndex=999],['bridge a different owner',(row)=>row.mentions.push({literal:'乙室',evidence:row.links[0].evidence[1]})]]
 for(const [label,change]of changes)await t.test(label,async()=>{const actual=await bridge((prompt,index)=>{if(index===1)return{value:bad()};const reply=explicitTargetedRosterReply(prompt,good(),request().units) as any;change(reply.repairs[0].replacement);return{value:reply}});assert.ok(actual.error instanceof StructuredGenerationError);assert.equal(actual.result,undefined);assert.equal(actual.options.length,4)})
 await t.test('good rows cannot be added to the closed repair set',async()=>{const actual=await bridge((prompt,index)=>index===1?{value:bad()}:{value:{repairs:[...(explicitTargetedRosterReply(prompt,good(),request().units) as any).repairs,{repairRef:'rr'+'0'.repeat(16),disposition:'reject'}]}});assert.ok(actual.error instanceof StructuredGenerationError);assert.equal(actual.options.length,4)})
})
test('BR05: only extra-root objects gain recovery while other wrong roots and non-stop completions remain immediate failures',async t=>{
 for(const value of [null,[],{},'not a roster',{roster:null},{roster:Array.from({length:2001},()=>({}))}])await t.test('non-recoverable parser candidate '+(value===null?'null':Array.isArray(value)?'array':typeof value),async()=>{const actual=await bridge(()=>({value}));assert.ok(actual.error instanceof Error);assert.equal(actual.options.length,1)})
 await t.test('extra-root objects with a roster array remain strictly rejected through four first-schema generations',async()=>{const value={roster:[],extra:true};assert.equal(sceneRosterGenerationSchema(request()).safeParse(value).success,false);const actual=await bridge(()=>({value}));assert.ok(actual.error instanceof StructuredGenerationError);assert.equal(actual.error.kind,'invalid_schema');assert.equal(actual.result,undefined);assert.equal(actual.options.length,4);for(const call of actual.model.doStreamCalls)assert.deepEqual(call.responseFormat?.type==='json'?call.responseFormat.schema?.required:undefined,['roster']);for(const options of actual.options){assert.ok('prompt'in options);assert.ok(!options.prompt.includes('<scene-roster-targeted-repair>'))}})
 for(const finish of ['length','content-filter'] as const)await t.test('complete JSON finish '+finish,async()=>{const actual=await bridge(()=>({value:good(),finish}));assert.ok(actual.error instanceof StructuredGenerationError);assert.equal(actual.error.kind,'incomplete');assert.equal(actual.error.finishReason,finish);assert.equal(actual.options.length,1)})
 for(const finishReason of [undefined,'unknown'])await t.test((finishReason??'missing')+' result finish cannot silently accept a complete roster',async()=>{let calls=0;await assert.rejects(runImportAi(request(),new AbortController().signal,{resolve:async()=>pub,assert:async()=>{},generate:async(input,_m,signal,prompt)=>generateImportAiJson(input,{userId:'synthetic',resolvedModel:{} as ResolvedModel},signal,prompt,{generateText:async()=>{calls++;return{text:JSON.stringify(good()),promptTokens:0,completionTokens:0,cost:0,finishReason}}})}),error=>error instanceof StructuredGenerationError&&error.kind==='incomplete'&&error.finishReason==='unknown');assert.equal(calls,1)})
 await t.test('active typed non-stop terminates before any further recovery',async()=>{const actual=await bridge((prompt,index)=>index===1?{value:bad()}:{value:explicitTargetedRosterReply(prompt,good(),request().units),finish:'length'});assert.ok(actual.error instanceof StructuredGenerationError);assert.equal(actual.error.kind,'incomplete');assert.equal(actual.error.finishReason,'length');assert.equal(actual.options.length,2)})
 await t.test('generic complete JSON without finish keeps its existing acceptance',async()=>{let calls=0;const result=await generateJSON({userId:'br',action:'generic-finish',prompt:'synthetic',schema:z.strictObject({ok:z.literal(true)})},{generateText:async()=>{calls++;return{text:'{"ok":true}',promptTokens:0,completionTokens:0,cost:0}}});assert.deepEqual(result.data,{ok:true});assert.equal(calls,1)})
 for(const fault of ['quotaAt','usageAt','transportAt','abortAt'] as const)await t.test('original '+fault+' exception',async()=>{const failure=new Error('BR-SYNTHETIC-FAILURE'),actual=await bridge(()=>({raw:malformed}),{failure,[fault]:1});assert.equal(actual.error,failure);assert.equal(actual.options.length,1)})
 await t.test('final authority still rejects a successful roster',async()=>{const failure=new Error('BR-FINAL-AUTH'),actual=await bridge(()=>({value:good()}),{failure,finalAuth:true});assert.equal(actual.error,failure);assert.equal(actual.options.length,1)})
})
test('BR06: actual second, third and fourth prompts count precisely one wrapper, their actual schema, original draft and current failure',async t=>{
 for(const target of [2,3,4])await t.test('generation '+target,async()=>{
  const reply=(prompt:string,index:number):Spec=>{if(index===1)return target===2?{raw:malformed}:{value:bad()};if(index===target)return{value:index===2?good():explicitTargetedRosterReply(prompt,good(),request().units)};const value=explicitTargetedRosterReply(prompt,good(),request().units) as any;value.repairs[0].replacement.context[0].label='无据限定'+(index===3?'第三次当前回复更长'.repeat(8):'第二次');return{value}}
  const baseline=await bridge(reply);assert.equal(baseline.error,undefined);const options=baseline.options[target-1];assert.ok('prompt'in options);const capacity=Buffer.byteLength(options.prompt+JSON.stringify(options.jsonOutputSchema),'utf8')+6000
  const exact=await bridge(reply,{capacity});assert.equal(exact.error,undefined);assert.equal(exact.options.length,target);const exactOptions=exact.options[target-1];assert.ok('prompt'in exactOptions);assert.equal(exactOptions.prompt,options.prompt)
  const tooSmall=await bridge(reply,{capacity:capacity-1});assert.ok(tooSmall.error instanceof Error);assert.match(tooSmall.error.message,/预算/u);assert.equal(tooSmall.options.length,target-1)
 })
})
test('BR06: original fixed reserve rejects N+1 full failed replies without clipping them',async()=>{
 const baseline=await bridge((_prompt,index)=>index===1?{raw:malformed}:{value:good()});assert.equal(baseline.error,undefined);const options=baseline.options[1];assert.ok('prompt'in options);const payload=serializeImportAiPayload(request()),room=65536-IMPORT_JSON_WRAPPER_RESERVE_BYTES-Buffer.byteLength(options.prompt+JSON.stringify(options.jsonOutputSchema),'utf8')+Buffer.byteLength(payload,'utf8')
 for(const extra of [0,1]){const raw=malformed+'x'.repeat(room+extra),actual=await bridge((_prompt,index)=>index===1?{raw}:{value:good()});if(extra){assert.ok(actual.error instanceof Error);assert.match(actual.error.message,/预算/u);assert.equal(actual.options.length,1)}else{assert.equal(actual.error,undefined);assert.equal(actual.options.length,2);assert.ok('prompt'in actual.options[1]);assert.ok(dataFrames(actual.options[1].prompt).some(frame=>frame.format==='text'&&frame.value===raw))}}
})
test('BR07: invalid generation limits fail before generation and the generic default stays two',async()=>{
 for(const limit of [0,-1,1.5,5,NaN,Infinity,'4']){let calls=0;await assert.rejects(generateJSON({userId:'br',action:'invalid-limit',prompt:'synthetic',schema:z.object({ok:z.boolean()}),...{maxGenerations:limit}} as Parameters<typeof generateJSON>[0],{generateText:async()=>{calls++;return{text:'{"ok":true}',promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'}}}),/次数预算/u);assert.equal(calls,0)}
 for(const limit of [undefined,1,3,4]){let calls=0;await assert.rejects(generateJSON({userId:'br',action:'bounded',prompt:'synthetic',schema:z.object({ok:z.boolean()}),...(limit===undefined?{}:{maxGenerations:limit})},{generateText:async options=>{calls++;assert.ok(!Object.hasOwn(options,'maxGenerations'));return{text:'not-json',promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'}}}),error=>error instanceof StructuredGenerationError);assert.equal(calls,limit??2)}
})
