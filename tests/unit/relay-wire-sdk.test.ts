import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { test } from "node:test"
import type { LanguageModelV4 } from "@ai-sdk/provider"
import type { PublicModel } from "../../desktop/core/settings"
import { localModelRecord, snapshotForRecord } from "../../desktop/service/models"
import { instantiateModel } from "../../src/lib/ai/provider"

type Wire = "auto" | "chat" | "responses"
async function requestFor(change: Partial<PublicModel> & { wire?: Wire }) {
  const snapshot: PublicModel & { wire?: Wire } = { id: randomUUID(), name: "fixture", provider: "custom", protocol: "openai", modelId: "gpt-6.1-sol", endpoint: "https://fixture.invalid/", kind: "TEXT", contextWindow: 128000, enabled: true, authRevision: 1, keyMask: "fixture", thinkingLevels: [], defaultThinking: "default", ...change }
  const calls: { url: string; body: Record<string, unknown> }[] = []
  const record = localModelRecord(snapshot)
  const resolved = instantiateModel(record, { fetch: async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) })
    return new Response("data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } })
  } })
  const result = await (resolved.model as LanguageModelV4).doStream({ prompt: [{ role: "system", content: "fixture system" }, { role: "user", content: [{ type: "text", text: "fixture user" }] }], maxOutputTokens: 41, providerOptions: resolved.providerOptions })
  await result.stream.cancel().catch(() => undefined)
  assert.equal(calls.length, 1)
  assert.equal(snapshotForRecord(record).wire, change.wire)
  return calls[0]
}

test("WIRE-04: explicit custom Chat defeats both application and real SDK official-name inference", async () => {
  const request = await requestFor({ wire: "chat" })
  assert.equal(request.url, "https://fixture.invalid/v1/chat/completions")
  const messages = request.body.messages as { role: string }[]
  assert.equal(messages[0].role, "system")
  assert.equal(request.body.max_tokens, 41)
  for (const name of ["input", "max_output_tokens", "max_completion_tokens", "reasoning_effort", "reasoning", "access_programs"]) assert.equal(Object.hasOwn(request.body, name), false, name)
})

test("WIRE-05: explicit custom Responses uses only the selected interface and privacy options", async () => {
  const request = await requestFor({ wire: "responses", modelId: "gpt-5.6-cyber" })
  assert.equal(request.url, "https://fixture.invalid/v1/responses")
  assert.equal(request.body.store, false)
  assert.ok(Array.isArray(request.body.input))
  assert.equal(Object.hasOwn(request.body, "access_programs"), false)
  assert.equal(Object.hasOwn(request.body, "reasoning"), false)
})

test("WIRE-01/05: legacy auto and first-party routing remain unchanged", async () => {
  for (const wire of [undefined, "auto"] as const) assert.equal((await requestFor({ wire })).url, "https://fixture.invalid/v1/responses")
  assert.equal((await requestFor({ provider: "openai", endpoint: "https://fixture.invalid/v1", wire: "chat" })).url, "https://fixture.invalid/v1/responses")
  assert.equal((await requestFor({ modelId: "fixture-unknown" })).url, "https://fixture.invalid/v1/chat/completions")
})
