import {z} from 'zod'
import {positionError} from '../../src/lib/creation-wizard/position'
import {normalizeContent,type SettingContent,type LevelNode,type LevelPathway} from '../../src/components/content/setting-content'
import {importHash,safeImportBoundary,validateImportEvidence} from './novel-import'
import {IMPORT_TARGETS,type ImportAiRequest,type ImportAiResult,type ImportArtifact,type ImportEvidence,type ImportTarget,type ImportUnit} from '../shared/novel-import'
import {IMPORT_SCENE_PROFILE_TEXT_FIELDS} from '../shared/novel-import-scene-links'
import type {SceneMentionRecord,SceneIdentityDecision,SceneCleanupDecision,SceneIdentityRequestContext} from '../shared/novel-import-scene-identity'
export type {SceneMentionRecord,SceneIdentityDecision,SceneIdentityRequestContext,SceneIdentityMembership} from '../shared/novel-import-scene-identity'

/** Pure contracts only. They validate structure and provenance links, not whether
 * a literary interpretation is supported; that still needs source review. */
export const IMPORT_WORLD_SETTING_TYPES=['LEVEL_SYSTEM','POWER_SYSTEM','CONCEPT','FACTION','MAP','SOCIETY','CULTURE','GEOGRAPHY','WORLD_HISTORY'] as const
export type ImportWorldSettingType=typeof IMPORT_WORLD_SETTING_TYPES[number]
export const IMPORT_RELIABILITIES=['客观事实','角色有限事实','人物推测','可能不可靠'] as const
export type ImportReliability=typeof IMPORT_RELIABILITIES[number]
export type ImportSemanticMode='strict'|'source-copy'
export interface ImportKnowledge {reliability?:ImportReliability;attribution?:string;temporalScope?:string}
export interface ImportMappingWarning {artifactId:string;fields:string[];reason:string}
export interface ImportRelationship {target:string;description:string;characterId?:string}
export interface ImportNarrativeReference extends ImportKnowledge {eventId:string;kind?:'happen'|'mention'|'recall';reliability:ImportReliability;character?:string}
export interface ImportSourceMapping {version:1;mode:'source-copy';unconfirmed:string[];artifactId:string}
export type ImportNativeProjection=
 | {kind:'character';roleType:'PROTAGONIST'|'SUPPORTING'|'ANTAGONIST';aliases:string[];age:string;gender:string;occupation:string;bio:string;personality:string;appearance:string;clothing:string;catchphrase:string;growthArc:string;relationships:ImportRelationship[];extra:{importArtifactId:string;importMapping?:ImportSourceMapping}}
 | {kind:'scene';entityType:'PLACE';parentId:string|null;coordinates:string;description:string}
 | {kind:'world';entityType:'WORLD';parentId:string|null;description:string}
 | {kind:'world';entityType:'SETTING';worldId:string;settingType:ImportWorldSettingType;parentId:string|null;content:SettingContent}
export interface ImportCharacterProfile {height:string;weight:string;build:string;faceShape:string;tastes:string;habits:string;dialogueStyle:string;sampleDialogue:string;personalityTags:string[];motivations:{items:{text:string;importance:number}[]}[];desires:string;fears:string;beliefs:Record<string,string>;bigFive:Record<string,number>|null;abilities:string;backstory:string;arcStages:ImportArcStage[]}
export interface ImportArcStage {id:string;name:string;chapterIndex:number|null;description:string;tags:string[];markers:{kind:'age'|'event'|'custom';text:string}[];changes:{dimension:string;before:string;after:string}[];isDebut:boolean}
export interface ImportSceneProfile {exteriorDescription:string;interiorDescription:string;backstory:string;entryMethod:string}
export interface ImportItemProfile {appearance:string;acquisition:string;effects:{name:string;description:string}[];aliases:string[];tags:string[]}
/** docs/542: book position inferred from the imported themes; written to the Theme row, never as the author's position. */
export interface ImportThemeProfile {channel:string;genre:string;tags:string[];sellingPoints:string;targetAudience:string;synopsis:string}
export type ImportNativeProfile={kind:'character';value:ImportCharacterProfile}|{kind:'scene';value:ImportSceneProfile}|{kind:'item';value:ImportItemProfile}|{kind:'theme';value:ImportThemeProfile}
export interface ImportSemanticArtifact {native:ImportNativeProjection|null;knowledge:ImportKnowledge;mappingWarnings:ImportMappingWarning[];inferred:boolean;profile?:ImportNativeProfile}
export interface ImportArtifactTextEdit {start:number;end:number;before:string;after:string}
export interface ImportArtifactEdit {artifactId:string;baseHash:string;textEdits?:ImportArtifactTextEdit[];setFacts?:Record<string,string>;unsetFacts?:string[];reason:string;evidence:ImportEvidence[]}
export interface ImportSemanticLock {artifactId:string;field:string;value:string}
export interface ImportArtifactEditContext {units:ImportUnit[];locks?:ImportSemanticLock[];targetIds?:string[];sourceCopyIds?:string[]}
/** Local request/result additions for the later adapter/controller integration. */
export interface ImportReconcileContext {targetIds:string[];locks:ImportSemanticLock[];decisionHash:string;workingRevision:number;decisions?:{conflictId:string;choice:string;explanation?:string;hash:string}[];fragments?:{artifactId:string;baseHash:string;start:number;end:number;fields:string[]}[]}
export interface ImportMissingTarget {kind:ImportTarget;unitIds:string[];evidence:ImportEvidence[];reason:string;artifactId?:string;field?:string;baseHash?:string}
export interface ImportReviewProjection {artifactId:string;semanticHash:string;fullTextLength:number;fullFactKeys:string[];fields:string[];textRange?:{start:number;end:number}}
export interface ImportRosterEntry {name:string;aliases:string[];roleType?:'PROTAGONIST'|'SUPPORTING'|'ANTAGONIST';parent?:string;itemType?:string;important?:boolean;category?:'item'|'character'|'place'|'organization'|'concept'|'other';parallel?:boolean;settings?:{settingType:ImportWorldSettingType;name:string}[];evidence:ImportEvidence}
export interface ImportTouchEntry {foreshadowKey:string;title:string;content:string;touch:{kind:'PLANT'|'MENTION'|'PAYOFF';chapterIndex:number;summary:string;quote:string;eventId?:string;narrativeId?:string};evidence:ImportEvidence}
export interface ImportSemanticResult {artifactEdits?:ImportArtifactEdit[];missingTargets?:ImportMissingTarget[];roster?:ImportRosterEntry[];sceneRosterRecords?:SceneMentionRecord[];sceneIdentityDecisions?:SceneIdentityDecision[];sceneCleanup?:SceneCleanupDecision[];touches?:ImportTouchEntry[];sceneParents?:{id:string;parentId?:string;evidence:ImportEvidence}[]}
export interface ImportSemanticEntity {id:string;kind:ImportTarget;name:string;unitIds?:string[];parentId?:string;entityType?:'PLACE'|'WORLD'|'SETTING';worldId?:string;settingType?:ImportWorldSettingType}
export interface ImportSemanticRequestFields {semanticVersion?:1;intent?:'reconcile'|'structure'|'roster'|'entity'|'touches';entityTarget?:{id:string;aliases:string[];roleType?:'PROTAGONIST'|'SUPPORTING'|'ANTAGONIST';evidenceOptions?:ImportEvidence[]};sceneIdentity?:SceneIdentityRequestContext;sceneParentTargets?:string[];reconcile?:ImportReconcileContext;selectedTargets?:ImportTarget[];semanticLocks?:ImportSemanticLock[];entities?:ImportSemanticEntity[];reviewProjection?:ImportReviewProjection[]}
export type ImportSemanticAiRequest=ImportAiRequest&ImportSemanticRequestFields
export type ImportSemanticAiResult=ImportAiResult&ImportSemanticResult

export const IMPORT_KNOWLEDGE_CONTRACT='区分亲见、角色陈述、转述、传闻、人物推测与文学解释；保留披露者和每项事实的时间范围、早期习惯与后期例外。阅读先后不证明因果，未知经历或结局保持未知；原文引文只能定位证据，不能机械证明语义正确。世界事件与叙事须明确四种reliability，保留attribution、temporalScope及讲述/发生/提及/回忆关系，不默认客观事实。'
const knowledgeFields=['reliability','attribution','temporalScope','characterId','sceneId','itemId']
export const IMPORT_SEMANTIC_FACT_FIELDS:Record<ImportTarget,readonly string[]>={
 character:['roleType','aliases','age','gender','occupation','personality','appearance','clothing','catchphrase','growthArc','relationships',...knowledgeFields],
 scene:['entityType','parentId','coordinates',...knowledgeFields],
 world:['entityType','parentId','worldId','settingType','content',...knowledgeFields],
 worldline:['lineId','lineName','timeKind','timeValue','timeEnd','time','people','eventId','parentId',...knowledgeFields],
 narrative:['chapterIndex','order','narrator','refs',...knowledgeFields],
 outline:['chapterIndex',...knowledgeFields],theme:[...knowledgeFields],style:[...knowledgeFields],item:[...knowledgeFields],
 foreshadow:['setup','payoff',...knowledgeFields],goldenFinger:['trigger','limitation',...knowledgeFields],trope:['tropeKind',...knowledgeFields],
}
export const IMPORT_THEME_PROFILE_ID='import-theme-profile',IMPORT_THEME_PROFILE_NAME='作品主题定位（导入推断）'
export const IMPORT_THEME_PROFILE_FIELDS=['channel','genre','tags','sellingPoints','targetAudience','synopsis'] as const
/** Length class of the imported body, same bands as the theme panel (WIZARD_LENGTH_META). */
export function importLengthClass(characters:number):'微型'|'短篇'|'中篇'|'长篇'{return characters<10000?'微型':characters<50000?'短篇':characters<300000?'中篇':'长篇'}
export const IMPORT_THEME_PROFILE_LIMITS={sellingPoints:2000,targetAudience:2000,synopsis:500,tags:20,tag:30} as const
/** docs/545: a requested synopsis is at most 15 non-empty lines and 300 characters (saved positions still decode up to 500). */
export const IMPORT_THEME_PROFILE_REQUEST_SYNOPSIS={lines:15,characters:300} as const
/** docs/545 §6 H4/M3: keeps whole sentences within 15 non-empty lines and 300 characters; without a sentence end the
 * text is cut at a character boundary. Used for over-long position synopses and for joined themes without a position. */
export function importThemeSynopsisFallback(text:string):string{
 const {lines:maxLines,characters:max}=IMPORT_THEME_PROFILE_REQUEST_SYNOPSIS,trimmed=text.trim()
 // 547 L1: a synopsis already within both limits is returned as written (blank lines kept).
 if(Array.from(trimmed).length<=max&&trimmed.split('\n').filter(l=>l.trim()).length<=maxLines)return trimmed
 const head=Array.from(text.split('\n').map(l=>l.trimEnd()).filter(l=>l.trim()).slice(0,maxLines).join('\n')).slice(0,max)
 // 547 L3: a sentence end keeps the closing quotes or brackets right after it.
 for(let i=head.length-1;i>=0;i--)if('。！？!?'.includes(head[i])){let end=i+1;while(end<head.length&&'”’」』）)】》'.includes(head[end]))end++;return head.slice(0,end).join('')}
 return head.join('')
}
/** docs/545 §7: the theme synopsis without a position: copied source themes verbatim first, then the inferred themes cut by the fallback. */
export function importThemeSynopsis(themes:readonly {origin:string;text:string}[]):string{
 // 547 M1: the theme row holds at most 5000 characters (src/lib/services/theme.ts); the cut keeps a character boundary.
 return Array.from([themes.filter(t=>t.origin==='source').map(t=>t.text).join('\n\n'),importThemeSynopsisFallback(themes.filter(t=>t.origin!=='source').map(t=>t.text).join('\n\n'))].filter(Boolean).join('\n\n')).slice(0,5000).join('')
}
/** Wizard entity results (artifact.schema===2) may fill every native panel field. */
export const IMPORT_SEMANTIC_V2_FIELDS:Partial<Record<ImportTarget,readonly string[]>>={
 character:['height','weight','build','faceShape','tastes','habits','dialogueStyle','sampleDialogue','personalityTags','motivations','desires','fears','beliefs','bigFive','abilities','backstory','arcStages'],
 scene:IMPORT_SCENE_PROFILE_TEXT_FIELDS,
 item:['appearance','acquisition','effects','aliases','tags'],
 foreshadow:['status','touches'],
 theme:IMPORT_THEME_PROFILE_FIELDS,
}
/** Field table for one artifact; legacy artifacts keep the exact v1 table. */
export function importFactFields(kind:ImportTarget,schema?:2):readonly string[]{return schema===2?[...IMPORT_SEMANTIC_FACT_FIELDS[kind],...(IMPORT_SEMANTIC_V2_FIELDS[kind]??[])]:IMPORT_SEMANTIC_FACT_FIELDS[kind]}
const hashString=z.string().regex(/^[a-f0-9]{64}$/u),safeOffset=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),projectionKeys=z.array(z.string()).refine(keys=>new Set(keys).size===keys.length)
export const importReviewProjectionSchema=z.array(z.object({artifactId:z.string().min(1),semanticHash:hashString,fullTextLength:safeOffset,fullFactKeys:projectionKeys,fields:projectionKeys,textRange:z.object({start:safeOffset,end:safeOffset}).strict().optional()}).strict())
/** Metadata comes from the complete private artifact, never a guessed fragment. */
export function createImportReviewProjection(full:ImportArtifact,fragment:ImportArtifact,textRange?:{start:number;end:number}):ImportReviewProjection{
 if(full.id!==fragment.id||full.kind!==fragment.kind||full.name!==fragment.name||full.origin!==fragment.origin||textRange&&full.text.slice(textRange.start,textRange.end)!==fragment.text||Object.entries(fragment.facts).some(([key,value])=>full.facts[key]!==value))throw Error('审核投影与完整设定不匹配')
 return {artifactId:full.id,semanticHash:importArtifactSemanticHash(full),fullTextLength:full.text.length,fullFactKeys:Object.keys(full.facts),fields:Object.keys(fragment.facts),...(textRange?{textRange}:{})}
}
export function assertImportReviewProjection(artifacts:ImportArtifact[],raw:unknown):asserts raw is ImportReviewProjection[]{
 const parsed=importReviewProjectionSchema.safeParse(raw);if(!parsed.success||parsed.data.length!==artifacts.length)throw Error('审核投影结构或位置无效')
 const known=new Map<string,{p:ImportReviewProjection;a:ImportArtifact}>()
 for(const [i,p]of parsed.data.entries()){const a=artifacts[i],old=known.get(a.id),range=p.textRange
  if(p.artifactId!==a.id||JSON.stringify(p.fields)!==JSON.stringify(Object.keys(a.facts))||p.fields.some(key=>!p.fullFactKeys.includes(key))||range&&(range.end<range.start||range.end>p.fullTextLength||range.end-range.start!==a.text.length)||!range&&a.text!==''||!a.text.isWellFormed()||old&&(old.p.semanticHash!==p.semanticHash||old.p.fullTextLength!==p.fullTextLength||JSON.stringify(old.p.fullFactKeys)!==JSON.stringify(p.fullFactKeys)||old.a.kind!==a.kind||old.a.name!==a.name||old.a.origin!==a.origin))throw Error('审核投影范围或字段无效')
  known.set(a.id,{p,a})
 }
}
/** The adapter checks the bounded view; main additionally compares the hash and
 * source/locks against the current complete private object before crediting. */
export function assertImportMissingProjection(entry:ImportMissingTarget,artifacts:ImportArtifact[],projection:ImportReviewProjection[]|undefined,locks:ImportSemanticLock[]=[]){
 const triple=[entry.artifactId,entry.field,entry.baseHash],count=triple.filter(value=>value!==undefined).length
 if(!count)return
 if(count!==3||!entry.artifactId||!entry.field||!entry.baseHash)throw Error('已有实体遗漏必须提供完整三元组')
 if(!projection)throw Error('已有实体遗漏缺少可信审核投影')
 assertImportReviewProjection(artifacts,projection)
 const positions=projection.map((p,i)=>({p,a:artifacts[i]})).filter(({p})=>p.artifactId===entry.artifactId),first=positions[0]
 if(!first||first.a.kind!==entry.kind||first.a.origin==='source'||first.p.semanticHash!==entry.baseHash||entry.field!=='text'&&(!importFactFields(entry.kind,first.a.schema).includes(entry.field)||['entityType','settingType'].includes(entry.field))||locks.some(lock=>lock.artifactId===entry.artifactId&&lock.field===entry.field))throw Error('已有实体遗漏目标、版本、字段或锁定范围无效')
 if(entry.field==='text'){
  let end=0;for(const range of positions.flatMap(({p})=>p.textRange?[p.textRange]:[]).sort((a,b)=>a.start-b.start)){if(range.start>end)break;end=Math.max(end,range.end)}
  if(end!==first.p.fullTextLength)throw Error('已有实体遗漏文字未完整提供，片外内容不能判缺')
 }else if(first.p.fullFactKeys.includes(entry.field)&&!positions.some(({p})=>p.fields.includes(entry.field!)))throw Error('已有实体遗漏字段未提供，片外内容不能判缺')
}
const string=z.string().refine(value=>value.isWellFormed(),'字符无效')
const nonempty=string.refine(value=>value.trim().length>0,'内容不能为空')
const relationshipSchema=z.object({target:nonempty,description:string,characterId:nonempty.optional()}).strict()
const referenceSchema=z.object({eventId:nonempty,kind:z.enum(['happen','mention','recall']).optional(),reliability:z.enum(IMPORT_RELIABILITIES),character:nonempty.optional(),attribution:string.optional(),temporalScope:string.optional()}).strict()
const abilitySchema=z.object({name:string,description:string}).strict()
const levelSchema:z.ZodType<LevelNode>=z.lazy(()=>z.object({name:string,aliases:z.array(string),tags:z.array(string),condition:string,description:string,abilities:z.array(abilitySchema),children:z.array(levelSchema)}).strict())
const pathwaySchema:z.ZodType<LevelPathway>=z.object({name:string,aliases:z.array(string),tags:z.array(string),description:string,levels:z.array(levelSchema)}).strict()
const levelContentSchema=z.object({scope:z.enum(['CHARACTER','ITEM','GENERAL']),form:z.enum(['SINGLE','MULTI_PATHWAY']),description:string,rules:string,levels:z.array(levelSchema),pathways:z.array(pathwaySchema)}).strict()
const conceptSchema=z.object({concepts:z.array(z.object({term:string,explanation:string}).strict())}).strict()
const factionSchema=z.object({factions:z.array(z.object({id:nonempty.optional(),name:string,description:string,relations:string}).strict())}).strict()
function fail(message:string):never{throw Error(message)}
function parsed<T>(schema:z.ZodType<T>,raw:unknown,label:string):T{const result=schema.safeParse(raw);if(!result.success)return fail(label+'结构、字符或字段类型无效');return result.data}
function json<T>(schema:z.ZodType<T>,raw:string,label:string):T{let value:unknown;try{value=JSON.parse(raw)}catch{return fail(label+'结构无效')}return parsed(schema,value,label)}
function has(value:object,key:string){return Object.hasOwn(value,key)}
function integer(value:string|undefined){return value!==undefined&&/^\d+$/u.test(value)&&Number.isSafeInteger(Number(value))}
const visible=(value:string)=>value.trim().length>0
function levelHasContent(level:LevelNode):boolean{return [level.name,...level.aliases,...level.tags,level.condition,level.description,...level.abilities.flatMap(ability=>[ability.name,ability.description])].some(visible)||level.children.some(levelHasContent)}
/** Count only native editor fields; IDs, enum defaults and empty rows are not
 * visible substance. This is an emptiness gate, not a semantic truth test. */
function nativeWorldContentVisible(content:SettingContent):boolean{
 if('text' in content)return visible(content.text)
 if('concepts' in content)return content.concepts.some(concept=>visible(concept.term)||visible(concept.explanation))
 if('factions' in content)return content.factions.some(faction=>[faction.name,faction.description,faction.relations].some(visible))
 if('scope' in content)return visible(content.description)||visible(content.rules)||(content.form==='SINGLE'?content.levels.some(levelHasContent):content.pathways.some(pathway=>[pathway.name,...pathway.aliases,...pathway.tags,pathway.description].some(visible)||pathway.levels.some(levelHasContent)))
 return false
}

/** Strict native decode comes before the editor's deliberately tolerant legacy
 * normalizer. Equality rejects any normalization that discards source content. */
/** Fixed descriptions of why world content fails its native schema: known field names and zod issue
 * codes only, never provider values or unknown keys, so it may enter a correction or a debug log. */
export function importWorldContentIssues(type:string,raw:unknown):string[]{
 let value=raw;if(typeof raw==='string'){try{value=JSON.parse(raw)}catch{return ['content不是合法JSON字符串']}}
 const schema=type==='LEVEL_SYSTEM'?levelContentSchema:type==='CONCEPT'?conceptSchema:type==='FACTION'?factionSchema:z.object({text:string}).strict()
 const known=new Set(['factions','concepts','text','name','description','relations','id','term','explanation','scope','form','rules','levels','pathways','aliases','tags','condition','abilities','children'])
 const result=schema.safeParse(value,{reportInput:true});if(result.success)return []
 return [...new Set(result.error.issues.slice(0,6).map(issue=>{const path=issue.path.map(p=>typeof p==='number'?'[]':known.has(String(p))?String(p):'?').join('.')||'(根)';return path+':'+issue.code+(issue.code==='invalid_type'?'('+(issue.input===null?'null':Array.isArray(issue.input)?'array':typeof issue.input)+')':issue.code==='unrecognized_keys'?'('+(issue.keys.filter(k=>known.has(k)).join('/')||'?')+')':'')}))]
}
export function decodeImportWorldContent(type:string,raw:unknown):SettingContent{
 if(!IMPORT_WORLD_SETTING_TYPES.includes(type as ImportWorldSettingType))return fail('世界设定类型无效')
 let value=raw;if(typeof raw==='string'){try{value=JSON.parse(raw)}catch{return fail('世界设定内容结构无效')}}
 const schema=type==='LEVEL_SYSTEM'?levelContentSchema:type==='CONCEPT'?conceptSchema:type==='FACTION'?factionSchema:z.object({text:string}).strict()
 const content=parsed(schema as z.ZodType<SettingContent>,value,'世界设定内容')
 if(type==='LEVEL_SYSTEM'&&'form' in content&&(content.form==='SINGLE'&&content.pathways.length||content.form==='MULTI_PATHWAY'&&content.levels.length))return fail('世界等级内容与原生显示形态不一致')
 const normalized=normalizeContent(type as ImportWorldSettingType,content)
 if(importHash(content)!==importHash(normalized))return fail('世界设定内容在原生规整后丢失')
 if(!nativeWorldContentVisible(normalized))return fail('世界设定缺少原生可见实质内容')
 return normalized
}
function knowledge(facts:Record<string,string>,required=false):ImportKnowledge{
 if(facts.reliability===undefined){if(required)return fail('事件或叙事必须明确可靠性');return {...(facts.attribution!==undefined?{attribution:facts.attribution}:{}),...(facts.temporalScope!==undefined?{temporalScope:facts.temporalScope}:{})}}
 if(!IMPORT_RELIABILITIES.includes(facts.reliability as ImportReliability))return fail('事实可靠性类型无效')
 if(facts.reliability!=='客观事实'&&!facts.attribution?.trim())return fail('非客观事实缺少知识归属说明')
 return {reliability:facts.reliability as ImportReliability,...(facts.attribution!==undefined?{attribution:facts.attribution}:{}),...(facts.temporalScope!==undefined?{temporalScope:facts.temporalScope}:{})}
}
function validateShape(a:ImportArtifact){
 if(!a||!IMPORT_TARGETS.includes(a.kind)||typeof a.id!=='string'||!a.id||typeof a.name!=='string'||!a.name||typeof a.text!=='string'||!a.text.isWellFormed()||!a.facts||Array.isArray(a.facts)||typeof a.facts!=='object'||Object.values(a.facts).some(value=>typeof value!=='string'||!value.isWellFormed()))fail('导入语义字段结构无效')
}
/** Raw fallback tolerates undecoded business values, never corrupt records. */
export function isImportRawSourceArtifact(a:ImportArtifact):boolean{
 const plain=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null)
 const text=(value:unknown,required=false):value is string=>typeof value==='string'&&(!required||value.length>0)&&value.isWellFormed()
 return plain(a)&&a.origin==='source'&&IMPORT_TARGETS.includes(a.kind)&&text(a.id,true)&&text(a.name,true)&&text(a.text)&&plain(a.facts)&&Object.entries(a.facts).every(([key,value])=>text(key)&&text(value))&&Array.isArray(a.sourceUnitIds)&&a.sourceUnitIds.every(id=>text(id,true))&&Array.isArray(a.evidence)&&a.evidence.every(e=>plain(e)&&text(e.unitId,true)&&text(e.quote,true))
}
/** source-copy is an explicit caller decision, never an origin-based bypass for
 * confirmed/inferred values. Original artifacts remain intact in the audit. */
export function validateImportSemanticArtifact(a:ImportArtifact,mode:ImportSemanticMode='strict'):ImportSemanticArtifact{
 const result=validateImportSemanticArtifactV1(a,mode)
 if(a.schema===undefined)return result
 if(a.schema!==2)return fail('导入产物结构版本无效')
 const profile=importNativeProfile(a);return profile?{...result,profile}:result
}
const v2Text=(f:Record<string,string>,key:string)=>f[key]??''
const v2Json=<T>(f:Record<string,string>,key:string,schema:z.ZodType<T>,empty:T):T=>f[key]===undefined||f[key]===''?empty:json(schema,f[key],key)
const arcStageInput=z.object({id:z.string().trim().min(1).max(50),name:z.string().trim().min(1).max(50),chapterIndex:z.number().int().nonnegative().nullable().optional(),description:z.string().max(2000).optional(),tags:z.array(z.string().trim().min(1).max(20)).max(8).optional(),markers:z.array(z.object({kind:z.enum(['age','event','custom']),text:z.string().trim().min(1).max(50)}).strict()).max(6).optional(),changes:z.array(z.object({dimension:z.string().trim().min(1).max(50),before:z.string().max(500),after:z.string().max(500)}).strict()).max(12).optional(),isDebut:z.boolean().optional()}).strict()
const motivationInput=z.array(z.object({items:z.array(z.object({text:z.string().trim().min(1).max(200),importance:z.number().int().min(1).max(5)}).strict()).min(1).max(8)}).strict()).max(6)
const bigFiveInput=z.object({openness:z.number().int().min(0).max(100).optional(),conscientiousness:z.number().int().min(0).max(100).optional(),extraversion:z.number().int().min(0).max(100).optional(),agreeableness:z.number().int().min(0).max(100).optional(),neuroticism:z.number().int().min(0).max(100).optional()}).strict()
const beliefsInput=z.object({worldview:z.string().max(1000).optional(),values:z.string().max(1000).optional(),outlook:z.string().max(1000).optional(),other:z.string().max(1000).optional()}).strict()
/** Strict decode of v2 panel fields: invalid structured values fail instead of being dropped. */
function importNativeProfile(a:ImportArtifact):ImportNativeProfile|undefined{
 const f=a.facts
 if(a.kind==='character'){
  const bigFive=v2Json(f,'bigFive',bigFiveInput.nullable(),null)
  return {kind:'character',value:{height:v2Text(f,'height'),weight:v2Text(f,'weight'),build:v2Text(f,'build'),faceShape:v2Text(f,'faceShape'),tastes:v2Text(f,'tastes'),habits:v2Text(f,'habits'),dialogueStyle:v2Text(f,'dialogueStyle'),sampleDialogue:v2Text(f,'sampleDialogue'),personalityTags:v2Json(f,'personalityTags',z.array(z.string().trim().min(1).max(30)).max(20),[]),motivations:v2Json(f,'motivations',motivationInput,[]),desires:v2Text(f,'desires'),fears:v2Text(f,'fears'),beliefs:v2Json(f,'beliefs',beliefsInput,{}) as Record<string,string>,bigFive:bigFive&&Object.keys(bigFive).length?bigFive as Record<string,number>:null,abilities:v2Text(f,'abilities'),backstory:v2Text(f,'backstory'),arcStages:v2Json(f,'arcStages',z.array(arcStageInput).max(50),[]).map(stage=>({id:stage.id,name:stage.name,chapterIndex:stage.chapterIndex??null,description:stage.description??'',tags:stage.tags??[],markers:stage.markers??[],changes:stage.changes??[],isDebut:stage.isDebut??false}))}}
 }
 if(a.kind==='scene')return {kind:'scene',value:{exteriorDescription:v2Text(f,'exteriorDescription'),interiorDescription:v2Text(f,'interiorDescription'),backstory:v2Text(f,'backstory'),entryMethod:v2Text(f,'entryMethod')}}
 if(a.kind==='item'){
  const trimmed=(values:string[],count:number,length:number)=>values.map(v=>v.trim()).filter(Boolean).map(v=>[...v].slice(0,length).join('')).slice(0,count)
  return {kind:'item',value:{appearance:v2Text(f,'appearance'),acquisition:v2Text(f,'acquisition'),effects:v2Json(f,'effects',z.array(z.object({name:z.string().max(100),description:z.string().trim().min(1).max(2000)}).strict()).max(20),[]),aliases:trimmed(v2Json(f,'aliases',z.array(z.string()).max(100),[]),10,50),tags:trimmed(v2Json(f,'tags',z.array(z.string()).max(100),[]),8,20)}}
 }
 if(a.kind==='theme'){
  if(a.id!==IMPORT_THEME_PROFILE_ID||a.name!==IMPORT_THEME_PROFILE_NAME)return fail('主题定位产物标识无效')
  const text=(key:'sellingPoints'|'targetAudience'|'synopsis')=>{const v=v2Text(f,key).trim();if([...v].length>IMPORT_THEME_PROFILE_LIMITS[key])return fail('主题定位字段过长');return v}
  const tags=v2Json(f,'tags',z.array(z.string().trim().min(1).max(IMPORT_THEME_PROFILE_LIMITS.tag)).max(IMPORT_THEME_PROFILE_LIMITS.tags),[])
  const channel=v2Text(f,'channel'),genre=v2Text(f,'genre')
  // docs/545: a genre of both channels may wait for its channel (the request asks for it); tags still need one.
  if(!channel&&(tags.length||genre&&!themePositionValid({channel:'不限',genre,tags:[]})))return fail('主题定位缺少频道')
  if(channel&&!themePositionValid({channel,genre:genre||'全部',tags}))return fail('主题定位的频道、题材或标签无效')
  return {kind:'theme',value:{channel,genre:channel?genre||'全部':'',tags:[...new Set(tags)],sellingPoints:text('sellingPoints'),targetAudience:text('targetAudience'),synopsis:text('synopsis')}}
 }
 return undefined
}
/** Same rules as the theme panel for a new position (src/lib/creation-wizard/position.ts). */
function themePositionValid(p:{channel:string;genre:string;tags:string[]}){return positionError({...p,length:''})===null}
function validateImportSemanticArtifactV1(a:ImportArtifact,mode:ImportSemanticMode):ImportSemanticArtifact{
 validateShape(a);if(mode!=='strict'&&mode!=='source-copy')return fail('导入语义映射模式无效')
 if(mode==='source-copy'&&a.origin!=='source')return fail('原资料复制模式不能用于推断或确认产物')
 const f=a.facts,mappingWarnings:ImportMappingWarning[]=[],warn=(fields:string[],reason:string)=>mappingWarnings.push({artifactId:a.id,fields,reason}),unsupported=Object.keys(f).filter(key=>!importFactFields(a.kind,a.schema).includes(key))
 if(unsupported.length){if(mode==='strict')return fail('导入语义含未支持的业务字段，不能静默映射');warn(unsupported,'原资料字段尚未映射；完整材料保留')}
 const result:ImportSemanticArtifact={native:null,knowledge:knowledge(f,mode==='strict'&&(a.kind==='worldline'||a.kind==='narrative')),mappingWarnings,inferred:mode==='strict'&&a.origin==='inferred'}
 if(a.kind==='character'){
  let roleType=f.roleType as 'PROTAGONIST'|'SUPPORTING'|'ANTAGONIST'
  const unknownRole=!has(f,'roleType')
  if(unknownRole&&mode==='source-copy'){roleType='SUPPORTING';warn(['roleType'],'导入时角色类型未确认；配角仅为存储兼容位')}
  else if(!['PROTAGONIST','SUPPORTING','ANTAGONIST'].includes(roleType))return fail('角色类型缺失或无效，不能默认配角')
  result.native={kind:'character',roleType,aliases:f.aliases===undefined?[]:json(z.array(string),f.aliases,'角色别名'),age:f.age??'',gender:f.gender??'',occupation:f.occupation??'',bio:a.text,personality:f.personality??'',appearance:f.appearance??'',clothing:f.clothing??'',catchphrase:f.catchphrase??'',growthArc:f.growthArc??'',relationships:f.relationships===undefined?[]:json(z.array(relationshipSchema),f.relationships,'角色关系'),extra:{importArtifactId:a.id,...(unknownRole?{importMapping:{version:1,mode:'source-copy',unconfirmed:['roleType'],artifactId:a.id} as ImportSourceMapping}:{})}}
 }else if(a.kind==='scene'){
  if(f.entityType!=='PLACE'){if(mode==='source-copy'){warn(['entityType'],'导入时地点结构映射未确认');return result}return fail('地点必须明确PLACE类型，事件不能存为地点')}
  if(has(f,'parentId')&&!f.parentId.trim())return fail('地点父引用无效')
  result.native={kind:'scene',entityType:'PLACE',parentId:f.parentId??null,coordinates:f.coordinates??'',description:a.text}
 }else if(a.kind==='world'){
  if(f.entityType==='WORLD'){
   if(['worldId','settingType','content'].some(key=>has(f,key)))return fail('世界节点不能携带Setting字段')
   if(has(f,'parentId')&&!f.parentId.trim())return fail('世界父引用无效')
   result.native={kind:'world',entityType:'WORLD',parentId:f.parentId??null,description:a.text}
  }else if(f.entityType==='SETTING'){
   if(!f.worldId?.trim()||!IMPORT_WORLD_SETTING_TYPES.includes(f.settingType as ImportWorldSettingType)){if(mode==='source-copy'){warn(['worldId','settingType'],'导入时世界归属或结构映射未确认');return result}return fail('世界设定缺少有效世界归属或类型')}
   if(has(f,'parentId')&&(f.settingType!=='MAP'||!f.parentId.trim()))return fail('世界设定父引用仅允许MAP')
   let rawContent:unknown=f.content
   if(f.content===undefined&&mode==='source-copy'){
    if(['CONCEPT','FACTION'].includes(f.settingType)){warn(['content'],'导入时结构映射未确认；完整材料保留');return result}
    rawContent=f.settingType==='LEVEL_SYSTEM'?{scope:'GENERAL',form:'SINGLE',description:a.text,rules:'',levels:[],pathways:[]}:{text:a.text}
   }
   let content:SettingContent
   try{content=decodeImportWorldContent(f.settingType,rawContent)}catch(error){if(mode!=='source-copy')throw error;warn(['content'],'导入时结构映射未确认；完整材料保留');return result}
   if(f.content===undefined&&f.settingType==='LEVEL_SYSTEM')warn(['content'],'结构节点未提取；完整介绍保留')
   result.native={kind:'world',entityType:'SETTING',worldId:f.worldId,settingType:f.settingType as ImportWorldSettingType,parentId:f.parentId??null,content}
  }else if(mode==='source-copy')warn(['entityType'],'导入时世界结构映射未确认；未制造世界或空设定')
  else return fail('世界节点必须明确WORLD或SETTING类型')
 }else if(a.kind==='worldline'){
  if(mode==='strict'&&(!f.lineId?.trim()||!f.lineName?.trim()||f.people===undefined||!['unknown','exact','window'].includes(f.timeKind)))return fail('世界事件缺少类型、时间或角色结构')
  if(f.people!==undefined)json(z.array(nonempty),f.people,'世界事件角色引用')
  if(f.eventId!==undefined&&f.eventId!==a.id)return fail('世界事件ID引用不一致')
  if(f.timeKind!==undefined&&!['unknown','exact','window'].includes(f.timeKind))return fail('事件时间类型无效')
  if(f.timeKind==='unknown'&&(has(f,'timeValue')||has(f,'timeEnd')))return fail('未知事件时间不得制造数值')
  if(f.timeKind==='exact'||f.timeKind==='window'){if(!f.timeValue?.trim()||!Number.isFinite(Number(f.timeValue)))return fail('事件时间数值无效');if(f.timeKind==='window'&&(!f.timeEnd?.trim()||!Number.isFinite(Number(f.timeEnd))||Number(f.timeEnd)<Number(f.timeValue)))return fail('事件时间范围无效');if(f.timeKind==='exact'&&has(f,'timeEnd'))return fail('确定事件时间不能混入候选窗口')}
 }else if(a.kind==='narrative'){
  if(mode==='strict'&&(!integer(f.chapterIndex)||!integer(f.order)||f.refs===undefined))return fail('叙事缺少章节或顺序结构')
  if(f.chapterIndex!==undefined&&!integer(f.chapterIndex)||f.order!==undefined&&!integer(f.order))return fail('叙事章节或顺序结构无效')
  if(f.refs!==undefined)for(const ref of json(z.array(referenceSchema),f.refs,'叙事引用'))knowledge(ref as unknown as Record<string,string>,true)
 }else if(a.kind==='trope'&&!['SATISFACTION','TEAR'].includes(f.tropeKind)){
  if(mode==='source-copy'){warn(['tropeKind'],'导入时爽点类型未确认；完整材料保留');return result}
  return fail('爽点类型缺失或无效')
 }
 return result
}
/** Identity includes actual typed ancestry; names alone cannot merge different
 * spaces/worlds or turn a thematic setting into a World. */
export function importSemanticIdentity(a:ImportArtifact,mode:ImportSemanticMode='strict',sceneRegistry?:ReadonlyMap<string,string>){
 let native:ImportNativeProjection|null
 try{native=validateImportSemanticArtifact(a,mode).native}catch(error){if(mode!=='source-copy'||!isImportRawSourceArtifact(a))throw error;native=null}
 if(a.kind==='scene'&&sceneRegistry){if(!sceneRegistry.has(a.id))throw Error('场景身份未注册，请先确认具体地点');return importHash({kind:a.kind,id:a.id,identity:sceneRegistry.get(a.id)})}
 if(a.kind==='scene')return importHash({kind:a.kind,name:a.name,entityType:native?.kind==='scene'?'PLACE':null,parentId:native?.kind==='scene'?native.parentId:null,...(!native?{unmappedId:a.id}:{})})
 if(a.kind==='world')return importHash({kind:a.kind,name:a.name,...(native?.kind==='world'?(native.entityType==='WORLD'?{entityType:'WORLD',parentId:native.parentId}:{entityType:'SETTING',worldId:native.worldId,settingType:native.settingType,parentId:native.parentId}):{unmappedId:a.id})})
 return importHash({kind:a.kind,name:a.name,...(['worldline','narrative'].includes(a.kind)?{id:a.id}:{})})
}
/** The supplied catalog is the current import's complete bounded catalog. No
 * name fallback is used for parent/relationship foreign keys. */
export function validateImportSemanticReferences(artifacts:ImportArtifact[],sourceCopyIds:readonly string[]=[]){
 const lookup=new Map<string,ImportArtifact>(),decoded=new Map<string,ImportSemanticArtifact>()
 for(const a of artifacts){if(lookup.has(a.id))return fail('导入实体ID重复，引用不明确');lookup.set(a.id,a);decoded.set(a.id,validateImportSemanticArtifact(a,sourceCopyIds.includes(a.id)?'source-copy':'strict'))}
 const requireType=(id:string,kind:ImportTarget)=>{const target=lookup.get(id);if(!target||target.kind!==kind)return fail('导入实体引用类型或归属无效');return target}
 const character=(value:string)=>{const direct=lookup.get(value);if(direct){if(direct.kind!=='character')return fail('导入角色引用类型无效');return}const matches=artifacts.filter(a=>a.kind==='character'&&a.name===value);if(matches.length!==1)return fail('导入角色引用不存在或同名不明确')}
 const parents=new Map<string,string>()
 for(const a of artifacts){const f=a.facts,native=decoded.get(a.id)!.native
  for(const [field,kind] of [['characterId','character'],['sceneId','scene'],['itemId','item']] as const)if(f[field]!==undefined)requireType(f[field],kind)
  if(native?.kind==='character')for(const relation of native.relationships)if(relation.characterId)requireType(relation.characterId,'character')
  if(native?.kind==='scene'&&native.parentId){const parent=requireType(native.parentId,'scene');if(decoded.get(parent.id)?.native?.kind!=='scene')return fail('地点父引用未映射');parents.set(a.id,parent.id)}
  if(native?.kind==='world'&&native.entityType==='WORLD'&&native.parentId){const parent=requireType(native.parentId,'world'),p=decoded.get(parent.id)?.native;if(p?.kind!=='world'||p.entityType!=='WORLD')return fail('父世界引用必须为WORLD');parents.set(a.id,parent.id)}
  if(native?.kind==='world'&&native.entityType==='SETTING'){
   const w=requireType(native.worldId,'world'),worldNative=decoded.get(w.id)?.native;if(worldNative?.kind!=='world'||worldNative.entityType!=='WORLD')return fail('世界设定归属引用必须为WORLD')
   if(native.parentId){const parent=requireType(native.parentId,'world'),p=decoded.get(parent.id)?.native;if(p?.kind!=='world'||p.entityType!=='SETTING'||p.settingType!=='MAP'||p.worldId!==native.worldId)return fail('MAP父引用必须为同一世界MAP');parents.set(a.id,parent.id)}
  }
  if(a.kind==='worldline'){if(f.parentId){requireType(f.parentId,'worldline');parents.set(a.id,f.parentId)}if(f.people!==undefined)for(const id of json(z.array(nonempty),f.people,'世界事件角色引用'))character(id)}
  if(a.kind==='narrative'){if(f.narrator)character(f.narrator);if(f.refs!==undefined)for(const ref of json(z.array(referenceSchema),f.refs,'叙事引用')){requireType(ref.eventId,'worldline');if(ref.character)requireType(ref.character,'character')}}
 }
 const complete=new Set<string>(),active=new Set<string>()
 const visit=(id:string)=>{if(active.has(id))return fail('导入父引用存在循环或自引用');if(complete.has(id))return;active.add(id);const parent=parents.get(id);if(parent)visit(parent);active.delete(id);complete.add(id)}
 for(const id of parents.keys())visit(id)
}
/** docs/542: knowledge (reliability, attribution, time scope) stays structured in facts, the import record and the
 * native telling/ref reliability; author-visible prose never carries a "（可靠性：…；信息来源：…）" note. */
export const IMPORT_KNOWLEDGE_LABELS=['可靠性','信息来源','信息归属','适用时间范围','适用时段'] as const
const annotationLabel=IMPORT_KNOWLEDGE_LABELS.join('|')
// Detection and removal share one definition (docs/544 H2): an opening bracket, spaces/tabs only, a fixed label and a colon.
const annotationHead=new RegExp(`^[ \\t]*(?:${annotationLabel})[ \\t]*[：:]`,'u')
export const IMPORT_KNOWLEDGE_ANNOTATION=new RegExp(`[（(][ \\t]*(?:${annotationLabel})[ \\t]*[：:]`,'u')
const ANNOTATION_MAX=2000
/** One linear pass (docs/544 H1). A block is removed only when it opens with a fixed label, closes on the same line
 * within ANNOTATION_MAX characters with balanced brackets, and every ；/; separated part is "label：value". Anything
 * else (unclosed, ordinary bracketed prose) is kept verbatim (docs/544 M1). A line left blank by removal is dropped. */
export function stripImportKnowledgeAnnotations(text:string):string{
 if(!IMPORT_KNOWLEDGE_ANNOTATION.test(text))return text
 const lines=text.split('\n'),out:string[]=[]
 for(const line of lines){const next=stripLine(line);if(next===line||next.trim())out.push(next)}
 return out.join('\n')
}
function stripLine(line:string):string{
 let result='',i=0
 while(i<line.length){
  const c=line[i]
  if((c==='（'||c==='(')&&annotationHead.test(line.slice(i+1,i+1+40))){
   const end=closingBracket(line,i)
   if(end>0&&annotationBodyValid(line.slice(i+1,end))){result=result.replace(/[ \t]+$/u,'');i=end+1;while(i<line.length&&(line[i]===' '||line[i]==='\t'))i++;continue}
  }
  result+=c;i++
 }
 return result
}
function closingBracket(line:string,start:number):number{
 let depth=0
 for(let i=start;i<line.length&&i-start<=ANNOTATION_MAX;i++){const c=line[i];if(c==='（'||c==='(')depth++;else if(c==='）'||c===')'){depth--;if(depth===0)return i}}
 return -1
}
function annotationBodyValid(body:string):boolean{
 // Split on top-level ；/; only; nested brackets belong to a value.
 const parts:string[]=[];let depth=0,from=0
 for(let i=0;i<body.length;i++){const c=body[i];if(c==='（'||c==='(')depth++;else if(c==='）'||c===')')depth--;else if(depth===0&&(c==='；'||c===';')){parts.push(body.slice(from,i));from=i+1}}
 parts.push(body.slice(from))
 return parts.every(part=>!part.trim()||annotationHead.test(part))
}
/** Kept as an identity projection for callers and old audits; knowledge is never written into prose (docs/542). */
export function qualifyImportKnowledgeText(text:string,_value:ImportKnowledge){return text}
/** Called after strict decode/normalization. Preserve native identities and
 * structure, and attach only supplied knowledge to descriptive editor fields. */
export interface ImportWorldProjectionLimits {maxBytes?:number;maxFields?:number}
const MAX_WORLD_PROJECTION_BYTES=16*1024*1024,MAX_WORLD_PROJECTION_FIELDS=100000,MAX_WORLD_STRUCTURE_NODES=1000000,MAX_WORLD_STRUCTURE_DEPTH=256
/** Count output without cloning content or building repeated prefixes. String
 * bytes follow JSON escaping, including controls and UTF-16 surrogate pairs. */
export function assertImportWorldContentProjectionBudget(content:SettingContent,value:ImportKnowledge,limits:ImportWorldProjectionLimits={}):{bytes:number;fields:number}{
 const maxBytes=limits.maxBytes??MAX_WORLD_PROJECTION_BYTES,maxFields=limits.maxFields??MAX_WORLD_PROJECTION_FIELDS,overflow=()=>fail('世界设定投影超过容量上限，完整原资料仍需保留')
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>MAX_WORLD_PROJECTION_BYTES||!Number.isSafeInteger(maxFields)||maxFields<1||maxFields>MAX_WORLD_PROJECTION_FIELDS)overflow()
 const add=(a:number,b:number)=>{const result=a+b;if(!Number.isSafeInteger(result)||result>maxBytes)overflow();return result}
 const escaped=(text:string,quoted=true)=>{let bytes=quoted?2:0;for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);let n:number;if(c===34||c===92||[8,9,10,12,13].includes(c))n=2;else if(c<32)n=6;else if(c<128)n=1;else if(c<2048)n=2;else if(c>=0xd800&&c<=0xdbff){const next=text.charCodeAt(i+1);if(next>=0xdc00&&next<=0xdfff){n=4;i++}else n=6}else n=c>=0xdc00&&c<=0xdfff?6:3;bytes=add(bytes,n)}return bytes}
 // docs/542: published content carries no knowledge prefix, so the knowledge value adds no bytes.
 void value;const prefixBytes=0
 let fields=0,nodes=0;const field=(text:string,always=false)=>{if(always||text.trim()){if(++fields>maxFields)overflow()}},node=(depth:number)=>{if(depth>MAX_WORLD_STRUCTURE_DEPTH||++nodes>MAX_WORLD_STRUCTURE_NODES)overflow()}
 const level=(l:LevelNode,depth:number)=>{node(depth);field(l.description);field(l.condition);for(const a of l.abilities){node(depth+1);field(a.description)}for(const child of l.children)level(child,depth+1)}
 if('text'in content)field(content.text,true)
 else if('concepts'in content){if(content.concepts.length>maxFields)overflow();for(const c of content.concepts)field(c.explanation,true)}
 else if('factions'in content){if(content.factions.length>maxFields)overflow();for(const f of content.factions){field(f.description,true);field(f.relations)}}
 else if('scope'in content){field(content.description,true);field(content.rules);for(const l of content.levels)level(l,1);for(const p of content.pathways){node(1);field(p.description);for(const l of p.levels)level(l,2)}}
 nodes=0;const active=new Set<object>()
 const jsonBytes=(item:unknown,depth:number):number=>{node(depth);if(item===null||item===undefined)return 4;if(typeof item==='string')return escaped(item);if(typeof item==='boolean')return item?4:5;if(typeof item==='number')return Number.isFinite(item)?String(item).length:4;if(typeof item!=='object'||active.has(item))return overflow();active.add(item);let bytes=2,entries=0
  if(Array.isArray(item)){for(const entry of item){if(entries++)bytes=add(bytes,1);bytes=add(bytes,jsonBytes(entry,depth+1))}}
  else{for(const key of Object.keys(item)){const entry=(item as Record<string,unknown>)[key];if(entry===undefined)continue;if(entries++)bytes=add(bytes,1);bytes=add(bytes,escaped(key)+1);bytes=add(bytes,jsonBytes(entry,depth+1))}}
  active.delete(item);return bytes
 }
 const increment=fields*prefixBytes;if(!Number.isSafeInteger(increment)||increment>maxBytes)overflow()
 return {bytes:add(jsonBytes(content,0),increment),fields}
}
/** World content is published as decoded (docs/542): a clone within the same capacity gate, without knowledge notes. */
export function qualifyImportWorldContent(content:SettingContent,_value:ImportKnowledge,limits?:ImportWorldProjectionLimits):SettingContent{
 assertImportWorldContentProjectionBudget(content,{},limits)
 return mapImportWorldContentText(content,text=>text)
}
/** Applies one text transform to every prose field of a world setting content, keeping its structure. */
export function mapImportWorldContentText(content:SettingContent,map:(text:string)=>string):SettingContent{
 const result=structuredClone(content)
 const level=(node:LevelNode)=>{node.description=map(node.description);node.condition=map(node.condition);for(const ability of node.abilities)ability.description=map(ability.description);node.children.forEach(level)}
 if('text' in result)result.text=map(result.text)
 else if('concepts' in result)for(const c of result.concepts)c.explanation=map(c.explanation)
 else if('factions' in result)for(const f of result.factions){f.description=map(f.description);f.relations=map(f.relations)}
 else if('scope' in result){result.description=map(result.description);result.rules=map(result.rules);result.levels.forEach(level);for(const p of result.pathways){p.description=map(p.description);p.levels.forEach(level)}}
 return result
}
/** Every author-visible prose value of a world setting content (for the publish gate). */
export function importWorldContentTexts(content:SettingContent):string[]{const out:string[]=[];mapImportWorldContentText(content,text=>{out.push(text);return text});return out}
export const importArtifactSemanticHash=(a:ImportArtifact)=>importHash(a)
const evidenceSchema=z.object({unitId:nonempty,quote:nonempty}).strict()
const textEditSchema=z.object({start:z.number().int().nonnegative(),end:z.number().int().nonnegative(),before:string,after:string}).strict()
export const importArtifactEditSchema=z.object({artifactId:nonempty,baseHash:nonempty,textEdits:z.array(textEditSchema).optional(),setFacts:z.record(z.string(),string).optional(),unsetFacts:z.array(nonempty).optional(),reason:nonempty,evidence:z.array(evidenceSchema).min(1)}).strict()
/** Apply sparse fields/text only after every target, exact range, lock and
 * evidence validates. Native values and references still require the complete
 * wrapper or the adapter's typed catalog gate. No workingProse is accepted. */
export function applyImportArtifactFieldEdits(artifacts:ImportArtifact[],rawEdits:unknown[],context:ImportArtifactEditContext):ImportArtifact[]{
 const edits=rawEdits.map(value=>parsed(importArtifactEditSchema,value,'设定修订')),original=new Map(artifacts.map(a=>[a.id,a]))
 if(original.size!==artifacts.length)return fail('设定修订目标ID重复')
 const groups=new Map<string,ImportArtifactEdit[]>()
 for(const edit of edits){const a=original.get(edit.artifactId);if(!a||context.targetIds&&!context.targetIds.includes(edit.artifactId))return fail('设定修订含范围外目标');if(edit.baseHash!==importArtifactSemanticHash(a))return fail('设定修订基础版本已变化');if(a.origin==='source')return fail('原始来源材料不能由设定修订改写');validateImportEvidence({facts:{},evidence:edit.evidence},context.units);const group=groups.get(a.id)??[];group.push(edit);groups.set(a.id,group)}
 const result=artifacts.map(a=>{
  const group=groups.get(a.id);if(!group)return structuredClone(a)
  const next=structuredClone(a),set=new Map<string,string>(),unset=new Set<string>(),ranges:ImportArtifactTextEdit[]=[]
  const locks=(context.locks??[]).filter(lock=>lock.artifactId===a.id)
  for(const lock of locks)if((lock.field==='text'?a.text:a.facts[lock.field])!==lock.value)return fail('设定修订锁定字段版本不匹配')
  const checkField=(field:string)=>{if(!importFactFields(a.kind,a.schema).includes(field))return fail('设定修订包含未支持字段');if(['entityType','settingType'].includes(field))return fail('设定修订不能改变实体类型');if(locks.some(lock=>lock.field===field))return fail('设定修订不能改变作者锁定字段')}
  for(const edit of group){
   for(const [field,value] of Object.entries(edit.setFacts??{})){checkField(field);if(unset.has(field)||set.has(field)&&set.get(field)!==value)return fail('设定修订同字段提案冲突');set.set(field,value)}
   for(const field of edit.unsetFacts??[]){checkField(field);if(set.has(field))return fail('设定修订set与unset字段冲突');unset.add(field)}
   for(const range of edit.textEdits??[]){if(locks.some(lock=>lock.field==='text'))return fail('设定修订不能改变作者锁定文字');if(range.end<range.start||!safeImportBoundary(a.text,range.start)||!safeImportBoundary(a.text,range.end)||a.text.slice(range.start,range.end)!==range.before)return fail('设定修订文字范围、字符边界或before不匹配');if(!ranges.some(old=>importHash(old)===importHash(range)))ranges.push(range)}
   for(const evidence of edit.evidence)if(!next.evidence.some(old=>old.unitId===evidence.unitId&&old.quote===evidence.quote))next.evidence.push({...evidence})
   next.sourceUnitIds=[...new Set([...next.sourceUnitIds,...edit.evidence.map(e=>e.unitId)])]
  }
  ranges.sort((a,b)=>a.start-b.start||a.end-b.end)
  for(let i=1;i<ranges.length;i++)if(ranges[i].start<ranges[i-1].end||ranges[i].start===ranges[i-1].start)return fail('设定修订文字范围重叠或冲突')
  for(const range of [...ranges].reverse())next.text=next.text.slice(0,range.start)+range.after+next.text.slice(range.end)
  for(const field of unset)delete next.facts[field]
  for(const [field,value] of set)next.facts[field]=value
  return next
 })
 return result
}
/** Full-artifact commit gate. The field primitive also serves bounded adapter
 * fragments, where only the submitted ranges/fields can be checked. A fragment
 * proposal is never proof that the complete artifact is ready to commit. */
export function applyImportArtifactEdits(artifacts:ImportArtifact[],rawEdits:unknown[],context:ImportArtifactEditContext):ImportArtifact[]{
 const result=applyImportArtifactFieldEdits(artifacts,rawEdits,context)
 if(rawEdits.length)validateImportSemanticReferences(result,context.sourceCopyIds)
 return result
}
