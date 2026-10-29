import {isAbsolute} from 'node:path'
import type {generateJSON as GenerateImportJSON,GenerateUsage} from '../../src/lib/ai/generate'
import {LOCAL_AUTHOR_ID} from './context'
import type {ResolvedModel} from '../../src/lib/ai/provider'
import {z} from 'zod'
import {buildThinkingProviderOptions} from '../../src/lib/ai/thinking-effort'
import {providerFamily} from '../../src/lib/ai/provider-family'
import {importRequestBudget,type ImportExecutionBudget} from '../core/novel-import-budget-policy'
import {serializeImportAiPayload,assertImportPayloadBudget,importAiPrompt,assertImportFixedPromptReserve,assertImportReconcileContextBudget} from '../core/novel-import-ai-payload'
import {IMPORT_KINDS,IMPORT_TARGETS,type ImportAiRequest,type ImportAiResult,type ImportEvidence,type ImportModel,type ImportUnit} from '../shared/novel-import'
import {importHash,validateImportEvidence,validateImportReferences} from '../core/novel-import'
import {importStructureCandidateMetadata,importStructureResult} from '../core/novel-import-structure'
import {IMPORT_WORLD_SETTING_TYPES,IMPORT_RELIABILITIES,IMPORT_SEMANTIC_FACT_FIELDS,importArtifactEditSchema,importArtifactSemanticHash,validateImportSemanticArtifact,applyImportArtifactFieldEdits,importReviewProjectionSchema,assertImportReviewProjection,assertImportMissingProjection,type ImportSemanticAiRequest,type ImportSemanticAiResult,type ImportSemanticEntity,type ImportSemanticLock} from '../core/novel-import-semantics'

const evidence=z.object({unitId:z.string().min(1),quote:z.string().min(1)}).strict()
const artifact=z.object({id:z.string().min(1),kind:z.enum(IMPORT_TARGETS as [typeof IMPORT_TARGETS[number],...typeof IMPORT_TARGETS]),name:z.string().min(1).max(300),text:z.string().min(1),facts:z.record(z.string(),z.string()),evidence:z.array(evidence).min(1),sourceUnitIds:z.array(z.string()),origin:z.enum(['source','inferred','confirmed'])}).strict()
const alternative=z.object({text:z.string(),value:z.string(),artifactId:z.string().optional(),unitId:z.string().optional()}).strict()
const conflict=z.object({id:z.string().min(1),type:z.enum(['setting-body','source-source','body-body']),kind:z.enum(IMPORT_KINDS),entity:z.string(),field:z.string(),source:alternative,candidate:alternative,evidence:z.array(evidence).min(1),status:z.literal('pending'),hash:z.string()}).strict()
const patch=z.object({id:z.string(),start:z.number().int().nonnegative(),end:z.number().int().nonnegative(),before:z.string(),after:z.string(),reason:z.string(),workingRevision:z.number().int().nonnegative(),conflictId:z.string()}).strict()
const schema=z.object({classifications:z.array(z.object({unitId:z.string(),kind:z.enum([...IMPORT_KINDS,'unknown'])}).strict()).optional(),artifacts:z.array(artifact).optional(),conflicts:z.array(conflict).optional(),patches:z.array(patch).optional(),notFound:z.boolean().optional()}).strict()
const target=z.enum(IMPORT_TARGETS as [typeof IMPORT_TARGETS[number],...typeof IMPORT_TARGETS]),nonempty=z.string().refine(value=>!!value.trim()),uniqueIds=z.array(nonempty).refine(values=>new Set(values).size===values.length)
const missingTarget=z.object({kind:target,unitIds:uniqueIds.refine(ids=>ids.length>0),evidence:z.array(evidence).min(1),reason:nonempty,artifactId:nonempty.optional(),field:nonempty.optional(),baseHash:z.string().regex(/^[a-f0-9]{64}$/u).optional()}).strict().refine(item=>[item.artifactId,item.field,item.baseHash].filter(value=>value!==undefined).length%3===0,{error:'已有实体遗漏必须同时提供artifactId、field、baseHash'})
const semanticSchema=schema.extend({artifacts:z.array(artifact.extend({text:z.string()})).optional(),artifactEdits:z.array(importArtifactEditSchema).optional(),missingTargets:z.array(missingTarget).optional()}).strict()
const structureTitle=z.string().min(1).max(300).refine(value=>value===value.trim()&&value.isWellFormed()&&!/[\r\n\u0000-\u001f]/u.test(value))
/** Wizard rosters and foreshadow touches: short outputs. Touches carry one exact evidence quote; roster
 * entries are located locally by name (docs/238 B), so a model quote is optional. */
const rosterEvidence=z.object({unitId:z.string().min(1),quote:z.string().min(1).max(200)}).strict()
const rosterName=z.string().trim().min(1).max(300),rosterAliases=z.array(z.string().trim().min(1).max(300)).max(20).default([])
const rosterEntrySchemas={
 character:z.object({name:rosterName,aliases:rosterAliases,roleType:z.enum(['PROTAGONIST','SUPPORTING','ANTAGONIST']),evidence:rosterEvidence.optional()}).strict(),
 scene:z.object({name:rosterName,aliases:rosterAliases,parent:rosterName.optional(),evidence:rosterEvidence.optional()}).strict(),
 item:z.object({name:rosterName,aliases:rosterAliases,itemType:z.string().trim().max(100).default(''),important:z.boolean(),evidence:rosterEvidence.optional()}).strict(),
 world:z.object({name:rosterName,aliases:rosterAliases,parent:rosterName.optional(),settings:z.array(z.object({settingType:z.enum(IMPORT_WORLD_SETTING_TYPES),name:rosterName}).strict()).max(50),evidence:rosterEvidence.optional()}).strict(),
}
const touchSchema=z.object({foreshadowKey:rosterName,title:rosterName,content:z.string().max(4000).default(''),touch:z.object({kind:z.enum(['PLANT','MENTION','PAYOFF']),chapterIndex:z.number().int().nonnegative(),summary:z.string().max(200),quote:z.string().min(1).max(200),eventId:z.string().min(1).optional(),narrativeId:z.string().min(1).optional()}).strict(),evidence:rosterEvidence}).strict()
const structureSchema=z.object({chapterCuts:z.array(z.object({start:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),title:structureTitle,volume:structureTitle.optional(),candidateId:z.string().min(1).max(512).optional()}).strict()).max(5000),ignoredStarts:z.array(z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)).max(20000)}).strict()
/** Final parse uses this base schema; generation adds only local early checks. */
export function importAiResponseSchema(request:ImportSemanticAiRequest):z.ZodType<ImportSemanticAiResult>{
 if(request.intent==='structure')return structureSchema
 if(request.intent==='roster'){const entry=rosterEntrySchemas[request.kind as keyof typeof rosterEntrySchemas];if(!entry)throw Error('当前识别类别无效');return z.object({roster:z.array(entry).max(2000)}).strict() as unknown as z.ZodType<ImportSemanticAiResult>}
 if(request.intent==='touches')return z.object({touches:z.array(touchSchema).max(2000)}).strict() as unknown as z.ZodType<ImportSemanticAiResult>
 const base=request.semanticVersion===1?semanticSchema:schema
 if(request.phase==='classify'){
  const unitIds=new Set(request.units.map(unit=>unit.id))
  return base.extend({classifications:z.array(z.object({unitId:z.string(),kind:z.enum([...IMPORT_KINDS,'unknown'])}).strict()).length(unitIds.size).superRefine((entries,ctx)=>{
   if(new Set(entries.map(entry=>entry.unitId)).size!==entries.length||entries.some(entry=>!unitIds.has(entry.unitId)))ctx.addIssue({code:'custom',message:'分类结果未完整覆盖来源单元'})
  })}).strict()
 }
 if(request.semanticVersion!==1||request.phase!=='analyze'||request.intent==='reconcile')return base
 const kind=IMPORT_TARGETS.find(target=>target===request.kind)
 if(!kind)throw Error('当前分析目标类别无效')
 const unitIds=new Set(request.units.map(unit=>unit.id))
 // Field-level checks still report the fixed allowed value when a sibling
 // enum/literal fails; no raw values or dynamic source-ID list enter feedback.
 const reliabilityValues=IMPORT_RELIABILITIES.join('、'),facts=z.record(z.string(),kind==='character'?z.string({error:'角色facts每个值必须是字符串；数组/对象先编码为JSON字符串并转义引号，不能直接返回数组、对象、数字、布尔或null；保留有据内容，不以删除人物或清空资料通过'}):z.string()).superRefine((facts,ctx)=>{
  const reliability=facts.reliability
  if(reliability===undefined){if(kind==='worldline'||kind==='narrative')ctx.addIssue({code:'custom',path:['reliability'],message:'事件或叙事必须明确 reliability；合法值为'+reliabilityValues});return}
  if(!IMPORT_RELIABILITIES.some(value=>value===reliability)){ctx.addIssue({code:'custom',path:['reliability'],message:'reliability必须为'+reliabilityValues+'之一'});return}
  if(reliability!=='客观事实'&&!facts.attribution?.trim())ctx.addIssue({code:'custom',path:['attribution'],message:'非客观可靠性必须提供非空 attribution 信息归属说明'})
 })
 const requestedEvidence=evidence.superRefine((entry,ctx)=>{
  // Check with the exact late matcher, without replacing the raw quote. The
  // late gate still restores source layout after the final schema parse.
  try{rebindEvidence(entry,request.units)}catch(error){ctx.addIssue({code:'custom',message:error instanceof ImportEvidenceAnchorError?IMPORT_EVIDENCE_FEEDBACK[error.reason]:IMPORT_EVIDENCE_GUIDANCE})}
 })
 const requestedArtifact=artifact.extend({text:z.string(),kind:z.literal(kind,{error:'kind必须为本次唯一目标 '+kind+'，子类型不能放到kind'}),origin:z.literal('inferred',{error:'origin必须为 inferred'}),sourceUnitIds:z.array(z.string()).min(1,{error:'必须提供本次来源单元'}).refine(ids=>ids.every(id=>unitIds.has(id)),{error:'来源单元必须全部属于本次输入'}),facts,evidence:z.array(requestedEvidence).min(1)}).strict()
 const checkedArtifact=kind==='worldline'?requestedArtifact.superRefine((item,ctx)=>{
  // Reuse the final native validator without transforming provider values.
  try{validateImportSemanticArtifact(item)}catch{ctx.addIssue({code:'custom',path:['facts'],message:'worldline必须提供非空lineId、lineName、timeKind(unknown/exact/window)及people(JSON字符串数组)；eventId若提供须等于artifact.id；unknown不带timeValue/timeEnd，exact需有限timeValue且无timeEnd，window需有限timeValue/timeEnd且timeEnd不小于timeValue'})}
 }):requestedArtifact
 const narrativeArtifact=kind==='narrative'?requestedArtifact.superRefine((item,ctx)=>{
  if(ctx.issues.length)return
  try{validateImportSemanticArtifact(item)}catch{ctx.addIssue({code:'custom',path:['facts'],message:'narrative的chapterIndex/order须为非负安全整数字符串；refs须为严格JSON数组，eventId非空，kind只用happen/mention/recall或省略；每项ref须明确reliability(客观事实/角色有限事实/人物推测/可能不可靠)，非客观ref须非空attribution；保留原文、归属和时间范围，不制造字段或默认值'})}
 }):checkedArtifact
 const response=base.extend({artifacts:z.array(narrativeArtifact).optional()}).strict()
 if(kind==='narrative')return response.superRefine((result,ctx)=>{
  if(ctx.issues.length||!result.artifacts?.length)return
  try{validateSemanticLinks(request,result.artifacts)}catch{ctx.addIssue({code:'custom',path:['artifacts'],message:'narrator只用已提供角色id或唯一name；refs.eventId只引用可信worldline事件，refs.character只用角色id，chapterIndex沿用全书索引；ID身份不可混用。无法链接框架叙述者时保留原称谓及讲述/转述归属在text/attribution，不冒用角色、不造外键、不丢叙事点、不改正文；空refs不证明叙事或角色完整，仍须完整性审核'})}
 })
 if(kind!=='worldline')return response
 return response.superRefine((result,ctx)=>{
  if(ctx.issues.length||!result.artifacts?.length)return
  // The provider sees a filtered catalog; validate against the original full
  // request and complete batch without changing references or creating data.
  try{validateSemanticLinks(request,result.artifacts)}catch{ctx.addIssue({code:'custom',path:['artifacts'],message:'people只能引用已提供角色id或唯一name；父级只能为同类既有或本批真实节点，ID身份不可混用。缺可引用角色时保留有据事件及人物原称谓、认知归属在text/attribution，people只填已存在可引用部分；不造外键、不删改正文、不丢有据事件；空people不证明角色或两线完整，仍须完整性审核补齐'})}
 })
}
type AnchorDiagnosticEntry={reason:ImportEvidenceAnchorReason;unitId:string;quote:string}
type AnchorDiagnosticCandidate={issues:number;entries:AnchorDiagnosticEntry[]}
function anchorDiagnosticsEnabled(){return process.env.SHAKEINK_IMPORT_ANCHOR_DIAGNOSTICS==='1'&&!!process.env.SHAKEINK_TEST_ROOT&&isAbsolute(process.env.SHAKEINK_TEST_ROOT)}
/** Local, bounded observations only. Never used by the evidence acceptor. */
function reportAnchorDiagnostics(request:ImportSemanticAiRequest,candidate:AnchorDiagnosticCandidate|undefined){
 try{
  if(!candidate||!anchorDiagnosticsEnabled()||!IMPORT_TARGETS.some(kind=>kind===request.kind))return
  const cap=(value:number)=>Math.min(1000,value)
  const record={version:1,kind:request.kind,issues:cap(candidate.issues),inspected:candidate.entries.length,unknownUnit:0,tooShort:0,ambiguous:0,noMatch:0,otherUnitUnique:0,adjacentBoundaryUnique:0,unclassified:0,truncated:cap(candidate.issues-candidate.entries.length)}
  let remaining=2_000_000
  const spend=(length:number)=>{if(length>remaining)return false;remaining-=length;return true}
  const valid=(unit:ImportUnit)=>Number.isSafeInteger(unit.start)&&unit.start>=0&&Number.isSafeInteger(unit.end)&&unit.end>=0&&unit.end-unit.start===unit.text.length
  const classify=(entry:AnchorDiagnosticEntry):'otherUnitUnique'|'adjacentBoundaryUnique'|'unclassified'|'truncated'=>{
   if(entry.reason!=='unknown-unit'&&entry.reason!=='no-match')return 'unclassified'
   const quote=entry.quote
   if(quote.length>2000)return 'truncated'
   let matches=0
   for(const unit of request.units){
    if(unit.id===entry.unitId)continue
    if(!spend(unit.text.length))return 'truncated'
    for(let position=unit.text.indexOf(quote);position!==-1;position=unit.text.indexOf(quote,position+1)){matches=Math.min(2,matches+1);if(matches===2)break}
   }
   if(matches===1)return 'otherUnitUnique'
   matches=0
   for(let i=1;i<request.units.length;i++){
    const left=request.units[i-1],right=request.units[i]
    if(left.fileId!==right.fileId||!valid(left)||!valid(right)||left.end!==right.start)continue
    // Only the suffix/prefix capable of truly crossing this two-unit seam is
    // searched; UTF16 lengths and offsets agree with ImportUnit geometry.
    const seam=Math.min(quote.length-1,left.text.length),rightLength=Math.min(quote.length-1,right.text.length)
    if(!spend(seam+rightLength))return 'truncated'
    const text=left.text.slice(left.text.length-seam)+right.text.slice(0,rightLength)
    for(let position=text.indexOf(quote);position!==-1;position=text.indexOf(quote,position+1)){
     if(position<seam&&position+quote.length>seam)matches=Math.min(2,matches+1)
     if(matches===2)break
    }
   }
   return matches===1?'adjacentBoundaryUnique':'unclassified'
  }
  for(const entry of candidate.entries){
   record[entry.reason==='unknown-unit'?'unknownUnit':entry.reason==='too-short'?'tooShort':entry.reason==='no-match'?'noMatch':'ambiguous']++
   const category=classify(entry)
   if(category==='truncated'){record.truncated=cap(record.truncated+1);record.unclassified++}else record[category]++
  }
  const line='[novel-import-anchor-diagnostics] '+JSON.stringify(record)
  if(Buffer.byteLength(line,'utf8')<=768)console.warn(line)
 }catch{/* Diagnostics, encoding and logger failures cannot replace the original error. */}
}
/** Internal service generation bridge. Production resolves its own model/user;
 * tests may inject only generateJSON's existing generateText dependency. */
export async function generateImportAiJson(request:ImportSemanticAiRequest,context:{userId:string;resolvedModel:ResolvedModel}&ImportAiGenerationOptions,signal:AbortSignal,prompt:string,deps?:Parameters<typeof GenerateImportJSON>[1]):Promise<ImportSemanticAiResult>{
 const {generateJSON,generateText,StructuredGenerationError}=await import('../../src/lib/ai/generate')
 const ordinary=request.semanticVersion===1&&request.phase==='analyze'&&request.intent!=='reconcile'
 let evidenceReason:ImportEvidenceAnchorReason|undefined,diagnosticCandidate:AnchorDiagnosticCandidate|undefined
 // Observe all local issues, not generateJSON's first six display diagnostics.
 // Each parse and generation clears provenance; an aborting structural issue
 // skips the final check and therefore cannot inherit an earlier reason.
 const base=importAiResponseSchema(request),identityBase=ordinary&&!['worldline','narrative'].includes(request.kind!)?base.superRefine((result,ctx)=>{
  if(ctx.issues.length||!result.artifacts?.length)return
  try{validateIdentityLinks(request,result.artifacts)}catch{ctx.addIssue({code:'custom',path:['artifacts'],message:'实体ID、类型、名称及父级身份必须保持一致；不同实体使用新ID；原生结构及类型引用必须有效，不得改变作者锁定字段'})}
 }):base,schema=ordinary?z.preprocess(value=>{evidenceReason=undefined;diagnosticCandidate=undefined;return value},identityBase.check(ctx=>{
  if(!ctx.issues.length)return
  let reason:ImportEvidenceAnchorReason|undefined
  for(const issue of ctx.issues){
   const path=issue.path??[],index=(value:unknown)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0
   if(issue.code!=='custom'||path.length!==4||path[0]!=='artifacts'||!index(path[1])||path[2]!=='evidence'||!index(path[3]))return
   const matched=(Object.keys(IMPORT_EVIDENCE_FEEDBACK) as ImportEvidenceAnchorReason[]).find(key=>IMPORT_EVIDENCE_FEEDBACK[key]===issue.message)
   if(!matched)return
   reason??=matched
  }
  evidenceReason=reason
  // Keep only bounded references from this final parsed candidate. No scan or
  // output occurs here: generateJSON may still parse or generate successfully.
  try{if(anchorDiagnosticsEnabled()){
   const entries:AnchorDiagnosticEntry[]=[],result=ctx.value as ImportSemanticAiResult
   for(const issue of ctx.issues.slice(0,100)){
    const entry=result.artifacts![issue.path![1] as number].evidence[issue.path![3] as number]
    const matched=(Object.keys(IMPORT_EVIDENCE_FEEDBACK) as ImportEvidenceAnchorReason[]).find(key=>IMPORT_EVIDENCE_FEEDBACK[key]===issue.message)!
    entries.push({reason:matched,unitId:entry.unitId,quote:entry.quote})
   }
   diagnosticCandidate={issues:ctx.issues.length,entries}
  }}catch{diagnosticCandidate=undefined}
 })):identityBase
 const generation=ordinary?{generateText:((options:Parameters<typeof generateText>[0])=>{evidenceReason=undefined;diagnosticCandidate=undefined;return (deps?.generateText??generateText)(options)})}:deps
 try{return (await generateJSON({userId:context.userId,role:context.role??(request.phase==='review'?'review':'text'),action:'novel.import.'+request.phase,prompt,schema,resolvedModel:context.resolvedModel,abortSignal:signal,usage:context.usage,maxNetworkRetries:context.maxNetworkRetries},generation)).data}catch(error){
  if(!signal.aborted&&ordinary&&error instanceof StructuredGenerationError&&error.kind==='invalid_schema'&&evidenceReason){error.message=new ImportEvidenceAnchorError(evidenceReason).message;reportAnchorDiagnostics(request,diagnosticCandidate);throw error}
  if(signal.aborted||request.semanticVersion!==1||request.phase!=='analyze'||request.kind!=='character'||request.intent==='reconcile'||!(error instanceof StructuredGenerationError)||error.kind!=='invalid_schema')throw error
  const fields:Record<string,string>={id:'角色标识',kind:'资料类别',name:'角色名称',text:'角色正文',facts:'角色资料',evidence:'来源证据',sourceUnitIds:'来源单元',origin:'来源类型'},facts:Record<string,string>={roleType:'角色类型',aliases:'别名',age:'年龄',gender:'性别',occupation:'职业',personality:'性格',appearance:'外貌',clothing:'服饰',catchphrase:'口头禅',growthArc:'成长轨迹',relationships:'人物关系',reliability:'可靠性',attribution:'信息归属',temporalScope:'适用时段',characterId:'关联角色',sceneId:'关联地点',itemId:'关联物品'},labels=new Set<string>()
  const index=(value:string|undefined)=>typeof value==='string'&&/^(?:0|[1-9]\d{0,15})$/u.test(value)&&Number.isSafeInteger(Number(value))&&String(Number(value))===value
  // Only complete known paths from the bounded typed diagnostics are used.
  // No original message, feedback, value, index or unknown key is displayed.
  for(const path of Array.isArray(error.invalidFields)?error.invalidFields.slice(0,6):[]){
   if(typeof path!=='string'||path.length>100)continue
   const parts=path.split('.');let label:string|undefined
   if(path==='artifacts')label='角色资料'
   // Wizard roster entries: name list only, so the field names are the whole diagnosis.
   else if(request.intent==='roster'&&parts[0]==='roster'){
    const roster:Record<string,string>={name:'角色名称',aliases:'别名',roleType:'角色类型',evidence:'来源证据'}
    if(parts.length===1)label='角色清单'
    else if(index(parts[1]))label=parts.length===2?'角色清单':parts[2]==='evidence'&&(parts[3]==='unitId'||parts[3]==='quote')?(parts[3]==='unitId'?'来源单元':'原文引文'):Object.hasOwn(roster,parts[2])?roster[parts[2]]:'角色清单'
   }
   else if(parts[0]==='artifacts'&&index(parts[1])){
    if(parts.length===2)label='角色资料'
    else if(parts.length===3&&Object.hasOwn(fields,parts[2]))label=fields[parts[2]]
    else if(parts.length===4&&parts[2]==='facts'&&IMPORT_SEMANTIC_FACT_FIELDS.character.includes(parts[3]))label=Object.hasOwn(facts,parts[3])?facts[parts[3]]:'角色资料'
    else if(parts.length===4&&parts[2]==='sourceUnitIds'&&index(parts[3]))label='来源单元'
    else if(parts.length===5&&parts[2]==='evidence'&&index(parts[3])&&(parts[4]==='unitId'||parts[4]==='quote'))label=parts[4]==='unitId'?'来源单元':'原文引文'
   }
   if(label)labels.add(label)
  }
  throw Error(labels.size?'模型返回的角色字段结构无效（'+[...labels].join('、')+'），请核对后重试':'模型返回的角色结构无效，请核对后重试')
 }
}
const lockSchema=z.object({artifactId:nonempty,field:nonempty,value:z.string()}).strict()
const reconcileSchema=z.object({targetIds:uniqueIds.refine(ids=>ids.length>0),locks:z.array(lockSchema),decisionHash:nonempty,workingRevision:z.number().int().nonnegative(),decisions:z.array(z.object({conflictId:nonempty,choice:nonempty,explanation:z.string().optional(),hash:nonempty}).strict()).optional(),fragments:z.array(z.object({artifactId:nonempty,baseHash:nonempty,start:z.number().int().nonnegative(),end:z.number().int().nonnegative(),fields:uniqueIds}).strict()).optional()}).strict()
const semanticContextSchema=z.object({semanticVersion:z.literal(1),intent:z.enum(['reconcile','structure','roster','entity','touches']).optional(),reconcile:reconcileSchema.optional(),semanticLocks:z.array(lockSchema).optional(),selectedTargets:z.array(target).refine(values=>new Set(values).size===values.length).optional(),reviewProjection:importReviewProjectionSchema.optional()}).strict()
const entitySchema=z.object({id:nonempty,kind:target,name:nonempty,unitIds:z.array(nonempty).optional(),parentId:nonempty.optional(),entityType:z.enum(['PLACE','WORLD','SETTING']).optional(),worldId:nonempty.optional(),settingType:z.enum(IMPORT_WORLD_SETTING_TYPES).optional()}).strict()
function semanticLocks(request:ImportSemanticAiRequest):ImportSemanticLock[]{return [...(request.semanticLocks??[]),...(request.reconcile?.locks??[])]}
function validateSemanticRequest(request:ImportSemanticAiRequest){
 if(request.semanticVersion===undefined){if(request.intent!==undefined||request.reconcile!==undefined||request.semanticLocks!==undefined||request.selectedTargets!==undefined||request.reviewProjection!==undefined)throw Error('缺少语义版本，不能使用语义阶段上下文');return}
 if(!semanticContextSchema.safeParse({semanticVersion:request.semanticVersion,intent:request.intent,reconcile:request.reconcile,semanticLocks:request.semanticLocks,selectedTargets:request.selectedTargets,reviewProjection:request.reviewProjection}).success)throw Error('导入语义版本或上下文结构无效')
 if(request.reviewProjection!==undefined){if(request.phase!=='review')throw Error('审核投影不能用于其它阶段');assertImportReviewProjection(request.artifacts,request.reviewProjection)}
 if(request.intent==='reconcile'&&(request.phase!=='analyze'||!request.reconcile)||request.reconcile&&request.intent!=='reconcile')throw Error('设定修订阶段或上下文无效')
 if(['roster','entity','touches'].includes(request.intent??'')&&(request.phase!=='analyze'||!request.units.length||request.reviewProjection||request.conflict))throw Error('导入向导阶段或上下文无效')
 if(request.intent==='structure'){
  if(request.phase!=='classify'||!request.units.length||request.kind||request.artifacts.length||request.chapters?.length||request.entities?.length||request.semanticLocks?.length||request.reviewProjection||request.instruction||request.conflict)throw Error('卷章结构阶段或上下文无效')
  for(const unit of request.units)importStructureCandidateMetadata(unit)
 }
 if(request.reconcile&&(request.workingRevision!==request.reconcile.workingRevision||request.reconcile.targetIds.some(id=>!request.artifacts.some(a=>a.id===id))))throw Error('设定修订目标或正文版本范围无效')
 const fragments=request.reconcile?.fragments??[]
 if(new Set(fragments.map(f=>f.artifactId)).size!==fragments.length)throw Error('设定修订分片目标重复')
 for(const fragment of fragments){const a=request.artifacts.find(a=>a.id===fragment.artifactId);if(!a||!request.reconcile!.targetIds.includes(a.id)||fragment.end-fragment.start!==a.text.length||!a.text.isWellFormed()||fragment.fields.some(field=>!IMPORT_SEMANTIC_FACT_FIELDS[a.kind].includes(field)))throw Error('设定修订分片范围或字段无效')}
 const values=new Map<string,string>()
 for(const lock of semanticLocks(request)){const a=request.artifacts.find(a=>a.id===lock.artifactId),key=lock.artifactId+'\0'+lock.field;if(!a||lock.field!=='text'&&!IMPORT_SEMANTIC_FACT_FIELDS[a.kind].includes(lock.field)||(lock.field==='text'?a.text:a.facts[lock.field])!==lock.value||values.has(key)&&values.get(key)!==lock.value)throw Error('语义锁定字段或基础版本无效');values.set(key,lock.value)}
}
function validateSemanticStage(request:ImportSemanticAiRequest,result:ImportSemanticAiResult){
 const stage=request.intent==='structure'?'structure':request.phase==='analyze'?(request.intent==='reconcile'?'reconcile':request.intent==='roster'?'roster':request.intent==='touches'?'touches':'analyze'):request.phase,allowed:Record<string,string[]>={classify:['classifications'],structure:['chapterCuts','ignoredStarts'],roster:['roster'],touches:['touches'],analyze:['artifacts'],reconcile:['artifactEdits','conflicts'],review:['conflicts','missingTargets'],patch:['patches']}
 for(const field of ['classifications','artifacts','artifactEdits','conflicts','patches','missingTargets','chapterCuts','ignoredStarts','roster','touches'] as const)if(result[field]?.length&&!allowed[stage].includes(field))throw Error('当前语义阶段包含越权结果：'+field)
 if(result.notFound===true&&stage!=='analyze')throw Error('当前语义阶段不能返回notFound')
}
function validateIdentityLinks(request:ImportSemanticAiRequest,items:NonNullable<ImportAiResult['artifacts']>){
 const valid:typeof items=[],deferred:typeof items=[]
 for(const item of items)try{validateImportSemanticArtifact(item);valid.push(item)}catch{deferred.push(item)}
 const catalogOnly=deferred.map(item=>({...item,origin:'source' as const,facts:{}}))
 validateSemanticLinks({...request,artifacts:[...request.artifacts,...catalogOnly]},valid)
}
/** Validate typed links against the full trusted catalog, including entries
 * omitted from the bounded provider payload. No role/content is invented for
 * a catalog-only entity. Full native validation applies to actual new values. */
function validateSemanticLinks(request:ImportSemanticAiRequest,items:NonNullable<ImportAiResult['artifacts']>){
 const catalog=new Map<string,ImportSemanticEntity>()
 const fromArtifact=(a:typeof items[number]):ImportSemanticEntity=>a.origin==='source'?{...request.entities?.find(e=>e.id===a.id),id:a.id,kind:a.kind,name:a.name}:({id:a.id,kind:a.kind,name:a.name,...(a.facts.parentId?{parentId:a.facts.parentId}:{}),...(a.facts.entityType?{entityType:a.facts.entityType as ImportSemanticEntity['entityType']}:{}),...(a.facts.worldId?{worldId:a.facts.worldId}:{}),...(a.facts.settingType?{settingType:a.facts.settingType as ImportSemanticEntity['settingType']}:{})})
 const add=(entry:ImportSemanticEntity,replacing=false)=>{if(!entitySchema.safeParse(entry).success)throw Error('语义实体目录类型无效');const old=catalog.get(entry.id);if(old&&(old.kind!==entry.kind||old.name!==entry.name||replacing&&['entityType','worldId','settingType','parentId'].some(key=>(old as unknown as Record<string,unknown>)[key]!== (entry as unknown as Record<string,unknown>)[key])))throw Error('模型实体标识与原类型或父级身份冲突');catalog.set(entry.id,{...old,...entry})}
 for(const entry of request.entities??[])add(entry)
 for(const a of request.artifacts)add(fromArtifact(a))
 for(const a of items){validateImportSemanticArtifact(a);add(fromArtifact(a),request.intent!=='reconcile')}
 const typed=(id:string,kind:ImportSemanticEntity['kind'])=>{const found=catalog.get(id);if(!found||found.kind!==kind)throw Error('模型结果含无效实体引用');return found},character=(value:string)=>{const direct=catalog.get(value);if(direct){if(direct.kind!=='character')throw Error('角色引用类型无效');return}if([...catalog.values()].filter(e=>e.kind==='character'&&e.name===value).length!==1)throw Error('角色引用不存在或同名不明确')}
 const parents=new Map<string,string>()
 for(const e of catalog.values()){
  if(e.kind==='scene'&&e.parentId){if(e.entityType!=='PLACE'||typed(e.parentId,'scene').entityType!=='PLACE')throw Error('地点父引用必须为PLACE');parents.set(e.id,e.parentId)}
  if(e.kind==='world'&&e.entityType==='WORLD'&&e.parentId){if(typed(e.parentId,'world').entityType!=='WORLD')throw Error('世界父引用必须为WORLD');parents.set(e.id,e.parentId)}
  if(e.kind==='world'&&e.entityType==='SETTING'){if(!e.worldId||typed(e.worldId,'world').entityType!=='WORLD')throw Error('世界设定归属引用无效');if(e.parentId){const p=typed(e.parentId,'world');if(e.settingType!=='MAP'||p.entityType!=='SETTING'||p.settingType!=='MAP'||p.worldId!==e.worldId)throw Error('MAP父引用必须属于同世界MAP');parents.set(e.id,e.parentId)}}
  if(e.kind==='worldline'&&e.parentId){typed(e.parentId,'worldline');parents.set(e.id,e.parentId)}
 }
 for(const id of parents.keys()){const seen=new Set<string>();let cursor:string|undefined=id;while(cursor){if(seen.has(cursor))throw Error('语义父级引用形成循环');seen.add(cursor);cursor=parents.get(cursor)}}
 for(const a of items){const f=a.facts;for(const [field,kind] of [['characterId','character'],['sceneId','scene'],['itemId','item']] as const)if(f[field]!==undefined)typed(f[field],kind)
  if(a.kind==='character')for(const relation of JSON.parse(f.relationships??'[]'))if(relation.characterId)typed(relation.characterId,'character')
  if(a.kind==='worldline')for(const id of JSON.parse(f.people))character(id)
  if(a.kind==='narrative'){if(Number(f.chapterIndex)>= (request.chapters?.length??0))throw Error('叙事章节引用无效');if(f.narrator)character(f.narrator);for(const ref of JSON.parse(f.refs)){typed(ref.eventId,'worldline');if(ref.character)typed(ref.character,'character')}}
  for(const lock of semanticLocks(request).filter(lock=>lock.artifactId===a.id))if((lock.field==='text'?a.text:f[lock.field])!==lock.value)throw Error('模型结果改变作者锁定字段')
 }
}
type Resolved=ImportModel&Record<string,unknown>
export interface ImportAiGenerationOptions {usage?:GenerateUsage;maxNetworkRetries?:number;role?:'text'|'review'}
export const readOnlyImportUsage:GenerateUsage={
 async checkQuota(userId){if(userId!==LOCAL_AUTHOR_ID)throw Error('本地作者身份不匹配');return{tokenQuota:Number.MAX_SAFE_INTEGER,tokenUsed:0,remaining:Number.MAX_SAFE_INTEGER}},
 async recordUsage(input){
  if(input.userId!==LOCAL_AUTHOR_ID||input.modelId!==input.modelSnapshot.id)throw Error('用量记录的模型或作者不匹配')
  const{inputCostPer1k,outputCostPer1k}=input.modelSnapshot
  return inputCostPer1k!==undefined&&outputCostPer1k!==undefined?(input.promptTokens*inputCostPer1k+input.completionTokens*outputCostPer1k)/1000:0
 },
}
export interface ImportAiDependencies {
 resolve(role:'text'|'review',id:string):Promise<ImportModel>
 assert(model:ImportModel):Promise<void>
 generate(request:ImportAiRequest,model:ImportModel,signal:AbortSignal,prompt:string,options?:ImportAiGenerationOptions):Promise<unknown>
}
function equalSnapshot(a:ImportModel,b:ImportModel){return a.id===b.id&&a.modelId===b.modelId&&a.endpoint===b.endpoint&&a.authRevision===b.authRevision&&a.protocol===b.protocol&&a.provider===b.provider&&a.contextWindow===b.contextWindow}
function evidenceLayout(text:string){
 const raw:{char:string;start:number;end:number}[]=[];let offset=0
 for(const char of text){raw.push({char,start:offset,end:offset+char.length});offset+=char.length}
 const chars:string[]=[],ranges:{start:number;end:number}[]=[]
 for(let i=0;i<raw.length;){
  const token=raw[i]
  if(!/\s/u.test(token.char)){chars.push(token.char);ranges.push(token);i++;continue}
  let end=i+1;while(end<raw.length&&/\s/u.test(raw[end].char))end++
  // Preserve Latin/digit word boundaries. Only Han-Han layout whitespace can
  // disappear; every stored quote is restored from the exact UTF-16 source.
  if(!(i>0&&end<raw.length&&/\p{Script=Han}/u.test(raw[i-1].char)&&/\p{Script=Han}/u.test(raw[end].char))){chars.push(' ');ranges.push({start:token.start,end:raw[end-1].end})}
  i=end
 }
 return {chars,ranges}
}
type ImportEvidenceAnchorReason='unknown-unit'|'too-short'|'ambiguous'|'no-match'
class ImportEvidenceAnchorError extends Error{
 constructor(readonly reason:ImportEvidenceAnchorReason){super(`模型证据无法定位（${reason}）`)}
}
const IMPORT_EVIDENCE_GUIDANCE='证据必须引用本次unitId中的原文连续片段，不可概述、拼接或补字'
const IMPORT_EVIDENCE_FEEDBACK:Record<ImportEvidenceAnchorReason,string>={
 'unknown-unit':IMPORT_EVIDENCE_GUIDANCE+'；unitId必须逐字取自本次输入单元；quote只能复制该单元text，不得借其它单元',
 'too-short':IMPORT_EVIDENCE_GUIDANCE+'；此非精确引文非空白字符不足8，不能恢复排版；从声明单元text复制原文，保留空白与标点；精确短引文仍允许',
 ambiguous:IMPORT_EVIDENCE_GUIDANCE+'；排版恢复出现多个命中；从声明单元text复制含必要上下文的连续原文并保留原排版，不得任选位置',
 'no-match':IMPORT_EVIDENCE_GUIDANCE+'；声明单元内未找到引文；核对unitId与quote配对，从该单元text原样复制，不跨单元、不改字标点'
}
function anchorEvidence(entries:ImportEvidence[],units:ImportUnit[]):ImportEvidence[]{
 const lookup=new Map(units.map(unit=>[unit.id,unit.text]))
 return entries.map(entry=>{
  const text=lookup.get(entry.unitId)
  const fail=(reason:ImportEvidenceAnchorReason):never=>{throw new ImportEvidenceAnchorError(reason)}
  if(text===undefined)return fail('unknown-unit')
  if(entry.quote&&text.includes(entry.quote))return {...entry}
  const wanted=evidenceLayout(entry.quote)
  if(wanted.chars.filter(char=>!/\s/u.test(char)).length<8)return fail('too-short')
  const source=evidenceLayout(text);let position=-1
  for(let i=0;i<=source.chars.length-wanted.chars.length;i++)if(wanted.chars.every((char,j)=>source.chars[i+j]===char)){
   if(position!==-1)return fail('ambiguous')
   position=i
  }
  if(position===-1)return fail('no-match')
  return {...entry,quote:text.slice(source.ranges[position].start,source.ranges[position+wanted.chars.length-1].end)}
 })
}
/** A roster entry cites the model quote when it locates, otherwise the first unit whose text holds
 * the name or an alias. Entries named nowhere in the request are dropped, never guessed. */
function locatedRoster<T extends {name:string;aliases:string[];evidence?:ImportEvidence}>(entries:T[],units:ImportUnit[]):(T&{evidence:ImportEvidence})[]{
 return entries.flatMap(entry=>{
  if(entry.evidence)try{return [{...entry,evidence:anchorEvidence([entry.evidence],units)[0]}]}catch{/* fall back to the name */}
  for(const unit of units)for(const name of [entry.name,...entry.aliases])if(name&&unit.text.includes(name))return [{...entry,evidence:{unitId:unit.id,quote:name}}]
  return []
 })
}
/** Shared by the schema check and late acceptance of ordinary analysis. Only a
 * declared-unit no-match may move, and only to the single other request unit
 * holding exactly one verbatim (overlap-counted) copy of a quote with at least
 * eight non-space characters. No layout recovery, seam or fuzzy match moves it. */
function rebindEvidence(entry:ImportEvidence,units:ImportUnit[]):ImportEvidence{
 try{return anchorEvidence([entry],units)[0]}catch(error){
  if(!(error instanceof ImportEvidenceAnchorError)||error.reason!=='no-match'||[...entry.quote].filter(char=>!/\s/u.test(char)).length<8)throw error
  let owner:string|undefined,matches=0
  for(const unit of units){
   if(unit.id===entry.unitId)continue
   for(let position=unit.text.indexOf(entry.quote);position!==-1&&matches<2;position=unit.text.indexOf(entry.quote,position+1)){matches++;owner=unit.id}
   if(matches>1)break
  }
  if(matches!==1||!owner)throw error
  return {unitId:owner,quote:entry.quote}
 }
}
const defaults:ImportAiDependencies={
 async resolve(role,id){const {resolveLocalModel}=await import('./models');const {LOCAL_AUTHOR_ID}=await import('./context');return resolveLocalModel(LOCAL_AUTHOR_ID,role,id)},
 async assert(model){const {assertModelAuthorization}=await import('./models');await assertModelAuthorization(model as unknown as Parameters<typeof assertModelAuthorization>[0])},
 async generate(request,model,signal,prompt,options){
  const [{localModelRecord},{LOCAL_AUTHOR_ID},{instantiateModel},{runInsideLongTask}]=await Promise.all([import('./models'),import('./context'),import('../../src/lib/ai/provider'),import('../../src/lib/long-task')])
  const instantiated=instantiateModel(localModelRecord(model as unknown as Parameters<typeof localModelRecord>[0])),roster=request.intent==='roster'
  const resolved=roster?importRosterModel(instantiated,model as Resolved):instantiated
  // Roster batches are bounded by the import scheduler, not the shared chat slots (docs/238 C).
  if(roster)return runInsideLongTask(()=>generateImportAiJson(request,{userId:LOCAL_AUTHOR_ID,resolvedModel:resolved,...options},signal,prompt))
  return generateImportAiJson(request,{userId:LOCAL_AUTHOR_ID,resolvedModel:resolved,...options},signal,prompt)
 }
}
/** Name lists are extraction, not reasoning. On the DeepSeek SDK (OpenAI protocol) DeepSeek runs
 * without thinking; other models whose default uses thinking drop to their lightest published level;
 * models without levels or with a thinking-off default keep their options. Thinking keys are merged per provider, so settings such as OpenAI store:false stay. */
export function importRosterModel(resolved:ResolvedModel,model:{provider?:unknown;protocol?:unknown;modelId?:unknown;thinkingLevels?:unknown;defaultThinking?:unknown}):ResolvedModel{
 const provider=typeof model.provider==='string'?model.provider:'',modelId=typeof model.modelId==='string'?model.modelId:undefined
 const thinking=providerFamily(provider)==='deepseek'&&model.protocol!=='anthropic'?{deepseek:{thinking:{type:'disabled'}}}:(()=>{
  // A model whose default runs without thinking stays that way; only a thinking default is lowered.
  if(model.defaultThinking===undefined||model.defaultThinking==='default')return undefined
  const effort=Array.isArray(model.thinkingLevels)?model.thinkingLevels.find((level):level is string=>typeof level==='string'&&level!=='default'):undefined
  return effort?buildThinkingProviderOptions(provider,effort,modelId):undefined
 })()
 if(!thinking)return resolved
 const merged:Record<string,Record<string,unknown>>={...(resolved.providerOptions as Record<string,Record<string,unknown>>|undefined)}
 for(const [key,value] of Object.entries(thinking))merged[key]={...merged[key],...value}
 return {...resolved,providerOptions:merged as ResolvedModel['providerOptions']}
}
/** This adapter never invokes a URL directly. The existing model gateway owns
 * credentials, endpoint allowlists and cancellation of the provider stream. */
export async function runImportAi(request:ImportSemanticAiRequest&{executionBudget?:ImportExecutionBudget},signal:AbortSignal,deps:ImportAiDependencies=defaults,options?:ImportAiGenerationOptions):Promise<ImportSemanticAiResult>{
 signal.throwIfAborted()
 validateSemanticRequest(request)
 const responseSchema=importAiResponseSchema(request)
 const role=options?.role??(request.phase==='review'?'review':'text'),pinned=role==='review'?request.models.review:request.models.text
 if(!pinned)throw Error('请配置并授权独立的审核模型')
 if(!request.operationId||new Set(request.units.map(u=>u.id)).size!==request.units.length)throw Error('来源单元标识无效')
 const model=await deps.resolve(role,pinned.id);signal.throwIfAborted()
 if(!equalSnapshot(model,pinned))throw Error('模型配置或授权已变化，请重新确认导入范围')
 if((model as Resolved).kind!==undefined&&(model as Resolved).kind!=='TEXT')throw Error('导入需要文本模型')
 const budget=importRequestBudget(request,model),payload=serializeImportAiPayload(request),prompt=importAiPrompt(request,payload)
 assertImportPayloadBudget(request,payload,budget.characters,budget.maxUnits);assertImportReconcileContextBudget(request,budget.characters);assertImportFixedPromptReserve(prompt,payload)
 await deps.assert(model);signal.throwIfAborted()
 const raw=await deps.generate(request,model,signal,prompt,options);signal.throwIfAborted()
 const parsed=responseSchema.safeParse(raw);if(!parsed.success)throw Error('模型返回结构或类别无效，请重试')
 const result=parsed.data as ImportSemanticAiResult,ids=new Set(request.units.map(u=>u.id))
 if(request.semanticVersion===1)validateSemanticStage(request,result)
 if(request.phase==='classify'&&request.intent==='structure')importStructureResult(request,result)
 else if(request.phase==='classify'){
  const entries=result.classifications??[]
  if(entries.length!==ids.size||new Set(entries.map(c=>c.unitId)).size!==ids.size||entries.some(c=>!ids.has(c.unitId)))throw Error('分类结果未完整覆盖来源单元')
  if(result.artifacts?.length||result.conflicts?.length||result.patches?.length)throw Error('分类结果包含越权内容')
 }else if(result.classifications?.length)throw Error(`当前阶段不能修改来源分类（返回 ${result.classifications.length} 项）`)
 const entities=[...(request.entities??request.artifacts.map(a=>({id:a.id,kind:a.kind,name:a.name}))),...(result.artifacts??[]).map(a=>({id:a.id,kind:a.kind,name:a.name}))]
 if(new Set((result.artifacts??[]).map(a=>a.id)).size!==(result.artifacts??[]).length)throw Error('模型实体标识重复')
 for(const item of result.artifacts??[]){
  if(request.phase!=='analyze'||item.kind!==request.kind||item.origin!=='inferred'||!item.sourceUnitIds.length||item.sourceUnitIds.some(id=>!ids.has(id)))throw Error('模型结果含无效实体或来源单元')
  if(request.semanticVersion===1&&request.intent!=='reconcile'){
   // Same predicate as the schema check; the declared unit stays a source.
   // Results without a moved entry keep their exact evidence and source lists.
   const anchored=item.evidence.map(entry=>rebindEvidence(entry,request.units)),moved=anchored.filter((entry,i)=>entry.unitId!==item.evidence[i].unitId)
   item.evidence=moved.length?[...new Map(anchored.map(entry=>[entry.unitId+'\0'+entry.quote,entry])).values()]:anchored
   if(moved.length)item.sourceUnitIds=[...new Set([...item.sourceUnitIds,...moved.map(entry=>entry.unitId)])]
  }else item.evidence=anchorEvidence(item.evidence,request.units)
  validateImportEvidence(item,request.units)
  if(request.semanticVersion!==1){validateImportReferences(item,entities,request.chapters)
  for(const [key,kind] of [['characterId','character'],['sceneId','scene'],['itemId','item'],['eventId','worldline'],['parentId','worldline']])if(item.facts[key]&&!(key==='eventId'&&item.kind==='worldline'&&item.facts[key]===item.id)&&!entities.some(a=>a.kind===kind&&a.id===item.facts[key]))throw Error('模型结果含无效实体引用')}
  if(item.kind==='trope'&&!['SATISFACTION','TEAR'].includes(item.facts.tropeKind??''))throw Error('爽点/泪点类别需明确确认')
 }
 if(request.semanticVersion===1)validateSemanticLinks(request,result.artifacts??[])
 const eventParents=new Map([...request.artifacts,...(result.artifacts??[])].filter(a=>a.kind==='worldline').map(a=>[a.id,a.facts.parentId]))
 for(const id of eventParents.keys()){const visited=new Set<string>();let cursor:string|undefined=id;while(cursor){if(visited.has(cursor))throw Error('模型事件父级引用形成循环');visited.add(cursor);cursor=eventParents.get(cursor)}}
 if(request.phase==='analyze'&&!['reconcile','roster','touches'].includes(request.intent??'')&&!(result.artifacts?.length)&&result.notFound!==true)throw Error('未找到内容时必须明确返回 notFound')
 // Roster and touch entries whose quote cannot be located are dropped, never guessed.
 const located=<T extends {evidence:ImportEvidence}>(entries:T[]|undefined)=>entries?.flatMap(entry=>{try{return [{...entry,evidence:anchorEvidence([entry.evidence],request.units)[0]}]}catch{return []}})
 if(result.roster)result.roster=locatedRoster(result.roster,request.units)
 if(result.touches)result.touches=located(result.touches as {evidence:ImportEvidence}[]) as typeof result.touches
 if(request.semanticVersion===1){
  for(const item of result.artifactEdits??[])item.evidence=anchorEvidence(item.evidence,request.units)
  if(result.artifactEdits?.length){
   // Transport fragment hashes/coordinates bind a bounded view of the original.
   // Translate only private validation copies; returned proposals keep the full
   // baseHash and global ranges for the controller's later complete commit gate.
   const edits=result.artifactEdits.map(edit=>{const fragment=request.reconcile?.fragments?.find(f=>f.artifactId===edit.artifactId);if(!fragment)return edit;const a=request.artifacts.find(a=>a.id===edit.artifactId)!;if(edit.baseHash!==fragment.baseHash||Object.keys(edit.setFacts??{}).some(field=>!fragment.fields.includes(field))||(edit.unsetFacts??[]).some(field=>!fragment.fields.includes(field)))throw Error('设定修订分片基础版本或字段范围无效');const textEdits=edit.textEdits?.map(range=>{if(range.start<fragment.start||range.end>fragment.end)throw Error('设定修订超出分片文字范围');return {...range,start:range.start-fragment.start,end:range.end-fragment.start}});return {...edit,baseHash:importArtifactSemanticHash(a),textEdits}})
   const revised=applyImportArtifactFieldEdits(request.artifacts,edits,{units:request.units,locks:semanticLocks(request),targetIds:request.reconcile!.targetIds});validateSemanticLinks(request,revised.filter(a=>result.artifactEdits!.some(edit=>edit.artifactId===a.id)))
  }
  for(const item of result.missingTargets??[]){if(!request.selectedTargets?.includes(item.kind)||item.unitIds.some(id=>!ids.has(id)))throw Error('遗漏目标或来源范围无效');assertImportMissingProjection(item,request.artifacts,request.reviewProjection,semanticLocks(request));item.evidence=anchorEvidence(item.evidence,request.units);validateImportEvidence({facts:{},evidence:item.evidence},request.units);if(item.evidence.some(e=>!item.unitIds.includes(e.unitId))||item.unitIds.some(id=>!item.evidence.some(e=>e.unitId===id)))throw Error('遗漏目标证据未完整覆盖来源范围')}
 }
 for(const item of result.conflicts??[]){item.evidence=anchorEvidence(item.evidence,request.units);validateImportEvidence({evidence:item.evidence,facts:{}},request.units);for(const value of [item.source,item.candidate])if(value.unitId&&!ids.has(value.unitId)||value.artifactId&&!request.artifacts.some(a=>a.id===value.artifactId))throw Error('冲突实体引用无效');item.hash=importHash({...item,id:undefined,hash:undefined});item.id='conflict-'+item.hash.slice(0,24)}
 for(const item of result.patches??[]){
  if(request.phase!=='patch'||item.workingRevision!==request.workingRevision||item.conflictId!==request.conflict?.id||item.end<item.start||!request.units.some(u=>item.start>=u.start&&item.end<=u.end&&u.text.slice(item.start-u.start,item.end-u.start)===item.before))throw Error('正文修改不匹配工作版本或原文')
 }
 if(request.phase==='patch'&&!result.patches?.length)throw Error('未生成可核对的正文修改')
 await deps.assert(model);const current=await deps.resolve(role,pinned.id);signal.throwIfAborted();if(!equalSnapshot(current,pinned))throw Error('模型配置或授权已变化，未采用返回结果')
 return result
}

/** AbortSignals stay in this worker. RPC callers only send operationId. */
export class ImportAiJobs {
 private jobs=new Map<string,{controller:AbortController;done:Promise<ImportAiResult>}>()
 get active(){return this.jobs.size}
 run(request:ImportAiRequest,runner=runImportAi):Promise<ImportAiResult>{
  if(this.jobs.has(request.operationId))return Promise.reject(Error('导入操作正在执行'))
  const controller=new AbortController()
  const done=Promise.resolve().then(()=>runner(request,controller.signal)).finally(()=>{this.jobs.delete(request.operationId)})
  this.jobs.set(request.operationId,{controller,done});return done
 }
 cancel(id:string){this.jobs.get(id)?.controller.abort(new Error('导入操作已取消'))}
 async stop(){const current=[...this.jobs.values()];for(const job of current)job.controller.abort(new Error('导入操作已取消'));await Promise.allSettled(current.map(j=>j.done))}
}
