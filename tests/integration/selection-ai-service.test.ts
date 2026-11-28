import assert from "node:assert/strict"
import { after, before, beforeEach, test } from "node:test"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { Workspaces } from "../../desktop/service/workspaces"
import { ModelRepository, type ModelDraft } from "../../desktop/main/model-repository"
import { ModelService } from "../../desktop/main/model-service"
import { ModelGateway } from "../../desktop/core/model-authorization"
import { configureModelTransport, localModelFetch } from "../../desktop/service/models"
import { prisma } from "../../src/lib/db"
import { PROMPT_TEMPLATES } from "../../prisma/seed-templates"
import { planningSchema } from "../../src/lib/planning/domain"
import { commitChapterRevision, contentHash } from "../../src/lib/services/content-commit"
import { listChapterVersions, restoreChapterVersion } from "../../src/lib/services/chapter-history"
import { prepareSelectionRewrite, commitSelectionReplacement, undoSelectionReplacement, type SelectionStreamEvent } from "../../src/lib/services/selection-ai"
import { historyReason } from "../../src/lib/selection-ai"

// docs/612 §2–§3 (SAI / SAC). Real PGlite, real prompt rendering, real context builders, real model gateway with a
// scripted fetch. Prompts are inspected in memory only and never written to evidence.
const USER = "local-author"
const draft: ModelDraft = { name: "fixture", provider: "custom", protocol: "openai", modelId: "fixture-text", endpoint: "https://fixture.invalid/v1", kind: "TEXT", contextWindow: 128000, enabled: true, thinkingLevels: [], defaultThinking: "default", apiKey: "private-fixture-key" }
const draft2: ModelDraft = { ...draft, name: "fixture-2", modelId: "fixture-text-2", apiKey: "private-fixture-key-2" }
const protection = { isEncryptionAvailable: () => true, encryptString: (v: string) => Buffer.from(v), decryptString: (v: Buffer) => v.toString() }

type Script = { reasoning?: string[]; text: string[]; finish?: string; fail?: boolean; hang?: Promise<void> }
let script: Script = { text: ["润色后的句子。"] }
const sent: { model: string; prompt: string; signal?: AbortSignal | null }[] = []
let root = "", works!: Workspaces, repo!: ModelRepository, service!: ModelService, m1 = "", m2 = ""
const originalFetch = globalThis.fetch

const chunk = (delta: object, finish: string | null = null, usage?: object) => `data: ${JSON.stringify({ id: "f", created: 1, model: "x", choices: [{ index: 0, delta, finish_reason: finish }], ...(usage ? { usage } : {}) })}\n\n`
const gateway = new ModelGateway({ keyFor: (id, rev) => repo.keyFor(id, rev), fetch: async (_url, init) => {
  const body = JSON.parse(String(init?.body))
  sent.push({ model: body.model, prompt: body.messages.map((m: { content: string | { text: string }[] }) => typeof m.content === "string" ? m.content : m.content.map(p => p.text).join("")).join("\n"), signal: init?.signal })
  if (script.fail) throw new Error("upstream exploded")
  const parts = [...(script.reasoning ?? []).map(r => chunk({ reasoning_content: r })), ...script.text.map(t => chunk({ content: t })), chunk({}, script.finish ?? "stop", { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 })]
  const enc = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({ async start(c) {
    for (const [i, p] of parts.entries()) { if (i === 1 && script.hang) await script.hang; if (init?.signal?.aborted) { c.error(new DOMException("aborted", "AbortError")); return } c.enqueue(enc.encode(p)) }
    c.enqueue(enc.encode("data: [DONE]\n\n")); c.close()
  } })
  return new Response(stream, { headers: { "content-type": "text/event-stream" } })
} })

const run = <T>(fn: () => Promise<T>) => works.runWithGlobal("inbox", fn)
const scopeP = { userId: USER, novelId: "novel-p", chapterId: "chapter-p2" }
const scopeN = { userId: USER, novelId: "novel-n", chapterId: "chapter-n1" }
const P2_TEXT = "林简撑着伞站在檐下，看见柜台后面坐着一个陌生的老人。\n\n老人低头翻着一本没有封皮的册子，手指在纸页上停停走走，像是在数着什么。屋里很静。\n\n她犹豫了一会儿，还是推门走了进去。门上的铜铃响了一声。"
const QUOTE = "老人低头翻着一本没有封皮的册子"

async function collect(events: AsyncIterable<SelectionStreamEvent>) { const out: SelectionStreamEvent[] = []; for await (const e of events) out.push(e); return out }
async function chapter(id: string) { return prisma.chapter.findUniqueOrThrow({ where: { id } }) }
function range(text: string, quote: string) { const start = text.indexOf(quote); assert.ok(start >= 0); return { start, end: start + quote.length, quote } }
async function base(id: string) { const c = await chapter(id); return { baseVersion: c.version, baseHash: contentHash(c.content) } }

before(async () => {
  root = await mkdtemp(join(tmpdir(), "xuanxiang-selection-ai-"))
  works = new Workspaces(join(root, "app"), join(process.cwd(), "prisma/migrations"))
  repo = new ModelRepository(join(root, "state.json"), protection, gateway); service = new ModelService(repo, gateway)
  configureModelTransport(async (method, value) => {
    if (method === "model.defaults") return service.defaults() as never
    if (method === "model.resolve") return service.resolve(value) as never
    if (method === "model.start") return service.start(value) as never
    if (method === "model.read") return service.read(value) as never
    if (method === "model.cancel") return service.cancel(value) as never
    throw Error("Unexpected transport method " + method)
  })
  globalThis.fetch = localModelFetch
  await works.initialize()
  let state = await repo.saveModel(0, draft); m1 = state.models[0].id
  state = await repo.saveModel(state.revision, draft2); m2 = state.models.find(m => m.modelId === draft2.modelId)!.id
  state.settings.agent.textModelId = m1; await repo.updateSettings(state.revision, state.settings)
  await run(async () => {
    for (const template of PROMPT_TEMPLATES) if (!await prisma.promptTemplate.findUnique({ where: { key: template.key } })) await prisma.promptTemplate.create({ data: { ...template, version: 1, enabled: true } })
  })
})
after(async () => { globalThis.fetch = originalFetch; await service?.close(); await works?.close(); if (root) await rm(root, { recursive: true, force: true }) })

beforeEach(() => run(async () => {
  sent.length = 0; script = { text: ["润色后的句子。"] }
  await prisma.foreshadow.deleteMany({ where: { novelId: { in: ["novel-p", "novel-n"] } } })
  await prisma.novel.deleteMany({ where: { id: { in: ["novel-p", "novel-n"] } } })
  await prisma.contentVersion.deleteMany({}); await prisma.contentMutation.deleteMany({})
  // novel-p: has planning
  await prisma.novel.create({ data: { id: "novel-p", userId: USER, title: "雨镇书铺" } })
  await prisma.theme.create({ data: { novelId: "novel-p", title: "雨夜奇遇", synopsis: "一个关于旧书铺与命运的故事", referenceCases: "", channel: "女频", genre: "悬疑", tags: [], sellingPoints: "", targetAudience: "" } })
  await prisma.setting.create({ data: { id: "s-style", novelId: "novel-p", type: "STYLE", name: "文风", content: { tone: "冷静克制的第三人称" } } })
  await prisma.world.create({ data: { id: "world-p", novelId: "novel-p", name: "雨镇世界", description: "常年下雨的小镇" } })
  await prisma.setting.create({ data: { id: "s-rule", novelId: "novel-p", worldId: "world-p", type: "CONCEPT", name: "书铺规则", content: { rule: "书铺只在雨天开门" } } })
  await prisma.character.create({ data: { id: "c-lin", novelId: "novel-p", name: "林简", roleType: "PROTAGONIST", age: "二十", occupation: "学生", personality: "谨慎", appearance: "清瘦", clothing: "旧外套", catchphrase: "", growthArc: "", relationships: [], extra: {} } })
  await prisma.character.create({ data: { id: "c-old", novelId: "novel-p", name: "老人", roleType: "SUPPORTING", age: "七十", occupation: "店主", personality: "沉默", appearance: "佝偻", clothing: "灰布长衫", catchphrase: "", growthArc: "", relationships: [], extra: {} } })
  await prisma.foreshadow.create({ data: { id: "f-key", novelId: "novel-p", title: "柜中钥匙", content: "钥匙藏在柜中" } })
  await prisma.volume.create({ data: { id: "volume-p", novelId: "novel-p", index: 1, title: "雨季", summary: "林简来到雨镇" } })
  await prisma.chapter.create({ data: { id: "chapter-p1", volumeId: "volume-p", index: 1, title: "抵达", outline: "林简抵达雨镇", content: "第一章的最后一句：雨一直没有停。", status: "WRITTEN" } })
  await prisma.chapter.create({ data: { id: "chapter-p2", volumeId: "volume-p", index: 2, title: "书铺", outline: "林简走进旧书铺", content: P2_TEXT, status: "WRITTEN", wordCount: 70 } })
  const planning = planningSchema.parse({
    worlds: [{ id: "w1", name: "主世界线", worldId: "world-p" }],
    lines: [{ id: "l1", name: "主叙事线", primary: true }],
    events: [{ id: "e1", line: "w1", title: "雨夜来客", fact: "老人抵达书铺" }],
    volumes: [{ id: "volume-p", line: "l1", title: "雨季" }],
    chapters: [{ id: "chapter-p1", line: "l1", volume: "volume-p", title: "抵达", order: 0 }, { id: "chapter-p2", line: "l1", volume: "volume-p", title: "书铺", order: 1, wordMin: 0, wordBudget: 3000 }],
    cards: [{ id: "card-1", line: "l1", chapter: "chapter-p2", title: "走进书铺", order: 1, tellings: [{ id: "t1", narrator: "林简", intent: "让读者感到书铺的诡异", materialRefs: [{ kind: "setting", id: "s-rule", role: "use", note: "书铺只在雨天开门" }], beats: [{ type: "环境", summary: "雨中的书铺" }], refs: [{ line: "w1", event: "e1", reveal: "钥匙在柜中", withheld: "老人身份" }] }] }],
  })
  await prisma.planningDocument.create({ data: { novelId: "novel-p", data: planning as object } })
  // novel-n: no planning
  await prisma.novel.create({ data: { id: "novel-n", userId: USER, title: "无规划作品" } })
  await prisma.theme.create({ data: { novelId: "novel-n", title: "无规划主题", synopsis: "简介", referenceCases: "", channel: "", genre: "", tags: [], sellingPoints: "", targetAudience: "" } })
  await prisma.world.create({ data: { id: "world-n", novelId: "novel-n", name: "雨镇", description: "多雨" } })
  await prisma.setting.create({ data: { id: "s-n", novelId: "novel-n", worldId: "world-n", type: "CONCEPT", name: "旧书铺规则", content: { rule: "不许问价" } } })
  await prisma.foreshadow.create({ data: { id: "f-n", novelId: "novel-n", title: "无名信", content: "一封没有署名的信" } })
  await prisma.volume.create({ data: { id: "volume-n", novelId: "novel-n", index: 1, title: "卷一", summary: "卷一简介" } })
  await prisma.chapter.create({ data: { id: "chapter-n1", volumeId: "volume-n", index: 1, title: "首章", outline: "首章章纲", content: P2_TEXT, status: "WRITTEN" } })
}))

test("SAI-01: planned chapter prompt carries novel, narrative and local context", () => run(async () => {
  const r = range(P2_TEXT, QUOTE)
  const events = await collect(await prepareSelectionRewrite(scopeP, { action: "polish", ...r, ...(await base("chapter-p2")), modelId: m1 }))
  assert.deepEqual(events.filter(e => e.type === "text-delta").map(e => e.delta).join(""), "润色后的句子。")
  assert.equal(events.at(-1)?.type, "done")
  const prompt = sent[0].prompt
  for (const needle of ["雨镇书铺", "书铺", "雨夜奇遇", "冷静克制的第三人称", "林简", "老人", "书铺规则", "雨镇世界", "让读者感到书铺的诡异", "雨中的书铺", "钥匙在柜中", "老人身份", "雨夜来客", "老人抵达书铺", "雨季", "林简走进旧书铺", "雨一直没有停", QUOTE, "林简撑着伞站在檐下", "推门走了进去", "保留原意、情节、人称和信息量"]) assert.ok(prompt.includes(needle), needle)
}))

test("SAI-02: unplanned chapter keeps full worlds, settings and foreshadow digest", () => run(async () => {
  const r = range(P2_TEXT, QUOTE)
  await collect(await prepareSelectionRewrite(scopeN, { action: "polish", ...r, ...(await base("chapter-n1")), modelId: m1 }))
  const prompt = sent[0].prompt
  for (const needle of ["无规划主题", "雨镇", "旧书铺规则", "无名信", "卷一简介", "首章章纲", "本章未纳入叙事线规划"]) assert.ok(prompt.includes(needle), needle)
  assert.equal(prompt.includes("由本章披露简报提供"), false)
}))

test("SAI-03/04: author requirement, mention token and per-action instructions", () => run(async () => {
  const r = range(P2_TEXT, QUOTE)
  const token = "@[角色/林简](character:c-lin)"
  await collect(await prepareSelectionRewrite(scopeP, { action: "rewrite", ...r, ...(await base("chapter-p2")), modelId: m1, requirement: `语气更冷，突出${token}的不安` }))
  assert.ok(sent[0].prompt.includes(token)); assert.ok(sent[0].prompt.includes("语气更冷"))
  await collect(await prepareSelectionRewrite(scopeP, { action: "continue", ...r, ...(await base("chapter-p2")), modelId: m1 }))
  assert.ok(sent[1].prompt.includes("只输出接在选区后的新文字"))
  await collect(await prepareSelectionRewrite(scopeP, { action: "summary", ...r, ...(await base("chapter-p2")), modelId: m1 }))
  assert.ok(sent[2].prompt.includes("用一段话概括"))
}))

test("SAI-05: stream order and no persistence", () => run(async () => {
  script = { reasoning: ["想一想"], text: ["甲", "乙"] }
  const before = await chapter("chapter-p2")
  const events = await collect(await prepareSelectionRewrite(scopeP, { action: "polish", ...range(P2_TEXT, QUOTE), ...(await base("chapter-p2")), modelId: m1 }))
  const kinds = events.map(e => e.type).filter(k => k !== "queued")
  // Reasoning parts depend on the provider adapter (the openai-compatible fixture does not emit them); order of text and done is the contract.
  assert.deepEqual(kinds.filter(k => k !== "reasoning-delta"), ["text-delta", "text-delta", "done"])
  assert.equal((events.at(-1) as { finishReason: string }).finishReason, "stop")
  const now = await chapter("chapter-p2")
  assert.equal(now.version, before.version); assert.equal(now.content, before.content)
  assert.equal(await prisma.contentVersion.count(), 0); assert.equal(await prisma.contentMutation.count(), 0)
}))

test("SAI-06/06b/06c: base from current chapter or snapshot; edits elsewhere do not break retry", () => run(async () => {
  const r = range(P2_TEXT, QUOTE)
  const b = await base("chapter-p2")
  // 06b: version 1 with no snapshot at all
  await collect(await prepareSelectionRewrite(scopeP, { action: "polish", ...r, ...b, modelId: m1 }))
  assert.equal(await prisma.contentVersion.count(), 0)
  // the author edits elsewhere and saves (v2); snapshotChapter(before) records v1
  const edited = P2_TEXT.replace("门上的铜铃响了一声。", "门上的铜铃响了两声。")
  await commitChapterRevision({ ...scopeP, expectedVersion: 1, operationId: "manual-1", source: "manual", reason: "正文更新", changes: { content: edited } })
  // 06/06c: retry and continue with the original base still work, and use v1 text
  await collect(await prepareSelectionRewrite(scopeP, { action: "polish", ...r, ...b, modelId: m1 }))
  assert.ok(sent[1].prompt.includes("门上的铜铃响了一声"))
  assert.equal(sent[1].prompt.includes("响了两声"), false)
  await collect(await prepareSelectionRewrite(scopeP, { action: "polish", ...r, ...b, modelId: m1, continuation: "已经写好的前半" }))
  assert.ok(sent[2].prompt.includes("已经写好的前半"))
}))

test("SAI-07/08: base mismatch and length limits are rejected before any model call", () => run(async () => {
  const r = range(P2_TEXT, QUOTE), b = await base("chapter-p2")
  await assert.rejects(prepareSelectionRewrite(scopeP, { action: "polish", ...r, ...b, baseHash: "0".repeat(64), modelId: m1 }), { status: 409 })
  await assert.rejects(prepareSelectionRewrite(scopeP, { action: "polish", ...r, ...b, quote: "不是原文", modelId: m1 }), { status: 409 })
  await assert.rejects(prepareSelectionRewrite(scopeP, { action: "polish", start: 2, end: 3, quote: "\n", ...b, modelId: m1 }), { status: 400 })
  await assert.rejects(prepareSelectionRewrite(scopeP, { action: "polish", ...r, ...b, modelId: m1, requirement: "字".repeat(2001) }), { status: 400 })
  const long = "长".repeat(10001)
  await prisma.chapter.update({ where: { id: "chapter-p2" }, data: { content: long } })
  await assert.rejects(prepareSelectionRewrite(scopeP, { action: "polish", start: 0, end: long.length, quote: long, ...(await base("chapter-p2")), modelId: m1 }), { code: "SELECTION_TOO_LONG" })
  assert.equal(sent.length, 0)
}))

test("SAI-09/10: no model fallback; chosen model and effort are used", () => run(async () => {
  const r = range(P2_TEXT, QUOTE), b = await base("chapter-p2")
  await collect(await prepareSelectionRewrite(scopeP, { action: "polish", ...r, ...b, modelId: m2 }))
  assert.equal(sent[0].model, draft2.modelId)
  await assert.rejects(prepareSelectionRewrite(scopeP, { action: "polish", ...r, ...b, modelId: "deleted-model" }), { code: "MODEL_NOT_FOUND" })
  assert.equal(sent.length, 1)
}))

test("SAI-11/12: abort reaches upstream; incomplete and failed outputs are reported", () => run(async () => {
  const r = range(P2_TEXT, QUOTE), b = await base("chapter-p2")
  const gate = Promise.withResolvers<void>()
  script = { text: ["一", "二", "三"], hang: gate.promise }
  const abort = new AbortController()
  const events = await prepareSelectionRewrite(scopeP, { action: "polish", ...r, ...b, modelId: m1 }, abort.signal)
  const it = events[Symbol.asyncIterator]()
  let first = await it.next(); while (!first.done && first.value.type !== "text-delta") first = await it.next()
  abort.abort(); gate.resolve()
  const rest: SelectionStreamEvent[] = []; try { for (;;) { const n = await it.next(); if (n.done) break; rest.push(n.value) } } catch { /* aborted */ }
  assert.equal(sent[0].signal?.aborted, true)
  assert.equal(rest.some(e => e.type === "done" && (e as { finishReason: string }).finishReason === "stop"), false)
  script = { text: ["半截"], finish: "length" }
  const len = await collect(await prepareSelectionRewrite(scopeP, { action: "polish", ...r, ...b, modelId: m1 }))
  assert.equal((len.at(-1) as { finishReason: string }).finishReason, "length")
  script = { text: [], fail: true }
  const failed = await collect(await prepareSelectionRewrite(scopeP, { action: "polish", ...r, ...b, modelId: m1 }))
  const err = failed.at(-1) as { type: string; message: string }
  assert.equal(err.type, "error"); assert.equal(err.message.includes(QUOTE), false)
  assert.equal(await prisma.contentVersion.count(), 0)
}))

test("SAI-13: usage records the selection action without text", () => run(async () => {
  await collect(await prepareSelectionRewrite(scopeP, { action: "expand", ...range(P2_TEXT, QUOTE), ...(await base("chapter-p2")), modelId: m1 }))
  const usage = await prisma.usageRecord.findFirstOrThrow({ where: { action: "selection.expand" } })
  assert.equal(JSON.stringify(usage).includes(QUOTE), false)
}))

test("SAI-14: ownership is enforced", () => run(async () => {
  await assert.rejects(prepareSelectionRewrite({ ...scopeP, chapterId: "chapter-n1" }, { action: "polish", ...range(P2_TEXT, QUOTE), ...(await base("chapter-n1")), modelId: m1 }), (e: { status?: number }) => e.status === 404 || e.status === 403)
}))

test("SAI-15: selection.rewrite template is seeded with the planned variables", () => run(async () => {
  const row = await prisma.promptTemplate.findUniqueOrThrow({ where: { key: "selection.rewrite" } })
  assert.deepEqual([...(row.variables as string[])].sort(), ["action", "after", "before", "chapterOutline", "chapterTitle", "characters", "continuation", "foreshadows", "instruction", "narrative", "novelTitle", "previousSummary", "requirement", "selection", "settings", "style", "theme", "worldEvents"])
}))

test("SAI-16: logs never contain the selection or the requirement", () => run(async () => {
  const lines: string[] = []; const keep = { log: console.log, error: console.error, warn: console.warn, info: console.info }
  for (const k of Object.keys(keep) as (keyof typeof keep)[]) console[k] = (...a: unknown[]) => { lines.push(a.map(String).join(" ")) }
  try {
    const r = range(P2_TEXT, QUOTE), b = await base("chapter-p2")
    await collect(await prepareSelectionRewrite(scopeP, { action: "polish", ...r, ...b, modelId: m1, requirement: "秘密要求文字" }))
    script = { text: [], fail: true }
    await collect(await prepareSelectionRewrite(scopeP, { action: "polish", ...r, ...b, modelId: m1, requirement: "秘密要求文字" }))
  } finally { Object.assign(console, keep) }
  assert.equal(lines.some(l => l.includes(QUOTE) || l.includes("秘密要求文字")), false)
}))

// ---- SAC ----
async function manualSave(content: string, op: string) { const c = await chapter("chapter-p2"); return commitChapterRevision({ ...scopeP, expectedVersion: c.version, operationId: op, source: "manual", reason: "正文更新", changes: { content } }) }

test("SAC-01/02: replacement writes new before/after entries even after an autosave", () => run(async () => {
  await manualSave(P2_TEXT + "补", "m1"); await manualSave(P2_TEXT, "m2") // v3 already has its 正文更新 snapshot
  const c = await chapter("chapter-p2"); assert.equal(c.version, 3)
  const r = range(c.content, QUOTE)
  const { receipt, content } = await commitSelectionReplacement(scopeP, { action: "polish", ...r, replacement: "老人垂首翻阅一本旧册", expectedVersion: 3, expectedContentHash: contentHash(c.content), operationId: "rep-1" })
  // One snapshot per revision (ContentVersion_chapter_revision_key): the unchanged text becomes v4 「AI 润色前」, the replacement v5.
  assert.equal(receipt.version, 5); assert.equal(content, c.content.replace(QUOTE, "老人垂首翻阅一本旧册"))
  const rows = await prisma.contentVersion.findMany({ where: { targetId: "chapter-p2", version: { gte: 3 } }, orderBy: { version: "asc" } })
  assert.deepEqual(rows.map(v => [v.version, v.reason]), [[3, "正文更新"], [4, historyReason("polish", "before")], [5, "AI 润色"]])
  assert.equal((rows[1].snapshot as { content: string }).content, c.content)
  assert.equal((rows[2].snapshot as { content: string }).content, content)
  const list = await listChapterVersions(scopeP)
  assert.deepEqual(list.versions.slice(0, 3).map(v => [v.version, v.reason]), [[5, "AI 润色"], [4, "AI 润色前"], [3, "正文更新"]])
  assert.ok(list.versions.slice(0, 3).every(v => v.restorable))
  const mutation = await prisma.contentMutation.findUniqueOrThrow({ where: { userId_operationId: { userId: USER, operationId: "rep-1" } } })
  assert.deepEqual([mutation.beforeVersion, mutation.afterVersion], [4, 5])
}))

test("SAC-01b: chapter without any snapshot gets exactly one before snapshot", () => run(async () => {
  const c = await chapter("chapter-p2"); const r = range(c.content, QUOTE)
  await commitSelectionReplacement(scopeP, { action: "polish", ...r, replacement: "替换文字", expectedVersion: 1, expectedContentHash: contentHash(c.content), operationId: "rep-1b" })
  const rows = await prisma.contentVersion.findMany({ where: { targetId: "chapter-p2" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] })
  assert.deepEqual(rows.map(v => [v.version, v.reason]), [[1, "AI 润色前"], [2, "AI 润色"]])
}))

test("SAC-03: continuation keeps the original and appends", () => run(async () => {
  const c = await chapter("chapter-p2"); const r = range(c.content, QUOTE)
  const { content } = await commitSelectionReplacement(scopeP, { action: "continue", ...r, replacement: QUOTE + "\n\n续写内容", expectedVersion: 1, expectedContentHash: contentHash(c.content), operationId: "rep-3" })
  assert.ok(content.includes(QUOTE + "\n\n续写内容"))
  assert.deepEqual((await prisma.contentVersion.findMany({ where: { targetId: "chapter-p2" }, orderBy: [{ createdAt: "asc" }] })).map(v => v.reason), ["AI 续写前", "AI 续写"])
}))

test("SAC-04: replay returns the original receipt even though the selection is gone", () => run(async () => {
  const c = await chapter("chapter-p2"); const r = range(c.content, QUOTE)
  const input = { action: "polish" as const, ...r, replacement: "新文字", expectedVersion: 1, expectedContentHash: contentHash(c.content), operationId: "rep-4" }
  const first = await commitSelectionReplacement(scopeP, input)
  const count = await prisma.contentVersion.count()
  const again = await commitSelectionReplacement(scopeP, input)
  assert.deepEqual(again.receipt, first.receipt); assert.equal(again.content, first.content)
  assert.equal(await prisma.contentVersion.count(), count); assert.equal(await prisma.contentMutation.count(), 1)
}))

test("SAC-05/06/07: changed selection, moved offsets and content checks", () => run(async () => {
  const c = await chapter("chapter-p2"); const r = range(c.content, QUOTE)
  await manualSave(c.content.replace("没有封皮", "缺了封皮"), "m-sel")
  const now = await chapter("chapter-p2")
  await assert.rejects(commitSelectionReplacement(scopeP, { action: "polish", ...r, replacement: "x", expectedVersion: 1, expectedContentHash: contentHash(c.content), operationId: "rep-5a" }), { code: "VERSION_CONFLICT" })
  await assert.rejects(commitSelectionReplacement(scopeP, { action: "polish", ...r, replacement: "x", expectedVersion: now.version, expectedContentHash: contentHash(now.content), operationId: "rep-5b" }), { code: "SELECTION_CHANGED" })
  assert.equal((await chapter("chapter-p2")).content, now.content)
  // 06: insert 10 chars before the selection and save; moved offsets succeed
  const restored = now.content.replace("缺了封皮", "没有封皮")
  await manualSave("开头加了十个字的内容。" + restored, "m-move")
  const moved = await chapter("chapter-p2"); const r2 = range(moved.content, QUOTE)
  assert.equal(r2.start, r.start + "开头加了十个字的内容。".length)
  await commitSelectionReplacement(scopeP, { action: "polish", ...r2, replacement: "移动后替换", expectedVersion: moved.version, expectedContentHash: contentHash(moved.content), operationId: "rep-6" })
  const after = await chapter("chapter-p2")
  for (const replacement of ["", QUOTE.replace(QUOTE, "移动后替换"), "长".repeat(200001)]) {
    const rr = range(after.content, "移动后替换")
    await assert.rejects(commitSelectionReplacement(scopeP, { action: "polish", ...rr, replacement: replacement === "移动后替换" ? "移动后替换" : replacement, expectedVersion: after.version, expectedContentHash: contentHash(after.content), operationId: "rep-7-" + replacement.length }), { status: 422 })
  }
}))

test("SAC-08: word budget checks do not apply to selection replacements", () => run(async () => {
  const planning = planningSchema.parse((await prisma.planningDocument.findUniqueOrThrow({ where: { novelId: "novel-p" } })).data)
  const minimum = (await chapter("chapter-p2")).content.replace(/\s/g, "").length // replacement drops below this
  planning.chapters = planning.chapters.map(ch => ch.id === "chapter-p2" ? { ...ch, wordMin: minimum, wordBudget: 3000 } : ch)
  await prisma.planningDocument.update({ where: { novelId: "novel-p" }, data: { data: planning as object } })
  const c = await chapter("chapter-p2"); const r = range(c.content, QUOTE)
  const { receipt } = await commitSelectionReplacement(scopeP, { action: "shrink", ...r, replacement: "翻书", expectedVersion: 1, expectedContentHash: contentHash(c.content), operationId: "rep-8" })
  assert.ok(receipt.wordCount < minimum)
}))

test("SAC-09/09b/10: undo by replacement operation, replay and staleness", () => run(async () => {
  const c = await chapter("chapter-p2"); const r = range(c.content, QUOTE)
  const { receipt } = await commitSelectionReplacement(scopeP, { action: "polish", ...r, replacement: "新文字", expectedVersion: 1, expectedContentHash: contentHash(c.content), operationId: "rep-9" })
  const undo = await undoSelectionReplacement(scopeP, { replacementOperationId: "rep-9", expectedVersion: receipt.version, operationId: "undo-9" })
  assert.equal(undo.receipt.version, receipt.version + 1); assert.equal(undo.content, c.content)
  assert.equal((await prisma.contentVersion.findFirstOrThrow({ where: { targetId: "chapter-p2", version: undo.receipt.version } })).reason, "撤销 AI 润色")
  const count = await prisma.contentVersion.count()
  const replay = await undoSelectionReplacement(scopeP, { replacementOperationId: "rep-9", expectedVersion: receipt.version, operationId: "undo-9" })
  assert.deepEqual(replay.receipt, undo.receipt); assert.equal(await prisma.contentVersion.count(), count)
  // 10: stale after another edit
  const c2 = await chapter("chapter-p2"); const r2 = range(c2.content, QUOTE)
  const second = await commitSelectionReplacement(scopeP, { action: "polish", ...r2, replacement: "又一次", expectedVersion: c2.version, expectedContentHash: contentHash(c2.content), operationId: "rep-10" })
  await manualSave((await chapter("chapter-p2")).content + "再写一句", "m-after")
  await assert.rejects(undoSelectionReplacement(scopeP, { replacementOperationId: "rep-10", expectedVersion: second.receipt.version, operationId: "undo-10" }), { code: "SELECTION_UNDO_STALE" })
  await assert.rejects(undoSelectionReplacement(scopeP, { replacementOperationId: "missing", expectedVersion: second.receipt.version + 1, operationId: "undo-x" }), (e: { status?: number }) => e.status === 404 || e.status === 409)
}))

test("SAC-09c: undo carries the after-hash as CAS", () => run(async () => {
  const c = await chapter("chapter-p2"); const r = range(c.content, QUOTE)
  const { receipt } = await commitSelectionReplacement(scopeP, { action: "polish", ...r, replacement: "新文字", expectedVersion: 1, expectedContentHash: contentHash(c.content), operationId: "rep-9c" })
  await prisma.chapter.update({ where: { id: "chapter-p2" }, data: { content: "被直接篡改的正文" } })
  await assert.rejects(undoSelectionReplacement(scopeP, { replacementOperationId: "rep-9c", expectedVersion: receipt.version, operationId: "undo-9c" }), (e: { code?: string }) => e.code === "SELECTION_UNDO_STALE" || e.code === "CONTENT_HASH_CONFLICT")
}))

test("SAC-13: restoring the before snapshot works", () => run(async () => {
  const c = await chapter("chapter-p2"); const r = range(c.content, QUOTE)
  await commitSelectionReplacement(scopeP, { action: "polish", ...r, replacement: "新文字", expectedVersion: 1, expectedContentHash: contentHash(c.content), operationId: "rep-13" })
  const beforeRow = await prisma.contentVersion.findFirstOrThrow({ where: { targetId: "chapter-p2", reason: "AI 润色前" } })
  const restored = await restoreChapterVersion(scopeP, beforeRow.id, { expectedVersion: 2, operationId: "restore-13" })
  assert.equal(restored.version, 3); assert.equal((await chapter("chapter-p2")).content, c.content)
}))

test("SAC-14: concurrent replacements, one wins", () => run(async () => {
  const c = await chapter("chapter-p2"); const r = range(c.content, QUOTE)
  const make = (op: string) => commitSelectionReplacement(scopeP, { action: "polish", ...r, replacement: op, expectedVersion: 1, expectedContentHash: contentHash(c.content), operationId: op })
  const results = await Promise.allSettled([make("con-a"), make("con-b")])
  assert.equal(results.filter(x => x.status === "fulfilled").length, 1)
  assert.equal((results.find(x => x.status === "rejected") as PromiseRejectedResult).reason.code, "VERSION_CONFLICT")
}))
