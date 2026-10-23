import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { test } from "node:test"
import { defaultState, modelSchema, publicModel, stateSchema } from "../../desktop/core/settings"
import { exportConfiguration, prepareConfigurationImport } from "../../desktop/core/configuration-transfer"
import { onboardingActionSchema } from "../../desktop/shared/onboarding"
import { officialModel } from "../../desktop/shared/provider-capabilities"
import { resolveOpenAITextPolicy } from "../../desktop/shared/modelWirePolicy"

const custom = { provider: "custom", protocol: "openai", kind: "TEXT", modelId: "gpt-6.1-sol" }

test("WIRE-01/05: undefined and auto retain the exact legacy API and official capability metadata", () => {
  for (const wire of [undefined, "auto"] as const) {
    const known = resolveOpenAITextPolicy({ ...custom, wire })
    assert.equal(known.wire, "responses"); assert.equal(known.capability, officialModel("openai", custom.modelId)); assert.equal(known.customExplicit, false)
    const unknown = resolveOpenAITextPolicy({ ...custom, modelId: "relay-unknown", wire })
    assert.equal(unknown.wire, "chat"); assert.equal(unknown.capability, undefined); assert.equal(unknown.customExplicit, false)
  }
})

test("WIRE-04/05: explicit custom APIs do not inherit official reasoning, access programs or streaming", () => {
  for (const wire of ["chat", "responses"] as const) for (const modelId of ["gpt-6.1-sol", "gpt-5.6-cyber", "gpt-5.5-pro", "relay-unknown"]) {
    const policy = resolveOpenAITextPolicy({ ...custom, modelId, wire })
    assert.deepEqual(policy, { wire, customExplicit: true })
  }
})

test("WIRE-01: wire overrides are ignored outside custom OpenAI text without changing legacy capabilities", () => {
  for (const wire of ["chat", "responses"] as const) {
    const official = resolveOpenAITextPolicy({ ...custom, provider: "openai", wire })
    assert.equal(official.wire, "responses"); assert.equal(official.capability, officialModel("openai", custom.modelId)); assert.equal(official.customExplicit, false)
    for (const model of [{ ...custom, protocol: "anthropic" }, { ...custom, kind: "IMAGE", modelId: "image-fixture" }, { ...custom, provider: "deepseek", modelId: "deepseek-flash" }]) {
      const policy = resolveOpenAITextPolicy({ ...model, wire })
      assert.equal(policy.wire, "chat"); assert.equal(policy.customExplicit, false)
    }
  }
})

test("WIRE-01: state, public snapshots, onboarding and configuration transfer accept legacy and selected APIs", () => {
  const model = { ...custom, id: randomUUID(), name: "公开夹具", endpoint: "https://relay.fixture.invalid/", contextWindow: 128000, enabled: true, authRevision: 1, encryptedKey: "synthetic-encrypted-fixture", keyMask: "••", thinkingLevels: [], defaultThinking: "default" }
  for (const wire of [undefined, "auto", "chat", "responses"] as const) {
    const stored = modelSchema.parse({ ...model, ...(wire !== undefined ? { wire } : {}) })
    const parsed = stateSchema.parse({ ...defaultState, models: [stored] })
    assert.equal(parsed.models[0].wire, wire)
    const visible = publicModel(stored); assert.equal(visible.wire, wire); assert.equal("encryptedKey" in visible, false)
    const { authRevision: _revision, encryptedKey: _key, keyMask: _mask, ...fields } = stored
    const onboarding = onboardingActionSchema.parse({ type: "model", revision: 1, sessionId: randomUUID(), operationId: randomUUID(), flow: "models", selection: { type: "draft", model: { ...fields, apiKey: "" } } })
    assert.equal(onboarding.type, "model")
    if (onboarding.type === "model" && onboarding.selection.type === "draft") assert.equal(onboarding.selection.model.wire, wire)
    const snapshot = { revision: 1, settings: structuredClone(defaultState.settings), models: [visible] }
    const portable = exportConfiguration(snapshot)
    assert.doesNotThrow(() => prepareConfigurationImport(portable, snapshot))
  }
  for (const wire of ["invalid", null, 1, {}]) {
    assert.equal(modelSchema.safeParse({ ...model, wire }).success, false)
    const { authRevision: _revision, encryptedKey: _key, keyMask: _mask, ...fields } = model
    assert.equal(onboardingActionSchema.safeParse({ type: "model", revision: 1, sessionId: randomUUID(), operationId: randomUUID(), flow: "models", selection: { type: "draft", model: { ...fields, wire, apiKey: "" } } }).success, false)
  }
})
