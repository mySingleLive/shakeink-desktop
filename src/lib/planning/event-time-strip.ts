import type { PlanningEvent } from "./domain";
import type { Calendar } from "./timeline";

/** docs/599 §4.3: the draggable time strip in the event time picker. Values are the event's own time values (relative
 * to its anchor, in worldline hours); the strip never resolves the anchor, so a drag only changes relative values. */
export type StripKind = "point" | "span" | "open" | "ongoing" | "window" | "day";
export interface StripEnds { a: number; b: number; kind: StripKind }

/** Calendar units offered by the number fields and used as drag steps: hour, day, month, year (as the calendar has them). */
export function timeUnits(calendar: Calendar): { label: string; value: number }[] {
  if (calendar.kind === "years") return [{ label: "年", value: 1 }];
  const units = [{ label: "小时", value: 1 }];
  if (!calendar.hoursPerDay) return units;
  units.push({ label: "天", value: calendar.hoursPerDay });
  if (!calendar.daysPerMonth) return units;
  const month = calendar.hoursPerDay * calendar.daysPerMonth;
  units.push({ label: "个月", value: month });
  if (calendar.monthsPerYear) units.push({ label: "年", value: month * calendar.monthsPerYear });
  return units;
}
/** “只知道哪天” needs a day length (the old editor disabled it the same way). */
export function dayKnownAllowed(calendar: Calendar) {
  return calendar.kind !== "years" && !!calendar.hoursPerDay;
}
export function stripEnds(e: PlanningEvent, calendar: Calendar): StripEnds | null {
  const t = e.time, a = t.value;
  if (t.kind === "unknown") return null;
  if (t.kind === "window") {
    if (t.label === "仅同日") return { a, b: a + (calendar.hoursPerDay ?? 24), kind: "day" };
    return { a, b: t.end ?? a, kind: "window" };
  }
  if (e.duration === null) return { a, b: a, kind: e.ongoing ? "ongoing" : "open" };
  if (e.duration === 0) return { a, b: a, kind: "point" };
  return { a, b: a + e.duration, kind: "span" };
}
/** Visible range: 30% of the span before the start, 60% after the end (110% for an open end). */
export function fitStrip(ends: StripEnds, calendar: Calendar): [number, number] {
  const unit = timeUnits(calendar)[1]?.value ?? 1;
  const base = ends.b > ends.a ? ends.b - ends.a : unit * 2;
  const tail = ends.kind === "open" || ends.kind === "ongoing" ? 1.1 : 0.6;
  return [ends.a - base * 0.3, ends.b + base * tail];
}
/** Drag step: the largest calendar unit no longer than range / 30; a known day always moves by days. */
export function stripStep(range: [number, number], calendar: Calendar, kind: StripKind): number {
  const units = timeUnits(calendar).map((u) => u.value);
  if (kind === "day") return units[1] ?? 1;
  const limit = (range[1] - range[0]) / 30;
  return units.filter((u) => u <= limit).pop() ?? units[0];
}
const snap = (v: number, step: number) => Math.round(v / step) * step;
/** One move of handle h ("s" start, "e" end, "m" whole) by dh hours from `o`, snapped to `step`. Returns only the
 * fields that change. The start never passes the end and the end never passes the start. */
export function moveStrip(h: "s" | "e" | "m", o: StripEnds, dh: number, step: number): { value?: number; end?: number; duration?: number } {
  const win = o.kind === "window" || o.kind === "day";
  if (h === "m") {
    const t = snap(o.a + dh, step) - o.a;
    return win ? { value: o.a + t, end: o.b + t } : { value: o.a + t };
  }
  if (h === "s") {
    const v = snap(o.a + dh, step);
    if (o.kind === "span") { const nv = Math.min(v, o.b); return { value: nv, duration: o.b - nv }; }
    if (win) return { value: Math.min(v, o.b) };
    return { value: v };
  }
  const v = Math.max(o.a, snap(o.b + dh, step));
  return win ? { end: v } : { duration: v - o.a };
}
/** The largest unit that shows `value` as a whole number; 0 keeps the current unit. */
export function wholeUnit(value: number, calendar: Calendar, current: number): number {
  if (value === 0) return current;
  const whole = (u: number) => Math.abs(value / u - Math.round(value / u)) < 1e-9;
  return [...timeUnits(calendar)].reverse().find((u) => whole(u.value))?.value ?? 1;
}
/** docs/599 §13.9: a window sentence “[参考] 前 / 后 from 至 to”, mapped by position (no reordering while typing). */
export function windowFromSentence(sign: 1 | -1, from: number, to: number, unit: number) {
  return sign < 0 ? { value: -to * unit, end: -from * unit } : { value: from * unit, end: to * unit };
}
export function windowSentence(t: { value: number; end: number | null }, unit: number) {
  const end = t.end ?? t.value;
  const sign: 1 | -1 = t.value < 0 || (t.value === 0 && end < 0) ? -1 : 1;
  const n = (v: number) => +(Math.abs(v) / unit).toPrecision(12);
  return sign < 0 ? { sign, from: n(end), to: n(t.value) } : { sign, from: n(t.value), to: n(end) };
}
