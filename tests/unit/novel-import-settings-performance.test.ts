import assert from 'node:assert/strict'
import {test} from 'node:test'
import {generateImportAiJson,importGenerationModel,runImportAi} from '../../desktop/service/novel-import-ai'
import type {ImportAiRequest,ImportAiResult,ImportArtifact,ImportUnit} from '../../desktop/shared/novel-import'
import type {ResolvedModel} from '../../src/lib/ai/provider'
import {fixture,source,rosterAi,model,sleep,entityResult} from '../helpers/novel-import-wizard-fixture'

/* docs/515. Synthetic text only. */
const units:ImportUnit[]=[
 {id:'u-a',fileId:'f',kind:'body',start:0,end:40,text:'合成甲：灯火照在合成渡口的旧石阶上，众人沉默。'} as ImportUnit,
 {id:'u-b',fileId:'f',kind:'body',start:40,end:80,text:'合成乙：远处传来合成钟声，少年终于抬起了头。'} as ImportUnit,
]
const lane=(kind='theme',over:Partial<ImportAiRequest>={}):ImportAiRequest=>({semanticVersion:1,phase:'analyze',kind:kind as ImportAiRequest['kind'],units:structuredClone(units),artifacts:[],executionLane:'wizard-settings-v1',operationId:'op-'+kind,models:{text:model},workingRevision:0,selectedTargets:[kind as never],chapters:[],entities:[],...over}) as ImportAiRequest
const good=(id:string,kind='theme',over:Partial<ImportArtifact>={}):ImportArtifact=>({id,kind:kind as ImportArtifact['kind'],name:'合成'+id,text:'合成说明。',facts:kind==='trope'?{tropeKind:'SATISFACTION'}:{},evidence:[{unitId:'u-a',quote:'灯火照在合成渡口'}],sourceUnitIds:['u-a'],origin:'inferred',...over})
/** Runs the real generation bridge with injected generateText replies, one per generation. */
async function run(request:ImportAiRequest,replies:unknown[]){
 const prompts:string[]=[];let n=0
 const result=await runImportAi(request,new AbortController().signal,{resolve:async()=>request.models.text,assert:async()=>{},generate:async(input,_m,signal,prompt)=>generateImportAiJson(input,{userId:'settings-synthetic-user',resolvedModel:{} as ResolvedModel,maxNetworkRetries:0},signal,prompt,{generateText:async(options:{prompt?:string})=>{prompts.push(String(options?.prompt??''));const reply=replies[Math.min(n++,replies.length-1)];return {text:typeof reply==='string'?reply:JSON.stringify(reply),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'}}} as never)})
 return {result,generations:n,prompts}
}
async function fails(request:ImportAiRequest,replies:unknown[]){
 const prompts:string[]=[];let n=0
 try{await runImportAi(request,new AbortController().signal,{resolve:async()=>request.models.text,assert:async()=>{},generate:async(input,_m,signal,prompt)=>generateImportAiJson(input,{userId:'settings-synthetic-user',resolvedModel:{} as ResolvedModel,maxNetworkRetries:0},signal,prompt,{generateText:async(options:{prompt?:string})=>{prompts.push(String(options?.prompt??''));const reply=replies[Math.min(n++,replies.length-1)];return {text:typeof reply==='string'?reply:JSON.stringify(reply),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'}}} as never)});return undefined}
 catch(error){return Object.assign(error as Error,{prompts})}
}

test('SP-01: settings-lane batches use the light policy; ordinary theme analysis, review and reconcile keep saved options',()=>{
 const resolved={model:{},modelRecord:{},providerOptions:{openai:{store:false}}} as unknown as ResolvedModel
 const deepseek={provider:'deepseek',protocol:'openai',modelId:'synthetic',thinkingLevels:['low','high'],defaultThinking:'high'}
 assert.deepEqual(importGenerationModel(lane(),resolved,deepseek).providerOptions,{openai:{store:false},deepseek:{thinking:{type:'disabled'}}})
 for(const kind of ['style','goldenFinger','trope'])assert.notEqual(importGenerationModel(lane(kind),resolved,deepseek),resolved,kind)
 const lowered=importGenerationModel(lane(),resolved,{provider:'anthropic',protocol:'anthropic',modelId:'synthetic',thinkingLevels:['low','high'],defaultThinking:'high'})
 assert.notEqual(lowered,resolved,'a thinking default drops to its lightest level')
 assert.equal(importGenerationModel(lane(),resolved,{provider:'anthropic',protocol:'anthropic',modelId:'synthetic'}),resolved,'no levels: options unchanged')
 for(const r of [{...lane(),executionLane:undefined},{...lane(),phase:'review'},{...lane(),intent:'reconcile'}])assert.equal(importGenerationModel(r as ImportAiRequest,resolved,deepseek),resolved)
})

test('SP-02: unlocatable quotes are dropped while one locatable quote remains; no correction is sent',async()=>{
 const a=good('t-1',undefined,{evidence:[{unitId:'u-a',quote:'灯火照在合成渡口'},{unitId:'u-a',quote:'模型虚构而不存在的一段原文'},{unitId:'u-b',quote:'虚构'}]})
 const {result,generations}=await run(lane(),[{artifacts:[a]}])
 assert.equal(generations,1);assert.deepEqual(result.artifacts![0].evidence,[{unitId:'u-a',quote:'灯火照在合成渡口'}])
 assert.deepEqual(result.settingsRepairs,{droppedEvidence:2,droppedArtifacts:0,clearedReliability:0})
})

test('SP-03: sourceUnitIds keep this batch plus every cited unit, even when all given ids are outside it',async()=>{
 const {result}=await run(lane(),[{artifacts:[good('t-1',undefined,{sourceUnitIds:['u-elsewhere'],evidence:[{unitId:'u-b',quote:'远处传来合成钟声'},{unitId:'u-a',quote:'虚构不存在的原文片段内容'}]})]}])
 assert.deepEqual(result.artifacts![0].sourceUnitIds,['u-b']);assert.equal(result.settingsRepairs!.droppedEvidence,1)
 const clean=await run(lane(),[{artifacts:[good('t-2',undefined,{sourceUnitIds:['u-a','u-elsewhere']})]}])
 assert.equal(clean.generations,1,'an out-of-batch id is trimmed without a correction');assert.deepEqual(clean.result.artifacts![0].sourceUnitIds,['u-a']);assert.equal(Object.hasOwn(clean.result,'settingsRepairs'),false,'trimming is not counted')
})

test('SP-04: reliability is cleared only when invalid or unattributed',async()=>{
 const cases:[Record<string,string>,Record<string,string>,number][]=[
  [{reliability:'客观事实'},{reliability:'客观事实'},0],
  [{reliability:'人物推测',attribution:'合成甲所想'},{reliability:'人物推测',attribution:'合成甲所想'},0],
  [{reliability:'人物推测',attribution:' ',temporalScope:'合成早期'},{temporalScope:'合成早期'},1],
  [{reliability:'大概',attribution:'合成'},{},1],
  [{},{},0],
 ]
 for(const [facts,want,cleared] of cases){
  const pad=cleared?[]:[{unitId:'u-a',quote:'虚构不存在的原文片段内容'}]
  const {result}=await run(lane(),[{artifacts:[good('t-1',undefined,{facts,evidence:[{unitId:'u-a',quote:'灯火照在合成渡口'},...pad]})]}])
  assert.deepEqual(result.artifacts![0].facts,want,JSON.stringify(facts));assert.equal(result.settingsRepairs?.clearedReliability??0,cleared)
 }
})

test('SP-05: an item still invalid on its own is dropped and the rest are kept',async()=>{
 const bad=[good('t-x',undefined,{evidence:[{unitId:'u-a',quote:'虚构不存在的原文片段内容'}]}),good('t-y','style'),good('t-1'),good('t-1',undefined,{name:'重复'})]
 const {result,generations}=await run(lane(),[{artifacts:bad}])
 assert.equal(generations,1);assert.deepEqual(result.artifacts!.map(a=>a.id),['t-1']);assert.deepEqual(result.settingsRepairs,{droppedEvidence:0,droppedArtifacts:3,clearedReliability:0},'a dropped item is counted once, not also by its quotes')
 const trope=await run(lane('trope'),[{artifacts:[good('p-1','trope',{facts:{}}),good('p-2','trope')]}])
 assert.deepEqual(trope.result.artifacts!.map(a=>a.id),['p-2'],'a trope without tropeKind is dropped')
})

test('SP-06: with no item left the reply is untouched: same correction and error as before',async()=>{
 const none={artifacts:[good('t-x',undefined,{evidence:[{unitId:'u-a',quote:'虚构不存在的原文片段内容'}]})]}
 const tolerant=await fails(lane(),[none,none]),strict=await fails({...lane(),executionLane:undefined},[none,none])
 assert.ok(tolerant&&strict);assert.equal(tolerant!.message,strict!.message);assert.match(tolerant!.message,/模型证据无法定位（no-match）/u)
 const tp=(tolerant as Error&{prompts:string[]}).prompts,sp=(strict as Error&{prompts:string[]}).prompts;assert.equal(tp.length,2);assert.equal(tp[1].slice(-600),sp[1].slice(-600),'the correction feedback is unchanged')
 const fixed=await run(lane(),[none,{artifacts:[good('t-1')]}]);assert.equal(fixed.generations,2);assert.equal(fixed.result.settingsRepairs,undefined)
 assert.match((await fails(lane(),[{artifacts:[]}]))!.message,/notFound/u)
})

test('SP-07/SP-08: root errors and every other request keep the strict rules',async()=>{
 const one={artifacts:[good('t-1',undefined,{evidence:[{unitId:'u-a',quote:'灯火照在合成渡口'},{unitId:'u-a',quote:'虚构不存在的原文片段内容'}]})]}
 // An extra root key: the otherwise repairable item is not repaired and the strict root error is reported.
 assert.match((await fails(lane(),[{...one,extra:1},{...one,extra:1}]))!.message,/模型返回结构不完整|模型证据无法定位/u)
 const okRoot=await run(lane(),[one]);assert.equal(okRoot.result.settingsRepairs!.droppedEvidence,1,'control: the same item without the extra key is repaired')
 assert.match((await fails({...lane(),executionLane:undefined},[one,one]))!.message,/模型证据无法定位（no-match）/u,'ordinary theme analysis keeps strict evidence')
 for(const over of [{intent:'entity'},{phase:'review'},{kind:'character'}] as Partial<ImportAiRequest>[])assert.match((await fails(lane('theme',over),[{artifacts:[good('t-1')]}]))!.message,/调度通道无效/u,JSON.stringify(over))
 const direct=(extra:unknown)=>runImportAi(lane(),new AbortController().signal,{resolve:async()=>model,assert:async()=>{},generate:async()=>({artifacts:[good('t-1')],settingsRepairs:extra})})
 for(const extra of [{droppedEvidence:-1,droppedArtifacts:0,clearedReliability:0},{droppedEvidence:0.5,droppedArtifacts:0,clearedReliability:0},{droppedEvidence:1,droppedArtifacts:0,clearedReliability:0,x:1},{droppedEvidence:0,droppedArtifacts:0,clearedReliability:0}])await assert.rejects(direct(extra),JSON.stringify(extra))
 await assert.rejects(runImportAi({...lane(),executionLane:undefined},new AbortController().signal,{resolve:async()=>model,assert:async()=>{},generate:async()=>({artifacts:[good('t-1')],settingsRepairs:{droppedEvidence:1,droppedArtifacts:0,clearedReliability:0}})}),/越权/u)
 // Tolerance lives in the generation bridge only: a bad reply handed straight to the final gate still fails.
 await assert.rejects(runImportAi(lane(),new AbortController().signal,{resolve:async()=>model,assert:async()=>{},generate:async()=>structuredClone(one)}))
})

test('SP-09: repairs appear only when non-zero; artifacts carry no extra field',async()=>{
 const {result}=await run(lane(),[{artifacts:[good('t-1')]}]);assert.equal(Object.hasOwn(result,'settingsRepairs'),false)
 const repaired=await run(lane(),[{artifacts:[good('t-1',undefined,{evidence:[{unitId:'u-a',quote:'灯火照在合成渡口'},{unitId:'u-a',quote:'虚构不存在的原文片段内容'}]})]}])
 assert.deepEqual(Object.keys(repaired.result.artifacts![0]).sort(),Object.keys(good('t-1')).sort())
})

/* Controller cases: a 40-chapter synthetic book with small batches, settings only or world plus settings. */
const SETTINGS=['theme','style','goldenFinger','trope'] as const
type Fixture=Awaited<ReturnType<typeof fixture>>
async function settingsFixture(targets:string[]=[...SETTINGS],chapters=40){
 const names=Array.from({length:chapters},(_,i)=>'合成设定'+String(i).padStart(2,'0'))
 const body=names.map((n,i)=>`第${i+1}章 篇${i}\n\n众人谈起${n}。${'风声。'.repeat(160)}\n\n`).join('')
 const f=await fixture([source(body,'正文.txt','f-body')],rosterAi({'roster:world':r=>({roster:r.units.flatMap(u=>{const own=names.filter(n=>u.text.includes(n));return own.length?[{name:'主世界',aliases:[],settings:own.map(name=>({settingType:'SOCIETY' as const,name})),evidence:{unitId:u.id,quote:own[0]}}]:[]})})}))
 const c=f.controller as unknown as {executionBudget:(...a:unknown[])=>{characters:number;maxUnits:number}},original=c.executionBudget.bind(f.controller);c.executionBudget=(...a:unknown[])=>({...original(...a),characters:3000})
 return {f,targets}
}
async function toStep16({f,targets}:{f:Fixture;targets:string[]}){
 await f.act('choose',{mode:'files'});await f.act('wizard-next');await f.act('set-title',{title:'合成设定作品'});await f.act('choose-target');await f.act('wizard-next')
 await f.act('classify',{mode:'ai',consent:true});await f.settle();await f.act('select',{selected:['body'],targets,infer:true});await f.act('wizard-next',{consent:true});await f.settle()
 await f.act('wizard-next',{consent:true});let v=await f.view()
 if(targets.includes('world')){for(let i=0;i<400&&v.wizard!.stepState['detect-world']!=='waiting';i++){await sleep(10);v=await f.view()};assert.equal(v.wizard!.stepState['detect-world'],'waiting',v.wizard!.stepError);await f.act('wizard-next')}
}
const isSettings=(r:ImportAiRequest)=>r.phase==='analyze'&&!r.intent&&SETTINGS.includes(r.kind as never)
const settingArtifact=(r:ImportAiRequest):ImportArtifact=>{const u=r.units[0];return {id:r.kind+'-'+u.id.replace(/[^0-9a-z]/giu,''),kind:r.kind as ImportArtifact['kind'],name:'合成'+r.kind+u.start,text:'合成说明。',facts:r.kind==='trope'?{tropeKind:'TEAR'}:{},evidence:[{unitId:u.id,quote:u.text.slice(0,12)}],sourceUnitIds:[u.id],origin:'inferred'}}
/** Entity and settings calls wait until released. Settings return one synthetic artifact; `answer` may override. */
function gated(f:Fixture,answer:(r:ImportAiRequest)=>ImportAiResult|Promise<ImportAiResult>=r=>({artifacts:[settingArtifact(r)]})){
 const base=f.handler(),pending=new Map<string,{resolve:()=>void;reject:()=>void;r:ImportAiRequest}>();let open=false,running=0,peak=0,settingsRunning=0,settingsPeak=0
 f.setAi(async r=>{
  const entity=r.intent==='entity',settings=isSettings(r);if(!entity&&!settings)return base(r)
  running++;peak=Math.max(peak,running);if(settings){settingsRunning++;settingsPeak=Math.max(settingsPeak,settingsRunning)}
  try{if(!open)await new Promise<void>((resolve,reject)=>pending.set(r.operationId,{resolve,reject:()=>reject(new DOMException('已取消','AbortError')),r}));return settings?await answer(r):entityResult(r)}finally{pending.delete(r.operationId);running--;if(settings)settingsRunning--}
 })
 f.options.cancelAi=async id=>{pending.get(id)?.reject()}
 return {pending,get peak(){return peak},get settingsPeak(){return settingsPeak},get settingsRunning(){return settingsRunning},releaseAll(){open=true;for(const p of pending.values())p.resolve()}}
}
async function until(check:()=>boolean|Promise<boolean>,ms=8000){const end=Date.now()+ms;while(!await check()){if(Date.now()>end)break;await sleep(5)}}
const repairs={droppedEvidence:2,droppedArtifacts:1,clearedReliability:0}

test('SP-17: with no world entry the settings batches use all 31 lanes',async()=>{
 const x=await settingsFixture([...SETTINGS],64),{f}=x,p=gated(f)
 try{
  await toStep16(x);await until(()=>p.pending.size>=31);await sleep(30)
  assert.equal(p.settingsRunning,31,'31 batches in flight');assert.ok(p.peak<=31)
  p.releaseAll();const v=await f.settle();assert.notEqual(v.wizard!.step,'import-world',v.wizard!.stepError)
  assert.ok((await f.journal()).wizard!.tasks.filter(t=>t.kind==='settings').every(t=>t.state==='done'))
 }finally{p.releaseAll();await f.dispose()}
})

test('SP-18: with world entries the batches hold at most 16; once the last entry returns, waiting batches start',async()=>{
 const x=await settingsFixture(['world',...SETTINGS],40),{f}=x,p=gated(f)
 try{
  await toStep16(x);await until(()=>p.pending.size>=31);await sleep(30)
  assert.ok(p.settingsRunning<=16,'batches '+p.settingsRunning);assert.ok(p.peak<=31)
  const entities=()=>[...p.pending.values()].filter(e=>e.r.intent==='entity');assert.ok(entities().length>=31-16,'entities get the rest: '+entities().length)
  // Release world entries wave by wave until every entry request has returned (results may still be buffered
  // before their commit; the cap lifts on return). Batches stay gated meanwhile.
  const sent=()=>f.requests.filter(r=>r.intent==='entity').length,total=(await f.view()).wizard!.tasks.filter(t=>t.kind==='entity').length
  for(let i=0;i<400&&(sent()<total||entities().length);i++){for(const e of entities())e.resolve();await sleep(10)}
  assert.equal(sent(),total,'every world entry was sent');assert.equal(entities().length,0,'and returned')
  await until(()=>p.settingsRunning>16);assert.ok(p.settingsRunning>16,'batches take the freed lanes: '+p.settingsRunning)
 }finally{p.releaseAll();await f.dispose()}
})

test('SP-11/SP-12: one dropped record per adopted kind; failure, notFound and retry leave none',async()=>{
 const x=await settingsFixture(),{f}=x;let failTheme=true
 gated(f,r=>{if(r.kind==='theme'&&failTheme)throw Error('Server Error');if(r.kind==='style')return {notFound:true};return {artifacts:[settingArtifact(r)],settingsRepairs:r.kind==='trope'?{droppedEvidence:0,droppedArtifacts:0,clearedReliability:1}:repairs}}).releaseAll()
 try{
  await toStep16(x);let v=await f.settle(),j=await f.journal()
  const task=(k:string)=>j.wizard!.tasks.find(t=>t.settingsKind===k)!
  assert.equal(task('theme').state,'failed');assert.equal(task('style').state,'done')
  const records=j.wizard!.dropped.filter(d=>d.kind==='settings'&&d.label!=='主题定位'/* docs/542 position note */)
  assert.deepEqual(records.map(d=>d.label).sort(),['爽点/泪点','金手指'].sort(),'failed theme and notFound style leave no record')
  const golden=records.find(d=>d.label==='金手指')!,batches=f.requests.filter(r=>r.kind==='goldenFinger').length
  assert.equal(golden.reason,`丢弃 ${2*batches} 条无法定位的原文引文，丢弃 ${batches} 项不合规条目`)
  assert.equal(records.find(d=>d.label==='爽点/泪点')!.reason,`${f.requests.filter(r=>r.kind==='trope').length} 项取消可靠性标注`)
  failTheme=false;await f.act('wizard-task',{taskId:task('theme').id,op:'retry'});v=await f.settle();j=await f.journal()
  assert.equal(j.wizard!.dropped.filter(d=>d.kind==='settings'&&d.label!=='主题定位'/* docs/542 position note */&&d.label==='主题').length,1,'a successful retry adds exactly one record')
  void v
 }finally{await f.dispose()}
})

test('SP-14/SP-15: a batch failing after its correction is rerun once on its lane; a second failure or a server error is not',async()=>{
 for(const mode of ['rerun-ok','rerun-fails','server'] as const){
  const x=await settingsFixture(['theme'],4),{f}=x,calls=new Map<string,number>();let target:string|undefined
  gated(f,r=>{const key=r.units[0].id;target??=key;const n=(calls.get(key)??0)+1;calls.set(key,n)
   if(key===target&&(mode==='server'||mode==='rerun-fails'||n===1))throw mode==='server'?Error('Server Error'):Error('模型证据无法定位（no-match）')
   return {artifacts:[settingArtifact(r)],...(key===target?{settingsRepairs:{droppedEvidence:1,droppedArtifacts:0,clearedReliability:0}}:{})}}).releaseAll()
  try{
   await toStep16(x);await f.settle();const j=await f.journal(),task=j.wizard!.tasks.find(t=>t.settingsKind==='theme')!,ops=f.requests.filter(r=>r.kind==='theme'&&!r.themeProfile&&r.units[0].id===target)
   if(mode==='rerun-ok'){assert.equal(task.state,'done');assert.equal(ops.length,2);assert.notEqual(ops[0].operationId,ops[1].operationId);assert.equal(j.wizard!.dropped.filter(d=>d.kind==='settings'&&d.label!=='主题定位'/* docs/542 position note */).length,1);assert.equal(j.wizard!.dropped.find(d=>d.kind==='settings'&&d.label!=='主题定位'/* docs/542 position note */)!.reason,'丢弃 1 条无法定位的原文引文')}
   else{assert.equal(task.state,'failed',mode);assert.equal(ops.length,mode==='server'?1:2,mode)}
  }finally{await f.dispose()}
 }
})

test('SP-16: after a global stop a failing batch is not rerun and nothing more is sent',async()=>{
 // A world entry's worker error stops the step (stop(): halt set) while a theme batch is still out; that batch then
 // fails with a rerunnable model-output error. halted() must keep it from being sent again.
 const x=await settingsFixture(['world','theme'],4),{f}=x,base=f.handler();let releaseTheme:(()=>void)|undefined,themeSends=0
 f.setAi(async r=>{
  if(r.intent==='entity'){await new Promise<void>(go=>setTimeout(go,30));throw new DOMException('合成全局停止','AbortError')}
  if(r.kind==='theme'&&r.phase==='analyze'&&!r.intent){themeSends++;if(themeSends===1){await new Promise<void>(go=>{releaseTheme=go});throw Error('模型证据无法定位（no-match）')}return {artifacts:[settingArtifact(r)]}}
  return base(r)})
 f.options.cancelAi=async()=>{}
 try{
  await toStep16(x);await until(()=>!!releaseTheme);await until(async()=>f.controller.active===0||(await f.view()).phase!=='running',3000)
  const before=themeSends;releaseTheme!();await f.settle();await sleep(50)
  assert.equal(themeSends,before,'no rerun or new batch after the stop')
 }finally{releaseTheme?.();await f.dispose()}
})

test('SP-10: the controller refuses repair counts on any other request',async()=>{
 const x=await settingsFixture(['world'],2),{f}=x,base=f.handler()
 f.setAi(async r=>r.intent==='entity'?{...entityResult(r),settingsRepairs:repairs}:base(r))
 try{await toStep16(x);await f.settle();const j=await f.journal();assert.ok(j.wizard!.tasks.filter(t=>t.kind==='entity').some(t=>t.state==='failed'&&/越权/u.test(t.error??'')))}finally{await f.dispose()}
})

test('SP-13: a journal with a settings dropped record saves and reloads; old journals without one still load',async()=>{
 const {validateImportWizardState,emptyWizardState}=await import('../../desktop/core/novel-import-wizard-state')
 const old=emptyWizardState();assert.doesNotThrow(()=>validateImportWizardState({wizardVersion:1,wizard:structuredClone(old)}))
 const next={...emptyWizardState(),dropped:[{kind:'settings' as const,label:'主题',reason:'丢弃 1 条无法定位的原文引文'}]};assert.doesNotThrow(()=>validateImportWizardState({wizardVersion:1,wizard:structuredClone(next)}))
 assert.throws(()=>validateImportWizardState({wizardVersion:1,wizard:{...emptyWizardState(),dropped:[{kind:'other',label:'主题',reason:'x'}]}}))
})

test('SP-12b: retryKind(world) and an author skip leave no settings record',async()=>{
 const x=await settingsFixture(['world','theme'],4),{f}=x
 gated(f,r=>({artifacts:[settingArtifact(r)],settingsRepairs:repairs})).releaseAll()
 try{
  await toStep16(x);await f.settle();let j=await f.journal();assert.equal(j.wizard!.dropped.filter(d=>d.kind==='settings'&&d.label!=='主题定位'/* docs/542 position note */).length,1)
  const c=f.controller as unknown as {session:import('../../desktop/shared/novel-import').ImportSession;retryKind:(s:unknown,k:string)=>void}
  c.session.wizard!.step='verify';c.retryKind(c.session,'world');assert.equal(c.session.wizard!.dropped.filter(d=>d.kind==='settings'&&d.label!=='主题定位'/* docs/542 position note */).length,0)
 }finally{await f.dispose()}
 const y=await settingsFixture(['theme'],4),g=y.f,p=gated(g,r=>({artifacts:[settingArtifact(r)],settingsRepairs:repairs}))
 try{
  await toStep16(y);await until(()=>p.pending.size>=1);const task=(await g.view()).wizard!.tasks.find(t=>t.settingsKind==='theme')!
  await g.act('wizard-task',{taskId:task.id,op:'skip'});p.releaseAll();await g.settle();const j=await g.journal()
  assert.equal(j.wizard!.tasks.find(t=>t.settingsKind==='theme')!.state,'skipped');assert.equal(j.wizard!.dropped.filter(d=>d.kind==='settings'&&d.label!=='主题定位'/* docs/542 position note */).length,0)
 }finally{p.releaseAll();await g.dispose()}
})

test('SP-15b/SP-16b: an authorization failure is not rerun; a pause after the first failure sends no rerun',async()=>{
 const x=await settingsFixture(['theme'],4),{f}=x;let sends=0
 gated(f,()=>{sends++;throw Error('请重新允许发送本次导入范围')}).releaseAll()
 try{await toStep16(x);await f.settle();assert.equal(sends,f.requests.filter(isSettings).length);assert.ok(f.requests.filter(isSettings).every((r,i,all)=>all.findIndex(o=>o.units[0].id===r.units[0].id)===i),'no batch sent twice')}finally{await f.dispose()}
 const y=await settingsFixture(['theme'],4),g=y.f;let release:(()=>void)|undefined,themeSends=0
 const base=g.handler();g.setAi(async r=>{if(!isSettings(r))return base(r);themeSends++;if(themeSends===1){await new Promise<void>(go=>{release=go});throw Error('模型证据无法定位（no-match）')}await new Promise<void>(()=>{});return {notFound:true}})
 g.options.cancelAi=async()=>{}
 try{
  await toStep16(y);await until(()=>!!release);const paused=g.act('pause');await sleep(20);const before=themeSends;release!();await paused.catch(()=>undefined);await g.settle();await sleep(50)
  assert.equal(themeSends,before,'no rerun after the pause')
 }finally{release?.();await g.dispose()}
})

test('SP-19: debug lines carry kind, size, attempt and fixed reason text only',async()=>{
 const previous=process.env.SHAKEINK_IMPORT_DEBUG,lines:string[]=[],original=console.error;process.env.SHAKEINK_IMPORT_DEBUG='1';console.error=(...a:unknown[])=>{lines.push(a.map(String).join(' '))}
 const x=await settingsFixture(['theme'],4),{f}=x;let first=true
 gated(f,r=>{if(first){first=false;throw Error('模型返回结构不完整（artifacts.0.facts.秘密原文标记）')}return {artifacts:[settingArtifact(r)],settingsRepairs:repairs}}).releaseAll()
 try{
  await toStep16(x);await f.settle()
  const fail=lines.filter(l=>l.startsWith('settings-batch-fail ')),rep=lines.filter(l=>l.startsWith('settings-repairs '))
  assert.ok(fail.length>=1&&rep.length===1,lines.join('\n').slice(0,400))
  for(const l of [...fail,...rep]){assert.doesNotMatch(l,/秘密原文标记|风声|合成设定/u,l);const data=JSON.parse(l.slice(l.indexOf('{')));assert.ok(Object.keys(data).every(k=>['kind','units','attempt','reason','droppedEvidence','droppedArtifacts','clearedReliability'].includes(k)),l)}
 }finally{console.error=original;if(previous===undefined)delete process.env.SHAKEINK_IMPORT_DEBUG;else process.env.SHAKEINK_IMPORT_DEBUG=previous;await f.dispose()}
})
