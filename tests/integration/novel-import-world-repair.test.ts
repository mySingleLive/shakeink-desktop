import assert from 'node:assert/strict'
import {test,after} from 'node:test'
import {randomUUID,createHash} from 'node:crypto'
import {mkdtemp,rm,mkdir,writeFile,readFile,stat,realpath,rename,symlink,link,unlink} from 'node:fs/promises'
import {tmpdir,hostname} from 'node:os'
import {join,resolve} from 'node:path'
import {PGlite} from '@electric-sql/pglite'
import {PrismaClient} from '../../src/generated/prisma/client'
import {LocalPGliteAdapter} from '../../desktop/service/database/pglite-adapter'
import {loadMigrations,migrateDatabase} from '../../desktop/service/database/migrations'
import {emptyPlanning,worldlineSchema,eventSchema,lineSchema,cardSchema,validatePlanning} from '../../src/lib/planning/domain'
import {requestHash} from '../../src/lib/services/content-commit'
import {LOCAL_AUTHOR_ID} from '../../desktop/service/context'
import {CURRENT_NAMES,LEGACY_NAMES} from '../../desktop/shared/brand-names'

// All records are synthetic and live in this disposable in-memory PGlite.
// The CLI's separately injected roots always belong to /tmp, never user data.
let engine:PGlite|undefined,db:PrismaClient|undefined
const owner='world-repair-synthetic-owner',date='2026-01-01T00:00:00.000Z',hex=(value:string)=>createHash('sha256').update(value).digest('hex')
after(async()=>{await db?.$disconnect();await engine?.close()})
async function database(){if(!db){engine=await PGlite.create();await migrateDatabase(engine,await loadMigrations(resolve('prisma/migrations')));db=new PrismaClient({adapter:new LocalPGliteAdapter(engine)});await db.user.create({data:{id:owner,name:'合成作者',email:'world-repair@synthetic.invalid',passwordHash:'synthetic-only'}})}return db}
async function rows(database:PrismaClient,novelId:string){return {novels:await database.novel.findMany({where:{id:novelId}}),themes:await database.theme.findMany({where:{novelId}}),volumes:await database.volume.findMany({where:{novelId}}),chapters:await database.chapter.findMany({where:{volume:{novelId}}}),characters:await database.character.findMany({where:{novelId}}),scenes:await database.scene.findMany({where:{novelId}}),items:await database.item.findMany({where:{novelId}}),worlds:await database.world.findMany({where:{novelId}}),settings:await database.setting.findMany({where:{novelId}}),foreshadows:await database.foreshadow.findMany({where:{novelId}}),tropes:await database.trope.findMany({where:{novelId}}),planning:await database.planningDocument.findMany({where:{novelId}}),versions:await database.contentVersion.findMany({where:{targetType:'NOVEL_IMPORT',targetId:novelId}}),mutations:await database.contentMutation.findMany({where:{novelId,targetType:'NOVEL_IMPORT',targetId:novelId}})}}
async function fixture(api:typeof import('../../desktop/service/novel-import-world-repair'),override?:{database:PrismaClient;owner:string}){
 const database=override?.database??await getDatabase(),userId=override?.owner??owner,novelId='wr-'+randomUUID(),requestId=randomUUID(),importHash=hex('synthetic-import-'+novelId),sourceHash=hex('synthetic-source'),materials=Array.from({length:7},(_,i)=>({id:'artifact-'+i,kind:'world',name:'合成条目'+i,text:'首句'+i+'\r\n末句😀'+i,facts:{},evidence:[{unitId:'synthetic-unit',quote:'合成原文'}],sourceUnitIds:['synthetic-unit'],origin:'inferred'}))
 await database.novel.create({data:{id:novelId,userId,title:'合成归属修复'}})
 await database.theme.create({data:{novelId,title:'原主题',synopsis:'主题首中尾',referenceCases:'',channel:'',genre:'',tags:[],sellingPoints:'',targetAudience:''}})
 const volume=await database.volume.create({data:{novelId,index:0,title:'原卷',summary:'原大纲'}});await database.chapter.create({data:{volumeId:volume.id,index:0,title:'原章',outline:'原章纲',content:'完整正文\r\n尾😀',wordCount:9,status:'WRITTEN'}})
 await database.character.create({data:{novelId,name:'原角色',roleType:'SUPPORTING',age:'',occupation:'',bio:'原人物全文😀',personality:'',appearance:'',clothing:'',catchphrase:'',growthArc:'',relationships:[],extra:{}}})
 await database.scene.create({data:{novelId,name:'原地点',description:'原地点资料'}});await database.item.create({data:{novelId,name:'原物品',description:'原物品资料'}})
 await database.foreshadow.create({data:{novelId,title:'原伏笔',content:'原伏笔资料'}});await database.trope.create({data:{novelId,kind:'TEAR',category:'原阅读效果',content:'原情绪资料',referenceCase:''}})
 for(const [index,a] of materials.entries())await database.world.create({data:{id:novelId+'-world-'+index,novelId,name:a.name,description:a.text,createdAt:new Date(date),updatedAt:new Date(date)}})
 await database.setting.create({data:{novelId,type:'STYLE',name:'原小说级设定',content:{style:'原值不得改变',referenceCases:'',dialogueMark:'DOUBLE_QUOTE',innerDialogueMark:'NONE'}}})
 const planning=emptyPlanning();planning.worlds.push(worldlineSchema.parse({id:'wr-story-world',name:'合成事件线'}));planning.events.push(eventSchema.parse({id:'wr-event',line:'wr-story-world',title:'原事件',fact:'原事件首中尾'}));planning.lines.push(lineSchema.parse({id:'wr-reading-line',name:'合成阅读线',primary:true}));planning.cards.push(cardSchema.parse({id:'wr-card',line:'wr-reading-line',title:'原叙事',tellings:[{id:'wr-telling',intent:'原披露全文',refs:[{line:'wr-story-world',event:'wr-event',reveal:'原披露'}]}]}));await database.planningDocument.create({data:{novelId,data:validatePlanning(planning) as never}})
 const snapshot={version:1,id:requestId,title:'合成归属修复',importHash,materials,sources:[{name:'synthetic.txt',format:'txt',hash:sourceHash}],originalProse:'完整正文\r\n尾😀',workingProse:'完整正文\r\n尾😀'}
 await database.contentVersion.create({data:{targetType:'NOVEL_IMPORT',targetId:novelId,version:1,snapshot,reason:'合成原导入'}})
 await database.contentMutation.create({data:{userId,novelId,targetType:'NOVEL_IMPORT',targetId:novelId,operationId:'novel-import:'+requestId,requestHash:importHash,beforeHash:hex('null'),afterHash:importHash,beforeVersion:0,afterVersion:1,result:{novelId,requestId,importHash}}})
 const baseline=await rows(database,novelId),expectedWorlds=baseline.worlds.map(w=>({...w,createdAt:w.createdAt.toISOString(),updatedAt:w.updatedAt.toISOString()}))
 const plan=api.worldRepairPlanSchema.parse({schemaVersion:1,operationId:randomUUID(),rollbackOperationId:randomUUID(),run:'synthetic-world-repair',workId:randomUUID(),importRequestId:requestId,applicationId:randomUUID(),novelId,userId,workIdentity:{device:'1',inode:'2'},importHash,sourceHash,migrationHash:hex('synthetic-migrations'),runMetadataHash:hex('metadata'),checkpointHash:hex('checkpoint'),expectedImportSnapshotHash:api.worldRepairHash(snapshot),expectedProtectedRowsHash:api.worldRepairProtectedRowsHash(baseline),rootId:novelId+'-root',rootName:'小说世界',expectedWorlds,mappings:materials.map((a,index)=>({artifactId:a.id,worldId:novelId+'-world-'+index,newSettingId:novelId+'-setting-'+index,type:index%2?'CULTURE':'SOCIETY'}))})
 return {database,novelId,plan,baseline,materials}
}
const getDatabase=database

async function cliFixture(api:typeof import('../../desktop/service/novel-import-world-repair'),cli:typeof import('../../scripts/repair-real-novel-world-structure')){
 const root=await realpath(await mkdtemp(join(tmpdir(),'world-repair-admission-'))),corpusRoot=join(root,'corpus'),appRoot=join(root,'app'),run='synthetic-world-repair',runDir=join(corpusRoot,'执行证据',run),target=join(corpusRoot,'导入作品','run-'+run),sourcePath=join(corpusRoot,'原始小说','synthetic.txt')
 for(const path of [appRoot,runDir,target,join(corpusRoot,'原始小说')])await mkdir(path,{recursive:true})
 const disk=await PGlite.create({dataDir:join(target,'database')});await migrateDatabase(disk,await loadMigrations(resolve('prisma/migrations')));const client=new PrismaClient({adapter:new LocalPGliteAdapter(disk)})
 let f:Awaited<ReturnType<typeof fixture>>
 try{await client.user.create({data:{id:LOCAL_AUTHOR_ID,name:'合成隔离作者',email:'repair-cli@synthetic.invalid',passwordHash:'synthetic-only'}});f=await fixture(api,{database:client,owner:LOCAL_AUTHOR_ID})}finally{await client.$disconnect();await disk.close()}
 const plan=structuredClone(f.plan),s=await stat(target,{bigint:true});plan.workIdentity={device:String(s.dev),inode:String(s.ino)};plan.migrationHash=(await cli.worldRepairMigrationIdentity(resolve('prisma/migrations'))).sha256
 const metadata={run,sourcePath,sourceSha256:plan.sourceHash,sourceFiles:[{path:sourcePath,sha256:plan.sourceHash}]},cp={id:plan.importRequestId,phase:'completed',title:'合成归属修复',files:[{name:'synthetic.txt',included:true,hash:plan.sourceHash}],artifacts:f.materials,publication:{requestId:plan.importRequestId,workId:plan.workId,novelId:plan.novelId,hash:plan.importHash}},metadataBytes=JSON.stringify(metadata),checkpointBytes=JSON.stringify(cp)
 plan.runMetadataHash=hex(metadataBytes);plan.checkpointHash=hex(checkpointBytes)
 const fingerprint=requestHash({title:cp.title,importHash:plan.importHash}),manifest={schemaVersion:1,id:plan.workId,phase:'ready',novelId:plan.novelId,title:cp.title,requestId:plan.importRequestId,requestHash:fingerprint,createdAt:date}
 await writeFile(sourcePath,'synthetic-source');await writeFile(join(appRoot,CURRENT_NAMES.appMarker),JSON.stringify({schemaVersion:1,app:CURRENT_NAMES.appIdentity,id:plan.applicationId,phase:'ready',inboxReady:true}));await writeFile(join(target,CURRENT_NAMES.workManifest),JSON.stringify(manifest));await writeFile(join(appRoot,'catalog.json'),JSON.stringify({schemaVersion:1,revision:1,value:[{id:plan.workId,path:target,identity:plan.workIdentity,novelId:plan.novelId,title:cp.title,requestId:plan.importRequestId,requestHash:fingerprint,createdAt:date}]}));await writeFile(join(runDir,'run.json'),metadataBytes);await writeFile(join(runDir,'latest-checkpoint.json'),checkpointBytes)
 const planPath=join(runDir,'plan.json'),savePlan=async()=>writeFile(planPath,JSON.stringify(plan));await savePlan()
 const env={repoRoot:await realpath(resolve('.')),corpusRoot,appRoot,authorizedRun:run},args=(label:string,mode?:string)=>['--run',run,'--plan',planPath,'--label',label,'--app-closed',...(mode?['--mode',mode]:[])]
 const inspect=async()=>{const pg=await PGlite.create({dataDir:join(target,'database')}),db=new PrismaClient({adapter:new LocalPGliteAdapter(pg)});try{return await rows(db,plan.novelId)}finally{await db.$disconnect();await pg.close()}}
 const ledger=async(change:(pg:PGlite)=>Promise<void>)=>{const pg=await PGlite.create({dataDir:join(target,'database')});try{await change(pg)}finally{await pg.close()}}
 return {root,runDir,target,appRoot,corpusRoot,sourcePath,plan,planPath,env,args,savePlan,inspect,ledger,baseline:f.baseline}
}

test('NI-WR01: explicit legacy repair is read-only by default, atomic and idempotent',{timeout:120000},async()=>{
 const api=await import('../../desktop/service/novel-import-world-repair'),f=await fixture(api),evidence:{kind:string;value:unknown}[]=[],options={assertCurrent:async()=>{},writeEvidence:async(kind:string,value:unknown)=>{evidence.push({kind,value})}}
 assert.equal(api.worldRepairHash({b:2,a:1}),hex('{"a":1,"b":2}'))
 const dry=await api.repairWorldSettings(f.database,f.plan,options);assert.equal(dry.status,'dry-run');assert.deepEqual(await rows(f.database,f.novelId),f.baseline)
 const result=await api.repairWorldSettings(f.database,f.plan,{...options,mode:'apply'});assert.equal(result.status,'committed')
 const after=await rows(f.database,f.novelId);assert.equal(after.worlds.length,1);assert.equal(after.worlds[0].id,f.plan.rootId);assert.equal(after.worlds[0].description,'');assert.equal(after.settings.length,f.baseline.settings.length+7)
 for(const mapping of f.plan.mappings){const a=f.materials.find(a=>a.id===mapping.artifactId)!,setting=after.settings.find(s=>s.id===mapping.newSettingId)!;assert.equal(setting.worldId,f.plan.rootId);assert.equal(setting.name,a.name);assert.equal(setting.type,mapping.type);assert.deepEqual(setting.content,{text:a.text})}
 assert.equal(api.worldRepairProtectedRowsHash(after,f.plan.mappings.map(m=>m.newSettingId)),f.plan.expectedProtectedRowsHash);assert.deepEqual(after.versions,f.baseline.versions);assert.deepEqual(after.mutations,f.baseline.mutations)
 const repeated=await api.repairWorldSettings(f.database,f.plan,{...options,mode:'apply'});assert.equal(repeated.snapshotId,result.snapshotId);assert.deepEqual(await rows(f.database,f.novelId),after)
 await assert.rejects(api.repairWorldSettings(f.database,{...f.plan,rootName:'不同计划'}, {...options,mode:'apply'}))
 const restored=await api.repairWorldSettings(f.database,f.plan,{...options,mode:'rollback'});assert.equal(restored.status,'restored');assert.deepEqual(await rows(f.database,f.novelId),f.baseline);assert.equal((await api.repairWorldSettings(f.database,f.plan,{...options,mode:'apply'})).status,'restored');assert.ok(evidence.some(e=>e.kind==='before')&&evidence.some(e=>e.kind==='after'))
 assert.equal(restored.operationId,f.plan.rollbackOperationId);assert.notEqual(restored.snapshotId,result.snapshotId);assert.equal(restored.beforeHash,result.afterHash);assert.equal(restored.afterHash,result.beforeHash)
 const rollbackSnapshot=await f.database.contentVersion.findUniqueOrThrow({where:{id:restored.snapshotId!}}),savedRollback=rollbackSnapshot.snapshot as unknown as {mode:string;before:unknown;after:unknown}
 assert.equal(savedRollback.mode,'rollback');assert.equal(api.worldRepairHash(savedRollback.before),restored.beforeHash);assert.equal(api.worldRepairHash(savedRollback.after),restored.afterHash)
 for(const mode of ['rollback','apply'] as const){
  const offset=evidence.length,replayed=await api.repairWorldSettings(f.database,f.plan,{...options,mode});assert.deepEqual(replayed,restored)
  const exported=evidence.slice(offset);assert.deepEqual(exported.map(e=>e.kind),['after','ack'])
  const afterExport=exported[0].value as {rows:unknown;result:typeof restored};assert.deepEqual(afterExport.result,restored);assert.deepEqual(exported[1].value,restored);assert.equal(api.worldRepairHash(afterExport.rows),restored.afterHash);assert.equal(restored.beforeHash,result.afterHash);assert.equal(restored.afterHash,result.beforeHash)
  assert.deepEqual(await rows(f.database,f.novelId),f.baseline);assert.equal(await f.database.contentVersion.count({where:{targetType:'NOVEL_WORLD_SETTING_REPAIR',targetId:f.novelId}}),2);assert.equal(await f.database.contentMutation.count({where:{novelId:f.novelId,targetType:'NOVEL_WORLD_SETTING_REPAIR'}}),2)
 }
})

test('NI-WR02: repair refuses drift and references, rolls back failures and keeps commit authoritative',{timeout:120000},async t=>{
 const cli=await import('../../scripts/repair-real-novel-world-structure'),api=await import('../../desktop/service/novel-import-world-repair'),temp=await mkdtemp(join(tmpdir(),'world-repair-cli-'))
 try{await assert.rejects(cli.runWorldRepairCli([],{repoRoot:resolve('.'),corpusRoot:temp,appRoot:join(temp,'missing-app'),authorizedRun:'synthetic-world-repair'}))}finally{await rm(temp,{recursive:true,force:true})}
 const f=await fixture(api),options={assertCurrent:async()=>{},writeEvidence:async()=>{}}
 await assert.rejects(api.repairWorldSettings(f.database,{...f.plan,userId:'wrong-owner'},{...options,mode:'apply'}));assert.deepEqual(await rows(f.database,f.novelId),f.baseline)
 await assert.rejects(api.repairWorldSettings(f.database,f.plan,{...options,mode:'apply',writeEvidence:async()=>{throw Error('controlled before export')}}));assert.deepEqual(await rows(f.database,f.novelId),f.baseline)
 await f.database.world.update({where:{id:f.plan.expectedWorlds[0].id},data:{description:'后续用户修改'}});await assert.rejects(api.repairWorldSettings(f.database,f.plan,{...options,mode:'apply'}));await f.database.world.update({where:{id:f.plan.expectedWorlds[0].id},data:{description:f.plan.expectedWorlds[0].description,updatedAt:new Date(f.plan.expectedWorlds[0].updatedAt)}})
 const comment=await f.database.textComment.create({data:{novelId:f.novelId,targetType:'UNKNOWN',targetId:f.plan.expectedWorlds[0].id,authorType:'USER',authorName:'合成作者',content:'原评论不可吞掉'}});await assert.rejects(api.repairWorldSettings(f.database,f.plan,{...options,mode:'apply'}));await f.database.textComment.delete({where:{id:comment.id}})
 const committed=await api.repairWorldSettings(f.database,f.plan,{...options,mode:'apply',writeEvidence:async(kind:string)=>{if(kind==='after')throw Error('controlled committed export failure')}});assert.equal(committed.status,'committed-export-failed');const after=await rows(f.database,f.novelId);assert.equal(after.worlds.length,1)
 const replay=await api.repairWorldSettings(f.database,f.plan,{...options,mode:'apply'});assert.equal(replay.status,'committed');assert.deepEqual(await rows(f.database,f.novelId),after)
 await f.database.setting.update({where:{id:f.plan.mappings[0].newSettingId},data:{content:{text:'后续编辑'}}});await assert.rejects(api.repairWorldSettings(f.database,f.plan,{...options,mode:'rollback'}));assert.equal((await rows(f.database,f.novelId)).worlds.length,1)
 const matrix=await fixture(api),m=matrix.database,targetId=matrix.plan.expectedWorlds[0].id
 const foreign=await m.novel.create({data:{userId:owner,title:'隔离其他作品'}}),conversation=await m.conversation.create({data:{userId:owner,novelId:matrix.novelId,title:'隔离工具链'}}),turn=await m.chatTurn.create({data:{userId:owner,conversationId:conversation.id,userMessageId:randomUUID(),clientRequestId:randomUUID()}}),attempt=await m.chatAttempt.create({data:{turnId:turn.id,attemptNo:1,assistantMessageId:randomUUID(),executionEpoch:1}}),tool=await m.chatToolExecution.create({data:{turnId:turn.id,attemptId:attempt.id,toolCallId:'synthetic-tool',toolName:'synthetic',operationId:randomUUID(),requestHash:hex('tool'),input:{}}}),touch=await m.foreshadowTouch.create({data:{novelId:matrix.novelId,foreshadowId:matrix.baseline.foreshadows[0].id,kind:'MENTION'}})
 const history=[
  {name:'cross-novel Review incoming edge',create:()=>m.review.create({data:{novelId:foreign.id,targetType:'CHAPTER_CONTENT',targetId}}),remove:(id:string)=>m.review.delete({where:{id}})},
  {name:'TextComment unknown target type',create:()=>m.textComment.create({data:{novelId:matrix.novelId,targetType:'UNKNOWN',targetId,authorType:'USER',authorName:'合成作者',content:'原评论'}}),remove:(id:string)=>m.textComment.delete({where:{id}})},
  {name:'PreparedTextChange',create:()=>m.preparedTextChange.create({data:{userId:owner,novelId:matrix.novelId,targetType:'UNKNOWN',targetId,commentId:'fixture-comment',operationId:randomUUID(),requestHash:hex('change'),baseUpdatedAt:new Date(date),baseHash:hex('base'),oldText:'旧',start:0,end:1,replacement:'新',reply:'回复',commentUpdatedAt:new Date(date),commentStatus:'OPEN',expiresAt:new Date('2099-01-01T00:00:00Z')}}),remove:(id:string)=>m.preparedTextChange.delete({where:{id}})},
  {name:'SubAgentRun',create:()=>m.subAgentRun.create({data:{novelId:matrix.novelId,agentKind:'reader',task:'合成任务',targetId}}),remove:(id:string)=>m.subAgentRun.delete({where:{id}})},
  {name:'SopNodeRun',create:()=>m.sopNodeRun.create({data:{novelId:matrix.novelId,nodeId:'world',targetId}}),remove:(id:string)=>m.sopNodeRun.delete({where:{id}})},
  {name:'ForeshadowReference',create:()=>m.foreshadowReference.create({data:{novelId:matrix.novelId,touchId:touch.id,targetType:'CHAPTER_CONTENT',targetId,identityKey:'fixture'}}),remove:(id:string)=>m.foreshadowReference.delete({where:{id}})},
  {name:'ChatWriteEffect metadata-only target',create:()=>m.chatWriteEffect.create({data:{toolExecutionId:tool.id,targetModel:'UNKNOWN',targetId,operation:'fixture',receipt:{privateFixture:'must-not-be-exported'}}}),remove:(id:string)=>m.chatWriteEffect.delete({where:{id}})},
  {name:'ContentCandidate historical chapterId',create:()=>m.contentCandidate.create({data:{userId:owner,novelId:matrix.novelId,chapterId:targetId,operationId:randomUUID(),baseVersion:1,baseHash:hex('base'),content:'合成稿件不得读',contentHash:hex('draft'),source:'fixture',status:'ready',checks:{}}}),remove:(id:string)=>m.contentCandidate.delete({where:{id}})},
  {name:'ContentImprovementRun historical chapterId',create:()=>m.contentImprovementRun.create({data:{userId:owner,novelId:matrix.novelId,chapterId:targetId,operationId:randomUUID(),requestHash:hex('improvement'),baseVersion:1,baseHash:hex('base'),baseContent:'合成稿件不得读',authorInstructions:'',comments:[],boundaries:{},wordRequirement:{}}}),remove:(id:string)=>m.contentImprovementRun.delete({where:{id}})},
  {name:'ContentVersion target history',create:()=>m.contentVersion.create({data:{targetType:'WORLD',targetId,version:1,snapshot:{text:'旧历史'},reason:'fixture'}}),remove:(id:string)=>m.contentVersion.delete({where:{id}})},
  {name:'ContentMutation target history',create:()=>m.contentMutation.create({data:{userId:owner,novelId:matrix.novelId,targetType:'WORLD',targetId,operationId:randomUUID(),requestHash:hex('history'),beforeHash:hex('old'),afterHash:hex('new'),result:{}}}),remove:(id:string)=>m.contentMutation.delete({where:{id}})},
  {name:'TargetTextRevision global bounded target',create:()=>m.targetTextRevision.create({data:{operationId:randomUUID(),targetType:'WORLD',targetId,field:'description',side:'before',text:'旧历史',hash:hex('history')}}),remove:(id:string)=>m.targetTextRevision.delete({where:{id}})},
  {name:'SopPlan conservative own-novel block',create:()=>m.sopPlan.create({data:{novelId:matrix.novelId,conversationId:conversation.id,title:'合成计划',items:[]}}),remove:(id:string)=>m.sopPlan.delete({where:{id}})},
  {name:'CascadeJob conservative own-novel block',create:()=>m.cascadeJob.create({data:{novelId:matrix.novelId,triggerType:'SETTING',triggerId:'fixture',affectedItems:[]}}),remove:(id:string)=>m.cascadeJob.delete({where:{id}})}
 ]
 for(const entry of history)await t.test(entry.name,async()=>{const created=await entry.create();let exports=0;try{await assert.rejects(api.repairWorldSettings(m,matrix.plan,{...options,mode:'apply',writeEvidence:async()=>{exports++}}),/WR_REFERENCED_OR_EDITED/);assert.equal(exports,0);assert.deepEqual(await rows(m,matrix.novelId),matrix.baseline)}finally{await entry.remove(created.id)}})
 await t.test('world children and attached settings block without cascade deletion',async()=>{
  const child=await m.world.create({data:{novelId:matrix.novelId,parentId:targetId,name:'原子世界'}});await assert.rejects(api.repairWorldSettings(m,matrix.plan,{...options,mode:'apply'}));assert.ok(await m.world.findUnique({where:{id:child.id}}));await m.world.delete({where:{id:child.id}})
  const setting=await m.setting.create({data:{novelId:matrix.novelId,worldId:targetId,type:'SOCIETY',name:'原附属设定',content:{text:'原字'}}});await assert.rejects(api.repairWorldSettings(m,matrix.plan,{...options,mode:'apply'}));assert.ok(await m.setting.findUnique({where:{id:setting.id}}));await m.setting.delete({where:{id:setting.id}})
 })
 await t.test('planning parse, world pointer and opaque artifact link are closed guards',async()=>{
  const p=await fixture(api),original=p.baseline.planning[0].data
  await p.database.planningDocument.update({where:{novelId:p.novelId},data:{data:{worlds:'invalid-array'}}});let changed=await rows(p.database,p.novelId);await assert.rejects(api.repairWorldSettings(p.database,{...p.plan,expectedProtectedRowsHash:api.worldRepairProtectedRowsHash(changed)},{...options,mode:'apply'}),/WR_PLANNING_INVALID/)
  const pointer=structuredClone(original) as ReturnType<typeof emptyPlanning>;pointer.worlds[0].worldId=p.plan.expectedWorlds[0].id;await p.database.planningDocument.update({where:{novelId:p.novelId},data:{data:pointer as never}});changed=await rows(p.database,p.novelId);await assert.rejects(api.repairWorldSettings(p.database,{...p.plan,expectedProtectedRowsHash:api.worldRepairProtectedRowsHash(changed)},{...options,mode:'apply'}),/WR_PLANNING_REFERENCE/)
  await p.database.planningDocument.update({where:{novelId:p.novelId},data:{data:original as never,updatedAt:p.baseline.planning[0].updatedAt}})
  const edge=await p.database.storyArtifactLink.create({data:{novelId:p.novelId,sourceKey:'opaque:'+p.plan.expectedWorlds[0].id+':description',targetKey:'unrelated',sourceHash:'x',targetHash:'y'}});await assert.rejects(api.repairWorldSettings(p.database,p.plan,{...options,mode:'apply'}),/WR_ARTIFACT_LINK_REFERENCE/);await p.database.storyArtifactLink.delete({where:{id:edge.id}})
 })
 await t.test('actual transaction failures after writes and before commit restore all business and audit rows',async()=>{
  for(const stage of ['after-root','before-commit'] as const){const p=await fixture(api);let writes=0,deny=false
   const fault=new Proxy(p.database,{get(target,key){if(key==='$transaction')return (run:(tx:unknown)=>Promise<unknown>,settings:unknown)=>target.$transaction(async tx=>run(new Proxy(tx,{get(transaction,model){const delegate=Reflect.get(transaction,model);if(model!==(stage==='after-root'?'world':'contentMutation'))return typeof delegate==='function'?delegate.bind(transaction):delegate;return new Proxy(delegate,{get(value,method){const fn=Reflect.get(value,method);if(method!=='create')return typeof fn==='function'?fn.bind(value):fn;return async(args:unknown)=>{const result=await fn.call(value,args);writes++;if(stage==='after-root')throw Error('controlled post-write');deny=true;return result}}})}})),settings as never);const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value}}) as PrismaClient
   await assert.rejects(api.repairWorldSettings(fault,p.plan,{...options,mode:'apply',assertCurrent:async()=>{if(deny)throw Error('controlled commit admission')}}));assert.equal(writes,1);assert.deepEqual(await rows(p.database,p.novelId),p.baseline);assert.equal(await p.database.contentMutation.count({where:{novelId:p.novelId,targetType:'NOVEL_WORLD_SETTING_REPAIR'}}),0)
  }
 })
 await t.test('ack export failures and lost commit acknowledgements confirm without duplicate writes',async()=>{
  const p=await fixture(api),lost=await api.repairWorldSettings(p.database,p.plan,{...options,mode:'apply',writeEvidence:async kind=>{if(kind==='ack')throw Error('controlled ack export')}});assert.equal(lost.status,'committed-export-failed');const committedRows=await rows(p.database,p.novelId),again=await api.repairWorldSettings(p.database,p.plan,{...options,mode:'apply'});assert.equal(again.snapshotId,lost.snapshotId);assert.deepEqual(await rows(p.database,p.novelId),committedRows)
  const historyRow=await p.database.contentVersion.create({data:{targetType:'SETTING',targetId:p.plan.mappings[0].newSettingId,version:2,snapshot:{text:'后续历史'},reason:'fixture'}});await assert.rejects(api.repairWorldSettings(p.database,p.plan,{...options,mode:'rollback'}),/WR_REFERENCED_OR_EDITED/);await p.database.contentVersion.delete({where:{id:historyRow.id}})
  const restored=await api.repairWorldSettings(p.database,p.plan,{...options,mode:'rollback',writeEvidence:async kind=>{if(kind==='after')throw Error('controlled restore export')}});assert.equal(restored.status,'committed-export-failed');assert.deepEqual(await rows(p.database,p.novelId),p.baseline);assert.equal((await api.repairWorldSettings(p.database,p.plan,{...options,mode:'apply'})).status,'restored')
  const q=await fixture(api);let lostOnce=false
  const fault=new Proxy(q.database,{get(target,key){if(key==='$transaction')return async(run:(tx:unknown)=>Promise<unknown>,settings:unknown)=>{const result=await target.$transaction(run as never,settings as never) as unknown as {status?:string};if(result?.status==='committed'&&!lostOnce){lostOnce=true;throw Error('controlled committed acknowledgement loss')}return result};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value}}) as PrismaClient
  const confirmed=await api.repairWorldSettings(fault,q.plan,{...options,mode:'apply'});assert.equal(confirmed.status,'committed');assert.equal(lostOnce,true);assert.equal((await rows(q.database,q.novelId)).worlds.length,1);assert.equal(await q.database.contentMutation.count({where:{novelId:q.novelId,targetType:'NOVEL_WORLD_SETTING_REPAIR'}}),1)
  const u=await fixture(api);let committed=false
  const unknownClient=new Proxy(u.database,{get(target,key){if(key==='$transaction')return async(run:(tx:unknown)=>Promise<unknown>,settings:unknown)=>{const result=await target.$transaction(run as never,settings as never) as unknown as {status?:string};if(result?.status==='committed'){committed=true;throw Error('controlled lost commit acknowledgement')}return result};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value}}) as PrismaClient
  const unknown=await api.repairWorldSettings(unknownClient,u.plan,{...options,mode:'apply',assertCurrent:async()=>{if(committed)throw Error('controlled lost admission')}});assert.equal(unknown.status,'acknowledgement-unknown');assert.equal(cli.worldRepairCliExitCode({status:unknown.status,cleanupStatus:'closed'}),2);assert.equal((await rows(u.database,u.novelId)).worlds.length,1);assert.equal((await api.repairWorldSettings(u.database,u.plan,{...options,mode:'apply'})).status,'committed')
 })
 const c=await cliFixture(api,cli)
 try{
  const dry=await cli.runWorldRepairCli(c.args('dry'),c.env);assert.equal(dry.mode,'dry-run');assert.equal(dry.status,'dry-run');assert.equal(dry.cleanupStatus,'closed');assert.deepEqual(await c.inspect(),c.baseline)
  const applied=await cli.runWorldRepairCli(c.args('apply','apply'),c.env);assert.equal(applied.status,'committed');assert.equal(applied.cleanupStatus,'closed');const appliedRows=await c.inspect();assert.equal(appliedRows.worlds.length,1);assert.equal(appliedRows.settings.length,c.baseline.settings.length+7)
  await assert.rejects(cli.runWorldRepairCli(c.args('apply','apply'),c.env));assert.deepEqual(await c.inspect(),appliedRows)
  const replayed=await cli.runWorldRepairCli(c.args('repeat','apply'),c.env);assert.equal(replayed.result.snapshotId,applied.result.snapshotId);assert.deepEqual(await c.inspect(),appliedRows)
  const restored=await cli.runWorldRepairCli(c.args('restore','rollback'),c.env);assert.equal(restored.status,'restored');assert.deepEqual(await c.inspect(),c.baseline)
  assert.equal((await cli.runWorldRepairCli(c.args('already-restored','apply'),c.env)).status,'restored');assert.deepEqual(await c.inspect(),c.baseline)
  for(const stage of ['before','preview','after','ack'])assert.ok((await readFile(join(applied.evidenceDirectory,stage+'.json'))).length>0)
  const ledgerIdentity=await cli.worldRepairMigrationIdentity(resolve('prisma/migrations')),first=ledgerIdentity.migrations[0]
  await c.ledger(async pg=>{await pg.query('UPDATE "_desktop_migrations" SET checksum=$1 WHERE id=$2',['0'.repeat(64),first.id])});await assert.rejects(cli.runWorldRepairCli(c.args('ledger-drift'),c.env),/MIGRATION_LEDGER_MISMATCH/);await c.ledger(async pg=>{await pg.query('UPDATE "_desktop_migrations" SET checksum=$1 WHERE id=$2',[first.checksum,first.id])})
  const lease=join(c.target,CURRENT_NAMES.lock),leaseBytes=JSON.stringify({token:'synthetic-foreign-owner',pid:process.pid,host:hostname()});await mkdir(lease);await writeFile(join(lease,'owner.json'),leaseBytes);await assert.rejects(cli.runWorldRepairCli(c.args('active-lease'),c.env),/LEASE/);assert.equal(await readFile(join(lease,'owner.json'),'utf8'),leaseBytes);await rm(lease,{recursive:true})
  await writeFile(join(c.target,CURRENT_NAMES.storage),'{}');await assert.rejects(cli.runWorldRepairCli(c.args('invalid-pointer'),c.env));await unlink(join(c.target,CURRENT_NAMES.storage))
  await writeFile(join(c.target,LEGACY_NAMES.workManifest),'{}');await assert.rejects(cli.runWorldRepairCli(c.args('brand-conflict'),c.env));await unlink(join(c.target,LEGACY_NAMES.workManifest))
  const symlinkPlan=join(c.runDir,'symlink-plan.json');await symlink(c.planPath,symlinkPlan);await assert.rejects(cli.runWorldRepairCli(c.args('symlink-plan').map(value=>value===c.planPath?symlinkPlan:value),c.env));await unlink(symlinkPlan)
  const hardlinkPlan=join(c.runDir,'hardlink-plan.json');await link(c.planPath,hardlinkPlan);await assert.rejects(cli.runWorldRepairCli(c.args('hardlink-plan'),c.env));await unlink(hardlinkPlan)
  const alias=join(c.root,'corpus-alias');await symlink(c.corpusRoot,alias);await assert.rejects(cli.runWorldRepairCli(c.args('aliased-parent'),{...c.env,corpusRoot:alias}));await unlink(alias)
  const pin=await cli.readWorldRepairRegular(c.planPath);await writeFile(c.planPath,JSON.stringify(c.plan)+' ');assert.throws(()=>pin.assertCurrent());await c.savePlan()
  const source=await readFile(c.sourcePath);await writeFile(c.sourcePath,'source changed');await assert.rejects(cli.runWorldRepairCli(c.args('source-changed'),c.env),/SOURCE_HASH_CHANGED/);await writeFile(c.sourcePath,source)
  await t.test('startup readiness rejection keeps the actual lease until closure is confirmed',async()=>{
   let constructed=0,queries=0,closes=0,closed=false,release!:()=>void,started!:()=>void
   const drain=new Promise<void>(yes=>{release=yes}),closeStarted=new Promise<void>(yes=>{started=yes})
   const pending=cli.runWorldRepairCli(c.args('startup-rejected'),c.env,{constructEngine(){constructed++;return {waitReady:Promise.reject(Error('WR_CLI_CONTROLLED_STARTUP')),get closed(){return closed},transaction(){queries++;throw Error('must not query')},async close(){closes++;started();await drain;closed=true}} as unknown as PGlite}});void pending.catch(()=>{})
   let timer:ReturnType<typeof setTimeout>|undefined;try{await Promise.race([closeStarted,new Promise<never>((_yes,no)=>{timer=setTimeout(()=>no(Error('startup factory did not reach close')),10000)})]);assert.equal(constructed,1);assert.equal(queries,0);assert.equal(closes,1);assert.equal(closed,false);assert.equal(JSON.parse(await readFile(join(c.target,CURRENT_NAMES.lock,'owner.json'),'utf8')).pid,process.pid)}finally{if(timer)clearTimeout(timer);release()}
   await assert.rejects(pending,error=>error instanceof cli.WorldRepairCliFailure&&error.cleanupStatus==='closed');assert.equal(closed,true);await assert.rejects(readFile(join(c.target,CURRENT_NAMES.lock,'owner.json')))
  })
  for(const branch of ['sync-constructor-throw','readiness-reject-close-fails'] as const)await t.test(branch,async()=>{
   let constructed=0,queries=0,closes=0
   await assert.rejects(cli.runWorldRepairCli(c.args(branch),c.env,{constructEngine(){constructed++;if(branch==='sync-constructor-throw')throw Error('WR_CLI_CONTROLLED_CONSTRUCTOR');return {waitReady:Promise.reject(Error('WR_CLI_CONTROLLED_STARTUP')),closed:false,transaction(){queries++;throw Error('must not query')},async close(){closes++;throw Error('WR_CLI_CONTROLLED_CLOSE')}} as unknown as PGlite}}),error=>error instanceof cli.WorldRepairCliFailure&&error.cleanupStatus==='failed')
   assert.equal(constructed,1);assert.equal(queries,0);assert.equal(closes,branch==='sync-constructor-throw'?0:1);const ownedLease=await readFile(join(c.target,CURRENT_NAMES.lock,'owner.json'),'utf8');assert.equal(JSON.parse(ownedLease).pid,process.pid);await assert.rejects(cli.runWorldRepairCli(c.args(branch+'-blocked'),c.env),/LEASE/);assert.equal(await readFile(join(c.target,CURRENT_NAMES.lock,'owner.json'),'utf8'),ownedLease)
   // This is our fake constructor and our /tmp lease; no engine was opened.
   // Production retains the lease on these unknown-close branches.
   await rm(join(c.target,CURRENT_NAMES.lock),{recursive:true})
  })
  for(const status of ['dry-run','committed','restored'])assert.equal(cli.worldRepairCliExitCode({status,cleanupStatus:'closed'}),0)
  for(const status of ['acknowledgement-unknown','committed-export-failed','future-status'])assert.equal(cli.worldRepairCliExitCode({status,cleanupStatus:'closed'}),2)
  assert.equal(cli.worldRepairCliExitCode({status:'committed',cleanupStatus:'failed'}),2)
  assert.deepEqual(await c.inspect(),c.baseline);await assert.rejects(readFile(join(c.target,CURRENT_NAMES.lock,'owner.json')))
 }finally{await rm(c.root,{recursive:true,force:true})}
})
