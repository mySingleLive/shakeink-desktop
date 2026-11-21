import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {fixture,source,allCuts} from '../helpers/novel-import-wizard-fixture'
import {runImportAi,generateImportAiJson} from '../../desktop/service/novel-import-ai'
import {importHash,safeImportBoundary} from '../../desktop/core/novel-import'
import {type ImportResponse,type ImportSceneIdentitySource,type ImportSession,type ImportAiResult} from '../../desktop/shared/novel-import'
import type {SceneIdentityLedger} from '../../desktop/shared/novel-import-scene-identity'
import type {ResolvedModel} from '../../src/lib/ai/provider'

// Fresh synthetic sessions only. Every new scene roster/link wire passes the
// actual service/JSON bridge; normal actions perform every tested mutation.
const east='东宅的书房里有蓝墙😀，这里只描述东宅。',west='西宅的书房里有红墙𠀀，这里只描述西宅。'
const explain='依据合成原文逐处核对地点归属。',wrong='f'.repeat(64)
type F=Awaited<ReturnType<typeof fixture>>
type Group={label:string;quotes:string[]}
function changedNameParts(l:SceneIdentityLedger,id:string){const identity=l.identities.find(value=>value.id===id)!,literal={kind:'literal' as const,key:identity.memberKeys[0]},context=l.records.find(record=>record.memberKeys.includes(literal.key))!.context[0],simple=[literal],next=JSON.stringify(simple)===JSON.stringify(identity.nameParts)?[{kind:'context' as const,key:context.key},literal]:simple;assert.notDeepEqual(next,identity.nameParts,'the valid label control must be an effective change, not the noop branch');return next}
const session=(f:F)=>(f.controller as unknown as {session:ImportSession}).session
const ledger=(f:F)=>session(f).wizard!.sceneIdentity!
function change(ledger:SceneIdentityLedger,business:Record<string,unknown>){return{expectedLedgerHash:ledger.ledgerHash,explanation:explain,...business}}
async function actIdentity(f:F,business:Record<string,unknown>){return f.act('wizard-scene-identity',change(ledger(f),business))}
async function fresh(groups:Group[]=[{label:'东宅',quotes:[east]},{label:'西宅',quotes:[west]}]){
 const paragraphs=groups.flatMap(g=>g.quotes).map(q=>q+'其余合成叙述。'.repeat(20)),text='第一章 起\n\n'+paragraphs.join('\n\n')+'\n\n第二章 承\n\n'+'院外有雨。'.repeat(240)+'\n\n第三章 终\n\n'+'门前有路。'.repeat(240)+'\n'
 const f=await fixture([source(text,'合成正文.txt','f-body')],async request=>{
  if(request.intent==='structure')return allCuts(request)
  if(request.phase==='classify')return{classifications:request.units.map(unit=>({unitId:unit.id,kind:'body'}))}
  let raw:unknown
  if(request.sceneIdentity?.mode==='roster')raw={roster:groups.flatMap(group=>{const mentions=group.quotes.flatMap(quote=>request.units.filter(unit=>unit.text.includes(quote)).map(unit=>({literal:'书房',evidence:{unitId:unit.id,quote}})));return mentions.length?[{name:'书房',aliases:[],mentions,context:[{label:group.label,evidence:[mentions[0].evidence]}],links:[]}]:[]})}
  // 486 adds a scene-list cleanup stage after links; this fixture keeps every entry (neutral answer).
  else if((request.sceneIdentity as {mode?:string}|undefined)?.mode==='cleanup')raw={sceneCleanup:(request.sceneIdentity as unknown as {focus:{index:number}[]}).focus.map(f=>({index:f.index,action:'keep'}))}
  else if(request.sceneIdentity?.mode==='links')raw={sceneIdentityDecisions:request.sceneIdentity.tasks.map(task=>({taskIndex:task.taskIndex,result:'unknown',evidence:[]}))}
  else if(request.phase==='review')raw={conflicts:[],missingTargets:[]}
  else return{notFound:true}
  return runImportAi(request,new AbortController().signal,{resolve:async role=>request.models[role]!,assert:async()=>{},generate:async(input,_model,signal,prompt)=>generateImportAiJson(input,{userId:'synthetic-scene-author-actions',resolvedModel:{} as ResolvedModel},signal,prompt,{generateText:async()=>({text:JSON.stringify(raw),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'})})})
 })
 try{await f.act('choose',{mode:'files'});await f.act('wizard-next');await f.act('set-title',{title:'合成身份操作'});await f.act('choose-target');await f.act('wizard-next');await f.act('classify',{mode:'ai',consent:true});await f.settle();await f.act('select',{selected:['body'],targets:['scene'],infer:true});await f.act('wizard-next',{consent:true});await f.settle();await f.act('wizard-next',{consent:true});const view=await f.settle();assert.equal(view.wizard!.step,'detect-scene');assert.equal(view.wizard!.stepState['detect-scene'],'waiting',view.wizard!.stepError);assert.equal(session(f).wizard!.sceneIdentityVersion,1);assert.ok(ledger(f));return f}catch(error){await f.dispose();throw error}
}
async function readIdentity(f:F,identityId=ledger(f).identities[0].id,cursor=0,limit=50):Promise<ImportResponse>{return f.act('wizard-read-scene-identity',{expectedLedgerHash:ledger(f).ledgerHash,identityId,cursor,limit})}
async function readSource(f:F,memberKey=ledger(f).members[0].key,neighbor:-1|0|1=0,offset=0,limit=32768):Promise<ImportResponse>{return f.act('wizard-read-scene-source',{expectedLedgerHash:ledger(f).ledgerHash,memberKey,neighbor,offset,limit})}
function ownerSnapshot(f:F){return structuredClone(session(f))}
async function disk(f:F){return readFile(join(f.root,'novel-imports',session(f).id,'session.json'),'utf8')}
function preserveBusiness(before:ImportSession,after:ImportSession){assert.deepEqual(after.files,before.files);assert.deepEqual(after.units,before.units);assert.equal(after.originalProse,before.originalProse);assert.equal(after.workingProse,before.workingProse);assert.deepEqual(after.chapters,before.chapters);assert.equal(after.workingRevision,before.workingRevision)}
function authorPart(l:SceneIdentityLedger,memberKeys:string[]){return{memberKeys,state:'source-scoped',nameParts:[{kind:'literal',key:memberKeys[0]}],parent:{state:'unknown'}}}

test('CI-A01/07: normal label, parent and defer are atomic and record exact before/after identities',async()=>{
 const f=await fresh();try{assert.equal(ledger(f).identities.length,2);const original=ownerSnapshot(f),id=ledger(f).identities[0].id,other=ledger(f).identities[1].id,context=ledger(f).records.find(record=>record.memberKeys.some(key=>ledger(f).identities[0].memberKeys.includes(key)))!.context[0]
  let saves=0,notifications=0;const c=f.controller as any,save=c.save.bind(c),changed=c.options.changed;c.save=async(...args:any[])=>{saves++;return save(...args)};c.options.changed=()=>{notifications++}
  for(const business of [{op:'label',identityId:id,nameParts:changedNameParts(ledger(f),id)},{op:'parent',identityId:id,parentId:other,evidenceKeys:[context.key]},{op:'defer',identityId:id}]){
   const before=ownerSnapshot(f),oldLedger=structuredClone(ledger(f)),response=await actIdentity(f,business),after=session(f),next=ledger(f)
   assert.equal(response.view!.revision,before.revision+1);assert.equal(after.epoch,before.epoch+1);assert.equal(next.identityRevision,oldLedger.identityRevision+1);assert.notEqual(next.ledgerHash,oldLedger.ledgerHash);assert.equal(next.decisions.length,oldLedger.decisions.length+1)
   const decision=next.decisions.at(-1)!;assert.equal(decision.operation,business.op);assert.equal(decision.previousLedgerHash,oldLedger.ledgerHash);assert.equal(decision.explanation,explain);assert.deepEqual(decision.before,[oldLedger.identities.find(value=>value.id===id)]);assert.deepEqual(decision.after,[next.identities.find(value=>value.id===id)]);assert.deepEqual(next.members,oldLedger.members);assert.deepEqual(next.records,oldLedger.records);preserveBusiness(before,after)
   assert.equal(JSON.parse(await disk(f)).wizard.sceneIdentity.ledgerHash,next.ledgerHash,'the committed journal contains the same complete ledger')
  }
  assert.equal(saves,3);assert.equal(notifications,3);assert.equal(ledger(f).identities.find(value=>value.id===id)!.state,'unresolved');assert.equal(f.requests.filter(request=>request.intent==='entity').length,0);preserveBusiness(original,session(f));c.save=save;c.options.changed=changed
 }finally{await f.dispose()}
})

test('CI-A02/07: complete normal partitions merge then split all members without copying facts or losing selection',async()=>{
 const f=await fresh();try{const before=ownerSnapshot(f),initial=structuredClone(ledger(f)),all=initial.members.map(member=>member.key),ids=initial.identities.map(identity=>identity.id)
  await actIdentity(f,{op:'partition',identityIds:ids,parts:[authorPart(initial,all)]});let l=ledger(f);assert.equal(l.identities.length,1);assert.deepEqual(l.identities[0].memberKeys,all);assert.ok(session(f).wizard!.candidates.scene!.every(candidate=>candidate.selected));assert.deepEqual(l.members,initial.members);assert.deepEqual(l.records,initial.records);assert.equal(session(f).artifacts.some(artifact=>artifact.kind==='scene'),false)
  const mergedId=l.identities[0].id;await actIdentity(f,{op:'partition',identityIds:[mergedId],parts:all.map(key=>authorPart(l,[key]))});l=ledger(f);assert.equal(l.identities.length,2);assert.deepEqual(l.identities.flatMap(identity=>identity.memberKeys).sort(),[...all].sort());assert.equal(new Set(l.identities.flatMap(identity=>identity.memberKeys)).size,all.length);assert.deepEqual(l.members,initial.members);assert.deepEqual(l.records,initial.records);assert.equal(l.decisions.length,initial.decisions.length+2);assert.equal(session(f).epoch,before.epoch+2);assert.equal(session(f).revision,before.revision+2);assert.ok(session(f).wizard!.candidates.scene!.every(candidate=>candidate.selected));preserveBusiness(before,session(f))
 }finally{await f.dispose()}
})

test('CI-A03/07: noop, stale and invalid normal actions never save or mutate the admitted draft',async t=>{
 const f=await fresh();try{const c=f.controller as any,save=c.save.bind(c);let saves=0;c.save=async(...args:any[])=>{saves++;return save(...args)};const identity=ledger(f).identities[0],before=ownerSnapshot(f),bytes=await disk(f)
  await actIdentity(f,{op:'label',identityId:identity.id,nameParts:identity.nameParts});assert.deepEqual(session(f),before);assert.equal(await disk(f),bytes);assert.equal(saves,0)
  const valid={type:'wizard-scene-identity',id:before.id,revision:before.revision,...change(ledger(f),{op:'label',identityId:identity.id,nameParts:identity.nameParts})}
  const invalids:[string,Record<string,unknown>][]=[['old revision',{...valid,revision:valid.revision-1}],['old ledger',{...valid,expectedLedgerHash:wrong}],['empty explanation',{...valid,explanation:''}],['unknown part',{...valid,nameParts:[{kind:'literal',key:wrong}]}],['unknown parent',{...valid,op:'parent',identityId:identity.id,parentId:'s-ffffffffffffffff',evidenceKeys:[identity.memberKeys[0]]}],['missing member',{...valid,op:'partition',identityIds:ledger(f).identities.map(value=>value.id),parts:[authorPart(ledger(f),identity.memberKeys)]}],['duplicate member',{...valid,op:'partition',identityIds:[identity.id],parts:[authorPart(ledger(f),[identity.memberKeys[0],identity.memberKeys[0]])]}],['foreign member',{...valid,op:'partition',identityIds:[identity.id],parts:[authorPart(ledger(f),[wrong])]}],['unknown own key',{...valid,path:undefined}]]
  for(const [label,action]of invalids)await t.test(label,async()=>{await assert.rejects(f.controller.act(action));assert.deepEqual(session(f),before);assert.equal(await disk(f),bytes);assert.equal(saves,0)})
  c.save=save
 }finally{await f.dispose()}
})

test('CI-A04/07: save, source and owner authorization failures roll back before commit',async t=>{
 for(const mode of ['save','source','authorization'] as const)await t.test(mode,async()=>{
  const f=await fresh();try{const c=f.controller as any,originalSave=c.save.bind(c),originalVerify=c.options.verifySources,originalAssert=c.options.assertCurrent,before=ownerSnapshot(f),bytes=await disk(f),identity=ledger(f).identities[0],context=ledger(f).records.find(record=>record.memberKeys.includes(identity.memberKeys[0]))!.context[0],failure=Error('synthetic-'+mode+'-denied');let saves=0,sourceChecks=0,revoked=false,notifications=0;const originalChanged=c.options.changed;c.options.changed=()=>{notifications++}
   if(mode==='save')c.save=async(candidate:ImportSession,...rest:any[])=>{if(candidate!==c.session){saves++;throw failure}return originalSave(candidate,...rest)}
   c.options.verifySources=async()=>{sourceChecks++;if(mode==='source')throw failure;if(mode==='authorization')revoked=true}
   c.options.assertCurrent=()=>{if(revoked)throw failure}
   const action={type:'wizard-scene-identity',id:before.id,revision:before.revision,...change(ledger(f),{op:'label',identityId:identity.id,nameParts:changedNameParts(ledger(f),identity.id)})}
   await assert.rejects(f.controller.act(action),error=>error===failure);assert.ok(sourceChecks>=1,'the failure reaches the actual source/author operation');if(mode==='save')assert.equal(saves,1,'the injected failure reaches the uncommitted candidate save');assert.equal(notifications,0);assert.deepEqual(session(f),before);assert.equal(await disk(f),bytes);c.save=originalSave;c.options.verifySources=originalVerify;c.options.assertCurrent=originalAssert;c.options.changed=originalChanged
  }finally{await f.dispose()}
 })
})

test('CI-A05/07: a valid author change invalidates later credit/grants while retaining source, body and early credit',async()=>{
 const f=await fresh();try{const c=f.controller as any,s=session(f),w=s.wizard!,identity=ledger(f).identities[0],context=ledger(f).records.find(record=>record.memberKeys.includes(identity.memberKeys[0]))!.context[0]
  // Controlled stale-progress precondition only; source values, ledger identity,
  // all mutations and persistence still use the real admitted controller path.
  s.coverage.review=['old-review'];s.coverage.reviewFacts=['old-facts'];s.coverage.character=['kept-character'];s.coverage['roster:character']=['kept-roster'];w.selectionHash='a'.repeat(64);w.imageGrants.scene={hash:'b'.repeat(64),model:{id:'synthetic-image',name:'合成图像模型',authRevision:1}};w.checks=[{key:'consistency',ok:true,detail:'旧完成状态'}];ledger(f).ownershipReviewed=['c'.repeat(64)];await c.save(s,false);assert.equal(c.validJournal(structuredClone(s),s.id),true)
  const before=ownerSnapshot(f),rosterCoverage=[...(s.coverage['roster:scene']??[])];await actIdentity(f,{op:'label',identityId:identity.id,nameParts:changedNameParts(ledger(f),identity.id)});const next=session(f)
  assert.deepEqual(next.coverage.character,before.coverage.character);assert.deepEqual(next.coverage['roster:character'],before.coverage['roster:character']);assert.deepEqual(next.coverage['roster:scene'],rosterCoverage);assert.equal(next.coverage.review,undefined);assert.equal(next.coverage.reviewFacts,undefined);assert.deepEqual(ledger(f).ownershipReviewed,[]);assert.equal(next.wizard!.selectionHash,undefined);assert.equal(next.wizard!.imageGrants.scene,undefined);assert.equal(next.wizard!.checks,undefined);assert.equal(next.semanticState,undefined);assert.equal(next.wizard!.step,'detect-scene');assert.equal(next.phase,'select');preserveBusiness(before,next)
 }finally{await f.dispose()}
})

test('CI-A06/08: bounded identity/source reads page all 51 members without writing or sending a model request',async()=>{
 const quotes=Array.from({length:51},(_,index)=>`东宅的书房第${index}处有独立说明😀，这些描述属于同一地点。`),f=await fresh([{label:'东宅',quotes}])
 try{const c=f.controller as any,l=ledger(f);assert.equal(l.identities.length,1);assert.equal(l.members.length,51,'all synthetic mentions were recognized through the actual wire');const identity=l.identities[0],before=ownerSnapshot(f),bytes=await disk(f),requests=f.requests.length,originalSave=c.save.bind(c);let writes=0;c.save=async()=>{writes++;throw Error('reads must not save')}
  const first=await readIdentity(f,identity.id),last=await readIdentity(f,identity.id,50),a=first.sceneIdentityDetail!,b=last.sceneIdentityDetail!;assert.equal(a.members.length,50);assert.equal(a.nextCursor,50);assert.equal(b.members.length,1);assert.equal(b.nextCursor,undefined);assert.equal(JSON.stringify(first.view).includes('"sceneIdentity":'),false);assert.ok(JSON.stringify(a).length<=32768);assert.deepEqual([...a.members,...b.members].map(member=>member.key),identity.memberKeys)
  const ordered=session(f).workingUnits!,member=l.members.find(member=>member.origin==='body'&&ordered.findIndex(unit=>unit.id===member.range.unitId)>0&&ordered.findIndex(unit=>unit.id===member.range.unitId)<ordered.length-1);assert.ok(member&&member.origin==='body');const at=ordered.findIndex(unit=>unit.id===member.range.unitId)
  for(const neighbor of [-1,0,1] as const){const response:ImportSceneIdentitySource=(await readSource(f,member.key,neighbor)).sceneIdentitySource!;assert.equal(response.unitId,ordered[at+neighbor].id);assert.equal(response.text,ordered[at+neighbor].text);assert.ok(!session(f).files.some(file=>file.id===response.unitId),'working units are not original source files')}
  assert.equal(writes,0);assert.equal(f.requests.length,requests);assert.deepEqual(session(f),before);assert.equal(await disk(f),bytes);c.save=originalSave
 }finally{await f.dispose()}
})

test('CI-A07/08: stale, foreign, path and range read requests reject without model/write side effects',async t=>{
 const f=await fresh();try{const before=ownerSnapshot(f),bytes=await disk(f),requests=f.requests.length,l=ledger(f),common={id:before.id,revision:before.revision,expectedLedgerHash:l.ledgerHash},detail={type:'wizard-read-scene-identity',...common,identityId:l.identities[0].id,cursor:0,limit:50},source={type:'wizard-read-scene-source',...common,memberKey:l.members[0].key,neighbor:0,offset:0,limit:32768}
  for(const [label,action]of [['old revision',{...detail,revision:before.revision-1}],['old hash',{...detail,expectedLedgerHash:wrong}],['foreign identity',{...detail,identityId:'s-ffffffffffffffff'}],['over member page',{...detail,cursor:999}],['too many members',{...detail,limit:51}],['foreign member',{...source,memberKey:wrong}],['path injection',{...source,path:'/private/tmp/unrelated'}],['undefined key',{...source,path:undefined}],['outside source',{...source,offset:999999}],['too much source',{...source,limit:32769}],['invalid neighbor',{...source,neighbor:2}]] as const)await t.test(label,async()=>{await assert.rejects(f.controller.act(action));assert.deepEqual(session(f),before);assert.equal(await disk(f),bytes);assert.equal(f.requests.length,requests)})
 }finally{await f.dispose()}
})

const blockA='## 同名资料\n\n'+('长段原值😀𠀀\r\n'.repeat(4000))+'第一块末尾。\n\n',blockB='## 同名资料\n\n第二块独立原值，不应并入前块。\n',notes='# 场景\n\n'+blockA+blockB
async function copied(files=[source(notes,'场景.md','f-notes')]){const f=await fixture(files,async()=>{throw Error('source-only must never send a model request')},{models:{}});try{await f.act('choose');await f.act('wizard-next');await f.act('set-title',{title:'合成同标题资料'});await f.act('choose-target');await f.act('wizard-next');await f.act('select',{selected:['scene'],targets:['scene'],infer:false});await f.act('wizard-next');const view=await f.settle();assert.equal(view.wizard!.step,'detect-scene');assert.equal(view.wizard!.stepState['detect-scene'],'waiting',view.wizard!.stepError);return f}catch(error){await f.dispose();throw error}}

test('CI-A08/08/12: source blocks remain atomic, page exact original text and copy independently without any model',async()=>{
 const f=await copied();try{const l=ledger(f),member=l.members.find(member=>member.origin==='source-block'&&member.blockHash===importHash(blockA));assert.ok(member&&member.origin==='source-block');assert.equal(l.members.length,2);assert.equal(l.identities.length,2);let offset=0,joined='';do{const page:ImportSceneIdentitySource=(await readSource(f,member.key,0,offset)).sceneIdentitySource!;assert.ok(page.text.length<=32768);assert.equal(page.text.isWellFormed(),true);assert.ok(safeImportBoundary(blockA,page.offset));joined+=page.text;if(page.nextOffset===undefined)break;assert.ok(page.nextOffset>offset);offset=page.nextOffset}while(true);assert.equal(joined,blockA);await assert.rejects(readSource(f,member.key,1))
  const before=ownerSnapshot(f),identity=l.identities.find(identity=>identity.memberKeys.includes(member.key))!;await assert.rejects(actIdentity(f,{op:'partition',identityIds:[identity.id],parts:[authorPart(l,[member.key]),authorPart(l,[member.key])]}));assert.deepEqual(session(f),before)
  const c=f.controller as any,originalSafeError=c.safeError.bind(c),syntheticErrors:string[]=[];c.safeError=(error:unknown)=>{syntheticErrors.push(error instanceof Error?error.message:'unknown');return originalSafeError(error)}
  await f.act('wizard-next');const end=await f.settle(),saved=await f.journal();assert.equal(end.wizard!.step,'verify');assert.ok(end.wizard!.checks?.every(check=>check.ok),JSON.stringify({checks:end.wizard!.checks,syntheticErrors}));assert.equal(f.requests.length,0);assert.deepEqual(saved.artifacts.filter(artifact=>artifact.kind==='scene').map(artifact=>artifact.text).sort(),[blockA,blockB].sort());assert.ok(saved.artifacts.every(artifact=>artifact.origin==='source'));assert.deepEqual(saved.wizard!.skipped,[]);assert.deepEqual(saved.wizard!.dropped,[])
 }finally{await f.dispose()}
})

test('CI-A10/07: a normal running import refuses an author change without interrupting the in-flight tasks',async()=>{
 const f=await fresh(),release=Promise.withResolvers<ImportAiResult>();try{const base=f.handler();f.setAi(async request=>request.intent==='entity'?release.promise:base(request));await f.act('wizard-next');for(let i=0;i<1000&&f.requests.filter(request=>request.intent==='entity').length<2;i++)await new Promise(resolve=>setTimeout(resolve,5));assert.equal(f.requests.filter(request=>request.intent==='entity').length,2,'both real scheduled entity tasks are held');assert.ok(f.controller.active>0);const before=ownerSnapshot(f),bytes=await disk(f),identity=ledger(f).identities[0],action={type:'wizard-scene-identity',id:before.id,revision:before.revision,...change(ledger(f),{op:'label',identityId:identity.id,nameParts:changedNameParts(ledger(f),identity.id)})};await assert.rejects(f.controller.act(action),/正在处理|先暂停|等待|返回识别场景/u);assert.deepEqual(session(f),before);assert.equal(await disk(f),bytes);assert.ok(f.controller.active>0,'the rejected edit did not pause/cancel or give credit to pending tasks');release.resolve({notFound:true});await f.settle()
 }finally{release.resolve({notFound:true});await f.dispose()}
})

test('CI-A11/12: source-copy facts and naming provenance belong to each actual source block',async t=>{
 await t.test('same-heading blocks retain their distinct explicit coordinates',async()=>{
  const first='## 同名资料\n\ncoordinates: 甲城东侧\n第一处完整原值😀。\n\n',second='## 同名资料\n\ncoordinates: 乙城西侧\n第二处独立原值𠀀。\n',f=await copied([source('# 场景\n\n'+first+second,'场景.md','f-coordinates')])
  try{assert.equal(ledger(f).identities.length,2);await f.act('wizard-next');await f.settle();const artifacts=session(f).artifacts.filter(artifact=>artifact.kind==='scene');assert.equal(artifacts.length,2);const a=artifacts.find(artifact=>artifact.text===first),b=artifacts.find(artifact=>artifact.text===second);assert.ok(a&&b,'the original complete source blocks remain independently copied');assert.equal(a.facts.coordinates,'甲城东侧','the first block must not inherit the complete file\'s final coordinates');assert.equal(b.facts.coordinates,'乙城西侧');assert.equal(f.requests.length,0)}finally{await f.dispose()}
 })
 await t.test('a name taken solely from the filename remains explicitly filename-derived',async()=>{
  const name='场景备用称呼',original='coordinates: 南面原值\n文件中的原文没有给出标题或地点名称。\n',f=await copied([source(original,name+'.txt','f-filename')])
  try{assert.equal(original.includes(name),false);const member=ledger(f).members.find(member=>member.origin==='source-block');assert.ok(member&&member.origin==='source-block');assert.equal(member.sourceName,name);assert.equal(member.nameOrigin,'filename');assert.equal(f.requests.length,0)}finally{await f.dispose()}
 })
})

test('CI-A12/07: an explicit partition keeps the union of the involved selections',async()=>{
 const f=await fresh();try{const first=ledger(f).identities[0],second=ledger(f).identities[1];await f.act('wizard-select-candidates',{kind:'scene',ids:[first.id],selected:false});assert.equal(session(f).wizard!.candidates.scene!.find(candidate=>candidate.id===first.id)!.selected,false);assert.equal(session(f).wizard!.candidates.scene!.find(candidate=>candidate.id===second.id)!.selected,true);const all=ledger(f).members.map(member=>member.key);await actIdentity(f,{op:'partition',identityIds:[first.id,second.id],parts:[authorPart(ledger(f),all)]});const candidates=session(f).wizard!.candidates.scene!;assert.equal(candidates.length,1);assert.equal(candidates[0].selected,true,'the earliest unselected representative cannot erase another explicitly selected identity when partitioning')
 }finally{await f.dispose()}
})

test('CI-A09/08: a legal tiny source-page request must not yield an unfinishable empty Unicode page',async()=>{
 const f=await copied();try{const member=ledger(f).members.find(member=>member.origin==='source-block'&&member.blockHash===importHash(blockA));assert.ok(member);const offset=blockA.indexOf('😀');assert.ok(offset>=0);const normal=(await readSource(f,member.key,0,offset,2)).sceneIdentitySource!;assert.equal(normal.text,'😀','the real source/member/offset is valid before the tiny-page control');let response:ImportResponse;try{response=await readSource(f,member.key,0,offset,1)}catch(error){assert.ok(error instanceof Error&&/字符|分页/u.test(error.message));return}const page=response.sceneIdentitySource!;assert.equal(page.text.isWellFormed(),true);assert.ok(page.text.length<=32768);assert.ok(page.nextOffset===undefined||page.nextOffset>page.offset,'a valid paged response must advance; reject an impossible codepoint-sized request instead of looping forever')
 }finally{await f.dispose()}
})
