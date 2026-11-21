import {createHash} from 'node:crypto'
import {isDeepStrictEqual} from 'node:util'
import {assertSceneRosterAnchor,validateSceneRosterRecords} from '../core/novel-import-scene-identity'
import type {SceneRosterFragmentTable} from '../core/novel-import-scene-roster-fragments'
import {sceneAnchorSchema,type Anchor} from '../shared/novel-import-scene-identity'
import type {ImportUnit} from '../shared/novel-import'

export interface Choice {choiceRef:string;unitId:string;quote?:string;sourceRef?:string;wholeUnit?:boolean;literals:string[];preserved?:boolean}
export interface CompactChoice {choiceRef:string;unitIndex:number;start:number;end:number;sourceRef?:string;wholeUnit?:boolean;literals:string[];preserved?:boolean}
type Fragment={start:number;end:number;ref:string;text:string}
type Stored={anchor:Anchor;unit:ImportUnit;start:number;end:number;sourceRef?:string;literals:string[];preserved:boolean;wholeUnit:boolean;key:string}
function fail():never{throw Error('场景修复引用或完整来源无效，请核对当前已显示选项')}
const digest=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex')
const boundary=(text:string,at:number)=>Number.isSafeInteger(at)&&at>=0&&at<=text.length&&!(at>0&&at<text.length&&(/[\uD800-\uDBFF]/u.test(text[at-1])&&/[\uDC00-\uDFFF]/u.test(text[at])||text[at-1]==='\r'&&text[at]==='\n'))
const positions=(text:string,literal:string)=>{const out:number[]=[];if(literal)for(let at=text.indexOf(literal);at>=0;at=text.indexOf(literal,at+1))out.push(at);return out}

/** A request-local immutable source table. Choices never select a location on
 * the provider's behalf, and cross-unit presence never produces an anchor. */
export function createSceneRosterRepairChoices(input:readonly ImportUnit[],existingTable:SceneRosterFragmentTable){
 const units=structuredClone(input),byId=new Map<string,ImportUnit>(),unitIndexes=new Map<string,number>(),hashes=new Map<string,string>(),fragments=new Map<string,Fragment[]>(),seenFragments=new Set<string>()
 if(existingTable.units.length!==units.length)fail()
 for(const [index,unit]of units.entries()){
  if(byId.has(unit.id)||!unit.text.isWellFormed()||!Number.isSafeInteger(unit.start)||!Number.isSafeInteger(unit.end)||unit.start<0||unit.end-unit.start!==unit.text.length)fail()
  byId.set(unit.id,unit);unitIndexes.set(unit.id,index);hashes.set(unit.id,digest(Buffer.from(unit.text,'utf16le')))
  const visible=existingTable.units[index],{text:_text,...metadata}=unit,{fragments:parts,unitIndex,...shown}=visible
  if(unitIndex!==index||!isDeepStrictEqual(metadata,shown))fail()
  let start=0;const values:Fragment[]=[]
  for(const [at,part]of parts.entries()){
   const end=start+part.text.length
   if(at!==part.index||!part.text.length||seenFragments.has(part.ref)||unit.text.slice(start,end)!==part.text||!boundary(unit.text,start)||!boundary(unit.text,end))fail()
   seenFragments.add(part.ref)
   const anchor=existingTable.resolve(part.ref);if(anchor.unitId!==unit.id||anchor.quote!==part.text)fail()
   values.push({start,end,ref:part.ref,text:part.text});start=end
  }
  if(start!==unit.text.length)fail();fragments.set(unit.id,values)
 }
 const choices=new Map<string,Stored>(),byWindow=new Map<string,string>(),literalCache=new Map<string,string[]>(),presenceCache=new Map<string,boolean>()
 function checked(anchor:Anchor,literal?:string){
  if(!anchor||typeof anchor!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(anchor))||Reflect.ownKeys(anchor).length!==2||!['unitId','quote'].every(key=>Object.hasOwn(anchor,key)&&'value'in Object.getOwnPropertyDescriptor(anchor,key)!))fail()
  if(!sceneAnchorSchema.safeParse(anchor).success)fail()
  const unit=byId.get(anchor.unitId);if(!unit)fail()
  assertSceneRosterAnchor(anchor,[unit])
  if(literal!==undefined)validateSceneRosterRecords([{name:literal,aliases:[],mentions:[{literal,evidence:anchor}],context:[],links:[]}],[unit])
  const start=unit.text.indexOf(anchor.quote);return{unit,start,end:start+anchor.quote.length}
 }
 function addAnchor(anchor:Anchor,literal?:string,preserved=false):string{
  let source:ReturnType<typeof checked>;try{source=checked(anchor,literal)}catch{fail()}
  const {unit,start,end}=source,key=JSON.stringify([unit.id,hashes.get(unit.id),start,end]),prior=byWindow.get(key)
  if(prior){const value=choices.get(prior)!;if(literal!==undefined&&!value.literals.includes(literal))value.literals.push(literal);value.preserved||=preserved;return prior}
  const choiceRef='cf'+digest(JSON.stringify(['scene-roster-repair-choice-v1',unit.id,unit.fileId,unit.start,unit.end,hashes.get(unit.id),start,end])).slice(0,16)
  if(choices.has(choiceRef))fail()
  const sourceRef=fragments.get(unit.id)!.find(f=>f.start===start&&f.end===end)?.ref
  choices.set(choiceRef,{anchor:{unitId:unit.id,quote:anchor.quote},unit,start,end,...(sourceRef?{sourceRef}:{}),literals:literal===undefined?[]:[literal],preserved:!!preserved,wholeUnit:false,key});byWindow.set(key,choiceRef);return choiceRef
 }
 const valid=(unit:ImportUnit,literal:string,start:number,end:number)=>{try{checked({unitId:unit.id,quote:unit.text.slice(start,end)},literal);return true}catch{return false}}
 function forLiteral(literal:string):string[]{
  if(!literal||!literal.isWellFormed())return[]
  const cached=literalCache.get(literal);if(cached)return[...cached]
  const refs:string[]=[]
  for(const unit of units){const hits=positions(unit.text,literal)
   for(const [index,at]of hits.entries()){
    const fragment=fragments.get(unit.id)!.find(f=>f.start<=at&&f.end>=at+literal.length&&valid(unit,literal,f.start,f.end))
    if(fragment){refs.push(addAnchor({unitId:unit.id,quote:fragment.text},literal));continue}
    // The largest interval excluding each adjacent complete occurrence bounds
    // every possible single-literal quote for this actual source position.
    let start=index?hits[index-1]+1:0,end=index+1<hits.length?hits[index+1]+literal.length-1:unit.text.length
    while(start<at&&!boundary(unit.text,start))start++
    while(end>at+literal.length&&!boundary(unit.text,end))end--
    if(start>at||end<at+literal.length||!valid(unit,literal,start,end))continue
    while(start<at){let next=start+1;while(next<at&&!boundary(unit.text,next))next++;if(!valid(unit,literal,next,end))break;start=next}
    while(end>at+literal.length){let next=end-1;while(next>at+literal.length&&!boundary(unit.text,next))next--;if(!valid(unit,literal,start,next))break;end=next}
    refs.push(addAnchor({unitId:unit.id,quote:unit.text.slice(start,end)},literal))
   }
  }
  const result=[...new Set(refs)];literalCache.set(literal,result);return[...result]
 }
 function hasSource(literal:string):boolean{
  if(!literal||!literal.isWellFormed())return false
  if(presenceCache.has(literal))return presenceCache.get(literal)!
  if(units.some(u=>u.text.includes(literal))){presenceCache.set(literal,true);return true}
  // Match only real same-file adjacency. State stores a prefix of the claim,
  // never a fabricated merged unit; each nonempty step consumes source text.
  const starts=new Map<string,ImportUnit[]>(),queue:{fileId:string;end:number;matched:number}[]=[],seen=new Set<string>()
  for(const u of units)if(u.text){const key=JSON.stringify([u.fileId,u.start]);starts.set(key,[...starts.get(key)??[],u]);for(let n=1;n<literal.length&&n<=u.text.length;n++)if(u.text.endsWith(literal.slice(0,n)))queue.push({fileId:u.fileId,end:u.end,matched:n})}
  for(let index=0;index<queue.length;index++){
   const state=queue[index],key=JSON.stringify([state.fileId,state.end,state.matched]);if(seen.has(key))continue;seen.add(key)
   for(const u of starts.get(JSON.stringify([state.fileId,state.end]))??[]){const size=Math.min(literal.length-state.matched,u.text.length);if(u.text.slice(0,size)!==literal.slice(state.matched,state.matched+size))continue;if(state.matched+size===literal.length){presenceCache.set(literal,true);return true}queue.push({fileId:u.fileId,end:u.end,matched:state.matched+size})}
  }
  presenceCache.set(literal,false);return false
 }
 function wholeUnits():string[]{const refs:string[]=[];for(const unit of units){if(!unit.text.trim())continue;const ref=addAnchor({unitId:unit.id,quote:unit.text});choices.get(ref)!.wholeUnit=true;refs.push(ref)}return refs}
 function entries():readonly Choice[]{return Object.freeze([...choices].map(([choiceRef,v])=>Object.freeze({choiceRef,unitId:v.unit.id,...(v.sourceRef?{sourceRef:v.sourceRef}:!v.wholeUnit?{quote:v.anchor.quote}:{}),...(v.wholeUnit?{wholeUnit:true}:{}),literals:Object.freeze([...v.literals]) as unknown as string[],...(v.preserved?{preserved:true}:{})})))}
 function compactEntries():readonly CompactChoice[]{return Object.freeze([...choices].map(([choiceRef,v])=>Object.freeze({choiceRef,unitIndex:unitIndexes.get(v.unit.id)!,start:v.start,end:v.end,...(v.sourceRef?{sourceRef:v.sourceRef}:{}),...(v.wholeUnit?{wholeUnit:true}:{}),literals:Object.freeze([...v.literals]) as unknown as string[],...(v.preserved?{preserved:true}:{})})))}
 function resolve(ref:string,use:'mention'|'context'|'link',literal?:string):Anchor{if(!['mention','context','link'].includes(use))fail();const value=choices.get(ref);if(!value||use==='mention'&&literal===undefined)fail();try{checked(value.anchor,use==='mention'?literal:undefined)}catch{fail()}return{...value.anchor}}
 return Object.freeze({forLiteral,addAnchor,wholeUnits,entries,compactEntries,resolve,hasSource})
}
