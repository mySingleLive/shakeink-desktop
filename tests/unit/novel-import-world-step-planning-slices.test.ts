import assert from 'node:assert/strict'
import {test} from 'node:test'
import {NovelImportController} from '../../desktop/main/novel-import'
import type {ImportAiRequest,ImportSession} from '../../desktop/shared/novel-import'
import {fixture,source,rosterAi,entityResult,settingsF,toStep,sleep} from '../helpers/novel-import-wizard-fixture'

/* docs/566 WR-04..WR-09: on a long book, step 16 planned its four setting tasks in one synchronous stretch per
 * batch (~1 s each, tens of seconds in total), so the window froze. Synthetic text only. */
const CH=Number(process.env.WR_BIG_CH??30),people=Array.from({length:140},(_,i)=>'合成人物'+String(i).padStart(3,'0'))
const body=Array.from({length:CH},(_,i)=>`第${i+1}章 篇${i}\n\n${people[i%people.length]}与${people[(i+5)%people.length]}走过北城。${'风吹过合成山岗，夜色渐深。'.repeat(1700)}\n\n`).join('')
type Draft=Omit<ImportAiRequest,'operationId'|'models'>
type Planner={settingsPlan(s:ImportSession,kind:string,sliceMs:number,frozen?:ImportSession['artifacts']):Generator<Draft|symbol>;session:ImportSession}
const proto=NovelImportController.prototype as unknown as Planner
const settingsLane=(r:ImportAiRequest)=>r.executionLane==='wizard-settings-v1'&&!r.themeProfile
const stripIds=(r:ImportAiRequest|Draft)=>{const {operationId:_o,models:_m,...rest}=r as ImportAiRequest;return JSON.stringify(rest)}
/** What the model sees from a planned batch: its units, context artifacts and entity catalogue. */
const content=(r:ImportAiRequest|Draft)=>JSON.stringify({kind:r.kind,units:r.units.map(u=>u.id),artifacts:r.artifacts,entities:r.entities})

async function toDetectWorld(delay={settings:200,entity:200}){
 const f=await fixture([source(body,'正文.txt','f-body'),source(settingsF,'资料.md','f-notes')],rosterAi({
  'roster:character':r=>({roster:r.units.flatMap(u=>people.filter(n=>u.text.includes(n)).map(name=>({name,aliases:[],roleType:'SUPPORTING' as const,evidence:{unitId:u.id,quote:name}})))}),
 }))
 await f.act('choose',{mode:'files'});await f.act('wizard-next');await f.act('set-title',{title:'合成作品'});await f.act('choose-target');await f.act('wizard-next')
 await f.act('classify',{mode:'ai',consent:true});await f.settle()
 await f.act('select',{selected:['body','world'],targets:['character','world','theme','style','goldenFinger','trope'],infer:true});await f.act('wizard-next',{consent:true});await f.settle()
 const base=f.handler()
 f.setAi(async r=>r.intent==='entity'?(r.kind==='world'&&await sleep(delay.entity),entityResult(r)):r.phase==='analyze'&&!r.intent&&r.executionLane==='wizard-settings-v1'?(await sleep(delay.settings),{notFound:true}):base(r))
 await f.act('wizard-next',{consent:true});await toStep(f,'detect-world')
 return f
}
/** Time-based wait: a responsive event loop makes settle()'s 3000 × 5 ms cap too short for a long step. */
async function waitFor(f:Awaited<ReturnType<typeof fixture>>,done:(v:Awaited<ReturnType<typeof f.view>>)=>boolean,ms=180000){
 const end=Date.now()+ms;for(;;){const v=await f.view();if(done(v))return v;if(Date.now()>end)throw Error('等待超时 '+v.wizard?.step);await sleep(50)}
}
const leftWorld=(v:{wizard?:{step:string;stepState:Record<string,string>}})=>!!v.wizard&&(v.wizard.step!=='import-world'||v.wizard.stepState['import-world']==='waiting')
/** Wraps the planner: records each slice's synchronous time and its event-loop iteration. */
function instrument(){
 const original=proto.settingsPlan;assert.equal(typeof original,'function','settingsPlan exists')
 const slices:{ms:number;tick:number;kind:string}[]=[],yields={count:0},calls={next:0}
 let tick=0,ticking=true;const spin=()=>{tick++;if(ticking)setImmediate(spin)};setImmediate(spin)
 proto.settingsPlan=function*(this:Planner,...args:Parameters<Planner['settingsPlan']>){
  const it=original.apply(this,args)
  for(;;){const t=performance.now(),at=tick;calls.next++;const r=it.next();slices.push({ms:performance.now()-t,tick:at,kind:args[1]});if(r.done)return;if(typeof r.value==='symbol')yields.count++;yield r.value}
 } as Planner['settingsPlan']
 return {slices,yields,calls,restore(){ticking=false;proto.settingsPlan=original}}
}

test('WR-04: on a long book, no single planning slice blocks the main process for long',async()=>{
 const f=await toDetectWorld(),probe=instrument()
 let last=performance.now(),worst=0;const timer=setInterval(()=>{const now=performance.now();worst=Math.max(worst,now-last-10);last=now},10)
 try{
  await f.act('wizard-next');const v=await waitFor(f,leftWorld)
  assert.ok(!v.wizard!.tasks.some(t=>t.state==='failed'),'no task failed')
  const longest=Math.max(...probe.slices.map(s=>s.ms))
  console.log('WR-04 slices',probe.slices.length,'longest slice ms',Math.round(longest),'step-16 worst loop stall ms',Math.round(worst))
  assert.ok(probe.yields.count>10,'planning yields many times');assert.ok(longest<Number(process.env.WR_MAX_SLICE??100),`a planning slice blocked ${Math.round(longest)} ms`)
 }finally{clearInterval(timer);probe.restore();await f.dispose()}
})

test('WR-05: slicing never changes the planned setting requests',async()=>{
 const f=await toDetectWorld()
 try{
  await f.act('wizard-next');await waitFor(f,leftWorld)
  const c=f.controller as unknown as Planner,s=c.session
  for(const kind of ['theme','style','goldenFinger','trope']){
   const plain=[...proto.settingsPlan.call(c,s,kind,Infinity)],sliced=[...proto.settingsPlan.call(c,s,kind,0)]
   assert.ok(plain.every(r=>typeof r!=='symbol'),'an unsliced plan never yields')
   const pauses=sliced.filter(r=>typeof r==='symbol').length,requests=sliced.filter((r):r is Draft=>typeof r!=='symbol')
   assert.ok(requests.length>=2,kind+' is split into several batches');assert.ok(pauses>=requests.length*4,kind+' yields before most trial batches')
   assert.deepEqual(requests.map(stripIds),(plain as Draft[]).map(stripIds),kind+' requests are byte-identical')
  }
 }finally{await f.dispose()}
})

test('WR-07: setting requests use the artifacts present when step 16 starts, even when world entries commit meanwhile',async()=>{
 const f=await toDetectWorld({settings:0,entity:0})
 try{
  const c=f.controller as unknown as Planner,sent:{request:ImportAiRequest;worlds:number}[]=[],base=f.handler()
  let start:ImportSession['artifacts']|undefined
  f.setAi(async r=>{start??=c.session.artifacts;if(settingsLane(r))sent.push({request:r,worlds:c.session.artifacts.filter(a=>a.kind==='world'&&a.origin!=='source').length});return base(r)})
  await f.act('wizard-next');await waitFor(f,leftWorld)
  assert.ok(start);assert.ok(sent.some(x=>x.worlds>0),'some setting batch was sent after a world entry committed')
  for(const kind of ['theme','style','goldenFinger','trope']){
   const expected=[...proto.settingsPlan.call(c,c.session,kind,Infinity,start)].filter((r):r is Draft=>typeof r!=='symbol').map(content).sort()
   assert.deepEqual(sent.filter(x=>x.request.kind===kind).map(x=>content(x.request)).sort(),expected,kind+' requests come from the frozen artifacts')
  }
 }finally{await f.dispose()}
})

test('WR-06a: skipping a setting while it plans stops its planning and sends none of its batches',async()=>{
 const f=await toDetectWorld(),probe=instrument()
 try{
  const sent:ImportAiRequest[]=[],base=f.handler();f.setAi(async r=>{sent.push(r);return base(r)})
  await f.act('wizard-next')
  for(let i=0;i<4000&&!probe.slices.some(s=>s.kind==='theme'&&probe.yields.count>0);i++)await sleep(5)
  await f.act('wizard-task',{taskId:'g-theme',op:'skip'})
  const at=probe.slices.filter(s=>s.kind==='theme').length
  const v=await waitFor(f,leftWorld)
  assert.ok(probe.slices.filter(s=>s.kind==='theme').length<=at+1,'theme stops trial batching after the skip')
  assert.ok(!sent.some(r=>settingsLane(r)&&r.kind==='theme'),'no theme batch was sent')
  const task=(id:string)=>v.wizard!.tasks.find(t=>t.id===id)!
  assert.equal(task('g-theme').state,'skipped');for(const id of ['g-style','g-goldenfinger','g-trope'])assert.equal(task(id).state,'done',id)
 }finally{probe.restore();await f.dispose()}
})

test('WR-06b: pausing while settings plan stops planning at once; resuming finishes step 16',async()=>{
 const f=await toDetectWorld(),probe=instrument()
 try{
  await f.act('wizard-next')
  for(let i=0;i<4000&&probe.yields.count<4;i++)await sleep(5)
  const t=performance.now();await f.act('pause');const pauseMs=performance.now()-t
  const after=probe.calls.next;await sleep(300)
  console.log('WR-06b pause ms',Math.round(pauseMs))
  assert.ok(probe.calls.next<=after+4,'no planner continues after the pause');assert.equal(f.controller.active,0,'background work drained')
  await f.act('resume',{consent:true});const v=await waitFor(f,leftWorld)
  assert.notEqual(v.wizard!.step,'import-world');assert.ok(!v.wizard!.tasks.some(t=>t.state==='failed'))
 }finally{probe.restore();await f.dispose()}
})

test('WR-08: two planning slices never start in the same event-loop iteration',async()=>{
 const f=await toDetectWorld(),probe=instrument()
 try{
  await f.act('wizard-next');await waitFor(f,leftWorld)
  const ticks=probe.slices.map(s=>s.tick),same=ticks.filter((t,i)=>i>0&&t===ticks[i-1]).length
  assert.ok(probe.slices.length>20);assert.equal(same,0,`${same} slices shared an iteration with the previous one`)
 }finally{probe.restore();await f.dispose()}
})

test('WR-09: retrying the world kind from step 21 plans settings again in slices and finishes',async()=>{
 const f=await toDetectWorld({settings:0,entity:0})
 try{
  await f.act('wizard-next');await toStep(f,'verify')
  const probe=instrument()
  try{
   await f.act('wizard-retry-kind',{kind:'world'});const v=await waitFor(f,leftWorld)
   assert.notEqual(v.wizard!.step,'import-world');assert.ok(probe.yields.count>10,'re-planned in slices');assert.ok(!v.wizard!.tasks.some(t=>t.state==='failed'))
  }finally{probe.restore()}
 }finally{await f.dispose()}
})
