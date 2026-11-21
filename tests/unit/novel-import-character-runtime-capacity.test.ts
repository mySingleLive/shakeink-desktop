import assert from 'node:assert/strict'
import {test} from 'node:test'
import {randomUUID} from 'node:crypto'
import {mkdir,writeFile,readFile} from 'node:fs/promises'
import {join} from 'node:path'
import * as h from '../../desktop/core/novel-import-runtime-proof'
import {NovelImportController,encodeImportJournal} from '../../desktop/main/novel-import'
import {fixture,rosterAi,entityResult,toImportChar} from '../helpers/novel-import-wizard-fixture'

test('CP-13c: all 32 actual promises fit; 33 is refused; complete proof survives journal recovery',async()=>{
 const f=await fixture(undefined,rosterAi()),base=f.handler();f.setAi(async r=>r.intent==='entity'?entityResult(r):base(r));let recovered:NovelImportController|undefined
 const release:Array<()=>void>=[]
 try{await toImportChar(f);await f.settle();const s=await f.journal(),tracker=new h.ImportRuntimeProofTracker(randomUUID()),promises:Promise<void>[]=[]
  for(let i=0;i<32;i++)promises.push(tracker.invoke({version:1,processRunId:tracker.processRunId,sessionId:s.id,operationId:randomUUID(),epoch:s.epoch,phase:'analyze',kind:'character',intent:'entity',workingRevision:s.workingRevision,scopeHash:'a'.repeat(64),payloadHash:'b'.repeat(64),startedAt:new Date().toISOString()},()=>new Promise<void>(r=>release.push(r))))
  const capturedAt=new Date().toISOString(),calls=tracker.pending();assert.equal(calls.length,32);let invoked=false
  assert.throws(()=>tracker.invoke({...calls[0],operationId:randomUUID()},()=>{invoked=true;return Promise.resolve()}),/容量/);assert.equal(invoked,false)
  release.forEach(r=>r());await Promise.all(promises);assert.equal(tracker.pending().length,0)
  const proof={version:1 as const,processRunId:tracker.processRunId,sessionId:s.id,oldEpoch:s.epoch,newEpoch:s.epoch+1,capturedAt,barrierAt:new Date().toISOString(),state:'drained' as const,calls,remaining:{pendingCalls:0,operations:0,workflowJobs:0,pdfActive:0,pdfRequests:0,imageOperations:0}},diag={runtimeAiCall:tracker.last,runtimePauseProof:proof}
  assert.ok(h.parseImportRuntimeDiagnostics(s.id,diag));assert.ok(Buffer.byteLength(JSON.stringify(diag))<=32768);assert.equal(h.parseImportRuntimeDiagnostics(s.id,diag,{maxBytes:16384}),null)
  assert.ok(h.parseImportRuntimeDiagnostics(s.id,{runtimePauseProof:{...proof,calls:calls.slice(0,16)}}),'old sixteen-call proofs remain valid')
  for(const patch of [{calls:[...calls,calls[0]]},{remaining:{...proof.remaining,operations:1}},{newEpoch:proof.newEpoch+1}])assert.equal(h.parseImportRuntimeDiagnostics(s.id,{runtimePauseProof:{...proof,...patch}}),null)
  const saved=JSON.parse(encodeImportJournal({...s,epoch:proof.newEpoch,...diag}));assert.deepEqual(saved.runtimePauseProof,proof)
  await f.controller.close();const dir=join(f.root,'novel-imports',s.id);await mkdir(dir,{recursive:true});await writeFile(join(dir,'.owner'),'shakeink-novel-import-v1\n'+s.id+'\n');await writeFile(join(dir,'session.json'),JSON.stringify({...saved,publication:{requestId:s.id}}))
  recovered=new NovelImportController(f.options);await recovered.initialize();assert.equal((await recovered.act({type:'current'})).view!.id,s.id)
  const restored=JSON.parse(await readFile(join(dir,'session.json'),'utf8'));assert.deepEqual(restored.runtimePauseProof,proof);assert.equal(restored.runtimePauseProof.calls.length,32)
 }finally{release.forEach(r=>r());await recovered?.close();await f.dispose()}
})
