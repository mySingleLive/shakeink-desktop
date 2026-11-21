import assert from 'node:assert/strict'
import {test} from 'node:test'
import {runImportAi} from '../../desktop/service/novel-import-ai'
import {mergeImportArtifacts} from '../../desktop/core/novel-import'
import type {ImportArtifact,ImportSession} from '../../desktop/shared/novel-import'
import {fixture,filesF,rosterAi,entityResult,toImportChar,model} from '../helpers/novel-import-wizard-fixture'

test('CP-14a: selected role IDs survive overlapping aliases with all facts and relationships intact',async()=>{
 const f=await fixture(filesF().slice(0,1),rosterAi()),base=f.handler(),expected=new Map<string,ImportArtifact>()
 f.setAi(async r=>{
  if(r.intent!=='entity')return base(r)
  const other=r.entities!.find(e=>e.id!==r.entityTarget!.id)!,raw=entityResult(r,()=>({roleType:r.entityTarget!.roleType!,aliases:JSON.stringify([other.name]),abilities:'合成能力-'+r.entityTarget!.id,backstory:'合成背景-'+r.entityTarget!.id,relationships:JSON.stringify([{target:other.name,characterId:other.id,description:'合成关联'}])}))
  expected.set(r.entityTarget!.id,structuredClone(raw.artifacts![0]))
  return runImportAi(r,new AbortController().signal,{resolve:async()=>model,assert:async()=>{},generate:async()=>structuredClone(raw)})
 })
 try{await toImportChar(f);const v=await f.settle(),s=await f.journal();assert.equal(v.wizard!.step,'detect-scene');const list=s.wizard!.candidates.character!;assert.equal(list.length,3);assert.ok(s.wizard!.tasks.every(t=>t.state==='done'));assert.deepEqual(s.artifacts.map(a=>a.id).sort(),list.map(c=>c.id).sort());assert.deepEqual(s.wizard!.dropped,[]);assert.deepEqual(s.wizard!.skipped,[])
  for(const a of s.artifacts){const original=expected.get(a.id)!;assert.deepEqual(a.facts,original.facts);assert.equal(a.text,original.text);assert.deepEqual(a.evidence,original.evidence)}
  const [a,b]=[...expected.values()];assert.equal(mergeImportArtifacts([a],[b],1).artifacts.length,1,'ordinary alias reconciliation is unchanged')
 }finally{await f.dispose()}
})

test('CP-14b: all completed role identities are preflighted before any skipped relation is changed',async()=>{
 const f=await fixture(filesF().slice(0,1),rosterAi()),base=f.handler();f.setAi(async r=>r.intent==='entity'?entityResult(r,()=>({roleType:r.entityTarget!.roleType!})):base(r))
 try{await toImportChar(f);await f.settle();const original=await f.journal(),list=original.wizard!.candidates.character!,[a,b,c]=list
  const resolver=f.controller as unknown as {resolveWizardReferences(s:ImportSession,k:'character'):void}
  for(const kind of ['missing','wrong-kind','wrong-name','duplicate'] as const){
   const s=structuredClone(original),skip=s.wizard!.tasks.find(t=>t.candidateId===b.id)!;skip.state='skipped';s.artifacts=s.artifacts.filter(x=>x.id!==b.id)
   s.artifacts.find(x=>x.id===a.id)!.facts.relationships=JSON.stringify([{target:b.name,characterId:b.id,description:'主动跳过者保留名字'}])
   if(kind==='missing')s.artifacts=s.artifacts.filter(x=>x.id!==c.id)
   else if(kind==='wrong-kind')s.artifacts.find(x=>x.id===c.id)!.kind='scene'
   else if(kind==='wrong-name')s.artifacts.find(x=>x.id===c.id)!.name='其它身份'
   else s.artifacts.push(structuredClone(s.artifacts.find(x=>x.id===c.id)!))
   const before=structuredClone(s);assert.throws(()=>resolver.resolveWizardReferences(s,'character'),/角色|身份|缺失|唯一/);assert.deepEqual(s,before,'identity preflight cannot first strip an earlier skipped relationship')
  }
  const s=structuredClone(original);s.wizard!.tasks.find(t=>t.candidateId===b.id)!.state='skipped';s.artifacts=s.artifacts.filter(x=>x.id!==b.id);s.artifacts.find(x=>x.id===a.id)!.facts.relationships=JSON.stringify([{target:b.name,characterId:b.id,description:'合成关联'}]);resolver.resolveWizardReferences(s,'character');assert.deepEqual(JSON.parse(s.artifacts.find(x=>x.id===a.id)!.facts.relationships),[{target:b.name,description:'合成关联'}]);assert.equal(s.wizard!.dropped.length,1)
 }finally{await f.dispose()}
})
