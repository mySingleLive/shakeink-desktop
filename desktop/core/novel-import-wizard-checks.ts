import {resolveReferenceAnchor} from '../../src/lib/foreshadow-reference'
import {sourceBody,workingImportUnits,selectedImportUnits} from './novel-import'
import {assertWizardSessionChapters} from './novel-import-wizard'
import {importNativeMappings} from './novel-import-semantic-state'
import {validateDetailedOutlineAssignments} from './novel-import-outline'
import type {ImportSession} from '../shared/novel-import'
import type {WizardCheck} from './novel-import-wizard-state'

export const WIZARD_CHECKS=[['chapters','卷章与正文完整'],['scope','所选范围一致'],['relationships','角色关系引用'],['worlds','世界观归属'],['lines','世界线与叙事线引用'],['outlines','细纲覆盖'],['touches','伏笔触点'],['consistency','一致性复核']] as const
export type WizardCheckKey=typeof WIZARD_CHECKS[number][0]
const message=(error:unknown)=>error instanceof Error&&error.message.length<180?error.message:'检查未通过'

/** Structural checks for step 21. Consistency (the review model) is added by the controller. */
/** `partialOutlines` (docs/539): wizard sessions may save chapters without an outline; the check reports them. */
export function wizardStructureChecks(s:ImportSession,partialOutlines=false):WizardCheck[]{
 const w=s.wizard!,check=(key:WizardCheckKey,run:()=>string):WizardCheck=>{try{return {key,ok:true,detail:run()}}catch(error){return {key,ok:false,detail:message(error)}}}
 const units=new Set([...workingImportUnits(s),...selectedImportUnits(s).filter(u=>u.kind!=='body')].map(u=>u.id))
 const mapping=(()=>{try{return importNativeMappings(s.artifacts)}catch{return undefined}})()
 return [
  check('chapters',()=>{if(!s.selected.includes('body')){if(s.chapters.length||s.workingProse)throw Error('未选择正文却有章节内容');return '未导入正文'}assertWizardSessionChapters(s,sourceBody(s),w.structure!,w.chapterSelection!);return `${s.chapters.length} 章，逐字一致`}),
  check('scope',()=>{const bad=s.artifacts.find(a=>a.evidence.some(e=>!units.has(e.unitId))||a.sourceUnitIds.some(id=>!units.has(id)));if(bad)throw Error(`“${bad.name}”引用了未选范围的内容`);const chosen=new Set(Object.values(w.candidates).flat().filter(c=>c?.selected).map(c=>c!.id));const extra=s.artifacts.find(a=>a.schema===2&&['character','scene','item','world'].includes(a.kind)&&!chosen.has(a.id));if(extra)throw Error(`“${extra.name}”未被选中却已导入`);return '未选卷章与清单项没有出现在结果中'}),
  check('relationships',()=>{if(!mapping)throw Error('设定之间的引用无法解析');const ids=new Set(s.artifacts.map(a=>a.id));for(const a of s.artifacts.filter(a=>a.kind==='character'&&a.facts.relationships))for(const r of JSON.parse(a.facts.relationships) as {target:string;characterId?:string}[])if(r.characterId&&!ids.has(r.characterId))throw Error(`“${a.name}”的关系指向未导入的角色“${r.target}”`);return '关系全部可解析'}),
  check('worlds',()=>{const worlds=new Set(s.artifacts.filter(a=>a.kind==='world'&&a.facts.entityType==='WORLD').map(a=>a.id));const bad=s.artifacts.find(a=>a.kind==='world'&&a.facts.entityType==='SETTING'&&!worlds.has(a.facts.worldId));if(bad)throw Error(`“${bad.name}”没有归属到已导入的世界`);return '设定均归属到已导入的世界'}),
  check('lines',()=>{const events=new Set(s.artifacts.filter(a=>a.kind==='worldline').map(a=>a.id));for(const a of s.artifacts.filter(a=>a.kind==='narrative')){if(Number(a.facts.chapterIndex)>=s.chapters.length)throw Error(`“${a.name}”指向不存在的章节`);for(const r of JSON.parse(a.facts.refs??'[]') as {eventId:string}[])if(!events.has(r.eventId))throw Error(`“${a.name}”引用的事件不存在`)}return '讲述卡引用的事件均存在'}),
  check('outlines',()=>{if(!s.targets.includes('outline')||!s.infer)return `${s.chapters.length} / ${s.chapters.length} 章`;const mapped=validateDetailedOutlineAssignments(s,!partialOutlines);if(mapped.size<s.chapters.length)throw Error(`${mapped.size} / ${s.chapters.length} 章有细纲`);return `${s.chapters.length} / ${s.chapters.length} 章`}),
  check('touches',()=>{let n=0;for(const a of s.artifacts.filter(a=>a.kind==='foreshadow'&&a.schema===2))for(const t of JSON.parse(a.facts.touches??'[]') as {chapterIndex:number;content:{quote:string;start:number;end:number}}[]){const c=s.chapters[t.chapterIndex];const at=c&&resolveReferenceAnchor(c.content,{quote:t.content.quote});if(!at||at.start!==t.content.start)throw Error(`“${a.name}”的触点无法在正文中定位`);n++}return `${n} 个触点均可定位`}),
 ]
}
