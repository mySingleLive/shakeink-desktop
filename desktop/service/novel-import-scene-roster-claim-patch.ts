import {importHash} from '../core/novel-import'
import {assertSceneRosterAnchor,validateSceneRosterRecords} from '../core/novel-import-scene-identity'
import type {ImportUnit} from '../shared/novel-import'
import type {Anchor} from '../shared/novel-import-scene-identity'
import type {createSceneRosterRepairChoices} from './novel-import-scene-roster-repair-choices'
import {bindSceneRosterRepairDiagnostic,sceneRosterLiteralWindowReason,type SceneRosterRepairDiagnostic} from './novel-import-scene-roster-repair-diagnostic'

export type SceneRosterPatchRow={mentions:{literal:string;evidence:unknown}[];context:{label:string;evidence:unknown[]}[];links:{targetIndex:number;relation:string;evidence:unknown[]}[]}
export type SceneRosterPatchProof={mentions:{literal:string;evidence:Anchor}[];context:{label:string;evidence:Anchor}[];links:{targetIndex:number;relation:string;evidence:Anchor[]}[]}
export type SceneRosterPatchDecision={claimRef:string;disposition:'reject'}|{claimRef:string;disposition:'resolve';choiceRefs:string[]}
export type SceneRosterPatchClaim={claimRef:string;kind:'mention';index:number;literal:string;canReject:boolean}|{claimRef:string;kind:'context';index:number;evidenceIndex:number;label:string;canReject:true}|{claimRef:string;kind:'link';index:number;evidenceIndex:number;targetIndex:number;relation:string;canReject:true}
export type SceneRosterPatchDisplayClaim=SceneRosterPatchClaim&{eligibleChoiceRefs:string[]}
type Choices=ReturnType<typeof createSceneRosterRepairChoices>
type Position={kind:'mention';index:number}|{kind:'context'|'link';index:number;evidenceIndex:number}
type Part={anchor?:Anchor;claim?:SceneRosterPatchClaim}
type WithoutRef<T>=T extends unknown?Omit<T,'claimRef'>:never
const key=(value:unknown)=>JSON.stringify(value)
function fail(diagnostic?:SceneRosterRepairDiagnostic):never{const error=Error('场景清单绑定修复决定无效，请逐项解决当前未证资料');if(diagnostic)bindSceneRosterRepairDiagnostic(error,diagnostic);throw error}
const empty:SceneRosterPatchProof={mentions:[],context:[],links:[]}

/** Only a completely classified preferred three-array record can opt in.
 * The caller must first apply its original strict firstRecord shape parser.
 * A failed eligibility check leaves the existing replace protocol intact. */
export function prepareSceneRosterClaimPatch(input:{draftHash:string;slot:number;rowCount:number;row:SceneRosterPatchRow;proofs:readonly SceneRosterPatchProof[];units:readonly ImportUnit[];choices:Choices;resolveAnchor:(value:unknown)=>Anchor}){
 if(!Number.isSafeInteger(input.rowCount)||input.rowCount<1||input.slot<0||input.slot>=input.rowCount)return
 const row=structuredClone(input.row),proofs=structuredClone(input.proofs),units=structuredClone(input.units),byId=new Map(units.map(unit=>[unit.id,unit])),hashes=new Map(units.map(unit=>[unit.id,importHash(unit.text)])),proof=proofs[input.slot]??empty
 // The caller already proved the strict three-array shape. Without an old
 // mention owner, every source component remains an explicit model claim,
 // including a raw window which happens to be valid. Endpoints stay bound.
 const ownerless=proof.mentions.length===0
 const anchorKey=(anchor:Anchor)=>key([anchor.unitId,hashes.get(anchor.unitId),anchor.quote])
 const checked=(anchor:Anchor,literal?:string):Anchor=>{assertSceneRosterAnchor(anchor,units);if(literal!==undefined)validateSceneRosterRecords([{name:literal,aliases:[],mentions:[{literal,evidence:anchor}],context:[],links:[]}],units);return{...anchor}}
 const memberKey=(literal:string,anchor:Anchor)=>{checked(anchor,literal);const unit=byId.get(anchor.unitId)!;const start=unit.start+unit.text.indexOf(anchor.quote)+anchor.quote.indexOf(literal);return key([unit.id,hashes.get(unit.id),literal,start,start+literal.length])}
 const owners=proofs.map(proof=>[...new Set(proof.mentions.map(mention=>memberKey(mention.literal,mention.evidence)))].sort()),owner=key(owners[input.slot]??[]),oldMembers=new Set(owners.flat()),oldContexts=new Set<string>(),oldLinks=new Set<string>()
 const contextKey=(binding:string,label:string,anchor:Anchor)=>key([binding,label,anchorKey(anchor)])
 const linkKey=(slot:number,target:number,relation:string,anchors:readonly Anchor[])=>key([key(owners[slot]??[]),key(owners[target]??[]),relation,anchors.map(anchorKey).sort()])
 for(const [slot,p]of proofs.entries()){
  for(const context of p.context)oldContexts.add(contextKey(key(owners[slot]),context.label,context.evidence))
  for(const link of p.links)oldLinks.add(linkKey(slot,link.targetIndex,link.relation,link.evidence))
 }
 const claims:SceneRosterPatchClaim[]=[],positions=new Map<string,Position>(),mentionParts:Part[]=[],contextParts:Part[][]=[],linkParts:Part[][]=[],pending:Anchor[]=[],rejectOnlyLinks=new Set<number>()
 const claim=(position:Position,details:WithoutRef<SceneRosterPatchClaim>):SceneRosterPatchClaim=>{
  const claimRef='pc'+importHash(key(['scene-roster-claim-patch-v1',input.draftHash,input.slot,position])).slice(0,16)
  if(positions.has(claimRef))fail();positions.set(claimRef,position)
  const value={claimRef,...details} as SceneRosterPatchClaim;claims.push(value);return value
 }
 const resolveOriginal=(value:unknown,literal?:string)=>{try{return checked(input.resolveAnchor(value),literal)}catch{return undefined}}
 // Eligibility has no authority to discard a raw position or select a source.
 try{
  const rawMentions=new Set<string>(),groundedMembers=new Set<string>(),requiredMentions=new Map<string,{count:number;available:Set<string>}>()
  for(const [index,mention]of row.mentions.entries()){
   const rawKey=key(mention);if(rawMentions.has(rawKey))return;rawMentions.add(rawKey)
   const anchor=resolveOriginal(mention.evidence,mention.literal)
   if(anchor){const member=memberKey(mention.literal,anchor);if(groundedMembers.has(member))return;groundedMembers.add(member)
    if(!proof.mentions.some(value=>value.literal===mention.literal&&anchorKey(value.evidence)===anchorKey(anchor)))return
    mentionParts.push({anchor});pending.push(anchor)
   }else{
    const present=input.choices.hasSource(mention.literal),refs=input.choices.forLiteral(mention.literal)
    // Cross-unit-only presence or only already-owned occurrences is not a
    // source decision this patch protocol can safely make.
    if(present){const available=new Set(refs.map(ref=>memberKey(mention.literal,input.choices.resolve(ref,'mention',mention.literal))).filter(member=>!oldMembers.has(member))),required=requiredMentions.get(mention.literal)??{count:0,available};required.count++;requiredMentions.set(mention.literal,required);if(required.count>available.size)return}
    mentionParts.push({claim:claim({kind:'mention',index},{kind:'mention',index,literal:mention.literal,canReject:!present})})
   }
  }
  if((row.context.length||row.links.length)&&!(owners[input.slot]?.length)&&!ownerless)return
  const groups=new Set<string>()
  for(const [index,context]of row.context.entries()){
   const group=key(['context',context]);if(groups.has(group))return;groups.add(group)
   const seen=new Set<string>(),sourceKeys=new Set<string>(),parts:Part[]=[]
   for(const [evidenceIndex,value]of context.evidence.entries()){
    const rawKey=key(value);if(seen.has(rawKey))return;seen.add(rawKey)
    const anchor=resolveOriginal(value)
    if(anchor){const source=anchorKey(anchor);if(sourceKeys.has(source))return;sourceKeys.add(source)}
    if(anchor&&anchor.quote.includes(context.label)&&!ownerless){
     if(!proof.context.some(value=>value.label===context.label&&anchorKey(value.evidence)===anchorKey(anchor)))return
     parts.push({anchor});pending.push(anchor)
    }else parts.push({claim:claim({kind:'context',index,evidenceIndex},{kind:'context',index,evidenceIndex,label:context.label,canReject:true})})
   }
   contextParts.push(parts)
  }
  for(const [index,link]of row.links.entries()){
   const rejectOnly=link.targetIndex===input.slot||link.targetIndex>=input.rowCount
   if(rejectOnly)rejectOnlyLinks.add(index)
   const unbound=ownerless||!owners[link.targetIndex]?.length||rejectOnly
   const group=key(['link',link]);if(groups.has(group))return;groups.add(group)
   const seen=new Set<string>(),sourceKeys=new Set<string>(),parts:Part[]=[]
   for(const [evidenceIndex,value]of link.evidence.entries()){
    const rawKey=key(value);if(seen.has(rawKey))return;seen.add(rawKey)
    const anchor=resolveOriginal(value)
    if(anchor){const source=anchorKey(anchor);if(sourceKeys.has(source))return;sourceKeys.add(source)}
    // A valid source component is frozen without declaring the whole relation
    // proved. Its bound target/relation still face the complete final gates.
    if(anchor&&!unbound){parts.push({anchor});pending.push(anchor)}
    else parts.push({claim:claim({kind:'link',index,evidenceIndex},{kind:'link',index,evidenceIndex,targetIndex:link.targetIndex,relation:link.relation,canReject:true})})
   }
   linkParts.push(parts)
  }
  if(!claims.length)return
 }catch{return}
 // All original positions are classified before extending the same private
 // choice map with complete, proved component windows.
 for(const anchor of pending)input.choices.addAnchor(anchor,undefined,true)
 const select=(decisions:readonly SceneRosterPatchDecision[],expected:readonly SceneRosterPatchClaim[])=>{
   if(decisions.length!==expected.length)fail()
   const selected=new Map<string,Anchor[]>(),seen=new Set<string>(),newMembers=new Set<string>()
   for(const decision of decisions){
    const part=expected.find(claim=>claim.claimRef===decision.claimRef);if(!part||seen.has(decision.claimRef))fail();seen.add(decision.claimRef)
    if(decision.disposition==='reject'){if(!part.canReject)fail();selected.set(decision.claimRef,[]);continue}
    if(part.kind==='link'&&rejectOnlyLinks.has(part.index))fail({claimRef:part.claimRef,reason:'transaction'})
    if(!decision.choiceRefs.length||part.kind==='mention'&&decision.choiceRefs.length!==1||new Set(decision.choiceRefs).size!==decision.choiceRefs.length)fail()
    const anchors=decision.choiceRefs.map(ref=>{try{return input.choices.resolve(ref,part.kind,part.kind==='mention'?part.literal:undefined)}catch(error){if(part.kind==='mention')try{const anchor=input.choices.resolve(ref,'context'),reason=sceneRosterLiteralWindowReason(anchor.quote,part.literal);if(reason)bindSceneRosterRepairDiagnostic(error,{claimRef:part.claimRef,reason})}catch{/* Unknown references never become feedback. */}throw error}})
    for(const anchor of anchors){
     if(part.kind==='mention'){const member=memberKey(part.literal,anchor);if(oldMembers.has(member)||newMembers.has(member))fail({claimRef:part.claimRef,reason:oldMembers.has(member)?'old-mention':'new-mention-duplicate'});newMembers.add(member)}
     if(part.kind==='context'){
      if(!anchor.quote.includes(part.label))fail({claimRef:part.claimRef,reason:'context-window-missing'})
      // Exact existing owner/context facts cannot masquerade as a new claim,
      // including the same old fact borrowed from another original owner.
      for(const binding of owners)if(oldContexts.has(contextKey(key(binding),part.label,anchor)))fail({claimRef:part.claimRef,reason:'old-context'})
     }
    }
    selected.set(decision.claimRef,anchors)
   }
   return selected
 }
 const groupEvidence=(kind:'context'|'link',index:number,selected:ReadonlyMap<string,Anchor[]>)=>{
  const parts=(kind==='context'?contextParts:linkParts)[index],expand=(part:Part):Anchor[]=>part.anchor?[{...part.anchor}]:selected.get(part.claim!.claimRef)!.map(anchor=>({...anchor})),evidence=parts.flatMap(expand)
  if(new Set(evidence.map(anchorKey)).size!==evidence.length){const part=parts.find(part=>part.claim&&expand(part).some(anchor=>evidence.filter(value=>anchorKey(value)===anchorKey(anchor)).length>1));fail(part?.claim?{claimRef:part.claim.claimRef,reason:'group-window-duplicate'}:undefined)}
  if(kind==='link'){
   const value=row.links[index]
   if(parts.some(part=>part.claim&&selected.get(part.claim.claimRef)!.length)&&evidence.length){
    const proposed=linkKey(input.slot,value.targetIndex,value.relation,evidence)
    if(oldLinks.has(proposed))fail()
    for(const [slot,p]of proofs.entries())for(const link of p.links)if(link.relation===value.relation&&key(link.evidence.map(anchorKey).sort())===key(evidence.map(anchorKey).sort())&&linkKey(slot,link.targetIndex,link.relation,link.evidence)!==proposed)fail()
   }
  }
  return evidence
 }
 const data=claims.map(claim=>({...claim}))
 return{
  data,
  displayClaims():SceneRosterPatchDisplayClaim[]{
   // The caller invokes this after every row and whole-unit window has joined
   // the complete directory. It neither chooses sources nor changes apply.
   return Object.freeze(claims.map(part=>Object.freeze({...part,eligibleChoiceRefs:Object.freeze(input.choices.compactEntries().flatMap(choice=>{
    try{
     if(part.kind==='link'&&rejectOnlyLinks.has(part.index))return[]
     const anchor=input.choices.resolve(choice.choiceRef,part.kind,part.kind==='mention'?part.literal:undefined)
     if(part.kind==='mention'&&oldMembers.has(memberKey(part.literal,anchor)))return[]
     if(part.kind==='context'&&(!anchor.quote.includes(part.label)||owners.some(binding=>oldContexts.has(contextKey(key(binding),part.label,anchor)))))return[]
     const base=part.kind==='context'?contextParts[part.index]:part.kind==='link'?linkParts[part.index]:[]
     if(base.some(value=>value.anchor&&anchorKey(value.anchor)===anchorKey(anchor)))return[]
     return[choice.choiceRef]
    }catch{return[]}
   })) as unknown as string[]}))) as unknown as SceneRosterPatchDisplayClaim[]
  },
  boundGroups(){
   const groups:{claimRefs:string[];validate:(decisions:readonly SceneRosterPatchDecision[])=>void}[]=[]
   const mentions=new Map<string,Extract<SceneRosterPatchClaim,{kind:'mention'}>[]>()
   for(const part of claims)if(part.kind==='mention'){const expected=mentions.get(part.literal)??[];expected.push(part);mentions.set(part.literal,expected)}
   for(const expected of mentions.values())groups.push({claimRefs:expected.map(part=>part.claimRef),validate:decisions=>{select(decisions,expected)}})
   for(const kind of ['context','link'] as const)for(const [index,parts]of (kind==='context'?contextParts:linkParts).entries()){
    const expected=parts.flatMap(part=>part.claim?[part.claim]:[])
    if(expected.length)groups.push({claimRefs:expected.map(part=>part.claimRef),validate:decisions=>{groupEvidence(kind,index,select(decisions,expected))}})
   }
   return groups
  },
  apply(decisions:readonly SceneRosterPatchDecision[]):SceneRosterPatchRow{
   const selected=select(decisions,claims),expand=(part:Part):Anchor[]=>part.anchor?[{...part.anchor}]:selected.get(part.claim!.claimRef)!.map(anchor=>({...anchor}))
   const mentions=row.mentions.flatMap((mention,index)=>expand(mentionParts[index]).map(evidence=>({literal:mention.literal,evidence})))
   const context=row.context.flatMap((value,index)=>{const evidence=groupEvidence('context',index,selected);return evidence.length?[{label:value.label,evidence}]:[]})
   const links=row.links.flatMap((value,index)=>{const evidence=groupEvidence('link',index,selected);return evidence.length?[{targetIndex:value.targetIndex,relation:value.relation,evidence}]:[]})
   if(!mentions.length)fail()
   return{mentions,context,links}
  }
 }
}

/** Two new claims may select the same previously unowned occurrence. They
 * cannot use that shared occurrence to join separate frozen source owners. */
export function assertSceneRosterPatchOwners(rows:readonly Pick<SceneRosterPatchRow,'mentions'>[],proofs:readonly SceneRosterPatchProof[],units:readonly ImportUnit[],resolveAnchor:(value:unknown)=>Anchor):void{
 const byId=new Map(units.map(unit=>[unit.id,unit])),hashes=new Map(units.map(unit=>[unit.id,importHash(unit.text)]))
 const member=(literal:string,anchor:Anchor)=>{validateSceneRosterRecords([{name:literal,aliases:[],mentions:[{literal,evidence:anchor}],context:[],links:[]}],units);const unit=byId.get(anchor.unitId)!;const start=unit.start+unit.text.indexOf(anchor.quote)+anchor.quote.indexOf(literal);return key([unit.id,hashes.get(unit.id),literal,start,start+literal.length])}
 const graph=()=>{
  const parents=new Map<string,string>(),find=(value:string):string=>{if(!parents.has(value))parents.set(value,value);let root=value;while(parents.get(root)!==root)root=parents.get(root)!;parents.set(value,root);return root}
  return{find,join(values:readonly string[]){for(const value of values){const left=find(values[0]),right=find(value);if(left!==right)parents.set(right,left)}}}
 }
 const original=graph(),current=graph(),protectedMembers=proofs.flatMap(proof=>{const values=proof.mentions.map(mention=>member(mention.literal,mention.evidence));original.join(values);return values})
 for(const row of rows)current.join(row.mentions.map(mention=>member(mention.literal,resolveAnchor(mention.evidence))))
 const owners=new Map<string,string>()
 for(const value of protectedMembers){const now=current.find(value),before=original.find(value),prior=owners.get(now);if(prior!==undefined&&prior!==before)fail();owners.set(now,before)}
}
