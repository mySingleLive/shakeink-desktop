import assert from 'node:assert/strict'
import {test} from 'node:test'
import {createHash,randomUUID} from 'node:crypto'
import {PDFDocument,PDFName,PDFString,PDFHexString,PDFDict,PDFArray,PDFRawStream,PDFNull,PDFRef} from 'pdf-lib'
import {preparePdfSourceText,decodePdfSourcePage,preflightPdfSourceText} from '../../desktop/main/novel-import-pdf-source-text'
import {validatePdfSourceTextDecoding,sourceTextProofHash} from '../../desktop/core/novel-import-pdf-source-text'
import {NovelImportPdfClient} from '../../desktop/main/novel-import-pdf-client'
import {resolve} from 'node:path'
import {ParseSpeeds} from 'pdf-lib'
import {mkdtemp,mkdir,writeFile,readFile,stat,realpath,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {existsSync} from 'node:fs'
import {join} from 'node:path'
import {scanNovelSources} from '../../desktop/main/novel-import-files'
import {importScopeHash,importPlanHash} from '../../desktop/core/novel-import'
import {pdfInspectionLedgerHash,pdfSourceKey,validatePdfStoredFields,pdfReviewAudit} from '../../desktop/core/novel-import-pdf'
import {Workspaces} from '../../desktop/service/workspaces'
import {loadDatabaseSeed} from '../../desktop/service/database/seed'
import {publishNovelImport,readNovelImportRecord} from '../../desktop/service/novel-import-publish'
import {prisma} from '../../src/lib/db'
import {ContentError} from '../../src/lib/content-errors'
import type {ImportSession,ImportPublishInput} from '../../desktop/shared/novel-import'
import {NovelImportController} from '../../desktop/main/novel-import'
import {EventEmitter} from 'node:events'
import {PassThrough} from 'node:stream'
import {Worker} from 'node:worker_threads'

const sha=(value:Uint8Array|string)=>createHash('sha256').update(value).digest('hex')
export async function gbkFixture(explicit=false){const pdf=await PDFDocument.create(),cid=pdf.context.obj({Type:'Font',Subtype:'CIDFontType0',BaseFont:'SimSun',CIDSystemInfo:{Registry:PDFString.of('Adobe'),Ordering:PDFString.of('GB1'),Supplement:2},DW:1000}),font=pdf.context.obj({Type:'Font',Subtype:'Type0',BaseFont:'SimSun',Encoding:'GBK-EUC-H',DescendantFonts:[pdf.context.register(cid)]});if(explicit){const cmap=pdf.context.flateStream('/CIDInit /ProcSet findresource begin 12 dict begin begincmap /CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def /CMapName /Test def /CMapType 2 def 1 begincodespacerange <0000> <FFFF> endcodespacerange 1 beginbfchar <A1AD> <22EF> endbfchar endcmap CMapName currentdict /CMap defineresource pop end end');font.set(PDFName.of('ToUnicode'),pdf.context.register(cmap))}const page=pdf.addPage([500,700]);page.node.set(PDFName.of('Resources'),pdf.context.obj({Font:{F1:pdf.context.register(font)}}));page.node.addContentStream(pdf.context.register(pdf.context.stream('BT /F1 18 Tf 30 600 Td <A1ADA1AD> Tj ET')));return pdf.save({useObjectStreams:false})}

test('NI-PDF16: source-proven GBK glyph decoding preserves explicit Unicode and every other character',async()=>{
 const bytes=await gbkFixture(),before=sha(bytes),prepared=await preparePdfSourceText(bytes);assert.equal(prepared.pages[0].status,'eligible');assert.equal(sha(bytes),before)
 const operators={fnArray:[1,2],argsArray:[['F1',18],[[{unicode:'\u22ef',originalCharCode:0xa1ad},{unicode:'\u22ef',originalCharCode:0xa1ad}]]]},ops={setFont:1,showText:2,save:3,restore:4,setGState:5,setTextRenderingMode:6,paintFormXObjectBegin:7,paintFormXObjectEnd:8}
 const decoded=await decodePdfSourcePage({page:1,resource:prepared.pages[0],operators,ops,items:[{str:'\u22ef\u22ef',dir:'ltr',hasEOL:false}],styles:{F1:{vertical:false}}});assert.equal(decoded.text,'\u2026\u2026 ');assert.deepEqual(decoded.proof!.changedOffsets,[0,1]);assert.equal(decoded.blocked,false)
 const explicit=await preparePdfSourceText(await gbkFixture(true));assert.equal(explicit.pages[0].status,'ineligible')
 let calls=0;for(const raw of ['/ObjStm','/O#62jStm','/X#52ef','/Encr#79pt']){const result=await preparePdfSourceText(Buffer.from(raw),{load:async()=>{calls++;throw Error('must not load')}});assert.notEqual(result.status,'closed')}assert.equal(calls,0)
 assert.notEqual((await preflightPdfSourceText(new Uint8Array(8*1024*1024+1))).status,'closed')
})

test('NI-PDF16: parsing admission rejects encoded forbidden structures and preserves exact raw-stream aliases',async()=>{
 let calls=0;for(const value of ['/ObjStm','/O#62jStm','/#4f#62#6A#53#74#6D','/XRef','/X#52ef','/Encrypt','/Encr#79pt','/#45#6e#63#72#79#70#74',new Uint8Array(8*1024*1024+1),Buffer.from('/a '.repeat(100001)),Buffer.from('1 0 obj\n'.repeat(20001))]){const bytes=typeof value==='string'?Buffer.from(value):value,result=await preparePdfSourceText(bytes,{load:async()=>{calls++;throw Error('load forbidden')}});assert.notEqual(result.status,'closed')}assert.equal(calls,0)
 const bytes=await gbkFixture(),surrounding=Buffer.alloc(bytes.length+79,0x7f);surrounding.set(bytes,37);const view=new Uint8Array(surrounding.buffer,surrounding.byteOffset+37,bytes.length),before=sha(view);let streams=0
 const result=await preparePdfSourceText(view,{load:async(input,options)=>{assert.ok(Buffer.isBuffer(input));const alias=input as Buffer;assert.equal(alias.buffer,view.buffer);assert.equal(alias.byteOffset,view.byteOffset);assert.equal(alias.byteLength,view.byteLength);assert.deepEqual(options,{updateMetadata:false,ignoreEncryption:false,throwOnInvalidObject:true,parseSpeed:ParseSpeeds.Slow});const doc=await PDFDocument.load(input,options);for(const [,object]of doc.context.enumerateIndirectObjects())if(object instanceof PDFRawStream){streams++;const contents=object.contents;assert.equal(contents.buffer,view.buffer);assert.ok(contents.byteOffset>=view.byteOffset);assert.ok(contents.byteOffset+contents.byteLength<=view.byteOffset+view.byteLength)}return doc}});assert.equal(result.status,'closed');assert.ok(streams>0);assert.equal(sha(view),before)
})

test('NI-PDF16: parsing admission counts permissive raw obj entries before calling the locked parser',async()=>{
 const permissive=Buffer.from('%PDF-1.7\n1 0obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0obj<</Type/Pages/Kids[]/Count 0>>endobj\n3 0objnullendobj\ntrailer<</Root 1 0 R>>\n%%EOF'),parsed=await PDFDocument.load(permissive,{updateMetadata:false,ignoreEncryption:false,throwOnInvalidObject:true})
 assert.deepEqual(parsed.context.enumerateIndirectObjects().map(([ref])=>ref.toString()),['1 0 R','2 0 R','3 0 R']);assert.equal(parsed.context.enumerateIndirectObjects()[2][1],PDFNull)
 let calls=0
 for(const token of ['1 0 obj\n','1 0obj\n','1 0objnull\n','1%object\n0%generation\nobjnull\n','/prefixobjSuffix ','stream\nobjnull\nendstream\n','endobj\n']){
  const bytes=Buffer.from(token.repeat(20001)),gate=await preflightPdfSourceText(bytes);assert.equal(gate.status,'budget',token);assert.equal(gate.objects,20001,token)
  const prepared=await preparePdfSourceText(bytes,{load:async()=>{calls++;throw Error('object budget must reject before load')}});assert.equal(prepared.status,'budget',token)
 }
 assert.equal(calls,0)
 for(const token of ['obj','0objnull','/obj','/#6fobj','/other#xxobj','stream\nobjnull\nendstream','endobj']){const gate=await preflightPdfSourceText(Buffer.from(token));assert.equal(gate.status,'closed',token);assert.equal(gate.objects,1,token)}
})

test('NI-PDF16: bounded whole-byte dangerous-name matching follows the actual one-pass library identity rules',async()=>{
 for(const name of ['ObjStm','XRef','Encrypt']){
  const forms=new Set([name,[...name].map(c=>'#'+c.charCodeAt(0).toString(16).toUpperCase()).join(''),...[...name].map((_,i)=>name.slice(0,i)+'#'+name.charCodeAt(i).toString(16).toUpperCase()+name.slice(i+1))])
  for(const encoded of forms){assert.equal(PDFName.of(encoded),PDFName.of(name));assert.equal((await preflightPdfSourceText(Buffer.from('/'+encoded))).status,'incomplete')}
  for(const encoded of ['prefix'+name,name+'suffix',name+'#23',name+'#2F',name+'#20','#23'+name,name+'#',name+'#1',name+'#x0',name+'#0x']){assert.notEqual(PDFName.of(encoded),PDFName.of(name));assert.equal((await preflightPdfSourceText(Buffer.from('/'+encoded))).status,'closed')}
 }
 for(const raw of ['/'+'a'.repeat(4096),'/abc#bad#Q1#','#','/a#0 /ObjStm','/a#xx/Encrypt','/'+('a'.repeat(4096))+'/XRef']){const result=await preflightPdfSourceText(Buffer.from(raw));assert.equal(result.status,raw.endsWith('/ObjStm')||raw.endsWith('/Encrypt')||raw.endsWith('/XRef')?'incomplete':'closed')}
 const encodedDelimiter=await preflightPdfSourceText(Buffer.from('/Other#2FObjStm /ObjStmSuffix'));assert.equal(encodedDelimiter.status,'closed')
})

test('NI-PDF16: raw resource closure bounds inheritance, references, forms and executable resource ambiguity',async()=>{
 const fixture=async(change:(pdf:PDFDocument,page:PDFDict,font:PDFDict)=>void)=>{const pdf=await PDFDocument.load(await gbkFixture()),page=pdf.getPage(0).node,resources=pdf.context.lookup(page.get(PDFName.of('Resources')),PDFDict),map=pdf.context.lookup(resources.get(PDFName.of('Font')),PDFDict),font=pdf.context.lookup(map.get(PDFName.of('F1')),PDFDict);change(pdf,page,font);return pdf.save({useObjectStreams:false})}
 for(const [name,expected,change]of [
  ['null-toUnicode','incomplete',(_p:PDFDocument,_n:PDFDict,font:PDFDict)=>font.set(PDFName.of('ToUnicode'),PDFNull)],
  ['bad-reference','incomplete',(_p:PDFDocument,_n:PDFDict,font:PDFDict)=>font.set(PDFName.of('ToUnicode'),PDFRef.of(9999,0))],
  ['other-encoding','ineligible',(_p:PDFDocument,_n:PDFDict,font:PDFDict)=>font.set(PDFName.of('Encoding'),PDFName.of('Identity-H'))],
  ['type3','incomplete',(_p:PDFDocument,_n:PDFDict,font:PDFDict)=>font.set(PDFName.of('Subtype'),PDFName.of('Type3'))],
  ['long-name','budget',(_p:PDFDocument,_n:PDFDict,font:PDFDict)=>font.set(PDFName.of('BaseFont'),PDFName.of('a'.repeat(129)))],
  ['literal-hash-name','incomplete',(_p:PDFDocument,_n:PDFDict,font:PDFDict)=>font.set(PDFName.of('BaseFont'),PDFName.of('literal#x0'))],
  ['embedded-font','ineligible',(pdf:PDFDocument,_n:PDFDict,font:PDFDict)=>pdf.context.lookup(pdf.context.lookup(font.get(PDFName.of('DescendantFonts')),PDFArray).get(0),PDFDict).set(PDFName.of('FontDescriptor'),pdf.context.obj({Type:'FontDescriptor',FontFile2:pdf.context.register(pdf.context.stream('fixture font bytes'))}))],
  ['annotation','incomplete',(pdf:PDFDocument,page:PDFDict)=>page.set(PDFName.of('Annots'),pdf.context.obj([{Subtype:'Text'}]))],
  ['parent-cycle','incomplete',(pdf:PDFDocument,page:PDFDict)=>page.set(PDFName.of('Parent'),pdf.context.register(page))],
  ['pattern','incomplete',(pdf:PDFDocument,page:PDFDict)=>pdf.context.lookup(page.get(PDFName.of('Resources')),PDFDict).set(PDFName.of('Pattern'),pdf.context.obj({P1:{PatternType:1}}))],
  ['soft-mask','incomplete',(pdf:PDFDocument,page:PDFDict)=>pdf.context.lookup(page.get(PDFName.of('Resources')),PDFDict).set(PDFName.of('ExtGState'),pdf.context.obj({G1:{SMask:{S:'Alpha'}}}))],
  ['none-mask','eligible',(pdf:PDFDocument,page:PDFDict)=>pdf.context.lookup(page.get(PDFName.of('Resources')),PDFDict).set(PDFName.of('ExtGState'),pdf.context.obj({G1:{SMask:'None'}}))],
  ['group-resources','incomplete',(pdf:PDFDocument,page:PDFDict)=>page.set(PDFName.of('Group'),pdf.context.obj({S:'Transparency',Resources:{}}))],
  ['ext-font','eligible',(pdf:PDFDocument,page:PDFDict,font:PDFDict)=>pdf.context.lookup(page.get(PDFName.of('Resources')),PDFDict).set(PDFName.of('ExtGState'),pdf.context.obj({G1:{Font:[pdf.context.register(font),18]}}))],
  ['inherited','eligible',(pdf:PDFDocument,page:PDFDict)=>{const resources=page.get(PDFName.of('Resources'));page.delete(PDFName.of('Resources'));pdf.context.lookup(page.get(PDFName.of('Parent')),PDFDict).set(PDFName.of('Resources'),resources!)}],
  ['form-fallback','eligible',(pdf:PDFDocument,page:PDFDict)=>{const form=pdf.context.stream('q Q',{Type:'XObject',Subtype:'Form',BBox:[0,0,10,10]});pdf.context.lookup(page.get(PDFName.of('Resources')),PDFDict).set(PDFName.of('XObject'),pdf.context.obj({Fm1:pdf.context.register(form)}))}],
  ['form-other-font','ineligible',(pdf:PDFDocument,page:PDFDict)=>{const form=pdf.context.stream('q Q',{Type:'XObject',Subtype:'Form',BBox:[0,0,10,10],Resources:{Font:{F2:{Type:'Font',Subtype:'Type1',BaseFont:'Helvetica'}}}});pdf.context.lookup(page.get(PDFName.of('Resources')),PDFDict).set(PDFName.of('XObject'),pdf.context.obj({Fm1:pdf.context.register(form)}))}],
 ] as const){const result=await preparePdfSourceText(await fixture(change));assert.equal(result.pages[0]?.status??result.status,expected,name);assert.ok(result.lookups<=20001)}
 const many=await fixture((pdf,page)=>{const fonts=pdf.context.obj({});for(let i=0;i<257;i++)fonts.set(PDFName.of('F'+i),pdf.context.obj({Type:'Font',Subtype:'Type1',BaseFont:'Helvetica'}));pdf.context.lookup(page.get(PDFName.of('Resources')),PDFDict).set(PDFName.of('Font'),fonts)});assert.equal((await preparePdfSourceText(many)).pages[0].status,'budget')
 const parents=await fixture((pdf,page)=>{let parent=page.get(PDFName.of('Parent'))!;for(let n=0;n<34;n++)parent=pdf.context.register(pdf.context.obj({Type:'Pages',Parent:parent}));page.set(PDFName.of('Parent'),parent)});assert.equal((await preparePdfSourceText(parents)).pages[0].status,'budget')
 const kids=await fixture((pdf,page)=>{const parent=pdf.context.lookup(page.get(PDFName.of('Parent')),PDFDict);parent.set(PDFName.of('Kids'),pdf.context.obj([page.get(PDFName.of('Parent'))!]))});assert.equal((await preparePdfSourceText(kids)).status,'incomplete')
 const formCycle=await fixture((pdf,page)=>{const resources=pdf.context.lookup(page.get(PDFName.of('Resources')),PDFDict),form=pdf.context.stream('q Q',{Type:'XObject',Subtype:'Form',BBox:[0,0,10,10]}),ref=pdf.context.register(form),own=pdf.context.obj({Font:resources.get(PDFName.of('Font'))!,XObject:{Fm1:ref}});form.dict.set(PDFName.of('Resources'),own);resources.set(PDFName.of('XObject'),pdf.context.obj({Fm1:ref}))});assert.equal((await preparePdfSourceText(formCycle)).pages[0].status,'incomplete')
 const deepForm=await fixture((pdf,page)=>{const resources=pdf.context.lookup(page.get(PDFName.of('Resources')),PDFDict);let nested:PDFRef|undefined;for(let n=0;n<18;n++){const form=pdf.context.stream('q Q',{Type:'XObject',Subtype:'Form',BBox:[0,0,10,10],Resources:{Font:resources.get(PDFName.of('Font'))!,...(nested?{XObject:{Fm1:nested}}:{})}});nested=pdf.context.register(form)}resources.set(PDFName.of('XObject'),pdf.context.obj({Fm1:nested!}))});assert.equal((await preparePdfSourceText(deepForm)).pages[0].status,'budget')
 const convenienceBytes=await gbkFixture(),originalPages=PDFDocument.prototype.getPages;PDFDocument.prototype.getPages=()=>{throw Error('unbounded convenience forbidden')};try{assert.equal((await preparePdfSourceText(convenienceBytes)).pages[0].status,'eligible')}finally{PDFDocument.prototype.getPages=originalPages}
 const workload=await PDFDocument.load(await gbkFixture()),first=workload.getPage(0).node,resource=first.get(PDFName.of('Resources'))!;for(let n=0;n<2499;n++)workload.addPage([10,10]).node.set(PDFName.of('Resources'),resource);const limited=await preparePdfSourceText(await workload.save({useObjectStreams:false}));assert.equal(limited.lookups,20000);assert.ok(limited.pages.some(page=>page.status==='budget'),'global graph budget must stop future lookups after the first exhausted page')
})

test('NI-PDF16: full scalar order and homogeneous original codes are required before an atomic page correction',async()=>{
 const resource={status:'eligible' as const,resourceClosureHash:'a'.repeat(64)},ops={setFont:1,showText:2,save:3,restore:4,setGState:5,setTextRenderingMode:6,paintFormXObjectBegin:7,paintFormXObjectEnd:8},base={page:1,resource,ops,styles:{F1:{vertical:false}},operators:{fnArray:[1,2],argsArray:[['F1',18],[[{unicode:'A',originalCharCode:65},{unicode:'\u22ef',originalCharCode:0xa1ad},{unicode:'😀',originalCharCode:0x1234},{unicode:'\u22ef',originalCharCode:0xa1ad}]]]},items:[{str:'A \u22ef😀\u22ef',dir:'ltr',fontName:'F1',hasEOL:true}]}
 const good=await decodePdfSourcePage(base);assert.equal(good.text,'A \u2026😀\u2026\n');assert.deepEqual(good.proof?.changedOffsets,[2,5])
 const definedFont=await decodePdfSourcePage({...base,styles:{},fontExists:id=>id==='F1'});assert.equal(definedFont.blocked,false);assert.equal(definedFont.text,good.text)
 for(const change of [
  {items:[{...base.items[0],dir:'rtl'}]},
  {styles:{F1:{vertical:true}}},
  {items:[{...base.items[0],str:'A \u22ef\u22ef😀'}]},
  {items:[{...base.items[0],str:'A \u200b\u22ef😀\u22ef'}]},
  {items:[{...base.items[0],str:'A \ud800\u22ef😀\u22ef'}]},
  {items:[{...base.items[0],str:'A \u22ef😀'}]},
  {operators:{fnArray:[1,2],argsArray:[['unknown',18],base.operators.argsArray[1]]}},
  {operators:{fnArray:[1],argsArray:[['F1',18]]}},
  {budget:{glyphs:2000000,pages:0,changes:0}},
  {operators:{fnArray:[1,6,2],argsArray:[['F1',18],[3],base.operators.argsArray[1]]}},
  {operators:{fnArray:[1,2],argsArray:[['F1',18],[[{unicode:'A',originalCharCode:65},{unicode:'\u22ef',originalCharCode:0xa1ae},{unicode:'😀',originalCharCode:0x1234},{unicode:'\u22ef',originalCharCode:0xa1ad}]]]}},
  {operators:{fnArray:[1,2],argsArray:[['F1',18],[[{unicode:'A\u22ef',originalCharCode:0xa1ad},{unicode:'😀',originalCharCode:0x1234},{unicode:'\u22ef',originalCharCode:0xa1ad}]]]}},
  {resource:{...resource,status:'incomplete' as const}},
 ]){const result=await decodePdfSourcePage({...base,...change});assert.equal(result.blocked,true);assert.equal(result.proof,undefined);assert.ok(!result.text.includes('\u2026'))}
 const explicit=await decodePdfSourcePage({...base,resource:{...resource,status:'ineligible'}});assert.equal(explicit.blocked,false);assert.equal(explicit.text,'A \u22ef😀\u22ef\n');assert.equal(explicit.proof,undefined)
})

test('NI-PDF17: legacy supplementation preserves every frozen field and new source selection is explicit',async()=>{
 for(const mismatch of [false,true]){
  const root=await realpath(await mkdtemp(join(tmpdir(),'shakeink-source-text-legacy-'))),data=join(root,'data'),source=join(root,'source.pdf'),bytes=await gbkFixture(),client=new NovelImportPdfClient({workerPath:resolve('desktop/main/novel-import-pdf-worker.ts')});await mkdir(data);await writeFile(source,bytes)
  const options={root:data,pdfClient:client,choose:async()=>[source],chooseTarget:async()=>null,protectedDirectories:async()=>[],models:async()=>({}),ai:async()=>{throw Error('must not send')},cancelAi:async()=>{},publish:async()=>{throw Error('must not publish')}};let first:NovelImportController|undefined,restored:NovelImportController|undefined
  try{
   first=new NovelImportController(options);await first.initialize();let chosen=(await first.act({type:'choose'})).view!;const path=join(data,'novel-imports',chosen.id,'session.json')
   // Explicit reselection of a live draft records the new decoding and clears analysis state.
   const reselected=await first.act({type:'reselect-source',id:chosen.id,revision:chosen.revision,fileId:chosen.files[0].id});assert.notEqual(reselected.view!.files[0].id,chosen.files[0].id);assert.deepEqual(reselected.view!.files[0].pdfInspection!.sourceTextDecoding,{policy:'gbk-euc-h-a1ad-v1',pageCount:1,changedCharacters:2});const next=JSON.parse(await readFile(path,'utf8'));assert.equal(next.files[0].text,'\u2026\u2026 ');assert.deepEqual(next.coverage,{});assert.equal(next.analysisCheckpoint,undefined);chosen=reselected.view!
   const journal=JSON.parse(await readFile(path,'utf8'));await first.close()
   // Closing deletes the unsaved draft; only a journal whose save began is restored, so the legacy journal is re-seeded with a publication.
   assert.equal(existsSync(join(data,'novel-imports',chosen.id)),false);await mkdir(join(data,'novel-imports',chosen.id));await writeFile(join(data,'novel-imports',chosen.id,'.owner'),'shakeink-novel-import-v1\n'+chosen.id+'\n');journal.publication={requestId:randomUUID(),hash:'legacy-publication'}
   const oldText=mismatch?'！？ ':'\u22ef\u22ef ',model={id:'historical',name:'Historical synthetic',modelId:'synthetic',endpoint:'https://model.invalid/v1',authRevision:1,contextWindow:16000};journal.files[0].text=oldText;delete journal.files[0].pdfInspection;journal.files[0].pages=[{page:1,start:0,end:oldText.length}];journal.units=[{id:'old-unit',fileId:journal.files[0].id,start:0,end:oldText.length,text:oldText,kind:'body'}];journal.originalProse=oldText;journal.workingProse=oldText;journal.workingRevision=1;journal.workingUnits=[{id:'working:0',fileId:'working',start:0,end:oldText.length,text:oldText,kind:'body'}];journal.chapters=[{id:'legacy-chapter',title:'旧章',start:0,end:oldText.length,content:oldText}];journal.coverage={body:['old-unit'],reviewFacts:['legacy-success']};journal.analysisGrant={hash:importScopeHash(journal,'analyze'),textModel:model,reviewModel:{...model,id:'review'}};journal.analysisCheckpoint={hash:importScopeHash(journal,'analyze'),target:{path:'/synthetic-target',device:'1',inode:'2'}};await writeFile(path,JSON.stringify(journal));const frozen={text:oldText,working:oldText,units:structuredClone(journal.units),workingUnits:structuredClone(journal.workingUnits),coverage:structuredClone(journal.coverage),checkpoint:structuredClone(journal.analysisCheckpoint),scope:importScopeHash(journal,'analyze')}
   restored=new NovelImportController({...options,pdfClient:new NovelImportPdfClient({workerPath:resolve('desktop/main/novel-import-pdf-worker.ts')})});await restored.initialize();const current=(await restored.act({type:'current'})).view!,after=JSON.parse(await readFile(path,'utf8'));assert.equal(after.files[0].text,frozen.text);assert.equal(after.workingProse,frozen.working);assert.deepEqual(after.units,frozen.units);assert.deepEqual(after.workingUnits,frozen.workingUnits);assert.deepEqual(after.coverage,frozen.coverage);assert.deepEqual(after.analysisCheckpoint,frozen.checkpoint);assert.equal(importScopeHash(after,'analyze'),frozen.scope);assert.equal(after.files[0].pdfInspection?.sourceTextDecoding,undefined)
   if(mismatch){assert.equal(current.pdfReady,false);assert.equal(current.files[0].pdfSourceInvalidated,true);assert.equal(after.files[0].pdfSourceInvalidated,true);assert.equal(after.files[0].pdfInspection,undefined)}else{assert.ok(after.files[0].pdfInspection);assert.equal(current.pdfReady,true)}
   // A started save keeps its plan: reselection is refused and the frozen journal is unchanged.
   const kept=await readFile(path,'utf8');await assert.rejects(restored.act({type:'reselect-source',id:current.id,revision:current.revision,fileId:current.files[0].id}),/保存已开始/);assert.equal(await readFile(path,'utf8'),kept)
  }finally{await restored?.close();await first?.close();client.cancelAll();await client.drain();await rm(root,{recursive:true,force:true})}
 }
})

test('NI-PDF17: canceled proof results cannot escape while the real job resources remain charged',async()=>{
 const bytes=await gbkFixture(),actual=await new NovelImportPdfClient({workerPath:resolve('desktop/main/novel-import-pdf-worker.ts')}).inspectBytes(bytes),release=Promise.withResolvers<void>();let sent=false
 class LateProofWorker extends EventEmitter {stdout=new PassThrough();stderr=new PassThrough();postMessage(){sent=true;void release.promise.then(()=>{this.emit('message',{type:'result',value:actual});this.emit('exit',0)})}terminate(){return release.promise.then(()=>0)}}
 const client=new NovelImportPdfClient({workerPath:resolve('desktop/main/novel-import-pdf-worker.ts'),workerFactory:LateProofWorker as unknown as typeof Worker}),result=client.inspectBytes(bytes).then(value=>({value}),error=>({error}));while(!sent)await new Promise(resolve=>setImmediate(resolve));client.cancelAll();assert.ok('error'in await result);assert.equal(client.active,1);assert.ok(client.registry.metrics.sourceBytes>0);release.resolve();await client.drain();assert.equal(client.active,0);assert.equal(client.registry.metrics.sourceBytes,0)
})

test('NI-PDF17: decoded PDF ledgers bind the policy without rewriting legacy checkpoints',async()=>{
 const bytes=await gbkFixture(),client=new NovelImportPdfClient({workerPath:resolve('desktop/main/novel-import-pdf-worker.ts')}),result=await client.inspectBytes(bytes);assert.equal(result.text,'\u2026\u2026 ');assert.ok(result.pdfInspection.sourceTextDecoding);validatePdfSourceTextDecoding(result.pdfInspection.sourceTextDecoding!,sha(bytes),result.text,result.pdfInspection.pages);assert.equal(result.pdfInspection.sourceTextDecoding!.proofHash,sourceTextProofHash(result.pdfInspection.sourceTextDecoding!))
})

test('NI-PDF17: pure-text correction proofs bind actual publication fingerprints and expose only a summary',async()=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'shakeink-source-proof-publish-'))),data=join(root,'data'),target=join(root,'work'),source=join(root,'source.pdf'),bytes=await gbkFixture(),client=new NovelImportPdfClient({workerPath:resolve('desktop/main/novel-import-pdf-worker.ts')});await mkdir(data);await mkdir(target);await writeFile(source,bytes)
 const works=new Workspaces(data,resolve('prisma/migrations'),await loadDatabaseSeed(resolve('prisma/empty-database.json')))
 try{
  await works.initialize();const files=await scanNovelSources([source],{pdfClient:client}),file=files[0];assert.equal(file.text,'\u2026\u2026 ');assert.equal(file.pdfInspection!.imagePageCount,0);validatePdfStoredFields(files)
  const id=randomUUID(),now=new Date().toISOString(),text=file.text,session:ImportSession={version:1,id,revision:1,phase:'publishing',title:'Synthetic source proof',files,units:[{id:'body-unit',fileId:file.id,start:0,end:text.length,text,kind:'body'}],selected:['body'],targets:[],infer:false,artifacts:[],conflicts:[],patches:[],originalProse:text,workingProse:text,workingRevision:0,chapters:[{id:'chapter-1',title:'原文',start:0,end:text.length,content:text}],steps:[],coverage:{body:['body-unit']},notFound:[],epoch:1,createdAt:now,updatedAt:now,decisions:[],publication:{requestId:id}},targetStat=await stat(target,{bigint:true}),input:ImportPublishInput={session,selection:{path:target,device:String(targetStat.dev),inode:String(targetStat.ino)},importHash:importPlanHash(session)}
  assert.ok(pdfReviewAudit(session));const originalScope=importScopeHash(session,'analyze'),originalPlan=importPlanHash(session),originalKey=pdfSourceKey(file),proof=structuredClone(file.pdfInspection!.sourceTextDecoding!)
  for(const mutate of [(p:typeof proof)=>p.pages[0].changedOffsets.push(0),(p:typeof proof)=>p.pages[0].changedOffsets[0]=2,(p:typeof proof)=>p.pages[0].beforeUtf8Sha256='0'.repeat(64),(p:typeof proof)=>p.pages=[]]){const broken=structuredClone(file);mutate(broken.pdfInspection!.sourceTextDecoding!);broken.pdfInspection!.sourceTextDecoding!.proofHash=sourceTextProofHash(broken.pdfInspection!.sourceTextDecoding!);broken.pdfInspection!.ledgerHash=pdfInspectionLedgerHash(broken.pdfInspection!);assert.throws(()=>validatePdfStoredFields([broken]))}
  const changed=structuredClone(input);changed.session.files[0].pdfInspection!.sourceTextDecoding!.pages[0].resourceClosureHash='b'.repeat(64);changed.session.files[0].pdfInspection!.sourceTextDecoding!.proofHash=sourceTextProofHash(changed.session.files[0].pdfInspection!.sourceTextDecoding!);changed.session.files[0].pdfInspection!.ledgerHash=pdfInspectionLedgerHash(changed.session.files[0].pdfInspection!);validatePdfStoredFields(changed.session.files);assert.equal(changed.session.files[0].text,text);assert.notEqual(importScopeHash(changed.session,'analyze'),originalScope);assert.notEqual(importPlanHash(changed.session),originalPlan);assert.notEqual(pdfSourceKey(changed.session.files[0]),originalKey)
  const receipt=await publishNovelImport(works,input);assert.deepEqual(await publishNovelImport(works,input),receipt)
  await works.run(receipt.workId,async()=>{const version=await prisma.contentVersion.findFirstOrThrow({where:{targetType:'NOVEL_IMPORT',targetId:receipt.novelId}}),audit=(version.snapshot as any).pdfPageReview;assert.deepEqual(audit.files[0].sourceTextDecoding,proof);assert.equal(audit.files[0].pages.length,1);const read=(await readNovelImportRecord(receipt.novelId)).record as any;assert.deepEqual(read.pdfPageReview.files[0].sourceTextDecoding,{policy:'gbk-euc-h-a1ad-v1',pageCount:1,changedCharacters:2});assert.doesNotMatch(JSON.stringify(read.pdfPageReview),/changedOffsets|resourceClosureHash|beforeUtf8Sha256|afterUtf8Sha256|glyphSequenceHash|correspondenceHash|proofHash|"proof"|"path"|"png"/u);assert.equal((await prisma.chapter.findMany({where:{volume:{novelId:receipt.novelId}}})).map(chapter=>chapter.content).join(''),text)})
  changed.importHash=importPlanHash(changed.session);await assert.rejects(publishNovelImport(works,changed),error=>error instanceof ContentError&&error.code==='REQUEST_CONFLICT');assert.equal(sha(await readFile(source)),sha(bytes))
  const legacy=await client.inspectBytes(bytes,{sourceTextPolicy:'legacy'});assert.equal(legacy.text,'\u22ef\u22ef ');assert.equal(legacy.pdfInspection.sourceTextDecoding,undefined);const explicit=await client.inspectBytes(await gbkFixture(true));assert.equal(explicit.text,'\u22ef\u22ef ');assert.equal(explicit.pdfInspection.sourceTextDecoding,undefined)
 }finally{client.cancelAll();await client.drain();await works.close();await rm(root,{recursive:true,force:true})}
})

test('NI-PDF17: fixed MD, text-only and image-PDF legacy fingerprints never acquire a default decoding policy',()=>{
 const text='Original old text.',proof={device:'1',inode:'2',size:'10',mtime:'3',ctime:'4'},base:ImportSession={version:1,id:'a845f9fb-f49d-407a-9ae1-a3d38cb37273',revision:4,phase:'paused',title:'Frozen legacy',files:[{id:'old-file',name:'original.pdf',format:'md',path:'/synthetic/source',bytes:10,hash:'a'.repeat(64),text,included:true}],units:[{id:'old-unit',fileId:'old-file',start:0,end:text.length,text,kind:'body'}],selected:['body'],targets:[],infer:false,artifacts:[],conflicts:[],patches:[],originalProse:text,workingProse:text,workingRevision:0,chapters:[],steps:[],coverage:{body:['old-unit']},notFound:[],epoch:1,createdAt:'2026-10-20T00:00:00.000Z',updatedAt:'2026-10-21T00:00:00.000Z',decisions:[]}
 for(const kind of ['md','text-pdf','image-pdf']){
  const session=structuredClone(base),file=session.files[0]
  if(kind!=='md'){file.format='pdf';file.proof=proof;const pages:NonNullable<typeof file.pdfInspection>['pages']=[...(kind==='image-pdf'?[{page:1,start:0,end:0,textCharacters:0,textState:'empty' as const,raster:'present' as const}]:[]),{page:kind==='image-pdf'?2:1,start:0,end:text.length,textCharacters:text.length,textState:'extracted',raster:'none'}],inspection={schemaVersion:1 as const,sourceHash:file.hash,proof,inspectionId:'29180c82-567b-4ee9-a643-55f2ef8b91a9',extractorVersion:'pdfjs-6.3.289',resourceProfileHash:'b'.repeat(64),pageCount:pages.length,scanState:'complete' as const,pages,textOnlyPageCount:1,imagePageCount:kind==='image-pdf'?1:0,totalTextCharacters:text.length};file.pdfInspection={...inspection,ledgerHash:pdfInspectionLedgerHash(inspection)};if(kind==='image-pdf')file.pdfPageDecisions=[{fileId:file.id,page:1,sourceHash:file.hash,proof,ledgerHash:file.pdfInspection.ledgerHash,resourceProfileHash:inspection.resourceProfileHash,decision:'exclude-image',confirmedAt:'2026-10-20T00:00:00.000Z',decisionRevision:1}];validatePdfStoredFields([file])}
  const expected=kind==='image-pdf'?['f0c2a58d28e291f66bfda1efa66c9be3ae676668c5adcb6dfdc0ae6c81ab4564','d1fc4a2c32d04c7e836f9f439d996d8774cd540ce7114c2397b97215bd00a113','1db7810ce01c047f25aec4b33fb844a262b171f94fc14317dcfa6ef87f83753a']:['9d5f992dd474a252a6426c6ab436033df23414cd5aa9c5edd8f351d8d5a9109e','0236e3e94cd7ef49303b3f14e66a865b9a1190a8d50c41703b2e6fe3e81fca45','6e6e0cd364d25a256ecc99305540d2ffbe216c208e7da19a09a74cab442cd002']
  assert.deepEqual([importScopeHash(session,'classify'),importScopeHash(session,'analyze'),importPlanHash(session)],expected);assert.doesNotMatch(JSON.stringify(session),/sourceTextDecoding/);const audit=pdfReviewAudit(session);if(kind==='image-pdf'){assert.ok(audit);assert.doesNotMatch(JSON.stringify(audit),/sourceTextDecoding/)}else assert.equal(audit,undefined)
 }
})
