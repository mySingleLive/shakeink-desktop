import assert from 'node:assert/strict'
import {test} from 'node:test'
import {bridge,request,good,bad,planOf,west} from '../helpers/novel-import-claim-patch-fixture'
import {staticRosterCorrection} from '../helpers/novel-import-targeted-repair-fixture'
import {sceneRosterGenerationSchema} from '../../desktop/service/novel-import-ai'
import {serializeImportAiPayload} from '../../desktop/core/novel-import-ai-payload'
import type {generateText} from '../../src/lib/ai/generate'

type Options=Parameters<typeof generateText>[0]
type Failed={value:unknown;repairRef:string;claimRef:string}
function promptOf(option:Options){assert.ok('prompt'in option);return option.prompt}
function schemaOf(option:Options){assert.ok(option.jsonOutputSchema);return option.jsonOutputSchema}
function sizedRequest(capacity:number){const r=structuredClone(request());for(const role of ['text','review']as const)r.models[role]={...r.models[role]!,contextWindow:capacity};return r}
const frames=(prompt:string)=>[...prompt.matchAll(/<previous-scene-roster-output>(.*?)<\/previous-scene-roster-output>/gsu)].map(match=>JSON.parse(match[1]) as {format:string;value:unknown})
function eligible(claim:{claimRef:string}){
 const value=(claim as {eligibleChoiceRefs?:unknown}).eligibleChoiceRefs
 assert.ok(Array.isArray(value),'the actual repair prompt includes the new complete eligibleChoiceRefs display')
 const refs=value.map(ref=>{assert.ok(typeof ref==='string'&&/^cf[0-9a-f]{16}$/u.test(ref));return ref})
 assert.equal(new Set(refs).size,refs.length)
 return refs
}
function diagnostic(prompt:string,firstPrompt:string,failure:Failed){
 assert.ok(prompt.startsWith(firstPrompt))
 const feedback=staticRosterCorrection(prompt.slice(firstPrompt.length))
 assert.ok(feedback.includes('修复定位 repairRef='+failure.repairRef+' claimRef='+failure.claimRef+' reason=context-window-missing'),'the trusted current guard feedback is outside prior/plan data and counted in the actual SDK prompt')
}
function completeMaterials(option:Options,r:ReturnType<typeof request>,first:unknown,current?:Failed){
 const prompt=promptOf(option),plan=planOf(prompt),refs=plan.choices.map(choice=>choice.choiceRef)
 assert.ok(prompt.includes(serializeImportAiPayload(r)),'all original source fragments and metadata remain in the actual prompt')
 assert.ok(frames(prompt).some(frame=>frame.format==='json'&&JSON.stringify(frame.value)===JSON.stringify(first)),'the complete frozen source draft remains')
 if(current)assert.ok(frames(prompt).some(frame=>frame.format==='json'&&JSON.stringify(frame.value)===JSON.stringify(current.value)),'the complete current failed reply remains, including later invalid data')
 for(const row of plan.rows){assert.ok(Object.hasOwn(row,'keep'),'the original keep material is not replaced by eligible metadata');for(const claim of row.patch?.claims??[]){const choices=eligible(claim);for(const ref of choices)assert.ok(refs.includes(ref));assert.deepEqual(choices.map(ref=>refs.indexOf(ref)),choices.map(ref=>refs.indexOf(ref)).sort((a,b)=>a-b),'eligible display preserves full-catalog order')}}
 assert.deepEqual(schemaOf(option).required,['answers']);assert.equal(option.maxOutputTokens,undefined)
 return plan
}

test('EC-budget: complete eligible metadata and actual guard feedback meet exact second/third/fourth prompt capacities without losing original material',async t=>{
 for(const target of [2,3,4])await t.test('generation '+target+' N / N-1',async()=>{
  const run=async(r:ReturnType<typeof request>,options:Options[])=>{
   const failures:Failed[]=[]
   const result=await bridge(bad(),(reply,plan,prompt)=>{
    const row=plan.rows.find(row=>row.slot===0);assert.ok(row?.patch)
    for(const claim of row.patch.claims)eligible(claim)
    if(options.length>=3)diagnostic(prompt,promptOf(options[0]),failures[failures.length-1])
    if(options.length===target)return reply
    const context=row.patch.claims.find(claim=>claim.kind==='context'),link=row.patch.claims.find(claim=>claim.kind==='link');assert.ok(context&&link)
    const wrong=plan.choices.filter(choice=>r.units[choice.unitIndex].id===r.units[1].id&&r.units[choice.unitIndex].text.slice(choice.start,choice.end)===west)
    assert.equal(wrong.length,1,'the invalid context choice is a predetermined exact real source window, not an unknown ref')
    assert.ok(!eligible(context).includes(wrong[0].choiceRef),'a real window without the fixed label is excluded from this claim display but remains in the full catalog')
    const invalid=structuredClone(reply),contextDecision=invalid.repairs[0].patch.claims.find(claim=>claim.claimRef===context.claimRef),laterLink=invalid.repairs[0].patch.claims.find(claim=>claim.claimRef===link.claimRef)
    assert.ok(contextDecision&&laterLink);contextDecision.choiceRefs=[wrong[0].choiceRef]
    // This later, wire-shaped array is never reached: the real context guard
    // rejects first. Its complete bytes make each later prompt the binding
    // boundary rather than accidentally testing a larger earlier prompt.
    laterLink.choiceRefs=Array.from({length:128*(options.length-1)},()=> 'cf'+'0'.repeat(16))
    failures.push({value:structuredClone(invalid),repairRef:row.repairRef,claimRef:context.claimRef})
    return invalid
   },{request:r,options})
   return{...result,failures}
  }
  const baselineOptions:Options[]=[],baseline=await run(sizedRequest(1048576),baselineOptions),actual=baselineOptions[target-1]
  assert.equal(baselineOptions.length,target);assert.equal(baseline.model.doStreamCalls.length,target)
  const originalPlan=completeMaterials(baselineOptions[1],request(),bad()),lastPlan=completeMaterials(actual,request(),bad(),baseline.failures.at(-1))
  assert.deepEqual(lastPlan,originalPlan,'all claims, eligible lists, global choices and keep stay frozen across retries')
  if(target>=3)diagnostic(promptOf(actual),promptOf(baselineOptions[0]),baseline.failures.at(-1)!)
  const required=Buffer.byteLength(promptOf(actual)+JSON.stringify(schemaOf(actual)),'utf8')+6000
  assert.ok(Buffer.byteLength(promptOf(actual),'utf8')>promptOf(actual).length,'capacity uses actual Unicode UTF8 bytes')
  for(const previous of baselineOptions.slice(0,target-1))assert.ok(Buffer.byteLength(promptOf(previous)+JSON.stringify(schemaOf(previous)),'utf8')+6000<required,'the selected generation really is the maximum prompt so far')
  const exactOptions:Options[]=[],exact=await run(sizedRequest(required),exactOptions)
  assert.equal(exactOptions.length,target);assert.equal(exact.model.doStreamCalls.length,target);assert.equal(exact.usageRows.length,target)
  assert.deepEqual(exact.result,sceneRosterGenerationSchema(request()).parse(good()))
  assert.equal(promptOf(exactOptions[target-1]),promptOf(actual));assert.deepEqual(schemaOf(exactOptions[target-1]),schemaOf(actual))
  assert.equal(Buffer.byteLength(promptOf(exactOptions[target-1])+JSON.stringify(schemaOf(exactOptions[target-1])),'utf8')+6000,required)
  const tooSmallOptions:Options[]=[]
  await assert.rejects(run(sizedRequest(required-1),tooSmallOptions),/预算/u)
  assert.equal(tooSmallOptions.length,target-1,'no complete prepared or frozen form fits N-1, so the next SDK call is refused')
 })
})
