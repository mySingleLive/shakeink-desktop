import assert from 'node:assert/strict'
import {test} from 'node:test'
import {mkdtemp,mkdir,writeFile,readFile,realpath,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import ts from 'typescript'
import {NovelImportController} from '../../desktop/main/novel-import'
import {importActionSchema} from '../../desktop/shared/novel-import'
import {desktopMenu,platformCommands} from '../../desktop/shared/command-registry'

test('UP-01: unified choose has no mode, supports append and preserves strict legacy compatibility',()=>{
 for(const action of [{type:'choose'},{type:'choose',append:true},{type:'choose',mode:'files'},{type:'choose',mode:'folder'}])assert.deepEqual(importActionSchema.parse(action),action)
 for(const extra of [{path:'/renderer/forged'},{paths:['/renderer/forged']},{mode:'anything'}])assert.equal(importActionSchema.safeParse({type:'choose',...extra}).success,false)
})

test('UP-03: actual filesystem types drive selection; cancellation, append and task recovery preserve state',async t=>{
 const base=await realpath(await mkdtemp(join(tmpdir(),'shakeink-picker-unit-'))),materials=join(base,'materials'),folder=join(materials,'原稿')
 const textA='第一章 渡口\r\n\r\n林舟十七岁。🖋️\r\n',textB='# 角色\n林舟，携信渡河。\n'
 await mkdir(folder,{recursive:true});await mkdir(join(folder,'附录'))
 const fileA=join(folder,'正文.txt'),fileB=join(materials,'角色.md'),nested=join(folder,'附录','大纲.md')
 await writeFile(fileA,textA);await writeFile(fileB,textB);await writeFile(nested,'# 大纲\n携信渡河。\n')
 try{for(const [name,paths,count] of [['multiple files',[fileA,fileB],2],['folder only',[folder],2],['mixed overlapping paths',[fileA,folder,fileB],3]] as const)await t.test(name,async()=>{
  const root=join(base,name.replaceAll(' ','-'));await mkdir(root)
  let selection:string[]|null=null,pickerCalls=0
  const controller=new NovelImportController({root,choose:async mode=>{assert.equal(mode,undefined);pickerCalls++;return selection},chooseTarget:async()=>null,protectedDirectories:async()=>[],models:async()=>({}),ai:async()=>{throw Error('AI must not run')},cancelAi:async()=>{},publish:async()=>{throw Error('publish must not run')}})
  try{
   await controller.initialize();assert.equal((await controller.act({type:'choose'})).view,null)
   selection=[...paths];const chosen=(await controller.act({type:'choose'})).view!;assert.equal(chosen.files.filter(f=>f.included).length,count)
   if(name==='mixed overlapping paths')assert.ok(chosen.files.some(f=>!f.included&&f.error?.includes('重复')))
   for(const file of chosen.files.filter(f=>f.included)){const result=await controller.act({type:'read-source',id:chosen.id,fileId:file.id});assert.equal(result.source!.text,file.format==='txt'?textA:file.name.endsWith('角色.md')?textB:'# 大纲\n携信渡河。\n')}
   const beforeCalls=pickerCalls;await assert.rejects(controller.act({type:'choose'}),/已有未完成的导入，请先删除/);assert.equal(pickerCalls,beforeCalls);const restored=(await controller.act({type:'current'})).view!;assert.equal(restored.id,chosen.id);assert.equal(restored.revision,chosen.revision)
   selection=null;const canceled=(await controller.act({type:'choose',append:true})).view!;assert.equal(canceled.revision,chosen.revision);assert.deepEqual(canceled.files,chosen.files)
   const extra=join(materials,name+'.txt');await writeFile(extra,'# 场景\n'+name);selection=[extra];const appended=(await controller.act({type:'choose',append:true})).view!;assert.equal(appended.id,chosen.id);assert.equal(appended.files.length,chosen.files.length+1);assert.ok(appended.revision>chosen.revision)
  }finally{await controller.close()}
 })
 assert.equal(await readFile(fileA,'utf8'),textA);assert.equal(await readFile(fileB,'utf8'),textB)
 }finally{await rm(base,{recursive:true,force:true})}
})

test('UP-05: one full sidebar button and default native command; mac menu deduplicates with legacy command retained',async()=>{
 const source=await readFile('src/components/layout/SidebarTree.tsx','utf8'),file=ts.createSourceFile('sidebar.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
 const found:ts.Node[]=[];const visit=(node:ts.Node)=>{found.push(node);ts.forEachChild(node,visit)};visit(file)
 assert.ok(!source.includes('更多导入方式'))
 assert.ok(!source.includes('NovelImportTaskButton'),'导入作品下方不显示导入任务记录')
 const buttons=found.filter((node):node is ts.JsxElement=>ts.isJsxElement(node)&&node.openingElement.tagName.getText(file)==='button'&&node.getText(file).includes('<NavigationLabel>导入作品</NavigationLabel>'))
 assert.equal(buttons.length,1)
 const click=buttons[0].openingElement.attributes.properties.find(p=>ts.isJsxAttribute(p)&&p.name.getText(file)==='onClick')!
 assert.match(click.getText(file),/requestNovelImport\(\)/)
 const command=found.find(node=>ts.isPropertyAssignment(node)&&node.name.getText(file)==="'file.import'")!
 assert.match(command.getText(file),/requestNovelImport\(\)/)
 const ids=(platform:'darwin'|'win32')=>desktopMenu(platform,{}).find(group=>group.id==='file')!.items.filter(item=>item.id.startsWith('file.import')).map(item=>item.id)
 assert.deepEqual(ids('darwin'),['file.import']);assert.deepEqual(ids('win32'),['file.import']);assert.equal(platformCommands('darwin').find(command=>command.id==='file.import-folder')!.label,'导入作品')
 const html=await readFile('design/novel-import/flow.html','utf8');assert.ok(!html.includes('data-action="import-menu"'));assert.ok(!html.includes('data-action="choose-folder"'))
})

test('CP-F02: confirming an empty folder reports no importable text without creating a task',async()=>{
 const base=await realpath(await mkdtemp(join(tmpdir(),'shakeink-picker-empty-'))),root=join(base,'app'),empty=join(base,'empty')
 await mkdir(root);await mkdir(empty)
 const controller=new NovelImportController({root,choose:async()=>[empty],chooseTarget:async()=>null,protectedDirectories:async()=>[],models:async()=>({}),ai:async()=>{throw Error('unexpected AI')},cancelAi:async()=>{},publish:async()=>{throw Error('unexpected publish')}})
 try{await controller.initialize();await assert.rejects(controller.act({type:'choose'}),/没有可导入的文本文件/);assert.equal((await controller.act({type:'current'})).view,null)}finally{await controller.close();await rm(base,{recursive:true,force:true})}
})
