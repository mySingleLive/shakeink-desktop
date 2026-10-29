import assert from 'node:assert/strict'
import {mkdtemp,mkdir,writeFile,readFile,realpath,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {createHash} from 'node:crypto'
import {test} from 'node:test'
import {readFileSync} from 'node:fs'
import {randomUUID} from 'node:crypto'
import ts from 'typescript'
import {transformSync} from 'esbuild'
import {z} from 'zod'
import {importActionSchema} from '../../desktop/shared/novel-import'
import {ImportAiJobs} from '../../desktop/service/novel-import-ai'
import {BusinessGate} from '../../desktop/main/business-gate'
import {NovelImportSourcePicker} from '../../desktop/main/novel-import-source-picker'
import {NovelImportController} from '../../desktop/main/novel-import'
import {ownedRootDirectory,ownedRootFile} from '../../desktop/core/root-inventory-paths'

test('NI-L04: import-journal inventory ownership accepts only UUID session directories and exact committed filenames',()=>{
 const id=randomUUID(),prefix='novel-imports/'+id
 assert.equal(ownedRootDirectory('novel-imports'),true);assert.equal(ownedRootDirectory(prefix),true);assert.equal(ownedRootFile(prefix+'/.owner'),true);assert.equal(ownedRootFile(prefix+'/session.json'),true)
 for(const path of ['novel-imports-other',prefix+'/nested','novel-imports/not-a-uuid','novel-imports/00000000-0000-0000-0000-000000000001',prefix+'/../other','novel-imports//'+id])assert.equal(ownedRootDirectory(path),false,path)
 for(const path of ['novel-imports/session.json',prefix+'/.session-'+id+'.tmp',prefix+'/session.json.old',prefix+'/session.json\n',prefix+'/source.txt',prefix+'/nested/session.json','novel-imports/not-a-uuid/session.json',prefix+'/../session.json'])assert.equal(ownedRootFile(path),false,path)
})

test('NI-L04: real closed-root migration preserves the import journal and leaves unknown neighbours at the original root',async()=>{
 const [{DataRootManager},{collectClosedRootFiles},{directoryIdentity},{CURRENT_NAMES},{NovelImportController}]=await Promise.all([import('../../desktop/core/data-root'),import('../../desktop/main/owned-root-files'),import('../../desktop/core/root-ownership'),import('../../desktop/shared/brand-names'),import('../../desktop/main/novel-import')])
 const base=await realpath(await mkdtemp(join(tmpdir(),'shakeink-import-root-migration-'))),source=join(base,'old'),target=join(base,'new'),bootstrap=join(base,'boot'),materials=join(base,'materials');let original:InstanceType<typeof NovelImportController>|undefined,restored:InstanceType<typeof NovelImportController>|undefined
 try{
  for(const path of [source,target,bootstrap,materials])await mkdir(path)
  await mkdir(join(source,'inbox','database'),{recursive:true});await writeFile(join(source,'inbox','database','PG_VERSION'),'17')
  await writeFile(join(source,CURRENT_NAMES.appMarker),JSON.stringify({schemaVersion:1,app:CURRENT_NAMES.appIdentity,id:randomUUID(),phase:'ready',inboxReady:true}));await writeFile(join(source,'catalog.json'),JSON.stringify({schemaVersion:1,revision:0,value:[]}))
  const material=join(materials,'正文.txt');await writeFile(material,'第一章 渡口\r\n\r\n合成迁移正文🖋️。')
  const options={root:source,choose:async()=>[material],chooseTarget:async()=>null,protectedDirectories:async()=>[],models:async()=>({}),ai:async()=>{throw Error('migration must not call AI')},cancelAi:async()=>{},publish:async()=>{throw Error('migration must not publish')}}
  original=new NovelImportController(options);await original.initialize();const selected=(await original.act({type:'choose',mode:'files'})).view!;const prefix='novel-imports/'+selected.id,seed=JSON.parse(await readFile(join(source,prefix,'session.json'),'utf8')),owner=await readFile(join(source,prefix,'.owner'),'utf8');await original.close()
  // Closing deletes an unsaved draft; only a journal whose save began survives a restart, so the migrated journal carries a publication.
  await assert.rejects(readFile(join(source,prefix,'.owner')),{code:'ENOENT'});seed.phase='paused';seed.resumePhase='source';seed.publication={requestId:randomUUID(),hash:'synthetic-publication'};await mkdir(join(source,prefix));await writeFile(join(source,prefix,'.owner'),owner);await writeFile(join(source,prefix,'session.json'),JSON.stringify(seed))
  const before=await readFile(join(source,prefix,'session.json'),'utf8'),marker=await readFile(join(source,prefix,'.owner'),'utf8'),unknown=[prefix+'/.session-'+randomUUID()+'.tmp',prefix+'/session.json.old',prefix+'/nested/user.txt','novel-imports/not-a-uuid/session.json','novel-imports/neighbour.txt']
  for(const path of unknown){await mkdir(join(source,path,'..'),{recursive:true});await writeFile(join(source,path),'unknown preserved '+path)}
  const manager=new DataRootManager(bootstrap,source),pointer=await manager.adopt(await directoryIdentity(source)),inventory=await collectClosedRootFiles(pointer.root,()=>{})
  assert.ok(inventory.files.includes(prefix+'/.owner'));assert.ok(inventory.files.includes(prefix+'/session.json'));assert.ok(inventory.directories.includes(prefix));assert.ok(unknown.every(path=>!inventory.files.includes(path)));assert.ok(inventory.preserved.includes(prefix+'/nested'));assert.ok(inventory.preserved.includes('novel-imports/not-a-uuid'))
  let released='';const migrated=await manager.migrate(await directoryIdentity(target),{quiesce:async()=>({source:pointer.root,ownedFiles:inventory.files,ownedDirectories:inventory.directories,preserved:inventory.preserved,assertClosed(){},release(outcome){released=outcome}})})
  // The established migrator commits the new root and lists intentionally
  // preserved unknown entries in cleanup-pending; it never claims they moved.
  assert.equal(migrated.status,'cleanup-pending');assert.equal(migrated.root.root.path,target);assert.equal(released,'new-root');assert.deepEqual([...migrated.pending].sort(),inventory.preserved);assert.equal(await readFile(join(target,prefix,'session.json'),'utf8'),before);assert.equal(await readFile(join(target,prefix,'.owner'),'utf8'),marker);await assert.rejects(readFile(join(source,prefix,'session.json')),{code:'ENOENT'});await assert.rejects(readFile(join(source,prefix,'.owner')),{code:'ENOENT'})
  for(const path of unknown){assert.equal(await readFile(join(source,path),'utf8'),'unknown preserved '+path);await assert.rejects(readFile(join(target,path)),{code:'ENOENT'})}
  restored=new NovelImportController({...options,root:target});await restored.initialize();const current=(await restored.act({type:'current'})).view!;assert.equal(current.id,selected.id);assert.equal(current.phase,'paused');assert.equal(current.publication?.requestId,seed.publication.requestId);assert.equal(current.files[0].characters,selected.files[0].characters)
 }finally{await restored?.close();await original?.close();await rm(base,{recursive:true,force:true})}
})

test('NI-B01: the runtime dependency resolver retains ZIP dependencies whose npm names also match Node builtins',async()=>{
 const {verifyRuntimeDependencies,runtimeEntries}=await import('../../scripts/runtime-dependencies.mjs'),root=await mkdtemp(join(tmpdir(),'shakeink-import-runtime-'))
 try{for(const [name,dependencies] of [['readable-stream',{string_decoder:'1.1.1'}],['string_decoder',{}]] as const){const directory=join(root,'node_modules',name);await mkdir(directory,{recursive:true});await writeFile(join(directory,'package.json'),JSON.stringify({name,version:'1.0.0',main:'index.js',dependencies}));await writeFile(join(directory,'index.js'),'module.exports={}')}
 const entries=[];for(const [i,path] of runtimeEntries.entries()){await mkdir(join(root,path,'..'),{recursive:true});await writeFile(join(root,path),'');entries.push({path,sha256:createHash('sha256').update('').digest('hex'),externals:i===0?[{specifier:'readable-stream',kind:'require-call'}]:[]})}await writeFile(join(root,'dist/runtime-dependencies.json'),JSON.stringify({schemaVersion:1,entries,embeddedLicenses:[]}));const result=await verifyRuntimeDependencies(root);assert.ok(result.kept.includes('node_modules/string_decoder'))
 }finally{await rm(root,{recursive:true,force:true})}
})

const main=ts.createSourceFile('main.ts',readFileSync('desktop/main/index.ts','utf8'),ts.ScriptTarget.Latest,true)
const worker=ts.createSourceFile('worker.ts',readFileSync('desktop/service/index.ts','utf8'),ts.ScriptTarget.Latest,true)
function nodes(file:ts.SourceFile,predicate:(n:ts.Node)=>boolean){const found:ts.Node[]=[];const walk=(n:ts.Node)=>{if(predicate(n))found.push(n);ts.forEachChild(n,walk)};walk(file);return found}
function evaluate(source:string,deps:Record<string,unknown>){assert.ok(source,'actual application integration required');return new Function(...Object.keys(deps),transformSync('return '+source,{loader:'ts'}).code)(...Object.values(deps))}
function named(name:string){return nodes(main,n=>ts.isFunctionDeclaration(n)&&n.name?.text===name)[0]?.getText(main)??''}
function handler(channel:string){const n=nodes(main,n=>ts.isCallExpression(n)&&['businessHandle','ipcMain.handle'].includes(n.expression.getText(main))&&ts.isStringLiteral(n.arguments[0])&&n.arguments[0].text===channel)[0] as ts.CallExpression|undefined;return n?.arguments[1].getText(main)??''}
function closeOption(name:string){const n=nodes(main,n=>ts.isNewExpression(n)&&n.expression.getText(main)==='CloseCoordinator')[0] as ts.NewExpression;const options=n.arguments![0] as ts.ObjectLiteralExpression;return(options.properties.find(p=>p.name?.getText(main)===name) as ts.PropertyAssignment).initializer.getText(main)}
const turn=()=>new Promise<void>(setImmediate)

test('NI-L01: unified source selection uses macOS native panel or Windows picker service without mode choice',async()=>{
 const dialogs:any[]=[],window={isDestroyed:()=>false,webContents:{id:3}},draftSession={owner:3,id:randomUUID(),ready:true};let canceled=false
 const nativePaths=['/native/body.txt','/native/settings.md'],grants=[{path:'/owned/body.txt',proof:{device:'1',inode:'2'}}],customCalls:unknown[]=[]
 const deps={window,draftSession,closingFlow:null,businessGate:{closed:false},novelImportOwner:null,assertNovelImportOwner:()=>{},novelImportSourcePicker:{choose:async(assertOwner:()=>void)=>{assertOwner();customCalls.push('choose');return canceled?null:grants}},dialog:{showOpenDialog:async(_window:unknown,options:unknown)=>{dialogs.push(options);return{canceled,filePaths:nativePaths}}}}
 const choose=evaluate(named('chooseNovelSources'),{...deps,process:{platform:'darwin'}})
 for(const mode of [undefined,'files','folder']){assert.deepEqual(await choose(mode),nativePaths);assert.deepEqual(dialogs.at(-1).properties,['openFile','openDirectory','multiSelections']);assert.ok(dialogs.at(-1).filters[0].extensions.includes('doc'));assert.ok(dialogs.at(-1).filters[0].extensions.includes('htm'))}
 canceled=true;assert.equal(await choose(),null);canceled=false
 const unified=evaluate(named('chooseNovelSources'),{...deps,process:{platform:'win32'}}),before=dialogs.length
 for(const mode of [undefined,'files','folder'])assert.deepEqual(await unified(mode),grants)
 assert.equal(dialogs.length,before);assert.equal(customCalls.length,3);canceled=true;assert.equal(await unified(),null)
 let assertions=0;const cancelDuringClose=evaluate(named('chooseNovelSources'),{...deps,assertNovelImportOwner:()=>{if(++assertions>1)throw Error('owner already closed')},novelImportSourcePicker:{choose:async()=>null},process:{platform:'win32'}})
 assert.equal(await cancelDuringClose(),null);assert.equal(assertions,1)
 const source=readFileSync('desktop/preload/index.ts','utf8'),body=source.slice(source.indexOf('const bridge:'),source.indexOf('\nipcRenderer.on("desktop:response-port"')),calls:unknown[][]=[]
 const bridge=new Function('ipcRenderer',transformSync(body+';return bridge',{loader:'ts'}).code)({invoke:(...args:unknown[])=>{calls.push(args)}})
 bridge.novelImport({type:'choose'});bridge.novelImportSources({type:'cancel',id:'picker-id'});assert.deepEqual(calls,[['desktop:novel-import',{type:'choose'}],['desktop:novel-import-sources',{type:'cancel',id:'picker-id'}]])
})

test('CP-L01: main lifecycle cancels source choice before pause, gate drain and owner revocation',async()=>{
 const events:string[]=[]
 const sourcePicker={cancel(){events.push('cancel-picker')}}
 const stop=evaluate(closeOption('stopTasks'),{window:null,novelImportSourcePicker:sourcePicker,novelImport:{pauseAll:async()=>{assert.equal(events[0],'cancel-picker');events.push('pause')}},modelService:{close:async()=>{}},service:{call:async()=>{}},setTimeout,clearTimeout,Promise,Error})
 await stop();assert.deepEqual(events,['cancel-picker','pause'])
 for(const fragment of [named('beginClose'),closeOption('closeData')])assert.ok(fragment.indexOf('novelImportSourcePicker.cancel()')>=0)
 const source=readFileSync('desktop/main/index.ts','utf8')
 assert.match(source,/novelImportSourcePicker.cancel\(\);novelImportOwner=null/)
 const disconnected=source.slice(source.indexOf('const disconnected'),source.indexOf('const disconnected')+2200);assert.ok(disconnected.includes('novelImportSourcePicker.cancel()'))
 const newIpc=handler('desktop:novel-import-sources');assert.ok(newIpc.includes('trusted(event)'));assert.ok(newIpc.includes('sourcePickerActionSchema.parse(input)'));assert.ok(newIpc.includes('assertNovelImportOwner()'))
})

test('CP-L01: actual pending picker choice releases controller and BusinessGate before owner teardown',async()=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'shakeink-picker-drain-'))),entered=Promise.withResolvers<void>(),release=Promise.withResolvers<void>()
 let owner=true
 const picker=new NovelImportSourcePicker({places:async()=>{entered.resolve();await release.promise;return[]},protectedRoots:async()=>[],changed(){}})
 const controller=new NovelImportController({root,choose:()=>picker.choose(()=>{if(!owner)throw Error('owner revoked')}),assertCurrent:()=>{if(!owner)throw Error('owner revoked')},chooseTarget:async()=>null,protectedDirectories:async()=>[],models:async()=>({}),ai:async()=>{throw Error('unexpected AI')},cancelAi:async()=>{},publish:async()=>{throw Error('unexpected publish')}}),gate=new BusinessGate()
 let timer:ReturnType<typeof setTimeout>|undefined
 try{
  await controller.initialize();const pending=gate.run(()=>controller.act({type:'choose'}));await entered.promise
  assert.equal(picker.active,true);assert.ok(picker.activeIo>0)
  const stop=evaluate(closeOption('stopTasks'),{window:null,novelImportSourcePicker:{cancel(){picker.cancel();owner=false}},novelImport:controller,modelService:{close:async()=>{}},service:{call:async()=>{}},setTimeout,clearTimeout,Promise,Error})
  const stopping=stop(),drain=gate.close(),deadline=new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(Error('pending source picker blocked shutdown')),700)})
  const [result]=await Promise.race([Promise.all([pending,stopping,drain]),deadline])
  assert.equal(result.view,null);assert.equal(controller.active,0);assert.equal(picker.active,false);assert.ok(picker.activeIo>0,'underlying IO remains accounted after cancellation')
 }finally{if(timer)clearTimeout(timer);release.resolve();picker.cancel();await controller.close();await rm(root,{recursive:true,force:true})}
})

test('NI-L02: actual import IPC enforces trusted frame, ready owner, strict action and business admission before any file/model work',async()=>{
 const sender={id:3,mainFrame:{url:'shakeink://app/'}},window={webContents:sender,isDestroyed:()=>false},session={owner:3,id:randomUUID(),ready:true},calls:unknown[]=[]
 const trusted=evaluate(named('trusted'),{window}),gate=new BusinessGate()
 const deps:any={trusted,importActionSchema,window,draftSession:session,closingFlow:null,quitting:false,businessGate:gate,migrationHandoff:null,workLease:null,novelImportRepairing:false,novelImport:{act:async(action:unknown)=>{calls.push(action);return{view:null}}},novelImportOwner:null,assertNovelImportOwner:()=>{}}
 const run=evaluate(handler('desktop:novel-import'),deps),event={sender,senderFrame:sender.mainFrame}
 await run(event,{type:'current'});assert.equal(calls.length,1)
 await assert.rejects(run({...event,senderFrame:{url:'shakeink://app/'}},{type:'current'}));await assert.rejects(run(event,{type:'choose',mode:'files',path:'/renderer/forged'}));assert.equal(calls.length,1)
 for(const patch of [{draftSession:null},{draftSession:{...session,ready:false}},{draftSession:{...session,owner:8}},{closingFlow:Promise.resolve()},{businessGate:{closed:true}},{migrationHandoff:{pending:true}}])await assert.rejects(evaluate(handler('desktop:novel-import'),{...deps,...patch})(event,{type:'current'}))
 await gate.close();await assert.rejects(gate.run(()=>run(event,{type:'current'})),/BUSINESS_CLOSED/);assert.equal(calls.length,1)
})

function workerRig(){
 const callback=(nodes(worker,n=>ts.isNewExpression(n)&&n.expression.getText(worker)==='RpcPeer')[0] as ts.NewExpression).arguments![1].getText(worker)
 const importJobs=new ImportAiJobs(),publications=new Map(),calls:string[]=[],publish=Promise.withResolvers<any>();let releaseAi=()=>{}
 const deps={ready:Promise.resolve(),responses:new Map(),starting:new Map(),pendingStarts:new Set(),localAttemptCount:()=>0,abortAllLocalAttempts(){},cancel:async()=>{},delay:async()=>{},z,importJobs,importPublications:publications,runImportAi:async(_request:unknown,signal:AbortSignal)=>new Promise((_resolve,reject)=>{signal.addEventListener('abort',()=>{calls.push('abort');releaseAi=()=>reject(Error('aborted'))},{once:true})}),publishNovelImport:async()=>{calls.push('publish');return publish.promise},works:{runWithGlobal:async(_id:unknown,run:()=>Promise<unknown>)=>run(),close:async()=>{calls.push('close')}},importLeaseTarget:async()=>({}),randomUUID}
 const run=evaluate('(()=>{let closing=false,closedForMaintenance=false,stoppingImports=false;return '+callback+'})()',deps) as (method:string,input?:unknown)=>Promise<any>
 return{run,calls,importJobs,publish,releaseAi:()=>releaseAi()}
}

test('NI-L03: actual worker counts import AI jobs, cancels only matching operation, and awaits done before closing DB',async()=>{
 for(const phase of ['classify','analyze']){
 const r=workerRig(),request={operationId:randomUUID(),phase}
 const ai=r.run('novel-import-ai',request);await turn();assert.equal((await r.run('task-status')).active,1)
 await r.run('novel-import-cancel',randomUUID());assert.equal(r.calls.length,0);await r.run('novel-import-cancel',request.operationId);assert.deepEqual(r.calls,['abort'] as string[])
 const closing=r.run('close');await turn();assert.ok(!r.calls.includes('close'));r.releaseAi();await assert.rejects(ai);await closing;assert.equal((await r.run('task-status')).active,0);assert.equal(r.calls.at(-1),'close')
 }
})

test('NI-L04: publication stays active until definite receipt; main stops/checkpoints before gate drain and DB close',async()=>{
 const r=workerRig(),input={session:{id:randomUUID()}};const publishing=r.run('novel-import-publish',input);await turn();assert.equal((await r.run('task-status')).active,1)
 const stopping=r.run('stop-tasks');await turn();assert.ok(!r.calls.includes('close'));await assert.rejects(r.run('novel-import-ai',{operationId:randomUUID()}),/停止/);r.publish.resolve({requestId:input.session.id});await publishing;await stopping;await r.run('close');assert.equal(r.calls.at(-1),'close')
 const direct=workerRig(),directPublish=direct.run('novel-import-publish',{session:{id:randomUUID()}});await turn();const directClose=direct.run('close');await turn();assert.ok(!direct.calls.includes('close'));direct.publish.resolve({});await directPublish;await directClose;assert.equal(direct.calls.at(-1),'close')
 const events:string[]=[],checkpoint=Promise.withResolvers<void>(),deps:any={window:null,novelImportSourcePicker:{cancel(){}},novelImport:{close:async()=>{events.push('checkpoint-start');await checkpoint.promise;events.push('checkpoint-saved')}},businessGate:{close:async()=>{events.push('gate-drained')}},conversationDirectories:{revokeAll(){},flush:async()=>{}},responseOwners:new Map(),recoveryExports:{flush:async()=>{}},fileExports:{flush:async()=>{}},configurationFiles:{flush:async()=>{}},repository:{read:async()=>{}},service:{call:async()=>{events.push('DB-close')}},businessClosed:false,draftJournal:{read:async()=>{}},applicationMetadata:{acquire:async()=>({}),release(){}},migrationHandoff:null}
 const closing=evaluate(closeOption('closeData'),deps)();await turn();assert.deepEqual(events,['checkpoint-start']);checkpoint.resolve();await closing;assert.deepEqual(events,['checkpoint-start','checkpoint-saved','gate-drained','DB-close'])
 assert.equal(await evaluate(closeOption('busy'),{service:{call:async()=>({active:0})},modelService:{activeCount:0},modelConfiguration:{activeCount:0},novelImport:{active:1}})(),true)
 const stopped=Promise.withResolvers<void>(),stopEvents:string[]=[]
 const stop=evaluate(closeOption('stopTasks'),{window:null,novelImportSourcePicker:{cancel(){}},novelImport:{pauseAll:async()=>{stopEvents.push('pause');await stopped.promise;stopEvents.push('saved')}},modelService:{close:async()=>{stopEvents.push('model-close')}},service:{call:async()=>{stopEvents.push('worker-stop')}}})();await turn();assert.deepEqual(stopEvents,['pause']);stopped.resolve();await stop;assert.deepEqual(stopEvents,['pause','saved','model-close','worker-stop'])
 const disconnected=(nodes(main,n=>ts.isVariableDeclaration(n)&&n.name.getText(main)==='disconnected')[0] as ts.VariableDeclaration).initializer!.getText(main),disconnectedEvents:string[]=[],workerIdentity={}
 evaluate(disconnected,{novelImportSourcePicker:{cancel(){}},worker:workerIdentity,currentWorker:workerIdentity,novelImportRepairing:false,applicationMetadata:{revoke(){}},conversationDirectories:{revokeAll(){}},service:{dispose:()=>disconnectedEvents.push('rpc-disposed')},novelImport:{close:async()=>{disconnectedEvents.push('import-checkpoint')}},modelService:{close:async()=>{}},send(){},responseOwners:new Map()})();await turn();assert.deepEqual(disconnectedEvents,['rpc-disposed','import-checkpoint'])
 // Controlled native choice and recovery adapter exercise the actual main orchestration;
 // real stale/alive/foreign lease IO belongs to NI-W05, not this host wiring test.
 const maintenance:string[]=[],proof={path:'/isolated/original-target',device:'2',inode:'3'},ownerWindow={isDestroyed:()=>false},ownerSession={},preview={requestId:randomUUID(),work:proof,owner:{pid:321,host:'synthetic-host'}},maintenanceDeps:any={novelImport:{cancelPdfWork(){maintenance.push('pdf-cancel')}},novelImportSourcePicker:{cancel(){}},assertNovelImportOwner(){},novelImportRepairing:false,novelImportServiceLost:false,ordinaryWorkerExited:false,closingFlow:null,migrationHandoff:null,workLease:null,novelImportOwner:{window:ownerWindow,session:ownerSession},window:ownerWindow,draftSession:ownerSession,dataRoot:'/isolated/root',quitting:false,app:{hasSingleInstanceLock:()=>true},chooseNovelTarget:async()=>{maintenance.push('native-choice');return proof},service:{call:async(method:string)=>{maintenance.push(method);return method==='task-status'?{active:0}:method==='novel-import-lease-target'?proof:true},dispose:()=>maintenance.push('dispose')},modelService:{activeCount:0,close:async()=>{maintenance.push('models-close')},resume:()=>maintenance.push('models-resume')},modelConfiguration:{activeCount:0},responseOwners:new Map(),businessGate:{close:async()=>{maintenance.push('gate-close')},reopen:()=>maintenance.push('gate-open')},importPlanHash:()=> 'hash',workNames(){},dialog:{showMessageBox:async(_window:unknown,options:any)=>{assert.ok(options.detail.includes(proof.path));maintenance.push('confirm');return{response:1}}},WorkLeaseRecovery:class{constructor(private options:any){}async prepare(target:unknown){assert.deepEqual(target,proof);this.options.assertWorkClosed();maintenance.push('prepare');return preview}async recover(id:string){this.options.assertConfirmed(id,preview.work,preview.owner);maintenance.push('recover');return{status:'recovered'}}async flush(){maintenance.push('flush')}},worker:{threadId:1,terminate:async()=>{maintenance.push('terminate')}},createOrdinaryServiceWorker:()=>{maintenance.push('new-worker');return{}},waitRootStartup:()=>({status:'ready',root:'/isolated/root'}),novelImportCloseIntent:null,businessClosed:false,send(){},beginClose(){}}
 await evaluate(named('repairNovelImportTarget'),maintenanceDeps)({title:'合成作品',target:proof,publication:{hash:'hash'}})
 const lookup=maintenance.indexOf('novel-import-lease-target'),recover=maintenance.indexOf('recover');assert.ok(maintenance.indexOf('close')<lookup);assert.equal(maintenance[lookup+1],'close');assert.ok(lookup<maintenance.indexOf('prepare')&&maintenance.indexOf('confirm')<recover);assert.ok(recover<maintenance.indexOf('terminate')&&maintenance.indexOf('new-worker')<maintenance.indexOf('gate-open'))
 const lost:string[]=[],lostWorker={threadId:2}
 await assert.rejects(evaluate(named('repairNovelImportTarget'),{...maintenanceDeps,worker:lostWorker,service:{call:async(method:string)=>{if(method==='novel-import-lease-target'){lostWorker.threadId=-1;throw Error('worker disconnected')}return method==='task-status'?{active:0}:true}},businessGate:{close:async()=>{lost.push('gate-close')},reopen:()=>lost.push('gate-open')},send:(event:{type:string})=>lost.push(event.type)})({title:'合成作品',target:proof,publication:{hash:'hash'}}),/disconnected/)
 assert.ok(lost.includes('service-disconnected'));assert.ok(!lost.includes('gate-open'))
 await assert.rejects(evaluate(named('restoreBusiness'),{workLease:null,novelImportServiceLost:true,ordinaryWorkerExited:false,worker:{threadId:2},businessGate:{closed:true,close:async()=>{},reopen:()=>lost.push('gate-open')},modelService:{resume(){}},send(){}})(),/重新启动/);assert.ok(!lost.includes('gate-open'))
})
