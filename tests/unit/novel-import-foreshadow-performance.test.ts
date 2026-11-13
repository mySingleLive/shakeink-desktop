import assert from 'node:assert/strict'
import {test} from 'node:test'
import {importGenerationModel,runImportGenerationLane,runImportAi,trimWellFormed,type ImportAiDependencies} from '../../desktop/service/novel-import-ai'
import {importAiPrompt} from '../../desktop/core/novel-import-ai-payload'
import {importWizardStateSchema} from '../../desktop/core/novel-import-wizard-state'
import {WIZARD_LINE_CONCURRENCY,wizardLinePlan,wizardTouchPlan,wizardTouchHalves} from '../../desktop/main/novel-import'
import type {ImportAiRequest,ImportAiResult,ImportModel,ImportSession,ImportUnit} from '../../desktop/shared/novel-import'
import type {ResolvedModel} from '../../src/lib/ai/provider'
import {acquireLongTask} from '../../src/lib/long-task'
import {fixture,source,rosterAi,model,sleep,linesAi,worldsAi,toStep,injectJournalEdit,verifyAgain,type Ai} from '../helpers/novel-import-wizard-fixture'

/* docs/536. Synthetic text and names only. */
const CHAPTERS=64
function body(){let t='';for(let i=0;i<CHAPTERS;i++)t+=`第${i+1}章 篇${i}\n\n沈砚在合成渡口${i}旁停步。${'风声。'.repeat(500)}\n\n`;return t}
const isTouch=(r:ImportAiRequest)=>r.phase==='analyze'&&r.intent==='touches'
type F=Awaited<ReturnType<typeof fixture>>
const chaptersOf=(r:ImportAiRequest)=>[...new Set(r.units.map(u=>r.chapters!.findIndex(c=>u.start>=c.start&&u.start<c.end)))]
/** Chapters whose unique quote `合成渡口i旁` lies in one of the batch's units (each unit is in exactly one batch). */
const quotedChapters=(r:ImportAiRequest)=>r.chapters!.flatMap((_,i)=>r.units.some(u=>u.text.includes(`合成渡口${i}旁`))?[i]:[])

/** One PLANT per chapter whose start lies in the batch; the quote is unique in its chapter. */
function multiTouchesAi(keyOf:(i:number)=>string=i=>'伏笔'+i,content:(i:number)=>string=i=>'说明'+i):(base:Ai)=>Ai{return base=>async r=>{
 if(!isTouch(r))return base(r)
 const touches=quotedChapters(r).flatMap(i=>{const quote=`合成渡口${i}旁`,u=r.units.find(u=>u.text.includes(quote));if(!u)return [];return [{foreshadowKey:keyOf(i),title:keyOf(i),content:content(i),touch:{kind:'PLANT' as const,chapterIndex:i,summary:'埋设'+i,quote},evidence:{unitId:u.id,quote}}]})
 return {touches}
}}
async function fsFixture(ai:(base:Ai)=>Ai=multiTouchesAi()){
 const f=await fixture([source(body(),'正文.txt','f-body')],rosterAi());f.setAi(ai(linesAi(worldsAi(f.handler()))))
 return f
}
/** Through characters, worldline and narrative to step 20; touch requests may be gated by the caller. */
async function toForeshadow(f:F){
 await f.act('choose',{mode:'files'});await f.act('wizard-next');await f.act('set-title',{title:'合成伏笔作品'});await f.act('choose-target');await f.act('wizard-next')
 await f.act('classify',{mode:'ai',consent:true});await f.settle()
 await f.act('select',{selected:['body'],targets:['character','worldline','narrative','foreshadow'],infer:true});await f.act('wizard-next',{consent:true});await f.settle()
 assert.equal((await f.view()).wizard!.step,'tree');await f.act('wizard-next',{consent:true})
 for(let i=0;i<800;i++){const w=(await f.view()).wizard!;if(w.step==='foreshadow')return;if(w.stepState[w.step]==='failed')throw Error('卡在 '+w.step+' '+(w.stepError??''));if(w.stepState[w.step]==='waiting'&&!f.controller.active)await f.act('wizard-next');else await sleep(10)}
 throw Error('未到达伏笔步骤')
}
async function until(check:()=>boolean|Promise<boolean>,ms=8000){const end=Date.now()+ms;while(!await check()){if(Date.now()>end)throw Error('等待条件超时');await sleep(5)}}
/** Touch requests wait until released (one by one or all); counts the in-flight peak. */
function gateTouches(f:F,inner:Ai){
 const pending=new Map<string,{resolve:()=>void;reject:(e:unknown)=>void;r:ImportAiRequest}>();let open=false,running=0,peak=0
 f.setAi(async r=>{if(!isTouch(r))return inner(r);running++;peak=Math.max(peak,running);try{if(!open)await new Promise<void>((resolve,reject)=>pending.set(r.operationId,{resolve,reject,r}));return await inner(r)}finally{pending.delete(r.operationId);running--}})
 f.options.cancelAi=async id=>{pending.get(id)?.reject(new DOMException('已取消','AbortError'))}
 return {pending,get peak(){return peak},release(id:string){pending.get(id)?.resolve()},fail(id:string,error:unknown){pending.get(id)?.reject(error)},releaseAll(){open=true;for(const p of pending.values())p.resolve()}}
}
const touchRequests=(f:F)=>f.requests.filter(isTouch)
const covered=async(f:F)=>new Set((await f.journal()).coverage.touches??[])
const foreshadows=(j:ImportSession)=>j.artifacts.filter(a=>a.kind==='foreshadow'&&a.schema===2).sort((a,b)=>a.id.localeCompare(b.id))

test('FP-01: touches use the light policy and the import lane; review or non-semantic requests do not',async()=>{
 const resolved={model:{},modelRecord:{},providerOptions:{openai:{store:false}}} as unknown as ResolvedModel
 const deepseek={provider:'deepseek',protocol:'openai',modelId:'synthetic',thinkingLevels:['low','high'],defaultThinking:'high'}
 const touches={semanticVersion:1 as const,phase:'analyze' as const,intent:'touches' as const}
 assert.deepEqual(importGenerationModel(touches,resolved,deepseek).providerOptions,{openai:{store:false},deepseek:{thinking:{type:'disabled'}}})
 for(const r of [{...touches,phase:'review' as const},{phase:'analyze' as const,intent:'touches' as const}])assert.equal(importGenerationModel(r,resolved,deepseek),resolved,JSON.stringify(r))
 const release=await acquireLongTask(undefined,1)
 try{
  const nested=(r:Parameters<typeof runImportGenerationLane>[0])=>Promise.race([runImportGenerationLane(r,async()=>{const inner=await acquireLongTask(undefined,1);inner();return 'ran'}),sleep(200).then(()=>'blocked')])
  assert.equal(await nested(touches),'ran','a touches request does not wait for a chat slot')
  assert.equal(await nested({...touches,phase:'review'}),'blocked')
 }finally{release();await sleep(250)}
})

test('FP-02/FP-02b: chapter-aligned plan, halving by chapters then units, budget error for one unit',()=>{
 const chapters=Array.from({length:8},(_,i)=>({start:i*100,end:(i+1)*100}))
 const units:ImportUnit[]=chapters.flatMap((c,i)=>[{id:`u${i}a`,fileId:'f',kind:'body',start:c.start,end:c.start+50,text:'甲'.repeat(50)},{id:`u${i}b`,fileId:'f',kind:'body',start:c.start+50,end:c.end,text:'乙'.repeat(50)}])
 const budget={characters:100000,maxUnits:1000}
 const plan=wizardTouchPlan(units,chapters,budget,4,()=>true)
 assert.deepEqual(plan,wizardLinePlan(units,chapters,budget,4));assert.equal(plan.length,4)
 assert.deepEqual(plan.flat().map(u=>u.id).sort(),units.map(u=>u.id).sort())
 // A batch over 150 characters does not fit: two-chapter batches are halved by chapters, one chapter (100) fits.
 const halved=wizardTouchPlan(units,chapters,budget,4,b=>b.reduce((n,u)=>n+u.text.length,0)<=150)
 assert.equal(halved.length,8);for(const b of halved)assert.equal(new Set(b.map(u=>Math.floor(u.start/100))).size,1)
 // One chapter with two units halves by units.
 assert.deepEqual(wizardTouchHalves(units.slice(0,2),chapters,budget).map(b=>b.map(u=>u.id)),[['u0a'],['u0b']])
 assert.throws(()=>wizardTouchPlan(units.slice(0,2),chapters,budget,1,()=>false),/单个导入任务及完整元数据超过模型预算，请核对设定后重试/u)
})

test('FP-03/FP-11/FP-12: batches run in parallel after step 18; found count and chapter progress follow commits',async()=>{
 const f=await fsFixture(),g=gateTouches(f,f.handler())
 try{
  await toForeshadow(f)
  let v=await f.view();assert.equal(v.wizard!.foreshadowFound,0);assert.equal(v.wizard!.lineProgress!.total,CHAPTERS)
  const j0=await f.journal()
  await until(()=>g.pending.size>0&&g.pending.size===touchRequests(f).length)
  await sleep(50);const first=touchRequests(f),batches=first.length
  assert.ok(batches>1&&batches<=WIZARD_LINE_CONCURRENCY,String(batches));assert.equal(g.peak,batches)
  const c=f.controller as unknown as {session:ImportSession;executionBudget(s:ImportSession,phase:'analyze'):{characters:number;maxUnits:number}}
  const want=wizardLinePlan(j0.workingUnits!,j0.chapters,c.executionBudget(c.session,'analyze'),WIZARD_LINE_CONCURRENCY).map(b=>b.map(u=>u.id))
  assert.deepEqual(first.map(r=>r.units.map(u=>u.id)),want,'grouping and order equal the 31-lane plan')
  assert.deepEqual(first.flatMap(r=>r.units.map(u=>u.id)).sort(),j0.workingUnits!.map(u=>u.id).sort(),'every unit once')
  const sizes=first.map(r=>r.units.reduce((n,u)=>n+u.text.length,0));assert.deepEqual(sizes,[...sizes].sort((a,b)=>b-a),'longest first')
  const lastNarrative=f.requests.map((r,k)=>r.kind==='narrative'?k:-1).reduce((a,b)=>Math.max(a,b),-1),firstTouch=f.requests.findIndex(isTouch);assert.ok(firstTouch>lastNarrative)
  const narratives=j0.artifacts.filter(a=>a.kind==='narrative')
  for(const r of first){const listed=(JSON.parse(r.instruction!.slice(r.instruction!.indexOf('['))) as {id:string}[]).map(n=>n.id).sort(),want=narratives.filter(n=>{const c=j0.chapters[Number(n.facts.chapterIndex)];return r.units.some(u=>u.start<c.end&&u.end>c.start)}).map(n=>n.id).sort();assert.deepEqual(listed,want);assert.ok(r.entities!.some(e=>e.kind==='worldline'))}
  let lastDone=0,lastFound=0
  for(const r of first){g.release(r.operationId);await until(async()=>(await f.view()).wizard!.step!=='foreshadow'||(await covered(f)).has(r.units[0].id))
   v=await f.view();if(v.wizard!.step!=='foreshadow')break;assert.ok(v.wizard!.lineProgress!.done>=lastDone);assert.ok(v.wizard!.foreshadowFound!>=lastFound);lastDone=v.wizard!.lineProgress!.done;lastFound=v.wizard!.foreshadowFound!}
  v=await toStep(f,'verify');assert.equal(v.wizard!.stepState.foreshadow,'done');assert.equal(v.wizard!.foreshadowFound,undefined);assert.equal(v.wizard!.lineProgress,undefined)
  const j=await f.journal();assert.equal(foreshadows(j).length,CHAPTERS);assert.equal(j.coverage.touches!.length,j.workingUnits!.length);assert.equal(j.wizard!.touchStash,undefined)
 }finally{g.releaseAll();await f.dispose()}
})

test('FP-04: the plan does not depend on the order batches finish in',async()=>{
 // Every chapter reports the same key with its own content; the first batch in book order wins.
 const run=async(reverse:boolean)=>{
  const f=await fsFixture(multiTouchesAi(()=>'同一伏笔',i=>'说明'+i)),g=gateTouches(f,f.handler())
  try{
   await toForeshadow(f);await until(()=>g.pending.size>0&&g.pending.size===touchRequests(f).length);await sleep(50)
   const list=[...g.pending.values()].map(p=>p.r).sort((a,b)=>a.units[0].start-b.units[0].start);if(reverse)list.reverse()
   for(const r of list){g.release(r.operationId);await until(async()=>(await f.view()).wizard!.step!=='foreshadow'||(await covered(f)).has(r.units[0].id))}
   await toStep(f,'verify');const fs=foreshadows(await f.journal());return fs.map(a=>({id:a.id,name:a.name,text:a.text,facts:a.facts}))
  }finally{g.releaseAll();await f.dispose()}
 }
 const forward=await run(false),backward=await run(true)
 assert.deepEqual(backward,forward);assert.equal(forward.length,1);assert.equal(forward[0].text,'说明0');const order=JSON.parse(forward[0].facts.touches!).map((t:{chapterIndex:number})=>t.chapterIndex);assert.equal(order.length,CHAPTERS)
})

test('FP-04b: within one batch the first non-empty content of a key is kept',async()=>{
 const f=await fsFixture(base=>async r=>{if(!isTouch(r))return base(r);if(!quotedChapters(r).includes(0))return {touches:[]};const i=0,quote=`合成渡口${i}旁`,u=r.units.find(u=>u.text.includes(quote))!;const e=(content:string)=>({foreshadowKey:'钥匙',title:'钥匙',content,touch:{kind:'PLANT' as const,chapterIndex:i,summary:'s',quote},evidence:{unitId:u.id,quote}});return {touches:[e(''),e('先说明'),e('后说明')]}})
 try{await toForeshadow(f);await toStep(f,'verify');const fs=foreshadows(await f.journal());assert.equal(fs.length,1);assert.equal(fs[0].text,'先说明')}finally{await f.dispose()}
})

test('FP-05: retryable failures split by chapters or units, single units get three tries, and the step budget is capped',async()=>{
 for(const message of ['模型返回结构不完整（touches）','模型输出未完整结束','模型未返回可解析的 JSON']){
  let failed=false;const f=await fsFixture(base=>{const inner=multiTouchesAi()(base);return async r=>{if(isTouch(r)&&!failed&&chaptersOf(r).length>1){failed=true;throw Error(message)}return inner(r)}})
  try{
   await toForeshadow(f);const v=await toStep(f,'verify');assert.equal(v.wizard!.stepState.foreshadow,'done',message)
   const reqs=touchRequests(f),bad=reqs.find(r=>chaptersOf(r).length>1)!,halves=reqs.filter(r=>r!==bad&&r.units.every(u=>bad.units.some(b=>b.id===u.id)))
   assert.equal(halves.length,2);assert.deepEqual(halves.flatMap(r=>r.units.map(u=>u.id)).sort(),bad.units.map(u=>u.id).sort())
   for(const h of halves)assert.ok(!chaptersOf(h).some(c=>chaptersOf(halves.find(x=>x!==h)!).includes(c)),'halves split at a chapter boundary')
   assert.equal(foreshadows(await f.journal()).length,CHAPTERS)
  }finally{await f.dispose()}
 }
 // Every touch request fails: the step fails within the step-wide budget.
 const f=await fsFixture(base=>async r=>{if(isTouch(r))throw Error('模型返回结构不完整（touches）');return base(r)})
 try{await toForeshadow(f);const v=await f.settle();assert.equal(v.wizard!.stepState.foreshadow,'failed');const planned=touchRequests(f).filter((r,k,all)=>!all.slice(0,k).some(p=>p.units.some(u=>r.units.some(x=>x.id===u.id)))).length;assert.ok(touchRequests(f).length<=2*planned,`${touchRequests(f).length} > 2×${planned}`)}finally{await f.dispose()}
})

test('FP-05b: a single unit is re-run, succeeding on the third try and failing after three',async()=>{
 for(const [failures,state] of [[2,'done'],[3,'failed']] as const){
  // Only the batch holding chapter 0 fails while it has several units, so its halves reach a single unit.
  let seen=0;const f=await fsFixture(base=>{const inner=multiTouchesAi()(base);return async r=>{const zero=isTouch(r)&&quotedChapters(r).includes(0);if(zero&&r.units.length>1)throw Error('模型返回结构不完整（touches）');if(zero&&seen<failures){seen++;throw Error('模型返回结构不完整（touches）')}return inner(r)}})
  try{
   await toForeshadow(f);const v=await f.settle()
   const singles=touchRequests(f).filter(r=>r.units.length===1&&quotedChapters(r).includes(0)).length
   if(state==='done'){assert.equal(singles,3);assert.ok(v.wizard!.step==='verify'||v.wizard!.stepState.foreshadow==='done',v.wizard!.stepError)}
   else{assert.equal(v.wizard!.stepState.foreshadow,'failed');assert.equal(singles,3,'three tries, no fourth')}
  }finally{await f.dispose()}
 }
})

test('FP-06: a lasting failure stops new batches; batches in flight commit; a retry sends only the rest',async()=>{
 const f=await fsFixture(),g=gateTouches(f,f.handler())
 try{
  await toForeshadow(f);await until(()=>g.pending.size>0&&g.pending.size===touchRequests(f).length);await sleep(50)
  const list=[...g.pending.values()].map(p=>p.r),[a,b,...rest]=list
  // A splits; its halves wait on the gate. Then B fails for good.
  g.fail(a.operationId,Error('模型返回结构不完整（touches）'));await until(()=>touchRequests(f).length===list.length+1)
  const halves=touchRequests(f).slice(list.length);for(const h of halves)await until(()=>g.pending.has(h.operationId))
  g.fail(b.operationId,Error('模型配置或授权已变化，未采用返回结果'));g.releaseAll();const v=await f.settle()
  assert.equal(touchRequests(f).length,list.length+1,'the queued half and no other batch is sent after the lasting failure')
  const sentUnits=new Set(touchRequests(f).slice(list.length).flatMap(r=>r.units.map(u=>u.id)));assert.ok(a.units.some(u=>!sentUnits.has(u.id)),'the second half of A was never sent')
  assert.equal(v.wizard!.foreshadowFound,undefined,'no count on a failed step')
  assert.equal(v.wizard!.stepState.foreshadow,'failed');assert.equal(v.wizard!.stepError,'模型配置或授权已变化，未采用返回结果')
  const done=await covered(f);for(const r of rest)assert.ok(r.units.every(u=>done.has(u.id)),'in-flight batches committed');assert.ok(!b.units.some(u=>done.has(u.id)))
  const j=await f.journal();assert.ok(!(j.wizard!.touchStash??[]).some(e=>quotedChapters(b).some(i=>e.touch.quote===`合成渡口${i}旁`)))
  const before=touchRequests(f).length;await f.act('wizard-redetect');await toStep(f,'verify')
  for(const r of touchRequests(f).slice(before))assert.ok(r.units.every(u=>!done.has(u.id)),'retry sends only the rest')
  const fs=foreshadows(await f.journal());assert.equal(fs.length,CHAPTERS);for(const a of fs)assert.equal(JSON.parse(a.facts.touches!).length,1,'no duplicated touch')
 }finally{g.releaseAll();await f.dispose()}
 // A transport failure stops the step the same way.
 const h=await fsFixture(base=>{let thrown=false;const inner=multiTouchesAi()(base);return async r=>{if(isTouch(r)&&!thrown){thrown=true;throw Error('模型接口请求失败（HTTP 500）')}return inner(r)}})
 try{await toForeshadow(h);const v=await h.settle();assert.equal(v.wizard!.stepState.foreshadow,'failed');assert.match(v.wizard!.stepError!,/^模型接口请求失败/u)}finally{await h.dispose()}
})

test('FP-07: pausing waits for every request in flight; resuming asks only for uncovered units',async()=>{
 const f=await fsFixture(),g=gateTouches(f,f.handler())
 try{
  await toForeshadow(f);await until(()=>g.pending.size>0&&g.pending.size===touchRequests(f).length);await sleep(50)
  const list=[...g.pending.values()].map(p=>p.r),first=list.slice(0,5)
  for(const r of first){g.release(r.operationId);await until(async()=>(await covered(f)).has(r.units[0].id))}
  await f.act('pause');await f.settle();assert.equal(g.pending.size,0,'no request left in flight')
  const j=await f.journal();assert.notEqual(j.wizard!.stepState.foreshadow,'failed');assert.equal((await f.view()).wizard!.foreshadowFound,new Set(j.wizard!.touchStash!.map(e=>e.foreshadowKey)).size,'the count stays while paused');assert.ok(j.wizard!.touchStash!.length>=5)
  const kept=new Set(j.coverage.touches);assert.deepEqual([...kept].sort(),first.flatMap(r=>r.units.map(u=>u.id)).sort(),'cancelled batches wrote nothing')
  g.releaseAll();const before=touchRequests(f).length;await verifyAgain(f.controller);await toStep(f,'verify')
  const after=touchRequests(f).slice(before).flatMap(r=>r.units.map(u=>u.id));assert.ok(after.every(id=>!kept.has(id)));assert.deepEqual(new Set([...after,...kept]).size,j.workingUnits!.length)
  assert.equal(foreshadows(await f.journal()).length,CHAPTERS)
 }finally{g.releaseAll();await f.dispose()}
})

test('FP-08: requests skip the per-call check; sources are checked twice in the step, never at once; scopeHash is cached',async()=>{
 const f=await fsFixture()
 type Cache={resolve(s:ImportSession,g:unknown,compute:()=>string):string}
 const c=f.controller as unknown as {runtimeScopeCache:Cache;ai(s:ImportSession,e:number,r:ImportAiRequest,verified?:boolean):Promise<ImportAiResult>}
 const original=c.runtimeScopeCache.resolve.bind(c.runtimeScopeCache),ai=c.ai.bind(c);let resolves=0,computes=0,checks=0,checking=0,peak=0;const verified:boolean[]=[]
 const step=()=>(c as unknown as {session?:ImportSession}).session?.wizard?.step
 c.runtimeScopeCache.resolve=(s,g,compute)=>{if(step()==='foreshadow')resolves++;return original(s,g,()=>{if(step()==='foreshadow')computes++;return compute()})}
 c.ai=(s,e,r,v)=>{if(r.intent==='touches')verified.push(!!v);return ai(s,e,r,v)}
 f.options.verifySources=async()=>{if(step()!=='foreshadow')return;checks++;checking++;peak=Math.max(peak,checking);await sleep(20);checking--}
 try{
  await toForeshadow(f);const realNow=Date.now,frozen=realNow();Date.now=()=>frozen
  try{await toStep(f,'verify')}finally{Date.now=realNow}
  const n=touchRequests(f).length;assert.ok(n>1);assert.ok(verified.length===n&&verified.every(Boolean),'verified=true')
  assert.equal(checks,2,'once before the first batch and once before the plan');assert.equal(peak,1)
  assert.equal(resolves,n);assert.ok(computes<=1,String(computes))
 }finally{await f.dispose()}
 // A changed source before the first batch fails the step and applies no plan.
 const h=await fsFixture()
 try{
  await toForeshadow(h);await h.controller.pauseAll()
  h.options.verifySources=async()=>{throw Error('来源文件已变化，请重新扫描')}
  await verifyAgain(h.controller).catch(()=>undefined);const v=await h.settle();assert.equal(v.wizard!.stepState.foreshadow,'failed');assert.match(v.wizard!.stepError!,/^来源/u)
  assert.equal(foreshadows(await h.journal()).length,0)
 }finally{await h.dispose()}
})

test('FP-08b: at most one source check every 30 s while batches run',async()=>{
 const f=await fsFixture(),g=gateTouches(f,f.handler()),realNow=Date.now;let checks=0,shift=0
 const step=()=>(f.controller as unknown as {session?:ImportSession}).session?.wizard?.step
 f.options.verifySources=async()=>{if(step()==='foreshadow')checks++}
 try{
  await toForeshadow(f);Date.now=()=>realNow()+shift;await until(()=>g.pending.size>0&&g.pending.size===touchRequests(f).length);await sleep(50);assert.equal(checks,1)
  const list=[...g.pending.values()].map(p=>p.r),[a,b]=list
  // A splits within the 30 s window: its first half is sent without a new check.
  g.fail(a.operationId,Error('模型返回结构不完整（touches）'));await until(()=>touchRequests(f).length===list.length+1)
  assert.equal(checks,1,'halves sent within 30 s are not re-checked')
  shift=31000;g.fail(b.operationId,Error('模型返回结构不完整（touches）'));await until(()=>checks===2);await until(()=>touchRequests(f).length===list.length+2)
  assert.equal(checks,2,'one check once 30 s have passed')
 }finally{Date.now=realNow;g.releaseAll();await f.dispose()}
})

test('FP-09: summary and content are trimmed to well-formed text; long quotes are still refused',async()=>{
 const model:ImportModel={id:'text',name:'合成模型',modelId:'synthetic',endpoint:'https://model.invalid/v1',authRevision:1,contextWindow:1048576}
 const units=[{id:'u1',fileId:'f',start:0,end:12,text:'开篇只有风声与雨。',kind:'body' as const}]
 const request={semanticVersion:1,operationId:'22222222-2222-4222-8222-222222222222',phase:'analyze',intent:'touches',units,artifacts:[],entities:[],workingRevision:0,models:{text:model}} as ImportAiRequest
 const run=(raw:unknown)=>runImportAi(request,new AbortController().signal,{resolve:async()=>model,assert:async()=>{},generate:async()=>structuredClone(raw)} as ImportAiDependencies)
 const entry=(over:Record<string,unknown>={},touch:Record<string,unknown>={})=>({touches:[{foreshadowKey:'风',title:'风',content:'',...over,touch:{kind:'PLANT',chapterIndex:0,summary:'s',quote:'风声',...touch},evidence:{unitId:'u1',quote:'风声'}}]})
 const out=await run(entry({content:'说'.repeat(4100)},{summary:'甲'.repeat(199)+'𠀀'+'乙'.repeat(60)}))
 const t=out.touches![0] as {content:string;touch:{summary:string}};assert.equal(t.content.length,4000);assert.ok(t.touch.summary.length<=200&&t.touch.summary.isWellFormed());assert.equal(t.touch.summary,'甲'.repeat(199))
 assert.equal(trimWellFormed('甲'.repeat(198)+'𠀀乙',200),'甲'.repeat(198)+'𠀀');assert.equal(trimWellFormed('短',200),'短')
 await assert.rejects(run(entry({},{quote:'风'.repeat(201)})))
 // Only one generation: trimming is part of the schema, so no correction round is needed.
 let generations=0;await runImportAi(request,new AbortController().signal,{resolve:async()=>model,assert:async()=>{},generate:async()=>{generations++;return entry({content:'说'.repeat(4100)})}} as ImportAiDependencies);assert.equal(generations,1)
})

test('FP-10: the chapter of a touch follows its anchored evidence when the model index is wrong',async()=>{
 const lines:string[]=[],error=console.error,debug=process.env.SHAKEINK_IMPORT_DEBUG;let wrong=0
 const f=await fsFixture(base=>async r=>{if(!isTouch(r))return base(r);return {touches:quotedChapters(r).flatMap((i,k)=>{const quote=`合成渡口${i}旁`,u=r.units.find(u=>u.text.includes(quote));if(!u)return [];
  // Odd chapters: the batch-local index (inside the book); chapter 2: beyond the book; chapter 4: a quote that is not unique ("风声。").
  const chapterIndex=i===4?0:i===2?999:i%2?k:i,q=i===4?'风声。':quote;if(i!==4&&chapterIndex!==i)wrong++
  return [{foreshadowKey:'伏笔'+i,title:'伏笔'+i,content:'',touch:{kind:'PLANT' as const,chapterIndex,summary:'s',quote:q},evidence:{unitId:u.id,quote}}]})}})
 process.env.SHAKEINK_IMPORT_DEBUG='1';console.error=(...a:unknown[])=>{const s=String(a[0]);if(s.startsWith('touches-repairs'))lines.push(s)}
 try{
  await toForeshadow(f);await toStep(f,'verify')
  const fs=foreshadows(await f.journal()),byKey=new Map(fs.map(a=>[a.name,JSON.parse(a.facts.touches!)[0].chapterIndex]))
  for(let i=0;i<CHAPTERS;i++)if(i!==4)assert.equal(byKey.get('伏笔'+i),i,'伏笔'+i)
  assert.ok(!byKey.has('伏笔4'));const w=(await f.view()).wizard!;assert.ok(w.dropped.some(d=>d.kind==='touch'&&d.label.startsWith('伏笔4')&&d.reason==='原文引文无法唯一定位'))
  const fixed=lines.map(l=>JSON.parse(l.slice('touches-repairs '.length)).chapterFixed as number).reduce((a,b)=>a+b,0)
  assert.ok(wrong>1);assert.equal(fixed,wrong)
 }finally{console.error=error;if(debug===undefined)delete process.env.SHAKEINK_IMPORT_DEBUG;else process.env.SHAKEINK_IMPORT_DEBUG=debug;await f.dispose()}
})

test('FP-12b: chapter progress reaches the total once every unit is covered',async()=>{
 const f=await fsFixture(),g=gateTouches(f,f.handler())
 try{
  await toForeshadow(f);await until(()=>g.pending.size>0);const c=await injectJournalEdit(f,j=>{j.coverage.touches=j.workingUnits!.map(u=>u.id)})
  const v=(await c.act({type:'current'})).view!;assert.equal(v.wizard!.step,'foreshadow');assert.equal(v.wizard!.lineProgress!.done,v.wizard!.lineProgress!.total)
 }finally{g.releaseAll();await f.dispose()}
})

test('FP-13: the touches prompt states the parallel rules; roster and line prompts are unchanged',()=>{
 const units=[{id:'u1',fileId:'f',start:0,end:4,text:'合成文字',kind:'body' as const}]
 const base={semanticVersion:1,operationId:'op',phase:'analyze',units,artifacts:[],entities:[],workingRevision:0,models:{text:model}} as unknown as ImportAiRequest
 const touches=importAiPrompt({...base,intent:'touches'} as ImportAiRequest)
 for(const part of ['本次只分析全书的一段章节','相同的foreshadowKey','content不超过100字','只在第一条填写content','quote不超过60字'])assert.ok(touches.includes(part),part)
 for(const other of [importAiPrompt({...base,intent:'roster',kind:'character'} as ImportAiRequest),importAiPrompt({...base,kind:'worldline',executionLane:'wizard-lines-v1'} as ImportAiRequest)])for(const part of ['相同的foreshadowKey','content不超过100字'])assert.ok(!other.includes(part),part)
})

test('FP-14: stash order is optional and non-negative; entries without it sort first',()=>{
 const entry=(order?:number)=>({foreshadowKey:'钥匙',title:'钥匙',content:'',...(order===undefined?{}:{order}),touch:{kind:'PLANT',chapterIndex:0,summary:'',quote:'钥匙'}})
 const schema=importWizardStateSchema.shape.touchStash
 assert.ok(schema.safeParse([entry(0),entry(7),entry()]).success)
 for(const bad of [-1,1.5])assert.ok(!schema.safeParse([entry(bad)]).success,String(bad))
})

test('FP-14b: a mixed stash plans old entries first; the step-21 refresh keeps the foreshadows',async()=>{
 const f=await fsFixture()
 try{
  await toForeshadow(f);await f.settle();await f.controller.pauseAll()
  const c=f.controller as unknown as {session:ImportSession;applyForeshadowPlan(s:ImportSession):void;refreshForeshadowPlan(s:ImportSession):void}
  const s=structuredClone(c.session),quote='合成渡口1旁'
  s.wizard!.touchStash=[{foreshadowKey:'钥匙',title:'钥匙',content:'新说明',order:5,touch:{kind:'PLANT',chapterIndex:1,summary:'',quote}},{foreshadowKey:'钥匙',title:'钥匙',content:'旧说明',touch:{kind:'MENTION',chapterIndex:1,summary:'',quote}}]
  c.applyForeshadowPlan(s);const a=s.artifacts.find(a=>a.kind==='foreshadow'&&a.name==='钥匙')!;assert.equal(a.text,'旧说明')
  const before=foreshadows(s).length;c.refreshForeshadowPlan(s);assert.equal(foreshadows(s).length,before)
 }finally{await f.dispose()}
})
