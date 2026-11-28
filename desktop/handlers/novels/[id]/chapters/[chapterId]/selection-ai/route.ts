import { NextResponse } from "next/server"
import { z } from "zod"
import { toErrorResponse } from "@/lib/ai/errors"
import { prepareSelectionRewrite } from "@/lib/services/selection-ai"
import { SELECTION_AI_ACTIONS } from "@/lib/selection-ai"
import { firstIssueMessage, getOwnedNovel } from "../../../lib"

type RouteContext = { params: Promise<{ id: string; chapterId: string }> }
const actions = SELECTION_AI_ACTIONS.map(a => a.key) as [string, ...string[]]
const schema = z.object({
  action: z.enum(actions), start: z.number().int().nonnegative(), end: z.number().int().positive(), quote: z.string(),
  baseVersion: z.number().int().positive(), baseHash: z.string(), requirement: z.string().optional(),
  modelId: z.string().min(1).max(200), thinkingEffort: z.string().max(40).nullable().optional(), continuation: z.string().optional(),
})

/** docs/612 §4.2: streamed selection rewrite. Output is not persisted; disconnect aborts upstream. */
export async function POST(request: Request, ctx: RouteContext) {
  const { id, chapterId } = await ctx.params
  const owned = await getOwnedNovel(id)
  if ("error" in owned) return owned.error
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: firstIssueMessage(parsed.error, "参数不合法") }, { status: 400 })
  const abort = new AbortController()
  let events: AsyncIterable<unknown>
  try {
    events = await prepareSelectionRewrite({ userId: owned.session.user.id, novelId: id, chapterId }, parsed.data as Parameters<typeof prepareSelectionRewrite>[1], AbortSignal.any([request.signal, abort.signal]))
  } catch (error) { return toErrorResponse(error) }
  const encoder = new TextEncoder()
  let connected = true
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of events) {
          if (!connected) break
          const { type, ...data } = event as { type: string }
          try { controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type, data })}\n\n`)) } catch { connected = false }
        }
      } finally { if (connected) controller.close() }
    },
    cancel() { connected = false; abort.abort() },
  })
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" } })
}
