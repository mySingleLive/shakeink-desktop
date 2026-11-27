"use client"
import { desktopCommandTarget } from "./command-runtime"

/** docs/599 §12.3 / §13.1: who owns an Escape press inside a worldline panel. `worldline.escape` (enabled when an owner
 * exists) and `ai.stop` (enabled only when none does) call the same function, so exactly one of them runs. */
export interface WorldlineEscapeOwner {
  panel(): HTMLElement | null
  wants(target: HTMLElement): boolean
  run(target: HTMLElement): void
}
const owners = new Set<WorldlineEscapeOwner>()
export function registerWorldlineEscape(owner: WorldlineEscapeOwner) {
  owners.add(owner)
  return () => { owners.delete(owner) }
}
/** A press on the page body (focus left a closed picker, or a card was double-clicked) falls back to the last
 * pointer target, as menu commands do. */
function resolve(target: Element | null | undefined): HTMLElement | null {
  const t = target instanceof HTMLElement ? target : null
  if (!t || t === t.ownerDocument.body || t === t.ownerDocument.documentElement) return desktopCommandTarget()
  return t
}
export function worldlineEscapeOwner(target?: Element | null): { owner: WorldlineEscapeOwner; target: HTMLElement } | null {
  const t = resolve(target === undefined ? (typeof document === "undefined" ? null : document.activeElement) : target)
  if (!t) return null
  const found = [...owners].filter((o) => !!o.panel()?.contains(t) && o.wants(t))
  return found.length === 1 ? { owner: found[0], target: t } : null
}
