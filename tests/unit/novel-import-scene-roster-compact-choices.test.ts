import {expandChoiceDirectory} from '../helpers/novel-import-choice-directory-fixture'
import assert from 'node:assert/strict'
import {test} from 'node:test'
import {MockLanguageModelV4} from 'ai/test'
import type {LanguageModelV4StreamPart} from '@ai-sdk/provider'
import {createSceneRosterRepairChoices} from '../../desktop/service/novel-import-scene-roster-repair-choices'
import {createSceneRosterFragmentTable} from '../../desktop/core/novel-import-scene-roster-fragments'
import {runImportAi,generateImportAiJson,sceneRosterGenerationSchema} from '../../desktop/service/novel-import-ai'
import {generateText,StructuredGenerationError,type GenerateUsage} from '../../src/lib/ai/generate'
import {localModelRecord} from '../../desktop/service/models'
import {LOCAL_AUTHOR_ID} from '../../desktop/service/context'
import {runInsideLongTask} from '../../src/lib/long-task'
import {explicitTargetedRosterReply} from '../helpers/novel-import-targeted-repair-fixture'
import type {ImportAiRequest} from '../../desktop/shared/novel-import'
import type {PublicModel} from '../../desktop/core/settings'
import type {ResolvedModel} from '../../src/lib/ai/provider'
import {serializeImportAiPayload,assertImportFixedPromptReserve,IMPORT_JSON_WRAPPER_RESERVE_BYTES} from '../../desktop/core/novel-import-ai-payload'

const wide='x'.repeat(5000)+'甲室😀\r\n'+'y'.repeat(5000),prefix='段首。',alias='又称阅览间。',other='西城的乙室门关闭。'
const pub:PublicModel={id:'00000000-0000-4000-8000-000000000095',name:'合成压缩目录模型',provider:'deepseek',protocol:'openai',endpoint:'https://api.deepseek.com',modelId:'deepseek-flash',kind:'TEXT',enabled:true,authRevision:1,contextWindow:1048576,keyMask:'synthetic',thinkingLevels:[],defaultThinking:'none'}
function request():ImportAiRequest{return{semanticVersion:1,operationId:'cc-op',phase:'analyze',intent:'roster',kind:'scene',sceneIdentity:{version:1,mode:'roster'},models:{text:pub,review:pub},units:[prefix+wide+'尾部。'+alias,other].map((text,index)=>({id:'compact-source-uuid-'+index,fileId:'synthetic',start:index*20000,end:index*20000+text.length,text,kind:'body'})),artifacts:[],workingRevision:0}}
const anchor=(index:number,quote:string)=>({unitId:request().units[index].id,quote})
function good(){return{roster:[{mentions:[...[wide,wide.slice(1),wide.slice(2)].map(quote=>({literal:'甲室',evidence:anchor(0,quote)})),{literal:'阅览间',evidence:anchor(0,alias)}],context:[{label:'段首',evidence:[anchor(0,prefix)]}],links:[{targetIndex:1,relation:'different-place',evidence:[anchor(0,prefix),anchor(1,other)]}]},{mentions:[{literal:'乙室',evidence:anchor(1,other)}],context:[],links:[]}]}}

test('CC01: compact entries preserve every private window, opaque reference, literal and flag without changing the old entries API',()=>{
 const r=request(),before=structuredClone(r),choices=createSceneRosterRepairChoices(r.units,createSceneRosterFragmentTable(r.units))
 choices.forLiteral('甲室');choices.forLiteral('阅览间');for(const quote of [wide,wide.slice(1),wide.slice(2)])choices.addAnchor(anchor(0,quote),'甲室',true);choices.wholeUnits()
 const original=choices.entries(),snapshot=structuredClone(original),compact=choices.compactEntries()
 assert.equal(compact.length,original.length);assert.deepEqual(compact.map(value=>value.choiceRef),original.map(value=>value.choiceRef))
 for(const [index,value]of compact.entries()){const previous=original[index],unit=r.units[value.unitIndex];assert.ok(unit);assert.ok(!Object.hasOwn(value,'unitId'));assert.ok(!Object.hasOwn(value,'quote'));assert.ok(Number.isSafeInteger(value.start)&&Number.isSafeInteger(value.end)&&value.start>=0&&value.end>value.start&&value.end<=unit.text.length);assert.deepEqual({unitId:unit.id,quote:unit.text.slice(value.start,value.end)},choices.resolve(value.choiceRef,'context'));for(const field of ['literals','sourceRef','wholeUnit','preserved'] as const)assert.deepEqual(value[field],previous[field]);assert.ok(Object.isFrozen(value));assert.ok(Object.isFrozen(value.literals))}
 assert.deepEqual(choices.entries(),snapshot);assert.deepEqual(r,before);assert.ok(Buffer.byteLength(JSON.stringify(compact),'utf8')<Buffer.byteLength(JSON.stringify(original),'utf8'));assert.throws(()=>choices.resolve('cf'+'0'.repeat(16),'context'));assert.throws(()=>choices.addAnchor(anchor(0,'不在原文的引文')))
})
async function bridge(capacity=pub.contextWindow,change?:(reply:any)=>void){
 const pinned={...pub,contextWindow:capacity},r=request();r.models={text:pinned,review:pinned}
 const before=structuredClone(r),first=good();first.roster[0].mentions[3].evidence.quote='CC_BAD_QUOTE';const firstBefore=structuredClone(first),options:Parameters<typeof generateText>[0][]=[],rows:Parameters<GenerateUsage['recordUsage']>[0][]=[];let current:unknown,checks=0
 const model=new MockLanguageModelV4({doStream:async()=>{
  const parts:LanguageModelV4StreamPart[]=[{type:'stream-start',warnings:[]},{type:'text-start',id:'cc-stream'},{type:'text-delta',id:'cc-stream',delta:JSON.stringify(current)},{type:'text-end',id:'cc-stream'},{type:'finish',finishReason:{unified:'stop',raw:'stop'},usage:{inputTokens:{total:19,noCache:19,cacheRead:0,cacheWrite:0},outputTokens:{total:31,text:31,reasoning:0}}}]
  return{stream:new ReadableStream({start(controller){for(const part of parts)controller.enqueue(part);controller.close()}})}
 }})
 const usage:GenerateUsage={checkQuota:async()=>{checks++;return{tokenQuota:1e9,tokenUsed:0,remaining:1e9}},recordUsage:async row=>{rows.push(structuredClone(row));return 0}},resolved:ResolvedModel={model,modelRecord:localModelRecord(pinned),providerOptions:{openai:{store:false}}};let result:unknown,error:unknown
 try{result=await runInsideLongTask(()=>runImportAi(r,new AbortController().signal,{resolve:async()=>pinned,assert:async()=>{},generate:async(input,_m,signal,prompt)=>generateImportAiJson(input,{userId:LOCAL_AUTHOR_ID,resolvedModel:resolved,structuredSceneRoster:true,usage,maxNetworkRetries:0},signal,prompt,{generateText:async value=>{options.push(value);current=options.length===1?first:explicitTargetedRosterReply('prompt'in value?value.prompt:'',good(),r.units);if(options.length>1)change?.(current);return generateText(value)}})}))}catch(value){error=value}
 assert.deepEqual(r,before);assert.deepEqual(first,firstBefore);return{result,error,options,model,rows,checks,r,first}
}
function planOf(prompt:string){const open='<scene-roster-targeted-repair>',start=prompt.indexOf(open);assert.ok(start>=0);const plan=JSON.parse(prompt.slice(start+open.length,prompt.indexOf('</scene-roster-targeted-repair>',start)));return{...plan,choices:expandChoiceDirectory(plan.choices)}}
function replacePlan(prompt:string,plan:unknown){const open='<scene-roster-targeted-repair>',close='</scene-roster-targeted-repair>',start=prompt.indexOf(open),end=prompt.indexOf(close,start);return prompt.slice(0,start+open.length)+JSON.stringify(plan).replace(/</gu,'\\u003c').replace(/>/gu,'\\u003e')+prompt.slice(end)}
test('CC02: a complete real SDK repair fits lossless compact metadata while all long retained windows and source data stay exact',async()=>{
 const actual=await bridge(),{result,options,model,checks,rows,r}=actual;assert.equal(actual.error,undefined);assert.deepEqual(result,sceneRosterGenerationSchema(r).parse(good()));assert.equal(options.length,2);assert.equal(checks,2);assert.equal(rows.length,2);const second=options[1];assert.ok('prompt'in second);const plan=planOf(second.prompt)
 assert.ok(plan.choices.length>3);for(const choice of plan.choices){assert.ok(Number.isSafeInteger(choice.unitIndex));assert.ok(!Object.hasOwn(choice,'quote'));assert.ok(!Object.hasOwn(choice,'unitId'))}assert.ok(plan.rows[0].keep.mentions.length>0);for(const mention of plan.rows[0].keep.mentions){assert.ok(Number.isSafeInteger(mention.choice));assert.equal(Object.hasOwn(mention,'choiceRef'),false);assert.match(plan.choices[mention.choice-1].choiceRef,/^cf[0-9a-f]{16}$/u)};assert.equal(model.doStreamCalls[0].maxOutputTokens,undefined);assert.equal(model.doStreamCalls[1].maxOutputTokens,undefined);assert.deepEqual(model.doStreamCalls.map(call=>call.responseFormat?.type==='json'?call.responseFormat.schema?.required:undefined),[['roster'],['answers']])
})
test('CC03: repeated source occurrences, frozen copies and request-local indices keep the complete private bindings',()=>{
 const r=request(),repeated='甲室。甲室。';r.units.push({id:'repeated-compact-unit',fileId:'synthetic',start:30000,end:30000+repeated.length,text:repeated,kind:'body'})
 const choices=createSceneRosterRepairChoices(r.units,createSceneRosterFragmentTable(r.units)),refs=choices.forLiteral('甲室');assert.equal(refs.length,3);choices.addAnchor(anchor(0,wide),'甲室',true);choices.wholeUnits();const compact=choices.compactEntries(),before=structuredClone(compact)
 assert.ok(Object.isFrozen(compact));assert.throws(()=>{(compact[0] as any).start++});assert.throws(()=>{compact[0].literals.push('mutated')});const copy=structuredClone(compact);copy[0].start++;copy[0].literals.push('mutated');assert.deepEqual(choices.compactEntries(),before)
 const old=choices.resolve(compact[0].choiceRef,'context');old.quote='mutated';assert.notEqual(choices.resolve(compact[0].choiceRef,'context').quote,'mutated')
 for(const ref of refs){const value=compact.find(value=>value.choiceRef===ref)!;assert.deepEqual({unitId:r.units[value.unitIndex].id,quote:r.units[value.unitIndex].text.slice(value.start,value.end)},choices.resolve(ref,'mention','甲室'))}
 const reversed=[...r.units].reverse(),next=createSceneRosterRepairChoices(reversed,createSceneRosterFragmentTable(reversed)),ref=next.addAnchor(anchor(0,wide),'甲室',true);assert.equal(ref,choices.addAnchor(anchor(0,wide),'甲室',true));assert.equal(next.compactEntries().find(value=>value.choiceRef===ref)!.unitIndex,2)
 const at=r.units[0].text.indexOf('😀');assert.throws(()=>choices.addAnchor(anchor(0,r.units[0].text.slice(at+1,at+4))));const crlf=r.units[0].text.indexOf('\r\n');assert.throws(()=>choices.addAnchor(anchor(0,r.units[0].text.slice(crlf+1,crlf+4))))
})
test('CC04: compact metadata is exact fixture data, while model replies still cannot use coordinates or foreign choices',async()=>{
 const actual=await bridge();assert.equal(actual.error,undefined);const options=actual.options[1];assert.ok('prompt'in options);const original=planOf(options.prompt)
 for(const mutate of [(value:any)=>value.choices[0].unitIndex=-1,(value:any)=>value.choices[0].end=request().units[0].text.length+1,(value:any)=>value.choices[0].unitId=request().units[0].id,(value:any)=>value.choices[0].choiceRef='cf'+'0'.repeat(16),(value:any)=>value.choices[0].sourceRef='ef'+'0'.repeat(16)]){const plan=structuredClone(original);mutate(plan);assert.throws(()=>explicitTargetedRosterReply(replacePlan(options.prompt,plan),good(),request().units),/TEST_FIXTURE_UNSUPPORTED_EXACT_CHOICE/u)}
 const bad=await bridge(pub.contextWindow,reply=>Object.assign(reply.repairs[0].replacement.mentions[0].evidence,{unitIndex:0,start:0,end:1}));assert.ok(bad.error instanceof StructuredGenerationError);assert.equal(bad.error.kind,'invalid_schema');assert.equal(bad.options.length,4)
})
test('CC05: the measured compact bytes fit without deleting any full choice or raising the original reserve',async()=>{
 const actual=await bridge();assert.equal(actual.error,undefined);const options=actual.options[1];assert.ok('prompt'in options);const plan=planOf(options.prompt),legacy={...plan,choices:plan.choices.map((value:any)=>{const unit=request().units[value.unitIndex];return{choiceRef:value.choiceRef,unitId:unit.id,...(value.sourceRef?{sourceRef:value.sourceRef}:!value.wholeUnit?{quote:unit.text.slice(value.start,value.end)}:{}),...(value.wholeUnit?{wholeUnit:true}:{}),literals:value.literals,...(value.preserved?{preserved:true}:{})}})},oldPrompt=replacePlan(options.prompt,legacy),payload=serializeImportAiPayload(request()),schema=JSON.stringify(options.jsonOutputSchema)
 assert.equal(legacy.choices.length,plan.choices.length);assert.ok(Buffer.byteLength(JSON.stringify(legacy),'utf8')>Buffer.byteLength(JSON.stringify(plan),'utf8')+20000);assertImportFixedPromptReserve(options.prompt+schema,payload);assert.throws(()=>assertImportFixedPromptReserve(oldPrompt+schema,payload),/预算/u)
 const capacity=Buffer.byteLength(options.prompt+schema,'utf8')+6000,exact=await bridge(capacity);assert.equal(exact.error,undefined);assert.equal(exact.options.length,2);const small=await bridge(capacity-1);assert.ok(small.error instanceof Error);assert.match(small.error.message,/预算/u);assert.equal(small.options.length,1)
 const metadata=Buffer.byteLength(options.prompt+schema,'utf8')-Buffer.byteLength(payload,'utf8')+IMPORT_JSON_WRAPPER_RESERVE_BYTES;assert.ok(metadata<=65536)
})
