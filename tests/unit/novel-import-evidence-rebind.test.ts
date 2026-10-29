import assert from 'node:assert/strict'
import {test} from 'node:test'
import {generateImportAiJson,runImportAi} from '../../desktop/service/novel-import-ai'
import type {ImportSemanticAiRequest,ImportSemanticAiResult} from '../../desktop/core/novel-import-semantics'
import type {ImportArtifact,ImportEvidence,ImportModel,ImportTarget,ImportUnit} from '../../desktop/shared/novel-import'
import type {ResolvedModel} from '../../src/lib/ai/provider'

// Synthetic text only; no provider, journal, database or real book content.
const model:ImportModel={id:'rb-text',name:'合成模型',modelId:'synthetic',endpoint:'https://synthetic.invalid/v1',authRevision:1,contextWindow:1048576}
const review={...model,id:'rb-review'}
const unit=(id:string,text:string,start=0,fileId='f'):ImportUnit=>({id,fileId,start,end:start+text.length,text,kind:'body',part:'正文'})
const A='声明单元原文只有这一句话。',B='另一单元写着甲乙丙丁戊己庚辛的完整原文。',C='第三单元也是独立的合成句子。'
const units=()=>[unit('a',A),unit('b',B,A.length),unit('c',C,A.length+B.length)]
const request=(patch:Partial<ImportSemanticAiRequest>={}):ImportSemanticAiRequest=>({operationId:'rb-op',semanticVersion:1,phase:'analyze',kind:'character',selectedTargets:['character'],models:{text:model,review},units:units(),artifacts:[],...patch})
const artifact=(evidence:ImportEvidence[],sourceUnitIds=['a'],kind:ImportTarget='character',id='rb-1',facts:Record<string,string>=kind==='character'?{roleType:'SUPPORTING'}:{}):ImportArtifact=>({id,kind,name:'合成人物'+id,text:'合成有据资料',facts,evidence,sourceUnitIds,origin:'inferred'})
const quote='甲乙丙丁戊己庚辛'
async function run(r:ImportSemanticAiRequest,raw:ImportSemanticAiResult){
 const before=JSON.stringify(r),rawBefore=JSON.stringify(raw)
 try{return await runImportAi(r,new AbortController().signal,{resolve:async role=>role==='text'?model:review,assert:async()=>{},generate:async()=>raw})}
 finally{assert.equal(JSON.stringify(r),before,'request unchanged');assert.equal(JSON.stringify(raw),rawBefore,'raw unchanged')}
}
async function generated(r:ImportSemanticAiRequest,outputs:unknown[]){
 let calls=0
 const result=await generateImportAiJson(r,{userId:'rb-user',resolvedModel:{} as ResolvedModel},new AbortController().signal,'仅合成',{generateText:async()=>{const out=outputs[Math.min(calls++,outputs.length-1)];return {text:JSON.stringify(out),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'}}}).catch((error:unknown)=>error)
 return {result,calls}
}
const reason=(r:string)=>new RegExp('无法定位（'+r+'）')
/** Semantic v1 rejects twice: generateJSON reports the anchor reason after one
 * correction, and runImportAi's final parse reports the generic schema error. */
async function rejected(r:ImportSemanticAiRequest,raw:ImportSemanticAiResult,why:string){
 const g=await generated(r,[raw]);assert.ok(g.result instanceof Error);assert.match((g.result as Error).message,reason(why));assert.equal(g.calls,2)
 await assert.rejects(run(r,raw),/模型返回结构或类别无效/)
}

test('RB01: verbatim quote unique in another request unit is rebound on the first generation',async()=>{
 const raw={artifacts:[artifact([{unitId:'a',quote}])]}
 const g=await generated(request(),[raw]);assert.equal(g.calls,1,'no correction regeneration');assert.ok(!(g.result instanceof Error),String(g.result))
 const out=await run(request(),raw),a=out.artifacts![0]
 assert.deepEqual(a.evidence,[{unitId:'b',quote}]);assert.deepEqual(a.sourceUnitIds,['a','b'])
 const twice=await run(request(),{artifacts:[artifact([{unitId:'a',quote}],['a','b'])]});assert.deepEqual(twice.artifacts![0].sourceUnitIds,['a','b'],'no duplicate source id')
})
test('RB02/RB13: multiple literal occurrences, including overlapping ones, are not rebound',async()=>{
 await rejected(request({units:[unit('a',A),unit('b',B),unit('c','又一处'+quote)]}),{artifacts:[artifact([{unitId:'a',quote}])]},'no-match')
 await rejected(request({units:[unit('a',A),unit('b',quote+'，'+quote)]}),{artifacts:[artifact([{unitId:'a',quote}])]},'no-match')
 const overlap='甲甲甲甲甲甲甲甲'
 await rejected(request({units:[unit('a',A),unit('b','前'+overlap+'甲后')]}),{artifacts:[artifact([{unitId:'a',quote:overlap}])]},'no-match')
})
test('RB03/RB04/RB14: unknown unit and short quotes keep their original reasons; eight non-space chars may rebind',async()=>{
 await rejected(request(),{artifacts:[artifact([{unitId:'foreign',quote}])]},'unknown-unit')
 await rejected(request({units:[unit('a',A),unit('b','甲乙丙丁戊己庚')]}),{artifacts:[artifact([{unitId:'a',quote:'甲乙丙丁\n戊己庚'}])]},'too-short')
 const out=await run(request(),{artifacts:[artifact([{unitId:'a',quote:'甲乙丙丁戊己庚辛'}])]});assert.equal(out.artifacts![0].evidence[0].unitId,'b')
})
test('RB05/RB06: no layout recovery or seam matching in the other unit',async()=>{
 await rejected(request({units:[unit('a',A),unit('b','甲乙丙丁\n戊己庚辛')]}),{artifacts:[artifact([{unitId:'a',quote}])]},'no-match')
 const left=unit('l','前缀甲乙丙丁',A.length),right=unit('r','戊己庚辛后缀',left.end)
 await rejected(request({units:[unit('a',A),left,right]}),{artifacts:[artifact([{unitId:'a',quote}])]},'no-match')
})
test('RB10: a quote that layout-anchors uniquely in the declared unit stays there',async()=>{
 const r=request({units:[unit('a','甲乙丙丁\n戊己庚辛'),unit('b',B,9)]})
 const out=await run(r,{artifacts:[artifact([{unitId:'a',quote}])]});assert.deepEqual(out.artifacts![0].evidence,[{unitId:'a',quote:'甲乙丙丁\n戊己庚辛'}]);assert.deepEqual(out.artifacts![0].sourceUnitIds,['a'])
})
test('RB11/RB12: mixed real failures fail; several rebinds keep order and dedupe exact duplicates',async()=>{
 await rejected(request(),{artifacts:[artifact([{unitId:'a',quote},{unitId:'a',quote:'模型虚构不存在的完整证据'}])]},'no-match')
 const q2='第三单元也是独立的合成句子'
 const out=await run(request(),{artifacts:[artifact([{unitId:'c',quote},{unitId:'a',quote:q2},{unitId:'b',quote}])]}),a=out.artifacts![0]
 assert.deepEqual(a.evidence,[{unitId:'b',quote},{unitId:'c',quote:q2}]);assert.deepEqual(a.sourceUnitIds,['a','b','c'])
})
test('RB16: worldline and narrative rebind; legacy analysis and legacy conflicts do not',async()=>{
 const wl=artifact([{unitId:'a',quote}],['a'],'worldline','event-1',{lineId:'line-1',lineName:'合成主线',timeKind:'unknown',people:'[]',reliability:'客观事实'})
 const w=await run(request({kind:'worldline',selectedTargets:['worldline']}),{artifacts:[wl]});assert.equal(w.artifacts![0].evidence[0].unitId,'b')
 const nr=artifact([{unitId:'a',quote}],['a'],'narrative','narr-1',{chapterIndex:'0',order:'0',refs:'[]',reliability:'客观事实'})
 const n=await run(request({kind:'narrative',selectedTargets:['narrative'],chapters:[{id:'ch0',title:'合成章',start:0,end:A.length+B.length+C.length}]}),{artifacts:[nr]});assert.equal(n.artifacts![0].evidence[0].unitId,'b')
 const {semanticVersion:_v,selectedTargets:_t,...legacyFields}=request(),legacy=legacyFields as unknown as ImportSemanticAiRequest
 await assert.rejects(run(legacy,{artifacts:[artifact([{unitId:'a',quote}])]}),reason('no-match'))
 const conflict={id:'x',type:'body-body',kind:'body',entity:'事实',field:'状态',source:{text:'甲',value:'甲'},candidate:{text:'乙',value:'乙'},evidence:[{unitId:'a',quote}],status:'pending',hash:''}
 // Semantic v1 analysis rejects conflicts outright; legacy conflicts keep strict anchoring.
 await assert.rejects(run(legacy,{notFound:true,conflicts:[conflict]} as unknown as ImportSemanticAiResult),reason('no-match'))
})
test('RB18: correctly paired evidence is returned unchanged, duplicates and source list included',async()=>{
 const own='另一单元写着甲乙丙丁'
 const raw={artifacts:[artifact([{unitId:'a',quote:A},{unitId:'b',quote:own},{unitId:'b',quote:own}],['a'])]}
 const a=(await run(request(),raw)).artifacts![0]
 assert.deepEqual(a.evidence,raw.artifacts[0].evidence);assert.deepEqual(a.sourceUnitIds,['a'])
})
test('RB19: an ambiguous declared unit is not rebound even with a unique copy elsewhere',async()=>{
 const twin='甲甲甲甲\n甲甲甲甲甲'
 await rejected(request({units:[unit('a',twin),unit('b','前甲甲甲甲甲甲甲甲后',twin.length)]}),{artifacts:[artifact([{unitId:'a',quote:'甲甲甲甲甲甲甲甲'}])]},'ambiguous')
})
