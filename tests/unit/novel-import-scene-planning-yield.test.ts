// Compatibility: controller cases here use genuine versionless scene journals.
import assert from 'node:assert/strict'
import {test} from 'node:test'
import {legacySceneFixture,source,rosterAi,entityResult,model,review,toImportScene,sleep} from '../helpers/novel-import-wizard-fixture'
import type {ImportAiRequest,ImportAiResult,ImportSession,ImportResponse} from '../../desktop/shared/novel-import'

type Packet={request:Omit<ImportAiRequest,'operationId'|'models'>;keys:string[];facts:boolean}
type C={session:ImportSession;stageRequests(...args:any[]):Generator<Packet['request']>;review(s:ImportSession,e:number):Promise<void>;reviewWaves(s:ImportSession,e:number,p:Iterable<Packet>,order:string[]):Promise<void>;ai(...args:any[]):Promise<ImportAiResult>;launch(s:ImportSession,work:(epoch:number)=>Promise<void>):void;drainPdfWork():Promise<unknown>}
type F=Awaited<ReturnType<typeof legacySceneFixture>>
const internal=(f:F)=>f.controller as unknown as C
const empty=()=>({conflicts:[]} as ImportAiResult)
async function setup(){
 const base=rosterAi(),text='第一章 合成\n\n北城。'+'完整的合成正文。'.repeat(5600)
 const f=await legacySceneFixture([source(text,'正文.txt','f-body')],async r=>r.intent==='entity'?entityResult(r):base(r),{models:{text:model,review:{...review,contextWindow:8000}}})
 await toImportScene(f);await f.settle();const c=internal(f),s=c.session
 const packets=f.requests.filter(r=>r.phase==='review'&&r.instruction?.startsWith('核对资料与正文事实')).map(r=>{const {operationId:_id,models:_models,...request}=r;return {request,keys:r.units.map(u=>u.id),facts:false}})
 assert.ok(packets.length>31,'use real, unique original planner packets')
 s.phase='running';s.resumePhase='running';s.wizard!.stepState.verify='running';s.coverage.review=[];s.coverage.reviewFacts=[];delete s.semanticState;f.requests.length=0
 return {f,c,s,packets}
}
function job(c:C,s:ImportSession,work:()=>Promise<void>){
 const result=Promise.withResolvers<void>();void result.promise.catch(()=>{})
 c.launch(s,async()=>{try{await work();result.resolve()}catch(e){result.reject(e);throw e}})
 return result.promise
}
async function drained(f:F){for(let i=0;i<3000&&f.controller.active;i++)await sleep(5);assert.equal(f.controller.active,0,'real workflow/control jobs drain')}

test('PY01: the real current Promise completes before 31 original packets are prepared',async()=>{
 const {f,c,s}=await setup();let done:Promise<void>|undefined,control:Promise<void>|undefined,prepared=0,observed=Infinity,outbound=0,seenOutbound=Infinity
 const planner=c.stageRequests
 c.stageRequests=function*(...args:any[]){for(const packet of planner.apply(this,args)){prepared++;if(prepared===1)setImmediate(()=>{control=f.controller.act({type:'current'}).then(()=>{observed=prepared;seenOutbound=outbound})});yield packet}}
 f.setAi(async()=>{outbound++;return empty()})
 try{done=c.review(s,s.epoch);await done;await control;assert.ok(observed<31,'current completion, not merely callback start, must precede a full wave');assert.equal(seenOutbound,0)}
 finally{c.stageRequests=planner;await done?.catch(()=>{});await f.dispose()}
})

test('PY02: a real pause during original packet preparation drains its tracked workflow with zero dispatch',async()=>{
 const {f,c,s}=await setup(),planner=c.stageRequests,ai=c.ai;let prepared=0,entry=0,outbound=0,pause:Promise<ImportResponse>|undefined,done:Promise<void>|undefined
 const pending=new Map<string,()=>void>()
 c.stageRequests=function*(...args:any[]){for(const packet of planner.apply(this,args)){prepared++;if(prepared===1)setImmediate(()=>{pause=f.controller.act({type:'pause',id:s.id,revision:s.revision});void pause.catch(()=>{})});yield packet}}
 c.ai=async function(...args:any[]){entry++;return ai.apply(this,args)}
 f.setAi(async r=>{outbound++;return new Promise<ImportAiResult>((_resolve,reject)=>pending.set(r.operationId,()=>reject(new DOMException('合成取消','AbortError'))))});f.options.cancelAi=async id=>pending.get(id)?.()
 const before=structuredClone({artifacts:s.artifacts,prose:s.workingProse,decisions:s.decisions}),epoch=s.epoch
 try{done=job(c,s,()=>c.review(s,epoch));await assert.rejects(done);assert.ok(pause);await pause;await drained(f);assert.ok(prepared<31);assert.ok(s.epoch>epoch);assert.equal(entry,0);assert.equal(outbound,0);assert.deepEqual(s.coverage.review,[]);assert.deepEqual({artifacts:s.artifacts,prose:s.workingProse,decisions:s.decisions},before)}
 finally{for(const reject of pending.values())reject();await pause?.catch(()=>{});await done?.catch(()=>{});c.stageRequests=planner;c.ai=ai;await f.dispose()}
})

test('PY03: real pause at the full-wave or short-tail boundary captures epoch before any ai entry',async t=>{
 for(const count of [31,2])await t.test(String(count),async()=>{
  const {f,c,s,packets}=await setup(),ai=c.ai;let entry=0,outbound=0,pause:Promise<ImportResponse>|undefined,done:Promise<void>|undefined
  const pending=new Map<string,()=>void>(),epoch=s.epoch
  const values=packets.slice(0,count),iterable={*[Symbol.iterator](){for(const [index,packet]of values.entries()){if(index===count-1)setImmediate(()=>{pause=f.controller.act({type:'pause',id:s.id,revision:s.revision});void pause.catch(()=>{})});yield packet}}}
  c.ai=async function(...args:any[]){entry++;return ai.apply(this,args)}
  f.setAi(async r=>{outbound++;return new Promise<ImportAiResult>((_resolve,reject)=>pending.set(r.operationId,()=>reject(new DOMException('合成取消','AbortError'))))});f.options.cancelAi=async id=>pending.get(id)?.()
  try{done=job(c,s,()=>c.reviewWaves(s,epoch,iterable,s.workingUnits!.map(u=>u.id)));await assert.rejects(done);assert.ok(pause);await pause;await drained(f);assert.ok(s.epoch>epoch);assert.equal(entry,0,'not merely zero eventual accepted results');assert.equal(outbound,0);assert.deepEqual(s.coverage.review,[]);assert.equal(s.runtimePauseProof?.calls.length,0);assert.equal(s.runtimePauseProof?.state,'missed','zero calls do not fabricate a drained-call proof')}
  finally{for(const reject of pending.values())reject();await pause?.catch(()=>{});await done?.catch(()=>{});c.ai=ai;await f.dispose()}
 })
})

test('PY04: rejected stop capture releases its gate and leaves a later empty wave usable',async t=>{
 for(const mode of ['pdf-drain','wrong-session'] as const)await t.test(mode,async()=>{
  const {f,c,s}=await setup(),drain=c.drainPdfWork;let calls=0
  f.setAi(async()=>{calls++;return empty()})
  try{
   if(mode==='pdf-drain')c.drainPdfWork=async()=>{throw Error('合成PDF排空失败')}
   const id=mode==='wrong-session'?s.id.slice(0,-1)+(s.id.endsWith('0')?'1':'0'):s.id
   await assert.rejects(f.controller.act({type:'pause',id,revision:s.revision}));c.drainPdfWork=drain
   await c.reviewWaves(s,s.epoch,[],[]);assert.equal(calls,0);assert.equal(f.controller.active,0)
  }finally{c.drainPdfWork=drain;await f.dispose()}
 })
})
