import assert from "node:assert/strict"
import { test } from "node:test"
import { createOpenAI } from "@ai-sdk/openai"
import { streamText } from "ai"
import type { LanguageModelV4, LanguageModelV4CallOptions, LanguageModelV4Content, LanguageModelV4FinishReason, LanguageModelV4StreamPart, LanguageModelV4Usage } from "@ai-sdk/provider"
import { validatedModel } from "../../src/lib/ai/validatedModel"
import { toolCompatibleModel } from "../../src/lib/ai/tool-compatible-model"
import { ContentError } from "../../src/lib/content-errors"
import { classifyError, classifyWireError } from "../../src/lib/ai/error-classification"

const usage: LanguageModelV4Usage = { inputTokens: { total: 2, noCache: 2, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } }
const options: LanguageModelV4CallOptions = { prompt: [{ role: "user", content: [{ type: "text", text: "fixture" }] }] }
const text: LanguageModelV4StreamPart[] = [{ type: "text-start", id: "fixture" }, { type: "text-delta", id: "fixture", delta: "已生成的部分正文" }, { type: "text-end", id: "fixture" }]
const finish = (unified: LanguageModelV4FinishReason["unified"] = "stop"): LanguageModelV4StreamPart => ({ type: "finish", finishReason: { unified, raw: unified }, usage })
const tool: LanguageModelV4StreamPart = { type: "tool-call", toolCallId: "fixture-tool", toolName: "fixtureTool", input: "{}" }

function fixture(parts: LanguageModelV4StreamPart[], generate?: { content: LanguageModelV4Content[]; reason?: LanguageModelV4FinishReason["unified"] }): LanguageModelV4 {
  return { specificationVersion: "v4", provider: "fixture", modelId: "fixture", supportedUrls: {},
    async doGenerate() { return { content: generate?.content ?? [], finishReason: { unified: generate?.reason ?? "stop", raw: undefined }, usage, warnings: [] } },
    async doStream() { return { stream: new ReadableStream({ start(controller) { for (const part of parts) controller.enqueue(part); controller.close() } }) } },
  }
}
async function consume(model: LanguageModelV4, params = options) {
  const result = await model.doStream(params), seen: LanguageModelV4StreamPart[] = []
  const reader = result.stream.getReader()
  try { for (;;) { const next = await reader.read(); if (next.done) return seen; seen.push(next.value) } }
  finally { reader.releaseLock() }
}
const codeIs = (code: string) => (error: unknown) => error instanceof ContentError && error.code === code && !error.message.includes("fixture-secret")

test("RELAY-07: real Responses SDK rejects empty SSE and DONE-only streams without synthetic success", async t => {
  for (const body of ["", "data: [DONE]\n\n"]) await t.test(body ? "DONE only" : "empty", async () => {
    let calls = 0, streamError: unknown, thrown: unknown
    const source = createOpenAI({ apiKey: "fixture-secret", baseURL: "https://fixture.invalid/v1", fetch: async () => { calls++; return new Response(body, { headers: { "content-type": "text/event-stream" } }) } }).responses("fixture")
    const result = streamText({ model: validatedModel(source), prompt: "fixture", maxRetries: 0, onError: ({ error }) => { streamError = error } })
    const events = []
    try { for await (const event of result.toUIMessageStream({ onError: () => "fixture error" })) events.push(event) } catch (error) { thrown = error }
    assert.ok((streamError ?? thrown) instanceof ContentError)
    assert.equal(events.some(event => event.type === "finish" && event.finishReason === "stop"), false)
    await assert.rejects(Promise.resolve(result.finishReason), codeIs("MODEL_OUTPUT_EMPTY"))
    assert.equal(calls, 1)
  })
})

test("RELAY-07: empty, whitespace-only and reasoning-only normal finishes fail closed", async () => {
  for (const parts of [[], [{ type: "text-start", id: "fixture" }, { type: "text-delta", id: "fixture", delta: " \n " }, { type: "text-end", id: "fixture" }], [{ type: "reasoning-start", id: "reason" }, { type: "reasoning-delta", id: "reason", delta: "fixture-secret" }, { type: "reasoning-end", id: "reason" }]] as LanguageModelV4StreamPart[][]) {
    await assert.rejects(consume(validatedModel(fixture([...parts, finish()]))), codeIs("MODEL_OUTPUT_EMPTY"))
  }
})

test("RELAY-08: partial text survives abnormal finish while original error remains authoritative", async () => {
  for (const reason of ["other", "length", "error", "content-filter"] as const) {
    const result = await validatedModel(fixture([...text, finish(reason)])).doStream(options)
    const reader = result.stream.getReader(), seen: LanguageModelV4StreamPart[] = []
    try {
      await assert.rejects(async () => { for (;;) { const next = await reader.read(); if (next.done) break; seen.push(next.value) } }, codeIs(reason === "content-filter" ? "CONTENT_FILTERED" : "MODEL_OUTPUT_INCOMPLETE"))
      assert.equal(seen.some(part => part.type === "text-delta" && part.delta === "已生成的部分正文"), true)
      assert.equal(seen.some(part => part.type === "finish"), false)
    } finally { reader.releaseLock() }
  }
  const original = new Error("original fixture failure")
  const seen = await consume(validatedModel(fixture([{ type: "error", error: original }, finish("error")])))
  assert.equal(seen.find(part => part.type === "error")?.error, original)
})

test("RELAY-09: normal text, pure tool and text-protocol tool calls remain valid", async () => {
  assert.deepEqual(await consume(validatedModel(fixture([...text, finish()]))), [...text, finish()])
  assert.deepEqual(await consume(validatedModel(fixture([tool, finish("tool-calls")]))), [tool, finish("tool-calls")])
  const encoded = [{ type: "text-start", id: "fixture" }, { type: "text-delta", id: "fixture", delta: '<novel_tool>{"name":"fixtureTool","input":{}}</novel_tool>' }, { type: "text-end", id: "fixture" }, finish()] as LanguageModelV4StreamPart[]
  const source = toolCompatibleModel(fixture(encoded), "validation-fixture", true)
  const seen = await consume(validatedModel(source), { ...options, tools: [{ type: "function", name: "fixtureTool", inputSchema: { type: "object", properties: {} } }] })
  assert.equal(seen.some(part => part.type === "tool-call" && part.toolName === "fixtureTool"), true)
  assert.equal(seen.at(-1)?.type, "finish")
})

test("RELAY-10: premature EOF fails, ordinary EOF passes and reader failures are preserved", async () => {
  await assert.rejects(consume(validatedModel(fixture(text))), codeIs("MODEL_OUTPUT_INCOMPLETE"))
  await assert.rejects(consume(validatedModel(fixture([]))), codeIs("MODEL_OUTPUT_INCOMPLETE"))
  assert.equal((await consume(validatedModel(fixture([...text, finish()])))).at(-1)?.type, "finish")
  const original = new Error("AUTHORIZATION_REVOKED")
  const source = fixture([])
  source.doStream = async () => ({ stream: new ReadableStream({ start(controller) { controller.error(original) } }) })
  await assert.rejects(consume(validatedModel(source)), error => error === original)
  const abort = new AbortController(), reason = new DOMException("fixture cancellation", "AbortError")
  abort.abort(reason)
  await assert.rejects(consume(validatedModel(fixture([])), { ...options, abortSignal: abort.signal }), error => error === reason)
  let canceled = false
  source.doStream = async () => ({ stream: new ReadableStream({ cancel() { canceled = true } }) })
  const pending = await validatedModel(source).doStream(options), reader = pending.stream.getReader()
  await reader.cancel()
  assert.equal(canceled, true)
  reader.releaseLock()
})

test("RELAY-06/07/08: nonstreaming generations share output validation and preserve valid JSON adapter results", async () => {
  const normal = [{ type: "text", text: "完整正文" }] as LanguageModelV4Content[]
  assert.deepEqual((await validatedModel(fixture([], { content: normal })).doGenerate(options)).content, normal)
  assert.deepEqual((await validatedModel(fixture([], { content: [tool as LanguageModelV4Content], reason: "tool-calls" })).doGenerate(options)).content, [tool])
  await assert.rejects(Promise.resolve(validatedModel(fixture([], { content: [] })).doGenerate(options)), codeIs("MODEL_OUTPUT_EMPTY"))
  await assert.rejects(Promise.resolve(validatedModel(fixture([], { content: normal, reason: "length" })).doGenerate(options)), codeIs("MODEL_OUTPUT_INCOMPLETE"))
})

test("RELAY-11: validation codes have fixed diagnostics without automatic retries or raw error leakage", () => {
  for (const code of ["MODEL_RESPONSE_INVALID", "MODEL_OUTPUT_EMPTY", "MODEL_OUTPUT_INCOMPLETE"]) {
    const classified = classifyError({ cause: { code, message: "fixture-secret https://fixture.invalid/private author body" } })
    assert.equal(classified.code, code)
    assert.equal(classified.retryScope, "none")
    assert.match(classified.message, /模型/)
    assert.doesNotMatch(classified.message, /fixture|https:|author body/)
    assert.equal(classifyWireError(code).message, classified.message)
  }
})
