import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,mkdir,writeFile,stat,readFile,realpath,rm} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {randomUUID,createHash} from 'node:crypto'
import {PDFDocument,StandardFonts} from 'pdf-lib'
import {createCanvas} from '@napi-rs/canvas'
import {Workspaces} from '../../desktop/service/workspaces'
import {loadDatabaseSeed} from '../../desktop/service/database/seed'
import {extractNovelText} from '../../desktop/main/novel-import-files'
import {NovelImportPdfClient} from '../../desktop/main/novel-import-pdf-client'
import {importPlanHash} from '../../desktop/core/novel-import'
import {pdfInspectionLedgerHash} from '../../desktop/core/novel-import-pdf'
import {publishNovelImport,readNovelImportRecord} from '../../desktop/service/novel-import-publish'
import {prisma} from '../../src/lib/db'
import {ContentError} from '../../src/lib/content-errors'
import type {ImportSession,ImportPublishInput} from '../../desktop/shared/novel-import'

test('NI-PDF10: real publication audit binds PDF page decisions and history without paths pixels or preview tokens',{timeout:120000},async()=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'shakeink-pdf-publish-'))),data=join(root,'app'),target=join(root,'work'),source=join(root,'original.pdf')
 await mkdir(data);await mkdir(target)
 const works=new Workspaces(data,resolve('prisma/migrations'),await loadDatabaseSeed(resolve('prisma/empty-database.json')))
 try{
  await works.initialize()
  const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),canvas=createCanvas(20,20),context=canvas.getContext('2d')
  context.fillStyle='#789abc';context.fillRect(0,0,20,20)
  const image=await pdf.embedPng(canvas.toBuffer('image/png'));pdf.addPage([400,500]).drawImage(image,{x:40,y:50,width:200,height:200})
  pdf.addPage([400,500]).drawText('Original body including its final word.',{font,size:16,x:20,y:400})
  const bytes=await pdf.save();await writeFile(source,bytes)
  const extracted=await extractNovelText(bytes,'pdf',undefined,{pdfClient:new NovelImportPdfClient({workerPath:resolve('desktop/main/novel-import-pdf-worker.ts')})}),sourceStat=await stat(source,{bigint:true}),targetStat=await stat(target,{bigint:true}),now=new Date().toISOString(),id=randomUUID()
  assert.ok(extracted.pdfInspection);assert.equal(extracted.pdfInspection.pageCount,2);assert.equal(extracted.pdfInspection.imagePageCount,1)
  const proof={device:String(sourceStat.dev),inode:String(sourceStat.ino),size:String(sourceStat.size),mtime:String(sourceStat.mtimeNs),ctime:String(sourceStat.ctimeNs)},inspection={...extracted.pdfInspection,proof}
  assert.equal(inspection.ledgerHash,pdfInspectionLedgerHash(inspection))
  const text=extracted.text,hash=createHash('sha256').update(bytes).digest('hex'),eventBase={fileId:'source-pdf',page:1,sourceHash:hash,ledgerHash:inspection.ledgerHash,resourceProfileHash:inspection.resourceProfileHash,at:now}
  const events=[{...eventBase,decision:'exclude-image' as const,action:'confirm' as const,decisionRevision:2},{...eventBase,decision:'pending' as const,action:'revoke' as const,decisionRevision:3},{...eventBase,decision:'exclude-image' as const,action:'confirm' as const,decisionRevision:4}]
  const decision={fileId:'source-pdf',page:1,sourceHash:hash,proof,ledgerHash:inspection.ledgerHash,resourceProfileHash:inspection.resourceProfileHash,decision:'exclude-image' as const,confirmedAt:now,decisionRevision:4}
  const session:ImportSession={version:1,id,revision:4,phase:'publishing',title:'合成PDF审计',files:[{id:'source-pdf',name:'original.pdf',format:'pdf',path:source,bytes:bytes.length,hash,text,included:true,proof,parts:extracted.parts,pages:extracted.pages,pdfInspection:inspection,pdfPageDecisions:[decision]}],units:[{id:'body-unit',fileId:'source-pdf',start:0,end:text.length,text,kind:'body'}],selected:['body'],targets:[],infer:false,artifacts:[],conflicts:[],patches:[],originalProse:text,workingProse:text,workingRevision:0,chapters:[{id:'chapter-1',title:'原文',start:0,end:text.length,content:text}],steps:[],coverage:{body:['body-unit']},notFound:[],epoch:1,createdAt:now,updatedAt:now,decisions:[],pdfPageDecisionEvents:events,publication:{requestId:id}}
  const input:ImportPublishInput={session,selection:{path:target,device:String(targetStat.dev),inode:String(targetStat.ino)},importHash:importPlanHash(session)}
  const unresolved=structuredClone(input);unresolved.session.files[0].pdfPageDecisions=[];unresolved.importHash=importPlanHash(unresolved.session)
  await assert.rejects(publishNovelImport(works,unresolved),/PDF|核对/u)
  assert.equal((await works.list()).some(work=>work.requestId===id),false)
  const receipt=await publishNovelImport(works,input);assert.deepEqual(await publishNovelImport(works,input),receipt)
  await works.run(receipt.workId,async()=>{
   const version=await prisma.contentVersion.findFirstOrThrow({where:{targetType:'NOVEL_IMPORT',targetId:receipt.novelId}}),snapshot=version.snapshot as any,audit=snapshot.pdfPageReview
   assert.ok(audit,'PDF review audit must survive actual transaction publication')
   assert.equal(audit.schemaVersion,1);assert.equal(audit.files.length,1);assert.equal(audit.files[0].sourceHash,hash)
   assert.deepEqual(audit.files[0].proof,proof);assert.equal(audit.files[0].ledgerHash,inspection.ledgerHash);assert.equal(audit.files[0].resourceProfileHash,inspection.resourceProfileHash)
   assert.equal(audit.files[0].pages.length,2);assert.equal(audit.files[0].pages[0].decision,'exclude-image');assert.equal(audit.files[0].pages[1].decision,undefined)
   assert.deepEqual(audit.events,events);assert.deepEqual(audit.files[0].events,events)
   for(const page of audit.files[0].pages)assert.equal(page.textHash,createHash('sha256').update(JSON.stringify(text.slice(page.start,page.end))).digest('hex'))
   const stored=JSON.stringify(audit);assert.ok(!stored.includes(source));assert.doesNotMatch(stored,/previewToken|requestId|blob:|data:image|ancestors|"png"/u)
   assert.equal((await prisma.chapter.findMany({where:{volume:{novelId:receipt.novelId}}})).map(chapter=>chapter.content).join(''),text)
   assert.equal(await prisma.contentMutation.count({where:{novelId:receipt.novelId,targetType:'NOVEL_IMPORT'}}),1)
   const read=(await readNovelImportRecord(receipt.novelId)).record as any
   assert.ok(read.pdfPageReview);assert.equal(read.pdfPageReview.files[0].proof,undefined)
   assert.deepEqual(read.pdfPageReview.events,events);assert.doesNotMatch(JSON.stringify(read.pdfPageReview),/"proof"|"path"|"png"|previewToken|data:image/u)
   assert.equal((await readNovelImportRecord(receipt.novelId,{material:'body-original'})).page?.text,text)
  })
  const changed=structuredClone(input);changed.session.pdfPageDecisionEvents![1].at='2026-10-26T00:00:00.000Z';changed.importHash=importPlanHash(changed.session)
  await assert.rejects(publishNovelImport(works,changed),error=>error instanceof ContentError&&error.code==='REQUEST_CONFLICT')
  assert.deepEqual(new Uint8Array(await readFile(source)),bytes)
 }finally{await works.close();await rm(root,{recursive:true,force:true})}
})
