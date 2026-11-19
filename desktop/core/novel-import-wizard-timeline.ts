import type {ImportArtifact,ImportUnit} from '../shared/novel-import'
import type {ImportSemanticLock} from './novel-import-semantics'
import {civilDays,civilFromDays,isCivilDate,eraKey,ERA_YEAR_HOURS,ERA_MAX_YEAR,type Era} from '../../src/lib/planning/era-calendar'

/** docs/570: all inferred wizard events share one worldline, ordered by in-story time. */
export const WORLD_TIMELINE_LINE_ID='import-main-worldline',WORLD_TIMELINE_LINE_NAME='主世界线',WORLD_TIMELINE_INFERRED_MARK='（按先后推定）'
/** Fields that the timeline rewrites; a lock on any of them leaves that event's time and line as they are. */
export const WORLD_TIMELINE_FIELDS=['lineId','lineName','timeKind','timeValue','timeEnd','time'] as const
export interface WorldTimelineEntry {id:string;name:string;text:string;chapterIndex:number;time?:string;attribution?:string}
/** docs/572: a calendar position; every part optional. `ago` = years before the main story starts. */
export interface WorldTimelineTime {era?:string;year?:number;month?:number;day?:number;ago?:number}
export interface WorldTimelineReplyItem extends WorldTimelineTime {id:string;order:number;phase?:'前史'|'主线'}
/** docs/589: `chapterIndex` is the catalogue's reading chapter (0-based), absent when the event could not be located. */
export interface WorldTimelineRanked extends WorldTimelineTime {id:string;rank:number;phase?:'前史'|'主线';chapterIndex?:number}
export type WorldTimelinePrecision='day'|'month'|'year'|'era'
/** Gregorian placements count hours from year 1 of the present era; the epoch only names that origin. */
export const ERA_EPOCH='0001-01-01T00:00:00Z'
export type WorldTimelineState={version:1;calendar:'fixed';epoch:string;events:number}|{version:1;calendar:'gregorian';epoch:string;events:number;eras:Era[];precisions:Record<string,WorldTimelinePrecision>}

const TEXT_LIMIT=160
const clip=(text:string)=>{const chars=[...text];return chars.length<=TEXT_LIMIT?text:chars.slice(0,TEXT_LIMIT).join('')}

/** Inferred events in reading order. The chapter comes from the first locatable evidence quote, else the first source unit. */
export function worldTimelineCatalog(artifacts:ImportArtifact[],units:ImportUnit[],chapters:{start:number;end:number}[]):WorldTimelineEntry[]{
 const byId=new Map(units.map(u=>[u.id,u]))
 const position=(a:ImportArtifact)=>{
  for(const e of a.evidence){const u=byId.get(e.unitId),at=u?u.text.indexOf(e.quote):-1;if(u&&at>=0)return u.start+at}
  for(const id of [...a.evidence.map(e=>e.unitId),...a.sourceUnitIds]){const u=byId.get(id);if(u)return u.start}
  return Number.MAX_SAFE_INTEGER
 }
 const chapterOf=(at:number)=>{const i=chapters.findIndex(c=>at>=c.start&&at<c.end);return i>=0?i:chapters.length}
 return artifacts.map((a,k)=>({a,k,at:position(a)})).filter(({a})=>a.kind==='worldline'&&a.origin==='inferred').sort((x,y)=>x.at-y.at||x.k-y.k).map(({a,at})=>({
  id:a.id,name:a.name,text:clip(a.text),chapterIndex:chapterOf(at),...(a.facts.time?.trim()?{time:a.facts.time}:{}),...(a.facts.attribution?.trim()?{attribution:a.facts.attribution}:{})}))
}
/** Reading-order slices whose JSON fits `budget` characters (at least one entry each). */
export function worldTimelineSegments<T=WorldTimelineEntry>(catalog:T[],budget:number,size1:(entry:T)=>number=e=>JSON.stringify(e).length):T[][]{
 const out:T[][]=[];let current:T[]=[],size=2
 for(const entry of catalog){const n=size1(entry)+1;if(current.length&&size+n>budget){out.push(current);current=[];size=2}current.push(entry);size+=n}
 if(current.length)out.push(current)
 return out
}

/* ---------------- docs/572: novel calendars ---------------- */
const Y=ERA_YEAR_HOURS,DAY=24
/** Fixed-calendar year (12×30×24), used only for `ago` on books without a calendar. */
const FIXED_YEAR=8640
const STEP:Record<'day'|'month'|'year'|'era',number>={day:DAY,month:Y/12,year:Y,era:10*Y}
const RANK:Record<'day'|'month'|'year'|'era',number>={day:0,month:1,year:2,era:3}
const coarser=(a:WorldTimelinePrecision,b:WorldTimelinePrecision)=>RANK[a]>=RANK[b]?a:b

const CN_DIGIT:Record<string,number>={零:0,〇:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9}
/** 十二 → 12, 二十八 → 28, 一三四九 → 1349, 一千三百四十九 → 1349, 两千 → 2000; arabic digits pass through. */
export function cnNumber(text:string):number|undefined{
 if(/^\d+$/u.test(text))return Number(text)
 if(/^[零〇一二两三四五六七八九]{2,7}$/u.test(text)&&!/^[两]/u.test(text))return Number([...text].map(c=>CN_DIGIT[c]).join(''))
 if(!/^[零〇一二两三四五六七八九十百千万]+$/u.test(text))return undefined
 let total=0,section=0,digit:number|undefined
 for(const c of text){
  // docs/574 #6: 零 holds a place (一千零三 = 1003); it never joins a 三四百-style range.
  if(c==='零'||c==='〇'){digit=undefined;continue}
  // Two digits in a row (三四百 = 300–400) are a rough range; its middle is used.
  if(c in CN_DIGIT){digit=digit===undefined?CN_DIGIT[c]:(digit+CN_DIGIT[c])/2;continue}
  const unit=c==='十'?10:c==='百'?100:c==='千'?1000:10000
  if(unit===10000){total=(total+section+(digit??0))*10000;section=0;digit=undefined;continue}
  section+=(digit??(unit===10?1:NaN))*unit;digit=undefined
 }
 const value=total+section+(digit??0)
 return Number.isFinite(value)&&value>0&&value<=Number.MAX_SAFE_INTEGER?Math.round(value):undefined
}
const NUM='[0-9]+|[零〇一二两三四五六七八九十百千万]+'
/** A calendar position written in the source time words: "第五纪1349年6月28日凌晨", "第五纪元1198年", "七月九日",
 * "1300年前后". Relative words ("第二天", "三年前") give nothing; "一千三百年前" gives `ago`. */
export function worldTimelineTextTime(time:string|undefined):WorldTimelineTime{
 if(!time)return {}
 const out:WorldTimelineTime={}
 const era=/(第[一二三四五六七八九十0-9]+纪元?)/u.exec(time);if(era)out.era=era[1]
 // docs/582 r3 #2: "N年之前" is the same as "N年前".
 const ago=new RegExp(`(${NUM})(?:多|余)?年(?:之|以)?前(?!后)`,'u').exec(time)
 // docs/579 #4: any relative year (N年前/N年后/次年/去年/翌年/前年/后年/明年/今年以后…) means the month or day next to it
 // cannot be placed by this parser; only an absolute year makes them a date.
 // docs/582 #2: 同年/当年 mean "the year just mentioned", which R8 already carries, so they are not relative here. The
 // two-character words only count as a whole word: not inside 过去年代, 来年景, 此后年余; "N年后" needs a number and must not
 // be 年后半/年后期 (a half or a phase of that year).
 // docs/582 r3 #2: a counted or vague number of years later (三年之后, 三年过后, 数年后, 多年以后, 若干年后, 一年多后, 半年后)
 // and the year words 次年/翌年/去年/前年/后年/明年/来年/隔年. A year word must stand alone: not after another Han character
 // (过去年代, 近来年景) and not before 代/间/景/余/份 (年代, 年间…); 月 after it is fine (翌年月底的七月 is still next year).
 const relativeYear=!!ago||new RegExp(`(?:${NUM}|数|几|多|若干|半)(?:多|余)?年(?:多)?(?:之|以|过)?后(?![半期])|(?<![\\u4e00-\\u9fa5])(?:次年|去年|翌年|前年|后年|明年|来年|隔年)(?![代间景余份])`,'u').test(time)
 const ymd=new RegExp(`(?:(${NUM})年(?!(?:之|以|过)?前(?!后)|(?:之|以|过)?后(?![半期])|来|间|之久|的时间|多|余))?(?:(${NUM})月(?:(${NUM})[日号])?)?`,'gu')
 for(const m of time.matchAll(ymd)){
  if(!m[0]||!m[1]&&!m[2])continue
  // "三年前的七月": the month belongs to a relative year this parser cannot place, so it is dropped (docs/574 #7).
  if(!m[1]&&relativeYear)continue
  const year=m[1]?cnNumber(m[1]):undefined,month=m[2]?cnNumber(m[2]):undefined,day=m[3]?cnNumber(m[3]):undefined
  // A bare one- or two-digit year ("三年", "15年") is a duration, not a calendar year.
  if(m[1]&&(year===undefined||year<100&&!era))continue
  if(month!==undefined&&(month<1||month>12))continue
  if(day!==undefined&&(month===undefined||!isCivilDate(year??2000,month,day)))continue
  if(year!==undefined)out.year=year;if(month!==undefined)out.month=month;if(day!==undefined)out.day=day
  break
 }
 if(out.year===undefined&&out.month===undefined&&ago){const n=cnNumber(ago[1]);if(n!==undefined&&n>=1)out.ago=n}
 return out
}
/** docs/572 §2: sentences of the body that state a calendar (eras, 3–4 digit years, "一千三百年前"), in reading order. */
export function worldTimelineCalendarClues(units:ImportUnit[],max=120):string[]{
 const pattern=new RegExp(`第[一二三四五六七八九十0-9]+纪|[\\u4e00-\\u9fa5]{1,4}纪元|(?:[0-9]{3,4}|[零〇一二三四五六七八九]{3,4})年|[一二两三四五六七八九十]*[百千万][一二两三四五六七八九十百千万多余]*年[前后]`,'gu')
 const out:string[]=[],seen=new Set<string>();let last:{unit:string;a:number;b:number}|undefined
 for(const unit of [...units].sort((a,b)=>a.start-b.start))for(const m of unit.text.matchAll(pattern)){
  // The sentence around the match, at most 20 characters on each side.
  const chars=[...unit.text],at=[...unit.text.slice(0,m.index)].length,end=at+[...m[0]].length,stop=/[。！？!?\n]/u
  let a=at,b=end;while(a>0&&at-a<20&&!stop.test(chars[a-1]))a--;while(b<chars.length&&b-end<20&&!stop.test(chars[b]))b++
  // Matches whose window overlaps the previous clip of this unit extend it instead of repeating the sentence.
  if(last&&last.unit===unit.id&&a<=last.b){if(b>last.b){last.b=b;out[out.length-1]=chars.slice(last.a,b).join('').replace(/\s+/gu,' ').trim()}continue}
  const clip=chars.slice(a,b).join('').replace(/\s+/gu,' ').trim()
  if(seen.has(clip))continue;if(out.length>=max)return out;seen.add(clip);out.push(clip);last={unit:unit.id,a,b}
 }
 return out
}

/** docs/589 §4′: dates the narration states (not dialogue: text inside “”「」『』 is skipped, quotes reset per unit), as
 * [0-based chapter, clip of at most 14 characters around] in reading order, de-duplicated, at most `max`. Months must
 * be 1–12; "今天是" counts only before a year, month or weekday. Units outside every chapter give nothing. */
export function worldTimelineDateClues(units:ImportUnit[],chapters:{start:number;end:number}[],max=80):[number,string][]{
 const month='(?<![0-9零〇一二两三四五六七八九十])([0-9]{1,2}|十[一二]?|[一二三四五六七八九])月(?:初|中旬|上旬|下旬|底|末|([0-9]{1,2}|[一二三四五六七八九十]{1,3})[日号])'
 // A year after 今天是 has 3–4 digits (今天是1349年…), never 百年难遇 / 十年来.
 const today='今天是(?:(?:[0-9]{3,4}|[零〇一二三四五六七八九]{3,4})年|(?:[0-9]{1,2}|[一二三四五六七八九十]{1,3})月|周[一二三四五六日天]|星期[一二三四五六日天]|礼拜[一二三四五六日天])'
 const pattern=new RegExp(`${month}|${today}`,'gu'),open=new Set(['“','「','『']),close=new Set(['”','」','』']),HIDE='\u0000',stop=/[。！？!?\n\u0000]/u
 const out:[number,string][]=[],seen=new Set<string>()
 for(const unit of [...units].sort((a,b)=>a.start-b.start)){
  // Masking works on code points; the chapter lookup converts back to the source's UTF-16 offsets (code review M1).
  const source=[...unit.text];let depth=0
  const chars=source.map(c=>{if(open.has(c)){depth++;return HIDE}if(close.has(c)){depth=Math.max(0,depth-1);return HIDE}return depth?HIDE:c})
  const masked=chars.join('')
  for(const m of masked.matchAll(pattern)){
   if(m[1]!==undefined){const v=cnNumber(m[1]);if(v===undefined||v<1||v>12)continue}
   if(m[2]!==undefined){const d=cnNumber(m[2]);if(d===undefined||d<1||d>31)continue}
   const at=[...masked.slice(0,m.index)].length,end=at+[...m[0]].length
   const offset=unit.start+source.slice(0,at).join('').length
   const chapter=chapters.findIndex(c=>offset>=c.start&&offset<c.end);if(chapter<0)continue
   let a=at,b=end;while(a>0&&at-a<14&&!stop.test(chars[a-1]))a--;while(b<chars.length&&b-end<14&&!stop.test(chars[b]))b++
   const clip=chars.slice(a,b).join('').replace(/\s+/gu,' ').trim(),key=chapter+'\u0000'+clip
   if(seen.has(key))continue;if(out.length>=max)return out;seen.add(key);out.push([chapter,clip])
  }
 }
 return out
}

export interface WorldTimelineCalendar {eras:{name:string;aliases?:string[];years?:number|null;startAgo?:number|null}[];present?:{era:string;year?:number|null}|null}
/** docs/572 R12: segment calendars merged in first-seen order; disagreeing lengths are dropped; a cycle drops all. */
export function mergeWorldTimelineCalendars(list:(WorldTimelineCalendar|null|undefined)[]):WorldTimelineCalendar|null{
 const eras:{keys:Set<string>;name:string;aliases:Set<string>;years?:number|null;startAgo?:number|null;seen:number}[]=[],edges:[number,number][]=[]
 let present:WorldTimelineCalendar['present']
 for(const calendar of list){
  if(!calendar?.eras?.length)continue
  let prev=-1
  for(const raw of calendar.eras){
   const names=[raw.name,...(raw.aliases??[])].filter(n=>typeof n==='string'),keys=names.map(eraKey)
   let at=eras.findIndex(e=>keys.some(k=>e.keys.has(k)))
   if(at<0){eras.push({keys:new Set(keys),name:raw.name,aliases:new Set(raw.aliases??[]),years:raw.years??null,startAgo:raw.startAgo??null,seen:eras.length});at=eras.length-1}
   else{const e=eras[at];for(const k of keys)e.keys.add(k);for(const a of raw.aliases??[])if(eraKey(a)!==eraKey(e.name))e.aliases.add(a)
    if((raw.years??null)!==(e.years??null))e.years=e.years===undefined?raw.years:null
    if((raw.startAgo??null)!==(e.startAgo??null))e.startAgo=null}
   if(prev>=0&&prev!==at)edges.push([prev,at]);prev=at
  }
  if(present===undefined&&calendar.present)present=calendar.present
 }
 if(!eras.length)return null
 // Topological order over the observed "before" edges; ties keep first-seen order. A cycle drops the calendar.
 const indeg=eras.map(()=>0);for(const [,b] of edges)indeg[b]++
 const order:number[]=[],ready=eras.map((_,i)=>i).filter(i=>!indeg[i])
 while(ready.length){ready.sort((a,b)=>a-b);const i=ready.shift()!;order.push(i);for(const [a,b] of edges)if(a===i&&--indeg[b]===0)ready.push(b)}
 if(order.length!==eras.length)return null
 return {eras:order.map(i=>({name:eras[i].name,aliases:[...eras[i].aliases].slice(0,5),years:eras[i].years??null,startAgo:eras[i].startAgo??null})),...(present?{present}:{})}
}

/** Era index by name or alias (normalised); -1 when unknown. */
function eraIndex(calendar:WorldTimelineCalendar,name:string|undefined){
 if(!name)return -1;const key=eraKey(name)
 const exact=calendar.eras.findIndex(e=>eraKey(e.name)===key);if(exact>=0)return exact
 return calendar.eras.findIndex(e=>(e.aliases??[]).some(a=>eraKey(a)===key))
}
const validYear=(n:unknown):n is number=>Number.isSafeInteger(n)&&(n as number)>=1&&(n as number)<=ERA_MAX_YEAR
const validAgo=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n)&&n>0&&n<=ERA_MAX_YEAR
/** The checked time of one ranked event; invalid parts are dropped as a whole (docs/573 EC-46). */
function cleanTime(t:WorldTimelineTime):WorldTimelineTime{
 const out:WorldTimelineTime={}
 if(typeof t.era==='string'&&t.era.trim())out.era=t.era.trim()
 if(t.year!==undefined&&!validYear(t.year))return out.era?{era:out.era}:{}
 if(t.month!==undefined&&(!Number.isSafeInteger(t.month)||t.month<1||t.month>12))return out.era?{era:out.era}:{}
 if(t.day!==undefined&&(t.month===undefined||!Number.isSafeInteger(t.day)||!isCivilDate(t.year??2000,t.month,t.day)))return out.era?{era:out.era}:{}
 if(t.year!==undefined)out.year=t.year;if(t.month!==undefined)out.month=t.month;if(t.day!==undefined)out.day=t.day
 if(t.ago!==undefined&&validAgo(t.ago)&&t.year===undefined)out.ago=t.ago
 return out
}
const hasTime=(t:WorldTimelineTime)=>t.era!==undefined||t.year!==undefined||t.month!==undefined||t.ago!==undefined

/** Validates a model reply against the catalogue: unknown ids and repeats are dropped, missing ids are put back
 * after their reading neighbour, ranks are renumbered 0..n-1, invalid time parts dropped. Throws when no id is usable. */
export function orderWorldTimeline(catalog:WorldTimelineEntry[],reply:WorldTimelineReplyItem[],chapterCount?:number):WorldTimelineRanked[]{
 const known=new Set(catalog.map(e=>e.id)),seen=new Set<string>()
 // docs/589 §1″: each rank carries its reading chapter; an unlocatable one (index >= chapter count) carries none.
 const chapterOf=new Map(catalog.flatMap(e=>Number.isSafeInteger(e.chapterIndex)&&e.chapterIndex>=0&&(chapterCount===undefined||e.chapterIndex<chapterCount)?[[e.id,e.chapterIndex] as const]:[]))
 const withChapter=(r:WorldTimelineRanked)=>chapterOf.has(r.id)?{...r,chapterIndex:chapterOf.get(r.id)}:r
 const kept=reply.map((item,k)=>({item,k})).filter(({item})=>{if(!known.has(item.id)||seen.has(item.id)||!Number.isSafeInteger(item.order)||item.order<0)return false;seen.add(item.id);return true}).sort((a,b)=>Number(a.item.phase!=='前史')-Number(b.item.phase!=='前史')||a.item.order-b.item.order||a.k-b.k).map(({item})=>item)
 if(!kept.length)throw Error('模型未返回可用的世界线时间顺序')
 const timeOf=new Map(catalog.map(e=>[e.id,e.time]))
 // The model's time first; the source time words fill what it left out.
 const timeFor=(id:string,item?:WorldTimelineReplyItem):WorldTimelineTime=>{
  const own=cleanTime({era:item?.era,year:item?.year,month:item?.month,day:item?.day,ago:item?.ago}),text=cleanTime(worldTimelineTextTime(timeOf.get(id)))
  if(!hasTime(own))return text
  const out={...own},sameEra=!own.era||!text.era||eraKey(own.era)===eraKey(text.era)
  // The source words add what the model left out, never contradicting it.
  if(own.year===undefined&&own.month===undefined&&own.ago===undefined&&text.month!==undefined&&sameEra)Object.assign(out,{year:text.year,month:text.month,day:text.day})
  if(!out.era&&text.era&&(out.year===undefined||out.year===text.year))out.era=text.era
  return out
 }
 const strip=(t:WorldTimelineTime)=>Object.fromEntries(Object.entries(t).filter(([,v])=>v!==undefined)) as WorldTimelineTime
 const list:WorldTimelineRanked[]=kept.map(item=>({id:item.id,rank:0,...strip(timeFor(item.id,item)),...(item.phase?{phase:item.phase}:{})}))
 for(const [i,entry] of catalog.entries()){
  if(seen.has(entry.id))continue
  let at=0;for(let j=i-1;j>=0;j--){const k=list.findIndex(x=>x.id===catalog[j].id);if(k>=0){at=k+1;break}}
  list.splice(at,0,{id:entry.id,rank:0,...strip(timeFor(entry.id))});seen.add(entry.id)
 }
 return list.map((x,rank)=>withChapter({...x,rank}))
}

/** docs/572 (wl-era1): segments are ordered separately, so a later segment's backstory must not follow the first
 * segment's main story. Every segment's 前史 ranks go before all 主线 ranks; inside each group the segments are
 * merged (each keeps its own order) by era, carried forward within a segment, with ties to the earlier segment.
 * Ranks are renumbered 0..n-1. */
export function mergeWorldTimelineSegments(orders:WorldTimelineRanked[][],calendar:WorldTimelineCalendar|null):WorldTimelineRanked[]{
 const presentIndex=calendar?(calendar.present&&eraIndex(calendar,calendar.present.era)>=0?eraIndex(calendar,calendar.present.era):calendar.eras.length-1):0
 const keyed=(group:'前史'|'主线')=>orders.map(order=>{
  let carry=-1
  return order.filter(r=>(r.phase==='前史')===(group==='前史')).map(r=>{
   const own=calendar&&r.era?eraIndex(calendar,r.era):-1,key=own>=0?own:r.year!==undefined||r.ago!==undefined?Math.max(carry,presentIndex):carry
   carry=Math.max(carry,key);return {r,key}
  })
 })
 const merge=(lists:{r:WorldTimelineRanked;key:number}[][])=>{
  const at=lists.map(()=>0),out:WorldTimelineRanked[]=[]
  for(;;){let best=-1;for(let i=0;i<lists.length;i++)if(at[i]<lists[i].length&&(best<0||lists[i][at[i]].key<lists[best][at[best]].key))best=i
   if(best<0)return out;out.push(lists[best][at[best]++].r)}
 }
 return [...merge(keyed('前史')),...orders.flatMap(o=>o.filter(r=>r.phase!=='前史'))].map((r,rank)=>({...r,rank}))
}

/** Longest non-decreasing subsequence (ties keep the earliest-ending run); O(n²), n is the anchor count. */
/** Heaviest chain of defined values in rank order where each earlier one is `before` the later one (default: <=).
 * Weights let written dates outweigh estimates (docs/582 r3–r4). */
function nonDecreasing(values:(number|undefined)[],weight:(i:number)=>number=()=>1,before:(b:number,a:number)=>boolean=(b,a)=>values[b]!<=values[a]!):Set<number>{
 const idx=values.flatMap((d,i)=>d===undefined?[]:[i]),len=idx.map(i=>weight(i)),prev=idx.map(()=>-1)
 for(let a=0;a<idx.length;a++)for(let b=0;b<a;b++)if(before(idx[b],idx[a])&&len[b]+weight(idx[a])>len[a]){len[a]=len[b]+weight(idx[a]);prev[a]=b}
 const keep=new Set<number>();let best=-1;for(let a=0;a<idx.length;a++)if(best<0||len[a]>len[best])best=a
 for(let a=best;a>=0;a=prev[a])keep.add(idx[a])
 return keep
}

interface Placed {value:number;precision:WorldTimelinePrecision;own:boolean}
/** docs/572 §3/R3/R4/R7–R10: places every rank on the hour axis. Returns the eras (with starts) when the book has a
 * calendar, else a fixed-calendar placement. */
function placeRanks(ranked:WorldTimelineRanked[],calendar:WorldTimelineCalendar|null):{placed:Placed[];eras?:Era[];gregorian:boolean}{
 const n=ranked.length,times=ranked.map(r=>({...r}))
 const anyYear=times.some(t=>t.year!==undefined)
 // Unknown era names are dropped; the date parts stay (EC-45).
 if(calendar)for(const t of times)if(t.era!==undefined&&eraIndex(calendar,t.era)<0)delete t.era
 if(!calendar&&anyYear)calendar={eras:[{name:''}]}
 if(!calendar)return placeFixed(times)
 const eraCount=calendar.eras.length
 const presentIndex=calendar.present&&eraIndex(calendar,calendar.present.era)>=0?eraIndex(calendar,calendar.present.era):eraCount-1
 const presentYear=calendar.present&&validYear(calendar.present.year)?calendar.present.year:undefined
 // Era of each rank: own, else carried from the previous ranked era-or-year anchor, else the first, else present (R8).
 // docs/574 #4: only a dated era (era + year) is inherited; an era-only prehistory rank does not pull the main line back.
 const firstEra=times.find(t=>t.era!==undefined&&t.year!==undefined)?.era
 let carryEra:number|undefined,carryYear:number|undefined,lastMonth:number|undefined
 const firstDated=times.find(t=>t.year!==undefined)
 const eraOf=times.map(t=>t.era!==undefined?eraIndex(calendar!,t.era):-1)
 // docs/589 §1″: with a known story year, a month-day takes a year written in its own chapter (backstory and the rest
 // keep separate chapter states), else the story year: backstory never rolls it over, the main story rolls it over
 // only from a late month (10–12) to an early one (1–3). Other books and other eras keep the R8 inheritance below.
 // `main` records whether the writer may set the story year (code review M5): a main-story month only takes a chapter
 // year from such a writer.
 type ChapterYear={era:number;year:number;last?:number;main:boolean}
 const chapterYears=[new Map<number,ChapterYear>(),new Map<number,ChapterYear>()]
 let mainYear=presentYear,mainLast:number|undefined
 // Code review M4: the R8 fallback takes the last year of the rank's own era, not a year carried from another era.
 const eraYear=new Map<number,{year:number;last?:number}>()
 const chapterKey=(t:WorldTimelineRanked)=>t.chapterIndex!==undefined&&Number.isSafeInteger(t.chapterIndex)&&t.chapterIndex>=0?t.chapterIndex:undefined
 const setsMain=(t:WorldTimelineRanked,year:number)=>t.phase==='主线'||t.phase!=='前史'&&presentYear!==undefined&&year>=presentYear
 const carry=(era:number,year:number,month?:number)=>{carryEra=era;carryYear=year;lastMonth=month;eraYear.set(era,{year,last:month})}
 for(const [i,t] of times.entries()){
  // docs/589 §2′: a main-story event happens during the main story, never years before it starts.
  if(t.phase==='主线')delete t.ago
  if(t.ago!==undefined&&presentYear===undefined)delete t.ago
  const states=chapterYears[t.phase==='前史'?0:1],chapter=chapterKey(t)
  if(t.year!==undefined){if(eraOf[i]<0)eraOf[i]=carryEra??(firstEra?eraIndex(calendar,firstEra):presentIndex);carry(eraOf[i],t.year,t.month)
   if(presentYear!==undefined){const main=eraOf[i]===presentIndex&&setsMain(t,t.year);if(chapter!==undefined)states.set(chapter,{era:eraOf[i],year:t.year,last:t.month,main});if(main){mainYear=t.year;mainLast=t.month}}
   continue}
  // Code review M4: an era-less backstory month right after a year of an earlier era keeps the R8 inheritance.
  if(t.month!==undefined&&presentYear!==undefined&&(eraOf[i]===presentIndex||eraOf[i]<0&&(t.phase==='主线'||carryEra===undefined||carryEra===presentIndex))){
   const found=chapter!==undefined?states.get(chapter):undefined
   const own=found&&(eraOf[i]<0||found.era===eraOf[i])&&(t.phase!=='主线'||found.main)?found:undefined
   let era=presentIndex,year:number
   if(own){
    year=own.year;if(own.last!==undefined&&t.month+6<own.last)year++
    era=own.era;own.year=year;own.last=t.month
    if(t.phase!=='前史'&&era===presentIndex&&setsMain(t,year)){mainYear=year;mainLast=t.month;own.main=true}
   }else if(t.phase==='前史')year=presentYear
   else{
    year=mainYear!;if(mainLast!==undefined&&mainLast>=10&&t.month<=3)year++
    mainYear=year;mainLast=t.month;if(chapter!==undefined)states.set(chapter,{era,year,last:t.month,main:true})
   }
   t.year=year;eraOf[i]=era;carry(era,year,t.month)
   if(t.day!==undefined&&!isCivilDate(year,t.month,t.day))delete t.day
   continue
  }
  if(t.month!==undefined){
   const era=eraOf[i]>=0?eraOf[i]:carryEra??(firstDated?eraOf[times.indexOf(firstDated)]>=0?eraOf[times.indexOf(firstDated)]:eraIndex(calendar,firstDated.era)>=0?eraIndex(calendar,firstDated.era):presentIndex:presentIndex)
   const same=carryEra===undefined||carryEra===era?(carryYear!==undefined?{year:carryYear,last:lastMonth}:undefined):eraYear.get(era)
   let year=same?.year??firstDated?.year??presentYear
   if(year===undefined){delete t.month;delete t.day;continue}
   if(same&&same.last!==undefined&&t.month+6<same.last)year++
   t.year=year;eraOf[i]=era;carry(era,year,t.month)
   if(t.day!==undefined&&!isCivilDate(year,t.month,t.day))delete t.day
  }
 }
 // Era sequence must not go back (R4 step 1); offenders lose all their time parts.
 // docs/582 r5 (reviewer's option B, O(n²), transitive):
 //  1. Dated ranks only: heaviest non-decreasing chain by (era index, full civil date). A rank whose source wrote a year
 //     (ranked[i].year) weighs n+1, a year inherited through R8 weighs 1 — the same rule as the point filter below.
 //  2. An era-only rank is kept when its era lies between the eras of the nearest kept dated ranks before and after it,
 //     so it can never join two dated ranks into a pair that goes back.
 const dated=(i:number)=>times[i].year!==undefined
 const writtenWeight=(i:number)=>ranked[i].year!==undefined?n+1:1
 const dateKey=(i:number)=>eraOf[i]*4e9+civilDays(times[i].year!,times[i].month??1,times[i].day??1)
 const datedKeep=nonDecreasing(times.map((_,i)=>eraOf[i]>=0&&dated(i)?dateKey(i):undefined),writtenWeight)
 const eraKeep=new Set(datedKeep)
 for(let i=0;i<n;i++){
  if(eraOf[i]<0||dated(i))continue
  let lo=-Infinity,hi=Infinity
  for(let k=i-1;k>=0;k--)if(datedKeep.has(k)){lo=eraOf[k];break}
  for(let k=i+1;k<n;k++)if(datedKeep.has(k)){hi=eraOf[k];break}
  if(lo<=eraOf[i]&&eraOf[i]<=hi)eraKeep.add(i)
 }
 // Era-only ranks among themselves must not go back either (EC-33: 赤铜纪5年, 青石纪, 赤铜纪6年 drops 青石纪 above;
 // two era-only ranks between the same anchors keep their era order).
 const eraOnly=[...eraKeep].filter(i=>!dated(i)).sort((a,b)=>a-b),onlyKeep=nonDecreasing(eraOnly.map(i=>eraOf[i]))
 eraOnly.forEach((i,k)=>{if(!onlyKeep.has(k))eraKeep.delete(i)})
 for(let i=0;i<n;i++)if(eraOf[i]>=0&&!eraKeep.has(i)){eraOf[i]=-1;for(const k of ['era','year','month','day'] as const)delete times[i][k]}
 // Era starts (R3): the present era starts at 0; earlier eras from startAgo, years, or an estimate.
 const presentYearStart=presentYear!==undefined?civilDays(presentYear,1,1)*DAY:0
 const agoValue=(ago:number)=>presentYear!==undefined&&Number.isInteger(ago)&&ago<presentYear?civilDays(presentYear-ago,1,1)*DAY:presentYearStart-ago*Y
 const maxYear=calendar.eras.map((_,e)=>Math.max(0,...times.filter((t,i)=>eraOf[i]===e&&t.year!==undefined).map(t=>t.year!),
  // docs/579 #3: the present era also holds present.year, and every ago that lands after its start (ago < present year).
  ...(e===presentIndex&&presentYear!==undefined?[presentYear,...times.filter(t=>t.ago!==undefined&&t.ago<presentYear).map(()=>presentYear)]:[])))
 const estimate=(e:number,extra=0)=>Math.max(100,Math.ceil(Math.max(maxYear[e],extra)*1.1+10))
 // docs/574 #2: every era starts on a whole day, so value−start is an exact number of days.
 const wholeDay=(v:number)=>Math.floor(v/DAY)*DAY,upDay=(v:number)=>Math.ceil(v/DAY)*DAY
 // docs/574 #3: a stated length (years or startAgo) that cannot hold the largest year written in that era is ignored.
 // docs/579 #1: the length must hold the whole largest year: its last day (12-31) ends before the era does.
 const yearsEnd=(years:number)=>civilDays(years+1,1,1)*DAY
 // docs/582 #1: Y is a mean year, so "the next 1 January fits" rejects valid lengths by up to a day. The length only has to
 // reach past the start of the last day (12-31) of the largest year.
 const fits=(e:number,years:number)=>maxYear[e]===0||years*Y>yearsEnd(maxYear[e])-DAY
 const lengthOf=(e:number)=>{const y=calendar!.eras[e].years;return y!=null&&validYear(y)&&fits(e,y)?y:estimate(e)}
 const starts:number[]=new Array(eraCount)
 starts[presentIndex]=0
 for(let e=presentIndex-1;e>=0;e--){
  const raw=calendar.eras[e],next=starts[e+1]
  const overshoot=e===presentIndex-1?Math.max(0,...times.filter((t,i)=>t.ago!==undefined&&eraOf[i]<0&&agoValue(t.ago)<0).map(t=>-agoValue(t.ago!)/Y)):0
  const fromAgo=raw.startAgo!=null&&validAgo(raw.startAgo)&&presentYear!==undefined?agoValue(raw.startAgo):NaN
  let start=Number.isFinite(fromAgo)&&fits(e,(next-fromAgo)/Y)?fromAgo:raw.years!=null&&validYear(raw.years)&&fits(e,raw.years)?next-raw.years*Y:NaN
  if(!(start<next))start=next-estimate(e,overshoot)*Y
  starts[e]=wholeDay(start)
 }
 // docs/579 #1: eras after the present one round their start up, so the previous era keeps its full length.
 for(let e=presentIndex+1;e<eraCount;e++)starts[e]=upDay(starts[e-1]+Math.max(lengthOf(e-1)*Y,yearsEnd(maxYear[e-1])))
 const lastEnd=upDay(starts[eraCount-1]+Math.max(lengthOf(eraCount-1)*Y,yearsEnd(maxYear[eraCount-1])))
 const eraRange=(e:number):[number,number]=>[starts[e],e+1<eraCount?starts[e+1]:lastEnd]
 // Point anchors: era+year(+month+day) and ago. Era-only ranks are ranges (R4/R9).
 const point:(number|undefined)[]=new Array(n),precision:(WorldTimelinePrecision|undefined)[]=new Array(n)
 for(const [i,t] of times.entries()){
  if(t.year!==undefined&&eraOf[i]>=0){point[i]=starts[eraOf[i]]+civilDays(t.year,t.month??1,t.day??1)*DAY;precision[i]=t.day!==undefined?'day':t.month!==undefined?'month':'year'}
  else if(t.ago!==undefined){
   let v=agoValue(t.ago),p:WorldTimelinePrecision=v>=starts[presentIndex]?'year':'era'
   // docs/582 round 3 #1: in an earlier era the mean-year estimate is snapped to the 1 January of the civil year it falls
   // in, so it lines up with an explicit year of that era instead of landing a few days before it.
   if(p==='era'&&Number.isInteger(t.ago)){const e=starts.findLastIndex((st,k)=>st<=v&&(k+1>=eraCount||starts[k+1]>v));if(e>=0){// docs/582 r4 #2: +183 days picks the nearest 1 January (a value a few hours before New Year belongs to the new year).
    const day=Math.round((v-starts[e])/DAY),y=civilFromDays(day+183).year;v=starts[e]+civilDays(y,1,1)*DAY}}
   point[i]=v;precision[i]=p
  }
 }
 // An explicit date is worth more than any number of ago estimates it conflicts with (weight n+1 > n×1).
 // docs/582 r4 #1: only a year written in the rank itself (ranked[i].year) outweighs ago; a month that inherited its year
 // through R8 is an estimate like any other.
 // Point values must not go back: values decide here, so placement stays strictly increasing. ("1344年3月" then "1344年"
 // keeps only one of the two; the era filter above already prefers written dates over estimates.)
 const keep=nonDecreasing(point,i=>ranked[i].year!==undefined&&eraOf[i]>=0?n+1:1)
 for(let i=0;i<n;i++)if(point[i]!==undefined&&!keep.has(i)){point[i]=undefined;precision[i]=undefined;eraOf[i]=-1}
 const own=point.map(p=>p!==undefined)
 // docs/574 #1: all era-only ranks between two point anchors share that gap in rank order. Each one gets the next
 // slot inside the intersection of its era range and [floor, gap end), and its value becomes the floor for the next,
 // so a later rank never lands before an earlier one, even when other eras or undated ranks sit in between.
 const anchors=point.flatMap((p,i)=>p===undefined?[]:[i])
 const bounds=(i:number):[number,number]=>{let a=-Infinity,b=Infinity;for(const k of anchors){if(k<i)a=point[k]!;else if(k>i){b=point[k]!;break}}return [a,b]}
 let floor=-Infinity,gapEnd:number|undefined
 for(let i=0;i<n;i++){
  if(point[i]!==undefined){floor=point[i]!;gapEnd=undefined;continue}
  if(eraOf[i]<0)continue
  const [ga,gb]=bounds(i);if(gapEnd!==gb){gapEnd=gb;floor=Math.max(floor,ga)}
  // Remaining era-only ranks in this gap that belong to the same era share its free part evenly.
  let k=1;for(let j=i+1;j<n&&point[j]===undefined;j++)if(eraOf[j]===eraOf[i])k++
  const [ea,eb]=eraRange(eraOf[i]),lo=Math.max(ea,floor),hi=Math.min(eb,gb)
  if(!(lo<hi))continue
  point[i]=lo+(hi-lo)/(k+1);precision[i]='era';floor=point[i]!
 }
 fillMainZone(times,point,precision,own,presentYear!==undefined?starts[presentIndex]+civilDays(presentYear,1,1)*DAY:undefined,k=>eraOf[k]===presentIndex)
 const placed=interpolate(point,precision,own)
 const eras:Era[]=calendar.eras.map((e,i)=>({name:e.name,start:starts[i]}))
 return {placed,eras,gregorian:true}
}
/** docs/589 §3″: undated runs of the main story (from the first 主线 rank on) are placed by chapter, one day per chapter
 * change, instead of stepping a year or a month per rank from a far anchor. `floor` is 1 January of the story year.
 * A: between two placed ranks of the main zone, left to interpolation. B: after a main-zone rank to the end, from it.
 * C: after backstory (or nothing) to the end, from max(previous + 1 day, floor). D: before a placed rank with backstory
 * (or nothing) before, backwards from that rank; when that lands before floor or the previous value it spreads evenly
 * inside the free range, or stays to interpolation. Values never leave (previous, next), so placement stays increasing. */
function fillMainZone(times:WorldTimelineRanked[],point:(number|undefined)[],precision:(WorldTimelinePrecision|undefined)[],own:boolean[],floor:number|undefined,presentEra:(k:number)=>boolean){
 const n=times.length,firstMain=times.findIndex(t=>t.phase==='主线')
 if(firstMain<0)return
 // Code review M2: with a known story year, an era-only placement inside the main zone is only a guess at the era's
 // middle (often decades before the story year); those ranks are placed by chapter like undated ones. Only the present
 // era: an era-only rank of another era the model named keeps its era (code review round 2, R2-M1).
 if(floor!==undefined)for(let k=firstMain;k<n;k++)if(point[k]!==undefined&&!own[k]&&times[k].phase!=='前史'&&presentEra(k)){point[k]=undefined;precision[k]=undefined}
 const changes=(a:number,b:number)=>{const x=times[a].chapterIndex,y=times[b].chapterIndex;return x===undefined||y===undefined||x!==y?1:0}
 // Code review M3: ranks of one chapter at the end of the list share their day: spread them inside it, after `start`
 // (the anchor of that chapter, when it is one), instead of leaving the run to a year- or month-wide spread.
 const spread=(from:number,to:number,start?:number)=>{
  for(let a=from;a<=to;){let b=a;while(b+1<=to&&point[b+1]===point[a])b++
   const base=point[a]!,lead=start!==undefined&&start===base?1:0,count=b-a+1+lead
   for(let k=a;k<=b;k++)point[k]=base+DAY*(k-a+lead)/count
   a=b+1}
 }
 for(let i=firstMain;i<n;){
  if(point[i]!==undefined){i++;continue}
  let j=i;while(j+1<n&&point[j+1]===undefined)j++
  let p=-1;for(let k=i-1;k>=0;k--)if(point[k]!==undefined){p=k;break}
  const lo=p>=0?point[p]!:-Infinity,hi=j+1<n?point[j+1]!:Infinity,mainBefore=p>=firstMain&&own[p]
  if(mainBefore&&hi===Infinity){
   let v=lo;for(let k=i;k<=j;k++){v+=changes(k-1,k)*DAY;point[k]=v;precision[k]=precision[p]}
   spread(i,j,lo)
  }else if(!mainBefore&&hi===Infinity){
   let v=lo>-Infinity?Math.max(lo+DAY,floor??-Infinity):floor
   if(v!==undefined){for(let k=i;k<=j;k++){if(k>i)v+=changes(k-1,k)*DAY;point[k]=v;precision[k]='year'}spread(i,j)}
  }else if(!mainBefore){
   const back:number[]=new Array(j-i+1);let c=changes(j,j+1);back[j-i]=c
   for(let k=j-1;k>=i;k--){c+=changes(k,k+1);back[k-i]=c}
   const values=back.map(c=>hi-Math.max(c,1)*DAY)
   if(values[0]>lo&&(floor===undefined||values[0]>=floor))values.forEach((v,k)=>{point[i+k]=v;precision[i+k]=precision[j+1]})
   else{
    const a=floor!==undefined&&floor<hi?Math.max(floor,lo):lo>-Infinity?lo:undefined
    if(a!==undefined){const m=j-i+1;for(let k=0;k<m;k++){point[i+k]=a+(hi-a)*(k+1)/(m+1);precision[i+k]=precision[j+1]}}
   }
  }
  i=j+1
 }
}
/** Ranks between placed ones are interpolated; before the first and after the last they step by the neighbour's
 * precision; equal runs are spread inside [v, min(next, v+step)). */
function interpolate(point:(number|undefined)[],precision:(WorldTimelinePrecision|undefined)[],own:boolean[]):Placed[]{
 const n=point.length,placedIdx=point.flatMap((p,i)=>p===undefined?[]:[i])
 const value:number[]=new Array(n),prec:WorldTimelinePrecision[]=new Array(n)
 if(!placedIdx.length){for(let i=0;i<n;i++){value[i]=i*DAY;prec[i]='day'}}
 else{
  for(const i of placedIdx){value[i]=point[i]!;prec[i]=precision[i]!}
  const first=placedIdx[0],last=placedIdx.at(-1)!
  for(let i=first-1;i>=0;i--){prec[i]=prec[first];value[i]=value[first]-(first-i)*STEP[prec[first]]}
  for(let i=last+1;i<n;i++){prec[i]=prec[last];value[i]=value[last]+(i-last)*STEP[prec[last]]}
  for(let k=0;k+1<placedIdx.length;k++){const a=placedIdx[k],b=placedIdx[k+1],p=coarser(prec[a],prec[b]),span=value[b]-value[a]
   // Day anchors keep whole-day slots (docs/570 WT-08); coarser gaps interpolate linearly.
   for(let i=a+1;i<b;i++){prec[i]=p;value[i]=p==='day'?value[a]+Math.floor(span/DAY*(i-a)/(b-a))*DAY:value[a]+span*(i-a)/(b-a)}}
 }
 // Strictly increasing: a run of equal values spreads inside [v, min(next distinct value, v+step)).
 for(let i=0;i<n;){
  let j=i;while(j+1<n&&value[j+1]===value[i])j++
  // docs/579 #2: the run spreads inside the finest step among its members, so "1349年" then "1349年1月1日" keeps
  // the second inside 1 January instead of half a year later.
  if(j>i){const next=j+1<n?value[j+1]:Infinity,finest=Math.min(...prec.slice(i,j+1).map(p=>STEP[p])),width=Math.min(next-value[i],finest),k=j-i+1;for(let x=1;x<k;x++)value[i+x]=value[i]+width*x/k}
  i=j+1
 }
 return value.map((v,i)=>({value:v,precision:prec[i],own:own[i]}))
}
/** Books without a calendar (docs/572 §3): fixed calendar, one day per rank, zero at the first main-story rank;
 * month-day dates keep the docs/570 day spacing; `ago` counts fixed years back from zero. */
function placeFixed(times:WorldTimelineRanked[]):{placed:Placed[];gregorian:false}{
 const n=times.length,zeroRank=Math.max(0,times.findIndex(t=>t.phase==='主线'))
 const point:(number|undefined)[]=new Array(n),precision:(WorldTimelinePrecision|undefined)[]=new Array(n)
 // Month-day dates: day numbers in a reference year, carried over December (docs/570 WT-12/13).
 let year=2001,lastMonth:number|undefined
 for(const [i,t] of times.entries())if(t.month!==undefined&&t.day!==undefined){if(lastMonth!==undefined&&t.month+6<lastMonth)year++;lastMonth=t.month;point[i]=civilDays(year,t.month,t.day)*DAY;precision[i]='day'}
 const keep=nonDecreasing(point);for(let i=0;i<n;i++)if(point[i]!==undefined&&!keep.has(i))point[i]=undefined
 const dated=point.some(p=>p!==undefined)
 if(!dated){
  // One day per rank, zero at the first main-story rank; an `ago` rank sits that many fixed years before zero.
  for(let i=0;i<n;i++){point[i]=(i-zeroRank)*DAY;precision[i]='day'}
  const ago=times.map(t=>t.ago!==undefined?-t.ago*FIXED_YEAR:undefined),agoKeep=nonDecreasing(ago)
  for(let i=0;i<n;i++)if(ago[i]!==undefined&&agoKeep.has(i)&&i<zeroRank)point[i]=ago[i]
  // Ranks before an ago anchor must stay below it; re-step them from the anchor.
  for(let i=zeroRank-1;i>=0;i--)if(point[i]!>=point[i+1]!)point[i]=point[i+1]!-DAY
  return {placed:point.map((v,i)=>({value:v!,precision:'day' as const,own:ago[i]!==undefined&&agoKeep.has(i)&&i<zeroRank})),gregorian:false}
 }
 const own=point.map(p=>p!==undefined),placed=interpolate(point,precision,own),base=placed.find(p=>p.own)!.value
 return {placed:placed.map(p=>({...p,value:p.value-base})),gregorian:false}
}

/** Places every ranked event on the one worldline (docs/570 §2, docs/572 §3). Locked events keep their facts.
 * Worldline slots are refilled in rank order. */
export function applyWorldTimeline(artifacts:ImportArtifact[],ranked:WorldTimelineRanked[],locks:ImportSemanticLock[],calendar:WorldTimelineCalendar|null=null):{artifacts:ImportArtifact[];timeline:WorldTimelineState}{
 const {placed,eras,gregorian}=placeRanks(ranked,calendar)
 const locked=new Set(locks.filter(l=>(WORLD_TIMELINE_FIELDS as readonly string[]).includes(l.field)).map(l=>l.artifactId))
 const rankOf=new Map(ranked.map(r=>[r.id,r.rank])),byId=new Map(artifacts.map(a=>[a.id,a]))
 const out=new Map<string,ImportArtifact>(),precisions:Record<string,WorldTimelinePrecision>={}
 for(const r of ranked){
  const a=byId.get(r.id);if(!a)continue
  if(locked.has(a.id)){out.set(a.id,a);continue}
  const p=placed[r.rank],facts={...a.facts},label=facts.time?.trim()??''
  delete facts.timeEnd
  // Hours are kept to 6 decimals so the saved text stays short and still strictly increases.
  Object.assign(facts,{lineId:WORLD_TIMELINE_LINE_ID,lineName:WORLD_TIMELINE_LINE_NAME,timeKind:'exact',timeValue:String(Math.round(p.value*1e6)/1e6)})
  if(!p.own&&!label.endsWith(WORLD_TIMELINE_INFERRED_MARK))facts.time=label?label+' '+WORLD_TIMELINE_INFERRED_MARK:WORLD_TIMELINE_INFERRED_MARK
  if(gregorian)precisions[a.id]=p.precision
  out.set(a.id,{...a,facts})
 }
 const order=[...out.values()].sort((x,y)=>rankOf.get(x.id)!-rankOf.get(y.id)!);let next=0
 const list=artifacts.map(a=>out.has(a.id)?order[next++]:a)
 return {artifacts:list,timeline:gregorian?{version:1,calendar:'gregorian',epoch:ERA_EPOCH,events:ranked.length,eras:eras!,precisions}:{version:1,calendar:'fixed',epoch:'故事开始',events:ranked.length}}
}

/** docs/570 3R: the request carries the catalogue as compact rows [key,chapterIndex,name,summary,time,attribution] with
 * short keys e1..en, so a whole volume (hundreds of events) fits one request and cross-chapter backstory can be ordered. */
const ROW_TEXT=60,ROW_TIME=40,ROW_ATTRIBUTION=24
const cut=(text:string|undefined,n:number)=>{if(!text)return '';const chars=[...text.trim()];return chars.length<=n?chars.join(''):chars.slice(0,n).join('')}
export function worldTimelineRequestRows(segment:WorldTimelineEntry[]):string{
 return JSON.stringify(segment.map((e,k)=>['e'+(k+1),e.chapterIndex,cut(e.name,80),cut(e.text,ROW_TEXT),cut(e.time,ROW_TIME),cut(e.attribution,ROW_ATTRIBUTION)]))
}
/** Size of a segment as sent; used to cut segments. */
export const worldTimelineRowSize=(segment:WorldTimelineEntry[])=>worldTimelineRequestRows(segment).length
/** Short keys in a reply back to catalogue ids; unknown keys stay as they are (and are dropped by orderWorldTimeline). */
export function worldTimelineReplyIds(segment:WorldTimelineEntry[],reply:WorldTimelineReplyItem[]):WorldTimelineReplyItem[]{
 const byKey=new Map(segment.map((e,k)=>['e'+(k+1),e.id]))
 return reply.map(item=>({...item,id:byKey.get(item.id)??item.id}))
}

/** docs/570 4R: working units of the chapters that no inferred event cites. */
export function worldTimelineEmptyChapters(artifacts:ImportArtifact[],units:ImportUnit[],chapters:{start:number;end:number}[]):ImportUnit[]{
 // A chapter counts as having an event when some inferred event cites a quote inside it (any evidence, not only the first).
 const byId=new Map(units.map(u=>[u.id,u])),used=new Set<number>()
 for(const a of artifacts)if(a.kind==='worldline'&&a.origin==='inferred')for(const e of a.evidence){const u=byId.get(e.unitId),at=u?u.text.indexOf(e.quote):-1;if(!u||at<0)continue;const i=chapters.findIndex(c=>u.start+at>=c.start&&u.start+at<c.end);if(i>=0)used.add(i)}
 const empty=chapters.flatMap((c,i)=>used.has(i)?[]:[c])
 // Only scattered gaps are re-asked (at most a tenth of the chapters): a book where most chapters have no event is a
 // whole-step problem, not a few missed chapters, and asking it all again would double the step.
 if(!empty.length||empty.length*10>chapters.length)return []
 return units.filter(u=>empty.some(c=>u.start<c.end&&u.end>c.start))
}
