import {Worker} from 'node:worker_threads'
import {existsSync} from 'node:fs'
import {createRequire} from 'node:module'
import {dirname,join,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash,randomUUID} from 'node:crypto'
import type {ImportFile,ImportPdfInspection,ImportPdfPageLedger,PdfPageError} from '../shared/novel-import'
import {pdfInspectionLedgerHash} from '../core/novel-import-pdf'
import {PDF_RESOURCE_PROFILE_HASH} from './novel-import-pdf-resources'

export const PDF_LIMITS=Object.freeze({fileBytes:50*1024*1024,scratchBytes:64*1024,pages:5000,characters:25_000_000,pixels:4_000_000,longEdge:4096,pngBytes:8*1024*1024,pageOperators:100_000,totalOperators:2_000_000,previewMs:15_000,inspectMs:120_000,cachePages:2,cacheBytes:16*1024*1024,tokens:100,tokenMs:600_000})
export class PdfJobError extends Error {constructor(readonly code:PdfPageError|'busy',message=code==='busy'?'PDF处理繁忙，请稍后重试':'PDF处理失败，请重试或转换来源'){super(message)}}
export interface PdfJobContext {
 signal:AbortSignal
 check():void
 track(resource:Promise<unknown>):void
 reserveSource(bytes:number):void
 releaseSource():void
 transferred():void
 sourceRead?(phase:'snapshot'|'verify',read:()=>Promise<{bytesRead:number}>):Promise<{bytesRead:number}>
}
interface Job<T=unknown> {operationId:string;assertCurrent():void;timeoutMs:number;work(context:PdfJobContext):Promise<T>;result:ReturnType<typeof Promise.withResolvers<T>>;abort:AbortController;timer?:ReturnType<typeof setTimeout>;settled:ReturnType<typeof Promise.withResolvers<void>>;started:boolean;ended:boolean}
const aborted=()=>new DOMException('PDF来源检查已取消','AbortError')
/** Admission precedes all source FS. Public cancellation never forgets real IO. */
export class PdfJobRegistry {
 private running:Job|null=null
 private queued:Job|null=null
 private jobs=new Set<Job>()
 private accepting=true
 readonly metrics={sourceBytes:0,peakSourceBytes:0,allocations:0,transfers:0,releases:0,started:0}
 get active(){return this.jobs.size}
 get closed(){return !this.accepting}
 run<T>(options:{operationId:string;timeoutMs:number;assertCurrent():void},work:(context:PdfJobContext)=>Promise<T>):Promise<T>{
  if(!this.accepting)return Promise.reject(aborted())
  if(this.running&&this.queued)return Promise.reject(new PdfJobError('busy'))
  try{options.assertCurrent()}catch(error){return Promise.reject(error)}
  const job:Job<T>={...options,work,result:Promise.withResolvers<T>(),abort:new AbortController(),settled:Promise.withResolvers<void>(),started:false,ended:false}
  this.jobs.add(job as Job)
  if(this.running){this.queued=job as Job;job.timer=setTimeout(()=>this.cancelJob(job as Job,new PdfJobError('timeout')),job.timeoutMs)}else this.start(job as Job)
  return job.result.promise
 }
 private cancelJob(job:Job,error:Error){
  if(job.ended)return
  job.abort.abort();job.result.reject(error)
  if(!job.started){if(job.timer)clearTimeout(job.timer);if(this.queued===job)this.queued=null;job.ended=true;this.jobs.delete(job);job.settled.resolve()}
 }
 cancel(operationId:string){for(const job of this.jobs)if(job.operationId===operationId)this.cancelJob(job,aborted())}
 cancelAll(){this.accepting=false;for(const job of [...this.jobs])this.cancelJob(job,aborted())}
 async drain(){await Promise.all([...this.jobs].map(job=>job.settled.promise))}
 reopen(){if(this.active)throw Error('PDF工作尚未实际结束');this.accepting=true}
 private start(job:Job){
  this.running=job;job.started=true;if(job.timer)clearTimeout(job.timer);this.metrics.started++
  const resources:Promise<unknown>[]=[];let source=0
  const context:PdfJobContext={signal:job.abort.signal,check:()=>{if(job.abort.signal.aborted)throw aborted();job.assertCurrent()},track:resource=>{resources.push(resource)},reserveSource:bytes=>{if(bytes<0||source||bytes>PDF_LIMITS.fileBytes)throw new PdfJobError('budget');source=bytes;this.metrics.sourceBytes=bytes;this.metrics.peakSourceBytes=Math.max(this.metrics.peakSourceBytes,bytes);this.metrics.allocations++},releaseSource:()=>{if(source){source=0;this.metrics.sourceBytes=0;this.metrics.releases++}},transferred:()=>{this.metrics.transfers++}}
  job.timer=setTimeout(()=>this.cancelJob(job,new PdfJobError('timeout')),job.timeoutMs)
  void (async()=>{
   try{context.check();const result=await job.work(context);await Promise.allSettled(resources);context.check();job.result.resolve(result)}
   catch(error){job.result.reject(error instanceof Error?error:new PdfJobError('render-failed'))}
   finally{await Promise.allSettled(resources);context.releaseSource();if(job.timer)clearTimeout(job.timer);job.ended=true;this.jobs.delete(job);if(this.running===job)this.running=null;job.settled.resolve();const next=this.queued;if(next&&this.accepting){this.queued=null;try{next.assertCurrent();this.start(next)}catch{this.cancelJob(next,aborted())}}}
  })()
 }
}

export interface PdfExtraction {text:string;pages:{page:number;start:number;end:number}[];parts:{name:string;start:number;end:number;kind:'body'}[];pdfInspection:ImportPdfInspection}
export interface PdfBitmap {png:Uint8Array;width:number;height:number;pageWidth:number;pageHeight:number;resourceProfileHash:string}
export interface PdfProgress {pageCount:number;page?:ImportPdfPageLedger;text?:string;resourceProfileHash:string}
interface ClientOptions {appRoot?:string;workerPath?:string;workerFactory?:typeof Worker;beforeRead?():Promise<void>;afterRead?():Promise<void>;sourceRead?:PdfJobContext['sourceRead'];inspectTimeoutMs?:number;previewTimeoutMs?:number}
type SourceMetadata={hash:string;proof:import('../shared/novel-import').ImportProof;ancestors:NonNullable<ImportFile['ancestors']>}
type InspectedSource=SourceMetadata&{extracted:PdfExtraction}
export function pdfWorkerEnvironment(){const environment:NodeJS.ProcessEnv={NODE_ENV:process.env.NODE_ENV??'production',DISABLE_SYSTEM_FONTS_LOAD:'1'};for(const key of ['PATH','SystemRoot','WINDIR','TEMP','TMP','TMPDIR','HOME','USERPROFILE','LOCALAPPDATA','APPDATA'])if(process.env[key]!==undefined)environment[key]=process.env[key];return environment}
function partialInspection(sourceHash:string,progress:PdfProgress[],code:PdfPageError):PdfExtraction {
 let text='';const seen=new Map(progress.flatMap(value=>value.page?[[value.page.page,value] as const]:[])),pageCount=progress.at(-1)?.pageCount??null,pages:ImportPdfPageLedger[]=[]
 for(let page=1;page<=(pageCount!==null&&pageCount<=PDF_LIMITS.pages?pageCount:0);page++){const value=seen.get(page);let start=text.length;if(value?.text){if(text)text+='\n\n';start=text.length;text+=value.text}pages.push({page,start,end:text.length,textCharacters:value?.text?.length??0,textState:value?.page?.textState??'not-scanned',raster:'unknown',errors:[code==='timeout'||code==='budget'?'PDF_BUDGET':'PDF_PAGE_FAILED']})}
 const base={schemaVersion:1 as const,sourceHash,inspectionId:randomUUID(),extractorVersion:'pdfjs-6.3.289' as const,resourceProfileHash:progress.at(-1)?.resourceProfileHash??PDF_RESOURCE_PROFILE_HASH,pageCount,scanState:pageCount===null?'document-error' as const:'incomplete' as const,blocker:pageCount===null?'document-error' as const:'budget' as const,pages,textOnlyPageCount:0,imagePageCount:0,totalTextCharacters:text.length}
 return {text,pages:pages.map(({page,start,end})=>({page,start,end})),parts:[{name:'PDF 正文',start:0,end:text.length,kind:'body'}],pdfInspection:{...base,proof:null,ledgerHash:pdfInspectionLedgerHash(base)}}
}
export class NovelImportPdfClient {
 readonly registry:PdfJobRegistry
 readonly appRoot:string
 private workerPath:string
 constructor(private options:ClientOptions={},registry=new PdfJobRegistry()){
  this.registry=registry;this.appRoot=options.appRoot??resolve(dirname(fileURLToPath(import.meta.url)),'../..')
  this.workerPath=options.workerPath??join(this.appRoot,'dist/main/novel-import-pdf-worker.cjs')
  if(!existsSync(this.workerPath)&&existsSync(join(this.appRoot,'desktop/main/novel-import-pdf-worker.ts')))this.workerPath=join(this.appRoot,'desktop/main/novel-import-pdf-worker.ts')
 }
 get active(){return this.registry.active}
 cancelAll(){this.registry.cancelAll()}
 drain(){return this.registry.drain()}
 reopen(){this.registry.reopen()}
 cancel(operationId:string){this.registry.cancel(operationId)}
 async worker<T>(context:PdfJobContext,bytes:Uint8Array,task:{type:'inspect'|'preview';page?:number;sourceTextPolicy?:'current'|'legacy'},progress?:(value:PdfProgress)=>void):Promise<T>{
  context.check();if(!existsSync(this.workerPath))throw new PdfJobError('resource-missing')
  const require=createRequire(import.meta.url),worker=new (this.options.workerFactory??Worker)(this.workerPath,{env:pdfWorkerEnvironment(),resourceLimits:{maxOldGenerationSizeMb:256},stdout:true,stderr:true,...(this.workerPath.endsWith('.ts')?{execArgv:['--import',require.resolve('tsx')]}:{})})
  const done=Promise.withResolvers<T>(),exit=Promise.withResolvers<void>(),diagnosticSeal=new Int32Array(new SharedArrayBuffer(4));context.track(exit.promise)
  let candidate:T|undefined,failed=false,progressMessages=0
  const fail=(code:PdfPageError='render-failed')=>{if(failed)return;failed=true;done.reject(new PdfJobError(code));void worker.terminate()}
  worker.stdout?.on('data',()=>fail());worker.stderr?.on('data',()=>fail())
  worker.on('error',()=>fail());worker.on('exit',code=>{exit.resolve();if(!failed){if(code!==0||candidate===undefined||Atomics.load(diagnosticSeal,0)!==0)fail();else done.resolve(candidate)}})
  worker.on('message',(message:unknown)=>{
   if(!message||typeof message!=='object')return fail()
   const m=message as {type?:string;value?:unknown;code?:PdfPageError}
   if(m.type==='progress'){if(context.signal.aborted)return;if(progress&&m.value&&typeof m.value==='object'){const value=m.value as PdfProgress;if(++progressMessages>PDF_LIMITS.pages+1||!Number.isInteger(value.pageCount)||value.pageCount<1||value.pageCount>1_000_000||typeof value.resourceProfileHash!=='string'||!/^[0-9a-f]{64}$/u.test(value.resourceProfileHash))return fail();if(value.page!==undefined?(!Number.isInteger(value.page.page)||value.page.page<1||value.page.page>Math.min(value.pageCount,PDF_LIMITS.pages)||typeof value.text!=='string'||value.text.length>PDF_LIMITS.characters):value.text!==undefined)return fail();progress(value)}return}
   if(m.type==='result'){candidate=m.value as T;return}
   if(m.type==='failed'){fail(['budget','resource-missing','timeout'].includes(m.code??'')?m.code:'render-failed');return}
   fail()
  })
  const cancel=()=>fail();context.signal.addEventListener('abort',cancel,{once:true})
  try{context.check();worker.postMessage({task,bytes,appRoot:this.appRoot,diagnosticSeal:diagnosticSeal.buffer},[bytes.buffer as ArrayBuffer]);context.transferred();const result=await done.promise;context.check();return result}finally{context.signal.removeEventListener('abort',cancel);await worker.terminate().catch(()=>undefined);await exit.promise}
 }
 inspectBytes(bytes:Uint8Array,options:{sourceTextPolicy?:'current'|'legacy'}={}):Promise<PdfExtraction>{
  const progress:PdfProgress[]=[],hash=createHash('sha256').update(bytes).digest('hex')
  return this.registry.run({operationId:randomUUID(),timeoutMs:Math.max(1,Math.min(PDF_LIMITS.inspectMs,this.options.inspectTimeoutMs??PDF_LIMITS.inspectMs)),assertCurrent:()=>{}},async context=>{context.reserveSource(bytes.byteLength);const input=new Uint8Array(new ArrayBuffer(bytes.byteLength));input.set(bytes);return this.worker<PdfExtraction>(context,input,{type:'inspect',sourceTextPolicy:options.sourceTextPolicy??'current'},value=>{progress.push(value)})}).catch(error=>{if(error instanceof PdfJobError&&error.code!=='busy')return partialInspection(hash,progress,error.code);throw error})
 }
 inspect(source:import('./novel-import-files').PdfSourceIdentity,options:{operationId:string;assertCurrent():void;sourceTextPolicy?:'current'|'legacy'}):Promise<{extracted:PdfExtraction;proof:import('../shared/novel-import').ImportProof;ancestors:NonNullable<ImportFile['ancestors']>;hash:string}>{
  const progress:PdfProgress[]=[];let metadata:SourceMetadata|undefined
  return this.registry.run({...options,timeoutMs:Math.max(1,Math.min(PDF_LIMITS.inspectMs,this.options.inspectTimeoutMs??PDF_LIMITS.inspectMs))},async context=>{
   await this.options.beforeRead?.();context.check();return this.inspectWithin(source,context,value=>progress.push(value),value=>{metadata=value},options.sourceTextPolicy??'current')
  }).catch(error=>{if(error instanceof PdfJobError&&error.code!=='busy'&&error.code!=='source-changed'&&metadata){options.assertCurrent();const extracted=partialInspection(metadata.hash,progress,error.code);extracted.pdfInspection.proof=metadata.proof;return {extracted,...metadata}}throw error})
 }
 /** Scanner metadata preparation and reading are one admitted job, never nested jobs. */
 inspectSelected(selection:import('./novel-import-files').PdfSourceSelection,options:{operationId:string;assertCurrent():void}):Promise<({kind:'file';path:string}&InspectedSource)|import('./novel-import-files').PreparedPdfDirectory>{
  const progress:PdfProgress[]=[];let metadata:(SourceMetadata&{path:string})|undefined
  return this.registry.run({...options,timeoutMs:Math.max(1,Math.min(PDF_LIMITS.inspectMs,this.options.inspectTimeoutMs??PDF_LIMITS.inspectMs))},async context=>{
   await this.options.beforeRead?.();context.check();const {prepareNovelPdfSource,verifyNovelPdfSelection}=await import('./novel-import-files'),prepared=await prepareNovelPdfSource(selection,context)
   if(prepared.kind==='directory')return prepared
   const inspected=await this.inspectWithin(prepared.source,context,value=>progress.push(value),value=>{metadata={...value,path:prepared.source.path}})
   await verifyNovelPdfSelection(selection,context);context.check();return {kind:'file' as const,path:prepared.source.path,...inspected}
  }).catch(error=>{if(error instanceof PdfJobError&&error.code!=='busy'&&error.code!=='source-changed'&&metadata){options.assertCurrent();const extracted=partialInspection(metadata.hash,progress,error.code);extracted.pdfInspection.proof=metadata.proof;return {kind:'file' as const,extracted,...metadata}}throw error})
 }
 private async inspectWithin(source:import('./novel-import-files').PdfSourceIdentity,context:PdfJobContext,progress:(value:PdfProgress)=>void,snapshotReady:(value:SourceMetadata)=>void,sourceTextPolicy:'current'|'legacy'='current'):Promise<InspectedSource>{
  const {readNovelPdfSnapshot,verifyNovelPdfSource}=await import('./novel-import-files'),sourceContext={...context,sourceRead:this.options.sourceRead},snapshot=await readNovelPdfSnapshot(source,sourceContext)
  snapshotReady({hash:snapshot.hash,proof:snapshot.proof,ancestors:snapshot.ancestors});await this.options.afterRead?.();context.check()
  const extracted=await this.worker<PdfExtraction>(context,snapshot.bytes,{type:'inspect',sourceTextPolicy},progress)
  await verifyNovelPdfSource({...source,proof:snapshot.proof,ancestors:snapshot.ancestors,hash:snapshot.hash},sourceContext);context.check()
  if(extracted.pdfInspection.sourceHash!==snapshot.hash)throw new PdfJobError('source-changed')
  extracted.pdfInspection.proof=snapshot.proof;return {extracted,proof:snapshot.proof,ancestors:snapshot.ancestors,hash:snapshot.hash}
 }
 preview(file:Pick<ImportFile,'path'|'proof'|'ancestors'|'hash'>,page:number,options:{operationId:string;assertCurrent():void},cached?:PdfBitmap):Promise<PdfBitmap>{
  return this.registry.run({...options,timeoutMs:Math.max(1,Math.min(PDF_LIMITS.previewMs,this.options.previewTimeoutMs??PDF_LIMITS.previewMs))},async context=>{
   if(!file.proof||!file.hash||!file.ancestors?.length)throw new PdfJobError('source-changed')
   const source={path:file.path,proof:file.proof,ancestors:file.ancestors,hash:file.hash},{readNovelPdfSnapshot,verifyNovelPdfSource}=await import('./novel-import-files'),sourceContext={...context,sourceRead:this.options.sourceRead}
   if(cached){await verifyNovelPdfSource(source,sourceContext);context.check();return cached}
   await this.options.beforeRead?.();context.check();const snapshot=await readNovelPdfSnapshot(source,sourceContext);await this.options.afterRead?.();context.check()
   const bitmap=await this.worker<PdfBitmap>(context,snapshot.bytes,{type:'preview',page});await verifyNovelPdfSource(source,sourceContext);context.check()
   if(!(bitmap.png instanceof Uint8Array)||bitmap.png.byteLength>PDF_LIMITS.pngBytes||bitmap.png.byteLength<24||!Buffer.from(bitmap.png.subarray(0,8)).equals(Buffer.from([137,80,78,71,13,10,26,10]))||!Number.isInteger(bitmap.width)||!Number.isInteger(bitmap.height)||bitmap.width<1||bitmap.height<1||bitmap.width*bitmap.height>PDF_LIMITS.pixels||bitmap.width>PDF_LIMITS.longEdge||bitmap.height>PDF_LIMITS.longEdge||!Number.isFinite(bitmap.pageWidth)||!Number.isFinite(bitmap.pageHeight)||bitmap.pageWidth<=0||bitmap.pageHeight<=0||!/^[0-9a-f]{64}$/u.test(bitmap.resourceProfileHash))throw new PdfJobError('render-failed')
   const header=Buffer.from(bitmap.png.buffer,bitmap.png.byteOffset,bitmap.png.byteLength);if(header.toString('ascii',12,16)!=='IHDR'||header.readUInt32BE(16)!==bitmap.width||header.readUInt32BE(20)!==bitmap.height)throw new PdfJobError('render-failed')
   return bitmap
  })
 }
 verify(file:Pick<ImportFile,'path'|'proof'|'ancestors'|'hash'>,options:{operationId:string;assertCurrent():void}):Promise<void>{
  return this.registry.run({...options,timeoutMs:PDF_LIMITS.previewMs},async context=>{if(!file.proof||!file.hash||!file.ancestors?.length)throw new PdfJobError('source-changed');const {verifyNovelPdfSource}=await import('./novel-import-files');await this.options.beforeRead?.();context.check();await verifyNovelPdfSource({path:file.path,proof:file.proof,ancestors:file.ancestors,hash:file.hash},{...context,sourceRead:this.options.sourceRead});await this.options.afterRead?.();context.check()})
 }
}
let defaultClient:NovelImportPdfClient|undefined
export function defaultNovelImportPdfClient(){return defaultClient??=new NovelImportPdfClient()}
