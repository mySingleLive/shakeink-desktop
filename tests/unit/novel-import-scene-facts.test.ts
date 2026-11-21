// Compatibility: controller cases here use genuine versionless scene journals.
import assert from 'node:assert/strict'
import {test} from 'node:test'
import {generateImportAiJson,runImportAi,importAiResponseSchema} from '../../desktop/service/novel-import-ai'
import {importAiPrompt} from '../../desktop/core/novel-import-ai-payload'
import {importFactFields} from '../../desktop/core/novel-import-semantics'
import * as messages from '../../desktop/shared/novel-import-scene-links'
import type {ImportAiRequest,ImportArtifact} from '../../desktop/shared/novel-import'
import type {ResolvedModel} from '../../src/lib/ai/provider'
import {legacySceneFixture,rosterAi,entityResult,toImportScene,model} from '../helpers/novel-import-wizard-fixture'

const request:ImportAiRequest={semanticVersion:1,operationId:'scene-facts',phase:'analyze',intent:'entity',kind:'scene',entityTarget:{id:'s-child',aliases:[]},units:[{id:'u',fileId:'f',start:0,end:14,text:'合成南巷有灯火，位于北城之中。',kind:'body'}],artifacts:[],entities:[{id:'s-child',kind:'scene',name:'南巷',entityType:'PLACE',parentId:'s-parent'},{id:'s-parent',kind:'scene',name:'北城',entityType:'PLACE'},{id:'c',kind:'character',name:'合成人物'},{id:'i',kind:'item',name:'合成物品'}],workingRevision:0,models:{text:model}}
const actor:ImportArtifact={id:'s-child',kind:'scene',name:'南巷',text:'完整合成场景正文及其它有据内容。',facts:{entityType:'PLACE',parentId:'s-parent',coordinates:'北城内部',reliability:'客观事实',attribution:'合成来源',temporalScope:'当前片段',characterId:'c',sceneId:'s-child',itemId:'i',exteriorDescription:'街面',interiorDescription:'灯火',backstory:'旧街',entryMethod:'步行'},evidence:[{unitId:'u',quote:'合成南巷有灯火，位于北城之中'}],sourceUnitIds:['u'],origin:'inferred'},context={userId:'synthetic',resolvedModel:{} as ResolvedModel}
const guide=()=>{const value=(messages as typeof messages&{IMPORT_SCENE_FACT_GUIDANCE?:string}).IMPORT_SCENE_FACT_GUIDANCE;assert.equal(typeof value,'string');return value!}
const invalid={...actor,facts:{...actor.facts,'SYNTHETIC-PRIVATE-KEY':'SYNTHETIC-PRIVATE-VALUE'}}
test('SF-01: exact scene facts guidance reaches the actual second generation without truncated fields or private keys',async()=>{
 let count=0;const result=await generateImportAiJson(request,context,new AbortController().signal,importAiPrompt(request),{generateText:async opts=>{count++;const prompt='prompt' in opts?opts.prompt:'',correction=prompt.slice(prompt.indexOf('上一次输出未通过结构校验'))
  if(count===2){const text=guide();assert.ok(text.length<=250);assert.ok(correction.includes(text));for(const field of importFactFields('scene',2))assert.ok(correction.includes(field),field);assert.ok(!correction.includes('SYNTHETIC-PRIVATE'))}
  return {text:JSON.stringify({artifacts:[count===2&&correction.includes('facts仅允许')?actor:invalid]}),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'}
 }});assert.equal(count,2);assert.deepEqual(result,{artifacts:[actor]})
 let attempts=0;await assert.rejects(generateImportAiJson(request,context,new AbortController().signal,importAiPrompt(request),{generateText:async()=>({text:JSON.stringify({artifacts:[invalid]}),promptTokens:(attempts++,0),completionTokens:0,cost:0,finishReason:'stop'})}),(error:Error&{feedback?:string[]})=>{assert.ok(error.feedback?.some(line=>line==='artifacts.0.facts: '+guide()));assert.ok(!JSON.stringify(error.feedback).includes('SYNTHETIC-PRIVATE'));return true});assert.equal(attempts,2)
})
for(const permanent of [false,true])test('SF-02: full scene facts guidance in outer correction '+(permanent?'fails after four generations':'recovers on generation three'),async()=>{
 const f=await legacySceneFixture(undefined,rosterAi()),base=f.handler(),calls=new Map<string,number>(),generations=new Map<string,number>();let target:string|undefined
 f.setAi(async r=>{if(r.intent!=='entity')return base(r);const id=r.entityTarget!.id;target??=id;calls.set(id,(calls.get(id)??0)+1);if(id===target&&calls.get(id)===2)assert.ok(r.instruction?.includes(guide()))
  const own=r.entities!.find(e=>e.id===id)!,valid=entityResult(r,()=>({entityType:'PLACE',...(own.parentId?{parentId:own.parentId}:{}),exteriorDescription:'外观',interiorDescription:'内观',backstory:'背景',entryMethod:'入口'}))
  return runImportAi(r,new AbortController().signal,{resolve:async()=>model,assert:async()=>{},generate:async(_req,_m,signal,prompt)=>generateImportAiJson(r,context,signal,prompt,{generateText:async()=>{const n=(generations.get(id)??0)+1;generations.set(id,n);const value=structuredClone(valid);if(id===target&&(permanent||n<=2))value.artifacts![0].facts['SYNTHETIC-PRIVATE-KEY']='SYNTHETIC-PRIVATE-VALUE';return {text:JSON.stringify(value),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'}}})})
 })
 try{await toImportScene(f);const v=await f.settle(),s=await f.journal();assert.ok(target);assert.equal(calls.get(target),2);assert.equal(generations.get(target),permanent?4:3);assert.deepEqual(s.wizard!.skipped,[])
  if(permanent){assert.equal(v.wizard!.tasks.find(t=>t.candidateId===target)!.state,'failed');assert.ok(!s.artifacts.some(a=>a.id===target))}else{assert.equal(v.wizard!.step,'verify');assert.ok(s.wizard!.tasks.every(t=>t.state==='done'));for(const a of s.artifacts)for(const [key,value] of Object.entries({exteriorDescription:'外观',interiorDescription:'内观',backstory:'背景',entryMethod:'入口'}))assert.equal(a.facts[key],value)}
 }finally{await f.dispose()}
})
test('SF-03: all thirteen legal fields remain intact while unknown undefined keys and explicit invalid values remain rejected',async()=>{
 assert.equal(importFactFields('scene',2).length,13);assert.deepEqual(Object.keys(actor.facts).sort(),[...importFactFields('scene',2)].sort());const before=structuredClone(request)
 const run=(r:ImportAiRequest,value:unknown)=>runImportAi(r,new AbortController().signal,{resolve:async()=>model,assert:async()=>{},generate:async()=>value})
 assert.deepEqual((await run(request,{artifacts:[actor]})).artifacts![0],actor);assert.deepEqual(request,before)
 assert.equal(importAiResponseSchema(request).safeParse({artifacts:[{...actor,facts:{...actor.facts,unknown:undefined}}]}).success,false)
 for(const facts of [undefined,null,[],1,new Date(0),new Map([['backstory','合成内容']]),new Set(['合成内容']),new String('合成内容'),new class{backstory='合成内容'}, {...actor.facts,backstory:undefined},{...actor.facts,backstory:1},{...actor.facts,entityType:'WORLD'},{...actor.facts,parentId:''},{...actor.facts,parentId:'c'},{...actor.facts,backstory:'\ud800'}])await assert.rejects(run(request,{artifacts:[{...actor,facts}]}))
 const {entityType:_type,parentId:_parent,...business}=actor.facts;assert.deepEqual((await run(request,{artifacts:[{...actor,facts:business}]})).artifacts![0],actor)
 const ordinary={...request,intent:undefined,entityTarget:undefined};assert.equal(importAiResponseSchema(ordinary).safeParse({artifacts:[invalid]}).success,true,'ordinary wire behavior remains unchanged');await assert.rejects(run(ordinary,{artifacts:[invalid]}))
})
