import {randomUUID} from 'node:crypto'
import {opendir,realpath} from 'node:fs/promises'
import type {Dir} from 'node:fs'
import {basename,dirname,extname,isAbsolute,relative,resolve,sep} from 'node:path'
import {IMPORT_FORMATS,type ImportFormat} from '../shared/novel-import'
import {sourcePickerActionSchema,type SourcePickerAction,type SourcePickerEntry,type SourcePickerView} from '../shared/novel-import-source-picker'
import {captureNovelSourceGrant,verifyNovelSourceGrant,type ImportSourceGrant} from './novel-import-files'

interface Options {
 places():Promise<{name:string;path:string}[]>
 protectedRoots():Promise<string[]>
 changed(view:SourcePickerView|null):void
 roots?:string[]
 maxEntries?:number
 maxSelected?:number
 ioTimeoutMs?:number
 maxPendingIo?:number
 // Test seams keep the real promise alive, including after the public deadline.
 openDirectory?(path:string):Promise<Dir>
 captureGrant?(path:string):Promise<ImportSourceGrant>
 verifyGrant?(grant:ImportSourceGrant):Promise<void>
}
interface Node {entry:SourcePickerEntry;path:string;grant?:ImportSourceGrant}
interface Session {
 view:SourcePickerView
 nodes:Map<string,Node>
 paths:Map<string,string>
 selected:Set<string>
 protected:string[]
 assertOwner():void
 tail:Promise<unknown>
 result:Promise<ImportSourceGrant[]|null>
 resolve(value:ImportSourceGrant[]|null):void
 abort:ReturnType<typeof Promise.withResolvers<void>>
}
const natural=new Intl.Collator('zh-CN',{numeric:true,sensitivity:'variant'})
const within=(path:string,root:string)=>{const value=relative(root,path);return value===''||value!=='..'&&!value.startsWith('..'+sep)&&!isAbsolute(value)}
const hidden=(name:string)=>name.startsWith('.')||['node_modules','$RECYCLE.BIN','System Volume Information','__MACOSX'].includes(name)
const stopped=()=>new DOMException('来源选择已取消','AbortError')
class IoTimeout extends Error {constructor(){super('读取目录超时，请选择其他位置或稍后重试')}}
class IoBusy extends Error {constructor(){super('文件系统仍在等待响应，请稍后重试')}}

/** One temporary owner-bound capability session; no file contents or DB leases. */
export class NovelImportSourcePicker {
 private session:Session|null=null
 // This set deliberately survives cancel/new choose. Timeout cannot cancel fs IO.
 private pending=new Set<Promise<unknown>>()
 constructor(private options:Options){}
 get activeIo(){return this.pending.size}
 get active(){return !!this.session}
 private ensure(s:Session){if(this.session!==s)throw stopped();s.assertOwner()}
 private snapshot(s:Session):SourcePickerView {
  const latest=(entry:SourcePickerEntry)=>s.nodes.get(entry.id)?.entry??entry
  if(s.view.current)s.view.current=latest(s.view.current)
  s.view.breadcrumbs=s.view.breadcrumbs.map(latest);s.view.places=s.view.places.map(latest);s.view.entries=s.view.entries.map(latest)
  s.view.selected=[...s.selected].map(id=>s.nodes.get(id)!.entry);return structuredClone(s.view)
 }
 private publish(s:Session){this.ensure(s);s.view.revision++;this.options.changed(this.snapshot(s))}
 private async io<T>(s:Session,run:(check:()=>void)=>Promise<T>):Promise<T>{
  this.ensure(s)
  // Leave default libuv pool capacity available for saving and orderly close.
  if(this.pending.size>=Math.max(1,this.options.maxPendingIo??2))throw new IoBusy()
  let expired=false
  const check=()=>{if(expired)throw stopped();this.ensure(s)}
  const work=Promise.resolve().then(()=>run(check));this.pending.add(work)
  void work.then(()=>this.pending.delete(work),()=>this.pending.delete(work))
  let timer:ReturnType<typeof setTimeout>|undefined
  const timeout=new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>{expired=true;reject(new IoTimeout())},Math.max(1,this.options.ioTimeoutMs??2000))})
  const canceled=s.abort.promise.then(()=>{expired=true;throw stopped()})
  try{const value=await Promise.race([work,timeout,canceled]);check();return value}finally{if(timer)clearTimeout(timer)}
 }
 private serial<T>(s:Session,run:()=>Promise<T>){const work=s.tail.then(run,run);s.tail=work.catch(()=>undefined);return work}
 choose(assertOwner:()=>void):Promise<ImportSourceGrant[]|null>{
  assertOwner()
  if(this.session){this.ensure(this.session);this.options.changed(this.snapshot(this.session));return this.session.result}
  const result=Promise.withResolvers<ImportSourceGrant[]|null>()
  const s:Session={view:{id:randomUUID(),revision:0,phase:'loading',current:null,breadcrumbs:[],places:[],entries:[],selected:[]},nodes:new Map(),paths:new Map(),selected:new Set(),protected:[],assertOwner,tail:Promise.resolve(),result:result.promise,resolve:result.resolve,abort:Promise.withResolvers<void>()}
  this.session=s;this.options.changed(this.snapshot(s))
  s.tail=this.initialize(s).catch(error=>this.failed(s,error))
  return result.promise
 }
 /** Lifecycle callers use this before awaiting a controller/gate drain. */
 cancel(){const s=this.session;if(!s)return;this.session=null;s.abort.resolve();s.resolve(null);this.options.changed(null)}
 async act(input:unknown):Promise<SourcePickerView|null>{
  const action=sourcePickerActionSchema.parse(input),s=this.session
  if(action.type==='current'){if(!s)return null;this.ensure(s);return this.snapshot(s)}
  if(!s||s.view.id!==action.id)throw Error('来源选择会话已变化，请重新打开')
  this.ensure(s)
  if(action.type==='cancel'){this.cancel();return null}
  return this.serial(s,async()=>{
   if(this.session!==s)return null
   this.ensure(s)
   if(action.revision!==s.view.revision)throw Error('来源选择版本已变化，请重试')
   if(s.view.phase!=='ready')throw Error('正在读取来源，请稍候')
   if(action.type==='confirm'&&!s.selected.size)throw Error('请先选择文件或文件夹')
   try{
    if(action.type==='navigate'){let node=this.node(s,action.entryId);if(!node.entry.navigable){if(node.entry.kind!=='directory'||/保护|隐藏|符号链接/.test(node.entry.reason??''))throw Error('无法打开此文件夹');node=await this.inspect(s,node.path,node.entry.name,'directory')}await this.list(s,node)}
    else if(action.type==='toggle')await this.toggle(s,action.entryId)
    else if(action.type==='clear'){s.selected.clear();s.view.error=undefined;this.publish(s)}
    else if(action.type==='confirm')await this.confirm(s)
    return this.session===s?this.snapshot(s):null
   }catch(error){if(this.session!==s||error instanceof DOMException&&error.name==='AbortError')return null;this.failed(s,error);return this.snapshot(s)}
  })
 }
 private failed(s:Session,error:unknown){
  if(this.session!==s)return
  try{this.ensure(s)}catch{this.cancel();return}
  s.view.phase='ready'
  s.view.error=error instanceof IoTimeout||error instanceof IoBusy?error.message:error instanceof Error&&/^(来源选择超过|此项目不能选择|来源项目已失效)/u.test(error.message)?error.message:'无法读取此位置，请检查权限、选择其他位置或重新选择来源'
  this.publish(s)
 }
 private node(s:Session,id:string){const node=s.nodes.get(id);if(!node)throw Error('来源项目已失效，请重新浏览');return node}
 private async initialize(s:Session){
  const roots=await this.io(s,()=>this.options.protectedRoots());this.ensure(s)
  for(const path of roots)s.protected.push(await this.io(s,async()=>{try{return await realpath(resolve(path))}catch{return resolve(path)}}))
  const places=await this.io(s,()=>this.options.places());this.ensure(s)
  for(const place of places){
   let node:Node
   try{node=await this.inspect(s,place.path,place.name,'directory')}
   catch(error){if(this.session!==s)throw stopped();const path=resolve(place.path),id=randomUUID();node={path,entry:{id,name:place.name,displayPath:path,kind:'directory',bytes:0,selectable:false,navigable:false,reason:error instanceof IoTimeout?'读取此位置超时':'文件系统仍在等待响应'}};s.nodes.set(id,node);s.paths.set(path,id);s.view.places.push(node.entry);if(error instanceof IoBusy)break;continue}
   if(!s.view.places.some(entry=>entry.id===node.entry.id))s.view.places.push(node.entry)
  }
  // At most one unresolved probe can remain. Stop at the first public timeout.
  for(const path of this.options.roots??[]){
   try{const node=await this.inspect(s,path,undefined,'directory',true);if(node.grant&&!s.view.places.some(entry=>entry.id===node.entry.id))s.view.places.push(node.entry)}
   catch(error){if(error instanceof IoTimeout||error instanceof IoBusy)break;if(this.session!==s)throw error}
  }
  const first=s.view.places.find(entry=>entry.navigable)??s.view.places[0]
  if(!first){s.view.phase='ready';s.view.error='没有可浏览的位置，请稍后重试';this.publish(s);return}
  await this.list(s,this.node(s,first.id))
 }
 private async inspect(s:Session,path:string,name?:string,hint:'file'|'directory'='file',strict=false):Promise<Node>{
  path=resolve(path)
  const previous=s.paths.get(path),old=previous?s.nodes.get(previous):undefined
  if(old&&s.selected.has(old.entry.id))return old
  const id=old?.entry.id??randomUUID(),label=name??(basename(path)||path)
  let grant:ImportSourceGrant|undefined,reason:string|undefined
  if(s.protected.some(root=>within(path,root)))reason='受保护目录'
  else if(hidden(basename(path)))reason='隐藏或系统项目'
  else{
   try{grant=await this.io(s,()=> (this.options.captureGrant??captureNovelSourceGrant)(path));this.ensure(s);path=grant.path;if(s.protected.some(root=>within(path,root))){grant=undefined;reason='受保护目录'}}
   catch(error){if(this.session!==s)throw stopped();if(strict||error instanceof IoTimeout||error instanceof IoBusy)throw error;reason=error instanceof Error&&error.message.startsWith('符号链接')?'符号链接不能导入':'无法访问或项目已消失'}
  }
  const kind=grant?(grant.directory?'directory':'file'):hint,extension=extname(path).slice(1).toLowerCase(),format=IMPORT_FORMATS.includes(extension as ImportFormat)?extension as ImportFormat:undefined
  if(!reason&&kind==='file'&&!format)reason='不支持此格式'
  const entry:SourcePickerEntry={id,name:label,displayPath:path,kind,...(format?{format}:{}),bytes:grant&&!grant.directory?Number(grant.proof.size):0,selectable:!!grant&&!reason,navigable:!!grant&&kind==='directory'&&!reason,...(reason?{reason}:{})}
  const node={entry,path,grant};s.nodes.set(id,node);s.paths.set(path,id);return node
 }
 private async list(s:Session,node:Node){
  this.ensure(s);s.view.phase='loading';s.view.current=node.entry;s.view.entries=[];s.view.error=undefined;this.publish(s)
  try{
   if(!node.grant||!node.entry.navigable)throw Error('目录无法访问')
   await this.io(s,()=> (this.options.verifyGrant??verifyNovelSourceGrant)(node.grant!))
   const ancestry:string[]=[];for(let path=node.path;;path=dirname(path)){ancestry.unshift(path);if(dirname(path)===path)break}
   const breadcrumbs:SourcePickerEntry[]=[]
   for(const path of ancestry){const ancestor=path===node.path?node:await this.inspect(s,path,undefined,'directory');breadcrumbs.push(ancestor.entry)}
   s.view.breadcrumbs=breadcrumbs
   const names=await this.io(s,async check=>{
    const directory=await (this.options.openDirectory??opendir)(node.path),entries:{name:string;directory:boolean}[]=[]
    try{check();for await(const entry of directory){check();entries.push({name:entry.name,directory:entry.isDirectory()});if(entries.length>Math.max(1,this.options.maxEntries??2000))throw Error('目录项目过多，请选择当前文件夹或浏览其他位置')}return entries}
    finally{await directory.close().catch(()=>undefined)}
   })
   const entries:SourcePickerEntry[]=[]
   for(const item of names.sort((a,b)=>Number(b.directory)-Number(a.directory)||natural.compare(a.name,b.name))){this.ensure(s);const child=await this.inspect(s,resolve(node.path,item.name),undefined,item.directory?'directory':'file');entries.push(child.entry)}
   await this.io(s,()=> (this.options.verifyGrant??verifyNovelSourceGrant)(node.grant!));this.ensure(s)
   node.entry={...node.entry,selectable:true,navigable:true,reason:undefined};s.view.current=node.entry
   s.view.entries=entries;s.view.phase='ready';this.prune(s);this.publish(s)
  }catch(error){
   if(this.session!==s)throw stopped()
   if(error instanceof Error&&error.message.startsWith('目录项目过多')){s.view.phase='ready';s.view.entries=[];s.view.error=error.message;this.prune(s);this.publish(s);return}
   if(!(error instanceof IoTimeout)&&!(error instanceof IoBusy)){node.entry={...node.entry,selectable:false,reason:'无法访问或目录已发生变化'};s.view.current=node.entry}
   this.prune(s)
   throw error
  }
 }
 private prune(s:Session){
  const keep=new Set([...s.selected,...s.view.places.map(e=>e.id),...s.view.breadcrumbs.map(e=>e.id),...s.view.entries.map(e=>e.id),...(s.view.current?[s.view.current.id]:[])])
  for(const [id,node] of s.nodes)if(!keep.has(id)){s.nodes.delete(id);if(s.paths.get(node.path)===id)s.paths.delete(node.path)}
 }
 private async toggle(s:Session,id:string){
  const node=this.node(s,id)
  if(s.selected.has(id)){s.selected.delete(id);s.view.error=undefined;this.publish(s);return}
  if(!node.entry.selectable||!node.grant)throw Error('此项目不能选择')
  if(s.selected.size>=Math.max(1,this.options.maxSelected??5000))throw Error('来源选择超过5000项限制')
  await this.io(s,()=> (this.options.verifyGrant??verifyNovelSourceGrant)(node.grant!));this.ensure(s)
  s.selected.add(id);s.view.error=undefined;this.publish(s)
 }
 private async confirm(s:Session){
  s.view.phase='checking';s.view.error=undefined;this.publish(s)
  const grants:ImportSourceGrant[]=[];let changed=false
  for(const id of [...s.selected]){
   const node=this.node(s,id)
   try{if(!node.grant)throw Error('missing grant');await this.io(s,()=> (this.options.verifyGrant??verifyNovelSourceGrant)(node.grant!));this.ensure(s);grants.push(structuredClone(node.grant))}
   catch(error){if(this.session!==s||error instanceof DOMException&&error.name==='AbortError')throw stopped();if(error instanceof IoTimeout||error instanceof IoBusy)throw error;changed=true;s.selected.delete(id);node.grant=undefined;node.entry={...node.entry,selectable:false,navigable:false,reason:'来源已发生变化，请重新选择'};s.view.entries=s.view.entries.map(entry=>entry.id===id?node.entry:entry);if(s.view.current?.id===id)s.view.current=node.entry}
  }
  if(changed){s.view.phase='ready';s.view.error='来源发生变化，请返回原目录重新选择';this.publish(s);return}
  this.ensure(s);this.session=null;s.abort.resolve();s.resolve(grants);this.options.changed(null)
 }
}
