import {_electron} from 'playwright-core'
import assert from 'node:assert/strict'
import {mkdtemp,mkdir,realpath,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {execFileSync} from 'node:child_process'
import {build} from 'esbuild'

// RPM-10 (510): the Windows About page shows its own "cannot open browser" error. macOS has no
// such window, so this builds the real projectAboutHtml/installProjectAboutLinks in a real
// BrowserWindow under its real CSP and makes the external open fail.
const directory=await realpath(await mkdtemp(join(tmpdir(),'shakeink-import-abandon-')))
await mkdir(join(directory,'target'))
execFileSync(process.execPath,['--import','tsx',resolve('scripts/seed-import-abandon.ts'),directory],{stdio:'pipe'})
const env={...process.env,SHAKEINK_TEST_ROOT:join(directory,'data')};delete env.ELECTRON_RUN_AS_NODE
// The same source the product bundles, compiled here and evaluated in the real main process.
const aboutCode=(await build({entryPoints:['desktop/main/project-about.ts'],bundle:true,platform:'node',format:'iife',globalName:'about',write:false,logLevel:'silent'})).outputFiles[0].text+';return about'
let app
try{
 app=await _electron.launch({args:[resolve('.')],env,timeout:90000})
 await app.firstWindow({timeout:90000})
 const result=await app.evaluate(async({BrowserWindow},aboutCode)=>{
  const about=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}})
  const {projectAboutHtml,installProjectAboutLinks,PROJECT_ABOUT_LINK_ERROR_SCRIPT}=new Function(aboutCode)()
  installProjectAboutLinks(about.webContents,async()=>{throw Error('browser unavailable')},()=>{void about.webContents.executeJavaScript(PROJECT_ABOUT_LINK_ERROR_SCRIPT)})
  await about.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(projectAboutHtml('0.1.0','paper')))
  const before=await about.webContents.executeJavaScript('document.getElementById("link-error").hidden')
  await about.webContents.executeJavaScript('document.querySelector("a[href]").click()')
  let after=true
  for(let i=0;i<40&&after;i++){await new Promise(r=>setTimeout(r,100));after=await about.webContents.executeJavaScript('document.getElementById("link-error").hidden')}
  const text=await about.webContents.executeJavaScript('document.getElementById("link-error").textContent')
  about.destroy();return{before,after,text}
 },aboutCode)
 assert.equal(result.before,true);assert.equal(result.after,false);assert.equal(result.text,'无法打开浏览器，请稍后重试。')
 console.log(JSON.stringify({id:'RPM-10',result:'PASS',...result}))
}finally{app?.process().kill('SIGKILL');await rm(directory,{recursive:true,force:true})}
