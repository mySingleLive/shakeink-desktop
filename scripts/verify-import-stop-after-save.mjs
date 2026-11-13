// SD-50..SD-52 real-target acceptance (docs/560-561): built Electron, isolated SHAKEINK_TEST_ROOT,
// synthetic .txt source, copy-only import (no model, no key, no network). Only the native
// open dialogs are replaced, as in scripts/verify-import-abandon.mjs.
import {_electron} from 'playwright-core'
import assert from 'node:assert/strict'
import {mkdtemp,mkdir,writeFile,readFile,readdir,realpath,rm,stat,chmod} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {execFileSync} from 'node:child_process'

const directory=await realpath(await mkdtemp(join(tmpdir(),'shakeink-import-abandon-'))),dataRoot=join(directory,'data'),sources=join(directory,'sources')
const evidence=resolve('docs/560-import-stop-after-save-evidence');await mkdir(evidence,{recursive:true})
await mkdir(sources);await writeFile(join(sources,'合成正文.txt'),Array.from({length:6},(_,i)=>`第${i+1}章 渡口${i+1}\n\n林舟第${i+1}次来到渡口，许宁在岸边等他。\n\n`).join(''))
execFileSync(process.execPath,['--import','tsx',resolve('scripts/seed-import-abandon.ts'),directory],{stdio:'pipe'})
const imports=join(dataRoot,'novel-imports'),results=[],scrub=text=>String(text).replaceAll(directory,'<isolated>')
const drafts=async()=>{try{return (await readdir(imports)).filter(name=>/^[0-9a-f-]{36}$/u.test(name))}catch(error){if(error.code==='ENOENT')return [];throw error}}
const listing=async path=>(await readdir(path)).sort()
const env={...process.env,SHAKEINK_TEST_ROOT:dataRoot};delete env.ELECTRON_RUN_AS_NODE
const record=(id,ok,details)=>{results.push({id,ok,...details});console.log(`${ok?'PASS':'FAIL'} ${id} ${scrub(JSON.stringify(details))}`);assert.ok(ok,id)}

async function launch(target){
 const app=await _electron.launch({args:[resolve('.')],env,timeout:90000}),page=await app.firstWindow({timeout:90000});page.setDefaultTimeout(20000)
 assert.equal(await app.evaluate(()=>process.env.SHAKEINK_TEST_ROOT),dataRoot,'isolated root in use')
 await app.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows()[0];win.setBounds({x:120,y:60,width:1280,height:860});win.focus()})
 await app.evaluate(({dialog},{file,target})=>{globalThis.__target=target;dialog.showOpenDialog=async(...args)=>{const options=args.at(-1);return {canceled:false,filePaths:[options?.properties?.includes('openFile')?file:globalThis.__target]}}},{file:join(sources,'合成正文.txt'),target})
 const later=page.getByRole('button',{name:'暂不配置',exact:true});await later.waitFor({timeout:15000}).then(()=>later.click(),()=>undefined)
 await page.getByRole('button',{name:'导入作品',exact:true}).waitFor()
 const setTarget=path=>app.evaluate((_,path)=>{globalThis.__target=path},path)
 return {app,page,setTarget}
}
const current=page=>page.evaluate(async()=>(await window.desktop.novelImport({type:'current'})).view)
async function until(page,test,timeout=60000){const end=Date.now()+timeout;for(;;){const view=await current(page);if(test(view))return view;if(Date.now()>end)throw Error('timeout: '+JSON.stringify({phase:view?.phase,step:view?.wizard?.step,error:view?.error}));await new Promise(r=>setTimeout(r,150))}}
const act=(page,type,extra={})=>page.evaluate(async({type,extra})=>{const v=(await window.desktop.novelImport({type:'current'})).view;return window.desktop.novelImport({type,id:v.id,revision:v.revision,...extra})},{type,extra})
/** Real wizard to step 21 through the production IPC; the step-21 save is clicked in the UI. */
async function toVerify(page,afterTarget=async()=>{}){
 await page.getByRole('button',{name:'导入作品',exact:true}).click();const d=page.locator('.ni-dialog');await d.getByText('合成正文.txt').first().waitFor()
 await d.getByRole('button',{name:'继续',exact:true}).click();await until(page,v=>v?.wizard?.step==='work')
 await act(page,'choose-target');await afterTarget();await act(page,'set-title',{title:'渡口合成作品'});await act(page,'wizard-next');await until(page,v=>v?.wizard?.step==='kinds')
 await act(page,'select',{selected:['body'],targets:[],infer:false});await act(page,'wizard-next');await until(page,v=>v?.wizard?.step==='tree')
 await act(page,'wizard-next',{consent:false});await until(page,v=>v?.wizard?.step==='verify'&&v.wizard.stepState.verify==='waiting')
 return d
}
const settled=page=>page.waitForFunction(()=>document.getAnimations().every(a=>a.playState!=='running')).then(()=>new Promise(r=>setTimeout(r,200)))
const shot=(page,name)=>settled(page).then(()=>page.locator('.ni-dialog').screenshot({path:join(evidence,name)})).then(()=>name)

let session
try{
 // SD-50: the reported state. The target holds only .DS_Store plus a foreign file so the first save fails;
 // the folder then shows the real step-22 page (paused at restart, folder needing authorization).
 const target=join(directory,'导入目标');await mkdir(target);await writeFile(join(target,'.DS_Store'),'finder')
 session=await launch(target);let page=session.page
 // R8 (real): a non-empty folder is refused when chosen.
 const busy=join(directory,'非空目录');await mkdir(busy);await writeFile(join(busy,'a.txt'),'x');await session.setTarget(busy)
 await page.getByRole('button',{name:'导入作品',exact:true}).click();await page.locator('.ni-dialog').getByText('合成正文.txt').first().waitFor();await page.locator('.ni-dialog').getByRole('button',{name:'继续',exact:true}).click();await until(page,v=>v?.wizard?.step==='work')
 const refused=await act(page,'choose-target').then(()=>'',error=>String(error.message))
 record('SD-13r choosing a non-empty folder is refused at once',/请选择空目录/u.test(refused),{refused:refused.replace(/^.*Error: /u,'')})
 await session.setTarget(target);await act(page,'cancel');await page.locator('.ni-dialog').waitFor({state:'hidden'})
 // SD-50u: the folder changes after it was chosen; the save is refused before anything is written.
 let d=await toVerify(page,()=>writeFile(join(target,'作者笔记.txt'),'不属于导入'))
 await d.getByRole('button',{name:'保存作品',exact:true}).click();const early=await until(page,v=>v?.phase==='failed'&&v.wizard?.step==='done')
 record('SD-50u a folder that gained files fails the save with a clear reason',early.error==='保存目录已不是空目录，请移走其中的文件或重新选择目录后继续保存',{error:early.error,publication:!!early.publication})
 // The reported state: the save starts (publication recorded) and the service fails. A read-only folder makes
 // the work-manifest write fail after the reservation, like the user's run.
 await rm(join(target,'作者笔记.txt'));await chmod(target,0o555)
 await d.getByRole('button',{name:'继续保存',exact:true}).click();const failed=await until(page,v=>v?.phase==='failed'&&!!v.publication&&v.wizard?.step==='done',60000)
 await chmod(target,0o755)
 record('SD-50a a started save that fails stays at step 22 with a save-specific reason',!!failed.publication&&!/模型/u.test(failed.error??'')&&/保存/u.test(failed.error??''),{error:failed.error})
 const sessionId=failed.id
 await session.app.close();session=undefined
 session=await launch(target);page=session.page;await page.locator('.ni-task-button').click();d=page.locator('.ni-dialog');await d.getByRole('heading',{name:'保存作品'}).waitFor()
 const text=await d.innerText()
 record('SD-50 step 22 shows save page with three actions and no send consent',/需要重新选择并授权保存目录/u.test(text)&&!/允许并继续导入|继续导入即允许/u.test(text)&&await d.getByRole('button',{name:'选择目录',exact:true}).count()===1&&await d.getByRole('button',{name:'继续保存',exact:true}).isDisabled()&&await d.getByRole('button',{name:'停止导入',exact:true}).count()===1,{shot:await shot(page,'real-step22-paused.png')})

 // SD-51: Esc only hides a started save; reauthorize the original folder (now only .DS_Store) and save.
 await page.keyboard.press('Escape');await d.waitFor({state:'hidden'});record('SD-43r Esc hides a started save and keeps the draft',(await drafts()).includes(sessionId)&&await page.locator('.ni-task-button').count()===1,{})
 await page.locator('.ni-task-button').click();await d.waitFor()
 await d.getByRole('button',{name:'选择目录',exact:true}).click();await until(page,v=>v?.targetReady===true)
 await d.getByRole('button',{name:'继续保存',exact:true}).click();const done=await until(page,v=>v?.phase==='completed',120000)
 record('SD-51 resumed save completes into the original folder; .DS_Store kept',!!done.publication?.novelId&&(await listing(target)).includes('.DS_Store')&&(await listing(target)).includes('shakeink-work.json'),{entries:await listing(target)})
 await d.screenshot({path:join(evidence,'real-step22-completed.png')})
 await page.getByRole('button',{name:/完成|关闭|收起/u}).first().click().catch(()=>page.keyboard.press('Escape'))
 await session.app.close();session=undefined

 // SD-52: a second import whose save left a real reservation and half-created work is stopped from step 22.
 const target2=join(directory,'导入目标二');await mkdir(target2)
 session=await launch(target2);page=session.page;d=await toVerify(page)
 // Start a real save that fails in the service, so the draft keeps its publication across the restart.
 await chmod(target2,0o555);await d.getByRole('button',{name:'保存作品',exact:true}).click();const failed2=await until(page,v=>v?.phase==='failed'&&!!v.publication&&v.wizard?.step==='done',120000);await chmod(target2,0o755)
 await session.app.close();session=undefined
 assert.ok((await drafts()).includes(failed2.id),'a started save survives quitting')
 // With the app closed: run the production publish and stop it at before-initialize.
 await writeFile(join(target2,'.DS_Store'),'finder')
 execFileSync(process.execPath,['--import','tsx',resolve('scripts/seed-import-half-created.ts'),directory,failed2.id],{stdio:'pipe'})
 await writeFile(join(target2,'作者笔记.txt'),'作者后来放入')
 const half=await listing(target2)
 record('SD-52a seeded a real half-created work in the draft target',half.includes('shakeink-work.json')&&half.includes('database'),{halfCreated:half})
 session=await launch(target2);page=session.page;await page.locator('.ni-task-button').click();d=page.locator('.ni-dialog');await d.getByRole('heading',{name:'保存作品'}).waitFor()
 await d.getByRole('button',{name:'停止导入',exact:true}).click();const c=page.getByRole('dialog',{name:'停止并删除这次导入？',exact:true});await c.waitFor()
 await settled(page);await page.screenshot({path:join(evidence,'real-step22-stop-confirm.png')})
 await c.getByRole('button',{name:'停止并删除',exact:true}).click();await d.waitFor({state:'hidden',timeout:60000})
 for(let i=0;i<50&&(await drafts()).includes(failed2.id);i++)await new Promise(r=>setTimeout(r,100))
 const after=await listing(target2)
 record('SD-52 stop at step 22 deletes the draft and cleans only this import\'s files',!(await drafts()).includes(failed2.id)&&JSON.stringify(after)===JSON.stringify(['.DS_Store','作者笔记.txt']),{after})
 await session.app.close();session=undefined
 // The same folder can be used for a new import after cleaning (reservation released).
 const reuse=await stat(target2).then(()=>true,()=>false);record('SD-52b cleaned folder still exists for reuse',reuse,{})
 await writeFile(join(evidence,'real-target-report.json'),scrub(JSON.stringify({scope:`macOS ${process.arch} built Electron (npm run build), isolated SHAKEINK_TEST_ROOT, copy-only, no model`,finishedAt:new Date().toISOString(),results},null,1))+'\n')
 console.log('SD-R PASS',results.length)
}finally{await session?.app.close().catch(()=>undefined);await rm(directory,{recursive:true,force:true})}
