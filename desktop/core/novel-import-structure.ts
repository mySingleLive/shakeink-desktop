import {z} from 'zod'
import {basename,dirname} from 'node:path'
import type {ImportAiRequest,ImportAiResult,ImportSession,ImportUnit} from '../shared/novel-import'
import type {ImportChapterCut} from './novel-import-chapters'
import {detectImportChapterCuts,importVolumeGroups,validateImportVolumeName,hasSubstantiveImportPrologue as substantivePrologue} from './novel-import-chapters'
import {importChapters,importHash,importScopeHash,importSessionChapters,safeImportBoundary,sourceBody} from './novel-import'

const title=z.string().min(1).max(300).refine(value=>value===value.trim()&&value.isWellFormed()&&!/[\r\n\u0000-\u001f]/u.test(value))
const volumeContextSchema=z.object({unitId:z.string().min(1),start:z.number().int().nonnegative(),end:z.number().int().nonnegative(),text:z.string().min(1).max(2000),candidates:z.array(title).max(16),unitIds:z.array(z.string().min(1)).max(2000).optional()}).strict().superRefine((value,ctx)=>{if(value.unitIds&&(value.unitIds.length<2||new Set(value.unitIds).size!==value.unitIds.length||value.unitIds[0]!==value.unitId))ctx.addIssue({code:'custom',message:'卷名证据来源单元无效'})})
const metadataSchema=z.object({
 version:z.literal(1),title,headingTitle:title,relativePath:z.string().min(1).max(2000),format:z.enum(['txt','md','doc','docx','pdf','html','htm']),
 source:z.enum(['heading','filename','directory']),fileStart:z.number().int().nonnegative(),fileEnd:z.number().int().nonnegative(),fileOffset:z.number().int().nonnegative(),
 blankBefore:z.boolean(),blankAfter:z.boolean(),headingLevel:z.number().int().min(1).max(6).optional(),folderDepth:z.number().int().min(1).max(100).optional(),page:z.number().int().min(1).max(5000).optional(),forced:z.boolean(),volume:title.optional(),chapterTitle:title.optional(),volumeContext:volumeContextSchema.optional(),
}).strict()
export type ImportStructureCandidateMetadata=z.infer<typeof metadataSchema>
export interface ImportStructureCut extends ImportChapterCut {candidateId?:string}
export interface ImportStructureDecision {chapterCuts:ImportStructureCut[];ignoredStarts:number[]}
export interface ImportStructureDraft {scopeHash:string;candidates:ImportUnit[];chapterCuts:ImportStructureCut[];ignoredStarts:number[];batches:{key:string;unitIds:string[]}[];resultHash:string}

export function importStructureCandidateMetadata(unit:ImportUnit):ImportStructureCandidateMetadata{
 const parsed=metadataSchema.safeParse(unit.part?readMetadata(unit.part):undefined)
 if(!parsed.success)throw Error('卷章候选元数据无效')
 return parsed.data
}
function readMetadata(part:string):unknown{try{return JSON.parse(part)}catch{throw Error('卷章候选元数据不是有效JSON')}}
function unitTitle(name:string){return basename(name).replace(/\.[^.]+$/u,'').trim()}
function markdownTitle(line:string){const match=/^[\t ]*(#{1,6})[\t ]+(.+?)[\t ]*$/u.exec(line);if(!match)return{title:line.trim()};return{title:match[2].replace(/[\t ]+#+[\t ]*$/u,'').trim(),headingLevel:match[1].length as 1|2|3|4|5|6}}
function explicitHeading(line:string){return /^(?:第[\d零〇一二三四五六七八九十百千万两]+[章节回卷部册编篇]|(?:chapter|part|volume)\s+[\dIVXLCDM]+|序章|序言|楔子|番外|尾声)/iu.test(line)}
function markdownHierarchy(body:string){
 const headings=[...body.matchAll(/^[\t ]*(#{1,6})[\t ]+([^\r\n]+)$/gmu)].flatMap(match=>{const title=markdownTitle(match[0]).title.trim();return title?[{start:match.index!,level:match[1].length,title}]:[]}),starts=new Set(headings.map(h=>h.start))
 if(headings.length<2)return{starts,complete:false}
 const leaf=Math.max(...headings.map(h=>h.level));if(leaf<2)return{starts,complete:false}
 const cuts:ImportChapterCut[]=[],volumes=new Set<string>(),parents=new Map<number,(typeof headings)[number]>();let previousLeaf=-1,previousParent=-1,parentHasLeaf=false
 for(const heading of headings){
  if(heading.level<leaf){if(previousLeaf>=0&&!parentHasLeaf)return{starts,complete:false};parents.set(heading.level,heading);if(heading.level===leaf-1)parentHasLeaf=false;continue}
  const parent=parents.get(leaf-1)
  if(!parent||parent.start<previousLeaf&&parent.start!==previousParent)return{starts,complete:false}
  const volume=parent.title.replace(/^第[\d零〇一二三四五六七八九十百千万两]+[卷部册编篇](?:[\t ]*[：:][\t ]*|[\t ]+)/u,'').trim()||parent.title
  if(parent.start!==previousParent&&volumes.has(volume))return{starts,complete:false}
  volumes.add(volume);cuts.push({start:parent.start===previousParent?heading.start:parent.start,title:heading.title,volume});previousParent=parent.start;previousLeaf=heading.start;parentHasLeaf=true
 }
 if(!cuts.length)return{starts,complete:false}
 if(substantivePrologue(body.slice(0,cuts[0].start)))cuts.unshift({start:0,title:headings[0].start===0&&headings[0].level<leaf-1?headings[0].title:'正文序言'})
 return{cuts,starts,complete:parentHasLeaf}
}
/** 一–九十九 or digits; larger or irregular numerals are not needed for volume order. */
function smallNumber(raw:string):number|undefined{
 if(/^\d+$/u.test(raw))return Number(raw)
 const digits='零一二三四五六七八九',match=/^([一二三四五六七八九])?(十)?([一二三四五六七八九])?$/u.exec(raw)
 if(!match||!match[0])return undefined
 if(!match[2])return match[3]?undefined:digits.indexOf(match[1])
 return (match[1]?digits.indexOf(match[1]):1)*10+(match[3]?digits.indexOf(match[3]):0)
}
/** An unnamed volume after a chapter-number restart takes its name from the excluded author note just
 * before it, only when that note names the next volume number with exactly one new quoted name. */
function restartVolumeName(note:string|undefined,previous:number|undefined,used:Set<string>):string|undefined{
 if(!note||previous===undefined)return
 const names=new Set<string>()
 for(const sentence of note.split(/[。！？!?\r\n]/u)){
  if(![...sentence.matchAll(/第([\d零〇一二三四五六七八九十]+)[部卷]/gu)].some(match=>smallNumber(match[1])===previous+1))continue
  for(const match of sentence.matchAll(/[“"]([^“”"\r\n]{1,30})[”"]/gu)){const name=match[1].trim();if(name&&!used.has(name))names.add(name)}
 }
 if(names.size!==1)return
 const [name]=names;try{validateImportVolumeName(name)}catch{return};return name
}
function plainHierarchy(body:string,notes=new Map<number,string>()):{cuts:ImportChapterCut[];complete:boolean;starts:Set<number>}|undefined{
 const headings=[...body.matchAll(/^[^\r\n]+$/gmu)].flatMap(match=>{
  const title=match[0].trim(),number='[\\d零〇一二三四五六七八九十百千万两]+',parent=new RegExp('^第('+number+')[卷部册编](?:[\\t ]*[：:][\\t ]*|[\\t ]+)([^\\r\\n]{1,150})$','u').exec(title),leaf=new RegExp('^第('+number+')[章节回][^\\r\\n]{0,150}$','u').exec(title),entry=/^[^\r\n。！？!?，,；;]{1,40}[（(]([\d一二三四五六七八九十]+)[）)]$/u.exec(title)
  if(parent&&!/[。！？!?，,；;]/u.test(parent[2]))return{start:match.index!,title,parent:true,volume:parent[2].trim(),restart:false,number:smallNumber(parent[1])}
  // A standalone 番外 line is the parent of the extra stories that follow it.
  if(title==='番外')return{start:match.index!,title,parent:true,volume:title,restart:false}
  if(leaf)return{start:match.index!,title,parent:false,volume:'',restart:/^第(?:一|0*1)[章节回]/u.test(title)}
  if(entry)return{start:match.index!,title,parent:false,volume:'',restart:false,entry:smallNumber(entry[1])}
  return[]
 })
 if(!headings.some(h=>h.parent)||headings.filter(h=>!h.parent&&h.entry===undefined).length<2)return undefined
 const cuts:ImportChapterCut[]=[],volumes=new Set<string>(),starts=new Set<number>();let parent:(typeof headings)[number]|undefined,previousLeaf=-1,entries=0
 for(const heading of headings){
  if(heading.parent){parent=heading;entries=0;continue}
  // Numbered titles are chapters only inside 番外, and only as an unbroken 1, 2, 3… sequence.
  if(heading.entry!==undefined){if(parent?.volume!=='番外')continue;if(heading.entry!==++entries)return undefined}
  if(!parent||heading.start<previousLeaf)return undefined
  if(heading.restart&&previousLeaf>=0&&cuts.at(-1)?.volume===parent.volume){
   const name=restartVolumeName(notes.get(heading.start),parent.number,volumes);if(!name)return undefined
   parent={start:heading.start,title:heading.title,parent:true,volume:name,restart:false,number:parent.number!+1}
  }
  if(volumes.has(parent.volume)&&cuts.at(-1)?.volume!==parent.volume)return undefined
  volumes.add(parent.volume);cuts.push({start:cuts.at(-1)?.volume===parent.volume?heading.start:parent.start,title:heading.title,volume:parent.volume});previousLeaf=heading.start;starts.add(heading.start)
 }
 if(!cuts.length)return undefined
 const prefix=body.slice(0,cuts[0].start)
 if(prefix.trim())cuts.unshift({start:0,title:'正文序言'});else cuts[0].start=0
 return{cuts,complete:!prefix.trim()||substantivePrologue(prefix),starts}
}
function hasBlankBefore(text:string,index:number):boolean{
 if(index===0)return true
 let end=index
 if(text[end-1]==='\n'){end--;if(text[end-1]==='\r')end--}
 else if(text[end-1]==='\r')end--
 else return false
 let start=end
 while(start>0&&text[start-1]!=='\n'&&text[start-1]!=='\r')start--
 return /^[\t ]*$/u.test(text.slice(start,end))
}
const blankAfterPattern=/[\t ]*(?:\r\n|\r|\n)[\t ]*(?:\r\n|\r|\n)/uy
function hasBlankAfter(text:string,index:number):boolean{
 if(index===text.length)return true
 blankAfterPattern.lastIndex=index
 return blankAfterPattern.test(text)
}
/** Excluded source text that ends exactly where a body line starts, keyed by that body offset. */
function excludedNotes(s:ImportSession):Map<number,string>{
 const notes=new Map<number,string>();let offset=0
 for(const file of s.files){
  if(!file.included||file.error)continue
  let pending=''
  for(const unit of s.units.filter(unit=>unit.fileId===file.id).sort((a,b)=>a.start-b.start)){
   if(unit.kind==='excluded'){pending+=unit.text;continue}
   if(unit.kind!=='body'){pending='';continue}
   if(pending){notes.set(offset,pending.slice(-2000));pending=''}
   offset+=unit.text.length
  }
 }
 return notes
}
export function collectImportStructureCandidates(s:ImportSession):{body:string;candidates:ImportUnit[];complete:boolean}{
 const body=sourceBody(s),candidates=new Map<string,ImportUnit>()
 if(!body)return{body,candidates:[],complete:true}
 const hierarchy=markdownHierarchy(body),plain=plainHierarchy(body,excludedNotes(s));let detected:ReturnType<typeof detectImportChapterCuts>
 try{detected=detectImportChapterCuts(body,{volumes:true})}catch{detected={cuts:[{start:0,title:'未分章正文'}],diagnostic:'旧卷章规则无法确认结构，请核对实际层级'}}
 const localCuts=new Map((hierarchy.cuts??plain?.cuts??detected.cuts).map(cut=>[cut.start,cut])),localStarts=[...localCuts.keys()].sort((a,b)=>a-b)
 const add=(unit:ImportUnit)=>{
  const meta=importStructureCandidateMetadata(unit),old=candidates.get(unit.id)
  if(old){const previous=importStructureCandidateMetadata(old);if(previous.title!==meta.title||previous.fileStart!==meta.fileStart)throw Error('卷章候选冲突');if(meta.forced&&!previous.forced)candidates.set(unit.id,unit);return}
  candidates.set(unit.id,unit)
 }
 let offset=0
 for(const file of s.files){
  if(!file.included||file.error)continue
  const units=s.units.filter(unit=>unit.fileId===file.id&&unit.kind==='body').sort((a,b)=>a.start-b.start)
  if(!units.length)continue
  if(file.format==='unsupported')throw Error('不支持的来源不能参与卷章识别')
  const start=offset,fileEnd=start+units.reduce((length,unit)=>length+unit.text.length,0),relativePath=file.name.replaceAll('\\','/'),directory=dirname(relativePath)
  let hasHeading=false,structuralVolume:string|undefined
  const addCandidate=(globalStart:number,globalEnd:number,line:string,fileOffset:number,source:'heading'|'filename'|'directory',forced:boolean,structuralVolume?:string,volumeContext?:ImportStructureCandidateMetadata['volumeContext'])=>{
   if(!safeImportBoundary(body,globalStart)||!safeImportBoundary(body,globalEnd))throw Error('卷章候选拆分Unicode字符')
   const parsed=markdownTitle(line),raw=(source==='heading'?parsed.title:line).trim();if(!raw)return
   const local=source==='directory'?undefined:localCuts.get(globalStart),prologue=local?.title==='正文序言'?body.slice(globalStart,localStarts.find(start=>start>globalStart)??body.length):'',forcedBoundary=(forced||!!local)&&!(local?.title==='正文序言'&&!substantivePrologue(prologue))
   const meta:ImportStructureCandidateMetadata={version:1,title:raw,headingTitle:raw,relativePath,format:file.format as ImportStructureCandidateMetadata['format'],source,fileStart:start,fileEnd,fileOffset,blankBefore:hasBlankBefore(file.text,fileOffset),blankAfter:hasBlankAfter(file.text,fileOffset+line.length),...(parsed.headingLevel?{headingLevel:parsed.headingLevel}:{}),...(directory!=='.'?{folderDepth:directory.split('/').length}:{}),...(file.pages?.some(page=>fileOffset>=page.start&&fileOffset<page.end)?{page:file.pages.find(page=>fileOffset>=page.start&&fileOffset<page.end)!.page}:{}),forced:forcedBoundary,...((local?.volume??structuralVolume)!==undefined?{volume:local?.volume??structuralVolume}:{}),...(local&&local.title!==raw?{chapterTitle:local.title}:{}),...(volumeContext?{volumeContext}:{})}
   add({id:`structure:${file.id}:${globalStart}:${source}`,fileId:file.id,start:globalStart,end:globalEnd,text:source==='heading'?body.slice(globalStart,globalEnd):'',kind:'body',part:JSON.stringify(meta)})
  }
  const scan=(line:string,globalStart:number,fileOffset:number)=>{
   const trimmed=line.trim()
   if(!trimmed||line.length>300)return
   const markdown=markdownTitle(line).headingLevel!==undefined,blankBefore=hasBlankBefore(file.text,fileOffset),blankAfter=hasBlankAfter(file.text,fileOffset+line.length),numbered=/(?:（[\d零〇一二三四五六七八九十百千万两]+）|\([\d零〇一二三四五六七八九十百千万两]+\))$/u.test(trimmed)
   const ordinary=line.length<=150&&!/[。！？!?，,；;]$/u.test(trimmed)&&blankBefore&&(blankAfter||numbered)
   if(!localCuts.has(globalStart)&&!explicitHeading(trimmed)&&!markdown&&!ordinary)return
   const local=localCuts.get(globalStart),previous=localCuts.get(localStarts[localStarts.indexOf(globalStart)-1]),hasPreviousChapter=!!previous&&!['正文序言','未分章正文'].includes(previous.title)&&!/^第(?:一|0*1)[章节回]/u.test(previous.title)&&!/^chapter[\t ]+0*1(?:\s|$)/iu.test(previous.title),restart=hasPreviousChapter&&!!detected.diagnostic?.includes('章号重启')&&/^第(?:一|0*1)[章节回]/u.test(markdownTitle(line).title)
   let volumeContext:ImportStructureCandidateMetadata['volumeContext']
   if(restart){
    const excluded:ImportUnit[]=[],adjacent=s.units.findIndex(unit=>unit.fileId===file.id&&unit.kind==='excluded'&&unit.end===fileOffset)
    for(let index=adjacent;index>=0;index--){const unit=s.units[index],end=excluded[0]?.start??fileOffset;if(unit.fileId!==file.id||unit.kind!=='excluded'||unit.end!==end)break;excluded.unshift(unit)}
    const source=excluded.map(unit=>unit.text).join('');let offset=Math.max(0,source.length-2000);if(!safeImportBoundary(source,offset))offset++
    const start=(excluded[0]?.start??fileOffset)+offset,end=fileOffset,text=source.slice(offset),candidates=[...new Set([...text.matchAll(/第[\d零〇一二三四五六七八九十百千万两]+[部卷][^。\r\n]{0,160}?[“"]([^“”]{1,300})[”"]/gu)].map(match=>match[1]))],unitIds=excluded.filter(unit=>unit.end>start&&unit.start<end).map(unit=>unit.id)
    if(candidates.length&&unitIds.length)volumeContext={unitId:unitIds[0],start,end,text,candidates,...(unitIds.length>1?{unitIds}:{})}
   }
   hasHeading=true;addCandidate(globalStart,globalStart+line.length,line,fileOffset,'heading',localCuts.has(globalStart),numbered?structuralVolume:undefined,volumeContext)
   if(trimmed==='番外')structuralVolume=trimmed
  }
  let unitOffset=start
  for(const unit of units){
   let cursor=0
   for(const match of unit.text.matchAll(/\r\n|\r|\n/gu)){scan(unit.text.slice(cursor,match.index),unitOffset+cursor,unit.start+cursor);cursor=match.index+match[0].length}
   scan(unit.text.slice(cursor),unitOffset+cursor,unit.start+cursor);unitOffset+=unit.text.length
  }
  if(!hasHeading||localCuts.has(start)&&![...candidates.values()].some(unit=>unit.start===start))addCandidate(start,start,unitTitle(relativePath),units[0].start,'filename',true)
  if(directory!=='.')addCandidate(start,start,basename(directory),units[0].start,'directory',false)
  offset=fileEnd
 }
 for(const start of localCuts.keys())if(![...candidates.values()].some(unit=>unit.start===start))throw Error('本地章界缺少可核对候选：'+start)
 const ordered=[...candidates.values()].sort((a,b)=>a.start-b.start||a.id.localeCompare(b.id)),complete=(hierarchy.complete===true&&!!hierarchy.cuts||plain?.complete===true||!hierarchy.cuts&&!plain&&!detected.diagnostic)&&ordered.every(unit=>{const meta=importStructureCandidateMetadata(unit),local=localCuts.get(unit.start),ambiguousParent=meta.forced&&meta.source==='heading'&&!local?.volume&&local?.title!=='未分章正文'&&local?.title!==meta.title;return !ambiguousParent&&(meta.forced||!!hierarchy.cuts&&hierarchy.starts.has(unit.start)||!hierarchy.cuts&&!!plain?.starts.has(unit.start)||/^(?:第[\d零〇一二三四五六七八九十百千万两]+[章节回卷部]|chapter\s+[\dIVXLCDM]+|序章|序言|楔子|番外|尾声)/iu.test(meta.headingTitle))})
 return{body,candidates:ordered,complete}
}

export function requiresImportStructureModel(s:ImportSession,collected=collectImportStructureCandidates(s)):boolean{
 if(!collected.body||s.chapterDetection?.mode==='manual')return false
 if(collected.complete)return false
 const chapters=s.chapters.length?s.chapters:importChapters(collected.body,undefined,1,2)
 try{importVolumeGroups(chapters)}catch{return true}
 const starts=new Set(chapters.map(chapter=>chapter.start))
 return collected.candidates.some(unit=>importStructureCandidateMetadata(unit).forced&&!starts.has(unit.start))||!collected.complete||!!s.chapterDetection?.diagnostic
}
export function importStructureScopeHash(s:ImportSession,candidates=collectImportStructureCandidates(s).candidates){return importHash({version:1,purpose:'structure',scope:importScopeHash(s,'classify'),body:sourceBody(s),candidates})}
export function importStructureBatchKey(scopeHash:string,units:ImportUnit[]){return importHash({version:1,purpose:'structure-batch',scopeHash,units:units.map(({kind:_kind,...unit})=>unit)})}
function normalizedHeading(value:string,volume:boolean){
 const number='[\\d零〇一二三四五六七八九十百千万两]+',marker=volume?'[卷部册编篇]':'[章节回]',pattern=new RegExp('^第'+number+marker+'(?:[\\t ]*[：:][\\t ]*|[\\t ]+)','u'),clean=value.replace(pattern,'').trim()
 return clean||value.trim()
}
function candidateValue(units:ImportUnit[],value:string,volume:boolean){
 return units.some(unit=>{const meta=importStructureCandidateMetadata(unit),raw=volume?[meta.volume,...(meta.volumeContext?.candidates??[]),meta.title]:[meta.title,meta.chapterTitle];return raw.some(candidate=>candidate===value||candidate!==undefined&&normalizedHeading(candidate,volume)===value)})
}
export function validateImportStructureDecisions(candidates:ImportUnit[],decision:ImportStructureDecision,partial=false){
 if(!decision||!Array.isArray(decision.chapterCuts)||!Array.isArray(decision.ignoredStarts))throw Error('卷章结构必须包含章界与候选决定')
 const byStart=new Map<number,ImportUnit[]>()
 for(const candidate of candidates){importStructureCandidateMetadata(candidate);const group=byStart.get(candidate.start)??[];group.push(candidate);byStart.set(candidate.start,group)}
 const cutStarts=new Set<number>(),ignored=new Set<number>()
 for(const cut of decision.chapterCuts){
  if(!Number.isSafeInteger(cut.start)||!byStart.has(cut.start)||cutStarts.has(cut.start))throw Error('章界不属于候选或重复')
  const group=byStart.get(cut.start)!,chosen=cut.candidateId?group.find(candidate=>candidate.id===cut.candidateId):group.length===1?group[0]:undefined
  if(!chosen||group.length>1&&!decision.ignoredStarts.includes(cut.start))throw Error('多候选必须指定candidateId并忽略其余候选')
  const parsed=title.safeParse(cut.title);if(!parsed.success)throw Error('章标题不能为空或含无效字符');if(!candidateValue([chosen],cut.title,false))throw Error('章标题不属于真实候选')
  cutStarts.add(cut.start)
 }
 const volumes=new Set<string|undefined>();let previous:string|undefined,first=true
 for(const cut of [...decision.chapterCuts].sort((a,b)=>a.start-b.start)){
  const group=byStart.get(cut.start)!,chosen=(cut.candidateId?group.find(candidate=>candidate.id===cut.candidateId):group[0])!
  if(cut.volume!==undefined&&(!title.safeParse(cut.volume).success||!candidateValue([chosen],cut.volume,true)&&(!partial&&first||previous!==cut.volume)))throw Error('卷名不属于真实候选或前序卷归属')
  const inherited=cut.candidateId?chosen:group.find(candidate=>importStructureCandidateMetadata(candidate).volume!==undefined)??chosen,effectiveVolume=cut.volume??importStructureCandidateMetadata(inherited).volume??previous
  if(previous!==effectiveVolume&&volumes.has(effectiveVolume))throw Error('卷归属不能回跳或重复使用卷名');volumes.add(effectiveVolume);previous=effectiveVolume;first=false
 }
 for(const start of decision.ignoredStarts){if(!Number.isSafeInteger(start)||!byStart.has(start)||ignored.has(start)||cutStarts.has(start)&&byStart.get(start)!.length<2)throw Error('忽略候选无效或与章界重复');ignored.add(start)}
 for(const [start,units]of byStart){const cut=cutStarts.has(start),skip=ignored.has(start);if(!partial&&!cut&&!skip)throw Error('每个卷章候选必须有且仅有一个决定');if((!partial||cut||skip)&&units.some(unit=>importStructureCandidateMetadata(unit).forced)&&!cut)throw Error('不能删除本地已确认的强制章界')}
}
function normalizedStructureCuts(body:string,candidates:ImportUnit[],decision:ImportStructureDecision,version:1|2):ImportStructureCut[]{
 const cuts=decision.chapterCuts.map(cut=>({...cut})).sort((a,b)=>a.start-b.start).filter((cut,index,all)=>index===0||candidates.some(unit=>unit.start===cut.start&&importStructureCandidateMetadata(unit).forced)||substantivePrologue(body.slice(all[index-1].start,cut.start))),originalStarts=cuts.map(cut=>cut.start)
 if(cuts[0]?.start>0&&!substantivePrologue(body.slice(0,cuts[0].start)))cuts[0].start=0
 if(version===2)for(let index=0;index<cuts.length;index++){
  const cut=cuts[index],previous=index?cuts[index-1].start:-1,parents=decision.ignoredStarts.flatMap(start=>candidates.filter(unit=>unit.start===start)).filter(unit=>{
   const meta=importStructureCandidateMetadata(unit)
   return meta.source==='heading'&&!meta.forced&&(meta.blankAfter||meta.headingLevel!==undefined)&&unit.start>previous&&unit.start<cut.start&&cut.volume!==undefined&&normalizedHeading(meta.title,true)===normalizedHeading(cut.volume,true)&&!substantivePrologue(body.slice(unit.start,cut.start))
  })
  if(parents.length>1)throw Error('番外或父卷标题候选不唯一')
  if(parents.length===1){const{candidateId:_candidateId,...rest}=cut;cuts[index]={...rest,start:parents[0].start}}
 }
 const byStart=new Map<number,ReturnType<typeof importStructureCandidateMetadata>[]>()
 for(const unit of candidates){const meta=importStructureCandidateMetadata(unit),group=byStart.get(unit.start)??[];group.push(meta);byStart.set(unit.start,group)}
 const inherited=new Map(detectImportChapterCuts(body,{volumes:true}).cuts.filter(cut=>cut.volume!==undefined).map(cut=>[cut.start,cut.volume!])),byId=new Map(candidates.map(unit=>[unit.id,importStructureCandidateMetadata(unit)]));let volume:string|undefined
 return cuts.map((cut,index)=>{const start=originalStarts[index],choices=byStart.get(start)??[],candidate=cut.candidateId?byId.get(cut.candidateId):choices.find(meta=>meta.volume!==undefined)
  const candidateVolume=candidate?.volume
  if(cut.volume!==undefined)volume=cut.volume;else if(candidateVolume!==undefined)volume=candidateVolume;else if(inherited.has(start))volume=inherited.get(start)
  return {...cut,...(volume!==undefined?{volume}:{})}})
}
export function verifiedImportStructureVolumeCuts(s:ImportSession,cuts:ImportChapterCut[],text:string):Map<number,string|undefined>|undefined{
 const decision=s.chapterDetection?.structureDecision
 if(!decision||s.workingRevision!==0||sourceBody(s)!==text)return
 validateImportStructureDecisions(collectImportStructureCandidates(s).candidates,decision)
 if(!Array.isArray(decision.volumeCuts))throw Error('结构决定缺少归一化卷归属')
 if(decision.normalizationVersion!==undefined&&decision.normalizationVersion!==1&&decision.normalizationVersion!==2)throw Error('结构归一化版本无效')
 const expected=normalizedStructureCuts(text,collectImportStructureCandidates(s).candidates,decision,decision.normalizationVersion??1),same=(a:ImportStructureCut,b:ImportStructureCut)=>a.start===b.start&&a.title===b.title&&a.volume===b.volume
 if(expected.length!==decision.volumeCuts.length||expected.some((cut,index)=>!same(cut,decision.volumeCuts[index]))||cuts.length!==expected.length||cuts.some((cut,index)=>!same(cut,expected[index])))throw Error('结构决定与当前章节不一致')
 return new Map(decision.volumeCuts.map(cut=>[cut.start,cut.volume]))
}
export function commitImportStructure(s:ImportSession,decision:ImportStructureDecision){
 if(!decision.chapterCuts.length)throw Error('全书至少需要一个章界')
 const {body,candidates}=collectImportStructureCandidates(s);validateImportStructureDecisions(candidates,decision)
 const cuts=normalizedStructureCuts(body,candidates,decision,2)
 s.chapterDetection={mode:'manual',structureDecision:{...structuredClone(decision),normalizationVersion:2,volumeCuts:structuredClone(cuts)}}
 const chapters=importSessionChapters(s,body,cuts);importVolumeGroups(chapters)
 if(chapters.map(chapter=>chapter.content).join('')!==body)throw Error('卷章结构未完整保留正文')
 s.chapters=chapters;delete s.detailedOutlineIds
}
export function localImportStructureDecision(candidates:ImportUnit[]):ImportStructureDecision{
 const starts=new Set<number>(),chapterCuts:ImportStructureCut[]=[]
 for(const unit of candidates){const meta=importStructureCandidateMetadata(unit);if(!meta.forced||starts.has(unit.start))continue;starts.add(unit.start);chapterCuts.push({start:unit.start,title:meta.chapterTitle??meta.title,candidateId:unit.id,...(meta.volume!==undefined?{volume:meta.volume}:{})})}
 const chosenIds=new Set(chapterCuts.map(cut=>cut.candidateId));return{chapterCuts,ignoredStarts:[...new Set(candidates.filter(unit=>!chosenIds.has(unit.id)).map(unit=>unit.start))]}
}
export function importStructureDraftHash(draft:Omit<ImportStructureDraft,'resultHash'>){return importHash({version:1,...draft})}
export function validateImportStructureDraft(draft:ImportStructureDraft){
 if(!draft||typeof draft.scopeHash!=='string'||!/^[a-f0-9]{64}$/u.test(draft.scopeHash)||!Array.isArray(draft.candidates)||!Array.isArray(draft.batches)||typeof draft.resultHash!=='string')throw Error('卷章检查点无效')
 validateImportStructureDecisions(draft.candidates,{chapterCuts:draft.chapterCuts,ignoredStarts:draft.ignoredStarts},true)
 const ids=new Set(draft.candidates.map(unit=>unit.id)),keys=new Set<string>(),byId=new Map(draft.candidates.map(unit=>[unit.id,unit])),covered=new Set<string>()
 if(ids.size!==draft.candidates.length)throw Error('卷章候选标识重复')
 for(const batch of draft.batches){const units=batch.unitIds.map(id=>byId.get(id));if(keys.has(batch.key)||!units.length||units.some(unit=>!unit)||batch.unitIds.some(id=>covered.has(id))||batch.key!==importStructureBatchKey(draft.scopeHash,units as ImportUnit[]))throw Error('卷章批次检查点无效');keys.add(batch.key);const idsInBatch=new Set(batch.unitIds);if((units as ImportUnit[]).some(unit=>draft.candidates.some(candidate=>candidate.start===unit.start&&!idsInBatch.has(candidate.id))))throw Error('同一起点的卷章候选被拆到不同批次');for(const id of batch.unitIds)covered.add(id)}
 const {resultHash,...content}=draft
 if(resultHash!==importStructureDraftHash(content))throw Error('卷章候选结果指纹无效')
}
export function importStructureResult(request:Pick<ImportAiRequest,'phase'|'intent'|'units'>,result:ImportAiResult):ImportStructureDecision{
 if(request.phase!=='classify'||request.intent!=='structure')throw Error('卷章结构只能用于分类阶段')
 const decision={chapterCuts:result.chapterCuts??[],ignoredStarts:result.ignoredStarts??[]};validateImportStructureDecisions(request.units,decision,true)
 for(const unit of request.units)if(!decision.chapterCuts.some(cut=>cut.start===unit.start)&&!decision.ignoredStarts.includes(unit.start))throw Error('卷章候选没有完整决定')
 return decision
}
