import assert from 'node:assert/strict'
import {test} from 'node:test'
import {createHash} from 'node:crypto'
import type {JSONSchema7} from '@ai-sdk/provider'
import {createStructuredSceneContract,generateImportAiJson,runImportAi} from '../../desktop/service/novel-import-ai'
import {importFactFields} from '../../desktop/core/novel-import-semantics'
import {serializeImportAiPayload,assertImportPayloadBudget,assertImportFixedPromptReserve,IMPORT_JSON_WRAPPER_RESERVE_BYTES} from '../../desktop/core/novel-import-ai-payload'
import {importRequestBudget} from '../../desktop/core/novel-import-budget-policy'
import type {ImportAiRequest,ImportAiResult} from '../../desktop/shared/novel-import'
import type {PublicModel} from '../../desktop/core/settings'
import type {ResolvedModel} from '../../src/lib/ai/provider'
import {legacySceneFixture,rosterAi,toImportScene} from '../helpers/novel-import-wizard-fixture'

const fields=['coordinates','reliability','attribution','temporalScope','exteriorDescription','interiorDescription','backstory','entryMethod'] as const
const controls=['entityType','parentId','characterId','sceneId','itemId']
const pub:PublicModel={id:'00000000-0000-4000-8000-000000000092',name:'合成说明模型',provider:'deepseek',protocol:'openai',endpoint:'https://api.deepseek.com',modelId:'deepseek-flash',kind:'TEXT',enabled:true,authRevision:1,contextWindow:1048576,keyMask:'synthetic',thinkingLevels:[],defaultThinking:'none'}
const one='合成城的合成场景内有铜门，合成人物在门旁拿着钥匙。',two='合成场景有完整的第二处证据，保留所有场景资料。'
const request:ImportAiRequest={semanticVersion:1,operationId:'wg-synthetic-operation',phase:'analyze',intent:'entity',kind:'scene',entityTarget:{id:'wg-scene',aliases:['合成小室'],evidenceOptions:[{unitId:'wg-one',quote:one},{unitId:'wg-two',quote:two}]},entities:[{id:'wg-parent',kind:'scene',name:'合成城',entityType:'PLACE'},{id:'wg-scene',kind:'scene',name:'合成场景',entityType:'PLACE',parentId:'wg-parent'},{id:'wg-character',kind:'character',name:'合成人物'},{id:'wg-item',kind:'item',name:'钥匙'}],artifacts:[],units:[{id:'wg-one',fileId:'synthetic-file',start:0,end:one.length,text:one,kind:'body'},{id:'wg-two',fileId:'synthetic-file',start:one.length,end:one.length+two.length,text:two,kind:'body'}],workingRevision:0,instruction:'仅为合成资料，保留完整原文。',models:{text:pub}}
const facts={coordinates:'完整合成方位😀',reliability:'人物推测',attribution:'合成人物的有据推测𠀀',temporalScope:'当前片段\r\n保留排版',exteriorDescription:'外观首'+ '完整外部资料😀'.repeat(200)+'外观尾',interiorDescription:'内观首'+ '完整内部资料𠀀'.repeat(200)+'内观尾',backstory:'背景首'+ '完整背景资料😀'.repeat(200)+'背景尾',entryMethod:'进入首'+ '完整进入资料𠀀'.repeat(200)+'进入尾'}
const wire={text:'完整场景正文首😀'+ '不得截断正文𠀀'.repeat(200)+'完整正文尾',facts,references:{characterIndex:0,sceneIndex:0,itemIndex:0},primaryEvidence:{optionIndex:0},additionalEvidence:[{optionIndex:1}]}
const context={userId:'synthetic-guidance-user',resolvedModel:{} as ResolvedModel,structuredScene:true}
const secretKey='WG-EXTRA-KEY-SYNTHETIC-SECRET',secretValue='WG-EXTRA-VALUE-SYNTHETIC-SECRET'
const generated=(value:unknown)=>({text:JSON.stringify(value),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'})
const promptOf=(opts:Parameters<NonNullable<Parameters<typeof generateImportAiJson>[4]>['generateText']>[0])=>'prompt'in opts?opts.prompt:''
function instruction(message:string){
 assert.ok(message.length<=250,'all fixed facts guidance fits the unchanged feedback cap')
 for(const field of fields)assert.ok(message.includes(field),'complete eight-field name: '+field)
 assert.ok(message.includes('facts')&&/只|仅/u.test(message),'the eight-field collection stays closed')
 assert.ok(message.includes('字符串')&&message.includes('空字符串'),'string values and unknown representation are explicit')
 assert.ok(message.includes('entityType')&&message.includes('parentId')&&message.includes('应用')&&message.includes('references')&&message.includes('text'),'application controls, typed refs and other grounded description have distinct homes')
 const factNames=importFactFields('scene',2).filter(field=>!controls.includes(field));assert.deepEqual(factNames,[...fields]);assert.equal(factNames.length,8,'the instruction must not promote all thirteen canonical fields into wire facts')
}
function factIssue(value:unknown){const parsed=createStructuredSceneContract(request).wireSchema.safeParse(value);assert.ok(!parsed.success,'bad facts must truly fail before correction');const issue=parsed.error.issues.find(issue=>issue.path.join('.')==='facts');assert.ok(issue,'strict facts issue is required');return issue}

test('WG01: actual JSON bridge corrects an extra facts key with complete fixed safe eight-field guidance',async()=>{
 const before=structuredClone(request),bad={...wire,facts:{...facts,[secretKey]:secretValue}},badBefore=structuredClone(bad),validBefore=structuredClone(wire),issue=factIssue(bad),prompts:string[]=[];let assertions=0
 assert.equal(issue.code,'unrecognized_keys')
 const actual=await runImportAi(request,new AbortController().signal,{resolve:async()=>pub,assert:async()=>{assertions++},generate:async(r,_m,signal,prompt)=>generateImportAiJson(r,context,signal,prompt,{generateText:async opts=>{
  prompts.push(promptOf(opts))
  // Predetermined bad/good sequence exercises validation and the existing
  // correction. It makes no claim about a provider obeying the new wording.
  return generated(prompts.length===1?bad:wire)
 }})})
 assert.deepEqual(actual,createStructuredSceneContract(request).wireSchema.parse(wire));assert.equal(prompts.length,2);assert.equal(assertions,2);assert.ok(prompts[1].startsWith(prompts[0]));const feedback=prompts[1].slice(prompts[0].length)
 assert.ok(feedback.includes('facts: '));instruction(issue.message);assert.ok(feedback.includes(issue.message),'actual second prompt retains the full untruncated fixed message')
 for(const forbidden of [secretKey,secretValue,one,two,request.entityTarget!.id,'wg-parent','wg-character','wg-item',request.instruction!,wire.text,facts.backstory,pub.endpoint])assert.ok(!feedback.includes(forbidden),'correction cannot echo source, IDs, output or unknown keys')
 const c=createStructuredSceneContract(request);assert.ok(c.prompt.includes(issue.message),'the same fixed eight-field message appears in the native prompt');assert.ok(Buffer.byteLength(prompts[1])-Buffer.byteLength(c.prompt)<=IMPORT_JSON_WRAPPER_RESERVE_BYTES)
 assert.deepEqual(request,before);assert.deepEqual(bad,badBefore);assert.deepEqual(wire,validBefore)
})

test('WG02: persistent extra facts and one wrong type retain the actual bounded rejection',async t=>{
 const variants:{name:string;bad:(value:typeof wire)=>unknown}[]=[
  {name:'arbitrary extra key',bad:value=>({...value,facts:{...value.facts,[secretKey]:secretValue}})},
  {name:'invalid string type',bad:value=>({...value,facts:{...value.facts,entryMethod:{[secretKey]:secretValue}}})}
 ]
 for(const variant of variants)await t.test(variant.name+' retains the actual controller two-request/four-generation limit',async()=>{
  const f=await legacySceneFixture(undefined,rosterAi(),{models:{text:pub,review:{...pub,id:'00000000-0000-4000-8000-000000000093'}}}),base=f.handler(),requests=new Map<string,number>(),generations=new Map<string,number>();let target:string|undefined
  f.setAi(async r=>{if(r.intent!=='entity')return base(r);const id=r.entityTarget!.id;target??=id;requests.set(id,(requests.get(id)??0)+1)
   const value={...wire,facts:{...facts,reliability:'客观事实',attribution:''},references:{characterIndex:-1,sceneIndex:-1,itemIndex:-1},primaryEvidence:{optionIndex:0},additionalEvidence:[]}
   return runImportAi(r,new AbortController().signal,{resolve:async()=>pub,assert:async()=>{},generate:async(input,_m,signal,prompt)=>generateImportAiJson(input,context,signal,prompt,{generateText:async opts=>{generations.set(id,(generations.get(id)??0)+1);const fixed=promptOf(opts),at=fixed.indexOf('上一次输出未通过结构校验');if(at!==-1)for(const secret of [secretKey,secretValue])assert.ok(!fixed.slice(at).includes(secret));return generated(id===target?variant.bad(value):value)}})})
  })
  try{await toImportScene(f);const view=await f.settle(),saved=await f.journal();assert.ok(target);assert.equal(requests.get(target),2);assert.equal(generations.get(target),4);assert.equal(view.wizard!.tasks.find(task=>task.candidateId===target)!.state,'failed');assert.ok(!saved.artifacts.some(a=>a.id===target),'invalid facts never become a partially accepted artifact');assert.deepEqual(saved.wizard!.skipped,[]);assert.deepEqual(saved.wizard!.dropped,[])}finally{await f.dispose()}
 })
})

function expectedSchema():JSONSchema7{
 const properties=Object.fromEntries(fields.map(field=>[field,{type:'string'}])),branch=(reliability:string[],attribution=false)=>({type:'object',properties:{...properties,reliability:{type:'string',enum:reliability},...(attribution?{attribution:{type:'string',pattern:'\\S'}}:{})},required:[...fields],additionalProperties:false}),option={type:'object',properties:{optionIndex:{type:'integer',minimum:0,maximum:1}},required:['optionIndex'],additionalProperties:false}
 return{type:'object',properties:{text:{type:'string',pattern:'\\S'},facts:{anyOf:[branch(['','客观事实']),branch(['角色有限事实','人物推测','可能不可靠'],true)]},references:{type:'object',properties:{characterIndex:{type:'integer',minimum:-1,maximum:0},sceneIndex:{type:'integer',minimum:-1,maximum:1},itemIndex:{type:'integer',minimum:-1,maximum:0}},required:['characterIndex','sceneIndex','itemIndex'],additionalProperties:false},primaryEvidence:option,additionalEvidence:{type:'array',items:option}},required:['text','facts','references','primaryEvidence','additionalEvidence'],additionalProperties:false} as JSONSchema7
}
test('WG03: payload and server grammar keep original bytes after only the text annotation is removed; complete guidance counts in budgets',async t=>{
 const c=createStructuredSceneContract(request),expected=JSON.parse(serializeImportAiPayload(request));expected.entities=request.entities!.map((entry,i)=>({...entry,referenceIndex:i===1?1:0}))
 const grammar=structuredClone(c.jsonSchema),text=grammar.properties?.text;assert.ok(text&&typeof text==='object');assert.equal(typeof text.description,'string');delete text.description
 assert.equal(c.payload,JSON.stringify(expected),'fixed guidance and the text annotation preserve every source, target, option and catalog value');assert.deepEqual(grammar,expectedSchema(),'remove only properties.text.description; the original strict eight-field grammar remains exact');assert.deepEqual(JSON.parse(c.payload).units,request.units)
 const hash=(text:string)=>createHash('sha256').update(text).digest('hex');assert.equal(hash(c.payload),'19ffb8999d7e722f5375a19c79bd462fa740b8dd6f085366f05ac698421e4fb6');assert.equal(hash(JSON.stringify(grammar)),'50e3f7d1effaaaff725c58c814ac9914ccba9d502769b7343d0366e4c062aa34');t.diagnostic(JSON.stringify({payloadHash:hash(c.payload),schemaHash:hash(JSON.stringify(grammar))}))
 const issue=factIssue({...wire,facts:{...facts,[secretKey]:secretValue}});instruction(issue.message);assert.ok(c.prompt.includes(issue.message));assertImportFixedPromptReserve(c.prompt+JSON.stringify(c.jsonSchema),c.payload)
 const required=Buffer.byteLength(c.prompt+JSON.stringify(c.jsonSchema),'utf8')+IMPORT_JSON_WRAPPER_RESERVE_BYTES+32768
 for(const [role,offset]of [['review',-1],['review',0]] as const)await t.test(role+' headroom '+offset,async()=>{
  const r=structuredClone(request);r.models[role]={...pub,...(role==='review'?{id:'00000000-0000-4000-8000-000000000093'}:{}),contextWindow:required+offset};if(role==='review')r.models.text={...pub,provider:'custom',modelId:'unrelated',endpoint:'https://unrelated.invalid',contextWindow:1048576}
  const before=structuredClone(r),contract=createStructuredSceneContract(r),budget=importRequestBudget(r,r.models[role]!);assertImportPayloadBudget(r,contract.payload+JSON.stringify(contract.jsonSchema),budget.characters,budget.maxUnits);let calls=0
  const actual=await generateImportAiJson(r,{...context,role},new AbortController().signal,'unused',{generateText:async opts=>{calls++;assert.equal(opts.role,role);assert.equal(opts.maxOutputTokens,offset<0?undefined:32768);assert.ok(promptOf(opts).startsWith(contract.prompt));assert.deepEqual(opts.jsonOutputSchema,contract.jsonSchema);return generated(wire)}})
  assert.equal(calls,1);assert.deepEqual(actual,contract.wireSchema.parse(wire));assert.deepEqual(r,before)
 })
 await t.test('all payload and schema still count before generation without trimming',async()=>{
  const r=structuredClone(request),budget=importRequestBudget(r,pub),beforePayload=serializeImportAiPayload(r);r.instruction+='x'.repeat(budget.characters*3-beforePayload.length-100);assertImportPayloadBudget(r,serializeImportAiPayload(r),budget.characters,budget.maxUnits);const before=structuredClone(r);let calls=0
  await assert.rejects(generateImportAiJson(r,context,new AbortController().signal,'unused',{generateText:async()=>{calls++;return generated(wire)}}),/预算/u);assert.equal(calls,0);assert.deepEqual(r,before)
 })
})
