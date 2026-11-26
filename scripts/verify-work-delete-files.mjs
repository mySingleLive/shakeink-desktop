// WDR-01..04 real-target acceptance (docs/608): built Electron, isolated SHAKEINK_TEST_ROOT, zero models,
// no network. Works are created through the real 打开作品/新建 service path with a native-dialog stub for the
// folder picker only; deletion uses the real sidebar menu and the real delete dialog.
import {_electron} from 'playwright-core'
import assert from 'node:assert/strict'
import {mkdtemp,mkdir,writeFile,readdir,realpath,rm,rename,stat} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {execFileSync} from 'node:child_process'

const directory=await realpath(await mkdtemp(join(tmpdir(),'shakeink-import-abandon-'))),dataRoot=join(directory,'data'),parent=join(directory,'作品')
const evidence=resolve(process.env.WD_EVIDENCE??'/private/tmp/shakeink-delete-608/evidence');await mkdir(evidence,{recursive:true});await mkdir(parent)
execFileSync(process.execPath,['--import','tsx',resolve('scripts/seed-import-abandon.ts'),directory],{stdio:'pipe'})
const results=[],scrub=text=>String(text).replaceAll(directory,'<isolated>')
const env={...process.env,SHAKEINK_TEST_ROOT:dataRoot};delete env.ELECTRON_RUN_AS_NODE
const record=(id,ok,details)=>{results.push({id,ok,...details});console.log(`${ok?'PASS':'FAIL'} ${id} ${scrub(JSON.stringify(details))}`);assert.ok(ok,id)}
const exists=path=>stat(path).then(()=>true,()=>false)
const listing=async path=>(await readdir(path)).sort()

async function launch(){
 const app=await _electron.launch({args:[resolve('.')],env,timeout:90000}),page=await app.firstWindow({timeout:90000});page.setDefaultTimeout(20000)
 app.process().stderr?.on('data',chunk=>process.stderr.write('[app] '+scrub(chunk)))
 assert.equal(await app.evaluate(()=>process.env.SHAKEINK_TEST_ROOT),dataRoot,'isolated root in use')
 await app.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows()[0];win.setBounds({x:120,y:60,width:1280,height:860});win.focus()})
 await app.evaluate(({dialog})=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[globalThis.__target]})})
 if(process.env.WD_TRACE)await app.evaluate(({ipcMain})=>{const handlers=ipcMain._invokeHandlers;const original=handlers.get('desktop:request');handlers.set('desktop:request',async(event,value)=>{try{return await original(event,value)}catch(error){process.stderr.write('[wd-trace] '+value?.method+' '+value?.path+' '+error.message+'\n');throw error}})})
 const later=page.getByRole('button',{name:'暂不配置',exact:true});await later.waitFor({timeout:15000}).then(()=>later.click(),()=>undefined)
 return {app,page}
}
/** Creates a work through the real POST /api/novels path (main shows the stubbed folder picker). */
async function createWork(session,title){
 const folder=join(parent,title);await mkdir(folder)
 await session.app.evaluate((_,path)=>{globalThis.__target=path},folder)
 const created=await session.page.evaluate(async title=>{const r=await fetch('/api/novels',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title,requestId:crypto.randomUUID()})});return {status:r.status,body:await r.json()}},title)
 assert.equal(created.status,201,JSON.stringify(created))
 // Same refresh the main process sends after 打开作品 (DesktopApp invalidates every query on works.refresh).
 await session.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('desktop:event',{type:'command',id:'works.refresh'}))
 await session.page.locator('.sidebar-navigation .tree-row',{hasText:title}).first().waitFor()
 return folder
}
async function openDelete(page,title){
 const row=page.locator('.sidebar-navigation .tree-row',{hasText:title}).first();await row.waitFor()
 await row.click({button:'right'});const menu=page.locator('[role=menu][data-open]');await menu.waitFor()
 await menu.getByRole('menuitem',{name:'删除',exact:true}).click()
 const dialog=page.getByRole('dialog').filter({hasText:'是否同时删除磁盘上的作品文件？'});await dialog.waitFor()
 return dialog
}
const settled=page=>page.waitForFunction(()=>document.getAnimations().every(a=>a.playState!=='running')).then(()=>new Promise(r=>setTimeout(r,200)))
const listed=page=>page.evaluate(async()=>{const j=await (await fetch('/api/novels')).json();return {novels:j.novels.map(n=>n.title),unavailable:j.unavailableWorks.map(w=>w.title)}})

let session
try{
 session=await launch();const {page}=session
 // WDR-03: dialog copy and the real folder path
 const keep=await createWork(session,'保留文件作品')
 await writeFile(join(keep,'作者笔记.md'),'# 笔记')
 let dialog=await openDelete(page,'保留文件作品');await dialog.locator('[data-work-location]').waitFor();await settled(page)
 await dialog.screenshot({path:join(evidence,'wdr-03-dialog.png')})
 const text=await dialog.innerText(),buttons=await dialog.locator('[data-slot="dialog-footer"] button').allInnerTexts()
 record('WDR-03 dialog shows title, question, real folder path and three buttons',text.includes('删除《保留文件作品》')&&text.includes('是否同时删除磁盘上的作品文件？')&&text.includes(keep)&&text.includes('选「删除」只从玄印写作中删除，文件保留。')&&JSON.stringify(buttons)===JSON.stringify(['取消','删除','删除，不保留文件']),{buttons})
 // WDR-01: 否 keeps the folder; the work can be opened again
 const before=await listing(keep)
 await dialog.getByRole('button',{name:'删除',exact:true}).click();await dialog.waitFor({state:'hidden'})
 await page.getByText('作品已从列表中删除').first().waitFor()
 const afterNo=await listed(page)
 record('WDR-01 删除 removes the work from the list and leaves its folder unchanged',!afterNo.novels.includes('保留文件作品')&&JSON.stringify(await listing(keep))===JSON.stringify(before.filter(n=>n!=='.shakeink-lock')),{entries:await listing(keep),list:afterNo})
 await session.app.evaluate((_,path)=>{globalThis.__target=path},keep)
 await page.evaluate(()=>window.desktop.command('file.open'))
 await page.locator('.sidebar-navigation .tree-row',{hasText:'保留文件作品'}).first().waitFor()
 record('WDR-01b the kept folder is added back with 打开作品',(await listed(page)).novels.includes('保留文件作品'),{list:await listed(page)})
 // WDR-02: 是 deletes the folder with author files; siblings stay
 const gone=await createWork(session,'删除文件作品'),sibling=join(parent,'同级目录');await mkdir(sibling);await writeFile(join(sibling,'别动.txt'),'keep')
 await mkdir(join(gone,'素材'));await writeFile(join(gone,'素材','图.txt'),'x');await writeFile(join(gone,'大纲.md'),'# 大纲')
 dialog=await openDelete(page,'删除文件作品');await dialog.locator('[data-work-location]').waitFor()
 await dialog.getByRole('button',{name:'删除，不保留文件',exact:true}).click();await dialog.waitFor({state:'hidden'})
 await page.getByText('作品及其文件已删除').first().waitFor();await settled(page)
 await page.screenshot({path:join(evidence,'wdr-02-after-delete.png')})
 const parentListing=await listing(parent)
 await writeFile(join(evidence,'wdr-02-ls.txt'),scrub(execFileSync('/bin/ls',['-la',parent]).toString()))
 record('WDR-02 删除，不保留文件 permanently deletes the folder; sibling folders are untouched',!(await exists(gone))&&await exists(join(sibling,'别动.txt'))&&!(await listed(page)).novels.includes('删除文件作品'),{parent:parentListing})
 // WDR-04: an unavailable (moved) work → 是 reports missing and leaves the moved folder intact
 const moved=await createWork(session,'移走的作品');await session.app.close();session=undefined
 await rename(moved,moved+'-已移走');const movedBefore=await listing(moved+'-已移走')
 session=await launch()
 const faulted=session.page.locator('.sidebar-navigation .tree-row',{hasText:'移走的作品'}).first();await faulted.waitFor()
 dialog=await openDelete(session.page,'移走的作品');await dialog.locator('[data-work-location]').waitFor()
 await dialog.getByRole('button',{name:'删除，不保留文件',exact:true}).click();await dialog.waitFor({state:'hidden'})
 await session.page.getByText('作品已删除，未找到作品目录，没有删除任何文件').first().waitFor()
 record('WDR-04 an unavailable work: 删除，不保留文件 reports the folder was not found and the moved folder is intact',JSON.stringify(await listing(moved+'-已移走'))===JSON.stringify(movedBefore)&&!(await listed(session.page)).unavailable.includes('移走的作品'),{moved:await listing(moved+'-已移走')})
 await writeFile(join(evidence,'real-target-report.json'),scrub(JSON.stringify({scope:`macOS ${process.arch} built Electron, isolated SHAKEINK_TEST_ROOT, zero models`,finishedAt:new Date().toISOString(),results},null,1))+'\n')
 console.log('WDR PASS',results.length)
}finally{await session?.app.close().catch(()=>undefined);await rm(directory,{recursive:true,force:true})}
