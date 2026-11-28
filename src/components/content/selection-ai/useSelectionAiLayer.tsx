"use client"
/**
 * docs/612 §4.5: wires the selection AI state machine into the chapter editor — toolbar/request box placement,
 * the bottom panel, replace / undo commits, Escape ownership, Cmd/Ctrl+Z undo in Monaco, comment hand-off.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import type { editor as MonacoEditor } from "monaco-editor"
import { useChatStore } from "@/stores/chat"
import { useChatModels } from "@/components/chat/use-chat-models"
import { useDesktopCommands } from "@/lib/desktop/use-command-target"
import { registerSelectionAiEscape } from "@/lib/desktop/selection-ai-escape"
import { setMonacoUndoOverride } from "@/lib/desktop/monaco-commands"
import { useDesktopStore } from "@/stores/desktop"
import { desktopCommandCatalog } from "@/lib/desktop/command-runtime"
import { bindingsFor } from "@desktop/core/shortcuts"
import { browserTextHash } from "@/lib/text-baseline"
import { actionInfo, applyReplacement, overLimit, toolbarPlacement, type SelectionAiAction } from "@/lib/selection-ai"
import type { SelectionActions, SelectionAnchor } from "@/components/editor/MarkdownEditor"
import type { SelectionCommentBridge } from "@/components/comments/selection-comment-bridge"
import type { ContentReceipt } from "@/lib/services/content-commit"
import { SelectionToolbar } from "./SelectionToolbar"
import { SelectionRequestBox, type RequestModel } from "./SelectionRequestBox"
import { SelectionAiPanel, SelectionUndoBar } from "./SelectionAiPanel"
import { postSelection, useSelectionAi, type CommitResult } from "./use-selection-ai"

const NO_MODEL = "请先在 设置 → 模型 中添加模型"
const TOO_LONG = "选中文字超过 1 万字，请缩小范围"

export interface SelectionAiHost {
  novelId: string
  chapterId: string
  /** Whole-chapter generation or another blocking state. */
  disabled: boolean
  /** Saves pending input; resolves with the saved version and text. */
  flush(): Promise<{ version: number; content: string }>
  liveText(): string
  /** Pause autosave around a server commit and apply the receipt (ChapterContentPanel.receiveCommit). */
  beforeCommit(): { expectedVersion: number; localRevision: number; content: string }
  applyCommit(receipt: ContentReceipt, content: string, boundary: { expectedVersion: number; localRevision: number; content: string }): void
  commitFailed(): void
  /** Autosave revision counter; changes on every local edit. */
  revision(): number
  /** Called with history entries created by a replace/undo (for the version history fresh-row hint). */
  onHistory(versions: number[]): void
}

export function useSelectionAiLayer(host: SelectionAiHost) {
  const hostRef = useRef(host); hostRef.current = host
  const monacoRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null)
  const decorations = useRef<MonacoEditor.IEditorDecorationsCollection | null>(null)
  /* preview-only offset tracking: shift the task range by edits outside it (Monaco decorations do this themselves) */
  const previewRange = useRef<{ start: number; end: number } | null>(null)
  const lastText = useRef<string | null>(null)
  const [editorEpoch, setEditorEpoch] = useState(0)
  const ai = useSelectionAi({
    novelId: host.novelId, chapterId: host.chapterId,
    flush: () => hostRef.current.flush(),
    liveText: () => hostRef.current.liveText(),
    trackedRange: () => trackedRange(),
    hash: browserTextHash,
  })
  const { state } = ai
  const [composers, setComposers] = useState({ edit: false, preview: false })
  const composerOpen = composers.edit || composers.preview
  const [replacing, setReplacing] = useState(false)
  const [undoable, setUndoable] = useState<{ operationId: string; version: number; action: SelectionAiAction; revision: number } | null>(null)
  const [tick, setTick] = useState(0)
  const toolbarRef = useRef<HTMLDivElement>(null), requestRef = useRef<HTMLDivElement>(null), panelRef = useRef<HTMLDivElement>(null)
  const mentionOpen = useRef(false)
  const rootRef = useRef<HTMLElement | null>(null)

  /* model: default to the chat's current choice; this request only */
  const chatChoice = useChatStore(s => s.modelChoice)
  const { data: models } = useChatModels()
  const [model, setModel] = useState<RequestModel>({ modelId: chatChoice.modelId, effort: chatChoice.effort })
  useEffect(() => { if (state.phase === "idle") setModel({ modelId: chatChoice.modelId, effort: chatChoice.effort }) }, [chatChoice.modelId, chatChoice.effort, state.phase])
  // A failed or malformed /api/models response must never break the manuscript panel.
  const modelList = Array.isArray(models?.models) ? models.models : []
  const usableModel = modelList.find(m => m.id === model.modelId) ?? null
  const hasModel = modelList.length > 0
  const quote = state.anchor?.snapshot.quote ?? ""
  const blockedReason = !hasModel || !usableModel ? NO_MODEL : overLimit(quote) ? TOO_LONG : null

  /* processing range tracked through edits elsewhere: Monaco decoration when available, else the task offsets */
  const processing = ["queued", "running", "stopped", "failed", "done", "conflict"].includes(state.phase)
  const trackedRange = () => {
    const task = ai.state.task
    if (!task) return null
    const model = monacoRef.current?.getModel(), range = decorations.current?.getRange(0)
    if (model && range) return { start: model.getOffsetAt(range.getStartPosition()), end: model.getOffsetAt(range.getEndPosition()) }
    return previewRange.current ?? { start: task.start, end: task.end }
  }
  useEffect(() => {
    const instance = monacoRef.current, model = instance?.getModel(), task = state.task
    decorations.current?.clear(); decorations.current = null
    if (!instance || !model || !task || !processing) return
    const seed = previewRange.current ?? { start: task.start, end: task.end }
    const a = model.getPositionAt(seed.start), b = model.getPositionAt(seed.end)
    decorations.current = instance.createDecorationsCollection([{ range: { startLineNumber: a.lineNumber, startColumn: a.column, endLineNumber: b.lineNumber, endColumn: b.column }, options: { inlineClassName: "selection-ai-range", stickiness: 1 } }])
    return () => { decorations.current?.clear(); decorations.current = null }
    // Created once per task (and editor). Edits elsewhere move the decoration; re-creating it on every edit (tick)
    // would snap it back to the original offsets (code review blocker 1).
  }, [processing, state.task?.start, state.task?.end, state.task?.quote, editorEpoch]) // eslint-disable-line react-hooks/exhaustive-deps

  /* close conditions (product §2.4) and disabled states (§2.1) */
  useEffect(() => { if ((host.disabled || composerOpen) && (state.phase === "toolbar" || state.phase === "ask")) ai.close() }, [host.disabled, composerOpen]) // eslint-disable-line react-hooks/exhaustive-deps
  /* leaving the chapter (unmount) aborts; handled by useSelectionAi cleanup */
  /* a press outside the toolbar/request box (and their menus) closes them; a new drag reopens on mouseup (product §2.4, §3) */
  useEffect(() => {
    if (state.phase !== "toolbar" && state.phase !== "ask") return
    const down = (event: MouseEvent) => {
      const target = event.target as Element | null
      if (target?.closest('[data-selection-ai-layer],[role="menu"],[data-slot="dropdown-menu-content"],[data-testid="mention-popup"]')) return
      ai.close()
    }
    document.addEventListener("mousedown", down, true)
    return () => document.removeEventListener("mousedown", down, true)
  }, [state.phase, ai])
  /* the request box scrolls the manuscript at most once per opening (plan §4.4) */
  const scrolledFor = useRef<object | null>(null)

  /* undo bar: 10 s, or until the author edits */
  useEffect(() => {
    if (!undoable) return
    const timer = setTimeout(() => setUndoable(null), 10000)
    return () => clearTimeout(timer)
  }, [undoable])
  const undoContext = useRef<MonacoEditor.IContextKey<boolean> | null>(null)
  /* The default Cmd/Ctrl+Z hook applies only while text.undo is still bound to it (rebinding is honoured by the
   * desktop command path through setMonacoUndoOverride). */
  const defaultUndoBound = () => {
    const boot = useDesktopStore.getState().bootstrap
    if (!boot) return true
    const command = desktopCommandCatalog(boot.platform).find(c => c.id === "text.undo")
    const keys = command ? bindingsFor(command, boot.settings.shortcuts[boot.platform] ?? {}) : []
    return keys.some(k => /^(Cmd|Ctrl)\+Z$/i.test(k))
  }
  useEffect(() => { undoContext.current?.set(!!undoable && defaultUndoBound()) }, [undoable])

  const bridge = useMemo<SelectionCommentBridge>(() => ({ openers: {}, hideSelectionButton: true,
    onComposerChange: (view, open) => setComposers(c => c[view] === open ? c : { ...c, [view]: open }) }), [])

  /* ---- actions ---- */
  const run = useCallback((action: SelectionAiAction, requirement = "") => {
    if (blockedReason) { toast.error(blockedReason); return }
    setUndoable(null)
    void ai.start(action, { modelId: model.modelId!, effort: model.effort }, requirement).catch(error => toast.error(error instanceof Error ? error.message : "无法开始 AI 修改"))
  }, [ai, blockedReason, model])

  const replacingRef = useRef(false)
  const replace = useCallback(async () => {
    const task = ai.state.task
    if (!task || replacingRef.current) return
    replacingRef.current = true; setReplacing(true)
    try {
      await hostRef.current.flush()
      const text = hostRef.current.liveText()
      const range = trackedRange() ?? { start: task.start, end: task.end }
      if (text.slice(range.start, range.end) !== task.quote) { ai.update({ phase: "conflict" }); return }
      const boundary = hostRef.current.beforeCommit()
      const replacement = ai.replacementText()
      const operationId = crypto.randomUUID()
      let result: CommitResult
      try {
        result = await postSelection<CommitResult>(`/api/novels/${task && hostRef.current.novelId}/chapters/${hostRef.current.chapterId}/selection-ai/commit`, {
          action: task.action, start: range.start, end: range.end, quote: task.quote, replacement,
          expectedVersion: boundary.expectedVersion, expectedContentHash: await browserTextHash(text), operationId })
      } catch (error) {
        const code = (error as { code?: string }).code
        if (code === "SELECTION_CHANGED" || code === "VERSION_CONFLICT" || code === "CONTENT_HASH_CONFLICT") { if (ai.state.task) ai.update({ phase: "conflict" }); hostRef.current.commitFailed(); return }
        hostRef.current.commitFailed(); throw error
      }
      hostRef.current.applyCommit(result.receipt, result.content, boundary)
      hostRef.current.onHistory([result.receipt.version - 1, result.receipt.version])
      const at = range.start, len = replacement.length
      ai.close()
      // flash the new text once and bring it into view; arm undo after the receipt is applied (review N5)
      requestAnimationFrame(() => {
        flash(at, at + len)
        setUndoable({ operationId, version: result.receipt.version, action: task.action, revision: hostRef.current.revision() })
      })
    } catch (error) { toast.error(error instanceof Error ? error.message : "替换失败，请重试") }
    finally { replacingRef.current = false; setReplacing(false) }
  }, [ai]) // eslint-disable-line react-hooks/exhaustive-deps

  const undo = useCallback(async () => {
    const target = undoable
    if (!target) return
    setUndoable(null)
    let paused = false
    try {
      await hostRef.current.flush()
      const boundary = hostRef.current.beforeCommit(); paused = true
      const result = await postSelection<CommitResult>(`/api/novels/${hostRef.current.novelId}/chapters/${hostRef.current.chapterId}/selection-ai/undo`, { replacementOperationId: target.operationId, expectedVersion: boundary.expectedVersion, operationId: crypto.randomUUID() })
      paused = false
      hostRef.current.applyCommit(result.receipt, result.content, boundary)
      hostRef.current.onHistory([result.receipt.version])
      toast.success("已撤销")
    } catch (error) {
      // Resume only the pause this undo took; a pause owned by a conflict or comparison stays (code review 2).
      if (paused) hostRef.current.commitFailed()
      toast.error(error instanceof Error ? error.message : "撤销失败")
    }
  }, [undoable])
  const undoRef = useRef(undo); undoRef.current = undo

  /* an edit after the replacement ends the undo offer (product §6.2) */
  const onEdited = useCallback(() => {
    setUndoable(u => u && hostRef.current.revision() !== u.revision ? null : u)
    // Move the text-diff tracker by the edit's common prefix/suffix; Monaco's decoration (when mounted) is preferred.
    const text = hostRef.current.liveText(), before = lastText.current, range = previewRange.current
    // Always tracked (also while Monaco is mounted) so a later view switch, which drops the decoration, keeps the range.
    if (range && before !== null) {
      let a = 0; while (a < before.length && a < text.length && before[a] === text[a]) a++
      let b = 0; while (b < before.length - a && b < text.length - a && before[before.length - 1 - b] === text[text.length - 1 - b]) b++
      const delta = text.length - before.length, editEnd = before.length - b
      if (editEnd <= range.start) previewRange.current = { start: range.start + delta, end: range.end + delta }
      else if (a >= range.end) { /* after the selection: unchanged */ }
      else previewRange.current = { start: range.start, end: Math.max(range.start, range.end + delta) }
    }
    lastText.current = text
    ai.checkChanged()
    setTick(t => t + 1)
  }, [ai])
  /* reset preview tracking when a task starts or ends */
  useEffect(() => {
    if (processing && state.task) { previewRange.current = { start: state.task.start, end: state.task.end }; lastText.current = hostRef.current.liveText() }
    else { previewRange.current = null; lastText.current = null }
  }, [processing, state.task?.start, state.task?.end]) // eslint-disable-line react-hooks/exhaustive-deps

  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [flashRange, setFlashRange] = useState<{ start: number; end: number } | null>(null)
  const flash = (start: number, end: number) => {
    setFlashRange({ start, end })
    const instance = monacoRef.current, model = instance?.getModel()
    let collection: MonacoEditor.IEditorDecorationsCollection | null = null
    if (instance && model) {
      const a = model.getPositionAt(start), b = model.getPositionAt(end)
      const range = { startLineNumber: a.lineNumber, startColumn: a.column, endLineNumber: b.lineNumber, endColumn: b.column }
      collection = instance.createDecorationsCollection([{ range, options: { inlineClassName: "selection-ai-flash" } }])
      instance.revealRangeInCenterIfOutsideViewport(range)
    } else requestAnimationFrame(() => rootRef.current?.querySelector("mark.selection-ai-flash")?.scrollIntoView({ block: "nearest" }))
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => { setFlashRange(null); collection?.clear() }, 1600)
  }

  /* ---- Escape owner (plan §4.7) ---- */
  const escapeLayer = useCallback(() => {
    const s = ai.state
    if (s.phase === "ask") { const anchor = s.anchor; ai.update({ phase: "toolbar" }); anchor?.reselect(); return }
    if (s.phase === "toolbar") {
      ai.close()
      if (s.anchor?.view === "edit") { const editor = monacoRef.current, sel = editor?.getSelection(); if (editor && sel) editor.setPosition(sel.getEndPosition()) }
      else window.getSelection()?.removeAllRanges()
    }
  }, [ai])
  useEffect(() => {
    if (state.phase !== "toolbar" && state.phase !== "ask") return
    return registerSelectionAiEscape({
      root: () => rootRef.current,
      wants: () => !mentionOpen.current,
      run: () => escapeLayer(),
    })
  }, [state.phase, escapeLayer])
  useDesktopCommands({ "selectionAi.escape": { enabled: () => (ai.state.phase === "toolbar" || ai.state.phase === "ask") && !mentionOpen.current, run: escapeLayer } }, rootRef as React.RefObject<HTMLElement | null>)

  /* ---- Monaco: undo right after a replacement undoes it on the server (plan §4.5, review N4) ----
   * - text.undo (any binding the author chose) and the native 编辑 → 撤销 menu go through the desktop Monaco command
   *   target, which asks setMonacoUndoOverride first;
   * - the untouched default Cmd/Ctrl+Z is resolved by Monaco itself, so a context-keyed addCommand covers it, registered
   *   once per editor instance (monaco 0.56 addCommand cannot be removed). */
  const undoArmed = useRef(false)
  useEffect(() => { undoArmed.current = !!undoable }, [undoable])
  const contextKeys = useRef(new WeakMap<object, MonacoEditor.IContextKey<boolean>>())
  const onEditor = useCallback((instance: MonacoEditor.IStandaloneCodeEditor | null) => {
    const previous = monacoRef.current
    if (previous && previous !== instance) setMonacoUndoOverride(previous, null)
    monacoRef.current = instance
    if (previous !== instance) setEditorEpoch(n => n + 1) // decorations follow the live editor (view switches)
    if (!instance) { undoContext.current = null; return }
    setMonacoUndoOverride(instance, () => undoArmed.current ? () => { void undoRef.current() } : null)
    const cached = contextKeys.current.get(instance)
    if (cached) { undoContext.current = cached; cached.set(undoArmed.current && defaultUndoBound()); return } // code review 5
    const key = instance.createContextKey("selectionAiUndoable", false)
    contextKeys.current.set(instance, key); undoContext.current = key
    void import("monaco-editor").then(monaco => {
      if (!contextKeys.current.has(instance)) return
      instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyZ, () => { void undoRef.current() }, "selectionAiUndoable")
    })
  }, [])

  /* ---- placement ---- */
  const [, force] = useState(0)
  const onViewportChange = useCallback(() => force(n => n + 1), [])
  const panelHost = (el: HTMLElement | null) => { rootRef.current = el?.closest(".desktop-markdown-editor") as HTMLElement | null }
  const place = (anchor: SelectionAnchor, size: { width: number; height: number }, allowScroll = false) => {
    const root = rootRef.current?.getBoundingClientRect(), view = anchor.viewport()
    if (!root || !view) return { display: "none" } as React.CSSProperties
    const once = allowScroll && scrolledFor.current !== anchor
    const p = toolbarPlacement(anchor.rects(), view, size, { allowScroll: once })
    if (once && requestRef.current) scrolledFor.current = anchor
    if (p.scrollBy) { anchor.scrollBy(p.scrollBy); requestAnimationFrame(onViewportChange) }
    return { top: p.top - root.top, left: p.left - root.left, visibility: p.hidden ? "hidden" : "visible" } as React.CSSProperties
  }
  const rootWidth = rootRef.current?.getBoundingClientRect().width ?? 1200
  const compact = rootWidth < 480
  const requestWidth = Math.min(560, rootWidth - 32)
  const requestHeight = requestRef.current?.offsetHeight ?? 380
  const toolbarWidth = toolbarRef.current?.offsetWidth ?? (compact ? 300 : 430)

  const layer = (
    <span ref={panelHost} className="contents">
      {state.phase === "toolbar" && state.anchor && !host.disabled && !composerOpen && (
        <SelectionToolbar toolbarRef={toolbarRef} style={place(state.anchor, { width: toolbarWidth, height: 34 })} compact={compact} blockedReason={blockedReason}
          canComment={!!bridge.openers[state.anchor.view]}
          onComment={() => { const anchor = state.anchor; if (anchor && bridge.openers[anchor.view]?.(anchor.snapshot)) ai.close() }}
          onAsk={() => ai.update({ phase: "ask" })}
          onRun={action => run(action)} />
      )}
      {state.phase === "ask" && state.anchor && (
        <SelectionRequestBox boxRef={requestRef} novelId={host.novelId} quote={quote} draft={state.draft} onDraft={draft => ai.update({ draft })}
          pick={state.pick} onPick={pick => ai.update({ pick })} model={model} onModel={setModel} hasModel={hasModel}
          blockedReason={blockedReason} mentionOpenRef={mentionOpen}
          style={{ ...place(state.anchor, { width: requestWidth, height: requestHeight }, true), width: requestWidth }}
          onRun={(action, requirement) => run(action, requirement)} onClose={() => ai.close()} />
      )}
      {processing && state.task && (
        <SelectionAiPanel panelRef={panelRef} state={state} replacing={replacing}
          onStop={ai.stop} onResume={ai.resume} onRetry={ai.retry} onDiscard={() => ai.close()} onReplace={() => void replace()}
          onCopy={() => { const text = ai.replacementText(); void (window.desktop ? window.desktop.writeClipboardText(text) : navigator.clipboard.writeText(text)).then(() => toast.success("已复制结果"), () => toast.error("复制失败")) }} />
      )}
      {undoable && !processing && <SelectionUndoBar action={actionInfo(undoable.action).name} onUndo={() => void undo()} onClose={() => setUndoable(null)} />}
    </span>
  )

  const marks = useMemo(() => {
    const list: { start: number; end: number; className?: string }[] = []
    if (processing && state.task) list.push(trackedRange() ?? { start: state.task.start, end: state.task.end })
    if (flashRange) list.push({ ...flashRange, className: "selection-ai-flash" })
    return list
  }, [processing, state.task, tick, flashRange]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectionActions: SelectionActions = {
    active: !host.disabled,
    onSelection: anchor => { if (!host.disabled && !composerOpen) ai.onSelection(anchor); else if (!anchor) ai.onSelection(null) },
    layer, bridge, marks, onViewportChange, onEditor,
  }
  const panelOffset = processing ? (state.phase === "done" || state.phase === "conflict" ? 314 : 214) : undoable ? 92 : 0
  return { selectionActions, onEdited, busy: processing, panelOffset, flashRange, replaceText: applyReplacement }
}
