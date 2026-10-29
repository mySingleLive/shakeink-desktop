"use client"

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { IMPORT_LABELS, type ImportKind, type ImportPdfPageReviewAudit } from '@desktop/shared/novel-import'
import './novel-import.css'
import './novel-import-pdf-pages.css'

interface Material { id: string; kind: string; name: string; origin: string; characters: number }
interface RecordResponse {
  record: null | { id: string; title: string; createdAt: string; sourceKinds: string[]; targets: string[]; modified: boolean; summary: Record<string, number>; materials: Material[]; decisions: { choice?: string; explanation?: string; conflictId?: string }[]; pdfPageReview?:{schemaVersion:1;files:Omit<ImportPdfPageReviewAudit['files'][number],'proof'>[]} }
  page?: { text: string; offset: number; total: number }
}
async function readRecord(novelId: string, material?: string, offset = 0): Promise<RecordResponse> {
  const query = material ? `?${new URLSearchParams({ material, offset: String(offset), limit: '32768' })}` : ''
  const response = await fetch(`/api/novels/${encodeURIComponent(novelId)}/import-record${query}`)
  if (!response.ok) throw new Error('导入记录读取失败，请重试。')
  return response.json()
}
interface Props { novelId: string; outlineOnly?: boolean; open?: boolean; onOpenChange?: (open: boolean) => void; hideTrigger?: boolean }

/** A read-only provenance dialog inside existing overview/outline panels. */
export function NovelImportRecord({ novelId, outlineOnly = false, open: controlledOpen, onOpenChange, hideTrigger = false }: Props) {
  return <NovelImportRecordContent key={`${novelId}:${outlineOnly}`} novelId={novelId} outlineOnly={outlineOnly} open={controlledOpen} onOpenChange={onOpenChange} hideTrigger={hideTrigger} />
}
function NovelImportRecordContent({ novelId, outlineOnly = false, open: controlledOpen, onOpenChange, hideTrigger = false }: Props) {
  const [localOpen, setLocalOpen] = useState(false)
  const [material, setMaterial] = useState<Material | null>(null)
  const [offset, setOffset] = useState(0)
  const open = controlledOpen ?? localOpen
  const changeOpen = (value: boolean) => { setLocalOpen(value); onOpenChange?.(value) }
  const metadata = useQuery({ queryKey: ['novel-import-record', novelId], queryFn: () => readRecord(novelId), enabled: !!novelId })
  const page = useQuery({ queryKey: ['novel-import-material', novelId, material?.id, offset], queryFn: () => readRecord(novelId, material!.id, offset), enabled: open && !!material })
  const record = metadata.data?.record
  if (!record && !open) return null
  const materials = record?.materials.filter(item => !outlineOnly || item.kind === 'outline') ?? []
  return <>
    {!hideTrigger && record && <Button variant="ghost" className="ni-record-trigger" onClick={() => changeOpen(true)}>{outlineOnly ? '查看原始大纲' : '查看导入记录'}</Button>}
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="ni-dialog ni-record chatpane" showCloseButton={false}>
        <header className="ni-header"><div><DialogTitle>导入记录{outlineOnly ? ' · 原始大纲' : ''}</DialogTitle><DialogDescription>保留原始材料、推断来源与用户决定，供核对追溯。</DialogDescription></div><Button variant="ghost" aria-label="关闭导入记录" onClick={() => changeOpen(false)}>关闭</Button></header>
        <div className="ni-body">
          {metadata.isPending && <p role="status">正在读取导入记录…</p>}
          {metadata.error && <div role="alert">{metadata.error.message}<Button onClick={() => void metadata.refetch()}>重试</Button></div>}
          {record && <>
            <div className="ni-notice"><strong>{record.title}</strong><p>导入时间：{record.createdAt} · {record.modified ? '正文导入副本包含已确认的修改' : '正文按原始材料导入'}</p></div>
            {material ? <>
              <div className="ni-row"><h3>{material.name}</h3><Button variant="outline" onClick={() => { setMaterial(null); setOffset(0) }}>返回材料列表</Button></div>
              {page.isPending && <p role="status">正在读取完整材料…</p>}
              {page.error && <div role="alert">{page.error.message}<Button onClick={() => void page.refetch()}>重试</Button></div>}
              {page.data?.page && <><pre className="ni-source-text" tabIndex={0}>{page.data.page.text}</pre><div className="ni-row ni-pagination"><span>{page.data.page.offset + 1}–{Math.min(page.data.page.offset + page.data.page.text.length, page.data.page.total)} / {page.data.page.total} 字符</span><Button variant="outline" disabled={page.data.page.offset === 0} onClick={() => setOffset(Math.max(0, page.data!.page!.offset - 32768))}>上一页</Button><Button variant="outline" disabled={page.data.page.offset + page.data.page.text.length >= page.data.page.total} onClick={() => setOffset(page.data!.page!.offset + page.data!.page!.text.length)}>下一页</Button></div></>}
            </> : <>
              <h3>原始材料</h3>
              <div className="ni-materials">{materials.map(item => <button key={item.id} type="button" aria-label={item.name} onClick={() => { setMaterial(item); setOffset(0) }}><strong>{item.name}</strong><span>{IMPORT_LABELS[item.kind as ImportKind] ?? item.kind} · {item.origin === 'source' ? '文件原文' : item.origin === 'inferred' ? '根据正文推断' : '用户确认'} · {item.characters} 字符</span></button>)}</div>
              {!materials.length && <p>本次导入没有保留的{outlineOnly ? '原始大纲' : '材料'}。</p>}
              {!outlineOnly && record.sourceKinds.includes('body') && <Button variant="outline" onClick={() => { setMaterial({ id: 'body-original', kind: 'body', name: '最初导入的正文', origin: 'source', characters: 0 }); setOffset(0) }}>查看最初导入的正文</Button>}
              {!outlineOnly && <><h3>用户决定</h3>{record.decisions.length ? <ul>{record.decisions.map((decision, index) => <li key={decision.conflictId ?? index}>{decision.choice}{decision.explanation && `：${decision.explanation}`}</li>)}</ul> : <p>本次导入没有需要用户决策的冲突。</p>}</>}
              {!outlineOnly && !!record.pdfPageReview?.files.length && <section aria-label="PDF 图像页决定"><h3>PDF 图像页决定</h3>{record.pdfPageReview.files.map(file=><div key={file.fileId} className="ni-pdf-audit-file"><strong>{file.name}</strong><p>{file.pageCount} 页 · 来源 SHA-256：<code title={file.sourceHash}>{file.sourceHash.slice(0,16)}</code></p><p>{file.note}</p><details><summary>逐页文字与图像决定</summary><ul>{file.pages.map(page=><li key={page.page}>第 {page.page} 页 · 保留 {page.textCharacters} 字符 · 文字 SHA-256：<code title={page.textHash}>{page.textHash.slice(0,16)}</code>{page.raster==='present'?page.decision==='exclude-image'?` · 已确认排除图像${page.confirmedAt?' · '+page.confirmedAt:''}`:' · 图像待核对':page.raster==='none'?' · 无栅格图像':' · 图像状态未确认'}</li>)}</ul></details><details><summary>确认与撤销记录</summary><ul>{file.events.map((event,index)=><li key={`${event.page}:${event.decisionRevision}:${index}`}>第 {event.page} 页 · {event.action==='confirm'?'确认排除图像':event.action==='revoke'?'撤销确认':event.action==='contains-content'?'图像含正文或设定':event.action==='uncertain'?'无法确定':'来源变化，旧确认失效'} · {event.at}</li>)}</ul></details></div>)}</section>}
            </>}
          </>}
          {!metadata.isPending && !metadata.error && !record && <p>该作品没有导入记录。</p>}
        </div>
      </DialogContent>
    </Dialog>
  </>
}
