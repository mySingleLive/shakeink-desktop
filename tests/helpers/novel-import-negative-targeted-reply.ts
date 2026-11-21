import type {ImportUnit} from '../../desktop/shared/novel-import'
import {explicitTargetedRosterReply} from './novel-import-targeted-repair-fixture'
/** Positive facts must encode an exact offered choice. Deliberate persistent
 * bad-data fixtures instead submit their original invalid fields in a closed
 * transaction when no verified choice exists, and must be rejected. */
export function controlledTargetedReply(prompt:string,expected:unknown,units:readonly ImportUnit[],persistentBad:boolean):unknown{
 try{return explicitTargetedRosterReply(prompt,expected,units)}catch(error){
  if(!persistentBad||!(error instanceof Error)||!error.message.startsWith('TEST_FIXTURE_UNSUPPORTED_EXACT_CHOICE'))throw error
  const open='<scene-roster-targeted-repair>',close='</scene-roster-targeted-repair>',start=prompt.lastIndexOf(open),end=prompt.indexOf(close,start+open.length)
  if(start<0||end<0||!expected||typeof expected!=='object'||Array.isArray(expected)||!('roster'in expected)||!Array.isArray(expected.roster))throw error
  const roster=expected.roster,plan=JSON.parse(prompt.slice(start+open.length,end)) as {rows:{slot:number;repairRef:string}[]}
  return{repairs:plan.rows.map(row=>({repairRef:row.repairRef,disposition:'replace',replacement:roster[row.slot]}))}
 }
}
