import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

// docs/611 §1. Pure helpers and the persisted reader settings store.
import { memoryStorage as memory } from "../helpers/memory-local-storage"
import { chineseNumeral, chapterHeading } from "../../src/lib/chapter-reader"
import { useChapterReaderStore, CHAPTER_READER_DEFAULTS } from "../../src/stores/chapter-reader"

const heading = (volume: { index: number; title: string }, chapter: { index: number; title: string }) =>
  chapterHeading({ index: chapter.index, title: chapter.title, volume })

test("CRU-01: chineseNumeral", () => {
  const cases: [number, string][] = [[1, "一"], [9, "九"], [10, "十"], [11, "十一"], [19, "十九"], [20, "二十"], [21, "二十一"], [99, "九十九"],
    [100, "一百"], [101, "一百零一"], [105, "一百零五"], [110, "一百一十"], [213, "二百一十三"], [1000, "一千"], [1001, "一千零一"],
    [1010, "一千零一十"], [10010, "一万零一十"], [0, "0"], [-1, "-1"], [1.5, "1.5"], [100000000, "100000000"]]
  for (const [n, expected] of cases) assert.equal(chineseNumeral(n), expected, String(n))
})

test("CRU-02: volume label", () => {
  assert.equal(heading({ index: 1, title: "第一部 小丑" }, { index: 1, title: "x" }).volumeLabel, "第一部 小丑")
  assert.equal(heading({ index: 2, title: "青石巷" }, { index: 1, title: "x" }).volumeLabel, "第二卷 · 青石巷")
  assert.equal(heading({ index: 3, title: "" }, { index: 1, title: "x" }).volumeLabel, "第三卷")
  assert.equal(heading({ index: 1, title: "第1卷：开端" }, { index: 1, title: "x" }).volumeLabel, "第1卷：开端")
})

test("CRU-03: chapter title that carries its own number", () => {
  const v = { index: 1, title: "卷" }
  assert.deepEqual(pick(heading(v, { index: 1, title: "第一章 绯红" })), ["第一章", "绯红"])
  assert.deepEqual(pick(heading(v, { index: 1, title: "第1章：开端" })), ["第1章", "开端"])
  assert.deepEqual(pick(heading(v, { index: 12, title: "第十二回·夜" })), ["第十二回", "夜"])
  assert.deepEqual(pick(heading(v, { index: 3, title: "第三章" })), ["", "第三章"])
})

test("CRU-04: chapter title without a number", () => {
  const v = { index: 1, title: "卷" }
  assert.deepEqual(pick(heading(v, { index: 3, title: "灯下来客" })), ["第三章", "灯下来客"])
  assert.deepEqual(pick(heading(v, { index: 3, title: "  " })), ["", "第三章"])
  assert.deepEqual(pick(heading(v, { index: 3, title: "第三者" })), ["第三章", "第三者"])
})

test("CRU-05: breadcrumb", () => {
  const a = heading({ index: 2, title: "青石巷" }, { index: 3, title: "灯下来客" })
  assert.equal(a.crumbVolume, "第二卷 青石巷"); assert.equal(a.crumbChapter, "第三章 灯下来客")
  const b = heading({ index: 1, title: "第一部 小丑" }, { index: 1, title: "第一章 绯红" })
  assert.equal(b.crumbVolume, "第一部 小丑"); assert.equal(b.crumbChapter, "第一章 绯红")
  assert.equal(heading({ index: 1, title: "" }, { index: 3, title: "第三章" }).crumbChapter, "第三章")
})

test("CRU-10: edge cases from code review", () => {
  const v = { index: 1, title: "卷" }
  assert.deepEqual(pick(heading(v, { index: 4, title: "第一节课" })), ["第四章", "第一节课"])
  assert.deepEqual(pick(heading(v, { index: 4, title: "第一回合" })), ["第四章", "第一回合"])
  assert.deepEqual(pick(heading(v, { index: 1, title: "第一回 夜宴" })), ["第一回", "夜宴"])
  assert.deepEqual(pick(heading(v, { index: 1, title: "第一章绯红" })), ["第一章", "绯红"])
  assert.deepEqual(pick(heading(v, { index: 1, title: "第一章—绯红" })), ["第一章", "绯红"])
  assert.deepEqual(pick(heading(v, { index: 1, title: "第一章｜绯红" })), ["第一章", "绯红"])
  assert.deepEqual(pick(heading(v, { index: 1, title: "第一章，绯红" })), ["第一章", "绯红"])
  const own = heading({ index: 1, title: "第一卷 · 上 · 下" }, { index: 1, title: "x" })
  assert.equal(own.volumeLabel, "第一卷 · 上 · 下"); assert.equal(own.crumbVolume, "第一卷 · 上 · 下")
  assert.equal(heading({ index: 2, title: "上 · 下" }, { index: 1, title: "x" }).crumbVolume, "第二卷 上 · 下")
})

function pick(h: { numberLabel: string; titleLabel: string }) { return [h.numberLabel, h.titleLabel] }

const reset = async () => { memory.clear(); useChapterReaderStore.setState(structuredClone(CHAPTER_READER_DEFAULTS)); await useChapterReaderStore.persist.rehydrate() }
const settings = () => { const { setReader: _set, ...rest } = useChapterReaderStore.getState(); return rest }

test("CRU-06: store defaults", async () => {
  await reset()
  assert.deepEqual(settings(), { align: "center", showVolume: true, showNumber: true, showWords: true, size: 18, paperBackground: "default", inkBackground: "default", pageWidth: 900, pageFill: false, font: "inherit" })
})

test("CRU-07: store writes and reads back", async () => {
  await reset()
  useChapterReaderStore.getState().setReader({ size: 20, inkBackground: "blue" })
  const saved = memory.get("chapter-reader-v1")!, stored = JSON.parse(saved)
  assert.equal(stored.state.size, 20); assert.equal(stored.state.inkBackground, "blue")
  // Resetting in-memory state also persists; put the saved value back before reading it.
  useChapterReaderStore.setState(structuredClone(CHAPTER_READER_DEFAULTS))
  memory.set("chapter-reader-v1", saved)
  await useChapterReaderStore.persist.rehydrate()
  assert.deepEqual(settings(), { ...CHAPTER_READER_DEFAULTS, size: 20, inkBackground: "blue" })
})

test("CRU-08: invalid stored values fall back to defaults", async () => {
  await reset()
  memory.set("chapter-reader-v1", JSON.stringify({ state: { align: "right", size: 17, showWords: "yes", paperBackground: "blue", inkBackground: "green" }, version: 0 }))
  await useChapterReaderStore.persist.rehydrate()
  assert.deepEqual(settings(), { ...CHAPTER_READER_DEFAULTS, inkBackground: "green" })
  memory.set("chapter-reader-v1", "not json")
  useChapterReaderStore.setState(structuredClone(CHAPTER_READER_DEFAULTS))
  await useChapterReaderStore.persist.rehydrate()
  assert.deepEqual(settings(), CHAPTER_READER_DEFAULTS)
})

test("CRU-09: preview selection treats reader chrome as UI", () => {
  assert.match(readFileSync("src/components/editor/preview-selection.ts", "utf8"), /const ui = "[^"]*\[data-preview-chrome\]/)
})

test("CR611-61: reuse manifest records the adapted files", async () => {
  const { createHash } = await import("node:crypto")
  const manifest = JSON.parse(readFileSync("docs/reuse-manifest.json", "utf8")) as { files: { source: string; status: string; currentSha256?: string }[] }
  for (const source of ["src/components/content/ChapterContentPanel.tsx", "src/components/comments/CommentablePreview.tsx", "src/components/editor/MarkdownEditor.tsx"]) {
    const entry = manifest.files.find(e => e.source === source)!
    assert.equal(entry.status, "adapted-desktop-boundary", source)
    assert.equal(entry.currentSha256, createHash("sha256").update(readFileSync(source)).digest("hex"), source)
  }
})

test("CRU-11: page width is clamped to 540–2400 (60% of 900) and rounded; fill is a boolean", async () => {
  await reset()
  const set = useChapterReaderStore.getState().setReader
  set({ pageWidth: 5000 }); assert.equal(useChapterReaderStore.getState().pageWidth, 2400)
  set({ pageWidth: 100 }); assert.equal(useChapterReaderStore.getState().pageWidth, 540)
  set({ pageWidth: 801.6 }); assert.equal(useChapterReaderStore.getState().pageWidth, 802)
  set({ pageFill: true }); assert.equal(useChapterReaderStore.getState().pageFill, true)
  memory.set("chapter-reader-v1", JSON.stringify({ state: { pageWidth: "wide", pageFill: "yes" }, version: 0 }))
  await useChapterReaderStore.persist.rehydrate()
  assert.equal(useChapterReaderStore.getState().pageWidth, 900); assert.equal(useChapterReaderStore.getState().pageFill, false)
})

test("CRU-12: body font choice", async () => {
  await reset()
  const set = useChapterReaderStore.getState().setReader
  for (const font of ["song", "kai", "hei", "fangsong", "inherit", "LXGW WenKai", "local:某字体"]) { set({ font }); assert.equal(useChapterReaderStore.getState().font, font) }
  for (const bad of [42, "", "x".repeat(201), "bad\"name", "a\nb"]) {
    memory.set("chapter-reader-v1", JSON.stringify({ state: { font: bad }, version: 0 }))
    await useChapterReaderStore.persist.rehydrate(); assert.equal(useChapterReaderStore.getState().font, "inherit", JSON.stringify(bad))
  }
})

test("CRU-13: the old 760px default moves to the new 900px default; chosen widths are kept", async () => {
  await reset()
  memory.set("chapter-reader-v1", JSON.stringify({ state: { pageWidth: 760, size: 20 }, version: 0 }))
  await useChapterReaderStore.persist.rehydrate()
  assert.equal(useChapterReaderStore.getState().pageWidth, 900); assert.equal(useChapterReaderStore.getState().size, 20)
  memory.set("chapter-reader-v1", JSON.stringify({ state: { pageWidth: 1000 }, version: 0 }))
  await useChapterReaderStore.persist.rehydrate()
  assert.equal(useChapterReaderStore.getState().pageWidth, 1000)
})

test("CRU-14: slider position ↔ percent puts 100% in the middle", async () => {
  const { percentAt, positionOf } = await import("../../src/components/content/reader-zoom")
  assert.equal(percentAt(0, 133), 60); assert.equal(percentAt(500, 133), 100); assert.equal(percentAt(1000, 133), 133)
  assert.equal(percentAt(250, 133), 80); assert.equal(percentAt(750, 200), 150)
  for (const max of [101, 133, 250]) for (const pct of [60, 73, 100, Math.round((100 + max) / 2), max]) assert.equal(Math.round(percentAt(positionOf(pct, max), max)), pct, `${pct}/${max}`)
  assert.equal(positionOf(100, 100), 500, "100% stays in the middle even when it is also the maximum")
})

test("CRU-15: built-in font catalogue", async () => {
  const { READER_FONT_GROUPS, readerFontFamily } = await import("../../src/components/content/reader-fonts")
  const all = READER_FONT_GROUPS.flatMap(g => g.fonts)
  assert.ok(all.length >= 28, String(all.length))
  assert.equal(new Set(all.map(f => f.id)).size, all.length, "ids are unique")
  for (const f of all) assert.ok(f.label && f.families.length, f.id)
  // legacy ids map to the original stacks
  assert.match(readerFontFamily("kai"), /^"Kaiti SC"/); assert.match(readerFontFamily("song"), /^"Noto Serif SC"/)
  // every stack ends in a generic family
  for (const f of all) assert.match(readerFontFamily(f.id), /(serif|sans-serif|monospace|cursive)$/, f.id)
  // a local font is quoted and falls back to 宋体
  assert.equal(readerFontFamily("local:某字体"), '"某字体", "Noto Serif SC", "Songti SC", "STSong", "SimSun", serif')
  assert.equal(readerFontFamily("inherit"), "")
})
