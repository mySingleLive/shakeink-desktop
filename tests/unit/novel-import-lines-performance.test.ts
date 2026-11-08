import assert from 'node:assert/strict'
import {test} from 'node:test'
import {importGenerationModel,runImportGenerationLane,runImportAi,normalizeLinesReply} from '../../desktop/service/novel-import-ai'
import {importAiPrompt} from '../../desktop/core/novel-import-ai-payload'
import {mergeImportArtifacts,importHash} from '../../desktop/core/novel-import'
import {wizardLinePlan,wizardLineIds} from '../../desktop/main/novel-import'
import type {ImportAiRequest,ImportAiResult,ImportArtifact,ImportSession,ImportUnit} from '../../desktop/shared/novel-import'
import type {ResolvedModel} from '../../src/lib/ai/provider'
import {acquireLongTask,longTaskQueue} from '../../src/lib/long-task'
import {fixture,source,rosterAi,model,sleep,linesAi,worldsAi,toStep,type Ai} from '../helpers/novel-import-wizard-fixture'

/* docs/518. Synthetic text and names only. */
const CHAPTERS=64
function body(){let t='';for(let i=0;i<CHAPTERS;i++)t+=`第${i+1}章 篇${i}\n\n沈砚在合成渡口${i}旁停步。${'风声。'.repeat(500)}\n\n`;return t}
const lineRequest=(kind:'worldline'|'narrative'|'outline',over:Partial<ImportAiRequest>={}):ImportAiRequest=>({semanticVersion:1,phase:'analyze',kind,units:[],artifacts:[],executionLane:'wizard-lines-v1',operationId:'op',models:{text:model},workingRevision:0,selectedTargets:[kind],chapters:[],entities:[],...over}) as ImportAiRequest
const isLine=(r:ImportAiRequest)=>r.phase==='analyze'&&!r.intent&&(r.kind==='worldline'||r.kind==='narrative')

/** Line requests wait until released; counts peaks per kind. */
function gate(f:Awaited<ReturnType<typeof fixture>>,inner:Ai){
 const pending=new Map<string,{resolve:()=>void;reject:(e:unknown)=>void;r:ImportAiRequest}>();let open=false,running=0,peak=0
 const peaks={worldline:0,narrative:0},runningBy={worldline:0,narrative:0}
 f.setAi(async r=>{
  if(!isLine(r))return inner(r)
  const k=r.kind as 'worldline'|'narrative';running++;runningBy[k]++;peak=Math.max(peak,running);peaks[k]=Math.max(peaks[k],runningBy[k])
  try{if(!open)await new Promise<void>((resolve,reject)=>pending.set(r.operationId,{resolve,reject,r}));return await inner(r)}finally{pending.delete(r.operationId);running--;runningBy[k]--}
 })
 f.options.cancelAi=async id=>{pending.get(id)?.reject(new DOMException('已取消','AbortError'))}
 return {pending,peaks,get peak(){return peak},releaseAll(){open=true;for(const p of pending.values())p.resolve()}}
}
async function linesFixture(ai:(base:Ai)=>Ai=linesAi){
 const f=await fixture([source(body(),'正文.txt','f-body')],rosterAi());f.setAi(ai(worldsAi(f.handler())))
 return f
}
async function toLines(f:Awaited<ReturnType<typeof fixture>>){
 await f.act('choose',{mode:'files'});await f.act('wizard-next');await f.act('set-title',{title:'合成剧情作品'});await f.act('choose-target');await f.act('wizard-next')
 await f.act('classify',{mode:'ai',consent:true});await f.settle()
 await f.act('select',{selected:['body'],targets:['character','worldline','narrative'],infer:true});await f.act('wizard-next',{consent:true});await f.settle()
 assert.equal((await f.view()).wizard!.step,'tree');await f.act('wizard-next',{consent:true})
 // Step through the character roster and import until the wizard starts step 17; line requests may be gated.
 for(let i=0;i<400;i++){const w=(await f.view()).wizard!;if(w.step==='worldline'||w.step==='narrative')return;if(w.stepState[w.step]==='waiting'&&!f.controller.active)await f.act('wizard-next');else await sleep(10)}
 throw Error('未到达世界线步骤')
}
async function until(check:()=>boolean|Promise<boolean>,ms=8000){const end=Date.now()+ms;while(!await check()){if(Date.now()>end)throw Error('等待条件超时');await sleep(5)}}

test('LP-01/LP-19: wizard line requests use the import lane and keep the saved model options',async()=>{
 const resolved={model:{},modelRecord:{},providerOptions:{openai:{store:false}}} as unknown as ResolvedModel
 const deepseek={provider:'deepseek',protocol:'openai',modelId:'synthetic',thinkingLevels:['low','high'],defaultThinking:'high'}
 // docs/517 3R2-1 (user choice 2026-11-06): the lines lane uses the light extraction policy; other line requests keep the saved options.
 for(const kind of ['worldline','narrative','outline'] as const)assert.deepEqual(importGenerationModel(lineRequest(kind),resolved,deepseek).providerOptions,{openai:{store:false},deepseek:{thinking:{type:'disabled'}}},kind)
 for(const r of [lineRequest('worldline',{executionLane:undefined}),lineRequest('narrative',{phase:'review'}),lineRequest('outline',{executionLane:undefined}),lineRequest('worldline',{kind:'theme'})])assert.equal(importGenerationModel(r,resolved,deepseek),resolved)
 // Inside the import lane a nested acquireLongTask is a no-op; outside it the work would queue behind the held slot.
 const release=await acquireLongTask(undefined,1)
 try{
  const nested=(r:ImportAiRequest)=>Promise.race([runImportGenerationLane(r,async()=>{const inner=await acquireLongTask(undefined,1);inner();return 'ran'}),sleep(200).then(()=>'blocked')])
  assert.equal(await nested(lineRequest('worldline')),'ran','a line-lane request does not wait for a chat slot')
  assert.equal(await nested(lineRequest('worldline',{executionLane:undefined})),'blocked','without the lane the request queues as before')
 }finally{release();await sleep(250)}
 void longTaskQueue
})
test('LP-02: the lines lane is refused outside wizard worldline/narrative/outline analysis',async()=>{
 for(const over of [{kind:'theme'},{phase:'review'},{intent:'touches'}] as Partial<ImportAiRequest>[]){
  const request=lineRequest('worldline',{...over,operationId:'op-x',units:[{id:'u',fileId:'f',kind:'body',start:0,end:4,text:'合成文字'} as ImportUnit]})
  await assert.rejects(runImportAi(request,new AbortController().signal,{resolve:async()=>model,assert:async()=>{},generate:async()=>({notFound:true})}),/导入调度通道无效/u,JSON.stringify(over))
 }
 // The lane is accepted for wizard worldline/narrative and (docs/531, OP-01) chapter outline analysis.
 for(const kind of ['worldline','narrative','outline'] as const){
  const request=lineRequest(kind,{operationId:'op-ok',units:[{id:'u',fileId:'f',kind:'body',start:0,end:4,text:'合成文字'} as ImportUnit]})
  assert.deepEqual(await runImportAi(request,new AbortController().signal,{resolve:async()=>model,assert:async()=>{},generate:async()=>({notFound:true})}),{notFound:true},kind)
 }
})
test('LP-03/LP-18: chapter-aligned batches cover every unit once and never split a chapter',()=>{
 const chapters=Array.from({length:10},(_,i)=>({start:i*1000,end:(i+1)*1000}))
 const units:ImportUnit[]=chapters.flatMap((c,i)=>[0,1,2].map(k=>({id:`u${i}-${k}`,fileId:'f',kind:'body',start:c.start+k*333,end:k===2?c.end:c.start+(k+1)*333,text:'x'.repeat(k===2?334:333)} as ImportUnit)))
 const batches=wizardLinePlan(units,chapters,{characters:120000,maxUnits:300},4)
 assert.deepEqual(batches.flat().map(u=>u.id),units.map(u=>u.id),'complete, ordered and without repeats')
 assert.ok(batches.length>=3&&batches.length<=4,String(batches.length))
 const owner=(u:ImportUnit)=>chapters.findIndex(c=>u.start>=c.start&&u.start<c.end)
 const sets=batches.map(b=>new Set(b.map(owner)));for(let i=0;i<sets.length;i++)for(let j=i+1;j<sets.length;j++)assert.ok(![...sets[i]].some(c=>sets[j].has(c)),'a chapter stays in one batch')
 // A cap smaller than one chapter still keeps whole chapters (the longest chapter is the floor).
 assert.ok(wizardLinePlan(units,chapters,{characters:120000,maxUnits:300},1000).every(b=>new Set(b.map(owner)).size===1))
 // The profile limit wins over the chapter floor: an oversized chapter is cut by units.
 assert.ok(wizardLinePlan(units,chapters,{characters:500,maxUnits:300},1).every(b=>b.reduce((n,u)=>n+u.text.length,0)<=500))
})
test('LP-06/LP-16/LP-17: ids are made unique per batch, same-name entries reuse the stored id, in-batch links follow',()=>{
 const event=(id:string,name:string,facts:Record<string,string>={}):ImportArtifact=>({id,kind:'worldline',name,text:'事件。',facts:{lineId:'x',lineName:'主线',timeKind:'unknown',people:'[]',reliability:'客观事实',...facts},evidence:[{unitId:'u1',quote:'合成'}],sourceUnitIds:['u1'],origin:'inferred'})
 const stored=[event('wl-old','渡口相遇')]
 const a=wizardLineIds('worldline',[event('ev-1','新事件'),event('ev-2','子事件',{parentId:'ev-1'}),event('ev-3','渡口相遇')],'u1',stored)
 const b=wizardLineIds('worldline',[event('ev-1','另一事件')],'u9',stored)
 assert.match(a[0].id,/^wl-[0-9a-f]{16}$/u);assert.notEqual(a[0].id,b[0].id,'the same model id in two batches gives two ids')
 assert.equal(a[1].facts.parentId,a[0].id,'an in-batch parent follows the rename');assert.equal(a[2].id,'wl-old','a same-name entry keeps the stored id')
 assert.deepEqual(wizardLineIds('worldline',[event('ev-1','新事件')],'u1',stored).map(x=>x.id),[a[0].id],'deterministic')
 assert.notEqual(a[0].facts.lineId,'x');assert.equal(a[0].facts.lineId,b[0].facts.lineId,'one lineName gives one lineId')
 assert.equal(wizardLineIds('worldline',[event('e','甲',{lineName:'主 线'})],'u1',[])[0].facts.lineId,a[0].facts.lineId,'whitespace is ignored')
 assert.notEqual(wizardLineIds('worldline',[event('e','甲',{lineName:'支线'})],'u1',[])[0].facts.lineId,a[0].facts.lineId)
 const narrative:ImportArtifact={id:'nr',kind:'narrative',name:'讲述',text:'讲述。',facts:{chapterIndex:'0',order:'0',refs:JSON.stringify([{eventId:'wl-old',reliability:'客观事实'}]),reliability:'客观事实'},evidence:[{unitId:'u1',quote:'合成'}],sourceUnitIds:['u1'],origin:'inferred'}
 const [n]=wizardLineIds('narrative',[narrative],'u1',[]);assert.match(n.id,/^nr-[0-9a-f]{16}$/u);assert.equal(JSON.parse(n.facts.refs)[0].eventId,'wl-old','catalog references stay')
})
test('LP-16b: same-name events join people; same-title narrative points join their refs without a conflict',()=>{
 const base=(kind:'worldline'|'narrative',id:string,facts:Record<string,string>):ImportArtifact=>({id,kind,name:kind==='worldline'?'渡口相遇':'第一章 起',text:'合成。',facts,evidence:[{unitId:'u1',quote:'合成'}],sourceUnitIds:['u1'],origin:'inferred'})
 const ev=(id:string,people:string[])=>base('worldline',id,{lineId:'l',lineName:'主线',timeKind:'unknown',people:JSON.stringify(people),reliability:'客观事实'})
 const w=mergeImportArtifacts([ev('a',['甲'])],[ev('b',['乙','甲'])],1);assert.equal(w.conflicts.length,0);assert.deepEqual(JSON.parse(w.artifacts[0].facts.people),['甲','乙'])
 const nr=(id:string,refs:object[])=>base('narrative',id,{chapterIndex:'0',order:'0',refs:JSON.stringify(refs),reliability:'客观事实'})
 const r1={eventId:'e1',reliability:'客观事实'},r2={eventId:'e2',kind:'mention',reliability:'人物推测',attribution:'甲'}
 const n=mergeImportArtifacts([nr('a',[r1])],[nr('b',[r2,r1])],1);assert.equal(n.conflicts.length,0);assert.deepEqual(JSON.parse(n.artifacts[0].facts.refs),[r1,r2])
 assert.equal(mergeImportArtifacts([ev('a',['甲'])],[{...ev('b',['甲']),facts:{...ev('b',['甲']).facts,timeKind:'exact',timeValue:'1'}}],1).conflicts.length,1,'other differing fields stay author conflicts')
})
test('LP-16c: reconciliation only joins two inferred entries without locks; source copies and narrators stay conflicts',()=>{
 const ev=(id:string,people:string[],origin:'inferred'|'source'='inferred'):ImportArtifact=>({id,kind:'worldline',name:'渡口相遇',text:'合成。',facts:{lineId:'l',lineName:'主线',timeKind:'unknown',people:JSON.stringify(people),reliability:'客观事实'},evidence:[{unitId:'u1',quote:'合成'}],sourceUnitIds:['u1'],origin})
 assert.equal(mergeImportArtifacts([ev('a',['甲'],'source')],[ev('b',['乙'])],1).conflicts.length,1,'source copy vs inferred stays a conflict')
 assert.equal(mergeImportArtifacts([ev('a',['甲'])],[ev('b',['乙'])],1,[{artifactId:'a',field:'people'}]).conflicts.length,1,'a locked field is not joined')
 const time=(t:string)=>({...ev('a',['甲']),facts:{...ev('a',['甲']).facts,time:t}})
 assert.equal(mergeImportArtifacts([time('六月底')],[{...time('六月底凌晨'),id:'b'}],1).artifacts[0].facts.time,'六月底凌晨','time joins by containment')
 const nr=(id:string,narrator:string):ImportArtifact=>({id,kind:'narrative',name:'第一章 起',text:'讲述。',facts:{chapterIndex:'0',order:'0',refs:'[]',narrator,reliability:'客观事实'},evidence:[{unitId:'u1',quote:'合成'}],sourceUnitIds:['u1'],origin:'inferred'})
 assert.equal(mergeImportArtifacts([nr('a','c-1')],[nr('b','c-2')],1).conflicts.length,1,'other narrative fields are not joined')
})
test('LP-07b: a source-copy worldline keeps its lineId; inferred ones get the exact derived id',()=>{
 const ev=(origin:'inferred'|'source',lineName:string):ImportArtifact=>({id:'e',kind:'worldline',name:'事件',text:'合成。',facts:{lineId:'main',lineName,timeKind:'unknown',people:'[]',reliability:'客观事实'},evidence:[{unitId:'u1',quote:'合成'}],sourceUnitIds:['u1'],origin})
 assert.equal(wizardLineIds('worldline',[ev('source','主线')],'u1',[])[0].facts.lineId,'main')
 assert.equal(wizardLineIds('worldline',[ev('inferred','主 线')],'u1',[])[0].facts.lineId,'line-'+importHash('主线').slice(0,16))
 assert.notEqual(wizardLineIds('worldline',[ev('inferred','Main')],'u1',[])[0].facts.lineId,wizardLineIds('worldline',[ev('inferred','main')],'u1',[])[0].facts.lineId,'NFKC does not fold case')
})
test('LP-09b: a structure failure that survives the re-run splits the batch; every unit is still covered',async()=>{
 let target:string|undefined
 const f=await linesFixture(base=>{const inner=linesAi(base);return async r=>{if(isLine(r)&&r.kind==='narrative'&&r.units.length>1&&(!target||target===r.units[0].id)){target=r.units[0].id;throw Error('模型返回结构不完整（artifacts）')}return inner(r)}})
 try{
  await toLines(f);const v=await toStep(f,'outline').catch(async()=>f.settle()),j=await f.journal()
  assert.equal(v.wizard!.stepState.narrative,'done',v.wizard!.stepError);assert.deepEqual([...j.coverage.narrative].sort(),j.workingUnits!.map(u=>u.id).sort())
 }finally{await f.dispose()}
})
test('LP-23: lines-lane replies get shape-only fixes; content and other lanes are untouched',()=>{
 const unit={id:'u1',fileId:'f',kind:'body',start:0,end:20,text:'沈砚在合成渡口旁停步，风声很大。'} as ImportUnit
 const request=lineRequest('worldline',{units:[unit],entities:[{id:'c-1',kind:'character',name:'沈砚'}]})
 const parse=<T,>(text:string)=>JSON.parse(text) as T
 const reply={artifacts:[{id:'e',kind:'worldline',name:'停步',text:'沈砚停步。',facts:{lineId:'x',lineName:'主线',timeKind:'window',timeValue:'六月底',timeEnd:'七月初',time:'夏',people:JSON.stringify(['沈砚','无名路人']),eventId:'e',parentId:' ',reliability:'客观事实'},evidence:[{unitId:'u1',quote:'沈砚在合成渡口'},{unitId:'u1',quote:'模型虚构的引文'}],sourceUnitIds:['u1','u-other'],origin:'inferred'}]}
 const out=JSON.parse(normalizeLinesReply(request,JSON.stringify(reply),parse)!.text).artifacts[0]
 assert.deepEqual(out.facts,{lineId:'x',lineName:'主线',timeKind:'unknown',time:'夏 — 六月底 — 七月初',people:'["c-1"]',reliability:'客观事实'},'a unique name becomes its id; an unknown person is not a link')
 assert.equal(out.text,'沈砚停步。');assert.equal(out.name,'停步');assert.deepEqual(out.evidence,[{unitId:'u1',quote:'沈砚在合成渡口'}]);assert.deepEqual(out.sourceUnitIds,['u1'])
 const missing=JSON.parse(normalizeLinesReply(request,JSON.stringify({artifacts:[{...reply.artifacts[0],facts:{lineId:'x',lineName:'主线',reliability:'客观事实'}}]}),parse)!.text).artifacts[0]
 assert.equal(missing.facts.timeKind,'unknown');assert.equal(missing.facts.people,'[]')
 // All quotes unlocatable: evidence stays for the strict check (correction / split), nothing is invented.
 const none=JSON.parse(normalizeLinesReply(request,JSON.stringify({artifacts:[{...reply.artifacts[0],evidence:[{unitId:'u1',quote:'虚构'}]}]}),parse)!.text).artifacts[0];assert.deepEqual(none.evidence,[{unitId:'u1',quote:'虚构'}])
 const valid={artifacts:[{...reply.artifacts[0],facts:{lineId:'x',lineName:'主线',timeKind:'unknown',people:'["c-1"]',reliability:'客观事实'},evidence:[{unitId:'u1',quote:'沈砚在合成渡口'}],sourceUnitIds:['u1']}]}
 assert.equal(normalizeLinesReply(request,JSON.stringify(valid),parse),undefined,'a valid reply passes unchanged')
 assert.equal(normalizeLinesReply(request,'not json',parse),undefined)
})
test('LP-23b: narrative replies get position and link-shape fixes only',()=>{
 const unit={id:'u1',fileId:'f',kind:'body',start:100,end:120,text:'沈砚在合成渡口旁停步，风声很大。'} as ImportUnit
 const request=lineRequest('narrative',{units:[unit],chapters:[{id:'c0',title:'甲',start:0,end:100},{id:'c1',title:'乙',start:100,end:200}],entities:[{id:'c-1',kind:'character',name:'沈砚'},{id:'wl-1',kind:'worldline',name:'停步'}]})
 const parse=<T,>(text:string)=>JSON.parse(text) as T
 const item=(facts:Record<string,string>,id='n')=>({id,kind:'narrative',name:'讲述',text:'讲述。',facts,evidence:[{unitId:'u1',quote:'沈砚在合成渡口'}],sourceUnitIds:['u1'],origin:'inferred'})
 const out=JSON.parse(normalizeLinesReply(request,JSON.stringify({artifacts:[item({narrator:'说书人',characterId:'wl-1',reliability:'客观事实',refs:JSON.stringify([{eventId:'wl-1',reliability:'客观事实',character:'沈砚'},{eventId:'wl-unknown',reliability:'客观事实'}])}),item({reliability:'客观事实'},'c-1')]}),parse)!.text).artifacts
 assert.deepEqual(out[0].facts,{reliability:'客观事实',refs:JSON.stringify([{eventId:'wl-1',reliability:'客观事实',character:'c-1'}]),chapterIndex:'1',order:'0'})
 assert.equal(out[1].facts.order,'1');assert.equal(out[1].facts.refs,'[]');assert.equal(out[1].id,'c-1','ids are never changed (3R3-2)')
 assert.equal(out[0].text,'讲述。')
 assert.deepEqual(JSON.parse(normalizeLinesReply(request,JSON.stringify({artifacts:[]}),parse)!.text),{artifacts:[],notFound:true})
 // A filled order continues after the chapter's explicit orders.
 const filled=JSON.parse(normalizeLinesReply(request,JSON.stringify({artifacts:[item({chapterIndex:'1',order:'4',refs:'[]',reliability:'客观事实'}),item({chapterIndex:'1',refs:'[]',reliability:'客观事实'},'m')]}),parse)!.text).artifacts
 assert.equal(filled[1].facts.order,'5')
})
test('LP-17b: repeated model ids in one reply are not renamed; the strict check still rejects them',()=>{
 const unit={id:'u1',fileId:'f',kind:'body',start:0,end:20,text:'沈砚在合成渡口旁停步，风声很大。'} as ImportUnit
 const request=lineRequest('narrative',{units:[unit],chapters:[{id:'c0',title:'甲',start:0,end:100}],entities:[{id:'c-1',kind:'character',name:'沈砚'}]})
 const item=(order:string)=>({id:'n',kind:'narrative',name:'讲述'+order,text:'讲述。',facts:{chapterIndex:'0',order,refs:'[]',reliability:'客观事实'},evidence:[{unitId:'u1',quote:'沈砚在合成渡口'}],sourceUnitIds:['u1'],origin:'inferred'})
 const out=normalizeLinesReply(request,JSON.stringify({artifacts:[item('0'),item('1')]}),<T,>(t:string)=>JSON.parse(t) as T)
 assert.deepEqual((out?JSON.parse(out.text):{artifacts:[item('0'),item('1')]}).artifacts.map((a:{id:string})=>a.id),['n','n'])
})
test('LP-23c: link repairs are counted; unique names become ids; attribution is never filled',()=>{
 const unit={id:'u1',fileId:'f',kind:'body',start:0,end:20,text:'沈砚在合成渡口旁停步，风声很大。'} as ImportUnit
 const request=lineRequest('narrative',{units:[unit],chapters:[{id:'c0',title:'甲',start:0,end:100}],entities:[{id:'c-1',kind:'character',name:'沈砚'},{id:'wl-1',kind:'worldline',name:'停步'}]})
 const parse=<T,>(t:string)=>JSON.parse(t) as T
 const reply={artifacts:[{id:'n',kind:'narrative',name:'讲述',text:'讲述。',facts:{chapterIndex:'0',order:'0',narrator:'说书人',reliability:'客观事实',refs:JSON.stringify([{eventId:'wl-1',reliability:'客观事实',character:'沈砚'},{eventId:'wl-x',reliability:'客观事实'}])},evidence:[{unitId:'u1',quote:'沈砚在合成渡口'},{unitId:'u1',quote:'虚构'}],sourceUnitIds:['u1'],origin:'inferred'},
  {id:'m',kind:'narrative',name:'讲述二',text:'讲述。',facts:{chapterIndex:'0',order:'1',narrator:'沈砚',reliability:'客观事实',refs:'[]'},evidence:[{unitId:'u1',quote:'沈砚在合成渡口'}],sourceUnitIds:['u1'],origin:'inferred'}]}
 const out=normalizeLinesReply(request,JSON.stringify(reply),parse)!,[a,b]=JSON.parse(out.text).artifacts
 assert.deepEqual(JSON.parse(a.facts.refs),[{eventId:'wl-1',reliability:'客观事实',character:'c-1'}],'a unique name becomes the id; the unknown event link is dropped')
 assert.equal(a.facts.narrator,undefined);assert.equal(a.facts.attribution,undefined,'attribution is never written');assert.equal(b.facts.narrator,'c-1')
 assert.deepEqual(out.counts,{droppedEvidence:1,droppedLinks:2},'the unknown event link and the unknown narrator')
 // Non-objective without attribution and with an unknown narrator still has no attribution: the strict rule rejects it.
 const strict=JSON.parse(normalizeLinesReply(request,JSON.stringify({artifacts:[{...reply.artifacts[0],facts:{...reply.artifacts[0].facts,reliability:'人物推测'}}]}),parse)!.text).artifacts[0]
 assert.equal(strict.facts.reliability,'人物推测');assert.equal(strict.facts.attribution,undefined)
})
test('LP-26: linesRepairs is accepted only from the lines lane; ambiguous names are not links',async()=>{
 const unit={id:'u',fileId:'f',kind:'body',start:0,end:4,text:'合成文字'} as ImportUnit
 const deps=(extra:object)=>({resolve:async()=>model,assert:async()=>{},generate:async()=>({notFound:true,...extra})})
 await assert.rejects(runImportAi(lineRequest('worldline',{executionLane:undefined,units:[unit]}),new AbortController().signal,deps({linesRepairs:{droppedEvidence:1,droppedLinks:0}})),/越权内容/u)
 assert.deepEqual(await runImportAi(lineRequest('worldline',{units:[unit]}),new AbortController().signal,deps({linesRepairs:{droppedEvidence:1,droppedLinks:0}})),{notFound:true,linesRepairs:{droppedEvidence:1,droppedLinks:0}})
 await assert.rejects(runImportAi(lineRequest('worldline',{units:[unit]}),new AbortController().signal,deps({linesRepairs:{droppedEvidence:0,droppedLinks:0}})),/结构或类别无效/u,'all-zero counts are refused')
 const two=lineRequest('worldline',{units:[{id:'u1',fileId:'f',kind:'body',start:0,end:20,text:'沈砚在合成渡口旁停步，风声很大。'} as ImportUnit],entities:[{id:'c-1',kind:'character',name:'沈砚'},{id:'c-2',kind:'character',name:'沈砚'}]})
 const reply={artifacts:[{id:'e',kind:'worldline',name:'停步',text:'沈砚停步。',facts:{lineId:'x',lineName:'主线',timeKind:'unknown',people:JSON.stringify(['沈砚','c-2']),reliability:'客观事实'},evidence:[{unitId:'u1',quote:'沈砚在合成渡口'}],sourceUnitIds:['u1'],origin:'inferred'}]}
 const out=normalizeLinesReply(two,JSON.stringify(reply),<T,>(t:string)=>JSON.parse(t) as T)!
 assert.equal(JSON.parse(out.text).artifacts[0].facts.people,'["c-2"]','a name shared by two characters is not resolved');assert.deepEqual(out.counts,{droppedEvidence:0,droppedLinks:1})
})
test('LP-24: the line plan minimises the largest batch and sends the longest first',()=>{
 const sizes=[4000,4000,4000,4000,9000,1000,1000,1000,1000,1000]
 let at=0;const chapters=sizes.map(n=>{const c={start:at,end:at+n};at+=n;return c})
 const units:ImportUnit[]=chapters.map((c,i)=>({id:'u'+i,fileId:'f',kind:'body',start:c.start,end:c.end,text:'x'.repeat(c.end-c.start)} as ImportUnit))
 const batches=wizardLinePlan(units,chapters,{characters:120000,maxUnits:300},4),size=(b:ImportUnit[])=>b.reduce((n,u)=>n+u.text.length,0)
 assert.ok(batches.length<=4);assert.equal(Math.max(...batches.map(size)),9000,'no batch is larger than needed (the 9000 chapter)')
 assert.deepEqual(batches.flat().map(u=>u.id).sort(),units.map(u=>u.id).sort())
 for(let i=1;i<batches.length;i++)assert.ok(size(batches[i-1])>=size(batches[i]),'longest first')
})
test('LP-25: generated ids avoid ids already held by another stored entry',()=>{
 const event=(id:string,name:string):ImportArtifact=>({id,kind:'worldline',name,text:'事件。',facts:{lineId:'x',lineName:'主线',timeKind:'unknown',people:'[]',reliability:'客观事实'},evidence:[{unitId:'u1',quote:'合成'}],sourceUnitIds:['u1'],origin:'inferred'})
 const taken=wizardLineIds('worldline',[event('ev-1','甲')],'u1',[])[0].id
 const again=wizardLineIds('worldline',[event('ev-1','乙')],'u1',[event(taken,'甲')])[0].id
 assert.notEqual(again,taken);assert.match(again,/^wl-[0-9a-f]{16}$/u)
})
test('LP-16d: same-name narrative points in one chapter keep the smaller order without a conflict',()=>{
 const nr=(id:string,order:string):ImportArtifact=>({id,kind:'narrative',name:'第一章 起',text:'讲述'+order,facts:{chapterIndex:'0',order,refs:'[]',reliability:'客观事实'},evidence:[{unitId:'u1',quote:'合成'}],sourceUnitIds:['u1'],origin:'inferred'})
 const m=mergeImportArtifacts([nr('a','3')],[nr('b','1')],1);assert.equal(m.conflicts.length,0);assert.equal(m.artifacts[0].facts.order,'1')
 // Another chapter: the chapterIndex conflict blocks every reconciled value, order included.
 const other={...nr('c','1'),facts:{...nr('c','1').facts,chapterIndex:'2'}};const x=mergeImportArtifacts([nr('a','3')],[other],1);assert.ok(x.conflicts.some(c=>c.field==='chapterIndex'));assert.equal(x.artifacts[0].facts.order,'3')
 assert.ok(mergeImportArtifacts([nr('a','3')],[nr('b','1')],1,[{artifactId:'a',field:'order'}]).conflicts.some(c=>c.field==='order'),'a locked order stays a conflict')
})
test('LP-12: only lines-lane prompts carry the story-line and refs rules',()=>{
 const unit={id:'u',fileId:'f',kind:'body',start:0,end:4,text:'合成文字'} as ImportUnit
 const lane=(kind:'worldline'|'narrative')=>importAiPrompt(lineRequest(kind,{units:[unit]})),plain=(kind:'worldline'|'narrative')=>importAiPrompt(lineRequest(kind,{units:[unit],executionLane:undefined}))
 assert.match(lane('worldline'),/lineName不得等于或改写事件name/u);assert.doesNotMatch(plain('worldline'),/lineName不得等于或改写事件name/u)
 assert.match(lane('narrative'),/每一章都须至少返回一个叙事点/u);assert.doesNotMatch(plain('narrative'),/每一章都须至少返回一个叙事点/u)
 assert.match(lane('narrative'),/refs写入对应eventId/u);assert.doesNotMatch(plain('narrative'),/refs写入对应eventId/u)
})
test('LP-04/LP-05/LP-15: both steps run their batches in parallel and keep every result',async()=>{
 const f=await linesFixture(),p=gate(f,f.handler())
 try{
  await toLines(f);await until(()=>p.pending.size>=8);await sleep(30)
  assert.ok(p.pending.size>1&&p.pending.size<=31,String(p.pending.size));assert.ok([...p.pending.values()].every(e=>e.r.kind==='worldline'))
  assert.ok([...p.pending.values()].every(e=>e.r.executionLane==='wizard-lines-v1'))
  p.releaseAll();const v=await toStep(f,'outline').catch(async()=>f.settle()),j=await f.journal()
  assert.equal(v.wizard!.stepState.worldline,'done',v.wizard!.stepError);assert.equal(v.wizard!.stepState.narrative,'done',v.wizard!.stepError)
  assert.ok(p.peaks.worldline>1&&p.peaks.narrative>1,JSON.stringify(p.peaks));assert.ok(p.peak<=31)
  const sent=(k:string)=>f.requests.filter(r=>isLine(r)&&r.kind===k)
  assert.equal(j.artifacts.filter(a=>a.kind==='worldline').length,sent('worldline').length,'one event per batch, none lost')
  assert.equal(j.artifacts.filter(a=>a.kind==='narrative').length,sent('narrative').length)
  const lastWorld=Math.max(...sent('worldline').map(r=>f.requests.indexOf(r))),firstNarrative=Math.min(...sent('narrative').map(r=>f.requests.indexOf(r)));assert.ok(lastWorld<firstNarrative)
  const units=j.workingUnits!.map(u=>u.id).sort();assert.deepEqual([...j.coverage.worldline].sort(),units);assert.deepEqual([...j.coverage.narrative].sort(),units)
 }finally{p.releaseAll();await f.dispose()}
})
test('LP-08: a multi-unit batch with a model-output failure is split by chapters at once; a single unit is re-run once',async()=>{
 let first:ImportAiRequest|undefined
 const f=await linesFixture(base=>{const inner=linesAi(base);return async r=>{if(isLine(r)&&r.kind==='worldline'&&!first&&r.units.length>1){first=r;throw Error('模型返回结构不完整（artifacts.0.evidence）')}return inner(r)}})
 try{
  await toLines(f);const v=await toStep(f,'outline').catch(async()=>f.settle())
  assert.equal(v.wizard!.stepState.worldline,'done',v.wizard!.stepError)
  const ids=new Set(first!.units.map(u=>u.id)),after=f.requests.slice(f.requests.findIndex(r=>r.operationId===first!.operationId)+1).filter(r=>isLine(r)&&r.kind==='worldline'&&r.units.some(u=>ids.has(u.id)))
  assert.ok(!after.some(r=>r.units.length===first!.units.length),'no full re-run of the failed batch');assert.ok(after.every(r=>r.units.every(u=>ids.has(u.id))))
  const halves=after.slice(0,2);assert.deepEqual(halves.flatMap(r=>r.units.map(u=>u.id)).sort(),[...ids].sort(),'the first two requests are the halves, covering the batch exactly once')
 }finally{await f.dispose()}
})
test('LP-08b: a single-unit batch failing twice fails the step; a batch failing every time stops after two split levels',async()=>{
 const seen=new Map<string,number>()
 const f=await linesFixture(base=>{const inner=linesAi(base);return async r=>{if(isLine(r)&&r.kind==='worldline'&&r.units.some(u=>u.id===firstUnit)){const k=r.units.map(u=>u.id).join(',');seen.set(k,(seen.get(k)??0)+1);throw Error('模型返回结构不完整（artifacts）')}return inner(r)}})
 let firstUnit:string|undefined
 const original=f.handler();f.setAi(async r=>{if(isLine(r)&&r.kind==='worldline')firstUnit??=r.units[0].id;return original(r)})
 try{
  await toLines(f);const v=await f.settle()
  assert.equal(v.wizard!.stepState.worldline,'failed');assert.match(v.wizard!.stepError??'',/结构不完整/u)
  const requests=[...seen.values()].reduce((a,b)=>a+b,0);assert.ok(requests<=11,'at most 1+2+4+4 requests for one batch: '+requests)
 }finally{await f.dispose()}
})
test('LP-09: a batch whose quotes still cannot be located is split in halves',async()=>{
 let target:string|undefined
 const f=await linesFixture(base=>{const inner=linesAi(base);return async r=>{if(isLine(r)&&r.kind==='worldline'&&r.units.length>1&&(!target||target===r.units[0].id)){target=r.units[0].id;throw Error('模型证据无法定位（no-match）')}return inner(r)}})
 try{
  await toLines(f);const v=await toStep(f,'outline').catch(async()=>f.settle())
  assert.equal(v.wizard!.stepState.worldline,'done',v.wizard!.stepError)
  assert.ok(f.requests.some(r=>isLine(r)&&r.instruction?.includes('上一次引文未通过定位校验')))
  assert.deepEqual([...(await f.journal()).coverage.worldline].sort(),(await f.journal()).workingUnits!.map(u=>u.id).sort())
 }finally{await f.dispose()}
})
test('LP-10: a lasting failure stops new batches, keeps the committed ones and a retry sends only the rest',async()=>{
 let bad:string|undefined,healed=false
 const f=await linesFixture(base=>{const inner=linesAi(base);return async r=>{if(isLine(r)&&r.kind==='worldline'){bad??=r.units[0].id;if(!healed&&r.units[0].id===bad)throw Error('模型接口请求失败（HTTP 500）')}return inner(r)}})
 try{
  await toLines(f);const v=await f.settle()
  assert.equal(v.wizard!.step,'worldline');assert.equal(v.wizard!.stepState.worldline,'failed');assert.match(v.wizard!.stepError??'',/HTTP 500/u)
  const j=await f.journal(),covered=new Set(j.coverage.worldline??[]);assert.ok(covered.size>0&&!covered.has(bad!),'committed batches stay covered')
  const before=f.requests.length;healed=true;await f.act('wizard-redetect');await toStep(f,'outline').catch(async()=>f.settle())
  const resent=f.requests.slice(before).filter(r=>isLine(r)&&r.kind==='worldline');assert.ok(resent.length>0);assert.ok(resent.every(r=>r.units.every(u=>!covered.has(u.id))),'only uncovered units are sent again')
 }finally{await f.dispose()}
})
test('LP-15b: a batch whose merge fails leaves no partial artifacts or coverage; the others are kept',async()=>{
 let bad:string|undefined
 // A parent that exists nowhere passes the per-artifact checks but fails importNativeMappings inside the checkpoint.
 const f=await linesFixture(base=>{const inner=linesAi(base);return async r=>{if(isLine(r)&&r.kind==='worldline'){const out=await inner(r);if(bad===undefined||r.units[0].id===bad){bad=r.units[0].id;const a=out.artifacts![0];return {artifacts:[{...a,facts:{...a.facts,parentId:'wl-missing'}}]}}return out}return inner(r)}})
 try{
  await toLines(f);const v=await f.settle(),j=await f.journal(),covered=new Set(j.coverage.worldline??[]),batch=f.requests.find(r=>isLine(r)&&r.units[0].id===bad)!
  assert.equal(v.wizard!.stepState.worldline,'failed',v.wizard!.stepError)
  assert.ok(batch.units.every(u=>!covered.has(u.id)),'the failed batch is not covered');assert.ok(covered.size>0,'other batches stay covered')
  const names=j.artifacts.filter(a=>a.kind==='worldline').map(a=>a.name);assert.equal(names.length,new Set(names).size,'no half-merged duplicate')
 }finally{await f.dispose()}
})
/** docs/517 3R5: one slow original batch; every other request answers quickly. `winner` decides which path ends first:
 * 'halves' — the original stays until it is cancelled; 'original' — the original answers as soon as both halves are out,
 * and the halves answer only after that. */
async function slowFixture(winner:'halves'|'original'|'fallback'){
 let slow:ImportAiRequest|undefined,cancelled=0,halvesOut=0,originalDone=false
 const isHalf=(r:ImportAiRequest)=>!!slow&&r.operationId!==slow.operationId&&r.units.length<slow.units.length&&r.units.every(u=>slow!.units.some(x=>x.id===u.id))
 const f=await linesFixture(base=>{const inner=linesAi(base);return async r=>{
  if(isLine(r)&&r.kind==='worldline'&&!slow&&r.units.length>1){slow=r
   await new Promise<void>((resolve,reject)=>{const tick=setInterval(()=>{if(winner!=='halves'&&halvesOut===2){clearInterval(tick);setTimeout(resolve,winner==='fallback'?200:0)}},5);setTimeout(()=>{clearInterval(tick);reject(Error('fixture: slow batch was never released'))},20000);(f.options as {cancelAi:(id:string)=>Promise<void>}).cancelAi=async id=>{if(id===r.operationId){cancelled++;clearInterval(tick);reject(new DOMException('已取消','AbortError'))}}})
   const out=await inner(r);originalDone=true;return out}
  // A half waits for the original, but never longer than 3 s, so a slow machine cannot leave work running.
  if(isLine(r)&&r.kind==='worldline'&&isHalf(r)){halvesOut++;if(winner==='original'){const end=Date.now()+3000;while(Date.now()<end&&!(originalDone&&(await f.journal()).coverage.worldline?.includes(slow!.units[0].id)))await sleep(10)}}
  if(isLine(r)&&r.kind==='worldline'&&isHalf(r)&&winner==='fallback')throw Error('模型接口请求失败（HTTP 500）')
  return inner(r)}})
 return {f,get slow(){return slow},get cancelled(){return cancelled},isHalf}
}
test('LP-27: a slow batch also sends its chapter halves; the halves are adopted and the slow request is cancelled',async()=>{
 process.env.SHAKEINK_LINES_EARLY_MS='100'
 const x=await slowFixture('halves')
 try{
  await toLines(x.f);const v=await toStep(x.f,'outline').catch(async()=>x.f.settle()),j=await x.f.journal()
  assert.equal(v.wizard!.stepState.worldline,'done',v.wizard!.stepError)
  const halves=x.f.requests.filter(r=>isLine(r)&&r.kind==='worldline'&&x.isHalf(r))
  assert.equal(halves.length,2,'two halves sent while the slow batch runs');assert.equal(x.cancelled,1,'the losing slow request is cancelled')
  const names=j.artifacts.filter(a=>a.kind==='worldline').map(a=>a.name);assert.equal(names.length,new Set(names).size)
  assert.deepEqual([...j.coverage.worldline].sort(),j.workingUnits!.map(u=>u.id).sort())
 }finally{delete process.env.SHAKEINK_LINES_EARLY_MS;await x.f.dispose()}
})
test('LP-28: when the slow batch returns first its halves are discarded; nothing is merged twice',async()=>{
 process.env.SHAKEINK_LINES_EARLY_MS='100'
 const x=await slowFixture('original')
 try{
  await toLines(x.f);const v=await toStep(x.f,'outline').catch(async()=>x.f.settle()),j=await x.f.journal()
  assert.equal(v.wizard!.stepState.worldline,'done',v.wizard!.stepError)
  const sent=x.f.requests.filter(r=>isLine(r)&&r.kind==='worldline'),halves=sent.filter(x.isHalf)
  assert.equal(halves.length,2,'the halves were sent')
  const names=j.artifacts.filter(a=>a.kind==='worldline').map(a=>a.name)
  assert.ok(names.includes('事件'+x.slow!.units[0].start),'the original result is adopted')
  assert.ok(!halves.some(h=>h.units[0].id!==x.slow!.units[0].id&&names.includes('事件'+h.units[0].start)),'the second half adds nothing')
  const inSlow=j.artifacts.filter(a=>a.kind==='worldline'&&a.sourceUnitIds.every(id=>x.slow!.units.some(u=>u.id===id)))
  assert.equal(inSlow.length,1,'exactly the original result covers the slow batch region');assert.equal(names.length,new Set(names).size)
 }finally{delete process.env.SHAKEINK_LINES_EARLY_MS;await x.f.dispose()}
})
test('LP-08c: the step-wide budget caps extra requests across batches; once spent the next failure fails the step',async()=>{
 // Every multi-unit batch fails once; its halves succeed. Halves cost 2 each, so the budget (= planned batches)
 // runs out after about half of the batches; the next failure then fails the step.
 const failedOnce=new Set<string>();let planned=0
 const f=await linesFixture(base=>{const inner=linesAi(base);return async r=>{if(isLine(r)&&r.kind==='worldline'&&r.units.length>2&&!failedOnce.has(r.units.map(u=>u.id).join(','))){failedOnce.add(r.units.map(u=>u.id).join(','));planned++;throw Error('模型返回结构不完整（artifacts）')}return inner(r)}})
 try{
  await toLines(f);const v=await f.settle(),sent=f.requests.filter(r=>isLine(r)&&r.kind==='worldline').length
  assert.ok(planned>2,'several original batches failed: '+planned)
  assert.equal(v.wizard!.stepState.worldline,'failed','the budget runs out before every batch is split')
  assert.match(v.wizard!.stepError??'',/结构不完整/u);assert.doesNotMatch(v.wizard!.stepError??'',/风声|渡口/u,'no source text in the error')
  assert.ok(sent-planned<=planned+1,'extra requests ≤ planned batches (+1 for the last split): '+JSON.stringify({sent,planned}))
 }finally{await f.dispose()}
})
test('LP-15c: going back to an earlier list clears the line repair counts with the line coverage',async()=>{
 const f=await linesFixture(base=>{const inner=linesAi(base);return async r=>{const out=await inner(r);if(isLine(r)&&r.kind==='worldline'&&out.artifacts?.length)return {...out,linesRepairs:{droppedEvidence:1,droppedLinks:0}};return out}})
 try{
  await toLines(f);const at=await f.settle()
  let j=await f.journal();assert.ok((j.wizard!.lineRepairs?.worldline?.droppedEvidence??0)>0,'counts kept: '+at.wizard!.step+' '+at.phase);assert.ok(j.wizard!.dropped.some(d=>d.kind==='lines'))
  await f.act('wizard-revise',{to:'detect-char'});await f.settle();j=await f.journal()
  assert.equal(j.wizard!.lineRepairs,undefined,'counts are cleared with the coverage');assert.ok(!j.wizard!.dropped.some(d=>d.kind==='lines'))
 }finally{await f.dispose()}
})
test('LP-29: when both early halves fail for good the original is adopted and the step completes',async()=>{
 process.env.SHAKEINK_LINES_EARLY_MS='100'
 const x=await slowFixture('fallback')
 try{
  await toLines(x.f);const v=await toStep(x.f,'outline').catch(async()=>x.f.settle()),j=await x.f.journal()
  assert.equal(v.wizard!.stepState.worldline,'done',v.wizard!.stepError)
  assert.equal(x.f.requests.filter(r=>isLine(r)&&r.kind==='worldline'&&x.isHalf(r)).length,2,'the halves were sent and failed')
  assert.ok(j.artifacts.some(a=>a.kind==='worldline'&&a.name==='事件'+x.slow!.units[0].start),'the original result is adopted')
  assert.deepEqual([...j.coverage.worldline].sort(),j.workingUnits!.map(u=>u.id).sort())
 }finally{delete process.env.SHAKEINK_LINES_EARLY_MS;await x.f.dispose()}
})
test('LP-30: no early split below three finished batches or for a single-chapter batch; at most one per batch',async()=>{
 process.env.SHAKEINK_LINES_EARLY_MS='100'
 // Every multi-unit worldline batch is slow, so no batch finishes before the others: fewer than three samples exist
 // while they run, and nothing may split early.
 let slowOnes=0
 const f=await linesFixture(base=>{const inner=linesAi(base);return async r=>{if(isLine(r)&&r.kind==='worldline'&&r.units.length>1&&slowOnes<200){slowOnes++;await sleep(400)}return inner(r)}})
 try{
  process.env.SHAKEINK_IMPORT_DEBUG='1';const lines:string[]=[],error=console.error;console.error=(...a:unknown[])=>{lines.push(String(a[0]));error(...a)}
  try{await toLines(f);await toStep(f,'outline').catch(async()=>f.settle())}finally{console.error=error;delete process.env.SHAKEINK_IMPORT_DEBUG}
  const early=lines.filter(l=>l.startsWith('lines-early-split')&&l.includes('worldline'))
  assert.equal(early.length,0,'all batches start together: no three samples before any is slow')
 }finally{delete process.env.SHAKEINK_LINES_EARLY_MS;await f.dispose()}
})
test('LP-20: pausing waits for every in-flight line request before the step returns',async()=>{
 const f=await linesFixture(),p=gate(f,f.handler())
 try{
  await toLines(f);await until(()=>p.pending.size>=4);const inflight=p.pending.size;assert.ok(inflight>=4)
  await f.act('pause');await f.settle();assert.equal(p.pending.size,0,'no request left in flight')
  const j=await f.journal();assert.notEqual(j.wizard!.stepState.worldline,'failed');assert.equal((j.coverage.worldline??[]).length,0,'unsettled batches are not covered')
 }finally{p.releaseAll();await f.dispose()}
})
// LP-22 is replaced by docs/532 OP-04 (wizard outlines run on the lines lane) and OP-14 (other flows stay serial).
export type {ImportAiResult}
