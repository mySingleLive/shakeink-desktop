"use client"
/** docs/612 §4–§6: 处理框 / 结果框 / 冲突 / 撤销条, bottom-centred over the manuscript. Shows only AI output. */
import { useEffect, useRef, useState } from "react"
import { ChevronDown, ChevronRight, Loader2, Play, Square, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { countChineseWords } from "@/lib/text"
import { actionInfo } from "@/lib/selection-ai"
import type { SelectionAiState } from "./use-selection-ai"

function Paragraphs({ text, className }: { text: string; className?: string }) {
  return <>{text.split(/\n{2,}|\r\n\r\n/).filter(p => p.trim()).map((p, i) => <p key={i} className={className}>{p}</p>)}</>
}

export function SelectionAiPanel({ state, onStop, onResume, onDiscard, onRetry, onReplace, onCopy, replacing, panelRef }: {
  state: SelectionAiState
  onStop(): void; onResume(): void; onDiscard(): void; onRetry(): void; onReplace(): void; onCopy(): void
  replacing: boolean
  panelRef: React.RefObject<HTMLDivElement | null>
}) {
  const task = state.task!
  const info = actionInfo(task.action)
  const streamRef = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const [thinkOpen, setThinkOpen] = useState(false)
  const done = state.phase === "done" || state.phase === "conflict"
  const thinkingActive = (state.phase === "running" || state.phase === "queued") && !state.output && !!state.thinking
  useEffect(() => { setThinkOpen(thinkingActive) }, [thinkingActive])
  useEffect(() => { const el = streamRef.current; if (el && stick.current) el.scrollTop = el.scrollHeight }, [state.output, state.thinking, state.phase])

  const words = countChineseWords(state.output)
  const original = countChineseWords(task.quote)
  const after = task.action === "continue" ? original + words : words
  const attempt = task.attempt > 1 ? ` · 第 ${task.attempt} 次` : ""
  const unchanged = done && state.output.trim() === task.quote.trim()

  let status: React.ReactNode, actions: React.ReactNode
  if (state.phase === "queued" || state.phase === "running") {
    status = <span className="selection-ai-state" title={`修改要求：${task.requirement || "无"}`}><Loader2 className="size-3.5 animate-spin text-primary" aria-hidden="true" />
      {state.phase === "queued" && !state.output ? "等待中…" : `${info.name}中`}<small>{attempt} · 已生成 {words.toLocaleString()} 字</small>
      {state.changed && <em className="selection-ai-warn">选中原文已改动，完成后无法直接替换</em>}</span>
    actions = <button type="button" className="selection-ai-ibtn stop" title="停止" aria-label="停止" onClick={onStop}><Square className="size-3" fill="currentColor" strokeWidth={0} /></button>
  } else if (state.phase === "stopped" || state.phase === "failed") {
    status = state.phase === "failed"
      ? <span className="selection-ai-state error">{info.name}失败：{state.error ?? "生成失败"}<small> · 已生成 {words.toLocaleString()} 字</small></span>
      : <span className="selection-ai-state">已停止<small> · 已生成 {words.toLocaleString()} 字</small></span>
    actions = <>
      <button type="button" className="selection-ai-ibtn" title="继续" aria-label="继续" onClick={onResume}><Play className="size-3" fill="currentColor" strokeWidth={0} /></button>
      <button type="button" className="selection-ai-ibtn" title="放弃" aria-label="放弃" onClick={onDiscard}><X className="size-3.5" /></button>
    </>
  } else if (state.phase === "conflict") {
    status = <span className="selection-ai-state warn">正文在处理期间已改动，无法替换。结果已保留，可复制后手动修改</span>
    actions = <><button type="button" className="selection-ai-btn" onClick={onCopy}>复制结果</button><button type="button" className="selection-ai-btn" onClick={onDiscard}>放弃</button></>
  } else {
    status = state.changed
      ? <span className="selection-ai-state warn">{info.name}完成 · 选中原文已改动，无法直接替换</span>
      : unchanged ? <span className="selection-ai-state warn">{info.name}完成 · 生成结果与原文相同</span>
      : <span className="selection-ai-state"><span className="selection-ai-dot" aria-hidden="true" />{info.name}完成<small>{attempt} · 原文 {original.toLocaleString()} 字 → {after.toLocaleString()} 字</small></span>
    actions = <>
      <button type="button" className="selection-ai-btn" onClick={onDiscard}>放弃</button>
      <button type="button" className="selection-ai-btn" title="按相同功能和要求重新生成，替换当前结果" onClick={onRetry}>重试</button>
      {!unchanged && <button type="button" className="selection-ai-btn primary" disabled={replacing} onClick={onReplace}>{replacing ? "替换中…" : "替换"}</button>}
    </>
  }

  const thinkLabel = thinkingActive ? "思考中…" : state.thinkingSeconds ? `已思考 ${state.thinkingSeconds} 秒` : "思考过程"
  return (
    <div ref={panelRef} className={cn("selection-ai-float selection-ai-panel", done && "done")} role="region" aria-label={`AI ${info.name}`} data-selection-ai-layer="">
      <div ref={streamRef} className="selection-ai-stream" data-text-preview="" onScroll={e => { const el = e.currentTarget; stick.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 8 }}>
        {state.thinking && <div className="selection-ai-think">
          <button type="button" onClick={() => setThinkOpen(v => !v)} aria-expanded={thinkOpen}>{thinkOpen ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}{thinkLabel}</button>
          {thinkOpen && <div className="selection-ai-think-text">{state.thinking}</div>}
        </div>}
        {done && task.action === "continue" && <Paragraphs text={task.quote} className="orig" />}
        <Paragraphs text={state.output} />
        {(state.phase === "running" || state.phase === "queued") && <span className="selection-ai-caret" aria-hidden="true" />}
      </div>
      <div className="selection-ai-foot">{status}<span className="flex shrink-0 items-center gap-1.5">{actions}</span></div>
    </div>
  )
}

export function SelectionUndoBar({ action, onUndo, onClose }: { action: string; onUndo(): void; onClose(): void }) {
  return (
    <div className="selection-ai-float selection-ai-undo" role="status" data-selection-ai-layer="">
      <span>已替换为{action}结果</span>
      <button type="button" className="selection-ai-btn" onClick={onUndo}>撤销</button>
      <button type="button" className="selection-ai-x" title="关闭" aria-label="关闭" onClick={onClose}><X className="size-3.5" /></button>
    </div>
  )
}
