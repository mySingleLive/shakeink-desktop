import assert from 'node:assert/strict'
import {test} from 'node:test'
import {filesF,fullAi,legacySceneFixture,rosterAi,sleep,toVerify,injectJournalEdit,type Ai} from '../helpers/novel-import-wizard-fixture'
import type {ImportAiRequest,ImportAiResult} from '../../desktop/shared/novel-import'

/* docs/539–540 VS-10..VS-44: wizard step 21 on chapter packets, automatic repairs, [修复] and saving. Synthetic data only. */
const isReview=(r:ImportAiRequest)=>r.phase==='review'
/** A review reply reporting that the first cited character's text contradicts the body. */
function contradiction(r:ImportAiRequest,value='另一种说法'):ImportAiResult|undefined{
 const a=r.artifacts.find(a=>a.kind==='character'),u=a&&r.units.find(u=>u.text.includes(a.name))
 if(!a||!u)return undefined
 return {conflicts:[{id:'x',type:'setting-body',kind:'character',entity:a.name,field:'text',source:{text:a.text,value:a.text,artifactId:a.id},candidate:{text:value,value},evidence:[{unitId:u.id,quote:a.name}],status:'pending',hash:'h'}]}
}
async function verifyFixture(review:(r:ImportAiRequest,base:Ai)=>Promise<ImportAiResult>){
 const f=await legacySceneFixture(filesF(),rosterAi());const base=fullAi(f)
 f.setAi(async r=>isReview(r)?review(r,base):base(r))
 return f
}

test('VS-10/VS-11/VS-12: wizard review uses the light lane on chapter packets with projected materials',async()=>{
 const seen:ImportAiRequest[]=[];let running=0,peak=0
 const f=await verifyFixture(async r=>{seen.push(r);running++;peak=Math.max(peak,running);await sleep(20);running--;return {conflicts:[]}})
 try{
  const v=await toVerify(f)
  assert.ok(seen.length>0);assert.ok(seen.every(r=>r.executionLane==='wizard-review-v1'),'every review is on the lane')
  assert.ok(seen.every(r=>r.reviewProjection?.length===r.artifacts.length),'materials carry projections')
  assert.ok(seen.every(r=>r.artifacts.every(a=>a.evidence.every(e=>r.units.some(u=>u.id===e.unitId)))),'materials cite the packet')
  assert.ok(!f.requests.some(r=>r.phase==='review'&&!r.executionLane),'no full-material fact packets')
  assert.equal(v.wizard!.stepState.verify,'waiting');assert.ok(v.wizard!.checks!.every(c=>c.ok),JSON.stringify(v.wizard!.checks))
  if(seen.length>1)assert.ok(peak>1,'packets run in parallel');assert.ok(peak<=31)
 }finally{await f.dispose()}
})
test('VS-13: a packet that fails twice then succeeds is committed',async()=>{
 let calls=0
 const f=await verifyFixture(async()=>{calls++;if(calls<=2)throw Error('模型返回结构不完整（conflicts.0.kind）');return {conflicts:[]}})
 try{
  const v=await toVerify(f),c=v.wizard!.checks!.find(c=>c.key==='consistency')!
  assert.equal(c.ok,true,c.detail);assert.deepEqual(v.wizard!.verify!.failedPackets,[])
 }finally{await f.dispose()}
})
test('VS-14/VS-30/VS-31/VS-40: a packet failing 3 times is recorded; [修复] retries without limit; saving still works',async()=>{
 let broken=true,calls=0
 const f=await verifyFixture(async()=>{calls++;if(broken)throw Error('Server Error');return {conflicts:[]}})
 try{
  let v=await toVerify(f),c=v.wizard!.checks!.find(c=>c.key==='consistency')!
  assert.equal(c.ok,false);assert.match(c.detail,/复核未完成/);assert.ok(v.wizard!.verify!.failedPackets.every(p=>p.attempts===3))
  assert.equal(v.wizard!.stepState.verify,'waiting')
  for(let i=0;i<4;i++){const before=calls;await f.act('wizard-verify-repair');v=await f.settle();assert.ok(calls-before>=3,'each repair retries the packet 3 times')}
  broken=false;await f.act('wizard-verify-repair');v=await f.settle()
  assert.ok(v.wizard!.checks!.every(c=>c.ok),JSON.stringify(v.wizard!.checks))
 }finally{await f.dispose()}
 // VS-40: with a lasting failure the work can still be saved.
 const g=await verifyFixture(async()=>{throw Error('Server Error')})
 try{
  const v=await toVerify(g);assert.equal(v.wizard!.checks!.find(c=>c.key==='consistency')!.ok,false)
  await g.act('wizard-next');const done=await g.settle();assert.equal(done.phase,'completed',done.error);assert.ok(g.published)
 }finally{await g.dispose()}
})
test('VS-20: a setting that contradicts the body is fixed to the body, recorded, and the work saves',async()=>{
 let first=true
 const f=await verifyFixture(async r=>{if(first){const c=contradiction(r,'沈砚是渡口的旅人。');if(c){first=false;return c}}return {conflicts:[]}})
 try{
  const v=await toVerify(f),j=await f.journal(),fixed=j.conflicts.find(c=>c.resolution==='auto-body')
  assert.ok(fixed,'conflict auto-resolved');assert.equal(j.artifacts.find(a=>a.id===fixed!.source.artifactId)!.text,'沈砚是渡口的旅人。')
  assert.equal(v.wizard!.verify!.fixed.length,1);assert.ok(v.wizard!.checks!.every(c=>c.ok),JSON.stringify(v.wizard!.checks))
  assert.ok(j.decisions.some(d=>d.conflictId===fixed!.id))
  await f.act('wizard-next');const done=await f.settle();assert.equal(done.phase,'completed',done.error)
  assert.ok(f.published!.artifacts.some(a=>a.text==='沈砚是渡口的旅人。'),'the fixed text is published')
 }finally{await f.dispose()}
})
test('VS-21/VS-40: a repair that keeps failing stays pending after 3 attempts; [修复] grants 3 more; saving keeps the import',async()=>{
 let reviews=0,targeted=0
 const f=await verifyFixture(async r=>{reviews++;const one=r.artifacts.length===1;if(one)targeted++;return contradiction(r)??{conflicts:[]}})
 try{
  let v=await toVerify(f);const c=v.wizard!.checks!.find(c=>c.key==='consistency')!
  assert.equal(c.ok,false);assert.match(c.detail,/矛盾待处理/)
  const j=await f.journal(),pending=j.conflicts.filter(c=>c.status==='pending');assert.ok(pending.length>0)
  assert.ok(v.wizard!.verify!.repairs.every(r=>r.attempts===3),JSON.stringify(v.wizard!.verify!.repairs))
  const before=targeted;await f.act('wizard-verify-repair');v=await f.settle();assert.ok(targeted-before>=3,'a manual repair tries again')
  const texts=new Map((await f.journal()).artifacts.map(a=>[a.id,a.text]))
  await f.act('wizard-next');const done=await f.settle();assert.equal(done.phase,'completed',done.error)
  for(const a of f.published!.artifacts.filter(a=>a.kind==='character'))assert.equal(a.text,texts.get(a.id),'unfixed fields keep the imported value')
  assert.ok(f.published!.conflicts.every(c=>c.status==='resolved'))
  void reviews
 }finally{await f.dispose()}
})
test('VS-24/VS-42: structure faults are fixed deterministically, listed, and the published work omits dropped items',async()=>{
 const f=await verifyFixture(async()=>({conflicts:[]}))
 try{
  await toVerify(f)
  const c=await injectJournalEdit(f,j=>{const a=j.artifacts.find(a=>a.kind==='character')!;a.facts.relationships=JSON.stringify([{target:'无名',description:'旧识',characterId:'c-ffffffffffffffff'}])})
  const v0=(await c.act({type:'current'})).view!;await c.act({type:'resume',id:v0.id,revision:v0.revision,consent:true});const v=await f.settle()
  assert.ok(v.wizard!.checks!.find(x=>x.key==='relationships')!.ok,JSON.stringify(v.wizard!.checks))
  assert.ok(v.wizard!.dropped.some(d=>d.kind==='verify'&&/关系指向未导入的角色/.test(d.reason)))
  await f.act('wizard-next');const done=await f.settle();assert.equal(done.phase,'completed',done.error)
  for(const a of f.published!.artifacts.filter(a=>a.kind==='character'&&a.facts.relationships))assert.ok(!JSON.parse(a.facts.relationships).some((r:{characterId?:string})=>r.characterId==='c-ffffffffffffffff'))
 }finally{await f.dispose()}
})
test('VS-33: the repair action is refused outside step 21',async()=>{
 const f=await verifyFixture(async()=>({conflicts:[]}))
 try{await f.act('choose',{mode:'files'});await assert.rejects(f.act('wizard-verify-repair'),/没有可修复/)}finally{await f.dispose()}
})
test('VS-12: long text is sent truncated with its range and long facts are not sent',async()=>{
 const seen:ImportAiRequest[]=[]
 const f=await verifyFixture(async r=>{seen.push(r);return {conflicts:[]}})
 try{
  await toVerify(f)
  const c=await injectJournalEdit(f,j=>{const a=j.artifacts.find(a=>a.kind==='character')!;a.text='长'.repeat(2500);a.facts.backstory='背'.repeat(1600)})
  seen.length=0;const v0=(await c.act({type:'current'})).view!;const j=await f.journal()
  const a=j.artifacts.find(a=>a.kind==='character'&&a.text.length===2500)!;await injectJournalEdit(f,x=>{x.coverage.review=[]})
  await c.act({type:'resume',id:v0.id,revision:(await c.act({type:'current'})).view!.revision,consent:true});await f.settle()
  const sent=seen.flatMap(r=>r.artifacts.map((x,i)=>({x,p:r.reviewProjection![i]}))).find(e=>e.x.id===a.id)
  assert.ok(sent,'the long artifact was reviewed');assert.equal(sent!.x.text.length,2000);assert.deepEqual(sent!.p.textRange,{start:0,end:2000});assert.equal(sent!.p.fullTextLength,2500);assert.equal(sent!.x.facts.backstory,undefined)
 }finally{await f.dispose()}
})
test('VS-15: an authorization failure stops the review at once without retries',async()=>{
 let calls=0
 const f=await verifyFixture(async()=>{calls++;throw Error('所选模型的密钥不可用，请在设置中重新配置')})
 try{const v=await toVerify(f);assert.ok(calls<=31,`no retries after an authorization failure (${calls})`);assert.ok(v.wizard!.stepError,'the step records the stop');assert.equal(v.wizard!.checks!.find(c=>c.key==='consistency')!.ok,false)}finally{await f.dispose()}
})
test('VS-32: the repair action is refused while the review runs',async()=>{
 let release:(()=>void)|undefined
 const f=await verifyFixture(async()=>{await new Promise<void>(r=>{release=r});return {conflicts:[]}})
 try{
  const done=toVerify(f).catch(()=>undefined)
  for(let i=0;i<4000&&!release;i++)await sleep(5);assert.ok(release)
  await assert.rejects(f.act('wizard-verify-repair'));const t=setInterval(()=>release?.(),5);await done;clearInterval(t)
 }finally{await f.dispose()}
})
