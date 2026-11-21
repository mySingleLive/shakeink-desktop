import {captureRegisteredTextContext,type TextContextCapture} from './text-context-adapters'
import {textContextSourceAt,captureDOMTextContext} from './text-context-selection'
import {activeTextDialogs} from './text-context-modal'
import type {TextShortcutId} from './text-shortcuts'

type DOMTextOptions=Parameters<typeof captureDOMTextContext>[1]

function elementOf(node:Node|null):HTMLElement|null{
 const element=node?.nodeType===Node.ELEMENT_NODE?node as Element:node?.parentElement??null
 return element instanceof HTMLElement?element:null
}
/** A modal barrier: with a dialog open, text behind it is never a source. */
function behindDialog(document:Document,element:HTMLElement){
 const dialogs=activeTextDialogs(document)
 return dialogs.length>0&&!dialogs.some(dialog=>dialog.contains(element))
}
/** The text the shortcut acts on, by the same rules as the text context menu
 * (docs/598 §3.2): the focused editor or control first; otherwise, when focus
 * sits on body or a button, the read-only source holding the whole selection. */
export function captureTextShortcut(target:HTMLElement|null,document:Document,options:DOMTextOptions):TextContextCapture|null{
 if(target&&target!==document.body&&target!==document.documentElement&&!behindDialog(document,target)){
  const registered=captureRegisteredTextContext(target)
  if(registered)return registered
  const root=textContextSourceAt(target)
  if(root)return captureDOMTextContext(root,options)
 }
 const selection=document.getSelection()
 if(!selection||selection.isCollapsed||!selection.rangeCount)return null
 const anchor=elementOf(selection.anchorNode),focus=elementOf(selection.focusNode)
 if(!anchor||!focus||behindDialog(document,anchor)||behindDialog(document,focus))return null
 const root=textContextSourceAt(anchor)
 if(!root||root!==textContextSourceAt(focus)||!root.contains(selection.anchorNode)||!root.contains(selection.focusNode))return null
 return captureDOMTextContext(root,options)
}
/** docs/598 §4 P1-A: a selection spanning several read-only sources (e.g. two
 * chat messages) has no single source. Copy it synchronously inside keydown;
 * nothing else applies to it. */
export function copySpanningSelection(document:Document,id:TextShortcutId):boolean{
 if(id!=='text.copy')return false
 const selection=document.getSelection()
 if(!selection||selection.isCollapsed||!selection.rangeCount)return false
 const anchor=elementOf(selection.anchorNode),focus=elementOf(selection.focusNode)
 if(!anchor||!focus||behindDialog(document,anchor)||behindDialog(document,focus))return false
 const editable='input,textarea,[contenteditable="true"],[contenteditable="plaintext-only"],.monaco-editor'
 if(anchor.closest(editable)||focus.closest(editable))return false
 return document.execCommand('copy')
}
