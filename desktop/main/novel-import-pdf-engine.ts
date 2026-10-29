import {createCanvas,GlobalFonts} from '@napi-rs/canvas'
import {pathToFileURL} from 'node:url'
import {join} from 'node:path'
import {createHash,randomUUID} from 'node:crypto'
import {loadPdfResources,fontHasGlyph} from './novel-import-pdf-resources'
import {PDF_LIMITS,type PdfExtraction,type PdfBitmap,type PdfProgress} from './novel-import-pdf-client'
import type {PdfDiagnostics} from './novel-import-pdf-diagnostics'
import type {ImportPdfInspection,ImportPdfPageLedger,ImportPdfSourceTextPageProof} from '../shared/novel-import'
import {pdfInspectionLedgerHash} from '../core/novel-import-pdf'
import {preparePdfSourceText,decodePdfSourcePage,SOURCE_TEXT_LIMITS} from './novel-import-pdf-source-text'
import {SOURCE_TEXT_POLICY,sourceTextProofHash} from '../core/novel-import-pdf-source-text'

const digest=(data:Uint8Array|string)=>createHash('sha256').update(data).digest('hex')
export function appendPdfPageText(previousLength:number,current:string,addition:string){if(previousLength+current.length+addition.length+(previousLength&&(current.length||addition.length)?2:0)>PDF_LIMITS.characters)throw Error('PDF_BUDGET');return current+addition}
export function checkedPdfOperatorTotal(total:number,count:number){if(count>PDF_LIMITS.pageOperators||total+count>PDF_LIMITS.totalOperators)throw Error('PDF_BUDGET');return total+count}
class BoundedCanvasFactory {
 create(width:number,height:number){if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||width>PDF_LIMITS.longEdge||height>PDF_LIMITS.longEdge||width*height>PDF_LIMITS.pixels)throw Error('PDF_BUDGET');const canvas=createCanvas(Math.ceil(width),Math.ceil(height));return {canvas,context:canvas.getContext('2d')}}
 reset(target:{canvas:ReturnType<typeof createCanvas>},width:number,height:number){const replacement=this.create(width,height);target.canvas.width=replacement.canvas.width;target.canvas.height=replacement.canvas.height}
 destroy(target:{canvas:ReturnType<typeof createCanvas>|null;context:unknown}){if(target.canvas){target.canvas.width=0;target.canvas.height=0}target.canvas=null;target.context=null}
}
const fontAliases=['Noto Sans SC','serif','sans-serif','monospace','宋体','仿宋_GB2312','楷体_GB2312','黑体','ËÎÌå','·ÂËÎ_GB2312','¿¬Ìå_GB2312','ºÚÌå']
export async function runPdfTask(bytes:Uint8Array,task:{type:'inspect'|'preview';page?:number;sourceTextPolicy?:'current'|'legacy'},appRoot:string,diagnostics:PdfDiagnostics,progress?:(value:PdfProgress)=>void):Promise<PdfExtraction|PdfBitmap>{
 if(bytes.byteLength>PDF_LIMITS.fileBytes)throw Error('PDF_BUDGET')
 const resources=await loadPdfResources(appRoot)
 for(const alias of fontAliases)if(!GlobalFonts.register(resources.font,alias))throw Error('PDF_RESOURCE')
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs')
 pdfjs.GlobalWorkerOptions.workerSrc=pathToFileURL(join(resources.base,'legacy/build/pdf.worker.mjs')).href
 const sourceHash=digest(bytes),inspectionId=randomUUID(),pages:ImportPdfPageLedger[]=[],fallbackFonts=new Set<string>(),glyphCache=new Map<number,boolean>(),sourceProofs:ImportPdfSourceTextPageProof[]=[],sourceBudget={glyphs:0,pages:0,changes:0},sourcePreparation=task.type==='inspect'&&task.sourceTextPolicy!=='legacy'?await preparePdfSourceText(bytes):undefined;let text='',pageCount:number|null=null,operatorsTotal=0,bitmap:PdfBitmap|undefined,documentFailed=false,budgetExhausted=false
 const loading=pdfjs.getDocument({data:bytes,stopAtErrors:true,maxImageSize:PDF_LIMITS.pixels,isImageDecoderSupported:false,isOffscreenCanvasSupported:false,enableXfa:false,useSystemFonts:true,disableFontFace:true,useWorkerFetch:false,cMapPacked:true,cMapUrl:resources.cMapUrl,standardFontDataUrl:resources.standardFontDataUrl,wasmUrl:resources.wasmUrl,verbosity:pdfjs.VerbosityLevel.WARNINGS,CanvasFactory:BoundedCanvasFactory as never})
 const rasterOps=new Set([pdfjs.OPS.paintImageXObject,pdfjs.OPS.paintInlineImageXObject,pdfjs.OPS.paintInlineImageXObjectGroup,pdfjs.OPS.paintImageXObjectRepeat,pdfjs.OPS.paintImageMaskXObject,pdfjs.OPS.paintImageMaskXObjectGroup,pdfjs.OPS.paintImageMaskXObjectRepeat,pdfjs.OPS.paintSolidColorImageMask])
 try{
  const pdf=await loading.promise;pageCount=pdf.numPages
  if(Number.isInteger(pageCount)&&pageCount>0&&pageCount<=1_000_000)progress?.({pageCount,resourceProfileHash:resources.profile})
  if(!Number.isInteger(pageCount)||pageCount<1||pageCount>PDF_LIMITS.pages)throw Error('PDF_BUDGET')
  if(task.type==='preview'&&(!Number.isInteger(task.page)||task.page!<1||task.page!>pageCount))throw Error('PDF_PAGE')
  for(let number=task.type==='preview'?task.page!:1;number<=(task.type==='preview'?task.page!:pageCount);number++){
   diagnostics.page(number);let pageText='',progressText='',raster:ImportPdfPageLedger['raster']='unknown',state:ImportPdfPageLedger['textState']='failed',page:Awaited<ReturnType<typeof pdf.getPage>>|undefined
   try{
    page=await pdf.getPage(number);const operators=await page.getOperatorList();operatorsTotal=checkedPdfOperatorTotal(operatorsTotal,operators.fnArray.length)
    raster=operators.fnArray.some(operation=>rasterOps.has(operation))?'present':'none'
    const content=await page.getTextContent({includeMarkedContent:false,disableNormalization:true})
    for(const item of content.items)if('str' in item)pageText=appendPdfPageText(text.length,pageText,item.str+(item.hasEOL?'\n':' '))
    progressText=pageText
    state=pageText.trim()?'extracted':'empty'
    const fontIds=operators.fnArray.flatMap((operation,index)=>operation===pdfjs.OPS.setFont?[operators.argsArray[index]?.[0]]:[]),common=(page as unknown as {commonObjs:{has(id:string):boolean;get(id:string):{missingFile?:boolean}}}).commonObjs
    const warnedFallback=diagnostics.codes(number).includes('PDF_BUNDLED_FONT_FALLBACK'),fallback=warnedFallback||fontIds.some(id=>fallbackFonts.has(id))
    const unembedded=fontIds.length>0&&fontIds.every(id=>typeof id==='string'&&common.has(id)&&common.get(id)?.missingFile===true)
    const glyphs=!fallback||unembedded&&[...pageText].every(character=>{if(/\s/u.test(character))return true;const point=character.codePointAt(0)!;if(!glyphCache.has(point))glyphCache.set(point,fontHasGlyph(resources.font,point));return glyphCache.get(point)})
    if(warnedFallback&&unembedded&&glyphs)for(const id of fontIds)fallbackFonts.add(id)
    if(fallback&&!warnedFallback)diagnostics.add('PDF_BUNDLED_FONT_FALLBACK')
    if(fallback&&!glyphs)diagnostics.add('PDF_REQUIRED_RESOURCE_FAILED')
    if(task.type==='preview'||raster==='present'||diagnostics.codes(number).length){
     const original=page.getViewport({scale:1});if(!Number.isFinite(original.width)||!Number.isFinite(original.height)||original.width<=0||original.height<=0)throw Error('PDF_BUDGET')
     const scale=Math.min(96/72,PDF_LIMITS.longEdge/Math.max(original.width,original.height),Math.sqrt(PDF_LIMITS.pixels/(original.width*original.height))),viewport=page.getViewport({scale}),factory=new BoundedCanvasFactory(),surface=factory.create(Math.ceil(viewport.width),Math.ceil(viewport.height))
     try{await page.render({canvasContext:surface.context as never,viewport,canvas:surface.canvas as never}).promise;if(task.type==='preview'){const png=surface.canvas.toBuffer('image/png');if(png.byteLength>PDF_LIMITS.pngBytes)throw Error('PDF_BUDGET');bitmap={png:Uint8Array.from(png),width:surface.canvas.width,height:surface.canvas.height,pageWidth:original.width,pageHeight:original.height,resourceProfileHash:resources.profile}}}
     finally{factory.destroy(surface as never)}
    }
    if(sourcePreparation&&!diagnostics.blocked(number,fallback&&glyphs)){
     const decoded=await decodePdfSourcePage({page:number,resource:sourcePreparation.pages[number-1]??{status:sourcePreparation.status==='budget'?'budget':'incomplete',resourceClosureHash:'0'.repeat(64)},operators,ops:pdfjs.OPS,items:content.items.filter((item):item is Extract<typeof item,{str:string}>=>'str'in item),styles:content.styles,fontExists:id=>common.has(id)&&typeof common.get(id)==='object',budget:sourceBudget})
     if(decoded.budgetExceeded)throw Error('PDF_BUDGET')
     if(decoded.blocked)diagnostics.add('PDF_PAGE_FAILED')
     else if(decoded.proof){if(Buffer.byteLength(JSON.stringify([...sourceProofs,decoded.proof]),'utf8')+256>SOURCE_TEXT_LIMITS.proofBytes)throw Error('PDF_BUDGET');pageText=decoded.text;sourceProofs.push(decoded.proof)}
    }
    if(diagnostics.blocked(number,fallback&&glyphs))raster='unknown'
   }catch(error){const budget=error instanceof Error&&error.message==='PDF_BUDGET';if(budget)budgetExhausted=true;diagnostics.add(budget?'PDF_BUDGET':'PDF_PAGE_FAILED');raster='unknown'}
   finally{page?.cleanup();diagnostics.page(null)}
   let start=text.length;if(pageText){if(text)text+='\n\n';start=text.length;text+=pageText}
   const errors=diagnostics.codes(number),ledger:ImportPdfPageLedger={page:number,start,end:text.length,textCharacters:pageText.length,textState:state,raster,...(errors.length?{errors}:{})};pages.push(ledger)
   progress?.({pageCount,page:ledger,text:progressText||pageText,resourceProfileHash:resources.profile})
   if(budgetExhausted)break
  }
 }catch(error){documentFailed=true;diagnostics.add(error instanceof Error&&error.message==='PDF_BUDGET'?'PDF_BUDGET':'PDF_DOCUMENT_FAILED',null)}
 finally{diagnostics.page(null);await loading.destroy().catch(()=>{diagnostics.add('PDF_DOCUMENT_FAILED',null)});diagnostics.seal()}
 if(task.type==='preview'){
  if(documentFailed||diagnostics.documentBlocked||pages.length!==1||pages[0].raster==='unknown'||pages[0].errors?.some(code=>code!=='PDF_BUNDLED_FONT_FALLBACK')||!bitmap)throw Error('PDF_RENDER')
  return bitmap
 }
 const incomplete=documentFailed||budgetExhausted||diagnostics.documentBlocked||pageCount===null||pages.length!==pageCount
 if(pageCount!==null&&pageCount<=PDF_LIMITS.pages)for(let number=pages.length+1;number<=pageCount;number++)pages.push({page:number,start:text.length,end:text.length,textCharacters:0,textState:'not-scanned',raster:'unknown',errors:['PDF_BUDGET']})
 if(diagnostics.documentBlocked)for(const page of pages){page.raster='unknown';page.errors=[...new Set([...(page.errors??[]),...diagnostics.documentCodes()])]}
 if(diagnostics.documentBlocked&&sourceProofs.length){for(const proof of [...sourceProofs].reverse()){const ledger=pages[proof.page-1];for(const offset of [...proof.changedOffsets].reverse()){const at=ledger.start+offset;text=text.slice(0,at)+'\u22ef'+text.slice(at+1)}}sourceProofs.length=0}
 const textOnlyPageCount=pages.filter(page=>page.textState==='extracted'&&page.raster==='none').length,imagePageCount=pages.filter(page=>page.raster==='present').length
 const blocker:ImportPdfInspection['blocker']=incomplete?(pageCount===null?'document-error':'budget'):pages.some(page=>page.raster==='unknown'||page.textState==='failed')?'page-error':!text.trim()||!textOnlyPageCount?'ocr-required':pages.some(page=>page.textState==='empty'&&page.raster==='none')?'page-error':undefined
 const sourceTextDecoding=sourceProofs.length?{policy:SOURCE_TEXT_POLICY,sourceHash,pages:sourceProofs,proofHash:sourceTextProofHash({policy:SOURCE_TEXT_POLICY,sourceHash,pages:sourceProofs})}:undefined
 const base={schemaVersion:1 as const,sourceHash,inspectionId,extractorVersion:'pdfjs-6.3.289',resourceProfileHash:resources.profile,pageCount,scanState:pageCount===null?'document-error' as const:incomplete?'incomplete' as const:'complete' as const,...(blocker?{blocker}:{}),pages,textOnlyPageCount,imagePageCount,totalTextCharacters:text.length,...(sourceTextDecoding?{sourceTextDecoding}:{})}
 return {text,pages:pages.map(({page,start,end})=>({page,start,end})),parts:[{name:'PDF 正文',start:0,end:text.length,kind:'body'}],pdfInspection:{...base,proof:null,ledgerHash:pdfInspectionLedgerHash(base)}}
}
