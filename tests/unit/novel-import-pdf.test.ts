import assert from 'node:assert/strict'
import {test} from 'node:test'
import {randomUUID} from 'node:crypto'
import {importActionSchema} from '../../desktop/shared/novel-import'
import {PdfJobRegistry} from '../../desktop/main/novel-import-pdf-client'
import {PdfDiagnostics} from '../../desktop/main/novel-import-pdf-diagnostics'
import {NovelImportPdfClient,PDF_LIMITS,PdfJobError} from '../../desktop/main/novel-import-pdf-client'
import {PDFDocument,StandardFonts,PDFName} from 'pdf-lib'
import {createCanvas} from '@napi-rs/canvas'
import {validatePdfPageReviews,pdfInspectionLedgerHash,pdfSourceKey} from '../../desktop/core/novel-import-pdf'
import {importScopeHash,importPlanHash} from '../../desktop/core/novel-import'
import type {ImportFile,ImportSession,ImportAiRequest,ImportAiResult} from '../../desktop/shared/novel-import'
import {mkdtemp,mkdir,writeFile,readFile,realpath,rm,rename,symlink,readdir} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {existsSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {NovelImportController} from '../../desktop/main/novel-import'
import {Worker} from 'node:worker_threads'
import {captureNovelSourceGrant} from '../../desktop/main/novel-import-files'
import {scanNovelSources} from '../../desktop/main/novel-import-files'
import fsPromises from 'node:fs/promises'
import {syncBuiltinESMExports} from 'node:module'
import {createHash} from 'node:crypto'
import {EventEmitter} from 'node:events'
import {PassThrough} from 'node:stream'
import {PDF_RESOURCE_PROFILE_HASH} from '../../desktop/main/novel-import-pdf-resources'
import ts from 'typescript'
import {transformSync} from 'esbuild'
import {BusinessGate} from '../../desktop/main/business-gate'
import {CloseCoordinator} from '../../desktop/main/close-coordinator'

const sourceWorker=resolve('desktop/main/novel-import-pdf-worker.ts')
const sourceClient=(options:ConstructorParameters<typeof NovelImportPdfClient>[0]={})=>new NovelImportPdfClient({workerPath:sourceWorker,...options})
async function actualMainCloseOption(name:string,deps:Record<string,unknown>){const code=await readFile('desktop/main/index.ts','utf8'),file=ts.createSourceFile('index.ts',code,ts.ScriptTarget.Latest,true);let body='';const walk=(node:ts.Node)=>{if(ts.isNewExpression(node)&&node.expression.getText(file)==='CloseCoordinator'){const options=node.arguments![0] as ts.ObjectLiteralExpression;body=(options.properties.find(property=>property.name?.getText(file)===name) as ts.PropertyAssignment).initializer.getText(file)}ts.forEachChild(node,walk)};walk(file);assert.ok(body);return new Function(...Object.keys(deps),transformSync('return '+body,{loader:'ts'}).code)(...Object.values(deps)) as ()=>Promise<void>}
async function actualMainNamed(name:string,deps:Record<string,unknown>){const code=await readFile('desktop/main/index.ts','utf8'),file=ts.createSourceFile('index.ts',code,ts.ScriptTarget.Latest,true);let body='';const walk=(node:ts.Node)=>{if(ts.isFunctionDeclaration(node)&&node.name?.text===name)body=node.getText(file);ts.forEachChild(node,walk)};walk(file);assert.ok(body);return new Function(...Object.keys(deps),transformSync('return '+body,{loader:'ts'}).code)(...Object.values(deps))}

test('NI-PDF08: initial choose real worker exit precedes migration data close and owner revocation drain',async t=>{
 for(const mode of ['main-begin-close','stop-tasks','migration-close','owner-revoked'] as const)await t.test(mode,async()=>{
  const release=Promise.withResolvers<void>(),received=new Int32Array(new SharedArrayBuffer(4)),events:string[]=[];let owner=true
  class PendingWorker extends Worker {constructor(_path:ConstructorParameters<typeof Worker>[0],options:ConstructorParameters<typeof Worker>[1]){super("const{parentPort,workerData}=require('node:worker_threads');parentPort.on('message',()=>Atomics.store(new Int32Array(workerData),0,1));",{...options,eval:true,execArgv:[],workerData:received.buffer});this.on('exit',()=>events.push('worker-exit'))}override terminate(){return release.promise.then(()=>super.terminate())}}
  const client=sourceClient({workerFactory:PendingWorker})
  await isolatedPdf(client,async({controller,data})=>{
   const gate=new BusinessGate(),choosing=outcome(gate.run(()=>controller.act({type:'choose'})));await until(()=>Atomics.load(received,0)===1);assert.equal((await readdir(join(data,'novel-imports'))).length,0)
   const adapter={cancelPdfWork(){events.push('cancel');controller.cancelPdfWork()},drainPdfWork:()=>controller.drainPdfWork(),pauseAll:async()=>{await controller.pauseAll();events.push('controller-paused')},close:async()=>{events.push('controller-close');await controller.close();events.push('controller-closed')}}
   let closing:Promise<void>
   if(mode==='migration-close'){
    const flush={flush:async()=>{}},closeData=await actualMainCloseOption('closeData',{novelImport:adapter,novelImportSourcePicker:{cancel(){events.push('picker-cancel')}},window:null,businessGate:gate,conversationDirectories:{revokeAll(){},flush:async()=>{}},responseOwners:new Map(),recoveryExports:flush,fileExports:flush,configurationFiles:flush,repository:{read:async()=>{}},service:{call:async()=>{events.push('data-close')}},businessClosed:false,draftJournal:{read:async()=>{}},applicationMetadata:{acquire:async()=>({}),release(){}},migrationHandoff:{armClosed:async()=>events.push('migration-armed')}})
    closing=closeData()
   }else if(mode==='main-begin-close'){
    let requested:Promise<boolean>|undefined;const begin=await actualMainNamed('beginClose',{novelImport:adapter,novelImportSourcePicker:{cancel(){events.push('picker-cancel')}},novelImportRepairing:false,novelImportCloseIntent:null,closeCoordinator:{request(){events.push('close-request');requested=adapter.close().then(async()=>{await gate.close();return true});return requested}},workLease:null,closingFlow:null,migrationHandoff:null,businessGate:gate,closeCommitted:false,retryMigrationCancellation:async()=>{},send(){}});begin('quit');closing=requested!.then(()=>{})
   }else if(mode==='stop-tasks'){
    const stopTasks=await actualMainCloseOption('stopTasks',{novelImport:adapter,novelImportSourcePicker:{cancel(){events.push('picker-cancel')}},window:null,modelService:{close:async()=>events.push('models-close')},service:{call:async()=>events.push('tasks-stop')}});closing=stopTasks()
   }else{adapter.cancelPdfWork();owner=false;closing=adapter.close()}
   await new Promise(resolve=>setTimeout(resolve,12));assert.equal(client.active,1);assert.equal(events.includes('worker-exit'),false);assert.equal(events.includes('data-close'),false);assert.equal(gate.closed,false);assert.ok(client.registry.metrics.sourceBytes>0)
   release.resolve();await closing;assert.ok('error'in await choosing);assert.ok(events.indexOf('worker-exit')>events.indexOf('cancel'));assert.ok(events.indexOf(mode==='stop-tasks'?'controller-paused':'controller-closed')>events.indexOf('worker-exit'));if(mode==='migration-close'){assert.ok(events.indexOf('data-close')>events.indexOf('controller-closed'));assert.ok(events.indexOf('migration-armed')>events.indexOf('data-close'));assert.equal(gate.closed,true)}assert.equal((await readdir(join(data,'novel-imports'))).length,0);assert.equal(client.active,0);assert.equal(client.registry.metrics.sourceBytes,0)
  },false,undefined,()=>release.resolve(),{assertPdfOwner:()=>{if(!owner)throw Error('owner revoked')}})
 })
})

test('NI-PDF08: close deadline preserves the data root while a real source read remains outstanding',async()=>{
 const release=Promise.withResolvers<void>();let reads=0;const events:string[]=[],client=sourceClient({sourceRead:async(phase,read)=>{const actual=read();if(phase==='snapshot'){reads++;await release.promise}return actual}})
 await isolatedPdf(client,async({controller,data})=>{
  const choosing=outcome(controller.act({type:'choose'}));await until(()=>reads===1)
  const stopTasks=await actualMainCloseOption('stopTasks',{novelImport:{cancelPdfWork(){events.push('cancel');controller.cancelPdfWork()},pauseAll:()=>controller.pauseAll()},novelImportSourcePicker:{cancel(){}},window:null,modelService:{close:async()=>events.push('models-close')},service:{call:async()=>events.push('tasks-stop')},setTimeout:(callback:()=>void)=>setTimeout(callback,15)})
  const coordinator=new CloseCoordinator({current:()=>null,busy:async()=>true,confirmStop:async()=>true,stopTasks,flush:async()=>{},closeData:async()=>{events.push('data-close')},failed:async()=>{events.push('deadline');return 'cancel'},exportDraft:async()=>{},commit:()=>{events.push('commit')},release:()=>{events.push('release')}})
  assert.equal(await coordinator.request('quit'),false);assert.ok(events.includes('deadline'));assert.equal(client.active,1);assert.ok(client.registry.metrics.sourceBytes>0);assert.equal(events.includes('data-close'),false);assert.equal(events.includes('commit'),false);assert.equal((await readdir(join(data,'novel-imports'))).length,0)
  release.resolve();await controller.drainPdfWork();await controller.pauseAll();assert.ok('error'in await choosing);assert.equal(client.active,0);assert.equal(await coordinator.request('quit'),true);assert.ok(events.indexOf('data-close')>events.indexOf('deadline'));assert.ok(events.includes('commit'))
 },false,undefined,()=>release.resolve())
})

test('NI-PDF08: old PDF inspection and the actual main close entry cancel before serial and gate drains',async t=>{
 await t.test('legacy PDF supplementation is owned and canceled without changing frozen checkpoints',async()=>{
  const root=await realpath(await mkdtemp(join(tmpdir(),'shakeink-pdf-legacy-'))),data=join(root,'data'),source=join(root,'正文.pdf');await mkdir(data);await writeFile(source,await pdfFixture(['text','text']))
  const options={root:data,pdfClient:sourceClient(),choose:async()=>[source],chooseTarget:async()=>null,protectedDirectories:async()=>[],models:async()=>({}),ai:async()=>{throw Error('AI must not run')},cancelAi:async()=>{},publish:async()=>{throw Error('publish must not run')}}
  let first:NovelImportController|undefined,restored:NovelImportController|undefined;const release=Promise.withResolvers<void>();let reads=0,owner=true
  try{first=new NovelImportController(options);await first.initialize();const original=(await first.act({type:'choose'})).view!;const path=join(data,'novel-imports',original.id,'session.json'),journal=JSON.parse(await readFile(path,'utf8'));await first.close()
   // Closing deletes an unsaved draft; only a journal whose save began is restored, so the legacy journal is re-seeded with a publication.
   assert.equal(existsSync(join(data,'novel-imports',original.id)),false);await mkdir(join(data,'novel-imports',original.id));await writeFile(join(data,'novel-imports',original.id,'.owner'),'shakeink-novel-import-v1\n'+original.id+'\n');journal.publication={requestId:randomUUID(),hash:'legacy-publication'};delete journal.files[0].pdfInspection;const historicalModel={id:'text',name:'Frozen test model',modelId:'synthetic',endpoint:'https://model.invalid/v1',authRevision:1,contextWindow:16000};journal.models={text:historicalModel,review:{...historicalModel,id:'review'}};journal.analysisGrant={hash:importScopeHash(journal,'analyze'),textModel:historicalModel,reviewModel:journal.models.review};journal.coverage.reviewFacts=['frozen-facts-package'];journal.analysisCheckpoint={hash:importScopeHash(journal,'analyze'),target:{path:'/synthetic-target',device:'1',inode:'2'}};await writeFile(path,JSON.stringify(journal));const checkpoint=JSON.stringify(journal.analysisCheckpoint),scope=importScopeHash(journal,'analyze')
   const client=sourceClient({sourceRead:async(phase,read)=>{const actual=read();if(phase==='snapshot'){reads++;await release.promise}return actual}});restored=new NovelImportController({...options,pdfClient:client,assertPdfOwner:()=>{if(!owner)throw Error('owner revoked')}});await restored.initialize();const reading=outcome(restored.act({type:'current'}));await until(()=>reads===1);restored.cancelPdfWork();owner=false;let drained=false;const draining=restored.pauseAll().then(()=>{drained=true});await new Promise(resolve=>setTimeout(resolve,12));assert.equal(drained,false);assert.equal(client.active,1);release.resolve();await draining;assert.ok('error'in await reading);const after=JSON.parse(await readFile(path,'utf8'));assert.equal(after.files[0].pdfInspection,undefined);assert.equal(JSON.stringify(after.analysisCheckpoint),checkpoint);assert.deepEqual(after.coverage.reviewFacts,['frozen-facts-package']);assert.equal(importScopeHash(after,'analyze'),scope)
  }finally{release.resolve();await restored?.close();await first?.close();await rm(root,{recursive:true,force:true})}
 })
 await t.test('actual beginClose revokes initial choose before its real FS and BusinessGate settle',async()=>{
  const release=Promise.withResolvers<void>();let reads=0;const events:string[]=[],client=sourceClient({sourceRead:async(phase,read)=>{const actual=read();if(phase==='snapshot'){reads++;await release.promise;events.push('fs-settled')}return actual}})
  await isolatedPdf(client,async({controller})=>{const gate=new BusinessGate(),choosing=outcome(gate.run(()=>controller.act({type:'choose'})));await until(()=>reads===1);const code=await readFile('desktop/main/index.ts','utf8'),file=ts.createSourceFile('index.ts',code,ts.ScriptTarget.Latest,true);let body='';const walk=(node:ts.Node)=>{if(ts.isFunctionDeclaration(node)&&node.name?.text==='beginClose')body=node.getText(file);ts.forEachChild(node,walk)};walk(file);let closing:Promise<boolean>|undefined
   const dependencies={novelImport:{cancelPdfWork(){events.push('cancel');controller.cancelPdfWork()}},novelImportSourcePicker:{cancel(){events.push('picker-cancel')}},novelImportRepairing:false,novelImportCloseIntent:null,closeCoordinator:{request(){events.push('close-request');closing=controller.pauseAll().then(async()=>{events.push('controller-drained');await gate.close();events.push('gate-drained');return true});return closing}},workLease:null,closingFlow:null,migrationHandoff:null,businessGate:gate,closeCommitted:false,retryMigrationCancellation:async()=>{},send(){}}
   const begin=new Function(...Object.keys(dependencies),transformSync('return '+body,{loader:'ts'}).code)(...Object.values(dependencies));begin('quit');await new Promise(resolve=>setTimeout(resolve,12));assert.deepEqual(events.slice(0,3),['cancel','picker-cancel','close-request']);assert.equal(events.includes('controller-drained'),false);assert.equal(gate.closed,false);assert.equal(client.active,1);release.resolve();await closing;assert.ok('error'in await choosing);assert.ok(events.indexOf('controller-drained')>events.indexOf('fs-settled'));assert.ok(events.indexOf('gate-drained')>events.indexOf('controller-drained'));assert.equal((await controller.act({type:'current'})).view,null)
  },false,undefined,()=>release.resolve())
 })
})

test('NI-PDF05: only bounded PNG previews issue page and source bound confirmation tokens',async()=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'shakeink-pdf-bitmap-'))),path=join(root,'source.pdf'),bytes=await pdfFixture(['text']);await writeFile(path,bytes);const grant=await captureNovelSourceGrant(path),file={path,proof:grant.proof,ancestors:grant.ancestors,hash:createHash('sha256').update(bytes).digest('hex')}
 const canvas=createCanvas(80,100),png=Uint8Array.from(canvas.toBuffer('image/png'));let mode:'dimensions'|'late'|'stdout'|'stderr'|'pixels'|'png-bytes'='dimensions'
 class CandidateWorker extends EventEmitter {stdout=new PassThrough();stderr=new PassThrough();postMessage(message:{diagnosticSeal:SharedArrayBuffer}){queueMicrotask(()=>{if(mode==='stdout'||mode==='stderr')this[mode].write('/private/synthetic/untrusted-pdf-warning');this.emit('message',{type:'result',value:{png:mode==='png-bytes'?new Uint8Array(PDF_LIMITS.pngBytes+1):png,width:mode==='dimensions'?1:mode==='pixels'?4096:80,height:mode==='dimensions'?1:mode==='pixels'?4096:100,pageWidth:80,pageHeight:100,resourceProfileHash:PDF_RESOURCE_PROFILE_HASH}});if(mode==='late')Atomics.store(new Int32Array(message.diagnosticSeal),0,1);this.emit('exit',0)})}terminate(){return Promise.resolve(0)}}
 try{const client=sourceClient({workerFactory:CandidateWorker as unknown as typeof Worker});for(mode of ['dimensions','late','stdout','stderr','pixels','png-bytes'] as const)await assert.rejects(client.preview(file,1,{operationId:mode,assertCurrent:()=>{}}),error=>error instanceof PdfJobError&&!error.message.includes('synthetic'));assert.equal(client.active,0);assert.equal(client.registry.metrics.sourceBytes,0)}finally{await rm(root,{recursive:true,force:true})}
})

test('NI-PDF14: actual missing-dimension and decode warnings block otherwise visible PDF pages',async()=>{
 for(const mode of ['dimensions','non-number','decode'] as const){const pdf=await PDFDocument.load(await pdfFixture(['mixed','text'])),page=pdf.getPage(0),stream=pdf.context.stream(mode==='decode'?new Uint8Array([255,216,0,255,217]):new Uint8Array([0,0,0]),{Type:'XObject',Subtype:'Image',Height:20,...(mode==='decode'?{Width:20,Filter:'DCTDecode'}:mode==='non-number'?{Width:'invalid'}:{}),ColorSpace:'DeviceRGB',BitsPerComponent:8}),ref=pdf.context.register(stream);page.node.setXObject(PDFName.of('BrokenImage'),ref);page.node.addContentStream(pdf.context.register(pdf.context.flateStream('q 20 0 0 20 0 0 cm /BrokenImage Do Q')));const result=await sourceClient().inspectBytes(await pdf.save());assert.ok(result.text.includes('Middle original.'));assert.ok(result.text.includes('Tail original.'));assert.equal(result.pdfInspection.pages[0].raster,'unknown');assert.ok(result.pdfInspection.pages[0].errors?.includes(mode==='decode'?'PDF_IMAGE_DECODE_FAILED':'PDF_IMAGE_DIMENSIONS_INVALID'));assert.equal(result.pdfInspection.blocker,'page-error')}
})

async function until(check:()=>boolean){for(let i=0;i<1500;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,2))}throw Error('controlled PDF point not reached')}
const outcome=<T>(promise:Promise<T>)=>promise.then(value=>({value}),error=>({error}))
async function isolatedPdf(client:NovelImportPdfClient,run:(context:{controller:NovelImportController;root:string;data:string;source:string})=>Promise<void>,initial=true,bytes?:Uint8Array,release?:()=>void,overrides:Partial<ConstructorParameters<typeof NovelImportController>[0]>={}){
 const root=await realpath(await mkdtemp(join(tmpdir(),'shakeink-pdf-controlled-'))),data=join(root,'data'),source=join(root,'sources','正文.pdf');await mkdir(data);await mkdir(join(root,'sources'));await writeFile(source,bytes??await pdfFixture(['image','image','text']))
 const controller=new NovelImportController({root:data,pdfClient:client,choose:async()=>[source],chooseTarget:async()=>null,protectedDirectories:async()=>[],models:async()=>({}),ai:async()=>{throw Error('AI must not run')},cancelAi:async()=>{},publish:async()=>{throw Error('publish must not run')},...overrides})
 try{await controller.initialize();if(initial)await controller.act({type:'choose'});await run({controller,root,data,source})}finally{release?.();controller.cancelPdfWork();await controller.close();await rm(root,{recursive:true,force:true})}
}

test('NI-PDF08: inspection and preview cancellation drain real jobs before controller serial waits',async t=>{
 await t.test('initial choose keeps one admitted real FS chain and an empty session until canceled resources settle',async()=>{
  const release=Promise.withResolvers<void>();let reads=0
  const client=sourceClient({sourceRead:async(phase,read)=>{const actual=read();if(phase==='snapshot'){reads++;await release.promise}return actual}})
  await isolatedPdf(client,async({controller,source})=>{const choosing=outcome(controller.act({type:'choose'}));await until(()=>reads===1);assert.equal(client.registry.metrics.allocations,1);assert.ok(client.registry.metrics.sourceBytes>0)
   const grant=await captureNovelSourceGrant(source),file={path:source,proof:grant.proof,ancestors:grant.ancestors,hash:createHash('sha256').update(await readFile(source)).digest('hex')},queued=outcome(client.verify(file,{operationId:'queued',assertCurrent:()=>{}}));await assert.rejects(client.verify(file,{operationId:'over-limit',assertCurrent:()=>{}}),/繁忙/);assert.equal(reads,1);assert.equal(client.registry.metrics.allocations,1)
   controller.cancelPdfWork();let drained=false;const draining=controller.pauseAll().then(()=>{drained=true});await new Promise(resolve=>setTimeout(resolve,12));assert.equal(drained,false);assert.equal(client.active,1);assert.ok(client.registry.metrics.sourceBytes>0);assert.equal((await controller.act({type:'current'})).view,null)
   release.resolve();await draining;assert.equal(client.active,0);assert.equal(client.registry.metrics.sourceBytes,0);assert.ok('error'in await choosing);assert.ok('error'in await queued);assert.equal(reads,1);assert.equal(client.registry.metrics.transfers,0)
  },false,undefined,()=>release.resolve())
 })
 await t.test('renderer cancel enters before a reselect inspection queued inside the real controller tail',async()=>{
  const release=Promise.withResolvers<void>();let block=false,reads=0
  const client=sourceClient({sourceRead:async(phase,read)=>{const actual=read();if(block&&phase==='snapshot'){reads++;await release.promise}return actual}})
  await isolatedPdf(client,async({controller,data})=>{const first=(await controller.act({type:'current'})).view!;block=true;const reselect=outcome(controller.act({type:'reselect-source',id:first.id,revision:first.revision,fileId:first.files[0].id}));await until(()=>reads===1)
   const cancellation=outcome(controller.act({type:'cancel',id:first.id,revision:first.revision}));await new Promise(resolve=>setTimeout(resolve,12));assert.equal(client.registry.closed,true,'cancel must reach registry before controller.serial can complete');assert.equal(client.active,1);release.resolve();const canceled=await cancellation;assert.ok('value'in canceled&&canceled.value.view===null,JSON.stringify(canceled));assert.ok('error'in await reselect);assert.equal((await controller.act({type:'current'})).view,null);assert.equal(existsSync(join(data,'novel-imports',first.id)),false)
  },true,undefined,()=>release.resolve())
 })
 await t.test('real worker exit remains charged after pending preview is canceled',async()=>{
  const release=Promise.withResolvers<void>();let hold=false,created=0;const events:string[]=[]
  class ControlledExitWorker extends Worker {constructor(...args:ConstructorParameters<typeof Worker>){super(...args);created++;this.on('exit',()=>events.push('exit'))}override terminate(){if(hold)return release.promise.then(()=>super.terminate());return super.terminate()}}
  const client=sourceClient({workerFactory:ControlledExitWorker})
  await isolatedPdf(client,async({controller})=>{const view=(await controller.act({type:'current'})).view!,requestId=randomUUID(),baseline=created;events.length=0;hold=true;const reading=outcome(controller.act({type:'read-pdf-page',id:view.id,revision:view.revision,fileId:view.files[0].id,page:1,requestId}));await until(()=>created>baseline);await controller.act({type:'cancel-pdf-preview',id:view.id,requestId});events.push('cancel');let drained=false;const draining=controller.pauseAll().then(()=>{drained=true;events.push('drain')});await new Promise(resolve=>setTimeout(resolve,12));assert.equal(drained,false);assert.equal(client.active,1);assert.equal(events.includes('exit'),false);release.resolve();await draining;assert.ok(events.indexOf('exit')>events.indexOf('cancel'));assert.ok(events.indexOf('drain')>events.indexOf('exit'));assert.ok('error'in await reading);assert.equal(client.registry.metrics.sourceBytes,0)
  },true,undefined,()=>release.resolve())
 })
})

test('NI-PDF04: preview verifies authorized source identity before cache use and after rendering',async t=>{
 for(const mode of ['same-bytes-file','ancestor-directory','ancestor-link'])await t.test(mode,async()=>{
  const client=sourceClient();await isolatedPdf(client,async({controller,root,source})=>{let view=(await controller.act({type:'current'})).view!,file=view.files[0];const first=await command(controller,'read-pdf-page',{fileId:file.id,page:1,requestId:randomUUID()});assert.equal(first.pdfPage!.status,'ready');const transfers=client.registry.metrics.transfers;const cached=await command(controller,'read-pdf-page',{fileId:file.id,page:1,requestId:randomUUID()});assert.equal(cached.pdfPage!.status,'ready');assert.equal(client.registry.metrics.transfers,transfers,'cache hit must verify source without spawning another renderer')
   const bytes=await readFile(source);if(mode==='same-bytes-file'){await rename(source,source+'.old');await writeFile(source,bytes)}else{await rename(join(root,'sources'),join(root,'sources-old'));if(mode==='ancestor-link')await symlink(join(root,'sources-old'),join(root,'sources'),'dir');else{await mkdir(join(root,'sources'));await writeFile(source,bytes)}}
   const rejected=await command(controller,'read-pdf-page',{fileId:file.id,page:1,requestId:randomUUID()});assert.equal(rejected.pdfPage!.status,'failed');if(rejected.pdfPage!.status==='failed')assert.equal(rejected.pdfPage!.code,'source-changed');view=rejected.view!;assert.equal(view.pdfReady,false);assert.equal(view.files[0].pdfSourceInvalidated,true);assert.equal(view.files[0].hash,file.hash);assert.ok(!('png'in rejected.pdfPage!));assert.equal(await readFile(source,'hex'),bytes.toString('hex'))
  })
 })
 await t.test('replacement after snapshot but before render result is checked again',async()=>{const release=Promise.withResolvers<void>();let block=false,held=false;const client=sourceClient({afterRead:async()=>{if(block){held=true;await release.promise}}});await isolatedPdf(client,async({controller,source})=>{const view=(await controller.act({type:'current'})).view!,file=view.files[0];block=true;const reading=controller.act({type:'read-pdf-page',id:view.id,revision:view.revision,fileId:file.id,page:1,requestId:randomUUID()});await until(()=>held);const bytes=await readFile(source);await rename(source,source+'.old');await writeFile(source,bytes);release.resolve();const response=await reading;assert.equal(response.pdfPage!.status,'failed');assert.equal(response.view!.files[0].pdfSourceInvalidated,true);assert.ok(!('png'in response.pdfPage!))},true,undefined,()=>release.resolve())})
})

test('NI-PDF05: decode failures bind issued lineage, preserve saved decisions and stay blocked until successful retry',()=>controllerFixture(async controller=>{
 const view=(await controller.act({type:'current'})).view!,file=view.files[0],requestId=randomUUID(),preview=await command(controller,'read-pdf-page',{fileId:file.id,page:1,requestId});assert.equal(preview.pdfPage!.status,'ready')
 await command(controller,'set-pdf-page-decisions',{fileId:file.id,ledgerHash:file.pdfInspection!.ledgerHash,changes:[{page:1,decision:'exclude-image',previewToken:preview.pdfPage!.status==='ready'?preview.pdfPage!.previewToken:undefined}]})
 const failed=await controller.act({type:'report-pdf-preview-failure',id:view.id,revision:view.revision,fileId:file.id,page:1,requestId});assert.equal(failed.view!.files[0].pdfPreviewFailures![0].code,'render-failed');assert.equal(failed.view!.files[0].pdfPageDecisions![0].decision,'exclude-image');assert.equal((await controller.act({type:'current'})).view!.pdfReady,false)
 await assert.rejects(command(controller,'report-pdf-preview-failure',{fileId:file.id,page:1,requestId:randomUUID()}));const retry=await command(controller,'read-pdf-page',{fileId:file.id,page:1,requestId:randomUUID()});assert.equal(retry.pdfPage!.status,'ready');assert.equal(retry.view!.files[0].pdfPreviewFailures,undefined)
 await assert.rejects(controller.act({type:'report-pdf-preview-failure',id:view.id,revision:view.revision,fileId:file.id,page:1,requestId}),/失效|旧|预览/)
}))

async function controllerFixture(run:(controller:NovelImportController)=>Promise<void>,pages:Parameters<typeof pdfFixture>[0]=['image','image','text']){
 const root=await realpath(await mkdtemp(join(tmpdir(),'shakeink-pdf-session-'))),data=join(root,'data'),source=join(root,'正文.pdf');await mkdir(data);await writeFile(source,await pdfFixture(pages))
 const controller=new NovelImportController({root:data,pdfClient:sourceClient(),choose:async()=>[source],chooseTarget:async()=>null,protectedDirectories:async()=>[],models:async()=>({}),ai:async()=>{throw Error('AI must not run')},cancelAi:async()=>{},publish:async()=>{throw Error('publish must not run')}})
 try{await controller.initialize();await controller.act({type:'choose'});await run(controller)}finally{await controller.close();await rm(root,{recursive:true,force:true})}
}
async function command(controller:NovelImportController,type:string,extra:Record<string,unknown>={}){const view=(await controller.act({type:'current'})).view!;return controller.act({type,id:view.id,...(type==='read-source'?{}:{revision:view.revision}),...extra})}

test('NI-PDF06: explicit page decisions commit atomically, preserve page text and reblock after revocation',()=>controllerFixture(async controller=>{
 let view=(await controller.act({type:'current'})).view!,file=view.files[0];assert.equal(view.pdfReady,false);assert.equal(file.pdfPendingPages,2)
 const original=(await command(controller,'read-source',{fileId:file.id})).source!.text
 const first=await command(controller,'read-pdf-page',{fileId:file.id,page:1,requestId:randomUUID()});assert.equal(first.pdfPage!.status,'ready');assert.equal(first.view!.revision,view.revision)
 await command(controller,'set-pdf-page-decisions',{fileId:file.id,ledgerHash:file.pdfInspection!.ledgerHash,changes:[{page:1,decision:'exclude-image',previewToken:first.pdfPage!.status==='ready'?first.pdfPage!.previewToken:undefined}]});view=(await controller.act({type:'current'})).view!;assert.equal(view.pdfReady,false);assert.equal(view.files[0].pdfPendingPages,1)
 const second=await command(controller,'read-pdf-page',{fileId:file.id,page:2,requestId:randomUUID()});const before=second.view!.revision
 await assert.rejects(command(controller,'set-pdf-page-decisions',{fileId:file.id,ledgerHash:file.pdfInspection!.ledgerHash,changes:[{page:1,decision:'uncertain'},{page:2,decision:'exclude-image',previewToken:randomUUID()}]}));assert.equal((await controller.act({type:'current'})).view!.revision,before)
 await command(controller,'set-pdf-page-decisions',{fileId:file.id,ledgerHash:file.pdfInspection!.ledgerHash,changes:[{page:2,decision:'exclude-image',previewToken:second.pdfPage!.status==='ready'?second.pdfPage!.previewToken:undefined}]});view=(await controller.act({type:'current'})).view!;assert.equal(view.pdfReady,true)
 await command(controller,'set-pdf-page-decisions',{fileId:file.id,ledgerHash:file.pdfInspection!.ledgerHash,changes:[{page:2,decision:'exclude-image',previewToken:randomUUID()}]});assert.equal((await controller.act({type:'current'})).view!.revision,view.revision)
 await command(controller,'set-pdf-page-decisions',{fileId:file.id,ledgerHash:file.pdfInspection!.ledgerHash,changes:[{page:1,decision:'pending'}]});assert.equal((await controller.act({type:'current'})).view!.pdfReady,false);assert.equal((await command(controller,'read-source',{fileId:file.id})).source!.text,original)
}))

test('NI-PDF06: OCR-only image decisions persist without admitting the source',()=>controllerFixture(async controller=>{
 let view=(await controller.act({type:'current'})).view!,file=view.files[0]
 assert.equal(file.pdfInspection!.blocker,'ocr-required');assert.equal(view.pdfReady,false);assert.equal(view.sourceReady,false)
 await command(controller,'set-pdf-page-decisions',{fileId:file.id,ledgerHash:file.pdfInspection!.ledgerHash,changes:[{page:1,decision:'contains-content'}]})
 view=(await controller.act({type:'current'})).view!;assert.equal(view.files[0].pdfPageDecisions!.find(decision=>decision.page===1)!.decision,'contains-content');assert.equal(view.pdfReady,false);assert.equal(view.sourceReady,false)
 const preview=await command(controller,'read-pdf-page',{fileId:file.id,page:2,requestId:randomUUID()});assert.equal(preview.pdfPage!.status,'ready')
 assert.equal(preview.pdfPage!.status==='ready'?preview.pdfPage!.previewToken:undefined,undefined,'OCR-only sources never receive an exclusion capability')
 const revision=preview.view!.revision
 await assert.rejects(command(controller,'set-pdf-page-decisions',{fileId:file.id,ledgerHash:file.pdfInspection!.ledgerHash,changes:[{page:2,decision:'exclude-image',previewToken:randomUUID()}]}),/PDF|OCR|核对/u)
 view=(await controller.act({type:'current'})).view!;assert.equal(view.revision,revision);assert.equal(view.files[0].pdfPageDecisions!.find(decision=>decision.page===1)!.decision,'contains-content')
 await command(controller,'set-pdf-page-decisions',{fileId:file.id,ledgerHash:file.pdfInspection!.ledgerHash,changes:[{page:2,decision:'uncertain'}]})
 view=(await controller.act({type:'current'})).view!;assert.equal(view.files[0].pdfPageDecisions!.find(decision=>decision.page===2)!.decision,'uncertain');assert.equal(view.pdfReady,false);assert.equal(view.sourceReady,false)
 await command(controller,'set-pdf-page-decisions',{fileId:file.id,ledgerHash:file.pdfInspection!.ledgerHash,changes:[{page:1,decision:'pending'}]})
 view=(await controller.act({type:'current'})).view!;assert.equal(view.files[0].pdfPageDecisions!.find(decision=>decision.page===1)!.decision,'pending');assert.equal(view.pdfReady,false);assert.equal(view.sourceReady,false)
 for(const [type,extra] of [['classify',{mode:'local',consent:false}],['classify',{mode:'ai',consent:true}],['start',{consent:false}],['resume',{}],['retry',{}],['resolve',{conflictId:'forged',choice:'source'}],['apply-patches',{patchIds:['forged'],confirm:true}]] as const)await assert.rejects(command(controller,type,extra),/PDF|OCR|核对/u)
 assert.equal((await command(controller,'read-source',{fileId:file.id})).source!.text,'')
},['image','image']))

async function pdfFixture(pages:('text'|'image'|'mixed'|'blank'|'scan-number')[]){
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),canvas=createCanvas(400,180),context=canvas.getContext('2d');context.fillStyle='white';context.fillRect(0,0,400,180);context.fillStyle='black';context.font='36px sans-serif';context.fillText('COVER / IMAGE TEXT',12,70);const image=await pdf.embedPng(canvas.toBuffer('image/png'))
 for(const [index,kind] of pages.entries()){const page=pdf.addPage([500,700]);if(['image','mixed','scan-number'].includes(kind))page.drawImage(image,{x:10,y:200,width:400,height:180});if(kind==='text'||kind==='mixed')page.drawText(index===pages.length-1?'Tail original.':'Middle original.',{font,size:18,x:30,y:600});if(kind==='scan-number')page.drawText(String(index+1),{font,size:10,x:250,y:15})}
 return pdf.save()
}

test('NI-PDF01: full PDF inspection retains cover, every text page and mixed-page text without image approval',async()=>{
 const result=await sourceClient().inspectBytes(await pdfFixture(['image','text','mixed','text']))
 assert.equal(result.pdfInspection.pageCount,4);assert.equal(result.pdfInspection.pages.length,4);assert.deepEqual(result.pdfInspection.pages.map(p=>p.page),[1,2,3,4]);assert.equal(result.pdfInspection.pages[0].textCharacters,0);assert.equal(result.pdfInspection.pages[0].raster,'present');assert.equal(result.pdfInspection.pages[0].start,0);assert.equal(result.pdfInspection.pages[0].end,0);assert.ok(result.text.startsWith('Middle original.'));assert.ok(result.text.endsWith('Tail original. '));assert.equal(result.pdfInspection.imagePageCount,2);assert.equal(result.pdfInspection.textOnlyPageCount,2);assert.ok(!('pdfPageDecisions'in result));assert.equal(result.parts[0].end,result.text.length);assert.equal(result.pages.at(-1)!.end,result.text.length)
})

test('NI-PDF02: scan and partial PDF failures keep explicit blocked page ledgers instead of truncated success',async()=>{
 const client=sourceClient()
 for(const pages of [['image'],['scan-number','scan-number'],['blank']] as const){const result=await client.inspectBytes(await pdfFixture([...pages]));assert.equal(result.pdfInspection.blocker,'ocr-required');assert.equal(result.pdfInspection.pages.length,pages.length)}
 const result=await client.inspectBytes(await pdfFixture(['text','blank']));assert.equal(result.pdfInspection.blocker,'page-error');assert.equal(result.pdfInspection.pages[1].textState,'empty');assert.ok(result.text.includes('Middle original.'))
 const damaged=await client.inspectBytes(Buffer.from('%PDF-1.7\nbroken'));assert.equal(damaged.pdfInspection.scanState,'document-error');assert.equal(damaged.pdfInspection.pageCount,null);assert.equal(damaged.text,'')
})

test('NI-PDF07: every sending and publication path rejects unresolved PDF images including copy-only imports',()=>{
 const proof={device:'1',inode:'2',size:'10',mtime:'3',ctime:'4'},file:ImportFile={id:'pdf-file',name:'正文.pdf',format:'pdf',path:'/synthetic.pdf',bytes:10,hash:'a'.repeat(64),proof,text:'原文',included:true}
 file.pdfInspection={schemaVersion:1,sourceHash:file.hash,proof,inspectionId:randomUUID(),extractorVersion:'pdfjs-6.3.289',resourceProfileHash:'b'.repeat(64),ledgerHash:'',pageCount:2,scanState:'complete',pages:[{page:1,start:0,end:0,textCharacters:0,textState:'empty',raster:'present'},{page:2,start:0,end:2,textCharacters:2,textState:'extracted',raster:'none'}],textOnlyPageCount:1,imagePageCount:1,totalTextCharacters:2};file.pdfInspection.ledgerHash=pdfInspectionLedgerHash(file.pdfInspection)
 assert.throws(()=>validatePdfPageReviews([file]),/PDF|核对/u)
 file.pdfPageDecisions=[{fileId:file.id,page:1,sourceHash:file.hash,proof,ledgerHash:file.pdfInspection.ledgerHash,resourceProfileHash:file.pdfInspection.resourceProfileHash,decision:'exclude-image',confirmedAt:'2026-10-26T00:00:00.000Z',decisionRevision:1}];validatePdfPageReviews([file]);const key=pdfSourceKey(file)
 file.pdfPreviewFailures=[{page:1,code:'render-failed',at:'2026-10-26T00:00:00.000Z'}];assert.throws(()=>validatePdfPageReviews([file]));delete file.pdfPreviewFailures;file.pdfPageDecisions[0].decision='pending';assert.throws(()=>validatePdfPageReviews([file]));file.included=false;validatePdfPageReviews([file]);assert.equal(pdfSourceKey(file),key)
})

test('NI-PDF09: old non-PDF hashes and restored checkpoints remain byte identical with absent PDF fields',()=>{
 const s={version:1,id:'a845f9fb-f49d-407a-9ae1-a3d38cb37273',revision:4,phase:'paused',title:'S01 fixture',files:[{id:'old-md',name:'正文.md',format:'md',path:'/synthetic/source.md',bytes:16,hash:'old-hash',text:'第一章\n旧正文',included:true}],units:[{id:'old-unit',fileId:'old-md',start:0,end:7,text:'第一章\n旧正文',kind:'body'}],selected:['body'],targets:['character'],infer:true,artifacts:[],conflicts:[],patches:[],originalProse:'',workingProse:'',workingRevision:0,chapters:[],steps:[],coverage:{reviewFacts:['old-facts-package']},notFound:[],epoch:3,createdAt:'2026-10-20T00:00:00.000Z',updatedAt:'2026-10-21T00:00:00.000Z',decisions:[],analysisCheckpoint:{hash:'old-checkpoint',target:{path:'/synthetic/target',device:'1',inode:'2'}}} as unknown as ImportSession
 assert.equal(importScopeHash(s,'classify'),'c1a74d157e82396373779ea33d4e1bf0c0f968ce2810c323a86927e29eace3e6');assert.equal(importScopeHash(s,'analyze'),'a7b5cce65b130e5eba4fe22699c8958e277ed392ef9c4430264affdf1d70adf4');assert.equal(importPlanHash(s),'41cbde7e9592ec5915852601ff1279eeb7ca44892ac8470732a2fa2ba41fc77e')
 const before=importPlanHash(s);s.pdfPageDecisionEvents=[{fileId:'test',page:1,sourceHash:'a'.repeat(64),ledgerHash:'b'.repeat(64),resourceProfileHash:'c'.repeat(64),decision:'pending',action:'revoke',at:'2026-10-26T00:00:00.000Z',decisionRevision:1}];assert.notEqual(importPlanHash(s),before)
})

test('NI-PDF14: PDF worker budgets bound admission, canvas, cache and cleanup without accepting partial output',async()=>{
 const registry=new PdfJobRegistry(),blocked=Promise.withResolvers<void>(),started:string[]=[],owner=()=>{}
 const first=registry.run({operationId:'first',timeoutMs:1000,assertCurrent:owner},async context=>{started.push('first');await blocked.promise;context.check();return 1})
 const second=registry.run({operationId:'second',timeoutMs:1000,assertCurrent:owner},async()=>{started.push('second');return 2})
 await assert.rejects(registry.run({operationId:'third',timeoutMs:1000,assertCurrent:owner},async()=>3),/busy|繁忙/u)
 registry.cancelAll();await assert.rejects(first,/Abort|取消/u);await assert.rejects(second,/Abort|取消/u);assert.equal(registry.active,1);assert.deepEqual(started,['first'])
 let drained=false;const draining=registry.drain().then(()=>{drained=true});await new Promise(resolve=>setImmediate(resolve));assert.equal(drained,false)
 blocked.resolve();await draining;assert.equal(registry.active,0);registry.reopen();assert.equal(await registry.run({operationId:'after',timeoutMs:1000,assertCurrent:owner},async()=>4),4)
 const diagnostics=new PdfDiagnostics();diagnostics.page(1);diagnostics.record('Warning: Image dimensions are missing, or not numbers.');assert.ok(diagnostics.codes(1).includes('PDF_IMAGE_DIMENSIONS_INVALID'));diagnostics.record({get message(){throw Error('must never read getters')}});assert.ok(diagnostics.codes(1).includes('PDF_DIAGNOSTIC_UNCLASSIFIED'));for(let i=0;i<140;i++)diagnostics.record('unknown');assert.ok(diagnostics.codes(1).includes('PDF_DIAGNOSTIC_OVERFLOW'));diagnostics.page(null);diagnostics.record('late');assert.equal(diagnostics.documentBlocked,true)
 const long=new PdfDiagnostics();long.page(1);long.record('x'.repeat(513));assert.deepEqual(long.codes(1),['PDF_DIAGNOSTIC_UNCLASSIFIED'])
 const task=new PdfDiagnostics();for(let page=1;page<=17;page++){task.page(page);for(let n=0;n<32;n++)task.record('unknown')}assert.ok(task.codes(17).includes('PDF_DIAGNOSTIC_OVERFLOW'))
 let late=0;const sealed=new PdfDiagnostics(()=>late++);sealed.page(1);sealed.seal();sealed.record('Warning: Image dimensions are missing, or not numbers.');assert.equal(late,1);assert.equal(sealed.documentBlocked,true)
 const fallback=new PdfDiagnostics();fallback.page(1);fallback.record('Warning: Cannot substitute the font because of its name: SyntheticFont');assert.deepEqual(fallback.codes(1),['PDF_BUNDLED_FONT_FALLBACK']);assert.equal(fallback.blocked(1),true);assert.equal(fallback.blocked(1,true),false);fallback.record('Warning: Failed to load CMap');assert.equal(fallback.blocked(1,true),true)
})

test('NI-PDF14: pending real post-verification IO stays charged after timeout or cancellation',async t=>{
 for(const mode of ['cancel','timeout'] as const)await t.test(mode,async()=>{
  const root=await realpath(await mkdtemp(join(tmpdir(),'shakeink-pdf-postverify-'))),path=join(root,'source.pdf'),bytes=await pdfFixture(['text']);await writeFile(path,bytes)
  const grant=await captureNovelSourceGrant(path),file={path,proof:grant.proof,ancestors:grant.ancestors,hash:createHash('sha256').update(bytes).digest('hex')},release=Promise.withResolvers<void>(),canvas=createCanvas(80,100),png=Uint8Array.from(canvas.toBuffer('image/png'));let verifying=0,reads=0
  class EncodedWorker extends EventEmitter {stdout=new PassThrough();stderr=new PassThrough();postMessage(){queueMicrotask(()=>{this.emit('message',{type:'result',value:{png,width:80,height:100,pageWidth:80,pageHeight:100,resourceProfileHash:PDF_RESOURCE_PROFILE_HASH}});this.emit('exit',0)})}terminate(){return Promise.resolve(0)}}
  const client=sourceClient({workerFactory:EncodedWorker as unknown as typeof Worker,previewTimeoutMs:100,sourceRead:async(phase,read)=>{const actual=read();reads++;if(phase==='verify'){verifying++;await release.promise}return actual}})
  try{
   const result=outcome(client.preview(file,1,{operationId:'pending',assertCurrent:()=>{}}));await until(()=>verifying===1);const readsAtHold=reads;const queued=outcome(client.verify(file,{operationId:'queue',assertCurrent:()=>{}}));await assert.rejects(client.verify(file,{operationId:'overflow',assertCurrent:()=>{}}),/繁忙/)
   if(mode==='cancel')client.cancel('pending')
   const response=await result;assert.ok('error'in response);if(mode==='timeout')assert.equal((response as {error:PdfJobError}).error.code,'timeout');assert.equal(client.active,2);assert.equal(client.registry.metrics.started,1);assert.equal(client.registry.metrics.sourceBytes,bytes.byteLength);assert.equal(client.registry.metrics.allocations,1);assert.equal(client.registry.metrics.transfers,1);assert.equal(reads,readsAtHold)
   client.cancel('queue');assert.ok('error'in await queued);let drained=false;const draining=client.drain().then(()=>{drained=true});await new Promise(resolve=>setTimeout(resolve,12));assert.equal(drained,false);assert.equal(client.registry.metrics.releases,0)
   release.resolve();await draining;assert.equal(client.active,0);assert.equal(client.registry.metrics.sourceBytes,0);assert.equal(client.registry.metrics.releases,1);assert.equal(reads,readsAtHold,'metadata queue must never begin another read while the real handle is outstanding')
  }finally{release.resolve();client.cancelAll();await client.drain();await rm(root,{recursive:true,force:true})}
 })
})

test('NI-PDF14: initial PDF identity metadata is admitted before the first real source filesystem call',async t=>{
 for(const mode of ['native','grant','discovered'] as const)await t.test(mode,async()=>{
  const root=await realpath(await mkdtemp(join(tmpdir(),'shakeink-pdf-identity-admission-'))),source=join(root,'a-source.pdf'),second=join(root,'b-second.pdf');await writeFile(source,await pdfFixture(['text']));await writeFile(second,await readFile(source));const grants=await Promise.all([source,second,root].map(path=>captureNovelSourceGrant(path))),release=Promise.withResolvers<void>(),client=sourceClient(),original=fsPromises.lstat;let calls=0
  const pending:Promise<unknown>[]=[]
  fsPromises.lstat=(async(...args:Parameters<typeof fsPromises.lstat>)=>{const actual=(original as (...input:unknown[])=>Promise<unknown>)(...args);if([source,second].includes(String(args[0]))){calls++;await release.promise}return actual}) as typeof fsPromises.lstat;syncBuiltinESMExports()
  try{
   const first=outcome(scanNovelSources([mode==='discovered'?root:source],{pdfClient:client,...(mode==='native'?{}:{grants:[grants[mode==='discovered'?2:0]]}),operationId:'metadata-first'}));pending.push(first);await until(()=>calls===1);assert.equal(client.active,1,'the first PDF identity lstat must already own the registry slot');assert.equal(client.registry.metrics.started,1);assert.equal(client.registry.metrics.allocations,0)
   const queued=outcome(scanNovelSources([second],{pdfClient:client,...(mode==='native'?{}:{grants:[grants[1]]}),operationId:'metadata-queued'}));pending.push(queued);await new Promise(resolve=>setTimeout(resolve,12));assert.equal(calls,1,'the metadata-only queue cannot begin another identity chain');assert.equal(client.active,2)
   const overflow=await scanNovelSources([second],{pdfClient:client,...(mode==='native'?{}:{grants:[grants[1]]}),operationId:'metadata-overflow'});assert.ok(overflow[0].error);assert.equal(calls,1)
   client.cancelAll();assert.ok('error'in await first);assert.ok('error'in await queued);assert.equal(client.active,1);let drained=false;const draining=client.drain().then(()=>{drained=true});await new Promise(resolve=>setTimeout(resolve,12));assert.equal(drained,false);assert.equal(client.registry.metrics.allocations,0);assert.equal(client.registry.metrics.sourceBytes,0)
   release.resolve();await draining;assert.equal(calls,1,'canceled identity validation must not start its next FS operation');assert.equal(client.active,0);assert.equal(client.registry.metrics.transfers,0)
  }finally{fsPromises.lstat=original;syncBuiltinESMExports();release.resolve();client.cancelAll();await Promise.allSettled(pending);await client.drain();await rm(root,{recursive:true,force:true})}
 })
})

test('NI-PDF14: a directory named PDF releases preparation before child PDF admission without nested jobs',async()=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'shakeink-pdf-named-directory-'))),directory=join(root,'materials.pdf'),client=sourceClient();await mkdir(directory);await writeFile(join(directory,'正文.pdf'),await pdfFixture(['text','text']));await writeFile(join(directory,'角色.md'),'# 角色\n甲：测试人物。')
 try{const grant=await captureNovelSourceGrant(directory),files=await scanNovelSources([directory],{grants:[grant],pdfClient:client,operationId:'named-directory'});assert.equal(files.length,2);assert.ok(files.every(file=>file.included&&!file.error));assert.equal(files.find(file=>file.format==='pdf')!.pdfInspection!.pageCount,2);assert.equal(files.find(file=>file.format==='md')!.text,'# 角色\n甲：测试人物。');assert.equal(client.active,0);assert.equal(client.registry.metrics.started,2);assert.equal(client.registry.metrics.allocations,1);assert.equal(client.registry.metrics.transfers,1);assert.equal(client.registry.metrics.sourceBytes,0)}finally{client.cancelAll();await client.drain();await rm(root,{recursive:true,force:true})}
})

test('NI-PDF08: close deadline keeps the root while the first PDF identity metadata promise remains pending',async()=>{
 const release=Promise.withResolvers<void>(),events:string[]=[],client=sourceClient();let calls=0
 await isolatedPdf(client,async({controller,data,source})=>{
  const original=fsPromises.lstat;fsPromises.lstat=(async(...args:Parameters<typeof fsPromises.lstat>)=>{const actual=(original as (...input:unknown[])=>Promise<unknown>)(...args);if(String(args[0])===source){calls++;await release.promise}return actual}) as typeof fsPromises.lstat;syncBuiltinESMExports();let choosing:ReturnType<typeof outcome>|undefined
  try{
   choosing=outcome(controller.act({type:'choose'}));await until(()=>calls===1);assert.equal(client.active,1)
   const stopTasks=await actualMainCloseOption('stopTasks',{novelImport:{cancelPdfWork(){events.push('cancel');controller.cancelPdfWork()},pauseAll:()=>controller.pauseAll()},novelImportSourcePicker:{cancel(){}},window:null,modelService:{close:async()=>{}},service:{call:async()=>{}},setTimeout:(callback:()=>void)=>setTimeout(callback,15)})
   const coordinator=new CloseCoordinator({current:()=>null,busy:async()=>true,confirmStop:async()=>true,stopTasks,flush:async()=>{},closeData:async()=>{events.push('data-close')},failed:async()=>{events.push('deadline');return 'cancel'},exportDraft:async()=>{},commit:()=>{events.push('commit')},release:()=>{}})
   assert.equal(await coordinator.request('quit'),false);assert.equal(client.active,1);assert.equal(client.registry.metrics.started,1);assert.equal(client.registry.metrics.allocations,0);assert.equal(events.includes('data-close'),false);assert.equal(events.includes('commit'),false);assert.equal((await readdir(join(data,'novel-imports'))).length,0)
   release.resolve();await controller.drainPdfWork();await controller.pauseAll();assert.ok('error'in await choosing);assert.equal(calls,1);assert.equal(client.active,0);assert.equal(await coordinator.request('quit'),true);assert.ok(events.indexOf('data-close')>events.indexOf('deadline'))
  }finally{fsPromises.lstat=original;syncBuiltinESMExports();release.resolve();if(choosing)await choosing}
 },false,undefined,()=>release.resolve())
})

test('NI-PDF02: budget failure keeps already extracted text and marks every remaining physical page unscanned',async()=>{
 let headerOnly=false
 class BudgetWorker extends EventEmitter {stdout=new PassThrough();stderr=new PassThrough();postMessage(){queueMicrotask(()=>{this.emit('message',{type:'progress',value:{pageCount:3,...(headerOnly?{}:{page:{page:1,start:0,end:14,textCharacters:14,textState:'extracted',raster:'none'},text:'Original text.'}),resourceProfileHash:PDF_RESOURCE_PROFILE_HASH}});this.emit('message',{type:'failed',code:'budget'})})}terminate(){queueMicrotask(()=>this.emit('exit',1));return Promise.resolve(1)}}
 const client=sourceClient({workerFactory:BudgetWorker as unknown as typeof Worker}),result=await client.inspectBytes(await pdfFixture(['text','text','text']));await client.drain()
 assert.equal(result.text,'Original text.');assert.equal(result.pdfInspection.pageCount,3);assert.equal(result.pdfInspection.scanState,'incomplete');assert.equal(result.pdfInspection.blocker,'budget');assert.deepEqual(result.pdfInspection.pages.map(page=>[page.page,page.textState,page.raster]),[[1,'extracted','unknown'],[2,'not-scanned','unknown'],[3,'not-scanned','unknown']]);assert.equal(result.pdfInspection.pages.at(-1)!.end,result.text.length)
 headerOnly=true;const firstPageTimeout=await client.inspectBytes(await pdfFixture(['text','text','text']));await client.drain();assert.equal(firstPageTimeout.pdfInspection.pageCount,3);assert.equal(firstPageTimeout.pdfInspection.scanState,'incomplete');assert.ok(firstPageTimeout.pdfInspection.pages.every(page=>page.textState==='not-scanned'));assert.equal(firstPageTimeout.text,'')
})

test('NI-PDF14: actual page and operator caps keep bounded ledgers instead of continued success',async()=>{
 const oversized=await PDFDocument.create();for(let n=0;n<PDF_LIMITS.pages+1;n++)oversized.addPage([10,10]);const many=await sourceClient().inspectBytes(await oversized.save());assert.equal(many.pdfInspection.pageCount,PDF_LIMITS.pages+1);assert.equal(many.pdfInspection.scanState,'incomplete');assert.equal(many.pdfInspection.blocker,'budget');assert.deepEqual(many.pdfInspection.pages,[])
 const pdf=await PDFDocument.load(await pdfFixture(['text','text','text']));pdf.getPage(1).node.addContentStream(pdf.context.register(pdf.context.flateStream('1 0 0 1 0 0 cm\n'.repeat(PDF_LIMITS.pageOperators+1))));const result=await sourceClient().inspectBytes(await pdf.save());assert.equal(result.pdfInspection.scanState,'incomplete');assert.equal(result.pdfInspection.blocker,'budget');assert.equal(result.pdfInspection.pages.length,3);assert.equal(result.pdfInspection.pages[1].raster,'unknown');assert.equal(result.pdfInspection.pages[2].textState,'not-scanned');assert.ok(result.text.includes('Middle original.'));assert.equal(result.text.includes('Tail original.'),false)
 const client=sourceClient(),tooLarge=new Uint8Array(PDF_LIMITS.fileBytes+1),rejected=await client.inspectBytes(tooLarge);assert.equal(rejected.pdfInspection.scanState,'document-error');assert.equal(client.registry.metrics.allocations,0)
 const {appendPdfPageText,checkedPdfOperatorTotal}=await import('../../desktop/main/novel-import-pdf-engine'),full='x'.repeat(PDF_LIMITS.characters-2)
 assert.equal(appendPdfPageText(0,full,'xx').length,PDF_LIMITS.characters);assert.throws(()=>appendPdfPageText(0,full,'xxx'),/PDF_BUDGET/);assert.throws(()=>appendPdfPageText(PDF_LIMITS.characters-2,'','x'),/PDF_BUDGET/)
 assert.equal(checkedPdfOperatorTotal(PDF_LIMITS.totalOperators-PDF_LIMITS.pageOperators,PDF_LIMITS.pageOperators),PDF_LIMITS.totalOperators);assert.throws(()=>checkedPdfOperatorTotal(PDF_LIMITS.totalOperators-1,2),/PDF_BUDGET/);assert.throws(()=>checkedPdfOperatorTotal(0,PDF_LIMITS.pageOperators+1),/PDF_BUDGET/)
})

test('NI-PDF03: page preview actions reject unsafe schemas, foreign files and stale revisions before IO',()=>{
 const base={id:randomUUID(),revision:1,fileId:'pdf-file'},requestId=randomUUID()
 assert.equal(importActionSchema.parse({type:'read-pdf-page',...base,page:1,requestId}).type,'read-pdf-page')
 assert.equal(importActionSchema.parse({type:'cancel-pdf-preview',id:base.id,requestId}).type,'cancel-pdf-preview')
 assert.equal(importActionSchema.parse({type:'set-pdf-page-decisions',...base,ledgerHash:'a'.repeat(64),changes:[{page:1,decision:'exclude-image',previewToken:randomUUID()}]}).type,'set-pdf-page-decisions')
 for(const extra of [{page:0},{page:-1},{page:1.5},{page:NaN},{page:5001},{path:'/forged'},{url:'https://invalid/'},{bytes:new Uint8Array()},{scale:99},{workerMethod:'arbitrary'}])assert.equal(importActionSchema.safeParse({type:'read-pdf-page',...base,page:1,requestId,...extra}).success,false)
 assert.equal(importActionSchema.safeParse({type:'cancel-pdf-preview',id:base.id,requestId,revision:1}).success,false)
 for(const changes of [[{page:1,decision:'exclude-image'}],[{page:1,decision:'pending',previewToken:randomUUID()}],[{page:1,decision:'pending'},{page:1,decision:'uncertain'}],Array.from({length:101},(_,index)=>({page:index+1,decision:'pending'}))])assert.equal(importActionSchema.safeParse({type:'set-pdf-page-decisions',...base,ledgerHash:'a'.repeat(64),changes}).success,false)
})

test('NI-PDF03: runtime page checks reject foreign, excluded and non-PDF sources before any IO',async()=>{
 const client=sourceClient();await isolatedPdf(client,async({controller})=>{
  const view=(await controller.act({type:'current'})).view!,file=view.files[0],metrics={...client.registry.metrics},base={type:'read-pdf-page',id:view.id,revision:view.revision,fileId:file.id,page:1}
  for(const input of [{...base,fileId:'foreign'},{...base,id:randomUUID()},{...base,revision:view.revision-1},{...base,page:4}])await assert.rejects(controller.act({...input,requestId:randomUUID()}))
  assert.deepEqual(client.registry.metrics,metrics)
  await command(controller,'include',{fileId:file.id,included:false});await assert.rejects(command(controller,'read-pdf-page',{fileId:file.id,page:1,requestId:randomUUID()}));assert.deepEqual(client.registry.metrics,metrics)
  const session=(controller as unknown as {session:ImportSession}).session;session.files[0].format='md';delete session.files[0].pdfInspection;session.files[0].included=true
  await assert.rejects(command(controller,'read-pdf-page',{fileId:file.id,page:1,requestId:randomUUID()}));assert.deepEqual(client.registry.metrics,metrics)
 })
})

test('NI-PDF03: actual main IPC protects page reads and keeps preview cancellation outside business admission',async()=>{
 const source=await readFile('desktop/main/index.ts','utf8'),file=ts.createSourceFile('index.ts',source,ts.ScriptTarget.Latest,true);let handler='',trustedBody='';const walk=(node:ts.Node)=>{if(ts.isCallExpression(node)&&node.expression.getText(file)==='ipcMain.handle'&&ts.isStringLiteral(node.arguments[0])&&node.arguments[0].text==='desktop:novel-import')handler=node.arguments[1].getText(file);if(ts.isFunctionDeclaration(node)&&node.name?.text==='trusted')trustedBody=node.getText(file);ts.forEachChild(node,walk)};walk(file)
 const sender={id:3,mainFrame:{url:'shakeink://app/'}},window={webContents:sender,isDestroyed:()=>false},session={owner:3,id:randomUUID(),ready:true},event={sender,senderFrame:sender.mainFrame},work:unknown[]=[],canceled:unknown[]=[];let admissions=0
 const evaluate=(body:string,deps:Record<string,unknown>)=>new Function(...Object.keys(deps),transformSync('return '+body,{loader:'ts'}).code)(...Object.values(deps)),trusted=evaluate(trustedBody,{window})
 const deps={trusted,importActionSchema,window,draftSession:session,closingFlow:null,quitting:false,businessGate:{closed:false,run:async(fn:()=>Promise<unknown>)=>{admissions++;return fn()}},migrationHandoff:null,workLease:null,novelImportRepairing:false,novelImportOwner:null,novelImport:{act:async(action:unknown)=>{work.push(action);return{view:null}},cancelPdfPreview:(...args:unknown[])=>{canceled.push(args);return{view:null}}}},read={type:'read-pdf-page',id:randomUUID(),revision:1,fileId:'source',page:1,requestId:randomUUID()}
 for(const patch of [{draftSession:null},{draftSession:{...session,ready:false}},{draftSession:{...session,owner:8}},{closingFlow:Promise.resolve()},{businessGate:{closed:true}},{migrationHandoff:{pending:true}},{workLease:{pending:true}},{novelImportRepairing:true}])await assert.rejects(evaluate(handler,{...deps,...patch})(event,read))
 await assert.rejects(evaluate(handler,deps)({...event,senderFrame:{url:'shakeink://app/'}},read));assert.equal(work.length,0);assert.equal(admissions,0)
 await evaluate(handler,deps)(event,read);assert.equal(work.length,1);assert.equal(admissions,1)
 await evaluate(handler,deps)(event,{type:'cancel-pdf-preview',id:read.id,requestId:read.requestId});assert.deepEqual(canceled,[[read.id,read.requestId]]);assert.equal(admissions,1)
})

test('NI-PDF05: preview capabilities expire, remain page scoped and respect the bounded LRU',async()=>{
 const client=sourceClient();await isolatedPdf(client,async({controller})=>{
  const view=(await controller.act({type:'current'})).view!,file=view.files[0],first=await command(controller,'read-pdf-page',{fileId:file.id,page:1,requestId:randomUUID()});assert.equal(first.pdfPage!.status,'ready');const token=first.pdfPage!.status==='ready'?first.pdfPage!.previewToken:undefined
  await assert.rejects(command(controller,'set-pdf-page-decisions',{fileId:file.id,ledgerHash:file.pdfInspection!.ledgerHash,changes:[{page:2,decision:'exclude-image',previewToken:token}]}))
  const initialTransfers=client.registry.metrics.transfers
  for(const page of [2,3,1]){const response=await command(controller,'read-pdf-page',{fileId:file.id,page,requestId:randomUUID()});assert.equal(response.pdfPage!.status,'ready');if(page===3&&response.pdfPage!.status==='ready')assert.equal(response.pdfPage!.previewToken,undefined)}
  assert.equal(client.registry.metrics.transfers,initialTransfers+3,'third distinct page evicts the oldest page')
  const state=controller as unknown as {pdfCache:Map<string,{png:Uint8Array}>;pdfTokens:Map<string,unknown>;pdfIssued:Map<string,unknown>};assert.equal(state.pdfCache.size,PDF_LIMITS.cachePages);assert.ok([...state.pdfCache.values()].reduce((n,value)=>n+value.png.byteLength,0)<=PDF_LIMITS.cacheBytes)
  for(let count=0;count<PDF_LIMITS.tokens;count++)await command(controller,'read-pdf-page',{fileId:file.id,page:1,requestId:randomUUID()})
  assert.equal(state.pdfTokens.size,PDF_LIMITS.tokens);assert.equal(state.pdfIssued.size,PDF_LIMITS.tokens)
  await assert.rejects(command(controller,'set-pdf-page-decisions',{fileId:file.id,ledgerHash:file.pdfInspection!.ledgerHash,changes:[{page:1,decision:'exclude-image',previewToken:token}]}))
  const fresh=await command(controller,'read-pdf-page',{fileId:file.id,page:1,requestId:randomUUID()}),freshToken=fresh.pdfPage!.status==='ready'?fresh.pdfPage!.previewToken:undefined,now=Date.now
  try{Date.now=()=>now()+PDF_LIMITS.tokenMs+1;await assert.rejects(command(controller,'set-pdf-page-decisions',{fileId:file.id,ledgerHash:file.pdfInspection!.ledgerHash,changes:[{page:1,decision:'exclude-image',previewToken:freshToken}]}));assert.equal(state.pdfTokens.size,0);assert.equal(state.pdfIssued.size,0)}finally{Date.now=now}
  assert.equal((await controller.act({type:'current'})).view!.files[0].pdfPageDecisions,undefined)
 })
})

test('NI-PDF07: controller sending, retry, conflict and patch actions cannot bypass pending pages',async()=>{
 let sends=0,publishes=0;const client=sourceClient();await isolatedPdf(client,async({controller})=>{
  const view=(await controller.act({type:'current'})).view!,file=view.files[0]
  for(const kind of ['body','excluded']){
   await command(controller,'set-range',{fileId:file.id,start:0,end:file.characters,kind});await command(controller,'select',{selected:kind==='body'?['body']:[],targets:[],infer:false})
   const snapshot=client.registry.metrics.transfers
   for(const [type,extra] of [['classify',{mode:'ai',consent:true}],['classify',{mode:'local',consent:false}],['start',{consent:false}],['resume',{}],['retry',{}],['resolve',{conflictId:'forged',choice:'source'}],['apply-patches',{patchIds:['forged'],confirm:true}]] as const)await assert.rejects(command(controller,type,extra),/PDF|核对/)
   assert.equal(client.registry.metrics.transfers,snapshot);assert.equal(sends,0);assert.equal(publishes,0);assert.equal((await controller.act({type:'current'})).view!.pdfReady,false)
  }
 },true,undefined,undefined,{ai:async()=>{sends++;throw Error('must not send')},publish:async()=>{publishes++;throw Error('must not publish')}})
})

test('NI-PDF07: source replacement after an AI send discards the late response before coverage adoption',async()=>{
 const result=Promise.withResolvers<ImportAiResult>();let sent:ImportAiRequest|undefined,publishes=0;const model={id:'text',name:'Synthetic test model',modelId:'synthetic',endpoint:'https://model.invalid/v1',authRevision:1,contextWindow:16000}
 await isolatedPdf(sourceClient(),async({controller,source})=>{
  await command(controller,'classify',{mode:'ai',consent:true});await until(()=>!!sent);const bytes=await readFile(source);await rename(source,source+'.old');await writeFile(source,bytes)
  result.resolve({classifications:sent!.units.map(unit=>({unitId:unit.id,kind:'character'}))});await until(()=>controller.active===0)
  const view=(await controller.act({type:'current'})).view!,session=(controller as unknown as {session:ImportSession}).session
  assert.equal(view.files[0].pdfSourceInvalidated,true);assert.equal(view.pdfReady,false);assert.equal(session.coverage.classify,undefined);assert.equal(session.classificationGrant,undefined);assert.ok(session.units.every(unit=>unit.kind!=='character'));assert.equal(publishes,0)
 },true,await pdfFixture(['text','text']),()=>result.resolve({classifications:[]}),{models:async()=>({text:model}),ai:async request=>{sent=request;return result.promise},publish:async()=>{publishes++;throw Error('must not publish')}})
})

test('NI-PDF04: source re-selection preserves canceled choices and never inherits a prior page confirmation',async()=>{
 await isolatedPdf(sourceClient(),async({controller,root,source})=>{
  const first=(await controller.act({type:'current'})).view!,file=first.files[0],preview=await command(controller,'read-pdf-page',{fileId:file.id,page:1,requestId:randomUUID()}),token=preview.pdfPage!.status==='ready'?preview.pdfPage!.previewToken:undefined
  await command(controller,'set-pdf-page-decisions',{fileId:file.id,ledgerHash:file.pdfInspection!.ledgerHash,changes:[{page:1,decision:'exclude-image',previewToken:token}]})
  const options=(controller as unknown as {options:{choose:()=>Promise<unknown>}}).options,initialChoose=options.choose
  options.choose=async()=>null;await command(controller,'reselect-source',{fileId:file.id});let view=(await controller.act({type:'current'})).view!;assert.equal(view.files[0].id,file.id);assert.equal(view.files[0].pdfPageDecisions?.[0].decision,'exclude-image')
  options.choose=async()=>[source,source];await assert.rejects(command(controller,'reselect-source',{fileId:file.id}));assert.equal((await controller.act({type:'current'})).view!.files[0].id,file.id)
  const text=join(root,'source.txt');await writeFile(text,'plain text');options.choose=async()=>[text];await assert.rejects(command(controller,'reselect-source',{fileId:file.id}));assert.equal((await controller.act({type:'current'})).view!.files[0].id,file.id)
  const replacement=join(root,'replacement.pdf');await writeFile(replacement,await readFile(source));const grant=await captureNovelSourceGrant(replacement);options.choose=async()=>[grant];await command(controller,'reselect-source',{fileId:file.id});view=(await controller.act({type:'current'})).view!;assert.notEqual(view.files[0].id,file.id);assert.equal(view.files[0].hash,file.hash);assert.equal(view.files[0].pdfPageDecisions,undefined);assert.equal(view.pdfReady,false)
  await assert.rejects(command(controller,'set-pdf-page-decisions',{fileId:view.files[0].id,ledgerHash:view.files[0].pdfInspection!.ledgerHash,changes:[{page:1,decision:'exclude-image',previewToken:token}]}));options.choose=initialChoose
 })
})
