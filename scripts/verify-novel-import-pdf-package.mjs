// Creates an unsigned, disposable native directory package for NI-PDF15 only.
// It does not install, launch, sign, publish or replace an application.
import {mkdtemp,mkdir,cp,realpath,writeFile,readFile} from 'node:fs/promises'
import assert from 'node:assert/strict'
import {join,dirname} from 'node:path'
import {tmpdir} from 'node:os'
import {fileURLToPath} from 'node:url'
import {createRequire} from 'node:module'
import {build,Platform} from 'electron-builder'
import {Arch} from 'builder-util'
import {createPruneSession,prunePackagedDependencies} from './runtime-dependencies.mjs'
import {verifyProjectResources} from './inspect-packaged-app.mjs'

if(process.platform!=='darwin')throw Error('NI-PDF15 native package harness currently covers macOS only')
const project=dirname(dirname(fileURLToPath(import.meta.url))),require=createRequire(import.meta.url)
const base=require(join(project,'electron-builder.config.cjs'))
const stagingRoot=join(project,'release/.staging');await mkdir(stagingRoot,{recursive:true})
const staging=await mkdtemp(join(stagingRoot,'novel-pdf-')),capability=await createPruneSession(project,staging)
let applicationRoot
const admission={missingCapability:false,unexpectedMetadata:false,builderTransformation:false,usedCapability:false}
await build({projectDir:project,publish:'never',targets:Platform.MAC.createTarget('dir',Arch[process.arch]),config:{
 ...base,forceCodeSigning:false,electronDist:join(project,'node_modules/electron/dist'),
 directories:{...base.directories,output:staging},mac:{...base.mac,identity:null,notarize:false,target:['dir']},
 afterPack:async context=>{
  applicationRoot=join(context.appOutDir,context.packager.appInfo.productFilename+'.app','Contents/Resources/app')
  const pdfMetadataPath=join(applicationRoot,'node_modules/pdfjs-dist/package.json'),builderBytes=await readFile(pdfMetadataPath)
  await assert.rejects(prunePackagedDependencies(project,applicationRoot),/capability/)
  assert.ok((await readFile(pdfMetadataPath)).equals(builderBytes));admission.missingCapability=true
  const tampered=JSON.parse(builderBytes);tampered.unexpectedPdfTestField=true
  const tamperedBytes=Buffer.from(JSON.stringify(tampered));await writeFile(pdfMetadataPath,tamperedBytes)
  await assert.rejects(prunePackagedDependencies(project,applicationRoot,capability),/Unexpected packaged PDF metadata transformation/)
  assert.ok((await readFile(pdfMetadataPath)).equals(tamperedBytes));admission.unexpectedMetadata=true
  await writeFile(pdfMetadataPath,builderBytes)
  await prunePackagedDependencies(project,applicationRoot,capability)
  assert.ok((await readFile(pdfMetadataPath)).equals(await readFile(join(project,'node_modules/pdfjs-dist/package.json'))));admission.builderTransformation=true
  await assert.rejects(prunePackagedDependencies(project,applicationRoot,capability),/capability/);admission.usedCapability=true
  await verifyProjectResources(project,applicationRoot)
 },
}})
if(!applicationRoot)throw Error('PDF package afterPack did not execute')
const isolated=await realpath(await mkdtemp(join(tmpdir(),'shakeink-novel-pdf-package-'))),root=join(isolated,'app')
await cp(applicationRoot,root,{recursive:true,dereference:false,errorOnExist:true,force:false})
await writeFile(join(isolated,'package-origin.json'),JSON.stringify({scope:'NI-PDF15 only; unsigned actual builder package copied outside the repository; no application launch',platform:process.platform,arch:process.arch,staging,applicationRoot,isolatedAppRoot:root,admission},null,2)+'\n')
console.log(JSON.stringify({stage:'novel-import-pdf-isolated-package-ready',appRoot:root,scope:'macOS resource and PDF worker validation only'}))
