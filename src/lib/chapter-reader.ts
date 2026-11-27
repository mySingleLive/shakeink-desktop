/** docs/611: labels for the chapter reader header and breadcrumb. */
const DIGITS = "零一二三四五六七八九"
const NUMERAL = "[0-9０-９零〇一二三四五六七八九十百千万萬亿億两兩壹贰貳叁參肆伍陆陸柒捌玖拾佰仟廿卅]+"
const VOLUME_PREFIX = new RegExp(`^第\\s*${NUMERAL}\\s*[卷部册冊篇]`, "u")
const SEPARATORS = "\\s\\u3000：:·、.．\\-—｜|，,"
/** 第N章 may run straight into the title (第一章绯红); 节/回 need a separator or the end, so 第一节课 / 第一回合 stay titles. */
const CHAPTER_PREFIX = new RegExp(`^(第\\s*${NUMERAL}\\s*(?:章|[节節回](?=[${SEPARATORS}]|$)))[${SEPARATORS}]*`, "u")

function belowTenThousand(n: number): string {
  const units = ["千", "百", "十", ""]
  const parts = [Math.floor(n / 1000), Math.floor(n / 100) % 10, Math.floor(n / 10) % 10, n % 10]
  let out = "", zero = false
  parts.forEach((digit, i) => {
    if (digit === 0) { if (out) zero = true; return }
    if (zero) { out += "零"; zero = false }
    out += (digit === 1 && units[i] === "十" && !out ? "" : DIGITS[digit]) + units[i]
  })
  return out
}

/** Positive integers below 100 million as Chinese numerals; anything else stays Arabic. */
export function chineseNumeral(n: number): string {
  if (!Number.isInteger(n) || n <= 0 || n >= 100_000_000) return String(n)
  const high = Math.floor(n / 10_000), low = n % 10_000
  if (!high) return belowTenThousand(low)
  const lowText = low ? (low < 1000 ? "零" : "") + belowTenThousand(low).replace(/^十/, "一十") : ""
  return belowTenThousand(high) + "万" + lowText
}

export interface ChapterHeading {
  volumeLabel: string
  /** Empty when the title itself is only the number (it is then shown as the title). */
  numberLabel: string
  titleLabel: string
  crumbVolume: string
  crumbChapter: string
}

export function chapterHeading(chapter: { index: number; title: string; volume: { index: number; title: string } }): ChapterHeading {
  const volumeTitle = chapter.volume.title.trim()
  const volumeNumber = `第${chineseNumeral(chapter.volume.index)}卷`
  const ownVolumeNumber = VOLUME_PREFIX.test(volumeTitle)
  const volumeLabel = !volumeTitle ? volumeNumber : ownVolumeNumber ? volumeTitle : `${volumeNumber} · ${volumeTitle}`

  const title = chapter.title.trim()
  const own = CHAPTER_PREFIX.exec(title)
  let numberLabel: string, titleLabel: string
  if (own) {
    numberLabel = own[1].replace(/\s+/g, "")
    titleLabel = title.slice(own[0].length).trim()
  } else {
    numberLabel = `第${chineseNumeral(chapter.index)}章`
    titleLabel = title
  }
  if (!titleLabel) { titleLabel = numberLabel; numberLabel = "" }

  return {
    volumeLabel,
    numberLabel,
    titleLabel,
    crumbVolume: volumeTitle && !ownVolumeNumber ? `${volumeNumber} ${volumeTitle}` : volumeLabel,
    crumbChapter: numberLabel ? `${numberLabel} ${titleLabel}` : titleLabel,
  }
}
