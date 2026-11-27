"use client"

/**
 * docs/611 chapter reader: header, end marker and the 阅读设置 popover for the
 * chapter content preview. Header/footer carry data-preview-chrome so preview
 * selection, comments and foreshadow anchors treat them as UI, not body text.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type ComponentProps, type CSSProperties, type RefObject } from "react"
import { useShallow } from "zustand/react/shallow"
import { useTheme } from "next-themes"
import { Popover } from "@base-ui/react/popover"

import { Switch } from "@/components/ui/switch"
import type { MarkdownEditorReader } from "@/components/editor/MarkdownEditor"
import { chapterHeading } from "@/lib/chapter-reader"
import { useContentDrawerPopup } from "@/lib/desktop/content-drawer-context"
import { INK_BACKGROUNDS, PAGE_WIDTH, PAPER_BACKGROUNDS, READER_SIZES, useChapterReaderStore, type ChapterReaderSettings } from "@/stores/chapter-reader"
import { localFontFamilies } from "@/lib/desktop/appearance"

import { CHAPTER_STATUS_LABELS } from "./labels"
import { MIN_PERCENT, TRACK, parsePercent, percentAt, positionOf } from "./reader-zoom"
import { LOCAL_PREFIX, READER_FONT_GROUPS, fontById, fontInstalled, readerFontFamily } from "./reader-fonts"
import type { ChapterDetail } from "./types"

const PAPER_NAMES: Record<(typeof PAPER_BACKGROUNDS)[number], string> = { default: "米黄（默认）", green: "护眼绿", white: "纯白" }
const INK_NAMES: Record<(typeof INK_BACKGROUNDS)[number], string> = { default: "玄石（默认）", green: "墨绿", blue: "夜蓝", black: "纯黑" }

function ChapterReaderHeader({ chapter, words }: { chapter: ChapterDetail; words: number }) {
  const { showVolume, showNumber, showWords } = useChapterReaderStore(useShallow(s => ({ showVolume: s.showVolume, showNumber: s.showNumber, showWords: s.showWords })))
  const h = useMemo(() => chapterHeading(chapter), [chapter])
  return (
    <div data-preview-chrome role="group" className="chapter-reader-head" aria-label="章节信息">
      {showVolume && <div className="chapter-reader-volume">{h.volumeLabel}</div>}
      <h1>
        {showNumber && h.numberLabel && <span className="chapter-reader-number">{h.numberLabel}</span>}
        <span className="chapter-reader-title">{h.titleLabel}</span>
      </h1>
      <div className="chapter-reader-meta">
        {showWords && <span>{words.toLocaleString()} 字</span>}
        {/* 2026-11-28 user: 已生成 is the ordinary state and is not shown; the top bar badge keeps it. */}
        {chapter.status !== "WRITTEN" && <span>{CHAPTER_STATUS_LABELS[chapter.status]}</span>}
      </div>
      <div className="chapter-reader-ornament" aria-hidden="true"><i /></div>
    </div>
  )
}

function ChapterReaderFooter({ words }: { words: number }) {
  const showWords = useChapterReaderStore(s => s.showWords)
  return (
    <div data-preview-chrome className="chapter-reader-end">
      <span>本章完</span>
      {showWords && <small>{words.toLocaleString()} 字</small>}
    </div>
  )
}

function Choice({ pressed, label, ...props }: ComponentProps<"button"> & { pressed: boolean; label?: string; "data-bg"?: string }) {
  return <button type="button" aria-pressed={pressed} aria-label={label} title={label} {...props} />
}

/**
 * The reader this toolbar belongs to. Inactive content tabs stay mounted but hidden (0px wide), so the
 * first `.chapter-reader` in the document is often the wrong one; go through the trigger's own editor.
 */
const ownReader = (trigger: Element | null) => trigger?.closest(".desktop-markdown-editor")?.querySelector<HTMLElement>(".chapter-reader") ?? null
function useReaderRoom(trigger: RefObject<HTMLElement | null>): number {
  const subscribe = useCallback((notify: () => void) => {
    const o = new ResizeObserver(notify), el = ownReader(trigger.current); if (el) o.observe(el); return () => o.disconnect()
  }, [trigger])
  return useSyncExternalStore(subscribe, () => ownReader(trigger.current)?.clientWidth ?? 0, () => 0)
}

/** Installed font families (Local Font Access; the main process grants `local-fonts` to the app page only). */
let localFontsCache: Promise<Set<string> | null> | null = null
function useLocalFonts() {
  const [fonts, setFonts] = useState<Set<string> | null>(null)
  useEffect(() => {
    let alive = true
    localFontsCache ??= localFontFamilies().then(list => new Set(list), () => null)
    void localFontsCache.then(set => { if (alive) setFonts(set) })
    return () => { alive = false }
  }, [])
  return fonts
}

function ReaderFontRow() {
  const id = useId()
  const font = useChapterReaderStore(s => s.font), set = useChapterReaderStore(s => s.setReader)
  const local = useLocalFonts()
  const builtInFamilies = useMemo(() => new Set(READER_FONT_GROUPS.flatMap(g => g.fonts.flatMap(f => f.families))), [])
  const others = local ? [...local].filter(f => !builtInFamilies.has(f)).sort((a, b) => a.localeCompare(b, "zh-CN")) : []
  const chosen = font.startsWith(LOCAL_PREFIX) ? font.slice(LOCAL_PREFIX.length) : null
  const builtIn = fontById(font)
  const missing = !!local && (chosen ? !local.has(chosen) : builtIn ? !fontInstalled(builtIn, local) : font !== "inherit")
  // A stored local font that is no longer installed still needs an <option> so the select shows it.
  const extra = chosen && !others.includes(chosen) ? [chosen] : []
  return <>
    <label className="chapter-reader-label" htmlFor={`${id}-font`}>正文字体</label>
    <div className="chapter-reader-font">
      {/* Native select, as in 设置 › 正文字体: its list is a native popup, so picking keeps 阅读设置 open. */}
      <select id={`${id}-font`} aria-label="正文字体" value={font} style={{ fontFamily: readerFontFamily(font) || undefined }}
        onChange={event => set({ font: event.target.value })}>
        <option value="inherit">跟随设置</option>
        {READER_FONT_GROUPS.map(group => <optgroup key={group.label} label={group.label}>
          {group.fonts.map(f => {
            const installed = fontInstalled(f, local)
            return <option key={f.id} value={f.id} disabled={!installed && f.id !== font} style={{ fontFamily: readerFontFamily(f.id) }}>
              {f.label}{installed ? "" : "（未安装）"}
            </option>
          })}
        </optgroup>)}
        {(others.length > 0 || extra.length > 0) && <optgroup label="本机字体">
          {[...extra, ...others].map(f => <option key={f} value={LOCAL_PREFIX + f} style={{ fontFamily: readerFontFamily(LOCAL_PREFIX + f) }}>{f}</option>)}
        </optgroup>}
      </select>
      {missing && <p className="chapter-reader-hint" role="status">此字体未安装，正文暂以宋体显示</p>}
    </div>
  </>
}

function ReaderZoomRow({ trigger }: { trigger: RefObject<HTMLElement | null> }) {
  const id = useId()
  const { pageWidth, pageFill } = useChapterReaderStore(useShallow(s => ({ pageWidth: s.pageWidth, pageFill: s.pageFill })))
  const room = useReaderRoom(trigger)
  const narrow = room > 0 && room < 820, disabled = narrow || room === 0
  const max = Math.max(MIN_PERCENT, Math.floor(room / PAGE_WIDTH.default * 100))
  const filled = narrow || pageFill || pageWidth >= room
  const percent = filled ? max : Math.min(max, Math.round(pageWidth / PAGE_WIDTH.default * 100))
  const label = filled ? "铺满" : `${percent}%`
  const [draft, setDraft] = useState<string | null>(null)
  // percent ≥ max means 铺满; everything else is a width relative to the 100% page.
  const apply = (pct: number) => {
    const clamped = Math.min(max, Math.max(MIN_PERCENT, Math.round(pct)))
    zoomReaderTo(clamped >= max ? Infinity : clamped / 100 * PAGE_WIDTH.default, ownReader(trigger.current), undefined, true)
  }
  const commit = () => { if (draft === null) return; const n = parsePercent(draft); setDraft(null); if (n !== null) apply(n) }
  return <>
    <div className="chapter-reader-label" id={`${id}-zoom`}>页面缩放</div>
    <div className="chapter-reader-zoom">
      {/* Track 0…1000 with 100% fixed in the middle (reader-zoom.ts); arrow keys move 1% via onKeyDown. */}
      <input type="range" aria-labelledby={`${id}-zoom`} aria-label="页面缩放" aria-valuetext={label} min={0} max={TRACK} step={1}
        value={positionOf(percent, max)} disabled={disabled}
        onKeyDown={event => {
          const delta = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[event.key]
          if (delta) { event.preventDefault(); apply(percent + delta) }
        }}
        onChange={event => { const pos = Number(event.target.value); apply(pos >= TRACK ? max : percentAt(pos, max)) }} />
      <span className="chapter-reader-zoom-value">
        <input type="text" inputMode="numeric" aria-label="页面缩放百分比" disabled={disabled}
          value={draft ?? (filled ? "铺满" : String(percent))}
          onFocus={event => { setDraft(filled ? String(max) : String(percent)); event.target.select() }}
          onChange={event => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={event => {
            if (event.key === "Enter") { event.preventDefault(); commit(); (event.target as HTMLInputElement).select() }
            else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              event.preventDefault()
              const base = parsePercent(draft ?? "") ?? percent, next = base + (event.key === "ArrowUp" ? 1 : -1)
              setDraft(String(Math.min(max, Math.max(MIN_PERCENT, next)))); apply(next)
            } else if (event.key === "Escape") setDraft(null) // restore; the popover closes as usual
          }} />
        {(draft !== null || !filled) && <span aria-hidden="true">%</span>}
      </span>
    </div>
  </>
}

export function ChapterReaderSettings() {
  const settings = useChapterReaderStore()
  const set = settings.setReader
  const id = useId()
  const ink = useTheme().resolvedTheme === "ink"
  const [open, setOpen] = useState(false)
  const popup = useContentDrawerPopup<Popover.Root.ChangeEventDetails>({ open, onOpenChange: setOpen })
  const trigger = useRef<HTMLButtonElement>(null)
  const toggles: [keyof Pick<ChapterReaderSettings, "showVolume" | "showNumber" | "showWords">, string][] = [["showVolume", "卷名"], ["showNumber", "章节号"], ["showWords", "字数"]]
  return (
    <Popover.Root open={popup.open} onOpenChange={popup.onOpenChange}>
      <Popover.Trigger ref={trigger} className="chapter-reader-trigger" title="阅读设置"><span aria-hidden="true">Aa</span><span className="chapter-reader-trigger-text">阅读设置</span></Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={6} className="isolate z-50 outline-none"
          data-content-drawer-owned={popup.owned ? "true" : undefined} data-content-drawer-paused={popup.paused || undefined}
          inert={popup.paused} aria-hidden={popup.paused || undefined}>
          <Popover.Popup aria-label="阅读设置" finalFocus={popup.paused ? false : undefined} className="chapter-reader-popup">
            <div className="chapter-reader-label" id={`${id}-align`}>章首对齐</div>
            <div className="chapter-reader-row" role="group" aria-labelledby={`${id}-align`}>
              <Choice pressed={settings.align === "center"} onClick={() => set({ align: "center" })}>居中</Choice>
              <Choice pressed={settings.align === "left"} onClick={() => set({ align: "left" })}>左对齐</Choice>
            </div>
            <div className="chapter-reader-label" id={`${id}-show`}>章首显示</div>
            <div className="chapter-reader-toggles" role="group" aria-labelledby={`${id}-show`}>
              {toggles.map(([key, label]) => (
                <div key={key} className="chapter-reader-toggle" onClick={event => { if (!(event.target as HTMLElement).closest('[role="switch"]')) set({ [key]: !settings[key] }) }}>
                  <span aria-hidden="true">{label}</span>
                  <Switch size="sm" aria-label={`显示${label}`} checked={settings[key]} onCheckedChange={value => set({ [key]: value })} />
                </div>
              ))}
            </div>
            <ReaderFontRow />
            <ReaderZoomRow trigger={trigger} />
            <div className="chapter-reader-label" id={`${id}-size`}>字号</div>
            <div className="chapter-reader-row" role="group" aria-labelledby={`${id}-size`}>
              {READER_SIZES.map(size => <Choice key={size} pressed={settings.size === size} onClick={() => set({ size })}>{size}</Choice>)}
            </div>
            <div className="chapter-reader-label" id={`${id}-bg`}>背景（{ink ? "玄墨" : "宣纸"}）</div>
            <div className="chapter-reader-row chapter-reader-swatches" role="group" aria-labelledby={`${id}-bg`}>
              {ink
                ? INK_BACKGROUNDS.map(bg => <Choice key={bg} className="chapter-reader-swatch" data-bg={bg} label={INK_NAMES[bg]} pressed={settings.inkBackground === bg} onClick={() => set({ inkBackground: bg })} />)
                : PAPER_BACKGROUNDS.map(bg => <Choice key={bg} className="chapter-reader-swatch" data-bg={bg} label={PAPER_NAMES[bg]} pressed={settings.paperBackground === bg} onClick={() => set({ paperBackground: bg })} />)}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

/**
 * Ctrl + wheel / trackpad pinch over the reader resizes the book page (not the text, not the window zoom).
 * Continuous and animated (2026-11-28 user: smoother, finer): every wheel event scales the target width by
 * exp(-deltaY × ZOOM_RATE), and each frame eases the shown width toward it. The page can grow until it
 * covers the whole panel (`pageFill`, no page edge). The point under the pointer keeps its screen position
 * while the text reflows. The width is written to the DOM while animating and saved once it settles.
 * Native listener: React's onWheel is passive.
 */
const ZOOM_RATE = 0.0012, EASE = 0.28
interface ZoomState { target: number; shown: number; frame: number; anchor: { el: HTMLElement; y: number; ratio: number } | null }
const zooms = new WeakMap<HTMLElement, ZoomState>()
const pageOf = (el: HTMLElement) => el.querySelector<HTMLElement>(":scope > .chapter-reader-page")
const readerEl = () => [...document.querySelectorAll<HTMLElement>(".chapter-reader")].find(el => el.clientWidth > 0) ?? null
function step(el: HTMLElement) {
  const z = zooms.get(el); if (!z) return
  z.frame = 0
  if (!el.isConnected) { zooms.delete(el); return }
  const room = el.clientWidth
  const diff = z.target - z.shown
  z.shown = Math.abs(diff) < 0.5 ? z.target : z.shown + diff * EASE
  const fill = z.shown >= room - 0.5
  el.style.setProperty("--reader-width", `${Math.min(z.shown, room)}px`)
  el.dataset.readerFill = String(fill)
  const a = z.anchor
  if (a?.el.isConnected) { const r = a.el.getBoundingClientRect(); el.scrollTop += r.top + r.height * a.ratio - a.y }
  if (z.shown !== z.target) { z.frame = requestAnimationFrame(() => step(el)); return }
  delete el.dataset.readerZooming; zooms.delete(el)
  // Saving re-renders with the stored width; when filled keep the last real width for leaving fill again.
  useChapterReaderStore.getState().setReader(fill ? { pageFill: true } : { pageWidth: z.shown, pageFill: false })
  if (fill) el.style.setProperty("--reader-width", `${useChapterReaderStore.getState().pageWidth}px`)
}
/** Ease the page of `el` (default: the open chapter reader) toward `width` px; Infinity fills the panel. */
export function zoomReaderTo(width: number | ((current: number) => number), el = readerEl(), anchor?: { x: number; y: number }, instant = false) {
  if (!el) return
  const room = el.clientWidth
  if (!pageOf(el) || room < 820) return // narrow panels always fill (container query)
  let z = zooms.get(el)
  if (!z) {
    const { pageWidth, pageFill } = useChapterReaderStore.getState()
    const start = pageFill ? room : Math.min(pageWidth, room)
    z = { target: start, shown: start, frame: 0, anchor: null }; zooms.set(el, z)
  }
  const next = typeof width === "function" ? width(z.target) : width
  z.target = Math.min(room, Math.max(PAGE_WIDTH.min, next))
  if (instant) z.shown = z.target // the slider follows the thumb directly
  z.anchor = null
  if (anchor) {
    const hit = document.elementFromPoint(anchor.x, anchor.y)?.closest<HTMLElement>("[data-block], [data-preview-chrome]")
    if (hit && el.contains(hit)) { const r = hit.getBoundingClientRect(); z.anchor = { el: hit, y: anchor.y, ratio: r.height ? (anchor.y - r.top) / r.height : 0 } }
  }
  el.dataset.readerZooming = "true"
  if (instant) { cancelAnimationFrame(z.frame); step(el); return }
  if (!z.frame) z.frame = requestAnimationFrame(() => step(el))
}
export function useReaderPageZoom() {
  useEffect(() => {
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return
      const el = (event.target as Element | null)?.closest?.<HTMLElement>(".chapter-reader")
      if (!el) return
      event.preventDefault()
      const dy = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaMode === 2 ? event.deltaY * el.clientHeight : event.deltaY
      const factor = Math.min(1.25, Math.max(0.8, Math.exp(-dy * ZOOM_RATE)))
      zoomReaderTo(current => current * factor, el, { x: event.clientX, y: event.clientY })
    }
    window.addEventListener("wheel", wheel, { passive: false, capture: true })
    return () => window.removeEventListener("wheel", wheel, { capture: true })
  }, [])
}

/** Props for MarkdownEditor's chapter reader layout. */
export function useChapterReader(chapter: ChapterDetail, words: number, readOnly: boolean, hasContent: boolean): MarkdownEditorReader {
  const { align, size, paperBackground, inkBackground, pageWidth, pageFill, font } = useChapterReaderStore(useShallow(s => ({ align: s.align, size: s.size, paperBackground: s.paperBackground, inkBackground: s.inkBackground, pageWidth: s.pageWidth, pageFill: s.pageFill, font: s.font })))
  useReaderPageZoom()
  return useMemo(() => ({
    header: <ChapterReaderHeader chapter={chapter} words={words} />,
    footer: readOnly || !hasContent ? null : <ChapterReaderFooter words={words} />,
    toolbar: <ChapterReaderSettings />,
    className: "chapter-reader",
    contentClassName: "chapter-reader-page",
    attributes: { "data-reader-align": align, "data-reader-size": String(size), "data-reader-paper-bg": paperBackground, "data-reader-ink-bg": inkBackground, "data-reader-width": String(pageWidth), "data-reader-fill": String(pageFill), "data-reader-font": font },
    style: { "--reader-width": `${pageWidth}px`, ...(font === "inherit" ? {} : { "--reader-font": readerFontFamily(font) }) } as CSSProperties,
  }), [chapter, words, readOnly, hasContent, align, size, paperBackground, inkBackground, pageWidth, pageFill, font])
}
