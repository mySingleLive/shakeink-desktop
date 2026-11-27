// WMR-01..05 real-target acceptance (docs/609): built Electron, isolated SHAKEINK_TEST_ROOT, zero models,
// no network. The work is created through the real POST /api/novels path; only the native folder picker and
// the native save dialog are replaced so they point into the isolated directory. Everything else is the real app.
import {_electron} from 'playwright-core'
import assert from 'node:assert/strict'
import {mkdtemp,mkdir,readFile,readdir,realpath,rm,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {execFileSync} from 'node:child_process'

const directory=await realpath(await mkdtemp(join(tmpdir(),'shakeink-work-menu-'))),dataRoot=join(directory,'data'),exports=join(directory,'导出')
const evidence=resolve(process.env.WM_EVIDENCE??'docs/609-work-menu-items-evidence');await mkdir(evidence,{recursive:true});await mkdir(exports)
// The chapter is seeded directly: 大纲 is a read-only projection of 叙事线 in the app, so it cannot be typed in through the outline API.
const {novelId}=JSON.parse(execFileSync(process.execPath,['--import','tsx',resolve('scripts/seed-work-menu-items.ts'),directory],{stdio:['ignore','pipe','inherit']}).toString().trim().split('\n').at(-1))
const results=[],scrub=text=>String(text).replaceAll(directory,'<isolated>')
const env={...process.env,SHAKEINK_TEST_ROOT:dataRoot};delete env.ELECTRON_RUN_AS_NODE
const record=(id,ok,details={})=>{results.push({id,ok,...details});console.log(`${ok?'PASS':'FAIL'} ${id} ${scrub(JSON.stringify(details))}`);assert.ok(ok,id)}
const MENU=['重命名','编辑','创建角色','创建物品','创建场景','创建情景','创建世界','创建伏笔','导出大纲','导出正文','删除']
const TITLE='菜单验收作品',CONTENT_END='WMR 第一章终点',OUTLINE_END='WMR 第一章大纲终点'

let app
try{
 app=await _electron.launch({args:[resolve('.')],env,timeout:90000});const page=await app.firstWindow({timeout:90000});page.setDefaultTimeout(20000)
 app.process().stderr?.on('data',chunk=>process.stderr.write('[app] '+scrub(chunk)))
 assert.equal(await app.evaluate(()=>process.env.SHAKEINK_TEST_ROOT),dataRoot,'isolated root in use')
 await app.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows()[0];win.setBounds({x:120,y:60,width:1280,height:860});win.focus()})
 await app.evaluate(({dialog})=>{dialog.showSaveDialog=async(_w,options)=>({canceled:false,filePath:globalThis.__saveDir+'/'+(options?.defaultPath??'export')})},)
 await app.evaluate((_,dir)=>{globalThis.__saveDir=dir},exports)
 const later=page.getByRole('button',{name:'暂不配置',exact:true});await later.waitFor({timeout:15000}).then(()=>later.click(),()=>undefined)
 const api=(path,method='GET',body)=>page.evaluate(async([path,method,body])=>{const r=await fetch(path,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json().catch(()=>null)}},[path,method,body])
 const models=await api('/api/models');record('WMR-00 isolated root and zero models',models.status===200&&models.body.models.length===0,{models:models.body.models.length})

 // Seeded chapter must be readable through the real app before exporting.
 const outline=await api(`/api/novels/${novelId}/outline`),seeded=outline.body?.volumes?.[0]?.chapters?.[0]
 const stored=seeded&&await api(`/api/novels/${novelId}/chapters/${seeded.id}`)
 assert.ok(stored?.body?.chapter?.content.includes(CONTENT_END)&&stored.body.chapter.outline.includes(OUTLINE_END),'seeded chapter text readable: '+scrub(JSON.stringify(outline.body)).slice(0,300))
 const row=page.locator('.sidebar-navigation .tree-row',{hasText:TITLE}).first();await row.waitFor()
 const menu=page.getByRole('menu').first(),items=async()=>(await menu.getByRole('menuitem').allInnerTexts()).map(t=>t.trim())
 const settle=()=>page.waitForFunction(()=>document.getAnimations().every(a=>a.playState!=='running')).then(()=>page.waitForTimeout(200))
 const inWindow=async()=>{const box=await menu.boundingBox(),size=await page.evaluate(()=>[innerWidth,innerHeight]);return !!box&&box.y>=0&&box.x>=0&&box.y+box.height<=size[1]&&box.x+box.width<=size[0]}
 const closeAll=async()=>{for(let i=0;i<3&&await page.getByRole('menu').count();i++){await page.keyboard.press('Escape');await page.waitForTimeout(80)}}
 const openDots=async()=>{await row.hover();await row.getByRole('button',{name:'小说操作',exact:true}).click();await menu.waitFor()}
 const openContext=async()=>{await row.click({button:'right'});await menu.waitFor()}
 const choose=async name=>{await openDots();await menu.getByRole('menuitem',{name,exact:true}).click();await menu.waitFor({state:'detached'})}
 const activeTab=()=>page.evaluate(()=>document.querySelector('[role=tablist][aria-label="内容标签"] [role=tab][aria-selected=true]')?.getAttribute('aria-label')??'')

 // WMR-01: both menus, both fully inside the window.
 await openDots();await settle();const dots=await items(),dotsFit=await inWindow();await page.screenshot({path:join(evidence,'wmr-01-dots-menu.png')});await closeAll()
 await openContext();await settle();const ctx=await items(),ctxFit=await inWindow();await page.screenshot({path:join(evidence,'wmr-01-context-menu.png')});await closeAll()
 record('WMR-01 … and right-click menus list the 609 items in order and fit the window',JSON.stringify(dots)===JSON.stringify(MENU)&&JSON.stringify(ctx)===JSON.stringify(MENU)&&dotsFit&&ctxFit,{dots,ctx,dotsFit,ctxFit})

 // WMR-01b: at the minimum window height (580), a work row at the very bottom of the window still gets
 // menus that fit, and 删除 is clicked for real (the dialog then opens and is cancelled). A second work is
 // created through the real POST /api/novels; only the folder picker is stubbed.
 const bottomFolder=join(directory,'作品','底部作品');await mkdir(bottomFolder,{recursive:true})
 await app.evaluate(({dialog},path)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]})},bottomFolder)
 const second=await api('/api/novels','POST',{title:'底部作品',requestId:crypto.randomUUID()});assert.equal(second.status,201,JSON.stringify(second))
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('desktop:event',{type:'command',id:'works.refresh'}))
 const bottomRow=page.locator('.sidebar-navigation .tree-row',{hasText:'底部作品'}).first();await bottomRow.waitFor()
 // Collapse both works so 底部作品 or 菜单验收作品 is the last row, then shrink the window and scroll to the end.
 for(const r of [row,bottomRow]){const toggle=r.getByRole('button',{name:'收起',exact:true});if(await toggle.count())await toggle.click()}
 await app.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows()[0];win.setBounds({x:120,y:60,width:1280,height:580})});await page.waitForTimeout(400)
 const lastWork=page.locator('.sidebar-navigation [data-work-row] .tree-row').last();await lastWork.scrollIntoViewIfNeeded()
 const lastTitle=(await lastWork.innerText()).trim(),winH=await page.evaluate(()=>innerHeight)
 // Grow the gap above it with the 设定 etc. rows of the other work, so the row sits near the window bottom.
 const other=lastTitle.includes('底部作品')?row:bottomRow;const expand=other.getByRole('button',{name:'展开',exact:true});if(await expand.count())await expand.click()
 await page.waitForTimeout(200);await lastWork.scrollIntoViewIfNeeded();await page.waitForTimeout(200)
 const lastBox=await lastWork.boundingBox()
 const fits=[]
 for(const how of ['dots','context']){
  if(how==='dots'){await lastWork.hover();await lastWork.getByRole('button',{name:'小说操作',exact:true}).click()}else await lastWork.click({button:'right',position:{x:20,y:Math.max(2,lastBox.height-2)}})
  await menu.waitFor();await settle();fits.push(await inWindow());if(how==='context')await page.screenshot({path:join(evidence,'wmr-01-context-menu-bottom.png')})
  if(how==='context'){await menu.getByRole('menuitem',{name:'删除',exact:true}).click();const del=page.getByRole('dialog').filter({hasText:'是否同时删除磁盘上的作品文件？'});await del.waitFor();await del.getByRole('button',{name:'取消',exact:true}).click();await del.waitFor({state:'detached'})}
  else await closeAll()
 }
 record('WMR-01b at the minimum height a bottom work row gets … and right-click menus that fit, and 删除 clicks for real',fits.every(Boolean)&&lastBox.y+lastBox.height>winH-120,{winH,rowBottom:Math.round(lastBox.y+lastBox.height),lastTitle,fits})
 await app.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows()[0];win.setBounds({x:120,y:60,width:1280,height:860})});await page.waitForTimeout(400)
 for(const r of [row,bottomRow]){const toggle=r.getByRole('button',{name:'展开',exact:true});if(await toggle.count())await toggle.click()}

 // WMR-02: 编辑 opens 主题.
 await choose('编辑');await page.getByRole('tablist',{name:'内容标签'}).getByRole('tab',{name:/主题/}).first().waitFor();record('WMR-02 编辑 opens the 主题 tab',(await activeTab()).includes('主题'),{active:await activeTab()})

 // WMR-03: create character, item, foreshadow; records exist afterwards.
 await choose('创建角色');await page.getByText('已创建角色「新角色」，点击编辑资料').first().waitFor()
 await choose('创建物品');await page.getByText('已创建物品「新物品」，点击编辑资料').first().waitFor()
 await choose('创建伏笔');await page.getByText(/已创建伏笔「未命名伏笔 1」/).first().waitFor();await page.getByRole('tablist',{name:'内容标签'}).getByRole('tab',{name:/伏笔/}).first().waitFor()
 const chars=(await api(`/api/novels/${novelId}/characters`)).body.characters.map(c=>c.name),things=(await api(`/api/novels/${novelId}/items`)).body.items.map(i=>i.name),flags=(await api(`/api/novels/${novelId}/foreshadows`)).body.foreshadows.map(f=>f.title)
 record('WMR-03 创建角色/物品/伏笔 write records and open their tabs',chars.includes('新角色')&&things.includes('新物品')&&flags.includes('未命名伏笔 1')&&(await activeTab()).includes('伏笔'),{chars,things,flags})

 // WMR-04: scene and world through their name dialogs; scenario dialog opens and is cancelled.
 await choose('创建场景');let dialog=page.getByRole('dialog',{name:'创建根场景',exact:true});await dialog.waitFor()
 await dialog.getByRole('textbox').fill('验收场景');await dialog.getByRole('button',{name:'创建场景',exact:true}).click();await dialog.waitFor({state:'detached'})
 await choose('创建世界');dialog=page.getByRole('dialog',{name:'新建世界',exact:true});await dialog.waitFor()
 await dialog.getByRole('textbox').fill('验收世界');await dialog.getByRole('button',{name:'创建',exact:true}).click();await dialog.waitFor({state:'detached'})
 await page.getByRole('tablist',{name:'内容标签'}).getByRole('tab',{name:/验收世界/}).first().waitFor()
 await choose('创建情景');dialog=page.getByRole('dialog',{name:'新建情景试验场',exact:true});await dialog.waitFor();await settle()
 await page.screenshot({path:join(evidence,'wmr-04-scenario-dialog.png')});await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'})
 const scenes=(await api(`/api/novels/${novelId}/scenes`)).body.scenes.map(s=>s.name),worlds=(await api(`/api/novels/${novelId}/worlds`)).body.worlds.map(w=>w.name)
 record('WMR-04 创建场景/世界 write records; 创建情景 opens its dialog',scenes.includes('验收场景')&&worlds.includes('验收世界'),{scenes,worlds})

 // WMR-05: export body as Markdown from …, outline as TXT from right-click.
 await openDots();await menu.getByRole('menuitem',{name:'导出正文',exact:true}).hover();await page.getByRole('menuitem',{name:'Markdown (.md)',exact:true}).waitFor();await settle()
 await page.screenshot({path:join(evidence,'wmr-05-dots-export-submenu.png')});await page.getByRole('menuitem',{name:'Markdown (.md)',exact:true}).click()
 await page.getByText('导出文件已保存').first().waitFor()
 await openContext();await menu.getByRole('menuitem',{name:'导出大纲',exact:true}).hover();await page.getByRole('menuitem',{name:'TXT 文本 (.txt)',exact:true}).waitFor();await settle()
 await page.screenshot({path:join(evidence,'wmr-05-context-export-submenu.png')});await page.getByRole('menuitem',{name:'TXT 文本 (.txt)',exact:true}).click()
 await page.waitForFunction(()=>document.querySelectorAll('[data-sonner-toast]').length>=1)
 const deadline=Date.now()+20000;let files=[];while(Date.now()<deadline&&(files=await readdir(exports)).length<2)await page.waitForTimeout(200)
 const md=files.find(f=>f.endsWith('.md')),txt=files.find(f=>f.endsWith('.txt'))
 const mdText=md?await readFile(join(exports,md),'utf8'):'',txtText=txt?await readFile(join(exports,txt),'utf8'):''
 record('WMR-05 whole-book exports from … (正文 md) and right-click (大纲 txt) hold the right text',mdText.includes(CONTENT_END)&&txtText.includes(OUTLINE_END)&&!txtText.includes(CONTENT_END),{files})

 await writeFile(join(evidence,'real-target-report.json'),scrub(JSON.stringify({scope:`macOS ${process.arch} built Electron, isolated SHAKEINK_TEST_ROOT, zero models`,finishedAt:new Date().toISOString(),results},null,1))+'\n')
 console.log('WMR PASS',results.length)
}finally{await app?.close().catch(()=>undefined);await rm(directory,{recursive:true,force:true})}
