import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {readFile,writeFile,mkdtemp,realpath,rm} from 'node:fs/promises'
import {join,resolve,dirname} from 'node:path'
import {createHash} from 'node:crypto'
import {PDFDocument,StandardFonts} from 'pdf-lib'
import {tmpdir} from 'node:os'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'

const require=createRequire(import.meta.url),project=resolve(import.meta.dirname,'../..'),execute=promisify(execFile)

test('NI-PDF15: packaged PDF rendering resolves only bundled CJK fonts, maps and native canvas offline',{timeout:180000},async t=>{
 const config=require(join(project,'electron-builder.config.cjs'))
 const {getMainFileMatchers}=require('app-builder-lib/out/fileMatcher.js')
 const packager={info:{config,projectDir:project,buildResourcesDir:'build',isPrepackedAppAsar:false,debugLogger:{isEnabled:false}}}
 const matchers=getMainFileMatchers(project,'/tmp/pdf-package-matcher',String,config.mac,packager,join(project,'release'),false)
 const allowed=(path:string)=>matchers.some((matcher:any)=>matcher.createFilter()(join(project,path),{isDirectory:()=>false}))
 assert.equal(allowed('dist/main/novel-import-pdf-worker.cjs'),true,'dedicated worker must enter the positive package list')
 for(const path of ['out/fonts/noto-sans-sc/NotoSansSC-Regular.ttf.gz','out/fonts/noto-sans-sc/LICENSE','out/fonts/noto-sans-sc/README.md'])assert.equal(allowed(path),true,path)
 for(const path of ['dist/main/novel-import-pdf-worker.cjs.map','design/novel-import/pdf-pages.html','docs/novel-import-real-books/private.json','dist/service/application-restore-worker.cjs'])assert.equal(allowed(path),false,path)
 const metadata=JSON.parse(await readFile(join(project,'package.json'),'utf8'))
 assert.equal(metadata.dependencies['@napi-rs/canvas'],'1.0.10','native canvas must be an exact direct production dependency')
 const {runtimeEntries}=await import('../../scripts/runtime-dependencies.mjs')
 assert.ok(runtimeEntries.includes('dist/main/novel-import-pdf-worker.cjs'))
 const root=process.env.SHAKEINK_PDF_PACKAGE_ROOT
 assert.ok(root,'set SHAKEINK_PDF_PACKAGE_ROOT to a freshly built isolated package, never the repository')
 const appRoot=await realpath(root)
 assert.ok(!appRoot.startsWith(project+'/')&&!appRoot.includes('/.cache/codex'),'probe must use an isolated installation copy')
 const origin=JSON.parse(await readFile(join(dirname(appRoot),'package-origin.json'),'utf8'))
 assert.equal(origin.isolatedAppRoot,appRoot)
 assert.deepEqual(origin.admission,{missingCapability:true,unexpectedMetadata:true,builderTransformation:true,usedCapability:true})
 const temporary=await realpath(await mkdtemp(join(tmpdir(),'shakeink-pdf-offline-')))
 try{
  const document=await PDFDocument.create(),font=await document.embedFont(StandardFonts.Helvetica)
  document.addPage([400,500]).drawText('Offline original PDF sentinel',{font,size:20,x:20,y:400})
  await writeFile(join(temporary,'sentinel.pdf'),await document.save())
  await writeFile(join(temporary,'resource-manifest.json'),await readFile(join(project,'desktop/main/novel-import-pdf-resource-manifest.json')))
  const original=await readFile('/Users/dt_flys/Documents/拆书/真实小说导入测试-20261026/原始小说/L01-老残游记.pdf')
  assert.equal(createHash('sha256').update(original).digest('hex'),'fb1a231fc2cf94f38412566ad200d0a6d245ca92cdb6bae565e5329b462e9598')
  await writeFile(join(temporary,'L01.pdf'),original)
  const environment={PATH:process.env.PATH??'',HOME:temporary,TMPDIR:temporary,DISABLE_SYSTEM_FONTS_LOAD:'1',NODE_ENV:'test' as const}
  const {stdout,stderr}=await execute(process.execPath,[join(project,'tests/fixtures/novel-import-pdf-package-probe.cjs'),appRoot,temporary,join(dirname(appRoot),'pdf-evidence')],{cwd:temporary,env:environment,timeout:165000,maxBuffer:256*1024})
  assert.equal(stderr,'');const result=JSON.parse(stdout)
  assert.equal(result.passed,true);assert.equal(result.systemFonts,false);assert.equal(result.network,false)
  assert.equal(result.nativeArchitecture,process.arch);assert.equal(result.negativeResources,3)
  assert.equal(result.renderedPages,3);assert.ok(result.checkedResources>=201)
  assert.equal(result.inspectedPages,178);assert.equal(result.sourceDecodedCharacters,269)
  t.diagnostic(JSON.stringify(result))
 }finally{await rm(temporary,{recursive:true,force:true})}
})
