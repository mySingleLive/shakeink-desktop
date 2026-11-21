import {importHash} from '../core/novel-import'
import {validateSceneRosterRecords} from '../core/novel-import-scene-identity'
import type {Anchor,SceneMentionRecord} from '../shared/novel-import-scene-identity'
import type {ImportUnit} from '../shared/novel-import'

export const SCENE_ROSTER_PRIOR_OPEN='<previous-scene-roster-output>'
export const SCENE_ROSTER_PRIOR_CLOSE='</previous-scene-roster-output>'
export function sceneRosterPriorData(text:string):string{
 let previous:{format:'json'|'text';value:unknown}
 try{previous={format:'json',value:JSON.parse(text)}}catch{previous={format:'text',value:text}}
 // Values remain complete JSON data; a model-created closing tag cannot
 // terminate the application-owned untrusted-data frame.
 return SCENE_ROSTER_PRIOR_OPEN+JSON.stringify(previous).replace(/</gu,'\\u003c').replace(/>/gu,'\\u003e')+SCENE_ROSTER_PRIOR_CLOSE
}
export interface SceneRosterRetentionRow {
 name?:string;aliases?:readonly string[]
 mentions:readonly {literal:string;evidence:unknown}[]
 context:readonly {label:string;evidence:readonly unknown[]}[]
 links:readonly {targetIndex:number;relation:'same-place'|'different-place'|'parent';evidence:readonly unknown[]}[]
}
export interface SceneRosterRetentionProofRow {
 readonly mentions:readonly {readonly literal:string;readonly evidence:Readonly<Anchor>}[]
 readonly context:readonly {readonly label:string;readonly evidence:readonly Readonly<Anchor>[]}[]
 readonly links:readonly {readonly targetIndex:number;readonly relation:SceneRosterRetentionRow['links'][number]['relation'];readonly evidence:readonly Readonly<Anchor>[]}[]
}
export interface RetentionIssue {
 readonly kind:'missing-mention-atom'|'missing-owner'|'new-owner-projection'|'missing-context'|'missing-link'
 readonly ownerKey?:string
 readonly originalRowIndex?:number
 /** Index in the corresponding independently verified proof array, not raw model input. */
 readonly proofIndex?:number
 readonly currentRowIndexes:readonly number[]
 readonly targetOwnerKey?:string
}
export interface SceneRosterRetentionDiagnostic {
 readonly owners:readonly {readonly ownerKey:string;readonly originalRowIndexes:readonly number[];readonly rows:readonly {readonly originalRowIndex:number;readonly proof:SceneRosterRetentionProofRow}[]}[]
 readonly currentRows:readonly {readonly currentRowIndex:number;readonly oldMemberKeys:readonly string[];readonly matchingOwnerKeys:readonly string[]}[]
 readonly issues:readonly RetentionIssue[]
}
type Mention={key:string;atom:string;literal:string;evidence:Anchor}
type Row={members:Set<string>;mentions:Mention[];contexts:{label:string;anchor:string;evidence:Anchor}[];links:{target:number;relation:string;anchors:Set<string>;evidence:Anchor[]}[]}
type Facts={rows:Row[];atoms:Set<string>;universe:Set<string>;owners:Set<string>}
const key=(...values:unknown[])=>importHash(JSON.stringify(values))
const setKey=(values:Iterable<string>)=>JSON.stringify([...values].sort())
/** These probes produce only preservation keys. They never assemble a result
 * or relax the complete generation/canonical/owner validation gates. */
export function createSceneRosterRetention(units:readonly ImportUnit[]){
 const byId=new Map(units.map(unit=>[unit.id,unit])),hashes=new Map(units.map(unit=>[unit.id,importHash(unit.text)]));let first:Facts|undefined
 const minimal=(mention:Mention):SceneMentionRecord=>({name:mention.literal,aliases:[],mentions:[{literal:mention.literal,evidence:mention.evidence}],context:[],links:[]})
 const anchorKey=(anchor:Anchor)=>{const unit=byId.get(anchor.unitId)!;const start=unit.text.indexOf(anchor.quote);return key(anchor.unitId,hashes.get(anchor.unitId),start,start+anchor.quote.length,anchor.quote)}
 const read=(rawRows:readonly(SceneRosterRetentionRow|undefined)[],resolve:(value:unknown)=>Anchor):Facts=>{
  const rows:Row[]=rawRows.map(row=>{
   const result:Row={members:new Set(),mentions:[],contexts:[],links:[]}
   for(const mention of row?.mentions??[])try{
    if(row!.name!==undefined&&![row!.name,...row!.aliases??[]].includes(mention.literal))continue
    const evidence=resolve(mention.evidence),probe={name:mention.literal,aliases:[],mentions:[{literal:mention.literal,evidence}],context:[],links:[]}
    validateSceneRosterRecords([probe],units)
    const unit=byId.get(evidence.unitId)!,start=unit.text.indexOf(evidence.quote)+evidence.quote.indexOf(mention.literal),member=key(unit.id,hashes.get(unit.id),mention.literal,start,start+mention.literal.length)
    result.members.add(member);result.mentions.push({key:member,atom:key(member,anchorKey(evidence)),literal:mention.literal,evidence})
   }catch{/* Unproven claims stay in prior data, never in the hard lock. */}
   return result
  })
  for(const [i,row]of rawRows.entries()){
   const owner=rows[i],base=owner.mentions[0];if(!row||!base)continue
   for(const context of row.context)for(const value of context.evidence)try{const anchor=resolve(value),probe=minimal(base);probe.context=[{label:context.label,evidence:[anchor]}];validateSceneRosterRecords([probe],units);owner.contexts.push({label:context.label,anchor:anchorKey(anchor),evidence:{...anchor}})}catch{/* Only independently exact source facts are protected. */}
   for(const link of row.links)try{
    if(link.targetIndex===i||!rows[link.targetIndex]?.mentions.length)continue
    const anchors=link.evidence.map(resolve),left=minimal(base),right=minimal(rows[link.targetIndex].mentions[0]);left.links=[{targetIndex:1,relation:link.relation,evidence:anchors}]
    validateSceneRosterRecords([left,right],units)
    owner.links.push({target:link.targetIndex,relation:link.relation,anchors:new Set(anchors.map(anchorKey)),evidence:anchors.map(anchor=>({...anchor}))})
   }catch{/* A missing endpoint or bad evidence never becomes a forced claim. */}
  }
  return{rows,atoms:new Set(rows.flatMap(row=>row.mentions.map(mention=>mention.atom))),universe:new Set(rows.flatMap(row=>[...row.members])),owners:new Set(rows.filter(row=>row.members.size).map(row=>setKey(row.members)))}
 }
 const diagnose=(records:readonly SceneMentionRecord[]):SceneRosterRetentionDiagnostic|undefined=>{
  if(!first)return
  try{
   // Reuse the exact preservation facts and old-universe projection. New
   // members remain outside this projection and never imply an owner bridge.
   const frozen=first,current=read(records,value=>({...value as Anchor})),projectedMembers=current.rows.map(row=>new Set([...row.members].filter(member=>frozen.universe.has(member)))),projected=projectedMembers.map(setKey)
   const groups=new Map<string,{indexes:number[];members:Set<string>}>()
   frozen.rows.forEach((row,index)=>{if(!row.members.size)return;const owner=setKey(row.members),group=groups.get(owner);if(group)group.indexes.push(index);else groups.set(owner,{indexes:[index],members:row.members})})
   const affected=new Set<string>(),issues:RetentionIssue[]=[]
   const include=(owner:string)=>{if(!groups.has(owner))throw Error('unmapped retention owner');affected.add(owner)}
   const intersecting=(members:ReadonlySet<string>)=>projectedMembers.flatMap((value,index)=>[...value].some(member=>members.has(member))?[index]:[])
   for(const[originalRowIndex,old]of frozen.rows.entries()){
    if(!old.members.size)continue
    const ownerKey=setKey(old.members),currentRowIndexes=intersecting(old.members)
    old.mentions.forEach((mention,proofIndex)=>{if(!current.atoms.has(mention.atom)){include(ownerKey);issues.push({kind:'missing-mention-atom',ownerKey,originalRowIndex,proofIndex,currentRowIndexes})}})
   }
   for(const[ownerKey,group]of groups)if(!projected.includes(ownerKey)){include(ownerKey);issues.push({kind:'missing-owner',ownerKey,originalRowIndex:group.indexes[0],currentRowIndexes:intersecting(group.members)})}
   projected.forEach((value,currentRowIndex)=>{
    if(value==='[]'||frozen.owners.has(value))return
    for(const[ownerKey,group]of groups)if([...projectedMembers[currentRowIndex]].some(member=>group.members.has(member)))include(ownerKey)
    issues.push({kind:'new-owner-projection',currentRowIndexes:[currentRowIndex]})
   })
   for(const[originalRowIndex,old]of frozen.rows.entries()){
    if(!old.members.size)continue
    const ownerKey=setKey(old.members),currentRowIndexes=intersecting(old.members)
    old.contexts.forEach((context,proofIndex)=>{
     if(current.rows.some((row,i)=>projected[i]===ownerKey&&row.contexts.some(value=>value.label===context.label&&value.anchor===context.anchor)))return
     include(ownerKey);issues.push({kind:'missing-context',ownerKey,originalRowIndex,proofIndex,currentRowIndexes})
    })
    old.links.forEach((link,proofIndex)=>{
     const targetOwnerKey=setKey(frozen.rows[link.target].members)
     if(current.rows.some((row,i)=>projected[i]===ownerKey&&row.links.some(value=>value.relation===link.relation&&projected[value.target]===targetOwnerKey&&[...link.anchors].every(anchor=>value.anchors.has(anchor)))))return
     include(ownerKey);include(targetOwnerKey);issues.push({kind:'missing-link',ownerKey,originalRowIndex,proofIndex,currentRowIndexes,targetOwnerKey})
    })
   }
   if(!issues.length)return
   // Every displayed complete group carries all of its original links. Include
   // their complete endpoint groups transitively, rather than dangling hints.
   const pending=[...affected]
   for(let i=0;i<pending.length;i++)for(const index of groups.get(pending[i])!.indexes)for(const link of frozen.rows[index].links){const target=setKey(frozen.rows[link.target].members);if(!affected.has(target)){include(target);pending.push(target)}}
   const proof=(row:Row):SceneRosterRetentionProofRow=>({mentions:row.mentions.map(mention=>({literal:mention.literal,evidence:{...mention.evidence}})),context:row.contexts.map(context=>({label:context.label,evidence:[{...context.evidence}]})),links:row.links.map(link=>({targetIndex:link.target,relation:link.relation as SceneRosterRetentionRow['links'][number]['relation'],evidence:link.evidence.map(anchor=>({...anchor}))}))})
   const members=new Set([...affected].flatMap(owner=>[...groups.get(owner)!.members]))
   const value:SceneRosterRetentionDiagnostic={owners:[...groups].filter(([owner])=>affected.has(owner)).map(([ownerKey,group])=>({ownerKey,originalRowIndexes:[...group.indexes],rows:group.indexes.map(originalRowIndex=>({originalRowIndex,proof:proof(frozen.rows[originalRowIndex])}))})),currentRows:current.rows.flatMap((_,currentRowIndex)=>{
    const oldMemberKeys=[...projectedMembers[currentRowIndex]].sort();if(!oldMemberKeys.some(member=>members.has(member)))return[]
    return[{currentRowIndex,oldMemberKeys,matchingOwnerKeys:groups.has(projected[currentRowIndex])?[projected[currentRowIndex]]:[]}]
   }),issues}
   const freeze=(value:unknown):void=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value)}}
   freeze(value);return value
  }catch{return}
 }
 return{
  diagnose,
  capture(rows:readonly(SceneRosterRetentionRow|undefined)[],resolve:(value:unknown)=>Anchor){if(first)throw Error('场景清单纠错保留状态已建立');first=read(rows,resolve)},
  verifiedRows(){return(first?.rows??[]).map(row=>({mentions:row.mentions.map(mention=>({literal:mention.literal,evidence:{...mention.evidence}})),context:row.contexts.map(context=>({label:context.label,evidence:{...context.evidence}})),links:row.links.map(link=>({targetIndex:link.target,relation:link.relation,evidence:link.evidence.map(anchor=>({...anchor}))}))}))},
  accepts(records:readonly SceneMentionRecord[]):boolean{
   if(!first)return true
   const current=read(records,value=>({...value as Anchor})),projection=(row:Row)=>setKey([...row.members].filter(member=>first!.universe.has(member))),projected=current.rows.map(projection)
   for(const atom of first.atoms)if(!current.atoms.has(atom))return false
   for(const owner of first.owners)if(!projected.includes(owner))return false
   for(const owner of projected)if(owner!=='[]'&&!first.owners.has(owner))return false
   for(const old of first.rows){
    if(!old.members.size)continue
    const binding=setKey(old.members)
    for(const context of old.contexts)if(!current.rows.some((row,i)=>projected[i]===binding&&row.contexts.some(value=>value.label===context.label&&value.anchor===context.anchor)))return false
    for(const link of old.links){const target=setKey(first.rows[link.target].members);if(!current.rows.some((row,i)=>projected[i]===binding&&row.links.some(value=>value.relation===link.relation&&projected[value.target]===target&&[...link.anchors].every(anchor=>value.anchors.has(anchor)))))return false}
   }
   return true
  }
 }
}
