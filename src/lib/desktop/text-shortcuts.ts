import {bindingsFor,canonicalKey,shortcutScopeEnables,type ShortcutCommand,type ShortcutFocusScope} from '@desktop/core/shortcuts'
import type {TextContextCapture} from './text-context-adapters'

/** docs/598: keyboard text editing that no registered owner handled. */
export const textShortcutIds=["text.copy","text.cut","text.paste","text.pastePlain","text.selectAll","text.undo","text.redo"] as const
export type TextShortcutId=typeof textShortcutIds[number]
const textIds=new Set<string>(textShortcutIds)

/** Single-stroke match against the current bindings. `removed` marks a text
 * command's default (or earlier) key that no command owns any longer, so the
 * caller blocks it instead of letting a browser default resurrect it. */
export type TextShortcutMatch={id:TextShortcutId;removed?:false}|{id:TextShortcutId;removed:true}
// Text commands are matched in every focus scope (docs/598 §3.3); other commands
// only where they are active, so an editor-only command on the same key (Monaco's
// suggestWidgetCopy on Cmd+C) does not hide text.copy in an input or on read-only text.
const competes=(command:ShortcutCommand,scope:ShortcutFocusScope)=>command.scope==="global"||command.scope!=="text"&&shortcutScopeEnables(scope,command.scope)
export function textShortcutFor(stroke:string,commands:ShortcutCommand[],overrides:Record<string,string[]>,scope:ShortcutFocusScope="none"):TextShortcutMatch|null{
 const key=canonicalKey(stroke)
 const owners=commands.filter(command=>(command.locked?command.defaults:bindingsFor(command,overrides)).some(binding=>canonicalKey(binding)===key))
 if(owners.length){
  const text=owners.filter(command=>textIds.has(command.id)),others=owners.filter(command=>!textIds.has(command.id)&&competes(command,scope))
  return text.length===1&&!others.length?{id:text[0].id as TextShortcutId}:null
 }
 const removed=commands.find(command=>textIds.has(command.id)&&Object.hasOwn(overrides,command.id)&&command.defaults.some(binding=>canonicalKey(binding)===key))
 return removed?{removed:true,id:removed.id as TextShortcutId}:null
}

/** Read-only text only copies (R4); inputs and editors follow their capture. */
export function textShortcutAllowed(capture:Pick<TextContextCapture,'kind'|'commands'>,id:TextShortcutId){
 if(capture.kind==='preview')return id==='text.copy'&&capture.commands['text.copy']
 return capture.commands[id]===true
}
