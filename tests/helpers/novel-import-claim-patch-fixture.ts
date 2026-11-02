import {expandTargetedClaimView} from './novel-import-targeted-claim-view-fixture'
import assert from 'node:assert/strict'
import {MockLanguageModelV4} from 'ai/test'
import type {LanguageModelV4StreamPart} from '@ai-sdk/provider'
import {generateImportAiJson,runImportAi,sceneRosterGenerationSchema} from '../../desktop/service/novel-import-ai'
import {generateText,type GenerateUsage} from '../../src/lib/ai/generate'
import {localModelRecord} from '../../desktop/service/models'
import {LOCAL_AUTHOR_ID} from '../../desktop/service/context'
import {runInsideLongTask} from '../../src/lib/long-task'
import type {ImportAiRequest} from '../../desktop/shared/novel-import'
import type {PublicModel} from '../../desktop/core/settings'
import type {ResolvedModel} from '../../src/lib/ai/provider'
import type {SceneRosterPatchClaim} from '../../desktop/service/novel-import-scene-roster-claim-patch'

const wide='完整资料😀\r\n'.repeat(80)+'东宅的甲室有蓝色书架。',alias='阅览间是东宅的另一个称呼。',west='西宅的乙室有红色书架。'
const pub:PublicModel={id:'00000000-0000-4000-8000-000000000096',name:'合成claim模型',provider:'deepseek',protocol:'openai',endpoint:'https://api.deepseek.com',modelId:'deepseek-flash',kind:'TEXT',enabled:true,authRevision:1,contextWindow:1048576,keyMask:'synthetic',thinkingLevels:[],defaultThinking:'none'}
function request():ImportAiRequest{return{semanticVersion:1,operationId:'cp-op',phase:'analyze',intent:'roster',kind:'scene',sceneIdentity:{version:1,mode:'roster'},models:{text:pub,review:pub},units:[wide+alias,west].map((text,index)=>({id:'cp-unit-'+index,fileId:'synthetic',start:index*4000,end:index*4000+text.length,text,kind:'body'})),artifacts:[],workingRevision:0}}
const anchor=(index:number,quote:string)=>({unitId:'cp-unit-'+index,quote})
function good(){return{roster:[{mentions:[{literal:'甲室',evidence:anchor(0,wide)},{literal:'阅览间',evidence:anchor(0,alias)}],context:[{label:'东宅',evidence:[anchor(0,wide)]}],links:[{targetIndex:1,relation:'different-place',evidence:[anchor(0,wide),anchor(1,west)]}]},{mentions:[{literal:'乙室',evidence:anchor(1,west)}],context:[],links:[]}]}}
function bad(){const value=good();value.roster[0].mentions[1].evidence.quote='CP_UNMATCHED';value.roster[0].context[0].evidence[0].quote='CP_UNMATCHED';value.roster[0].links[0].evidence[1].quote='CP_UNMATCHED';return value}
type Plan={rows:{repairRef:string;slot:number;patch?:{claims:SceneRosterPatchClaim[]}}[];choices:{choiceRef:string;unitIndex:number;start:number;end:number}[]}
function planOf(prompt:string):Plan{const tag='<scene-roster-targeted-repair>',start=prompt.indexOf(tag);assert.ok(start>=0);const plan=expandTargetedClaimView(JSON.parse(prompt.slice(start+tag.length,prompt.indexOf('</scene-roster-targeted-repair>',start))));return{...plan,choices:[...plan.choices]}}
function patchReply(plan:Plan,r:ImportAiRequest){const row=plan.rows.find(row=>row.slot===0)!;return{repairs:[{repairRef:row.repairRef,disposition:'patch',patch:{claims:(row.patch?.claims??['mention','context','link'].map((kind,index)=>({kind,claimRef:'pc'+String(index).repeat(16)}))).map(claim=>{const expected=claim.kind==='mention'?anchor(0,alias):claim.kind==='context'?anchor(0,wide):anchor(1,west),choice=plan.choices.find(choice=>r.units[choice.unitIndex].id===expected.unitId&&r.units[choice.unitIndex].text.slice(choice.start,choice.end)===expected.quote);assert.ok(choice);return{claimRef:claim.claimRef,disposition:'resolve',choiceRefs:[choice.choiceRef]}})}}]}}
async function bridge(first:unknown=bad(),change?:(reply:ReturnType<typeof patchReply>,plan:Plan,prompt:string,r:ImportAiRequest)=>unknown,config:{request?:ImportAiRequest;options?:Parameters<typeof generateText>[0][]}={}){
 const r=config.request??request(),pinned=r.models.text! as PublicModel,before=structuredClone(r),rawBefore=structuredClone(first),options:Parameters<typeof generateText>[0][]=config.options??[],usageRows:Parameters<GenerateUsage['recordUsage']>[0][]=[];let output:unknown
 const model=new MockLanguageModelV4({doStream:async()=>{const parts:LanguageModelV4StreamPart[]=[{type:'stream-start',warnings:[]},{type:'text-start',id:'cp'},{type:'text-delta',id:'cp',delta:JSON.stringify(output)},{type:'text-end',id:'cp'},{type:'finish',finishReason:{unified:'stop',raw:'stop'},usage:{inputTokens:{total:11,noCache:11,cacheRead:0,cacheWrite:0},outputTokens:{total:19,text:19,reasoning:0}}}];return{stream:new ReadableStream({start(controller){for(const part of parts)controller.enqueue(part);controller.close()}})}}})
 const usage:GenerateUsage={checkQuota:async()=>({tokenQuota:1e9,tokenUsed:0,remaining:1e9}),recordUsage:async row=>{usageRows.push(structuredClone(row));return 0}},resolved:ResolvedModel={model,modelRecord:localModelRecord(pinned),providerOptions:{openai:{store:false}}}
 const result=await runInsideLongTask(()=>runImportAi(r,new AbortController().signal,{resolve:async role=>r.models[role]!,assert:async()=>{},generate:async(input,_m,signal,prompt)=>generateImportAiJson(input,{userId:LOCAL_AUTHOR_ID,resolvedModel:resolved,structuredSceneRoster:true,usage,maxNetworkRetries:0},signal,prompt,{generateText:async value=>{options.push(value);if(options.length===1)output=first;else{const actualPrompt='prompt'in value?value.prompt:'',plan=planOf(actualPrompt);const reply=patchReply(plan,r);output=change?change(reply,plan,actualPrompt,r):reply}return generateText(value)}})}))
 assert.deepEqual(r,before);assert.deepEqual(first,rawBefore);return{result,options,usageRows,model}
}


export {wide,alias,west,pub,request,anchor,good,bad,planOf,patchReply,bridge}
export type {Plan}
