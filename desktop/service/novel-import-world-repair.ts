import {createHash,randomUUID} from 'node:crypto'
import {z} from 'zod'
import type {Prisma,PrismaClient} from '../../src/generated/prisma/client'
import {validatePlanning} from '../../src/lib/planning/domain'
import {lockContentOperation} from '../../src/lib/services/content-commit'
import {lockWorldTree} from '../../src/lib/services/world-guard'

const id=z.string().regex(/^[A-Za-z0-9_-]{1,160}$/u),hash=z.string().regex(/^[a-f0-9]{64}$/u),text=(max:number)=>z.string().max(max).refine(value=>value.isWellFormed()&&!value.includes('\0')),name=text(100).refine(value=>!!value.trim()),iso=z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u).refine(value=>Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value)
export const worldRepairWorldSchema=z.object({id,novelId:id,parentId:z.null(),name,description:text(200000),createdAt:iso,updatedAt:iso}).strict()
export const worldRepairPlanSchema=z.object({schemaVersion:z.literal(1),operationId:z.uuid(),rollbackOperationId:z.uuid(),run:z.string().regex(/^[A-Za-z0-9_-]{1,100}$/u),workId:z.uuid(),importRequestId:z.uuid(),applicationId:z.uuid(),novelId:id,userId:id,workIdentity:z.object({device:z.string().regex(/^\d{1,30}$/u),inode:z.string().regex(/^\d{1,30}$/u)}).strict(),importHash:hash,sourceHash:hash,migrationHash:hash,runMetadataHash:hash,checkpointHash:hash,expectedImportSnapshotHash:hash,expectedProtectedRowsHash:hash,rootId:id,rootName:name,expectedWorlds:z.array(worldRepairWorldSchema).length(7),mappings:z.array(z.object({artifactId:text(160).refine(value=>!!value),worldId:id,newSettingId:id,type:z.enum(['POWER_SYSTEM','MAP','SOCIETY','CULTURE','GEOGRAPHY','WORLD_HISTORY'])}).strict()).length(7)}).strict().superRefine((plan,ctx)=>{
 const old=plan.expectedWorlds.map(w=>w.id),mapped=plan.mappings.map(m=>m.worldId),fresh=[plan.rootId,...plan.mappings.map(m=>m.newSettingId)]
 if(new Set(old).size!==7||new Set(mapped).size!==7||mapped.some(value=>!old.includes(value))||plan.expectedWorlds.some(w=>w.novelId!==plan.novelId)||new Set(fresh).size!==8||fresh.some(value=>old.includes(value))||new Set(plan.mappings.map(m=>m.artifactId)).size!==7||plan.operationId===plan.rollbackOperationId||plan.operationId===plan.importRequestId||plan.rollbackOperationId===plan.importRequestId)ctx.addIssue({code:'custom',message:'WR_PLAN_IDENTITIES_INVALID'})
 if(Buffer.byteLength(JSON.stringify(plan))>8*1024*1024)ctx.addIssue({code:'custom',message:'WR_PLAN_TOO_LARGE'})
})
export type WorldRepairPlan=z.infer<typeof worldRepairPlanSchema>
export type WorldRepairEvidenceKind='before'|'preview'|'after'|'ack'
export interface WorldRepairOptions {mode?:'dry-run'|'apply'|'rollback';assertCurrent():void|Promise<void>;writeEvidence(kind:WorldRepairEvidenceKind,value:unknown):Promise<void>}
export interface WorldRepairResult {status:'dry-run'|'committed'|'restored'|'committed-export-failed'|'acknowledgement-unknown';operationId:string;planHash:string;snapshotId?:string;beforeHash:string;afterHash:string;rootId:string;settings:{worldId:string;newSettingId:string}[]}
const protectedKeys=['novels','themes','volumes','chapters','characters','scenes','items','settings','foreshadows','tropes','planning','versions','mutations'] as const
function canonical(value:unknown):unknown{if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical((value as Record<string,unknown>)[key]) ]));return value}
export function worldRepairHash(value:unknown):string{return createHash('sha256').update(JSON.stringify(canonical(JSON.parse(JSON.stringify(value))))).digest('hex')}
export function worldRepairProtectedRowsHash(rows:Record<string,unknown[]>,excludedSettingIds:readonly string[]=[]):string{
 const output=Object.fromEntries(protectedKeys.map(key=>{if(!Array.isArray(rows[key]))throw Error('WR_PROTECTED_ROWS_INVALID');const values=rows[key].filter(value=>key!=='settings'||!excludedSettingIds.includes((value as {id:string}).id)).map(value=>{if(!value||typeof value!=='object')throw Error('WR_PROTECTED_ROWS_INVALID');const row=value as Record<string,unknown>,identity=row.id??row.novelId;if(typeof identity!=='string'||!identity)throw Error('WR_PROTECTED_ROWS_INVALID');return {identity,value}});if(new Set(values.map(value=>value.identity)).size!==values.length)throw Error('WR_PROTECTED_ROWS_INVALID');return [key,values.sort((a,b)=>a.identity<b.identity?-1:a.identity>b.identity?1:0).map(value=>value.value)]}))
 return worldRepairHash(output)
}
type Tx=Prisma.TransactionClient
const auditType='NOVEL_WORLD_SETTING_REPAIR',fail=(code:string):never=>{throw Error(code)},json=(value:unknown)=>JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
async function readRows(tx:Tx,novelId:string){return {novels:await tx.novel.findMany({where:{id:novelId},orderBy:{id:'asc'}}),themes:await tx.theme.findMany({where:{novelId},orderBy:{id:'asc'}}),volumes:await tx.volume.findMany({where:{novelId},orderBy:{id:'asc'}}),chapters:await tx.chapter.findMany({where:{volume:{novelId}},orderBy:[{volume:{index:'asc'}},{index:'asc'},{id:'asc'}]}),characters:await tx.character.findMany({where:{novelId},orderBy:{id:'asc'}}),scenes:await tx.scene.findMany({where:{novelId},orderBy:{id:'asc'}}),items:await tx.item.findMany({where:{novelId},orderBy:{id:'asc'}}),worlds:await tx.world.findMany({where:{novelId},orderBy:{id:'asc'}}),settings:await tx.setting.findMany({where:{novelId},orderBy:{id:'asc'}}),foreshadows:await tx.foreshadow.findMany({where:{novelId},orderBy:{id:'asc'}}),tropes:await tx.trope.findMany({where:{novelId},orderBy:{id:'asc'}}),planning:await tx.planningDocument.findMany({where:{novelId},orderBy:{novelId:'asc'}}),versions:await tx.contentVersion.findMany({where:{targetType:'NOVEL_IMPORT',targetId:novelId},orderBy:{id:'asc'}}),mutations:await tx.contentMutation.findMany({where:{novelId,targetType:'NOVEL_IMPORT',targetId:novelId},orderBy:{id:'asc'}})}}
type Rows=Awaited<ReturnType<typeof readRows>>
function rowsHash(rows:unknown){return worldRepairHash(rows)}
async function owner(tx:Tx,plan:WorldRepairPlan){if(!await tx.novel.findFirst({where:{id:plan.novelId,userId:plan.userId,status:{not:'DELETED'}},select:{id:true}}))fail('WR_OWNER_MISMATCH')}
async function dependencies(tx:Tx,plan:WorldRepairPlan,ids:string[],generatedSettings:string[]=[]){
 const target={targetId:{in:ids}},counts=[await tx.world.count({where:{parentId:{in:ids}}}),await tx.setting.count({where:{OR:[{worldId:{in:ids}},{parentId:{in:ids}}],id:{notIn:generatedSettings}}}),await tx.review.count({where:target}),await tx.textComment.count({where:target}),await tx.preparedTextChange.count({where:target}),await tx.subAgentRun.count({where:target}),await tx.sopNodeRun.count({where:target}),await tx.foreshadowReference.count({where:target}),await tx.contentVersion.count({where:target}),await tx.contentMutation.count({where:target}),await tx.targetTextRevision.count({where:target}),await tx.contentCandidate.count({where:{chapterId:{in:ids}}}),await tx.contentImprovementRun.count({where:{chapterId:{in:ids}}}),await tx.sopPlan.count({where:{novelId:plan.novelId}}),await tx.cascadeJob.count({where:{novelId:plan.novelId}})]
 // Cross-novel incoming edges are existence/count checks only. Never export
 // another novel or traverse chat content to discover an opaque target.
 if(counts.some(Boolean)||await tx.chatWriteEffect.findFirst({where:target,select:{id:true,targetModel:true,operation:true}}))fail('WR_REFERENCED_OR_EDITED')
 const planning=await tx.planningDocument.findMany({where:{novelId:plan.novelId},select:{data:true}})
 for(const row of planning){const parsed=(()=>{try{return validatePlanning(row.data)}catch{return fail('WR_PLANNING_INVALID')}})();if(parsed.worlds.some(w=>w.worldId&&ids.includes(w.worldId)))fail('WR_PLANNING_REFERENCE')}
 const links=await tx.storyArtifactLink.findMany({where:{novelId:plan.novelId},select:{sourceKey:true,targetKey:true}})
 if(links.some(link=>ids.some(id=>link.sourceKey.includes(id)||link.targetKey.includes(id))))fail('WR_ARTIFACT_LINK_REFERENCE')
}
async function locks(tx:Tx,plan:WorldRepairPlan){for(const id of [plan.operationId,plan.rollbackOperationId].sort())await lockContentOperation(tx,plan.userId,id);await lockWorldTree(tx,plan.novelId);await tx.$queryRaw`SELECT id FROM "Novel" WHERE id=${plan.novelId} FOR UPDATE`;for(const id of [...plan.expectedWorlds.map(w=>w.id),plan.rootId].sort())await tx.$queryRaw`SELECT id FROM "World" WHERE id=${id} AND "novelId"=${plan.novelId} FOR UPDATE`;for(const id of plan.mappings.map(m=>m.newSettingId).sort())await tx.$queryRaw`SELECT id FROM "Setting" WHERE id=${id} AND "novelId"=${plan.novelId} FOR UPDATE`}
function checkImport(rows:Rows,plan:WorldRepairPlan){
 if(rows.versions.length!==1||rows.mutations.length!==1)fail('WR_ORIGINAL_IMPORT_NOT_UNIQUE')
 const version=rows.versions[0],mutation=rows.mutations[0],snapshot=version.snapshot as Record<string,unknown>
 if(version.version!==1||!snapshot||typeof snapshot!=='object'||snapshot.version!==1||snapshot.id!==plan.importRequestId||snapshot.title!==rows.novels[0]?.title||snapshot.importHash!==plan.importHash||Object.hasOwn(snapshot,'semanticVersion')||worldRepairHash(snapshot)!==plan.expectedImportSnapshotHash||mutation.userId!==plan.userId||mutation.operationId!=='novel-import:'+plan.importRequestId||mutation.requestHash!==plan.importHash||mutation.beforeHash!==worldRepairHash(null)||mutation.afterHash!==plan.importHash||mutation.beforeVersion!==0||mutation.afterVersion!==1||worldRepairHash(mutation.result)!==worldRepairHash({novelId:plan.novelId,requestId:plan.importRequestId,importHash:plan.importHash}))fail('WR_ORIGINAL_IMPORT_MISMATCH')
 const materials=snapshot.materials as {id:string;kind:string;name:string;text:string}[],sources=snapshot.sources as {hash:string}[]
 if(!Array.isArray(materials)||!Array.isArray(sources)||!sources.some(s=>s.hash===plan.sourceHash))fail('WR_IMPORT_SOURCE_MISMATCH')
 for(const mapping of plan.mappings){const matches=materials.filter(a=>a.id===mapping.artifactId&&a.kind==='world'),world=plan.expectedWorlds.find(w=>w.id===mapping.worldId)!;if(matches.length!==1||matches[0].name!==world.name||matches[0].text!==world.description)fail('WR_IMPORT_ARTIFACT_MISMATCH')}
 const pairs=plan.expectedWorlds.map(w=>worldRepairHash({name:w.name,text:w.description}));if(new Set(pairs).size!==7)fail('WR_AMBIGUOUS_WORLD_MATCH')
}
async function beforeState(tx:Tx,plan:WorldRepairPlan){
 await owner(tx,plan);const rows=await readRows(tx,plan.novelId);checkImport(rows,plan)
 if(rows.worlds.length!==7||worldRepairHash([...rows.worlds].sort((a,b)=>a.id<b.id?-1:1))!==worldRepairHash([...plan.expectedWorlds].sort((a,b)=>a.id<b.id?-1:1)))fail('WR_WORLD_BASELINE_DRIFT')
 if(worldRepairProtectedRowsHash(rows)!==plan.expectedProtectedRowsHash)fail('WR_PROTECTED_BASELINE_DRIFT')
 const fresh=[plan.rootId,...plan.mappings.map(m=>m.newSettingId)]
 if(await tx.world.count({where:{id:{in:fresh}}})||await tx.setting.count({where:{id:{in:fresh}}})||rows.worlds.some(w=>w.name.trim().toLowerCase()===plan.rootName.trim().toLowerCase()))fail('WR_NEW_ID_OR_NAME_OCCUPIED')
 const names=plan.mappings.map(m=>m.type+'\0'+plan.expectedWorlds.find(w=>w.id===m.worldId)!.name);if(new Set(names).size!==7)fail('WR_SETTING_NAME_CONFLICT')
 await dependencies(tx,plan,plan.expectedWorlds.map(w=>w.id));return rows
}
interface SavedSnapshot {schemaVersion:1;planHash:string;plan:WorldRepairPlan;mode:'apply'|'rollback';before:Rows;after:Rows}
const storedReceipt=z.object({status:z.enum(['committed','restored']),operationId:z.uuid(),planHash:hash,snapshotId:z.uuid(),beforeHash:hash,afterHash:hash,rootId:id,settings:z.array(z.object({worldId:id,newSettingId:id}).strict()).length(7)}).strict()
function parseReceipt(raw:unknown,plan:WorldRepairPlan,rollback=false){const checked=storedReceipt.safeParse(raw);if(!checked.success||Buffer.byteLength(JSON.stringify(raw))>16384)throw Error('WR_RECEIPT_INVALID');const result=checked.data;if(result.status!==(rollback?'restored':'committed')||result.operationId!==(rollback?plan.rollbackOperationId:plan.operationId)||result.planHash!==worldRepairHash(plan)||result.rootId!==plan.rootId||worldRepairHash(result.settings)!==worldRepairHash(plan.mappings.map(m=>({worldId:m.worldId,newSettingId:m.newSettingId}))))throw Error('WR_RECEIPT_INVALID');return result}
async function saved(tx:Tx,plan:WorldRepairPlan){
 const record=await tx.contentMutation.findFirst({where:{userId:plan.userId,novelId:plan.novelId,targetType:auditType,targetId:plan.novelId,operationId:plan.operationId}})
 if(!record)return
 if(record.requestHash!==worldRepairHash(plan))fail('WR_OPERATION_PLAN_MISMATCH')
 const receipt=parseReceipt(record.result,plan)
 if(!receipt||receipt.planHash!==record.requestHash||receipt.operationId!==plan.operationId||!receipt.snapshotId||receipt.beforeHash!==record.beforeHash||receipt.afterHash!==record.afterHash)fail('WR_RECEIPT_INVALID')
 const version=await tx.contentVersion.findFirst({where:{id:receipt.snapshotId,targetType:auditType,targetId:plan.novelId}}),snapshot=version?.snapshot as unknown as SavedSnapshot
 if(!snapshot||snapshot.schemaVersion!==1||snapshot.mode!=='apply'||snapshot.planHash!==record.requestHash||worldRepairHash(snapshot.plan)!==record.requestHash||rowsHash(snapshot.before)!==record.beforeHash||rowsHash(snapshot.after)!==record.afterHash)fail('WR_REPAIR_SNAPSHOT_INVALID')
 const rollback=await tx.contentMutation.findFirst({where:{userId:plan.userId,novelId:plan.novelId,targetType:auditType,targetId:plan.novelId,operationId:plan.rollbackOperationId}})
 if(rollback&&rollback.requestHash!==record.requestHash)fail('WR_OPERATION_PLAN_MISMATCH')
 const snapshotIds=[receipt.snapshotId]
 if(rollback){const restored=parseReceipt(rollback.result,plan,true);const rv=await tx.contentVersion.findFirst({where:{id:restored.snapshotId,targetType:auditType,targetId:plan.novelId}}),rs=rv?.snapshot as unknown as SavedSnapshot;if(!rs||rs.mode!=='rollback'||rs.schemaVersion!==1||rs.planHash!==record.requestHash||worldRepairHash(rs.plan)!==record.requestHash||restored.beforeHash!==record.afterHash||restored.afterHash!==record.beforeHash||rollback.beforeHash!==restored.beforeHash||rollback.afterHash!==restored.afterHash||rowsHash(rs.before)!==restored.beforeHash||rowsHash(rs.after)!==restored.afterHash)fail('WR_REPAIR_SNAPSHOT_INVALID');snapshotIds.push(restored.snapshotId)}
 if(await tx.contentMutation.count({where:{novelId:plan.novelId,targetType:auditType,operationId:{notIn:[plan.operationId,plan.rollbackOperationId]}}})||await tx.contentVersion.count({where:{targetType:auditType,targetId:plan.novelId,id:{notIn:snapshotIds}}}))fail('WR_UNEXPECTED_REPAIR_HISTORY')
 return {receipt,snapshot,rollback}
}
function receipt(plan:WorldRepairPlan,status:WorldRepairResult['status'],before:Rows,after:Rows,snapshotId?:string,rollback=false):WorldRepairResult{return {status,operationId:rollback?plan.rollbackOperationId:plan.operationId,planHash:worldRepairHash(plan),...(snapshotId?{snapshotId}:{}),beforeHash:rowsHash(before),afterHash:rowsHash(after),rootId:plan.rootId,settings:plan.mappings.map(m=>({worldId:m.worldId,newSettingId:m.newSettingId}))}}
async function currentAfter(tx:Tx,plan:WorldRepairPlan,expected:Rows,restored=false){
 await owner(tx,plan);const rows=await readRows(tx,plan.novelId);checkImport(rows,plan)
 if(rowsHash(rows)!==rowsHash(expected)||worldRepairProtectedRowsHash(rows,restored?[]:plan.mappings.map(m=>m.newSettingId))!==plan.expectedProtectedRowsHash)fail('WR_COMMITTED_STATE_DRIFT')
 await dependencies(tx,plan,restored?plan.expectedWorlds.map(w=>w.id):[plan.rootId,...plan.mappings.map(m=>m.newSettingId)],restored?[]:plan.mappings.map(m=>m.newSettingId));return rows
}
async function record(tx:Tx,plan:WorldRepairPlan,before:Rows,after:Rows,rollback:boolean){
 const snapshotId=randomUUID(),result=receipt(plan,rollback?'restored':'committed',before,after,snapshotId,rollback),snapshot:SavedSnapshot={schemaVersion:1,planHash:result.planHash,plan,mode:rollback?'rollback':'apply',before,after}
 if(Buffer.byteLength(JSON.stringify(result))>16384||Buffer.byteLength(JSON.stringify(snapshot))>64*1024*1024)fail('WR_AUDIT_BUDGET_EXCEEDED')
 await tx.contentVersion.create({data:{id:snapshotId,targetType:auditType,targetId:plan.novelId,version:rollback?2:1,snapshot:json(snapshot),reason:rollback?'世界设定归属修复恢复':'世界设定归属修复'}})
 await tx.contentMutation.create({data:{userId:plan.userId,novelId:plan.novelId,targetType:auditType,targetId:plan.novelId,operationId:result.operationId,requestHash:result.planHash,beforeVersion:rollback?1:0,afterVersion:rollback?2:1,beforeHash:result.beforeHash,afterHash:result.afterHash,result:json(result)}})
 return result
}
export async function repairWorldSettings(db:PrismaClient,rawPlan:unknown,options:WorldRepairOptions):Promise<WorldRepairResult>{
 const plan=worldRepairPlanSchema.parse(rawPlan),mode=options.mode??'dry-run';if(!['dry-run','apply','rollback'].includes(mode))fail('WR_MODE_INVALID')
 const guard=async()=>{await options.assertCurrent()},transaction=<T>(run:(tx:Tx)=>Promise<T>)=>db.$transaction(run,{isolationLevel:'Serializable',timeout:120000})
 const preflight=await transaction(async tx=>{
  await guard();await owner(tx,plan);const previous=await saved(tx,plan)
  if(previous){const isRestored=!!previous.rollback,expected=isRestored?previous.snapshot.before:previous.snapshot.after;const current=await currentAfter(tx,plan,expected,isRestored);await guard();return {previous,current}}
  if(mode==='rollback')fail('WR_APPLY_RECEIPT_REQUIRED')
  if(await tx.contentMutation.count({where:{OR:[{userId:plan.userId,operationId:{in:[plan.operationId,plan.rollbackOperationId]}},{novelId:plan.novelId,targetType:auditType}]}}))fail('WR_OPERATION_OR_REPAIR_HISTORY_EXISTS')
  const current=await beforeState(tx,plan);await guard();return {previous:undefined,current}
 })
 const emitCommitted=async(result:WorldRepairResult,after:Rows)=>{try{await guard();await options.writeEvidence('after',{planHash:result.planHash,rows:after,result});await guard();await options.writeEvidence('ack',result);return result}catch{return {...result,status:'committed-export-failed' as const}}}
 if(preflight.previous&&(mode!=='rollback'||preflight.previous.rollback)){
  const result=preflight.previous.rollback?parseReceipt(preflight.previous.rollback.result,plan,true):preflight.previous.receipt
  return emitCommitted(result,preflight.current)
 }
 const before=preflight.current,preview={schemaVersion:1,mode,planHash:worldRepairHash(plan),plan,beforeHash:rowsHash(before),root:{id:plan.rootId,name:plan.rootName,description:''},settings:plan.mappings.map(m=>({id:m.newSettingId,worldId:plan.rootId,type:m.type,name:plan.expectedWorlds.find(w=>w.id===m.worldId)!.name,content:{text:plan.expectedWorlds.find(w=>w.id===m.worldId)!.description}}))}
 // These writes are durable wx/fsync operations owned by the caller. No
 // business transaction begins until BOTH required exports have succeeded.
 await guard();await options.writeEvidence('before',{schemaVersion:1,mode,planHash:worldRepairHash(plan),rows:before});await guard();await options.writeEvidence('preview',preview);await guard()
 if(mode==='dry-run')return receipt(plan,'dry-run',before,before)
 let proposed:WorldRepairResult|undefined,after:Rows|undefined,commitAttempted=false
 try{
  const committed=await transaction(async tx=>{
   await guard();await locks(tx,plan);await guard();await owner(tx,plan);const previous=await saved(tx,plan)
   if(mode==='apply'){
    if(previous)fail('WR_CONCURRENT_REPAIR_CHANGED')
    const current=await beforeState(tx,plan);if(rowsHash(current)!==rowsHash(before))fail('WR_BASELINE_CHANGED_AFTER_EXPORT')
    if(await tx.contentMutation.count({where:{OR:[{userId:plan.userId,operationId:{in:[plan.operationId,plan.rollbackOperationId]}},{novelId:plan.novelId,targetType:auditType}]}}))fail('WR_OPERATION_OR_REPAIR_HISTORY_EXISTS')
    const now=new Date();await tx.world.create({data:{id:plan.rootId,novelId:plan.novelId,parentId:null,name:plan.rootName,description:'',createdAt:now,updatedAt:now}});await guard()
    for(const m of plan.mappings){const original=plan.expectedWorlds.find(w=>w.id===m.worldId)!;await tx.setting.create({data:{id:m.newSettingId,novelId:plan.novelId,worldId:plan.rootId,parentId:null,type:m.type,name:original.name,content:{text:original.description},version:1,createdAt:now,updatedAt:now}});await guard()}
    const deleted=await tx.world.deleteMany({where:{novelId:plan.novelId,id:{in:plan.expectedWorlds.map(w=>w.id)},parentId:null}});if(deleted.count!==7)fail('WR_DELETE_COUNT_MISMATCH')
   }else{
    if(!previous||previous.rollback)throw Error('WR_ROLLBACK_STATE_CHANGED')
    await currentAfter(tx,plan,previous.snapshot.after);if(rowsHash(previous.snapshot.after)!==rowsHash(before))fail('WR_BASELINE_CHANGED_AFTER_EXPORT')
    if(await tx.world.count({where:{id:{in:plan.expectedWorlds.map(w=>w.id)}}}))fail('WR_ORIGINAL_IDS_OCCUPIED')
    const removed=await tx.setting.deleteMany({where:{novelId:plan.novelId,worldId:plan.rootId,id:{in:plan.mappings.map(m=>m.newSettingId)}}});if(removed.count!==7)fail('WR_DELETE_COUNT_MISMATCH')
    const root=await tx.world.deleteMany({where:{novelId:plan.novelId,id:plan.rootId,parentId:null}});if(root.count!==1)fail('WR_DELETE_COUNT_MISMATCH')
    for(const original of plan.expectedWorlds)await tx.world.create({data:{...original,createdAt:new Date(original.createdAt),updatedAt:new Date(original.updatedAt)}})
   }
   after=await readRows(tx,plan.novelId);checkImport(after,plan);if(worldRepairProtectedRowsHash(after,mode==='apply'?plan.mappings.map(m=>m.newSettingId):[])!==plan.expectedProtectedRowsHash)fail('WR_PROTECTED_ROWS_CHANGED')
   if(mode==='rollback'&&rowsHash(after)!==rowsHash(preflight.previous!.snapshot.before))fail('WR_RESTORE_HASH_MISMATCH')
   proposed=await record(tx,plan,before,after,mode==='rollback');await guard();commitAttempted=true;return proposed
  })
  return emitCommitted(committed,after!)
 }catch(error){
  // A rejected commit acknowledgement is not evidence that it rolled back.
  // Confirm from the own-novel receipt when admission is still trustworthy.
  if(proposed&&commitAttempted){try{await guard();const confirmed=await transaction(async tx=>{await owner(tx,plan);const record=await tx.contentMutation.findFirst({where:{userId:plan.userId,novelId:plan.novelId,targetType:auditType,targetId:plan.novelId,operationId:proposed!.operationId}});if(!record)return;const result=parseReceipt(record.result,plan,mode==='rollback');if(record.requestHash!==worldRepairHash(plan))fail('WR_RECEIPT_INVALID');return result});if(confirmed)return emitCommitted(confirmed,after!)}catch{return {...proposed,status:'acknowledgement-unknown'}}}
  throw error
 }
}
