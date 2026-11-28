"use client"
/**
 * docs/612 §3: 修改要求输入框. A smaller AI composer: @ mentions, 「+」 insert, model/effort picker (this request only),
 * and the six functions below. No work picker, mode, send, attachments, # or /. Keys go through the desktop command
 * registry (selectionAi.* and ai.mention* on this root) so rebinding works.
 */
import { useEffect, useMemo, useRef, useState } from "react"
import { AtSign, Check, ChevronDown, Plus, Quote } from "lucide-react"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { countChineseWords } from "@/lib/text"
import { SELECTION_AI_ACTIONS, stepPick, type SelectionAiAction } from "@/lib/selection-ai"
import { useDesktopCommands } from "@/lib/desktop/use-command-target"
import { useDesktopStore } from "@/stores/desktop"
import { desktopCommandCatalog } from "@/lib/desktop/command-runtime"
import { bindingsFor } from "@desktop/core/shortcuts"
import { MentionItemVisual, MentionPopup, MENTION_GROUP_ICONS } from "@/components/chat/MentionPopup"
import { useMentionCandidates, type MentionItem } from "@/components/chat/use-mention-candidates"
import { editorToText, getCaretTextOffset, insertMentionChip, renderDraftIntoEditor, type ChipData } from "@/components/chat/composer-editor"
import { useChatModels } from "@/components/chat/use-chat-models"
import { ProviderLogo } from "@/components/chat/provider-logos"
import { ActionIcon } from "./icons"

const toChip = (item: MentionItem): ChipData => ({ insertText: item.insertText, label: item.name, groupLabel: item.groupLabel, kind: item.kind, avatarUrl: item.avatarUrl, settingType: item.settingType })
function mentionAt(text: string, caret: number) {
  const before = text.slice(0, caret), at = before.lastIndexOf("@")
  if (at < 0) return null
  const query = before.slice(at + 1)
  return /[\s@]/.test(query) ? null : { start: at, query }
}
function bindingLabel(binding: string, platform: "darwin" | "win32") {
  const names: Record<string, string> = platform === "darwin" ? { Cmd: "⌘", Alt: "⌥", Shift: "⇧", Ctrl: "⌃", ArrowUp: "↑", ArrowDown: "↓", Enter: "Enter" } : { ArrowUp: "↑", ArrowDown: "↓" }
  return binding.split("+").map(part => names[part] ?? part).join(platform === "darwin" ? "" : "+")
}

export interface RequestModel { modelId: string | null; effort: string | null }

export function SelectionRequestBox({ novelId, quote, draft, onDraft, pick, onPick, model, onModel, hasModel, blockedReason, onRun, onClose, mentionOpenRef, style, boxRef }: {
  novelId: string
  quote: string
  draft: string
  onDraft(text: string): void
  pick: SelectionAiAction
  onPick(action: SelectionAiAction): void
  model: RequestModel
  onModel(model: RequestModel): void
  hasModel: boolean
  /** Why functions cannot run (no model, too long); null when they can. */
  blockedReason: string | null
  onRun(action: SelectionAiAction, requirement: string): void
  onClose(): void
  /** Lets the Escape owner know whether the @ popup is open. */
  mentionOpenRef: { current: boolean }
  style: React.CSSProperties
  boxRef: React.RefObject<HTMLDivElement | null>
}) {
  const editorRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const groups = useMentionCandidates(novelId)
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)
  const [composing, setComposing] = useState(false)
  const bootstrap = useDesktopStore(s => s.bootstrap)
  const platform = bootstrap?.platform === "win32" ? "win32" : "darwin"

  const hydrate = useMemo(() => {
    const map = new Map<string, ChipData>()
    for (const g of groups) for (const it of g.items) map.set(it.insertText, toChip(it))
    return (text: string) => map.get(text)
  }, [groups])
  const filtered = useMemo(() => {
    if (!mention) return []
    const q = mention.query.toLowerCase()
    return groups.map(g => ({ ...g, items: g.items.filter(it => it.name.toLowerCase().includes(q) || it.insertText.toLowerCase().includes(q)) })).filter(g => g.items.length)
  }, [mention, groups])
  const flat = useMemo(() => filtered.flatMap(g => g.items), [filtered])
  mentionOpenRef.current = !!mention

  /* restore a kept draft once, then focus the end of the editor */
  useEffect(() => {
    const el = editorRef.current
    if (!el) return
    renderDraftIntoEditor(el, draft, hydrate)
    el.focus()
    const range = document.createRange(); range.selectNodeContents(el); range.collapse(false)
    const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(range)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const sync = () => { const el = editorRef.current; if (!el) return; onDraft(editorToText(el)); refreshMention() }
  const refreshMention = () => {
    const el = editorRef.current
    const caret = el ? getCaretTextOffset(el) : null
    const found = el && caret != null ? mentionAt(editorToText(el), caret) : null
    if (found?.query !== mention?.query) setMentionIndex(0)
    setMention(found)
  }
  const insertMention = (item: MentionItem, replace?: { start: number; end: number }) => {
    const el = editorRef.current
    if (!el) return
    el.focus()
    const caret = getCaretTextOffset(el) ?? editorToText(el).length
    insertMentionChip(el, toChip(item), replace?.start ?? caret, replace?.end ?? caret)
    setMention(null); sync()
  }
  const selectMention = (item: MentionItem) => {
    const el = editorRef.current
    if (!el || !mention) return
    insertMention(item, { start: mention.start, end: getCaretTextOffset(el) ?? editorToText(el).length })
  }
  const run = (action: SelectionAiAction) => {
    if (blockedReason) return
    const el = editorRef.current
    onRun(action, el ? editorToText(el).trim() : draft.trim())
  }
  const newline = () => { document.execCommand("insertLineBreak"); sync() }

  const ready = () => !composing
  useDesktopCommands({
    "selectionAi.run": { enabled: () => ready() && !mention, run: () => run(pick) },
    "selectionAi.newline": { enabled: () => ready() && !mention, run: newline },
    "selectionAi.pickPrev": { enabled: () => ready() && !mention, run: () => onPick(stepPick(pick, -1)) },
    "selectionAi.pickNext": { enabled: () => ready() && !mention, run: () => onPick(stepPick(pick, 1)) },
    "ai.mentionNext": { enabled: () => !!mention && flat.length > 0, run: () => setMentionIndex(i => (i + 1) % flat.length) },
    "ai.mentionPrev": { enabled: () => !!mention && flat.length > 0, run: () => setMentionIndex(i => (i - 1 + flat.length) % flat.length) },
    "ai.mentionConfirm": { enabled: () => !!mention && flat.length > 0, run: () => selectMention(flat[Math.min(mentionIndex, flat.length - 1)]) },
    "ai.mentionClose": { enabled: () => !!mention, run: () => setMention(null) },
  }, boxRef)

  /* the list: Tab lands on the picked item, ↑/↓ move the pick, first item ↑ / Shift+Tab return to the editor */
  const backToEditor = () => {
    const el = editorRef.current
    if (!el) return
    el.focus(); const range = document.createRange(); range.selectNodeContents(el); range.collapse(false)
    const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(range)
  }
  const listKey = (e: React.KeyboardEvent) => {
    const items = [...(listRef.current?.querySelectorAll<HTMLButtonElement>("[data-fn]:not(:disabled)") ?? [])]
    const at = items.indexOf(document.activeElement as HTMLButtonElement)
    const go = (el?: HTMLButtonElement) => { if (!el) return; el.focus(); onPick(el.dataset.fn as SelectionAiAction) }
    if (e.key === "ArrowDown") { e.preventDefault(); go(items[Math.min(at + 1, items.length - 1)]) }
    else if (e.key === "ArrowUp") { e.preventDefault(); if (at <= 0) backToEditor(); else go(items[at - 1]) }
    else if (e.key === "Tab" && e.shiftKey && at === 0) { e.preventDefault(); backToEditor() }
  }

  const overrides = bootstrap?.settings.shortcuts[platform] ?? {}
  const commands = bootstrap ? desktopCommandCatalog(platform) : []
  const keyOf = (id: string, fallback: string) => { const c = commands.find(x => x.id === id); const b = c ? bindingsFor(c, overrides) : [fallback]; return b.length ? bindingLabel(b[0], platform) : "" }
  const pickHint = (() => { const up = keyOf("selectionAi.pickPrev", platform === "darwin" ? "Cmd+ArrowUp" : "Alt+ArrowUp"), down = keyOf("selectionAi.pickNext", platform === "darwin" ? "Cmd+ArrowDown" : "Alt+ArrowDown"); const common = up && down && up.slice(0, -1) === down.slice(0, -1) ? `${up.slice(0, -1)}↑↓` : [up, down].filter(Boolean).join(" / "); return common ? `${common} 选择功能` : "" })()
  const runKey = keyOf("selectionAi.run", "Enter"), lineKey = keyOf("selectionAi.newline", "Shift+Enter")
  const hint = blockedReason ?? [runKey && `${runKey} 执行${SELECTION_AI_ACTIONS.find(a => a.key === pick)!.name}`, pickHint, lineKey && `${lineKey} 换行`, "Esc 关闭"].filter(Boolean).join(" · ")
  const flatQuote = quote.replace(/\s+/g, " ")

  return (
    <div ref={boxRef} className="selection-ai-float selection-ai-request" style={style} aria-label="AI 修改要求" data-selection-ai-layer="">
      <div className="selection-ai-quote">
        <div className="selection-ai-quote-text" title="选中的原文"><Quote aria-hidden="true" /><span>{flatQuote}</span></div>
        <span className="selection-ai-quote-count">已选 {countChineseWords(quote).toLocaleString()} 字</span>
      </div>
      <div className="relative">
        {mention && <MentionPopup groups={filtered} activeIndex={mentionIndex} onActiveChange={setMentionIndex} onSelect={selectMention} />}
        <div ref={editorRef} contentEditable role="textbox" aria-multiline="true" aria-label="修改要求" data-text-input
          className="chat-composer-editable selection-ai-request-editor" data-placeholder="写下修改要求，@ 引用角色、场景、大纲…"
          onInput={sync} onKeyUp={refreshMention} onClick={refreshMention}
          onCompositionStart={() => setComposing(true)} onCompositionEnd={() => { setComposing(false); sync() }}
          onKeyDown={e => {
            if (e.key === "Tab" && !e.shiftKey && !mention) { const picked = listRef.current?.querySelector<HTMLButtonElement>(`[data-fn="${pick}"]:not(:disabled)`); if (picked) { e.preventDefault(); picked.focus() } }
          }}
          onPaste={e => { e.preventDefault(); document.execCommand("insertText", false, e.clipboardData.getData("text/plain")); sync() }} />
      </div>
      <div className="selection-ai-request-bar">
        <DropdownMenu>
          <DropdownMenuTrigger render={<button type="button" className="selection-ai-tbtn only" title="插入角色·场景·大纲" aria-label="插入角色·场景·大纲" />}>
            <Plus aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="bottom" align="start" className="w-56">
            <DropdownMenuSub>
              <DropdownMenuSubTrigger><AtSign className="size-3.5" />插入角色·场景·大纲</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-52">
                {groups.length === 0 ? <DropdownMenuItem disabled>暂无可引用资源</DropdownMenuItem> : groups.map(g => {
                  const GroupIcon = MENTION_GROUP_ICONS[g.key] ?? AtSign
                  return <DropdownMenuSub key={g.key}>
                    <DropdownMenuSubTrigger><GroupIcon className="size-3.5" /><span className="min-w-0 flex-1 truncate">{g.label}</span><span className="text-[10.5px] text-muted-foreground">{g.items.length}</span></DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-64"><DropdownMenuGroup><DropdownMenuLabel>{g.label}</DropdownMenuLabel>
                      {g.items.map(item => <DropdownMenuItem key={item.key} onClick={() => insertMention(item)}><MentionItemVisual item={item} /><span className="min-w-0 flex-1 truncate">{item.name}</span></DropdownMenuItem>)}
                    </DropdownMenuGroup></DropdownMenuSubContent>
                  </DropdownMenuSub>
                })}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
        <RequestModelPicker model={model} onModel={onModel} hasModel={hasModel} />
      </div>
      <div ref={listRef} className="selection-ai-funcs" role="group" aria-label="AI 修改功能" onKeyDown={listKey}>
        {SELECTION_AI_ACTIONS.map(action => (
          <button key={action.key} type="button" data-fn={action.key} aria-pressed={action.key === pick} disabled={!!blockedReason}
            title={blockedReason ?? undefined}
            className={cn("selection-ai-func", action.key === pick && "picked")}
            onMouseDown={e => e.preventDefault()} onClick={() => run(action.key)}>
            <ActionIcon action={action.key} /><b>{action.name}</b><small>{action.desc}</small>
          </button>
        ))}
      </div>
      <div className="selection-ai-hint">{hint}</div>
    </div>
  )
}

/** Model and effort for this request only (initial value: the chat's current choice). Never writes the chat store. */
function RequestModelPicker({ model, onModel, hasModel }: { model: RequestModel; onModel(m: RequestModel): void; hasModel: boolean }) {
  const { data } = useChatModels()
  const models = Array.isArray(data?.models) ? data.models : []
  const current = models.find(m => m.id === model.modelId) ?? null
  const effort = current?.thinkingEfforts.find(o => o.value === (model.effort ?? "default")) ?? null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<button type="button" className="selection-ai-tbtn selection-ai-model" title="模型与思考强度（仅本次修改）" aria-label="模型与思考强度（仅本次修改）" disabled={!hasModel} />}>
        <ProviderLogo provider={current?.provider ?? ""} className="size-3.5 shrink-0" />
        <span className="max-w-[180px] truncate">{current ? `${current.name}${effort && effort.value !== "default" ? ` · ${effort.label}` : ""}` : hasModel ? "选择模型" : "未配置模型"}</span>
        <ChevronDown aria-hidden="true" className="size-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="end" className="w-60">
        <DropdownMenuGroup>
          {models.map(m => m.thinkingEfforts.length === 0
            ? <DropdownMenuItem key={m.id} onClick={() => onModel({ modelId: m.id, effort: null })}><ProviderLogo provider={m.provider} className="size-3.5" /><span className="min-w-0 flex-1 truncate">{m.name}</span>{m.id === model.modelId && <Check className="size-3.5 text-primary" />}</DropdownMenuItem>
            : <DropdownMenuSub key={m.id}>
                <DropdownMenuSubTrigger onClick={() => onModel({ modelId: m.id, effort: null })}><ProviderLogo provider={m.provider} className="size-3.5" /><span className="min-w-0 flex-1 truncate">{m.name}</span>{m.id === model.modelId && <Check className="size-3.5 text-primary" />}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-52"><DropdownMenuGroup><DropdownMenuLabel>思考强度</DropdownMenuLabel>
                  {m.thinkingEfforts.map(o => <DropdownMenuItem key={o.value} onClick={() => onModel({ modelId: m.id, effort: o.value === "default" ? null : o.value })}><span className="min-w-0 flex-1">{o.label}</span>{m.id === model.modelId && (model.effort ?? "default") === o.value && <Check className="size-3.5 text-primary" />}</DropdownMenuItem>)}
                </DropdownMenuGroup></DropdownMenuSubContent>
              </DropdownMenuSub>)}
          {models.length === 0 && <DropdownMenuItem disabled>暂无可用文本模型</DropdownMenuItem>}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => window.dispatchEvent(new CustomEvent("desktop:settings", { detail: "models" }))}>管理模型</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
