"use client"

import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { diffChars } from 'diff'
import { ArrowDown, ArrowUp, Check, File, FolderOpen, LoaderCircle, Sparkles, X } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { buildTabId, useTabsStore } from '@/stores/tabs'
import { IMPORT_KINDS, IMPORT_LABELS, IMPORT_TARGETS, type ImportFileView, type ImportKind, type ImportModel, type ImportTarget, type ImportView, type ImportConflictDetail, type UnitKind } from '@desktop/shared/novel-import'
import { abandonNovelImport, abandonableImport, appendNovelImport, deletableImport, emptyImportDecision, hideNovelImport, inspectNovelImportSource, mutateNovelImport, needsNovelImportCloseConfirmation, novelImportFinalFocus, observeNovelImport, readNovelImportSource, keepCurrentNovelImport, reopenNovelImport, replaceNovelImport, setImportDecisionDraft, setNovelImportScreen, useNovelImportStore, type ImportScreen } from '@/lib/desktop/novel-import'
import { NovelImportRecord } from './NovelImportRecord'
import {PdfPageReview} from './PdfPageReview'
import {NovelImportReading,NovelImportWizard,NovelImportWizardHeader} from './NovelImportWizard'
import {wizardTaskBarText} from '@/lib/desktop/novel-import-wizard'
import {WIZARD_STEPS,WIZARD_STEP_TITLES,type WizardStep} from '@desktop/shared/novel-import-wizard'
import './novel-import.css'

const kindLabel = (kind: UnitKind) => kind === 'unknown' ? '待核对' : kind === 'excluded' ? '不导入' : IMPORT_LABELS[kind]
const joinKinds = (kinds: ImportKind[]) => kinds.map(kind => IMPORT_LABELS[kind]).join('、') || '未选择'
const screenTitles: Partial<Record<ImportScreen, string>> = { source: '核对来源', consent: '确认识别范围', recognizing: '内容识别中', select: '选择内容', confirm: '确认导入', running: '正在导入', publishing: '正在保存作品', paused: '导入已暂停', conflicts: '核对冲突', patches: '确认正文修改', failed: '导入需要处理', completed: '导入完成', replace: '开始新的导入', preview: '核对文件内容', chapters: '核对卷章' }

function ModelInfo({ label, model }: { label: string; model?: ImportModel }) {
  let endpoint = ''
  try { if (model) { const url = new URL(model.endpoint); endpoint = url.origin + url.pathname } } catch { endpoint = '已配置服务' }
  return <div className="ni-model"><span>{label}</span><strong>{model?.name ?? '尚未配置'}</strong>{model && <small>{model.modelId} · {endpoint}</small>}</div>
}
function configureModels() {
  // Settings suspends the dialog; closing it here would delete the import.
  window.dispatchEvent(new CustomEvent('desktop:settings-section', { detail: 'models' }))
}
function FileIcon({ file }: { file: ImportFileView }) {
  const name = file.format === 'txt' ? 'text' : file.format === 'md' ? 'markdown' : file.format === 'doc' || file.format === 'docx' ? 'word' : file.format === 'pdf' ? 'pdf' : file.format === 'html' || file.format === 'htm' ? 'html' : null
  return <span className="ni-file-icon">{name ? <img src={`/import-file-icons/${name}.svg`} alt={`${file.format.toUpperCase()} 文件`} /> : <File aria-label="不支持的文件" />}</span>
}
function SourceScreen({ view, busy, onReviewPdf }: { view: ImportView; busy: boolean; onReviewPdf(file:ImportFileView):void }) {
  const included = view.files.filter(file => file.included)
  const canRead = included.length > 0 && included.every(file => !file.error && !file.requiresEncodingConfirmation && file.pdfReady !== false) && view.pdfReady !== false
  const canReselect = (file: ImportFileView) => !view.publication && !view.modified && view.steps.length === 0 && !file.error && !file.requiresEncodingConfirmation && !!file.hash && file.characters > 0 && ['txt', 'md', 'doc', 'docx', 'html', 'htm'].includes(file.format)
  const inspect = async (fileId: string) => { useNovelImportStore.setState({ previewReturn: 'source' }); const response = await readNovelImportSource(fileId); if (response?.source) setNovelImportScreen('preview') }
  return <>
    <div className="ni-body">
      <div className="ni-row"><div><h3>选中的文件</h3><p>按下列顺序核对原文；识别后仍可手动确认片段类别。</p></div><div className="ni-actions"><Button variant="outline" disabled={busy} onClick={() => void appendNovelImport()}>添加来源</Button></div></div>
      <div className="ni-files">{view.files.map((file, index) => <div className={`ni-file ${file.included ? '' : 'ni-muted'}`} key={file.id}>
        <input type="checkbox" aria-label={`纳入 ${file.name}`} checked={file.included} disabled={busy || !!file.error || file.format === 'unsupported'} onChange={event => void mutateNovelImport({ type: 'include', fileId: file.id, included: event.target.checked })} />
        <FileIcon file={file} /><div className="ni-file-meta"><strong>{file.name}</strong><span>{file.characters.toLocaleString()} 字符 · {file.unitCount} 个片段{file.unknownCount > 0 && ` · ${file.unknownCount} 个待识别`}{file.requiresEncodingConfirmation && ' · 请确认文本编码'}</span>{file.error && <span role="status" className="ni-error-text">{file.error}</span>}{file.pdfInspection && <div className="ni-pdf-source-status"><p>{file.pdfInspection.pageCount ?? '未知'} 页 · {file.pdfInspection.imagePageCount} 页含图像 · {file.pdfInspection.textOnlyPageCount} 页有可提取文字</p>{file.pdfSourceInvalidated ? <p className="ni-error-text">文件已变化，原确认已失效。请重新选择文件。</p> : file.pdfInspection.blocker === 'ocr-required' ? <p className="ni-error-text">没有可提取的正文，暂时不能继续。请先完成 OCR，再重新选择文件。</p> : <p>{file.pdfPendingPages ?? file.pdfInspection.imagePageCount} 页图像尚未确认{file.pdfPreviewFailures?.length ? '；存在预览失败页，重试成功前仍不能继续。' : '；本页已提取文字始终保留。'}</p>}</div>}</div>
        <div className="ni-actions"><Button variant="ghost" size="icon-sm" aria-label={`上移 ${file.name}`} disabled={busy || index === 0} onClick={() => void mutateNovelImport({ type: 'move', fileId: file.id, delta: -1 })}><ArrowUp /></Button><Button variant="ghost" size="icon-sm" aria-label={`下移 ${file.name}`} disabled={busy || index === view.files.length - 1} onClick={() => void mutateNovelImport({ type: 'move', fileId: file.id, delta: 1 })}><ArrowDown /></Button><Button variant="outline" disabled={busy || !!file.error} aria-label={`核对 ${file.name}`} onClick={() => void inspect(file.id)}>核对原文</Button>{canReselect(file) && <Button variant="outline" disabled={busy} aria-label={`重新选择 ${file.name}`} onClick={() => void mutateNovelImport({ type: 'reselect-source', fileId: file.id })}>重新选择文件</Button>}{file.pdfInspection && (file.pdfInspection.imagePageCount > 0 || file.pdfInspection.blocker || file.pdfSourceInvalidated) && <Button variant="outline" data-pdf-review-file-id={file.id} disabled={busy} onClick={() => onReviewPdf(file)}>核对图像页</Button>}</div>
      </div>)}</div>
      <div className="ni-notice"><strong>正文将逐字拷贝</strong><p>先确认文件和编码。AI 识别前会再次列出发送范围和所用模型；扫描 PDF 或无法读取的文件需要转换为可提取文本的文件。</p>{view.files.some(canReselect) && <p>重新选择相同原文件可更新读取授权，已核对的分类和卷章会保留。</p>}</div>
      <Button variant="outline" disabled={busy || !view.found.body} onClick={() => setNovelImportScreen('chapters')}>核对卷章</Button>
    </div>
    <footer className="ni-footer"><span>{included.length} 个文件纳入导入</span><Button disabled={busy || !canRead} onClick={() => setNovelImportScreen('consent')}>识别内容</Button></footer>
  </>
}

function PreviewScreen({ view, busy }: { view: ImportView; busy: boolean }) {
  const source = useNovelImportStore(state => state.source)
  const previewReturn = useNovelImportStore(state => state.previewReturn)
  const file = view.files.find(item => item.id === source?.fileId)
  const [start, setStart] = useState(source?.offset ?? 0)
  const [end, setEnd] = useState((source?.offset ?? 0) + (source?.text.length ?? 0))
  const [kind, setKind] = useState<UnitKind>('body')
  const [encoding, setEncoding] = useState(file?.encoding ?? 'utf-8')
  useEffect(() => { setStart(source?.offset ?? 0); setEnd((source?.offset ?? 0) + (source?.text.length ?? 0)) }, [source])
  if (!source || !file) return <div className="ni-body"><p>请先选择需要核对的文件。</p><Button onClick={() => setNovelImportScreen('source')}>返回来源</Button></div>
  const classify = async () => { const result = await mutateNovelImport({ type: 'set-range', fileId: file.id, start, end, kind }); if (result) { await readNovelImportSource(file.id, source.offset); setNovelImportScreen('preview') } }
  return <>
    <div className="ni-body"><div className="ni-row"><h3>{file.name}</h3><Button variant="outline" onClick={() => setNovelImportScreen(previewReturn)}>{previewReturn === 'select' ? '返回选择' : '返回来源'}</Button></div>
      {['txt', 'md', 'html', 'htm'].includes(file.format) && <div className="ni-form-row"><label>文本编码<select aria-label="文本编码" value={encoding} onChange={event => setEncoding(event.target.value)}><option value="utf-8">UTF-8</option><option value="utf-16le">UTF-16 LE</option><option value="utf-16be">UTF-16 BE</option><option value="gb18030">GB18030</option></select></label><Button variant="outline" disabled={busy} onClick={async () => { if (await mutateNovelImport({ type: 'set-encoding', fileId: file.id, encoding: encoding as 'utf-8' })) { await readNovelImportSource(file.id, 0); setNovelImportScreen('preview') } }}>应用编码</Button></div>}
      <p>原文只读。位置从 0 开始，结束位置不包含在片段内；下面的分类只影响导入副本。</p>
      <pre className="ni-source-text" tabIndex={0}>{source.text}</pre>
      <div className="ni-row ni-pagination"><span>{source.offset + 1}–{source.offset + source.text.length} / {source.total} 字符</span><Button variant="outline" disabled={busy || source.offset === 0} onClick={() => void readNovelImportSource(file.id, Math.max(0, source.offset - 32768))}>上一页</Button><Button variant="outline" disabled={busy || source.offset + source.text.length >= source.total} onClick={() => void readNovelImportSource(file.id, source.offset + source.text.length)}>下一页</Button></div>
      <h3>确认片段分类</h3><div className="ni-form-row"><label>起始位置<input aria-label="片段起始位置" type="number" min={0} max={source.total} value={start} onChange={event => setStart(Number(event.target.value))} /></label><label>结束位置<input aria-label="片段结束位置" type="number" min={start + 1} max={source.total} value={end} onChange={event => setEnd(Number(event.target.value))} /></label><label>片段类别<select aria-label="片段类别" value={kind} onChange={event => setKind(event.target.value as UnitKind)}>{[...IMPORT_KINDS, 'unknown', 'excluded'].map(item => <option key={item} value={item}>{kindLabel(item as UnitKind)}</option>)}</select></label><Button disabled={busy || start < 0 || end <= start || end > source.total} onClick={() => void classify()}>确认片段分类</Button></div>
      <details><summary>本页片段位置与分类</summary><ul>{source.units.map(unit => <li key={unit.id}><button className="ni-text-button" onClick={() => { setStart(unit.start); setEnd(unit.end); setKind(unit.kind) }}>{unit.start}–{unit.end} · {kindLabel(unit.kind)}{unit.part && ` · ${unit.part}`}</button></li>)}</ul></details>
    </div><footer className="ni-footer"><span>分类覆盖的完整性将在导入前再次检查。</span><Button variant="outline" onClick={() => setNovelImportScreen(previewReturn)}>完成核对</Button></footer>
  </>
}

function ChaptersScreen({ view, busy }: { view: ImportView; busy: boolean }) {
  const [cuts, setCuts] = useState(view.chapters.length ? view.chapters.map(chapter => ({ start: chapter.start, title: chapter.title, ...(chapter.volume !== undefined ? { volume: chapter.volume } : {}) })) : [{ start: 0, title: '正文' }])
  const valid = cuts.every((cut, index) => cut.title.trim() && cut.start >= 0 && (index === 0 ? cut.start === 0 : cut.start > cuts[index - 1].start))
  const setVolume = (index: number, volume: string) => setCuts(items => items.map((item, i) => { if (i !== index) return item; const next = { ...item }; if (volume) next.volume = volume; else delete next.volume; return next }))
  return <><div className="ni-body"><p>按合并后的正文字符位置确认每一章的起点。第一章从 0 开始，原文不会因为章节划分发生修改。</p>{cuts.map((cut, index) => <div key={index} className="ni-form-row"><label>第 {index + 1} 章起点<input aria-label={`第 ${index + 1} 章起点`} type="number" min={0} value={cut.start} onChange={event => setCuts(items => items.map((item, i) => i === index ? { ...item, start: Number(event.target.value) } : item))} /></label><label>章节名<input aria-label={`第 ${index + 1} 章标题`} value={cut.title} maxLength={300} onChange={event => setCuts(items => items.map((item, i) => i === index ? { ...item, title: event.target.value } : item))} /></label><label>卷名（可选）<input aria-label={`第 ${index + 1} 章卷名`} value={cut.volume ?? ''} maxLength={300} onChange={event => setVolume(index, event.target.value)} /></label><Button variant="ghost" disabled={cuts.length === 1} onClick={() => setCuts(items => items.filter((_, i) => i !== index))}>移除</Button></div>)}<Button variant="outline" onClick={() => setCuts(items => [...items, { start: (items.at(-1)?.start ?? 0) + 1, title: '' }])}>添加章节起点</Button></div><footer className="ni-footer"><Button variant="outline" onClick={() => setNovelImportScreen('source')}>返回来源</Button><Button disabled={busy || !valid} onClick={async () => { if (await mutateNovelImport({ type: 'set-chapters', cuts })) setNovelImportScreen('source') }}>确认卷章边界</Button></footer></>
}

function RecognitionConsent({ view, busy }: { view: ImportView; busy: boolean }) {
  const classify = async (mode: 'local' | 'ai') => { const result = await mutateNovelImport({ type: 'classify', mode, consent: mode === 'ai' }); if (result?.view) setNovelImportScreen(result.view.phase) }
  return <><div className="ni-body"><div className="ni-notice"><strong>第一次发送：识别文件中的内容类别</strong><p>允许后，会把以下纳入文件的可读文本发给文本模型，识别正文、大纲和各项设定。此步骤只识别来源，尚未开始补全设定。</p></div><ul>{view.files.filter(file => file.included).map(file => <li key={file.id}>{file.name} · {file.characters.toLocaleString()} 字符</li>)}</ul><ModelInfo label="识别模型" model={view.models.text} />{!view.models.text && <p>尚未配置文本模型。可以先配置，或仅使用本地规则并手动确认未知片段。</p>}<Button variant="outline" onClick={configureModels}>配置模型</Button></div><footer className="ni-footer"><Button variant="outline" onClick={() => setNovelImportScreen('source')}>返回来源</Button><Button variant="outline" disabled={busy} onClick={() => void classify('local')}>仅本地分类</Button><Button disabled={busy || !view.models.text} onClick={() => void classify('ai')}>允许识别</Button></footer></>
}

function SelectionScreen({ view, busy }: { view: ImportView; busy: boolean }) {
  const hasBody = view.selected.includes('body') && view.found.body > 0
  const toggleSource = (kind: ImportKind, checked: boolean) => mutateNovelImport(current => ({ type: 'select', selected: checked ? [...current.selected, kind] : current.selected.filter(item => item !== kind), targets: current.targets, infer: current.infer }))
  const toggleTarget = (kind: ImportTarget, checked: boolean) => mutateNovelImport(current => ({ type: 'select', selected: current.selected, targets: checked ? [...current.targets, kind] : current.targets.filter(item => item !== kind), infer: current.infer }))
  return <><div className="ni-body"><h3>从文件直接导入</h3><p>已识别到的内容默认勾选。没有识别到的内容无法直接导入。</p><div className="ni-direct-options">{IMPORT_KINDS.map(kind => <div className={`ni-direct-option ${!view.found[kind] ? 'ni-muted' : ''}`} key={kind}><label htmlFor={`ni-source-${kind}`}><input id={`ni-source-${kind}`} type="checkbox" disabled={busy || !view.found[kind]} checked={view.selected.includes(kind)} onChange={event => void toggleSource(kind, event.target.checked)} /><strong>{IMPORT_LABELS[kind]}</strong></label><span>{view.found[kind] ? `识别到 ${view.found[kind]} 项` : '未识别到'}{kind === 'body' && view.found.body > 0 && ` · ${view.chapters.length} 章`}</span>{view.found[kind] > 0 && <button type="button" className="ni-source-link" disabled={busy} aria-label={`查看${IMPORT_LABELS[kind]}来源`} onClick={() => void inspectNovelImportSource(kind)}>查看来源</button>}</div>)}</div>
      {hasBody ? <section className="ni-inference"><label className="ni-master" htmlFor="ni-infer"><input id="ni-infer" type="checkbox" checked={view.infer} disabled={busy} onChange={event => { const checked = event.target.checked; void mutateNovelImport(current => ({ type: 'select', selected: current.selected, targets: current.targets, infer: checked })) }} /><div><strong>根据正文补全以下内容</strong><p>优先保留文件中的设定，缺少时根据正文推断；冲突交由你决定。</p></div></label><div className="ni-target-options">{IMPORT_TARGETS.map(kind => <label className={`ni-target-card ${view.targets.includes(kind) ? 'ni-checked' : ''} ${!view.infer ? 'ni-disabled' : ''}`} htmlFor={`ni-target-${kind}`} key={kind}><input id={`ni-target-${kind}`} type="checkbox" disabled={busy || !view.infer} checked={view.targets.includes(kind)} onChange={event => void toggleTarget(kind, event.target.checked)} /><span><strong>{IMPORT_LABELS[kind]}</strong><small>{kind === 'worldline' || kind === 'narrative' ? '根据整书内容推断' : view.found[kind] ? '已有原文，核对并补全' : '根据正文分析补全'}</small></span></label>)}</div></section> : <div className="ni-notice"><strong>仅拷贝所选设定</strong><p>没有选择正文，将直接导入已勾选的文件内容，不进行 AI 补全或推断。</p></div>}
      {!view.sourceReady && <div className="ni-error-text" role="status">仍有未分类的片段或未确认的来源，请返回逐项核对。</div>}
    </div><footer className="ni-footer"><Button variant="outline" onClick={() => setNovelImportScreen('source')}>返回来源</Button><Button disabled={busy || !view.selected.length || !view.sourceReady} onClick={() => setNovelImportScreen('confirm')}>继续</Button></footer></>
}

function ConfirmScreen({ view, busy, onDelete }: { view: ImportView; busy: boolean; onDelete(): void }) {
  const [title, setTitle] = useState(view.title)
  useEffect(() => setTitle(view.title), [view.id, view.title])
  const infer = view.infer && view.selected.includes('body') && view.targets.length > 0
  const retryPublication = !!view.publication
  const excludedSources = view.targets.filter(kind => view.found[kind] > 0 && !view.selected.includes(kind))
  const commitTitle = async () => retryPublication || title === view.title || !!await mutateNovelImport({ type: 'set-title', title })
  const chooseTarget = async () => { if (await commitTitle()) await mutateNovelImport({ type: 'choose-target' }) }
  const start = async () => { if (!await commitTitle()) return; const result = await mutateNovelImport({ type: 'start', consent: infer && !retryPublication }); if (result?.view) setNovelImportScreen(result.view.phase === 'conflicts' && result.view.patches.length ? 'patches' : result.view.phase) }
  return <><div className="ni-body"><label className="ni-field">作品名称<input aria-label="作品名称" disabled={busy || retryPublication} value={title} maxLength={100} onChange={event => setTitle(event.target.value)} /></label><div className="ni-row ni-target-directory"><div><h3>导入到新的空目录</h3><p>{view.targetLabel ?? '请选择用来保存新作品的空目录。'}</p>{!view.targetReady && view.targetLabel && <span className="ni-error-text">目录需重新授权或修复。</span>}</div><Button variant="outline" disabled={busy} onClick={() => void chooseTarget()}><FolderOpen />选择目录</Button></div><h3>导入计划</h3><ol className="ni-plan"><li><strong>导入正文</strong><span>{joinKinds(view.selected)}</span></li>{infer && <><li><strong>补全设定</strong><span>{joinKinds(view.targets.filter(kind => kind !== 'worldline' && kind !== 'narrative'))}</span></li>{view.targets.includes('worldline') && <li><strong>推断世界线</strong><span>结合正文、大纲及设定，整理事件发生顺序。</span></li>}{view.targets.includes('narrative') && <li><strong>推断叙事线</strong><span>结合正文与设定，整理讲述顺序。</span></li>}<li><strong>检查一致性</strong><span>存在冲突时等待你决定，再继续导入。</span></li></>}<li><strong>保存并完成</strong><span>保存到所选空目录，记录原始材料及所有决定。</span></li></ol>
      {retryPublication ? <div className="ni-notice"><strong>恢复原保存请求</strong><p>导入计划已冻结。重新授权原保存目录后，将继续保存已确认的内容，不重新发送正文或创建另一本作品。</p></div> : infer ? <><div className="ni-notice"><strong>第二次发送：分析、补全与复核</strong><p>将发送所选正文及设定，补全{joinKinds(view.targets)}。文件原文、推断结果和你确认的决定会一并用于一致性检查。正文只会在逐处预览并二次确认后修改导入副本。</p>{excludedSources.length > 0 && <p>{joinKinds(excludedSources)}：不导入源设定，仅从正文分析。</p>}<p>已关闭的补全：{joinKinds(IMPORT_TARGETS.filter(kind => !view.targets.includes(kind)))}。</p></div><ModelInfo label="文本模型" model={view.models.text} /><ModelInfo label="审核模型" model={view.models.review} /><Button variant="outline" onClick={configureModels}>配置模型</Button>{(!view.models.text || !view.models.review) && <p className="ni-error-text">请先配置文本模型与审核模型。</p>}</> : <div className="ni-notice">本次仅拷贝所选原文，不向模型发送内容，未分析全书。</div>}
    </div><footer className="ni-footer">{retryPublication ? <><Button variant="ghost" disabled={busy} onClick={onDelete}>删除导入</Button><Button variant="outline" onClick={hideNovelImport}>收起</Button></> : <Button variant="outline" onClick={() => setNovelImportScreen(view.phase === 'conflicts' ? 'conflicts' : 'select')}>{view.phase === 'conflicts' ? '返回冲突' : '返回选择'}</Button>}<Button disabled={busy || !title.trim() || !view.targetReady || !view.sourceReady || (infer && !retryPublication && (!view.models.text || !view.models.review))} onClick={() => void start()}>{retryPublication ? '继续保存原作品' : infer ? '允许分析并导入' : '开始导入'}</Button></footer></>
}

function ProgressScreen({ view, busy, cancel }: { view: ImportView; busy: boolean; cancel: () => void }) {
  const recognizing = view.phase === 'recognizing', publishing = view.phase === 'publishing'
  return <><div className="ni-body"><div className="ni-progress-hero" aria-busy={recognizing || view.phase === 'running' || publishing}><LoaderCircle className={view.phase === 'paused' || view.phase === 'failed' ? '' : 'ni-spinner'} /><h3>{recognizing ? '正在用 AI 识别文件中的不同内容' : publishing ? '正在将作品保存到所选目录' : view.phase === 'paused' ? '已保留导入进度' : view.phase === 'failed' ? '请处理问题后重试' : '从正文开始，逐步整理整书设定'}</h3><p>{recognizing ? `正在识别 ${view.files.filter(file => file.included).length} 个文件，完成后进入内容选择。识别需要等待时间。` : publishing ? '保存完成后即可在现有工作台中打开作品。' : '请等待导入完成。关闭窗口或取消导入会删除这次导入，原始文件不会更改。'}</p></div>{view.steps.length > 0 && <ol className="ni-steps">{view.steps.map(step => <li key={step.key} data-state={step.state}><span className="ni-step-mark">{step.state === 'done' ? <Check /> : step.state === 'running' ? <LoaderCircle className="ni-spinner" /> : '·'}</span><strong>{step.key === 'body' ? '导入正文' : step.label}</strong><span>{step.state === 'done' ? '完成' : step.state === 'skipped' ? '已跳过' : step.state === 'running' ? '处理中' : step.state === 'failed' ? '失败' : step.state === 'waiting' ? '等待确认' : '等待'}{step.total !== undefined && ` · ${step.completed}/${step.total}`}</span></li>)}</ol>}</div><footer className="ni-footer">{deletableImport(view) ? <Button variant="ghost" disabled={busy} onClick={cancel}>{abandonableImport(view) ? '取消导入' : '删除导入'}</Button> : <span />}<div className="ni-actions">{!abandonableImport(view) && <Button variant="outline" onClick={hideNovelImport}>收起</Button>}{view.phase === 'paused' && <Button disabled={busy} onClick={() => void mutateNovelImport({ type: 'resume' })}>继续导入</Button>}{view.phase === 'failed' && <>{!view.publication && <Button variant="outline" disabled={busy} onClick={() => setNovelImportScreen('source')}>返回核对来源</Button>}<Button variant="outline" disabled={busy} onClick={() => void mutateNovelImport({ type: 'repair-target' })}>修复保存目录</Button><Button disabled={busy} onClick={() => void mutateNovelImport({ type: 'retry' })}>重试导入</Button></>}{(view.phase === 'running' || recognizing) && <Button variant="outline" disabled={busy} onClick={() => void mutateNovelImport({ type: 'pause' })}>暂停</Button>}</div></footer></>
}

const CHOICE_TEXT: Record<ImportConflictDetail['choices'][number]['choice'], [string, string]> = {
  inferred: ['以正文为准', '把这项设定改成上面「按正文应为」的说法。'],
  source: ['保留现在的设定', '这项设定不改动，按现在的内容导入。'],
  merge: ['自己填写这一项', '在下方写出你认为正确的内容，导入时使用你填写的版本。'],
}
/** docs/557 §5: two values with the removed and added characters marked. */
// docs/559-2: diffed once per value pair (not per keystroke), bounded in size and time; longer pairs show plain text.
const DIFF_LIMIT = 4000
function useDiff(from: string, to: string) {
  return useMemo(() => from.length + to.length > DIFF_LIMIT ? undefined : diffChars(from, to, { timeout: 50 }) ?? undefined, [from, to])
}
const DiffText = memo(function DiffText({ parts, text, side }: { parts?: ReturnType<typeof diffChars>; text: string; side: 'from' | 'to' }) {
  if (!parts) return <pre>{text}</pre>
  return <pre>{parts.map((part, k) => part.added ? side === 'to' ? <ins key={k}>{part.value}</ins> : null : part.removed ? side === 'from' ? <del key={k}>{part.value}</del> : null : <span key={k}>{part.value}</span>)}</pre>
})
/** docs/557: wizard step 21. States what differs, offers the decisions the controller accepts, and returns to the checks. */
function WizardConflictScreen({ view, busy, detail }: { view: ImportView; busy: boolean; detail: ImportConflictDetail }) {
  const draftKey = `${view.id}:${detail.conflictId}:wizard`
  const draft = useNovelImportStore(state => state.decisionDrafts[draftKey])
  const { choice, explanation, mergedText } = draft ?? { ...emptyImportDecision, mergedText: detail.mergeDefault }
  const set = (change: Partial<typeof emptyImportDecision>) => setImportDecisionDraft(draftKey, useNovelImportStore.getState().decisionDrafts[draftKey] ? change : { mergedText: detail.mergeDefault, ...change })
  const selected = detail.choices.find(option => option.choice === choice && option.available)
  const diff = useDiff(detail.current, detail.proposed)
  const ready = !!selected && (choice !== 'merge' || !!mergedText.trim())
  const last = detail.total <= 1
  const submit = async () => {
    if (!selected) return
    await mutateNovelImport({ type: 'resolve', conflictId: detail.conflictId, choice: selected.choice, explanation: explanation.trim() || undefined, ...(selected.choice === 'merge' ? { mergedText: mergedText.trim() } : {}) })
  }
  return <><div className="ni-body ni-conflict">
    <p className="ni-eyebrow">第 {detail.index} / {detail.total} 处矛盾</p>
    <h3>「{detail.entity}」{detail.kindLabel && <span className="ni-conflict-kind">（{detail.kindLabel}）</span>}的「{detail.fieldLabel}」与正文说法不一致</h3>
    {detail.reason && <p className="ni-conflict-reason"><strong>矛盾点：</strong>{detail.reason}</p>}
    <div className="ni-conflict-columns"><section><h4>现在的设定</h4><DiffText parts={diff} text={detail.current} side="from" /></section><section><h4>按正文应为</h4>{detail.proposed ? <DiffText parts={diff} text={detail.proposed} side="to" /> : <p className="ni-conflict-empty">正文没有给出具体说法</p>}</section></div>
    {detail.evidence.length > 0 && <><h4>正文依据</h4>{detail.evidence.map((evidence, index) => <blockquote key={index}>{evidence.quote}<small>{evidence.location}</small></blockquote>)}</>}
    <fieldset className="ni-decisions"><legend>选择处理方式（任选一种都可以继续导入）</legend>{detail.choices.map(option => <label key={option.choice} data-disabled={!option.available || undefined}><input type="radio" name="ni-decision" value={option.choice} disabled={!option.available || busy} checked={choice === option.choice && option.available} onChange={() => set({ choice: option.choice })} /><span><strong>{CHOICE_TEXT[option.choice][0]}</strong><small>{option.available ? CHOICE_TEXT[option.choice][1] : option.reason}</small></span></label>)}</fieldset>
    {selected?.choice === 'merge' && <label className="ni-field">填写这一项<textarea aria-label="填写这一项" disabled={busy} value={mergedText} onChange={event => set({ mergedText: event.target.value })} maxLength={100000} /></label>}
    <label className="ni-field">备注（选填，会记入导入记录）<textarea aria-label="备注" disabled={busy} value={explanation} onChange={event => set({ explanation: event.target.value })} maxLength={16000} /></label>
  </div><footer className="ni-footer"><Button variant="ghost" disabled={busy} onClick={() => setNovelImportScreen('select')}>返回校验</Button><Button disabled={busy || !ready} onClick={() => void submit()}>{last ? '确认' : '确认并处理下一处'}</Button></footer></>
}
function ConflictScreen({ view, busy }: { view: ImportView; busy: boolean }) {
  if (view.conflictDetail) return <WizardConflictScreen key={view.conflictDetail.conflictId} view={view} busy={busy} detail={view.conflictDetail} />
  return <LegacyConflictScreen view={view} busy={busy} />
}
function LegacyConflictScreen({ view, busy }: { view: ImportView; busy: boolean }) {
  const conflict = view.conflicts.find(item => item.status === 'pending')
  const draftKey = `${view.id}:${conflict?.id}:${conflict?.hash}:${conflict?.type}`
  const { choice, explanation, mergedText, confirmInference } = useNovelImportStore(state => state.decisionDrafts[draftKey] ?? emptyImportDecision)
  const setChoice = (choice: string) => setImportDecisionDraft(draftKey, { choice })
  const setExplanation = (explanation: string) => setImportDecisionDraft(draftKey, { explanation })
  const setMergedText = (mergedText: string) => setImportDecisionDraft(draftKey, { mergedText })
  const setConfirmInference = (confirmInference: boolean) => setImportDecisionDraft(draftKey, { confirmInference })
  const [pendingRevision, setPendingRevision] = useState<number | null>(null)
  useEffect(() => { setPendingRevision(null) }, [conflict?.id, conflict?.hash, conflict?.type])
  useEffect(() => { if (pendingRevision !== null && view.revision > pendingRevision) setPendingRevision(null) }, [view.revision, pendingRevision])
  if (!conflict) return <div className="ni-body"><p>冲突已处理，正在等待后续检查。</p><Button variant="ghost" onClick={() => void abandonNovelImport()}>取消导入</Button></div>
  const sourceConflict = conflict.type === 'source-source', bodyConflict = conflict.type === 'body-body'
  const options = sourceConflict ? [['a', '保留来源 A'], ['b', '保留来源 B'], ['merge', '手动合并设定']] : bodyConflict ? [['source', '保留正文并补充解释'], ['rewrite', '修改正文导入副本']] : [['source', '坚持导入原设定'], ['inferred', '使用正文推断的设定'], ['rewrite', '保持原设定，但修改正文']]
  const needsExplanation = choice === 'source' || choice === 'merge'
  const submit = async () => {
    const result = await mutateNovelImport({ type: 'resolve', conflictId: conflict.id, choice: choice as 'source', explanation: explanation.trim() || undefined, ...(choice === 'merge' ? { mergedText } : {}) })
    if (!result?.view) return
    if (choice === 'rewrite' && result.view.phase === 'conflicts') setNovelImportScreen('patches')
    else if (result.view.phase === 'conflicts' && result.view.conflicts.some(item => item.id === conflict.id && item.status === 'pending')) setPendingRevision(result.view.revision)
  }
  return <><div className="ni-body"><p className="ni-eyebrow">{sourceConflict ? '文件设定之间存在差异' : bodyConflict ? '正文内部存在差异' : '原设定与正文存在差异'}</p><h3>{conflict.entity} · {conflict.field}</h3><div className="ni-conflict-columns"><section><h4>{sourceConflict ? '来源 A' : bodyConflict ? '正文片段 A' : '导入的原设定'}</h4><pre>{conflict.source.text}</pre></section><section><h4>{sourceConflict ? '来源 B' : bodyConflict ? '正文片段 B' : '根据正文推断'}</h4><pre>{conflict.candidate.text}</pre></section></div><h4>原文依据</h4>{conflict.evidence.map((evidence, index) => <blockquote key={index}>{evidence.quote}<small>片段 {evidence.unitId}</small></blockquote>)}<fieldset className="ni-decisions"><legend>由你决定如何处理</legend>{options.map(([value, label]) => <label key={value}><input type="radio" name="ni-decision" value={value} checked={choice === value} onChange={() => { setChoice(value); setConfirmInference(false) }} />{label}</label>)}</fieldset>{choice === 'inferred' && <div className="ni-notice"><strong>将采用以下推断替换这项原设定</strong><p>{conflict.entity} · {conflict.field}：{conflict.source.value} → {conflict.candidate.value}</p><label className="ni-check-line"><input type="checkbox" checked={confirmInference} onChange={event => setConfirmInference(event.target.checked)} />确认采用此推断，提交后继续复核</label></div>}{choice === 'merge' && <label className="ni-field">合并后的设定<textarea value={mergedText} onChange={event => setMergedText(event.target.value)} /></label>}<label className="ni-field">补充解释或依据{needsExplanation ? '（必填）' : '（选填）'}<textarea aria-label="补充解释或依据" value={explanation} onChange={event => setExplanation(event.target.value)} maxLength={16000} /></label><p>提交后会重新检查整书一致性。选择修改正文会先生成逐处修改预览，尚不会应用。</p>{pendingRevision !== null && <p role="status">正在复核这项决定，请稍候。</p>}</div><footer className="ni-footer"><Button variant="ghost" disabled={busy} onClick={() => void abandonNovelImport()}>取消导入</Button>{view.selected.includes('body') && view.infer && view.targets.length > 0 && <Button variant="outline" disabled={busy || pendingRevision !== null} onClick={() => setNovelImportScreen('confirm')}>重新确认分析范围</Button>}<Button disabled={busy || pendingRevision !== null || !choice || (needsExplanation && !explanation.trim()) || (choice === 'merge' && !mergedText.trim()) || (choice === 'inferred' && !confirmInference)} onClick={() => void submit()}>{choice === 'rewrite' ? '查看正文修改' : '提交决定并复核'}</Button></footer></>
}

function PatchesScreen({ view, busy }: { view: ImportView; busy: boolean }) {
  const [selected, setSelected] = useState<string[]>([])
  return <><div className="ni-body"><div className="ni-notice"><strong>逐处确认正文导入副本</strong><p>以下修改不会改变原始文件。勾选要应用的修改，再确认；应用后会重新确认 AI 分析范围并复核一致性。</p></div>{!view.patches.length && <div className="ni-progress-hero" role="status" aria-busy="true"><LoaderCircle className="ni-spinner" /><p>正在生成正文修改提案，请稍候。</p><Button variant="ghost" onClick={() => void abandonNovelImport()}>取消导入</Button></div>}{view.patches.map(patch => <section key={patch.id} className="ni-patch"><label><input type="checkbox" aria-label="应用这一处修改" checked={selected.includes(patch.id)} onChange={event => setSelected(ids => event.target.checked ? [...ids, patch.id] : ids.filter(id => id !== patch.id))} /><strong>应用这一处修改</strong><span>字符 {patch.start}–{patch.end}</span></label><div className="ni-conflict-columns"><section><h4>修改前</h4><pre>{patch.before}</pre></section><section><h4>修改后</h4><pre>{patch.after}</pre></section></div><p>{patch.reason}</p></section>)}</div><footer className="ni-footer"><Button variant="outline" onClick={() => setNovelImportScreen('conflicts')}>返回决定</Button><Button disabled={busy || !selected.length} onClick={async () => { await mutateNovelImport({ type: 'apply-patches', patchIds: selected, confirm: true }) }}>确认修改导入副本</Button></footer></>
}

export function NovelImportTaskButton() {
  const view = useNovelImportStore(state => state.view)
  if (!view || view.phase === 'discarded' || abandonableImport(view)) return null
  if (view.wizard && view.phase !== 'completed') return <Button className="ni-task-button" variant="ghost" onClick={reopenNovelImport}><Sparkles /><span>{wizardTaskBarText({ step: view.wizard.step, title: view.title, paused: view.phase === 'paused', waiting: view.phase === 'select' || view.phase === 'conflicts' })}</span></Button>
  return <Button className="ni-task-button" variant="ghost" onClick={reopenNovelImport}>{view.phase === 'completed' ? <Check /> : <Sparkles />}<span>{view.phase === 'completed' ? '导入完成' : screenTitles[view.phase] ?? '导入作品'} · {view.title || '未命名作品'}</span></Button>
}

export function NovelImportDialog({ suspended = false }: { suspended?: boolean }) {
  const { view, open, screen, busy, error, reading } = useNovelImportStore()
  const [recordOpen, setRecordOpen] = useState(false)
  const [pdfFileId, setPdfFileId] = useState<string|null>(null)
  const [reviseOpen, setReviseOpen] = useState(false)
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false)
  const [closeConfirmBusy, setCloseConfirmBusy] = useState(false)
  const closeConfirmBusyRef = useRef(false)
  const importId = view?.id
  useEffect(() => { const open = () => setNovelImportScreen('conflicts'); window.addEventListener('novel-import:conflicts', open); return () => window.removeEventListener('novel-import:conflicts', open) }, [])
  useEffect(() => { setCloseConfirmOpen(false) }, [importId, open, suspended])
  useEffect(() => { closeConfirmBusyRef.current = false; setCloseConfirmBusy(false) }, [importId])
  const query = useQueryClient()
  useEffect(observeNovelImport, [])
  const completedId = view?.phase === 'completed' ? view.id : null
  useEffect(() => {
    if (completedId) void query.invalidateQueries({ queryKey: ['novels'] })
  }, [completedId, query])
  // Reading a new selection: the wizard opens at once and waits for the file information.
  if (reading && (!open || !view || view.phase === 'completed')) return <><Dialog open onOpenChange={() => undefined}><DialogContent className="ni-dialog chatpane" showCloseButton={false} finalFocus={() => novelImportFinalFocus() ?? true}><header className="ni-header"><div><div className="ni-eyebrow">导入作品</div><NovelImportWizardHeader step="files" /></div></header><NovelImportReading /></DialogContent></Dialog></>
  if (!view) return null
  const cancel = () => void abandonNovelImport()
  // docs/560: a started save is deleted only after the author confirms; closing the window only hides it.
  const stop = () => { if (view.publication) { if (!closeConfirmBusyRef.current) setCloseConfirmOpen(true) } else cancel() }
  const savingStarted = !!view.publication
  const close = () => {
    if (screen === 'replace') keepCurrentNovelImport()
    else if (needsNovelImportCloseConfirmation(view)) { if (!closeConfirmBusyRef.current) setCloseConfirmOpen(true) }
    else if (abandonableImport(view)) cancel()
    else hideNovelImport()
  }
  // docs/563: while a delete waits for a save, the author may hide the window; deleting continues in the background.
  const waitingForSave = closeConfirmBusy && view.phase === 'publishing'
  const dismissCloseConfirmation = () => { if (!closeConfirmBusyRef.current) setCloseConfirmOpen(false); else if (view.phase === 'publishing') { setCloseConfirmOpen(false); hideNovelImport() } }
  const confirmClose = async () => {
    if (closeConfirmBusyRef.current) return
    const id = view.id
    closeConfirmBusyRef.current = true
    setCloseConfirmBusy(true)
    try { await abandonNovelImport() }
    finally {
      const currentId = useNovelImportStore.getState().view?.id
      if (!currentId || currentId === id) {
        closeConfirmBusyRef.current = false
        setCloseConfirmBusy(false)
        setCloseConfirmOpen(false)
      }
    }
  }
  const openWork = () => { const novelId = view.publication?.novelId; if (!novelId) return; useTabsStore.getState().openTab({ id: buildTabId('novel', novelId), type: 'novel', novelId, title: view.title }); hideNovelImport() }
  let content
  const props = { view, busy: !!busy }
  const wizard = view.wizard && !['conflicts', 'patches', 'completed', 'replace'].includes(screen) && view.phase !== 'completed' ? view.wizard : undefined
  const wizardConflicts = screen === 'conflicts' && !!view.conflictDetail
  if (wizard && reviseOpen) content = <ReviseDialog view={view} busy={!!busy} onClose={() => setReviseOpen(false)} />
  else if (wizard) content = <NovelImportWizard view={view as ImportView & { wizard: NonNullable<ImportView['wizard']> }} busy={!!busy} onStop={stop} onRevise={() => setReviseOpen(true)} />
  else if (screen === 'source') content = <SourceScreen {...props} onReviewPdf={file=>setPdfFileId(file.id)} />
  else if (screen === 'preview') content = <PreviewScreen {...props} />
  else if (screen === 'chapters') content = <ChaptersScreen {...props} />
  else if (screen === 'consent') content = <RecognitionConsent {...props} />
  else if (screen === 'select') content = <SelectionScreen {...props} />
  else if (screen === 'confirm') content = <ConfirmScreen {...props} onDelete={stop} />
  else if (screen === 'conflicts') content = <ConflictScreen {...props} />
  else if (screen === 'patches') content = <PatchesScreen {...props} />
  else if (screen === 'replace') content = <><div className="ni-body"><h3>开始新的导入？</h3><p>当前导入《{view.title || '未命名作品'}》尚未完成。开始新的导入会停止并删除它，原始文件不会更改。</p></div><footer className="ni-footer"><Button variant="outline" disabled={!!busy} onClick={keepCurrentNovelImport}>返回当前导入</Button><Button variant="destructive" disabled={!!busy} onClick={() => void replaceNovelImport()}>删除并重新选择</Button></footer></>
  else if (screen === 'completed') content = <><div className="ni-body"><div className="ni-progress-hero"><Check /><h3>{view.title}</h3><p>作品已导入，可以在工作台继续编辑。</p></div>{view.summary && <div className="ni-summary"><div><strong>{view.summary.source}</strong><span>原文设定</span></div><div><strong>{view.summary.inferred}</strong><span>推断设定</span></div><div><strong>{view.summary.decisions}</strong><span>已确认决定</span></div><div><strong>{view.summary.modified}</strong><span>正文修改</span></div></div>}{view.notFound.length > 0 && <div className="ni-notice">未找到可支持的内容：{joinKinds(view.notFound)}。这些项目保留为空。</div>}</div><footer className="ni-footer"><Button variant="ghost" onClick={hideNovelImport}>关闭</Button><Button variant="outline" disabled={!view.publication?.novelId} onClick={() => setRecordOpen(true)}>查看导入记录</Button><Button disabled={!view.publication?.novelId} onClick={openWork}>打开作品</Button></footer></>
  else content = <ProgressScreen {...props} cancel={stop} />
  const pdfFile=pdfFileId ? view.files.find(file=>file.id===pdfFileId) : undefined
  const closePdf=()=>{const id=pdfFileId;setPdfFileId(null);requestAnimationFrame(()=>{if(id)document.querySelector<HTMLButtonElement>(`[data-pdf-review-file-id="${CSS.escape(id)}"]`)?.focus()})}
  const step = ['source', 'consent', 'recognizing', 'preview', 'chapters'].includes(screen) ? 0 : ['select', 'confirm'].includes(screen) ? 1 : 2
  return <><Dialog open={open && !suspended && !recordOpen && !pdfFile} onOpenChange={value => { if (!value) close() }}><DialogContent className="ni-dialog chatpane" showCloseButton={false} finalFocus={() => novelImportFinalFocus() ?? true}><header className="ni-header"><div><div className="ni-eyebrow">导入作品</div>{wizard ? <NovelImportWizardHeader step={wizard.step} /> : wizardConflicts ? <><DialogTitle>处理校验中的矛盾</DialogTitle><DialogDescription>逐处选择处理方式；处理完后回到校验，可以直接保存作品。</DialogDescription></> : <><DialogTitle>{screenTitles[screen] ?? '导入作品'}</DialogTitle><DialogDescription>核对来源、选择内容，再确认导入。</DialogDescription></>}</div><Button variant="ghost" size="icon-sm" aria-label={abandonableImport(view) ? '关闭导入窗口' : '收起导入窗口'} onClick={close}><X /></Button></header>{!wizard && !wizardConflicts && <ol className="ni-stage-list" aria-label="导入步骤">{['核对来源', '选择内容', '导入'].map((label, index) => <li key={label} aria-current={step === index ? 'step' : undefined} data-done={step > index}><span>{index + 1}</span>{label}</li>)}</ol>}{(error || view.error) && <div className="ni-alert" role="alert">{error || view.error}</div>}{content}</DialogContent><Dialog open={closeConfirmOpen && open && !suspended && !recordOpen && !pdfFile} onOpenChange={value => { if (!value) dismissCloseConfirmation() }}><DialogContent className="ni-close-confirm" showCloseButton={false}><DialogHeader>{savingStarted ? <><DialogTitle>停止并删除这次导入？</DialogTitle><DialogDescription>作品尚未保存完成。删除后，导入进度和目标目录中未完成的文件都会删除，且无法恢复；原始文件不会更改。{view.phase === 'publishing' && '当前保存结束后才会删除。'}</DialogDescription></> : <><DialogTitle>关闭导入？</DialogTitle><DialogDescription>当前导入尚未完成，已导入的内容会被删除，且无法恢复。原始文件不会更改。确定要关闭吗？</DialogDescription></>}</DialogHeader><DialogFooter>{waitingForSave ? <Button variant="outline" onClick={dismissCloseConfirmation}>收起</Button> : <Button variant="outline" disabled={closeConfirmBusy} onClick={dismissCloseConfirmation}>继续导入</Button>}<Button variant="destructive" disabled={closeConfirmBusy} onClick={() => void confirmClose()}>{waitingForSave ? '正在等待保存结束…' : savingStarted ? '停止并删除' : '确认关闭并删除'}</Button></DialogFooter></DialogContent></Dialog></Dialog>{open && !suspended && pdfFile && <PdfPageReview key={`${view.id}:${pdfFile.id}`} view={view} file={pdfFile} onClose={closePdf}/>} {view.publication?.novelId && recordOpen && <NovelImportRecord novelId={view.publication.novelId} open={recordOpen} onOpenChange={setRecordOpen} hideTrigger />}</>
}

const REVISE_STEPS:WizardStep[]=['files','work','kinds','tree','detect-char','detect-scene','detect-item','detect-world']
/** Back to an earlier choice: lists reachable steps and the range of results that will be dropped. */
function ReviseDialog({ view, busy, onClose }: { view: ImportView; busy: boolean; onClose(): void }) {
  const current = WIZARD_STEPS.indexOf(view.wizard!.step), options = REVISE_STEPS.filter(step => WIZARD_STEPS.indexOf(step) < current && view.wizard!.stepState[step] !== 'skipped').reverse()
  const [to, setTo] = useState<WizardStep | undefined>(options[0])
  const range = (step: WizardStep) => { const from = WIZARD_STEPS.indexOf(step) + 2, end = current + 1; return from === end ? `第 ${end} 步` : `第 ${from}–${end} 步` }
  return <><div className="ni-body"><h3>返回修改选择</h3><p>选择要回到的步骤。该步骤之后的导入结果将被丢弃，确认后重新导入；之前已完成的步骤保留。</p>
    <fieldset className="ni-decisions">{options.map(step => <label key={step}><input type="radio" name="ni-revise" checked={to === step} onChange={() => setTo(step)} /><span><strong>第 {WIZARD_STEPS.indexOf(step) + 1} 步 · {WIZARD_STEP_TITLES[step]}</strong><small>{step === 'work' ? '只修改作品名称与目录' : `将丢弃${range(step)}的结果`}</small></span></label>)}</fieldset></div>
    <footer className="ni-footer"><Button variant="outline" onClick={onClose}>取消</Button><Button disabled={busy || !to} onClick={async () => { if (to && await mutateNovelImport({ type: 'wizard-revise', to } as never)) onClose() }}>丢弃后续结果并返回</Button></footer></>
}
