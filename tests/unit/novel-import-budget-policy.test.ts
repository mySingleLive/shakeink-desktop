import assert from 'node:assert/strict'
import {test} from 'node:test'
import {importHash,splitImportUnits,splitImportBatches} from '../../desktop/core/novel-import'
import {importBudgetProfile,createImportBudgetPolicy,type ImportBudgetState} from '../../desktop/core/novel-import-budget-policy'
import type {ImportSession,ImportModel} from '../../desktop/shared/novel-import'

test('NI-LB09: own-run audit reconstructs fact coverage from persisted policy without promoting legacy records',async()=>{
 const {importReviewTaskKeys,iterateImportReviewTasks,importReviewGeometryForSession}=await import('../../desktop/core/novel-import-review-tasks')
 const prose='正文甲乙丙丁。\n\n'.repeat(80),model:ImportModel={id:'synthetic',name:'synthetic',modelId:'synthetic',endpoint:'https://model.invalid',authRevision:1,contextWindow:16000},large={...model,contextWindow:1048576},file={id:'f',name:'正文.txt',path:'/private/tmp/synthetic',format:'txt' as const,bytes:0,hash:importHash(prose),text:prose,included:true},units=splitImportUnits([file]).map(u=>({...u,kind:'body' as const})),artifact={id:'same',kind:'character' as const,name:'人物',text:'首文字'+ '设'.repeat(6200)+'末文字',facts:{first:'替代甲',last:'末字段替代乙'},origin:'inferred' as const,sourceUnitIds:units.map(u=>u.id),evidence:units.map(u=>({unitId:u.id,quote:u.text.slice(0,5)}))}
 const s:ImportSession&ImportBudgetState={version:1,id:'synthetic-session',revision:1,phase:'paused',title:'synthetic',files:[file],units,selected:['body'],targets:['character'],infer:true,artifacts:[artifact],conflicts:[],patches:[],originalProse:prose,workingProse:prose,workingRevision:0,workingUnits:units,chapters:[],steps:[],coverage:{},notFound:[],epoch:0,createdAt:'',updatedAt:'',decisions:[],models:{text:model,review:model},legacyBudget:{version:1,text:importBudgetProfile(16000,1),review:importBudgetProfile(16000,1)}}
 const expected=(budget:number,maxUnits:number)=>{
  const pieces=[...splitImportUnits([{...file,id:artifact.id,text:artifact.text}],Math.max(250,Math.floor(budget/5))).map(u=>({text:u.text,facts:{}})),...Object.entries(artifact.facts).map(([field,value])=>({text:'',facts:{[field]:value}}))],batches=maxUnits===100?splitImportBatches(units,Math.max(1000,Math.floor(budget/2))):[units]
  return pieces.flatMap((_p,index)=>batches.map(batch=>importHash({artifact:artifact.id,text:artifact.text,facts:artifact.facts,evidence:artifact.evidence,index,units:batch.map(u=>({id:u.id,text:importHash(u.text)}))})))
 }
 const before=JSON.stringify(s),keys=importReviewTaskKeys(s);assert.deepEqual(keys,expected(5000,100));assert.equal(JSON.stringify(s),before)
 s.models={text:large,review:large};assert.deepEqual(importReviewTaskKeys(s),keys,'current model display cannot reinterpret old successful facts')
 s.legacyBudget={version:1,text:importBudgetProfile(1048576,1),review:importBudgetProfile(1048576,1)};assert.deepEqual(importReviewTaskKeys(s),expected(12000,100));assert.notDeepEqual(importReviewTaskKeys(s),keys)
 delete s.legacyBudget;s.budgetPolicy=createImportBudgetPolicy({text:large,review:large});const geometry=importReviewGeometryForSession(s);assert.equal(geometry.pieceCharacters,16384);assert.deepEqual(importReviewTaskKeys(s),expected(81920,300));const tasks=[...iterateImportReviewTasks(s)];assert.equal(tasks.length,3);assert.equal(tasks[0].artifact.text,artifact.text);assert.equal(tasks.at(-1)!.artifact.facts.last,artifact.facts.last);assert.ok(tasks.every(t=>t.artifact.id==='same'&&t.artifact.evidence.length===units.length));assert.equal(tasks.map(t=>t.key).join(),importReviewTaskKeys(s).join())
 s.budgetPolicy={...s.budgetPolicy!,version:3 as 2};assert.throws(()=>importReviewTaskKeys(s),/策略|预算/)
 delete s.budgetPolicy;delete s.models;assert.throws(()=>importReviewTaskKeys(s),/预算|模型/)
})
