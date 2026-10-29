"use client"

import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react'
import {LoaderCircle,Minus,Plus,X} from 'lucide-react'
import {Dialog,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog'
import {Button} from '@/components/ui/button'
import type {ImportFileView,ImportView,PdfPageDecision} from '@desktop/shared/novel-import'
import {adoptNovelImportPdfResponse,pdfReviewScope,PdfPreviewDisplayError,readNovelImportPdfPage,reportNovelImportPdfPreviewFailure,reselectNovelImportPdfSource,samePdfReviewScope,samePdfReviewSource,saveNovelImportPdfDecisions,useNovelImportStore,type PdfPageDecisionChange,type PdfReviewScope} from '@/lib/desktop/novel-import'
import './novel-import-pdf-pages.css'

const labels:Record<PdfPageDecision,string>={'exclude-image':'已确认排除图像','contains-content':'含正文或设定，需 OCR',uncertain:'无法确定，待核对',pending:'待核对'}
interface Preview {url:string;page:number;requestId:string;scope:PdfReviewScope;width:number;height:number;pageWidth:number;pageHeight:number}
interface Props {view:ImportView;file:ImportFileView;onClose():void}

/** Only a locally decoded, correlated PNG can enable a new image exclusion. */
export function PdfPageReview({view,file,onClose}:Props){
 const pages=useMemo(()=>file.pdfInspection?.pages.filter(page=>page.raster==='present')??[],[file.pdfInspection?.pages])
 const [index,setIndex]=useState(0),[draft,setDraft]=useState(new Map<number,PdfPageDecisionChange>()),[preview,setPreview]=useState<Preview|null>(null)
 const [loading,setLoading]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[zoom,setZoom]=useState(1)
 const page=pages[index],scope=pdfReviewScope(view,file.id),scopeRef=useRef(scope),sequence=useRef(0),active=useRef<ReturnType<typeof readNovelImportPdfPage>|null>(null),urlRef=useRef<string|null>(null)
 const tokens=useRef(new Map<string,{page:number;scope:PdfReviewScope}>()),viewport=useRef<HTMLDivElement>(null),body=useRef<HTMLDivElement>(null),pageSelect=useRef<HTMLSelectElement>(null),alive=useRef(true),zoomModes=useRef(new Map<number,{scale:number;fit:boolean}>())
 const sourceChanged=!!file.pdfSourceInvalidated||file.pdfInspection?.blocker==='source-changed'
 const needsOcr=file.pdfInspection?.blocker==='ocr-required'||!file.pdfInspection?.totalTextCharacters
 const readonly=!file.included||!!view.publication||['publishing','completed','discarded'].includes(view.phase)
 const revoke=()=>{if(urlRef.current){URL.revokeObjectURL(urlRef.current);urlRef.current=null}setPreview(null)}
 const stop=()=>{sequence.current++;active.current?.cancel();active.current=null}
 const clearTokens=(number:number)=>{for(const [token,value] of tokens.current)if(value.page===number)tokens.current.delete(token)}
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;stop();if(urlRef.current){URL.revokeObjectURL(urlRef.current);urlRef.current=null}}},[])
 useLayoutEffect(()=>{
  if(samePdfReviewScope(scopeRef.current,scope)&&!sourceChanged)return
  const changed=!samePdfReviewSource(scopeRef.current,scope)||sourceChanged
  scopeRef.current=scope;setDraft(new Map());tokens.current.clear();revoke()
  setNotice(changed?'文件已变化，原确认已失效。请重新选择文件。':'导入版本已变化，本次未保存的更改已清除，请重新核对。')
  if(changed){stop();setLoading(false);setError('文件已变化，原确认已失效')}
 },[view.id,view.revision,file.id,file.pdfInspection?.sourceKey,file.pdfInspection?.ledgerHash,sourceChanged])

 const fit=()=>{
  if(!preview||!viewport.current)return
  const width=preview.pageWidth*96/72,height=preview.pageHeight*96/72
  const scale=Math.max(.2,Math.min(2.5,(viewport.current.clientWidth-32)/width,(viewport.current.clientHeight-32)/height,1))
  zoomModes.current.set(preview.page,{scale,fit:true});setZoom(scale);viewport.current.scrollLeft=0;viewport.current.scrollTop=0
 }
 useLayoutEffect(()=>{if(preview){const previous=zoomModes.current.get(preview.page);if(previous&&!previous.fit)setZoom(previous.scale);else fit()}},[preview?.url])
 useEffect(()=>{
  if(!viewport.current||typeof ResizeObserver==='undefined')return
  const observer=new ResizeObserver(()=>{if(preview&&zoomModes.current.get(preview.page)?.fit)fit()});observer.observe(viewport.current);return()=>observer.disconnect()
 },[preview?.url])
 const markDisplayFailure=(currentScope:PdfReviewScope,number:number,requestId:string)=>{
  clearTokens(number);revoke();setError('原页预览未能加载');setLoading(false)
  void reportNovelImportPdfPreviewFailure(currentScope,number,requestId).catch(()=>{if(alive.current)setNotice('预览失败，不能确认排除。请重试预览或重新选择来源。')})
 }
 const load=async()=>{
  stop();revoke();setError('');setLoading(false)
  const initial=scopeRef.current,number=page?.page
  if(!initial||sourceChanged){setError('文件已变化，原确认已失效');return}
  if(!file.included){setError('此来源尚未纳入导入，请先处理来源问题或重新选择文件。');return}
  if(!number){setError('当前 PDF 无法完成图像页核对，请处理来源问题或重新选择文件。');return}
  const version=sequence.current;setLoading(true)
  let request:ReturnType<typeof readNovelImportPdfPage>|null=null
  try{
   request=readNovelImportPdfPage(initial,number);active.current=request
   const response=await request.result
   if(!response||version!==sequence.current||!alive.current)return
   const next=pdfReviewScope(response.view,file.id)
   if(!next)throw Error('导入版本已变化，请重新核对。')
   if(!samePdfReviewScope(scopeRef.current,next)){setDraft(new Map());tokens.current.clear();setNotice('导入版本已变化，本次未保存的更改已清除，请重新核对。')}
   scopeRef.current=next
   const adopted=adoptNovelImportPdfResponse(response,initial)
   if(!adopted)throw Error('页预览已过期，请重新核对当前页。')
   const result=response.pdfPage!
   if(result.status==='failed'){clearTokens(number);setError(result.code==='source-changed'?'文件已变化，原确认已失效':'原页预览未能加载');setLoading(false);return}
   const url=URL.createObjectURL(new Blob([new Uint8Array(result.png)],{type:'image/png'}));urlRef.current=url
   const image=new Image();image.src=url
   try{await image.decode()}catch{if(version===sequence.current&&alive.current)markDisplayFailure(adopted,number,request.requestId);return}
   if(version!==sequence.current||!alive.current||!samePdfReviewScope(adopted,pdfReviewScope(useNovelImportStore.getState().view,file.id))){if(urlRef.current===url){URL.revokeObjectURL(url);urlRef.current=null}return}
   if(result.previewToken){tokens.current.set(result.previewToken,{page:number,scope:adopted});while(tokens.current.size>100)tokens.current.delete(tokens.current.keys().next().value!)}
   setPreview({url,page:number,requestId:request.requestId,scope:adopted,width:result.width,height:result.height,pageWidth:result.pageWidth,pageHeight:result.pageHeight});setLoading(false)
  }catch(reason){
   if(version!==sequence.current||!alive.current)return
   if(reason instanceof PdfPreviewDisplayError&&request)markDisplayFailure(scopeRef.current??initial,number,request.requestId)
   else{clearTokens(number);revoke();setError(reason instanceof Error?reason.message:'原页预览未能加载');setLoading(false)}
  }finally{if(version===sequence.current)active.current=null}
 }
 useEffect(()=>{
  if(page&&file.pdfPreviewFailures?.some(failure=>failure.page===page.page)){setLoading(false);setError('原页预览未能加载');return}
  void load()
 },[page?.page])
 const close=()=>{stop();revoke();setDraft(new Map());tokens.current.clear();onClose()}
 const switchPage=(next:number)=>{if(saving)return;stop();revoke();setIndex(next);setLoading(true);setError('');if(body.current)body.current.scrollTop=0;pageSelect.current?.focus()}
 const saved=(number:number)=>sourceChanged?undefined:file.pdfPageDecisions?.find(decision=>decision.page===number)?.decision
 const effective=(number:number)=>draft.get(number)?.decision??saved(number)??'pending'
 const currentToken=page?[...tokens.current].reverse().find(([,value])=>value.page===page.page&&samePdfReviewScope(value.scope,scopeRef.current))?.[0]:undefined
 const canExclude=!!page&&!!preview&&preview.page===page.page&&samePdfReviewScope(preview.scope,scopeRef.current)&&!!currentToken&&!loading&&!error&&!sourceChanged&&!needsOcr&&!readonly&&!saving&&file.pdfInspection?.scanState==='complete'
 const choose=(decision:PdfPageDecision)=>{
  if(!page||sourceChanged||readonly||saving||(decision==='exclude-image'&&!canExclude))return
  if(!draft.has(page.page)&&draft.size>=100){setNotice('单次最多保存 100 页更改，请先保存当前更改。');return}
  const next=new Map(draft),original=saved(page.page)??'pending'
  if(decision===original)next.delete(page.page)
  else next.set(page.page,decision==='exclude-image'?{page:page.page,decision,previewToken:currentToken!}:{page:page.page,decision})
  setDraft(next)
 }
 const invalidDraft=[...draft.values()].some(change=>change.decision==='exclude-image'&&(!tokens.current.has(change.previewToken)||!samePdfReviewScope(tokens.current.get(change.previewToken)?.scope??null,scopeRef.current)))
 const onlyRevoke=draft.size===1&&[...draft.values()].every(change=>saved(change.page)==='exclude-image'&&change.decision==='pending')
 const save=async()=>{
  const current=scopeRef.current
  if(!current||!draft.size||invalidDraft||saving||sourceChanged||readonly)return
  const changes=[...draft.values()].sort((a,b)=>a.page-b.page)
  stop();setSaving(true);setError('')
  try{await saveNovelImportPdfDecisions(current,changes);if(alive.current)close()}catch(reason){if(alive.current){setError(reason instanceof Error?reason.message:'页决定保存失败，请重新核对。');setSaving(false)}}
 }
 const reselect=async()=>{const current=scopeRef.current;if(!current||saving)return;stop();revoke();setSaving(true);try{await reselectNovelImportPdfSource(current);if(alive.current)close()}catch(reason){if(alive.current){setError(reason instanceof Error?reason.message:'重新选择失败，请重试。');setSaving(false)}}}
 const scale=(next:number)=>{if(!preview)return;const value=Math.max(.2,Math.min(2.5,next));zoomModes.current.set(preview.page,{scale:value,fit:false});setZoom(value)}
 const confirmed=sourceChanged?0:pages.filter(item=>saved(item.page)==='exclude-image').length
 const projected=pages.filter(item=>effective(item.page)==='exclude-image').length
 return <Dialog open onOpenChange={open=>{if(!open)close()}}>
  <DialogContent className="ni-pdf-review chatpane" showCloseButton={false} initialFocus={pageSelect} finalFocus={()=>document.querySelector<HTMLButtonElement>(`[data-pdf-review-file-id="${CSS.escape(file.id)}"]`)??true}>
   <header className="ni-pdf-header"><div className="ni-pdf-heading"><div><p className="ni-pdf-eyebrow" title={file.name}>{file.name} · 图像页 {pages.length?index+1:0} / {pages.length}</p><DialogTitle>{page?`第 ${page.page} 页`:'PDF 图像页核对'}</DialogTitle><DialogDescription>逐页核对图像是否含需要导入的小说内容。</DialogDescription></div><Button variant="ghost" size="icon-sm" aria-label="取消本次更改并关闭" onClick={close}><X/></Button></div><nav className="ni-pdf-nav" aria-label="图像页导航"><Button variant="outline" disabled={index===0||saving} aria-label="上一张图像页" onClick={()=>switchPage(index-1)}>上一页</Button><label>图像页<select ref={pageSelect} aria-label="图像页" value={page?.page??''} disabled={!pages.length||saving} onChange={event=>switchPage(pages.findIndex(item=>item.page===Number(event.target.value)))}>{pages.map(item=><option key={item.page} value={item.page}>第 {item.page} 页 · {labels[effective(item.page)]}{draft.has(item.page)?' · 本次更改':''}</option>)}</select></label><Button variant="outline" disabled={index>=pages.length-1||saving} aria-label="下一张图像页" onClick={()=>switchPage(index+1)}>下一页</Button></nav></header>
   <div className="ni-pdf-body" ref={body}>
    <section className="ni-pdf-preview" aria-label="原页预览">
     {preview&&!error&&!sourceChanged?<><div className="ni-pdf-zoom" role="group" aria-label="预览缩放"><Button variant="outline" size="sm" disabled={zoom<=.2} aria-label="缩小预览" onClick={()=>scale(zoom-.25)}><Minus/></Button><output aria-live="polite">{Math.round(zoom*100)}%</output><Button variant="outline" size="sm" disabled={zoom>=2.5} aria-label="放大预览" onClick={()=>scale(zoom+.25)}><Plus/></Button><Button variant="outline" size="sm" onClick={()=>scale(1)}>原尺寸 100%</Button><Button variant="outline" size="sm" onClick={fit}>适合页面</Button></div><div ref={viewport} className="ni-pdf-viewport" tabIndex={0} role="region" aria-label="原页预览区域，放大后可滚动或使用方向键平移"><div className="ni-pdf-image-surface" style={{width:preview.pageWidth*96/72*zoom+32,minHeight:preview.pageHeight*96/72*zoom+32}}><img className="ni-pdf-image" src={preview.url} alt={`${file.name} 第 ${page?.page} 页原页预览`} width={preview.pageWidth*96/72*zoom} height={preview.pageHeight*96/72*zoom} onError={()=>{const current=scopeRef.current;if(current&&page)markDisplayFailure(current,page.page,preview.requestId)}}/></div></div><p className="ni-pdf-note">100% 按 PDF 原页尺寸显示。放大后可横向、纵向滚动，或聚焦预览区使用方向键查看小字；查看成功不会自动确认。</p></>:<div className="ni-pdf-preview-state" role="status">{loading?<><LoaderCircle className="ni-spinner"/><strong>正在读取原页预览…</strong><p>可以切换页码或取消，不会保存未确认的更改。</p></>:<><strong>{sourceChanged?'文件已变化，原确认已失效':error||'原页预览未能加载'}</strong><p>{sourceChanged?'请重新选择来源；旧确认不会继承到新文件。':'当前不能确认排除本页图像。重试成功后仍需主动核对。'}</p>{sourceChanged||file.error||!file.included||!page?<Button variant="outline" disabled={saving} onClick={()=>void reselect()}>重新选择文件</Button>:<Button variant="outline" disabled={saving||!page} onClick={()=>void load()}>重试预览</Button>}</>}</div>}
    </section>
    <section className="ni-pdf-info" aria-label="本页决定"><span className="ni-pdf-badge">含图像 · 本页可提取文字 {page?.textCharacters??0} 字符</span><p>已保存：{page?labels[saved(page.page)??'pending']:'尚未作出决定'}。本页提取文字始终保留。</p><p>选择只作用于当前页。切换页码保留本次更改；只有保存才应用，未操作页保持原决定。</p>{needsOcr&&<p className="ni-pdf-warning">没有可提取的正文，暂时不能继续。请先完成 OCR，再重新选择文件；不能靠勾选排除图像通关。</p>}<label className={`ni-pdf-ack ${!canExclude?'is-disabled':''}`}><input data-pdf-ack type="checkbox" checked={!!page&&effective(page.page)==='exclude-image'} disabled={!canExclude} onChange={event=>choose(event.target.checked?'exclude-image':'pending')}/><span>已核对，确认本页图像不含需要导入的正文或设定</span></label><div className="ni-pdf-other" role="group" aria-label="不能排除图像时的决定"><Button variant="outline" disabled={sourceChanged||readonly||saving||!page} aria-pressed={!!page&&effective(page.page)==='contains-content'} onClick={()=>choose('contains-content')}>图像含正文或设定</Button><Button variant="outline" disabled={sourceChanged||readonly||saving||!page} aria-pressed={!!page&&effective(page.page)==='uncertain'} onClick={()=>choose('uncertain')}>无法确定</Button>{page&&(saved(page.page)==='exclude-image'||effective(page.page)==='exclude-image')&&<Button variant="outline" disabled={sourceChanged||readonly||saving} onClick={()=>choose('pending')}>撤销本页确认</Button>}</div><p className="ni-pdf-draft" role="status">{notice||(!page?'没有可核对的图像页。':draft.has(page.page)?`本次选择：${labels[effective(page.page)]}，尚未保存。${effective(page.page)==='pending'?'保存撤销后，本页重新阻断继续。':''}`:'本页没有本次更改。')}{page&&['contains-content','uncertain'].includes(effective(page.page))&&' 这不是排除确认，仍需 OCR 或继续核对。'}</p><p className="ni-pdf-note">确认仅对当前来源有效。文件变化、预览失败、未确认页及无可提取正文都会阻止继续。</p>{invalidDraft&&<p className="ni-pdf-warning">有页面的预览确认已过期，请重新核对并主动确认，不能直接保存旧选择。</p>}</section>
   </div>
   <footer className="ni-pdf-footer"><p role="status">本次明确更改 {draft.size} 页；保存后预计确认 {projected} / {pages.length} 页。{needsOcr?'没有可提取正文，仍不能继续。':'其余未确认页或预览异常仍阻断继续。'}</p><p>{saving?'保存请求已提交，关闭窗口不会撤销已提交的保存。':`取消或按 Escape 不保存本次更改，保留已保存的决定（当前 ${confirmed} 页已确认）。`}</p><div><Button variant="outline" onClick={close}>{saving?'关闭窗口':draft.size||file.pdfPageDecisions?.length?'取消本次更改':'返回，暂不确认'}</Button><Button disabled={!draft.size||invalidDraft||sourceChanged||saving||readonly} onClick={()=>void save()}>{saving?'正在保存…':onlyRevoke?'撤销确认并返回':`保存本次更改${draft.size?`（${draft.size} 页）`:''}`}</Button></div></footer>
  </DialogContent>
 </Dialog>
}
