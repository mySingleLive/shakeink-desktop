import assert from 'node:assert/strict'
import {test} from 'node:test'
import {mkdtemp,mkdir,readdir,readFile,rm,realpath,stat,writeFile,chmod} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {Workspaces} from '../../desktop/service/workspaces'
import {WorkCreationReservations} from '../../desktop/service/work-creation-reservations'
import {BRAND_NAMES} from '../../desktop/shared/brand-names'
import {NovelImportController} from '../../desktop/main/novel-import'
import {importHash} from '../../desktop/core/novel-import'
import {requestHash} from '../../src/lib/services/content-commit'
import type {ImportFile,ImportModel} from '../../desktop/shared/novel-import'

const migrations=join(process.cwd(),'prisma/migrations')
async function proof(path:string){const info=await stat(path,{bigint:true});return {path,device:String(info.dev),inode:String(info.ino)}}
async function empty(path:string){for(const name of await readdir(path))await rm(join(path,name),{recursive:true,force:true})}

async function fixture(){
 const base=await realpath(await mkdtemp(join(tmpdir(),'reused-import-target-'))),works=new Workspaces(join(base,'app'),migrations)
 await works.initialize()
 const target=join(base,'target');await mkdir(target)
 const dispose=async()=>{await works.close().catch(()=>undefined);await chmod(target,0o755).catch(()=>undefined);await rm(base,{recursive:true,force:true})}
 return {base,works,target,dispose}
}
/** Creates work A in target, then deletes it from the list (directory untouched, as in the app). */
async function deleted(f:Awaited<ReturnType<typeof fixture>>,requestId='reused-target-original'){
 const record=await f.works.create(await proof(f.target),{title:'合成作品',requestId})
 await f.works.forget(record.id,async()=>{})
 return record
}

// NI-20 · docs/568
test('RT-01/03: a deleted work’s emptied directory (even with .DS_Store) is no longer protected',{timeout:60000},async()=>{
 const f=await fixture();try{
  await deleted(f);await empty(f.target)
  assert.equal((await f.works.protectedDirectories()).includes(f.target),false)
  await writeFile(join(f.target,'.DS_Store'),'finder')
  assert.equal((await f.works.protectedDirectories()).includes(f.target),false)
 }finally{await f.dispose()}
})
test('RT-02/04: a listed work, or a deleted work whose files remain, stays protected',{timeout:60000},async()=>{
 const f=await fixture();try{
  const record=await f.works.create(await proof(f.target),{title:'合成作品',requestId:'reused-target-listed'})
  assert.equal((await f.works.protectedDirectories()).includes(f.target),true)
  await f.works.forget(record.id,async()=>{})
  assert.equal((await f.works.protectedDirectories()).includes(f.target),true)
 }finally{await f.dispose()}
})
test('RT-05: any single leftover work storage entry keeps the directory protected',{timeout:120000},async()=>{
 const f=await fixture();try{
  await deleted(f)
  const files=new Set<string>(['database','assets','.0123abcd-0123-4567-89ab-0123456789ab.tmp','.shakeink-unknown','.xuanxiang-unknown'])
  for(const n of BRAND_NAMES){for(const name of [n.appMarker,n.workManifest,n.storage,n.storageRequired,n.lock,n.audit,n.restores,n.preserved])files.add(name);for(const prefix of [n.leaseTemporaryPrefix,n.migrationStagePrefix,n.rootRecoveryPrefix])files.add(prefix+'x')}
  for(const name of files){
   await empty(f.target);await writeFile(join(f.target,name),'leftover')
   assert.equal((await f.works.protectedDirectories()).includes(f.target),true,name)
  }
  for(const name of ['database','assets','.shakeink-unknown']){
   await empty(f.target);await mkdir(join(f.target,name))
   assert.equal((await f.works.protectedDirectories()).includes(f.target),true,name+'/')
  }
 }finally{await f.dispose()}
})
test('RT-06: a removed directory is not protected and does not throw',{timeout:60000},async()=>{
 const f=await fixture();try{
  await deleted(f);await rm(f.target,{recursive:true,force:true})
  assert.equal((await f.works.protectedDirectories()).includes(f.target),false)
  await writeFile(f.target,'now a file')
  assert.equal((await f.works.protectedDirectories()).includes(f.target),false)
  await rm(f.target);await mkdir(f.target)
 }finally{await f.dispose()}
})
test('RT-07: a pending reservation on an empty directory is not protected; discard still releases it',{timeout:60000},async()=>{
 const f=await fixture();try{
  const title='合成导入',hash='c'.repeat(64),requestId='0b6c3d2e-1111-4222-8333-444455556666'
  const internal=f.works as unknown as {creationReservations:WorkCreationReservations}
  await internal.creationReservations.reserve({requestId,requestHash:requestHash({title,importHash:hash}),selection:await proof(f.target)},()=>{})
  assert.equal((await f.works.protectedDirectories()).includes(f.target),false)
  assert.deepEqual(await f.works.discardImportCreation({requestId,title,importHash:hash},()=>{}),{state:'none'})
  assert.equal(await internal.creationReservations.find(requestId),null)
 }finally{await f.dispose()}
})
test('RT-08/09: a new work can be created in the reused directory; replaying the old request cannot touch it',{timeout:90000},async()=>{
 const f=await fixture();try{
  await deleted(f,'reused-target-old-request');await empty(f.target)
  const second=await f.works.create(await proof(f.target),{title:'合成作品',requestId:'reused-target-new-request'})
  assert.ok((await f.works.list()).some(row=>row.id===second.id))
  assert.equal((await f.works.protectedDirectories()).includes(f.target),true)
  const before=(await readdir(f.target)).sort(),manifest=await readFile(join(f.target,BRAND_NAMES[1].workManifest))
  await assert.rejects(f.works.create(await proof(f.target),{title:'合成作品',requestId:'reused-target-old-request'}),/此目录属于其他建书请求/)
  assert.deepEqual((await readdir(f.target)).sort(),before)
  assert.deepEqual(await readFile(join(f.target,BRAND_NAMES[1].workManifest)),manifest)
  assert.ok((await f.works.list()).some(row=>row.id===second.id))
 }finally{await f.dispose()}
})
test('RT-10: an unreadable reserved directory stays protected',{timeout:60000,skip:process.getuid?.()===0},async()=>{
 const f=await fixture();try{
  await deleted(f);await empty(f.target);await chmod(f.target,0o000)
  assert.equal((await f.works.protectedDirectories()).includes(f.target),true)
 }finally{await f.dispose()}
})

const model:ImportModel={id:'text',name:'受控文本模型',modelId:'synthetic',endpoint:'https://model.invalid/v1',authRevision:1,contextWindow:16000}
function source(text:string):ImportFile{return {id:'f',name:'正文.txt',path:'/private/tmp/synthetic-sources/f',format:'txt',bytes:Buffer.byteLength(text),hash:importHash(text),text,included:true}}
async function chooseTarget(f:Awaited<ReturnType<typeof fixture>>){
 const root=await realpath(await mkdtemp(join(tmpdir(),'reused-import-controller-'))),target=await proof(f.target)
 const controller=new NovelImportController({root,choose:async()=>['/private/tmp/synthetic-sources'],chooseTarget:async()=>target,protectedDirectories:()=>f.works.protectedDirectories(),models:async()=>({text:model}),scan:async()=>[source('第一章\n沈砚十七岁。')],verifySources:async()=>{},
  ai:async()=>({notFound:true}),cancelAi:async()=>{},publish:async()=>{throw Error('not used')}} as any)
 await controller.initialize()
 const act=async(type:string,more:Record<string,unknown>={})=>{const v=(await controller.act({type:'current'})).view;return controller.act({type,...(type==='choose'?{}:{id:v!.id,revision:v!.revision}),...more})}
 try{
  await act('choose',{mode:'files'});await act('classify',{mode:'local',consent:false});await act('select',{selected:['body'],targets:[],infer:false})
  await act('choose-target');return (await controller.act({type:'current'})).view
 }finally{await controller.close().catch(()=>undefined);await rm(root,{recursive:true,force:true})}
}
test('RT-04b: a listed work whose folder was emptied is no longer protected; its folder can be chosen again',{timeout:90000},async()=>{
 const f=await fixture();try{
  await f.works.create(await proof(f.target),{title:'合成作品',requestId:'reused-target-listed-empty'})
  await empty(f.target);await writeFile(join(f.target,'.DS_Store'),'finder')
  assert.equal((await f.works.protectedDirectories()).includes(f.target),false)
  assert.equal((await chooseTarget(f))?.targetReady,true)
 }finally{await f.dispose()}
})
test('RT-14: a soft-deleted work still listed (normal sidebar delete) frees its emptied folder; a new work replaces the old list record',{timeout:120000},async()=>{
 const f=await fixture();try{
  const old=await f.works.create(await proof(f.target),{title:'合成作品',requestId:'reused-target-soft-old'})
  await f.works.run(old.id,async()=>{const {getDatabaseContext}=await import('../../desktop/service/context');await getDatabaseContext().database.novel.update({where:{id:old.novelId},data:{status:'DELETED'}})})
  assert.equal((await f.works.protectedDirectories()).includes(f.target),true,'files still there')
  await empty(f.target)
  assert.equal((await f.works.protectedDirectories()).includes(f.target),false)
  assert.equal((await chooseTarget(f))?.targetReady,true)
  const hooked:string[]=[];f.works.staleWorkHook=async id=>{hooked.push(id)}
  const fresh=await f.works.create(await proof(f.target),{title:'合成作品',requestId:'reused-target-soft-new'})
  const list=await f.works.list()
  assert.deepEqual(list.map(row=>row.id),[fresh.id]);assert.deepEqual(hooked,[old.id])
  await assert.rejects(f.works.run(old.id,async()=>undefined),/作品不在本地目录索引中/)
  assert.equal((await f.works.protectedDirectories()).includes(f.target),true)
 }finally{await f.dispose()}
})
test('RT-15: a failing stale-work hook keeps the old record and does not register the new work',{timeout:120000},async()=>{
 const f=await fixture();try{
  const old=await f.works.create(await proof(f.target),{title:'合成作品',requestId:'reused-target-hook-old'})
  await empty(f.target)
  f.works.staleWorkHook=async()=>{throw Error('ledger unavailable')}
  await assert.rejects(f.works.create(await proof(f.target),{title:'合成作品',requestId:'reused-target-hook-new'}),/ledger unavailable/)
  assert.deepEqual((await f.works.list()).map(row=>row.id),[old.id])
  f.works.staleWorkHook=undefined
  const fresh=await f.works.create(await proof(f.target),{title:'合成作品',requestId:'reused-target-hook-new'})
  assert.deepEqual((await f.works.list()).map(row=>row.id),[fresh.id])
 }finally{await f.dispose()}
})
test('RT-16: a busy old work in the emptied folder refuses registration with WORK_BUSY',{timeout:120000},async()=>{
 const f=await fixture();try{
  const old=await f.works.create(await proof(f.target),{title:'合成作品',requestId:'reused-target-busy-old'})
  const hold=Promise.withResolvers<void>(),entered=Promise.withResolvers<void>()
  const running=f.works.run(old.id,async()=>{entered.resolve();await hold.promise}).catch(()=>undefined)
  await entered.promise;await empty(f.target)
  await assert.rejects(f.works.create(await proof(f.target),{title:'合成作品',requestId:'reused-target-busy-new'}),{code:'WORK_BUSY'})
  assert.deepEqual((await f.works.list()).map(row=>row.id),[old.id])
  hold.resolve();await running
 }finally{await f.dispose()}
})
test('RT-17: other listed works on different folders are untouched by a reuse',{timeout:120000},async()=>{
 const f=await fixture();try{
  const other=join(f.base,'other');await mkdir(other)
  const kept=await f.works.create(await proof(other),{title:'另一作品',requestId:'reused-target-other'})
  await f.works.create(await proof(f.target),{title:'合成作品',requestId:'reused-target-first'});await empty(f.target)
  const fresh=await f.works.create(await proof(f.target),{title:'合成作品',requestId:'reused-target-second'})
  assert.deepEqual((await f.works.list()).map(row=>row.id).sort(),[kept.id,fresh.id].sort())
  assert.equal((await f.works.protectedDirectories()).includes(other),true)
 }finally{await f.dispose()}
})
test('RT-07b: an old pending request cannot discard or lease a newer work created in the reused directory',{timeout:90000},async()=>{
 const f=await fixture();try{
  const title='合成导入',hash='d'.repeat(64),requestId='1c7d4e3f-2222-4333-8444-555566667777'
  const internal=f.works as unknown as {creationReservations:WorkCreationReservations}
  const selection=await proof(f.target)
  await internal.creationReservations.reserve({requestId,requestHash:requestHash({title,importHash:hash}),selection},()=>{})
  await f.works.create(selection,{title:'合成作品',requestId:'reused-target-newer-work'})
  const before=(await readdir(f.target)).sort(),manifest=await readFile(join(f.target,BRAND_NAMES[1].workManifest))
  assert.deepEqual(await f.works.discardImportCreation({requestId,title,importHash:hash},()=>{}),{state:'kept',reason:'目录已属于其他作品'})
  await assert.rejects(f.works.importLeaseTarget(selection,{requestId,title,importHash:hash},()=>{}),/原导入目录请求不匹配/)
  await assert.rejects(f.works.create(selection,{title,requestId},undefined,{importHash:hash,initialize:async()=>{throw Error('must not run')},verify:async()=>{throw Error('must not run')}} as any),{code:'REQUEST_CONFLICT'})
  assert.deepEqual((await readdir(f.target)).sort(),before)
  assert.deepEqual(await readFile(join(f.target,BRAND_NAMES[1].workManifest)),manifest)
  assert.notEqual(await internal.creationReservations.find(requestId),null)
 }finally{await f.dispose()}
})
test('RT-13: a deleted work’s directory holding only foreign files is not protected; the wizard asks for an empty directory',{timeout:90000},async()=>{
 const f=await fixture();try{
  await deleted(f);await empty(f.target);await writeFile(join(f.target,'notes.txt'),'author notes')
  assert.equal((await f.works.protectedDirectories()).includes(f.target),false)
  await assert.rejects(chooseTarget(f),/请选择空目录，用于保存导入的作品/)
 }finally{await f.dispose()}
})
test('RT-11: the import wizard accepts the emptied directory of a deleted work',{timeout:90000},async()=>{
 const f=await fixture();try{
  await deleted(f);await empty(f.target)
  const view=await chooseTarget(f)
  assert.equal(view?.targetReady,true,JSON.stringify(view?.error))
  assert.equal(view?.targetLabel,f.target)
 }finally{await f.dispose()}
})
test('RT-12: the import wizard still rejects a deleted work’s directory that keeps its files',{timeout:90000},async()=>{
 const f=await fixture();try{
  await deleted(f)
  await assert.rejects(chooseTarget(f),/保存目录不能与来源或应用目录重叠/)
 }finally{await f.dispose()}
})

// docs/569 补充审核 2R：缺失用例
test('RT-18: a listed work whose folder holds only foreign files stays listed; creation asks for an empty folder',{timeout:120000},async()=>{
 const f=await fixture();try{
  const old=await f.works.create(await proof(f.target),{title:'合成作品',requestId:'reused-target-foreign-old'})
  await empty(f.target);await writeFile(join(f.target,'notes.txt'),'author notes')
  await assert.rejects(f.works.create(await proof(f.target),{title:'合成作品',requestId:'reused-target-foreign-new'}),/创建作品需要空目录/)
  assert.deepEqual((await f.works.list()).map(row=>row.id),[old.id])
 }finally{await f.dispose()}
})
test('RT-19: a folder changed while the old work was being retired fails and restores the old work',{timeout:120000},async()=>{
 const f=await fixture();try{
  const old=await f.works.create(await proof(f.target),{title:'合成作品',requestId:'reused-target-race-old'})
  await empty(f.target)
  const internal=f.works as unknown as {retireStaleWorks:(rows:unknown[])=>Promise<void>}
  const original=internal.retireStaleWorks.bind(f.works)
  internal.retireStaleWorks=async rows=>{await original(rows);await writeFile(join(f.target,'late.txt'),'x')}
  await assert.rejects(f.works.create(await proof(f.target),{title:'合成作品',requestId:'reused-target-race-new'}),/所选目录内容已变化/)
  assert.deepEqual((await f.works.list()).map(row=>row.id),[old.id])
  await assert.rejects(f.works.run(old.id,async()=>undefined),(error:Error)=>!/作品不在本地目录索引中/.test(error.message))
 }finally{await f.dispose()}
})
test('RT-20: a failure after the catalog write keeps the old work removed; the same request then returns the new work',{timeout:120000},async()=>{
 const f=await fixture();try{
  const old=await f.works.create(await proof(f.target),{title:'合成作品',requestId:'reused-target-late-old'})
  await empty(f.target)
  const hash='e'.repeat(64),init=(fail:boolean)=>({importHash:hash,initialize:async()=>{},verify:async()=>{},phase:async(p:string)=>{if(fail&&p==='catalog-committed')throw Error('late failure')}})
  await assert.rejects(f.works.create(await proof(f.target),{title:'合成作品',requestId:'reused-target-late-new'},undefined,init(true)),/late failure/)
  const list=await f.works.list();assert.equal(list.length,1);assert.notEqual(list[0].id,old.id)
  await assert.rejects(f.works.run(old.id,async()=>undefined),/作品不在本地目录索引中/)
  const again=await f.works.create(await proof(f.target),{title:'合成作品',requestId:'reused-target-late-new'},undefined,init(false))
  assert.equal(again.id,list[0].id)
 }finally{await f.dispose()}
})
test('RT-21: open() of a folder now holding another work drops the old row for that folder',{timeout:120000},async()=>{
 const f=await fixture();try{
  const old=await f.works.create(await proof(f.target),{title:'合成作品',requestId:'reused-target-open-old'})
  await empty(f.target)
  // A finished but unregistered work in the folder: register, then remove only its row to simulate a lost catalog write.
  const fresh=await f.works.create(await proof(f.target),{title:'合成作品',requestId:'reused-target-open-new'})
  const internal=f.works as unknown as {catalog:{read():Promise<{revision:number;value:unknown[]}>;update(revision:number,value:unknown[]):Promise<void>}}
  const now=await internal.catalog.read();await internal.catalog.update(now.revision,[{...(now.value[0] as object),id:old.id,novelId:old.novelId,title:old.title,requestId:old.requestId,requestHash:old.requestHash,createdAt:old.createdAt}])
  const opened=await f.works.open(await proof(f.target))
  assert.equal(opened.id,fresh.id);assert.deepEqual((await f.works.list()).map(row=>row.id),[fresh.id])
 }finally{await f.dispose()}
})
test('RT-22: two old rows on the same folder are both retired together',{timeout:120000},async()=>{
 const f=await fixture();try{
  const old=await f.works.create(await proof(f.target),{title:'合成作品',requestId:'reused-target-two-old'})
  const internal=f.works as unknown as {catalog:{read():Promise<{revision:number;value:{id:string}[]}>;update(revision:number,value:unknown[]):Promise<void>}}
  const now=await internal.catalog.read();await internal.catalog.update(now.revision,[...now.value,{...now.value[0],id:'00000000-0000-4000-8000-000000000022',requestId:'reused-target-two-dup'}])
  await empty(f.target)
  const hooked:string[]=[];f.works.staleWorkHook=async id=>{hooked.push(id)}
  const fresh=await f.works.create(await proof(f.target),{title:'合成作品',requestId:'reused-target-two-new'})
  assert.deepEqual((await f.works.list()).map(row=>row.id),[fresh.id]);assert.deepEqual(hooked.sort(),[old.id,'00000000-0000-4000-8000-000000000022'].sort())
 }finally{await f.dispose()}
})
test('RT-23: the real conversation runtime marks only the old work’s conversations deleted',{timeout:150000},async()=>{
 const f=await fixture();const {configureConversationTransfers,conversationTransfersFor}=await import('../../desktop/service/conversation-runtime')
 const {getDatabaseContext}=await import('../../desktop/service/context')
 const dispose=configureConversationTransfers(f.works,async()=>{throw Error('no main')})
 try{
  const other=join(f.base,'other');await mkdir(other)
  const kept=await f.works.create(await proof(other),{title:'另一作品',requestId:'reused-target-chat-other'})
  const old=await f.works.create(await proof(f.target),{title:'合成作品',requestId:'reused-target-chat-old'})
  const transfers=conversationTransfersFor(f.works)!
  for(const [work,id] of [[old,'rt23-old-chat'],[kept,'rt23-kept-chat']] as const){
   await f.works.runWithGlobal(work.id,async()=>{await getDatabaseContext().database.conversation.create({data:{id,userId:'local-author',novelId:work.novelId,title:'合成对话'}});await transfers.current(id)})
  }
  await empty(f.target)
  await f.works.create(await proof(f.target),{title:'合成作品',requestId:'reused-target-chat-new'})
  const locations=await transfers.ledger.locations()
  assert.equal(locations.find(row=>row.conversationId==='rt23-old-chat')?.deleted,true)
  assert.equal(locations.find(row=>row.conversationId==='rt23-kept-chat')?.deleted,false)
 }finally{dispose();await f.dispose()}
})
