import assert from "node:assert/strict"
import { test } from "node:test"
import { mkdtemp, rm, readFile, writeFile, readdir, lstat } from "node:fs/promises"
import { readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ModelRepository, type ModelDraft } from "../../desktop/main/model-repository"
import { ModelGateway } from "../../desktop/core/model-authorization"

const draft: ModelDraft = { name: "夹具模型", provider: "custom", protocol: "openai", modelId: "fixture", endpoint: "https://model.test/v1", kind: "TEXT", contextWindow: 128000, enabled: true, thinkingLevels: ["default"], defaultThinking: "default", apiKey: "public-fixture-only-key" }
async function fixture(run: (path: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "xuanxiang-vault-")); try { await run(join(root, "state.json")) } finally { await rm(root, { recursive: true, force: true }) }
}
const protection = { isEncryptionAvailable: () => true, encryptString: (key: string) => Buffer.from("OS-CIPHER:" + [...key].reverse().join("")), decryptString: (value: Buffer) => value.toString().slice(10).split("").reverse().join("") }

test("WIRE-01/03: API choices persist without migrating legacy state and undefined/auto preserve authorization", () => fixture(async path => {
  const repo = new ModelRepository(path, protection, { replace() {}, remove() {} })
  const legacy = await repo.saveModel(0, draft); const id = legacy.models[0].id
  assert.equal((legacy.models[0] as {wire?:string}).wire, undefined)
  const auto = await repo.saveModel(legacy.revision, { ...draft, id, apiKey: "", wire: "auto" })
  assert.equal(auto.models[0].authRevision, legacy.models[0].authRevision)
  const implicit = await repo.saveModel(auto.revision, { ...draft, id, apiKey: "" })
  assert.equal(implicit.models[0].authRevision, legacy.models[0].authRevision)
  const explicit = await repo.saveModel(implicit.revision, { ...draft, id, apiKey: "", wire: "chat" })
  assert.equal(explicit.models[0].authRevision, legacy.models[0].authRevision + 1)
  assert.equal(await repo.keyFor(id, explicit.models[0].authRevision), draft.apiKey)
  const reopened = await new ModelRepository(path, protection, { replace() {}, remove() {} }).initialize()
  assert.equal((reopened.models[0] as {wire?:string}).wire, "chat")
  const unchanged = await repo.saveModel(explicit.revision, { ...draft, id, apiKey: "", wire: "chat" })
  assert.equal(unchanged.models[0].authRevision, explicit.models[0].authRevision)
  const responses = await repo.saveModel(unchanged.revision, { ...draft, id, apiKey: "", wire: "responses" })
  assert.equal(responses.models[0].authRevision, explicit.models[0].authRevision + 1)
  assert.equal(responses.models[0].wire, "responses")
  await assert.rejects(repo.saveModel(responses.revision, { ...draft, id, wire: "invalid" } as never))
}))

test("WIRE-03: changing only an API choice keeps credentials and defaults but revokes idle, queued and reading leases", () => fixture(async path => {
  let repo!: ModelRepository; let holdKey = false; let sent = 0
  let releaseKey!: (value: string) => void; let enteredKey!: () => void
  const pendingKey = new Promise<string>(resolve => { releaseKey = resolve })
  const keyRead = new Promise<void>(resolve => { enteredKey = resolve })
  const gateway = new ModelGateway({
    keyFor: async (id, revision) => { if (holdKey) { enteredKey(); return pendingKey }; return repo.keyFor(id, revision) },
    fetch: async () => { sent++; return new Response(new ReadableStream<Uint8Array>({ start() {} })) },
  })
  repo = new ModelRepository(path, protection, gateway)
  let saved = await repo.saveModel(0, draft); const model = saved.models[0]
  saved.settings.agent.textModelId = model.id; saved.settings.agent.reviewModelId = model.id
  saved = await repo.updateSettings(saved.revision, saved.settings)
  const before = JSON.parse(await readFile(path, "utf8"))
  const idle = gateway.begin(model.id, "TEXT")
  const reading = gateway.begin(model.id, "TEXT")
  const response = await gateway.fetch(reading, draft.endpoint + "/chat/completions")
  const reader = response.body!.getReader(); const pendingRead = reader.read(); const rejectedRead = assert.rejects(pendingRead, /AUTHORIZATION_REVOKED/)
  const queued = gateway.begin(model.id, "TEXT"); holdKey = true
  const pendingRequest = gateway.fetch(queued, draft.endpoint + "/chat/completions"); const rejectedRequest = assert.rejects(pendingRequest, /AUTHORIZATION_REVOKED/)
  await keyRead
  const next = await repo.saveModel(saved.revision, { ...draft, id: model.id, apiKey: "", wire: "chat" })
  releaseKey(draft.apiKey)
  await rejectedRead; await rejectedRequest; reader.releaseLock()
  assert.equal(idle.signal.aborted, true); assert.equal(reading.signal.aborted, true); assert.equal(queued.signal.aborted, true)
  assert.equal(sent, 1)
  assert.equal(next.models[0].authRevision, model.authRevision + 1)
  assert.deepEqual(next.settings.agent, saved.settings.agent)
  const after = JSON.parse(await readFile(path, "utf8"))
  assert.equal(after.value.models[0].encryptedKey, before.value.models[0].encryptedKey)
}))

test("model configuration preserves unknown context size instead of inventing a provider capacity", () => fixture(async path => {
  const repo = new ModelRepository(path, protection, { replace() {}, remove() {} })
  const saved = await repo.saveModel(0, { ...draft, contextWindow: 0 })
  assert.equal(saved.models[0].contextWindow, 0)
  await assert.rejects(repo.saveModel(saved.revision, { ...draft, id:saved.models[0].id, contextWindow: 999 }))
}))

test("startup initialize quarantines a corrupt state file and opens default settings; valid state is never quarantined", () => fixture(async path => {
  await writeFile(path, "{broken state")
  const repaired = new ModelRepository(path, protection, { replace() {}, remove() {} })
  const opened = await repaired.initialize()
  assert.equal(opened.revision, 0)
  assert.equal(opened.models.length, 0)
  await assert.rejects(lstat(path), { code: "ENOENT" })
  const quarantined = (await readdir(join(path, ".."))).filter(name => /^state\.corrupt-.+\.json$/.test(name))
  assert.equal(quarantined.length, 1)
  assert.equal(await readFile(join(path, "..", quarantined[0]), "utf8"), "{broken state")
  await rm(join(path, "..", quarantined[0]))
  const saved = await repaired.saveModel(0, draft)
  const before = await readFile(path, "utf8")
  const reopened = await new ModelRepository(path, protection, { replace() {}, remove() {} }).initialize()
  assert.equal(reopened.revision, saved.revision)
  assert.equal(reopened.models[0].name, draft.name)
  assert.equal(await readFile(path, "utf8"), before)
  assert.deepEqual((await readdir(join(path, ".."))).filter(name => name.includes("corrupt")), [])
}))

test("default model disable retains its ID but resets thinking to model default even when high remains supported", () => fixture(async path => {
  const repo = new ModelRepository(path, protection, { replace() {}, remove() {} })
  let saved = await repo.saveModel(0, { ...draft, thinkingLevels: ["low", "high"], defaultThinking: "low" })
  const id = saved.models[0].id
  saved.settings.agent.textModelId = id
  saved.settings.agent.thinking = "high"
  saved = await repo.updateSettings(saved.revision, saved.settings)
  const disabled = await repo.saveModel(saved.revision, { ...draft, id, enabled: false, apiKey: "", thinkingLevels: ["low", "high"], defaultThinking: "low" })
  assert.equal(disabled.settings.agent.textModelId, id)
  assert.equal(disabled.models[0].enabled, false)
  assert.equal(disabled.settings.agent.thinking, "default")
}))

test("explicit re-enable of a legacy disabled default resets thinking while retaining model ID and credential", () => fixture(async path => {
  const repo = new ModelRepository(path, protection, { replace() {}, remove() {} })
  let saved = await repo.saveModel(0, { ...draft, thinkingLevels: ["low", "high"], defaultThinking: "low" })
  const id = saved.models[0].id
  saved.settings.agent.textModelId = id
  saved.settings.agent.thinking = "high"
  saved = await repo.updateSettings(saved.revision, saved.settings)
  // An isolated persisted fixture represents state written by the older disable behavior.
  const legacy = JSON.parse(await readFile(path, "utf8"))
  legacy.value.models[0].enabled = false
  legacy.value.models[0].authRevision += 1
  legacy.value.settings.agent.thinking = "high"
  await writeFile(path, JSON.stringify(legacy))
  const enabled = await repo.saveModel(saved.revision, { ...draft, id, enabled: true, apiKey: "", thinkingLevels: ["low", "high"], defaultThinking: "low" })
  assert.equal(enabled.settings.agent.textModelId, id)
  assert.equal(enabled.models[0].enabled, true)
  assert.equal(enabled.settings.agent.thinking, "default")
  assert.equal(await repo.keyFor(id, enabled.models[0].authRevision), draft.apiKey)
}))

test("DESK-M12: model keys require OS protection and public state never exposes secret fields", () => fixture(async path => {
  const repo = new ModelRepository(path, protection, { replace() {}, remove() {} })
  const result = await repo.saveModel(0, draft)
  const disk = JSON.parse(await readFile(path, "utf8"))
  assert.equal(protection.decryptString(Buffer.from(disk.value.models[0].encryptedKey, "base64")), draft.apiKey)
  assert.equal(JSON.stringify(result).includes(draft.apiKey), false)
  assert.equal("encryptedKey" in result.models[0], false)
  assert.equal(JSON.stringify(disk).includes(draft.apiKey), false)
  const unavailable = new ModelRepository(path, { ...protection, isEncryptionAvailable: () => false }, { replace() {}, remove() {} })
  await assert.rejects(unavailable.saveModel(result.revision, { ...draft, id: result.models[0].id, apiKey: "new-fixture" }), /保护|加密/)
}))

test("K09: revealKey returns the saved credential for editing, including disabled models, and rejects unknown IDs or missing OS protection", () => fixture(async path => {
  const repo = new ModelRepository(path, protection, { replace() {}, remove() {} })
  const saved = await repo.saveModel(0, draft)
  const id = saved.models[0].id
  assert.equal(await repo.revealKey(id), draft.apiKey)
  const disabled = await repo.saveModel(saved.revision, { ...draft, id, enabled: false, apiKey: "" })
  assert.equal(disabled.models[0].enabled, false)
  assert.equal(await repo.revealKey(id), draft.apiKey, "Editing a disabled model still shows its own Key")
  await assert.rejects(repo.revealKey("00000000-0000-4000-8000-000000000099"), /不存在/)
  const unavailable = new ModelRepository(path, { ...protection, isEncryptionAvailable: () => false }, { replace() {}, remove() {} })
  await assert.rejects(unavailable.revealKey(id), /保护|加密/)
  const broken = new ModelRepository(path, { ...protection, decryptString: () => { throw new Error("os fixture") } }, { replace() {}, remove() {} })
  await assert.rejects(broken.revealKey(id), /解密失败/)
}))

test("DESK-M13: persist before publishing authorization; rejected/failed drafts preserve existing credential and version", () => fixture(async path => {
  let fail = false; const events: Array<{ revision: number; diskRevision: number }> = []
  const gateway = { replace(model: { authRevision: number }) { events.push({ revision: model.authRevision, diskRevision: JSON.parse(readFileSync(path, "utf8")).value.models[0].authRevision }) }, remove() {} }
  const repo = new ModelRepository(path, protection, gateway, { beforeRename: async () => { if (fail) throw new Error("disk fixture") } })
  let saved = await repo.saveModel(0, draft); const id = saved.models[0].id
  assert.equal(events.length, 1)
  fail = true
  await assert.rejects(repo.saveModel(1, { ...draft, id, apiKey: "replacement-fixture" }), /disk fixture/)
  assert.equal(events.length, 1); assert.equal((await repo.read()).models[0].authRevision, 1)
  fail = false
  saved = await repo.saveModel(1, { ...draft, id, apiKey: "replacement-fixture" })
  assert.equal(saved.models[0].authRevision, 2); assert.equal(events.length, 2)
  assert.deepEqual(events, [{ revision: 1, diskRevision: 1 }, { revision: 2, diskRevision: 2 }])
  await assert.rejects(repo.saveModel(saved.revision, { ...draft, id, endpoint: "https://other.test/v1", apiKey: "" }), /Key/)
  assert.equal((await repo.read()).revision, saved.revision)
}))

test("DESK-M12: even short local endpoint keys never appear in a public mask", () => fixture(async path => {
  const repo = new ModelRepository(path, protection, { replace() {}, remove() {} })
  let revision = 0
  for (const key of ["z", "zx", "zxq", "zxqv"]) {
    const saved = await repo.saveModel(revision, { ...draft, modelId: `model-${key.length}`, apiKey: key }); revision = saved.revision
    assert.equal(saved.models.at(-1)!.keyMask.includes(key), false)
  }
}))

test("DESK-A02/A03: compatible thinking is retained; incompatible model changes store default and invalid explicit choices reject", () => fixture(async path => {
  const repo = new ModelRepository(path, protection, { replace() {}, remove() {} })
  let saved = await repo.saveModel(0, { ...draft, modelId: "A", thinkingLevels: ["high"], defaultThinking: "high" }); const a = saved.models[0].id
  saved = await repo.saveModel(saved.revision, { ...draft, modelId: "B", thinkingLevels: ["low"], defaultThinking: "low" }); const b = saved.models[1].id
  saved.settings.agent.textModelId = a; saved.settings.agent.thinking = "high"
  saved = await repo.updateSettings(saved.revision, saved.settings)
  assert.equal(saved.settings.agent.thinking, "high")
  saved.settings.agent.textModelId = b
  saved = await repo.updateSettings(saved.revision, saved.settings)
  assert.equal(saved.settings.agent.thinking, "default")
  const before = saved.revision
  saved.settings.agent.thinking = "arbitrary-incompatible"
  await assert.rejects(repo.updateSettings(saved.revision, saved.settings), /思考/)
  assert.equal((await repo.read()).revision, before)
  await assert.rejects(repo.saveModel(before, { ...draft, modelId: "invalid-meta", thinkingLevels: ["low"], defaultThinking: "high" }), /思考/)
}))

test("DESK-M12: encryption/decryption errors are safe messages without the original secret or cause", () => fixture(async path => {
  const repo = new ModelRepository(path, { ...protection, encryptString(key) { throw new Error(`fixture error ${key}`) } }, { replace() {}, remove() {} })
  await assert.rejects(repo.saveModel(0, draft), error => error instanceof Error && !error.message.includes(draft.apiKey) && error.cause === undefined)
  assert.equal((await repo.read()).revision, 0)
  const valid = new ModelRepository(path, protection, { replace() {}, remove() {} }); const saved = await valid.saveModel(0, draft)
  const broken = new ModelRepository(path, { ...protection, decryptString() { throw new Error(`fixture decrypt ${draft.apiKey}`) } }, { replace() {}, remove() {} })
  await assert.rejects(broken.keyFor(saved.models[0].id, 1), error => error instanceof Error && !error.message.includes(draft.apiKey) && error.cause === undefined)
}))

test("DESK-A02/M13: compatible model switches and empty-key edits preserve credentials across reopen", () => fixture(async path => {
  const published: number[] = []
  const gateway = { replace(model: { authRevision: number }) { published.push(model.authRevision) }, remove() {} }
  const repo = new ModelRepository(path, protection, gateway)
  let saved = await repo.saveModel(0, { ...draft, modelId: "A", thinkingLevels: ["high"], defaultThinking: "high" })
  const a = saved.models[0].id
  saved = await repo.saveModel(saved.revision, { ...draft, modelId: "C", thinkingLevels: ["low", "high"], defaultThinking: "low" })
  const c = saved.models[1].id
  saved.settings.agent.textModelId = a; saved.settings.agent.thinking = "high"
  saved = await repo.updateSettings(saved.revision, saved.settings)
  saved.settings.agent.textModelId = c
  saved = await repo.updateSettings(saved.revision, saved.settings)
  assert.equal(saved.settings.agent.thinking, "high")
  const original = JSON.parse(await readFile(path, "utf8")).value.models[1]
  saved = await repo.saveModel(saved.revision, { ...draft, id: c, modelId: "C", name: "改名", apiKey: "", thinkingLevels: ["low"], defaultThinking: "low" })
  const reopened = new ModelRepository(path, protection, gateway)
  assert.equal((await reopened.read()).settings.agent.thinking, "default")
  assert.equal(await reopened.keyFor(c, original.authRevision), draft.apiKey)
  assert.equal(JSON.parse(await readFile(path, "utf8")).value.models[1].encryptedKey, original.encryptedKey)
  const before = await readFile(path, "utf8"); const eventCount = published.length
  for (const change of [{ provider: "other" }, { protocol: "anthropic" as const }, { endpoint: "https://other.test/v1" }, { kind: "IMAGE" as const }]) {
    await assert.rejects(reopened.saveModel(saved.revision, { ...draft, id: c, modelId: "C", apiKey: "", ...change }), /Key/)
    assert.equal(await readFile(path, "utf8"), before); assert.equal(published.length, eventCount)
  }
}))

test("DESK-M13: post-rename uncertainty reconciles authorization; failed removal preserves defaults and credential", () => fixture(async path => {
  let failBefore = false; let failAfter = false; const published: number[] = []; const removed: string[] = []
  const repo = new ModelRepository(path, protection, { replace(model) { published.push(model.authRevision) }, remove(id) { removed.push(id) } }, {
    beforeRename: async () => { if (failBefore) throw new Error("before fixture") }, beforeDirectorySync: async () => { if (failAfter) throw new Error("after fixture") },
  })
  let saved = await repo.saveModel(0, draft); const id = saved.models[0].id
  saved.settings.agent.textModelId = id; saved.settings.agent.reviewModelId = id
  saved = await repo.updateSettings(saved.revision, saved.settings)
  failBefore = true
  await assert.rejects(repo.removeModel(saved.revision, id), /before fixture/)
  assert.deepEqual((await repo.read()).settings.agent, saved.settings.agent); assert.equal(removed.length, 0)
  assert.equal(await repo.keyFor(id, 1), draft.apiKey)
  failBefore = false; failAfter = true
  await assert.rejects(repo.saveModel(saved.revision, { ...draft, id, apiKey: "replacement-fixture" }), error => !!error && typeof error === "object" && "committed" in error && error.committed === true)
  assert.equal((await repo.read()).models[0].authRevision, 2); assert.equal(published.at(-1), 2)
  assert.equal(await repo.keyFor(id, 2), "replacement-fixture")
  await assert.rejects(repo.keyFor(id, 1), /授权/)
}))

test("DESK-A03: disabling preserves default reference; deleting atomically clears all defaults without replacement", () => fixture(async path => {
  const removed: string[] = []
  const repo = new ModelRepository(path, protection, { replace() {}, remove(id) { removed.push(id) } })
  let saved = await repo.saveModel(0, draft); const id = saved.models[0].id
  saved.settings.agent.textModelId = id; saved.settings.agent.reviewModelId = id
  saved = await repo.updateSettings(saved.revision, saved.settings)
  saved = await repo.saveModel(saved.revision, { ...draft, id, enabled: false, apiKey: "" })
  assert.equal(saved.settings.agent.textModelId, id)
  saved = await repo.removeModel(saved.revision, id)
  assert.equal(saved.settings.agent.textModelId, null); assert.equal(saved.settings.agent.reviewModelId, null)
  assert.deepEqual(removed, [id]); assert.equal(saved.models.length, 0)
  assert.deepEqual((await new ModelRepository(path, protection, { replace() {}, remove() {} }).read()).settings.agent, saved.settings.agent)
}))
