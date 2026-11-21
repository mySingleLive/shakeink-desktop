import React from 'react'
import {createRoot} from 'react-dom/client'
import {flushSync} from 'react-dom'
import {NovelImportSourcePickerDialog} from '../../src/components/desktop/NovelImportSourcePickerDialog'
import {useNovelImportSourcePickerStore} from '../../src/lib/desktop/novel-import-source-picker'
import type {SourcePickerAction,SourcePickerEntry,SourcePickerView} from '../../desktop/shared/novel-import-source-picker'

// Metadata-only, controlled bridge for the real React component. No native/FS acceptance.
const uuid=(index:number)=>`20000000-0000-4000-8000-${String(index).padStart(12,'0')}`
const entry=(index:number,name:string,kind:SourcePickerEntry['kind'],extra:Partial<SourcePickerEntry>={}):SourcePickerEntry=>({id:uuid(index),name,kind,displayPath:'C:\\合成资料\\'+name,bytes:kind==='file'?1234:0,selectable:true,navigable:kind==='directory',...extra})
const docs=entry(1,'文档','directory'),novel=entry(2,'小说原稿','directory'),downloads=entry(3,'下载','directory')
const body=entry(4,'正文.txt','file',{format:'txt'}),outline=entry(5,'大纲.md','file',{format:'md'})
const rootEntries=[novel,body,outline,entry(6,'角色.docx','file',{format:'docx'}),entry(7,'旧稿.doc','file',{format:'doc'}),entry(8,'世界.pdf','file',{format:'pdf'}),entry(9,'场景.html','file',{format:'html'}),entry(10,'物品.htm','file',{format:'htm'}),entry(11,'封面.png','file',{selectable:false,navigable:false,reason:'不支持此文件格式'}),entry(12,'受保护目录','directory',{selectable:false,navigable:false,reason:'此目录受保护，不能导入'})]
const childEntries=[entry(13,'第01章.txt','file',{format:'txt'}),entry(14,'第02章.txt','file',{format:'txt'})]
const allEntries=[docs,downloads,...rootEntries,...childEntries]
declare global{interface Window{mountSourcePicker(options?:{deferCurrent?:boolean;deferNavigate?:boolean;deferConfirm?:boolean;phase?:SourcePickerView['phase']}):void;sourcePickerFixture:any}}
window.mountSourcePicker=(options={})=>{
 let generation=50,view:SourcePickerView|null={id:uuid(generation),revision:1,phase:options.phase??'ready',current:docs,breadcrumbs:[docs],places:[docs,downloads],entries:[...rootEntries],selected:[]},suspended=false
 const calls:SourcePickerAction[]=[],listeners=new Set<(event:unknown)=>void>(),pending:{current?:()=>void;navigate?:()=>void;confirm?:()=>void}={}
 const copy=()=>view?structuredClone(view):null
 const emit=(value:SourcePickerView|null=copy())=>listeners.forEach(listener=>listener({type:'novel-import-picker',view:structuredClone(value)}))
 const update=(patch:Partial<SourcePickerView>)=>{if(!view)return;view={...view,...patch,revision:view.revision+1};emit()}
 const bridge=async(action:SourcePickerAction):Promise<SourcePickerView|null>=>{
  calls.push(structuredClone(action))
  if(action.type==='current'){const snapshot=copy();if(options.deferCurrent)return new Promise(resolve=>{pending.current=()=>resolve(snapshot)});return snapshot}
  if(action.type==='cancel'){if(view?.id===action.id){view=null;emit()}return null}
  if(!view||view.id!==action.id||view.revision!==action.revision)throw Error('来源选择版本已变化')
  if(action.type==='navigate'){
   const item=allEntries.find(entry=>entry.id===action.entryId);if(!item?.navigable)throw Error('无法进入这个目录')
   const after={...structuredClone(view),revision:view.revision+2,current:item,breadcrumbs:item.id===docs.id?[docs]:[docs,item],entries:item.id===novel.id?[...childEntries]:item.id===downloads.id?[]:[...rootEntries],phase:'ready' as const,error:undefined}
   if(options.deferNavigate)return new Promise(resolve=>{pending.navigate=()=>{if(view?.id===after.id)view=after;emit(after);resolve(structuredClone(after))}})
   view=after;emit();return copy()
  }
  if(action.type==='toggle'){
   const item=allEntries.find(entry=>entry.id===action.entryId);if(!item?.selectable)throw Error('不可选择此项目')
   const selected=view.selected.some(entry=>entry.id===item.id)?view.selected.filter(entry=>entry.id!==item.id):[...view.selected,item]
   update({selected});return copy()
  }
  if(action.type==='clear'){update({selected:[]});return copy()}
  if(action.type==='confirm'){
   if(!view.selected.length)throw Error('请先选择来源')
   if(options.deferConfirm){const stale={...structuredClone(view),revision:view.revision+1,phase:'ready' as const};update({phase:'checking'});return new Promise(resolve=>{pending.confirm=()=>{emit(stale);resolve(stale)}})}
   view=null;emit();return null
  }
  return copy()
 }
 ;(window as any).desktop={novelImportSources:bridge,subscribe:(listener:(event:unknown)=>void)=>{listeners.add(listener);return()=>listeners.delete(listener)}}
 useNovelImportSourcePickerStore.setState({view:null,busy:0,error:null})
 const root=createRoot(document.getElementById('app')!)
 const render=()=>flushSync(()=>root.render(<><button id="fixture-launch" onClick={()=>emit()}>导入作品</button><NovelImportSourcePickerDialog suspended={suspended}/></>))
 window.sourcePickerFixture={calls,ids:{docs:docs.id,novel:novel.id,body:body.id,outline:outline.id},state:()=>useNovelImportSourcePickerStore.getState(),view:copy,emit:()=>emit(),set:update,release:(kind:keyof typeof pending)=>pending[kind]?.(),suspend:(value:boolean)=>{suspended=value;render()},openNew:()=>{generation++;view={id:uuid(generation),revision:1,phase:'ready',current:docs,breadcrumbs:[docs],places:[docs,downloads],entries:[...rootEntries],selected:[]};emit()},empty:()=>update({entries:[],error:undefined}),unmount:()=>root.unmount()}
 render()
}
