import {constants} from 'node:fs'
import {lstat,mkdir,open,readdir,readFile,rename,unlink} from 'node:fs/promises'
import {join} from 'node:path'
import {createHash,randomUUID} from 'node:crypto'
import {WIZARD_LIMITS,type WizardTask} from '../shared/novel-import-wizard'

/** Staged wizard images live beside the private journal; only registered task files are trusted. */
export const IMAGE_NAME=/^[a-z0-9-]{1,80}\.(png|jpg|webp)$/u
export const IMAGE_TEMP=/^\.[a-z0-9-]{1,80}\.[0-9a-f-]{36}\.tmp$/u
const EXT={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'} as const
export type StagedMime=keyof typeof EXT
export const imageFileName=(taskId:string,mime:StagedMime)=>`${taskId}.${EXT[mime]}`

/** Magic bytes decide the type; the declared mime must agree. */
export function sniffImage(bytes:Uint8Array,declared:string):StagedMime{
 const b=Buffer.from(bytes)
 const type:StagedMime|undefined=b.length>8&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':b.length>3&&b[0]===0xff&&b[1]===0xd8&&b[2]===0xff?'image/jpeg':b.length>12&&b.subarray(0,4).toString('latin1')==='RIFF'&&b.subarray(8,12).toString('latin1')==='WEBP'?'image/webp':undefined
 if(!type||type!==declared)throw Error('IMAGE_RESPONSE_INVALID')
 if(b.length>WIZARD_LIMITS.imageBytes)throw Error('IMAGE_RESPONSE_TOO_LARGE')
 return type
}
/** temp + fsync → rename to the final name → directory fsync. The journal registers it afterwards. */
export async function stageImage(directory:string,taskId:string,bytes:Uint8Array,mime:StagedMime){
 const dir=join(directory,'images');await mkdir(dir,{mode:0o700,recursive:true})
 const info=await lstat(dir);if(!info.isDirectory()||info.isSymbolicLink())throw Error('导入图片目录无效')
 const temp=join(dir,`.${taskId}.${randomUUID()}.tmp`),final=join(dir,imageFileName(taskId,mime))
 const handle=await open(temp,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600)
 try{await handle.writeFile(bytes);await handle.sync()}finally{await handle.close()}
 try{await rename(temp,final)}catch(error){await unlink(temp).catch(()=>undefined);throw error}
 const d=await open(dir,constants.O_RDONLY);try{await d.sync()}finally{await d.close()}
 return createHash('sha256').update(bytes).digest('hex')
}
async function regular(path:string){const s=await lstat(path);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1)throw Error('导入图片文件无效');return s}
/** Read a registered image and verify its digest and type. */
export async function readStagedImage(directory:string,task:WizardTask){
 if(task.kind!=='image'||task.state!=='done'||!task.image||!task.resultSha256)throw Error('导入图片不存在')
 const path=join(directory,'images',imageFileName(task.id,task.image.mime));await regular(path)
 const bytes=await readFile(path);if(createHash('sha256').update(bytes).digest('hex')!==task.resultSha256)throw Error('导入图片已变化')
 sniffImage(bytes,task.image.mime);return {mime:task.image.mime,bytes:new Uint8Array(bytes)}
}
/** On open: drop temps and unregistered files; registered files that are missing or changed reset their task. */
export async function reconcileStagedImages(directory:string,tasks:WizardTask[]){
 const dir=join(directory,'images');let names:string[]
 try{names=await readdir(dir)}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT'){for(const t of tasks)if(t.kind==='image'&&t.state==='done'){t.state='waiting';delete t.resultSha256;delete t.image}return}throw error}
 const registered=new Map(tasks.filter(t=>t.kind==='image'&&t.state==='done'&&t.image).map(t=>[imageFileName(t.id,t.image!.mime),t]))
 for(const name of names){const path=join(dir,name);const info=await lstat(path);if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1)throw Error('导入图片目录含未知链接，已保留');if(IMAGE_TEMP.test(name)||IMAGE_NAME.test(name)&&!registered.has(name))await unlink(path)}
 for(const [name,t] of registered){try{await readStagedImage(directory,t)}catch{t.state='waiting';delete t.resultSha256;delete t.image;await unlink(join(dir,name)).catch(()=>undefined)}}
}
/** Discard support: only staged image names and temps may be removed. */
export async function removeStagedImages(directory:string){
 const dir=join(directory,'images');let names:string[]
 try{names=await readdir(dir)}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return;throw error}
 for(const name of names){if(!IMAGE_NAME.test(name)&&!IMAGE_TEMP.test(name))throw Error('导入图片目录含未知文件，已保留');await regular(join(dir,name))}
 for(const name of names)await unlink(join(dir,name))
 const {rmdir}=await import('node:fs/promises');await rmdir(dir)
}
export async function stagedImageBytes(directory:string,tasks:WizardTask[]){
 let total=0;const out:{taskId:string;mime:StagedMime;sha256:string;bytes:Uint8Array}[]=[]
 for(const t of tasks.filter(t=>t.kind==='image'&&t.state==='done')){const image=await readStagedImage(directory,t);total+=image.bytes.length;if(total>WIZARD_LIMITS.sessionImageBytes)throw Error('导入图片超过容量限制');out.push({taskId:t.id,mime:image.mime,sha256:t.resultSha256!,bytes:image.bytes})}
 return out
}
