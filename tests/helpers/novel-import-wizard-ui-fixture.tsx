import React from 'react'
import {createRoot} from 'react-dom/client'
import {flushSync} from 'react-dom'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
import {NovelImportDialog,NovelImportTaskButton} from '../../src/components/desktop/NovelImportDialog'
import {requestNovelImport,useNovelImportStore} from '../../src/lib/desktop/novel-import'
import {IMPORT_KINDS,IMPORT_TARGETS,type ImportAction,type ImportView} from '../../desktop/shared/novel-import'
import {WIZARD_STEPS,type WizardStep,type WizardCandidate,type WizardTask} from '../../desktop/shared/novel-import-wizard'
import type {ImportWizardView} from '../../desktop/shared/novel-import'

/* Controlled bridge with synthetic wizard views. It proves rendering and the actions the UI sends;
 * controller behaviour is covered by tests/unit/novel-import-wizard-session.test.ts. */
type TargetReply={kind:'success';label:string}|{kind:'cancel'}
type Options={verifyRepair?:boolean;step:WizardStep;settingsDropped?:boolean;linesDropped?:boolean;noModel?:boolean;noImageModel?:boolean;phase?:ImportView['phase'];failing?:boolean;checksBad?:boolean;empty?:boolean;recognitionFailed?:boolean;rosterFound?:number;rosterIncomplete?:number;rosterDropped?:boolean;foreshadowFound?:number;lineProgress?:{done:number;total:number};theme?:string;deferredTitle?:boolean;titleFailures?:number;deferredTarget?:boolean;deferredCancel?:boolean;targetReplies?:TargetReply[];choosing?:boolean;
 /** docs/560 step 22: a started save, its error and whether the folder must be authorized again. */
 publication?:boolean;error?:string;targetNeedsAuthorization?:boolean}
declare global{interface Window{mountWizard(o:Options):void;wizardFixture:{calls:ImportAction[];view():ImportView;set(change:(v:ImportView)=>void):void;state():{busy:number;error:string|null};releaseTitle():void;releaseTarget():void;releaseCancel():void;releaseChoose():void}}}
const base={aliases:[],chapterCount:3,sources:['body' as const],sourceArtifactIds:[],selected:true}
const id=(p:string,n:number)=>`${p}-${n.toString(16).padStart(16,'0')}`
function wizard(o:Options):ImportWizardView{
 const structure=[...['第一章 起','第二章 承','第三章 转'].map(title=>({title,volume:'甲卷'})),...['第一章 再起','第二章 再承','第三章 再终'].map(title=>({title,volume:'乙卷'})),...['第一章 三起','第二章 三承','第三章 三终','第四章 三尾'].map(title=>({title,volume:'丙卷'})),{title:'后记'}]
 const characters:WizardCandidate[]=[{...base,id:id('c',1),kind:'character',name:'沈砚',roleType:'PROTAGONIST',aliases:['砚哥'],sources:['source','body']},{...base,id:id('c',2),kind:'character',name:'林舟',roleType:'SUPPORTING'},{...base,id:id('c',3),kind:'character',name:'顾三',roleType:'ANTAGONIST'}]
 const scenes:WizardCandidate[]=[{...base,id:id('s',1),kind:'scene',name:'北城'},{...base,id:id('s',2),kind:'scene',name:'南巷',parentId:id('s',1)}]
 const items:WizardCandidate[]=[{...base,id:id('i',1),kind:'item',name:'青铜钥匙',itemType:'信物'}]
 const worlds:WizardCandidate[]=[{...base,id:id('w',1),kind:'world',name:'北城世界'},{...base,id:id('ws',1),kind:'world-setting',name:'城制',parentId:id('w',1),settingType:'SOCIETY'},{...base,id:id('ws',2),kind:'world-setting',name:'山川',parentId:id('w',1),settingType:'GEOGRAPHY'},{...base,id:id('w',2),kind:'world',name:'南巷梦境',parentId:id('w',1)},{...base,id:id('ws',3),kind:'world-setting',name:'梦俗',parentId:id('w',2),settingType:'CULTURE'}]
 const index=WIZARD_STEPS.indexOf(o.step),stepState=Object.fromEntries(WIZARD_STEPS.map((s,k)=>[s,k<index?'done':k===index?(o.recognitionFailed?'failed':o.phase==='running'?'running':'waiting'):'pending'])) as ImportWizardView['stepState']
 const tasks:ImportWizardView['tasks']=o.step==='import-char'?[
  {id:'e-0000000000000001',kind:'entity',candidateId:id('c',1),state:'done',attempts:1},{id:'i-0000000000000001-avatar',kind:'image',candidateId:id('c',1),imageKind:'avatar',dependsOn:'e-0000000000000001',state:'done',attempts:1,image:{mime:'image/png',bytes:68}},
  {id:'e-0000000000000002',kind:'entity',candidateId:id('c',2),state:o.failing?'failed':'running',attempts:1,...(o.failing?{error:'模型服务返回服务器错误提示，请稍后重试'}:{})},{id:'i-0000000000000002-avatar',kind:'image',candidateId:id('c',2),imageKind:'avatar',dependsOn:'e-0000000000000002',state:'waiting',attempts:0},
  {id:'e-0000000000000003',kind:'entity',candidateId:id('c',3),state:'waiting',attempts:0},{id:'i-0000000000000003-avatar',kind:'image',candidateId:id('c',3),imageKind:'avatar',dependsOn:'e-0000000000000003',state:'waiting',attempts:0}]:o.step==='import-world'?[
  ...worlds.map((c,k)=>({id:'e-00000000000000w'+k,kind:'entity' as const,candidateId:c.id,state:'waiting' as const,attempts:0})),{id:'g-theme',kind:'settings',settingsKind:'theme',state:'waiting',attempts:0}]:[]
 const checks=o.step==='verify'?['chapters','scope','relationships','worlds','lines','outlines','touches','consistency'].map(key=>o.verifyRepair&&key==='consistency'?{key,ok:false,detail:'1 段复核未完成：模型服务返回服务器错误提示，请稍后重试'}:({key,ok:!(o.checksBad&&key==='relationships'),detail:o.checksBad&&key==='relationships'?'“沈砚”的关系指向未导入的角色“无名”':'通过'})):undefined
 return {version:1,step:o.step,stepState,...(o.verifyRepair?{verify:{failedPackets:[{unitIds:['u1'],error:'模型服务返回服务器错误提示，请稍后重试',attempts:3}],repairs:[],fixed:[{label:'沈砚',field:'内容'}],droppedConflicts:2,outlineAttempts:0,repairable:true}}:{}),...(o.rosterFound!==undefined?{rosterFound:o.rosterFound}:{}),...(o.rosterIncomplete!==undefined?{rosterIncomplete:o.rosterIncomplete}:{}),...(o.foreshadowFound!==undefined?{foreshadowFound:o.foreshadowFound}:{}),...(o.lineProgress?{lineProgress:o.lineProgress}:{}),...(o.recognitionFailed?{stepError:'模型服务返回请求频率限制提示，请稍后重试'}:{}),structure,chapterSelection:structure.map((_,i)=>i),...(index>WIZARD_STEPS.indexOf('tree')?{grantedChapters:structure.map((_,i)=>i)}:{}),
  candidates:o.empty?{character:[]}:{character:characters,scene:scenes,item:items,world:worlds},images:{avatar:o.step==='import-char',portrait:false,exterior:false,interior:false,icon:false},imageGrants:{},tasks,skipped:o.step==='verify'?[{taskId:'i-x',label:'林舟的头像'},{taskId:'e-x',label:'顾三'}]:[],dropped:[...(o.rosterDropped?[{kind:'roster',rosterKind:'character',label:'角色识别',reason:'已跳过：5 项无法在原文定位',invalid:0,unlocatable:5} as const]:[]),...(o.linesDropped?[{kind:'lines',label:'叙事线',reason:'丢弃 3 个无法对应已导入实体的关联'} as const]:o.settingsDropped?[{kind:'settings',label:'主题',reason:'丢弃 2 条无法定位的原文引文'},{kind:'parent',label:'南巷',reason:'上级未导入，作为顶层导入'}] as const:[])] as ImportWizardView['dropped'],deferredConflicts:[],...(checks?{checks}:{})} as ImportWizardView
}
window.mountWizard=(o)=>{
 const text={id:'text',name:'受控文本模型',modelId:'m',endpoint:'https://model.invalid/v1',authRevision:1,contextWindow:1048576}
 const found=Object.fromEntries(IMPORT_KINDS.map(k=>[k,['body','character','world'].includes(k)?1:0])) as ImportView['found']
 let view:ImportView={id:'60103f7f-b69b-4d56-a228-417c8b7b6053',revision:1,phase:o.phase??'select',title:'合成作品',files:[{id:'f1',name:'正文.txt',format:'txt',bytes:80,hash:'h',included:true,encoding:'gb18030',characters:4803,unitCount:10,unknownCount:0}],found,selected:['body','character','world'],targets:[...IMPORT_TARGETS],infer:true,steps:[],conflicts:[],patches:[],
  models:o.noModel?{}:{text,review:{...text,id:'review',name:'受控审核模型'},...(o.noImageModel?{}:{image:{id:'image',name:'受控图像模型'}})},targetLabel:o.step==='work'?undefined:'作品目录',targetReady:o.step!=='work'&&!o.targetNeedsAuthorization,sourceReady:true,chapters:[],notFound:[],modified:false,wizard:wizard(o),
  ...(o.publication?{publication:{requestId:'60103f7f-b69b-4d56-a228-417c8b7b6053'}}:{}),...(o.error?{error:o.error}:{})}
 const calls:ImportAction[]=[],targetReplies=[...(o.targetReplies??[])]
 let titleFailures=o.titleFailures??0,releaseTitle=()=>{},releaseTarget=()=>{},releaseCancel=()=>{},releaseChoose=()=>{}
 const listeners=new Set<(event:unknown)=>void>(),emit=(event:unknown)=>listeners.forEach(listener=>listener(event))
 const titleWait=()=>o.deferredTitle?new Promise<void>(resolve=>{releaseTitle=resolve}):Promise.resolve()
 const targetWait=()=>o.deferredTarget?new Promise<void>(resolve=>{releaseTarget=resolve}):Promise.resolve()
 const cancelWait=()=>o.deferredCancel?new Promise<void>(resolve=>{releaseCancel=resolve}):Promise.resolve()
 const png=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgAAIAAAUAAarVyFEAAAAASUVORK5CYII='),c=>c.charCodeAt(0))
 ;(window as unknown as {desktop:unknown}).desktop={novelImport:async(action:ImportAction)=>{
  calls.push(structuredClone(action))
  // Mirrors the main process: picker closed, files are read, then the first view is returned.
  if(action.type==='choose'){emit({type:'novel-import-reading',active:true});await new Promise<void>(resolve=>{releaseChoose=resolve});emit({type:'novel-import-reading',active:false});view={...view,wizard:wizard({...o,step:'files'}),phase:'source'};return {view:structuredClone(view)}}
  if(action.type==='current'&&o.choosing)return {view:null}
  if(action.type==='cancel'||action.type==='discard'){await cancelWait();return {view:null}};if(action.type==='wizard-read-image')return {view,image:{mime:'image/png',bytes:png}}
  if('revision' in action){
   if(action.revision!==view.revision)throw Error('隔离版本冲突')
   if(action.type==='set-title'){await titleWait();if(titleFailures>0){titleFailures--;throw Error('隔离标题保存失败')}view.title=action.title}
   if(action.type==='choose-target'){await targetWait();const reply=targetReplies.shift()??{kind:'success' as const,label:'作品目录'};if(reply.kind==='success'){view.targetLabel=reply.label;view.targetReady=true}}
   view={...view,revision:view.revision+1}
  }
  return {view:structuredClone(view)}
 },subscribe:(listener:(event:unknown)=>void)=>{listeners.add(listener);return ()=>listeners.delete(listener)}}
 document.documentElement.className=o.theme??'ink'
 useNovelImportStore.setState(o.choosing?{view:null,open:false,busy:0,error:null,source:null}:{view:structuredClone(view),open:true,screen:view.phase==='conflicts'?'conflicts':view.phase==='completed'?'completed':'select',busy:0,error:null,source:null})
 const query=new QueryClient()
 flushSync(()=>createRoot(document.getElementById('app')!).render(<QueryClientProvider client={query}><NovelImportTaskButton/><NovelImportDialog/></QueryClientProvider>))
 window.wizardFixture={calls,view:()=>view,set(change){change(view);useNovelImportStore.setState({view:structuredClone(view)})},state:()=>useNovelImportStore.getState(),releaseTitle:()=>releaseTitle(),releaseTarget:()=>releaseTarget(),releaseCancel:()=>releaseCancel(),releaseChoose:()=>releaseChoose()}
 // Like the menu command: the picker is opened while no import exists.
 if(o.choosing)setTimeout(()=>void requestNovelImport('files'),50)
}
