import type {CompactChoice} from '../../desktop/service/novel-import-scene-roster-repair-choices'
function invalid():never{throw Error('TEST_CHOICE_DIRECTORY_INVALID')}
/** Decode only the app's lossless display representation, never provider answers. */
export function expandChoiceDirectory(value:unknown):CompactChoice[]{
 if(!Array.isArray(value))invalid()
 if(!value.length)return[]
 if(value.every(row=>row&&typeof row==='object'&&!Array.isArray(row)))return structuredClone(value) as CompactChoice[]
 if(!value.every(Array.isArray))invalid()
 return value.map((row:unknown[],index)=>{
  if(row.length!==8)invalid()
  const [number,choiceRef,unitIndex,start,end,sourceRef,flags,literals]=row
  if(number!==index+1||typeof choiceRef!=='string'||!/^cf[0-9a-f]{16}$/u.test(choiceRef)||![unitIndex,start,end].every(n=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0)||!(typeof start==='number'&&typeof end==='number'&&start<end)||sourceRef!==null&&(typeof sourceRef!=='string'||!/^ef[0-9a-f]{16}$/u.test(sourceRef))||typeof flags!=='number'||!Number.isSafeInteger(flags)||flags<0||flags>3||!Array.isArray(literals)||!literals.every(literal=>typeof literal==='string'))invalid()
  return{choiceRef,unitIndex:unitIndex as number,start,end,...(sourceRef===null?{}:{sourceRef:sourceRef as string}),...(flags&1?{wholeUnit:true}:{}),literals:[...literals] as string[],...(flags&2?{preserved:true}:{})}
 })
}
