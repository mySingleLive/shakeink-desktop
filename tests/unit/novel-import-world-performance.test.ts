import assert from 'node:assert/strict'
import {test} from 'node:test'
import {importGenerationModel,runImportGenerationLane} from '../../desktop/service/novel-import-ai'
import {acquireLongTask,longTaskQueue} from '../../src/lib/long-task'
import type {ImportAiRequest} from '../../desktop/shared/novel-import'
import type {ResolvedModel} from '../../src/lib/ai/provider'
import {fixture,source,rosterAi,entityResult,entityName,sleep} from '../helpers/novel-import-wizard-fixture'

/* docs/507. Synthetic names only. One unnamed main world with 64 settings, each named in its own chapter.
 * One roster entry per unit: the service caps an entry at 50 settings, so the fixture does too. */
const names=Array.from({length:64},(_,i)=>'合成设定'+String(i).padStart(2,'0'))
type Fixture=Awaited<ReturnType<typeof fixture>>
async function worldFixture(targets=['world']){
 const body=names.map((n,i)=>`第${i+1}章 篇${i}\n\n众人谈起${n}。${'风声。'.repeat(160)}\n\n`).join('')
 const f=await fixture([source(body,'正文.txt','f-body')],rosterAi({'roster:world':r=>({roster:r.units.flatMap(u=>{const own=names.filter(n=>u.text.includes(n));return own.length?[{name:'主世界',aliases:[],settings:own.map(name=>({settingType:(names.indexOf(name)%2?'SOCIETY':'CULTURE') as 'SOCIETY'|'CULTURE',name})),evidence:{unitId:u.id,quote:own[0]}}]:[]})})}),{promptLayout:'legacy'})
 return {f,targets}
}
async function toWorldImport({f,targets}:{f:Fixture;targets:string[]}){
 await f.act('choose',{mode:'files'});await f.act('wizard-next');await f.act('set-title',{title:'合成世界作品'});await f.act('choose-target');await f.act('wizard-next')
 await f.act('classify',{mode:'ai',consent:true});await f.settle();await f.act('select',{selected:['body'],targets,infer:true});await f.act('wizard-next',{consent:true});await f.settle()
 await f.act('wizard-next',{consent:true});let v=await f.settle();for(let i=0;i<200&&v.wizard!.stepState['detect-world']==='running';i++){await sleep(20);v=await f.view()}
 assert.equal(v.wizard!.step,'detect-world',v.wizard!.stepError);assert.equal(v.wizard!.stepState['detect-world'],'waiting',v.wizard!.stepError);await f.act('wizard-next')
}
async function until(check:()=>boolean|Promise<boolean>){const end=Date.now()+8000;while(!await check()){if(Date.now()>end)break;await sleep(5)}}
const catalogOf=(r:ImportAiRequest)=>{const line=r.instruction!.split('\n')[0];return JSON.parse(line.slice(line.indexOf('['))) as {id:string;name:string}[]}
/** Entity and other-setting calls wait until released; the peak counts both together. */
function gated(f:Fixture){
 const base=f.handler(),pending=new Map<string,{resolve:()=>void;reject:()=>void;r:ImportAiRequest}>(),order:string[]=[];let open=false,running=0,peak=0,settingsPeak=0,settingsRunning=0
 f.setAi(async r=>{
  const entity=r.intent==='entity',settings=r.phase==='analyze'&&!r.intent&&['theme','style','goldenFinger','trope'].includes(r.kind!)
  if(!entity&&!settings)return base(r)
  running++;peak=Math.max(peak,running);if(settings){settingsRunning++;settingsPeak=Math.max(settingsPeak,settingsRunning)}
  if(entity&&r.kind==='world')order.push(entityName(r))
  try{if(!open)await new Promise<void>((resolve,reject)=>pending.set(r.operationId,{resolve,reject:()=>reject(new DOMException('已取消','AbortError')),r}));if(settings)return {notFound:true};return entityResult(r)}finally{pending.delete(r.operationId);running--;if(settings)settingsRunning--}
 })
 f.options.cancelAi=async id=>{pending.get(id)?.reject()}
 return {pending,order,get peak(){return peak},get settingsPeak(){return settingsPeak},release(n=Infinity){let k=0;for(const p of [...pending.values()]){if(k++>=n)break;p.resolve()}},releaseAll(){open=true;for(const p of pending.values())p.resolve()}}
}

test('WP-01/WP-02: settings start with the main world and reach 31 in flight; every selected item is imported',async()=>{
 const x=await worldFixture(),{f}=x,p=gated(f)
 try{
  await toWorldImport(x);await until(()=>p.pending.size===31);await sleep(50);assert.equal(p.pending.size,31)
  const first=[...p.pending.values()].map(e=>entityName(e.r));assert.ok(first.includes('主世界'),'the main world is in the first wave');assert.ok(first.some(n=>names.includes(n)),'settings do not wait for their world')
  p.releaseAll();const v=await f.settle(),s=await f.journal();assert.equal(p.peak,31)
  assert.notEqual(v.wizard!.step,'import-world',v.wizard!.stepError);const selected=s.wizard!.candidates.world!.filter(c=>c.selected).map(c=>c.id).sort()
  assert.deepEqual(s.artifacts.filter(a=>a.kind==='world').map(a=>a.id).sort(),selected);assert.ok(s.wizard!.tasks.every(t=>t.state==='done'))
 }finally{p.releaseAll();await f.dispose()}
})
test('WP-04: other-setting batches run in parallel and share the 31 lanes with world entities',async()=>{
 const x=await worldFixture(['world','theme','style','goldenFinger','trope']),{f}=x,p=gated(f)
 try{
  await toWorldImport(x);await until(()=>p.pending.size>=2);await sleep(50)
  assert.ok(p.settingsPeak>1,'settings batches in parallel: '+p.settingsPeak);assert.ok(p.pending.size<=31)
  p.release(1);await until(()=>p.pending.size===31);await sleep(50);assert.ok(p.peak<=31,String(p.peak))
  p.releaseAll();const v=await f.settle();assert.notEqual(v.wizard!.step,'import-world',v.wizard!.stepError)
  const s=await f.journal();for(const k of ['theme','style','goldenFinger','trope'])assert.equal(s.wizard!.tasks.find(t=>t.settingsKind===k)!.state,'done',k)
 }finally{p.releaseAll();await f.dispose()}
})
test('WP-05: one failed batch fails its setting task; a retry re-runs every batch',async()=>{
 const x=await worldFixture(['world','theme']),{f}=x,base=f.handler();let fail=true,themeCalls=0
 f.setAi(async r=>{if(r.phase==='analyze'&&!r.intent&&r.kind==='theme'){themeCalls++;if(fail&&themeCalls===1)throw Error('Server Error');return {notFound:true}}if(r.intent==='entity')return entityResult(r);return base(r)})
 try{
  await toWorldImport(x);let v=await f.settle();const task=v.wizard!.tasks.find(t=>t.settingsKind==='theme')!;assert.equal(task.state,'failed')
  const before=themeCalls,batches=f.requests.filter(r=>r.kind==='theme'&&r.phase==='analyze').length;fail=false
  await f.act('wizard-task',{taskId:task.id,op:'retry'});v=await f.settle();assert.equal(v.wizard!.tasks.find(t=>t.settingsKind==='theme')!.state,'done')
  assert.equal(themeCalls-before,batches,'every batch re-runs')
 }finally{await f.dispose()}
})
test('WP-06: a world request names only its target, its world chain and items in its text; no evidence options',async()=>{
 const x=await worldFixture(),{f}=x,base=f.handler(),seen:ImportAiRequest[]=[]
 f.setAi(async r=>{if(r.intent==='entity'&&r.kind==='world'){seen.push(r);return entityResult(r)}return base(r)})
 try{
  await toWorldImport(x);await f.settle();const setting=seen.find(r=>entityName(r)===names[5])!,catalog=catalogOf(setting).map(c=>c.name)
  assert.ok(catalog.includes(names[5])&&catalog.includes('主世界'),catalog.join(','));assert.ok(!catalog.includes(names[40]),'unrelated settings are not listed')
  assert.ok(setting.entities!.length>catalog.length,'the full selected catalog stays in entities');assert.equal(setting.entityTarget!.evidenceOptions,undefined)
 }finally{await f.dispose()}
})
test('WP-07: a world entity gets one correction for an unfinished reply; the hint keeps the copy-unit rule',async()=>{
 const x=await worldFixture(),{f}=x,base=f.handler(),hints:string[]=[];let failed=new Set<string>()
 f.setAi(async r=>{if(r.intent==='entity'&&r.kind==='world'){const n=entityName(r);if(n===names[3]&&!failed.has(n)){failed.add(n);throw Error('模型输出未完整结束')}if(r.instruction!.includes('上一次结果字段结构不合法'))hints.push(r.instruction!);return entityResult(r)}return base(r)})
 try{
  await toWorldImport(x);const v=await f.settle();assert.notEqual(v.wizard!.step,'import-world',v.wizard!.stepError)
  assert.equal(hints.length,1);assert.ok(hints[0].includes('sourceUnitIds与evidence.unitId逐字复制'))
  failed=new Set()
 }finally{await f.dispose()}
})
test('WP-03: world entities and (docs/514) settings batches use the light policy and the import lane',async()=>{
 const resolved={model:{},modelRecord:{},providerOptions:{deepseek:{thinking:{type:'enabled'}}}} as unknown as ResolvedModel,saved={provider:'deepseek',protocol:'openai',modelId:'synthetic',thinkingLevels:['low','high'],defaultThinking:'high'}
 const world={semanticVersion:1,phase:'analyze',intent:'entity',kind:'world'} as ImportAiRequest,theme={semanticVersion:1,phase:'analyze',kind:'theme',executionLane:'wizard-settings-v1'} as ImportAiRequest
 assert.notEqual(importGenerationModel(world,resolved,saved),resolved);assert.notEqual(importGenerationModel(theme,resolved,saved),resolved,'settings batches drop to the light policy (docs/514)')
 for(const r of [{...world,intent:undefined},{...world,phase:'review'},{...world,intent:'reconcile'}])assert.equal(importGenerationModel(r as ImportAiRequest,resolved,saved),resolved)
 const previous=longTaskQueue.limit,first=await acquireLongTask(undefined,2),second=await acquireLongTask(undefined,2),abort=new AbortController()
 try{
  for(const r of [world,theme]){let entered=false;const lane=runImportGenerationLane(r,async()=>{const release=await acquireLongTask(abort.signal,2);entered=true;release()});await new Promise<void>(x=>setImmediate(x));assert.equal(entered,true,r.kind+' is not blocked by chat slots');await lane}
  let ordinaryEntered=false;const ordinary=runImportGenerationLane({...theme,executionLane:undefined} as ImportAiRequest,async()=>{const release=await acquireLongTask(abort.signal,2);ordinaryEntered=true;release()})
  await new Promise<void>(x=>setImmediate(x));assert.equal(ordinaryEntered,false,'ordinary theme analysis still waits');first();await ordinary;assert.equal(ordinaryEntered,true)
 }finally{abort.abort();first();second();longTaskQueue.setLimit(previous)}
})

test('WP-11: other-setting batches hold at most 16 lanes while world entries remain; entries still get the rest',async()=>{
 const x=await worldFixture(['world','theme','style','goldenFinger','trope']),{f}=x,p=gated(f)
 try{
  await toWorldImport(x);await until(()=>p.pending.size>=1);await sleep(50)
  assert.ok(p.settingsPeak<=16,'batches '+p.settingsPeak)
  const main=[...p.pending.values()].find(e=>e.r.intent==='entity')!;main.resolve()
  await until(()=>[...p.pending.values()].filter(e=>e.r.intent==='entity').length>=31-16);await sleep(50)
  assert.ok([...p.pending.values()].filter(e=>e.r.intent==='entity').length>=31-16,'entities get the remaining lanes');assert.ok(p.peak<=31,String(p.peak))
 }finally{p.releaseAll();await f.dispose()}
})
test('WP-12: after a global error no queued request is sent and the step ends',async()=>{
 const x=await worldFixture(['world','theme','style','goldenFinger','trope']),{f}=x,p=gated(f)
 try{
  await toWorldImport(x);await until(()=>p.pending.size>=1);await sleep(50)
  const sent=()=>f.requests.filter(r=>r.intent==='entity'||!r.intent&&['theme','style','goldenFinger','trope'].includes(r.kind!)).length,before=sent()
  ;(f.controller as unknown as {verify:()=>Promise<void>}).verify=async()=>{throw Error('来源文件已变化')}
  const main=[...p.pending.values()].find(e=>e.r.intent==='entity')!;main.resolve()
  for(const e of [...p.pending.values()])e.reject()
  await f.settle();await sleep(100);assert.equal(f.controller.active,0,'the step stopped')
  assert.ok(sent()-before<=1,'no queued request after the error: '+(sent()-before))
 }finally{p.releaseAll();await f.dispose()}
})
test('WP-13: after one failed batch the task fails and its queued batches are not sent',async()=>{
 const x=await worldFixture(['world','theme']),{f}=x,base=f.handler();let themeCalls=0
 ;(f.controller as unknown as {executionBudget:(...a:unknown[])=>{characters:number;maxUnits:number}}).executionBudget=(()=>{const original=(f.controller as unknown as {executionBudget:(...a:unknown[])=>{characters:number;maxUnits:number}}).executionBudget.bind(f.controller);return (...a:unknown[])=>({...original(...a),characters:3000})})()
 f.setAi(async r=>{if(r.phase==='analyze'&&!r.intent&&r.kind==='theme'){themeCalls++;await sleep(5);throw Error('Server Error')}if(r.intent==='entity')return entityResult(r);return base(r)})
 try{
  await toWorldImport(x);const v=await f.settle(),batches=Math.ceil(names.length/2)
  const planned=f.requests.filter(r=>r.kind==='theme').length;assert.equal(v.wizard!.tasks.find(t=>t.settingsKind==='theme')!.state,'failed');assert.ok(themeCalls>=1&&themeCalls<batches,themeCalls+' of at least '+batches+' (sent '+planned+')');assert.ok(batches>8,'more batches than lanes')
 }finally{await f.dispose()}
})
test('WP-14: a skipped setting task stays skipped even when it returns nothing',async()=>{
 const x=await worldFixture(['world','theme']),{f}=x,p=gated(f)
 try{
  await toWorldImport(x);await until(()=>[...p.pending.values()].some(e=>e.r.kind==='theme'));const task=(await f.view()).wizard!.tasks.find(t=>t.settingsKind==='theme')!
  await f.act('wizard-task',{taskId:task.id,op:'skip'});p.releaseAll();const v=await f.settle()
  assert.equal(v.wizard!.tasks.find(t=>t.settingsKind==='theme')!.state,'skipped');assert.ok(!(await f.journal()).notFound.includes('theme'))
 }finally{p.releaseAll();await f.dispose()}
})
const smallBatches=(f:Fixture)=>{const c=f.controller as unknown as {executionBudget:(...a:unknown[])=>{characters:number;maxUnits:number}},original=c.executionBudget.bind(f.controller);c.executionBudget=(...a:unknown[])=>({...original(...a),characters:3000})}
test('WP-15: skipping a setting with queued batches ends only that task; the step finishes',async()=>{
 const x=await worldFixture(['world','theme']),{f}=x;smallBatches(f);const p=gated(f)
 try{
  await toWorldImport(x);await until(()=>[...p.pending.values()].filter(e=>e.r.kind==='theme').length>=8);const task=(await f.view()).wizard!.tasks.find(t=>t.settingsKind==='theme')!
  await f.act('wizard-task',{taskId:task.id,op:'skip'});p.releaseAll();const v=await f.settle()
  assert.equal(v.wizard!.tasks.find(t=>t.settingsKind==='theme')!.state,'skipped');assert.notEqual(v.phase,'running');assert.equal(f.controller.active,0)
  assert.ok(v.wizard!.tasks.filter(t=>t.kind==='entity').every(t=>t.state==='done'),'world entities finish');assert.notEqual(v.wizard!.step,'import-world',v.wizard!.stepError)
 }finally{p.releaseAll();await f.dispose()}
})
test('WP-17: other settings are claimed before world entries (docs/506 3R4-3)',async()=>{
 const x=await worldFixture(['world','theme','style','goldenFinger','trope']),{f}=x,p=gated(f)
 try{
  await toWorldImport(x);await until(()=>p.pending.size>=31);await sleep(50)
  const kinds=new Set([...p.pending.values()].filter(e=>e.r.intent!=='entity').map(e=>e.r.kind));for(const k of ['theme','style','goldenFinger','trope'])assert.ok(kinds.has(k as never),'first wave holds '+k)
 }finally{p.releaseAll();await f.dispose()}
})
test('WP-18: retrying a setting kind while the main world is still running succeeds (docs/509 review 1)',async()=>{
 const x=await worldFixture(['world','theme']),{f}=x,base=f.handler();let hold:(()=>void)|undefined,themeCalls=0
 const main=new Promise<void>(resolve=>hold=resolve)
 f.setAi(async r=>{
  if(r.intent==='entity'&&r.kind==='world'&&entityName(r)==='主世界'){await main;return entityResult(r)}
  if(r.phase==='analyze'&&!r.intent&&r.kind==='theme'){if(++themeCalls===1)throw Error('Server Error');return {notFound:true}}
  if(r.intent==='entity')return entityResult(r);return base(r)})
 try{
  await toWorldImport(x);await until(async()=>(await f.journal()).artifacts.filter(a=>a.kind==='world').length>=10&&(await f.view()).wizard!.tasks.find(t=>t.settingsKind==='theme')!.state==='failed')
  const task=(await f.view()).wizard!.tasks.find(t=>t.settingsKind==='theme')!;assert.equal(task.state,'failed')
  await f.act('wizard-task',{taskId:task.id,op:'retry'});await until(async()=>(await f.view()).wizard!.tasks.find(t=>t.settingsKind==='theme')!.state==='done')
  assert.equal((await f.view()).wizard!.tasks.find(t=>t.settingsKind==='theme')!.state,'done','retry while the main world runs')
  hold!();const v=await f.settle();assert.notEqual(v.wizard!.step,'import-world',v.wizard!.stepError)
 }finally{hold?.();await f.dispose()}
})
test('WP-07b: locator errors get the same single correction without option wording; after one automatic re-run (docs/506 3R6) the task fails',async()=>{
 for(const message of ['模型证据无法定位（no-match）','模型证据无法定位（ambiguous）','模型未返回可解析的 JSON']){
  const x=await worldFixture(),{f}=x,base=f.handler(),hints:string[]=[];let calls=0
  f.setAi(async r=>{if(r.intent==='entity'&&r.kind==='world'&&entityName(r)===names[3]){calls++;if(r.instruction!.includes('上一次结果字段结构不合法'))hints.push(r.instruction!);throw Error(message)}if(r.intent==='entity')return entityResult(r);return base(r)})
  try{
   await toWorldImport(x);const v=await f.settle(),task=v.wizard!.tasks.find(t=>v.wizard!.candidates.world!.find(c=>c.id===t.candidateId)?.name===names[3])!
   assert.equal(calls,4,message);assert.equal(task.state,'failed',message);assert.equal(hints.length,2,'each run has one correction')
   assert.ok(!hints[0].includes('合法引用选项')&&!hints[0].includes('sourceUnitIds由应用计算'),message)
  }finally{await f.dispose()}
 }
})
test('WP-19: a world entry that fails after its correction succeeds on the automatic re-run; global errors are not re-run (docs/506 3R6)',async()=>{
 const x=await worldFixture(),{f}=x,base=f.handler();let calls=0
 f.setAi(async r=>{if(r.intent==='entity'&&r.kind==='world'&&entityName(r)===names[8]){if(++calls<=2)throw Error('模型返回结构不完整（artifacts.0.facts）')}if(r.intent==='entity')return entityResult(r);return base(r)})
 try{
  await toWorldImport(x);const v=await f.settle();assert.equal(calls,3,'two failed attempts then one re-run');assert.notEqual(v.wizard!.step,'import-world',v.wizard!.stepError)
  assert.ok(v.wizard!.tasks.every(t=>t.state==='done'))
 }finally{await f.dispose()}
 const g=await worldFixture(),h=g.f.handler();let other=0
 g.f.setAi(async r=>{if(r.intent==='entity'&&r.kind==='world'&&entityName(r)===names[8]){other++;throw Error('Server Error')}if(r.intent==='entity')return entityResult(r);return h(r)})
 try{await toWorldImport(g);const v=await g.f.settle();assert.equal(other,1,'a non-output failure is not re-run');assert.equal(v.wizard!.tasks.find(t=>v.wizard!.candidates.world!.find(c=>c.id===t.candidateId)?.name===names[8])!.state,'failed')}finally{await g.f.dispose()}
})
test('WP-07c: a world facts structure error gets one correction with the content shapes',async()=>{
 const x=await worldFixture(),{f}=x,base=f.handler(),hints:string[]=[];let failed=false
 f.setAi(async r=>{if(r.intent==='entity'&&r.kind==='world'&&entityName(r)===names[4]){if(r.instruction!.includes('上一次结果字段结构不合法'))hints.push(r.instruction!);if(!failed){failed=true;throw Error('模型返回结构不完整（artifacts.0.facts）')}}if(r.intent==='entity')return entityResult(r);return base(r)})
 try{
  await toWorldImport(x);const v=await f.settle();assert.notEqual(v.wizard!.step,'import-world',v.wizard!.stepError)
  assert.equal(hints.length,1);assert.ok(hints[0].includes('"factions"'),'the hint names the faction shape')
 }finally{await f.dispose()}
 // A bare artifacts error (world-r10, e-ba0848ec…) gets the same correction instead of failing the task.
 const g=await worldFixture(),h=g.f.handler(),bare:string[]=[];let once=false
 g.f.setAi(async r=>{if(r.intent==='entity'&&r.kind==='world'&&entityName(r)===names[9]){if(r.instruction!.includes('上一次结果字段结构不合法'))bare.push(r.instruction!);if(!once){once=true;throw Error('模型返回结构不完整（artifacts）')}}if(r.intent==='entity')return entityResult(r);return h(r)})
 try{
  await toWorldImport(g);const v=await g.f.settle();assert.notEqual(v.wizard!.step,'import-world',v.wizard!.stepError)
  assert.equal(bare.length,1);assert.ok(bare[0].includes('"factions"'))
 }finally{await g.f.dispose()}
})
test('WP-16: a world node reads a short slice of its cited text; settings keep a full batch',async()=>{
 const x=await worldFixture(),{f}=x,base=f.handler(),sizes=new Map<string,number>()
 f.setAi(async r=>{if(r.intent==='entity'&&r.kind==='world')sizes.set(entityName(r),r.units.reduce((n,u)=>n+u.text.length,0));if(r.intent==='entity')return entityResult(r);return base(r)})
 try{
  await toWorldImport(x);await f.settle();assert.ok(sizes.get('主世界')!<=6000+1000,'main world '+sizes.get('主世界'))
 }finally{await f.dispose()}
 const g=await worldFixture(),h=g.f.handler();let hint=''
 g.f.setAi(async r=>{if(r.intent==='entity'&&r.kind==='world'&&entityName(r)===names[6]){if(r.instruction!.includes('上一次结果字段结构不合法'))hint=r.instruction!;else throw Error('模型返回结构不完整（artifacts.0.evidence.6、artifacts.0.sourceUnitIds）')}if(r.intent==='entity')return entityResult(r);return h(r)})
 try{await toWorldImport(g);const v=await g.f.settle();assert.notEqual(v.wizard!.step,'import-world',v.wizard!.stepError);assert.ok(hint.includes('evidence每项仅含unitId与quote'))}finally{await g.f.dispose()}
})
