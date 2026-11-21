// UP-06 only: actual native picker, synthetic sources and isolated user data.
// All picker/React interactions are driven by the operator through CUA.
import {_electron as electron} from 'playwright'
import assert from 'node:assert/strict'
import {mkdtemp,mkdir,writeFile,realpath,readFile,cp,access} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {execFileSync} from 'node:child_process'

assert.equal(process.platform,'darwin','UP-06 is a real macOS-only acceptance check')
const root=await realpath(await mkdtemp(join(tmpdir(),'shakeink-import-native-'))),output=resolve('docs/novel-import/evidence')
const sources={
 'files/正文.txt':'第一章 渡口\r\n\r\n林舟十七岁。🖋️\r\n',
 'files/角色.md':'# 角色\n林舟携信渡河。\n',
 'folder/正文.txt':'第一章 归来\r\n\r\n许宁归来了。\r\n',
 'folder/附录/大纲.md':'# 大纲\n旧友重逢。\n',
}
for(const [path,text] of Object.entries(sources)){await mkdir(join(root,path,'..'),{recursive:true});await writeFile(join(root,path),text)}
execFileSync(process.execPath,['--import','tsx',resolve('tests/helpers/novel-import-native-seed.ts'),root],{cwd:resolve('.'),stdio:'pipe'})
const runtime=join(root,'ImportVerification.app'),bundleId='ink.shakeink.picker-verification.'+root.split('-').at(-1)
await cp(resolve('node_modules/electron/dist/Electron.app'),runtime,{recursive:true,dereference:false,verbatimSymlinks:true})
execFileSync('/usr/bin/plutil',['-replace','CFBundleIdentifier','-string',bundleId,join(runtime,'Contents/Info.plist')])
execFileSync('/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister',['-f',runtime])
let app,owned=false;const checks=[],errors=[]
async function stage(name,details={}){const state={name,root,runtime,bundleId,...details};await writeFile(join(root,'stage.json'),JSON.stringify(state));console.log(JSON.stringify(state))}
try{
 app=await electron.launch({executablePath:join(runtime,'Contents/MacOS/Electron'),args:[resolve('.')],env:{...process.env,SHAKEINK_TEST_ROOT:join(root,'data')},timeout:60000})
 const identity=await app.evaluate(({app})=>({pid:process.pid,root:process.env.SHAKEINK_TEST_ROOT,bootstrap:app.getPath('userData')}))
 assert.equal(identity.pid,app.process().pid);assert.equal(identity.root,join(root,'data'));assert.equal(identity.bootstrap,join(root,'data-bootstrap'));owned=true
 await app.evaluate(({session})=>{globalThis.__pickerRequests=0;session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_details,callback)=>{globalThis.__pickerRequests++;callback({cancel:true})})})
 const page=await app.firstWindow();page.on('pageerror',error=>errors.push(error.message));await stage('dismiss-model-notice');await page.getByRole('button',{name:'导入作品',exact:true}).waitFor({timeout:600000})
 const current=()=>page.evaluate(()=>window.desktop.novelImport({type:'current'}))
 const boot=await page.evaluate(()=>window.desktop.bootstrap());assert.equal(boot.dataRoot,join(root,'data'));assert.equal(boot.models.length,0)
 assert.equal(await page.getByRole('button',{name:'更多导入方式',exact:true}).count(),0)
 const menu=await app.evaluate(({Menu})=>Menu.getApplicationMenu().items.find(item=>item.label==='文件').submenu.items.map(item=>item.label))
 assert.ok(menu.includes('导入作品'));assert.ok(!menu.includes('导入作品文件夹'));checks.push('single sidebar entry and deduplicated actual macOS menu')
 await stage('choose-multiple-files',{path:join(root,'files')})
 await page.getByRole('heading',{name:'核对来源',exact:true}).waitFor({timeout:600000})
 const first=(await current()).view;assert.equal(first.files.filter(file=>file.included).length,2)
 async function verifyText(view,prefix){for(const file of view.files.filter(file=>file.included)){const result=await page.evaluate(({id,fileId})=>window.desktop.novelImport({type:'read-source',id,fileId}),{id:view.id,fileId:file.id});const key=Object.keys(sources).find(path=>path.startsWith(prefix+'/')&&file.name.endsWith(path.slice(prefix.length+1)));assert.ok(key,file.name);assert.equal(result.source.text,sources[key])}}
 await verifyText(first,'files');checks.push('same native panel selects multiple supported files with exact text')
 await stage('cancel-append')
 for(let i=0;;i++){try{await access(join(root,'cancel-checked'));break}catch{if(i>1200)throw Error('cancel-append operator timeout');await new Promise(resolve=>setTimeout(resolve,500))}}
 const after=(await current()).view;assert.equal(after.revision,first.revision);assert.deepEqual(after.files,first.files);checks.push('cancel native append preserves session revision and source list')
 await stage('discard-first')
 for(let i=0;(await current()).view;i++){if(i>1200)throw Error('discard operator timeout');await new Promise(resolve=>setTimeout(resolve,500))}
 await stage('choose-folder',{path:join(root,'folder')})
 for(let i=0;;i++){const view=(await current()).view;if(view&&view.id!==first.id&&view.phase==='source')break;if(i>1200)throw Error('folder selection operator timeout');await new Promise(resolve=>setTimeout(resolve,500))}
 const second=(await current()).view;assert.notEqual(second.id,first.id);assert.equal(second.files.filter(file=>file.included).length,2);assert.ok(second.files.some(file=>file.name.includes('附录/大纲.md')))
 await verifyText(second,'folder');checks.push('same native panel selects a folder and recursively extracts nested supported text')
 await page.screenshot({path:join(output,'unified-picker-native.png')})
 assert.equal(await app.evaluate(()=>globalThis.__pickerRequests),0);assert.deepEqual(errors,[])
 const evidence={id:'UP-06',passed:true,platform:process.platform,completedAt:new Date().toISOString(),root,bundleId,checks,remoteRequests:0,errors}
 await writeFile(join(output,'unified-picker-native.json'),JSON.stringify(evidence,null,2)+'\n');await stage('passed',evidence)
}catch(error){await stage('failed',{error:error.message});throw error}
finally{if(owned)await app?.close().catch(()=>{});console.log('Synthetic verification directory retained: '+root)}
