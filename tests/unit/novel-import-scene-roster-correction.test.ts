import {staticRosterCorrection} from '../helpers/novel-import-targeted-repair-fixture'
import {controlledTargetedReply} from '../helpers/novel-import-negative-targeted-reply'
import assert from 'node:assert/strict'
import {test} from 'node:test'
import {z} from 'zod'
import {generateImportAiJson,importAiResponseSchema,runImportAi,sceneRosterGenerationSchema} from '../../desktop/service/novel-import-ai'
import {serializeImportAiPayload,importAiPrompt,assertImportFixedPromptReserve,IMPORT_JSON_WRAPPER_RESERVE_BYTES} from '../../desktop/core/novel-import-ai-payload'
import {IMPORT_FIXED_PROMPT_RESERVE_BYTES,importRequestBudget} from '../../desktop/core/novel-import-budget-policy'
import {sceneRosterRecordsSchema} from '../../desktop/shared/novel-import-scene-identity'
import {validateSceneRosterRecords} from '../../desktop/core/novel-import-scene-identity'
import {sceneRosterFragmentUnits} from '../../desktop/core/novel-import-scene-roster-fragments'
import {StructuredGenerationError} from '../../src/lib/ai/generate'
import type {ResolvedModel} from '../../src/lib/ai/provider'
import type {ImportAiRequest,ImportModel} from '../../desktop/shared/novel-import'

const privateKey='RC-RAW-ONLY-UNKNOWN-KEY',privateValue='RC-RAW-ONLY-SECRET-VALUE',privateId='RC-RAW-ONLY-UNIT-ID'
const first='东宅里的书房有蓝色墙壁。',alias='这间阅览间设有一张木桌。',second='西宅里的书房有红色墙壁。'
const full='完整合成定位资料😀\r\n'.repeat(60)+first+'\r\n'+alias
const model:ImportModel={id:'rc-text',name:'合成文本模型',modelId:'synthetic',endpoint:'https://synthetic.invalid/v1',authRevision:1,contextWindow:64000}
const review:ImportModel={...model,id:'rc-review',contextWindow:18000}
function request():ImportAiRequest{const other=second+'回到书房时门已关。';return{semanticVersion:1,operationId:'rc-op',phase:'analyze',intent:'roster',kind:'scene',sceneIdentity:{version:1,mode:'roster'},models:{text:{...model},review:{...review}},units:[{id:'rc-current-a',fileId:'working',start:0,end:full.length,text:full,kind:'body'},{id:'rc-current-b',fileId:'working',start:full.length,end:full.length+other.length,text:other,kind:'body'}],artifacts:[],workingRevision:0}}
const anchor=(unitId:string,quote:string)=>({unitId,quote})
function good(){return{roster:[{name:'书房',aliases:['阅览间'],mentions:[{literal:'书房',evidence:anchor('rc-current-a',full)},{literal:'阅览间',evidence:anchor('rc-current-a',alias)}],context:[{label:'东宅',evidence:[anchor('rc-current-a',full)]}],links:[{targetIndex:1,relation:'different-place' as const,evidence:[anchor('rc-current-a',first),anchor('rc-current-b',second)]}]},{name:'书房',aliases:[],mentions:[{literal:'书房',evidence:anchor('rc-current-b',second)}],context:[{label:'西宅',evidence:[anchor('rc-current-b',second)]}],links:[]}]}}
type Wire=ReturnType<typeof good>
const generated=(raw:unknown)=>({text:JSON.stringify(raw),promptTokens:12,completionTokens:34,cost:0,finishReason:'stop'})
async function bridge(r:ImportAiRequest,sequence:unknown[],prompts:string[]=[],role:'text'|'review'='text'){
 return runImportAi(r,new AbortController().signal,{resolve:async actual=>{assert.equal(actual,role);return r.models[actual]!},assert:async()=>{},generate:async(input,_m,signal,prompt)=>generateImportAiJson(input,{userId:'rc-synthetic',resolvedModel:{} as ResolvedModel,role},signal,prompt,{generateText:async options=>{assert.equal(options.role,role);assert.equal(options.maxOutputTokens,undefined);assert.equal(options.jsonOutputSchema,undefined);prompts.push('prompt'in options?options.prompt:'');return generated(prompts.length>1?controlledTargetedReply(prompts[prompts.length-1],sequence[Math.min(prompts.length-1,sequence.length-1)],input.units,sequence.length===1):sequence[Math.min(prompts.length-1,sequence.length-1)])}})},{role})
}
const correction=(prompts:string[],expectedGenerations=2)=>{assert.equal(prompts.length,expectedGenerations);assert.ok(prompts[1].startsWith(prompts[0]));const added=staticRosterCorrection(prompts[1].slice(prompts[0].length));for(const secret of [privateKey,privateValue,privateId,full,first,alias,second,'rc-current-a','rc-current-b'])assert.ok(!added.includes(secret),'feedback is static and does not echo '+secret.slice(0,12));assert.ok(Buffer.byteLength(added,'utf8')<=IMPORT_JSON_WRAPPER_RESERVE_BYTES);return added}
const canonical=(wire:Wire)=>({roster:wire.roster.map(row=>({name:row.name,aliases:row.aliases,evidence:row.mentions[0].evidence})),sceneRosterRecords:wire.roster})

test('RC01: the real JSON bridge identifies shape and original exact-anchor failures before a predetermined complete correction',async t=>{
 const variants:[string,unknown,string,RegExp][]=[]
 variants.push(['root array',good().roster,'',/JSON对象.*\{"roster":\[\]\}/u],['root string',privateValue,'',/JSON对象.*\{"roster":\[\]\}/u])
 const change=(label:string,path:string,meaning:RegExp,mutate:(wire:Wire)=>void)=>{const bad=good();mutate(bad);variants.push([label,bad,path,meaning])}
 change('context is a category label','roster.0.context.0.label',/label.*每条.*quote/u,bad=>{bad.roster[0].context[0].label='位置'})
 change('each alias needs its own original mention','roster.0.aliases.0',/alias.*mention|别名.*提及/u,bad=>{bad.roster[0].aliases=[privateValue]})
 change('an unlisted literal is not an inferred alias','roster.0.mentions.0.literal',/literal.*name.*alias/u,bad=>{bad.roster[0].mentions[0].literal='东宅'})
 change('an existing other unit cannot rebind the quote','roster.0.mentions.0.evidence',/quote.*声明.*unit|声明.*unit.*quote/u,bad=>{bad.roster[0].mentions[0].evidence.unitId='rc-current-b'})
 change('literal must be unique inside its own quote','roster.1.mentions.0.literal',/literal.*唯一/u,bad=>{bad.roster[1].mentions[0].evidence.quote=request().units[1].text})
 change('links reference another current row','roster.0.links.0.targetIndex',/targetIndex.*本回复.*另/u,bad=>{bad.roster[0].links[0].targetIndex=0})
 for(const [label,bad,path,meaning]of variants)await t.test(label,async()=>{
  const input=request(),valid=good(),before=structuredClone(input),badBefore=structuredClone(bad),prompts:string[]=[]
  if(label.startsWith('root ')){const parsed=sceneRosterGenerationSchema(input).safeParse(bad);assert.equal(parsed.success,false);if(!parsed.success)assert.match(parsed.error.issues[0].message,meaning);await assert.rejects(bridge(input,[bad,valid],prompts),/无法定位/u);assert.equal(prompts.length,1);assert.deepEqual(input,before);return}
  const result=await bridge(input,[bad,valid],prompts)
  assert.deepEqual(result,canonical(valid));assert.deepEqual(input,before);assert.deepEqual(bad,badBefore)
  const added=correction(prompts);assert.ok(added.includes(path+': '),'the actual second prompt identifies '+path);assert.match(added,meaning)
  assert.ok(full.length>512);assert.equal(importAiResponseSchema(input).safeParse(result).success,true);validateSceneRosterRecords(result.sceneRosterRecords!,input.units)
 })
})

test('RC02: persistent invalid raw stays rejected, bounded and private without dropping good rows or evidence',async t=>{
 await t.test('shape diagnostics expose only known paths and at most six fixed messages',async()=>{
  const bad={roster:Array.from({length:3},()=>({name:{[privateKey]:privateValue},aliases:privateValue,mentions:privateValue,context:privateValue,links:privateValue,[privateKey]:privateValue}))},before=structuredClone(bad),prompts:string[]=[]
  let failure:unknown;try{await bridge(request(),[bad],prompts)}catch(error){failure=error}
  assert.ok(failure instanceof StructuredGenerationError);assert.equal(failure.kind,'invalid_schema');assert.equal(failure.feedback.length,1);assert.deepEqual(failure.invalidFields,['repairs'])
  for(const item of failure.feedback)assert.ok(item.slice(item.indexOf(': ')+2).length<=250)
  const initial=correction(prompts,4);assert.equal((initial.match(/roster\.\d+\.(?:name|aliases|mentions|context|links): /gu)??[]).length,6,'the first-stage six safe field diagnostics are still present as repair background');assert.deepEqual(bad,before)
 })
 await t.test('a valid row or first evidence cannot hide a later invalid evidence',async()=>{
  const bad=good();bad.roster[1].context[0].evidence.push(anchor(privateId,privateValue));const before=structuredClone(bad),prompts:string[]=[]
  await assert.rejects(bridge(request(),[bad],prompts),error=>error instanceof StructuredGenerationError&&error.kind==='invalid_schema'&&error.invalidFields.includes('repairs'))
  assert.ok(correction(prompts,4).includes('roster.1.context.0.evidence.1: '));assert.deepEqual(bad,before)
 })
 await t.test('own undefined extras are rejected in direct schemas before JSON can erase them',()=>{
  const raw=good(),compiled=canonical(raw),input=request();assert.equal(importAiResponseSchema(input).safeParse({...compiled,[privateKey]:undefined}).success,false)
  const extra={...raw.roster[0],[privateKey]:undefined};assert.equal(sceneRosterRecordsSchema.safeParse([extra]).success,false)
  assert.throws(()=>validateSceneRosterRecords([extra],input.units))
 })
 await t.test('full capacity validation still rejects and an oversized complete prior stops before a second generation',async()=>{
  const bad=good();bad.roster[0].mentions=Array.from({length:25001},()=>({literal:'书房',evidence:anchor('rc-current-a',first)}));bad.roster[1].mentions=Array.from({length:25001},()=>structuredClone(bad.roster[1].mentions[0]));bad.roster[0].aliases=[]
  assert.equal(sceneRosterRecordsSchema.safeParse(bad.roster).success,true);assert.throws(()=>validateSceneRosterRecords(bad.roster,request().units));const prompts:string[]=[]
  await assert.rejects(bridge(request(),[bad],prompts),/纠错.*预算/u);assert.equal(prompts.length,1)
 })
})

test('RC03: the explicit JSON prompt preserves full fragment material and canonical grammar within the original reserves',async t=>{
 const input=request(),before=structuredClone(input),payload=serializeImportAiPayload(input),prompt=importAiPrompt(input,payload)
 assert.deepEqual(JSON.parse(payload),{phase:'analyze',kind:'scene',units:sceneRosterFragmentUnits(input.units),artifacts:[],entities:[],workingRevision:0,semanticVersion:1,intent:'roster',sceneIdentity:{version:1,mode:'roster'}})
 // 336 changes only this new-roster input representation. Its full original
 // text and every unrelated unit field remain exact; other scopes stay raw.
 for(const [i,shown]of sceneRosterFragmentUnits(input.units).entries()){const {fragments,unitIndex,...metadata}=shown,{text,...original}=input.units[i];assert.equal(unitIndex,i);assert.equal(fragments.map(fragment=>fragment.text).join(''),text);assert.deepEqual(metadata,original)}
 assert.ok(prompt.includes('{"roster":[]}'));assert.ok(prompt.includes('"mentions":[{"literal":'));assert.match(prompt,/context.label.*每条.*quote/u);assert.match(prompt,/类别标签/u);assert.match(prompt,/显示.*应用/u)
 assertImportFixedPromptReserve(prompt,payload);assert.equal(IMPORT_JSON_WRAPPER_RESERVE_BYTES,16384)
 const fixed=Buffer.byteLength(prompt,'utf8')-Buffer.byteLength(payload,'utf8'),remaining=IMPORT_FIXED_PROMPT_RESERVE_BYTES-IMPORT_JSON_WRAPPER_RESERVE_BYTES-fixed
 assert.ok(remaining>=0);assertImportFixedPromptReserve(prompt+'x'.repeat(remaining),payload);assert.throws(()=>assertImportFixedPromptReserve(prompt+'x'.repeat(remaining+1),payload),/预算/u)
 const grammar=z.strictObject({roster:sceneRosterRecordsSchema.max(2000)});assert.equal(grammar.safeParse(good()).success,true);assert.equal(grammar.safeParse({...good(),[privateKey]:undefined}).success,false);assert.equal(grammar.safeParse({roster:[{...good().roster[0],mentions:[]}]}).success,false)
 for(const role of ['text','review'] as const)await t.test('the actual '+role+' budget includes the complete payload',async()=>{
  const r=request(),budget=importRequestBudget(r,r.models[role]!);r.instruction='x'.repeat(budget.characters*3-serializeImportAiPayload({...r,instruction:''}).length)
  assert.equal(serializeImportAiPayload(r).length,budget.characters*3);assert.deepEqual(await bridge(r,[good()],[],role),canonical(good()));r.instruction+='x';const prompts:string[]=[]
  await assert.rejects(bridge(r,[good()],prompts,role),/预算/u);assert.equal(prompts.length,0)
 })
 assert.deepEqual(input,before)
})
