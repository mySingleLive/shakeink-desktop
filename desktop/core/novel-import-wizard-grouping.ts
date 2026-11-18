import type {ImportArtifact} from '../shared/novel-import'
import {validateImportSemanticArtifact,type ImportSemanticLock} from './novel-import-semantics'
import {importHash} from './novel-import'
import {WORLD_TIMELINE_LINE_ID,type WorldTimelineState} from './novel-import-wizard-timeline'
import {WORLDLINE_CATEGORY_VALUES,worldlineGradeFromFacts} from './novel-import-worldline-facts'

/** docs/587 §1: one row per inferred main-line event with a placed time, in story-time order. */
export interface WorldGroupingEntry {id:string;name:string;text:string;time?:string;category:string;importance:number}
export interface WorldGroupingGroup {name:string;summary:string;category:string;importance:number;members:string[]}
export interface WorldGroupingReply {groups:WorldGroupingGroup[];grades:[string,string,number][]}
export interface WorldGroupingState {groups:number;parents:string[];graded:number;dropped:number}
export const WORLD_GROUPING_PEOPLE_LIMIT=100,WORLD_GROUPING_EVIDENCE=8
const ROW_NAME=80,ROW_TEXT=60,ROW_TIME=40,GROUP_NAME=30,GROUP_SUMMARY=200

const cut=(text:string|undefined,n:number)=>{if(!text)return '';const chars=[...text.trim()];return chars.length<=n?chars.join(''):chars.slice(0,n).join('')}
/** Model text as plain one-line text: lone surrogates become U+FFFD, control characters become spaces (docs/587 code review M2). */
const clean=(v:unknown)=>typeof v==='string'?v.toWellFormed().replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/gu,' ').replace(/\s+/gu,' ').trim():''
const grouped=(a:ImportArtifact)=>a.kind==='worldline'&&a.origin==='inferred'&&a.facts.lineId===WORLD_TIMELINE_LINE_ID&&a.facts.timeKind==='exact'&&Number.isFinite(Number(a.facts.timeValue))

export function worldGroupingCatalog(artifacts:ImportArtifact[]):WorldGroupingEntry[]{
 return artifacts.map((a,k)=>({a,k})).filter(({a})=>grouped(a)).sort((x,y)=>Number(x.a.facts.timeValue)-Number(y.a.facts.timeValue)||x.k-y.k).map(({a})=>{
  const g=worldlineGradeFromFacts(a.facts)
  return {id:a.id,name:a.name,text:a.text,...(a.facts.time?.trim()?{time:a.facts.time}:{}),category:g.category,importance:g.importance}
 })
}
/** Compact rows [key,name,summary,time,category,importance] with short keys e1..en. */
export function worldGroupingRequestRows(segment:WorldGroupingEntry[]):string{
 return JSON.stringify(segment.map((e,k)=>['e'+(k+1),cut(e.name,ROW_NAME),cut(e.text,ROW_TEXT),cut(e.time,ROW_TIME),e.category,e.importance]))
}
export const worldGroupingRowSize=(segment:WorldGroupingEntry[])=>worldGroupingRequestRows(segment).length

const validCategory=(v:unknown):v is string=>typeof v==='string'&&WORLDLINE_CATEGORY_VALUES.includes(v.trim())
const validImportance=(v:unknown):v is number=>v===1||v===2||v===3||v==='1'||v==='2'||v==='3'

/** docs/587 §3: applies every segment's reply. Throws when a segment has no valid group and no valid grade. */
export function applyWorldGrouping(artifacts:ImportArtifact[],segments:{catalog:WorldGroupingEntry[];reply:WorldGroupingReply}[],locks:ImportSemanticLock[],timeline:WorldTimelineState|null):{artifacts:ImportArtifact[];timeline:WorldTimelineState|null;state:WorldGroupingState}{
 const locked=(id:string,field:string)=>locks.some(l=>l.artifactId===id&&l.field===field)
 const byId=new Map(artifacts.map(a=>[a.id,{...a,facts:{...a.facts}}]))
 const parentsOf=new Set(artifacts.filter(a=>a.kind==='worldline'&&a.facts.parentId).map(a=>a.facts.parentId!))
 const held=new Set(artifacts.map(a=>a.id)),taken=new Set<string>()
 const parents:ImportArtifact[]=[],before=new Map<string,ImportArtifact[]>()
 let dropped=0,graded=0
 for(const {catalog,reply} of segments){
  const keyed=new Map(catalog.map((e,k)=>['e'+(k+1),e.id]))
  let validGroups=0,validGrades=0
  // Grades first, so a parent's importance sees its members' final values.
  const seenGrade=new Set<string>()
  for(const entry of reply.grades??[]){
   const [key,category,importance]=Array.isArray(entry)?entry:[]
   const id=typeof key==='string'?keyed.get(key):undefined
   if(!id||seenGrade.has(id)||!validCategory(category)||!validImportance(importance)){dropped++;continue}
   seenGrade.add(id);validGrades++
   const a=byId.get(id)!,now=worldlineGradeFromFacts(a.facts),c=category.trim(),i=Number(importance)
   if(!locked(id,'category')&&c!==now.category){a.facts.category=c}
   if(!locked(id,'importance')&&i!==now.importance){a.facts.importance=String(i)}
   graded++
  }
  for(const group of reply.groups??[]){
   const name=cut(clean(group?.name),GROUP_NAME)
   const raw=Array.isArray(group?.members)?group.members:[]
   const members:string[]=[]
   // Unknown, repeated, taken, locked or already-linked members are skipped and counted (docs/587 §3.1).
   for(const key of raw){const id=typeof key==='string'?keyed.get(key):undefined;if(!id||members.includes(id)){dropped++;continue}
    const a=byId.get(id)!;if(taken.has(id)||locked(id,'parentId')||a.facts.parentId||parentsOf.has(id)){dropped++;continue}members.push(id)}
   if(!name||members.length<2||members.some(id=>byId.get(id)!.name.trim()===name)||!validCategory(group.category)||!validImportance(group.importance)){dropped++;continue}
   const list=members.map(id=>byId.get(id)!).sort((x,y)=>Number(x.facts.timeValue)-Number(y.facts.timeValue))
   let id='',n=0;do{id='wl-'+importHash(n?['grouping',members,n]:['grouping',members]).slice(0,16);n++}while(held.has(id));held.add(id)
   const count=new Map<string,number>()
   for(const m of list){try{const p:unknown=JSON.parse(m.facts.people??'[]');if(Array.isArray(p))for(const x of new Set(p))if(typeof x==='string')count.set(x,(count.get(x)??0)+1)}catch{/* member people are checked by the strict schema */}}
   const people=[...count.entries()].map(([p,c],k)=>({p,c,k})).sort((a,b)=>b.c-a.c||a.k-b.k).slice(0,WORLD_GROUPING_PEOPLE_LIMIT).map(x=>x.p)
   const evidence=list.flatMap(m=>m.evidence.slice(0,1)).slice(0,WORLD_GROUPING_EVIDENCE)
   const top=Math.max(Number(group.importance),...list.map(m=>worldlineGradeFromFacts(m.facts).importance))
   const first=list[0]
   const parent:ImportArtifact={id,kind:'worldline',name,text:cut(clean(group.summary),GROUP_SUMMARY)||name,
    facts:{lineId:first.facts.lineId,lineName:first.facts.lineName,timeKind:'exact',timeValue:first.facts.timeValue,...(first.facts.time?{time:first.facts.time}:{}),people:JSON.stringify(people),reliability:'客观事实',category:group.category.trim(),importance:String(top)},
    evidence,sourceUnitIds:[...new Set(evidence.map(e=>e.unitId))],origin:'inferred'}
   // The made parent is checked like any batch result before it is kept (docs/587 code review M2).
   try{validateImportSemanticArtifact(parent,'strict')}catch{dropped++;held.delete(id);continue}
   validGroups++
   for(const m of list){m.facts.parentId=id;taken.add(m.id)}
   parents.push(parent)
   // The parent goes before its first member in reading order of the list (the earliest-listed member).
   const anchor=artifacts.find(a=>members.includes(a.id))!.id;(before.get(anchor)??before.set(anchor,[]).get(anchor)!).push(parent)
  }
  if(!validGroups&&!validGrades)throw Error('模型未返回可用的世界线归组或分级')
 }
 const out:ImportArtifact[]=[];for(const a of artifacts){out.push(...before.get(a.id)??[]);out.push(byId.get(a.id)!)}
 let next=timeline
 if(timeline?.calendar==='gregorian'&&parents.length){const precisions={...timeline.precisions};for(const p of parents){const first=out.filter(a=>a.facts.parentId===p.id).sort((x,y)=>Number(x.facts.timeValue)-Number(y.facts.timeValue))[0];precisions[p.id]=timeline.precisions[first.id]??'day'}next={...timeline,precisions}}
 return {artifacts:out,timeline:next,state:{groups:parents.length,parents:parents.map(p=>p.id),graded,dropped}}
}

/** docs/587 §5 (step 21): a made parent left without children is removed (it only summarises them), then every event whose
 * parent is gone becomes independent. Notes name what changed; the grouping state and precisions drop removed ids. */
export function pruneWorldlineParents(artifacts:ImportArtifact[],grouped:WorldGroupingState|undefined,timeline:WorldTimelineState|undefined):{artifacts:ImportArtifact[];removed:string[];notes:{label:string;reason:string}[];grouped?:WorldGroupingState;timeline?:WorldTimelineState}{
 const notes:{label:string;reason:string}[]=[],events=new Set(artifacts.filter(a=>a.kind==='worldline').map(a=>a.id))
 const removed=(grouped?.parents??[]).filter(id=>events.has(id)&&!artifacts.some(a=>a.kind==='worldline'&&a.facts.parentId===id))
 const gone=new Set(removed)
 for(const a of artifacts)if(gone.has(a.id))notes.push({label:a.name,reason:'子事件均未保存，已去掉这个父事件'})
 const kept=artifacts.filter(a=>!gone.has(a.id)).map(a=>{
  if(a.kind!=='worldline'||!a.facts.parentId||events.has(a.facts.parentId)&&!gone.has(a.facts.parentId))return a
  notes.push({label:a.name,reason:'父事件不存在，已改为独立事件'});const {parentId:_p,...facts}=a.facts;return {...a,facts}
 })
 let nextTimeline:WorldTimelineState|undefined
 if(gone.size&&timeline?.calendar==='gregorian'){const precisions={...timeline.precisions};for(const id of gone)delete precisions[id];nextTimeline={...timeline,precisions}}
 return {artifacts:kept,removed,notes,...(grouped?{grouped:{...grouped,parents:grouped.parents.filter(id=>!gone.has(id))}}:{}),...(nextTimeline?{timeline:nextTimeline}:{})}
}

/** docs/587 code review M1: runs every job; returns only after all have settled, then throws the first stop (AbortError)
 * or else the first failure. No job is left running when this returns or throws. */
export async function settleEvery<T,R>(items:T[],run:(item:T,index:number)=>Promise<R>):Promise<R[]>{
 const settled=await Promise.allSettled(items.map((item,index)=>run(item,index)))
 const failed=settled.flatMap(r=>r.status==='rejected'?[r.reason as unknown]:[])
 if(failed.length)throw failed.find(e=>e instanceof DOMException&&e.name==='AbortError')??failed[0]
 return settled.map(r=>(r as PromiseFulfilledResult<R>).value)
}

/* ---------------- docs/587 §6: publish ranges ---------------- */
const f64=new Float64Array(1),i64=new BigInt64Array(f64.buffer)
/** The next double above a finite non-negative value. */
export function nextUp(v:number):number{if(v===0)return Number.MIN_VALUE;f64[0]=v;i64[0]+=1n;return f64[0]}

export interface FamilyEvent {id:string;parentId?:string;timeKind:string;timeValue:number;timeEnd?:number}
/** docs/587 §6: bottom-up publish range of every exact event with exact or window children. A family that fits the
 * HEAD rule (start not moved, end within a day) keeps duration 0, so a window ancestor's fixed end is never passed. */
export function worldlineFamilyRanges(events:FamilyEvent[]):Map<string,{value:number;duration:number}>{
 const byId=new Map(events.map(e=>[e.id,e])),kids=new Map<string,FamilyEvent[]>()
 for(const e of events)if(e.parentId&&byId.has(e.parentId)&&(e.timeKind==='exact'||e.timeKind==='window'))(kids.get(e.parentId)??kids.set(e.parentId,[]).get(e.parentId)!).push(e)
 const out=new Map<string,{value:number;duration:number}>(),visiting=new Set<string>()
 const span=(e:FamilyEvent):[number,number]=>{
  if(e.timeKind==='window')return [e.timeValue,e.timeEnd??e.timeValue]
  // A duration-0 family still holds descendants up to its subtree end (within a day), which every ancestor must cover.
  const r=range(e);return r?[r.value,Math.max(r.value+r.duration,ends.get(e.id)!)]:[e.timeValue,e.timeValue]
 }
 const ends=new Map<string,number>()
 const range=(e:FamilyEvent):{value:number;duration:number}|undefined=>{
  if(out.has(e.id))return out.get(e.id)
  if(e.timeKind!=='exact'||!kids.has(e.id)||visiting.has(e.id))return undefined
  visiting.add(e.id)
  let lo=e.timeValue,hi=e.timeValue
  for(const k of kids.get(e.id)!){const [a,b]=span(k);if(a<lo)lo=a;if(b>hi)hi=b}
  visiting.delete(e.id)
  let r:{value:number;duration:number}
  if(lo===e.timeValue&&hi<=lo+24)r={value:lo,duration:0}
  else{let d=hi-lo;while(lo+d<hi)d=nextUp(d);r={value:lo,duration:d}}
  out.set(e.id,r);ends.set(e.id,hi);return r
 }
 for(const e of events)range(e)
 return out
}
