import { constants } from 'node:fs'
import { access, lstat, realpath, open, opendir } from 'node:fs/promises'
import type { BigIntStats } from 'node:fs'
import { basename, dirname, extname, isAbsolute, relative, resolve, sep, join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { inflateRawSync } from 'node:zlib'
import JSZip from 'jszip'
import { Parser } from 'htmlparser2'
import WordExtractor from 'word-extractor'
import { IMPORT_FORMATS, type ImportFile, type ImportFormat, type ImportProof } from '../shared/novel-import'
import type {NovelImportPdfClient,PdfJobContext} from './novel-import-pdf-client'

export const NOVEL_SOURCE_LIMITS=Object.freeze({fileBytes:50*1024*1024,totalBytes:100*1024*1024,files:5000,characters:25_000_000,zipEntries:10000,zipBytes:100*1024*1024})
type Extracted={text:string;encoding?:string;requiresEncodingConfirmation?:boolean;encodingDetected?:boolean;parts?:ImportFile['parts'];pages?:ImportFile['pages'];pdfInspection?:ImportFile['pdfInspection']}
const natural=new Intl.Collator('zh-CN',{numeric:true,sensitivity:'variant'})
const digest=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex')
const proof=(s:BigIntStats):ImportProof=>({device:String(s.dev),inode:String(s.ino),size:String(s.size),mtime:String(s.mtimeNs),ctime:String(s.ctimeNs)})
const same=(a:ImportProof,b:ImportProof)=>a.device===b.device&&a.inode===b.inode&&a.size===b.size&&a.mtime===b.mtime&&a.ctime===b.ctime
const within=(path:string,root:string)=>{const r=relative(root,path);return r===''||(!r.startsWith('..'+sep)&&r!=='..'&&!isAbsolute(r))}
function fail(message:string):never{throw new Error(message)}
const formatOf=(path:string):ImportFile['format']=>{const f=extname(path).slice(1).toLowerCase();return IMPORT_FORMATS.includes(f as ImportFormat)?f as ImportFormat:'unsupported'}
const checkCharacters=(text:string)=>{if(text.length>NOVEL_SOURCE_LIMITS.characters)fail('提取文字超过 2500 万字符限制');return text}
const isHidden=(name:string)=>name.startsWith('.')||['node_modules','$RECYCLE.BIN','System Volume Information','__MACOSX'].includes(name)
async function identityIo<T>(context:PdfJobContext|undefined,run:()=>Promise<T>){context?.check();const value=await run();context?.check();return value}

/** Main-process only: the objects selected in the custom picker, not fresh paths. */
export interface ImportSourceGrant {
 path:string
 proof:ImportProof
 directory:boolean
 ancestors:NonNullable<ImportFile['ancestors']>
}

/** Reject link components before opening, then verify the entire chain again after reading. */
async function pathIdentity(path:string,beforeRealpath?:()=>Promise<void>,context?:PdfJobContext){
 const chain:{path:string;proof:ImportProof;directory:boolean}[]=[]
 for(let cursor=resolve(path);;cursor=dirname(cursor)){
  const stat=await identityIo(context,()=>lstat(cursor,{bigint:true}))
  if(stat.isSymbolicLink())fail('符号链接不能作为导入来源')
  chain.push({path:cursor,proof:proof(stat),directory:stat.isDirectory()})
  if(dirname(cursor)===cursor)break
 }
 await beforeRealpath?.()
 if(await identityIo(context,()=>realpath(path))!==resolve(path))fail('来源路径发生变化，请重新选择')
 return chain
}
async function canonicalSelection(path:string,context?:PdfJobContext){
 for(let cursor=path;dirname(cursor)!==cursor;cursor=dirname(cursor)){
  const stat=await identityIo(context,()=>lstat(cursor))
  if(stat.isSymbolicLink()){
   const systemAlias=process.platform==='darwin'&&['/var','/tmp','/etc'].includes(cursor)&&await identityIo(context,()=>realpath(cursor))==='/private'+cursor
   if(!systemAlias)fail('符号链接不能作为导入来源')
  }
 }
 return identityIo(context,()=>realpath(path))
}
async function checkIdentity(chain:Awaited<ReturnType<typeof pathIdentity>>,context?:PdfJobContext){
 for(const item of chain){const s=await identityIo(context,()=>lstat(item.path,{bigint:true})),current=proof(s);if(s.isSymbolicLink()||(item.directory?(!s.isDirectory()||current.device!==item.proof.device||current.inode!==item.proof.inode):!same(current,item.proof)))fail('来源文件或目录发生变化，请重新选择')}
}
export async function captureNovelSourceGrant(path:string,hooks?:{beforeRealpath?:()=>Promise<void>},context?:PdfJobContext):Promise<ImportSourceGrant>{
 // A custom-picker grant is for the original path and ancestor objects. Do not
 // canonicalize first: a replacement junction must not become a fresh grant.
 // The optional fault point is main-process test-only and never an IPC field.
 const original=resolve(path),chain=await pathIdentity(original,hooks?.beforeRealpath,context),stat=await identityIo(context,()=>lstat(original,{bigint:true}))
 if(!stat.isFile()&&!stat.isDirectory())fail('仅支持普通文件或文件夹')
 await identityIo(context,()=>access(original,constants.R_OK))
 await checkIdentity(chain,context)
 return {path:original,proof:chain[0].proof,directory:chain[0].directory,ancestors:chain.filter(item=>item.directory).map(item=>({path:item.path,device:item.proof.device,inode:item.proof.inode}))}
}
const grantChain=(grant:ImportSourceGrant):Awaited<ReturnType<typeof pathIdentity>>=>[
 ...(!grant.directory?[{path:grant.path,proof:grant.proof,directory:false}]:[]),
 ...grant.ancestors.map(item=>({path:item.path,proof:{device:item.device,inode:item.inode,size:'0',mtime:'0'},directory:true})),
]
export async function verifyNovelSourceGrant(grant:ImportSourceGrant,context?:PdfJobContext):Promise<void>{
 const current=await captureNovelSourceGrant(grant.path,undefined,context)
 if(current.path!==grant.path||current.directory!==grant.directory||(grant.directory?current.proof.device!==grant.proof.device||current.proof.inode!==grant.proof.inode:!same(current.proof,grant.proof))||current.ancestors.length!==grant.ancestors.length||current.ancestors.some((item,index)=>item.path!==grant.ancestors[index].path||item.device!==grant.ancestors[index].device||item.inode!==grant.ancestors[index].inode))fail('来源文件或目录发生变化，请重新选择')
}
async function readSource(path:string,expected?:ImportProof,ancestors?:ImportFile['ancestors']){
 try{return await readSourceChecked(path,expected,ancestors)}catch(error){throw new Error(safeError(error))}
}
async function readSourceChecked(path:string,expected?:ImportProof,ancestors?:ImportFile['ancestors']){
 const chain=await pathIdentity(path),before=chain[0].proof
 const currentAncestors=chain.filter(item=>item.directory).map(item=>({path:item.path,device:item.proof.device,inode:item.proof.inode}))
 if(ancestors&&(currentAncestors.length!==ancestors.length||currentAncestors.some((item,index)=>item.path!==ancestors[index].path||item.device!==ancestors[index].device||item.inode!==ancestors[index].inode)))fail('来源授权目录身份已变化，请重新选择')
 if(expected&&!same(before,expected))fail('来源文件已发生变化，请重新选择')
 const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW)
 try{
  const stat=await handle.stat({bigint:true})
  if(!stat.isFile()||!same(before,proof(stat)))fail('来源不是原来的普通文件')
  if(stat.size>BigInt(NOVEL_SOURCE_LIMITS.fileBytes))fail('文件超过 50 MiB 大小限制')
  const chunks:Buffer[]=[];let length=0
  for(;;){const chunk=Buffer.allocUnsafe(Math.min(64*1024,NOVEL_SOURCE_LIMITS.fileBytes+1-length));const {bytesRead}=await handle.read(chunk,0,chunk.length,null);if(!bytesRead)break;length+=bytesRead;if(length>NOVEL_SOURCE_LIMITS.fileBytes)fail('文件超过 50 MiB 大小限制');chunks.push(chunk.subarray(0,bytesRead))}
  if(!same(before,proof(await handle.stat({bigint:true}))))fail('读取期间来源文件发生变化')
  await checkIdentity(chain)
  return {bytes:Buffer.concat(chunks,length),proof:before,ancestors:currentAncestors}
 }finally{await handle.close()}
}

export interface PdfSourceIdentity {path:string;proof:ImportProof;ancestors?:ImportFile['ancestors'];hash?:string}
export interface PdfSourceSelection {path:string;grant?:ImportSourceGrant;rootChain?:Awaited<ReturnType<typeof pathIdentity>>;protectedRoots?:string[];maxBytes?:number}
export type PreparedPdfDirectory={kind:'directory';path:string;stat:BigIntStats;chain:Awaited<ReturnType<typeof pathIdentity>>}
/** The PDF registry owns the first import-stage grant/identity FS operation. */
export async function prepareNovelPdfSource(selection:PdfSourceSelection,context:PdfJobContext):Promise<{kind:'file';source:PdfSourceIdentity}|PreparedPdfDirectory>{
 context.check();const original=resolve(selection.path)
 if(selection.grant)await verifyNovelSourceGrant(selection.grant,context)
 if(selection.rootChain)await checkIdentity(selection.rootChain,context)
 const stat=await identityIo(context,()=>lstat(original,{bigint:true}));if(stat.isSymbolicLink())fail('符号链接已排除')
 const path=selection.grant?original:await canonicalSelection(original,context),chain=await pathIdentity(path,undefined,context)
 if(!same(chain[0].proof,proof(stat)))fail('来源文件或目录发生变化，请重新选择')
 if(selection.protectedRoots?.some(root=>within(path,root)))fail('此目录受保护，不能导入')
 if(stat.isDirectory())return {kind:'directory',path,stat,chain}
 if(!stat.isFile())fail('仅支持普通文本文件')
 if(stat.size>BigInt(NOVEL_SOURCE_LIMITS.fileBytes))fail('文件超过 50 MiB 大小限制')
 if(Number(stat.size)>(selection.maxBytes??NOVEL_SOURCE_LIMITS.totalBytes))fail('来源总大小超过 100 MiB 限制')
 const expected=selection.grant&&!selection.grant.directory&&selection.grant.path===original?selection.grant.proof:chain[0].proof
 if(!same(expected,chain[0].proof))fail('来源文件已发生变化，请重新选择')
 return {kind:'file',source:{path,proof:expected,ancestors:chain.filter(item=>item.directory).map(item=>({path:item.path,device:item.proof.device,inode:item.proof.inode}))}}
}
export async function verifyNovelPdfSelection(selection:PdfSourceSelection,context:PdfJobContext){if(selection.rootChain)await checkIdentity(selection.rootChain,context);if(selection.grant)await checkIdentity(grantChain(selection.grant),context);context.check()}
/** Only called after a PDF registry slot is acquired. One exact, transferable allocation. */
export async function readNovelPdfSnapshot(source:PdfSourceIdentity,context:PdfJobContext){
 context.check();const chain=await pathIdentity(source.path,undefined,context);context.check()
 const before=chain[0].proof,ancestors=chain.filter(item=>item.directory).map(item=>({path:item.path,device:item.proof.device,inode:item.proof.inode}))
 if(!same(before,source.proof)||source.ancestors?.some(expected=>!ancestors.some(current=>current.path===expected.path&&current.device===expected.device&&current.inode===expected.inode)))fail('来源文件或授权目录身份已变化，请重新选择')
 const size=Number(before.size);if(!Number.isSafeInteger(size)||size<0||size>NOVEL_SOURCE_LIMITS.fileBytes)fail('文件超过 50 MiB 大小限制')
 context.check();const handle=await open(source.path,constants.O_RDONLY|constants.O_NOFOLLOW)
 try{
  context.check();if(!same(before,proof(await handle.stat({bigint:true}))))fail('来源不是原来的普通文件');context.check()
  context.reserveSource(size);const bytes=new Uint8Array(new ArrayBuffer(size)),hash=createHash('sha256');let offset=0
  while(offset<size){context.check();const read=()=>handle.read(bytes,offset,Math.min(64*1024,size-offset),offset),result=await(context.sourceRead?context.sourceRead('snapshot',read):read());context.check();if(!result.bytesRead)fail('读取期间来源文件发生变化');hash.update(bytes.subarray(offset,offset+result.bytesRead));offset+=result.bytesRead}
  const scratch=Buffer.allocUnsafeSlow(64*1024);context.check();const readEnd=()=>handle.read(scratch,0,scratch.length,offset);if((await(context.sourceRead?context.sourceRead('snapshot',readEnd):readEnd())).bytesRead)fail('读取期间来源文件发生变化');context.check()
  if(!same(before,proof(await handle.stat({bigint:true}))))fail('读取期间来源文件发生变化');await checkIdentity(chain,context);context.check()
  const digest=hash.digest('hex');if(source.hash&&digest!==source.hash)fail('来源文件内容已发生变化，请重新选择')
  return {bytes,proof:before,ancestors,hash:digest}
 }finally{await handle.close()}
}
/** A post-render/cache/token check never allocates a second PDF snapshot. */
export async function verifyNovelPdfSource(source:PdfSourceIdentity,context:PdfJobContext){
 context.check();const chain=await pathIdentity(source.path,undefined,context);context.check();const before=chain[0].proof
 if(!same(before,source.proof)||source.ancestors?.some(expected=>!chain.some(item=>item.directory&&item.path===expected.path&&item.proof.device===expected.device&&item.proof.inode===expected.inode)))fail('来源文件或授权目录身份已变化，请重新选择')
 const handle=await open(source.path,constants.O_RDONLY|constants.O_NOFOLLOW)
 try{context.check();if(!same(before,proof(await handle.stat({bigint:true}))))fail('来源不是原来的普通文件');const hash=createHash('sha256'),scratch=Buffer.allocUnsafeSlow(64*1024);let offset=0
  for(;;){context.check();const read=()=>handle.read(scratch,0,scratch.length,offset),result=await(context.sourceRead?context.sourceRead('verify',read):read());context.check();if(!result.bytesRead)break;offset+=result.bytesRead;if(offset>NOVEL_SOURCE_LIMITS.fileBytes)fail('文件超过 50 MiB 大小限制');hash.update(scratch.subarray(0,result.bytesRead))}
  if(offset!==Number(before.size)||!same(before,proof(await handle.stat({bigint:true}))))fail('读取期间来源文件发生变化');await checkIdentity(chain,context);context.check();if(source.hash&&hash.digest('hex')!==source.hash)fail('来源文件内容已发生变化，请重新选择')
 }finally{await handle.close()}
}

/** Native-dialog paths only. Every rejected entry is returned for source review. */
export async function scanNovelSources(paths:string[],options:{protectedRoots?:string[];grants?:ImportSourceGrant[];pdfClient?:NovelImportPdfClient;assertCurrent?:()=>void;operationId?:string}={}):Promise<ImportFile[]>{
 const files:ImportFile[]=[];let totalBytes=0,totalCharacters=0,stopped=false
 const seenHashes=new Set<string>(),seenPaths=new Set<string>(),seenDirs=new Set<string>()
 const protectedRoots=await Promise.all((options.protectedRoots??[]).map(async p=>{const absolute=resolve(p);try{return await realpath(absolute)}catch{return absolute}}))
 function record(path:string,sourceRoot:string,error?:string,bytes=0):ImportFile{
  const name=relative(dirname(sourceRoot),path)||basename(path)
  const file:ImportFile={id:randomUUID(),name,path,sourceRoot,format:formatOf(path),bytes,hash:'',text:'',included:!error,...(error?{error}:{})};files.push(file);return file
 }
 async function visit(path:string,sourceRoot:string,rootChain?:Awaited<ReturnType<typeof pathIdentity>>,grant?:ImportSourceGrant):Promise<void>{
  options.assertCurrent?.()
  if(stopped)return
  if(files.length>=NOVEL_SOURCE_LIMITS.files){record(path,sourceRoot,'来源超过 5000 项限制，请拆分导入');stopped=true;return}
  if(protectedRoots.some(p=>within(path,p))){record(path,sourceRoot,'此目录受保护，不能导入');return}
  if(isHidden(basename(path))){record(path,sourceRoot,'隐藏或系统项目已排除');return}
  if(seenPaths.has(path)){record(path,sourceRoot,'重复选择的来源已排除');return}seenPaths.add(path)
  try{
   let stat:BigIntStats,directoryChain:Awaited<ReturnType<typeof pathIdentity>>|undefined
   if(formatOf(path)==='pdf'){
    const {defaultNovelImportPdfClient}=await import('./novel-import-pdf-client'),client=options.pdfClient??defaultNovelImportPdfClient()
    const inspected=await client.inspectSelected({path,grant,rootChain,protectedRoots,maxBytes:NOVEL_SOURCE_LIMITS.totalBytes-totalBytes},{operationId:options.operationId??randomUUID(),assertCurrent:options.assertCurrent??(()=>{})})
    options.assertCurrent?.()
    if(inspected.kind==='file'){
     const file=record(inspected.path,sourceRoot===path?inspected.path:sourceRoot,undefined,Number(inspected.proof.size));file.proof=inspected.proof;file.ancestors=inspected.ancestors;file.hash=inspected.hash;Object.assign(file,inspected.extracted);totalBytes+=file.bytes;totalCharacters+=file.text.length
     if(totalCharacters>NOVEL_SOURCE_LIMITS.characters){file.included=false;file.text='';file.error='来源总文字超过 2500 万字符限制';return}
     if(seenHashes.has(file.hash)){file.error='检测到重复内容，请核对并排除重复来源';file.included=false}else seenHashes.add(file.hash)
     if(file.pdfInspection?.scanState==='document-error'){file.error='PDF 无法完整解析，请检查密码、资源或文件内容';file.included=false}
     return
    }
    if(sourceRoot===path)sourceRoot=inspected.path;path=inspected.path;stat=inspected.stat;directoryChain=inspected.chain
   }else{
    if(grant)await checkIdentity(grantChain(grant))
    if(rootChain)await checkIdentity(rootChain)
    stat=await lstat(path,{bigint:true})
   }
   if(stat.isSymbolicLink()){record(path,sourceRoot,'符号链接已排除');return}
   if(stat.isDirectory()){
    const chain=directoryChain??await pathIdentity(path),key=String(stat.dev)+':'+String(stat.ino)
    if(rootChain)await checkIdentity(rootChain)
    if(seenDirs.has(key)){record(path,sourceRoot,'重复目录已排除');return}seenDirs.add(key)
    const entries:string[]=[];const directory=await opendir(path)
    for await(const entry of directory){entries.push(entry.name);if(entries.length>NOVEL_SOURCE_LIMITS.files){record(path,sourceRoot,'目录超过 5000 项限制，请拆分导入');return}}
    await checkIdentity(chain)
    if(grant)await checkIdentity(grantChain(grant))
    for(const entry of entries.sort(natural.compare))await visit(join(path,entry),sourceRoot,chain,grant)
    await checkIdentity(chain)
    if(grant)await checkIdentity(grantChain(grant))
    return
   }
   const file=record(path,sourceRoot,undefined,Number(stat.size))
   try{
    if(!stat.isFile())fail('仅支持普通文本文件')
    const format=file.format
    if(format==='unsupported')fail('不支持此文件格式')
    if(stat.size>BigInt(NOVEL_SOURCE_LIMITS.fileBytes))fail('文件超过 50 MiB 大小限制')
    if(totalBytes+Number(stat.size)>NOVEL_SOURCE_LIMITS.totalBytes)fail('来源总大小超过 100 MiB 限制')
    const selectedFile=grant&&!grant.directory&&grant.path===path?grant:undefined
    const snapshot=await readSource(path,selectedFile?.proof??proof(stat),selectedFile?.ancestors);if(rootChain)await checkIdentity(rootChain);if(grant)await checkIdentity(grantChain(grant));totalBytes+=snapshot.bytes.length
    file.proof=snapshot.proof;file.ancestors=snapshot.ancestors;file.hash=digest(snapshot.bytes)
    const extracted=await extractNovelText(snapshot.bytes,format)
    if(totalCharacters+extracted.text.length>NOVEL_SOURCE_LIMITS.characters)fail('来源总文字超过 2500 万字符限制')
    totalCharacters+=extracted.text.length;Object.assign(file,extracted)
    if(seenHashes.has(file.hash)){file.error='检测到重复内容，请核对并排除重复来源';file.included=false}else seenHashes.add(file.hash)
   }catch(error){if(error instanceof DOMException&&error.name==='AbortError')throw error;file.included=false;file.text='';file.error=safeError(error)}
  }catch(error){if(error instanceof DOMException&&error.name==='AbortError')throw error;record(path,sourceRoot,safeError(error))}
 }
 for(const selected of paths){
  options.assertCurrent?.()
  const path=resolve(selected)
  // Native macOS paths may use the /var -> /private/var system alias. Resolve ancestors
  // once at the grant boundary, while still making a directly selected link visible.
  try{const grant=options.grants?.find(item=>item.path===path);if(options.grants&&!grant)fail('来源选择授权已失效，请重新选择');if(formatOf(path)==='pdf'){await visit(path,path,undefined,grant);continue}if(grant)await verifyNovelSourceGrant(grant);const stat=await lstat(path);const canonical=stat.isSymbolicLink()?path:await canonicalSelection(path);const rootChain=grant?grantChain(grant):stat.isSymbolicLink()?undefined:await pathIdentity(canonical);await visit(canonical,canonical,rootChain,grant)}catch(error){if(error instanceof DOMException&&error.name==='AbortError')throw error;record(path,path,safeError(error))}
 }
 return files
}
function safeError(error:unknown){
 const message=error instanceof Error?error.message:''
 // Only our bounded diagnostic messages may reach the renderer. Library errors can contain paths/text.
 return /^(来源|符号链接|文件超过|读取期间|此目录|隐藏|重复|仅支持|不支持|目录超过|提取文字|DOC |DOCX |PDF |HTML |编码|文本|无法识别文本编码|ZIP )/.test(message)&&!message.includes('/')&&!message.includes('\\')?message:'文件无法读取或解析，请检查文件内容、权限和格式'
}

function decode(bytes:Uint8Array,requested?:string):Extracted{
 let encoding=requested?.toLowerCase(),body=bytes
 const detected=!encoding
 if(encoding&&!['utf-8','utf-16le','utf-16be','gb18030'].includes(encoding))fail('编码不受支持')
 if(!encoding){
  if(bytes[0]===0xff&&bytes[1]===0xfe)encoding='utf-16le'
  else if(bytes[0]===0xfe&&bytes[1]===0xff)encoding='utf-16be'
  // A strict GB18030 decode that succeeds is adopted without author confirmation.
  else{try{new TextDecoder('utf-8',{fatal:true}).decode(bytes);encoding='utf-8'}catch{encoding='gb18030'}}
 }
 let text:string
 try{
  // BOM is an encoding marker, not a visible novel character; all other whitespace is untouched.
  if(encoding==='utf-8'&&bytes[0]===0xef&&bytes[1]===0xbb&&bytes[2]===0xbf)body=bytes.subarray(3)
  if((encoding==='utf-16le'&&bytes[0]===0xff&&bytes[1]===0xfe)||(encoding==='utf-16be'&&bytes[0]===0xfe&&bytes[1]===0xff))body=bytes.subarray(2)
  text=new TextDecoder(encoding,{fatal:true,ignoreBOM:true}).decode(body)
 }catch{return fail(detected?'无法识别文本编码，请改选编码或排除此文件':'编码无法解码此文件，请选择正确编码')}
 if(text.includes('\0'))fail('文本含有二进制空字符，请核对编码')
 return {text:checkCharacters(text),encoding,requiresEncodingConfirmation:false,...(detected?{encodingDetected:true}:{})}
}

function sections(parts:{name:string;text:string;kind:'body'|'attachment'}[]):Extracted{
 let text='';const ranges:NonNullable<ImportFile['parts']>=[]
 for(const part of parts){if(!part.text.trim())continue;const start=text.length;if(text)text+='\n\n';text+=part.text;checkCharacters(text);ranges.push({name:part.name,start,end:text.length,kind:part.kind})}
 return {text,parts:ranges}
}
function xmlText(xml:string,mode:'ordinary'|'textboxes'='ordinary'){
 if(/<!\s*(DOCTYPE|ENTITY)/i.test(xml))fail('DOCX 不支持外部实体或 DTD')
 const result:string[]=[];let length=0,textDepth=0,skipDepth=0,textboxDepth=0;const stack:string[]=[]
 const append=(text:string)=>{if(mode==='textboxes'?textboxDepth===0:textboxDepth>0)return;length+=text.length;if(length>NOVEL_SOURCE_LIMITS.characters)fail('提取文字超过 2500 万字符限制');result.push(text)}
 const parser=new Parser({
  onopentag(name){const tag=name.split(':').pop()!;stack.push(tag);if(tag==='txbxContent')textboxDepth++;if(skipDepth){skipDepth++;return}if(tag==='del'){skipDepth=1;return}if(['t','delText'].includes(tag))textDepth++;if(tag==='tab')append('\t');if(['br','cr'].includes(tag))append('\n')},
  ontext(text){if(textDepth&&!skipDepth)append(text)},
  onclosetag(name,implied){if(implied&&!xml.slice(parser.startIndex,parser.endIndex+1).endsWith('/>'))fail('DOCX XML 标签不完整');const tag=stack.pop();if(tag!==name.split(':').pop())fail('DOCX XML 标签不匹配');if(tag==='txbxContent')textboxDepth--;if(skipDepth){skipDepth--;return}if(['t','delText'].includes(tag??''))textDepth--;if(tag==='p'||tag==='tr')append('\n');if(tag==='tc')append('\t')},
 },{xmlMode:true,decodeEntities:true})
 parser.write(xml);parser.end();return result.join('')
}
function htmlText(html:string){
 const result:string[]=[];let skip=0,length=0
 const append=(text:string)=>{length+=text.length;if(length>NOVEL_SOURCE_LIMITS.characters)fail('提取文字超过 2500 万字符限制');result.push(text)}
 const blocks=new Set(['p','div','section','article','header','footer','h1','h2','h3','h4','h5','h6','li','blockquote','pre','tr','title'])
 const parser=new Parser({onopentag(name){if(skip){skip++;return}if(['script','style','template'].includes(name)){skip=1;return}if(name==='br')append('\n');if(blocks.has(name)&&result.length)append('\n')},ontext(text){if(!skip)append(text)},onclosetag(name){if(skip){skip--;return}if(blocks.has(name))append('\n');if(name==='td'||name==='th')append('\t')}},{decodeEntities:true})
 parser.write(html);parser.end();return result.join('')
}

type ZipPart={name:string;size:number;compressed:number;offset:number;method:number;crc:number}
/** Validate central-directory declared inflation before any decompression. ZIP64/encryption are deliberately unsupported. */
function zipParts(bytes:Buffer):ZipPart[]{
 let end=-1
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50&&i+22+bytes.readUInt16LE(i+20)===bytes.length){end=i;break}
 if(end<0)fail('DOCX ZIP 容器损坏')
 const count=bytes.readUInt16LE(end+10),size=bytes.readUInt32LE(end+12),start=bytes.readUInt32LE(end+16)
 if(bytes.readUInt16LE(end+4)||bytes.readUInt16LE(end+6)||count!==bytes.readUInt16LE(end+8)||count===65535||start===0xffffffff||size===0xffffffff||count>NOVEL_SOURCE_LIMITS.zipEntries)fail('ZIP 分卷、ZIP64 或条目数量超过限制')
 if(start+size>end)fail('DOCX ZIP 目录损坏')
 let cursor=start,total=0;const parts:ZipPart[]=[],names=new Set<string>()
 for(let i=0;i<count;i++){
  if(cursor+46>start+size||bytes.readUInt32LE(cursor)!==0x02014b50)fail('DOCX ZIP 条目损坏')
  const flags=bytes.readUInt16LE(cursor+8),method=bytes.readUInt16LE(cursor+10),compressed=bytes.readUInt32LE(cursor+20),expanded=bytes.readUInt32LE(cursor+24),nameLength=bytes.readUInt16LE(cursor+28),extraLength=bytes.readUInt16LE(cursor+30),commentLength=bytes.readUInt16LE(cursor+32),offset=bytes.readUInt32LE(cursor+42)
  if(cursor+46+nameLength+extraLength+commentLength>start+size)fail('DOCX ZIP 条目损坏')
  const name=bytes.subarray(cursor+46,cursor+46+nameLength).toString('utf8')
  if(flags&1||![0,8].includes(method)||expanded===0xffffffff||offset===0xffffffff)fail('ZIP 加密或压缩方式不受支持')
  if(name.startsWith('/')||name.includes('\\')||name.split('/').includes('..')||names.has(name))fail('DOCX ZIP 条目路径无效或重复')
  names.add(name);total+=expanded
  if(expanded>NOVEL_SOURCE_LIMITS.fileBytes||total>NOVEL_SOURCE_LIMITS.zipBytes)fail('ZIP 膨胀大小超过限制')
  parts.push({name,size:expanded,compressed,offset,method,crc:bytes.readUInt32LE(cursor+16)})
  cursor+=46+nameLength+extraLength+commentLength
 }
 if(cursor!==start+size)fail('DOCX ZIP 目录不完整')
 return parts
}
const crcTable=Array.from({length:256},(_,n)=>{let crc=n;for(let bit=0;bit<8;bit++)crc=crc&1?0xedb88320^(crc>>>1):crc>>>1;return crc>>>0})
function unzipPart(bytes:Buffer,part:ZipPart){
 const offset=part.offset
 if(offset+30>bytes.length||bytes.readUInt32LE(offset)!==0x04034b50)fail('DOCX ZIP 本地条目损坏')
 const nameLength=bytes.readUInt16LE(offset+26),extra=bytes.readUInt16LE(offset+28),start=offset+30+nameLength+extra
 if(start+part.compressed>bytes.length||bytes.subarray(offset+30,offset+30+nameLength).toString('utf8')!==part.name||bytes.readUInt16LE(offset+8)!==part.method)fail('DOCX ZIP 本地条目不一致')
 const source=bytes.subarray(start,start+part.compressed)
 const data=part.method===0?source:inflateRawSync(source,{maxOutputLength:Math.min(part.size+1,NOVEL_SOURCE_LIMITS.fileBytes+1)})
 if(data.length!==part.size)fail('ZIP 实际膨胀大小与声明不符')
 let crc=0xffffffff;for(const byte of data)crc=crcTable[(crc^byte)&255]^(crc>>>8)
 if(((crc^0xffffffff)>>>0)!==part.crc)fail('DOCX ZIP 校验失败')
 return data
}
async function docxText(bytes:Uint8Array):Promise<Extracted>{
 const buffer=Buffer.from(bytes),parts=zipParts(buffer)
 // JSZip validates the package structure without inflating entries. The bounded reader below checks actual output and CRC.
 await JSZip.loadAsync(buffer,{checkCRC32:false,createFolders:false})
 if(!parts.some(p=>p.name==='[Content_Types].xml')||!parts.some(p=>p.name==='word/document.xml'))fail('DOCX 缺少正文文档')
 const output:{name:string;text:string;kind:'body'|'attachment'}[]=[]
 for(const part of parts.filter(p=>p.name==='word/document.xml'||(/^word\//.test(p.name)&&/\.(xml|html?|txt)$/i.test(p.name))).sort((a,b)=>a.name==='word/document.xml'?-1:b.name==='word/document.xml'?1:natural.compare(a.name,b.name))){
  const raw=new TextDecoder('utf-8',{fatal:true}).decode(unzipPart(buffer,part))
  const text=/\.xml$/i.test(part.name)?xmlText(raw):/\.html?$/i.test(part.name)?htmlText(raw):raw
  output.push({name:part.name,text,kind:part.name==='word/document.xml'?'body':'attachment'})
  if(/\.xml$/i.test(part.name)&&/<(?:\w+:)?txbxContent\b/.test(raw))output.push({name:part.name+' — 文本框 textboxes',text:xmlText(raw,'textboxes'),kind:'attachment'})
 }
 return sections(output)
}
async function docText(bytes:Uint8Array):Promise<Extracted>{
 if(bytes.length<512||!Buffer.from(bytes.subarray(0,8)).equals(Buffer.from([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1])))fail('DOC 不是有效的二进制 Word 文件')
 const doc=await new WordExtractor().extract(Buffer.from(bytes)),options={filterUnicode:false}
 return sections([
  {name:'正文',text:doc.getBody(options),kind:'body'},
  {name:'脚注 footnotes',text:doc.getFootnotes(options),kind:'attachment'},
  {name:'尾注 endnotes',text:doc.getEndnotes(options),kind:'attachment'},
  {name:'批注',text:doc.getAnnotations(options),kind:'attachment'},
  {name:'页眉 headers',text:doc.getHeaders({...options,includeFooters:false}),kind:'attachment'},
  {name:'页脚 footers',text:doc.getFooters(options),kind:'attachment'},
  {name:'正文文本框',text:doc.getTextboxes({...options,includeHeadersAndFooters:false}),kind:'attachment'},
  {name:'页眉页脚文本框',text:doc.getTextboxes({...options,includeBody:false}),kind:'attachment'},
 ])
}
async function pdfText(bytes:Uint8Array,client?:NovelImportPdfClient):Promise<Extracted>{
 const {defaultNovelImportPdfClient}=await import('./novel-import-pdf-client')
 return (client??defaultNovelImportPdfClient()).inspectBytes(bytes)
}

export async function extractNovelText(bytes:Uint8Array,format:ImportFormat,encoding?:string,options?:{pdfClient?:NovelImportPdfClient}):Promise<Extracted>{
 if(bytes.byteLength>NOVEL_SOURCE_LIMITS.fileBytes)fail('文件超过 50 MiB 大小限制')
 let result:Extracted
 if(format==='txt'||format==='md')result=decode(bytes,encoding)
 else if(format==='html'||format==='htm'){const decoded=decode(bytes,encoding);result={...decoded,text:htmlText(decoded.text)}}
 else if(format==='doc')result=await docText(bytes)
 else if(format==='docx')result=await docxText(bytes)
 else if(format==='pdf')result=await pdfText(bytes,options?.pdfClient)
 else return fail('不支持此文件格式')
 checkCharacters(result.text)
 if(!result.text.trim()&&!(format==='pdf'&&result.pdfInspection?.blocker))fail('文本中没有可导入的文字')
 return result
}
export async function redecodeNovelFile(file:ImportFile,encoding:string):Promise<ImportFile>{
 if(!['txt','md','html','htm'].includes(file.format))fail('此文件不支持重新选择编码')
 if(!file.ancestors?.length)fail('来源授权目录身份缺失，请重新选择')
 const snapshot=await readSource(file.path,file.proof,file.ancestors)
 if(digest(snapshot.bytes)!==file.hash)fail('来源文件已发生变化，请重新选择')
 return {...file,...await extractNovelText(snapshot.bytes,file.format as ImportFormat,encoding),proof:snapshot.proof,error:undefined,included:true}
}
export async function verifyNovelSources(files:ImportFile[]):Promise<void>{
 for(const file of files.filter(f=>f.included)){
  if(!file.proof||!file.hash||file.error||!file.ancestors?.length)fail('来源尚未完成核对')
  if(file.format==='pdf'){const {defaultNovelImportPdfClient}=await import('./novel-import-pdf-client');await defaultNovelImportPdfClient().verify(file,{operationId:randomUUID(),assertCurrent:()=>{}});continue}
  const snapshot=await readSource(file.path,file.proof,file.ancestors)
  if(digest(snapshot.bytes)!==file.hash)fail('来源文件内容已发生变化，请重新选择')
 }
}
