import assert from 'node:assert/strict'
import {test} from 'node:test'
import {generateImportAiJson,runImportAi} from '../../desktop/service/novel-import-ai'
import {StructuredGenerationError} from '../../src/lib/ai/generate'
import type {ImportSemanticAiRequest} from '../../desktop/core/novel-import-semantics'
import type {ImportUnit,ImportArtifact} from '../../desktop/shared/novel-import'
import type {ResolvedModel} from '../../src/lib/ai/provider'

// All values are synthetic. No provider, application, journal or database is opened.
const prefix='[novel-import-anchor-diagnostics] '
const keys=['version','kind','issues','inspected','unknownUnit','tooShort','ambiguous','noMatch','otherUnitUnique','adjacentBoundaryUnique','unclassified','truncated']
const unit=(id='u',text='甲乙丙丁戊己庚辛壬癸完整来源。',start=0,fileId='f'):ImportUnit=>({id,text,start,end:start+text.length,fileId,kind:'body',part:'正文'})
const model={id:'synthetic-model',name:'synthetic',modelId:'synthetic',endpoint:'https://synthetic.invalid',authRevision:1,contextWindow:1048576}
const request=(units=[unit()]):ImportSemanticAiRequest=>({operationId:'synthetic-op',semanticVersion:1,phase:'analyze',kind:'outline',units,artifacts:[],models:{text:{...model},review:{...model,id:'synthetic-review'}}})
const artifact=(quote='不存在的合成完整引文',unitId='u'):ImportArtifact=>({id:'synthetic-a',name:'synthetic-name',kind:'outline',text:'synthetic artifact',facts:{},evidence:[{quote,unitId}],sourceUnitIds:['u'],origin:'inferred'})
const bad=(quote?:string,unitId?:string)=>({artifacts:[artifact(quote,unitId)]})
type Output=unknown|((attempt:number)=>unknown)
async function execute(outputs:Output[],r=request(),options:{flag?:string|null;root?:string|null;logger?:(line:string)=>void;signal?:AbortSignal}={}){
 const previousFlag=process.env.SHAKEINK_IMPORT_ANCHOR_DIAGNOSTICS,previousRoot=process.env.SHAKEINK_TEST_ROOT,warn=console.warn
 const lines:string[]=[];let calls=0,error:unknown,result:unknown
 const env=(key:string,value:string|undefined)=>{if(value===undefined)delete process.env[key];else process.env[key]=value}
 env('SHAKEINK_IMPORT_ANCHOR_DIAGNOSTICS',options.flag===null?undefined:options.flag??'1');env('SHAKEINK_TEST_ROOT',options.root===null?undefined:options.root??'/private/tmp/synthetic-anchor-diagnostics')
 console.warn=(...args:unknown[])=>{assert.equal(args.length,1);assert.equal(typeof args[0],'string');lines.push(args[0] as string);options.logger?.(args[0] as string)}
 try{result=await generateImportAiJson(r,{userId:'synthetic-user',resolvedModel:{} as ResolvedModel},options.signal??new AbortController().signal,'synthetic only',{generateText:async()=>{
  const selected=outputs[Math.min(calls,outputs.length-1)],out=typeof selected==='function'?selected(++calls):(++calls,selected)
  if(out instanceof Error)throw out
  if(out&&typeof out==='object'&&'finishReason'in out)return out as Awaited<ReturnType<NonNullable<Parameters<typeof generateImportAiJson>[4]>['generateText']>>
  return {text:typeof out==='string'?out:JSON.stringify(out),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'}
 }})}catch(e){error=e}finally{console.warn=warn;env('SHAKEINK_IMPORT_ANCHOR_DIAGNOSTICS',previousFlag);env('SHAKEINK_TEST_ROOT',previousRoot)}
 return {lines,calls,error,result}
}
function diagnostic(run:Awaited<ReturnType<typeof execute>>){
 assert.equal(run.lines.length,1);assert.ok(run.lines[0].startsWith(prefix));assert.ok(Buffer.byteLength(run.lines[0],'utf8')<=768)
 const record=JSON.parse(run.lines[0].slice(prefix.length));assert.deepEqual(Object.keys(record),keys);assert.equal(record.version,1);assert.equal(record.kind,'outline')
 for(const key of keys.filter(k=>!['kind','version'].includes(k)))assert.ok(Number.isSafeInteger(record[key])&&record[key]>=0&&record[key]<=1000,key)
 return record as Record<string,number>
}
function rejected(run:Awaited<ReturnType<typeof execute>>,reason='no-match'){
 assert.ok(run.error instanceof StructuredGenerationError);assert.equal(run.error.kind,'invalid_schema');assert.equal(run.error.message,`模型证据无法定位（${reason}）`);assert.equal(run.result,undefined);assert.equal(run.calls,2)
}

test('LOTM-DIAG01: explicit gates, successful generations and excluded stages stay silent',async t=>{
 for(const [flag,root]of [[null,null],['1',null],[null,'/private/tmp/synthetic'],['',''],['1',''],['','/private/tmp/synthetic'],['true','/private/tmp/synthetic'],['1','relative'],['1','   ']])await t.test(JSON.stringify([flag,root]),async()=>{const run=await execute([bad()],request(),{flag,root});rejected(run);assert.deepEqual(run.lines,[])})
 await t.test('enabled final rejection once despite multiple JSON candidates',async()=>{const run=await execute(['```json\n'+JSON.stringify(bad())+'\n```']);rejected(run);assert.equal(diagnostic(run).noMatch,1)})
 for(const outputs of [[{artifacts:[artifact(unit().text)]}],[bad(),{artifacts:[artifact(unit().text)]}]])await t.test('final success is silent',async()=>{const run=await execute(outputs);assert.equal(run.error,undefined);assert.deepEqual(run.lines,[])})
 await t.test('success from second candidate after failed fenced candidate',async()=>{const run=await execute(['```json\nfalse\n```\n'+JSON.stringify({artifacts:[artifact(unit().text)]})]);assert.equal(run.error,undefined);assert.deepEqual(run.lines,[])})
 for(const patch of [{phase:'review'},{phase:'classify'},{intent:'reconcile'},{semanticVersion:undefined}] as const)await t.test('excluded '+JSON.stringify(patch),async()=>{const r={...request(),...patch} as ImportSemanticAiRequest;const run=await execute([bad()],r);assert.deepEqual(run.lines,[])})
})

test('LOTM-DIAG02: literal positions, strict geometry, UTF16 and four primary reasons',async t=>{
 await t.test('four primary reasons and mutually exclusive secondary counts',async()=>{
  const u=unit('u','甲乙丙丁\n戊己庚辛。甲乙丙丁\n戊己庚辛。'),r=request([u,unit('other','唯一其它单元原样引文')]),a=artifact();a.evidence=[{unitId:'missing',quote:'唯一其它单元原样引文'},{unitId:'u',quote:'短假'},{unitId:'u',quote:'甲乙丙丁戊己庚辛'},{unitId:'u',quote:'不存在的合成完整引文'}]
  const off=await execute([{artifacts:[a]}],r,{flag:''}),on=await execute([{artifacts:[a]}],r);rejected(on,'unknown-unit');assert.ok(on.error instanceof StructuredGenerationError);assert.ok(off.error instanceof StructuredGenerationError);assert.deepEqual({message:on.error.message,kind:on.error.kind,fields:on.error.invalidFields,feedback:on.error.feedback},{message:off.error.message,kind:off.error.kind,fields:off.error.invalidFields,feedback:off.error.feedback})
  assert.deepEqual(diagnostic(on),{version:1,kind:'outline',issues:4,inspected:4,unknownUnit:1,tooShort:1,ambiguous:1,noMatch:1,otherUnitUnique:1,adjacentBoundaryUnique:0,unclassified:3,truncated:0})
 })
 const quote='唯一其它单元原样引文'
 for(const [name,others,expected]of [['one-position',[unit('x',quote)],1],['same-unit-two-positions',[unit('x',quote+quote)],0],['two-units',[unit('x',quote),unit('y',quote)],0],['literal-only',[unit('x',quote.split('').join(' '))],0]] as const)await t.test(name,async()=>{
  // A declared-unit no-match with one verbatim owner is now accepted (rebind),
  // so the other-unit classification is observed through unknown-unit.
  const run=await execute([bad(quote,'missing')],request([unit(),...others]));rejected(run,'unknown-unit');assert.equal(diagnostic(run).otherUnitUnique,expected)})
 const left=unit('l','前缀😀甲乙丙丁',0),right=unit('r','戊己庚辛壬癸后缀',left.end),cross='😀甲乙丙丁戊己庚辛'
 const invalids=[['valid',left,right,1],['different-file',left,{...right,fileId:'other'},0],['gap',left,{...right,start:right.start+1,end:right.end+1},0],['overlap',left,{...right,start:right.start-1,end:right.end-1},0],['reverse',right,left,0],['bad-length',{...left,end:left.end-1},right,0],['negative',{...left,start:-1},right,0],['unsafe',{...left,start:Number.MAX_SAFE_INTEGER+1},right,0],['fractional',{...left,start:0.5},right,0]] as const
 for(const [name,l,r,expected]of invalids)await t.test(name,async()=>{const run=await execute([bad(cross,'missing')],request([unit(),l,r]));rejected(run,'unknown-unit');const d=diagnostic(run);assert.equal(d.adjacentBoundaryUnique,expected);assert.equal(d.otherUnitUnique,0)})
 await t.test('one-sided matches are never straddles',async()=>{const run=await execute([bad(left.text,'missing')],request([unit(),left,right]));assert.equal(diagnostic(run).adjacentBoundaryUnique,0)})
 await t.test('three-unit concatenation is not a two-unit boundary',async()=>{const units=[unit('a','甲乙丙丁'),unit('b','戊己庚辛',4),unit('c','壬癸子丑',8)],run=await execute([bad('乙丙丁戊己庚辛壬癸','missing')],request([unit('u','独立声明源不含跨界字串'),...units]));const d=diagnostic(run);assert.equal(d.otherUnitUnique,0);assert.equal(d.adjacentBoundaryUnique,0);assert.equal(d.unclassified,1)})
 await t.test('multiple cross positions are not unique',async()=>{const run=await execute([bad(cross,'missing')],request([unit(),left,right,{...left,id:'l2',fileId:'f2'},{...right,id:'r2',fileId:'f2'}]));assert.equal(diagnostic(run).adjacentBoundaryUnique,0)})
 await t.test('other unit wins over a simultaneous unique cross',async()=>{const run=await execute([bad(cross,'missing')],request([unit(),left,right,unit('whole',cross,0,'whole')]));const d=diagnostic(run);assert.equal(d.otherUnitUnique,1);assert.equal(d.adjacentBoundaryUnique,0)})
})

test('LOTM-DIAG03: fixed data-only log cannot disclose synthetic secrets or dynamic paths',async()=>{
 const secret='SYNTHETIC_SECRET_NEVER_LOG_0123456789',r=request([unit('u',secret),unit(secret,secret,0,secret)]);r.models.text!.name=secret;r.models.text!.endpoint='https://synthetic.invalid/'+secret
 const a=artifact(secret,secret+'missing');a.id=secret;a.name=secret;const before=JSON.stringify({r,a}),run=await execute([{artifacts:[a]}],r);diagnostic(run);assert.ok(!run.lines.join('').includes(secret));assert.equal(JSON.stringify({r,a}),before)
 const mixed={...a,facts:{[secret]:42}};assert.deepEqual((await execute([{artifacts:[mixed]}],r)).lines,[])
})

test('LOTM-DIAG04: no stale provenance, bounded work, saturation and diagnostics failures',async t=>{
 for(const [name,next]of [['invalid-json','not JSON'],['incomplete',{text:JSON.stringify(bad()),promptTokens:0,completionTokens:0,cost:0,finishReason:'length'}],['network',Error('SYNTHETIC_NETWORK_SECRET')]] as const)await t.test(name,async()=>{const run=await execute([bad(),next]);assert.ok(run.error);assert.deepEqual(run.lines,[]);assert.equal(run.calls,2)})
 await t.test('cancellation suppresses diagnostics',async()=>{const abort=new AbortController(),run=await execute([bad(),()=>{abort.abort();return bad()}],request(),{signal:abort.signal});assert.ok(run.error);assert.deepEqual(run.lines,[])})
 for(const typeAbort of [false,true])await t.test('seventh mixed issue '+typeAbort,async()=>{const artifacts=Array.from({length:7},()=>artifact());if(typeAbort)(artifacts[6] as unknown as {text:number}).text=42;else artifacts[6].facts={reliability:'SYNTHETIC_INVALID'};const run=await execute([bad(),{artifacts}]);assert.ok(run.error);assert.deepEqual(run.lines,[])})
 await t.test('issue count and truncated count saturate with only first hundred inspected',async()=>{const a=artifact();a.evidence=Array.from({length:1205},()=>({unitId:'missing',quote:'合成缺失证据'}));const run=await execute([{artifacts:[a]}]);const d=diagnostic(run);assert.equal(d.issues,1000);assert.equal(d.inspected,100);assert.equal(d.unknownUnit,100);assert.equal(d.truncated,1000);assert.equal(d.unclassified,100)})
 for(const length of [2000,2001])await t.test('quote UTF16 cap '+length,async()=>{const quote='甲'.repeat(length),run=await execute([bad(quote,'missing')],request([unit(),unit('other',quote)]));const d=diagnostic(run);assert.equal(d.otherUnitUnique,length===2000?1:0);assert.equal(d.truncated,length===2000?0:1)})
 await t.test('unfinished two-million budget cannot claim a unique position',async()=>{const quote='合成唯一预算引文',run=await execute([bad(quote,'missing')],request([unit('u',quote),unit('large','甲'.repeat(2_000_000))]));const d=diagnostic(run);assert.equal(d.otherUnitUnique,0);assert.equal(d.truncated,1);assert.equal(d.unclassified,1)})
 await t.test('exact two-million budget can complete a unique literal search',async()=>{const quote='合成预算临界引文',run=await execute([bad(quote,'missing')],request([unit('u','甲'.repeat(2_000_000-quote.length)+quote)]));const d=diagnostic(run);assert.equal(d.otherUnitUnique,1);assert.equal(d.truncated,0)})
 await t.test('quote cap counts supplementary characters as UTF16',async()=>{const quote='😀'.repeat(1001),run=await execute([bad(quote,'missing')],request([unit('u',quote)]));const d=diagnostic(run);assert.equal(d.otherUnitUnique,0);assert.equal(d.truncated,1)})
 await t.test('no additional search before final failure or without gates',async()=>{const original=String.prototype.indexOf;let searches=0;try{String.prototype.indexOf=function(search:string,...args:[number?]){if(search==='DIAG_TIMING_MARKER')searches++;return original.call(this,search,...args)};const good={artifacts:[artifact(unit().text)]};assert.deepEqual((await execute([bad('DIAG_TIMING_MARKER','missing'),good])).lines,[]);assert.equal(searches,0);assert.deepEqual((await execute([bad('DIAG_TIMING_MARKER','missing')],request(),{flag:null})).lines,[]);assert.equal(searches,0);diagnostic(await execute([bad('DIAG_TIMING_MARKER','missing')]));assert.ok(searches>0)}finally{String.prototype.indexOf=original}})
 await t.test('boundary uniqueness also requires a complete budgeted search',async()=>{const l=unit('l','甲乙丙丁戊己'),r=unit('r','庚辛壬癸子丑',l.end),quote='丙丁戊己庚辛壬癸',run=await execute([bad(quote,'missing')],request([unit('u','独立声明来源'),l,r,unit('large','酉'.repeat(2_000_000-'独立声明来源'.length-l.text.length-r.text.length),0,'large')]));const d=diagnostic(run);assert.equal(d.otherUnitUnique,0);assert.equal(d.adjacentBoundaryUnique,0);assert.equal(d.truncated,1);assert.equal(d.unclassified,1)})
 await t.test('budget is shared across issues',async()=>{const quote='合成唯一预算引文',a=artifact(quote,'missing');a.evidence.push({...a.evidence[0]});const run=await execute([{artifacts:[a]}],request([unit('u','甲'.repeat(1_100_000)+quote)]));const d=diagnostic(run);assert.equal(d.otherUnitUnique,1);assert.equal(d.unclassified,1);assert.equal(d.truncated,1)})
 await t.test('logger failure retains bridge error',async()=>{const run=await execute([bad()],request(),{logger:()=>{throw Error('SYNTHETIC_LOG_FAILURE')}});rejected(run);assert.equal(run.lines.length,1)})
 await t.test('JSON encoding failure retains bridge error',async()=>{const text=JSON.stringify(bad()),original=JSON.stringify;try{JSON.stringify=((value:unknown,...args:unknown[])=>{if(value&&typeof value==='object'&&'version'in value&&'inspected'in value)throw Error('SYNTHETIC_ENCODING_FAILURE');return (original as (...args:unknown[])=>string)(value,...args)}) as typeof JSON.stringify;const run=await execute([text]);rejected(run);assert.deepEqual(run.lines,[])}finally{JSON.stringify=original}})
 await t.test('literal search failure retains bridge error',async()=>{const original=String.prototype.indexOf;try{String.prototype.indexOf=function(search:string,...args:[number?]){if(search==='DIAG_SCAN_THROW')throw Error('SYNTHETIC_SCAN_FAILURE');return original.call(this,search,...args)};const run=await execute([bad('DIAG_SCAN_THROW','missing')]);rejected(run,'unknown-unit');assert.deepEqual(run.lines,[])}finally{String.prototype.indexOf=original}})
 await t.test('same injected ordinary error instance is rethrown without diagnostics',async()=>{const error=new StructuredGenerationError('invalid_schema',['SYNTHETIC_PATH'],['SYNTHETIC_FEEDBACK']),run=await execute([bad(),error]);assert.equal(run.error,error);assert.deepEqual(run.lines,[])})
})

test('LOTM-DIAG05: real service boundary rejects bad evidence and returns no accepted data',async()=>{
 const r=request(),before=structuredClone(r),warn=console.warn,flag=process.env.SHAKEINK_IMPORT_ANCHOR_DIAGNOSTICS,root=process.env.SHAKEINK_TEST_ROOT,lines:string[]=[];let calls=0,result:unknown
 process.env.SHAKEINK_IMPORT_ANCHOR_DIAGNOSTICS='1';process.env.SHAKEINK_TEST_ROOT='/private/tmp/synthetic-anchor-diagnostics';console.warn=(line:string)=>{lines.push(line)}
 try{await assert.rejects(async()=>{result=await runImportAi(r,new AbortController().signal,{resolve:async role=>role==='text'?model:r.models.review!,assert:async()=>{},generate:async(req,_model,signal,prompt)=>generateImportAiJson(req,{userId:'synthetic',resolvedModel:{} as ResolvedModel},signal,prompt,{generateText:async()=>{calls++;return {text:JSON.stringify(bad()),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'}}})})},e=>e instanceof StructuredGenerationError&&e.message==='模型证据无法定位（no-match）');assert.equal(calls,2);assert.equal(result,undefined);assert.deepEqual(r,before);assert.equal(lines.length,1)}finally{console.warn=warn;if(flag===undefined)delete process.env.SHAKEINK_IMPORT_ANCHOR_DIAGNOSTICS;else process.env.SHAKEINK_IMPORT_ANCHOR_DIAGNOSTICS=flag;if(root===undefined)delete process.env.SHAKEINK_TEST_ROOT;else process.env.SHAKEINK_TEST_ROOT=root}
})
