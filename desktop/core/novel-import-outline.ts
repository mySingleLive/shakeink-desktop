import {importNativeMappings} from './novel-import-semantic-state'
import {stripImportKnowledgeAnnotations} from './novel-import-semantics'
import type {ImportArtifact,ImportSession} from '../shared/novel-import'

function assignments(s:ImportSession){
 const result=new Map<number,ImportArtifact>(),ids=new Map<string,number>()
 for(const a of s.artifacts.filter(a=>a.kind==='outline'&&a.facts.chapterIndex!==undefined)){
  const raw=a.facts.chapterIndex,index=Number(raw)
  if(!/^(?:0|[1-9]\d*)$/u.test(raw)||!Number.isSafeInteger(index)||index<0||index>=s.chapters.length)throw Error('细纲chapterIndex超出当前章节快照')
  if(result.has(index)||ids.has(a.id))throw Error('细纲chapterIndex或实体ID重复归属')
  if(!a.text.trim())throw Error('章级细纲不能为空或只含空白')
  result.set(index,a);ids.set(a.id,index)
 }
 return result
}
// docs/542: the chapter outline is the artifact text as is; knowledge stays in facts.
function text(a:ImportArtifact,_mapping:ReturnType<typeof importNativeMappings>){return a.text}
/** A session saved before docs/542 may hold the old annotated projection; it still validates and is cleaned on publish. */
function sameOutline(outline:string|undefined,a:ImportArtifact,mapping:ReturnType<typeof importNativeMappings>){const value=text(a,mapping);return outline===value||a.origin!=='source'&&!!outline&&outline!==value&&stripImportKnowledgeAnnotations(outline)===value}
export function validateDetailedOutlineAssignments(s:ImportSession,requireComplete=false){
 const mapped=assignments(s)
 if(requireComplete&&s.infer&&s.selected.includes('body')&&s.targets.includes('outline')){const missing=s.chapters.flatMap((_,index)=>!mapped.has(index)?[index]:[]);if(missing.length)throw Error('仍有章节缺少细纲：'+missing.join(','))}
 return mapped
}
export function projectDetailedOutlines(s:ImportSession){
 const mapped=validateDetailedOutlineAssignments(s),mapping=importNativeMappings(s.artifacts),chapters=structuredClone(s.chapters),detailedOutlineIds:Record<number,string>={}
 for(const [index,a]of mapped){
  if(!mapping.projectable.has(a.id))throw Error('章级细纲未通过原生映射')
  const chapter=chapters[index],previous=s.detailedOutlineIds?.[index]
  if(previous&&previous!==a.id)throw Error('细纲归属在复核中发生变化')
  const value=text(a,mapping)
  if(chapter.outline&&chapter.outline!==value&&previous!==a.id)continue
  chapter.outline=value;detailedOutlineIds[index]=a.id
 }
 const candidate={...s,chapters,detailedOutlineIds};validateDetailedOutlines(candidate)
 s.chapters=chapters;s.detailedOutlineIds=detailedOutlineIds
}
export function validateDetailedOutlines(s:ImportSession){
 if(!s.infer||!s.selected.includes('body')||!s.targets.includes('outline'))return
 // docs/539 §2.4: a wizard session may save chapters that have no chapter outline; they stay empty and unmapped.
 const partial=s.wizardVersion===1,mapped=validateDetailedOutlineAssignments(s,!partial),mapping=importNativeMappings(s.artifacts),ids=s.detailedOutlineIds
 if(!ids||Object.keys(ids).length!==(partial?mapped.size:s.chapters.length))throw Error('章级细纲映射不完整或含陈旧归属')
 for(const [index,chapter]of s.chapters.entries()){
  const a=mapped.get(index)
  if(partial&&!a){if(chapter.outline||ids[index]!==undefined)throw Error('章级细纲映射不完整或含陈旧归属');continue}
  if(!a||!mapping.projectable.has(a.id)||ids[index]!==a.id)throw Error('章级细纲与最终原生映射不一致')
  if(!sameOutline(chapter.outline,a,mapping))throw Error('章级细纲与最终复核结果不一致')
 }
}
