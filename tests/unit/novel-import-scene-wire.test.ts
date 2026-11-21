// Compatibility: controller cases here use genuine versionless scene journals.
import assert from 'node:assert/strict'
import {test} from 'node:test'
import {runImportAi,generateImportAiJson,importAiResponseSchema} from '../../desktop/service/novel-import-ai'
import {importAiPrompt,serializeImportAiPayload} from '../../desktop/core/novel-import-ai-payload'
import type {ImportAiRequest,ImportArtifact} from '../../desktop/shared/novel-import'
import type {ResolvedModel} from '../../src/lib/ai/provider'
import {model,legacySceneFixture,rosterAi,entityResult,toImportScene} from '../helpers/novel-import-wizard-fixture'

const request:ImportAiRequest={semanticVersion:1,operationId:'wire-scene',phase:'analyze',intent:'entity',kind:'scene',entityTarget:{id:'s-one',aliases:['南巷'],evidenceOptions:[{unitId:'u-one',quote:'北城南巷有一扇青铜门'}]},units:[{id:'u-one',fileId:'f-one',start:0,end:12,text:'北城南巷有一扇青铜门。',kind:'body'}],artifacts:[],entities:[{id:'s-one',kind:'scene',name:'南巷',entityType:'PLACE'}],workingRevision:0,models:{text:model}}
const facts={entityType:'PLACE',exteriorDescription:'青石墙',interiorDescription:'灯火',backstory:'旧城街巷',entryMethod:'从北城进入'},actor={id:'s-one',kind:'scene',name:'南巷',text:'完整合成地点资料',facts,evidence:[{optionIndex:0}],origin:'inferred'},raw={artifacts:[actor]},context={userId:'synthetic',resolvedModel:{} as ResolvedModel}
test('SI-09a: scene wire indexes only verified quotes and keeps the complete native profile',async()=>{
 const parsed=importAiResponseSchema(request).parse(raw),a=parsed.artifacts![0]
 assert.deepEqual(a.facts,facts);assert.deepEqual(a.evidence,request.entityTarget!.evidenceOptions);assert.deepEqual(a.sourceUnitIds,['u-one']);assert.equal(a.text,actor.text)
 assert.deepEqual(JSON.parse(serializeImportAiPayload(request)).entityTarget.evidenceOptions,[{...request.entityTarget!.evidenceOptions![0],optionIndex:0}])
 const prompt=importAiPrompt(request);for(const key of ['optionIndex','exteriorDescription','interiorDescription','backstory','entryMethod'])assert.ok(prompt.includes(key),key)
 const run=(req:ImportAiRequest,value:unknown)=>runImportAi(req,new AbortController().signal,{resolve:async()=>model,assert:async()=>{},generate:async()=>structuredClone(value)})
 for(const sourceUnitIds of [undefined,[],['s-one','foreign','u-one']])assert.deepEqual((await run(request,{artifacts:[{...actor,sourceUnitIds}]})).artifacts![0],a)
 for(const evidence of [[{optionIndex:1}],[{optionIndex:'0'}],[{optionIndex:0,quote:'伪造'}],[{unitId:'foreign',quote:request.entityTarget!.evidenceOptions![0].quote}],[{unitId:'u-one',quote:'这是不存在的连续原文片段'}]])await assert.rejects(run(request,{artifacts:[{...actor,evidence}]}))
 await assert.rejects(run({...request,entityTarget:{id:'s-one',aliases:[]}},raw))
 for(const changed of [{...request,intent:undefined,entityTarget:undefined},{...request,kind:'item',entities:[{id:'s-one',kind:'item',name:'南巷'}]}] as ImportAiRequest[])await assert.rejects(run(changed,raw))
 assert.equal(importAiResponseSchema(request).safeParse({artifacts:[{...actor,facts:{...facts,unknown:'保留不了的字段'}}]}).success,false)
 await assert.rejects(run({...request,intent:undefined,entityTarget:undefined},{artifacts:[{...actor,evidence:request.entityTarget!.evidenceOptions,sourceUnitIds:['u-one']}]}),/未支持|结构|字段/u)
})
for(const failure of ['fields','anchor','json','incomplete'] as const)for(const permanent of [false,true])test('SI-09b: scene service '+failure+' '+(permanent?'stop at four generations':'recover on generation three'),async()=>{
 const f=await legacySceneFixture(undefined,rosterAi()),base=f.handler(),counts=new Map<string,number>(),requests=new Map<string,number>();let target:string|undefined
 f.setAi(async r=>{
  if(r.intent!=='entity')return base(r)
  const id=r.entityTarget!.id;target??=id;requests.set(id,(requests.get(id)??0)+1)
  assert.ok(r.entityTarget!.evidenceOptions?.length)
  const own=r.entities!.find(e=>e.id===id)!,valid=entityResult(r,()=>({...facts,...(own.parentId?{parentId:own.parentId}:{})}))
  return runImportAi(r,new AbortController().signal,{resolve:async()=>model,assert:async()=>{},generate:async(_req,_m,signal,prompt)=>generateImportAiJson(r,context,signal,prompt,{generateText:async()=>{
   const n=(counts.get(id)??0)+1;counts.set(id,n);const a=structuredClone(valid.artifacts![0]) as ImportArtifact&{sourceUnitIds?:string[];evidence:unknown[]};delete (a as Partial<ImportArtifact>).sourceUnitIds
   const invalid=id===target&&(permanent||n<=2);a.evidence=[{optionIndex:0} as never];if(invalid){if(failure==='fields')a.facts.unknown='SYNTHETIC-UNKNOWN';else if(failure==='anchor')a.evidence=[{unitId:r.units[0].id,quote:'虚构完全不在本次输入的连续引文'}]}
   return {text:invalid&&failure==='json'?'{invalid-json':JSON.stringify({artifacts:[a]}),promptTokens:0,completionTokens:0,cost:0,finishReason:invalid&&failure==='incomplete'?'length':'stop'}
  }})})
 })
 try{await toImportScene(f);const v=await f.settle(),s=await f.journal();assert.ok(target);assert.equal(counts.get(target),permanent?4:3);assert.equal(requests.get(target),2)
  if(permanent){assert.equal(v.wizard!.step,'import-scene');assert.equal(v.wizard!.tasks.find(t=>t.candidateId===target)!.state,'failed');assert.ok(!s.artifacts.some(a=>a.id===target))}
  else{assert.equal(v.wizard!.step,'verify');assert.ok(v.wizard!.tasks.every(t=>t.state==='done'));for(const a of s.artifacts){assert.equal(a.schema,2);for(const key of Object.keys(facts))assert.equal(a.facts[key],facts[key as keyof typeof facts]);assert.ok(a.evidence.length);assert.ok(a.sourceUnitIds.length)}}
 }finally{await f.dispose()}
})
test('SI-09c: scene outer correction does not retry authorization, network, budget, cancellation or persistence errors',async()=>{
 for(const error of [Error('模型配置或授权已变化，未采用返回结果'),Error('网络中断'),Error('导入请求超过模型预算，请继续分批'),new DOMException('取消','AbortError'),Error('导入运行时证据无法保存，请核对保存目录后重试')]){
  const f=await legacySceneFixture(undefined,rosterAi()),base=f.handler(),counts=new Map<string,number>()
  f.setAi(async r=>{if(r.intent!=='entity')return base(r);const id=r.entityTarget!.id;counts.set(id,(counts.get(id)??0)+1);throw error})
  try{await toImportScene(f);await f.settle();assert.ok(counts.size>0);assert.ok([...counts.values()].every(n=>n===1),error.message)}finally{await f.dispose()}
 }
})
