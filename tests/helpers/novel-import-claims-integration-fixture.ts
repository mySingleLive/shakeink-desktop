import assert from 'node:assert/strict'
import {MockLanguageModelV4} from 'ai/test'
import type {LanguageModelV4StreamPart} from '@ai-sdk/provider'
import {generateImportAiJson,runImportAi} from '../../desktop/service/novel-import-ai'
import {generateText,type GenerateUsage} from '../../src/lib/ai/generate'
import {localModelRecord} from '../../desktop/service/models'
import {LOCAL_AUTHOR_ID} from '../../desktop/service/context'
import {runInsideLongTask} from '../../src/lib/long-task'
import type {PublicModel} from '../../desktop/core/settings'
import type {ResolvedModel} from '../../src/lib/ai/provider'
import type {ImportAiRequest} from '../../desktop/shared/novel-import'
import {request as baseRequest} from './novel-import-claim-patch-fixture'
import {expandTargetedClaimView} from './novel-import-targeted-claim-view-fixture'
import {expandBoundTaskDisplay} from './novel-import-bound-task-display-fixture'
import type {SceneRosterTargetedPlan} from '../../desktop/service/novel-import-scene-roster-targeted-repair'

export function claimsFixture(texts:readonly string[]){const request=baseRequest();request.units=texts.map((text,index)=>({id:'claims-synthetic-'+index,fileId:'claims-synthetic',kind:'body',start:index*4000,end:index*4000+text.length,text}));const anchor=(index:number)=>({unitId:request.units[index].id,quote:request.units[index].text});return{request,anchor}}
type Task={kind:'selection'|'claims'|'replacement';slot:number;claimIndexes?:number[];options?:number[][][];domains?:{kind:'mention'|'context'|'link';canReject:boolean;choices:number[]}[];boundCanReject?:boolean}
export function claimsDeck(prompt:string){const tag='<scene-roster-bound-repair>',at=prompt.indexOf(tag);assert.ok(at>=0);const value=JSON.parse(prompt.slice(at+tag.length,prompt.indexOf('</scene-roster-bound-repair>',at)));assert.ok(Array.isArray(value.tasks));const planTag='<scene-roster-targeted-repair>',planAt=prompt.indexOf(planTag);assert.ok(planAt>=0);const plan:SceneRosterTargetedPlan=expandTargetedClaimView(JSON.parse(prompt.slice(planAt+planTag.length,prompt.indexOf('</scene-roster-targeted-repair>',planAt))));return{tasks:expandBoundTaskDisplay(value.tasks,plan.rows,plan.choices) as Task[],plan,selectionEncoding:value.selectionEncoding as 'object'|undefined}}
export async function claimsBridge(first:unknown,reply:(value:{prompt:string;generation:number;deck:ReturnType<typeof claimsDeck>})=>unknown,config:{request:ImportAiRequest;options?:Parameters<typeof generateText>[0][]}){
 const r=config.request,pinned=r.models.text! as PublicModel,before=structuredClone(r),rawBefore=structuredClone(first),options=config.options??[],usageRows:Parameters<GenerateUsage['recordUsage']>[0][]=[];let output:unknown
 const model=new MockLanguageModelV4({doStream:async()=>{const parts:LanguageModelV4StreamPart[]=[{type:'stream-start',warnings:[]},{type:'text-start',id:'claims'},{type:'text-delta',id:'claims',delta:typeof output==='string'?output:JSON.stringify(output)},{type:'text-end',id:'claims'},{type:'finish',finishReason:{unified:'stop',raw:'stop'},usage:{inputTokens:{total:11,noCache:11,cacheRead:0,cacheWrite:0},outputTokens:{total:19,text:19,reasoning:0}}}];return{stream:new ReadableStream({start(controller){parts.forEach(part=>controller.enqueue(part));controller.close()}})}}}),usage:GenerateUsage={checkQuota:async()=>({tokenQuota:1e9,tokenUsed:0,remaining:1e9}),recordUsage:async value=>{usageRows.push(structuredClone(value));return 0}},resolved:ResolvedModel={model,modelRecord:localModelRecord(pinned),providerOptions:{openai:{store:false}}}
 const result=await runInsideLongTask(()=>runImportAi(r,new AbortController().signal,{resolve:async role=>r.models[role]!,assert:async()=>{},generate:async(input,_m,signal,prompt)=>generateImportAiJson(input,{userId:LOCAL_AUTHOR_ID,resolvedModel:resolved,structuredSceneRoster:true,usage,maxNetworkRetries:0},signal,prompt,{generateText:async value=>{options.push(value);const actual='prompt'in value?value.prompt:'';output=options.length===1?first:reply({prompt:actual,generation:options.length,deck:claimsDeck(actual)});return generateText(value)}})}))
 assert.deepEqual(r,before);assert.deepEqual(first,rawBefore);return{result,options,usageRows,model}
}
