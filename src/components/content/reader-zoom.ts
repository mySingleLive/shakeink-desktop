/**
 * 阅读设置 › 页面缩放 slider mapping (2026-11-28 user: 100% sits in the middle of the track).
 * The track runs 0…1000: the left half maps linearly to 60%…100%, the right half to 100%…max
 * (max = the panel width, i.e. 铺满). Kept pure for unit tests.
 */
export const TRACK = 1000
export const MIN_PERCENT = 60
const MID = TRACK / 2

export function percentAt(position: number, max: number): number {
  const p = Math.min(TRACK, Math.max(0, position))
  if (p <= MID) return MIN_PERCENT + (100 - MIN_PERCENT) * p / MID
  return 100 + (Math.max(100, max) - 100) * (p - MID) / MID
}

export function positionOf(percent: number, max: number): number {
  if (percent <= 100) return Math.round(MID * (Math.max(MIN_PERCENT, percent) - MIN_PERCENT) / (100 - MIN_PERCENT))
  if (max <= 100) return MID
  return Math.round(MID + MID * (Math.min(max, percent) - 100) / (max - 100))
}

/** A typed value such as "85", "85%", "８５" → a number, or null when it is not a number. */
export function parsePercent(text: string): number | null {
  const ascii = text.trim().replace(/[０-９．]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[%％]$/, "").trim()
  if (!/^\d+(\.\d+)?$/.test(ascii)) return null
  return Math.round(Number(ascii))
}
