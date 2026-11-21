import {expandChoiceDirectory} from './novel-import-choice-directory-fixture'
import {createSceneRosterFragmentTable,restoreSceneRosterFragmentAnchor} from '../../desktop/core/novel-import-scene-roster-fragments'
import {assertSceneRosterAnchor,validateSceneRosterRecords} from '../../desktop/core/novel-import-scene-identity'
import {sceneAnchorSchema,type Anchor} from '../../desktop/shared/novel-import-scene-identity'
import type {ImportUnit} from '../../desktop/shared/novel-import'
import {createSceneRosterRepairChoices} from '../../desktop/service/novel-import-scene-roster-repair-choices'

/** Controlled fixtures choose replacement data in advance. This adapter only
 * encodes that data using the application's opaque transaction identifiers;
 * it does not simulate a provider obeying a prompt or provide product fallback. */
export function explicitTargetedRosterReply(prompt:string,expected:unknown,units:readonly ImportUnit[]):unknown{
 const open='<scene-roster-targeted-repair>',close='</scene-roster-targeted-repair>',start=prompt.lastIndexOf(open),end=prompt.indexOf(close,start+open.length)
 if(start<0||end<0||start<prompt.lastIndexOf('</novel-import-data>'))return expected
 function unsupported():never{throw Error('TEST_FIXTURE_UNSUPPORTED_EXACT_CHOICE')}
 try{
  const plan=JSON.parse(prompt.slice(start+open.length,end)) as {rows:{repairRef:string;slot:number}[];choices:{choiceRef:string;unitId?:string;quote?:string;sourceRef?:string;wholeUnit?:boolean;unitIndex?:number;start?:number;end?:number;literals?:string[];preserved?:boolean}[]},table=createSceneRosterFragmentTable(units,/"ef[0-9a-f]{12}"/u.test(prompt.slice(start,end))?12:16),bindings=createSceneRosterRepairChoices(units,table)
  plan.choices=expandChoiceDirectory(plan.choices)
  const check=(anchor:Anchor,literal?:string)=>{if(!sceneAnchorSchema.safeParse(anchor).success)unsupported();assertSceneRosterAnchor(anchor,units);if(literal!==undefined)validateSceneRosterRecords([{name:literal,aliases:[],mentions:[{literal,evidence:anchor}],context:[],links:[]}],units);return anchor}
  const source=(choice:typeof plan.choices[number]):Anchor=>{
   if(['unitIndex','start','end'].some(key=>Object.hasOwn(choice,key))){
    const allowed=['choiceRef','unitIndex','start','end','sourceRef','wholeUnit','literals','preserved'];if(Reflect.ownKeys(choice).some(key=>typeof key!=='string'||!allowed.includes(key)))unsupported()
    const {unitIndex,start,end}=choice;if(!Number.isSafeInteger(unitIndex)||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||unitIndex!<0||unitIndex!>=units.length)unsupported()
    const unit=units[unitIndex!];if(start!<0||start!>=end!||end!>unit.text.length)unsupported()
    const anchor=check({unitId:unit.id,quote:unit.text.slice(start!,end!)});if(bindings.addAnchor(anchor)!==choice.choiceRef)unsupported()
    if(choice.wholeUnit!==undefined&&typeof choice.wholeUnit!=='boolean'||choice.preserved!==undefined&&typeof choice.preserved!=='boolean')unsupported()
    if(choice.wholeUnit&&(start!==0||end!==unit.text.length))unsupported()
    if(choice.sourceRef!==undefined){if(typeof choice.sourceRef!=='string')unsupported();const source=table.resolve(choice.sourceRef);if(source.unitId!==anchor.unitId||source.quote!==anchor.quote)unsupported()}
    return anchor
   }
   const unitId=choice.unitId;if(typeof unitId!=='string')unsupported()
   const anchors:Anchor[]=[]
   if(choice.quote!==undefined)anchors.push({unitId,quote:choice.quote})
   if(choice.sourceRef!==undefined)anchors.push(table.resolve(choice.sourceRef))
   if(choice.wholeUnit){const unit=units.find(unit=>unit.id===unitId);if(!unit)unsupported();anchors.push({unitId:unit!.id,quote:unit!.text})}
   const anchor=anchors[0];if(!anchor||anchor.unitId!==unitId||anchors.some(value=>value.unitId!==anchor.unitId||value.quote!==anchor.quote))unsupported();return check(anchor!)
  }
  const encode=(value:unknown,literal?:string)=>{
   if(!value||typeof value!=='object'||Array.isArray(value))unsupported()
   const v=value as Record<string,unknown>,keys=Reflect.ownKeys(v),exact=(names:string[])=>keys.length===names.length&&names.every(name=>Object.hasOwn(v,name));let anchor:Anchor
   if(exact(['unitId','quote']))anchor=check(v as unknown as Anchor,literal)
   else if(exact(['ref'])&&typeof v.ref==='string')anchor=check(table.resolve(v.ref),literal)
   else if(exact(['unitIndex','fromFragment','toFragment']))anchor=check(restoreSceneRosterFragmentAnchor(v as unknown as Parameters<typeof restoreSceneRosterFragmentAnchor>[0],units),literal)
   else if(exact(['choiceRef'])&&typeof v.choiceRef==='string'){const matches=plan.choices.filter(choice=>choice.choiceRef===v.choiceRef);if(matches.length!==1)unsupported();anchor=check(source(matches[0]),literal)}
   else return unsupported()
   const matches=plan.choices.filter(choice=>{const offered=source(choice);return offered.unitId===anchor.unitId&&offered.quote===anchor.quote})
   if(matches.length!==1)unsupported();return{choiceRef:matches[0].choiceRef}
  }
  const row=(value:unknown):unknown=>{
   if(!value||typeof value!=='object'||Array.isArray(value))return value
   const r=structuredClone(value) as Record<string,unknown>
   if(Array.isArray(r.mentions))r.mentions=r.mentions.map(value=>{if(!value||typeof value!=='object'||!('literal'in value)||typeof value.literal!=='string'||!('evidence'in value))unsupported();return{...value,evidence:encode(value.evidence,value.literal)}})
   for(const field of ['context','links'])if(Array.isArray(r[field]))r[field]=r[field].map(value=>{if(!value||typeof value!=='object'||!('evidence'in value)||!Array.isArray(value.evidence))unsupported();return{...value,evidence:value.evidence.map((anchor:unknown)=>encode(anchor))}})
   return r
  }
  if(!expected||typeof expected!=='object'||Array.isArray(expected))return expected
  if(Object.keys(expected).length===1&&'roster'in expected&&Array.isArray(expected.roster)){const roster=expected.roster;return{repairs:plan.rows.map(target=>({repairRef:target.repairRef,disposition:'replace',replacement:row(roster[target.slot])}))}}
  if('repairs'in expected&&Array.isArray(expected.repairs))return{...structuredClone(expected),repairs:expected.repairs.map(value=>value&&typeof value==='object'&&'disposition'in value&&value.disposition==='replace'&&'replacement'in value?{...structuredClone(value),replacement:row(value.replacement)}:structuredClone(value))}
  return expected
 }catch{return unsupported()}
}
export function staticRosterCorrection(text:string):string{return text.replace(/<previous-scene-roster-output>[\s\S]*?<\/previous-scene-roster-output>/gu,'').replace(/<scene-roster-targeted-repair>[\s\S]*?<\/scene-roster-targeted-repair>/gu,'').replace(/<scene-roster-bound-repair>[\s\S]*?<\/scene-roster-bound-repair>/gu,'')}
