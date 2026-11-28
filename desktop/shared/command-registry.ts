import catalog from "./commands.json"
import { bindingsFor, validShortcut, type ShortcutCommand, type ShortcutScope } from "../core/shortcuts"
export type DesktopPlatform = "darwin" | "win32"
export interface DesktopCommand extends ShortcutCommand { group: string }
export interface DesktopMenuItem { id: string; label: string; binding?: string; enabled: boolean }
export interface DesktopMenu { id: string; label: string; items: DesktopMenuItem[] }

export function platformCommands(platform: DesktopPlatform): DesktopCommand[] {
  return catalog.commands.filter(command => command.platform !== "mac" || platform === "darwin").map(command => {
    const key = platform === "darwin" ? command.mac : command.win
    const defaults=command.id==="ai.mentionConfirm" ? ["Tab","Enter"] : command.id==="ai.mentionClose" ? ["Escape"] : key ? [key] : []
    // docs/599 §12.3: worldline.escape and ai.stop share Escape; enabled() keeps them apart at run time (worldline-escape.ts).
    // docs/612 §4.7: the selection AI request box and the chat composer share the composer scope; contexts keep their keys apart.
    const contexts:Record<string,boolean>|undefined=command.id.startsWith("ai.mention")&&command.id!=="ai.mention" ? {mention:true}
      : command.id==="ai.stop" ? {mention:false,worldlineEdit:false,selectionAi:false} : command.id==="worldline.escape" ? {worldlineEdit:true}
      : ["ai.send","ai.newline"].includes(command.id) ? {mention:false,selectionAi:false} : ["ai.historyPrev","ai.historyNext"].includes(command.id) ? {selectionAi:false}
      : ["selectionAi.run","selectionAi.pickPrev","selectionAi.pickNext"].includes(command.id) ? {selectionAi:true,mention:false}
      : command.id==="selectionAi.escape" ? {selectionAi:true,worldlineEdit:false}
      : command.id.startsWith("selectionAi.") ? {selectionAi:true} : undefined
    return { id:command.id, label:command.label, group:command.group, scope:command.scope as ShortcutScope, locked:command.locked, defaults, ...(contexts ? {contexts} : {}) }
  })
}
export function desktopMenu(platform: DesktopPlatform, overrides: Record<string,string[]>): DesktopMenu[] {
  const commands = platformCommands(platform)
  const labels: Record<string,string> = {app:"玄印",file:"文件",edit:"编辑",view:"视图",window:"窗口",help:"帮助"}
  return Object.entries(catalog.menus).filter(([group]) => group !== "app" || platform === "darwin").map(([group,source]) => {
    const ids = [...source]
    if (platform === "win32" && group === "file") ids.push("app.settings","app.quit")
    if (platform === "win32" && group === "help") ids.push("app.about")
    return { id:group, label:labels[group], items:ids.flatMap(id => {
      if (id === "file.import-folder") return []
      const command=commands.find(command=>command.id===id)
      if (!command) return []
      const binding=(command.locked ? command.defaults : bindingsFor(command,overrides))[0]
      return [{id,label:command.label,binding:binding && validShortcut(binding) ? binding : undefined,enabled:true}]
    }) }
  })
}
export function electronAccelerator(binding?: string): string | undefined {
  if (!binding || !validShortcut(binding) || binding.includes(" ")) return undefined
  const names: Record<string,string> = {ArrowLeft:"Left",ArrowRight:"Right",ArrowUp:"Up",ArrowDown:"Down",Equal:"=",Minus:"-",Slash:"/",BracketLeft:"[",BracketRight:"]",Backslash:"\\",Quote:"'",Win:"Super",NumpadAdd:"numadd",NumpadSubtract:"numsub",NumpadMultiply:"nummult",NumpadDivide:"numdiv",NumpadDecimal:"numdec",NumpadEnter:"Enter"}
  // Keys that Electron cannot represent are still handled by the renderer
  // runtime; show their physical binding in the menu's label instead.
  if (/(?:IntlBackslash|NumpadEqual|NumpadComma)/i.test(binding)) return undefined
  return binding.split("+").map(part=>names[part] ?? (/^Numpad\d$/.test(part) ? `num${part.slice(-1)}` : part)).join("+")
}
