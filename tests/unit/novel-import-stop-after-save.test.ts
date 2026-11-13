// docs/560-561: an import whose save started can always be stopped and deleted; step 22 saves without a send grant.
import assert from 'node:assert/strict'
import {test} from 'node:test'
import {mkdtemp,readFile,readdir,writeFile,stat,rm,realpath,mkdir} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {NovelImportController} from '../../desktop/main/novel-import'
import {importHash} from '../../desktop/core/novel-import'
import type {ImportAiRequest,ImportAiResult,ImportFile,ImportModel,ImportSession} from '../../desktop/shared/novel-import'
import {filesF,fullAi,legacySceneFixture,rosterAi,toVerify} from '../helpers/novel-import-wizard-fixture'

const model:ImportModel={id:'text',name:'受控文本模型',modelId:'synthetic',endpoint:'https://model.invalid/v1',authRevision:1,contextWindow:16000}
function source(text:string):ImportFile{return {id:'f',name:'正文.txt',path:'/private/tmp/synthetic-sources/f',format:'txt',bytes:Buffer.byteLength(text),hash:importHash(text),text,included:true}}
const tick=(ms=10)=>new Promise(resolve=>setTimeout(resolve,ms))
async function exists(path:string){try{await stat(path);return true}catch{return false}}

type Discard={requestId:string;title:string;importHash:string;target?:{path:string}}
async function fixture(){
 const root=await realpath(await mkdtemp(join(tmpdir(),'novel-stop-save-'))),target=await realpath(await mkdtemp(join(tmpdir(),'novel-stop-save-target-'))),s=await stat(target,{bigint:true})
 const discards:Discard[]=[];let published=0
 const options:any={root,choose:async()=>['/private/tmp/synthetic-sources'],chooseTarget:async()=>({path:target,device:String(s.dev),inode:String(s.ino)}),protectedDirectories:async()=>[],models:async()=>({text:model}),scan:async()=>[source('第一章\n沈砚十七岁。')],verifySources:async()=>{},
  ai:async(r:ImportAiRequest):Promise<ImportAiResult>=>r.phase==='classify'?{classifications:r.units.map(u=>({unitId:u.id,kind:'body' as const}))}:r.phase==='review'?{conflicts:[]}:{notFound:true},cancelAi:async()=>{},
  publish:async(input:{session:ImportSession;importHash:string})=>{published++;return {requestId:input.session.publication!.requestId,workId:'work',novelId:'novel',importHash:input.importHash}},
  discardPublication:async(input:Discard)=>{discards.push(structuredClone(input));return {state:'cleaned'}}}
 const make=()=>new NovelImportController(options)
 let controller=make();await controller.initialize()
 const current=async(c=controller)=>(await c.act({type:'current'})).view
 async function act(type:string,more:Record<string,unknown>={},c=controller){const v=await current(c);return c.act({type,...(type==='choose'?{}:{id:v!.id,revision:v!.revision}),...more})}
 async function settle(c=controller){for(let i=0;i<500&&c.active;i++)await tick(5)}
 async function phase(want:string,c=controller){for(let i=0;i<500;i++){const v=await current(c);if(v?.phase===want)return v;await tick(5)}throw Error('phase not reached: '+want)}
 return {get controller(){return controller},set controller(c){controller=c},make,options,root,target,discards,act,current,settle,phase,dir:(id:string)=>join(root,'novel-imports',id),get published(){return published},
  async dispose(){await controller.close().catch(()=>undefined);await rm(root,{recursive:true,force:true});await rm(target,{recursive:true,force:true})}}
}
async function ready(f:Awaited<ReturnType<typeof fixture>>){await f.act('choose',{mode:'files'});await f.act('classify',{mode:'local',consent:false});await f.act('select',{selected:['body'],targets:[],infer:false});await f.act('choose-target');return (await f.current())!}
/** Save started and failed: publication is recorded and phase is failed. */
async function failedSave(f:Awaited<ReturnType<typeof fixture>>){
 const publish=f.options.publish;let first=true
 f.options.publish=async(input:any)=>{if(first){first=false;throw Error('创建作品需要空目录，现有作品请使用打开')}return publish(input)}
 await ready(f);await f.act('start',{consent:false});await f.settle()
 const v=(await f.current())!;assert.equal(v.phase,'failed');assert.ok(v.publication);return v
}

test('SD-01: a failed save is deleted on stop and the half-created work is discarded',async()=>{
 const f=await fixture();try{
  const v=await failedSave(f);const result=await f.act('cancel')
  assert.equal(result.view,null);assert.equal(await exists(f.dir(v.id)),false);assert.equal(await f.current(),null)
  assert.equal(f.discards.length,1);assert.equal(f.discards[0].requestId,v.id);assert.equal(f.discards[0].title,v.title);assert.match(f.discards[0].importHash,/^[a-f0-9]{64}$/u);assert.equal(f.discards[0].target?.path,f.target)
  assert.equal(result.retained,undefined)
 }finally{await f.dispose()}
})

test('SD-02/SD-19: stopping while saving waits for the save; a completed work is kept and only the draft is deleted',async()=>{
 const f=await fixture();try{
  const gate=Promise.withResolvers<void>(),publish=f.options.publish;f.options.publish=async(input:any)=>{await gate.promise;return publish(input)}
  await ready(f);await f.act('start',{consent:false});const saving=await f.phase('publishing')
  let done=false;const stopping=f.act('cancel').then(r=>{done=true;return r})
  await tick(30);assert.equal(done,false,'stop waits for the in-flight save')
  assert.equal(await f.current(),null,'a reopened renderer sees nothing while deleting')
  await assert.rejects(f.controller.act({type:'resume',id:saving.id,revision:saving.revision}),/正在删除这次导入/)
  gate.resolve();const result=await stopping
  assert.equal(result.view,null);assert.equal(f.published,1);assert.equal(f.discards.length,0,'a completed work is never discarded');assert.equal(f.controller.active,0)
 }finally{await f.dispose()}
})

test('SD-03: a save that fails while stopping is discarded',async()=>{
 const f=await fixture();try{
  const gate=Promise.withResolvers<void>();f.options.publish=async()=>{await gate.promise;throw Error('保存失败')}
  const v=await ready(f);await f.act('start',{consent:false});await f.phase('publishing')
  const stopping=f.act('cancel');await tick();gate.resolve();const result=await stopping
  assert.equal(result.view,null);assert.equal(f.discards.length,1);assert.equal(await exists(f.dir(v.id)),false)
 }finally{await f.dispose()}
})

test('SD-04/SD-18: a discard that keeps files or is refused still deletes the import and reports the kept directory',async()=>{
 for(const fail of [async()=>({state:'kept',reason:'作品目录正在使用'}),async()=>{throw Error('导入任务正在停止')},async()=>{throw Error('本地服务正在关闭')}]){
  const f=await fixture();try{
   f.options.discardPublication=fail;const v=await failedSave(f);const result=await f.act('cancel')
   assert.equal(result.view,null);assert.equal(await exists(f.dir(v.id)),false)
   assert.match(result.retained??'',new RegExp(`^导入已删除；目标目录 ${f.target.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&')} 留有未完成的文件：`,'u'))
  }finally{await f.dispose()}
 }
})

test('SD-05/SD-07: close keeps a started save; after restart it can be deleted without authorizing the folder',async()=>{
 const f=await fixture();try{
  const v=await failedSave(f);await f.controller.close();assert.equal(await exists(f.dir(v.id)),true);assert.equal(f.discards.length,0)
  f.controller=f.make();await f.controller.initialize();const restored=(await f.current())!;assert.equal(restored.id,v.id);assert.equal(restored.targetReady,false)
  assert.equal((await f.act('cancel')).view,null);assert.equal(await exists(f.dir(v.id)),false);assert.equal(f.discards.length,1)
 }finally{await f.dispose()}
})

test('SD-08: a resume queued just before stop is drained before the draft is deleted',async()=>{
 const f=await fixture();try{
  const v=await failedSave(f);const gate=Promise.withResolvers<void>(),publish=f.options.publish;f.options.publish=async(input:any)=>{await gate.promise;return publish(input)}
  const resumed=f.act('retry');const stopping=f.act('cancel');await tick(30);gate.resolve()
  await resumed.catch(()=>undefined);const result=await stopping
  assert.equal(result.view,null);assert.equal(f.controller.active,0);assert.equal(await exists(f.dir(v.id)),false)
 }finally{await f.dispose()}
})

test('SD-16/SD-16b: a draft saved mid-publish before restart can be stopped, or saved after authorizing the folder',async()=>{
 for(const finish of ['cancel','resume'] as const){
  const f=await fixture();try{
   const gate=Promise.withResolvers<void>();f.options.publish=async()=>gate.promise.then(()=>{throw Error('进程退出')})
   const v=await ready(f);await f.act('start',{consent:false});await f.phase('publishing')
   const journal=JSON.parse(await readFile(join(f.dir(v.id),'session.json'),'utf8'));assert.equal(journal.phase,'publishing')
   gate.resolve();await f.settle();await f.controller.close()
   await writeFile(join(f.dir(v.id),'session.json'),JSON.stringify(journal))
   f.options.publish=async(input:any)=>({requestId:input.session.publication.requestId,workId:'w',novelId:'n',importHash:input.importHash})
   f.controller=f.make();await f.controller.initialize();assert.equal((await f.current())!.phase,'paused')
   if(finish==='cancel'){assert.equal((await f.act('cancel')).view,null);assert.equal(f.discards.length,1)}
   else{await f.act('choose-target');await f.act('resume');await f.settle();assert.equal((await f.current())!.phase,'completed')}
  }finally{await f.dispose()}
 }
})

test('SD-17: discard succeeded but the draft directory was kept; a restart can delete it again',async()=>{
 const f=await fixture();try{
  const v=await failedSave(f);await writeFile(join(f.dir(v.id),'unknown.bin'),'x')
  await assert.rejects(f.act('cancel'),/已保留/);assert.equal(await f.current(),null);assert.equal(f.discards.length,1)
  await rm(join(f.dir(v.id),'unknown.bin'));await f.controller.close()
  f.controller=f.make();await f.controller.initialize();assert.equal((await f.current())!.id,v.id)
  assert.equal((await f.act('cancel')).view,null);assert.equal(await exists(f.dir(v.id)),false);assert.equal(f.discards.length,2)
 }finally{await f.dispose()}
})

test('SD-19b: close during a delete waits for that delete',async()=>{
 const f=await fixture();try{
  const gate=Promise.withResolvers<void>(),publish=f.options.publish;f.options.publish=async(input:any)=>{await gate.promise;return publish(input)}
  const v=await ready(f);await f.act('start',{consent:false});await f.phase('publishing')
  const stopping=f.act('cancel');await tick();let closed=false;const closing=f.controller.close().then(()=>{closed=true})
  await tick(30);assert.equal(closed,false);gate.resolve();await stopping;await closing;assert.equal(await exists(f.dir(v.id)),false)
 }finally{await f.dispose()}
})

test('SD-13/SD-13c/SD-14: the folder picker refuses a non-empty folder or another work, but accepts one holding only .DS_Store',async()=>{
 const f=await fixture();try{
  await f.act('choose',{mode:'files'});await f.act('classify',{mode:'local',consent:false});await f.act('select',{selected:['body'],targets:[],infer:false})
  await writeFile(join(f.target,'a.txt'),'x');await assert.rejects(f.act('choose-target'),/请选择空目录/);assert.equal((await f.current())!.targetLabel,undefined)
  await rm(join(f.target,'a.txt'));await mkdir(join(f.target,'sub'));await writeFile(join(f.target,'shakeink-work.json'),'{}');await assert.rejects(f.act('choose-target'),/请选择空目录/)
  await rm(join(f.target,'sub'),{recursive:true});await rm(join(f.target,'shakeink-work.json'));await writeFile(join(f.target,'.DS_Store'),'finder')
  await f.act('choose-target');assert.equal((await f.current())!.targetReady,true)
 }finally{await f.dispose()}
})

test('SD-13b: while restoring a started save, a different non-empty folder is refused',async()=>{
 const f=await fixture();try{
  const v=await failedSave(f);await f.controller.close();f.controller=f.make();await f.controller.initialize()
  const other=await realpath(await mkdtemp(join(tmpdir(),'novel-stop-save-other-')));await writeFile(join(other,'a.txt'),'x');const o=await stat(other,{bigint:true})
  const choose=f.options.chooseTarget;f.options.chooseTarget=async()=>({path:other,device:String(o.dev),inode:String(o.ino)})
  try{await assert.rejects(f.act('choose-target'),/恢复保存必须重新授权原来的目录|请选择空目录/);assert.equal((await f.current())!.targetReady,false);assert.equal((await f.current())!.id,v.id)}
  finally{f.options.chooseTarget=choose;await rm(other,{recursive:true,force:true})}
 }finally{await f.dispose()}
})
test('SD-18b: error codes never reach the kept-folder notice',async()=>{
 const f=await fixture();try{
  f.options.discardPublication=async()=>{throw Error('BUSINESS_CLOSED')};await failedSave(f);const result=await f.act('cancel')
  assert.equal(result.view,null);assert.match(result.retained??'',/留有未完成的文件：目录内容无法确认$/u);assert.doesNotMatch(result.retained??'',/BUSINESS_CLOSED/)
 }finally{await f.dispose()}
})
test('SD-02b: a save that finishes while stopping keeps the work and says so',async()=>{
 const f=await fixture();try{
  const gate=Promise.withResolvers<void>(),publish=f.options.publish;f.options.publish=async(input:any)=>{await gate.promise;return publish(input)}
  await ready(f);await f.act('start',{consent:false});await f.phase('publishing');const stopping=f.act('cancel');await tick();gate.resolve()
  const result=await stopping;assert.equal(result.view,null);assert.equal(result.retained,undefined);assert.match(result.saved??'',/保存已在停止前完成，作品《.+》已保留在作品列表中/u)
 }finally{await f.dispose()}
})
test('SD-50u: a folder that gained files after it was chosen fails the save with a clear reason',async()=>{
 const f=await fixture();try{
  await ready(f);await writeFile(join(f.target,'作者笔记.txt'),'x');await f.act('start',{consent:false});await f.settle()
  const v=(await f.current())!;assert.equal(v.phase,'failed');assert.equal(v.error,'保存目录已不是空目录，请移走其中的文件或重新选择目录后继续保存');assert.equal(f.published,0)
  await rm(join(f.target,'作者笔记.txt'));await writeFile(join(f.target,'.DS_Store'),'f');await f.act('retry');await f.settle();assert.equal((await f.current())!.phase,'completed')
 }finally{await f.dispose()}
})
test('SD-50e: an unexplained service error at save names the folder, never the model',async()=>{
 const f=await fixture();try{
  f.options.publish=async()=>{throw Error("Error invoking remote method 'x': EACCES: permission denied, open '/a/b'")};await ready(f);await f.act('start',{consent:false});await f.settle()
  assert.equal((await f.current())!.error,'保存作品失败，请检查保存目录是否可写后继续保存')
 }finally{await f.dispose()}
})
test('SD-15: restoring a started save may reselect its original folder that already holds this import\'s files',async()=>{
 const f=await fixture();try{
  const v=await failedSave(f);await writeFile(join(f.target,'shakeink-work.json'),JSON.stringify({requestId:v.id}));await f.controller.close()
  f.controller=f.make();await f.controller.initialize();await f.act('choose-target');assert.equal((await f.current())!.targetReady,true)
 }finally{await f.dispose()}
})

// Step 22 of the wizard: the real reported state.
async function wizardAtSave(){
 const f=await legacySceneFixture(filesF(),rosterAi());f.setAi(fullAi(f))
 const publish=(f.options as any).publish;let failures=1
 ;(f.options as any).publish=async(input:any)=>{if(failures>0){failures--;throw Error('创建作品需要空目录，现有作品请使用打开')}return publish(input)}
 ;(f.options as any).discardPublication=async()=>({state:'none'})
 await toVerify(f);await f.act('wizard-next');const v=await f.settle();assert.equal(v.wizard!.step,'done');assert.equal(v.phase,'failed');assert.ok(v.publication)
 return f
}
test('SD-09: step 22 resumes saving without asking to send text to a model',async()=>{
 const f=await wizardAtSave();try{
  const requests=f.requests.length;await f.act('resume',{consent:false});const v=await f.settle()
  assert.equal(v.phase,'completed');assert.ok(f.published);assert.equal(f.requests.length,requests,'no model call')
 }finally{await f.dispose()}
})
test('SD-10: after restart step 22 asks to authorize the folder, never for a send grant, then saves',async()=>{
 const f=await wizardAtSave();try{
  await f.controller.close();const g=new NovelImportController(f.options as any);await g.initialize()
  const cur=async()=>(await g.act({type:'current'})).view!,act=async(type:string,extra:Record<string,unknown>={})=>{const v=await cur();return g.act({type,id:v.id,revision:v.revision,...extra})}
  assert.equal((await cur()).phase,'paused');await act('resume',{consent:false});let v=await cur()
  assert.equal(v.phase,'select');assert.equal(v.error,'请重新选择并授权原保存目录，再继续保存');assert.doesNotMatch(v.error??'',/重新允许/u)
  await act('choose-target');await act('resume',{consent:false});for(let i=0;i<500&&g.active;i++)await tick(5);v=await cur()
  assert.equal(v.phase,'completed');await g.close()
 }finally{await f.dispose()}
})
test('SD-11/SD-11b: a changed save plan is reported before folder authorization and the import can still be deleted',async()=>{
 const f=await wizardAtSave();try{
  const id=(await f.view()).id;await f.controller.close();const path=join(f.root,'novel-imports',id,'session.json'),journal=JSON.parse(await readFile(path,'utf8'))
  journal.publication.hash='0'.repeat(64);await writeFile(path,JSON.stringify(journal))
  const g=new NovelImportController(f.options as any);await g.initialize()
  const cur=async()=>(await g.act({type:'current'})).view,act=async(type:string,extra:Record<string,unknown>={})=>{const v=(await cur())!;return g.act({type,id:v.id,revision:v.revision,...extra})}
  await assert.rejects(act('resume',{consent:false}),/保存计划已变化，请删除这次导入后重新导入/)
  assert.equal((await act('cancel')).view,null);assert.equal(await cur(),null);assert.deepEqual(await readdir(join(f.root,'novel-imports')).then(n=>n.filter(x=>x===id)),[]);await g.close()
 }finally{await f.dispose()}
})
test('SD-12: step 21 is still the only first save entry; step 22 stop deletes',async()=>{
 const f=await wizardAtSave();try{
  assert.equal((await f.act('cancel')).view,null);assert.equal(await f.controller.act({type:'current'}).then(r=>r.view),null)
 }finally{await f.dispose()}
})
