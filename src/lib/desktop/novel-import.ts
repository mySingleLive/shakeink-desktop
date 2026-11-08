"use client"

import { create } from 'zustand'
import {toast} from 'sonner'
import type { ImportAction, ImportKind, ImportResponse, ImportSourcePage, ImportView, ImportPdfPageResponse } from '@desktop/shared/novel-import'
import type {SceneIdentityChange} from '@desktop/shared/novel-import-scene-identity'

export type ImportScreen = ImportView['phase'] | 'consent' | 'preview' | 'chapters' | 'patches' | 'replace'
export interface ImportDecisionDraft { choice: string; explanation: string; mergedText: string; confirmInference: boolean }
export const emptyImportDecision: ImportDecisionDraft = { choice: '', explanation: '', mergedText: '', confirmInference: false }
interface ImportUiState {
  view: ImportView | null
  open: boolean
  screen: ImportScreen
  busy: number
  error: string | null
  source: ImportSourcePage | null
  previewReturn: 'source' | 'select'
  decisionDrafts: Record<string, ImportDecisionDraft>
  /** Chosen sources are being read: the wizard opens at once with a waiting state. */
  reading: boolean
}
export const useNovelImportStore = create<ImportUiState>(() => ({ view: null, open: false, screen: 'source', busy: 0, error: null, source: null, previewReturn: 'source', decisionDrafts: {}, reading: false }))

type Mutation = ImportAction extends infer A ? A extends { revision: number } ? Omit<A, 'id' | 'revision'> : never : never
type Change = Mutation | ((view: ImportView) => Mutation)
let mutations: Promise<unknown> = Promise.resolve()
let choosing: Promise<ImportResponse | null> | null = null
let trigger: HTMLElement | null = null
let subscriptions = 0
let unsubscribe: (() => void) | undefined
const discarded = new Set<string>()
let abandoning: string | null = null
let replaceReturn: ImportScreen = 'source'
const phaseScreen = (view: ImportView | null): ImportScreen => view?.phase === 'conflicts' && view.patches.length ? 'patches' : view?.phase ?? 'source'

function adopt(response: ImportResponse, show = false) {
  const previous = useNovelImportStore.getState()
  const view = response.view
  if (view && (discarded.has(view.id) || (previous.view?.id === view.id && previous.view.revision > view.revision))) return
  const changedPhase = previous.view?.id !== view?.id || previous.view?.phase !== view?.phase
  // The main process deleted an open import we did not cancel (service loss, window reload).
  if (!view && previous.view && previous.open && previous.view.phase !== 'completed' && abandoning !== previous.view.id) toast.error('导入已中断并删除，请重新导入作品')
  useNovelImportStore.setState({
    view,
    ...(changedPhase ? { screen: phaseScreen(view) } : {}),
    ...(response.source ? { source: response.source } : {}),
    ...(show ? { open: !!view, screen: changedPhase ? phaseScreen(view) : previous.screen, error: null } : {}),
    ...(!view ? { open: false, source: null } : {}),
    ...(previous.view?.id !== view?.id ? { decisionDrafts: {} } : {}),
  })
}

async function call(action: ImportAction, show = false) {
  const bridge = window.desktop
  useNovelImportStore.setState(state => ({ busy: state.busy + 1, error: null }))
  try {
    if (!bridge?.novelImport) throw new Error('请在桌面应用中使用导入作品。')
    const response = await bridge.novelImport(action)
    if (action.type === 'discard' || action.type === 'cancel') discarded.add(action.id)
    adopt(response, show)
    return response
  } catch (error) {
    useNovelImportStore.setState({ error: error instanceof Error ? error.message : '导入操作失败，请重试。' })
    if(action.type==='choose'&&!useNovelImportStore.getState().open)toast.error(error instanceof Error?error.message:'导入操作失败，请重试。')
    // Refresh the authoritative revision without repeating the rejected mutation.
    if ('revision' in action && bridge?.novelImport) {
      try { adopt(await bridge.novelImport({ type: 'current' })) } catch { /* retain the original actionable error */ }
    }
    return null
  } finally {
    useNovelImportStore.setState(state => ({ busy: Math.max(0, state.busy - 1) }))
  }
}

/** Serialize commands so rapid checkbox changes always use the last acknowledged revision. */
export function mutateNovelImport(change: Change) {
  const execute = async () => {
    const view = useNovelImportStore.getState().view
    if (!view) return null
    const command = typeof change === 'function' ? change(view) : change
    return call({ ...command, id: view.id, revision: view.revision } as ImportAction)
  }
  const result = mutations.then(execute, execute)
  mutations = result
  return result
}

/** An unfinished import that has not started saving is deleted when it is interrupted. */
export const abandonableImport = (view: ImportView | null) => !!view && !view.publication && !['completed', 'discarded', 'publishing'].includes(view.phase)
const startedWizardSteps = ['import-struct','import-body','import-char','import-scene','import-item','import-world','worldline','narrative','outline','foreshadow','verify'] as const
export function needsNovelImportCloseConfirmation(view: ImportView | null) {
  if (!view || !abandonableImport(view)) return false
  if (['recognizing', 'running', 'paused', 'conflicts'].includes(view.phase) || view.steps.length > 0) return true
  const wizard = view.wizard
  if (!wizard) return false
  if (Object.values(wizard.stepState).includes('running')) return true
  if (startedWizardSteps.some(step => { const state = wizard.stepState[step]; return !!state && ['running', 'done', 'waiting', 'failed'].includes(state) })) return true
  return wizard.tasks.some(task => task.state !== 'waiting')
}
export async function requestNovelImport(mode?: 'files' | 'folder') {
  if (choosing) return choosing
  trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
  const view = useNovelImportStore.getState().view
  // Ask before replacing an unfinished import; a started save reopens instead.
  if (abandonableImport(view)) { const state = useNovelImportStore.getState(); if (state.screen !== 'replace') replaceReturn = state.screen; useNovelImportStore.setState({ open: true, screen: 'replace', error: null }); return null }
  if (view && view.phase !== 'completed') { reopenNovelImport(); return null }
  return chooseSources(mode, false, true)
}
/** Stop and delete the unfinished import. The dialog closes even when files had to be kept. */
export async function abandonNovelImport() {
  const view = useNovelImportStore.getState().view
  if (!view) { hideNovelImport(); return true }
  abandoning = view.id
  try {
    const response = await mutateNovelImport({ type: 'cancel' })
    if (response) { hideNovelImport(); return true }
    const state = useNovelImportStore.getState()
    if (!state.view || state.view.id !== view.id) { if (state.error) toast.error(state.error); hideNovelImport(); return false }
    return false
  } finally { abandoning = null }
}
export function keepCurrentNovelImport() { setNovelImportScreen(replaceReturn) }
/** Replace an unfinished import: delete it, then pick sources for a new one. */
export async function replaceNovelImport(mode?: 'files' | 'folder') {
  if (!await abandonNovelImport()) return null
  return chooseSources(mode, false, true)
}
export async function appendNovelImport(mode?: 'files' | 'folder') {
  return chooseSources(mode, true, false)
}
/** Rapid repeated clicks share the open picker instead of queuing a new one after cancellation. */
function chooseSources(mode: 'files' | 'folder' | undefined, append: boolean, show: boolean) {
  if (choosing) return choosing
  const result = Promise.resolve().then(() => call({ type: 'choose', ...(mode ? { mode } : {}), ...(append ? { append: true } : {}) }, show))
  choosing = result
  // Cleared only after the response is adopted, so the waiting dialog hands over to the wizard without closing.
  void result.finally(() => { if (choosing === result) choosing = null; useNovelImportStore.setState({ reading: false }) })
  return result
}
export async function readNovelImportSource(fileId: string, offset = 0) {
  const view = useNovelImportStore.getState().view
  if (!view) return null
  return call({ type: 'read-source', id: view.id, fileId, offset, limit: 32768 })
}
export async function inspectNovelImportSource(kind: ImportKind) {
  const view = useNovelImportStore.getState().view
  if (!view) return
  useNovelImportStore.setState({ previewReturn: 'select' })
  for (const file of view.files.filter(item => item.included && !item.error)) {
    let offset = 0
    do {
      const result = await readNovelImportSource(file.id, offset)
      const source = result?.source
      if (!source) return
      const unit = source.units.find(item => item.kind === kind)
      if (unit) { if (unit.start < source.offset || unit.start >= source.offset + source.text.length) await readNovelImportSource(file.id, unit.start); setNovelImportScreen('preview'); return }
      offset = source.offset + source.text.length
      if (!source.text.length || offset >= source.total) break
    } while (true)
  }
  useNovelImportStore.setState({ error: '没有找到这一类别的可读取来源，请返回来源重新核对。' })
}
/** Wizard thumbnails bypass the busy/mutation queue; bytes stay in the renderer as a Blob URL. */
export async function readNovelImportWizardImage(taskId:string){
 const view=useNovelImportStore.getState().view
 if(!view||!window.desktop?.novelImport)return null
 try{return (await window.desktop.novelImport({type:'wizard-read-image',id:view.id,taskId})).image??null}catch{return null}
}

export interface SceneIdentityUiScope {id:string;revision:number;ledgerHash:string;identityRevision:number}
export type SceneIdentityDetailPage=NonNullable<ImportResponse['sceneIdentityDetail']>
export type SceneIdentitySourcePage=NonNullable<ImportResponse['sceneIdentitySource']>
export function sceneIdentityScope(view:ImportView|null):SceneIdentityUiScope|null{
 const summary=view?.wizard?.sceneIdentitySummary
 return view&&summary?{id:view.id,revision:view.revision,ledgerHash:summary.ledgerHash,identityRevision:summary.identityRevision}:null
}
function sameSceneScope(a:SceneIdentityUiScope|null,b:SceneIdentityUiScope|null){return !!a&&!!b&&a.id===b.id&&a.revision===b.revision&&a.ledgerHash===b.ledgerHash&&a.identityRevision===b.identityRevision}
function assertSceneScope(scope:SceneIdentityUiScope){if(!sameSceneScope(scope,sceneIdentityScope(useNovelImportStore.getState().view)))throw Error('场景清单已变化，请重新打开详情后再操作。')}
/** Read a bounded page against the exact displayed revision; never upgrade a draft. */
export async function readNovelImportSceneIdentity(scope:SceneIdentityUiScope,identityId:string,cursor=0){
 assertSceneScope(scope)
 if(!window.desktop?.novelImport)throw Error('请在桌面应用中核对场景。')
 const response=await window.desktop.novelImport({type:'wizard-read-scene-identity',id:scope.id,revision:scope.revision,expectedLedgerHash:scope.ledgerHash,identityId,cursor,limit:50})
 assertSceneScope(scope)
 const page=response.sceneIdentityDetail
 if(!sameSceneScope(scope,sceneIdentityScope(response.view))||!page||page.ledgerHash!==scope.ledgerHash||page.identityRevision!==scope.identityRevision||page.identityId!==identityId)throw Error('场景详情已过期，请重新打开。')
 return page
}
export async function readNovelImportSceneSource(scope:SceneIdentityUiScope,memberKey:string,neighbor:-1|0|1=0,offset=0){
 assertSceneScope(scope)
 if(!window.desktop?.novelImport)throw Error('请在桌面应用中核对场景。')
 const response=await window.desktop.novelImport({type:'wizard-read-scene-source',id:scope.id,revision:scope.revision,expectedLedgerHash:scope.ledgerHash,memberKey,neighbor,offset,limit:32768})
 assertSceneScope(scope)
 const page=response.sceneIdentitySource
 if(!sameSceneScope(scope,sceneIdentityScope(response.view))||!page||page.ledgerHash!==scope.ledgerHash||page.memberKey!==memberKey||page.neighbor!==neighbor)throw Error('场景原文已过期，请重新打开。')
 return page
}
/** Author decisions keep their issued scope, outside the generic revision-upgrading queue. */
export async function saveNovelImportSceneIdentity(scope:SceneIdentityUiScope,change:SceneIdentityChange){
 assertSceneScope(scope)
 if(change.expectedLedgerHash!==scope.ledgerHash)throw Error('场景清单已变化，请重新打开详情后再保存。')
 if(!window.desktop?.novelImport)throw Error('请在桌面应用中核对场景。')
 useNovelImportStore.setState(state=>({busy:state.busy+1,error:null}))
 try{
  const response=await window.desktop.novelImport({type:'wizard-scene-identity',...change,id:scope.id,revision:scope.revision})
  const current=sceneIdentityScope(useNovelImportStore.getState().view),next=sceneIdentityScope(response.view)
  if(!current||!next||current.id!==scope.id||next.id!==scope.id||current.revision>next.revision||!sameSceneScope(current,scope)&&!sameSceneScope(current,next))throw Error('场景清单已变化，本次回执未采用，请重新核对。')
  adopt(response)
  return response
 }catch(error){
  useNovelImportStore.setState({error:error instanceof Error?error.message:'场景更改未能保存，请重试。'})
  // Refresh a rejected issued view, without replaying its decision or replacing
  // a different, already newer view observed while this request was pending.
  if(sameSceneScope(scope,sceneIdentityScope(useNovelImportStore.getState().view)))try{
   const response=await window.desktop.novelImport({type:'current'})
   if(response.view?.id===scope.id&&sameSceneScope(scope,sceneIdentityScope(useNovelImportStore.getState().view)))adopt(response)
  }catch{/* Keep the original error and author draft. */}
  throw error
 }
 finally{useNovelImportStore.setState(state=>({busy:Math.max(0,state.busy-1)}))}
}
export function setNovelImportScreen(screen: ImportScreen) { useNovelImportStore.setState({ screen, error: null }) }
export function setImportDecisionDraft(key: string, change: Partial<ImportDecisionDraft>) {
  useNovelImportStore.setState(state => ({ decisionDrafts: { ...state.decisionDrafts, [key]: { ...emptyImportDecision, ...state.decisionDrafts[key], ...change } } }))
}
export function hideNovelImport() { useNovelImportStore.setState({ open: false }) }
export function reopenNovelImport() {
  const view = useNovelImportStore.getState().view
  if (view) useNovelImportStore.setState({ open: true, error: null })
  void call({ type: 'current' })
}
export function novelImportFinalFocus() { return trigger?.isConnected ? trigger : null }

export interface PdfReviewScope {id:string;revision:number;fileId:string;sourceKey:string;ledgerHash:string}
export type PdfPageDecisionChange=Extract<ImportAction,{type:'set-pdf-page-decisions'}>['changes'][number]
export class PdfPreviewDisplayError extends Error {}
export function pdfReviewScope(view:ImportView|null,fileId:string):PdfReviewScope|null {
  const inspection=view?.files.find(file=>file.id===fileId)?.pdfInspection
  return view&&inspection?{id:view.id,revision:view.revision,fileId,sourceKey:inspection.sourceKey,ledgerHash:inspection.ledgerHash}:null
}
export function samePdfReviewSource(a:PdfReviewScope|null,b:PdfReviewScope|null){return !!a&&!!b&&a.id===b.id&&a.fileId===b.fileId&&a.sourceKey===b.sourceKey&&a.ledgerHash===b.ledgerHash}
export function samePdfReviewScope(a:PdfReviewScope|null,b:PdfReviewScope|null){return samePdfReviewSource(a,b)&&a!.revision===b!.revision}
function assertPdfScope(scope:PdfReviewScope){if(!samePdfReviewScope(scope,pdfReviewScope(useNovelImportStore.getState().view,scope.fileId)))throw Error('导入版本已变化，请重新核对后再保存。')}
function validPdfPng(page:Extract<ImportPdfPageResponse,{status:'ready'}>){
  const png=page.png
  if(!(png instanceof Uint8Array)||png.byteLength<24||png.byteLength>8*1024*1024||page.mime!=='image/png'||![137,80,78,71,13,10,26,10].every((byte,index)=>png[index]===byte))return false
  if(!Number.isInteger(page.width)||!Number.isInteger(page.height)||page.width<=0||page.height<=0||Math.max(page.width,page.height)>4096||page.width*page.height>4_000_000)return false
  const header=new DataView(png.buffer,png.byteOffset,png.byteLength)
  return header.getUint32(16)===page.width&&header.getUint32(20)===page.height&&Number.isFinite(page.pageWidth)&&Number.isFinite(page.pageHeight)&&page.pageWidth>0&&page.pageHeight>0
}

/** Preview IO and cancellation never join the generic mutation/read/busy queue. */
export function readNovelImportPdfPage(scope:PdfReviewScope,page:number){
  const requestId=crypto.randomUUID()
  let cancelled=false,settled=false
  const hadFailure=useNovelImportStore.getState().view?.files.find(file=>file.id===scope.fileId)?.pdfPreviewFailures?.some(item=>item.page===page)??false
  const cancel=()=>{
    if(cancelled||settled)return
    cancelled=true
    void window.desktop?.novelImport({type:'cancel-pdf-preview',id:scope.id,requestId}).catch(()=>undefined)
  }
  const result=(async()=>{
    assertPdfScope(scope)
    if(!window.desktop?.novelImport)throw Error('请在桌面应用中核对 PDF 图像页。')
    const response=await window.desktop.novelImport({type:'read-pdf-page',id:scope.id,revision:scope.revision,fileId:scope.fileId,page,requestId})
    if(cancelled)return null
    const value=response.pdfPage,current=pdfReviewScope(useNovelImportStore.getState().view,scope.fileId),next=pdfReviewScope(response.view,scope.fileId)
    if(!value||value.requestId!==requestId||value.id!==scope.id||value.requestRevision!==scope.revision||value.fileId!==scope.fileId||value.page!==page||value.ledgerHash!==scope.ledgerHash||!samePdfReviewSource(scope,current)||!samePdfReviewSource(scope,next)||!current||!next||current.revision>next.revision||next.revision<scope.revision)throw Error('页预览已过期，请重新核对当前页。')
    const failedNow=response.view?.files.find(file=>file.id===scope.fileId)?.pdfPreviewFailures?.some(item=>item.page===page)??false
    if(next.revision!==scope.revision&&!((value.status==='failed'&&failedNow)||(value.status==='ready'&&hadFailure&&!failedNow)))throw Error('导入版本已变化，请重新预览当前页。')
    if(value.status==='ready'&&!validPdfPng(value))throw new PdfPreviewDisplayError('原页预览未能加载，请重试。')
    return response
  })().finally(()=>{settled=true})
  return {requestId,result,cancel}
}

/** Adopt only the correlated authoritative reply; never upgrade or resend a draft. */
export function adoptNovelImportPdfResponse(response:ImportResponse,scope:PdfReviewScope){
  const current=pdfReviewScope(useNovelImportStore.getState().view,scope.fileId),next=pdfReviewScope(response.view,scope.fileId)
  if(!samePdfReviewSource(scope,current)||!samePdfReviewSource(scope,next)||!current||!next||current.revision>next.revision)return null
  adopt(response)
  return next
}
async function submitPdfChange(scope:PdfReviewScope,action:ImportAction,reselect=false){
  assertPdfScope(scope)
  if(!window.desktop?.novelImport)throw Error('请在桌面应用中核对 PDF 图像页。')
  const response=await window.desktop.novelImport(action),current=useNovelImportStore.getState().view
  if(current?.id!==scope.id||response.view?.id!==scope.id||current.revision>response.view.revision||(!reselect&&(!samePdfReviewSource(scope,pdfReviewScope(current,scope.fileId))||!samePdfReviewSource(scope,pdfReviewScope(response.view,scope.fileId)))))throw Error('导入版本已变化，本次更改没有采用，请重新核对。')
  adopt(response)
  return response
}
export function saveNovelImportPdfDecisions(scope:PdfReviewScope,changes:PdfPageDecisionChange[]){return submitPdfChange(scope,{type:'set-pdf-page-decisions',id:scope.id,revision:scope.revision,fileId:scope.fileId,ledgerHash:scope.ledgerHash,changes})}
export function reselectNovelImportPdfSource(scope:PdfReviewScope){return submitPdfChange(scope,{type:'reselect-source',id:scope.id,revision:scope.revision,fileId:scope.fileId},true)}
/** A decoded response can fail after an unrelated same-source update; preserve its issued lineage for the backend. */
export async function reportNovelImportPdfPreviewFailure(scope:PdfReviewScope,page:number,requestId:string){
  const before=pdfReviewScope(useNovelImportStore.getState().view,scope.fileId)
  if(!samePdfReviewSource(scope,before)||!before||before.revision<scope.revision)throw Error('预览来源已变化，本次失败上报没有采用。')
  if(!window.desktop?.novelImport)throw Error('请在桌面应用中核对 PDF 图像页。')
  const response=await window.desktop.novelImport({type:'report-pdf-preview-failure',id:scope.id,revision:scope.revision,fileId:scope.fileId,page,requestId})
  const current=pdfReviewScope(useNovelImportStore.getState().view,scope.fileId),next=pdfReviewScope(response.view,scope.fileId)
  if(!samePdfReviewSource(scope,current)||!samePdfReviewSource(scope,next)||!current||!next)throw Error('预览来源已变化，本次回执没有采用。')
  if(next.revision>=current.revision)adopt(response)
  return response
}

/** Background updates never raise the dialog or take focus from the editor. */
export function observeNovelImport() {
  subscriptions++
  if (subscriptions === 1 && window.desktop?.novelImport) {
    unsubscribe = window.desktop.subscribe(event => {
      if (event.type === 'novel-import') adopt({ view: event.view })
      if (event.type === 'novel-import-reading' && (event.active || !choosing)) useNovelImportStore.setState({ reading: event.active })
    })
    void call({ type: 'current' })
  }
  return () => {
    if (--subscriptions === 0) { unsubscribe?.(); unsubscribe = undefined }
  }
}
