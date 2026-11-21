import assert from 'node:assert/strict'
import {test} from 'node:test'
import {MockLanguageModelV4} from 'ai/test'
import type {LanguageModelV4StreamPart} from '@ai-sdk/provider'
import {generateText,StructuredGenerationError,type GenerateUsage} from '../../src/lib/ai/generate'
import {runImportAi,generateImportAiJson,sceneRosterGenerationSchema} from '../../desktop/service/novel-import-ai'
import {localModelRecord} from '../../desktop/service/models'
import {LOCAL_AUTHOR_ID} from '../../desktop/service/context'
import {runInsideLongTask} from '../../src/lib/long-task'
import {explicitTargetedRosterReply} from '../helpers/novel-import-targeted-repair-fixture'
import type {ImportAiRequest} from '../../desktop/shared/novel-import'
import type {PublicModel} from '../../desktop/core/settings'
import type {ResolvedModel} from '../../src/lib/ai/provider'
import {serializeImportAiPayload,IMPORT_JSON_WRAPPER_RESERVE_BYTES} from '../../desktop/core/novel-import-ai-payload'

const pub:PublicModel={id:'00000000-0000-4000-8000-000000000094',name:'合成根恢复模型',provider:'deepseek',protocol:'openai',endpoint:'https://api.deepseek.com',modelId:'deepseek-flash',kind:'TEXT',enabled:true,authRevision:1,contextWindow:1048576,keyMask:'synthetic',thinkingLevels:[],defaultThinking:'none'}
const a='东宅的甲室门打开。',alias='又称阅览间。',b='西宅的甲室门已关闭。',c='北山的塔楼有钟声。',secret='ER_ORIGINAL_EXTRA_KEY_VALUE'
function request():ImportAiRequest{return{semanticVersion:1,operationId:'er-operation',phase:'analyze',intent:'roster',kind:'scene',sceneIdentity:{version:1,mode:'roster'},models:{text:pub,review:pub},units:[a+'\r\n'+alias,b,c].map((text,i)=>({id:'er-'+i,fileId:'synthetic-body',start:i*1000,end:i*1000+text.length,text,kind:'body'})),artifacts:[],workingRevision:0}}
const anchor=(i:number,quote:string)=>({unitId:'er-'+i,quote})
function good(){return{roster:[{mentions:[{literal:'甲室',evidence:anchor(0,request().units[0].text)},{literal:'阅览间',evidence:anchor(0,alias)}],context:[{label:'东宅',evidence:[anchor(0,a)]}],links:[{targetIndex:2,relation:'parent',evidence:[anchor(0,a),anchor(2,c)]}]},{mentions:[{literal:'甲室',evidence:anchor(1,b)}],context:[{label:'西宅',evidence:[anchor(1,b)]}],links:[]},{mentions:[{literal:'塔楼',evidence:anchor(2,c)}],context:[],links:[]}]}}
const extra=()=>({...good(),[secret]:secret})
function bad(){const result=good();result.roster[0].mentions[1].evidence.quote='ER_BAD_QUOTE';return result}
const frames=(prompt:string)=>[...prompt.matchAll(/<previous-scene-roster-output>(.*?)<\/previous-scene-roster-output>/gsu)].map(match=>JSON.parse(match[1]))
type Spec={value?:unknown;raw?:string;finish?:'stop'|'length'}
async function bridge(reply:(prompt:string,index:number)=>Spec,capacity=pub.contextWindow,fault?:{stage:'quota'|'usage'|'transport'|'abort'|'authority';error:Error}){
 const pinned={...pub,contextWindow:capacity},r=request();r.models={text:pinned,review:pinned}
 const before=structuredClone(r),options:Parameters<typeof generateText>[0][]=[],usageRows:Parameters<GenerateUsage['recordUsage']>[0][]=[],signal=new AbortController();let spec:Spec={},checks=0,assertions=0
 const model=new MockLanguageModelV4({doStream:async()=>{
  if(fault?.stage==='transport'&&options.length===2)throw fault.error
  const text=spec.raw??JSON.stringify(spec.value),parts:LanguageModelV4StreamPart[]=[{type:'stream-start',warnings:[]},{type:'text-start',id:'er-stream'}]
  for(let at=0;at<text.length;at+=13)parts.push({type:'text-delta',id:'er-stream',delta:text.slice(at,at+13)})
  parts.push({type:'text-end',id:'er-stream'},{type:'finish',finishReason:{unified:spec.finish??'stop',raw:spec.finish??'stop'},usage:{inputTokens:{total:17,noCache:17,cacheRead:0,cacheWrite:0},outputTokens:{total:29,text:29,reasoning:0}}})
  return{stream:new ReadableStream({start(controller){for(const part of parts)controller.enqueue(part);controller.close()}})}
 }})
 const usage:GenerateUsage={checkQuota:async()=>{checks++;if(fault?.stage==='quota'&&checks===2)throw fault.error;return{tokenQuota:1e9,tokenUsed:0,remaining:1e9}},recordUsage:async row=>{usageRows.push(structuredClone(row));if(fault?.stage==='usage'&&usageRows.length===2)throw fault.error;return .25}},resolved:ResolvedModel={model,modelRecord:localModelRecord(pinned),providerOptions:{openai:{store:false}}};let result:unknown,error:unknown
 try{result=await runInsideLongTask(()=>runImportAi(r,signal.signal,{resolve:async()=>pinned,assert:async()=>{assertions++;if(fault?.stage==='authority'&&assertions===2)throw fault.error},generate:async(input,_m,signalArg,prompt)=>generateImportAiJson(input,{userId:LOCAL_AUTHOR_ID,resolvedModel:resolved,structuredSceneRoster:true,usage,maxNetworkRetries:0},signalArg,prompt,{generateText:async value=>{options.push(value);spec=reply('prompt'in value?value.prompt:'',options.length);if(fault?.stage==='abort'&&options.length===2)signal.abort(fault.error);return generateText(value)}})}))}catch(value){error=value}
 assert.deepEqual(r,before);return{result,error,options,model,usageRows,checks,assertions}
}
function onlyFirst(actual:Awaited<ReturnType<typeof bridge>>){for(const call of actual.model.doStreamCalls){assert.equal(call.responseFormat?.type,'json');assert.deepEqual(call.responseFormat.type==='json'?call.responseFormat.schema?.required:undefined,['roster']);assert.equal(call.maxOutputTokens,undefined)}for(const options of actual.options){assert.ok('prompt'in options);assert.ok(!options.prompt.includes('<scene-roster-targeted-repair>'))}}

test('ER01: an extra-root reply stays strictly invalid and only a complete strict regeneration can succeed',async()=>{
 assert.equal(sceneRosterGenerationSchema(request()).safeParse(extra()).success,false)
 const actual=await bridge((_prompt,index)=>({value:index===1?extra():good()}));assert.equal(actual.error,undefined);assert.deepEqual(actual.result,sceneRosterGenerationSchema(request()).parse(good()));assert.equal(actual.model.doStreamCalls.length,2);assert.equal(actual.usageRows.length,2);assert.equal(actual.checks,2);assert.equal(actual.assertions,2);onlyFirst(actual);assert.ok('prompt'in actual.options[1]);assert.ok(frames(actual.options[1].prompt).some(frame=>JSON.stringify(frame.value)===JSON.stringify(extra())))
})
test('ER02: the original proof survives a later bad strict row without entering typed or capturing again',async()=>{
 const actual=await bridge((_prompt,index)=>({value:index===1?extra():index===2?bad():good()}));assert.equal(actual.error,undefined);assert.equal(actual.options.length,3);onlyFirst(actual);assert.deepEqual(actual.result,sceneRosterGenerationSchema(request()).parse(good()));assert.ok('prompt'in actual.options[2]);const data=frames(actual.options[2].prompt);assert.ok(data.some(frame=>JSON.stringify(frame.value)===JSON.stringify(extra())));assert.ok(data.some(frame=>JSON.stringify(frame.value)===JSON.stringify(bad())))
})
test('ER02: repeated extra roots are never silently stripped or adopted and stop at the original four generations',async()=>{
 const actual=await bridge(()=>({value:extra()}));assert.ok(actual.error instanceof StructuredGenerationError);assert.equal(actual.error.kind,'invalid_schema');assert.equal(actual.options.length,4);assert.equal(actual.result,undefined);onlyFirst(actual)
})
test('ER02: full reidentification cannot lose verified source atoms, complete windows, owners, contexts or either relationship endpoint',async t=>{
 const changes:[string,(value:ReturnType<typeof good>)=>void][]=[
  ['delete a verified mention',value=>{value.roster[0].mentions.pop()}],['shorten the whole original quote',value=>{value.roster[0].mentions[0].evidence.quote=a}],['move a homonym to its sibling owner',value=>{value.roster[0].mentions[0].evidence=anchor(1,b)}],['add an owner bridge while retaining the old rows',value=>{value.roster[0].mentions.push({literal:'甲室',evidence:anchor(1,b)})}],['delete a verified context',value=>{value.roster[0].context=[]}],['delete a verified relationship',value=>{value.roster[0].links=[]}],['change the relationship target',value=>{value.roster[0].links[0].targetIndex=1}],['lose one side of the relationship evidence',value=>{value.roster[0].links[0].evidence.pop()}],
 ]
 for(const [label,change]of changes)await t.test(label,async()=>{const proposal=good();change(proposal);assert.equal(sceneRosterGenerationSchema(request()).safeParse(proposal).success,true,'the failure must reach the retained source proof rather than a different strict gate');const actual=await bridge((_prompt,index)=>({value:index===1?extra():proposal}));assert.ok(actual.error instanceof StructuredGenerationError);assert.equal(actual.error.kind,'invalid_schema');assert.equal(actual.options.length,4);assert.equal(actual.result,undefined);onlyFirst(actual)})
})
test('ER03: a reordered strict response may preserve all grounded owners and links, while unproven claims are not forcibly accepted',async()=>{
 const value=good(),reordered={roster:[value.roster[2],value.roster[1],value.roster[0]]};reordered.roster[2].links[0].targetIndex=0
 const accepted=await bridge((_prompt,index)=>({value:index===1?extra():reordered}));assert.equal(accepted.error,undefined);assert.deepEqual(accepted.result,sceneRosterGenerationSchema(request()).parse(reordered));onlyFirst(accepted)
 const first=extra();first.roster[0].mentions.push({literal:'根本不存在的外号',evidence:anchor(0,'不匹配的引文')});const corrected=await bridge((_prompt,index)=>({value:index===1?first:good()}));assert.equal(corrected.error,undefined);assert.deepEqual(corrected.result,sceneRosterGenerationSchema(request()).parse(good()));onlyFirst(corrected)
})
test('ER03: later extra roots never replace the initial proof, and superseded replies are not accumulated',async()=>{
 const marker='ER_SUPERSEDED_EXTRA',second={...good(),[marker]:true};second.roster[0].mentions.pop();const third={roster:second.roster}
 const actual=await bridge((prompt,index)=>{if(index===4){assert.equal(prompt.includes(marker),false);const data=frames(prompt);assert.ok(data.some(frame=>JSON.stringify(frame.value)===JSON.stringify(extra())));assert.ok(data.some(frame=>JSON.stringify(frame.value)===JSON.stringify(third)))}return{value:index===1?extra():index===2?second:index===3?third:good()}})
 assert.equal(actual.error,undefined);assert.equal(actual.options.length,4);assert.deepEqual(actual.result,sceneRosterGenerationSchema(request()).parse(good()));onlyFirst(actual)
})
test('ER03: unparsed output may lead into root recovery, but a frozen typed transaction can never escape into it',async()=>{
 const root=await bridge((_prompt,index)=>index===1?{raw:'{"roster":['}:{value:index===2?extra():good()});assert.equal(root.error,undefined);assert.equal(root.options.length,3);onlyFirst(root)
 const typed=await bridge((prompt,index)=>({value:index===1?bad():index===2?extra():explicitTargetedRosterReply(prompt,good(),request().units)}));assert.equal(typed.error,undefined);assert.equal(typed.options.length,3);assert.deepEqual(typed.model.doStreamCalls.map(call=>call.responseFormat?.type==='json'?call.responseFormat.schema?.required:undefined),[['roster'],['answers'],['answers']]);assert.deepEqual(typed.result,sceneRosterGenerationSchema(request()).parse(good()))
})
test('ER04: non-stop and original external failures never gain a root-envelope retry',async t=>{
 for(const active of [false,true])await t.test(active?'non-stop after root capture':'non-stop first extra root',async()=>{const actual=await bridge((_prompt,index)=>({value:index===1?extra():good(),finish:!active||index===2?'length':'stop'}));assert.ok(actual.error instanceof StructuredGenerationError);assert.equal(actual.error.kind,'incomplete');assert.equal(actual.options.length,active?2:1)})
 for(const stage of ['quota','usage','transport','abort','authority'] as const)await t.test(stage+' after root capture',async()=>{const failure=new Error('ER_SYNTHETIC_FAILURE'),actual=await bridge((_prompt,index)=>({value:index===1?extra():good()}),pub.contextWindow,{stage,error:failure});assert.equal(actual.error,failure);assert.equal(actual.options.length,2);assert.equal(actual.result,undefined)})
 for(const value of [null,[],{}, {roster:null},{roster:Array.from({length:2001},()=>({})),extra:true}])await t.test('other root remains terminal '+(value===null?'null':Array.isArray(value)?'array':typeof value),async()=>{const actual=await bridge(()=>({value}));assert.ok(actual.error instanceof Error);assert.equal(actual.options.length,1)})
})
test('ER04: actual envelope second, third and fourth SDK prompts keep exact v1 schema and wrapper capacity boundaries',async t=>{
 for(const target of [2,3,4])await t.test('generation '+target,async()=>{
  const reply=(_prompt:string,index:number):Spec=>{if(index===1)return{value:extra()};const value=good();if(index<target)value.roster[0].context[0].label='无据限定'+(index===3?'最新完整回复更长'.repeat(8):'第二次');return{value}}
  const baseline=await bridge(reply);assert.equal(baseline.error,undefined);const options=baseline.options[target-1];assert.ok('prompt'in options);const capacity=Buffer.byteLength(options.prompt+JSON.stringify(options.jsonOutputSchema),'utf8')+6000,exact=await bridge(reply,capacity);assert.equal(exact.error,undefined);assert.equal(exact.options.length,target);const last=exact.options[target-1];assert.ok('prompt'in last);assert.equal(last.prompt,options.prompt);onlyFirst(exact)
  const smaller=await bridge(reply,capacity-1);assert.ok(smaller.error instanceof Error);assert.match(smaller.error.message,/预算/u);assert.equal(smaller.options.length,target-1)
 })
})
test('ER04: full extra-root data stays in the original fixed reserve and N+1 never generates',async()=>{
 const baseline=await bridge((_prompt,index)=>({value:index===1?extra():good()}));assert.equal(baseline.error,undefined);const options=baseline.options[1];assert.ok('prompt'in options);const room=65536-IMPORT_JSON_WRAPPER_RESERVE_BYTES-Buffer.byteLength(options.prompt+JSON.stringify(options.jsonOutputSchema),'utf8')+Buffer.byteLength(serializeImportAiPayload(request()),'utf8')
 for(const over of [0,1]){const first=extra();first[secret]+= 'x'.repeat(room+over);const actual=await bridge((_prompt,index)=>({value:index===1?first:good()}));if(over){assert.ok(actual.error instanceof Error);assert.match(actual.error.message,/预算/u);assert.equal(actual.options.length,1)}else{assert.equal(actual.error,undefined);assert.equal(actual.options.length,2);assert.ok('prompt'in actual.options[1]);assert.ok(frames(actual.options[1].prompt).some(frame=>JSON.stringify(frame.value)===JSON.stringify(first)))}}
})
