// Runs with an empty working directory and a deliberately minimal environment.
// The only application code loaded is the actual isolated package worker.
const assert=require('node:assert/strict')
const {readFile,writeFile,mkdir,rename,realpath}=require('node:fs/promises')
const {createRequire}=require('node:module')
const {Worker}=require('node:worker_threads')
const {join,sep}=require('node:path')
const {createHash}=require('node:crypto')
const {gunzipSync}=require('node:zlib')
let stage='initial'

async function main(){
 const [appRoot,input,evidence]=process.argv.slice(2),inside=path=>path.startsWith(appRoot+sep)
 assert.equal(await realpath(appRoot),appRoot);assert.equal(process.env.NODE_PATH,undefined);assert.equal(process.env.DISABLE_SYSTEM_FONTS_LOAD,'1')
 stage='native-canvas';const fromPackage=createRequire(join(appRoot,'package.json')),canvas=fromPackage('@napi-rs/canvas')
 assert.ok(inside(await realpath(fromPackage.resolve('@napi-rs/canvas'))))
 const bindings=Object.keys(require.cache).filter(path=>path.endsWith('.node'))
 assert.ok(bindings.length>0);for(const path of bindings)assert.ok(inside(await realpath(path)))
 assert.equal(canvas.GlobalFonts.families.length,0,'no user or system fonts may be loaded')
 stage='resource-hashes';const profile=JSON.parse(await readFile(join(input,'resource-manifest.json'),'utf8'))
 const digest=bytes=>createHash('sha256').update(bytes).digest('hex')
 for(const [name,expected]of Object.entries(profile.files))assert.equal(digest(await readFile(join(appRoot,'node_modules/pdfjs-dist',name))),expected,name)
 const fontPath=join(appRoot,'out/fonts/noto-sans-sc/NotoSansSC-Regular.ttf.gz'),compressed=await readFile(fontPath)
 assert.equal(digest(compressed),profile.fontGzipHash);assert.equal(digest(gunzipSync(compressed)),profile.fontHash)
 assert.equal(digest(await readFile(join(appRoot,'out/fonts/noto-sans-sc/LICENSE'))),'6a73f9541c2de74158c0e7cf6b0a58ef774f5a780bf191f2d7ec9cc53efe2bf2')
 assert.ok((await readFile(join(appRoot,'out/fonts/noto-sans-sc/README.md'),'utf8')).length>100)
 stage='worker-hash';const workerPath=join(appRoot,'dist/main/novel-import-pdf-worker.cjs'),workerHash=digest(await readFile(workerPath))
 const manifest=JSON.parse(await readFile(join(appRoot,'dist/runtime-dependencies.json'),'utf8'))
 assert.equal(manifest.entries.find(entry=>entry.path==='dist/main/novel-import-pdf-worker.cjs').sha256,workerHash)
 const bootstrap=`const {workerData}=require('node:worker_threads');for(const id of ['node:http','node:https']){const m=require(id);m.request=m.get=()=>{throw Error('NETWORK_DISABLED')}};for(const id of ['node:net','node:tls']){const m=require(id);m.connect=m.createConnection=()=>{throw Error('NETWORK_DISABLED')}};globalThis.fetch=()=>{throw Error('NETWORK_DISABLED')};require(workerData.workerPath);`
 async function run(name,page){
  const source=await readFile(join(input,name)),bytes=Uint8Array.from(source)
  return new Promise((resolve,reject)=>{
   const worker=new Worker(bootstrap,{eval:true,workerData:{workerPath},execArgv:[],env:{HOME:input,TMPDIR:input,DISABLE_SYSTEM_FONTS_LOAD:'1'},stdout:true,stderr:true})
   const diagnosticSeal=new SharedArrayBuffer(4)
   let final,output=false,settled=false
   const timer=setTimeout(()=>{worker.terminate();reject(Error('PDF_PROBE_TIMEOUT'))},page===undefined?120000:25000)
   for(const stream of [worker.stdout,worker.stderr])stream.on('data',()=>{output=true})
   worker.on('error',reject);worker.on('message',message=>{if(['result','failed'].includes(message.type))final=message})
   worker.on('exit',code=>{clearTimeout(timer);if(settled)return;settled=true;if(output||code!==0||!final||Atomics.load(new Int32Array(diagnosticSeal),0))reject(Error('PDF_PROBE_WORKER_FAILURE'));else resolve(final)})
   worker.postMessage({task:page===undefined?{type:'inspect',sourceTextPolicy:'current'}:{type:'preview',page},bytes,appRoot,diagnosticSeal},[bytes.buffer])
  })
 }
 await mkdir(evidence,{recursive:true})
 stage='inspect-original-L01'
 const inspection=await run('L01.pdf')
 assert.equal(inspection.type,'result','the packaged source decoder must inspect the complete original PDF')
 const extracted=inspection.value,ledger=extracted.pdfInspection,proof=ledger.sourceTextDecoding
 assert.equal(ledger.scanState,'complete');assert.equal(ledger.blocker,undefined);assert.equal(ledger.pageCount,178)
 assert.equal(ledger.imagePageCount,1);assert.equal(ledger.textOnlyPageCount,177)
 assert.equal(digest(extracted.text),'df2c0077a06e3935e05b7e9b9bdd802bafae9c2ca2bb79a8c65c80228712c6de')
 assert.equal(proof.policy,'gbk-euc-h-a1ad-v1')
 assert.equal(proof.proofHash,'41c9e9652712b7a03bf0489fcb711b4c299d255b455094700bfd033fdb39df31')
 assert.equal(proof.pages.reduce((n,page)=>n+page.changedOffsets.length,0),269)
 for(const [name,page,label]of [['sentinel.pdf',1,'sentinel'],['L01.pdf',89,'L01-page89'],['L01.pdf',178,'L01-page178']]){
  stage='preview-'+label
  const result=await run(name,page);if(result.type==='failed')stage+='-'+result.code;assert.equal(result.type,'result',`${label} rendering must succeed`)
  const bitmap=result.value;assert.ok(bitmap.png instanceof Uint8Array);assert.ok(bitmap.width*bitmap.height<=4000000)
  assert.ok(bitmap.width<=4096&&bitmap.height<=4096);assert.ok(bitmap.png.byteLength<=8*1024*1024)
  const image=await canvas.loadImage(bitmap.png),target=canvas.createCanvas(image.width,image.height),context=target.getContext('2d');context.drawImage(image,0,0)
  const pixels=context.getImageData(0,0,image.width,image.height).data;let ink=0
  for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]>0&&Math.min(pixels[i],pixels[i+1],pixels[i+2])<190)ink++
  assert.ok(ink>1000,`${label} cannot be an empty bitmap`)
  await writeFile(join(evidence,label+'.png'),bitmap.png)
 }
 // Mutations are confined to the disposable installation copy, restored even on failure.
 let negativeResources=0
 for(const path of [fontPath,join(appRoot,'out/fonts/noto-sans-sc/LICENSE'),join(appRoot,'node_modules/pdfjs-dist/cmaps/GBK-EUC-H.bcmap')]){
  stage='negative-resource-'+negativeResources
  const saved=path+'.pdf-test-saved';await rename(path,saved)
  try{
   const missing=await run('sentinel.pdf',1);stage+='-missing-'+missing.type+'-'+missing.code;assert.equal(missing.type,'failed');assert.equal(missing.code,'resource-missing');assert.equal(missing.value,undefined)
   await writeFile(path,'corrupt PDF resource')
   const corrupt=await run('sentinel.pdf',1);stage='negative-resource-'+negativeResources+'-corrupt-'+corrupt.type+'-'+corrupt.code;assert.equal(corrupt.type,'failed');assert.equal(corrupt.code,'resource-missing');negativeResources++
  }finally{await require('node:fs/promises').rm(path,{force:true});await rename(saved,path)}
 }
 await writeFile(join(evidence,'result.json'),JSON.stringify({workerHash,resourceProfileHash:digest(JSON.stringify(profile)),renderedPages:3,negativeResources,inspectedPages:178,sourceDecodedCharacters:269,sourceTextHash:digest(extracted.text),sourceProofHash:proof.proofHash},null,2)+'\n')
 process.stdout.write(JSON.stringify({passed:true,systemFonts:false,network:false,nativeArchitecture:process.arch,checkedResources:Object.keys(profile.files).length,renderedPages:3,negativeResources,inspectedPages:178,sourceDecodedCharacters:269,workerHash}))
}
main().catch(()=>{process.stderr.write('PDF_PACKAGE_PROBE_FAILED:'+stage+'\n');process.exitCode=1})
