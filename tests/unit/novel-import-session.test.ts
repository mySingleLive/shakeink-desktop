import assert from 'node:assert/strict'
import {test} from 'node:test'
import {mkdtemp,mkdir,readFile,readdir,writeFile,stat,rm,realpath,rename} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {NovelImportController,encodeImportJournal,IMPORT_JOURNAL_MAX_BYTES} from '../../desktop/main/novel-import'
import {importHash,importModelCharacterBudget,importScopeHash,importPlanHash,selectedImportUnits,splitImportBatches,splitImportUnits,workingImportUnits} from '../../desktop/core/novel-import'
import {importReviewTaskKeys,iterateImportReviewTasks} from '../../desktop/core/novel-import-review-tasks'
import {importSemanticAudit} from '../../desktop/core/novel-import-semantic-state'
import {serializeImportAiPayload} from '../../desktop/core/novel-import-ai-payload'
import {runImportAi} from '../../desktop/service/novel-import-ai'
import type {ImportAiRequest,ImportAiResult,ImportArtifact,ImportConflict,ImportFile,ImportModel,ImportSession,ImportUnit,ImportView} from '../../desktop/shared/novel-import'
const model:ImportModel={id:'text',name:'受控文本模型',modelId:'synthetic',endpoint:'https://model.invalid/v1',authRevision:1,contextWindow:16000}
const review={...model,id:'review'}
function outlineResult(r:ImportAiRequest):ImportAiResult{
 if(r.kind!=='outline')return {notFound:true}
 const indices=[...new Set(r.chapters?.map((c,index)=>index).filter(index=>r.units.some(u=>u.start<(r.chapters![index].end)&&u.end>r.chapters![index].start))??[0])],u=r.units[0]
 return {artifacts:indices.map(index=>({id:'detailed-'+index,kind:'outline' as const,name:'章级细纲'+index,text:'完整章级细纲'+index,facts:{chapterIndex:String(index)},origin:'inferred' as const,sourceUnitIds:[u.id],evidence:[{unitId:u.id,quote:u.text.slice(0,20)}]}))}
}
function source(text:string,name='正文.txt',id='f'):ImportFile{return {id,name,path:'/private/tmp/synthetic-sources/'+id,format:'txt',bytes:Buffer.byteLength(text),hash:importHash(text),text,included:true}}
async function fixture(files=[source('第一章\n沈砚十七岁。')],ai?:(r:ImportAiRequest)=>Promise<ImportAiResult>){
 const root=await realpath(await mkdtemp(join(tmpdir(),'novel-engine-'))),target=await realpath(await mkdtemp(join(tmpdir(),'novel-target-'))),s=await stat(target,{bigint:true});let picked=0,published=0,last:ImportSession|undefined
 const options={root,choose:async()=>{picked++;return ['/private/tmp/synthetic-sources']},chooseTarget:async()=>({path:target,device:String(s.dev),inode:String(s.ino)}),protectedDirectories:async()=>[],models:async():Promise<{text?:ImportModel;review?:ImportModel}>=>({text:model,review}),scan:async()=>structuredClone(files),verifySources:async()=>{},redecode:async(f:ImportFile)=>({...f,requiresEncodingConfirmation:false}),ai:ai??(async(r:ImportAiRequest)=>r.phase==='classify'?{classifications:r.units.map(u=>({unitId:u.id,kind:'body' as const}))}:r.phase==='review'?{conflicts:[]}:{notFound:true}),cancelAi:async(_id:string)=>{},publish:async(input:{session:ImportSession;importHash:string})=>{published++;last=structuredClone(input.session);return {requestId:input.session.publication!.requestId,workId:'work',novelId:'novel',importHash:input.importHash}}}
 const controller=new NovelImportController(options);await controller.initialize()
 async function act(type:string,extra:Record<string,unknown>={}){const v=(await controller.act({type:'current'})).view;return controller.act({type,...(type==='choose'?{}:{id:v!.id,revision:v!.revision}),...extra})}
 async function settle(){for(let i=0;i<3000&&controller.active;i++)await new Promise(resolve=>setTimeout(resolve,10));const view=(await controller.act({type:'current'})).view!;assert.equal(controller.active,0,'background job drained: '+view.phase+' '+(view.error??''));return view}
 async function ready(infer=false,targets:string[]=[]){await act('choose',{mode:'files'});await act('classify',{mode:'local',consent:false});const v=(await controller.act({type:'current'})).view!;await act('select',{selected:files.some(f=>f.name.startsWith('正文'))?['body',...Object.keys(v.found).filter(k=>k!=='body'&&v.found[k as keyof typeof v.found])]:Object.keys(v.found).filter(k=>v.found[k as keyof typeof v.found]),targets,infer});await act('choose-target');await act('set-title',{title:'合成小说'})}
 return {controller,options,act,settle,ready,root,target,get picked(){return picked},get published(){return published},get last(){return last},async dispose(){await controller.close();await rm(root,{recursive:true,force:true});await rm(target,{recursive:true,force:true})}}
}
test('NI-S01: classification consent is separate from unknown readiness and stale revisions fail',async()=>{
 const f=await fixture([source('不带明确标题的文本','材料.txt')]);try{const v=(await f.act('choose',{mode:'files'})).view!;assert.equal(v.sourceReady,false);await assert.rejects(f.act('classify',{mode:'ai',consent:false}),/授权|允许/);const started=(await f.act('classify',{mode:'ai',consent:true})).view!;assert.equal(started.phase,'recognizing');assert.equal((await f.settle()).phase,'select');await assert.rejects(f.controller.act({type:'include',id:v.id,revision:v.revision,fileId:'f',included:false}),/版本|过期/)}finally{await f.dispose()}
 const g=await fixture([source('手动分类文本','材料.txt')]);try{await g.act('choose',{mode:'files'});await g.act('set-range',{fileId:'f',start:0,end:6,kind:'body'});const v=(await g.act('classify',{mode:'local',consent:false})).view!;assert.equal(v.sourceReady,true);assert.deepEqual(v.selected,['body'])}finally{await g.dispose()}
 const h=await fixture([source('甲'.repeat(32766)+'😀'+'乙'.repeat(32767)+'😀尾')]);try{const v=(await h.act('choose',{mode:'files'})).view!;const result=await h.controller.act({type:'read-source',id:v.id,fileId:'f',offset:32767,limit:32768});assert.equal(result.source?.offset,32766);assert.equal(result.source?.text.isWellFormed(),true)}finally{await h.dispose()}
 const j=await fixture([{...source('正文甲。'),bytes:49*1024*1024},{...source('正文乙。','正文二.txt','f2'),bytes:49*1024*1024}]);try{const v=(await j.act('choose',{mode:'files'})).view!;j.options.scan=async()=>[{...source('正文丙。','正文三.txt','f3'),bytes:3*1024*1024}];await assert.rejects(j.act('choose',{mode:'files',append:true}),/限制|总量/);assert.equal((await j.controller.act({type:'current'})).view?.files.length,v.files.length)}finally{await j.dispose()}
})
test('NI-S02: full-book batches checkpoint successful work and retry the failed batch',async()=>{
 let fail=true;const completed:string[]=[],attempts:string[]=[]
 const f=await fixture([source('第一章\n'+'甲'.repeat(12000)+'末章关键人物。')],async r=>{if(r.phase==='review')return {conflicts:[]};if(r.phase==='analyze'){const id=r.units[0].id;attempts.push(id);if(attempts.length===2&&fail){fail=false;throw Error('受控晚批失败')}completed.push(...r.units.map(u=>u.id));return outlineResult(r)}return {}})
 try{await f.ready(true,['character']);await f.act('start',{consent:true});assert.equal((await f.settle()).phase,'failed');await f.act('retry');assert.equal((await f.settle()).phase,'completed');assert.equal(attempts.filter(id=>id===attempts[0]).length,1);assert.ok(f.last?.workingProse.endsWith('末章关键人物。'));assert.ok(completed.length>=13)}finally{await f.dispose()}
 const document='世界观\n'+Array.from({length:3600},(_,i)=>String.fromCharCode(0x4e00+i)).join('')+'末设定规则。',reviewed:string[]=[]
 const g=await fixture([source('第一章\n正文内容。'),source(document,'世界观.txt','world')],async r=>{if(r.phase==='analyze')return outlineResult(r);if(r.phase==='review'&&r.instruction?.startsWith('这是设定完整文本'))reviewed.push(...r.artifacts.map(a=>a.text));return {conflicts:[]}})
 try{await g.ready(true,['character']);await g.act('start',{consent:true});assert.equal((await g.settle()).phase,'completed');assert.ok(reviewed.join('').includes('末设定规则。'));assert.ok(reviewed.join('').length>=document.length);assert.ok(g.last?.coverage.reviewFacts.length)}finally{await g.dispose()}
})
test('NI-S03: requested stages run in reverse-creation order and disabled stages skip',async()=>{
 const kinds:string[]=[]
 const f=await fixture(undefined,async r=>{
  if(r.phase==='analyze'){
   kinds.push(r.kind!)
   if(r.kind==='outline')return {artifacts:[{id:'detailed-0',kind:'outline',name:'第一章细纲',text:'完整的章级细纲',facts:{chapterIndex:'0'},origin:'inferred',sourceUnitIds:[r.units[0].id],evidence:[{unitId:r.units[0].id,quote:r.units[0].text.slice(0,20)}]}]}
   return outlineResult(r)
  }
  return {conflicts:[]}
 })
 try{await f.ready(true,['outline','character','scene','item','world','theme','style','foreshadow','goldenFinger','trope','worldline','narrative']);await f.act('start',{consent:true});assert.equal((await f.settle()).phase,'completed');assert.deepEqual(kinds,['character','scene','item','world','theme','style','foreshadow','goldenFinger','trope','worldline','narrative','outline']);assert.equal(f.last?.steps.find(s=>s.key==='outline-structure')?.state,'done');assert.equal(f.last?.chapters[0].outline,'完整的章级细纲');assert.equal(f.last?.notFound.length,11)}finally{await f.dispose()}
 const g=await fixture(undefined,async r=>{if(r.phase==='review')throw Error('受控复核失败');return {artifacts:[{id:'shen',kind:'character',name:'沈砚',text:'沈砚十七岁。',facts:{age:'17',roleType:'PROTAGONIST',aliases:'[]',relationships:'[]'},origin:'inferred',sourceUnitIds:[r.units[0].id],evidence:[{unitId:r.units[0].id,quote:'沈砚十七岁'}]}]}})
 try{await g.ready(true,['character']);await g.act('start',{consent:true});const failed=await g.settle();assert.equal(failed.phase,'failed');await g.act('set-chapters',{cuts:[{start:0,title:'手动第一章'}]});const s=JSON.parse(await readFile(join(g.root,'novel-imports',failed.id,'session.json'),'utf8')) as ImportSession;assert.equal(s.phase,'confirm');assert.equal(s.artifacts.length,0);assert.deepEqual(s.coverage,{});assert.equal(s.analysisGrant,undefined);assert.equal(s.chapters[0].title,'手动第一章')}finally{await g.dispose()}
})
test('NI-S04: no prose and inference-disabled pure-copy have zero AI calls including review',async()=>{
 let calls=0;const f=await fixture([source('角色\n沈砚：十九岁。','角色.txt')],async()=>{calls++;throw Error('不应调用')})
 try{await f.ready(true,['world']);await f.act('start',{consent:false});const v=await f.settle();assert.equal(v.phase,'completed');assert.equal(v.steps.find(s=>s.key==='review')?.state,'skipped');assert.equal(calls,0);assert.equal(f.last?.artifacts[0].text,'角色\n沈砚：十九岁。');assert.equal(f.last?.workingProse,'')}finally{await f.dispose()}
 const g=await fixture(undefined,async()=>{calls++;throw Error('不应调用')});try{await g.ready(false,['world']);await g.act('start',{consent:false});assert.equal((await g.settle()).phase,'completed');assert.equal(calls,0)}finally{await g.dispose()}
})
test('NI-S05: source/body contradictions block publication and retaining a setting needs reviewed explanation',async()=>{
 const f=await fixture([source('第一章\n沈砚十七岁。'),source('沈砚：\n年龄：十九岁。','角色.txt','c')],async r=>r.phase==='analyze'?{artifacts:[{id:'inferred-shen',kind:'character',name:'沈砚',text:'沈砚十七岁',facts:{age:'17',roleType:'PROTAGONIST',aliases:'[]',relationships:'[]'},origin:'inferred',sourceUnitIds:[r.units[0].id],evidence:[{unitId:r.units[0].id,quote:'十七岁'}]}]}:{conflicts:[]})
 try{await f.ready(true,['character']);await f.act('start',{consent:true});const v=await f.settle();assert.equal(v.phase,'conflicts',v.error);assert.equal(f.published,0);const c=v.conflicts[0];await assert.rejects(f.act('resolve',{conflictId:c.id,choice:'source'}),/解释|依据/);await f.act('resolve',{conflictId:c.id,choice:'inferred'});assert.equal((await f.settle()).phase,'completed');assert.equal(f.last?.artifacts.find(a=>a.kind==='character')?.facts.age,'17')}finally{await f.dispose()}
 const g=await fixture([source('沈砚：\n年龄：十九岁。','角色 甲.txt','a'),source('沈砚：\n年龄：十七岁。','角色 乙.txt','b')],async()=>{throw Error('无正文不可调用模型')});try{await g.ready(false,[]);await g.act('start',{consent:false});const v=await g.settle();assert.equal(v.phase,'conflicts');await assert.rejects(g.act('resolve',{conflictId:v.conflicts[0].id,choice:'inferred'}),/不支持/);await g.act('resolve',{conflictId:v.conflicts[0].id,choice:'b'});assert.equal((await g.settle()).phase,'completed');assert.equal(g.last?.artifacts[0].facts.age,'十七岁。')}finally{await g.dispose()}
})
test('NI-S06: prose patches preserve original and invalidate analysis authorization',async()=>{
 const f=await fixture([source('第一章\n沈砚十七岁。'),source('沈砚：\n年龄：十九岁。','角色.txt','c')],async r=>r.phase==='patch'?{patches:[{id:'p',start:6,end:9,before:'十七岁',after:'十九岁',workingRevision:r.workingRevision!,conflictId:r.conflict!.id,reason:'作者确认'}]}:r.phase==='analyze'?{artifacts:[{id:'b',kind:'character',name:'沈砚',text:'沈砚十七岁',facts:{age:'17',roleType:'PROTAGONIST',aliases:'[]',relationships:'[]'},origin:'inferred',sourceUnitIds:[r.units[0].id],evidence:[{unitId:r.units[0].id,quote:'十七岁'}]}]}:{conflicts:[]})
 try{await f.ready(true,['character']);await f.act('start',{consent:true});const v=await f.settle();f.options.models=async()=>({text:{...model,authRevision:2},review:{...review,authRevision:2}});const renewed=(await f.act('start',{consent:true})).view!;assert.equal(renewed.phase,'conflicts');assert.equal(renewed.conflicts[0].id,v.conflicts[0].id);await f.act('resolve',{conflictId:v.conflicts[0].id,choice:'rewrite'});assert.equal((await f.settle()).patches.length,1);await f.act('apply-patches',{patchIds:['p'],confirm:true});const session=JSON.parse(await readFile(join(f.root,'novel-imports',v.id,'session.json'),'utf8')) as ImportSession;assert.ok(session.originalProse.includes('十七岁'));assert.ok(session.workingProse.includes('十九岁'));assert.equal(session.analysisGrant,undefined);await assert.rejects(f.act('start',{consent:false}),/授权|允许/);await f.act('select',{selected:['character'],targets:['character'],infer:true});await f.act('start',{consent:false});assert.equal((await f.settle()).phase,'completed');assert.equal(f.last?.workingProse,'');assert.equal(f.last?.chapters.length,0)}finally{await f.dispose()}
})
test('NI-S07: pause drains an operation and a late success never advances stale epoch',async()=>{
 let release:(r:ImportAiResult)=>void=()=>{};let operation='';const f=await fixture([source('未知材料','材料.txt')],async r=>{operation=r.operationId;return new Promise(resolve=>{release=resolve})});f.options.cancelAi=async id=>{assert.equal(id,operation);release({classifications:[{unitId:'f:0:4',kind:'body'}]})}
 try{await f.act('choose',{mode:'files'});await f.act('classify',{mode:'ai',consent:true});await new Promise(resolve=>setTimeout(resolve,10));await f.act('pause');assert.equal(f.controller.active,0);assert.equal((await f.controller.act({type:'current'})).view?.phase,'paused');await assert.rejects(f.act('choose',{mode:'files'}),/已有未完成的导入，请先删除/);assert.equal((await f.controller.act({type:'current'})).view?.phase,'paused');assert.equal(f.picked,1)}finally{await f.dispose()}
})
test('NI-S08: journal restores checkpoints but target authorization must be renewed',async()=>{
 assert.equal(IMPORT_JOURNAL_MAX_BYTES,1024*1024*1024)
 const f=await fixture();try{await f.ready(false,[]);const v=(await f.controller.act({type:'current'})).view!;assert.equal(v.targetReady,true);assert.equal(v.selected.includes('body'),true);f.options.verifySources=async()=>{throw Error('来源文件已发生变化')};await assert.rejects(f.controller.act({type:'start',id:v.id,revision:v.revision,consent:false}),/来源/);assert.equal(f.published,0);const entries=await readdir(join(f.root,'novel-imports',v.id));assert.ok(entries.includes('session.json'));const mode=(await stat(join(f.root,'novel-imports',v.id,'session.json'))).mode&0o777;assert.equal(mode,0o600);const saved=JSON.parse(await readFile(join(f.root,'novel-imports',v.id,'session.json'),'utf8')) as ImportSession,encoded=JSON.stringify(saved);assert.equal(saved.selected.includes('body'),true);assert.ok(saved.target);assert.equal(encodeImportJournal(saved,Buffer.byteLength(encoded)),encoded);assert.throws(()=>encodeImportJournal(saved,encoded.length),/容量/)
  // An unsaved draft is deleted on close and never restored.
  await f.controller.close();const restored=new NovelImportController(f.options);try{await restored.initialize();assert.equal((await restored.act({type:'current'})).view,null);await assert.rejects(stat(join(f.root,'novel-imports',v.id)),{code:'ENOENT'})}finally{await restored.close()}}finally{await f.dispose()}
 const g=await fixture();let first=true,originalHash='';const publisher=g.options.publish;g.options.publish=async input=>{if(first){first=false;originalHash=input.importHash;throw Error('保存回执丢失')}return publisher(input)}
 try{await g.ready(true,['character']);await g.act('start',{consent:true});assert.equal((await g.settle()).phase,'failed');assert.ok((await saved(g)).publication,'fixture reached the save boundary');await g.controller.close();const restored=new NovelImportController({...g.options,models:async()=>({}),ai:async()=>{throw Error('恢复已冻结保存不应再发AI')}});await restored.initialize();let v=(await restored.act({type:'current'})).view!;v=(await restored.act({type:'resume',id:v.id,revision:v.revision})).view!;assert.equal(v.phase,'confirm');assert.equal(v.targetReady,false);await assert.rejects(restored.act({type:'select',id:v.id,revision:v.revision,selected:[],targets:[],infer:false}),/保存|原导入计划/);v=(await restored.act({type:'choose-target',id:v.id,revision:v.revision})).view!;await restored.act({type:'start',id:v.id,revision:v.revision,consent:false});for(let i=0;i<400&&restored.active;i++)await new Promise(resolve=>setTimeout(resolve,3));v=(await restored.act({type:'current'})).view!;assert.equal(v.phase,'completed');assert.equal(g.last?.publication?.hash,originalHash);assert.equal(g.last?.publication?.requestId,v.id);await restored.close()}finally{await g.dispose()}
})
test('NI-S09: discard preserves unknown draft files and complete does not block new import',async()=>{
 const f=await fixture();try{const v=(await f.act('choose',{mode:'files'})).view!;const foreign=join(f.root,'novel-imports',v.id,'unrelated.txt');await writeFile(foreign,'保留');await assert.rejects(f.act('discard'),/未知|保留|其他/);assert.equal(await readFile(foreign,'utf8'),'保留');assert.ok((await readdir(join(f.root,'novel-imports',v.id))).includes('session.json'),'validation precedes any delete');assert.equal((await f.controller.act({type:'current'})).view,null,'the kept draft is released from memory');await rm(foreign);const clean=(await f.act('choose',{mode:'files'})).view!;assert.notEqual(clean.id,v.id);await f.act('discard');assert.equal((await f.controller.act({type:'current'})).view,null);await assert.rejects(stat(join(f.root,'novel-imports',clean.id)),{code:'ENOENT'});await f.ready();await f.act('start',{consent:false});assert.equal((await f.settle()).phase,'completed');const done=(await f.controller.act({type:'current'})).view!;const next=(await f.act('choose',{mode:'files'})).view!;assert.notEqual(next.id,done.id)}finally{await f.dispose()}
})

async function saved(f:Awaited<ReturnType<typeof fixture>>){const v=(await f.controller.act({type:'current'})).view!;return JSON.parse(await readFile(join(f.root,'novel-imports',v.id,'session.json'),'utf8')) as ImportSession}
async function control(controller:NovelImportController,type:string,extra:Record<string,unknown>={}){const v=(await controller.act({type:'current'})).view!;return controller.act({type,...(type==='current'?{}:{id:v.id,revision:v.revision}),...extra})}
async function drained(controller:NovelImportController){for(let i=0;i<400&&controller.active;i++)await new Promise(resolve=>setTimeout(resolve,3));assert.equal(controller.active,0);return (await controller.act({type:'current'})).view!}
async function until(check:()=>boolean){for(let i=0;i<400&&!check();i++)await new Promise(resolve=>setTimeout(resolve,3));assert.ok(check(),'expected in-flight synthetic operation')}

test('NI-S12: local and synthetic AI source confirmation retain manual chapters across reopen',async()=>{
 const prefix='合成前记😀。\r\n\r\n',entries=Array.from({length:13},(_,i)=>`合成记事${i+1}。\r\n这一则的完整合成文字。\r\n\r\n`),text=prefix+entries.join(''),cuts=[{start:0,title:'人工确认前记'},...entries.map((entry,i)=>({start:text.indexOf(entry),title:'人工确认记事'+(i+1)}))],requests:ImportAiRequest[]=[]
 const f=await fixture([source(text)],async request=>{requests.push(structuredClone(request));assert.equal(request.phase,'classify','this scenario never starts setting analysis');return {classifications:request.units.map(unit=>({unitId:unit.id,kind:'body'}))}})
 try{
  await f.act('choose',{mode:'files'});await f.act('classify',{mode:'local',consent:false});await f.act('select',{selected:['body'],targets:['character','worldline','narrative'],infer:true});await f.act('set-chapters',{cuts});const manual=await saved(f)
  assert.equal(manual.chapters.length,14);assert.equal(manual.chapterDetection?.mode,'manual');assert.equal(manual.chapters.map(c=>c.content).join(''),text);assert.equal(requests.length,0)
  const assertRetained=(s:ImportSession)=>{assert.deepEqual(s.chapters,manual.chapters);assert.deepEqual(s.chapterDetection,manual.chapterDetection);assert.equal(s.chapters.map(c=>c.content).join(''),text);assert.equal(importHash(s.chapters.map(c=>c.content).join('')),importHash(text));assert.deepEqual(s.files,manual.files);assert.deepEqual(s.units,manual.units);assert.deepEqual(s.selected,manual.selected);assert.deepEqual(s.targets,manual.targets);assert.equal(s.infer,manual.infer);assert.equal(s.originalProse,'');assert.equal(s.workingProse,'');assert.equal(s.workingRevision,0);assert.deepEqual(s.artifacts,[]);assert.deepEqual(s.decisions,[]);assert.equal(s.publication,undefined)}
  await f.act('classify',{mode:'local',consent:false});const local=await saved(f);assertRetained(local);assert.equal(requests.length,0,'local confirmation remains zero AI');assert.deepEqual(local.coverage,{})
  await f.act('classify',{mode:'ai',consent:true});assert.equal((await f.settle()).phase,'select');const classified=await saved(f);assertRetained(classified);assert.ok(requests.length>0);assert.deepEqual(classified.coverage.classify,manual.units.map(unit=>unit.id));assert.equal(classified.classificationGrant,undefined);assert.equal(classified.analysisGrant,undefined);assert.equal(f.published,0)
  // Unsaved drafts no longer survive a restart; a durable pause and resume in the same controller is the reopen path.
  const path=join(f.root,'novel-imports',classified.id,'session.json');await f.act('pause');const paused=JSON.parse(await readFile(path,'utf8')) as ImportSession;assert.equal(paused.phase,'paused');assertRetained(paused);assert.deepEqual(paused.coverage,classified.coverage)
  assert.equal((await f.act('resume')).view?.phase,'select');const reopened=JSON.parse(await readFile(path,'utf8')) as ImportSession;assertRetained(reopened);assert.deepEqual(reopened.coverage,classified.coverage);const callCount=requests.length
  await f.act('classify',{mode:'local',consent:false});assertRetained(JSON.parse(await readFile(path,'utf8')) as ImportSession);assert.equal(requests.length,callCount);assert.equal(f.published,0)
 }finally{await f.dispose()}
})

test('NI-S13: preanalysis drafts resume their exact review stage without consent or AI',async t=>{
 const text='合成来源前言😀。\r\n\r\n合成正文甲。\r\n合成正文末句。',targets=['outline','theme','style','world','character','scene','item','foreshadow','goldenFinger','trope','worldline','narrative']
 const fields=['id','title','files','units','originalProse','workingProse','workingRevision','workingUnits','chapters','chapterDetection','selected','targets','infer','coverage','artifacts','decisions','conflicts','patches','notFound','steps','budgetPolicy','legacyBudget','semanticState','publication','analysisCheckpoint','classificationGrant','analysisGrant','target','runtimeAiCall','runtimePauseProof','runtimeDiagnosticsStatus']
 const stable=(s:ImportSession)=>Object.fromEntries(fields.map(key=>[key,(s as unknown as Record<string,unknown>)[key]]))
 for(const stage of ['source','select','confirm'] as const)await t.test(stage,async()=>{
  let calls=0;const f=await fixture([source(text)],async()=>{calls++;throw Error('分析前恢复不应发模型请求')});let restored:NovelImportController|undefined
  try{await f.act('choose',{mode:'files'});if(stage!=='source'){await f.act('classify',{mode:'local',consent:false});await f.act('select',{selected:['body'],targets,infer:true})}if(stage==='confirm')await f.act('set-title',{title:'合成分析前草稿'})
   const before=await saved(f),path=join(f.root,'novel-imports',before.id,'session.json');assert.equal(before.phase,stage);assert.equal(before.target,undefined);assert.equal(before.infer,true);assert.equal(before.targets.length,12);assert.deepEqual([...before.targets].sort(),[...targets].sort());assert.equal(selectedImportUnits(before).filter(unit=>unit.kind==='body').map(unit=>unit.text).join(''),text);assert.equal((before as ImportSession&{analysisCheckpoint?:unknown}).analysisCheckpoint,undefined)
   // A durable pause in the same controller replaces the removed unsaved-draft restart.
   await f.act('pause');const paused=JSON.parse(await readFile(path,'utf8')) as ImportSession;assert.equal(paused.phase,'paused');assert.equal(paused.resumePhase,stage);assert.deepEqual(stable(paused),stable(before))
   assert.equal((await f.controller.act({type:'current'})).view?.phase,'paused');const response=await f.act('resume');assert.equal(response.view?.phase,stage);assert.equal(f.controller.active,0);const after=JSON.parse(await readFile(path,'utf8')) as ImportSession;assert.equal(after.phase,stage);assert.equal(after.resumePhase,undefined);assert.deepEqual(stable(after),stable(before));assert.equal(calls,0);assert.equal(f.published,0)
   await f.controller.close();restored=new NovelImportController(f.options);await restored.initialize();assert.equal((await restored.act({type:'current'})).view,null);await assert.rejects(stat(join(f.root,'novel-imports',before.id)),{code:'ENOENT'});assert.equal(calls,0)
  }finally{await restored?.close();await f.dispose()}
 })
 await t.test('existing-target-still-requires-explicit-reauthorization-first',async()=>{
  let calls=0;const f=await fixture([source(text)],async()=>{calls++;throw Error('重授权目录不能自动开始分析')});let restored:NovelImportController|undefined
  try{await f.act('choose',{mode:'files'});await f.act('classify',{mode:'local',consent:false});await f.act('select',{selected:['body'],targets,infer:true});await f.act('choose-target');const before=await saved(f),path=join(f.root,'novel-imports',before.id,'session.json');assert.ok(before.target)
   // Reauthorization after restart applied only to an unsaved draft, which is now deleted instead of restored.
   await f.controller.close();await assert.rejects(readFile(path,'utf8'),{code:'ENOENT'});restored=new NovelImportController(f.options);await restored.initialize();assert.equal((await restored.act({type:'current'})).view,null);await assert.rejects(stat(join(f.root,'novel-imports',before.id)),{code:'ENOENT'});assert.equal(calls,0);assert.equal(f.published,0)
  }finally{await restored?.close();await f.dispose()}
 })
})
const factReview=(r:ImportAiRequest)=>r.phase==='review'&&r.instruction?.startsWith('这是设定完整文本')
function expectedReviewTasks(s:ImportSession,budget:number){
 const units=[...workingImportUnits(s),...selectedImportUnits(s).filter(u=>u.kind!=='body')],lookup=new Map(units.map(u=>[u.id,u])),tasks:{key:string;units:ImportUnit[];artifact:ImportArtifact}[]=[]
 for(const a of s.artifacts){
  const evidenceUnits=[...new Set(a.evidence.map(e=>e.unitId))].map(id=>lookup.get(id)!)
  const pieces=splitImportUnits([{...source(a.text),id:a.id}],Math.max(250,Math.floor(budget/5))).map(u=>({text:u.text,facts:{} as Record<string,string>}))
  for(const [field,value] of Object.entries(a.facts))pieces.push({text:'',facts:{[field]:value}})
  if(!pieces.length)pieces.push({text:'',facts:{}})
  for(let index=0;index<pieces.length;index++)for(const batch of splitImportBatches(evidenceUnits,Math.max(1000,Math.floor(budget/2)))){
   const ids=new Set(batch.map(u=>u.id))
   tasks.push({key:importHash({artifact:a.id,text:a.text,facts:a.facts,evidence:a.evidence,index,units:batch.map(u=>({id:u.id,text:importHash(u.text)}))}),units:batch,artifact:{...a,...pieces[index],evidence:a.evidence.filter(e=>ids.has(e.unitId)),sourceUnitIds:a.sourceUnitIds.filter(id=>ids.has(id))}})
  }
 }
 return tasks
}
function multiset(artifacts:ImportArtifact[]){return artifacts.map(a=>importHash(a)).sort()}
function assertReviewPackages(requests:ImportAiRequest[],budget:number){for(const r of requests){assert.equal(new Set(r.units.map(u=>u.id)).size,r.units.length,'shared units occur once');assert.ok(r.units.reduce((n,u)=>n+u.text.length,0)<=budget,'source character budget');assert.ok(JSON.stringify({units:r.units,artifacts:r.artifacts}).length<=budget*2,'serialized content budget');for(const a of r.artifacts){assert.ok(a.evidence.length);assert.ok(a.evidence.every(e=>r.units.some(u=>u.id===e.unitId&&u.text.includes(e.quote))));assert.ok(a.sourceUnitIds.every(id=>r.units.some(u=>u.id===id)))}}}

test('NI-S10: start after durable pause and target reauthorization retains only valid analysis checkpoints',async t=>{
 for(const change of ['none','legacy','double-reopen','range','selection','target','replaced-target'] as const)await t.test(change,async()=>{
  const calls:string[]=[],f=await fixture([source('第一章\n沈砚十七岁。')],async r=>{
   if(r.phase==='analyze'){calls.push(r.kind!);return {artifacts:[{id:'shen',kind:'character',name:'沈砚',text:'沈砚十七岁。',facts:{age:'17',roleType:'PROTAGONIST',aliases:'[]',relationships:'[]'},origin:'inferred',sourceUnitIds:[r.units[0].id],evidence:[{unitId:r.units[0].id,quote:'十七岁'}]}]}}
   return {conflicts:[]}
  });let restored:NovelImportController|undefined,other:string|undefined
  // The synthetic cancellation rejects its own pending request. No journal is injected.
  let cancel:()=>void=()=>{};const initial=f.options.ai;f.options.ai=async r=>r.phase==='analyze'&&r.kind==='scene'?(calls.push(r.kind),new Promise((_resolve,reject)=>{cancel=()=>reject(new DOMException('paused','AbortError'))})):initial(r);f.options.cancelAi=async()=>cancel()
  try{
   await f.ready(true,['character','scene']);await f.act('start',{consent:true});await until(()=>calls.includes('scene'));await f.act('pause');const before=await saved(f);assert.ok(before.coverage.character?.length);assert.equal(before.artifacts.length,1)
   const dir=join(f.root,'novel-imports',before.id)
   if(change==='legacy'){
    // Only this mkdtemp synthetic journal is converted to the pre-marker format. An unsaved legacy draft is deleted at startup, never migrated.
    const legacy={...before} as ImportSession&{analysisCheckpoint?:unknown};delete legacy.analysisCheckpoint;await writeFile(join(dir,'session.json'),JSON.stringify(legacy))
    restored=new NovelImportController(f.options);await restored.initialize();assert.equal((await restored.act({type:'current'})).view,null);await assert.rejects(stat(dir),{code:'ENOENT'});assert.deepEqual(calls,['character','scene']);return
   }
   if(change==='double-reopen'){
    await f.controller.close();await assert.rejects(stat(dir),{code:'ENOENT'})
    for(let i=0;i<2;i++){restored=new NovelImportController(f.options);await restored.initialize();assert.equal((await restored.act({type:'current'})).view,null);await restored.close();restored=undefined}
    await assert.rejects(stat(dir),{code:'ENOENT'});assert.deepEqual(calls,['character','scene']);assert.equal(f.published,0);return
   }
   const journal=()=>readFile(join(dir,'session.json'),'utf8').then(value=>JSON.parse(value) as ImportSession)
   assert.deepEqual((await journal()).coverage,before.coverage)
   if(change==='target'){
    other=await realpath(await mkdtemp(join(tmpdir(),'novel-other-')));const info=await stat(other,{bigint:true});f.options.chooseTarget=async()=>({path:other!,device:String(info.dev),inode:String(info.ino)})
    await assert.rejects(f.act('choose-target'),/原来|原保存|原目标/);assert.deepEqual((await journal()).coverage,before.coverage);return
   }
   if(change==='replaced-target'){
    // Replace only the isolated synthetic target, preserving the old inode elsewhere.
    other=f.target+'-original';await rename(f.target,other);await mkdir(f.target);const info=await stat(f.target,{bigint:true});f.options.chooseTarget=async()=>({path:f.target,device:String(info.dev),inode:String(info.ino)})
    await assert.rejects(f.act('choose-target'),/原来|原保存|原目标/);assert.deepEqual((await journal()).artifacts,before.artifacts);return
   }
   await f.act('choose-target');await assert.rejects(f.act('start',{consent:false}),/允许|授权/);await f.act('set-title',{title:before.title});assert.deepEqual((await journal()).coverage,before.coverage);assert.deepEqual((await journal()).artifacts,before.artifacts);assert.deepEqual(calls,['character','scene'])
   if(change==='range')await f.act('set-range',{fileId:'f',start:4,end:6,kind:'excluded'})
   if(change==='selection')await f.act('select',{selected:['body'],targets:['character'],infer:true})
   const changedScope=change==='range'||change==='selection';if(changedScope){assert.deepEqual((await journal()).coverage,{});assert.deepEqual((await journal()).artifacts,[])}
   f.options.ai=async r=>{if(r.phase==='analyze'){calls.push(r.kind!);return outlineResult(r)}return {conflicts:[]}}
   await f.act('start',{consent:true});assert.equal((await drained(f.controller)).phase,'completed');assert.equal(calls.filter(kind=>kind==='character').length,changedScope?2:1);assert.equal(f.last?.publication?.requestId,before.id);assert.equal(f.last?.id,before.id);if(!changedScope)assert.deepEqual(f.last?.artifacts,before.artifacts)
  }finally{await restored?.close();await f.dispose();if(other)await rm(other,{recursive:true,force:true})}
 })
 await t.test('working-revision',async()=>{
  const revisions:number[]=[],f=await fixture([source('第一章\n沈砚十七岁。'),source('角色\n沈砚：\n年龄：19\n角色类型：主角','角色.txt','c')],async r=>{
   if(r.phase==='patch')return {patches:[{id:'p',start:6,end:9,before:'十七岁',after:'十九岁',workingRevision:r.workingRevision!,conflictId:r.conflict!.id,reason:'作者确认'}]}
   if(r.phase==='analyze'){revisions.push(r.workingRevision!);return r.workingRevision?{notFound:true}:{artifacts:[{id:'shen',kind:'character',name:'沈砚',text:'沈砚十七岁',facts:{age:'17',roleType:'PROTAGONIST',aliases:'[]',relationships:'[]'},origin:'inferred',sourceUnitIds:[r.units[0].id],evidence:[{unitId:r.units[0].id,quote:'十七岁'}]}]}}
   return {conflicts:[]}
  })
  try{await f.ready(true,['character']);await f.act('start',{consent:true});const conflict=(await f.settle()).conflicts[0],before=await saved(f);await f.act('resolve',{conflictId:conflict.id,choice:'rewrite'});await f.settle();await f.act('apply-patches',{patchIds:['p'],confirm:true});assert.deepEqual((await saved(f)).coverage,{});await assert.rejects(f.act('start',{consent:false}),/允许|授权/);await f.act('start',{consent:true});assert.equal((await f.settle()).phase,'completed');assert.deepEqual(revisions,[0,1]);assert.ok(f.last!.workingProse.includes('十九岁'));assert.equal(f.last!.artifacts.some(a=>a.origin==='inferred'),false);const checkpoint=(f.last! as ImportSession&{analysisCheckpoint:{hash:string}}).analysisCheckpoint;assert.notEqual(checkpoint.hash,importScopeHash(before,'analyze'));assert.equal(checkpoint.hash,importScopeHash(f.last!,'analyze'))}finally{await f.dispose()}
 })
})

test('NI-S11: bounded fact review packs retain every deterministic task and checkpoint atomically',async t=>{
 const budget=importModelCharacterBudget(review.contextWindow),text='首文字哨兵'+'细'.repeat(3000)+'末文字哨兵',facts=Object.fromEntries([['roleType','PROTAGONIST'],['aliases','[]'],['relationships','[]'],...['age','gender','occupation','personality','appearance','clothing','catchphrase','growthArc','reliability','attribution','temporalScope'].map(key=>[key,(key==='reliability'?'客观事实':(key==='temporalScope'?'末字段哨兵':key==='age'?'同实体替代甲':key==='gender'?'同实体替代乙':'事实'+key)+'值'.repeat(80))])])
 for(const failure of ['network','evidence','reference','unit-reference','pause'] as const)await t.test(failure,async()=>{
  const requests:ImportAiRequest[]=[];let release:(result:ImportAiResult)=>void=()=>{},fail=true
  const f=await fixture([source('第一章\n'+'甲'.repeat(996))],async r=>{
   if(r.phase==='analyze')return {artifacts:[{id:'same-entity',kind:'character',name:'沈砚',text,facts,origin:'inferred',sourceUnitIds:[r.units[0].id],evidence:[{unitId:r.units[0].id,quote:r.units[0].text.slice(0,600)}]}]}
   if(factReview(r)){
    requests.push(structuredClone(r))
    if(requests.length===2&&fail){
     if(failure==='network')throw Error('受控整包失败')
     if(failure==='pause')return new Promise(resolve=>{release=resolve})
     const valid:ImportConflict={id:'c1',hash:'c1',type:'body-body',kind:'character',entity:'沈砚',field:'age',source:{text:'甲',value:'甲',artifactId:r.artifacts[0].id},candidate:{text:'乙',value:'乙'},evidence:[{unitId:r.units[0].id,quote:r.units[0].text.slice(0,10)}],status:'pending'}
     return {conflicts:[valid,{...valid,id:'c2',hash:'c2',...(failure==='evidence'?{evidence:[{unitId:r.units[0].id,quote:'不存在的证据'}]}:{candidate:{text:'乙',value:'乙',...(failure==='reference'?{artifactId:'unknown-artifact'}:{unitId:'unknown-unit'})}})}]}
    }
   }
   return {conflicts:[]}
  });f.options.cancelAi=async()=>release({conflicts:[]})
  try{
   await f.ready(true,['character']);await f.act('start',{consent:true})
   if(failure==='pause'){await until(()=>requests.length===2);await f.act('pause')}else assert.equal((await f.settle()).phase,'failed')
   const checkpoint=await saved(f),tasks=expectedReviewTasks(checkpoint,budget),successful=requests[0].artifacts,expectedKeys=tasks.filter(task=>successful.some(a=>importHash(a)===importHash(task.artifact))).map(task=>task.key)
   assert.equal(requests.length,2);assert.ok(successful.length>1,'several tasks share one response');assert.ok(checkpoint.coverage.reviewFacts!.length>1);assert.deepEqual([...checkpoint.coverage.reviewFacts!].sort(),expectedKeys.sort());assert.deepEqual(checkpoint.conflicts,[],'a valid conflict before an invalid one gets no partial credit');assert.ok(checkpoint.coverage.reviewFacts!.length<tasks.length)
   fail=false;await f.act('resume',{consent:true});assert.equal((await f.settle()).phase,'completed')
   const committed=[requests[0],...requests.slice(2)];assert.ok(committed.length<=3,'small shared-evidence sample takes at most three successful requests');assertReviewPackages(requests,budget);assert.deepEqual(multiset(committed.flatMap(r=>r.artifacts)),multiset(tasks.map(task=>task.artifact)),'every text/fact/evidence task occurs exactly once in committed requests');assert.deepEqual([...f.last!.coverage.reviewFacts].sort(),tasks.map(task=>task.key).sort(),'keys remain the original deterministic task keys');assert.ok(requests.slice(2).every(r=>r.artifacts.every(a=>!successful.some(done=>importHash(done)===importHash(a)))),'successful pack is never repeated');assert.ok(committed.flatMap(r=>r.artifacts).some(a=>a.text.includes('首文字哨兵')));assert.ok(committed.flatMap(r=>r.artifacts).some(a=>a.text.includes('末文字哨兵')));assert.equal(committed.flatMap(r=>r.artifacts).find(a=>'temporalScope' in a.facts)?.facts.temporalScope,facts.temporalScope);assert.deepEqual(f.last!.coverage.review,workingImportUnits(f.last!).map(u=>u.id),'full prose review still runs')
   let generated=false;await assert.rejects(runImportAi({...committed[0],instruction:'元'.repeat(budget*3)},new AbortController().signal,{resolve:async()=>review,assert:async()=>{},generate:async()=>{generated=true;return {conflicts:[]}}}),/预算/);assert.equal(generated,false,'adapter full payload gate remains active')
  }finally{await f.dispose()}
 })
 await t.test('source-budget-and-distinct-evidence',async()=>{
  const requests:ImportAiRequest[]=[],f=await fixture([source('第一章\n'+'甲'.repeat(6996))],async r=>{
   if(r.phase==='analyze')return {artifacts:[...r.units.map((u,i)=>({id:u.id,kind:'character' as const,name:u.id,text:'证据任务'+i,facts:{occupation:'实际值'+u.id,roleType:'SUPPORTING',aliases:'[]',relationships:'[]'},origin:'inferred' as const,sourceUnitIds:[u.id],evidence:[{unitId:u.id,quote:u.text.slice(0,10)}]})),{id:'shared',kind:'character',name:'跨证据角色',text:'完整跨证据设定',facts:{occupation:'跨证据替代值',roleType:'SUPPORTING',aliases:'[]',relationships:'[]'},origin:'inferred',sourceUnitIds:r.units.map(u=>u.id),evidence:r.units.map(u=>({unitId:u.id,quote:u.text.slice(0,10)}))}]}
   if(factReview(r))requests.push(structuredClone(r));return {conflicts:[]}
  })
  try{await f.ready(true,['character']);await f.act('start',{consent:true});assert.equal((await f.settle()).phase,'completed');assertReviewPackages(requests,budget);assert.ok(requests.length>=2);assert.ok(requests.some(r=>r.units.reduce((n,u)=>n+u.text.length,0)===budget),'source budget boundary is usable');assert.deepEqual(multiset(requests.flatMap(r=>r.artifacts)),multiset(expectedReviewTasks(f.last!,budget).map(task=>task.artifact)));assert.deepEqual(f.last!.coverage.review,workingImportUnits(f.last!).map(u=>u.id))}finally{await f.dispose()}
 })
 for(const extra of [0,1])await t.test(extra?'oversized-single-task':'exact-serialized-budget',async()=>{
  const requests:ImportAiRequest[]=[],f=await fixture([source('第一章\n'+'甲'.repeat(996))],async r=>{
   if(r.phase==='analyze'){
    const unit=r.units[0],a:ImportArtifact={id:'boundary',kind:'character',name:'边界',text:'首文字哨兵'+'细'.repeat(990)+'末文字哨兵',facts:{roleType:'SUPPORTING',...(extra?{occupation:'不可分事实'.repeat(300)}:{})},origin:'inferred',sourceUnitIds:[unit.id],evidence:[]},size=()=>JSON.stringify({units:[unit],artifacts:[a]}).length,target=budget*2+23+extra
    a.evidence.push({unitId:unit.id,quote:'甲'});const overhead=JSON.stringify({unitId:unit.id,quote:''}).length+1
    while(target-size()>overhead+600)a.evidence.push({unitId:unit.id,quote:'甲'.repeat(600)})
    const remaining=target-size();if(remaining>overhead)a.evidence.push({unitId:unit.id,quote:'甲'.repeat(remaining-overhead)});else a.evidence[a.evidence.length-1].quote+='甲'.repeat(remaining)
    assert.equal(size(),target);return {artifacts:[a]}
   }
   if(factReview(r))requests.push(structuredClone(r));return runImportAi(r,new AbortController().signal,{resolve:async()=>review,assert:async()=>{},generate:async()=>({conflicts:[]})})
  })
  try{await f.ready(true,['character']);await f.act('start',{consent:true});const v=await f.settle();if(extra){assert.equal(v.phase,'failed');assert.match(v.error!,/单个|分片|预算/);assert.equal(requests.length,0);assert.equal((await saved(f)).coverage.reviewFacts?.length??0,0);assert.equal(f.published,0)}else{assert.equal(v.phase,'completed',v.error);assert.equal(requests.length,2);assert.equal(JSON.stringify({units:requests[0].units,artifacts:requests[0].artifacts}).length,budget*2);assertReviewPackages(requests,budget)}}finally{await f.dispose()}
 })
})

const largeModel={...model,contextWindow:1048576},largeReview={...largeModel,id:'review'}
async function settleLarge(controller:NovelImportController){for(let i=0;i<3000&&controller.active;i++)await new Promise(resolve=>setTimeout(resolve,10));assert.equal(controller.active,0,'large synthetic jobs drained');return (await controller.act({type:'current'})).view!}
const persisted=(root:string,id:string)=>readFile(join(root,'novel-imports',id,'session.json'),'utf8').then(text=>JSON.parse(text) as ImportSession)
function legacyHashes(s:ImportSession){return {scope:importHash({...(s.chapterVersion===2?{chapterVersion:2}:{}),...(s.semanticVersion===1?{semanticVersion:1}:{}),purpose:'analyze',files:s.files.map(f=>({id:f.id,hash:f.hash,included:f.included,text:importHash(f.text)})),units:s.units.map(u=>({id:u.id,kind:u.kind,start:u.start,end:u.end})),selected:s.selected,targets:s.targets,infer:s.infer,workingProse:s.workingProse,workingRevision:s.workingRevision,chapters:s.chapters.map(({id,title,start,end})=>({id,title,start,end}))}),plan:importHash({...(s.chapterVersion===2?{chapterVersion:2}:{}),...(s.semanticVersion===1?{semanticVersion:1,semanticAudit:importSemanticAudit(s)}:{}),id:s.id,title:s.title,files:s.files.filter(f=>f.included).map(f=>({id:f.id,name:f.name,hash:f.hash,textHash:importHash(f.text)})),units:s.units,selected:s.selected,targets:s.targets,infer:s.infer,originalProse:s.originalProse,workingProse:s.workingProse,workingRevision:s.workingRevision,chapters:s.chapters,artifacts:s.artifacts,conflicts:s.conflicts,decisions:s.decisions})}}

test('NI-LB04: absent policies keep legacy scope plan checkpoints and review keys byte identical',async t=>{
 for(const contextWindow of [16000,1048576])await t.test('legacy-'+contextWindow,async()=>{
  const textModel={...model,contextWindow},reviewModel={...review,contextWindow},requests:ImportAiRequest[]=[];let release:()=>void=()=>{},pause=true
  const f=await fixture([source('第一章\n'+'甲\n\n'.repeat(50))],async r=>{requests.push(structuredClone(r));if(r.phase==='analyze')return {artifacts:[{id:'legacy',kind:'character',name:'人物',text:'首'+Array.from({length:200},(_,i)=>('片'+i).padEnd(100,'设')).join('')+'末',facts:Object.fromEntries([...['age','gender','occupation','personality','appearance','clothing','catchphrase','growthArc','attribution','temporalScope'].map(key=>[key,'值'.repeat(200)]),['roleType','SUPPORTING']]),origin:'inferred',sourceUnitIds:[r.units[0].id],evidence:[{unitId:r.units[0].id,quote:r.units[0].text}]}]};if(factReview(r)&&requests.filter(factReview).length===2&&pause)return new Promise(resolve=>{release=()=>resolve({conflicts:[]})});return {conflicts:[]}})
  f.options.models=async()=>({text:textModel});f.options.cancelAi=async()=>release()
  try{
   await f.ready(true,['character']);f.options.models=async()=>({text:textModel,review:reviewModel});await f.act('start',{consent:true});await until(()=>requests.filter(factReview).length===2);await f.act('pause');const before=await saved(f),golden=legacyHashes(before),successful=before.coverage.reviewFacts.slice();assert.ok(successful.length);assert.deepEqual(successful,importReviewTaskKeys(before).slice(0,requests.filter(factReview)[0].artifacts.length),'late success receives no additional fact credit');assert.equal((before as any).budgetPolicy,undefined);assert.equal(importScopeHash(before,'analyze'),golden.scope);assert.equal(importPlanHash(before),golden.plan)
   // Unsaved drafts are no longer restored, so the frozen legacy budget is verified across a durable pause in the same controller.
   const old={...before} as any;f.options.models=async()=>({text:largeModel,review:largeReview});await f.act('choose-target');await assert.rejects(f.act('start',{consent:false}),/允许|授权/);await f.act('set-title',{title:before.title});const recovered=await persisted(f.root,before.id);assert.deepEqual((recovered as any).legacyBudget,(before as any).legacyBudget)
   assert.deepEqual(recovered.artifacts,before.artifacts);assert.deepEqual(recovered.coverage,before.coverage);assert.deepEqual(recovered.workingUnits,before.workingUnits);assert.deepEqual((recovered as any).analysisCheckpoint,(before as any).analysisCheckpoint);assert.equal(importScopeHash(recovered,'analyze'),golden.scope);assert.equal(importPlanHash(recovered),golden.plan);assert.equal((recovered as any).legacyBudget.review.characters,Math.min(12000,Math.floor((contextWindow-6000)/2)));assert.deepEqual(importReviewTaskKeys(recovered),expectedReviewTasks(before,Math.min(12000,Math.floor((contextWindow-6000)/2))).map(task=>task.key))
   const split=requests.length;pause=false;await f.act('start',{consent:true});assert.equal((await settleLarge(f.controller)).phase,'completed');assert.equal(requests.slice(split).some(r=>r.phase==='analyze'),false);assert.ok(requests.slice(split).every(r=>(r as any).executionBudget.characters<=12000));assert.deepEqual(f.last!.artifacts,before.artifacts);assert.equal(f.last!.publication!.requestId,before.id);assert.ok(requests.slice(split).filter(factReview).every(r=>r.artifacts.every(a=>!requests.filter(factReview)[0].artifacts.some(done=>importHash(done)===importHash(a)))))
   if(contextWindow===16000){await f.controller.close();delete old.legacyBudget;const ambiguous={...old,analysisGrant:undefined,models:{text:largeModel,review:largeReview}},raw=JSON.stringify(ambiguous);await writeFile(join(f.root,'novel-imports',before.id,'session.json'),raw);const cleaned=new NovelImportController(f.options);try{await cleaned.initialize();assert.equal((await cleaned.act({type:'current'})).view,null,'an unprovable unsaved journal is deleted, not loaded');await assert.rejects(stat(join(f.root,'novel-imports',before.id)),{code:'ENOENT'})}finally{await cleaned.close()}}
  }finally{await f.dispose()}
 })
 await t.test('legacy-without-working-units',async()=>{const f=await fixture([source('甲\n\n'.repeat(200))]);try{await f.ready(true,['character']);const before=await saved(f);assert.equal((before as any).budgetPolicy,undefined);assert.equal(before.workingUnits,undefined);await f.act('pause');f.options.models=async()=>({text:largeModel,review:largeReview});await f.act('choose-target');await f.act('start',{consent:true});assert.equal((await settleLarge(f.controller)).phase,'completed');assert.equal((f.last as any).budgetPolicy,undefined);assert.equal(f.last!.workingUnits!.length,splitImportUnits([{...before.files[0],id:'working-0',text:before.files[0].text}]).length)}finally{await f.dispose()}})
 for(const mutation of ['range','selection','target'])await t.test('legacy-invalidates-'+mutation,async()=>{const calls:string[]=[];let release:()=>void=()=>{};const f=await fixture(undefined,async r=>{if(r.phase==='analyze'){calls.push(r.kind!);if(r.kind==='scene')return new Promise(resolve=>{release=()=>resolve({notFound:true})});return {artifacts:[{id:'old-character',kind:'character',name:'人物',text:'有依据设定',facts:{roleType:'SUPPORTING'},origin:'inferred',sourceUnitIds:[r.units[0].id],evidence:[{unitId:r.units[0].id,quote:r.units[0].text}]}]}}return {conflicts:[]}});f.options.cancelAi=async()=>release();let previousTarget:string|undefined
  try{await f.ready(true,['character','scene']);await f.act('start',{consent:true});await until(()=>calls.includes('scene'));await f.act('pause');const before=await saved(f);if(mutation==='target'){previousTarget=f.target+'-previous';await rename(f.target,previousTarget);await mkdir(f.target);const info=await stat(f.target,{bigint:true});f.options.chooseTarget=async()=>({path:f.target,device:String(info.dev),inode:String(info.ino)});await assert.rejects(f.act('choose-target'),/原来|原保存/);assert.deepEqual((await saved(f)).coverage,before.coverage);assert.deepEqual((await saved(f)).artifacts,before.artifacts);return}if(mutation==='range')await f.act('set-range',{fileId:'f',start:4,end:5,kind:'excluded'});else await f.act('select',{selected:['body'],targets:['character'],infer:true});const invalid=await saved(f);assert.deepEqual(invalid.coverage,{});assert.deepEqual(invalid.artifacts,[]);assert.notEqual(importScopeHash(invalid,'analyze'),importScopeHash(before,'analyze'));f.options.ai=async r=>{if(r.phase==='analyze')calls.push(r.kind!);return r.phase==='analyze'?outlineResult(r):{conflicts:[]}};await f.act('start',{consent:true});assert.equal((await f.settle()).phase,'completed');assert.equal(calls.filter(k=>k==='character').length,2)}finally{await f.dispose();if(previousTarget)await rm(previousTarget,{recursive:true,force:true})}
 })
 await t.test('copy-without-usable-model-budget',async()=>{const f=await fixture(undefined,async()=>{throw Error('pure copy cannot invoke AI')});f.options.models=async()=>({text:{...model,contextWindow:1024},review:{...review,contextWindow:1024}});try{await f.ready(false,[]);await f.act('start',{consent:false});assert.equal((await f.settle()).phase,'completed');assert.equal(f.last!.workingProse,'第一章\n沈砚十七岁。')}finally{await f.dispose()}})
})

test('NI-LB05: frozen role profiles survive restart and reject incompatible model changes without losing progress',async t=>{
 for(const change of ['range','file','source-fingerprint','result-fingerprint'] as const)await t.test('classification-checkpoint-invalidates-'+change,async()=>{
  const body='首分类哨兵'+'甲'.repeat(110000)+'中分类哨兵'+'乙'.repeat(110000)+'末分类哨兵',requests:ImportAiRequest[]=[];let hold=true,held=false,release:()=>void=()=>{}
  const f=await fixture([source(body,'材料.txt')],async r=>{requests.push(structuredClone(r));if(hold&&requests.length===2){held=true;return new Promise(resolve=>{release=()=>resolve({classifications:r.units.map(u=>({unitId:u.id,kind:'body'}))})})}return {classifications:r.units.map(u=>({unitId:u.id,kind:'body'}))}});let restored:NovelImportController|undefined
  f.options.models=async()=>({text:largeModel,review:largeReview});f.options.cancelAi=async()=>release()
  try{await f.act('choose',{mode:'files'});await f.act('classify',{mode:'ai',consent:true});await until(()=>held);await f.act('pause');const before=await saved(f);assert.ok(before.coverage.classify.length)
   const dir=join(f.root,'novel-imports',before.id)
   if(change==='result-fingerprint'||change==='source-fingerprint'){
    // A tampered unsaved journal can only be reached through startup, which now deletes it instead of loading prior credit.
    const owner=await readFile(join(dir,'.owner'),'utf8');await f.controller.close();await assert.rejects(stat(dir),{code:'ENOENT'});const tampered=structuredClone(before);if(change==='result-fingerprint')tampered.units.find(u=>before.coverage.classify.includes(u.id))!.kind='world';else {const changed='改'+body.slice(1);tampered.files[0].text=changed;tampered.files[0].hash=importHash(changed);tampered.files[0].bytes=Buffer.byteLength(changed);tampered.units[0].text=changed.slice(tampered.units[0].start,tampered.units[0].end)}
    await mkdir(dir,{mode:0o700});await writeFile(join(dir,'.owner'),owner,{mode:0o600});await writeFile(join(dir,'session.json'),JSON.stringify(tampered),{mode:0o600})
    const count=requests.length;restored=new NovelImportController(f.options);await restored.initialize();assert.equal((await restored.act({type:'current'})).view,null);await assert.rejects(stat(dir),{code:'ENOENT'});assert.equal(requests.length,count,'no prior classification credit is loaded or replayed');return
   }
   if(change==='range')await f.act('set-range',{fileId:'f',start:1,end:2,kind:'world'});if(change==='file'){await f.act('include',{fileId:'f',included:false});await f.act('include',{fileId:'f',included:true})}
   assert.deepEqual((await persisted(f.root,before.id)).coverage,{})
   hold=false;const offset=requests.length;await f.act('classify',{mode:'ai',consent:true});assert.equal((await settleLarge(f.controller)).phase,'select');const after=await persisted(f.root,before.id),sent=requests.slice(offset).flatMap(r=>r.units);assert.deepEqual(sent.map(u=>u.id),after.units.map(u=>u.id),'changed source/range/results cannot reuse prior credit');assert.equal(importHash(sent.map(u=>u.text).join('')),importHash(body));assert.deepEqual(after.coverage.classify,after.units.map(u=>u.id))
  }finally{await restored?.close();await f.dispose()}
 })
 const requests:ImportAiRequest[]=[];let release:()=>void=()=>{},hold=true;const f=await fixture([source('第一章\n'+'甲\n\n'.repeat(600))],async r=>{requests.push(structuredClone(r));if(r.phase==='review'&&hold)return new Promise(resolve=>{release=()=>resolve({conflicts:[]})});return r.phase==='analyze'?outlineResult(r):{conflicts:[]}})
 f.options.models=async()=>({text:largeModel,review:{...largeReview,contextWindow:524288}});f.options.cancelAi=async()=>release()
 try{await f.ready(true,['character']);const chosen=await saved(f);assert.equal((chosen as any).budgetPolicy.version,2);assert.equal((chosen as any).budgetPolicy.review.characters,38229);await f.act('start',{consent:true});await until(()=>requests.some(r=>r.phase==='review'));await f.act('pause');const before=await saved(f);f.options.models=async()=>({text:model,review});await f.act('choose-target');await assert.rejects(f.act('start',{consent:true}),/容量|预算/);const blocked=await persisted(f.root,before.id);assert.deepEqual(blocked.coverage,before.coverage);assert.deepEqual(blocked.workingUnits,before.workingUnits);assert.deepEqual((blocked as any).budgetPolicy,(before as any).budgetPolicy)
  f.options.models=async()=>({text:{...largeModel,contextWindow:2097152,authRevision:3},review:{...largeReview,authRevision:3}});await assert.rejects(f.act('start',{consent:false}),/允许|授权/);hold=false;const split=requests.length;await f.act('start',{consent:true});assert.equal((await settleLarge(f.controller)).phase,'completed');assert.deepEqual((f.last as any).budgetPolicy,(before as any).budgetPolicy);assert.ok(requests.slice(split).every(r=>(r as any).executionBudget.characters===(r.phase==='review'?38229:81920)));assert.equal(requests.slice(split).some(r=>r.phase==='analyze'),false)
  // The completed journal carries publication, so startup still loads it and must reject a malformed frozen policy.
  await f.controller.close();const malformed=await persisted(f.root,before.id);assert.ok(malformed.publication);malformed.phase='paused';(malformed as any).budgetPolicy.version=3;const malformedBytes=JSON.stringify(malformed);await writeFile(join(f.root,'novel-imports',before.id,'session.json'),malformedBytes);const rejected=new NovelImportController(f.options);try{await assert.rejects(rejected.initialize(),/预算|策略/);assert.equal(await readFile(join(f.root,'novel-imports',before.id,'session.json'),'utf8'),malformedBytes)}finally{await rejected.close()}
 }finally{await f.dispose()}
})

test('NI-LB07: every large-book kind sends all text and retries only uncovered stable units',async t=>{
 await t.test('classification-success-pending-pause-close-reopen-consent',async()=>{
  const body='首分类哨兵'+'甲'.repeat(110000)+'中分类哨兵'+'乙'.repeat(110000)+'末分类哨兵',requests:ImportAiRequest[]=[],committed:ImportUnit[]=[];let hold=true,held=false,release:()=>void=()=>{}
  const f=await fixture([source(body,'材料.txt')],async r=>{requests.push(structuredClone(r));if(hold&&requests.length===2){held=true;return new Promise(resolve=>{release=()=>resolve({classifications:r.units.map(u=>({unitId:u.id,kind:'body'}))})})}committed.push(...structuredClone(r.units));return {classifications:r.units.map(u=>({unitId:u.id,kind:'body'}))}})
  f.options.models=async()=>({text:largeModel,review:largeReview});f.options.cancelAi=async()=>release()
  try{await f.act('choose',{mode:'files'});const initial=await saved(f);assert.ok(initial.units.every(u=>u.kind==='unknown'));await f.act('classify',{mode:'ai',consent:true});await until(()=>held);await f.act('pause');const before=await saved(f);assert.deepEqual(before.coverage.classify,committed.map(u=>u.id));assert.ok(before.coverage.classify.length&&before.coverage.classify.length<initial.units.length);assert.ok(before.units.filter(u=>before.coverage.classify.includes(u.id)).every(u=>u.kind==='body'))
   // Close/reopen no longer restores an unsaved draft; the pending-consent path is exercised across a durable pause.
   f.options.models=async()=>({text:{...largeModel,contextWindow:2097152,authRevision:3},review:largeReview});const count=requests.length;await f.act('resume',{consent:false});assert.equal((await f.controller.act({type:'current'})).view?.phase,'source');await assert.rejects(f.act('classify',{mode:'ai',consent:false}),/允许|授权/);const denied=await persisted(f.root,before.id);assert.equal(requests.length,count);assert.deepEqual(denied.coverage,before.coverage);assert.deepEqual(denied.units,before.units)
   f.options.models=async()=>({text:model,review});await assert.rejects(f.act('classify',{mode:'ai',consent:true}),/容量|预算/);assert.deepEqual((await persisted(f.root,before.id)).coverage,before.coverage);assert.equal(requests.length,count)
   f.options.models=async()=>({text:{...largeModel,contextWindow:2097152,authRevision:3},review:largeReview});hold=false;await f.act('classify',{mode:'ai',consent:true});assert.equal((await settleLarge(f.controller)).phase,'select');const after=await persisted(f.root,before.id),pending=initial.units.filter(u=>!before.coverage.classify.includes(u.id));assert.deepEqual(requests.slice(count).flatMap(r=>r.units.map(u=>u.id)),pending.map(u=>u.id),'only uncovered original source IDs are sent');assert.equal(importHash(requests.slice(count).flatMap(r=>r.units)),importHash(pending),'all original pending fields and bytes are sent');assert.equal(importHash(committed),importHash(initial.units),'every source unit and all first/middle/end bytes are committed exactly once');assert.deepEqual(Buffer.from(committed.map(u=>u.text).join('')),Buffer.from(body));assert.deepEqual(after.coverage.classify,initial.units.map(u=>u.id));assert.ok(requests.every(r=>r.executionBudget?.characters===81920&&r.executionBudget.maxUnits===300));assert.deepEqual(after.budgetPolicy,before.budgetPolicy)
  }finally{await f.dispose()}
 })
 const body='首段哨兵'+'甲'.repeat(550000)+'中段哨兵'+'乙'.repeat(550000)+'末章哨兵',success=new Map<string,ImportUnit[]>(),requests:ImportAiRequest[]=[];let release:()=>void=()=>{},held=false,stop=true
 const f=await fixture([source(body)],async r=>{requests.push(r);if(r.phase==='analyze'&&r.kind==='character'&&stop&&(success.get('character')?.length??0)>0){held=true;return new Promise(resolve=>{release=()=>resolve({notFound:true})})}const key=r.phase==='analyze'?r.kind!:factReview(r)?'reviewFacts':r.phase;(success.get(key)??(success.set(key,[]),success.get(key)!)).push(...r.units);return r.phase==='classify'?{classifications:r.units.map(u=>({unitId:u.id,kind:'body'}))}:r.phase==='analyze'?outlineResult(r):{conflicts:[]}})
 f.options.models=async()=>({text:largeModel,review:largeReview});f.options.cancelAi=async()=>release()
 try{await f.ready(true,['outline','character','scene','item','world','theme','style','foreshadow','goldenFinger','trope','worldline','narrative']);const chosen=await saved(f);assert.equal((chosen as any).budgetPolicy.version,2);const sourceUnits=structuredClone(chosen.units);await f.act('classify',{mode:'ai',consent:true});await settleLarge(f.controller);await f.act('start',{consent:true});await until(()=>held);await f.act('pause');const paused=await saved(f);assert.ok(paused.coverage.character.length);assert.deepEqual(paused.units,sourceUnits);await f.act('choose-target');stop=false;await f.act('start',{consent:true});assert.equal((await settleLarge(f.controller)).phase,'completed')
  const working=f.last!.workingUnits!;for(const kind of f.last!.targets){const sent=success.get(kind)!;assert.deepEqual(sent.map(u=>u.id),working.map(u=>u.id),kind+' all units once and ordered');assert.deepEqual(Buffer.from(sent.map(u=>u.text).join('')),Buffer.from(body));assert.deepEqual(f.last!.coverage[kind],working.map(u=>u.id),kind+' committed all units')}assert.deepEqual(success.get('classify')!.map(u=>u.id),sourceUnits.map(u=>u.id));assert.deepEqual(success.get('review')!.map(u=>u.id),working.map(u=>u.id));assert.ok(requests.filter(r=>r.phase==='analyze').every(r=>r.units.reduce((n,u)=>n+u.text.length,0)<=81920&&r.units.length<=300));assert.equal(f.last!.publication!.requestId,paused.id)
 }finally{await f.dispose()}
})

test('NI-LB08: fact review uses persisted geometry independently of adapter model capacity',async t=>{
 for(const mode of ['legacy5','legacy12','v2'])await t.test(mode,async()=>{
  const requests:ImportAiRequest[]=[];let fail=true;const contextWindow=mode==='legacy5'?16000:1048576,current={...model,contextWindow},f=await fixture([source('第一章\n甲乙丙丁。')],async r=>{if(r.phase==='analyze')return {artifacts:[{id:'same',kind:'character',name:'人物',text:'首文字'+ '设'.repeat(220000)+'末文字',facts:{personality:'替代甲',appearance:'替代乙',catchphrase:'末字段哨兵',roleType:'SUPPORTING',aliases:'[]',relationships:'[]'},origin:'inferred',sourceUnitIds:[r.units[0].id],evidence:[{unitId:r.units[0].id,quote:r.units[0].text}]}]};if(factReview(r)){requests.push(structuredClone(r));if(requests.length===2&&fail){if(mode==='v2')throw Error('受控整包失败');const valid:ImportConflict={id:'valid',hash:'valid',kind:'character',type:'body-body',entity:'人物',field:'age',source:{text:'甲',value:'甲',artifactId:r.artifacts[0].id},candidate:{text:'乙',value:'乙'},evidence:[{unitId:r.units[0].id,quote:r.units[0].text}],status:'pending'};return {conflicts:[valid,{...valid,id:'invalid',hash:'invalid',...(mode==='legacy5'?{candidate:{text:'乙',value:'乙',artifactId:'unknown'}}:{evidence:[{unitId:r.units[0].id,quote:'不存在证据'}]})}]}}}return {conflicts:[]}})
  f.options.models=async()=>({text:current,...(mode==='v2'?{review:{...current,id:'review'}}:{})})
  try{await f.ready(true,['character']);f.options.models=async()=>({text:current,review:{...current,id:'review'}});await f.act('start',{consent:true});assert.equal((await settleLarge(f.controller)).phase,'failed');const before=await saved(f),tasks=[...iterateImportReviewTasks(before)],firstTasks=tasks.slice(0,requests[0].artifacts.length),keys=firstTasks.map(task=>task.key);assert.deepEqual(multiset(requests[0].artifacts),multiset(firstTasks.map(task=>task.artifact)));assert.ok(keys.length>1);assert.deepEqual(before.coverage.reviewFacts,keys);assert.deepEqual(before.conflicts,[],'invalid later conflict grants no partial credit');assert.equal((before as any).legacyBudget?.review?.characters??(before as any).budgetPolicy?.review?.characters,mode==='legacy5'?5000:mode==='legacy12'?12000:81920);f.options.models=async()=>({text:{...largeModel,contextWindow:2097152},review:{...largeReview,contextWindow:2097152}});await f.act('pause');assert.deepEqual((await saved(f)).coverage.reviewFacts,keys,'durable pause keeps the persisted review geometry');await f.act('choose-target');fail=false;await f.act('start',{consent:true});assert.equal((await settleLarge(f.controller)).phase,'completed');const committed=[requests[0],...requests.slice(2)];assert.deepEqual(multiset(committed.flatMap(r=>r.artifacts)),multiset(tasks.map(t=>t.artifact)));assert.deepEqual(f.last!.coverage.reviewFacts,tasks.map(t=>t.key));assert.equal(committed.flatMap(r=>r.artifacts).find(a=>a.facts.catchphrase)?.facts.catchphrase,'末字段哨兵');assert.ok(committed.flatMap(r=>r.artifacts).some(a=>a.text.includes('末文字')));for(const r of requests){const budget=(r as any).executionBudget.characters;assertReviewPackages([r],budget);assert.ok(serializeImportAiPayload(r).length<=budget*3)}
  }finally{await f.dispose()}
 })
})

test('NI-LB10: metadata-aware packing preserves full dependencies and atomic coverage',async t=>{
 const metadata=(prefix:string,count:number,unit:ImportUnit,kind:ImportArtifact['kind']='theme',named=(i:number)=>'设定'+i+'界'.repeat(290)):ImportArtifact[]=>Array.from({length:count},(_,i)=>({id:prefix+i,kind,name:named(i),text:'完整元数据设定'+i,facts:(kind==='character'?{roleType:'SUPPORTING',aliases:'[]',relationships:'[]'}:{}) as Record<string,string>,origin:'inferred',sourceUnitIds:[unit.id],evidence:[{unitId:unit.id,quote:unit.text.slice(0,20)}]}))
 await t.test('successful-child-pause-and-reopen',async()=>{
  const attempts:ImportAiRequest[]=[],successful:ImportUnit[]=[];let emitted=false,held=false,stop=true,release:()=>void=()=>{}
  const body=Array.from({length:400},(_,i)=>'人物'+i+'界'.repeat(290)+'。\n\n').join('')
  const f=await fixture([source(body)],async r=>{
   if(r.phase==='analyze'&&r.kind==='character'&&!emitted){emitted=true;return {artifacts:metadata('metadata-',400,r.units[0],'character',i=>'人物'+i+'界'.repeat(290))}}
   if(r.phase==='analyze'&&r.kind==='scene'){attempts.push(structuredClone(r));if(successful.length&&stop){held=true;return new Promise(resolve=>{release=()=>resolve({notFound:true})})}successful.push(...r.units)}
   assert.ok(serializeImportAiPayload(r).length<=81920*3,'every actual payload is admitted');return r.phase==='analyze'?outlineResult(r):{conflicts:[]}
  });f.options.models=async()=>({text:largeModel,review:largeReview});f.options.cancelAi=async()=>release()
  try{
   await f.ready(true,['character','scene']);assert.equal((await saved(f) as any).budgetPolicy.version,2);await f.act('start',{consent:true});await until(()=>held);await f.act('pause');const before=await saved(f);assert.ok(successful.length<81,'metadata splits a nominal source-only batch');assert.deepEqual(before.coverage.scene,successful.map(u=>u.id));await f.act('choose-target');stop=false;await f.act('start',{consent:true});const finished=await settleLarge(f.controller);assert.equal(finished.phase,'completed',finished.error);assert.deepEqual(successful.map(u=>u.id),f.last!.workingUnits!.map(u=>u.id));assert.deepEqual(f.last!.artifacts,before.artifacts);assert.ok(attempts.every(r=>serializeImportAiPayload(r).length<=81920*3));assert.equal(new Set(successful.map(u=>u.id)).size,successful.length)
  }finally{await f.dispose()}
 })
 await t.test('single-task-metadata-overflow',async()=>{
  let styleCalls=0,emitted=false
  const f=await fixture([source('甲'.repeat(2000))],async r=>{if(r.phase==='analyze'&&r.kind==='theme'&&!emitted){emitted=true;return {artifacts:metadata('oversize-',2000,r.units[0])}}if(r.kind==='style')styleCalls++;return r.phase==='analyze'?outlineResult(r):{conflicts:[]}});f.options.models=async()=>({text:largeModel,review:largeReview})
  try{await f.ready(true,['theme','style']);assert.equal((await saved(f) as any).budgetPolicy.version,2);await f.act('start',{consent:true});const v=await settleLarge(f.controller);assert.equal(v.phase,'failed');assert.match(v.error!,/预算|单个/);const before=await saved(f);assert.equal(styleCalls,0);assert.equal(before.coverage.style?.length??0,0);assert.equal(before.artifacts.length,2000);assert.ok(before.coverage.theme.length)}finally{await f.dispose()}
 })
})
