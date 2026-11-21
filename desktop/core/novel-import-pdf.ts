import {createHash} from 'node:crypto'
import {z} from 'zod'
import type {ImportFile,ImportPdfInspection,ImportPdfPageDecision,ImportPdfPageReviewAudit,ImportSession} from '../shared/novel-import'
import {sourceTextDecodingSchema,validatePdfSourceTextDecoding} from './novel-import-pdf-source-text'

function stable(value:unknown):string{if(Array.isArray(value))return '['+value.map(stable).join(',')+']';if(value&&typeof value==='object')return '{'+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,value])=>JSON.stringify(key)+':'+stable(value)).join(',')+'}';return JSON.stringify(value)??'null'}
const hash=(value:unknown)=>createHash('sha256').update(stable(value)).digest('hex')
const hex=z.string().regex(/^[0-9a-f]{64}$/u),integer=z.number().int().nonnegative(),page=z.number().int().min(1).max(5000)
export const pdfProofSchema=z.object({device:z.string().min(1).max(80),inode:z.string().min(1).max(80),size:z.string().min(1).max(80),mtime:z.string().min(1).max(80),ctime:z.string().min(1).max(80).optional()}).strict()
const diagnostic=z.enum(['PDF_IMAGE_DIMENSIONS_INVALID','PDF_IMAGE_DROPPED','PDF_IMAGE_DECODE_FAILED','PDF_REQUIRED_RESOURCE_FAILED','PDF_DIAGNOSTIC_UNCLASSIFIED','PDF_DIAGNOSTIC_OVERFLOW','PDF_BUNDLED_FONT_FALLBACK','PDF_BUDGET','PDF_PAGE_FAILED','PDF_DOCUMENT_FAILED'])
const ledger=z.object({page,start:integer,end:integer,textCharacters:integer,textState:z.enum(['extracted','empty','failed','not-scanned']),raster:z.enum(['present','none','unknown']),errors:z.array(diagnostic).max(128).optional()}).strict()
export const pdfInspectionSchema=z.object({schemaVersion:z.literal(1),sourceHash:hex,proof:pdfProofSchema.nullable(),inspectionId:z.uuid(),extractorVersion:z.literal('pdfjs-6.3.289'),resourceProfileHash:hex,ledgerHash:hex,pageCount:z.number().int().min(1).max(1_000_000).nullable(),scanState:z.enum(['complete','incomplete','document-error']),blocker:z.enum(['ocr-required','page-error','budget','source-changed','document-error']).optional(),pages:z.array(ledger).max(5000),textOnlyPageCount:integer,imagePageCount:integer,totalTextCharacters:integer,sourceTextDecoding:sourceTextDecodingSchema.optional()}).strict()
export const pdfDecisionSchema=z.object({fileId:z.string().min(1).max(160),page,sourceHash:hex,proof:pdfProofSchema,ledgerHash:hex,resourceProfileHash:hex,decision:z.enum(['exclude-image','contains-content','uncertain','pending']),confirmedAt:z.string().datetime(),decisionRevision:integer}).strict()
export const pdfDecisionEventSchema=z.object({fileId:z.string().min(1).max(160),page,sourceHash:hex,ledgerHash:hex,resourceProfileHash:hex,decision:z.enum(['exclude-image','contains-content','uncertain','pending']),action:z.enum(['confirm','revoke','contains-content','uncertain','source-invalidated']),at:z.string().datetime(),decisionRevision:integer}).strict()
const previewFailureSchema=z.object({page,code:z.enum(['render-failed','timeout','budget','resource-missing','source-changed']),at:z.string().datetime()}).strict()
export function pdfInspectionLedgerHash(inspection:Omit<ImportPdfInspection,'ledgerHash'|'proof'>|ImportPdfInspection){const {proof:_proof,ledgerHash:_ledger,...value}=inspection as ImportPdfInspection;return hash(value)}
export function pdfSourceKey(file:ImportFile){return hash({id:file.id,sourceHash:file.hash,proof:file.proof,inspectionId:file.pdfInspection?.inspectionId,ledgerHash:file.pdfInspection?.ledgerHash,resourceProfileHash:file.pdfInspection?.resourceProfileHash})}
const same=(left:unknown,right:unknown)=>stable(left)===stable(right)
export function validatePdfStoredFields(files:ImportFile[],events:ImportSession['pdfPageDecisionEvents']=undefined){
 if(events!==undefined){if(!Array.isArray(events)||events.length>1_000_000)throw Error('PDF决定历史格式无效');for(const event of events)pdfDecisionEventSchema.parse(event)}
 for(const file of files){
  if(file.format!=='pdf'){if(file.pdfInspection!==undefined||file.pdfPageDecisions!==undefined||file.pdfPreviewFailures!==undefined||file.pdfSourceInvalidated!==undefined)throw Error('非PDF来源带有PDF状态');continue}
  if(file.pdfSourceInvalidated!==undefined&&typeof file.pdfSourceInvalidated!=='boolean')throw Error('PDF来源失效状态无效')
  if(file.pdfPreviewFailures!==undefined){if(!Array.isArray(file.pdfPreviewFailures)||file.pdfPreviewFailures.length>5000)throw Error('PDF预览状态无效');for(const failure of file.pdfPreviewFailures)previewFailureSchema.parse(failure)}
  if(!file.pdfInspection){if(file.pdfPageDecisions?.length)throw Error('PDF决定缺少检查台账');continue}
  const inspection=pdfInspectionSchema.parse(file.pdfInspection)
  if(inspection.sourceHash!==file.hash||!file.proof||!same(inspection.proof,file.proof)||inspection.ledgerHash!==pdfInspectionLedgerHash(inspection)||inspection.totalTextCharacters!==file.text.length)throw Error('PDF来源与检查台账不一致')
  const known=inspection.pageCount!==null&&inspection.pageCount<=5000
  if(known&&inspection.pages.length!==inspection.pageCount||!known&&inspection.pages.length||inspection.scanState==='complete'&&(!known||inspection.pages.length!==inspection.pageCount))throw Error('PDF页台账不完整')
  let previous=0
  for(const [index,p] of inspection.pages.entries()){
   if(p.page!==index+1||p.start<previous||p.end<p.start||p.end>file.text.length||p.textCharacters!==p.end-p.start||p.textState==='not-scanned'&&p.textCharacters!==0||p.textState==='extracted'&&!file.text.slice(p.start,p.end).trim())throw Error('PDF文字页范围无效')
   if(p.start>previous&&file.text.slice(previous,p.start)!=='\n\n')throw Error('PDF页间文字覆盖无效');previous=p.end
  }
  if(previous!==file.text.length||inspection.textOnlyPageCount!==inspection.pages.filter(p=>p.textState==='extracted'&&p.raster==='none').length||inspection.imagePageCount!==inspection.pages.filter(p=>p.raster==='present').length)throw Error('PDF台账统计不一致')
  if(inspection.sourceTextDecoding!==undefined)validatePdfSourceTextDecoding(inspection.sourceTextDecoding,file.hash,file.text,inspection.pages)
  if(file.pdfPageDecisions!==undefined){if(!Array.isArray(file.pdfPageDecisions)||file.pdfPageDecisions.length>5000||new Set(file.pdfPageDecisions.map(d=>d.page)).size!==file.pdfPageDecisions.length)throw Error('PDF页决定无效');for(const decision of file.pdfPageDecisions){pdfDecisionSchema.parse(decision);if(!pdfDecisionBound(file,decision))throw Error('PDF页决定与来源不一致')}}
 }
}
export function pdfDecisionBound(file:ImportFile,decision:ImportPdfPageDecision){const inspection=file.pdfInspection;return !!inspection&&decision.fileId===file.id&&decision.sourceHash===file.hash&&same(decision.proof,file.proof)&&decision.ledgerHash===inspection.ledgerHash&&decision.resourceProfileHash===inspection.resourceProfileHash&&inspection.pages.some(page=>page.page===decision.page&&page.raster==='present')}
export function validatePdfPageReviews(files:ImportFile[]){
 const included=files.filter(file=>file.included&&file.format==='pdf');validatePdfStoredFields(included)
 for(const file of included){
  const inspection=file.pdfInspection
  if(!inspection)throw Error('PDF尚未完成逐页检查')
  if(file.pdfSourceInvalidated)throw Error('PDF来源已变化，请重新选择')
  if(file.pdfPreviewFailures?.length)throw Error('PDF页面预览失败，请重试后重新核对')
  if(inspection.scanState!=='complete'||inspection.pageCount===null||inspection.blocker||!inspection.textOnlyPageCount||!file.text.trim()||inspection.pages.some(page=>page.raster==='unknown'||page.textState==='failed'||page.textState==='not-scanned'||page.textState==='empty'&&page.raster==='none'||page.errors?.some(code=>code!=='PDF_BUNDLED_FONT_FALLBACK')))throw Error(inspection.blocker==='ocr-required'?'PDF需要OCR后重新导入':'PDF存在未完成或失败的页面，不能继续')
  for(const page of inspection.pages.filter(page=>page.raster==='present'))if(!file.pdfPageDecisions?.some(decision=>decision.page===page.page&&decision.decision==='exclude-image'&&pdfDecisionBound(file,decision)))throw Error('PDF图像页尚未逐页确认')
 }
}
export function pdfReviewsReady(files:ImportFile[]){try{validatePdfPageReviews(files);return true}catch{return false}}
export function pdfPendingPages(file:ImportFile){return file.pdfInspection?.pages.filter(page=>page.raster==='present'&&(file.pdfSourceInvalidated||file.pdfPreviewFailures?.some(failure=>failure.page===page.page)||!file.pdfPageDecisions?.some(decision=>decision.page===page.page&&decision.decision==='exclude-image'&&pdfDecisionBound(file,decision)))).length??0}
export function pdfReviewScope(files:ImportFile[]){
 const reviews=files.filter(file=>file.included&&file.format==='pdf'&&file.pdfInspection&&(file.pdfInspection.imagePageCount||file.pdfInspection.blocker||file.pdfPageDecisions?.length||file.pdfInspection.sourceTextDecoding)).map(file=>({fileId:file.id,sourceHash:file.hash,proof:file.proof,ledgerHash:file.pdfInspection!.ledgerHash,resourceProfileHash:file.pdfInspection!.resourceProfileHash,...(file.pdfInspection!.sourceTextDecoding?{sourceTextDecoding:structuredClone(file.pdfInspection!.sourceTextDecoding)}:{}),decisions:(file.pdfPageDecisions??[]).map(({page,decision})=>({page,decision})).sort((a,b)=>a.page-b.page)}))
 return reviews.length?reviews:undefined
}
export function pdfReviewAudit(session:ImportSession):ImportPdfPageReviewAudit|undefined{
 const files=session.files.filter(file=>file.included&&file.format==='pdf'&&(file.pdfInspection?.imagePageCount||file.pdfInspection?.sourceTextDecoding))
 if(!files.length)return undefined
 return {schemaVersion:1,files:files.map(file=>({fileId:file.id,name:file.name,format:'pdf',sourceHash:file.hash,proof:structuredClone(file.proof!),pageCount:file.pdfInspection!.pageCount!,ledgerHash:file.pdfInspection!.ledgerHash,resourceProfileHash:file.pdfInspection!.resourceProfileHash,...(file.pdfInspection!.sourceTextDecoding?{sourceTextDecoding:structuredClone(file.pdfInspection!.sourceTextDecoding)}:{}),pages:file.pdfInspection!.pages.map(page=>({...page,textHash:hash(file.text.slice(page.start,page.end)),...((file.pdfPageDecisions??[]).find(decision=>decision.page===page.page&&decision.decision==='exclude-image')?{decision:'exclude-image' as const,confirmedAt:file.pdfPageDecisions!.find(decision=>decision.page===page.page)!.confirmedAt}:{})})),events:structuredClone(session.pdfPageDecisionEvents?.filter(event=>event.fileId===file.id)??[]),note:file.pdfInspection!.imagePageCount?'图像未导入；该页提取文字保留；无OCR':'文字已按源编码核对；无OCR'})),...(session.pdfPageDecisionEvents?.length?{events:structuredClone(session.pdfPageDecisionEvents)}:{})}
}
