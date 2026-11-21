import {contextBridge,ipcRenderer} from 'electron'
import type {RootRelocationBridge,RootRelocationState} from '../shared/root-relocation'
import type {AppPrompt} from '../shared/prompt'
const bridge:RootRelocationBridge={
 state:()=>ipcRenderer.invoke('desktop:relocation-state'),
 command:command=>ipcRenderer.invoke('desktop:relocation-command',command),
 subscribe(listener){const receive=(_event:unknown,state:RootRelocationState)=>listener(state);ipcRenderer.on('desktop:relocation-event',receive);return()=>ipcRenderer.removeListener('desktop:relocation-event',receive)},
 prompts:()=>ipcRenderer.invoke('desktop:relocation-prompts'),
 replyPrompt:(id,value)=>ipcRenderer.invoke('desktop:relocation-prompt-reply',{id,value}),
 subscribePrompts(listener){const receive=(_event:unknown,prompts:AppPrompt[])=>listener(prompts);ipcRenderer.on('desktop:relocation-prompt-event',receive);return()=>ipcRenderer.removeListener('desktop:relocation-prompt-event',receive)},
}
contextBridge.exposeInMainWorld('desktopRootRelocation',bridge)
