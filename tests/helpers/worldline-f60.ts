/* docs/581 §0 fixture F60: the structure of the approved design v9 (design/worldline-redesign/data.js) on the real
 * planning schema. Invented names and text only. Hours are on a fixed calendar (24 h / 30 d / 12 m), so 1 year = 8640 h.
 * 4 parent events, two of them with a grandchild level, 2 unplaced events, 4 periods, two ancient events ~200,000 years
 * back, 6 characters (3 with an avatar). */
import type { WorldlineView } from "./worldline-browser-fixture"

const H = 24, M = 30 * H, Y = 12 * M
const categories = ["冲突", "谋划", "揭示", "关系", "成长", "变故", "其他"] as const
const titles = ["钟楼守夜人在雾夜失踪", "港口商会签下秘密契约", "学徒在旧书中发现星图", "巡夜队封锁北区码头", "占卜师预言三日后的月蚀",
  "议员在宴会上遇刺未遂", "地下拍卖会出现古代银匙", "教会派出调查小队", "废弃矿井深处传出钟声", "学者破译石板第一段",
  "雨夜列车在河谷脱轨", "黑市药剂师被巡夜队逮捕", "灯塔看守交出航海日志", "巡夜队长在追捕中重伤", "一封匿名信送到报社",
  "王室宣布新的港口税法", "老城区连夜大火", "商会会长公开道歉", "学徒通过第一次晋升仪式", "月蚀之夜的仪式失控",
  "北区码头解除封锁", "调查小队带回三件遗物", "报社刊登匿名长信全文", "破译石板的学者失踪", "矿井被永久封闭",
  "新任巡夜队长上任", "银匙被秘密送往首都", "占卜师连夜离开城市", "钟楼重新敲响", "议会召开紧急会议",
  "学徒收到来自首都的邀请", "旧书店老板承认藏匿禁书", "码头工人罢工三天", "调查小队第二次进入矿井", "星图指向南方群岛"]
const CAT = [5, 1, 2, 0, 2, 0, 2, 1, 2, 2, 5, 0, 3, 0, 1, 6, 5, 3, 4, 5, 6, 2, 2, 5, 6, 4, 1, 3, 6, 1, 4, 2, 0, 0, 2]
const KEY = new Set([2, 5, 18, 19, 23, 34]), MAJOR = new Set([0, 1, 9, 10, 13, 16, 21, 30])
const GAPS = [0, 1, 1, 2, 3, 5, 0, 9, 1, 16, 2, 0, 3, 1, 5, 9, 2, 1, 0, 3, 16, 1, 2, 5, 3, 0, 9, 1, 2, 16, 3, 1, 5, 2, 9]
export const PEOPLE = [
  { id: "c-allen", name: "艾伦", avatarUrl: "data:image/gif;base64,R0lGODlhAQABAAAAACw=" },
  { id: "c-mira", name: "米拉", avatarUrl: "data:image/gif;base64,R0lGODlhAQABAAAAACw=" },
  { id: "c-kos", name: "柯斯", avatarUrl: "data:image/gif;base64,R0lGODlhAQABAAAAACw=" },
  { id: "c-nova", name: "诺瓦", avatarUrl: null },
  { id: "c-selin", name: "赛琳", avatarUrl: null },
  { id: "c-od", name: "奥德", avatarUrl: null },
]
type Ev = Record<string, unknown> & { id: string; title: string }
export function f60(): WorldlineView {
  const events: Ev[] = []
  let n = 0
  const add = (e: Partial<Ev> & { title: string }) => { const ev = { id: `e${++n}`, line: "w", parent: null, ...e } as Ev; events.push(ev); return ev }
  add({ title: "旧纪诸王建立第一座石城", category: "成长", importance: 2, time: { kind: "exact", value: -200000 * Y + 120 * Y, precision: "year" }, fact: "石城遗址的壁画记载了最早的星辰崇拜。" })
  add({ title: "大洪水淹没低地王国", category: "变故", importance: 3, time: { kind: "exact", value: -200000 * Y + 9400 * Y, precision: "year" }, fact: "多部古籍都提到这场持续四十天的洪水。" })
  add({ title: "七王盟约签订", category: "关系", importance: 2, time: { kind: "exact", value: 342 * Y + 4 * M, precision: "month" }, fact: "盟约确立了延续至今的港口自治传统。" })
  add({ title: "王立大学建校", time: { kind: "exact", value: 1178 * Y + 8 * M + 11 * H, precision: "day" }, fact: "首任校长是一位来自南方群岛的学者。" })
  let t = 1348 * Y + 9 * M + 3 * H
  titles.forEach((title, i) => {
    t += GAPS[i] * H
    const people = PEOPLE.filter((_, k) => (i + k) % 4 === 0).slice(0, 5).map(p => p.id)
    const e = add({ title, category: categories[CAT[i]], importance: KEY.has(i) ? 3 : MAJOR.has(i) ? 2 : 1, people,
      time: { kind: "exact", value: t, precision: "day" }, duration: i % 7 === 3 ? (6 + i) * H : 0,
      fact: `第 ${i + 1} 件事：目击者称当晚雾气异常浓重。` + (i % 3 ? "" : "\n\n后续调查显示，此事与港口商会的账目往来存在关联。") })
    if (i === 12) e.time = { kind: "window", value: t, end: t + 8 * H, label: "原文只说“那一周的某天”" }
    if (i % 9 === 1) {
      e.duration = 12 * H
      ;["先遣人员抵达现场", "与当地居民发生冲突", "带走关键证物"].forEach((c, k) => {
        const child = add({ title: `${title}·${c}`, parent: e.id, category: (["谋划", "冲突", "揭示"] as const)[k], importance: k === 1 ? 2 : 1,
          time: { kind: "exact", value: t + k * 4 * H, precision: "day" }, fact: `这是“${title}”中的一个阶段。` })
        if (k === 1 && i < 20) {
          child.duration = 3 * H
          ;["冲突中有人受伤", "巡夜队赶到驱散人群"].forEach((g, j) => add({ title: `${title}·${g}`, parent: child.id, category: j ? "谋划" : "冲突",
            time: { kind: "exact", value: t + (5 + j) * H, precision: "day" }, fact: `这是“${c}”中的一个片段。` }))
        }
      })
    }
  })
  add({ title: "某位学者的日记被人烧毁", time: { kind: "unknown" }, fact: "原文没有给出任何时间线索。" })
  add({ title: "一艘无名船只出现在雾中", category: "揭示", time: { kind: "unknown" }, fact: "只出现在一段回忆里，时间不明。" })
  const at = (title: string) => (events.find(e => e.title === title)!.time as { value: number }).value
  return {
    version: 1,
    data: {
      schemaVersion: 1,
      worlds: [{ id: "w", name: "主世界线", calendar: { kind: "fixed", epoch: "新历元年", hoursPerDay: 24, daysPerMonth: 30, monthsPerYear: 12 } }],
      events,
      periods: [
        { id: "p1", line: "w", title: "旧纪", start: -200000 * Y, end: 0 },
        { id: "p2", line: "w", title: "新历", start: 0, end: null, ongoing: true },
        { id: "p3", line: "w", title: "港口危机", start: 1348 * Y + 10 * M, end: 1349 * Y + 2 * M },
        { id: "p4", line: "w", title: "月蚀风波", start: at("占卜师预言三日后的月蚀"), end: at("北区码头解除封锁") },
      ],
      lines: [], cards: [], volumes: [], chapters: [], connections: [],
    },
    characters: PEOPLE, materials: [], readonly: false, history: [], proposals: [],
  }
}
