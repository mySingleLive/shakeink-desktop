/**
 * docs/612 §4.2–§4.3: manuscript selection AI — streamed rewrite (no persistence), replacement commit and undo.
 * Prompts and outputs are never logged.
 */
import { prisma } from "@/lib/db"
import { ContentError, requireVersion } from "@/lib/content-errors"
import { renderPrompt } from "@/lib/prompts/render"
import { streamGeneration } from "@/lib/ai/generate"
import { instantiateModel } from "@/lib/ai/provider"
import { localModelRecord, resolveLocalModel } from "@desktop/service/models"
import { buildChapterSections, buildNovelSections } from "@/lib/ai/context"
import { buildChapterMaterialContext } from "./story-materials"
import { chapterProjection, planningSchema } from "@/lib/planning/domain"
import { chapterMaterials } from "@/lib/story-materials"
import { countChineseWords } from "@/lib/text"
import { commitChapterRevision, commitChapterRevisionInTransaction, contentHash, getContentReceipt, lockContentOperation, ownedChapter, type ContentReceipt } from "./content-commit"
import { snapshotContent } from "./chapter-history"
import {
  actionInfo, clampSection, SELECTION_AI_ACTIONS, CONTEXT_LIMITS, historyReason, isSelectionAiAction, LOCAL_CONTEXT,
  REQUIREMENT_LIMIT, SELECTION_LIMIT, selectionStillMatches, type SelectionAiAction,
} from "@/lib/selection-ai"

export interface SelectionScope { userId: string; novelId: string; chapterId: string }
export interface SelectionRewriteInput {
  action: SelectionAiAction
  start: number; end: number; quote: string
  baseVersion: number; baseHash: string
  requirement?: string
  modelId: string
  thinkingEffort?: string | null
  continuation?: string
}
export type SelectionStreamEvent =
  | { type: "queued" }
  | { type: "reasoning-delta"; delta: string }
  | { type: "text-delta"; delta: string }
  | { type: "done"; finishReason: string }
  | { type: "error"; code: string; message: string }

const UNPLANNED = "（本章未纳入叙事线规划）"

function validate(input: SelectionRewriteInput) {
  if (!isSelectionAiAction(input.action)) throw new ContentError("INVALID_ACTION", "未知的 AI 修改功能", 400)
  requireVersion(input.baseVersion)
  if (typeof input.baseHash !== "string" || !/^[0-9a-f]{64}$/.test(input.baseHash)) throw new ContentError("INVALID_REQUEST", "缺少正文校验值", 400)
  if (typeof input.quote !== "string" || !input.quote.trim()) throw new ContentError("EMPTY_SELECTION", "请先选中要修改的文字", 400)
  if (countChineseWords(input.quote) > SELECTION_LIMIT) throw new ContentError("SELECTION_TOO_LONG", "选中文字超过 1 万字，请缩小范围", 422)
  if (input.requirement !== undefined && (typeof input.requirement !== "string" || Array.from(input.requirement).length > REQUIREMENT_LIMIT)) throw new ContentError("REQUIREMENT_TOO_LONG", "修改要求不能超过 2000 字", 400)
  if (input.continuation !== undefined && (typeof input.continuation !== "string" || input.continuation.length > 200000)) throw new ContentError("INVALID_REQUEST", "已生成内容过长", 400)
  if (typeof input.modelId !== "string" || !input.modelId) throw new ContentError("MODEL_NOT_SELECTED", "请先选择模型", 400)
}

/** Base text: the current chapter when it is still the base version, otherwise that version's earliest snapshot. */
async function baseText(scope: SelectionScope, version: number, hash: string) {
  const chapter = await ownedChapter(prisma, scope.userId, scope.novelId, scope.chapterId)
  if (chapter.version === version && contentHash(chapter.content) === hash) return { chapter, text: chapter.content }
  const row = await prisma.contentVersion.findFirst({ where: { targetType: "Chapter", targetId: scope.chapterId, version }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] })
  const text = row ? snapshotContent(row.snapshot) : null
  if (text === null || contentHash(text) !== hash) throw new ContentError("SELECTION_BASE_CHANGED", "正文已变化，请重新框选", 409)
  return { chapter, text }
}

function cutAtParagraph(text: string, side: "before" | "after") {
  if (text.length <= LOCAL_CONTEXT) return text
  if (side === "before") {
    const slice = text.slice(-LOCAL_CONTEXT), at = slice.indexOf("\n")
    return at >= 0 && at < slice.length - 1 ? slice.slice(at + 1) : slice
  }
  const slice = text.slice(0, LOCAL_CONTEXT), at = slice.lastIndexOf("\n")
  return at > 0 ? slice.slice(0, at) : slice
}

async function promptFor(scope: SelectionScope, input: SelectionRewriteInput, text: string, chapter: { title: string }) {
  const novel = await prisma.novel.findUniqueOrThrow({ where: { id: scope.novelId }, select: { title: true } })
  const planningRow = await prisma.planningDocument.findUnique({ where: { novelId: scope.novelId } })
  const planning = planningRow ? planningSchema.parse(planningRow.data) : null
  const planned = !!planning?.chapters.some(ch => ch.id === scope.chapterId)
  const requirement = input.requirement?.trim() ?? ""
  let settings: string, narrative = UNPLANNED, worldEvents = UNPLANNED, foreshadows: string, sections
  if (planned) {
    const material = await buildChapterMaterialContext(scope.novelId, scope.chapterId)
    sections = await buildNovelSections(scope.novelId, scope.chapterId, material, requirement)
    settings = [sections.settings, material.section].filter(Boolean).join("\n\n")
    narrative = chapterProjection(planning!, scope.chapterId).outline
    const events = chapterMaterials(planning!, scope.chapterId).events
    worldEvents = events.length ? events.map(e => `${e.title}${e.fact ? ` · ${e.fact}` : ""}`).join("\n") : "（本章未关联世界线事件）"
    foreshadows = material.foreshadows
  } else {
    sections = await buildNovelSections(scope.novelId, scope.chapterId, undefined, requirement)
    settings = sections.settings
    foreshadows = sections.foreshadows
  }
  const chapterSections = await buildChapterSections(scope.novelId, scope.chapterId)
  const info = actionInfo(input.action)
  return renderPrompt("selection.rewrite", {
    novelTitle: novel.title, chapterTitle: chapter.title, action: info.name,
    instruction: info.instruction + (input.action === "continue" ? "。只输出接在选区后的新文字，不重复选中的原文" : ""),
    requirement: requirement || "（无，按本次任务默认要求处理）",
    theme: clampSection(sections.theme, CONTEXT_LIMITS.other),
    style: clampSection(sections.style, CONTEXT_LIMITS.other),
    characters: clampSection(sections.characters, CONTEXT_LIMITS.characters),
    settings: clampSection(settings, CONTEXT_LIMITS.settings),
    narrative: clampSection(narrative, CONTEXT_LIMITS.narrative),
    worldEvents: clampSection(worldEvents, CONTEXT_LIMITS.other),
    chapterOutline: clampSection(chapterSections.chapterOutline, CONTEXT_LIMITS.other),
    previousSummary: clampSection(chapterSections.previousSummary, CONTEXT_LIMITS.other),
    foreshadows: clampSection(foreshadows, CONTEXT_LIMITS.other),
    before: cutAtParagraph(text.slice(0, input.start), "before") || "（无）",
    selection: input.quote,
    after: cutAtParagraph(text.slice(input.end), "after") || "（无）",
    continuation: input.continuation ?? "",
  })
}

/** Validates and prepares; returns the event stream. Errors before the stream starts are thrown (route maps them to JSON). */
export async function prepareSelectionRewrite(scope: SelectionScope, input: SelectionRewriteInput, signal?: AbortSignal): Promise<AsyncIterable<SelectionStreamEvent>> {
  validate(input)
  const { chapter, text } = await baseText(scope, input.baseVersion, input.baseHash)
  if (!selectionStillMatches(text, input.start, input.end, input.quote)) throw new ContentError("SELECTION_BASE_CHANGED", "正文已变化，请重新框选", 409)
  // intent "selection": a stale id fails instead of falling back to the default model (plan §4.2-4).
  const model = await resolveLocalModel(scope.userId, "text", input.modelId, "selection")
  const resolvedModel = instantiateModel(localModelRecord(model), { thinkingEffort: input.thinkingEffort ?? null })
  const prompt = await promptFor(scope, input, text, chapter)
  const usage = actionInfo(input.action).usage
  return (async function* () {
    yield { type: "queued" } as const
    let result
    try {
      result = await streamGeneration({ userId: scope.userId, novelId: scope.novelId, action: usage, prompt, resolvedModel, abortSignal: signal })
    } catch (error) { yield failure(error); return }
    try {
      for await (const part of result.fullStream) {
        if (part.type === "reasoning-delta" && part.text) yield { type: "reasoning-delta", delta: part.text }
        else if (part.type === "text-delta" && part.text) yield { type: "text-delta", delta: part.text }
        else if (part.type === "error") { yield failure(part.error); return }
        else if (part.type === "abort") return
      }
      yield { type: "done", finishReason: (await result.finishReason) ?? "unknown" }
    } catch (error) {
      if (signal?.aborted) return
      yield failure(error)
    }
  })()
}

function failure(error: unknown): SelectionStreamEvent {
  const code = error instanceof ContentError ? error.code : (error as { code?: string })?.code ?? "GENERATION_FAILED"
  const message = error instanceof ContentError ? error.message : "生成失败，请稍后重试"
  return { type: "error", code, message }
}

export interface SelectionCommitInput {
  action: SelectionAiAction
  start: number; end: number; quote: string
  replacement: string
  expectedVersion: number
  expectedContentHash: string
  operationId: string
}

export async function commitSelectionReplacement(scope: SelectionScope, input: SelectionCommitInput): Promise<{ receipt: ContentReceipt; content: string }> {
  if (!isSelectionAiAction(input.action)) throw new ContentError("INVALID_ACTION", "未知的 AI 修改功能", 400)
  requireVersion(input.expectedVersion)
  if (typeof input.replacement !== "string" || !input.replacement.trim()) throw new ContentError("EMPTY_RESULT", "生成结果为空，未替换", 422)
  if (input.replacement === input.quote) throw new ContentError("RESULT_UNCHANGED", "生成结果与原文相同，未替换", 422)
  if (input.replacement.length > 200000) throw new ContentError("CONTENT_TOO_LONG", "生成结果过长，未替换", 422)
  const receipt = await commitChapterRevision({
    ...scope, expectedVersion: input.expectedVersion, expectedContentHash: input.expectedContentHash, operationId: input.operationId,
    source: "ai-selection", reason: historyReason(input.action, "after"), beforeReason: historyReason(input.action, "before"),
    // The locked chapter text is replaced inside the transaction; the request identity is the selection, not the full text.
    changes: {},
    selection: { start: input.start, end: input.end, quote: input.quote, replacement: input.replacement },
  })
  const row = await prisma.contentVersion.findUniqueOrThrow({ where: { id: receipt.snapshotId } })
  return { receipt, content: snapshotContent(row.snapshot) ?? "" }
}

export interface SelectionUndoInput { replacementOperationId: string; expectedVersion: number; operationId: string }

export async function undoSelectionReplacement(scope: SelectionScope, input: SelectionUndoInput): Promise<{ receipt: ContentReceipt; content: string }> {
  requireVersion(input.expectedVersion)
  if (!input.operationId || input.operationId.length > 160) throw new ContentError("INVALID_OPERATION", "缺少有效操作编号", 400)
  return prisma.$transaction(async tx => {
    await ownedChapter(tx, scope.userId, scope.novelId, scope.chapterId)
    await lockContentOperation(tx, scope.userId, input.operationId)
    const prior = await tx.contentMutation.findUnique({ where: { userId_operationId: { userId: scope.userId, operationId: input.operationId } } })
    if (prior) {
      if (prior.targetId !== scope.chapterId) throw new ContentError("OPERATION_CONFLICT", "操作编号与当前目标不一致")
      const receipt = prior.result as unknown as ContentReceipt
      const row = await tx.contentVersion.findUniqueOrThrow({ where: { id: receipt.snapshotId } })
      return { receipt, content: snapshotContent(row.snapshot) ?? "" }
    }
    await tx.$queryRaw`SELECT id FROM "Chapter" WHERE id = ${scope.chapterId} FOR UPDATE`
    const mutation = await tx.contentMutation.findUnique({ where: { userId_operationId: { userId: scope.userId, operationId: input.replacementOperationId } } })
    if (!mutation || mutation.novelId !== scope.novelId || mutation.targetId !== scope.chapterId || mutation.beforeVersion === null || mutation.afterVersion === null) throw new ContentError("SELECTION_UNDO_UNAVAILABLE", "找不到这次 AI 修改，无法撤销", 404)
    const current = await ownedChapter(tx, scope.userId, scope.novelId, scope.chapterId)
    if (mutation.afterVersion !== input.expectedVersion || current.version !== input.expectedVersion || contentHash(current.content) !== mutation.afterHash) throw new ContentError("SELECTION_UNDO_STALE", "替换后正文已有新修改，请在版本历史中恢复", 409)
    const after = await tx.contentVersion.findFirst({ where: { targetType: "Chapter", targetId: scope.chapterId, version: mutation.afterVersion }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] })
    const info = SELECTION_AI_ACTIONS.find(a => after?.reason === historyReason(a.key, "after"))
    if (!info) throw new ContentError("SELECTION_UNDO_UNAVAILABLE", "这次修改不是 AI 选区修改，无法撤销", 409)
    const before = await tx.contentVersion.findFirst({ where: { targetType: "Chapter", targetId: scope.chapterId, version: mutation.beforeVersion, reason: historyReason(info.key, "before") }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] })
    const content = before ? snapshotContent(before.snapshot) : null
    if (content === null) throw new ContentError("BASELINE_UNAVAILABLE", "替换前稿件历史无法核验，未撤销", 409)
    const receipt = await commitChapterRevisionInTransaction(tx, { ...scope, expectedVersion: input.expectedVersion, expectedContentHash: mutation.afterHash, operationId: input.operationId, source: "restore", reason: historyReason(info.key, "undo"), changes: { content } })
    return { receipt, content }
  }, { timeout: 15000 })
}

export { getContentReceipt }
