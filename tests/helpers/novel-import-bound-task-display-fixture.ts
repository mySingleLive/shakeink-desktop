import {isDeepStrictEqual} from 'node:util'
const fail=():never=>{throw Error('TEST_BOUND_TASK_DISPLAY_INVALID')}
export function expandBoundTaskDisplay(value:unknown,rows?:readonly {slot:number;patch?:{claims:readonly unknown[]}}[],choices?:readonly {choiceRef:string}[]):any[]{
 if(!Array.isArray(value))return fail()
 const tasks=value.map((raw,index)=>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||raw.answerNumber!==index+1||!Number.isSafeInteger(raw.slot)||raw.slot<0)return fail()
  const selection=raw.kind==='selection',replacement=raw.kind==='replacement',claims=raw.kind==='claims',allowed=new Set(claims?['answerNumber','kind','slot','claimIndexes','domains']:selection?['answerNumber','kind','slot','claimIndexes','claims','options']:['answerNumber','kind','slot','canReject','boundCanReject','blockedRejectReason','primaryRejectOnly'])
  if(!selection&&!replacement&&!claims||Reflect.ownKeys(raw).some(key=>typeof key!=='string'||!allowed.has(key)))return fail()
  const copy=structuredClone(raw);delete copy.answerNumber
  if(claims){
   if(!Array.isArray(raw.claimIndexes)||!raw.claimIndexes.length||new Set(raw.claimIndexes).size!==raw.claimIndexes.length||!raw.claimIndexes.every((n:unknown)=>Number.isSafeInteger(n)&&Number(n)>=0))return fail()
   let restored:unknown[]|undefined
   if(rows){const matching=rows.filter(row=>row.slot===raw.slot);if(matching.length!==1||!Array.isArray(matching[0].patch?.claims)||raw.claimIndexes.some((n:number)=>n>=matching[0].patch!.claims.length))return fail()
    if(choices){const refs=new Map<string,number>();choices.forEach((entry,at)=>{if(typeof entry.choiceRef!=='string'||refs.has(entry.choiceRef))return fail();refs.set(entry.choiceRef,at+1)});restored=raw.claimIndexes.map((n:number)=>{const claim=matching[0].patch!.claims[n] as {kind?:unknown;canReject?:unknown;eligibleChoiceRefs?:unknown};if(!Array.isArray(claim.eligibleChoiceRefs))return fail();return{kind:claim.kind,canReject:claim.canReject,choices:claim.eligibleChoiceRefs.map(ref=>{if(typeof ref!=='string'||!refs.has(ref))return fail();return refs.get(ref)!})}})}
   }
   if(Object.hasOwn(raw,'domains')){if(!Array.isArray(raw.domains)||raw.domains.length!==raw.claimIndexes.length||restored&&!isDeepStrictEqual(raw.domains,restored))return fail()}else{if(!restored)return fail();copy.domains=restored}
   for(const domain of copy.domains){if(!domain||typeof domain!=='object'||Array.isArray(domain)||Reflect.ownKeys(domain).length!==3||Reflect.ownKeys(domain).some(key=>!['kind','canReject','choices'].includes(String(key)))||!['mention','context','link'].includes(domain.kind)||typeof domain.canReject!=='boolean'||!Array.isArray(domain.choices)||new Set(domain.choices).size!==domain.choices.length||!domain.choices.every((n:unknown)=>Number.isSafeInteger(n)&&Number(n)>0)||!domain.choices.length&&!domain.canReject)return fail()}
   if(rows){const matching=rows.filter(row=>row.slot===raw.slot);raw.claimIndexes.forEach((n:number,at:number)=>{const claim=matching[0].patch!.claims[n] as {kind?:unknown;canReject?:unknown};if(claim.kind!==copy.domains[at].kind||claim.canReject!==copy.domains[at].canReject)return fail()})}
  }else if(selection){
   if(!Array.isArray(raw.claimIndexes)||!raw.claimIndexes.length||!raw.claimIndexes.every((n:unknown)=>Number.isSafeInteger(n)&&Number(n)>=0)||!Array.isArray(raw.options)||!raw.options.length)return fail()
   let restored:unknown[]|undefined
   if(rows){const matching=rows.filter(row=>row.slot===raw.slot);if(matching.length!==1||!Array.isArray(matching[0].patch?.claims))return fail();const claims=matching[0].patch!.claims;restored=raw.claimIndexes.map((index:number)=>{if(index>=claims.length)return fail();const claim=claims[index];if(!claim||typeof claim!=='object'||Array.isArray(claim))return fail();const{claimRef,eligibleChoiceRefs,...value}=claim as Record<string,unknown>;return structuredClone(value)})}
   if(Object.hasOwn(raw,'claims')){if(!Array.isArray(raw.claims)||raw.claims.length!==raw.claimIndexes.length||restored&&!isDeepStrictEqual(raw.claims,restored))return fail()}
   else{if(!restored)return fail();copy.claims=restored}
   copy.options=raw.options.map((option:unknown,at:number)=>{if(!Array.isArray(option)||option.length!==2||option[0]!==at+1||!Array.isArray(option[1])||option[1].length!==raw.claimIndexes.length)return fail();for(const refs of option[1])if(!Array.isArray(refs)||!refs.every(n=>Number.isSafeInteger(n)&&n>=1))return fail();return structuredClone(option[1])})
  }else if(Object.hasOwn(raw,'primaryRejectOnly')&&(raw.primaryRejectOnly!==true||!raw.canReject||!raw.boundCanReject)||typeof raw.canReject!=='boolean'||typeof raw.boundCanReject!=='boolean'||Object.hasOwn(raw,'blockedRejectReason')&&raw.blockedRejectReason!=='good-row-incoming-link')return fail()
  return copy
 })
 const slots=new Map<number,Set<number>|null>()
 for(const task of tasks){if(task.kind==='replacement'){if(slots.has(task.slot))return fail();slots.set(task.slot,null);continue}const used=slots.get(task.slot);if(used===null)return fail();const indices=used??new Set<number>();for(const index of task.claimIndexes){if(indices.has(index))return fail();indices.add(index)}slots.set(task.slot,indices)}
 return tasks
}
