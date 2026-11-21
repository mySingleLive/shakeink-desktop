import assert from 'node:assert/strict'
import {test} from 'node:test'
import {generateImportAiJson,importAiResponseSchema,runImportAi} from '../../desktop/service/novel-import-ai'
import {StructuredGenerationError} from '../../src/lib/ai/generate'
import type {ResolvedModel} from '../../src/lib/ai/provider'
import {importHash} from '../../desktop/core/novel-import'
import {assertImportFixedPromptReserve,IMPORT_JSON_WRAPPER_RESERVE_BYTES,importAiPrompt,serializeImportAiPayload} from '../../desktop/core/novel-import-ai-payload'
import type {ImportAiRequest,ImportAiResult,ImportConflict,ImportEvidence,ImportModel} from '../../desktop/shared/novel-import'

// Synthetic source, model snapshots and responses only. Exercise the production
// JSON bridge with its existing generateText dependency; never invoke a model.
const unitId='RA-UNIT-SYNTHETIC-SECRET',foreignId='RA-FOREIGN-SYNTHETIC-SECRET',quoteSecret='RA-QUOTE-SYNTHETIC-SECRET',entitySecret='RA-ENTITY-SYNTHETIC-SECRET'
const source='合成原文首句。\r\n这里是一处小室，完整原文与尾句😀均须保留。'
const textModel:ImportModel={id:'ra-text',name:'合成文本模型',modelId:'synthetic',endpoint:'https://review.invalid/v1',authRevision:1,contextWindow:16000}
const reviewModel:ImportModel={...textModel,id:'ra-review',name:'合成独立审核模型'}
const context={userId:'synthetic-review-user',resolvedModel:{} as ResolvedModel}
const prefix='证据必须引用本次unitId中的原文连续片段，不可概述、拼接或补字'
const guidance={
 'unknown-unit':prefix+'；unitId必须逐字取自本次输入单元；quote只能复制该单元text，不得借其它单元',
 'too-short':prefix+'；此非精确引文非空白字符不足8，不能恢复排版；从声明单元text复制原文，保留空白与标点；精确短引文仍允许',
 ambiguous:prefix+'；排版恢复出现多个命中；从声明单元text复制含必要上下文的连续原文并保留原排版，不得任选位置',
 'no-match':prefix+'；声明单元内未找到引文；核对unitId与quote配对，从该单元text原样复制，不跨单元、不改字标点'
} as const
type Reason=keyof typeof guidance
type Branch='conflicts'|'missingTargets'
function request(text=source):ImportAiRequest{return {semanticVersion:1,operationId:'ra-synthetic-operation',phase:'review',selectedTargets:['scene'],models:{text:textModel,review:reviewModel},units:[{id:unitId,fileId:'ra-file',start:0,end:text.length,text,kind:'body'}],artifacts:[],workingRevision:0}}
function conflict(entries:ImportEvidence[]):ImportConflict{return {id:'RA-CONFLICT-SYNTHETIC-SECRET',hash:'RA-HASH-SYNTHETIC-SECRET',type:'body-body',kind:'scene',entity:entitySecret,field:'场景位置',source:{text:'原陈述完整文本',value:'原陈述完整值',unitId},candidate:{text:'候选陈述完整文本',value:'候选陈述完整值',unitId},evidence:entries,status:'pending'}}
function response(branch:Branch,entries:ImportEvidence[]):ImportAiResult{return branch==='conflicts'?{conflicts:[conflict(entries)],missingTargets:[]}:{conflicts:[],missingTargets:[{kind:'scene',unitIds:[unitId],reason:'RA-MISSING-REASON-SYNTHETIC-SECRET',evidence:entries}]}}
const generated=(raw:unknown)=>({text:JSON.stringify(raw),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'})
function expected(raw:ImportAiResult):ImportAiResult{const value=structuredClone(raw);for(const item of value.conflicts??[]){item.hash=importHash({...item,id:undefined,hash:undefined});item.id='conflict-'+item.hash.slice(0,24)}return value}
async function direct(input:ImportAiRequest,raw:ImportAiResult){return runImportAi(input,new AbortController().signal,{resolve:async role=>input.models[role]!,assert:async()=>{},generate:async()=>structuredClone(raw)})}
function assertSafeFeedback(feedback:string,extra:string[]=[]){for(const secret of [unitId,foreignId,quoteSecret,entitySecret,source,textModel.endpoint,'RA-CONFLICT-SYNTHETIC-SECRET','RA-HASH-SYNTHETIC-SECRET','RA-MISSING-REASON-SYNTHETIC-SECRET',...Object.keys(guidance),...extra])assert.ok(!feedback.includes(secret),'feedback must contain only fixed guidance and structural paths: '+secret)}

test('RA-01: scene-only review corrects conflict and omission anchors through the actual bounded bridge and final service',async t=>{
 for(const branch of ['conflicts','missingTargets'] as const)await t.test(branch,async()=>{
  const input=request(),before=structuredClone(input),good=response(branch,[{unitId,quote:'这里是一处小室'}]),bad=response(branch,[{unitId,quote:quoteSecret}]),badBefore=structuredClone(bad),goodBefore=structuredClone(good),prompts:string[]=[],controller=new AbortController();let assertions=0,resolutions=0
  assert.equal(input.kind,undefined,'production review does not specify an analyze kind')
  const baseline=await direct(input,good);assert.deepEqual(baseline,expected(good),'independent first-valid response reaches the original complete acceptance path')
  const run=(persistBad=false)=>runImportAi(input,controller.signal,{resolve:async(role,id)=>{resolutions++;assert.equal(role,'review');assert.equal(id,reviewModel.id);return reviewModel},assert:async()=>{assertions++},generate:async(r,pinned,signal,prompt)=>{assert.equal(r,input);assert.equal(pinned,reviewModel);return generateImportAiJson(r,context,signal,prompt,{generateText:async opts=>{assert.equal(opts.resolvedModel,context.resolvedModel);assert.equal(opts.userId,context.userId);assert.equal(opts.abortSignal,controller.signal);assert.equal(opts.role,'review');assert.equal(opts.action,'novel.import.review');prompts.push('prompt'in opts?opts.prompt:'');return generated(persistBad||prompts.length===1?bad:good)}})}})
  assert.deepEqual(await run(),baseline);assert.equal(prompts.length,2);assert.equal(assertions,2);assert.equal(resolutions,2);assert.ok(prompts[1].startsWith(prompts[0]));const feedback=prompts[1].slice(prompts[0].length)
  assert.ok(feedback.includes(branch+'.0.evidence.0'));assert.ok(feedback.includes(guidance['no-match']));assertSafeFeedback(feedback)
  const prompt=importAiPrompt(input);assert.ok(Buffer.byteLength(prompts[1])-Buffer.byteLength(prompt)<=IMPORT_JSON_WRAPPER_RESERVE_BYTES);assertImportFixedPromptReserve(prompt,serializeImportAiPayload(input))
  prompts.length=0;assertions=0;resolutions=0;await assert.rejects(run(true),error=>error instanceof StructuredGenerationError&&error.kind==='invalid_schema'&&error.invalidFields.includes(branch+'.0.evidence.0'));assert.equal(prompts.length,2,'no third generation or outer review retry');assert.equal(assertions,1,'no accepted result or final authorization credit');assert.equal(resolutions,1)
  assert.deepEqual(input,before);assert.deepEqual(bad,badBefore);assert.deepEqual(good,goodBefore)
 })
})

test('RA-02: every review anchor uses the original declared-unit acceptance set without modifying the schema output',async t=>{
 const cases:{name:string;text:string;quote:string;exact?:string;reason?:Reason;id?:string;second?:string}[]=[
  {name:'exact short',text:'回声。回声。',quote:'回',exact:'回'},
  {name:'exact repeated',text:'回声。回声。',quote:'回声',exact:'回声'},
  {name:'Han layout and UTF16',text:'😀首。甲𠀀\r\n丙丁戊己庚辛。尾😀',quote:'甲𠀀丙丁戊己庚辛',exact:'甲𠀀\r\n丙丁戊己庚辛'},
  {name:'Latin whitespace',text:'abcdefgh\r\nijklmnop',quote:'abcdefgh ijklmnop',exact:'abcdefgh\r\nijklmnop'},
  {name:'unknown unit',text:'甲乙丙丁戊己庚辛。',quote:'甲乙丙丁戊己庚辛',id:foreignId,reason:'unknown-unit'},
  {name:'layout too short',text:'甲乙\r\n丙丁。',quote:'甲乙丙丁',reason:'too-short'},
  {name:'layout ambiguous',text:'甲乙\r\n丙丁戊己庚辛。甲乙\t丙丁戊己庚辛',quote:'甲乙丙丁戊己庚辛',reason:'ambiguous'},
  {name:'no match',text:source,quote:quoteSecret,reason:'no-match'},
  {name:'Latin word boundary',text:'abcdefgh ijklmnop',quote:'abcdefghijklmnop',reason:'no-match'},
  {name:'digit word boundary',text:'1234 5678',quote:'12345678',reason:'no-match'},
  {name:'cross-unit join',text:'甲乙丙丁',second:'戊己庚辛',quote:'甲乙丙丁戊己庚辛',reason:'no-match'},
  {name:'noncontiguous join',text:'甲乙丙丁隔戊己庚辛',quote:'甲乙丙丁戊己庚辛',reason:'no-match'},
  {name:'other-unit verbatim must not rebind review',text:'本单元完全不同的内容。',second:'这条合成引文仅存在于另一单元',quote:'这条合成引文仅存在于另一单元',reason:'no-match'}
 ]
 for(const branch of ['conflicts','missingTargets'] as const)for(const item of cases)await t.test(branch+' '+item.name,async()=>{
  const input=request(item.text);if(item.second)input.units.push({...input.units[0],id:'ra-other-unit',text:item.second,start:item.text.length,end:item.text.length+item.second.length})
  const before=structuredClone(input),raw=response(branch,[{unitId:item.id??unitId,quote:item.quote}]),snapshot=structuredClone(raw),checked=importAiResponseSchema(input).safeParse(raw)
  assert.equal(checked.success,!item.reason,item.name+' independent expected acceptance')
  if(item.reason){
   assert.ok(!checked.success);assert.deepEqual(checked.error.issues.map(issue=>issue.path),[[branch,0,'evidence',0]]);assert.deepEqual(checked.error.issues.map(issue=>issue.message),[guidance[item.reason]])
   const prompts:string[]=[];await assert.rejects(generateImportAiJson(input,context,new AbortController().signal,importAiPrompt(input),{generateText:async opts=>{prompts.push('prompt'in opts?opts.prompt:'');return generated(raw)}}),error=>error instanceof StructuredGenerationError&&error.kind==='invalid_schema');assert.equal(prompts.length,2);const feedback=prompts[1].slice(prompts[0].length);assert.ok(feedback.includes(guidance[item.reason]));assertSafeFeedback(feedback,[item.quote,item.text])
   await assert.rejects(direct(input,raw),/结构|类别/)
  }else{
   assert.ok(checked.success);assert.deepEqual(checked.data,raw,'early check does not restore or trim quote')
   const value=structuredClone(raw);for(const entry of value[branch]![0].evidence)entry.quote=item.exact!;assert.deepEqual(await direct(input,raw),expected(value),'only the unchanged final matcher restores exact source layout')
   let calls=0;assert.deepEqual(await generateImportAiJson(input,context,new AbortController().signal,importAiPrompt(input),{generateText:async()=>{calls++;return generated(raw)}}),raw);assert.equal(calls,1)
  }
  assert.deepEqual(input,before);assert.deepEqual(raw,snapshot)
 })
 await t.test('all entries and both result arrays are checked; a bad middle entry cannot be dropped',async()=>{
  const input=request(),valid={unitId,quote:'这里是一处小室'},second={unitId,quote:'合成原文首句'},raw={conflicts:[conflict([valid,second,{unitId,quote:quoteSecret},valid])],missingTargets:response('missingTargets',[valid,second,{unitId:foreignId,quote:quoteSecret},valid]).missingTargets},before=structuredClone(raw),checked=importAiResponseSchema(input).safeParse(raw)
  assert.ok(!checked.success);assert.deepEqual(checked.error.issues.map(issue=>issue.path.join('.')).sort(),['conflicts.0.evidence.2','missingTargets.0.evidence.2']);assert.deepEqual(checked.error.issues.map(issue=>issue.message).sort(),[guidance['no-match'],guidance['unknown-unit']].sort());assert.deepEqual(raw,before)
  await assert.rejects(direct(input,raw),/结构|类别/)
 })
})

test('RA-03: exact scope preserves other schemas, and transport, authorization and abort errors do not become schema retries',async t=>{
 await t.test('other protocols, targets and stages retain their old early acceptance',async()=>{
  const input=request(),bad=response('conflicts',[{unitId,quote:quoteSecret}]),variants:ImportAiRequest[]=[{...input,selectedTargets:['character']},{...input,selectedTargets:['scene','world']},{...input,selectedTargets:[]},{...input,selectedTargets:undefined},{...input,semanticVersion:undefined,selectedTargets:undefined},{...input,phase:'classify'},{...input,phase:'patch'},{...input,phase:'analyze',kind:'scene'}]
  for(const other of variants){const raw=other.phase==='classify'?{...bad,classifications:other.units.map(u=>({unitId:u.id,kind:'body' as const}))}:other.semanticVersion===undefined?{conflicts:bad.conflicts}:bad;const before=structuredClone(other),snapshot=structuredClone(raw);assert.deepEqual(importAiResponseSchema(other).parse(raw),raw,'scope remains exact');assert.deepEqual(other,before);assert.deepEqual(raw,snapshot)}
  for(const other of variants.filter(r=>r.phase==='review'))await assert.rejects(direct(other,other.semanticVersion===undefined?{conflicts:bad.conflicts}:bad),error=>error instanceof Error&&error.message==='模型证据无法定位（no-match）','old late matcher remains active')
 })
 await t.test('network, provider authorization and abort identity pass through the actual bridge once',async()=>{
  for(const name of ['NetworkError','AuthorizationError','AbortError']){const input=request(),controller=new AbortController(),failure=Object.assign(new Error('RA-'+name+'-SYNTHETIC-SECRET'),{name});let calls=0;await assert.rejects(runImportAi(input,controller.signal,{resolve:async()=>reviewModel,assert:async()=>{},generate:async(r,_m,signal,prompt)=>generateImportAiJson(r,context,signal,prompt,{generateText:async()=>{calls++;if(name==='AbortError')controller.abort(failure);throw failure}})}),error=>error===failure);assert.equal(calls,1)}
 })
 await t.test('initial authorization failure never generates',async()=>{const failure=new Error('RA-AUTH-SYNTHETIC-SECRET');let calls=0;await assert.rejects(runImportAi(request(),new AbortController().signal,{resolve:async()=>reviewModel,assert:async()=>{throw failure},generate:async()=>{calls++;return {conflicts:[]}}}),error=>error===failure);assert.equal(calls,0)})
})

test('RA-04: corrected review evidence cannot bypass stage, source range, projection or final authorization gates',async t=>{
 await t.test('conflict references keep late rejection; eligible omission gates use the existing bounded correction',async()=>{
  const input=request(),valid={unitId,quote:'这里是一处小室'},outside=conflict([valid]);outside.candidate.artifactId=foreignId
  const wrongUnit=conflict([valid]);wrongUnit.candidate.unitId=foreignId
  const invalids:ImportAiResult[]=[{conflicts:[outside]},{conflicts:[wrongUnit]},{missingTargets:[{...response('missingTargets',[valid]).missingTargets![0],unitIds:[foreignId]}]},{missingTargets:[{...response('missingTargets',[valid]).missingTargets![0],artifactId:foreignId,field:'text',baseHash:'a'.repeat(64)}]},{artifacts:[{id:'ra-forbidden-artifact',kind:'scene',name:'越阶段资料',text:'完整越阶段正文',facts:{entityType:'PLACE'},origin:'inferred',sourceUnitIds:[unitId],evidence:[valid]}]}]
  for(const raw of invalids){const before=structuredClone(raw),omission=!!raw.missingTargets?.length;assert.equal(importAiResponseSchema(input).safeParse(raw).success,true,'the base parser alone is not an acceptance certificate');let calls=0;await assert.rejects(runImportAi(input,new AbortController().signal,{resolve:async()=>reviewModel,assert:async()=>{},generate:async(r,_m,signal,prompt)=>generateImportAiJson(r,context,signal,prompt,{generateText:async()=>{calls++;return generated(raw)}})}),error=>omission?error instanceof StructuredGenerationError&&error.kind==='invalid_schema'&&error.invalidFields.includes('missingTargets.0'):error instanceof Error&&/引用|范围|投影|阶段|越权/u.test(error.message));assert.equal(calls,omission?2:1);assert.deepEqual(raw,before)}
 })
 await t.test('successful correction still requires the final authorization, snapshot and cancellation checks',async()=>{
  for(const mode of ['authorization','snapshot','abort'] as const){const input=request(),before=structuredClone(input),controller=new AbortController(),failure=new Error('RA-FINAL-'+mode+'-SYNTHETIC-SECRET'),good=response('missingTargets',[{unitId,quote:'这里是一处小室'}]),bad=response('missingTargets',[{unitId,quote:quoteSecret}]);let generations=0,assertions=0,resolutions=0
   await assert.rejects(runImportAi(input,controller.signal,{resolve:async()=>{resolutions++;return mode==='snapshot'&&resolutions===2?{...reviewModel,authRevision:2}:reviewModel},assert:async()=>{assertions++;if(mode==='authorization'&&assertions===2)throw failure},generate:async(r,_m,signal,prompt)=>generateImportAiJson(r,context,signal,prompt,{generateText:async()=>{generations++;if(mode==='abort'&&generations===2)controller.abort(failure);return generated(generations===1?bad:good)}})}),error=>mode==='snapshot'?error instanceof Error&&error.message==='模型配置或授权已变化，未采用返回结果':error===failure)
   assert.equal(generations,2);assert.equal(assertions,mode==='abort'?1:2);assert.equal(resolutions,mode==='snapshot'?2:1);assert.deepEqual(input,before)
  }
 })
})
