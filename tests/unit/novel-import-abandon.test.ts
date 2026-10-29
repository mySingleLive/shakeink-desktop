import assert from 'node:assert/strict'
import {test} from 'node:test'
import {mkdtemp,mkdir,readFile,readdir,writeFile,stat,rm,realpath,symlink,link,unlink} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {NovelImportController} from '../../desktop/main/novel-import'
import {importHash} from '../../desktop/core/novel-import'
import type {ImportAiRequest,ImportAiResult,ImportFile,ImportModel,ImportSession} from '../../desktop/shared/novel-import'

const model:ImportModel={id:'text',name:'受控文本模型',modelId:'synthetic',endpoint:'https://model.invalid/v1',authRevision:1,contextWindow:16000}
const marker='shakeink-novel-import-v1\n'
function source(text:string,name='正文.txt',id='f'):ImportFile{return {id,name,path:'/private/tmp/synthetic-sources/'+id,format:'txt',bytes:Buffer.byteLength(text),hash:importHash(text),text,included:true}}
function deferred<T=void>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r});return {promise,resolve}}
const tick=(ms=10)=>new Promise(resolve=>setTimeout(resolve,ms))

async function fixture(files=[source('第一章\n沈砚十七岁。')],extra:Record<string,unknown>={}){
 const root=await realpath(await mkdtemp(join(tmpdir(),'novel-abandon-'))),target=await realpath(await mkdtemp(join(tmpdir(),'novel-abandon-target-'))),s=await stat(target,{bigint:true});let picked=0,published=0
 const options:any={root,choose:async()=>{picked++;return ['/private/tmp/synthetic-sources']},chooseTarget:async()=>({path:target,device:String(s.dev),inode:String(s.ino)}),protectedDirectories:async()=>[],models:async()=>({text:model}),scan:async()=>structuredClone(files),verifySources:async()=>{},redecode:async(f:ImportFile)=>({...f,requiresEncodingConfirmation:false}),
  ai:async(r:ImportAiRequest):Promise<ImportAiResult>=>r.phase==='classify'?{classifications:r.units.map(u=>({unitId:u.id,kind:'body' as const}))}:r.phase==='review'?{conflicts:[]}:{notFound:true},cancelAi:async()=>{},
  publish:async(input:{session:ImportSession;importHash:string})=>{published++;return {requestId:input.session.publication!.requestId,workId:'work',novelId:'novel',importHash:input.importHash}},...extra}
 const controller=new NovelImportController(options);await controller.initialize()
 const current=async(c=controller)=>(await c.act({type:'current'})).view
 async function act(type:string,more:Record<string,unknown>={},c=controller){const v=await current(c);return c.act({type,...(type==='choose'?{}:{id:v!.id,revision:v!.revision}),...more})}
 const dirs=async()=>(await readdir(join(root,'novel-imports'))).filter(name=>/^[0-9a-f-]{36}$/u.test(name))
 return {controller,options,root,target,act,current,dirs,dir:(id:string)=>join(root,'novel-imports',id),get picked(){return picked},get published(){return published},
  async dispose(){await controller.close().catch(()=>undefined);await rm(root,{recursive:true,force:true});await rm(target,{recursive:true,force:true})}}
}
async function exists(path:string){try{await stat(path);return true}catch{return false}}
// Ready to start: a plain copy with no AI and an authorized target.
async function ready(f:Awaited<ReturnType<typeof fixture>>){await f.act('choose',{mode:'files'});await f.act('classify',{mode:'local',consent:false});await f.act('select',{selected:['body'],targets:[],infer:false});await f.act('choose-target');return (await f.current())!}
async function heldClassify(f:Awaited<ReturnType<typeof fixture>>){
 const release=deferred<ImportAiResult>(),started=deferred();let operation=''
 f.options.ai=async(r:ImportAiRequest)=>{operation=r.operationId;started.resolve();return release.promise}
 await f.act('choose',{mode:'files'});await f.act('classify',{mode:'ai',consent:true});await started.promise
 return {release,get operation(){return operation}}
}

test('IA-01: cancel in an idle phase deletes the draft directory',async()=>{
 const f=await fixture();try{
  await f.act('choose',{mode:'files'});await f.act('classify',{mode:'local',consent:false});const id=(await f.current())!.id
  assert.equal(await exists(f.dir(id)),true)
  const response=await f.act('cancel');assert.equal(response.view,null);assert.equal(await f.current(),null);assert.equal(await exists(f.dir(id)),false);assert.deepEqual(await f.dirs(),[])
 }finally{await f.dispose()}
})

test('IA-02/IA-26: cancel while AI runs drains the request first, then deletes, without deadlock',async()=>{
 const f=await fixture();try{
  const held=await heldClassify(f),id=(await f.current())!.id;let cancelled=''
  f.options.cancelAi=async(op:string)=>{cancelled=op;held.release.resolve({classifications:[]})}
  const started=Date.now();await f.act('cancel');assert.ok(Date.now()-started<2000,'cancel completes promptly')
  assert.equal(cancelled,held.operation);assert.equal(f.controller.active,0);assert.equal(await exists(f.dir(id)),false)
  await tick(30);assert.equal(await f.current(),null,'a late AI reply never rebuilds the session')
 }finally{await f.dispose()}
})

test('IA-03: the next import after cancel is brand new',async()=>{
 const f=await fixture();try{
  const initial=(await f.act('choose',{mode:'files'})).view!;await f.act('classify',{mode:'local',consent:false});await f.act('select',{selected:['body'],targets:[],infer:false});const old=(await f.current())!.id
  await f.act('cancel');const next=(await f.act('choose',{mode:'files'})).view!
  assert.notEqual(next.id,old);assert.equal(f.picked,2);assert.equal(next.phase,'source');assert.equal(next.revision,1);assert.deepEqual(next.selected,initial.selected);assert.deepEqual(next.targets,initial.targets)
 }finally{await f.dispose()}
})

test('IA-04: a non-append choose with an unsaved draft is rejected without opening the picker',async()=>{
 const f=await fixture();try{
  const first=(await f.act('choose',{mode:'files'})).view!
  await assert.rejects(f.act('choose',{mode:'files'}),/已有未完成的导入/);assert.equal(f.picked,1);assert.equal((await f.current())!.id,first.id);assert.equal(await exists(f.dir(first.id)),true)
 }finally{await f.dispose()}
})

test('IA-05/IA-06: closing the controller deletes idle and running drafts',async()=>{
 const f=await fixture();try{
  await f.act('choose',{mode:'files'});const idle=(await f.current())!.id;await f.controller.close();assert.equal(await exists(f.dir(idle)),false)
  const g=new NovelImportController(f.options);await g.initialize();assert.equal(await f.current(g),null);const fresh=(await f.act('choose',{mode:'files'},g)).view!;assert.notEqual(fresh.id,idle)
  const release=deferred<ImportAiResult>(),started=deferred();let cancelled=0
  f.options.ai=async()=>{started.resolve();return release.promise};f.options.cancelAi=async()=>{cancelled++;release.resolve({classifications:[]})}
  await f.act('classify',{mode:'ai',consent:true},g);await started.promise
  await g.close();assert.equal(cancelled,1);assert.equal(g.active,0);assert.equal(await exists(f.dir(fresh.id)),false)
 }finally{await f.dispose()}
})

test('IA-07: startup removes a leftover unsaved draft before any later close',async()=>{
 const f=await fixture();try{
  await f.act('choose',{mode:'files'});await f.act('classify',{mode:'local',consent:false});const id=(await f.current())!.id;await f.controller.pauseAll()
  const g=new NovelImportController(f.options);await g.initialize()
  assert.equal(await exists(f.dir(id)),false,'removed by initialize, not by the old controller');assert.equal(await f.current(g),null)
 }finally{await f.dispose()}
})

test('IA-08/IA-09: startup removes owner-only remnants but keeps unowned and damaged directories',async()=>{
 const f=await fixture();try{
  const base=join(f.root,'novel-imports'),remnant='11111111-1111-4111-8111-111111111111',foreign='22222222-2222-4222-8222-222222222222',damaged='33333333-3333-4333-8333-333333333333'
  await mkdir(join(base,remnant),{mode:0o700});await writeFile(join(base,remnant,'.owner'),marker+remnant+'\n',{mode:0o600})
  await mkdir(join(base,foreign),{mode:0o700});await writeFile(join(base,foreign,'.owner'),'someone-else\n');await writeFile(join(base,foreign,'session.json'),'{}')
  await mkdir(join(base,damaged),{mode:0o700});await writeFile(join(base,damaged,'.owner'),marker+damaged+'\n');await writeFile(join(base,damaged,'session.json'),'{not json')
  const g=new NovelImportController(f.options);await g.initialize()
  assert.equal(await exists(join(base,remnant)),false);assert.equal(await readFile(join(base,foreign,'.owner'),'utf8'),'someone-else\n');assert.equal(await readFile(join(base,damaged,'session.json'),'utf8'),'{not json')
 }finally{await f.dispose()}
})

test('IA-10: unknown files are validated before any delete; everything is kept and the session is released',async()=>{
 const f=await fixture();try{
  await f.act('choose',{mode:'files'});const id=(await f.current())!.id,dir=f.dir(id)
  await mkdir(join(dir,'images'));await writeFile(join(dir,'images','task-1.png'),'image');await writeFile(join(dir,'unrelated.txt'),'保留')
  await assert.rejects(f.act('cancel'),new RegExp('^Error: 导入草稿目录含未知文件，已保留：'+id+'$'))
  assert.equal(await readFile(join(dir,'unrelated.txt'),'utf8'),'保留');assert.equal(await readFile(join(dir,'images','task-1.png'),'utf8'),'image');assert.equal(await exists(join(dir,'session.json')),true);assert.equal(await exists(join(dir,'.owner')),true)
  assert.equal(await f.current(),null);const next=(await f.act('choose',{mode:'files'})).view!;assert.notEqual(next.id,id)
 }finally{await f.dispose()}
})

test('IA-11: symbolic and hard links make deletion refuse and keep all data',async()=>{
 const f=await fixture();try{
  const outside=join(f.target,'outside.txt');await writeFile(outside,'外部')
  await f.act('choose',{mode:'files'});const a=(await f.current())!.id;await symlink(outside,join(f.dir(a),'runtime.json'))
  await assert.rejects(f.act('cancel'),/已保留/);assert.equal(await readFile(outside,'utf8'),'外部');assert.equal(await exists(join(f.dir(a),'session.json')),true);assert.equal(await f.current(),null)
  await f.act('choose',{mode:'files'});const b=(await f.current())!.id;await link(join(f.dir(b),'session.json'),join(f.target,'hard.json'))
  await assert.rejects(f.act('cancel'),/已保留/);assert.equal(await exists(join(f.dir(b),'session.json')),true);assert.equal(await f.current(),null)
 }finally{await f.dispose()}
})

test('IA-12/IA-13: a draft whose save started is kept, survives restart and retries with the same request',async()=>{
 const f=await fixture();let first=true;const publish=f.options.publish
 f.options.publish=async(input:any)=>{if(first){first=false;throw Error('保存回执丢失')}return publish(input)}
 try{
  await ready(f);await f.act('start',{consent:false});for(let i=0;i<300&&f.controller.active;i++)await tick()
  const failed=(await f.current())!;assert.equal(failed.phase,'failed');assert.ok(failed.publication)
  await assert.rejects(f.act('cancel'),/保存已开始/);assert.equal(await exists(f.dir(failed.id)),true)
  assert.equal((await f.act('choose',{mode:'files'})).view!.id,failed.id);assert.equal(f.picked,1)
  await f.controller.close();assert.equal(await exists(f.dir(failed.id)),true)
  const g=new NovelImportController(f.options);await g.initialize();const restored=(await f.current(g))!;assert.equal(restored.id,failed.id)
  await f.act('choose-target',{},g);await f.act('retry',{},g);for(let i=0;i<300&&g.active;i++)await tick()
  const done=(await f.current(g))!;assert.equal(done.phase,'completed');assert.equal(f.published,1);assert.equal(done.publication!.requestId,failed.id);await g.close()
 }finally{await f.dispose()}
})

test('IA-14: while deleting, current reports nothing and other actions are refused',async()=>{
 const f=await fixture();try{
  const held=await heldClassify(f),v=(await f.current())!,gate=deferred()
  f.options.cancelAi=async()=>{await gate.promise;held.release.resolve({classifications:[]})}
  const cancel=f.controller.act({type:'cancel',id:v.id,revision:v.revision});await tick(20)
  assert.equal((await f.controller.act({type:'current'})).view,null)
  await assert.rejects(f.controller.act({type:'resume',id:v.id,revision:v.revision}),/正在删除这次导入/)
  gate.resolve();await cancel;assert.equal(await exists(f.dir(v.id)),false);assert.equal(f.controller.active,0)
 }finally{await f.dispose()}
})

test('IA-14b: a reload racing close never sees the old draft',async()=>{
 const f=await fixture();try{
  const held=await heldClassify(f),id=(await f.current())!.id;f.options.cancelAi=async()=>{await tick(20);held.release.resolve({classifications:[]})}
  const closing=f.controller.close();await tick(5);assert.equal((await f.controller.act({type:'current'})).view,null);await closing;assert.equal(await exists(f.dir(id)),false)
 }finally{await f.dispose()}
})

test('IA-15: a candidate-blocked draft can be deleted and a new import started',async()=>{
 const f=await fixture();try{
  await f.act('choose',{mode:'files'});const id=(await f.current())!.id,c=f.controller as any;c.candidateBlocked=true
  await f.act('cancel');assert.equal(c.candidateBlocked,false);assert.equal(await exists(f.dir(id)),false)
  const next=(await f.act('choose',{mode:'files'})).view!;assert.notEqual(next.id,id)
 }finally{await f.dispose()}
})

test('IA-16: a wizard draft deletes runtime, temps and staged images',async()=>{
 const f=await fixture(undefined,{wizard:true});try{
  await f.act('choose',{mode:'files'});const id=(await f.current())!.id,dir=f.dir(id)
  await mkdir(join(dir,'images'));await writeFile(join(dir,'images','task-1.png'),'img');await writeFile(join(dir,'images','.task-1.'+crypto.randomUUID()+'.tmp'),'t')
  await writeFile(join(dir,'runtime.json'),'{}');await writeFile(join(dir,'.runtime-'+crypto.randomUUID()+'.tmp'),'t');await writeFile(join(dir,'.session-'+crypto.randomUUID()+'.tmp'),'t')
  await f.act('cancel');assert.equal(await exists(dir),false)
 }finally{await f.dispose()}
})

test('IA-17: pause still keeps the draft and can resume',async()=>{
 const f=await fixture();try{
  const held=await heldClassify(f),id=(await f.current())!.id;f.options.cancelAi=async()=>held.release.resolve({classifications:[]})
  await f.act('pause');const paused=(await f.current())!;assert.equal(paused.phase,'paused');assert.equal(await exists(f.dir(id)),true)
 }finally{await f.dispose()}
})

test('IA-18: discard behaves exactly like cancel',async()=>{
 const f=await fixture();try{await f.act('choose',{mode:'files'});const id=(await f.current())!.id;assert.equal((await f.act('discard')).view,null);assert.equal(await exists(f.dir(id)),false)}finally{await f.dispose()}
})

test('IA-19: cancel during a held PDF preview drains it and reopens PDF admission',async()=>{
 const held=deferred(),calls:string[]=[];let active=0,accepting=true
 const pdfClient:any={get active(){return active},cancelAll(){accepting=false;active=0;calls.push('cancelAll');held.resolve()},cancel(){},reopen(){if(active)throw Error('busy');accepting=true;calls.push('reopen')},drain:async()=>{await held.promise},inspect:async()=>{throw Error('unused')},preview:async()=>{throw Error('unused')},verify:async()=>{}}
 const f=await fixture(undefined,{pdfClient});try{
  await f.act('choose',{mode:'files'});const id=(await f.current())!.id;active=1;await f.act('cancel')
  assert.equal(await exists(f.dir(id)),false);assert.ok(calls.includes('cancelAll'));assert.equal(accepting,true,'PDF admission reopened for the next import')
 }finally{await f.dispose()}
})

test('IA-20: quitting while publishing keeps the draft for recovery',async()=>{
 const gate=deferred(),entered=deferred();const f=await fixture();const publish=f.options.publish
 f.options.publish=async(input:any)=>{entered.resolve();await gate.promise;throw Error('进程退出前回执未知')}
 try{
  await ready(f);await f.act('start',{consent:false});await entered.promise;const id=(await f.current())!.id
  const closing=f.controller.close();await tick(10);gate.resolve();await closing
  assert.equal(await exists(f.dir(id)),true);const saved=JSON.parse(await readFile(join(f.dir(id),'session.json'),'utf8'));assert.ok(saved.publication)
  f.options.publish=publish;const g=new NovelImportController(f.options);await g.initialize();assert.equal((await f.current(g))!.id,id);await g.close()
 }finally{await f.dispose()}
})

test('IA-21: after a completed import a new import gets a new id and leaves the record',async()=>{
 const f=await fixture();try{
  await ready(f);await f.act('start',{consent:false});for(let i=0;i<300&&f.controller.active;i++)await tick();const done=(await f.current())!;assert.equal(done.phase,'completed')
  const next=(await f.act('choose',{mode:'files'})).view!;assert.notEqual(next.id,done.id);assert.equal(JSON.parse(await readFile(join(f.dir(done.id),'session.json'),'utf8')).phase,'completed')
 }finally{await f.dispose()}
})

test('IA-22: appending sources neither rejects nor deletes',async()=>{
 const f=await fixture([source('第一章\n甲。','正文.txt','a')]);try{
  const first=(await f.act('choose',{mode:'files'})).view!;f.options.scan=async()=>[source('设定\n乙。','设定.txt','b')]
  const appended=(await f.act('choose',{mode:'files',append:true})).view!;assert.equal(appended.id,first.id);assert.equal(appended.files.length,2);assert.equal(await exists(f.dir(first.id)),true)
 }finally{await f.dispose()}
})

test('IA-23: startup skips, keeps and does not load a leftover draft with unknown files',async()=>{
 const f=await fixture();try{
  await f.act('choose',{mode:'files'});const id=(await f.current())!.id;await f.controller.pauseAll();await writeFile(join(f.dir(id),'unrelated.txt'),'保留')
  const g=new NovelImportController(f.options);await g.initialize();assert.equal(await f.current(g),null);assert.equal(await readFile(join(f.dir(id),'unrelated.txt'),'utf8'),'保留');assert.equal(await exists(join(f.dir(id),'session.json')),true)
 }finally{await f.dispose()}
})

test('IA-24: an interrupted delete leaves only .owner, which the next startup removes',async()=>{
 const f=await fixture();try{
  await f.act('choose',{mode:'files'});const id=(await f.current())!.id,c=f.controller as any,remove=c.unlinkDraftFile.bind(c)
  c.unlinkDraftFile=async(path:string)=>{if(path.endsWith('.owner'))throw Error('受控删除中断');return remove(path)}
  await assert.rejects(f.act('cancel'),/受控删除中断/);assert.deepEqual(await readdir(f.dir(id)),['.owner']);assert.equal(await f.current(),null)
  const g=new NovelImportController(f.options);await g.initialize();assert.equal(await exists(f.dir(id)),false)
 }finally{await f.dispose()}
})

test('IA-25: cancel aborts in-flight wizard image generation',async()=>{
 const f=await fixture(undefined,{wizard:true});try{
  await f.act('choose',{mode:'files'});const id=(await f.current())!.id,c=f.controller as any,abort=new AbortController();c.imageOperations.add(abort);abort.signal.addEventListener('abort',()=>c.imageOperations.delete(abort))
  await f.act('cancel');assert.equal(abort.signal.aborted,true);assert.equal(await exists(f.dir(id)),false)
 }finally{await f.dispose()}
})

test('IA-S02: main lifecycle still routes window close, release and disconnect through close()',async()=>{
 const main=await readFile('desktop/main/index.ts','utf8'),core=await readFile('desktop/main/novel-import.ts','utf8')
 assert.match(main,/closeData:async\(\)=>\{[\s\S]{0,400}await novelImport\?\.close\(\)/u);assert.match(main,/releaseOwner = \(\) => \{\s*if\(novelImportOwner\?\.window===current\)\{[^}]*novelImport\?\.close\(\)/u);assert.match(main,/if\(!novelImportRepairing\)void novelImport\?\.close\(\)/u);assert.match(main,/await novelImport\?\.pauseAll\(\)/u)
 const choose=core.slice(core.indexOf(' private async choose('),core.indexOf(' private prunePdfAbilities'));assert.doesNotMatch(choose,/abandon/u,'choose never abandons inside serial')
})

test('IA-27: a command queued before cancel cannot start work that survives the delete',async()=>{
 const f=await fixture();try{
  await f.act('choose',{mode:'files'});const v=(await f.current())!,c=f.controller as any,release=deferred<ImportAiResult>();let cancelled=0
  f.options.ai=async()=>release.promise;f.options.cancelAi=async()=>{cancelled++;release.resolve({classifications:[]})}
  // Hold serial so classify is queued, then cancel while it waits.
  const hold=deferred();const blocker=c.serial(()=>hold.promise)
  const queued=f.controller.act({type:'classify',id:v.id,revision:v.revision,mode:'ai',consent:true}).catch((e:Error)=>e)
  const cancel=f.controller.act({type:'cancel',id:v.id,revision:v.revision});await tick(5);hold.resolve();await blocker
  assert.equal((await cancel).view,null);await queued;assert.equal(f.controller.active,0);assert.equal(await exists(f.dir(v.id)),false);assert.ok(cancelled<=1)
 }finally{await f.dispose()}
})

test('IA-28: a candidate-blocked cancel still cancels in-flight AI',async()=>{
 const f=await fixture();try{
  const held=await heldClassify(f),id=(await f.current())!.id,c=f.controller as any;let cancelled=''
  f.options.cancelAi=async(op:string)=>{cancelled=op;held.release.resolve({classifications:[]})}
  c.candidateBlocked=true;const started=Date.now();await f.act('cancel')
  assert.equal(cancelled,held.operation);assert.ok(Date.now()-started<2000);assert.equal(await exists(f.dir(id)),false)
 }finally{await f.dispose()}
})

test('IA-29: close during a user cancel waits for the delete to finish',async()=>{
 const f=await fixture();try{
  const held=await heldClassify(f),v=(await f.current())!,gate=deferred()
  f.options.cancelAi=async()=>{await gate.promise;held.release.resolve({classifications:[]})}
  const cancel=f.controller.act({type:'cancel',id:v.id,revision:v.revision});await tick(5)
  const closing=f.controller.close();await tick(5);gate.resolve();await closing
  assert.equal(await exists(f.dir(v.id)),false,'close returned only after the draft was removed');await cancel
 }finally{await f.dispose()}
})

test('IA-30: startup deletes an unsaved draft in an old journal format',async()=>{
 const f=await fixture();try{
  await f.act('choose',{mode:'files'});const id=(await f.current())!.id;await f.controller.pauseAll()
  const path=join(f.dir(id),'session.json'),raw=JSON.parse(await readFile(path,'utf8'));raw.chapterVersion=1;await writeFile(path,JSON.stringify(raw))
  const g=new NovelImportController(f.options);await g.initialize();assert.equal(await exists(f.dir(id)),false);assert.equal(await f.current(g),null)
 }finally{await f.dispose()}
})
