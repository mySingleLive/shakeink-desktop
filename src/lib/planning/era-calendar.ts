/**
 * docs/572 R1: novel calendars with eras. Day numbers count from year 1, January 1 of an era, on the proleptic
 * Gregorian rules, in pure integer arithmetic (no Date: Date.UTC maps years 0–99 to 1900+ and stops near ±273k years).
 */
export const ERA_MAX_YEAR = 1_000_000;
/** Mean Gregorian year in hours; used for steps and estimates only. Labels always use the exact day numbers. */
export const ERA_YEAR_HOURS = 24 * 365.2425;
export type EraPrecision = "hour" | "day" | "month" | "year" | "era";
export interface Era {
  name: string;
  start: number;
}

const floorDiv = (a: number, b: number) => Math.floor(a / b);
/** Days from year 1-01-01 (day 0) to the given date (Howard Hinnant's days_from_civil, shifted to year 1). */
export function civilDays(year: number, month: number, day: number): number {
  const y = year - (month <= 2 ? 1 : 0),
    era = floorDiv(y, 400),
    yoe = y - era * 400,
    mp = (month + 9) % 12,
    doy = floorDiv(153 * mp + 2, 5) + day - 1,
    doe = yoe * 365 + floorDiv(yoe, 4) - floorDiv(yoe, 100) + doy;
  // 306 = days from 0000-03-01 to 0001-01-01.
  return era * 146097 + doe - 306;
}
export function civilFromDays(n: number): {
  year: number;
  month: number;
  day: number;
} {
  const z = n + 306,
    era = floorDiv(z, 146097),
    doe = z - era * 146097,
    yoe = floorDiv(
      doe - floorDiv(doe, 1460) + floorDiv(doe, 36524) - floorDiv(doe, 146096),
      365,
    ),
    doy = doe - (365 * yoe + floorDiv(yoe, 4) - floorDiv(yoe, 100)),
    mp = floorDiv(5 * doy + 2, 153),
    day = doy - floorDiv(153 * mp + 2, 5) + 1,
    month = mp < 10 ? mp + 3 : mp - 9;
  return { year: yoe + era * 400 + (month <= 2 ? 1 : 0), month, day };
}
export function isCivilDate(year: number, month: number, day: number) {
  if (![year, month, day].every(Number.isSafeInteger)) return false;
  if (year < 1 || year > ERA_MAX_YEAR || month < 1 || month > 12 || day < 1)
    return false;
  const c = civilFromDays(civilDays(year, month, day));
  return c.year === year && c.month === month && c.day === day;
}
/** Era names compare without spaces and without a trailing 元 (第五纪元 = 第五纪). */
export const eraKey = (name: string) =>
  name.replace(/\s+/gu, "").replace(/元$/u, "");

/** "{era}{year}年{month}月{day}日" cut to the precision; values before the first era read "{first}之前". */
export function eraLabel(
  value: number,
  eras: readonly Era[],
  precision: Exclude<EraPrecision, "hour">,
): string {
  const sorted = [...eras].sort((a, b) => a.start - b.start);
  if (!sorted.length || !Number.isFinite(value)) return "";
  if (value < sorted[0].start) return `${sorted[0].name || "纪年"}之前`;
  let era = sorted[0];
  for (const e of sorted) if (e.start <= value) era = e;
  if (precision === "era") return era.name || "纪年";
  // docs/574 #2: round away float noise before taking the day, so D − ε does not show the previous day.
  const c = civilFromDays(Math.floor(Math.round(((value - era.start) / 24) * 1e6) / 1e6));
  if (c.year > ERA_MAX_YEAR) return `${era.name}${ERA_MAX_YEAR}年后`;
  const year = `${era.name}${c.year}年`;
  return precision === "year"
    ? year
    : precision === "month"
      ? `${year}${c.month}月`
      : `${year}${c.month}月${c.day}日`;
}
/** Eras must start in strictly increasing order (checked by validatePlanning, not by the read schema). */
export function erasOrdered(eras: readonly Era[]) {
  return eras.every((e, i) => i === 0 || e.start > eras[i - 1].start);
}
