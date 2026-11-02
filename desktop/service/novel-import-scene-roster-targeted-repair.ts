import {importHash} from '../core/novel-import'
import {createSceneRosterBoundDecisions,type BoundPreview} from './novel-import-scene-roster-bound-decisions'
import type {ImportUnit} from '../shared/novel-import'
import type {Anchor,SceneMentionRecord} from '../shared/novel-import-scene-identity'
import type {SceneRosterFragmentTable} from '../core/novel-import-scene-roster-fragments'
import {createSceneRosterRepairChoices} from './novel-import-scene-roster-repair-choices'
import {prepareSceneRosterClaimPatch,assertSceneRosterPatchOwners,type SceneRosterPatchRow,type SceneRosterPatchDisplayClaim,type SceneRosterPatchDecision} from './novel-import-scene-roster-claim-patch'
import {bindSceneRosterRepairDiagnostic,sceneRosterRepairDiagnostic,sceneRosterLiteralWindowReason} from './novel-import-scene-roster-repair-diagnostic'

type Proof={mentions:{literal:string;evidence:Anchor}[];context:{label:string;evidence:Anchor}[];links:{targetIndex:number;relation:string;evidence:Anchor[]}[]}
type WireRow={mentions:{literal:string;evidence:unknown}[];context:unknown[];links:{targetIndex:number;relation:string;evidence:unknown[]}[]}
export interface SceneRosterTargetedPlan {rows:{repairRef:string;slot:number;canReject:boolean;requiredSpellings:string[];candidates:{literal:string;choiceRefs:string[]}[];keep:{mentions:{literal:string;choiceRef:string}[];context:{label:string;choiceRef:string}[];links:{targetIndex:number;relation:string;choiceRefs:string[]}[]};patch?:{claims:SceneRosterPatchDisplayClaim[]}}[];choices:ReturnType<ReturnType<typeof createSceneRosterRepairChoices>['compactEntries']>}
export type SceneRosterTargetedReply={repairRef:string;disposition:'reject'}|{repairRef:string;disposition:'replace';replacement:WireRow}|{repairRef:string;disposition:'patch';patch:{claims:SceneRosterPatchDecision[]}}
function freeze<T>(value:T):T{if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))freeze(child);Object.freeze(value)}return value}
function spellings(raw:unknown):string[]{if(!raw||typeof raw!=='object'||Array.isArray(raw))return[];const row=raw as Record<string,unknown>,values:unknown[]=[row.name,...Array.isArray(row.aliases)?row.aliases:[],...Array.isArray(row.mentions)?row.mentions.map(value=>value&&typeof value==='object'?'literal'in value?value.literal:undefined:undefined):[]];return[...new Set(values.filter((value):value is string=>typeof value==='string'&&!!value.trim()&&value.isWellFormed()))]}
function fail():never{throw Error('场景清单定点修复事务无效，请完整修复指定记录并保留已核实资料')}
/** A transaction never mutates or partially adopts this original draft. */
export function createSceneRosterTargetedRepair(input:{draft:readonly unknown[];units:readonly ImportUnit[];table:SceneRosterFragmentTable;proofs:readonly Proof[];validate:(row:unknown,slot:number)=>SceneMentionRecord;patch?:{binding:string;read:(row:unknown)=>SceneRosterPatchRow|undefined;resolveAnchor:(value:unknown)=>Anchor}}){
 const draft=freeze(structuredClone(input.draft)),choices=createSceneRosterRepairChoices(input.units,input.table),bad:number[]=[],primaryRejectOnly:number[]=[]
 for(const [slot,row]of draft.entries())try{input.validate(row,slot)}catch{bad.push(slot)}
 if(!bad.length)throw Error('场景清单错误无法定位到可修复记录，请重新识别')
 const draftHash=importHash(JSON.stringify({version:1,draft,units:input.units.map(unit=>({id:unit.id,fileId:unit.fileId,start:unit.start,end:unit.end,textHash:importHash(unit.text)}))})),refs=new Map<string,number>(),patches=new Map<number,NonNullable<ReturnType<typeof prepareSceneRosterClaimPatch>>>()
 const rows:SceneRosterTargetedPlan['rows']=bad.map(slot=>{
  const repairRef='rr'+importHash(JSON.stringify(['scene-roster-row-repair-v1',draftHash,slot])).slice(0,16);if(refs.has(repairRef))fail();refs.set(repairRef,slot)
  const proof=input.proofs[slot]??{mentions:[],context:[],links:[]},claimed=spellings(draft[slot]),present=claimed.filter(literal=>choices.hasSource(literal)),requiredSpellings=proof.mentions.length?[]:present
  const row={repairRef,slot,canReject:!proof.mentions.length&&!present.length,requiredSpellings,candidates:claimed.map(literal=>({literal,choiceRefs:choices.forLiteral(literal)})),keep:{mentions:proof.mentions.map(mention=>({literal:mention.literal,choiceRef:choices.addAnchor(mention.evidence,mention.literal,true)})),context:proof.context.map(context=>({label:context.label,choiceRef:choices.addAnchor(context.evidence,undefined,true)})),links:proof.links.map(link=>({targetIndex:link.targetIndex,relation:link.relation,choiceRefs:link.evidence.map(anchor=>choices.addAnchor(anchor,undefined,true))}))}}
  const preferred=input.patch?.read(draft[slot]),patch=preferred&&prepareSceneRosterClaimPatch({draftHash:importHash(JSON.stringify([draftHash,input.patch!.binding])),slot,rowCount:draft.length,row:preferred,proofs:input.proofs,units:input.units,choices,resolveAnchor:input.patch!.resolveAnchor})
  if(patch){patches.set(slot,patch);const raw=draft[slot];if(row.canReject&&claimed.length&&!present.length&&!proof.mentions.length&&!proof.context.length&&!proof.links.length&&raw&&typeof raw==='object'&&!Array.isArray(raw)&&Object.keys(raw).length===3&&Object.keys(raw).every(key=>['mentions','context','links'].includes(key)))primaryRejectOnly.push(slot);return{...row,patch:{claims:[]}}}return row
 })
 choices.wholeUnits()
 for(const row of rows)if(row.patch)row.patch.claims=patches.get(row.slot)!.displayClaims()
 const data:SceneRosterTargetedPlan=freeze({rows,choices:choices.compactEntries()})
 let bound=createSceneRosterBoundDecisions({plan:data,draft,groups:slot=>patches.get(slot)?.boundGroups(),strategy:'joint-groups',primaryRejectOnly})
 return{
  data,get bound(){return bound},previewNext(){return bound.previewNext()},commit(preview:BoundPreview){bound=bound.commit(preview);return bound},discard(preview:BoundPreview){bound.discard(preview)},preferReplacement(){const next=bound.next();if(!next)return false;bound=next;return true},
  resolve(ref:string,use:'mention'|'context'|'link',literal?:string,location?:{repairRef:string;index:number}){try{return choices.resolve(ref,use,literal)}catch(error){if(use==='mention'&&literal!==undefined&&location&&refs.has(location.repairRef))try{const anchor=choices.resolve(ref,'context'),reason=sceneRosterLiteralWindowReason(anchor.quote,literal);if(reason)bindSceneRosterRepairDiagnostic(error,{repairRef:location.repairRef,field:'mentions',index:location.index,reason})}catch{/* Unknown references are not diagnostic data. */}throw error}},
  feedback(error:unknown):string|undefined{
   const detail=sceneRosterRepairDiagnostic(error);if(!detail)return
   const owner=detail.claimRef?rows.find(row=>row.patch?.claims.some(claim=>claim.claimRef===detail.claimRef)):detail.repairRef&&refs.has(detail.repairRef)?rows.find(row=>row.repairRef===detail.repairRef):undefined
   if(!owner)return
   return('修复定位 repairRef='+owner.repairRef+(detail.claimRef?' claimRef='+detail.claimRef:detail.field==='mentions'&&detail.index!==undefined?' field=mentions index='+detail.index:'')+' reason='+detail.reason+'。只修复当前项，核对其候选并满足全部联合规则。').slice(0,250)
  },
  apply(repairs:readonly SceneRosterTargetedReply[]):{roster:unknown[]}{
   if(repairs.length!==rows.length)fail()
   const seen=new Set<string>(),replacements=new Map<number,WireRow>(),rejected=new Set<number>()
   for(const repair of repairs){
    const slot=refs.get(repair.repairRef),row=rows.find(row=>row.repairRef===repair.repairRef)
    if(slot===undefined||!row||seen.has(repair.repairRef))fail();seen.add(repair.repairRef)
    if(repair.disposition==='reject'){if(!row.canReject)fail();rejected.add(slot)}
    else if(repair.disposition==='patch'){const patch=patches.get(slot);if(!patch)fail();replacements.set(slot,patch.apply(repair.patch.claims))}
    else{if(!repair.replacement.mentions.length||row.requiredSpellings.some(literal=>!repair.replacement.mentions.some(mention=>mention.literal===literal)))fail();replacements.set(slot,repair.replacement)}
   }
   const kept=draft.map((_,slot)=>slot).filter(slot=>!rejected.has(slot)),indexes=new Map(kept.map((slot,index)=>[slot,index])),roster=kept.map(slot=>structuredClone(replacements.get(slot)??draft[slot]) as WireRow)
   for(const row of roster)for(const link of row.links){const target=indexes.get(link.targetIndex);if(target===undefined)fail();link.targetIndex=target}
   if(repairs.some(repair=>repair.disposition==='patch'))assertSceneRosterPatchOwners(roster,input.proofs,input.units,input.patch!.resolveAnchor)
   return{roster}
  }
 }
}
