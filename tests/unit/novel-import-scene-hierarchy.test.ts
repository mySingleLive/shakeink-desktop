// Compatibility: controller cases here use genuine versionless scene journals.
import assert from 'node:assert/strict'
import {test} from 'node:test'
import * as roster from '../../desktop/core/novel-import-wizard-roster'
import {generateImportAiJson,runImportAi} from '../../desktop/service/novel-import-ai'
import {importAiPrompt,serializeImportAiPayload} from '../../desktop/core/novel-import-ai-payload'
import type {ImportAiRequest,ImportAiResult,ImportSession} from '../../desktop/shared/novel-import'
import type {ResolvedModel} from '../../src/lib/ai/provider'
import {legacySceneFixture,source,model,rosterAi,entityResult,toSceneRoster} from '../helpers/novel-import-wizard-fixture'

type Node={id:string;parentId?:string;name?:string;[key:string]:unknown}
type Proposal={id:string;parentId?:string;evidence:{unitId:string;quote:string}}
const api=roster as typeof roster&{sceneParentCycleIds?:(nodes:readonly Node[])=>string[];applySceneParentProposals?:<T extends Node>(nodes:readonly T[],targets:readonly string[],proposals:readonly Proposal[])=>T[]}
const nodes=[{id:'a',parentId:'b',name:'甲地',aliases:['甲别名'],selected:true},{id:'b',parentId:'a',name:'乙地',aliases:[],selected:true},{id:'c',parentId:'a',name:'丙地',aliases:[],selected:true},{id:'d',name:'丁地',aliases:[],selected:true}]
const evidence={unitId:'u',quote:'甲地包围乙地，丙地位于甲地。'},proposals=[{id:'a',evidence},{id:'b',parentId:'a',evidence}]
test('SH-01: cycle nodes are exact, repairs are atomic and acyclic branches and metadata remain intact',()=>{
 assert.equal(typeof api.sceneParentCycleIds,'function');assert.equal(typeof api.applySceneParentProposals,'function')
 const before=structuredClone(nodes);assert.deepEqual(api.sceneParentCycleIds!(nodes),['a','b']);assert.deepEqual(api.sceneParentCycleIds!([{id:'a'},{id:'b',parentId:'a'}]),[])
 assert.deepEqual(api.sceneParentCycleIds!([...nodes,{id:'e',parentId:'f'},{id:'f',parentId:'g'},{id:'g',parentId:'e'}]),['a','b','e','f','g'])
 const repaired=api.applySceneParentProposals!(nodes,['a','b'],proposals);assert.deepEqual(repaired,[{id:'a',name:'甲地',aliases:['甲别名'],selected:true},nodes[1],nodes[2],nodes[3]]);assert.deepEqual(nodes,before);assert.deepEqual(api.sceneParentCycleIds!(repaired),[])
 for(const invalid of [[proposals[0]], [...proposals,proposals[0]], [{...proposals[0],parentId:'b'},proposals[1]], [{...proposals[0],parentId:'outside'},proposals[1]], [{...proposals[0],parentId:'a'},proposals[1]]])assert.throws(()=>api.applySceneParentProposals!(nodes,['a','b'],invalid))
 for(const targets of [['a'],['a','b','c'],['a','a']])assert.throws(()=>api.applySceneParentProposals!(nodes,targets,proposals))
 assert.throws(()=>api.sceneParentCycleIds!([{id:'a',parentId:'outside'}]));assert.throws(()=>api.sceneParentCycleIds!([{id:'a'},{id:'a'}]))
 const long=Array.from({length:12000},(_,i)=>({id:String(i),...(i?{parentId:String(i-1)}:{})}));assert.deepEqual(api.sceneParentCycleIds!(long),[])
})

type RepairRequest=ImportAiRequest&{sceneParentTargets?:string[]}
const request:RepairRequest={semanticVersion:1,operationId:'scene-parent-repair',phase:'analyze',intent:'roster',kind:'scene',sceneParentTargets:['a','b'],entities:nodes.map(n=>({id:n.id,kind:'scene',name:n.name!,entityType:'PLACE',...('parentId' in n?{parentId:n.parentId}:{})})),units:[{id:'u',fileId:'f',start:0,end:17,text:'甲地包围乙地，丙地位于甲地。',kind:'body'}],artifacts:[],workingRevision:0,models:{text:model}}
const context={userId:'synthetic',resolvedModel:{} as ResolvedModel},raw={sceneParents:proposals}
const generate=(r:RepairRequest,value:unknown)=>generateImportAiJson(r,context,new AbortController().signal,importAiPrompt(r),{generateText:async()=>({text:JSON.stringify(value),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'})})
test('SH-02/03: dedicated parent proposals validate the new full graph and use only two bounded generations',async()=>{
 const before=structuredClone(request);assert.deepEqual(await generate(request,raw),raw);assert.deepEqual(request,before)
 assert.deepEqual(await generate(request,{sceneParents:[{...proposals[0],parentId:null},proposals[1]]}),raw)
 const run=(r:RepairRequest,value:unknown)=>runImportAi(r,new AbortController().signal,{resolve:async()=>model,assert:async()=>{},generate:async()=>value})
 assert.deepEqual(await run(request,raw),raw,'late gate must validate repaired catalog, not merge the old cycle back')
 const bad=[{sceneParents:[{...proposals[0],parentId:'b'},proposals[1]]},{sceneParents:[proposals[0]]},{sceneParents:[...proposals,proposals[0]]},{sceneParents:[{...proposals[0],parentId:'outside'},proposals[1]]},{sceneParents:[{...proposals[0],parentId:4},proposals[1]]},{sceneParents:[{...proposals[0],parentId:''},proposals[1]]},{sceneParents:[{...proposals[0],secret:'SYNTHETIC-PRIVATE'},proposals[1]]},{sceneParents:[{...proposals[0],evidence:{unitId:'u',quote:'SYNTHETIC-PRIVATE'}},proposals[1]]}]
 for(const invalid of bad){let count=0;const result=await generateImportAiJson(request,context,new AbortController().signal,importAiPrompt(request),{generateText:async()=>({text:JSON.stringify(++count===1?invalid:raw),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'})});assert.equal(count,2);assert.deepEqual(result,raw)
  count=0;await assert.rejects(generateImportAiJson(request,context,new AbortController().signal,importAiPrompt(request),{generateText:async()=>({text:JSON.stringify((count++,invalid)),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'})}),(error:Error)=>{assert.ok(!error.message.includes('SYNTHETIC-PRIVATE'));return true});assert.equal(count,2)
 }
})
test('SH-02/04: target catalog is independently checked before generation and payload forces every repair target',async()=>{
 const payload=JSON.parse(serializeImportAiPayload({...request,units:[{...request.units[0],text:'甲别名出现在这里，另一个地方仍然没有提名。'}]}));assert.deepEqual(payload.sceneParentTargets,['a','b']);assert.ok(['a','b'].every(id=>payload.entities.some((e:{id:string})=>e.id===id)))
 for(const changed of [{phase:'review'},{kind:'character'},{semanticVersion:undefined},{intent:'entity'},{sceneParentTargets:[]},{sceneParentTargets:['a']},{sceneParentTargets:['a','a']},{sceneParentTargets:['a','b','c']},{entities:request.entities!.map(e=>({...e,kind:'item',entityType:undefined}))},{artifacts:[{id:'x'}]}]){
  let calls=0;await assert.rejects(runImportAi({...request,...changed} as RepairRequest,new AbortController().signal,{resolve:async()=>model,assert:async()=>{},generate:async()=>{calls++;return raw}}));assert.equal(calls,0)
 }
 await assert.rejects(generate({...request,sceneParentTargets:undefined},raw))
})
test('SH-02b: parent repair retains the final service authorization and cancellation checks',async()=>{
 for(const failure of ['assert','snapshot','cancel'] as const){let asserts=0,resolves=0;const abort=new AbortController()
  await assert.rejects(runImportAi(request,abort.signal,{resolve:async()=>{resolves++;return failure==='snapshot'&&resolves===2?{...model,authRevision:model.authRevision+1}:model},assert:async()=>{asserts++;if(asserts===2&&failure==='assert')throw Error('AUTHORIZATION_REVOKED');if(asserts===2&&failure==='cancel')abort.abort(new DOMException('取消','AbortError'))},generate:async()=>structuredClone(raw)}))
  assert.equal(asserts,2);assert.equal(resolves,failure==='assert'?1:2)
 }
})

function body(){return '第一章 城池\n\n北城是一座城池，甲方在此停留。'+('合成背景。'.repeat(20000))+'\n\n第二章 街道\n\n长街内部有石屋，北城包围长街。'+('另一背景。'.repeat(7500))+'\n'}
async function cyclicFixture(mode:'success'|'failure'|'cancel'){
 const f=await legacySceneFixture([source(body(),'正文.txt','f-body')],rosterAi({'roster:scene':r=>({roster:r.units.flatMap(u=>['北城','南巷','石屋'].filter(name=>u.text.includes(name)||name==='南巷'&&u.text.includes('长街')).map(name=>({name,aliases:name==='南巷'?['长街']:[],parent:name==='北城'?'南巷':name==='南巷'?'北城':'南巷',evidence:{unitId:u.id,quote:name==='南巷'?'长街':name}})))})})),base=f.handler();let repairCalls=0,entityCalls=0
 f.setAi(async original=>{
  const r=original as RepairRequest
  if(r.sceneParentTargets){repairCalls++;assert.equal(entityCalls,0);if(mode==='failure')throw Error('模型接口请求失败（HTTP 503）');if(mode==='cancel')throw new DOMException('取消','AbortError')
   assert.ok(r.instruction?.includes('长街'))
   const result={sceneParents:r.sceneParentTargets.map(id=>{const own=r.entities!.find(e=>e.id===id)!,unit=r.units.find(u=>u.text.includes(own.name)||own.name==='南巷'&&u.text.includes('长街'))!;assert.ok(unit);return {id,...(own.name==='南巷'?{parentId:r.entities!.find(e=>e.name==='北城')!.id}:{}),evidence:{unitId:unit.id,quote:unit.text.slice(0,Math.min(30,unit.text.length))}}})}
   return runImportAi(r,new AbortController().signal,{resolve:async()=>model,assert:async()=>{},generate:async()=>result}) as Promise<ImportAiResult>
  }
  if(r.intent!=='entity')return base(r)
  entityCalls++;const own=r.entities!.find(e=>e.id===r.entityTarget!.id)!,result=entityResult(r,()=>({entityType:'PLACE',...(own.parentId?{parentId:own.parentId}:{}),backstory:'完整场景背景'}))
  return runImportAi(r,new AbortController().signal,{resolve:async()=>model,assert:async()=>{},generate:async()=>result})
 })
 return {f,get repairCalls(){return repairCalls},get entityCalls(){return entityCalls}}
}
test('SH-05: a cross-batch scene cycle is repaired before the checklist and every scene imports with its confirmed hierarchy',async()=>{
 const p=await cyclicFixture('success'),f=p.f
 try{const v=await toSceneRoster(f);assert.equal(p.repairCalls,1);assert.equal(p.entityCalls,0);assert.equal(v.wizard!.stepState['detect-scene'],'waiting');const batches=f.requests.filter(r=>r.intent==='roster'&&!(r as RepairRequest).sceneParentTargets);assert.ok(batches.length>1);assert.ok(!batches[0].units.some(u=>u.text.includes('长街')));assert.ok(batches.slice(1).some(r=>r.units.some(u=>u.text.includes('长街'))))
  const list=v.wizard!.candidates.scene!;assert.equal(list.length,3);assert.ok(list.every(c=>c.selected));const byName=new Map(list.map(c=>[c.name,c]));assert.equal(byName.get('北城')!.parentId,undefined);assert.equal(byName.get('南巷')!.parentId,byName.get('北城')!.id);assert.equal(byName.get('石屋')!.parentId,byName.get('南巷')!.id);assert.deepEqual(byName.get('南巷')!.aliases,['长街'])
  await f.act('wizard-next');const done=await f.settle(),s=await f.journal();assert.equal(done.wizard!.step,'verify');assert.equal(p.entityCalls,3);assert.equal(s.artifacts.length,3);assert.ok(s.wizard!.tasks.every(t=>t.state==='done'));assert.deepEqual(s.wizard!.dropped,[]);for(const a of s.artifacts)assert.equal(a.facts.parentId,list.find(c=>c.id===a.id)!.parentId)
 }finally{await f.dispose()}
})
for(const mode of ['failure','cancel'] as const)test('SH-06: '+mode+' never publishes half a repaired checklist or starts entities',async()=>{
 const p=await cyclicFixture(mode),f=p.f
 try{await toSceneRoster(f);const s=await f.journal();assert.equal(p.repairCalls,1);assert.equal(p.entityCalls,0);assert.equal(s.artifacts.length,0);assert.ok(s.coverage['roster:scene'].length>0);assert.ok(s.wizard!.rosterStash?.scene?.length);assert.equal(s.wizard!.candidates.scene?.length??0,0)}finally{await f.dispose()}
})
test('SH-04: acyclic scenes make no repair request and a cycle beyond capacity starts neither repair nor entity work',async()=>{
 for(const count of [0,33]){
  const names=Array.from({length:count},(_,i)=>'容量地点'+i),text=count?'第一章 地点\n\n'+names.join('，')+'都是合成地点。':'第一章 地点\n\n北城包围南巷。'
  const f=await legacySceneFixture([source(text,'正文.txt','f-body')],count?rosterAi({'roster:scene':r=>({roster:names.map((name,i)=>({name,aliases:[],parent:names[(i+1)%count],evidence:{unitId:r.units[0].id,quote:name}}))})}):rosterAi()),base=f.handler();let repairCalls=0,entityCalls=0
  f.setAi(async r=>{if((r as RepairRequest).sceneParentTargets)repairCalls++;if(r.intent==='entity')entityCalls++;return base(r)})
  try{const v=await toSceneRoster(f);assert.equal(repairCalls,0);assert.equal(entityCalls,0);assert.equal(v.wizard!.stepState['detect-scene'],count?'failed':'waiting');if(count)assert.ok((await f.journal()).wizard!.rosterStash?.scene?.length)}finally{await f.dispose()}
 }
})
test('SH-06b: a rejected final roster save restores both in-memory and persisted candidates and retains completed coverage',async()=>{
 const p=await cyclicFixture('success'),f=p.f,c=f.controller as unknown as {session:ImportSession;save(s?:ImportSession,notify?:boolean,onCommit?:()=>void):Promise<void>},save=c.save.bind(c);let injected=false
 c.save=async(s,notify,onCommit)=>{const active=s??c.session;if(!injected&&active?.wizard?.step==='detect-scene'&&active.wizard.stepState['detect-scene']==='waiting'&&active.wizard.candidates.scene?.length){injected=true;throw Error('保存合成故障')}return save(s,notify,onCommit)}
 try{await toSceneRoster(f);const saved=await f.journal();assert.equal(injected,true);assert.equal(p.entityCalls,0);assert.equal(c.session.wizard!.candidates.scene?.length??0,0);assert.equal(saved.wizard!.candidates.scene?.length??0,0);assert.ok(saved.wizard!.rosterStash?.scene?.length);assert.ok(saved.coverage['roster:scene'].length);assert.equal(saved.wizard!.stepState['detect-scene'],'failed')}finally{c.save=save;await f.dispose()}
})
test('SH-04b: a small valid model budget cannot silently omit repair targets or start a partial repair',async()=>{
 const names=Array.from({length:8},(_,i)=>'预算地点'+i),text=names.map((name,i)=>`第${i+1}章 地点\n\n${name}是合成地点。${'背景文字。'.repeat(280)}\n\n`).join(''),small={...model,contextWindow:16000}
 const f=await legacySceneFixture([source(text,'正文.txt','f-body')],rosterAi({'roster:scene':r=>({roster:r.units.flatMap(u=>names.filter(name=>u.text.includes(name)).map(name=>({name,aliases:[],parent:names[(names.indexOf(name)+1)%names.length],evidence:{unitId:u.id,quote:name}})))})}),{models:{text:small,review:{...small,id:'review'}}}),base=f.handler();let repairCalls=0,entityCalls=0
 f.setAi(async r=>{if((r as RepairRequest).sceneParentTargets)repairCalls++;if(r.intent==='entity')entityCalls++;return base(r)})
 try{const v=await toSceneRoster(f),s=await f.journal();assert.equal(repairCalls,0);assert.equal(entityCalls,0);assert.equal(v.wizard!.stepState['detect-scene'],'failed');assert.ok(v.wizard!.stepError?.includes('预算内覆盖全部目标'));assert.ok(s.wizard!.rosterStash?.scene?.length);assert.ok(s.coverage['roster:scene'].length)}finally{await f.dispose()}
})
test('SH-06c: pausing during a parent repair discards an otherwise valid late result',async()=>{
 const p=await cyclicFixture('success'),f=p.f,base=f.handler(),c=f.controller as unknown as {session:ImportSession};let entered!:()=>void,release!:()=>void
 const started=new Promise<void>(r=>{entered=r}),gate=new Promise<void>(r=>{release=r})
 f.setAi(async r=>{if((r as RepairRequest).sceneParentTargets){entered();await gate}return base(r)})
 const flow=toSceneRoster(f)
 try{await started;const epoch=c.session.epoch,pause=f.act('pause');const end=Date.now()+5000;while(c.session.epoch===epoch){assert.ok(Date.now()<end,'pause changes the epoch before a late result');await new Promise(r=>setTimeout(r,5))}release();await pause;await flow;const s=await f.journal();assert.equal(s.phase,'paused');assert.equal(s.wizard!.candidates.scene?.length??0,0);assert.ok(s.wizard!.rosterStash?.scene?.length);assert.equal(p.entityCalls,0)}finally{release();await flow.catch(()=>{});await f.dispose()}
})
