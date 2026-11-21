// NI-N01 only. Uses synthetic files, actual Electron/native dialogs, and the
// shipped renderer/bridge. Run with an operator driving the four native pickers.
import {_electron as electron} from 'playwright'
import {expect} from '@playwright/test'
import assert from 'node:assert/strict'
import {mkdtemp,mkdir,writeFile,realpath,readFile,cp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {execFileSync} from 'node:child_process'
const root=await realpath(await mkdtemp(join(tmpdir(),'shakeink-import-native-')))
const output=resolve('docs/novel-import/evidence'),body='第一章 渡口\r\n\r\n陆青十七岁。  他握着信。🖋️\r\n\r\n第二章 归来\r\n原文的空白全部保留。\r\n',outline='大纲\n\n少年渡河，携信归来。\n'
await mkdir(output,{recursive:true});await mkdir(join(root,'sources'));await mkdir(join(root,'file-work'));await mkdir(join(root,'folder-work'))
await writeFile(join(root,'sources','正文.txt'),body);await writeFile(join(root,'sources','大纲.md'),outline)
execFileSync(process.execPath,['--import','tsx',resolve('tests/helpers/novel-import-native-seed.ts'),root],{cwd:resolve('.'),stdio:'pipe'})
// The unique bundle ID makes native automation address only this test process.
const runtime=process.env.SHAKEINK_IMPORT_NATIVE_RUNTIME||join(root,'ImportVerification.app')
if(process.env.SHAKEINK_IMPORT_NATIVE_RUNTIME){assert.match(runtime,/\/shakeink-import-native-[A-Za-z0-9]+\/ImportVerification\.app$/);assert.deepEqual(await readFile(join(runtime,'Contents/MacOS/Electron')),await readFile(resolve('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')))}else{await cp(resolve('node_modules/electron/dist/Electron.app'),runtime,{recursive:true,dereference:false,verbatimSymlinks:true});execFileSync('/usr/bin/plutil',['-replace','CFBundleIdentifier','-string','ink.shakeink.import-verification.'+root.split('-').at(-1),join(runtime,'Contents/Info.plist')])}
let app,page,owned=false;const errors=[],checks=[],receipts=[];let remoteRequests=0
const current=()=>page.evaluate(()=>window.desktop.novelImport({type:'current'}))
async function stage(name,details={}){const state={name,root,runtime,...details};await writeFile(join(root,'stage.json'),JSON.stringify(state));console.log(JSON.stringify(state))}
async function launch(){
 app=await electron.launch({executablePath:join(runtime,'Contents/MacOS/Electron'),args:[resolve('.')],env:{...process.env,SHAKEINK_TEST_ROOT:join(root,'data')},timeout:60000})
 app.process().stderr.on('data',bytes=>process.stderr.write(bytes))
 page=await app.firstWindow({timeout:60000})
 const identity=await app.evaluate(({app,BrowserWindow})=>({pid:process.pid,root:process.env.SHAKEINK_TEST_ROOT,bootstrap:app.getPath('userData'),windows:BrowserWindow.getAllWindows().length}))
 assert.equal(identity.pid,app.process().pid);assert.equal(identity.root,join(root,'data'));assert.equal(identity.bootstrap,join(root,'data-bootstrap'));assert.equal(identity.windows,1);owned=true
 await app.evaluate(({session})=>{globalThis.__novelImportRemote=[];session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(details,callback)=>{globalThis.__novelImportRemote.push(details.url.split('?')[0]);callback({cancel:true})})})
 page=await app.firstWindow({timeout:60000});page.on('pageerror',error=>errors.push(error.message))
 await page.getByRole('button',{name:'暂不配置',exact:true}).waitFor({timeout:60000})
 const boot=await page.evaluate(()=>window.desktop.bootstrap());assert.equal(boot.dataRoot,join(root,'data'));assert.equal(boot.models.length,0)
 const novels=await page.evaluate(async()=>(await(await fetch('/api/novels')).json()).novels);assert.equal(novels.length,receipts.length);assert.ok(novels.every(n=>receipts.some(r=>r.novelId===n.id)))
 await app.evaluate(({BrowserWindow},title)=>{const window=BrowserWindow.getAllWindows()[0];window.setTitle(title);window.show();window.focus()},'NI-N01 '+root.split('/').at(-1))
 await writeFile(join(output,'native-isolation.json'),JSON.stringify({...identity,dataRoot:boot.dataRoot,catalog:novels.length,models:boot.models.length,guarded:true},null,2)+'\n')
 const skip=page.getByRole('button',{name:'暂不配置',exact:true});if(await skip.isVisible())await skip.click();await page.getByRole('button',{name:/账号菜单/}).waitFor({timeout:60000})
 await stage('ready',{text:(await page.locator('body').innerText()).slice(0,1800)})
}
async function importOne(mode,index){
 await page.getByRole('button',{name:'导入作品',exact:true}).click()
 await stage('source-picker',{mode,path:mode==='files'?join(root,'sources','正文.txt'):join(root,'sources')})
 await page.getByRole('heading',{name:'核对来源',exact:true}).waitFor({timeout:600000})
 const source=await current();assert.equal(source.view.files.filter(f=>f.included).length,mode==='files'?1:2)
 for(const file of source.view.files.filter(f=>f.included)){const read=await page.evaluate(({id,fileId})=>window.desktop.novelImport({type:'read-source',id,fileId}),{id:source.view.id,fileId:file.id});assert.equal(read.source.text,file.format==='txt'?body:outline)}
 checks.push(mode+' native selection and exact full-source extraction')
 await page.getByRole('button',{name:'识别内容',exact:true}).click();await page.getByRole('button',{name:'仅本地分类',exact:true}).click()
 await page.getByRole('heading',{name:'选择内容',exact:true}).waitFor()
 await page.locator('#ni-infer').click();await expect(page.locator('#ni-infer')).not.toBeChecked();await page.getByRole('button',{name:'继续',exact:true}).click()
 await page.getByRole('textbox',{name:'作品名称',exact:true}).fill('原生导入验收'+index)
 await page.getByRole('button',{name:'选择目录',exact:true}).click()
 await stage('target-picker',{mode,path:join(root,index===1?'file-work':'folder-work')})
 await expect(page.getByRole('button',{name:'开始导入',exact:true})).toBeEnabled({timeout:600000})
 await page.getByRole('button',{name:'开始导入',exact:true}).click()
 await page.getByRole('heading',{name:'导入完成',exact:true}).waitFor({timeout:60000})
 const done=(await current()).view;assert.equal(done.phase,'completed');receipts.push(done.publication)
 const data=await page.evaluate(async id=>({outline:await(await fetch(`/api/novels/${id}/outline`)).json(),record:await(await fetch(`/api/novels/${id}/import-record?material=body-original`)).json()}),done.publication.novelId)
 if(!data.record.page)throw Error('Import record read failed: '+JSON.stringify(data.record));assert.equal(data.record.page.text,body);if(mode==='folder'){const original=data.record.record.materials.find(m=>m.kind==='outline');assert.ok(original);const text=await page.evaluate(async({id,material})=>(await(await fetch(`/api/novels/${id}/import-record?material=${material}`)).json()).page.text,{id:done.publication.novelId,material:original.id});assert.equal(text,outline)}
 const chapters=data.outline.volumes.flatMap(v=>v.chapters);let prose=''
 for(const chapter of chapters){const value=await page.evaluate(async({id,ch})=>(await(await fetch(`/api/novels/${id}/chapters/${ch}`)).json()),{id:done.publication.novelId,ch:chapter.id});if(value.chapter?.content!==undefined)prose+=value.chapter.content;else throw Error('Native chapter read route did not return content')}
 assert.equal(prose,body)
 await page.screenshot({path:join(output,`native-${mode}-complete.png`)})
 await page.getByRole('button',{name:'打开作品',exact:true}).click();await page.getByRole('button',{name:'查看导入记录',exact:true}).waitFor();checks.push(mode+' real tables, exact prose, record and original overview mounted')
}
try{
 await launch();const menu=await app.evaluate(({Menu})=>Menu.getApplicationMenu()?.items.find(m=>m.label==='文件')?.submenu?.items.map(i=>i.label));assert.ok(menu.includes('导入作品'));assert.ok(!menu.includes('导入作品文件夹'));checks.push('real macOS native menu entries')
 await importOne('files',1);await importOne('folder',2)
 remoteRequests+=await app.evaluate(()=>globalThis.__novelImportRemote.length)
 await stage('closing');await app.evaluate(({app})=>app.quit());await app.close().catch(()=>{});app=null
 await launch();const novels=await page.evaluate(async()=>(await(await fetch('/api/novels')).json()).novels);for(const receipt of receipts)assert.ok(novels.some(n=>n.id===receipt.novelId));assert.equal((await current()).view,null);checks.push('normal close/reopen preserves both catalog works without unfinished import')
 remoteRequests+=await app.evaluate(()=>globalThis.__novelImportRemote.length);assert.equal(remoteRequests,0);assert.deepEqual(errors,[])
 const evidence={id:'NI-N01',passed:true,platform:process.platform,arch:process.arch,completedAt:new Date().toISOString(),root,driver:'Playwright actual Electron + operator native OS picker control; no picker stubs and no provider',checks,remoteRequests,errors};await writeFile(join(output,'native.json'),JSON.stringify(evidence,null,2)+'\n');await stage('passed',evidence)
}catch(error){if(page)await page.screenshot({path:join(output,'native-failure.png')}).catch(()=>{});await stage('failed',{error:error.message,text:page?await page.locator('body').innerText().catch(()=>''):''});throw error}
finally{if(owned)await app?.close().catch(()=>{});console.log('Synthetic verification directory retained: '+root)}
