// IA-R01..R03: real Electron, real NovelImportController and React dialog, isolated data root,
// synthetic .txt source. Only the native open dialog is replaced (it cannot be automated).
import {_electron} from 'playwright-core'
import assert from 'node:assert/strict'
import {mkdtemp,mkdir,writeFile,readdir,realpath,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {execFileSync} from 'node:child_process'

const directory=await realpath(await mkdtemp(join(tmpdir(),'shakeink-import-abandon-'))),dataRoot=join(directory,'data'),sources=join(directory,'sources')
await mkdir(sources);await writeFile(join(sources,'合成正文.txt'),'第一章 渡口\n\n林舟十七岁，来到渡口。\n\n第二章 归来\n\n许宁归来了。\n')
execFileSync(process.execPath,['--import','tsx',resolve('scripts/seed-import-abandon.ts'),directory],{stdio:'pipe'})
const imports=join(dataRoot,'novel-imports'),results=[]
const drafts=async()=>{try{return (await readdir(imports)).filter(name=>/^[0-9a-f-]{36}$/u.test(name))}catch(error){if(error.code==='ENOENT')return [];throw error}}
const env={...process.env,SHAKEINK_TEST_ROOT:dataRoot};delete env.ELECTRON_RUN_AS_NODE

async function launch(){
 const app=await _electron.launch({args:[resolve('.')],env,timeout:90000}),page=await app.firstWindow({timeout:90000});page.setDefaultTimeout(20000)
 assert.equal(await app.evaluate(()=>process.env.SHAKEINK_TEST_ROOT),dataRoot,'isolated root in use')
 await app.evaluate(({dialog},path)=>{globalThis.__picks=0;dialog.showOpenDialog=async()=>{globalThis.__picks++;return {canceled:false,filePaths:[path]}}},join(sources,'合成正文.txt'))
 // Zero models by design: decline the model prompt so the workbench is reachable.
 const later=page.getByRole('button',{name:'暂不配置',exact:true});await later.waitFor({timeout:15000}).then(()=>later.click(),()=>undefined)
 await page.getByRole('button',{name:'导入作品',exact:true}).waitFor()
 return {app,page,picks:()=>app.evaluate(()=>globalThis.__picks)}
}
async function startImport(page){await page.getByRole('button',{name:'导入作品',exact:true}).click();const d=page.getByRole('dialog');await d.waitFor();await d.getByText('合成正文.txt').first().waitFor();return d}
const record=(id,details)=>{results.push({id,...details});console.log(JSON.stringify({id,...details}))}

let session
try{
 // IA-R01: Esc on a started import deletes its draft on disk.
 session=await launch();let d=await startImport(session.page);const first=await drafts();assert.equal(first.length,1,'a draft directory exists while importing')
 await session.page.keyboard.press('Escape');await d.waitFor({state:'hidden'});await session.page.waitForFunction(()=>true);for(let i=0;i<50&&(await drafts()).length;i++)await new Promise(r=>setTimeout(r,100))
 assert.deepEqual(await drafts(),[]);record('IA-R01',{draftWhileImporting:first[0],afterEscape:await drafts()})

 // IA-R02: quit mid-import, relaunch, and the next import is brand new.
 d=await startImport(session.page);const beforeQuit=await drafts();assert.equal(beforeQuit.length,1)
 await session.app.close();session=undefined;const afterQuit=await drafts()
 session=await launch();const afterRelaunch=await drafts();assert.deepEqual(afterRelaunch,[],'no unsaved draft after restart')
 assert.equal(await session.page.locator('.ni-task-button').count(),0,'no task bar entry for an old import')
 d=await startImport(session.page);const fresh=await drafts();assert.equal(await session.picks(),1,'the picker opened for a new import');assert.equal(fresh.length,1);assert.notEqual(fresh[0],beforeQuit[0])
 record('IA-R02',{beforeQuit:beforeQuit[0],afterQuit,afterRelaunch,newDraft:fresh[0],picks:await session.picks()})

 // IA-R03: clicking 导入作品 while importing asks; confirming deletes the old draft and starts a new one.
 await session.page.getByRole('button',{name:'导入作品',exact:true}).click({force:true}).catch(async()=>{await session.page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent?.trim()==='导入作品')?.click())})
 await d.getByRole('heading',{name:'开始新的导入？',exact:true}).waitFor();await d.getByRole('button',{name:'删除并重新选择',exact:true}).click()
 for(let i=0;i<50&&((await drafts()).includes(fresh[0])||(await drafts()).length!==1);i++)await new Promise(r=>setTimeout(r,100))
 const replaced=await drafts();assert.equal(replaced.length,1);assert.notEqual(replaced[0],fresh[0]);assert.equal(await session.picks(),2)
 record('IA-R03',{oldDraft:fresh[0],newDraft:replaced[0],picks:await session.picks()})
 console.log('IA-R PASS',results.length)
}finally{await session?.app.close().catch(()=>undefined);await rm(directory,{recursive:true,force:true})}
