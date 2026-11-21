import assert from 'node:assert/strict'
import {test} from 'node:test'
import {mkdtemp,mkdir,readFile,writeFile,rm,realpath} from 'node:fs/promises'
import {existsSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {detectImportChapterCuts,deriveImportVolumeCuts,importVolumeGroups} from '../../desktop/core/novel-import-chapters'
import {importHash,importScopeHash,importPlanHash,importChapters,importSessionChapters,splitImportUnits,toImportView} from '../../desktop/core/novel-import'
import {NovelImportController,encodeImportJournal} from '../../desktop/main/novel-import'
import {importActionSchema,type ImportSession,type ImportFile} from '../../desktop/shared/novel-import'

type Cut={start:number;title:string;volume?:string}
const legacyText='第一部 初卷\n第一章 起\n甲😀。\n第二章 续\n乙。\n第二部 末卷\n第一章 再起\n丙。'
const names=['初卷','次卷','三卷','四卷','五卷','六卷','七卷','末卷']
const numbers='一二三四五六七八'
const book=names.map((name,i)=>`第${numbers[i]}${i%2?'卷':'部'} ${name}\r\n${i===7?'第二':'第一'}章 起${i}\r\n合成${i}😀。\r\n第二章 续${i}\r\n合成尾${i}。\r\n`).join('')
function session(text:string,modern=false):ImportSession{const file:ImportFile={id:'f',name:'正文.txt',format:'txt',path:'/private/tmp/lotm-synthetic/source.txt',bytes:Buffer.byteLength(text),hash:importHash(text),text,included:true};return{semanticVersion:1,version:1,id:'11111111-1111-4111-8111-111111111111',revision:1,epoch:0,phase:'confirm',title:'合成卷章',files:[file],units:splitImportUnits([file]).map(u=>({...u,kind:'body'})),selected:['body'],targets:[],infer:false,originalProse:text,workingProse:text,workingRevision:0,chapters:importChapters(text,undefined,1),artifacts:[],conflicts:[],patches:[],steps:[],coverage:{},notFound:[],decisions:[],createdAt:'2026-10-27T00:00:00.000Z',updatedAt:'2026-10-27T00:00:00.000Z',...(modern?{chapterVersion:2 as const}:{})}}
function modernChapters(text:string){const s=session(text,true);s.chapters=importSessionChapters(s,text);return{s,chapters:s.chapters}}
function assertWhole(text:string,chapters:ReturnType<typeof importChapters>){assert.equal(chapters.map(c=>c.content).join(''),text);for(const c of chapters){assert.equal(c.content,text.slice(c.start,c.end));assert.ok(c.content.isWellFormed())}}

test('LOTM-V01: explicit eight-volume headings preserve sixteen source chapters, repeated numbers and exact prose',()=>{
 const {chapters}=modernChapters(book);assertWhole(book,chapters);assert.equal(chapters.length,16);assert.deepEqual(chapters.map(c=>c.volume),names.flatMap(n=>[n,n]));for(let i=0;i<8;i++)assert.ok(chapters[i*2].content.startsWith(`第${numbers[i]}`));assert.ok(!chapters.some(c=>c.title==='正文序言'))
 // Opt-in detector only; ordinary callers keep the old detector geometry.
 assert.deepEqual((detectImportChapterCuts as (text:string,options?:{volumes:boolean})=>{cuts:Cut[]})(book,{volumes:true}).cuts.map(c=>c.volume),names.flatMap(n=>[n,n]))
})

test('LOTM-V02: actual prefaces survive and missing volume headings never inherit the previous volume',()=>{
 const prefix='合成前言😀。\n',withPreface=modernChapters(prefix+legacyText);assertWhole(prefix+legacyText,withPreface.chapters);assert.equal(withPreface.chapters[0].title,'正文序言');assert.equal(withPreface.chapters[0].volume,undefined);assert.equal(withPreface.chapters[0].content,prefix);assert.equal(withPreface.chapters[1].volume,'初卷')
 const missing='第一部 初卷\n第一章 起\n甲。\n第二章 续\n乙。\n第一章 新起\n丙。\n第二章 后续\n丁。',d=modernChapters(missing);assertWhole(missing,d.chapters);assert.equal(d.chapters.length,4);assert.deepEqual(d.chapters.map(c=>c.volume),['初卷','初卷',undefined,undefined]);assert.match(d.s.chapterDetection?.diagnostic??'',/卷|归属/)
 const compact=modernChapters(missing.replaceAll('章 ','章'));assert.deepEqual(compact.chapters.map(c=>c.volume),['初卷','初卷',undefined,undefined]);assert.match(compact.s.chapterDetection?.diagnostic??'',/卷|归属/)
 const adjacent=modernChapters('第一部 初卷\n第一章 起\n甲。\n第一章 新起\n乙。');assert.deepEqual(adjacent.chapters.map(c=>c.volume),['初卷',undefined]);assert.match(adjacent.s.chapterDetection?.diagnostic??'',/卷|归属/)
 for(const prose of ['这是第一部作品。\n第一章 起\n甲。','第一部总结\n第一章 起\n甲。','第一部 就这样，他走进了门。\n第一章 起\n甲。']){const x=modernChapters(prose);assertWhole(prose,x.chapters);assert.ok(x.chapters.every(c=>c.volume===undefined))}
 const old=importChapters(legacyText,undefined,1);assert.deepEqual(old.map(c=>c.start),[0,7,18,34]);assert.ok(old.every(c=>c.volume===undefined));assertWhole(legacyText,old)
})

test('LOTM-V03: cuts, projection, authorization and saved controller recovery retain volume ownership',async t=>{
 await t.test('metadata binds analysis and plan; legacy goldens remain byte-identical',()=>{
  const {s}=modernChapters(legacyText),before=importScopeHash(s,'analyze'),plan=importPlanHash(s);s.chapters[0].volume='更名';assert.notEqual(importScopeHash(s,'analyze'),before);assert.notEqual(importPlanHash(s),plan)
  const legacy=session(legacyText);assert.equal(importScopeHash(legacy,'classify'),'40cc7ea8350b9bde213743fc92c57017bcf8cddb84b1f6c069b7b1189df0fcf8');assert.equal(importScopeHash(legacy,'analyze'),'b541a4efaae1c5fa396a9eba37e056ea56d0acd43805b7d7766e05bb1ea412f5');assert.equal(importPlanHash(legacy),'65e98a4ccda1ab15be7771cea44ed7a537c73bc82dbd3dde8c87b01da1caa1d4')
  const oldPlain=session('第一章 起\n甲😀。\n第二章 续\n乙。');assert.equal(importScopeHash(oldPlain,'classify'),'08e00c5ce9bc527650580cf82766288d072bd886b3146ca9d5a03ba5ee0e2ab1');assert.equal(importScopeHash(oldPlain,'analyze'),'dbe4162c0d9d5952e600027767d2278c94172b9da520d0099e6e04d5fa42b322');assert.equal(importPlanHash(oldPlain),'bd854259e13f57599f8e32a80e00917beab7fe2be5ecbaacaf3cb31ac7a7d4bb')
  assert.notEqual(importScopeHash({...legacy,chapterVersion:2} as ImportSession,'analyze'),importScopeHash(legacy,'analyze'));assert.notEqual(importPlanHash({...legacy,chapterVersion:2} as ImportSession),importPlanHash(legacy))
 })
 await t.test('manual re-confirmation derives labels and rejects moved/deleted boundaries',()=>{
  const {s,chapters}=modernChapters(legacyText),cuts=chapters.map(({start,title,volume})=>({start,title,volume}));assert.deepEqual(toImportView(s).chapters.map(c=>(c as Cut).volume),['初卷','初卷','末卷']);assert.deepEqual(importSessionChapters(s,legacyText,cuts),chapters);assert.deepEqual(importSessionChapters(s,legacyText),chapters)
  assert.throws(()=>importSessionChapters(s,legacyText,cuts.slice(0,-1)),/卷|边界/);assert.throws(()=>importSessionChapters(s,legacyText,cuts.map((c,i)=>i===2?{...c,start:c.start+1}:c)),/卷|边界/);assert.throws(()=>importSessionChapters(s,legacyText,cuts.map((c,i)=>i===0?{...c,volume:'错卷'}:c)),/卷|归属/)
  assert.deepEqual(importSessionChapters(s,legacyText,cuts.map(({volume:_,...cut})=>cut)),chapters)
  const legacy=session(legacyText);legacy.chapters=importSessionChapters(legacy,legacyText,legacy.chapters.map(({start,title})=>({start,title})));assert.equal(importPlanHash(legacy),'b55cf8e366621d46b0e4c736f84a9e1eab729ece5848d16b6b04c7b2e6bc243f');assert.ok(legacy.chapters.every(c=>c.volume===undefined))
 })
 await t.test('v2 missing-volume warnings remain visible after unchanged manual confirmation and recovery',()=>{
  const text='第一部 初卷\n第一章 起\n甲。\n第二章 续\n乙。\n第一章 新起\n丙。',modern=modernChapters(text).s;assert.match(toImportView(modern).error??'',/卷|归属/);modern.chapters=importSessionChapters(modern,text,modern.chapters.map(({start,title,volume})=>({start,title,...(volume!==undefined?{volume}:{})})));assert.equal(modern.chapterDetection?.mode,'manual');assert.match(toImportView(modern).error??'',/卷|归属/);const recovered=JSON.parse(encodeImportJournal(modern)) as ImportSession;recovered.chapters=importSessionChapters(recovered,text);assert.equal(recovered.chapterDetection?.mode,'manual');assert.match(toImportView(recovered).error??'',/卷|归属/)
  const legacy=session(text);legacy.chapterDetection={mode:'auto',diagnostic:'旧诊断'};legacy.chapters=importSessionChapters(legacy,text,legacy.chapters.map(({start,title})=>({start,title})));assert.equal(legacy.chapterDetection.mode,'manual');assert.equal(toImportView(legacy).error,undefined)
 })
 await t.test('normal controller choose/set-chapters/save/reopen and old journal recovery',async()=>{
  const root=await realpath(await mkdtemp(join(tmpdir(),'lotm-volumes-controller-'))),app=join(root,'app'),source=join(root,'source.txt');await mkdir(app);await writeFile(source,legacyText)
  const options={root:app,choose:async()=>[source],chooseTarget:async()=>null,protectedDirectories:async()=>[],models:async()=>({}),ai:async()=>{throw Error('No model in this component test')},cancelAi:async()=>{},publish:async()=>{throw Error('No publication in this component test')}}
  let c=new NovelImportController(options)
  try{let v=(await c.act({type:'choose'})).view!;v=(await c.act({type:'set-range',id:v.id,revision:v.revision,fileId:v.files[0].id,start:0,end:legacyText.length,kind:'body'})).view!;v=(await c.act({type:'select',id:v.id,revision:v.revision,selected:['body'],targets:[],infer:false})).view!;assert.deepEqual(v.chapters.map(x=>(x as Cut).volume),['初卷','初卷','末卷']);let disk=JSON.parse(await readFile(join(app,'novel-imports',v.id,'session.json'),'utf8'));assert.equal(disk.chapterVersion,2)
   v=(await c.act({type:'set-chapters',id:v.id,revision:v.revision,cuts:v.chapters.map(({start,title,...rest})=>({start,title,...('volume'in rest?{volume:rest.volume as string}:{})}))})).view!;const manual=structuredClone(v.chapters);disk=JSON.parse(await readFile(join(app,'novel-imports',v.id,'session.json'),'utf8'));assert.deepEqual(disk.chapters.map(({id,title,start,end,volume}:Cut&{id:string;end:number})=>({id,title,start,end,...(volume!==undefined?{volume}:{})})),manual);assert.equal(disk.chapterVersion,2);assert.equal(disk.chapterDetection.mode,'manual')
   const before=importPlanHash(disk);await assert.rejects(c.act({type:'set-chapters',id:v.id,revision:v.revision,cuts:v.chapters.slice(0,-1).map(({start,title})=>({start,title}))}),/卷|边界/);const after=(await c.act({type:'current'})).view!;assert.deepEqual(after.chapters,manual);assert.equal(importPlanHash(JSON.parse(await readFile(join(app,'novel-imports',v.id,'session.json'),'utf8'))),before)
   // An unsaved draft is deleted on close and never restored.
   await c.close();c=new NovelImportController(options);assert.equal((await c.act({type:'current'})).view,null);assert.equal(existsSync(join(app,'novel-imports',v.id)),false)
  }finally{await c.close();await rm(root,{recursive:true,force:true})}
  // A real saved pre-feature journal containing volume headings: unsaved, it is deleted at startup;
  // once its save began it is restored and stays legacy (no chapter version, legacy plan hash).
  const legacyRoot=await realpath(await mkdtemp(join(tmpdir(),'lotm-legacy-journal-'))),old=session(legacyText),dir=join(legacyRoot,'novel-imports',old.id);await mkdir(dir,{recursive:true});await writeFile(join(dir,'.owner'),'shakeink-novel-import-v1\n'+old.id+'\n');await writeFile(join(dir,'session.json'),encodeImportJournal(old))
  const dropped=new NovelImportController({...options,root:legacyRoot});try{assert.equal((await dropped.act({type:'current'})).view,null);assert.equal(existsSync(dir),false)}finally{await dropped.close()}
  const saving=session(legacyText);saving.phase='failed';saving.publication={requestId:'22222222-2222-4222-8222-222222222222',hash:importPlanHash(saving)};await mkdir(dir,{recursive:true});await writeFile(join(dir,'.owner'),'shakeink-novel-import-v1\n'+saving.id+'\n');await writeFile(join(dir,'session.json'),encodeImportJournal(saving));const restored=new NovelImportController({...options,root:legacyRoot})
  try{const v=(await restored.act({type:'current'})).view!;assert.equal(v.id,saving.id);assert.equal(v.chapters.length,4);assert.ok(v.chapters.every(c=>!('volume'in c)));const disk=JSON.parse(await readFile(join(dir,'session.json'),'utf8'));assert.equal(disk.chapterVersion,undefined);assert.equal(importPlanHash(disk),'65e98a4ccda1ab15be7771cea44ed7a537c73bc82dbd3dde8c87b01da1caa1d4');await assert.rejects(restored.act({type:'set-chapters',id:v.id,revision:v.revision,cuts:v.chapters.map(({start,title})=>({start,title}))}),/保存已开始/)}finally{await restored.close();await rm(legacyRoot,{recursive:true,force:true})}
 })
})

test('LOTM-V05: optional volume fields and unknown chapter versions reject invalid data',async()=>{
 const id='11111111-1111-4111-8111-111111111111',base={type:'set-chapters',id,revision:1,cuts:[{start:0,title:'起',volume:'初卷'}]};assert.equal(importActionSchema.safeParse(base).success,true)
 for(const volume of ['', '  ', '甲'.repeat(301),'\ud800'])assert.equal(importActionSchema.safeParse({...base,cuts:[{start:0,title:'起',volume}]}).success,false)
 const bad=session(legacyText);(bad as unknown as {chapterVersion:number}).chapterVersion=3;assert.throws(()=>importSessionChapters(bad,legacyText),/版本/);assert.throws(()=>encodeImportJournal(bad),/版本/)
 const repeated='第一部 重名\n第一章 一\n甲。\n第二部 重名\n第一章 二\n乙。';assert.throws(()=>modernChapters(repeated),/卷|重复/)
 bad.phase='failed';bad.publication={requestId:'22222222-2222-4222-8222-222222222222',hash:'h'}
 const unknownRoot=await realpath(await mkdtemp(join(tmpdir(),'lotm-unknown-version-'))),dir=join(unknownRoot,'novel-imports',bad.id);await mkdir(dir,{recursive:true});await writeFile(join(dir,'.owner'),'shakeink-novel-import-v1\n'+bad.id+'\n');await writeFile(join(dir,'session.json'),JSON.stringify(bad));const controller=new NovelImportController({root:unknownRoot,choose:async()=>null,chooseTarget:async()=>null,protectedDirectories:async()=>[],models:async()=>({}),ai:async()=>({}),cancelAi:async()=>{},publish:async()=>{throw Error('No publish')}});try{await assert.rejects(controller.initialize(),/版本/)}finally{await controller.close();await rm(unknownRoot,{recursive:true,force:true})}
})

test('LOTM-L-V01: first choose preserves repeated unassigned draft groups but analysis remains strict with zero AI',async()=>{
 const text='第一部 初卷\n第一章 甲\n甲。\n第一章 乙\n乙。\n第二部 末卷\n第一章 丙\n丙。\n第一章 丁\n丁。',root=await realpath(await mkdtemp(join(tmpdir(),'lotm-local-draft-volumes-'))),app=join(root,'app'),source=join(root,'正文.txt'),work=join(root,'work');await mkdir(app);await mkdir(work);await writeFile(source,text)
 const {stat}=await import('node:fs/promises'),model={id:'m',name:'合成模型',modelId:'m',endpoint:'https://model.invalid',authRevision:1,contextWindow:1048576};let aiCalls=0
 const options={root:app,choose:async()=>[source],chooseTarget:async()=>{const s=await stat(work,{bigint:true});return{path:work,device:String(s.dev),inode:String(s.ino)}},protectedDirectories:async()=>[],models:async()=>({text:model,review:{...model,id:'r'}}),ai:async()=>{aiCalls++;throw Error('AI must not run')},cancelAi:async()=>{},publish:async()=>{throw Error('No publication in this test')}}
 let c=new NovelImportController(options)
 try{
  let v=(await c.act({type:'choose'})).view!;assert.deepEqual(v.chapters.map(c=>c.volume),['初卷',undefined,'末卷',undefined]);const disk=JSON.parse(await readFile(join(app,'novel-imports',v.id,'session.json'),'utf8'));assert.equal(disk.chapters.length,4);assert.throws(()=>importVolumeGroups(v.chapters),/卷/);assert.doesNotThrow(()=>encodeImportJournal(disk));assert.deepEqual(disk.chapters.map((c:Cut)=>c.volume),['初卷',undefined,'末卷',undefined])
  // Pausing in the same controller stands in for the removed restart (close() used to pause the draft).
  v=(await c.act({type:'pause',id:v.id,revision:v.revision})).view!;assert.equal(v.phase,'paused');assert.deepEqual(v.chapters.map(c=>c.volume),['初卷',undefined,'末卷',undefined]);v=(await c.act({type:'select',id:v.id,revision:v.revision,selected:['body'],targets:['outline'],infer:true})).view!;v=(await c.act({type:'set-title',id:v.id,revision:v.revision,title:'合成未归属草稿'})).view!;v=(await c.act({type:'choose-target',id:v.id,revision:v.revision})).view!
  await assert.rejects(c.act({type:'start',id:v.id,revision:v.revision,consent:true}),/卷/,'start')
  const returned=(await c.act({type:'resume',id:v.id,revision:v.revision,consent:true})).view!;assert.equal(returned.phase,'source');v=(await c.act({type:'select',id:v.id,revision:returned.revision,selected:['body'],targets:['outline'],infer:true})).view!;v=(await c.act({type:'set-title',id:v.id,revision:v.revision,title:'合成未归属草稿'})).view!
  for(const type of ['resume','retry'] as const)await assert.rejects(c.act({type,id:v.id,revision:v.revision,consent:true}),/卷/,type)
  assert.equal(aiCalls,0);assert.throws(()=>importVolumeGroups(v.chapters),/卷/);assert.throws(()=>importVolumeGroups([{volume:'初卷'},{volume:undefined},{volume:'初卷'}]),/卷/)
 }finally{await c.close();await rm(root,{recursive:true,force:true})}
})

test('LOTM-L-V02/V03: manual volume groups inherit only within confirmed unnamed spans and reject name collisions',()=>{
 const text='第一部 初卷\n第一章 一\n甲。\n第一章 新\n乙。\n番外\n一个普通人的日常（一）\n丙。\n一个普通人的日常（二）\n丁。\n第二部 末卷\n第一章 终\n戊。',detected=detectImportChapterCuts(text,{volumes:true}).cuts;assert.equal(detected.length,3)
 const cuts:Cut[]=[detected[0],{...detected[1],volume:'愚者'},{start:text.indexOf('番外\n'),title:'一个普通人的日常（一）',volume:'番外'},{start:text.indexOf('一个普通人的日常（二）'),title:'一个普通人的日常（二）'},detected[2]]
 assert.deepEqual(deriveImportVolumeCuts(text,cuts).map(c=>c.volume),['初卷','愚者','番外','番外','末卷'])
 const {s}=modernChapters(text);s.chapters=importSessionChapters(s,text,cuts);assertWhole(text,s.chapters);const again=importSessionChapters(s,text,s.chapters.map(({start,title,volume})=>({start,title,...(volume!==undefined?{volume}:{})})));assert.deepEqual(again,s.chapters)
 for(const volume of ['初卷','末卷'])assert.throws(()=>deriveImportVolumeCuts(text,cuts.map((c,i)=>i===1?{...c,volume}:c)),/卷|重名|归属/)
 assert.throws(()=>deriveImportVolumeCuts(text,cuts.map((c,i)=>i===2?{...c,volume:'第二人工'}:i===3?{...c,volume:'愚者'}:c)),/卷|重名|归属/)
 assert.deepEqual(deriveImportVolumeCuts(text,detected).map(c=>c.volume),['初卷',undefined,'末卷'])
})
