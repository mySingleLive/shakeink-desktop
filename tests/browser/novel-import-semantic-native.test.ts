import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {build} from 'esbuild'
import postcss from 'postcss'
import tailwindcss from '@tailwindcss/postcss'
import {chromium,type Browser,type Locator,type Page} from 'playwright-core'
import type {} from '../helpers/novel-import-semantic-native-fixture'

let browser:Browser,script:string,css:string,worker:string
test.before(async()=>{
 const [main,workerBundle]=await Promise.all([
  build({entryPoints:['tests/helpers/novel-import-semantic-native-fixture.tsx'],bundle:true,platform:'browser',format:'esm',outfile:'semantic-native.js',write:false,loader:{'.ttf':'dataurl'},define:{'process.env.NODE_ENV':'"development"','process.env':'{}'},tsconfig:'tsconfig.json',minify:true,logLevel:'silent'}),
  build({entryPoints:['node_modules/monaco-editor/esm/vs/editor/editor.worker.js'],bundle:true,platform:'browser',format:'iife',write:false,minify:true,logLevel:'silent'}),
 ])
 script=main.outputFiles.find(file=>file.path.endsWith('.js'))!.text;worker=workerBundle.outputFiles[0].text
 const globals=resolve('src/app/globals.css');css=(await postcss([tailwindcss()]).process(await readFile(globals,'utf8'),{from:globals})).css+'\n'+(main.outputFiles.find(file=>file.path.endsWith('.css'))?.text??'')
 browser=await chromium.launch({headless:true,executablePath:process.env.SHAKEINK_TEST_CHROMIUM??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'})
})
test.after(async()=>{await browser?.close()})
const prose=(name:string)=>`${name}_首句\n\n${name}_末句`
async function visibleValue(input:Locator,value:string){await input.scrollIntoViewIfNeeded();assert.equal(await input.isVisible(),true);assert.equal(await input.inputValue(),value);if(await input.evaluate(element=>element.tagName==='TEXTAREA'))assert.equal(await input.evaluate(element=>element.scrollHeight<=element.clientHeight),true,'the first and last native textarea lines must both fit visibly')}
async function realMarkdown(page:Page,container:Locator,name:string){
 const editor=container.locator('.monaco-editor');await editor.waitFor({state:'visible'});await page.waitForFunction(()=>window.semanticNative.editorValues().length===1)
 await editor.scrollIntoViewIfNeeded();const rendered=editor.locator('.view-lines');await rendered.getByText(name+'_首句',{exact:false}).waitFor();await rendered.getByText(name+'_末句',{exact:false}).waitFor();assert.equal(await rendered.isVisible(),true)
 await page.evaluate(()=>window.semanticNative.focusEditorEnd());await page.keyboard.type(' EDITED');await page.waitForFunction(()=>window.semanticNative.editorValues()[0]?.endsWith(' EDITED'))
 await container.getByRole('button',{name:'预览',exact:true}).click();const preview=container.locator('[data-text-preview]');await preview.getByText(name+'_首句',{exact:false}).waitFor();await preview.getByText(name+'_末句 EDITED',{exact:false}).waitFor();assert.equal(await preview.isVisible(),true)
}

test('NI-SEM-B01: existing setting editors read and edit the nine native imported content shapes',{timeout:180000},async()=>{
 const page=await browser.newPage({viewport:{width:1200,height:1000},reducedMotion:'reduce'}),errors:string[]=[],consoleErrors:string[]=[],requests:string[]=[]
 page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text())});await page.route('**/*',route=>{requests.push(route.request().url());return route.abort()})
 try{
  // No listener, HTTP navigation or file preview: all React, CSS and the real
  // Monaco worker are supplied from memory. Every network request is blocked.
  await page.setContent('<div id="app"></div>');await page.addStyleTag({content:css});await page.addScriptTag({content:script,type:'module'})
  // Module script insertion can finish before its top-level initialization.
  // Observe the actual entry point instead of relying on a timing/retry window.
  try{await page.waitForFunction(()=>typeof window.mountSemanticNative==='function')}catch(cause){throw new Error('Native consumer fixture module did not initialize: '+JSON.stringify({pageErrors:errors,consoleErrors}),{cause})}
  await page.evaluate(source=>{window.semanticNative=window.mountSemanticNative(source)},worker)
  let consumer=page.locator('[data-native-consumer]')
  await visibleValue(consumer.getByPlaceholder('一两句话概述这套等级体系'),prose('LEVEL_SYSTEM_介绍'));await visibleValue(consumer.getByPlaceholder('晋升、互斥、代价等适用于整套体系的通用规则，如「途径之间不可交互晋升」'),prose('LEVEL_SYSTEM_规则'))
  await consumer.getByRole('button',{name:'查看 首等级 详情',exact:true}).waitFor();await consumer.getByRole('button',{name:'查看 末等级 详情',exact:true}).waitFor();await consumer.getByRole('button',{name:'查看 首等级 详情',exact:true}).click()
  await visibleValue(consumer.getByPlaceholder('一两句话概述该等级，也可展开详写'),prose('首等级_介绍'));await visibleValue(consumer.getByPlaceholder('能力描述'),prose('首等级_能力描述'));await consumer.getByRole('button',{name:'查看 子等级 详情',exact:true}).click();await visibleValue(consumer.getByPlaceholder('一两句话概述该等级，也可展开详写'),prose('子等级_介绍'))
  const condition=consumer.getByPlaceholder('晋升到该等级所需的条件、仪式或代价');await visibleValue(condition,prose('子等级_条件'));await condition.fill(prose('子等级_条件')+' EDITED')
  const level=await page.evaluate(()=>({before:window.semanticNative.initial('LEVEL_SYSTEM'),after:window.semanticNative.value('LEVEL_SYSTEM')}));const expectedLevel=structuredClone(level.before) as any;expectedLevel.levels[0].children[0].condition+=' EDITED';assert.deepEqual(level.after,expectedLevel)

  await page.evaluate(()=>window.semanticNative.show('LEVEL_SYSTEM',true));consumer=page.locator('[data-native-consumer]');await consumer.getByRole('button',{name:'查看 首途径 详情',exact:true}).waitFor();await consumer.getByRole('button',{name:'查看 末途径 详情',exact:true}).waitFor();await consumer.getByRole('button',{name:'查看 首途径 详情',exact:true}).click();const pathwayDescription=consumer.getByPlaceholder('一两句话概述该途径：象征、权柄、代表人物');await visibleValue(pathwayDescription,prose('首途径_介绍'));await consumer.getByRole('button',{name:'查看 途径首等级 详情',exact:true}).waitFor();await consumer.getByRole('button',{name:'查看 途径末等级 详情',exact:true}).waitFor();await pathwayDescription.fill(prose('首途径_介绍')+' EDITED')
  const multi=await page.evaluate(()=>({before:window.semanticNative.initial('LEVEL_SYSTEM_MULTI'),after:window.semanticNative.value('LEVEL_SYSTEM_MULTI')}));const expectedMulti=structuredClone(multi.before) as any;expectedMulti.pathways[0].description+=' EDITED';assert.deepEqual(multi.after,expectedMulti)

  await page.evaluate(()=>window.semanticNative.show('CONCEPT'));consumer=page.locator('[data-native-consumer]');const firstConcept=consumer.getByRole('region',{name:'概念 首概念',exact:true}),lastConcept=consumer.getByRole('region',{name:'概念 末概念',exact:true});await visibleValue(firstConcept.getByPlaceholder('术语'),'首概念');await visibleValue(lastConcept.getByPlaceholder('术语'),'末概念');for(const [region,name]of [[firstConcept,'首概念_解释'],[lastConcept,'末概念_解释']] as const){const preview=region.locator('[data-text-preview]');await preview.getByText(name+'_首句',{exact:false}).waitFor();await preview.getByText(name+'_末句',{exact:false}).waitFor();assert.equal(await preview.isVisible(),true)}await firstConcept.getByRole('button',{name:'编辑',exact:true}).click();await realMarkdown(page,firstConcept,'首概念_解释')
  const concepts=await page.evaluate(()=>({before:window.semanticNative.initial('CONCEPT'),after:window.semanticNative.value('CONCEPT')}));const expectedConcepts=structuredClone(concepts.before) as any;expectedConcepts.concepts[0].explanation+=' EDITED';assert.deepEqual(concepts.after,expectedConcepts)

  await page.evaluate(()=>window.semanticNative.show('FACTION'));consumer=page.locator('[data-native-consumer]');for(const [index,name]of ['首势力','末势力'].entries()){await visibleValue(consumer.getByPlaceholder('势力名称').nth(index),name);await visibleValue(consumer.getByPlaceholder('势力简介').nth(index),prose(name+'_简介'));await visibleValue(consumer.getByPlaceholder('与其他势力的关系').nth(index),prose(name+'_关系'))}await consumer.getByPlaceholder('与其他势力的关系').first().fill(prose('首势力_关系')+' EDITED')
  const factions=await page.evaluate(()=>({before:window.semanticNative.initial('FACTION'),after:window.semanticNative.value('FACTION')}));const expectedFactions=structuredClone(factions.before) as any;expectedFactions.factions[0].relations+=' EDITED';assert.deepEqual(factions.after,expectedFactions)

  for(const type of ['POWER_SYSTEM','MAP','SOCIETY','CULTURE','GEOGRAPHY','WORLD_HISTORY'] as const){await page.evaluate(type=>window.semanticNative.show(type),type);consumer=page.locator('[data-native-consumer]');await realMarkdown(page,consumer,type);const value=await page.evaluate(type=>window.semanticNative.value(type),type);assert.deepEqual(value,{text:prose(type)+' EDITED'})}
  await page.waitForFunction(()=>window.semanticNative.workerDiagnostics().messages>0)
  const changed=await page.evaluate(()=>({keys:window.semanticNative.changes().map(change=>change.key),unexpected:window.semanticNative.unexpected(),workers:window.semanticNative.workers(),workerDiagnostics:window.semanticNative.workerDiagnostics()}));assert.deepEqual([...new Set(changed.keys)].sort(),['LEVEL_SYSTEM','LEVEL_SYSTEM_MULTI','CONCEPT','FACTION','POWER_SYSTEM','MAP','SOCIETY','CULTURE','GEOGRAPHY','WORLD_HISTORY'].sort());assert.ok(changed.workers>0&&changed.workerDiagnostics.messages>0,'installed Monaco must receive replies from its real bundled editor worker');assert.deepEqual(changed.workerDiagnostics.errors,[]);assert.deepEqual(changed.unexpected,[]);assert.deepEqual(errors,[],JSON.stringify({worker:changed.workerDiagnostics,requests}));assert.deepEqual(consoleErrors,[]);assert.deepEqual(requests,[])
 }finally{await page.evaluate(()=>window.semanticNative?.unmount()).catch(()=>{});await page.close()}
})
