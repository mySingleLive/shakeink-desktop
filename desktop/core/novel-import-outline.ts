import {importNativeMappings} from './novel-import-semantic-state'
import {qualifyImportKnowledgeText} from './novel-import-semantics'
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
function text(a:ImportArtifact,mapping:ReturnType<typeof importNativeMappings>){return a.origin==='source'?a.text:qualifyImportKnowledgeText(a.text,mapping.decoded.get(a.id)!.knowledge)}
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
 const mapped=validateDetailedOutlineAssignments(s,true),mapping=importNativeMappings(s.artifacts),ids=s.detailedOutlineIds
 if(!ids||Object.keys(ids).length!==s.chapters.length)throw Error('章级细纲映射不完整或含陈旧归属')
 for(const [index,chapter]of s.chapters.entries()){
  const a=mapped.get(index)
  if(!a||!mapping.projectable.has(a.id)||ids[index]!==a.id)throw Error('章级细纲与最终原生映射不一致')
  if(chapter.outline!==text(a,mapping))throw Error('章级细纲与最终复核结果不一致')
 }
}
