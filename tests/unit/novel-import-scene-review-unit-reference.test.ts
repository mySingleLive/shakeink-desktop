import assert from 'node:assert/strict'
import {test} from 'node:test'
import {createHash} from 'node:crypto'
import {generateImportAiJson,importAiResponseSchema,runImportAi} from '../../desktop/service/novel-import-ai'
import {importAiPrompt,serializeImportAiPayload,assertImportPayloadBudget,assertImportFixedPromptReserve,IMPORT_JSON_WRAPPER_RESERVE_BYTES} from '../../desktop/core/novel-import-ai-payload'
import {createImportReviewProjection} from '../../desktop/core/novel-import-semantics'
import {importRequestBudget} from '../../desktop/core/novel-import-budget-policy'
import {StructuredGenerationError} from '../../src/lib/ai/generate'
import type {ResolvedModel} from '../../src/lib/ai/provider'
import type {ImportAiRequest,ImportAiResult,ImportArtifact,ImportConflict,ImportEvidence,ImportModel} from '../../desktop/shared/novel-import'

const model:ImportModel={id:'ur-review',name:'合成复核模型',modelId:'synthetic',endpoint:'https://review.invalid/v1',authRevision:1,contextWindow:16000},context={userId:'synthetic-unit-reference',resolvedModel:{} as ResolvedModel}
const source=' \t合成首哨兵😀\r\n'+'这是不得裁减的完整合成原文𠀀。'.repeat(40)+'\r\n合成末哨兵  ',secret='UR-SYNTHETIC-PRIVATE-SECRET'
function request():ImportAiRequest{
 const a:ImportArtifact={id:'ur-scene',kind:'scene',name:'合成场景',text:'完整场景资料😀',facts:{entityType:'PLACE',coordinates:'作者锁定方位'},origin:'inferred',evidence:[{unitId:'ur-one',quote:source}],sourceUnitIds:['ur-one']}
 return{semanticVersion:1,operationId:'ur-op',phase:'review',selectedTargets:['scene'],models:{text:{...model,id:'ur-text'},review:model},units:[{id:'ur-one',fileId:'ur-source',start:0,end:source.length,text:source,kind:'body'},{id:'ur-two',fileId:'ur-source',start:source.length,end:source.length*2,text:source,kind:'body'}],artifacts:[a],entities:[{id:a.id,kind:a.kind,name:a.name,entityType:'PLACE'}],chapters:[{id:'ur-chapter',title:'合成章',start:0,end:source.length*2}],reviewProjection:[createImportReviewProjection(a,a,{start:0,end:a.text.length})],semanticLocks:[{artifactId:a.id,field:'coordinates',value:a.facts.coordinates}],workingRevision:0,instruction:'作者已确认决定：保留全部材料与锁定方位。'}
}
function conflict(evidence:unknown[]):ImportConflict{return{id:'ur-conflict',hash:'original-hash',type:'body-body',kind:'body',entity:'合成陈述',field:'状态',source:{text:'完整旧陈述',value:'旧值',unitId:'ur-one'},candidate:{text:'完整新陈述',value:'新值',unitId:'ur-two'},evidence:evidence as ImportEvidence[],status:'pending'}}
function result(field:'conflicts'|'missingTargets',evidence:unknown[]):ImportAiResult{return field==='conflicts'?{conflicts:[conflict(evidence)],missingTargets:[]}:{conflicts:[],missingTargets:[{kind:'scene',unitIds:['ur-one','ur-two'],evidence:evidence as ImportEvidence[],reason:'合成有据新场景遗漏'}]}}
const rawEvidence=(r:ImportAiRequest,index:number)=>({unitId:r.units[index].id,quote:r.units[index].text})
const generated=(raw:unknown)=>({text:JSON.stringify(raw),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'})
const direct=(r:ImportAiRequest,raw:unknown)=>runImportAi(r,new AbortController().signal,{resolve:async()=>model,assert:async()=>{},generate:async()=>structuredClone(raw)})
const bridged=(r:ImportAiRequest,sequence:unknown[],prompts:string[]=[])=>runImportAi(r,new AbortController().signal,{resolve:async()=>model,assert:async()=>{},generate:async(input,_m,signal,prompt)=>generateImportAiJson(input,context,signal,prompt,{generateText:async opts=>{prompts.push('prompt'in opts?opts.prompt:'');return generated(sequence[Math.min(prompts.length-1,sequence.length-1)])}})})

test('UR01: scene review indexes restore whole current units through the real JSON and final canonical gates',async t=>{
 for(const field of ['conflicts','missingTargets'] as const)await t.test(field,async()=>{
  const r=request(),before=structuredClone(r),indexed=result(field,[{unitIndex:0},{unitIndex:1}]),canonical=result(field,[rawEvidence(r,0),rawEvidence(r,1)]),inputBefore=structuredClone(indexed),baseline=await direct(r,canonical),prompts:string[]=[]
  assert.ok(source.length>512);const output=await bridged(r,[indexed],prompts);assert.deepEqual(output,baseline);assert.equal(prompts.length,1);assert.deepEqual(output[field]![0].evidence,[rawEvidence(r,0),rawEvidence(r,1)]);assert.ok(!JSON.stringify(output).includes('unitIndex'));assert.deepEqual(r,before);assert.deepEqual(indexed,inputBefore)
  const bad=result(field,[{unitId:'ur-one',quote:secret},{unitId:'ur-two',quote:source}]);prompts.length=0;assert.deepEqual(await bridged(r,[bad,indexed],prompts),baseline);assert.equal(prompts.length,2,'explicit bad quote really fails before the existing correction')
  const feedback=prompts[1].slice(prompts[0].length);assert.ok(feedback.includes('unitIndex')&&feedback.includes('0-based'));for(const value of [secret,source,'ur-one','ur-two',r.instruction!,r.artifacts[0].text,model.endpoint])assert.ok(!feedback.includes(value));assert.ok(Buffer.byteLength(prompts[1])-Buffer.byteLength(prompts[0])<=IMPORT_JSON_WRAPPER_RESERVE_BYTES)
 })
 await t.test('index zero belongs only to each current packet',async()=>{
  for(const text of ['第一包独立全文😀','第二包完全不同全文𠀀']){const r=request();r.units=[{...r.units[0],id:'packet-'+text.slice(0,2),text,end:text.length}];const raw={conflicts:[{...conflict([{unitIndex:0}]),source:{text:'旧值',value:'旧值'},candidate:{text:'新值',value:'新值'}}]};const actual=await bridged(r,[raw]);assert.deepEqual(actual.conflicts![0].evidence,[rawEvidence(r,0)])}
 })
})

test('UR02: strict reference union rejects invalid, mixed and unknown forms while other scopes retain the raw protocol',async t=>{
 const r=request(),before=structuredClone(r),factory=importAiResponseSchema(r),badEntries:unknown[]=[{unitIndex:-1},{unitIndex:2},{unitIndex:0.5},{unitIndex:'0'},{unitIndex:0,unitId:'ur-one'},{unitIndex:0,quote:secret},{unitIndex:0,optionIndex:0},{unitIndex:0,[secret]:secret},{unitIndex:0,[secret]:undefined}]
 for(const entry of badEntries)for(const field of ['conflicts','missingTargets'] as const){const raw=result(field,[{unitIndex:0},{unitIndex:1},entry]),snapshot=structuredClone(raw);assert.equal(factory.safeParse(raw).success,false);assert.deepEqual(raw,snapshot)}
 await t.test('persistent bad index gets exactly the original two generations with safe feedback',async()=>{
  const raw=result('conflicts',[{unitIndex:0,[secret]:secret}]),prompts:string[]=[];await assert.rejects(bridged(r,[raw],prompts),error=>error instanceof StructuredGenerationError&&error.kind==='invalid_schema');assert.equal(prompts.length,2);const feedback=prompts[1].slice(prompts[0].length);assert.ok(feedback.includes('unitIndex'));assert.ok(!feedback.includes(secret))
 })
 await t.test('author explanation retains its old prompt, payload and raw-anchor correction',async()=>{
  const author={...r,conflict:conflict([rawEvidence(r,0)])},raw=result('conflicts',[{unitId:'ur-one',quote:secret}]),indexed=result('conflicts',[{unitIndex:0}]),payload=serializeImportAiPayload(author),prompt=importAiPrompt(author),prompts:string[]=[]
  assert.ok(JSON.parse(payload).units.every((u:Record<string,unknown>)=>!Object.hasOwn(u,'unitIndex')));assert.equal(importAiResponseSchema(author).safeParse(indexed).success,false)
  await assert.rejects(bridged(author,[raw],prompts),error=>error instanceof StructuredGenerationError&&error.kind==='invalid_schema');assert.equal(prompts.length,2);assert.ok(prompts[1].slice(prompts[0].length).includes('声明单元内未找到引文'))
  const hash=(value:string)=>createHash('sha256').update(value).digest('hex');assert.equal(hash(payload),'0e6b5b66eadbd7274e4c5e01d6c729eb5040ea283b01b67deadc6db6b7c8e3d0');assert.equal(hash(prompt),'2e2e1b4722286073a59ea53030af872531a553106e06ea56813c8d514d419db8');t.diagnostic(JSON.stringify({authorPayloadHash:hash(payload),authorPromptHash:hash(prompt)}));assert.ok(prompt.includes('<semantic-native-contract>'),'existing author explanation prompt remains the old contract')
 })
 for(const other of [{...r,selectedTargets:['character']},{...r,selectedTargets:['scene','world']},{...r,selectedTargets:undefined},{...r,semanticVersion:undefined,selectedTargets:undefined,reviewProjection:undefined,semanticLocks:undefined},{...r,phase:'analyze',kind:'scene'},{...r,intent:'reconcile'}] as ImportAiRequest[]){const payload=serializeImportAiPayload(other);assert.ok(JSON.parse(payload).units.every((u:Record<string,unknown>)=>!Object.hasOwn(u,'unitIndex')));if(other.intent===undefined)assert.equal(importAiResponseSchema(other).safeParse({conflicts:[conflict([{unitIndex:0}])]}).success,false)}
 assert.deepEqual(r,before)
})

test('UR03: dedicated review prompt preserves all materials, budgets and late projection, source and authorization gates',async t=>{
 const r=request(),before=structuredClone(r),oldData=JSON.parse(serializeImportAiPayload({...r,selectedTargets:['scene','world']})),payload=serializeImportAiPayload(r),sent=JSON.parse(payload),prompt=importAiPrompt(r,payload);oldData.selectedTargets=['scene'];oldData.units=r.units.map((unit,unitIndex)=>({...unit,unitIndex}));const originalArtifacts=sent.artifacts.map((entry:Record<string,unknown>,index:number)=>{const{artifactIndex,bindableFields,...original}=entry;assert.equal(artifactIndex,index);assert.deepEqual(bindableFields,['text',...Object.keys(r.artifacts[index].facts)]);assert.deepEqual(original,r.artifacts[index]);return original});assert.deepEqual({...sent,artifacts:originalArtifacts},oldData);assert.deepEqual(r,before)
 for(const fragment of ['reviewProjection','semanticHash','fullTextLength','fullFactKeys','textRange','片外','锁定','unitIndex','0-based','完整','互斥','时序','回忆','传闻',r.instruction!,r.artifacts[0].text])assert.ok(prompt.includes(fragment),fragment)
 assert.ok(!prompt.includes('<semantic-native-contract>'));for(const contract of ['worldline须lineId','narrative须全书','角色roleType必须有源文'])assert.ok(!prompt.includes(contract));assertImportFixedPromptReserve(prompt,payload)
 await t.test('new index metadata counts before generation without trimming units',async()=>{
  const input=request(),budget=importRequestBudget(input,model),old=serializeImportAiPayload({...input,selectedTargets:['scene','world']});input.instruction+='x'.repeat(budget.characters*3-old.length-10);const oldPayload=serializeImportAiPayload({...input,selectedTargets:['scene','world']});assertImportPayloadBudget(input,oldPayload,budget.characters,budget.maxUnits);let generated=0
  await assert.rejects(runImportAi(input,new AbortController().signal,{resolve:async()=>model,assert:async()=>{},generate:async()=>{generated++;return{conflicts:[]}}}),/预算/);assert.equal(generated,0)
 })
 await t.test('canonical index cannot bypass packet entities, source coverage, projection or locks',async()=>{
  const valid=[{unitIndex:0},{unitIndex:1}],bad:unknown[]=[{conflicts:[{...conflict(valid),candidate:{text:'新值',value:'新值',artifactId:'outside'}}]},{missingTargets:[{...result('missingTargets',valid).missingTargets![0],unitIds:['ur-one']}]},{missingTargets:[{...result('missingTargets',valid).missingTargets![0],artifactId:'ur-scene',field:'text',baseHash:'f'.repeat(64)}]},{missingTargets:[{...result('missingTargets',valid).missingTargets![0],artifactId:'ur-scene',field:'coordinates',baseHash:r.reviewProjection![0].semanticHash}]}]
  for(const raw of bad){const omission=Object.hasOwn(raw as object,'missingTargets'),prompts:string[]=[];assert.equal(importAiResponseSchema(r).safeParse(raw).success,true,'the base parser alone is not final acceptance');await assert.rejects(bridged(r,[raw],prompts),error=>omission?error instanceof StructuredGenerationError&&error.kind==='invalid_schema'&&error.invalidFields.includes('missingTargets.0'):error instanceof Error&&/引用|范围|投影|证据|版本|锁定/u.test(error.message));assert.equal(prompts.length,omission?2:1)}
 })
 await t.test('final authorization and cancellation still reject after successful reference decoding',async()=>{
  for(const mode of ['authorization','abort'] as const){const controller=new AbortController(),failure=new Error('synthetic-final-'+mode);let assertions=0,calls=0
   await assert.rejects(runImportAi(r,controller.signal,{resolve:async()=>model,assert:async()=>{assertions++;if(mode==='authorization'&&assertions===2)throw failure},generate:async(input,_m,signal,fixed)=>{const output=await generateImportAiJson(input,context,signal,fixed,{generateText:async()=>{calls++;return generated(result('conflicts',[{unitIndex:0}]))}});if(mode==='abort')controller.abort(failure);return output}}),error=>error===failure);assert.equal(calls,1)
  }
 })
})
