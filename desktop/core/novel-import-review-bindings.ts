import type {ImportArtifact,ImportAiRequest} from '../shared/novel-import'
import {sceneReviewUnitReferenceRequest} from '../shared/novel-import-scene-review'
import {assertImportReviewProjection,importFactFields,type ImportReviewProjection} from './novel-import-semantics'

export interface ImportReviewArtifactBinding {readonly artifactIndex:number;readonly artifactId:string;readonly bindableFields:readonly string[];readonly values:ReadonlyMap<string,string>}
export interface ImportReviewArtifactBindings {readonly entries:readonly ImportReviewArtifactBinding[];readonly byId:ReadonlyMap<string,ReadonlyMap<string,string>>}
type Request=Pick<ImportAiRequest,'semanticVersion'|'phase'|'selectedTargets'|'conflict'|'intent'|'artifacts'|'reviewProjection'>
const invalid=():never=>{throw Error('场景复核资料与完整投影版本不一致，请核对资料后重试')}

/** Values come only from the immutable packet supplied by the controller.
 * Metadata advertises names; complete values are never duplicated in payload. */
export function sceneReviewArtifactBindings(request:Request):ImportReviewArtifactBindings|undefined{
 if(!sceneReviewUnitReferenceRequest(request))return undefined
 const artifacts=request.artifacts.map(a=>({...a,facts:{...a.facts}})),projection=request.reviewProjection?.map(p=>({...p,fields:[...p.fields],fullFactKeys:[...p.fullFactKeys],...(p.textRange?{textRange:{...p.textRange}}:{})}))
 if(projection)assertImportReviewProjection(artifacts,projection)
 type Entry={artifactIndex:number;artifactId:string;bindableFields:string[];values:Map<string,string>;a:ImportArtifact;p?:ImportReviewProjection}
 const entries:Entry[]=artifacts.map((a,artifactIndex)=>({artifactIndex,artifactId:a.id,bindableFields:[],values:new Map(),a,p:projection?.[artifactIndex]})),groups=new Map<string,Entry[]>(),byId=new Map<string,Map<string,string>>()
 for(const entry of entries){const group=groups.get(entry.artifactId)??[];group.push(entry);groups.set(entry.artifactId,group)}
 for(const [id,group]of groups){
  const first=group[0],all=new Map<string,string>(),fullFacts=new Map<string,string>()
  for(const entry of group){
   if(['id','kind','name','schema','origin'].some(key=>entry.a[key as keyof ImportArtifact]!==first.a[key as keyof ImportArtifact]))invalid()
   if(entry.p&&first.p&&(entry.p.semanticHash!==first.p.semanticHash||entry.p.fullTextLength!==first.p.fullTextLength||JSON.stringify(entry.p.fullFactKeys)!==JSON.stringify(first.p.fullFactKeys)))invalid()
   for(const [field,value]of Object.entries(entry.a.facts)){
    if(typeof value!=='string'||fullFacts.has(field)&&fullFacts.get(field)!==value)invalid()
    fullFacts.set(field,value)
    if(entry.p?.fields.includes(field)&&entry.p.fullFactKeys.includes(field)&&importFactFields(entry.a.kind,entry.a.schema).includes(field)){entry.values.set(field,value);all.set(field,value)}
   }
  }
  const ranges=group.flatMap(entry=>entry.p?.textRange?[{...entry.p.textRange,text:entry.a.text}]:[]).sort((a,b)=>a.start-b.start||a.end-b.end),segments:{start:number;end:number;text:string}[]=[]
  for(const range of ranges){const last=segments.at(-1)
   if(!last||range.start>last.end){segments.push({...range});continue}
   const overlap=Math.min(last.end,range.end)-range.start
   if(last.text.slice(range.start-last.start,range.start-last.start+overlap)!==range.text.slice(0,overlap))invalid()
   if(range.end>last.end){last.text+=range.text.slice(overlap);last.end=range.end}
  }
  if(first.p&&segments.length===1&&segments[0].start===0&&segments[0].end===first.p.fullTextLength){const text=segments[0].text;all.set('text',text);for(const entry of group)entry.values.set('text',text)}
  for(const entry of group)entry.bindableFields=[...(entry.values.has('text')?['text']:[]),...Object.keys(entry.a.facts).filter(field=>entry.values.has(field))]
  byId.set(id,all)
 }
 return{entries:entries.map(({artifactIndex,artifactId,bindableFields,values})=>({artifactIndex,artifactId,bindableFields,values})),byId}
}
