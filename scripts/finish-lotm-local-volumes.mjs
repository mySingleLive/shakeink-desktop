import {_electron as electron} from 'playwright'
import {expect} from '@playwright/test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {join,resolve} from 'node:path'

const repo=resolve('.'),root='/private/tmp/shakeink-lotm-local-20261028',appRoot='/private/tmp/shakeink-lotm-runtime-20261027/app-data',evidence=join(root,(process.env.LOTM_EVIDENCE_LABEL??'volume-complete')+'-evidence')
const run=JSON.parse(await readFile(join(root,'run.json'),'utf8')),expected=JSON.parse(await readFile(join(root,'expected-chapters.json'),'utf8')),targets=['outline','theme','style','character','item','scene','world','foreshadow','trope','worldline','narrative']
await mkdir(evidence,{recursive:true})
const save=async(name,value)=>writeFile(join(evidence,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'}),stage=async(name,details={})=>{await writeFile(join(root,'volume-stage.json'),JSON.stringify({name,...details},null,2)+'\n');console.log(JSON.stringify({name,...details}))}
let app,page
const current=()=>page.evaluate(()=>window.desktop.novelImport({type:'current'})),screenshot=name=>page.screenshot({path:join(evidence,name+'.png')})
try{
 app=await electron.launch({args:[repo],env:{...process.env,SHAKEINK_TEST_ROOT:appRoot},timeout:60000})
 app.process().stderr.on('data',bytes=>process.stderr.write(bytes))
 page=await app.firstWindow({timeout:60000});page.setDefaultTimeout(60000)
 const errors=[];page.on('pageerror',error=>errors.push(error.message))
 await app.evaluate(({app,BrowserWindow})=>{app.focus({steal:true});BrowserWindow.getAllWindows()[0].show();BrowserWindow.getAllWindows()[0].focus()})
 await page.getByRole('button',{name:'导入作品',exact:true}).waitFor({timeout:60000})
 let view=(await current()).view;assert.ok(view);assert.deepEqual(view.selected,['body']);assert.deepEqual([...view.targets].sort(),[...targets].sort());assert.equal(view.chapters.length,1394)
 const journalPath=join(appRoot,'novel-imports',view.id,'session.json'),before=JSON.parse(await readFile(journalPath,'utf8')),body=before.units.filter(u=>u.kind==='body').map(u=>u.text).join('')
 assert.equal(createHash('sha256').update(body).digest('hex'),run.expectedBodySha256);assert.equal(before.artifacts.length,0);assert.deepEqual(before.coverage,{});assert.equal(before.publication,undefined);assert.ok(before.units.every(u=>u.kind!=='unknown'))
 await save('before-chapters.json',{sessionId:view.id,revision:view.revision,selected:view.selected,targets:view.targets,bodySha256:run.expectedBodySha256,chapters:view.chapters.length})
 await page.locator('.ni-task-button').click()
 for(let step=0;step<3;step++){
  const continueButton=page.getByRole('button',{name:'继续导入',exact:true}),select=page.getByRole('heading',{name:'选择内容',exact:true}),source=page.getByRole('heading',{name:'核对来源',exact:true})
  await expect.poll(async()=>await continueButton.isVisible()&&await continueButton.isEnabled()?'continue':await select.isVisible()?'select':await source.isVisible()?'source':'',{timeout:60000}).not.toBe('')
  if(await continueButton.isVisible()&&await continueButton.isEnabled()){await continueButton.click();continue}
  if(await select.isVisible()){await page.getByRole('button',{name:'返回来源',exact:true}).click();continue}
  break
 }
 await page.getByRole('heading',{name:'核对来源',exact:true}).waitFor();await page.getByRole('button',{name:'核对卷章',exact:true}).click()
 await page.getByLabel('第 1354 章卷名',{exact:true}).fill('愚者')
 for(const chapter of expected.slice(1394)){
  await page.getByRole('button',{name:'添加章节起点',exact:true}).click()
  await page.getByLabel(`第 ${chapter.index} 章起点`,{exact:true}).fill(String(chapter.start))
  await page.getByLabel(`第 ${chapter.index} 章标题`,{exact:true}).fill(chapter.title)
  if(chapter.index===1395)await page.getByLabel('第 1395 章卷名',{exact:true}).fill('番外')
 }
 await screenshot('before-submit')
 await page.getByRole('button',{name:'确认卷章边界',exact:true}).click()
 await expect.poll(async()=>((await current()).view?.chapters.length??0),{timeout:60000}).toBe(1402)
 view=(await current()).view
 const groups=[];for(const chapter of view.chapters){const previous=groups.at(-1);if(previous&&previous.name===chapter.volume)previous.count++;else groups.push({name:chapter.volume,count:1})}
 assert.deepEqual(groups.map(g=>g.name),run.volumeNames);assert.deepEqual(groups.map(g=>g.count),run.volumeChapterCounts)
 const after=JSON.parse(await readFile(journalPath,'utf8'));assert.equal(after.chapters.map(c=>c.content).join(''),body);assert.equal(after.artifacts.length,0);assert.deepEqual(after.coverage,{});assert.equal(after.publication,undefined)
 await save('green.json',{sessionId:view.id,createdAt:after.createdAt,revision:view.revision,groups,bodySha256:createHash('sha256').update(after.chapters.map(c=>c.content).join('')).digest('hex'),selected:after.selected,targets:after.targets,sourceSha256:after.files[0].hash})
 await page.getByRole('button',{name:'核对卷章',exact:true}).click();await screenshot('green')
 await stage('volume-green',{sessionId:view.id,groups})
 const exited=new Promise(resolveExit=>app.process().once('exit',(code,signal)=>resolveExit({code,signal})));await app.evaluate(({app})=>app.quit());const exit=await exited;app=null;await save('exit.json',exit)
 assert.deepEqual(errors,[])
}catch(error){
 await stage('volume-driver-failed',{error:String(error?.stack??error)});if(page)await screenshot('failure').catch(()=>{});throw error
}finally{if(app)await app.close().catch(()=>{})}
