import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {test} from 'node:test'
import {mergeWizardRoster} from '../../desktop/core/novel-import-wizard'
import {mergeImportArtifacts} from '../../desktop/core/novel-import'
import type {ImportArtifact,ImportUnit,ImportSession} from '../../desktop/shared/novel-import'

const load=()=>import('../../desktop/core/novel-import-scene-identity')
const canonical=(v:unknown):string=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.entries(v).filter(([,x])=>x!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,x])=>JSON.stringify(k)+':'+canonical(x)).join(',')+'}':JSON.stringify(v)??'null'
const hash=(value:unknown)=>createHash('sha256').update(canonical(value)).digest('hex')
const unit=(id:string,text:string,start=0):ImportUnit=>({id,fileId:'working-0',start,end:start+text.length,text,kind:'body'})
const a=unit('arbitrary-a','甲城东宅的书房有红桌。'),b=unit('arbitrary-b','乙城西宅的书房有蓝桌。',100),c=unit('arbitrary-c','第二章仍是甲城东宅的书房，红桌没有移动。',200)
const sources=(units:ImportUnit[])=>({workingRevision:0,workingUnits:units,sourceBlocks:[]})
const record=(u:ImportUnit,label:string,name='书房')=>({name,aliases:[],mentions:[{literal:name,evidence:{unitId:u.id,quote:u.text}}],context:[{label,evidence:[{unitId:u.id,quote:u.text}]}],links:[]})
const fixture=async(units=[a,b])=>{const api=await load(),s=sources(units);return {api,s,ledger:api.appendSceneRosterBatch(api.createSceneIdentityLedger(s),units.map((u)=>record(u,u===b?'乙城西宅':'甲城东宅')),units,s)}}

test('CI03 baseline: the old generic roster merges same spelling before parent identity exists',()=>{
 assert.equal(mergeWizardRoster('scene',[{name:'书房',aliases:[],parent:'东宅'},{name:'书房',aliases:[],parent:'西宅'}]).length,1)
})
test('CI02: exact literal positions, Unicode and quote-window independent keys',async()=>{
 const api=await load(),u=unit('u','😀甲宅的书房有红桌。乙宅的书房有蓝桌。\r\n'),s=sources([u])
 const bad={name:'书房',aliases:[],mentions:[{literal:'书房',evidence:{unitId:u.id,quote:u.text}}],context:[],links:[]}
 assert.throws(()=>api.validateSceneRosterRecords([bad],[u]))
 const good={...bad,mentions:[{literal:'书房',evidence:{unitId:u.id,quote:'甲宅的书房有红桌。'}}]}
 const l=api.appendSceneRosterBatch(api.createSceneIdentityLedger(s),[good],[u],s),m=l.members[0]
 assert.equal(m.origin,'body');if(m.origin!=='body')return
 const start=u.text.indexOf('书房'),expected=hash({version:1,sourceScopeHash:l.sourceScopeHash,unitId:u.id,unitHash:hash(u.text),start,end:start+2,literal:'书房'})
 assert.equal(m.key,expected);assert.equal(m.range.start,start)
 const again=api.appendSceneRosterBatch(l,[{...good,mentions:[{literal:'书房',evidence:{unitId:u.id,quote:'书房有红桌。'}}]}],[u],s)
 assert.equal(again.members.length,1);assert.equal(again.members[0].key,m.key)
 for(const quote of ['书房','甲宅的书房有红桌。乙宅的书房','无此引文'])assert.throws(()=>api.validateSceneRosterRecords([{...good,mentions:[{literal:'书房',evidence:{unitId:u.id,quote}}]}],[u]))
 assert.throws(()=>api.validateSceneRosterRecords([{...good,aliases:['不存在']}],[u]))
})
test('CI03: names and aliases are search clues and do not union concrete places',async()=>{
 const {api,s,ledger}=await fixture();const before=JSON.stringify(ledger),list=api.buildSceneWizardCandidates(ledger)
 assert.equal(list.length,2);assert.ok(list.every(x=>x.selected));assert.notEqual(list[0].id,list[1].id)
 assert.equal(ledger.members.length,2);assert.equal(JSON.stringify(ledger),before);api.assertSceneIdentityLedger(ledger,s)
 const artifact=(id:string):ImportArtifact=>({id,kind:'scene',schema:2,name:'书房',text:'有据空间',facts:{entityType:'PLACE'},evidence:[{unitId:a.id,quote:a.text}],sourceUnitIds:[a.id],origin:'inferred'})
 const registry=api.sceneIdentityRegistry(ledger)
 assert.equal(mergeImportArtifacts([artifact(list[0].id)],[artifact(list[1].id)],1,[],registry).artifacts.length,2)
 assert.throws(()=>mergeImportArtifacts([artifact(list[0].id)],[artifact('unregistered')],1,[],registry))
})
test('CI04: all frozen link tasks apply once atomically, and source order is stable',async()=>{
 const {api,s,ledger}=await fixture([a,c]),planned=api.planSceneIdentityLinkWave(ledger,s,()=>true,15)
 assert.ok(planned.packets.length);const packet=planned.packets[0],decisions=packet.context.tasks.map(t=>({taskIndex:t.taskIndex,result:'same-place' as const,evidence:[{unitId:c.id,quote:c.text}]}))
 const before=JSON.stringify(planned.ledger)
 assert.throws(()=>api.applySceneIdentityLinkWave(planned.ledger,[{packet,decisions:[]}],s));assert.equal(JSON.stringify(planned.ledger),before)
 const next=api.applySceneIdentityLinkWave(planned.ledger,[{packet,decisions}],s)
 assert.equal(next.identities.length,1);assert.equal(next.members.length,2);assert.equal(next.identityRevision,planned.ledger.identityRevision+1)
 assert.deepEqual(next.decisions,[]);assert.ok(next.relations.every(r=>r.basis==='model'))
 const reversed=api.appendSceneRosterBatch(api.appendSceneRosterBatch(api.createSceneIdentityLedger(s),[record(c,'甲城东宅')],[c],s),[record(a,'甲城东宅')],[a],s)
 assert.deepEqual(reversed.members.map(m=>m.key),ledger.members.map(m=>m.key))
 assert.throws(()=>api.applySceneIdentityLinkWave(next,[{packet,decisions}],s))
})
test('CI05: budget failure preserves every pending match and no first-match fallback',async()=>{
 const d=unit('d','甲城东宅的书房又被提到，归属仍待核对。',300)
 const {api,s,ledger}=await fixture([a,c,d]),before=JSON.stringify(ledger)
 // No pair fits: each is recorded unknown, nothing is merged or invented, and the input ledger is untouched.
 const none=api.planSceneIdentityLinkWave(ledger,s,()=>false,15);assert.equal(JSON.stringify(ledger),before);assert.equal(none.packets.length,0);assert.equal(none.pendingTaskCount,0);assert.ok(none.ledger.linkTasks.length>=2&&none.ledger.linkTasks.every(t=>t.result?.outcome==='unknown'&&!t.result.evidence.length));assert.deepEqual(none.ledger.relations,ledger.relations);assert.equal(none.ledger.identities.length,ledger.identities.length)
 const planned=api.planSceneIdentityLinkWave(ledger,s,()=>true,15)
 assert.ok(planned.pendingTaskCount>=2);assert.ok(planned.packets.every(p=>p.context.records.length<=32&&p.context.tasks.length<=64))
 const shared=await import('../../desktop/shared/novel-import-scene-identity')
 assert.equal(shared.sceneRosterRecordsSchema.safeParse([{...record(a,'甲城东宅'),unknown:undefined}]).success,false)
 const invalid=structuredClone(ledger);invalid.members.push(invalid.members[0]);assert.throws(()=>api.assertSceneIdentityLedger(invalid,s))
})
test('CI05: a repeated generic word without concrete context creates no paid pair tasks',async()=>{
 const api=await load(),units=Array.from({length:80},(_,i)=>unit('generic-'+i,`第${i}段只提到一处房间，位置不明。`,i*100)),s=sources(units)
 const ledger=api.appendSceneRosterBatch(api.createSceneIdentityLedger(s),units.map(u=>({name:'房间',aliases:[],mentions:[{literal:'房间',evidence:{unitId:u.id,quote:u.text}}],context:[],links:[]})),units,s)
 const planned=api.planSceneIdentityLinkWave(ledger,s,()=>true,15)
 assert.equal(planned.pendingTaskCount,0);assert.equal(planned.packets.length,0);assert.equal(planned.ledger.identities.length,80)
})
test('CI06: an author partition is retained when further original records are appended',async()=>{
 const api=await load(),garden=unit('garden','花园有树。',400),s=sources([a,b,garden])
 let l=api.appendSceneRosterBatch(api.createSceneIdentityLedger(s),[{name:'书房',aliases:[],mentions:[{literal:'书房',evidence:{unitId:a.id,quote:a.text}},{literal:'书房',evidence:{unitId:b.id,quote:b.text}}],context:[],links:[]}],[a,b],s)
 l=api.applySceneIdentityChange(l,{op:'partition',expectedLedgerHash:l.ledgerHash,explanation:'两处来源分别归属，不混为一处',identityIds:l.identities.map(i=>i.id),parts:l.members.map(m=>({memberKeys:[m.key],state:'source-scoped',nameParts:[{kind:'literal',key:m.key}],parent:{state:'unknown'}}))},s)
 assert.equal(l.identities.length,2)
 const next=api.appendSceneRosterBatch(l,[{name:'花园',aliases:[],mentions:[{literal:'花园',evidence:{unitId:garden.id,quote:garden.text}}],context:[],links:[]}],[garden],s)
 assert.equal(next.identities.length,3);assert.deepEqual(next.decisions,l.decisions)
})
test('CI04: model cycle repair enters ledger and survives subsequent planning without author history',async()=>{
 const api=await load(),u=unit('cycle','甲地位于乙地旁，二者地界清晰。'),g=unit('late','花园有树。',100),s=sources([u,g])
 let l=api.appendSceneRosterBatch(api.createSceneIdentityLedger(s),['甲地','乙地'].map((name,i)=>({name,aliases:[],mentions:[{literal:name,evidence:{unitId:u.id,quote:u.text}}],context:[],links:[{targetIndex:1-i,relation:'parent',evidence:[{unitId:u.id,quote:u.text}]}]})),[u],s)
 const ids=l.identities.map(i=>i.id),before=JSON.stringify(l)
 assert.throws(()=>api.applySceneIdentityParentRepair(l,{ledgerHash:l.ledgerHash,identityRevision:l.identityRevision,targetIds:[ids[0]],units:[u]},[{id:ids[0],evidence:{unitId:u.id,quote:u.text}}],s));assert.equal(JSON.stringify(l),before)
 l=api.applySceneIdentityParentRepair(l,{ledgerHash:l.ledgerHash,identityRevision:l.identityRevision,targetIds:ids,units:[u]},[{id:ids[0],evidence:{unitId:u.id,quote:u.text}},{id:ids[1],parentId:ids[0],evidence:{unitId:u.id,quote:u.text}}],s)
 assert.equal(l.identities.find(i=>i.id===ids[0])?.parent.state,'unknown');assert.equal(l.decisions.length,0);assert.ok(l.linkTasks.some(t=>t.type==='parent'&&t.result?.outcome==='unknown'&&t.result.evidence.length))
 const next=api.appendSceneRosterBatch(l,[{name:'花园',aliases:[],mentions:[{literal:'花园',evidence:{unitId:g.id,quote:g.text}}],context:[],links:[]}],[g],s)
 assert.equal(next.identities.find(i=>i.id===ids[0])?.parent.state,'unknown')
})
test('CI06: unknown source scope is normal, partition is complete and labels use bound parts',async()=>{
 const {api,s,ledger}=await fixture();assert.ok(ledger.identities.every(i=>i.state==='source-scoped'))
 const first=ledger.identities[0],before=JSON.stringify(ledger)
 assert.throws(()=>api.applySceneIdentityChange(ledger,{op:'partition',expectedLedgerHash:ledger.ledgerHash,explanation:'合成核对',identityIds:ledger.identities.map(i=>i.id),parts:[{memberKeys:first.memberKeys,state:'source-scoped',nameParts:first.nameParts,parent:{state:'unknown'}}]},s))
 assert.equal(JSON.stringify(ledger),before)
 const deferred=api.applySceneIdentityChange(ledger,{op:'defer',identityId:first.id,expectedLedgerHash:ledger.ledgerHash,explanation:'保留互斥归属待核对'},s)
 assert.equal(deferred.identities.find(i=>i.id===first.id)?.state,'unresolved');assert.equal(deferred.members.length,ledger.members.length)
 assert.equal(api.buildSceneWizardCandidates(deferred).find(i=>i.id===first.id)?.sceneIdentityState,'unresolved')
})
test('CI12: source blocks use trusted mapping, fallback names and slice local coordinates',async()=>{
 const api=await load(),text='😀原值\r\n首尾资料',u={...unit('not-a-parser-format',text,20),kind:'scene' as const},s={workingRevision:0,workingUnits:[],sourceBlocks:[{artifactId:'source',blockIndex:0,sourceName:'文件名不在正文',nameOrigin:'filename' as const,text,units:[u]}]}
 const ledger=api.createSceneIdentityLedger(s);assert.equal(ledger.members.length,1);assert.equal(ledger.members[0].origin,'source-block');api.assertSceneIdentityLedger(ledger,s)
 const slice={...u,start:22,end:u.end,text:text.slice(2)},members=api.sceneIdentityMemberships(ledger,[slice],s)
 assert.equal(members.length,1);assert.equal(members[0].ownedRanges[0].start,0);assert.equal(members[0].ownedRanges[0].end,slice.text.length);assert.equal(members[0].ownedRanges[0].unitHash,hash(slice.text))
 assert.throws(()=>api.sceneIdentityMemberships(ledger,[{...slice,text:'伪造slice'}],s))
 assert.deepEqual(api.sceneIdentityMemberships(ledger,[{...slice,id:'unrelated'}],s),[])
})
test('CI13: strict journal binding and ownership keys cannot pass with no artifact',async()=>{
 const {api,s,ledger}=await fixture(),state=await import('../../desktop/core/novel-import-wizard-state'),w=state.emptyWizardState()
 assert.equal(w.sceneIdentityVersion,1);w.sceneIdentity=ledger;state.validateImportWizardState({wizardVersion:1,wizard:w})
 const changed=structuredClone(ledger);changed.workingRevision++;assert.throws(()=>api.assertSceneIdentityLedger(changed,s))
 assert.throws(()=>api.expectedSceneOwnershipKeys(ledger,[],new Set(ledger.identities.map(i=>i.id))))
 const old=structuredClone(w);delete old.sceneIdentityVersion;delete old.sceneIdentity;state.validateImportWizardState({wizardVersion:1,wizard:old})
})
test('CI09/10: 201 members survive and mixed review earns only complete current owned coverage',async()=>{
 const api=await load(),units=Array.from({length:201},(_,i)=>unit('owned-'+i,`第${i}次，甲宅的书房有😀红桌。\r\n`,i*100)),s=sources(units)
 const l=api.appendSceneRosterBatch(api.createSceneIdentityLedger(s),[{name:'书房',aliases:[],mentions:units.map(u=>({literal:'书房',evidence:{unitId:u.id,quote:u.text}})),context:[],links:[]}],units,s),id=l.identities[0].id
 assert.equal(l.members.length,201);assert.equal(api.buildSceneWizardCandidates(l)[0].evidenceUnitIds?.length,201)
 const art:ImportArtifact={id,kind:'scene',schema:2,name:'书房',text:'原值😀\r\n首尾',facts:{entityType:'PLACE',backstory:'完整有据事实'},evidence:[{unitId:units[0].id,quote:units[0].text}],sourceUnitIds:[units[0].id],origin:'inferred'}
 const expected=api.expectedSceneOwnershipKeys(l,[art],new Set([id]));assert.equal(expected.length,201)
 const request={semanticVersion:1,operationId:'pure',phase:'review',selectedTargets:['scene','character'],workingRevision:0,units:[units[0]],artifacts:[art],models:{text:{}},sceneIdentity:{version:1,mode:'ownership',ledgerHash:l.ledgerHash,identityRevision:l.identityRevision,memberships:api.sceneIdentityMemberships(l,[units[0]],s)}} as any
 assert.deepEqual(api.sceneOwnershipReviewKeys(l,s,[art],request),[expected[0]])
 assert.deepEqual(api.sceneOwnershipReviewKeys(l,s,[{...art,text:'已变化'}],request),[])
 const short={...units[0],end:units[0].start+units[0].text.indexOf('书房')+2,text:units[0].text.slice(0,units[0].text.indexOf('书房')+2)}
 assert.deepEqual(api.sceneOwnershipReviewKeys(l,s,[art],{...request,units:[short],sceneIdentity:{...request.sceneIdentity,memberships:api.sceneIdentityMemberships(l,[short],s)}}),[])
 const rebuilt=api.createSceneIdentityLedger({...s,workingRevision:1},l);assert.equal(rebuilt.members.length,0);assert.equal(rebuilt.ownershipReviewed.length,0);assert.notEqual(rebuilt.sourceScopeHash,l.sourceScopeHash)
})
test('CI12: link packets carry explicit full source-block bindings without guessing IDs',async()=>{
 const api=await load(),source=unit('totally-arbitrary-source','完整资料😀\r\n首尾',500),s={...sources([a,c]),sourceBlocks:[{artifactId:'source',blockIndex:0,sourceName:'同名资料',nameOrigin:'filename' as const,text:source.text,units:[source]}]}
 let l=api.appendSceneRosterBatch(api.createSceneIdentityLedger(s),[record(a,'甲城东宅'),record(c,'甲城东宅')],[a,c],s)
 const src=l.identities.find(i=>i.memberKeys.some(k=>l.members.find(m=>m.key===k)?.origin==='source-block'))!,body=l.identities.find(i=>i.memberKeys.some(k=>{const m=l.members.find(m=>m.key===k);return m?.origin==='body'&&m.range.unitId===a.id}))!
 l=api.applySceneIdentityChange(l,{op:'partition',expectedLedgerHash:l.ledgerHash,explanation:'合成资料明确对应甲城东宅这一处',identityIds:[src.id,body.id],parts:[{memberKeys:[...src.memberKeys,...body.memberKeys],state:'concrete',nameParts:body.nameParts,parent:{state:'unknown'}}]},s)
 const planned=api.planSceneIdentityLinkWave(l,s,()=>true,15),packet=planned.packets[0]
 assert.ok(packet);const row=packet.context.records.find(r=>r.members.some(m=>m.origin==='source-block'))!
 assert.equal(row.sourceBlocks?.length,1)
 const restored=row.sourceBlocks![0].ranges.map(r=>{const u=packet.units.find(u=>u.id===r.unitId)!;assert.equal(hash(u.text),r.unitHash);return u.text.slice(r.start,r.end)}).join('')
 assert.equal(restored,source.text)
})
test('CI05: different source names sharing a concrete locator are all retained for review',async()=>{
 const api=await load(),x=unit('other-name','甲城东宅这一处空间称为会客间。',400),s=sources([a,x])
 const l=api.appendSceneRosterBatch(api.createSceneIdentityLedger(s),[record(a,'甲城东宅'),record(x,'甲城东宅','会客间')],[a,x],s)
 assert.equal(api.planSceneIdentityLinkWave(l,s,()=>true,15).pendingTaskCount,1)
})
test('CI06: a new intermediate mention cannot transitively undo author separation',async()=>{
 const api=await load(),z=unit('bridge','后章的书房归属暂不明确。',400),s=sources([a,b,z])
 let l=api.appendSceneRosterBatch(api.createSceneIdentityLedger(s),[record(a,'甲城东宅'),record(b,'乙城西宅')],[a,b],s)
 l=api.applySceneIdentityChange(l,{op:'partition',identityIds:l.identities.map(i=>i.id),expectedLedgerHash:l.ledgerHash,explanation:'两处具体地点保持分别归属',parts:l.identities.map(i=>({memberKeys:i.memberKeys,state:'concrete',nameParts:i.nameParts,parent:{state:'unknown'}}))},s)
 assert.equal(l.decisions.length,1)
 const rows=[a,b].map(u=>({name:'书房',aliases:[],mentions:[{literal:'书房',evidence:{unitId:u.id,quote:u.text}},{literal:'书房',evidence:{unitId:z.id,quote:z.text}}],context:[],links:[]}))
 const held=api.appendSceneRosterBatch(l,rows,[a,b,z],s)
 assert.equal(held.records.length,l.records.length+2);assert.equal(held.members.length,3);assert.ok(held.identities.some(i=>i.state==='unresolved'))
 for(const old of l.identities)assert.deepEqual(held.identities.find(i=>i.id===old.id)?.memberKeys,old.memberKeys)
})
test('CI06: contradictory model relationships retain every original record for normal confirmation',async()=>{
 const api=await load(),units=[a,b,c],s=sources(units),rows=units.map((u,i)=>({...record(u,i===1?'乙城西宅':'甲城东宅'),links:i===0?[{targetIndex:1,relation:'same-place',evidence:[{unitId:u.id,quote:u.text}]},{targetIndex:2,relation:'different-place',evidence:[{unitId:u.id,quote:u.text}]}]:i===1?[{targetIndex:2,relation:'same-place',evidence:[{unitId:u.id,quote:u.text}]}]:[]}))
 const l=api.appendSceneRosterBatch(api.createSceneIdentityLedger(s),rows as any,units,s)
 assert.equal(l.records.length,3);assert.equal(l.members.length,3);assert.equal(l.relations.length,3);assert.ok(l.identities.some(i=>i.state==='unresolved'))
 assert.ok(api.buildSceneWizardCandidates(l).some(c=>c.sceneIdentityState==='unresolved'));api.assertSceneIdentityLedger(l,s)
})
test('CI06: long context stays intact while an existing short label is usable in the normal checklist',async()=>{
 const api=await load(),long='甲'.repeat(55)+'宅',u=unit('long-name',long+'的书房在东宅这一处。'),s=sources([u]),row={...record(u,'东宅'),context:[{label:long,evidence:[{unitId:u.id,quote:u.text}]},{label:'东宅',evidence:[{unitId:u.id,quote:u.text}]}]}
 const l=api.appendSceneRosterBatch(api.createSceneIdentityLedger(s),[row],[u],s),candidate=api.buildSceneWizardCandidates(l)[0]
 assert.ok(candidate.name.length<=50);assert.equal(l.records[0].context.length,2);assert.equal(l.records[0].context[0].label,long)
 const changed=api.applySceneIdentityChange(l,{op:'label',identityId:candidate.id,expectedLedgerHash:l.ledgerHash,explanation:'采用原文已有的有据短称',nameParts:[{kind:'context',key:l.records[0].context[1].key},{kind:'literal',key:l.members[0].key}]},s)
 assert.equal(api.buildSceneWizardCandidates(changed)[0].name,'东宅·书房')
})
test('CI04: unknown-only link progress preserves identity hash and is not paid twice',async()=>{
 const {api,s,ledger}=await fixture([a,c]),plan=api.planSceneIdentityLinkWave(ledger,s,()=>true,15),packet=plan.packets[0]
 const next=api.applySceneIdentityLinkWave(plan.ledger,[{packet,decisions:packet.context.tasks.map(t=>({taskIndex:t.taskIndex,result:'unknown',evidence:[]}))}],s)
 assert.equal(next.identityRevision,plan.ledger.identityRevision);assert.equal(next.ledgerHash,plan.ledger.ledgerHash);assert.equal(api.planSceneIdentityLinkWave(next,s,()=>true,15).pendingTaskCount,0)
})
test('CI12: source rows preserve contiguous same-ID slices and separate same-title blocks',async()=>{
 const api=await load(),partA=unit('shared-id','第一份完整资料。',500),partB=unit('shared-id','第二份完整资料。',500+partA.text.length)
 for(const blocks of [
  [{artifactId:'src',blockIndex:0,sourceName:'同名资料',nameOrigin:'filename' as const,text:partA.text+partB.text,units:[partA,partB]}],
  [partA,partB].map((u,i)=>({artifactId:'src',blockIndex:i,sourceName:'同名资料',nameOrigin:'filename' as const,text:u.text,units:[u]})),
 ]){
  const s={...sources([a,c]),sourceBlocks:blocks};let l=api.appendSceneRosterBatch(api.createSceneIdentityLedger(s),[record(a,'甲城东宅'),record(c,'甲城东宅')],[a,c],s)
  const withSource=l.identities.filter(i=>i.memberKeys.some(k=>l.members.find(m=>m.key===k)?.origin==='source-block')),first=l.identities.find(i=>i.memberKeys.some(k=>{const m=l.members.find(m=>m.key===k);return m?.origin==='body'&&m.range.unitId===a.id}))!
  l=api.applySceneIdentityChange(l,{op:'partition',expectedLedgerHash:l.ledgerHash,explanation:'合成资料来源完整归属核对',identityIds:[first.id,...withSource.map(i=>i.id)],parts:[{memberKeys:[...first.memberKeys,...withSource.flatMap(i=>i.memberKeys)],state:'concrete',nameParts:first.nameParts,parent:{state:'unknown'}}]},s)
  const p=api.planSceneIdentityLinkWave(l,s,()=>true,15).packets[0],row=p.context.records.find(r=>r.sourceBlocks?.length)!
  assert.equal(row.sourceBlocks!.length,blocks.length);assert.equal(p.units.filter(u=>u.id==='shared-id').length,1)
  for(const mapping of row.sourceBlocks!){const member=row.members.find(m=>m.key===mapping.memberKey)!;assert.equal(member.origin,'source-block');const restored=mapping.ranges.map(r=>p.units.find(u=>u.id===r.unitId)!.text.slice(r.start,r.end)).join('');assert.equal(hash(restored),member.origin==='source-block'?member.blockHash:'')}
 }
})
test('CI12: original source supports bridge real gaps without expanding block ownership',async()=>{
 const api=await load(),left=unit('gap-id','甲资料完整内容。',500),gap='\r\n实际标题\r\n',right=unit('gap-id','乙资料完整内容。',left.end+gap.length),whole=unit('gap-id',left.text+gap+right.text,left.start)
 const blocks=[left,right].map((u,i)=>({artifactId:'src-gap',blockIndex:i,sourceName:'同标题',nameOrigin:'filename' as const,text:u.text,units:[u,whole]})),s={...sources([a,c]),sourceBlocks:blocks}
 for(const block of blocks)assert.deepEqual(api.sceneSourceBlockOwnedUnits(block).map(u=>u.text),[block.text])
 let l=api.appendSceneRosterBatch(api.createSceneIdentityLedger(s),[record(a,'甲城东宅'),record(c,'甲城东宅')],[a,c],s)
 const sourceIds=l.identities.filter(i=>i.memberKeys.some(k=>l.members.find(m=>m.key===k)?.origin==='source-block')).map(i=>i.id),first=l.identities.find(i=>i.memberKeys.some(k=>{const m=l.members.find(m=>m.key===k);return m?.origin==='body'&&m.range.unitId===a.id}))!
 l=api.applySceneIdentityChange(l,{op:'partition',expectedLedgerHash:l.ledgerHash,explanation:'原来源明确对应同一有据目标',identityIds:[first.id,...sourceIds],parts:[{memberKeys:[...first.memberKeys,...l.identities.filter(i=>sourceIds.includes(i.id)).flatMap(i=>i.memberKeys)],state:'concrete',nameParts:first.nameParts,parent:{state:'unknown'}}]},s)
 const plan=api.planSceneIdentityLinkWave(l,s,()=>true,15),packet=plan.packets[0],sourceRow=packet.context.records.find(r=>r.sourceBlocks?.length)!
 assert.equal(packet.units.find(u=>u.id==='gap-id')?.text,whole.text)
 const bindings=sourceRow.sourceBlocks!;assert.equal(bindings.length,2)
 assert.deepEqual(bindings.map(v=>v.ranges.map(r=>packet.units.find(u=>u.id===r.unitId)!.text.slice(r.start,r.end)).join('')),[left.text,right.text])
 const next=api.applySceneIdentityLinkWave(plan.ledger,[{packet,decisions:packet.context.tasks.map(t=>({taskIndex:t.taskIndex,result:'same-place',evidence:[{unitId:whole.id,quote:whole.text}]}))}],s)
 api.assertSceneIdentityLedger(next,s);assert.equal(next.relations.at(-1)?.evidence[0].unitHash,hash(whole.text));assert.equal(api.planSceneIdentityLinkWave(next,s,()=>true,15).pendingTaskCount,0)
 const membership=api.sceneIdentityMemberships(next,[whole],s)[0]
 assert.equal(membership.ownedRanges.some(r=>whole.text.slice(r.start,r.end).includes('实际标题')),false)
 const noOriginal={...s,sourceBlocks:blocks.map(b=>({...b,units:[b.units[0]]}))}
 let missing=api.createSceneIdentityLedger(noOriginal);missing=api.appendSceneRosterBatch(missing,[record(a,'甲城东宅'),record(c,'甲城东宅')],[a,c],noOriginal)
 const body=missing.identities.find(i=>i.memberKeys.some(k=>{const m=missing.members.find(m=>m.key===k);return m?.origin==='body'&&m.range.unitId===a.id}))!,src=missing.identities.filter(i=>i.memberKeys.some(k=>missing.members.find(m=>m.key===k)?.origin==='source-block'))
 missing=api.applySceneIdentityChange(missing,{op:'partition',expectedLedgerHash:missing.ledgerHash,explanation:'完整原值仍缺不能推测gap',identityIds:[body.id,...src.map(i=>i.id)],parts:[{memberKeys:[...body.memberKeys,...src.flatMap(i=>i.memberKeys)],state:'concrete',nameParts:body.nameParts,parent:{state:'unknown'}}]},noOriginal)
 assert.throws(()=>api.planSceneIdentityLinkWave(missing,noOriginal,()=>true,15))
})
test('CI13: a new working namespace retains audit but cannot replay an old partition',async()=>{
 const api=await load(),s=sources([a,b]),rows=[{name:'书房',aliases:[],mentions:[{literal:'书房',evidence:{unitId:a.id,quote:a.text}},{literal:'书房',evidence:{unitId:b.id,quote:b.text}}],context:[],links:[]}]
 let l=api.appendSceneRosterBatch(api.createSceneIdentityLedger(s),rows,[a,b],s)
 l=api.applySceneIdentityChange(l,{op:'partition',expectedLedgerHash:l.ledgerHash,explanation:'原工作版本两处分别保留',identityIds:l.identities.map(i=>i.id),parts:l.members.map(m=>({memberKeys:[m.key],state:'source-scoped',nameParts:[{kind:'literal',key:m.key}],parent:{state:'unknown'}}))},s)
 const later={...s,workingRevision:1},base=api.createSceneIdentityLedger(later,l)
 assert.equal(base.sourceScopeHash,hash({version:1,workingRevision:1,workingUnits:[a,b].map(u=>({id:u.id,fileId:u.fileId,start:u.start,end:u.end,textHash:hash(u.text)})),selectedSceneSourceBlocks:[]}))
 const current=api.appendSceneRosterBatch(base,rows,[a,b],later)
 assert.deepEqual(current.decisions,l.decisions);assert.equal(current.identities.length,1);assert.ok(current.members.every(m=>!l.members.some(old=>old.key===m.key)))
})
test('CI03: an explicit registry is authoritative even without the optional legacy version',async()=>{
 const {api,ledger}=await fixture(),ids=ledger.identities.map(i=>i.id),registry=api.sceneIdentityRegistry(ledger)
 const art=(id:string):ImportArtifact=>({id,kind:'scene',name:'同名',schema:2,text:'原值',facts:{entityType:'PLACE'},evidence:[{unitId:a.id,quote:a.text}],sourceUnitIds:[a.id],origin:'inferred'})
 assert.equal(mergeImportArtifacts([art(ids[0])],[art(ids[1])],undefined,[],registry).artifacts.length,2)
 assert.throws(()=>mergeImportArtifacts([], [art('outside')],undefined,[],registry))
})
test('CI05: each persisted collection has its exact structural capacity, not a duplicate-key proxy',async t=>{
 const {sceneIdentityLedgerSchema}=await import('../../desktop/shared/novel-import-scene-identity'),key=(i:number)=>(i+1).toString(16).padStart(64,'0'),range={unitId:'u',unitHash:key(90000),start:0,end:2}
 const identity=(i:number)=>({id:'s-'+i.toString(16).padStart(16,'0'),memberKeys:[key(i)],recordKeys:[key(i+50000)],state:'source-scoped',nameParts:[{kind:'literal',key:key(i)}],parent:{state:'unknown'}})
 const arrays:{field:string;max:number;row:(i:number)=>unknown}[]=[
  {field:'members',max:50000,row:i=>({key:key(i),origin:'body',literal:'房间',range:{...range,start:i*2,end:i*2+2},evidenceRange:{...range,start:i*2,end:i*2+2}})},
  {field:'records',max:50000,row:i=>({key:key(i),batchKey:key(90000),name:'房间'+i,aliases:[],memberKeys:[key(i)],context:[]})},
  {field:'identities',max:5000,row:identity},
  {field:'linkTasks',max:20000,row:i=>({key:key(i),type:'identity',leftKey:key(i),rightKey:key(i+1),basisHash:key(90000)})},
  {field:'relations',max:20000,row:i=>({key:key(i),leftKey:key(i),rightKey:key(i+1),relation:'different-place',evidence:[range],basis:'model'})},
  {field:'decisions',max:20000,row:i=>({key:key(i),previousLedgerHash:key(90000),revision:i,operation:'label',explanation:'有据原值核对',memberKeys:[key(i)],before:[identity(i)],after:[identity(i)]})},
  {field:'ownershipReviewed',max:50000,row:key},
 ]
 for(const spec of arrays)await t.test(spec.field,()=>{const schema=(sceneIdentityLedgerSchema.shape as any)[spec.field],values=Array.from({length:spec.max},(_,i)=>spec.row(i));assert.equal(schema.safeParse(values).success,true);assert.equal(schema.safeParse([...values,spec.row(spec.max)]).success,false)})
})
test('CI05: reference count and UTF8 journal limits keep their exact boundaries',async()=>{
 const api=await load(),n=25000,units=Array.from({length:n},(_,i)=>unit('refs-'+i,`第${i}处甲宅的房间有陈设。`,i*100)),row={name:'房间',aliases:[],mentions:units.map(u=>({literal:'房间',evidence:{unitId:u.id,quote:u.text}})),context:units.map(u=>({label:'甲宅',evidence:[{unitId:u.id,quote:u.text}]})),links:[]}
 api.validateSceneRosterRecords([row],units)
 const extra={label:'陈设',evidence:[{unitId:units[0].id,quote:units[0].text}]};assert.throws(()=>api.validateSceneRosterRecords([{...row,context:[...row.context,extra]}],units),e=>(e as {reason?:string}).reason==='capacity')
 const {ledger,s}=await fixture(),{emptyWizardState}=await import('../../desktop/core/novel-import-wizard-state'),{encodeImportJournal,IMPORT_JOURNAL_MAX_BYTES}=await import('../../desktop/main/novel-import'),w=emptyWizardState(),text=a.text+' '.repeat(b.start-a.end)+b.text
 w.sceneIdentity=ledger
 const session:ImportSession={version:1,id:'pure-journal',revision:0,phase:'select',title:'😀合成',files:[{id:'working-0',name:'合成.txt',path:'/private/tmp/synthetic',format:'txt',bytes:Buffer.byteLength(text),hash:hash(text),text,included:true}],units:[a,b],selected:['body'],targets:['scene'],infer:false,artifacts:[],conflicts:[],patches:[],originalProse:text,workingProse:text,workingRevision:s.workingRevision,workingUnits:[a,b],chapters:[],steps:[],coverage:{},notFound:[],epoch:0,createdAt:'',updatedAt:'',decisions:[],wizardVersion:1,wizard:w}
 const encoded=encodeImportJournal(session),bytes=Buffer.byteLength(encoded,'utf8');assert.equal(IMPORT_JOURNAL_MAX_BYTES,1024*1024*1024);assert.equal(encodeImportJournal(session,bytes),encoded);assert.throws(()=>encodeImportJournal(session,bytes-1),/容量/)
})
test('CI05: 32-record and 64-task packets retain the complete actual task set',async()=>{
 const api=await load(),units=Array.from({length:32},(_,i)=>unit('packet-'+i,`第${i}处甲宅的房间有物件。`,i*100)),s=sources(units)
 const l=api.appendSceneRosterBatch(api.createSceneIdentityLedger(s),units.map(u=>record(u,'甲宅','房间')),units,s),planned=api.planSceneIdentityLinkWave(l,s,()=>true,15)
 assert.equal(planned.pendingTaskCount,32*31/2);assert.equal(planned.packets.flatMap(p=>p.context.tasks).length,planned.pendingTaskCount)
 assert.ok(planned.packets.some(p=>p.context.records.length===32));assert.ok(planned.packets.some(p=>p.context.tasks.length===64))
 const next=api.applySceneIdentityLinkWave(planned.ledger,planned.packets.map(packet=>({packet,decisions:packet.context.tasks.map(t=>({taskIndex:t.taskIndex,result:'unknown' as const,evidence:[]}))})),s)
 assert.equal(next.ledgerHash,l.ledgerHash);assert.equal(api.planSceneIdentityLinkWave(next,s,()=>true,15).pendingTaskCount,0)
})
test('CI05: relation plus author-history capacity is checked on otherwise valid unique records',async()=>{
 const api=await load(),text=Array.from({length:20000},(_,i)=>`第${i}条，两处不相互隶属。\n`).join(''),e=unit('capacity-evidence',text,1000),s=sources([a,b,e])
 const l=api.appendSceneRosterBatch(api.createSceneIdentityLedger(s),[record(a,'甲城东宅'),record(b,'乙城西宅')],[a,b],s),keys=l.members.map(m=>m.key),changed=structuredClone(l),evidenceHash=hash(e.text);let start=0
 changed.relations=Array.from({length:20000},(_,i)=>{const quote=`第${i}条，两处不相互隶属。\n`,range={unitId:e.id,unitHash:evidenceHash,start,end:start+quote.length};start+=quote.length;const r={leftKey:keys[0],rightKey:keys[1],relation:'not-parent' as const,evidence:[range],basis:'model' as const};return {key:hash(r),...r}})
 const rehash=()=>{const {ledgerHash:_h,linkTasks:_t,ownershipReviewed:_o,...bound}=changed;changed.ledgerHash=hash(bound)}
 rehash();api.assertSceneIdentityLedger(changed,s)
 changed.decisions=[{key:hash('author'),previousLedgerHash:l.ledgerHash,revision:1,operation:'label',explanation:'合成独立有效历史记录',memberKeys:[keys[0]],before:[l.identities[0]],after:[l.identities[0]]}]
 rehash();assert.throws(()=>api.assertSceneIdentityLedger(changed,s),err=>(err as {reason?:string}).reason==='capacity')
})
test('CI09/12: material hull uses real original gap bytes, while quote proof unions only adjacent owned spans',async()=>{
 const api=await load(),full=unit('hull','前甲段真实间隔乙段后'),left={...full,start:1,end:3,text:'甲段'},right={...full,start:7,end:9,text:'乙段'},s=sources([full])
 assert.deepEqual(api.sceneIdentityMaterialUnits([left,right],s),[{...full,start:1,end:9,text:full.text.slice(1,9)}])
 assert.throws(()=>api.sceneIdentityMaterialUnits([left,{...right,text:'伪造'}],s))
 const q=unit('adjacent','甲段乙段'),range=(start:number,end:number)=>({unitId:q.id,unitHash:hash(q.text),start,end}),id='s-'+'1'.repeat(16),member='1'.repeat(64),base={identityId:id,memberKeys:[member],contextRanges:[]}
 api.assertSceneIdentityEvidence({unitId:q.id,quote:q.text},[q],[{...base,ownedRanges:[range(0,2),range(2,4)]}],id)
 assert.throws(()=>api.assertSceneIdentityEvidence({unitId:q.id,quote:q.text},[q],[{...base,ownedRanges:[range(0,1),range(2,4)]}],id))
 assert.throws(()=>api.assertSceneIdentityEvidence({unitId:q.id,quote:q.text},[q],[{...base,ownedRanges:[range(0,2)],contextRanges:[range(2,4)]}],id))
})
test('CI12: owned source prefixes cannot duplicate or reverse actual source geometry',async()=>{
 const api=await load(),one=unit('same','aa'),base={artifactId:'source',blockIndex:0,sourceName:'来源',nameOrigin:'filename' as const,text:'aaaa',units:[one,one]}
 assert.throws(()=>api.sceneSourceBlockOwnedUnits(base))
 assert.throws(()=>api.sceneSourceBlockOwnedUnits({...base,text:'aa',units:[one,one]}))
 const later=unit('later','bb',2);assert.throws(()=>api.sceneSourceBlockOwnedUnits({...base,text:'bbaa',units:[later,one]}))
 const blank=unit('blank','\r\n',2);assert.deepEqual(api.sceneSourceBlockOwnedUnits({...base,text:'aa\r\n',units:[one,blank]}).map(u=>u.text),['aa','\r\n'])
})
test('CI03/06: splitting a mistaken alias group does not give each place the other place name',async()=>{
 const api=await load(),x=unit('east','东宅书房被称为房间，有红桌。'),y=unit('west','西宅书房被称为房间，有蓝桌。',100),s=sources([x,y]),row={name:'房间',aliases:['东宅书房','西宅书房'],mentions:[{literal:'房间',evidence:{unitId:x.id,quote:x.text}},{literal:'东宅书房',evidence:{unitId:x.id,quote:x.text}},{literal:'房间',evidence:{unitId:y.id,quote:y.text}},{literal:'西宅书房',evidence:{unitId:y.id,quote:y.text}}],context:[],links:[]}
 let l=api.appendSceneRosterBatch(api.createSceneIdentityLedger(s),[row],[x,y],s)
 l=api.applySceneIdentityChange(l,{op:'partition',identityIds:l.identities.map(i=>i.id),expectedLedgerHash:l.ledgerHash,explanation:'两处真实地点分别保留原文称呼',parts:[x,y].map(u=>{const members=l.members.filter(m=>m.origin==='body'&&m.range.unitId===u.id);return {memberKeys:members.map(m=>m.key),state:'source-scoped',nameParts:[{kind:'literal',key:members.find(m=>m.origin==='body'&&m.literal!=='房间')!.key}],parent:{state:'unknown'}}})},s)
 const candidates=api.buildSceneWizardCandidates(l)
 assert.ok(!candidates.find(c=>c.name==='东宅书房')!.aliases.includes('西宅书房'));assert.ok(!candidates.find(c=>c.name==='西宅书房')!.aliases.includes('东宅书房'));assert.equal(l.records[0].aliases.length,2)
})
test('CI04: a real service request accepts link projections while outside-parent constraints stay in the ledger',async()=>{
 const api=await load(),{runImportAi}=await import('../../desktop/service/novel-import-ai'),x=unit('parent-x','甲城的书房有红桌。'),y=unit('parent-y','甲城的书房又有新描述。',100),s=sources([x,y]),rows=[{...record(x,'甲城'),links:[{targetIndex:2,relation:'parent' as const,evidence:[{unitId:x.id,quote:x.text}]}]},record(y,'甲城'),{name:'甲城',aliases:[],mentions:[{literal:'甲城',evidence:{unitId:x.id,quote:x.text}}],context:[],links:[]}]
 const l=api.appendSceneRosterBatch(api.createSceneIdentityLedger(s),rows,[x,y],s),plan=api.planSceneIdentityLinkWave(l,s,()=>true,15),p=plan.packets[0],model={id:'m',name:'合成',modelId:'synthetic',endpoint:'https://synthetic.invalid/v1',authRevision:1,contextWindow:1048576};let calls=0
 const result=await runImportAi({semanticVersion:1,operationId:'pure-link-service',phase:'analyze',intent:'roster',kind:'scene',sceneIdentity:p.context,units:p.units,artifacts:[],models:{text:model},workingRevision:0},new AbortController().signal,{resolve:async()=>model,assert:async()=>{},generate:async()=>{calls++;return {sceneIdentityDecisions:p.context.tasks.map(t=>({taskIndex:t.taskIndex,result:'unknown' as const,evidence:[]}))}}})
 assert.equal(calls,1);assert.ok(result.sceneIdentityDecisions?.length);assert.equal(l.relations.filter(r=>r.relation==='parent').length,1)
 const next=api.applySceneIdentityLinkWave(plan.ledger,[{packet:p,decisions:result.sceneIdentityDecisions!}],s);assert.deepEqual(next.identities.map(i=>i.parent),l.identities.map(i=>i.parent))
})
