import {isDeepStrictEqual,types} from 'node:util'
import {assertSceneRosterAnchor,validateSceneRosterRecords} from '../core/novel-import-scene-identity'
import {importHash} from '../core/novel-import'
import {createSceneRosterFragmentTable} from '../core/novel-import-scene-roster-fragments'
import {createSceneRosterRepairChoices} from './novel-import-scene-roster-repair-choices'
import {sceneAnchorSchema} from '../shared/novel-import-scene-identity'
import type {BoundDeck} from './novel-import-scene-roster-bound-decisions'
import type {SceneRosterTargetedPlan} from './novel-import-scene-roster-targeted-repair'
import type {ImportUnit} from '../shared/novel-import'
export type SceneRosterControlFocusInput={plan:SceneRosterTargetedPlan;bound:Pick<BoundDeck,'data'|'diagnostic'>;units:readonly ImportUnit[];error:unknown}
export const SCENE_ROSTER_CONTROL_FOCUS_MAX_BYTES=16384
const invalid=():never=>{throw Error('SCENE_ROSTER_CONTROL_FOCUS_INVALID')}
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||types.isProxy(value)||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))return invalid();for(const key of Reflect.ownKeys(value))if(typeof key!=='string'||!('value'in Object.getOwnPropertyDescriptor(value,key)!))return invalid();return value as Record<string,unknown>}
function array(value:unknown):unknown[]{if(!Array.isArray(value)||types.isProxy(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length>50000)return invalid();if(Reflect.ownKeys(value).length!==value.length+1)return invalid();for(let index=0;index<value.length;index++)if(!('value'in(Object.getOwnPropertyDescriptor(value,String(index))??{})))return invalid();return value}
const integer=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0
const text=(value:unknown):value is string=>typeof value==='string'&&!!value.trim()&&value.length<=300&&value.isWellFormed()
const encode=(value:unknown)=>'\n\n<scene-roster-control-focus>'+JSON.stringify(value).replace(/</gu,'\\u003c').replace(/>/gu,'\\u003e').replace(/&/gu,'\\u0026')+'</scene-roster-control-focus>'
type MentionMapping={literal:string;unitIndex:number;absoluteStart:number;absoluteEnd:number;sharedChoices:number[]}
/** Called synchronously by the current refusal catch with its real deck and
 * Error. It reads the original diagnostic authority; model fields/messages
 * never become addresses. The returned string is a detached, optional snapshot. */
export function createSceneRosterControlFocus(input:SceneRosterControlFocusInput):string|undefined{
 try{
  const diagnostic=input.bound.diagnostic(input.error);if(!diagnostic)return
  const tasks=array(input.bound.data.tasks),choices=array(input.plan.choices),units=array(input.units)
  if(!isDeepStrictEqual(input.bound.data.choices,choices)||!integer(diagnostic.taskNumber)||diagnostic.taskNumber<1||diagnostic.taskNumber>tasks.length)return
  const task=object(tasks[diagnostic.taskNumber-1]);if(task.kind!=='claims'||!integer(task.slot))return
  const indexes=array(task.claimIndexes),domains=array(task.domains);if(!indexes.length||indexes.length!==domains.length||new Set(indexes).size!==indexes.length||!integer(diagnostic.localClaimNumber)||diagnostic.localClaimNumber<1||diagnostic.localClaimNumber>indexes.length)return
  const rows=input.plan.rows.filter(row=>row.slot===task.slot);if(rows.length!==1||!rows[0].patch)return
  const originalClaims=array(rows[0].patch.claims),references=new Map<string,number>()
  choices.forEach((value,index)=>{const choice=object(value);if(typeof choice.choiceRef!=='string'||!/^cf[0-9a-f]{16}$/u.test(choice.choiceRef)||references.has(choice.choiceRef))return invalid();references.set(choice.choiceRef,index+1)})
  const claims:(Record<string,unknown>&{localClaimNumber:number;claimIndex:number;allowedSharedChoices:number[]})[]=indexes.map((index,local)=>{
   if(!integer(index)||index>=originalClaims.length)return invalid();const claim=object(originalClaims[index]),domain=object(domains[local]),common=['claimRef','kind','index','canReject','eligibleChoiceRefs'],specific=claim.kind==='mention'?['literal']:claim.kind==='context'?['evidenceIndex','label']:claim.kind==='link'?['evidenceIndex','targetIndex','relation']:invalid(),fields=[...common,...specific]
   if(Reflect.ownKeys(claim).length!==fields.length||fields.some(key=>!Object.hasOwn(claim,key))||typeof claim.claimRef!=='string'||!/^pc[0-9a-f]{16}$/u.test(claim.claimRef)||!integer(claim.index)||typeof claim.canReject!=='boolean')return invalid()
   if(claim.kind==='mention'){if(!text(claim.literal))return invalid()}else{if(claim.canReject!==true||!integer(claim.evidenceIndex))return invalid();if(claim.kind==='context'){if(!text(claim.label))return invalid()}else if(!integer(claim.targetIndex)||!['same-place','different-place','parent'].includes(claim.relation as string))return invalid()}
   const allowed=array(claim.eligibleChoiceRefs).map(ref=>{if(typeof ref!=='string'||!references.has(ref))return invalid();return references.get(ref)!})
   if(new Set(allowed).size!==allowed.length||!allowed.length&&!claim.canReject||!isDeepStrictEqual(domain,{kind:claim.kind,canReject:claim.canReject,choices:allowed}))return invalid()
   const {eligibleChoiceRefs:_,...metadata}=claim
   return{localClaimNumber:local+1,claimIndex:index,...metadata,allowedSharedChoices:allowed}
  })
  const value:{[key:string]:unknown}={notice:'只读的当前完整失败任务解释，不是新任务、已接受结果或自动决定。allowedSharedChoices的每个数是原完整choices目录的共享号元素，不是列表位置；其它任务仍须完整回答。原域和联合门保持，不据此代选来源、转号、排序、去重答案或删claim。',taskNumber:diagnostic.taskNumber,slot:task.slot,kind:'claims',failedLocalClaimNumber:diagnostic.localClaimNumber,reason:diagnostic.reason,claimIndexes:[...indexes],claims}
  if(Buffer.byteLength(encode(value),'utf8')>SCENE_ROSTER_CONTROL_FOCUS_MAX_BYTES)return
  let verifier:ReturnType<typeof createSceneRosterRepairChoices>|undefined
  const anchors=new Map<number,{unit:ImportUnit;unitIndex:number;quote:string;start:number}>(),verifiedMentions=new Set<string>()
  const source=(number:number)=>{const cached=anchors.get(number);if(cached)return cached;const choice=object(choices[number-1]);if(!integer(choice.unitIndex)||choice.unitIndex>=units.length||!integer(choice.start)||!integer(choice.end)||choice.end<=choice.start)return invalid();const unit=object(units[choice.unitIndex]) as unknown as ImportUnit;if(typeof unit.text!=='string'||choice.end>unit.text.length)return invalid();const anchor=sceneAnchorSchema.parse({unitId:unit.id,quote:unit.text.slice(choice.start,choice.end)});assertSceneRosterAnchor(anchor,input.units);if(unit.text.indexOf(anchor.quote)!==choice.start)return invalid();verifier??=createSceneRosterRepairChoices(input.units,createSceneRosterFragmentTable(input.units));if(verifier.addAnchor(anchor)!==choice.choiceRef)return invalid();const result={unit,unitIndex:choice.unitIndex,quote:anchor.quote,start:choice.start};anchors.set(number,result);return result}
  const expanded:{literal:string;unitId:string;unitHash:string;absoluteStart:number;absoluteEnd:number;candidates:{localClaimNumber:number;sharedChoice:number}[]}[]=[],groups=new Map<string,number>()
  for(const claim of claims)for(const number of claim.allowedSharedChoices){const window=source(number)
   if(claim.kind==='context'&&!window.quote.includes(claim.label as string))return
   if(claim.kind!=='mention')continue
   const literal=claim.literal as string,key=JSON.stringify([number,literal]);if(!verifiedMentions.has(key)){validateSceneRosterRecords([{name:literal,aliases:[],mentions:[{literal,evidence:{unitId:window.unit.id,quote:window.quote}}],context:[],links:[]}],input.units);verifiedMentions.add(key)}
   if(diagnostic.reason!=='new-mention-duplicate')continue
   const absoluteStart=window.unit.start+window.start+window.quote.indexOf(literal),absoluteEnd=absoluteStart+literal.length,unitHash=importHash(window.unit.text),identity=JSON.stringify([literal,window.unit.id,unitHash,absoluteStart,absoluteEnd]);let index=groups.get(identity)
   if(index===undefined){index=expanded.length;groups.set(identity,index);expanded.push({literal,unitId:window.unit.id,unitHash,absoluteStart,absoluteEnd,candidates:[]})}
   expanded[index].candidates.push({localClaimNumber:claim.localClaimNumber,sharedChoice:number})
  }
  if(diagnostic.reason==='new-mention-duplicate'){
   const compact:MentionMapping[]=expanded.map(group=>{const sharedChoices=[...new Set(group.candidates.map(c=>c.sharedChoice))],unitIndex=source(sharedChoices[0]).unitIndex;if(!sharedChoices.every(number=>source(number).unitIndex===unitIndex))return invalid();return{literal:group.literal,unitIndex,absoluteStart:group.absoluteStart,absoluteEnd:group.absoluteEnd,sharedChoices}})
   // Reconstruct every original occurrence/candidate pair in claim/domain
   // order. Shared display identity never changes a domain or an answer.
   const restored=compact.map(group=>({...group,unitId:(units[group.unitIndex] as ImportUnit).id,unitHash:importHash((units[group.unitIndex] as ImportUnit).text),candidates:[] as {localClaimNumber:number;sharedChoice:number}[]}))
   for(const claim of claims)if(claim.kind==='mention')for(const number of claim.allowedSharedChoices){const matches=compact.flatMap((group,index)=>group.literal===claim.literal&&group.unitIndex===source(number).unitIndex&&group.sharedChoices.includes(number)?[index]:[]);if(matches.length!==1)return invalid();restored[matches[0]].candidates.push({localClaimNumber:claim.localClaimNumber,sharedChoice:number})}
   if(!isDeepStrictEqual(restored.map(({unitIndex:_,sharedChoices:__,...group})=>group),expanded))return
   value.mentionOccurrenceGroups=compact
   value.occurrenceNotice='共享表只解释同一原文occurrence，不表示不同CF窗口可互换。逐mention原完整allowedSharedChoices按literal和共享号查表，从不变units还原单位id/hash；原引用顺序与次数全部保留，不删候选、不分配决定或自动去重。'
  }
  const result=encode(value);return Buffer.byteLength(result,'utf8')<=SCENE_ROSTER_CONTROL_FOCUS_MAX_BYTES?result:undefined
 }catch{/* Optional explanation must never replace the original refusal. */return undefined}
}
