import assert from 'node:assert/strict'
import {test} from 'node:test'
import {generateImportAiJson,runImportAi} from '../../desktop/service/novel-import-ai'
import {importWorldContentIssues} from '../../desktop/core/novel-import-semantics'
import type {ImportAiRequest,ImportArtifact,ImportModel,ImportUnit} from '../../desktop/shared/novel-import'
import type {ResolvedModel} from '../../src/lib/ai/provider'

/* docs/506 3R5. Synthetic names only; the real generation bridge with only generateText injected. */
const model:ImportModel={id:'world-text',name:'合成模型',modelId:'synthetic',endpoint:'https://synthetic.invalid/v1',authRevision:1,contextWindow:1048576}
const text='合成城邦北面是一片合成盐湖，城邦与东方合成商会长期结盟。'
const unit:ImportUnit={id:'u-w',fileId:'f',start:0,end:text.length,text,kind:'body'}
function request(settingType:string):ImportAiRequest{
 return {semanticVersion:1,operationId:'world-content',phase:'analyze',intent:'entity',kind:'world',entityTarget:{id:'ws-1',aliases:[]},entities:[{id:'w-1',kind:'world',name:'主世界',entityType:'WORLD'},{id:'ws-1',kind:'world',name:'合成盐湖',entityType:'SETTING',worldId:'w-1',settingType:settingType as never}],units:[unit],artifacts:[],workingRevision:0,models:{text:model,review:{...model,id:'world-review'}},instruction:'只导入id为ws-1的设定'}
}
const output=(settingType:string,facts:Record<string,unknown>,body='合成城邦北面的盐湖。'):{artifacts:ImportArtifact[]}=>({artifacts:[{id:'ws-1',kind:'world',name:'合成盐湖',text:body,facts:{entityType:'SETTING',worldId:'w-1',settingType,...facts},evidence:[{unitId:'u-w',quote:'合成城邦北面是一片合成盐湖'}],sourceUnitIds:['u-w'],origin:'inferred'}]})
function bridge(r:ImportAiRequest,outputs:unknown[]){
 let calls=0;const prompts:string[]=[]
 const result=runImportAi(r,new AbortController().signal,{resolve:async role=>r.models[role]!,assert:async()=>{},generate:async(input,_model,signal,prompt)=>generateImportAiJson(input,{userId:'world-synthetic-user',resolvedModel:{} as ResolvedModel,maxNetworkRetries:0},signal,prompt,{generateText:async options=>{assert.ok('prompt' in options);prompts.push(options.prompt);const out=outputs[Math.min(calls++,outputs.length-1)];return {text:JSON.stringify(out),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'}}})})
 return {result,calls:()=>calls,prompts}
}

test('WC-01: a text-type setting without content takes content from its text in one generation',async()=>{
 const b=bridge(request('MAP'),[output('MAP',{})]),result=await b.result
 assert.equal(b.calls(),1);assert.equal(result.artifacts![0].facts.content,JSON.stringify({text:'合成城邦北面的盐湖。'}))
})
test('WC-01b: a text-type setting whose content text is blank takes content from its text; a non-blank or other-key content is kept for the check',async()=>{
 const b=bridge(request('WORLD_HISTORY'),[output('WORLD_HISTORY',{content:JSON.stringify({text:' '})})]),result=await b.result
 assert.equal(b.calls(),1);assert.equal(result.artifacts![0].facts.content,JSON.stringify({text:'合成城邦北面的盐湖。'}))
 const kept=bridge(request('WORLD_HISTORY'),[output('WORLD_HISTORY',{content:JSON.stringify({text:'',description:'甲'})})]);await assert.rejects(kept.result);assert.equal(kept.calls(),2)
})
test('WC-02: FACTION and CONCEPT without content, or a text type with empty text, still get the correction',async()=>{
 for(const [type,body] of [['FACTION','合成商会。'],['CONCEPT','盐湖的概念。'],['MAP',' ']] as const){
  const b=bridge(request(type),[output(type,{},body)]);await assert.rejects(b.result,/模型返回结构不完整（artifacts\.0\.facts）/u,type);assert.equal(b.calls(),2,type)
  assert.ok(b.prompts[1].includes('facts.content缺失'),type)
 }
})
test('WC-03: a FACTION relations array gets a correction naming the field and type, without echoing provider values',async()=>{
 const secret='合成机密关系值'
 const bad=JSON.stringify({factions:[{name:'合成商会',description:'东方商会',relations:[secret]}]}),good=JSON.stringify({factions:[{name:'合成商会',description:'东方商会',relations:'与合成城邦结盟'}]})
 const b=bridge(request('FACTION'),[output('FACTION',{content:bad}),output('FACTION',{content:good})]),result=await b.result
 assert.equal(b.calls(),2);assert.equal(result.artifacts![0].facts.content,good)
 const added=b.prompts[1].slice(b.prompts[0].length);assert.ok(added.includes('content.factions.[].relations须为字符串，收到array'),added.slice(0,400));assert.ok(!added.includes(secret))
})
test('WC-04: content issues name only known keys and value types',()=>{
 assert.deepEqual(importWorldContentIssues('POWER_SYSTEM',JSON.stringify({description:'甲',合成私键:'乙'})),['text:invalid_type(undefined)','(根):unrecognized_keys(description)'])
 assert.deepEqual(importWorldContentIssues('FACTION','{'),['content不是合法JSON字符串']);assert.deepEqual(importWorldContentIssues('MAP',JSON.stringify({text:'甲'})),[])
})
test('WC-05: a content object instead of a JSON string is encoded once and still checked strictly',async()=>{
 const content={factions:[{name:'合成商会',description:'东方商会',relations:'与合成城邦结盟'}]}
 const b=bridge(request('FACTION'),[output('FACTION',{content})]),result=await b.result;assert.equal(b.calls(),1);assert.equal(result.artifacts![0].facts.content,JSON.stringify(content))
 const bad=bridge(request('FACTION'),[output('FACTION',{content:{factions:[{name:'甲',description:'乙',relations:['丙']}]}})]);await assert.rejects(bad.result);assert.equal(bad.calls(),2)
 const other=bridge(request('FACTION'),[output('FACTION',{content:JSON.stringify(content),reliability:1})]);await assert.rejects(other.result);assert.equal(other.calls(),2,'other non-string facts are not coerced')
})
test('WC-06: a facts object sent as JSON text is restored once; undecodable or array facts still get the correction (docs/506 3R5-7)',async()=>{
 const facts={entityType:'SETTING',worldId:'w-1',settingType:'CONCEPT',content:JSON.stringify({concepts:[{term:'合成盐',explanation:'盐湖所产'}]})}
 const wrap=(f:unknown)=>({artifacts:[{...output('CONCEPT',{}).artifacts[0],facts:f}]})
 const b=bridge(request('CONCEPT'),[wrap(JSON.stringify(facts))]),result=await b.result;assert.equal(b.calls(),1);assert.deepEqual(result.artifacts![0].facts,facts)
 for(const bad of ['{',JSON.stringify([facts])]){const r=bridge(request('CONCEPT'),[wrap(bad)]);await assert.rejects(r.result,/artifacts\.0\.facts/u);assert.equal(r.calls(),2)}
})
