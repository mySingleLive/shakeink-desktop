import assert from 'node:assert/strict'
import {test} from 'node:test'
import {mkdtemp,realpath,rm,stat} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {importGenerationModel,importAiResponseSchema,runImportAi,normalizeLinesReply,wizardLinesLaneRequest} from '../../desktop/service/novel-import-ai'
import {importAiPrompt} from '../../desktop/core/novel-import-ai-payload'
import {importHash} from '../../desktop/core/novel-import'
import {NovelImportController,wizardOutlinePlan,WIZARD_OUTLINE_MAX_CHAPTERS} from '../../desktop/main/novel-import'
import type {ImportAiRequest,ImportAiResult,ImportFile,ImportModel,ImportSession,ImportUnit} from '../../desktop/shared/novel-import'
import type {ResolvedModel} from '../../src/lib/ai/provider'
import {fixture,source,rosterAi,model,sleep,linesAi,worldsAi,toStep,outlineTargets,injectJournalEdit,verifyAgain,type Ai} from '../helpers/novel-import-wizard-fixture'

/* docs/532. Synthetic text and names only. */
const CHAPTERS=64
function body(){let t='';for(let i=0;i<CHAPTERS;i++)t+=`第${i+1}章 篇${i}\n\n沈砚在合成渡口${i}旁停步。${'风声。'.repeat(500)}\n\n`;return t}
const outlineRequest=(over:Partial<ImportAiRequest>={}):ImportAiRequest=>({semanticVersion:1,phase:'analyze',kind:'outline',units:[],artifacts:[],executionLane:'wizard-lines-v1',operationId:'op',models:{text:model},workingRevision:0,selectedTargets:['outline'],chapters:[],entities:[],...over}) as ImportAiRequest
const isOutline=(r:ImportAiRequest)=>r.phase==='analyze'&&!r.intent&&r.kind==='outline'
const parse=<T,>(text:string)=>JSON.parse(text) as T
const chapterOutlines=(j:ImportSession)=>j.artifacts.filter(a=>a.kind==='outline'&&a.facts.chapterIndex!==undefined)

async function outlineFixture(ai:(base:Ai)=>Ai=linesAi){
 const f=await fixture([source(body(),'正文.txt','f-body')],rosterAi());f.setAi(ai(worldsAi(f.handler())))
 return f
}
/** Through characters, worldline and narrative to step 19; outline requests may be gated by the caller. */
async function toOutline(f:Awaited<ReturnType<typeof fixture>>){
 await f.act('choose',{mode:'files'});await f.act('wizard-next');await f.act('set-title',{title:'合成细纲作品'});await f.act('choose-target');await f.act('wizard-next')
 await f.act('classify',{mode:'ai',consent:true});await f.settle()
 await f.act('select',{selected:['body'],targets:['character','worldline','narrative','outline'],infer:true});await f.act('wizard-next',{consent:true});await f.settle()
 assert.equal((await f.view()).wizard!.step,'tree');await f.act('wizard-next',{consent:true})
 for(let i=0;i<600;i++){const w=(await f.view()).wizard!;if(w.step==='outline')return;if(w.stepState[w.step]==='failed')throw Error('卡在 '+w.step+' '+(w.stepError??''));if(w.stepState[w.step]==='waiting'&&!f.controller.active)await f.act('wizard-next');else await sleep(10)}
 throw Error('未到达细纲步骤')
}
async function until(check:()=>boolean|Promise<boolean>,ms=8000){const end=Date.now()+ms;while(!await check()){if(Date.now()>end)throw Error('等待条件超时');await sleep(5)}}
/** Outline requests wait until released; counts the peak. */
function gate(f:Awaited<ReturnType<typeof fixture>>,inner:Ai){
 const pending=new Map<string,{resolve:()=>void;reject:(e:unknown)=>void;r:ImportAiRequest}>();let open=false,running=0,peak=0
 f.setAi(async r=>{if(!isOutline(r))return inner(r);running++;peak=Math.max(peak,running);try{if(!open)await new Promise<void>((resolve,reject)=>pending.set(r.operationId,{resolve,reject,r}));return await inner(r)}finally{pending.delete(r.operationId);running--}})
 f.options.cancelAi=async id=>{pending.get(id)?.reject(new DOMException('已取消','AbortError'))}
 return {pending,get peak(){return peak},releaseAll(){open=true;for(const p of pending.values())p.resolve()}}
}
/** Every request lists whole target chapters: each target's overlapping units are all present. */
function assertWholeTargets(j:ImportSession,requests:ImportAiRequest[]){
 for(const r of requests.filter(isOutline)){const targets=outlineTargets(r);assert.ok(targets?.length,'targets are listed');for(const i of targets!){const c=j.chapters[i],own=j.workingUnits!.filter(u=>u.start<c.end&&u.end>c.start);assert.ok(own.every(u=>r.units.some(x=>x.id===u.id)),'chapter '+i+' is whole')}}
}
function assertComplete(j:ImportSession){
 const list=chapterOutlines(j);assert.deepEqual(list.map(a=>Number(a.facts.chapterIndex)).sort((a,b)=>a-b),j.chapters.map((_,i)=>i),'one outline per chapter')
 for(const a of list)assert.equal(a.text,'第'+a.facts.chapterIndex+'章细纲','no text joined from two replies')
}
const crossing=(j:ImportSession)=>j.workingUnits!.some(u=>j.chapters.some(c=>u.start<c.start&&u.end>c.start))

test('OP-01: wizard outline analysis uses the lines lane with the light policy; other outline requests do not',async()=>{
 const resolved={model:{},modelRecord:{},providerOptions:{openai:{store:false}}} as unknown as ResolvedModel
 const deepseek={provider:'deepseek',protocol:'openai',modelId:'synthetic',thinkingLevels:['low','high'],defaultThinking:'high'}
 assert.equal(wizardLinesLaneRequest(outlineRequest()),true)
 assert.deepEqual(importGenerationModel(outlineRequest(),resolved,deepseek).providerOptions,{openai:{store:false},deepseek:{thinking:{type:'disabled'}}})
 for(const r of [outlineRequest({executionLane:undefined}),outlineRequest({phase:'review'}),outlineRequest({intent:'reconcile'})]){assert.equal(wizardLinesLaneRequest(r),false);assert.equal(importGenerationModel(r,resolved,deepseek),resolved)}
 const unit={id:'u',fileId:'f',kind:'body',start:0,end:4,text:'合成文字'} as ImportUnit
 await assert.rejects(runImportAi(outlineRequest({phase:'review',units:[unit]}),new AbortController().signal,{resolve:async()=>model,assert:async()=>{},generate:async()=>({conflicts:[]})}),/导入调度通道无效/u)
})

const plain=(n:number,size=(i:number)=>900+i*7)=>{const chapters:{id:string;title:string;start:number;end:number}[]=[];let at=0;for(let i=0;i<n;i++){const len=size(i);chapters.push({id:'chapter-'+(i+1),title:'章'+i,start:at,end:at+len});at+=len}return chapters}
/** Units of ≤1000 characters that ignore chapter boundaries, as coalesced working units do. */
function units(chapters:{start:number;end:number}[],width=700):ImportUnit[]{const end=chapters.at(-1)!.end,out:ImportUnit[]=[];for(let at=0;at<end;at+=width){const e=Math.min(end,at+width);out.push({id:'f:'+at+':'+e,fileId:'f',kind:'body',start:at,end:e,text:'字'.repeat(e-at)} as ImportUnit)}return out}
const size=(list:ImportUnit[])=>list.reduce((n,u)=>n+u.text.length,0)

test('OP-02: outline batches hold whole chapters, list their targets and respect both caps',()=>{
 const chapters=plain(64),all=units(chapters),budget={characters:81920,maxUnits:300},pending=chapters.map((_,i)=>i)
 assert.ok(all.some(u=>chapters.some(c=>u.start<c.start&&u.end>c.start)),'the fixture has units crossing chapter boundaries')
 const check=(plan:ReturnType<typeof wizardOutlinePlan>,want:number[])=>{
  assert.deepEqual(plan.flatMap(b=>b.targets).sort((a,b)=>a-b),want,'targets cover the pending chapters once')
  for(const b of plan){assert.ok(b.targets.length>=1&&b.targets.length<=WIZARD_OUTLINE_MAX_CHAPTERS)
   for(let k=1;k<b.targets.length;k++)assert.equal(b.targets[k],b.targets[k-1]+1,'targets are adjacent chapters of the book')
   const need=all.filter(u=>b.targets.some(i=>u.start<chapters[i].end&&u.end>chapters[i].start));assert.deepEqual(b.units.map(u=>u.id),need.map(u=>u.id),'units are exactly the targets\' overlapping units, ordered')}
 }
 const wide=wizardOutlinePlan(chapters,all,pending,budget,62);check(wide,pending);assert.ok(wide.length<=62)
 for(let k=1;k<wide.length;k++)assert.ok(size(wide[k-1].units)>=size(wide[k].units),'longest first')
 // (b) The chapter cap wins over the lane count.
 const narrow=wizardOutlinePlan(chapters,all,pending,budget,4);check(narrow,pending);assert.equal(narrow.length,Math.ceil(64/WIZARD_OUTLINE_MAX_CHAPTERS))
 // (c) Pending chapters that are not adjacent never share a batch.
 const gap=wizardOutlinePlan(chapters,all,[3,7],budget,1);check(gap,[3,7]);assert.equal(gap.length,2)
 // (d) A 200-character chapter inside one unit spanning its neighbours belongs to exactly one batch.
 const short=plain(6,i=>i===3?200:900),wideUnits=units(short,1000);assert.ok(wideUnits.some(u=>u.start<short[3].start&&u.end>short[3].end))
 const shortPlan=wizardOutlinePlan(short,wideUnits,[0,1,2,3,4,5],budget,6);assert.deepEqual(shortPlan.flatMap(b=>b.targets).sort(),[0,1,2,3,4,5])
 // (e) The largest batch is the smallest possible for the lane count (brute force over adjacent groupings).
 const small=plain(9,i=>300+((i*37)%5)*120),smallUnits=units(small,250)
 const cost=(groups:number[][])=>Math.max(...groups.map(g=>size(smallUnits.filter(u=>g.some(i=>u.start<small[i].end&&u.end>small[i].start)))))
 let best=Infinity;for(let mask=0;mask<1<<8;mask++){const groups:number[][]=[[0]];for(let i=1;i<9;i++)if(mask&(1<<(i-1)))groups.push([i]);else groups.at(-1)!.push(i);if(groups.length<=3&&groups.every(g=>g.length<=WIZARD_OUTLINE_MAX_CHAPTERS))best=Math.min(best,cost(groups))}
 const plan=wizardOutlinePlan(small,smallUnits,[0,1,2,3,4,5,6,7,8],budget,3);assert.ok(plan.length<=3);assert.equal(Math.max(...plan.map(b=>size(b.units))),best)
 // A chapter larger than the profile cannot be planned.
 assert.throws(()=>wizardOutlinePlan(chapters,all,[0],{characters:500,maxUnits:300},1),/超过模型预算/u)
})

test('OP-04/OP-12b/OP-10: outlines run in parallel on the lane, one per chapter, and pass step 21',async()=>{
 const f=await outlineFixture(),p=gate(f,f.handler())
 try{
  await toOutline(f);let j=await f.journal();assert.ok(crossing(j),'units cross chapter boundaries')
  await until(()=>p.pending.size>=8);await sleep(30)
  assert.ok(p.pending.size>1&&p.pending.size<=31,String(p.pending.size));assert.ok([...p.pending.values()].every(e=>e.r.executionLane==='wizard-lines-v1'))
  const sample=[...p.pending.values()][0].r
  assert.ok(sample.artifacts.every(a=>a.kind!=='outline'),'other outlines are not context');assert.ok(sample.entities!.every(e=>!['worldline','narrative','outline'].includes(e.kind)),'entities hold no events, narratives or outlines');assert.ok(sample.entities!.some(e=>e.kind==='character'))
  p.releaseAll();const v=await toStep(f,'verify').catch(async()=>f.settle());j=await f.journal()
  assert.equal(v.wizard!.stepState.outline,'done',v.wizard!.stepError);assert.ok(p.peak>1)
  assertComplete(j);assertWholeTargets(j,f.requests)
  for(const a of chapterOutlines(j)){const i=Number(a.facts.chapterIndex),c=j.chapters[i];assert.equal(a.id,'ol-'+importHash(['outline',c.id]).slice(0,16));assert.equal(a.name,c.title+'（第'+(i+1)+'章细纲）')}
  const kinds=f.requests.filter(r=>r.phase==='analyze'&&!r.intent).map(r=>r.kind);assert.ok(kinds.lastIndexOf('narrative')<kinds.indexOf('outline'))
  assert.deepEqual([...j.coverage.outline].sort(),j.workingUnits!.map(u=>u.id).sort())
  const verify=await toStep(f,'verify');assert.equal(verify.wizard!.checks?.find(c=>c.key==='outlines')?.detail,'64 / 64 章')
  assert.ok(verify.wizard!.checks?.find(c=>c.key==='outlines')?.ok)
 }finally{p.releaseAll();await f.dispose()}
})

test('OP-05: chapter index shape fixes on lane outline replies',()=>{
 const text='甲章尾句。第二章 乙\n乙章开头的一句话。',unit={id:'u1',fileId:'f',kind:'body',start:100,end:100+text.length,text} as ImportUnit,second=100+text.indexOf('第二章')
 const chapters=[{id:'chapter-1',title:'甲',start:0,end:second},{id:'chapter-2',title:'乙',start:second,end:300}]
 const request=outlineRequest({units:[unit],chapters})
 const item=(facts:Record<string,unknown>,quote='乙章开头的一句话')=>({id:'o',kind:'outline',name:'细纲',text:'本章概括。',facts:{...facts},evidence:[{unitId:'u1',quote}],sourceUnitIds:['u1'],origin:'inferred'})
 const fix=(facts:Record<string,unknown>,quote?:string)=>{const out=normalizeLinesReply(request,JSON.stringify({artifacts:[item(facts,quote)]}),parse);return out?JSON.parse(out.text).artifacts[0].facts.chapterIndex:'(unchanged)'}
 assert.equal(fix({chapterIndex:1}),'1','a number becomes its decimal string')
 assert.equal(fix({chapterIndex:'1'}),'(unchanged)','a decimal string is kept');assert.equal(normalizeLinesReply(request,JSON.stringify({artifacts:[item({chapterIndex:'1'})]}),parse),undefined)
 assert.equal(fix({}),'1','a missing index comes from the quote position, not the unit start')
 assert.equal(fix({},'甲章尾句'),'0')
 assert.equal(fix({},'模型虚构的引文'),'(unchanged)','an unlocatable quote leaves it missing')
 for(const v of [-1,1.5,'x','','05'])assert.equal(fix({chapterIndex:v}),'(unchanged)',JSON.stringify(v))
 const out=normalizeLinesReply(request,JSON.stringify({artifacts:[item({chapterIndex:1})]}),parse)!;const a=JSON.parse(out.text).artifacts[0]
 assert.equal(a.text,'本章概括。');assert.equal(a.name,'细纲');assert.equal(out.counts,undefined,'shape fixes are not counted')
})

test('OP-05b: droppedEntries joins the lines repair schema',async()=>{
 const unit={id:'u',fileId:'f',kind:'body',start:0,end:4,text:'合成文字'} as ImportUnit
 const deps=(extra:object)=>({resolve:async()=>model,assert:async()=>{},generate:async()=>({notFound:true,...extra})})
 assert.deepEqual(await runImportAi(outlineRequest({units:[unit]}),new AbortController().signal,deps({linesRepairs:{droppedEvidence:0,droppedLinks:0,droppedEntries:1}})),{notFound:true,linesRepairs:{droppedEvidence:0,droppedLinks:0,droppedEntries:1}})
 for(const bad of [{droppedEvidence:0,droppedLinks:0,droppedEntries:0},{droppedEvidence:0,droppedLinks:0,droppedEntries:-1}])await assert.rejects(runImportAi(outlineRequest({units:[unit]}),new AbortController().signal,deps({linesRepairs:bad})),/结构或类别无效/u)
})

test('OP-03/OP-12: outlines for chapters outside the batch are dropped and counted; the step completes',async()=>{
 const f=await outlineFixture(base=>{const inner=linesAi(base);return async r=>{const out=await inner(r);if(!isOutline(r)||!out.artifacts?.length)return out;const t=outlineTargets(r)!,extra=t.at(-1)!+1;if(extra>=r.chapters!.length)return out;const a=out.artifacts[0];return {artifacts:[...out.artifacts,{...a,id:'stray',name:'越界'+extra,text:'越界细纲',facts:{chapterIndex:String(extra)}}]}}})
 try{
  await toOutline(f);const v=await toStep(f,'verify').catch(async()=>f.settle()),j=await f.journal()
  assert.equal(v.wizard!.stepState.outline,'done',v.wizard!.stepError);assertComplete(j)
  const n=j.wizard!.lineRepairs?.outline?.droppedEntries??0;assert.ok(n>0,'stray outlines are counted')
  assert.ok(j.wizard!.dropped.some(d=>d.kind==='lines'&&d.label==='细纲'&&d.reason.includes(`丢弃 ${n} 个不属于本批章节的细纲`)),JSON.stringify(j.wizard!.dropped))
 }finally{await f.dispose()}
})

test('OP-06: an incomplete batch is refused whole and redone; the step still ends with one outline per chapter',async()=>{
 const failures=new Map<string,number>()
 const f=await outlineFixture(base=>{const inner=linesAi(base);return async r=>{const out=await inner(r);if(!isOutline(r))return out
  const key=outlineTargets(r)!.join(','),n=failures.get(key)??0;if(n>0||failures.size>=4)return out;failures.set(key,1)
  // Four batches fail once each, in four different ways.
  const kind=failures.size;if(kind===1)return {artifacts:out.artifacts!.slice(1),...(out.artifacts!.length===1?{notFound:true}:{})}
  if(kind===2)return {notFound:true};if(kind===3)return {artifacts:[...out.artifacts!,{...out.artifacts![0],id:'twice'}]}
  return {artifacts:out.artifacts!.map(a=>({...a,facts:{}}))}}})
 try{
  await toOutline(f);const v=await toStep(f,'verify').catch(async()=>f.settle()),j=await f.journal()
  assert.equal(v.wizard!.stepState.outline,'done',v.wizard!.stepError);assert.equal(failures.size,4);assertComplete(j);assertWholeTargets(j,f.requests)
 }finally{await f.dispose()}
})

test('OP-06b: a merge failure inside the checkpoint leaves the batch unwritten; source chapter outlines are not requested again',async()=>{
 let bad:number|undefined
 const f=await outlineFixture(base=>{const inner=linesAi(base);return async r=>{const out=await inner(r);if(!isOutline(r))return out;const t=outlineTargets(r)!;bad??=t[0]
  // A parent that exists nowhere passes the per-artifact checks but fails importNativeMappings inside the checkpoint.
  if(t.includes(bad))return {artifacts:out.artifacts!.map(a=>({...a,facts:{...a.facts,parentId:'missing'}}))};return out}})
 try{
  await toOutline(f);const v=await f.settle(),j=await f.journal()
  assert.equal(v.wizard!.stepState.outline,'failed');assert.ok(!chapterOutlines(j).some(a=>Number(a.facts.chapterIndex)===bad),'the failed batch wrote nothing');assert.ok(chapterOutlines(j).length>0,'other batches are kept')
  const c=j.chapters[bad!],covered=new Set(j.coverage.outline??[]);assert.ok(j.workingUnits!.filter(u=>u.start>=c.start&&u.end<=c.end).every(u=>!covered.has(u.id)))
 }finally{await f.dispose()}
})

test('OP-07: a multi-chapter batch is halved by chapters; a single chapter is re-run whole once; finish length counts as rerunnable',async()=>{
 let first:ImportAiRequest|undefined,single:ImportAiRequest|undefined
 const f=await outlineFixture(base=>{const inner=linesAi(base);return async r=>{if(isOutline(r)){const t=outlineTargets(r)!
   if(!first&&t.length>1){first=r;throw Error('模型输出未完整结束（length）')}
   if(first&&!single&&t.length===1){single=r;throw Error('模型返回结构不完整（chapterIndex）')}}
  return inner(r)}})
 try{
  await toOutline(f);const v=await toStep(f,'verify').catch(async()=>f.settle()),j=await f.journal()
  assert.equal(v.wizard!.stepState.outline,'done',v.wizard!.stepError);assertComplete(j);assertWholeTargets(j,f.requests)
  const ft=outlineTargets(first!)!,after=f.requests.slice(f.requests.findIndex(r=>r.operationId===first!.operationId)+1).filter(r=>isOutline(r)&&outlineTargets(r)!.some(i=>ft.includes(i)))
  assert.deepEqual(after.slice(0,2).flatMap(r=>outlineTargets(r)!).sort((a,b)=>a-b),[...ft].sort((a,b)=>a-b),'two halves by chapters');assert.ok(after.every(r=>outlineTargets(r)!.length<ft.length))
  assert.ok(single,'a single-chapter batch was seen');{const st=outlineTargets(single!)!,again=f.requests.slice(f.requests.findIndex(r=>r.operationId===single!.operationId)+1).filter(r=>isOutline(r)&&outlineTargets(r)!.includes(st[0]));assert.equal(again.length,1,'re-run once');assert.deepEqual(again[0].units.map(u=>u.id),single!.units.map(u=>u.id),'the re-run keeps the whole chapter')}
 }finally{await f.dispose()}
})

test('OP-07b: a single chapter failing every time fails the step without cutting the chapter',async()=>{
 let target:number|undefined
 const f=await outlineFixture(base=>{const inner=linesAi(base);return async r=>{if(isOutline(r)){const t=outlineTargets(r)!;target??=t[0];if(t.includes(target))throw Error('模型返回结构不完整（chapterIndex）')}return inner(r)}})
 try{
  await toOutline(f);const v=await f.settle(),j=await f.journal()
  assert.equal(v.wizard!.stepState.outline,'failed');assertWholeTargets(j,f.requests)
 }finally{await f.dispose()}
})

async function slowOutline(winner:'halves'|'original'|'fallback'){
 let slow:ImportAiRequest|undefined,cancelled=0,halvesOut=0,originalDone=false
 const targets=(r:ImportAiRequest)=>outlineTargets(r)??[]
 const isHalf=(r:ImportAiRequest)=>!!slow&&r.operationId!==slow.operationId&&targets(r).length<targets(slow).length&&targets(r).every(i=>targets(slow!).includes(i))
 const f=await outlineFixture(base=>{const inner=linesAi(base);return async r=>{
  if(isOutline(r)&&!slow&&targets(r).length>1){slow=r
   await new Promise<void>((resolve,reject)=>{const tick=setInterval(()=>{if(winner!=='halves'&&halvesOut===2){clearInterval(tick);setTimeout(resolve,winner==='fallback'?200:0)}},5);setTimeout(()=>{clearInterval(tick);reject(Error('fixture: slow batch was never released'))},20000);(f.options as {cancelAi:(id:string)=>Promise<void>}).cancelAi=async id=>{if(id===r.operationId){cancelled++;clearInterval(tick);reject(new DOMException('已取消','AbortError'))}}})
   const out=await inner(r);originalDone=true;return out}
  if(isOutline(r)&&isHalf(r)){halvesOut++;if(winner==='original'){const end=Date.now()+3000;while(Date.now()<end&&!(originalDone&&chapterOutlines(await f.journal()).some(a=>Number(a.facts.chapterIndex)===targets(slow!)[0])))await sleep(10)}}
  if(isOutline(r)&&isHalf(r)&&winner==='fallback')throw Error('模型接口请求失败（HTTP 500）')
  return inner(r)}})
 return {f,get slow(){return slow},get cancelled(){return cancelled},isHalf}
}
for(const [name,winner] of [['OP-08: a slow outline batch sends its chapter halves and the halves are adopted','halves'],['OP-08b: the slow original returns first and its halves add nothing','original'],['OP-08c: both halves fail and the original is adopted','fallback']] as const)
 test(name,async()=>{
  process.env.SHAKEINK_LINES_EARLY_MS='100'
  const x=await slowOutline(winner)
  try{
   await toOutline(x.f);const v=await toStep(x.f,'verify').catch(async()=>x.f.settle()),j=await x.f.journal()
   assert.equal(v.wizard!.stepState.outline,'done',v.wizard!.stepError);assert.ok(x.slow,'a slow batch was seen')
   assert.equal(x.f.requests.filter(r=>isOutline(r)&&x.isHalf(r)).length,2,'two halves were sent');assertComplete(j)
   if(winner==='halves')assert.equal(x.cancelled,1,'the losing slow request is cancelled')
  }finally{delete process.env.SHAKEINK_LINES_EARLY_MS;await x.f.dispose()}
 })

test('OP-09/OP-09b: a retry asks only for chapters still without an outline, whatever the unit coverage says',async()=>{
 let bad:number|undefined,healed=false
 const f=await outlineFixture(base=>{const inner=linesAi(base);return async r=>{if(isOutline(r)){const t=outlineTargets(r)!;bad??=t[0];if(!healed&&t.includes(bad))throw Error('模型接口请求失败（HTTP 500）')}return inner(r)}})
 try{
  await toOutline(f);let v=await f.settle();assert.equal(v.wizard!.stepState.outline,'failed')
  let j=await f.journal();const have=new Set(chapterOutlines(j).map(a=>Number(a.facts.chapterIndex)))
  let before=f.requests.length;healed=true;await f.act('wizard-redetect');v=await toStep(f,'verify').catch(async()=>f.settle())
  const resent=f.requests.slice(before).filter(isOutline);assert.ok(resent.length>0);assert.ok(resent.every(r=>outlineTargets(r)!.every(i=>!have.has(i))),'no chapter that has an outline is asked again')
  j=await f.journal();assertComplete(j)
  // 09b: full unit coverage but chapter k without an outline still asks for k only.
  const k=5
  const c=await injectJournalEdit(f,j=>{j.coverage.outline=j.workingUnits!.map(u=>u.id);j.artifacts=j.artifacts.filter(a=>!(a.kind==='outline'&&a.facts.chapterIndex===String(k)));j.wizard!.step='outline';j.wizard!.stepState.outline='running';j.wizard!.stepState.verify='pending';j.phase='paused';j.resumePhase='running'})
  before=f.requests.length;await verifyAgain(c);await f.settle()
  const again=f.requests.slice(before).filter(isOutline);assert.deepEqual(again.map(r=>outlineTargets(r)),[[k]])
  assertComplete(await f.journal())
 }finally{await f.dispose()}
})

test('OP-11: the lane prompt states the target rule; a re-run instruction keeps the targets and adds the hint',async()=>{
 const unit={id:'u',fileId:'f',kind:'body',start:0,end:4,text:'合成文字'} as ImportUnit
 const lane=importAiPrompt(outlineRequest({units:[unit],instruction:'本批目标章：[{"index":0,"title":"甲"}]'})),plainPrompt=importAiPrompt(outlineRequest({units:[unit],executionLane:undefined}))
 for(const rule of [/每个目标章恰好返回一个章级细纲/u,/不返回卷级大纲/u,/不能返回notFound/u])assert.match(lane,rule),assert.doesNotMatch(plainPrompt,rule)
 let anchored:ImportAiRequest|undefined,firstTarget:string|undefined
 const f=await outlineFixture(base=>{const inner=linesAi(base);return async r=>{if(isOutline(r)){const t=outlineTargets(r)!.join(',');firstTarget??=t;if(t===firstTarget&&!r.instruction!.includes('上一次引文未通过定位校验'))throw Error('模型证据无法定位（no-match）');if(t===firstTarget)anchored??=r}return inner(r)}})
 try{
  await toOutline(f);const v=await toStep(f,'verify').catch(async()=>f.settle())
  assert.equal(v.wizard!.stepState.outline,'done',v.wizard!.stepError)
  if(anchored){assert.match(anchored.instruction!,/^本批目标章：/u);assert.match(anchored.instruction!,/上一次引文未通过定位校验/u)}
  else assert.ok(f.requests.filter(isOutline).some(r=>r.instruction!.startsWith('本批目标章：')&&r.instruction!.includes('上一次引文未通过定位校验')),'a hinted request still names its targets')
 }finally{await f.dispose()}
})

test('OP-13: pausing waits for every in-flight outline request; resuming asks only for missing chapters',async()=>{
 const f=await outlineFixture(),p=gate(f,f.handler())
 try{
  await toOutline(f);await until(()=>p.pending.size>=4);await f.act('pause');await f.settle();assert.equal(p.pending.size,0,'no request left in flight')
  const j=await f.journal();assert.notEqual(j.wizard!.stepState.outline,'failed')
  p.releaseAll();const before=f.requests.length;await verifyAgain(f.controller);await toStep(f,'verify').catch(async()=>f.settle())
  const have=new Set(chapterOutlines(j).map(a=>Number(a.facts.chapterIndex)));assert.ok(f.requests.slice(before).filter(isOutline).every(r=>outlineTargets(r)!.every(i=>!have.has(i))))
  assertComplete(await f.journal())
 }finally{p.releaseAll();await f.dispose()}
})

test('OP-14: outline analysis outside the wizard stays serial and carries no lane',async()=>{
 const text=Array.from({length:6},(_,i)=>`第${i+1}章\n`+'甲'.repeat(3000)).join('\n'),file:ImportFile={id:'f',name:'正文.txt',path:'/private/tmp/synthetic-sources/f',format:'txt',bytes:Buffer.byteLength(text),hash:importHash(text),text,included:true}
 const small:ImportModel={...model,contextWindow:16000}
 const root=await realpath(await mkdtemp(join(tmpdir(),'novel-engine-'))),target=await realpath(await mkdtemp(join(tmpdir(),'novel-target-'))),st=await stat(target,{bigint:true})
 let running=0,peak=0;const seen:ImportAiRequest[]=[]
 const ai=async(r:ImportAiRequest):Promise<ImportAiResult>=>{if(r.phase==='review')return {conflicts:[]};if(r.phase!=='analyze')return {}
  if(r.kind!=='outline')return {notFound:true}
  seen.push(r);running++;peak=Math.max(peak,running);await sleep(5);running--
  const indices=r.chapters!.map((c,i)=>r.units.some(u=>u.start<c.end&&u.end>c.start)?i:-1).filter(i=>i>=0),u=r.units[0]
  return {artifacts:indices.map(i=>({id:'detailed-'+i,kind:'outline' as const,name:'章级细纲'+i,text:'章级细纲'+i,facts:{chapterIndex:String(i)},origin:'inferred' as const,sourceUnitIds:[u.id],evidence:[{unitId:u.id,quote:u.text.slice(0,6)}]}))}}
 const controller=new NovelImportController({root,choose:async()=>['/private/tmp/synthetic-sources'],chooseTarget:async()=>({path:target,device:String(st.dev),inode:String(st.ino)}),protectedDirectories:async()=>[],models:async()=>({text:small,review:{...small,id:'review'}}),scan:async()=>[structuredClone(file)],verifySources:async()=>{},redecode:async(x:ImportFile)=>({...x,requiresEncodingConfirmation:false}),ai,cancelAi:async()=>{},publish:async(input:{session:ImportSession;importHash:string})=>({requestId:input.session.publication!.requestId,workId:'work',novelId:'novel',importHash:input.importHash})} as unknown as ConstructorParameters<typeof NovelImportController>[0])
 await controller.initialize()
 const act=async(type:string,extra:Record<string,unknown>={})=>{const v=(await controller.act({type:'current'})).view;return controller.act({type,...(type==='choose'?{}:{id:v!.id,revision:v!.revision}),...extra})}
 const settle=async()=>{for(let i=0;i<3000&&controller.active;i++)await sleep(10);return (await controller.act({type:'current'})).view!}
 try{
  await act('choose',{mode:'files'});await act('classify',{mode:'local',consent:false});await act('select',{selected:['body'],targets:['outline'],infer:true});await act('choose-target');await act('set-title',{title:'合成小说'});await act('start',{consent:true});await settle()
  assert.ok(seen.length>0);assert.equal(peak,1);assert.ok(seen.every(r=>r.executionLane===undefined))
 }finally{await controller.close();await rm(root,{recursive:true,force:true});await rm(target,{recursive:true,force:true})}
})

test('OP-16: a lane outline with an unsupported fact key is refused by the reply schema with field guidance; plain outlines keep the old shape',()=>{
 const unit={id:'u',fileId:'f',kind:'body',start:0,end:8,text:'合成文字一二三四'} as ImportUnit,chapters=[{id:'chapter-1',title:'甲',start:0,end:8}]
 const reply=(facts:Record<string,string>)=>({artifacts:[{id:'o',kind:'outline',name:'细纲',text:'本章概括。',facts,evidence:[{unitId:'u',quote:'合成文字'}],sourceUnitIds:['u'],origin:'inferred'}]})
 const lane=importAiResponseSchema(outlineRequest({units:[unit],chapters}) as never)
 const bad=lane.safeParse(reply({chapterIndex:'0',summary:'额外字段'}));assert.equal(bad.success,false)
 assert.ok(!bad.success&&bad.error.issues.some(i=>i.message.includes('章级细纲facts只允许chapterIndex')),'the correction names the allowed fields')
 assert.equal(lane.safeParse(reply({chapterIndex:'0',reliability:'客观事实'})).success,true)
 // Outside the lane the reply schema is unchanged (the strict check stays where it was, after acceptance).
 assert.equal(importAiResponseSchema(outlineRequest({units:[unit],chapters,executionLane:undefined}) as never).safeParse(reply({chapterIndex:'0',summary:'额外字段'})).success,true)
})

test('533: notFound with a complete reply, a chapter without units and stray droppedEntries are refused',async()=>{
 const chapters=plain(3),all=units(chapters).filter(u=>!(u.start<chapters[1].end&&u.end>chapters[1].start))
 assert.throws(()=>wizardOutlinePlan(chapters,all,[0,1,2],{characters:81920,maxUnits:300},3),/第2章没有可分析的正文/u)
 const unit={id:'u',fileId:'f',kind:'body',start:0,end:4,text:'合成文字'} as ImportUnit
 const deps=(extra:object)=>({resolve:async()=>model,assert:async()=>{},generate:async()=>({notFound:true,...extra})})
 const line={...outlineRequest({units:[unit]}),kind:'worldline' as const,selectedTargets:['worldline' as const]}
 await assert.rejects(runImportAi(line as ImportAiRequest,new AbortController().signal,deps({linesRepairs:{droppedEvidence:1,droppedLinks:0,droppedEntries:1}})),/结构或类别无效/u,'droppedEntries belongs to outlines only')
 let first:string|undefined
 const f=await outlineFixture(base=>{const inner=linesAi(base);return async r=>{const out=await inner(r);if(!isOutline(r))return out;const k=outlineTargets(r)!.join(',');first??=k;return k===first&&!r.instruction!.includes('\n')&&f.requests.filter(x=>isOutline(x)&&outlineTargets(x)!.join(',')===k).length===1?{...out,notFound:true}:out}})
 try{
  await toOutline(f);const v=await toStep(f,'verify').catch(async()=>f.settle());assert.equal(v.wizard!.stepState.outline,'done',v.wizard!.stepError);assertComplete(await f.journal())
  assert.ok(f.requests.filter(isOutline).filter(r=>outlineTargets(r)!.some(i=>first!.split(',').map(Number).includes(i))).length>1,'the batch with notFound was redone')
 }finally{await f.dispose()}
})

test('533 中1: a half whose re-run fails at depth 2 waits for its slow original, which is adopted',async()=>{
 process.env.SHAKEINK_LINES_EARLY_MS='100'
 // 320 short chapters give about five chapters per batch, so a depth-2 part still holds two chapters.
 let text='';for(let i=0;i<320;i++)text+=`第${i+1}章 短${i}\n\n沈砚在合成渡口${i}旁停步。${'风声。'.repeat(60)}\n\n`
 let slow:ImportAiRequest|undefined,released=false,timer:ReturnType<typeof setTimeout>|undefined
 const t=(r:ImportAiRequest)=>outlineTargets(r)??[]
 const f=await fixture([source(text,'正文.txt','f-body')],rosterAi());const base=worldsAi(f.handler()),inner=linesAi(base)
 f.setAi(async r=>{
  if(isOutline(r)&&!slow&&t(r).length>=5&&f.requests.filter(isOutline).length>40){slow=r;const end=Date.now()+20000;while(!released&&Date.now()<end)await sleep(10);return inner(r)}
  // Every part of the slow batch's halves fails, down to the depth-2 re-runs; the original is released two seconds later.
  if(isOutline(r)&&slow&&r.operationId!==slow.operationId&&t(r).every(i=>t(slow!).includes(i))){timer??=setTimeout(()=>{released=true},2000);throw Error('模型返回结构不完整（chapterIndex）')}
  return inner(r)})
 try{
  await toOutline(f);const v=await toStep(f,'verify').catch(async()=>f.settle())
  assert.ok(slow,'a slow batch with five or more chapters was seen')
  const parts=f.requests.filter(r=>isOutline(r)&&r.operationId!==slow!.operationId&&t(r).every(i=>t(slow!).includes(i)));assert.ok(parts.some(r=>t(r).length>=2&&parts.filter(x=>t(x).join()===t(r).join()).length===2),'a multi-chapter part was re-run')
  assert.equal(v.wizard!.stepState.outline,'done',v.wizard!.stepError)
  const j=await f.journal(),list=chapterOutlines(j);assert.equal(list.length,j.chapters.length);assert.equal(new Set(list.map(a=>a.facts.chapterIndex)).size,j.chapters.length)
 }finally{clearTimeout(timer);delete process.env.SHAKEINK_LINES_EARLY_MS;await f.dispose()}
})
