import {expandChoiceDirectory} from '../helpers/novel-import-choice-directory-fixture'
import assert from 'node:assert/strict'
import {test} from 'node:test'
import {generateImportAiJson,runImportAi,sceneRosterGenerationSchema,importAiResponseSchema} from '../../desktop/service/novel-import-ai'
import {createSceneRosterFragmentTable} from '../../desktop/core/novel-import-scene-roster-fragments'
import {StructuredGenerationError} from '../../src/lib/ai/generate'
import type {ImportAiRequest,ImportModel} from '../../desktop/shared/novel-import'
import type {ResolvedModel} from '../../src/lib/ai/provider'

const a='东宅的甲室门已打开。',alias='又称阅览间。',b='西宅的乙室门已关闭。'
const model:ImportModel={id:'co-model',name:'合成模型',modelId:'synthetic',endpoint:'https://synthetic.invalid/v1',authRevision:1,contextWindow:1048576}
function request():ImportAiRequest{return{semanticVersion:1,operationId:'co-op',phase:'analyze',intent:'roster',kind:'scene',sceneIdentity:{version:1,mode:'roster'},models:{text:{...model},review:{...model,id:'co-review'}},units:[a+'\r\n'+alias,b].map((text,i)=>({id:'co-'+i,fileId:'body',start:i*1000,end:i*1000+text.length,text,kind:'body'})),artifacts:[],workingRevision:0}}
const anchor=(i:number,quote:string)=>({unitId:'co-'+i,quote})
function good(){return{roster:[{mentions:[{literal:'甲室',evidence:anchor(0,a)},{literal:'阅览间',evidence:anchor(0,alias)},{literal:'甲室',evidence:anchor(0,request().units[0].text)}],context:[{label:'东宅',evidence:[anchor(0,a)]}],links:[{targetIndex:1,relation:'different-place',evidence:[anchor(0,a),anchor(1,b)]}]},{mentions:[{literal:'乙室',evidence:anchor(1,b)}],context:[],links:[]}]}}
function failed(){const value=good();value.roster[0].mentions[1].evidence.quote='CO-UNMATCHED';return value}
type Plan={rows:{slot:number;repairRef:string}[];choices:{choiceRef:string;unitIndex:number;start:number;end:number;sourceRef?:string;wholeUnit?:boolean;preserved?:boolean;literals:string[]}[]}
function parsePlan(prompt:string):Plan{const open='<scene-roster-targeted-repair>',close='</scene-roster-targeted-repair>',start=prompt.indexOf(open),end=prompt.indexOf(close,start);assert.ok(start>=0&&end>start);const plan=JSON.parse(prompt.slice(start+open.length,end));return{...plan,choices:expandChoiceDirectory(plan.choices)}}
function cf(plan:Plan,value:{unitId:string;quote:string},literal?:string){
 const r=request(),table=createSceneRosterFragmentTable(r.units),matches=plan.choices.filter(choice=>{
  assert.ok(Number.isSafeInteger(choice.unitIndex)&&choice.unitIndex>=0&&choice.unitIndex<r.units.length,'the compact choice binds an existing current unit')
  const unit=r.units[choice.unitIndex]
  assert.ok(Number.isSafeInteger(choice.start)&&Number.isSafeInteger(choice.end)&&choice.start>=0&&choice.start<choice.end&&choice.end<=unit.text.length,'the complete compact window is within its current unit')
  const quote=unit.text.slice(choice.start,choice.end)
  assert.ok(quote.isWellFormed()&&!(choice.start>0&&unit.text[choice.start-1]==='\r'&&unit.text[choice.start]==='\n')&&!(choice.end<unit.text.length&&unit.text[choice.end-1]==='\r'&&unit.text[choice.end]==='\n'),'the exact range preserves Unicode and CRLF boundaries')
  if(choice.sourceRef!==undefined)assert.deepEqual(table.resolve(choice.sourceRef),{unitId:unit.id,quote})
  if(choice.wholeUnit)assert.deepEqual([choice.start,choice.end],[0,unit.text.length])
  return unit.id===value.unitId&&(literal===undefined||choice.literals.includes(literal))&&quote===value.quote
 })
 assert.equal(matches.length,1,'the predetermined exact full window must have exactly one directory choice')
 return{choiceRef:matches[0].choiceRef}
}
function replacement(plan:Plan){const row=good().roster[0];return{...row,mentions:row.mentions.map(m=>({...m,evidence:cf(plan,m.evidence,m.literal)})),context:row.context.map(c=>({...c,evidence:c.evidence.map(e=>cf(plan,e))})),links:row.links.map(l=>({...l,evidence:l.evidence.map(e=>cf(plan,e))}))}}
const generated=(value:unknown)=>({text:JSON.stringify(value),promptTokens:1,completionTokens:2,cost:0,finishReason:'stop'})
async function bridge(reply:(plan:Plan)=>unknown,prompts:string[]=[]){const r=request();return runImportAi(r,new AbortController().signal,{resolve:async role=>r.models[role]!,assert:async()=>{},generate:async(input,_m,signal,prompt)=>generateImportAiJson(input,{userId:'co',resolvedModel:{} as ResolvedModel},signal,prompt,{generateText:async opts=>{const prompt='prompt'in opts?opts.prompt:'';prompts.push(prompt);return generated(prompts.length===1?failed():reply(parsePlan(prompt)))}})})}
function transaction(plan:Plan,row:unknown){return{repairs:[{repairRef:plan.rows.find(row=>row.slot===0)!.repairRef,disposition:'replace',replacement:row}]}}

test('CO01: every repair evidence uses an exact directory choice while all original windows and good records remain',async()=>{
 const before=good(),prompts:string[]=[]
 const result=await bridge(plan=>transaction(plan,replacement(plan)),prompts)
 assert.deepEqual(result,sceneRosterGenerationSchema(request()).parse(before));assert.equal(prompts.length,2);assert.equal(importAiResponseSchema(request()).safeParse(result).success,true);assert.deepEqual(before,good())
})
test('CO02: even independently legal raw, ef and halfopen anchors are forbidden only in the repair response',async t=>{
 for(const [label,evidence]of [['raw',anchor(0,a)],['ef',{ref:createSceneRosterFragmentTable(request().units).units[0].fragments[0].ref}],['halfopen',{unitIndex:0,fromFragment:0,toFragment:1}]] as const)await t.test(label,async()=>{
  const direct=good();Object.assign(direct.roster[0].mentions[0],{evidence});assert.equal(sceneRosterGenerationSchema(request()).safeParse(direct).success,true,'the first-round old encoding keeps its original meaning')
  const calls:string[]=[];await assert.rejects(bridge(plan=>{const row=replacement(plan);Object.assign(row.mentions[0],{evidence});return transaction(plan,row)},calls),error=>error instanceof StructuredGenerationError&&error.kind==='invalid_schema');assert.equal(calls.length,4)
 })
 for(const mixed of [false,true])await t.test(mixed?'mixed cf and raw':'unknown cf',async()=>{await assert.rejects(bridge(plan=>{const row=replacement(plan);Object.assign(row.mentions[0],{evidence:mixed?{...row.mentions[0].evidence,...anchor(0,request().units[0].text)}:{choiceRef:'cf'+'0'.repeat(16)}});return transaction(plan,row)}),error=>error instanceof StructuredGenerationError)})
})
test('CO03: source and retention still reject a wrong literal or a shorter already-verified window',async t=>{
 for(const wrongLiteral of [false,true])await t.test(wrongLiteral?'wrong literal':'changed original full window',async()=>{await assert.rejects(bridge(plan=>{const row=replacement(plan);if(wrongLiteral)row.mentions[0]={literal:'不存在的名字',evidence:row.mentions[0].evidence};else row.mentions[2]={literal:'甲室',evidence:cf(plan,anchor(0,a),'甲室')};return transaction(plan,row)}),error=>error instanceof StructuredGenerationError)})
})
test('CO04: the active prompt requests bound answers, explains all eight display columns and forbids returning coordinates',async()=>{
 const prompts:string[]=[];await bridge(plan=>transaction(plan,replacement(plan)),prompts)
 const end='</scene-roster-bound-repair>',at=prompts[1].lastIndexOf(end);assert.ok(at>=0)
 const tail=prompts[1].slice(at+end.length)
 assert.match(tail,/仅回\{"answers":\{"1":答案\}\}/u);assert.match(tail,/旧裸整数、数组、repairs及合法完整替换仅兼容/u);assert.match(tail,/roster(?:指令|要求)仅背景/u)
 assert.match(tail,/choices八列=\[(?:共享)?号,CF,unitIndex,start,end,sourceRef或null,flags,literals\]/u)
 assert.match(tail,/flags\s*1=wholeUnit、2=preserved/u);assert.match(tail,/不回(?:传坐标(?:\/CF\/ref)?|CF\/ref\/坐标)/u)
 assert.ok(tail.includes('键恰为全部answerNumber')&&tail.includes('每键一答'));assert.match(tail,/不用01\/(?:多余|额外)键/u)
 assert.ok(tail.includes('claims只答')&&tail.includes('claimIndexes')&&tail.includes('每项完整合法域为该原claim的eligibleChoices'));assert.ok(!tail.includes('selection.options')&&!tail.includes('selection只答'),'this claims-only task deck has no active selection-option lesson')
 assert.match(tail,/mention.evidence[是为]单个\{"choice":共享号\}/u);assert.ok(tail.includes('其它replacement仅boundCanReject可0')&&tail.includes('primaryRejectOnly=true本轮只显式答0'))
 assert.match(tail,/只(?:返回|回)(?:逐任务键)?answers JSON。$/u);assert.ok(!tail.includes('本轮只返回repairs事务'))
 const start='<scene-roster-targeted-repair>',offset=prompts[1].indexOf(start),raw=JSON.parse(prompts[1].slice(offset+start.length,prompts[1].indexOf('</scene-roster-targeted-repair>',offset)))
 assert.ok(raw.choices.length>0&&raw.choices.every((row:unknown)=>Array.isArray(row)&&row.length===8),'the actual directory uses the documented tuple representation')
 const boundStart='<scene-roster-bound-repair>',boundAt=prompts[1].indexOf(boundStart),bound=JSON.parse(prompts[1].slice(boundAt+boundStart.length,at));assert.deepEqual(bound.tasks.map((task:{answerNumber:number})=>task.answerNumber),bound.tasks.map((_:unknown,index:number)=>index+1),'every displayed task has its complete unique object key')
})
