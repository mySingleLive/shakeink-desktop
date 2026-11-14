import assert from 'node:assert/strict'
import {test} from 'node:test'
import {createHash} from 'node:crypto'
import {importAiPrompt,assertImportFixedPromptReserve} from '../../desktop/core/novel-import-ai-payload'
import {runImportAi,generateImportAiJson,importAiResponseSchema} from '../../desktop/service/novel-import-ai'
import {importNativeMappings} from '../../desktop/core/novel-import-semantic-state'
import {buildWizardCandidates} from '../../desktop/core/novel-import-wizard-roster'
import type {ImportAiRequest,ImportArtifact} from '../../desktop/shared/novel-import'
import type {ResolvedModel} from '../../src/lib/ai/provider'
import {fixture,source,rosterAi,entityResult,model,sleep} from '../helpers/novel-import-wizard-fixture'

const r:ImportAiRequest={semanticVersion:1,operationId:'scene-test',phase:'analyze',intent:'roster',kind:'scene',units:[{id:'u',fileId:'f',start:0,end:12,text:'北城内的南巷灯火通明。',kind:'body'}],artifacts:[],workingRevision:0,models:{text:model}}
const valid={roster:[{name:'北城',aliases:[]},{name:'南巷',aliases:[],parent:'北城'}]}
const context={userId:'synthetic',resolvedModel:{} as ResolvedModel}
const generated=(value:unknown)=>({text:JSON.stringify(value),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'})

test('SI-01: scene roster has an isolated list contract; other prompts are byte-identical',()=>{
 const prompt=importAiPrompt(r,'{}'),fixed=prompt.split('<novel-import-data>')[0]
 assert.ok(fixed.includes('场景名称清单'));assert.ok(fixed.includes('{"roster":['));assert.ok(fixed.includes('省略'))
 assert.ok(!fixed.includes('<semantic-native-contract>'));assert.ok(!fixed.includes('Scene须entityType'))
 assertImportFixedPromptReserve(prompt,'{}')
 for(const [intent,kind,hash] of [['roster','character','2e57b57312fad7bd5d3aa90904c0f4cf694a439f7b5f6903c4b4a1ed6ccfe8a8'],['roster','item','ced9a4fff168b4afa23e6fd0cada5cc703840243c8897a1a56252804c7af34d2'],['roster','world','43de58e2c9fcc1e772ec49bf6c2cbe3d5f37150a6e0242d098bfc5836f0848ca'],[undefined,'scene','39d7e0e2a7d0dcf78d12633b71e436b6368fbaf627e67b5c9a873a0ca3fca0d8']] as const){
  const p=importAiPrompt({...r,intent,kind,units:[],artifacts:[],workingRevision:0},'{}');assert.equal(createHash('sha256').update(p).digest('hex'),hash,`${intent}:${kind}`)
 }
})

const badOutputs=[{...valid,'SECRET-UNKNOWN-KEY':'PRIVATE-TEXT'},valid.roster,{}, {roster:[{name:'北城',parent:''}]},{roster:[{name:'北城',parentId:'PRIVATE-TEXT'}]},{roster:[{name:' ',aliases:[]}]}]
test('SI-02a: strict scene roster errors recover within the existing two generation attempts',async()=>{
 for(const bad of badOutputs){let count=0;const result=await generateImportAiJson(r,context,new AbortController().signal,importAiPrompt(r),{generateText:async()=>generated(++count===1?bad:valid)})
  assert.equal(count,2);assert.deepEqual(result,valid)
 }
 assert.deepEqual(importAiResponseSchema(r).parse(valid),valid)
 assert.deepEqual(importAiResponseSchema(r).parse({roster:[]}),{roster:[]})
})
test('SI-02b: persistent structure errors show bounded static scene fields without source values',async()=>{
 for(const [index,bad] of badOutputs.entries()){let count=0
  await assert.rejects(generateImportAiJson(r,context,new AbortController().signal,importAiPrompt(r),{generateText:async()=>{count++;return generated(bad)}}),(error:Error)=>{
   assert.match(error.message,/模型返回的场景清单结构无效（.+）/u);assert.ok(!error.message.includes('（）'));assert.ok(!/SECRET|PRIVATE|北城|parentId|Unrecognized/u.test(error.message));if(index===3)assert.ok(error.message.includes('上级地点为空字符串'));return true
  });assert.equal(count,2)
 }
 for(const message of ['授权撤销','网络中断']){let count=0;await assert.rejects(generateImportAiJson(r,context,new AbortController().signal,importAiPrompt(r),{generateText:async()=>{count++;throw Error(message)}}),new RegExp(message));assert.equal(count,1)}
 const abort=new AbortController();abort.abort(new DOMException('取消','AbortError'));let resolved=0
 await assert.rejects(runImportAi(r,abort.signal,{resolve:async()=>{resolved++;return model},assert:async()=>{},generate:async()=>valid}),/取消/u);assert.equal(resolved,0)
})

async function toScenes(f:Awaited<ReturnType<typeof fixture>>){
 await f.act('choose',{mode:'files'});await f.act('wizard-next');await f.act('set-title',{title:'合成作品'});await f.act('choose-target');await f.act('wizard-next')
 await f.act('classify',{mode:'ai',consent:true});await f.settle();await f.act('select',{selected:['body'],targets:['scene'],infer:true});await f.act('wizard-next',{consent:true});await f.settle()
 await f.act('wizard-next',{consent:true});const v=await f.settle();assert.equal(v.wizard!.step,'detect-scene');return v
}
test('SI-03: all selected scene IDs, native fields and forward parents survive multiple commits',async()=>{
 const names=Array.from({length:16},(_,i)=>'合成地点'+String.fromCharCode(0x7532+i)),body=names.map((n,i)=>`第${i+1}章 地点${i}\n\n${n}有灯火。\n\n`).join('')
 const f=await fixture([source(body,'正文.txt','f-body')],rosterAi({'roster:scene':req=>({roster:req.units.flatMap(u=>names.filter(n=>u.text.includes(n)).map(name=>({name,aliases:[],...(name!==names.at(-1)?{parent:names[names.indexOf(name)+1]}:{}),evidence:{unitId:u.id,quote:name}})))})})),base=f.handler(),expected=new Map<string,ImportArtifact>()
 let committedBeforeLater=false,requests=0
 f.setAi(async req=>{
  if(req.intent!=='entity')return base(req)
  if(++requests>8){const deadline=Date.now()+4000;for(;;){if((await f.journal()).artifacts.length>=8){committedBeforeLater=true;break}assert.ok(Date.now()<deadline);await sleep(5)}}
  const own=req.entities!.find(e=>e.id===req.entityTarget!.id)!,raw=entityResult(req,()=>({...own.parentId?{parentId:own.parentId}:{},coordinates:'10,20'}));expected.set(own.id,raw.artifacts![0])
  return runImportAi(req,new AbortController().signal,{resolve:async()=>model,assert:async()=>{},generate:async()=>structuredClone(raw)})
 })
 try{await toScenes(f);await f.act('wizard-next');const v=await f.settle(),s=await f.journal(),list=s.wizard!.candidates.scene!
  assert.equal(v.wizard!.step,'verify',JSON.stringify(v.wizard!.tasks));assert.ok(committedBeforeLater);assert.equal(list.length,16)
  assert.deepEqual(s.artifacts.map(a=>a.id).sort(),list.map(c=>c.id).sort());assert.ok(s.wizard!.tasks.every(t=>t.state==='done'));assert.equal(s.wizard!.tasks.length,16)
  for(const a of s.artifacts){assert.deepEqual(a.facts,expected.get(a.id)!.facts);assert.equal(a.text,expected.get(a.id)!.text);assert.deepEqual(a.evidence,expected.get(a.id)!.evidence)}
  assert.equal(importNativeMappings(s).projectableIds.length,16);assert.deepEqual(s.wizard!.dropped,[]);assert.deepEqual(s.wizard!.skipped,[])
 }finally{await f.dispose()}
})
test('SI-04: scene service rejects foreign or wrong-type parents and bad evidence',async()=>{
 const target={id:'s-child',aliases:[]},request={...r,intent:'entity' as const,entityTarget:target,entities:[{id:'s-child',kind:'scene' as const,name:'南巷',entityType:'PLACE' as const,parentId:'s-parent'},{id:'s-parent',kind:'scene' as const,name:'北城',entityType:'PLACE' as const}]}
 const a:ImportArtifact={id:'s-child',name:'南巷',kind:'scene',text:'灯火通明',facts:{entityType:'PLACE',parentId:'s-parent'},origin:'inferred',sourceUnitIds:['u'],evidence:[{unitId:'u',quote:'南巷'}]}
 const run=(req:ImportAiRequest,actor=a)=>runImportAi(req,new AbortController().signal,{resolve:async()=>model,assert:async()=>{},generate:async()=>({artifacts:[structuredClone(actor)]})})
 await run(request)
 const foreign={...request,entities:[{...request.entities[0],parentId:'foreign'},request.entities[1]]}
 await assert.rejects(run(foreign,{...a,facts:{entityType:'PLACE',parentId:'foreign'}}),/模型结果含无效实体引用/u)
 await assert.rejects(run({...request,entities:[request.entities[0],{...request.entities[1],parentId:'s-child'}]}),/语义父级引用形成循环/u)
 await assert.rejects(run({...request,entities:[request.entities[0],{id:'s-parent',kind:'character',name:'北城'}]}),/引用|PLACE|身份|结构/u)
 for(const evidence of [[{unitId:'foreign',quote:'南巷'}],[{unitId:'u',quote:'不存在的原文'}]])await assert.rejects(run(request,{...a,evidence}),/引文|证据|来源|结构/u)
})

test('SI-05: redetect keeps successful roster batches and requests only uncovered units',async()=>{
 const body=Array.from({length:400},(_,i)=>`第${i+1}章 地点${i}\n\n合成地点${i}。${'风声。'.repeat(400)}\n\n`).join('')
 let failed=false,failMode=true;const calls:string[][]=[]
 const f=await fixture([source(body,'正文.txt','f-body')],rosterAi({'roster:scene':req=>{
  calls.push(req.units.map(u=>u.id));if(failMode&&req.units.some(u=>u.text.includes('合成地点7。'))){failed=true;throw Error('模型返回结构不完整')}
  return {roster:req.units.flatMap(u=>{const name=u.text.match(/合成地点\d+/u)?.[0];return name?[{name,aliases:[],evidence:{unitId:u.id,quote:name}}]:[]})}
 }}))
 try{const first=await toScenes(f),before=await f.journal();assert.equal(first.wizard!.stepState['detect-scene'],'failed')
  const coverage=before.coverage['roster:scene']??[],stash=before.wizard!.rosterStash!.scene!;assert.ok(coverage.length>0);assert.ok(stash.length>0)
  assert.ok(calls[0].every(id=>!coverage.includes(id)));failMode=false;const at=calls.length
  await f.act('wizard-redetect');const v=await f.settle(),s=await f.journal();assert.equal(v.wizard!.stepState['detect-scene'],'waiting');assert.equal(v.wizard!.stepError,undefined)
  assert.ok(calls.slice(at).flat().every(id=>!coverage.includes(id)));assert.deepEqual([...s.coverage['roster:scene']].sort(),s.workingUnits!.map(u=>u.id).sort())
  const names=new Set(s.wizard!.candidates.scene!.map(c=>c.name));assert.equal(names.size,400);assert.ok(stash.every(e=>names.has(e.name)))
 }finally{await f.dispose()}
})

test('SI-06: only a scene roster null optional parent means no parent; content and valid parents stay intact',async()=>{
 const raw={roster:[{name:'北城',aliases:[],parent:null,evidence:{unitId:'u',quote:'北城'}},{name:'南巷',aliases:[],parent:'北城'}]},canonical={roster:[{name:'北城',aliases:[],evidence:{unitId:'u',quote:'北城'}},{name:'南巷',aliases:[],parent:'北城'}]}
 assert.deepEqual(importAiResponseSchema(r).parse(raw),canonical);assert.ok(!Object.hasOwn(importAiResponseSchema(r).parse(raw).roster![0],'parent'))
 let calls=0;assert.deepEqual(await generateImportAiJson(r,context,new AbortController().signal,importAiPrompt(r),{generateText:async()=>{calls++;return generated(raw)}}),canonical);assert.equal(calls,1)
 const result=await runImportAi(r,new AbortController().signal,{resolve:async()=>model,assert:async()=>{},generate:async()=>structuredClone(raw)})
 assert.deepEqual(result.roster,[canonical.roster[0],{...canonical.roster[1],evidence:{unitId:'u',quote:'南巷'}}]);assert.deepEqual(raw.roster[0].parent,null)
 for(const parent of ['',123,{},[],false,'x'.repeat(301)])assert.equal(importAiResponseSchema(r).safeParse({roster:[{name:'北城',aliases:[],parent}]}).success,false)
 const invalidWorld=importAiResponseSchema({...r,kind:'world'}).safeParse({roster:[{name:'北城',aliases:[],settings:[],parent:null}]});assert.equal(invalidWorld.success,true);assert.deepEqual(invalidWorld.data,{roster:[]})
 for(const invalid of [{name:null,aliases:[],parent:null},{name:'北城',aliases:null,parent:null},{name:'北城',aliases:[],parent:null,unknown:'private'}])assert.equal(importAiResponseSchema(r).safeParse({roster:[invalid]}).success,false)
 const rows=buildWizardCandidates('scene',[{name:'北城',aliases:[]},{name:'南巷',aliases:[],parent:'北城'},...importAiResponseSchema(r).parse({roster:[{name:'南巷',aliases:['小巷'],parent:null}]}).roster!],[],[])
 assert.equal(rows.find(c=>c.name==='南巷')!.parentId,rows.find(c=>c.name==='北城')!.id);assert.ok(rows.find(c=>c.name==='南巷')!.aliases.includes('小巷'))
 assert.equal(importAiResponseSchema({...r,intent:undefined}).safeParse(raw).success,false)
})
