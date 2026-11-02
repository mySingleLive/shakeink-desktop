import assert from 'node:assert/strict'
import {test} from 'node:test'
import {emptyWizardState} from '../../desktop/core/novel-import-wizard-state'
import {importActionSchema,type ImportSession} from '../../desktop/shared/novel-import'
import {importHash,toImportView} from '../../desktop/core/novel-import'
import {fixture,toSceneRoster,allCuts,source} from '../helpers/novel-import-wizard-fixture'
import {runImportAi,generateImportAiJson} from '../../desktop/service/novel-import-ai'
import {importLeaseTarget} from '../../desktop/service/novel-import-publish'
import {assertSceneIdentityEvidence,expectedSceneOwnershipKeys,createSceneIdentityLedger,appendSceneRosterBatch,sceneIdentityMemberships} from '../../desktop/core/novel-import-scene-identity'
import {sceneOwnedUnits,sceneOwnedEvidenceOptions,assertSceneRosterCanonical} from '../../desktop/main/novel-import-scene-identity'
import type {ImportAiRequest} from '../../desktop/shared/novel-import'
import type {ResolvedModel} from '../../src/lib/ai/provider'

const id='00000000-0000-4000-8000-000000000324',identityId='s-0123456789abcdef',hash='a'.repeat(64)
test('CI-M01: a new wizard enables concrete scene identities without migrating old state',()=>{
 assert.equal((emptyWizardState() as unknown as {sceneIdentityVersion?:number}).sceneIdentityVersion,1)
})

const firstPlace='甲城东宅里的书房有蓝色墙壁。',secondPlace='乙城西宅里的书房有红色墙壁。'
const thirdPlace='丙城南宅里的书房有绿色墙壁。'
async function concreteSceneFixture(discoverThird=false,sameLocator=false,longQuote=false){
 let rosterCalls=0,reviewCalls=0
 const first=longQuote?'完整😀\r\n'.repeat(90)+firstPlace:firstPlace,second=sameLocator?'甲城东宅里的阅览室有红色墙壁。':secondPlace,text='第一章 两处地点\n\n'+first+'\r\n'+second+'这两处空间是不同的具体地点。\n'+(discoverThird?thirdPlace:'')
 const f=await fixture([source(text,'合成正文.txt','f-body')],async r=>{
  if(r.intent==='structure')return allCuts(r)
  if(r.phase==='classify')return {classifications:r.units.map(u=>({unitId:u.id,kind:'body'}))}
  let raw:unknown
  if(r.sceneIdentity?.mode==='roster'){rosterCalls++;raw={roster:[first,second,...(discoverThird&&rosterCalls>1?[thirdPlace]:[])].flatMap(quote=>r.units.filter(u=>u.text.includes(quote)).map(u=>{const literal=quote.includes('阅览室')?'阅览室':'书房';return {name:literal,aliases:[],mentions:[{literal,evidence:{unitId:u.id,quote}}],context:[{label:quote.match(/甲城东宅|乙城西宅|丙城南宅/u)![0],evidence:[{unitId:u.id,quote}]}],links:[]}}))}}
  else if(r.sceneIdentity?.mode==='links')raw={sceneIdentityDecisions:r.sceneIdentity.tasks.map(t=>({taskIndex:t.taskIndex,result:t.type==='parent'?'not-parent':'different-place',evidence:r.units.flatMap(u=>[first,second].filter(q=>u.text.includes(q)).map(quote=>({unitId:u.id,quote})))}))}
  else if(r.intent==='entity'){
   const target=r.entities!.find(e=>e.id===r.entityTarget!.id)!,own=r.sceneIdentity?.mode==='ownership'?r.sceneIdentity.memberships.find(m=>m.identityId===target.id):undefined
   assert.ok(own,'fresh entity input must carry its actual ownership')
   for(const option of r.entityTarget?.evidenceOptions??[])assertSceneIdentityEvidence(option,r.units,r.sceneIdentity?.mode==='ownership'?r.sceneIdentity.memberships:[],target.id)
   const range=own.ownedRanges[0],unit=r.units.find(u=>u.id===range.unitId)!,quote=unit.text.slice(range.start,range.end)
   raw={artifacts:[{id:target.id,kind:'scene',name:target.name,text:quote+'该地点的合成资料。',facts:{coordinates:quote.slice(0,4)},evidence:[{unitId:unit.id,quote}],origin:'inferred'}]}
  }else if(r.phase==='review'){reviewCalls++;const unit=r.units.find(u=>u.text.includes(thirdPlace));raw={conflicts:[],missingTargets:discoverThird&&reviewCalls===1&&unit?[{kind:'scene',unitIds:[unit.id],evidence:[{unitId:unit.id,quote:thirdPlace}],reason:'第三处具体书房尚无独立的场景资料'}]:[]}}
  else return {notFound:true}
  return runImportAi(r,new AbortController().signal,{resolve:async role=>r.models[role]!,assert:async()=>{},generate:async(input,_model,signal,prompt)=>generateImportAiJson(input,{userId:'synthetic-main-ci',resolvedModel:{} as ResolvedModel},signal,prompt,{generateText:async()=>({text:JSON.stringify(raw),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'})})})
 })
 return f
}

test('CI-M04/09/10: fresh homonyms stay separate through owned input, full review and the publish gate',async()=>{
 const f=await concreteSceneFixture()
 try{
  const roster=await toSceneRoster(f),list=roster.wizard!.candidates.scene!
  assert.equal(roster.wizard!.stepState['detect-scene'],'waiting');assert.equal(list.length,2);assert.equal(new Set(list.map(c=>c.id)).size,2);assert.ok(list.every(c=>c.selected))
  await f.act('wizard-next');const view=await f.settle(),s=await f.journal()
  assert.equal(view.wizard!.step,'verify');assert.equal(s.artifacts.filter(a=>a.kind==='scene').length,2);assert.ok(s.wizard!.tasks.every(t=>t.state==='done'));assert.deepEqual(s.wizard!.skipped,[]);assert.deepEqual(s.wizard!.dropped,[])
  const ledger=s.wizard!.sceneIdentity!,keys=expectedSceneOwnershipKeys(ledger,s.artifacts,new Set(list.map(c=>c.id)))
  assert.equal(keys.length,2);assert.deepEqual([...ledger.ownershipReviewed].sort(),[...keys].sort());assert.ok(view.wizard!.checks?.every(c=>c.ok))
  const entityRequests=f.requests.filter(r=>r.intent==='entity');assert.equal(entityRequests.length,2)
  for(const r of entityRequests){assert.equal(r.sceneIdentity?.mode,'ownership');assert.ok(r.entityTarget!.evidenceOptions?.length);assert.ok(r.entityTarget!.evidenceOptions!.every(e=>e.quote===firstPlace||e.quote===secondPlace))}
  await f.act('wizard-next');await f.settle();assert.equal(f.published?.phase,'publishing');assert.equal((await f.view()).phase,'completed')
  let admitted=0;const published=f.published!,works={importLeaseTarget:async()=>{admitted++;throw Error('SYNTHETIC_LEASE_ADMITTED')}} as unknown as Parameters<typeof importLeaseTarget>[0]
  await assert.rejects(importLeaseTarget(works,{session:published,selection:published.target!,importHash:published.publication!.hash!},()=>{}),/SYNTHETIC_LEASE_ADMITTED/u)
  assert.equal(admitted,1,'the real publication admission must accept all genuine completed proof before reaching the workspace boundary')
 }finally{await f.dispose()}
})

test('CI-M05/11: a discovered physical place is registered and imported instead of dropped as outside the old list',async()=>{
 const f=await concreteSceneFixture(true)
 try{
  const roster=await toSceneRoster(f);assert.equal(roster.wizard!.candidates.scene!.length,2)
  await f.act('wizard-next');const view=await f.settle(),s=await f.journal()
  assert.equal(s.artifacts.filter(a=>a.kind==='scene').length,3)
  assert.equal(s.wizard!.candidates.scene!.filter(c=>c.selected).length,3);assert.deepEqual(s.wizard!.dropped,[]);assert.deepEqual(s.wizard!.skipped,[])
  const requests=f.requests.filter(r=>r.sceneIdentity?.mode==='roster');assert.equal(requests.length,2)
  assert.ok(s.semanticState?.omissions.every(o=>o.done));assert.ok(view.wizard!.checks?.every(c=>c.ok));assert.equal(s.wizard!.sceneIdentity!.ownershipReviewed.length,3)
  assert.equal(f.requests.filter(r=>r.intent==='entity').length,3)
 }finally{await f.dispose()}
})

test('CI-M06: main independently rejects malformed canonical roster pairs and sidecars outside their stage',async t=>{
 await t.test('public roster must correspond to every complete record',async()=>{
  const f=await concreteSceneFixture(),base=f.handler()
  f.setAi(async r=>{const result=await base(r);return r.sceneIdentity?.mode==='roster'?{...result,roster:result.roster!.map((entry,i)=>i?entry:{...entry,name:'未被识别的名称'})}:result})
  try{const view=await toSceneRoster(f);assert.equal(view.wizard!.stepState['detect-scene'],'failed');assert.equal(view.wizard!.candidates.scene?.length??0,0);assert.equal((await f.journal()).coverage['roster:scene']?.length??0,0)}finally{await f.dispose()}
 })
 for(const mode of ['entity-empty-sidecar','review-undefined-sidecar'] as const)await t.test(mode,async()=>{
  const f=await concreteSceneFixture(),base=f.handler();await toSceneRoster(f)
  f.setAi(async r=>{const result=await base(r);return mode==='entity-empty-sidecar'&&r.intent==='entity'?{...result,sceneRosterRecords:[]}:mode==='review-undefined-sidecar'&&r.phase==='review'?{...result,sceneIdentityDecisions:undefined}:result})
  try{await f.act('wizard-next');const view=await f.settle(),s=await f.journal();if(mode==='entity-empty-sidecar'){assert.ok(s.wizard!.tasks.every(task=>task.state==='failed'));assert.equal(s.artifacts.length,0)}else{assert.equal(view.wizard!.stepState.verify,'failed');assert.equal(s.coverage.review?.length??0,0)}}finally{await f.dispose()}
 })
})

test('CI-M07/09: a separate locator unit is necessary context and cannot become a target citation',()=>{
 const a='甲城东宅位于东岸。',b='书房的窗户朝南。',units=[{id:'locator-a',fileId:'working-0',start:0,end:a.length,text:a,kind:'body' as const},{id:'literal-b',fileId:'working-0',start:a.length,end:a.length+b.length,text:b,kind:'body' as const}],sources={workingRevision:0,workingUnits:units,sourceBlocks:[]}
 const ledger=appendSceneRosterBatch(createSceneIdentityLedger(sources),[{name:'书房',aliases:[],mentions:[{literal:'书房',evidence:{unitId:'literal-b',quote:b}}],context:[{label:'甲城东宅',evidence:[{unitId:'locator-a',quote:a}]}],links:[]}],units,sources),identity=ledger.identities[0]
 const input=sceneOwnedUnits(ledger,sources,identity.id);assert.deepEqual(input.map(u=>u.id).sort(),['literal-b','locator-a']);assert.equal(input[0].id,'literal-b','bounded first material must include the actual target')
 const memberships=sceneIdentityMemberships(ledger,input,sources),own=memberships.find(m=>m.identityId===identity.id)!
 assert.ok(own.contextRanges.some(r=>r.unitId==='locator-a'));assert.ok(!own.ownedRanges.some(r=>r.unitId==='locator-a'))
 assert.deepEqual(sceneOwnedEvidenceOptions(memberships,input,identity.id),[{unitId:'literal-b',quote:b}]);assert.throws(()=>assertSceneIdentityEvidence({unitId:'locator-a',quote:a},input,memberships,identity.id))
})

test('CI-M08: a model change after identity replies but before the final source check cannot commit links',async()=>{
 const f=await concreteSceneFixture(false,true),base=f.handler();let afterLink=false,flipped=false,pins:ImportAiRequest['models']|undefined
 f.setAi(async r=>{const result=await base(r);if(r.sceneIdentity?.mode==='links'){pins=r.models;afterLink=true}return result})
 f.options.verifySources=async()=>{if(afterLink&&!flipped){flipped=true;f.setModels({text:{...pins!.text!,authRevision:pins!.text!.authRevision+1},review:pins!.review})}}
 try{const view=await toSceneRoster(f),s=await f.journal();assert.equal(flipped,true,'the change occurs in the final source check after AI returned');assert.equal(view.wizard!.stepState['detect-scene'],'failed');assert.equal(s.wizard!.sceneIdentity!.relations.length,0);assert.ok(s.wizard!.sceneIdentity!.linkTasks.every(t=>!t.result));assert.equal(f.requests.filter(r=>r.intent==='entity').length,0)}finally{await f.dispose()}
})

test('CI-M09: main accepts the service canonical evidence when valid mentions arrive in reverse source order',async()=>{
 const a='东宅书房有蓝色墙壁。',b='这间书房仍在东宅，窗户朝南。',units=[{id:'first',fileId:'working-0',start:0,end:a.length,text:a,kind:'body' as const},{id:'second',fileId:'working-0',start:a.length,end:a.length+b.length,text:b,kind:'body' as const}],model={id:'order-model',name:'合成模型',modelId:'synthetic',endpoint:'https://synthetic.invalid/v1',authRevision:1,contextWindow:16000}
 const request:ImportAiRequest={operationId:'order-probe',semanticVersion:1,phase:'analyze',intent:'roster',kind:'scene',sceneIdentity:{version:1,mode:'roster'},units,artifacts:[],models:{text:model,review:model}},raw={roster:[{name:'书房',aliases:[],mentions:[{literal:'书房',evidence:{unitId:'second',quote:b}},{literal:'书房',evidence:{unitId:'first',quote:a}}],context:[{label:'东宅',evidence:[{unitId:'first',quote:a}]}],links:[]}]}
 const result=await runImportAi(request,new AbortController().signal,{resolve:async()=>model,assert:async()=>{},generate:async(input,_m,signal,prompt)=>generateImportAiJson(input,{userId:'synthetic-order',resolvedModel:{} as ResolvedModel},signal,prompt,{generateText:async()=>({text:JSON.stringify(raw),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'})})}),before=structuredClone(result)
 assert.equal(result.roster![0].evidence.unitId,'first');assert.doesNotThrow(()=>assertSceneRosterCanonical(result,units));assert.deepEqual(result,before);assert.deepEqual(result.sceneRosterRecords,raw.roster)
})

test('CI-M10: long grounded mentions keep full material while entity convenience citations fit their original encoding limit',async()=>{
 const f=await concreteSceneFixture(false,false,true)
 try{const roster=await toSceneRoster(f);assert.equal(roster.wizard!.candidates.scene!.length,2);await f.act('wizard-next');const view=await f.settle(),s=await f.journal();assert.equal(view.wizard!.step,'verify');assert.ok(view.wizard!.checks?.every(c=>c.ok));assert.equal(s.artifacts.length,2)
  const long=s.wizard!.sceneIdentity!.members.find(m=>m.origin==='body'&&m.evidenceRange.end-m.evidenceRange.start>512);assert.ok(long,'the full long ownership anchor is retained')
  const entity=f.requests.filter(r=>r.intent==='entity');assert.equal(entity.length,2);assert.ok(entity.some(r=>r.units.some(u=>u.text.includes('完整😀\r\n'.repeat(90)+firstPlace))));for(const r of entity)for(const option of r.entityTarget?.evidenceOptions??[]){assert.ok(option.quote.length<=512);assert.ok(option.quote.isWellFormed());assertSceneIdentityEvidence(option,r.units,r.sceneIdentity?.mode==='ownership'?r.sceneIdentity.memberships:[],r.entityTarget!.id)}
 }finally{await f.dispose()}
})

test('CI-M02: normal scene identity commands carry a frozen revision and ledger',async t=>{
 const common={id,revision:3,expectedLedgerHash:hash}
 const commands=[
  {type:'wizard-scene-identity',...common,op:'label',identityId,nameParts:[{kind:'literal',key:hash}],explanation:'合成原文中的有据短称。'},
  {type:'wizard-read-scene-identity',...common,identityId,cursor:0,limit:50},
  {type:'wizard-read-scene-source',...common,memberKey:hash,neighbor:0,offset:0,limit:32768},
 ]
 for(const command of commands)await t.test(command.type,()=>{
  assert.equal(importActionSchema.safeParse(command).success,true)
  assert.equal(importActionSchema.safeParse({...command,unknown:undefined}).success,false)
  assert.equal(importActionSchema.safeParse({...command,revision:undefined}).success,false)
  assert.equal(importActionSchema.safeParse({...command,expectedLedgerHash:'invalid'}).success,false)
 })
})

test('CI-M03: ordinary wizard views exclude the private identity ledger and report bounded counts',()=>{
 const wizard=emptyWizardState(),bound={version:1,sourceScopeHash:hash,workingRevision:0,identityRevision:0,members:[],records:[],relations:[],identities:[],decisions:[]}
 Object.assign(wizard,{step:'detect-scene',stepState:{'detect-scene':'waiting'},sceneIdentityVersion:1,sceneIdentity:{...bound,ledgerHash:importHash(bound),linkTasks:[],ownershipReviewed:[]}})
 const session:ImportSession={version:1,id,revision:3,phase:'select',title:'合成作品',files:[],units:[],selected:[],targets:['scene'],infer:true,artifacts:[],conflicts:[],patches:[],originalProse:'',workingProse:'',workingRevision:0,chapters:[],steps:[],coverage:{},notFound:[],epoch:0,createdAt:'2026-11-01T00:00:00.000Z',updatedAt:'2026-11-01T00:00:00.000Z',decisions:[],wizardVersion:1,wizard}
 const before=structuredClone(session),view=toImportView(session)
 assert.equal(Object.hasOwn(view.wizard!,'sceneIdentity'),false,'private records, ranges and audit history must not be broadcast')
 const summary=(view.wizard as unknown as {sceneIdentitySummary:{version:number;ledgerHash:string;identityRevision:number;concreteCount:number;sourceScopedCount:number;unresolvedCount:number;ownershipDone:number;ownershipTotal:number}}).sceneIdentitySummary
 assert.deepEqual(summary,{version:1,ledgerHash:importHash(bound),identityRevision:0,concreteCount:0,sourceScopedCount:0,unresolvedCount:0,ownershipDone:0,ownershipTotal:0})
 assert.deepEqual(session,before)
})
