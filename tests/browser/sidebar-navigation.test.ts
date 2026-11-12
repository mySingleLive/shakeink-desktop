import assert from 'node:assert/strict'
import {test} from 'node:test'
import {chromium,type Browser} from 'playwright-core'
import {withSidebar} from '../helpers/sidebar-navigation-fixture'
let browser:Browser
test.before(async()=>{browser=await chromium.launch({headless:true,...(process.env.SHAKEINK_TEST_CHROMIUM?{executablePath:process.env.SHAKEINK_TEST_CHROMIUM}:{})})})
test.after(async()=>{await browser?.close()})

test('SN-01/03/05/08/16 real navigation has compact creation, brand and single-row entries',()=>withSidebar(browser,{},async page=>{
 const brand=page.getByText('玄印写作',{exact:true});assert.equal(await brand.count(),1)
 const create=page.getByRole('button',{name:'创建作品',exact:true}),chat=page.getByRole('button',{name:'新对话',exact:true})
 assert.equal((await create.boundingBox())?.height,32);assert.equal((await chat.boundingBox())?.height,32)
 assert.equal(await page.getByText('属性',{exact:true}).count(),0)
 for(const name of ['场景','情景试验场']){const rows=page.getByRole('button',{name,exact:true});assert.equal(await rows.count(),2);assert.equal(await rows.first().getByRole('button',{name:/展开|收起/}).count(),0)}
 assert.equal(await page.getByText('暂无场景',{exact:true}).count(),0);assert.equal(await page.getByText('暂无试验场',{exact:true}).count(),0)
}))
test('SN-09/10 category changes only real navigation and covers every work',()=>withSidebar(browser,{},async page=>{
 const snapshot=await page.evaluate(()=>{const s=(window as any).sidebarFixture.state();return{tabs:s.tabs.tabs,id:s.tabs.activeTabId,nonce:s.tabs.activationNonce,conversation:s.chat.conversationId}})
 const tabs=page.getByRole('tablist',{name:'导航分类'}).getByRole('tab');assert.equal(await tabs.count(),5)
 await page.getByRole('tab',{name:'角色',exact:true}).click()
 await page.getByText('林舟',{exact:true}).first().waitFor()
 assert.equal(await page.getByText('林舟',{exact:true}).count(),2);assert.equal(await page.getByText('过客',{exact:true}).count(),2)
 assert.equal(await page.getByText('世界线',{exact:true}).count(),0)
 await page.getByRole('tab',{name:'角色',exact:true}).press('ArrowRight');assert.equal(await page.getByRole('tab',{name:'正文',exact:true}).getAttribute('aria-selected'),'true')
 await page.getByText('第一卷',{exact:false}).first().waitFor()
 assert.equal(await page.getByText('第一卷',{exact:false}).count(),2)
 await page.getByRole('tab',{name:'对话',exact:true}).click();assert.equal(await page.getByText('甲会话',{exact:true}).count(),1);assert.equal(await page.getByText('乙会话',{exact:true}).count(),1);assert.equal(await page.getByText('未绑定指引',{exact:true}).count(),1)
 assert.deepEqual(await page.evaluate(()=>{const s=(window as any).sidebarFixture.state();return{tabs:s.tabs.tabs,id:s.tabs.activeTabId,nonce:s.tabs.activationNonce,conversation:s.chat.conversationId}}),snapshot)
}))

for(const theme of ['paper','ink'] as const)for(const width of [200,260,420])test('SN-02/04/06/11/13/14/16 geometry and semantic styles '+theme+' '+width,()=>withSidebar(browser,{theme,width,long:true},async page=>{
 const geometry=await page.locator('.sidebar-navigation').evaluate(el=>{
  const box=(selector:string)=>el.querySelector(selector)!.getBoundingClientRect().toJSON(),style=(selector:string)=>getComputedStyle(el.querySelector(selector)!)
  return{create:box('.create-action'),footer:box('.account-footer'),account:box('.account-button'),avatar:box('.account-button .avatar'),brand:box('.sidebar-brand'),logo:box('.brand-logo'),title:box('.brand-title'),tabs:box('.nav-tabs'),tree:box('.tree-scroll'),createFont:style('.create-action').fontSize,createLine:style('.create-action').lineHeight,titleFont:style('.brand-title').fontSize,titleLine:style('.brand-title').lineHeight,tabMarginTop:style('.nav-tabs').marginTop,tabMarginBottom:style('.nav-tabs').marginBottom,tabGroupBackground:style('.nav-tabs').backgroundColor,tabGroupBorder:style('.nav-tabs').borderTopWidth,tabRadius:style('.nav-tab').borderRadius}
 })
 assert.equal(geometry.footer.height,72);assert.equal(geometry.account.height,52);assert.equal(geometry.avatar.width,32);assert.equal(geometry.createFont,'14px');assert.equal(geometry.createLine,'20px');assert.equal(geometry.logo.width,30);assert.equal(geometry.titleFont,'17px');assert.equal(geometry.titleLine,'24px');assert.equal(geometry.create.y-(geometry.brand.y+geometry.brand.height),16);assert.equal(geometry.tabMarginTop,'16px');assert.equal(geometry.tabMarginBottom,'12px');assert.equal(geometry.tabRadius,'6px');assert.equal(geometry.tabGroupBackground,'rgba(0, 0, 0, 0)');assert.equal(geometry.tabGroupBorder,'0px');assert(geometry.tree.height>0)
 const selected=page.getByRole('tab',{name:'作品',exact:true}),unselected=page.getByRole('tab',{name:'角色',exact:true});await unselected.hover()
 assert.equal(await unselected.evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)')
 assert.equal(await selected.evaluate(el=>getComputedStyle(el).backgroundColor),theme==='paper'?'rgb(248, 243, 228)':'rgb(42, 40, 38)')
 const longLabel=page.locator('.tree-row .nav-label').filter({hasText:'用于隔离测试的非常长作品名称'}).first();await page.waitForFunction(()=>document.querySelector('.tree-row .nav-label[title^="用于隔离测试"]')?.getAttribute('data-overflow')==='true')
 assert.equal(await longLabel.evaluate(el=>getComputedStyle(el).textOverflow),'clip');assert.equal(await longLabel.evaluate(el=>getComputedStyle(el).whiteSpace),'nowrap');assert.match(await longLabel.evaluate(el=>getComputedStyle(el).maskImage),/24px/)
 const short=page.locator('.create-action .nav-label').first();assert.notEqual(await short.getAttribute('data-overflow'),'true');assert.equal(await short.evaluate(el=>getComputedStyle(el).maskImage),'none')
 await page.getByRole('tab',{name:'角色',exact:true}).click();await page.getByText('林舟',{exact:true}).first().waitFor()
 const roles=await page.locator('.tree-row[data-role]').evaluateAll(rows=>rows.filter(row=>row.querySelector('.role-tag')).map(row=>{const group=row.querySelector('.role-name-group')!,name=group.querySelector('.nav-label')!,badge=group.querySelector('.role-tag')!,icon=row.querySelector('.nav-node-icon,.character-letter')!;return{role:row.getAttribute('data-role'),gap:badge.getBoundingClientRect().left-name.getBoundingClientRect().right,iconColor:getComputedStyle(icon).color,badgeColor:getComputedStyle(badge).color}}))
 assert(roles.length>=8);assert(roles.every(row=>Math.abs(row.gap-6)<.2&&row.iconColor===row.badgeColor));assert.equal(new Set(roles.map(row=>row.badgeColor)).size,4)
}))

test('SN-13 settings adds six original entries for all works and switching triggers no scenario query',()=>withSidebar(browser,{},async page=>{
 await page.getByRole('tab',{name:'设定',exact:true}).click()
 for(const name of ['物品','情景试验场','场景','世界线','叙事线','大纲'])assert.equal(await page.getByText(name,{exact:true}).count(),2)
 assert.equal(await page.getByText('创作进度',{exact:true}).count(),0)
 assert.equal(await page.evaluate(()=>(window as any).sidebarFixture.requests.filter((r:any)=>r.path.endsWith('/scenarios')).length),0)
 await page.getByRole('button',{name:'场景',exact:true}).first().press('Enter')
 assert.equal(await page.evaluate(()=>(window as any).sidebarFixture.state().tabs.tabs.at(-1).type),'scenes')
}))

test('SN-15 work disclosure preserves each view and its original manuscript menu',()=>withSidebar(browser,{},async page=>{
 await page.getByRole('tab',{name:'正文',exact:true}).click();await page.getByText('第一卷',{exact:false}).first().waitFor()
 const group=page.locator('.nav-work-group').first(),header=group.locator('.nav-group-toggle');const bodyId=await header.getAttribute('aria-controls');assert(bodyId)
 await header.press('Space');assert.equal(await header.getAttribute('aria-expanded'),'false');assert.equal(await page.locator('[id="'+bodyId+'"]').getAttribute('hidden'),'');assert.equal(await page.locator('[id="'+bodyId+'"]').getAttribute('inert'),'')
 const menu=group.getByRole('button',{name:'正文导航功能菜单',exact:true});await menu.click();await page.getByRole('menuitem',{name:'添加卷',exact:true}).waitFor();await page.keyboard.press('Escape')
 assert.equal(await header.getAttribute('aria-expanded'),'false')
 await page.getByRole('tab',{name:'角色',exact:true}).click();assert.equal(await page.locator('.nav-group-toggle').first().getAttribute('aria-expanded'),'true')
 await page.getByRole('tab',{name:'正文',exact:true}).click();assert.equal(await page.locator('.nav-group-toggle').first().getAttribute('aria-expanded'),'false')
 await page.locator('.nav-group-toggle').first().press('Enter');await page.getByText('第一卷',{exact:false}).first().waitFor();assert.equal(await page.locator('.nav-group-toggle').first().getAttribute('aria-expanded'),'true')
}))

test('SN-10 one failed character source retains formal characters and retry instead of false empty',()=>withSidebar(browser,{},async page=>{
 await page.evaluate(()=>{const f=(window as any).sidebarFixture;f.failures['/api/novels/isolated-a/foreshadow-characters']='隔离伏笔加载失败';return f.query.invalidateQueries({queryKey:['foreshadow-characters','isolated-a']})})
 await page.getByRole('tab',{name:'角色',exact:true}).click();await page.getByText('林舟',{exact:true}).first().waitFor()
 assert.equal(await page.getByText('林舟',{exact:true}).count(),2);assert.equal(await page.getByText('暂无角色',{exact:true}).count(),0)
 assert(await page.getByRole('alert').count()>=1);assert(await page.getByRole('button',{name:/重试|重新加载/}).count()>=1)
}))

test('SN-05 one scenario modal preserves cancellation focus and reports real query errors',()=>withSidebar(browser,{},async page=>{
 const launcher=page.getByRole('button',{name:'情景试验场',exact:true}).first();await launcher.click()
 let dialog=page.getByRole('dialog',{name:'情景试验场',exact:true});await dialog.getByText('暂无试验场',{exact:true}).waitFor()
 await dialog.getByRole('button',{name:'新建情景试验场',exact:true}).click();await page.getByRole('dialog',{name:'新建情景试验场',exact:true}).waitFor();assert.equal(await page.getByRole('dialog').count(),1)
 await page.getByRole('button',{name:'取消',exact:true}).click();dialog=page.getByRole('dialog',{name:'情景试验场',exact:true});await dialog.waitFor();await page.waitForFunction(()=>document.activeElement?.textContent?.includes('新建情景试验场'))
 await dialog.getByRole('button',{name:'关闭',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(await launcher.evaluate(el=>el===document.activeElement),true)
 await page.evaluate(()=>{const f=(window as any).sidebarFixture;f.failures['/api/novels/isolated-a/scenarios']='隔离列表读取失败';f.query.removeQueries({queryKey:['scenarios','isolated-a']})})
 await launcher.click();await page.getByRole('dialog').getByRole('alert').waitFor();assert.match(await page.getByRole('dialog').getByRole('alert').innerText(),/隔离列表读取失败/);assert.equal(await page.getByText('暂无试验场',{exact:true}).count(),0)
}))

test('SN-05 successful creation with rejected leave is listed once and can retry opening without another POST',()=>withSidebar(browser,{},async page=>{
 await page.evaluate(()=>(window as any).sidebarFixture.guard('reject'))
 await page.getByRole('button',{name:'新建情景试验场',exact:true}).first().click()
 const create=page.getByRole('dialog',{name:'新建情景试验场',exact:true});await create.getByRole('textbox').fill('只创建一次的隔离试验场');await create.getByRole('button',{name:'创建',exact:true}).click()
 const library=page.getByRole('dialog',{name:'情景试验场',exact:true});await library.getByRole('alert').waitFor();assert.match(await library.getByRole('alert').innerText(),/隔离场景草稿尚未保存/)
 assert.equal(await library.getByRole('button',{name:'只创建一次的隔离试验场',exact:true}).count(),1)
 assert.equal(await page.evaluate(()=>(window as any).sidebarFixture.requests.filter((r:any)=>r.method==='POST'&&r.path.endsWith('/scenarios')).length),1)
 await page.evaluate(()=>(window as any).sidebarFixture.clearGuard());await library.getByRole('button',{name:'只创建一次的隔离试验场',exact:true}).click();await library.waitFor({state:'hidden'})
 assert.equal(await page.evaluate(()=>(window as any).sidebarFixture.state().tabs.tabs.at(-1).type),'scenario')
 assert.equal(await page.evaluate(()=>(window as any).sidebarFixture.requests.filter((r:any)=>r.method==='POST'&&r.path.endsWith('/scenarios')).length),1)
}))

test('SN-05 cancel a pending leave immediately dismisses the modal and late completion cannot activate',()=>withSidebar(browser,{},async page=>{
 await page.evaluate(()=>{const f=(window as any).sidebarFixture;f.data['/api/novels/isolated-a/scenarios']={scenarios:[{id:'s1',novelId:'isolated-a',title:'挂起试验场',status:'CONFIGURING',turnCount:0,nodeCount:0}]};f.guard('pending')})
 await page.getByRole('button',{name:'情景试验场',exact:true}).first().click();const dialog=page.getByRole('dialog',{name:'情景试验场',exact:true});await dialog.getByRole('button',{name:'挂起试验场',exact:true}).click();await dialog.getByText('正在打开…',{exact:true}).waitFor()
 await dialog.getByRole('button',{name:'关闭',exact:true}).click();await dialog.waitFor({state:'hidden'});await page.evaluate(()=>(window as any).sidebarFixture.finishGuard())
 assert.equal(await page.evaluate(()=>(window as any).sidebarFixture.state().tabs.activeTabId),'kept');assert.equal(await page.evaluate(()=>(window as any).sidebarFixture.state().tabs.tabs.length),1)
}))

test('SN-15 unavailable repairs retain one flight across category changes and folding',()=>withSidebar(browser,{},async page=>{
 await page.evaluate(()=>{const f=(window as any).sidebarFixture;let count=0;(window as any).desktop={repairWorkLease:async()=>{count++;return new Promise(()=>{})}};f.repairCount=()=>count;f.query.setQueryData(['novels'],{...f.data['/api/novels'],unavailableWorks:[{workId:'bad-a',novelId:'bad-a-novel',title:'不可用甲',reason:'stale-lease'},{workId:'bad-b',novelId:'bad-b-novel',title:'不可用乙',reason:'stale-lease'}]})})
 // WN-60: the repair flight lives in SidebarTree, so menus, views and folding share it.
 const row=(title:string)=>page.locator('.tree-row',{hasText:title}),menu=page.locator('[role=menu][data-open]')
 const repairItem=(name:string)=>page.locator('[role=menu][data-open]').getByRole('menuitem',{name,exact:true})
 await row('不可用甲').click();await menu.waitFor();await repairItem('修复作品锁').click();await page.waitForFunction(()=>!document.querySelector('[role=menu]'))
 await row('不可用乙').click();await menu.waitFor();assert.equal(await repairItem('正在准备修复…').isDisabled(),true);await page.keyboard.press('Escape')
 await page.getByRole('tab',{name:'角色',exact:true}).click()
 const group=(title:string)=>page.locator('.nav-work-group',{hasText:title})
 for(const title of ['不可用甲','不可用乙']){await group(title).getByRole('button',{name:'作品操作',exact:true}).click();await menu.waitFor();assert.equal(await repairItem('正在准备修复…').isDisabled(),true);await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('[role=menu][data-open]'))}
 assert.ok((await group('不可用甲').innerText()).includes('正在准备修复作品锁'))
 await group('不可用甲').locator('.nav-group-toggle').click();await page.getByRole('tab',{name:'设定',exact:true}).click()
 await group('不可用乙').getByRole('button',{name:'作品操作',exact:true}).click();await menu.waitFor();assert.equal(await repairItem('正在准备修复…').isDisabled(),true)
 assert.equal(await page.evaluate(()=>(window as any).sidebarFixture.repairCount()),1)
}))

test('SN-15 natural scroll clamp retains desired position while wheel intent replaces it',()=>withSidebar(browser,{},async page=>{
 await page.evaluate(()=>{const f=(window as any).sidebarFixture;f.query.setQueryData(['characters','isolated-a'],{characters:Array.from({length:100},(_,i)=>({id:'many-'+i,name:'滚动人物'+i,roleType:'SUPPORTING',avatarUrl:null}))})})
 await page.getByRole('tab',{name:'角色',exact:true}).click();await page.getByText('滚动人物99',{exact:true}).waitFor()
 const tree=page.locator('.tree-scroll');await tree.evaluate(el=>{el.scrollTop=950});await page.waitForTimeout(80)
 const header=page.locator('.nav-group-toggle').first();await header.evaluate(el=>(el as HTMLElement).click());await page.waitForTimeout(100);assert.equal(await tree.evaluate(el=>el.scrollTop),0)
 await header.evaluate(el=>(el as HTMLElement).click());await page.waitForFunction(()=>Math.abs(document.querySelector('.tree-scroll')!.scrollTop-950)<2)
 await header.evaluate(el=>(el as HTMLElement).click());await page.waitForTimeout(80);await tree.hover();await page.mouse.wheel(0,160);await page.waitForTimeout(80);await header.evaluate(el=>(el as HTMLElement).click());await page.waitForTimeout(100);assert.equal(await tree.evaluate(el=>el.scrollTop),0)
}))

test('SN-14 folder states, local finger icon, photo priority and real chapter status shapes remain distinct',()=>withSidebar(browser,{},async page=>{
 const work=page.locator('.tree-row[data-icon-tone="work"]').first();assert.equal(await work.locator('.lucide-folder-open').count(),1)
 await work.getByRole('button',{name:'收起',exact:true}).click();assert.equal(await work.locator('.lucide-folder-closed').count(),1);await work.getByRole('button',{name:'展开',exact:true}).click()
 assert.equal(await page.locator('.tree-row[data-icon-tone="golden"] .lucide-pointer').count(),2)
 await page.evaluate(()=>{const f=(window as any).sidebarFixture;const photo='data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="24" height="24"%3E%3Crect width="24" height="24" fill="%23487060"/%3E%3C/svg%3E';f.query.setQueryData(['novels'],{...f.data['/api/novels'],novels:f.data['/api/novels'].novels.map((n:any,i:number)=>i? n:{...n,coverUrl:photo})});f.query.setQueryData(['characters','isolated-a'],{characters:[{id:'photo-c',name:'图片角色',roleType:'PROTAGONIST',avatarUrl:photo,avatarCrop:null}]});const n=f.data['/api/novels/isolated-a'].novel;f.query.setQueryData(['novels','isolated-a'],{novel:{...n,volumes:[{id:'statuses',index:1,title:'状态卷',chapters:['OUTLINE','REVIEWED','WRITTEN','CHAPTER_REVIEWED','FINAL'].map((status,i)=>({id:'status-'+i,index:i+1,title:'状态章'+i,status,wordCount:0}))}]}})})
 assert.equal(await page.locator('.tree-row[data-icon-tone="work"]').first().locator('img').count(),1);assert.equal(await page.locator('.tree-row[data-icon-tone="work"]').first().locator('.lucide-folder-open').count(),0)
 await page.getByRole('tab',{name:'角色',exact:true}).click();const photoRow=page.locator('.tree-row').filter({hasText:'图片角色'});assert.equal(await photoRow.locator('img').count(),1);assert.equal(await photoRow.locator('.lucide-user-round').count(),0);assert.equal(await photoRow.locator('img').evaluate(el=>getComputedStyle(el).filter),'none')
 await page.getByRole('tab',{name:'正文',exact:true}).click();await page.getByText('状态章4',{exact:false}).waitFor()
 const shapes=['lucide-circle','lucide-circle-dot','lucide-disc','lucide-circle-check','lucide-circle-check-big'];for(let i=0;i<shapes.length;i++){const row=page.locator('.tree-row').filter({hasText:'状态章'+i});assert.equal(await row.locator('.'+shapes[i]).count(),1);assert.equal(await row.getAttribute('data-icon-tone'),null)}
}))

test('SN-08 changing categories and folding never resets scene prefs; actual click keeps the existing reset-before-guard behavior',()=>withSidebar(browser,{},async page=>{
 const key='sidebar-fixture:isolated-a:workspace'
 await page.evaluate(key=>{const f=(window as any).sidebarFixture;f.sceneUi.getState().setPref(key,{scope:'old-scope',search:'原搜索'});f.guard('reject')},key)
 await page.getByRole('tab',{name:'设定',exact:true}).click();const header=page.locator('.nav-group-toggle').first();await header.click();await header.click()
 assert.deepEqual(await page.evaluate(key=>{const p=(window as any).sidebarFixture.sceneUi.getState().prefs[key];return{scope:p.scope,search:p.search}},key),{scope:'old-scope',search:'原搜索'})
 await page.getByRole('button',{name:'场景',exact:true}).first().click()
 assert.deepEqual(await page.evaluate(key=>{const p=(window as any).sidebarFixture.sceneUi.getState().prefs[key];return{scope:p.scope,search:p.search}},key),{scope:null,search:''})
 assert.equal(await page.evaluate(()=>(window as any).sidebarFixture.state().tabs.activeTabId),'kept')
}))

test('SN-05 rename and delete return to the same real record or the library create button',()=>withSidebar(browser,{},async page=>{
 await page.evaluate(()=>{const f=(window as any).sidebarFixture;f.data['/api/novels/isolated-a/scenarios']={scenarios:[{id:'edit-s',novelId:'isolated-a',title:'原试验场',status:'CONFIGURING',turnCount:0,nodeCount:0}]}})
 await page.getByRole('button',{name:'情景试验场',exact:true}).first().click();let library=page.getByRole('dialog',{name:'情景试验场',exact:true});await library.getByRole('button',{name:'试验场操作：原试验场',exact:true}).click();await page.getByRole('menuitem',{name:'重命名',exact:true}).click()
 let operation=page.getByRole('dialog',{name:'重命名情景试验场',exact:true});await operation.getByRole('textbox',{name:'试验场名称',exact:true}).fill('改名试验场');await operation.getByRole('button',{name:'保存',exact:true}).click();library=page.getByRole('dialog',{name:'情景试验场',exact:true});await library.getByRole('button',{name:'改名试验场',exact:true}).waitFor();assert.equal(await page.getByRole('dialog').count(),1)
 await page.waitForFunction(()=>document.activeElement?.textContent==='改名试验场')
 await library.getByRole('button',{name:'试验场操作：改名试验场',exact:true}).click();await page.getByRole('menuitem',{name:'删除',exact:true}).click();operation=page.getByRole('dialog',{name:'删除情景试验场',exact:true});await operation.getByRole('button',{name:'取消',exact:true}).click();await library.waitFor();await page.waitForFunction(()=>document.activeElement?.textContent==='改名试验场')
 await library.getByRole('button',{name:'试验场操作：改名试验场',exact:true}).click();await page.getByRole('menuitem',{name:'删除',exact:true}).click();await page.getByRole('dialog',{name:'删除情景试验场',exact:true}).getByRole('button',{name:'确认删除',exact:true}).click();await library.getByText('暂无试验场',{exact:true}).waitFor();await page.waitForFunction(()=>document.activeElement?.textContent?.includes('新建情景试验场'))
 assert.deepEqual(await page.evaluate(()=>(window as any).sidebarFixture.requests.filter((r:any)=>r.method!=='GET').map((r:any)=>r.method)),['PATCH','DELETE'])
}))

test('SN-10 unbound conversation failure is visible even when there are no real works',()=>withSidebar(browser,{},async page=>{
 await page.evaluate(async()=>{const f=(window as any).sidebarFixture;f.query.setQueryData(['novels'],{novels:[],unavailableWorks:[]});f.failures['/api/chat/conversations']='隔离会话读取失败';await f.query.resetQueries({queryKey:['chat-conversations']})})
 await page.getByRole('tab',{name:'对话',exact:true}).click();await page.getByRole('alert').waitFor();assert.match(await page.getByRole('alert').innerText(),/会话|对话/);assert.equal(await page.getByText('暂无对话',{exact:true}).count(),0)
 assert(await page.getByRole('button',{name:/重试|重新加载/}).count()>=1)
}))

for (const [theme, expected] of [
 ['paper', { error: 'rgb(163, 70, 60)', warning: 'rgb(126, 98, 28)', errorBadge: 'rgb(155, 44, 31)', warningBadge: 'rgb(143, 107, 35)' }],
 ['ink', { error: 'rgb(224, 138, 128)', warning: 'rgb(217, 180, 95)', errorBadge: 'rgb(229, 83, 75)', warningBadge: 'rgb(217, 164, 91)' }],
] as const) test(`WN-41' faulted work rows use the approved ${theme} colors and the healthy row height`, () => withSidebar(browser, { theme }, async page => {
 const healthyBefore = await page.locator('.tree-row', { hasText: '隔离作品甲' }).first().locator('.nav-label').evaluate(e => getComputedStyle(e).color)
 await page.evaluate(() => { const f = (window as any).sidebarFixture; f.query.setQueryData(['novels'], { ...f.data['/api/novels'], unavailableWorks: [{ workId: 'bad-e', novelId: 'bad-e-n', title: '错误作品', reason: 'missing' }, { workId: 'bad-w', novelId: 'bad-w-n', title: '警告作品', reason: 'in-use' }] }) })
 const row = (title: string) => page.locator('.tree-row', { hasText: title })
 await row('错误作品').waitFor()
 const read = (title: string) => row(title).evaluate(element => ({ text: getComputedStyle(element.querySelector('.nav-label')!).color, badge: getComputedStyle(element.querySelector('[data-fault-icon] circle[r="5.6"]')!).fill, height: element.getBoundingClientRect().height }))
 const error = await read('错误作品'), warning = await read('警告作品')
 assert.equal(error.text, expected.error); assert.equal(warning.text, expected.warning)
 assert.equal(error.badge, expected.errorBadge); assert.equal(warning.badge, expected.warningBadge)
 const healthy = page.locator('.tree-row', { hasText: '隔离作品甲' }).first()
 assert.equal(error.height, 28); assert.equal(warning.height, await healthy.evaluate(e => e.getBoundingClientRect().height))
 assert.equal(await healthy.locator('.nav-label').evaluate(e => getComputedStyle(e).color), healthyBefore)
}))
