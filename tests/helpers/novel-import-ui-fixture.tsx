import React from 'react'
import {Toaster} from 'sonner'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NovelImportDialog, NovelImportTaskButton } from '../../src/components/desktop/NovelImportDialog'
import { NovelImportRecord } from '../../src/components/desktop/NovelImportRecord'
import { requestNovelImport, useNovelImportStore } from '../../src/lib/desktop/novel-import'
import {useDesktopStore} from '../../src/stores/desktop'
import { useTabsStore } from '../../src/stores/tabs'
import { IMPORT_KINDS, IMPORT_TARGETS, type ImportAction, type ImportView } from '../../desktop/shared/novel-import'

// Controlled public bridge: real React, never native/DB/provider acceptance.
declare global { interface Window { mountNovelImport(options?:{chooseError?:boolean;deferredChoose?:boolean;platform?:'darwin'|'win32';phase?:ImportView['phase'];noModels?:boolean;noBody?:boolean;theme?:string;deferredPatch?:boolean;longRecord?:boolean;deferredTitle?:boolean;reselectMode?:'cancel'|'error'|'deferred';cancelMode?:'unknown-files'|'retained';publication?:boolean}):void; novelImportFixture:any } }
window.mountNovelImport=(options={})=>{
 useDesktopStore.setState({bootstrap:{platform:options.platform??'darwin'} as NonNullable<ReturnType<typeof useDesktopStore.getState>['bootstrap']>})
 const model={id:'text-fixture',name:'隔离文本模型',modelId:'fixture-model',endpoint:'https://fixture.invalid/v1',authRevision:1,contextWindow:32000}
 const found=Object.fromEntries(IMPORT_KINDS.map(k=>[k,['body','outline','character','world'].includes(k)?1:0])) as ImportView['found']
 if(options.noBody)found.body=0
 let view:ImportView={id:'60103f7f-b69b-4d56-a228-417c8b7b6053',revision:1,phase:options.phase??'source',title:'隔离测试作品',files:[{id:'f1',name:'正文.txt',format:'txt',bytes:80,hash:'source-hash',included:true,characters:40,unitCount:2,unknownCount:0},{id:'f2',name:'角色.md',format:'md',bytes:70,hash:'character-hash',included:true,characters:30,unitCount:1,unknownCount:0},{id:'f3',name:'大纲.docx',format:'docx',bytes:70,hash:'outline-hash',included:true,characters:30,unitCount:1,unknownCount:0}],found,selected:IMPORT_KINDS.filter(k=>found[k]>0),targets:[...IMPORT_TARGETS],infer:!options.noBody,steps:[],conflicts:[],patches:[],models:options.noModels?{}:{text:model,review:{...model,id:'review-fixture',name:'隔离审核模型'}},targetReady:false,sourceReady:true,chapters:[{id:'chapter-1',title:'第一章',start:0,end:40}],notFound:[],modified:false}
 const calls:ImportAction[]=[],listeners=new Set<(event:unknown)=>void>(),requests:string[]=[]
 let releaseChoose=()=>{}
 const chooseWait=options.deferredChoose?new Promise<void>(resolve=>{releaseChoose=resolve}):Promise.resolve()
 let releaseTitle=()=>{}
 const titleWait=options.deferredTitle?new Promise<void>(resolve=>{releaseTitle=resolve}):Promise.resolve()
 let releaseReselect=()=>{}
 const reselectWait=options.reselectMode==='deferred'?new Promise<void>(resolve=>{releaseReselect=resolve}):Promise.resolve()
 if(options.publication)view.publication={requestId:view.id}
 // The main process never restores an unsaved draft at startup: nothing is current before the first choose.
 let chosen=!!options.publication,deleted=false,renderSuspended=(_:boolean)=>{}
 const settings:string[]=[]
 window.addEventListener('desktop:settings-section',event=>settings.push(String((event as CustomEvent).detail)))
 const copy=()=>deleted?null:structuredClone(view)
 const publish=()=>listeners.forEach(listener=>listener({type:'novel-import',view:copy()}))
 const conflict=(type:'setting-body'|'source-source'|'body-body'='setting-body')=>({id:'conflict-1',type,kind:'character' as const,entity:'林舟',field:'年龄',source:{text:'林舟十九岁',value:'十九岁'},candidate:{text:'林舟十七岁',value:'十七岁'},evidence:[{unitId:'unit-1',quote:'林舟十七岁'}],status:'pending' as const,hash:'conflict-hash'})
 const sourceText='第一章\n\n林舟十七岁，来到渡口。\n\n他把信交给了许宁。'
 const bridge=async(action:ImportAction)=>{
  if(options.chooseError&&action.type==='choose')throw Error('所选来源中没有可导入的文本文件，请重新选择')
  calls.push(structuredClone(action));if('revision'in action&&action.revision!==view.revision)throw Error('隔离版本冲突')
  if(action.type==='read-source')return {view:copy(),source:{fileId:action.fileId,offset:action.offset??0,total:sourceText.length,text:sourceText.slice(action.offset??0,(action.offset??0)+(action.limit??32768)),units:[{id:'unit-1',start:0,end:20,kind:'body'},{id:'unit-2',start:20,end:sourceText.length,kind:'body'}]}}
  if(action.type==='choose'){await chooseWait;chosen=true}
  if(action.type==='current'&&!chosen)return {view:null}
  if(action.type==='cancel'||action.type==='discard'){
   deleted=true
   if(options.cancelMode==='retained')return {view:null,retained:'导入已删除；目标目录 /合成/目录 留有未完成的文件：作品目录正在使用'}
   if(options.cancelMode==='unknown-files')throw Error('导入草稿目录含未知文件，已保留：'+view.id)
   return {view:null}
  }
  if(action.type==='choose'&&deleted){deleted=false;view={...view,id:'7d2c0e5a-4a0f-4c1e-9d55-1f0b6c1e2a30',revision:1,phase:'source'};return {view:copy()}}
  if(action.type==='current'||action.type==='choose')return {view:copy()}
  if(action.type==='reselect-source'){
   await reselectWait
   if(options.reselectMode==='cancel')return {view:copy()}
   if(options.reselectMode==='error')throw Error('所选文件与原来源不一致，原草稿保持不变')
   view.phase='source'
  }
  if(action.type==='select'){view.selected=action.selected;view.targets=action.targets;view.infer=action.infer}
  if(action.type==='include'){view.files.find(f=>f.id===action.fileId)!.included=action.included;view.sourceReady=!view.files.some(f=>f.included&&(f.error||f.unknownCount>0))}
  if(action.type==='move'){const i=view.files.findIndex(f=>f.id===action.fileId),j=i+action.delta;[view.files[i],view.files[j]]=[view.files[j],view.files[i]]}
  if(action.type==='set-title'){await titleWait;view.title=action.title}
  if(action.type==='set-encoding'){view.files.find(f=>f.id===action.fileId)!.encoding=action.encoding;view.files.find(f=>f.id===action.fileId)!.requiresEncodingConfirmation=false}
  if(action.type==='set-range')view.files.find(f=>f.id===action.fileId)!.unknownCount=0
  if(action.type==='set-chapters')view.chapters=action.cuts.map((cut,i)=>({id:'chapter-'+i,...cut,end:action.cuts[i+1]?.start??sourceText.length}))
  if(action.type==='classify'){if(action.mode==='ai'&&!view.models.text)throw Error('尚未配置文本模型');view.phase=action.mode==='ai'?'recognizing':'select'}
  if(action.type==='choose-target'){view.targetReady=true;view.targetLabel='隔离目录/隔离测试作品'}
  if(action.type==='start'&&!view.conflicts.some(c=>c.status==='pending')){view.phase='running';view.steps=[{key:'body',label:'导入正文',state:'done',completed:1,total:1},{key:'outline',label:'导入大纲',state:'running',completed:0,total:1}]}
  if(action.type==='pause')view.phase='paused'
  if(action.type==='resume'||action.type==='retry')view.phase='running'
  if(action.type==='resolve'){
   if(action.choice==='rewrite'){if(!options.deferredPatch)view.patches=[{id:'patch-1',start:3,end:9,before:'林舟十七岁',after:'林舟十九岁',reason:'采用原角色设定',workingRevision:0,conflictId:'conflict-1'}]}
   else if(view.conflictDetail){view.conflicts=view.conflicts.filter(c=>c.id!==action.conflictId);view.conflictDetail=undefined;view.phase=view.conflicts.length?'conflicts':'select'}
   else {view.conflicts=[];view.phase='running'}
  }
  if(action.type==='apply-patches'){view.patches=[];view.conflicts=[];view.modified=true;view.phase='confirm'}
  view.revision++;return {view:copy()}
 }
 ;(window as any).desktop={novelImport:bridge,subscribe:(fn:(event:unknown)=>void)=>{listeners.add(fn);return()=>listeners.delete(fn)}}
 window.fetch=async(input)=>{
  requests.push(String(input));const url=new URL(String(input),'https://local.invalid')
  const record={id:'import-record-1',title:view.title,createdAt:'2026-10-25',sourceKinds:['body','outline'],targets:['character'],modified:view.modified,summary:{source:2,inferred:1,decisions:1,modified:0},materials:[{id:'outline-original',kind:'outline',name:'原始大纲',origin:'source',characters:12}],decisions:[{choice:'采用原设定'}]}
  const text=options.longRecord?'x'.repeat(32765)+'🖋🖋'+'y'.repeat(65534-32769)+'🖋'+'z'.repeat(40000):'原始大纲全文，逐字保留。'
  let offset=Number(url.searchParams.get('offset')??0),end=0;const safe=(position:number)=>position===0||position>=text.length||!(text.charCodeAt(position)>=0xdc00&&text.charCodeAt(position)<=0xdfff&&text.charCodeAt(position-1)>=0xd800&&text.charCodeAt(position-1)<=0xdbff)
  if(!safe(offset))offset--;end=Math.min(text.length,offset+32768);if(!safe(end))end--
  return new Response(JSON.stringify({record,...(url.searchParams.has('material')?{page:{text:text.slice(offset,end),offset,total:text.length}}:{})}),{headers:{'Content-Type':'application/json'}})
 }
 const query=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity}}})
 query.setQueryData(['novels'],{novels:[]})
 document.documentElement.className=options.theme??'ink'
 useNovelImportStore.setState({view:null,open:false,screen:'source',busy:0,error:null,source:null})
 const root=createRoot(document.getElementById('app')!)
 flushSync(()=>root.render(<QueryClientProvider client={query}><button id="fixture-import" onClick={()=>{void requestNovelImport()}}>导入作品</button><NovelImportTaskButton/><SuspendableDialog register={fn=>{renderSuspended=fn}}/><Toaster/><NovelImportRecord novelId="isolated-novel"/></QueryClientProvider>))
 window.novelImportFixture={settings,setOpen:(open:boolean)=>useNovelImportStore.setState({open}),deleted:()=>deleted,setSuspended:(value:boolean)=>renderSuspended(value),pushView:(next:ImportView|null)=>{if(!next)deleted=true;listeners.forEach(listener=>listener({type:'novel-import',view:next}))},calls,requests,releaseChoose:()=>releaseChoose(),novelsInvalidated:()=>query.getQueryState(['novels'])?.isInvalidated,releaseTitle:()=>releaseTitle(),releaseReselect:()=>releaseReselect(),state:()=>useNovelImportStore.getState(),tabs:()=>useTabsStore.getState().tabs,view:copy,set:(changes:Partial<ImportView>)=>{view={...view,...changes,revision:view.revision+1};publish()},completePatches:()=>{view.patches=[{id:'patch-1',start:3,end:9,before:'林舟十七岁',after:'林舟十九岁',reason:'采用原角色设定',workingRevision:0,conflictId:'conflict-1'}];view.revision++;publish()},completeRecognition:()=>{view.phase='select';view.revision++;publish()},conflict:(type?:'setting-body'|'source-source'|'body-body')=>{view.phase='conflicts';view.conflicts=[conflict(type)];view.revision++;publish()},
 wizardConflict:(over:Record<string,unknown>={})=>{view.phase='conflicts';view.conflicts=[conflict('setting-body'),{...conflict('setting-body'),id:'conflict-2',hash:'h2'}];view.conflictDetail={conflictId:'conflict-1',index:1,total:2,entity:'灰雾空间',kindLabel:'金手指',fieldLabel:'触发条件',reason:'资料写需默念咒文，原文只写逆走四步',current:'逆走四步并默念咒文',proposed:'逆走四步',mergeDefault:'逆走四步并默念咒文',evidence:[{quote:'逆时针走了四步。',location:'第一部 小丑 · 第一章 起'}],choices:[{choice:'inferred',available:true},{choice:'source',available:true},{choice:'merge',available:true}],...over} as never;view.revision++;publish()},complete:()=>{view.phase='completed';view.summary={source:4,inferred:3,decisions:1,modified:0};view.publication={requestId:'import-1',workId:'work-1',novelId:'isolated-novel'};view.revision++;publish()},unmount:()=>root.unmount()}
}
function SuspendableDialog({register}:{register(fn:(value:boolean)=>void):void}){const [suspended,setSuspended]=React.useState(false);React.useEffect(()=>register(setSuspended),[register]);return <NovelImportDialog suspended={suspended}/>}
