import assert from 'node:assert/strict'
import {test} from 'node:test'
import {bridge,request,good,bad,planOf} from '../helpers/novel-import-claim-patch-fixture'
import {boundPlanOf} from '../helpers/novel-import-bound-decisions-fixture'
import {assertBoundNativeShape} from '../helpers/novel-import-bound-native-shape-fixture'
import {sceneRosterGenerationSchema} from '../../desktop/service/novel-import-ai'
import {serializeImportAiPayload,IMPORT_JSON_WRAPPER_RESERVE_BYTES} from '../../desktop/core/novel-import-ai-payload'
import {IMPORT_FIXED_PROMPT_RESERVE_BYTES,importRequestBudget} from '../../desktop/core/novel-import-budget-policy'
import type {generateText} from '../../src/lib/ai/generate'

type Options=Parameters<typeof generateText>[0]
const frames=(prompt:string)=>[...prompt.matchAll(/<previous-scene-roster-output>(.*?)<\/previous-scene-roster-output>/gsu)].map(match=>JSON.parse(match[1]) as {format:string;value:unknown})
function promptOf(options:Options){assert.ok('prompt'in options);return options.prompt}
function schemaOf(options:Options){assert.ok(options.jsonOutputSchema);return options.jsonOutputSchema}
function capacityRequest(capacity:number){const r=structuredClone(request());for(const role of ['text','review']as const)r.models[role]={...r.models[role]!,contextWindow:capacity};return r}
function assertMaterials(options:Options,r:ReturnType<typeof request>,first:unknown,current?:unknown){
 const prompt=promptOf(options),plan=planOf(prompt)
 assert.ok(prompt.includes(serializeImportAiPayload(r)),'the complete original source payload remains in the actual SDK prompt')
 assert.ok(plan.rows.some(row=>row.patch&&row.patch.claims.length>0),'the full claim plan is included, not only legacy replacement choices')
 assert.ok(plan.choices.length>0)
 assert.ok(frames(prompt).some(frame=>frame.format==='json'&&JSON.stringify(frame.value)===JSON.stringify(first)),'the complete frozen original draft is present')
 if(current!==undefined)assert.ok(frames(prompt).some(frame=>frame.format==='json'&&JSON.stringify(frame.value)===JSON.stringify(current)),'the complete current failed patch reply is present')
 assertBoundNativeShape(schemaOf(options),boundPlanOf(prompt))

}

test('CP-B01: second and later claim-patch prompts fit actual UTF8 plus native schema at N and stop before the next SDK call at N-1',async t=>{
 for(const target of [2,3])await t.test('generation '+target,async()=>{
  const run=async(r:ReturnType<typeof request>,options:Options[])=>{
   let failed:unknown
   const result=await bridge(bad(),(reply,plan)=>{
    if(options.length<target){const invalid=structuredClone(reply),unknown='cf'+'0'.repeat(16),mention=plan.rows.flatMap(row=>row.patch?.claims??[]).find(claim=>claim.kind==='mention');assert.ok(mention);assert.ok(!plan.choices.some(choice=>choice.choiceRef===unknown));const decision=invalid.repairs[0].patch.claims.find(claim=>claim.claimRef===mention.claimRef);assert.ok(decision);decision.choiceRefs=Array.from({length:128},()=>unknown);failed=structuredClone(invalid);return invalid}
    return reply
   },{request:r,options})
   return{...result,failed}
  }
  const baselineOptions:Options[]=[],baseline=await run(capacityRequest(1048576),baselineOptions),actual=baselineOptions[target-1]
  assert.equal(baselineOptions.length,target);assert.equal(baseline.model.doStreamCalls.length,target)
  assertMaterials(actual,request(),bad(),target===3?baseline.failed:undefined)
  const required=Buffer.byteLength(promptOf(actual)+JSON.stringify(schemaOf(actual)),'utf8')+6000
  for(const previous of baselineOptions.slice(0,target-1))assert.ok(Buffer.byteLength(promptOf(previous)+JSON.stringify(schemaOf(previous)),'utf8')+6000<required,'the target generation, rather than an earlier larger prompt, is the exact binding capacity')
  assert.ok(Buffer.byteLength(promptOf(actual),'utf8')>promptOf(actual).length,'the boundary uses real Unicode UTF8 bytes')
  const exactOptions:Options[]=[],exact=await run(capacityRequest(required),exactOptions)
  assert.equal(exactOptions.length,target);assert.equal(exact.model.doStreamCalls.length,target);assert.equal(exact.usageRows.length,target)
  assert.deepEqual(exact.result,sceneRosterGenerationSchema(request()).parse(good()))
  assert.equal(promptOf(exactOptions[target-1]),promptOf(actual));assert.deepEqual(schemaOf(exactOptions[target-1]),schemaOf(actual))
  assert.equal(Buffer.byteLength(promptOf(exactOptions[target-1])+JSON.stringify(schemaOf(exactOptions[target-1])),'utf8')+6000,required)
  if(target===3)assert.deepEqual(planOf(promptOf(exactOptions[1])),planOf(promptOf(exactOptions[2])),'the same complete frozen claim/choice plan survives the retry')
  const tooSmallOptions:Options[]=[]
  await assert.rejects(run(capacityRequest(required-1),tooSmallOptions),/预算/u)
  assert.equal(tooSmallOptions.length,target-1,'no complete prepared or frozen form fits N-1, so the next SDK call is refused')
 })
})

test('CP-B02: the complete current failed patch plus frozen claims/choices hits fixed reserve N and rejects N+1 without clipping',async()=>{
 assert.equal(IMPORT_FIXED_PROMPT_RESERVE_BYTES,65536);assert.equal(IMPORT_JSON_WRAPPER_RESERVE_BYTES,16384)
 const run=async(padding:number,options:Options[])=>{
  let failed:unknown
  const result=await bridge(bad(),reply=>{if(options.length===2){failed={...reply,CP_BUDGET_UNTRUSTED_PADDING:'x'.repeat(padding)};return failed}return reply},{request:capacityRequest(1048576),options})
  return{...result,failed}
 }
 const baselineOptions:Options[]=[],baseline=await run(0,baselineOptions),base=baselineOptions[2],payload=serializeImportAiPayload(request())
 assert.equal(baselineOptions.length,3);assertMaterials(base,request(),bad(),baseline.failed)
 const used=Buffer.byteLength(promptOf(base),'utf8')-Buffer.byteLength(payload,'utf8')+IMPORT_JSON_WRAPPER_RESERVE_BYTES,room=IMPORT_FIXED_PROMPT_RESERVE_BYTES-used
 assert.ok(Number.isSafeInteger(room)&&room>0,'the complete prompt leaves measurable fixed reserve independently of the Native schema bucket')
 const exactOptions:Options[]=[],exact=await run(room,exactOptions)
 assert.equal(exactOptions.length,3);assert.equal(exact.model.doStreamCalls.length,3);assertMaterials(exactOptions[2],request(),bad(),exact.failed)
 assert.equal(Buffer.byteLength(promptOf(exactOptions[2]),'utf8')-Buffer.byteLength(payload,'utf8')+IMPORT_JSON_WRAPPER_RESERVE_BYTES,65536)
 assert.ok(Buffer.byteLength(JSON.stringify(schemaOf(exactOptions[2])),'utf8')<=65536,'the complete Native schema also fits its separate hard cap')
 assert.ok(Buffer.byteLength(promptOf(exactOptions[2])+JSON.stringify(schemaOf(exactOptions[2])),'utf8')+6000<=capacityRequest(1048576).models.text!.contextWindow,'the full prompt and schema remain within the unchanged model context')
 assert.deepEqual(exact.result,sceneRosterGenerationSchema(request()).parse(good()))
 const overOptions:Options[]=[]
 await assert.rejects(run(room+1,overOptions),/预算/u)
 assert.equal(overOptions.length,2,'a one-byte larger complete failed reply prevents generation three')
})

test('CP-B03: an initially oversized full source payload makes zero SDK calls and changes no source or draft',async()=>{
 const r=structuredClone(request()),first=bad(),budget=importRequestBudget(r,r.models.text!)
 r.instruction='x'.repeat(budget.characters*3)
 const before=structuredClone(r),draftBefore=structuredClone(first),options:Options[]=[]
 await assert.rejects(bridge(first,undefined,{request:r,options}),/预算/u)
 assert.equal(options.length,0);assert.deepEqual(r,before);assert.deepEqual(first,draftBefore)
})
