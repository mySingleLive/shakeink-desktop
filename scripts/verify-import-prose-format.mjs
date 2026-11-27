// IPF-R1..R6 real-target acceptance (docs/610): built Electron (npm run build first), isolated
// SHAKEINK_TEST_ROOT, copy-only import of 《诡秘之主》 volume 1 「小丑」 (no model, no key, no network).
// Only the native open dialogs are replaced, as in scripts/verify-import-stop-after-save.mjs.
// Usage: node scripts/verify-import-prose-format.mjs [source.txt]
import {_electron} from 'playwright-core'
import assert from 'node:assert/strict'
import {mkdtemp,mkdir,writeFile,realpath,rm,copyFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {execFileSync} from 'node:child_process'

const sourcePath=process.argv[2]??'/Users/dt_flys/Documents/拆书/诡秘之主-原始文本.txt'
const directory=await realpath(await mkdtemp(join(tmpdir(),'shakeink-prose-610-'))),dataRoot=join(directory,'data'),sources=join(directory,'sources'),target=join(directory,'导入目标')
const evidence=resolve(process.env.IPF_EVIDENCE??'docs/610-import-prose-format-evidence');await mkdir(evidence,{recursive:true})
await mkdir(sources);await mkdir(target);const source=join(sources,'诡秘之主.txt');await copyFile(sourcePath,source)
execFileSync(process.execPath,['--import','tsx',resolve('scripts/seed-import-abandon.ts'),directory],{stdio:'pipe'})
const env={...process.env,SHAKEINK_TEST_ROOT:dataRoot};delete env.ELECTRON_RUN_AS_NODE
const results=[],scrub=text=>String(text).replaceAll(directory,'<isolated>').replaceAll(sourcePath,'<source>')
const record=(id,ok,details)=>{results.push({id,ok,...details});console.log(`${ok?'PASS':'FAIL'} ${id} ${scrub(JSON.stringify(details))}`)}

const app=await _electron.launch({args:[resolve('.')],env,timeout:90000}),page=await app.firstWindow({timeout:90000});page.setDefaultTimeout(30000)
try{
 assert.equal(await app.evaluate(()=>process.env.SHAKEINK_TEST_ROOT),dataRoot,'isolated root in use')
 await app.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows()[0];win.setBounds({x:120,y:60,width:1280,height:860});win.focus()})
 await app.evaluate(({dialog},{file,target})=>{dialog.showOpenDialog=async(...args)=>{const options=args.at(-1);return {canceled:false,filePaths:[options?.properties?.includes('openFile')?file:target]}}},{file:source,target})
 const later=page.getByRole('button',{name:'暂不配置',exact:true});await later.waitFor({timeout:15000}).then(()=>later.click(),()=>undefined)
 const current=()=>page.evaluate(async()=>(await window.desktop.novelImport({type:'current'})).view)
 const until=async(test,timeout=180000)=>{const end=Date.now()+timeout;for(;;){const v=await current();if(test(v))return v;if(v?.error&&v.phase==='failed')throw Error('import failed: '+v.error);if(Date.now()>end)throw Error('timeout: '+JSON.stringify({phase:v?.phase,step:v?.wizard?.step,error:v?.error}));await new Promise(r=>setTimeout(r,250))}}
 const act=(type,extra={})=>page.evaluate(async({type,extra})=>{const v=(await window.desktop.novelImport({type:'current'})).view;return window.desktop.novelImport({type,id:v.id,revision:v.revision,...extra})},{type,extra})

 await page.getByRole('button',{name:'导入作品',exact:true}).click();const d=page.locator('.ni-dialog');await d.getByText('诡秘之主.txt').first().waitFor()
 const files=await until(v=>v?.files?.length===1&&v.files[0].encoding);record('IPF-R0 source decoded as GB18030',files.files[0].encoding==='gb18030'&&files.files[0].requiresEncodingConfirmation===false,{encoding:files.files[0].encoding})
 await d.getByRole('button',{name:'继续',exact:true}).click();await until(v=>v?.wizard?.step==='work')
 await act('choose-target');await act('set-title',{title:'诡秘之主（正文格式验证）'});await act('wizard-next');await until(v=>v?.wizard?.step==='kinds')
 await act('select',{selected:['body'],targets:[],infer:false});await act('wizard-next')
 let v=await until(v=>v?.wizard?.step==='tree',300000)
 // Select only volume 1 through the real tree UI.
 await d.getByRole('button',{name:'全不选',exact:true}).click();await until(v=>v.wizard.chapterSelection.length===0)
 await d.getByRole('checkbox',{name:'选择 小丑',exact:true}).click();v=await until(v=>v.wizard.chapterSelection.length===213)
 await act('wizard-next',{consent:false});await until(v=>v?.wizard?.step==='verify'&&v.wizard.stepState.verify==='waiting',300000)
 await d.getByRole('button',{name:'保存作品',exact:true}).click();const done=await until(v=>v?.phase==='completed',300000)
 const novelId=done.publication.novelId
 // Read the work back through the app's own routes, as the chapter panel does.
 const data=await page.evaluate(async id=>{
  const outline=await(await fetch(`/api/novels/${id}/outline`)).json(),chapters=[]
  for(const volume of outline.volumes)for(const c of volume.chapters){const value=await(await fetch(`/api/novels/${id}/chapters/${c.id}`)).json();chapters.push({volume:volume.title,title:c.title,content:value.chapter.content})}
  const record=await(await fetch(`/api/novels/${id}/import-record?material=body-original`)).json()
  return {volumes:outline.volumes.map(v=>v.title),chapters,recordHead:record.page.text.slice(0,4000)}
 },novelId)
 record('IPF-R1 one volume 小丑 with 213 chapters',JSON.stringify(data.volumes)==='["小丑"]'&&data.chapters.length===213,{volumes:data.volumes,chapters:data.chapters.length})
 const headed=data.chapters.filter(c=>{const first=c.content.split('\n')[0].trim();return /^第[\d零〇一二三四五六七八九十百千万两]+[章节回卷部]/u.test(first)||first===c.title||first==='小丑'})
 record('IPF-R2 no chapter body starts with a volume or chapter name',headed.length===0,{headed:headed.map(c=>c.title).slice(0,10)})
 // Expected per chapter, from the decoded source: non-empty lines after the chapter's own heading lines.
 const {readFileSync}=await import('node:fs'),decoded=new TextDecoder('gb18030').decode(readFileSync(sourcePath))
 const lines=decoded.split(/\r\n|\r|\n/u),expected=[];let chapter
 for(const line of lines){const t=line.trim();if(/^第[\d零〇一二三四五六七八九十百千万两]+部[\s　]/u.test(t)){if(expected.length>=213)break;continue}if(/^第[\d零〇一二三四五六七八九十百千万两]+章/u.test(t)){if(expected.length>=213)break;chapter={title:t,lines:[]};expected.push(chapter);continue}if(chapter&&t)chapter.lines.push(t)}
 // The chapter after 第二百一十三章 holds the volume-1 note; the import excludes it, so drop that tail.
 const last=expected[212],note=last.lines.findIndex(l=>/^第一部总结/u.test(l));if(note>=0)last.lines=last.lines.slice(0,note)
 const counts=data.chapters.map((c,i)=>({title:c.title,got:c.content?c.content.split('\n\n').length:0,want:expected[i]?.lines.length}))
 const wrong=counts.filter(c=>c.got!==c.want)
 record('IPF-R3 paragraphs per chapter equal non-empty source lines',wrong.length===0,{checked:counts.length,wrong:wrong.slice(0,5),totalParagraphs:counts.reduce((n,c)=>n+c.got,0)})
 const squash=s=>s.replace(/[\s　\\]/gu,'')
 const textMismatch=data.chapters.map((c,i)=>squash(c.content)===squash(expected[i]?.lines.join('')??'')?null:c.title).filter(Boolean)
 record('IPF-R4 stored text equals the source without headings and whitespace',textMismatch.length===0,{mismatch:textMismatch.slice(0,5)})
 const lastParagraph=data.chapters.at(-1).content.split('\n\n').at(-1)
 record('IPF-R7 the last chapter ends with （第一部完） and no author note is stored',lastParagraph==='（第一部完）'&&!data.chapters.some(c=>c.content.includes('第一部总结')),{lastParagraph})
 record('IPF-R8 paragraphs are trimmed and separated by exactly one blank line',data.chapters.every(c=>!/\n{3}|^[\s\u3000]|[\s\u3000]$|\n[\s\u3000]|[\s\u3000]\n/u.test(c.content)&&!/[^\n]\n[^\n]/u.test(c.content)),{})
 const sourceHead=decoded.slice(decoded.indexOf('第一部 小丑')).slice(0,200),recordOk=data.recordHead.startsWith(sourceHead)
 record('IPF-R6 import record keeps the original source text',recordOk,{recordHeadKept:recordOk})
 // IPF-R5: open the work and chapter 1 in the real UI.
 await d.getByRole('button',{name:'打开作品',exact:true}).click().catch(()=>undefined)
 await page.locator('.ni-dialog').waitFor({state:'hidden',timeout:30000}).catch(async()=>{await page.keyboard.press('Escape')})
 const row=page.getByRole('treeitem',{name:/第一章 绯红/u}).first();await row.waitFor({timeout:60000}).catch(()=>undefined)
 if(await row.count())await row.click();else await page.getByText('第一章 绯红',{exact:false}).first().click()
 // CommentablePreview renders one [data-text-preview] block per paragraph, so count <p> across all blocks.
 await page.locator('[data-text-preview]').first().waitFor({timeout:60000})
 const shown=await page.evaluate(()=>{const ps=[...document.querySelectorAll('[data-text-preview] p')];return {paragraphs:ps.length,first:ps[0]?.textContent??'',text:ps.slice(0,2).map(p=>p.textContent).join('').slice(0,40)}})
 await new Promise(r=>setTimeout(r,500));await page.screenshot({path:join(evidence,'ipf-r5-chapter1.png')})
 record('IPF-R5 chapter 1 preview starts with 痛！ and shows separate paragraphs',shown.first==='痛！'&&shown.paragraphs===counts[0].want&&counts[0].want===69&&!/第一部|第一章/u.test(shown.text),{paragraphs:shown.paragraphs,first:shown.first,shot:'ipf-r5-chapter1.png'})
 await writeFile(join(evidence,'real-target-report.json'),scrub(JSON.stringify({scope:`macOS ${process.arch} built Electron, isolated SHAKEINK_TEST_ROOT, copy-only, no model, 诡秘之主 volume 1`,finishedAt:new Date().toISOString(),results},null,1))+'\n')
 const failed=results.filter(r=>!r.ok);console.log(failed.length?`IPF-R FAIL ${failed.length}`:`IPF-R PASS ${results.length}`);process.exitCode=failed.length?1:0
}finally{await app.close().catch(()=>undefined);await rm(directory,{recursive:true,force:true})}
