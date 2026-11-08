import assert from 'node:assert/strict'
import {test} from 'node:test'
import {runImportAi,generateImportAiJson} from '../../desktop/service/novel-import-ai'
import type {ImportAiRequest,ImportEvidence} from '../../desktop/shared/novel-import'
import type {ResolvedModel} from '../../src/lib/ai/provider'
import {fixture,source,rosterAi,entityResult,toImportChar,model} from '../helpers/novel-import-wizard-fixture'

const names=Array.from({length:30},(_,i)=>'真名'+String(i).padStart(2,'0')),alias=(i:number)=>'外号'+String(i).padStart(2,'0')
async function optionsFixture(){
 const body=names.map((_,i)=>`第${i+1}章 篇${i}\n\n首😀${alias(i)}遇见${alias((i+1)%30)}。${i%2===0?alias(0)+'旁观。':''}${'合成填充资料。'.repeat(140)}\n\n`).join('')
 const f=await fixture([source(body,'正文.txt','f-body')],rosterAi({'roster:character':r=>({roster:r.units.flatMap(u=>names.flatMap((name,i)=>u.text.includes(alias(i))?[{name,aliases:[alias(i)],roleType:'SUPPORTING' as const,evidence:{unitId:u.id,quote:alias(i)}}]:[]))})}),{promptLayout:'legacy'}),base=f.handler()
 f.setAi(async r=>r.intent==='entity'?entityResult(r,()=>({roleType:r.entityTarget!.roleType!})):base(r));return f
}
const options=(r:ImportAiRequest)=>(r.entityTarget as typeof r.entityTarget&{evidenceOptions?:ImportEvidence[]})?.evidenceOptions

test('CP-06: role instructions filter only unrelated aliases while units and the trusted full catalog remain intact',async()=>{
 const f=await optionsFixture()
 try{
  await toImportChar(f);await f.settle();const j=await f.journal(),requests=f.requests.filter(r=>r.intent==='entity');assert.equal(requests.length,30)
  let filtered=false
  for(const r of requests){
   assert.equal(r.entities!.length,30)
   const own=j.wizard!.candidates.character!.find(c=>c.id===r.entityTarget!.id)!,expectedUnits=j.workingUnits!.filter(u=>[own.name,...own.aliases].some(name=>u.text.includes(name)))
   assert.deepEqual(r.units.map(u=>u.id),expectedUnits.map(u=>u.id),'all existing selected mention units stay present')
   const catalog=JSON.parse(r.instruction!.slice(r.instruction!.indexOf('['))) as {id:string;name:string;aliases:string[]}[],text=r.units.map(u=>u.text).join(''),expected=j.wizard!.candidates.character!.filter(c=>c.id===own.id||[c.name,...c.aliases].some(name=>text.includes(name)))
   assert.deepEqual(catalog.map(c=>c.id),expected.map(c=>c.id));filtered||=catalog.length<30
  }
  assert.ok(filtered,'at least one request omits unrelated whole-book directory entries')
 }finally{await f.dispose()}
})

test('CP-07: exact Unicode-safe evidence options are bounded, span material, and invalid options fail before generation',async()=>{
 const f=await optionsFixture()
 try{
  await toImportChar(f);await f.settle();const requests=f.requests.filter(r=>r.intent==='entity');let capped=false
  for(const r of requests){const entries=options(r);assert.ok(entries?.length&&entries.length<=8);capped||=entries.length===8;for(const e of entries){const u=r.units.find(u=>u.id===e.unitId);assert.ok(u&&u.text.includes(e.quote));assert.ok(e.quote.isWellFormed());assert.ok(e.quote.trim())}
   if(entries.length===8){const cited=r.units.filter(u=>u.text.includes(r.entityTarget!.aliases[0]));assert.equal(entries[0].unitId,cited[0].id);assert.equal(entries.at(-1)!.unitId,cited.at(-1)!.id)}
  }
  assert.ok(capped);const r=requests[0],entries=options(r)!,output=entityResult(r,()=>({roleType:r.entityTarget!.roleType!}));let generated=0,resolved=0
  output.artifacts![0].evidence=[{unitId:r.units[0].id,quote:Array.from(r.units[0].text).slice(-16).join('')}]
  const deps={resolve:async()=>{resolved++;return model},assert:async()=>{},generate:async()=>{generated++;return output}}
  for(const bad of [[{...entries[0],unitId:'foreign'}],[{...entries[0],quote:'虚构引文'}],[{...entries[0],quote:' '}],Array.from({length:9},()=>entries[0])])await assert.rejects(runImportAi({...r,entityTarget:{...r.entityTarget!,evidenceOptions:bad}} as ImportAiRequest,new AbortController().signal,deps),/目标|引用|选项|原文|上下文/)
  assert.equal(generated,0);assert.equal(resolved,0)
  const accepted=await runImportAi(r,new AbortController().signal,deps);assert.deepEqual(accepted.artifacts![0].evidence,output.artifacts![0].evidence,'valid quotes outside options are still accepted')
 }finally{await f.dispose()}
})

for(const permanent of [false,true])test(`CP-08: no-match ${permanent?'remains rejected after four generations':'recovers by copying a real option on generation three'}`,async()=>{
 const f=await fixture(undefined,rosterAi()),base=f.handler(),counts=new Map<string,number>();let selected:string|undefined
 f.setAi(async r=>{
  if(r.intent!=='entity')return base(r)
  selected??=r.entityTarget!.id
  return runImportAi(r,new AbortController().signal,{resolve:async()=>model,assert:async()=>{},generate:async(_r,_m,signal,prompt)=>generateImportAiJson(r,{userId:'synthetic-user',resolvedModel:{} as ResolvedModel},signal,prompt,{generateText:async()=>{
   const id=r.entityTarget!.id,n=(counts.get(id)??0)+1;counts.set(id,n)
   const other=r.entities!.find(e=>e.id!==id)!,raw=entityResult(r,()=>({roleType:r.entityTarget!.roleType!,relationships:JSON.stringify([{target:other.name,description:'合成关系',characterId:other.id}])}))
   if(id===selected){if(permanent||n<=2)raw.artifacts![0].evidence[0].quote='完全虚构的合成引用，不在本次来源中';else{raw.artifacts![0].evidence=structuredClone(options(r)!.slice(0,1));raw.artifacts![0].sourceUnitIds=raw.artifacts![0].evidence.map(e=>e.unitId)}}
   return {text:JSON.stringify(raw),promptTokens:0,completionTokens:0,cost:0,finishReason:'stop'}
  }})})
 })
 try{
  await toImportChar(f);const v=await f.settle(),j=await f.journal(),requests=f.requests.filter(r=>r.intent==='entity'&&r.entityTarget!.id===selected)
  assert.equal(requests.length,2);assert.equal(counts.get(selected!),permanent?4:3)
  assert.ok(!requests[1].instruction!.includes('完全虚构的合成引用'))
  if(permanent){assert.equal(v.wizard!.step,'import-char');assert.match(v.wizard!.tasks.find(t=>t.candidateId===selected)!.error!,/无法定位/)}
  else{assert.equal(v.wizard!.step,'detect-scene');assert.ok(v.wizard!.tasks.every(t=>t.state==='done'));const a=j.artifacts.find(a=>a.id===selected)!;assert.ok(a.text);assert.equal(JSON.parse(a.facts.relationships).length,1);assert.deepEqual(a.evidence,options(requests[1])!.slice(0,1))}
 }finally{await f.dispose()}
})
