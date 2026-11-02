import assert from 'node:assert/strict'
import {test} from 'node:test'
import {generateImportAiJson,runImportAi} from '../../desktop/service/novel-import-ai'
import {serializeImportAiPayload,IMPORT_JSON_WRAPPER_RESERVE_BYTES} from '../../desktop/core/novel-import-ai-payload'
import {IMPORT_FIXED_PROMPT_RESERVE_BYTES,importBudgetProfile,importRequestBudget} from '../../desktop/core/novel-import-budget-policy'
import {explicitTargetedRosterReply} from '../helpers/novel-import-targeted-repair-fixture'
import {boundPlanOf} from '../helpers/novel-import-bound-decisions-fixture'
import type {ImportAiRequest,ImportModel} from '../../desktop/shared/novel-import'
import type {ResolvedModel} from '../../src/lib/ai/provider'
import {StructuredGenerationError} from '../../src/lib/ai/generate'

type Role='text'|'review'
type Plan={rows:{repairRef:string;slot:number}[];choices:{choiceRef:string;literals:string[]}[]}
const open='<scene-roster-targeted-repair>',close='</scene-roster-targeted-repair>',priorOpen='<previous-scene-roster-output>',priorClose='</previous-scene-roster-output>'
const east='东宅😀的甲室门已打开。\r\n',west='西宅的乙室窗已关闭。'
const model:ImportModel={id:'tr-budget-text',name:'合成预算模型',modelId:'synthetic',endpoint:'https://synthetic.invalid/v1',authRevision:1,contextWindow:1048576}
function input(v2=true):ImportAiRequest{return{semanticVersion:1,operationId:'synthetic-targeted-budget',phase:'analyze',intent:'roster',kind:'scene',sceneIdentity:{version:1,mode:'roster'},models:{text:{...model},review:{...model,id:'tr-budget-review'}},units:[east,west].map((text,i)=>({id:'budget-unit-'+i,fileId:'working',start:i*100,end:i*100+text.length,text,kind:'body'})),artifacts:[],workingRevision:0,...(v2?{executionBudget:{version:2,...importBudgetProfile(model.contextWindow,2)}}:{})}}
function first(padding=0){return{roster:[{mentions:[{literal:'甲室',evidence:{unitId:'budget-unit-0',quote:'SOURCE_MISMATCH_'+ 'x'.repeat(padding)}}],context:[],links:[]},{mentions:[{literal:'乙室',evidence:{unitId:'budget-unit-1',quote:west}}],context:[],links:[]}]}}
// An unknown original row field requires full replacement from the outset.
// A selection deck may otherwise fit by a lossless, shorter replacement deck.
function replacementFirst(padding=0){const value=first(padding);return{roster:[{...value.roster[0],budgetUnknown:true},value.roster[1]]}}
function block<T>(prompt:string,start:string,end:string):T{const a=prompt.indexOf(start),b=prompt.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,'complete application-owned data block is present');return JSON.parse(prompt.slice(a+start.length,b)) as T}
function replacement(prompt:string,units:ImportAiRequest['units']){const plan=block<Plan>(prompt,open,close);assert.ok(plan.rows.some(r=>r.slot===0));return explicitTargetedRosterReply(prompt,{roster:[{mentions:[{literal:'甲室',evidence:{unitId:'budget-unit-0',quote:east.slice(0,-2)}}],context:[],links:[]},{mentions:[{literal:'乙室',evidence:{unitId:'budget-unit-1',quote:west}}],context:[],links:[]}]},units)}
async function bridge(request:ImportAiRequest,bad:unknown,prompts:string[],options:{role?:Role;shortPadding?:number;rawText?:string}={}){
 const role=options.role??'text'
 return runImportAi(request,new AbortController().signal,{resolve:async selected=>request.models[selected]!,assert:async()=>{},generate:async(r,_m,signal,prompt)=>{
  // This shorter synthetic helper prompt is used only to reach the 16000
  // fallback boundary; the entire original payload and real repair remain.
  const actual=options.shortPadding===undefined?prompt:'只返回当前契约JSON。'+ 'x'.repeat(options.shortPadding)+'\n<novel-import-data>'+serializeImportAiPayload(r)+'</novel-import-data>'
  return generateImportAiJson(r,{userId:'synthetic-targeted-budget',resolvedModel:{} as ResolvedModel,role},signal,actual,{generateText:async opts=>{
   assert.ok(!Object.hasOwn(opts,'repair'));const p='prompt'in opts?opts.prompt:'';prompts.push(p)
   return{text:options.rawText??(prompts.length===1?JSON.stringify(bad):JSON.stringify(replacement(p,r.units))),promptTokens:1,completionTokens:1,cost:0,finishReason:'stop'}
  }})
 }},{role})
}
function fullPrior(prompt:string,bad:unknown){const prior=block<{format:string;value:unknown}>(prompt,priorOpen,priorClose);assert.equal(prior.format,'json');assert.deepEqual(prior.value,bad);assert.ok(block<Plan>(prompt,open,close).choices.length>0)}
function replacementPrior(prompt:string,bad:ReturnType<typeof replacementFirst>){fullPrior(prompt,bad);assert.equal('budgetUnknown'in bad.roster[0]&&bad.roster[0].budgetUnknown,true);const tasks=boundPlanOf(prompt).tasks;assert.ok(tasks.length>0);assert.ok(tasks.every(task=>task.kind==='replacement'));assert.deepEqual(tasks.map(task=>task.slot),[0])}

test('TR05-B1: complete prior and all choices hit the original fixed reserve at N and reject N+1',async t=>{
 assert.equal(IMPORT_FIXED_PROMPT_RESERVE_BYTES,65536);assert.equal(IMPORT_JSON_WRAPPER_RESERVE_BYTES,16384)
 for(const role of ['text','review']as const){
  const baseline:string[]=[],r=input();await bridge(r,replacementFirst(),baseline,{role});assert.equal(baseline.length,2);replacementPrior(baseline[1],replacementFirst())
  const payload=serializeImportAiPayload(r),used=Buffer.byteLength(baseline[1],'utf8')-Buffer.byteLength(payload,'utf8')+IMPORT_JSON_WRAPPER_RESERVE_BYTES,room=IMPORT_FIXED_PROMPT_RESERVE_BYTES-used;assert.ok(Number.isSafeInteger(room)&&room>0);assert.ok(Buffer.byteLength(baseline[1],'utf8')>baseline[1].length)
  for(const plus of [0,1])await t.test(role+' fixed reserve N+'+plus,async()=>{
   const request=input(),before=structuredClone(request),bad=replacementFirst(room+plus),badBefore=structuredClone(bad),prompts:string[]=[]
   if(!plus){const result=await bridge(request,bad,prompts,{role});assert.equal(prompts.length,2);replacementPrior(prompts[1],bad);assert.equal(Buffer.byteLength(prompts[1],'utf8')-Buffer.byteLength(serializeImportAiPayload(request),'utf8')+IMPORT_JSON_WRAPPER_RESERVE_BYTES,65536);assert.equal(result.sceneRosterRecords!.length,2)}
   else{await assert.rejects(bridge(request,bad,prompts,{role}),/完整纠错资料超过模型预算/u);assert.equal(prompts.length,1)}
   assert.deepEqual(request,before);assert.deepEqual(bad,badBefore)
  })
 }
})

test('TR05-B2: legacy capacity uses the actual role and full second-prompt UTF8 plus 6000',async t=>{
 const baseline:string[]=[];await bridge(input(false),replacementFirst(),baseline);replacementPrior(baseline[1],replacementFirst());const required=Buffer.byteLength(baseline[1],'utf8')+6000
 for(const role of ['text','review']as const)for(const offset of [0,-1])await t.test(role+' actual capacity '+offset,async()=>{
  const r=input(false);r.models[role]!.contextWindow=required+offset;const prompts:string[]=[]
  if(!offset){await bridge(r,replacementFirst(),prompts,{role});assert.equal(prompts.length,2);assert.equal(Buffer.byteLength(prompts[1],'utf8')+6000,r.models[role]!.contextWindow);replacementPrior(prompts[1],replacementFirst())}
  else{await assert.rejects(bridge(r,replacementFirst(),prompts,{role}),/完整纠错资料超过模型预算/u);assert.equal(prompts.length,1)}
 })
})

test('TR05-B3: zero or unknown legacy windows retain the existing 16000 fallback boundary',async t=>{
 const baseline:string[]=[];await bridge(input(false),replacementFirst(),baseline,{shortPadding:0});replacementPrior(baseline[1],replacementFirst());const room=16000-6000-Buffer.byteLength(baseline[1],'utf8');assert.ok(room>0,'the full-payload synthetic prompt reaches the real fallback boundary')
 for(const capacity of [0,undefined])for(const plus of [0,1])await t.test(String(capacity)+' fallback N+'+plus,async()=>{
  const r=input(false);if(capacity===undefined)delete (r.models.text as Partial<ImportModel>).contextWindow;else r.models.text!.contextWindow=capacity
  const prompts:string[]=[]
  if(!plus){await bridge(r,replacementFirst(),prompts,{shortPadding:room});assert.equal(prompts.length,2);assert.equal(Buffer.byteLength(prompts[1],'utf8')+6000,16000);replacementPrior(prompts[1],replacementFirst())}
  else{await assert.rejects(bridge(r,replacementFirst(),prompts,{shortPadding:room+1}),/完整纠错资料超过模型预算/u);assert.equal(prompts.length,1)}
 })
})

test('TR05-B4: persistent unparsed and extra-root stop failures exhaust four generations without a typed transaction',async t=>{
 for(const kind of ['non-json','root-control']as const)await t.test(kind,async()=>{
  const r=input(),before=structuredClone(r),prompts:string[]=[],bad={...first(),notFound:true}
  if(kind==='non-json'){await assert.rejects(bridge(r,bad,prompts,{rawText:'RAW_ONLY_PRIVATE_INVALID_OUTPUT'}),error=>error instanceof StructuredGenerationError&&error.kind==='invalid_json');assert.equal(prompts.length,4);for(const prompt of prompts.slice(1)){assert.ok(prompt.includes('RAW_ONLY_PRIVATE_INVALID_OUTPUT'));assert.ok(!prompt.includes('<scene-roster-targeted-repair>'))}}
  else{await assert.rejects(bridge(r,bad,prompts,{rawText:JSON.stringify(bad)}),error=>error instanceof StructuredGenerationError&&error.kind==='invalid_schema');assert.equal(prompts.length,4);for(const prompt of prompts.slice(1)){assert.ok(!prompt.includes('<scene-roster-targeted-repair>'));const previous=block<{format:string;value:unknown}>(prompt,priorOpen,priorClose);assert.equal(previous.format,'json');assert.deepEqual(previous.value,bad)}}
  assert.deepEqual(r,before)
 })
})

test('TR05-B5: an initially oversized complete payload makes no generation call',async()=>{
 const r=input(),budget=importRequestBudget(r,r.models.text!);r.instruction='x'.repeat(budget.characters*3);const before=structuredClone(r),prompts:string[]=[]
 await assert.rejects(bridge(r,first(),prompts),/预算/u);assert.equal(prompts.length,0);assert.deepEqual(r,before)
})
