import assert from 'node:assert/strict'
import {test} from 'node:test'
import {sceneRosterBoundDisplay,sceneRosterBoundTaskDisplay} from '../../desktop/service/novel-import-scene-roster-bound-decisions'
import type {SceneRosterTargetedPlan} from '../../desktop/service/novel-import-scene-roster-targeted-repair'
import {expandTargetedClaimView} from '../helpers/novel-import-targeted-claim-view-fixture'
import {expandBoundTaskDisplay} from '../helpers/novel-import-bound-task-display-fixture'
import {assertBoundNativeShape} from '../helpers/novel-import-bound-native-shape-fixture'
import {bridge,request,bad,good} from '../helpers/novel-import-claim-patch-fixture'
import {boundReply} from '../helpers/novel-import-bound-decisions-fixture'
import {sceneRosterGenerationSchema} from '../../desktop/service/novel-import-ai'
import {serializeImportAiPayload,IMPORT_JSON_WRAPPER_RESERVE_BYTES} from '../../desktop/core/novel-import-ai-payload'
import {IMPORT_FIXED_PROMPT_RESERVE_BYTES} from '../../desktop/core/novel-import-budget-policy'
import type {generateText} from '../../src/lib/ai/generate'

const cfA='cf'+'a'.repeat(16),cfB='cf'+'b'.repeat(16),cfC='cf'+'c'.repeat(16),ef='ef'+'d'.repeat(16),rr='rr'+'e'.repeat(16),pc=(n:number)=>'pc'+String(n).repeat(16)
function plan():SceneRosterTargetedPlan{return{choices:[{choiceRef:cfA,unitIndex:7,start:1,end:15,sourceRef:ef,wholeUnit:true,preserved:true,literals:['甲室😀',cfB]},{choiceRef:cfB,unitIndex:2,start:10,end:31,literals:['乙室\r\n']},{choiceRef:cfC,unitIndex:9,start:0,end:8,preserved:true,literals:['丙室']}],rows:[
 {repairRef:rr,slot:9,canReject:false,requiredSpellings:['甲室'+cfA],candidates:[{literal:'甲室'+cfA,choiceRefs:[cfC,cfA,cfC]},{literal:cfB,choiceRefs:[]}],keep:{mentions:[{literal:'甲室'+cfB,choiceRef:cfA}],context:[{label:'东馆'+cfC,choiceRef:cfB}],links:[{targetIndex:2,relation:'parent',choiceRefs:[cfB,cfA,cfB]}]},patch:{claims:[{claimRef:pc(0),kind:'mention',index:3,literal:'甲室'+cfA,canReject:false,eligibleChoiceRefs:[cfA,cfC,cfA]},{claimRef:pc(1),kind:'context',index:2,evidenceIndex:1,label:'东馆'+cfB,canReject:true,eligibleChoiceRefs:[cfB,cfC]},{claimRef:pc(2),kind:'link',index:0,evidenceIndex:2,targetIndex:2,relation:'parent',canReject:true,eligibleChoiceRefs:[cfC,cfA,cfC]}]}},
 {repairRef:'rr'+'f'.repeat(16),slot:2,canReject:true,requiredSpellings:[],candidates:[{literal:'丙室',choiceRefs:[cfC]}],keep:{mentions:[],context:[],links:[]}},
 {repairRef:'rr'+'1'.repeat(16),slot:4,canReject:true,requiredSpellings:[],candidates:[],keep:{mentions:[],context:[],links:[]}}
]}}
type Task=Parameters<typeof sceneRosterBoundTaskDisplay>[0][number]
function tasks(input=plan()):Task[]{const indexes=[2,0,1],claims=indexes.map(i=>{const{claimRef,eligibleChoiceRefs,...value}=input.rows[0].patch!.claims[i];return value});return[{kind:'selection',slot:9,claimIndexes:indexes,claims,options:[[[3,1],[1],[2]],[[1],[3],[3,2]],[[],[1],[]]]},{kind:'replacement',slot:2,canReject:true,boundCanReject:true},{kind:'replacement',slot:4,canReject:true,boundCanReject:false,blockedRejectReason:'good-row-incoming-link'}]}
/** Independent handwritten inverse for the app's provider view only. Never
 * decodes model answers or asks a production formatter to supply expectations. */
function inverseClaims(view:any,patch:any):any[]{
 if(!Object.hasOwn(patch,'claimRows')){assert.ok(Array.isArray(patch.claims));return patch.claims}
 const columns=['claimRef','kind','index','evidenceIndex','literal','label','targetIndex','relation','canReject','eligibleChoices']
 assert.equal(view.claimTableVersion,1);assert.deepEqual(view.claimColumns,columns);assert.equal(Object.hasOwn(patch,'claims'),false);assert.ok(Array.isArray(patch.claimRows))
 return patch.claimRows.map((tuple:unknown)=>{
  assert.ok(Array.isArray(tuple));const mask=tuple[0];assert.ok(Number.isSafeInteger(mask)&&mask>=0&&mask<1<<columns.length)
  const claim:Record<string,any>={};let at=1
  for(const[index,column]of columns.entries())if(mask&(1<<index)){assert.ok(at<tuple.length);claim[column]=tuple[at++]}
  assert.equal(at,tuple.length);assert.equal(typeof claim.claimRef,'string');assert.ok(['mention','context','link'].includes(claim.kind));assert.ok(Number.isSafeInteger(claim.index)&&claim.index>=0);assert.equal(typeof claim.canReject,'boolean');assert.ok(Array.isArray(claim.eligibleChoices))
  if(Object.hasOwn(claim,'evidenceIndex'))assert.ok(Number.isSafeInteger(claim.evidenceIndex)&&claim.evidenceIndex>=0)
  if(claim.kind==='mention')assert.equal(typeof claim.literal,'string');else if(claim.kind==='context')assert.equal(typeof claim.label,'string');else{assert.ok(Number.isSafeInteger(claim.targetIndex)&&claim.targetIndex>=0);assert.ok(['same-place','different-place','parent'].includes(claim.relation))}
  return claim
 })
}
function inverseRows(view:any){const ref=(n:number)=>{assert.ok(Number.isSafeInteger(n)&&n>=1&&n<=view.choices.length);return view.choices[n-1][1] as string};return view.rows.map((row:any)=>{let patch;if(row.patch){const{claimRows,claims,...metadata}=row.patch;patch={...metadata,claims:inverseClaims(view,row.patch).map(({eligibleChoices,...value}:any)=>({...value,eligibleChoiceRefs:eligibleChoices.map(ref)}))}}return{...row,candidates:row.candidates.map(({choices,...value}:any)=>({...value,choiceRefs:choices.map(ref)})),keep:{...row.keep,mentions:row.keep.mentions.map(({choice,...value}:any)=>({...value,choiceRef:ref(choice)})),context:row.keep.context.map(({choice,...value}:any)=>({...value,choiceRef:ref(choice)})),links:row.keep.links.map(({choices,...value}:any)=>({...value,choiceRefs:choices.map(ref)}))},...(patch?{patch}:{})}})}

test('CV01: all four CF field families roundtrip exactly without touching opaque text, metadata or directory flags',()=>{
 const input=plan(),before=structuredClone(input),shown=sceneRosterBoundDisplay(input) as any
 assert.deepEqual(shown.choices,[[1,cfA,7,1,15,ef,3,['甲室😀',cfB]],[2,cfB,2,10,31,null,0,['乙室\r\n']],[3,cfC,9,0,8,null,2,['丙室']]])
 assert.deepEqual(shown.rows[0].candidates[0].choices,[3,1,3]);assert.equal(shown.rows[0].keep.mentions[0].choice,1);assert.equal(shown.rows[0].keep.context[0].choice,2);assert.deepEqual(shown.rows[0].keep.links[0].choices,[2,1,2]);assert.deepEqual(shown.rows[0].patch.claims[0].eligibleChoices,[1,3,1])
 assert.deepEqual(inverseRows(shown),input.rows);assert.deepEqual(input,before);assert.equal(shown.rows[0].repairRef,rr);assert.equal(shown.rows[0].patch.claims[0].claimRef,pc(0));assert.equal(shown.rows[0].candidates[0].literal,'甲室'+cfA);assert.equal(shown.rows[0].keep.context[0].label,'东馆'+cfC)
 assert.ok(Object.isFrozen(shown)&&Object.isFrozen(shown.rows[0].patch.claims[0].eligibleChoices));assert.throws(()=>{shown.rows[0].keep.links[0].choices.push(1)})
})

test('CV02: sparse slot and zero-based claim order restore every task and assignment exactly from the shared directory',()=>{
 const input=plan(),privateTasks=tasks(input),before=structuredClone(privateTasks),view=sceneRosterBoundDisplay(input) as any,shown=sceneRosterBoundTaskDisplay(privateTasks) as any[]
 assert.equal(Object.hasOwn(shown[0],'claims'),false,'duplicate claim metadata is omitted only in the provider task view');assert.deepEqual(shown[0].claimIndexes,[2,0,1]);assert.deepEqual(shown[0].options,[[1,[[3,1],[1],[2]]],[2,[[1],[3],[3,2]]],[3,[[],[1],[]]]])
 const rows=inverseRows(view),restored=shown.map(({answerNumber,...task}:any,index:number)=>{assert.equal(answerNumber,index+1);if(task.kind!=='selection')return task;const row=rows.find((r:any)=>r.slot===task.slot);assert.ok(row);return{...task,claims:task.claimIndexes.map((i:number)=>{const{claimRef,eligibleChoiceRefs,...claim}=row.patch.claims[i];return claim}),options:task.options.map(([number,assignment]:any,at:number)=>{assert.equal(number,at+1);return assignment})}})
 assert.deepEqual(restored,privateTasks);assert.deepEqual(privateTasks,before);assert.deepEqual(shown[1],{answerNumber:2,...privateTasks[1]});assert.deepEqual(shown[2],{answerNumber:3,...privateTasks[2]});assert.ok(Object.isFrozen(shown[0].options))
})

test('CV03: missing, duplicate or malformed CF mappings fail closed instead of taking the first or dropping a domain',async t=>{
 const changes:[string,(p:SceneRosterTargetedPlan)=>void][]=[['duplicate table CF',p=>{p.choices[1].choiceRef=cfA}],['malformed table CF',p=>{p.choices[0].choiceRef='not-a-CF'}],['missing candidate CF',p=>{p.rows[0].candidates[0].choiceRefs.push('cf'+'0'.repeat(16))}],['missing keep mention CF',p=>{p.rows[0].keep.mentions[0].choiceRef='cf'+'0'.repeat(16)}],['missing keep context CF',p=>{p.rows[0].keep.context[0].choiceRef='cf'+'0'.repeat(16)}],['missing keep link CF',p=>{p.rows[0].keep.links[0].choiceRefs.push('cf'+'0'.repeat(16))}],['missing eligible CF',p=>{p.rows[0].patch!.claims[0].eligibleChoiceRefs.push('cf'+'0'.repeat(16))}]]
 for(const[label,change]of changes)await t.test(label,()=>{const input=plan();change(input);const before=structuredClone(input);assert.throws(()=>sceneRosterBoundDisplay(input));assert.deepEqual(input,before)})
})

test('CV04: shared readers strictly restore sparse claims and CF fields, while explicit legacy display stays supported',async t=>{
 const input=plan(),privateTasks=tasks(input),shown=sceneRosterBoundDisplay(input),taskView=sceneRosterBoundTaskDisplay(privateTasks),before=structuredClone({shown,taskView})
 assert.deepEqual(expandTargetedClaimView(shown),input);assert.deepEqual(expandTargetedClaimView(input),input)
 assert.deepEqual(expandBoundTaskDisplay(taskView,expandTargetedClaimView(shown).rows),privateTasks)
 const legacy=privateTasks.map((task,index)=>({...task,answerNumber:index+1,...(task.kind==='selection'?{options:task.options.map((assignment,at)=>[at+1,assignment])}:{})}))
 assert.deepEqual(expandBoundTaskDisplay(legacy),privateTasks);assert.deepEqual(expandBoundTaskDisplay(legacy,input.rows),privateTasks);assert.deepEqual({shown,taskView},before)
 const badRows:[string,(v:any)=>void][]=[['zero shared number',v=>{v.rows[0].keep.mentions[0].choice=0}],['out-of-range number',v=>{v.rows[0].patch.claims[0].eligibleChoices.push(4)}],['fractional number',v=>{v.rows[0].candidates[0].choices=[1.5]}],['numeric string is not an index',v=>{v.rows[0].keep.context[0].choice='1'}],['mixed old/new reference keys',v=>{v.rows[0].keep.links[0].choiceRefs=[cfA]}],['missing reference key',v=>{delete v.rows[0].candidates[0].choices}],['duplicate directory identity',v=>{v.choices[1][1]=cfA}],['bad directory geometry',v=>{v.choices[0][4]=v.choices[0][3]}]]
 for(const[label,change]of badRows)await t.test(label,()=>{const value=structuredClone(shown);change(value);assert.throws(()=>expandTargetedClaimView(value),/TEST_.*INVALID/u)})
 const badTasks:[string,(v:any)=>void][]=[['unknown sparse slot',v=>{v[0].slot=0}],['out-of-range zero-based claim',v=>{v[0].claimIndexes[0]=3}],['fractional claim index',v=>{v[0].claimIndexes[0]=1.5}],['wrong local option number',v=>{v[0].options[0][0]=2}],['conflicting duplicate claims',v=>{v[0].claims=[]}]]
 for(const[label,change]of badTasks)await t.test(label,()=>{const value=structuredClone(taskView);change(value);assert.throws(()=>expandBoundTaskDisplay(value,input.rows),/TEST_BOUND_TASK_DISPLAY_INVALID/u)})
 assert.throws(()=>expandBoundTaskDisplay(taskView),/TEST_BOUND_TASK_DISPLAY_INVALID/u);assert.throws(()=>expandBoundTaskDisplay(taskView,[...input.rows,input.rows[0]]),/TEST_BOUND_TASK_DISPLAY_INVALID/u)
})

type Options=Parameters<typeof generateText>[0]
function promptOf(option:Options){assert.ok('prompt'in option);return option.prompt}
function schemaOf(option:Options){assert.ok(option.jsonOutputSchema);return option.jsonOutputSchema}
function sizedRequest(capacity:number){const r=request();for(const role of ['text','review']as const)r.models[role]={...r.models[role]!,contextWindow:capacity};return r}
function tag(prompt:string,name:string){const open='<'+name+'>',at=prompt.lastIndexOf(open);assert.ok(at>=0);return JSON.parse(prompt.slice(at+open.length,prompt.indexOf('</'+name+'>',at)))}
function materials(option:Options,r:ReturnType<typeof request>,first:unknown,current?:unknown){
 const prompt=promptOf(option),raw=tag(prompt,'scene-roster-targeted-repair'),deck=tag(prompt,'scene-roster-bound-repair'),restored=expandTargetedClaimView(raw)
 assert.ok(prompt.includes(serializeImportAiPayload(r)),'all original source payload remains in the actual SDK prompt')
 const frames=[...prompt.matchAll(/<previous-scene-roster-output>(.*?)<\/previous-scene-roster-output>/gsu)].map(m=>JSON.parse(m[1]))
 assert.ok(frames.some(frame=>frame.format==='json'&&JSON.stringify(frame.value)===JSON.stringify(first)),'the full original draft remains')
 if(current!==undefined)assert.ok(frames.some(frame=>frame.format==='json'&&JSON.stringify(frame.value)===JSON.stringify(current)),'the full latest failed answer remains')
 assert.deepEqual(inverseRows(raw),restored.rows);assert.ok(raw.rows[0].patch.claimRows.length>0);assert.ok(inverseClaims(raw,raw.rows[0].patch).every((claim:any)=>Array.isArray(claim.eligibleChoices)&&!Object.hasOwn(claim,'eligibleChoiceRefs')))
 assert.ok(raw.rows.every((row:any)=>Object.hasOwn(row,'keep')));assert.ok(deck.tasks.every((task:any)=>task.kind!=='selection'||!Object.hasOwn(task,'claims')));assert.ok(deck.tasks.every((task:any)=>task.kind!=='claims'||!Object.hasOwn(task,'domains')))
 const privateTasks=expandBoundTaskDisplay(deck.tasks,restored.rows,restored.choices);assert.ok(privateTasks.some(task=>task.kind==='claims'),'fresh primary tasks retain the complete claims representation')
 for(const task of privateTasks)if(task.kind!=='replacement'){
  const row=raw.rows.find((row:any)=>row.slot===task.slot);assert.ok(row?.patch);const claims=inverseClaims(raw,row.patch)
  if(task.kind==='claims')assert.deepEqual(task.domains,task.claimIndexes.map((index:number)=>{const claim=claims[index];return{kind:claim.kind,canReject:claim.canReject,choices:claim.eligibleChoices}}))
  else assert.deepEqual(task.claims,task.claimIndexes.map((index:number)=>{const{claimRef,eligibleChoiceRefs,...claim}=restored.rows.find(row=>row.slot===task.slot)!.patch!.claims[index];return claim}))
 }
 for(const row of raw.rows)if(row.patch&&!privateTasks.some(task=>task.slot===row.slot&&task.kind==='replacement')){const indexes=privateTasks.filter(task=>task.slot===row.slot).flatMap(task=>task.claimIndexes);assert.equal(new Set(indexes).size,indexes.length,'mixed tasks must not duplicate any original position');assert.deepEqual(indexes.sort((a:number,b:number)=>a-b),inverseClaims(raw,row.patch).map((_:unknown,index:number)=>index),'mixed tasks must cover every original claim exactly once')}
 assert.ok(privateTasks.every(task=>task.kind!=='selection'||task.claims.length===task.claimIndexes.length))

 assert.ok(prompt.includes('claimIndexes零基')&&prompt.includes('targeted.rows同slot的原claim行')&&prompt.includes('claimColumns[i]')&&prompt.includes('mask的(1<<i)')&&prompt.includes('choice/choices/eligibleChoices'))
 const expected={tasks:privateTasks,choices:raw.choices,selectionEncoding:deck.selectionEncoding};assertBoundNativeShape(schemaOf(option),expected)
 assert.deepEqual(schemaOf(option).required,['answers']);assert.equal(option.maxOutputTokens,undefined)
 return{raw,deck,schema:schemaOf(option)}
}

test('CV05: fresh primary claims and frozen generations retain all complete views at N and stop before N-1',async t=>{
 for(const target of [2,3,4])await t.test('generation '+target,async()=>{
  const run=async(r:ReturnType<typeof request>,options:Options[])=>{const failed:unknown[]=[];const result=await bridge(bad(),(reply,_plan,prompt,actual)=>{const answer=boundReply(prompt,reply,actual);if(options.length===target)return answer;const invalid={answers:[...answer.answers,...Array.from({length:256*(options.length-1)},()=>Number.MAX_SAFE_INTEGER)]};failed.push(structuredClone(invalid));return invalid},{request:r,options});return{...result,failed}}
  const baselineOptions:Options[]=[],baseline=await run(sizedRequest(1048576),baselineOptions),last=baselineOptions[target-1],baselineData=materials(last,request(),bad(),baseline.failed.at(-1))
  assert.equal(baselineOptions.length,target);assert.equal(baseline.model.doStreamCalls.length,target);assert.equal(baseline.usageRows.length,target)
  const initial=materials(baselineOptions[1],request(),bad());assert.deepEqual(baselineData,initial,'the complete directory, all task domains and Native schema remain frozen on retries')
  const required=Buffer.byteLength(promptOf(last)+JSON.stringify(schemaOf(last)),'utf8')+6000
  assert.ok(Buffer.byteLength(promptOf(last),'utf8')>promptOf(last).length);for(const previous of baselineOptions.slice(0,-1))assert.ok(Buffer.byteLength(promptOf(previous)+JSON.stringify(schemaOf(previous)),'utf8')+6000<required)
  const exactOptions:Options[]=[],exact=await run(sizedRequest(required),exactOptions);assert.equal(exactOptions.length,target);assert.equal(exact.model.doStreamCalls.length,target);assert.equal(exact.usageRows.length,target);assert.equal(promptOf(exactOptions[target-1]),promptOf(last));assert.deepEqual(schemaOf(exactOptions[target-1]),schemaOf(last));assert.deepEqual(exact.result,sceneRosterGenerationSchema(request()).parse(good()))
  const smallOptions:Options[]=[];await assert.rejects(run(sizedRequest(required-1),smallOptions),/预算/u);assert.equal(smallOptions.length,target-1,'primary claims are already smaller than this fixture replacement; no SDK call exceeds the complete context')
 })
})

test('CV06: the active fixed prompt reserve N/N+1 includes the complete compact views, current reply and original Native schema',async()=>{
 assert.equal(IMPORT_FIXED_PROMPT_RESERVE_BYTES,65536);assert.equal(IMPORT_JSON_WRAPPER_RESERVE_BYTES,16384)
 const run=async(padding:number,options:Options[])=>{let current:unknown;const result=await bridge(bad(),(reply,_plan,prompt,r)=>{const answer=boundReply(prompt,reply,r);if(options.length===2){current={...answer,CV_UNTRUSTED_PADDING:'x'.repeat(padding)};return current}return answer},{request:sizedRequest(1048576),options});return{...result,current}}
 const baselineOptions:Options[]=[],baseline=await run(0,baselineOptions),payload=serializeImportAiPayload(request()),last=baselineOptions[2];assert.equal(baseline.model.doStreamCalls.length,3);materials(last,request(),bad(),baseline.current)
 const room=65536-Buffer.byteLength(promptOf(last),'utf8')+Buffer.byteLength(payload,'utf8')-16384;assert.ok(Number.isSafeInteger(room)&&room>0)
 const exactOptions:Options[]=[],exact=await run(room,exactOptions);assert.equal(exactOptions.length,3);assert.equal(exact.model.doStreamCalls.length,3);materials(exactOptions[2],request(),bad(),exact.current)
 assert.equal(Buffer.byteLength(promptOf(exactOptions[2]),'utf8')-Buffer.byteLength(payload,'utf8')+16384,65536);assert.ok(Buffer.byteLength(JSON.stringify(schemaOf(exactOptions[2])),'utf8')<=65536);assert.ok(Buffer.byteLength(promptOf(exactOptions[2])+JSON.stringify(schemaOf(exactOptions[2])),'utf8')+6000<=1048576)
 const oversizedOptions:Options[]=[];await assert.rejects(run(room+1,oversizedOptions),/预算/u);assert.equal(oversizedOptions.length,2,'an activated frozen contract cannot switch task geometry to hide one extra byte')
})
