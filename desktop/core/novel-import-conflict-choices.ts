import {IMPORT_LABELS,type ImportArtifact,type ImportConflict,type ImportConflictDetail,type ImportConflictChoice,type ImportSession} from '../shared/novel-import'
import {importFieldLabel} from '../shared/novel-import-field-labels'
import {importFactFields,stripImportKnowledgeAnnotations,validateImportSemanticArtifact} from './novel-import-semantics'
import {importNativeMappings} from './novel-import-semantic-state'
import {selectedImportUnits,workingImportUnits} from './novel-import'
import {projectDetailedOutlines,validateDetailedOutlines} from './novel-import-outline'

/** docs/557: wizard step-21 conflicts. Pure helpers shared by the controller (decisions) and the public view (details). */
export const WIZARD_REVIEW_TEXT=2000,WIZARD_REVIEW_FACT=1500
/** docs/541-2: identity, ownership, ordering and link fields are never rewritten by an automatic repair. */
export const WIZARD_REVIEW_STRUCTURAL:ReadonlySet<string>=new Set(['entityType','settingType','worldId','parentId','chapterIndex','order','refs','people','narrator','touches','status','relationships','characterId','sceneId','itemId','eventId','lineId','tropeKind','content','aliases','roleType','reliability','attribution','temporalScope'])
const REFERENCE_FIELDS=new Set(['parentId','sceneId','characterId','itemId','worldId','eventId','lineId'])
const ENTITY_ID=/\b[a-z]{1,2}-[0-9a-f]{16}\b/gu

/** The artifact a conflict is about and which side holds the other value (R7/R9). */
export function conflictTarget(s:Pick<ImportSession,'artifacts'>,c:ImportConflict):{artifact?:ImportArtifact;other:ImportConflict['candidate']}{
 const bySource=c.source.artifactId?s.artifacts.find(a=>a.id===c.source.artifactId):undefined
 if(bySource)return {artifact:bySource,other:c.candidate}
 const byCandidate=c.candidate.artifactId?s.artifacts.find(a=>a.id===c.candidate.artifactId):undefined
 return byCandidate?{artifact:byCandidate,other:c.source}:{other:c.candidate}
}
export const fieldValue=(a:ImportArtifact,field:string)=>field==='text'?a.text:a.facts[field]??''
const isJson=(value:string)=>{const v=value.trim();if(!/^[[{]/u.test(v))return false;try{JSON.parse(v);return true}catch{return false}}
/** The artifact with the field set to value; fails when the field is not part of the artifact's table. */
export function withField(a:ImportArtifact,field:string,value:string):ImportArtifact{
 const next=structuredClone(a)
 if(field==='text')next.text=value
 else{if(!importFactFields(next.kind,next.schema).includes(field))throw Error('冲突字段不能映射到当前业务类型');next.facts[field]=value}
 return next
}
/** Same gates the save path runs: the artifact on its own, then the whole set when the field can affect references. */
export function assertFieldValue(s:Pick<ImportSession,'artifacts'>&Partial<Pick<ImportSession,'chapters'>>,a:ImportArtifact,field:string,value:string){
 const next=withField(a,field,value);validateImportSemanticArtifact(next,next.origin==='source'?'source-copy':'strict')
 // docs/559-1: a chapter index must name an existing chapter, as the save path and the structure fixes require.
 if(field==='chapterIndex'&&s.chapters){const n=Number(value);if(!/^(?:0|[1-9]\d*)$/u.test(value)||!Number.isSafeInteger(n)||n>=s.chapters.length)throw Error('需要填写已有章节的序号');if(a.kind==='outline'&&s.artifacts.some(x=>x.id!==a.id&&x.kind==='outline'&&x.facts.chapterIndex===value))throw Error('这一章已有细纲')}
 if(field!=='text'&&(REFERENCE_FIELDS.has(field)||WIZARD_REVIEW_STRUCTURAL.has(field)||isJson(value))){
  const artifacts=s.artifacts.map(x=>x.id===a.id?next:x);importNativeMappings(artifacts)
  // Outlines are projected onto chapters on save; run the same projection on a copy.
  if(a.kind==='outline'&&'workingProse' in s){const copy={...(s as ImportSession),artifacts,chapters:structuredClone((s as ImportSession).chapters)};projectDetailedOutlines(copy);validateDetailedOutlines(copy)}
 }
 return next
}
export function inferredValue(c:ImportConflict,other:ImportConflict['candidate']){return stripImportKnowledgeAnnotations(other.value)}
/** Which of the three decisions can be submitted for this conflict, and why not. `source` is always available. */
export function conflictChoiceOptions(s:Pick<ImportSession,'artifacts'>&Partial<Pick<ImportSession,'chapters'>>,c:ImportConflict):ImportConflictChoice[]{
 const {artifact:a,other}=conflictTarget(s,c)
 if(!a)return [{choice:'inferred',available:false,reason:'这处矛盾没有对应的已导入设定'},{choice:'source',available:true},{choice:'merge',available:false,reason:'这处矛盾没有对应的已导入设定'}]
 const current=fieldValue(a,c.field),fieldKnown=c.field==='text'||importFactFields(a.kind,a.schema).includes(c.field)
 const inferred=((): ImportConflictChoice=>{
  const value=inferredValue(c,other)
  if(!fieldKnown)return {choice:'inferred',available:false,reason:'这个字段不能由导入修改'}
  if(!value.trim())return {choice:'inferred',available:false,reason:'正文没有给出可用的值'}
  if(value===current)return {choice:'inferred',available:false,reason:'正文给出的值与现在的设定相同'}
  if(c.field==='text'?a.text.length>WIZARD_REVIEW_TEXT:current.length>WIZARD_REVIEW_FACT)return {choice:'inferred',available:false,reason:'这项设定较长，复核只核对了前一部分，请选择保留或自己填写'}
  if(REFERENCE_FIELDS.has(c.field)&&value===a.id)return {choice:'inferred',available:false,reason:'正文给出的值指向这项设定自身'}
  try{assertFieldValue(s,a,c.field,value)}catch{return {choice:'inferred',available:false,reason:`正文给出的值不能作为「${importFieldLabel(c.field)}」保存`}}
  return {choice:'inferred',available:true}
 })()
 const merge:ImportConflictChoice=!fieldKnown||c.field!=='text'&&(WIZARD_REVIEW_STRUCTURAL.has(c.field)||isJson(current))?{choice:'merge',available:false,reason:'这一项有固定格式，不能直接填写'}:{choice:'merge',available:true}
 return [inferred,{choice:'source',available:true},merge]
}
/** Replace imported entity ids with their names so values read as text. */
export function readableValue(s:Pick<ImportSession,'artifacts'>,value:string){const names=new Map(s.artifacts.map(a=>[a.id,a.name]));return value.replace(ENTITY_ID,id=>names.has(id)?`「${names.get(id)}」`:id)}
/** Where a quote comes from: volume and chapter for body units, file name for source units. */
export function evidenceLocation(s:ImportSession,unitId:string):string{
 const unit=workingImportUnits(s).find(u=>u.id===unitId)
 if(unit){const k=s.chapters.findIndex(c=>c.start<=unit.start&&unit.start<c.end);const c=s.chapters[k];if(c)return [c.volume,c.title].filter(Boolean).join(' · ')}
 const source=selectedImportUnits(s).find(u=>u.id===unitId);if(source){const f=s.files.find(f=>f.id===source.fileId);if(f)return f.name}
 return '原文'
}
/** docs/557 §3: the first pending conflict as the author sees it. */
export function conflictDetail(s:ImportSession):ImportConflictDetail|undefined{
 const pending=s.conflicts.filter(c=>c.status==='pending'),c=pending[0];if(!c)return undefined
 const {artifact:a,other}=conflictTarget(s,c),current=a?fieldValue(a,c.field):c.source.value
 return {conflictId:c.id,index:1,total:pending.length,entity:a?.name??readableValue(s,c.entity),kindLabel:IMPORT_LABELS[a?.kind??c.kind]??'',fieldLabel:importFieldLabel(c.field),...(c.reason?{reason:c.reason}:{}),
  current:readableValue(s,current),proposed:readableValue(s,inferredValue(c,other)),mergeDefault:current,
  evidence:c.evidence.map(e=>({quote:e.quote,location:evidenceLocation(s,e.unitId)})),choices:conflictChoiceOptions(s,c)}
}
