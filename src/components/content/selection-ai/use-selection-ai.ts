"use client"
/** docs/612 §4.5: selection AI state machine for one chapter editor. */
import { useCallback, useEffect, useRef, useState } from "react"
import { readSSE } from "@/lib/sse"
import { DEFAULT_PICK, resultText, selectionStillMatches, type SelectionAiAction } from "@/lib/selection-ai"
import type { SelectionAnchor } from "@/components/editor/MarkdownEditor"
import type { ContentReceipt } from "@/lib/services/content-commit"

export type SelectionAiPhase = "idle" | "toolbar" | "ask" | "queued" | "running" | "stopped" | "failed" | "done" | "conflict"

export interface SelectionTask {
  action: SelectionAiAction
  requirement: string
  modelId: string
  effort: string | null
  /** Source range and text the task was started from. */
  start: number; end: number; quote: string
  baseVersion: number; baseHash: string
  attempt: number
}
export interface SelectionAiState {
  phase: SelectionAiPhase
  anchor: SelectionAnchor | null
  /** Request box draft and current pick survive closing for the same selection. */
  draft: string
  pick: SelectionAiAction
  task: SelectionTask | null
  output: string
  thinking: string
  thinkingStartedAt: number | null
  thinkingSeconds: number | null
  error: string | null
  /** The selected source text was edited while processing. */
  changed: boolean
}
export interface SelectionReplacement { operationId: string; version: number; action: SelectionAiAction; at: number }

const initial: SelectionAiState = { phase: "idle", anchor: null, draft: "", pick: DEFAULT_PICK, task: null, output: "", thinking: "", thinkingStartedAt: null, thinkingSeconds: null, error: null, changed: false }
const sameRange = (a: SelectionAnchor | null, b: SelectionAnchor | null) => !!a && !!b && a.snapshot.startOffset === b.snapshot.startOffset && a.snapshot.endOffset === b.snapshot.endOffset

export function useSelectionAi(options: {
  novelId: string
  chapterId: string
  /** Saves pending input; resolves with the saved version and the current text. */
  flush(): Promise<{ version: number; content: string }>
  /** Latest live text for offset tracking and change detection. */
  liveText(): string
  /** Current tracked range of the processing highlight (moves with edits elsewhere). */
  trackedRange(): { start: number; end: number } | null
  hash(text: string): Promise<string>
}) {
  const [state, setState] = useState<SelectionAiState>(initial)
  const stateRef = useRef(state); stateRef.current = state
  const abortRef = useRef<AbortController | null>(null)
  const opts = useRef(options); opts.current = options
  useEffect(() => () => abortRef.current?.abort(), [])

  const update = useCallback((patch: Partial<SelectionAiState> | ((s: SelectionAiState) => Partial<SelectionAiState>)) =>
    setState(s => ({ ...s, ...(typeof patch === "function" ? patch(s) : patch) })), [])

  /** A settled selection from the editor (null when it collapses). */
  const onSelection = useCallback((anchor: SelectionAnchor | null) => {
    const s = stateRef.current
    if (["queued", "running", "stopped", "failed", "done", "conflict"].includes(s.phase)) return
    if (!anchor) { if (s.phase === "toolbar") update({ phase: "idle", anchor: null }); return }
    const keep = sameRange(anchor, s.anchor)
    update({ phase: "toolbar", anchor, ...(keep ? {} : { draft: "", pick: DEFAULT_PICK }) })
  }, [update])

  const close = useCallback(() => { abortRef.current?.abort(); abortRef.current = null; setState(s => ({ ...initial, draft: s.draft, pick: s.pick, anchor: null })) }, [])

  const stream = useCallback(async (task: SelectionTask, continuation: string) => {
    abortRef.current?.abort()
    const abort = new AbortController(); abortRef.current = abort
    update({ phase: "queued", task, error: null, ...(continuation ? {} : { output: "", thinking: "", thinkingStartedAt: null, thinkingSeconds: null }) })
    let output = continuation, finish: string | null = null
    try {
      const res = await fetch(`/api/novels/${opts.current.novelId}/chapters/${opts.current.chapterId}/selection-ai`, {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: abort.signal,
        body: JSON.stringify({ action: task.action, start: task.start, end: task.end, quote: task.quote, baseVersion: task.baseVersion, baseHash: task.baseHash,
          requirement: task.requirement || undefined, modelId: task.modelId, thinkingEffort: task.effort, ...(continuation ? { continuation } : {}) }),
      })
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(data?.error ?? "生成失败，请稍后重试")
      }
      for await (const event of readSSE(res.body)) {
        if (abort.signal.aborted) return
        const data = (event.data ?? {}) as { delta?: string; finishReason?: string; message?: string }
        if (event.type === "queued") update({ phase: "queued" })
        else if (event.type === "reasoning-delta") update(s => ({ phase: "running", thinking: s.thinking + (data.delta ?? ""), thinkingStartedAt: s.thinkingStartedAt ?? Date.now() }))
        else if (event.type === "text-delta") { output += data.delta ?? ""; const text = output; update(s => ({ phase: "running", output: text, thinkingSeconds: s.thinkingStartedAt && s.thinkingSeconds === null ? Math.max(1, Math.round((Date.now() - s.thinkingStartedAt) / 1000)) : s.thinkingSeconds })) }
        else if (event.type === "done") finish = data.finishReason ?? "unknown"
        else if (event.type === "error") throw new Error(data.message ?? "生成失败，请稍后重试")
      }
      if (abort.signal.aborted) return
      if (finish === "stop" && output.trim()) update({ phase: "done" })
      else update({ phase: "failed", error: finish === "length" ? "输出达到长度上限，未完整结束" : output.trim() ? "生成未正常结束" : "没有收到生成内容" })
    } catch (error) {
      if (abort.signal.aborted) return
      update({ phase: "failed", error: error instanceof Error ? error.message : "生成失败，请稍后重试" })
    } finally { if (abortRef.current === abort) abortRef.current = null }
  }, [update])

  /** Starts a function from the toolbar, menu or request box. */
  const start = useCallback(async (action: SelectionAiAction, model: { modelId: string; effort: string | null }, requirement: string) => {
    const anchor = stateRef.current.anchor
    if (!anchor) return
    const { version, content } = await opts.current.flush()
    if (stateRef.current.anchor !== anchor) return // closed or reselected while saving (code review)
    const { startOffset: start, endOffset: end, quote } = anchor.snapshot
    if (!selectionStillMatches(content, start, end, quote)) { update({ phase: "idle", anchor: null }); throw new Error("正文已变化，请重新框选") }
    const task: SelectionTask = { action, requirement, modelId: model.modelId, effort: model.effort, start, end, quote, baseVersion: version, baseHash: await opts.current.hash(content), attempt: 1 }
    update({ changed: false, pick: action })
    await stream(task, "")
  }, [stream, update])

  const stop = useCallback(() => { abortRef.current?.abort(); abortRef.current = null; update({ phase: "stopped" }) }, [update])
  const resume = useCallback(() => { const s = stateRef.current; if (s.task) void stream(s.task, s.output) }, [stream])
  const retry = useCallback(() => { const s = stateRef.current; if (s.task) void stream({ ...s.task, attempt: s.task.attempt + 1 }, "") }, [stream])

  /** Re-check whether the selected source text is still intact (called on every editor change). */
  const checkChanged = useCallback(() => {
    const s = stateRef.current
    if (!s.task || !["queued", "running", "stopped", "failed", "done"].includes(s.phase)) return
    const range = opts.current.trackedRange() ?? { start: s.task.start, end: s.task.end }
    const intact = selectionStillMatches(opts.current.liveText(), range.start, range.end, s.task.quote)
    if (intact === s.changed) update({ changed: !intact })
  }, [update])

  /** Text written in place of the selection on 替换. */
  const replacementText = () => { const s = stateRef.current; return s.task ? resultText(s.task.action, s.task.quote, s.output) : "" }

  return { state, update, onSelection, close, start, stop, resume, retry, checkChanged, replacementText }
}

export type SelectionAiController = ReturnType<typeof useSelectionAi>

/** POST helpers (plain fetch: these endpoints must never be staged). */
export async function postSelection<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => null) as (T & { error?: string; code?: string }) | null
  if (!res.ok) { const error = new Error(data?.error ?? "操作失败") as Error & { code?: string; status?: number }; error.code = data?.code; error.status = res.status; throw error }
  return data as T
}
export type CommitResult = { receipt: ContentReceipt; content: string }
