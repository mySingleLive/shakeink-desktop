import React from 'react'
import {createRoot} from 'react-dom/client'
import {flushSync} from 'react-dom'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
import {NovelImportDialog} from '../../src/components/desktop/NovelImportDialog'
import {NovelImportRecord} from '../../src/components/desktop/NovelImportRecord'
import {requestNovelImport,useNovelImportStore} from '../../src/lib/desktop/novel-import'
import {IMPORT_KINDS,IMPORT_TARGETS,type ImportAction,type ImportFileView,type ImportPdfInspectionView,type ImportPdfPageResponse,type ImportResponse,type ImportView} from '../../desktop/shared/novel-import'

// Synthetic metadata/PNG bridge for real React only, never PDF/native/AI acceptance.
type Options={saved?:boolean;scan?:boolean;fail?:boolean;decodeFailure?:boolean;deferred?:boolean;deferredDecode?:boolean;onePage?:boolean}
declare global{interface Window{mountPdfPages(options?:Options):void;pdfPagesFixture:any}}
window.mountPdfPages=(options={})=>{
 // The main process never restores an unsaved draft at startup.
 let chosen=false
 if(!crypto.randomUUID)Object.defineProperty(crypto,'randomUUID',{value:()=>{const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const hex=[...bytes].map(byte=>byte.toString(16).padStart(2,'0')).join('');return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`}})
 const id='51000000-0000-4000-8000-000000000001',fileId='pdf-file-1',hex=(letter:string)=>letter.repeat(64)
 let revision=1,failed=!!options.fail,deferred=!!options.deferred,decodeFailures=options.decodeFailure?1:0,saves=0,reports=0
 const ledger:ImportPdfInspectionView={schemaVersion:1,sourceHash:hex('a'),inspectionId:'51000000-0000-4000-8000-000000000002',extractorVersion:'fixture',resourceProfileHash:hex('b'),ledgerHash:hex('c'),sourceKey:hex('d'),pageCount:4,scanState:'complete',textOnlyPageCount:options.scan?0:2,imagePageCount:options.onePage?1:2,totalTextCharacters:options.scan?0:120,pages:[{page:1,start:0,end:0,textCharacters:0,textState:'empty',raster:'present'},{page:2,start:0,end:60,textCharacters:60,textState:'extracted',raster:'none'},{page:3,start:60,end:80,textCharacters:20,textState:'extracted',raster:options.onePage?'none':'present'},{page:4,start:80,end:120,textCharacters:40,textState:'extracted',raster:'none'}],...(options.scan?{blocker:'ocr-required' as const}:{})}
 if(options.onePage)ledger.textOnlyPageCount=3
 if(options.scan)Object.assign(ledger,{pageCount:1,textOnlyPageCount:0,imagePageCount:1,totalTextCharacters:0,pages:[{page:1,start:0,end:0,textCharacters:0,textState:'empty',raster:'present'}]})
 let file:ImportFileView={id:fileId,name:'合成图像页.pdf',format:'pdf',bytes:1000,hash:hex('a'),included:true,characters:ledger.totalTextCharacters,unitCount:options.scan?0:1,unknownCount:0,pdfInspection:ledger,...(options.saved?{pdfPageDecisions:[{page:1,decision:'exclude-image' as const,confirmedAt:'2026-10-26T00:00:00.000Z',decisionRevision:1},...(!options.onePage?[{page:3,decision:'exclude-image' as const,confirmedAt:'2026-10-26T00:00:00.000Z',decisionRevision:1}]:[])]}:{})}
 let view:ImportView={id,revision,phase:'source',title:'合成页核对',files:[file],found:Object.fromEntries(IMPORT_KINDS.map(kind=>[kind,kind==='body'&&!options.scan?1:0])) as ImportView['found'],selected:['body'],targets:[...IMPORT_TARGETS],infer:true,steps:[],conflicts:[],patches:[],models:{},targetReady:false,sourceReady:false,chapters:options.scan?[]:[{id:'chapter',title:'正文',start:0,end:120}],notFound:[],modified:false}
 const calls:ImportAction[]=[],listeners=new Set<(event:unknown)=>void>(),pending=new Map<string,()=>void>(),pendingDecodes=new Set<()=>void>(),issued=new Map<string,{page:number;requestRevision:number;issuedRevision:number;key:string;ledgerHash:string}>(),tokens=new Map<string,{page:number;revision:number;key:string}>(),created:string[]=[],revoked:string[]=[]
 const nativeCreate=URL.createObjectURL.bind(URL),nativeRevoke=URL.revokeObjectURL.bind(URL)
 URL.createObjectURL=blob=>{const url=nativeCreate(blob);created.push(url);return url};URL.revokeObjectURL=url=>{revoked.push(url);nativeRevoke(url)}
 const nativeDecode=HTMLImageElement.prototype.decode
 HTMLImageElement.prototype.decode=function(){if(options.deferredDecode)return new Promise<void>((_resolve,reject)=>{const finish=()=>{pendingDecodes.delete(finish);reject(Error('controlled deferred decode failure'))};pendingDecodes.add(finish)});if(decodeFailures>0){decodeFailures--;return Promise.reject(Error('controlled decode failure'))}return nativeDecode.call(this)}
 const copy=()=>structuredClone(view)
 const sync=()=>{const images=file.pdfInspection!.pages.filter(page=>page.raster==='present'),confirmed=images.filter(page=>file.pdfPageDecisions?.some(decision=>decision.page===page.page&&decision.decision==='exclude-image')).length;file.pdfPendingPages=images.length-confirmed;file.pdfReady=!file.pdfSourceInvalidated&&!file.pdfInspection!.blocker&&!file.pdfPreviewFailures?.length&&!file.pdfPendingPages;view={...view,revision,files:[file],pdfReady:!file.included||file.pdfReady,pdfPendingPages:file.included?file.pdfPendingPages:0,sourceReady:file.included&&!!file.pdfReady}}
 const emit=()=>{sync();listeners.forEach(listener=>listener({type:'novel-import',view:copy()}))}
 const pngPromise=(async()=>{const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=1680;const context=canvas.getContext('2d')!;context.fillStyle='white';context.fillRect(0,0,1200,1680);context.fillStyle='black';context.font='30px sans-serif';for(let row=0;row<30;row++)context.fillText('合成页可读文字 · PDF page review '+row,60,90+row*42);const blob=await new Promise<Blob>(resolve=>canvas.toBlob(value=>resolve(value!),'image/png'));return new Uint8Array(await blob.arrayBuffer())})()
 const response=async(action:Extract<ImportAction,{type:'read-pdf-page'}>):Promise<ImportResponse>=>{
  const common={id:action.id,requestId:action.requestId,requestRevision:action.revision,fileId:action.fileId,page:action.page,ledgerHash:file.pdfInspection!.ledgerHash}
  if(failed){if(!file.pdfPreviewFailures?.some(item=>item.page===action.page)){file.pdfPreviewFailures=[...(file.pdfPreviewFailures??[]),{page:action.page,code:'render-failed',at:'2026-10-26T00:00:00.000Z'}];revision++;emit()}return {view:copy(),pdfPage:{...common,status:'failed',code:'render-failed'}}}
  if(file.pdfPreviewFailures?.some(item=>item.page===action.page)){file.pdfPreviewFailures=file.pdfPreviewFailures.filter(item=>item.page!==action.page);revision++;emit()}
  const previewToken=crypto.randomUUID();tokens.set(previewToken,{page:action.page,revision,key:file.pdfInspection!.sourceKey})
  issued.set(action.requestId,{page:action.page,requestRevision:action.revision,issuedRevision:revision,key:file.pdfInspection!.sourceKey,ledgerHash:file.pdfInspection!.ledgerHash})
  const page:ImportPdfPageResponse={...common,status:'ready',mime:'image/png',png:await pngPromise,width:1200,height:1680,pageWidth:600,pageHeight:840,...(!options.scan?{previewToken}:{})}
  return {view:copy(),pdfPage:page}
 }
 const bridge=async(action:ImportAction):Promise<ImportResponse>=>{
  calls.push(structuredClone(action));if(action.type==='choose')chosen=true;if(action.type==='current'&&!chosen)return {view:null};if(action.type==='current'||action.type==='choose'){sync();return {view:copy()}}
  if(action.type==='cancel-pdf-preview')return {view:copy()}
  if(action.type==='report-pdf-preview-failure'){const request=issued.get(action.requestId);if(action.id!==view.id||action.fileId!==file.id||!request||request.page!==action.page||request.key!==file.pdfInspection!.sourceKey||request.ledgerHash!==file.pdfInspection!.ledgerHash||![request.requestRevision,request.issuedRevision].includes(action.revision))throw Error('预览已过期');reports++;if(!file.pdfPreviewFailures?.some(item=>item.page===action.page)){file.pdfPreviewFailures=[...(file.pdfPreviewFailures??[]),{page:action.page,code:'render-failed',at:'2026-10-26T00:00:00.000Z'}];revision++;emit()}return {view:copy()}}
  if('revision'in action&&(action.id!==view.id||action.revision!==revision))throw Error('导入版本已变化，请重新核对。')
  if(action.type==='read-pdf-page'){const result=await response(action);if(deferred)return new Promise(resolve=>pending.set(action.requestId,()=>resolve(result)));return result}
  if(action.type==='set-pdf-page-decisions'){
   for(const change of action.changes)if(change.decision==='exclude-image'){const token=tokens.get(change.previewToken);if(!token||token.page!==change.page||token.revision!==revision||token.key!==file.pdfInspection!.sourceKey)throw Error('预览确认已过期')}
   const saved=new Map(file.pdfPageDecisions?.map(decision=>[decision.page,decision])??[])
   for(const change of action.changes)saved.set(change.page,{page:change.page,decision:change.decision,confirmedAt:'2026-10-26T00:00:00.000Z',decisionRevision:revision+1})
   file.pdfPageDecisions=[...saved.values()];saves++;revision++;emit();return {view:copy()}
  }
  if(action.type==='cancel'){view.phase='paused';revision++;emit();return {view:copy()}}
  if(action.type==='include'){file.included=action.included;revision++;emit();return {view:copy()}}
  if(action.type==='reselect-source'){file={...file,id:'pdf-file-'+(++revision),pdfInspection:{...file.pdfInspection!,sourceKey:hex('e'),ledgerHash:hex('f')},pdfPageDecisions:undefined,pdfPreviewFailures:undefined,pdfSourceInvalidated:false};emit();return {view:copy()}}
  return {view:copy()}
 }
 ;(window as any).desktop={novelImport:bridge,subscribe:(listener:(event:unknown)=>void)=>{listeners.add(listener);return()=>listeners.delete(listener)}}
 window.fetch=async()=>new Response(JSON.stringify({record:{id:'audit',title:'合成页核对',createdAt:'2026-10-26',sourceKinds:['body'],targets:[],modified:false,summary:{},materials:[],decisions:[],pdfPageReview:{schemaVersion:1,files:[{fileId:file.id,name:file.name,format:'pdf',sourceHash:file.hash,pageCount:4,ledgerHash:ledger.ledgerHash,resourceProfileHash:ledger.resourceProfileHash,pages:[{...ledger.pages[0],textHash:hex('a'),decision:'exclude-image',confirmedAt:'2026-10-26T00:00:00.000Z'}],events:[{fileId:file.id,page:1,sourceHash:file.hash,ledgerHash:ledger.ledgerHash,resourceProfileHash:ledger.resourceProfileHash,decision:'exclude-image',action:'confirm',at:'2026-10-26T00:00:00.000Z',decisionRevision:1}],note:'图像未导入；该页提取文字保留；无OCR'}]}}}),{headers:{'content-type':'application/json'}})
 const query=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity}}});query.setQueryData(['novels'],{novels:[]})
 useNovelImportStore.setState({view:null,open:false,screen:'source',busy:0,error:null,source:null});sync()
 const root=createRoot(document.getElementById('app')!)
 window.pdfPagesFixture={calls,state:()=>useNovelImportStore.getState(),file:()=>structuredClone(file),saves:()=>saves,reports:()=>reports,urls:()=>({created:[...created],revoked:[...revoked]}),setFailure:(value:boolean)=>{failed=value},setDeferred:(value:boolean)=>{deferred=value},release:()=>{for(const finish of pending.values())finish();pending.clear()},decodeNext:()=>{decodeFailures=1},pendingDecodes:()=>pendingDecodes.size,rejectDecode:()=>{for(const finish of [...pendingDecodes])finish()},change:()=>{revision++;file.pdfSourceInvalidated=true;file.pdfInspection={...file.pdfInspection!,sourceKey:hex('e')};file.pdfPageDecisions=undefined;emit()},bump:()=>{revision++;emit()},busy:(value:number)=>useNovelImportStore.setState({busy:value}),unmount:()=>root.unmount()}
 flushSync(()=>root.render(<QueryClientProvider client={query}><button onClick={()=>void requestNovelImport()}>导入作品</button><NovelImportDialog/><NovelImportRecord novelId="synthetic-pdf"/></QueryClientProvider>))
}
