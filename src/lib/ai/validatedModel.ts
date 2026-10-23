import { wrapLanguageModel, type LanguageModel } from "ai"
import type { LanguageModelV4FinishReason, LanguageModelV4StreamPart } from "@ai-sdk/provider"
import { ContentError } from "@/lib/content-errors"
import { MODEL_RESPONSE_MESSAGES } from "./error-classification"

function incompleteOutput() { return new ContentError("MODEL_OUTPUT_INCOMPLETE", MODEL_RESPONSE_MESSAGES.MODEL_OUTPUT_INCOMPLETE, 502) }
function assertOutput(reason: LanguageModelV4FinishReason, text: boolean, tool: boolean) {
  if (reason.unified === "content-filter") throw new ContentError("CONTENT_FILTERED", "内容未通过审核，请调整相关设定或表述后重试", 502)
  if (!text && !tool && ["stop", "tool-calls", "other"].includes(reason.unified)) throw new ContentError("MODEL_OUTPUT_EMPTY", MODEL_RESPONSE_MESSAGES.MODEL_OUTPUT_EMPTY, 502)
  if (!["stop", "tool-calls"].includes(reason.unified) || reason.unified === "tool-calls" && !tool) throw incompleteOutput()
}

/** Apply after event-producing adapters (including the text-tool decoder), so
 * empty/unfinished provider responses cannot become successful SDK results.
 * Text is forwarded immediately; failures retain already visible partial text. */
export function validatedModel(model: Exclude<LanguageModel, string>) {
  return wrapLanguageModel({ model, middleware: {
    specificationVersion: "v4",
    wrapGenerate: async ({ doGenerate, params }) => {
      params.abortSignal?.throwIfAborted()
      const result = await doGenerate()
      params.abortSignal?.throwIfAborted()
      assertOutput(result.finishReason, result.content.some(part => part.type === "text" && !!part.text.trim()), result.content.some(part => part.type === "tool-call"))
      return result
    },
    wrapStream: async ({ doStream, params }) => {
      params.abortSignal?.throwIfAborted()
      const result = await doStream()
      try { params.abortSignal?.throwIfAborted() } catch (error) { await result.stream.cancel(error).catch(() => undefined); throw error }
      let text = false, tool = false, finished = false, failed = false
      return { ...result, stream: result.stream.pipeThrough(new TransformStream<LanguageModelV4StreamPart, LanguageModelV4StreamPart>({
        transform(part, controller) {
          params.abortSignal?.throwIfAborted()
          // An upstream failure is more useful than a secondary missing-output
          // error. Keep it intact for cancellation, authorization and API errors.
          if (part.type === "error") failed = true
          if (!failed) {
            if (finished) throw incompleteOutput()
            if (part.type === "text-delta" && part.delta.trim()) text = true
            if (part.type === "tool-call") tool = true
            if (part.type === "finish") { assertOutput(part.finishReason, text, tool); finished = true }
          }
          controller.enqueue(part)
        },
        flush() {
          params.abortSignal?.throwIfAborted()
          if (!failed && !finished) throw incompleteOutput()
        },
      })) }
    },
  } })
}
