import assert from 'node:assert/strict'
import {test} from 'node:test'
import {runImportAi,importRosterModel,type ImportAiDependencies} from '../../desktop/service/novel-import-ai'
import {importAiPrompt} from '../../desktop/core/novel-import-ai-payload'
import type {ResolvedModel} from '../../src/lib/ai/provider'
import type {ImportAiRequest,ImportModel} from '../../desktop/shared/novel-import'

/* Synthetic roster requests (docs/239 RA/RT). No real novel text, no keys. */
const model:ImportModel={id:'text',name:'合成模型',modelId:'synthetic',endpoint:'https://model.invalid/v1',authRevision:1,contextWindow:1048576}
const units=[{id:'u1',fileId:'f',start:0,end:12,text:'开篇只有风声与雨。',kind:'body' as const},{id:'u2',fileId:'f',start:12,end:30,text:'沈砚推门而入，砚哥笑了。',kind:'body' as const}]
const request=(kind:ImportAiRequest['kind'],intent:'roster'|'touches'='roster'):ImportAiRequest=>({semanticVersion:1,operationId:'22222222-2222-4222-8222-222222222222',phase:'analyze',intent,kind,units,artifacts:[],entities:[],workingRevision:0,models:{text:model}} as ImportAiRequest)
const deps=(raw:unknown):ImportAiDependencies=>({resolve:async()=>model,assert:async()=>{},generate:async()=>structuredClone(raw)})
const run=(r:ImportAiRequest,raw:unknown)=>runImportAi(r,new AbortController().signal,deps(raw))

test('RA-01: a roster entry without evidence is located at the first unit naming it',async()=>{
 const out=await run(request('character'),{roster:[{name:'沈砚',aliases:[],roleType:'PROTAGONIST'}]})
 assert.deepEqual(out.roster,[{name:'沈砚',aliases:[],roleType:'PROTAGONIST',evidence:{unitId:'u2',quote:'沈砚'}}])
})
test('RA-02: an entry found only by its alias cites that alias',async()=>{
 const out=await run(request('character'),{roster:[{name:'沈公子',aliases:['砚哥'],roleType:'SUPPORTING'}]})
 assert.deepEqual(out.roster![0].evidence,{unitId:'u2',quote:'砚哥'})
})
test('RA-03: a name absent from every unit is dropped',async()=>{
 const out=await run(request('character'),{roster:[{name:'无名氏',aliases:['无影'],roleType:'SUPPORTING'},{name:'沈砚',aliases:[],roleType:'PROTAGONIST'}]})
 assert.deepEqual(out.roster!.map(e=>e.name),['沈砚'])
})
test('RA-04: model evidence that locates is kept',async()=>{
 const out=await run(request('character'),{roster:[{name:'沈砚',aliases:[],roleType:'PROTAGONIST',evidence:{unitId:'u2',quote:'推门而入'}}]})
 assert.deepEqual(out.roster![0].evidence,{unitId:'u2',quote:'推门而入'})
})
test('RA-05: model evidence that does not locate falls back to the name',async()=>{
 const out=await run(request('character'),{roster:[{name:'沈砚',aliases:[],roleType:'PROTAGONIST',evidence:{unitId:'u1',quote:'不存在的引文片段内容'}}]})
 assert.deepEqual(out.roster![0].evidence,{unitId:'u2',quote:'沈砚'})
})
test('RA-06: other roster field rules are unchanged',async()=>{
 for(const bad of [{name:'沈砚',aliases:[],roleType:'HERO'},{name:'沈砚',aliases:[],roleType:'PROTAGONIST',extra:1},{name:' ',aliases:[],roleType:'PROTAGONIST'},{name:'沈砚',aliases:[]}])
  await assert.rejects(run(request('character'),{roster:[bad]}),Error,JSON.stringify(bad))
})
test('RA-07: scenes, items and worlds are located the same way and keep their fields',async()=>{
 const scene=await run(request('scene'),{roster:[{name:'沈砚',aliases:[],parent:'北城'}]})
 assert.deepEqual(scene.roster,[{name:'沈砚',aliases:[],parent:'北城',evidence:{unitId:'u2',quote:'沈砚'}}])
 const item=await run(request('item'),{roster:[{name:'风声',aliases:[],itemType:'信物',important:true,category:'item'}]})
 assert.deepEqual(item.roster,[{name:'风声',aliases:[],itemType:'信物',important:true,category:'item',evidence:{unitId:'u1',quote:'风声'}}])
 const world=await run(request('world'),{roster:[{name:'雨',aliases:[],settings:[{settingType:'SOCIETY',name:'城制'}]}]})
 assert.deepEqual(world.roster,[{name:'雨',aliases:[],settings:[{settingType:'SOCIETY',name:'城制'}],evidence:{unitId:'u1',quote:'雨'}}])
})
test('RA-08: touches still require evidence',async()=>{
 await assert.rejects(run(request(undefined,'touches'),{touches:[{foreshadowKey:'钥匙',title:'钥匙',content:'',touch:{kind:'PLANT',chapterIndex:0,summary:'埋设',quote:'沈砚'}}]}))
})

const resolved:ResolvedModel={model:{} as ResolvedModel['model'],modelRecord:{} as ResolvedModel['modelRecord'],providerOptions:{original:{kept:true}} as unknown as ResolvedModel['providerOptions']}
const saved=(provider:string,modelId:string,thinkingLevels:string[],defaultThinking='high')=>({provider,modelId,thinkingLevels,defaultThinking})
test('RT-01: DeepSeek roster requests turn thinking off',()=>{
 assert.deepEqual(importRosterModel(resolved,saved('deepseek','deepseek-flash',['low','high','max'])).providerOptions,{original:{kept:true},deepseek:{thinking:{type:'disabled'}}})
 assert.equal(importRosterModel(resolved,saved('deepseek','deepseek-flash',['low'])).model,resolved.model)
})
test('RT-02: other providers use their lightest level; models without levels are unchanged',()=>{
 assert.deepEqual(importRosterModel(resolved,saved('anthropic','claude-haiku-5-5',['low','medium','high'])).providerOptions,{original:{kept:true},anthropic:{thinking:{type:'adaptive'},effort:'low'}})
 assert.deepEqual(importRosterModel(resolved,saved('custom','plain',[])).providerOptions,resolved.providerOptions)
 assert.deepEqual(importRosterModel(resolved,saved('openai','gpt-x',['default'])).providerOptions,resolved.providerOptions)
 assert.equal(importRosterModel(resolved,saved('anthropic','claude-haiku-5-5',['low','medium','high'],'default')),resolved,'a thinking-off default is not turned on')
})
test('RT-03: thinking options merge per provider; OpenAI store:false and DeepSeek on the Anthropic protocol are kept',()=>{
 const responses:ResolvedModel={...resolved,providerOptions:{openai:{store:false}} as unknown as ResolvedModel['providerOptions']}
 assert.deepEqual(importRosterModel(responses,{provider:'openai',protocol:'openai',modelId:'gpt-x',thinkingLevels:['low','high'],defaultThinking:'high'}).providerOptions,{openai:{store:false,reasoningEffort:'low'}})
 assert.deepEqual(importRosterModel(resolved,{provider:'deepseek',protocol:'anthropic',modelId:'deepseek-flash',thinkingLevels:[]}).providerOptions,resolved.providerOptions)
})
test('RA-09: every returned roster entry carries evidence from a request unit',async()=>{
 const out=await run(request('character'),{roster:[{name:'沈砚',aliases:[],roleType:'PROTAGONIST'},{name:'砚哥',aliases:[],roleType:'SUPPORTING',evidence:{unitId:'u9',quote:'砚哥'}}]})
 assert.ok(out.roster!.every(e=>e.evidence&&units.some(u=>u.id===e.evidence.unitId&&u.text.includes(e.evidence.quote))))
})
test('WP-04: the whole roster prompt asks for no quotes; other intents keep the evidence rule',()=>{
 const fixed=(r:ImportAiRequest)=>importAiPrompt(r).split('<novel-import-data>')[0]
 for(const kind of ['character','scene','item','world'] as const)for(const word of ['evidence','quote','逐字'])assert.ok(!fixed(request(kind)).includes(word),kind+' '+word)
 assert.ok(fixed(request(undefined,'touches')).includes('每项evidence引用真实输入unitId'))
 assert.ok(fixed({...request('character'),intent:'entity'} as ImportAiRequest).includes('每项evidence引用真实输入unitId'))
})
test('491-F2..F5: item category is optional, null means unknown, other values and other kinds reject it',async()=>{
 const base={name:'风声',aliases:[],itemType:'信物',important:true}
 assert.ok(!('category' in (await run(request('item'),{roster:[base]})).roster![0]),'F2')
 assert.ok(!('category' in (await run(request('item'),{roster:[{...base,category:null}]})).roster![0]),'F3')
 for(const category of ['Item','weapon'])await assert.rejects(run(request('item'),{roster:[{...base,category}]}),Error,'F4 '+category)
 await assert.rejects(run(request('character'),{roster:[{name:'沈砚',aliases:[],roleType:'PROTAGONIST',category:'character'}]}),Error,'F5')
})
