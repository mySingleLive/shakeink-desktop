import assert from 'node:assert/strict'
import {test} from 'node:test'
import {mkdtemp,mkdir,writeFile,readFile,realpath,rename,rm,symlink,opendir} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import type {Dir} from 'node:fs'
import {NovelImportSourcePicker} from '../../desktop/main/novel-import-source-picker'
import {sourcePickerActionSchema,type SourcePickerView} from '../../desktop/shared/novel-import-source-picker'
import {captureNovelSourceGrant,verifyNovelSourceGrant,scanNovelSources,type ImportSourceGrant} from '../../desktop/main/novel-import-files'
import {NovelImportController} from '../../desktop/main/novel-import'

const tick=()=>new Promise<void>(setImmediate)
async function waitFor(check:()=>boolean){for(let i=0;i<1000;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,2))}throw Error('picker state did not settle')}
async function fixture(run:(root:string)=>Promise<void>){const root=await realpath(await mkdtemp(join(tmpdir(),'shakeink-cross-picker-')));try{await run(root)}finally{await rm(root,{recursive:true,force:true})}}
function rig(root:string,extra:Record<string,unknown>={}){
 let view:SourcePickerView|null=null,valid=true
 const picker=new NovelImportSourcePicker({places:async()=>[{name:'文档',path:root}],protectedRoots:async()=>[],changed:next=>{view=next},...extra})
 const choose=()=>picker.choose(()=>{if(!valid)throw Error('owner revoked')})
 const ready=async()=>{await waitFor(()=>!!view&&view.phase==='ready');return view!}
 const act=(type:string,extra:Record<string,unknown>={})=>picker.act({type,id:view!.id,revision:view!.revision,...extra})
 return {picker,choose,ready,act,view:()=>view,revoke:()=>{valid=false}}
}

test('CP-P01: source picker protocol only accepts opaque commands and cancellation has no revision',()=>{
 const id='50067f60-5311-4a66-b74c-116c8a2ffab7',entryId='f657ea48-e108-46cf-aa8b-b165bffb212d'
 for(const action of [{type:'current'},{type:'cancel',id},{type:'navigate',id,revision:0,entryId},{type:'toggle',id,revision:4,entryId},{type:'confirm',id,revision:8},{type:'clear',id,revision:9}])assert.deepEqual(sourcePickerActionSchema.parse(action),action)
 for(const action of [{type:'navigate',id,revision:0,path:'/forged'},{type:'toggle',id,revision:0,entryId,path:'/forged'},{type:'confirm',id},{type:'cancel',id,revision:0},{type:'current',path:'/forged'}])assert.equal(sourcePickerActionSchema.safeParse(action).success,false)
})

test('CP-F01: actual metadata list combines naturally ordered directories and seven file formats, disabling unsafe entries',()=>fixture(async root=>{
 for(const name of ['第10章.txt','第2章.md','原稿.doc','设定.docx','附件.pdf','笔记.html','补充.htm','封面.png'])await writeFile(join(root,name),'synthetic')
 await mkdir(join(root,'子目录'));await mkdir(join(root,'protected'));await symlink(join(root,'第10章.txt'),join(root,'链接.txt'))
 const r=rig(root,{protectedRoots:async()=>[join(root,'protected')]});const pending=r.choose()
 try{const v=await r.ready();assert.equal(v.entries.length,11);assert.ok(v.current?.selectable);assert.equal(v.entries.filter(e=>e.kind==='file'&&e.selectable).length,7);assert.ok(v.entries.find(e=>e.name==='子目录')?.navigable);assert.match(v.entries.find(e=>e.name==='protected')!.reason!,/保护/);assert.equal(v.entries.find(e=>e.name==='封面.png')!.selectable,false);assert.equal(v.entries.find(e=>e.name==='链接.txt')!.selectable,false);assert.ok(v.entries.findIndex(e=>e.name==='第2章.md')<v.entries.findIndex(e=>e.name==='第10章.txt'))
  await assert.rejects(r.act('confirm'),/选择/);await assert.rejects(r.picker.act({type:'toggle',id:v.id,revision:v.revision-1,entryId:v.current!.id}),/版本/)
  await r.act('toggle',{entryId:v.current!.id});assert.equal(r.view()!.selected[0].id,v.current!.id)
 }finally{r.picker.cancel();await pending}
}))

test('CP-F01: directory list limit is explicit and never presented as complete truncated content',()=>fixture(async root=>{
 for(const name of ['1.txt','2.txt','3.txt'])await writeFile(join(root,name),name)
 const r=rig(root,{maxEntries:2});const pending=r.choose();try{const v=await r.ready();assert.match(v.error!,/过多|超过/);assert.equal(v.entries.length,0);assert.equal(v.current!.selectable,true)}finally{r.picker.cancel();await pending}
}))

test('CP-F02: cross-directory selections, current folder and opaque confirmation produce trusted grants for the actual scanner',()=>fixture(async root=>{
 const body='第一章\r\n  原句🖋️。\r\n';await writeFile(join(root,'正文.txt'),body);await mkdir(join(root,'设定'));await writeFile(join(root,'设定','角色.md'),'# 角色\n陆青。')
 const r=rig(root);const pending=r.choose();const same=r.choose();assert.equal(same,pending)
 try{let v=await r.ready();await r.act('toggle',{entryId:v.entries.find(e=>e.name==='正文.txt')!.id});await r.act('navigate',{entryId:r.view()!.entries.find(e=>e.name==='设定')!.id});v=await r.ready();assert.equal(v.selected.length,1);await r.act('toggle',{entryId:v.current!.id});assert.equal(r.view()!.selected.length,2);await r.act('navigate',{entryId:v.breadcrumbs.at(-2)!.id});await r.ready();assert.equal(r.view()!.selected.length,2);await r.act('confirm');assert.equal(r.view(),null)
  const grants=(await pending)!;assert.equal(grants.length,2);assert.equal(grants.filter(g=>g.directory).length,1);const files=await scanNovelSources(grants.map(g=>g.path),{grants});assert.equal(files.filter(f=>f.included).length,2);assert.equal(files.find(f=>f.format==='txt')!.text,body)
  await assert.rejects(r.picker.act({type:'clear',id:v.id,revision:v.revision}),/会话|任务/)
 }finally{r.picker.cancel();await pending}
}))

test('CP-F02: removing/clearing selections and canceling do not read bodies or mutate sources',()=>fixture(async root=>{
 const file=join(root,'正文.txt');await writeFile(file,'原句');const r=rig(root);let pending=r.choose();let v=await r.ready();const id=v.entries[0].id
 await r.act('toggle',{entryId:id});await r.act('toggle',{entryId:id});assert.equal(r.view()!.selected.length,0);await r.act('toggle',{entryId:id});await r.act('clear');assert.equal(r.view()!.selected.length,0)
 await r.picker.act({type:'cancel',id:v.id});assert.equal(await pending,null);assert.equal(r.view(),null);pending=r.choose();v=await r.ready();assert.notEqual(v.id,id);r.picker.cancel();assert.equal(await pending,null);assert.equal(await readFile(file,'utf8'),'原句')
}))

test('CP-F03: identity changes after selection are rejected by confirmation and can be reselected explicitly',()=>fixture(async root=>{
 const file=join(root,'正文.txt');await writeFile(file,'原句');const r=rig(root);const pending=r.choose()
 try{let v=await r.ready();await r.act('toggle',{entryId:v.entries[0].id});await rename(file,file+'.old');await writeFile(file,'替换内容');await r.act('confirm');v=r.view()!;assert.ok(v);assert.match(v.error!,/变化|重新/);assert.equal(v.selected.length,0);assert.equal(v.entries.find(e=>e.name==='正文.txt')!.selectable,false);assert.equal(await readFile(file,'utf8'),'替换内容')
  await r.act('navigate',{entryId:v.current!.id});await r.ready();await r.act('toggle',{entryId:r.view()!.entries.find(e=>e.name==='正文.txt')!.id});await r.act('confirm');const grants=await pending;assert.equal(grants!.length,1);assert.equal(grants![0].path,file)
 }finally{r.picker.cancel();await pending}
}))

test('CP-F03: scan boundary rejects swapped file, directory and ancestor after the trusted grant was issued',()=>fixture(async root=>{
 await mkdir(join(root,'ancestor'));const file=join(root,'ancestor','正文.txt');await writeFile(file,'原句');const grant=await captureNovelSourceGrant(file)
 await rename(file,file+'.old');await writeFile(file,'新对象');let files=await scanNovelSources([file],{grants:[grant]});assert.ok(files.every(f=>!f.included));assert.ok(files.every(f=>!f.text.includes('新对象')))
 const folder=join(root,'folder');await mkdir(folder);await writeFile(join(folder,'正文.txt'),'原目录');const directoryGrant=await captureNovelSourceGrant(folder);await rename(folder,folder+'.old');await mkdir(folder);await writeFile(join(folder,'正文.txt'),'替换目录');files=await scanNovelSources([folder],{grants:[directoryGrant]});assert.ok(files.every(f=>!f.included));assert.ok(files.every(f=>!f.text.includes('替换目录')))
 const current=await captureNovelSourceGrant(file);await rename(join(root,'ancestor'),join(root,'ancestor.old'));await mkdir(join(root,'ancestor'));await writeFile(file,'替换祖先');files=await scanNovelSources([file],{grants:[current]});assert.ok(files.every(f=>!f.included));assert.ok(files.every(f=>!f.text.includes('替换祖先')))
}))

test('CP-F03: grant capture fixes the original path chain before realpath and refuses late links or directory replacement',()=>fixture(async root=>{
 const outside=join(root,'outside');await mkdir(outside);await writeFile(join(outside,'正文.txt'),'不可授权的替换来源')
 for(const scenario of ['directory-link','ancestor-link','directory-replacement']){
  const original=join(root,scenario);await mkdir(original);await writeFile(join(original,'正文.txt'),'原始来源')
  const path=scenario==='ancestor-link'?join(original,'正文.txt'):original
  let injected=false
  await assert.rejects(captureNovelSourceGrant(path,{beforeRealpath:async()=>{injected=true;await rename(original,original+'.old');if(scenario==='directory-replacement')await mkdir(original);else await symlink(outside,original,'dir')}}),/来源|符号链接/)
  assert.equal(injected,true,'fault must occur after the original lstat chain and before realpath')
  assert.equal(await readFile(join(outside,'正文.txt'),'utf8'),'不可授权的替换来源')
 }
}))

test('CP-F03: custom picker grants reject an existing ancestor link instead of canonicalizing its target',()=>fixture(async root=>{
 const original=join(root,'original'),link=join(root,'link');await mkdir(original);await writeFile(join(original,'正文.txt'),'原文');await symlink(original,link,'dir')
 await assert.rejects(captureNovelSourceGrant(join(link,'正文.txt')),/来源|符号链接/)
}))

test('CP-L01: cancel bypasses pending navigation/revision and late directory handles close without reopening',()=>fixture(async root=>{
 await mkdir(join(root,'slow'));const gate=Promise.withResolvers<Dir>();let closed=0,slow=false,opened=false
 const r=rig(root,{openDirectory:async(path:string)=>{if(slow&&path===join(root,'slow')){opened=true;const directory=await gate.promise;return directory}return opendir(path)}});const pending=r.choose();let v=await r.ready();slow=true
 const navigation=r.act('navigate',{entryId:v.entries[0].id});await waitFor(()=>opened);assert.equal(r.view()!.phase,'loading');const oldId=v.id;await r.picker.act({type:'cancel',id:oldId});assert.equal(await pending,null);assert.equal(r.view(),null)
 gate.resolve({close:async()=>{closed++},[Symbol.asyncIterator]:async function*(){throw Error('late directory must not be iterated')}} as unknown as Dir);await navigation;await waitFor(()=>closed===1);assert.equal(r.view(),null)
}))

test('CP-L01: cancel releases a confirmation waiting for identity checks and revoked owner cannot act',()=>fixture(async root=>{
 await writeFile(join(root,'正文.txt'),'原句');const gate=Promise.withResolvers<void>();let block=false
 const r=rig(root,{verifyGrant:async(grant:ImportSourceGrant)=>{if(block)await gate.promise;return verifyNovelSourceGrant(grant)}});const pending=r.choose();let v=await r.ready();await r.act('toggle',{entryId:v.entries[0].id});block=true;const confirmation=r.act('confirm');await waitFor(()=>r.view()!.phase==='checking');await r.picker.act({type:'cancel',id:v.id});assert.equal(await pending,null);gate.resolve();await confirmation;assert.equal(r.view(),null)
 const again=r.choose();await r.ready();r.revoke();await assert.rejects(r.act('clear'),/owner/);r.picker.cancel();assert.equal(await again,null)
}))

test('CP-L02: actual unsettled IO retains the cross-session budget after timeout/cancel; late handles close',()=>fixture(async root=>{
 const gate=Promise.withResolvers<Dir>();let opens=0,closed=0
 const r=rig(root,{ioTimeoutMs:20,maxPendingIo:1,openDirectory:async()=>{opens++;return gate.promise}});let pending=r.choose();const first=await r.ready();assert.match(first.error!,/超时/);assert.equal(r.picker.activeIo,1);r.picker.cancel();assert.equal(await pending,null)
 pending=r.choose();await r.ready();assert.equal(opens,1);assert.equal(r.picker.activeIo,1);r.picker.cancel();await pending
 gate.resolve({close:async()=>{closed++},[Symbol.asyncIterator]:async function*(){throw Error('expired directory must not be read')}} as unknown as Dir);await waitFor(()=>r.picker.activeIo===0);assert.equal(closed,1);assert.equal(r.view(),null)
}))

test('CP-L02: production default reserves thread-pool capacity across repeatedly canceled stuck sessions',()=>fixture(async root=>{
 const gates:ReturnType<typeof Promise.withResolvers<Dir>>[]=[],closed:number[]=[];let opens=0,maximum=0
 const r=rig(root,{ioTimeoutMs:15,openDirectory:async()=>{const gate=Promise.withResolvers<Dir>();gates.push(gate);opens++;return gate.promise}})
 try{for(let i=0;i<5;i++){const pending=r.choose();await r.ready();maximum=Math.max(maximum,r.picker.activeIo);r.picker.cancel();assert.equal(await pending,null)}assert.ok(maximum<=2,`default must leave capacity for save/close; observed ${maximum}`);assert.ok(opens<=2)}
 finally{r.picker.cancel();for(const [index,gate] of gates.entries())gate.resolve({close:async()=>{closed.push(index)},[Symbol.asyncIterator]:async function*(){throw Error('expired directory must not be read')}} as unknown as Dir);await waitFor(()=>r.picker.activeIo===0);assert.equal(closed.length,gates.length)}
}))

test('CP-L02: Windows root candidates are probed serially within the same budget and stop at first timeout',()=>fixture(async root=>{
 const gate=Promise.withResolvers<ImportSourceGrant>();const seen:string[]=[]
 const r=rig(root,{roots:['/synthetic-drive-1','/synthetic-drive-2'],ioTimeoutMs:20,captureGrant:async(path:string)=>{if(path.startsWith('/synthetic-drive')){seen.push(path);return gate.promise}return captureNovelSourceGrant(path)}});const pending=r.choose();await r.ready();assert.deepEqual(seen,['/synthetic-drive-1']);assert.ok(r.view()!.places.some(e=>e.displayPath===root));r.picker.cancel();await pending;gate.reject(Error('offline'));await waitFor(()=>r.picker.activeIo===0)
}))

test('CP-F01/CP-L02: one stalled common place preserves other usable places and a directory can recover after IO failure',()=>fixture(async root=>{
 const good=join(root,'good');await mkdir(good);await writeFile(join(good,'正文.txt'),'原句');const stalled=Promise.withResolvers<ImportSourceGrant>();let failOpen=true
 const r=rig(root,{places:async()=>[{name:'离线位置',path:join(root,'offline')},{name:'文档',path:good}],ioTimeoutMs:20,captureGrant:async(path:string)=>path===join(root,'offline')?stalled.promise:captureNovelSourceGrant(path),openDirectory:async(path:string)=>{if(failOpen)throw Error('permission denied');return opendir(path)}})
 const pending=r.choose();try{let v=await r.ready();assert.ok(v.places.find(e=>e.name==='离线位置')?.reason?.includes('超时'));assert.equal(v.current!.displayPath,good);assert.equal(v.current!.selectable,false);failOpen=false;await r.act('navigate',{entryId:v.current!.id});v=await r.ready();assert.equal(v.current!.selectable,true);assert.equal(v.entries[0].name,'正文.txt')}finally{r.picker.cancel();await pending;stalled.reject(Error('offline'));await waitFor(()=>r.picker.activeIo===0)}
}))

test('CP-F01/CP-L01: failed navigation revokes unselected entries from the old directory',()=>fixture(async root=>{
 await writeFile(join(root,'正文.txt'),'原句');const child=join(root,'failed');await mkdir(child)
 const r=rig(root,{openDirectory:async(path:string)=>{if(path===child)throw Error('permission denied');return opendir(path)}});const pending=r.choose()
 try{const v=await r.ready(),oldId=v.entries.find(e=>e.name==='正文.txt')!.id;await r.act('navigate',{entryId:v.entries.find(e=>e.name==='failed')!.id});assert.ok(r.view()!.error);assert.equal(r.view()!.entries.length,0);await r.act('toggle',{entryId:oldId});assert.equal(r.view()!.selected.length,0,'failed listing must not retain an unselected source capability')}
 finally{r.picker.cancel();await pending}
}))

test('CP-F02/CP-L01: controller receives grants at scan boundary and pure cancel after owner revocation is harmless',()=>fixture(async root=>{
 const materials=join(root,'materials'),data=join(root,'data');await mkdir(materials);await mkdir(data);const file=join(materials,'正文.txt');await writeFile(file,'第一章\n原句');const grant=await captureNovelSourceGrant(file)
 let canceled=false,valid=true
 const controller=new NovelImportController({root:data,choose:async()=>{if(canceled){valid=false;return null}return[grant]},chooseTarget:async()=>null,protectedDirectories:async()=>[],models:async()=>({}),ai:async()=>{throw Error('AI must not run')},cancelAi:async()=>{},publish:async()=>{throw Error('publish must not run')},assertCurrent:()=>{if(!valid)throw Error('owner revoked')}})
 try{await controller.initialize();const first=(await controller.act({type:'choose'})).view!;assert.ok(first.files.some(f=>f.name==='正文.txt'));canceled=true;const after=(await controller.act({type:'choose',append:true})).view!;assert.equal(after.revision,first.revision);assert.deepEqual(after.files,first.files)}finally{valid=true;await controller.close()}
}))
