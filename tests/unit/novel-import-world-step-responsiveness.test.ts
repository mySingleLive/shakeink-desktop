import assert from 'node:assert/strict'
import {test} from 'node:test'
import {NovelImportController} from '../../desktop/main/novel-import'
import type {ImportAiRequest} from '../../desktop/shared/novel-import'
import {fixture,source,rosterAi,entityResult,settingsF,toStep} from '../helpers/novel-import-wizard-fixture'

/* Entering 导入世界观 froze the window for tens of seconds: planning the theme/style/golden-finger/trope
 * batches rebuilt and re-validated the whole entity catalogue once per body unit, synchronously. Synthetic text only. */
const people=Array.from({length:24},(_,i)=>'合成人物'+String(i).padStart(2,'0'))
const body=Array.from({length:120},(_,i)=>`第${i+1}章 篇${i}\n\n${people[i%people.length]}与${people[(i+5)%people.length]}走过北城。${'风吹过合成山岗，夜色渐深。'.repeat(200)}\n\n`).join('')

async function toDetectWorld(){
 const f=await fixture([source(body,'正文.txt','f-body'),source(settingsF,'资料.md','f-notes')],rosterAi({
  'roster:character':r=>({roster:r.units.flatMap(u=>people.filter(n=>u.text.includes(n)).map(name=>({name,aliases:[],roleType:'SUPPORTING' as const,evidence:{unitId:u.id,quote:name}})))}),
 }))
 await f.act('choose',{mode:'files'});await f.act('wizard-next');await f.act('set-title',{title:'合成作品'});await f.act('choose-target');await f.act('wizard-next')
 await f.act('classify',{mode:'ai',consent:true});await f.settle()
 await f.act('select',{selected:['body','world'],targets:['character','world','theme','style','goldenFinger','trope'],infer:true});await f.act('wizard-next',{consent:true});await f.settle()
 const base=f.handler()
 f.setAi(async r=>r.intent==='entity'?entityResult(r):r.phase==='analyze'&&!r.intent?{notFound:true}:base(r))
 await f.act('wizard-next',{consent:true});await toStep(f,'detect-world')
 return f
}

test('WR-01: setting batch planning builds the entity catalogue once per planned request, not once per unit',async()=>{
 const f=await toDetectWorld(),proto=NovelImportController.prototype as unknown as {entityCatalog:(...args:unknown[])=>unknown}
 const original=proto.entityCatalog;let builds=0
 // Only builds made while step 16 runs count; later steps (review, verify) build their own catalogues.
 proto.entityCatalog=function(this:{session?:{wizard?:{step:string}}},...args:unknown[]){if(this.session?.wizard?.step==='import-world')builds++;return original.apply(this,args)}
 try{
  const sent:ImportAiRequest[]=[],base=f.handler();f.setAi(async r=>{sent.push(r);return base(r)})
  await f.act('wizard-next');const v=await f.settle()
  assert.notEqual(v.wizard!.step,'import-world','the world step finished');assert.ok(!v.wizard!.tasks.some(t=>t.state==='failed'),'no task failed')
  const settings=sent.filter(r=>r.executionLane==='wizard-settings-v1'&&!r.themeProfile),units=new Set(settings.flatMap(r=>r.units.map(u=>u.id))).size
  assert.ok(settings.length>=8,'every setting kind is split into several batches');assert.ok(units>settings.length*4,'batches hold many units')
  const entities=sent.filter(r=>r.intent==='entity').length
  // docs/566 3R-9: settings planning builds the frozen catalogue once per setting kind (4); world entity requests add one each.
  assert.ok(builds<=4+entities+8,`catalogue built ${builds} times for ${settings.length} setting batches over ${units} units`)
  for(const r of settings)assert.ok(r.entities!.some(e=>e.kind==='character'),'setting batches still carry the imported characters')
 }finally{proto.entityCatalog=original;await f.dispose()}
})

test('WR-03: the main process event loop is never blocked for long while step 16 starts',async()=>{
 const f=await toDetectWorld()
 let last=performance.now(),worst=0
 const timer=setInterval(()=>{const now=performance.now();worst=Math.max(worst,now-last-10);last=now},10)
 try{
  await f.act('wizard-next');await f.settle()
  console.log('WR-03 worst event-loop stall ms',Math.round(worst))
  assert.ok(worst<Number(process.env.WR_MAX_STALL??1500),`event loop blocked for ${Math.round(worst)} ms`)
 }finally{clearInterval(timer);await f.dispose()}
})

test('WR-02: world entries are sent while setting batches are still being planned',async()=>{
 const f=await toDetectWorld()
 try{
  const order:string[]=[],base=f.handler();f.setAi(async r=>{order.push(r.intent==='entity'?'entity':r.executionLane==='wizard-settings-v1'?'settings':'other');return base(r)})
  await f.act('wizard-next');await f.settle()
  const firstEntity=order.indexOf('entity'),firstSettings=order.indexOf('settings')
  assert.ok(firstEntity>=0&&firstSettings>=0)
  assert.ok(firstEntity<firstSettings,'planning yields to the event loop, so a world entry starts before the first setting batch')
 }finally{await f.dispose()}
})
