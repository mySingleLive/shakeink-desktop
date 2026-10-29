/** Renderer-safe wizard constants and types (no Node imports). */
/** The 22 approved wizard steps, in order (docs/novel-import-wizard/02-product.md). */
export const WIZARD_STEPS=['entry','files','work','kinds','detect-struct','tree','import-struct','import-body','detect-char','import-char','detect-scene','import-scene','detect-item','import-item','detect-world','import-world','worldline','narrative','outline','foreshadow','verify','done'] as const
export type WizardStep=typeof WIZARD_STEPS[number]
export const WIZARD_STEP_TITLES:Record<WizardStep,string>={entry:'选择来源',files:'确认文件',work:'作品与目录',kinds:'选择内容','detect-struct':'识别卷章',tree:'选择卷章','import-struct':'导入大纲结构','import-body':'导入正文','detect-char':'识别角色','import-char':'导入角色','detect-scene':'识别场景','import-scene':'导入场景','detect-item':'识别物品','import-item':'导入物品','detect-world':'识别世界观','import-world':'导入世界观',worldline:'导入世界线',narrative:'导入叙事线',outline:'补充细纲',foreshadow:'导入伏笔',verify:'校验',done:'完成'}

export const normalizeWizardName=(name:string)=>name.normalize('NFKC').replace(/\s+/gu,'')

export type WizardCandidateKind='character'|'scene'|'item'|'world'|'world-setting'
export type WizardRoleType='PROTAGONIST'|'SUPPORTING'|'ANTAGONIST'
export type WizardSettingType='LEVEL_SYSTEM'|'POWER_SYSTEM'|'CONCEPT'|'MAP'|'FACTION'|'SOCIETY'|'CULTURE'|'GEOGRAPHY'|'WORLD_HISTORY'
export interface WizardCandidate {
 id:string;kind:WizardCandidateKind;name:string;aliases:string[];roleType?:WizardRoleType;parentId?:string;settingType?:WizardSettingType;itemType?:string
 chapterCount:number;sources:('source'|'body')[];sourceArtifactIds:string[];selected:boolean
 /** Body units where recognition found this entry; used as import context when names are paraphrased. */
 evidenceUnitIds?:string[]
}

export const WIZARD_IMAGE_KINDS=['avatar','portrait','exterior','interior','icon'] as const
export const WIZARD_IMAGE_LABELS={avatar:'头像',portrait:'立绘',exterior:'外景图',interior:'内景图',icon:'物品图标'} as const
export type WizardImageKind=typeof WIZARD_IMAGE_KINDS[number]
export const WIZARD_IMAGE_OWNER:Record<WizardImageKind,'character'|'scene'|'item'>={avatar:'character',portrait:'character',exterior:'scene',interior:'scene',icon:'item'}
export const WIZARD_LIMITS={candidates:5000,tasks:20000,records:20000,imageBytes:10*1024*1024,sessionImageBytes:200*1024*1024,estimatedImageBytes:Math.round(2.5*1024*1024)} as const
export type WizardStepState='pending'|'running'|'waiting'|'done'|'skipped'|'failed'
export type WizardTaskState='waiting'|'running'|'done'|'failed'|'paused'|'skipped'
export interface WizardTask {
 id:string;kind:'entity'|'image'|'settings';candidateId?:string;imageKind?:WizardImageKind;settingsKind?:'theme'|'style'|'goldenFinger'|'trope'
 dependsOn?:string;state:WizardTaskState;attempts:number;error?:string
 resultSha256?:string;image?:{mime:'image/png'|'image/jpeg'|'image/webp';bytes:number;prompt:string}
}
