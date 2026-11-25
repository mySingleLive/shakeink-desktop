/* docs/607: opening a large outline froze the UI because orderedCards/readingCards were quadratic in the
 * card count and ran once per chapter. These cases pin the exact old output (reference copies below) and a
 * time budget. Synthetic data only. */
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  applyPlanningOperations,
  cardSchema,
  cardChapter,
  chapterProjection,
  orderedCards,
  planningSchema,
  readingCards,
  type PlanningData,
} from "@/lib/planning/domain"

type Card = PlanningData["cards"][number]

/* Reference: the pre-607 implementations, copied verbatim apart from error construction. */
function refCheck(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}
function refChildren(data: PlanningData, line: string, parent: string | null): Card[] {
  return data.cards
    .filter((c) => c.line === line && c.parent === parent)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
}
function refOrdered(data: PlanningData, line: string, parent: string | null = null, seen = new Set<string>()): Card[] {
  return refChildren(data, line, parent).flatMap((c) => {
    refCheck(!seen.has(c.id), "叙事卡片形成循环")
    refCheck(seen.size < 10000, "叙事结构过大")
    seen.add(c.id)
    return [c, ...refOrdered(data, line, c.id, seen)]
  })
}
function refCardChapter(data: PlanningData, card: Card): string | null {
  const seen = new Set<string>()
  let current: Card | undefined = card
  while (current) {
    refCheck(!seen.has(current.id), "叙事卡片形成循环")
    seen.add(current.id)
    if (current.chapter) return current.chapter
    current = data.cards.find((c) => c.id === current!.parent)
  }
  return null
}
function refReading(data: PlanningData, line: string): Card[] {
  return refOrdered(data, line).filter((c) => c.narrateSummary || !refChildren(data, line, c.id).length)
}

/* Deterministic PRNG so failures reproduce. */
function rng(seed: number) {
  return () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
}
function randomPlanning(seed: number, cardCount: number): PlanningData {
  const r = rng(seed), pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)]
  const lines = ["line-a", "line-b"], chapters = Array.from({ length: 12 }, (_, i) => ({ id: `ch-${i}`, line: pick(lines), title: `第${i}章`, order: Math.floor(r() * 4) }))
  const cards: Record<string, unknown>[] = []
  for (let i = 0; i < cardCount; i++) {
    const id = `card-${String(Math.floor(r() * 1e6)).padStart(6, "0")}-${i}`
    // parents: none, an earlier card (any line, so cross-line parents occur), or an id that does not exist
    const chapter = r() < 0.4 ? pick(chapters).id : null
    const roll = r(), parent = roll < 0.35 || !cards.length ? null : roll < 0.92 ? (pick(cards).id as string) : `missing-${i}`
    cards.push({
      id, line: pick(lines), parent, order: Math.floor(r() * 3), title: `卡${i}`,
      chapter, narrateSummary: r() < 0.25,
      wordBudget: chapter && r() < 0.5 ? 500 : null,
      tellings: [{ id: `${id}-t`, intent: `意图${i}`, beats: r() < 0.5 ? [{ type: "动作", summary: `拍${i}` }] : [] }],
    })
  }
  return planningSchema.parse({ lines: lines.map((id, i) => ({ id, name: id, primary: i === 0 })), chapters, cards })
}

test("OL-01 orderedCards, readingCards, cardChapter and chapterProjection keep the exact old output", () => {
  for (let seed = 1; seed <= 40; seed++) {
    const data = randomPlanning(seed, 60 + seed * 3)
    for (const line of data.lines.map((l) => l.id)) {
      assert.deepEqual(orderedCards(data, line).map((c) => c.id), refOrdered(data, line).map((c) => c.id), `seed ${seed} ordered ${line}`)
      assert.deepEqual(readingCards(data, line).map((c) => c.id), refReading(data, line).map((c) => c.id), `seed ${seed} reading ${line}`)
    }
    for (const card of data.cards) assert.equal(cardChapter(data, card), refCardChapter(data, card), `seed ${seed} chapter ${card.id}`)
    for (const ch of data.chapters) {
      const got = chapterProjection(data, ch.id)
      const cards = refReading(data, ch.line).filter((c) => refCardChapter(data, c) === ch.id)
      const all = refOrdered(data, ch.line).filter((c) => refCardChapter(data, c) === ch.id)
      assert.deepEqual(got.cards.map((c) => c.id), cards.map((c) => c.id), `seed ${seed} projection cards ${ch.id}`)
      assert.deepEqual(got.allCards.map((c) => c.id), all.map((c) => c.id), `seed ${seed} projection allCards ${ch.id}`)
      assert.equal(got.allocated, cards.reduce((n, c) => n + (c.wordBudget ?? 0), 0))
    }
  }
})

test("OL-02 orderedCards with a parent returns only that subtree, in the old order", () => {
  const data = randomPlanning(7, 200)
  for (const card of data.cards.slice(0, 80))
    assert.deepEqual(orderedCards(data, card.line, card.id).map((c) => c.id), refOrdered(data, card.line, card.id).map((c) => c.id))
})

test("OL-03 a parent cycle still throws the same message", () => {
  const data = planningSchema.parse({
    lines: [{ id: "l", name: "l" }],
    cards: [
      { id: "a", line: "l", parent: "b", title: "a", tellings: [{ id: "ta" }] },
      { id: "b", line: "l", parent: "a", title: "b", tellings: [{ id: "tb" }] },
      { id: "root", line: "l", parent: null, title: "root", tellings: [{ id: "tr" }] },
      { id: "c", line: "l", parent: "root", title: "c", tellings: [{ id: "tc" }] },
      { id: "root2", line: "l", parent: "c", title: "root2", tellings: [{ id: "tr2" }] },
    ],
  })
  assert.throws(() => cardChapter(data, data.cards[0]), /叙事卡片形成循环/)
  // A cycle reachable from the given parent: orderedCards must stop with the cycle error, like the old code.
  assert.throws(() => refOrdered(data, "l", "a"), /叙事卡片形成循环/)
  assert.throws(() => orderedCards(data, "l", "a"), /叙事卡片形成循环/)
  // The caller-supplied seen set is honoured.
  assert.throws(() => orderedCards(data, "l", null, new Set(["c"])), /叙事卡片形成循环/)
  assert.deepEqual(orderedCards(data, "l").map((c) => c.id), refOrdered(data, "l").map((c) => c.id))
})

test("OL-04 results follow in-place edits to the same data object (no stale cache)", () => {
  const data = randomPlanning(11, 120), line = data.lines[0].id
  orderedCards(data, line); readingCards(data, line)
  const target = data.cards.find((c) => c.line === line && c.parent === null)!
  const other = data.cards.find((c) => c.line === line && c.id !== target.id && c.parent === null)!
  other.parent = target.id; other.order = 0; target.order = 99
  data.cards.push(cardSchema.parse({ id: "pushed", line, parent: target.id, title: "新", tellings: [{ id: "pt" }] }))
  assert.deepEqual(orderedCards(data, line).map((c) => c.id), refOrdered(data, line).map((c) => c.id))
  assert.deepEqual(readingCards(data, line).map((c) => c.id), refReading(data, line).map((c) => c.id))
  // group / move / copy mutate in place and call orderedCards/children mid-operation.
  // A valid tree (validation rejects cross-line and missing parents, which OL-01 covers directly).
  const l = "line-a", tree: Record<string, unknown>[] = []
  for (let i = 0; i < 40; i++) tree.push({ id: `n${i}`, line: i % 5 === 4 ? "line-b" : l, parent: null, order: i % 3, title: `n${i}`, tellings: [{ id: `nt${i}` }] })
  for (let i = 40; i < 80; i++) { const p = tree[i % 37] as { id: string; line: string }; tree.push({ id: `n${i}`, line: p.line, parent: p.id, order: i % 2, title: `n${i}`, tellings: [{ id: `nt${i}` }] }) }
  const base = planningSchema.parse({ lines: [{ id: l, name: l, primary: true }, { id: "line-b", name: "b" }], cards: tree })
  const roots = base.cards.filter((c) => c.line === l && c.parent === null)
  const after = applyPlanningOperations(base, [
    { kind: "group", ids: [roots[0].id, roots[1].id], id: "grp", title: "组" },
    { kind: "move", id: roots[2].id, line: l, parent: "grp", before: null },
    { kind: "copy", id: "grp", newId: "grp-copy", line: base.lines[1].id, parent: null },
  ])
  assert.ok(after.cards.some((c) => c.id === "grp-copy") && after.cards.some((c) => c.parent === "grp"))
  for (const line of after.lines.map((x) => x.id)) {
    assert.deepEqual(orderedCards(after, line).map((c) => c.id), refOrdered(after, line).map((c) => c.id))
    assert.deepEqual(readingCards(after, line).map((c) => c.id), refReading(after, line).map((c) => c.id))
  }
})

test("OL-05 projecting every chapter of a large flat outline stays well under a second", () => {
  // Same shape as the reported work: ~900 top-level cards on one line, ~220 chapters.
  const chapters = Array.from({ length: 220 }, (_, i) => ({ id: `c${i}`, line: "main", title: `第${i + 1}章`, order: i }))
  const cards = Array.from({ length: 900 }, (_, i) => ({
    id: `k${String(i).padStart(4, "0")}`, line: "main", order: i, title: `卡${i}`,
    chapter: `c${Math.floor(i / 4.1)}`, tellings: [{ id: `t${i}`, intent: "意图", beats: [{ type: "动作", summary: "拍" }] }],
  }))
  const data = planningSchema.parse({ lines: [{ id: "main", name: "主线", primary: true }], chapters, cards })
  chapterProjection(data, "c0") // warm up the JIT
  const start = performance.now()
  for (const ch of data.chapters) chapterProjection(data, ch.id)
  const elapsed = performance.now() - start
  assert.ok(elapsed < 500, `220 chapters took ${elapsed.toFixed(0)} ms (budget 500 ms)`)
})
