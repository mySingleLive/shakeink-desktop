import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp, mkdir, readFile, writeFile, rm, readdir, symlink, lstat} from 'node:fs/promises'
import {join,dirname} from 'node:path'
import {tmpdir} from 'node:os'
import {randomBytes} from 'node:crypto'
import {gzipSync, gunzipSync} from 'node:zlib'

const load = () => import('../../scripts/macos-release.mjs')
const team = 'ABC1234567'
const identity = {name: `Developer ID Application: Fixture (${team})`, hash: 'A'.repeat(40), teamId: team}
const securityText = `  1) ${identity.hash} "${identity.name}"\n     1 valid identities found`
const temporary = async (fn: (dir: string) => Promise<void>) => {const dir = await mkdtemp(join(tmpdir(), 'shakeink-mac-release-test-')); try {await fn(dir)} finally {await rm(dir, {recursive:true, force:true})}}
const display = (id = team) => `Authority=Developer ID Application: Fixture (${id})\nAuthority=Developer ID Certification Authority\nAuthority=Apple Root CA\nTeamIdentifier=${id}\nTimestamp=Oct 16, 2026 at 10:00:00\nCodeDirectory v=20500 flags=0x10000(runtime) hashes=1+1 location=embedded`
const entitlement = '<?xml version="1.0"?><plist version="1.0"><dict><key>com.apple.security.cs.allow-jit</key><true/></dict></plist>'
const fixtureApp = async (dir: string) => {const app = join(dir, '玄印写作.app'); for(const sub of ['Contents/MacOS','Contents/Resources/app']) await mkdir(join(app,sub),{recursive:true}); for(const name of ['Contents/MacOS/玄印写作','Contents/Resources/app/addon.node','Contents/Resources/app/lib.dylib','Contents/Resources/app/helper']) await writeFile(join(app,name),Buffer.from([0xcf,0xfa,0xed,0xfe,0,0,0,0])); return app}
const signatureRun = (calls: any[], mutate?: (tool:string,args:string[])=>any) => async (tool: string, args: string[]) => {calls.push({tool,args}); const value = mutate?.(tool,args); if(value !== undefined) return value; if(tool.endsWith('codesign') && args.includes('--entitlements')) return {stdout:entitlement,stderr:''}; if(tool.endsWith('codesign') && args.includes('--display')) return {stdout:'',stderr:display()}; if(tool.endsWith('lipo'))return {stdout:'arm64\n',stderr:''}; return {stdout:'',stderr:''}}

test('MACREL-02 actual release policy rejects unknown/ambiguous targets and preserves Windows', async () => {
  const {releaseMode,createPackagingConfiguration} = await load()
  for(const args of [[],['--dmg'],['--zip']])assert.equal(releaseMode('darwin',args),'release')
  assert.equal(releaseMode('darwin',['--dir']),'local')
  assert.equal(releaseMode('win32',[]),'windows')
  assert.equal(releaseMode('win32',['--dir']),'windows')
  assert.equal(releaseMode('win32',['--zip']),'windows')
  assert.equal(releaseMode('linux',[]),'linux')
  for(const target of ['--dir','--AppImage','--deb','--rpm'])assert.equal(releaseMode('linux',[target]),'linux')
  for(const [platform,args] of [['darwin',['--oops']],['darwin',['--dir','--zip']],['win32',['--dmg']],['linux',['--dmg']],['linux',['--dir','--AppImage']]] as const)assert.throws(()=>releaseMode(platform,[...args]))
  const base:any={publish:null,forceCodeSigning:true,mac:{hardenedRuntime:true},win:{signAndEditExecutable:true,signExecutable:false},dmg:{sign:false},directories:{output:'release'}}
  const config=createPackagingConfiguration(base,{platform:'darwin',target:'dmg',identity,staging:'/tmp/stage'})
  assert.equal(config.mac.identity,identity.hash); assert.equal(config.mac.notarize,true); assert.equal(config.forceCodeSigning,true); assert.equal(config.dmg.sign,true); assert.equal(config.dmg.writeUpdateInfo,false); assert.equal(config.directories.output,'/tmp/stage')
  const local=createPackagingConfiguration(base,{platform:'darwin',target:'dir'})
  assert.equal(local.mac.identity,null);assert.equal(local.mac.notarize,false);assert.equal(local.forceCodeSigning,false)
  const win=createPackagingConfiguration(base,{platform:'win32'})
  assert.equal(win.forceCodeSigning,false);assert.deepEqual(win.win,base.win);assert.equal(win.publish,null);assert.equal(base.dmg.sign,false)
  const linux=createPackagingConfiguration(base,{platform:'linux'})
  assert.equal(linux.forceCodeSigning,false);assert.deepEqual(linux.mac,base.mac);assert.equal(linux.publish,null)
})

test('MACREL-03 identity parsing requires valid Developer ID and a unique selection', async () => {
 const {selectDeveloperIdentity}=await load()
 assert.deepEqual(selectDeveloperIdentity(securityText),identity)
 for(const text of ['', '0 valid identities found', securityText.replace('Developer ID Application','Apple Development'), securityText.replace('"\n','" (CSSMERR_TP_CERT_EXPIRED)\n')])assert.throws(()=>selectDeveloperIdentity(text))
 const second={name:'Developer ID Application: Second (XYZ1234567)',hash:'B'.repeat(40),teamId:'XYZ1234567'}
 const multiple=securityText+`\n 2) ${second.hash} "${second.name}"`
 assert.throws(()=>selectDeveloperIdentity(multiple));assert.throws(()=>selectDeveloperIdentity(multiple,'Developer ID'));assert.throws(()=>selectDeveloperIdentity(multiple,'missing'))
 assert.deepEqual(selectDeveloperIdentity(multiple,second.hash),second);assert.deepEqual(selectDeveloperIdentity(multiple,identity.name),identity)
})

test('MACREL-04 preflight fails closed before build and never exposes credential error text', async () => {
 const {preflightMacRelease}=await load();const calls:any[]=[]
 const run=async(tool:string,args:string[])=>{calls.push({tool,args});return {stdout:tool.endsWith('security')?securityText:tool.endsWith('spctl')?'assessments enabled\n':args.includes('history')?'{"history":[]}':'/usr/bin/tool\n',stderr:''}}
 await assert.rejects(preflightMacRelease({env:{},run}));assert.equal(calls.length,0)
 const result=await preflightMacRelease({env:{APPLE_KEYCHAIN_PROFILE:'fixture-profile'},run})
 assert.deepEqual(result.identity,identity);assert.equal(result.profile,'fixture-profile')
 assert(calls.some(call=>call.tool.endsWith('security')&&call.args.includes('-v')));assert(calls.some(call=>call.args.includes('notarytool')));assert(calls.some(call=>call.args.includes('stapler')))
 assert(calls.some(call=>call.args.includes('history')))
 assert(calls.some(call=>call.tool==='/usr/bin/xcrun'&&JSON.stringify(call.args)===JSON.stringify(['--find','codesign'])))
 assert(!calls.some(call=>call.tool==='/usr/bin/codesign'&&call.args.includes('--version')))
 const missingToolCalls:any[]=[]
 await assert.rejects(preflightMacRelease({env:{APPLE_KEYCHAIN_PROFILE:'fixture'},run:async(tool:string,args:string[])=>{
  missingToolCalls.push({tool,args})
  if(tool==='/usr/bin/xcrun'&&args[0]==='--find'&&args[1]==='codesign')throw new Error('controlled missing executable')
  return run(tool,args)
 }}),/发布工具失败：xcrun/)
 assert(!missingToolCalls.some(call=>call.args.includes('history')))
 await assert.rejects(preflightMacRelease({env:{APPLE_KEYCHAIN_PROFILE:'fixture'},run:async(tool:string,args:string[])=>tool.endsWith('spctl')?{stdout:'assessments disabled\n'}:run(tool,args)}),/Gatekeeper/)
 for(const key of ['APPLE_ID','APPLE_APP_SPECIFIC_PASSWORD','APPLE_API_KEY','APPLE_API_KEY_ID','APPLE_API_ISSUER']){
  let called=false;const secret='PRIVATE-AUTH-VALUE';await assert.rejects(preflightMacRelease({env:{APPLE_KEYCHAIN_PROFILE:'fixture',[key]:secret},run:async()=>{called=true;throw new Error('unexpected')}}),error=>!String(error).includes(secret));assert.equal(called,false)
 }
 await assert.rejects(preflightMacRelease({env:{APPLE_KEYCHAIN_PROFILE:'not-configured'},run:async(tool:string,args:string[])=>{if(args.includes('history'))throw new Error('private credential diagnostic');return run(tool,args)}}),error=>!String(error).includes('private credential diagnostic'))
 const secret='DO-NOT-PRINT-SECRET'
 await assert.rejects(preflightMacRelease({env:{APPLE_KEYCHAIN_PROFILE:secret},run:async()=>{throw new Error(secret)}}),error=>!String(error).includes(secret))
})

test('MACREL-04 native macOS preflight tool probes use supported xcrun options without accessing credentials', {skip:process.platform!=='darwin',timeout:30000}, async () => {
 const {preflightMacRelease,runChecked}=await load();const nativeCalls:{tool:string,args:string[]}[]=[]
 await preflightMacRelease({env:{APPLE_KEYCHAIN_PROFILE:'controlled-profile-no-keychain-access'},run:async(tool:string,args:string[],options:any)=>{
  if(tool==='/usr/bin/xcrun'&&args.length===2&&args[0]==='--find'||tool==='/usr/bin/codesign'&&args.length===1&&args[0]==='--version'){
   nativeCalls.push({tool,args});return runChecked(tool,args,{...options,timeout:5000})
  }
  if(tool==='/usr/bin/security')return {stdout:securityText}
  if(tool==='/usr/sbin/spctl')return {stdout:'assessments enabled\n'}
  if(tool==='/usr/bin/xcrun'&&args[0]==='notarytool'&&args[1]==='history')return {stdout:'{"history":[]}'}
  throw new Error('Unexpected command in native tool probe regression')
 }})
 assert.deepEqual(nativeCalls,['notarytool','stapler','syspolicy_check','codesign'].map(tool=>({tool:'/usr/bin/xcrun',args:['--find',tool]})))
})

test('MACREL-05 scans all native code and executes Apple trust gates with external Team',async()=>temporary(async dir=>{
 const {verifyMacSignature}=await load();const app=await fixtureApp(dir);const calls:any[]=[]
 await assert.rejects(verifyMacSignature(app,{arch:'arm64',run:signatureRun(calls)}));assert.equal(calls.length,0)
 const result=await verifyMacSignature(app,{teamId:team,arch:'arm64',run:signatureRun(calls)})
 assert.equal(result.teamId,team)
 for(const suffix of ['玄印写作.app','addon.node','lib.dylib','helper'])assert(calls.some(call=>call.tool.endsWith('codesign')&&call.args.includes('--verify')&&call.args.at(-1).endsWith(suffix)))
 assert(calls.some(call=>call.args.includes('--deep')&&call.args.includes('--strict')))
 assert(calls.filter(call=>call.tool.endsWith('codesign')&&call.args.includes('--verify')).every(call=>call.args.some((arg:string)=>arg.includes('anchor apple')&&arg.includes(team))))
 assert(calls.filter(call=>call.tool.endsWith('codesign')&&call.args.includes('--verify')).every(call=>call.args[call.args.indexOf('-R')+1]?.startsWith('=anchor apple')))
 for(const tool of ['stapler','syspolicy_check','spctl'])assert(calls.some(call=>call.tool.endsWith(tool)||call.args.includes(tool)))
}))

test('MACREL-05 native codesign accepts the inline requirement syntax; credential and artifact trust ports remain controlled', {skip:process.platform!=='darwin',timeout:30000}, async()=>temporary(async dir=>{
 const {verifyMacSignature,runChecked}=await load();const app=await fixtureApp(dir),controlled=signatureRun([]),nativeCalls:string[][]=[]
 await verifyMacSignature(app,{teamId:team,arch:'arm64',run:async(tool:string,args:string[])=>{
  if(tool==='/usr/bin/codesign'&&args.includes('--verify')){
   const requirementIndex=args.indexOf('-R')+1;assert(requirementIndex>0)
   const nativeArgs=[...args]
   // Keep the production argument's inline marker. Only the requirement body
   // and file are controlled: this tests CLI grammar, not fixture trust.
   nativeArgs[requirementIndex]=(args[requirementIndex].startsWith('=')?'=':'')+'anchor apple'
   nativeArgs[nativeArgs.length-1]='/usr/bin/true'
   const result=await runChecked(tool,nativeArgs,{timeout:5000});nativeCalls.push(nativeArgs);return result
  }
  return controlled(tool,args)
 }})
 assert.equal(nativeCalls.length,5)
 assert(nativeCalls.every(args=>args[args.indexOf('-R')+1]==='=anchor apple'))
}))

test('MACREL-05 nested wrong Team, excess entitlements, architecture and OS gate failures reject',async()=>temporary(async dir=>{
 const {verifyMacSignature}=await load();const app=await fixtureApp(dir)
 await assert.rejects(verifyMacSignature(app,{teamId:team,arch:'arm64',run:signatureRun([], (tool,args)=>tool.endsWith('codesign')&&args.includes('--display')&&args.at(-1)?.endsWith('addon.node')?{stderr:display('XYZ1234567')}:undefined)}))
 await assert.rejects(verifyMacSignature(app,{teamId:team,arch:'arm64',run:signatureRun([], (tool,args)=>args.includes('--entitlements')?{stdout:entitlement.replace('</dict>','<key>com.apple.security.cs.disable-library-validation</key><true/></dict>')}:undefined)}))
 await assert.rejects(verifyMacSignature(app,{teamId:team,arch:'x64',run:signatureRun([])}))
 for(const failing of ['stapler','syspolicy_check','spctl'])await assert.rejects(verifyMacSignature(app,{teamId:team,arch:'arm64',run:signatureRun([], (tool,args)=>{if(tool.endsWith(failing)||args.includes(failing))throw new Error('fixture gate failure')})}))
}))

// Stored ZIP fixture builder preserves duplicate raw names, unlike JSZip's map.
function rawZip(entries:{name:string;data?:string;mode?:number}[]) {
 const crc=(b:Buffer)=>{let n=0xffffffff;for(const c of b){n^=c;for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0)}return (n^0xffffffff)>>>0}
 const locals:Buffer[]=[],central:Buffer[]=[];let offset=0
 for(const entry of entries){const name=Buffer.from(entry.name),data=Buffer.from(entry.data??'');const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt32LE(crc(data),14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(name.length,26);locals.push(local,name,data)
  const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(0x314,4);c.writeUInt16LE(20,6);c.writeUInt16LE(0x800,8);c.writeUInt32LE(crc(data),16);c.writeUInt32LE(data.length,20);c.writeUInt32LE(data.length,24);c.writeUInt16LE(name.length,28);c.writeUInt32LE(((entry.mode??(entry.name.endsWith('/')?0o40755:0o100644))*65536)>>>0,38);c.writeUInt32LE(offset,42);central.push(c,name);offset+=local.length+name.length+data.length
 }const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...locals,directory,end])
}

test('MACREL-09 raw ZIP path, duplicate, collision and link graph attacks fail before extraction',async()=>temporary(async dir=>{
 const {validateZipArchive}=await load()
 const root='玄印写作.app/'
 const cases=[
  [{name:'/tmp/escape'}],[{name:root+'../escape'}],[{name:'other.app/a'}],
  [{name:root+'a'},{name:root+'a'}],[{name:root+'a'},{name:root+'a/'}],[{name:root+'a'},{name:root+'a/b'}],
  [{name:root+'A'},{name:root+'a'}],[{name:root+'é'},{name:root+'e\u0301'}],
  [{name:root+'link',data:'/tmp',mode:0o120777}],[{name:root+'link',data:'../../escape',mode:0o120777}],
  [{name:root+'a',data:'b',mode:0o120777},{name:root+'b',data:'a',mode:0o120777}],
  [{name:root+'link',data:'safe',mode:0o120777},{name:root+'link/write',data:'escape'}],
  [{name:root+'LINK',data:'safe',mode:0o120777},{name:root+'link/write',data:'escape'}],
 ]
 for(let i=0;i<cases.length;i++){const file=join(dir,`bad-${i}.zip`);await writeFile(file,rawZip(cases[i]));await assert.rejects(validateZipArchive(file),`case ${i}`)}
 const safe=join(dir,'safe.zip');await writeFile(safe,rawZip([{name:root},{name:root+'Contents/Frameworks/Electron.framework/Versions/A/Electron',data:'native'}, {name:root+'Contents/Frameworks/Electron.framework/Versions/Current',data:'A',mode:0o120777},{name:root+'Contents/Frameworks/Electron.framework/Electron',data:'Versions/Current/Electron',mode:0o120777}]))
 const manifest=await validateZipArchive(safe);assert.equal(manifest.entries.length,4)
}))

test('MACREL-09 local-header path disagreement and ZIP64 fail closed',async()=>temporary(async dir=>{
 const {validateZipArchive}=await load();const buffer=rawZip([{name:'玄印写作.app/a'}]);buffer[30]=0x2f;const file=join(dir,'headers.zip');await writeFile(file,buffer);await assert.rejects(validateZipArchive(file))
 const zip64=rawZip([{name:'玄印写作.app/a'}]);zip64.writeUInt16LE(0xffff,zip64.length-12);await writeFile(file,zip64);await assert.rejects(validateZipArchive(file))
}))

test('MACREL-07 real final metadata and every block are independently verified',async()=>temporary(async dir=>{
 const {generateArtifactMetadata,verifyArtifactMetadata}=await load();const path=join(dir,'fixture.zip');await writeFile(path,randomBytes(180000));const metadata=await generateArtifactMetadata(path)
 assert.equal(metadata.name,'fixture.zip');assert.equal(metadata.size,180000);assert.match(metadata.sha256,/^[a-f0-9]{64}$/);assert.equal((await verifyArtifactMetadata(dir,metadata)).size,180000)
 const blockmapPath=join(dir,metadata.blockmap.name);const original=await readFile(blockmapPath);const map=JSON.parse(gunzipSync(original).toString());map.files[0].checksums[0]=Buffer.alloc(18).toString('base64');await writeFile(blockmapPath,gzipSync(JSON.stringify(map)))
 // Recomputed sidecar hash must not bypass actual chunk verification.
 const {createHash}=await import('node:crypto');const forged={...metadata,blockmap:{...metadata.blockmap,sha256:createHash('sha256').update(await readFile(blockmapPath)).digest('hex'),size:(await readFile(blockmapPath)).length}}
 await assert.rejects(verifyArtifactMetadata(dir,forged));await writeFile(blockmapPath,original)
 const bytes=await readFile(path);bytes[0]^=0xff;await writeFile(path,bytes);await assert.rejects(verifyArtifactMetadata(dir,metadata));await writeFile(path,bytes.subarray(0,100));await assert.rejects(verifyArtifactMetadata(dir,metadata))
}))

test('MACREL-07 metadata rejects symlink files, traversal and damaged blockmaps',async()=>temporary(async dir=>{
 const {generateArtifactMetadata,verifyArtifactMetadata}=await load();const path=join(dir,'artifact.dmg');await writeFile(path,randomBytes(40000));const metadata=await generateArtifactMetadata(path);await symlink(path,join(dir,'linked.dmg'));await assert.rejects(generateArtifactMetadata(join(dir,'linked.dmg')));await assert.rejects(verifyArtifactMetadata(dir,{...metadata,name:'../artifact.dmg'}));await writeFile(join(dir,metadata.blockmap.name),'bad gzip');await assert.rejects(verifyArtifactMetadata(dir,metadata))
}))

test('MACREL-06/10 finalization only accepts Accepted and publishes after gates/final-byte metadata',async()=>temporary(async dir=>{
 const {finalizeMacRelease,verifyReleaseDirectory}=await load();await writeFile(join(dir,'package.json'),JSON.stringify({version:'0.1.0-alpha'}));const release=join(dir,'release');await mkdir(release);const stage=join(release,'.staging','fixture');await mkdir(stage,{recursive:true});const name='ShakeInk-0.1.0-alpha-mac-arm64.dmg';await writeFile(join(stage,name),randomBytes(50000));const order:string[]=[]
 const run=async(tool:string,args:string[])=>{if(args.includes('notarytool')){order.push('notary');return {stdout:'{"status":"Accepted"}'}}if(args.includes('staple')){order.push('staple');await writeFile(join(stage,name),Buffer.concat([await readFile(join(stage,name)),Buffer.from('ticket')]))}if(args.includes('validate'))order.push('validate');return {stdout:''}}
 const result=await finalizeMacRelease(dir,stage,{arch:'arm64',identity,profile:'fixture-profile',artifacts:[name],run,verifyArtifact:async()=>{order.push('verify');return {scope:'controlled trust port only'}}})
 assert.deepEqual(order,['notary','staple','validate','verify']);assert.match(result.directory,/verified-macos-arm64-/);assert.equal(result.manifest.artifacts[0].size,50006);assert.equal((await readdir(release)).filter(n=>n.startsWith('verified-')).length,1)
 await assert.rejects(verifyReleaseDirectory(dir,result.directory,{}));await assert.rejects(verifyReleaseDirectory(dir,result.directory,{teamId:'XYZ1234567',arch:'arm64',run}))
 const calls:any[]=[];const manifestPath=join(result.directory,'release.json');const manifest=JSON.parse(await readFile(manifestPath,'utf8'));manifest.passed=true;manifest.artifacts.push(manifest.artifacts[0]);await writeFile(manifestPath,JSON.stringify(manifest));await assert.rejects(verifyReleaseDirectory(dir,result.directory,{teamId:team,arch:'arm64',run:signatureRun(calls)}));assert.equal(calls.length,0)
}))

test('MACREL-06/08/10 rejected, pending, malformed, missing target or trust error never promotes',async()=>temporary(async dir=>{
 const {finalizeMacRelease}=await load();await writeFile(join(dir,'package.json'),JSON.stringify({version:'0.1.0-alpha'}));await mkdir(join(dir,'release'))
 for(const [index,status]of ['Rejected','Invalid','In Progress','malformed','throw','verify'].entries()){
  const stage=join(dir,'release','.staging',String(index));await mkdir(stage,{recursive:true});const name='ShakeInk-0.1.0-alpha-mac-arm64.dmg';await writeFile(join(stage,name),'fixture')
  await assert.rejects(finalizeMacRelease(dir,stage,{arch:'arm64',identity,profile:'fixture',artifacts:[name],run:async(_tool:string,args:string[])=>{if(args.includes('notarytool')){if(status==='throw')throw new Error('SECRET');return {stdout:status==='malformed'?'bad':JSON.stringify({status:status==='verify'?'Accepted':status})}}return {stdout:''}},verifyArtifact:async()=>{throw new Error('trust failure')}}))
  assert(!(await readdir(stage)).includes('release.json'))
 }
 const stage=join(dir,'release','.staging','missing');await mkdir(stage,{recursive:true});await assert.rejects(finalizeMacRelease(dir,stage,{arch:'arm64',identity,profile:'fixture',artifacts:[],targets:['dmg','zip'],run:async()=>({stdout:''})}));assert.equal((await readdir(join(dir,'release'))).filter(n=>n.startsWith('verified-')).length,0)
}))

test('MACREL-08 independent verification rejects manifest tampering and always reruns Apple checks',async()=>temporary(async dir=>{
 const {finalizeMacRelease,verifyReleaseDirectory}=await load();await writeFile(join(dir,'package.json'),JSON.stringify({version:'0.1.0-alpha'}));const stage=join(dir,'release','.staging','fixture');await mkdir(stage,{recursive:true});const name='ShakeInk-0.1.0-alpha-mac-arm64.dmg';await writeFile(join(stage,name),randomBytes(45000))
 const {directory}=await finalizeMacRelease(dir,stage,{arch:'arm64',identity,profile:'fixture',artifacts:[name],targets:['dmg'],run:async(_tool:string,args:string[])=>({stdout:args.includes('notarytool')?' {"status":"Accepted"}':''}),verifyArtifact:async()=>({})})
 const path=join(directory,'release.json'),original=JSON.parse(await readFile(path,'utf8'))
 const mutations=[(m:any)=>{m.version='9.9.9'},(m:any)=>{m.arch='x64'},(m:any)=>{m.teamId='XYZ1234567'},(m:any)=>{m.artifacts[0].name='../evil.dmg'},(m:any)=>{m.artifacts[0].name='/tmp/evil.dmg'},(m:any)=>{m.targets=['dmg','zip']},(m:any)=>{m.artifacts[0].sha256='0'.repeat(64)},(m:any)=>{m.passed=true}]
 for(const mutate of mutations){const manifest=structuredClone(original);mutate(manifest);await writeFile(path,JSON.stringify(manifest));let called=false;await assert.rejects(verifyReleaseDirectory(dir,directory,{teamId:team,arch:'arm64',run:async()=>{called=true;throw new Error('unexpected')}}));assert.equal(called,false)}
 await writeFile(path,JSON.stringify(original));const calls:any[]=[]
 await assert.rejects(verifyReleaseDirectory(dir,directory,{teamId:team,arch:'arm64',run:async(tool:string,args:string[])=>{calls.push({tool,args});throw new Error('OS verifier unavailable')}}),/hdiutil/)
 assert.equal(calls.length,1);assert.equal(calls[0].args[0],'verify')
 await symlink(join(directory,name),join(directory,'undeclared-link'));await assert.rejects(verifyReleaseDirectory(dir,directory,{teamId:team,arch:'arm64',run:async()=>{throw new Error('unexpected')}}),/未声明/)
}))

test('MACREL-05 missing timestamp/runtime/JIT, unsigned nested code, and escaping app links reject',async()=>temporary(async dir=>{
 const {verifyMacSignature}=await load();const app=await fixtureApp(dir)
 for(const changed of [display().replace(/^Timestamp=.*\n/m,''),display().replace('0x10000(runtime)','0x0(none)'),display().replace('Authority=Apple Root CA','Authority=Untrusted CA')])await assert.rejects(verifyMacSignature(app,{teamId:team,arch:'arm64',run:signatureRun([], (tool,args)=>tool.endsWith('codesign')&&args.includes('--display')&&!args.includes('--entitlements')?{stderr:changed}:undefined)}))
 await assert.rejects(verifyMacSignature(app,{teamId:team,arch:'arm64',run:signatureRun([],(_tool,args)=>args.includes('--entitlements')?{stdout:'<plist><dict/></plist>'}:undefined)}))
 await assert.rejects(verifyMacSignature(app,{teamId:team,arch:'arm64',run:signatureRun([], (tool,args)=>{if(tool.endsWith('codesign')&&args.includes('--verify')&&args.at(-1)?.endsWith('lib.dylib'))throw new Error('unsigned')})}))
 await symlink('/tmp',join(app,'Contents/Resources/escape'));await assert.rejects(verifyMacSignature(app,{teamId:team,arch:'arm64',run:signatureRun([])}),/链接/)
}))

test('MACREL-09 real ZIP CRC precedes ditto and inner trust; corrupt CRC stops before extraction',{skip:process.platform!=='darwin'},async()=>temporary(async dir=>{
 const {verifyMacArtifact,runChecked}=await load()
 const archive=rawZip([{name:'玄印写作.app/Contents/MacOS/玄印写作',data:'controlled fixture, not an executable'}])
 const path=join(dir,'fixture.zip');await writeFile(path,archive)
 const calls:{tool:string;args:string[]}[]=[]
 await assert.rejects(verifyMacArtifact(dir,path,{teamId:team,arch:'arm64',run:async(tool,args,options)=>{
  calls.push({tool,args})
  if(tool.endsWith('unzip')||tool.endsWith('ditto'))return runChecked(tool,args,options)
  assert.equal(tool,'/usr/bin/codesign');assert(args.includes('--verify'))
  const extracted=args.at(-1)!;assert((await lstat(join(extracted,'Contents/MacOS/玄印写作'))).isFile())
  throw new Error('Controlled inner trust failure, not a signed fixture')
 }}),/^Error: 发布工具失败：codesign \(execution\)$/)
 assert.deepEqual(calls.map(call=>call.tool),['/usr/bin/unzip','/usr/bin/ditto','/usr/bin/codesign'])
 const extractionRoot=calls[1].args.at(-1)!;await assert.rejects(lstat(dirname(extractionRoot)),{code:'ENOENT'})
 const bad=Buffer.from(archive),nameLength=bad.readUInt16LE(26);bad[30+nameLength]^=0xff;await writeFile(path,bad);calls.length=0
 await assert.rejects(verifyMacArtifact(dir,path,{teamId:team,arch:'arm64',run:async(tool,args,options)=>{calls.push({tool,args});return runChecked(tool,args,options)}}),/发布工具失败：unzip/)
 assert.deepEqual(calls.map(call=>call.tool),['/usr/bin/unzip'])
}))

test('MACREL-10 DMG inner trust failure always detaches; failed detach retains its owned directory',async()=>temporary(async dir=>{
 const {verifyMacArtifact}=await load();const path=join(dir,'fixture.dmg');await writeFile(path,'Controlled container, not an Apple-accepted DMG')
 for(const detachFails of [false,true]){
  const calls:{tool:string;args:string[]}[]=[];let mount=''
  try{
   await assert.rejects(verifyMacArtifact(dir,path,{teamId:team,arch:'arm64',run:async(tool,args)=>{
    calls.push({tool,args})
    if(tool.endsWith('codesign')&&args.includes('--display'))return {stderr:display()}
    if(tool.endsWith('codesign')&&args.includes('--verify')&&args.at(-1)?.endsWith('.app'))throw new Error('controlled inner trust rejection')
    if(tool.endsWith('hdiutil')&&args[0]==='attach'){mount=args[args.indexOf('-mountpoint')+1];assert(args.includes('-readonly'));await fixtureApp(mount)}
    if(tool.endsWith('hdiutil')&&args[0]==='detach'&&detachFails)throw new Error('controlled detach failure')
    return {stdout:''}
   }}),detachFails?/发布工具失败：hdiutil/:/发布工具失败：codesign/)
   assert(mount);assert(calls.some(call=>call.tool.endsWith('codesign')&&call.args.at(-1)===join(mount,'玄印写作.app')))
   const containerCheck=calls.find(call=>call.tool==='/usr/bin/codesign'&&call.args.includes('--verify')&&call.args.at(-1)===path)
   assert(containerCheck);assert(containerCheck.args[containerCheck.args.indexOf('-R')+1]?.startsWith('=anchor apple'))
   assert.deepEqual(calls.at(-1),{tool:'/usr/bin/hdiutil',args:['detach',mount]})
   if(detachFails)assert((await lstat(join(mount,'玄印写作.app'))).isDirectory())
   else await assert.rejects(lstat(dirname(mount)),{code:'ENOENT'})
  }finally{
   // The OS port never mounts a disk. Clean the retained fake mount only after
   // proving production correctly avoided recursive removal on detach failure.
   if(mount)await rm(dirname(mount),{recursive:true,force:true})
  }
 }
}))

test('MACREL-06/10 staple, ticket validation and actual metadata errors cannot create a successful release',async()=>temporary(async dir=>{
 const {finalizeMacRelease}=await load();await writeFile(join(dir,'package.json'),JSON.stringify({version:'0.1.0-alpha'}));const release=join(dir,'release');await mkdir(release)
 for(const stageFailure of ['staple','validate','metadata']){
  const stage=join(release,'.staging',stageFailure);await mkdir(stage,{recursive:true});const name='ShakeInk-0.1.0-alpha-mac-arm64.dmg';await writeFile(join(stage,name),'controlled finalization input')
  if(stageFailure==='metadata'){const target=join(dir,'must-not-overwrite');await writeFile(target,'sentinel');await symlink(target,join(stage,name+'.blockmap'))}
  const sequence:string[]=[]
  await assert.rejects(finalizeMacRelease(dir,stage,{arch:'arm64',identity,profile:'fixture',targets:['dmg'],artifacts:[name],run:async(_tool,args)=>{
   if(args.includes('notarytool')){sequence.push('Accepted');return {stdout:'{"status":"Accepted"}'}}
   const step=args.includes('staple')?'staple':'validate';sequence.push(step);if(step===stageFailure)throw new Error(`controlled ${step} failure`);return {stdout:''}
  },verifyArtifact:async()=>{sequence.push('verify')}}),stageFailure==='metadata'?/blockmap 必须为普通文件/:/发布工具失败：xcrun/)
  assert.deepEqual(sequence,stageFailure==='staple'?['Accepted','staple']:stageFailure==='validate'?['Accepted','staple','validate']:['Accepted','staple','validate','verify'])
  assert(!(await readdir(stage)).some(name=>name==='release.json'||name==='SHA256SUMS.txt'||name.startsWith('.verified-')))
  assert(!(await readdir(release)).some(name=>name.startsWith('verified-')))
  if(stageFailure==='metadata')assert.equal(await readFile(join(dir,'must-not-overwrite'),'utf8'),'sentinel')
 }
}))
