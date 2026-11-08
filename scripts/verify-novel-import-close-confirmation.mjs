import {_electron} from 'playwright-core'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {mkdtemp,mkdir,readFile,readdir,realpath,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {execFileSync} from 'node:child_process'

const source='/Users/dt_flys/Documents/拆书/诡秘之主-原始文本.txt'
const directory=await realpath(await mkdtemp(join(tmpdir(),'shakeink-import-abandon-')))
const dataRoot=join(directory,'data'),target=join(directory,'target'),imports=join(dataRoot,'novel-imports')
await mkdir(target)
execFileSync(process.execPath,['--import','tsx',resolve('scripts/seed-import-abandon.ts'),directory],{stdio:'pipe'})
const hash=async()=>createHash('sha256').update(await readFile(source)).digest('hex')
const sourceHash=await hash()
const drafts=async()=>{try{return (await readdir(imports)).filter(name=>/^[0-9a-f-]{36}$/u.test(name))}catch(error){if(error.code==='ENOENT')return [];throw error}}
const env={...process.env,SHAKEINK_TEST_ROOT:dataRoot};delete env.ELECTRON_RUN_AS_NODE
let app
try{
 app=await _electron.launch({args:[resolve('.')],env,timeout:90000})
 const page=await app.firstWindow({timeout:90000});page.setDefaultTimeout(120000)
 assert.equal(await app.evaluate(()=>process.env.SHAKEINK_TEST_ROOT),dataRoot)
 await app.evaluate(({dialog},paths)=>{dialog.showOpenDialog=async(...args)=>{const options=args.at(-1);return {canceled:false,filePaths:[options?.properties?.includes('openFile')?paths.source:paths.target]}}},{source,target})
 const later=page.getByRole('button',{name:'暂不配置',exact:true});await later.waitFor({timeout:15000}).then(()=>later.click(),()=>undefined)
 await page.getByRole('button',{name:'导入作品',exact:true}).click()
 const main=page.locator('.ni-dialog'),confirm=page.getByRole('dialog',{name:'关闭导入？',exact:true})
 const current=async()=>(await page.evaluate(()=>window.desktop.novelImport({type:'current'}))).view
 const until=async(test,timeout=240000)=>{const end=Date.now()+timeout;let last='';for(;;){const view=await current(),alerts=await main.locator('.ni-alert').allInnerTexts();if(alerts.length)throw Error('import action failed: '+alerts.join(' | '));const brief=view?{revision:view.revision,phase:view.phase,step:view.wizard?.step,state:view.wizard?.stepState?.[view.wizard.step],selected:view.selected,targets:view.targets,infer:view.infer,error:view.error,stepError:view.wizard?.stepError,lineProgress:view.wizard?.lineProgress,checks:view.wizard?.checks?.map(check=>({key:check.key,ok:check.ok}))}:null,signature=JSON.stringify(brief);if(signature!==last){last=signature;console.log(JSON.stringify({state:brief}))}if(test(view))return view;if(Date.now()>end)throw Error('timed out waiting for import state: '+signature);await page.waitForTimeout(100)}}
 await main.getByText('诡秘之主-原始文本.txt',{exact:true}).waitFor()
 await main.getByRole('button',{name:'继续',exact:true}).click()
 await main.getByRole('button',{name:'选择目录',exact:true}).click()
 await main.getByRole('button',{name:'继续',exact:true}).click()
 await page.evaluate(async()=>{const view=(await window.desktop.novelImport({type:'current'})).view;await window.desktop.novelImport({type:'select',id:view.id,revision:view.revision,selected:['body','outline'],targets:[],infer:false})})
 await until(view=>!!view&&!view.infer&&view.targets.length===0)
 await main.getByRole('button',{name:'识别卷章',exact:true}).click()
 const tree=await until(view=>view?.wizard?.step==='tree'&&view.wizard.stepState.tree==='waiting')
 const structure=tree.wizard.structure
 assert.ok(structure.length>=10&&structure.slice(0,10).every(chapter=>chapter.volume===structure[0].volume))
 await main.getByRole('button',{name:'全不选',exact:true}).click()
 await until(view=>view?.wizard?.chapterSelection?.length===0)
 const chapters=main.locator('.ni-w-ch input')
 for(let i=0;i<10;i++){await chapters.nth(i).click();await until(view=>view?.wizard?.chapterSelection?.length===i+1)}
 await main.getByRole('button',{name:'开始导入',exact:true}).click()
 const view=await until(view=>view?.wizard?.step==='verify'&&view.wizard.stepState.verify==='waiting'&&view.wizard.checks?.length===8)
 const before={id:view.id,phase:view.phase,step:view.wizard.step,selected:view.selected,completedSteps:Object.entries(view.wizard.stepState).filter(([,state])=>state==='done').map(([step])=>step)}
 assert.ok(before.completedSteps.includes('import-body'),JSON.stringify(before))
 const session=JSON.parse(await readFile(join(imports,before.id,'session.json'),'utf8'))
 assert.equal(session.chapters.length,10);assert.deepEqual(session.wizard.grantedChapters,Array.from({length:10},(_,i)=>i))
 assert.deepEqual(await drafts(),[before.id])

 await main.getByRole('button',{name:'关闭导入窗口',exact:true}).click()
 await confirm.waitFor()
 assert.match(await confirm.innerText(),/已导入的内容会被删除/)
 assert.deepEqual(await drafts(),[before.id])
 await confirm.getByRole('button',{name:'继续导入',exact:true}).click()
 await confirm.waitFor({state:'hidden'})
 const continued=await current()
 assert.equal(continued.id,before.id)
 assert.equal(continued.wizard.step,'verify')
 assert.deepEqual(await drafts(),[before.id])

 await page.keyboard.press('Escape')
 await confirm.waitFor()
 await confirm.getByRole('button',{name:'确认关闭并删除',exact:true}).click()
 await confirm.waitFor({state:'hidden'})
 await main.waitFor({state:'hidden'})
 await until(view=>!view)
 for(let i=0;i<100&&(await drafts()).length;i++)await page.waitForTimeout(100)
 assert.deepEqual(await drafts(),[])
 assert.equal(await hash(),sourceHash)
 assert.equal(await current(),null)
 console.log(JSON.stringify({id:'NICC-R01',result:'PASS',sourceBytes:(await readFile(source)).byteLength,chapters:session.chapters.length,firstVolumeOnly:true,completedSteps:before.completedSteps,continuedSameDraft:true,confirmedDeletion:true,sourceUnchanged:true,isolatedRoot:true}))
}finally{
 await app?.close().catch(()=>undefined)
 await rm(directory,{recursive:true,force:true})
}
