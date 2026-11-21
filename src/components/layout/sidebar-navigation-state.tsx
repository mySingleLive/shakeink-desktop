"use client"

import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode, type RefObject } from "react"
import { DropdownMenu, DropdownMenuContent } from "@/components/ui/dropdown-menu"
import { ContextMenu } from "@/components/ui/context-menu"
import type { CharacterRoleType, SettingType } from "@/generated/prisma/enums"

export const NAVIGATION_VIEWS = ["works", "settings", "characters", "content", "conversations"] as const
export type NavigationView = typeof NAVIGATION_VIEWS[number]
export const NAVIGATION_LABELS: Record<NavigationView, string> = { works: "作品", settings: "设定", characters: "角色", content: "正文", conversations: "对话" }
export type NavigationTone = "work" | "settings" | "theme" | "style" | "world" | "golden" | "foreshadow" | "trope" | "items" | "scenario" | "scenes" | "worldline" | "narrative" | "outline" | "content" | "progress" | "review" | "cascade" | "conversations" | "characters" | "protagonist" | "supporting" | "antagonist" | "foreshadow-character"
export const ROLE_TONES: Record<CharacterRoleType, NavigationTone> = { PROTAGONIST: "protagonist", SUPPORTING: "supporting", ANTAGONIST: "antagonist" }
export const ROLE_TAGS: Record<CharacterRoleType, string> = { PROTAGONIST: "主", SUPPORTING: "配", ANTAGONIST: "反" }
export const settingTone = (type: SettingType): NavigationTone => type === "STYLE" ? "style" : type === "GOLD_FINGER" ? "golden" : "settings"

const TransientContext = createContext({ paused: false, epoch: 0 })
/** A presentation boundary affects menus and hover cards, never business dialogs. */
export function NavigationTransientBoundary({ paused = false, epoch = 0, children }: { paused?: boolean; epoch?: number; children: ReactNode }) {
  const parent = useContext(TransientContext)
  const value = useMemo(() => ({ paused: parent.paused || paused, epoch: parent.epoch + epoch }), [parent, paused, epoch])
  return <TransientContext.Provider value={value}>{children}</TransientContext.Provider>
}
export function useNavigationTransient() { return useContext(TransientContext) }
export function NavigationMenu(props: ComponentProps<typeof DropdownMenu>) {
  const { paused, epoch } = useNavigationTransient()
  const [open, setOpen] = useState(false)
  useEffect(() => { setOpen(false) }, [paused, epoch])
  return <DropdownMenu {...props} open={!paused && open} onOpenChange={(next, details) => { setOpen(!paused && next); props.onOpenChange?.(next, details) }} />
}
/** Right-click entry with the same transient rules as NavigationMenu. */
export function NavigationContextMenu({ children, onShow, ...props }: ComponentProps<typeof ContextMenu> & { onShow?(): void }) {
  const { paused, epoch } = useNavigationTransient()
  const [open, setOpen] = useState(false)
  useEffect(() => { setOpen(false) }, [paused, epoch])
  return <ContextMenu {...props} open={!paused && open} onOpenChange={(next, details) => { if (next && !paused) onShow?.(); setOpen(!paused && next); props.onOpenChange?.(next, details) }}>{children}</ContextMenu>
}
export function NavigationMenuContent(props: ComponentProps<typeof DropdownMenuContent>) {
  const { paused } = useNavigationTransient()
  return <DropdownMenuContent {...props} finalFocus={paused ? false : props.finalFocus} />
}

interface ScrollPosition { target: number; actual: number }
/** A clipped position is temporary. Explicit user scrolling replaces that pending goal. */
export function useNavigationScroll(view: NavigationView, scope: string, ref: RefObject<HTMLDivElement | null>) {
  const positions = useRef(new Map<NavigationView, ScrollPosition>())
  const currentScope = useRef(scope)
  const capture = () => {
    const node = ref.current
    if (!node) return
    const saved = positions.current.get(view)
    const max = Math.max(0, node.scrollHeight - node.clientHeight)
    const clipped = saved && saved.target > max && Math.abs(node.scrollTop - max) < 1
    positions.current.set(view, { target: clipped ? saved.target : node.scrollTop, actual: node.scrollTop })
  }
  useLayoutEffect(() => {
    if (currentScope.current !== scope) { positions.current.clear(); currentScope.current = scope }
    const node = ref.current
    if (!node) return
    let frame = 0, alive = true, manual = false
    const restore = () => {
      frame = 0
      if (!alive) return
      const saved = positions.current.get(view) ?? { target: 0, actual: 0 }
      const max = Math.max(0, node.scrollHeight - node.clientHeight)
      node.scrollTop = Math.min(saved.target, max)
      positions.current.set(view, { ...saved, actual: node.scrollTop })
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(restore) }
    const intent = () => { manual = true; positions.current.set(view, { target: node.scrollTop, actual: node.scrollTop }) }
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      if (event.key === " " && event.target instanceof Element && event.target.closest("button, a, [role=button], [role=tab], [contenteditable]")) return
      if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) intent()
    }
    const pointer = (event: PointerEvent) => {
      const rect = node.getBoundingClientRect()
      if (event.target === node && event.clientX >= rect.right - Math.max(14, node.offsetWidth - node.clientWidth)) intent()
    }
    const scroll = () => {
      const saved = positions.current.get(view)
      const max = Math.max(0, node.scrollHeight - node.clientHeight)
      const clipped = saved && saved.target > max && Math.abs(node.scrollTop - max) < 1
      if (manual || !clipped) positions.current.set(view, { target: node.scrollTop, actual: node.scrollTop })
      else positions.current.set(view, { ...saved, actual: node.scrollTop })
      manual = false
    }
    restore()
    const resize = new ResizeObserver(schedule)
    resize.observe(node)
    if (node.firstElementChild) resize.observe(node.firstElementChild)
    const mutation = new MutationObserver(schedule)
    mutation.observe(node, { childList: true, subtree: true })
    node.addEventListener("scroll", scroll)
    node.addEventListener("wheel", intent, { passive: true })
    node.addEventListener("touchstart", intent, { passive: true })
    node.addEventListener("pointerdown", pointer)
    node.addEventListener("keydown", key)
    return () => {
      alive = false; cancelAnimationFrame(frame); resize.disconnect(); mutation.disconnect()
      node.removeEventListener("scroll", scroll); node.removeEventListener("wheel", intent); node.removeEventListener("touchstart", intent); node.removeEventListener("pointerdown", pointer); node.removeEventListener("keydown", key)
    }
  }, [view, scope, ref])
  return { capture, clear: () => positions.current.clear() }
}
