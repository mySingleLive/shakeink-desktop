import assert from 'node:assert/strict'
import {test} from 'node:test'
import {sceneRosterFragmentUnits,createSceneRosterFragmentTable,sceneRosterFragmentWidth,withSceneFragmentDigestForTest,SCENE_FRAGMENT_COMPACT_REFS} from '../../desktop/core/novel-import-scene-roster-fragments'
import {sceneRosterNativeSchema} from '../../desktop/core/novel-import-scene-roster-native'
import {serializeImportAiPayload,importAiPrompt} from '../../desktop/core/novel-import-ai-payload'
import type {ImportAiRequest,ImportUnit} from '../../desktop/shared/novel-import'

// docs/529 core cases. Synthetic data only.
const unit=(i:number,text:string):ImportUnit=>({id:'u-'+i,fileId:'f',start:i*1000,end:i*1000+text.length,text,kind:'body'})
const texts=['北宅。书房开门，南宅也有书房。','红门，东室中留着铜钥匙。😀\r\n','引号"与\\反斜杠\t、尾部空白   ','单片']
const list=()=>texts.map((t,i)=>unit(i,t))
const model={id:'m',name:'合成',provider:'deepseek',protocol:'openai',endpoint:'https://api.deepseek.com',modelId:'deepseek-flash',kind:'TEXT',enabled:true,authRevision:1,contextWindow:1048576,thinkingLevels:[],defaultThinking:'none'} as never
const roster=(units=list(),compact=true):Omit<ImportAiRequest,'operationId'|'models'>=>({semanticVersion:1,phase:'analyze',intent:'roster',kind:'scene',sceneIdentity:{version:1,mode:'roster'},units,artifacts:[],workingRevision:0,selectedTargets:['scene'],semanticLocks:[],chapters:[],entities:[],...(compact?{sceneFragmentRefs:SCENE_FRAGMENT_COMPACT_REFS}:{})})

test('SC-05: compact refs are deterministic, distinct across units and not prefixes of v1 refs',()=>{
 const a=createSceneRosterFragmentTable(list(),12),b=createSceneRosterFragmentTable(structuredClone(list()),12),v1=createSceneRosterFragmentTable(list(),16)
 assert.deepEqual(a.units,b.units);assert.equal(a.width,12);assert.equal(v1.width,16)
 const refs=a.units.flatMap(u=>u.fragments.map(f=>f.ref)),old=v1.units.flatMap(u=>u.fragments.map(f=>f.ref))
 assert.ok(refs.every(r=>/^ef[0-9a-f]{12}$/u.test(r)));assert.ok(old.every(r=>/^ef[0-9a-f]{16}$/u.test(r)))
 assert.equal(new Set(refs).size,refs.length);assert.ok(refs.every(r=>!old.some(o=>o.startsWith(r))),'new domain, not a v1 prefix')
 const twin=createSceneRosterFragmentTable([unit(0,'同一句。'),unit(1,'同一句。')],12).units.flatMap(u=>u.fragments.map(f=>f.ref));assert.notEqual(twin[0],twin[1])
 // Default (no width) is the old v1 table, byte for byte.
 assert.deepEqual(createSceneRosterFragmentTable(list()).units,v1.units);assert.deepEqual(sceneRosterFragmentUnits(list()),v1.units)
})
test('SC-06: a 12-character collision makes the whole packet fall back to v1; a v1 collision still throws',()=>{
 const r=roster()
 assert.equal(sceneRosterFragmentWidth(r),12);assert.equal(sceneRosterFragmentWidth(roster(list(),false)),16)
 withSceneFragmentDigestForTest(value=>value.includes('scene-roster-fragment-ref-v2')?'a'.repeat(64):undefined,()=>{
  assert.equal(sceneRosterFragmentWidth(r),16)
  const data=JSON.parse(serializeImportAiPayload(r));assert.ok(data.units[0].fragments.every((f:unknown[])=>/^ef[0-9a-f]{16}$/u.test(f[2] as string)))
  const schema=JSON.stringify(sceneRosterNativeSchema(r as never,model,'first'));assert.ok(schema.includes('^ef[0-9a-f]{16}$'));assert.ok(!schema.includes('^ef[0-9a-f]{12}$'))
 })
 withSceneFragmentDigestForTest(()=>'b'.repeat(64),()=>assert.throws(()=>sceneRosterFragmentWidth(r),/场景片段引用重复/u))
})
test('SC-04: compact wire fragments are [index,text,ref] triples; internal structure and the old wire are unchanged',()=>{
 const r=roster(),payload=serializeImportAiPayload(r),data=JSON.parse(payload)
 assert.equal(payload.includes('sceneFragmentRefs'),false)
 const table=createSceneRosterFragmentTable(r.units,12)
 for(const [i,u] of data.units.entries()){
  assert.ok(Array.isArray(u.fragments[0]));assert.deepEqual(u.fragments,table.units[i].fragments.map(f=>[f.index,f.text,f.ref]))
  assert.equal(u.fragments.map((f:unknown[])=>f[1]).join(''),texts[i],'texts rejoin exactly, including CRLF, quotes, tabs and trailing spaces')
 }
 assert.equal(data.units[3].fragments.length,1,'single-fragment unit')
 const old=JSON.parse(serializeImportAiPayload(roster(list(),false)));assert.ok(old.units[0].fragments.every((f:Record<string,unknown>)=>Object.keys(f).join()==='index,text,ref'))
 assert.ok(payload.length<serializeImportAiPayload(roster(list(),false)).length)
})
test('SC-08: zod and native schemas follow the packet width',()=>{
 const compact=JSON.stringify(sceneRosterNativeSchema(roster() as never,model,'first')),old=JSON.stringify(sceneRosterNativeSchema(roster(list(),false) as never,model,'first'))
 assert.ok(compact.includes('^ef[0-9a-f]{12}$')&&!compact.includes('^ef[0-9a-f]{16}$'));assert.ok(old.includes('^ef[0-9a-f]{16}$')&&!old.includes('^ef[0-9a-f]{12}$'))
})
test('SC-13: compact prompt describes triples with a width-matched example; old prompt unchanged',()=>{
 const p=importAiPrompt(roster()),o=importAiPrompt(roster(list(),false))
 assert.ok(p.includes('[编号,原文,ref]'));assert.ok(!/ef0123456789abcdef[^0-9a-f]/u.test(p)||false);assert.ok(p.includes('"ef0123456789ab"'))
 assert.ok(o.includes('ef0123456789abcdef'));assert.ok(!o.includes('[编号,原文,ref]'))
})

// Controller cases through the real scene fixture (real runImportAi and generateImportAiJson).
import {sceneFixture,bodyOf} from '../helpers/novel-import-scene-cleanup-fixture'
import {runImportAi} from '../../desktop/service/novel-import-ai'
const rows=[{mentions:[{literal:'北宅',quote:'北宅'}]},{mentions:[{literal:'书房',quote:'书房开门'}]},{mentions:[{literal:'西市',quote:'西市'}]}]
const text=()=>bodyOf(['北宅。书房开门，人声渐远。','西市。人群拥挤。'],1100)+('长街漫漫，'.repeat(9000))
const sceneRosters=(requests:ImportAiRequest[])=>requests.filter(r=>r.sceneIdentity?.mode==='roster')

test('SC-02/SC-03/SC-09: compact sessions attach refs only to scene roster packets; batches equal the legacy session',async()=>{
 const compact=await sceneFixture(rows,text(),{},{sceneFragmentLayout:'compact-v1'}),legacy=await sceneFixture(rows,text(),{},{promptLayout:'legacy'})
 try{
  const v=await compact.toList();assert.equal(compact.session().sceneFragmentLayout,'compact-v1')
  assert.ok((v.wizard!.candidates.scene??[]).length>=2,'roster recognized through the compact layout')
  const rostersC=sceneRosters(compact.requests);assert.ok(rostersC.length>=1)
  for(const r of rostersC)assert.deepEqual(r.sceneFragmentRefs,{version:1,width:12})
  for(const r of compact.requests.filter(r=>r.sceneIdentity?.mode!=='roster'))assert.equal(r.sceneFragmentRefs,undefined,String(r.sceneIdentity?.mode??r.intent))
  await legacy.toList();assert.equal(legacy.session().sceneFragmentLayout,undefined)
  const rostersL=sceneRosters(legacy.requests);assert.ok(rostersL.length>=1)
  for(const r of rostersL)assert.equal(r.sceneFragmentRefs,undefined)
  assert.deepEqual(rostersC.map(r=>r.units.map(u=>u.id)),rostersL.map(r=>r.units.map(u=>u.id)),'identical batches')
 }finally{await compact.dispose();await legacy.dispose()}
})
test('SC-14: the service rejects malformed or misplaced compact fields before resolving a model',async()=>{
 const m=model,ok={...roster(),operationId:'sc-op',models:{text:m,review:m}} as ImportAiRequest
 let resolved=0;const deps={resolve:async()=>{resolved++;return m},assert:async()=>{},generate:async()=>({roster:[]})}
 for(const bad of [{...ok,sceneFragmentRefs:{version:1,width:16}},{...ok,sceneFragmentRefs:{version:1,width:12,more:1}},{...ok,sceneIdentity:undefined,intent:'roster',kind:'character'},{...ok,sceneParentTargets:[]},{...ok,semanticVersion:undefined,selectedTargets:undefined,semanticLocks:undefined,intent:undefined,sceneIdentity:undefined}] as ImportAiRequest[])
  await assert.rejects(runImportAi(bad,new AbortController().signal,deps),/场景片段布局无效|共享原文请求无效/u)
 assert.equal(resolved,0)
})
test('SC-07: compact packets resolve 12-character refs; wrong widths and unknown refs are rejected',async()=>{
 const {sceneRosterGenerationSchema}=await import('../../desktop/service/novel-import-ai')
 const r={...roster(),operationId:'sc-op',models:{text:model,review:model}} as ImportAiRequest,t=createSceneRosterFragmentTable(r.units,12),v1=createSceneRosterFragmentTable(r.units,16)
 const ref=t.units[0].fragments[0].ref,literal='北宅',schema=sceneRosterGenerationSchema(r)
 const rec=(evidence:unknown)=>({roster:[{mentions:[{literal,evidence}],context:[],links:[]}]})
 assert.equal(schema.safeParse(rec({ref})).success,true)
 assert.equal(schema.safeParse(rec({ref:v1.units[0].fragments[0].ref})).success,false,'16-character ref in a 12-character packet')
 assert.equal(schema.safeParse(rec({ref:'ef'+'f'.repeat(12)})).success,false,'unknown 12-character ref')
 assert.equal(schema.safeParse(rec({unitIndex:0,fromFragment:0,toFragment:1})).success,true,'explicit span still works')
})

test('SC-16: usage lines report the packet ref width; counters carry counts only',async()=>{
 const {observeImportUsage}=await import('../../desktop/service/novel-import-ai')
 const rows:string[]=[],reply={text:'{}',promptTokens:1,completionTokens:1,cost:0,finishReason:'stop'}
 for(const r of [roster(),roster(list(),false),{phase:'analyze',intent:'roster',kind:'character'}])await observeImportUsage(r as never,async()=>reply,line=>rows.push(line))({prompt:'x'} as never)
 assert.deepEqual(rows.map(l=>JSON.parse(l.slice('import-usage '.length)).refWidth),[12,16,null])
 assert.ok(rows.every(l=>Buffer.byteLength(l)<=768))
})
test('SC-07b/SC-16b: a wrong-width ref writes a counter line with no ref value when debugging',async()=>{
 const {sceneRosterGenerationSchema}=await import('../../desktop/service/novel-import-ai')
 const r={...roster(),operationId:'sc-op',models:{text:model,review:model}} as ImportAiRequest,lines:string[]=[],original=console.error,env=process.env.SHAKEINK_IMPORT_DEBUG
 const unknown='ef'+'f'.repeat(12)
 console.error=(...a:unknown[])=>{lines.push(a.map(String).join(' '))};process.env.SHAKEINK_IMPORT_DEBUG='1'
 try{sceneRosterGenerationSchema(r).safeParse({roster:[{mentions:[{literal:'北宅',evidence:{ref:unknown}}],context:[],links:[]}]});sceneRosterGenerationSchema(r).safeParse({roster:[{mentions:[{literal:'北宅',evidence:{unitIndex:0,fromFragment:0,toFragment:1}}],context:[],links:[]}]})}
 finally{console.error=original;if(env===undefined)delete process.env.SHAKEINK_IMPORT_DEBUG;else process.env.SHAKEINK_IMPORT_DEBUG=env}
 assert.ok(lines.includes('scene-roster-ref-invalid {"count":1}'));assert.ok(lines.includes('scene-roster-span {"count":1}'));assert.ok(lines.every(l=>!l.includes(unknown)))
})
test('SC-15: the controller rejects a caller field that differs from its snapshot',async()=>{
 const f=await sceneFixture(rows,text(),{},{sceneFragmentLayout:'compact-v1'})
 try{
  await f.toList();const c=f.controller as unknown as {session:never;ai(s:never,e:number,r:unknown,v:boolean):Promise<unknown>},s=c.session as {epoch:number}
  const req=sceneRosters(f.requests)[0],{operationId:_o,models:_m,...rest}=req,before=f.requests.length
  for(const bad of [{...rest,sceneFragmentRefs:undefined},{...rest,sceneFragmentRefs:{version:1,width:16}}])await assert.rejects(c.ai(c.session,s.epoch,bad,false),/场景片段布局无效/u)
  const {sceneFragmentRefs:_x,...character}={...rest,kind:'character' as const,sceneIdentity:undefined}
  await assert.rejects(c.ai(c.session,s.epoch,{...character,sceneFragmentRefs:{version:1,width:12}},false),/场景片段布局无效/u)
  assert.equal(f.requests.length,before,'options.ai was not called')
 }finally{await f.dispose()}
})

test('SC-02c: after docs/528 §7 new sessions do not use compact refs unless opted in',async()=>{
 const f=await sceneFixture(rows,text())
 try{await f.toList();assert.equal(f.session().sceneFragmentLayout,undefined);for(const r of f.requests)assert.equal(r.sceneFragmentRefs,undefined)}finally{await f.dispose()}
})
