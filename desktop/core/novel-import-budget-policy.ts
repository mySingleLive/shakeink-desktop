import type {ImportModel,ImportUnit} from '../shared/novel-import'

export const IMPORT_LARGE_CONTEXT_MIN=262144
export const IMPORT_FIXED_PROMPT_RESERVE_BYTES=65536
export interface ImportBudgetProfile {contextWindow:number;characters:number;maxUnits:100|300}
export interface ImportExecutionBudget extends ImportBudgetProfile {version:1|2}
export interface ImportBudgetPolicy {version:2;text:ImportBudgetProfile;review:ImportBudgetProfile;workingUnits:'adjacent-1000-v2'}
export interface ImportLegacyBudget {version:1;text?:ImportBudgetProfile;review?:ImportBudgetProfile}
export interface ImportBudgetState {budgetPolicy?:ImportBudgetPolicy;legacyBudget?:ImportLegacyBudget}
export class ImportBudgetPolicyError extends Error {constructor(){super('导入预算策略无效，请保留草稿并核对配置')}}
const invalid=():never=>{throw new ImportBudgetPolicyError()}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k))
export function importCharacterBudget(contextWindow:number,version:1|2=1):number{
 if(version!==1&&version!==2)return invalid()
 if(version===2&&Number.isSafeInteger(contextWindow)&&contextWindow>=IMPORT_LARGE_CONTEXT_MIN)return Math.min(120000,Math.floor((contextWindow-IMPORT_FIXED_PROMPT_RESERVE_BYTES)/12))
 const size=contextWindow>0?contextWindow:16000,budget=Math.min(12000,Math.floor((size-6000)/2))
 if(budget<1000)throw Error('当前模型上下文预算不足，请选择更大窗口的模型')
 return budget
}
export function importBudgetProfile(contextWindow:number,version:1|2):ImportBudgetProfile{return {contextWindow,characters:importCharacterBudget(contextWindow,version),maxUnits:version===2?300:100}}
function validateProfile(value:unknown,version:1|2):ImportBudgetProfile{
 if(!object(value)||!exact(value,['contextWindow','characters','maxUnits'])||typeof value.contextWindow!=='number'||!Number.isSafeInteger(value.contextWindow)||value.contextWindow<0||version===2&&value.contextWindow<IMPORT_LARGE_CONTEXT_MIN)return invalid()
 let expected:number;try{expected=importCharacterBudget(value.contextWindow,version)}catch{return invalid()}
 if(value.characters!==expected||value.maxUnits!==(version===2?300:100))return invalid()
 return value as unknown as ImportBudgetProfile
}
export function validateImportBudgetPolicy(value:unknown):ImportBudgetPolicy{
 if(!object(value)||!exact(value,['version','text','review','workingUnits'])||value.version!==2||value.workingUnits!=='adjacent-1000-v2')return invalid()
 validateProfile(value.text,2);validateProfile(value.review,2);return value as unknown as ImportBudgetPolicy
}
export function validateImportLegacyBudget(value:unknown):ImportLegacyBudget{
 if(!object(value)||value.version!==1||Object.keys(value).some(k=>!['version','text','review'].includes(k))||!value.text&&!value.review)return invalid()
 if(Object.hasOwn(value,'text'))validateProfile(value.text,1);if(Object.hasOwn(value,'review'))validateProfile(value.review,1);return value as unknown as ImportLegacyBudget
}
export function validateImportBudgetState(state:ImportBudgetState){
 if(state.budgetPolicy!==undefined){validateImportBudgetPolicy(state.budgetPolicy);if(state.legacyBudget!==undefined)return invalid()}
 if(state.legacyBudget!==undefined)validateImportLegacyBudget(state.legacyBudget)
}
type SessionBudgetState=ImportBudgetState&{publication?:unknown;models?:{text?:ImportModel;review?:ImportModel};analysisGrant?:{textModel:ImportModel;reviewModel?:ImportModel};classificationGrant?:{textModel:ImportModel};coverage:Record<string,string[]>}
/** Capture before the controller refreshes display models or revokes grants. */
export function captureImportLegacyBudget(s:SessionBudgetState){
 validateImportBudgetState(s);if(s.budgetPolicy||s.publication)return
 const completedAnalysis=Object.entries(s.coverage).some(([key,ids])=>key!=='classify'&&ids.length)
 if(!s.legacyBudget?.text&&!s.analysisGrant&&completedAnalysis||!s.legacyBudget?.review&&!s.analysisGrant?.reviewModel&&((s.coverage.review?.length??0)+(s.coverage.reviewFacts?.length??0)>0))throw Error('请恢复原模型预算记录，无法证明旧检查点分片范围')
 const text=s.analysisGrant?.textModel??s.classificationGrant?.textModel??s.models?.text,review=s.analysisGrant?.reviewModel??s.models?.review
 for(const [role,model] of [['text',text],['review',review]] as const){
  if(s.legacyBudget?.[role]||!model)continue
  let profile:ImportBudgetProfile
  try{profile=importBudgetProfile(model.contextWindow,1)}catch(error){const completed=role==='review'?(s.coverage.review?.length??0)+(s.coverage.reviewFacts?.length??0):Object.values(s.coverage).reduce((n,ids)=>n+ids.length,0);if(completed)throw error;continue}
  s.legacyBudget={...s.legacyBudget,version:1,[role]:profile}
 }
}
export function importSessionBudget(s:SessionBudgetState,role:'text'|'review',model:ImportModel):ImportExecutionBudget{
 validateImportBudgetState(s)
 if(s.budgetPolicy)return importRequestBudget({executionBudget:{version:2,...s.budgetPolicy[role]}},model)
 captureImportLegacyBudget(s)
 let profile=s.legacyBudget?.[role]
 if(!profile){
  const completed=role==='review'?(s.coverage.review?.length??0)+(s.coverage.reviewFacts?.length??0):Object.values(s.coverage).reduce((n,ids)=>n+ids.length,0)
  if(completed)throw Error('缺少原模型预算绑定，请保留草稿并恢复原配置')
  profile=importBudgetProfile(model.contextWindow,1);s.legacyBudget={...s.legacyBudget,version:1,[role]:profile}
 }
 return importRequestBudget({executionBudget:{version:1,...profile}},model)
}
export function createImportBudgetPolicy(models:{text?:ImportModel;review?:ImportModel}):ImportBudgetPolicy|undefined{
 if(!models.text||!models.review||[models.text,models.review].some(m=>!Number.isSafeInteger(m.contextWindow)||m.contextWindow<IMPORT_LARGE_CONTEXT_MIN))return undefined
 return {version:2,text:importBudgetProfile(models.text.contextWindow,2),review:importBudgetProfile(models.review.contextWindow,2),workingUnits:'adjacent-1000-v2'}
}
/** The worker verifies frozen request geometry against the actual resolved role.
 * Missing fields retain the old API's exact default budget. Capacity growth is
 * permission to accept a frozen profile, never permission to re-partition it. */
export function importRequestBudget(request:{executionBudget?:unknown},model:ImportModel):ImportExecutionBudget{
 const value=request.executionBudget
 if(value===undefined)return {version:1,...importBudgetProfile(model.contextWindow,1)}
 if(!object(value)||!exact(value,['version','contextWindow','characters','maxUnits'])||value.version!==1&&value.version!==2)return invalid()
 const profile=validateProfile({contextWindow:value.contextWindow,characters:value.characters,maxUnits:value.maxUnits},value.version)
 if(profile.characters>importCharacterBudget(model.contextWindow,2))throw Error('模型容量不足以继续原预算策略，请恢复兼容配置')
 return {version:value.version,...profile}
}
export function importReviewGeometry(profile:ImportBudgetProfile){return {characters:profile.characters,maxUnits:profile.maxUnits,pieceCharacters:Math.max(250,Math.floor(profile.characters/5)),evidenceCharacters:Math.max(1000,Math.floor(profile.characters/2))}}
/** Default output is intentionally identical to the original 100-unit splitter. */
export function splitBudgetBatches(units:ImportUnit[],maxCharacters:number,maxUnits=100):ImportUnit[][]{
 if(!Number.isFinite(maxCharacters)||maxCharacters<2)throw Error('模型预算不足')
 if(!Number.isSafeInteger(maxUnits)||maxUnits<1||maxUnits>300)throw Error('来源单元数量预算无效')
 const batches:ImportUnit[][]=[];let batch:ImportUnit[]=[],size=0
 for(const unit of units){if(unit.text.length>maxCharacters)throw Error('单个来源单元超过模型预算，请重新分块');if(batch.length&&(size+unit.text.length>maxCharacters||batch.length>=maxUnits)){batches.push(batch);batch=[];size=0}batch.push(unit);size+=unit.text.length}
 if(batch.length)batches.push(batch);return batches
}
/** Plans request batches. `fits` includes the character and unit limits and grows with each added
 * unit, so the greedy split equals the per-unit plan whenever every greedy batch fits; one check
 * per batch replaces one full request serialization per unit. Otherwise the per-unit plan runs. */
export function importStageBatches(units:ImportUnit[],maxCharacters:number,maxUnits:number,fits:(batch:ImportUnit[])=>boolean):ImportUnit[][]{
 let greedy:ImportUnit[][]|undefined
 try{greedy=splitBudgetBatches(units,maxCharacters,maxUnits)}catch{greedy=undefined}
 if(greedy?.every(fits))return greedy
 const batches:ImportUnit[][]=[];let batch:ImportUnit[]=[]
 for(const unit of units){
  const candidate=[...batch,unit];if(fits(candidate)){batch=candidate;continue}
  if(batch.length)batches.push(batch)
  batch=[unit];if(!fits(batch))throw Error('单个导入任务及完整元数据超过模型预算，请核对设定后重试')
 }
 if(batch.length)batches.push(batch);return batches
}
/** This operates only on newly generated working prose, never source units. */
export function coalesceImportWorkingUnits(units:ImportUnit[],text:string):ImportUnit[]{
 const boundary=(at:number)=>Number.isSafeInteger(at)&&at>=0&&at<=text.length&&!(at>0&&at<text.length&&/[\uD800-\uDBFF]/u.test(text[at-1])&&/[\uDC00-\uDFFF]/u.test(text[at]))
 const result:ImportUnit[]=[]
 for(const unit of units){
  if(!boundary(unit.start)||!boundary(unit.end)||unit.end<=unit.start||unit.text!==text.slice(unit.start,unit.end)||unit.text.length>1000)throw Error('正文单元范围、字符边界或预算无效')
  const previous=result.at(-1)
  if(previous&&previous.kind==='body'&&unit.kind==='body'&&previous.fileId===unit.fileId&&previous.part===unit.part&&previous.end===unit.start&&unit.end-previous.start<=1000){previous.end=unit.end;previous.text=text.slice(previous.start,previous.end);previous.id=`${previous.fileId}:${previous.start}:${previous.end}`}
  else result.push({...unit})
 }
 return result
}
export function prepareImportWorkingUnits(state:ImportBudgetState&{workingProse:string;workingUnits?:ImportUnit[]},createLegacy:()=>ImportUnit[]):ImportUnit[]{
 if(state.workingUnits)return state.workingUnits
 const units=createLegacy();state.workingUnits=state.budgetPolicy?(validateImportBudgetPolicy(state.budgetPolicy),coalesceImportWorkingUnits(units,state.workingProse)):units
 return state.workingUnits
}
