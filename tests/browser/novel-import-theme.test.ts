import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFile,mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {createHash} from 'node:crypto'
import {build} from 'esbuild'
import postcss from 'postcss'
import tailwindcss from '@tailwindcss/postcss'
import {chromium,type Browser,type Page,type Locator} from 'playwright-core'
import type {} from '../helpers/novel-import-theme-fixture'

let browser:Browser,script:string,css:string,styleId:string
const evidenceDirectory='docs/novel-import/evidence'
test.before(async()=>{
 const built=await build({entryPoints:['tests/helpers/novel-import-theme-fixture.tsx'],bundle:true,platform:'browser',format:'iife',write:false,tsconfig:'tsconfig.json',loader:{'.css':'empty'},logLevel:'silent'})
 script=built.outputFiles[0].text
 const globals=resolve('src/app/globals.css'),local=await readFile('src/components/desktop/novel-import.css','utf8')
 css=(await postcss([tailwindcss()]).process(await readFile(globals,'utf8'),{from:globals})).css+'\n'+local
 styleId=createHash('sha256').update(css).digest('hex').slice(0,12)
 await mkdir(evidenceDirectory,{recursive:true})
 browser=await chromium.launch({headless:true,executablePath:process.env.SHAKEINK_TEST_CHROMIUM??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'})
})
test.after(async()=>{await browser?.close()})
async function pageFor(theme:'ink'|'paper',reference=false){
 const page=await browser.newPage({viewport:{width:1280,height:800},reducedMotion:'reduce'}),errors:string[]=[]
 page.setDefaultTimeout(7000);page.on('pageerror',e=>errors.push(e.message))
 await page.route('**/*',async route=>{const icon=new URL(route.request().url()).pathname.match(/^\/import-file-icons\/(text|markdown|word|pdf|html)\.svg$/);if(icon)await route.fulfill({contentType:'image/svg+xml',body:await readFile(`public/import-file-icons/${icon[1]}.svg`)});else await route.abort()})
 await page.setContent('<base href="https://novel-import-theme.test/"><div id="app"></div>')
 await page.evaluate('globalThis.__name=target=>target');await page.addStyleTag({content:css});await page.addScriptTag({content:script})
 if(reference)await page.evaluate(theme=>window.mountNovelImportThemeReference(theme),theme)
 else {await page.evaluate(theme=>window.mountNovelImport({theme}),theme);await page.getByRole('button',{name:'导入作品',exact:true}).click();await page.locator('.ni-dialog').waitFor()}
 await page.evaluate(()=>document.fonts.ready)
 return {page,errors}
}
async function settleStyle(locator:Locator){await locator.evaluate(async element=>{await new Promise(requestAnimationFrame);await Promise.allSettled(element.getAnimations().map(animation=>animation.finished))})}
async function style(locator:Locator){return locator.evaluate(element=>{const s=getComputedStyle(element),svg=element.querySelector('svg');return {background:s.backgroundColor,color:s.color,borderColor:s.borderColor,borderWidth:s.borderWidth,borderStyle:s.borderStyle,height:s.height,minHeight:s.minHeight,padding:s.padding,borderRadius:s.borderRadius,fontSize:s.fontSize,fontWeight:s.fontWeight,lineHeight:s.lineHeight,opacity:s.opacity,filter:s.filter,boxShadow:s.boxShadow,outline:s.outline,outlineOffset:s.outlineOffset,...(svg?{svgWidth:getComputedStyle(svg).width,svgHeight:getComputedStyle(svg).height}:{})}})}
async function tabTo(page:Page,target:Locator){await page.mouse.move(0,0);for(let i=0;i<60;i++){await page.keyboard.press('Tab');if(await target.evaluate(element=>document.activeElement===element)){assert.equal(await target.evaluate(element=>element.matches(':focus-visible')),true);await settleStyle(target);return}}assert.fail('real Tab navigation never reached the enabled shared Button')}
async function tokens(locator:Locator){return locator.evaluate(element=>{const p=document.createElement('span');p.style.cssText='position:absolute;pointer-events:none;background:var(--primary);color:var(--primary-foreground);border-color:var(--input);box-shadow:var(--shadow-2)';element.appendChild(p);const s=getComputedStyle(p),primary=s.backgroundColor,primaryForeground=s.color,input=s.borderColor,shadow=s.boxShadow;p.style.background='var(--chat-overlay,var(--popover))';const overlay=getComputedStyle(p).backgroundColor;p.remove();return {primary,primaryForeground,input,shadow,overlay}})}
const calls=(page:Page)=>page.evaluate(()=>window.novelImportFixture.calls)
const screenshot=(page:Page,name:string)=>page.screenshot({path:`${evidenceDirectory}/theme-${name}-${styleId}.png`})

test('NI-UT01: real shared Button variants retain theme paint geometry hover focus and disabled states',{timeout:120000},async()=>{
 for(const theme of ['ink','paper'] as const){const actual=await pageFor(theme),reference=await pageFor(theme,true),page=actual.page,ref=reference.page,d=page.locator('.ni-dialog')
  try{
   assert.equal(await ref.locator('[data-reference]').evaluateAll(elements=>elements.every(el=>!el.closest('.ni-dialog'))),true)
   const primary=d.getByRole('button',{name:'识别内容',exact:true}),pairs:[Locator,Locator][]=[[primary,ref.locator('[data-reference=primary]')],[d.getByRole('button',{name:'添加来源',exact:true}),ref.locator('[data-reference=outline]')],[d.getByRole('button',{name:'关闭导入窗口',exact:true}),ref.locator('[data-reference=icon]')]]
   const expected=await tokens(d);assert.equal((await style(primary)).background,expected.primary,theme+' primary must resolve actual primary token independently');assert.equal((await style(primary)).color,expected.primaryForeground)
   const icon=d.getByRole('button',{name:'关闭导入窗口',exact:true});assert.equal((await style(icon)).background,'rgba(0, 0, 0, 0)');assert.equal((await style(icon)).borderColor,'rgba(0, 0, 0, 0)')
   for(const [button,control]of pairs){await page.mouse.move(0,0);await ref.mouse.move(0,0);await settleStyle(button);await settleStyle(control);assert.deepEqual(await style(button),await style(control),theme+' idle shared variant');await button.hover();await settleStyle(button);const hovered=await style(button);await control.hover();await settleStyle(control);assert.deepEqual(hovered,await style(control),theme+' actual pointer hover');await tabTo(page,button);const focused=await style(button);await tabTo(ref,control);assert.deepEqual(focused,await style(control),theme+' actual keyboard focus');assert.notEqual(focused.boxShadow,'none','real focus ring must be visible')}
   const disabledIcon=d.getByRole('button',{name:'上移 正文.txt',exact:true});assert.equal(await disabledIcon.isDisabled(),true);await page.mouse.move(0,0);await settleStyle(disabledIcon);assert.deepEqual(await style(disabledIcon),await style(ref.locator('[data-reference=disabled-icon]')))
   const before=(await calls(page)).length,box=await disabledIcon.boundingBox();await page.mouse.click(box!.x+box!.width/2,box!.y+box!.height/2);assert.equal((await calls(page)).length,before,'disabled physical click never reaches bridge')
   await page.evaluate(()=>window.novelImportFixture.set({phase:'select'}));await d.getByRole('button',{name:'继续',exact:true}).click();const disabled=d.getByRole('button',{name:'允许分析并导入',exact:true});assert.equal(await disabled.isDisabled(),true);await page.mouse.move(0,0);await ref.mouse.move(0,0);await settleStyle(disabled);assert.deepEqual(await style(disabled),await style(ref.locator('[data-reference=disabled-primary]')))
   const disabledCalls=(await calls(page)).length,disabledBox=await disabled.boundingBox();await page.mouse.click(disabledBox!.x+disabledBox!.width/2,disabledBox!.y+disabledBox!.height/2);assert.equal((await calls(page)).length,disabledCalls)
   assert.deepEqual(actual.errors,[]);assert.deepEqual(reference.errors,[])
  }finally{await screenshot(page,`${theme}-buttons`);await screenshot(ref,`${theme}-reference`);await page.close();await ref.close()}
 }
})

test('NI-UT02: real themed surfaces stay bounded keyboard trapped and selection state survives',{timeout:120000},async()=>{
 for(const theme of ['ink','paper'] as const){const {page,errors}=await pageFor(theme),d=page.locator('.ni-dialog')
  try{
   await page.evaluate(()=>window.novelImportFixture.set({phase:'select'}));await d.locator('#ni-target-scene').uncheck();await d.locator('#ni-source-character').uncheck();assert.equal(await d.locator('#ni-target-character').isChecked(),true);await d.locator('#ni-infer').uncheck();assert.equal(await d.locator('.ni-target-card input:disabled').count(),12);await d.locator('#ni-infer').check();assert.equal(await d.locator('#ni-target-scene').isChecked(),false)
   const selections=await page.evaluate(()=>({selected:window.novelImportFixture.view().selected,targets:window.novelImportFixture.view().targets,infer:window.novelImportFixture.view().infer,files:window.novelImportFixture.view().files}))
   for(const [width,height]of [[1280,800],[390,640],[680,460]]){await page.setViewportSize({width,height});for(const phase of ['source','select','confirm'] as const){await page.evaluate(phase=>window.novelImportFixture.set({phase}),phase);await d.getByRole('heading',{name:{source:'核对来源',select:'选择内容',confirm:'确认导入'}[phase],exact:true}).waitFor();await settleStyle(d);await d.locator('.ni-footer').waitFor();const expected=await tokens(d),surface=await d.evaluate(element=>{const s=getComputedStyle(element);return {background:s.backgroundColor,border:s.borderColor,shadow:s.boxShadow}});await screenshot(page,`${theme}-${phase}-${width}x${height}`);assert.deepEqual(surface,{background:expected.overlay,border:expected.input,shadow:expected.shadow},theme+' '+phase+' surface tokens');assert.equal(await d.locator('.ni-footer').evaluate(el=>getComputedStyle(el).backgroundColor),expected.overlay)
     const box=await d.boundingBox(),foot=await d.locator('.ni-footer').boundingBox();assert.ok(box&&foot);assert.ok(box.x>=15&&box.y>=15&&box.x+box.width<=width-15&&box.y+box.height<=height-15,JSON.stringify({box,width,height}));assert.ok(foot.y>=box.y&&foot.y+foot.height<=height-15,'footer is visible inside the popup');assert.equal(await d.evaluate(el=>el.scrollWidth<=el.clientWidth),true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
     for(let i=0;i<12;i++){await page.keyboard.press('Tab');await page.waitForFunction(()=>document.querySelector('.ni-dialog')?.contains(document.activeElement));assert.equal(await d.evaluate(el=>el.contains(document.activeElement)),true,'real Dialog keeps Tab inside after its focus guard settles');assert.equal(await page.evaluate(()=>document.activeElement?.matches(':disabled')),false)}
     assert.deepEqual(await page.evaluate(()=>({selected:window.novelImportFixture.view().selected,targets:window.novelImportFixture.view().targets,infer:window.novelImportFixture.view().infer,files:window.novelImportFixture.view().files})),selections)
     if(phase==='select'){assert.equal(await d.locator('#ni-target-scene').isChecked(),false);assert.equal(await d.locator('#ni-source-character').isChecked(),false)}
    }}assert.deepEqual(errors,[])
  }finally{await page.close()}
 }
})
