import assert from 'node:assert/strict'
import {test} from 'node:test'
import {sceneFixture,bodyOf,byName,smallModel,smallReview,spaced,isFiller,type Row,type SceneF,type CleanupHelpers,type Handlers} from '../helpers/novel-import-scene-cleanup-fixture'
import {applySceneIdentityChange} from '../../desktop/core/novel-import-scene-identity'
import type {ImportSession} from '../../desktop/shared/novel-import'

// 487 §B1/B4–B6, §C. Controller flows through the real service bridge; synthetic places only.
const small={models:{text:smallModel,review:smallReview}}
const p=(literal:string,rest:string)=>literal+rest
/** Model decisions over the packet focus: rows to merge [from,to,name?] and rows to drop. */
function decide(h:CleanupHelpers,ops:{merge?:[number,number,string?][];drop?:number[]}){return h.ctx.focus.map(f=>{const row=h.rowOf(f.index),m=ops.merge?.find(([a])=>a===row);if(m)return {index:f.index,action:'merge',target:h.indexOf(m[1]),...(m[2]?{name:m[2]}:{}),evidence:h.evidence(f.index)};if(ops.drop?.includes(row))return {index:f.index,action:'drop',evidence:h.evidence(f.index)};return {index:f.index,action:'keep'}})}
async function listed(rows:Row[],handlers:Handlers={},over:Parameters<typeof sceneFixture>[3]={},pad?:number,bind?:(f:SceneF)=>void){const f=await sceneFixture(rows,bodyOf(rows.filter(r=>!r.round).map(r=>r.mentions.map(m=>m.quote).join('')),pad),handlers,over);bind?.(f);try{const v=await f.toList();assert.equal(v.wizard!.step,'detect-scene');return f}catch(error){await f.dispose();throw error}}
const waiting=(f:SceneF)=>{const w=f.session().wizard!;assert.equal(w.stepState['detect-scene'],'waiting',w.stepError)}
const names=(f:SceneF)=>f.session().wizard!.candidates.scene!.map(c=>c.name).filter(n=>!isFiller(n)).sort()
const counts=(f:SceneF)=>{const list=f.session().wizard!.candidates.scene!;return {unresolved:list.filter(c=>c.sceneIdentityState==='unresolved').length,importable:list.filter(c=>c.sceneIdentityState!=='unresolved').length}}
const one=(literal:string,rest:string,extra:Partial<Row>={}):Row=>({mentions:[{literal,quote:p(literal,rest)}],...extra})

test('B1: cleanup runs after links and before parent repair with the complete participating catalog and earliest full focus units',async()=>{
 const rows:Row[]=[{mentions:[{literal:'甲港',quote:'北岸的甲港很宽。'}],label:'北岸',links:[{target:1,relation:'parent'}]},{mentions:[{literal:'乙港',quote:'北岸的乙港很窄。'}],label:'北岸',links:[{target:0,relation:'parent'}]},one('青石镇','的码头有灯塔。'),{...one('甲大学','的钟楼很高。'),links:[{target:4,relation:'same-place'},{target:4,relation:'different-place'}]},one('甲大学','的图书馆很旧。')]
 const f=await listed(rows,{},{notes:'# 场景\n\n## 丁村\n\n丁村有井。\n'});try{waiting(f)
  const kinds=f.requests.map(r=>(r.sceneIdentity as {mode?:string}|undefined)?.mode==='cleanup'?'cleanup':r.sceneIdentity?.mode==='links'?'links':r.sceneParentTargets?'parents':'other'),lastLinks=kinds.lastIndexOf('links'),firstCleanup=kinds.indexOf('cleanup'),firstParents=kinds.indexOf('parents')
  assert.ok(lastLinks>=0&&firstCleanup>lastLinks&&firstParents>firstCleanup,JSON.stringify(kinds.filter(k=>k!=='other')))
  const requests=f.cleanupRequests(),contexts=requests.map(r=>r.sceneIdentity as unknown as {catalog:{index:number;name:string}[];focus:{index:number;unitIds:string[]}[]})
  for(const c of contexts){assert.deepEqual(c.catalog,contexts[0].catalog);assert.deepEqual(c.catalog.map(x=>x.name).sort(),['乙港','甲港','青石镇'])}
  const focus=contexts.flatMap(c=>c.focus.map(x=>x.index));assert.equal(new Set(focus).size,focus.length);assert.deepEqual([...focus].sort(),contexts[0].catalog.map(x=>x.index).sort())
  const working=f.session().workingUnits!;for(const [k,r]of requests.entries())for(const item of contexts[k].focus){const name=contexts[k].catalog.find(x=>x.index===item.index)!.name,first=working.find(u=>rows.some(row=>row.mentions.some(m=>m.literal===name&&u.text.includes(m.quote))))!;assert.deepEqual(item.unitIds,[first.id]);const sent=r.units.find(u=>u.id===first.id)!;assert.equal(sent.text,first.text,'focus material is the complete working unit')}
 }finally{await f.dispose()}
 const empty=await listed([{...one('甲大学','的钟楼很高。'),links:[{target:1,relation:'same-place'},{target:1,relation:'different-place'}]},one('甲大学','的图书馆很旧。')]);try{waiting(empty);assert.equal(empty.cleanupRequests().length,0)}finally{await empty.dispose()}
})

test('B4: the controller refuses sceneCleanup from links and extra keys from cleanup even when the service is bypassed',async t=>{
 const rows:Row[]=[{mentions:[{literal:'甲港',quote:'北岸的甲港很宽。'}],label:'北岸'},{mentions:[{literal:'乙港',quote:'北岸的乙港很窄。'}],label:'北岸'}]
 await t.test('links + sceneCleanup',async()=>{const f=await listed(rows,{direct:r=>r.sceneIdentity?.mode==='links'?{sceneIdentityDecisions:r.sceneIdentity.tasks.map(x=>({taskIndex:x.taskIndex,result:'unknown' as const,evidence:[]})),sceneCleanup:[]} as never:undefined});try{const w=f.session().wizard!;assert.equal(w.stepState['detect-scene'],'failed');assert.match(w.stepError??'',/越权|结构无效/u);assert.equal(f.cleanupRequests().length,0)}finally{await f.dispose()}})
 await t.test('cleanup + roster',async()=>{const f=await listed(rows,{direct:r=>(r.sceneIdentity as {mode?:string}|undefined)?.mode==='cleanup'?{sceneCleanup:(r.sceneIdentity as unknown as {focus:{index:number}[]}).focus.map(x=>({index:x.index,action:'keep'})),roster:[]} as never:undefined});try{const w=f.session().wizard!;assert.equal(w.stepState['detect-scene'],'failed');assert.match(w.stepError??'',/越权|结构无效/u);assert.equal(w.sceneCleanup,undefined)}finally{await f.dispose()}})
})

test('B5: a catalog that cannot fit one request fails the step with a budget message and sends nothing',async()=>{
 const rows=Array.from({length:220},(_,i)=>one('合成第'+String(i).padStart(3,'0')+'号'+'长'.repeat(38)+'仓库','有井。'))
 const f=await listed(rows,{},small,0);try{const w=f.session().wizard!;assert.equal(w.stepState['detect-scene'],'failed');assert.match(w.stepError??'',/预算/u);assert.equal(f.cleanupRequests().length,0)}finally{await f.dispose()}
})

test('B5: at least 32 cleanup packets run exactly 31 at a time',async()=>{
 let running=0,peak=0,release:(()=>void)|undefined,gate=new Promise<void>(r=>{release=r})
 const before=async(r:{sceneIdentity?:unknown})=>{if((r.sceneIdentity as {mode?:string}|undefined)?.mode!=='cleanup')return;running++;peak=Math.max(peak,running);if(running>=31)release!();await Promise.race([gate,new Promise(r=>setTimeout(r,80))]);running--}
 const rows=Array.from({length:160},(_,i)=>one('仓库'+String(i).padStart(3,'0'),'有井。'))
 const f=await listed(rows,{before},small);try{waiting(f);assert.ok(f.cleanupRequests().length>=32,'packets '+f.cleanupRequests().length);assert.equal(peak,31)}finally{await f.dispose()}
})

test('B6: one packet failing after bounded attempts applies nothing; redetect resends only cleanup',async()=>{
 const {rows,at}=spaced([one('甲港','的码头很宽。'),one('乙港','的码头很窄。'),one('丙港','有座灯塔。')]);rows.splice(at[1]-6,6);at[1]-=6;at[2]-=6
 let broken=true,snapshot:{hash:string;candidates:unknown;cleanup:unknown}|undefined,session:()=>ImportSession=()=>{throw Error()}
 const f=await listed(rows,{before:r=>{if((r.sceneIdentity as {mode?:string}|undefined)?.mode==='cleanup'&&!snapshot){const s=session();snapshot={hash:s.wizard!.sceneIdentity!.ledgerHash,candidates:structuredClone(s.wizard!.candidates.scene),cleanup:structuredClone(s.wizard!.sceneCleanup)}}},cleanup:h=>broken&&h.ctx.focus.some(x=>h.rowOf(x.index)===at[2])?[]:decide(h,{merge:[[at[1],at[0]]]})},small,undefined,g=>{session=g.session})
 try{const first=f.cleanupRequests(),packets=new Set(first.map(r=>JSON.stringify((r.sceneIdentity as unknown as {focus:unknown}).focus)));assert.ok(packets.size>=2,'packets '+packets.size)
  const w=f.session().wizard!;assert.equal(w.stepState['detect-scene'],'failed');assert.ok(w.stepError);const failing=first.filter(r=>(r.sceneIdentity as unknown as {focus:{index:number}[]}).focus.some(x=>(r.sceneIdentity as unknown as {catalog:{index:number;name:string}[]}).catalog.find(c=>c.index===x.index)!.name==='丙港'));assert.equal(failing.length,3)
  assert.ok(snapshot);assert.equal(w.sceneIdentity!.ledgerHash,snapshot.hash);assert.deepEqual(w.candidates.scene,snapshot.candidates);assert.deepEqual(w.sceneCleanup,snapshot.cleanup)
  broken=false;const roster=f.requests.filter(r=>r.sceneIdentity?.mode==='roster').length,links=f.requests.filter(r=>r.sceneIdentity?.mode==='links').length,cleanup=first.length
  await f.act('wizard-redetect');await f.settle();waiting(f);assert.equal(f.requests.filter(r=>r.sceneIdentity?.mode==='roster').length,roster);assert.equal(f.requests.filter(r=>r.sceneIdentity?.mode==='links').length,links);assert.ok(f.cleanupRequests().length>cleanup);assert.deepEqual(names(f),['甲港','丙港'].sort())
 }finally{await f.dispose()}
})

test('C1: two spellings of each place merge into one identity named by the chosen original spelling',async()=>{
 const rows=[one('青石镇','的码头有灯塔。'),one('青石','的旧桥很长。'),one('鱼与菜市场','的摊位很多。'),one('鱼和菜市场','在桥东。')]
 const f=await listed(rows,{cleanup:h=>decide(h,{merge:[[0,1,'青石镇'],[3,2,'鱼和菜市场']]})});try{waiting(f);assert.deepEqual(names(f),['青石镇','鱼和菜市场'].sort())
  const l=f.ledger(),model=l.relations.filter(r=>r.relation==='same-place');assert.equal(model.length,2);assert.ok(model.every(r=>r.basis==='model'))
  const units=f.session().workingUnits!;for(const r of model){const e=r.evidence[0],u=units.find(u=>u.id===e.unitId)!;assert.ok(rows.some(row=>row.mentions[0].quote===u.text.slice(e.start,e.end)),'evidence restores to the original quote')}
  assert.ok(byName(f,'青石镇').aliases.includes('青石'));assert.ok(byName(f,'鱼和菜市场').aliases.includes('鱼与菜市场'))
 }finally{await f.dispose()}
})

test('C1b: without a name the earliest literal names the group; conflicting choices follow the earliest chooser',async t=>{
 await t.test('no name',async()=>{const f=await listed([one('青石镇','的码头有灯塔。'),one('青石','的旧桥很长。')],{cleanup:h=>decide(h,{merge:[[1,0]]})});try{assert.deepEqual(names(f),['青石镇'])}finally{await f.dispose()}})
 await t.test('two names',async()=>{const f=await listed([one('丙城','的城门很高。'),one('丙城市','的城墙很长。'),one('丙市','的集市很热闹。')],{cleanup:h=>decide(h,{merge:[[1,0,'丙城市'],[2,0,'丙市']]})});try{assert.deepEqual(names(f),['丙城市'])}finally{await f.dispose()}})
})

test('C2: two same-named places without qualifiers merge into one candidate',async()=>{
 const f=await listed([one('青石镇','的码头有灯塔。'),one('青石镇','的旧桥很长。')],{cleanup:h=>decide(h,{merge:[[1,0]]})});try{assert.equal(f.session().wizard!.candidates.scene!.length,1)}finally{await f.dispose()}
})

test('C3: a dropped non-place is excluded with evidence, unselected, and imports once the author ticks it',async()=>{
 const f=await listed([one('青石镇','的码头有灯塔。'),one('铜铃','挂在门口。')],{cleanup:h=>decide(h,{drop:[1]})});try{waiting(f);const bell=byName(f,'铜铃'),w=f.session().wizard!
  assert.equal(bell.selected,false);assert.equal(bell.sceneExcluded,true);assert.equal(byName(f,'青石镇').sceneExcluded,undefined);assert.deepEqual(w.sceneCleanup!.excluded.map(x=>x.id),[bell.id]);const e=w.sceneCleanup!.excluded[0].evidence,u=f.session().workingUnits!.find(u=>u.id===e.unitId)!;assert.equal(u.text.slice(e.start,e.end),'铜铃挂在门口。')
  await f.act('wizard-select-candidates',{kind:'scene',ids:[bell.id],selected:true});await f.act('wizard-next');const v=await f.settle();assert.equal(v.wizard!.step,'verify',v.wizard!.stepError);assert.ok(f.session().artifacts.some(a=>a.id===bell.id))
 }finally{await f.dispose()}
})

test('C4: chains, cycles and merge-into-drop are resolved the same way in one packet and across packets',async t=>{
 const rows=[one('甲港','的码头很宽。'),one('乙港','的码头很窄。'),one('丙港','有座灯塔。')]
 const cases:{label:string;ops:{merge?:[number,number][];drop?:number[]};expect:string[];excluded:string[]}[]=[{label:'A→B→C',ops:{merge:[[0,1],[1,2]]},expect:['甲港','乙港'],excluded:[]},{label:'A↔B',ops:{merge:[[0,1],[1,0]]},expect:['甲港','乙港','丙港'],excluded:[]},{label:'A→B, B drop',ops:{merge:[[0,1]],drop:[1]},expect:['甲港','乙港','丙港'],excluded:['乙港']}]
 for(const layout of ['one packet','packets'] as const)for(const c of cases)await t.test(layout+' '+c.label,async()=>{const s=layout==='packets'?spaced(rows):{rows,at:[0,1,2]},map=(ops:typeof c.ops)=>({merge:ops.merge?.map(([a,b])=>[s.at[a],s.at[b]] as [number,number]),drop:ops.drop?.map(d=>s.at[d])}),f=await listed(s.rows,{cleanup:h=>decide(h,map(c.ops))},layout==='packets'?small:{});try{waiting(f);if(layout==='packets'){const owner=(name:string)=>f.cleanupRequests().findIndex(r=>{const x=r.sceneIdentity as unknown as {catalog:{index:number;name:string}[];focus:{index:number}[]};return x.focus.some(y=>x.catalog.find(z=>z.index===y.index)!.name===name)});assert.equal(new Set(['甲港','乙港','丙港'].map(owner)).size,3,'each core place is decided in its own packet')}else assert.equal(f.cleanupRequests().length,1);assert.deepEqual(names(f),c.expect.sort());assert.deepEqual(f.session().wizard!.candidates.scene!.filter(x=>x.sceneExcluded).map(x=>x.name),c.excluded)}finally{await f.dispose()}})
})

test('C5: prechecked merges are ignored without failing or reducing importable places',async t=>{
 const check=async(rows:Row[],merge:[number,number],prepare?:(f:SceneF)=>Promise<void>)=>{const returned:unknown[]=[];let active=!prepare;const f=await listed(rows,{cleanup:h=>{const out=active?decide(h,{merge:[merge]}):h.keepAll();returned.push(...out);return out}});try{waiting(f);if(prepare){await prepare(f);active=true;await f.act('wizard-redetect');await f.settle();waiting(f)}const list=f.session().wizard!.candidates.scene!
   assert.ok(returned.some(x=>(x as {action:string}).action==='merge'),'the model really returned the merge');assert.equal(list.length,rows.length,'nothing merged');const after=counts(f);assert.equal(after.unresolved,0);assert.equal(after.importable,rows.length)}finally{await f.dispose()}}
 await t.test('different-place relation',()=>check([one('甲港','的码头很宽。'),{...one('乙港','的码头很窄。'),links:[{target:0,relation:'different-place'}]}],[1,0]))
 await t.test('author partition',()=>check([one('甲港','的码头很宽。'),one('乙港','的码头很窄。')],[1,0],async f=>{const l=f.ledger();await f.act('wizard-scene-identity',{expectedLedgerHash:l.ledgerHash,explanation:'依据合成原文确认两处不同',op:'partition',identityIds:l.identities.map(i=>i.id),parts:l.identities.map(i=>({memberKeys:i.memberKeys,state:'concrete',nameParts:i.nameParts,parent:{state:'unknown'}}))})}))
 await t.test('two different outer parents',()=>check([{...one('甲港','的码头很宽。'),links:[{target:2,relation:'parent'}]},{...one('乙港','的码头很窄。'),links:[{target:3,relation:'parent'}]},one('东州','的城门很高。'),one('西州','的城墙很长。')],[1,0]))
 await t.test('parent inside the merged group',()=>check([{...one('甲港','的码头很宽。'),links:[{target:1,relation:'parent'}]},one('乙港','的码头很窄。')],[0,1]))
 await t.test('a new parent cycle',()=>check([{...one('甲港','的码头很宽。'),links:[{target:1,relation:'parent'}]},{...one('乙港','的码头很窄。'),links:[{target:2,relation:'parent'}]},one('丙港','有座灯塔。')],[0,2]))
})

test('C11: with a baseline parent cycle, unrelated merges apply, cycle-growing merges are reverted, then repair removes the cycle',async()=>{
 const rows=[{...one('甲港','的码头很宽。'),links:[{target:1,relation:'parent' as const}]},{...one('乙港','的码头很窄。'),links:[{target:0,relation:'parent' as const}]},one('丙港','有座灯塔。'),one('丁港','有座石桥。'),one('戊港','有座钟楼。')]
 const f=await listed(rows,{cleanup:h=>decide(h,{merge:[[2,3],[4,0]]})});try{waiting(f);assert.deepEqual(names(f),['甲港','乙港','丙港','戊港'].sort());assert.ok(f.requests.some(r=>r.sceneParentTargets));const {sceneParentCycleIds}=await import('../../desktop/core/novel-import-wizard-roster');assert.deepEqual(sceneParentCycleIds(f.session().wizard!.candidates.scene!),[])}finally{await f.dispose()}
})

test('C12-1/2, C7, C13: re-recognition skips cleanup without new link results and reruns it with them',async t=>{
 const rows:Row[]=[{mentions:[{literal:'青石镇',quote:'北岸的青石镇有灯塔。'}],label:'北岸'},{mentions:[{literal:'青石',quote:'北岸的青石有旧桥。'}],label:'北岸'},{mentions:[{literal:'乙港',quote:'北岸的乙港有仓库。'}],label:'北岸'},one('铜铃','挂在门口。'),one('木鱼','放在案上。'),one('石狮','守在门前。')]
 for(const mode of ['unknown','same-place'] as const)await t.test(mode,async()=>{
  let second=false;const f=await listed(rows,{links:(l,r)=>second&&mode==='same-place'&&l.length+r.length>=3?'same-place':'unknown',cleanup:h=>h.call===1?decide(h,{merge:[[1,0]],drop:[3,4]}):decide(h,{drop:[5]})})
  try{waiting(f);assert.deepEqual(f.session().wizard!.candidates.scene!.filter(c=>c.sceneExcluded).map(c=>c.name).sort(),['木鱼','铜铃'].sort())
   await f.act('wizard-select-candidates',{kind:'scene',ids:[byName(f,'铜铃').id],selected:true});assert.deepEqual(f.session().wizard!.sceneCleanup!.authorKept,[byName(f,'铜铃').id])
   await f.act('wizard-next');await f.settle();second=true;const links=f.requests.length;await f.act('wizard-revise',{to:'detect-scene'});await f.settle();waiting(f)
   const fresh=f.requests.slice(links).filter(r=>r.sceneIdentity?.mode==='links');assert.ok(fresh.some(r=>r.sceneIdentity?.mode==='links'&&r.sceneIdentity.records.some(x=>x.members.length===2)&&r.sceneIdentity.records.length>=2),'a new merged-pair link task was really sent')
   const cleanup=f.cleanupRequests().length,w=f.session().wizard!
   if(mode==='unknown'){assert.equal(cleanup,1);assert.equal(byName(f,'铜铃').selected,true);assert.equal(byName(f,'木鱼').selected,false);assert.equal(byName(f,'木鱼').sceneExcluded,true)}
   else{assert.equal(cleanup,2);assert.deepEqual(w.sceneCleanup!.excluded.map(x=>x.id),[byName(f,'石狮').id]);assert.equal(byName(f,'石狮').selected,false);assert.equal(byName(f,'木鱼').selected,true,'old exclusion now kept is selected again');assert.equal(byName(f,'木鱼').sceneExcluded,undefined);assert.equal(byName(f,'铜铃').selected,true,'author keep survives')}
  }finally{await f.dispose()}
 })
})

test('C12-3/4/5: after parent repair problems, retrying never pays for cleanup again',async t=>{
 const rows=[{...one('甲港','的码头很宽。'),links:[{target:1,relation:'parent' as const}]},{...one('乙港','的码头很窄。'),links:[{target:0,relation:'parent' as const}]},one('丙港','有座灯塔。')]
 await t.test('repair fails, then redetect',async()=>{let bad=true;const f=await listed(rows,{parents:()=>bad?{sceneParents:[]}:undefined});try{assert.equal(f.session().wizard!.stepState['detect-scene'],'failed');const cleanup=f.cleanupRequests().length,parents=f.requests.filter(r=>r.sceneParentTargets).length;assert.equal(cleanup,1);bad=false;await f.act('wizard-redetect');await f.settle();waiting(f);assert.equal(f.cleanupRequests().length,cleanup);assert.ok(f.requests.filter(r=>r.sceneParentTargets).length>parents)}finally{await f.dispose()}})
 await t.test('repair succeeds but the final save fails once',async()=>{const f=await sceneFixture(rows,bodyOf(rows.map(r=>r.mentions[0].quote)));try{const c=f.controller as unknown as {save:(s?:ImportSession,...rest:unknown[])=>Promise<void>;session:ImportSession},save=c.save.bind(c);let failed=false;c.save=async(s?:ImportSession,...rest:unknown[])=>{const target=s??c.session,w=target?.wizard;if(!failed&&target===c.session&&w?.step==='detect-scene'&&w.stepState['detect-scene']==='waiting'&&w.candidates.scene){failed=true;throw Error('保存失败（合成注入）')}return save(s,...rest)};await f.toList();assert.ok(failed);assert.equal(f.session().wizard!.stepState['detect-scene'],'failed');assert.ok(f.requests.some(r=>r.sceneParentTargets));const cleanup=f.cleanupRequests().length;await f.act('wizard-redetect');await f.settle();waiting(f);assert.equal(f.cleanupRequests().length,cleanup)}finally{await f.dispose()}})
 await t.test('repair and save succeed, then redetect',async()=>{const f=await listed(rows);try{waiting(f);const cleanup=f.cleanupRequests().length;await f.act('wizard-redetect');await f.settle();waiting(f);assert.equal(f.cleanupRequests().length,cleanup)}finally{await f.dispose()}})
})

test('C7b: authorKept follows ticking excluded places, select all and select none',async()=>{
 const f=await listed([one('青石镇','的码头有灯塔。'),one('铜铃','挂在门口。'),one('木鱼','放在案上。')],{cleanup:h=>decide(h,{drop:[1,2]})});try{const kept=()=>[...f.session().wizard!.sceneCleanup!.authorKept].sort(),bell=byName(f,'铜铃').id,fish=byName(f,'木鱼').id,town=byName(f,'青石镇').id,all=[bell,fish,town]
  await f.act('wizard-select-candidates',{kind:'scene',ids:[bell],selected:true});assert.deepEqual(kept(),[bell])
  await f.act('wizard-select-candidates',{kind:'scene',ids:[town],selected:false});await f.act('wizard-select-candidates',{kind:'scene',ids:[town],selected:true});assert.deepEqual(kept(),[bell])
  await f.act('wizard-select-candidates',{kind:'scene',ids:[bell],selected:false});assert.deepEqual(kept(),[])
  await f.act('wizard-select-candidates',{kind:'scene',ids:all,selected:true});assert.deepEqual(kept(),[bell,fish].sort())
  await f.act('wizard-select-candidates',{kind:'scene',ids:all,selected:false});assert.deepEqual(kept(),[])
 }finally{await f.dispose()}
})

test('C8: a ledger changed while cleanup is in flight discards the result and replans once; twice fails with no cleanup relation',async t=>{
 const rows:Row[]=[{mentions:[{literal:'甲港',quote:'北岸的甲港很宽。'}],label:'北岸'},one('乙港','的码头很窄。')]
 for(const times of [1,2])await t.test(times+' change(s)',async()=>{let changes=0,f:SceneF|undefined
  let changed='';const relabel=()=>{const c=f!.controller as unknown as {session:ImportSession;sceneSources(s:ImportSession):never},s=c.session,l=s.wizard!.sceneIdentity!,i=l.identities.find(i=>l.records.some(r=>r.memberKeys.includes(i.memberKeys[0])&&r.context.length))!,ctx=l.records.find(r=>r.memberKeys.includes(i.memberKeys[0]))!.context[0],parts=i.nameParts.length===1?[{kind:'context' as const,key:ctx.key},i.nameParts[0]]:[i.nameParts[i.nameParts.length-1]];s.wizard!.sceneIdentity=applySceneIdentityChange(l,{op:'label',identityId:i.id,expectedLedgerHash:l.ledgerHash,explanation:'合成并发修改',nameParts:parts},c.sceneSources(s));changed=s.wizard!.sceneIdentity!.ledgerHash}
  f=await listed(rows,{cleanup:h=>{if(changes<times){changes++;relabel()}return decide(h,{merge:[[1,0]]})}},{},undefined,g=>{f=g})
  try{const w=f.session().wizard!;assert.equal(f.cleanupRequests().length,2)
   if(times===1){waiting(f);assert.equal(w.candidates.scene!.length,1);assert.equal(w.sceneCleanup!.inputHash,changed,'inputHash is the ledger of the applied round (489 L1)')}else{assert.equal(w.stepState['detect-scene'],'failed');assert.ok(w.stepError);assert.equal(f.ledger().relations.filter(r=>r.relation==='same-place').length,0);assert.equal(w.sceneCleanup,undefined)}
  }finally{await f.dispose()}
 })
})

test('C9: sceneCleanup stays private, survives detect-scene and retry-kind, and is cleared from tree',async()=>{
 const f=await listed([one('青石镇','的码头有灯塔。'),one('铜铃','挂在门口。')],{cleanup:h=>decide(h,{drop:[1]})});try{assert.ok(f.session().wizard!.sceneCleanup);assert.equal(Object.hasOwn((await f.view()).wizard!,'sceneCleanup'),false)
  await f.act('wizard-next');await f.settle();await f.act('wizard-retry-kind',{kind:'scene'});await f.settle();assert.ok(f.session().wizard!.sceneCleanup)
  await f.act('wizard-revise',{to:'detect-scene'});await f.settle();assert.ok(f.session().wizard!.sceneCleanup)
  await f.act('wizard-revise',{to:'tree'});await f.settle();assert.equal(f.session().wizard!.sceneCleanup,undefined)
 }finally{await f.dispose()}
})

test('C14: an imported place that becomes unresolved in the omission flow still stops with the existing message',async()=>{
 const rows:Row[]=[{mentions:[{literal:'青石镇',quote:'北岸的青石镇有灯塔。'}],label:'北岸'},one('鱼与菜市场','的摊位很多。'),{round:1,mentions:[{literal:'乙港',quote:'北岸的乙港有东仓。'}],label:'北岸',links:[{target:3,relation:'different-place'}]},{round:1,mentions:[{literal:'丙港',quote:'北岸的丙港有西仓。'}],label:'北岸'}]
 const body=bodyOf(['北岸的青石镇有灯塔。','鱼与菜市场的摊位很多。','北岸的乙港有东仓。北岸的丙港有西仓。'])
 const f=await sceneFixture(rows,body,{links:(l,r)=>[...l,...r].includes(0)?'same-place':'unknown',review:(req,call)=>{const u=req.units.find(u=>u.text.includes('北岸的乙港有东仓。'));return call===1&&u?{conflicts:[],missingTargets:[{kind:'scene',unitIds:[u.id],evidence:[{unitId:u.id,quote:'北岸的乙港有东仓。'}],reason:'新地点尚无独立资料'}]}:{conflicts:[],missingTargets:[]}}})
 try{await f.toList();const x=byName(f,'青石镇');await f.act('wizard-next');const v=await f.settle()
  assert.match(v.wizard!.stepError??'',/请返回识别场景，确认新增地点及归属后继续导入/u);const now=f.session().wizard!.candidates.scene!.find(c=>c.id===x.id)!;assert.equal(now.selected,true);assert.ok(f.session().artifacts.some(a=>a.id===x.id))
 }finally{await f.dispose()}
})

test('H1: a wide cleanup quote is corrected by the packet retry instead of failing recognition',async()=>{
 const rows=[one('青石镇','的码头有灯塔。'),one('铜铃','挂在门口。')]
 const f=await listed(rows,{cleanup:h=>{const out=decide(h,{drop:[1]});return h.call===1?out.map(d=>d.action==='drop'?{...d,evidence:{...d.evidence!,quote:d.evidence!.quote+'其余'}}:d):out}});try{waiting(f)
  assert.ok(f.calls.cleanup>=2,'the first, wide reply was refused and the packet asked again');const bell=byName(f,'铜铃');assert.equal(bell.sceneExcluded,true);assert.equal(bell.selected,false)
 }finally{await f.dispose()}
})
