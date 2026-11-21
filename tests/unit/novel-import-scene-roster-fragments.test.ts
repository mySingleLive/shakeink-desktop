import {staticRosterCorrection} from '../helpers/novel-import-targeted-repair-fixture'
import {controlledTargetedReply} from '../helpers/novel-import-negative-targeted-reply'
import assert from 'node:assert/strict'
import {test} from 'node:test'
import * as ai from '../../desktop/service/novel-import-ai'
import {serializeImportAiPayload,importAiPrompt,IMPORT_JSON_WRAPPER_RESERVE_BYTES} from '../../desktop/core/novel-import-ai-payload'
import {importRequestBudget} from '../../desktop/core/novel-import-budget-policy'
import {StructuredGenerationError} from '../../src/lib/ai/generate'
import type {ResolvedModel} from '../../src/lib/ai/provider'
import type {ImportAiRequest,ImportModel,ImportUnit} from '../../desktop/shared/novel-import'

const privateKey='FA-UNKNOWN-RAW-KEY',privateValue='FA-PRIVATE-RAW-ONLY',privateId='FA-PRIVATE-ID'
const partsA=['  东宅的书房门已打开。','\r\n','又称阅览间，','其中留着木桌。','😀\r\n','完整合成资料😀'.repeat(80)+' \t']
const partsB=['西宅的书房门已关闭。','她走向花园，','西宅的书房门已关闭。','末尾 ']
const model:ImportModel={id:'fa-text',name:'合成模型',modelId:'synthetic',endpoint:'https://synthetic.invalid/v1',authRevision:1,contextWindow:64000}
const textA=partsA.join(''),textB=partsB.join('')
function request():ImportAiRequest{return{semanticVersion:1,operationId:'fa-op',phase:'analyze',intent:'roster',kind:'scene',sceneIdentity:{version:1,mode:'roster'},models:{text:{...model},review:{...model,id:'fa-review',contextWindow:20000}},units:[{id:'fa-a',fileId:'working',start:40,end:40+textA.length,text:textA,kind:'body'},{id:'fa-b',fileId:'working',start:40+textA.length,end:40+textA.length+textB.length,text:textB,kind:'body'}],artifacts:[],workingRevision:0}}
const index=(unitIndex:number,fromFragment:number,toFragment:number)=>({unitIndex,fromFragment,toFragment})
const raw=(unitId:string,quote:string)=>({unitId,quote})
function wire(){return{roster:[{primaryMentionIndex:0,mentions:[{literal:'书房',evidence:index(0,0,partsA.length)},{literal:'阅览间',evidence:index(0,2,3)}],context:[{label:'东宅',evidence:[index(0,0,1)]}],links:[{targetIndex:1,relation:'different-place',evidence:[index(0,0,1),index(1,0,2)]}]},{primaryMentionIndex:0,mentions:[{literal:'书房',evidence:index(1,0,2)}],context:[{label:'西宅',evidence:[index(1,0,2)]}],links:[]}]}}
function rawWire(){return{roster:[{name:'书房',aliases:['阅览间'],mentions:[{literal:'书房',evidence:raw('fa-a',textA)},{literal:'阅览间',evidence:raw('fa-a',partsA[2])}],context:[{label:'东宅',evidence:[raw('fa-a',partsA[0])]}],links:[{targetIndex:1,relation:'different-place',evidence:[raw('fa-a',partsA[0]),raw('fa-b',partsB.slice(0,2).join(''))]}]},{name:'书房',aliases:[],mentions:[{literal:'书房',evidence:raw('fa-b',partsB.slice(0,2).join(''))}],context:[{label:'西宅',evidence:[raw('fa-b',partsB.slice(0,2).join(''))]}],links:[]}]}}
const generated=(value:unknown)=>({text:JSON.stringify(value),promptTokens:11,completionTokens:22,cost:0,finishReason:'stop'})
async function bridge(input:ImportAiRequest,sequence:unknown[],prompts:string[]=[],role:'text'|'review'='text'){
 return ai.runImportAi(input,new AbortController().signal,{resolve:async actual=>{assert.equal(actual,role);return input.models[actual]!},assert:async()=>{},generate:async(r,_m,signal,prompt)=>ai.generateImportAiJson(r,{userId:'fa-synthetic',resolvedModel:{} as ResolvedModel,role},signal,prompt,{generateText:async options=>{assert.equal(options.role,role);assert.equal(options.maxOutputTokens,undefined);assert.equal(options.jsonOutputSchema,undefined);prompts.push('prompt'in options?options.prompt:'');return generated(prompts.length>1?controlledTargetedReply(prompts[prompts.length-1],sequence[Math.min(prompts.length-1,sequence.length-1)],input.units,sequence.length===1):sequence[Math.min(prompts.length-1,sequence.length-1)])}})},{role})
}
function feedback(prompts:string[],expectedGenerations=2){assert.equal(prompts.length,expectedGenerations);assert.ok(prompts[1].startsWith(prompts[0]));const added=staticRosterCorrection(prompts[1].slice(prompts[0].length));for(const secret of [privateKey,privateValue,privateId,textA,textB,'fa-a','fa-b'])assert.ok(!added.includes(secret));assert.ok(Buffer.byteLength(added,'utf8')<=IMPORT_JSON_WRAPPER_RESERVE_BYTES);return added}

test('FA02: real JSON generation accepts explicit indexed records and anchors only after the unchanged complete canonical gates',async t=>{
 const input=request(),before=structuredClone(input),value=wire(),valueBefore=structuredClone(value),expected=await bridge(input,[rawWire()]),prompts:string[]=[]
 assert.deepEqual(await bridge(input,[value],prompts),expected);assert.equal(prompts.length,1);assert.deepEqual(value,valueBefore);assert.deepEqual(input,before);assert.ok(textA.length>512)
 await t.test('explicit raw and indexed variants may mix per row and anchor without repairing old raw',async()=>{
  const mixed={roster:[rawWire().roster[0],wire().roster[1]]};Object.assign(mixed.roster[0].mentions[0],{evidence:index(0,0,partsA.length)})
  assert.deepEqual(await bridge(input,[mixed]),expected)
  const narrow=rawWire();narrow.roster[0].mentions[0].evidence.quote='东宅的书房门已打开';const actual=await bridge(input,[narrow]);assert.equal(actual.sceneRosterRecords![0].mentions[0].evidence.quote,'东宅的书房门已打开')
 })
 await t.test('primary selects a local mention and exact aliases derive without dropping duplicate mentions',async()=>{
  const r=request(),text='Ａ室在东侧，A室也这样写。';r.units=[{...r.units[0],text,end:r.units[0].start+text.length}]
  const entry={primaryMentionIndex:1,mentions:[{literal:'Ａ室',evidence:raw('fa-a',text)},{literal:'A室',evidence:raw('fa-a',text)},{literal:'Ａ室',evidence:raw('fa-a',text)}],context:[],links:[]}
  const actual=await bridge(r,[{roster:[entry]}]);assert.equal(actual.sceneRosterRecords![0].name,'A室');assert.deepEqual(actual.sceneRosterRecords![0].aliases,['Ａ室']);assert.deepEqual(actual.sceneRosterRecords![0].mentions,entry.mentions);assert.equal(entry.mentions.length,3)
 })
 await t.test('bad first index and primary have actionable static corrections before a predetermined complete second generation',async()=>{
  for(const [path,change]of [['roster.0.mentions.0.evidence',(value:ReturnType<typeof wire>)=>{value.roster[0].mentions[0].evidence.toFragment=999}],['roster.0.primaryMentionIndex',(value:ReturnType<typeof wire>)=>{value.roster[0].primaryMentionIndex=999}]] as const){const bad=wire();change(bad);const prompts:string[]=[];assert.deepEqual(await bridge(input,[bad,value],prompts),expected);const added=feedback(prompts);assert.ok(added.includes(path+': '));assert.match(added,/片段|primaryMentionIndex/u)}
 })
})

test('FA02-N: every invalid indexed span, mixed branch and original anchor failure stays a bounded rejection',async t=>{
 const variants:[string,unknown][]=[]
 for(const [label,reference]of [['negative',index(-1,0,1)],['fraction',index(0,0.5,1)],['unsafe',index(Number.MAX_SAFE_INTEGER+1,0,1)],['unit out of range',index(2,0,1)],['empty',index(0,1,1)],['reversed',index(0,2,1)],['fragment out of range',index(0,0,999)],['missing literal',index(1,1,2)],['duplicate literal',index(1,0,3)],['nonunique quote',index(1,0,1)],['raw/index mixed',{...index(0,0,1),unitId:privateId,quote:privateValue}],['self supplied directory',{...index(0,0,1),fragments:[{index:0,text:privateValue}]}]] as const){const bad=wire();Object.assign(bad.roster[0].mentions[0],{evidence:reference});variants.push([label,bad])}
 const primary=wire();primary.roster[0].primaryMentionIndex=-1;variants.push(['negative primary',primary])
 const mixed=wire();Object.assign(mixed.roster[0],{name:privateValue,aliases:[]});variants.push(['mixed record',mixed])
 const badRaw=rawWire();badRaw.roster[0].name=privateValue;variants.push(['bad explicit raw name is never derived from mentions',badRaw])
 const later=wire();later.roster[1].context[0].evidence.push(index(0,999,1000));variants.push(['bad later row and evidence',later])
 for(const [label,bad]of variants)await t.test(label,async()=>{const before=structuredClone(bad),prompts:string[]=[];await assert.rejects(bridge(request(),[bad],prompts),error=>error instanceof StructuredGenerationError&&error.kind==='invalid_schema');feedback(prompts,4);assert.deepEqual(bad,before)})
 await t.test('derived aliases above twenty are not truncated and diagnostics address the actual indexed wire',async()=>{
  const r=request(),names=Array.from({length:22},(_,i)=>'地点'+String(i).padStart(2,'0')),text=names.map(name=>name+'。').join('');r.units=[{...r.units[0],text,end:r.units[0].start+text.length}]
  const value={roster:[{primaryMentionIndex:0,mentions:names.map((literal,i)=>({literal,evidence:index(0,i,i+1)})),context:[],links:[]}]},prompts:string[]=[]
  await assert.rejects(bridge(r,[value],prompts),error=>error instanceof StructuredGenerationError&&error.kind==='invalid_schema'&&error.invalidFields.includes('repairs')&&error.feedback.some(message=>message.includes('20')));const added=feedback(prompts,4);assert.ok(added.includes('roster.0.mentions: '));assert.ok(!added.includes('roster.0.aliases: '));assert.ok(!added.includes('roster.0.name: '));assert.equal(value.roster[0].mentions.length,22)
 })
 await t.test('empty original units stay represented but cannot supply an indexed quote',async()=>{const r=request();r.units[0]={...r.units[0],text:'',end:r.units[0].start};const prompts:string[]=[];await assert.rejects(bridge(r,[wire()],prompts),error=>error instanceof StructuredGenerationError);feedback(prompts,4)})
 await t.test('the direct generation schema rejects own undefined extras before JSON can erase them',()=>{
  const parser=(ai as unknown as {sceneRosterGenerationSchema:(r:ImportAiRequest)=>{safeParse:(raw:unknown)=>{success:boolean}}}).sceneRosterGenerationSchema;assert.equal(typeof parser,'function');const parse=parser(request())
  for(const value of [{...wire(),[privateKey]:undefined},{roster:[{...wire().roster[0],name:undefined}]},{roster:[{...wire().roster[0],mentions:[{literal:'书房',evidence:{...index(0,0,1),unitId:undefined}}]}]}])assert.equal(parse.safeParse(value).success,false)
 })
})

test('FA01: deterministic displayed fragments round trip every original character and bind current units',async()=>{
 const helper=await import('../../desktop/core/novel-import-scene-roster-fragments'),input=request(),before=structuredClone(input),table=helper.sceneRosterFragmentUnits(input.units)
 assert.deepEqual(table.map(unit=>unit.fragments.map(part=>part.text)),[partsA,partsB]);assert.deepEqual(input,before)
 const texts=['',' \t\r\n ','😀\r\n甲，乙。\r丙\n丁!尾白 \t','无标点e\u0301😀','！？,;:。','\r\n\r\n']
 for(const text of texts){const fragments=helper.sceneRosterFragments(text);assert.deepEqual(helper.sceneRosterFragments(text),fragments);assert.equal(fragments.map(part=>part.text).join(''),text);assert.equal(fragments.length===0,text==='');for(const [index,fragment]of fragments.entries()){assert.equal(fragment.index,index);assert.ok(fragment.text);assert.ok(fragment.text.isWellFormed());if(index>0)assert.ok(!(fragments[index-1].text.endsWith('\r')&&fragment.text.startsWith('\n')))}}
 assert.deepEqual(helper.restoreSceneRosterFragmentAnchor(index(0,0,partsA.length),input.units),raw('fa-a',textA));assert.deepEqual(helper.restoreSceneRosterFragmentAnchor(index(1,0,2),input.units),raw('fa-b',partsB.slice(0,2).join('')))
 const changed=structuredClone(input.units);changed[0].text='新值。';changed[0].end=changed[0].start+changed[0].text.length;assert.deepEqual(helper.restoreSceneRosterFragmentAnchor(index(0,0,1),changed),raw('fa-a','新值。'));assert.deepEqual(helper.restoreSceneRosterFragmentAnchor(index(0,0,2),[input.units[1],input.units[0]]),raw('fa-b',partsB.slice(0,2).join('')))
 const extra={...index(0,0,1),[privateKey]:undefined};assert.throws(()=>helper.restoreSceneRosterFragmentAnchor(extra,input.units));assert.throws(()=>helper.restoreSceneRosterFragmentAnchor(index(0,0,1),[{...input.units[0],text:'',end:input.units[0].start}]))
})

test('FA03: only new-roster units change representation and all fragments plus metadata count in the original budget',async t=>{
 const r=request(),before=structuredClone(r),payload=serializeImportAiPayload(r),sent=JSON.parse(payload)
 for(const [i,u]of r.units.entries()){const {text,...metadata}=u;const shown=sent.units[i].fragments.map(({ref,...fragment}:{ref:string;index:number;text:string})=>{assert.match(ref,/^ef[0-9a-f]{16}$/u);return fragment});assert.deepEqual({...sent.units[i],fragments:shown},{...metadata,unitIndex:i,fragments:[partsA,partsB][i].map((text,index)=>({index,text}))});assert.equal(Object.hasOwn(sent.units[i],'text'),false);assert.equal(sent.units[i].fragments.map((fragment:{text:string})=>fragment.text).join(''),text)}
 assert.deepEqual(r,before);const prompt=importAiPrompt(r,payload);for(const field of ['unitIndex','fromFragment','toFragment','primaryMentionIndex'])assert.ok(prompt.includes(field));assert.ok(prompt.includes('[fromFragment,toFragment)'))
 for(const role of ['text','review'] as const)await t.test(role+' includes every fragment and index at the exact payload limit',async()=>{const input=request(),budget=importRequestBudget(input,input.models[role]!);input.instruction='x'.repeat(budget.characters*3-serializeImportAiPayload({...input,instruction:''}).length);assert.equal(serializeImportAiPayload(input).length,budget.characters*3);assert.equal((await bridge(input,[wire()],[],role)).sceneRosterRecords!.length,2);input.instruction+='x';const prompts:string[]=[];await assert.rejects(bridge(input,[wire()],prompts,role),/预算/u);assert.equal(prompts.length,0)})
 await t.test('non-roster scopes retain their existing complete unit representation',()=>{for(const legacy of [{...r,sceneIdentity:undefined},{...r,kind:'character' as const,sceneIdentity:undefined},{...r,phase:'review' as const,intent:undefined,kind:undefined,selectedTargets:['scene' as const,'character' as const],sceneIdentity:undefined}]){const sent=JSON.parse(serializeImportAiPayload(legacy));assert.deepEqual(sent.units,legacy.units);assert.ok(sent.units.every((unit:ImportUnit)=>!Object.hasOwn(unit,'fragments')&&!Object.hasOwn(unit,'unitIndex')))}const exactSceneReview={...r,phase:'review' as const,intent:undefined,kind:undefined,selectedTargets:['scene' as const],sceneIdentity:undefined};assert.deepEqual(JSON.parse(serializeImportAiPayload(exactSceneReview)).units,r.units.map((unit,unitIndex)=>({...unit,unitIndex})),'the previous exact-scene review unitIndex protocol remains unchanged')})
})
