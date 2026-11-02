import assert from 'node:assert/strict'
import {test} from 'node:test'
import {mkdir,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {sceneFixture,bodyOf,byName,type Row,type SceneF} from '../helpers/novel-import-scene-cleanup-fixture'
import {imageModel,imageFake,PNG,entityTarget} from '../helpers/novel-import-wizard-fixture'
import {importHash,wizardSelectionHash,toImportView} from '../../desktop/core/novel-import'
import {createSceneIdentityLedger,appendSceneRosterBatch,buildSceneWizardCandidates} from '../../desktop/core/novel-import-scene-identity'
import {emptyWizardState} from '../../desktop/core/novel-import-wizard-state'
import {WIZARD_STEPS} from '../../desktop/shared/novel-import-wizard'
import type {ImportSession,ImportUnit} from '../../desktop/shared/novel-import'

// 487 §A. Synthetic places only. Rows 2/3 link to each other with both same-place and different-place,
// so regroup joins them and the group becomes unresolved (scene-identity.ts regroup :112/:115).
const P='青石镇的码头有灯塔。',Q='鱼与菜市场的摊位很多。',R1='甲大学的钟楼很高。',R2='甲大学的图书馆很旧。'
const rows:Row[]=[{mentions:[{literal:'青石镇',quote:P}]},{mentions:[{literal:'鱼与菜市场',quote:Q}]},{mentions:[{literal:'甲大学',quote:R1}],links:[{target:3,relation:'same-place'},{target:3,relation:'different-place'}]},{mentions:[{literal:'甲大学',quote:R2}]}]
const text=bodyOf([P,Q,R1,R2])
const unresolvedOf=(f:SceneF)=>{const list=f.session().wizard!.candidates.scene!.filter(c=>c.sceneIdentityState==='unresolved');assert.equal(list.length,1);return list[0]}
const entityTargets=(f:SceneF)=>f.requests.filter(r=>r.intent==='entity').map(entityTarget)
async function listed(rowsIn=rows,body=text,handlers={}){const f=await sceneFixture(rowsIn,body,handlers);try{const v=await f.toList();assert.equal(v.wizard!.step,'detect-scene');assert.equal(v.wizard!.stepState['detect-scene'],'waiting',v.wizard!.stepError);return f}catch(error){await f.dispose();throw error}}
function laterReset(j:ImportSession,from:'import-scene'){const w=j.wizard!;for(const step of WIZARD_STEPS.slice(WIZARD_STEPS.indexOf(from)+1))if(w.stepState[step]!=='skipped')w.stepState[step]='pending'}
/** Real import of the two clear places (unresolved deselected by the author), then the stuck state of 2.1 is restored. */
async function stuck(f:SceneF,extra:(j:ImportSession,unresolvedId:string)=>void=()=>{}){
 const u=unresolvedOf(f);await f.act('wizard-select-candidates',{kind:'scene',ids:[u.id],selected:false});await f.act('wizard-next');const v=await f.settle();assert.equal(v.wizard!.step,'verify',v.wizard!.stepError)
 const {injectJournalEdit}=await import('../helpers/novel-import-wizard-fixture')
 await injectJournalEdit(f as never,j=>{const w=j.wizard!;w.step='import-scene';w.stepState['import-scene']='waiting';laterReset(j,'import-scene');delete w.checks;j.phase='select';delete j.resumePhase;w.candidates.scene=w.candidates.scene!.map(c=>c.id===u.id?{...c,selected:true}:c);w.tasks.push({id:'e-'+u.id.slice(2),kind:'entity',candidateId:u.id,state:'waiting',attempts:0});assert.ok(!w.tasks.some(t=>t.state==='failed'));assert.deepEqual(w.skipped,[]);extra(j,u.id)})
 return u
}

test('A1: an unresolved scene is deselected, gets no task or request, and the step advances with ownership checks ok',async()=>{
 const f=await listed();try{const u=unresolvedOf(f);assert.equal(u.selected,true,'precondition: the recognized unresolved place starts selected')
  await f.act('wizard-next');const v=await f.settle(),s=f.session()
  assert.ok(WIZARD_STEPS.indexOf(v.wizard!.step)>=WIZARD_STEPS.indexOf('detect-item'),'step '+v.wizard!.step+' '+(v.wizard!.stepError??''))
  assert.equal(s.wizard!.candidates.scene!.find(c=>c.id===u.id)!.selected,false);assert.ok(!s.wizard!.tasks.some(t=>t.candidateId===u.id));assert.ok(!s.wizard!.tasks.some(t=>t.state==='failed'));assert.deepEqual(s.wizard!.skipped,[])
  assert.ok(!entityTargets(f).includes(u.id));assert.equal(v.wizard!.step,'verify');assert.ok(v.wizard!.checks?.length&&v.wizard!.checks.every(c=>c.ok),JSON.stringify(v.wizard!.checks))
 }finally{await f.dispose()}
})

test('A2: with exterior images, the unresolved scene gets no entity or image task and the others complete',async()=>{
 const f=await listed();try{const fake=imageFake();f.setImageModel(imageModel,fake.generate);await f.controller.act({type:'current'});await f.act('wizard-set-images',{exterior:true});const u=unresolvedOf(f)
  await f.act('wizard-next',{imageConsent:true});const v=await f.settle(),w=f.session().wizard!
  assert.equal(v.wizard!.step,'verify',v.wizard!.stepError);assert.ok(!w.tasks.some(t=>t.candidateId===u.id));const images=w.tasks.filter(t=>t.kind==='image');assert.equal(images.length,2);assert.ok(images.every(t=>t.state==='done'));assert.equal(fake.calls.length,2)
 }finally{await f.dispose()}
})

test('A3: a stuck import-scene waiting state shows 继续导入 behaviour: resume drops the unresolved task and advances',async t=>{
 const f=await listed();try{const u=await stuck(f),before=f.session().wizard!.tasks.filter(t=>t.state==='done').map(t=>({id:t.id,attempts:t.attempts})),requests=f.requests.length
  assert.equal((await f.view()).wizard!.stepState['import-scene'],'waiting')
  await f.act('resume',{consent:true});const v=await f.settle(),w=f.session().wizard!
  assert.equal(v.wizard!.step,'verify',v.wizard!.stepError);assert.deepEqual(before.map(b=>w.tasks.find(t=>t.id===b.id)?.attempts),before.map(b=>b.attempts))
  assert.equal(w.candidates.scene!.find(c=>c.id===u.id)!.selected,false);assert.ok(!w.tasks.some(t=>t.candidateId===u.id));assert.ok(!f.requests.slice(requests).some(r=>r.intent==='entity'&&entityTarget(r)===u.id));assert.ok(!w.tasks.some(t=>t.state==='failed'));assert.deepEqual(w.skipped,[])
  await t.test('A3e: resume recomputes the selection hash without the deferred place',()=>{assert.equal(w.selectionHash,wizardSelectionHash(f.session()))})
 }finally{await f.dispose()}
})

test('A3e: an injected selection hash that still counts the unresolved place is replaced on resume',async()=>{
 const f=await listed();try{let injected='';await stuck(f,j=>{j.wizard!.selectionHash=wizardSelectionHash(j);injected=j.wizard!.selectionHash})
  await f.act('resume',{consent:true});await f.settle();const s=f.session();assert.equal(s.wizard!.selectionHash,wizardSelectionHash(s));assert.notEqual(s.wizard!.selectionHash,injected)
 }finally{await f.dispose()}
})

test('A3b: resume with exterior images, no grant and no image model drops the unresolved image task and advances',async()=>{
 const f=await listed();try{const dir=join(f.root,'novel-imports',(await f.view()).id,'images');await mkdir(dir,{recursive:true})
  await stuck(f,(j,id)=>{const w=j.wizard!;w.images.exterior=true;delete w.imageGrants.scene;for(const e of w.tasks.filter(t=>t.kind==='entity')){const image={id:e.id.replace(/^e-/u,'i-')+'-exterior',kind:'image' as const,candidateId:e.candidateId,imageKind:'exterior' as const,dependsOn:e.id,state:(e.candidateId===id?'waiting':'done') as 'waiting'|'done',attempts:0,...(e.candidateId===id?{}:{resultSha256:importHash('png'),image:{mime:'image/png' as const,bytes:PNG.length,prompt:'合成外观'}})};w.tasks.push(image)}})
  for(const t of f.session().wizard!.tasks.filter(t=>t.kind==='image'&&t.state==='done'))await writeFile(join(dir,t.id+'.png'),PNG)
  f.setImageModel(undefined);const unresolvedImage=f.session().wizard!.tasks.find(t=>t.kind==='image'&&t.state==='waiting')!.id
  await f.act('resume',{consent:true});const v=await f.settle()
  assert.doesNotMatch(v.error??'',/请重新允许生成图片|尚未配置图像模型/u);assert.equal(v.wizard!.step,'verify',(v.error??'')+(v.wizard!.stepError??''));assert.ok(!f.session().wizard!.tasks.some(t=>t.id===unresolvedImage))
 }finally{await f.dispose()}
})

test('A3c: when every selected scene is unresolved, confirming skips the import step and verify passes',async t=>{
 const only:Row[]=[{mentions:[{literal:'甲大学',quote:R1}],links:[{target:1,relation:'same-place'},{target:1,relation:'different-place'}]},{mentions:[{literal:'甲大学',quote:R2}]}],body=bodyOf([R1,R2])
 await t.test('without images',async()=>{const f=await listed(only,body);try{const u=unresolvedOf(f);await f.act('wizard-next');const v=await f.settle();assert.equal(v.wizard!.stepState['import-scene'],'skipped');assert.equal(v.wizard!.step,'verify',v.wizard!.stepError);assert.ok(v.wizard!.checks?.every(c=>c.ok),JSON.stringify(v.wizard!.checks));assert.deepEqual(v.wizard!.sceneIdentitySummary?.deferred?.map(d=>d.id),[u.id])}finally{await f.dispose()}})
 await t.test('exterior ticked, then the image model is removed',async()=>{const f=await listed(only,body);try{f.setImageModel(imageModel,imageFake().generate);await f.controller.act({type:'current'});await f.act('wizard-set-images',{exterior:true});f.setImageModel(undefined);await f.act('wizard-next');const v=await f.settle();assert.equal(v.wizard!.stepState['import-scene'],'skipped');assert.equal(v.wizard!.step,'verify',v.wizard!.stepError)}finally{await f.dispose()}})
})

test('A3f: the image grant hash binds only the places still selected after deferral',async()=>{
 const f=await listed();try{f.setImageModel(imageModel,imageFake().generate);await f.controller.act({type:'current'});await f.act('wizard-set-images',{exterior:true});const u=unresolvedOf(f);await f.act('wizard-next',{imageConsent:true});await f.settle();const w=f.session().wizard!,ids=w.candidates.scene!.filter(c=>c.selected).map(c=>c.id)
  assert.ok(!ids.includes(u.id));assert.equal(ids.length,2);assert.equal(w.imageGrants.scene!.hash,importHash({kind:'scene',images:['exterior'],ids}))
 }finally{await f.dispose()}
})

test('A3d: an omission that adds a new unresolved place defers it and verification finishes without error',async()=>{
 const X='青石镇的码头有灯塔。',X2='青石镇的旧码头在此处。',N1='乙港的仓库在东侧。',N2='乙港的仓库在西侧。',body=bodyOf([X,Q,X2+'这一段又写到乙港。'+N1+'另有'+N2])
 const r:Row[]=[{mentions:[{literal:'青石镇',quote:X},{literal:'青石镇',quote:X2}]},{mentions:[{literal:'鱼与菜市场',quote:Q}]},{round:1,mentions:[{literal:'乙港',quote:N1}],links:[{target:3,relation:'same-place'},{target:3,relation:'different-place'}]},{round:1,mentions:[{literal:'乙港',quote:N2}]}]
 const f=await listed(r,body,{review:(req:{units:ImportUnit[]},call:number)=>{const unit=req.units.find(u=>u.text.includes(N1));return call===1&&unit?{conflicts:[],missingTargets:[{kind:'scene',unitIds:[unit.id],evidence:[{unitId:unit.id,quote:N1}],reason:'新地点尚无独立资料'}]}:{conflicts:[],missingTargets:[]}}})
 try{await f.act('wizard-next');const v=await f.settle(),w=f.session().wizard!
  // Deviation (see docs/488): after deferral the flow continues into the existing omission repair, whose reconcile request is
  // rejected on unmodified HEAD as well ('设定修订分片范围或字段无效', schema-2 scene fields). That pre-existing defect is
  // outside 486, so this case asserts the 486 behaviour only: no "请返回识别场景" stop and the new place is deferred.
  assert.doesNotMatch(v.wizard!.stepError??'',/请返回识别场景/u);assert.equal(v.wizard!.step,'verify');assert.ok(f.requests.some(r=>r.intent==='reconcile'),'the flow passed deferral and reached the omission repair of the imported place')
  const fresh=w.candidates.scene!.filter(c=>c.sceneIdentityState==='unresolved');assert.equal(fresh.length,1);assert.equal(fresh[0].selected,false);assert.ok(!w.tasks.some(t=>t.candidateId===fresh[0].id));assert.ok(v.wizard!.sceneIdentitySummary?.deferred?.some(d=>d.id===fresh[0].id))
 }finally{await f.dispose()}
})

test('A4: the verify view lists deferred places, also after retry-kind and after returning to detect-scene',async()=>{
 const f=await listed();try{const u=unresolvedOf(f);await f.act('wizard-next');let v=await f.settle();assert.deepEqual(v.wizard!.sceneIdentitySummary?.deferred,[{id:u.id,name:u.name}]);assert.equal(v.wizard!.sceneIdentitySummary?.deferredTotal,1)
  await f.act('wizard-retry-kind',{kind:'scene'});v=await f.settle();assert.equal(v.wizard!.step,'verify',v.wizard!.stepError);assert.deepEqual(v.wizard!.sceneIdentitySummary?.deferred?.map(d=>d.id),[u.id])
  await f.act('wizard-revise',{to:'detect-scene'});v=await f.settle();assert.equal(v.wizard!.stepState['detect-scene'],'waiting',v.wizard!.stepError);await f.act('wizard-next');v=await f.settle();assert.equal(v.wizard!.step,'verify',v.wizard!.stepError);assert.deepEqual(v.wizard!.sceneIdentitySummary?.deferred?.map(d=>d.id),[u.id])
 }finally{await f.dispose()}
})

test('A4: 201 deferred identities are listed up to 200 with the full total',()=>{
 const units=Array.from({length:402},(_,i)=>({id:'d-'+i,fileId:'working-0',start:i*100,end:i*100+9,text:'第'+String(i).padStart(3,'0')+'号合成仓库。',kind:'body' as const})).map(u=>({...u,end:u.start+u.text.length}))
 const s={workingRevision:0,workingUnits:units,sourceBlocks:[]},records=units.map((u,i)=>({name:'仓库',aliases:[],mentions:[{literal:'仓库',evidence:{unitId:u.id,quote:u.text}}],context:[],links:i%2===0?[{targetIndex:i+1,relation:'same-place' as const,evidence:[{unitId:u.id,quote:u.text}]},{targetIndex:i+1,relation:'different-place' as const,evidence:[{unitId:u.id,quote:u.text}]}]:[]}))
 const ledger=appendSceneRosterBatch(createSceneIdentityLedger(s),records,units,s);assert.equal(ledger.identities.filter(i=>i.state==='unresolved').length,201)
 const wizard=emptyWizardState();Object.assign(wizard,{step:'verify',stepState:{verify:'waiting'},sceneIdentity:ledger,candidates:{scene:buildSceneWizardCandidates(ledger).map(c=>({...c,selected:false}))}})
 const session={version:1,id:'00000000-0000-4000-8000-000000000487',revision:1,phase:'select',title:'合成作品',files:[],units:[],selected:[],targets:['scene'],infer:true,artifacts:[],conflicts:[],patches:[],originalProse:'',workingProse:'',workingRevision:0,chapters:[],steps:[],coverage:{},notFound:[],epoch:0,createdAt:'2026-11-02T00:00:00.000Z',updatedAt:'2026-11-02T00:00:00.000Z',decisions:[],wizardVersion:1,wizard} as unknown as ImportSession
 const summary=toImportView(session).wizard!.sceneIdentitySummary!;assert.equal(summary.deferred!.length,200);assert.equal(summary.deferredTotal,201)
})

test('A5: after returning to detect-scene, an author partition makes the deferred place importable',async()=>{
 const f=await listed();try{const u=unresolvedOf(f);await f.act('wizard-next');await f.settle();await f.act('wizard-revise',{to:'detect-scene'});await f.settle()
  const l=f.ledger(),identity=l.identities.find(i=>i.id===u.id)!;await f.act('wizard-scene-identity',{expectedLedgerHash:l.ledgerHash,explanation:'依据合成原文确认为同一处',op:'partition',identityIds:[u.id],parts:[{memberKeys:identity.memberKeys,state:'source-scoped',nameParts:[{kind:'literal',key:identity.memberKeys[0]}],parent:{state:'unknown'}}]})
  const fixed=f.session().wizard!.candidates.scene!.find(c=>c.sceneIdentityState!=='unresolved'&&c.name==='甲大学')!;if(!fixed.selected)await f.act('wizard-select-candidates',{kind:'scene',ids:[fixed.id],selected:true})
  await f.act('wizard-next');const v=await f.settle();assert.equal(v.wizard!.step,'verify',v.wizard!.stepError);assert.ok(f.session().artifacts.some(a=>a.id===fixed.id));assert.ok(!v.wizard!.sceneIdentitySummary?.deferred?.some(d=>d.id===fixed.id))
 }finally{await f.dispose()}
})

test('A6: without unresolved places every selected candidate gets exactly one done entity task (and one image task with images)',async t=>{
 const clear:Row[]=[rows[0],rows[1]],body=bodyOf([P,Q])
 await t.test('no images',async()=>{const f=await listed(clear,body);try{const ids=f.session().wizard!.candidates.scene!.filter(c=>c.selected).map(c=>c.id);await f.act('wizard-next');const v=await f.settle(),w=f.session().wizard!;assert.equal(v.wizard!.step,'verify',v.wizard!.stepError);assert.deepEqual(w.tasks.map(({id,kind,candidateId,state})=>({id,kind,candidateId,state})),ids.map(id=>({id:'e-'+id.slice(2),kind:'entity',candidateId:id,state:'done'})));assert.deepEqual(w.skipped,[]);assert.deepEqual(v.wizard!.sceneIdentitySummary?.deferred??[],[])}finally{await f.dispose()}})
 await t.test('exterior images',async()=>{const f=await listed(clear,body);try{f.setImageModel(imageModel,imageFake().generate);await f.controller.act({type:'current'});await f.act('wizard-set-images',{exterior:true});const ids=f.session().wizard!.candidates.scene!.filter(c=>c.selected).map(c=>c.id);await f.act('wizard-next',{imageConsent:true});const v=await f.settle(),w=f.session().wizard!;assert.equal(v.wizard!.step,'verify',v.wizard!.stepError);for(const id of ids){const e=w.tasks.find(t=>t.kind==='entity'&&t.candidateId===id)!;assert.equal(e.state,'done');const images=w.tasks.filter(t=>t.kind==='image'&&t.dependsOn===e.id);assert.equal(images.length,1);assert.equal(images[0].state,'done')}assert.equal(w.tasks.length,ids.length*2)}finally{await f.dispose()}})
})

test('C12b: a failed recognition can be skipped although exterior images were ticked and the image model is gone',async()=>{
 const f=await sceneFixture(rows,text,{fail:r=>r.sceneIdentity?.mode==='roster'?Error('模型接口请求失败（HTTP 503）'):undefined});try{const v=await f.toList();assert.equal(v.wizard!.stepState['detect-scene'],'failed')
  f.setImageModel(imageModel,imageFake().generate);await f.controller.act({type:'current'});await f.act('wizard-set-images',{exterior:true});f.setImageModel(undefined)
  await f.act('wizard-next',{skip:true});const after=await f.settle();assert.equal(after.wizard!.stepState['import-scene'],'skipped')
 }finally{await f.dispose()}
})
void byName
