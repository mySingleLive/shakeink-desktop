import {randomUUID} from "node:crypto"
import {promptInputSchema,type AppPrompt,type PromptInput} from "../shared/prompt"

interface Pending{prompt:AppPrompt;persistent:boolean;resolve(value:string):void;release():void}
/** Questions answered by the owning window's React prompt host. A prompt with no
 * window to show it, an aborted signal or a lost window resolves to its cancel value. */
export class RendererPrompts {
 private pending:Pending[]=[]
 constructor(private publish:(prompts:AppPrompt[])=>boolean){}
 ask(input:PromptInput,options:{signal?:AbortSignal;persistent?:boolean}={}):Promise<string>{
  const parsed=promptInputSchema.safeParse(input)
  if(!parsed.success)return Promise.reject(new Error("提示内容无效"))
  const signal=options.signal
  if(signal?.aborted)return Promise.resolve(parsed.data.cancelValue)
  return new Promise(resolve=>{
   const prompt:AppPrompt={...structuredClone(parsed.data),id:randomUUID()}
   const abort=()=>this.finish(entry,prompt.cancelValue)
   const entry:Pending={prompt,persistent:!!options.persistent,resolve,release:()=>signal?.removeEventListener("abort",abort)}
   signal?.addEventListener("abort",abort,{once:true})
   this.pending.push(entry)
   if(!this.broadcast())this.finish(entry,prompt.cancelValue)
  })
 }
 /** Accepts only a declared value of a pending prompt, once. */
 reply(id:string,value:string):boolean{
  const entry=this.pending.find(item=>item.prompt.id===id)
  if(!entry||!entry.prompt.buttons.some(button=>button.value===value))return false
  this.finish(entry,value);return true
 }
 /** Window lost: persistent prompts stay for the next document unless forced. */
 cancelAll(options:{force?:boolean}={}):void{
  const ended=this.pending.filter(item=>options.force||!item.persistent)
  if(!ended.length)return
  this.pending=this.pending.filter(item=>!ended.includes(item))
  for(const entry of ended){entry.release();entry.resolve(entry.prompt.cancelValue)}
  this.broadcast()
 }
 list():AppPrompt[]{return this.pending.map(item=>structuredClone(item.prompt))}
 private finish(entry:Pending,value:string){
  if(!this.pending.includes(entry))return
  this.pending=this.pending.filter(item=>item!==entry)
  entry.release();entry.resolve(value)
  this.broadcast()
 }
 private broadcast(){try{return this.publish(this.list())}catch{return false}}
}
