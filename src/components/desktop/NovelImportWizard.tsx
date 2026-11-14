"use client"

import {useEffect,useRef,useState,type ReactNode} from 'react'
import {AlertTriangle,Check,ChevronDown,CircleAlert,CircleCheck,CircleUserRound,FolderOpen,Gem,Globe,House,Image as ImageIcon,ListChecks,LoaderCircle,MapPin,Mountain,Pause,Play,RotateCcw,Sparkles,UserRound} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {DialogDescription,DialogTitle} from '@/components/ui/dialog'
import {IMPORT_KINDS,IMPORT_LABELS,IMPORT_TARGETS,type ImportKind,type ImportTarget,type ImportView,type ImportWizardView} from '@desktop/shared/novel-import'
import {WIZARD_STEPS,WIZARD_STEP_TITLES,WIZARD_IMAGE_KINDS,WIZARD_IMAGE_OWNER,type WizardCandidate,type WizardImageKind,type WizardStep} from '@desktop/shared/novel-import-wizard'
import {mutateNovelImport,readNovelImportWizardImage} from '@/lib/desktop/novel-import'
import {WIZARD_ENTITY_LABELS,WIZARD_IMAGE_LABELS,wizardAnalyzeButton,wizardCandidateMatches,wizardImportButton,wizardProgressText,wizardStageText,wizardStepNumber,wizardVolumeToggle,type WizardEntityKind} from '@/lib/desktop/novel-import-wizard'
import {SceneIdentityDetails} from './SceneIdentityDetails'
import {getTabIcon} from '@/stores/tabs'
import type {SettingType} from '@/generated/prisma/enums'

/** The approved step-by-step import wizard (design/novel-import-wizard). Every value comes from view.wizard. */
const STAGES=['准备','结构与正文','角色 · 场景 · 物品','世界观','剧情','校验与完成']
const STAGE_OF:Record<WizardStep,number>={entry:0,files:0,work:0,kinds:0,'detect-struct':1,tree:1,'import-struct':1,'import-body':1,'detect-char':2,'import-char':2,'detect-scene':2,'import-scene':2,'detect-item':2,'import-item':2,'detect-world':3,'import-world':3,worldline:4,narrative:4,outline:4,foreshadow:4,verify:5,done:5}
const ROSTER:Partial<Record<WizardStep,WizardEntityKind>>={'detect-char':'character','detect-scene':'scene','detect-item':'item','detect-world':'world'}
const IMPORTS:Partial<Record<WizardStep,WizardEntityKind>>={'import-char':'character','import-scene':'scene','import-item':'item','import-world':'world'}
const ROLE_LABELS={PROTAGONIST:'主角',SUPPORTING:'配角',ANTAGONIST:'反派'} as const
const IMAGE_ICON:Record<WizardImageKind,typeof CircleUserRound>={avatar:CircleUserRound,portrait:ImageIcon,exterior:Mountain,interior:House,icon:Gem}
const ENTITY_ICON={character:UserRound,scene:MapPin,item:Gem,world:Globe}
const STATE_TEXT={waiting:'等待',running:'导入中',done:'已完成',failed:'失败',paused:'已暂停',skipped:'已跳过'} as const
/** World candidates use the workbench tree icons, so each setting type has its own icon (docs/506 3R-6). */
const worldIcon=(c?:WizardCandidate)=>c?.kind==='world-setting'&&c.settingType?getTabIcon({type:'setting',settingType:c.settingType as SettingType}):getTabIcon({type:'world'})
const worldTag=(c:WizardCandidate)=>c.kind==='world'?'世界':SETTING_LABELS[c.settingType??'']??''
const SETTING_LABELS:Record<string,string>={LEVEL_SYSTEM:'等级体系',POWER_SYSTEM:'力量体系',CONCEPT:'概念',MAP:'地图',FACTION:'势力',SOCIETY:'社会环境',CULTURE:'人文环境',GEOGRAPHY:'地理',WORLD_HISTORY:'世界历史'}

type Props={view:ImportView&{wizard:ImportWizardView};busy:boolean;onStop():void;onRevise():void}
const act=(type:string,extra:Record<string,unknown>={})=>mutateNovelImport({type,...extra} as never)
function Footer({children,note}:{children:ReactNode;note?:ReactNode}){return <footer className="ni-footer">{note!==undefined&&<span aria-live="polite">{note}</span>}{children}</footer>}
function Notice({title,children,alert}:{title:ReactNode;children?:ReactNode;alert?:boolean}){return <div className="ni-notice" role={alert?'alert':undefined}><strong>{title}</strong>{children&&<p>{children}</p>}</div>}

/** Step overview: one line by default, all 22 steps when expanded. */
function StepRail({w}:{w:ImportWizardView}){
 const [open,setOpen]=useState(false),current=WIZARD_STEPS.indexOf(w.step)
 return <div className="ni-w-rail"><button type="button" className="ni-w-railtoggle" aria-expanded={open} onClick={()=>setOpen(v=>!v)}><ListChecks/>第 {current+1} / {WIZARD_STEPS.length} 步 · {WIZARD_STEP_TITLES[w.step]}<span>{open?'收起全部步骤':'查看全部步骤'}</span></button>
  {open&&<ol className="ni-w-steps">{WIZARD_STEPS.map((step,k)=>{const state=w.stepState[step]==='skipped'?'skip':k<current?'done':k===current?'now':'wait';return <li key={step} data-s={state}><b>{k+1}</b>{state==='done'&&<Check/>}{state==='now'&&<LoaderCircle className="ni-spinner"/>}{WIZARD_STEP_TITLES[step]}<span className="ni-w-sr">{({skip:'，已跳过',done:'，已完成',now:'，进行中',wait:''})[state]}</span></li>})}</ol>}
 </div>
}
function Progress({done,total,label}:{done:number;total:number;label:string}){return <div className="ni-w-prog"><div className="ni-w-bar" role="progressbar" aria-label="导入进度" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}><i style={{width:`${total?done/total*100:0}%`}}/></div><span id="ni-w-live" aria-live="polite">{label}</span></div>}
/** Permission is never given silently on resume: the author sees what is sent and to which model (05 §3). */
export function ResumeConsent({view}:{view:Props['view']}){
 const reason=view.error&&/重新允许/u.test(view.error)?view.error:undefined
 if(view.phase!=='paused'&&!reason)return null
 const images=/图片/u.test(reason??''),structure=/卷章/u.test(reason??'')
 return <Notice title={reason??'导入已暂停'}>{images?`继续导入即允许把外观描述发送给图像模型 ${view.models.image?.name??'（未配置）'}。`:structure?`继续导入即允许把来源发送给文本模型 ${view.models.text?.name??'（未配置）'}识别卷章。`:view.models.text?`继续导入即允许把所选章节正文及资料发送给文本模型 ${view.models.text.name}${view.models.review?`与审核模型 ${view.models.review.name}`:''}。`:'继续导入只拷贝资料，不向模型发送内容。'}{reason&&view.phase!=='paused'&&<> <Button size="sm" variant="outline" onClick={()=>void act('resume',images?{consent:true,imageConsent:true}:{consent:true})}>允许并继续</Button></>}</Notice>
}
function RunningFooter({view,busy,onStop,onRevise,extra,resume}:Omit<Props,'view'>&{view:Props['view'];extra?:ReactNode;resume?:Record<string,unknown>}){
 const paused=view.phase==='paused'||!!view.error&&/重新允许/u.test(view.error),images=/图片/u.test(view.error??'')
 return <Footer note="停止或关闭窗口会删除这次导入"><Button variant="ghost" disabled={busy} onClick={onStop}>停止导入</Button><Button variant="ghost" disabled={busy} onClick={onRevise}>返回修改选择</Button>{extra}
  {resume&&!paused?<Button variant="outline" disabled={busy} onClick={()=>void act('resume',resume)}><Play/>继续导入</Button>:paused?<Button variant="outline" disabled={busy} onClick={()=>void act('resume',images?{consent:true,imageConsent:true}:{consent:true})}><Play/>允许并继续导入</Button>:<Button variant="outline" disabled={busy} onClick={()=>void act('pause')}><Pause/>暂停</Button>}</Footer>
}

function FilesStep({view,busy,onStop}:Props){
 const [open,setOpen]=useState<string|null>(null)
 return <><div className="ni-body"><h3>选中的文件</h3><p>按下列顺序合并。</p><div className="ni-files">{view.files.map(file=><div className={`ni-file ${file.included?'':'ni-muted'}`} key={file.id}>
  <input type="checkbox" aria-label={`纳入 ${file.name}`} checked={file.included} disabled={busy||!!file.error} onChange={event=>void act('include',{fileId:file.id,included:event.target.checked})}/>
  <div className="ni-file-meta"><strong>{file.name}</strong><span>{file.characters.toLocaleString()} 字符{file.encoding&&` · ${file.encoding.toUpperCase()}（自动识别）`}{file.encoding&&open!==file.id&&<> <button type="button" className="ni-source-link" onClick={()=>setOpen(file.id)}>编码不对？</button></>}</span>
   {open===file.id&&<label className="ni-check-line">改用<select aria-label={`${file.name} 编码`} defaultValue={file.encoding} onChange={event=>{setOpen(null);void act('set-encoding',{fileId:file.id,encoding:event.target.value})}}>{['utf-8','utf-16le','utf-16be','gb18030'].map(e=><option key={e} value={e}>{e.toUpperCase()}</option>)}</select></label>}
   {file.error&&<span role="status" className="ni-error-text">{file.error}</span>}</div></div>)}</div></div>
  <Footer note={`${view.files.filter(f=>f.included).length} 个文件纳入导入`}><Button variant="ghost" onClick={onStop}>取消</Button><Button disabled={busy||!view.files.some(f=>f.included&&!f.error)} onClick={()=>void act('wizard-next')}>继续</Button></Footer></>
}
function WorkStep({view,busy}:Props){
 const [title,setTitle]=useState(view.title)
 useEffect(()=>setTitle(view.title),[view.id,view.title])
 const save=async()=>title===view.title||!!await act('set-title',{title})
 return <><div className="ni-body"><label className="ni-field">作品名称<input aria-label="作品名称" value={title} maxLength={100} disabled={busy} onChange={event=>setTitle(event.target.value)}/></label><p>默认取第一个文件名，可修改。</p>
  <div className="ni-row ni-target-directory"><div><h3>保存到新的空目录</h3><p>{view.targetLabel??'请选择用来保存新作品的空目录。目录不能与来源文件重叠。'}</p></div><Button variant="outline" disabled={busy} onClick={async()=>{if(await save())await act('choose-target')}}><FolderOpen/>选择目录</Button></div>
  <p>作品在全部导入并校验通过后才写入此目录；中途停止会删除这次导入，原始文件不会更改。</p></div>
  <Footer><Button variant="ghost" disabled={busy} onClick={async()=>{if(await save())await act('wizard-back')}}>上一步</Button><Button disabled={busy||!title.trim()||!view.targetLabel} onClick={async()=>{if(await save())await act('wizard-next')}}>继续</Button></Footer></>
}
function KindsStep({view,busy}:Props){
 const body=view.selected.includes('body'),model=!!view.models.text,can=body&&model
 const toggleSource=(kind:ImportKind,checked:boolean)=>mutateNovelImport(v=>({type:'select',selected:checked?[...v.selected,kind]:v.selected.filter(k=>k!==kind),targets:v.targets,infer:v.infer}))
 const toggleTarget=(kind:ImportTarget,checked:boolean)=>mutateNovelImport(v=>({type:'select',selected:v.selected,targets:checked?[...v.targets,kind]:v.targets.filter(k=>k!==kind),infer:true}))
 // The body's volume and chapter headings are its outline; importing the body always brings them along.
 const chapters=view.chapters.filter(c=>c.title!=='正文序言'&&c.title!=='未分章正文'),volumes=new Set(chapters.map(c=>c.volume).filter(Boolean)).size,structure=body&&chapters.length>0
 const foundText=(kind:ImportKind)=>kind==='outline'&&structure?`识别到 ${volumes?`${volumes} 卷 `:''}${chapters.length} 章`:view.found[kind]?`识别到 ${view.found[kind]} 处`:'未识别到'
 return <><div className="ni-body"><h3>从文件导入</h3><p>已在文件中识别到的内容默认勾选。</p><div className="ni-direct-options">{IMPORT_KINDS.map(kind=><div className={`ni-direct-option ${view.found[kind]?'':'ni-muted'}`} key={kind}><label><input type="checkbox" disabled={busy||!view.found[kind]||kind==='outline'&&structure} checked={view.selected.includes(kind)} onChange={event=>void toggleSource(kind,event.target.checked)}/><strong>{IMPORT_LABELS[kind]}</strong></label><span>{foundText(kind)}{kind==='outline'&&structure&&' · 随正文导入卷章结构'}</span></div>)}</div>
  <section className="ni-inference"><h3>根据正文补充推断</h3><p>{!model?'尚未配置模型，只能按原文拷贝。':body?'缺少的内容根据所选章节推断；资料与正文矛盾时由你决定。':'未选择正文，无法推断。'}</p>
   <div className="ni-target-options">{IMPORT_TARGETS.map(kind=><label key={kind} className={`ni-target-card ${view.targets.includes(kind)&&can?'ni-checked':''} ${can?'':'ni-disabled'}`}><input type="checkbox" disabled={busy||!can} checked={can&&view.targets.includes(kind)} onChange={event=>void toggleTarget(kind,event.target.checked)}/><span><strong>{IMPORT_LABELS[kind]}</strong></span></label>)}</div></section>
  {!view.sourceReady&&<div className="ni-error-text" role="status">仍有未分类的片段，请允许识别或返回核对。</div>}</div>
  <Footer><Button variant="ghost" disabled={busy} onClick={()=>void act('wizard-back')}>上一步</Button>{!view.sourceReady&&model&&<Button variant="outline" disabled={busy} onClick={()=>void act('classify',{mode:'ai',consent:true})}>允许识别</Button>}<Button disabled={busy||!view.selected.length||!view.sourceReady} onClick={()=>void act('wizard-next',{consent:true})}>{body?'识别卷章':'开始导入'}</Button></Footer></>
}

/** Search input that filters only after IME composition ends. */
function SearchBox({value,onChange,label}:{value:string;onChange(v:string):void;label:string}){
 const composing=useRef(false)
 return <input className="ni-w-search" aria-label={label} placeholder={label} defaultValue={value} onCompositionStart={()=>{composing.current=true}} onCompositionEnd={event=>{composing.current=false;onChange(event.currentTarget.value)}} onChange={event=>{if(!composing.current)onChange(event.target.value)}}/>
}
function TriBox({state,label,disabled,onChange}:{state:'checked'|'unchecked'|'mixed';label:string;disabled?:boolean;onChange(checked:boolean):void}){
 const ref=useRef<HTMLInputElement>(null);useEffect(()=>{if(ref.current)ref.current.indeterminate=state==='mixed'},[state])
 return <input ref={ref} type="checkbox" aria-label={label} checked={state==='checked'} disabled={disabled} onChange={event=>onChange(event.target.checked)}/>
}
function TreeStep({view,busy}:Props){
 const w=view.wizard,structure=w.structure??[],selected=new Set(w.chapterSelection??[]),[query,setQuery]=useState(''),[closed,setClosed]=useState<Set<number>>(new Set())
 const groups=structure.reduce<{name?:string;items:number[]}[]>((list,c,i)=>{const last=list.at(-1);if(last&&last.name===c.volume)last.items.push(i);else list.push({name:c.volume,items:[i]});return list},[])
 const write=(next:Set<number>)=>void act('wizard-select-chapters',{indices:[...next].sort((a,b)=>a-b)})
 const n=selected.size,volumes=groups.filter(g=>g.items.some(i=>selected.has(i))).length,model=!!view.models.text
 return <><div className="ni-body"><div className="ni-w-toolbar"><SearchBox value={query} onChange={setQuery} label="搜索章名"/><Button size="sm" variant="outline" disabled={busy} onClick={()=>write(new Set(structure.map((_,i)=>i)))}>全选</Button><Button size="sm" variant="outline" disabled={busy} onClick={()=>write(new Set())}>全不选</Button><span className="ni-w-count" aria-live="polite">已选 {n} / {structure.length} 章 · {volumes} 卷</span></div>
  {query&&<p>搜索时，卷复选框只作用于匹配的章节。</p>}
  <ul className="ni-w-tree" aria-label="卷章">{groups.map((g,k)=>{const visible=wizardVolumeToggle(g.items.map(i=>({title:structure[i].title,i})),query),scope=query?visible.map(v=>v.i):g.items,on=scope.filter(i=>selected.has(i)).length,open=!closed.has(k)||!!query;if(query&&!visible.length)return null
   return <li key={k}><div className="ni-w-node ni-w-vol"><button type="button" className="ni-w-tw" aria-expanded={open} aria-label={`${open?'收起':'展开'} ${g.name??'未分卷'}`} onClick={()=>setClosed(s=>{const x=new Set(s);if(x.has(k))x.delete(k);else x.add(k);return x})}><ChevronDown/></button>
    <TriBox state={on===scope.length?'checked':on?'mixed':'unchecked'} label={`${query?'选择匹配的章节：':'选择 '}${g.name??'未分卷'}`} disabled={busy} onChange={checked=>{const next=new Set(selected);for(const i of scope)if(checked)next.add(i);else next.delete(i);write(next)}}/>
    <span>{g.name??'未分卷'}</span>{g.name===undefined&&<span className="ni-w-tag">无卷标题</span>}<span className="ni-w-sub">{g.items.filter(i=>selected.has(i)).length} / {g.items.length} 章</span></div>
    {open&&<ul>{visible.map(({i})=><li key={i}><div className={`ni-w-node ni-w-ch ${selected.has(i)?'':'ni-muted'}`}><input type="checkbox" aria-label={`选择 ${structure[i].title}`} checked={selected.has(i)} disabled={busy} onChange={event=>{const next=new Set(selected);if(event.target.checked)next.add(i);else next.delete(i);write(next)}}/><span>{structure[i].title}</span></div></li>)}</ul>}</li>})}</ul></div>
  <div className="ni-w-after">{model?<span>发送范围：所选 {n} 章正文及资料文件 · 文本模型 {view.models.text?.name} 与审核模型 {view.models.review?.name??'（未配置）'}</span>:<span>尚未配置模型：仅拷贝所选 {n} 章正文、卷章结构和资料文件中的设定，不向模型发送内容。</span>}</div>
  <Footer note={n?'未选中的卷章，其正文、细纲、推断设定与伏笔均不导入':'请至少选择一章'}><Button variant="ghost" disabled={busy} onClick={()=>void act('wizard-back')}>上一步</Button><Button disabled={busy||!n} onClick={()=>void act('wizard-next',{consent:true})}>{wizardAnalyzeButton(model)}</Button></Footer></>
}

function RosterStep(props:Props&{kind:WizardEntityKind}){
 const {view,busy,kind,onRevise}=props,w=view.wizard,list=w.candidates[kind]??[],[query,setQuery]=useState(''),[details,setDetails]=useState<Set<string>>(new Set()),[editing,setEditing]=useState<string|null>(null)
 const state=w.stepState[w.step]
 if(state==='running')return <><div className="ni-body"><div className="ni-progress-hero"><LoaderCircle className="ni-spinner"/><h3>正在识别{WIZARD_ENTITY_LABELS[kind]}</h3><p>只返回名称清单，不在此步骤导入。</p><p className="ni-w-found" aria-live="polite">已识别 {w.rosterFound??0} 个{WIZARD_ENTITY_LABELS[kind]}</p></div></div><Footer><Button variant="ghost" onClick={props.onStop}>停止导入</Button><Button variant="ghost" onClick={onRevise}>返回修改选择</Button></Footer></>
 if(state==='failed')return <><div className="ni-body"><StepRail w={w}/><Notice alert title={<><CircleAlert/>{WIZARD_ENTITY_LABELS[kind]}识别失败</>}>{w.stepError}</Notice></div><Footer><Button variant="ghost" onClick={onRevise}>返回修改选择</Button><Button variant="outline" disabled={busy} onClick={()=>void act('wizard-next',{skip:true})}>跳过此步骤</Button><Button disabled={busy} onClick={()=>void act('wizard-redetect')}>重新识别</Button></Footer></>
 const incomplete=view.phase==='select'?w.rosterIncomplete??0:0,repair=(w.dropped??[]).find(d=>d.kind==='roster'&&d.rosterKind===kind)
 const notices=<>{incomplete>0&&<Notice title={`${incomplete} 个正文片段未完成识别`}>已保留其他{WIZARD_ENTITY_LABELS[kind]}结果，可能有遗漏。可以只重试这些片段，或明确接受遗漏后继续。<Button variant="outline" disabled={busy} onClick={()=>void act('wizard-redetect')}>重试未完成片段</Button></Notice>}{repair&&<Notice title={`部分${WIZARD_ENTITY_LABELS[kind]}结果未采用`}>{repair.reason}</Notice>}</>
 const images=WIZARD_IMAGE_KINDS.filter(k=>WIZARD_IMAGE_OWNER[k]===kind),wanted=images.filter(k=>w.images[k]),imageModel=view.models.image,sceneSummary=kind==='scene'?w.sceneIdentitySummary:undefined,unresolved=sceneSummary?list.filter(candidate=>candidate.selected&&candidate.sceneIdentityState==='unresolved').length:0
 const visible=kind==='world'?list:list.filter(c=>wizardCandidateMatches(c,query)),n=list.filter(c=>c.selected&&(kind!=='world'||c.kind==='world-setting'||!list.some(x=>x.parentId===c.id))).length
 const ready=kind==='scene'&&sceneSummary?n-unresolved:n,skipScenes=!!unresolved&&!ready
 const select=(ids:string[],selected:boolean)=>void act('wizard-select-candidates',{kind,ids,selected})
 if(!list.length)return <><div className="ni-body">{notices}<Notice title={`未识别到${WIZARD_ENTITY_LABELS[kind]}`}>所选章节和资料中没有找到可导入的{WIZARD_ENTITY_LABELS[kind]}。</Notice></div><Footer><Button variant="ghost" onClick={onRevise}>返回修改选择</Button>{!incomplete&&<Button variant="outline" disabled={busy} onClick={()=>void act('wizard-redetect')}>重新识别</Button>}<Button disabled={busy} onClick={()=>void act('wizard-next')}>{incomplete?'接受遗漏并继续':'跳过'}</Button></Footer></>
 return <><div className="ni-body">
  {notices}
  {sceneSummary&&<Notice title={`具体地点 ${sceneSummary.concreteCount} · 来源限定地点 ${sceneSummary.sourceScopedCount} · 待确认 ${sceneSummary.unresolvedCount}`}>同名地点按各自原文提及区分。请在详情核对待确认归属；未确定上级的来源限定地点可以正常导入。</Notice>}
  {images.length>0&&<fieldset className="ni-w-genopts"><legend>导入后自动生成</legend>{images.map(k=>{const Icon=IMAGE_ICON[k];return <label key={k} className={imageModel?'':'ni-muted'}><input type="checkbox" checked={w.images[k]} disabled={busy||!imageModel} onChange={event=>void act('wizard-set-images',{[k]:event.target.checked})}/><Icon/>生成{WIZARD_IMAGE_LABELS[k]}</label>})}
   <small>{imageModel?`为每个导入成功的${WIZARD_ENTITY_LABELS[kind]}各生成一张。勾选并开始导入即允许把外观描述发送给图像模型 ${imageModel.name}；之后可在面板重新生成。`:'尚未配置图像模型。'}</small>{!imageModel&&<Button size="sm" variant="ghost" onClick={()=>window.dispatchEvent(new CustomEvent('desktop:settings-section',{detail:'models'}))}>配置模型</Button>}</fieldset>}
  <div className="ni-w-toolbar">{kind!=='world'&&<SearchBox value={query} onChange={setQuery} label="搜索名称或别名"/>}<Button size="sm" variant="outline" disabled={busy} onClick={()=>select(list.map(c=>c.id),true)}>全选</Button><Button size="sm" variant="outline" disabled={busy} onClick={()=>select(list.map(c=>c.id),false)}>全不选</Button>
   <span className="ni-w-count" aria-live="polite">已选 {n} / {kind==='world'?list.filter(c=>c.kind==='world-setting'||!list.some(x=>x.parentId===c.id)).length:list.length}</span></div>
  {kind==='world'?<WorldTree list={list} busy={busy} select={select}/>:<div className="ni-w-list">{visible.map(c=><div key={c.id}><div className={`ni-w-node ${kind==='scene'&&c.parentId?'ni-w-ch':''} ${c.selected?'':'ni-muted'}`}>
   <input type="checkbox" aria-label={`选择 ${c.name}`} checked={c.selected} disabled={busy} onChange={event=>select([c.id],event.target.checked)}/>
   <span>{c.name}</span>
   {kind==='character'&&c.roleType&&(editing===c.id?<select aria-label={`${c.name} 类型`} autoFocus defaultValue={c.roleType} onChange={event=>{setEditing(null);void act('wizard-set-role',{candidateId:c.id,roleType:event.target.value})}} onBlur={()=>setEditing(null)}>{Object.entries(ROLE_LABELS).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>:<button type="button" className="ni-w-tag" aria-label={`${c.name}：${ROLE_LABELS[c.roleType]}，点击修改类型`} onClick={()=>setEditing(c.id)}>{ROLE_LABELS[c.roleType]}</button>)}
   {kind==='item'&&c.itemType&&<span className="ni-w-tag">{c.itemType}</span>}
   {sceneSummary&&c.sceneHint&&<span className="ni-w-sub">{c.sceneHint}</span>}
   {sceneSummary&&c.sceneIdentityState&&<span className="ni-w-tag">{c.sceneIdentityState==='unresolved'?'待确认':c.sceneIdentityState==='source-scoped'?'来源限定':'具体地点'}</span>}
   {sceneSummary&&c.sceneExcluded&&<span className="ni-w-tag">非具体地点</span>}
   <button type="button" className="ni-source-link ni-w-ml" aria-expanded={details.has(c.id)} onClick={()=>setDetails(s=>{const x=new Set(s);if(x.has(c.id))x.delete(c.id);else x.add(c.id);return x})}>{details.has(c.id)?'收起':'详情'}</button></div>
   {details.has(c.id)&&(sceneSummary?<SceneIdentityDetails view={view} identityId={c.id} busy={busy}/>:<div className="ni-w-detail">{[c.aliases.length?'别名：'+c.aliases.join('、'):'',`出场 ${c.chapterCount} 章`,'来源：'+c.sources.map(s=>s==='source'?'资料':'正文').join(' + ')].filter(Boolean).join(' · ')}{kind==='character'&&list.length>1&&!incomplete&&<MergeInto candidate={c} list={list} busy={busy}/>}</div>)}</div>)}</div>}
 </div><Footer note={unresolved?`${unresolved} 项归属待确认，不会导入，将在校验页列出；可在详情确认后再导入`:n?undefined:`未选择任何${WIZARD_ENTITY_LABELS[kind]}，将跳过导入`}><Button variant="ghost" onClick={onRevise}>返回修改选择</Button><Button disabled={busy} onClick={()=>void act('wizard-next',wanted.length&&ready?{imageConsent:true}:{})}>{skipScenes?'跳过导入场景':wizardImportButton(kind,ready||n,wanted)}</Button></Footer></>
}
/** Merges this character into another one; the chosen character keeps its name and gains this one as an alias. */
function MergeInto({candidate,list,busy}:{candidate:WizardCandidate;list:WizardCandidate[];busy:boolean}){
 const [target,setTarget]=useState('')
 return <div className="ni-w-merge"><label>合并到<select aria-label={`将 ${candidate.name} 合并到`} value={target} disabled={busy} onChange={event=>setTarget(event.target.value)}><option value="">选择角色</option>{list.filter(x=>x.id!==candidate.id).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
  <Button size="xs" variant="outline" disabled={busy||!target} onClick={()=>{void act('wizard-merge-candidates',{keepId:target,mergeIds:[candidate.id]});setTarget('')}}>合并</Button></div>
}
function WorldTree({list,busy,select}:{list:WizardCandidate[];busy:boolean;select(ids:string[],selected:boolean):void}){
 const leaves=(id:string):WizardCandidate[]=>{const kids=list.filter(c=>c.parentId===id);return kids.length?kids.flatMap(k=>leaves(k.id)):list.filter(c=>c.id===id)}
 const render=(parent:string|undefined,depth:number):ReactNode=>list.filter(c=>c.kind==='world'&&c.parentId===parent).map(world=>{const all=leaves(world.id),on=all.filter(c=>c.selected).length
  return <li key={world.id}><div className="ni-w-node ni-w-vol" style={{paddingLeft:12+depth*24}}><TriBox state={on===all.length?'checked':on?'mixed':'unchecked'} label={`选择 ${world.name} 及其下全部设定`} disabled={busy} onChange={checked=>select([world.id],checked)}/><Globe/><span>{world.name}</span><span className="ni-w-sub">{on} / {all.length}</span></div>
   <ul>{list.filter(c=>c.kind==='world-setting'&&c.parentId===world.id).map(s=><li key={s.id}><div className={`ni-w-node ${s.selected?'':'ni-muted'}`} style={{paddingLeft:40+depth*24}}><input type="checkbox" aria-label={`选择 ${SETTING_LABELS[s.settingType??'']??''}：${s.name}`} checked={s.selected} disabled={busy} onChange={event=>select([s.id],event.target.checked)}/>{(()=>{const I=worldIcon(s);return <I className="ni-w-type" aria-hidden="true"/>})()}<span className="ni-w-tag">{SETTING_LABELS[s.settingType??'']}</span><span>{s.name}</span></div></li>)}{render(world.id,depth+1)}</ul></li>})
 return <ul className="ni-w-tree" aria-label="世界观">{render(undefined,0)}</ul>
}

function Thumb({taskId,kind,name}:{taskId:string;kind:WizardImageKind;name:string}){
 const [url,setUrl]=useState<string>()
 useEffect(()=>{let live=true,made:string|undefined;void readNovelImportWizardImage(taskId).then(image=>{if(!live||!image)return;made=URL.createObjectURL(new Blob([image.bytes.slice()],{type:image.mime}));setUrl(made)});return ()=>{live=false;if(made)URL.revokeObjectURL(made)}},[taskId])
 return url?<img className={`ni-w-thumb ni-w-thumb-${kind}`} src={url} alt=""/>:<span className={`ni-w-thumb ni-w-thumb-${kind}`} aria-hidden="true">{name.slice(0,1)}</span>
}
function ImportStep(props:Props&{kind:WizardEntityKind}){
 const {view,busy,kind}=props,w=view.wizard,list=w.candidates[kind]??[],entry=(id?:string)=>list.find(c=>c.id===id),name=(id?:string)=>entry(id)?.name??'',hint=(id?:string)=>list.find(c=>c.id===id)?.sceneHint
 const tasks=w.tasks.filter(t=>list.some(c=>c.id===t.candidateId)||kind==='world'&&t.kind==='settings'),entities=tasks.filter(t=>t.kind!=='image')
 const failed=tasks.filter(t=>t.state==='failed').length,done=tasks.filter(t=>t.state==='done'||t.state==='skipped').length
 // The step waits with unfinished work but nothing failed: continuing re-enters the import (486 3R).
 const stuck=w.stepState[w.step]==='waiting'&&view.phase==='select'&&!failed
 const Icon=ENTITY_ICON[kind],imagesOf=(id:string)=>tasks.filter(t=>t.kind==='image'&&t.dependsOn===id)
 const cell=(t:typeof tasks[number])=>{const label=t.kind==='settings'?IMPORT_LABELS[t.settingsKind!]:name(t.candidateId);return <div key={t.id} className="ni-w-ent" data-s={t.state}>
  <span className="ni-w-quill">{t.kind==='settings'?<Sparkles/>:kind==='world'?(()=>{const I=worldIcon(entry(t.candidateId));return <I/>})():<Icon/>}</span><div className="ni-w-nm"><span>{label}</span>{kind==='world'&&t.kind!=='settings'&&entry(t.candidateId)&&<span className="ni-w-tag">{worldTag(entry(t.candidateId)!)}</span>}{hint(t.candidateId)&&<span className="ni-w-sub">{hint(t.candidateId)}</span>}{t.state==='done'&&<Check className="ni-w-ok"/>}<span className="ni-w-sr">，{STATE_TEXT[t.state]}</span></div>
  <span className="ni-w-st" aria-hidden={t.state==='done'}>{t.state==='running'?<><LoaderCircle className="ni-spinner"/><span className="ni-w-rm">导入中</span></>:t.state==='failed'||t.state==='done'?'':STATE_TEXT[t.state]}</span>
  {t.state==='failed'&&<span className="ni-w-acts"><span className="ni-error-text">{t.error}</span><Button size="sm" variant="outline" disabled={busy} onClick={()=>void act('wizard-task',{taskId:t.id,op:'retry'})}><RotateCcw/>重试</Button><Button size="sm" variant="ghost" disabled={busy} onClick={()=>void act('wizard-task',{taskId:t.id,op:'skip'})}>跳过</Button></span>}
  {imagesOf(t.id).length>0&&<span className="ni-w-chips">{imagesOf(t.id).map(i=>{const IconI=IMAGE_ICON[i.imageKind!];return <span key={i.id} className="ni-w-chip" data-s={i.state}>{i.state==='done'?<Thumb taskId={i.id} kind={i.imageKind!} name={label}/>:<IconI/>}{WIZARD_IMAGE_LABELS[i.imageKind!]}{i.state==='running'&&<LoaderCircle className="ni-spinner"/>}{i.state==='done'&&<Check className="ni-w-ok"/>}{i.state==='failed'&&<><button type="button" className="ni-source-link" onClick={()=>void act('wizard-task',{taskId:i.id,op:'retry'})}>重试</button><button type="button" className="ni-source-link" onClick={()=>void act('wizard-task',{taskId:i.id,op:'skip'})}>跳过</button></>}{(i.state==='waiting'||i.state==='paused'||i.state==='skipped')&&<small>{STATE_TEXT[i.state]}</small>}<span className="ni-w-sr">，{WIZARD_IMAGE_LABELS[i.imageKind!]}{STATE_TEXT[i.state]}</span></span>})}</span>}
 </div>}
 const groups=kind==='world'?[...list.filter(c=>c.kind==='world').map(world=>({title:world.name,items:entities.filter(t=>t.candidateId===world.id||list.find(c=>c.id===t.candidateId)?.parentId===world.id)})),{title:'其他设定',items:entities.filter(t=>t.kind==='settings')}].filter(g=>g.items.length):[{title:'',items:entities}]
 return <><div className="ni-body"><StepRail w={w}/>{kind==='character'&&<p>每个角色由一个代理导入：身份、外观、心理、能力、弧线与人物关系。原文没有依据的字段留空。</p>}
  <Progress done={done} total={tasks.length} label={wizardProgressText(tasks,{paused:view.phase==='paused',entities:entities.length})}/>
  {groups.map((g,k)=><section key={k} className="ni-w-group">{g.title&&<h4>{g.title}</h4>}<div className="ni-w-grid">{g.items.map(cell)}</div></section>)}</div>
  <RunningFooter {...props} resume={stuck?{consent:true,...(WIZARD_IMAGE_KINDS.some(k=>WIZARD_IMAGE_OWNER[k]===kind&&w.images[k])?{imageConsent:true}:{})}:undefined} extra={failed?<Button variant="outline" disabled={busy} onClick={()=>void act('wizard-task',{op:'skip-failed'})}>跳过失败项并继续（{failed}）</Button>:undefined}/></>
}
function LineStep(props:Props){
 const {view}=props,w=view.wizard,failed=w.stepState[w.step]==='failed'
 return <><div className="ni-body"><StepRail w={w}/><h3>{WIZARD_STEP_TITLES[w.step]}</h3>{failed?<Notice alert title={<><CircleAlert/>{WIZARD_STEP_TITLES[w.step]}失败</>}>{w.stepError}</Notice>:<div className="ni-progress-hero"><LoaderCircle className="ni-spinner"/><p>{view.phase==='paused'?'已暂停':'正在处理所选章节'}</p>{w.lineProgress&&<Progress done={w.lineProgress.done} total={w.lineProgress.total} label={`已完成 ${w.lineProgress.done} / ${w.lineProgress.total} 章`}/>}{w.foreshadowFound!==undefined&&<p className="ni-w-found" aria-live="polite">已处理 {w.foreshadowFound} 个伏笔</p>}</div>}</div>
  {failed?<Footer><Button variant="ghost" onClick={props.onRevise}>返回修改选择</Button><Button onClick={()=>void act('wizard-redetect')}>重试</Button></Footer>:<RunningFooter {...props}/>}</>
}
function VerifyStep(props:Props){
 const {view,busy}=props,w=view.wizard,checks=w.checks??[],bad=checks.some(c=>!c.ok),running=w.stepState.verify==='running',v=w.verify
 // docs/539: chapter-review sessions record w.verify; a failed consistency or outline row can be repaired again without limit.
 const repair=(key:string)=>!!v?.repairable&&!running&&(key==='consistency'||key==='outlines')
 const retry:Record<string,WizardEntityKind|undefined>={relationships:'character',worlds:'world'}
 return <><div className="ni-body"><ul className="ni-w-checks">{checks.map(c=><li key={c.key}>{c.ok?<CircleCheck className="ni-w-good"/>:<AlertTriangle className="ni-w-bad"/>}<span>{({chapters:'卷章与正文完整',scope:'所选范围一致',relationships:'角色关系引用',worlds:'世界观归属',lines:'世界线与叙事线引用',outlines:'细纲覆盖',touches:'伏笔触点',consistency:'一致性复核'} as Record<string,string>)[c.key]}<span className="ni-w-sr">{c.ok?'，通过':'，有问题'}</span></span><span className="ni-w-sub">{c.detail}</span>
   {!c.ok&&repair(c.key)&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>void act('wizard-verify-repair')}><RotateCcw/>修复</Button>}
   {!c.ok&&c.key==='consistency'&&view.conflicts.some(x=>x.status==='pending')&&<Button size="sm" variant="outline" disabled={running} onClick={()=>window.dispatchEvent(new CustomEvent('novel-import:conflicts'))}>处理矛盾</Button>}
   {!c.ok&&retry[c.key]&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>void act('wizard-retry-kind',{kind:retry[c.key]})}><RotateCcw/>重试导入{WIZARD_ENTITY_LABELS[retry[c.key]!]}</Button>}</li>)}</ul>
  {(!checks.length||running)&&<div className="ni-progress-hero"><LoaderCircle className="ni-spinner"/><p>{checks.length?'正在复核与修复':'检查中'}</p></div>}
  {!!v?.fixed.length&&<Notice title={`已自动修复 ${v.fixed.length} 处设定`}>{v.fixed.slice(0,30).map(f=>`${f.label}·${f.field}`).join('、')}{v.fixed.length>30?' 等':''}。以正文为准修改。</Notice>}
  {!!v?.droppedConflicts&&<Notice title={`复核丢弃 ${v.droppedConflicts} 条格式无效的矛盾`}>这些条目无法对应已导入的资料或原文。</Notice>}
  {(w.dropped??[]).some(d=>d.kind==='verify')&&<Notice title="部分结构引用已修正">{(w.dropped??[]).filter(d=>d.kind==='verify').map(d=>`${d.label}：${d.reason}`).join('；')}。</Notice>}
  {!!w.sceneIdentitySummary?.deferred?.length&&<Notice title={`归属待确认，未导入 ${w.sceneIdentitySummary.deferredTotal??w.sceneIdentitySummary.deferred.length} 项`}>{w.sceneIdentitySummary.deferred.map(d=>d.name).join('、')}{(w.sceneIdentitySummary.deferredTotal??0)>w.sceneIdentitySummary.deferred.length?' 等':''}。可返回识别场景，在详情确认归属后再导入。</Notice>}
  {w.skipped.length>0&&<Notice title={`已跳过 ${w.skipped.length} 项`}>{w.skipped.map(s=>s.label).join('、')}。这些项不会保存，记入导入记录。</Notice>}
  {(w.dropped??[]).some(d=>d.kind==='settings')&&<Notice title="部分设定条目已修正">{(w.dropped??[]).filter(d=>d.kind==='settings').map(d=>`${d.label}：${d.reason}`).join('；')}。</Notice>}
  {(w.dropped??[]).some(d=>d.kind==='lines')&&<Notice title="部分剧情关联已修正">{(w.dropped??[]).filter(d=>d.kind==='lines').map(d=>`${d.label}：${d.reason}`).join('；')}。</Notice>}</div>
  <Footer note={checks.length&&!running?bad?v?'仍有未通过项，保存时只保留已成功导入的内容':'请先处理标出的问题':'全部通过':''}><Button variant="ghost" onClick={props.onRevise}>返回修改选择</Button><Button disabled={busy||running||!checks.length||bad&&!v} onClick={()=>void act('wizard-next')}>保存作品</Button></Footer></>
}

export function NovelImportWizardHeader({step}:{step:WizardStep}){
 const stage=STAGE_OF[step]
 return <><DialogTitle>{WIZARD_STEP_TITLES[step]}</DialogTitle><DialogDescription className="ni-w-sr">第 {wizardStepNumber(step)} 步，共 {WIZARD_STEPS.length} 步</DialogDescription>
  <ol className="ni-stage-list ni-w-stages" aria-label="导入阶段">{STAGES.map((label,k)=><li key={label} aria-current={k===stage?'step':undefined} data-done={k<stage}><span>{k+1}</span>{label}</li>)}</ol>
  <div className="ni-w-stage-now">{wizardStageText(step,stage,STAGES[stage])}</div></>
}
/** Shown from the moment the picker closes until the chosen files have been read. */
export function NovelImportReading(){
 return <><div className="ni-body"><div className="ni-progress-hero" role="status" aria-busy="true"><LoaderCircle className="ni-spinner"/><h3>正在读取文件</h3><p>读取完成后显示文件信息。</p></div></div>
  <Footer><Button disabled>继续</Button></Footer></>
}
export function NovelImportWizard(props:Props){
 // Step 22 only saves; nothing is sent to a model, so no send permission is shown (docs/560).
 return <>{props.view.wizard.step!=='done'&&<ResumeConsent view={props.view}/>}<WizardStep {...props}/></>
}
/** docs/560 step 22: save to the chosen folder; the folder can be authorized again and the import stopped at any time. */
function SaveStep({view,busy,onStop}:Props){
 const saving=view.phase==='running'||view.phase==='publishing'
 if(saving)return <><div className="ni-body"><StepRail w={view.wizard}/><h3>保存作品</h3><div className="ni-progress-hero" role="status" aria-busy="true"><LoaderCircle className="ni-spinner"/><p>正在将作品保存到所选目录</p></div></div>
  <Footer note="停止导入会在当前保存结束后删除这次导入"><Button variant="ghost" disabled={busy} onClick={onStop}>停止导入</Button></Footer></>
 return <><div className="ni-body"><StepRail w={view.wizard}/><h3>保存作品</h3>
  <div className="ni-row ni-target-directory"><div><h4>保存目录</h4><p>{view.targetLabel??'尚未选择保存目录'}</p>{!view.targetReady&&<span className="ni-error-text">需要重新选择并授权保存目录。</span>}</div><Button variant="outline" disabled={busy} onClick={()=>void act('choose-target')}><FolderOpen/>选择目录</Button></div>
  <p>保存只写入所选目录，不再向模型发送内容。</p></div>
  <Footer note="停止导入会删除这次导入，已写入目录的未完成文件一并清理"><Button variant="ghost" disabled={busy} onClick={onStop}>停止导入</Button><Button disabled={busy||!view.targetReady} onClick={()=>void act('resume',{consent:false})}><Play/>继续保存</Button></Footer></>
}
function WizardStep(props:Props){
 const step=props.view.wizard.step
 if(step==='done')return <SaveStep {...props}/>
 if(step==='files')return <FilesStep {...props}/>
 if(step==='work')return <WorkStep {...props}/>
 if(step==='kinds')return <KindsStep {...props}/>
 if(step==='tree')return <TreeStep {...props}/>
 const roster=ROSTER[step];if(roster)return <RosterStep {...props} kind={roster}/>
 const load=IMPORTS[step];if(load)return <ImportStep {...props} kind={load}/>
 if(step==='verify')return <VerifyStep {...props}/>
 return <LineStep {...props}/>
}
