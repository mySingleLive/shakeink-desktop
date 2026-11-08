import {_electron} from 'playwright-core'
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {mkdtemp,mkdir,realpath,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {execFileSync} from 'node:child_process'
import {randomUUID} from 'node:crypto'

// RPE-01..06 (docs/511): real Electron workbench in an isolated root. The close flow's draft
// flush is made to fail by withholding the main process's own prepare-close event, so the
// renderer never answers and the real 20 s timeout raises the real failure prompt.
const directory=await realpath(await mkdtemp(join(tmpdir(),'shakeink-import-abandon-')))
const dataRoot=join(directory,'data'),evidence=resolve('docs/evidence')
await mkdir(join(directory,'target'))
execFileSync(process.execPath,['--import','tsx',resolve('scripts/seed-import-abandon.ts'),directory],{stdio:'pipe'})
// A model endpoint that never answers keeps a connection test running, so the app is busy.
const held=new Set()
const server=createServer((req,res)=>{held.add(res);req.resume()})
await new Promise(done=>server.listen(0,'127.0.0.1',done))
const endpoint=`http://127.0.0.1:${server.address().port}/v1`
const env={...process.env,SHAKEINK_TEST_ROOT:dataRoot};delete env.ELECTRON_RUN_AS_NODE
const results=[]
let app
try{
 app=await _electron.launch({args:[resolve('.')],env,timeout:90000})
 const page=await app.firstWindow({timeout:90000});page.setDefaultTimeout(60000)
 assert.equal(await app.evaluate(()=>process.env.SHAKEINK_TEST_ROOT),dataRoot)
 await app.evaluate(({dialog,BrowserWindow})=>{
  globalThis.__native={messageBoxes:0,errorBoxes:0,dropFlush:false}
  dialog.showMessageBox=async()=>{globalThis.__native.messageBoxes++;return{response:0,checkboxChecked:false}}
  dialog.showErrorBox=()=>{globalThis.__native.errorBoxes++}
  dialog.showSaveDialog=async()=>({canceled:true,filePath:undefined})
  const contents=BrowserWindow.getAllWindows()[0].webContents,send=contents.send.bind(contents)
  globalThis.__trace=[];contents.send=(channel,event,...rest)=>{if(event?.type)globalThis.__trace.push(event.type==='prompts'?'prompts:'+event.prompts.map(x=>x.title).join('|'):event.type+(event.action?':'+event.action:''));if(globalThis.__native.dropFlush&&event?.type==='prepare-close'&&event.action==='flush')return;return send(channel,event,...rest)}
 })
 const later=page.getByRole('button',{name:'暂不配置',exact:true});await later.waitFor({timeout:15000}).then(()=>later.click(),()=>undefined)
 await page.getByRole('button',{name:'导入作品',exact:true}).waitFor()
 const setDrop=value=>app.evaluate((_electron,value)=>{globalThis.__native.dropFlush=value},value)
 const closeWindow=()=>app.evaluate(({BrowserWindow})=>{BrowserWindow.getAllWindows()[0]?.close()})
 const windows=()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length)
 const promptDialog=name=>page.getByRole('dialog',{name,exact:true})
 const busy=async()=>{void page.evaluate(({endpoint,id})=>window.desktop.testModel(id,{provider:'custom',kind:'TEXT',protocol:'openai',endpoint,apiKey:'isolated-test-key',modelId:'held'}).catch(()=>undefined),{endpoint,id:randomUUID()});for(let i=0;i<100&&!held.size;i++)await page.waitForTimeout(100);assert.ok(held.size,'held model request')}
 const expectPrompt=async(name,buttons)=>{const p=promptDialog(name);await p.waitFor({timeout:40000});assert.equal(await p.getAttribute('data-slot'),'dialog-content');assert.match(await p.getAttribute('class')??'',/desktop-prompt/);assert.deepEqual(await p.locator('[data-slot="dialog-footer"] button').allInnerTexts(),buttons);return p}
 const stillOpen=async label=>{await page.waitForTimeout(300);assert.equal(await windows(),1,label);assert.equal(await page.locator('.desktop-prompt').count(),0,label);await page.getByRole('button',{name:'导入作品',exact:true}).waitFor()}

 // RPE-04: a running task asks first; cancelling keeps the window.
 await busy();await closeWindow()
 let p=await expectPrompt('仍有创作任务运行',['取消关闭','停止任务并继续'])
 assert.match(await p.innerText(),/已保存的内容和待确认草稿会保留/)
 await page.screenshot({path:join(evidence,'prompt-e2e-busy.png')})
 await p.getByRole('button',{name:'取消关闭',exact:true}).click();await stillOpen('busy cancel');results.push({id:'RPE-04',prompt:'仍有创作任务运行',choice:'取消关闭',windowKept:true})
 for(const res of held){res.destroy()}held.clear()

 // RPE-01/02: the failed-close prompt is an HTML dialog; cancel keeps the window usable.
 await setDrop(true);await closeWindow();const started=Date.now()
 p=await expectPrompt('尚不能关闭',['取消关闭','导出草稿','重试'])
 assert.match(await p.innerText(),/部分修改尚未确认保存/);assert.match(await p.innerText(),/窗口和原草稿已保留/)
 assert.equal(await page.evaluate(()=>document.activeElement?.textContent),'取消关闭')
 await page.screenshot({path:join(evidence,'prompt-e2e-close-failed.png')})
 results.push({id:'RPE-01',prompt:'尚不能关闭',afterMs:Date.now()-started,htmlDialog:true})
 await p.getByRole('button',{name:'取消关闭',exact:true}).click();await stillOpen('failed cancel');results.push({id:'RPE-02',choice:'取消关闭',windowKept:true})

 // RPE-03: export routes to the recovery export (save picker cancelled) and asks again; retry fails again.
 await closeWindow();p=await expectPrompt('尚不能关闭',['取消关闭','导出草稿','重试'])
 const firstId=await page.evaluate(async()=>(await window.desktop.prompts())[0]?.id)
 await p.getByRole('button',{name:'导出草稿',exact:true}).click()
 if(process.env.DEBUG_PROMPTS){await page.waitForTimeout(3000);console.log(JSON.stringify({trace:(await app.evaluate(()=>globalThis.__trace)).slice(-12),dom:await page.evaluate(()=>({prompt:document.querySelectorAll('.desktop-prompt').length,dialogs:[...document.querySelectorAll('[data-slot="dialog-content"]')].map(n=>n.className.slice(0,60)+' '+(n.querySelector('[data-slot="dialog-title"]')?.textContent??'')),hidden:[...document.querySelectorAll('[data-slot="dialog-content"]')].map(n=>getComputedStyle(n).visibility+'/'+getComputedStyle(n).opacity)}))}))}
 for(let i=0;i<60;i++){const list=await page.evaluate(()=>window.desktop.prompts());if(process.env.DEBUG_PROMPTS)console.log(JSON.stringify({t:i,prompts:list.map(x=>[x.id.slice(0,8),x.title])}));if(list.length===1&&list[0].id!==firstId)break;await page.waitForTimeout(500)}
 p=await expectPrompt('尚不能关闭',['取消关闭','导出草稿','重试']);results.push({id:'RPE-03a',choice:'导出草稿',askedAgain:true})
 await p.getByRole('button',{name:'重试',exact:true}).click()
 p=await expectPrompt('尚不能关闭',['取消关闭','导出草稿','重试']);results.push({id:'RPE-03b',choice:'重试',stillFailing:true,askedAgain:true})

 // RPE-05: Escape is the cancel choice.
 await page.keyboard.press('Escape');await stillOpen('escape');results.push({id:'RPE-05',key:'Escape',windowKept:true})

 // RPE-03c: with saving working again, stop the running task from the prompt and the window closes.
 await setDrop(false);await busy();await closeWindow()
 p=await expectPrompt('仍有创作任务运行',['取消关闭','停止任务并继续'])
 await p.getByRole('button',{name:'停止任务并继续',exact:true}).click()
 for(let i=0;i<150&&await windows().catch(()=>0);i++)await new Promise(done=>setTimeout(done,200))
 assert.equal(await windows(),0,'window closed after stopping tasks');results.push({id:'RPE-03c',choice:'停止任务并继续',windowClosed:true})

 // RPE-06
 const native=await app.evaluate(()=>globalThis.__native)
 assert.equal(native.messageBoxes,0);assert.equal(native.errorBoxes,0)
 console.log(JSON.stringify({result:'PASS',checks:results,nativeMessageBoxes:native.messageBoxes,nativeErrorBoxes:native.errorBoxes,isolatedRoot:true}))
}finally{
 for(const res of held)res.destroy()
 app?.process().kill('SIGKILL');server.closeAllConnections();await new Promise(done=>server.close(()=>done()));await rm(directory,{recursive:true,force:true})
}
