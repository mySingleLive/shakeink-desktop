/* Synthetic scene-flow fixture for 486/487: every reply passes the real service bridge (runImportAi →
 * generateImportAiJson). Only synthetic place names; no novel text, no keys, no real model. */
import assert from 'node:assert/strict'
import {fixture,source,allCuts} from './novel-import-wizard-fixture'
import {runImportAi,generateImportAiJson} from '../../desktop/service/novel-import-ai'
import type {ImportAiRequest,ImportAiResult,ImportModel,ImportSession,ImportUnit} from '../../desktop/shared/novel-import'
import type {SceneIdentityLedger} from '../../desktop/shared/novel-import-scene-identity'
import type {ResolvedModel} from '../../src/lib/ai/provider'

export type Mention={literal:string;quote:string}
export type Link={target:number;relation:'same-place'|'different-place'|'parent'}
/** One roster record. `round` 1 rows are returned only by the omission roster. */
export type Row={mentions:Mention[];label?:string;links?:Link[];round?:0|1}
export type CleanupEntry={index:number;action:string;target?:number;name?:string;evidence?:{unitId:string;quote:string};[extra:string]:unknown}
type Ctx={catalog:{index:number;name:string;aliases:string[]}[];focus:{index:number;unitIds:string[]}[];ledgerHash:string;identityRevision:number}
export type CleanupHelpers={ctx:Ctx;request:ImportAiRequest;rowOf(index:number):number;indexOf(row:number):number;evidence(index:number):{unitId:string;quote:string};keepAll():CleanupEntry[];call:number}
export type Handlers={
 cleanup?:(h:CleanupHelpers)=>CleanupEntry[]|unknown
 links?:(left:number[],right:number[],call:number)=>'same-place'|'different-place'|'unknown'
 parents?:(r:ImportAiRequest,call:number)=>unknown
 review?:(r:ImportAiRequest,call:number,units:ImportUnit[])=>unknown
 before?:(r:ImportAiRequest)=>Promise<void>|void
 fail?:(r:ImportAiRequest)=>Error|undefined
 /** A result returned straight to the controller, bypassing the service (main-process gate tests). */
 direct?:(r:ImportAiRequest)=>ImportAiResult|undefined
 /** Entity replies omit the v2 exteriorDescription fact (only image cases need it). */
 noExterior?:boolean
}
export const filler=(n:number)=>'其余合成叙述。'.repeat(Math.ceil(n/7)).slice(0,n)
/** Each paragraph is padded past 1000 characters so two mentions never share one working unit. */
export function bodyOf(paragraphs:string[],pad=1100){return '第一章 起\n\n'+paragraphs.map(p=>p+filler(pad)).join('\n\n')+'\n\n第二章 承\n\n'+'院外有雨。'.repeat(240)+'\n\n第三章 终\n\n'+'门前有路。'.repeat(240)+'\n'}
/** The smallest v1 window that still runs roster (5000 analysis characters): a packet holds at most five full units. */
export const smallModel:ImportModel={id:'text-small',name:'受控小窗口模型',modelId:'synthetic-small',endpoint:'https://model.invalid/v1',authRevision:1,contextWindow:16000}
export const smallReview:ImportModel={...smallModel,id:'review-small',name:'受控小窗口审核模型'}

export async function sceneFixture(rows:Row[],text:string,handlers:Handlers={},over:{models?:{text?:ImportModel;review?:ImportModel};notes?:string;promptLayout?:'legacy';sceneFragmentLayout?:'compact-v1'}={}){
 const calls={cleanup:0,links:0,parents:0,review:0}
 const unitWith=(units:readonly ImportUnit[],quote:string)=>units.find(u=>u.text.includes(quote))
 const rowsIn=(units:readonly ImportUnit[],memberRanges:{unitId:string;start:number;end:number}[])=>[...new Set(memberRanges.flatMap(r=>{const u=units.find(u=>u.id===r.unitId);if(!u)return [];const slice=u.text.slice(r.start,r.end);return rows.flatMap((row,i)=>row.mentions.some(m=>m.quote===slice)?[i]:[])}))]
 const files=[source(text,'合成正文.txt','f-body'),...(over.notes?[source(over.notes,'场景.md','f-notes')]:[])]
 const f=await fixture(files,async r=>{
  await handlers.before?.(r)
  const failure=handlers.fail?.(r);if(failure)throw failure
  const direct=handlers.direct?.(r);if(direct)return direct
  if(r.intent==='structure')return allCuts(r)
  if(r.phase==='classify')return {classifications:r.units.map(u=>({unitId:u.id,kind:u.fileId==='f-notes'?'scene' as const:'body' as const}))}
  let raw:unknown
  if(r.sceneIdentity?.mode==='roster'){
   const round=r.instruction?.includes('只识别本包有据具体地点')?1:0,out:{row:number;record:any}[]=[]
   for(const [i,row]of rows.entries()){if((row.round??0)!==round)continue;const mentions=row.mentions.flatMap(m=>{const u=unitWith(r.units,m.quote);return u?[{literal:m.literal,evidence:{unitId:u.id,quote:m.quote}}]:[]});if(!mentions.length)continue;const literals=[...new Set(mentions.map(m=>m.literal))],first=mentions[0];out.push({row:i,record:{name:literals[0],aliases:literals.slice(1),mentions,context:row.label&&first.evidence.quote.includes(row.label)&&row.mentions[0].quote===first.evidence.quote?[{label:row.label,evidence:[first.evidence]}]:[],links:[]}})}
   for(const item of out)for(const link of rows[item.row].links??[]){const target=out.findIndex(o=>o.row===link.target);if(target>=0)item.record.links.push({targetIndex:target,relation:link.relation,evidence:[item.record.mentions[0].evidence]})}
   raw={roster:out.map(o=>o.record)}
  }else if(r.sceneIdentity?.mode==='links'){
   const call=++calls.links,ctx=r.sceneIdentity
   raw={sceneIdentityDecisions:ctx.tasks.map(t=>{const left=rowsIn(r.units,ctx.records[t.leftIndex].members.flatMap(m=>m.origin==='body'?[m.evidenceRange]:[])),right=rowsIn(r.units,ctx.records[t.rightIndex].members.flatMap(m=>m.origin==='body'?[m.evidenceRange]:[])),result=handlers.links?.(left,right,call)??'unknown';if(result==='unknown')return {taskIndex:t.taskIndex,result,evidence:[]};const q=rows[left[0]].mentions.map(m=>m.quote).find(q=>unitWith(r.units,q))!;return {taskIndex:t.taskIndex,result,evidence:[{unitId:unitWith(r.units,q)!.id,quote:q}]}})}
  }else if((r.sceneIdentity as {mode?:string}|undefined)?.mode==='cleanup'){
   const call=++calls.cleanup,ctx=r.sceneIdentity as unknown as Ctx
   const rowOf=(index:number)=>{const focus=ctx.focus.find(f=>f.index===index);if(focus){const u=r.units.find(u=>u.id===focus.unitIds[0])!;const hits=rows.flatMap((row,i)=>row.mentions.some(m=>u.text.includes(m.quote))?[i]:[]);if(hits.length===1)return hits[0];const item=ctx.catalog.find(c=>c.index===index)!;const named=hits.filter(i=>rows[i].mentions.some(m=>m.literal===item.name&&u.text.includes(m.quote)));if(named.length===1)return named[0]}const item=ctx.catalog.find(c=>c.index===index)!,named=rows.flatMap((row,i)=>row.mentions[0].literal===item.name?[i]:[]);assert.equal(named.length,1,'unique synthetic row for catalog '+index);return named[0]}
   const indexOf=(row:number)=>{const hit=ctx.catalog.map(c=>c.index).filter(i=>{try{return rowOf(i)===row}catch{return false}});assert.equal(hit.length,1,'unique catalog index for row '+row);return hit[0]}
   const evidence=(index:number)=>{const focus=ctx.focus.find(f=>f.index===index)!,u=r.units.find(u=>u.id===focus.unitIds[0])!,row=rows[rowOf(index)],m=row.mentions.find(m=>u.text.includes(m.quote))!;return {unitId:u.id,quote:m.quote}}
   const keepAll=()=>ctx.focus.map(f=>({index:f.index,action:'keep'}))
   raw={sceneCleanup:handlers.cleanup?handlers.cleanup({ctx,request:r,rowOf,indexOf,evidence,keepAll,call}):keepAll()}
   if(raw&&typeof raw==='object'&&!Array.isArray((raw as {sceneCleanup:unknown}).sceneCleanup))raw=(raw as {sceneCleanup:unknown}).sceneCleanup
  }else if(r.sceneParentTargets){
   const call=++calls.parents,custom=handlers.parents?.(r,call)
   raw=custom??{sceneParents:r.sceneParentTargets.map(id=>{const own=r.entities!.find(e=>e.id===id)!,m=rows.flatMap(row=>row.mentions).find(m=>m.literal===own.name&&unitWith(r.units,m.quote))!;return {id,evidence:{unitId:unitWith(r.units,m.quote)!.id,quote:m.quote}}})}
  }else if(r.intent==='entity'){
   const target=r.entities!.find(e=>e.id===r.entityTarget!.id)!,own=r.sceneIdentity?.mode==='ownership'?r.sceneIdentity.memberships.find(m=>m.identityId===target.id):undefined
   assert.ok(own,'entity input carries its actual ownership')
   const range=own.ownedRanges[0],unit=r.units.find(u=>u.id===range.unitId)!,quote=unit.text.slice(range.start,range.end)
   raw={artifacts:[{id:target.id,kind:'scene',name:target.name,text:quote+'该地点的合成资料。',facts:{coordinates:quote.slice(0,4),...(handlers.noExterior?{}:{exteriorDescription:'合成外观描述'})},evidence:[{unitId:unit.id,quote}],origin:'inferred'}]}
  }else if(r.intent==='reconcile')raw={artifactEdits:[],conflicts:[]}
  else if(r.phase==='review'){const call=++calls.review;raw=handlers.review?.(r,call,r.units)??{conflicts:[],missingTargets:[]}}
  else return {notFound:true}
  return runImportAi(r,new AbortController().signal,{resolve:async role=>r.models[role]!,assert:async()=>{},generate:async(input,_model,signal,prompt)=>generateImportAiJson(input,{userId:'synthetic-scene-cleanup',resolvedModel:{} as ResolvedModel},signal,prompt,{generateText:async()=>({text:JSON.stringify(raw),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'})})})
 },{models:over.models,...(over.promptLayout?{promptLayout:over.promptLayout}:{}),...(over.sceneFragmentLayout?{sceneFragmentLayout:over.sceneFragmentLayout}:{})})
 const session=()=>(f.controller as unknown as {session:ImportSession}).session
 const ledger=()=>session().wizard!.sceneIdentity! as SceneIdentityLedger
 const cleanupRequests=()=>f.requests.filter(r=>(r.sceneIdentity as {mode?:string}|undefined)?.mode==='cleanup')
 /** Steps 1–10 with scene-only inference, then wait for the scene list. */
 async function toList(){await f.act('choose',{mode:'files'});await f.act('wizard-next');await f.act('set-title',{title:'合成场景整理'});await f.act('choose-target');await f.act('wizard-next');await f.act('classify',{mode:'ai',consent:true});await f.settle();await f.act('select',{selected:over.notes?['body','scene']:['body'],targets:['scene'],infer:true});await f.act('wizard-next',{consent:true});await f.settle();await f.act('wizard-next',{consent:true});return f.settle()}
 return {...f,calls,session,ledger,cleanupRequests,toList}
}
export type SceneF=Awaited<ReturnType<typeof sceneFixture>>
/** Core rows separated by `gap` filler places, so with at most five units per packet each core row lands in its own packet. */
export function spaced(core:Row[],gap=6){const rows:Row[]=[],at:number[]=[];for(const [k,row]of core.entries()){if(k)for(let i=0;i<gap;i++)rows.push({mentions:[{literal:'杂地'+k+i,quote:'杂地'+k+i+'有块空坪。'}]});at.push(rows.length);rows.push(row)}return {rows,at}}
export const isFiller=(name:string)=>name.startsWith('杂地')
/** Candidate by its synthetic literal. */
export const byName=(f:SceneF,name:string)=>{const list=(f.session().wizard!.candidates.scene??[]).filter(c=>c.name===name);assert.equal(list.length,1,'one candidate named '+name);return list[0]}
