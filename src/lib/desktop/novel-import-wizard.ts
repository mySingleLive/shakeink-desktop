import {WIZARD_STEPS,WIZARD_STEP_TITLES,normalizeWizardName,type WizardStep,type WizardCandidate} from '@desktop/shared/novel-import-wizard'
import {WIZARD_IMAGE_LABELS as SHARED_IMAGE_LABELS,WIZARD_LIMITS,WIZARD_IMAGE_KINDS,WIZARD_IMAGE_OWNER,type WizardImageKind,type WizardTask} from '@desktop/shared/novel-import-wizard'

/** Pure view selectors for the import wizard. Every string comes from real wizard state. */
export const WIZARD_IMAGE_LABELS:Record<WizardImageKind,string>=SHARED_IMAGE_LABELS
export const WIZARD_ENTITY_LABELS={character:'角色',scene:'场景',item:'物品',world:'世界观'} as const
export type WizardEntityKind=keyof typeof WIZARD_ENTITY_LABELS
export const wizardStepNumber=(step:WizardStep)=>WIZARD_STEPS.indexOf(step)+1

export function wizardTaskBarText(input:{step:WizardStep;title:string;waiting:boolean;paused:boolean}){
 return `导入作品 · 第 ${wizardStepNumber(input.step)} 步 ${WIZARD_STEP_TITLES[input.step]}${input.paused?' · 已暂停':input.waiting?' · 等待确认':''} · ${input.title||'未命名作品'}`
}
export function wizardStageText(step:WizardStep,stage:number,stageTitle:string){return `阶段 ${stage+1} / 6 · ${stageTitle} · 第 ${wizardStepNumber(step)} / ${WIZARD_STEPS.length} 步`}

export function wizardImportButton(kind:WizardEntityKind,selected:number,images:readonly WizardImageKind[]){
 if(!selected)return '跳过'
 const owned=images.filter(image=>WIZARD_IMAGE_OWNER[image]===kind).map(image=>WIZARD_IMAGE_LABELS[image])
 return kind==='world'?`导入 ${selected} 项世界观`:`导入 ${selected} 个${WIZARD_ENTITY_LABELS[kind]}${owned.length?'并生成'+owned.join('与'):''}`
}
export const wizardAnalyzeButton=(hasModel:boolean)=>hasModel?'允许分析并导入':'开始导入'

/** Name or alias substring match on normalized text. */
export function wizardCandidateMatches(candidate:Pick<WizardCandidate,'name'|'aliases'>,query:string){
 const q=normalizeWizardName(query);if(!q)return true
 return [candidate.name,...candidate.aliases].some(name=>normalizeWizardName(name).includes(q))
}
/** While searching, a volume checkbox only toggles the chapters that match. */
export function wizardVolumeToggle<T extends {title:string}>(chapters:readonly T[],query:string):T[]{
 const q=query.trim();return q?chapters.filter(c=>c.title.includes(q)):[...chapters]
}

export function wizardProgressText(tasks:readonly Pick<WizardTask,'kind'|'state'|'imageKind'>[],options:{paused:boolean;entities:number}){
 const entity=tasks.filter(t=>t.kind!=='image'),done=entity.filter(t=>t.state==='done').length
 const failed=tasks.filter(t=>t.state==='failed').length,skipped=entity.filter(t=>t.state==='skipped').length
 const images=WIZARD_IMAGE_KINDS.filter(kind=>tasks.some(t=>t.imageKind===kind)).map(kind=>` · ${WIZARD_IMAGE_LABELS[kind]} ${tasks.filter(t=>t.imageKind===kind&&t.state==='done').length} / ${options.entities}`).join('')
 return `${options.paused?'已暂停 · ':''}已完成 ${done} / ${options.entities}${images}${failed?` · ${failed} 项失败`:''}${skipped?` · ${skipped} 项已跳过`:''}`
}

/** Estimated staged image bytes for a selection; the controller enforces the same limit. */
export function wizardImageEstimate(selected:Partial<Record<'character'|'scene'|'item',number>>,images:Record<WizardImageKind,boolean>){
 const bytes=WIZARD_IMAGE_KINDS.filter(kind=>images[kind]).reduce((sum,kind)=>sum+(selected[WIZARD_IMAGE_OWNER[kind]]??0)*WIZARD_LIMITS.estimatedImageBytes,0)
 return {bytes,allowed:bytes<=WIZARD_LIMITS.sessionImageBytes}
}
