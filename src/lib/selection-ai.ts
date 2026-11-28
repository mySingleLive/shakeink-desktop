/** docs/612: shared pure helpers for the manuscript selection AI toolbar (front end and service). */
import { countChineseWords } from "./text"

export type SelectionAiAction = "polish" | "expand" | "shrink" | "continue" | "rewrite" | "summary"

export interface SelectionAiActionInfo {
  key: SelectionAiAction
  name: string
  /** One-line description shown in menus and the request box list (product §2.3). */
  desc: string
  /** Default requirement sent to the model; the author's requirement is appended. */
  instruction: string
  /** Usage record action name. */
  usage: `selection.${SelectionAiAction}`
}

export const SELECTION_AI_ACTIONS: readonly SelectionAiActionInfo[] = [
  { key: "polish", name: "润色", desc: "优化措辞与节奏，不改情节", instruction: "保留原意、情节、人称和信息量，改善用词、句式和节奏", usage: "selection.polish" },
  { key: "expand", name: "扩写", desc: "补充细节，篇幅约增加一半", instruction: "不改变情节走向，补充动作、神态、环境与心理描写，约为原文 1.5 倍", usage: "selection.expand" },
  { key: "shrink", name: "缩写", desc: "精简冗余，保留关键情节", instruction: "保留关键情节与对白要点，删去冗余，约为原文一半", usage: "selection.shrink" },
  { key: "continue", name: "续写", desc: "接着选中内容往下写", instruction: "承接选中文字的最后一句往下写，风格一致，约 300–600 字", usage: "selection.continue" },
  { key: "rewrite", name: "重写", desc: "换一种写法重新表达", instruction: "保留情节要点，换一种叙述方式与句式重写", usage: "selection.rewrite" },
  { key: "summary", name: "总结", desc: "概括为一段简述", instruction: "用一段话概括选中内容的情节要点", usage: "selection.summary" },
]

export const TOOLBAR_ACTIONS: readonly SelectionAiAction[] = ["polish", "expand", "continue"]
export const DEFAULT_PICK: SelectionAiAction = "polish"
export const SELECTION_LIMIT = 10000
export const REQUIREMENT_LIMIT = 2000
/** Characters of manuscript kept on each side of the selection. */
export const LOCAL_CONTEXT = 1500
/** Per-section prompt limits (characters); see plan §4.2-3. */
export const CONTEXT_LIMITS = { settings: 12000, characters: 8000, narrative: 8000, other: 4000 } as const

const KEYS = SELECTION_AI_ACTIONS.map(a => a.key)
export function actionInfo(key: SelectionAiAction): SelectionAiActionInfo {
  const info = SELECTION_AI_ACTIONS.find(a => a.key === key)
  if (!info) throw new Error(`未知的 AI 修改功能：${key}`)
  return info
}
export function isSelectionAiAction(value: unknown): value is SelectionAiAction {
  return typeof value === "string" && (KEYS as string[]).includes(value)
}

/** Cmd/Alt+Arrow selection in the request box: one step, wrapping at both ends. */
export function stepPick(current: SelectionAiAction, dir: 1 | -1): SelectionAiAction {
  const i = KEYS.indexOf(current)
  if (i < 0) return DEFAULT_PICK
  return KEYS[(i + dir + KEYS.length) % KEYS.length]
}

/** Text written back in place of the selection. Continuation keeps the original and appends one blank line. */
export function resultText(action: SelectionAiAction, original: string, output: string): string {
  if (action !== "continue") return output
  const eol = /\r\n/.test(original) ? "\r\n" : "\n"
  const trailing = original.match(/(?:\r?\n)*$/)?.[0] ?? ""
  const breaks = (trailing.match(/\n/g) ?? []).length
  return original + eol.repeat(Math.max(0, 2 - breaks)) + output
}

export function selectionStillMatches(source: string, start: number, end: number, quote: string): boolean {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > source.length) return false
  return source.slice(start, end) === quote
}

export function applyReplacement(source: string, start: number, end: number, text: string): string {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > source.length) throw new Error("替换范围无效")
  return source.slice(0, start) + text + source.slice(end)
}

export type HistoryPhase = "before" | "after" | "undo"
export function historyReason(action: SelectionAiAction, phase: HistoryPhase): string {
  const name = actionInfo(action).name
  return phase === "before" ? `AI ${name}前` : phase === "after" ? `AI ${name}` : `撤销 AI ${name}`
}
const REASONS = new Set(SELECTION_AI_ACTIONS.flatMap(a => (["before", "after", "undo"] as const).map(p => historyReason(a.key, p))))
export function isSelectionAiReason(reason: string | null | undefined): boolean {
  return !!reason && REASONS.has(reason)
}

export function overLimit(text: string): boolean {
  return countChineseWords(text) > SELECTION_LIMIT
}

export function clampSection(text: string, limit: number): string {
  const chars = Array.from(text)
  return chars.length <= limit ? text : chars.slice(0, limit).join("") + "（已截断）"
}

export interface Box { left: number; top: number; right: number; bottom: number }
export interface Placement { top: number; left: number; hidden: boolean; scrollBy: number }

const GAP = 8
/**
 * Where a toolbar or request box goes relative to the selection's client rects (viewport coordinates):
 * 8px below the last line, centred on it; flipped above the first line when it does not fit below;
 * clamped 8px inside the view horizontally; hidden when the selection is out of view.
 * With allowScroll (request box opening), when neither side fits, returns how far to scroll so it fits below.
 */
export function toolbarPlacement(rects: Box[], view: Box, size: { width: number; height: number }, options: { allowScroll?: boolean } = {}): Placement {
  const lines = rects.filter(r => r.right > r.left || r.bottom > r.top)
  if (!lines.length) return { top: 0, left: 0, hidden: true, scrollBy: 0 }
  const first = lines[0], last = lines[lines.length - 1]
  const hidden = last.bottom < view.top || first.top > view.bottom
  const centre = (last.left + last.right) / 2
  const left = Math.max(view.left + GAP, Math.min(centre - size.width / 2, view.right - GAP - size.width))
  const below = last.bottom + GAP
  const fitsBelow = below + size.height <= view.bottom - GAP
  const above = first.top - GAP - size.height
  const fitsAbove = above >= view.top
  if (fitsBelow) return { top: below, left, hidden, scrollBy: 0 }
  if (fitsAbove) return { top: above, left, hidden, scrollBy: 0 }
  if (options.allowScroll) {
    const need = below + size.height - (view.bottom - GAP)
    const room = first.top - view.top - GAP
    if (need > 0 && need <= room) return { top: below - need, left, hidden, scrollBy: need }
  }
  return { top: Math.max(view.top + GAP, view.bottom - GAP - size.height), left, hidden, scrollBy: 0 }
}
