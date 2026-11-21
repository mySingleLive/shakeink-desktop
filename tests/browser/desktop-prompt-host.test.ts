import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {build} from 'esbuild'
import postcss from 'postcss'
import tailwindcss from '@tailwindcss/postcss'
import {chromium,type Browser,type Page} from 'playwright-core'
import type {AppPrompt} from '../../desktop/shared/prompt'
import type {} from '../helpers/desktop-prompt-host-fixture'

// RPB-01..08: real DesktopPromptHost, shared Dialog/Button and product CSS behind a controlled bridge.
let browser:Browser,bundle:string,css:string
test.before(async()=>{
 const path=resolve('src/app/globals.css'),[globals,desktop]=await Promise.all([readFile(path,'utf8'),readFile(resolve('src/app/desktop.css'),'utf8')])
 css=(await postcss([tailwindcss()]).process(`${globals}\n${desktop}`,{from:path})).css+'\n'+await readFile('src/components/desktop/novel-import.css','utf8')
 bundle=(await build({entryPoints:['tests/helpers/desktop-prompt-host-fixture.tsx'],bundle:true,platform:'browser',format:'iife',write:false,tsconfig:'tsconfig.json',loader:{'.css':'empty'},logLevel:'silent'})).outputFiles[0].text
 browser=await chromium.launch({headless:true,executablePath:process.env.SHAKEINK_TEST_CHROMIUM??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'})
})
test.after(async()=>{await browser?.close()})
const closePrompt=(id='6a1b5f4e-0c6d-4d3a-9b8e-2f1a3c4d5e6f'):AppPrompt=>({id,tone:'warning',title:'尚不能关闭',message:'部分修改尚未确认保存。',detail:'窗口和原草稿已保留。\n可以重试、导出恢复草稿，或返回继续处理。',buttons:[{value:'cancel',label:'取消关闭',variant:'outline'},{value:'export',label:'导出草稿',variant:'outline'},{value:'retry',label:'重试',variant:'default'}],defaultValue:'cancel',cancelValue:'cancel'})
async function mount(initial:AppPrompt[],options:Record<string,unknown>,run:(page:Page)=>Promise<void>){
 const page=await browser.newPage({viewport:{width:1280,height:800},reducedMotion:'reduce'}),errors:string[]=[]
 page.setDefaultTimeout(5000);page.on('pageerror',e=>errors.push(e.message))
 try{await page.setContent('<div id="app"></div>');await page.evaluate('globalThis.__name=t=>t');await page.addStyleTag({content:css});await page.addScriptTag({content:bundle});await page.evaluate(([p,o])=>window.promptFixture.mount(p as never,o as never),[initial,options]);await run(page);assert.deepEqual(errors,[])}finally{await page.close()}
}
const prompt=(page:Page)=>page.getByRole('dialog',{name:'尚不能关闭',exact:true})
const replies=(page:Page)=>page.evaluate(()=>window.promptFixture.replies)

test('RPB-01: a pending prompt is pulled on mount and rendered with the shared dialog parts',()=>mount([closePrompt()],{},async page=>{
 const p=prompt(page);await p.waitFor()
 assert.equal(await p.getAttribute('data-slot'),'dialog-content');assert.match(await p.getAttribute('class')??'',/desktop-prompt/)
 assert.equal(await p.locator('[data-slot="dialog-description"]').innerText(),'部分修改尚未确认保存。')
 assert.equal(await p.locator('.desktop-prompt-detail').innerText(),'窗口和原草稿已保留。\n可以重试、导出恢复草稿，或返回继续处理。')
 assert.deepEqual(await p.locator('[data-slot="dialog-footer"] button').allInnerTexts(),['取消关闭','导出草稿','重试'])
 assert.deepEqual(await p.locator('[data-slot="dialog-footer"] button').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-variant'))),['outline','outline','default'])
}))
test('RPB-02: focus starts on the default button and stays inside the prompt',()=>mount([closePrompt()],{},async page=>{
 const p=prompt(page);await p.waitFor();await page.waitForFunction(()=>document.activeElement?.textContent==='取消关闭')
 for(let i=0;i<5;i++){await page.keyboard.press('Tab');await page.waitForTimeout(50);assert.equal(await page.evaluate(()=>{const a=document.activeElement as HTMLElement;return !!a.closest('.desktop-prompt')||a.hasAttribute('data-base-ui-focus-guard')}),true)}
}))
test('RPB-03: a button replies once with its value and hides the prompt immediately',()=>mount([closePrompt()],{},async page=>{
 const p=prompt(page);await p.waitFor();await p.getByRole('button',{name:'导出草稿',exact:true}).evaluate((b:HTMLButtonElement)=>{b.click();b.click()})
 await p.waitFor({state:'hidden'});assert.deepEqual(await replies(page),[{id:closePrompt().id,value:'export'}])
}))
for(const lower of ['dialog','import'] as const)test(`RPB-04: Escape answers cancel and leaves the ${lower} window below open`,()=>mount([],{lower},async page=>{
 await page.getByRole('dialog',{name:'下层窗口',exact:true}).waitFor();await page.evaluate(p=>window.promptFixture.push([p]),closePrompt())
 const p=prompt(page);await p.waitFor();await page.keyboard.press('Escape');await p.waitFor({state:'hidden'})
 assert.deepEqual(await replies(page),[{id:closePrompt().id,value:'cancel'}]);assert.deepEqual(await page.evaluate(()=>window.promptFixture.lowerChanges),[])
 assert.equal(await page.getByRole('dialog',{name:'下层窗口',exact:true}).isVisible(),true)
}))
test('RPB-05: clicking the backdrop does not answer',()=>mount([closePrompt()],{},async page=>{
 const p=prompt(page);await p.waitFor();await page.mouse.click(6,6);await page.waitForTimeout(150);assert.equal(await p.isVisible(),true);assert.deepEqual(await replies(page),[])
}))
test('RPB-06: pushed snapshots replace the prompt and the latest one is shown first',()=>mount([],{},async page=>{
 const second={...closePrompt('7b2c6a5f-1d7e-4e4b-8c9f-3a2b4c5d6e7f'),title:'仍有创作任务运行',message:'停止正在执行的任务后关闭？',detail:undefined,buttons:[{value:'cancel',label:'取消关闭',variant:'outline' as const},{value:'stop',label:'停止任务并继续',variant:'destructive' as const}]}
 await page.evaluate(([a,b])=>window.promptFixture.push([a,b]),[closePrompt(),second])
 const top=page.getByRole('dialog',{name:'仍有创作任务运行',exact:true});await top.waitFor();assert.equal(await prompt(page).count(),0)
 await page.evaluate(a=>window.promptFixture.push([a]),closePrompt());await prompt(page).waitFor();assert.equal(await top.count(),0)
 await page.evaluate(()=>window.promptFixture.push([]));await prompt(page).waitFor({state:'hidden'})
}))
test('RPB-07: the prompt is stacked above the import dialog',()=>mount([],{lower:'import'},async page=>{
 await page.evaluate(p=>window.promptFixture.push([p]),closePrompt());const p=prompt(page);await p.waitFor()
 const hit=await p.evaluate(node=>{const r=node.getBoundingClientRect();return node.contains(document.elementFromPoint(r.left+r.width/2,r.top+12))});assert.equal(hit,true)
}))
for(const theme of ['paper','ink'] as const)test(`RPB-08: ${theme} prompt uses the shared dialog surface tokens`,()=>mount([closePrompt()],{theme},async page=>{
 const p=prompt(page);await p.waitFor();await page.waitForTimeout(150)
 const look=await p.evaluate(node=>{const s=getComputedStyle(node),probe=document.createElement('div');probe.style.background='var(--popover)';probe.style.color='var(--popover-foreground)';document.body.append(probe);const t=getComputedStyle(probe);const r={bg:s.backgroundColor,fg:s.color,want:[t.backgroundColor,t.color],shadow:s.boxShadow,radius:s.borderTopLeftRadius};probe.remove();return r})
 assert.equal(look.bg,look.want[0]);assert.equal(look.fg,look.want[1]);assert.notEqual(look.shadow,'none');assert.notEqual(look.radius,'0px')
 await page.screenshot({path:`docs/evidence/prompt-host-${theme}.png`})
}))
test('RPB-09: a prompt answered and immediately followed by a new one shows the new prompt',()=>mount([closePrompt()],{},async page=>{
 const p=prompt(page);await p.waitFor();await p.getByRole('button',{name:'导出草稿',exact:true}).click()
 const next=closePrompt('8c3d7b6a-2e8f-4f5c-9d0a-4b3c5d6e7f80')
 await page.evaluate(n=>{window.promptFixture.push([]);setTimeout(()=>window.promptFixture.push([n]),30)},next)
 await p.waitFor({timeout:3000});await page.waitForTimeout(400);assert.equal(await p.isVisible(),true)
 await p.getByRole('button',{name:'重试',exact:true}).click();assert.deepEqual((await replies(page)).map(r=>r.value),['export','retry'])
}))
test('RPB-10: Enter on a destructive prompt activates the safe default',()=>mount([],{},async page=>{
 const wipe={...closePrompt(),title:'配置数据无法自动修复',message:'本地配置数据已损坏且无法自动修复',detail:undefined,buttons:[{value:'quit',label:'退出',variant:'outline' as const},{value:'wipe',label:'清空全部配置并重启',variant:'destructive' as const}],defaultValue:'quit',cancelValue:'quit'}
 await page.evaluate(p=>window.promptFixture.push([p]),wipe);const p=page.getByRole('dialog',{name:'配置数据无法自动修复',exact:true});await p.waitFor()
 await page.waitForFunction(()=>document.activeElement?.textContent==='退出');await page.keyboard.press('Enter');await p.waitFor({state:'hidden'})
 assert.deepEqual(await replies(page),[{id:wipe.id,value:'quit'}])
}))
test('RPB-11: a held Escape does not cancel the prompt that replaces the answered one',()=>mount([closePrompt()],{},async page=>{
 const p=prompt(page);await p.waitFor();await page.keyboard.down('Escape');await p.waitFor({state:'hidden'})
 const next=closePrompt('9d4e8c7b-3f90-4a6d-8e1b-5c4d6e7f8091');await page.evaluate(n=>window.promptFixture.push([n]),next);await p.waitFor()
 await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',repeat:true,bubbles:true})));await page.keyboard.up('Escape')
 await page.waitForTimeout(150);assert.equal(await p.isVisible(),true);assert.deepEqual((await replies(page)).map(r=>r.value),['cancel'])
}))
test('RPB-12: an open dialog stays mounted below the prompt and keeps its input',()=>mount([],{lower:'dialog'},async page=>{
 const input=page.getByRole('textbox',{name:'下层输入'});await input.fill('未保存的编辑');await page.evaluate(p=>window.promptFixture.push([p]),closePrompt())
 const p=prompt(page);await p.waitFor();await page.waitForFunction(()=>!!document.activeElement?.closest('.desktop-prompt'))
 await p.getByRole('button',{name:'取消关闭',exact:true}).click();await p.waitFor({state:'hidden'});assert.equal(await input.inputValue(),'未保存的编辑');assert.deepEqual(await page.evaluate(()=>window.promptFixture.lowerChanges),[])
}))
test('RPB-13: a reply main did not accept shows the prompt again',()=>mount([closePrompt()],{},async page=>{
 await page.evaluate(()=>{window.promptFixture.refuse=true});const p=prompt(page);await p.waitFor()
 await p.getByRole('button',{name:'重试',exact:true}).click();await p.waitFor({state:'hidden'}).catch(()=>undefined);await p.waitFor({timeout:3000})
 await page.evaluate(()=>{window.promptFixture.refuse=false});await p.getByRole('button',{name:'取消关闭',exact:true}).click();await p.waitFor({state:'hidden'})
 assert.deepEqual((await replies(page)).map(r=>r.value),['retry','cancel'])
}))
test('RPB-14: a capture-phase key recorder registered earlier does not swallow prompt keys',()=>mount([],{},async page=>{
 // Mirrors ShortcutSettings: window capture listener that consumes keys unless an app prompt is open.
 await page.evaluate(()=>window.addEventListener('keydown',e=>{if(document.querySelector('.desktop-prompt'))return;e.preventDefault();e.stopImmediatePropagation()},true))
 await page.evaluate(p=>window.promptFixture.push([p]),closePrompt());const p=prompt(page);await p.waitFor();await page.keyboard.press('Escape');await p.waitFor({state:'hidden'})
 assert.deepEqual((await replies(page)).map(r=>r.value),['cancel'])
}))
