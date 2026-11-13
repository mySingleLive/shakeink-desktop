// RT-R1/RT-R2 real-target acceptance (docs/567-568): built Electron, isolated SHAKEINK_TEST_ROOT, synthetic
// .txt source, copy-only import (no model, no key, no network). Only the native open dialogs are replaced,
// as in scripts/verify-import-stop-after-save.mjs. The work is deleted through the normal sidebar menu.
import {_electron} from 'playwright-core'
import assert from 'node:assert/strict'
import {mkdtemp,mkdir,writeFile,readdir,realpath,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {execFileSync} from 'node:child_process'

const directory=await realpath(await mkdtemp(join(tmpdir(),'shakeink-import-abandon-'))),dataRoot=join(directory,'data'),sources=join(directory,'sources')
const evidence=resolve(process.env.RT_EVIDENCE??'/private/tmp/shakeink-reuse-567/evidence');await mkdir(evidence,{recursive:true})
await mkdir(sources);await writeFile(join(sources,'合成正文.txt'),Array.from({length:6},(_,i)=>`第${i+1}章 渡口${i+1}\n\n林舟第${i+1}次来到渡口，许宁在岸边等他。\n\n`).join(''))
execFileSync(process.execPath,['--import','tsx',resolve('scripts/seed-import-abandon.ts'),directory],{stdio:'pipe'})
const results=[],scrub=text=>String(text).replaceAll(directory,'<isolated>')
const env={...process.env,SHAKEINK_TEST_ROOT:dataRoot,SHAKEINK_IMPORT_DEBUG:'1'};delete env.ELECTRON_RUN_AS_NODE
const record=(id,ok,details)=>{results.push({id,ok,...details});console.log(`${ok?'PASS':'FAIL'} ${id} ${scrub(JSON.stringify(details))}`);assert.ok(ok,id)}
const listing=async path=>(await readdir(path)).sort()
const empty=async path=>{for(const name of await readdir(path))await rm(join(path,name),{recursive:true,force:true});await writeFile(join(path,'.DS_Store'),'finder')}

async function launch(target){
 const app=await _electron.launch({args:[resolve('.')],env,timeout:90000}),page=await app.firstWindow({timeout:90000});page.setDefaultTimeout(20000)
 app.process().stderr?.on('data',chunk=>process.stderr.write('[app] '+scrub(chunk)));app.process().stdout?.on('data',chunk=>process.stderr.write('[app] '+scrub(chunk)))
 assert.equal(await app.evaluate(()=>process.env.SHAKEINK_TEST_ROOT),dataRoot,'isolated root in use')
 await app.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows()[0];win.setBounds({x:120,y:60,width:1280,height:860});win.focus()})
 await app.evaluate(({dialog},{file,target})=>{globalThis.__target=target;dialog.showOpenDialog=async(...args)=>{const options=args.at(-1);return {canceled:false,filePaths:[options?.properties?.includes('openFile')?file:globalThis.__target]}}},{file:join(sources,'合成正文.txt'),target})
 const later=page.getByRole('button',{name:'暂不配置',exact:true});await later.waitFor({timeout:15000}).then(()=>later.click(),()=>undefined)
 await page.getByRole('button',{name:'导入作品',exact:true}).waitFor()
 return {app,page}
}
const current=page=>page.evaluate(async()=>(await window.desktop.novelImport({type:'current'})).view)
async function until(page,test,timeout=60000){const end=Date.now()+timeout;for(;;){const view=await current(page);if(test(view))return view;if(Date.now()>end)throw Error('timeout: '+JSON.stringify({phase:view?.phase,step:view?.wizard?.step,error:view?.error}));await new Promise(r=>setTimeout(r,200))}}
const act=(page,type,extra={})=>page.evaluate(async({type,extra})=>{const v=(await window.desktop.novelImport({type:'current'})).view;return window.desktop.novelImport({type,id:v.id,revision:v.revision,...extra})},{type,extra})
const settled=page=>page.waitForFunction(()=>document.getAnimations().every(a=>a.playState!=='running')).then(()=>new Promise(r=>setTimeout(r,200)))
/** Opens the wizard to step 1 (作品与目录) and clicks the real 选择目录 button; returns the dialog. */
async function toTarget(page){
 await page.getByRole('button',{name:'导入作品',exact:true}).click();const d=page.locator('.ni-dialog');await d.getByText('合成正文.txt').first().waitFor()
 await d.getByRole('button',{name:'继续',exact:true}).click();await until(page,v=>v?.wizard?.step==='work')
 await d.getByRole('button',{name:'选择目录',exact:true}).click();await settled(page)
 return d
}
async function importAndSave(page,d){
 await act(page,'set-title',{title:'渡口合成作品'});await act(page,'wizard-next');await until(page,v=>v?.wizard?.step==='kinds')
 await act(page,'select',{selected:['body'],targets:[],infer:false});await act(page,'wizard-next');await until(page,v=>v?.wizard?.step==='tree')
 await act(page,'wizard-next',{consent:false});await until(page,v=>v?.wizard?.step==='verify'&&v.wizard.stepState.verify==='waiting')
 await d.getByRole('button',{name:'保存作品',exact:true}).click();const done=await until(page,v=>v?.phase==='completed'||!!v?.error&&v?.phase!=='publishing',120000);if(done.phase!=='completed')throw Error('save failed: '+done.phase+' '+done.error)
 await page.getByRole('button',{name:/完成|关闭|收起/u}).first().click().catch(()=>page.keyboard.press('Escape'));await d.waitFor({state:'hidden'}).catch(()=>undefined)
 return done
}
async function deleteFromSidebar(page,title){
 const row=page.locator('.sidebar-navigation .tree-row',{hasText:title}).first();await row.waitFor()
 await row.click({button:'right'});const menu=page.locator('[role=menu][data-open]');await menu.waitFor()
 await menu.getByRole('menuitem',{name:'删除',exact:true}).click()
 const dialog=page.getByRole('dialog').filter({hasText:'删除小说'});await dialog.waitFor()
 await dialog.getByRole('button',{name:'确认删除',exact:true}).click();await dialog.waitFor({state:'hidden'})
 await page.getByText('小说已删除').first().waitFor().catch(()=>undefined)
 await page.locator('.sidebar-navigation .tree-row',{hasText:title}).first().waitFor({state:'detached',timeout:20000})
}

let session
try{
 const target=join(directory,'导入目标');await mkdir(target)
 session=await launch(target);let page=session.page
 // First import into the folder, then the normal sidebar delete (the user's path).
 let d=await toTarget(page);const first=await importAndSave(page,d)
 record('RT-R0 first copy-only import saves into the folder',!!first.publication?.novelId&&(await listing(target)).includes('shakeink-work.json'),{entries:await listing(target)})
 await deleteFromSidebar(page,'渡口合成作品')
 record('RT-R0b normal delete keeps the folder files untouched',(await listing(target)).includes('shakeink-work.json'),{entries:await listing(target)})
 // RT-R2 (control): folder not emptied → still refused as overlap.
 d=await toTarget(page)
 const refused=await d.locator('.ni-alert').first().innerText({timeout:3000}).catch(()=>'')
 const viewRefused=await current(page)
 await settled(page);await d.screenshot({path:join(evidence,'rt-r2-not-emptied-refused.png')})
 record('RT-R2 a deleted work whose files remain is still refused',/保存目录不能与来源或应用目录重叠/u.test(refused)&&viewRefused?.targetReady!==true,{shown:refused.replace(/^.*Error: /u,''),targetReady:viewRefused?.targetReady})
 await act(page,'cancel');await d.waitFor({state:'hidden'})
 // RT-R1: empty the folder like Finder does (only .DS_Store left), then import again into it.
 await empty(target)
 d=await toTarget(page);const accepted=await until(page,v=>v?.targetReady===true||!!v?.error,20000)
 const shown=await d.locator('.ni-alert').first().innerText({timeout:3000}).catch(()=>'')
 await settled(page);await d.screenshot({path:join(evidence,'rt-r1-emptied-accepted.png')})
 record('RT-R1 the emptied folder of a deleted work is accepted at step 1',accepted.targetReady===true&&!/重叠/u.test(shown),{targetReady:accepted.targetReady,error:accepted.error??null,shown})
 const second=await importAndSave(page,d)
 const works=await page.evaluate(async()=>{const r=await fetch('/api/novels');return (await r.json()).novels.map(n=>({id:n.id,title:n.title}))})
 record('RT-R1b the re-import saves; the list shows exactly one work for the folder',!!second.publication?.novelId&&second.publication.novelId!==first.publication.novelId&&works.length===1&&works[0].id===second.publication.novelId,{works:works.length,entries:await listing(target)})
 await settled(page);await page.screenshot({path:join(evidence,'rt-r1-after-reimport.png')})
 await session.app.close();session=undefined
 // Restart: the new work opens; no faulted node for the old record.
 session=await launch(target);page=session.page
 const after=await page.evaluate(async()=>{const r=await fetch('/api/novels');const j=await r.json();return {novels:j.novels.length,unavailable:j.unavailableWorks.length}})
 record('RT-R1c after restart one work, no unavailable work',after.novels===1&&after.unavailable===0,after)
 await writeFile(join(evidence,'real-target-report.json'),scrub(JSON.stringify({scope:`macOS ${process.arch} built Electron, isolated SHAKEINK_TEST_ROOT, copy-only, no model`,finishedAt:new Date().toISOString(),results},null,1))+'\n')
 console.log('RT-R PASS',results.length)
}finally{await session?.app.close().catch(()=>undefined);await rm(directory,{recursive:true,force:true})}
