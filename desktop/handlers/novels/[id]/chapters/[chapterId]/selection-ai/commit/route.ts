import { z } from "zod"
import { commitSelectionReplacement } from "@/lib/services/selection-ai"
import { SELECTION_AI_ACTIONS } from "@/lib/selection-ai"
import { ContentError } from "@/lib/content-errors"
import { chapterRoute, mutationInput, type ChapterRouteContext } from "../../history-api"

const actions = SELECTION_AI_ACTIONS.map(a => a.key) as [string, ...string[]]
const schema = z.object({ action: z.enum(actions), start: z.number().int().nonnegative(), end: z.number().int().positive(), quote: z.string(), replacement: z.string(), expectedContentHash: z.string().regex(/^[0-9a-f]{64}$/) })

/** docs/612 §4.3: replace the selection; writes 「AI X前」 and 「AI X」 history entries. */
export async function POST(request: Request, ctx: ChapterRouteContext) {
  return chapterRoute(ctx, async scope => {
    const body = await request.json().catch(() => null)
    const mutation = mutationInput(body)
    const parsed = schema.safeParse(body)
    if (!parsed.success) throw new ContentError("INVALID_REQUEST", "参数不合法", 400)
    return commitSelectionReplacement(scope, { ...(parsed.data as Omit<Parameters<typeof commitSelectionReplacement>[1], "expectedVersion" | "operationId">), ...mutation })
  })
}
