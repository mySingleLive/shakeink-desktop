import assert from 'node:assert/strict'
import {test} from 'node:test'
import {filesF,fullAi,legacySceneFixture,rosterAi,toVerify,injectJournalEdit,review,type Ai} from '../helpers/novel-import-wizard-fixture'
import {runImportAi} from '../../desktop/service/novel-import-ai'
import type {ImportAiRequest,ImportAiResult,ImportConflict,ImportView} from '../../desktop/shared/novel-import'

/* docs/557–558 CC-01..CC-20: wizard step-21 conflict details and the three decisions. Synthetic data only. */
const isReview=(r:ImportAiRequest)=>r.phase==='review'
type Make=(r:ImportAiRequest)=>Partial<ImportConflict>|undefined
/** A review reply with one conflict against the first cited character. Targeted (auto-repair) reviews keep reporting it. */
function reply(r:ImportAiRequest,make:Make,which:(r:ImportAiRequest)=>ImportAiRequest['artifacts'][number]|undefined=r=>r.artifacts.find(a=>a.kind==='character')):ImportAiResult{
 const a=which(r),u=a&&r.units.find(u=>u.text.includes(a.name));if(!a||!u)return {conflicts:[]}
 const extra=make(r);if(!extra)return {conflicts:[]}
 return {conflicts:[{id:'x',type:'setting-body',kind:'character',entity:a.name,field:'text',source:{text:a.text,value:a.text,artifactId:a.id},candidate:{text:'正文说法',value:'正文说法'},evidence:[{unitId:u.id,quote:a.name}],status:'pending',hash:'h',...extra}]}
}
/** The first packet reports the conflict; afterwards only targeted reviews of the same artifact report it again. */
async function conflictFixture(make:Make,opts:{which?:(r:ImportAiRequest)=>ImportAiRequest['artifacts'][number]|undefined;always?:boolean}={}){
 const f=await legacySceneFixture(filesF(),rosterAi());const base=fullAi(f);let first=true,held:string|undefined;const state={reviews:0}
 f.setAi(async r=>{
  if(!isReview(r))return base(r)
  state.reviews++
  if(first||opts.always||held&&r.artifacts.length===1&&r.artifacts[0].id===held){const out=reply(r,make,opts.which);if(out.conflicts!.length){first=false;held=out.conflicts![0].source.artifactId??out.conflicts![0].candidate.artifactId}return out}
  return {conflicts:[]}
 })
 return Object.assign(f,{state})
}
const consistency=(v:ImportView)=>v.wizard!.checks!.find(c=>c.key==='consistency')!
async function decide(f:Awaited<ReturnType<typeof conflictFixture>>,extra:Record<string,unknown>){const v=await f.view();return f.act('resolve',{conflictId:v.conflictDetail!.conflictId,...extra})}
async function saveAndRead(f:Awaited<ReturnType<typeof conflictFixture>>){await f.act('wizard-next');const done=await f.settle();assert.equal(done.phase,'completed',done.error);return f.published!}

test('CC-01/CC-05: a body-body review conflict on a packet artifact becomes setting-body with a readable detail',async()=>{
 const f=await conflictFixture(()=>({type:'body-body',reason:'资料写是旅人，原文写是船夫'}))
 try{
  const v=await toVerify(f),j=await f.journal(),c=j.conflicts.find(c=>c.status==='pending')!
  assert.equal(c.type,'setting-body');assert.equal(c.kind,'character');const a=j.artifacts.find(a=>a.id===c.source.artifactId)!;assert.equal(c.entity,a.name)
  const d=v.conflictDetail!;assert.ok(d,'detail exists');assert.equal(d.conflictId,c.id);assert.equal(d.index,1);assert.equal(d.total,j.conflicts.filter(c=>c.status==='pending').length)
  assert.equal(d.fieldLabel,'内容');assert.equal(d.kindLabel,'角色');assert.equal(d.entity,a.name);assert.equal(d.current,a.text);assert.equal(d.proposed,'正文说法');assert.equal(d.reason,'资料写是旅人，原文写是船夫')
  assert.ok(d.evidence.length>0);for(const e of d.evidence){assert.doesNotMatch(e.location,/working-/);assert.match(e.location,/第|章|卷|起|承|转|终/u)}
  assert.deepEqual(d.choices.map(o=>[o.choice,o.available]),[['inferred',true],['source',true],['merge',true]])
 }finally{await f.dispose()}
})
test('CC-02: a conflict naming the artifact only on the candidate side is swapped',async()=>{
 const f=await conflictFixture(r=>{const a=r.artifacts.find(a=>a.kind==='character')!;return {type:'body-body',source:{text:'正文说法',value:'正文说法'},candidate:{text:a.text,value:a.text,artifactId:a.id}}})
 try{
  await toVerify(f);const j=await f.journal(),c=j.conflicts.find(c=>c.status==='pending')!
  const a=j.artifacts.find(a=>a.id===c.source.artifactId)!;assert.ok(a);assert.equal(c.source.value,a.text);assert.equal(c.candidate.value,'正文说法')
 }finally{await f.dispose()}
})
test('CC-03: a conflict citing no artifact is dropped and counted',async()=>{
 const f=await conflictFixture(()=>({type:'body-body',source:{text:'甲',value:'甲'},candidate:{text:'乙',value:'乙'}}))
 try{const v=await toVerify(f);assert.equal(v.conflicts.filter(c=>c.status==='pending').length,0);assert.ok(v.wizard!.verify!.droppedConflicts>=1);assert.equal(consistency(v).ok,true)}finally{await f.dispose()}
})
test('CC-04: reason is kept up to 300 characters',async()=>{
 const f=await conflictFixture(()=>({reason:'差'.repeat(350)}))
 try{const v=await toVerify(f);assert.equal(v.conflictDetail!.reason,'差'.repeat(300))}finally{await f.dispose()}
})
test('CC-06/CC-20: 以正文为准 resolves at once, passes the check, saves the body value',async()=>{
 const f=await conflictFixture(()=>({}))
 try{
  const v=await toVerify(f);assert.equal(v.phase,'conflicts');const id=v.conflictDetail!.conflictId,before=f.requests.length,coverage=(await f.journal()).coverage
  await decide(f,{choice:'inferred'});const after=await f.settle()
  assert.equal(f.requests.length,before,'no model request for a decision')
  const j=await f.journal(),c=j.conflicts.find(c=>c.id===id)!;assert.equal(c.status,'resolved');assert.equal(c.resolution,'inferred')
  const a=j.artifacts.find(a=>a.id===c.source.artifactId)!;assert.equal(a.text,'正文说法');assert.ok(j.decisions.some(d=>d.conflictId===id))
  assert.ok(j.semanticState!.locks.some(l=>l.artifactId===a.id&&l.field==='text'&&l.value==='正文说法'))
  assert.deepEqual(j.coverage,coverage,'review coverage is kept')
  assert.equal(after.phase,'select');assert.equal(consistency(after).ok,true,consistency(after).detail);assert.equal(after.conflictDetail,undefined)
  const published=await saveAndRead(f);assert.equal(published.artifacts.find(x=>x.id===a.id)!.text,'正文说法')
 }finally{await f.dispose()}
})
test('CC-07: 保留现在的设定 needs no explanation and saves the original value',async()=>{
 const f=await conflictFixture(()=>({}))
 try{
  const v=await toVerify(f),j0=await f.journal(),c0=j0.conflicts.find(c=>c.id===v.conflictDetail!.conflictId)!,original=j0.artifacts.find(a=>a.id===c0.source.artifactId)!.text,before=f.requests.length
  await decide(f,{choice:'source'});const after=await f.settle();assert.equal(f.requests.length,before)
  assert.equal(consistency(after).ok,true);const published=await saveAndRead(f);assert.equal(published.artifacts.find(x=>x.id===c0.source.artifactId)!.text,original)
 }finally{await f.dispose()}
})
test('CC-08/CC-16: 自己填写 saves the author text; a blank one is refused without change',async()=>{
 const f=await conflictFixture(()=>({}))
 try{
  const v=await toVerify(f),id=v.conflictDetail!.conflictId
  await assert.rejects(decide(f,{choice:'merge',mergedText:'   '}),/请填写合并后的设定/);assert.equal((await f.journal()).conflicts.find(c=>c.id===id)!.status,'pending')
  await decide(f,{choice:'merge',mergedText:'作者填写的资料'});const after=await f.settle();assert.equal(consistency(after).ok,true)
  const j=await f.journal(),c=j.conflicts.find(c=>c.id===id)!;const published=await saveAndRead(f);assert.equal(published.artifacts.find(x=>x.id===c.source.artifactId)!.text,'作者填写的资料')
 }finally{await f.dispose()}
})
test('CC-09: two conflicts on different artifacts are handled one after the other',async()=>{
 const f=await conflictFixture(()=>({}))
 try{
  await toVerify(f)
  await injectJournalEdit(f,j=>{const o=j.conflicts.find(c=>c.status==='pending')!,b=j.artifacts.find(a=>a.kind==='character'&&a.id!==o.source.artifactId&&a.origin!=='source')!;j.conflicts.push({...structuredClone(o),id:'conflict-second',hash:'second',entity:b.name,source:{text:b.text,value:b.text,artifactId:b.id}});j.wizard!.deferredConflicts.push('conflict-second')})
  let v=await f.view();const pending=v.conflicts.filter(c=>c.status==='pending').length;assert.equal(pending,2);assert.equal(v.conflictDetail!.total,2)
  await decide(f,{choice:'source'});v=await f.settle();assert.equal(v.phase,'conflicts');assert.equal(v.conflictDetail!.total,1);assert.equal(consistency(v).ok,false)
  await decide(f,{choice:'inferred'});v=await f.settle()
  assert.equal(v.phase,'select');assert.equal(consistency(v).ok,true);await saveAndRead(f)
 }finally{await f.dispose()}
})
test('CC-10: one decision resolves every pending conflict on the same artifact field, each recorded',async()=>{
 const f=await conflictFixture(()=>({}))
 try{
  await toVerify(f)
  const c=await injectJournalEdit(f,j=>{const o=j.conflicts.find(c=>c.status==='pending')!;j.conflicts.push({...structuredClone(o),id:'conflict-dup',hash:'dup',candidate:{text:'另一说法',value:'另一说法'}});j.wizard!.deferredConflicts.push('conflict-dup')})
  void c;const before=(await f.journal()).decisions.length
  await decide(f,{choice:'source'});const j=await f.journal()
  assert.ok(j.conflicts.every(c=>c.status==='resolved'));assert.equal(j.decisions.length-before,2)
 }finally{await f.dispose()}
})
test('CC-11: a decided field is not reopened by [修复] while the review keeps reporting it',async()=>{
 const f=await conflictFixture(()=>({}),{always:true})
 try{
  await toVerify(f);await decide(f,{choice:'source'});let v=await f.settle();assert.equal(consistency(v).ok,true)
  await injectJournalEdit(f,j=>{j.coverage.review=[];j.wizard!.verify!.repairable=true})
  const cur=(await f.controller.act({type:'current'})).view!;await f.controller.act({type:'resume',id:cur.id,revision:cur.revision,consent:true});v=await f.settle()
  assert.ok(f.state.reviews>1);assert.equal(v.conflicts.filter(c=>c.status==='pending').length,0,'not reopened');assert.equal(consistency(v).ok,true,consistency(v).detail)
  await saveAndRead(f)
 }finally{await f.dispose()}
})
test('CC-12: a lock on a v2 field passes the real adapter check on later review requests',async()=>{
 const f=await conflictFixture(()=>({}))
 // Every review request also goes through the real adapter with a stub generator, so its lock check runs (558 review must-fix 2).
 const adapterErrors:string[]=[];let checked=0
 f.setAi((prev=>async(r:ImportAiRequest)=>{if(isReview(r)){try{await runImportAi(r as never,new AbortController().signal,{resolve:async()=>review,assert:async()=>undefined,generate:async()=>({conflicts:[]})} as never);checked++}catch(error){adapterErrors.push(String(error))}}return prev(r)})(f.handler()))
 try{
  await toVerify(f)
  await injectJournalEdit(f,j=>{const c=j.conflicts.find(c=>c.status==='pending')!,a=j.artifacts.find(a=>a.id===c.source.artifactId)!;a.facts.backstory='旧背景';c.field='backstory';c.source={...c.source,text:'旧背景',value:'旧背景'};c.candidate={text:'正文背景',value:'正文背景'}})
  let v=await f.view();assert.equal(v.conflictDetail!.fieldLabel,'背景')
  await decide(f,{choice:'merge',mergedText:'作者背景'});v=await f.settle();assert.equal(consistency(v).ok,true)
  const j=await f.journal(),lock=j.semanticState!.locks.find(l=>l.field==='backstory');assert.ok(lock,'v2 lock written')
  adapterErrors.length=0;checked=0
  await injectJournalEdit(f,x=>{x.coverage.review=[]})
  const cur=(await f.controller.act({type:'current'})).view!;await f.controller.act({type:'resume',id:cur.id,revision:cur.revision,consent:true});v=await f.settle()
  assert.ok(checked>0,'reviews went through the adapter');assert.deepEqual(adapterErrors,[]);assert.ok(f.requests.some(r=>isReview(r)&&r.semanticLocks?.some(l=>l.field==='backstory')),'the v2 lock is sent')
  assert.equal(consistency(v).ok,true,consistency(v).detail)
  const published=await saveAndRead(f);assert.ok(published.artifacts.some(a=>a.facts.backstory==='作者背景'))
 }finally{await f.dispose()}
})
test('CC-13: a long text cannot take the body value; submitting it is refused without change',async()=>{
 const f=await conflictFixture(()=>({}))
 try{
  await toVerify(f)
  await injectJournalEdit(f,j=>{const c=j.conflicts.find(c=>c.status==='pending')!,a=j.artifacts.find(a=>a.id===c.source.artifactId)!;a.text='长'.repeat(2500);c.source={...c.source,text:a.text,value:a.text}})
  const v=await f.view(),o=v.conflictDetail!.choices.find(o=>o.choice==='inferred')!;assert.equal(o.available,false);assert.match(o.reason!,/较长/)
  const before=JSON.stringify((await f.journal()).artifacts)
  await assert.rejects(decide(f,{choice:'inferred'}),/较长/);assert.equal(JSON.stringify((await f.journal()).artifacts),before)
  await decide(f,{choice:'source'});await saveAndRead(f)
 }finally{await f.dispose()}
})
test('CC-14: an invalid roleType from the body leaves 保留 as the way through',async()=>{
 const f=await conflictFixture(r=>{const a=r.artifacts.find(a=>a.kind==='character')!;return {field:'roleType',source:{text:a.facts.roleType,value:a.facts.roleType,artifactId:a.id},candidate:{text:'地点/山脉，非角色',value:'地点/山脉，非角色'}}})
 try{
  const v=await toVerify(f),d=v.conflictDetail!;assert.equal(d.fieldLabel,'角色类型')
  assert.deepEqual(d.choices.map(o=>[o.choice,o.available]),[['inferred',false],['source',true],['merge',false]])
  await assert.rejects(decide(f,{choice:'inferred'}));await decide(f,{choice:'source'});const after=await f.settle();assert.equal(consistency(after).ok,true);await saveAndRead(f)
 }finally{await f.dispose()}
})
test('CC-15: a reference pointing at the artifact itself is not offered',async()=>{
 const f=await conflictFixture(()=>({}))
 try{
  await toVerify(f)
  await injectJournalEdit(f,j=>{const c=j.conflicts.find(c=>c.status==='pending')!,a=j.artifacts.find(a=>a.id===c.source.artifactId)!;c.field='characterId';a.facts.characterId='';c.source={...c.source,text:'',value:''};c.candidate={text:a.id,value:a.id}})
  const o=(await f.view()).conflictDetail!.choices.find(o=>o.choice==='inferred')!;assert.equal(o.available,false)
 }finally{await f.dispose()}
})
test('CC-17: a decision while the review runs is refused',async()=>{
 const f=await conflictFixture(()=>({}))
 try{
  const v=await toVerify(f),id=v.conflictDetail!.conflictId
  await injectJournalEdit(f,j=>{j.wizard!.stepState.verify='running'})
  await assert.rejects(f.act('resolve',{conflictId:id,choice:'source'}),/正在复核/);assert.equal((await f.journal()).conflicts.find(c=>c.id===id)!.status,'pending')
 }finally{await f.dispose()}
})
test('CC-18: a deferred body-body conflict with the artifact on the candidate side is decided on that artifact',async()=>{
 const f=await conflictFixture(()=>({}))
 try{
  await toVerify(f)
  await injectJournalEdit(f,j=>{const c=j.conflicts.find(c=>c.status==='pending')!,id=c.source.artifactId!;c.type='body-body';c.candidate={text:j.artifacts.find(a=>a.id===id)!.text,value:j.artifacts.find(a=>a.id===id)!.text,artifactId:id};c.source={text:'正文另说',value:'正文另说',unitId:c.evidence[0].unitId}})
  const d=(await f.view()).conflictDetail!,j0=await f.journal(),id=j0.conflicts.find(c=>c.status==='pending')!.candidate.artifactId!
  assert.equal(d.current,j0.artifacts.find(a=>a.id===id)!.text);assert.equal(d.proposed,'正文另说')
  await decide(f,{choice:'inferred'});const published=await saveAndRead(f);assert.equal(published.artifacts.find(a=>a.id===id)!.text,'正文另说')
 }finally{await f.dispose()}
})
test('CC-19: rewrite at step 21 still produces body patches',async()=>{
 const f=await conflictFixture(()=>({}))
 f.setAi((prev=>async(r:ImportAiRequest)=>{if(r.phase==='patch'){const u=r.units.find(u=>u.text.includes('之夜'))!,at=u.start+u.text.indexOf('之夜');return {patches:[{id:'p-1',conflictId:r.conflict!.id,workingRevision:r.workingRevision!,start:at,end:at+2,before:'之夜',after:'之晨',reason:'与资料一致'}]}}return prev(r)})(f.handler() as Ai))
 try{const v=await toVerify(f);await f.act('resolve',{conflictId:v.conflictDetail!.conflictId,choice:'rewrite'});const after=await f.settle();assert.equal(after.patches.length,1,after.error)}finally{await f.dispose()}
})
/* docs/558 review: R11 details, R4 lock order, R8 auto-repair, negative cases. */
test('CC-25 (R11): ids in values read as names, including inside JSON; no detail while the review runs',async()=>{
 const f=await conflictFixture(()=>({}))
 try{
  await toVerify(f)
  await injectJournalEdit(f,j=>{const c=j.conflicts.find(c=>c.status==='pending')!,others=j.artifacts.filter(a=>a.kind==='character'&&a.id!==c.source.artifactId);c.candidate={text:'x',value:`与 ${others[0].id} 同行，见 ${JSON.stringify([{characterId:others[1]?.id??others[0].id}])}`}})
  const d=(await f.view()).conflictDetail!,j=await f.journal(),others=j.artifacts.filter(a=>a.kind==='character'&&a.id!==j.conflicts.find(c=>c.status==='pending')!.source.artifactId)
  assert.ok(d.proposed.includes(`「${others[0].name}」`));assert.doesNotMatch(d.proposed,/c-[0-9a-f]{16}/)
  await injectJournalEdit(f,x=>{x.wizard!.stepState.verify='running'});assert.equal((await f.view()).conflictDetail,undefined)
 }finally{await f.dispose()}
})
test('CC-26 (R11): an evidence unit outside the chapters falls back to 「原文」',async()=>{
 const f=await conflictFixture(()=>({}))
 try{
  await toVerify(f);await injectJournalEdit(f,j=>{const c=j.conflicts.find(c=>c.status==='pending')!;c.evidence=[{unitId:'unknown-unit',quote:'不存在'}]})
  assert.equal((await f.view()).conflictDetail!.evidence[0].location,'原文')
 }finally{await f.dispose()}
})
test('CC-27 (R9): a conflict with no imported artifact offers only 保留 and still passes',async()=>{
 const f=await conflictFixture(()=>({}))
 try{
  await toVerify(f);await injectJournalEdit(f,j=>{const c=j.conflicts.find(c=>c.status==='pending')!;c.source={text:'甲',value:'甲'};c.candidate={text:'乙',value:'乙'}})
  const d=(await f.view()).conflictDetail!;assert.deepEqual(d.choices.map(o=>[o.choice,o.available]),[['inferred',false],['source',true],['merge',false]])
  await decide(f,{choice:'source'});const v=await f.settle();assert.equal(consistency(v).ok,true);await saveAndRead(f)
 }finally{await f.dispose()}
})
test('CC-28 (R4): a decided relationships value cut by structure fixes gets no lock and later [修复] does not throw',async()=>{
 const f=await conflictFixture(()=>({}))
 try{
  await toVerify(f)
  await injectJournalEdit(f,j=>{const c=j.conflicts.find(c=>c.status==='pending')!,a=j.artifacts.find(a=>a.id===c.source.artifactId)!;a.facts.relationships='[]';c.field='relationships';c.source={...c.source,text:'[]',value:'[]'};c.candidate={text:'x',value:JSON.stringify([{target:'无名',description:'旧识',characterId:'c-ffffffffffffffff'}])}})
  // relationships is structural: 自己填写 is off, 以正文为准 points at a missing character and is checked by the mapping gate.
  const d=(await f.view()).conflictDetail!;assert.equal(d.choices.find(o=>o.choice==='merge')!.available,false)
  await decide(f,{choice:'source'});let v=await f.settle();assert.equal(consistency(v).ok,true)
  await injectJournalEdit(f,j=>{j.coverage.review=[]});const cur=(await f.controller.act({type:'current'})).view!;await f.controller.act({type:'resume',id:cur.id,revision:cur.revision,consent:true});v=await f.settle()
  assert.equal(v.wizard!.stepError,undefined,v.wizard!.stepError);await saveAndRead(f)
 }finally{await f.dispose()}
})
test('CC-29 (R8): a body-body conflict the review can fix is repaired automatically, not shown',async()=>{
 const f=await legacySceneFixture(filesF(),rosterAi());const base=fullAi(f);let first=true
 f.setAi(async r=>{if(!isReview(r))return base(r);if(first){const out=reply(r,()=>({type:'body-body'}));if(out.conflicts!.length){first=false;return out}}return {conflicts:[]}})
 try{const v=await toVerify(f);assert.equal(v.conflictDetail,undefined);assert.equal(v.wizard!.verify!.fixed.length,1);assert.equal(consistency(v).ok,true)}finally{await f.dispose()}
})
test('CC-31 negative: resolved conflict, unavailable choice, invalid merge and annotation stripping',async()=>{
 const f=await conflictFixture(()=>({}))
 try{
  let v=await toVerify(f);const id=v.conflictDetail!.conflictId
  await injectJournalEdit(f,j=>{const c=j.conflicts.find(c=>c.id===id)!;c.candidate={text:'x',value:'正文说法（可靠性：人物推测）'}})
  await decide(f,{choice:'inferred'});const j=await f.journal(),c=j.conflicts.find(c=>c.id===id)!
  assert.doesNotMatch(j.artifacts.find(a=>a.id===c.source.artifactId)!.text,/可靠性/,'annotation stripped')
  await assert.rejects(f.act('resolve',{conflictId:id,choice:'source'}),/冲突决定已过期/)
 }finally{await f.dispose()}
 const g=await conflictFixture(r=>{const a=r.artifacts.find(a=>a.kind==='character')!;return {field:'age',source:{text:'',value:'十八',artifactId:a.id},candidate:{text:'二十',value:'二十'}}})
 try{
  await toVerify(g);await injectJournalEdit(g,j=>{const c=j.conflicts.find(c=>c.status==='pending')!,a=j.artifacts.find(a=>a.id===c.source.artifactId)!;a.facts.age='十八'})
  const before=JSON.stringify((await g.journal()).artifacts)
  await assert.rejects(decide(g,{choice:'merge',mergedText:'x'.repeat(200000)}));assert.equal(JSON.stringify((await g.journal()).artifacts),before,'refused merge leaves the session')
 }finally{await g.dispose()}
})
/* docs/559 must-fix 1: an outline chapterIndex conflict never offers a value the save path rejects. */
test('CC-32: an outline chapterIndex that is not a chapter, or already has an outline, is not offered; 保留 still saves',async()=>{
 const f=await conflictFixture(()=>({}))
 try{
  await toVerify(f)
  const setup=async(value:string)=>injectJournalEdit(f,j=>{const c=j.conflicts.find(c=>c.status==='pending')!,o=j.artifacts.find(a=>a.kind==='outline'&&a.facts.chapterIndex==='0')!;c.source={text:'0',value:'0',artifactId:o.id};c.candidate={text:value,value};c.field='chapterIndex';c.kind='outline'})
  for(const bad of ['第3章','1','999']){await setup(bad);const o=(await f.view()).conflictDetail!.choices.find(o=>o.choice==='inferred')!;assert.equal(o.available,false,bad);await assert.rejects(decide(f,{choice:'inferred'}))}
  await decide(f,{choice:'source'});const v=await f.settle();assert.equal(consistency(v).ok,true);await saveAndRead(f)
 }finally{await f.dispose()}
})
test('CC-33 (559-3): an invalid 自己填写 value explains the field, not the model',async()=>{
 const f=await conflictFixture(()=>({}))
 try{
  await toVerify(f)
  await injectJournalEdit(f,j=>{const c=j.conflicts.find(c=>c.status==='pending')!,e=j.artifacts.find(a=>a.kind==='worldline'&&a.facts.timeValue!==undefined)??j.artifacts.find(a=>a.kind==='worldline')!;e.facts.timeKind=e.facts.timeKind||'RELATIVE';e.facts.timeValue=e.facts.timeValue||'1';c.source={text:e.facts.timeValue,value:e.facts.timeValue,artifactId:e.id};c.candidate={text:'2',value:'2'};c.field='timeValue';c.kind='worldline'})
  const d=(await f.view()).conflictDetail!;const merge=d.choices.find(o=>o.choice==='merge')!
  assert.equal(merge.available,true,JSON.stringify(d.choices));const err=await decide(f,{choice:'merge',mergedText:'三年后'}).then(()=>undefined,e=>e as Error);assert.ok(err,'refused');assert.doesNotMatch(err!.message,/模型配置/);assert.match(err!.message,/填写的内容不能保存为「时间」：/)
 }finally{await f.dispose()}
})
