/** docs/610: chapter text written into an imported work. The import session and record keep the
 * source verbatim; only the stored chapter body drops its leading volume/chapter heading lines and
 * becomes Markdown paragraphs separated by blank lines. */
export interface ImportFormattedProse {
 text:string
 /** Formatted offset for a source offset used as a range start. */
 start(index:number):number
 /** Formatted offset for a source offset used as a range end (exclusive). */
 end(index:number):number
}

import {anchorContext} from '../../src/lib/comment-anchor'

const NUMBER='[\\d零〇一二三四五六七八九十百千万两]+'
const SENTENCE_END=/[。！？!?…；;：:”」』’"）)】》~～—]$/u
const CHAPTER_HEADING=new RegExp(`^第${NUMBER}[章节回](?:$|[^。！？!?]{0,58}[^。！？!?，,；;]$)`,'u')
// Same rule as volumeHeadings (novel-import-chapters.ts): a volume name holds no sentence punctuation.
const VOLUME_HEADING=new RegExp(`^第${NUMBER}[卷部册编篇](?:$|[\\t \\u3000：:][^。！？!?，,；;]{0,150}$)`,'u')
const OTHER_HEADING=/^(?:(?:序章|楔子|引子|序言)(?:$|[\t 　：:].{0,60}$)|番外|(?:chapter|part|volume)[\t ]+[^\r\n]{1,80}|prologue|epilogue)$/iu
const MARKDOWN_BLOCK=/^(?:#|>|[-+*][\t ]|\d+[.)](?:[\t ]|$)|[-=*_][\t \-=*_]*$|<|\||`{3}|~{3}|\t| {4})/u
const SHORT_LINE=20

function plain(line:string){
 let title=line.trim().replace(/^#{1,6}[\t ]*/u,'').trim()
 for(const mark of ['**','__','*','_'])if(title.length>mark.length*2&&title.startsWith(mark)&&title.endsWith(mark)){title=title.slice(mark.length,-mark.length).trim();break}
 return title
}
const squash=(value:string)=>value.replace(/[\s　]+/gu,'')
function isHeading(line:string,title:string,volume:string|undefined){
 const value=plain(line);if(!value)return true
 if(title&&squash(value)===squash(title))return true
 if(volume&&new RegExp(`^第${NUMBER}[卷部册编篇][\\t \\u3000：:]*`,'u').test(value)&&squash(value.replace(new RegExp(`^第${NUMBER}[卷部册编篇][\\t \\u3000：:]*`,'u'),''))===squash(volume))return true
 return CHAPTER_HEADING.test(value)||VOLUME_HEADING.test(value)||OTHER_HEADING.test(value)
}
const isSpace=(c:string)=>c===' '||c==='\t'||c==='　'||c==='\r'||c==='\n'
const wordy=(c:string|undefined)=>!!c&&/[A-Za-z0-9]/u.test(c)

interface Line {start:number;end:number}
export function formatImportChapterProse(raw:string,options:{title:string;volume?:string}):ImportFormattedProse{
 // Source lines (offsets into raw), CR/LF agnostic.
 const lines:Line[]=[];let cursor=0
 for(const m of raw.matchAll(/\r\n|\r|\n/gu)){lines.push({start:cursor,end:m.index});cursor=m.index+m[0].length}
 lines.push({start:cursor,end:raw.length})
 let first=0
 while(first<lines.length&&isHeading(raw.slice(lines[first].start,lines[first].end),options.title,options.volume))first++
 // Split merged paragraphs: sentence end + 2 or more full-width spaces inside one line.
 const pieces:{start:number;end:number;indented:boolean}[]=[]
 for(const line of lines.slice(first)){
  let from=line.start
  const text=raw.slice(line.start,line.end)
  for(const m of text.matchAll(/([。！？!?…”」』])　{2,}/gu)){
   const cut=line.start+m.index+m[1].length
   pieces.push({start:from,end:cut,indented:from!==line.start||isSpace(raw[from]??'')});from=cut
  }
  pieces.push({start:from,end:line.end,indented:from!==line.start||(from<line.end&&isSpace(raw[from]))})
 }
 // Build paragraphs as lists of kept source ranges.
 const paragraphs:{start:number;end:number}[][]=[];let previous:string|undefined
 for(const piece of pieces){
  let s=piece.start,e=piece.end
  while(s<e&&isSpace(raw[s]))s++
  while(e>s&&isSpace(raw[e-1]))e--
  if(s===e){previous=undefined;continue}
  const content=raw.slice(s,e)
  const fresh=!paragraphs.length||previous===undefined||piece.indented||SENTENCE_END.test(previous)||Array.from(previous).length<SHORT_LINE
  if(fresh)paragraphs.push([{start:s,end:e}]);else paragraphs.at(-1)!.push({start:s,end:e})
  previous=content
 }
 // Emit text and the kept-character map.
 let text='';const kept=new Int32Array(raw.length+1).fill(-1)
 for(const [p,ranges] of paragraphs.entries()){
  if(p)text+='\n\n'
  for(const [r,range] of ranges.entries()){
   if(r===0&&MARKDOWN_BLOCK.test(raw.slice(range.start,range.end)))text+='\\'
   if(r>0&&wordy(raw[ranges[r-1].end-1])&&wordy(raw[range.start]))text+=' '
   for(let i=range.start;i<range.end;i++)kept[i]=text.length+(i-range.start)
   text+=raw.slice(range.start,range.end)
  }
 }
 // next[i]: formatted position of the first kept char at or after i; prev[i]: after the last kept char before i.
 const next=new Int32Array(raw.length+1),prev=new Int32Array(raw.length+1)
 next[raw.length]=text.length
 for(let i=raw.length-1;i>=0;i--)next[i]=kept[i]>=0?kept[i]:next[i+1]
 prev[0]=0
 for(let i=1;i<=raw.length;i++)prev[i]=kept[i-1]>=0?kept[i-1]+1:prev[i-1]
 const clamp=(i:number)=>Math.max(0,Math.min(raw.length,Math.trunc(i)))
 return {text,start:i=>next[clamp(i)],end:i=>prev[clamp(i)]}
}

/** A foreshadow touch's source range as a CHAPTER_CONTENT anchor on the stored body. A range lost with
 * the removed heading becomes a whole-chapter reference (quote null), like an unmatched outline quote. */
export function importContentAnchor(body:ImportFormattedProse,start:number,end:number){
 const from=body.start(start),to=body.end(end)
 return from<to?{quote:body.text.slice(from,to),...anchorContext(body.text,from,to),startOffset:from,endOffset:to}:{quote:null,prefix:null,suffix:null,startOffset:null,endOffset:null}
}
