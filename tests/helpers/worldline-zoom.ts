/* docs/592 §6.2 fixture zoomView: a worldline for the timeline zoom levels. Invented names and text only; deterministic.
 * Fixed calendar (24 h / 30 d / 12 m). n roots one every 30 days (gap 720 h), importance 1/2/3 in turn, types in turn,
 * short (6) and long (28 characters) titles alternating. Root 3 and root 9 are 一般 parents with three children
 * (importance 1, 2, 1); root 5 is a 关键 parent with two 一般 children. Root 9 has a long title. Two characters. */
import type { WorldlineView } from "./worldline-browser-fixture"

export const ZOOM_GAP = 720
const CATEGORIES = ["冲突", "谋划", "揭示", "关系", "成长", "变故", "其他"] as const
const SHORT = ["北塔钟声", "港口封锁", "旧书星图", "河谷列车", "雾夜来信", "灯塔日志"]
const LONG = "码头工人在雨夜里连续罢工三天之后，商会终于派人前来谈判"
/** docs/597: `leavesOnly` drops the parents (r2, r4, r8 become leaves without children); `longRoot` gives that root a
 * duration of three root gaps, so its bar pushes the next roots to a lower row. */
export function zoomView(n = 24, options: { withKey?: boolean; leavesOnly?: boolean; longRoot?: number } = {}): WorldlineView {
  const withKey = options.withKey ?? true, leaves = options.leavesOnly ?? false
  const events: Record<string, unknown>[] = []
  const add = (e: Record<string, unknown>) => events.push({ line: "w", parent: null, fact: "", people: [], duration: 0, ...e })
  for (let i = 0; i < n; i++) {
    const t = 1000 * 8640 + i * ZOOM_GAP
    const importance = withKey ? (i % 3) + 1 : (i % 2) + 1
    // r8 is a parent with a long title (a two-line event-table group header, ZB-02).
    const title = i % 2 || i === 8 ? `${i + 1}·${LONG}`.slice(0, 28) : `${SHORT[i % SHORT.length]}${i + 1}`
    const id = `r${i}`
    // A parent lasts 8 days, so its children (2, 4 and 6 days in) sit inside it (the planning schema checks this).
    const parent = !leaves && (i === 2 || i === 8 || (i === 4 && withKey))
    add({ id, title, category: CATEGORIES[i % 7], importance: i === 2 || i === 8 ? 1 : i === 4 && withKey ? 3 : importance, people: i % 4 === 0 ? ["c-a"] : [],
      duration: parent ? 192 : i === options.longRoot ? 3 * ZOOM_GAP : 0, time: { kind: "exact", value: t, precision: "day" } })
    if (parent && (i === 2 || i === 8))
      [1, 2, 1].forEach((imp, k) => add({ id: `${id}c${k}`, parent: id, title: `${title}·阶段${k + 1}`, category: CATEGORIES[(i + k) % 7], importance: imp,
        time: { kind: "exact", value: t + (k + 1) * 48, precision: "day" } }))
    if (parent && i === 4)
      [1, 1].forEach((imp, k) => add({ id: `${id}c${k}`, parent: id, title: `${title}·分支${k + 1}`, category: CATEGORIES[(i + k) % 7], importance: imp,
        time: { kind: "exact", value: t + (k + 1) * 48, precision: "day" } }))
  }
  return {
    version: 1,
    data: {
      schemaVersion: 1,
      worlds: [{ id: "w", name: "主世界线", calendar: { kind: "fixed", epoch: "新历元年", hoursPerDay: 24, daysPerMonth: 30, monthsPerYear: 12 } }],
      events, periods: [], lines: [], cards: [], volumes: [], chapters: [], connections: [],
    },
    characters: [{ id: "c-a", name: "艾伦", avatarUrl: null }, { id: "c-b", name: "米拉", avatarUrl: null }],
    materials: [], readonly: false, history: [], proposals: [],
  }
}
