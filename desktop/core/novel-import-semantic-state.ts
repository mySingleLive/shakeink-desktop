import {z} from 'zod'
import {importHash,importScopeHash,safeImportBoundary} from './novel-import'
import {validateImportSemanticArtifact,validateImportSemanticReferences,isImportRawSourceArtifact,assertImportWorldContentProjectionBudget,type ImportWorldProjectionLimits,type ImportSemanticArtifact,type ImportSemanticLock,type ImportArtifactEdit,type ImportMappingWarning,type ImportMissingTarget} from './novel-import-semantics'
import type {ImportArtifact,ImportSession} from '../shared/novel-import'

export interface ImportSemanticRepairTask {key:string;start:number;end:number;unitIds:string[];done:boolean;edits:ImportArtifactEdit[];omissionKeys?:string[]}
export interface ImportSemanticRepair {artifactId:string;baseHash:string;original:ImportArtifact;tasks:ImportSemanticRepairTask[];committed:boolean}
export interface ImportSemanticOmission extends ImportMissingTarget {key:string;done:boolean;completedUnitIds?:string[]}
export interface ImportSemanticCheckpoint {version:1;inputHash:string;decisionHash:string;workingRevision:number;round:number;stage:'repair'|'review'|'ready'|'blocked';locks:ImportSemanticLock[];repairs:ImportSemanticRepair[];omissions:ImportSemanticOmission[];seenOmissions:string[];persistentConflicts:string[];verifiedHash?:string;conflictBases?:Record<string,string>}
export class ImportSemanticStateError extends Error{constructor(){super('导入语义版本或检查点无效，请保留草稿核对')}}
const checkpoint=z.object({version:z.literal(1),inputHash:z.string().min(1),decisionHash:z.string().min(1),workingRevision:z.number().int().nonnegative(),round:z.number().int().min(0).max(2),stage:z.enum(['repair','review','ready','blocked']),locks:z.array(z.object({artifactId:z.string(),field:z.string(),value:z.string()}).strict()),repairs:z.array(z.object({artifactId:z.string(),baseHash:z.string(),original:z.custom<ImportArtifact>(a=>!!a&&typeof a==='object'&&typeof(a as ImportArtifact).id==='string'),tasks:z.array(z.object({key:z.string(),start:z.number().int().nonnegative(),end:z.number().int().nonnegative(),unitIds:z.array(z.string()),omissionKeys:z.array(z.string()).optional(),done:z.boolean(),edits:z.array(z.custom<ImportArtifactEdit>(e=>!!e&&typeof e==='object'&&typeof(e as ImportArtifactEdit).artifactId==='string'))}).strict()),committed:z.boolean()}).strict()),omissions:z.array(z.object({key:z.string(),kind:z.string(),unitIds:z.array(z.string()),evidence:z.array(z.object({unitId:z.string(),quote:z.string()}).strict()),reason:z.string(),artifactId:z.string().optional(),field:z.string().optional(),baseHash:z.string().optional(),done:z.boolean(),completedUnitIds:z.array(z.string()).optional()}).strict()),seenOmissions:z.array(z.string()),persistentConflicts:z.array(z.string()),verifiedHash:z.string().optional(),conflictBases:z.record(z.string(),z.string()).optional()}).strict()
export function validateImportSemanticState(s:Pick<ImportSession,'semanticVersion'|'semanticState'>){if(s.semanticVersion===undefined){if(s.semanticState!==undefined)throw new ImportSemanticStateError();return}if(s.semanticVersion!==1||s.semanticState!==undefined&&!checkpoint.safeParse(s.semanticState).success)throw new ImportSemanticStateError()}
export const importSemanticDecisionHash=(s:Pick<ImportSession,'decisions'>)=>importHash(s.decisions)
export const importSemanticInputHash=(s:ImportSession)=>importHash({version:1,scope:importScopeHash(s,'analyze'),decisionHash:importSemanticDecisionHash(s),workingRevision:s.workingRevision})
export const importSemanticResultHash=(s:ImportSession)=>importHash({version:1,scope:importScopeHash(s,'analyze'),artifacts:s.artifacts,decisions:s.decisions,locks:s.semanticState?.locks??[]})
export function createImportSemanticState(s:ImportSession,locks:ImportSemanticLock[]=[]):ImportSemanticCheckpoint{return {version:1,inputHash:importSemanticInputHash(s),decisionHash:importSemanticDecisionHash(s),workingRevision:s.workingRevision,round:0,stage:'review',locks:structuredClone(locks),repairs:[],omissions:[],seenOmissions:[],persistentConflicts:[]}}
export function importSourceCopyIds(s:Pick<ImportSession,'artifacts'>){return s.artifacts.filter(a=>a.origin==='source').map(a=>a.id)}
export function assertImportSemanticLocks(artifacts:ImportArtifact[],locks:ImportSemanticLock[]){for(const lock of locks){const a=artifacts.find(a=>a.id===lock.artifactId);if(!a||(lock.field==='text'?a.text:a.facts[lock.field])!==lock.value)throw Error('导入作者锁定字段发生变化')}}
const MAX_REPAIR_TASKS=10000,MAX_REPAIR_METADATA_BYTES=64*1024*1024
export function assertImportSemanticRepairCapacity(existing:ImportSemanticRepair[],additions:{original:ImportArtifact;rangeCount:number;batches:{id:string}[][];omissionKeys?:string[]}[]){
 const bytes=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value)).length
 let count=existing.reduce((sum,r)=>sum+r.tasks.length,0),size=bytes(existing)
 for(const {original,rangeCount,batches,omissionKeys}of additions){const tasks=rangeCount*batches.length;if(!Number.isSafeInteger(tasks)||tasks<0||(count+=tasks)>MAX_REPAIR_TASKS)throw Error('设定修订任务超过单次容量，请缩小导入范围')
  // Conservative bound: fixed fields include a 64-character hash, safe integer
  // offsets, punctuation and flags. Count repeated unit IDs before allocation.
  size+=bytes(original)+tasks*(512+(omissionKeys?bytes(omissionKeys):0))+rangeCount*batches.reduce((n,b)=>n+bytes(b.map(u=>u.id)),0)
  if(!Number.isSafeInteger(size)||size>MAX_REPAIR_METADATA_BYTES)throw Error('设定修订元数据超过64MiB容量，请缩小导入范围')
 }
}
export function boundedImportSemanticRanges(text:string,maxCharacters:number){
 if(!Number.isInteger(maxCharacters)||maxCharacters<2)throw Error('设定修订字符预算无效')
 const ranges:{start:number;end:number}[]=[];let start=0
 while(start<text.length){let end=Math.min(text.length,start+maxCharacters);const paragraph=/\r?\n[\t ]*\r?\n/g;paragraph.lastIndex=start;const match=paragraph.exec(text);if(match&&match.index+match[0].length<=end)end=match.index+match[0].length;if(!safeImportBoundary(text,end))end--;if(end<=start)throw Error('设定修订字符边界无效');if(ranges.length>=MAX_REPAIR_TASKS)throw Error('设定修订任务超过单次容量，请缩小导入范围');ranges.push({start,end});start=end}
 return ranges.length?ranges:[{start:0,end:0}]
}

/** Unstructured sources remain readable materials. Only actual typed mappings
 * participate in native references; copying never manufactures a World. */
export function importNativeMappings(value:ImportArtifact[]|Pick<ImportSession,'artifacts'>,projectionLimits?:ImportWorldProjectionLimits){
 const artifacts=Array.isArray(value)?value:value.artifacts
 const sourceCopyIds=artifacts.filter(a=>a.origin==='source').map(a=>a.id),decoded=new Map<string,ImportSemanticArtifact>(),projectable=new Set<string>(),lookup=new Map(artifacts.map(a=>[a.id,a]))
 if(lookup.size!==artifacts.length)throw Error('导入实体标识重复')
 for(const a of artifacts){let value:ImportSemanticArtifact
  if(a.origin==='source'&&!isImportRawSourceArtifact(a))throw Error('原资料基础结构或字符无效')
  try{value=validateImportSemanticArtifact(a,a.origin==='source'?'source-copy':'strict')}catch(error){
   // A copied source can be unprojectable without losing its original record.
   // Corrupt raw record shapes and all derived/confirmed failures remain hard errors.
   if(a.origin!=='source')throw error
   value={native:null,knowledge:{},inferred:false,mappingWarnings:[{artifactId:a.id,fields:Object.keys(a.facts),reason:'原资料结构或知识限定映射未确认；完整材料保留'}]};decoded.set(a.id,value);continue
  }
  decoded.set(a.id,value);let ready=!['character','scene','world'].includes(a.kind)||!!value.native
  if(value.native?.kind==='world'&&value.native.entityType==='SETTING')try{assertImportWorldContentProjectionBudget(value.native.content,a.origin==='source'&&a.facts.content===undefined?{}:value.knowledge,projectionLimits)}catch(error){if(a.origin!=='source')throw error;ready=false;value.native=null;value.mappingWarnings.push({artifactId:a.id,fields:['content','reliability','attribution','temporalScope'],reason:'原资料原生投影超过容量；完整原资料保留，结构映射未确认'})}
  if(a.origin==='source'&&['worldline','narrative','trope'].includes(a.kind))try{validateImportSemanticArtifact({...a,origin:'confirmed'})}catch{ready=false;value.mappingWarnings.push({artifactId:a.id,fields:a.kind==='trope'?['tropeKind']:['reliability','references'],reason:'导入时结构映射未确认；完整材料保留'})}
  if(ready)projectable.add(a.id)
 }
 const drop=(a:ImportArtifact,fields:string[])=>{if(a.origin!=='source')throw Error('导入实体引用类型或归属无效');projectable.delete(a.id);const value=decoded.get(a.id)!;value.native=null;value.mappingWarnings.push({artifactId:a.id,fields,reason:'导入时结构映射未确认；完整材料保留'})}
 const prune=()=>{let changed=true
 while(changed){changed=false;for(const a of artifacts.filter(a=>projectable.has(a.id))){const f=a.facts,native=decoded.get(a.id)!.native,known=(id:string,kind:ImportArtifact['kind'])=>projectable.has(id)&&lookup.get(id)?.kind===kind;let valid=true
   const character=(value:string)=>lookup.has(value)?known(value,'character'):artifacts.filter(a=>projectable.has(a.id)&&a.kind==='character'&&a.name===value).length===1
   for(const [field,kind]of [['characterId','character'],['sceneId','scene'],['itemId','item']] as const)if(f[field]!==undefined&&!known(f[field],kind))valid=false
   if(native?.kind==='character')for(const r of native.relationships)if(r.characterId&&!known(r.characterId,'character'))valid=false
   if(native?.kind==='scene'&&native.parentId){const p=decoded.get(native.parentId)?.native;valid&&=projectable.has(native.parentId)&&p?.kind==='scene'}
   if(native?.kind==='world'){if(native.entityType==='WORLD'&&native.parentId){const p=decoded.get(native.parentId)?.native;valid&&=projectable.has(native.parentId)&&p?.kind==='world'&&p.entityType==='WORLD'}if(native.entityType==='SETTING'){const w=decoded.get(native.worldId)?.native;valid&&=projectable.has(native.worldId)&&w?.kind==='world'&&w.entityType==='WORLD';if(native.parentId){const p=decoded.get(native.parentId)?.native;valid&&=projectable.has(native.parentId)&&p?.kind==='world'&&p.entityType==='SETTING'&&p.settingType==='MAP'&&p.worldId===native.worldId}}}
   if(a.kind==='worldline'){if(f.parentId&&!known(f.parentId,'worldline'))valid=false;for(const id of JSON.parse(f.people??'[]'))if(!character(id))valid=false}
   if(a.kind==='narrative'){if(f.narrator&&!character(f.narrator))valid=false;if(f.refs)for(const ref of JSON.parse(f.refs))if(!known(ref.eventId,'worldline')||ref.character&&!known(ref.character,'character'))valid=false}
   if(!valid){drop(a,['references']);changed=true}
  }}}
 prune()
 const parents=new Map(artifacts.filter(a=>projectable.has(a.id)&&a.facts.parentId).map(a=>[a.id,a.facts.parentId]))
 for(const id of parents.keys()){const path:string[]=[];let cursor:string|undefined=id;while(cursor){const index=path.indexOf(cursor);if(index>=0){const cycle=path.slice(index);if(cycle.some(key=>lookup.get(key)!.origin!=='source'))throw Error('导入父引用形成循环');for(const key of cycle)drop(lookup.get(key)!,['parentId']);break}path.push(cursor);cursor=parents.get(cursor)}}
 prune()
 // Typed derived/confirmed nodes must pass the full shared native/ref contract.
 validateImportSemanticReferences(artifacts.filter(a=>projectable.has(a.id)),sourceCopyIds)
 return {decoded,projectable,projectableIds:[...projectable],sourceCopyIds,mappingWarnings:[...decoded.values()].flatMap(value=>value.mappingWarnings)}
}
export function importSemanticAudit(s:ImportSession){if(s.semanticVersion!==1)return undefined;const state=s.semanticState,mapping=importNativeMappings(s.artifacts);return {version:1,...(s.chapterDetection?{chapterDetection:s.chapterDetection}:{}),decisionHash:importSemanticDecisionHash(s),workingRevision:s.workingRevision,round:state?.round??0,stage:state?.stage??'ready',verifiedHash:state?.verifiedHash,locks:state?.locks??[],repairTasks:state?.repairs.flatMap(repair=>repair.tasks.map(task=>({key:task.key,artifactId:repair.artifactId,baseHash:repair.baseHash,start:task.start,end:task.end,done:task.done,proposalHash:importHash(task.edits)})))??[],omissions:state?.omissions.map(({key,kind,done})=>({key,kind,done}))??[],persistentConflicts:state?.persistentConflicts??[],sourceCopyIds:mapping.sourceCopyIds,projectableIds:mapping.projectableIds,mappingWarnings:mapping.mappingWarnings}}

/** Only explicit labels are copied. Narrative ages, occupations or roles are
 * never inferred locally. Unrecognized prose remains intact in artifact.text. */
export function importSemanticSourceFacts(text:string,kind:ImportArtifact['kind']):Record<string,string>{
 const result:Record<string,string>={},labels:Record<string,string>={角色类型:'roleType',roleType:'roleType',别名:'aliases',aliases:'aliases',年龄:'age',性别:'gender',职业:'occupation',性格:'personality',外貌:'appearance',衣着:'clothing',口头禅:'catchphrase',成长:'growthArc',relationships:'relationships',entityType:'entityType',parentId:'parentId',worldId:'worldId',settingType:'settingType',content:'content',coordinates:'coordinates',reliability:'reliability',attribution:'attribution',temporalScope:'temporalScope',tropeKind:'tropeKind'}
 for(const match of text.matchAll(/^[\t ]*(?:[-*][\t ]*)?([^：:\r\n]+?)[\t ]*[：:][\t ]*([^\r\n]*)/gmu)){const key=labels[match[1].trim()];if(key){let value=match[2].trim();if(key==='aliases'&&!value.startsWith('['))value=JSON.stringify(value.split(/[,，、;；]/u).map(s=>s.trim()).filter(Boolean));if(key==='roleType')value=({主角:'PROTAGONIST',配角:'SUPPORTING',反派:'ANTAGONIST'} as Record<string,string>)[value]??value;result[key]=value}}
 if(kind==='trope'&&!result.tropeKind){const types=[...text.matchAll(/^\s*(?:#{1,6}\s*)?(爽点|泪点)(?:[：:\t ]|$)/gmu)].map(m=>m[1]);if(types.length&&types.every(v=>v==='爽点'))result.tropeKind='SATISFACTION';if(types.length&&types.every(v=>v==='泪点'))result.tropeKind='TEAR'}
 return result
}
