import assert from 'node:assert/strict'
import {test} from 'node:test'
import {fixture,legacySceneFixture,source,rosterAi,entityResult,toImportChar,toImportScene,toImportItem,sleep} from '../helpers/novel-import-wizard-fixture'
import type {ImportAiRequest,ImportSession} from '../../desktop/shared/novel-import'

async function until(check:()=>boolean|Promise<boolean>){const end=performance.now()+5000;while(!await check()){assert.ok(performance.now()<end,'controlled commit window reached');await sleep(5)}}
type Kind='character'|'scene'|'item'
const importStep={character:'import-char',scene:'import-scene',item:'import-item'} as const,nextStep={character:'detect-scene',scene:'verify',item:'verify'} as const,profileField={character:'abilities',scene:'backstory',item:'appearance'} as const
async function slowCommitFixture(kind:Kind){
 const names=Array.from({length:64},(_,i)=>'合并保存角色'+String(i).padStart(2,'0')),body=names.map((name,i)=>`第${i+1}章 篇${i}\n\n${name}保留完整资料。\n\n`).join('')
 const f=await (kind==='scene'?legacySceneFixture:fixture)([source(body,'正文.txt','f-body')],rosterAi({['roster:'+kind]:r=>({roster:r.units.flatMap(u=>names.filter(name=>u.text.includes(name)).map(name=>({name,aliases:[],...(kind==='character'?{roleType:'SUPPORTING' as const}:kind==='item'?{itemType:'器物',important:true,category:'item' as const}:{}),evidence:{unitId:u.id,quote:name}})))})})),base=f.handler()
 let open=false,releaseDisk!:()=>void,rejectDisk!:(error:Error)=>void,held=false,writes=0
 const disk=new Promise<void>((r,j)=>{releaseDisk=r;rejectDisk=j}),pending=new Map<string,{r:ImportAiRequest;resolve:()=>void;reject:()=>void}>(),canceled=new Set<string>()
 f.setAi(async r=>{if(r.intent!=='entity')return base(r);if(!open)try{await new Promise<void>((resolve,reject)=>pending.set(r.operationId,{r,resolve,reject:()=>reject(new DOMException('已取消','AbortError'))}))}finally{pending.delete(r.operationId)}return entityResult(r,():Record<string,string>=>kind==='character'?{roleType:r.entityTarget!.roleType!,abilities:'完整合成能力-'+r.entityTarget!.id}:{[profileField[kind]]:'完整合成能力-'+r.entityTarget!.id})})
 f.options.cancelAi=async id=>{const p=pending.get(id);if(p){canceled.add(id);p.reject()}}
 const c=f.controller as unknown as {session:ImportSession;stopping:boolean;operations:Set<string>;save(s?:ImportSession,notify?:boolean,onCommit?:()=>void):Promise<void>},save=c.save.bind(c)
 c.save=async(s,notify,onCommit)=>{const active=s??c.session;if(active?.wizard?.step===importStep[kind]&&active.wizard.tasks.some(t=>t.state==='done')){writes++;if(!held){held=true;await disk}}return save(s,notify,onCommit)}
 return {f,c,pending,canceled,get writes(){return writes},releaseDisk,rejectDisk,openAll(){open=true;for(const p of pending.values())p.resolve()},async start(){await (kind==='character'?toImportChar(f):kind==='scene'?toImportScene(f):toImportItem(f));await until(()=>pending.size===31);const first=[...pending.values()];for(const p of first.slice(0,8))p.resolve();await until(()=>held);assert.equal(c.session.wizard!.tasks.filter(t=>t.state==='done').length,8);return first.slice(8)}}
}

for(const kind of ['character','scene','item'] as const){
test('CP-16a '+kind+': slow first save coalesces the other 23 results into one real journal write',async()=>{
 const p=await slowCommitFixture(kind),now=Date.now
 try{const rest=await p.start();Date.now=()=>now()+5000;for(const r of rest)r.resolve();await until(()=>rest.every(r=>!p.c.operations.has(r.r.operationId)));await new Promise<void>(r=>setImmediate(r));p.releaseDisk();await until(async()=>(await p.f.journal()).wizard!.tasks.filter(t=>t.state==='done').length===31);assert.equal(p.writes,2,'eight and twenty-three results need two complete journal writes')
  p.openAll();Date.now=now;const v=await p.f.settle(),s=await p.f.journal();assert.equal(v.wizard!.step,nextStep[kind]);assert.equal(s.artifacts.length,64);assert.ok(s.wizard!.tasks.every(t=>t.state==='done'));assert.deepEqual(s.artifacts.map(a=>a.id).sort(),s.wizard!.candidates[kind]!.map(c=>c.id).sort());for(const a of s.artifacts)assert.equal(a.facts[profileField[kind]],'完整合成能力-'+a.id)
 }finally{Date.now=now;p.releaseDisk();p.openAll();await p.f.dispose()}
})

test('CP-16b '+kind+': pause waits for slow IO, cancels actual pending AI and discards uncommitted buffered results',async()=>{
 const p=await slowCommitFixture(kind),now=Date.now
 try{const rest=await p.start();Date.now=()=>now()+5000;for(const r of rest.slice(0,10))r.resolve();await until(()=>p.pending.size===20&&rest.slice(0,10).every(r=>!p.c.operations.has(r.r.operationId)));await new Promise<void>(r=>setImmediate(r));let stopped=false;const pause=p.f.controller.act({type:'pause',id:p.c.session.id,revision:p.c.session.revision}).then(v=>{stopped=true;return v});await new Promise<void>(r=>setImmediate(r));assert.equal(stopped,false,'pause must wait for the real write barrier');p.releaseDisk();await pause;Date.now=now
  const s=await p.f.journal(),done=s.wizard!.tasks.filter(t=>t.state==='done').map(t=>t.candidateId!);assert.equal(done.length,8);assert.equal(s.artifacts.length,8);assert.deepEqual(p.canceled,new Set(s.runtimePauseProof!.calls.map(c=>c.operationId)));assert.equal(s.runtimePauseProof!.state,'drained');assert.ok(s.runtimePauseProof!.calls.length>=20&&s.runtimePauseProof!.calls.length<=31);assert.ok(Object.values(s.runtimePauseProof!.remaining).every(n=>n===0));assert.equal(p.c.operations.size,0)
  p.openAll();await p.f.act('resume',{consent:true});const v=await p.f.settle(),result=await p.f.journal();assert.equal(v.wizard!.step,nextStep[kind]);assert.equal(result.artifacts.length,64);for(const id of done)assert.equal(p.f.requests.filter(r=>r.intent==='entity'&&r.entityTarget!.id===id).length,1)
 }finally{Date.now=now;p.releaseDisk();p.openAll();await p.f.dispose()}
})

test('CP-16c '+kind+': a rejected save stops scheduling and cannot report the whole role list as successful',async()=>{
 const p=await slowCommitFixture(kind)
 try{await p.start();const startedBeforeFailure=p.f.requests.filter(r=>r.intent==='entity').length;p.rejectDisk(Error('SYNTHETIC-WRITE-FAILURE'));await until(()=>p.f.controller.active===0);const s=await p.f.journal();assert.equal(s.phase,'failed');assert.equal(p.f.requests.filter(r=>r.intent==='entity').length,startedBeforeFailure);assert.ok(s.wizard!.tasks.some(t=>t.state!=='done'));assert.equal(p.pending.size,0);assert.equal(p.c.operations.size,0)
 }finally{p.releaseDisk();p.openAll();await p.f.dispose()}
})
}
