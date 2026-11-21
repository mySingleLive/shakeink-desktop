import type {AppPrompt,PromptBridge} from './prompt'
export type RootRelocationPhase='checking'|'unavailable'|'picking'|'confirming'|'writing'|'cancelled'|'complete'|'blocked'|'reset-confirm'|'resetting'|'reset-failed'
export type RootRelocationNotice='root-unavailable'|'pointer-invalid'|'history-needs-recovery'|'target-not-original'|'target-invalid'|'confirmation-failed'|'write-unconfirmed'|'operation-failed'|'owner-expired'|'reset-complete'|'reset-failed'|null
/** Read-only display state: no grant, receipt capabilities, Key or renderer path input. */
export interface RootRelocationState{version:1;revision:number;phase:RootRelocationPhase;theme:'paper'|'ink';platform?:'darwin'|'win32'|'linux';sourcePath:string|null;targetPath:string|null;notice:RootRelocationNotice;unreadResultCount:number|null;canChoose:boolean;canCancel:boolean;canRestart:boolean;canReset:boolean;defaultPath:string|null}
export type RootRelocationCommand='choose'|'cancel'|'restart'|'quit'|'menu'|'reset'|'reset-confirm'|'reset-back'
export interface RootRelocationBridge extends PromptBridge{state():Promise<RootRelocationState>;subscribe(listener:(state:RootRelocationState)=>void):()=>void;command(command:RootRelocationCommand):Promise<void>;subscribePrompts(listener:(prompts:AppPrompt[])=>void):()=>void}
