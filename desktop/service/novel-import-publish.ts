import {assertImportChapterVersion,importVolumeGroups} from '../core/novel-import-chapters'
import {verifiedImportStructureVolumeCuts} from '../core/novel-import-structure'
import {sourceTextSummary} from '../core/novel-import-pdf-source-text'
import {pdfReviewAudit,validatePdfStoredFields} from '../core/novel-import-pdf'
import type {ImportPdfPageReviewAudit} from '../shared/novel-import'
import {prisma} from '../../src/lib/db'
import {ContentError} from '../../src/lib/content-errors'
import {lockContentOperation} from '../../src/lib/services/content-commit'
import {emptyPlanning,validatePlanning,eventSchema,worldlineSchema,lineSchema,volumeSchema,chapterSchema,cardSchema} from '../../src/lib/planning/domain'
import {importChapters,importHash,importPlanHash,importBudgetAudit,sourceBody,sourceImportArtifacts,safeImportBoundary,validateImportCoverage,validateImportEvidence} from '../core/novel-import'
import {validateImportBudgetState} from '../core/novel-import-budget-policy'
import {validateDetailedOutlines} from '../core/novel-import-outline'
import {validateImportSemanticState,importNativeMappings,importSemanticAudit,importSemanticResultHash,importSemanticInputHash,importSemanticDecisionHash,assertImportSemanticLocks} from '../core/novel-import-semantic-state'
import {qualifyImportKnowledgeText,qualifyImportWorldContent,validateImportSemanticArtifact} from '../core/novel-import-semantics'
import type {ImportMappingWarning} from '../core/novel-import-semantics'
import {within} from '../core/root-ownership'
import {createHash,randomUUID} from 'node:crypto'
import {currentWorkAssets} from './image-assets'
import {getDatabaseContext} from './context'
import {validateImportWizardState} from '../core/novel-import-wizard-state'
import {assertWizardSessionChapters} from '../core/novel-import-wizard'
import {normalizeMotivations} from '../../src/lib/motivation'
import {normalizeBeliefs} from '../../src/lib/beliefs'
import {normalizeBigFive} from '../../src/lib/big-five'
import {normalizeArcStages} from '../../src/lib/arc-stage'
import {anchorContext} from '../../src/lib/comment-anchor'
import type {ImportNativeProfile} from '../core/novel-import-semantics'
import type {PlannedTouch} from '../core/novel-import-foreshadow'
import {LOCAL_AUTHOR_ID} from './context'
import type {Workspaces,WorkImportInitializer} from './workspaces'
import type {ImportPublishInput,ImportArtifact,ImportReceipt,ImportSession} from '../shared/novel-import'
import type {WizardCandidate} from '../shared/novel-import-wizard'
import type {Prisma} from '../../src/generated/prisma/client'

const json=(value:unknown):Prisma.InputJsonValue=>JSON.parse(JSON.stringify(value))
const operation=(requestId:string)=>`novel-import:${requestId}`
/** Exposed for tests: the record body a publication would store. */
export const buildPublicationRecordForTest=(session:ImportSession)=>publicationRecord({session,selection:{path:'',device:'',inode:''},importHash:''} as ImportPublishInput)
/** Wizard records keep whole originals only for kinds copied whole; list kinds (characters, scenes,
 * items, worlds) keep just the entries the author chose, which are already among the artifacts. */
function publicationRecord(input:ImportPublishInput){const s=input.session,raw=sourceImportArtifacts(s).filter(a=>s.wizardVersion!==1||!['character','scene','item','world'].includes(a.kind)).map(a=>({...a,id:'original-'+a.id})),materials=s.semanticVersion===1?[...raw,...s.artifacts.filter(a=>!raw.some(original=>importHash({...original,id:original.id.slice('original-'.length)})===importHash(a)))]:[...raw,...s.artifacts.filter(a=>!raw.some(original=>original.kind===a.kind&&original.text===a.text))],mapping=s.semanticVersion===1?importNativeMappings(s.artifacts):undefined;return {...(s.wizardVersion===1&&s.wizard?{wizard:{structure:s.wizard.structure?.map(({title,volume})=>({title,...(volume!==undefined?{volume}:{})})),chapterSelection:s.wizard.chapterSelection,candidates:(Object.values(s.wizard.candidates).flat() as {id:string;kind:string;name:string;selected:boolean}[]).map(({id,kind,name,selected})=>({id,kind,name,selected})),skipped:s.wizard.skipped,dropped:s.wizard.dropped,images:s.wizard.tasks.filter(t=>t.kind==='image'&&t.state==='done').map(t=>({taskId:t.id,kind:t.imageKind,sha256:t.resultSha256}))}}:{}),...(s.chapterVersion===2?{chapterVersion:2}:{}),...(s.semanticVersion===1?{semanticVersion:1,semanticAudit:importSemanticAudit(s),sourceCopyIds:mapping!.sourceCopyIds,mappingWarnings:mapping!.mappingWarnings}:{}),...(s.budgetPolicy?{importBudget:importBudgetAudit(s)}:{}),...(pdfReviewAudit(s)?{pdfPageReview:pdfReviewAudit(s)}:{}),version:1,id:s.id,title:s.title,createdAt:s.createdAt,sourceKinds:s.selected,targets:s.infer&&s.selected.includes('body')&&s.workingProse?s.targets:[],modified:s.workingRevision>0,summary:{source:s.artifacts.filter(a=>a.origin==='source').length,inferred:s.artifacts.filter(a=>a.origin==='inferred').length,decisions:s.decisions.length},materials:materials.map(a=>({...a,characters:a.text.length})),decisions:s.decisions,originalProse:s.originalProse,workingProse:s.workingProse,sources:s.files.filter(f=>f.included).map(f=>({name:f.name,format:f.format,hash:f.hash})),coverage:s.coverage,notFound:s.notFound,importHash:input.importHash}}
function chunks(text:string,maxCharacters=100000){if(maxCharacters<2)throw Error('原生知识限定超过单条内容容量');const parts:string[]=[];let start=0;while(start<text.length){let end=Math.min(text.length,start+maxCharacters);if(!safeImportBoundary(text,end))end--;parts.push(text.slice(start,end));start=end}return parts.length?parts:['']}
const continuation=(name:string,index:number)=>index?name.slice(0,280)+' · 续页'+(index+1):name
function assertPlan(input:ImportPublishInput){
 const s=input.session
 assertImportChapterVersion(s.chapterVersion)
 if(s.wizardVersion===1){
  validateImportWizardState(s);importVolumeGroups(s.chapters)
  const w=s.wizard!
  // Source-only sessions carry no chapters; otherwise chapters must be the selected originals.
  if(!s.selected.includes('body')){if(s.chapters.length||s.originalProse||s.workingProse)throw Error('未选择正文却有章节内容')}
  else assertWizardSessionChapters(s,sourceBody(s),w.structure!,w.chapterSelection!)
  if(w.materializedVolumes?.some((v,i)=>v.volume!==s.chapters[i]?.volume))throw Error('卷归属与原书结构不匹配')
 }else if(s.chapterVersion===2){
  importVolumeGroups(s.chapters)
  const cuts=s.chapters.map(({start,title,volume})=>({start,title,...(volume!==undefined?{volume}:{})})),checked=importChapters(s.workingProse,cuts,s.semanticVersion,2,verifiedImportStructureVolumeCuts(s,cuts,s.workingProse))
  if(checked.some((chapter,i)=>chapter.volume!==s.chapters[i]?.volume))throw Error('卷归属与原文卷边界不匹配')
 }
 validateImportBudgetState(s)
 validateImportSemanticState(s)
 validatePdfStoredFields(s.files,s.pdfPageDecisionEvents)
 if(!s.publication||s.publication.requestId!==s.id||!s.title.trim())throw Error('导入请求不完整')
 if(input.importHash!==importPlanHash(s))throw Error('导入内容指纹已变化')
 validateImportCoverage(s)
 validateDetailedOutlines(s)
 if(s.conflicts.some(c=>c.status!=='resolved')||s.patches.length)throw Error('请先处理冲突和正文修改提案')
 if(s.wizardVersion!==1&&s.originalProse!==sourceBody(s))throw Error('原始正文与来源不匹配')
 if(!s.workingRevision&&s.workingProse!==s.originalProse)throw Error('正文修改尚未确认')
 if(s.chapters.map(c=>c.content).join('')!==s.workingProse)throw Error('章节正文覆盖不完整')
 for(const c of s.chapters)if(c.content!==s.workingProse.slice(c.start,c.end))throw Error('章节正文范围不匹配')
 for(const file of s.files.filter(f=>f.included))if(within(file.path,input.selection.path)||within(input.selection.path,file.sourceRoot??file.path))throw Error('导入目录不能覆盖来源目录')
 if(s.semanticVersion===1){importNativeMappings(s.artifacts);assertImportSemanticLocks(s.artifacts,s.semanticState?.locks??[]);if(s.semanticState&&(s.semanticState.inputHash!==importSemanticInputHash(s)||s.semanticState.decisionHash!==importSemanticDecisionHash(s)||s.semanticState.workingRevision!==s.workingRevision||s.semanticState.stage!=='ready'||s.semanticState.verifiedHash!==importSemanticResultHash(s)||s.semanticState.repairs.some(r=>!r.committed||r.tasks.some(t=>!t.done))||s.semanticState.omissions.some(o=>!o.done||o.unitIds.some(id=>!o.completedUnitIds?.includes(id)))||s.semanticState.persistentConflicts.length))throw Error('导入语义修订或完整复核尚未完成');if(s.infer&&s.selected.includes('body')&&s.targets.length&&!s.semanticState)throw Error('缺少完整语义复核检查点')}
 for(const a of s.artifacts){if(a.origin==='inferred')validateImportEvidence(a,[...s.units,...(s.workingUnits??[])]);if(s.semanticVersion!==1&&a.kind==='trope'&&!['SATISFACTION','TEAR'].includes(a.facts.tropeKind))throw Error('请明确爽点或泪点类别')}
}
export async function importLeaseTarget(works:Workspaces,input:ImportPublishInput,assertCurrent:()=>void){assertPlan(input);return works.importLeaseTarget(input.selection,{requestId:input.session.id,title:input.session.title,importHash:input.importHash},assertCurrent)}

/** The initializer runs before ready/catalog publication. The receipt and every
 * entity commit together, so an unknown acknowledgement can safely be retried. */
export async function publishNovelImport(works:Workspaces,input:ImportPublishInput,assertCurrent:()=>void=()=>{},hooks?:Pick<WorkImportInitializer,'phase'>):Promise<ImportReceipt>{
 assertCurrent();assertPlan(input)
 const s=input.session,op=operation(s.id),record=publicationRecord(input),verify=async(novelId:string)=>{
  assertCurrent();const receipt=await prisma.contentMutation.findUnique({where:{userId_operationId:{userId:LOCAL_AUTHOR_ID,operationId:op}}})
  const versions=await prisma.contentVersion.findMany({where:{targetType:'NOVEL_IMPORT',targetId:novelId,version:1}})
  if(!receipt||receipt.novelId!==novelId||receipt.targetId!==novelId||receipt.targetType!=='NOVEL_IMPORT'||receipt.requestHash!==input.importHash||receipt.afterHash!==input.importHash||versions.length!==1||importHash(versions[0].snapshot)!==importHash(record))throw new ContentError('REQUEST_CONFLICT','导入回执或原始材料记录与原请求不匹配')
 }
 for(const image of input.images??[])if(createHash('sha256').update(image.bytes).digest('hex')!==image.sha256||!s.wizard?.tasks.some(t=>t.id===image.taskId&&t.kind==='image'&&t.state==='done'&&t.resultSha256===image.sha256))throw Error('导入图片与导入计划不匹配')
 let storedImages=new Map<string,{id:string;filename:string;url:string}>()
 const work=await works.create(input.selection,{title:s.title,requestId:s.id},assertCurrent,{importHash:input.importHash,phase:hooks?.phase,verify,initialize:async novelId=>{
  // Images are written before the transaction and removed again if it fails; a retry after commit writes none.
  const committed=await prisma.contentMutation.findUnique({where:{userId_operationId:{userId:LOCAL_AUTHOR_ID,operationId:op}}})
  const assets=committed?undefined:currentWorkAssets(),created:string[]=[]
  if(assets)for(const image of input.images??[]){const saved=await assets.save(Buffer.from(image.bytes),image.mime);created.push(saved.filename);storedImages.set(image.taskId,{id:saved.id,filename:saved.filename,url:`/_desktop/assets/${getDatabaseContext().workspaceId}/${saved.filename}`})}
  try{
  await prisma.$transaction(async tx=>{
   assertCurrent();await lockContentOperation(tx,LOCAL_AUTHOR_ID,op);assertCurrent()
   const previous=await tx.contentMutation.findUnique({where:{userId_operationId:{userId:LOCAL_AUTHOR_ID,operationId:op}}})
   if(previous){if(previous.requestHash!==input.importHash||previous.novelId!==novelId)throw new ContentError('REQUEST_CONFLICT','导入请求指纹冲突');return}
   const data=emptyPlanning(),mapping=s.semanticVersion===1?importNativeMappings(s.artifacts):undefined,byKind=(kind:ImportArtifact['kind'])=>s.artifacts.filter(a=>a.kind===kind&&(!mapping||mapping.projectable.has(a.id)))
   const nativeText=(a:ImportArtifact,text=a.text)=>mapping&&a.origin!=='source'?qualifyImportKnowledgeText(text,mapping.decoded.get(a.id)!.knowledge):text
   const joined=(kind:ImportArtifact['kind'])=>byKind(kind).map(a=>nativeText(a)).join('\n\n')
   const characterIds=new Map<string,string>(),characterNames=new Map<string,string>(),sceneIds=new Map<string,string>(),itemIds=new Map<string,string>()
   const characterReference=(value:string)=>characterIds.get(value)??characterNames.get(value)
   const profiles=new Map(s.artifacts.filter(a=>a.schema===2).flatMap(a=>{const p=validateImportSemanticArtifact(a,a.origin==='source'?'source-copy':'strict').profile;return p?[[a.id,p] as const]:[]}))
   const characterProfile=(id:string)=>{const p=profiles.get(id);if(p?.kind!=='character')return {};const {arcStages:_arc,...v}=p.value;return {...v,personalityTags:json(v.personalityTags),motivations:json(normalizeMotivations(v.motivations)),beliefs:json(normalizeBeliefs(v.beliefs)),...(v.bigFive?{bigFive:json(normalizeBigFive(v.bigFive))}:{})}}
   for(const a of byKind('character')){const f=a.facts,native=mapping?.decoded.get(a.id)?.native;if(native?.kind==='character'){const {kind:_kind,...fields}=native,c=await tx.character.create({data:{novelId,name:a.name,...fields,...characterProfile(a.id),bio:a.origin==='source'?a.text:qualifyImportKnowledgeText(a.text,mapping!.decoded.get(a.id)!.knowledge),extra:json(fields.extra),relationships:json([])}});characterIds.set(a.id,c.id)}else{const roleType=['PROTAGONIST','SUPPORTING','ANTAGONIST'].includes(f.roleType)?f.roleType as 'PROTAGONIST'|'SUPPORTING'|'ANTAGONIST':'SUPPORTING';const c=await tx.character.create({data:{novelId,name:a.name,roleType,age:f.age??'',gender:f.gender??'',occupation:f.occupation??'',bio:a.text,personality:f.personality??'',appearance:f.appearance??'',clothing:f.clothing??'',catchphrase:f.catchphrase??'',growthArc:f.growthArc??'',relationships:[],extra:{importArtifactId:a.id}}});characterIds.set(a.id,c.id);characterNames.set(a.name,c.id)}}
   if(mapping){for(const a of byKind('character'))if(byKind('character').filter(c=>c.name===a.name).length===1)characterNames.set(a.name,characterIds.get(a.id)!);for(const a of byKind('character')){const native=mapping.decoded.get(a.id)!.native;if(native?.kind==='character')await tx.character.update({where:{id:characterIds.get(a.id)!},data:{relationships:json(native.relationships.map(r=>({...r,...(r.characterId?{characterId:characterIds.get(r.characterId)!}:{})})))}})}}
   await hooks?.phase?.('domain-writing');assertCurrent()
   if(mapping){const ids=new Map<string,string>(),pending=byKind('scene');while(pending.length){let wrote=false;for(const a of [...pending]){const n=mapping.decoded.get(a.id)!.native;if(n?.kind!=='scene')throw Error('地点原生映射无效');if(n.parentId&&!ids.has(n.parentId))continue;const scene=profiles.get(a.id),row=await tx.scene.create({data:{novelId,name:a.name,description:a.origin==='source'?n.description:qualifyImportKnowledgeText(n.description,mapping!.decoded.get(a.id)!.knowledge),coordinates:n.coordinates,parentId:n.parentId?ids.get(n.parentId)!:null,...(scene?.kind==='scene'?scene.value:{})}});sceneIds.set(a.id,row.id);ids.set(a.id,row.id);pending.splice(pending.indexOf(a),1);wrote=true}if(!wrote)throw Error('地点父级引用不能解析')}}else for(const a of byKind('scene'))await tx.scene.create({data:{novelId,name:a.name,description:a.text}})
   for(const a of byKind('item')){const item=profiles.get(a.id),row=await tx.item.create({data:{novelId,name:a.name,description:nativeText(a),...(item?.kind==='item'?{appearance:item.value.appearance,acquisition:item.value.acquisition,effects:json(item.value.effects),aliases:json(item.value.aliases),tags:json(item.value.tags)}:{})}});itemIds.set(a.id,row.id)}
   if(mapping){const worlds=new Map<string,string>(),settings=new Map<string,string>(),worldPending=byKind('world').filter(a=>{const n=mapping.decoded.get(a.id)!.native;return n?.kind==='world'&&n.entityType==='WORLD'}),settingPending=byKind('world').filter(a=>{const n=mapping.decoded.get(a.id)!.native;return n?.kind==='world'&&n.entityType==='SETTING'});while(worldPending.length){let wrote=false;for(const a of [...worldPending]){const n=mapping.decoded.get(a.id)!.native;if(n?.kind!=='world'||n.entityType!=='WORLD')throw Error('世界映射无效');if(n.parentId&&!worlds.has(n.parentId))continue;const row=await tx.world.create({data:{novelId,name:a.name,description:a.origin==='source'?n.description:qualifyImportKnowledgeText(n.description,mapping!.decoded.get(a.id)!.knowledge),parentId:n.parentId?worlds.get(n.parentId)!:null}});worlds.set(a.id,row.id);worldPending.splice(worldPending.indexOf(a),1);wrote=true}if(!wrote)throw Error('世界父级引用不能解析')}while(settingPending.length){let wrote=false;for(const a of [...settingPending]){const n=mapping.decoded.get(a.id)!.native;if(n?.kind!=='world'||n.entityType!=='SETTING'||!worlds.has(n.worldId))throw Error('世界设定归属无效');if(n.parentId&&!settings.has(n.parentId))continue;const row=await tx.setting.create({data:{novelId,name:a.name,worldId:worlds.get(n.worldId)!,type:n.settingType,parentId:n.parentId?settings.get(n.parentId)!:null,content:json(a.origin!=='source'||a.facts.content!==undefined?qualifyImportWorldContent(n.content,mapping.decoded.get(a.id)!.knowledge):n.content)}});settings.set(a.id,row.id);settingPending.splice(settingPending.indexOf(a),1);wrote=true}if(!wrote)throw Error('MAP父级引用不能解析')}}else for(const a of byKind('world'))await tx.world.create({data:{novelId,name:a.name,description:a.text}})
   const foreshadowIds=new Map<string,string>()
   for(const a of byKind('foreshadow')){const row=await tx.foreshadow.create({data:{novelId,title:a.name,content:nativeText(a),...(a.schema===2&&['PLANNED','PLANTED','RESOLVED'].includes(a.facts.status)?{status:a.facts.status as 'PLANNED'|'PLANTED'|'RESOLVED'}:{})}});foreshadowIds.set(a.id,row.id)}
   for(const a of byKind('trope'))await tx.trope.create({data:{novelId,kind:a.facts.tropeKind as 'SATISFACTION'|'TEAR',category:a.name,content:nativeText(a),referenceCase:'',selected:true}})
   if(byKind('theme').length)await tx.theme.update({where:{novelId},data:{synopsis:joined('theme')}})
   if(byKind('style').length)await tx.setting.create({data:{novelId,type:'STYLE',name:'文风设定',content:{style:joined('style'),referenceCases:'',dialogueMark:'DOUBLE_QUOTE',innerDialogueMark:'NONE'}}})
   for(const a of byKind('goldenFinger'))await tx.setting.create({data:{novelId,type:'GOLD_FINGER',name:a.name,content:{trigger:a.facts.trigger?.trim()?nativeText(a,a.facts.trigger):a.facts.trigger??'',ability:nativeText(a),limitation:a.facts.limitation?.trim()?nativeText(a,a.facts.limitation):a.facts.limitation??''}}})
   const outline=byKind('outline').filter(a=>a.facts.chapterIndex===undefined).map(a=>nativeText(a)).join('\n\n'),needsLine=!!s.chapters.length||!!outline||!!byKind('narrative').length
   if(needsLine)data.lines.push(lineSchema.parse({id:'import-reading-line',name:'导入作品',primary:true}))
   const groups=s.chapterVersion===2?importVolumeGroups(s.chapters):s.chapters.length?[{start:0,end:s.chapters.length}]:[]
   if(!groups.length&&outline)groups.push({start:0,end:0})
   for(const [groupIndex,group] of groups.entries()){
    // An unassigned chapter group remains explicit; source names are never
    // inferred. The complete source outline stays on the first volume.
    const summary=groupIndex===0?outline:'',volume=await tx.volume.create({data:{novelId,index:groupIndex+1,title:('name'in group?group.name:undefined)??'导入内容',summary}})
    data.volumes.push(volumeSchema.parse({id:volume.id,line:'import-reading-line',title:volume.title,summary:summary.length<=100000?summary:'原始大纲全文见导入记录',order:groupIndex}))
    for(let i=group.start;i<group.end;i++){const c=s.chapters[i];const row=await tx.chapter.create({data:{volumeId:volume.id,index:i-group.start+1,title:c.title,content:c.content,outline:c.outline??'',wordCount:Array.from(c.content).length,status:'WRITTEN'}});data.chapters.push(chapterSchema.parse({id:row.id,line:'import-reading-line',volume:volume.id,title:row.title,order:i,wordBudget:Math.min(200000,Math.max(1,row.wordCount))}));if(c.outline)data.cards.push(cardSchema.parse({id:'import-chapter-card-'+row.id,line:'import-reading-line',chapter:row.id,title:c.title,order:i,tellings:[{id:'import-telling-'+row.id,intent:c.outline,source:'导入大纲'}]}))}
   }
   const eventMap=new Map(byKind('worldline').map(a=>[a.id,{id:'import-event-'+a.id,line:'import-world-'+(a.facts.lineId||a.id)}]))
   const list=(value:string|undefined):unknown[]=>{if(!value)return [];const parsed:unknown=JSON.parse(value);if(!Array.isArray(parsed))throw Error('导入实体引用格式无效');return parsed}
   for(const a of byKind('worldline')){
    const f=a.facts,event=eventMap.get(a.id)!,known=f.timeKind==='exact'||f.timeKind==='window'
    if(a.origin==='inferred'&&(!f.lineId||!f.lineName||!['unknown','exact','window'].includes(f.timeKind)))throw Error('推断世界线缺少结构事实')
    if(!data.worlds.some(w=>w.id===event.line))data.worlds.push(worldlineSchema.parse({id:event.line,name:f.lineName||a.name}))
    const people=list(f.people).map(name=>{const id=typeof name==='string'?characterReference(name):undefined;if(!id)throw Error('世界线角色引用无效');return id})
    const parent=f.parentId?eventMap.get(f.parentId):undefined;if(f.parentId&&!parent)throw Error('世界线父事件引用无效')
    for(const [part,text] of chunks(a.text,mapping?100000-qualifyImportKnowledgeText('',mapping.decoded.get(a.id)!.knowledge).length:100000).entries()){const fact=mapping?qualifyImportKnowledgeText(text,validateImportSemanticArtifact(a,a.origin==='source'?'source-copy':'strict').knowledge):text;data.events.push(eventSchema.parse({id:part?event.id+'-part-'+part:event.id,line:event.line,parent:part?event.id:parent?.id,title:continuation(a.name,part),fact,people,time:{kind:!part&&known?f.timeKind:'unknown',value:!part&&known?Number(f.timeValue):0,end:!part&&f.timeKind==='window'?Number(f.timeEnd):null,label:f.time??''}}))}
   }
   const actualChapters=data.chapters
   for(const [i,a] of byKind('narrative').entries()){
    const f=a.facts,index=f.chapterIndex===undefined?undefined:Number(f.chapterIndex),order=f.order===undefined?i:Number(f.order)
    if(!Number.isSafeInteger(order)||order<0||index!==undefined&&(!Number.isSafeInteger(index)||index<0||index>=actualChapters.length))throw Error('叙事线章节或顺序无效')
    if(a.origin==='inferred'&&(index===undefined||f.refs===undefined||f.order===undefined))throw Error('推断叙事线缺少章节和事件引用')
    const narrator=f.narrator?characterReference(f.narrator):undefined;if(f.narrator&&!narrator)throw Error('叙事线视角角色引用无效')
    const refs=list(f.refs).map(value=>{if(!value||typeof value!=='object'||!('eventId' in value)||typeof value.eventId!=='string')throw Error('叙事线事件引用格式无效');const event=eventMap.get(value.eventId);if(!event)throw Error('叙事线事件引用不存在');const ref=value as Record<string,string>;return {line:event.line,event:event.id,reveal:'',...(mapping?{source:'导入语义关系：'+(ref.kind??'happen')+'；'+qualifyImportKnowledgeText('',ref as any),reliability:ref.reliability,character:ref.character?characterIds.get(ref.character)!:null}:{source:a.origin==='source'?'导入原设定':'根据正文分析'})}})
    for(const [part,text] of chunks(a.text,mapping?100000-qualifyImportKnowledgeText('',mapping.decoded.get(a.id)!.knowledge).length:100000).entries()){const intent=mapping?qualifyImportKnowledgeText(text,validateImportSemanticArtifact(a,a.origin==='source'?'source-copy':'strict').knowledge):text;data.cards.push(cardSchema.parse({id:'import-narrative-'+a.id+'-'+part,line:'import-reading-line',chapter:index===undefined?null:actualChapters[index].id,title:continuation(a.name,part),order:(index??actualChapters.length)*1000000+order*1000+part,tellings:[{id:'import-narrative-telling-'+a.id+'-'+part,character:narrator,narrator:f.narrator||'待定',intent,refs:refs.map(ref=>({...ref,reveal:intent})),source:a.origin==='source'?'导入原设定':'根据正文分析',...(mapping?{reliability:f.reliability}:{})}]}))}
   }
   if(s.wizardVersion===1)await publishWizardLinks(tx,{novelId,session:s,data,chapterRows:data.chapters.map(c=>{const v=data.volumes.find(v=>v.id===c.volume),k=data.chapters.filter(x=>x.volume===c.volume).indexOf(c);return {id:c.id,volume:c.volume??'',title:c.title,label:`第${(v?.order??0)+1}卷 ${v?.title??''} · 第${k+1}章 ${c.title}`.slice(0,100)}}),characterIds,sceneIds,itemIds,foreshadowIds,profiles,images:input.images??[],stored:storedImages})
   await tx.planningDocument.update({where:{novelId},data:{data:json(validatePlanning(data))}})
   if(s.chapters.length)await tx.novel.update({where:{id:novelId},data:{currentStage:'WRITING'}})
   await tx.contentVersion.create({data:{targetType:'NOVEL_IMPORT',targetId:novelId,version:1,snapshot:json(record),reason:'导入作品'}})
   await tx.contentMutation.create({data:{userId:LOCAL_AUTHOR_ID,novelId,targetType:'NOVEL_IMPORT',targetId:novelId,operationId:op,requestHash:input.importHash,beforeHash:importHash(null),afterHash:input.importHash,beforeVersion:0,afterVersion:1,result:{novelId,requestId:s.id,importHash:input.importHash}}})
   assertCurrent()
  },{timeout:120000})
  }catch(error){for(const filename of created)await assets?.removeCreated(filename).catch(()=>undefined);storedImages=new Map();throw error}
 }})
 assertCurrent();return {workId:work.id,novelId:work.novelId,requestId:s.id,importHash:input.importHash}
}

export async function readNovelImportRecord(novelId:string,options:{material?:string;offset?:number;limit?:number}={}){
 const novel=await prisma.novel.findFirst({where:{id:novelId,userId:LOCAL_AUTHOR_ID,status:{not:'DELETED'}},select:{id:true}})
 if(!novel)throw new ContentError('NOT_FOUND','作品不存在',404)
 const row=await prisma.contentVersion.findFirst({where:{targetType:'NOVEL_IMPORT',targetId:novelId},orderBy:{version:'desc'}})
 if(!row)return {record:null}
 const snapshot=row.snapshot as unknown as {id:string;title:string;createdAt:string;sourceKinds:string[];targets:string[];modified:boolean;summary:Record<string,number>;materials:ImportArtifact[];decisions:unknown[];originalProse:string;pdfPageReview?:ImportPdfPageReviewAudit;semanticVersion?:1;semanticAudit?:unknown;sourceCopyIds?:string[];mappingWarnings?:ImportMappingWarning[];wizard?:unknown}
 const record={...(snapshot.wizard?{wizard:snapshot.wizard}:{}),...(snapshot.semanticVersion===1?{semanticVersion:1,semanticAudit:snapshot.semanticAudit,sourceCopyIds:snapshot.sourceCopyIds,mappingWarnings:snapshot.mappingWarnings}:{}),...(snapshot.pdfPageReview?{pdfPageReview:{schemaVersion:1 as const,files:snapshot.pdfPageReview.files.map(({proof:_proof,sourceTextDecoding,...file})=>({...file,...(sourceTextDecoding?{sourceTextDecoding:sourceTextSummary(sourceTextDecoding)}:{})})),...(snapshot.pdfPageReview.events?{events:snapshot.pdfPageReview.events}:{})}}:{}),id:snapshot.id,title:snapshot.title,createdAt:snapshot.createdAt,sourceKinds:snapshot.sourceKinds,targets:snapshot.targets,modified:snapshot.modified,summary:snapshot.summary,materials:snapshot.materials.map(a=>{const warnings=snapshot.mappingWarnings?.filter(w=>w.artifactId===a.id||'original-'+w.artifactId===a.id)??[],label=warnings.length?(warnings.some(w=>w.fields.includes('roleType'))?'（导入时角色类型未确认）':'（导入时结构映射未确认）'):'';return {id:a.id,kind:a.kind,name:a.name+label,origin:a.origin,characters:a.text.length}}),decisions:snapshot.decisions}
 if(!options.material)return {record}
 const text=options.material==='body-original'?snapshot.originalProse:snapshot.materials.find(a=>a.id===options.material)?.text
 if(text===undefined)throw new ContentError('NOT_FOUND','导入资料不存在',404)
 let offset=options.offset??0;const limit=options.limit??32768
 if(!Number.isInteger(offset)||offset<0||offset>text.length||!Number.isInteger(limit)||limit<2||limit>32768)throw new ContentError('INVALID_REQUEST','资料分页参数无效',400)
 if(!safeImportBoundary(text,offset))offset--
 let end=Math.min(text.length,offset+limit);if(!safeImportBoundary(text,end))end--
 return {record,page:{text:text.slice(offset,end),offset,total:text.length}}
}

type Tx=Prisma.TransactionClient
/** Wizard-only links written inside the publish transaction once chapters exist. */
async function publishWizardLinks(tx:Tx,o:{novelId:string;session:ImportSession;data:ReturnType<typeof emptyPlanning>;chapterRows:{id:string;volume:string;title:string;label:string}[];characterIds:Map<string,string>;sceneIds:Map<string,string>;itemIds:Map<string,string>;foreshadowIds:Map<string,string>;profiles:Map<string,ImportNativeProfile>;images:NonNullable<ImportPublishInput['images']>;stored:Map<string,{id:string;filename:string;url:string}>}){
 const s=o.session,w=s.wizard!,chapters=o.chapterRows
 // Arc stages reference chapters, which exist only now.
 for(const [artifactId,characterId] of o.characterIds){const p=o.profiles.get(artifactId);if(p?.kind!=='character'||!p.value.arcStages.length)continue
  const stages=normalizeArcStages(p.value.arcStages.map(stage=>{const chapter=stage.chapterIndex===null?undefined:chapters[stage.chapterIndex];return {id:stage.id,name:stage.name,description:stage.description,tags:stage.tags,markers:stage.markers,changes:stage.changes,isDebut:stage.isDebut,startChapter:chapter?{chapterId:chapter.id,volumeId:chapter.volume,label:chapter.label}:null}}))
  await tx.character.update({where:{id:characterId},data:{arcStages:json(stages)}})}
 // Foreshadow touches and references; planning links follow the plan made at step 20.
 const touchRows:Prisma.ForeshadowTouchCreateManyInput[]=[],referenceRows:Prisma.ForeshadowReferenceCreateManyInput[]=[]
 for(const a of s.artifacts.filter(a=>a.kind==='foreshadow'&&a.schema===2)){const id=o.foreshadowIds.get(a.id);if(!id)continue
  for(const t of JSON.parse(a.facts.touches??'[]') as PlannedTouch[]){const chapter=chapters[t.chapterIndex],content=s.chapters[t.chapterIndex];if(!chapter||!content)continue
   const touch={id:randomUUID()};touchRows.push({id:touch.id,foreshadowId:id,novelId:o.novelId,kind:t.kind,summary:t.summary,chapterId:chapter.id})
   const contentAnchor={quote:t.content.quote,...anchorContext(content.content,t.content.start,t.content.end),startOffset:t.content.start,endOffset:t.content.end}
   const identity=(type:string,anchor:{quote:string|null;prefix?:string|null;suffix?:string|null;startOffset?:number|null})=>`${type}:${chapter.id}:${anchor.quote===null?'whole':createHash('sha256').update(JSON.stringify([anchor.quote,anchor.prefix,anchor.suffix,anchor.startOffset])).digest('hex')}`
   referenceRows.push({novelId:o.novelId,touchId:touch.id,targetType:'CHAPTER_CONTENT',targetId:chapter.id,identityKey:identity('CHAPTER_CONTENT',contentAnchor),...contentAnchor})
   const outline=content.outline??'',at=t.outline.quote?outline.indexOf(t.outline.quote):-1
   const outlineAnchor=at>=0?{quote:t.outline.quote,...anchorContext(outline,at,at+t.outline.quote!.length),startOffset:at,endOffset:at+t.outline.quote!.length}:{quote:null,prefix:null,suffix:null,startOffset:null,endOffset:null}
   referenceRows.push({novelId:o.novelId,touchId:touch.id,targetType:'CHAPTER_OUTLINE',targetId:chapter.id,identityKey:identity('CHAPTER_OUTLINE',outlineAnchor),...outlineAnchor})
  }}
 // Touches and references are written in two batches (05 §12 R15); references follow their touches.
 if(touchRows.length)await tx.foreshadowTouch.createMany({data:touchRows})
 if(referenceRows.length)await tx.foreshadowReference.createMany({data:referenceRows})
 for(const ref of w.foreshadowRefs??[]){const id=o.foreshadowIds.get(ref.foreshadowId);if(!id)continue;const material={kind:'foreshadow' as const,id,role:ref.role,note:ref.note}
  if(ref.target==='event'){const event=o.data.events.find(e=>e.id==='import-event-'+ref.targetId);if(event&&event.materialRefs.length<40)event.materialRefs.push(material)}
  else{const card=o.data.cards.find(c=>c.id==='import-narrative-'+ref.targetId+'-0');const telling=card?.tellings[0];if(telling&&telling.materialRefs.length<40)telling.materialRefs.push(material)}}
 // Images become the entity's current picture, in the same formats the panels use.
 for(const t of w.tasks.filter(t=>t.kind==='image'&&t.state==='done')){const stored=o.stored.get(t.id),image=o.images.find(i=>i.taskId===t.id),c=(Object.values(w.candidates).flat() as WizardCandidate[]).find(x=>x.id===t.candidateId);if(!stored||!image||!c)continue;const prompt=t.image?.prompt??''
  if(t.imageKind==='avatar'||t.imageKind==='portrait'){const characterId=o.characterIds.get(c.id);if(!characterId)continue;await tx.characterImage.create({data:{characterId,kind:t.imageKind==='avatar'?'AVATAR':'PORTRAIT',source:'AI',url:stored.url,prompt}});await tx.character.update({where:{id:characterId},data:t.imageKind==='avatar'?{avatarUrl:stored.url}:{portraitUrl:stored.url}})}
  else if(t.imageKind==='icon'){const itemId=o.itemIds.get(c.id);if(!itemId)continue;await tx.itemImage.create({data:{itemId,source:'AI',url:stored.url,prompt}});await tx.item.update({where:{id:itemId},data:{iconUrl:stored.url}})}
  else{const sceneId=o.sceneIds.get(c.id);if(!sceneId)continue;const url=`/api/novels/${o.novelId}/scenes/${sceneId}/images/${stored.id}/asset`;await tx.sceneImage.create({data:{id:stored.id,filename:stored.filename,sceneId,kind:t.imageKind!,source:'AI',url,prompt}});await tx.scene.update({where:{id:sceneId},data:t.imageKind==='exterior'?{exteriorImageUrl:url,exteriorImageRevision:{increment:1}}:{interiorImageUrl:url,interiorImageRevision:{increment:1}}})}
 }
}
