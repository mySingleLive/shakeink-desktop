import assert from 'node:assert/strict'
import {test} from 'node:test'
import {bridge,request,bad,good,planOf} from '../helpers/novel-import-claim-patch-fixture'
import {boundPlanOf,boundReply,boundReplacement,bridgeBound} from '../helpers/novel-import-bound-decisions-fixture'
import {sceneRosterGenerationSchema} from '../../desktop/service/novel-import-ai'
import {serializeImportAiPayload,IMPORT_JSON_WRAPPER_RESERVE_BYTES} from '../../desktop/core/novel-import-ai-payload'
import {IMPORT_FIXED_PROMPT_RESERVE_BYTES,importRequestBudget} from '../../desktop/core/novel-import-budget-policy'
import type {generateText} from '../../src/lib/ai/generate'

type Options=Parameters<typeof generateText>[0]
const frames=(prompt:string)=>[...prompt.matchAll(/<previous-scene-roster-output>(.*?)<\/previous-scene-roster-output>/gsu)].map(match=>JSON.parse(match[1]) as {format:string;value:unknown})
function promptOf(option:Options){assert.ok('prompt'in option);return option.prompt}
function schemaOf(option:Options){assert.ok(option.jsonOutputSchema);return option.jsonOutputSchema}
function sizedRequest(capacity:number){const r=structuredClone(request());for(const role of ['text','review']as const)r.models[role]={...r.models[role]!,contextWindow:capacity};return r}
function deckOf(prompt:string,replacement=false){
 const deck=boundPlanOf(prompt),shared=planOf(prompt)
 if(replacement)assert.ok(deck.tasks.length>0&&deck.tasks.every(task=>task.kind==='replacement'),'this boundary fixture is already the final full-replacement representation')
 else assert.ok(deck.tasks.length===1&&deck.tasks[0].kind==='claims','fresh complete patches use the primary claims representation')
 assert.deepEqual(deck.choices,shared.choices,'the complete shared choice directory is preserved')
 assert.ok(shared.rows.every(row=>Object.hasOwn(row,'keep')),'all original keep records remain')
 return{deck,shared}
}
function complete(option:Options,r:ReturnType<typeof request>,first:unknown,current?:unknown,replacement=false){
 const prompt=promptOf(option),data=deckOf(prompt,replacement)
 assert.ok(prompt.includes(serializeImportAiPayload(r)),'the complete source payload remains in the actual SDK prompt')
 assert.ok(frames(prompt).some(frame=>frame.format==='json'&&JSON.stringify(frame.value)===JSON.stringify(first)),'the complete frozen draft remains')
 if(current!==undefined)assert.ok(frames(prompt).some(frame=>frame.format==='json'&&JSON.stringify(frame.value)===JSON.stringify(current)),'the complete current failed answer remains')
 assert.deepEqual(schemaOf(option).required,['answers'],'capacity uses the real active native answers schema')
 assert.equal(option.maxOutputTokens,undefined)
 return data
}

test('BD-budget01: final full-replacement second/third/fourth prompts and schemas meet N and reject N-1 without further representation fallback',async t=>{
 for(const target of [2,3,4])await t.test('generation '+target,async()=>{
  const first={roster:[{...bad().roster[0],unknown:'BD_BUDGET_FINAL_REPLACEMENT'},good().roster[1]]}
  const run=async(r:ReturnType<typeof request>,options:Options[])=>{
   const failed:unknown[]=[]
   const result=await bridgeBound(first,({prompt,request:actual})=>{
    deckOf(prompt,true)
    const answer={answers:[boundReplacement(prompt,good().roster[0],actual)]}
    assert.deepEqual(Object.keys(answer),['answers'])
    if(options.length===target)return answer
    // Every padding value is a safe, native integer. The deliberate extra
    // answers fail the bound count gate; their complete current text makes
    // this later generation the real capacity boundary, never an earlier one.
    const invalid={answers:[...answer.answers,...Array.from({length:256*(options.length-1)},()=>Number.MAX_SAFE_INTEGER)]}
    failed.push(structuredClone(invalid));return invalid
   },{request:r,options})
   return{...result,failed}
  }
  const baselineOptions:Options[]=[],baseline=await run(sizedRequest(1048576),baselineOptions),last=baselineOptions[target-1]
  assert.equal(baselineOptions.length,target);assert.equal(baseline.model.doStreamCalls.length,target)
  const original=complete(baselineOptions[1],request(),first,undefined,true),final=complete(last,request(),first,baseline.failed.at(-1),true)
  assert.deepEqual(final,original,'the frozen deck, all assignments, private-directory view and keep do not change on retry')
  const required=Buffer.byteLength(promptOf(last)+JSON.stringify(schemaOf(last)),'utf8')+6000
  assert.ok(Buffer.byteLength(promptOf(last),'utf8')>promptOf(last).length,'real Unicode UTF8 bytes are included')
  for(const earlier of baselineOptions.slice(0,target-1))assert.ok(Buffer.byteLength(promptOf(earlier)+JSON.stringify(schemaOf(earlier)),'utf8')+6000<required,'the tested generation is the maximum prompt so far')
  const exactOptions:Options[]=[],exact=await run(sizedRequest(required),exactOptions)
  assert.equal(exactOptions.length,target);assert.equal(exact.model.doStreamCalls.length,target);assert.equal(exact.usageRows.length,target)
  assert.equal(promptOf(exactOptions[target-1]),promptOf(last));assert.deepEqual(schemaOf(exactOptions[target-1]),schemaOf(last))
  assert.equal(Buffer.byteLength(promptOf(exactOptions[target-1])+JSON.stringify(schemaOf(exactOptions[target-1])),'utf8')+6000,required)
  assert.deepEqual(exact.result,sceneRosterGenerationSchema(request()).parse(good()))
  const smallOptions:Options[]=[]
  await assert.rejects(run(sizedRequest(required-1),smallOptions),/预算/u)
  assert.equal(smallOptions.length,target-1,'an input-capacity failure does not make an extra SDK call or silently switch the compiled tasks')
 })
})

test('BD-budget02: prompt fixed reserve N/N+1 keeps all tasks and full failed answer while Native schema has its own cap',async()=>{
 assert.equal(IMPORT_FIXED_PROMPT_RESERVE_BYTES,65536);assert.equal(IMPORT_JSON_WRAPPER_RESERVE_BYTES,16384)
 const run=async(padding:number,options:Options[])=>{
  let current:unknown
  const result=await bridge(bad(),(reply,_plan,prompt,r)=>{deckOf(prompt);const answer=boundReply(prompt,reply,r);if(options.length===2){current={...answer,BD_UNTRUSTED_PADDING:'x'.repeat(padding)};return current}return answer},{request:sizedRequest(1048576),options})
  return{...result,current}
 }
 const baselineOptions:Options[]=[],baseline=await run(0,baselineOptions),last=baselineOptions[2],payload=serializeImportAiPayload(request())
 assert.equal(baselineOptions.length,3);complete(last,request(),bad(),baseline.current)
 const room=65536-IMPORT_JSON_WRAPPER_RESERVE_BYTES-Buffer.byteLength(promptOf(last),'utf8')+Buffer.byteLength(payload,'utf8')
 assert.ok(Number.isSafeInteger(room)&&room>0)
 const exactOptions:Options[]=[],exact=await run(room,exactOptions)
 assert.equal(exactOptions.length,3);assert.equal(exact.model.doStreamCalls.length,3);complete(exactOptions[2],request(),bad(),exact.current)
 assert.equal(Buffer.byteLength(promptOf(exactOptions[2]),'utf8')-Buffer.byteLength(payload,'utf8')+IMPORT_JSON_WRAPPER_RESERVE_BYTES,65536)
 assert.ok(Buffer.byteLength(JSON.stringify(schemaOf(exactOptions[2])),'utf8')<=65536,'the complete Native schema fits its independent hard cap')
 assert.ok(Buffer.byteLength(promptOf(exactOptions[2])+JSON.stringify(schemaOf(exactOptions[2])),'utf8')+6000<=sizedRequest(1048576).models.text!.contextWindow,'complete prompt plus schema stays in the unchanged model context')
 assert.deepEqual(exact.result,sceneRosterGenerationSchema(request()).parse(good()))
 const overOptions:Options[]=[];await assert.rejects(run(room+1,overOptions),/预算/u);assert.equal(overOptions.length,2)
})

test('BD-budget03: initially oversized full input makes zero SDK calls and preserves the source and raw draft',async()=>{
 const r=structuredClone(request()),first=bad(),budget=importRequestBudget(r,r.models.text!)
 r.instruction='x'.repeat(budget.characters*3)
 const before=structuredClone(r),draftBefore=structuredClone(first),options:Options[]=[]
 await assert.rejects(bridge(first,undefined,{request:r,options}),/预算/u)
 assert.equal(options.length,0);assert.deepEqual(r,before);assert.deepEqual(first,draftBefore)
})
