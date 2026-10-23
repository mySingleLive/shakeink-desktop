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
import { prisma } from "../../src/lib/db"
import { PROMPT_TEMPLATES } from "../../prisma/seed-templates"
import { POST } from "../../desktop/handlers/chat/route"
import { classifyError } from "../../src/lib/ai/error-classification"

const draft: ModelDraft = { name: "auth fixture", provider: "custom", protocol: "openai", modelId: "fixture-text", endpoint: "https://relay-auth.invalid/v1", kind: "TEXT", contextWindow: 128000, enabled: true, thinkingLevels: [], defaultThinking: "default", apiKey: "fixture-auth-key-never-render" }

test("WIRE-07/08: real main gateway, worker transport, SDK and chat persist precise HTTP auth failures without retries or vendor leaks", async t => {
  const root = await mkdtemp(join(tmpdir(), "shakeink-relay-auth-"))
  const works = new Workspaces(join(root, "app"), join(process.cwd(), "prisma/migrations"))
  let repository!: ModelRepository, status = 401, calls = 0
  const gateway = new ModelGateway({ keyFor: (id, revision) => repository.keyFor(id, revision), fetch: async (_url, init) => {
    calls++
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer " + draft.apiKey)
    return Response.json({ error: { message: `fixture-vendor-private-body ${draft.apiKey} https://relay-auth.invalid/private`, code: "fixture-vendor-private-code" } }, { status })
  } })
  repository = new ModelRepository(join(root, "state.json"), { isEncryptionAvailable: () => true, encryptString: value => Buffer.from(value), decryptString: value => value.toString() }, gateway)
  const service = new ModelService(repository, gateway)
  configureModelTransport(async (method, value) => {
    if (method === "model.defaults") return service.defaults() as never
    if (method === "model.resolve") return service.resolve(value) as never
    if (method === "model.start") return service.start(value) as never
    if (method === "model.read") return service.read(value) as never
    if (method === "model.cancel") return service.cancel(value) as never
    throw Error("Unexpected auth fixture transport")
  })
  const originalFetch = globalThis.fetch
  globalThis.fetch = localModelFetch
  try {
    await works.initialize()
    const state = await repository.saveModel(0, draft)
    state.settings.agent.textModelId = state.models[0].id
    await repository.updateSettings(state.revision, state.settings)
    await works.runWithGlobal("inbox", async () => {
      for (const template of PROMPT_TEMPLATES) await prisma.promptTemplate.create({ data: { ...template, version: 1, enabled: true } })
      for (const [httpStatus, code] of [[401, "MODEL_AUTHENTICATION_FAILED"], [403, "MODEL_PERMISSION_DENIED"], [402, "QUOTA_EXHAUSTED"]] as const) {
        await t.test(`HTTP ${httpStatus} is a single failed attempt with a fixed author-facing error`, () => runWithNewTaskDefaults(async () => {
          status = httpStatus
          const before = calls
          const result = await POST(new Request("https://local.invalid/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ clientRequestId: randomUUID(), message: "fixture auth request", mode: "standard" }) }))
          const sse = await result.text(), conversationId = result.headers.get("x-conversation-id")
          assert.equal(result.status, 200)
          assert.ok(conversationId)
          assert.equal(calls, before + 1, "authentication and quota failures must not make automatic paid requests")
          const turn = await prisma.chatTurn.findFirstOrThrow({ where: { conversationId } })
          const attempt = await prisma.chatAttempt.findFirstOrThrow({ where: { turnId: turn.id } })
          assert.equal(turn.status, "failed")
          assert.equal(attempt.status, "failed")
          assert.equal(attempt.errorCode, code)
          assert.equal(attempt.retryUsed, 0)
          assert.equal(attempt.errorMessage, classifyError({ statusCode: httpStatus }).message)
          assert.match(sse, new RegExp(code))
          assert.doesNotMatch(sse + attempt.errorMessage, /fixture-auth-key|fixture-vendor|relay-auth\.invalid|\/private/)
          assert.equal(service.activeCount, 0)
        }))
      }
    })
  } finally {
    globalThis.fetch = originalFetch
    await service.close()
    await works.close()
    await rm(root, { recursive: true, force: true })
  }
})
