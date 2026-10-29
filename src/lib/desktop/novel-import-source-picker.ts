"use client"

import {create} from 'zustand'
import type {SourcePickerAction,SourcePickerView} from '@desktop/shared/novel-import-source-picker'

interface PickerState {view:SourcePickerView|null;busy:number;error:string|null}
export const useNovelImportSourcePickerStore=create<PickerState>(()=>({view:null,busy:0,error:null}))
type Mutation=Exclude<SourcePickerAction,{type:'current'|'cancel'}> extends infer A ? A extends {id:string;revision:number} ? Omit<A,'id'|'revision'> : never : never
type Change=Mutation|((view:SourcePickerView)=>Mutation|null)
const retired=new Set<string>()
const inFlight=new Map<string,number>()
const RETIRED_HISTORY_LIMIT=1000
let epoch=0,eventSerial=0,observerEpoch=0,subscriptions=0,queue:Promise<unknown>=Promise.resolve(),unsubscribe:(()=>void)|undefined,trigger:HTMLElement|null=null

function trimRetired(){
 for(const id of retired){if(retired.size<=RETIRED_HISTORY_LIMIT)break;if(!inFlight.has(id))retired.delete(id)}
}
function retire(id:string){retired.add(id);trimRetired()}

function close(id:string){
 retire(id)
 if(useNovelImportSourcePickerStore.getState().view?.id!==id)return
 epoch++;queue=Promise.resolve()
 useNovelImportSourcePickerStore.setState({view:null,busy:0,error:null})
}
function adopt(view:SourcePickerView|null){
 const previous=useNovelImportSourcePickerStore.getState().view
 if(!view){if(previous)close(previous.id);return}
 if(retired.has(view.id)||previous?.id===view.id&&previous.revision>view.revision)return
 if(previous?.id!==view.id){
  if(previous)retire(previous.id)
  epoch++;queue=Promise.resolve()
  const active=document.activeElement
  if(active instanceof HTMLElement&&!active.closest('.ni-source-picker'))trigger=active
  useNovelImportSourcePickerStore.setState({view,busy:0,error:null})
 }else useNovelImportSourcePickerStore.setState({view})
}

/** Only semantic IDs cross the bridge; queued mutations obtain the latest revision. */
export function mutateNovelImportSourcePicker(change:Change):Promise<SourcePickerView|null>{
 const current=useNovelImportSourcePickerStore.getState().view
 if(!current)return Promise.resolve(null)
 const id=current.id,version=epoch
 useNovelImportSourcePickerStore.setState(state=>({busy:state.busy+1,error:null}))
 const execute=async()=>{
  let retained=false
  try{
   const view=useNovelImportSourcePickerStore.getState().view
   if(version!==epoch||view?.id!==id||retired.has(id))return null
   const command=typeof change==='function'?change(view):change
   if(!command)return view
   const bridge=window.desktop?.novelImportSources
   if(!bridge)throw Error('来源选择器暂不可用，请关闭后重试。')
   inFlight.set(id,(inFlight.get(id)??0)+1);retained=true
   const result=await bridge({...command,id,revision:view.revision} as SourcePickerAction)
   if(version===epoch&&useNovelImportSourcePickerStore.getState().view?.id===id&&(!result||result.id===id))adopt(result)
   return result
  }catch(error){
   if(version===epoch&&useNovelImportSourcePickerStore.getState().view?.id===id){
    useNovelImportSourcePickerStore.setState({error:error instanceof Error?error.message:'来源操作失败，请重试。'})
    const serial=eventSerial
    try{const latest=await window.desktop?.novelImportSources({type:'current'});if(serial===eventSerial&&version===epoch&&latest?.id===id)adopt(latest)}catch{/* Keep the original actionable error. */}
   }
   return null
  }finally{
   // Keep canceled IDs pinned until their old replies/events have settled.
   // Other tombstones form a bounded history; main also rejects stale epochs.
   if(retained){const remaining=(inFlight.get(id)??1)-1;if(remaining)inFlight.set(id,remaining);else inFlight.delete(id);trimRetired()}
   if(version===epoch&&useNovelImportSourcePickerStore.getState().view?.id===id)useNovelImportSourcePickerStore.setState(state=>({busy:Math.max(0,state.busy-1)}))
  }
 }
 const result=queue.then(execute,execute);queue=result.catch(()=>null)
 return result
}

/** Cancellation deliberately bypasses the mutation queue and never needs a revision. */
export async function cancelNovelImportSourcePicker(){
 const view=useNovelImportSourcePickerStore.getState().view
 if(!view)return
 close(view.id)
 try{await window.desktop?.novelImportSources({type:'cancel',id:view.id})}catch{/* Owner/lifecycle cancellation also releases the main-process waiter. */}
}

export function novelImportSourcePickerFinalFocus(){return trigger?.isConnected?trigger:null}

/** Current only restores an existing picker; only main-process views can open one. */
export function observeNovelImportSourcePicker(){
 subscriptions++
 if(subscriptions===1&&window.desktop?.novelImportSources){
  const observation=++observerEpoch
  unsubscribe=window.desktop.subscribe(event=>{
   if(event.type==='novel-import-picker'){eventSerial++;adopt(event.view)}
  })
  const serial=eventSerial
  void window.desktop.novelImportSources({type:'current'}).then(view=>{
   if(observation===observerEpoch&&subscriptions&&serial===eventSerial)adopt(view)
   else if(!subscriptions&&view){retire(view.id);void window.desktop?.novelImportSources({type:'cancel',id:view.id}).catch(()=>undefined)}
  }).catch(()=>{/* No picker means no UI to interrupt. */})
 }
 return()=>{if(--subscriptions===0){observerEpoch++;unsubscribe?.();unsubscribe=undefined;void cancelNovelImportSourcePicker()}}
}
