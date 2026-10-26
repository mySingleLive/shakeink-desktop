// Trust gates for macOS distribution. No application process is launched here.
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {createReadStream} from 'node:fs'
import {readFile,writeFile,mkdir,mkdtemp,rm,rename,lstat,readdir,realpath,readlink,open} from 'node:fs/promises'
import {basename,dirname,extname,join,resolve,relative,sep,posix} from 'node:path'
import {tmpdir} from 'node:os'
import {createHash,randomUUID} from 'node:crypto'
import {createRequire} from 'node:module'
import {gunzipSync,inflateRawSync} from 'node:zlib'
import {inspectPackagedApp,verifyPackagedDependencies} from './inspect-packaged-app.mjs'

/** @typedef {{stdout?: string, stderr?: string}} CommandResult */
/** @typedef {(tool: string, args: string[], options?: import('node:child_process').ExecFileOptions) => Promise<CommandResult>} CommandRunner */
/** @typedef {{name: string, hash: string, teamId: string}} DeveloperIdentity */
/** @typedef {{teamId?: string, arch?: string, run?: CommandRunner}} TrustOptions */
/** @typedef {(project: string, path: string, options: TrustOptions) => Promise<unknown>} ArtifactVerifier */
/** @typedef {{arch?: string, identity?: DeveloperIdentity, profile?: string, keychain?: string, artifacts?: string[], targets?: string[], run?: CommandRunner, verifyArtifact?: ArtifactVerifier}} FinalizeOptions */

const execute=promisify(execFile)
const require=createRequire(import.meta.url)
const {buildBlockMap}=require('app-builder-lib/out/targets/blockmap/blockmap.js')
const {blake2b}=require('@noble/hashes/blake2.js')
const appName='玄印写作.app'
const teamPattern=/^[A-Z0-9]{10}$/
const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key)
const within=(root,path)=>path===root||path.startsWith(root+sep)
const text=result=>`${result?.stdout??''}\n${result?.stderr??''}`
const failure=(tool,error)=>Object.assign(new Error(`发布工具失败：${basename(tool)} (${typeof error?.code==='number'?error.code:'execution'})`),typeof error?.code==='number'?{code:error.code}:{})

// Never include command arguments, stdout, stderr, environment, or a cause in
// command failures: notary/keychain diagnostics can contain account material.
/** @type {CommandRunner} */
export async function runChecked(tool,args,options={}) {
 try{return await execute(tool,args,{timeout:60000,maxBuffer:4*1024*1024,...options,encoding:'utf8'})}
 catch(error){throw failure(tool,error)}
}
async function command(run,tool,args,options={}) {
 try{return await run(tool,args,options)}catch(error){throw failure(tool,error)}
}
function requireTeam(teamId){if(typeof teamId!=='string'||!teamPattern.test(teamId))throw new Error('必须提供独立的预期 Developer ID Team ID')}
function requireArch(arch){if(!['arm64','x64'].includes(arch))throw new Error('不支持的 macOS 发布架构')}
function simpleName(name){return typeof name==='string'&&name.length>0&&basename(name)===name&&!/[\\/\0\r\n]/.test(name)&&!['.','..'].includes(name)}
async function regular(path){const stat=await lstat(path);if(!stat.isFile()||stat.isSymbolicLink())throw new Error('发布文件必须为普通文件');return stat}
async function digestFile(path,algorithm,encoding='hex'){const hash=createHash(algorithm);for await(const chunk of createReadStream(path))hash.update(chunk);return hash.digest(encoding)}

export function releaseMode(platform,args=[]) {
 if(!Array.isArray(args)||args.length>1||args.some(arg=>!['--dir','--dmg','--zip','--AppImage','--deb','--rpm'].includes(arg)))throw new Error('用法：[--dir|--dmg|--zip|--AppImage|--deb|--rpm]')
 if(platform==='darwin')return args[0]==='--dir'?'local':'release'
 if(platform==='win32'){if(args[0]&&!['--dir','--zip'].includes(args[0]))throw new Error('Windows 仅支持默认 NSIS、--zip 或 --dir');return 'windows'}
 if(platform==='linux'){if(args[0]&&!['--dir','--AppImage','--deb','--rpm'].includes(args[0]))throw new Error('Linux 仅支持默认 AppImage、--deb、--rpm 或 --dir');return 'linux'}
 throw new Error('仅支持本机 macOS 或 Windows 打包')
}

export function selectDeveloperIdentity(securityText,selector) {
 const identities=[]
 for(const line of String(securityText).split(/\r?\n/)){
  const match=line.match(/^\s*\d+\)\s+([A-Fa-f0-9]{40})\s+"(Developer ID Application: [^"\r\n]+ \(([A-Z0-9]{10})\))"\s*$/)
  if(match&&!identities.some(id=>id.hash===match[1].toUpperCase()))identities.push({name:match[2],hash:match[1].toUpperCase(),teamId:match[3]})
 }
 const selected=selector?identities.filter(id=>id.hash===String(selector).toUpperCase()||id.name.includes(String(selector))):identities
 if(selected.length!==1)throw new Error(`需要唯一有效 Developer ID Application 签名身份（有效数量：${identities.length}）；多身份时设置 CSC_NAME 为明确名称或指纹`)
 return selected[0]
}

/** @param {{env?: Record<string, string | undefined>, run?: CommandRunner}} [options] */
export async function preflightMacRelease({env=process.env,run=runChecked}={}) {
 if(typeof env.APPLE_KEYCHAIN_PROFILE!=='string'||!env.APPLE_KEYCHAIN_PROFILE.trim())throw new Error('缺少 APPLE_KEYCHAIN_PROFILE 公证钥匙串配置')
 if(['APPLE_ID','APPLE_APP_SPECIFIC_PASSWORD','APPLE_API_KEY','APPLE_API_KEY_ID','APPLE_API_ISSUER'].some(name=>env[name]))throw new Error('公证只允许 Keychain profile；请移除冲突的 Apple ID/API 认证环境项')
 const identity=selectDeveloperIdentity((await command(run,'/usr/bin/security',['find-identity','-v','-p','codesigning'])).stdout,env.CSC_NAME)
 // codesign has no --version option; resolve it like the other native tools.
 for(const tool of ['notarytool','stapler','syspolicy_check','codesign'])await command(run,'/usr/bin/xcrun',['--find',tool])
 if(!/\bassessments enabled\b/i.test(text(await command(run,'/usr/sbin/spctl',['--status']))))throw new Error('系统 Gatekeeper assessments 未启用，不能验收发布包')
 // A profile name alone is not authentication. Validate it before any build;
 // this read-only request also catches expired/missing stored credentials.
 const history=await command(run,'/usr/bin/xcrun',['notarytool','history','--output-format','json','--keychain-profile',env.APPLE_KEYCHAIN_PROFILE,...(env.APPLE_KEYCHAIN?['--keychain',env.APPLE_KEYCHAIN]:[])],{timeout:60000,maxBuffer:1024*1024})
 try{if(!Array.isArray(JSON.parse(history.stdout).history))throw new Error()}catch{throw new Error('无法验证公证钥匙串配置与 Apple 认证')}
 return {identity,profile:env.APPLE_KEYCHAIN_PROFILE,...(env.APPLE_KEYCHAIN?{keychain:env.APPLE_KEYCHAIN}:{})}
}

export function createPackagingConfiguration(base,{platform,target,identity,staging}={}) {
 releaseMode(platform,target?[`--${target}`]:[])
 if(platform==='win32')return {...base,forceCodeSigning:false}
 if(platform==='linux')return {...base,forceCodeSigning:false}
 if(target==='dir')return {...base,forceCodeSigning:false,mac:{...base.mac,identity:null,notarize:false},dmg:{...base.dmg,sign:false,writeUpdateInfo:false}}
 if(!identity||!/^[A-Fa-f0-9]{40}$/.test(identity.hash)||!staging)throw new Error('正式发布必须先选择有效签名身份和隔离 staging')
 requireTeam(identity.teamId)
 return {...base,forceCodeSigning:true,directories:{...base.directories,output:staging},mac:{...base.mac,identity:identity.hash,notarize:true},dmg:{...base.dmg,sign:true,writeUpdateInfo:false}}
}

async function nativeObjects(app) {
 const root=await realpath(app),objects=[root],binaries=[]
 const magic=new Set(['feedface','feedfacf','cefaedfe','cffaedfe','cafebabe','bebafeca','cafebabf','bfbafeca'])
 async function walk(directory){for(const name of (await readdir(directory)).sort()){
  const path=join(directory,name),stat=await lstat(path)
  if(stat.isSymbolicLink()){
   let target;try{target=await realpath(path)}catch{throw new Error('应用含损坏或循环符号链接')}
   if(!within(root,target))throw new Error('应用符号链接超出应用根目录')
  }else if(stat.isDirectory()){
   if(/\.(?:app|framework|xpc|appex)$/.test(name))objects.push(path)
   await walk(path)
  }else if(stat.isFile()){
   const fd=await open(path,'r');const bytes=Buffer.alloc(4);let size
   try{size=(await fd.read(bytes,0,4,0)).bytesRead}finally{await fd.close()}
   if(size===4&&magic.has(bytes.toString('hex'))){objects.push(path);binaries.push(path)}
  }else throw new Error('应用包含不支持的文件类型')
 }}
 await walk(root)
 if(!binaries.length)throw new Error('应用未包含 Mach-O 二进制')
 return {root,objects,binaries}
}

function checkDisplay(output,teamId,{runtime=false}={}) {
 if(!output.split(/\r?\n/).some(line=>line.startsWith('Authority=Developer ID Application: ')&&line.endsWith(`(${teamId})`))||!output.includes('Authority=Developer ID Certification Authority')||!output.includes('Authority=Apple Root CA'))throw new Error('签名不是预期 Apple Developer ID 身份')
 if(!output.split(/\r?\n/).includes(`TeamIdentifier=${teamId}`))throw new Error('签名 Team 与独立预期不一致')
 if(!/^Timestamp=.+$/m.test(output)||/^Timestamp=(?:none|not set)$/im.test(output))throw new Error('签名缺少安全时间戳')
 if(runtime&&!/flags=0x[0-9a-f]+\([^\r\n)]*\bruntime\b/i.test(output))throw new Error('签名未启用 hardened runtime')
}

function checkEntitlements(output,{jitRequired=false}={}) {
 const start=output.indexOf('<?xml')>=0?output.indexOf('<?xml'):output.indexOf('<plist')
 if(start<0){if(jitRequired)throw new Error('应用缺少最小 JIT entitlement');return}
 const plist=output.slice(start)
 const keys=[...plist.matchAll(/<key>\s*([^<]+?)\s*<\/key>/g)].map(match=>match[1])
 if(keys.some(key=>key!=='com.apple.security.cs.allow-jit'))throw new Error('签名包含超出最小 JIT 的 entitlement')
 if(keys.length>1|| (keys.length===1&&!/<key>\s*com\.apple\.security\.cs\.allow-jit\s*<\/key>\s*<true\s*\/>/.test(plist)))throw new Error('JIT entitlement 格式无效')
 if(jitRequired&&keys.length!==1)throw new Error('应用缺少最小 JIT entitlement')
}

/** @param {string} app @param {TrustOptions} [options] */
export async function verifyMacSignature(app,{teamId,arch,run=runChecked}={}) {
 requireTeam(teamId);requireArch(arch)
 const stat=await lstat(app);if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('应用根必须为实际目录')
 const requirement=`anchor apple generic and certificate 1[field.1.2.840.113635.100.6.2.6] exists and certificate leaf[field.1.2.840.113635.100.6.1.13] exists and certificate leaf[subject.OU] = "${teamId}"`
 // Fail early on the real Apple verifier before scanning thousands of resources.
 // A leading '=' makes -R parse an inline requirement instead of a file name.
 await command(run,'/usr/bin/codesign',['--verify','--deep','--strict','--verbose=4','-R','='+requirement,app])
 const {root,objects,binaries}=await nativeObjects(app)
 const binarySet=new Set(binaries)
 for(const path of objects){
  if(path!==root)await command(run,'/usr/bin/codesign',['--verify','--strict','--verbose=4','-R','='+requirement,path])
  const isExecutable=path===root||path.endsWith('.app')||binarySet.has(path)&&(!/\.(?:node|dylib)$/.test(path))
  checkDisplay(text(await command(run,'/usr/bin/codesign',['--display','--verbose=4',path])),teamId,{runtime:isExecutable})
  const entitlements=text(await command(run,'/usr/bin/codesign',['--display','--entitlements',':-',path]))
  checkEntitlements(entitlements,{jitRequired:path===root||path.endsWith('.app')})
  if(binarySet.has(path)){
   const architectures=(await command(run,'/usr/bin/lipo',['-archs',path])).stdout?.trim().split(/\s+/)??[]
   if(!architectures.includes(arch==='x64'?'x86_64':arch))throw new Error('Mach-O 架构与发布目标不一致')
  }
 }
 await command(run,'/usr/bin/xcrun',['stapler','validate',app])
 await command(run,'/usr/bin/syspolicy_check',['distribution',app])
 await command(run,'/usr/sbin/spctl',['--assess','--type','execute','--verbose=4',app])
 return {teamId,arch,nativeObjects:objects.length,machOBinaries:binaries.length,scope:'Actual Apple signature, ticket and system policy checks; no app execution'}
}

// Parse the original central directory, not a map keyed by path: map loaders
// erase duplicate names before validation. ZIP64/encryption/multipart fail shut.
export async function validateZipArchive(path) {
 await regular(path)
 const bytes=await readFile(path)
 let end=-1
 for(let offset=bytes.length-22;offset>=Math.max(0,bytes.length-65557);offset--)if(bytes.readUInt32LE(offset)===0x06054b50&&offset+22+bytes.readUInt16LE(offset+20)===bytes.length){end=offset;break}
 if(end<0)throw new Error('ZIP 缺少完整中央目录')
 const count=bytes.readUInt16LE(end+10),directorySize=bytes.readUInt32LE(end+12),directoryOffset=bytes.readUInt32LE(end+16)
 if(count===0xffff||directorySize===0xffffffff||directoryOffset===0xffffffff||bytes.readUInt16LE(end+8)===0xffff)throw new Error('ZIP64 不受支持，拒绝发布')
 if(bytes.readUInt16LE(end+4)!==0||bytes.readUInt16LE(end+6)!==0||bytes.readUInt16LE(end+8)!==count||count===0||directoryOffset+directorySize!==end)throw new Error('ZIP 多卷或中央目录范围无效')
 const entries=[],names=new Map(),aliases=new Map(),ranges=[]
 const alias=path=>path.normalize('NFD').toLowerCase()
 let cursor=directoryOffset
 const utf8=new TextDecoder('utf-8',{fatal:true})
 const decode=buffer=>{try{return utf8.decode(buffer)}catch{throw new Error('ZIP 条目不是有效 UTF-8')}}
 const validPath=name=>{
  if(!name||name.startsWith('/')||name.includes('\\')||/[\0\r\n]/.test(name)||name.split('/').some(part=>part==='..'||part==='.'||part===''&&part!==name.split('/').at(-1)))throw new Error('ZIP 包含不安全路径')
  const canonical=name.endsWith('/')?name.slice(0,-1):name
  if(canonical!==appName&&!canonical.startsWith(appName+'/'))throw new Error('ZIP 条目超出预期应用根')
  if(name.includes('//'))throw new Error('ZIP 含不规范重复分隔符')
  return canonical
 }
 for(let index=0;index<count;index++){
  if(cursor+46>end||bytes.readUInt32LE(cursor)!==0x02014b50)throw new Error('ZIP 中央目录损坏')
  const flags=bytes.readUInt16LE(cursor+8),method=bytes.readUInt16LE(cursor+10),crc=bytes.readUInt32LE(cursor+16),compressed=bytes.readUInt32LE(cursor+20),size=bytes.readUInt32LE(cursor+24),nameLength=bytes.readUInt16LE(cursor+28),extraLength=bytes.readUInt16LE(cursor+30),commentLength=bytes.readUInt16LE(cursor+32),disk=bytes.readUInt16LE(cursor+34),attributes=bytes.readUInt32LE(cursor+38),localOffset=bytes.readUInt32LE(cursor+42)
  const next=cursor+46+nameLength+extraLength+commentLength
  if(next>end||disk!==0||(flags&1)||![0,8].includes(method)||[compressed,size,localOffset].includes(0xffffffff))throw new Error('ZIP64、加密或不支持的 ZIP 条目')
  for(let at=cursor+46+nameLength;at<cursor+46+nameLength+extraLength;){if(at+4>next)throw new Error('ZIP extra 损坏');const id=bytes.readUInt16LE(at),length=bytes.readUInt16LE(at+2);if(id===1||at+4+length>cursor+46+nameLength+extraLength)throw new Error('ZIP64 或无效 extra 字段');at+=4+length}
  const name=decode(bytes.subarray(cursor+46,cursor+46+nameLength)),canonical=validPath(name)
  const type=(attributes>>>16)&0o170000,symlink=type===0o120000,directory=name.endsWith('/')||type===0o040000
  if(type!==0&&![0o120000,0o100000,0o040000].includes(type)||symlink&&name.endsWith('/'))throw new Error('ZIP 条目类型无效')
  if(names.has(canonical)||aliases.has(alias(canonical)))throw new Error('ZIP 包含重复原始路径、大小写/Unicode 别名或文件目录冲突')
  if(localOffset+30>directoryOffset||bytes.readUInt32LE(localOffset)!==0x04034b50)throw new Error('ZIP 本地头无效')
  const localNameLength=bytes.readUInt16LE(localOffset+26),localExtraLength=bytes.readUInt16LE(localOffset+28),dataOffset=localOffset+30+localNameLength+localExtraLength,dataEnd=dataOffset+compressed
  if(dataEnd>directoryOffset||bytes.readUInt16LE(localOffset+6)!==flags||bytes.readUInt16LE(localOffset+8)!==method||decode(bytes.subarray(localOffset+30,localOffset+30+localNameLength))!==name)throw new Error('ZIP 本地头与中央目录不一致')
  if(!(flags&8)&&(bytes.readUInt32LE(localOffset+14)!==crc||bytes.readUInt32LE(localOffset+18)!==compressed||bytes.readUInt32LE(localOffset+22)!==size))throw new Error('ZIP 本地大小或 CRC 与中央目录不一致')
  let target
  if(symlink){if(size>65536)throw new Error('ZIP 链接目标过长');let content;try{content=method===0?bytes.subarray(dataOffset,dataEnd):inflateRawSync(bytes.subarray(dataOffset,dataEnd),{maxOutputLength:65536})}catch{throw new Error('ZIP 链接内容损坏')}
   if(content.length!==size)throw new Error('ZIP 链接长度无效');target=decode(content)
   if(!target||target.startsWith('/')||target.includes('\\')||/[\0\r\n]/.test(target))throw new Error('ZIP 链接使用绝对或无效目标')
  }
  const entry={name,path:canonical,directory,symlink,...(target!==undefined?{target}:{})};entries.push(entry);names.set(canonical,entry);aliases.set(alias(canonical),entry);ranges.push([localOffset,dataEnd]);cursor=next
 }
 if(cursor!==end)throw new Error('ZIP 中央目录条数或范围不一致')
 ranges.sort((a,b)=>a[0]-b[0]);for(let i=1;i<ranges.length;i++)if(ranges[i][0]<ranges[i-1][1])throw new Error('ZIP 本地条目重叠')
 for(const entry of entries){let ancestor=posix.dirname(entry.path);while(ancestor!=='.'){
  const parent=aliases.get(alias(ancestor));if(parent&&(!parent.directory||parent.symlink))throw new Error('ZIP 文件/链接祖先写穿或文件目录冲突');ancestor=posix.dirname(ancestor)
 }}
 function resolveLink(path,active=new Set()){
  const parts=path.split('/'),resolved=[]
  for(let index=0;index<parts.length;index++){
   const part=parts[index];if(part==='.'||part==='')continue
   if(part==='..'){resolved.pop();if(resolved.length===0)throw new Error('ZIP 链接越过应用根');continue}
   resolved.push(part);const current=resolved.join('/'),entry=aliases.get(alias(current))
   if(entry?.symlink){if(active.has(current))throw new Error('ZIP 循环链接');const nextActive=new Set(active);nextActive.add(current);return resolveLink(posix.dirname(current)+'/'+entry.target+(index+1<parts.length?'/'+parts.slice(index+1).join('/') :''),nextActive)}
  }
  const result=resolved.join('/');if(result!==appName&&!result.startsWith(appName+'/'))throw new Error('ZIP 链接越界');return result
 }
 for(const entry of entries)if(entry.symlink){const resolved=resolveLink(entry.path);if(!aliases.has(alias(resolved))&&!entries.some(other=>alias(other.path).startsWith(alias(resolved)+'/')))throw new Error('ZIP 链接目标不存在')}
 return {entries,scope:'Raw ZIP directory/path/link preflight; CRC and extracted application checked separately'}
}

export async function generateArtifactMetadata(path) {
 const stat=await regular(path)
 if(stat.size===0)throw new Error('发布文件为空')
 const sidecar=path+'.blockmap'
 const prior=await lstat(sidecar).catch(error=>{if(error.code==='ENOENT')return null;throw error})
 if(prior&&(prior.isSymbolicLink()||!prior.isFile()))throw new Error('blockmap 必须为普通文件')
 const result=await buildBlockMap(path,'gzip',sidecar)
 const blockmap=await regular(sidecar)
 return {name:basename(path),size:result.size,sha512:result.sha512,sha256:await digestFile(path,'sha256'),blockmap:{name:basename(sidecar),size:blockmap.size,sha256:await digestFile(sidecar,'sha256')}}
}

function validateMetadata(entry) {
 if(!entry||typeof entry!=='object'||!simpleName(entry.name)||!Number.isSafeInteger(entry.size)||entry.size<=0||!/^[a-f0-9]{64}$/.test(entry.sha256)||typeof entry.sha512!=='string'||!/^[A-Za-z0-9+/]{86}==$/.test(entry.sha512))throw new Error('发布文件元数据格式无效')
 if(!entry.blockmap||entry.blockmap.name!==entry.name+'.blockmap'||!simpleName(entry.blockmap.name)||!Number.isSafeInteger(entry.blockmap.size)||entry.blockmap.size<=0||!/^[a-f0-9]{64}$/.test(entry.blockmap.sha256))throw new Error('blockmap 元数据格式无效')
}
export async function verifyArtifactMetadata(directory,entry) {
 validateMetadata(entry)
 const root=await realpath(directory),path=join(root,entry.name),sidecar=join(root,entry.blockmap.name)
 const stat=await regular(path),sideStat=await regular(sidecar)
 if(stat.size!==entry.size||sideStat.size!==entry.blockmap.size||await digestFile(path,'sha256')!==entry.sha256||await digestFile(path,'sha512','base64')!==entry.sha512||await digestFile(sidecar,'sha256')!==entry.blockmap.sha256)throw new Error('最终发布文件大小或散列不匹配')
 let map;try{map=JSON.parse(gunzipSync(await readFile(sidecar),{maxOutputLength:32*1024*1024}).toString('utf8'))}catch{throw new Error('blockmap 压缩数据或 JSON 损坏')}
 if(map.version!=='2'||!Array.isArray(map.files)||map.files.length!==1||map.files[0].name!=='file'||map.files[0].offset!==0)throw new Error('blockmap schema 无效')
 const {sizes,checksums}=map.files[0]
 if(!Array.isArray(sizes)||!Array.isArray(checksums)||sizes.length===0||sizes.length!==checksums.length||sizes.some(size=>!Number.isSafeInteger(size)||size<=0||size>32768)||sizes.reduce((sum,size)=>sum+size,0)!==stat.size)throw new Error('blockmap 区块范围无效')
 const fd=await open(path,'r');let offset=0
 try{for(let i=0;i<sizes.length;i++){
  const chunk=Buffer.alloc(sizes[i]);const {bytesRead}=await fd.read(chunk,0,chunk.length,offset)
  if(bytesRead!==chunk.length||Buffer.from(blake2b(chunk,{dkLen:18})).toString('base64')!==checksums[i])throw new Error('blockmap 实际区块校验失败')
  offset+=chunk.length
 }}finally{await fd.close()}
 return entry
}

async function verifyAppContents(project,app,options) {
 const trust=await verifyMacSignature(app,options)
 const contents=await inspectPackagedApp(project,app)
 const dependencies=await verifyPackagedDependencies(join(app,'Contents/Resources/app'))
 return {trust,staticResources:{files:contents.files.length,projectResources:contents.projectResources,scope:contents.scope},dependencies}
}

/** @param {string} project @param {string} path @param {TrustOptions} [options] */
export async function verifyMacArtifact(project,path,{teamId,arch,run=runChecked}={}) {
 requireTeam(teamId);requireArch(arch);await regular(path)
 const format=extname(path).slice(1)
 if(!['dmg','zip'].includes(format))throw new Error('仅支持 DMG/ZIP 发布包')
 if(format==='zip')await validateZipArchive(path)
 if(format==='dmg'){
  await command(run,'/usr/bin/hdiutil',['verify',path],{timeout:120000})
  const requirement=`anchor apple generic and certificate leaf[subject.OU] = "${teamId}" and certificate leaf[field.1.2.840.113635.100.6.1.13] exists`
  await command(run,'/usr/bin/codesign',['--verify','--strict','--verbose=4','-R','='+requirement,path])
  checkDisplay(text(await command(run,'/usr/bin/codesign',['--display','--verbose=4',path])),teamId)
  await command(run,'/usr/bin/xcrun',['stapler','validate',path])
  await command(run,'/usr/sbin/spctl',['--assess','--type','open','--context','context:primary-signature','--verbose=4',path])
 }
 const temporary=await mkdtemp(join(tmpdir(),'shakeink-macos-verify-'))
 let attached=false
 try{
  let root
  if(format==='dmg'){
   root=join(temporary,'mount');await mkdir(root)
   // Mark before calling attach: even an interrupted attach can have mounted it.
   attached=true
   await command(run,'/usr/bin/hdiutil',['attach','-readonly','-nobrowse','-noautoopen','-mountpoint',root,path],{timeout:120000})
  }else{
   await command(run,'/usr/bin/unzip',['-tqq',path],{timeout:120000})
   root=join(temporary,'extracted');await mkdir(root)
   await command(run,'/usr/bin/ditto',['-x','-k',path,root],{timeout:120000})
   if((await readdir(root)).some(name=>name!==appName))throw new Error('ZIP 解压后出现应用外内容')
  }
  const app=join(root,appName),stat=await lstat(app)
  if(!stat.isDirectory()||stat.isSymbolicLink()||!within(await realpath(root),await realpath(app)))throw new Error('归档应用根无效')
  const result=await verifyAppContents(project,app,{teamId,arch,run})
  return {format,...result}
 }finally{
  if(attached){await command(run,'/usr/bin/hdiutil',['detach',join(temporary,'mount')],{timeout:60000});attached=false}
  // Never recursively remove an owned temporary directory while a disk image
  // may still be mounted there. A failed detach deliberately retains it.
  if(!attached)await rm(temporary,{recursive:true,force:true})
 }
}

function exactKeys(object,keys){return object&&typeof object==='object'&&!Array.isArray(object)&&Object.keys(object).every(key=>keys.includes(key))&&keys.every(key=>own(object,key))}
async function projectVersion(project){const metadata=JSON.parse(await readFile(join(project,'package.json'),'utf8'));if(typeof metadata.version!=='string'||!/^[0-9A-Za-z][0-9A-Za-z.+-]*$/.test(metadata.version))throw new Error('项目版本无效');return metadata.version}
function expectedNames(version,arch,targets){return targets.map(target=>`ShakeInk-${version}-mac-${arch}.${target}`)}
function targetList(targets){if(!Array.isArray(targets)||targets.length===0||new Set(targets).size!==targets.length||targets.some(target=>!['dmg','zip'].includes(target)))throw new Error('发布目标必须为明确且唯一的 DMG/ZIP 集合');return [...targets].sort()}
function sumsFor(artifacts){return artifacts.flatMap(entry=>[`${entry.sha256}  ${entry.name}`,`${entry.blockmap.sha256}  ${entry.blockmap.name}`]).join('\n')+'\n'}

async function validateReleaseManifest(project,directory,{teamId,arch}={}) {
 requireTeam(teamId);if(arch!==undefined)requireArch(arch)
 const dirStat=await lstat(directory);if(!dirStat.isDirectory()||dirStat.isSymbolicLink())throw new Error('发布目录必须为实际目录')
 await regular(join(directory,'release.json'));await regular(join(directory,'SHA256SUMS.txt'))
 let manifest;try{manifest=JSON.parse(await readFile(join(directory,'release.json'),'utf8'))}catch{throw new Error('发布清单 JSON 无效')}
 if(!exactKeys(manifest,['format','schemaVersion','version','arch','teamId','targets','checkedAt','scope','artifacts'])||manifest.format!=='shakeink-verified-macos-release'||manifest.schemaVersion!==1||manifest.version!==await projectVersion(project)||manifest.teamId!==teamId||arch!==undefined&&manifest.arch!==arch||typeof manifest.checkedAt!=='string'||!Number.isFinite(Date.parse(manifest.checkedAt))||typeof manifest.scope!=='string')throw new Error('发布清单 schema/版本/Team/架构无效')
 requireArch(manifest.arch)
 const targets=targetList(manifest.targets),expected=expectedNames(manifest.version,manifest.arch,targets)
 if(!Array.isArray(manifest.artifacts)||manifest.artifacts.length!==expected.length||new Set(manifest.artifacts.map(entry=>entry?.name)).size!==expected.length)throw new Error('发布清单缺包或重复条目')
 for(const entry of manifest.artifacts){if(!exactKeys(entry,['name','size','sha512','sha256','blockmap'])||!exactKeys(entry.blockmap,['name','size','sha256'])||!expected.includes(entry.name))throw new Error('发布清单文件名/格式无效');await verifyArtifactMetadata(directory,entry)}
 if(await readFile(join(directory,'SHA256SUMS.txt'),'utf8')!==sumsFor(manifest.artifacts))throw new Error('SHA256SUMS 与最终字节不一致')
 // Only closed, direct ordinary files belong in a promoted release directory.
 const allowed=new Set(['release.json','SHA256SUMS.txt',...manifest.artifacts.flatMap(entry=>[entry.name,entry.blockmap.name])])
 for(const name of await readdir(directory)){const path=join(directory,name),stat=await lstat(path);if(!allowed.has(name)||!stat.isFile()||stat.isSymbolicLink())throw new Error('发布目录含未声明文件、目录或链接')}
 return manifest
}

/** @param {string} project @param {string} directory @param {TrustOptions} [options] */
export async function verifyReleaseDirectory(project,directory,{teamId,arch,run=runChecked}={}) {
 const manifest=await validateReleaseManifest(project,directory,{teamId,arch})
 const checks=[]
 for(const entry of manifest.artifacts)checks.push(await verifyMacArtifact(project,join(directory,entry.name),{teamId,arch:manifest.arch,run}))
 return {directory,manifest,checks,scope:'Recomputed final hashes/blockmaps and actual Apple trust checks; no app execution'}
}

/** @param {string} project @param {string} staging @param {FinalizeOptions} [options] */
export async function finalizeMacRelease(project,staging,{arch,identity,profile,keychain,artifacts,targets,run=runChecked,verifyArtifact=verifyMacArtifact}={}) {
 requireArch(arch);requireTeam(identity?.teamId)
 if(!identity||!/^([A-Fa-f0-9]{40})$/.test(identity.hash)||typeof profile!=='string'||!profile.trim())throw new Error('最终化缺少有效签名或公证前提')
 const root=await realpath(project),release=join(root,'release'),stage=await realpath(staging)
 const stageStat=await lstat(staging)
 if(!stageStat.isDirectory()||stageStat.isSymbolicLink()||!within(join(release,'.staging'),stage))throw new Error('最终化只能处理隔离的 release/.staging 目录')
 const version=await projectVersion(root)
 if(!Array.isArray(artifacts)||artifacts.length===0)throw new Error('构建未返回预期发布包')
 const archivePaths=artifacts.filter(path=>typeof path==='string'&&['.dmg','.zip'].includes(extname(path)))
 const selectedTargets=targetList(targets??archivePaths.map(path=>extname(path).slice(1)))
 const names=expectedNames(version,arch,selectedTargets)
 const sourceStage=resolve(staging)
 if(archivePaths.length!==names.length||new Set(archivePaths.map(path=>basename(path))).size!==names.length||archivePaths.some(path=>!names.includes(basename(path))||resolve(sourceStage,path)!==join(sourceStage,basename(path))))throw new Error('构建返回的包集合、文件名或路径不匹配')
 for(const path of artifacts)if(typeof path!=='string'||!names.some(name=>path===name||path===join(sourceStage,name)||path===name+'.blockmap'||path===join(sourceStage,name+'.blockmap')))throw new Error('构建返回未知发布文件')
 for(const name of names)await regular(join(stage,name))
 const manifestPath=join(stage,'release.json'),sumsPath=join(stage,'SHA256SUMS.txt')
 try{
  for(const name of names.filter(name=>name.endsWith('.dmg'))){
   const path=join(stage,name),args=['notarytool','submit',path,'--wait','--timeout','30m','--output-format','json','--keychain-profile',profile,...(keychain?['--keychain',keychain]:[])]
   const response=await command(run,'/usr/bin/xcrun',args,{timeout:31*60*1000,maxBuffer:1024*1024})
   let result;try{result=JSON.parse(response.stdout)}catch{throw new Error('Apple 公证响应不是有效 JSON')}
   if(result?.status!=='Accepted')throw new Error('DMG 未取得 Apple 公证 Accepted')
   await command(run,'/usr/bin/xcrun',['stapler','staple',path],{timeout:120000})
   await command(run,'/usr/bin/xcrun',['stapler','validate',path])
  }
  for(const name of names)await verifyArtifact(root,join(stage,name),{teamId:identity.teamId,arch,run})
  const metadata=[]
  for(const name of names){const entry=await generateArtifactMetadata(join(stage,name));await verifyArtifactMetadata(stage,entry);metadata.push(entry)}
  // Builder debug/static reports and the unpacked app remain in staging. The
  // final directory contains only explicitly verified delivery files.
  const promotion=join(stage,`.verified-${randomUUID()}`)
  await mkdir(promotion)
  try{
   for(const entry of metadata)for(const name of [entry.name,entry.blockmap.name])await rename(join(stage,name),join(promotion,name))
   const manifest={format:'shakeink-verified-macos-release',schemaVersion:1,version,arch,teamId:identity.teamId,targets:selectedTargets,checkedAt:new Date().toISOString(),scope:'Signed/notarized artifact and final-byte metadata verification; target-machine runtime acceptance remains separate',artifacts:metadata}
   await writeFile(join(promotion,'release.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'})
   await writeFile(join(promotion,'SHA256SUMS.txt'),sumsFor(metadata),{flag:'wx'})
   await validateReleaseManifest(root,promotion,{teamId:identity.teamId,arch})
   const destination=join(release,`verified-macos-${arch}-${randomUUID()}`)
   try{await lstat(destination);throw new Error('拒绝覆盖已存在发布目录')}catch(error){if(error.code!=='ENOENT')throw error}
   await rename(promotion,destination)
   return {directory:destination,manifest}
  }catch(error){await rm(join(promotion,'release.json'),{force:true});await rm(join(promotion,'SHA256SUMS.txt'),{force:true});throw error}
 }catch(error){await rm(manifestPath,{force:true});await rm(sumsPath,{force:true});throw error}
}
