import assert from "node:assert/strict"
import { test } from "node:test"
import { randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Workspaces } from "../../desktop/service/workspaces"
import { configureModelTransport, localModelFetch } from "../../desktop/service/models"
import { runWithNewTaskDefaults } from "../../desktop/service/task-defaults"
import { ModelService } from "../../desktop/main/model-service"
import { ModelRepository, type ModelDraft } from "../../desktop/main/model-repository"
import { ModelGateway } from "../../desktop/core/model-authorization"
import { generateText } from "../../src/lib/ai/generate"
import { getModelByIdForUser } from "../../src/lib/ai/provider"
import { manageConversationContext } from "../../src/lib/ai/context-compression"
import type { Message } from "../../src/generated/prisma/client"
import { prisma } from "../../src/lib/db"
import { PROMPT_TEMPLATES } from "../../prisma/seed-templates"
import { POST } from "../../desktop/handlers/chat/route"

type Reply = "text" | "html" | "empty" | "incomplete"
const draft: ModelDraft = { name: "relay fixture", provider: "custom", protocol: "openai", modelId: "fixture-text", endpoint: "https://relay.invalid/", kind: "TEXT", contextWindow: 128000, enabled: true, thinkingLevels: [], defaultThinking: "default", apiKey: "fixture-main-only-key" }
function response(reply: Reply) {
  if (reply === "html") return new Response("<html>fixture-private-vendor-body</html>", { headers: { "content-type": "text/html" } })
  if (reply === "empty") return new Response("data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } })
  const chunks = [
    { id: "fixture", created: 1, model: draft.modelId, choices: [{ index: 0, delta: { role: "assistant", content: "有效回复" }, finish_reason: null }] },
    { id: "fixture", created: 1, model: draft.modelId, choices: [{ index: 0, delta: {}, finish_reason: reply === "incomplete" ? "length" : "stop" }], usage: { prompt_tokens: 8, completion_tokens: 3, total_tokens: 11 } },
  ]
  return new Response(chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } })
}

test("RELAY-01/04/05/07/10: real SDK, main gateway and retained generation/chat/summary entry points reject false success", async t => {
  const root = await mkdtemp(join(tmpdir(), "shakeink-relay-sdk-"))
  const works = new Workspaces(join(root, "app"), join(process.cwd(), "prisma/migrations"))
  const urls: string[] = []
  let reply: Reply = "text", repo!: ModelRepository
  const gateway = new ModelGateway({ keyFor: (id, revision) => repo.keyFor(id, revision), fetch: async (url, init) => {
    urls.push(String(url))
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer " + draft.apiKey)
    return response(reply)
  } })
  repo = new ModelRepository(join(root, "state.json"), { isEncryptionAvailable: () => true, encryptString: value => Buffer.from(value), decryptString: value => value.toString() }, gateway)
  const service = new ModelService(repo, gateway)
  configureModelTransport(async (method, value) => {
    if (method === "model.defaults") return service.defaults() as never
    if (method === "model.resolve") return service.resolve(value) as never
    if (method === "model.start") return service.start(value) as never
    if (method === "model.read") return service.read(value) as never
    if (method === "model.cancel") return service.cancel(value) as never
    throw new Error("Unexpected model transport")
  })
  const originalFetch = globalThis.fetch
  globalThis.fetch = localModelFetch
  try {
    await works.initialize()
    let state = await repo.saveModel(0, draft)
    const id = state.models[0].id
    state.settings.agent.textModelId = id
    await repo.updateSettings(state.revision, state.settings)
    await works.runWithGlobal("inbox", async () => {
      for (const template of PROMPT_TEMPLATES) await prisma.promptTemplate.create({ data: { ...template, version: 1, enabled: true } })
      await t.test("root endpoint generation uses /v1 exactly once without changing the stored authorization scope", async () => {
        const before = urls.length
        const result = await generateText({ userId: "local-author", prompt: "fixture", action: "fixture.relay" })
        assert.equal(result.text, "有效回复")
        assert.deepEqual(urls.slice(before), ["https://relay.invalid/v1/chat/completions"])
        const saved = (await repo.read()).models[0]
        assert.equal(saved.endpoint, draft.endpoint)
        assert.equal(saved.authRevision, 1)
      })
      for (const [variant, code] of [["html", "MODEL_RESPONSE_INVALID"], ["empty", "MODEL_OUTPUT_EMPTY"], ["incomplete", "MODEL_OUTPUT_INCOMPLETE"]] as const) {
        await t.test(`${variant}: one generation request fails with a fixed diagnostic`, async () => {
          reply = variant
          const before = urls.length
          await assert.rejects(generateText({ userId: "local-author", prompt: "fixture", action: "fixture.relay" }), (error: unknown) => {
            assert.equal((error as { code?: string }).code, code)
            assert.doesNotMatch(String(error), /fixture-private-vendor-body|fixture-main-only-key|relay\.invalid/)
            return true
          })
          assert.equal(urls.length, before + 1, "invalid output must not cause paid automatic retries")
        })
        await t.test(`${variant}: chat persists failed state, preserves partial text and emits the diagnostic`, () => runWithNewTaskDefaults(async () => {
          reply = variant
          const before = urls.length
          const result = await POST(new Request("https://local.invalid/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ clientRequestId: randomUUID(), message: "fixture", mode: "standard" }) }))
          const sse = await result.text()
          assert.equal(result.status, 200)
          const conversationId = result.headers.get("x-conversation-id")
          assert.ok(conversationId)
          const attempt = await prisma.chatAttempt.findFirstOrThrow({ where: { turn: { conversationId } } })
          assert.equal(attempt.status, "failed")
          assert.equal(attempt.errorCode, code)
          assert.match(sse, new RegExp(code))
          assert.doesNotMatch(sse, /fixture-private-vendor-body|fixture-main-only-key|relay\.invalid/)
          assert.equal(urls.length, before + 1)
          if (variant === "incomplete") {
            const message = await prisma.message.findUniqueOrThrow({ where: { id: attempt.assistantMessageId } })
            assert.equal(message.content, "有效回复", "partial output is recoverable even though completion failed")
          }
        }))
      }
      await t.test("summary shares output validation and never persists incomplete nonempty summaries", async () => {
        const resolved = await getModelByIdForUser("local-author", id)
        const conversation = await prisma.conversation.create({ data: { userId: "local-author", title: "summary fixture", modelId: id } })
        const history = Array.from({ length: 16 }, (_, index) => ({ id: `fixture-message-${index}`, role: index % 2 ? "ASSISTANT" : "USER", content: "甲".repeat(1000), toolCalls: null })) as Message[]
        let persisted = 0
        const input = { conversation, history, system: "fixture", renderSystem: async (summary: string) => summary, model: resolved.model, modelRecord: resolved.modelRecord, costBudgetTokens: 4000, protectedContext: [], persist: async () => { persisted++ } }
        reply = "incomplete"
        const failed = await manageConversationContext(input)
        assert.equal(failed.compressed, false)
        assert.equal(persisted, 0)
        assert.deepEqual(failed.messages, history)
        reply = "text"
        const valid = await manageConversationContext(input)
        assert.equal(valid.compressed, true)
        assert.equal(persisted, 1)
      })
      await t.test("WIRE-04/06: saved explicit Chat reaches the SDK through the original main authorization", async () => {
        const beforeState = await repo.read()
        await repo.saveModel(beforeState.revision, { ...draft, id, apiKey: "", modelId: "gpt-6.1-sol", wire: "chat" })
        reply = "text"
        const before = urls.length
        const generated = await generateText({ userId: "local-author", prompt: "fixture", action: "fixture.relay.chat" })
        assert.equal(generated.text, "有效回复")
        assert.deepEqual(urls.slice(before), ["https://relay.invalid/v1/chat/completions"])
        const saved = (await repo.read()).models[0]
        assert.equal(saved.wire, "chat")
        assert.equal(saved.authRevision, 2)
        assert.equal(saved.endpoint, draft.endpoint)
        const usage = await prisma.usageRecord.findFirstOrThrow({ where: { action: "fixture.relay.chat" } })
        assert.equal((usage.modelSnapshot as { wire?: string }).wire, "chat")
        assert.equal(JSON.stringify(usage.modelSnapshot).includes(draft.apiKey), false)
      })
    })
  } finally {
    globalThis.fetch = originalFetch
    await service.close()
    await works.close()
    await rm(root, { recursive: true, force: true })
  }
})
