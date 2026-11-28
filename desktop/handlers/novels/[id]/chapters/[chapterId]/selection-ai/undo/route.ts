import { z } from "zod"
import { undoSelectionReplacement } from "@/lib/services/selection-ai"
import { ContentError } from "@/lib/content-errors"
import { chapterRoute, mutationInput, type ChapterRouteContext } from "../../history-api"

const schema = z.object({ replacementOperationId: z.string().min(1).max(160) })

/** docs/612 §4.3: undo a selection replacement as a new revision (撤销 AI X). */
export async function POST(request: Request, ctx: ChapterRouteContext) {
  return chapterRoute(ctx, async scope => {
    const body = await request.json().catch(() => null)
    const mutation = mutationInput(body)
    const parsed = schema.safeParse(body)
    if (!parsed.success) throw new ContentError("INVALID_REQUEST", "参数不合法", 400)
    return undoSelectionReplacement(scope, { ...parsed.data, ...mutation })
  })
}
