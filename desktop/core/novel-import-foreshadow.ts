import {resolveReferenceAnchor} from '../../src/lib/foreshadow-reference'

/** Foreshadow touches proposed by the model, before any reference is trusted. */
export interface WizardTouchInput {kind:'PLANT'|'MENTION'|'PAYOFF';chapterIndex:number;summary:string;quote:string;eventId?:string;narrativeId?:string}
export interface WizardForeshadowInput {id:string;title:string;content:string;touches:WizardTouchInput[]}
export interface WizardNarrativeRef {id:string;chapterIndex:number;eventIds:string[]}
export interface WizardTouchContext {
 chapters:{content:string;outline?:string}[]
 eventIds:ReadonlySet<string>
 narratives:ReadonlyMap<string,WizardNarrativeRef>
 /** Existing materialRefs counts per planning event/telling id, to respect the 40-per-item schema limit. */
 existingRefs?:ReadonlyMap<string,number>
}
export type WizardMaterialRole='plant'|'mention'|'payoff'
export interface PlannedTouch {
 kind:WizardTouchInput['kind'];chapterIndex:number;summary:string
 content:{quote:string;start:number;end:number}
 outline:{quote:string|null}
 eventId?:string;narrativeId?:string
}
export interface PlannedMaterialRef {target:'event'|'telling';targetId:string;foreshadowId:string;role:WizardMaterialRole;note:string}
export interface PlannedForeshadow {id:string;title:string;content:string;status:'PLANNED'|'PLANTED'|'RESOLVED';touches:PlannedTouch[]}
export interface WizardDropped {kind:'touch'|'materialRef';label:string;reason:string}

export const MATERIAL_REFS_MAX=40,MATERIAL_NOTE_MAX=500
const ROLE:Record<WizardTouchInput['kind'],WizardMaterialRole>={PLANT:'plant',MENTION:'mention',PAYOFF:'payoff'}

/** Decide which touches and planning links can be written. Every link that would violate
 * src/lib/planning/domain.ts or material-reference.ts is dropped and reported, never guessed. */
export function planForeshadowTouches(items:readonly WizardForeshadowInput[],context:WizardTouchContext){
 const foreshadows:PlannedForeshadow[]=[],refs:PlannedMaterialRef[]=[],dropped:WizardDropped[]=[]
 const counts=new Map(context.existingRefs??[])
 const add=(ref:PlannedMaterialRef,label:string)=>{const n=counts.get(ref.targetId)??0;if(n>=MATERIAL_REFS_MAX){dropped.push({kind:'materialRef',label,reason:'关联条目超过 40 条上限'});return false}counts.set(ref.targetId,n+1);refs.push(ref);return true}
 for(const item of items){
  const touches:PlannedTouch[]=[]
  for(const [n,touch] of item.touches.entries()){
   const label=`${item.title} · 触点 ${n+1}`,chapter=context.chapters[touch.chapterIndex]
   if(!Number.isSafeInteger(touch.chapterIndex)||!chapter){dropped.push({kind:'touch',label,reason:'章节不在所选范围'});continue}
   const anchor=touch.quote?resolveReferenceAnchor(chapter.content,{quote:touch.quote}):null
   if(!anchor||chapter.content.indexOf(touch.quote)!==chapter.content.lastIndexOf(touch.quote)){dropped.push({kind:'touch',label,reason:'原文引文无法唯一定位'});continue}
   const eventId=touch.eventId&&context.eventIds.has(touch.eventId)?touch.eventId:undefined
   const outlineQuote=chapter.outline&&touch.summary&&chapter.outline.indexOf(touch.summary)>=0&&chapter.outline.indexOf(touch.summary)===chapter.outline.lastIndexOf(touch.summary)?touch.summary:null
   touches.push({kind:touch.kind,chapterIndex:touch.chapterIndex,summary:touch.summary.slice(0,200),content:{quote:touch.quote,start:anchor.start,end:anchor.end},outline:{quote:outlineQuote},...(eventId?{eventId}:{}),...(touch.narrativeId?{narrativeId:touch.narrativeId}:{})})
   const note=(touch.summary.trim()||item.title).slice(0,MATERIAL_NOTE_MAX),role=ROLE[touch.kind]
   const eventLinked=eventId?add({target:'event',targetId:eventId,foreshadowId:item.id,role,note},label):false
   if(!touch.narrativeId)continue
   const narrative=context.narratives.get(touch.narrativeId)
   // A telling may carry a plant only when one of its referenced events carries the same plant.
   if(!narrative||narrative.chapterIndex!==touch.chapterIndex){dropped.push({kind:'materialRef',label,reason:'讲述不属于该章节'});continue}
   if(!eventId||!narrative.eventIds.includes(eventId)){dropped.push({kind:'materialRef',label,reason:'讲述未引用对应世界事件'});continue}
   if(role==='plant'&&!eventLinked){dropped.push({kind:'materialRef',label,reason:'世界事件未记录首次埋入'});continue}
   add({target:'telling',targetId:narrative.id,foreshadowId:item.id,role,note},label)
  }
  const status=touches.some(t=>t.kind==='PAYOFF')?'RESOLVED':touches.length?'PLANTED':'PLANNED'
  foreshadows.push({id:item.id,title:item.title,content:item.content,status,touches})
 }
 return {foreshadows,refs,dropped}
}
