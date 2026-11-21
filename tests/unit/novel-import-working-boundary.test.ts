import assert from 'node:assert/strict'
import {test} from 'node:test'
import {importHash,workingImportUnits,splitImportUnits,splitSentenceWorkingUnits,safeImportBoundary,importBudgetAudit} from '../../desktop/core/novel-import'
import {createImportBudgetPolicy,validateImportBudgetPolicy,coalesceImportWorkingUnits,importBudgetProfile} from '../../desktop/core/novel-import-budget-policy'
import {createSceneRosterRepairChoices} from '../../desktop/service/novel-import-scene-roster-repair-choices'
import {createSceneRosterFragmentTable} from '../../desktop/core/novel-import-scene-roster-fragments'
import {validateSceneRosterRecords} from '../../desktop/core/novel-import-scene-identity'
import type {ImportSession,ImportModel} from '../../desktop/shared/novel-import'

const model:ImportModel={id:'synthetic-boundary',name:'synthetic',modelId:'synthetic',endpoint:'https://synthetic.invalid',authRevision:1,contextWindow:1048576}
function session(text:string):ImportSession{
 const file={id:'source',name:'正文.txt',path:'',format:'txt' as const,bytes:Buffer.byteLength(text),hash:importHash(text),text,included:true}
 return{version:1,id:'00000000-0000-4000-8000-000000000099',revision:0,epoch:0,phase:'confirm',title:'synthetic',files:[file],units:splitImportUnits([file]).map(u=>({...u,kind:'body' as const})),selected:['body'],targets:['scene'],infer:true,originalProse:text,workingProse:text,workingRevision:0,chapters:[{id:'chapter-1',title:'合成章节',start:0,end:text.length,content:text}],artifacts:[],conflicts:[],patches:[],steps:[],coverage:{},notFound:[],decisions:[],createdAt:'',updatedAt:'',budgetPolicy:createImportBudgetPolicy({text:model,review:model})}
}
test('WB01: fresh working geometry keeps the three-character place that legacy hard1000 cuts into two plus one',()=>{
 const name='星辰馆',text='甲'.repeat(950)+'。'+'乙'.repeat(47)+name+'中有灯光。'+'丙'.repeat(300)+'。',old=session(text);old.budgetPolicy={...old.budgetPolicy!,workingUnits:'adjacent-1000-v2'}
 const legacy=workingImportUnits(old),oldChoices=createSceneRosterRepairChoices(legacy,createSceneRosterFragmentTable(legacy))
 assert.equal(legacy[0].text.length,1000);assert.equal(legacy.some(u=>u.text.includes(name)),false);assert.equal(oldChoices.hasSource(name),true);assert.deepEqual(oldChoices.forLiteral(name),[])
 const fresh=session(text),before=structuredClone({text:fresh.workingProse,original:fresh.originalProse,chapters:fresh.chapters,files:fresh.files}),units=workingImportUnits(fresh)
 assert.ok(units.some(u=>u.text.includes(name)),'the source-present name must have an actual single-unit anchor')
 const unit=units.find(u=>u.text.includes(name))!,choices=createSceneRosterRepairChoices(units,createSceneRosterFragmentTable(units)),ref=choices.addAnchor({unitId:unit.id,quote:unit.text},name),anchor=choices.resolve(ref,'mention',name)
 validateSceneRosterRecords([{name,aliases:[],mentions:[{literal:name,evidence:anchor}],context:[],links:[]}],units)
 assert.deepEqual({text:fresh.workingProse,original:fresh.originalProse,chapters:fresh.chapters,files:fresh.files},before);assert.equal(units.map(u=>u.text).join(''),text)
})

test('WB02: fresh v3 is explicit while old policies, cached geometry and legacy/raw paths keep their original boundaries',()=>{
 const text='甲\r\n\r\n'.repeat(450),fresh=session(text),old=session(text);old.budgetPolicy={...old.budgetPolicy!,workingUnits:'adjacent-1000-v2'}
 assert.equal(fresh.budgetPolicy!.version,2);assert.equal(fresh.budgetPolicy!.workingUnits,'sentence-1000-v3');assert.equal(validateImportBudgetPolicy(fresh.budgetPolicy),fresh.budgetPolicy);assert.equal(validateImportBudgetPolicy(old.budgetPolicy),old.budgetPolicy)
 assert.deepEqual(fresh.budgetPolicy!.text,old.budgetPolicy!.text);assert.deepEqual(fresh.budgetPolicy!.review,old.budgetPolicy!.review)
 assert.throws(()=>validateImportBudgetPolicy({...fresh.budgetPolicy,workingUnits:'sentence-1000-unknown'}),/策略/);assert.throws(()=>validateImportBudgetPolicy({...fresh.budgetPolicy,extra:true}),/策略/)
 const raw=splitImportUnits([{...old.files[0],id:'working-0'}]).map(u=>({...u,kind:'body' as const})),expected=coalesceImportWorkingUnits(raw,text),cached=workingImportUnits(old)
 assert.deepEqual(cached,expected);old.coverage.review=[cached[0].id];const before=structuredClone(old),audit=importHash(importBudgetAudit(old));assert.equal(workingImportUnits(old),cached);assert.deepEqual(old,before);assert.equal(importHash(importBudgetAudit(old)),audit)
 assert.notEqual(importHash(importBudgetAudit(fresh)),audit,'v3 and actual working geometry contribute to the existing audit fingerprint')
 const legacy=session(text);delete legacy.budgetPolicy;legacy.legacyBudget={version:1,text:importBudgetProfile(1048576,1),review:importBudgetProfile(1048576,1)}
 assert.deepEqual(workingImportUnits(legacy),raw);assert.equal(importBudgetAudit(legacy),undefined)
 const source=old.files[0];assert.deepEqual(splitImportUnits([source],1000).map(u=>u.text).slice(0,2),['甲\r\n\r\n','甲\r\n\r\n'],'raw source paragraph splitting is unchanged')
 assert.equal(createImportBudgetPolicy({text:model,review:{...model,contextWindow:16000}}),undefined)
})

test('WB03: v3 partitions are deterministic, bounded and exact for Unicode, CRLF, sentence ends and hard fallback',async t=>{
 const samples=[['empty',''],['short','短正文😀\r\n'],['exact1000','甲'.repeat(1000)],['unpunctuated','甲'.repeat(2501)],['surrogate-limit','甲'.repeat(999)+'😀'+'乙'.repeat(1000)],['CRLF-limit','甲'.repeat(999)+'\r\n'+'乙'.repeat(1002)],['mixed-newlines','甲\r\n乙\n丙\r丁。'.repeat(230)],['closing-quotes','甲'.repeat(950)+'。”』'+'乙'.repeat(1100)],['english','A'.repeat(950)+'. '+'B'.repeat(1100)],['decimal','甲'.repeat(995)+'3.14'+'乙'.repeat(20)]] as const
 for(const[label,text]of samples)await t.test(label,()=>{
  const input={id:'working-synthetic',text},before=structuredClone(input),result=splitSentenceWorkingUnits(input);assert.deepEqual(splitSentenceWorkingUnits(input),result);assert.deepEqual(input,before)
  assert.equal(result.units.map(u=>u.text).join(''),text);let end=0
  for(const u of result.units){assert.equal(u.start,end);assert.ok(u.end>u.start&&u.end-u.start<=1000);assert.equal(u.text,text.slice(u.start,u.end));assert.equal(u.id,`${input.id}:${u.start}:${u.end}`);assert.equal(u.fileId,input.id);assert.equal(u.kind,'body');assert.equal(u.part,'正文');assert.ok(safeImportBoundary(text,u.start)&&safeImportBoundary(text,u.end));assert.ok(u.text.isWellFormed());assert.ok(!(text[u.end-1]==='\r'&&text[u.end]==='\n'));end=u.end}
  assert.equal(end,text.length);if(label==='unpunctuated')assert.equal(result.hardFallbackCuts,2);if(label==='empty'||label==='short'||label==='exact1000')assert.equal(result.hardFallbackCuts,0)
  if(label==='closing-quotes')assert.equal(result.units[0].end,953);if(label==='english')assert.equal(result.units[0].end,951);if(label==='decimal')assert.equal(result.units[0].end,1000)
 })
})

test('WB04: the last complete separator wins and coalescing can only remove existing boundaries',()=>{
 const text='甲'.repeat(200)+'。'+'乙'.repeat(700)+'！'+'丙'.repeat(250),result=splitSentenceWorkingUnits({id:'working',text});assert.equal(result.units[0].end,902)
 const body='甲'.repeat(1300),parts=[[0,400],[400,1000],[1000,1300]].map(([start,end])=>({id:`w:${start}:${end}`,fileId:'w',start,end,text:body.slice(start,end),kind:'body' as const,part:'正文'})),before=structuredClone(parts),combined=coalesceImportWorkingUnits(parts,body)
 assert.deepEqual(parts,before);assert.deepEqual(combined.map(u=>[u.start,u.end]),[[0,1000],[1000,1300]]);assert.equal(combined.map(u=>u.text).join(''),body);assert.ok(combined.every(u=>parts.some(p=>p.start===u.start)&&parts.some(p=>p.end===u.end)))
})

test('WB05: partitioning preserves all 1402 synthetic chapter contents, offsets, file hashes and original prose',()=>{
 let text='';const chapters=Array.from({length:1402},(_,index)=>{const start=text.length,content=`第${index+1}章 合成章节\r\n`+'合成正文。'.repeat(25)+'\r\n';text+=content;return{id:'chapter-'+index,title:'合成章节',start,end:text.length,content}}),s=session(text);s.chapters=chapters
 const before=structuredClone({files:s.files,original:s.originalProse,working:s.workingProse,chapters:s.chapters}),hash=importHash(text),units=workingImportUnits(s)
 assert.equal(s.chapters.length,1402);assert.deepEqual({files:s.files,original:s.originalProse,working:s.workingProse,chapters:s.chapters},before);assert.equal(importHash(units.map(u=>u.text).join('')),hash);assert.equal(s.chapters.map(c=>c.content).join(''),text);assert.ok(s.chapters.every(c=>text.slice(c.start,c.end)===c.content));assert.equal(s.files[0].hash,hash)
})
