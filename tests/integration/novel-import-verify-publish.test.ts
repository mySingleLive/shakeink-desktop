import assert from 'node:assert/strict'
import {before,after,test} from 'node:test'
import {mkdir,mkdtemp,realpath,rm} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {Workspaces} from '../../desktop/service/workspaces'
import {loadDatabaseSeed} from '../../desktop/service/database/seed'
import {prisma} from '../../src/lib/db'
import {publishNovelImport} from '../../desktop/service/novel-import-publish'
import {legacySceneFixture,filesF,rosterAi,fullAi,toVerify,injectJournalEdit,sleep,type Ai} from '../helpers/novel-import-wizard-fixture'
import type {ImportAiRequest,ImportAiResult,ImportPublishInput,ImportSession} from '../../desktop/shared/novel-import'

/* docs/539–541: step 21 with failures still saves through the real publication into a disposable PGlite workspace, and
 * the saved work equals the imported content kind by kind. Synthetic fixture only; no provider, key or real book. */
let root:string,works:Workspaces
before(async()=>{root=await realpath(await mkdtemp(join(tmpdir(),'niw-verify-publish-')));await mkdir(join(root,'app'));works=new Workspaces(join(root,'app'),resolve('prisma/migrations'),await loadDatabaseSeed(resolve('prisma/empty-database.json')));await works.initialize()})
after(async()=>{await works?.close();if(root)await rm(root,{recursive:true,force:true});for(const t of targets)await rm(t,{recursive:true,force:true})})

type F=Awaited<ReturnType<typeof legacySceneFixture>>
// Saved works stay registered in `works`; their target folders are removed with the suite root, not per test.
const targets:string[]=[]
async function done(f:F){await f.controller.close().catch(()=>undefined);await rm(f.root,{recursive:true,force:true});targets.push(f.target)}
async function verifyFixture(review:(r:ImportAiRequest,base:Ai)=>Promise<ImportAiResult>){
 const f=await legacySceneFixture(filesF(),rosterAi());const base=fullAi(f)
 f.setAi(async r=>r.phase==='review'?review(r,base):base(r))
 let captured:ImportPublishInput|undefined
 f.options.publish=async input=>{captured=structuredClone(input) as ImportPublishInput;return publishNovelImport(works,input)}
 return {f,input:()=>captured!}
}
function contradiction(r:ImportAiRequest,value:string,field='text'):ImportAiResult|undefined{
 const a=r.artifacts.find(a=>a.kind==='character'),u=a&&r.units.find(u=>u.text.includes(a.name))
 if(!a||!u)return undefined
 const current=field==='text'?a.text:a.facts[field]??''
 return {conflicts:[{id:'x',type:'setting-body',kind:'character',entity:a.name,field,source:{text:current,value:current,artifactId:a.id},candidate:{text:value,value},evidence:[{unitId:u.id,quote:a.name}],status:'pending',hash:'h'}]}
}
/** VS-42: the saved work equals the frozen session artifacts kind by kind, and the body chapter by chapter. */
async function assertSaved(saved:{novelId:string;workId:string},s:ImportSession){await works.run(saved.workId,async()=>{const novelId=saved.novelId
 const kind=(k:string)=>s.artifacts.filter(a=>a.kind===k),names=(l:{name:string}[])=>l.map(x=>x.name).sort()
 assert.deepEqual(names(await prisma.character.findMany({where:{novelId}})),names(kind('character')))
 assert.deepEqual(names(await prisma.scene.findMany({where:{novelId}})),names(kind('scene')))
 assert.deepEqual(names(await prisma.item.findMany({where:{novelId}})),names(kind('item')))
 assert.deepEqual(names(await prisma.world.findMany({where:{novelId}})),names(kind('world').filter(a=>a.facts.entityType==='WORLD')))
 assert.equal(await prisma.foreshadow.count({where:{novelId}}),kind('foreshadow').length)
 const chapters=await prisma.chapter.findMany({where:{volume:{novelId}},orderBy:[{volume:{index:'asc'}},{index:'asc'}]})
 assert.equal(chapters.length,s.chapters.length);for(const [i,c] of s.chapters.entries()){assert.equal(chapters[i].content,c.content);assert.equal(chapters[i].outline,c.outline??'')}
})}
async function save(f:F){await f.act('wizard-next');const done=await f.settle();assert.equal(done.phase,'completed',done.error);return {novelId:done.publication!.novelId!,workId:done.publication!.workId!}}

test('VS-40/VS-42: a review packet failing 3 times still saves through the real publication; the work equals the import',async()=>{
 const {f,input}=await verifyFixture(async()=>{throw Error('Server Error')})
 try{const v=await toVerify(f);assert.equal(v.wizard!.checks!.find(c=>c.key==='consistency')!.ok,false);assert.equal(v.wizard!.verify!.repairable,true);const id=await save(f);await assertSaved(id,input().session)}finally{await done(f)}
})
test('VS-21/VS-40: an unfixable contradiction is kept as imported and the real publication accepts it',async()=>{
 const {f,input}=await verifyFixture(async r=>contradiction(r,'另一种说法')??{conflicts:[]})
 try{
  await toVerify(f);const before=new Map((await f.journal()).artifacts.map(a=>[a.id,a.text]))
  const id=await save(f),s=input().session;await assertSaved(id,s)
  for(const a of s.artifacts.filter(a=>a.kind==='character'))assert.equal(a.text,before.get(a.id));assert.ok(s.conflicts.every(c=>c.status==='resolved'))
 }finally{await done(f)}
})
test('541-2: a structural field is never rewritten automatically',async()=>{
 const {f,input}=await verifyFixture(async r=>contradiction(r,'[]','relationships')??{conflicts:[]})
 try{
  await toVerify(f);const j=await f.journal();assert.ok(j.conflicts.some(c=>c.field==='relationships'&&c.status==='pending'),'left for the author')
  assert.equal(j.wizard!.verify!.fixed.length,0);const id=await save(f);await assertSaved(id,input().session)
 }finally{await done(f)}
})
test('541-1: pausing during a targeted repair check leaves the stored artifact unchanged',async()=>{
 let release:(()=>void)|undefined,held=false
 const {f}=await verifyFixture(async r=>{if(r.artifacts.length===1&&!held){held=true;await new Promise<void>(r=>{release=r});return {conflicts:[]}}return contradiction(r,'暂停时的候选值')??{conflicts:[]}})
 try{
  const verifying=toVerify(f).catch(()=>undefined)
  for(let i=0;i<2000&&!held;i++)await sleep(5);assert.ok(held,'targeted check started')
  const before=(await f.journal()).artifacts.find(a=>a.kind==='character'&&a.text!=='暂停时的候选值')
  // Pause waits for the held check; release it (and any later one) while pausing, and never wait forever.
  const t=setInterval(()=>release?.(),5);await f.act('pause');await Promise.race([verifying,sleep(20000)]);clearInterval(t);await f.settle()
  const after=await f.journal();assert.ok(!after.artifacts.some(a=>a.text==='暂停时的候选值'),'no unchecked candidate is stored');assert.ok(before)
 }finally{await done(f)}
})
test('541-3/VS-24: two dangling relationships are fixed and the real publication accepts the work',async()=>{
 const {f,input}=await verifyFixture(async()=>({conflicts:[]}))
 try{
  await toVerify(f)
  const c=await injectJournalEdit(f,j=>{for(const a of j.artifacts.filter(a=>a.kind==='character').slice(0,2))a.facts.relationships=JSON.stringify([{target:'无名',description:'旧识',characterId:'c-ffffffffffffffff'},{target:'无名二',description:'仇人',characterId:'c-eeeeeeeeeeeeeeee'}])})
  const v0=(await c.act({type:'current'})).view!;await c.act({type:'resume',id:v0.id,revision:v0.revision,consent:true});const v=await f.settle()
  assert.ok(v.wizard!.checks!.find(x=>x.key==='relationships')!.ok,JSON.stringify(v.wizard!.checks))
  const id=await save(f);await assertSaved(id,input().session)
 }finally{await done(f)}
})
test('VS-25/VS-40: chapters left without an outline after 3 attempts still save with an empty outline',async()=>{
 const {f,input}=await verifyFixture(async()=>({conflicts:[]}))
 try{
  await toVerify(f)
  const c=await injectJournalEdit(f,j=>{const gone=j.artifacts.find(a=>a.kind==='outline'&&a.facts.chapterIndex==='1')!;j.artifacts=j.artifacts.filter(a=>a!==gone);j.chapters[1].outline='';if(j.detailedOutlineIds)delete j.detailedOutlineIds[1]})
  const base=fullAi(f);f.setAi(async r=>r.phase==='analyze'&&r.kind==='outline'?{notFound:true}:r.phase==='review'?{conflicts:[]}:base(r))
  const v0=(await c.act({type:'current'})).view!;await c.act({type:'resume',id:v0.id,revision:v0.revision,consent:true});const v=await f.settle()
  const o=v.wizard!.checks!.find(x=>x.key==='outlines')!;assert.equal(o.ok,false,o.detail);assert.equal(v.wizard!.verify!.outlineAttempts,3);assert.equal(v.wizard!.verify!.repairable,true)
  const id=await save(f),s=input().session;assert.equal(s.chapters[1].outline??'','');await assertSaved(id,s)
 }finally{await done(f)}
})
/* docs/558 review must-fix 1: each step-21 decision saves through the real publication (assertPlan, locks, hashes)
 * and the saved character equals the decision. */
for(const [choice,extra,expect] of [['inferred',{},'正文的说法'],['source',{},undefined],['merge',{mergedText:'作者写的资料'},'作者写的资料']] as const){
 test(`CC-06..08 real publish: ${choice} resolves, passes 核对 and saves the decided value`,async()=>{
  let held:string|undefined
  const {f,input}=await verifyFixture(async r=>{const out=contradiction(r,'正文的说法');if(out&&(!held||r.artifacts.length===1&&r.artifacts[0].id===held)){held=out.conflicts![0].source.artifactId;return out}return {conflicts:[]}})
  try{
   let v=await toVerify(f);assert.ok(v.conflictDetail,'a conflict is left for the author');const id=v.conflictDetail!.conflictId
   const j0=await f.journal(),c0=j0.conflicts.find(c=>c.id===id)!,artifactId=c0.source.artifactId!,original=j0.artifacts.find(a=>a.id===artifactId)!.text
   const requests=f.requests.length
   await f.act('resolve',{conflictId:id,choice,...extra});v=await f.settle()
   assert.equal(f.requests.length,requests,'no model request');assert.equal(v.wizard!.checks!.find(c=>c.key==='consistency')!.ok,true);assert.equal(v.phase,'select')
   const saved=await save(f),s=input().session;await assertSaved(saved,s)
   const c=s.conflicts.find(c=>c.id===id)!;assert.equal(c.resolution,choice);assert.ok(s.semanticState!.locks.some(l=>l.artifactId===artifactId&&l.field==='text'))
   const want=expect??original,name=s.artifacts.find(a=>a.id===artifactId)!.name
   await works.run(saved.workId,async()=>{const row=await prisma.character.findFirst({where:{novelId:saved.novelId,name}});assert.equal(row?.bio,want)})
  }finally{await done(f)}
 })
}
