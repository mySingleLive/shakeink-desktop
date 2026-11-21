import assert from 'node:assert/strict'
import {test} from 'node:test'
import {randomUUID} from 'node:crypto'
import type {ImportArtifact,ImportFile,ImportSession} from '../../desktop/shared/novel-import'
import {splitImportUnits,classifyLocalUnits,validateImportCoverage,sourceBody,importChapters,sourceImportArtifacts,mergeImportArtifacts,validateImportEvidence,validateImportArtifactCapacity,applyImportPatches,importPlanHash,conflictChoices,splitImportBatches} from '../../desktop/core/novel-import'

const file=(text:string,name='正文.txt'):ImportFile=>({id:'f',name,path:'/private/tmp/source',format:'txt',bytes:Buffer.byteLength(text),hash:'x',text,included:true})
function session(text='第一章 开始\r\n\r\n原文🖋️\r\n\r\n第二章 继续\n\n结束  '):ImportSession{
 const files=[file(text)],units=classifyLocalUnits(files,splitImportUnits(files))
 return {version:1,id:randomUUID(),revision:0,phase:'select',title:'测试小说',files,units,selected:['body'],targets:['character'],infer:true,artifacts:[],conflicts:[],patches:[],originalProse:'',workingProse:'',workingRevision:0,chapters:[],steps:[],coverage:{},notFound:[],epoch:0,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),decisions:[]}
}
test('NI-D01: every source character and chapter boundary survives safe splitting',()=>{
 const s=session();assert.equal(s.units.map(u=>u.text).join(''),s.files[0].text)
 const text=sourceBody(s);assert.equal(text,s.files[0].text)
 const chapters=importChapters(text);assert.equal(chapters.map(c=>c.content).join(''),text)
 assert.ok(chapters.length>=2)
 assert.equal(importChapters('第一章 部落少年\n原文\n第二章 归来\n结尾').length,2)
 const short=splitImportUnits([file('甲🖋️乙'.repeat(50))],7)
 assert.equal(short.map(u=>u.text).join(''),'甲🖋️乙'.repeat(50));assert.ok(short.every(u=>u.text.isWellFormed()))
})
test('NI-D02: classification coverage rejects gaps, overlaps and unclassified ranges',()=>{
 const s=session();validateImportCoverage(s)
 s.units[0].kind='unknown';assert.throws(()=>validateImportCoverage(s),/归类/)
 s.units[0].kind='body';s.units[0].start=1;assert.throws(()=>validateImportCoverage(s),/覆盖/)
})
test('NI-D03: source selection and allowed inference are independent',()=>{
 const s=session();s.selected=[];assert.equal(sourceBody(s),'');assert.deepEqual(s.targets,['character'])
 s.selected=['body'];s.infer=false;assert.equal(sourceBody(s),s.files[0].text)
})
test('NI-D04: source setting artifacts retain exact text and real category distinctions',()=>{
 const s=session('十九岁\n\n语言克制\n\n重逢');s.units=splitImportUnits(s.files)
 s.units[0].kind='character';s.units[1].kind='style';s.units[2].kind='trope';s.selected=['character','style','trope']
 const result=sourceImportArtifacts(s);assert.deepEqual(new Set(result.map(a=>a.kind)),new Set(['character','style','trope']))
 assert.ok(result.every(a=>a.origin==='source'));assert.ok(result.some(a=>a.text==='语言克制\n\n'))
 const role=session('沈砚：十九岁。\n性格：沉静。\n外貌：瘦削。\n人物背景：来自河岸。');role.files[0].name='角色.txt';role.units=classifyLocalUnits(role.files,splitImportUnits(role.files));role.selected=['character'];assert.equal(sourceImportArtifacts(role).length,1)
})
test('NI-D05: contradictory source/body facts create evidence-bound conflicts',()=>{
 const base:ImportArtifact={id:'a',kind:'character',name:'沈砚',text:'沈砚十九岁',facts:{age:'19'},origin:'source',sourceUnitIds:['u1'],evidence:[{unitId:'u1',quote:'十九岁'}]}
 const other:ImportArtifact={...base,id:'b',text:'沈砚十七岁',facts:{age:'17'},origin:'inferred',sourceUnitIds:[],evidence:[{unitId:'u2',quote:'十七岁'}]}
 const result=mergeImportArtifacts([base],[other]);assert.equal(result.conflicts.length,1);assert.equal(result.artifacts[0].facts.age,'19');assert.equal(result.conflicts[0].status,'pending')
 const alias=mergeImportArtifacts([{...base,facts:{age:'19',aliases:'阿砚'}}],[{...other,name:'阿砚',facts:{age:'17'}}]);assert.equal(alias.artifacts.length,1);assert.equal(alias.conflicts.length,1)
 assert.throws(()=>mergeImportArtifacts([base],[{...other,id:'a',name:'另一个人'}]),/标识|身份/)
 const complementary=mergeImportArtifacts([{...base,facts:{}}],[{...base,id:'c',text:'沈砚担任船工。',facts:{occupation:'船工'}}]);assert.ok(complementary.artifacts[0].text.includes(base.text));assert.ok(complementary.artifacts[0].text.includes('沈砚担任船工。'))
})
test('NI-D06: fabricated evidence, foreign ids and incomplete batches fail closed',()=>{
 const s=session();const a:ImportArtifact={id:'a',kind:'character',name:'人物',text:'不存在',facts:{},origin:'inferred',sourceUnitIds:[],evidence:[{unitId:s.units[0].id,quote:'不存在'}]}
 assert.throws(()=>validateImportEvidence(a,s.units),/证据/)
 a.evidence=[{unitId:'foreign',quote:'原文'}];assert.throws(()=>validateImportEvidence(a,s.units),/证据/)
 const batches=splitImportBatches(s.units,600);assert.deepEqual(batches.flat().map(u=>u.id),s.units.map(u=>u.id))
 assert.throws(()=>validateImportArtifactCapacity([a],20),/容量/)
})
test('NI-D07: conflict options match the actual presence of prose and source settings',()=>{
 assert.deepEqual(conflictChoices('source-source',false),['a','b','merge'])
 assert.deepEqual(conflictChoices('body-body',true),['source','rewrite'])
 assert.deepEqual(conflictChoices('setting-body',true),['source','inferred','rewrite'])
})
test('NI-D08: patches protect immutable original prose, bind revisions and invalidate later grants',()=>{
 const s=session('沈砚十七岁。');s.originalProse=s.workingProse=sourceBody(s)
 s.patches=[{id:'p',start:2,end:5,before:'十七岁',after:'十九岁',workingRevision:0,reason:'作者确认',conflictId:'c'}]
 s.decisions=[{conflictId:'old',choice:'source',hash:'old-version'}]
 const before=importPlanHash(s);applyImportPatches(s,['p'])
 assert.equal(s.originalProse,'沈砚十七岁。');assert.equal(s.workingProse,'沈砚十九岁。');assert.equal(s.workingRevision,1);assert.equal(s.analysisGrant,undefined);assert.notEqual(importPlanHash(s),before)
 assert.throws(()=>applyImportPatches(s,['p']),/修改|版本/)
 assert.equal(s.decisions.length,0)
})

test('NI-LB03: only new working prose coalesces adjacent safe UTF16 ranges',async()=>{
 const {prepareImportWorkingUnits,coalesceImportWorkingUnits,createImportBudgetPolicy}=await import('../../desktop/core/novel-import-budget-policy')
 const text='甲'.repeat(999)+'😀尾\r\n\r\n'+'短段 English 汉字🖋️\r\n\r\n'.repeat(180)+'末字段哨兵',s=session(text),sourceBefore=JSON.stringify(s.units),original=splitImportUnits([file(text)]).map(u=>({...u,kind:'body' as const})),model={id:'synthetic',name:'synthetic',modelId:'synthetic',endpoint:'https://model.invalid',authRevision:1,contextWindow:1048576}
 const policy=createImportBudgetPolicy({text:model,review:model})!,state={workingProse:text,budgetPolicy:policy,workingUnits:undefined as ImportSession['workingUnits']},merged=prepareImportWorkingUnits(state,()=>original)
 assert.ok(merged.length<original.length);assert.deepEqual(Buffer.from(merged.map(u=>u.text).join('')),Buffer.from(text));assert.equal(JSON.stringify(s.units),sourceBefore);assert.equal(JSON.stringify(original),JSON.stringify(splitImportUnits([file(text)]).map(u=>({...u,kind:'body'}))))
 let end=0;for(const u of merged){assert.equal(u.start,end);assert.equal(u.text,text.slice(u.start,u.end));assert.ok(u.text.length<=1000);assert.ok(u.text.isWellFormed());assert.equal(u.id,`${u.fileId}:${u.start}:${u.end}`);end=u.end}assert.equal(end,text.length);assert.equal(merged[0].text.length,999)
 assert.equal(prepareImportWorkingUnits(state,()=>{throw Error('persisted arrays cannot regenerate')}),merged)
 const legacy={workingProse:text,workingUnits:undefined as ImportSession['workingUnits']};assert.equal(prepareImportWorkingUnits(legacy,()=>original),original)
 const existing={...state,workingUnits:original};assert.equal(prepareImportWorkingUnits(existing,()=>{throw Error('old array must stay unchanged')}),original)
 const fragments=[{id:'f:0:2',fileId:'f',start:0,end:2,text:'甲乙',kind:'body' as const,part:'one'},{id:'g:2:4',fileId:'g',start:2,end:4,text:'丙丁',kind:'body' as const,part:'one'},{id:'g:4:6',fileId:'g',start:4,end:6,text:'戊己',kind:'body' as const,part:'two'},{id:'g:7:8',fileId:'g',start:7,end:8,text:'辛',kind:'body' as const,part:'two'}]
 assert.deepEqual(coalesceImportWorkingUnits(fragments,'甲乙丙丁戊己庚辛'),fragments)
 assert.throws(()=>coalesceImportWorkingUnits([{...original[0],end:1000,text:text.slice(0,1000)}],text),/字符|边界|正文/)
 assert.throws(()=>coalesceImportWorkingUnits([{...original[0],text:'替换正文'}],text),/正文|范围/)
 assert.throws(()=>coalesceImportWorkingUnits([{...original[0],end:1001,text:text.slice(0,1001)}],text),/预算|正文/)
})
