import type {JSONSchema7} from '@ai-sdk/provider'
import {types} from 'node:util'
import type {SceneRosterTargetedPlan,SceneRosterTargetedReply} from './novel-import-scene-roster-targeted-repair'
import type {SceneRosterPatchDecision} from './novel-import-scene-roster-claim-patch'
import {bindSceneRosterRepairDiagnostic,sceneRosterRepairDiagnostic} from './novel-import-scene-roster-repair-diagnostic'
export const SCENE_BOUND_LIMITS={options:256,rowSteps:4096,requestSteps:65536} as const
export const SCENE_ROSTER_BOUND_ANSWER_GUIDANCE='只返回{"answers":{"1":答案}}，键恰为answerNumber。selection填{"selection":本任务局部optionNumber}；replacement完整，仅boundCanReject可0。claims只填{"claimChoices":{"1":[共享号]}}，局部键按claimIndexes顺序1..K；满足完整域，[]仅canReject，mention非空恰1号，其它多号不重复。旧数组/repairs仅兼容，不回roster或控制ref。'
type Row=SceneRosterTargetedPlan['rows'][number]
export type BoundGroup={claimRefs:readonly string[];validate:(decisions:readonly SceneRosterPatchDecision[])=>void}
type Selection={kind:'selection';slot:number;claimIndexes:number[];claims:Record<string,unknown>[];options:number[][][]}
type Replacement={kind:'replacement';slot:number;canReject:boolean;boundCanReject:boolean;blockedRejectReason?:'good-row-incoming-link';primaryRejectOnly?:true}
export type ClaimsTask={kind:'claims';slot:number;claimIndexes:number[];domains:{kind:'mention'|'context'|'link';canReject:boolean;choices:number[]}[]}
type Task=Selection|Replacement|ClaimsTask
type TaskDisplay=(Omit<Selection,'claims'|'options'>&{answerNumber:number;options:(readonly[number,number[][]])[]})|((Replacement|ClaimsTask)&{answerNumber:number;options?:never})
export type BoundData={tasks:Task[];choices:SceneRosterTargetedPlan['choices'];selectionEncoding?:'object'}
export type BoundPreview={readonly data:BoundData;readonly transitions:number}
export type BoundDeck={readonly data:BoundData;readonly transitions:number;readonly frozenRowCount:number;fromChoice:(n:number)=>string;advance:(slot:number)=>BoundDeck;toReplacement:(slot:number)=>BoundDeck;next:()=>BoundDeck|undefined;previewNext:()=>BoundPreview|undefined;commit:(preview:BoundPreview)=>BoundDeck;discard:(preview:BoundPreview)=>void;activate:()=>void;decode:(answers:readonly unknown[],replacement:(v:unknown)=>unknown)=>SceneRosterTargetedReply[];decodeRoot:(raw:unknown,replacement:(v:unknown)=>unknown,legacy?:(raw:unknown)=>SceneRosterTargetedReply[])=>SceneRosterTargetedReply[];diagnostic:(error:unknown)=>{taskNumber:number;localClaimNumber:number;reason:string}|undefined}
const freeze=<T>(value:T):T=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value)}return value}
function fail(claimRef?:string):never{const error=Error('场景绑定修复答案无效，请按当前任务顺序完整作答');if(claimRef)bindSceneRosterRepairDiagnostic(error,{claimRef,reason:'transaction'});throw error}
/** An explicit local wire alternative. The returned value still passes the
 * original integer and task-local range gate; no source choice is inferred. */
function selectionValue(value:unknown,task?:Selection):unknown{
 if(!value||typeof value!=='object')return value
 if(Array.isArray(value)||types.isProxy(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail()
 const keys=Reflect.ownKeys(value)
 if(task&&keys.length===1&&keys[0]==='claimChoices'){const root=boundObject(value),chosen=boundObject(root.claimChoices),names=task.claimIndexes.map((_,i)=>String(i+1));if(Reflect.ownKeys(chosen).length!==names.length||names.some(name=>!Object.hasOwn(chosen,name)))fail();const numbers=names.map(name=>{const ns=boundArray(chosen[name]);if(new Set(ns).size!==ns.length||ns.some(n=>typeof n!=='number'||!Number.isSafeInteger(n)||n<1))fail();return ns});const matches=task.options.map((option,index)=>({option,index})).filter(({option})=>option.length===numbers.length&&option.every((ns,i)=>ns.length===numbers[i].length&&ns.every((n,j)=>n===numbers[i][j])));if(matches.length!==1)fail();return matches[0].index+1}
 const descriptor=Object.getOwnPropertyDescriptor(value,'selection')
 if(keys.length!==1||keys[0]!=='selection'||!descriptor||!('value'in descriptor))fail()
 return descriptor.value
}
function boundObject(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||types.isProxy(value)||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail();for(const k of Reflect.ownKeys(value)){if(typeof k!=='string'||!('value'in Object.getOwnPropertyDescriptor(value,k)!))fail()}return value as Record<string,unknown>}
function boundArray(value:unknown):unknown[]{if(!Array.isArray(value)||types.isProxy(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length>50000)fail();const keys=Reflect.ownKeys(value);if(keys.length!==value.length+1)fail();for(let i=0;i<value.length;i++){const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d||!('value'in d))fail()}if(keys.some(k=>typeof k!=='string'||k!=='length'&&!/^(0|[1-9][0-9]*)$/u.test(k)))fail();return value}
function claimNumbers(value:unknown,task:ClaimsTask,onInvalid?:(local:number)=>never):number[][]{
 const invalid=(local?:number):never=>{if(local!==undefined&&onInvalid)onInvalid(local);return fail()}
 const root=boundObject(value);if(Reflect.ownKeys(root).length!==1||!Object.hasOwn(root,'claimChoices'))return invalid()
 const chosen=boundObject(root.claimChoices),keys=task.claimIndexes.map((_,i)=>String(i+1));if(Reflect.ownKeys(chosen).length!==keys.length||keys.some(k=>!Object.hasOwn(chosen,k)))return invalid()
 return keys.map((key,local)=>{const d=task.domains[local];let numbers:unknown[];try{numbers=boundArray(chosen[key])}catch{return invalid(local)}if(!numbers.length){if(!d.canReject)return invalid(local);return[]}if(d.kind==='mention'&&numbers.length!==1||new Set(numbers).size!==numbers.length)return invalid(local);const allowed=new Set(d.choices);return numbers.map(n=>{if(typeof n!=='number'||!Number.isSafeInteger(n)||!allowed.has(n))return invalid(local);return n})})
}
class CompileLimit extends Error{}
/** Each subset is explicit; no materialized unbounded power set. */
function* domain(refs:readonly string[],mention:boolean,canReject:boolean,tick:()=>void):Generator<string[]>{
 if(mention){for(const ref of refs){tick();yield[ref]}}
 else for(let size=1;size<=refs.length;size++){
  const indexes=Array.from({length:size},(_,index)=>index)
  for(;;){tick();const choice:string[]=[];for(const index of indexes){tick();choice.push(refs[index])}yield choice;let at=size-1;while(at>=0&&indexes[at]===refs.length-size+at){tick();at--}if(at<0)break;indexes[at]++;for(let next=at+1;next<size;next++){tick();indexes[next]=indexes[next-1]+1}}
 }
 if(canReject){tick();yield[]}
}
export function compileBoundGroup(row:Row,group:BoundGroup,choiceIndex:ReadonlyMap<string,number>,tick:()=>void){
 const claims=group.claimRefs.map(ref=>{const claim=row.patch!.claims.find(claim=>claim.claimRef===ref);if(!claim)fail();return claim}),options:number[][][]=[],iterators:Generator<string[]>[]=[],values:string[][]=[]
 if(!claims.length)fail();let depth=0
 const iterator=(index:number)=>{const claim=claims[index];return domain(claim.eligibleChoiceRefs,claim.kind==='mention',claim.canReject,tick)}
 iterators[0]=iterator(0)
 while(depth>=0){tick();const next=iterators[depth].next();if(next.done){depth--;continue}values[depth]=next.value
  if(depth<claims.length-1){depth++;iterators[depth]=iterator(depth);continue}
  tick();const decisions=claims.map((claim,index):SceneRosterPatchDecision=>values[index].length?{claimRef:claim.claimRef,disposition:'resolve',choiceRefs:[...values[index]]}:{claimRef:claim.claimRef,disposition:'reject'})
  try{group.validate(decisions)}catch{continue}
  if(options.length>=SCENE_BOUND_LIMITS.options)throw new CompileLimit()
  options.push(values.map(refs=>refs.map(ref=>{const index=choiceIndex.get(ref);if(index===undefined)fail();return index})))
 }
 if(!options.length)throw new CompileLimit()
 return{options,claims,claimIndexes:claims.map(claim=>row.patch!.claims.indexOf(claim))}
}
/** Only control identities move to this request-private table. */
export function createSceneRosterBoundDecisions(input:{plan:SceneRosterTargetedPlan;draft:readonly unknown[];groups?:(slot:number)=>readonly BoundGroup[]|undefined;strategy?:'claims'|'joint-groups';primaryRejectOnly?:readonly number[]}):BoundDeck{
 if(input.strategy!==undefined&&!['claims','joint-groups'].includes(input.strategy))fail()
 const joint=input.strategy==='joint-groups',primaryRejectOnly=new Set(input.primaryRejectOnly??[]),plan=freeze(structuredClone(input.plan)),draft=freeze(structuredClone(input.draft)),indices=new Map<string,number>(),rows=new Map(plan.rows.map(r=>[r.slot,r])),bad=new Set(rows.keys()),pinned=new Set<number>(),complete=new Set<number>(),states=new Map<number,0|1|2>();let requestSteps=0,currentVersion=0,changes=0
 let active=false,outstanding:BoundPreview|undefined;const previews=new WeakMap<BoundPreview,{owner:BoundDeck;version:number;tasks:Task[];states:Map<number,0|1|2>}>(),revoke=()=>{if(outstanding)previews.delete(outstanding);outstanding=undefined}
 if(rows.size!==plan.rows.length||[...primaryRejectOnly].some(slot=>!Number.isSafeInteger(slot)||!rows.has(slot)))fail();for(const[at,c]of plan.choices.entries()){if(typeof c.choiceRef!=='string'||indices.has(c.choiceRef))fail();indices.set(c.choiceRef,at+1)}
 const fromChoice=(n:number)=>{if(!Number.isSafeInteger(n)||n<1||n>plan.choices.length)fail();return plan.choices[n-1].choiceRef}
 for(const[slot,raw]of draft.entries())if(!bad.has(slot)&&raw&&typeof raw==='object'&&'links'in raw&&Array.isArray(raw.links))for(const link of raw.links)if(link&&typeof link==='object'&&Number.isSafeInteger(link.targetIndex)&&bad.has(link.targetIndex))pinned.add(link.targetIndex)
 const replacement=(slot:number):Replacement=>{const r=rows.get(slot);if(!r)fail();return{kind:'replacement',slot,canReject:r.canReject,boundCanReject:r.canReject&&!pinned.has(slot),...(r.canReject&&pinned.has(slot)?{blockedRejectReason:'good-row-incoming-link' as const}:{}),...(primaryRejectOnly.has(slot)&&r.canReject&&!pinned.has(slot)&&r.patch&&!r.keep.mentions.length&&!r.keep.context.length&&!r.keep.links.length?{primaryRejectOnly:true as const}:{})}}
 const claims=(slot:number,claimIndexes?:number[]):ClaimsTask=>{const r=rows.get(slot);if(!r?.patch||!complete.has(slot)||r.canReject)fail();const indexes=claimIndexes??r.patch.claims.map((_,i)=>i);if(!indexes.length||new Set(indexes).size!==indexes.length)fail();return{kind:'claims',slot,claimIndexes:[...indexes],domains:indexes.map(index=>{const c=r.patch!.claims[index];if(!c||!Number.isSafeInteger(index)||index<0||!['mention','context','link'].includes(c.kind)||typeof c.canReject!=='boolean'||!Array.isArray(c.eligibleChoiceRefs))fail();const domain=c.eligibleChoiceRefs.map(ref=>{const n=indices.get(ref);if(n===undefined)fail();return n});if(new Set(domain).size!==domain.length||!domain.length&&!c.canReject)fail();return{kind:c.kind,canReject:c.canReject,choices:domain}})}}
 const initial:Task[]=[]
 for(const r of plan.rows){if(!Number.isSafeInteger(r.slot)||r.slot<0||r.slot>=draft.length)fail();let rowSteps=0;const gs=!r.canReject&&r.patch?input.groups?.(r.slot):undefined,all=r.patch?.claims.map(c=>c.claimRef)??[],groupRefs=gs?.flatMap(g=>[...g.claimRefs])??[];if(all.length&&new Set(all).size===all.length&&groupRefs.length===all.length&&new Set(groupRefs).size===all.length&&groupRefs.every(ref=>all.includes(ref)))complete.add(r.slot)
  const compiled:Selection[]=[],tick=()=>{if(rowSteps>=SCENE_BOUND_LIMITS.rowSteps||requestSteps>=SCENE_BOUND_LIMITS.requestSteps)throw new CompileLimit();rowSteps++;requestSteps++}
  if(joint&&complete.has(r.slot)&&gs){const remainder:number[]=[];for(const group of gs){const indexes=group.claimRefs.map(ref=>all.indexOf(ref));if(indexes.some(index=>index<0))fail();if(indexes.length<2){remainder.push(...indexes);continue}try{const result=compileBoundGroup(r,group,indices,tick);compiled.push({kind:'selection',slot:r.slot,claimIndexes:result.claimIndexes,claims:result.claims.map(({claimRef,eligibleChoiceRefs,...v})=>v),options:result.options})}catch(error){if(!(error instanceof CompileLimit))throw error;remainder.push(...indexes)}}initial.push(...compiled);if(remainder.length)initial.push(claims(r.slot,remainder.sort((a,b)=>a-b)));states.set(r.slot,compiled.length?0:1);continue}
  if(input.strategy!=='claims'&&complete.has(r.slot)&&gs)try{for(const group of gs){const result=compileBoundGroup(r,group,indices,tick);compiled.push({kind:'selection',slot:r.slot,claimIndexes:result.claimIndexes,claims:result.claims.map(({claimRef,eligibleChoiceRefs,...v})=>v),options:result.options})}}catch(error){if(!(error instanceof CompileLimit))throw error;compiled.length=0}
  if(compiled.length){states.set(r.slot,0);initial.push(...compiled)}else if(complete.has(r.slot)&&!r.canReject){states.set(r.slot,1);initial.push(claims(r.slot))}else{states.set(r.slot,2);initial.push(replacement(r.slot))}
 }
 const transitionLimit=joint?initial.filter(t=>t.kind==='selection').length+rows.size:2*rows.size
 const dataFor=(tasks:Task[]):BoundData=>freeze({tasks,choices:plan.choices,...(joint?{selectionEncoding:'object' as const}:{})})
 const assertPartition=(tasks:readonly Task[])=>{for(const slot of rows.keys()){const assigned=tasks.filter(t=>t.slot===slot);if(!assigned.length)fail();if(assigned.some(t=>t.kind==='replacement')){if(assigned.length!==1)fail();continue}const expected=rows.get(slot)?.patch?.claims;if(!expected)fail();const seen=new Set<number>();for(const task of assigned){if(task.kind==='replacement')fail();if(!task.claimIndexes.length)fail();for(const index of task.claimIndexes){if(!Number.isSafeInteger(index)||index<0||index>=expected.length||seen.has(index))fail();seen.add(index)}if(task.kind==='claims'){const full=claims(slot,task.claimIndexes);if(JSON.stringify(task.domains)!==JSON.stringify(full.domains))fail()}else if(!task.options.length||task.options.some(option=>option.length!==task.claimIndexes.length))fail()}if(seen.size!==expected.length)fail()}if(tasks.some(t=>!rows.has(t.slot)))fail()}
 const cost=(tasks:Task[])=>Buffer.byteLength(JSON.stringify({...(joint?{selectionEncoding:'object'}:{}),tasks:joint?sceneRosterBoundTaskDisplay(tasks,plan):sceneRosterBoundTaskDisplay(tasks)})+JSON.stringify(sceneRosterKeyedInlineSchema(tasks,plan.choices.length,joint?'object':undefined)))
 const make=(tasks:Task[],rowStates:ReadonlyMap<number,0|1|2>,version:number):BoundDeck=>{
  assertPartition(tasks);const data=dataFor(tasks),ensure=()=>{if(version!==currentVersion)fail()}
  const decode=(raw:readonly unknown[],record:(v:unknown)=>unknown)=>{ensure();assertPartition(tasks);const answers=boundArray(raw);if(answers.length!==tasks.length)fail();const out=new Map<number,SceneRosterTargetedReply>(),selected=new Map<number,SceneRosterPatchDecision[]>()
   for(const[i,task]of tasks.entries()){const r=rows.get(task.slot)!;if(task.kind==='replacement'){if(answers[i]===0){if(!task.boundCanReject)fail();out.set(task.slot,{repairRef:r.repairRef,disposition:'reject'})}else out.set(task.slot,{repairRef:r.repairRef,disposition:'replace',replacement:record(answers[i]) as never});continue}
    let decisions:SceneRosterPatchDecision[]
    if(task.kind==='selection'){const v=selectionValue(answers[i],task);if(typeof v!=='number'||!Number.isSafeInteger(v)||v<1||v>task.options.length)fail();decisions=task.claimIndexes.map((index,at)=>{const c=r.patch!.claims[index],ns=task.options[v-1][at];return ns.length?{claimRef:c.claimRef,disposition:'resolve',choiceRefs:ns.map(fromChoice)}:{claimRef:c.claimRef,disposition:'reject'}})}else{const numbers=claimNumbers(answers[i],task,local=>fail(r.patch!.claims[task.claimIndexes[local]].claimRef));decisions=task.claimIndexes.map((index,at)=>{const c=r.patch!.claims[index],ns=numbers[at];return ns.length?{claimRef:c.claimRef,disposition:'resolve',choiceRefs:ns.map(fromChoice)}:{claimRef:c.claimRef,disposition:'reject'}})}
    const prior=selected.get(task.slot)??[];if(decisions.some(c=>prior.some(old=>old.claimRef===c.claimRef)))fail();selected.set(task.slot,[...prior,...decisions])
   }
   for(const r of plan.rows)if(selected.has(r.slot)){const chosen=selected.get(r.slot)!,expected=r.patch!.claims.map(c=>c.claimRef);if(chosen.length!==expected.length||new Set(chosen.map(c=>c.claimRef)).size!==expected.length||expected.some(ref=>!chosen.some(c=>c.claimRef===ref)))fail();out.set(r.slot,{repairRef:r.repairRef,disposition:'patch',patch:{claims:chosen}})}
   return plan.rows.map(r=>{const value=out.get(r.slot);if(!value)fail();return value})
  }
  const candidate=(slot:number,group?:Selection)=>{if(!complete.has(slot)||rowStates.get(slot)===2)fail();let rowTasks:Task[];if(joint&&group){const rest=tasks.find(t=>t.slot===slot&&t.kind==='claims') as ClaimsTask|undefined,indexes=[...new Set([...(rest?.claimIndexes??[]),...group.claimIndexes])].sort((a,b)=>a-b);rowTasks=[...tasks.filter(t=>t.slot===slot&&t!==group&&t.kind==='selection'),claims(slot,indexes)]}else if(joint){if(tasks.some(t=>t.slot===slot&&t.kind==='selection'))fail();rowTasks=[replacement(slot)]}else rowTasks=[rowStates.get(slot)===0?claims(slot):replacement(slot)];const result:Task[]=[];let inserted=false;for(const task of tasks)if(task.slot!==slot)result.push(task);else if(!inserted){result.push(...rowTasks);inserted=true}if(!inserted)fail();assertPartition(result);const next=new Map(rowStates);next.set(slot,rowTasks.some(t=>t.kind==='selection')?0:rowTasks.some(t=>t.kind==='claims')?1:2);return{tasks:result,states:next}}
  const nextCandidate=()=>{if(changes>=transitionLimit)return;if(!joint){for(const state of[0,1]as const){const slots=[...rowStates].filter(([,v])=>v===state).sort((a,b)=>tasks.filter(t=>t.slot===b[0]).reduce((n,t)=>n+JSON.stringify(t).length,0)-tasks.filter(t=>t.slot===a[0]).reduce((n,t)=>n+JSON.stringify(t).length,0)||a[0]-b[0]);if(slots.length)return candidate(slots[0][0])}return}const candidates:{slot:number;first:number;value:ReturnType<typeof candidate>;bytes:number}[]=[];for(const task of tasks)if(task.kind==='selection'){const value=candidate(task.slot,task);candidates.push({slot:task.slot,first:Math.min(...task.claimIndexes),value,bytes:cost(value.tasks)})}for(const[slot,state]of rowStates)if(state===1){const value=candidate(slot);candidates.push({slot,first:Number.MAX_SAFE_INTEGER,value,bytes:cost(value.tasks)})}candidates.sort((a,b)=>a.bytes-b.bytes||a.slot-b.slot||a.first-b.first);return candidates[0]?.value}
  const live=(preview:BoundPreview)=>{ensure();const p=previews.get(preview);if(active||!p||p.owner!==deck||p.version!==version||outstanding!==preview)fail();return p}
  const deck:BoundDeck={data,transitions:changes,frozenRowCount:draft.length,fromChoice,
   previewNext(){ensure();if(active)fail();revoke();const value=nextCandidate();if(!value)return;const preview:BoundPreview=freeze({data:dataFor(value.tasks),transitions:changes+1});previews.set(preview,{owner:deck,version,...value});outstanding=preview;return preview},
   commit(preview){const value=live(preview);revoke();changes++;currentVersion++;return make(value.tasks,value.states,currentVersion)},discard(preview){live(preview);revoke()},
   advance(slot){ensure();revoke();if(active||changes>=transitionLimit)fail();const group=joint?tasks.filter((t):t is Selection=>t.slot===slot&&t.kind==='selection').sort((a,b)=>cost(candidate(slot,a).tasks)-cost(candidate(slot,b).tasks)||Math.min(...a.claimIndexes)-Math.min(...b.claimIndexes))[0]:undefined,value=candidate(slot,group);changes++;currentVersion++;return make(value.tasks,value.states,currentVersion)},
   toReplacement(slot){ensure();if(rowStates.get(slot)!==1)fail();return deck.advance(slot)},next(){const preview=deck.previewNext();return preview?deck.commit(preview):undefined},activate(){ensure();revoke();if(active)fail();active=true},decode,
   decodeRoot(raw,record,legacy){ensure();const r=boundObject(raw);if(Reflect.ownKeys(r).length!==1)fail();if(Object.hasOwn(r,'answers')){if(Array.isArray(r.answers))return decode(r.answers,record);const values=boundObject(r.answers),keys=tasks.map((_,i)=>String(i+1));if(Reflect.ownKeys(values).length!==keys.length||keys.some(k=>!Object.hasOwn(values,k)))fail();return decode(keys.map(k=>values[k]),record)}if(Object.hasOwn(r,'repairs')&&legacy)return legacy(raw);return fail()},
   diagnostic(error){if(version!==currentVersion)return;const detail=sceneRosterRepairDiagnostic(error);if(!detail?.claimRef)return;const found:{taskNumber:number;localClaimNumber:number;reason:string}[]=[];tasks.forEach((task,at)=>{if(task.kind!=='claims')return;const r=rows.get(task.slot)!;if(detail.repairRef&&detail.repairRef!==r.repairRef)return;task.claimIndexes.forEach((index,local)=>{if(r.patch!.claims[index].claimRef===detail.claimRef)found.push({taskNumber:at+1,localClaimNumber:local+1,reason:detail.reason})})});return found.length===1?freeze(found[0]):undefined}}
  return deck
 }
 return make(initial,states,0)
}
export function sceneRosterBoundNativeSchema(tasks:readonly Task[],choiceCount:number):JSONSchema7{
 if(tasks.some(task=>task.kind==='claims'))fail()
 const object=(properties:Record<string,JSONSchema7>):JSONSchema7=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false}),array=(items:JSONSchema7,maxItems:number,minItems=0):JSONSchema7=>({type:'array',items,maxItems,minItems}),str:JSONSchema7={type:'string',minLength:1,pattern:'\\S',maxLength:300},integer:JSONSchema7={type:'integer',minimum:0,maximum:Number.MAX_SAFE_INTEGER},anchor=object({choice:{type:'integer',minimum:1,maximum:choiceCount}}),fields={mentions:array(object({literal:str,evidence:anchor}),50000,1),context:array(object({label:str,evidence:array(anchor,50000,1)}),50000),links:array(object({targetIndex:integer,relation:{type:'string',enum:['same-place','different-place','parent']},evidence:array(anchor,50000,1)}),20000)},record={...object({...fields,name:str,aliases:array(str,20),primaryMentionIndex:integer}),required:Object.keys(fields)}
 const key=(value:unknown):string=>JSON.stringify(value&&typeof value==='object'?Array.isArray(value)?value.map(part=>JSON.parse(key(part))):Object.fromEntries(Object.keys(value).sort().map(name=>[name,JSON.parse(key((value as Record<string,unknown>)[name]))])):value),leaves=new Map<string,JSONSchema7>()
 for(const task of tasks){if(task.kind==='claims')fail();for(const leaf of task.kind==='selection'?[{type:'integer',minimum:1,maximum:task.options.length} as JSONSchema7]:task.boundCanReject?[{type:'integer',enum:[0]} as JSONSchema7,record]:[record])if(!leaves.has(key(leaf)))leaves.set(key(leaf),leaf)}
 const branches=[...leaves.values()],items:JSONSchema7=branches.length>1?{anyOf:branches}:branches[0]??{type:'integer'}
 return object({answers:{type:'array',minItems:tasks.length,maxItems:tasks.length,items}})
}

/** The fully inlined strict three-record encoding verified by the static
 * keyed controls. Only current frozen task domains and choice count vary. */
export function sceneRosterKeyedInlineSchema(tasks:readonly Task[],choiceCount:number,selectionEncoding?:'object'):JSONSchema7{
 if(selectionEncoding!==undefined&&selectionEncoding!=='object')fail()
 if(!tasks.length||tasks.length>50000||!Number.isSafeInteger(choiceCount)||choiceCount<0)fail()
 const object=(properties:Record<string,JSONSchema7>):JSONSchema7=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false}),array=(items:JSONSchema7,maxItems:number,minItems=0):JSONSchema7=>({type:'array',items,maxItems,minItems}),str:JSONSchema7={type:'string',minLength:1,pattern:'\\S',maxLength:300},integer:JSONSchema7={type:'integer',minimum:0,maximum:Number.MAX_SAFE_INTEGER},anchor=object({choice:{type:'integer',minimum:1,maximum:choiceCount}}),fields={mentions:array(object({literal:str,evidence:anchor}),50000,1),context:array(object({label:str,evidence:array(anchor,50000,1)}),50000),links:array(object({targetIndex:integer,relation:{type:'string',enum:['same-place','different-place','parent']},evidence:array(anchor,50000,1)}),20000)},records=[object(fields),object({primaryMentionIndex:integer,...fields}),object({name:str,aliases:array(str,20),...fields})]
 return object({answers:object(Object.fromEntries(tasks.map((task,index)=>[String(index+1),task.kind==='selection'?(selectionEncoding==='object'?object({selection:{type:'integer',minimum:1,maximum:task.options.length}}):{type:'integer',minimum:1,maximum:task.options.length}):task.kind==='claims'?object({claimChoices:object(Object.fromEntries(task.domains.map((d,i)=>{if(!d.choices.length){if(!d.canReject)fail();return[String(i+1),{type:'array',items:{type:'integer'},minItems:0,maxItems:0}]}return[String(i+1),{type:'array',items:{type:'integer',enum:[...d.choices]},minItems:d.canReject?0:1,maxItems:d.kind==='mention'?1:Math.min(50000,d.choices.length)}]})))}):task.primaryRejectOnly&&task.boundCanReject?{type:'integer',enum:[0]}:{anyOf:task.boundCanReject?[{type:'integer',enum:[0]},...records]:records}])))})
}
/** An explicit alternative encoding; failed objects never fall back to arrays. */
export function sceneRosterKeyedAnswers(raw:unknown,taskCount:number):unknown[]{
 const own=(value:unknown):Record<string,unknown>=>{if(!value||typeof value!=='object'||Array.isArray(value)||types.isProxy(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail();for(const key of Reflect.ownKeys(value))if(typeof key!=='string'||!('value'in Object.getOwnPropertyDescriptor(value,key)!))fail();return value as Record<string,unknown>}
 if(!Number.isSafeInteger(taskCount)||taskCount<1||taskCount>50000)fail()
 const root=own(raw);if(Reflect.ownKeys(root).length!==1||!Object.hasOwn(root,'answers'))fail()
 const answers=own(root.answers),keys=Array.from({length:taskCount},(_,index)=>String(index+1))
 if(Reflect.ownKeys(answers).length!==taskCount||keys.some(key=>!Object.hasOwn(answers,key)))fail()
 return keys.map(key=>answers[key])
}

/** Lossless provider view only; private choice objects and resolvers stay unchanged. */
function legacySceneRosterBoundDisplay(plan:SceneRosterTargetedPlan){
 const copy=structuredClone(plan),indexes=new Map<string,number>()
 for(const[at,choice]of copy.choices.entries()){if(typeof choice.choiceRef!=='string'||!/^cf[0-9a-f]{16}$/u.test(choice.choiceRef)||indexes.has(choice.choiceRef))fail();indexes.set(choice.choiceRef,at+1)}
 const number=(ref:string)=>{const value=indexes.get(ref);if(value===undefined)fail();return value}
 const refs=(values:readonly string[])=>{if(!Array.isArray(values))fail();return values.map(number)}
 const rows=copy.rows.map(row=>({...row,candidates:row.candidates.map(({choiceRefs,...value})=>({...value,choices:refs(choiceRefs)})),keep:{...row.keep,mentions:row.keep.mentions.map(({choiceRef,...value})=>({...value,choice:number(choiceRef)})),context:row.keep.context.map(({choiceRef,...value})=>({...value,choice:number(choiceRef)})),links:row.keep.links.map(({choiceRefs,...value})=>({...value,choices:refs(choiceRefs)}))},...(row.patch?{patch:{...row.patch,claims:row.patch.claims.map(({eligibleChoiceRefs,...value})=>({...value,eligibleChoices:refs(eligibleChoiceRefs)}))}}:{})}))
 return freeze({...copy,rows,choices:copy.choices.map((choice,index)=>[index+1,choice.choiceRef,choice.unitIndex,choice.start,choice.end,choice.sourceRef??null,(choice.wholeUnit?1:0)|(choice.preserved?2:0),[...choice.literals]])})
}

function legacySceneRosterBoundTaskDisplay(tasks:readonly Task[]):TaskDisplay[]{return freeze(structuredClone(tasks).map((task,index)=>{if(task.kind!=='selection')return{answerNumber:index+1,...task};const{claims:_,...value}=task;return{answerNumber:index+1,...value,options:task.options.map((assignment,at)=>[at+1,assignment] as const)}}))}
const CLAIM_COLUMNS=['claimRef','kind','index','evidenceIndex','literal','label','targetIndex','relation','canReject','eligibleChoices'] as const
function columnClaim(claim:unknown,choiceCount:number):unknown[]{
 const c=boundObject(claim),common=['claimRef','kind','index','canReject','eligibleChoices'],fields=c.kind==='mention'?[...common,'literal']:c.kind==='context'?[...common,'evidenceIndex','label']:c.kind==='link'?[...common,'evidenceIndex','targetIndex','relation']:undefined
 if(!fields||Reflect.ownKeys(c).length!==fields.length||fields.some(key=>!Object.hasOwn(c,key)))fail()
 if(typeof c.claimRef!=='string'||!/^pc[0-9a-f]{16}$/u.test(c.claimRef)||typeof c.index!=='number'||!Number.isSafeInteger(c.index)||c.index<0||typeof c.canReject!=='boolean')fail()
 const eligible=boundArray(c.eligibleChoices);if(eligible.some(n=>typeof n!=='number'||!Number.isSafeInteger(n)||n<1||n>choiceCount))fail()
 const text=(value:unknown)=>typeof value==='string'&&value.length>0&&value.length<=300&&!!value.trim()&&value.isWellFormed()
 if(c.kind==='mention'){if(!text(c.literal))fail()}else{if(c.canReject!==true||typeof c.evidenceIndex!=='number'||!Number.isSafeInteger(c.evidenceIndex)||c.evidenceIndex<0)fail();if(c.kind==='context'){if(!text(c.label))fail()}else if(typeof c.targetIndex!=='number'||!Number.isSafeInteger(c.targetIndex)||c.targetIndex<0||!['same-place','different-place','parent'].includes(c.relation as string))fail()}
 let mask=0;const values:unknown[]=[];CLAIM_COLUMNS.forEach((key,index)=>{if(Object.hasOwn(c,key)){mask+=2**index;values.push(c[key])}});return[mask,...values]
}
function columnarSceneRosterBoundDisplay(plan:SceneRosterTargetedPlan){const shown=legacySceneRosterBoundDisplay(plan),rows=shown.rows.map(row=>{const{patch,...rest}=row;if(!patch)return rest;if(Reflect.ownKeys(patch).length!==1||!Array.isArray(patch.claims))fail();return{...rest,patch:{claimRows:patch.claims.map(claim=>columnClaim(claim,shown.choices.length))}}});return freeze({...shown,rows,claimColumns:[...CLAIM_COLUMNS],claimTableVersion:1 as const})}
export function sceneRosterBoundDisplay(plan:SceneRosterTargetedPlan,columnar?:false):ReturnType<typeof legacySceneRosterBoundDisplay>
export function sceneRosterBoundDisplay(plan:SceneRosterTargetedPlan,columnar:true):ReturnType<typeof columnarSceneRosterBoundDisplay>
export function sceneRosterBoundDisplay(plan:SceneRosterTargetedPlan,columnar=false){return columnar?columnarSceneRosterBoundDisplay(plan):legacySceneRosterBoundDisplay(plan)}
function thinSceneRosterBoundTaskDisplay(tasks:readonly Task[],plan:SceneRosterTargetedPlan){const rows=new Map<number,Row>();for(const row of plan.rows){if(rows.has(row.slot))fail();rows.set(row.slot,row)}const refs=new Map<string,number>();for(const[c,index]of plan.choices.map((c,i)=>[c,i] as const)){if(refs.has(c.choiceRef))fail();refs.set(c.choiceRef,index+1)}return freeze(legacySceneRosterBoundTaskDisplay(tasks).map(task=>{if(task.kind!=='claims')return task;const row=rows.get(task.slot);if(!row?.patch||new Set(task.claimIndexes).size!==task.claimIndexes.length)fail();const domains=task.claimIndexes.map(index=>{if(!Number.isSafeInteger(index)||index<0||index>=row.patch!.claims.length)fail();const c=row.patch!.claims[index];return{kind:c.kind,canReject:c.canReject,choices:c.eligibleChoiceRefs.map(ref=>{const n=refs.get(ref);if(n===undefined)fail();return n})}});if(JSON.stringify(domains)!==JSON.stringify(task.domains))fail();const{domains:_,...copy}=task;return copy}))}
export function sceneRosterBoundTaskDisplay(tasks:readonly Task[]):TaskDisplay[]
export function sceneRosterBoundTaskDisplay(tasks:readonly Task[],plan:SceneRosterTargetedPlan):ReturnType<typeof thinSceneRosterBoundTaskDisplay>
export function sceneRosterBoundTaskDisplay(tasks:readonly Task[],plan?:SceneRosterTargetedPlan){return plan?thinSceneRosterBoundTaskDisplay(tasks,plan):legacySceneRosterBoundTaskDisplay(tasks)}
function diagnosticValue(value:unknown,stack=new Set<object>(),budget={nodes:0}):boolean{
 if(!value||typeof value!=='object')return typeof value!=='function'&&typeof value!=='symbol'
 if(++budget.nodes>100000||types.isProxy(value)||stack.has(value))return false
 const proto=Object.getPrototypeOf(value);if(Array.isArray(value)){try{boundArray(value)}catch{return false}}else if(proto!==Object.prototype&&proto!==null)return false
 stack.add(value);try{for(const key of Reflect.ownKeys(value)){if(typeof key!=='string')return false;const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor||!('value'in descriptor)||!diagnosticValue(descriptor.value,stack,budget))return false}return true}finally{stack.delete(value)}
}
/** Called only after the unchanged accepting gate rejects. No answer is adopted. */
export function sceneRosterBoundAnswerDiagnostics(raw:unknown,tasks:readonly Task[],recordValid:(value:unknown)=>boolean,selectionEncoding?:'object'):string[]{
 try{
  if(!raw||typeof raw!=='object'||types.isProxy(raw)||Array.isArray(raw)||Reflect.ownKeys(raw).length!==1||!Object.hasOwn(raw,'answers'))return['当前根只能有answers任务键对象；键恰为全部answerNumber，不使用roster、repairs或其它根字段。']
  const descriptor=Object.getOwnPropertyDescriptor(raw,'answers'),answers=descriptor&&'value'in descriptor?descriptor.value:undefined
  if(answers&&typeof answers==='object'&&types.isProxy(answers))return[]
  if(answers&&typeof answers==='object'&&!Array.isArray(answers)){try{return sceneRosterBoundAnswerDiagnostics({answers:sceneRosterKeyedAnswers(raw,tasks.length)},tasks,recordValid,selectionEncoding)}catch{return['answers任务键必须恰为1..'+tasks.length+'，不加键、不缺键、不用01等替代编号；每键仅填该任务答案。']}}
  if(!Array.isArray(answers))return['answers必须是完整任务键对象；每个answerNumber键对应一个任务答案，不使用字符串、空值或其它类型。']
  if(answers.length!==tasks.length)return['answers必须恰好'+tasks.length+'项；当前收到'+answers.length+'项。按answerNumber顺序每任务一答，不按claim数或共享choices数增删答案。']
  for(const [index,task]of tasks.entries()){
   const descriptor=Object.getOwnPropertyDescriptor(answers,String(index)),rawValue=descriptor&&'value'in descriptor?descriptor.value:undefined
   if(!diagnosticValue(rawValue))return[]
   let value=rawValue;try{if(task.kind==='selection')value=selectionValue(rawValue,task)}catch{/* The original task-local refusal below remains authoritative. */}
   if(task.kind==='selection'){if(typeof value!=='number'||!Number.isSafeInteger(value)||value<1||value>task.options.length)return[selectionEncoding==='object'?'第'+(index+1)+'项是selection，只填{"selection":optionNumber}，optionNumber须为本任务局部整数1..'+task.options.length+'；不使用共享choices号、0、数组或其它字段。':'第'+(index+1)+'项是selection，只能填本任务印出的整数optionNumber 1..'+task.options.length+'；不是共享choices号，不填0、数组或对象。']}
   else if(task.kind==='claims'){try{claimNumbers(rawValue,task)}catch{return['第'+(index+1)+'项是claims，须只含claimChoices对象；局部键恰为1..'+task.claimIndexes.length+'，各值为该项完整域内的共享号数组，mention恰1个，[]仅canReject可用；不填replacement、全局claim号或CF。']}}
   else if(value===0){if(!task.boundCanReject)return['第'+(index+1)+'项是replacement且不可答0，必须给完整replacement对象。']}
   else if(!recordValid(value))return['第'+(index+1)+'项replacement须有mentions/context/links三数组。mention.evidence是单个{"choice":共享号}对象；context/link.evidence是非空对象数组。metadata三选一：全部省略；仅primaryMentionIndex；或同时name与aliases。不得混合、补字段或用旧ref。']
  }
 }catch{/* Diagnostics must not replace the original failure. */}
 return[]
}
