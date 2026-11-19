/**
 * docs/580 §4–§5: pure layout functions for the redesigned worldline panel (event table and timeline).
 * No DOM and no React: every position the panel draws comes from here, so it can be unit tested (docs/581 §2).
 */
import { civilDays, civilFromDays, eraLabel, ERA_MAX_YEAR, type EraPrecision } from "./era-calendar";
import {
  fitDenseTimelineWindow,
  fitTimelineWindow,
  formatTime,
  axisPrecision,
  type AxisPrecision,
  timeBaseValue,
  type Calendar,
} from "./timeline";
import {
  resolveTime,
  type EventCategory,
  type PlanningData,
  type PlanningEvent,
} from "./domain";

// ---------- constants (§5.1, design v9 app.js:104, :150, :203) ----------
export const CARD_HEIGHT = 34;
export const CARD_GAP = 6;
export const GROUP_PADDING = 10;
/** docs/588 §1: the parent card is the group header, flush with the box top and as wide as the box. */
export const GROUP_HEAD_HEIGHT = 36;
export const GROUP_HEAD_GAP = 4;
export const TABLE_INDENT = 18;
export const TREE_INDENT = 16;
export const BREAK_HEIGHT = 46;
/** docs/586 §1: event-table time stretch. Block starts of adjacent roots are at least min(GAP_MAX, Δt × k) apart. */
export const GAP_MAX = 240;
/** docs/586 §1: the finest table scale, in px per hour of the label calendar (1 minute = 1 px). */
export const TABLE_SCALE_MAX = 60;
/** Rail: dots closer than this merge into a cluster; labels closer than LABEL_MIN_GAP are skipped (WU-13, WU-14). */
export const CLUSTER_PX = 4;
export const LABEL_MIN_GAP = 18;
/** Month tick labels closer than this are skipped (design v9 app.js:182; 577's 48px was a draft value). */
export const TICK_LABEL_GAP = 44;
/** A year badge sits this far above the first card of a segment. */
export const SEGMENT_BADGE_OFFSET = 22;
export const BREAK_DAYS = 30;
export const BREAK_MEDIAN_FACTOR = 20;
/** Timeline card widths (577 §12; docs/583 R1: collapsed cards follow the title up to these caps). */
export const ROOT_CARD_WIDTH = 340;
export const CHILD_CARD_WIDTH = 300;
export const COLLAPSED_MIN_WIDTH = 150;
export const OPEN_CARD_WIDTH = 420;
export const PARENT_BAR_MIN_WIDTH = 260;
export const FAMILY_H_GAP = 14;
export const FAMILY_V_GAP = 30;
export const PLANE_TOP = 28;
export const CHILD_ROW_GAP = 10;
export const LANE_GAP = 40;
/** §5.2: re-base the plane once the window start is this many px away from the base. */
export const REBASE_PX = 1_000_000;
export const MINIMAP_GAP = 14;
export const CLIP_START_LABEL = "‹ 起点在视野外";
export const CLIP_END_LABEL = "延续到视野外 ›";

/** §7.1 S11: the only mapping from an event category to its theme variable (globals.css defines the values). */
export const CATEGORY_VAR: Readonly<Record<EventCategory, string>> = {
  冲突: "--event-conflict",
  谋划: "--event-scheme",
  揭示: "--event-reveal",
  关系: "--event-relation",
  成长: "--event-growth",
  变故: "--event-change",
  其他: "--event-other",
};

// ---------- calendar adapter (§4) ----------
export type BoundaryUnit = "era" | "year" | "month";
export interface CalendarAdapter {
  /** The calendar labels are read in (the time base's calendar when one is active). */
  readonly calendar: Calendar;
  readonly hasEras: boolean;
  readonly hasYears: boolean;
  readonly hasMonths: boolean;
  /** One day of the label calendar, in worldline units. */
  readonly dayHours: number;
  /** One day of the worldline's own calendar, in worldline units (table zoom spacing). */
  readonly ownDayHours: number;
  /** "30 days" in worldline units: the rail break threshold. */
  readonly breakHours: number;
  /** Worldline value → time-base value; null when the base is not mapped. */
  toDisplay(value: number): number | null;
  /** Worldline values of era/year/month starts inside [t0, t1], ascending. */
  boundaries(t0: number, t1: number, unit: BoundaryUnit): number[];
  /** Full label (cards, search "time text"): `formatTime` on the time base. */
  label(value: number, span: number, precision?: EraPrecision): string;
  /** Rail dot label (WU-13b): 12月1日 / 1349年12月 / 1349年 / 第四纪; empty for a year already on a badge. */
  railLabel(value: number, precision: EraPrecision, yearShown?: boolean): string;
  /** Directory short time: M-DD, or the era name for era precision. */
  short(value: number, precision?: EraPrecision): string;
  /** Event-directory time: always the month and day (6月28日, 6月28日 14:05 for hour records), 约 when finer than
   * the record; the year is dropped when the directory's year header already shows it. */
  treeTime(value: number, precision: EraPrecision, yearShown: boolean): string;
  /** docs/585 §1: the precision the axis reads at a window span (in worldline units). */
  axisPrecision(span: number): AxisPrecision;
  /** docs/585 §3: timeline card stamp, one precision finer than the axis; 约 when finer than the record. */
  stamp(value: number, axis: AxisPrecision, time: StampTime): string;
  /** docs/586 §2: rail units in worldline units (`hour` is one label-calendar hour); null without months. */
  readonly railUnits: { year: number | null; month: number; day: number; hour: number } | null;
  /** docs/586 §3: event-table rail label at a zoom level; `compact` drops the month before 上午/下午 or a time. */
  railText(value: number, level: RailLevel, time: StampTime, compact?: boolean): string;
  /** docs/586 §3: `${year}年` without the era name, the dedup key of a year badge; empty without years. */
  yearKey(value: number): string;
  yearText(value: number): string;
  monthText(value: number): string;
  /** The era holding the value, in worldline units; null on calendars without eras or before the first era. */
  eraOf(value: number): { name: string; start: number; end: number | null } | null;
}
export type RailLevel = "year" | "month" | "day" | "half" | "minute";
export interface StampTime {
  kind: "exact" | "window" | "unknown";
  precision: EraPrecision;
}
const PRECISION_RANK: Readonly<Record<EraPrecision, number>> = { era: 0, year: 1, month: 2, day: 3, hour: 4 };
const FINER: Readonly<Record<AxisPrecision, "month" | "day" | "hour">> = { year: "month", month: "day", day: "hour", hour: "hour" };
export interface TimeBaseInput {
  calendar: Calendar;
  scale: number;
  /** Time-base value of worldline value 0 (`timeBaseValue(…, 0)`); null when unmapped. */
  zero: number | null;
}

const BOUNDARY_LIMIT = 5000;
const MS_HOUR = 3_600_000;
const EPOCH_1970_HOURS = civilDays(1970, 1, 1) * 24;
interface CivilParts {
  era: string | null;
  year: number | null;
  month: number;
  day: number;
}

export function createCalendarAdapter(
  own: Calendar,
  base?: TimeBaseInput,
): CalendarAdapter {
  const cal = base?.calendar ?? own,
    scale = base?.scale ?? 1,
    zero = base ? base.zero : 0;
  const toDisplay = (v: number) => (zero === null ? null : v * scale + zero);
  const toWorld = (d: number) => (d - (zero ?? 0)) / scale;
  const eras =
    cal.kind === "gregorian"
      ? [...cal.eras].sort((a, b) => a.start - b.start)
      : [];
  const epochMs = cal.kind === "gregorian" ? Date.parse(cal.epoch) : NaN;
  // Hours from civil day 0 (year 1-01-01) to the calendar epoch; plain gregorian only.
  const epochHours = Number.isFinite(epochMs)
    ? EPOCH_1970_HOURS + epochMs / MS_HOUR
    : null;
  const civilGregorian = cal.kind === "gregorian" && (eras.length > 0 || epochHours !== null);
  const fixedDay = cal.kind === "fixed" ? cal.hoursPerDay : null,
    fixedMonth = fixedDay && cal.kind === "fixed" && cal.daysPerMonth ? fixedDay * cal.daysPerMonth : null,
    fixedYear = fixedMonth && cal.kind === "fixed" && cal.monthsPerYear ? fixedMonth * cal.monthsPerYear : null;
  const hasMonths = civilGregorian || fixedMonth !== null,
    hasYears = civilGregorian || fixedYear !== null,
    hasEras = eras.length > 0;
  const displayDay =
    cal.kind === "years" ? 1 / 365.2425 : cal.kind === "fixed" ? (cal.hoursPerDay ?? 24) : 24;
  const dayHours = displayDay / scale;
  // "30 days" in the label calendar's unit, then back to worldline units (§4).
  const breakDisplay =
    cal.kind === "years" ? BREAK_DAYS / 365.2425 : BREAK_DAYS * displayDay;

  /** Day number inside the civil frame, with float noise rounded away (as eraLabel does). */
  const dayIndex = (hours: number) => Math.floor(Math.round((hours / 24) * 1e6) / 1e6);
  const eraAt = (d: number) => {
    let at = -1;
    for (let i = 0; i < eras.length; i++) if (eras[i].start <= d) at = i;
    return at;
  };
  function civil(d: number): CivilParts | null {
    if (cal.kind === "gregorian") {
      if (eras.length) {
        const i = eraAt(d);
        if (i < 0) return null;
        const c = civilFromDays(dayIndex(d - eras[i].start));
        return { era: eras[i].name || "", year: c.year, month: c.month, day: c.day };
      }
      if (epochHours === null) return null;
      const c = civilFromDays(dayIndex(d + epochHours));
      return { era: null, year: c.year, month: c.month, day: c.day };
    }
    if (cal.kind === "fixed" && fixedDay && fixedMonth) {
      const mod = (a: number, b: number) => a - Math.floor(a / b) * b;
      return {
        era: null,
        year: fixedYear ? Math.floor(d / fixedYear) + 1 : null,
        month: Math.floor((fixedYear ? mod(d, fixedYear) : d) / fixedMonth) + 1,
        day: Math.floor(mod(d, fixedMonth) / fixedDay) + 1,
      };
    }
    return null;
  }

  /** Civil frames: [from, to] pieces of the display range, each with the hour of its day 0. */
  function frames(d0: number, d1: number) {
    if (eras.length)
      return eras
        .map((e, i) => ({
          origin: e.start,
          from: Math.max(d0, e.start),
          to: Math.min(d1, eras[i + 1]?.start ?? Infinity),
          open: i + 1 < eras.length && eras[i + 1].start <= d1,
        }))
        .filter((f) => f.from <= f.to);
    return epochHours === null ? [] : [{ origin: -epochHours, from: d0, to: d1, open: false }];
  }
  function displayBoundaries(d0: number, d1: number, unit: BoundaryUnit): number[] {
    const out: number[] = [];
    if (!(d1 >= d0)) return out;
    if (unit === "era") {
      for (const e of eras) if (e.start >= d0 && e.start <= d1) out.push(e.start);
      return out;
    }
    if (cal.kind === "fixed") {
      const u = unit === "year" ? fixedYear : fixedMonth;
      if (!u) return out;
      for (let k = Math.ceil(d0 / u); k * u <= d1 && out.length < BOUNDARY_LIMIT; k++) out.push(k * u);
      return out;
    }
    if (!civilGregorian) return out;
    for (const f of frames(d0, d1)) {
      const at = (y: number, m: number) => f.origin + civilDays(y, m, 1) * 24;
      const c = civilFromDays(dayIndex(f.from - f.origin));
      let y = c.year,
        m = unit === "year" ? 1 : c.month;
      if (at(y, m) < f.from) unit === "year" ? y++ : m === 12 ? ((m = 1), y++) : m++;
      for (;;) {
        const v = at(y, m);
        if (v > f.to || (f.open && v >= f.to) || out.length >= BOUNDARY_LIMIT) break;
        out.push(v);
        if (unit === "year") y++;
        else if (m === 12) (m = 1), y++;
        else m++;
      }
    }
    return out;
  }

  const unmapped = "未映射";
  /** docs/585 §3 step 1–3 (shared with docs/586): civil parts and minute of a value, float noise removed. */
  type Quantised =
    | { kind: "unmapped" }
    | { kind: "short" }
    | { kind: "cap"; text: string }
    | { kind: "ok"; c: CivilParts; minute: number; dayLen: number };
  function quantised(value: number): Quantised {
    const d = toDisplay(value);
    if (d === null) return { kind: "unmapped" };
    // Frame origin and day length of the label calendar; null keeps the short() text (years, no months).
    let origin: number | null = null;
    if (cal.kind === "gregorian") {
      if (eras.length) {
        const i = eraAt(d);
        if (i < 0) return { kind: "short" };
        origin = eras[i].start;
      } else if (epochHours !== null) origin = -epochHours;
    } else if (cal.kind === "fixed" && fixedDay && fixedMonth) origin = 0;
    if (origin === null) return { kind: "short" };
    const dayLen = cal.kind === "fixed" ? fixedDay! : 24;
    // Day with the dayIndex tolerance, minutes de-noised on their own, then civil() on the quantised value.
    const h = d - origin;
    const day = Math.floor(Math.round((h / dayLen) * 1e6) / 1e6);
    const tod = Math.max(0, h - day * dayLen);
    const minute = Math.min(Math.max(0, Math.ceil(dayLen * 60) - 1), Math.max(0, Math.floor(Math.round(tod * 60 * 1e3) / 1e3)));
    const c = civil(origin + day * dayLen + minute / 60);
    if (!c) return { kind: "short" };
    if (c.era !== null && c.year !== null && c.year > ERA_MAX_YEAR) return { kind: "cap", text: eraLabel(d, eras, "year") };
    return { kind: "ok", c, minute, dayLen };
  }
  // docs/586 §2: label-calendar units in worldline units. Gregorian months and years take their longest length.
  const railUnits: CalendarAdapter["railUnits"] =
    zero === null
      ? null
      : civilGregorian
        ? { year: 8784 / scale, month: 744 / scale, day: 24 / scale, hour: 1 / scale }
        : fixedDay && fixedMonth
          ? { year: fixedYear ? fixedYear / scale : null, month: fixedMonth / scale, day: fixedDay / scale, hour: 1 / scale }
          : null;
  const adapter: CalendarAdapter = {
    calendar: cal,
    hasEras,
    hasYears,
    hasMonths,
    dayHours,
    ownDayHours: own.kind === "years" ? 1 / 365.2425 : own.kind === "fixed" ? (own.hoursPerDay ?? 24) : 24,
    breakHours: breakDisplay / scale,
    toDisplay,
    boundaries(t0, t1, unit) {
      const d0 = toDisplay(t0),
        d1 = toDisplay(t1);
      if (d0 === null || d1 === null) return [];
      return displayBoundaries(d0, d1, unit).map(toWorld);
    },
    label(value, span, precision) {
      const d = toDisplay(value);
      return d === null ? unmapped : formatTime(d, cal, span * scale, precision);
    },
    railLabel(value, precision, yearShown = false) {
      const d = toDisplay(value);
      if (d === null) return unmapped;
      const c = civil(d);
      if (precision === "era") return c?.era ?? formatTime(d, cal, displayDay, precision);
      if (!c) return formatTime(d, cal, displayDay, precision);
      if (precision === "year") return yearShown || c.year === null ? "" : `${c.year}年`;
      if (precision === "month") return c.year === null ? `${c.month}月` : `${c.year}年${c.month}月`;
      return `${c.month}月${c.day}日`;
    },
    short(value, precision) {
      const d = toDisplay(value);
      if (d === null) return unmapped;
      const c = civil(d);
      if (precision === "era" && c?.era != null) return c.era;
      if (!c) return formatTime(d, cal, displayDay, precision);
      if (precision === "year" && c.year !== null) return `${c.year}年`;
      if (precision === "month") return `${c.month}月`;
      return `${c.month}-${String(c.day).padStart(2, "0")}`;
    },
    treeTime(value, precision, yearShown) {
      if (precision === "era") return adapter.short(value, "era");
      const q = quantised(value);
      if (q.kind === "unmapped") return unmapped;
      if (q.kind === "short") return adapter.short(value, precision);
      if (q.kind === "cap") return q.text;
      const { c, minute } = q;
      const year = yearShown || c.year === null ? "" : `${c.year}年`;
      const day = `${year}${c.month}月${c.day}日`;
      if (precision === "hour") return `${day} ${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
      return precision === "day" ? day : `约${day}`;
    },
    axisPrecision(span) {
      return zero === null ? "hour" : axisPrecision(span * scale, cal);
    },
    stamp(value, axis, time) {
      const shown = FINER[axis];
      const q = quantised(value);
      if (q.kind === "unmapped") return unmapped;
      if (q.kind === "short") return adapter.short(value, time.precision);
      if (q.kind === "cap") return q.text;
      const { c, minute, dayLen } = q;
      // What is actually shown: an hour stamp of a coarser record without a time of day stays at the day.
      const half = minute < (dayLen * 60) / 2 ? "上午" : "下午";
      const exactHour = time.precision === "hour";
      const reached: EraPrecision = shown === "hour" && !exactHour && minute === 0 ? "day" : shown;
      const about = time.kind === "window" || PRECISION_RANK[reached] > PRECISION_RANK[time.precision];
      let text = `${c.year === null ? "" : `${c.year}年`}${c.month}月`;
      if (shown !== "month") text += `${c.day}日`;
      if (shown === "hour")
        text += exactHour
          ? ` ${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`
          : minute === 0 ? "" : half;
      return about ? `约${text}` : text;
    },
    railUnits,
    railText(value, level, time, compact = false) {
      if (time.precision === "era") return adapter.railLabel(value, "era");
      const q = quantised(value);
      if (q.kind === "unmapped") return unmapped;
      if (q.kind === "short") return adapter.railLabel(value, time.precision);
      if (q.kind === "cap") return q.text;
      const { c, minute, dayLen } = q;
      const exactHour = time.precision === "hour";
      let text: string, reached: EraPrecision;
      if (level === "year") (text = c.year === null ? "" : `${c.year}年`), (reached = "year");
      else if (level === "month") (text = `${c.year === null ? "" : `${c.year}年`}${c.month}月`), (reached = "month");
      else {
        const day = `${c.month}月${c.day}日`;
        let tail = "";
        reached = "day";
        if (level === "minute" && exactHour) {
          tail = ` ${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
          reached = "hour";
        } else if ((level === "half" || level === "minute") && (exactHour || minute !== 0)) {
          // §3: a coarser record at 0:00 has no time of day, so it stays at the day.
          tail = minute < (dayLen * 60) / 2 ? "上午" : "下午";
          reached = "hour";
        }
        text = tail ? `${compact ? `${c.day}日` : day}${tail}` : day;
      }
      const about = time.kind === "window" || PRECISION_RANK[reached] > PRECISION_RANK[time.precision];
      return text && about ? `约${text}` : text;
    },
    yearKey(value) {
      const d = toDisplay(value),
        c = d === null ? null : civil(d);
      return c?.year == null ? "" : `${c.year}年`;
    },
    yearText(value) {
      const d = toDisplay(value),
        c = d === null ? null : civil(d);
      return c?.year == null ? "" : `${c.era ?? ""}${c.year}年`;
    },
    monthText(value) {
      const d = toDisplay(value),
        c = d === null ? null : civil(d);
      return c ? `${c.month}月` : "";
    },
    eraOf(value) {
      const d = toDisplay(value);
      if (d === null || !eras.length) return null;
      const i = eraAt(d);
      if (i < 0) return null;
      const next = eras[i + 1];
      return { name: eras[i].name, start: toWorld(eras[i].start), end: next ? toWorld(next.start) : null };
    },
  };
  return adapter;
}

/** The adapter for a worldline and the active time base (null = the worldline's own calendar). */
export function adapterFor(
  data: PlanningData,
  worldId: string,
  timeBaseId: string | null,
): CalendarAdapter {
  const world = data.worlds.find((w) => w.id === worldId);
  const own = world?.calendar ?? ({ kind: "fixed", epoch: "", hoursPerDay: 24, daysPerMonth: 30, monthsPerYear: 12, eras: [] } as Calendar);
  const base = timeBaseId ? world?.timeBases.find((b) => b.id === timeBaseId) : undefined;
  if (!base) return createCalendarAdapter(own);
  return createCalendarAdapter(own, {
    calendar: base.calendar,
    scale: base.scale,
    zero: timeBaseValue(data, worldId, base, 0),
  });
}

/** §4: first entry and 复位 use the dense fit only on calendars with eras; 全部时期（全貌） always fits everything. */
export function windowFitter(calendar: Calendar, mode: "initial" | "reset" | "all") {
  return mode !== "all" && calendar.kind === "gregorian" && calendar.eras.length
    ? fitDenseTimelineWindow
    : fitTimelineWindow;
}

// ---------- event tree (§5.3) ----------
export interface TreeNode {
  id: string;
  event: PlanningEvent;
  start: number | null;
  end: number | null;
  windowEnd: number | null;
  /** Effective parent: null for roots, orphans and pending events. */
  parent: string | null;
  depth: number;
  children: TreeNode[];
}
export interface EventTree {
  /** Placed roots, ordered by start. */
  roots: TreeNode[];
  /** Events without a resolvable start, each with its own subtree. */
  pending: TreeNode[];
  byId: Map<string, TreeNode>;
}

const byStart = (a: TreeNode, b: TreeNode) =>
  a.start === b.start ? 0 : a.start === null ? 1 : b.start === null ? -1 : a.start - b.start;

/** The whole tree of a worldline. `data` resolves anchored times; without it the events resolve among themselves. */
export function eventTree(events: readonly PlanningEvent[], data?: PlanningData): EventTree {
  const ctx = data ?? ({ worlds: [], events: [...events] } as unknown as PlanningData);
  const known = new Map(events.map((e) => [e.id, e]));
  const byId = new Map<string, TreeNode>();
  for (const event of events) {
    let t = { start: null as number | null, end: null as number | null, windowEnd: null as number | null };
    try {
      t = resolveTime(ctx, event);
    } catch {
      // A cycle or a missing anchor leaves the event unplaced.
    }
    byId.set(event.id, { id: event.id, event, ...t, parent: null, depth: 0, children: [] });
  }
  // A missing parent, or a parent chain that loops back, lifts the event to the root level.
  const parentOf = (e: PlanningEvent) => {
    if (!e.parent || !known.has(e.parent) || e.parent === e.id) return null;
    const seen = new Set([e.id]);
    for (let p = known.get(e.parent); p; p = p.parent ? known.get(p.parent) : undefined) {
      if (seen.has(p.id)) return null;
      seen.add(p.id);
    }
    return e.parent;
  };
  const roots: TreeNode[] = [],
    pending: TreeNode[] = [];
  // Pending events are always listed apart (§5.3), even when their parent is placed.
  for (const node of byId.values()) {
    const parent = node.start === null ? null : parentOf(node.event);
    if (parent) {
      node.parent = parent;
      byId.get(parent)!.children.push(node);
    } else (node.start === null ? pending : roots).push(node);
  }
  const settle = (list: TreeNode[], depth: number) => {
    list.sort(byStart);
    for (const n of list) {
      n.depth = depth;
      settle(n.children, depth + 1);
    }
  };
  settle(roots, 0);
  settle(pending, 0);
  return { roots, pending, byId };
}

function nodeEnd(n: TreeNode) {
  return Math.max(n.start ?? -Infinity, n.end ?? -Infinity, n.windowEnd ?? -Infinity);
}
/** Latest end over the event and all its descendants. */
export function familyEnd(node: TreeNode | string, tree?: EventTree): number {
  const n = typeof node === "string" ? tree?.byId.get(node) : node;
  if (!n) return -Infinity;
  let end = nodeEnd(n);
  for (const c of n.children) end = Math.max(end, familyEnd(c));
  return end;
}
/** docs/585 §4: the family end and the node that gives it (for the end stamp's 约). Ties within 1e-6 day go to the
 * parent, then to the finest recorded precision, then to the first found. */
export function familyStampEnd(node: TreeNode): { end: number; by: PlanningEvent } {
  const own = node.end ?? node.start ?? 0;
  let end = own,
    by = node.event;
  const eps = 24e-6;
  for (const x of descendants(node)) {
    const v = x.end ?? x.start ?? node.start ?? 0;
    if (v > end + eps) (end = v), (by = x.event);
    else if (v >= end - eps && by !== node.event && PRECISION_RANK[x.event.time.precision ?? "hour"] > PRECISION_RANK[by.time.precision ?? "hour"]) {
      end = Math.max(end, v);
      by = x.event;
    }
  }
  return { end, by };
}
export function descendants(node: TreeNode): TreeNode[] {
  return node.children.flatMap((c) => [c, ...descendants(c)]);
}

// ---------- rail segments (§5.3) ----------
export interface RailSegment {
  index: number;
  /** Earliest and latest root start in the segment. */
  t0: number;
  t1: number;
  roots: TreeNode[];
}
/** Split where a gap between adjacent root starts beats both "30 days" (§4) and 20 × the median gap. */
export function railSegments(roots: readonly TreeNode[], adapter: CalendarAdapter): RailSegment[] {
  const placed = roots.filter((r) => r.start !== null).sort(byStart);
  if (!placed.length) return [];
  const times = [...new Set(placed.map((r) => r.start!))];
  const gaps = times
    .slice(1)
    .map((t, i) => t - times[i])
    .sort((a, b) => a - b);
  const limit = Math.max(adapter.breakHours, (gaps[Math.floor(gaps.length / 2)] ?? 0) * BREAK_MEDIAN_FACTOR);
  const segments: RailSegment[] = [];
  let prev: number | null = null;
  for (const r of placed) {
    if (prev === null || r.start! - prev > limit)
      segments.push({ index: segments.length, t0: r.start!, t1: r.start!, roots: [] });
    const s = segments[segments.length - 1];
    s.roots.push(r);
    s.t1 = r.start!;
    prev = r.start!;
  }
  return segments;
}

// ---------- event table height model (§5.1) ----------
export interface TableCard {
  id: string;
  top: number;
  height: number;
  /** Indent in px (depth × TABLE_INDENT). */
  left: number;
  depth: number;
  start: number | null;
  /** Rail segment index; -1 for the pending block. */
  segment: number;
  expanded: boolean;
  importance: number;
  precision: EraPrecision;
  kind: StampTime["kind"];
  /** docs/588 §1: the parent card heading its group box. */
  groupHead: boolean;
  /** docs/588 §1: y of the card head's middle line (dot and lead end). */
  head: number;
}
export interface TableGroup {
  id: string;
  top: number;
  bottom: number;
  left: number;
  depth: number;
}
export interface TableSegment {
  index: number;
  t0: number;
  t1: number;
  /** Card head y of the earliest and latest event in the segment. */
  y0: number;
  y1: number;
  /** Card head y of every placed event in the segment. */
  heads: { id: string; t: number; y: number }[];
}
export interface TableBreak {
  kind: "gap" | "pending";
  top: number;
  height: number;
  /** Segments on either side (gap breaks only). */
  from: number;
  to: number;
  /** Time between the two segments in worldline units (gap breaks only). */
  gap: number;
}
export interface TableLayout {
  cards: TableCard[];
  byId: Map<string, TableCard>;
  groups: TableGroup[];
  segments: TableSegment[];
  breaks: TableBreak[];
  height: number;
}
export interface TableOptions {
  expanded?: ReadonlySet<string>;
  folded?: ReadonlySet<string>;
}
/** A card head (dot, lead end) sits in the middle of the collapsed card. */
export const CARD_HEAD = CARD_HEIGHT / 2;
/** docs/588 §1: head middle line below the card top: 1px border + half of the 32 / 42px head; a group header has no
 * border and a 36 / 42px head. */
export function cardHeadOffset(groupHead: boolean, expanded: boolean): number {
  return groupHead ? (expanded ? 21 : GROUP_HEAD_HEIGHT / 2) : expanded ? 22 : CARD_HEAD;
}
const EST_META = 26,
  EST_LINE = 21,
  EST_CHARS_PER_LINE = 42,
  EST_PEOPLE = 28,
  EST_CHANGE = 24,
  EST_PADDING = 18;
/** Height of an expanded card before it is measured, from its text length. */
export function estimateCardHeight(event: PlanningEvent): number {
  const lines = event.fact
    ? event.fact
        .split(/\n+/u)
        .reduce((n, p) => n + Math.max(1, Math.ceil([...p].length / EST_CHARS_PER_LINE)), 0)
    : 0;
  return (
    CARD_HEIGHT +
    EST_META +
    lines * EST_LINE +
    (event.people.length ? EST_PEOPLE : 0) +
    event.changes.length * EST_CHANGE +
    EST_PADDING
  );
}
/** docs/586 §2: the rail label level at a table scale k (px per worldline hour): the finest unit at least
 * LABEL_MIN_GAP px long, else the coarsest one (year, or month without years). Null on calendars without months. */
export function railLevel(k: number, adapter: CalendarAdapter): RailLevel | null {
  const u = adapter.railUnits;
  if (!u) return null;
  const fits = (len: number) => len * k >= LABEL_MIN_GAP - 1e-9;
  if (fits(u.hour)) return "minute";
  if (fits(u.day / 2)) return "half";
  if (fits(u.day)) return "day";
  if (fits(u.month) || u.year === null) return "month";
  return "year";
}
export interface TableZoomBounds {
  /** Reset scale: the mean stacked slope of the main segment (px per worldline hour). */
  fit: number;
  min: number;
  max: number;
}
/** docs/586 §1: reset scale and zoom range of the event table, all in px per worldline hour. */
export function tableZoomBounds(tree: EventTree, adapter: CalendarAdapter): TableZoomBounds {
  let main: RailSegment | null = null;
  for (const s of railSegments(tree.roots, adapter))
    if (s.t1 > s.t0 && (!main || s.roots.length > main.roots.length)) main = s;
  const u = adapter.railUnits;
  let fit = main ? ((main.roots.length - 1) * (CARD_HEIGHT + CARD_GAP)) / (main.t1 - main.t0) : u ? LABEL_MIN_GAP / u.month : 0;
  if (!(fit > 0) || !Number.isFinite(fit)) fit = 0;
  if (!u) return { fit, min: fit / 8, max: fit * 8 };
  const min = LABEL_MIN_GAP / (8 * (u.year ?? u.month)),
    max = TABLE_SCALE_MAX / u.hour;
  return { fit, min: Math.min(min, fit), max: Math.max(max, fit) };
}

/** Card tops, groups, rail segments and breaks of the event table; no DOM. `heights` holds measured expanded heights.
 * docs/586 §1: `scale` is k in px per worldline hour; 0 is pure stacking. */
export function tableLayout(
  tree: EventTree,
  heights: Readonly<Record<string, number | undefined>>,
  scale: number,
  adapter: CalendarAdapter,
  options: TableOptions = {},
): TableLayout {
  const expanded = options.expanded ?? EMPTY_SET,
    folded = options.folded ?? EMPTY_SET;
  const cards: TableCard[] = [],
    groups: TableGroup[] = [],
    breaks: TableBreak[] = [];
  let y = 0,
    first = true;
  const cardHeight = (n: TreeNode, head: boolean) =>
    expanded.has(n.id) ? (heights[n.id] ?? estimateCardHeight(n.event) - (head ? 2 : 0)) : head ? GROUP_HEAD_HEIGHT : CARD_HEIGHT;
  const k = Number.isFinite(scale) && scale > 0 ? scale : 0;
  /** Returns the block start (card top, or group top for a parent). `atLeast` is the stretched start of a root. */
  const block = (n: TreeNode, depth: number, segment: number, atLeast = -Infinity): number => {
    if (!first) y += CARD_GAP;
    first = false;
    if (atLeast > y) y = atLeast;
    const start = y;
    const left = depth * TABLE_INDENT;
    const push = (head: boolean) => {
      const open = expanded.has(n.id);
      const card: TableCard = {
        id: n.id,
        top: y,
        height: cardHeight(n, head),
        left,
        depth,
        start: n.start,
        segment,
        expanded: expanded.has(n.id),
        importance: n.event.importance,
        precision: n.event.time.precision,
        kind: n.event.time.kind,
        groupHead: head,
        head: y + cardHeadOffset(head, open),
      };
      cards.push(card);
      y += card.height;
    };
    if (!n.children.length) {
      push(false);
      return start;
    }
    const group: TableGroup = { id: n.id, top: y, bottom: 0, left, depth };
    groups.push(group);
    push(true);
    if (!folded.has(n.id)) {
      // The first child's block adds CARD_GAP itself, so the header is followed by GROUP_HEAD_GAP in total.
      y += GROUP_HEAD_GAP - CARD_GAP;
      for (const c of n.children) block(c, depth + 1, segment);
      y += GROUP_PADDING;
    }
    group.bottom = y;
    return start;
  };
  const segs = railSegments(tree.roots, adapter);
  segs.forEach((s, j) => {
    if (j) {
      breaks.push({ kind: "gap", top: y, height: BREAK_HEIGHT, from: j - 1, to: j, gap: s.t0 - familyEndOf(segs[j - 1]) });
      y += BREAK_HEIGHT;
      first = true;
    }
    let prev = 0;
    s.roots.forEach((r, i) => {
      prev = block(r, 0, s.index, i ? prev + Math.min(GAP_MAX, (r.start! - s.roots[i - 1].start!) * k) : -Infinity);
    });
  });
  if (tree.pending.length) {
    if (cards.length) {
      breaks.push({ kind: "pending", top: y, height: BREAK_HEIGHT, from: -1, to: -1, gap: 0 });
      y += BREAK_HEIGHT;
      first = true;
    }
    for (const p of tree.pending) block(p, 0, -1);
  }
  const byId = new Map(cards.map((c) => [c.id, c]));
  const segments: TableSegment[] = segs.map((s) => {
    const heads = cards
      .filter((c) => c.segment === s.index && c.start !== null)
      .map((c) => ({ id: c.id, t: c.start!, y: c.head }));
    let lo = heads[0],
      hi = heads[0];
    for (const h of heads) {
      if (h.t < lo.t || (h.t === lo.t && h.y < lo.y)) lo = h;
      if (h.t > hi.t || (h.t === hi.t && h.y > hi.y)) hi = h;
    }
    return { index: s.index, t0: lo.t, t1: hi.t, y0: Math.min(lo.y, hi.y), y1: Math.max(lo.y, hi.y), heads };
  });
  return { cards, byId, groups, segments, breaks, height: y };
}
const EMPTY_SET: ReadonlySet<string> = new Set();
function familyEndOf(s: RailSegment) {
  return Math.max(...s.roots.map((r) => familyEnd(r)));
}

// ---------- rail marks (§5.3) ----------
export interface RailDot {
  y: number;
  /** Time of the lead event (the most important one in a cluster). */
  t: number;
  ids: string[];
  count: number;
  cluster: boolean;
  lead: string;
  importance: number;
  segment: number;
  /** docs/588 §3: aligned rail, earlier than a card above it in the segment. */
  back?: boolean;
}
export interface RailLabel {
  y: number;
  ids: string[];
  text: string;
  visible: boolean;
  /** docs/586: the zoom level the text was written at; null on the precision-only path. */
  level: RailLevel | null;
  back?: boolean;
}
export interface RailBadge {
  kind: "era" | "year";
  y: number;
  t: number;
  text: string;
  segment: number;
}
export interface RailTick {
  y: number;
  t: number;
  label: string | null;
  segment: number;
}
export interface RailPeriodBar {
  id: string;
  y0: number;
  y1: number;
  segment: number;
}
export interface RailLine {
  segment: number;
  top: number;
  height: number;
}
export interface RailMarks {
  points: Map<string, number>;
  dots: RailDot[];
  labels: RailLabel[];
  badges: RailBadge[];
  ticks: RailTick[];
  periods: RailPeriodBar[];
  lines: RailLine[];
}
export interface RailOptions {
  /** The selected event always shows its label (WU-14). */
  selected: string | null;
  periods: readonly { id: string; start: number; end: number | null }[];
  /** docs/586 §2: labels follow this zoom level; absent or null keeps the record-precision labels. */
  level: RailLevel | null;
  /** docs/586 §3: narrow rail (panel ≤ 640px). */
  compact: boolean;
}
/** docs/586 §3: one entry of railVisibility, in y order. A badge only sets the last key. */
export interface RailVisibilityItem {
  y: number;
  /** The dedup key source: the wide-rail text (约 is dropped here). */
  text: string;
  badge?: boolean;
  selected?: boolean;
}
/** docs/586 §3: a label shows when its key differs from the last visible key (or badge) and it is at least
 * LABEL_MIN_GAP below the last visible label; the selected one always shows. Badges return false. */
export function railVisibility(items: readonly RailVisibilityItem[]): boolean[] {
  let prev = "",
    last = -Infinity;
  return items.map((it) => {
    const key = it.text.replace(/^约/, "");
    if (it.badge) {
      prev = key;
      return false;
    }
    const show = !!key && (!!it.selected || (key !== prev && it.y - last >= LABEL_MIN_GAP));
    if (show) (prev = key), (last = it.y);
    return show;
  });
}
/** y of a time inside a segment, strictly proportional between its earliest and latest head. */
export function segmentY(s: TableSegment, t: number) {
  return s.t1 === s.t0 ? (s.y0 + s.y1) / 2 : s.y0 + ((t - s.t0) / (s.t1 - s.t0)) * (s.y1 - s.y0);
}
/** Dots, clusters, labels, year badges, month ticks and period bars of the event-table rail. */
export function railMarks(
  layout: TableLayout,
  segments: readonly TableSegment[],
  adapter: CalendarAdapter,
  options: Partial<RailOptions> = {},
): RailMarks {
  const cards = layout.byId;
  const points = new Map<string, number>();
  const raw: { id: string; t: number; y: number; segment: number }[] = [];
  for (const s of segments)
    for (const h of s.heads) {
      const y = segmentY(s, h.t);
      points.set(h.id, y);
      raw.push({ id: h.id, t: h.t, y, segment: s.index });
    }
  raw.sort((a, b) => a.y - b.y || a.t - b.t);
  const importance = (id: string) => cards.get(id)?.importance ?? 1;
  const precision = (id: string): EraPrecision => cards.get(id)?.precision ?? "hour";

  const badges: RailBadge[] = [],
    ticks: RailTick[] = [],
    lines: RailLine[] = [],
    periods: RailPeriodBar[] = [];
  for (const s of segments) {
    const top = s.y0 - SEGMENT_BADGE_OFFSET;
    lines.push({ segment: s.index, top, height: s.y1 - s.y0 + 2 * SEGMENT_BADGE_OFFSET });
    // Boundaries denser than one per 2px (a long, sparse segment) are not drawn.
    const room = Math.max(1, (s.y1 - s.y0) / 2);
    const allYears = adapter.hasYears ? adapter.boundaries(s.t0, s.t1, "year").filter((t) => t > s.t0) : [];
    const yearStarts = allYears.length <= room ? allYears : [];
    if (adapter.hasEras)
      for (const t of adapter.boundaries(s.t0, s.t1, "era"))
        if (t > s.t0) badges.push({ kind: "era", y: segmentY(s, t), t, text: adapter.eraOf(t)?.name ?? "", segment: s.index });
    if (adapter.hasYears) {
      badges.push({ kind: "year", y: top, t: s.t0, text: adapter.yearText(s.t0), segment: s.index });
      for (const t of yearStarts) badges.push({ kind: "year", y: segmentY(s, t), t, text: adapter.yearText(t), segment: s.index });
    }
    if (adapter.hasMonths) {
      const years = new Set(yearStarts);
      const months = adapter.boundaries(s.t0, s.t1, "month").filter((t) => !years.has(t));
      if (months.length <= room) {
        let last = top,
          yi = 0;
        for (const t of months) {
          const y = segmentY(s, t);
          while (yi < yearStarts.length && yearStarts[yi] <= t) last = segmentY(s, yearStarts[yi++]);
          const show = y - last >= TICK_LABEL_GAP;
          if (show) last = y;
          ticks.push({ y, t, label: show ? adapter.monthText(t) : null, segment: s.index });
        }
      }
    }
    for (const p of options.periods ?? []) {
      const a = Math.max(p.start, s.t0),
        b = Math.min(p.end ?? s.t1, s.t1);
      if (b > a) periods.push({ id: p.id, y0: segmentY(s, a), y1: segmentY(s, b), segment: s.index });
    }
  }
  badges.sort((a, b) => a.y - b.y);

  const dots: RailDot[] = [],
    labels: RailLabel[] = [];
  let group: typeof raw = [];
  const flush = () => {
    if (!group.length) return;
    const lead = group.reduce((a, b) => (importance(b.id) > importance(a.id) ? b : a));
    dots.push({
      y: group[0].y,
      t: lead.t,
      ids: group.map((g) => g.id),
      count: group.length,
      cluster: group.length > 1,
      lead: lead.id,
      importance: importance(lead.id),
      segment: lead.segment,
    });
    group = [];
  };
  for (const d of raw) {
    if (group.length && (d.y - group[0].y >= CLUSTER_PX || d.segment !== group[0].segment)) flush();
    group.push(d);
  }
  flush();
  if (options.level) {
    const level = options.level;
    const time = (id: string): StampTime => ({ kind: cards.get(id)?.kind ?? "exact", precision: precision(id) });
    type Item = RailVisibilityItem & { at: number };
    const bySeg = new Map<number, Item[]>();
    const add = (seg: number, e: Item) => {
      const list = bySeg.get(seg) ?? [];
      list.push(e);
      bySeg.set(seg, list);
    };
    for (const b of badges) if (b.kind === "year") add(b.segment, { y: b.y, text: adapter.yearKey(b.t), badge: true, at: -1 });
    dots.forEach((d, i) => {
      const selected = options.selected != null && d.ids.includes(options.selected);
      const t = time(d.lead);
      labels.push({ y: d.y, ids: d.ids, text: adapter.railText(d.t, level, t, options.compact), visible: false, level });
      add(d.segment, { y: d.y, text: options.compact ? adapter.railText(d.t, level, t, false) : labels[i].text, selected, at: i });
    });
    for (const list of bySeg.values()) {
      // A badge goes before a label at the same y (a segment's first badge is above its first card anyway).
      list.sort((a, b) => a.y - b.y || (b.badge ? 1 : 0) - (a.badge ? 1 : 0));
      railVisibility(list).forEach((v, j) => {
        if (list[j].at >= 0) labels[list[j].at].visible = v;
      });
    }
    return { points, dots, labels, badges, ticks, periods, lines };
  }
  let lastLabel = -Infinity;
  for (const d of dots) {
    const p = precision(d.lead);
    const yearShown =
      p === "year" &&
      badges.some(
        (b) => b.kind === "year" && b.segment === d.segment && Math.abs(b.y - d.y) < LABEL_MIN_GAP + SEGMENT_BADGE_OFFSET && b.text === adapter.yearText(d.t),
      );
    const text = adapter.railLabel(d.t, p, yearShown);
    const selected = options.selected != null && d.ids.includes(options.selected);
    const visible = !!text && (selected || d.y - lastLabel >= LABEL_MIN_GAP);
    if (visible) lastLabel = d.y;
    labels.push({ y: d.y, ids: d.ids, text, visible, level: null });
  }
  return { points, dots, labels, badges, ticks, periods, lines };
}

// ---------- aligned rail (docs/588 §3) ----------
/** A run of step-back cards on the aligned rail, from the card head above the run to its last head. */
export interface RailBack {
  segment: number;
  top: number;
  height: number;
}
export interface AlignedRailMarks extends RailMarks {
  backs: RailBack[];
}
const STEP_BACK = "↺ ";
/** docs/588 §3: every dot on its card head, labels at the record precision, a card earlier than the segment so far
 * marked as a step back, year badges between a card and the one right above it. Cards are laid out as in the
 * equidistant mode (tableLayout), so only the rail changes. */
export function alignedRailMarks(
  layout: TableLayout,
  adapter: CalendarAdapter,
  options: Partial<Omit<RailOptions, "level">> = {},
): AlignedRailMarks {
  const points = new Map<string, number>();
  const dots: RailDot[] = [],
    labels: RailLabel[] = [],
    badges: RailBadge[] = [],
    periods: RailPeriodBar[] = [],
    lines: RailLine[] = [],
    backs: RailBack[] = [];
  /** docs/588 验收 2026-11-19: the same text as the event directory (treeTime): month and day, 约 when finer than the
   * record, hh:mm for hour records; the year only when the rail's current year badge does not already show it. The
   * narrow rail (82px) drops the month before a time, and a label carrying its year stops at the month. */
  const text = (c: TableCard, yearShown: boolean, compact: boolean) => {
    const full = adapter.treeTime(c.start!, c.precision, yearShown);
    if (!compact) return full;
    return yearShown ? full.replace(/^(约?)\d+月(\d+日 \d)/u, "$1$2") : full.replace(/^(约?\d+年\d+月)\d+日.*$/u, "$1");
  };
  for (const s of layout.segments) {
    const cards = s.heads.map((h) => layout.byId.get(h.id)!);
    if (!cards.length) continue;
    const top = cards[0].head - SEGMENT_BADGE_OFFSET;
    lines.push({ segment: s.index, top, height: cards[cards.length - 1].head - cards[0].head + 2 * SEGMENT_BADGE_OFFSET });
    let max = -Infinity,
      year: string | null = null,
      run: RailBack | null = null;
    let runMax = -Infinity;
    const firstYear = adapter.hasYears
      ? cards.find((c) => {
          const back = c.start! < runMax;
          runMax = Math.max(runMax, c.start!);
          return !back && c.precision !== "era";
        })
      : undefined;
    if (firstYear) {
      year = adapter.yearText(firstYear.start!);
      badges.push({ kind: "year", y: top, t: firstYear.start!, text: year, segment: s.index });
    }
    cards.forEach((c, i) => {
      const t = c.start!,
        back = t < max;
      if (!back && adapter.hasYears && c.precision !== "era" && i > 0 && adapter.yearText(t) !== year) {
        year = adapter.yearText(t);
        badges.push({ kind: "year", y: (cards[i - 1].head + c.head) / 2, t, text: year, segment: s.index });
      }
      // A card outside the current badge's year (a step back) carries its year, as the directory does under another header.
      const body = text(c, !adapter.hasYears || adapter.yearText(t) === year, !!options.compact);
      // docs/588 验收: every card on the aligned rail shows its date (cards are ≥ 39px apart, so labels never collide).
      const visible = !!body;
      points.set(c.id, c.head);
      dots.push({ y: c.head, t, ids: [c.id], count: 1, cluster: false, lead: c.id, importance: c.importance, segment: s.index, back });
      labels.push({ y: c.head, ids: [c.id], text: body && back ? `${STEP_BACK}${body}` : body, visible, level: null, back });
      if (back) {
        run ??= { segment: s.index, top: cards[i - 1].head, height: 0 };
        run.height = c.head - run.top;
      } else if (run) {
        backs.push(run);
        run = null;
      }
      max = Math.max(max, t);
    });
    if (run) backs.push(run);
    for (const p of options.periods ?? []) {
      let bar: RailPeriodBar | null = null;
      for (const c of cards) {
        const inside = c.start! >= p.start && (p.end === null || c.start! <= p.end);
        if (inside) {
          bar ??= { id: p.id, y0: c.head, y1: c.head, segment: s.index };
          bar.y1 = c.head;
        } else if (bar) {
          periods.push(bar);
          bar = null;
        }
      }
      if (bar) periods.push(bar);
    }
  }
  badges.sort((a, b) => a.y - b.y);
  return { points, dots, labels, badges, ticks: [], periods, lines, backs };
}

// ---------- timeline: families in world coordinates (§5.2 ①) ----------
/** Family-internal spacing (design v9 app.js buildFamily): header → first child row, between rows, frame bottom. */
export const FAMILY_CHILD_TOP = 22;
export const FAMILY_ROW_GAP = 26;
export const FAMILY_FRAME_BOTTOM = 14;
export const FAMILY_PAD_LEFT = 6;
export type PlaneKind = "card" | "frame" | "track" | "bar" | "lane";
/** One element of a family, in world px (x) and family-relative px (y). Never written to CSS as is. */
export interface WorldPiece {
  id: string;
  kind: Exclude<PlaneKind, "lane">;
  depth: number;
  wx: number;
  /** Infinity for an open-ended bar; it is drawn to the right edge of the built range. */
  width: number;
  top: number;
  height: number;
}
export interface FamilyBox {
  id: string;
  start: number;
  /** Unclipped world box in px; collisions only use these (§5.2). */
  left: number;
  right: number;
  h: number;
  pieces: WorldPiece[];
}
export interface FamilyOptions {
  scale: number;
  expanded?: ReadonlySet<string>;
  folded?: ReadonlySet<string>;
  heights?: Readonly<Record<string, number | undefined>>;
  /** Collapsed card width (docs/583 R1); defaults to the title-only estimate. */
  widthOf?: (n: TreeNode) => number;
}
/** What the collapsed card head renders (EventCard.tsx head; docs/583 R1). */
export interface CollapsedCardInput {
  title: string;
  depth: number;
  importance: number;
  /** Avatars drawn (people found in the character list, at most 3 on the timeline). */
  avatars: number;
  /** Found people beyond those drawn (the +N chip). */
  more: number;
  /** N of the ▸ N badge; null without children. */
  kids: number | null;
  /** docs/584: the timeline head's expand button (24px .expand, like the 「…」 summary). */
  expandButton?: boolean;
}
/** Head sizes from worldline.module.css: .card border, .head padding/gap (:66), .fold (:84), .expand (:86), .dot (:69-71),
 * .avatars padding (:76) and 16px timeline avatars overlapping 5px (:77, :82), .kids padding + border (:83), summary (:87). */
const HEAD = { border: 2, padLeft: 14, padRight: 6, gap: 9, fold: 20, expand: 24, menu: 24, avatarsPad: 4, avatar: 16, overlap: 5, badgePad: 16, arrow: 11, space: 3.5, digit: 6.2 };
const DOT = [6, 9, 12];
const TITLE_SLACK = 2;
const WIDE = /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6\u00b7\u2014\u2026\u201c\u201d\u3000-\u303f]|[\u{20000}-\u{3fffd}]/u;
/** Title width at the card's 13px: full-width characters (CJK, full-width punctuation, ·) 13px, others 7.4px. */
function titleWidth(title: string) {
  let w = 0;
  for (const ch of title) w += WIDE.test(ch) ? 13 : 7.4;
  return w;
}
/** docs/583 R1: collapsed timeline card width from the rendered head, clamped to [150, cap]. Pure; no DOM. */
export function collapsedCardWidth(c: CollapsedCardInput): number {
  const parts: number[] = [];
  if (c.kids !== null) parts.push(HEAD.fold);
  parts.push(DOT[Math.min(3, Math.max(1, c.importance)) - 1]);
  parts.push(titleWidth(c.title) + TITLE_SLACK);
  if (c.avatars > 0) parts.push(HEAD.avatarsPad + HEAD.avatar + (c.avatars - 1 + (c.more > 0 ? 1 : 0)) * (HEAD.avatar - HEAD.overlap));
  if (c.kids !== null) parts.push(HEAD.badgePad + HEAD.arrow + HEAD.space + String(c.kids).length * HEAD.digit);
  if (c.expandButton) parts.push(HEAD.expand);
  parts.push(HEAD.menu);
  const w = HEAD.border + HEAD.padLeft + HEAD.padRight + parts.reduce((a, b) => a + b, 0) + HEAD.gap * (parts.length - 1);
  const cap = c.depth ? CHILD_CARD_WIDTH : ROOT_CARD_WIDTH;
  return Math.min(cap, Math.max(COLLAPSED_MIN_WIDTH, Math.ceil(w)));
}
export const TIMELINE_MAX_AVATARS = 3;
/** The collapsed head input with the counts EventCard renders: people found in `characters` (EventCard.tsx:127-128)
 * and, for a parent, all its descendants in `tree` (EventTimeline famInfo). */
export function collapsedCardInput(n: TreeNode, characters: readonly { id: string }[] | ReadonlySet<string>, tree: EventTree): CollapsedCardInput {
  const known = characters instanceof Set ? characters : new Set((characters as readonly { id: string }[]).map((c) => c.id));
  const found = n.event.people.filter((id) => known.has(id)).length;
  const avatars = Math.min(TIMELINE_MAX_AVATARS, found);
  const node = tree.byId.get(n.id) ?? n;
  return { title: n.event.title, depth: n.depth, importance: n.event.importance, avatars, more: found - avatars, kids: node.children.length ? descendants(node).length : null, expandButton: true };
}
const fallbackWidth = (n: TreeNode) =>
  collapsedCardWidth({ title: n.event.title, depth: n.depth, importance: n.event.importance, avatars: 0, more: 0, kids: n.children.length ? descendants(n).length : null, expandButton: true });

/**
 * docs/584 A2/A3: one drag moves a multi-selection by Δ. An event whose time is anchored, directly or through a chain,
 * to another selected event already moves with that anchor, so only the others get Δ (`moved`). `follows` is what
 * the preview shifts: every moved event and every event anchored to one of them, transitively. Window events move
 * their upper edge too; durations are unchanged.
 */
export function shiftSelection(data: PlanningData, ids: readonly string[], delta: number) {
  const byId = new Map(data.events.map((e) => [e.id, e]));
  const chosen = new Set(ids.filter((id) => byId.has(id)));
  const anchoredToChosen = (e: PlanningEvent) => {
    const seen = new Set<string>();
    for (let a: string | null | undefined = e.time.anchor; a && !seen.has(a); a = byId.get(a)?.time.anchor) {
      if (chosen.has(a)) return true;
      seen.add(a);
    }
    return false;
  };
  const moved = [...chosen].map((id) => byId.get(id)!).filter((e) => !anchoredToChosen(e)).map((e) => ({
    ...e,
    time: { ...e.time, value: e.time.value + delta, end: e.time.kind === "window" && e.time.end !== null ? e.time.end + delta : e.time.end },
  }));
  const follows = new Set(moved.map((e) => e.id));
  for (let grew = true; grew; ) {
    grew = false;
    for (const e of data.events) if (!follows.has(e.id) && e.time.anchor && follows.has(e.time.anchor)) { follows.add(e.id); grew = true; }
  }
  return { moved, follows };
}

/** One family per root: the root, its unfolded descendants, frames, tracks and bars, all in world px. */
export function buildFamilies(roots: readonly TreeNode[], options: FamilyOptions): FamilyBox[] {
  const { scale } = options,
    expanded = options.expanded ?? EMPTY_SET,
    folded = options.folded ?? EMPTY_SET,
    heights = options.heights ?? {},
    widthOf = options.widthOf ?? fallbackWidth;
  const cardWidth = (n: TreeNode, open: boolean) => (open ? OPEN_CARD_WIDTH : widthOf(n));
  const wx = (t: number) => t * scale;
  const h = (n: TreeNode) =>
    expanded.has(n.id) ? (heights[n.id] ?? estimateCardHeight(n.event)) : CARD_HEIGHT;
  const visibleKids = (n: TreeNode) => (folded.has(n.id) ? [] : n.children.filter((c) => c.start !== null));
  const extent = (n: TreeNode): number => {
    const own = wx(n.start!) + cardWidth(n, expanded.has(n.id));
    if (!n.children.length) return own;
    const bar = Math.max(wx(n.start!) + PARENT_BAR_MIN_WIDTH, wx(familyEnd(n)), own);
    return Math.max(bar, ...visibleKids(n).map((k) => extent(k) + CHILD_ROW_GAP));
  };
  return roots
    .filter((r) => r.start !== null)
    .map((root) => {
      const pieces: WorldPiece[] = [];
      const bar = (n: TreeNode, top: number) => {
        const open = n.event.ongoing,
          end = n.windowEnd ?? n.end;
        if (open) pieces.push({ id: n.id, kind: "bar", depth: n.depth, wx: wx(n.start!), width: Infinity, top, height: 4 });
        else if (end !== null && end > n.start!)
          pieces.push({ id: n.id, kind: "bar", depth: n.depth, wx: wx(n.start!), width: wx(end) - wx(n.start!), top, height: 4 });
      };
      const layout = (n: TreeNode, top: number): number => {
        const left = wx(n.start!),
          height = h(n);
        if (!n.children.length) {
          pieces.push({ id: n.id, kind: "card", depth: n.depth, wx: left, width: cardWidth(n, expanded.has(n.id)), top, height });
          bar(n, top + height);
          return top + height;
        }
        const width = extent(n) - left;
        pieces.push({ id: n.id, kind: "card", depth: n.depth, wx: left, width, top, height });
        pieces.push({ id: n.id, kind: "track", depth: n.depth, wx: left, width: Math.max(0, wx(familyEnd(n)) - left), top: top + height - 3, height: 3 });
        let bottom = top + height;
        const kids = visibleKids(n);
        if (kids.length) {
          const rows: { right: number; items: TreeNode[] }[] = [];
          for (const k of kids) {
            let r = rows.findIndex((row) => row.right + CHILD_ROW_GAP <= wx(k.start!));
            if (r < 0) r = rows.push({ right: -Infinity, items: [] }) - 1;
            rows[r].right = extent(k);
            rows[r].items.push(k);
          }
          let y = bottom + FAMILY_CHILD_TOP;
          for (const row of rows) y = Math.max(...row.items.map((k) => layout(k, y))) + FAMILY_ROW_GAP;
          bottom = y - FAMILY_ROW_GAP + FAMILY_FRAME_BOTTOM;
          pieces.push({ id: n.id, kind: "frame", depth: n.depth, wx: left, width, top, height: bottom - top });
        }
        return bottom;
      };
      const bottom = layout(root, 0);
      const finite = pieces.filter((p) => Number.isFinite(p.width));
      const left = Math.min(...pieces.map((p) => p.wx)) - FAMILY_PAD_LEFT,
        right = Math.max(...finite.map((p) => p.wx + p.width)) + FAMILY_H_GAP;
      return { id: root.id, start: root.start!, left, right, h: Math.max(bottom, ...pieces.map((p) => p.top + p.height)), pieces };
    });
}

export interface PackedFamily {
  box: FamilyBox;
  y: number;
  /** y from the last full pack (or first placement); expand/collapse returns here when nothing collides. */
  home: number;
  /** In the current build range (rendered); families outside it are kept as obstacles with their home. */
  built: boolean;
}
export interface PackedLayout {
  scale: number;
  width: number;
  mode: "full" | "incremental";
  families: Map<string, PackedFamily>;
  bottom: number;
}
export interface PackOptions {
  scale: number;
  width: number;
  /** The family whose card was clicked; it keeps its y (§5.2). Any event id inside the family works. */
  pinned?: string | null;
}
const collides = (y: number, f: FamilyBox, o: PackedFamily) =>
  y < o.y + o.box.h + FAMILY_V_GAP && y + f.h + FAMILY_V_GAP > o.y;
/** Lowest y ≥ from where the family fits beside the placed ones; candidates are `from` and bottoms of overlapping ones. */
function settle(f: FamilyBox, placed: readonly PackedFamily[], from: number) {
  // Same result as trying `from` and every column bottom in ascending order, in one pass by column top: y moves down
  // only to the bottom of a column it hits, and every value it skips hits that column. Once the family fits above a
  // column, later columns start lower still, so y is final. O(c log c) instead of O(c²); every zoom step repacks.
  const cols = placed.filter((o) => o.box.left < f.right && o.box.right > f.left).sort((a, b) => a.y - b.y);
  let y = from;
  for (const o of cols) if (collides(y, f, o)) y = o.y + o.box.h + FAMILY_V_GAP;
  return y;
}
/**
 * §5.2 ①: first-fit packing on unclipped world boxes. A new scale or width packs everything again and records home y.
 * Otherwise every known family starts from its home (the pinned one first, and it stays there), only moves down on a
 * collision, and families new to the build range fill free slots without moving the known ones.
 */
export function packFamilies(
  families: readonly FamilyBox[],
  prev: PackedLayout | null,
  options: PackOptions,
): PackedLayout {
  const full = !prev || prev.scale !== options.scale || prev.width !== options.width;
  const current = new Set(families.map((f) => f.id));
  const placed: PackedFamily[] = [];
  const out = new Map<string, PackedFamily>();
  const put = (p: PackedFamily) => {
    placed.push(p);
    out.set(p.box.id, p);
  };
  if (full) {
    for (const f of [...families].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id))) {
      const y = settle(f, placed, PLANE_TOP);
      put({ box: f, y, home: y, built: true });
    }
  } else {
    // Families outside the build range stay as obstacles at their last y, so they come back to the same place.
    for (const [id, p] of prev.families) if (!current.has(id)) put({ ...p, built: false });
    const pinned = options.pinned ?? null;
    const known = families.filter((f) => prev.families.has(f.id)),
      fresh = families.filter((f) => !prev.families.has(f.id));
    known.sort(
      (a, b) =>
        Number(b.id === pinned) - Number(a.id === pinned) ||
        prev.families.get(a.id)!.home - prev.families.get(b.id)!.home ||
        a.left - b.left,
    );
    for (const f of known) {
      const home = prev.families.get(f.id)!.home;
      put({ box: f, y: f.id === pinned ? home : settle(f, placed, home), home, built: true });
    }
    for (const f of fresh.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id))) {
      const y = settle(f, placed, PLANE_TOP);
      put({ box: f, y, home: y, built: true });
    }
  }
  const bottom = Math.max(PLANE_TOP, ...[...out.values()].filter((p) => p.built).map((p) => p.y + p.box.h));
  return { scale: options.scale, width: options.width, mode: full ? "full" : "incremental", families: out, bottom };
}

// ---------- timeline: on the plane (§5.2 ②) ----------
export interface LaneItem {
  id: string;
  start: number;
  end: number | null;
  /** y inside the character-change lane. */
  top: number;
  height: number;
}
export interface PlaneElement {
  id: string;
  family: string;
  kind: PlaneKind;
  depth: number;
  /** CSS px relative to the base; already clipped to the built range. */
  left: number;
  width: number;
  top: number;
  height: number;
  clippedStart: boolean;
  clippedEnd: boolean;
  startLabel: string | null;
  endLabel: string | null;
}
export interface PlaneOptions {
  base: number;
  scale: number;
  /** Built time range [lo, hi] = [windowStart − 3·span, windowStart + 4·span] at build time. */
  range: { lo: number; hi: number };
  lane?: readonly LaneItem[];
}
export interface PlaneResult {
  elements: PlaneElement[];
  /** R in CSS px relative to the base. */
  range: { left: number; right: number };
  laneTop: number;
}
/** Converts each element on its own to base-relative px and clips it to R; elements outside R are dropped. */
export function placeOnPlane(layout: PackedLayout, options: PlaneOptions): PlaneResult {
  const { base, scale } = options;
  const R = { left: (options.range.lo - base) * scale, right: (options.range.hi - base) * scale };
  const elements: PlaneElement[] = [];
  const clip = (
    id: string,
    family: string,
    kind: PlaneKind,
    depth: number,
    wx: number,
    width: number,
    top: number,
    height: number,
  ) => {
    const a = wx - base * scale,
      b = Number.isFinite(width) ? a + width : Infinity;
    if (b < R.left || a > R.right) return;
    const left = Math.max(a, R.left),
      right = Math.min(b, R.right),
      clippedStart = a < R.left,
      clippedEnd = b > R.right;
    elements.push({
      id,
      family,
      kind,
      depth,
      left,
      width: right - left,
      top,
      height,
      clippedStart,
      clippedEnd,
      startLabel: clippedStart ? CLIP_START_LABEL : null,
      endLabel: clippedEnd ? CLIP_END_LABEL : null,
    });
  };
  for (const p of layout.families.values()) {
    if (!p.built) continue;
    for (const piece of p.box.pieces)
      clip(piece.id, p.box.id, piece.kind, piece.depth, piece.wx, piece.width, p.y + piece.top, piece.height);
  }
  const laneTop = layout.bottom + LANE_GAP;
  for (const item of options.lane ?? [])
    clip(item.id, "", "lane", 0, item.start * scale, item.end === null ? Infinity : (item.end - item.start) * scale, laneTop + item.top, item.height);
  return { elements, range: R, laneTop };
}

// ---------- timeline: one render step (build range, re-basing, packing, placement) ----------
export interface TimelineState {
  packed: PackedLayout | null;
  base: number;
  build: { lo: number; hi: number } | null;
}
export function emptyTimeline(): TimelineState {
  return { packed: null, base: 0, build: null };
}
export interface TimelineInput {
  tree: EventTree;
  view: { start: number; span: number };
  /** Plot width in px; 0 while the tab is hidden. */
  width: number;
  expanded?: ReadonlySet<string>;
  folded?: ReadonlySet<string>;
  heights?: Readonly<Record<string, number | undefined>>;
  widthOf?: (n: TreeNode) => number;
  /** Event whose family keeps its y after an expand/collapse. */
  pinned?: string | null;
  /** Card sizes changed (expand, collapse, measured height, fold): rebuild and repack incrementally. */
  relayout?: boolean;
  lane?: readonly LaneItem[];
}
export interface TimelineStep {
  state: TimelineState;
  packMode: "full" | "incremental" | null;
  rebased: boolean;
  /** CSS translateX of the plane. */
  translateX: number;
  elements: PlaneElement[];
  range: { left: number; right: number };
  laneTop: number;
}
/** Build range [start − 3·span, start + 4·span]; rebuilt once the window leaves the middle of it. */
export function buildRange(view: { start: number; span: number }) {
  return { lo: view.start - 3 * view.span, hi: view.start + 4 * view.span };
}
/** Plane translateX; `+ 0` turns −0 into 0. */
const shift = (start: number, base: number, scale: number) => (base - start) * scale + 0;
const rootOf = (tree: EventTree, id: string | null | undefined) => {
  let n = id ? tree.byId.get(id) : undefined;
  while (n?.parent) n = tree.byId.get(n.parent);
  return n?.id ?? null;
};
/**
 * One frame of the timeline. Pure: the previous state is never mutated. A zero width keeps the state as it is
 * (hidden tab, §5.2 说明 2). A new scale or width repacks and re-bases at the window start; otherwise the base moves to
 * the window start as soon as it is more than 10⁶ px away, without touching the packing.
 */
export function timelineStep(state: TimelineState, input: TimelineInput): TimelineStep {
  const { view, width, tree } = input;
  if (!(width > 0) || !(view.span > 0) || !state.packed && !tree.roots.length) {
    const scale = state.packed?.scale ?? 0;
    return {
      state,
      packMode: null,
      rebased: false,
      translateX: shift(view.start, state.base, scale),
      elements: [],
      range: { left: 0, right: 0 },
      laneTop: 0,
    };
  }
  const scale = width / view.span;
  const full = !state.packed || state.packed.scale !== scale || state.packed.width !== width;
  let base = state.base,
    rebased = false;
  if (full) {
    rebased = base !== view.start;
    base = view.start;
  } else if (Math.abs(view.start - base) * scale > REBASE_PX) {
    base = view.start;
    rebased = true;
  }
  const b = state.build;
  const inside = !!b && view.start - view.span >= b.lo && view.start + 2 * view.span <= b.hi;
  let packed = state.packed,
    build = state.build,
    packMode: TimelineStep["packMode"] = null;
  if (full || !inside || input.relayout || !packed || !build) {
    build = full || !inside || !build ? buildRange(view) : build;
    const roots = tree.roots.filter(
      (r) => r.start !== null && familyEnd(r) >= build!.lo && r.start <= build!.hi,
    );
    const families = buildFamilies(roots, { scale, expanded: input.expanded, folded: input.folded, heights: input.heights, widthOf: input.widthOf });
    packed = packFamilies(families, full ? null : packed, { scale, width, pinned: rootOf(tree, input.pinned) });
    packMode = packed.mode;
  }
  const plane = placeOnPlane(packed, { base, scale, range: build, lane: input.lane });
  return {
    state: { packed, base, build },
    packMode,
    rebased,
    translateX: shift(view.start, base, scale),
    elements: plane.elements,
    range: plane.range,
    laneTop: plane.laneTop,
  };
}

// ---------- minimap (§5.3) ----------
export interface MinimapSegment {
  index: number;
  /** Time range shown, padded a little on both sides. */
  t0: number;
  t1: number;
  count: number;
  x0: number;
  width: number;
}
export interface MinimapModel {
  width: number;
  segments: MinimapSegment[];
  toX(t: number): number;
  toT(x: number): number;
}
const MINIMAP_PAD = 0.04;
/** Segments as on the rail; each one's width is (width − gaps) × its root count ÷ all roots. toX and toT invert each other. */
export function minimapModel(roots: readonly TreeNode[], width: number, adapter: CalendarAdapter): MinimapModel {
  const segs = railSegments(roots, adapter);
  const total = segs.reduce((n, s) => n + s.roots.length, 0);
  const usable = Math.max(0, width - MINIMAP_GAP * Math.max(0, segs.length - 1));
  let x = 0;
  const segments: MinimapSegment[] = segs.map((s) => {
    const t1 = Math.max(s.t1, ...s.roots.map((r) => familyEnd(r)));
    const pad = Math.max(adapter.dayHours, (t1 - s.t0) * MINIMAP_PAD);
    const w = total ? (usable * s.roots.length) / total : 0;
    const seg = { index: s.index, t0: s.t0 - pad, t1: t1 + pad, count: s.roots.length, x0: x, width: w };
    x += w + MINIMAP_GAP;
    return seg;
  });
  const toX = (t: number) => {
    if (!segments.length) return 0;
    const g = segments.find((g) => t <= g.t1) ?? segments[segments.length - 1];
    const r = (t - g.t0) / (g.t1 - g.t0);
    return g.x0 + Math.min(1, Math.max(0, r)) * g.width;
  };
  const toT = (px: number) => {
    if (!segments.length) return 0;
    const g = segments.find((g) => px <= g.x0 + g.width + MINIMAP_GAP / 2) ?? segments[segments.length - 1];
    const r = g.width > 0 ? (px - g.x0) / g.width : 0;
    return g.t0 + Math.min(1, Math.max(0, r)) * (g.t1 - g.t0);
  };
  return { width, segments, toX, toT };
}

// ---------- search and dimming (§5.3) ----------
export interface MatchContext {
  adapter: CalendarAdapter;
  /** Character id → name. */
  names: ReadonlyMap<string, string>;
  /** Resolves anchored times; without it only unanchored events get a formatted time. */
  data?: PlanningData;
}
/** Search box text → lower-cased terms. */
export function searchTerms(query: string): string[] {
  return query.toLowerCase().split(/\s+/u).filter(Boolean);
}
function eventStart(e: PlanningEvent, data?: PlanningData): number | null {
  if (data)
    try {
      return resolveTime(data, e).start;
    } catch {
      return null;
    }
  return e.time.kind === "unknown" || e.time.anchor ? null : e.time.value;
}
/** Every term must appear in the title, fact, character names, type name, time.label or formatted time; case-insensitive. */
export function matchEvent(e: PlanningEvent, terms: readonly string[], ctx: MatchContext): boolean {
  if (!terms.length) return true;
  const start = eventStart(e, ctx.data);
  const hay = [
    e.title,
    e.fact,
    ...e.people.map((p) => ctx.names.get(p) ?? ""),
    e.category,
    e.time.label,
    start === null ? "" : ctx.adapter.label(start, 48, e.time.precision === "hour" ? undefined : e.time.precision),
  ]
    .join("\n")
    .toLowerCase();
  return terms.every((t) => hay.includes(t.toLowerCase()));
}
export interface DimFilter {
  /** Categories hidden in the legend. */
  hidden: ReadonlySet<EventCategory>;
  terms: readonly string[];
  ctx: MatchContext;
}
/** Hidden by the legend, or missed by a non-empty search: either one fades the event (M7). */
export function dimmedBy(e: PlanningEvent, filter: DimFilter): boolean {
  return filter.hidden.has(e.category) || (filter.terms.length > 0 && !matchEvent(e, filter.terms, filter.ctx));
}
