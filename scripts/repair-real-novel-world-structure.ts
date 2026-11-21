/** Explicit maintenance for the one reviewed legacy real-book run. No startup
 * hook, automatic migration, model access, global database or arbitrary DB path.
 * Importable helpers accept isolated roots only so WR02 can exercise admission.
 */
import {createHash} from 'node:crypto'
import {constants,lstatSync,realpathSync,readdirSync,type BigIntStats} from 'node:fs'
import {lstat,mkdir,open,readdir} from 'node:fs/promises'
import {basename,dirname,isAbsolute,join,relative,resolve} from 'node:path'
import {parseArgs} from 'node:util'
import {z} from 'zod'
import {PGlite} from '@electric-sql/pglite'
import {PrismaClient} from '../src/generated/prisma/client'
import {brandRootIdentity,readApplicationBrand,readWorkBrand} from '../desktop/core/brand-names'
import {catalogSchema,lockDirectory} from '../desktop/service/workspaces'
import {workspaceStorage} from '../desktop/service/workspace-storage'
import {LocalPGliteAdapter} from '../desktop/service/database/pglite-adapter'
import {loadMigrations} from '../desktop/service/database/migrations'
import {LOCAL_AUTHOR_ID} from '../desktop/service/context'
import {requestHash} from '../src/lib/services/content-commit'
import {worldRepairPlanSchema,worldRepairHash,repairWorldSettings} from '../desktop/service/novel-import-world-repair'

const sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex')
const identifier=/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/u
const MAX_PLAN=8*1024*1024
const MAX_EVIDENCE=64*1024*1024
function requireCli(value:unknown,code:string):asserts value{if(!value)throw Error('WR_CLI_'+code)}
const isMissing=(error:unknown)=>(error as NodeJS.ErrnoException).code==='ENOENT'
const sameFile=(a:BigIntStats,b:BigIntStats)=>a.dev===b.dev&&a.ino===b.ino&&a.size===b.size&&a.mtimeNs===b.mtimeNs&&a.ctimeNs===b.ctimeNs
interface Pin {assertCurrent():void}
interface FilePin extends Pin {path:string;bytes:Buffer;sha256:string}

/** Pin every directory component; a safe leaf cannot authorize a symlink parent. */
export function worldRepairDirectoryPin(path:string):Pin{
 requireCli(isAbsolute(path)&&resolve(path)===path,'DIRECTORY_PATH_INVALID')
 const rows:{path:string;dev:bigint;ino:bigint}[]=[]
 for(let cursor=path;;cursor=dirname(cursor)){
  const s=lstatSync(cursor,{bigint:true})
  requireCli(s.isDirectory()&&!s.isSymbolicLink()&&realpathSync(cursor)===cursor,'DIRECTORY_INVALID')
  rows.push({path:cursor,dev:s.dev,ino:s.ino});if(dirname(cursor)===cursor)break
 }
 const assertCurrent=()=>{for(const row of rows){const s=lstatSync(row.path,{bigint:true});requireCli(s.isDirectory()&&!s.isSymbolicLink()&&s.dev===row.dev&&s.ino===row.ino&&realpathSync(row.path)===row.path,'DIRECTORY_CHANGED')}}
 assertCurrent();return {assertCurrent}
}
export async function readWorldRepairRegular(path:string,maxBytes=MAX_PLAN):Promise<FilePin>{
 requireCli(Number.isSafeInteger(maxBytes)&&maxBytes>0&&maxBytes<=MAX_EVIDENCE,'READ_LIMIT_INVALID')
 requireCli(isAbsolute(path)&&resolve(path)===path,'FILE_PATH_INVALID')
 const parent=worldRepairDirectoryPin(dirname(path)),before=await lstat(path,{bigint:true})
 requireCli(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1n&&before.size<=BigInt(maxBytes),'REGULAR_FILE_REQUIRED')
 const h=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW)
 try{
  const opened=await h.stat({bigint:true});requireCli(sameFile(before,opened)&&opened.nlink===1n,'FILE_CHANGED')
  const chunks:Buffer[]=[];let total=0
  while(total<=maxBytes){const buffer=Buffer.alloc(Math.min(1024*1024,maxBytes+1-total));const {bytesRead}=await h.read(buffer,0,buffer.length,null);if(!bytesRead)break;total+=bytesRead;requireCli(total<=maxBytes,'FILE_TOO_LARGE');chunks.push(buffer.subarray(0,bytesRead))}
  const after=await h.stat({bigint:true}),leaf=await lstat(path,{bigint:true})
  requireCli(total===Number(opened.size)&&sameFile(opened,after)&&sameFile(after,leaf)&&leaf.nlink===1n&&leaf.isFile()&&!leaf.isSymbolicLink(),'FILE_CHANGED')
  parent.assertCurrent();const bytes=Buffer.concat(chunks)
  const assertCurrent=()=>{parent.assertCurrent();const current=lstatSync(path,{bigint:true});requireCli(current.isFile()&&!current.isSymbolicLink()&&current.nlink===1n&&sameFile(after,current)&&realpathSync(path)===path,'FILE_CHANGED')}
  assertCurrent();return {path,bytes,sha256:sha(bytes),assertCurrent}
 }finally{await h.close()}
}
async function optionalPin(path:string,max:number):Promise<Pin>{
 try{return await readWorldRepairRegular(path,max)}catch(error){if(!isMissing(error))throw error;const parent=worldRepairDirectoryPin(dirname(path));return {assertCurrent(){parent.assertCurrent();try{lstatSync(path);throw Error('WR_CLI_CONTROL_APPEARED')}catch(caught){if(!isMissing(caught))throw caught}}}}
}
function decodeJson(pin:FilePin):unknown{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(pin.bytes))}
function inside(path:string,parent:string){const rel=relative(parent,path);return !!rel&&!rel.startsWith('../')&&rel!=='..'&&!isAbsolute(rel)}
async function absent(path:string){try{await lstat(path);throw Error('WR_CLI_EVIDENCE_ALREADY_EXISTS')}catch(error){if(!isMissing(error))throw error}}

/** Same source-file fingerprint as the reviewed audit, plus immutable file pins. */
export async function worldRepairMigrationIdentity(directory:string){
 const root=worldRepairDirectoryPin(directory),allEntries=(await readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name)),entries=allEntries.filter(entry=>entry.isDirectory()),pins:FilePin[]=[],otherPins:FilePin[]=[]
 for(const entry of allEntries){requireCli(!entry.isSymbolicLink()&&(entry.isDirectory()||entry.isFile()),'MIGRATION_DIRECTORY_INVALID');if(entry.isFile())otherPins.push(await readWorldRepairRegular(join(directory,entry.name),16*1024*1024))}
 for(const entry of entries){worldRepairDirectoryPin(join(directory,entry.name)).assertCurrent();pins.push(await readWorldRepairRegular(join(directory,entry.name,'migration.sql'),16*1024*1024))}
 const migrations=await loadMigrations(directory)
 requireCli(migrations.length===pins.length&&migrations.every((m,i)=>m.id===entries[i].name),'MIGRATION_SET_CHANGED')
 const assertCurrent=()=>{root.assertCurrent();for(const pin of [...pins,...otherPins])pin.assertCurrent();const current=readdirSyncNames(directory);requireCli(JSON.stringify(current)===JSON.stringify(allEntries.map(e=>e.name)),'MIGRATION_SET_CHANGED')}
 assertCurrent();const files=migrations.map((m,i)=>({id:m.id,checksum:m.checksum,fileSha256:pins[i].sha256}))
 return {migrations,files,sha256:worldRepairHash(files),assertCurrent}
}
function readdirSyncNames(path:string){return readdirSync(path).sort((a,b)=>a.localeCompare(b))}

export interface WorldRepairCliEnvironment {repoRoot:string;corpusRoot:string;appRoot:string;authorizedRun:string}
const envSchema=z.object({repoRoot:z.string().min(1),corpusRoot:z.string().min(1),appRoot:z.string().min(1),authorizedRun:z.string().regex(identifier)}).strict()
/** Synchronous construction fault seam for isolated WR02 fixtures. The formal
 * main never passes it; argv, the environment schema and plans cannot enable it. */
export interface WorldRepairCliTestOnly {constructEngine(options:ConstructorParameters<typeof PGlite>[0]):PGlite}
type ServiceResult=Awaited<ReturnType<typeof repairWorldSettings>>
export interface WorldRepairCliResult {status:string;mode:'dry-run'|'apply'|'rollback';run:string;result:ServiceResult;evidenceDirectory:string;cleanupStatus:'closed'|'failed'}
export class WorldRepairCliFailure extends Error {
 constructor(readonly status:'blocked'|'acknowledgement-unknown',readonly cleanupStatus:'closed'|'failed',code:string){super(code)}
}
const safeCode=(error:unknown)=>{const message=error instanceof Error?error.message:'';return /^(?:WR_|WORLD_REPAIR_)[A-Z0-9_]{1,100}$/u.test(message)?message:'WR_CLI_FAILED'}

/** No roots or database paths can be supplied through argv. */
export async function runWorldRepairCli(argv:string[],environment:WorldRepairCliEnvironment,testOnly?:Readonly<WorldRepairCliTestOnly>):Promise<WorldRepairCliResult>{
 const env=envSchema.parse(environment),{values}=parseArgs({args:argv,options:{run:{type:'string'},plan:{type:'string'},label:{type:'string'},mode:{type:'string'},'app-closed':{type:'boolean'}},strict:true,allowPositionals:false})
 const mode=values.mode??'dry-run',run=values.run,label=values.label
 requireCli(mode==='dry-run'||mode==='apply'||mode==='rollback','MODE_INVALID')
 requireCli(values['app-closed']===true,'APP_CLOSED_CONFIRMATION_REQUIRED')
 requireCli(run===env.authorizedRun&&identifier.test(run)&&label&&identifier.test(label),'RUN_OR_LABEL_INVALID')
 for(const root of [env.repoRoot,env.corpusRoot,env.appRoot])worldRepairDirectoryPin(root).assertCurrent()
 requireCli(env.repoRoot!==env.corpusRoot&&env.corpusRoot!==env.appRoot&&!inside(env.appRoot,env.corpusRoot)&&!inside(env.corpusRoot,env.appRoot),'ROOT_OVERLAP')
 const runDir=join(env.corpusRoot,'执行证据',run),runRoot=worldRepairDirectoryPin(runDir),evidenceDirectory=join(runDir,label+'-world-setting-repair')
 requireCli(values.plan&&isAbsolute(values.plan)&&resolve(values.plan)===values.plan&&inside(values.plan,runDir),'PLAN_OUTSIDE_RUN')
 await absent(evidenceDirectory)
 const pins:Pin[]=[runRoot],planFile=await readWorldRepairRegular(values.plan,MAX_PLAN);pins.push(planFile)
 const parsed=worldRepairPlanSchema.safeParse(decodeJson(planFile));requireCli(parsed.success,'PLAN_INVALID');const plan=parsed.data
 requireCli(plan.run===run&&plan.userId===LOCAL_AUTHOR_ID,'PLAN_SCOPE_INVALID')
 const metadataFile=await readWorldRepairRegular(join(runDir,'run.json'),4*1024*1024),checkpointFile=await readWorldRepairRegular(join(runDir,'latest-checkpoint.json'),MAX_EVIDENCE);pins.push(metadataFile,checkpointFile)
 requireCli(metadataFile.sha256===plan.runMetadataHash&&checkpointFile.sha256===plan.checkpointHash,'FROZEN_INPUT_HASH_MISMATCH')
 const metadata=decodeJson(metadataFile) as Record<string,unknown>,checkpoint=decodeJson(checkpointFile) as Record<string,unknown>,publication=checkpoint.publication as Record<string,unknown>|undefined
 requireCli(metadata.run===run&&metadata.sourceSha256===plan.sourceHash&&typeof metadata.sourcePath==='string','RUN_METADATA_MISMATCH')
 requireCli(checkpoint.id===plan.importRequestId&&checkpoint.phase==='completed'&&checkpoint.semanticVersion===undefined&&typeof checkpoint.title==='string'&&publication?.requestId===plan.importRequestId&&publication.workId===plan.workId&&publication.novelId===plan.novelId&&publication.hash===plan.importHash,'CHECKPOINT_SCOPE_MISMATCH')
 const sourcePath=metadata.sourcePath;requireCli(isAbsolute(sourcePath)&&resolve(sourcePath)===sourcePath&&inside(sourcePath,join(env.corpusRoot,'原始小说')),'SOURCE_OUTSIDE_CORPUS')
 const source=await readWorldRepairRegular(sourcePath,MAX_EVIDENCE);pins.push(source);requireCli(source.sha256===plan.sourceHash,'SOURCE_HASH_CHANGED')
 const files=checkpoint.files as {included?:boolean;hash?:string;name?:string}[]|undefined
 requireCli(Array.isArray(files)&&files.length===1&&files[0].included===true&&files[0].hash===plan.sourceHash&&files[0].name===basename(sourcePath),'CHECKPOINT_SOURCE_MISMATCH')
 if(metadata.sourceFiles!==undefined){const rows=metadata.sourceFiles as {path?:string;sha256?:string}[];requireCli(Array.isArray(rows)&&rows.length===1&&rows[0].path===sourcePath&&rows[0].sha256===plan.sourceHash,'RUN_SOURCE_SET_MISMATCH')}
 const worlds=(checkpoint.artifacts as {id:string;kind:string;name:string;text:string}[]|undefined)?.filter(a=>a.kind==='world')
 requireCli(Array.isArray(worlds)&&worlds.length===7,'FROZEN_WORLDS_INVALID')
 for(const mapping of plan.mappings){const found=worlds.filter(a=>a.id===mapping.artifactId),row=plan.expectedWorlds.find(w=>w.id===mapping.worldId);requireCli(found.length===1&&row&&found[0].name===row.name&&found[0].text===row.description,'FROZEN_WORLD_MAPPING_MISMATCH')}
 const appRoot=brandRootIdentity(env.appRoot),appBrand=await readApplicationBrand(appRoot)
 requireCli(appBrand.value.phase==='ready'&&appBrand.value.inboxReady&&appBrand.value.id===plan.applicationId,'APPLICATION_NOT_READY_OR_MISMATCHED')
 const catalogFile=await readWorldRepairRegular(join(env.appRoot,'catalog.json'),MAX_EVIDENCE);pins.push(catalogFile)
 const catalogEnvelope=z.object({schemaVersion:z.literal(1),revision:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),value:catalogSchema}).strict().parse(decodeJson(catalogFile))
 const matches=catalogEnvelope.value.filter(row=>row.id===plan.workId);requireCli(matches.length===1,'WORK_NOT_UNIQUE_IN_CATALOG');const record=matches[0]
 const target=join(env.corpusRoot,'导入作品','run-'+run)
 requireCli(record.path===target&&record.novelId===plan.novelId&&record.requestId===plan.importRequestId&&record.title===checkpoint.title&&record.requestHash===requestHash({title:checkpoint.title,importHash:plan.importHash}),'CATALOG_SCOPE_MISMATCH')
 const workRoot=brandRootIdentity(target),workBrand=await readWorkBrand(workRoot),manifest=workBrand.value
 requireCli(workRoot.device===plan.workIdentity.device&&workRoot.inode===plan.workIdentity.inode&&record.identity.device===workRoot.device&&record.identity.inode===workRoot.inode,'WORK_DIRECTORY_CHANGED')
 requireCli(manifest.phase==='ready'&&manifest.id===plan.workId&&manifest.novelId===plan.novelId&&manifest.requestId===plan.importRequestId&&manifest.requestHash===record.requestHash&&manifest.title===checkpoint.title,'WORK_MANIFEST_MISMATCH')
 pins.push(worldRepairDirectoryPin(target))
 const migrationIdentity=await worldRepairMigrationIdentity(join(env.repoRoot,'prisma','migrations'));pins.push(migrationIdentity)
 requireCli(migrationIdentity.sha256===plan.migrationHash,'MIGRATION_FINGERPRINT_MISMATCH')
 const assertStatic=()=>{appBrand.assertCurrent();workBrand.assertCurrent();for(const pin of pins)pin.assertCurrent()}
 assertStatic();let unlock:Awaited<ReturnType<typeof lockDirectory>>
 try{unlock=await lockDirectory(target,workBrand.names,assertStatic)}catch(error){
  const message=error instanceof Error?error.message:''
  if(/^WR_CLI_[A-Z0-9_]+$/u.test(message))throw error
  if((error as {code?:string})?.code==='WORK_LEASE_STALE')throw Error('WR_CLI_WORK_LEASE_STALE')
  throw Error('WR_CLI_WORK_LEASE_UNAVAILABLE')
 }
 let engine:PGlite|undefined,db:PrismaClient|undefined,result:ServiceResult|undefined,cleanupStatus:'closed'|'failed'='closed',failure:unknown,serviceStarted=false,startupAttempted=false
 let evidenceRoot:Pin|undefined
 const assertCurrent=async()=>{assertStatic();await unlock.assertHeld();assertStatic()}
 const writeEvidence=async(kind:'before'|'preview'|'after'|'ack',value:unknown)=>{
  await assertCurrent();requireCli(['before','preview','after','ack'].includes(kind),'EVIDENCE_KIND_INVALID')
  if(!evidenceRoot){await mkdir(evidenceDirectory,{mode:0o700});evidenceRoot=worldRepairDirectoryPin(evidenceDirectory);pins.push(evidenceRoot);await syncDirectory(runDir)}
  const bytes=Buffer.from(JSON.stringify(value,null,2)+'\n');requireCli(bytes.length<=MAX_EVIDENCE,'EVIDENCE_TOO_LARGE')
  const file=join(evidenceDirectory,kind+'.json'),h=await open(file,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600)
  try{const opened=await h.stat({bigint:true});requireCli(opened.isFile()&&opened.nlink===1n,'EVIDENCE_FILE_INVALID');await h.writeFile(bytes);await h.sync();const done=await h.stat({bigint:true}),leaf=await lstat(file,{bigint:true});requireCli(done.dev===opened.dev&&done.ino===opened.ino&&done.size===BigInt(bytes.length)&&done.nlink===1n&&sameFile(done,leaf)&&leaf.isFile()&&!leaf.isSymbolicLink(),'EVIDENCE_CHANGED')}finally{await h.close()}
  pins.push(await readWorldRepairRegular(file,MAX_EVIDENCE));await syncDirectory(evidenceDirectory);await assertCurrent()
 }
 try{
  pins.push(await optionalPin(join(target,workBrand.names.storage),128*1024),await optionalPin(join(target,workBrand.names.storageRequired),4096))
  const storage=await workspaceStorage(target,assertCurrent),state=await storage.resolve(),storagePath=state.active.kind==='candidate'?state.active.directory.path:target
  pins.push(worldRepairDirectoryPin(storagePath),worldRepairDirectoryPin(join(storagePath,'database')))
  const version=await readWorldRepairRegular(join(storagePath,'database','PG_VERSION'),4096);pins.push(version);requireCli(/^\d+\s*$/u.test(version.bytes.toString('utf8')),'PG_VERSION_INVALID')
  await assertCurrent()
  // Hold the instance before readiness can reject. PGlite.create() otherwise
  // loses its newly constructed instance when waitReady fails.
  startupAttempted=true
  const options={dataDir:join(storagePath,'database'),relaxedDurability:false,startParams:[...PGlite.defaultStartParams,'-c','shared_buffers=32MB']}
  engine=testOnly?testOnly.constructEngine(options):new PGlite(options)
  await engine.waitReady
  await assertCurrent()
  let installed:{id:string;checksum:string}[]
  try{installed=await engine.transaction(async tx=>{await assertCurrent();await tx.exec('SET TRANSACTION READ ONLY');const rows=await tx.query<{id:string;checksum:string}>('SELECT id, checksum FROM "_desktop_migrations" ORDER BY id');await assertCurrent();return rows.rows})}catch{throw Error('WR_CLI_MIGRATION_LEDGER_UNAVAILABLE')}
  const expected=migrationIdentity.migrations.map(({id,checksum})=>({id,checksum})).sort((a,b)=>a.id.localeCompare(b.id))
  requireCli(installed.length===expected.length&&installed.every((row,i)=>row.id===expected[i].id&&row.checksum===expected[i].checksum),'MIGRATION_LEDGER_MISMATCH')
  await assertCurrent();db=new PrismaClient({adapter:new LocalPGliteAdapter(engine,assertCurrent)})
  serviceStarted=true;result=await repairWorldSettings(db,plan,{mode,assertCurrent,writeEvidence})
 }catch(error){failure=error}
 finally{
  try{await db?.$disconnect()}catch{cleanupStatus='failed'}
  let closedConfirmed=!startupAttempted
  try{if(engine){if(engine.closed!==true)await engine.close();closedConfirmed=engine.closed===true}}catch{cleanupStatus='failed'}
  // Construction/readiness failures are not proof that no engine exists. Only
  // a confirmed close (or no startup attempt) permits releasing authority.
  if(closedConfirmed){try{await unlock()}catch{cleanupStatus='failed'}}else cleanupStatus='failed'
 }
 if(failure!==undefined)throw new WorldRepairCliFailure(serviceStarted&&mode!=='dry-run'?'acknowledgement-unknown':'blocked',cleanupStatus,safeCode(failure))
 requireCli(result,'RESULT_UNAVAILABLE')
 return {status:result.status,mode,run,result,evidenceDirectory,cleanupStatus}
}
async function syncDirectory(path:string){const pin=worldRepairDirectoryPin(path),before=lstatSync(path,{bigint:true}),h=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_DIRECTORY);try{const opened=await h.stat({bigint:true});requireCli(opened.isDirectory()&&opened.dev===before.dev&&opened.ino===before.ino,'DIRECTORY_CHANGED');pin.assertCurrent();await h.sync();pin.assertCurrent()}finally{await h.close()}}

/** Only confirmed successful outcomes are shell success; future/unknown states
 * and cleanup failures must remain nonzero even when the engine was closed. */
export function worldRepairCliExitCode(result:{status:unknown;cleanupStatus:unknown}):0|2{
 return result.cleanupStatus==='closed'&&(result.status==='dry-run'||result.status==='committed'||result.status==='restored')?0:2
}

async function main(){
 if(process.argv.includes('--help')){console.log('Usage: node --import tsx scripts/repair-real-novel-world-structure.ts --run S01-20261026-0355 --plan <file inside run evidence> --label <unique label> --app-closed [--mode dry-run|apply|rollback]');return}
 const repoRoot=resolve(dirname(resolve(process.argv[1])),'..')
 try{const result=await runWorldRepairCli(process.argv.slice(2),{repoRoot,corpusRoot:'/Users/dt_flys/Documents/拆书/真实小说导入测试-20261026',appRoot:'/Users/dt_flys/.shakeink',authorizedRun:'S01-20261026-0355'});console.log(JSON.stringify(result));process.exitCode=worldRepairCliExitCode(result)}
 catch(error){console.error(JSON.stringify({status:error instanceof WorldRepairCliFailure?error.status:'blocked',code:safeCode(error),...(error instanceof WorldRepairCliFailure?{cleanupStatus:error.cleanupStatus}:{})}));process.exitCode=1}
}
if(basename(process.argv[1]??'')==='repair-real-novel-world-structure.ts')void main()
