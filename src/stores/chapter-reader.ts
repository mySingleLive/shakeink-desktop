"use client"
import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"
import { validReaderFont } from "@/components/content/reader-fonts"

/** docs/611: chapter reader preferences. Local to this renderer (data-root session storage), saved on every change. */
export const READER_SIZES = [16, 18, 20, 22] as const
export const PAPER_BACKGROUNDS = ["default", "green", "white"] as const
export const INK_BACKGROUNDS = ["default", "green", "blue", "black"] as const
/**
 * Book page width in px, changed continuously with Ctrl + wheel (2026-11-28 user). Text size is separate.
 * `pageFill` means the page covers the whole panel (no page edge visible) whatever the panel width.
 */
export const PAGE_WIDTH = { min: 540, max: 2400, default: 900 } as const
/** The previous default (before 2026-11-28); a stored 760 meant "never changed" and moves to the new default. */
const OLD_DEFAULT_WIDTH = 760
/** 页面缩放 percentage = pageWidth / default (100% = 900px); slider mapping in components/content/reader-zoom.ts. */
export interface ChapterReaderSettings {
  align: "center" | "left"
  showVolume: boolean
  showNumber: boolean
  showWords: boolean
  size: (typeof READER_SIZES)[number]
  paperBackground: (typeof PAPER_BACKGROUNDS)[number]
  inkBackground: (typeof INK_BACKGROUNDS)[number]
  pageWidth: number
  pageFill: boolean
  /** 正文字体: "inherit" (设置 › 正文字体), a built-in id (reader-fonts.ts) or `local:<family>` */
  font: string
}
export const CHAPTER_READER_DEFAULTS: ChapterReaderSettings = {
  align: "center", showVolume: true, showNumber: true, showWords: true, size: 18, paperBackground: "default", inkBackground: "default", pageWidth: PAGE_WIDTH.default, pageFill: false, font: "inherit",
}

const oneOf = <T,>(values: readonly T[], value: unknown, fallback: T): T => values.includes(value as T) ? value as T : fallback
const flag = (value: unknown, fallback: boolean) => typeof value === "boolean" ? value : fallback
export function sanitizeReaderSettings(raw: unknown): ChapterReaderSettings {
  const v = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>, d = CHAPTER_READER_DEFAULTS
  return {
    align: oneOf(["center", "left"] as const, v.align, d.align),
    showVolume: flag(v.showVolume, d.showVolume), showNumber: flag(v.showNumber, d.showNumber), showWords: flag(v.showWords, d.showWords),
    size: oneOf(READER_SIZES, v.size, d.size),
    paperBackground: oneOf(PAPER_BACKGROUNDS, v.paperBackground, d.paperBackground),
    inkBackground: oneOf(INK_BACKGROUNDS, v.inkBackground, d.inkBackground),
    pageWidth: typeof v.pageWidth === "number" && Number.isFinite(v.pageWidth)
      ? Math.min(PAGE_WIDTH.max, Math.max(PAGE_WIDTH.min, Math.round(v.pageWidth))) : d.pageWidth,
    pageFill: flag(v.pageFill, d.pageFill),
    font: validReaderFont(v.font) ? v.font : d.font,
  }
}

interface State extends ChapterReaderSettings { setReader: (patch: Partial<ChapterReaderSettings>) => void }
export const useChapterReaderStore = create<State>()(persist(set => ({
  ...CHAPTER_READER_DEFAULTS,
  setReader: patch => set(state => sanitizeReaderSettings({ ...state, ...patch })),
}), {
  name: "chapter-reader-v1",
  storage: createJSONStorage(() => localStorage),
  partialize: ({ setReader: _set, ...settings }) => settings,
  merge: (persisted, current) => {
    const raw = persisted && typeof persisted === "object" ? persisted as Record<string, unknown> : {}
    return { ...current, ...sanitizeReaderSettings(raw.pageWidth === OLD_DEFAULT_WIDTH ? { ...raw, pageWidth: PAGE_WIDTH.default } : raw) }
  },
}))
