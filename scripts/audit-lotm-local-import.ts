import {createHash} from 'node:crypto'
import {constants} from 'node:fs'
import {open,lstat,readdir,realpath,mkdir} from 'node:fs/promises'
import {join,resolve,dirname,relative,isAbsolute} from 'node:path'
import {parseArgs} from 'node:util'
import {z} from 'zod'
import type {ImportSession,ImportArtifact} from '../desktop/shared/novel-import'
import {importHash,importPlanHash,importBudgetAudit,sourceBody,validateImportCoverage,validateImportEvidence,workingImportUnits,safeImportBoundary} from '../desktop/core/novel-import'
import {validateImportBudgetState} from '../desktop/core/novel-import-budget-policy'
import {importSemanticAudit,importSemanticInputHash,importSemanticDecisionHash,importSemanticResultHash,importNativeMappings,validateImportSemanticState} from '../desktop/core/novel-import-semantic-state'
import {importReviewTaskKeys} from '../desktop/core/novel-import-review-tasks'
import {stripImportKnowledgeAnnotations,IMPORT_WORLD_SETTING_TYPES,importLengthClass,importThemeSynopsisFallback} from '../desktop/core/novel-import-semantics'
import {validateDetailedOutlines} from '../desktop/core/novel-import-outline'
import {loadMigrations} from '../desktop/service/database/migrations'
import {validatePlanning} from '../src/lib/planning/domain'
import {realNovelSemanticAssertions} from './real-novel-semantic-assertions'
import {workManifestSchema} from '../desktop/shared/workspace'

export class LotmLocalAuditFailure extends Error {constructor(readonly code:string){super(code)}}
export const LOTM_LOCAL_TARGETS=['outline','theme','style','character','item','scene','world','foreshadow','trope','worldline','narrative'] as const
export const AUDIT_LOCAL_BUILD_FILES=['prisma/schema.prisma','desktop/core/novel-import-chapters.ts','desktop/core/novel-import-structure.ts','desktop/core/novel-import-outline.ts','desktop/core/novel-import-runtime-proof.ts','desktop/core/novel-import.ts','desktop/shared/novel-import.ts','desktop/main/novel-import.ts','desktop/main/novel-import-files.ts','desktop/service/novel-import-publish.ts','desktop/service/novel-import-ai.ts','desktop/core/novel-import-ai-payload.ts','desktop/core/novel-import-review-tasks.ts','desktop/core/novel-import-budget-policy.ts','desktop/core/novel-import-semantics.ts','desktop/core/novel-import-semantic-state.ts','src/components/desktop/NovelImportDialog.tsx','dist/main/index.cjs','dist/service/index.cjs','dist/preload/index.cjs','.next/BUILD_ID'] as const
const LOTM_LOCAL_COUNTS=[213,269,250,214,204,116,87,41,8] as const
const LOTM_LOCAL_VOLUME_NAMES=['小丑','无面人','旅行家','不死者','红祭司','逐光者','倒吊人','愚者','番外'] as const
const MAX_BYTES=1024*1024*1024
const sha=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex')
const equal=(a:unknown,b:unknown)=>importHash(a)===importHash(b)
const hex=/^[a-f0-9]{64}$/u,uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u
const utf8=(bytes:Uint8Array)=>new TextDecoder('utf-8',{fatal:true}).decode(bytes)
const within=(path:string,root:string)=>{const r=relative(root,path);return r===''||!isAbsolute(r)&&r!=='..'&&!r.startsWith('../')}
const field=(v:any,names:readonly string[])=>Object.fromEntries(names.filter(name=>Object.hasOwn(v,name)).map(name=>[name,v[name]]))
const multi=(values:unknown[])=>values.map(importHash).sort()
const time=(value:unknown)=>typeof value==='string'?Date.parse(value):value instanceof Date?value.getTime():NaN
function requireAudit(condition:unknown,code:string):asserts condition{if(!condition)throw new LotmLocalAuditFailure(code)}
function auditCall(code:string,run:()=>void){try{run()}catch(error){if(error instanceof LotmLocalAuditFailure)throw error;throw new LotmLocalAuditFailure(code)}}
function projectSession(value:any):ImportSession{
 const s=field(value,['version','semanticVersion','chapterVersion','id','revision','epoch','phase','title','files','units','selected','targets','infer','artifacts','conflicts','patches','originalProse','workingProse','workingRevision','workingUnits','chapters','steps','coverage','notFound','decisions','createdAt','updatedAt','publication','budgetPolicy','legacyBudget','semanticState','mappingWarnings','chapterDetection','detailedOutlineIds'])
 if(Array.isArray(s.files))s.files=s.files.map((f:any)=>field(f,['id','name','format','path','bytes','hash','text','encoding','requiresEncodingConfirmation','included','error','parts']))
 return s as unknown as ImportSession
}
function fileIdentity(s:any){return {device:String(s.dev),inode:String(s.ino),size:String(s.size),mtime:String(s.mtimeNs),ctime:String(s.ctimeNs),mode:Number(s.mode),links:Number(s.nlink)}}
async function directory(path:string){
 requireAudit(isAbsolute(path)&&resolve(path)===path,'DIRECTORY_PATH_INVALID')
 const ancestors:{path:string;device:string;inode:string}[]=[]
 for(let at=path;;at=dirname(at)){const s=await lstat(at,{bigint:true});requireAudit(s.isDirectory()&&!s.isSymbolicLink(),'DIRECTORY_LINK_OR_TYPE');ancestors.push({path:at,device:String(s.dev),inode:String(s.ino)});if(dirname(at)===at)break}
 requireAudit(await realpath(path)===path,'DIRECTORY_ALIAS');const s=await lstat(path,{bigint:true});return {device:String(s.dev),inode:String(s.ino),ancestors}
}
async function readObserved(path:string,max=MAX_BYTES):Promise<{bytes:Buffer;identity:unknown}>{
 const parent=await directory(dirname(path));const before=await lstat(path,{bigint:true});requireAudit(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1n&&before.size<=BigInt(max),'FILE_LINK_TYPE_OR_LIMIT')
 const h=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW)
 try{const opened=await h.stat({bigint:true});requireAudit(equal(fileIdentity(before),fileIdentity(opened)),'INPUT_REPLACED');const bytes=await h.readFile(),after=await h.stat({bigint:true}),leaf=await lstat(path,{bigint:true});requireAudit(equal(fileIdentity(opened),fileIdentity(after))&&equal(fileIdentity(after),fileIdentity(leaf)),'INPUT_CHANGED');requireAudit(equal(parent,await directory(dirname(path))),'INPUT_PARENT_CHANGED');return {bytes,identity:{file:fileIdentity(after),parent}}}finally{await h.close()}
}
async function readSafe(path:string,max=MAX_BYTES):Promise<Buffer>{return (await readObserved(path,max)).bytes}
async function missing(path:string,code='EXPECTED_ABSENT_PATH_EXISTS'){try{await lstat(path);throw new LotmLocalAuditFailure(code)}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e}}
async function optional(path:string){try{return await readSafe(path,128*1024)}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e}}
async function exclusive(path:string,value:string|Uint8Array){const h=await open(path,'wx',0o600);try{await h.writeFile(value);await h.sync()}finally{await h.close()}}

export async function describeLocalAuditBuild(repo:string):Promise<any>{
 await directory(repo);const migrations=await loadMigrations(join(repo,'prisma/migrations')),files=[]
 for(const m of migrations)files.push({id:m.id,checksum:m.checksum,rawSha256:sha(await readSafe(join(repo,'prisma/migrations',m.id,'migration.sql')))})
 const sha256:Record<string,string>={};for(const file of AUDIT_LOCAL_BUILD_FILES)sha256[file]=sha(await readSafe(join(repo,file)))
 return {sha256,migrations:{sha256:importHash(files),files},pgliteVersion:(await JSON.parse(utf8(await readSafe(join(__dirname,'../node_modules/@electric-sql/pglite/package.json'),1024*1024)))).version}
}

export interface LocalAuditPrepared {run:any;original:string;body:string;chapters:any[];nonNarrative:any;minimum:any}
export function verifyLocalPrepared(bundle:any):LocalAuditPrepared{
 const {run,source,expectedBody,expectedChapters:chapters,nonNarrative,minimum}=bundle
 requireAudit(run?.schemaVersion===1&&run.expectedChapterCount===1402&&run.volumeCount===9&&equal(run.volumeChapterCounts,LOTM_LOCAL_COUNTS)&&equal(run.volumeNames,LOTM_LOCAL_VOLUME_NAMES),'FROZEN_COUNTS_INVALID')
 requireAudit(source instanceof Uint8Array&&expectedBody instanceof Uint8Array&&sha(source)===run.sourceSha256&&['gb18030','utf-8'].includes(run.sourceEncoding),'FROZEN_SOURCE_IDENTITY_INVALID')
 requireAudit(sha(expectedBody)===run.expectedBodySha256,'FROZEN_BODY_IDENTITY_INVALID')
 let original:string
 try{original=new TextDecoder(run.sourceEncoding,{fatal:true}).decode(source)}catch{throw new LotmLocalAuditFailure('FROZEN_SOURCE_IDENTITY_INVALID')}
 let body:string
 try{body=utf8(expectedBody)}catch{throw new LotmLocalAuditFailure('FROZEN_BODY_IDENTITY_INVALID')}
 requireAudit(original.length===4_803_440&&original.length===run.sourceCharacters&&source.byteLength===run.sourceBytes,'FROZEN_SOURCE_IDENTITY_INVALID')
 requireAudit(body.length===4_785_312&&body.length===run.expectedBodyCharacters&&Buffer.byteLength(body)===run.expectedBodyBytes,'FROZEN_BODY_IDENTITY_INVALID')
 requireAudit(Array.isArray(minimum?.minimumChecks)&&minimum.minimumChecks.length===45&&new Set(minimum.minimumChecks.map((x:any)=>x.id)).size===45,'SEMANTIC_MINIMUM_INVALID')
 requireAudit(nonNarrative?.schemaVersion===1&&Array.isArray(nonNarrative.bodySegments)&&nonNarrative.bodySegments.length===9&&Array.isArray(nonNarrative.intervals)&&nonNarrative.intervals.length<=64,'NON_NARRATIVE_GEOMETRY_MISMATCH')
 const gaps=[...nonNarrative.intervals].sort((a,b)=>a.start-b.start);let sourceAt=0,bodyAt=0,gapAt=0
 const consume=(limit:number)=>{while(gapAt<gaps.length&&gaps[gapAt].start===sourceAt){const gap=gaps[gapAt];requireAudit(gap.index===gapAt+1&&gap.classification==='non-narrative'&&gap.end>gap.start&&gap.end<=limit&&safeImportBoundary(original,gap.start)&&safeImportBoundary(original,gap.end)&&sha(original.slice(gap.start,gap.end))===gap.textSha256,'NON_NARRATIVE_GEOMETRY_MISMATCH');sourceAt=gap.end;gapAt++}}
 for(let v=0;v<9;v++){
  const segment=nonNarrative.bodySegments[v];consume(segment.start)
  requireAudit(sourceAt===segment.start&&segment.volume===v+1&&segment.name===LOTM_LOCAL_VOLUME_NAMES[v]&&segment.bodyStart===bodyAt&&segment.end>segment.start&&segment.bodyEnd>segment.bodyStart&&segment.end-segment.start===segment.bodyEnd-segment.bodyStart,'NON_NARRATIVE_GEOMETRY_MISMATCH')
  const text=original.slice(segment.start,segment.end)
  requireAudit(safeImportBoundary(original,segment.start)&&safeImportBoundary(original,segment.end)&&safeImportBoundary(body,segment.bodyStart)&&safeImportBoundary(body,segment.bodyEnd)&&text===body.slice(segment.bodyStart,segment.bodyEnd)&&sha(text)===segment.textSha256,'NON_NARRATIVE_GEOMETRY_MISMATCH')
  sourceAt=segment.end;bodyAt=segment.bodyEnd
 }
 consume(original.length);requireAudit(sourceAt===original.length&&bodyAt===body.length&&gapAt===gaps.length,'NON_NARRATIVE_GEOMETRY_MISMATCH')
 requireAudit(Array.isArray(chapters)&&chapters.length===1402,'FROZEN_CHAPTER_ORACLE_MISMATCH')
 let index=0
 for(let v=0;v<9;v++){
  const segment=nonNarrative.bodySegments[v];sourceAt=segment.start;bodyAt=segment.bodyStart
  for(let position=1;position<=LOTM_LOCAL_COUNTS[v];position++){
   const c=chapters[index++]
   requireAudit(c&&c.index===index&&c.volume===v+1&&c.volumeName===LOTM_LOCAL_VOLUME_NAMES[v]&&c.positionInVolume===position&&typeof c.title==='string'&&!!c.title.trim(),'FROZEN_CHAPTER_ORACLE_MISMATCH')
   const prefix=position===1?original.slice(sourceAt,c.sourceStart):''
   requireAudit(c.start===bodyAt&&(position===1?c.sourceStart>=sourceAt:c.sourceStart===sourceAt)&&c.end>c.start&&c.sourceEnd>c.sourceStart&&c.end-c.start===prefix.length+c.sourceEnd-c.sourceStart&&safeImportBoundary(original,c.sourceStart)&&safeImportBoundary(original,c.sourceEnd)&&safeImportBoundary(body,c.start)&&safeImportBoundary(body,c.end),'FROZEN_CHAPTER_ORACLE_MISMATCH')
   const raw=original.slice(c.sourceStart,c.sourceEnd),fromSource=prefix+raw,fromBody=body.slice(c.start,c.end)
   const titleAt=position===1?raw.indexOf(c.title):0
   requireAudit(fromSource===fromBody&&(sha(raw)===c.sourceDecodedUtf8Sha256||titleAt>=0&&sha(raw.slice(titleAt))===c.sourceDecodedUtf8Sha256)&&sha(fromBody)===c.expectedUtf8Sha256,'FROZEN_CHAPTER_ORACLE_MISMATCH')
   sourceAt=c.sourceEnd;bodyAt=c.end
  }
  requireAudit(sourceAt===segment.end&&bodyAt===segment.bodyEnd,'FROZEN_CHAPTER_ORACLE_MISMATCH')
 }
 requireAudit(Array.isArray(run.knownMojibake)&&run.knownMojibake.every((entry:any)=>Number.isSafeInteger(entry.chapterIndex)&&entry.chapterIndex>=1&&entry.chapterIndex<=1402&&typeof entry.text==='string'&&entry.text.length>0&&body.slice(chapters[entry.chapterIndex-1].start,chapters[entry.chapterIndex-1].end).includes(entry.text)),'FROZEN_CHAPTER_ORACLE_MISMATCH')
 return {run,original,body,chapters,nonNarrative,minimum}
}

function verifySourceUnits(s:ImportSession,p:LocalAuditPrepared){
 const merge=(units:{kind:string;start:number;end:number}[])=>{const result:{kind:string;start:number;end:number}[]=[];for(const unit of units){const previous=result.at(-1);if(previous&&previous.kind===unit.kind&&previous.end===unit.start)previous.end=unit.end;else result.push({kind:unit.kind,start:unit.start,end:unit.end})}return result},groups=merge([...s.units].sort((a,b)=>a.start-b.start)),expected:{kind:string;start:number;end:number}[]=[],gaps=[...p.nonNarrative.intervals].sort((a,b)=>a.start-b.start)
 let sourceAt=0,gapAt=0
 for(const segment of p.nonNarrative.bodySegments){while(gapAt<gaps.length&&gaps[gapAt].start===sourceAt&&gaps[gapAt].end<=segment.start){const gap=gaps[gapAt++];expected.push({kind:'excluded',start:gap.start,end:gap.end});sourceAt=gap.end}expected.push({kind:'body',start:segment.start,end:segment.end});sourceAt=segment.end}
 while(gapAt<gaps.length&&gaps[gapAt].start===sourceAt){const gap=gaps[gapAt++];expected.push({kind:'excluded',start:gap.start,end:gap.end});sourceAt=gap.end}
 requireAudit(equal(groups,merge(expected)),'SOURCE_UNIT_GEOMETRY_MISMATCH')
}

export function verifyLocalCompleted(s:ImportSession,p:LocalAuditPrepared,binding:{sessionId:string;run:string;workId?:string}):void{
 requireAudit(binding.run===p.run.run&&Date.parse(s.createdAt)>Date.parse(p.run.frozenAt)&&Date.parse(s.updatedAt)>=Date.parse(s.createdAt),'SESSION_FROZEN_TIME_OR_RUN_MISMATCH')
 requireAudit(s?.id===binding.sessionId&&s.phase==='completed'&&Number.isSafeInteger(s.revision)&&s.revision>0&&s.semanticVersion===1&&s.chapterVersion===2,'COMPLETED_SESSION_REQUIRED')
 requireAudit(s.publication?.requestId===s.id&&uuid.test(s.publication.workId??'')&&!!s.publication.novelId&&hex.test(s.publication.hash??'')&&(!binding.workId||s.publication.workId===binding.workId),'PUBLICATION_IDENTITY_INVALID')
 requireAudit(s.files.length===1&&s.files[0].included&&!s.files[0].error&&!s.files[0].requiresEncodingConfirmation&&s.files[0].format==='txt'&&s.files[0].path===p.run.sourcePath&&s.files[0].hash===p.run.sourceSha256&&s.files[0].bytes===p.run.sourceBytes&&s.files[0].text===p.original,'SESSION_SOURCE_MISMATCH')
 requireAudit(equal(s.selected,['body'])&&s.infer===true&&equal([...s.targets].sort(),[...LOTM_LOCAL_TARGETS].sort())&&Array.isArray(s.notFound)&&s.notFound.length===0&&s.workingRevision===0&&!s.patches.length,'COMPLETED_TARGETS_INVALID')
 requireAudit(!s.artifacts.some(a=>a.kind==='goldenFinger')&&!s.targets.includes('goldenFinger' as any),'UNEXPECTED_GOLD_FINGER')
 requireAudit(s.artifacts.every(a=>a.origin!=='source'&&LOTM_LOCAL_TARGETS.includes(a.kind as any))&&LOTM_LOCAL_TARGETS.every(kind=>s.artifacts.some(a=>a.kind===kind)),'TARGET_ARTIFACTS_INCOMPLETE')
 requireAudit(s.conflicts.every(c=>c.status==='resolved'),'CONFLICTS_UNRESOLVED')
 requireAudit(s.originalProse===p.body&&s.workingProse===p.body&&s.chapters.map(c=>c.content).join('')===p.body,'SESSION_BODY_MISMATCH')
 auditCall('SOURCE_UNIT_GEOMETRY_MISMATCH',()=>validateImportCoverage(s));verifySourceUnits(s,p)
 requireAudit(sourceBody(s)===p.body,'SOURCE_UNIT_GEOMETRY_MISMATCH')
 const working=workingImportUnits(s);let at=0
 for(const unit of working){requireAudit(unit.kind==='body'&&unit.start===at&&unit.text===p.body.slice(unit.start,unit.end)&&safeImportBoundary(p.body,unit.start)&&safeImportBoundary(p.body,unit.end),'WORKING_SOURCE_GEOMETRY_INVALID');at=unit.end}
 requireAudit(at===p.body.length,'WORKING_SOURCE_GEOMETRY_INCOMPLETE')
 const ids=working.map(u=>u.id).sort()
 for(const target of LOTM_LOCAL_TARGETS)requireAudit(equal([...(s.coverage[target]??[])].sort(),ids),'TARGET_COVERAGE_INCOMPLETE')
 requireAudit(equal([...(s.coverage.review??[])].sort(),ids),'REVIEW_COVERAGE_INCOMPLETE')
 let reviewKeys:string[]=[];auditCall('REVIEW_COVERAGE_INCOMPLETE',()=>{reviewKeys=importReviewTaskKeys(s)})
 requireAudit(equal([...(s.coverage.reviewFacts??[])].sort(),reviewKeys.sort()),'REVIEW_COVERAGE_INCOMPLETE')
 auditCall('IMPORT_BUDGET_INVALID',()=>validateImportBudgetState(s));auditCall('SEMANTIC_STATE_INVALID',()=>validateImportSemanticState(s))
 const state=s.semanticState
 requireAudit(state?.stage==='ready'&&state.inputHash===importSemanticInputHash(s)&&state.decisionHash===importSemanticDecisionHash(s)&&state.workingRevision===0&&state.verifiedHash===importSemanticResultHash(s),'SEMANTIC_BINDING_INCOMPLETE')
 requireAudit(state.persistentConflicts.length===0&&state.repairs.every(r=>r.committed&&r.original.id===r.artifactId&&importHash(r.original)===r.baseHash&&r.tasks.every(t=>t.done))&&state.omissions.every(o=>o.done&&equal([...o.unitIds].sort(),[...(o.completedUnitIds??[])].sort())),'SEMANTIC_TASKS_INCOMPLETE')
 requireAudit(importPlanHash(s)===s.publication.hash,'CHECKPOINT_HASH_MISMATCH')
 let mapping:ReturnType<typeof importNativeMappings>
 try{mapping=importNativeMappings(s)}catch{throw new LotmLocalAuditFailure('NATIVE_MAPPING_INVALID')}
 requireAudit(equal(s.mappingWarnings??[],mapping.mappingWarnings),'MAPPING_WARNING_BINDING_INVALID')
 requireAudit(LOTM_LOCAL_TARGETS.every(kind=>s.artifacts.some(a=>a.kind===kind&&mapping.projectable.has(a.id))),'TARGET_ARTIFACTS_INCOMPLETE')
 for(const a of s.artifacts)auditCall('ARTIFACT_EVIDENCE_INVALID',()=>validateImportEvidence(a,[...s.units,...working]))
 requireAudit(s.chapters.length===1402&&new Set(s.chapters.map(c=>c.id)).size===1402&&s.chapters.every((c,i)=>{const e=p.chapters[i];return c.title===e.title&&c.start===e.start&&c.end===e.end&&c.volume===e.volumeName&&c.content===p.body.slice(e.start,e.end)&&sha(c.content)===e.expectedUtf8Sha256}),'CHECKPOINT_CHAPTER_ORACLE_MISMATCH')
 auditCall('DETAILED_OUTLINE_INCOMPLETE',()=>validateDetailedOutlines(s));requireAudit(Object.keys(s.detailedOutlineIds??{}).length===1402&&s.chapters.every(c=>!!c.outline?.trim()),'DETAILED_OUTLINE_INCOMPLETE')
}

export function verifyLocalShutdown(e:any,s:ImportSession,b:any,run:string,binding?:{runDir:string;appRoot:string;workRoot:string;repo:string}):void{
 const receipt=s.publication
 requireAudit(b?.run===run&&b.sessionId===s.id&&uuid.test(b.launchId??'')&&Number.isSafeInteger(b.appPid)&&b.appPid>0&&Number.isFinite(time(b.launchedAt))&&b.workId===receipt?.workId&&b.novelId===receipt?.novelId&&b.importHash===receipt?.hash,'FINAL_BUILD_LAUNCH_BINDING_REQUIRED')
 if(binding)requireAudit(b.runDir===binding.runDir&&b.appRoot===binding.appRoot&&b.workRoot===binding.workRoot&&b.repo===binding.repo,'FINAL_BUILD_LAUNCH_BINDING_REQUIRED')
 requireAudit(e?.run===run&&e.sessionId===s.id&&e.launchId===b.launchId&&e.appPid===b.appPid&&e.workId===receipt?.workId&&e.novelId===receipt?.novelId&&e.importHash===receipt?.hash&&e.normalExit===true&&e.exitCode===0&&time(e.exitedAt)>=time(s.updatedAt)&&time(s.updatedAt)>=time(b.launchedAt),'CURRENT_NORMAL_EXIT_REQUIRED')
 if(binding)requireAudit(e.runDir===binding.runDir&&e.appRoot===binding.appRoot&&e.workRoot===binding.workRoot,'CURRENT_NORMAL_EXIT_REQUIRED')
}

export interface LocalAuditResult {mechanicalPassed:boolean;literaryStatus:'NOT RUN';counts:Record<string,number>;retryExerciseStatus:'not-exercised';transactionIsolation?:string;transactionReadOnly?:boolean;assertions:{name:string;passed:boolean}[];[key:string]:unknown}
const SNAPSHOT_FIELDS=['version','chapterVersion','semanticVersion','semanticAudit','sourceCopyIds','mappingWarnings','importBudget','id','title','createdAt','sourceKinds','targets','modified','summary','materials','decisions','originalProse','workingProse','sources','coverage','notFound','importHash'] as const
function expectedSnapshot(s:ImportSession,p:LocalAuditPrepared,mapping:ReturnType<typeof importNativeMappings>){
 const material=s.artifacts.map(a=>({...a,characters:a.text.length}))
 return {version:1,chapterVersion:2,semanticVersion:1,semanticAudit:importSemanticAudit(s),sourceCopyIds:mapping.sourceCopyIds,mappingWarnings:mapping.mappingWarnings,importBudget:importBudgetAudit(s),id:s.id,title:s.title,createdAt:s.createdAt,sourceKinds:s.selected,targets:s.targets,modified:false,summary:{source:0,inferred:s.artifacts.length,decisions:s.decisions.length},materials:material,decisions:s.decisions,originalProse:p.body,workingProse:p.body,sources:s.files.filter(f=>f.included).map(f=>({name:f.name,format:f.format,hash:f.hash})),coverage:s.coverage,notFound:s.notFound,importHash:s.publication!.hash}
}
function expectedOutlineCard(chapter:any,index:number){return {id:'import-chapter-card-'+chapter.id,line:'import-reading-line',parent:null,order:index,title:chapter.title,type:'event',tellings:[{id:'import-telling-'+chapter.id,character:null,narrator:'待定',intent:chapter.outline,materialRefs:[],source:'导入大纲',reliability:'客观事实',refs:[],beats:[]}],chapter:chapter.id,wordBudget:null,narrateSummary:false,tags:[],jump:null}}
function narrativeRefsResolve(rows:any){const data=rows.planning[0]?.data,events=new Set((data?.events??[]).map((e:any)=>e.line+'\0'+e.id));return (data?.cards??[]).every((c:any)=>(c.tellings??[]).every((t:any)=>(t.refs??[]).every((r:any)=>events.has(r.line+'\0'+r.event))))}
function semanticFailure(assertions:{name:string;passed:boolean}[],rows:any):void{
 const failed=assertions.filter(a=>!a.passed);if(!failed.length)return
 const has=(fragment:string)=>failed.some(a=>a.name.includes(fragment))
 if(has('character-two-pass-relationships'))throw new LotmLocalAuditFailure('NATIVE_CHARACTER_RELATIONSHIP_MISMATCH')
 if(has('map-parent-only-map'))throw new LotmLocalAuditFailure('NATIVE_MAP_PARENT_MISMATCH')
 if(has('nine-world-setting'))throw new LotmLocalAuditFailure('NATIVE_WORLD_SETTING_MISMATCH')
 if(has('world-event'))throw new LotmLocalAuditFailure('NATIVE_WORLD_EVENT_MISMATCH')
 if(has('narrative-persisted-reliability'))throw new LotmLocalAuditFailure('NATIVE_NARRATIVE_RELIABILITY_MISMATCH')
 if(has('narrative-ref-event'))throw new LotmLocalAuditFailure('NATIVE_NARRATIVE_REFS_MISMATCH')
 if(has('narrative-character-reliability-chapter-order')||has('narrative-intents'))throw new LotmLocalAuditFailure('NATIVE_NARRATIVE_STRUCTURE_MISMATCH')
 if(has('planning-native-document-valid')&&!narrativeRefsResolve(rows))throw new LotmLocalAuditFailure('NATIVE_NARRATIVE_REFS_MISMATCH')
 if(has('planning')||has('narrative-population'))throw new LotmLocalAuditFailure('NATIVE_PLANNING_PROJECTION_MISMATCH')
 throw new LotmLocalAuditFailure('NATIVE_SEMANTIC_ASSERTION_FAILED')
}

export function verifyLocalNativeRows(s:ImportSession,r:any,p:LocalAuditPrepared):LocalAuditResult{
 const novelId=s.publication?.novelId,assertions:{name:string;passed:boolean}[]=[]
 requireAudit(!!novelId&&r.novels.length===1&&r.novels[0].id===novelId&&r.novels[0].userId==='local-author'&&r.novels[0].title===s.title&&r.novels[0].currentStage==='WRITING','NATIVE_NOVEL_BINDING_MISMATCH')
 requireAudit(r.themes.length===1&&r.themes[0].novelId===novelId&&typeof r.themes[0].id==='string'&&!!r.themes[0].id&&Number.isFinite(time(r.themes[0].createdAt))&&Number.isFinite(time(r.themes[0].updatedAt)),'NATIVE_THEME_ROW_MISMATCH')
 const theme=r.themes[0],expectedTheme={title:s.title,synopsis:'',referenceCases:'',channel:'',genre:'',length:'' as string,authorPosition:null,tags:[],sellingPoints:'',targetAudience:'',version:1}
 let mapping:ReturnType<typeof importNativeMappings>
 try{mapping=importNativeMappings(s)}catch{throw new LotmLocalAuditFailure('NATIVE_MAPPING_INVALID')}
 const projected=s.artifacts.filter(a=>mapping.projectable.has(a.id)),qualified=(a:ImportArtifact)=>stripImportKnowledgeAnnotations(a.text),joined=(kind:ImportArtifact['kind'])=>projected.filter(a=>a.kind===kind).map(qualified).join('\n\n')
 expectedTheme.synopsis=importThemeSynopsisFallback(joined('theme'))
 // docs/542: the imported body length class is written with the theme row.
 if(s.chapters.length)expectedTheme.length=importLengthClass(s.chapters.reduce((n,c)=>n+Array.from(c.content).length,0))
 requireAudit(equal(field(theme,['title','synopsis','referenceCases','channel','genre','length','authorPosition','tags','sellingPoints','targetAudience','version']),expectedTheme),'NATIVE_THEME_ROW_MISMATCH')
 requireAudit(!r.settings.some((x:any)=>x.type==='GOLD_FINGER'),'UNEXPECTED_GOLD_FINGER')
 const styles=r.settings.filter((x:any)=>x.type==='STYLE')
 requireAudit(styles.length===1&&styles[0].novelId===novelId&&styles[0].name==='文风设定'&&styles[0].worldId===null&&styles[0].parentId===null&&equal(styles[0].content,{style:joined('style'),referenceCases:'',dialogueMark:'DOUBLE_QUOTE',innerDialogueMark:'NONE'}),'NATIVE_STYLE_ROW_MISMATCH')
 for(const type of IMPORT_WORLD_SETTING_TYPES)requireAudit(r.settings.some((x:any)=>x.type===type),'WORLD_SETTING_TYPES_INCOMPLETE')
 const expectedTropes=projected.filter(a=>a.kind==='trope').map(a=>({kind:a.facts.tropeKind,category:a.name,content:qualified(a),referenceCase:'',selected:true}))
 requireAudit(r.tropes.every((x:any)=>x.novelId===novelId)&&equal(multi(r.tropes.map((x:any)=>field(x,['kind','category','content','referenceCase','selected']))),multi(expectedTropes))&&['SATISFACTION','TEAR'].every(kind=>r.tropes.some((x:any)=>x.kind===kind)),'NATIVE_TROPE_MULTISET_MISMATCH')
 const own=[...r.volumes,...r.characters,...r.scenes,...r.items,...r.worlds,...r.settings,...r.foreshadows,...r.planning]
 requireAudit(own.every((x:any)=>x.novelId===novelId)&&r.chapters.every((c:any)=>r.volumes.some((v:any)=>v.id===c.volumeId)),'NATIVE_OWNERSHIP_MISMATCH')
 requireAudit(r.volumes.length===9&&r.volumes.every((v:any,i:number)=>v.index===i+1&&v.title===LOTM_LOCAL_VOLUME_NAMES[i]&&v.summary===(i===0?projected.filter(a=>a.kind==='outline'&&a.facts.chapterIndex===undefined).map(qualified).join('\n\n'):'')),'NATIVE_VOLUME_PROJECTION_MISMATCH')
 requireAudit(r.chapters.length===1402&&new Set(r.chapters.map((c:any)=>c.id)).size===1402,'NATIVE_CHAPTER_SEQUENCE_MISMATCH')
 for(const [i,c]of r.chapters.entries()){
  const e=p.chapters[i]
  requireAudit(c.volumeId===r.volumes[e.volume-1]?.id&&c.index===e.positionInVolume&&c.title===e.title&&c.status==='WRITTEN','NATIVE_CHAPTER_SEQUENCE_MISMATCH')
  requireAudit(c.content===p.body.slice(e.start,e.end)&&sha(c.content)===e.expectedUtf8Sha256,'NATIVE_CHAPTER_CONTENT_MISMATCH')
  requireAudit(c.wordCount===[...c.content].length,'NATIVE_CHAPTER_WORD_COUNT_MISMATCH')
 }
 requireAudit(r.chapters.map((c:any)=>c.content).join('')===p.body,'NATIVE_CHAPTER_CONTENT_MISMATCH')
 const expectedItems=projected.filter(a=>a.kind==='item').map(a=>({name:a.name,text:qualified(a)}))
 requireAudit(equal(multi(r.items.map((x:any)=>({name:x.name,text:x.description}))),multi(expectedItems)),'NATIVE_ITEM_MULTISET_MISMATCH')
 const expectedForeshadows=projected.filter(a=>a.kind==='foreshadow').map(a=>({name:a.name,text:qualified(a)}))
 requireAudit(equal(multi(r.foreshadows.map((x:any)=>({name:x.title,text:x.content}))),multi(expectedForeshadows)),'NATIVE_FORESHADOW_MULTISET_MISMATCH')
 requireAudit(r.settings.filter((x:any)=>x.type==='MAP').every((x:any)=>x.parentId===null||r.settings.some((parent:any)=>parent.id===x.parentId&&parent.type==='MAP'&&parent.worldId===x.worldId)),'NATIVE_MAP_PARENT_MISMATCH')
 semanticFailure(realNovelSemanticAssertions(s,r,{novelId:novelId!,sourceCopyIds:mapping.sourceCopyIds,projectableIds:mapping.projectableIds}),r)
 requireAudit(r.planning.length===1&&r.planning[0].novelId===novelId&&r.planning[0].version===1,'NATIVE_PLANNING_PROJECTION_MISMATCH')
 let plan:ReturnType<typeof validatePlanning>
 try{plan=validatePlanning(r.planning[0].data)}catch{throw new LotmLocalAuditFailure(narrativeRefsResolve(r)?'NATIVE_PLANNING_PROJECTION_MISMATCH':'NATIVE_NARRATIVE_REFS_MISMATCH')}
 requireAudit(equal(plan.lines,[{id:'import-reading-line',name:'导入作品',primary:true}]),'NATIVE_PLANNING_PROJECTION_MISMATCH')
 requireAudit(plan.volumes.length===9&&plan.volumes.every((v,i)=>equal(v,{id:r.volumes[i].id,line:'import-reading-line',title:r.volumes[i].title,summary:r.volumes[i].summary.length<=100000?r.volumes[i].summary:'原始大纲全文见导入记录',order:i})),'NATIVE_PLANNING_PROJECTION_MISMATCH')
 requireAudit(plan.chapters.length===1402&&plan.chapters.every((c,i)=>equal(c,{id:r.chapters[i].id,line:'import-reading-line',volume:r.chapters[i].volumeId,title:r.chapters[i].title,order:i,wordMin:0,wordBudget:Math.min(200000,Math.max(1,r.chapters[i].wordCount))})),'NATIVE_PLANNING_PROJECTION_MISMATCH')
 requireAudit(r.chapters.every((c:any)=>!!c.outline?.trim()),'NATIVE_PLANNING_PROJECTION_MISMATCH')
 const outlineChapters=r.chapters.filter((c:any)=>!!c.outline),outlineCards=plan.cards.filter(c=>c.id.startsWith('import-chapter-card-'))
 requireAudit(r.chapters.every((c:any,i:number)=>c.outline===(s.chapters[i].outline??''))&&outlineCards.length===outlineChapters.length&&outlineChapters.every((c:any)=>{const i=r.chapters.indexOf(c),actual=outlineCards.find(card=>card.id==='import-chapter-card-'+c.id);return equal(actual,expectedOutlineCard(c,i))}),'NATIVE_PLANNING_PROJECTION_MISMATCH')
 requireAudit(r.versions.length===1&&typeof r.versions[0].id==='string'&&/^c[a-z0-9]{20,80}$/u.test(r.versions[0].id)&&r.versions[0].targetType==='NOVEL_IMPORT'&&r.versions[0].targetId===novelId&&r.versions[0].version===1&&r.versions[0].reason==='导入作品'&&Number.isFinite(time(r.versions[0].createdAt)),'CONTENT_VERSION_BINDING_INVALID')
 const snapshot=r.versions[0].snapshot
 requireAudit(snapshot&&equal(Object.keys(snapshot).sort(),[...SNAPSHOT_FIELDS].sort())&&equal(snapshot,expectedSnapshot(s,p,mapping)),'SNAPSHOT_BINDING_INVALID')
 requireAudit(r.mutations.length===1,'CONTENT_MUTATION_BINDING_INVALID');const m=r.mutations[0]
 requireAudit(typeof m.id==='string'&&/^c[a-z0-9]{20,80}$/u.test(m.id)&&Number.isFinite(time(m.createdAt))&&m.novelId===novelId&&m.userId==='local-author'&&m.targetType==='NOVEL_IMPORT'&&m.targetId===novelId&&m.operationId==='novel-import:'+s.id&&m.requestHash===s.publication?.hash&&m.afterHash===s.publication?.hash&&m.beforeHash===importHash(null)&&m.beforeVersion===0&&m.afterVersion===1&&equal(m.result,{novelId,requestId:s.id,importHash:s.publication?.hash}),'CONTENT_MUTATION_BINDING_INVALID')
 assertions.push({name:'native-mechanical-persistence-complete',passed:true},{name:'literary-semantics-not-claimed-by-mechanical-audit',passed:true})
 return {mechanicalPassed:true,literaryStatus:'NOT RUN',counts:Object.fromEntries(Object.entries(r).filter(([,v])=>Array.isArray(v)).map(([k,v])=>[k,(v as unknown[]).length])),retryExerciseStatus:'not-exercised',assertions}
}

interface TreeEntry {path:string;type:'directory'|'file';identity:any;sha256?:string}
export async function captureLocalAuditTree(root:string):Promise<TreeEntry[]>{
 const result:TreeEntry[]=[]
 async function visit(path:string){const id=await directory(path);result.push({path:relative(root,path),type:'directory',identity:id});const entries=await readdir(path,{withFileTypes:true});entries.sort((a,b)=>a.name.localeCompare(b.name));for(const entry of entries){const at=join(path,entry.name),st=await lstat(at,{bigint:true});requireAudit(!st.isSymbolicLink(),'DATABASE_LINK_REJECTED');if(st.isDirectory())await visit(at);else{requireAudit(st.isFile()&&st.nlink===1n,'DATABASE_SPECIAL_OR_HARDLINK');const bytes=await readSafe(at);result.push({path:relative(root,at),type:'file',identity:fileIdentity(st),sha256:sha(bytes)})}}requireAudit(equal(await directory(path),id),'DATABASE_DIRECTORY_CHANGED')}
 await visit(root);return result
}
const dirIdentity=z.object({path:z.string(),device:z.string(),inode:z.string()}).strict(),active=z.discriminatedUnion('kind',[z.object({kind:z.literal('original')}).strict(),z.object({kind:z.literal('candidate'),id:z.uuid(),directory:dirIdentity}).strict()]),storageState=z.object({schemaVersion:z.literal(1),workId:z.uuid(),revision:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),active,previous:z.object({active,backupId:z.uuid(),kind:z.literal('closed-source').optional()}).strict().nullable()}).strict()
export async function resolveLocalAuditStorage(root:string,workId:string):Promise<string>{
 await directory(root);const pointer=await optional(join(root,'shakeink-storage.json')),required=await optional(join(root,'shakeink-storage-required.json'))
 if(required){let marker:any;try{marker=z.object({schemaVersion:z.literal(1),workId:z.uuid(),required:z.literal(true)}).strict().parse(JSON.parse(utf8(required)))}catch{throw new LotmLocalAuditFailure('STORAGE_REQUIRED_MARKER_INVALID')}requireAudit(marker.workId===workId,'STORAGE_REQUIRED_WORK_MISMATCH')}
 if(!pointer){requireAudit(!required,'STORAGE_REQUIRED_POINTER_MISSING');return root}
 let parsed:any;try{parsed=z.object({state:storageState,sha256:z.string().regex(hex)}).strict().parse(JSON.parse(utf8(pointer)))}catch{throw new LotmLocalAuditFailure('STORAGE_POINTER_IDENTITY_INVALID')}const state=parsed.state;requireAudit(state.workId===workId&&parsed.sha256===sha(JSON.stringify(state)),'STORAGE_POINTER_IDENTITY_INVALID')
 for(const v of [state.active,state.previous?.active])if(v?.kind==='candidate')requireAudit(v.directory.path===join(root,'.shakeink-restores',v.id),'STORAGE_CANDIDATE_OUTSIDE_ALLOWED_SLOT')
 if(state.active.kind==='original')return root
 const id=await directory(state.active.directory.path);requireAudit(id.device===state.active.directory.device&&id.inode===state.active.directory.inode,'STORAGE_DIRECTORY_IDENTITY_CHANGED');return state.active.directory.path
}
export function verifyLocalMigrationRows(installed:any,migrations:any):void{requireAudit(Array.isArray(migrations?.files)&&migrations.sha256===importHash(migrations.files)&&equal(installed,migrations.files.map((f:any)=>({id:f.id,checksum:f.checksum}))),'DATABASE_MIGRATIONS_MISMATCH')}
export async function verifyLocalStableTree(root:string,expected:TreeEntry[]):Promise<void>{requireAudit(equal(expected,await captureLocalAuditTree(root)),'DATABASE_TREE_CHANGED')}

export interface LocalScratchAnchor {output:string;scratch:string;source:string;parent:string;outputIdentity:unknown;scratchIdentity:unknown;sourceIdentity:unknown;parentIdentity:unknown;scratchTree?:TreeEntry[]}
async function captureScratchAnchor(output:string,scratch:string,source:string):Promise<LocalScratchAnchor>{
 requireAudit(scratch===join(output,'scratch-database')&&!within(output,source)&&!within(source,output),'SCRATCH_SOURCE_OVERLAP')
 const parent=dirname(output);return {output,scratch,source,parent,parentIdentity:await directory(parent),outputIdentity:await directory(output),scratchIdentity:await directory(scratch),sourceIdentity:await directory(source)}
}
async function guardScratchAnchor(anchor:LocalScratchAnchor){
 requireAudit(anchor.scratch===join(anchor.output,'scratch-database')&&!within(anchor.output,anchor.source)&&!within(anchor.source,anchor.output),'SCRATCH_SOURCE_OVERLAP')
 try{requireAudit(equal(await directory(anchor.parent),anchor.parentIdentity)&&equal(await directory(anchor.output),anchor.outputIdentity)&&equal(await directory(anchor.scratch),anchor.scratchIdentity)&&equal(await directory(anchor.source),anchor.sourceIdentity),'AUDIT_DIRECTORY_REPLACED')}catch(error){if(error instanceof LotmLocalAuditFailure&&['DIRECTORY_LINK_OR_TYPE','DIRECTORY_ALIAS','AUDIT_DIRECTORY_REPLACED'].includes(error.code))throw new LotmLocalAuditFailure('SCRATCH_REPLACED');throw error}
}
const treePayload=(tree:TreeEntry[])=>tree.map(e=>({path:e.path,type:e.type,...(e.type==='file'?{size:e.identity.size,sha256:e.sha256}:{})}))
async function sealScratchAnchor(anchor:LocalScratchAnchor,sourceTree:TreeEntry[]):Promise<LocalScratchAnchor>{
 await guardScratchAnchor(anchor);const scratchTree=await captureLocalAuditTree(anchor.scratch);requireAudit(equal(treePayload(scratchTree),treePayload(sourceTree)),'SCRATCH_COPY_PAYLOAD_MISMATCH');await guardScratchAnchor(anchor);return {...anchor,scratchTree}
}
async function openAnchoredScratch<T>(anchor:LocalScratchAnchor,factory:(path:string)=>Promise<T>):Promise<T>{
 await guardScratchAnchor(anchor);requireAudit(Array.isArray(anchor.scratchTree),'SCRATCH_NOT_SEALED');await verifyLocalStableTree(anchor.scratch,anchor.scratchTree!);await guardScratchAnchor(anchor);return factory(anchor.scratch)
}

const COLUMNS={characters:'id,"novelId",name,"roleType",aliases,age,gender,occupation,bio,personality,appearance,clothing,catchphrase,"growthArc",relationships,extra',scenes:'id,"novelId",name,"parentId",coordinates,description',items:'id,"novelId",name,description',worlds:'id,"novelId",name,"parentId",description',settings:'id,"novelId",name,type,"worldId","parentId",content',foreshadows:'id,"novelId",title,content'} as const
const TABLES={characters:'Character',scenes:'Scene',items:'Item',worlds:'World',settings:'Setting',foreshadows:'Foreshadow'} as const
export interface LocalAuditHooks {beforeCopyEntry?:(entry:TreeEntry)=>void|Promise<void>;afterCopy?:()=>void|Promise<void>;beforeScratchOpen?:()=>void|Promise<void>;afterQuery?:()=>void|Promise<void>;beforeFinalVerification?:()=>void|Promise<void>;openScratch?:(path:string)=>Promise<any>}
async function readScratchRows(anchor:LocalScratchAnchor,novelId:string,migrations:any,hooks?:LocalAuditHooks):Promise<{rows:any;isolation:string;readOnly:boolean}>{
 const factory=hooks?.openScratch??(async(path:string)=>{const {PGlite}=await import('@electric-sql/pglite');return PGlite.create({dataDir:path,relaxedDurability:false})}),engine=await openAnchoredScratch(anchor,factory)
 try{return await engine.transaction(async(tx:any)=>{
  await tx.exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');await tx.exec('SET TRANSACTION READ ONLY')
  const mode:{rows:{transaction_read_only:string}[]}=await tx.query('SHOW transaction_read_only'),level:{rows:{transaction_isolation:string}[]}=await tx.query('SHOW transaction_isolation'),readOnly=mode.rows[0]?.transaction_read_only==='on',isolation=(level.rows[0]?.transaction_isolation??'').toUpperCase()
  requireAudit(readOnly&&isolation==='REPEATABLE READ','READ_ONLY_TRANSACTION_REQUIRED')
  const installed:{rows:{id:string;checksum:string}[]}=await tx.query('SELECT id,checksum FROM "_desktop_migrations" ORDER BY id');verifyLocalMigrationRows(installed.rows,migrations)
  const total:{rows:{n:number}[]}=await tx.query('SELECT count(*)::int AS n FROM "Novel"');requireAudit(total.rows[0]?.n===1,'SINGLE_OWN_NOVEL_DATABASE_REQUIRED')
  const rows:any={};rows.novels=(await tx.query('SELECT id,"userId",title,"currentStage" FROM "Novel" WHERE id=$1',[novelId])).rows
  rows.volumes=(await tx.query('SELECT id,"novelId","index",title,summary FROM "Volume" WHERE "novelId"=$1 ORDER BY "index",id',[novelId])).rows
  rows.chapters=(await tx.query('SELECT c.id,c."volumeId",c."index",c.title,c.outline,c.content,c."wordCount",c.status FROM "Chapter" c JOIN "Volume" v ON v.id=c."volumeId" WHERE v."novelId"=$1 ORDER BY v."index",c."index",c.id',[novelId])).rows
  rows.themes=(await tx.query('SELECT id,"novelId",title,synopsis,"referenceCases",channel,genre,length,"authorPosition",tags,"sellingPoints","targetAudience",version,"createdAt","updatedAt" FROM "Theme" WHERE "novelId"=$1',[novelId])).rows
  for(const key of Object.keys(TABLES)as(keyof typeof TABLES)[])rows[key]=(await tx.query(`SELECT ${COLUMNS[key]} FROM "${TABLES[key]}" WHERE "novelId"=$1 ORDER BY id`,[novelId])).rows
  rows.tropes=(await tx.query('SELECT id,"novelId",kind,category,content,"referenceCase",selected FROM "Trope" WHERE "novelId"=$1 ORDER BY id',[novelId])).rows
  rows.planning=(await tx.query('SELECT "novelId",version,data FROM "PlanningDocument" WHERE "novelId"=$1',[novelId])).rows
  rows.versions=(await tx.query('SELECT id,"targetType","targetId",version,snapshot,reason,"createdAt" FROM "ContentVersion" WHERE "targetType"=\'NOVEL_IMPORT\' AND "targetId"=$1 ORDER BY version,id',[novelId])).rows
  rows.mutations=(await tx.query('SELECT id,"userId","novelId","targetType","targetId","operationId","requestHash","beforeHash","afterHash","beforeVersion","afterVersion",result,"createdAt" FROM "ContentMutation" WHERE "novelId"=$1 AND "targetType"=\'NOVEL_IMPORT\' AND "targetId"=$1',[novelId])).rows
  return {rows,isolation,readOnly}
 })}finally{await engine.close()}
}

export interface LocalAuditBinding {runDir:string;appRoot:string;workRoot:string;repo:string;sessionId:string;run:string;label:string;appClosed:boolean;buildIdentity:string;shutdownEvidence:string;runSha256:string;runMetadata?:string;hooks?:LocalAuditHooks}
export async function auditLocalClosedWork(b:LocalAuditBinding):Promise<LocalAuditResult>{
 requireAudit(b?.appClosed===true,'NORMAL_APP_SHUTDOWN_REQUIRED');requireAudit(uuid.test(b.sessionId)&&/^[A-Za-z0-9_-]{1,80}$/u.test(b.label)&&/^[A-Za-z0-9_-]{1,100}$/u.test(b.run)&&hex.test(b.runSha256),'AUDIT_BINDING_INVALID')
 for(const path of [b.runDir,b.appRoot,b.workRoot,b.repo])await directory(path)
 requireAudit(!within(b.runDir,b.workRoot)&&!within(b.runDir,b.appRoot)&&!within(b.workRoot,b.runDir)&&!within(b.appRoot,b.runDir),'AUDIT_ROOT_OVERLAP')
 const output=join(b.runDir,b.label+'-audit');await missing(output,'AUDIT_OUTPUT_EXISTS')
 requireAudit(within(b.buildIdentity,b.runDir)&&within(b.shutdownEvidence,b.runDir)&&b.buildIdentity!==b.shutdownEvidence,'EXPLICIT_FINAL_BUILD_AND_SHUTDOWN_REQUIRED')
 const runPath=b.runMetadata??join(b.runDir,'run.json');requireAudit(within(runPath,b.runDir),'FROZEN_SOURCE_OUTSIDE_OWN_CORPUS')
 const tracked=new Map<string,string>(),trackedIdentity=new Map<string,unknown>()
 const frozen=async(path:string,max?:number)=>{const seen=await readObserved(path,max);tracked.set(path,sha(seen.bytes));trackedIdentity.set(path,seen.identity);return seen.bytes}
 const readFrozen=async(path:string,max?:number)=>JSON.parse(utf8(await frozen(path,max)))
 const scriptFile=join(__dirname,'audit-lotm-local-import.ts'),semanticHelper=join(__dirname,'real-novel-semantic-assertions.ts');await frozen(scriptFile,8*1024*1024);await frozen(semanticHelper,8*1024*1024)
 const runBytes=await frozen(runPath,4*1024*1024);requireAudit(sha(runBytes)===b.runSha256,'RUN_METADATA_CHANGED');const run=JSON.parse(utf8(runBytes));requireAudit(run.run===b.run&&run.runDir===b.runDir,'RUN_METADATA_CHANGED')
 for(const path of [run.sourcePath,run.expectedBodyPath,run.expectedChaptersPath,run.nonNarrativePath,run.semanticMinimumPath])requireAudit(typeof path==='string'&&within(path,b.runDir),'FROZEN_SOURCE_OUTSIDE_OWN_CORPUS')
 const build=await readFrozen(b.buildIdentity,8*1024*1024),closed=await readFrozen(b.shutdownEvidence,1024*1024)
 const journalDir=join(b.appRoot,'novel-imports',b.sessionId),journalPath=join(journalDir,'session.json');requireAudit(utf8(await frozen(join(journalDir,'.owner'),1024))==='shakeink-novel-import-v1\n'+b.sessionId+'\n','JOURNAL_OWNER_MISMATCH')
 const s=projectSession(await readFrozen(journalPath));requireAudit(s.phase==='completed'&&s.id===b.sessionId,'COMPLETED_SESSION_REQUIRED');verifyLocalShutdown(closed,s,build,b.run,b)
 const sourceBytes=await frozen(run.sourcePath),bodyBytes=await frozen(run.expectedBodyPath),chaptersBytes=await frozen(run.expectedChaptersPath),nonNarrativeBytes=await frozen(run.nonNarrativePath),minimumBytes=await frozen(run.semanticMinimumPath)
 requireAudit(sha(chaptersBytes)===run.expectedChaptersSha256&&sha(nonNarrativeBytes)===run.nonNarrativeSha256&&sha(minimumBytes)===run.semanticMinimumSha256,'INDEPENDENT_BASELINE_HASH_CHANGED')
 let prepared:LocalAuditPrepared
 try{prepared=verifyLocalPrepared({run,source:sourceBytes,expectedBody:bodyBytes,expectedChapters:JSON.parse(utf8(chaptersBytes)),nonNarrative:JSON.parse(utf8(nonNarrativeBytes)),minimum:JSON.parse(utf8(minimumBytes))})}catch(error){if(error instanceof SyntaxError)throw new LotmLocalAuditFailure('INDEPENDENT_BASELINE_HASH_CHANGED');throw error}
 verifyLocalCompleted(s,prepared,{sessionId:b.sessionId,run:b.run})
 const actualBuild=await describeLocalAuditBuild(b.repo);requireAudit(equal(actualBuild.sha256,build.sha256)&&equal(actualBuild.migrations,build.migrations)&&actualBuild.pgliteVersion===build.pgliteVersion,'FINAL_BUILD_OR_MIGRATIONS_CHANGED')
 const rawManifest=await readFrozen(join(b.workRoot,'shakeink-work.json'),4*1024*1024),parsedManifest=workManifestSchema.safeParse(rawManifest);requireAudit(parsedManifest.success,'OWN_WORK_MANIFEST_RECEIPT_MISMATCH');const manifest=parsedManifest.data,receipt=s.publication!
 requireAudit(manifest.phase==='ready'&&manifest.id===receipt.workId&&manifest.novelId===receipt.novelId&&manifest.requestId===s.id&&manifest.title===s.title&&manifest.requestHash===importHash({title:s.title,importHash:receipt.hash})&&Number.isFinite(time(manifest.createdAt)),'OWN_WORK_MANIFEST_RECEIPT_MISMATCH')
 const pointerPath=join(b.workRoot,'shakeink-storage.json'),requiredPath=join(b.workRoot,'shakeink-storage-required.json'),controls=await Promise.all([optional(pointerPath),optional(requiredPath)])
 for(const [i,path]of [pointerPath,requiredPath].entries())if(controls[i])await frozen(path,128*1024)
 for(const name of ['xuanxiang-work.json','xuanxiang-storage.json','xuanxiang-storage-required.json','.xuanxiang-lock'])await missing(join(b.workRoot,name))
 const storage=await resolveLocalAuditStorage(b.workRoot,manifest.id),db=join(storage,'database'),lock=join(b.workRoot,'.shakeink-lock');await missing(lock,'APPLICATION_STILL_OPEN')
 const before=await captureLocalAuditTree(db);requireAudit(!within(output,db)&&!within(db,output),'SCRATCH_SOURCE_OVERLAP');await mkdir(output,{mode:0o700});const scratch=join(output,'scratch-database');await mkdir(scratch,{mode:0o700})
 let anchor=await captureScratchAnchor(output,scratch,db);const copyDirs=new Map<string,unknown>([[scratch,anchor.scratchIdentity]])
 for(const entry of before){
  await guardScratchAnchor(anchor);await b.hooks?.beforeCopyEntry?.(entry);const source=join(db,entry.path),target=join(scratch,entry.path)
  if(entry.path)requireAudit(copyDirs.has(dirname(target))&&equal(await directory(dirname(target)),copyDirs.get(dirname(target))),'SCRATCH_COPY_PARENT_CHANGED')
  if(entry.type==='directory'){if(entry.path){await mkdir(target,{mode:0o700});copyDirs.set(target,await directory(target))}requireAudit(equal(await directory(source),entry.identity),'SOURCE_DIRECTORY_REPLACED')}
  else{let bytes:Buffer;try{bytes=await readSafe(source);requireAudit(sha(bytes)===entry.sha256&&equal(fileIdentity(await lstat(source,{bigint:true})),entry.identity),'SOURCE_CHANGED_DURING_COPY')}catch(error){if(error instanceof LotmLocalAuditFailure)throw new LotmLocalAuditFailure('SOURCE_CHANGED_DURING_COPY');throw error}await guardScratchAnchor(anchor);requireAudit(equal(await directory(dirname(target)),copyDirs.get(dirname(target))),'SCRATCH_COPY_PARENT_CHANGED');await exclusive(target,bytes)}
 }
 await b.hooks?.afterCopy?.();await verifyLocalStableTree(db,before);await missing(lock,'APPLICATION_STILL_OPEN');anchor=await sealScratchAnchor(anchor,before);await b.hooks?.beforeScratchOpen?.()
 const queried=await readScratchRows(anchor,receipt.novelId!,build.migrations,b.hooks),rows=queried.rows;await b.hooks?.afterQuery?.();const result=verifyLocalNativeRows(s,rows,prepared);result.transactionIsolation=queried.isolation;result.transactionReadOnly=queried.readOnly
 await b.hooks?.beforeFinalVerification?.()
 for(const [path,hash]of tracked){const seen=await readObserved(path);requireAudit(sha(seen.bytes)===hash&&equal(trackedIdentity.get(path),seen.identity),'FROZEN_FILE_CHANGED_DURING_AUDIT')}
 await verifyLocalStableTree(db,before);requireAudit(equal(controls,await Promise.all([optional(pointerPath),optional(requiredPath)])),'ORIGINAL_DATABASE_OR_POINTER_CHANGED');await missing(lock,'APPLICATION_STILL_OPEN');requireAudit(equal(actualBuild,await describeLocalAuditBuild(b.repo)),'BUILD_CHANGED_DURING_AUDIT')
 result.assertions.push({name:'original-inputs-and-database-unchanged',passed:true});result.mechanicalPassed=result.assertions.every(x=>x.passed)
 const identity={run:b.run,runDir:b.runDir,appRoot:b.appRoot,workRoot:b.workRoot,repo:b.repo,sessionId:s.id,workId:receipt.workId,novelId:receipt.novelId,revision:s.revision,importHash:receipt.hash,runSha256:b.runSha256,runMetadata:runPath,buildIdentitySha256:tracked.get(b.buildIdentity),shutdownEvidenceSha256:tracked.get(b.shutdownEvidence),journalSha256:tracked.get(journalPath),databaseSourceTreeHash:importHash(before),schemaSha256:build.sha256['prisma/schema.prisma'],migrations:build.migrations,scriptSha256:tracked.get(scriptFile),semanticConsumerAssertionsSha256:tracked.get(semanticHelper),pgliteVersion:actualBuild.pgliteVersion}
 const saveOutput=async(name:string,value:string|Uint8Array)=>{await guardScratchAnchor(anchor);await exclusive(join(output,name),value);await guardScratchAnchor(anchor)}
 await saveOutput('checkpoint-public.json',JSON.stringify(s)+'\n');await saveOutput('business-records.json',JSON.stringify({identity,rows:{...rows,versions:rows.versions.map((v:any)=>({...v,snapshot:field(v.snapshot,SNAPSHOT_FIELDS)}))}})+'\n');await saveOutput('ordered-body.txt',Buffer.from(rows.chapters.map((c:any)=>c.content).join(''),'utf8'));await saveOutput('assertions.json',JSON.stringify({identity,...result,literary:{status:'NOT RUN',scope:'45 minimum semantic checks and 1402 unit literary review require independent evidence'},scope:'Mechanical persistence only; no full-book literary PASS is claimed.'},null,2)+'\n')
 return result
}

async function main(){
 const {values}=parseArgs({options:{'run-dir':{type:'string'},'app-root':{type:'string'},'work-root':{type:'string'},repo:{type:'string'},'session-id':{type:'string'},run:{type:'string'},'run-sha256':{type:'string'},'run-metadata':{type:'string'},label:{type:'string'},'app-closed':{type:'boolean'},'build-identity':{type:'string'},'shutdown-evidence':{type:'string'},'describe-build':{type:'boolean'}},strict:true,allowPositionals:false})
 if(values['describe-build']){requireAudit(Object.keys(values).length===2&&typeof values.repo==='string','DESCRIBE_BUILD_ONLY');console.log(JSON.stringify(await describeLocalAuditBuild(resolve(values.repo))));return}
 const required=['run-dir','app-root','work-root','repo','session-id','run','run-sha256','label','build-identity','shutdown-evidence'] as const
 requireAudit(required.every(key=>typeof values[key]==='string'),'EXPLICIT_AUDIT_ARGUMENTS_REQUIRED')
 const result=await auditLocalClosedWork({runDir:values['run-dir']!,appRoot:values['app-root']!,workRoot:values['work-root']!,repo:values.repo!,sessionId:values['session-id']!,run:values.run!,runSha256:values['run-sha256']!,runMetadata:values['run-metadata'],label:values.label!,appClosed:values['app-closed']===true,buildIdentity:values['build-identity']!,shutdownEvidence:values['shutdown-evidence']!})
 console.log(JSON.stringify({status:result.mechanicalPassed?'mechanical-passed':'mechanical-failed',literaryStatus:result.literaryStatus,counts:result.counts,retryExerciseStatus:result.retryExerciseStatus}));if(!result.mechanicalPassed)process.exitCode=1
}
if(require.main===module)main().catch(error=>{console.error(JSON.stringify({status:'audit-blocked',code:error instanceof LotmLocalAuditFailure?error.code:'AUDIT_FAILED_PRIVATE_DETAILS_SUPPRESSED'}));process.exitCode=1})
