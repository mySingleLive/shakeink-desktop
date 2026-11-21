import {readFile,writeFile,readdir,lstat,realpath,rm,mkdir,copyFile} from 'node:fs/promises'
import {join,dirname,relative,resolve,sep} from 'node:path'
import {createHash} from 'node:crypto'
import {createRequire,isBuiltin} from 'node:module'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {pathToFileURL,fileURLToPath} from 'node:url'

export const runtimeEntries=['dist/main/index.cjs','dist/service/index.cjs','dist/preload/index.cjs','dist/preload/maintenance.cjs','dist/preload/root-relocation.cjs','dist/main/novel-import-pdf-worker.cjs']
const digest=bytes=>createHash('sha256').update(bytes).digest('hex')
const inside=(root,path)=>path===root||path.startsWith(root+sep)
const slash=path=>path.split(sep).join('/')
const pruneSessions=new WeakMap()
const execute=promisify(execFile)
const externalReference=value=>typeof value==='string'?{specifier:value,kind:'require-call'}:value
async function plainChain(root,target){
 if(!inside(root,target))throw Error('Path escaped staging output')
 let path=root
 for(const part of ['',...relative(root,target).split(sep).filter(Boolean)]){
  path=join(path,part);const stat=await lstat(path)
  if(!stat.isDirectory()||stat.isSymbolicLink()||await realpath(path)!==path)throw Error(`Directory symbolic link or escape: ${path}`)
 }
}
async function regularBytes(root,path){
 const target=resolve(root,path)
 await plainChain(root,dirname(target));const stat=await lstat(target)
 if(!stat.isFile()||stat.isSymbolicLink())throw Error(`Invalid regular runtime resource: ${path}`)
 return readFile(target)
}
/** Mint a single-use capability before the builder writes into an empty, newly
 * allocated staging directory. Existing releases can never acquire one. */
export async function createPruneSession(project,staging){
 project=await realpath(project);staging=resolve(staging)
 await plainChain(project,staging)
 if(!inside(join(project,'release'),staging)||staging===join(project,'release')||(await readdir(staging)).length)throw Error('Pruning requires an empty new staging output')
 const stat=await lstat(staging),manifest=await regularBytes(project,'dist/runtime-dependencies.json')
 const session=Object.freeze({})
 pruneSessions.set(session,{project,staging,device:stat.dev,inode:stat.ino,manifest,used:false})
 return session
}
export function runtimePackageName(specifier){
 if(isBuiltin(specifier)||specifier==='electron')return null
 if(typeof specifier!=='string'||!/^(@[\w.-]+\/)?[\w.-]+(?:\/[\w./-]+)?$/.test(specifier)||specifier.split('/').some(x=>x==='.'||x==='..'))throw Error(`Unsupported external dependency: ${specifier}`)
 return specifier.startsWith('@')?specifier.split('/').slice(0,2).join('/'):specifier.split('/')[0]
}

/** Keep the installed official implementation, including its relative compiled
 * modules. packages:external alone would leave next's internal deep imports. */
export function bundleNextServer(project){
 const require=createRequire(join(project,'package.json'))
 return {name:'bundle-official-next-server',setup(builder){builder.onResolve({filter:/^next\//},args=>({path:require.resolve(args.path)}))}}
}

async function bundledLicenses(project,builds){
 const licenses=new Set()
 for(const {metafile} of builds)for(const input of Object.keys(metafile.inputs)){
  if(!input.startsWith('node_modules/next/'))continue
  let directory=dirname(resolve(project,input))
  const root=join(project,'node_modules/next')
  // A compiled dependency's license is separate from Next's MIT license.
  while(inside(root,directory)){
   const names=await readdir(directory)
   const found=names.filter(name=>/^(?:licen[cs]e|copying|notice)(?:[.-].*)?$/i.test(name))
   for(const name of found)if((await lstat(join(directory,name))).isFile())licenses.add(slash(relative(project,join(directory,name))))
   if(found.length||directory===root)break
   directory=dirname(directory)
  }
 }
 if(builds.some(x=>Object.keys(x.metafile.inputs).some(p=>p.startsWith('node_modules/next/')))){
  for(const name of await readdir(join(project,'node_modules/next')))if(/^licen[cs]e(?:[.-].*)?$/i.test(name))licenses.add('node_modules/next/'+name)
 }
 return Promise.all([...licenses].sort().map(async source=>({source,packagedPath:'runtime-licenses/bundled/'+source.slice('node_modules/'.length),sha256:digest(await readFile(join(project,source)))})))
}

export async function writeRuntimeDependencyManifest(project,builds){
 const entries=[]
 for(let index=0;index<runtimeEntries.length;index++){
  const path=runtimeEntries[index],metafile=builds[index].metafile
  const externals=[...new Map(Object.values(metafile.outputs).flatMap(output=>output.imports.filter(item=>item.external).map(item=>[`${item.kind}:${item.path}`,{specifier:item.path,kind:item.kind}]))).values()].sort((a,b)=>a.specifier.localeCompare(b.specifier)||a.kind.localeCompare(b.kind))
  for(const {specifier} of externals)runtimePackageName(specifier)
  if(externals.some(x=>x.specifier==='next'||x.specifier.startsWith('next/')))throw Error('Next server implementation was not bundled')
  entries.push({path,sha256:digest(await readFile(join(project,path))),externals})
 }
 const manifest={schemaVersion:1,entries,embeddedLicenses:await bundledLicenses(project,builds)}
 await writeFile(join(project,'dist/runtime-dependencies.json'),JSON.stringify(manifest,null,2)+'\n')
 return manifest
}

export async function copyBundledLicenses(project){
 const manifest=JSON.parse(await readFile(join(project,'dist/runtime-dependencies.json'),'utf8'))
 for(const item of manifest.embeddedLicenses){
  const source=resolve(project,item.source),destination=resolve(project,item.packagedPath)
  if(!inside(join(project,'node_modules'),source)||!inside(join(project,'runtime-licenses/bundled'),destination))throw Error('Invalid bundled license path')
  if(digest(await readFile(source))!==item.sha256)throw Error('Stale bundled license')
  await mkdir(dirname(destination),{recursive:true});await copyFile(source,destination)
 }
 return manifest.embeddedLicenses
}

async function manifestFor(appRoot){
 const manifest=JSON.parse(await regularBytes(appRoot,'dist/runtime-dependencies.json'))
 if(manifest.schemaVersion!==1||!Array.isArray(manifest.entries)||manifest.entries.length!==runtimeEntries.length||new Set(manifest.entries.map(x=>x.path)).size!==runtimeEntries.length||!runtimeEntries.every(path=>manifest.entries.some(x=>x.path===path)))throw Error('Incomplete runtime manifest')
 for(const item of manifest.entries){
  if(!Array.isArray(item.externals)||digest(await regularBytes(appRoot,item.path))!==item.sha256)throw Error(`Stale runtime entry: ${item.path}`)
  for(const value of item.externals){const {specifier,kind}=externalReference(value);runtimePackageName(specifier);if(!['require-call','dynamic-import','import-statement'].includes(kind))throw Error('Unsupported runtime import kind')}
 }
 for(const item of manifest.embeddedLicenses){
  const path=resolve(appRoot,item.packagedPath)
  if(!inside(join(appRoot,'runtime-licenses/bundled'),path)||digest(await regularBytes(appRoot,item.packagedPath))!==item.sha256)throw Error('Missing or stale bundled license')
 }
 return manifest
}

/** Resolve package roots via Node's search paths rather than package exports:
 * many retained packages intentionally do not export their package.json. */
async function packageAt(appRoot,from,name,optional=false){
 runtimePackageName(name)
 const require=createRequire(join(from,'__runtime_dependency_probe.cjs'))
 // A declared npm dependency can also be a Node builtin (string_decoder in
 // JSZip's stream stack). Resolve search paths via its metadata subpath so the
 // builtin's null search-path result cannot hide the installed npm package.
 for(const directory of require.resolve.paths(name+'/package.json')??[]){
  const candidate=join(directory,name)
  if(!inside(appRoot,candidate))continue
  try{
   const stat=await lstat(candidate)
   if(stat.isSymbolicLink()||!stat.isDirectory()||await realpath(candidate)!==candidate)throw Error(`Dependency symbolic link or escape: ${name}`)
   const metadataPath=join(candidate,'package.json'),metaStat=await lstat(metadataPath)
   if(!metaStat.isFile()||metaStat.isSymbolicLink())throw Error(`Invalid dependency metadata: ${name}`)
   const metadata=JSON.parse(await readFile(metadataPath,'utf8'))
   if(metadata.name!==name)throw Error(`Dependency identity mismatch: ${name}`)
   return {path:candidate,metadata}
  }catch(error){if(error.code!=='ENOENT')throw error}
 }
 if(!optional)throw Error(`Missing packaged dependency (no parent fallback): ${name}`)
 return null
}

async function packageDirectories(appRoot,directory=join(appRoot,'node_modules'),result=[]){
 for(const name of (await readdir(directory)).sort()){
  const path=join(directory,name),stat=await lstat(path)
  if(stat.isSymbolicLink())throw Error(`Dependency symbolic link: ${slash(relative(appRoot,path))}`)
  if(!stat.isDirectory())continue
  if(name.startsWith('@'))await packageDirectories(appRoot,path,result)
  else if(!name.startsWith('.'))result.push(path)
 }
 return result
}

async function assertDependencyTree(directory){
 for(const name of await readdir(directory)){
  const path=join(directory,name),stat=await lstat(path)
  if(stat.isSymbolicLink())throw Error(`Dependency symbolic link: ${path}`)
  if(stat.isDirectory())await assertDependencyTree(path)
  else if(!stat.isFile())throw Error(`Invalid dependency resource: ${path}`)
 }
}

export async function verifyRuntimeDependencies(applicationRoot){
 const appRoot=await realpath(applicationRoot)
 await plainChain(appRoot,join(appRoot,'node_modules'))
 const manifest=await manifestFor(appRoot),kept=new Map(),roots=new Set()
 async function visit(item){
  if(!item||kept.has(item.path))return
  kept.set(item.path,item.metadata)
  const metadata=item.metadata,optional=metadata.optionalDependencies??{}
  const required={...metadata.dependencies,...Object.fromEntries(Object.entries(metadata.peerDependencies??{}).filter(([name])=>!metadata.peerDependenciesMeta?.[name]?.optional))}
  for(const name of Object.keys(required).sort())if(!Object.hasOwn(optional,name))await visit(await packageAt(appRoot,item.path,name))
  for(const name of Object.keys(optional).sort())await visit(await packageAt(appRoot,item.path,name,true))
 }
 const imports=[]
 for(const entry of manifest.entries)for(const value of entry.externals){
  const {specifier,kind}=externalReference(value)
  const name=runtimePackageName(specifier);if(!name)continue
  roots.add(name);await visit(await packageAt(appRoot,dirname(join(appRoot,entry.path)),name))
  if(kind==='dynamic-import'||kind==='import-statement'){imports.push({specifier,parent:pathToFileURL(join(appRoot,entry.path)).href});continue}
  // Every emitted static/deep reference must resolve in the actual package.
  const path=await realpath(createRequire(join(appRoot,entry.path)).resolve(specifier))
  if(!inside(appRoot,path))throw Error(`External dependency escaped package: ${specifier}`)
 }
 if(imports.length){
  // Node's documented parent-URL resolver flag selects import conditions
  // without evaluating dependency code or weakening exports restrictions.
  const source='const refs=JSON.parse(process.argv[1]);console.log(JSON.stringify(refs.map(x=>import.meta.resolve(x.specifier,x.parent))))'
  const {stdout}=await execute(process.execPath,['--experimental-import-meta-resolve','--input-type=module','--eval',source,JSON.stringify(imports)],{timeout:30000,maxBuffer:1024*1024})
  for(const url of JSON.parse(stdout)){if(!url.startsWith('file:')||!inside(appRoot,await realpath(fileURLToPath(url))))throw Error('ES module dependency escaped package')}
 }
 const all=await packageDirectories(appRoot)
 await assertDependencyTree(join(appRoot,'node_modules'))
 return {roots:[...roots].sort(),kept:[...kept.keys()].map(path=>slash(relative(appRoot,path))).sort(),removed:all.filter(path=>!kept.has(path)).map(path=>slash(relative(appRoot,path))).sort()}
}

/** Called before signing/archiving, only for a newly built output under release.
 * Complete all validation before the first delete. Never touches project deps.
 * @param {string} project
 * @param {string} applicationRoot
 * @param {object} [session]
 */
export async function prunePackagedDependencies(project,applicationRoot,session=undefined){
 project=await realpath(project)
 const capability=pruneSessions.get(session),appRoot=resolve(applicationRoot)
 if(!capability||capability.used||capability.project!==project||!inside(capability.staging,appRoot)||appRoot===capability.staging)throw Error('Refusing to prune without this build staging capability')
 await plainChain(project,appRoot)
 const stage=await lstat(capability.staging)
 if(stage.dev!==capability.device||stage.ino!==capability.inode)throw Error('Staging identity changed')
 const inputManifest=await regularBytes(project,'dist/runtime-dependencies.json')
 if(!inputManifest.equals(capability.manifest)||!(await regularBytes(appRoot,'dist/runtime-dependencies.json')).equals(inputManifest))throw Error('Runtime manifest differs from build input')
 // Builder strips descriptive metadata from dependency package.json files.
 // PDF's offline resource profile seals the official original bytes. Restore
 // only that known transformation in this new capability-bound build output;
 // any other metadata change still fails before pruning or packaging.
 const pdfProfile=JSON.parse(await regularBytes(project,'desktop/main/novel-import-pdf-resource-manifest.json'))
 const pdfMetadataPath='node_modules/pdfjs-dist/package.json',pdfMetadata=await regularBytes(project,pdfMetadataPath)
 if(digest(pdfMetadata)!==pdfProfile.files['package.json'])throw Error('PDF metadata input differs from locked resource profile')
 const packagedPdf=await regularBytes(appRoot,pdfMetadataPath)
 if(!packagedPdf.equals(pdfMetadata)){
  const source=JSON.parse(pdfMetadata),actual=JSON.parse(packagedPdf)
  for(const key of ['keywords','bugs','scripts'])if(!Object.hasOwn(actual,key))delete source[key]
  if(JSON.stringify(actual)!==JSON.stringify(source))throw Error('Unexpected packaged PDF metadata transformation')
  await writeFile(join(appRoot,pdfMetadataPath),pdfMetadata)
 }
 const result=await verifyRuntimeDependencies(appRoot)
 const metadataPath=join(appRoot,'package.json'),metadata=JSON.parse(await regularBytes(appRoot,'package.json'))
 const dependencies={}
 for(const name of result.roots){const dependency=await packageAt(appRoot,appRoot,name);dependencies[name]=dependency.metadata.version??metadata.dependencies?.[name]??'*'}
 capability.used=true
 for(const path of result.removed){await plainChain(capability.staging,join(appRoot,'node_modules'));await rm(join(appRoot,path),{recursive:true})}
 metadata.dependencies=dependencies;delete metadata.devDependencies
 await writeFile(metadataPath,JSON.stringify(metadata,null,2)+'\n')
 return result
}
