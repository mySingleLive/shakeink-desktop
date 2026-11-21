"use client"

import {useEffect,useRef,useState} from "react"
import {Button} from "@/components/ui/button"
import {Menu} from "lucide-react"
import {DesktopPromptHost,type PromptHostBridge} from "./DesktopPromptHost"
import type {RootRelocationBridge,RootRelocationCommand,RootRelocationNotice,RootRelocationPhase,RootRelocationState} from "@desktop/shared/root-relocation"

const labels:Record<RootRelocationPhase,string>={checking:"正在检查数据目录…",unavailable:"原数据目录无法访问",picking:"正在选择目录…",confirming:"等待确认原数据目录…",writing:"正在保存目录记录…",cancelled:"定位已取消",complete:"已定位原数据目录",blocked:"需要检查数据目录","reset-confirm":"确认重置配置数据",resetting:"正在重置数据目录…","reset-failed":"重置未完成"}
const notices:Record<Exclude<RootRelocationNotice,null>,string>={
 "root-unavailable":"请找到原来的数据目录。此入口只接受原物理目录，不会创建空数据或恢复副本。",
 "pointer-invalid":"数据目录中的文件丢失或损坏，无法自动修复。可以退出应用保留现状，或重置配置数据后重新开始。",
 "history-needs-recovery":"历史迁移记录需要检查，请保留原目录和控制文件后联系维护者。",
 "target-not-original":"所选目录不是原物理数据目录，请重新选择原目录。",
 "target-invalid":"所选目录无法验证，请检查目录后重新选择。",
 "confirmation-failed":"目录确认未完成，请重新选择并确认。",
 "write-unconfirmed":"目录记录的持久化尚未确认，请保留所有文件并退出后重新检查。",
 "operation-failed":"定位未完成，请检查原数据目录后重试。",
 "owner-expired":"当前维护窗口已失效，请退出应用后重新检查。",
 "reset-complete":"应用将自动重新启动，从新手指引开始正常使用。",
 "reset-failed":"重置未完成，请关闭可能占用文件的程序后重试。",
}
const pathValid=(value:unknown)=>value===null||typeof value==="string"&&value.length<=8192&&!/[\x00-\x1f]/.test(value)
function validState(value:RootRelocationState):boolean{
 return !!value&&value.version===1&&Number.isSafeInteger(value.revision)&&value.revision>=0
  &&Object.hasOwn(labels,value.phase)&&(value.theme==="paper"||value.theme==="ink")
  &&(value.platform===undefined||["darwin","win32","linux"].includes(value.platform))
  &&pathValid(value.sourcePath)&&pathValid(value.targetPath)&&pathValid(value.defaultPath)
  &&(value.notice===null||Object.hasOwn(notices,value.notice))
  &&(value.unreadResultCount===null||Number.isSafeInteger(value.unreadResultCount)&&value.unreadResultCount>=0&&value.unreadResultCount<=256)
  &&typeof value.canChoose==="boolean"&&typeof value.canCancel==="boolean"&&typeof value.canRestart==="boolean"&&typeof value.canReset==="boolean"
  &&(!value.canChoose||["unavailable","cancelled"].includes(value.phase))
  &&(!value.canCancel||["picking","confirming","writing"].includes(value.phase))
  &&(!value.canRestart||value.phase==="complete")
  &&(!value.canReset||["unavailable","cancelled","blocked"].includes(value.phase))
}
/** The recovery dialog replaces the locate copy on the reset phases and on a
 * blocked diagnosis other than in-flight migration/restore history. */
const recoveryView=(state:RootRelocationState)=>state.phase==="reset-confirm"||state.phase==="resetting"||state.phase==="reset-failed"||state.phase==="blocked"&&state.notice!=="history-needs-recovery"||state.notice==="reset-complete"
interface Connection{bridge:RootRelocationBridge;alive:boolean;state:RootRelocationState|null;pending:Set<RootRelocationCommand>}
function relocationPromptBridge(bridge:RootRelocationBridge|undefined):PromptHostBridge|null{
 return bridge?{prompts:()=>bridge.prompts(),replyPrompt:(id,value)=>bridge.replyPrompt(id,value),subscribe:listener=>bridge.subscribePrompts(listener)}:null
}
export function RootRelocationScreen(){
 const [promptBridge]=useState(()=>relocationPromptBridge(typeof window==="undefined"?undefined:window.desktopRootRelocation))
 const [state,setState]=useState<RootRelocationState|null>(null),[error,setError]=useState<string|null>(null)
 const [pending,setPending]=useState<RootRelocationCommand[]>([]),[available,setAvailable]=useState(false)
 const connection=useRef<Connection|null>(null)
 // The confirm view arrives with notice null; the pre-reset notice is retained
 // so in-flight migration/restore history keeps its extra warning line.
 const resetOriginNotice=useRef<RootRelocationNotice>(null)
 useEffect(()=>{
  const bridge=window.desktopRootRelocation
  if(!bridge){setError("定位状态暂不可用，请重新打开应用。");return}
  setAvailable(true)
  const current:Connection={bridge,alive:true,state:null,pending:new Set()};connection.current=current
  const live=()=>current.alive&&connection.current===current
  const receive=(next:RootRelocationState)=>{
   if(!live())return
   if(!validState(next)){setError("定位状态暂不可用，请重新打开应用。");return}
   if(current.state&&next.revision<=current.state.revision)return
   if(["blocked","unavailable","cancelled"].includes(next.phase))resetOriginNotice.current=next.notice
   current.state={...next};setState(current.state);setError(null)
  }
  let unsubscribe:(()=>void)|undefined
  try{unsubscribe=bridge.subscribe(receive);void Promise.resolve(bridge.state()).then(receive,()=>{if(live())setError("暂时无法读取定位状态，请重新打开应用。")})}
  catch{if(live())setError("定位状态暂不可用，请重新打开应用。")}
  return()=>{current.alive=false;if(connection.current===current)connection.current=null;unsubscribe?.()}
 },[])
 const command=async(action:RootRelocationCommand)=>{
  const current=connection.current
  if(!current?.alive||current.pending.has(action)||current.pending.has("quit")||current.pending.has("restart"))return
  if(action==="choose"&&(!current.state?.canChoose||current.pending.size>0))return
  if(action==="cancel"&&!current.state?.canCancel)return
  if(action==="restart"&&(!current.state?.canRestart||current.pending.size>0))return
  if(action==="reset"&&(!current.state?.canReset||current.pending.size>0))return
  if(action==="reset-confirm"&&(!current.state||!["reset-confirm","reset-failed"].includes(current.state.phase)||current.pending.size>0))return
  if(action==="reset-back"&&current.state?.phase!=="reset-confirm")return
  // Cancel/quit must remain usable while a native picker/confirmation is open.
  current.pending.add(action);setPending([...current.pending]);setError(null)
  try{await current.bridge.command(action)}catch{if(current.alive&&connection.current===current)setError("操作未完成，请重试。")}
  finally{if(current.alive&&connection.current===current){current.pending.delete(action);setPending([...current.pending])}}
 }
 const exiting=pending.includes("quit")||pending.includes("restart"),cancelling=pending.includes("cancel")
 const recovery=state?recoveryView(state):false
 return <><DesktopPromptHost bridge={promptBridge} themeClass={state?.theme??"paper"}/><main className={`${state?.theme??"paper"} flex h-dvh min-h-0 flex-col overflow-auto bg-background font-sans text-foreground`}>
  <div className="desktop-drag flex h-11 w-full shrink-0 items-center justify-end pr-[144px]">
   {state?.platform==="win32"&&available&&<Button data-relocation-command="menu" aria-label="应用菜单" size="icon" variant="ghost" disabled={pending.includes("menu")||exiting} onClick={()=>{void command("menu")}}><Menu className="size-4"/></Button>}
  </div>
  <div className="flex flex-1 items-center justify-center px-5 pb-8 pt-3">
   <section aria-labelledby="root-relocation-title" className="w-full min-w-0 max-w-xl rounded-xl border border-border bg-card p-6 sm:p-8">
    <h1 id="root-relocation-title" className="font-heading text-2xl font-semibold">{recovery?"无法修复数据目录":"定位原数据目录"}</h1>
    <div role="status" aria-live="polite" aria-atomic="true" className="mt-6 space-y-2">
     <h2 className="text-base font-medium">{state?state.notice==="reset-complete"?"重置完成，正在重新打开应用…":labels[state.phase]:labels.checking}</h2>
     {state?.notice&&<p className="text-sm leading-6 text-muted-foreground">{notices[state.notice]}</p>}
     {state?.phase==="reset-confirm"&&<p className="text-sm leading-6 text-muted-foreground">请确认重置后果，此步骤是最终确认。</p>}
     {state?.phase==="resetting"&&<p className="text-sm leading-6 text-muted-foreground">正在清空并重建配置目录，请勿关闭应用。</p>}
     {state&&["unavailable","cancelled"].includes(state.phase)&&state.canReset&&<p className="text-sm leading-6 text-muted-foreground">若原目录已无法找回，可以重置配置数据，从默认目录重新开始。</p>}
     {state?.phase==="complete"&&state.notice!=="reset-complete"&&<p className="text-sm leading-6 text-muted-foreground">目录记录已保存，应用将完整重新启动。</p>}
     {state?.phase==="cancelled"&&<p className="text-sm leading-6 text-muted-foreground">原数据与历史记录保持原样，可重新选择目录。</p>}
    </div>
    {state&&<dl className="mt-5 space-y-3 text-sm">
     {(!recovery||state.sourcePath&&state.sourcePath!==state.defaultPath)&&<div><dt className="text-xs text-muted-foreground">原数据目录</dt><dd className="mt-1 break-all leading-6">{state.sourcePath??"目录记录尚未确认"}</dd></div>}
     {state.targetPath&&<div><dt className="text-xs text-muted-foreground">所选目录</dt><dd className="mt-1 break-all leading-6">{state.targetPath}</dd></div>}
     {recovery&&state.defaultPath&&<div><dt className="text-xs text-muted-foreground">数据目录</dt><dd className="mt-1 break-all leading-6">{state.defaultPath}</dd></div>}
    </dl>}
    {state?.phase==="reset-confirm"&&<div className="mt-5 rounded-lg border border-destructive bg-destructive/10 px-4 py-3.5">
     <p className="text-sm font-semibold text-destructive">此操作不可撤销</p>
     <p className="mt-1.5 text-sm leading-7 text-foreground">重置会清空数据目录（{state.defaultPath}）的全部内容，包括收件箱、设置与模型配置、作品索引和应用备份，此操作不可撤销。作品文件保存在各自的独立目录中，不会被删除，但重置后需要重新打开关联。</p>
     {state.sourcePath&&state.sourcePath!==state.defaultPath&&<p className="mt-2 text-sm leading-7 text-foreground">原数据目录（{state.sourcePath}）的内容不会被删除或改动。</p>}
     {resetOriginNotice.current==="history-needs-recovery"&&<p className="mt-2 text-sm leading-7 text-foreground">迁移与恢复历史记录也将一并清除。</p>}
    </div>}
    {state?.unreadResultCount!==null&&state?.unreadResultCount!==undefined&&state.unreadResultCount>0&&<p className="mt-5 text-sm leading-6 text-muted-foreground">保留 {state.unreadResultCount} 条未读迁移结果，重新打开后仍需明确确认。</p>}
    {error&&<p role="alert" className="mt-5 text-sm leading-6 text-destructive">{error}</p>}
    {available&&(state||error)&&<div className="mt-6 flex flex-wrap justify-end gap-2">
     {state?.phase==="reset-confirm"||state?.phase==="resetting"?<>
      <Button data-relocation-command="reset-confirm" variant="destructive" disabled={state.phase==="resetting"||pending.length>0} onClick={()=>{void command("reset-confirm")}}>确认清空并重置</Button>
      <Button data-relocation-command="reset-back" variant="outline" disabled={state.phase==="resetting"||pending.length>0} onClick={()=>{void command("reset-back")}}>返回</Button>
     </>:state?.phase==="reset-failed"?<>
      <Button data-relocation-command="reset-confirm" disabled={pending.length>0} onClick={()=>{void command("reset-confirm")}}>{pending.includes("reset-confirm")?"正在重置…":"重试"}</Button>
      <Button data-relocation-command="quit" variant="outline" disabled={exiting} onClick={()=>{void command("quit")}}>{pending.includes("quit")?"正在退出…":"退出应用"}</Button>
     </>:<>
      {state?.canChoose&&<Button data-relocation-command="choose" disabled={pending.length>0} onClick={()=>{void command("choose")}}>定位原数据目录</Button>}
      {(state?.canCancel||cancelling)&&<Button data-relocation-command="cancel" variant="outline" disabled={cancelling||exiting} onClick={()=>{void command("cancel")}}>{cancelling?"正在取消…":"取消定位"}</Button>}
      {state?.canReset&&<Button data-relocation-command="reset" variant={state.phase==="blocked"?"default":"outline"} disabled={pending.length>0} onClick={()=>{void command("reset")}}>重置配置数据</Button>}
      {state?.canRestart?<Button data-relocation-command="restart" disabled={pending.length>0} onClick={()=>{void command("restart")}}>{pending.includes("restart")?"正在重新打开…":"重新打开应用"}</Button>
       :<Button data-relocation-command="quit" variant="outline" disabled={exiting||cancelling} onClick={()=>{void command("quit")}}>{pending.includes("quit")?"正在退出…":"退出应用"}</Button>}
     </>}
    </div>}
   </section>
  </div>
 </main></>
}
