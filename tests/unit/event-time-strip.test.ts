import assert from "node:assert/strict"
import { test } from "node:test"
import { eventSchema, planningSchema } from "../../src/lib/planning/domain"
import { sameEvent } from "../../src/lib/planning/event-draft"
import * as S from "../../src/lib/planning/event-time-strip"

/* docs/599 §4.3 / §10.1 / §15.13 (TS-01 … TS-07): time strip and draft comparison pure functions. Synthetic data. */
const fixed = planningSchema.parse({ worlds: [{ id: "w", name: "主" }] }).worlds[0].calendar
const years = { ...fixed, kind: "years" as const, hoursPerDay: null, daysPerMonth: null, monthsPerYear: null }
const noDay = { ...fixed, hoursPerDay: null }
const ev = (o: Record<string, unknown>) => eventSchema.parse({ id: "e", line: "w", title: "t", ...o })

test("TS-01: stripEnds per time kind", () => {
  assert.deepEqual(S.stripEnds(ev({ time: { kind: "exact", value: 24 }, duration: 6 }), fixed), { a: 24, b: 30, kind: "span" })
  assert.deepEqual(S.stripEnds(ev({ time: { kind: "exact", value: 24 }, duration: 0 }), fixed), { a: 24, b: 24, kind: "point" })
  assert.deepEqual(S.stripEnds(ev({ time: { kind: "exact", value: 24 }, duration: null }), fixed), { a: 24, b: 24, kind: "open" })
  assert.deepEqual(S.stripEnds(ev({ time: { kind: "exact", value: 24 }, duration: null, ongoing: true }), fixed), { a: 24, b: 24, kind: "ongoing" })
  assert.deepEqual(S.stripEnds(ev({ time: { kind: "window", value: 10, end: 50 } }), fixed), { a: 10, b: 50, kind: "window" })
  assert.deepEqual(S.stripEnds(ev({ time: { kind: "window", value: 48, end: 72, label: "仅同日", precision: "day" } }), fixed), { a: 48, b: 72, kind: "day" })
  assert.equal(S.stripEnds(ev({ time: { kind: "unknown" } }), fixed), null)
})

test("TS-02: stripStep picks the largest calendar unit within range / 30", () => {
  assert.equal(S.stripStep([0, 60], fixed, "span"), 1)
  assert.equal(S.stripStep([0, 30 * 24], fixed, "span"), 24)
  assert.equal(S.stripStep([0, 30 * 24 - 1], fixed, "span"), 1)
  assert.equal(S.stripStep([0, 2000], fixed, "span"), 24)
  assert.equal(S.stripStep([0, 1e5], fixed, "span"), 720)
  assert.equal(S.stripStep([0, 1e7], fixed, "span"), 8640)
  assert.equal(S.stripStep([0, 1e5], years, "span"), 1)
  assert.equal(S.stripStep([0, 1e5], noDay, "span"), 1)
  assert.equal(S.stripStep([0, 1e5], fixed, "day"), 24)
  assert.equal(S.dayKnownAllowed(fixed), true)
  assert.equal(S.dayKnownAllowed(years), false)
  assert.equal(S.dayKnownAllowed(noDay), false)
})

const span = { a: 24, b: 30, kind: "span" as const }
test("TS-03: moving the start keeps the end; it stops at the end", () => {
  assert.deepEqual(S.moveStrip("s", span, 3, 1), { value: 27, duration: 3 })
  assert.deepEqual(S.moveStrip("s", span, 100, 1), { value: 30, duration: 0 })
  assert.deepEqual(S.moveStrip("s", { a: 24, b: 24, kind: "point" }, 5.4, 1), { value: 29 })
})

test("TS-04: moving the end keeps the start; it stops at the start", () => {
  assert.deepEqual(S.moveStrip("e", span, 2.6, 1), { duration: 9 })
  assert.deepEqual(S.moveStrip("e", span, -100, 1), { duration: 0 })
  assert.deepEqual(S.moveStrip("e", { a: 10, b: 50, kind: "window" }, 7, 1), { end: 57 })
  assert.deepEqual(S.moveStrip("e", { a: 10, b: 50, kind: "window" }, -100, 1), { end: 10 })
})

test("TS-05: moving the whole span keeps its length and snaps", () => {
  assert.deepEqual(S.moveStrip("m", span, 2.4, 1), { value: 26 })
  assert.deepEqual(S.moveStrip("m", { a: 10, b: 50, kind: "window" }, 23, 24), { value: 24, end: 64 })
  assert.deepEqual(S.moveStrip("m", { a: 48, b: 72, kind: "day" }, 30, 24), { value: 72, end: 96 })
})

test("TS-06: wholeUnit picks the largest unit that shows the value whole", () => {
  const units = S.timeUnits(fixed).map((u) => u.value)
  assert.deepEqual(units, [1, 24, 720, 8640])
  assert.equal(S.wholeUnit(29, fixed, 24), 1)
  assert.equal(S.wholeUnit(48, fixed, 1), 24)
  assert.equal(S.wholeUnit(720, fixed, 1), 720)
  assert.equal(S.wholeUnit(-72, fixed, 1), 24)
  assert.equal(S.wholeUnit(0, fixed, 24), 24)
  assert.deepEqual(S.timeUnits(years).map((u) => u.value), [1])
})

test("TS-07: sameEvent ignores key order, not array order; undefined equals a missing key", () => {
  const a = ev({ time: { kind: "exact", value: 1 }, people: ["x", "y"] })
  const b = { ...a, time: Object.fromEntries(Object.entries(a.time).reverse()) }
  assert.equal(sameEvent(a, JSON.parse(JSON.stringify(b))), true)
  assert.equal(sameEvent(a, { ...a, people: ["y", "x"] }), false)
  assert.equal(sameEvent({ ...a, extra: undefined } as never, a), true)
  assert.equal(sameEvent(a, { ...a, importance: 2 }), false)
})

test("TS-08: window before / after maps by position", () => {
  assert.deepEqual(S.windowFromSentence(-1, 2, 5, 24), { value: -120, end: -48 })
  assert.deepEqual(S.windowFromSentence(1, 2, 5, 24), { value: 48, end: 120 })
  assert.deepEqual(S.windowSentence({ value: -120, end: -48 }, 24), { sign: -1, from: 2, to: 5 })
  assert.deepEqual(S.windowSentence({ value: 48, end: 120 }, 24), { sign: 1, from: 2, to: 5 })
})
