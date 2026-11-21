import React from 'react'
import {createRoot} from 'react-dom/client'
import {flushSync} from 'react-dom'
import {Dialog,DialogContent,DialogTitle} from '../../src/components/ui/dialog'
import {DesktopPromptHost,type PromptHostBridge} from '../../src/components/desktop/DesktopPromptHost'
import type {AppPrompt} from '../../desktop/shared/prompt'

/* Controlled prompt bridge for the real DesktopPromptHost; no Electron or main process. */
declare global{interface Window{promptFixture:{refuse:boolean;push(prompts:AppPrompt[]):void;replies:{id:string;value:string}[];lowerChanges:boolean[];mount(initial:AppPrompt[],options?:{lower?:'dialog'|'import';theme?:'paper'|'ink'}):void}}}
let listener:((prompts:AppPrompt[])=>void)|null=null
const replies:{id:string;value:string}[]=[],lowerChanges:boolean[]=[]
function Lower({kind}:{kind:'dialog'|'import'}){
 const [open,setOpen]=React.useState(true)
 return <Dialog open={open} onOpenChange={value=>{lowerChanges.push(value);setOpen(value)}}><DialogContent className={kind==='import'?'ni-dialog chatpane':undefined}><DialogTitle>下层窗口</DialogTitle><input aria-label="下层输入"/></DialogContent></Dialog>
}
window.promptFixture={refuse:false,replies,lowerChanges,push:prompts=>listener?.(prompts),mount(initial,options={}){
 document.documentElement.className=options.theme??'paper'
 let current=initial
 const bridge:PromptHostBridge={prompts:async()=>current,replyPrompt:async(id,value)=>{replies.push({id,value});return !window.promptFixture.refuse},subscribe:next=>{listener=prompts=>{current=prompts;next(prompts)};return()=>{listener=null}}}
 flushSync(()=>createRoot(document.getElementById('app')!).render(<>{options.lower&&<Lower kind={options.lower}/>}<DesktopPromptHost bridge={bridge}/></>))
}}
