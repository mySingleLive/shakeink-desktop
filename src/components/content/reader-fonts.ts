/**
 * 阅读设置 › 正文字体 catalogue (2026-11-28 user: add the common few dozen fonts).
 * Each entry lists family names as installed on macOS / Windows / common free fonts; the first one
 * present wins. Every stack ends in 宋体 + a generic family so text always renders.
 * Ids: legacy short ids (song/kai/hei/fangsong) keep their original stacks; other built-ins use a
 * stable slug; a font picked from 本机字体 is stored as `local:<family>`.
 */
export interface ReaderFont { id: string; label: string; families: string[] }
export interface ReaderFontGroup { label: string; fonts: ReaderFont[] }

const SONG_FALLBACK = ['"Noto Serif SC"', '"Songti SC"', '"STSong"', '"SimSun"', "serif"]
const HEI_FALLBACK = ['"PingFang SC"', '"Microsoft YaHei"', '"Noto Sans SC"', "sans-serif"]

export const READER_FONT_GROUPS: ReaderFontGroup[] = [
  { label: "宋体 / 明体", fonts: [
    { id: "song", label: "宋体", families: ["Noto Serif SC", "Songti SC", "STSong", "SimSun"] },
    { id: "source-han-serif", label: "思源宋体", families: ["Source Han Serif SC", "Source Han Serif CN", "Noto Serif CJK SC", "Noto Serif SC"] },
    { id: "songti-sc", label: "宋体-简（macOS）", families: ["Songti SC"] },
    { id: "stsong", label: "华文宋体", families: ["STSong"] },
    { id: "stzhongsong", label: "华文中宋", families: ["STZhongsong"] },
    { id: "simsun", label: "中易宋体（Windows）", families: ["SimSun", "NSimSun"] },
    { id: "fz-shusong", label: "方正书宋", families: ["FZShuSong-Z01", "FZShuSong-Z01S", "方正书宋_GBK", "方正书宋简体"] },
    { id: "fz-xiaobiaosong", label: "方正小标宋", families: ["FZXiaoBiaoSong-B05", "FZXiaoBiaoSong-B05S", "方正小标宋简体"] },
    { id: "lxgw-neo-zhisong", label: "霞鹜新致宋", families: ["LXGW Neo ZhiSong", "LXGW Neo ZhiSong Screen"] },
    { id: "simsong", label: "宋体-SimSong（macOS）", families: ["SimSong"] },
  ] },
  { label: "楷体", fonts: [
    { id: "kai", label: "楷体", families: ["Kaiti SC", "STKaiti", "KaiTi"] },
    { id: "lxgw-wenkai", label: "霞鹜文楷", families: ["LXGW WenKai", "LXGW WenKai Screen", "霞鹜文楷"] },
    { id: "kaiti-sc", label: "楷体-简（macOS）", families: ["Kaiti SC"] },
    { id: "stkaiti", label: "华文楷体", families: ["STKaiti"] },
    { id: "kaiti-win", label: "中易楷体（Windows）", families: ["KaiTi", "KaiTi_GB2312"] },
    { id: "fz-kaiti", label: "方正楷体", families: ["FZKai-Z03", "FZKai-Z03S", "方正楷体_GBK", "方正楷体简体"] },
    { id: "weibei", label: "魏碑-简", families: ["Weibei SC"] },
  ] },
  { label: "黑体", fonts: [
    { id: "hei", label: "黑体", families: ["PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC"] },
    { id: "pingfang", label: "苹方", families: ["PingFang SC"] },
    { id: "source-han-sans", label: "思源黑体", families: ["Source Han Sans SC", "Source Han Sans CN", "Noto Sans CJK SC", "Noto Sans SC"] },
    { id: "yahei", label: "微软雅黑", families: ["Microsoft YaHei", "Microsoft YaHei UI"] },
    { id: "hiragino", label: "冬青黑体", families: ["Hiragino Sans GB"] },
    { id: "lantinghei", label: "兰亭黑", families: ["Lantinghei SC"] },
    { id: "heiti-sc", label: "黑体-简（macOS）", families: ["Heiti SC", "STHeiti"] },
    { id: "simhei", label: "中易黑体（Windows）", families: ["SimHei"] },
    { id: "dengxian", label: "等线", families: ["DengXian"] },
    { id: "harmony-sans", label: "鸿蒙黑体", families: ["HarmonyOS Sans SC"] },
    { id: "alibaba-puhui", label: "阿里巴巴普惠体", families: ["Alibaba PuHuiTi 3.0", "Alibaba PuHuiTi 2.0", "Alibaba PuHuiTi", "AlibabaPuHuiTi"] },
  ] },
  { label: "仿宋", fonts: [
    { id: "fangsong", label: "仿宋", families: ["STFangsong", "FangSong", "FangSong_GB2312"] },
    { id: "stfangsong", label: "华文仿宋", families: ["STFangsong"] },
    { id: "fangsong-win", label: "中易仿宋（Windows）", families: ["FangSong", "FangSong_GB2312"] },
    { id: "fz-fangsong", label: "方正仿宋", families: ["FZFangSong-Z02", "FZFangSong-Z02S", "方正仿宋_GBK", "方正仿宋简体"] },
  ] },
  { label: "其他", fonts: [
    { id: "yuanti", label: "圆体-简", families: ["Yuanti SC"] },
    { id: "lishu", label: "隶书", families: ["Baoli SC", "LiSu", "STLiti"] },
    { id: "stxingkai", label: "华文行楷", families: ["STXingkai"] },
    { id: "youyuan", label: "幼圆", families: ["YouYuan"] },
    { id: "xingkai-sc", label: "行楷-简", families: ["Xingkai SC"] },
    { id: "libian", label: "隶变-简", families: ["Libian SC"] },
    { id: "hannotate", label: "手札体-简", families: ["Hannotate SC"] },
    { id: "hanzipen", label: "翩翩体-简", families: ["HanziPen SC"] },
    { id: "lingwai", label: "凌慧体-简", families: ["LingWai SC"] },
    { id: "yuppy", label: "雅痞-简", families: ["Yuppy SC"] },
    { id: "wawati", label: "娃娃体-简", families: ["Wawati SC"] },
  ] },
]

const BY_ID = new Map(READER_FONT_GROUPS.flatMap(g => g.fonts).map(f => [f.id, f]))
const LEGACY_FALLBACK: Record<string, string[]> = { hei: HEI_FALLBACK }

export const LOCAL_PREFIX = "local:"
export const fontById = (id: string) => BY_ID.get(id)

/** CSS font-family for a reader font id; "" for 跟随设置. */
export function readerFontFamily(id: string): string {
  if (id === "inherit") return ""
  const families = id.startsWith(LOCAL_PREFIX) ? [id.slice(LOCAL_PREFIX.length)] : BY_ID.get(id)?.families
  if (!families) return SONG_FALLBACK.join(", ")
  const fallback = LEGACY_FALLBACK[id] ?? SONG_FALLBACK
  const own = families.map(f => `"${f}"`)
  return [...own, ...fallback.filter(f => !own.includes(f))].join(", ")
}

/** Built-in fonts whose families are all missing from the local list (only when the list is known). */
export const fontInstalled = (font: ReaderFont, local: Set<string> | null) => !local || font.families.some(f => local.has(f))

/** A stored value: "inherit", a built-in id, `local:<family>`, or (forward-compatible) a raw family name. */
export function validReaderFont(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 200 && !/["\\\u0000-\u001f\u007f]/.test(value)
}
