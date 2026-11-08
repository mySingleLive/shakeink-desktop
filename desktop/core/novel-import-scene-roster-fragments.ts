import {createHash} from 'node:crypto'
import type {ImportAiRequest,ImportUnit} from '../shared/novel-import'
import type {Anchor} from '../shared/novel-import-scene-identity'

export interface SceneRosterFragment {index:number;text:string}
export interface SceneRosterReferencedFragment extends SceneRosterFragment {ref:string}
export type SceneRosterFragmentUnit=Omit<ImportUnit,'text'>&{unitIndex:number;fragments:SceneRosterReferencedFragment[]}
export interface SceneRosterFragmentTable {readonly units:readonly SceneRosterFragmentUnit[];readonly width?:SceneFragmentRefWidth;resolve:(ref:string)=>Anchor}
/** docs/528: request-level compact ref layout; absent means the original 16-character v1 refs. */
export type SceneFragmentRefWidth=12|16
export const SCENE_FRAGMENT_COMPACT_REFS=Object.freeze({version:1 as const,width:12 as const})
export type SceneFragmentRefs=typeof SCENE_FRAGMENT_COMPACT_REFS
export interface SceneRosterFragmentReference {unitIndex:number;fromFragment:number;toFragment:number}
export function sceneRosterFragmentRequest(request:Pick<ImportAiRequest,'semanticVersion'|'phase'|'intent'|'kind'|'sceneIdentity'>):boolean{return request.semanticVersion===1&&request.phase==='analyze'&&request.intent==='roster'&&request.kind==='scene'&&request.sceneIdentity?.version===1&&request.sceneIdentity.mode==='roster'}
/** Each boundary belongs to the preceding fragment. Nothing, including a
 * trailing whitespace-only fragment or a CRLF, is trimmed or reconstructed. */
export function sceneRosterFragments(text:string):SceneRosterFragment[]{
 const fragments:SceneRosterFragment[]=[];let start=0
 for(let at=0;at<text.length;){
  const code=text.codePointAt(at)!,character=String.fromCodePoint(code)
  at+=character.length
  if(character==='\r'&&text[at]==='\n')at++
  if(character==='\r'||character==='\n'||/[。！？!?；;，,、：:.]/u.test(character)){fragments.push({index:fragments.length,text:text.slice(start,at)});start=at}
 }
 if(start<text.length)fragments.push({index:fragments.length,text:text.slice(start)})
 return fragments
}
function freeze<T>(value:T,seen=new WeakSet<object>()):T{if(value&&typeof value==='object'&&!seen.has(value)){seen.add(value);for(const child of Object.values(value))freeze(child,seen);Object.freeze(value)}return value}
let digestOverride:((value:string)=>string|undefined)|undefined
const digest=(value:string|Buffer)=>(typeof value==='string'?digestOverride?.(value):undefined)??createHash('sha256').update(value).digest('hex')
/** Test-only: replaces ref digests inside `body` to force collisions (docs/529 SC-06). */
export function withSceneFragmentDigestForTest<T>(override:(value:string)=>string|undefined,body:()=>T):T{
 if(!process.env.NODE_TEST_CONTEXT)throw Error('仅限测试')
 const previous=digestOverride;digestOverride=override;fragmentMemo.clear();widthMemo.clear()
 try{return body()}finally{digestOverride=previous;fragmentMemo.clear();widthMemo.clear()}
}
/** Serialization builds a directory, not a resolver. Each unit's complete
 * text hash is computed once per table; no ID- or packet-based cache exists. */
// Refs depend only on unit identity, range and full text, so each unit's directory is memoized.
const fragmentMemo=new Map<string,readonly (SceneRosterFragment&{ref:string})[]>()
function unitFragments(unit:ImportUnit,width:SceneFragmentRefWidth=16){
 const key=JSON.stringify([width,unit.id,unit.fileId,unit.start,unit.end,unit.text]),cached=fragmentMemo.get(key);if(cached)return cached
 // v2 uses its own domain label so a short ref is never a prefix of a v1 ref (docs/528 review 12).
 const textHash=digest(Buffer.from(unit.text,'utf16le')),domain=width===12?'scene-roster-fragment-ref-v2':'scene-roster-fragment-ref-v1';let start=0
 const fragments=freeze(sceneRosterFragments(unit.text).map(fragment=>{const end=start+fragment.text.length,ref='ef'+digest(JSON.stringify([domain,unit.id,unit.fileId,unit.start,unit.end,textHash,start,end])).slice(0,width);start=end;return{...fragment,ref}}))
 if(fragmentMemo.size>=40000)fragmentMemo.delete(fragmentMemo.keys().next().value!)
 fragmentMemo.set(key,fragments);return fragments
}
function directory(units:readonly ImportUnit[],width:SceneFragmentRefWidth):readonly SceneRosterFragmentUnit[]|undefined{
 const refs=new Set<string>()
 const result:SceneRosterFragmentUnit[]=[]
 for(const [unitIndex,unit] of units.entries()){
  const {text:_text,...metadata}=structuredClone(unit),fragments=unitFragments(unit,width)
  for(const fragment of fragments){if(refs.has(fragment.ref))return undefined;refs.add(fragment.ref)}
  result.push({...metadata,unitIndex,fragments:fragments.map(fragment=>({...fragment}))})
 }
 return freeze(result)
}
const widthMemo=new Map<string,SceneFragmentRefWidth>()
/** The packet's actual ref width: 12 for a compact request unless any two 12-character refs collide,
 * in which case the whole packet uses v1. A v1 collision still throws (docs/528 修订1). */
export function sceneRosterFragmentWidth(request:{units:readonly ImportUnit[];sceneFragmentRefs?:unknown}):SceneFragmentRefWidth{
 if(request.sceneFragmentRefs===undefined)return 16
 const key=digest(JSON.stringify(request.units.map(u=>[u.id,u.fileId,u.start,u.end,u.text])))
 let width=widthMemo.get(key);if(width)return width
 width=directory(request.units,12)?12:16
 if(width===16&&!directory(request.units,16))throw Error('场景片段引用重复，请核对当前来源')
 if(widthMemo.size>=2000)widthMemo.delete(widthMemo.keys().next().value!)
 widthMemo.set(key,width);return width
}
export function sceneRosterFragmentUnits(units:readonly ImportUnit[],width:SceneFragmentRefWidth=16):readonly SceneRosterFragmentUnit[]{
 const result=directory(units,width);if(!result)throw Error('场景片段引用重复，请核对当前来源');return result
}
/** The only resolver map is private to this captured directory. Returned
 * anchors are fresh copies; neither callers nor model data can alter it. */
export function createSceneRosterFragmentTable(units:readonly ImportUnit[],width:SceneFragmentRefWidth=16):SceneRosterFragmentTable{
 const table=sceneRosterFragmentUnits(units,width),anchors=new Map<string,Readonly<Anchor>>()
 for(const unit of table)for(const fragment of unit.fragments)anchors.set(fragment.ref,Object.freeze({unitId:unit.id,quote:fragment.text}))
 return Object.freeze({units:table,width,resolve(ref:string){const anchor=typeof ref==='string'?anchors.get(ref):undefined;if(!anchor)throw Error('场景片段ref无效，请逐字使用当前目录已显示的ref');return{...anchor}}})
}
export function restoreSceneRosterFragmentAnchor(reference:SceneRosterFragmentReference,units:readonly ImportUnit[]):Anchor{
 const fail=():never=>{throw Error('场景片段索引无效，请选择本包已显示的连续片段')}
 if(!reference||typeof reference!=='object'||Array.isArray(reference)||Reflect.ownKeys(reference).length!==3||!['unitIndex','fromFragment','toFragment'].every(key=>Object.hasOwn(reference,key)))fail()
 const {unitIndex,fromFragment,toFragment}=reference
 if(![unitIndex,fromFragment,toFragment].every(value=>Number.isSafeInteger(value)&&value>=0)||unitIndex>=units.length||fromFragment>=toFragment)fail()
 const unit=units[unitIndex],fragments=sceneRosterFragments(unit.text)
 if(toFragment>fragments.length)fail()
 return{unitId:unit.id,quote:fragments.slice(fromFragment,toFragment).map(fragment=>fragment.text).join('')}
}
