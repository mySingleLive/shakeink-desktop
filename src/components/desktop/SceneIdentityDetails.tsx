"use client"

import {useEffect,useRef,useState} from 'react'
import {Button} from '@/components/ui/button'
import type {ImportView,ImportWizardView} from '@desktop/shared/novel-import'
import type {NamePart,SceneIdentityChange} from '@desktop/shared/novel-import-scene-identity'
import {readNovelImportSceneIdentity,readNovelImportSceneSource,saveNovelImportSceneIdentity,sceneIdentityScope,type SceneIdentityDetailPage,type SceneIdentitySourcePage} from '@/lib/desktop/novel-import'

type Props={view:ImportView&{wizard:ImportWizardView};identityId:string;busy:boolean}
type IdentityOperation=SceneIdentityChange extends infer C?C extends SceneIdentityChange?Omit<C,'expectedLedgerHash'|'explanation'>:never:never
type Member=SceneIdentityDetailPage['members'][number]
type NameOption=SceneIdentityDetailPage['namePartOptions'][number]
type Part={state:'concrete'|'source-scoped'|'unresolved';nameParts:NamePart[];parent:{state:'unknown'}|{state:'known';id:string;evidenceKeys:string[]}}
const STATE_LABEL={concrete:'具体地点','source-scoped':'来源限定地点',unresolved:'待确认'}
const partKey=(part:NamePart)=>part.kind+':'+part.key
const memberLabel=(member:Member)=>member.literal??member.sourceName??'资料中的场景'

/** Normal author UI. Only bounded summaries/ranges are cached; source text is paged separately. */
export function SceneIdentityDetails({view,identityId,busy}:Props){
 const [scope,setScope]=useState(()=>sceneIdentityScope(view)),[page,setPage]=useState<SceneIdentityDetailPage|null>(null),[cursor,setCursor]=useState(0),[members,setMembers]=useState<Member[]>([]),[options,setOptions]=useState<NameOption[]>([])
 const [allocationCursor,setAllocationCursor]=useState(0),[choiceOffsets,setChoiceOffsets]=useState<Record<string,number>>({})
 const [loadedIds,setLoadedIds]=useState<string[]>([]),[groupIds,setGroupIds]=useState([identityId]),[assignment,setAssignment]=useState<Record<string,number>>({}),[parts,setParts]=useState<Part[]>([]),[nameParts,setNameParts]=useState<NamePart[]>([]),[parent,setParent]=useState(''),[evidenceKeys,setEvidenceKeys]=useState<string[]>([]),[explanation,setExplanation]=useState('')
 const [source,setSource]=useState<SceneIdentitySourcePage|null>(null),[sourceMember,setSourceMember]=useState<Member|null>(null),[related,setRelated]=useState<SceneIdentityDetailPage|null>(null),[error,setError]=useState<string|null>(null),[loading,setLoading]=useState(false)
 const active=useRef(0),pending=useRef(false),currentScope=sceneIdentityScope(view),stale=!scope||!currentScope||scope.id!==currentScope.id||scope.revision!==currentScope.revision||scope.ledgerHash!==currentScope.ledgerHash
 const editable=!busy&&!loading&&!stale&&view.phase==='select'&&view.wizard.step==='detect-scene'&&view.wizard.stepState['detect-scene']==='waiting'
 const candidates=(view.wizard.candidates.scene??[]).filter(candidate=>candidate.id!==identityId)
 const mergePage=(next:SceneIdentityDetailPage)=>{
  setMembers(previous=>[...new Map([...previous,...next.members].map(member=>[member.key,member])).values()])
  setOptions(previous=>[...new Map([...previous,...next.namePartOptions].map(option=>[partKey(option),option])).values()])
  setAssignment(previous=>({...Object.fromEntries(next.members.map(member=>[member.key,0])),...previous}))
 }
 const run=async(work:(live:()=>boolean)=>Promise<void>)=>{
  if(pending.current)return
  pending.current=true;setLoading(true);setError(null)
  const issued=active.current
  try{await work(()=>issued===active.current)}catch(cause){if(issued===active.current)setError(cause instanceof Error?cause.message:'场景详情未能读取，请重试。')}
  finally{pending.current=false;if(issued===active.current)setLoading(false)}
 }
 useEffect(()=>{
  const issued=++active.current
  setAllocationCursor(0);setChoiceOffsets({});setPage(null);setMembers([]);setOptions([]);setAssignment({});setParts([]);setLoadedIds([]);setGroupIds([identityId]);setNameParts([]);setEvidenceKeys([]);setExplanation('');setSource(null);setSourceMember(null);setRelated(null);setCursor(0);setError(null)
  if(!scope)return
  setLoading(true)
  void readNovelImportSceneIdentity(scope,identityId,0).then(next=>{
   if(issued!==active.current)return
   setPage(next);mergePage(next);setNameParts(next.nameParts);setParent(next.parent.state==='known'?next.parent.id:'')
   setParts([{state:next.state,nameParts:next.nameParts,parent:next.parent.state==='known'?{state:'known',id:next.parent.id,evidenceKeys:[]}:{state:'unknown'}}])
   if(next.nextCursor===undefined)setLoadedIds([identityId])
  }).catch(cause=>{if(issued===active.current)setError(cause instanceof Error?cause.message:'场景详情未能读取，请重试。')}).finally(()=>{if(issued===active.current)setLoading(false)})
  return()=>{active.current++}
 },[identityId,scope])
 const loadPage=(at:number)=>run(async live=>{if(!scope)return;const next=await readNovelImportSceneIdentity(scope,identityId,at);if(!live())return;setPage(next);setCursor(at);mergePage(next)})
 const loadAll=()=>run(async live=>{
  if(!scope)return
  for(const id of groupIds){let at=0;do{if(!live())return;const next=await readNovelImportSceneIdentity(scope,id,at);if(!live())return;mergePage(next);if(next.nextCursor===undefined)break;if(next.nextCursor<=at)throw Error('提及分页未能继续，请重新打开详情。');at=next.nextCursor}while(true)}
  setLoadedIds([...groupIds])
 })
 const readSource=(member:Member,neighbor:-1|0|1=0,offset?:number)=>run(async live=>{if(!scope)return;const next=await readNovelImportSceneSource(scope,member.key,neighbor,offset??Math.max(0,(member.range?.start??0)-160));if(!live())return;setSourceMember(member);setSource(next)})
 const submit=(change:IdentityOperation)=>run(async()=>{
  if(!scope||!editable||!explanation.trim())return
  await saveNovelImportSceneIdentity(scope,{...change,expectedLedgerHash:scope.ledgerHash,explanation} as SceneIdentityChange)
 })
 const evidenceOptions=page?[...page.members.map(member=>({key:member.key,label:memberLabel(member)+'的原文'})),...page.contexts,...page.relations.map(relation=>({key:relation.key,label:relation.label}))]:[]
 const allLoaded=groupIds.every(id=>loadedIds.includes(id))
 const allocated=new Map<number,Member[]>(),optionIndex=new Map(options.map(option=>[partKey(option),option]))
 for(const member of members){const index=assignment[member.key]??0;let bucket=allocated.get(index);if(!bucket){bucket=[];allocated.set(index,bucket)}bucket.push(member)}
 const partMembers=(index:number)=>allocated.get(index)??[]
 const allowedOptions=(index:number)=>{const keys=new Set(partMembers(index).flatMap(member=>['literal:'+member.key,...member.contextKeys.map(key=>'context:'+key)]));return [...keys].flatMap(key=>{const option=optionIndex.get(key);return option?[option]:[]})}
 const setPart=(index:number,change:Partial<Part>)=>setParts(previous=>previous.map((part,at)=>at===index?{...part,...change}:part))
 const toggleName=(current:NamePart[],option:NamePart,checked:boolean)=>checked?[...current.filter(part=>partKey(part)!==partKey(option)),{kind:option.kind,key:option.key}]:current.filter(part=>partKey(part)!==partKey(option))
 const changeGroup=(id:string,selected:boolean)=>{if(!page)return;setAllocationCursor(0);setChoiceOffsets({});setGroupIds(previous=>selected?[...previous,id]:previous.filter(value=>value!==id));setMembers(page.members);setOptions(page.namePartOptions);setLoadedIds([]);setAssignment(Object.fromEntries(page.members.map(member=>[member.key,0])));setParts([{state:page.state,nameParts:page.nameParts,parent:page.parent.state==='known'?{state:'known',id:page.parent.id,evidenceKeys:[]}:{state:'unknown'}}])}
 const partEvidence=(index:number)=>[...partMembers(index).map(member=>({key:member.key,label:memberLabel(member)+'的原文'})),...allowedOptions(index).filter(option=>option.kind==='context').map(option=>({key:option.key,label:option.label}))]
 const assignMember=(key:string,index:number)=>{setChoiceOffsets({});const next={...assignment,[key]:index};setAssignment(next);setParts(previous=>previous.map((part,at)=>{const owned=members.filter(member=>next[member.key]===at);return{...part,nameParts:part.nameParts.filter(option=>option.kind==='literal'?owned.some(member=>member.key===option.key):owned.some(member=>member.contextKeys.includes(option.key)))}}))}
 const validPartition=allLoaded&&parts.length>0&&parts.every((part,index)=>partMembers(index).length&&part.nameParts.length&&(part.parent.state==='unknown'||part.parent.evidenceKeys.length>0&&!groupIds.includes(part.parent.id))&&part.nameParts.every(part=>allowedOptions(index).some(option=>partKey(option)===partKey(part))))
 const highlight=source&&sourceMember?.range&&source.neighbor===0?{start:sourceMember.range.start-source.offset,end:sourceMember.range.end-source.offset}:null
 const sourceText=source?(highlight&&highlight.start>=0&&highlight.end<=source.text.length?<>{source.text.slice(0,highlight.start)}<mark>{source.text.slice(highlight.start,highlight.end)}</mark>{source.text.slice(highlight.end)}</>:source.text):null
 const chooseNames=(value:NamePart[],onChange:(next:NamePart[])=>void,choices:NameOption[],label:string)=>{const offset=choiceOffsets[label]??0;return <fieldset disabled={!editable}><legend>{label}</legend>{choices.slice(offset,offset+50).map(option=><label key={partKey(option)} className="ni-check-line"><input type="checkbox" checked={value.some(part=>partKey(part)===partKey(option))} onChange={event=>onChange(toggleName(value,option,event.target.checked))}/>{option.label}{option.kind==='context'?'（限定）':''}</label>)}{choices.length>50&&<div><Button size="sm" variant="ghost" disabled={offset===0} onClick={()=>setChoiceOffsets(previous=>({...previous,[label]:Math.max(0,offset-50)}))}>上一页称呼</Button><span>{offset+1}–{Math.min(offset+50,choices.length)} / {choices.length}</span><Button size="sm" variant="ghost" disabled={offset+50>=choices.length} onClick={()=>setChoiceOffsets(previous=>({...previous,[label]:offset+50}))}>下一页称呼</Button></div>}</fieldset>}
 return <section className="ni-w-detail" aria-label="场景身份与提及">
  <h4>场景身份与提及</h4>
  {stale&&<p role="alert">场景清单已变化，请重新打开详情后再操作。 <Button size="sm" variant="outline" onClick={()=>setScope(sceneIdentityScope(view))}>重新打开详情</Button></p>}
  {error&&<p role="alert" className="ni-error-text">{error}</p>}
  {loading&&<p role="status">正在读取场景资料…</p>}
  {page&&<>
   <p>{page.name} · {STATE_LABEL[page.state]} · 共 {page.totalMembers} 处提及</p>
   {page.state==='unresolved'&&<p>这些提及的归属仍待确认。请查看原文后分配，或保留待确认。</p>}
   <ul>{page.members.map(member=><li key={member.key}><strong>{memberLabel(member)}</strong>{member.contextKeys.length>0&&<span> · {page.contexts.filter(context=>member.contextKeys.includes(context.key)).map(context=>context.label).join('、')}</span>} <Button size="sm" variant="ghost" disabled={loading||stale} onClick={()=>void readSource(member)}>查看原文</Button></li>)}</ul>
   <div className="ni-w-toolbar"><Button size="sm" variant="outline" disabled={loading||stale||cursor===0} onClick={()=>void loadPage(Math.max(0,cursor-50))}>上一页提及</Button><span>{cursor+1}–{cursor+page.members.length} / {page.totalMembers}</span><Button size="sm" variant="outline" disabled={loading||stale||page.nextCursor===undefined} onClick={()=>void loadPage(page.nextCursor!)}>下一页提及</Button></div>
   {page.relations.length>0&&<ul aria-label="已有关系">{page.relations.map(relation=><li key={relation.key}>{relation.label}</li>)}</ul>}
   {source&&sourceMember&&<section aria-label="场景原文"><h5>{memberLabel(sourceMember)} · {source.neighbor===0?'原文':source.neighbor===-1?'前一段':'后一段'}</h5><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{sourceText}</pre><div className="ni-w-toolbar"><Button size="sm" variant="outline" disabled={loading||stale||source.offset===0} onClick={()=>void readSource(sourceMember,source.neighbor,Math.max(0,source.offset-32768))}>上一页原文</Button><Button size="sm" variant="outline" disabled={loading||stale||source.nextOffset===undefined} onClick={()=>void readSource(sourceMember,source.neighbor,source.nextOffset)}>下一页原文</Button>{sourceMember.origin==='body'&&<><Button size="sm" variant="ghost" disabled={loading||stale} onClick={()=>void readSource(sourceMember,-1,0)}>前一段</Button><Button size="sm" variant="ghost" disabled={loading||stale} onClick={()=>void readSource(sourceMember,0)}>提及所在段</Button><Button size="sm" variant="ghost" disabled={loading||stale} onClick={()=>void readSource(sourceMember,1,0)}>后一段</Button></>}</div></section>}
   {!editable&&!stale&&<p>识别结束并返回场景确认步骤后，才可调整归属。</p>}
   <label className="ni-field">修改说明<textarea aria-label="场景身份修改说明" maxLength={16000} value={explanation} disabled={!editable} onChange={event=>setExplanation(event.target.value)}/></label>
   <p>当前称呼：{page.name}</p>{chooseNames(nameParts,setNameParts,options,'从原文称呼与限定组成显示名')}<Button size="sm" variant="ghost" disabled={!editable} onClick={()=>setNameParts([])}>重新选择称呼</Button>
   <Button size="sm" variant="outline" disabled={!editable||!explanation.trim()||!nameParts.length} onClick={()=>void submit({op:'label',identityId,nameParts})}>保存称呼</Button>
   <p>当前直接上级：{page.parent.state==='known'?page.parent.name:'原文未确定'}</p><label className="ni-field">直接上级地点<select aria-label="直接上级地点" disabled={!editable} value={parent} onChange={event=>setParent(event.target.value)}><option value="">原文未确定</option>{candidates.map(candidate=><option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.chapterCount}章</option>)}</select></label>
   {parent&&<Button size="sm" variant="ghost" disabled={loading||stale} onClick={()=>void run(async live=>{if(scope){const next=await readNovelImportSceneIdentity(scope,parent,0);if(live())setRelated(next)}})}>查看上级地点的提及</Button>}
   {related&&<p>{related.name}：{related.members.map(memberLabel).join('、')}{related.nextCursor!==undefined?'（还有其它提及，可在该地点详情查看）':''}</p>}
   <fieldset disabled={!editable}><legend>上级关系依据</legend>{evidenceOptions.map(option=><label className="ni-check-line" key={option.key}><input type="checkbox" checked={evidenceKeys.includes(option.key)} onChange={event=>setEvidenceKeys(previous=>event.target.checked?[...previous,option.key]:previous.filter(key=>key!==option.key))}/>{option.label}</label>)}</fieldset>
   <Button size="sm" variant="outline" disabled={!editable||!explanation.trim()||!evidenceKeys.length} onClick={()=>void submit({op:'parent',identityId,parentId:parent||null,evidenceKeys})}>保存上级地点</Button>
   <details><summary>分配提及或拆分地点</summary><p>将每处原文提及完整分配到一个地点。资料块会保持完整；不会复制场景资料。</p>
    <fieldset disabled={!editable}><legend>一起核对的地点</legend>{candidates.map(candidate=><label className="ni-check-line" key={candidate.id}><input type="checkbox" checked={groupIds.includes(candidate.id)} onChange={event=>changeGroup(candidate.id,event.target.checked)}/>{candidate.name}</label>)}</fieldset>
    <Button size="sm" variant="outline" disabled={!editable} onClick={()=>void loadAll()}>读取全部提及以调整归属</Button><span> 已读取 {members.length} 处提及</span>
    {allLoaded&&<><Button size="sm" variant="outline" disabled={!editable||parts.length>=5000} onClick={()=>setParts(previous=>[...previous,{state:'source-scoped',nameParts:[],parent:{state:'unknown'}}])}>添加一个地点</Button>
     {parts.map((part,index)=><fieldset key={index} disabled={!editable}>
      <legend>地点 {index+1} · {partMembers(index).length} 处提及</legend>
      <label>归属状态<select aria-label={`地点 ${index+1} 归属状态`} value={part.state} onChange={event=>setPart(index,{state:event.target.value as Part['state']})}>{Object.entries(STATE_LABEL).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      {chooseNames(part.nameParts,next=>setPart(index,{nameParts:next}),allowedOptions(index),`地点 ${index+1} 称呼`)}
      <label>直接上级<select aria-label={`地点 ${index+1} 直接上级`} value={part.parent.state==='known'?part.parent.id:''} onChange={event=>setPart(index,{parent:event.target.value?{state:'known',id:event.target.value,evidenceKeys:[]}:{state:'unknown'}})}><option value="">原文未确定</option>{candidates.filter(candidate=>!groupIds.includes(candidate.id)).map(candidate=><option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select></label>
      {part.parent.state==='known'&&<fieldset><legend>地点 {index+1} 上级关系依据</legend>{partEvidence(index).map(option=><label className="ni-check-line" key={option.key}><input type="checkbox" checked={part.parent.state==='known'&&part.parent.evidenceKeys.includes(option.key)} onChange={event=>{if(part.parent.state==='known')setPart(index,{parent:{...part.parent,evidenceKeys:event.target.checked?[...part.parent.evidenceKeys,option.key]:part.parent.evidenceKeys.filter(key=>key!==option.key)}})}}/>{option.label}</label>)}</fieldset>}
      {index>0&&partMembers(index).length===0&&<Button size="sm" variant="ghost" onClick={()=>{setParts(previous=>previous.filter((_,at)=>at!==index));setAssignment(previous=>Object.fromEntries(Object.entries(previous).map(([key,at])=>[key,at>index?at-1:at])))}}>移除空地点</Button>}
     </fieldset>)}
     <ul>{members.slice(allocationCursor,allocationCursor+50).map((member,index)=><li key={member.key} aria-label={`第 ${allocationCursor+index+1} 处提及`}>
      <span>第 {allocationCursor+index+1} 处提及 · {member.contextKeys.map(key=>optionIndex.get('context:'+key)?.label).filter(Boolean).join('、')||(member.origin==='source-block'?`资料块 ${(member.blockIndex??0)+1}`:'未提供定位限定')}</span>
      <label>{memberLabel(member)}<select aria-label={`分配 ${memberLabel(member)}（第 ${allocationCursor+index+1} 处提及）`} value={assignment[member.key]??0} disabled={!editable} onChange={event=>assignMember(member.key,Number(event.target.value))}>{parts.map((_,at)=><option key={at} value={at}>地点 {at+1}</option>)}</select></label>
      <Button size="sm" variant="ghost" disabled={loading||stale} onClick={()=>void readSource(member)}>查看这处原文</Button>
     </li>)}</ul>
     {members.length>50&&<div className="ni-w-toolbar"><Button size="sm" variant="outline" disabled={!editable||allocationCursor===0} onClick={()=>setAllocationCursor(previous=>Math.max(0,previous-50))}>上一页分配</Button><span>{allocationCursor+1}–{Math.min(allocationCursor+50,members.length)} / {members.length}</span><Button size="sm" variant="outline" disabled={!editable||allocationCursor+50>=members.length} onClick={()=>setAllocationCursor(previous=>previous+50)}>下一页分配</Button></div>}
     <Button size="sm" disabled={!editable||!explanation.trim()||!validPartition} onClick={()=>void submit({op:'partition',identityIds:groupIds,parts:parts.map((part,index)=>({...part,memberKeys:partMembers(index).map(member=>member.key)}))})}>保存归属分配</Button>
    </>}
   </details>
   <Button size="sm" variant="ghost" disabled={!editable||!explanation.trim()} onClick={()=>void submit({op:'defer',identityId})}>保持待确认</Button>
  </>}
 </section>
}
