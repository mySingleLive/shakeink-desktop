import assert from 'node:assert/strict'
import {test} from 'node:test'
import {z} from 'zod'
import {generateJSON} from '../../src/lib/ai/generate'
import {JSON_OUTPUT_INSTRUCTION} from '../../src/lib/ai/json-output-instruction'
import {sceneRosterNativeSchema,assertSceneRosterNativeBudget,supportsNativeSceneJsonModel} from '../../desktop/core/novel-import-scene-roster-native'
import {importAiPrompt,serializeImportAiPayload,assertImportPayloadBudget,assertImportFixedPromptReserve,IMPORT_JSON_WRAPPER_RESERVE_BYTES} from '../../desktop/core/novel-import-ai-payload'
import {importBudgetProfile} from '../../desktop/core/novel-import-budget-policy'
import type {ImportAiRequest,ImportModel} from '../../desktop/shared/novel-import'

const model={id:'native-budget',name:'合成模型',provider:'deepseek',protocol:'openai',endpoint:'https://api.deepseek.com',modelId:'deepseek-flash',authRevision:1,contextWindow:1048576,kind:'TEXT'}
const phases=['first','repair']as const
function request():ImportAiRequest{const text='东宅😀书房。\r\n';return{operationId:'native-budget-op',semanticVersion:1,phase:'analyze',intent:'roster',kind:'scene',sceneIdentity:{version:1,mode:'roster'},units:[{id:'SOURCE-ONLY-UNIT',fileId:'f',start:0,end:text.length,text,kind:'body'}],artifacts:[],models:{text:{...model}}}}
function node(value:unknown):Record<string,unknown>{assert.ok(value&&typeof value==='object'&&!Array.isArray(value));return value as Record<string,unknown>}
const properties=(value:unknown)=>node(node(value).properties)
const actual=(prompt:string,phase:typeof phases[number])=>prompt+(phase==='first'?JSON_OUTPUT_INSTRUCTION:'')
const promptFor=(r:ImportAiRequest,payload:string,phase:typeof phases[number])=>importAiPrompt(r,payload)+(phase==='repair'?JSON_OUTPUT_INSTRUCTION+'\n<previous-scene-roster-output>{"format":"json","value":{"roster":[]}}</previous-scene-roster-output>\n<scene-roster-targeted-repair>{"rows":[],"choices":[]}</scene-roster-targeted-repair>':'')

test('NR-budget01: the exact original native model whitelist is shared, with a separate narrow roster scope',()=>{
 for(const modelId of ['deepseek-flash','deepseek-v4-pro'])for(const endpoint of ['https://api.deepseek.com','https://api.deepseek.com/'])for(const kind of ['TEXT',undefined])assert.equal(supportsNativeSceneJsonModel({...model,modelId,endpoint,kind}),true)
 for(const patch of [{provider:'custom'},{protocol:'anthropic'},{kind:'IMAGE'},{modelId:'deepseek-pro'},{endpoint:'https://api.deepseek.com/v1'},{endpoint:'https://api.deepseek.com?x=1'},{endpoint:'https://user:key@api.deepseek.com'},{endpoint:'https://API.DEEPSEEK.COM'},{endpoint:'https://api.deepseek.com//'}])assert.equal(supportsNativeSceneJsonModel({...model,...patch}),false)
 const r=request();assert.ok(sceneRosterNativeSchema(r,model,'first'));assert.ok(sceneRosterNativeSchema(r,model,'repair'))
 for(const patch of [{semanticVersion:undefined},{phase:'review'},{intent:'entity'},{kind:'character'},{sceneIdentity:undefined},{sceneIdentity:{version:1,mode:'links'}},{sceneParentTargets:['parent']}])assert.equal(sceneRosterNativeSchema({...r,...patch} as ImportAiRequest,model,'first'),undefined)
})

test('NR-budget02: every native object is strict, first anchors retain all three forms and repair is CF-only',()=>{
 const r=request(),before=structuredClone(r),first=node(sceneRosterNativeSchema(r,model,'first')),repair=node(sceneRosterNativeSchema(r,model,'repair'))
 function strict(value:unknown){if(Array.isArray(value)){for(const item of value)strict(item)}else if(value&&typeof value==='object'){const object=node(value);if(object.type==='object'){assert.equal(object.additionalProperties,false);assert.deepEqual([...(object.required as string[])].sort(),Object.keys(properties(object)).sort())}for(const item of Object.values(object))strict(item)}}
 strict(first);strict(repair)
 const roster=node(properties(first).roster),row=node(roster.items),fields=properties(row);assert.equal(roster.maxItems,2000);assert.deepEqual(Object.keys(fields).sort(),['context','links','mentions'])
 const mention=node(node(fields.mentions).items),evidence=node(properties(mention).evidence),forms=evidence.anyOf as unknown[]
 assert.equal(forms.length,3);assert.deepEqual(forms.map(form=>Object.keys(properties(form)).sort().join(',')).sort(),['fromFragment,toFragment,unitIndex','quote,unitId','ref'])
 assert.equal(node(fields.mentions).minItems,1);assert.equal(node(fields.mentions).maxItems,50000);assert.equal(node(fields.context).maxItems,50000);assert.equal(node(fields.links).maxItems,20000);assert.equal(node(properties(mention).literal).maxLength,300)
 const actions=node(properties(repair).repairs),branches=node(actions.items).anyOf as unknown[];assert.equal(actions.minItems,1);assert.equal(actions.maxItems,2000);assert.equal(branches.length,3)
 const replace=branches.find(branch=>Object.hasOwn(properties(branch),'replacement'))!,replacement=properties(replace).replacement,repairMention=node(node(properties(replacement).mentions).items),choice=properties(repairMention).evidence
 assert.deepEqual(Object.keys(properties(choice)),['choiceRef']);assert.equal(node(properties(choice).choiceRef).pattern,'^cf[0-9a-f]{16}$')
 // Explicit protocol values keep the two original actions unchanged while
 // the third action adds only the closed claim-patch grammar.
 const closed=(properties:Record<string,unknown>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false})
 const list=(items:unknown,maxItems:number,minItems=0)=>({type:'array',items,minItems,maxItems})
 const rr={type:'string',pattern:'^rr[0-9a-f]{16}$'},cf={type:'string',pattern:'^cf[0-9a-f]{16}$'},pc={type:'string',pattern:'^pc[0-9a-f]{16}$'},text={type:'string',minLength:1,pattern:'\\S',maxLength:300},integer={type:'integer',minimum:0,maximum:Number.MAX_SAFE_INTEGER},cfOnly=closed({choiceRef:cf})
 const oldReplacement=closed({mentions:list(closed({literal:text,evidence:cfOnly}),50000,1),context:list(closed({label:text,evidence:list(cfOnly,50000,1)}),50000),links:list(closed({targetIndex:integer,relation:{type:'string',enum:['same-place','different-place','parent']},evidence:list(cfOnly,50000,1)}),20000)})
 const expectedReplace=closed({repairRef:rr,disposition:{type:'string',enum:['replace']},replacement:oldReplacement}),expectedReject=closed({repairRef:rr,disposition:{type:'string',enum:['reject']}})
 const expectedPatch=closed({repairRef:rr,disposition:{type:'string',enum:['patch']},patch:closed({claims:list({anyOf:[closed({claimRef:pc,disposition:{type:'string',enum:['resolve']},choiceRefs:list(cf,50000,1)}),closed({claimRef:pc,disposition:{type:'string',enum:['reject']}})]},50000,1)})})
 assert.deepEqual(branches,[expectedReplace,expectedReject,expectedPatch],'old replace/reject values stay exact; patch has no free literal, label, endpoint, path or add field')
 const contextEvidence=node(node(properties(node(properties(replacement).context).items).evidence).items),linkEvidence=node(node(properties(node(properties(replacement).links).items).evidence).items)
 for(const anchor of [choice,contextEvidence,linkEvidence])assert.deepEqual(anchor,cfOnly,'every original replacement evidence remains strict CF-only')
 assert.ok(!JSON.stringify(first).includes(r.units[0].id));assert.ok(!JSON.stringify(first).includes(r.units[0].text));assert.ok(!JSON.stringify(first).includes('description'));assert.ok(!JSON.stringify(repair).includes('maxOutputTokens'))
 const second=structuredClone(r);second.units[0].text='另一份来源';assert.deepEqual(sceneRosterNativeSchema(second,model,'first'),first);assert.deepEqual(r,before)
 roster.maxItems=1;assert.equal(node(properties(sceneRosterNativeSchema(r,model,'first')).roster).maxItems,2000,'a caller cannot mutate the next native schema')
})

test('NR-budget03: actual schema bytes independently hit the original complete-payload limit',async t=>{
 for(const phase of phases)await t.test(phase,()=>{
  const r=request(),budget={version:2 as const,...importBudgetProfile(model.contextWindow,2)},schema=JSON.stringify(sceneRosterNativeSchema(r,model,phase)),bytes=Buffer.byteLength(schema,'utf8'),base=serializeImportAiPayload(r),room=budget.characters*3-base.length-bytes
  assert.ok(bytes>0&&room>0)
  for(const plus of [0,1]){const candidate=structuredClone(r);candidate.instruction='x'.repeat(room-17+plus);let payload=serializeImportAiPayload(candidate);candidate.instruction+='x'.repeat(budget.characters*3-bytes+plus-payload.length);payload=serializeImportAiPayload(candidate);assert.equal(payload.length+bytes,budget.characters*3+plus);assertImportPayloadBudget(candidate,payload,budget.characters,budget.maxUnits);const before=structuredClone(candidate),prompt=promptFor(candidate,payload,phase);if(!plus)assert.doesNotThrow(()=>assertSceneRosterNativeBudget(candidate,model,budget,payload,prompt,phase));else assert.throws(()=>assertSceneRosterNativeBudget(candidate,model,budget,payload,prompt,phase),/预算/u);assert.deepEqual(candidate,before)}
 })
})

test('NR-budget04: fixed reserve counts the actual phase schema and only the real JSON wrapper',async t=>{
 for(const phase of phases)await t.test(phase,()=>{
  const r=request(),budget={version:2 as const,...importBudgetProfile(model.contextWindow,2)},payload=serializeImportAiPayload(r),schema=JSON.stringify(sceneRosterNativeSchema(r,model,phase)),base=promptFor(r,payload,phase),room=65536-16384-Buffer.byteLength(actual(base,phase)+schema,'utf8')+Buffer.byteLength(payload,'utf8');assert.ok(room>0)
  for(const plus of [0,1]){const prompt=base+'x'.repeat(room+plus);assertImportFixedPromptReserve(prompt,payload);assert.equal(Buffer.byteLength(actual(prompt,phase)+schema,'utf8')-Buffer.byteLength(payload,'utf8')+IMPORT_JSON_WRAPPER_RESERVE_BYTES,65536+plus);if(!plus)assert.doesNotThrow(()=>assertSceneRosterNativeBudget(r,model,budget,payload,prompt,phase));else assert.throws(()=>assertSceneRosterNativeBudget(r,model,budget,payload,prompt,phase),/预算预留/u)}
 })
})

test('NR-budget05: both phases respect actual legacy context and the original unknown-window fallback',async t=>{
 for(const phase of phases)await t.test(phase,()=>{
  const r=request(),payload=serializeImportAiPayload(r),schema=JSON.stringify(sceneRosterNativeSchema(r,model,phase)),base=promptFor(r,payload,phase),required=Buffer.byteLength(actual(base,phase)+schema,'utf8')+6000
  for(const offset of [0,-1]){const pinned={...model,contextWindow:required+offset},budget={version:1 as const,...importBudgetProfile(pinned.contextWindow,1)};assertImportPayloadBudget(r,payload,budget.characters,budget.maxUnits);if(!offset)assert.doesNotThrow(()=>assertSceneRosterNativeBudget(r,pinned,budget,payload,base,phase));else assert.throws(()=>assertSceneRosterNativeBudget(r,pinned,budget,payload,base,phase),/容量|预算/u)}
  const simple=payload+(phase==='repair'?JSON_OUTPUT_INSTRUCTION+'\nprior+complete-choices':''),room=16000-6000-Buffer.byteLength(actual(simple,phase)+schema,'utf8');assert.ok(room>0)
  for(const capacity of [0,undefined])for(const plus of [0,1]){const pinned={...model,contextWindow:capacity},budget={version:1 as const,...importBudgetProfile(0,1)},prompt=simple+'x'.repeat(room+plus);if(!plus)assert.doesNotThrow(()=>assertSceneRosterNativeBudget(r,pinned,budget,payload,prompt,phase));else assert.throws(()=>assertSceneRosterNativeBudget(r,pinned,budget,payload,prompt,phase),/容量|预算/u)}
 })
})

test('NR-budget06: noneligible calls are true no-ops and the JSON instruction remains the actual generic wrapper',async()=>{
 const r=request(),legacy={...r,sceneIdentity:undefined},badBudget={version:2 as const,...importBudgetProfile(model.contextWindow,2),characters:0,maxUnits:0 as 300}
 assert.doesNotThrow(()=>assertSceneRosterNativeBudget(legacy,model,badBudget,'x'.repeat(100000),'invalid','first'));assert.doesNotThrow(()=>assertSceneRosterNativeBudget(r,{...model,provider:'other'},badBudget,'x'.repeat(100000),'invalid','repair'))
 let observed='';await generateJSON({userId:'native-budget',action:'synthetic',prompt:'base',schema:z.strictObject({ok:z.literal(true)})},{generateText:async options=>{observed='prompt'in options?options.prompt:'';return{text:'{"ok":true}',promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'}}});assert.equal(observed,'base'+JSON_OUTPUT_INSTRUCTION)
})
