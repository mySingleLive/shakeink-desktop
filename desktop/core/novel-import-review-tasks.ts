import type {ImportArtifact,ImportSession,ImportUnit} from '../shared/novel-import'
import {importHash,selectedImportUnits,splitImportUnits,workingImportUnits} from './novel-import'
import {importBudgetProfile,importReviewGeometry,splitBudgetBatches,validateImportBudgetPolicy,validateImportLegacyBudget,type ImportBudgetState} from './novel-import-budget-policy'
import {createImportReviewProjection,type ImportReviewProjection} from './novel-import-semantics'
import {IMPORT_SCENE_PROFILE_TEXT_FIELDS} from '../shared/novel-import-scene-links'

type State=ImportSession&ImportBudgetState
export interface ImportReviewTask {key:string;units:ImportUnit[];artifact:ImportArtifact;projection?:ImportReviewProjection}
/** Audit and controller share persisted geometry, never a freshly resolved model. */
export function importReviewGeometryForSession(s:State){
 if(s.budgetPolicy)return importReviewGeometry(validateImportBudgetPolicy(s.budgetPolicy).review)
 if(s.legacyBudget){const profile=validateImportLegacyBudget(s.legacyBudget).review;if(!profile)throw Error('缺少原审核预算绑定，请保留草稿');return importReviewGeometry(profile)}
 const model=s.analysisGrant?.reviewModel??s.models?.review
 if(!model)throw Error('缺少原审核模型预算记录，请保留草稿')
 return importReviewGeometry(importBudgetProfile(model.contextWindow,1))
}
export function* iterateImportReviewTasks(s:State):Generator<ImportReviewTask>{
 const geometry=importReviewGeometryForSession(s),working=s.workingUnits??workingImportUnits({...s,workingUnits:undefined}),units=[...working,...selectedImportUnits(s).filter(u=>u.kind!=='body')],lookup=new Map(units.map(u=>[u.id,u]))
 for(const artifact of s.artifacts){
  const evidenceIds=[...new Set(artifact.evidence.map(e=>e.unitId))],evidenceUnits=evidenceIds.map(id=>lookup.get(id))
  if(!evidenceUnits.length||evidenceUnits.some(u=>!u))throw Error('推断或来源设定缺少可复核的原文证据')
  const pieces:{text:string;facts:Record<string,string>;textRange?:{start:number;end:number}}[]=splitImportUnits([{id:artifact.id,name:artifact.name,path:'',format:'txt',bytes:0,hash:'',text:artifact.text,included:true}],geometry.pieceCharacters).map(u=>({text:u.text,facts:{},textRange:{start:u.start,end:u.end}}))
  for(const [field,value] of Object.entries(artifact.facts)){
   // These native free-text values have no text-piece limit. Keep them whole;
   // the controller still checks the full fact, evidence and metadata budget.
   const nativeText=artifact.kind==='scene'&&artifact.schema===2&&IMPORT_SCENE_PROFILE_TEXT_FIELDS.some(name=>name===field)
   if(!nativeText&&field.length+value.length>geometry.pieceCharacters)throw Error('模型结构事实超过复核分片预算，请细分设定后重试')
   pieces.push({text:'',facts:{[field]:value}})
  }
  if(!pieces.length)pieces.push({text:'',facts:{}})
  const batches=splitBudgetBatches(evidenceUnits as ImportUnit[],geometry.evidenceCharacters,geometry.maxUnits)
  for(let index=0;index<pieces.length;index++)for(const batch of batches){
   const ids=new Set(batch.map(u=>u.id)),key=importHash({artifact:artifact.id,text:artifact.text,facts:artifact.facts,evidence:artifact.evidence,index,units:batch.map(u=>({id:u.id,text:importHash(u.text)}))})
   const {textRange,...piece}=pieces[index],fragment={...artifact,...piece,evidence:artifact.evidence.filter(e=>ids.has(e.unitId)),sourceUnitIds:artifact.sourceUnitIds.filter(id=>ids.has(id))}
   yield {key,units:batch,artifact:fragment,...(s.semanticVersion===1?{projection:createImportReviewProjection(artifact,fragment,textRange)}:{})}
  }
 }
}
export function importReviewTaskKeys(s:State){const keys:string[]=[];for(const task of iterateImportReviewTasks(s))keys.push(task.key);return keys}
