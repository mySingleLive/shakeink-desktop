/** RB-P01 mechanical persistence audit. Run only after a normal app shutdown.
 * No application actions, model access, global database or private journal reads.
 * Full public-book records are written exclusively to the requested corpus run.
 */
import {createHash} from 'node:crypto'
import {constants} from 'node:fs'
import {lstat,mkdir,open,readFile,realpath} from 'node:fs/promises'
import {basename,dirname,join,resolve,relative} from 'node:path'
import {parseArgs} from 'node:util'
import {IMPORT_TARGETS,type ImportArtifact,type ImportSession} from '../desktop/shared/novel-import'
import {importHash,importPlanHash,importBudgetAudit,safeImportBoundary,selectedImportUnits,sourceBody,sourceImportArtifacts,validateImportCoverage,validateImportEvidence,validateImportReferences,workingImportUnits} from '../desktop/core/novel-import'
import {brandRootIdentity,readApplicationBrand,readWorkBrand} from '../desktop/core/brand-names'
import {loadMigrations} from '../desktop/service/database/migrations'
import {validatePlanning} from '../src/lib/planning/domain'
import {importReviewTaskKeys} from '../desktop/core/novel-import-review-tasks'
import {validateImportBudgetState} from '../desktop/core/novel-import-budget-policy'
import {pdfReviewAudit} from '../desktop/core/novel-import-pdf'
import {importNativeMappings,importSemanticAudit,importSemanticDecisionHash,importSemanticInputHash,importSemanticResultHash,validateImportSemanticState} from '../desktop/core/novel-import-semantic-state'
import {realNovelSemanticAssertions} from './real-novel-semantic-assertions'
import {qualifyImportKnowledgeText} from '../desktop/core/novel-import-semantics'

const CORPUS='/Users/dt_flys/Documents/拆书/真实小说导入测试-20261026'
const APP_ROOT='/Users/dt_flys/.shakeink'
// CLI argv works under both tsx's CommonJS transform and native ESM.
const SCRIPT=resolve(process.argv[1])
const REPO=resolve(dirname(SCRIPT),'..')
const sha=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex')
const hex=/^[a-f0-9]{64}$/u,identifier=/^[A-Za-z0-9][A-Za-z0-9_-]{0,100}$/u,uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u
class AuditFailure extends Error {constructor(readonly code:string){super(code)}}
function requireAudit(condition:unknown,code:string):asserts condition{if(!condition)throw new AuditFailure(code)}
const equal=(a:unknown,b:unknown)=>importHash(a)===importHash(b)
async function existingDirectory(path:string){const s=await lstat(path);requireAudit(s.isDirectory()&&!s.isSymbolicLink()&&await realpath(path)===path,'DIRECTORY_IDENTITY_INVALID');return path}
async function bytes(path:string,max=1024*1024*1024){
 const s=await lstat(path,{bigint:true});requireAudit(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1n&&s.size<=BigInt(max)&&await realpath(path)===path,'REGULAR_FILE_REQUIRED')
 const h=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW)
 try{const opened=await h.stat({bigint:true});requireAudit(opened.dev===s.dev&&opened.ino===s.ino&&opened.size===s.size,'INPUT_IDENTITY_CHANGED');const value=await h.readFile(),after=await h.stat({bigint:true}),leaf=await lstat(path,{bigint:true});requireAudit(opened.dev===leaf.dev&&opened.ino===leaf.ino&&opened.size===after.size&&opened.mtimeNs===after.mtimeNs&&opened.ctimeNs===after.ctimeNs&&after.mtimeNs===leaf.mtimeNs&&after.ctimeNs===leaf.ctimeNs&&leaf.nlink===1n,'INPUT_IDENTITY_CHANGED');return value}finally{await h.close()}
}
const utf8=(value:Uint8Array)=>new TextDecoder('utf-8',{fatal:true}).decode(value)
async function json(path:string,max?:number):Promise<any>{return JSON.parse(utf8(await bytes(path,max)))}
async function absent(path:string){try{await lstat(path);throw new AuditFailure('EVIDENCE_LABEL_ALREADY_EXISTS')}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error}}
async function exclusive(path:string,value:string|Uint8Array){const h=await open(path,'wx',0o600);try{await h.writeFile(value);await h.sync()}finally{await h.close()}}
async function migrationIdentity(){const rows=await loadMigrations(join(REPO,'prisma/migrations'));const files=await Promise.all(rows.map(async row=>({id:row.id,checksum:row.checksum,fileSha256:sha(await bytes(join(REPO,'prisma/migrations',row.id,'migration.sql'),16*1024*1024))})));return {sha256:importHash(files),files}}

async function main(){
 const {values}=parseArgs({options:{run:{type:'string'},label:{type:'string'},'schema-sha256':{type:'string'},'app-closed':{type:'boolean'},'describe-schema':{type:'boolean'},help:{type:'boolean'}},strict:true,allowPositionals:false})
 if(values.help){console.log('Usage: node --import tsx scripts/audit-real-novel-import.ts --run S01-... --label publication-01 --app-closed --schema-sha256 <same-build migration fingerprint>\nStatic repository fingerprint only: --describe-schema');return}
 const migrations=await migrationIdentity()
 if(values['describe-schema']){requireAudit(!values.run&&!values.label&&!values['app-closed']&&!values['schema-sha256'],'DESCRIBE_SCHEMA_TAKES_NO_RUN');console.log(JSON.stringify({migrationFiles:migrations.files.length,migrationsSha256:migrations.sha256}));return}
 const run=values.run,label=values.label;requireAudit(run&&identifier.test(run)&&label&&identifier.test(label),'RUN_AND_LABEL_REQUIRED');requireAudit(values['app-closed']===true,'NORMAL_APP_SHUTDOWN_REQUIRED');requireAudit(values['schema-sha256']&&hex.test(values['schema-sha256'])&&values['schema-sha256']===migrations.sha256,'SAME_BUILD_MIGRATION_FINGERPRINT_REQUIRED')
 await existingDirectory(CORPUS);const runDir=await existingDirectory(join(CORPUS,'执行证据',run)),destination=join(runDir,label+'-audit');await absent(destination)
 const metadataBytes=await bytes(join(runDir,'run.json'),4*1024*1024),metadata=JSON.parse(utf8(metadataBytes)),oracleBytes=await bytes(join(runDir,'oracle-frozen.json')),oracle=JSON.parse(utf8(oracleBytes)),expected=await bytes(join(runDir,'expected-body.txt')),checkpointBytes=await bytes(join(runDir,'latest-checkpoint.json')),s=JSON.parse(utf8(checkpointBytes)) as ImportSession
 requireAudit(metadata.run===run&&/^(?:[SML]0[12]|M01-directory)$/u.test(metadata.sample)&&run.startsWith(metadata.sample+'-'),'FROZEN_BOOK_RUN_MISMATCH')
 requireAudit(hex.test(metadata.sourceSha256)&&hex.test(metadata.oracleSha256)&&hex.test(metadata.expectedBodySha256),'FROZEN_HASH_INVALID')
 requireAudit(sha(oracleBytes)===metadata.oracleSha256&&sha(expected)===metadata.expectedBodySha256&&[...utf8(expected)].length===metadata.expectedBodyCharacters,'FROZEN_INPUT_HASH_MISMATCH')
 requireAudit(oracle.sourcePath===metadata.sourcePath&&oracle.sourceHash===metadata.sourceSha256&&equal(oracle.selectedBodyRange,metadata.expectedBodyRange)&&typeof oracle.readCoverage?.status==='string'&&oracle.readCoverage.status.startsWith('complete')&&!oracle.readCoverage.status.includes('partial'),'INDEPENDENT_ORACLE_NOT_COMPLETE_OR_MISMATCHED')
 requireAudit(typeof metadata.sourcePath==='string'&&resolve(metadata.sourcePath)===metadata.sourcePath&&metadata.sourcePath.startsWith(join(CORPUS,'原始小说')+'/'),'SOURCE_OUTSIDE_FROZEN_CORPUS')
 const sourceBytes=await bytes(metadata.sourcePath);requireAudit(sha(sourceBytes)===metadata.sourceSha256,'ORIGINAL_SOURCE_HASH_CHANGED')
 requireAudit(!['L01','L02','M01-directory'].includes(metadata.sample)||(metadata.bodyRepresentation&&Array.isArray(metadata.sourceFiles)&&metadata.sourceFiles.length>0),'BINARY_OR_DIRECTORY_FROZEN_REPRESENTATION_REQUIRED')
 requireAudit(s.phase==='completed'&&uuid.test(s.id)&&Number.isSafeInteger(s.revision)&&s.revision>0&&s.title==='RB-'+run&&Date.parse(s.createdAt)>=Date.parse(metadata.frozenAt),'COMPLETED_RUN_CHECKPOINT_REQUIRED')
 validateImportBudgetState(s)
 const receipt=s.publication;requireAudit(receipt&&receipt.requestId===s.id&&uuid.test(receipt.workId??'')&&typeof receipt.novelId==='string'&&/^[A-Za-z0-9_-]{1,160}$/u.test(receipt.novelId)&&hex.test(receipt.hash??''),'COMPLETED_PUBLICATION_RECEIPT_REQUIRED')
 const frozenSources:{path:string;name:string;sha256:string}[]=metadata.sourceFiles??[{path:metadata.sourcePath,name:basename(metadata.sourcePath),sha256:metadata.sourceSha256}]
 requireAudit(Array.isArray(frozenSources)&&frozenSources.length===(metadata.sample==='M01-directory'?9:1)&&new Set(frozenSources.map(f=>f.path)).size===frozenSources.length&&new Set(frozenSources.map(f=>f.name)).size===frozenSources.length,'FROZEN_SOURCE_SET_INVALID')
 const originalMembers=new Map<string,Uint8Array>()
 for(const member of frozenSources){const directory=join(CORPUS,'目录样本','M01-按章');requireAudit(typeof member.path==='string'&&resolve(member.path)===member.path&&hex.test(member.sha256)&&(metadata.sample==='M01-directory'?metadata.selectedDirectory===directory&&dirname(member.path)===directory&&member.name===relative(dirname(directory),member.path):member.path===metadata.sourcePath&&member.name===basename(member.path)),'FROZEN_SOURCE_SET_OUTSIDE_CORPUS');const value=await bytes(member.path);requireAudit(sha(value)===member.sha256,'FROZEN_MEMBER_HASH_CHANGED');originalMembers.set(member.path,value)}
 requireAudit(Array.isArray(s.files)&&s.files.length===frozenSources.length&&s.files.every((file,index)=>file.included&&!file.error&&file.name===frozenSources[index].name&&file.hash===frozenSources[index].sha256),'FROZEN_SOURCE_ORDER_AND_IDENTITY_REQUIRED')
 // The observer intentionally omits file paths/text. Reconstruct only this
 // public source's full text from its complete saved units, never a journal.
 for(const [index,file] of s.files.entries()){file.text=s.units.filter(u=>u.fileId===file.id).sort((a,b)=>a.start-b.start).map(u=>u.text).join('');file.path=frozenSources[index].path;file.bytes=originalMembers.get(file.path)!.byteLength}
 if(metadata.bodyRepresentation){
  const representation=metadata.bodyRepresentation
  if(representation.kind==='directory-exact-concatenation'){
   requireAudit(metadata.sample==='M01-directory'&&representation.manifestPath===join(CORPUS,'directory-M01-manifest.json')&&sha(await bytes(representation.manifestPath))===representation.manifestSha256,'FROZEN_DIRECTORY_MANIFEST_CHANGED')
   const manifest=await json(representation.manifestPath);requireAudit(manifest.selectedDirectory===metadata.selectedDirectory&&equal(manifest.files.map((f:any)=>({path:f.path,name:relative(dirname(metadata.selectedDirectory),f.path),sha256:f.sha256})),frozenSources),'DIRECTORY_MANIFEST_SOURCE_MISMATCH')
   requireAudit(Buffer.concat(frozenSources.map(f=>Buffer.from(originalMembers.get(f.path)!))).equals(expected)&&s.files.every(file=>Buffer.from(file.text).equals(originalMembers.get(file.path)!)),'DIRECTORY_EXACT_BODY_MISMATCH')
  }else{
   requireAudit((metadata.sample==='L01'&&representation.kind==='verified-pdf-production-slices'||metadata.sample==='L02'&&representation.kind==='verified-docx-production-slices')&&representation.coordinateSystem==='zero-based UTF-16 half-open'&&representation.mapPath===join(CORPUS,'输入核验',metadata.sample+'-ui-source-map.json')&&sha(await bytes(representation.mapPath))===representation.mapSha256,'FROZEN_BINARY_REPRESENTATION_MAP_CHANGED')
   const full=s.files[0].text;requireAudit(sha(full)===representation.productionTextSha256&&Array.isArray(representation.includedRanges)&&representation.includedRanges.length>0,'PRODUCTION_REPRESENTATION_CHANGED')
   let previous=0;const slices:string[]=[]
   for(const region of representation.includedRanges){requireAudit(safeImportBoundary(full,region.start)&&safeImportBoundary(full,region.end)&&region.start>=previous&&region.end>region.start,'FROZEN_PRODUCTION_RANGE_INVALID');slices.push(full.slice(region.start,region.end));previous=region.end}
   requireAudit(Buffer.from(slices.join(''),'utf8').equals(expected),'FROZEN_PRODUCTION_SLICES_CHANGED')
   if(metadata.sample==='L01'){const actualProof=s.files[0].pdfInspection?.sourceTextDecoding?.proofHash;requireAudit(typeof representation.sourceTextProofHash==='string'&&hex.test(representation.sourceTextProofHash)&&typeof actualProof==='string'&&hex.test(actualProof)&&actualProof===representation.sourceTextProofHash,'FROZEN_PDF_SOURCE_PROOF_CHANGED')}
  }
 }
 validateImportCoverage(s);requireAudit(importPlanHash(s)===receipt.hash,'CHECKPOINT_PLAN_HASH_MISMATCH');requireAudit(s.originalProse===sourceBody(s),'ORIGINAL_PROSE_SOURCE_MISMATCH')
 validateImportSemanticState(s)
 const semanticMapping=s.semanticVersion===1?importNativeMappings(s):undefined
 if(s.semanticVersion===1){
  const state=s.semanticState
  requireAudit(state?.version===1&&state.stage==='ready'&&state.inputHash===importSemanticInputHash(s)&&state.decisionHash===importSemanticDecisionHash(s)&&state.workingRevision===s.workingRevision&&state.verifiedHash===importSemanticResultHash(s),'SEMANTIC_COMPLETE_CHECKPOINT_BINDING_REQUIRED')
  requireAudit(state.persistentConflicts.length===0&&state.repairs.every(repair=>repair.committed&&repair.original.id===repair.artifactId&&importHash(repair.original)===repair.baseHash&&repair.tasks.every(task=>task.done))&&state.omissions.every(task=>task.done&&s.targets.includes(task.kind)&&task.unitIds.every(id=>(task.completedUnitIds??[]).includes(id))),'SEMANTIC_REPAIR_OR_OMISSION_INCOMPLETE')
  requireAudit(equal(s.mappingWarnings??[],semanticMapping!.mappingWarnings),'SEMANTIC_SOURCE_MAPPING_WARNINGS_MISSING')
 }
 requireAudit(s.infer&&s.selected.includes('body')&&equal([...s.targets].sort(),[...IMPORT_TARGETS].sort()),'FULL_TWELVE_TARGET_RUN_REQUIRED')
 requireAudit(Buffer.from(s.originalProse,'utf8').equals(expected)&&Buffer.from(s.workingProse,'utf8').equals(expected)&&Buffer.from(s.chapters.map(c=>c.content).join(''),'utf8').equals(expected),'CHECKPOINT_BODY_DIFFERS_FROM_INDEPENDENT_UTF8')
 requireAudit(!s.conflicts.some(c=>c.status==='pending')&&!s.patches.length,'UNRESOLVED_IMPORT_DECISIONS')
 const working=workingImportUnits(s),reviewUnits=[...working,...selectedImportUnits(s).filter(u=>u.kind!=='body')]
 for(const a of s.artifacts){validateImportEvidence(a,[...s.units,...working]);if(s.semanticVersion!==1)validateImportReferences(a,s.artifacts,s.chapters)}
 for(const target of s.targets)requireAudit(equal([...(s.coverage[target]??[])].sort(),working.map(u=>u.id).sort()),'TARGET_COVERAGE_INCOMPLETE')
 requireAudit(equal([...(s.coverage.review??[])].sort(),reviewUnits.map(u=>u.id).sort()),'FULL_SOURCE_REVIEW_INCOMPLETE')
 const expectedFactKeys=importReviewTaskKeys(s);requireAudit(equal([...(s.coverage.reviewFacts??[])].sort(),expectedFactKeys.sort()),'FACT_REVIEW_TASK_COVERAGE_INCOMPLETE')

 // Preflight every existing control before initialize's ready branch. Missing
 // metadata must fail rather than initialize or repair an application root.
 await existingDirectory(APP_ROOT);const appBrand=await readApplicationBrand(brandRootIdentity(APP_ROOT));requireAudit(appBrand.value.phase==='ready'&&appBrand.value.inboxReady,'EXISTING_READY_APPLICATION_REQUIRED');await existingDirectory(join(APP_ROOT,'inbox'));const catalogBytes=await bytes(join(APP_ROOT,'catalog.json'),64*1024*1024)
 const {Workspaces,catalogSchema}=await import('../desktop/service/workspaces'),catalog=JSON.parse(utf8(catalogBytes));requireAudit(catalog.schemaVersion===1&&Number.isSafeInteger(catalog.revision)&&catalog.revision>=0,'EXISTING_CATALOG_REQUIRED');const own=catalogSchema.parse(catalog.value).filter(row=>row.id===receipt.workId);requireAudit(own.length===1,'OWN_WORK_NOT_UNIQUE_IN_CATALOG');const record=own[0],target=join(CORPUS,'导入作品','run-'+run)
 await existingDirectory(join(CORPUS,'导入作品'));await existingDirectory(target);requireAudit(record.path===target&&record.novelId===receipt.novelId&&record.requestId===s.id&&record.title===s.title,'CATALOG_RECEIPT_TARGET_MISMATCH')
 const targetIdentity=brandRootIdentity(target);requireAudit(record.identity.device===targetIdentity.device&&record.identity.inode===targetIdentity.inode,'TARGET_DIRECTORY_REPLACED');const workBrand=await readWorkBrand(targetIdentity);requireAudit(workBrand.value.phase==='ready'&&workBrand.value.id===receipt.workId&&workBrand.value.novelId===receipt.novelId&&workBrand.value.requestId===s.id&&workBrand.value.title===s.title&&workBrand.value.requestHash===record.requestHash,'WORK_MANIFEST_RECEIPT_MISMATCH')
 const {requestHash}=await import('../src/lib/services/content-commit');requireAudit(record.requestHash===requestHash({title:s.title,importHash:receipt.hash}),'WORK_REQUEST_HASH_MISMATCH')
 appBrand.assertCurrent();workBrand.assertCurrent();requireAudit((await bytes(join(APP_ROOT,'catalog.json'),64*1024*1024)).equals(catalogBytes),'CATALOG_CHANGED_DURING_PREFLIGHT');requireAudit((await migrationIdentity()).sha256===migrations.sha256,'MIGRATIONS_CHANGED_DURING_PREFLIGHT')
 const works=new Workspaces(APP_ROOT,join(REPO,'prisma/migrations'))
 const {getDatabaseContext,LOCAL_AUTHOR_ID}=await import('../desktop/service/context');const novelId=receipt.novelId
 let rows:Awaited<ReturnType<typeof readOwnRows>>
 async function readOwnRows(){return works.run(receipt!.workId!,async()=>{
  const context=getDatabaseContext();requireAudit(context.workspaceId===receipt!.workId&&!context.globalDatabase,'OWN_WORK_CONTEXT_REQUIRED')
  return context.database.$transaction(async tx=>{
   await tx.$executeRaw`SET TRANSACTION READ ONLY`
   const novels=await tx.novel.findMany({where:{id:novelId}})
   const themes=await tx.theme.findMany({where:{novelId}})
   const volumes=await tx.volume.findMany({where:{novelId},orderBy:[{index:'asc'},{id:'asc'}]})
   const chapters=await tx.chapter.findMany({where:{volume:{novelId}},orderBy:[{volume:{index:'asc'}},{index:'asc'},{id:'asc'}]})
   const characters=await tx.character.findMany({where:{novelId},orderBy:{id:'asc'}})
   const scenes=await tx.scene.findMany({where:{novelId},orderBy:{id:'asc'}})
   const items=await tx.item.findMany({where:{novelId},orderBy:{id:'asc'}})
   const worlds=await tx.world.findMany({where:{novelId},orderBy:{id:'asc'}})
   const settings=await tx.setting.findMany({where:{novelId},orderBy:{id:'asc'}})
   const foreshadows=await tx.foreshadow.findMany({where:{novelId},orderBy:{id:'asc'}})
   const tropes=await tx.trope.findMany({where:{novelId},orderBy:{id:'asc'}})
   const planning=await tx.planningDocument.findMany({where:{novelId}})
   // ContentVersion has no novelId column: NOVEL_IMPORT targetId is the novel.
   const versions=await tx.contentVersion.findMany({where:{targetType:'NOVEL_IMPORT',targetId:novelId},orderBy:{version:'asc'}})
   const mutations=await tx.contentMutation.findMany({where:{novelId,targetType:'NOVEL_IMPORT',targetId:novelId},orderBy:{createdAt:'asc'}})
   return {novels,themes,volumes,chapters,characters,scenes,items,worlds,settings,foreshadows,tropes,planning,versions,mutations}
  },{isolationLevel:'RepeatableRead',timeout:120000})
 })}
 try{await works.initialize();appBrand.assertCurrent();workBrand.assertCurrent();requireAudit((await migrationIdentity()).sha256===migrations.sha256,'MIGRATIONS_CHANGED_BEFORE_OPEN');rows=await readOwnRows()}finally{await works.close()}
 requireAudit((await bytes(metadata.sourcePath)).equals(sourceBytes),'ORIGINAL_SOURCE_CHANGED_DURING_AUDIT');for(const [path,value] of originalMembers)requireAudit((await bytes(path)).equals(value),'SOURCE_MEMBER_CHANGED_DURING_AUDIT');requireAudit((await bytes(join(runDir,'latest-checkpoint.json'))).equals(checkpointBytes),'CHECKPOINT_CHANGED_DURING_AUDIT');appBrand.assertCurrent();workBrand.assertCurrent()
 requireAudit(rows.novels.every(row=>row.id===novelId)&&[...rows.themes,...rows.volumes,...rows.characters,...rows.scenes,...rows.items,...rows.worlds,...rows.settings,...rows.foreshadows,...rows.tropes,...rows.planning,...rows.mutations].every(row=>row.novelId===novelId)&&rows.chapters.every(ch=>rows.volumes.some(v=>v.id===ch.volumeId))&&rows.versions.every(v=>v.targetType==='NOVEL_IMPORT'&&v.targetId===novelId),'OUT_OF_SCOPE_RECORD_REJECTED')
 const assertions:{name:string;passed:boolean}[]=[],check=(name:string,condition:unknown)=>assertions.push({name,passed:!!condition}),sorted=(values:unknown[])=>values.map(v=>importHash(v)).sort(),byKind=(kind:ImportArtifact['kind'])=>s.artifacts.filter(a=>a.kind===kind)
 const publishedByKind=(kind:ImportArtifact['kind'])=>byKind(kind).filter(a=>!semanticMapping||semanticMapping.projectable.has(a.id))
 const publishedText=(a:ImportArtifact,value=a.text)=>s.semanticVersion===1&&a.origin!=='source'?qualifyImportKnowledgeText(value,semanticMapping!.decoded.get(a.id)!.knowledge):value
 const publishedOptionalFact=(a:ImportArtifact,field:string)=>{const value=a.facts[field]??'';return value.trim().length?publishedText(a,value):value}
 for(const name of ['frozen-original-source-sha256-unchanged','frozen-oracle-and-independent-body-hashes-valid','completed-checkpoint-plan-and-receipt-bound','all-twelve-analysis-targets-covered','full-source-and-all-deterministic-fact-tasks-reviewed','all-exported-records-belong-to-own-novel'])check(name,true)
 check('not-found-target-classification-consistent',s.targets.every(kind=>byKind(kind).length?!s.notFound.includes(kind):s.notFound.includes(kind)))
 const actualBody=Buffer.from(rows.chapters.map(ch=>ch.content).join(''),'utf8');check('ordered-chapter-utf8-equals-independent-body',actualBody.equals(expected));check('chapter-order-titles-and-complete-content',equal(rows.chapters.map(ch=>({title:ch.title,content:ch.content})),s.chapters.map(ch=>({title:ch.title,content:ch.content}))));check('chapters-written-and-word-counts',rows.chapters.every(ch=>ch.status==='WRITTEN'&&ch.wordCount===[...ch.content].length));check('novel-identity-title-and-owner',rows.novels.length===1&&rows.novels[0].title===s.title&&rows.novels[0].userId===LOCAL_AUTHOR_ID)
 const sourceMaterials=sourceImportArtifacts(s),original=sourceMaterials.map(a=>({...a,id:'original-'+a.id})),materials=[...original,...s.artifacts.filter(a=>s.semanticVersion===1?!sourceMaterials.some(raw=>equal(raw,a)):!original.some(raw=>raw.kind===a.kind&&raw.text===a.text))].map(a=>({...a,characters:a.text.length})),snapshot=rows.versions[0]?.snapshot as any
 check('single-import-version-and-session-provenance',rows.versions.length===1&&rows.versions[0].version===1&&snapshot?.version===1&&snapshot?.id===s.id&&snapshot?.title===s.title&&snapshot?.createdAt===s.createdAt&&snapshot?.importHash===receipt.hash)
 check('audit-complete-text-facts-evidence-and-source-identities',snapshot&&equal(snapshot.materials,materials)&&equal(snapshot.sources,s.files.filter(f=>f.included).map(f=>({name:f.name,format:f.format,hash:f.hash})))&&snapshot.originalProse===s.originalProse&&snapshot.workingProse===s.workingProse)
 check('audit-frozen-budget-policy-and-working-units',s.budgetPolicy?equal(snapshot?.importBudget,importBudgetAudit(s)):snapshot?.importBudget===undefined)
 check('audit-complete-pdf-ledger-decisions-and-source-proof',pdfReviewAudit(s)?equal(snapshot?.pdfPageReview,pdfReviewAudit(s)):snapshot?.pdfPageReview===undefined)
 if(s.semanticVersion===1){check('audit-semantic-version-checkpoint-proposals-and-projection-selection',snapshot?.semanticVersion===1&&equal(snapshot?.semanticAudit,importSemanticAudit(s))&&equal(snapshot?.sourceCopyIds,semanticMapping!.sourceCopyIds)&&equal(snapshot?.mappingWarnings,semanticMapping!.mappingWarnings));assertions.push(...realNovelSemanticAssertions(s,rows,{novelId,sourceCopyIds:semanticMapping!.sourceCopyIds,projectableIds:semanticMapping!.projectableIds}))}
 else check('legacy-audit-does-not-gain-semantic-metadata',snapshot?.semanticVersion===undefined&&snapshot?.semanticAudit===undefined&&snapshot?.sourceCopyIds===undefined&&snapshot?.mappingWarnings===undefined)
 check('audit-selected-targets-coverage-decisions',snapshot&&equal(snapshot.sourceKinds,s.selected)&&equal(snapshot.targets,s.targets)&&equal(snapshot.coverage,s.coverage)&&equal(snapshot.decisions,s.decisions)&&equal(snapshot.notFound,s.notFound)&&snapshot.modified===(s.workingRevision>0))
 const mutation=rows.mutations[0];check('single-receipt-binds-own-session-and-plan',rows.mutations.length===1&&mutation.userId===LOCAL_AUTHOR_ID&&mutation.operationId==='novel-import:'+s.id&&mutation.requestHash===receipt.hash&&mutation.afterHash===receipt.hash&&mutation.beforeHash===importHash(null)&&mutation.beforeVersion===0&&mutation.afterVersion===1&&equal(mutation.result,{novelId,requestId:s.id,importHash:receipt.hash}))
 for(const [kind,actual] of [['scene',rows.scenes],['item',rows.items],['world',rows.worlds]] as const)if(s.semanticVersion!==1||kind==='item')check(kind+'-complete-name-text-multiset',equal(sorted(actual.map(a=>({name:a.name,text:a.description}))),sorted(publishedByKind(kind).map(a=>({name:a.name,text:publishedText(a)})))))
 if(s.semanticVersion!==1)check('characters-artifact-identity-and-complete-biographies',rows.characters.length===byKind('character').length&&rows.characters.every(c=>byKind('character').some(a=>(c.extra as any)?.importArtifactId===a.id&&c.name===a.name&&c.bio===a.text&&c.age===(a.facts.age??''))))
 check('foreshadow-complete-name-text-multiset',equal(sorted(rows.foreshadows.map(a=>({name:a.title,text:a.content}))),sorted(publishedByKind('foreshadow').map(a=>({name:a.name,text:publishedText(a)})))))
 check('trope-complete-kind-name-text-multiset',equal(sorted(rows.tropes.map(a=>({name:a.category,text:a.content,kind:a.kind}))),sorted(publishedByKind('trope').map(a=>({name:a.name,text:publishedText(a),kind:a.facts.tropeKind})))))
 check('theme-full-text',rows.themes.length===1&&rows.themes[0].synopsis===publishedByKind('theme').map(a=>publishedText(a)).join('\n\n'))
 check('outline-full-text',rows.volumes.length===1&&rows.volumes[0].summary===publishedByKind('outline').map(a=>publishedText(a)).join('\n\n'))
 check('style-full-text',equal(sorted(rows.settings.filter(a=>a.type==='STYLE').map(a=>a.content)),sorted(publishedByKind('style').length?[{style:publishedByKind('style').map(a=>publishedText(a)).join('\n\n'),referenceCases:'',dialogueMark:'DOUBLE_QUOTE',innerDialogueMark:'NONE'}]:[])))
 check('golden-finger-full-text-and-fields',equal(sorted(rows.settings.filter(a=>a.type==='GOLD_FINGER').map(a=>({name:a.name,content:a.content}))),sorted(publishedByKind('goldenFinger').map(a=>({name:a.name,content:{trigger:publishedOptionalFact(a,'trigger'),ability:publishedText(a),limitation:publishedOptionalFact(a,'limitation')}})))))
 const ids=(list:{id:string}[])=>new Set(list.map(row=>row.id)),worldIds=ids(rows.worlds),settingIds=ids(rows.settings),sceneIds=ids(rows.scenes),characterIds=ids(rows.characters),chapterIds=ids(rows.chapters),volumeIds=ids(rows.volumes),materialIds={setting:settingIds,item:ids(rows.items),scene:sceneIds,foreshadow:ids(rows.foreshadows)}
 check('world-parent-foreign-keys',rows.worlds.every(w=>!w.parentId||worldIds.has(w.parentId)));check('setting-world-and-parent-foreign-keys',rows.settings.every(a=>(!a.worldId||worldIds.has(a.worldId))&&(!a.parentId||settingIds.has(a.parentId))));check('scene-parent-and-faction-foreign-keys',rows.scenes.every(a=>(!a.parentId||sceneIds.has(a.parentId))&&(!a.factionSettingId||settingIds.has(a.factionSettingId))&&(!a.factionId||!!a.factionSettingId)));check('character-relationship-foreign-keys',rows.characters.every(c=>Array.isArray(c.relationships)&&c.relationships.every((r:any)=>r&&typeof r==='object'&&(!r.characterId||characterIds.has(r.characterId)))))
 try{
  requireAudit(rows.planning.length===1,'SINGLE_PLANNING_DOCUMENT_REQUIRED');const p=validatePlanning(rows.planning[0].data),event=(line:string,id:string)=>[...p.events,...p.worlds.flatMap(w=>w.fork?.events??[])].some(e=>e.id===id&&e.line===line),material=(refs:{kind:keyof typeof materialIds;id:string}[])=>refs.every(r=>materialIds[r.kind].has(r.id))
  check('planning-internal-structure-valid',true);check('planning-volumes-and-chapters-match-actual-rows',equal([...ids(p.volumes)].sort(),[...volumeIds].sort())&&equal([...ids(p.chapters)].sort(),[...chapterIds].sort())&&p.chapters.every(ch=>!ch.volume||rows.chapters.some(row=>row.id===ch.id&&row.volumeId===ch.volume)))
  check('planning-world-and-character-material-foreign-keys',p.worlds.every(w=>!w.worldId||worldIds.has(w.worldId))&&[...p.events,...p.worlds.flatMap(w=>w.fork?.events??[])].every(e=>e.people.every(id=>characterIds.has(id))&&e.changes.every(c=>characterIds.has(c.character))&&material(e.materialRefs))&&p.connections.every(c=>c.characters.every(id=>characterIds.has(id))))
  check('planning-narrative-character-event-and-material-foreign-keys',p.cards.every(c=>(!c.chapter||chapterIds.has(c.chapter))&&c.tellings.every(t=>(!t.character||characterIds.has(t.character))&&material(t.materialRefs)&&t.refs.every(r=>event(r.line,r.event)&&(!r.character||characterIds.has(r.character))))))
  // Exact persistence projections are mechanical checks, not semantic approval.
  if(s.semanticVersion!==1){check('worldline-complete-artifact-text',byKind('worldline').every(a=>p.events.filter(e=>e.id==='import-event-'+a.id||e.id.startsWith('import-event-'+a.id+'-part-')).sort((a,b)=>Number(a.id.match(/-part-(\d+)$/u)?.[1]??0)-Number(b.id.match(/-part-(\d+)$/u)?.[1]??0)).map(e=>e.fact).join('')===a.text))
  check('narrative-complete-artifact-text',byKind('narrative').every(a=>{const prefix='import-narrative-'+a.id+'-';return p.cards.filter(c=>c.id.startsWith(prefix)&&/^\d+$/u.test(c.id.slice(prefix.length))).sort((a,b)=>a.order-b.order).flatMap(c=>c.tellings.map(t=>t.intent)).join('')===a.text}))}
 }catch{check('planning-internal-structure-valid',false)}
 const passed=assertions.every(a=>a.passed),counts=Object.fromEntries(Object.entries(rows).map(([name,list])=>[name,list.length])),identity={run,label,sample:metadata.sample,sessionId:s.id,checkpointRevision:s.revision,workId:receipt.workId,novelId,requestId:receipt.requestId,importHash:receipt.hash,sourceSha256:metadata.sourceSha256,oracleSha256:metadata.oracleSha256,expectedBodySha256:metadata.expectedBodySha256,checkpointSha256:sha(checkpointBytes),runMetadataSha256:sha(metadataBytes),migrations,scriptSha256:sha(await bytes(SCRIPT,4*1024*1024))}
 await existingDirectory(runDir);await mkdir(destination,{mode:0o700});await exclusive(join(destination,'business-records.json'),JSON.stringify({recordedAt:new Date().toISOString(),identity,rows},null,2)+'\n');await exclusive(join(destination,'ordered-body.txt'),actualBody);await exclusive(join(destination,'assertions.json'),JSON.stringify({identity,passed,counts,assertions,scope:'Mechanical byte/provenance/coverage/reference audit only. Independent semantic review and native reopen checks remain required. Workspaces startup lease/WAL/migration-table behavior is not claimed to be filesystem read-only.'},null,2)+'\n')
 console.log(JSON.stringify({status:passed?'mechanical-assertions-passed':'mechanical-assertions-failed',counts,assertions}));if(!passed)process.exitCode=1
}
main().catch(error=>{console.error(JSON.stringify({status:'audit-blocked',assertion:error instanceof AuditFailure?error.code:'AUDIT_FAILED_NO_PRIVATE_DIAGNOSTICS_PRINTED'}));process.exitCode=1})
