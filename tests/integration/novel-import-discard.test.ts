// docs/560-561: discarding an unfinished import save against real Workspaces and PGlite.
import assert from 'node:assert/strict'
import {before,after,test} from 'node:test'
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm,stat,rename,realpath,symlink,chmod} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {tmpdir,hostname} from 'node:os'
import {randomUUID,createHash} from 'node:crypto'
import {Workspaces} from '../../desktop/service/workspaces'
import {loadDatabaseSeed} from '../../desktop/service/database/seed'
import type {ImportSession,ImportPublishInput} from '../../desktop/shared/novel-import'
import {importPlanHash} from '../../desktop/core/novel-import'
import {publishNovelImport} from '../../desktop/service/novel-import-publish'
import {discardNovelImport} from '../../desktop/service/novel-import-discard'
import {CURRENT_NAMES,LEGACY_NAMES} from '../../desktop/shared/brand-names'

let root:string,works:Workspaces
const text='第一章 渡口\n陆青十七岁。\n'
before(async()=>{root=await realpath(await mkdtemp(join(tmpdir(),'shakeink-import-discard-')));const data=join(root,'app');await mkdir(data);works=new Workspaces(data,resolve('prisma/migrations'),await loadDatabaseSeed(resolve('prisma/empty-database.json')));await works.initialize()})
after(async()=>{await works?.close();if(root)await rm(root,{recursive:true,force:true})})

async function input(prefill:Record<string,string>={}):Promise<ImportPublishInput>{
 const id=randomUUID(),source=join(root,'source-'+id+'.txt'),target=join(root,'work-'+id);await writeFile(source,text);await mkdir(target)
 for(const [name,content] of Object.entries(prefill))await writeFile(join(target,name),content)
 const info=await stat(target,{bigint:true}),now=new Date().toISOString()
 const session:ImportSession={version:1,id,revision:1,phase:'publishing',title:'合成导入',files:[{id:'body-file',name:'原稿.txt',format:'txt',path:source,bytes:Buffer.byteLength(text),hash:createHash('sha256').update(text).digest('hex'),text,included:true}],units:[{id:'body-unit',fileId:'body-file',start:0,end:text.length,text,kind:'body'}],selected:['body'],targets:[],infer:false,artifacts:[],conflicts:[],patches:[],originalProse:text,workingProse:text,workingRevision:0,chapters:[{id:'chapter-1',title:'渡口',start:0,end:text.length,content:text}],steps:[{key:'body',label:'正文',state:'done',completed:1,total:1}],coverage:{body:['body-unit']},notFound:[],epoch:1,createdAt:now,updatedAt:now,decisions:[],publication:{requestId:id}}
 return{session,selection:{path:target,device:String(info.dev),inode:String(info.ino)},importHash:importPlanHash(session)}
}
const request=(v:ImportPublishInput)=>({requestId:v.session.id,title:v.session.title,importHash:v.importHash,target:v.selection})
async function failAt(v:ImportPublishInput,phase:string){await assert.rejects(publishNovelImport(works,v,undefined,{phase:async at=>{if(at===phase)throw Error('injected fault')}}),/injected fault/)}
const reserved=async(v:ImportPublishInput)=>(await works.protectedDirectories()).includes(v.selection.path)
const listing=async(path:string)=>(await readdir(path)).sort()

test('SD-20/SD-20b: a folder holding only .DS_Store is empty for creation; other files still refuse',{timeout:120000},async()=>{
 const v=await input({'.DS_Store':'finder'}),saved=await publishNovelImport(works,v);assert.ok(saved.workId);assert.equal(await readFile(join(v.selection.path,'.DS_Store'),'utf8'),'finder')
 const other=await input({'author.txt':'x'});await assert.rejects(publishNovelImport(works,other),/空目录/)
})
test('SD-21: an import that never reserved its folder discards nothing',{timeout:120000},async()=>{
 const v=await input({'.DS_Store':'f'});assert.deepEqual(await discardNovelImport(works,request(v)),{state:'none'});assert.deepEqual(await listing(v.selection.path),['.DS_Store'])
})
test('SD-22: a registered work is kept untouched',{timeout:120000},async()=>{
 const v=await input(),saved=await publishNovelImport(works,v),before=await listing(v.selection.path)
 assert.deepEqual(await discardNovelImport(works,request(v)),{state:'work'});assert.deepEqual(await listing(v.selection.path),before);assert.ok((await works.list()).some(w=>w.id===saved.workId));assert.equal(await reserved(v),true)
})
test('SD-23: every unfinished phase is cleaned back to the original folder and the folder can be used again',{timeout:240000},async t=>{
 for(const phase of ['before-initialize','domain-writing','database-committed'])await t.test(phase,async()=>{
  const v=await input({'.DS_Store':'f'});await failAt(v,phase);await writeFile(join(v.selection.path,'note.txt'),'作者笔记');assert.ok((await readdir(v.selection.path)).includes(CURRENT_NAMES.workManifest))
  assert.deepEqual(await discardNovelImport(works,request(v)),{state:'cleaned'})
  assert.deepEqual(await listing(v.selection.path),['.DS_Store','note.txt']);assert.equal(await reserved(v),false)
  await rm(join(v.selection.path,'note.txt'));const again=await publishNovelImport(works,v);assert.ok(again.workId)
 })
})
test('SD-24: a ready manifest that was not registered keeps the folder and its reservation',{timeout:120000},async()=>{
 const v=await input();await failAt(v,'manifest-ready');const before=await listing(v.selection.path)
 const r=await discardNovelImport(works,request(v));assert.equal(r.state,'kept');assert.match(r.reason??'',/已完成建库/);assert.deepEqual(await listing(v.selection.path),before);assert.equal(await reserved(v),true)
})
test('SD-24b: a work registered at catalog-committed is reported as a work',{timeout:120000},async()=>{
 const v=await input();await failAt(v,'catalog-committed');assert.deepEqual(await discardNovelImport(works,request(v)),{state:'work'})
})
test('SD-25: another request\'s manifest is never deleted',{timeout:120000},async()=>{
 for(const field of ['requestId','requestHash']){
  const v=await input();await failAt(v,'before-initialize');const path=join(v.selection.path,CURRENT_NAMES.workManifest),m=JSON.parse(await readFile(path,'utf8'));m[field]=field==='requestId'?randomUUID():'0'.repeat(64);await writeFile(path,JSON.stringify(m))
  const before=await listing(v.selection.path),r=await discardNovelImport(works,request(v));assert.equal(r.state,'kept');assert.match(r.reason??'',/其他作品/);assert.deepEqual(await listing(v.selection.path),before);assert.equal(await reserved(v),true)
 }
})
test('SD-26: a reserved folder that was replaced keeps the new folder and drops the reservation',{timeout:120000},async()=>{
 const v=await input();await failAt(v,'before-initialize');await rename(v.selection.path,v.selection.path+'-moved');await mkdir(v.selection.path);await writeFile(join(v.selection.path,'新.txt'),'新')
 assert.deepEqual(await discardNovelImport(works,request(v)),{state:'none'});assert.deepEqual(await listing(v.selection.path),['新.txt']);assert.equal(await reserved(v),false)
 assert.ok((await readdir(v.selection.path+'-moved')).includes(CURRENT_NAMES.workManifest),'the moved folder is never touched')
})
test('SD-27: a symbolic link in place of a known entry keeps everything',{timeout:120000},async()=>{
 const v=await input();await failAt(v,'before-initialize');const outside=join(root,'outside-'+v.session.id);await mkdir(outside);await writeFile(join(outside,'keep.txt'),'k')
 await rm(join(v.selection.path,'assets'),{recursive:true});await symlink(outside,join(v.selection.path,'assets'))
 const r=await discardNovelImport(works,request(v));assert.equal(r.state,'kept');assert.deepEqual(await readdir(outside),['keep.txt']);assert.ok((await readdir(v.selection.path)).includes(CURRENT_NAMES.workManifest))
})
test('SD-28′/SD-29: a lock held by another live process keeps the folder; a lock left by this process is removed',{timeout:120000},async()=>{
 const v=await input();await failAt(v,'before-initialize');const lock=join(v.selection.path,CURRENT_NAMES.lock);await mkdir(lock);await writeFile(join(lock,'owner.json'),JSON.stringify({token:randomUUID(),pid:process.ppid,host:hostname()}))
 const r=await discardNovelImport(works,request(v));assert.equal(r.state,'kept');assert.match(r.reason??'',/正在使用/)
 await writeFile(join(lock,'owner.json'),JSON.stringify({token:randomUUID(),pid:process.pid,host:hostname()}))
 assert.deepEqual(await discardNovelImport(works,request(v)),{state:'cleaned'});assert.deepEqual(await readdir(v.selection.path),[])
})
test('SD-30: a failed delete keeps the manifest and reservation, and a retry finishes',{timeout:120000},async()=>{
 const v=await input();await failAt(v,'before-initialize');const database=join(v.selection.path,'database');await chmod(database,0o555)
 try{const r=await discardNovelImport(works,request(v));assert.equal(r.state,'kept');assert.ok((await readdir(v.selection.path)).includes(CURRENT_NAMES.workManifest));assert.equal(await reserved(v),true)}
 finally{await chmod(database,0o755)}
 assert.deepEqual(await discardNovelImport(works,request(v)),{state:'cleaned'});assert.equal(await reserved(v),false)
})
test('SD-32: a half-created work under the legacy names is cleaned with those names',{timeout:120000},async()=>{
 const v=await input();await failAt(v,'before-initialize');await rename(join(v.selection.path,CURRENT_NAMES.workManifest),join(v.selection.path,LEGACY_NAMES.workManifest))
 assert.deepEqual(await discardNovelImport(works,request(v)),{state:'cleaned'});assert.deepEqual(await readdir(v.selection.path),[])
})
test('SD-33: atomic-write temporaries are removed with the half-created work; author files stay',{timeout:120000},async()=>{
 const v=await input();await failAt(v,'before-initialize');await writeFile(join(v.selection.path,`.${randomUUID()}.tmp`),'t');await writeFile(join(v.selection.path,'note.txt'),'n')
 assert.deepEqual(await discardNovelImport(works,request(v)),{state:'cleaned'});assert.deepEqual(await listing(v.selection.path),['note.txt'])
})
test('SD-33b: unexpected work data such as restores keeps the whole folder untouched',{timeout:120000},async()=>{
 const v=await input();await failAt(v,'before-initialize');await mkdir(join(v.selection.path,CURRENT_NAMES.restores));const before=await listing(v.selection.path)
 const r=await discardNovelImport(works,request(v));assert.equal(r.state,'kept');assert.match(r.reason??'',/无法确认/);assert.deepEqual(await listing(v.selection.path),before);assert.equal(await reserved(v),true)
})

test('SD-26b: a reserved folder that cannot be read keeps its reservation',{timeout:120000},async()=>{
 const parent=await realpath(await mkdtemp(join(root,'locked-')))
 const id=randomUUID(),target=join(parent,'work');await mkdir(target);const info=await stat(target,{bigint:true}),base=await input()
 const v={...base,selection:{path:target,device:String(info.dev),inode:String(info.ino)}};await failAt(v,'before-initialize')
 try{await chmod(parent,0o000);const r=await discardNovelImport(works,request(v));assert.deepEqual(r,{state:'kept',reason:'无法读取目标目录'})}
 finally{await chmod(parent,0o755)}
 assert.equal(await reserved(v),true);assert.deepEqual(await discardNovelImport(works,request(v)),{state:'cleaned'});void id
})
test('SD-32b: both legacy and current manifests keep the folder',{timeout:120000},async()=>{
 const v=await input();await failAt(v,'before-initialize');await writeFile(join(v.selection.path,LEGACY_NAMES.workManifest),'{}');const before=await listing(v.selection.path)
 const r=await discardNovelImport(works,request(v));assert.equal(r.state,'kept');assert.match(r.reason??'',/新旧两种作品清单/);assert.deepEqual(await listing(v.selection.path),before);assert.equal(await reserved(v),true)
})
test('SD-29b: a lock with unknown files or without owner.json keeps the folder',{timeout:120000},async()=>{
 for(const content of [{'owner.json':JSON.stringify({token:randomUUID(),pid:process.pid,host:hostname()}),'extra':'x'},{}] as Record<string,string>[]){
  const v=await input();await failAt(v,'before-initialize');const lock=join(v.selection.path,CURRENT_NAMES.lock);await mkdir(lock);for(const [n,c] of Object.entries(content))await writeFile(join(lock,n),c)
  const r=await discardNovelImport(works,request(v));assert.equal(r.state,'kept');assert.ok((await readdir(v.selection.path)).includes(CURRENT_NAMES.lock));assert.equal(await reserved(v),true)
 }
})
