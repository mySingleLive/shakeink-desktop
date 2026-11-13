import type {ImportWizardView} from '../shared/novel-import'
import {sourceTextSummary} from './novel-import-pdf-source-text'
import {mergeWizardRoster,wizardItemRejected} from './novel-import-wizard'
import {normalizeWizardName} from '../shared/novel-import-wizard'
import {expectedSceneOwnershipKeys} from './novel-import-scene-identity'
import {createHash} from 'node:crypto'
import {prepareImportWorkingUnits,validateImportBudgetPolicy,splitBudgetBatches} from './novel-import-budget-policy'
import {validatePdfPageReviews,pdfReviewsReady,pdfPendingPages,pdfSourceKey,pdfReviewScope} from './novel-import-pdf'
import {detectImportChapterCuts,deriveImportVolumeCuts,assertImportChapterVersion,type ImportChapterCut} from './novel-import-chapters'
import {importSemanticAudit,importSemanticSourceFacts} from './novel-import-semantic-state'
import {importSemanticIdentity,IMPORT_SEMANTIC_FACT_FIELDS,IMPORT_RELIABILITIES} from './novel-import-semantics'
import {IMPORT_KINDS,IMPORT_TARGETS,IMPORT_LABELS,type ImportArtifact,type ImportChapter,type ImportConflict,type ImportFile,type ImportKind,type ImportSession,type ImportTarget,type ImportUnit,type ImportView,type UnitKind} from '../shared/novel-import'

export function stableImportJson(value:unknown):string{
 if(Array.isArray(value))return '['+value.map(stableImportJson).join(',')+']'
 if(value&&typeof value==='object')return '{'+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>JSON.stringify(k)+':'+stableImportJson(v)).join(',')+'}'
 return JSON.stringify(value)??'null'
}
export function importHash(value:unknown):string{return createHash('sha256').update(stableImportJson(value)).digest('hex')}
export function safeImportBoundary(text:string,index:number):boolean{return Number.isInteger(index)&&index>=0&&index<=text.length&&!(index>0&&index<text.length&&/[\uD800-\uDBFF]/.test(text[index-1])&&/[\uDC00-\uDFFF]/.test(text[index]))}
function cutAt(text:string,start:number,end:number){let cut=end;if(!safeImportBoundary(text,cut))cut--;return cut>start?cut:Math.min(text.length,start+2)}
export function splitImportUnits(files:ImportFile[],maxCharacters=1000):ImportUnit[]{
 if(!Number.isInteger(maxCharacters)||maxCharacters<2)throw Error('文本分块预算无效')
 const result:ImportUnit[]=[]
 for(const file of files){
  const parts=file.parts?.length?file.parts:[{name:'正文',start:0,end:file.text.length,kind:'body' as const}]
  let expected=0
  for(const part of parts){
   if(part.start!==expected||part.end<part.start||part.end>file.text.length)throw Error('来源部件覆盖无效')
   let start=part.start
   while(start<part.end){
    let end=Math.min(part.end,start+maxCharacters)
    const paragraph=/\r?\n[\t ]*\r?\n/g;paragraph.lastIndex=start
    const match=paragraph.exec(file.text)
    if(match&&match.index+match[0].length<=end)end=match.index+match[0].length
    end=cutAt(file.text,start,end)
    result.push({id:`${file.id}:${start}:${end}`,fileId:file.id,start,end,text:file.text.slice(start,end),kind:'unknown',part:part.name})
    start=end
   }
   expected=part.end
  }
  if(expected!==file.text.length)throw Error('来源部件覆盖无效')
 }
 return result
}
/** Fresh v3 working-body geometry only; raw sources keep splitImportUnits. */
export function splitSentenceWorkingUnits(file:Pick<ImportFile,'id'|'text'>):{units:ImportUnit[];hardFallbackCuts:number}{
 const units:ImportUnit[]=[],text=file.text;let start=0,hardFallbackCuts=0
 const closing=/["'”’」』）)\]】》〉]/u
 while(start<text.length){
  const limit=Math.min(text.length,start+1000);let end=limit,last=0
  if(limit<text.length){
   for(const match of text.slice(start,limit).matchAll(/[。！？!?；;.]|\r\n|\r|\n/gu)){
    let boundary=start+match.index!+match[0].length
    // A period inside a decimal or an unspaced name is not a sentence end.
    if(match[0]==='.'&&boundary<text.length&&!/\s/u.test(text[boundary])&&!closing.test(text[boundary]))continue
    if(text[boundary-1]==='\r'&&text[boundary]==='\n')continue
    while(boundary<limit&&closing.test(text[boundary]))boundary++
    if(boundary>start&&safeImportBoundary(text,boundary))last=boundary
   }
   if(last)end=last
   else{end=cutAt(text,start,limit);if(text[end-1]==='\r'&&text[end]==='\n')end--;hardFallbackCuts++}
  }
  if(end<=start||end-start>1000||!safeImportBoundary(text,end))throw Error('正文单元范围、字符边界或预算无效')
  units.push({id:`${file.id}:${start}:${end}`,fileId:file.id,start,end,text:text.slice(start,end),kind:'body',part:'正文'});start=end
 }
 return {units,hardFallbackCuts}
}
function labelKind(value:string):ImportKind|undefined{
 const text=value.replace(/^\s*(?:#{1,6}|[【\[（(])\s*/u,'').replace(/[】\]）)]\s*$/u,'').trim()
 const labels:[RegExp,ImportKind][]=[[/^(?:正文|小说正文|章节正文)(?:[：:\s]|$)/u,'body'],[/^(?:大纲|全书大纲|细纲|剧情大纲)/u,'outline'],[/^(?:主题|主题设定)/u,'theme'],[/^(?:文风|写作风格)/u,'style'],[/^(?:世界观|世界设定)/u,'world'],[/^(?:角色|人物)(?:[：:设定档案\s]|$)/u,'character'],[/^(?:场景|地点设定)/u,'scene'],[/^(?:物品|道具)/u,'item'],[/^伏笔/u,'foreshadow'],[/^金手指/u,'goldenFinger'],[/^(?:爽点|泪点|情绪坐标)/u,'trope'],[/^世界线/u,'worldline'],[/^叙事线/u,'narrative']]
 return labels.find(([re])=>re.test(text))?.[1]
}
export function classifyLocalUnits(files:ImportFile[],units:ImportUnit[]):ImportUnit[]{
 const byFile=new Map(files.map(f=>[f.id,f]));let current:UnitKind='unknown',previous=''
 return units.map(unit=>{
  const file=byFile.get(unit.fileId);if(!file)throw Error('来源单元无效')
  if(previous!==unit.fileId){current=labelKind(file.name.split(/[\\/]/).pop()!.replace(/\.[^.]+$/,''))??(/(?:第[\d零〇一二三四五六七八九十百千]+[章节回卷]|chapter\s*\d)/iu.test(file.name)?'body':'unknown');previous=unit.fileId}
  const part=file.parts?.find(p=>unit.start>=p.start&&unit.end<=p.end),attachment=part?.kind==='attachment'
  // Units are cut at a size limit, often mid-line; only a unit that starts a line can carry a heading.
  const lineStart=unit.start===0||unit.start===part?.start||/[\r\n]/u.test(file.text[unit.start-1]??'')
  const first=lineStart?unit.text.split(/\r?\n/u).find(line=>line.trim())??'':''
  const heading=labelKind(first)
  if(heading)current=heading
  else if(/^\s*(?:#{1,6}\s*)?(?:第[\d零〇一二三四五六七八九十百千]+[章节回卷部]|chapter\s*\d)/iu.test(first))current='body'
  return {...unit,kind:attachment?'unknown':current}
 })
}
const NUMERAL='[\\d零〇一二三四五六七八九十百千万两]+'
const BODY_HEADING=new RegExp(`^(?:第${NUMERAL}[章节回][^\\r\\n]{0,150}|第${NUMERAL}[卷部](?:[\\t \\u3000]+|[：:])[^。！？!?，,；;\\r\\n]{1,150}|番外|序章[^\\r\\n]{0,150}|楔子[^\\r\\n]{0,150})$`,'u')
const NOTE_HEADING=new RegExp(`^(?:第${NUMERAL}[卷部](?:总结|感言|后记)|(?:完本|上架|作者)感言)(?:[（(][^）)]{1,4}[）)])?[：:]?$`,'u')
const SYNOPSIS_HEADING=/^(?:内容简介|作品简介|简介)[：:]?$/u
const FRONT_MARKER=/^(?:[=\-*_~#·.]{3,}|.*https?:\/\/.*|(?:作者|书名|来源|类别|状态|字数)[：:].*)$/u
/** Non-narrative text in a novel file: front matter before the first heading, author notes such as
 * “第一部总结” or “完本感言” up to the next heading, and a PS block after the last heading. Only whole
 * lines are matched, and setting files are never cut. */
export function importExcludedRanges(file:ImportFile):[number,number][]{
 if(!['txt','md'].includes(file.format)||file.parts?.length||labelKind(file.name.split(/[\\/]/).pop()!.replace(/\.[^.]+$/,'')))return []
 const lines:{start:number;text:string}[]=[];let cursor=0
 for(const newline of file.text.matchAll(/\r\n|\r|\n/gu)){lines.push({start:cursor,text:file.text.slice(cursor,newline.index).trim()});cursor=newline.index+newline[0].length}
 lines.push({start:cursor,text:file.text.slice(cursor).trim()})
 const headings=lines.filter(line=>BODY_HEADING.test(line.text));if(!headings.length)return []
 const ranges:[number,number][]=[],first=headings[0]
 // Front matter needs a real marker; a bare title line stays part of the first chapter.
 let marked=false,synopsis=false,front=first.start>0
 for(const line of lines){if(line.start>=first.start)break;if(!line.text||synopsis)continue;if(SYNOPSIS_HEADING.test(line.text)){synopsis=marked=true;continue}if(FRONT_MARKER.test(line.text)){marked=true;continue}if(line.text.length>30||/[。！？!?，,；;]/u.test(line.text)){front=false;break}}
 if(front&&marked)ranges.push([0,first.start])
 let open:number|undefined
 for(const line of lines){if(line.start<first.start)continue;if(open===undefined){if(NOTE_HEADING.test(line.text))open=line.start}else if(BODY_HEADING.test(line.text)){ranges.push([open,line.start]);open=undefined}}
 if(open!==undefined)ranges.push([open,file.text.length])
 else{const last=headings.at(-1)!,ps=lines.find(line=>line.start>last.start&&file.text.length-line.start<=2000&&/^PS\d*[：:]/iu.test(line.text));if(ps)ranges.push([ps.start,file.text.length])}
 return ranges
}
/** Units for a newly read source: split at excluded edges, then classified locally. */
export function importSourceUnits(file:ImportFile):ImportUnit[]{
 const ranges=importExcludedRanges(file),edges=[...new Set(ranges.flat())]
 const units=splitImportUnits([file]).flatMap(unit=>{const points=[unit.start,...edges.filter(edge=>edge>unit.start&&edge<unit.end).sort((a,b)=>a-b),unit.end];return points.slice(0,-1).map((start,i)=>({...unit,id:`${file.id}:${start}:${points[i+1]}`,start,end:points[i+1],text:file.text.slice(start,points[i+1])}))})
 return classifyLocalUnits([file],units).map(unit=>ranges.some(([start,end])=>unit.start>=start&&unit.end<=end)?{...unit,kind:'excluded'}:unit)
}
/** Chapter headings in the selected body text are the file's outline: volume and chapter names in order. */
export function importStructureAvailable(session:Pick<ImportSession,'files'|'units'>):boolean{
 const included=new Set(session.files.filter(f=>f.included&&!f.error).map(f=>f.id)),heading=/^[\t 　]*(?:#{1,6}[\t ]*)?(?:第[\d零〇一二三四五六七八九十百千万两]+[章节回卷部]|chapter[\t ]+\d)/imu
 return session.units.some(u=>u.kind==='body'&&included.has(u.fileId)&&heading.test(u.text))
}
export function validateImportCoverage(session:Pick<ImportSession,'files'|'units'>):void{
 const included=session.files.filter(file=>file.included)
 if(!included.length)throw Error('请至少纳入一个来源文件')
 validatePdfPageReviews(session.files)
 for(const file of included){
  if(file.error)throw Error('请先处理来源读取错误')
  if(file.requiresEncodingConfirmation)throw Error('请先确认文本编码')
  const units=session.units.filter(u=>u.fileId===file.id).sort((a,b)=>a.start-b.start);let end=0
  for(const unit of units){
   if(unit.start!==end||unit.end<=unit.start||!safeImportBoundary(file.text,unit.start)||!safeImportBoundary(file.text,unit.end)||unit.text!==file.text.slice(unit.start,unit.end))throw Error('来源文本覆盖不完整或重叠')
   if(![...IMPORT_KINDS,'unknown','excluded'].includes(unit.kind))throw Error('来源类别无效')
   if(unit.kind==='unknown')throw Error('还有待归类片段，请明确归类或排除')
   end=unit.end
  }
  if(end!==file.text.length||!file.text.length)throw Error('来源文本覆盖不完整')
 }
}
export function importSourceReady(session:Pick<ImportSession,'files'|'units'>):boolean{try{validateImportCoverage(session);return true}catch{return false}}
export function sourceBody(session:Pick<ImportSession,'files'|'units'|'selected'>):string{
 if(!session.selected.includes('body'))return ''
 return session.files.filter(f=>f.included&&!f.error).flatMap(file=>session.units.filter(u=>u.fileId===file.id&&u.kind==='body').sort((a,b)=>a.start-b.start)).map(u=>u.text).join('')
}
export function selectedImportUnits(session:Pick<ImportSession,'files'|'units'|'selected'>):ImportUnit[]{const included=new Set(session.files.filter(f=>f.included&&!f.error).map(f=>f.id));return session.units.filter(u=>included.has(u.fileId)&&session.selected.includes(u.kind as ImportKind))}
export function workingImportUnits(session:ImportSession):ImportUnit[]{
 return prepareImportWorkingUnits(session,()=>{
  const file={id:`working-${session.workingRevision}`,name:'正文',format:'txt' as const,path:'',bytes:Buffer.byteLength(session.workingProse),hash:importHash(session.workingProse),text:session.workingProse,included:true}
  return session.budgetPolicy?.workingUnits==='sentence-1000-v3'?splitSentenceWorkingUnits(file).units:splitImportUnits([file]).map(u=>({...u,kind:'body'}))
 })
}
/** Only v2 contributes policy/working geometry; old fingerprints remain exact. */
export function importBudgetAudit(session:ImportSession){
 if(!session.budgetPolicy)return undefined
 const policy=validateImportBudgetPolicy(session.budgetPolicy),units=session.workingUnits??workingImportUnits({...session,workingUnits:undefined})
 return {policy,workingUnits:units.map(u=>({id:u.id,fileId:u.fileId,start:u.start,end:u.end,textHash:importHash(u.text)}))}
}
export function importChapters(text:string,cuts?:ImportChapterCut[],semanticVersion?:1,chapterVersion?:2,trustedVolumeCuts?:Map<number,string|undefined>):ImportChapter[]{
 assertImportChapterVersion(chapterVersion)
 if(!text)return []
 let boundaries=cuts
 if(chapterVersion===2)boundaries=cuts?deriveImportVolumeCuts(text,cuts,trustedVolumeCuts):detectImportChapterCuts(text,{volumes:true}).cuts
 else if(!boundaries&&semanticVersion===1)boundaries=detectImportChapterCuts(text).cuts
 if(!boundaries){
  const matches=[...text.matchAll(/^(?:[\t ]*#{1,6}[\t ]*)?(?:第[\d零〇一二三四五六七八九十百千万两]+[章节回卷部][^\r\n]{0,150}|Chapter[\t ]+\d+[^\r\n]{0,150})/gimu)]
  boundaries=matches.filter(m=>!/^(?:[\t ]*#{1,6}[\t ]*)?第[\d零〇一二三四五六七八九十百千万两]+[卷部]/u.test(m[0])||matches.length===1).map(m=>({start:m.index!,title:m[0].replace(/^\s*#{1,6}\s*/u,'').trim()}))
  if(!boundaries.length)boundaries=[{start:0,title:'未分章正文'}]
  else if(boundaries[0].start>0)boundaries.unshift({start:0,title:'正文序言'})
 }
 if(boundaries[0]?.start!==0||boundaries.some((cut,i)=>!cut.title.trim()||!safeImportBoundary(text,cut.start)||i>0&&cut.start<=boundaries![i-1].start))throw Error('章节范围必须完整且按原文顺序排列')
 const chapters=boundaries.map((cut,i)=>{const end=boundaries![i+1]?.start??text.length;return {id:`chapter-${i+1}`,title:cut.title,start:cut.start,end,content:text.slice(cut.start,end),...(chapterVersion===2&&cut.volume!==undefined?{volume:cut.volume}:{})}})
 if(chapters.some(c=>c.end<=c.start)||chapters.map(c=>c.content).join('')!==text)throw Error('章节原文覆盖不完整')
 return chapters
}
export function importSessionChapters(session:ImportSession,text:string,cuts?:ImportChapterCut[]):ImportChapter[]{
 assertImportChapterVersion(session.chapterVersion)
 if(session.chapterVersion===2){
  const supplied=cuts??(session.chapterDetection?.mode==='manual'&&text&&session.chapters.length&&session.chapters.map(c=>c.content).join('')===text?session.chapters.map(({start,title,volume})=>({start,title,...(volume!==undefined?{volume}:{})})):undefined)
  const structureDecision=session.chapterDetection?.structureDecision
  let trusted:Map<number,string|undefined>|undefined
  if(supplied&&structureDecision){
   const volumes=structureDecision.volumeCuts
   if(!Array.isArray(volumes)||volumes.length!==supplied.length||supplied.some((cut,index)=>cut.start!==volumes[index]?.start||cut.title!==volumes[index]?.title||cut.volume!==volumes[index]?.volume))throw Error('结构决定与当前章节不一致')
   trusted=new Map(volumes.map(cut=>[cut.start,cut.volume]))
  }
  const detected=detectImportChapterCuts(text,{volumes:true}),chapters=importChapters(text,supplied??detected.cuts,session.semanticVersion,2,trusted)
  // A confirmed structure decision settles what the heading rules could not, so no diagnostic remains.
  session.chapterDetection={mode:supplied?'manual':'auto',...(detected.diagnostic&&!(supplied&&structureDecision)?{diagnostic:detected.diagnostic}:{}),...(supplied&&structureDecision?{structureDecision}:{})};return chapters
 }
 if(session.semanticVersion!==1)return importChapters(text,cuts)
 if(cuts){session.chapterDetection={mode:'manual',...(session.chapterDetection?.diagnostic?{diagnostic:session.chapterDetection.diagnostic}:{})};return importChapters(text,cuts,1)}
 if(session.chapterDetection?.mode==='manual'&&text.length>0&&session.chapters.length>0&&session.chapters.every(chapter=>typeof chapter.content==='string')&&session.chapters.map(chapter=>chapter.content).join('')===text)return importChapters(text,session.chapters.map(({start,title})=>({start,title})),1)
 const detected=detectImportChapterCuts(text);session.chapterDetection={mode:'auto',...(detected.diagnostic?{diagnostic:detected.diagnostic}:{})};return importChapters(text,detected.cuts,1)
}
function chineseNumber(value:string):string{
 if(/^\d+$/u.test(value))return String(Number(value))
 const digits:Record<string,number>={零:0,〇:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9}
 if(value==='十')return '10';if(value.includes('十')){const [a,b]=value.split('十');return String((a?digits[a]:1)*10+(b?digits[b]:0))}
 return value.length===1&&value in digits?String(digits[value]):value
}
export function importExplicitFacts(text:string,kind:ImportTarget):Record<string,string>{
 const facts:Record<string,string>={}
 if(kind==='character'){const age=text.match(/([\d零〇一二三四五六七八九十百两]+)\s*岁/u)?.[1];if(age)facts.age=chineseNumber(age)}
 for(const match of text.matchAll(/^\s*(?:[-*]\s*)?(年龄|性别|职业|时间|地点|别名|真相|规则)\s*[：:]\s*([^\r\n]+)/gmu))facts[({年龄:'age',性别:'gender',职业:'occupation',时间:'time',地点:'location',别名:'aliases',真相:'truth',规则:'rule'} as Record<string,string>)[match[1]]]=match[1]==='年龄'?chineseNumber(match[2].replace(/岁.*$/u,'').trim()):match[2].trim()
 if(kind==='trope'){
  const labels=[...text.matchAll(/^\s*(?:#{1,6}\s*|[-*]\s*)?(爽点|泪点)(?!\s*[/／与和])(?:[：: \t]|$)/gmu)].map(m=>m[1])
  if(labels.length&&labels.every(label=>label==='爽点'))facts.tropeKind='SATISFACTION'
  if(labels.length&&labels.every(label=>label==='泪点'))facts.tropeKind='TEAR'
 }
 return facts
}
export function sourceImportArtifacts(session:ImportSession):ImportArtifact[]{
 const result:ImportArtifact[]=[]
 for(const file of session.files.filter(f=>f.included&&!f.error))for(const kind of IMPORT_TARGETS.filter(k=>session.selected.includes(k))){
  const units=session.units.filter(u=>u.fileId===file.id&&u.kind===kind).sort((a,b)=>a.start-b.start)
  if(!units.length)continue
  const text=units.map(u=>u.text).join('')
  const characterFields=new Set(['姓名','年龄','角色','人物','性别','职业','别名','性格','外貌','外观','身份','种族','身高','体重','生日','出生地','籍贯','背景','人物背景','角色背景','人物设定','角色设定','人物关系','角色关系','关系','经历','人物经历','过去经历','能力','技能','目标','动机','弱点','优点','缺点','爱好','特长','秘密','备注','简介','描述','出场','所属','阵营','立场','弧光','成长','角色弧光','口头禅','语言风格'])
  if(session.semanticVersion===1)for(const field of [...IMPORT_SEMANTIC_FACT_FIELDS.character,'角色类型','衣着','成长'])characterFields.add(field)
  const names=kind==='character'?[...text.matchAll(/^(?:\s*[-*]\s*)?([\p{Script=Han}A-Za-z][\p{Script=Han}A-Za-z· .]{0,30})[：:]/gmu)].filter(m=>!characterFields.has(m[1].trim())):[]
  const tropeNames=kind==='trope'?[...text.matchAll(/^\s*(?:#{1,6}\s*|[-*]\s*)?(爽点|泪点)(?!\s*[/／与和])(?:[：: \t]|$)/gmu)]:[]
  const blocks=names.length?names.map((m,i)=>({name:m[1].trim(),text:text.slice(i===0?0:m.index,names[i+1]?.index??text.length)})):tropeNames.length?tropeNames.map((m,i)=>({name:m[1]+' '+(i+1),text:text.slice(i===0?0:m.index,tropeNames[i+1]?.index??text.length)})):[{name:text.match(/^\s*#{1,6}\s+([^\r\n]+)/u)?.[1]?.trim()||file.name.replace(/\.[^.]+$/u,''),text}]
  let consumed=0
  for(const block of blocks){
   const facts=session.semanticVersion===1?importSemanticSourceFacts(block.text,kind):importExplicitFacts(block.text,kind)
   if(kind==='trope'&&!facts.tropeKind&&/^(?:爽点|泪点)(?:\.|$)/u.test(file.name))facts.tropeKind=file.name.startsWith('爽点')?'SATISFACTION':'TEAR'
   const start=consumed,end=start+block.text.length;consumed=end;let position=0
   const references=units.flatMap(u=>{const a=Math.max(start-position,0),b=Math.min(end-position,u.text.length);position+=u.text.length;return b>a?[{unitId:u.id,quote:u.text.slice(a,Math.min(b,a+1000))}]:[]})
   result.push({id:'source-'+importHash([file.id,kind,block.name,block.text]).slice(0,24),kind,name:block.name.slice(0,300),text:block.text,facts,origin:'source',sourceUnitIds:references.map(e=>e.unitId),evidence:references})
  }
 }
 return result
}
export function validateImportEvidence(artifact:Pick<ImportArtifact,'evidence'|'facts'>,units:ImportUnit[]):void{
 const lookup=new Map(units.map(u=>[u.id,u]));if(!artifact.evidence.length)throw Error('推断结果缺少原文证据')
 for(const evidence of artifact.evidence){if(!evidence.quote||!lookup.get(evidence.unitId)?.text.includes(evidence.quote))throw Error('模型证据与来源单元不匹配')}
 if(artifact.facts.timeKind&&!['unknown','exact','window'].includes(artifact.facts.timeKind))throw Error('事件时间类型无效')
 if(artifact.facts.timeValue!==undefined&&!Number.isFinite(Number(artifact.facts.timeValue)))throw Error('事件时间数值无效')
}
/** Only inferred planning requires structured native references. Source-only
 * documents keep their exact text without inventing missing events or time. */
export function validateImportReferences(artifact:ImportArtifact,entities:{id:string;kind:ImportTarget;name:string}[],chapters:{id:string;start:number;end:number}[]=[]):void{
 if(artifact.origin!=='inferred')return
 const facts=artifact.facts,known=(kind:ImportTarget,value:string)=>entities.some(e=>e.kind===kind&&(e.id===value||kind==='character'&&e.name===value))
 const list=(value:string|undefined,label:string):unknown[]=>{try{const parsed=JSON.parse(value??'');if(Array.isArray(parsed)&&parsed.length<=500)return parsed}catch{}throw Error('模型'+label+'结构无效')}
 if(artifact.kind==='worldline'){
  if(!facts.lineId?.trim()||facts.lineId.length>160||!facts.lineName?.trim()||facts.lineName.length>300)throw Error('模型世界线缺少所属线标识')
  if(!['unknown','exact','window'].includes(facts.timeKind))throw Error('模型事件时间类型无效')
  if(facts.timeKind!=='unknown'&&(!facts.timeValue?.trim()||!Number.isFinite(Number(facts.timeValue))))throw Error('模型事件时间数值无效')
  if(facts.timeKind==='window'&&(!facts.timeEnd?.trim()||!Number.isFinite(Number(facts.timeEnd))||Number(facts.timeEnd)<Number(facts.timeValue)))throw Error('模型事件时间范围无效')
  if(facts.timeKind==='unknown'&&(facts.timeValue!==undefined||facts.timeEnd!==undefined))throw Error('模型未知事件时间不能伪造数值')
  if(facts.eventId&&facts.eventId!==artifact.id)throw Error('模型事件标识不一致')
  if(facts.parentId&&(facts.parentId===artifact.id||!known('worldline',facts.parentId)))throw Error('模型事件父级引用无效')
  for(const person of list(facts.people,'角色引用'))if(typeof person!=='string'||!known('character',person))throw Error('模型事件角色引用无效')
 }
 if(artifact.kind==='narrative'){
  if(!/^\d+$/u.test(facts.order??'')||!Number.isSafeInteger(Number(facts.order)))throw Error('模型叙事顺序无效')
  if(!/^\d+$/u.test(facts.chapterIndex??'')||!chapters[Number(facts.chapterIndex)])throw Error('模型叙事章节引用无效')
  if(facts.narrator&&!known('character',facts.narrator))throw Error('模型叙述者角色引用无效')
  for(const ref of list(facts.refs,'事件引用')){if(!ref||typeof ref!=='object'||Array.isArray(ref))throw Error('模型叙事事件引用无效');const item=ref as Record<string,unknown>;if(Object.keys(item).some(k=>!['eventId','kind'].includes(k))||typeof item.eventId!=='string'||!known('worldline',item.eventId)||item.kind!==undefined&&!['happen','mention','recall'].includes(String(item.kind)))throw Error('模型叙事事件引用无效')}
 }
}
function artifactKey(artifact:ImportArtifact){return artifact.kind+':'+artifact.name.normalize('NFKC').trim().toLocaleLowerCase()}
function aliases(artifact:ImportArtifact):string[]{const value=artifact.facts.aliases;if(!value)return [];try{const parsed=JSON.parse(value);if(Array.isArray(parsed)&&parsed.every(x=>typeof x==='string'))return parsed}catch{}return value.split(/[,，、;；\n]/u).map(v=>v.trim()).filter(Boolean)}
const normalizeName=(name:string)=>name.normalize('NFKC').trim().toLocaleLowerCase()
function sameEntity(a:ImportArtifact,b:ImportArtifact,semanticVersion?:1,sceneRegistry?:ReadonlyMap<string,string>){if(a.kind!==b.kind)return false;if(a.kind==='scene'&&sceneRegistry)return importSemanticIdentity(a,a.origin==='source'?'source-copy':'strict',sceneRegistry)===importSemanticIdentity(b,b.origin==='source'?'source-copy':'strict',sceneRegistry);if(semanticVersion===1&&['scene','world'].includes(a.kind))return importSemanticIdentity(a,a.origin==='source'?'source-copy':'strict',sceneRegistry)===importSemanticIdentity(b,b.origin==='source'?'source-copy':'strict',sceneRegistry);return artifactKey(a)===artifactKey(b)||a.kind==='character'&&(aliases(a).some(name=>normalizeName(name)===normalizeName(b.name))||aliases(b).some(name=>normalizeName(name)===normalizeName(a.name)))}
/** Cross-batch reconciliation of one inferred field (plan 23). Returns the
 * merged value, or undefined when the difference must stay an author conflict. */
const RECONCILED_TEXT_FIELDS=new Set(['occupation','personality','appearance','clothing','catchphrase','growthArc'])
const normalizeFact=(value:string)=>value.normalize('NFKC').trim()
function unionFactText(previous:string,value:string):string{
 // Whole-value containment only, so no clause can be dropped; text is kept verbatim.
 const a=normalizeFact(previous),b=normalizeFact(value)
 if(a.includes(b))return previous
 if(b.includes(a))return value
 return previous+'；'+value
}
type ImportRelationshipFact={target:string;description:string;characterId?:string}
function relationshipFacts(raw:string):ImportRelationshipFact[]|undefined{
 let parsed:unknown;try{parsed=JSON.parse(raw)}catch{return undefined}
 if(!Array.isArray(parsed))return undefined
 const items:ImportRelationshipFact[]=[]
 for(const item of parsed){
  if(!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).some(key=>!['target','description','characterId'].includes(key)))return undefined
  const {target,description,characterId}=item as Record<string,unknown>
  if(typeof target!=='string'||!target.trim()||typeof description!=='string'||characterId!==undefined&&(typeof characterId!=='string'||!characterId.trim()))return undefined
  items.push({target,description,...(characterId!==undefined?{characterId:characterId as string}:{})})
 }
 return uniqueRelationships(items)?items:undefined
}
const uniqueRelationships=(items:ImportRelationshipFact[])=>new Set(items.map(r=>normalizeFact(r.target))).size===items.length&&new Set(items.filter(r=>r.characterId).map(r=>r.characterId)).size===items.filter(r=>r.characterId).length
function unionRelationships(previous:string,value:string):string|undefined{
 const a=relationshipFacts(previous),b=relationshipFacts(value);if(!a||!b)return undefined
 const merged=a.map(r=>({...r}))
 for(const item of b){
  const match=merged.find(r=>r.characterId&&item.characterId?r.characterId===item.characterId:normalizeFact(r.target)===normalizeFact(item.target))
  if(!match){merged.push({...item});continue}
  if(normalizeFact(match.target)!==normalizeFact(item.target)||match.characterId&&item.characterId&&match.characterId!==item.characterId)return undefined
  match.description=match.description&&item.description?unionFactText(match.description,item.description):match.description||item.description
  match.characterId??=item.characterId
 }
 if(!uniqueRelationships(merged)||merged.length>60)return undefined
 const json=JSON.stringify(merged.map(r=>({target:r.target,description:r.description,...(r.characterId?{characterId:r.characterId}:{})})))
 return json.length>8000?undefined:json
}
function reconcileImportFact(kind:ImportTarget,field:string,previous:string,value:string):string|undefined{
 if(field==='reliability'){
  const a=IMPORT_RELIABILITIES.indexOf(previous as typeof IMPORT_RELIABILITIES[number]),b=IMPORT_RELIABILITIES.indexOf(value as typeof IMPORT_RELIABILITIES[number])
  return a<0||b<0?undefined:IMPORT_RELIABILITIES[Math.max(a,b)]
 }
 if(kind==='character'&&field==='relationships')return unionRelationships(previous,value)
 // docs/517 3R-3: the same event read in two chapter batches names its people as the union of both; its time label is kept whole.
 if(kind==='worldline'&&field==='people'){try{const a:unknown=JSON.parse(previous),b:unknown=JSON.parse(value);if(Array.isArray(a)&&Array.isArray(b)&&[...a,...b].every(x=>typeof x==='string'))return JSON.stringify([...new Set([...a,...b])])}catch{}return undefined}
 // Several narrative points of one chapter may share the chapter title; their event links are kept together.
 if(kind==='narrative'&&field==='refs'){try{const a:unknown=JSON.parse(previous),b:unknown=JSON.parse(value);if(Array.isArray(a)&&Array.isArray(b)&&[...a,...b].every(x=>x&&typeof x==='object'&&!Array.isArray(x))){const seen=new Map<string,unknown>();for(const ref of [...a,...b])seen.set(JSON.stringify(ref),ref);const list=[...seen.values()];return list.length<=500?JSON.stringify(list):undefined}}catch{}return undefined}
 // Two halves of one chapter may give the same narrative point different positions; the earlier one is kept (3R3-5).
 if(kind==='narrative'&&field==='order'&&/^\d+$/u.test(previous)&&/^\d+$/u.test(value))return String(Math.min(Number(previous),Number(value)))
 if(kind==='worldline'&&field==='time'){const merged=unionFactText(previous,value);return merged!==previous&&merged.length>1500?undefined:merged}
 // An unchanged value adds nothing, so only growth is capped.
 if(field==='attribution'||field==='temporalScope'||kind==='character'&&RECONCILED_TEXT_FIELDS.has(field)){const merged=unionFactText(previous,value);return merged!==previous&&merged.length>1500?undefined:merged}
 return undefined
}
export function mergeImportArtifacts(original:ImportArtifact[],incoming:ImportArtifact[],semanticVersion?:1,locks:{artifactId:string;field:string}[]=[],sceneRegistry?:ReadonlyMap<string,string>):{artifacts:ImportArtifact[];conflicts:ImportConflict[]}{
 const artifacts=structuredClone(original),conflicts:ImportConflict[]=[]
 for(const candidate of incoming){
  if(sceneRegistry&&candidate.kind==='scene'&&!sceneRegistry.has(candidate.id))throw Error('场景身份未注册，请先确认具体地点')
  const matches=artifacts.filter(a=>sameEntity(a,candidate,semanticVersion,sceneRegistry));if(matches.length>1)throw Error('角色别名身份不明确，请明确来源身份后重试')
  const current=matches[0],collision=artifacts.find(a=>a.id===candidate.id)
  if(collision&&collision!==current)throw Error('模型实体标识与不同身份重复，请重试')
  if(!current){artifacts.push(structuredClone(candidate));continue}
  if(current.name!==candidate.name)current.facts.aliases=JSON.stringify([...new Set([...aliases(current),...aliases(candidate),candidate.name])])
  let conflict=false
  // Reconciled values apply only when the whole candidate is conflict-free.
  const reconcile=semanticVersion===1&&current.origin==='inferred'&&candidate.origin==='inferred',reconciled:[string,string][]=[]
  for(const [field,value] of Object.entries(candidate.facts)){
   if(field==='aliases'){current.facts.aliases=JSON.stringify([...new Set([...aliases(current),...aliases(candidate)])]);continue}
   const previous=current.facts[field]
   if(previous!==undefined&&previous!==value&&previous!==''&&value!==''){
    const merged=reconcile&&!locks.some(lock=>lock.artifactId===current.id&&lock.field===field)?reconcileImportFact(current.kind,field,previous,value):undefined
    if(merged!==undefined){reconciled.push([field,merged]);continue}
    const hash=importHash([current.kind,current.name,field,previous,value,current.evidence,candidate.evidence])
    const type=current.origin==='source'&&candidate.origin==='source'?'source-source':current.origin!=='source'&&candidate.origin!=='source'?'body-body':'setting-body'
    conflicts.push({id:'conflict-'+hash.slice(0,24),hash,type,kind:current.kind,entity:current.name,field,source:{text:current.text,value:previous,artifactId:current.id,unitId:current.evidence[0]?.unitId},candidate:{text:candidate.text,value,artifactId:candidate.id,unitId:candidate.evidence[0]?.unitId},evidence:[...current.evidence,...candidate.evidence],status:'pending'});conflict=true
   }else if(previous===undefined||previous==='')current.facts[field]=value
  }
  if(!conflict){
   for(const [field,value] of reconciled)current.facts[field]=value
   current.evidence=[...new Map([...current.evidence,...candidate.evidence].map(e=>[e.unitId+'\0'+e.quote,e])).values()]
   current.sourceUnitIds=[...new Set([...current.sourceUnitIds,...candidate.sourceUnitIds])]
   if((current.origin!=='source'||candidate.origin==='source')&&current.text!==candidate.text&&!current.text.includes(candidate.text))current.text+='\n\n'+candidate.text
  }
 }
 validateImportArtifactCapacity(artifacts)
 return {artifacts,conflicts:[...new Map(conflicts.map(c=>[c.id,c])).values()]}
}
export const IMPORT_DERIVED_MAX_CHARACTERS=50_000_000
export function validateImportArtifactCapacity(artifacts:ImportArtifact[],limit=IMPORT_DERIVED_MAX_CHARACTERS){if(JSON.stringify(artifacts.filter(a=>a.origin!=='source')).length>limit)throw Error('推断设定累计超过本地容量限制，请减少补全目标后重试')}
export function conflictChoices(type:ImportConflict['type'],hasBody:boolean):string[]{if(!hasBody||type==='source-source')return ['a','b','merge'];return type==='body-body'?['source','rewrite']:['source','inferred','rewrite']}
export function applyImportPatches(session:ImportSession,ids:string[]):void{
 if(!ids.length||new Set(ids).size!==ids.length)throw Error('请逐处选择正文修改')
 const patches=ids.map(id=>session.patches.find(p=>p.id===id));if(patches.some(p=>!p))throw Error('正文修改提案已失效')
 const chosen=patches as NonNullable<typeof patches[number]>[];chosen.sort((a,b)=>a.start-b.start)
 for(let i=0;i<chosen.length;i++){const p=chosen[i];if(p.workingRevision!==session.workingRevision||!safeImportBoundary(session.workingProse,p.start)||!safeImportBoundary(session.workingProse,p.end)||p.end<p.start||session.workingProse.slice(p.start,p.end)!==p.before||i>0&&p.start<chosen[i-1].end)throw Error('正文修改版本或原文已变化，请重新核对')}
 let text=session.workingProse
 for(const p of [...chosen].reverse())text=text.slice(0,p.start)+p.after+text.slice(p.end)
 if(!text.isWellFormed())throw Error('正文修改不能拆分字符')
 session.workingProse=text;session.workingRevision++;session.workingUnits=undefined;session.chapters=importSessionChapters(session,text)
 if(session.detailedOutlineIds)for(const index of Object.keys(session.detailedOutlineIds))delete session.chapters[Number(index)]?.outline
 delete session.detailedOutlineIds;delete session.structureDraft;delete session.structureGrant
 if(session.semanticVersion===1){delete session.semanticState;delete session.mappingWarnings}session.analysisGrant=undefined;session.coverage={};session.artifacts=sourceImportArtifacts(session).filter(a=>a.kind!=='outline');session.conflicts=[];session.patches=[];session.decisions=[];session.notFound=[];session.phase='confirm'
}
export function splitImportBatches(units:ImportUnit[],maxCharacters:number,maxUnits=100):ImportUnit[][]{return splitBudgetBatches(units,maxCharacters,maxUnits)}
export function importModelCharacterBudget(contextWindow:number):number{const size=contextWindow>0?contextWindow:16000;const budget=Math.min(12000,Math.floor((size-6000)/2));if(budget<1000)throw Error('当前模型上下文预算不足，请选择更大窗口的模型');return budget}
/** Wizard send scope: the frozen structure and the chapters granted at step 6. Candidate choices only
 * narrow work inside that scope and are bound separately by wizardSelectionHash. */
const wizardScope=(session:ImportSession,purpose:'classify'|'analyze')=>session.wizardVersion===1&&purpose==='analyze'?{wizard:{structureHash:session.wizard?.structureHash??null,grantedChapters:session.wizard?.grantedChapters??null}}:{}
export function wizardSelectionHash(session:ImportSession):string{
 const w=session.wizard;if(!w)return importHash(null)
 return importHash({candidates:Object.fromEntries(Object.entries(w.candidates).map(([kind,list])=>[kind,(list??[]).filter(c=>c.selected).map(c=>({id:c.id,roleType:c.roleType??null,aliases:c.aliases}))])),images:w.images})
}
export function importScopeHash(session:ImportSession,purpose:'classify'|'analyze'):string{
 const pdfReviews=pdfReviewScope(session.files)
 assertImportChapterVersion(session.chapterVersion)
 return importHash({...(session.chapterVersion===2?{chapterVersion:2}:{}),...(session.promptLayout?{promptLayout:session.promptLayout}:{}),...(session.sceneFragmentLayout?{sceneFragmentLayout:session.sceneFragmentLayout}:{}),...(session.semanticVersion===1?{semanticVersion:1}:{}),...wizardScope(session,purpose),...(pdfReviews?{pdfReviews}:{}),...(session.budgetPolicy?{budgetPolicy:session.budgetPolicy,...(purpose==='analyze'?{importBudget:importBudgetAudit(session)}:{})}:{}),purpose,files:session.files.map(f=>({id:f.id,hash:f.hash,included:f.included,text:importHash(f.text)})),units:session.units.map(u=>({id:u.id,kind:u.kind,start:u.start,end:u.end})),...(purpose==='analyze'?{selected:session.selected,targets:session.targets,infer:session.infer,workingProse:session.workingProse,workingRevision:session.workingRevision,chapters:session.chapters.map(({id,title,start,end,volume})=>({id,title,start,end,...(volume!==undefined?{volume}:{})}))}:{} )})
}
export function importPlanHash(session:ImportSession):string{
 const pdfReviews=pdfReviewScope(session.files)
 assertImportChapterVersion(session.chapterVersion)
 return importHash({...(session.chapterVersion===2?{chapterVersion:2}:{}),...(session.promptLayout?{promptLayout:session.promptLayout}:{}),...(session.sceneFragmentLayout?{sceneFragmentLayout:session.sceneFragmentLayout}:{}),...(session.semanticVersion===1?{semanticVersion:1,semanticAudit:importSemanticAudit(session)}:{}),...(pdfReviews?{pdfReviews}:{}),...(session.pdfPageDecisionEvents?.length?{pdfReviewEvents:session.pdfPageDecisionEvents}:{}),...(session.budgetPolicy?{importBudget:importBudgetAudit(session)}:{}),id:session.id,title:session.title,files:session.files.filter(f=>f.included).map(f=>({id:f.id,name:f.name,hash:f.hash,textHash:importHash(f.text)})),units:session.units,selected:session.selected,targets:session.targets,infer:session.infer,originalProse:session.originalProse,workingProse:session.workingProse,workingRevision:session.workingRevision,chapters:session.chapters,...(session.detailedOutlineIds?{detailedOutlineIds:session.detailedOutlineIds}:{}),artifacts:session.artifacts,conflicts:session.conflicts,decisions:session.decisions,...(session.wizardVersion===1?{wizard:{selection:wizardSelectionHash(session),structureHash:session.wizard?.structureHash??null,chapterSelection:session.wizard?.chapterSelection??null,images:(session.wizard?.tasks??[]).filter(t=>t.kind==='image'&&t.state==='done').map(t=>({id:t.id,sha256:t.resultSha256??null}))}}:{})})
}
export function importSteps(session:ImportSession){
 const body=session.selected.includes('body')&&sourceBody(session)!=='',infer=body&&session.infer&&session.targets.length>0
 const rows:[string,string,ImportKind[]][]=[['body','导入正文',['body']],['outline-structure','确认卷章结构',['outline']],['character','导入与分析角色',['character']],['scene-item','导入场景与物品',['scene','item']],['world','导入与分析世界观',['world']],['settings','导入主题、文风与爽点/泪点',['theme','style','foreshadow','goldenFinger','trope']],['worldline','构建世界线',['worldline']],['narrative','构建叙事线',['narrative']],['outline','补充章节细纲',['outline']],['review','一致性复核',[]],['publish','保存作品',[]]]
 return rows.map(([key,label,kinds])=>({key,label,state:(key==='review'&&!infer||kinds.length&&!kinds.some(k=>session.selected.includes(k)||infer&&session.targets.includes(k as ImportTarget))?'skipped':'pending') as 'skipped'|'pending',completed:0}))
}
export function toImportView(session:ImportSession):ImportView{
 const included=new Set(session.files.filter(f=>f.included&&!f.error).map(f=>f.id));const found=Object.fromEntries(IMPORT_KINDS.map(kind=>[kind,new Set(session.units.filter(u=>u.kind===kind&&included.has(u.fileId)).map(u=>u.fileId)).size])) as Record<ImportKind,number>
 // Wizard: body chapter headings count as the file outline (volume and chapter names in order).
 if(!found.outline&&session.wizardVersion===1&&importStructureAvailable(session))found.outline=1
 return {id:session.id,revision:session.revision,phase:session.phase,title:session.title,files:session.files.map(f=>({id:f.id,name:f.name,format:f.format,bytes:f.bytes,hash:f.hash,included:f.included,error:f.error,encoding:f.encoding,requiresEncodingConfirmation:f.requiresEncodingConfirmation,characters:f.text.length,unitCount:session.units.filter(u=>u.fileId===f.id).length,unknownCount:session.units.filter(u=>u.fileId===f.id&&u.kind==='unknown').length,...(f.format==='pdf'?pdfFileView(f):{})})),...(session.files.some(f=>f.format==='pdf')?{pdfReady:pdfReviewsReady(session.files),pdfPendingPages:session.files.filter(f=>f.included&&f.format==='pdf').reduce((total,f)=>total+pdfPendingPages(f),0)}:{}),found,selected:[...session.selected],targets:[...session.targets],infer:session.infer,steps:structuredClone(session.steps),conflicts:structuredClone(session.conflicts),patches:structuredClone(session.patches),models:structuredClone(session.models??{}),targetLabel:session.target?.path,targetReady:!!session.target&&!session.targetNeedsAuthorization,sourceReady:importSourceReady(session),error:session.error??((session.chapterVersion===2||session.chapterDetection?.mode==='auto')&&['source','select','confirm'].includes(session.phase)?session.chapterDetection?.diagnostic:undefined),chapters:session.chapters.map(({id,title,start,end,volume})=>({id,title,start,end,...(volume!==undefined?{volume}:{})})),notFound:[...session.notFound],modified:session.workingRevision>0,publication:session.publication?{requestId:session.publication.requestId,workId:session.publication.workId,novelId:session.publication.novelId}:undefined,summary:session.phase==='completed'?{source:session.artifacts.filter(a=>a.origin==='source').length,inferred:session.artifacts.filter(a=>a.origin==='inferred').length,decisions:session.decisions.length,modified:session.workingRevision}:undefined,...(session.wizardVersion===1&&session.wizard?{wizard:{...wizardView(session.wizard,session.artifacts),...wizardLineProgress(session),...wizardRosterFound(session.wizard),...wizardForeshadowFound(session,session.wizard)},targetLabel:session.target?.path.split(/[\\/]/u).filter(Boolean).at(-1)}:{})}
}
/** Renderer projection of the wizard: titles and states only, no text, paths or image bytes. */
/** Steps 17–20 count chapters whose units are all covered (NIW-C11). */
function wizardLineProgress(s:ImportSession):{lineProgress?:{done:number;total:number}}{
 const step=s.wizard!.step;if(step!=='worldline'&&step!=='narrative'&&step!=='outline'&&step!=='foreshadow'||!s.workingProse)return {}
 // docs/535 3R-10: step 20 records its coverage under `touches`.
 const covered=new Set(s.coverage[step==='foreshadow'?'touches':step]??[]),units=s.workingUnits??[]
 return {lineProgress:{done:s.chapters.filter(c=>{const own=units.filter(u=>u.start<c.end&&u.end>c.start);return own.length>0&&own.every(u=>covered.has(u.id))}).length,total:s.chapters.length}}
}
/** docs/535 3R-7: while step 20 runs, distinct foreshadow keys returned so far (grouped as in applyForeshadowPlan, before quotes are checked). */
function wizardForeshadowFound(s:ImportSession,w:NonNullable<ImportSession['wizard']>):{foreshadowFound?:number}{
 if(w.step!=='foreshadow'||w.stepState.foreshadow!=='running'||!(s.infer&&s.selected.includes('body')&&s.targets.includes('foreshadow')&&s.analysisGrant))return {}
 return {foreshadowFound:new Set((w.touchStash??[]).map(e=>normalizeWizardName(e.foreshadowKey))).size}
}
const ROSTER_STEP_KINDS={'detect-char':'character','detect-scene':'scene','detect-item':'item','detect-world':'world'} as const
/** While a recognition step runs: distinct names merged so far from the returned batches. */
function wizardRosterFound(w:NonNullable<ImportSession['wizard']>):{rosterFound?:number}{
 const kind=ROSTER_STEP_KINDS[w.step as keyof typeof ROSTER_STEP_KINDS];if(!kind||w.stepState[w.step]!=='running')return {}
 return {rosterFound:kind==='scene'&&w.sceneIdentityVersion===1?(w.sceneIdentity?.identities.length??0):mergeWizardRoster(kind,w.rosterStash?.[kind]??[]).filter(g=>kind!=='item'||!wizardItemRejected(g)).length}
}
/** Unresolved places the author has not selected are not imported; verify lists them (486 §3R). Names come from the candidates. */
function wizardDeferredScenes(w:NonNullable<ImportSession['wizard']>,ledger:NonNullable<NonNullable<ImportSession['wizard']>['sceneIdentity']>,selected:ReadonlySet<string>){
 const names=new Map((w.candidates.scene??[]).map(c=>[c.id,c.name])),all=ledger.identities.filter(i=>i.state==='unresolved'&&!selected.has(i.id)&&names.has(i.id))
 return all.length?{deferred:all.slice(0,200).map(i=>({id:i.id,name:names.get(i.id)!})),deferredTotal:all.length}:{}
}
function wizardView(w:NonNullable<ImportSession['wizard']>,artifacts:ImportArtifact[]=[]):ImportWizardView{
 const {rosterStash:_stash,touchStash:_touches,foreshadowRefs:_refs,structureDecision:_decision,structureHash:_hash,materializedVolumes:_volumes,selectionHash:_selection,sceneIdentity:ledger,sceneCleanup:_cleanup,imageGrants,tasks,...rest}=w
 const selected=new Set((w.candidates.scene??[]).filter(c=>c.selected).map(c=>c.id)),generated=new Set(artifacts.filter(a=>a.kind==='scene'&&selected.has(a.id)&&ledger?.identities.some(i=>i.id===a.id&&i.state!=='unresolved')).map(a=>a.id)),currentKeys=new Set(ledger?expectedSceneOwnershipKeys(ledger,artifacts,generated):[]),sceneIdentitySummary=ledger?{version:1 as const,ledgerHash:ledger.ledgerHash,identityRevision:ledger.identityRevision,concreteCount:ledger.identities.filter(i=>i.state==='concrete').length,sourceScopedCount:ledger.identities.filter(i=>i.state==='source-scoped').length,unresolvedCount:ledger.identities.filter(i=>i.state==='unresolved').length,ownershipDone:new Set(ledger.ownershipReviewed.filter(key=>currentKeys.has(key))).size,ownershipTotal:ledger.identities.filter(i=>selected.has(i.id)).reduce((n,i)=>n+i.memberKeys.length,0),...wizardDeferredScenes(w,ledger,selected)}:undefined
 return {...structuredClone(rest),...(sceneIdentitySummary?{sceneIdentitySummary}:{}),structure:w.structure?.map(({title,volume})=>({title,...(volume!==undefined?{volume}:{})})),imageGrants:Object.fromEntries(Object.entries(imageGrants).map(([k,g])=>[k,g?{model:{id:g.model.id,name:g.model.name}}:undefined])),tasks:tasks.map(({resultSha256:_sha,image,...t})=>({...t,...(image?{image:{mime:image.mime,bytes:image.bytes}}:{})}))}
}

function pdfFileView(file:ImportFile){const inspection=file.pdfInspection;if(!inspection)return {pdfReady:false,pdfPendingPages:0,...(file.pdfSourceInvalidated?{pdfSourceInvalidated:true}:{})};const {proof:_proof,sourceTextDecoding,...view}=inspection;return {pdfInspection:{...structuredClone(view),...(sourceTextDecoding?{sourceTextDecoding:sourceTextSummary(sourceTextDecoding)}:{}),sourceKey:pdfSourceKey(file)},pdfReady:pdfReviewsReady([{...file,included:true}]),pdfPendingPages:pdfPendingPages(file),...(file.pdfPageDecisions?{pdfPageDecisions:file.pdfPageDecisions.map(({page,decision,confirmedAt,decisionRevision})=>({page,decision,confirmedAt,decisionRevision}))}:{}),...(file.pdfPreviewFailures?{pdfPreviewFailures:structuredClone(file.pdfPreviewFailures)}:{}),...(file.pdfSourceInvalidated?{pdfSourceInvalidated:true}:{})}}
