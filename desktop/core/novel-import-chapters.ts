export interface ImportChapterCut {start:number;title:string;volume?:string}
export interface ImportChapterDetection {cuts:ImportChapterCut[];diagnostic?:string}

interface LogicalLine {start:number;text:string}
interface Heading extends ImportChapterCut {number?:number;marker?:'prologue'|'epilogue';isVolume?:boolean;restart?:boolean}
const smallNumbers=new Map('zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split(' ').map((word,value)=>[word,value]))
const tens=new Map([['twenty',20],['thirty',30],['forty',40],['fifty',50],['sixty',60],['seventy',70],['eighty',80],['ninety',90]])

function underHundred(tokens:string[]):number|undefined{
 if(tokens.length===1)return smallNumbers.get(tokens[0])??tens.get(tokens[0])
 if(tokens.length===2){const ten=tens.get(tokens[0]),unit=smallNumbers.get(tokens[1]);if(ten!==undefined&&unit!==undefined&&unit>0&&unit<10)return ten+unit}
 return undefined
}
function underThousand(tokens:string[]):number|undefined{
 if(tokens[1]!=='hundred')return underHundred(tokens)
 const hundreds=smallNumbers.get(tokens[0]);if(hundreds===undefined||hundreds<1||hundreds>9)return undefined
 if(tokens.length===2)return hundreds*100
 const tail=tokens.slice(tokens[2]==='and'?3:2),remainder=underHundred(tail)
 return remainder!==undefined&&remainder>0?hundreds*100+remainder:undefined
}
function cardinal(tokens:string[],scaleIndex=0):number|undefined{
 const scales:[string,number][]=[['billion',1_000_000_000],['million',1_000_000],['thousand',1000]]
 for(let index=scaleIndex;index<scales.length;index++){
  const [word,scale]=scales[index],position=tokens.indexOf(word)
  if(position<0)continue
  if(position===0||tokens.lastIndexOf(word)!==position)return undefined
  const high=underThousand(tokens.slice(0,position));if(high===undefined||high<1)return undefined
  const tail=tokens.slice(position+1);if(!tail.length)return high*scale
  if(tail[0]==='and')tail.shift()
  const low=cardinal(tail,index+1),result=high*scale+(low??0)
  return low!==undefined&&low>0&&low<scale&&Number.isSafeInteger(result)?result:undefined
 }
 return underThousand(tokens)
}
function chapterNumber(raw:string):number|undefined{
 if(/^\d+$/u.test(raw)){const number=Number(raw);return Number.isSafeInteger(number)?number:undefined}
 const normalized=raw.toLowerCase().replace(/[\u2010\u2011]/gu,'-')
 if(!/^[a-z]+(?:[ -][a-z]+)*$/u.test(normalized))return undefined
 return cardinal(normalized.split(/[ -]/u))
}
function romanNumber(raw:string):number|undefined{
 if(!/^(?=.)M{0,3}(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3})$/u.test(raw))return undefined
 const values:Record<string,number>={I:1,V:5,X:10,L:50,C:100,D:500,M:1000};let number=0
 for(let i=0;i<raw.length;i++)number+=values[raw[i]]<(values[raw[i+1]]??0)?-values[raw[i]]:values[raw[i]]
 return number
}
function logicalLines(text:string):LogicalLine[]{
 const lines:LogicalLine[]=[];let start=0
 for(const newline of text.matchAll(/\r\n|\r|\n/gu)){lines.push({start,text:text.slice(start,newline.index)});start=newline.index+newline[0].length}
 lines.push({start,text:text.slice(start)});return lines
}
function headingCopy(line:string){
 let title=line.trim(),styled=false
 const markdown=/^#{1,6}[\t ]*(.+)$/u.exec(title),level=markdown?markdown[0].match(/^#{1,6}/u)![0].length:undefined
 if(markdown){title=markdown[1].trim();styled=true}
 for(const decoration of ['**','__','*','_'])if(title.length>decoration.length*2&&title.startsWith(decoration)&&title.endsWith(decoration)){title=title.slice(decoration.length,-decoration.length).trim();styled=true;break}
 return {title,styled,level}
}
export function hasSubstantiveImportPrologue(text:string){
 const lines=text.replace(/^[\t ]*#{1,6}[\t ]+[^\r\n]+$/gmu,'').split(/\r\n|\r|\n/u).map(line=>line.trim()).filter(Boolean)
 if(!lines.length)return false
 const content=lines.filter(line=>!/^(?:第[\d零〇一二三四五六七八九十百千万两]+[章节回卷部册编篇]|(?:chapter|part|volume)\s+[\dIVXLCDM]+|序章|序言|楔子|番外|尾声)/iu.test(line))
 if(!content.length)return false
 if(content.length===1&&content[0].length<=150&&!/[。！？!?，,；;]/u.test(content[0]))return false
 return true
}
function buildCuts(text:string,headings:Heading[]):ImportChapterCut[]{
 const cuts=headings.map(({start,title})=>({start,title})).sort((a,b)=>a.start-b.start)
 if(!cuts.length)return text?[{start:0,title:'未分章正文'}]:[]
 if(!text.slice(0,cuts[0].start).trim())cuts[0].start=0
 else cuts.unshift({start:0,title:'正文序言'})
 return cuts
}
function sequenceValid(headings:Heading[]){
 const numbered=headings.filter(h=>h.number!==undefined)
 if(numbered.some((heading,index)=>heading.number!==index+1))return false
 const prologues=headings.filter(h=>h.marker==='prologue'),epilogues=headings.filter(h=>h.marker==='epilogue')
 return prologues.length<=1&&epilogues.length<=1&&(!prologues.length||headings[0]===prologues[0])&&(!epilogues.length||headings.at(-1)===epilogues[0])
}

/** Detect headings in a parsing copy only. Offsets always address the original
 * UTF-16 string; ambiguous sequences remain one complete, manually editable span. */
export function detectImportChapterCuts(text:string,options?:{volumes:boolean}):ImportChapterDetection{
 const lines=logicalLines(text),chinese:Heading[]=[],english:Heading[]=[],romans:Heading[]=[],markers:Heading[]=[];let weakRoman=false,invalidRoman=false
 const ambiguous=(diagnostic:string):ImportChapterDetection=>({cuts:buildCuts(text,[]),diagnostic})
 for(let index=0;index<lines.length;index++){
  const line=lines[index],{title,styled}=headingCopy(line.text)
  const chineseHeading=/^(第[\d零〇一二三四五六七八九十百千万两]+([章节回卷部])[^\r\n]{0,150})/u.exec(title)
  if(chineseHeading){chinese.push({start:line.start,title:chineseHeading[1],isVolume:chineseHeading[2]==='卷'||chineseHeading[2]==='部',restart:/^第(?:一|0*1)[章节回]/u.test(title)});continue}
  if(/^(?:prologue|epilogue)$/iu.test(title)){markers.push({start:line.start,title,marker:title.toLowerCase() as 'prologue'|'epilogue'});continue}
  const chapter=/^chapter[\t ]+(.+)$/iu.exec(title)
  if(chapter){
   const subtitle=/^(.+?)(?:[\t ]*:[\t ]*|[\t ]+[—–-][\t ]+).+$/u.exec(chapter[1]),number=chapterNumber(subtitle?subtitle[1]:chapter[1])
   if(number!==undefined)english.push({start:line.start,title,number})
   continue
  }
  if(/^[IVXLCDM]+$/u.test(title)){
   const boundary=styled||((index===0||!lines[index-1].text.trim())&&(index===lines.length-1||!lines[index+1].text.trim())),number=romanNumber(title)
   if(boundary&&number===undefined)invalidRoman=true
   else if(number!==undefined){if(boundary)romans.push({start:line.start,title,number});else weakRoman=true}
  }
 }
 const ordered=(headings:Heading[])=>[...headings,...markers].sort((a,b)=>a.start-b.start)
 if(options?.volumes&&chinese.some(heading=>!heading.isVolume)){
  if(english.length||romans.length>1)return ambiguous('检测到多套不同形式的章节标题，请在来源核对中手动确认章界。')
  const headings=ordered(chinese.filter(heading=>!heading.isVolume))
  if(!sequenceValid(headings.map(h=>({...h,number:undefined}))))return ambiguous('检测到重复或顺序不明的序章/尾声，请手动确认章界。')
  return volumeCuts(text,headings)
 }
 if(chinese.length){
  if(english.length||romans.length>1)return ambiguous('检测到多套不同形式的章节标题，请在来源核对中手动确认章界。')
  const chapters=chinese.filter(heading=>!heading.isVolume||chinese.length===1),headings=ordered(chapters)
  if(!sequenceValid(headings.map(h=>({...h,number:undefined}))))return ambiguous('检测到重复或顺序不明的序章/尾声，请手动确认章界。')
  return {cuts:buildCuts(text,headings)}
 }
 if(english.length){
  if(romans.length>1)return ambiguous('检测到多套不同形式的章节标题，请在来源核对中手动确认章界。')
  const headings=ordered(english)
  return sequenceValid(headings)?{cuts:buildCuts(text,headings)}:ambiguous('检测到重复、缺号或顺序不明的章节标题，请在来源核对中手动确认章界。')
 }
 if(romans.length||weakRoman||invalidRoman){
  if(invalidRoman)return ambiguous('检测到非规范的罗马数字标题，请在来源核对中手动确认章界。')
  if(weakRoman||romans.length<2)return ambiguous('独立罗马数字标题与正文代词可能混淆，请在来源核对中手动确认章界。')
  const headings=ordered(romans)
  return sequenceValid(headings)?{cuts:buildCuts(text,headings)}:ambiguous('检测到重复、缺号或多套罗马数字标题，请在来源核对中手动确认章界。')
 }
 const headings=ordered([])
 return sequenceValid(headings)?{cuts:buildCuts(text,headings)}:ambiguous('检测到重复或顺序不明的序章/尾声，请在来源核对中手动确认章界。')
}

export class ImportChapterVersionError extends Error {constructor(){super('导入卷章版本无效，请保留原草稿')}}
export function assertImportChapterVersion(version:unknown):void{if(version!==undefined&&version!==2)throw new ImportChapterVersionError()}
export function validateImportVolumeName(value:unknown):asserts value is string{if(typeof value!=='string'||!value.trim()||value!==value.trim()||value.length>300||!value.isWellFormed()||/[\r\n\u0000-\u001f]/u.test(value))throw Error('卷名无效，请核对卷归属')}
interface VolumeHeading {start:number;name:string;depth:number}
function volumeHeadings(text:string):VolumeHeading[]{
 const result:VolumeHeading[]=[]
 for(const line of logicalLines(text)){
  const {title,level}=headingCopy(line.text),match=/^第[\d零〇一二三四五六七八九十百千万两]+([卷部])(?:[\t \u3000]+|[：:])(.+)$/u.exec(title)
  // Sentences and author summaries are prose, not independent volume titles.
  if(!match||/[。！？!?，,；;]/u.test(match[2]))continue
  const name=match[2].trim();validateImportVolumeName(name);result.push({start:line.start,name,depth:level??(match[1]==='部'?1:2)})
 }
 if(new Set(result.map(v=>v.name)).size!==result.length)throw Error('来源存在重复卷名，请先核对卷边界')
 return result
}
function volumeCuts(text:string,headings:Heading[]):ImportChapterDetection{
 const volumes=volumeHeadings(text),cuts:ImportChapterCut[]=[];let next=0,current:string|undefined,diagnostic:string|undefined
 for(const heading of headings){
  let start=heading.start,explicit=false
  if(next<volumes.length&&volumes[next].start<=heading.start){const pending:VolumeHeading[]=[];while(next<volumes.length&&volumes[next].start<=heading.start)pending.push(volumes[next++]);const volume=pending.at(-1)!;if(pending.slice(0,-1).some(parent=>parent.depth>=volume.depth))throw Error('卷标题之间缺少章节，请保留明确卷边界');current=volume.name;start=pending[0].start;explicit=true}
  if(heading.restart&&!explicit&&cuts.length){current=undefined;diagnostic='检测到章号重启但缺少明确卷标题，请核对卷归属。'}
  cuts.push({start,title:heading.title,...(current?{volume:current}:{})})
 }
 if(next!==volumes.length)throw Error('卷标题后缺少章节，请核对卷边界')
 if(!cuts.length)return {cuts:buildCuts(text,[])}
 if(!text.slice(0,cuts[0].start).trim())cuts[0].start=0
 else cuts.unshift({start:0,title:'正文序言'})
 return {cuts,...(diagnostic?{diagnostic}:{})}
}

/** Manual chapter names remain editable; ownership always comes from source
 * volume boundaries. A missing/shifted boundary cannot silently merge volumes. */
export function deriveImportVolumeCuts(text:string,cuts:ImportChapterCut[],trustedVolumeCuts?:Map<number,string|undefined>):ImportChapterCut[]{
 const detected=detectImportChapterCuts(text,{volumes:true}),firstVolume=detected.cuts.find(cut=>cut.volume!==undefined),mergeable=(boundary:ImportChapterCut|undefined)=>!!boundary&&cuts[0]?.start===0&&boundary===firstVolume&&boundary.start>0&&!hasSubstantiveImportPrologue(text.slice(0,boundary.start)),boundaries=detected.cuts.filter((cut,i)=>i===0?cut.title!=='正文序言'||!firstVolume||firstVolume.start===0:cut.volume!==detected.cuts[i-1].volume),headings=volumeHeadings(text),sourceNames=new Set(headings.map(v=>v.name)),explicitVolumes=new Map(headings.map(v=>[v.start,v])),manualNames=new Set<string>()
 for(const boundary of boundaries)if(!mergeable(boundary)&&!cuts.some(cut=>cut.start===boundary.start))throw Error('手动章界必须保留原文的卷边界')
 let manual:string|undefined
 return cuts.map(cut=>{
  if(trustedVolumeCuts?.has(cut.start)){
   const trusted=trustedVolumeCuts.get(cut.start)
   if(trusted===undefined){manual=undefined;return {start:cut.start,title:cut.title}}
   validateImportVolumeName(trusted);const explicit=explicitVolumes.get(cut.start);if(explicit&&explicit.depth===2&&explicit.name!==trusted)throw Error('卷归属与原文卷标题不匹配');manual=trusted;return {start:cut.start,title:cut.title,volume:trusted}
  }
  const source=cut===cuts[0]&&mergeable(firstVolume)?firstVolume:[...detected.cuts].reverse().find(candidate=>candidate.start<=cut.start),volume=source?.volume
  if(volume!==undefined){manual=undefined;if(cut.volume!==undefined){validateImportVolumeName(cut.volume);if(cut.volume!==volume)throw Error('卷归属与原文卷标题不匹配')}return {start:cut.start,title:cut.title,volume}}
  if(cut.volume!==undefined){validateImportVolumeName(cut.volume);if(sourceNames.has(cut.volume)||manual!==cut.volume&&manualNames.has(cut.volume))throw Error('人工卷名必须与来源卷及其他人工卷组区分');if(manual!==cut.volume){manualNames.add(cut.volume);manual=cut.volume}}
  return {start:cut.start,title:cut.title,...(manual!==undefined?{volume:manual}:{})}
 })
}

export function importVolumeGroups(chapters:{volume?:string}[],options?:{allowRepeatedUnassigned?:boolean}):{name?:string;start:number;end:number}[]{
 const groups:{name?:string;start:number;end:number}[]=[],seen=new Set<string|undefined>()
 for(let i=0;i<chapters.length;i++){
  const name=chapters[i].volume;if(name!==undefined)validateImportVolumeName(name)
  const previous=groups.at(-1)
  if(previous&&previous.name===name){previous.end=i+1;continue}
  if(seen.has(name)&&(name!==undefined||!options?.allowRepeatedUnassigned))throw Error('卷归属必须按原文连续排列，不能回到之前的卷')
  seen.add(name);groups.push({...(name!==undefined?{name}:{}),start:i,end:i+1})
 }
 return groups
}
