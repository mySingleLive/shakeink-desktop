import assert from 'node:assert/strict'
import {before,after,test} from 'node:test'
import {mkdir,mkdtemp,realpath,rm,readdir,stat} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {Workspaces} from '../../desktop/service/workspaces'
import {loadDatabaseSeed} from '../../desktop/service/database/seed'
import {prisma} from '../../src/lib/db'
import {publishNovelImport,readNovelImportRecord} from '../../desktop/service/novel-import-publish'
import {resolveReferenceAnchor} from '../../src/lib/foreshadow-reference'
import {storedChapterProse} from '../helpers/import-stored-prose'
import {validatePlanning} from '../../src/lib/planning/domain'
import {legacySceneFixture,fixture,filesF,bodyF,source,rosterAi,toTree,toStep,linesAi,timelineCatalog,touchesAi,entityResult,entityName,type Ai} from '../helpers/novel-import-wizard-fixture'
import type {ImportPublishInput,ImportSession} from '../../desktop/shared/novel-import'

/* Synthetic fixture only: drive the real controller to step 21, then publish into a disposable PGlite
 * workspace. No user workspace, provider, key or real book is opened. */
let root:string,works:Workspaces
before(async()=>{root=await realpath(await mkdtemp(join(tmpdir(),'niw-publish-')));await mkdir(join(root,'app'));works=new Workspaces(join(root,'app'),resolve('prisma/migrations'),await loadDatabaseSeed(resolve('prisma/empty-database.json')));await works.initialize()})
after(async()=>{await works?.close();if(root)await rm(root,{recursive:true,force:true})})

const profile={height:'178cm',build:'瘦削',habits:'思考时捏袖口',personalityTags:'["沉稳"]',motivations:'[{"items":[{"text":"找回父亲","importance":5}]}]',beliefs:'{"values":"守诺"}',bigFive:'{"openness":60}',abilities:'辨识古物',backstory:'渡口长大',arcStages:'[{"id":"s1","name":"出走","chapterIndex":0,"description":"离开渡口","isDebut":true}]'}
function richAi(base:Ai):Ai{return async r=>{
 if(r.intent==='entity'&&r.kind==='character'){const name=entityName(r);return entityResult(r,():Record<string,string>=>name==='沈砚'?{...profile,relationships:JSON.stringify([{target:'林舟',description:'旧识',characterId:r.entities!.find(e=>e.name==='林舟')!.id}])}:{})}
 if(r.intent==='entity'&&r.kind==='scene'){const own=r.entities!.find(e=>e.name===entityName(r))!;return entityResult(r,():Record<string,string>=>({...(own.parentId?{parentId:own.parentId}:{}),exteriorDescription:'青石城墙'}))}
 if(r.intent==='entity'&&r.kind==='item')return entityResult(r,()=>({appearance:'锈蚀的青铜',aliases:JSON.stringify(Array.from({length:12},(_,i)=>'别名'+i)),tags:JSON.stringify(['信物'])}))
 if(r.intent==='entity'&&r.kind==='world')return entityResult(r)
 return base(r)
}}
/** Publish the controller's frozen request into the shared PGlite workspace instead of the fake. */
async function publishedWork(select?:(indices:number[],chapters:{title:string;volume?:string}[])=>number[]){
 const f=await legacySceneFixture(filesF(),rosterAi());f.setAi(touchesAi(linesAi(richAi(f.handler()))))
 let captured:ImportPublishInput|undefined
 f.options.publish=async input=>{captured=structuredClone(input) as ImportPublishInput;return publishNovelImport(works,input)}
 const v0=await toTree(f)
 if(select)await f.act('wizard-select-chapters',{indices:select(v0.wizard!.structure!.map((_,i)=>i),v0.wizard!.structure!)})
 await f.act('wizard-next',{consent:true});const v=await toStep(f,'verify')
 assert.ok((await f.settle()).wizard!.checks!.every(c=>c.ok),JSON.stringify(v.wizard!.checks))
 await f.act('wizard-next');const done=await f.settle();assert.equal(done.phase,'completed',done.error)
 return {f,input:captured!,session:captured!.session as ImportSession,novelId:done.publication!.novelId!,workId:done.publication!.workId!}
}

test('NIW-S06/S07/S08/S09/S15: wizard publication writes only selected chapters, v2 profiles, touches and the record',{timeout:180000},async()=>{
 const w=await publishedWork((all,chapters)=>all.filter(i=>chapters[i].title!=='第一章 再起'&&chapters[i].volume!=='丙卷'&&chapters[i].title!=='后记'))
 try{
  await works.run(w.workId,async()=>{
   const volumes=await prisma.volume.findMany({where:{novelId:w.novelId},orderBy:{index:'asc'},include:{chapters:{orderBy:{index:'asc'}}}})
   assert.deepEqual(volumes.map(v=>[v.index,v.title,v.chapters.length]),[[1,'甲卷',4],[2,'乙卷',2]])
   assert.deepEqual(volumes[1].chapters.map(c=>[c.index,c.title]),[[1,'第二章 再承'],[2,'第三章 再终']])
   const all=volumes.flatMap(v=>v.chapters),stored=storedChapterProse(w.session);for(const [k,c] of all.entries()){assert.equal(c.content,stored[k]);assert.doesNotMatch(c.content,/^第|\n(?!\n)|\n{3}/u);assert.equal(c.wordCount,Array.from(c.content).length)}
   // docs/610: chapter 1 is stored without 「第一部 甲卷」「第一章 起」.
   assert.equal(all[0].content,'沈砚在北城南巷拾起青铜钥匙。起之夜。')
   assert.ok(!all.some(c=>/再起|三起|后记/u.test(c.content)))
   const characters=await prisma.character.findMany({where:{novelId:w.novelId}}),shen=characters.find(c=>c.name==='沈砚')!,lin=characters.find(c=>c.name==='林舟')!
   assert.equal(shen.height,'178cm');assert.equal(shen.habits,'思考时捏袖口');assert.deepEqual(shen.personalityTags,['沉稳']);assert.deepEqual(shen.motivations,[{items:[{text:'找回父亲',importance:5}]}]);assert.deepEqual(shen.beliefs,{values:'守诺'});assert.equal(shen.abilities,'辨识古物')
   const arc=shen.arcStages as {startChapter:{chapterId:string;volumeId:string;label:string}|null}[];assert.equal(arc[0].startChapter?.chapterId,all[0].id);assert.equal(arc[0].startChapter?.volumeId,all[0].volumeId);assert.match(arc[0].startChapter!.label,/^第1卷 .+ · 第1章 /u)
   assert.equal((shen.relationships as {characterId?:string}[])[0].characterId,lin.id)
   const items=await prisma.item.findMany({where:{novelId:w.novelId}});assert.equal(items.length,1);assert.equal((items[0].aliases as string[]).length,10);assert.equal(items[0].appearance,'锈蚀的青铜')
   const scenes=await prisma.scene.findMany({where:{novelId:w.novelId}});assert.ok(scenes.some(s=>s.exteriorDescription==='青石城墙'))
   const foreshadows=await prisma.foreshadow.findMany({where:{novelId:w.novelId},include:{touches:{include:{references:true}}}});assert.equal(foreshadows.length,1);assert.equal(foreshadows[0].status,'PLANTED')
   const touch=foreshadows[0].touches[0],contentRef=touch.references.find(r=>r.targetType==='CHAPTER_CONTENT')!,chapter=all.find(c=>c.id===touch.chapterId)!
   const anchor=resolveReferenceAnchor(chapter.content,contentRef);assert.equal(anchor?.start,contentRef.startOffset);assert.ok(contentRef.quote);assert.equal(chapter.content.slice(contentRef.startOffset!,contentRef.endOffset!),contentRef.quote);assert.ok(contentRef.startOffset!<w.session.chapters[all.indexOf(chapter)].content.indexOf(contentRef.quote!),'offset was remapped past the removed headings');assert.ok(touch.references.some(r=>r.targetType==='CHAPTER_OUTLINE'))
   const planning=validatePlanning((await prisma.planningDocument.findUnique({where:{novelId:w.novelId}}))!.data)
   assert.ok(planning.events.some(e=>e.materialRefs.some(m=>m.kind==='foreshadow'&&m.id===foreshadows[0].id)))
   const {record}=await readNovelImportRecord(w.novelId) as unknown as {record:{wizard?:{chapterSelection:number[];candidates:{selected:boolean}[];skipped:unknown[];dropped:unknown[]}}}
   assert.ok(record.wizard,'record keeps wizard choices');assert.equal(record.wizard!.chapterSelection.length,6);assert.ok(record.wizard!.candidates.length>0);assert.ok(Array.isArray(record.wizard!.dropped))
  })
 }finally{await w.f.controller.close();await rm(w.f.root,{recursive:true,force:true})}
})
test('NIW-S14: the import initializer has an asset store',{timeout:60000},async()=>{
 const target=await realpath(await mkdtemp(join(root,'assets-'))),s=await stat(target,{bigint:true})
 const work=await works.create({path:target,device:String(s.dev),inode:String(s.ino)},{title:'资产上下文',requestId:'niw-assets-context-01'},()=>{},{importHash:'a'.repeat(64),verify:async()=>{},initialize:async()=>{const {currentWorkAssets}=await import('../../desktop/service/image-assets');currentWorkAssets()}})
 assert.ok(work.id);assert.ok((await readdir(target)).length>0)
})
/** docs/571: one event per chapter that the batch covers (the default fixture gives one per batch). */
function chapterEvents(base:Ai):Ai{return async r=>{
 if(!(r.phase==='analyze'&&!r.intent&&r.kind==='worldline'))return base(r)
 const chapters=r.chapters!.map((c,i)=>({c,i})).filter(({c})=>r.units.some(u=>u.start<c.end&&u.end>c.start))
 return {artifacts:chapters.map(({c,i})=>{const u=r.units.find(u=>u.start<=c.start&&u.end>c.start)??r.units.find(u=>u.start<c.end&&u.end>c.start)!,from=Math.max(0,c.start-u.start);return {id:'ev-'+i,kind:'worldline' as const,name:'第'+i+'章事件',text:'发生了一件事。',facts:{lineId:'main',lineName:'主世界线',timeKind:'unknown',people:'[]',reliability:'客观事实'},evidence:[{unitId:u.id,quote:u.text.slice(from,from+6)}],sourceUnitIds:[u.id],origin:'inferred' as const}})}
}}
/** docs/571: only characters and the worldline, so the flow does not depend on scene, item or world steps. */
async function worldlineWork(ai:(f:Awaited<ReturnType<typeof fixture>>)=>Ai,files=filesF()){
 const f=await fixture(files,rosterAi());f.setAi(ai(f))
 let captured:ImportPublishInput|undefined
 f.options.publish=async input=>{captured=structuredClone(input) as ImportPublishInput;return publishNovelImport(works,input)}
 await f.act('choose',{mode:'files'});await f.act('wizard-next');await f.act('set-title',{title:'合成世界线作品'});await f.act('choose-target');await f.act('wizard-next')
 await f.act('classify',{mode:'ai',consent:true});await f.settle()
 await f.act('select',{selected:['body'],targets:['character','worldline'],infer:true});await f.act('wizard-next',{consent:true});await f.settle()
 await f.act('wizard-next',{consent:true});await toStep(f,'verify')
 await f.act('wizard-next');const done=await f.settle();assert.equal(done.phase,'completed',done.error??done.wizard?.stepError)
 return {f,session:captured!.session as ImportSession,novelId:done.publication!.novelId!,workId:done.publication!.workId!}
}
test('WT-30/WT-50/WT-51: step 17 places every event on the one worldline, published in time order',{timeout:180000},async()=>{
 const w=await worldlineWork(f=>chapterEvents(linesAi(richAi(f.handler()))))
 try{
  const timeline=w.f.requests.filter(r=>r.intent==='timeline'),batches=w.f.requests.filter(r=>r.phase==='analyze'&&!r.intent&&r.kind==='worldline')
  assert.equal(timeline.length,1,'one timeline request');assert.ok(w.f.requests.indexOf(timeline[0])>Math.max(...batches.map(r=>w.f.requests.indexOf(r))),'after every batch')
  assert.deepEqual(timeline[0].units,[]);assert.equal(timeline[0].executionLane,undefined)
  const events=w.session.artifacts.filter(a=>a.kind==='worldline')
  assert.ok(events.length>1,String(events.length));assert.ok(events.every(a=>a.facts.lineId==='import-main-worldline'&&a.facts.lineName==='主世界线'&&a.facts.timeKind==='exact'))
  assert.deepEqual(w.session.wizard!.worldTimeline,{version:1,calendar:'fixed',epoch:'故事开始',events:events.length})
  const planning=await works.run(w.workId,async()=>validatePlanning((await prisma.planningDocument.findUnique({where:{novelId:w.novelId}}))!.data))
  assert.deepEqual(planning.worlds.map(x=>[x.id,x.name,x.calendar.kind]),[['import-world-import-main-worldline','主世界线','fixed']])
  const values=planning.events.map(e=>e.time.value);assert.ok(planning.events.every(e=>e.time.kind==='exact'&&e.time.precision==='hour'))
  assert.deepEqual(values,values.map((_,i)=>i*24),'saved in strictly increasing time, one day per rank')
 }finally{await w.f.controller.close();await rm(w.f.root,{recursive:true,force:true})}
})
test('TA-10c/589-M7: the timeline request carries narration date clues (not dialogue) after the catalogue; every event is placed',{timeout:180000},async()=>{
 // Synthetic body: one narration date and one date inside dialogue; the fixture's first "之夜。" is in chapter 0.
 const files=filesF(),text=bodyF().replace('之夜。','之夜。六月底的渡口很热。“九月初再来”，他说。')
 files[0]=source(text,'正文.txt','f-body',{encoding:'gb18030'})
 const w=await worldlineWork(f=>chapterEvents(linesAi(richAi(f.handler()))),files)
 try{
  const timeline=w.f.requests.filter(r=>r.intent==='timeline');assert.equal(timeline.length,1)
  const lines=timeline[0].instruction!.split('\n');assert.ok(lines.length>=2)
  const clueLine=lines.find(l=>l.includes('日期线索'));assert.ok(clueLine,'date clue section')
  const clues=JSON.parse(clueLine!.slice(clueLine!.indexOf('：')+1));assert.ok(clues.some((c:[number,string])=>c[0]===0&&c[1].includes('六月底')),JSON.stringify(clues))
  assert.ok(!clueLine!.includes('九月初'),'dialogue dates are left out')
  assert.ok(timelineCatalog(timeline[0]).length>1,'the catalogue still parses')
  const events=w.session.artifacts.filter(a=>a.kind==='worldline'),values=events.map(a=>Number(a.facts.timeValue))
  assert.ok(events.every(a=>a.facts.timeKind==='exact'));assert.ok(values.every((v,i)=>i===0||v>values[i-1]))
 }finally{await w.f.controller.close();await rm(w.f.root,{recursive:true,force:true})}
})
test('EC-70/EC-71/WT-51b: a calendar reply gives an era worldline with event precisions and era periods',{timeout:180000},async()=>{
 // Reverse reading order: the first ranked event is in an earlier era, the second has a present-era date, the rest are undated.
 const calendar={eras:[{name:'青石纪',aliases:[],years:null,startAgo:null},{name:'赤铜纪',aliases:['赤铜纪元'],years:null,startAgo:null}],present:{era:'赤铜纪',year:1349}}
 const dated=(f:Awaited<ReturnType<typeof fixture>>):Ai=>{const inner=chapterEvents(linesAi(richAi(f.handler())));return async r=>r.intent==='timeline'?{calendar,timeline:timelineCatalog(r).reverse().map((e,order)=>({id:e.id,order,...(order===0?{era:'青石纪'}:order===1?{era:'赤铜纪元',year:1349,month:6,day:26}:{})}))}:inner(r)}
 const w=await worldlineWork(dated)
 try{
  const planning=await works.run(w.workId,async()=>validatePlanning((await prisma.planningDocument.findUnique({where:{novelId:w.novelId}}))!.data))
  assert.equal(planning.worlds.length,1);const world=planning.worlds[0]
  assert.equal(world.calendar.kind,'gregorian');assert.deepEqual(world.calendar.eras.map(e=>e.name),['青石纪','赤铜纪']);assert.equal(world.calendar.eras[1].start,0)
  const t=w.session.wizard!.worldTimeline!;assert.equal(t.calendar,'gregorian')
  const precisions=t.calendar==='gregorian'?t.precisions:{}
  assert.ok(planning.events.every(e=>e.time.precision===precisions[e.id.slice('import-event-'.length)]),'event precision follows the timeline')
  assert.equal(planning.events[0].time.precision,'era');assert.equal(planning.events[1].time.precision,'day')
  assert.ok(planning.events[0].time.value<world.calendar.eras[1].start&&planning.events[0].time.value>=world.calendar.eras[0].start)
  const values=planning.events.map(e=>e.time.value);assert.ok(values.every((v,i)=>i===0||v>values[i-1]))
  const catalog=w.session.artifacts.filter(a=>a.kind==='worldline');assert.equal(planning.events[0].id,'import-event-'+catalog[0].id,'the session also lists events in story order')
  assert.ok(planning.events.slice(2).every(e=>e.time.label.endsWith('（按先后推定）')),'undated events are marked as inferred')
  assert.deepEqual(planning.periods.map(p=>[p.id,p.title,p.line,p.start,p.end,p.ongoing]),[['import-era-0','青石纪',world.id,world.calendar.eras[0].start,0,false],['import-era-1','赤铜纪',world.id,0,null,true]])
 }finally{await w.f.controller.close();await rm(w.f.root,{recursive:true,force:true})}
})
/** docs/587: groups every three neighbouring events under one parent; grades the first event of each group. */
function groupingEvery3(base:Ai):Ai{return async r=>{
 if(!(r.phase==='analyze'&&r.intent==='grouping'))return base(r)
 const rows=JSON.parse(r.instruction!.slice(r.instruction!.indexOf('['))) as [string][],groups=[]
 for(let i=0;i+1<rows.length;i+=3)groups.push({name:'合成大事'+i,summary:'合成经过'+i+'。',category:'谋划',importance:2,members:rows.slice(i,i+3).map(x=>x[0])})
 return {groups,grades:rows.map(([key],k)=>[key,k%3?'其他':'揭示',k%3?1:3] as [string,string,number])}
}}
test('WG-20/WG-38: grouped events publish as parent and children inside the parent range, with type and importance',{timeout:180000},async()=>{
 const w=await worldlineWork(f=>groupingEvery3(chapterEvents(linesAi(richAi(f.handler())))))
 try{
  const state=w.session.wizard!.worldGrouped!;assert.ok(state.parents.length>=1,JSON.stringify(state))
  const planning=await works.run(w.workId,async()=>validatePlanning((await prisma.planningDocument.findUnique({where:{novelId:w.novelId}}))!.data))
  const parents=planning.events.filter(e=>planning.events.some(c=>c.parent===e.id));assert.equal(parents.length,state.parents.length)
  for(const p of parents){
   const kids=planning.events.filter(c=>c.parent===p.id);assert.ok(kids.length>=2)
   assert.equal(p.category,'谋划');assert.ok(p.importance>=Math.max(...kids.map(k=>k.importance)))
   const end=p.time.value+(p.duration||24);assert.ok(kids.every(k=>k.time.value>=p.time.value&&k.time.value<=end))
   assert.ok(planning.events.indexOf(p)<Math.min(...kids.map(k=>planning.events.indexOf(k))),'parent before its children')
  }
  assert.ok(planning.events.some(e=>e.category==='揭示'&&e.importance===3))
 }finally{await w.f.controller.close();await rm(w.f.root,{recursive:true,force:true})}
})
