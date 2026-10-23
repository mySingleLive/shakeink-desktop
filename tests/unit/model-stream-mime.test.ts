import assert from "node:assert/strict"
import { test } from "node:test"
import { randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ModelRepository, type ModelDraft } from "../../desktop/main/model-repository"
import { ModelGateway } from "../../desktop/core/model-authorization"
import { ModelService } from "../../desktop/main/model-service"
import { bindModelFetch, configureModelTransport, localModelFetch } from "../../desktop/service/models"
import { ContentError } from "../../src/lib/content-errors"

const draft: ModelDraft = { name: "fixture", provider: "custom", protocol: "openai", modelId: "fixture", endpoint: "https://fixture.invalid/v1", kind: "TEXT", contextWindow: 128000, enabled: true, thinkingLevels: [], defaultThinking: "default", apiKey: "fixture-main-only-secret" }
const protection = { isEncryptionAvailable: () => true, encryptString: (value: string) => Buffer.from(value), decryptString: (value: Buffer) => value.toString() }

test("RELAY-05/06/11: only successful streaming text responses require SSE, and rejected transfers are released", async t => {
  const root = await mkdtemp(join(tmpdir(), "shakeink-stream-mime-"))
  let repository!: ModelRepository, response = () => Response.json({ ok: true }), canceled = 0, calls = 0
  const gateway = new ModelGateway({ keyFor: (id, revision) => repository.keyFor(id, revision), fetch: async () => { calls++; return response() } })
  repository = new ModelRepository(join(root, "state.json"), protection, gateway)
  const service = new ModelService(repository, gateway)
  try {
    const state = await repository.saveModel(0, draft), model = state.models[0]
    const request = (stream: boolean) => ({ id: randomUUID(), modelId: model.id, authRevision: model.authRevision, kind: model.kind, url: model.endpoint + "/chat/completions", method: "POST", headers: {}, body: JSON.stringify({ model: model.modelId, stream }) })
    for (const contentType of ["text/html", "application/json", "", "text/event-streaming"]) await t.test(contentType || "missing type", async () => {
      const input = request(true), before = calls, beforeCanceled = canceled
      response = () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("fixture-main-only-secret author body")) }, cancel() { canceled++ } }), { headers: contentType ? { "content-type": contentType } : {} })
      await assert.rejects(service.start(input), error => error instanceof Error && error.message === "MODEL_RESPONSE_INVALID")
      assert.equal(service.activeCount, 0)
      assert.equal(canceled, beforeCanceled + 1)
      assert.equal(calls, before + 1)
      await assert.rejects(service.read(input.id), /不可读取/)
    })
    for (const contentType of ["text/event-stream", "Text/Event-Stream; charset=utf-8"]) {
      response = () => new Response("data: [DONE]\n\n", { headers: { "content-type": contentType } })
      const input = request(true)
      assert.equal((await service.start(input)).status, 200)
      while (!(await service.read(input.id)).done) {}
    }
    response = () => Response.json({ choices: [{ message: { content: "完整正文" } }] })
    const input = request(false)
    assert.equal((await service.start(input)).status, 200)
    assert.match(new TextDecoder().decode((await service.read(input.id)).bytes), /完整正文/)
    assert.equal((await service.read(input.id)).done, true)
    response = () => new Response("fixture-main-only-secret", { status: 401, headers: { "content-type": "text/html" } })
    const rejected = request(true)
    assert.equal((await service.start(rejected)).status, 401)
    const errorBody = new TextDecoder().decode((await service.read(rejected.id)).bytes)
    assert.match(errorBody, /HTTP_401/)
    assert.doesNotMatch(errorBody, /fixture-main-only-secret/)
    await service.cancel(rejected.id)
    configureModelTransport(async (method, value) => {
      if (method === "model.start") return service.start(value) as never
      if (method === "model.read") return service.read(value) as never
      if (method === "model.cancel") return service.cancel(value) as never
      throw Error("unexpected fixture transport")
    })
    response = () => new Response("fixture-main-only-secret author body", { headers: { "content-type": "text/html" } })
    const workerFetch = bindModelFetch(model, localModelFetch)
    await assert.rejects(workerFetch(model.endpoint + "/chat/completions", { method: "POST", body: JSON.stringify({ model: model.modelId, stream: true }) }), error => error instanceof ContentError && error.code === "MODEL_RESPONSE_INVALID" && /模型接口/.test(error.message) && !error.message.includes(draft.apiKey))
    assert.equal(service.activeCount, 0)
  } finally { await service.close(); await rm(root, { recursive: true, force: true }) }
})
