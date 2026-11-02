import assert from 'node:assert/strict'
import {test} from 'node:test'
import {runImportAi,generateImportAiJson,importAiResponseSchema} from '../../desktop/service/novel-import-ai'
import {importAiPrompt,serializeImportAiPayload} from '../../desktop/core/novel-import-ai-payload'
import type {ImportAiRequest,ImportArtifact} from '../../desktop/shared/novel-import'
import type {ResolvedModel} from '../../src/lib/ai/provider'
import {model,fixture,rosterAi,entityResult,toImportChar} from '../helpers/novel-import-wizard-fixture'

const texts=['合成角色甲在合成室整理旧信。','合成角色乙留下另一份真实记录。','旁证材料也在本次允许的输入范围内。']
const units=texts.map((text,i)=>({id:['a','b','c'][i],fileId:'source-file',start:i*100,end:i*100+text.length,text,kind:'body' as const}))
const input:ImportAiRequest={semanticVersion:1,operationId:'source-index-op',phase:'analyze',intent:'entity',kind:'character',units,artifacts:[],models:{text:model},entities:[{id:'actor-a',kind:'character',name:'合成角色甲'},{id:'actor-b',kind:'character',name:'合成角色乙'}],entityTarget:{id:'actor-a',aliases:[],roleType:'SUPPORTING'},workingRevision:0}
const actor:ImportArtifact={id:'actor-a',kind:'character',name:'合成角色甲',text:'合成完整资料',facts:{roleType:'SUPPORTING',abilities:'合成有据能力',backstory:'合成有据背景',relationships:'[{"target":"合成角色乙","description":"留下记录","characterId":"actor-b"}]'},sourceUnitIds:['a'],evidence:[{unitId:'a',quote:'合成角色甲在合成室整理旧信'}],origin:'inferred'}
const run=(request:ImportAiRequest,raw:unknown)=>runImportAi(request,new AbortController().signal,{resolve:async()=>model,assert:async()=>{},generate:async()=>structuredClone(raw)})

test('CP-10a: source indexes derive only from verified evidence and retain all legitimate declarations',async()=>{
 for(const [declared,expected] of [[undefined,['a']],[[],['a']],[['foreign','actor-a'],['a']],[['c','foreign','b','b'],['c','b','a']]] as const){
  const raw={artifacts:[{...actor,sourceUnitIds:declared}]},before=structuredClone(raw),result=await run(input,raw),a=result.artifacts![0]
  assert.deepEqual(a.sourceUnitIds,expected);assert.deepEqual(a.facts,actor.facts);assert.equal(a.text,actor.text);assert.deepEqual(a.evidence,actor.evidence);assert.deepEqual(raw,before)
  const schema=importAiResponseSchema(input);assert.deepEqual(schema.parse(schema.parse(raw)),schema.parse(raw),'source derivation is idempotent')
 }
 const q='合成角色乙留下另一份真实记录',rebound=await run(input,{artifacts:[{...actor,sourceUnitIds:['c'],evidence:[{unitId:'a',quote:q}]}]})
 assert.deepEqual(rebound.artifacts![0].evidence,[{unitId:'b',quote:q}]);assert.deepEqual(rebound.artifacts![0].sourceUnitIds,['c','b'])
})

test('CP-10b: missing, forged, unknown and ambiguous evidence is never repaired by source index derivation',async()=>{
 for(const patch of [{evidence:[]},{evidence:[{unitId:'foreign',quote:actor.evidence[0].quote}]},{evidence:[{unitId:'a',quote:'完全虚构的其它引用'}]},{sourceUnitIds:'a'},{sourceUnitIds:[7]},{sourceUnitIds:Array.from({length:601},()=> 'a')}])await assert.rejects(run(input,{artifacts:[{...actor,...patch}]}),/结构|定位|证据|来源/)
 const q='合成角色乙留下另一份真实记录',ambiguous={...input,units:[units[0],units[1],{...units[2],text:q+'。',end:units[2].start+q.length+1}]}
 await assert.rejects(run(ambiguous,{artifacts:[{...actor,evidence:[{unitId:'a',quote:q}]}]}),/结构|定位/)
 await assert.rejects(run(input,{artifacts:[{...actor,facts:{...actor.facts,relationships:'[{"target":"外部人物","description":"未知","characterId":"foreign"}]'}}]}),/引用|结构/)
 const ordinary={...input,intent:undefined,entityTarget:undefined},base={...actor,facts:{roleType:'SUPPORTING'}}
 for(const sourceUnitIds of [undefined,['foreign']])await assert.rejects(run(ordinary,{artifacts:[{...base,sourceUnitIds}]}),/结构|来源/)
 const scene:ImportAiRequest={...input,kind:'scene',entities:[{id:'place-a',kind:'scene',name:'合成室',entityType:'PLACE'}],entityTarget:{id:'place-a',aliases:[]}},place={...base,id:'place-a',kind:'scene',name:'合成室',facts:{entityType:'PLACE'},evidence:[{unitId:'a',quote:'合成室'}]}
 for(const sourceUnitIds of [undefined,['foreign']])await assert.rejects(run({...scene,intent:undefined,entityTarget:undefined},{artifacts:[{...place,sourceUnitIds}]}),/结构|来源/)
})

test('CP-10c: the production generation/controller chain accepts omitted mechanical indexes without losing facts',async()=>{
 const f=await fixture(undefined,rosterAi()),base=f.handler(),calls=new Map<string,number>(),expected=new Map<string,Record<string,string>>()
 f.setAi(async r=>{
  if(r.intent!=='entity')return base(r)
  const raw=entityResult(r,()=>({roleType:r.entityTarget!.roleType!,abilities:'合成能力完整保留',backstory:'合成背景完整保留'}));expected.set(r.entityTarget!.id,structuredClone(raw.artifacts![0].facts));delete (raw.artifacts![0] as Partial<ImportArtifact>).sourceUnitIds
  return runImportAi(r,new AbortController().signal,{resolve:async()=>model,assert:async()=>{},generate:async(_r,_m,signal,prompt)=>generateImportAiJson(r,{userId:'synthetic-user',resolvedModel:{} as ResolvedModel},signal,prompt,{generateText:async()=>{calls.set(r.entityTarget!.id,(calls.get(r.entityTarget!.id)??0)+1);return {text:JSON.stringify(raw),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'}}})})
 })
 try{await toImportChar(f);const v=await f.settle(),j=await f.journal();assert.equal(v.wizard!.step,'detect-scene');assert.ok(v.wizard!.tasks.every(t=>t.state==='done'));for(const a of j.artifacts){assert.deepEqual(a.facts,expected.get(a.id));assert.ok(a.sourceUnitIds.length);assert.ok(a.evidence.every(e=>a.sourceUnitIds.includes(e.unitId)));assert.equal(calls.get(a.id),1)}}finally{await f.dispose()}
 const phase=importAiPrompt(input).split('<phase-output-contract>')[1].split('</phase-output-contract>')[0];assert.ok(phase.includes('sourceUnitIds由应用'));assert.ok(!/sourceUnitIds[,}]/u.test(phase))
})

test('CP-11a: strict option references resolve to this request only and remain canonical on repeated parsing',async()=>{
 const evidenceOptions=[actor.evidence[0],{unitId:'b',quote:'合成角色乙留下另一份真实记录'}],r={...input,entityTarget:{...input.entityTarget!,evidenceOptions}},raw={artifacts:[{...actor,sourceUnitIds:undefined,evidence:[{optionIndex:1},{optionIndex:0}]}]},before=structuredClone(raw),beforeRequest=structuredClone(r)
 const schema=importAiResponseSchema(r),parsed=schema.parse(raw),result=await run(r,raw)
 assert.deepEqual(parsed.artifacts![0].evidence,[evidenceOptions[1],evidenceOptions[0]]);assert.deepEqual(parsed.artifacts![0].sourceUnitIds,['b','a']);assert.deepEqual(result,parsed);assert.deepEqual(schema.parse(parsed),parsed)
 assert.deepEqual(result.artifacts![0].facts,actor.facts);assert.equal(result.artifacts![0].text,actor.text);assert.deepEqual(raw,before);assert.deepEqual(r,beforeRequest)
 const payload=JSON.parse(serializeImportAiPayload(r));assert.deepEqual(payload.entityTarget.evidenceOptions,evidenceOptions.map((e,optionIndex)=>({...e,optionIndex})))
 const prompt=importAiPrompt(r);assert.ok(prompt.includes('optionIndex'));assert.ok(prompt.includes('0-based'));assert.ok(prompt.includes('不能混用'));assert.ok(!importAiPrompt(input).split('<phase-output-contract>')[1].split('</phase-output-contract>')[0].includes('optionIndex'))
 // Direct quotes remain valid, including material outside the supplied options.
 const direct={artifacts:[{...actor,evidence:[{unitId:'c',quote:units[2].text}]}]};assert.deepEqual((await run(r,direct)).artifacts![0].evidence,direct.artifacts[0].evidence)
})

test('CP-11b: malformed, mixed and out-of-scope references cannot launder missing or forged evidence',async()=>{
 const r={...input,entityTarget:{...input.entityTarget!,evidenceOptions:[actor.evidence[0]]}},schema=importAiResponseSchema(r)
 for(const entry of [{optionIndex:-1},{optionIndex:1},{optionIndex:0.5},{optionIndex:'0'},{optionIndex:0,extra:true},{optionIndex:0,unitId:'a',quote:'虚构坏引文'},{optionIndex:0,quote:actor.evidence[0].quote},{optionIndex:0,unitId:'a'},{}]){
  const raw={artifacts:[{...actor,evidence:[{optionIndex:0},entry]}]};assert.equal(schema.safeParse(raw).success,false);await assert.rejects(run(r,raw),/结构|定位|证据/)
 }
 const raw={artifacts:[{...actor,evidence:[{optionIndex:0}]}]}
 for(const noOptions of [input,{...input,intent:undefined,entityTarget:undefined}])await assert.rejects(run(noOptions,raw),/结构|证据/)
 const item:ImportAiRequest={...r,kind:'item',entities:[{id:'item-a',kind:'item',name:'合成物'}],entityTarget:{id:'item-a',aliases:[],evidenceOptions:[actor.evidence[0]]}}
 await assert.rejects(run(item,{artifacts:[{...actor,id:'item-a',kind:'item',name:'合成物',facts:{},evidence:[{optionIndex:0}]}]}),/结构|证据/)
 let calls=0;await assert.rejects(generateImportAiJson(r,{userId:'synthetic-user',resolvedModel:{} as ResolvedModel},new AbortController().signal,importAiPrompt(r),{generateText:async()=>{calls++;return {text:JSON.stringify({artifacts:[{...actor,evidence:[{optionIndex:99}]}]}),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'}}}),/结构|schema|JSON/);assert.equal(calls,2)
})

test('CP-11c: the real generation and controller chain uses explicit citation indexes without losing character data',async()=>{
 const f=await fixture(undefined,rosterAi()),base=f.handler(),expected=new Map<string,{facts:Record<string,string>;text:string;evidence:unknown}>(),counts=new Map<string,number>()
 f.setAi(async r=>{
  if(r.intent!=='entity')return base(r)
  const raw=entityResult(r,()=>({roleType:r.entityTarget!.roleType!,abilities:'合成完整能力',backstory:'合成完整背景'})),a=raw.artifacts![0],option=r.entityTarget!.evidenceOptions![0]
  expected.set(a.id,{facts:structuredClone(a.facts),text:a.text,evidence:[structuredClone(option)]})
  const wire={artifacts:[{...a,sourceUnitIds:undefined,evidence:[{optionIndex:0}]}]}
  return runImportAi(r,new AbortController().signal,{resolve:async()=>model,assert:async()=>{},generate:async(_r,_m,signal,prompt)=>generateImportAiJson(r,{userId:'synthetic-user',resolvedModel:{} as ResolvedModel},signal,prompt,{generateText:async options=>{
   counts.set(a.id,(counts.get(a.id)??0)+1);assert.ok('prompt' in options);const data=JSON.parse(options.prompt.split('<novel-import-data>')[1].split('</novel-import-data>')[0]);assert.deepEqual(data.entityTarget.evidenceOptions,r.entityTarget!.evidenceOptions!.map((entry,optionIndex)=>({...entry,optionIndex})))
   return {text:JSON.stringify(wire),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'}
  }})})
 })
 try{await toImportChar(f);const v=await f.settle(),j=await f.journal();assert.equal(v.wizard!.step,'detect-scene');assert.ok(v.wizard!.tasks.every(t=>t.state==='done'));for(const a of j.artifacts){const e=expected.get(a.id)!;assert.deepEqual(a.facts,e.facts);assert.equal(a.text,e.text);assert.deepEqual(a.evidence,e.evidence);assert.ok(a.sourceUnitIds.includes(a.evidence[0].unitId));assert.equal(counts.get(a.id),1)}}finally{await f.dispose()}
})
