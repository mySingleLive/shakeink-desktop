// docs/529 SC-11 (530 中3): the targeted, bound and root-envelope repair suite on a compact (12-character ref) packet.
import {expandChoiceDirectory} from '../helpers/novel-import-choice-directory-fixture'
import assert from 'node:assert/strict'
import {test} from 'node:test'
import {generateImportAiJson,runImportAi,sceneRosterGenerationSchema} from '../../desktop/service/novel-import-ai'
import {createSceneRosterFragmentTable,sceneRosterFragmentWidth} from '../../desktop/core/novel-import-scene-roster-fragments'
import {StructuredGenerationError} from '../../src/lib/ai/generate'
import {explicitTargetedRosterReply} from '../helpers/novel-import-targeted-repair-fixture'
import type {ResolvedModel} from '../../src/lib/ai/provider'
import type {ImportAiRequest,ImportModel} from '../../desktop/shared/novel-import'

const opening='<scene-roster-targeted-repair>',closing='</scene-roster-targeted-repair>'
const wide='完整合成资料😀'.repeat(80)+'东宅的甲室门已打开。',alias='东宅的阅览间就是甲室。',west='西宅的乙室门已关闭。'
const model:ImportModel={id:'tr-model',name:'合成模型',modelId:'synthetic',endpoint:'https://synthetic.invalid/v1',authRevision:1,contextWindow:1048576}
function request():ImportAiRequest{return{semanticVersion:1,operationId:'tr-op',phase:'analyze',intent:'roster',kind:'scene',sceneIdentity:{version:1,mode:'roster'},models:{text:{...model},review:{...model,id:'tr-review'}},units:[wide+'\r\n'+alias,west].map((text,i)=>({id:'tr-unit-'+i,fileId:'working',start:i*2000,end:i*2000+text.length,text,kind:'body'})),artifacts:[],workingRevision:0,sceneFragmentRefs:{version:1,width:12}}}
const raw=(unitId:string,quote:string)=>({unitId,quote})
function good(){return{roster:[{mentions:[{literal:'甲室',evidence:raw('tr-unit-0',wide)},{literal:'阅览间',evidence:raw('tr-unit-0',alias)}],context:[{label:'东宅',evidence:[raw('tr-unit-0',wide)]}],links:[{targetIndex:1,relation:'different-place',evidence:[raw('tr-unit-0',wide),raw('tr-unit-1',west)]}]},{mentions:[{literal:'乙室',evidence:raw('tr-unit-1',west)}],context:[{label:'西宅',evidence:[raw('tr-unit-1',west)]}],links:[]}]}}
function first(){const value=good();value.roster[0].mentions[1].evidence.quote='TR-UNMATCHED-PRIVATE-QUOTE';return value}
type Plan={rows:{repairRef:string;slot:number;canReject:boolean;requiredSpellings:string[]}[];choices:{choiceRef:string;unitId:string;quote?:string;sourceRef?:string;literals:string[]}[]}
function planOf(prompt:string):Plan|undefined{const start=prompt.indexOf(opening),end=prompt.indexOf(closing,start+opening.length);if(start<0||end<0)return;const plan=JSON.parse(prompt.slice(start+opening.length,end));return{...plan,choices:expandChoiceDirectory(plan.choices)}}
const generated=(value:unknown)=>({text:JSON.stringify(value),promptTokens:1,completionTokens:2,cost:0,finishReason:'stop'})
async function bridge(input:ImportAiRequest,bad:unknown,reply:(plan:Plan|undefined,prompt:string)=>unknown,prompts:string[]=[],options:{encode:boolean}={encode:false}){return runImportAi(input,new AbortController().signal,{resolve:async role=>input.models[role]!,assert:async()=>{},generate:async(r,_m,signal,prompt)=>generateImportAiJson(r,{userId:'tr',resolvedModel:{} as ResolvedModel},signal,prompt,{generateText:async opts=>{assert.ok(!Object.hasOwn(opts,'repair'));const prompt='prompt'in opts?opts.prompt:'';prompts.push(prompt);if(prompts.length===1)return generated(bad);const expected=reply(planOf(prompt),prompt);return generated(options.encode?explicitTargetedRosterReply(prompt,expected,r.units):expected)}})})}

test('[compact] TR01: only declared bad slots are replaced while verified rows and complete evidence windows stay unchanged',async()=>{
 const input=request(),before=structuredClone(input),bad=first(),badBefore=structuredClone(bad),expected=sceneRosterGenerationSchema(input).parse(good()),table=createSceneRosterFragmentTable(input.units,sceneRosterFragmentWidth(input)),prompts:string[]=[]
 const result=await bridge(input,bad,plan=>{
  const replacement=structuredClone(good().roster[0]),choice=plan?.choices.find(choice=>choice.literals.includes('阅览间')&&(choice.quote??(choice.sourceRef?table.resolve(choice.sourceRef).quote:''))===alias)
  // Only protocol identifiers come from the application plan. The replacement
  // data is predetermined; this is not a model-obedience claim.
  assert.ok(choice);Object.assign(replacement.mentions[1],{evidence:{choiceRef:choice.choiceRef}})
  return{repairs:[{repairRef:plan?.rows.find(row=>row.slot===0)?.repairRef??'rr0000000000000000',disposition:'replace',replacement}]}
 },prompts,{encode:true})
 assert.equal(prompts.length,2);const plan=planOf(prompts[1]);assert.ok(plan);assert.deepEqual(plan.rows.map(row=>row.slot),[0]);assert.deepEqual(result,expected);assert.deepEqual(result.sceneRosterRecords![1],expected.sceneRosterRecords![1]);assert.equal(result.sceneRosterRecords![0].mentions[0].evidence.quote,wide);assert.deepEqual(input,before);assert.deepEqual(bad,badBefore)
})

function replacementReply(plan:Plan|undefined,replacement:unknown=good().roster[0],slot=0){return{repairs:[{repairRef:plan?.rows.find(row=>row.slot===slot)?.repairRef??'rr0000000000000000',disposition:'replace',replacement}]}}
test('[compact] TR02: repair transactions are closed and still preserve every verified window and relation',async t=>{
 const variants:[string,(reply:ReturnType<typeof replacementReply>)=>unknown][]=[
  ['missing action',()=>({repairs:[]})],
  ['duplicate action',reply=>({repairs:[reply.repairs[0],reply.repairs[0]]})],
  ['unknown or good-row reference',reply=>({repairs:[{...reply.repairs[0],repairRef:'rr'+'f'.repeat(16)}]})],
  ['null replacement',reply=>({repairs:[{...reply.repairs[0],replacement:null}]})],
  ['empty replacement',reply=>({repairs:[{...reply.repairs[0],replacement:{mentions:[],context:[],links:[]}}]})],
  ['whole-roster fallback is forbidden',()=>good()],
  ['self supplied path',reply=>({repairs:[{...reply.repairs[0],path:'roster.1'}]})],
  ['reject a grounded record',reply=>({repairs:[{repairRef:reply.repairs[0].repairRef,disposition:'reject'}]})]
 ]
 for(const [label,change]of variants)await t.test(label,async()=>{const calls:string[]=[],input=request();await assert.rejects(bridge(input,first(),(plan,prompt)=>change(explicitTargetedRosterReply(prompt,replacementReply(plan),input.units) as ReturnType<typeof replacementReply>),calls,{encode:false}),error=>error instanceof StructuredGenerationError&&error.kind==='invalid_schema');assert.equal(calls.length,4)})
 await t.test('[compact] a source-valid arbitrary narrower window is fixture-unsupported and cannot use raw in the repair round',async()=>{const row=structuredClone(good().roster[0]);row.mentions[0].evidence.quote='东宅的甲室门已打开。';assert.equal(sceneRosterGenerationSchema(request()).safeParse({roster:[row,good().roster[1]]}).success,true);const encodedCalls:string[]=[];await assert.rejects(bridge(request(),first(),plan=>replacementReply(plan,row),encodedCalls,{encode:true}),/TEST_FIXTURE_UNSUPPORTED_EXACT_CHOICE/u);assert.equal(encodedCalls.length,2);const rawCalls:string[]=[];await assert.rejects(bridge(request(),first(),plan=>replacementReply(plan,row),rawCalls,{encode:false}),error=>error instanceof StructuredGenerationError&&error.kind==='invalid_schema');assert.equal(rawCalls.length,4)})
 for(const [label,change]of [
  ['drop already verified context',(row:ReturnType<typeof good>['roster'][number])=>{row.context=[]}],
  ['drop already verified link',(row:ReturnType<typeof good>['roster'][number])=>{row.links=[]}],
  ['new cross-owner bridge',(row:ReturnType<typeof good>['roster'][number])=>{row.mentions.push(good().roster[1].mentions[0])}]
 ] as const)await t.test(label,async()=>{const row=structuredClone(good().roster[0]);change(row);assert.equal(sceneRosterGenerationSchema(request()).safeParse({roster:[row,good().roster[1]]}).success,true);await assert.rejects(bridge(request(),first(),plan=>replacementReply(plan,row),[],{encode:true}),error=>error instanceof StructuredGenerationError)})
 await t.test('[compact] choice references remain repair-only and mixed bad raw is not automatically rebound',async()=>{assert.equal(sceneRosterGenerationSchema(request()).safeParse({roster:[{...good().roster[0],mentions:[{literal:'甲室',evidence:{choiceRef:'cf'+'0'.repeat(16)}}]}]}).success,false);const input=request();await assert.rejects(bridge(input,first(),(plan,prompt)=>{const encoded=explicitTargetedRosterReply(prompt,replacementReply(plan),input.units) as ReturnType<typeof replacementReply>,row=encoded.repairs[0].replacement as ReturnType<typeof good>['roster'][number];Object.assign(row.mentions[1],{evidence:{choiceRef:'cf'+'0'.repeat(16),unitId:'tr-unit-0',quote:alias}});return encoded},[],{encode:false}),error=>error instanceof StructuredGenerationError)})
 await t.test('[compact] an unknown outer field cannot erase independently valid nested source facts',async()=>{const bad=good();Object.assign(bad.roster[0],{'TR-UNKNOWN-PRIVATE-KEY':'untrusted'});const row=structuredClone(good().roster[0]);row.context=[];row.links=[];assert.equal(sceneRosterGenerationSchema(request()).safeParse({roster:[row,good().roster[1]]}).success,true);await assert.rejects(bridge(request(),bad,plan=>replacementReply(plan,row),[],{encode:true}),error=>error instanceof StructuredGenerationError)})
 await t.test('[compact] an unknown mention key cannot erase its attached verified source facts',async()=>{const bad=good();bad.roster[0].mentions=[bad.roster[0].mentions[0]];Object.assign(bad.roster[0].mentions[0],{note:'TR-UNKNOWN-NESTED-NOTE'});const row=structuredClone(good().roster[0]);row.mentions=[row.mentions[0]];row.context=[];row.links=[];assert.equal(sceneRosterGenerationSchema(request()).safeParse({roster:[row,good().roster[1]]}).success,true);await assert.rejects(bridge(request(),bad,plan=>replacementReply(plan,row),[],{encode:true}),error=>error instanceof StructuredGenerationError)})
})

function phantom(){return{mentions:[{literal:'无据幽影厅',evidence:raw('tr-unit-0','TR-NO-SOURCE')}],context:[],links:[]}}
test('[compact] TR04: rejection is explicit, source-qualified and stable-slot links never dangle or shift to another place',async t=>{
 await t.test('[compact] a wholly ungrounded source-absent candidate may be explicitly rejected and later slots remap',async()=>{const value=good();value.roster[0].links[0].targetIndex=2;const draft={roster:[phantom(),...value.roster]},before=structuredClone(draft),calls:string[]=[];const result=await bridge(request(),draft,plan=>{assert.deepEqual(plan?.rows.map(row=>row.slot),[0]);assert.equal(plan!.rows[0].canReject,true);return{repairs:[{repairRef:plan!.rows[0].repairRef,disposition:'reject'}]}},calls);assert.deepEqual(result,sceneRosterGenerationSchema(request()).parse(good()));assert.equal(result.sceneRosterRecords![0].links[0].targetIndex,1);assert.deepEqual(draft,before);assert.equal(calls.length,2)})
 await t.test('[compact] an unchanged good link to a rejected slot fails closed',async()=>{const value=good();value.roster[0].links[0].targetIndex=0;const draft={roster:[phantom(),...value.roster]};await assert.rejects(bridge(request(),draft,plan=>({repairs:[{repairRef:plan!.rows[0].repairRef,disposition:'reject'}]})),error=>error instanceof StructuredGenerationError)})
 for(const disposition of ['reject','unrelated replace'] as const)await t.test('[compact] zero grounded but source-present claim forbids '+disposition,async()=>{const draft=good();draft.roster[0]={mentions:[{literal:'阅览间',evidence:raw('tr-unit-0','TR-WRONG-QUOTE')}],context:[],links:[]};await assert.rejects(bridge(request(),draft,plan=>{assert.equal(plan!.rows[0].canReject,false);assert.ok(plan!.rows[0].requiredSpellings.includes('阅览间'));return disposition==='reject'?{repairs:[{repairRef:plan!.rows[0].repairRef,disposition:'reject'}]}:replacementReply(plan,{mentions:[good().roster[1].mentions[0]],context:[],links:[]})},[],{encode:true}),error=>error instanceof StructuredGenerationError)})
 await t.test('[compact] a source-present claim is repaired by an exact explicit option instead of silently deleted',async()=>{const draft=good();draft.roster[0]={mentions:[{literal:'阅览间',evidence:raw('tr-unit-0','TR-WRONG-QUOTE')}],context:[],links:[]};const result=await bridge(request(),draft,plan=>replacementReply(plan,{mentions:[good().roster[0].mentions[1]],context:[],links:[]}),[],{encode:true});assert.equal(result.sceneRosterRecords![0].name,'阅览间')})
 for(const texts of [['这里是书','房所在的位置。'],['书','房','门']])await t.test('[compact] real adjacent source chain conservatively blocks reject '+texts.length,async()=>{const r=request();let start=0;r.units=texts.map((text,i)=>{const unit={id:'chain-'+i,fileId:'one-file',start,end:start+text.length,text,kind:'body' as const};start=unit.end;return unit});const literal=texts.length===2?'书房':'书房门',draft={roster:[{mentions:[{literal,evidence:raw(r.units[0].id,literal)}],context:[],links:[]}]};await assert.rejects(bridge(r,draft,plan=>{assert.equal(plan!.rows[0].canReject,false);assert.ok(plan!.rows[0].requiredSpellings.includes(literal));assert.ok(!plan!.choices.some(choice=>choice.literals.includes(literal)));return{repairs:[{repairRef:plan!.rows[0].repairRef,disposition:'reject'}]}}),error=>error instanceof StructuredGenerationError)})
})
