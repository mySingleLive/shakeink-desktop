import {createHash} from 'node:crypto'
import type {ImportAiRequest,ImportUnit} from '../shared/novel-import'
import type {Anchor} from '../shared/novel-import-scene-identity'

export interface SceneRosterFragment {index:number;text:string}
export interface SceneRosterReferencedFragment extends SceneRosterFragment {ref:string}
export type SceneRosterFragmentUnit=Omit<ImportUnit,'text'>&{unitIndex:number;fragments:SceneRosterReferencedFragment[]}
export interface SceneRosterFragmentTable {readonly units:readonly SceneRosterFragmentUnit[];resolve:(ref:string)=>Anchor}
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
const digest=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex')
/** Serialization builds a directory, not a resolver. Each unit's complete
 * text hash is computed once per table; no ID- or packet-based cache exists. */
// Refs depend only on unit identity, range and full text, so each unit's directory is memoized.
const fragmentMemo=new Map<string,readonly (SceneRosterFragment&{ref:string})[]>()
function unitFragments(unit:ImportUnit){
 const key=JSON.stringify([unit.id,unit.fileId,unit.start,unit.end,unit.text]),cached=fragmentMemo.get(key);if(cached)return cached
 const textHash=digest(Buffer.from(unit.text,'utf16le'));let start=0
 const fragments=freeze(sceneRosterFragments(unit.text).map(fragment=>{const end=start+fragment.text.length,ref='ef'+digest(JSON.stringify(['scene-roster-fragment-ref-v1',unit.id,unit.fileId,unit.start,unit.end,textHash,start,end])).slice(0,16);start=end;return{...fragment,ref}}))
 if(fragmentMemo.size>=20000)fragmentMemo.delete(fragmentMemo.keys().next().value!)
 fragmentMemo.set(key,fragments);return fragments
}
export function sceneRosterFragmentUnits(units:readonly ImportUnit[]):readonly SceneRosterFragmentUnit[]{
 const refs=new Set<string>()
 return freeze(units.map((unit,unitIndex)=>{
  const {text:_text,...metadata}=structuredClone(unit),fragments=unitFragments(unit)
  for(const fragment of fragments){if(refs.has(fragment.ref))throw Error('场景片段引用重复，请核对当前来源');refs.add(fragment.ref)}
  return{...metadata,unitIndex,fragments:fragments.map(fragment=>({...fragment}))}
 }))
}
/** The only resolver map is private to this captured directory. Returned
 * anchors are fresh copies; neither callers nor model data can alter it. */
export function createSceneRosterFragmentTable(units:readonly ImportUnit[]):SceneRosterFragmentTable{
 const directory=sceneRosterFragmentUnits(units),anchors=new Map<string,Readonly<Anchor>>()
 for(const unit of directory)for(const fragment of unit.fragments)anchors.set(fragment.ref,Object.freeze({unitId:unit.id,quote:fragment.text}))
 return Object.freeze({units:directory,resolve(ref:string){const anchor=typeof ref==='string'?anchors.get(ref):undefined;if(!anchor)throw Error('场景片段ref无效，请逐字使用当前目录已显示的ref');return{...anchor}}})
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
