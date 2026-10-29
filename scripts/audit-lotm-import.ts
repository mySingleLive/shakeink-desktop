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
import {qualifyImportKnowledgeText} from '../desktop/core/novel-import-semantics'
import {loadMigrations} from '../desktop/service/database/migrations'
import {validatePlanning} from '../src/lib/planning/domain'
import {realNovelSemanticAssertions} from './real-novel-semantic-assertions'
import {workManifestSchema} from '../desktop/shared/workspace'
/** Closed-work LOTM mechanical audit. Original DB files are never opened by
 * an engine. No Workspaces initialization, model state, global DB or network. */
export class LotmAuditFailure extends Error {constructor(readonly code:string){super(code)}}
export const LOTM_TARGETS=['outline','character','item','scene','world','foreshadow','worldline','narrative'] as const
export const AUDIT_BUILD_FILES=['prisma/schema.prisma','desktop/core/novel-import-chapters.ts','desktop/core/novel-import.ts','desktop/shared/novel-import.ts','desktop/main/novel-import.ts','desktop/main/novel-import-files.ts','desktop/service/novel-import-publish.ts','desktop/service/novel-import-ai.ts','desktop/core/novel-import-ai-payload.ts','desktop/core/novel-import-review-tasks.ts','desktop/core/novel-import-budget-policy.ts','desktop/core/novel-import-semantics.ts','desktop/core/novel-import-semantic-state.ts','src/components/desktop/NovelImportDialog.tsx','dist/main/index.cjs','dist/service/index.cjs','dist/preload/index.cjs','.next/BUILD_ID'] as const

const sha=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex')
const equal=(a:unknown,b:unknown)=>importHash(a)===importHash(b)
const hex=/^[a-f0-9]{64}$/u,uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u
const COUNTS=[213,269,250,214,204,116,87,41],MAX_BYTES=1024*1024*1024
function requireAudit(condition:unknown,code:string):asserts condition{if(!condition)throw new LotmAuditFailure(code)}
const utf8=(bytes:Uint8Array)=>new TextDecoder('utf-8',{fatal:true}).decode(bytes)
const within=(path:string,root:string)=>{const r=relative(root,path);return r===''||!isAbsolute(r)&&r!=='..'&&!r.startsWith('../')}
const field=(v:any,names:readonly string[])=>Object.fromEntries(names.filter(name=>Object.hasOwn(v,name)).map(name=>[name,v[name]]))
function projectSession(value:any):ImportSession{
 const s=field(value,['version','semanticVersion','chapterVersion','id','revision','epoch','phase','title','files','units','selected','targets','infer','artifacts','conflicts','patches','originalProse','workingProse','workingRevision','workingUnits','chapters','steps','coverage','notFound','decisions','createdAt','updatedAt','publication','budgetPolicy','legacyBudget','semanticState','mappingWarnings','chapterDetection'])
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
async function readJson(path:string,max?:number):Promise<any>{return JSON.parse(utf8(await readSafe(path,max)))}
async function missing(path:string){try{await lstat(path);throw new LotmAuditFailure('EXPECTED_ABSENT_PATH_EXISTS')}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e}}
async function optional(path:string){try{return await readSafe(path,128*1024)}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e}}
async function exclusive(path:string,value:string|Uint8Array){const h=await open(path,'wx',0o600);try{await h.writeFile(value);await h.sync()}finally{await h.close()}}

/** Passive build description only. No database, model or app state access. */
export async function describeAuditBuild(repo:string):Promise<any>{
 await directory(repo);const migrations=await loadMigrations(join(repo,'prisma/migrations')),files=[]
 for(const m of migrations)files.push({id:m.id,checksum:m.checksum,rawSha256:sha(await readSafe(join(repo,'prisma/migrations',m.id,'migration.sql')))})
 const sha256:Record<string,string>={};for(const file of AUDIT_BUILD_FILES)sha256[file]=sha(await readSafe(join(repo,file)))
 return {sha256,migrations:{sha256:importHash(files),files},pgliteVersion:(await readJson(join(__dirname,'../node_modules/@electric-sql/pglite/package.json'),1024*1024)).version}
}

export interface AuditPrepared {run:any;body:string;main:string;chapters:any[];headers:any[];volumes:any[]}
export function verifyPrepared(bundle:any):AuditPrepared{
 const {run,downloaded,source,expectedBody,expectedChapters:chapters,headers,independentReview:review,minimum}=bundle
 requireAudit(run&&run.expectedChapterCount===1394&&run.volumeCount===8&&equal(run.volumeChapterCounts,COUNTS),'FROZEN_COUNTS_INVALID')
 requireAudit(sha(downloaded)===run.downloadedSourceSha256&&sha(source)===run.sourceSha256&&sha(expectedBody)===run.expectedBodySha256,'FROZEN_SOURCE_HASH_CHANGED')
 requireAudit(['gb18030','utf-8'].includes(run.downloadedEncoding),'FROZEN_ENCODING_INVALID')
 const original=new TextDecoder(run.downloadedEncoding,{fatal:true}).decode(downloaded),body=utf8(source)
 requireAudit(Buffer.from(source).equals(Buffer.from(expectedBody))&&body.length===run.expectedBodyCharacters&&Buffer.byteLength(body)===run.expectedBodyBytes,'FROZEN_BODY_IDENTITY_INVALID')
 requireAudit(Array.isArray(chapters)&&chapters.length===1394&&Array.isArray(headers)&&headers.length===8&&Array.isArray(review?.volumes)&&review.volumes.length===8&&Array.isArray(review?.chapters)&&review.chapters.length===1394&&minimum?.minimumChecks?.length===24,'INDEPENDENT_BASELINE_MISSING')
 const actualCounts=Array(8).fill(0),slices:string[]=[],main:string[]=[];let at=0,originalEnd=0
 for(let i=0;i<chapters.length;i++){
  const c=chapters[i],r=review.chapters[i],v=c.volume-1,h=headers[v],vol=review.volumes[v]
  requireAudit(Number.isSafeInteger(v)&&v>=0&&v<8&&c.index===i+1&&c.positionInVolume===++actualCounts[v]&&c.volumeName===vol.name,'CHAPTER_IDENTITY_INVALID')
  requireAudit(c.volume===r.volume&&c.positionInVolume===r.positionInVolume&&c.title===r.heading&&c.sourceStart===r.utf16Start&&c.sourceEnd===r.utf16End,'CHAPTER_ORACLE_MISMATCH')
  requireAudit(safeImportBoundary(original,c.sourceStart)&&safeImportBoundary(original,c.sourceEnd)&&c.sourceStart>=originalEnd&&c.sourceEnd>c.sourceStart&&c.start===at&&safeImportBoundary(body,c.end)&&c.end>c.start,'CHAPTER_RANGE_INVALID')
  const text=original.slice(c.sourceStart,c.sourceEnd),prefix=c.positionInVolume===1?h.text:''
  if(c.positionInVolume===1)requireAudit(h.volume===c.volume&&h.start===c.start&&h.end===h.start+h.text.length&&equal(h.sourceRange,vol.sourceNarrativeRange),'FROZEN_HEADER_BOUNDARY_INVALID')
  requireAudit(c.insertedHeaderCharacters===prefix.length&&sha(text)===c.sourceDecodedUtf8Sha256,'ORIGINAL_CHAPTER_CHANGED')
  const expected=prefix+text;requireAudit(body.slice(c.start,c.end)===expected&&sha(expected)===c.expectedUtf8Sha256,'DERIVED_CHAPTER_CHANGED')
  slices.push(expected);main.push(text);at=c.end;originalEnd=c.sourceEnd
 }
 requireAudit(equal(actualCounts,COUNTS)&&at===body.length&&slices.join('')===body&&sha(main.join(''))===run.mainNarrativeUtf8Sha256,'FULL_BODY_RECONSTRUCTION_FAILED')
 return {run,body,main:main.join(''),chapters,headers,volumes:review.volumes}
}

export function verifyCompleted(s:ImportSession,p:AuditPrepared,binding:{sessionId:string;run:string;workId?:string}):void{
 requireAudit(binding.run===p.run.run&&Date.parse(s.createdAt)>=Date.parse(p.run.frozenAt)&&Date.parse(s.updatedAt)>=Date.parse(s.createdAt),'SESSION_FROZEN_TIME_OR_RUN_MISMATCH')
 requireAudit(s?.id===binding.sessionId&&s.phase==='completed'&&Number.isSafeInteger(s.revision)&&s.revision>0&&s.semanticVersion===1&&s.chapterVersion===2,'COMPLETED_BOUND_SESSION_REQUIRED')
 requireAudit(s.publication?.requestId===s.id&&uuid.test(s.publication.workId??'')&&!!s.publication.novelId&&hex.test(s.publication.hash??'')&&(!binding.workId||s.publication.workId===binding.workId),'PUBLICATION_IDENTITY_INVALID')
 requireAudit(s.files.length===1&&s.files[0].included&&!s.files[0].error&&s.files[0].format==='txt'&&s.files[0].path===p.run.sourcePath&&s.files[0].hash===p.run.sourceSha256&&s.files[0].text===p.body,'SESSION_SOURCE_MISMATCH')
 requireAudit(equal(s.selected,['body'])&&s.infer&&equal([...s.targets].sort(),[...LOTM_TARGETS].sort())&&s.notFound.length===0&&s.artifacts.every(a=>a.origin!=='source'&&LOTM_TARGETS.includes(a.kind as typeof LOTM_TARGETS[number]))&&s.workingRevision===0&&s.originalProse===p.body&&s.workingProse===p.body&&s.chapters.map(c=>c.content).join('')===p.body&&!s.patches.length&&s.conflicts.every(c=>c.status==='resolved'),'CHECKPOINT_BODY_OR_TARGETS_CHANGED')
 validateImportCoverage(s);validateImportBudgetState(s);validateImportSemanticState(s)
 requireAudit(s.originalProse===sourceBody(s)&&importPlanHash(s)===s.publication.hash,'CHECKPOINT_HASH_MISMATCH')
 const state=s.semanticState;requireAudit(state?.stage==='ready'&&state.inputHash===importSemanticInputHash(s)&&state.decisionHash===importSemanticDecisionHash(s)&&state.workingRevision===0&&state.verifiedHash===importSemanticResultHash(s),'SEMANTIC_BINDING_INCOMPLETE')
 requireAudit(state!.persistentConflicts.length===0&&state!.repairs.every(r=>r.committed&&r.original.id===r.artifactId&&importHash(r.original)===r.baseHash&&r.tasks.every(t=>t.done))&&state!.omissions.every(o=>o.done&&o.unitIds.every(id=>o.completedUnitIds?.includes(id))),'SEMANTIC_TASKS_INCOMPLETE')
 const working=workingImportUnits(s);let at=0
 for(const unit of working){requireAudit(unit.kind==='body'&&unit.start===at&&unit.text===p.body.slice(unit.start,unit.end)&&safeImportBoundary(p.body,unit.start)&&safeImportBoundary(p.body,unit.end),'WORKING_SOURCE_GEOMETRY_INVALID');at=unit.end}
 requireAudit(at===p.body.length,'WORKING_SOURCE_GEOMETRY_INCOMPLETE')
 for(const a of s.artifacts)validateImportEvidence(a,[...s.units,...working])
 const ids=working.map(u=>u.id).sort();for(const target of LOTM_TARGETS)requireAudit(equal([...(s.coverage[target]??[])].sort(),ids),'TARGET_COVERAGE_INCOMPLETE')
 requireAudit(equal([...(s.coverage.review??[])].sort(),ids)&&equal([...(s.coverage.reviewFacts??[])].sort(),importReviewTaskKeys(s).sort()),'FINAL_REVIEW_COVERAGE_INCOMPLETE')
 const mapping=importNativeMappings(s);requireAudit(equal(s.mappingWarnings??[],mapping.mappingWarnings),'MAPPING_WARNING_BINDING_INVALID')
 requireAudit(s.targets.every(kind=>s.artifacts.some(a=>a.kind===kind&&mapping.projectable.has(a.id))&&!s.notFound.includes(kind)),'EIGHT_NATIVE_TARGETS_REQUIRED')
 requireAudit(s.chapters.length===p.chapters.length&&s.chapters.every((c,i)=>{const e=p.chapters[i];return c.title===e.title&&c.start===e.start&&c.end===e.end&&c.volume===e.volumeName&&sha(c.content)===e.expectedUtf8Sha256}),'CHECKPOINT_CHAPTER_ORACLE_MISMATCH')
}

export function verifyShutdown(e:any,s:ImportSession,b:any,run:string):void{
 const time=(value:unknown)=>typeof value==='string'?Date.parse(value):NaN
 requireAudit(b?.run===run&&b.sessionId===s.id&&uuid.test(b.launchId??'')&&Number.isSafeInteger(b.appPid)&&b.appPid>0&&Number.isFinite(time(b.launchedAt)),'FINAL_BUILD_LAUNCH_BINDING_REQUIRED')
 requireAudit(e?.run===run&&e.sessionId===s.id&&e.launchId===b.launchId&&e.appPid===b.appPid&&e.normalExit===true&&e.exitCode===0&&time(e.exitedAt)>=time(s.updatedAt)&&time(s.updatedAt)>=time(b.launchedAt),'CURRENT_NORMAL_EXIT_REQUIRED')
}

export interface AuditResult {mechanicalPassed:boolean;counts:Record<string,number>;retryExerciseStatus:'not-exercised';assertions:{name:string;passed:boolean}[];[key:string]:unknown}
export function verifyNativeRows(s:ImportSession,r:any,p:AuditPrepared):AuditResult{
 const assertions:{name:string;passed:boolean}[]=[],check=(name:string,passed:unknown)=>assertions.push({name,passed:!!passed}),novelId=s.publication?.novelId
 try{
  const own=[...r.novels.map((x:any)=>({novelId:x.id})),...r.volumes,...r.characters,...r.scenes,...r.items,...r.worlds,...r.settings,...r.foreshadows,...r.planning,...r.mutations]
  check('all-rows-belong-to-own-novel',!!novelId&&own.every((x:any)=>x.novelId===novelId)&&r.chapters.every((c:any)=>r.volumes.some((v:any)=>v.id===c.volumeId)))
  check('novel-owner-and-title',r.novels.length===1&&r.novels[0].id===novelId&&r.novels[0].userId==='local-author'&&r.novels[0].title===s.title)
  check('eight-native-volumes-order-names',r.volumes.length===8&&r.volumes.every((v:any,i:number)=>v.index===i+1&&v.title===p.volumes[i].name))
  check('1394-native-chapters-source-order',r.chapters.length===1394&&r.chapters.every((c:any,i:number)=>{const e=p.chapters[i];return c.volumeId===r.volumes[e.volume-1]?.id&&c.index===e.positionInVolume&&c.title===e.title&&c.content===p.body.slice(e.start,e.end)&&sha(c.content)===e.expectedUtf8Sha256&&c.status==='WRITTEN'&&c.wordCount===[...c.content].length}))
  check('native-prepared-body-byte-equality',r.chapters.map((c:any)=>c.content).join('')===p.body)
  check('native-original-body-after-exact-header-removal',r.chapters.map((c:any,i:number)=>{const expected=p.chapters[i];if(!expected)return '';const n=expected.insertedHeaderCharacters;if(n&&c.content.slice(0,n)!==p.headers[expected.volume-1].text)return '\0INVALID_HEADER';return c.content.slice(n)}).join('')===p.main)
  const mapping=importNativeMappings(s),artifacts=s.artifacts.filter(a=>mapping.projectable.has(a.id)),qualified=(a:ImportArtifact)=>a.origin==='source'?a.text:qualifyImportKnowledgeText(a.text,mapping.decoded.get(a.id)!.knowledge)
  check('outline-full-source-text-first-volume',r.volumes[0]?.summary===artifacts.filter(a=>a.kind==='outline').map(qualified).join('\n\n')&&r.volumes.slice(1).every((v:any)=>v.summary===''))
  const multi=(values:unknown[])=>values.map(importHash).sort()
  check('items-exact-complete-name-text-multiset',equal(multi(r.items.map((x:any)=>({name:x.name,text:x.description}))),multi(artifacts.filter(a=>a.kind==='item').map(a=>({name:a.name,text:qualified(a)})))))
  check('foreshadows-exact-complete-name-text-multiset',equal(multi(r.foreshadows.map((x:any)=>({name:x.title,text:x.content}))),multi(artifacts.filter(a=>a.kind==='foreshadow').map(a=>({name:a.name,text:qualified(a)})))))
  assertions.push(...realNovelSemanticAssertions(s,r,{novelId:novelId!,sourceCopyIds:mapping.sourceCopyIds,projectableIds:mapping.projectableIds}))
  const plan=validatePlanning(r.planning[0]?.data)
  check('single-reading-line-exact-identity',plan.lines.length===1&&plan.lines[0].id==='import-reading-line'&&plan.lines[0].name==='导入作品'&&plan.lines[0].primary===true)
  check('planning-volumes-and-chapters-exact-native-projection',plan.volumes.length===8&&plan.volumes.every((v,i)=>v.id===r.volumes[i].id&&v.line==='import-reading-line'&&v.order===i&&v.title===r.volumes[i].title&&v.summary===(r.volumes[i].summary.length<=100000?r.volumes[i].summary:'原始大纲全文见导入记录'))&&plan.chapters.length===1394&&plan.chapters.every((c,i)=>c.id===r.chapters[i].id&&c.line==='import-reading-line'&&c.volume===r.chapters[i].volumeId&&c.order===i&&c.title===r.chapters[i].title&&c.wordBudget===Math.min(200000,Math.max(1,r.chapters[i].wordCount))))
  check('native-chapter-outline-and-outline-cards',r.chapters.every((c:any,i:number)=>c.outline===(s.chapters[i].outline??''))&&r.chapters.every((c:any,i:number)=>{const cards=plan.cards.filter(x=>x.id==='import-chapter-card-'+c.id);return s.chapters[i].outline?cards.length===1&&cards[0].line==='import-reading-line'&&cards[0].chapter===c.id&&cards[0].title===c.title&&cards[0].order===i&&cards[0].tellings.length===1&&cards[0].tellings[0].id==='import-telling-'+c.id&&cards[0].tellings[0].source==='导入大纲'&&cards[0].tellings[0].intent===s.chapters[i].outline:cards.length===0}))
  const snapshot=r.versions[0]?.snapshot
  check('single-import-record-binds-session-and-version',r.versions.length===1&&r.versions[0].targetType==='NOVEL_IMPORT'&&r.versions[0].targetId===novelId&&r.versions[0].version===1&&snapshot?.version===1&&snapshot?.id===s.id&&snapshot?.chapterVersion===2&&snapshot?.semanticVersion===1&&snapshot?.title===s.title&&snapshot?.createdAt===s.createdAt&&snapshot?.importHash===s.publication?.hash)
  const material=s.artifacts.map(a=>({...a,characters:a.text.length}))
  check('import-record-materials-facts-evidence-full-source-binding',snapshot&&equal(snapshot.materials,material)&&equal(snapshot.sources,s.files.map(f=>({name:f.name,format:f.format,hash:f.hash})))&&snapshot.originalProse===p.body&&snapshot.workingProse===p.body&&snapshot.modified===false&&Object.keys(snapshot).every(k=>(SNAPSHOT_FIELDS as readonly string[]).includes(k))&&equal(snapshot.summary,{source:s.artifacts.filter(a=>a.origin==='source').length,inferred:s.artifacts.filter(a=>a.origin==='inferred').length,decisions:s.decisions.length})&&equal(snapshot.sourceKinds,s.selected)&&equal(snapshot.targets,s.targets)&&equal(snapshot.coverage,s.coverage)&&equal(snapshot.decisions,s.decisions)&&equal(snapshot.notFound,s.notFound)&&equal(snapshot.semanticAudit,importSemanticAudit(s))&&equal(snapshot.sourceCopyIds,mapping.sourceCopyIds)&&equal(snapshot.mappingWarnings,mapping.mappingWarnings)&&equal(snapshot.importBudget,importBudgetAudit(s)))
  const m=r.mutations[0]
  check('single-receipt-own-session-and-exact-hashes',r.mutations.length===1&&m.novelId===novelId&&m.userId==='local-author'&&m.targetType==='NOVEL_IMPORT'&&m.targetId===novelId&&m.operationId==='novel-import:'+s.id&&m.requestHash===s.publication?.hash&&m.afterHash===s.publication?.hash&&m.beforeHash===importHash(null)&&m.beforeVersion===0&&m.afterVersion===1&&equal(m.result,{novelId,requestId:s.id,importHash:s.publication?.hash}))
 }catch{check('native-projection-validation-completed',false)}
 return {mechanicalPassed:assertions.length>0&&assertions.every(x=>x.passed),counts:Object.fromEntries(Object.entries(r).filter(([,v])=>Array.isArray(v)).map(([k,v])=>[k,(v as unknown[]).length])),retryExerciseStatus:'not-exercised',assertions}
}

interface TreeEntry {path:string;type:'directory'|'file';identity:any;sha256?:string}
/** No recursive app/root enumeration: this is called only for the selected
 * own-work database, or an explicit synthetic tree in directed tests. */
export async function captureAuditTree(root:string):Promise<TreeEntry[]>{
 const result:TreeEntry[]=[]
 async function visit(path:string){const id=await directory(path);result.push({path:relative(root,path),type:'directory',identity:id});const entries=await readdir(path,{withFileTypes:true});entries.sort((a,b)=>a.name.localeCompare(b.name));for(const entry of entries){const at=join(path,entry.name),st=await lstat(at,{bigint:true});requireAudit(!st.isSymbolicLink(),'DATABASE_LINK_REJECTED');if(st.isDirectory())await visit(at);else{requireAudit(st.isFile()&&st.nlink===1n,'DATABASE_SPECIAL_OR_HARDLINK');const bytes=await readSafe(at);result.push({path:relative(root,at),type:'file',identity:fileIdentity(st),sha256:sha(bytes)})}}requireAudit(equal(await directory(path),id),'DATABASE_DIRECTORY_CHANGED')}
 await visit(root);return result
}
const dirIdentity=z.object({path:z.string(),device:z.string(),inode:z.string()}).strict(),active=z.discriminatedUnion('kind',[z.object({kind:z.literal('original')}).strict(),z.object({kind:z.literal('candidate'),id:z.uuid(),directory:dirIdentity}).strict()]),storageState=z.object({schemaVersion:z.literal(1),workId:z.uuid(),revision:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),active,previous:z.object({active,backupId:z.uuid(),kind:z.literal('closed-source').optional()}).strict().nullable()}).strict()
export async function resolveAuditStorage(root:string,workId:string):Promise<string>{
 await directory(root);const pointer=await optional(join(root,'shakeink-storage.json')),required=await optional(join(root,'shakeink-storage-required.json'))
 if(required){const marker=z.object({schemaVersion:z.literal(1),workId:z.uuid(),required:z.literal(true)}).strict().parse(JSON.parse(utf8(required)));requireAudit(marker.workId===workId,'STORAGE_REQUIRED_WORK_MISMATCH')}
 if(!pointer){requireAudit(!required,'STORAGE_REQUIRED_POINTER_MISSING');return root}
 const parsed=z.object({state:storageState,sha256:z.string().regex(hex)}).strict().parse(JSON.parse(utf8(pointer))),state=parsed.state;requireAudit(state.workId===workId&&parsed.sha256===sha(JSON.stringify(state)),'STORAGE_POINTER_IDENTITY_INVALID')
 for(const v of [state.active,state.previous?.active])if(v?.kind==='candidate')requireAudit(v.directory.path===join(root,'.shakeink-restores',v.id),'STORAGE_CANDIDATE_OUTSIDE_ALLOWED_SLOT')
 if(state.active.kind==='original')return root
 const id=await directory(state.active.directory.path);requireAudit(id.device===state.active.directory.device&&id.inode===state.active.directory.inode,'STORAGE_DIRECTORY_IDENTITY_CHANGED');return state.active.directory.path
}

export interface AuditBinding {runDir:string;appRoot:string;workRoot:string;repo:string;sessionId:string;run:string;label:string;appClosed:boolean;buildIdentity:string;shutdownEvidence:string;runSha256:string}
const SNAPSHOT_FIELDS=['version','chapterVersion','semanticVersion','semanticAudit','sourceCopyIds','mappingWarnings','importBudget','id','title','createdAt','sourceKinds','targets','modified','summary','materials','decisions','originalProse','workingProse','sources','coverage','notFound','importHash'] as const
const COLUMNS={characters:'id,"novelId",name,"roleType",aliases,age,gender,occupation,bio,personality,appearance,clothing,catchphrase,"growthArc",relationships,extra',scenes:'id,"novelId",name,"parentId",coordinates,description',items:'id,"novelId",name,description',worlds:'id,"novelId",name,"parentId",description',settings:'id,"novelId",name,type,"worldId","parentId",content',foreshadows:'id,"novelId",title,content'} as const
const TABLES={characters:'Character',scenes:'Scene',items:'Item',worlds:'World',settings:'Setting',foreshadows:'Foreshadow'} as const
async function readScratchRows(anchor:ScratchAnchor,novelId:string,migrations:any):Promise<any>{
 const {PGlite}=await import('@electric-sql/pglite'),engine=await openAnchoredScratch(anchor,path=>PGlite.create({dataDir:path,relaxedDurability:false}))
 try{return await engine.transaction(async tx=>{
  await tx.exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');await tx.exec('SET TRANSACTION READ ONLY');const mode=await tx.query<{transaction_read_only:string}>('SHOW transaction_read_only');requireAudit(mode.rows[0]?.transaction_read_only==='on','READ_ONLY_TRANSACTION_REQUIRED')
  const installed=await tx.query<{id:string;checksum:string}>('SELECT id,checksum FROM "_desktop_migrations" ORDER BY id');verifyMigrationRows(installed.rows,migrations)
  const total=await tx.query<{n:number}>('SELECT count(*)::int AS n FROM "Novel"');requireAudit(total.rows[0]?.n===1,'SINGLE_OWN_NOVEL_DATABASE_REQUIRED')
  const rows:any={};rows.novels=(await tx.query('SELECT id,"userId",title FROM "Novel" WHERE id=$1',[novelId])).rows
  rows.volumes=(await tx.query('SELECT id,"novelId","index",title,summary FROM "Volume" WHERE "novelId"=$1 ORDER BY "index",id',[novelId])).rows
  rows.chapters=(await tx.query('SELECT c.id,c."volumeId",c."index",c.title,c.outline,c.content,c."wordCount",c.status FROM "Chapter" c JOIN "Volume" v ON v.id=c."volumeId" WHERE v."novelId"=$1 ORDER BY v."index",c."index",c.id',[novelId])).rows
  for(const key of Object.keys(TABLES) as (keyof typeof TABLES)[])rows[key]=(await tx.query(`SELECT ${COLUMNS[key]} FROM "${TABLES[key]}" WHERE "novelId"=$1 ORDER BY id`,[novelId])).rows
  rows.planning=(await tx.query('SELECT "novelId",version,data FROM "PlanningDocument" WHERE "novelId"=$1',[novelId])).rows
  rows.versions=(await tx.query('SELECT id,"targetType","targetId",version,snapshot FROM "ContentVersion" WHERE "targetType"=\'NOVEL_IMPORT\' AND "targetId"=$1 ORDER BY version,id',[novelId])).rows
  rows.mutations=(await tx.query('SELECT id,"userId","novelId","targetType","targetId","operationId","requestHash","beforeHash","afterHash","beforeVersion","afterVersion",result FROM "ContentMutation" WHERE "novelId"=$1 AND "targetType"=\'NOVEL_IMPORT\' AND "targetId"=$1',[novelId])).rows
  return rows
 })}finally{await engine.close()}
}

export async function auditClosedWork(b:AuditBinding):Promise<AuditResult>{
 requireAudit(b?.appClosed===true,'NORMAL_APP_SHUTDOWN_REQUIRED');requireAudit(uuid.test(b.sessionId)&&/^[A-Za-z0-9_-]{1,80}$/u.test(b.label)&&/^[A-Za-z0-9_-]{1,100}$/u.test(b.run)&&hex.test(b.runSha256),'AUDIT_BINDING_INVALID')
 for(const path of [b.runDir,b.appRoot,b.workRoot,b.repo])await directory(path)
 requireAudit(!within(b.runDir,b.workRoot)&&!within(b.runDir,b.appRoot)&&!within(b.workRoot,b.runDir)&&!within(b.appRoot,b.runDir),'AUDIT_ROOT_OVERLAP')
 const output=join(b.runDir,b.label+'-audit');await missing(output)
 requireAudit(within(b.buildIdentity,b.runDir)&&within(b.shutdownEvidence,b.runDir)&&b.buildIdentity!==join(b.runDir,'build-identity.json'),'EXPLICIT_ADDITIONAL_FINAL_BUILD_REQUIRED')
 const tracked=new Map<string,string>(),trackedIdentity=new Map<string,unknown>()
 const frozen=async(path:string,max?:number)=>{const seen=await readObserved(path,max);tracked.set(path,sha(seen.bytes));trackedIdentity.set(path,seen.identity);return seen.bytes}
 const readFrozen=async(path:string,max?:number)=>JSON.parse(utf8(await frozen(path,max)))
 const scriptFile=join(__dirname,'audit-lotm-import.ts'),semanticHelper=join(__dirname,'real-novel-semantic-assertions.ts');await frozen(scriptFile,8*1024*1024);await frozen(semanticHelper,8*1024*1024)
 const runBytes=await frozen(join(b.runDir,'run.json'),4*1024*1024);requireAudit(sha(runBytes)===b.runSha256,'RUN_METADATA_CHANGED');const run=JSON.parse(utf8(runBytes));requireAudit(run.run===b.run&&dirname(run.sourcePath)===b.runDir&&dirname(run.downloadedSourcePath)===dirname(b.runDir)&&dirname(run.minimumSemanticOraclePath)===dirname(b.runDir),'FROZEN_SOURCE_OUTSIDE_OWN_CORPUS')
 const build=await readFrozen(b.buildIdentity,8*1024*1024),closed=await readFrozen(b.shutdownEvidence,1024*1024)
 const journalDir=join(b.appRoot,'novel-imports',b.sessionId),journalPath=join(journalDir,'session.json');requireAudit(utf8(await frozen(join(journalDir,'.owner'),1024))==='shakeink-novel-import-v1\n'+b.sessionId+'\n','JOURNAL_OWNER_MISMATCH')
 const s=projectSession(await readFrozen(journalPath));requireAudit(s.phase==='completed'&&s.id===b.sessionId,'COMPLETED_BOUND_SESSION_REQUIRED');verifyShutdown(closed,s,build,b.run)
 const expected=await frozen(join(b.runDir,'expected-body.txt')),chaptersBytes=await frozen(join(b.runDir,'expected-chapters.json')),headerBytes=await frozen(join(b.runDir,'added-volume-headers.json')),reviewBytes=await frozen(join(dirname(b.runDir),'candidate-B-independent-review.json')),minimumBytes=await frozen(run.minimumSemanticOraclePath)
 requireAudit(sha(chaptersBytes)===run.expectedChaptersSha256&&sha(headerBytes)===run.addedHeadersSha256&&sha(reviewBytes)===run.independentReviewSha256&&sha(minimumBytes)===run.minimumSemanticOracleSha256,'INDEPENDENT_BASELINE_HASH_CHANGED')
 const prepared=verifyPrepared({run,downloaded:await frozen(run.downloadedSourcePath),source:await frozen(run.sourcePath),expectedBody:expected,expectedChapters:JSON.parse(utf8(chaptersBytes)),headers:JSON.parse(utf8(headerBytes)),independentReview:JSON.parse(utf8(reviewBytes)),minimum:JSON.parse(utf8(minimumBytes))});verifyCompleted(s,prepared,{sessionId:b.sessionId,run:b.run})
 const actualBuild=await describeAuditBuild(b.repo);requireAudit(equal(actualBuild.sha256,build.sha256)&&equal(actualBuild.migrations,build.migrations)&&actualBuild.pgliteVersion===build.pgliteVersion,'FINAL_BUILD_OR_MIGRATIONS_CHANGED')
 const manifest=workManifestSchema.parse(await readFrozen(join(b.workRoot,'shakeink-work.json'),4*1024*1024)),receipt=s.publication!
 requireAudit(manifest.phase==='ready'&&manifest.id===receipt.workId&&manifest.novelId===receipt.novelId&&manifest.requestId===s.id&&manifest.title===s.title&&manifest.requestHash===importHash({title:s.title,importHash:receipt.hash}),'OWN_WORK_MANIFEST_RECEIPT_MISMATCH')
 const pointerPath=join(b.workRoot,'shakeink-storage.json'),requiredPath=join(b.workRoot,'shakeink-storage-required.json');const controls=await Promise.all([optional(pointerPath),optional(requiredPath)])
 for(const [i,path]of [pointerPath,requiredPath].entries())if(controls[i])await frozen(path,128*1024)
 for(const name of ['xuanxiang-work.json','xuanxiang-storage.json','xuanxiang-storage-required.json','.xuanxiang-lock'])await missing(join(b.workRoot,name))
 const storage=await resolveAuditStorage(b.workRoot,manifest.id),db=join(storage,'database'),lock=join(b.workRoot,'.shakeink-lock');await missing(lock)
 const before=await captureAuditTree(db);requireAudit(!within(output,db)&&!within(db,output),'SCRATCH_SOURCE_OVERLAP');await mkdir(output,{mode:0o700});const scratch=join(output,'scratch-database');await mkdir(scratch,{mode:0o700})
 let anchor=await captureScratchAnchor(output,scratch,db);const copyDirs=new Map<string,unknown>([[scratch,anchor.scratchIdentity]])
 for(const entry of before){
  await guardScratchAnchor(anchor);const source=join(db,entry.path),target=join(scratch,entry.path)
  if(entry.path)requireAudit(copyDirs.has(dirname(target))&&equal(await directory(dirname(target)),copyDirs.get(dirname(target))),'SCRATCH_COPY_PARENT_CHANGED')
  if(entry.type==='directory'){if(entry.path){await mkdir(target,{mode:0o700});copyDirs.set(target,await directory(target))}requireAudit(equal(await directory(source),entry.identity),'SOURCE_DIRECTORY_REPLACED')}
  else{const bytes=await readSafe(source);requireAudit(sha(bytes)===entry.sha256&&equal(fileIdentity(await lstat(source,{bigint:true})),entry.identity),'SOURCE_CHANGED_DURING_COPY');await guardScratchAnchor(anchor);requireAudit(equal(await directory(dirname(target)),copyDirs.get(dirname(target))),'SCRATCH_COPY_PARENT_CHANGED');await exclusive(target,bytes)}
 }
 await verifyStableTree(db,before);await missing(lock);anchor=await sealScratchAnchor(anchor,before)
 const rows=await readScratchRows(anchor,receipt.novelId!,build.migrations),result=verifyNativeRows(s,rows,prepared)
 for(const [path,hash]of tracked){const seen=await readObserved(path);requireAudit(sha(seen.bytes)===hash&&equal(trackedIdentity.get(path),seen.identity),'FROZEN_FILE_CHANGED_DURING_AUDIT')}
 await verifyStableTree(db,before);requireAudit(equal(controls,await Promise.all([optional(pointerPath),optional(requiredPath)])),'ORIGINAL_DATABASE_OR_POINTER_CHANGED');await missing(lock);requireAudit(equal(actualBuild,await describeAuditBuild(b.repo)),'BUILD_CHANGED_DURING_AUDIT')
 result.assertions.push({name:'original-inputs-and-database-unchanged',passed:true});result.mechanicalPassed=result.assertions.every(x=>x.passed)
 const identity={run:b.run,sessionId:s.id,workId:receipt.workId,novelId:receipt.novelId,revision:s.revision,importHash:receipt.hash,runSha256:b.runSha256,buildIdentitySha256:tracked.get(b.buildIdentity),shutdownEvidenceSha256:tracked.get(b.shutdownEvidence),journalSha256:tracked.get(journalPath),databaseSourceTreeHash:importHash(before),schemaSha256:build.sha256['prisma/schema.prisma'],migrations:build.migrations,scriptSha256:tracked.get(scriptFile),semanticConsumerAssertionsSha256:tracked.get(semanticHelper),pgliteVersion:actualBuild.pgliteVersion}
 const saveOutput=async(name:string,value:string|Uint8Array)=>{await guardScratchAnchor(anchor);await exclusive(join(output,name),value);await guardScratchAnchor(anchor)}
 await saveOutput('checkpoint-public.json',JSON.stringify(s)+'\n');await saveOutput('business-records.json',JSON.stringify({identity,rows:{...rows,versions:rows.versions.map((v:any)=>({...v,snapshot:field(v.snapshot,SNAPSHOT_FIELDS)}))}})+'\n');await saveOutput('ordered-body.txt',Buffer.from(rows.chapters.map((c:any)=>c.content).join(''),'utf8'));await saveOutput('assertions.json',JSON.stringify({identity,...result,scope:'Mechanical persistence only. Literary semantics, native reopen and actual book retry require independent evidence.'},null,2)+'\n')
 return result
}

async function main(){
 const {values}=parseArgs({options:{label:{type:'string'},'app-closed':{type:'boolean'},'build-identity':{type:'string'},'shutdown-evidence':{type:'string'},'describe-build':{type:'boolean'}},strict:true,allowPositionals:false}),repo=resolve(__dirname,'..')
 if(values['describe-build']){requireAudit(Object.keys(values).length===1,'DESCRIBE_BUILD_ONLY');console.log(JSON.stringify(await describeAuditBuild(repo)));return}
 requireAudit(typeof values.label==='string'&&typeof values['build-identity']==='string'&&typeof values['shutdown-evidence']==='string','EXPLICIT_AUDIT_ARGUMENTS_REQUIRED')
 const result=await auditClosedWork({runDir:'/private/tmp/shakeink-lotm-import-20261027/LOTM-20261027-B1',appRoot:'/private/tmp/shakeink-lotm-runtime-20261027/app-data',workRoot:'/private/tmp/shakeink-lotm-runtime-20261027/works/LOTM-20261027-B1',repo,sessionId:'586a62d6-3a5f-4e36-8561-93b9f39afe7a',run:'LOTM-20261027-B1',label:values.label!,appClosed:values['app-closed']===true,buildIdentity:values['build-identity']!,shutdownEvidence:values['shutdown-evidence']!,runSha256:'eb4f899784b53aa5ce42e558897d477ebb5329415978a7443416f05802ef941d'})
 console.log(JSON.stringify({status:result.mechanicalPassed?'mechanical-passed':'mechanical-failed',counts:result.counts,retryExerciseStatus:result.retryExerciseStatus}));if(!result.mechanicalPassed)process.exitCode=1
}
if(require.main===module)main().catch(error=>{console.error(JSON.stringify({status:'audit-blocked',code:error instanceof LotmAuditFailure?error.code:'AUDIT_FAILED_PRIVATE_DETAILS_SUPPRESSED'}));process.exitCode=1})

export function verifyMigrationRows(installed:any,migrations:any):void{requireAudit(Array.isArray(migrations?.files)&&migrations.sha256===importHash(migrations.files)&&equal(installed,migrations.files.map((f:any)=>({id:f.id,checksum:f.checksum}))),'DATABASE_MIGRATIONS_MISMATCH')}
export async function verifyStableTree(root:string,expected:TreeEntry[]):Promise<void>{requireAudit(equal(expected,await captureAuditTree(root)),'DATABASE_TREE_CHANGED')}

export interface ScratchAnchor {output:string;scratch:string;source:string;parent:string;outputIdentity:unknown;scratchIdentity:unknown;sourceIdentity:unknown;parentIdentity:unknown;scratchTree?:TreeEntry[]}
export async function captureScratchAnchor(output:string,scratch:string,source:string):Promise<ScratchAnchor>{
 requireAudit(scratch===join(output,'scratch-database')&&!within(output,source)&&!within(source,output),'SCRATCH_SOURCE_OVERLAP')
 const parent=dirname(output);return {output,scratch,source,parent,parentIdentity:await directory(parent),outputIdentity:await directory(output),scratchIdentity:await directory(scratch),sourceIdentity:await directory(source)}
}
export async function guardScratchAnchor(anchor:ScratchAnchor):Promise<void>{
 requireAudit(anchor.scratch===join(anchor.output,'scratch-database')&&!within(anchor.output,anchor.source)&&!within(anchor.source,anchor.output),'SCRATCH_SOURCE_OVERLAP')
 requireAudit(equal(await directory(anchor.parent),anchor.parentIdentity)&&equal(await directory(anchor.output),anchor.outputIdentity)&&equal(await directory(anchor.scratch),anchor.scratchIdentity)&&equal(await directory(anchor.source),anchor.sourceIdentity),'AUDIT_DIRECTORY_REPLACED')
}
const treePayload=(tree:TreeEntry[])=>tree.map(e=>({path:e.path,type:e.type,...(e.type==='file'?{size:e.identity.size,sha256:e.sha256}:{})}))
export async function sealScratchAnchor(anchor:ScratchAnchor,sourceTree:TreeEntry[]):Promise<ScratchAnchor>{
 await guardScratchAnchor(anchor);const scratchTree=await captureAuditTree(anchor.scratch);requireAudit(equal(treePayload(scratchTree),treePayload(sourceTree)),'SCRATCH_COPY_PAYLOAD_MISMATCH');await guardScratchAnchor(anchor);return {...anchor,scratchTree}
}
/** Validate the entire copied closure immediately before handing the path to
 * the factory. Engine startup may mutate that closure, so only the top-level
 * directory anchors are rechecked for later audit-output writes. */
export async function openAnchoredScratch<T>(anchor:ScratchAnchor,factory:(path:string)=>Promise<T>):Promise<T>{
 await guardScratchAnchor(anchor);requireAudit(Array.isArray(anchor.scratchTree),'SCRATCH_NOT_SEALED');await verifyStableTree(anchor.scratch,anchor.scratchTree!);await guardScratchAnchor(anchor);return factory(anchor.scratch)
}
