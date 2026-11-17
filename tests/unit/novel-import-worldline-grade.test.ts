import assert from 'node:assert/strict'
import {test} from 'node:test'
import {normalizeLinesReply} from '../../desktop/service/novel-import-ai'
import {validateImportSemanticArtifact} from '../../desktop/core/novel-import-semantics'
import {normalizeWorldlineGrade} from '../../desktop/core/novel-import-worldline-facts'
import type {ImportAiRequest,ImportArtifact,ImportUnit} from '../../desktop/shared/novel-import'
import {model} from '../helpers/novel-import-wizard-fixture'

/* docs/581 WU-06, WU-08: worldline category / importance in import replies. Synthetic text only. */
const lineRequest=(kind:'worldline'|'narrative'|'outline',over:Partial<ImportAiRequest>={}):ImportAiRequest=>({semanticVersion:1,phase:'analyze',kind,units:[],artifacts:[],executionLane:'wizard-lines-v1',operationId:'op',models:{text:model},workingRevision:0,selectedTargets:[kind],chapters:[],entities:[],...over}) as ImportAiRequest
const unit={id:'u1',fileId:'f',kind:'body',start:0,end:20,text:'沈砚在合成渡口旁停步，风声很大。'} as ImportUnit
const parse=<T,>(text:string)=>JSON.parse(text) as T
const facts=(over:Record<string,unknown>)=>({lineId:'x',lineName:'主线',timeKind:'unknown',people:'[]',reliability:'客观事实',...over})
const artifact=(id:string,over:Record<string,unknown>):ImportArtifact=>({id,kind:'worldline',name:'停步'+id,text:'沈砚停步。',facts:facts(over) as Record<string,string>,evidence:[{unitId:'u1',quote:'沈砚在合成渡口'}],sourceUnitIds:['u1'],origin:'inferred'})

test('WU-06: wizard lines replies drop invalid grades, keep valid ones and count the drops',()=>{
 const request=lineRequest('worldline',{units:[unit]})
 const reply={artifacts:[artifact('a',{category:'打斗'}),artifact('b',{importance:5}),artifact('c',{importance:'2'}),artifact('d',{importance:2,category:' 揭示 '})]}
 const out=normalizeLinesReply(request,JSON.stringify(reply),parse)!
 const list=JSON.parse(out.text).artifacts
 assert.equal(list.length,4)
 assert.equal(list[0].facts.category,undefined);assert.equal(list[1].facts.importance,undefined)
 assert.equal(list[2].facts.importance,'2');assert.equal(list[3].facts.importance,'2');assert.equal(list[3].facts.category,'揭示')
 assert.equal(out.counts!.droppedGrades,2)
})
test('WU-08: normalizeWorldlineGrade is pure; strict validation accepts valid grades and fails invalid ones',()=>{
 const f:Record<string,unknown>={category:'打斗',importance:2}
 const r=normalizeWorldlineGrade(f)
 assert.deepEqual(r.facts,{importance:'2'});assert.equal(r.dropped,1);assert.deepEqual(f,{category:'打斗',importance:2},'input object unchanged')
 assert.doesNotThrow(()=>validateImportSemanticArtifact(artifact('ok',{category:'冲突',importance:'3'}),'strict'))
 for(const bad of [{category:'打斗'},{importance:'5'},{importance:'1.5'}])
  assert.throws(()=>validateImportSemanticArtifact(artifact('bad',bad),'strict'),Error,JSON.stringify(bad))
 const warned=validateImportSemanticArtifact(artifact('w',{category:'冲突'}),'strict')
 assert.deepEqual(warned.mappingWarnings??[],[],'valid grades add no mapping warnings')
})
import {importAiPrompt} from '../../desktop/core/novel-import-ai-payload'
import {mergeImportArtifacts} from '../../desktop/core/novel-import'
import {WIZARD_REVIEW_STRUCTURAL} from '../../desktop/core/novel-import-conflict-choices'
import {importFieldLabel} from '../../desktop/shared/novel-import-field-labels'
import {worldlineGradeFromFacts} from '../../desktop/core/novel-import-worldline-facts'

test('WU-05: both worldline contracts describe the 7 categories and importance 1–3',()=>{
 const wizard=importAiPrompt(lineRequest('worldline',{units:[unit]}) as never)
 const plain=importAiPrompt({...lineRequest('worldline',{units:[unit]}),executionLane:undefined,selectedTargets:['worldline']} as never)
 for(const p of [wizard,plain]){
  for(const c of ['冲突','谋划','揭示','关系','成长','变故','其他'])assert.ok(p.includes(c),c)
  assert.match(p,/importance[^。]*1[^。]*3/u)
 }
})
test('WU-07: publish converts fact strings; invalid values fall back to defaults; split parts keep the grade',()=>{
 assert.deepEqual(worldlineGradeFromFacts({category:'冲突',importance:'2'}),{category:'冲突',importance:2})
 assert.deepEqual(worldlineGradeFromFacts({importance:'x'}),{category:'其他',importance:1})
 assert.deepEqual(worldlineGradeFromFacts({}),{category:'其他',importance:1})
})
test('WU-09: two batches merge to the higher importance and the first category, with no conflict',()=>{
 const a=artifact('e',{category:'冲突',importance:'1'}),b=artifact('e',{category:'揭示',importance:'3'})
 const merged=mergeImportArtifacts([a],[b],1)
 const out=merged.artifacts.find(x=>x.id==='e')!
 assert.equal(out.facts.category,'冲突');assert.equal(out.facts.importance,'3')
 assert.ok(!merged.conflicts.some(c=>c.field==='category'||c.field==='importance'),JSON.stringify(merged.conflicts))
 assert.ok(!WIZARD_REVIEW_STRUCTURAL.has('category')&&!WIZARD_REVIEW_STRUCTURAL.has('importance'))
})
test('WU-09b: field labels',()=>{assert.equal(importFieldLabel('category'),'类型');assert.equal(importFieldLabel('importance'),'重要程度')})
