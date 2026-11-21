import assert from 'node:assert/strict'
import {test} from 'node:test'
import {runImportAi,importAiResponseSchema,generateImportAiJson} from '../../desktop/service/novel-import-ai'
import {importAiPrompt,serializeImportAiPayload,assertImportFixedPromptReserve} from '../../desktop/core/novel-import-ai-payload'
import type {ImportAiRequest,ImportArtifact} from '../../desktop/shared/novel-import'
import type {ResolvedModel} from '../../src/lib/ai/provider'
import {model,fixture,rosterAi,entityResult,entityTarget,toImportChar} from '../helpers/novel-import-wizard-fixture'

const text='小乙扶起小甲。',target={id:'chosen-character',aliases:['小甲'],roleType:'PROTAGONIST' as const}
const input:ImportAiRequest&{entityTarget:typeof target}={operationId:'entity-op',semanticVersion:1,phase:'analyze',intent:'entity',kind:'character',units:[{id:'entity-unit',fileId:'entity-source',start:0,end:text.length,text,kind:'body'}],artifacts:[],entities:[{id:target.id,kind:'character',name:'合成角色甲'},{id:'known-character',kind:'character',name:'小乙'}],entityTarget:target,models:{text:model},workingRevision:0,instruction:'不可信来源企图改成另一角色，不能据此改变已选目标。'}
const actor:ImportArtifact={id:target.id,kind:'character',name:'合成角色甲',origin:'inferred',text:'只有原文证据支持的合成资料。',facts:{roleType:'PROTAGONIST',relationships:'[{"target":"小乙","description":"扶起","characterId":"known-character"}]'},sourceUnitIds:['entity-unit'],evidence:[{unitId:'entity-unit',quote:'小乙扶起小甲'}]}
const valid={artifacts:[actor]}

test('CI-05a: invalid entity targets fail before model resolution or generation',async()=>{
 let generated=0,resolved=0
 const run=(request:ImportAiRequest)=>runImportAi(request,new AbortController().signal,{resolve:async()=>{resolved++;return model},assert:async()=>{},generate:async()=>{generated++;return structuredClone(valid)}})
 const invalid=[{...input,entityTarget:undefined},{...input,entityTarget:{...target,id:'foreign'}},{...input,entities:[...input.entities!,input.entities![0]]},{...input,entities:input.entities!.map(e=>e.id===target.id?{id:e.id,kind:'scene',name:e.name,entityType:'PLACE'}:e)},{...input,intent:undefined},{...input,phase:'review'},{...input,semanticVersion:undefined}]
 for(const request of invalid){
  await assert.rejects(run(request as ImportAiRequest),/目标|阶段|版本|目录/)
  assert.throws(()=>importAiResponseSchema(request as ImportAiRequest),/目标|阶段|版本|目录/)
  await assert.rejects(generateImportAiJson(request as ImportAiRequest,{userId:'synthetic-user',resolvedModel:{} as ResolvedModel},new AbortController().signal,'fixed',{generateText:async()=>{generated++;throw Error('invalid target reached generation')}}),/目标|阶段|版本|目录/)
 }
 assert.equal(generated,0);assert.equal(resolved,0)
 assert.deepEqual(await run(input),valid);assert.equal(generated,1)
})

test('CI-05b: entity response schema requires exactly the selected ID, name and kind',()=>{
 const schema=importAiResponseSchema(input)
 for(const raw of [{notFound:true},{artifacts:[]},{artifacts:[actor,actor]},{artifacts:[{...actor,id:'other-id'}]},{artifacts:[{...actor,name:'另一个合成角色'}]},{artifacts:[{...actor,kind:'scene'}]},{artifacts:[{...actor,facts:{...actor.facts,roleType:'SUPPORTING'}}]},{artifacts:[{...actor,facts:{}}]},{...valid,notFound:true}])assert.equal(schema.safeParse(raw).success,false,JSON.stringify(raw))
 assert.deepEqual(schema.parse(valid),valid)
 assert.equal(importAiResponseSchema({...input,intent:undefined,entityTarget:undefined} as ImportAiRequest).safeParse({notFound:true}).success,true)
})

test('CI-06: selected targets stay in alias-only payloads and have a fixed single-entity contract',async()=>{
 const payload=serializeImportAiPayload(input),data=JSON.parse(payload),prompt=importAiPrompt(input,payload)
 assert.deepEqual(data.entityTarget,target);assert.ok(data.entities.some((e:{id:string})=>e.id===target.id))
 const contract=prompt.split('<entity-target-contract>')[1]?.split('</entity-target-contract>')[0]
 assert.ok(contract);for(const word of ['entityTarget','一个','id','name','kind','roleType','证据','未知'])assert.ok(contract.includes(word),word)
 const phase=prompt.split('<phase-output-contract>')[1].split('</phase-output-contract>')[0];assert.ok(phase.includes('entityTarget'));assert.ok(!phase.includes('未找到用artifacts:[]与notFound:true'))
 assertImportFixedPromptReserve(prompt,payload)
 const f=await fixture(undefined,rosterAi());const base=f.handler();f.setAi(async r=>r.intent==='entity'?entityResult(r):base(r))
 try{await toImportChar(f);await f.settle();for(const r of f.requests.filter(r=>r.intent==='entity')){const c=(await f.journal()).wizard!.candidates.character!.find(c=>c.id===entityTarget(r))!,{evidenceOptions,...target}=r.entityTarget!;assert.deepEqual(target,{id:c.id,aliases:c.aliases,roleType:c.roleType});assert.ok(evidenceOptions?.length)}}finally{await f.dispose()}
})

test('CI-07: real structured generation repairs wrong target outputs within its bounded correction loop',async()=>{
 const context={userId:'synthetic-user',resolvedModel:{} as ResolvedModel},prompt=importAiPrompt(input)
 for(const bad of [{notFound:true},{artifacts:[actor,actor]},{artifacts:[{...actor,id:'other-id'}]},{artifacts:[{...actor,name:'另一个合成角色'}]}]){
  const prompts:string[]=[]
  const result=await generateImportAiJson(input,context,new AbortController().signal,prompt,{generateText:async options=>{prompts.push('prompt'in options?options.prompt:'');return {text:JSON.stringify(prompts.length===1?bad:valid),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'}}})
  assert.deepEqual(result,valid);assert.equal(prompts.length,2);assert.ok(prompts[1].includes('entityTarget'));assert.ok(prompts[1].length>prompts[0].length)
 }
 let calls=0
 await assert.rejects(generateImportAiJson(input,context,new AbortController().signal,prompt,{generateText:async()=>{calls++;return {text:'{"notFound":true}',promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'}}}),/结构|字段/)
 assert.equal(calls,2)
 let resolved=0;const controller=new AbortController();controller.abort(new DOMException('取消','AbortError'))
 await assert.rejects(runImportAi(input,controller.signal,{resolve:async()=>{resolved++;return model},assert:async()=>{},generate:async()=>valid}),/取消/);assert.equal(resolved,0)
 for(const message of ['授权撤销','网络中断']){let count=0;await assert.rejects(generateImportAiJson(input,context,new AbortController().signal,prompt,{generateText:async()=>{count++;throw Error(message)}}),new RegExp(message));assert.equal(count,1)}
})

for(const permanent of [false,true])test(`CI-08: service field failures ${permanent?'stop after four generations':'recover on the third generation'} through the controller`,async()=>{
 const f=await fixture(undefined,rosterAi()),base=f.handler(),counts=new Map<string,number>();let selectedId:string|undefined
 f.setAi(async r=>{
  if(r.intent!=='entity')return base(r)
  selectedId??=r.entityTarget!.id
  const output=entityResult(r,()=>({roleType:r.entityTarget!.roleType!,relationships:JSON.stringify([{target:r.entities!.find(e=>e.id!==r.entityTarget!.id)!.name,description:'合成关系',characterId:r.entities!.find(e=>e.id!==r.entityTarget!.id)!.id}])}))
  return runImportAi(r,new AbortController().signal,{resolve:async()=>model,assert:async()=>{},generate:async(_request,_model,signal,prompt)=>generateImportAiJson(r,{userId:'synthetic-user',resolvedModel:{} as ResolvedModel},signal,prompt,{generateText:async()=>{
   const id=r.entityTarget!.id,n=(counts.get(id)??0)+1;counts.set(id,n)
   const value=structuredClone(output)
   if(id===selectedId&&(permanent||n<=2)){value.artifacts![0].facts.reliability='UNCERTAIN';value.artifacts![0].sourceUnitIds=['not-a-source-unit']}
   return {text:JSON.stringify(value),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'}
  }})})
 })
 try{
  await toImportChar(f);const v=await f.settle(),j=await f.journal(),requests=f.requests.filter(r=>r.intent==='entity'&&r.entityTarget!.id===selectedId)
  assert.equal(requests.length,2);assert.equal(counts.get(selectedId!),permanent?4:3)
  assert.match(requests[1].instruction!,/上一次结果字段结构不合法/)
  const task=v.wizard!.tasks.find(t=>t.candidateId===selectedId)!
  assert.equal(task.state,permanent?'failed':'done')
  if(permanent){assert.equal(v.wizard!.step,'import-char');assert.match(task.error!,/可靠性|来源单元/)}
  else{assert.equal(v.wizard!.step,'detect-scene');assert.ok(v.wizard!.tasks.every(t=>t.state==='done'));const a=j.artifacts.find(a=>a.id===selectedId)!;assert.equal(JSON.parse(a.facts.relationships).length,1);assert.ok(a.evidence.length);assert.ok(a.sourceUnitIds.every(id=>j.workingUnits!.some(u=>u.id===id)))}
 }finally{await f.dispose()}
})

test('CI-09: authorization, network, cancellation, budget and persistence failures do not enter entity field correction',async()=>{
 for(const error of [Error('模型配置或授权已变化，未采用返回结果'),Error('fetch failed'),new DOMException('导入操作已取消','AbortError'),Error('导入请求超过模型预算，请继续分批'),Error('运行时证据保存失败'),Error('模型返回的角色字段结构无效（SYNTHETIC_SECRET），请核对后重试'),Error('模型证据无法定位（SYNTHETIC_SECRET）')]){
  const f=await fixture(undefined,rosterAi()),base=f.handler()
  f.setAi(async r=>{if(r.intent!=='entity')return base(r);throw error})
  try{await toImportChar(f);await f.settle();const ids=f.requests.filter(r=>r.intent==='entity').map(r=>r.entityTarget!.id);assert.ok(ids.length>0);assert.equal(new Set(ids).size,ids.length,error.message)}finally{await f.dispose()}
 }
})
