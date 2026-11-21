import assert from 'node:assert/strict'
import {test} from 'node:test'
import {runImportAi,generateImportAiJson,importAiResponseSchema} from '../../desktop/service/novel-import-ai'
import {importAiPrompt} from '../../desktop/core/novel-import-ai-payload'
import {validateImportSemanticArtifact,IMPORT_SEMANTIC_V2_FIELDS} from '../../desktop/core/novel-import-semantics'
import type {ResolvedModel} from '../../src/lib/ai/provider'
import type {ImportAiRequest,ImportArtifact} from '../../desktop/shared/novel-import'
import {fixture,rosterAi,entityResult,toImportChar,model} from '../helpers/novel-import-wizard-fixture'

const profile={height:'有据的合成身高',weight:'有据的合成体重',build:'合成体型',faceShape:'合成面容',tastes:'合成偏好',habits:'合成习惯',dialogueStyle:'合成对白风格',sampleDialogue:'合成对白首\r\n😀末',personalityTags:'["谨慎","坚定"]',motivations:'[{"items":[{"text":"合成目标","importance":4}]}]',desires:'合成渴望',fears:'合成恐惧',beliefs:'{"worldview":"合成世界理解","values":"合成价值","outlook":"合成态度","other":"合成其它信念"}',bigFive:'{"openness":70,"conscientiousness":80,"extraversion":30,"agreeableness":50,"neuroticism":20}',abilities:'合成能力首\r\n😀末',backstory:'合成背景首\r\n😀末',arcStages:'[{"id":"early","name":"合成开场","chapterIndex":0,"description":"合成成长","tags":["初始"],"markers":[{"kind":"event","text":"合成初遇"}],"changes":[{"dimension":"判断","before":"疑惑","after":"确认"}],"isDebut":true}]'}
const text='合成人物甲与合成人物乙在合成城市相遇。',input:ImportAiRequest={semanticVersion:1,operationId:'profile-op',phase:'analyze',intent:'entity',kind:'character',units:[{id:'profile-unit',fileId:'profile-source',start:0,end:text.length,text,kind:'body'}],artifacts:[],models:{text:model},entities:[{id:'profile-a',kind:'character',name:'合成人物甲'},{id:'profile-b',kind:'character',name:'合成人物乙'}],entityTarget:{id:'profile-a',aliases:[],roleType:'SUPPORTING'},workingRevision:0}
const actor:ImportArtifact={id:'profile-a',kind:'character',name:'合成人物甲',text:'完整合成简介',origin:'inferred',facts:{roleType:'SUPPORTING',relationships:'[{"target":"合成人物乙","description":"相遇","characterId":"profile-b"}]',...profile},sourceUnitIds:['profile-unit'],evidence:[{unitId:'profile-unit',quote:'合成人物甲与合成人物乙'}]},valid={artifacts:[actor]}

test('CP-09a: all 17 native role fields survive the real generation and service/controller chain',async()=>{
 const f=await fixture(undefined,rosterAi()),base=f.handler(),expected=new Map<string,Record<string,string>>()
 f.setAi(async r=>{
  if(r.intent!=='entity')return base(r)
  const other=r.entities!.find(e=>e.id!==r.entityTarget!.id)!,raw=entityResult(r,()=>({roleType:r.entityTarget!.roleType!,relationships:JSON.stringify([{target:other.name,description:'合成关系',characterId:other.id}]),...profile}));expected.set(r.entityTarget!.id,structuredClone(raw.artifacts![0].facts))
  return runImportAi(r,new AbortController().signal,{resolve:async()=>model,assert:async()=>{},generate:async(_r,_m,signal,prompt)=>generateImportAiJson(r,{userId:'synthetic-user',resolvedModel:{} as ResolvedModel},signal,prompt,{generateText:async()=>({text:JSON.stringify(raw),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'})})})
 })
 try{
  await toImportChar(f);const v=await f.settle(),j=await f.journal()
  assert.equal(v.wizard!.step,'detect-scene',JSON.stringify(v.wizard!.tasks.filter(t=>t.state==='failed')));assert.ok(v.wizard!.tasks.every(t=>t.state==='done'))
  assert.equal(Object.keys(profile).length,17);assert.deepEqual(Object.keys(profile).sort(),[...IMPORT_SEMANTIC_V2_FIELDS.character!].sort())
  for(const a of j.artifacts){assert.equal(a.schema,2);assert.deepEqual(a.facts,expected.get(a.id));const decoded=validateImportSemanticArtifact(a);assert.equal(decoded.profile?.kind,'character');if(decoded.profile?.kind==='character'){assert.equal(decoded.profile.value.abilities,profile.abilities);assert.deepEqual(decoded.profile.value.motivations,JSON.parse(profile.motivations));assert.deepEqual(decoded.profile.value.arcStages,JSON.parse(profile.arcStages))}}
 }finally{await f.dispose()}
})

test('CP-09b: native structured fields enter bounded correction while ordinary analyze remains v1',async()=>{
 const context={userId:'synthetic-user',resolvedModel:{} as ResolvedModel},before=structuredClone(valid)
 for(const [field,value] of [['motivations','["错误扁平数组"]'],['bigFive','{"openness":101}'],['arcStages','[{"id":"bad","name":"错误","chapterIndex":-1}]']] as const){
  const bad={artifacts:[{...actor,facts:{...actor.facts,[field]:value}}]}
  assert.equal(importAiResponseSchema(input).safeParse(bad).success,false,field)
  let calls=0;const prompts:string[]=[],result=await generateImportAiJson(input,context,new AbortController().signal,importAiPrompt(input),{generateText:async options=>{prompts.push('prompt'in options?options.prompt:'');return {text:JSON.stringify(++calls===1?bad:valid),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'}}})
  assert.equal(calls,2);assert.deepEqual(result,valid)
  const feedback=prompts[1].slice(prompts[0].length);assert.ok(feedback.includes('artifacts.0.facts.'+field),field);assert.ok(feedback.includes(({motivations:'importance',bigFive:'openness',arcStages:'chapterIndex'} as const)[field]));assert.ok(!feedback.includes(value),'invalid source value is not copied to correction')
 }
 let calls=0
 await assert.rejects(generateImportAiJson(input,context,new AbortController().signal,importAiPrompt(input),{generateText:async()=>{calls++;return {text:JSON.stringify({artifacts:[{...actor,facts:{...actor.facts,motivations:'["持续错误"]'}}]}),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'}}}),/结构|字段/);assert.equal(calls,2)
 await assert.rejects(runImportAi({...input,intent:undefined,entityTarget:undefined},new AbortController().signal,{resolve:async()=>model,assert:async()=>{},generate:async()=>valid}),/未支持|结构/)
 assert.deepEqual(valid,before,'native validation never mutates returned facts or their encoding')
})

test('CP-09c: entity prompt exposes current native field and JSON structure contracts without guessed defaults',()=>{
 const fixed=importAiPrompt(input).split('<novel-import-data>')[0],native=fixed.split('<character-native-profile-contract>')[1]?.split('</character-native-profile-contract>')[0]
 assert.ok(native)
 const fields=JSON.parse(fixed.split('允许字段：')[1].split('。未知')[0]) as {character:string[]}
 for(const key of Object.keys(profile))assert.ok(fields.character.includes(key),key)
 for(const key of ['items','importance','openness','worldview','chapterIndex','markers','changes','未知','省略'])assert.ok(native.includes(key),key)
})
