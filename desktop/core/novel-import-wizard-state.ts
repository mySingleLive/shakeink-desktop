import {z} from 'zod'
import {sceneIdentityLedgerSchema,sceneCleanupStateSchema,type SceneIdentityLedger,type SceneCleanupState} from '../shared/novel-import-scene-identity'
import {assertSceneIdentityLedger} from './novel-import-scene-identity'
import {WIZARD_STEPS,type WizardStep,type WizardCandidate} from '../shared/novel-import-wizard'

import {WIZARD_IMAGE_KINDS,WIZARD_IMAGE_OWNER,WIZARD_LIMITS,type WizardImageKind,type WizardStepState,type WizardTaskState,type WizardTask} from '../shared/novel-import-wizard'
export {WIZARD_IMAGE_KINDS,WIZARD_IMAGE_OWNER,WIZARD_LIMITS,type WizardImageKind,type WizardStepState,type WizardTaskState,type WizardTask}
export interface WizardImageGrant {hash:string;model:{id:string;name:string;authRevision:number}}
export interface WizardCheck {key:string;ok:boolean;detail:string}
export interface WizardVerifyState {failedPackets:{unitIds:string[];error:string;attempts:number}[];repairs:{conflictId:string;attempts:number}[];fixed:{label:string;field:string}[];droppedConflicts:number;outlineAttempts:number;repairable?:boolean}
export interface ImportWizardState {
 version:1;step:WizardStep;stepState:Partial<Record<WizardStep,WizardStepState>>;stepError?:string
 sceneIdentityVersion?:1;sceneIdentity?:SceneIdentityLedger
 /** Scene list cleanup: pre/post ledger hashes, exclusions with evidence, and excluded places the author re-ticked. */
 sceneCleanup?:SceneCleanupState
 structure?:{start:number;end:number;title:string;volume?:string}[];structureHash?:string
 structureDecision?:unknown
 chapterSelection?:number[];grantedChapters?:number[];materializedVolumes?:{start:number;volume?:string}[]
 selectionHash?:string
 candidates:Partial<Record<'character'|'scene'|'item'|'world',WizardCandidate[]>>
 images:Record<WizardImageKind,boolean>
 imageGrants:Partial<Record<'character'|'scene'|'item',WizardImageGrant>>
 tasks:WizardTask[]
 skipped:{taskId:string;label:string}[]
 dropped:{kind:'touch'|'materialRef'|'missingTarget'|'relationship'|'parent'|'settings'|'lines'|'verify';label:string;reason:string}[]
 /** docs/539: step-21 review packets that still failed after 3 attempts, conflict repair attempts, automatic fixes. */
 verify?:WizardVerifyState
 deferredConflicts:string[]
 checks?:WizardCheck[]
 /** Where "作品与目录" returns after a revise that only changed name or folder. */
 returnStep?:WizardStep;returnState?:WizardStepState;returnPhase?:'paused'|'select'|'running'|'conflicts'
 /** Step 20 batch proposals and the planned planning links (written at publish). */
 /** docs/517 3R3-3: shape repairs kept per line step until the step is adopted. */
 lineRepairs?:Partial<Record<'worldline'|'narrative'|'outline',{droppedEvidence:number;droppedLinks:number;droppedEntries?:number}>>
 touchStash?:{foreshadowKey:string;title:string;content:string;order?:number;touch:{kind:'PLANT'|'MENTION'|'PAYOFF';chapterIndex:number;summary:string;quote:string;eventId?:string;narrativeId?:string}}[]
 foreshadowRefs?:{target:'event'|'telling';targetId:string;foreshadowId:string;role:'plant'|'mention'|'payoff';note:string}[]
 /** Per-batch roster results kept until the recognition step finishes. */
 rosterStash?:Partial<Record<'character'|'scene'|'item'|'world',{unitId?:string;name:string;aliases:string[];roleType?:'PROTAGONIST'|'SUPPORTING'|'ANTAGONIST';parent?:string;itemType?:string;important?:boolean;category?:'item'|'character'|'place'|'organization'|'concept'|'other';parallel?:boolean;settings?:{settingType:'LEVEL_SYSTEM'|'POWER_SYSTEM'|'CONCEPT'|'MAP'|'FACTION'|'SOCIETY'|'CULTURE'|'GEOGRAPHY'|'WORLD_HISTORY';name:string}[]}[]>>
}
export function emptyWizardState():ImportWizardState{return {version:1,sceneIdentityVersion:1,step:'files',stepState:{entry:'done',files:'waiting'},candidates:{},images:{avatar:false,portrait:false,exterior:false,interior:false,icon:false},imageGrants:{},tasks:[],skipped:[],dropped:[],deferredConflicts:[]}}

const text=(max:number)=>z.string().max(max).refine(v=>v.isWellFormed(),'字符无效')
const candidateId=z.string().regex(/^[a-z]{1,2}-[0-9a-f]{16}$/u)
const taskId=z.string().regex(/^[a-z0-9-]{1,80}$/u)
const index=z.number().int().nonnegative()
const sorted=(values:number[])=>values.every((v,i)=>i===0||v>values[i-1])
const settingType=z.enum(['LEVEL_SYSTEM','POWER_SYSTEM','CONCEPT','MAP','FACTION','SOCIETY','CULTURE','GEOGRAPHY','WORLD_HISTORY'])
const candidate=z.object({id:candidateId,kind:z.enum(['character','scene','item','world','world-setting']),name:text(300).min(1),aliases:z.array(text(300)).max(50),roleType:z.enum(['PROTAGONIST','SUPPORTING','ANTAGONIST']).optional(),parentId:candidateId.optional(),settingType:settingType.optional(),itemType:text(100).optional(),important:z.boolean().optional(),chapterCount:index,sources:z.array(z.enum(['source','body'])).min(1).max(2),sourceArtifactIds:z.array(text(200)).max(200),selected:z.boolean(),evidenceUnitIds:z.array(text(200)).max(50000).optional(),sceneIdentityState:z.enum(['concrete','source-scoped','unresolved']).optional(),sceneExcluded:z.literal(true).optional(),sceneHint:text(60).min(1).optional()}).strict().refine(c=>(c.sceneIdentityState===undefined&&c.sceneExcluded===undefined&&c.sceneHint===undefined||c.kind==='scene')&&((c.evidenceUnitIds?.length??0)<=200||c.kind==='scene'&&c.sceneIdentityState!==undefined))
const stepState=z.enum(['pending','running','waiting','done','skipped','failed'])
const task=z.object({id:taskId,kind:z.enum(['entity','image','settings']),candidateId:candidateId.optional(),imageKind:z.enum(WIZARD_IMAGE_KINDS).optional(),settingsKind:z.enum(['theme','style','goldenFinger','trope']).optional(),dependsOn:taskId.optional(),state:z.enum(['waiting','running','done','failed','paused','skipped']),attempts:index.max(1000),error:text(400).optional(),resultSha256:z.string().regex(/^[0-9a-f]{64}$/u).optional(),image:z.object({mime:z.enum(['image/png','image/jpeg','image/webp']),bytes:index.max(WIZARD_LIMITS.imageBytes),prompt:text(8000)}).strict().optional()}).strict()
const record=z.object({taskId,label:text(400)}).strict()
const lineRepair=z.object({droppedEvidence:z.number().int().nonnegative().max(1_000_000),droppedLinks:z.number().int().nonnegative().max(1_000_000)}).strict()
const dropped=z.object({kind:z.enum(['touch','materialRef','missingTarget','relationship','parent','settings','lines','verify']),label:text(400),reason:text(400)}).strict()
const structureItem=z.object({start:index,end:index,title:text(300).min(1),volume:text(300).optional()}).strict()
export const importWizardStateSchema=z.object({
 version:z.literal(1),step:z.enum(WIZARD_STEPS),stepState:z.partialRecord(z.enum(WIZARD_STEPS),stepState),stepError:text(400).optional(),
 sceneIdentityVersion:z.literal(1).optional(),sceneIdentity:sceneIdentityLedgerSchema.optional(),sceneCleanup:sceneCleanupStateSchema.optional(),
 structure:z.array(structureItem).max(20000).optional(),structureHash:z.string().regex(/^[0-9a-f]{64}$/u).optional(),structureDecision:z.unknown().optional(),
 chapterSelection:z.array(index).max(20000).refine(sorted,'章节选择必须升序').optional(),grantedChapters:z.array(index).max(20000).refine(sorted,'授权章节必须升序').optional(),
 materializedVolumes:z.array(z.object({start:index,volume:text(300).optional()}).strict()).max(20000).optional(),
 selectionHash:z.string().regex(/^[0-9a-f]{64}$/u).optional(),
 candidates:z.object({character:z.array(candidate).max(WIZARD_LIMITS.candidates).optional(),scene:z.array(candidate).max(WIZARD_LIMITS.candidates).optional(),item:z.array(candidate).max(WIZARD_LIMITS.candidates).optional(),world:z.array(candidate).max(WIZARD_LIMITS.candidates).optional()}).strict(),
 images:z.object(Object.fromEntries(WIZARD_IMAGE_KINDS.map(k=>[k,z.boolean()])) as Record<WizardImageKind,z.ZodBoolean>).strict(),
 imageGrants:z.object(Object.fromEntries((['character','scene','item'] as const).map(k=>[k,z.object({hash:z.string().regex(/^[0-9a-f]{64}$/u),model:z.object({id:text(200).min(1),name:text(300),authRevision:index}).strict()}).strict().optional()]))).strict(),
 tasks:z.array(task).max(WIZARD_LIMITS.tasks),skipped:z.array(record).max(WIZARD_LIMITS.records),dropped:z.array(dropped).max(WIZARD_LIMITS.records),
 deferredConflicts:z.array(text(200)).max(WIZARD_LIMITS.records),
 checks:z.array(z.object({key:text(80),ok:z.boolean(),detail:text(400)}).strict()).max(20).optional(),
 verify:z.object({failedPackets:z.array(z.object({unitIds:z.array(text(200)).min(1).max(5000),error:text(400),attempts:index.max(1_000_000)}).strict()).max(5000),repairs:z.array(z.object({conflictId:text(200),attempts:index.max(1_000_000)}).strict()).max(WIZARD_LIMITS.records),fixed:z.array(z.object({label:text(400),field:text(200)}).strict()).max(WIZARD_LIMITS.records),droppedConflicts:index.max(1_000_000),outlineAttempts:index.max(1_000_000),repairable:z.boolean().optional()}).strict().optional(),
 returnStep:z.enum(WIZARD_STEPS).optional(),returnState:stepState.optional(),returnPhase:z.enum(['paused','select','running','conflicts']).optional(),
 lineRepairs:z.object({worldline:lineRepair.optional(),narrative:lineRepair.optional(),outline:lineRepair.extend({droppedEntries:z.number().int().nonnegative().max(1_000_000).optional()}).strict().optional()}).strict().optional(),
 touchStash:z.array(z.object({foreshadowKey:text(300).min(1),title:text(300).min(1),content:text(4000),order:index.optional(),touch:z.object({kind:z.enum(['PLANT','MENTION','PAYOFF']),chapterIndex:index,summary:text(200),quote:text(200).min(1),eventId:text(200).optional(),narrativeId:text(200).optional()}).strict()}).strict()).max(50000).optional(),
 foreshadowRefs:z.array(z.object({target:z.enum(['event','telling']),targetId:text(200).min(1),foreshadowId:text(200).min(1),role:z.enum(['plant','mention','payoff']),note:text(500).min(1)}).strict()).max(50000).optional(),
 rosterStash:z.partialRecord(z.enum(['character','scene','item','world']),z.array(z.object({unitId:text(200).optional(),name:text(300).min(1),aliases:z.array(text(300)).max(50),roleType:z.enum(['PROTAGONIST','SUPPORTING','ANTAGONIST']).optional(),parent:text(300).optional(),itemType:text(100).optional(),important:z.boolean().optional(),category:z.enum(['item','character','place','organization','concept','other']).optional(),parallel:z.boolean().optional(),settings:z.array(z.object({settingType,name:text(300).min(1)}).strict()).max(50).optional()}).strict()).max(50000)).optional(),
}).strict()

export class ImportWizardStateError extends Error {constructor(message='导入向导状态无效，请保留原草稿'){super(message)}}
/** Journal guard: wizard state exists only on wizard sessions and is internally consistent. */
export function validateImportWizardState(s:{wizardVersion?:unknown;wizard?:unknown}){
 if(s.wizardVersion===undefined){if(s.wizard!==undefined)throw new ImportWizardStateError();return}
 if(s.wizardVersion!==1)throw new ImportWizardStateError()
 const parsed=importWizardStateSchema.safeParse(s.wizard)
 // Debug runs name the failing field paths only, never values.
 if(!parsed.success){if(process.env.SHAKEINK_IMPORT_DEBUG==='1')console.error('wizard state issues',parsed.error.issues.slice(0,5).map(i=>i.path.map(p=>typeof p==='number'?'#':String(p)).join('.')+':'+i.code));throw new ImportWizardStateError()}
 const w=parsed.data
 if(w.sceneIdentity){if(w.sceneIdentityVersion!==1)throw new ImportWizardStateError();try{assertSceneIdentityLedger(w.sceneIdentity)}catch{throw new ImportWizardStateError()}}
 if(w.sceneCleanup&&w.sceneIdentityVersion!==1)throw new ImportWizardStateError()
 if(w.sceneIdentityVersion===undefined&&Object.values(w.candidates).some(list=>list?.some(c=>c.sceneIdentityState!==undefined)))throw new ImportWizardStateError()
 if(w.sceneIdentityVersion===1&&(w.step==='detect-scene'&&w.stepState['detect-scene']==='waiting'||w.stepState['detect-scene']==='done')&&!w.sceneIdentity)throw new ImportWizardStateError()
 if(w.chapterSelection&&w.structure&&w.chapterSelection.some(i=>i>=w.structure!.length))throw new ImportWizardStateError()
 if(w.grantedChapters&&(!w.chapterSelection||w.chapterSelection.some(i=>!w.grantedChapters!.includes(i))))throw new ImportWizardStateError()
 if(w.materializedVolumes&&w.chapterSelection&&w.materializedVolumes.length!==w.chapterSelection.length)throw new ImportWizardStateError()
 const ids=new Set(w.tasks.map(t=>t.id));if(ids.size!==w.tasks.length||w.tasks.some(t=>t.dependsOn&&!ids.has(t.dependsOn)))throw new ImportWizardStateError()
 for(const list of Object.values(w.candidates)){const seen=new Set(list.map(c=>c.id));if(seen.size!==list.length)throw new ImportWizardStateError()}
}
