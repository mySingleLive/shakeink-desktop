import assert from 'node:assert/strict'
import {test} from 'node:test'
import {bufferResponse,isStreamingResponse} from '../../desktop/service/local-response'

// NI-20 · docs/567 3R
async function drain(reader:ReadableStreamDefaultReader<Uint8Array>){const parts:Uint8Array[]=[];for(;;){const c=await reader.read();if(c.done)break;parts.push(c.value)}return Buffer.concat(parts)}

test('LR-01: a JSON body is read in full before the scope ends; the buffered reader yields the same bytes',async()=>{
 let pulled=false
 const body=new ReadableStream<Uint8Array>({pull(c){if(!pulled){pulled=true;c.enqueue(new TextEncoder().encode('{"ok":'));return}c.enqueue(new TextEncoder().encode('true}'));c.close()}})
 const r=await bufferResponse(new Response(body,{headers:{'content-type':'application/json'}}))
 assert.equal(r.buffered,true);assert.equal((await drain(r.reader)).toString(),'{"ok":true}')
})
test('LR-02: empty and 404 JSON bodies are buffered (the cases that kept a deleted work busy)',async()=>{
 const empty=await bufferResponse(new Response(null,{status:200}))
 assert.equal(empty.buffered,true);assert.equal((await drain(empty.reader)).length,0)
 const missing=await bufferResponse(Response.json({error:'作品不存在'},{status:404}))
 assert.equal(missing.buffered,true);assert.deepEqual(JSON.parse((await drain(missing.reader)).toString()),{error:'作品不存在'})
})
test('LR-03: event streams and AI SDK text streams are not read ahead',async()=>{
 for(const type of ['text/event-stream','text/event-stream; charset=utf-8','text/plain; charset=utf-8']){
  let reads=0
  const body=new ReadableStream<Uint8Array>({pull(c){reads++;c.enqueue(new Uint8Array([1]))}},{highWaterMark:0})
  const response=new Response(body,{headers:{'content-type':type}})
  assert.equal(isStreamingResponse(response),true,type)
  const r=await bufferResponse(response)
  assert.equal(r.buffered,false,type);assert.equal(reads,0,type)
  await r.reader.cancel()
 }
})
test('LR-04: a body over the limit keeps the streaming lifetime and loses no bytes',async()=>{
 const chunks=[new Uint8Array(6).fill(1),new Uint8Array(6).fill(2),new Uint8Array(6).fill(3)];let i=0
 const body=new ReadableStream<Uint8Array>({pull(c){if(i<chunks.length)c.enqueue(chunks[i++]);else c.close()}})
 const r=await bufferResponse(new Response(body,{headers:{'content-type':'application/octet-stream'}}),10)
 assert.equal(r.buffered,false)
 assert.deepEqual([...await drain(r.reader)],[...chunks.flatMap(c=>[...c])])
})
test('LR-05: cancelling an over-limit body cancels its source',async()=>{
 let cancelled=false
 const body=new ReadableStream<Uint8Array>({pull(c){c.enqueue(new Uint8Array(8))},cancel(){cancelled=true}})
 const r=await bufferResponse(new Response(body),4)
 assert.equal(r.buffered,false);await r.reader.cancel();assert.equal(cancelled,true)
})
test('LR-06: a body read error rejects instead of returning a partial buffer',async()=>{
 const body=new ReadableStream<Uint8Array>({pull(c){c.error(Error('disk read failed'))}})
 await assert.rejects(bufferResponse(new Response(body,{headers:{'content-type':'application/json'}})),/disk read failed/)
})

// docs/569 补充审核 3R 中2: the actual start() from desktop/service/index.ts, extracted from source.
import {readFileSync} from 'node:fs'
import ts from 'typescript'
import {transformSync} from 'esbuild'
function startFromSource(){
 const file=ts.createSourceFile('service.ts',readFileSync('desktop/service/index.ts','utf8'),ts.ScriptTarget.Latest,true)
 let text='';const scan=(n:ts.Node)=>{if(ts.isFunctionDeclaration(n)&&n.name?.text==='start')text=n.getText(file);ts.forEachChild(n,scan)};scan(file)
 assert.ok(text,'start() found in desktop/service/index.ts')
 return text
}
function harness(response:()=>Response){
 let active=0
 const responses=new Map<string,{reader:ReadableStreamDefaultReader<Uint8Array>;done():void}>(),starting=new Map(),pendingStarts=new Set<Promise<void>>()
 const deps={
  parseConversationWorkerRequest:(value:unknown)=>({request:value,origin:undefined}),closing:false,responses,starting,pendingStarts,
  dispatcher:{workspaceFor:async()=>'work-a',handle:async()=>response()},
  works:{runWithGlobal:async(_id:string,run:()=>Promise<unknown>)=>{active++;try{return await run()}finally{active--}}},
  runInDatabaseContext:(_c:unknown,run:()=>unknown)=>run(),getDatabaseContext:()=>({}),runWithNewTaskDefaults:(run:()=>unknown)=>run(),bufferResponse,
 }
 const start=new Function(...Object.keys(deps),transformSync(startFromSource()+'\nreturn start',{loader:'ts'}).code)(...Object.values(deps)) as (value:unknown)=>Promise<{status:number}>
 return {start,responses,pendingStarts,get active(){return active}}
}
const tick=()=>new Promise(r=>setTimeout(r,10))
test('LR-07: actual start() releases the work scope for a JSON reply whose body is never read',async()=>{
 const h=harness(()=>Response.json({error:'作品不存在'},{status:404}))
 const head=await h.start({id:'req-json',path:'/api/novels/x',method:'GET'});await tick()
 assert.equal(head.status,404);assert.equal(h.active,0,'work database released before the body is read')
 assert.equal(h.pendingStarts.size,1,'request still in flight until read or cancelled')
 const entry=h.responses.get('req-json')!;assert.equal(JSON.parse(Buffer.from((await entry.reader.read()).value!).toString()).error,'作品不存在')
 assert.equal((await entry.reader.read()).done,true);entry.done();await tick();assert.equal(h.pendingStarts.size,0)
})
test('LR-08: actual start() keeps the work scope for an event stream until it is finished',async()=>{
 let push!:ReadableStreamDefaultController<Uint8Array>
 const h=harness(()=>new Response(new ReadableStream<Uint8Array>({start(c){push=c}}),{headers:{'content-type':'text/event-stream'}}))
 await h.start({id:'req-sse',path:'/api/chat',method:'POST'});await tick()
 assert.equal(h.active,1,'stream holds the work database')
 push.enqueue(new Uint8Array([1]));push.close()
 const entry=h.responses.get('req-sse')!;await entry.reader.read();assert.equal((await entry.reader.read()).done,true);entry.done();await tick()
 assert.equal(h.active,0);assert.equal(h.pendingStarts.size,0)
})
