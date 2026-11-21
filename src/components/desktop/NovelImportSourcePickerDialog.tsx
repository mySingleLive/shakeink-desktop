"use client"

import {useEffect,useLayoutEffect,useMemo,useRef,useState,type KeyboardEvent,type MouseEvent} from 'react'
import {ArrowUp,ChevronRight,File,Folder,LoaderCircle,Search,X} from 'lucide-react'
import {Dialog,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog'
import {Button} from '@/components/ui/button'
import type {SourcePickerEntry} from '@desktop/shared/novel-import-source-picker'
import {cancelNovelImportSourcePicker,mutateNovelImportSourcePicker,novelImportSourcePickerFinalFocus,observeNovelImportSourcePicker,useNovelImportSourcePickerStore} from '@/lib/desktop/novel-import-source-picker'
import './novel-import-source-picker.css'

function FileIcon({entry}:{entry:SourcePickerEntry}){
 const format=entry.format,name=format==='txt'?'text':format==='md'?'markdown':format==='doc'||format==='docx'?'word':format==='pdf'?'pdf':format==='html'||format==='htm'?'html':null
 return <span className="nisp-file-icon">{entry.kind==='directory'?<Folder aria-hidden="true"/>:name?<img src={`/import-file-icons/${name}.svg`} alt={`${format?.toUpperCase()} 文件`}/>:<File aria-hidden="true"/>}</span>
}
function sizeLabel(bytes:number){if(bytes<1024)return `${bytes} B`;if(bytes<1024*1024)return `${Math.round(bytes/1024)} KB`;return `${(bytes/(1024*1024)).toFixed(1)} MB`}

export function NovelImportSourcePickerDialog({suspended=false}:{suspended?:boolean}){
 const {view,busy,error}=useNovelImportSourcePickerStore()
 const [query,setQuery]=useState('')
 const dialog=useRef<HTMLDivElement>(null),directory=useRef<HTMLDivElement>(null),rows=useRef(new Map<string,HTMLLIElement>()),removeButtons=useRef(new Map<string,HTMLButtonElement>())
 const focusIntent=useRef<'directory'|{removeIndex:number}|null>(null),firstClick=useRef<{id:string;pickerId:string;selected:boolean}|null>(null)
 useEffect(observeNovelImportSourcePicker,[])
 useEffect(()=>{if(suspended&&view)void cancelNovelImportSourcePicker()},[suspended,view?.id])
 useEffect(()=>{setQuery('');firstClick.current=null},[view?.id,view?.current?.id])
 const entries=useMemo(()=>view?.entries.filter(entry=>entry.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))??[],[view?.entries,query])
 const focusDirectory=()=>{const first=entries[0]&&rows.current.get(entries[0].id);(view?.phase==='ready'&&first?first:directory.current)?.focus({preventScroll:true})}
 useLayoutEffect(()=>{
  if(!view||suspended)return
  const intent=focusIntent.current,active=document.activeElement
  if(intent&&typeof intent==='object'){
   const selected=view.selected[Math.min(intent.removeIndex,view.selected.length-1)]
   const target=selected&&removeButtons.current.get(selected.id)
   if(target&&!busy&&view.phase==='ready')target.focus({preventScroll:true});else focusDirectory()
   if(!busy&&view.phase==='ready')focusIntent.current=null
  }else if(intent==='directory'){
   focusDirectory();if(!busy&&view.phase==='ready')focusIntent.current=null
  }else if(active===document.body||!active?.isConnected)directory.current?.focus({preventScroll:true})
 },[view?.revision,view?.phase,busy,suspended,entries])
 if(!view)return null
 const pending=busy>0||view.phase!=='ready',selected=new Set(view.selected.map(entry=>entry.id)),current=view.current,parent=view.breadcrumbs.at(-2)
 const navigate=(entry:SourcePickerEntry)=>{
  if(!entry.navigable||pending)return
  focusIntent.current='directory';directory.current?.focus({preventScroll:true})
  void mutateNovelImportSourcePicker({type:'navigate',entryId:entry.id})
 }
 const toggle=(entry:SourcePickerEntry)=>{if(entry.selectable&&!pending)void mutateNovelImportSourcePicker({type:'toggle',entryId:entry.id})}
 const clickRow=(event:MouseEvent<HTMLLIElement>,entry:SourcePickerEntry)=>{
  if(event.detail!==1||pending||!entry.selectable)return
  firstClick.current={id:entry.id,pickerId:view.id,selected:selected.has(entry.id)};toggle(entry)
 }
 const doubleClick=async(entry:SourcePickerEntry)=>{
  const original=firstClick.current
  if(!entry.navigable||!original||original.id!==entry.id||original.pickerId!==view.id)return
  firstClick.current=null;focusIntent.current='directory';directory.current?.focus({preventScroll:true})
  await mutateNovelImportSourcePicker(latest=>latest.selected.some(item=>item.id===entry.id)!==original.selected?{type:'toggle',entryId:entry.id}:null)
  if(useNovelImportSourcePickerStore.getState().view?.id===original.pickerId){focusIntent.current='directory';void mutateNovelImportSourcePicker({type:'navigate',entryId:entry.id})}
 }
 const keyRow=(event:KeyboardEvent<HTMLLIElement>,entry:SourcePickerEntry,index:number)=>{
  if(event.target!==event.currentTarget)return
  if(['ArrowUp','ArrowDown','Home','End'].includes(event.key)){
   event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?entries.length-1:Math.max(0,Math.min(entries.length-1,index+(event.key==='ArrowUp'?-1:1)));rows.current.get(entries[next]?.id)?.focus();return
  }
  if(event.key===' '){event.preventDefault();toggle(entry)}
  if(event.key==='Enter'){event.preventDefault();entry.kind==='directory'?navigate(entry):toggle(entry)}
 }
 const remove=(entry:SourcePickerEntry,index:number)=>{if(pending)return;focusIntent.current={removeIndex:index};directory.current?.focus({preventScroll:true});void mutateNovelImportSourcePicker({type:'toggle',entryId:entry.id})}
 const folders=view.selected.filter(entry=>entry.kind==='directory').length
 return <Dialog open={!suspended} onOpenChange={open=>{if(!open)void cancelNovelImportSourcePicker()}}>
  <DialogContent ref={dialog} className="ni-source-picker chatpane" showCloseButton={false} finalFocus={()=>novelImportSourcePickerFinalFocus()??true}>
   <header className="nisp-header"><div><span className="nisp-eyebrow">导入作品</span><DialogTitle>选择导入来源</DialogTitle><DialogDescription>可多选文件或文件夹，应用会自动识别。</DialogDescription></div><Button variant="ghost" size="icon-sm" aria-label="关闭来源选择框" onClick={()=>void cancelNovelImportSourcePicker()}><X/></Button></header>
   <div className="nisp-location"><Button variant="ghost" size="icon-sm" aria-label="上一级" disabled={pending||!parent?.navigable} onClick={()=>parent&&navigate(parent)}><ArrowUp/></Button><nav className="nisp-breadcrumbs" aria-label="当前位置">{view.breadcrumbs.map((entry,index)=><span key={entry.id}>{index>0&&<ChevronRight aria-hidden="true"/>}<Button variant="ghost" title={entry.displayPath} aria-current={current?.id===entry.id?'location':undefined} disabled={pending||!entry.navigable} onClick={()=>navigate(entry)}>{entry.name}</Button></span>)}{!current&&<span className="nisp-muted">正在读取位置…</span>}</nav><label className="nisp-search"><Search aria-hidden="true"/><input type="search" aria-label="筛选当前文件夹" placeholder="筛选当前文件夹" value={query} disabled={pending} onChange={event=>setQuery(event.target.value)}/></label></div>
   <div className="nisp-browser"><nav className="nisp-places" aria-label="常用位置"><span className="nisp-place-label">常用位置</span>{view.places.map(entry=><Button key={entry.id} variant="ghost" title={entry.displayPath} aria-current={current?.id===entry.id?'location':undefined} disabled={pending||!entry.navigable} onClick={()=>navigate(entry)}><Folder aria-hidden="true"/>{entry.name}</Button>)}</nav>
    <section className="nisp-directory" aria-label="当前文件夹内容"><div className="nisp-directory-summary"><label><input type="checkbox" aria-label={`选中当前文件夹${current?' '+current.name:''}`} disabled={pending||!current?.selectable} checked={!!current&&selected.has(current.id)} onChange={()=>current&&toggle(current)}/>选中当前文件夹</label><span>{entries.length} 个项目</span></div>
     <div className="nisp-columns" aria-hidden="true"><span>名称</span><span>类型</span><span>大小</span><span/></div>
     <div className="nisp-directory-content" ref={directory} tabIndex={-1} role="region" aria-label="当前目录项目区域">
      {(error||view.error)&&<div className="nisp-error" role="alert"><p>{error||view.error}</p>{current?.navigable&&<Button variant="outline" size="sm" disabled={pending} onClick={()=>navigate(current)}>重试</Button>}</div>}
      {view.phase!=='ready'?<div className="nisp-state" aria-busy="true" role="status"><LoaderCircle className="nisp-spinner"/><h3>{view.phase==='checking'?'正在核对所选来源':'正在载入文件夹'}</h3><p>请稍候，已选来源会保留。</p></div>:entries.length?<ul aria-label="当前目录项目" className="nisp-entries">{entries.map((entry,index)=><li key={entry.id} ref={node=>{if(node)rows.current.set(entry.id,node);else rows.current.delete(entry.id)}} className={`nisp-entry ${selected.has(entry.id)?'is-selected':''} ${!entry.selectable?'is-disabled':''}`} data-entry-id={entry.id} tabIndex={0} aria-label={`${entry.name}，${entry.kind==='directory'?'文件夹':entry.format?.toUpperCase()??'文件'}${entry.reason?'，'+entry.reason:''}`} aria-disabled={!entry.selectable||pending} onClick={event=>clickRow(event,entry)} onDoubleClick={()=>void doubleClick(entry)} onKeyDown={event=>keyRow(event,entry,index)}><input type="checkbox" tabIndex={-1} aria-label={`选择 ${entry.name}`} checked={selected.has(entry.id)} disabled={pending||!entry.selectable} onClick={event=>event.stopPropagation()} onDoubleClick={event=>event.stopPropagation()} onChange={()=>toggle(entry)}/><FileIcon entry={entry}/><span className="nisp-entry-name" title={entry.name}>{entry.name}</span><span className="nisp-entry-type">{entry.reason||(entry.kind==='directory'?'文件夹':entry.format?.toUpperCase()??'不支持')}</span><span className="nisp-entry-size">{entry.kind==='directory'?'—':sizeLabel(entry.bytes)}</span>{entry.kind==='directory'?<Button variant="ghost" size="icon-sm" aria-label={`打开文件夹 ${entry.name}`} disabled={pending||!entry.navigable} onClick={event=>{event.stopPropagation();navigate(entry)}} onDoubleClick={event=>event.stopPropagation()}><ChevronRight/></Button>:<span/>}</li>)}</ul>:!error&&!view.error?<div className="nisp-state"><Folder aria-hidden="true"/><h3>{query?'没有匹配的项目':'这个文件夹是空的'}</h3><p>{query?'更换名称，或清空筛选查看当前目录。':'可以选中当前文件夹，或选择其他位置。'}</p>{query&&<Button variant="outline" size="sm" onClick={()=>setQuery('')}>清空筛选</Button>}</div>:null}
     </div><p className="nisp-browse-help">单击勾选；双击文件夹或点击箭头进入</p>
    </section>
   </div>
   <section className="nisp-selection" aria-label="已选来源"><div className="nisp-selection-head"><h3 aria-live="polite">{view.selected.length?`已选 ${view.selected.length-folders} 个文件 · ${folders} 个文件夹`:'尚未选择来源'}</h3><Button variant="ghost" size="xs" disabled={pending||!view.selected.length} onClick={()=>{focusIntent.current='directory';void mutateNovelImportSourcePicker({type:'clear'})}}>清空</Button></div><div className="nisp-selection-content">{view.selected.length?<ul aria-label="全部已选来源">{view.selected.map((entry,index)=><li key={entry.id}><FileIcon entry={entry}/><div><strong>{entry.name}</strong><small title={entry.displayPath}>{entry.displayPath}</small></div><Button ref={node=>{if(node)removeButtons.current.set(entry.id,node);else removeButtons.current.delete(entry.id)}} variant="ghost" size="icon-xs" aria-label={`移除 ${entry.name}`} disabled={pending} onClick={()=>remove(entry,index)}><X/></Button></li>)}</ul>:<p>在上方勾选文件或文件夹，跨目录选择也会保留在这里。</p>}</div></section>
   <footer className="nisp-footer"><p>支持 TXT、MD、DOC、DOCX、PDF、HTML、HTM<span>文件夹中的文本将在确认后读取，来源保持只读。</span></p><div><Button variant="outline" onClick={()=>void cancelNovelImportSourcePicker()}>取消</Button><Button disabled={pending||!view.selected.length||view.selected.some(entry=>!entry.selectable)} onClick={()=>void mutateNovelImportSourcePicker({type:'confirm'})}>选择</Button></div></footer>
  </DialogContent>
 </Dialog>
}
