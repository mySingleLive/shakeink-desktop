import assert from 'node:assert/strict'
import {test} from 'node:test'
import {mkdtemp,mkdir,readFile,realpath,rm,stat} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {existsSync} from 'node:fs'
import {join} from 'node:path'
import {NovelImportController} from '../../desktop/main/novel-import'
import {importStructureCandidateMetadata} from '../../desktop/core/novel-import-structure'
import type {ImportAiRequest,ImportAiResult,ImportFile,ImportFormat,ImportModel,ImportSession} from '../../desktop/shared/novel-import'

const model:ImportModel={id:'structure-text',name:'受控结构模型',modelId:'synthetic',endpoint:'https://structure.invalid/v1',authRevision:1,contextWindow:16000}
function source(text:string,name='材料.txt',format:ImportFormat='txt',id='source'):ImportFile{return{id,name,path:'/private/tmp/structure-session/'+name,format,bytes:Buffer.byteLength(text),hash:'source',text,included:true}}
async function fixture(text:string,handler:(r:ImportAiRequest)=>Promise<ImportAiResult>,name='材料.txt',format:ImportFormat='txt',files?:ImportFile[]){
 const root=await realpath(await mkdtemp(join(tmpdir(),'structure-controller-'))),app=join(root,'app'),target=join(root,'target');await mkdir(app);await mkdir(target);const info=await stat(target,{bigint:true}),requests:ImportAiRequest[]=[]
 let cancel:()=>void=()=>{}
 const options={root:app,choose:async()=>['/private/tmp/structure-session'],chooseTarget:async()=>({path:target,device:String(info.dev),inode:String(info.ino)}),protectedDirectories:async()=>[],models:async()=>({text:model,review:{...model,id:'review'}}),scan:async()=>files??[source(text,name,format)],verifySources:async()=>{},ai:async(r:ImportAiRequest)=>{requests.push(structuredClone(r));return handler(r)},cancelAi:async()=>cancel(),publish:async()=>{throw Error('结构测试不应发布')}}
 let controller=new NovelImportController(options);await controller.initialize()
 const act=async(type:string,extra:Record<string,unknown>={})=>{const view=(await controller.act({type:'current'})).view;return controller.act({type,...(type==='choose'?{}:{id:view!.id,revision:view!.revision}),...extra})}
 const saved=async()=>{const view=(await controller.act({type:'current'})).view!;return JSON.parse(await readFile(join(app,'novel-imports',view.id,'session.json'),'utf8')) as ImportSession}
 const drain=async()=>{for(let i=0;i<3000&&controller.active;i++)await new Promise(resolve=>setTimeout(resolve,2));assert.equal(controller.active,0);return saved()}
 const reopen=async()=>{await controller.close();controller=new NovelImportController(options);await controller.initialize()}
 return{requests,act,saved,drain,reopen,app,current:async()=>(await controller.act({type:'current'})).view,setCancel(fn:()=>void){cancel=fn},setAuthRevision(authRevision:number){options.models=async()=>({text:{...model,authRevision},review:{...model,id:'review',authRevision}})},async dispose(){await controller.close();await rm(root,{recursive:true,force:true})}}
}
function allCuts(r:ImportAiRequest):ImportAiResult{return{chapterCuts:r.units.map(unit=>{const meta=importStructureCandidateMetadata(unit);return{start:unit.start,title:meta.chapterTitle??meta.title,candidateId:unit.id}}),ignoredStarts:[]}}

test('LOTM-L-STR06: explicit local structure is confirmed with zero AI and no outline artifacts',async()=>{
 const text='# 第一部 起源\n\n## 第一章 开始\n\n甲。\n\n## 第二章 继续\n\n乙。',f=await fixture(text,async()=>{throw Error('明确结构不应调用模型')},'正文.md','md')
 try{await f.act('choose',{mode:'files'});await f.act('classify',{mode:'local',consent:false});const s=await f.drain();assert.equal(s.phase,'select');assert.equal(f.requests.length,0);assert.equal(s.chapters.length,2);assert.deepEqual(s.chapters.map(c=>c.volume),['起源','起源']);assert.equal(s.chapters.map(c=>c.content).join(''),text);assert.deepEqual(s.chapters.map(c=>c.title),['第一章 开始','第二章 继续']);assert.equal(s.artifacts.length,0);assert.equal(s.coverage.outline,undefined);assert.ok(s.chapters.every(c=>c.outline===undefined))}finally{await f.dispose()}
})

test('LOTM-L-STR12: identical source ranges preserve structure decisions while real changes invalidate them',async()=>{
 const text='第七卷 倒吊人\n第四十一章 旧的结束\n'+'旧卷正文。'.repeat(30)+'\n第一章 这一晚\n'+'新卷正文。'.repeat(30)
 for(const change of [undefined,{start:0,end:text.length-1,kind:'body' as const},{start:0,end:text.length,kind:'excluded' as const}]){
  const f=await fixture(text,async r=>r.intent==='structure'?allCuts(r):{classifications:r.units.map(unit=>({unitId:unit.id,kind:'body' as const}))})
  try{
   await f.act('choose',{mode:'files'});await f.act('classify',{mode:'ai',consent:true});const before=await f.drain(),unit=before.units[0];assert.ok(before.chapterDetection?.structureDecision);assert.equal(before.chapterDetection?.mode,'manual')
   const unchanged=(await f.act('set-range',{fileId:unit.fileId,start:unit.start,end:unit.end,kind:unit.kind})).view!;assert.equal(unchanged.revision,before.revision);assert.deepEqual(await f.saved(),before)
   if(change){const previous=await f.saved(),requests=f.requests.length;await f.act('set-range',{fileId:unit.fileId,...change});const changed=await f.saved();assert.equal(changed.revision,previous.revision+1);assert.equal(changed.chapterDetection?.structureDecision,undefined);assert.equal(changed.chapterDetection?.mode,'auto');assert.equal(changed.phase,'source');if(change.kind==='body'){await f.act('classify',{mode:'ai',consent:true});const rebuilt=await f.drain();assert.equal(rebuilt.phase,'select',rebuilt.error);assert.ok(rebuilt.chapterDetection?.structureDecision);assert.ok(f.requests.slice(requests).some(request=>request.intent==='structure'))}}
  }finally{await f.dispose()}
 }
})

test('LOTM-L-STR08: controller confirms a source with an untitled front-matter fallback',async()=>{
 const text='前置出版信息。\n\n第一部 小丑\n\n第一章 绯红\n　　合成正文。',f=await fixture(text,async r=>r.intent==='structure'?allCuts(r):{classifications:r.units.map(unit=>({unitId:unit.id,kind:'body'}))},'前置信息.txt')
 try{await f.act('choose',{mode:'files'});await f.act('classify',{mode:'ai',consent:true});const s=await f.drain();assert.equal(s.phase,'select',s.error);assert.ok(s.chapters.length>=1);assert.equal(s.chapters.map(c=>c.content).join(''),text);assert.equal(s.artifacts.length,0)}finally{await f.dispose()}
})

test('LOTM-L-STR01: named plain-text volumes retain leaf titles and reset chapter numbers without AI',async()=>{
 const text='第一册 远航\n第一节 离港\n甲。\n第二节 返航\n乙。\n第二册 归途\n第一章 新航\n丙。',f=await fixture(text,async()=>{throw Error('明确文本层级不应调用模型')},'正文.txt','txt')
 try{await f.act('choose',{mode:'files'});await f.act('classify',{mode:'local',consent:false});const s=await f.drain();assert.equal(f.requests.length,0);assert.equal(s.chapters.length,3);assert.deepEqual(s.chapters.map(c=>c.volume),['远航','远航','归途']);assert.deepEqual(s.chapters.map(c=>c.title),['第一节 离港','第二节 返航','第一章 新航']);assert.equal(s.chapters.map(c=>c.content).join(''),text)}finally{await f.dispose()}
})

test('LOTM-L-STR06: structure batches are atomic, reopen needs consent and resumes only undecided candidates',async()=>{
 const text=Array.from({length:120},()=> '第一章 标题\n内容。\n').join('');let fail=true,before:ImportSession['chapters']=[]
 const f=await fixture(text,async r=>{
  if(r.intent!=='structure')return{classifications:r.units.map(unit=>({unitId:unit.id,kind:'body'}))}
  const count=f.requests.filter(request=>request.intent==='structure').length
  if(count===1)before=structuredClone((await f.saved()).chapters)
  if(count===2&&fail)throw Error('受控第二批结构失败')
  return allCuts(r)
 })
 try{
  await f.act('choose',{mode:'files'});await f.act('classify',{mode:'ai',consent:true});const failed=await f.drain();assert.equal(failed.phase,'failed');assert.equal(failed.structureDraft?.batches.length,1);assert.deepEqual(failed.chapters,before);assert.equal(failed.artifacts.length,0);assert.equal(failed.coverage.outline,undefined);assert.ok(failed.structureGrant)
  const pending=failed.structureDraft!.candidates.filter(unit=>!failed.structureDraft!.batches.some(batch=>batch.unitIds.includes(unit.id))).map(unit=>unit.id)
  // Without a restart (an unsaved draft is no longer restored) the same controller still needs consent and resumes only undecided candidates.
  const count=f.requests.length;await assert.rejects(f.act('classify',{mode:'ai',consent:false}),/授权|允许/);assert.equal(f.requests.length,count);const kept=await f.saved();assert.deepEqual(kept.structureDraft,failed.structureDraft);assert.deepEqual(kept.chapters,before);assert.equal(kept.phase,'failed')
  fail=false;await f.act('classify',{mode:'ai',consent:true});const done=await f.drain();assert.equal(done.phase,'select');assert.equal(done.chapters.length,120);assert.equal(done.chapters.map(c=>c.content).join(''),text);assert.equal(done.structureDraft,undefined);assert.equal(done.structureGrant,undefined);assert.deepEqual(f.requests.slice(count).filter(r=>r.intent==='structure').flatMap(r=>r.units.map(unit=>unit.id)),pending);assert.equal(done.artifacts.length,0);assert.equal(done.coverage.outline,undefined)
  // Reopening deletes the unsaved draft, structure draft and grant included.
  const id=done.id;await f.reopen();assert.equal(await f.current(),null);assert.equal(existsSync(join(f.app,'novel-imports',id)),false)
 }finally{fail=false;await f.dispose()}
})

test('LOTM-L-STR06: formal manual confirmation invalidates pending structure decisions and grants',async()=>{
 const text=Array.from({length:120},()=> '第一章 标题\n内容。\n').join(''),f=await fixture(text,async r=>{if(r.intent==='structure'&&f.requests.filter(request=>request.intent==='structure').length===2)throw Error('受控第二批结构失败');return r.intent==='structure'?allCuts(r):{classifications:r.units.map(unit=>({unitId:unit.id,kind:'body'}))}})
 try{await f.act('choose',{mode:'files'});await f.act('classify',{mode:'ai',consent:true});await f.drain();assert.ok((await f.saved()).structureDraft?.batches.length);await f.act('set-chapters',{cuts:[{start:0,title:'人工确认全篇'}]});const s=await f.saved();assert.equal(s.chapters[0].title,'人工确认全篇');assert.equal(s.structureDraft,undefined);assert.equal(s.structureGrant,undefined);assert.equal(s.chapterDetection?.structureDecision,undefined);assert.equal(s.artifacts.length,0);assert.equal(s.analysisGrant,undefined)}finally{await f.dispose()}
})

test('REVIEW-STR05: same-start directory and heading candidates stay in one budget batch',async()=>{
 const files=Array.from({length:12},(_,i)=>source('第一章 标题\n内容'+i+'。','卷'.repeat(240)+'-'+i+'/第一章.txt','txt','file-'+i)).map(file=>({...file,hash:file.name})),text=files.map(file=>file.text).join('')
 const f=await fixture('',async r=>r.intent==='structure'?{chapterCuts:r.units.filter(unit=>importStructureCandidateMetadata(unit).source==='heading').map(unit=>({start:unit.start,title:importStructureCandidateMetadata(unit).title,candidateId:unit.id})),ignoredStarts:r.units.filter(unit=>importStructureCandidateMetadata(unit).source!=='heading').map(unit=>unit.start)}:{classifications:r.units.map(unit=>({unitId:unit.id,kind:'body'}))},'材料.txt','txt',files)
 try{await f.act('choose',{mode:'files'});await f.act('classify',{mode:'ai',consent:true});const s=await f.drain();assert.equal(s.phase,'select',s.error);assert.equal(s.chapters.length,12);assert.equal(s.chapters.map(c=>c.content).join(''),text);assert.ok(f.requests.some(r=>r.intent==='structure'));const all=f.requests.filter(r=>r.intent==='structure').flatMap(r=>r.units);for(const request of f.requests.filter(r=>r.intent==='structure'))for(const start of new Set(request.units.map(unit=>unit.start)))assert.deepEqual(request.units.filter(unit=>unit.start===start).map(unit=>unit.id).sort(),all.filter(unit=>unit.start===start).map(unit=>unit.id).sort(),'same-start candidates must be atomic')}finally{await f.dispose()}
})

test('REVIEW-STR06: pause drains late structure results and model changes require new consent',async()=>{
 const text=Array.from({length:120},()=> '第一章 标题\n内容。\n').join('');let held=false,release:()=>void=()=>{},before:ImportSession['chapters']=[]
 const f=await fixture(text,async r=>{
  if(r.intent!=='structure')return{classifications:r.units.map(unit=>({unitId:unit.id,kind:'body'}))}
  const count=f.requests.filter(request=>request.intent==='structure').length
  if(count===1)before=structuredClone((await f.saved()).chapters)
  if(count===2&&held)return new Promise<ImportAiResult>(resolve=>{release=()=>resolve(allCuts(r))})
  return allCuts(r)
 });f.setCancel(()=>release())
 try{
  await f.act('choose',{mode:'files'});await f.act('classify',{mode:'ai',consent:true});held=true;for(let i=0;i<3000&&f.requests.filter(r=>r.intent==='structure').length<2;i++)await new Promise(resolve=>setTimeout(resolve,2));await f.act('pause');const paused=await f.saved();assert.equal(paused.phase,'paused');assert.equal(paused.structureDraft?.batches.length,1);assert.deepEqual(paused.chapters,before)
  f.setAuthRevision(2);const count=f.requests.length;await f.act('resume',{consent:false});assert.equal(f.requests.length,count);await f.act('classify',{mode:'ai',consent:true});const done=await f.drain();assert.equal(done.phase,'select',done.error);assert.equal(done.chapters.length,120);assert.equal(done.chapters.map(c=>c.content).join(''),text);assert.equal(done.structureDraft,undefined)
 }finally{release();await f.dispose()}
})

test('REVIEW-STR08: local structure keeps a substantive short prologue across volumes with zero AI',async()=>{
 const text='序章\n短序。\n第一卷 起源\n第一章 开始\n甲。\n第二卷 归途\n第一章 返航\n乙。',f=await fixture(text,async()=>{throw Error('短序言的明确结构不应调用模型')},'目录/正文.txt','txt')
 try{await f.act('choose',{mode:'files'});await f.act('classify',{mode:'local',consent:false});const s=await f.drain();assert.equal(s.phase,'select',s.error);assert.equal(f.requests.length,0);assert.equal(s.chapters.length,3);assert.deepEqual(s.chapters.map(c=>c.title),['正文序言','第一章 开始','第一章 返航']);assert.deepEqual(s.chapters.map(c=>c.volume),[undefined,'起源','归途']);assert.equal(s.chapters[0].start,0);assert.equal(s.chapters.map(c=>c.content).join(''),text)}finally{await f.dispose()}
})

test('REVIEW-STR09: local explicit Markdown structure ignores directory siblings with zero AI',async()=>{
 const text='# 第一部 起源\n## 第一章 开始\n甲。\n## 第二章 继续\n乙。',f=await fixture(text,async()=>{throw Error('目录中的明确 Markdown 结构不应调用模型')},'目录/正文.md','md')
 try{await f.act('choose',{mode:'files'});await f.act('classify',{mode:'local',consent:false});const s=await f.drain();assert.equal(s.phase,'select',s.error);assert.equal(f.requests.length,0);assert.equal(s.chapters.length,2);assert.deepEqual(s.chapters.map(c=>c.volume),['起源','起源']);assert.equal(s.chapters.map(c=>c.content).join(''),text)}finally{await f.dispose()}
})
