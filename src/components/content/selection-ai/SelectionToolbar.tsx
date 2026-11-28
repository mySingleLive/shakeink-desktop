"use client"
/** docs/612 §2: 选区工具栏 — 添加评论 · 输入修改要求 · 润色 · 扩写 · 续写 · ⋯ */
import { useRef } from "react"
import { MessageSquarePlus, MoreHorizontal, PenLine } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { SELECTION_AI_ACTIONS, TOOLBAR_ACTIONS, type SelectionAiAction } from "@/lib/selection-ai"
import { ActionIcon } from "./icons"

export function SelectionToolbar({ style, compact, blockedReason, canComment, onComment, onAsk, onRun, toolbarRef }: {
  style: React.CSSProperties
  compact: boolean
  /** Why functions are disabled (no model, too long); null when they can run. */
  blockedReason: string | null
  canComment: boolean
  onComment(): void
  onAsk(): void
  onRun(action: SelectionAiAction): void
  toolbarRef: React.RefObject<HTMLDivElement | null>
}) {
  const items = useRef<HTMLDivElement>(null)
  /* ←/→ move between buttons (product §7) */
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return
    const buttons = [...(items.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])]
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement)
    if (at < 0) return
    e.preventDefault()
    buttons[(at + (e.key === "ArrowRight" ? 1 : buttons.length - 1)) % buttons.length]?.focus()
  }
  const keep = (e: React.MouseEvent) => e.preventDefault() // keep the text selection while clicking
  return (
    <div ref={toolbarRef} className={cn("selection-ai-float selection-ai-toolbar", compact && "compact")} style={style} role="toolbar" aria-label="AI 助手" data-selection-ai-layer="">
      <div ref={items} className="contents" onKeyDown={onKeyDown}>
        <button type="button" className="selection-ai-tbtn only selection-ai-comment" title="添加评论" aria-label="添加评论" disabled={!canComment} onMouseDown={keep} onClick={onComment}>
          <MessageSquarePlus aria-hidden="true" />
        </button>
        <span className="selection-ai-sep" aria-hidden="true" />
        <button type="button" className="selection-ai-ask" title="输入修改要求" aria-label="输入修改要求" onMouseDown={keep} onClick={onAsk}>
          <PenLine aria-hidden="true" /><span>输入修改要求…</span>
        </button>
        <span className="selection-ai-sep" aria-hidden="true" />
        {TOOLBAR_ACTIONS.map(key => {
          const action = SELECTION_AI_ACTIONS.find(a => a.key === key)!
          return <button key={key} type="button" className="selection-ai-tbtn" data-fn={key} disabled={!!blockedReason} title={blockedReason ?? action.desc} onMouseDown={keep} onClick={() => onRun(key)}>
            <ActionIcon action={key} />{action.name}
          </button>
        })}
        <span className="selection-ai-sep" aria-hidden="true" />
        <DropdownMenu>
          <DropdownMenuTrigger render={<button type="button" className="selection-ai-tbtn only" title="更多 AI 修改" aria-label="更多 AI 修改" />}>
            <MoreHorizontal aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={6} className="w-60">
            {SELECTION_AI_ACTIONS.map(action => (
              <DropdownMenuItem key={action.key} disabled={!!blockedReason} onClick={() => onRun(action.key)} className="items-start">
                <ActionIcon action={action.key} className="mt-0.5 size-3.5" />
                <span className="flex min-w-0 flex-col"><span className="text-[13px] font-medium">{action.name}</span><span className="text-[11.5px] text-muted-foreground">{action.desc}</span></span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
