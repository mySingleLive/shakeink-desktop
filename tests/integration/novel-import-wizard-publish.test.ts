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
import {validatePlanning} from '../../src/lib/planning/domain'
import {fixture,filesF,rosterAi,toTree,toStep,linesAi,touchesAi,entityResult,entityName,type Ai} from '../helpers/novel-import-wizard-fixture'
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
 const f=await fixture(filesF(),rosterAi());f.setAi(touchesAi(linesAi(richAi(f.handler()))))
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
   const all=volumes.flatMap(v=>v.chapters);for(const [k,c] of all.entries())assert.equal(c.content,w.session.chapters[k].content)
   assert.ok(!all.some(c=>/再起|三起|后记/u.test(c.content)))
   const characters=await prisma.character.findMany({where:{novelId:w.novelId}}),shen=characters.find(c=>c.name==='沈砚')!,lin=characters.find(c=>c.name==='林舟')!
   assert.equal(shen.height,'178cm');assert.equal(shen.habits,'思考时捏袖口');assert.deepEqual(shen.personalityTags,['沉稳']);assert.deepEqual(shen.motivations,[{items:[{text:'找回父亲',importance:5}]}]);assert.deepEqual(shen.beliefs,{values:'守诺'});assert.equal(shen.abilities,'辨识古物')
   const arc=shen.arcStages as {startChapter:{chapterId:string;volumeId:string;label:string}|null}[];assert.equal(arc[0].startChapter?.chapterId,all[0].id);assert.equal(arc[0].startChapter?.volumeId,all[0].volumeId);assert.match(arc[0].startChapter!.label,/^第1卷 .+ · 第1章 /u)
   assert.equal((shen.relationships as {characterId?:string}[])[0].characterId,lin.id)
   const items=await prisma.item.findMany({where:{novelId:w.novelId}});assert.equal(items.length,1);assert.equal((items[0].aliases as string[]).length,10);assert.equal(items[0].appearance,'锈蚀的青铜')
   const scenes=await prisma.scene.findMany({where:{novelId:w.novelId}});assert.ok(scenes.some(s=>s.exteriorDescription==='青石城墙'))
   const foreshadows=await prisma.foreshadow.findMany({where:{novelId:w.novelId},include:{touches:{include:{references:true}}}});assert.equal(foreshadows.length,1);assert.equal(foreshadows[0].status,'PLANTED')
   const touch=foreshadows[0].touches[0],contentRef=touch.references.find(r=>r.targetType==='CHAPTER_CONTENT')!,chapter=all.find(c=>c.id===touch.chapterId)!
   const anchor=resolveReferenceAnchor(chapter.content,contentRef);assert.equal(anchor?.start,contentRef.startOffset);assert.ok(touch.references.some(r=>r.targetType==='CHAPTER_OUTLINE'))
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
