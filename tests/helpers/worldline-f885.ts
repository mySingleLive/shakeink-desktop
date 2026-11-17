/* docs/581 §0 fixture F885: 885 events with the distribution of the LOTM volume-1 import (851 within three years,
 * 34 ancient ones about 200,000 years earlier), on an era calendar (第四纪 / 第五纪). 40 parent/child families (ten of
 * them with a grandchild level), mixed type and importance, and 120 events referenced by narrative cards. Invented names
 * and text only; fully deterministic (no randomness). `fCount(n)` builds the WU-47c variants (exactly n events, one
 * parent with 5 children). */
import { civilDays } from "../../src/lib/planning/era-calendar"
import type { WorldlineView } from "./worldline-browser-fixture"

const H = 24
const FIFTH = civilDays(200001, 1, 1) * H
/** Hour of 第五纪 y-m-d and 第四纪 y-m-d. */
const D5 = (y: number, m: number, d: number) => FIFTH + civilDays(y, m, d) * H
const D4 = (y: number, m: number, d: number) => civilDays(y, m, d) * H
const CALENDAR = { kind: "gregorian", epoch: "0001-01-01T00:00:00Z", hoursPerDay: 24, daysPerMonth: 30, monthsPerYear: 12, eras: [{ name: "第四纪", start: 0 }, { name: "第五纪", start: FIFTH }] }
const CATEGORIES = ["冲突", "谋划", "揭示", "关系", "成长", "变故", "其他"] as const
const PLACES = ["码头", "钟楼", "旧书店", "教堂", "地下市场", "北区", "河谷", "灯塔", "议会厅", "矿井"]
const PEOPLE = [
  { id: "c-a", name: "甲士", avatarUrl: null },
  { id: "c-b", name: "乙客", avatarUrl: null },
  { id: "c-c", name: "丙师", avatarUrl: null },
  { id: "c-d", name: "丁女", avatarUrl: null },
]
type Ev = { id: string; line: string; parent: string | null; title: string; category: string; importance: number; people: string[]; fact: string; duration: number; time: Record<string, unknown> }

/** A fact whose rendered height differs from the text-length estimate (lists, several paragraphs). */
function fact(i: number) {
  const place = PLACES[i % PLACES.length]
  if (i % 5 === 0) return `第 ${i} 号记录：${place}附近出现异常。\n\n- 目击者一\n- 目击者二\n- 目击者三`
  if (i % 3 === 0) return `第 ${i} 号记录：${place}的守夜人报告了一件怪事。\n\n此后数日，${place}一带的居民都说夜里听见了钟声，但没有人看见敲钟的人。`
  return `第 ${i} 号记录：${place}一切如常。`
}
const event = (e: Partial<Ev> & { id: string; title: string; at: number; precision: string }): Ev => ({
  line: "w", parent: null, category: "其他", importance: 1, people: [], fact: "", duration: 0, ...e,
  time: { kind: "exact", value: e.at, precision: e.precision },
}) as Ev

function view(events: Ev[], cards: unknown[] = []): WorldlineView {
  return {
    version: 1,
    data: {
      schemaVersion: 1,
      worlds: [{ id: "w", name: "主世界线", calendar: CALENDAR }],
      lines: [{ id: "n", name: "主线", primary: true }],
      events: events.map(({ ...e }) => { delete (e as Record<string, unknown>).at; delete (e as Record<string, unknown>).precision; return e }),
      periods: [
        { id: "p4", line: "w", title: "第四纪", start: 0, end: FIFTH },
        { id: "p5", line: "w", title: "第五纪", start: FIFTH, end: null, ongoing: true },
        { id: "p-1349", line: "w", title: "钟楼风波", start: D5(1349, 3, 1), end: D5(1349, 6, 1) },
      ],
      cards, volumes: [], chapters: [], connections: [],
    },
    characters: PEOPLE, materials: [], readonly: false, history: [], proposals: [],
  }
}

/** F885: 711 root slots over 第五纪1348–1350 (40 of them family parents), 180 family events, 34 ancient events. */
export function f885(): WorldlineView {
  const events: Ev[] = []
  const d0 = civilDays(1348, 1, 1), span = civilDays(1351, 1, 1) - d0 - 2
  const SLOTS = 711
  let families = 0, k = 0
  for (let i = 0; i < SLOTS; i++) {
    const at = FIFTH + (d0 + Math.floor((i * span) / SLOTS)) * H + (i % 3) * 6
    const n = k++
    const base = {
      category: CATEGORIES[n % 7], importance: n % 7 === 0 ? 3 : n % 5 === 0 ? 2 : 1,
      people: PEOPLE.filter((_, j) => (n + j) % 3 === 0).map(p => p.id), fact: fact(n),
    }
    if (i % 18 === 5 && families < 40) {
      const f = families++
      const parent = event({ id: `f${f}`, title: `家族事件${f}·${PLACES[f % PLACES.length]}风波`, at, precision: "day", ...base, duration: 2 * H })
      events.push(parent)
      for (let c = 0; c < 3; c++) {
        const child = event({ id: `f${f}c${c}`, parent: parent.id, title: `家族事件${f}·阶段${c + 1}`, at: at + (c + 1) * 8, precision: "day",
          category: CATEGORIES[(n + c + 1) % 7], importance: c === 1 ? 2 : 1, fact: fact(n + c + 1) })
        events.push(child)
        if (c === 0 && f % 4 === 0)
          for (let g = 0; g < 2; g++)
            events.push(event({ id: `f${f}c0g${g}`, parent: child.id, title: `家族事件${f}·阶段1·片段${g + 1}`, at: at + 8 + (g + 1) * 2, precision: "day",
              category: CATEGORIES[(n + g) % 7], fact: fact(n + g + 4) }))
      }
    } else events.push(event({ id: `n${i}`, title: `近事${i}·${PLACES[i % PLACES.length]}`, at, precision: "day", ...base }))
  }
  for (let i = 0; i < 34; i++)
    events.push(event({ id: `a${i}`, title: `远古${i}·旧城遗事`, at: D4(5, 1, 1) + i * 10 * H, precision: "year",
      category: CATEGORIES[(i + 3) % 7], importance: i % 6 === 0 ? 3 : 1, fact: fact(i + 1000) }))
  // 120 events with narrative references: every 7th event, 10 references per narrative card.
  const referenced = events.filter((_, i) => i % 7 === 0).slice(0, 120)
  const cards = Array.from({ length: 12 }, (_, c) => ({
    id: `card${c}`, line: "n", title: `叙事卡${c}`,
    tellings: [{ id: `t${c}`, refs: referenced.slice(c * 10, c * 10 + 10).map(e => ({ line: "w", event: e.id })) }],
  }))
  return view(events, cards)
}

/** WU-47c: exactly `n` events (n ≥ 6) on consecutive days of 第五纪1349; event `p0` is a parent with 5 children. */
export function fCount(n: number): WorldlineView {
  const events: Ev[] = []
  const t0 = D5(1349, 1, 1)
  events.push(event({ id: "p0", title: "父事件·五个阶段", at: t0, precision: "day", category: "谋划", importance: 2, duration: 2 * H, fact: fact(0) }))
  for (let c = 0; c < 5; c++)
    events.push(event({ id: `p0c${c}`, parent: "p0", title: `父事件·阶段${c + 1}`, at: t0 + (c + 1) * 6, precision: "day", fact: fact(c + 1) }))
  for (let i = events.length; i < n; i++)
    events.push(event({ id: `r${i}`, title: `日常事件${i}`, at: t0 + i * H, precision: "day", category: CATEGORIES[i % 7], importance: i % 9 === 0 ? 3 : 1, fact: fact(i) }))
  return view(events)
}

export const F885_COUNTS = { total: 885, recent: 851, ancient: 34, families: 40, referenced: 120 }
