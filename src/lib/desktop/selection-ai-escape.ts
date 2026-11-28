"use client"
import { desktopCommandTarget } from "./command-runtime"

/**
 * docs/612 §4.7: who owns an Escape press while the manuscript selection AI toolbar or request box is open.
 * `selectionAi.escape` (enabled when an owner claims the focused element) and `ai.stop` (enabled only when none does)
 * are mutually exclusive, so the dispatcher never sees two enabled exact matches. Mirrors worldline-escape.ts.
 */
export interface SelectionAiEscapeOwner {
  /** The manuscript editor root (and its floating layers); focus outside it never belongs to this owner. */
  root(): HTMLElement | null
  /** False while a nested layer (the @ mention popup) owns Escape itself. */
  wants(target: HTMLElement): boolean
  run(target: HTMLElement): void
}
const owners = new Set<SelectionAiEscapeOwner>()
export function registerSelectionAiEscape(owner: SelectionAiEscapeOwner) {
  owners.add(owner)
  return () => { owners.delete(owner) }
}
function resolve(target: Element | null | undefined): HTMLElement | null {
  if (target && typeof (target as HTMLElement).ownerDocument === "object") {
    const t = target as HTMLElement
    if (t === t.ownerDocument?.body || t === t.ownerDocument?.documentElement) return desktopCommandTarget()
  }
  return (target as HTMLElement | null) ?? null
}
export function selectionAiEscapeOwner(target?: Element | null): { owner: SelectionAiEscapeOwner; target: HTMLElement } | null {
  const t = resolve(target === undefined ? (typeof document === "undefined" ? null : document.activeElement) : target)
  if (!t) return null
  const found = [...owners].filter(o => !!o.root()?.contains(t) && o.wants(t))
  return found.length === 1 ? { owner: found[0], target: t } : null
}
export function runSelectionAiEscape(target?: Element | null) {
  const hit = selectionAiEscapeOwner(target)
  hit?.owner.run(hit.target)
}
