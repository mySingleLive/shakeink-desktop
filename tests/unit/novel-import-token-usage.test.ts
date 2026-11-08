import assert from 'node:assert/strict'
import {test} from 'node:test'
import {MockLanguageModelV4} from 'ai/test'
import type {LanguageModelV4StreamPart,SharedV4ProviderMetadata} from '@ai-sdk/provider'
import * as imports from '../../desktop/service/novel-import-ai'
import {generateText,generateJSON} from '../../src/lib/ai/generate'
import {runInsideLongTask} from '../../src/lib/long-task'
import {localModelRecord} from '../../desktop/service/models'
import {LOCAL_AUTHOR_ID} from '../../desktop/service/context'
import type {PublicModel} from '../../desktop/core/settings'
import type {ImportAiRequest,ImportArtifact,ImportModel} from '../../desktop/shared/novel-import'
import type {ResolvedModel} from '../../src/lib/ai/provider'
import {z} from 'zod'

// docs/523 TU cases. Synthetic data only: no real source text, model, Key or network.
const pub={id:'00000000-0000-4000-8000-000000000523',name:'合成用量模型',provider:'deepseek',protocol:'openai',endpoint:'https://api.deepseek.com',modelId:'deepseek-flash',kind:'TEXT',enabled:true,authRevision:1,contextWindow:1048576,thinkingLevels:['low','high'],defaultThinking:'high',inputCostPer1k:0,outputCostPer1k:0} as PublicModel
const resolved=(model:ResolvedModel['model'])=>({model,modelRecord:localModelRecord(pub),providerOptions:{}} as unknown as ResolvedModel)
type InputUsage={total:number;noCache:number|undefined;cacheRead:number|undefined;cacheWrite:number|undefined}
const mock=(input:InputUsage,providerMetadata?:SharedV4ProviderMetadata)=>new MockLanguageModelV4({doStream:async()=>({stream:new ReadableStream<LanguageModelV4StreamPart>({start(c){
 const parts:LanguageModelV4StreamPart[]=[{type:'stream-start',warnings:[]},{type:'text-start',id:'0'},{type:'text-delta',id:'0',delta:'{"result":"ready"}'},{type:'text-end',id:'0'},{type:'finish',finishReason:{unified:'stop',raw:'stop'},usage:{inputTokens:input,outputTokens:{total:7,text:7,reasoning:0}},...(providerMetadata?{providerMetadata}:{})}]
 for(const part of parts)c.enqueue(part);c.close()}})})})
const recorder=()=>{const calls:Record<string,unknown>[]=[];return {calls,usage:{checkQuota:imports.readOnlyImportUsage.checkQuota,recordUsage:async(input:Record<string,unknown>)=>{calls.push(input);return 0}} as unknown as typeof imports.readOnlyImportUsage}}
const run=(model:ResolvedModel['model'],usage=imports.readOnlyImportUsage)=>runInsideLongTask(()=>generateText({userId:LOCAL_AUTHOR_ID,action:'synthetic',resolvedModel:resolved(model),usage,maxNetworkRetries:0,prompt:'Return JSON'}))
const RECORD_KEYS=['userId','novelId','modelId','modelSnapshot','action','promptTokens','completionTokens'].sort()

test('TU-01: provider cache metadata is returned; usage recording is unchanged',async()=>{
 const r=recorder(),result=await run(mock({total:100,noCache:30,cacheRead:70,cacheWrite:undefined},{deepseek:{promptCacheHitTokens:70,promptCacheMissTokens:30}}),r.usage)
 assert.equal(result.promptTokens,100);assert.equal(result.cacheReadTokens,70);assert.equal(result.noCacheTokens,30);assert.equal(result.cacheSource,'provider')
 assert.equal(r.calls.length,1);assert.deepEqual(Object.keys(r.calls[0]).sort(),RECORD_KEYS);assert.equal(r.calls[0].promptTokens,100)
})
test('TU-02: without provider metadata the SDK input token details are used',async()=>{
 const result=await run(mock({total:100,noCache:60,cacheRead:40,cacheWrite:undefined}))
 assert.equal(result.cacheReadTokens,40);assert.equal(result.noCacheTokens,60);assert.equal(result.cacheSource,'sdk')
})
test('TU-03: unreported cache details add no keys',async()=>{
 const result=await run(mock({total:100,noCache:undefined,cacheRead:undefined,cacheWrite:undefined}))
 for(const key of ['cacheReadTokens','noCacheTokens','cacheSource'])assert.equal(Object.hasOwn(result,key),false,key)
 assert.deepEqual(Object.keys(result).sort(),['completionTokens','cost','finishReason','promptTokens','text'])
})
test('TU-04: generateJSON result keys are unchanged',async()=>{
 const result=await runInsideLongTask(()=>generateJSON({userId:LOCAL_AUTHOR_ID,action:'synthetic',resolvedModel:resolved(mock({total:100,noCache:30,cacheRead:70,cacheWrite:undefined},{deepseek:{promptCacheHitTokens:70,promptCacheMissTokens:30}})),usage:imports.readOnlyImportUsage,maxNetworkRetries:0,prompt:'Return JSON',schema:z.object({result:z.string()})}))
 assert.deepEqual(Object.keys(result).sort(),['completionTokens','cost','data','finishReason','promptTokens'])
})

// Ordinary analyze request (one scene artifact). Mirrors tests/unit/novel-import-request-schema.test.ts.
const SECRET='TU-SYNTHETIC-SECRET-7f3a',KEY='sk-TUSYNTHETICKEY0123456789abcdef'
const unitId='unit-'+SECRET,sourceText='合成原文首句'+SECRET+'。\n这里是一处小室，仍保留完整尾句。',model:ImportModel={id:'usage-text',name:'合成模型',modelId:'synthetic',endpoint:'https://usage.invalid/v1',authRevision:1,contextWindow:16000}
const scene:ImportArtifact={id:'scene-'+SECRET,kind:'scene',name:'名-'+SECRET,text:'完整合成地点资料',facts:{entityType:'PLACE',coordinates:''},sourceUnitIds:[unitId],evidence:[{unitId,quote:'这里是一处小室'}],origin:'inferred'}
const request=():ImportAiRequest=>({semanticVersion:1,operationId:'52300000-0000-4000-8000-000000000001',phase:'analyze',kind:'scene',units:[{id:unitId,fileId:'synthetic-source',start:0,end:sourceText.length,text:sourceText,kind:'body'}],artifacts:[],workingRevision:0,models:{text:model,review:model},selectedTargets:['scene'],instruction:'指令'+SECRET+KEY})
const good=JSON.stringify({artifacts:[scene]})
type Gen=NonNullable<Parameters<typeof generateJSON>[1]>['generateText']
const reply=(text:string,finishReason='stop',extra:Record<string,unknown>={cacheReadTokens:80,noCacheTokens:20,cacheSource:'provider'})=>({text,promptTokens:100,completionTokens:9,cost:0,finishReason,...extra})
async function capture<T>(debug:string|undefined,body:()=>Promise<T>):Promise<{lines:string[];value:T}>{
 const original=console.error,env=process.env.SHAKEINK_IMPORT_DEBUG,lines:string[]=[]
 console.error=(...args:unknown[])=>{const line=args.map(String).join(' ');if(line.startsWith('import-usage '))lines.push(line)}
 if(debug===undefined)delete process.env.SHAKEINK_IMPORT_DEBUG;else process.env.SHAKEINK_IMPORT_DEBUG=debug
 try{return {lines,value:await body()}}finally{console.error=original;if(env===undefined)delete process.env.SHAKEINK_IMPORT_DEBUG;else process.env.SHAKEINK_IMPORT_DEBUG=env}
}
const call=(r:ImportAiRequest,gen:Gen,prompt='提示'+SECRET+KEY)=>imports.generateImportAiJson(r as Parameters<typeof imports.generateImportAiJson>[0],{userId:LOCAL_AUTHOR_ID,resolvedModel:{} as ResolvedModel},new AbortController().signal,prompt,{generateText:gen})
const parse=(line:string)=>JSON.parse(line.slice('import-usage '.length))
const LINE_KEYS=['op','phase','intent','kind','mode','lane','refWidth','layout','generation','inputTokens','cacheReadTokens','noCacheTokens','cacheSource','outputTokens','promptChars','schemaChars','finishReason'].sort()

test('TU-05: one debug line per returned generation with counts only',async()=>{
 const prompts:string[]=[]
 const {lines,value}=await capture('1',()=>call(request(),async opts=>{prompts.push('prompt' in opts?opts.prompt!:'');return reply(good)}))
 assert.deepEqual(value,{artifacts:[scene]});assert.equal(lines.length,1)
 const row=parse(lines[0]);assert.deepEqual(Object.keys(row).sort(),LINE_KEYS)
 assert.match(row.op,/^[0-9a-f]{8}$/u)
 assert.deepEqual({...row,op:undefined},{op:undefined,phase:'analyze',intent:null,kind:'scene',mode:null,lane:null,refWidth:null,layout:null,generation:1,inputTokens:100,cacheReadTokens:80,noCacheTokens:20,cacheSource:'provider',outputTokens:9,promptChars:prompts[0].length,schemaChars:0,finishReason:'stop'})
})
test('TU-06: a length-truncated generation is still logged before the corrected one',async()=>{
 let n=0
 const {lines}=await capture('1',()=>call(request(),async()=>++n===1?reply('{"artifacts":[','length'):reply(good)))
 assert.equal(n,2);assert.equal(lines.length,2)
 const [a,b]=lines.map(parse);assert.equal(a.op,b.op);assert.equal(a.generation,1);assert.equal(b.generation,2);assert.equal(a.finishReason,'length');assert.equal(a.inputTokens,100)
})
test('TU-07: observer reports scene roster mode and native schema size',async()=>{
 const rows:string[]=[],schema={type:'object',properties:{roster:{type:'array'}}}
 const observed=imports.observeImportUsage({phase:'analyze',intent:'roster',kind:'scene',sceneIdentity:{version:1,mode:'roster'}} as unknown as ImportAiRequest,async()=>reply('{}'),line=>rows.push(line))
 await observed({prompt:'p',jsonOutputSchema:schema} as unknown as Parameters<Gen>[0]);await observed({prompt:'pp'} as Parameters<Gen>[0])
 const [a,b]=rows.map(parse);assert.equal(a.mode,'roster');assert.equal(a.intent,'roster');assert.equal(a.schemaChars,JSON.stringify(schema).length);assert.equal(b.schemaChars,0);assert.equal(b.generation,2);assert.equal(b.promptChars,2)
})
test('TU-08: concurrent requests get distinct op ids with their own generation counters',async()=>{
 const {lines}=await capture('1',()=>Promise.all([call(request(),async()=>reply(good)),call(request(),async()=>reply(good))]))
 const rows=lines.map(parse);assert.equal(rows.length,2);assert.notEqual(rows[0].op,rows[1].op);assert.deepEqual(rows.map(r=>r.generation),[1,1])
})
test('TU-09: no source, name, instruction, key or unknown enum text leaks; lines are bounded',async()=>{
 const rows:string[]=[]
 const observed=imports.observeImportUsage({phase:'analyze',kind:'KIND-'+SECRET,intent:'INTENT-'+SECRET,executionLane:'LANE-'+SECRET} as unknown as ImportAiRequest,async()=>reply('{}','FINISH-'+SECRET),line=>rows.push(line))
 await observed({prompt:'正文'+SECRET+KEY} as Parameters<Gen>[0])
 const {lines}=await capture('1',()=>call(request(),async()=>reply(good)))
 for(const line of [...rows,...lines]){assert.ok(!line.includes(SECRET),line);assert.ok(!line.includes(KEY));assert.ok(!line.includes('小室'));assert.ok(Buffer.byteLength(line,'utf8')<=768)}
 const row=parse(rows[0]);assert.equal(row.kind,'?');assert.equal(row.intent,'?');assert.equal(row.lane,'?');assert.equal(row.finishReason,'?')
})
test('TU-10: debug off writes nothing and does not change calls or results',async()=>{
 const seen:unknown[][]=[]
 const runOnce=async(debug:string|undefined)=>capture(debug,()=>call(request(),async opts=>{seen.push([opts]);return reply(good)}))
 const off=await runOnce(undefined),zero=await runOnce('0'),on=await runOnce('1')
 assert.equal(off.lines.length,0);assert.equal(zero.lines.length,0);assert.equal(on.lines.length,1)
 assert.deepEqual(off.value,on.value);assert.deepEqual(zero.value,on.value)
 const strip=(o:unknown)=>{const {abortSignal:_a,...rest}=(o as unknown[])[0] as Record<string,unknown>;return rest}
 assert.deepEqual(strip(seen[0]),strip(seen[2]));assert.deepEqual(strip(seen[1]),strip(seen[2]))
})
test('TU-11: a throwing generation is not logged and its error is preserved',async()=>{
 const {lines}=await capture('1',()=>assert.rejects(call(request(),async()=>{throw Error('模型接口请求失败（HTTP 500）')}),/HTTP 500/u))
 assert.equal(lines.length,0)
})
test('TU-12: unreported cache details are logged as null',async()=>{
 const rows:string[]=[]
 await imports.observeImportUsage({phase:'review'} as unknown as ImportAiRequest,async()=>reply('{}','stop',{}),line=>rows.push(line))({prompt:'x'} as Parameters<Gen>[0])
 const row=parse(rows[0]);assert.equal(row.cacheReadTokens,null);assert.equal(row.noCacheTokens,null);assert.equal(row.cacheSource,null);assert.equal(row.phase,'review')
})

// docs/523 review (523-…-cases-review.md) and code review (524) additions.
const sceneRoster=():ImportAiRequest=>({semanticVersion:1,operationId:'52300000-0000-4000-8000-000000000002',phase:'analyze',intent:'roster',kind:'scene',sceneIdentity:{version:1,mode:'roster'},models:{text:model,review:model},units:['北宅。书房开门。','西宅的乙室门已打开。'].map((text,i)=>({id:'tu-'+i,fileId:'synthetic-body',start:i*1000,end:i*1000+text.length,text,kind:'body' as const})),artifacts:[],workingRevision:0})
const legacyClassify=():ImportAiRequest=>({operationId:'52300000-0000-4000-8000-000000000003',phase:'classify',units:[{id:unitId,fileId:'synthetic-source',start:0,end:sourceText.length,text:sourceText,kind:'body'}],artifacts:[],workingRevision:0,models:{text:model,review:model}})
const classified=JSON.stringify({classifications:[{unitId,kind:'body'}]})

test('TU-06b/c: scene roster generations ending at length are logged whatever the final outcome',async()=>{
 for(const always of [false,true]){
  let n=0
  const {lines}=await capture('1',async()=>{try{await call(sceneRoster(),async()=>++n===1||always?reply('{"roster":[','length'):reply('{"roster":[]}'))}catch{/* Outcome is not asserted: repair may reject a truncated draft. */}})
  const rows=lines.map(parse);assert.ok(n>=1);assert.equal(rows.length,n,'every returned generation is logged')
  assert.deepEqual(rows.map(r=>r.generation),rows.map((_,i)=>i+1));assert.equal(rows[0].finishReason,'length');assert.equal(rows[0].mode,'roster');assert.equal(new Set(rows.map(r=>r.op)).size,1)
 }
})
test('TU-06a: corrected generation reports its own longer prompt',async()=>{
 let n=0
 const {lines}=await capture('1',()=>call(request(),async()=>++n===1?reply('{"artifacts":[','length'):reply(good)))
 const [a,b]=lines.map(parse);assert.ok(b.promptChars>a.promptChars,'correction is appended to the sent prompt')
})
test('TU-14: non-ordinary paths are observed with and without injected deps; off keeps deps identity',async()=>{
 let calls=0
 const {lines}=await capture('1',()=>call(legacyClassify(),async()=>{calls++;return reply(classified)}))
 assert.equal(calls,1);assert.equal(lines.length,1);const row=parse(lines[0]);assert.equal(row.phase,'classify');assert.equal(row.intent,null);assert.equal(row.kind,null)
 const viaSdk=await capture('1',()=>runInsideLongTask(()=>imports.generateImportAiJson(legacyClassify() as Parameters<typeof imports.generateImportAiJson>[0],{userId:LOCAL_AUTHOR_ID,resolvedModel:resolved(new MockLanguageModelV4({doStream:async()=>({stream:new ReadableStream<LanguageModelV4StreamPart>({start(c){for(const part of [{type:'stream-start',warnings:[]},{type:'text-start',id:'0'},{type:'text-delta',id:'0',delta:classified},{type:'text-end',id:'0'},{type:'finish',finishReason:{unified:'stop',raw:'stop'},usage:{inputTokens:{total:50,noCache:5,cacheRead:45,cacheWrite:undefined},outputTokens:{total:3,text:3,reasoning:0}},providerMetadata:{deepseek:{promptCacheHitTokens:45,promptCacheMissTokens:5}}}] as LanguageModelV4StreamPart[])c.enqueue(part);c.close()}})})})),usage:imports.readOnlyImportUsage,maxNetworkRetries:0},new AbortController().signal,'classify '+SECRET)))
 assert.equal(viaSdk.lines.length,1);const sdkRow=parse(viaSdk.lines[0]);assert.equal(sdkRow.cacheReadTokens,45);assert.equal(sdkRow.noCacheTokens,5);assert.equal(sdkRow.cacheSource,'provider');assert.equal(sdkRow.inputTokens,50)
 for(const off of [undefined,'0','true',' 1']){const {lines:none}=await capture(off,()=>call(legacyClassify(),async()=>reply(classified)));assert.equal(none.length,0,String(off))}
})
test('TU-08b: interleaved generations are grouped by op; sequential calls restart at 1',async()=>{
 const rows:string[]=[],gate=Promise.withResolvers<void>(),write=(line:string)=>rows.push(line)
 const a=imports.observeImportUsage({phase:'analyze'},async()=>reply('{}'),write),b=imports.observeImportUsage({phase:'analyze'},async()=>{await gate.promise;return reply('{}')},write)
 const pendingB=b({prompt:'b'} as Parameters<Gen>[0]);await a({prompt:'a'} as Parameters<Gen>[0]);gate.resolve();await pendingB;await a({prompt:'a2'} as Parameters<Gen>[0])
 const parsed=rows.map(parse),byOp=(op:string)=>parsed.filter(r=>r.op===op).map(r=>r.generation)
 assert.deepEqual(byOp(parsed[0].op),[1,2]);assert.deepEqual(byOp(parsed[1].op),[1]);assert.notEqual(parsed[0].op,parsed[1].op)
})
test('TU-09b: generator is reached and an unknown finish reason is masked',async()=>{
 let calls=0
 const {lines}=await capture('1',async()=>{try{await call(request(),async()=>{calls++;return reply(good,'weird-'+SECRET)})}catch{/* Non-stop finishes may fail; only the line matters. */}})
 assert.ok(calls>=1);assert.ok(lines.length>=1);for(const line of lines){assert.ok(!line.includes(SECRET));assert.equal(parse(line).finishReason,'?')}
})
test('TU-11b: aborts, stream errors and a throwing logger leave results and errors unchanged',async()=>{
 const controller=new AbortController();controller.abort()
 const {lines}=await capture('1',async()=>{await assert.rejects(imports.generateImportAiJson(request() as Parameters<typeof imports.generateImportAiJson>[0],{userId:LOCAL_AUTHOR_ID,resolvedModel:{} as ResolvedModel},controller.signal,'p',{generateText:async()=>{throw new DOMException('取消','AbortError')}}));await assert.rejects(call(request(),async()=>{throw Error('模型服务返回服务器错误提示，请稍后重试')}),/服务器错误/u)})
 assert.equal(lines.length,0)
 const result=await imports.observeImportUsage({phase:'analyze'},async()=>reply('{"ok":1}'),()=>{throw Error('logger failed')})({prompt:'x'} as Parameters<Gen>[0])
 assert.equal(result.text,'{"ok":1}')
})
test('TU-12b: a generation without any usage records nothing and logs zero counts',async()=>{
 const r=recorder(),model=new MockLanguageModelV4({doStream:async()=>({stream:new ReadableStream<LanguageModelV4StreamPart>({start(c){for(const part of [{type:'stream-start',warnings:[]},{type:'text-start',id:'0'},{type:'text-delta',id:'0',delta:'{}'},{type:'text-end',id:'0'},{type:'finish',finishReason:{unified:'stop',raw:'stop'},usage:{inputTokens:{total:undefined,noCache:undefined,cacheRead:undefined,cacheWrite:undefined},outputTokens:{total:undefined,text:undefined,reasoning:undefined}}}] as LanguageModelV4StreamPart[])c.enqueue(part);c.close()}})})})
 const result=await run(model,r.usage);assert.equal(r.calls.length,0);assert.equal(result.promptTokens,0);for(const key of ['cacheReadTokens','noCacheTokens','cacheSource'])assert.equal(Object.hasOwn(result,key),false)
 const rows:string[]=[];await imports.observeImportUsage({phase:'analyze'},async()=>result,line=>rows.push(line))({prompt:'x'} as Parameters<Gen>[0])
 const row=parse(rows[0]);assert.equal(row.inputTokens,0);assert.equal(row.outputTokens,0);assert.equal(row.cacheSource,null)
})
test('TU-02b: provider metadata is used only when both counts are valid; otherwise SDK details',async()=>{
 const sdk={total:100,noCache:100,cacheRead:0,cacheWrite:undefined}
 const unreported=await run(mock(sdk,{deepseek:{promptCacheHitTokens:undefined as unknown as number,promptCacheMissTokens:undefined as unknown as number}}))
 assert.equal(unreported.cacheSource,'sdk');assert.equal(unreported.cacheReadTokens,0);assert.equal(unreported.noCacheTokens,100)
 for(const bad of [{promptCacheHitTokens:70},{promptCacheHitTokens:-1,promptCacheMissTokens:30},{promptCacheHitTokens:1.5,promptCacheMissTokens:30},{promptCacheHitTokens:Number.NaN,promptCacheMissTokens:30},{promptCacheHitTokens:'70',promptCacheMissTokens:'30'}]){
  const result=await run(mock(sdk,{deepseek:bad as never}));assert.equal(result.cacheSource,'sdk',JSON.stringify(bad));assert.equal(result.cacheReadTokens,0)
 }
 const provider=await run(mock(sdk,{deepseek:{promptCacheHitTokens:70,promptCacheMissTokens:30}}));assert.equal(provider.cacheSource,'provider');assert.equal(provider.cacheReadTokens,70);assert.equal(provider.noCacheTokens,30)
})

test('SS-18: usage lines report the prompt layout',async()=>{
 const rows:string[]=[],write=(line:string)=>rows.push(line)
 await imports.observeImportUsage({phase:'analyze',sharedSource:{version:1,windows:[{index:0,unitIds:['a']}],extraUnitIds:[]}},async()=>reply('{}'),write)({prompt:'x'} as Parameters<Gen>[0])
 await imports.observeImportUsage({phase:'analyze'},async()=>reply('{}'),write)({prompt:'x'} as Parameters<Gen>[0])
 await imports.observeImportUsage({phase:'analyze',sharedSource:{version:7} as never},async()=>reply('{}'),write)({prompt:'x'} as Parameters<Gen>[0])
 assert.deepEqual(rows.map(r=>parse(r).layout),['shared-source-v1',null,'?'])
})
