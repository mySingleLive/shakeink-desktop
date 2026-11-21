// Compatibility: controller cases here use genuine versionless scene journals.
import assert from 'node:assert/strict'
import {test} from 'node:test'
import {generateImportAiJson,runImportAi} from '../../desktop/service/novel-import-ai'
import {importAiPrompt,serializeImportAiPayload} from '../../desktop/core/novel-import-ai-payload'
import type {ImportAiRequest,ImportArtifact} from '../../desktop/shared/novel-import'
import type {ResolvedModel} from '../../src/lib/ai/provider'
import {legacySceneFixture,rosterAi,entityResult,toImportScene,model} from '../helpers/novel-import-wizard-fixture'

const request:ImportAiRequest={semanticVersion:1,operationId:'scene-links',phase:'analyze',intent:'entity',kind:'scene',entityTarget:{id:'s-child',aliases:[]},units:[{id:'u-one',fileId:'f-one',start:0,end:13,text:'北城南巷是一条灯火通明的街道。',kind:'body'}],artifacts:[],entities:[{id:'s-child',kind:'scene',name:'南巷',entityType:'PLACE',parentId:'s-parent'},{id:'s-parent',kind:'scene',name:'北城',entityType:'PLACE'},{id:'s-other',kind:'scene',name:'未在本单元出现的远郊',entityType:'PLACE'},{id:'c-one',kind:'character',name:'合成人物'},{id:'i-one',kind:'item',name:'合成物品'}],workingRevision:0,models:{text:model}}
const actor:ImportArtifact={id:'s-child',kind:'scene',name:'南巷',text:'完整合成场景正文与相关人物、物品信息。',facts:{entityType:'PLACE',parentId:'s-parent',exteriorDescription:'街面',interiorDescription:'灯火',backstory:'旧街',entryMethod:'步行',characterId:'c-one',sceneId:'s-other',itemId:'i-one'},evidence:[{unitId:'u-one',quote:'北城南巷是一条灯火通明的街道'}],sourceUnitIds:['u-one'],origin:'inferred'}
const context={userId:'synthetic',resolvedModel:{} as ResolvedModel},labels={parentId:'场景身份与上级关系',characterId:'关联角色引用',sceneId:'关联地点引用',itemId:'关联物品引用'}
type Field=keyof typeof labels
const cases:{field:Field;value:string;root?:boolean}[]=[{field:'parentId',value:'s-other'},{field:'parentId',value:'SYNTHETIC-PRIVATE'},{field:'parentId',value:'s-parent',root:true},...(['characterId','sceneId','itemId'] as const).flatMap(field=>[{field,value:'SYNTHETIC-PRIVATE'},{field,value:field==='sceneId'?'c-one':'s-other'}])]
function pair(root=false){
 const req=structuredClone(request),valid=structuredClone(actor)
 if(root){delete req.entities![0].parentId;delete valid.facts.parentId}
 return {req,valid}
}
test('SL-01: each rejected scene parent or typed link gets exact static field guidance and recovers without losing data',async()=>{
 for(const {field,value,root} of cases){
  const {req,valid}=pair(root),invalid={...valid,facts:{...valid.facts,[field]:value}},prompts:string[]=[]
  const result=await generateImportAiJson(req,context,new AbortController().signal,importAiPrompt(req),{generateText:async opts=>{prompts.push('prompt' in opts?opts.prompt:'');return {text:JSON.stringify({artifacts:[prompts.length===1?invalid:valid]}),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'}}})
  assert.equal(prompts.length,2);assert.ok(prompts[1].includes('artifacts.0.facts.'+field),field);assert.ok(prompts[1].includes(field+'必须'),field);assert.ok(!prompts[1].includes('SYNTHETIC-PRIVATE'));assert.deepEqual(result,{artifacts:[valid]})
 }
})
test('SL-02: permanent invalid links stay rejected after two generations with safe final field diagnostics',async()=>{
 for(const {field,value,root} of cases){const {req,valid}=pair(root);let count=0
  await assert.rejects(generateImportAiJson(req,context,new AbortController().signal,importAiPrompt(req),{generateText:async()=>({text:JSON.stringify({artifacts:[{...valid,facts:{...valid.facts,[field]:value}}]}),promptTokens:(count++,0),completionTokens:0,cost:0,finishReason:'stop'})}),(error:Error&{invalidFields?:string[];feedback?:string[]})=>{
   assert.ok(error.invalidFields?.includes('artifacts.0.facts.'+field),field);assert.ok(error.feedback?.some(line=>line.startsWith('artifacts.0.facts.'+field+': '+field+'必须')));assert.ok(error.message.includes(labels[field]));assert.ok(!/SYNTHETIC-PRIVATE|s-other|s-parent|南巷/u.test(error.message));return true
  });assert.equal(count,2)
 }
})
for(const permanent of [false,true])test('SL-03/04: scene link outer correction '+(permanent?'stops at four generations':'recovers on generation three with exact guidance'),async()=>{
 const f=await legacySceneFixture(undefined,rosterAi()),base=f.handler(),generations=new Map<string,number>(),calls=new Map<string,number>();let target:string|undefined
 f.setAi(async r=>{
  if(r.intent!=='entity')return base(r)
  const id=r.entityTarget!.id;target??=id;calls.set(id,(calls.get(id)??0)+1)
  if(id===target&&calls.get(id)===2){assert.ok(r.instruction?.includes('sceneId必须使用可信实体目录中kind为scene的id'));assert.ok(!r.instruction?.includes('SYNTHETIC-PRIVATE'))}
  const own=r.entities!.find(e=>e.id===id)!,valid=entityResult(r,()=>({entityType:'PLACE',...(own.parentId?{parentId:own.parentId}:{}),backstory:'完整合成背景'}))
  return runImportAi(r,new AbortController().signal,{resolve:async()=>model,assert:async()=>{},generate:async(_req,_m,signal,prompt)=>generateImportAiJson(r,context,signal,prompt,{generateText:async()=>{
   const n=(generations.get(id)??0)+1;generations.set(id,n);const result=structuredClone(valid)
   if(id===target&&(permanent||n<=2))result.artifacts![0].facts.sceneId='SYNTHETIC-PRIVATE'
   return {text:JSON.stringify(result),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'}
  }})})
 })
 try{await toImportScene(f);const v=await f.settle(),s=await f.journal();assert.ok(target);assert.equal(calls.get(target),2);assert.equal(generations.get(target),permanent?4:3);assert.deepEqual(s.wizard!.skipped,[])
  if(permanent){assert.equal(v.wizard!.tasks.find(t=>t.candidateId===target)!.state,'failed');assert.ok(!s.artifacts.some(a=>a.id===target))}
  else{assert.equal(v.wizard!.step,'verify');assert.ok(s.wizard!.tasks.every(t=>t.state==='done'));assert.deepEqual(s.artifacts.map(a=>a.id).sort(),s.wizard!.candidates.scene!.map(c=>c.id).sort());assert.ok(s.artifacts.every(a=>a.facts.backstory==='完整合成背景'))}
 }finally{await f.dispose()}
})
test('SL-05: full catalog, context artifact and self links remain accepted and final diagnostics never inherit a previous field',async()=>{
 const run=(req:ImportAiRequest,value:unknown)=>generateImportAiJson(req,context,new AbortController().signal,importAiPrompt(req),{generateText:async()=>({text:JSON.stringify(value),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'})})
 assert.ok(!JSON.parse(serializeImportAiPayload(request)).entities.some((e:{id:string})=>e.id==='s-other'))
 const before=structuredClone(request);assert.deepEqual(await run(request,{artifacts:[actor]}),{artifacts:[actor]});assert.deepEqual(request,before)
 const contextOnly={...request,entities:request.entities!.filter(e=>e.id!=='s-other'),artifacts:[{...actor,id:'s-other',name:'合成上下文地点',origin:'source' as const,text:'合成原始资料',facts:{}}]}
 assert.deepEqual(await run(contextOnly,{artifacts:[actor]}),{artifacts:[actor]})
 assert.deepEqual(await run(request,{artifacts:[{...actor,facts:{...actor.facts,sceneId:'s-child'}}]}),{artifacts:[{...actor,facts:{...actor.facts,sceneId:'s-child'}}]})
 for(const next of ['network','cancel','structural','other-link'] as const){let count=0;await assert.rejects(generateImportAiJson(request,context,new AbortController().signal,importAiPrompt(request),{generateText:async()=>{
  count++;if(count===2&&next==='network')throw Error('网络中断')
  if(count===2&&next==='cancel')throw new DOMException('取消','AbortError')
  return {text:JSON.stringify({artifacts:[{...actor,facts:{...actor.facts,...(count===1?{sceneId:'SYNTHETIC-PRIVATE'}:next==='other-link'?{itemId:'SYNTHETIC-PRIVATE'}:{unknown:'SYNTHETIC-PRIVATE'})}}]}),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'}
 }}),(error:Error)=>{assert.ok(!error.message.includes('关联地点引用'));assert.ok(!error.message.includes('SYNTHETIC-PRIVATE'));if(next==='other-link')assert.ok(error.message.includes('关联物品引用'));if(next==='cancel')assert.equal(error.name,'AbortError');return true});assert.equal(count,2)}
 const ordinary={...request,intent:undefined,entityTarget:undefined},minimal={...actor,facts:{entityType:'PLACE',parentId:'s-parent',sceneId:'SYNTHETIC-PRIVATE'}}
 await assert.rejects(run(ordinary,{artifacts:[minimal]}),(error:Error&{invalidFields?:string[]})=>{assert.ok(!error.invalidFields?.includes('artifacts.0.facts.sceneId'));assert.ok(!error.message.includes('关联地点引用'));return true})
})
test('SL-05b: unknown or extended scene link error labels cannot gain an outer correction',async()=>{
 for(const message of ['模型返回的场景资料结构无效（关联地点引用），请重新导入SYNTHETIC-PRIVATE','模型返回的场景资料结构无效（未知关联引用），请重新导入']){
  const f=await legacySceneFixture(undefined,rosterAi()),base=f.handler(),counts=new Map<string,number>()
  f.setAi(async r=>{if(r.intent!=='entity')return base(r);const id=r.entityTarget!.id;counts.set(id,(counts.get(id)??0)+1);throw Error(message)})
  try{await toImportScene(f);await f.settle();assert.ok(counts.size>0);assert.ok([...counts.values()].every(n=>n===1))}finally{await f.dispose()}
 }
})
