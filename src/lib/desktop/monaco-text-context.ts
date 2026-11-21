import type {editor as MonacoEditor,Selection} from 'monaco-editor'
import {emptyTextContextCapabilities,type TextContextCommand} from '@desktop/shared/text-context-menu'
import {registerTextContextAdapter,type TextContextCapture} from './text-context-adapters'
type Editor=MonacoEditor.IStandaloneCodeEditor
export function bindMonacoTextContext(editor:Editor){
 let alive=true,contentRevision=0,selectionRevision=0,configuredReadOnly=editor.getRawOptions().readOnly===true
 const selections=()=>editor.getSelections()??[],fingerprint=()=>JSON.stringify(selections())
 let lastSelection=fingerprint()
 const contentChanged=()=>{contentRevision++}
 const listeners=[editor.onDidChangeModel(contentChanged),editor.onDidChangeModelContent(contentChanged),editor.onDidChangeCursorSelection(()=>{const next=fingerprint();if(next!==lastSelection){lastSelection=next;selectionRevision++}}),editor.onDidChangeConfiguration(()=>{const next=editor.getRawOptions().readOnly===true;if(next!==configuredReadOnly){configuredReadOnly=next;contentRevision++}}),editor.onDidDispose(()=>{alive=false;contentChanged()})]
 const textHit=(point?:{x:number;y:number})=>{
  if(!point)return true
  const hit=editor.getTargetAtClientPoint(point.x,point.y)
  return !!hit&&(hit.type===6||hit.type===7)
 }
 const action=(id:string)=>editor.getAction(id)
 const capture=(target:HTMLElement,point?:{x:number;y:number}):TextContextCapture|null=>{
  const root=editor.getDomNode(),model=editor.getModel()
  if(!alive||!root?.isConnected||!model||!root.contains(target)||target.closest('input:not(.inputarea),textarea:not(.inputarea),[contenteditable="true"]:not(.native-edit-context):not(.inputarea)')||!textHit(point))return null
  const ranges=selections().map(range=>({...range})),selectionKey=fingerprint(),version=model.getVersionId(),contentTicket=contentRevision,selectionTicket=selectionRevision,readOnly=editor.getRawOptions().readOnly===true
  const ordered=[...ranges].sort((a,b)=>a.startLineNumber-b.startLineNumber||a.startColumn-b.startColumn)
  const text=ordered.map(range=>model.getValueInRange(range)).filter(Boolean).join('\n\n'),commands=emptyTextContextCapabilities()
  commands['text.quote']=commands['text.copy']=!!text;commands['text.cut']=commands['text.delete']=!readOnly&&!!text
  commands['text.paste']=commands['text.pastePlain']=!readOnly
  commands['text.undo']=!readOnly&&model.canUndo();commands['text.redo']=!readOnly&&model.canRedo();commands['text.selectAll']=true
  commands['editor.context']=!!action('editor.action.showContextMenu')
  const current=()=>alive&&root.isConnected&&editor.getModel()===model&&model.getVersionId()===version&&contentRevision===contentTicket&&selectionRevision===selectionTicket&&fingerprint()===selectionKey&&readOnly===(editor.getRawOptions().readOnly===true)
  const restore=()=>{if(!current())return;editor.focus()}
  const run=async(id:string)=>{const command=action(id);if(!command?.isSupported())throw new Error('编辑器操作当前不可用');await command.run()}
  return {root,kind:'editor',text,commands,isCurrent:current,isContentCurrent:current,restore,async execute(id:TextContextCommand,assertCurrent){
   assertCurrent();if(!commands[id])return
   if(id==='text.copy'){editor.trigger('text-context-menu','editor.action.clipboardCopyAction',{});return}
   if(id==='text.cut'){editor.trigger('text-context-menu','editor.action.clipboardCutAction',{});return}
   if(id==='text.undo'){editor.trigger('text-context-menu','undo',{});return}
   if(id==='text.redo'){editor.trigger('text-context-menu','redo',{});return}
   if(id==='text.selectAll'){editor.trigger('text-context-menu','editor.action.selectAll',{});return}
   if(id==='editor.context'){await run('editor.action.showContextMenu');return}
   if(id==='text.delete'){editor.pushUndoStop();editor.executeEdits('text-context-menu',ordered.map(range=>({range,text:'',forceMoveMarkers:true})));editor.pushUndoStop();return}
   if(id==='text.paste'||id==='text.pastePlain'){
    const bridge=root.ownerDocument.defaultView?.desktop;if(!bridge)throw new Error('本地剪贴板尚未就绪')
    const value=await bridge.readClipboardText();assertCurrent();if(!current())throw new Error('正文选区已变化')
    // docs/598 §4 P2-2: a paste is its own undo step, not merged with prior typing.
    editor.pushUndoStop();editor.trigger('text-context-menu','paste',{text:value});editor.pushUndoStop()
   }
  }}
 }
 const unregister=registerTextContextAdapter({capture,protectRightMouseDown(target,point){
  const root=editor.getDomNode();if(!alive||!root?.contains(target)||!textHit(point)||target.closest('input:not(.inputarea),textarea:not(.inputarea)'))return false
  const hit=editor.getTargetAtClientPoint(point.x,point.y)
  return !!hit?.position&&selections().some(range=>range.containsPosition(hit.position!))
 }})
 return()=>{alive=false;contentRevision++;unregister();for(const listener of listeners)listener.dispose()}
}
