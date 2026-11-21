import assert from 'node:assert/strict'
import {after,before,test} from 'node:test'
import {mkdtemp,rm} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {PGlite} from '@electric-sql/pglite'
import type {SqlDriverAdapter,SqlDriverAdapterFactory} from '@prisma/driver-adapter-utils'
import {PrismaClient} from '../../src/generated/prisma/client'
import {LocalPGliteAdapter} from '../../desktop/service/database/pglite-adapter'
import {loadMigrations,migrateDatabase} from '../../desktop/service/database/migrations'
import {LOCAL_AUTHOR_ID,runInDatabaseContext,type DatabaseAuthority,type DatabaseContext} from '../../desktop/service/context'
import {recordUsage,type RecordUsageInput} from '../../src/lib/quota'
import {runInChatExecution} from '../../src/lib/chat-execution'
import type {PublicModel} from '../../desktop/core/settings'

// Formal migrations, real generated Prisma and real LocalPGliteAdapter only.
// Every database and row is synthetic and confined to this temporary root.
const actions=['novel.import.classify','novel.import.analyze','novel.import.review','novel.import.patch'] as const
const importTransactionOptions={maxWait:60000}
const model:PublicModel={id:'usage-synthetic-model',name:'合成用量模型😀',provider:'synthetic',protocol:'openai',endpoint:'https://usage.invalid/v1',modelId:'usage-synthetic',kind:'TEXT',enabled:true,authRevision:7,contextWindow:1048576,keyMask:'synthetic',thinkingLevels:[],defaultThinking:'none',inputCostPer1k:1.25,outputCostPer1k:2.5}
let root:string,seed:Blob,migrations:Awaited<ReturnType<typeof loadMigrations>>,serial=0
const pause=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms))
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(yes=>{resolve=yes});return{promise,resolve}}
async function bounded<T>(promise:Promise<T>,ms:number,label:string):Promise<T>{let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([promise,new Promise<T>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Synthetic fixture timeout: '+label)),ms)})])}finally{if(timer)clearTimeout(timer)}}
const input=(action:string=actions[1],extra:Partial<RecordUsageInput>={}):RecordUsageInput=>({userId:LOCAL_AUTHOR_ID,novelId:'usage-novel',modelId:model.id,modelSnapshot:structuredClone(model),action,promptTokens:11,completionTokens:13,...extra})
before(async()=>{
 root=await mkdtemp(join(tmpdir(),'shakeink-import-usage-'))
 migrations=await loadMigrations(resolve('prisma/migrations'))
 const pg=await PGlite.create({dataDir:join(root,'seed'),relaxedDurability:false,startParams:[...PGlite.defaultStartParams,'-c','shared_buffers=32MB']})
 let db:PrismaClient|undefined
 try{await migrateDatabase(pg,migrations);db=new PrismaClient({adapter:new LocalPGliteAdapter(pg)});await db.user.create({data:{id:LOCAL_AUTHOR_ID,email:'synthetic-usage@invalid.test',passwordHash:'not-a-real-password',name:'合成本地作者'}});await db.novel.create({data:{id:'usage-novel',userId:LOCAL_AUTHOR_ID,title:'合成隔离作品'}});await db.$disconnect();db=undefined;seed=await pg.dumpDataDir('gzip')}finally{await db?.$disconnect();await pg.close()}
})
after(async()=>{if(root)await rm(root,{recursive:true,force:true})})
async function fixture(label:string){
 const pg=await PGlite.create({dataDir:join(root,label+'-'+serial++),loadDataDir:seed,relaxedDurability:false,startParams:[...PGlite.defaultStartParams,'-c','shared_buffers=32MB']}),connections:SqlDriverAdapter[]=[],native=new LocalPGliteAdapter(pg)
 const factory:SqlDriverAdapterFactory={provider:native.provider,adapterName:native.adapterName,connect:async()=>{const connection=await native.connect();connections.push(connection);return connection}}
 const db=new PrismaClient({adapter:factory}),shapes:('array'|'callback')[]=[],transactionOptions:unknown[]=[]
 const scoped=new Proxy(db,{get(target,key){if(key==='$transaction')return(run:unknown,options?:unknown)=>{shapes.push(Array.isArray(run)?'array':'callback');transactionOptions.push(options);return Reflect.apply(target.$transaction,target,[run,options])};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value}})
 assert.deepEqual((await pg.query<{id:string;checksum:string}>('SELECT id,checksum FROM "_desktop_migrations" ORDER BY id')).rows,migrations.map(({id,checksum})=>({id,checksum})).sort((a,b)=>a.id.localeCompare(b.id)))
 const context:DatabaseContext={workspaceId:'usage-'+label,database:scoped}
 let closed=false
 return{pg,db,scoped,shapes,transactionOptions,context,run:<T>(call:()=>T)=>runInDatabaseContext(context,call),close:async()=>{if(closed)return;closed=true
  // Prisma may abandon a starter after P2028. Dispose the actual test adapter
  // before disconnect so that its delayed native lease is rolled back.
  await bounded(Promise.allSettled(connections.map(c=>c.dispose())),10000,'adapter disposal');await bounded(db.$disconnect(),10000,'client disconnect');await bounded(pg.close(),10000,'engine close')
 }}
}
type Fixture=Awaited<ReturnType<typeof fixture>>
const count=(f:Fixture)=>f.db.usageRecord.count()
const tokens=async(f:Fixture)=>(await f.db.user.findUniqueOrThrow({where:{id:LOCAL_AUTHOR_ID}})).tokenUsed

test('UT-01: 31 simultaneous import usage writes commit once each with exact counters and costs',{timeout:60000},async t=>{
 const f=await fixture('burst')
 try{
  const requests=Array.from({length:31},(_,i)=>input(actions[i%actions.length],{promptTokens:i+1,completionTokens:i+2,turnId:'synthetic-turn-'+i,attemptId:'synthetic-attempt-'+i})),before=structuredClone(requests)
  const outcomes=await bounded(Promise.allSettled(requests.map(row=>f.run(()=>recordUsage(row)))),20000,'31 usage burst'),failures=outcomes.filter(row=>row.status==='rejected')
  t.diagnostic(JSON.stringify({writes:31,succeeded:31-failures.length,errorCodes:failures.map(row=>{const e=(row as PromiseRejectedResult).reason;return e&&typeof e==='object'&&'code'in e?String(e.code):'other'})}))
  assert.equal(failures.length,0,'every original database operation must actually commit')
  assert.equal(await count(f),31);assert.equal(await tokens(f),1023n);assert.deepEqual(f.shapes,Array(31).fill('callback'),'the original atomic callback remains');assert.deepEqual(f.transactionOptions,Array(31).fill(importTransactionOptions),'only exact import actions receive bounded transaction capacity')
  const rows=await f.db.usageRecord.findMany({orderBy:{turnId:'asc'}});assert.equal(new Set(rows.map(row=>row.id)).size,31)
  for(const request of requests){const row=rows.find(row=>row.turnId===request.turnId)!;assert.ok(row);assert.equal(row.action,request.action);assert.equal(row.attemptId,request.attemptId);assert.equal(row.novelId,'usage-novel');assert.equal(row.promptTokens,request.promptTokens);assert.equal(row.completionTokens,request.completionTokens);const expected=request.promptTokens/1000*1.25+request.completionTokens/1000*2.5;assert.ok(Math.abs(row.cost-expected)<1e-12)}
  assert.deepEqual(requests,before)
 }finally{await f.close()}
})

test('UT-02: import usage waits behind a real external transaction beyond interactive maxWait without P2028',{timeout:60000},async t=>{
 const f=await fixture('held'),entered=deferred(),release=deferred();let holder:Promise<unknown>|undefined
 try{
  holder=f.pg.transaction(async tx=>{await tx.query('SELECT 1');entered.resolve();await release.promise})
  await entered.promise;let settled=0;const started=Date.now()
  const writing=Promise.all(Array.from({length:31},(_,i)=>f.run(()=>recordUsage(input(actions[i%actions.length],{promptTokens:i+1,completionTokens:i+2}))).then(value=>{settled++;return{ok:true as const,value}},error=>{settled++;return{ok:false as const,code:error&&typeof error==='object'&&'code'in error?String(error.code):'other'}})))
  await pause(2400);const settledWhileHeld=settled,heldMilliseconds=Date.now()-started;release.resolve();await holder;holder=undefined
  const outcomes=await bounded(writing,15000,'blocked usage outcomes'),failures=outcomes.filter(row=>!row.ok);t.diagnostic(JSON.stringify({heldAtLeastMilliseconds:heldMilliseconds,settledWhileHeld,writes:31,succeeded:31-failures.length,errorCodes:failures.map(row=>row.ok?'none':row.code)}))
  assert.equal(failures.length,0,'bounded import callbacks must wait and commit; original defaults report P2028')
  assert.equal(settledWhileHeld,0,'no result can commit while the real engine lease is held');assert.equal(await count(f),31);assert.equal(await tokens(f),1023n)
 }finally{release.resolve();await holder?.catch(()=>{});await f.close()}
})

test('UT-03: second and third write failures roll back model, usage and counter together, then recover',{timeout:60000},async t=>{
 const f=await fixture('rollback')
 try{
  await t.test('invalid novel foreign key rolls back the preceding model upsert',async()=>{
   const value=input(actions[1],{modelId:'rollback-second-model',modelSnapshot:{...model,id:'rollback-second-model'},novelId:'synthetic-missing-novel'})
   await assert.rejects(f.run(()=>recordUsage(value)),{code:'P2003'});assert.equal(await f.db.aIModel.findUnique({where:{id:value.modelId}}),null);assert.equal(await count(f),0);assert.equal(await tokens(f),0n)
  })
  await t.test('actual BIGINT counter overflow rolls back both earlier writes',async()=>{
   await f.db.user.update({where:{id:LOCAL_AUTHOR_ID},data:{tokenUsed:9223372036854775807n}})
   const value=input(actions[2],{modelId:'rollback-third-model',modelSnapshot:{...model,id:'rollback-third-model'},promptTokens:1,completionTokens:0})
   await assert.rejects(f.run(()=>recordUsage(value)));assert.equal(await f.db.aIModel.findUnique({where:{id:value.modelId}}),null);assert.equal(await count(f),0);assert.equal(await tokens(f),9223372036854775807n)
   await f.db.user.update({where:{id:LOCAL_AUTHOR_ID},data:{tokenUsed:0n}})
   assert.ok(await f.run(()=>recordUsage(input()))>0);assert.equal(await count(f),1);assert.equal(await tokens(f),24n)
  })
 }finally{await f.close()}
})

test('UT-04: request workspace and the same trusted authority remain binding',{timeout:60000},async t=>{
 const a=await fixture('authority-a'),b=await fixture('authority-b')
 try{
  a.context.globalDatabase=b.db
  await a.run(()=>recordUsage(input(actions[0])));await b.run(()=>recordUsage(input(actions[3],{modelId:'usage-b-model',modelSnapshot:{...model,id:'usage-b-model'},promptTokens:3,completionTokens:4})))
  assert.equal(await count(a),1);assert.equal(await tokens(a),24n);assert.equal(await count(b),1);assert.equal(await tokens(b),7n);assert.equal(await b.db.aIModel.findUnique({where:{id:model.id}}),null,'per-work usage must not borrow globalPrisma')
  let valid=true,calls=0;const revoked=new Error('synthetic authority revoked')
  const authority:DatabaseAuthority={execute:async operation=>{calls++;if(!valid)throw revoked;return operation({...a.context,authority,authorityPhase:true})}}
  const trusted={...a.context,authority}
  await runInDatabaseContext(trusted,()=>recordUsage(input(actions[2],{modelId:'authorized-model',modelSnapshot:{...model,id:'authorized-model'}})));assert.equal(calls,1,'all three atomic writes use one fixed authority')
  const before={records:await count(a),tokens:await tokens(a)};valid=false;calls=0
  await assert.rejects(runInDatabaseContext(trusted,()=>recordUsage(input(actions[1],{modelId:'revoked-model',modelSnapshot:{...model,id:'revoked-model'}}))),error=>error===revoked);assert.equal(calls,1);assert.equal(await a.db.aIModel.findUnique({where:{id:'revoked-model'}}),null);assert.equal(await count(a),before.records);assert.equal(await tokens(a),before.tokens)
 }finally{await a.close();await b.close()}
})

test('UT-05/06: exact action scope, immutable pricing metadata, chat attribution and identity checks persist',{timeout:60000},async t=>{
 const f=await fixture('metadata')
 try{
  for(const action of actions){const start=f.shapes.length;await f.run(()=>recordUsage(input(action)));assert.deepEqual(f.shapes.slice(start),['callback']);assert.deepEqual(f.transactionOptions.slice(start),[importTransactionOptions])}
  for(const action of ['novel.import.analyze.extra','novel.import.analyze ','novel.import.Analyze','outline.generate']){const start=f.shapes.length;await f.run(()=>recordUsage(input(action)));assert.deepEqual(f.shapes.slice(start),['callback'],'near matches and ordinary actions keep their old transaction path');assert.deepEqual(f.transactionOptions.slice(start),[undefined],'other actions retain the exact omitted/default options')}
  const before=structuredClone(model),scope={userId:LOCAL_AUTHOR_ID,conversationId:'uncreated-synthetic-conversation',turnId:'synthetic-scope-turn',attemptId:'synthetic-scope-attempt',epoch:1}
  await f.run(()=>runInChatExecution(scope,()=>recordUsage(input(actions[1]))))
  await f.run(()=>runInChatExecution(scope,()=>recordUsage(input(actions[2],{turnId:'synthetic-explicit-turn',attemptId:'synthetic-explicit-attempt'}))))
  const scopeRow=await f.db.usageRecord.findFirstOrThrow({where:{turnId:scope.turnId}}),explicit=await f.db.usageRecord.findFirstOrThrow({where:{turnId:'synthetic-explicit-turn'}})
  assert.equal(scopeRow.attemptId,scope.attemptId);assert.equal(explicit.attemptId,'synthetic-explicit-attempt');assert.deepEqual(scopeRow.modelSnapshot,{id:model.id,name:model.name,provider:model.provider,modelId:model.modelId,kind:'TEXT',authRevision:7,priceConfigured:true,inputCostPer1k:1.25,outputCostPer1k:2.5});assert.deepEqual(model,before)
  const inert=await f.db.aIModel.findUniqueOrThrow({where:{id:model.id}});assert.equal(inert.apiKeyEncrypted,'');assert.equal(inert.baseUrl,null);assert.equal(inert.enabled,false);assert.equal(inert.free,false);assert.equal(inert.inputCostPer1k,0);assert.equal(inert.outputCostPer1k,0)
  const {inputCostPer1k:_input,outputCostPer1k:_output,...unpriced}=model,noPrice={...unpriced,id:'synthetic-unpriced'};assert.equal(await f.run(()=>recordUsage(input(actions[3],{modelId:noPrice.id,modelSnapshot:noPrice}))),0)
  const row=await f.db.usageRecord.findFirstOrThrow({where:{modelId:noPrice.id}});assert.equal(row.cost,0);assert.deepEqual(row.modelSnapshot,{id:noPrice.id,name:noPrice.name,provider:noPrice.provider,modelId:noPrice.modelId,kind:'TEXT',authRevision:7,priceConfigured:false,inputCostPer1k:null,outputCostPer1k:null})
  const countBefore=await count(f),tokensBefore=await tokens(f)
  await assert.rejects(recordUsage(input()),/No trusted database context/)
  await assert.rejects(f.run(()=>recordUsage(input(actions[1],{userId:'synthetic-foreign-author'}))),/模型或作者不匹配/)
  await assert.rejects(f.run(()=>recordUsage(input(actions[1],{modelId:'synthetic-mismatch'}))),/模型或作者不匹配/)
  assert.equal(await count(f),countBefore);assert.equal(await tokens(f),tokensBefore);assert.equal(await f.db.chatWriteEffect.count(),0,'actual usage escapes the chat write fence while preserving chat metadata')
  t.diagnostic(JSON.stringify({scopeActions:actions.length,nearMatchActions:4,storedRecords:countBefore}))
 }finally{await f.close()}
})

