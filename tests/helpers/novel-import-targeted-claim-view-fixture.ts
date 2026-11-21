import {expandChoiceDirectory} from './novel-import-choice-directory-fixture'
import type {SceneRosterTargetedPlan} from '../../desktop/service/novel-import-scene-roster-targeted-repair'
const fail=():never=>{throw Error('TEST_TARGETED_CLAIM_VIEW_INVALID')}
const object=(value:unknown):Record<string,unknown>=>{if(!value||typeof value!=='object'||Array.isArray(value))return fail();return value as Record<string,unknown>}
const array=(value:unknown):unknown[]=>{if(!Array.isArray(value))return fail();return value}
const columns=['claimRef','kind','index','evidenceIndex','literal','label','targetIndex','relation','canReject','eligibleChoices']
function expandClaimTable(patch:Record<string,unknown>,count:number):unknown[]{
 if(Reflect.ownKeys(patch).length!==1||!Object.hasOwn(patch,'claimRows'))return fail()
 return array(patch.claimRows).map(value=>{
  const tuple=array(value),mask=tuple[0];if(typeof mask!=='number'||!Number.isSafeInteger(mask)||mask<1||mask>=2**columns.length)return fail()
  const claim:Record<string,unknown>={};let at=1
  columns.forEach((key,index)=>{if(mask&(2**index))claim[key]=tuple[at++]})
  if(at!==tuple.length)return fail()
  const common=['claimRef','kind','index','canReject','eligibleChoices'],specific=claim.kind==='mention'?['literal']:claim.kind==='context'?['evidenceIndex','label']:claim.kind==='link'?['evidenceIndex','targetIndex','relation']:fail(),expected=[...common,...specific]
  if(Object.keys(claim).length!==expected.length||expected.some(key=>!Object.hasOwn(claim,key)))return fail()
  if(typeof claim.claimRef!=='string'||!/^pc[0-9a-f]{16}$/u.test(claim.claimRef)||typeof claim.canReject!=='boolean'||claim.kind!=='mention'&&claim.canReject!==true)return fail()
  for(const key of ['index',...specific.filter(key=>key==='evidenceIndex'||key==='targetIndex')])if(typeof claim[key]!=='number'||!Number.isSafeInteger(claim[key])||Number(claim[key])<0)return fail()
  for(const key of specific.filter(key=>['literal','label'].includes(key)))if(typeof claim[key]!=='string'||!String(claim[key]).trim()||String(claim[key]).length>300||!String(claim[key]).isWellFormed())return fail()
  if(claim.kind==='link'&&!['same-place','different-place','parent'].includes(String(claim.relation)))return fail()
  if(!array(claim.eligibleChoices).every(n=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=1&&n<=count))return fail()
  return claim
 })
}
/** A handwritten inverse of provider data, never an output-answer decoder.
 * Old CF fields remain an explicit branch; mixed or unknown mappings fail. */
export function expandTargetedClaimView(value:unknown):SceneRosterTargetedPlan{
 const copy=structuredClone(object(value)),choices=expandChoiceDirectory(copy.choices),known=new Set<string>()
 for(const choice of choices){if(typeof choice.choiceRef!=='string'||!/^cf[0-9a-f]{16}$/u.test(choice.choiceRef)||known.has(choice.choiceRef))return fail();known.add(choice.choiceRef)}
 const columnar=Object.hasOwn(copy,'claimColumns')||Object.hasOwn(copy,'claimTableVersion')
 if(columnar&&(copy.claimTableVersion!==1||JSON.stringify(copy.claimColumns)!==JSON.stringify(columns)))return fail()
 const cf=(number:unknown)=>{if(typeof number!=='number'||!Number.isSafeInteger(number)||number<1||number>choices.length)return fail();return choices[number-1].choiceRef}
 const old=(value:unknown)=>{if(typeof value!=='string'||!known.has(value))return fail();return value}
 const reference=(value:unknown,legacy:string,current:string,many:boolean)=>{
  const row=object(value),was=Object.hasOwn(row,legacy),now=Object.hasOwn(row,current);if(was===now)return fail()
  const field=was?row[legacy]:row[current],resolve=was?old:cf,result={...row};delete result[current]
  result[legacy]=many?array(field).map(resolve):resolve(field);return result
 }
 const rows=array(copy.rows).map(value=>{
  const row=object(value),keep=object(row.keep),result={...row,candidates:array(row.candidates).map(entry=>reference(entry,'choiceRefs','choices',true)),keep:{...keep,mentions:array(keep.mentions).map(entry=>reference(entry,'choiceRef','choice',false)),context:array(keep.context).map(entry=>reference(entry,'choiceRef','choice',false)),links:array(keep.links).map(entry=>reference(entry,'choiceRefs','choices',true))}}
  if(Object.hasOwn(row,'patch')){const patch=object(row.patch),claims=columnar?expandClaimTable(patch,choices.length):array(patch.claims);if(!columnar&&Object.hasOwn(patch,'claimRows'))return fail();Object.assign(result,{patch:{claims:claims.map(entry=>reference(entry,'eligibleChoiceRefs','eligibleChoices',true))}})}
  return result
 })
 delete copy.claimColumns;delete copy.claimTableVersion
 return{...copy,rows,choices} as unknown as SceneRosterTargetedPlan
}
