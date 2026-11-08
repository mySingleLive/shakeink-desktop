import { z } from 'zod'
import type {ImportBudgetPolicy,ImportLegacyBudget,ImportExecutionBudget} from '../core/novel-import-budget-policy'
import type {ImportSemanticRequestFields,ImportSemanticResult,ImportSemanticEntity,ImportMappingWarning} from '../core/novel-import-semantics'
import type {ImportRuntimeAiCall,ImportRuntimePauseProof} from '../core/novel-import-runtime-proof'
import type {ImportSemanticCheckpoint} from '../core/novel-import-semantic-state'
import type {ImportStructureDraft} from '../core/novel-import-structure'
import type {ImportWizardState} from '../core/novel-import-wizard-state'
import {sceneIdentityChangeSchema,type NamePart} from './novel-import-scene-identity'

export const IMPORT_KINDS = ['body','outline','theme','style','world','character','scene','item','foreshadow','goldenFinger','trope','worldline','narrative'] as const
export type ImportKind = typeof IMPORT_KINDS[number]
export type ImportTarget = Exclude<ImportKind,'body'>
export const IMPORT_TARGETS = IMPORT_KINDS.filter((kind):kind is ImportTarget=>kind!=='body')
export const IMPORT_LABELS:Record<ImportKind,string>={body:'正文',outline:'大纲',theme:'主题',style:'文风',world:'世界观',character:'角色',scene:'场景',item:'物品',foreshadow:'伏笔',goldenFinger:'金手指',trope:'爽点/泪点',worldline:'世界线',narrative:'叙事线'}
export const IMPORT_FORMATS=['txt','md','doc','docx','pdf','html','htm'] as const
export type ImportFormat=typeof IMPORT_FORMATS[number]
export type UnitKind=ImportKind|'unknown'|'excluded'
export const importKindSchema=z.enum(IMPORT_KINDS)
const targetSchema=z.enum(IMPORT_TARGETS as [ImportTarget,...ImportTarget[]])
const unitKindSchema=z.enum([...IMPORT_KINDS,'unknown','excluded'])
const unique=<T extends z.ZodType>(schema:T,max=100)=>z.array(schema).max(max).refine(values=>new Set(values).size===values.length,'选项不能重复')
const mutable={id:z.uuid(),revision:z.number().int().nonnegative()}
const sceneLedgerHash=z.string().regex(/^[0-9a-f]{64}$/u)
const sceneIdentityId=z.string().regex(/^s-[0-9a-f]{16}$/u)
const sceneIdentityCommand={type:z.literal('wizard-scene-identity'),...mutable}
const sceneIdentityActionSchema=z.discriminatedUnion('op',[
 sceneIdentityChangeSchema.options[0].extend(sceneIdentityCommand).strict(),
 sceneIdentityChangeSchema.options[1].extend(sceneIdentityCommand).strict(),
 sceneIdentityChangeSchema.options[2].extend(sceneIdentityCommand).strict(),
 sceneIdentityChangeSchema.options[3].extend(sceneIdentityCommand).strict(),
])
const volumeName=z.string().min(1).max(300).refine(value=>value===value.trim()&&!!value.trim()&&value.isWellFormed()&&!/[\r\n\u0000-\u001f]/u.test(value),'卷名无效')
const pdfPage=z.number().int().min(1).max(5000)
const pdfDecisionChange=z.discriminatedUnion('decision',[
 z.object({page:pdfPage,decision:z.literal('exclude-image'),previewToken:z.uuid()}).strict(),
 z.object({page:pdfPage,decision:z.enum(['contains-content','uncertain','pending'])}).strict(),
])
export const importActionSchema=z.discriminatedUnion('type',[
 sceneIdentityActionSchema,
 z.object({type:z.literal('wizard-read-scene-identity'),...mutable,expectedLedgerHash:sceneLedgerHash,identityId:sceneIdentityId,cursor:z.number().int().nonnegative(),limit:z.number().int().min(1).max(50)}).strict(),
 z.object({type:z.literal('wizard-read-scene-source'),...mutable,expectedLedgerHash:sceneLedgerHash,memberKey:sceneLedgerHash,neighbor:z.union([z.literal(-1),z.literal(0),z.literal(1)]),offset:z.number().int().nonnegative(),limit:z.number().int().min(1).max(32768)}).strict(),
 z.object({type:z.literal('current')}).strict(),
 z.object({type:z.literal('choose'),mode:z.enum(['files','folder']).optional(),append:z.boolean().optional()}).strict(),
 z.object({type:z.literal('read-source'),id:z.uuid(),fileId:z.string().min(1).max(160),offset:z.number().int().nonnegative().optional(),limit:z.number().int().min(1).max(32768).optional()}).strict(),
 z.object({type:z.literal('read-pdf-page'),...mutable,fileId:z.string().min(1).max(160),page:pdfPage,requestId:z.uuid()}).strict(),
 z.object({type:z.literal('cancel-pdf-preview'),id:z.uuid(),requestId:z.uuid()}).strict(),
 z.object({type:z.literal('report-pdf-preview-failure'),...mutable,fileId:z.string().min(1).max(160),page:pdfPage,requestId:z.uuid()}).strict(),
 z.object({type:z.literal('set-pdf-page-decisions'),...mutable,fileId:z.string().min(1).max(160),ledgerHash:z.string().regex(/^[0-9a-f]{64}$/u),changes:z.array(pdfDecisionChange).min(1).max(100).refine(values=>new Set(values.map(value=>value.page)).size===values.length,'页号不能重复')}).strict(),
 z.object({type:z.literal('reselect-source'),...mutable,fileId:z.string().min(1).max(160)}).strict(),
 z.object({type:z.literal('include'),...mutable,fileId:z.string().min(1).max(160),included:z.boolean()}).strict(),
 z.object({type:z.literal('move'),...mutable,fileId:z.string().min(1).max(160),delta:z.union([z.literal(-1),z.literal(1)])}).strict(),
 z.object({type:z.literal('set-range'),...mutable,fileId:z.string().min(1).max(160),start:z.number().int().nonnegative(),end:z.number().int().nonnegative(),kind:unitKindSchema}).strict(),
 z.object({type:z.literal('set-encoding'),...mutable,fileId:z.string().min(1).max(160),encoding:z.enum(['utf-8','utf-16le','utf-16be','gb18030'])}).strict(),
 z.object({type:z.literal('set-chapters'),...mutable,cuts:z.array(z.object({start:z.number().int().nonnegative(),title:z.string().min(1).max(300),volume:volumeName.optional()}).strict()).min(1).max(5000)}).strict(),
 z.object({type:z.literal('select'),...mutable,selected:unique(importKindSchema,13),targets:unique(targetSchema,12),infer:z.boolean()}).strict(),
 z.object({type:z.literal('set-title'),...mutable,title:z.string().max(100)}).strict(),
 z.object({type:z.literal('classify'),...mutable,mode:z.enum(['local','ai']),consent:z.boolean()}).strict(),
 z.object({type:z.literal('choose-target'),...mutable}).strict(),
 z.object({type:z.literal('start'),...mutable,consent:z.boolean()}).strict(),
 z.object({type:z.literal('pause'),...mutable}).strict(),
 z.object({type:z.literal('resume'),...mutable,consent:z.boolean().optional(),imageConsent:z.boolean().optional()}).strict(),
 z.object({type:z.literal('retry'),...mutable,consent:z.boolean().optional()}).strict(),
 z.object({type:z.literal('cancel'),...mutable}).strict(),
 z.object({type:z.literal('discard'),...mutable}).strict(),
 z.object({type:z.literal('resolve'),...mutable,conflictId:z.string().min(1).max(200),choice:z.enum(['source','inferred','rewrite','a','b','merge']),explanation:z.string().max(16000).optional(),mergedText:z.string().max(100000).optional()}).strict(),
 z.object({type:z.literal('apply-patches'),...mutable,patchIds:unique(z.string().min(1).max(200),5000),confirm:z.literal(true)}).strict(),
 z.object({type:z.literal('repair-target'),...mutable}).strict(),
 z.object({type:z.literal('wizard-next'),...mutable,consent:z.boolean().optional(),imageConsent:z.boolean().optional(),skip:z.boolean().optional()}).strict(),
 z.object({type:z.literal('wizard-back'),...mutable}).strict(),
 z.object({type:z.literal('wizard-select-chapters'),...mutable,indices:z.array(z.number().int().nonnegative()).max(20000)}).strict(),
 z.object({type:z.literal('wizard-select-candidates'),...mutable,kind:z.enum(['character','scene','item','world']),ids:z.array(z.string().regex(/^[a-z]{1,2}-[0-9a-f]{16}$/u)).min(1).max(5000),selected:z.boolean()}).strict(),
 z.object({type:z.literal('wizard-set-role'),...mutable,candidateId:z.string().regex(/^[a-z]{1,2}-[0-9a-f]{16}$/u),roleType:z.enum(['PROTAGONIST','SUPPORTING','ANTAGONIST'])}).strict(),
 z.object({type:z.literal('wizard-merge-candidates'),...mutable,keepId:z.string().regex(/^[a-z]{1,2}-[0-9a-f]{16}$/u),mergeIds:z.array(z.string().regex(/^[a-z]{1,2}-[0-9a-f]{16}$/u)).min(1).max(50)}).strict(),
 z.object({type:z.literal('wizard-redetect'),...mutable}).strict(),
 z.object({type:z.literal('wizard-set-images'),...mutable,avatar:z.boolean().optional(),portrait:z.boolean().optional(),exterior:z.boolean().optional(),interior:z.boolean().optional(),icon:z.boolean().optional()}).strict(),
 z.object({type:z.literal('wizard-read-image'),id:z.uuid(),taskId:z.string().regex(/^[a-z0-9-]{1,80}$/u)}).strict(),
 z.object({type:z.literal('wizard-revise'),...mutable,to:z.enum(['files','work','kinds','tree','detect-char','detect-scene','detect-item','detect-world'])}).strict(),
 z.object({type:z.literal('wizard-retry-kind'),...mutable,kind:z.enum(['character','scene','item','world'])}).strict(),
 z.object({type:z.literal('wizard-task'),...mutable,taskId:z.string().regex(/^[a-z0-9-]{1,80}$/u).optional(),op:z.enum(['retry','skip','skip-failed'])}).strict().refine(a=>a.op==='skip-failed'?a.taskId===undefined:a.taskId!==undefined,'导入任务参数无效'),
])
export type ImportAction=z.infer<typeof importActionSchema>
export interface ImportUnit {id:string;fileId:string;start:number;end:number;text:string;kind:UnitKind;part?:string}
export interface ImportProof {device:string;inode:string;size:string;mtime:string;ctime?:string}
export type PdfDiagnosticCode='PDF_IMAGE_DIMENSIONS_INVALID'|'PDF_IMAGE_DROPPED'|'PDF_IMAGE_DECODE_FAILED'|'PDF_REQUIRED_RESOURCE_FAILED'|'PDF_DIAGNOSTIC_UNCLASSIFIED'|'PDF_DIAGNOSTIC_OVERFLOW'|'PDF_BUNDLED_FONT_FALLBACK'|'PDF_BUDGET'|'PDF_PAGE_FAILED'|'PDF_DOCUMENT_FAILED'
export type PdfPageDecision='exclude-image'|'contains-content'|'uncertain'|'pending'
export type PdfPageError='render-failed'|'timeout'|'budget'|'resource-missing'|'source-changed'
export interface ImportPdfPageLedger {page:number;start:number;end:number;textCharacters:number;textState:'extracted'|'empty'|'failed'|'not-scanned';raster:'present'|'none'|'unknown';errors?:PdfDiagnosticCode[]}
export interface ImportPdfSourceTextPageProof {page:number;resourceClosureHash:string;beforeUtf8Sha256:string;afterUtf8Sha256:string;candidateCount:number;changedOffsets:number[];glyphSequenceHash:string;correspondenceHash:string}
export interface ImportPdfSourceTextDecoding {policy:'gbk-euc-h-a1ad-v1';sourceHash:string;pages:ImportPdfSourceTextPageProof[];proofHash:string}
export interface ImportPdfSourceTextSummary {policy:'gbk-euc-h-a1ad-v1';pageCount:number;changedCharacters:number}
export interface ImportPdfInspection {
 schemaVersion:1;sourceHash:string;proof:ImportProof|null;inspectionId:string;extractorVersion:string;resourceProfileHash:string;ledgerHash:string
 pageCount:number|null;scanState:'complete'|'incomplete'|'document-error';blocker?:'ocr-required'|'page-error'|'budget'|'source-changed'|'document-error'
 pages:ImportPdfPageLedger[];textOnlyPageCount:number;imagePageCount:number;totalTextCharacters:number
 sourceTextDecoding?:ImportPdfSourceTextDecoding
}
export interface ImportPdfPageDecision {fileId:string;page:number;sourceHash:string;proof:ImportProof;ledgerHash:string;resourceProfileHash:string;decision:PdfPageDecision;confirmedAt:string;decisionRevision:number}
export interface ImportPdfPageDecisionEvent {fileId:string;page:number;sourceHash:string;ledgerHash:string;resourceProfileHash:string;decision:PdfPageDecision;action:'confirm'|'revoke'|'contains-content'|'uncertain'|'source-invalidated';at:string;decisionRevision:number}
export interface ImportPdfPreviewFailure {page:number;code:PdfPageError;at:string}
export type ImportPdfInspectionView=Omit<ImportPdfInspection,'proof'|'sourceTextDecoding'>&{sourceKey:string;sourceTextDecoding?:ImportPdfSourceTextSummary}
export type ImportPdfPageDecisionView=Pick<ImportPdfPageDecision,'page'|'decision'|'confirmedAt'|'decisionRevision'>
export type ImportPdfPageResponse={requestId:string;id:string;requestRevision:number;fileId:string;page:number;ledgerHash:string}&(
 {status:'ready';mime:'image/png';png:Uint8Array;width:number;height:number;pageWidth:number;pageHeight:number;previewToken?:string}|
 {status:'failed';code:PdfPageError}
)
export interface ImportPdfPageReviewAudit {schemaVersion:1;files:{fileId:string;name:string;format:'pdf';sourceHash:string;proof:ImportProof;pageCount:number;ledgerHash:string;resourceProfileHash:string;sourceTextDecoding?:ImportPdfSourceTextDecoding;pages:(ImportPdfPageLedger&{textHash:string;decision?:'exclude-image';confirmedAt?:string})[];events:ImportPdfPageDecisionEvent[];note:string}[];events?:ImportPdfPageDecisionEvent[]}
export interface ImportFile {
 id:string;name:string;format:ImportFormat|'unsupported';path:string;bytes:number;hash:string;text:string;encoding?:string;requiresEncodingConfirmation?:boolean
 included:boolean;error?:string;proof?:ImportProof;sourceRoot?:string;ancestors?:{path:string;device:string;inode:string}[];snapshotPath?:string
 parts?:{name:string;start:number;end:number;kind?:'body'|'attachment'}[];pages?:{page:number;start:number;end:number}[]
 pdfInspection?:ImportPdfInspection;pdfPageDecisions?:ImportPdfPageDecision[];pdfPreviewFailures?:ImportPdfPreviewFailure[];pdfSourceInvalidated?:boolean
}
export interface ImportEvidence {unitId:string;quote:string}
/** schema:2 marks wizard entity results; it selects the extended native field table. */
export interface ImportArtifact {id:string;kind:ImportTarget;name:string;text:string;facts:Record<string,string>;evidence:ImportEvidence[];sourceUnitIds:string[];origin:'source'|'inferred'|'confirmed';schema?:2}
export interface ImportAlternative {text:string;value:string;artifactId?:string;unitId?:string}
export interface ImportConflict {id:string;type:'setting-body'|'source-source'|'body-body';kind:ImportKind;entity:string;field:string;source:ImportAlternative;candidate:ImportAlternative;evidence:ImportEvidence[];status:'pending'|'resolved';resolution?:string;explanation?:string;hash:string}
export interface ImportPatch {id:string;start:number;end:number;before:string;after:string;reason:string;workingRevision:number;conflictId:string}
export interface ImportChapter {id:string;title:string;start:number;end:number;content:string;outline?:string;volume?:string}
export interface ImportStep {key:string;label:string;state:'pending'|'running'|'done'|'skipped'|'failed'|'waiting';completed:number;total?:number}
export type ImportPhase='source'|'recognizing'|'select'|'confirm'|'running'|'paused'|'conflicts'|'failed'|'publishing'|'completed'|'discarded'
export interface ImportModel {id:string;name:string;modelId:string;endpoint:string;authRevision:number;contextWindow:number;provider?:string;protocol?:string}
export interface ImportGrant {hash:string;textModel:ImportModel;reviewModel?:ImportModel}
/** Private durable document. Never return paths or whole files through a view. */
export interface ImportSession {
 runtimeAiCall?:ImportRuntimeAiCall;runtimePauseProof?:ImportRuntimePauseProof;runtimeDiagnosticsStatus?:'unavailable'
 /** Present only on step-by-step wizard sessions (docs/novel-import-wizard). */
 wizardVersion?:1;wizard?:ImportWizardState
 semanticVersion?:1;semanticState?:ImportSemanticCheckpoint;mappingWarnings?:ImportMappingWarning[]
 chapterVersion?:2
 /** docs/526: set only when a new wizard session is created with the v2 budget policy. */
 promptLayout?:'shared-source-v1'
 /** docs/528: compact scene-roster fragment refs; written only when a new wizard session is created. */
 sceneFragmentLayout?:'compact-v1'
 chapterDetection?:{mode:'auto'|'manual';diagnostic?:string;structureDecision?:{normalizationVersion?:1|2;chapterCuts:{start:number;title:string;volume?:string;candidateId?:string}[];ignoredStarts:number[];volumeCuts:{start:number;title:string;volume?:string;candidateId?:string}[]}}
 budgetPolicy?:ImportBudgetPolicy;legacyBudget?:ImportLegacyBudget
 version:1;id:string;revision:number;phase:ImportPhase;title:string;files:ImportFile[];units:ImportUnit[]
 selected:ImportKind[];targets:ImportTarget[];infer:boolean;artifacts:ImportArtifact[];conflicts:ImportConflict[];patches:ImportPatch[]
 originalProse:string;workingProse:string;workingRevision:number;workingUnits?:ImportUnit[];chapters:ImportChapter[];detailedOutlineIds?:Record<number,string>
 steps:ImportStep[];coverage:Record<string,string[]>;notFound:ImportTarget[];epoch:number
 classificationGrant?:ImportGrant;structureGrant?:ImportGrant;structureDraft?:ImportStructureDraft;analysisGrant?:ImportGrant;models?:{text?:ImportModel;review?:ImportModel}
 target?:{path:string;device:string;inode:string};targetNeedsAuthorization?:boolean
 publication?:{requestId:string;hash?:string;workId?:string;novelId?:string};error?:string;resumePhase?:ImportPhase
 createdAt:string;updatedAt:string;decisions:{conflictId:string;choice:string;explanation?:string;hash:string}[]
 pdfPageDecisionEvents?:ImportPdfPageDecisionEvent[]
}
export interface ImportFileView {id:string;name:string;format:ImportFormat|'unsupported';bytes:number;hash:string;included:boolean;error?:string;encoding?:string;requiresEncodingConfirmation?:boolean;characters:number;unitCount:number;unknownCount:number;pdfInspection?:ImportPdfInspectionView;pdfPageDecisions?:ImportPdfPageDecisionView[];pdfPreviewFailures?:ImportPdfPreviewFailure[];pdfReady?:boolean;pdfPendingPages?:number;pdfSourceInvalidated?:boolean}
export interface ImportView {
 id:string;revision:number;phase:ImportPhase;title:string;files:ImportFileView[];found:Record<ImportKind,number>
 selected:ImportKind[];targets:ImportTarget[];infer:boolean;steps:ImportStep[];conflicts:ImportConflict[];patches:ImportPatch[]
 models:{text?:ImportModel;review?:ImportModel;image?:{id:string;name:string}};targetLabel?:string;targetReady:boolean;sourceReady:boolean;error?:string
 chapters:{id:string;title:string;start:number;end:number;volume?:string}[];notFound:ImportTarget[];modified:boolean
 publication?:{requestId:string;workId?:string;novelId?:string};summary?:{source:number;inferred:number;decisions:number;modified:number}
 pdfReady?:boolean;pdfPendingPages?:number
 wizard?:ImportWizardView
}
export interface ImportSceneIdentitySummary {version:1;ledgerHash:string;identityRevision:number;concreteCount:number;sourceScopedCount:number;unresolvedCount:number;ownershipDone:number;ownershipTotal:number;
 /** Unselected unresolved places, not imported (486 §3R): at most 200 listed, deferredTotal counts all. */
 deferred?:{id:string;name:string}[];deferredTotal?:number}
export interface ImportSceneIdentityDetail {
 ledgerHash:string;identityRevision:number;identityId:string;state:'concrete'|'source-scoped'|'unresolved';name:string
 parent:{state:'unknown'}|{state:'known';id:string;name:string}
 totalMembers:number;members:{key:string;origin:'body'|'source-block';literal?:string;unitId?:string;range?:{start:number;end:number};sourceName?:string;blockIndex?:number;contextKeys:string[]}[];nextCursor?:number
 nameParts:NamePart[];namePartOptions:(NamePart&{label:string})[];contexts:{key:string;label:string}[]
 relations:{key:string;relation:'same-place'|'different-place'|'parent'|'not-parent';label:string;evidenceKeys:string[]}[]
 relationTotal?:number
}
export interface ImportSceneIdentitySource {ledgerHash:string;memberKey:string;neighbor:-1|0|1;unitId?:string;offset:number;total:number;text:string;nextOffset?:number}
export type ImportWizardView=Omit<ImportWizardState,'rosterStash'|'touchStash'|'foreshadowRefs'|'structure'|'structureDecision'|'structureHash'|'materializedVolumes'|'selectionHash'|'imageGrants'|'tasks'|'sceneIdentity'|'sceneCleanup'>&{sceneIdentitySummary?:ImportSceneIdentitySummary;rosterFound?:number;structure?:{title:string;volume?:string}[];imageGrants:Partial<Record<'character'|'scene'|'item',{model:{id:string;name:string}}|undefined>>;tasks:(Omit<ImportWizardState['tasks'][number],'resultSha256'|'image'>&{image?:{mime:string;bytes:number}})[];lineProgress?:{done:number;total:number}}
export interface ImportSourcePage {fileId:string;offset:number;total:number;text:string;units:{id:string;start:number;end:number;kind:UnitKind;part?:string}[]}
export interface ImportResponse {view:ImportView|null;source?:ImportSourcePage;sceneIdentityDetail?:ImportSceneIdentityDetail;sceneIdentitySource?:ImportSceneIdentitySource;pdfPage?:ImportPdfPageResponse;image?:{mime:string;bytes:Uint8Array}}
export interface ImportBridge {novelImport(action:ImportAction):Promise<ImportResponse>}
export interface ImportAiRequest extends ImportSemanticRequestFields {sceneFragmentRefs?:{version:1;width:12};sharedSource?:{version:1;windows:{index:number;unitIds:string[]}[];extraUnitIds:string[]};executionBudget?:ImportExecutionBudget;executionLane?:'scene-review-wave-v1'|'wizard-settings-v1'|'wizard-lines-v1';chapters?:{id:string;title:string;start:number;end:number}[];entities?:ImportSemanticEntity[];operationId:string;phase:'classify'|'analyze'|'review'|'patch';kind?:ImportTarget;units:ImportUnit[];artifacts:ImportArtifact[];models:{text:ImportModel;review?:ImportModel};instruction?:string;conflict?:ImportConflict;workingRevision?:number}
export interface ImportAiResult extends ImportSemanticResult {classifications?:{unitId:string;kind:UnitKind}[];artifacts?:ImportArtifact[];conflicts?:ImportConflict[];patches?:ImportPatch[];chapterCuts?:{start:number;title:string;volume?:string;candidateId?:string}[];ignoredStarts?:number[];notFound?:boolean;settingsRepairs?:ImportSettingsRepairs;linesRepairs?:ImportLinesRepairs}
/** docs/514: repair counts of a wizard other-setting batch (unlocatable quotes, dropped items, cleared reliability). */
export interface ImportSettingsRepairs {droppedEvidence:number;droppedArtifacts:number;clearedReliability:number}
/** docs/517 3R3-3: shape repairs of one wizard lines-lane reply; reported to the author. */
export interface ImportLinesRepairs {droppedEvidence:number;droppedLinks:number;droppedEntries?:number}
/** Staged wizard images travel with the publish request; the worker re-checks every digest. */
export interface ImportPublishImage {taskId:string;mime:'image/png'|'image/jpeg'|'image/webp';sha256:string;bytes:Uint8Array}
export interface ImportPublishInput {session:ImportSession;selection:{path:string;device:string;inode:string};importHash:string;images?:ImportPublishImage[]}
export interface ImportReceipt {workId:string;novelId:string;requestId:string;importHash:string}
