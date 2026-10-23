import assert from "node:assert/strict"
import { test } from "node:test"
import { normalizeModelEndpoint } from "../../desktop/shared/modelEndpoint"

const customText = { provider: "custom", protocol: "openai", kind: "TEXT" }

test("RELAY-01: a custom OpenAI text root resolves to a same-origin v1 request prefix", () => {
  for (const endpoint of ["https://relay.fixture.invalid", "https://relay.fixture.invalid/", "http://127.0.0.1:4321/"]) {
    const normalized = normalizeModelEndpoint(endpoint, customText)
    assert.equal(new URL(normalized).origin, new URL(endpoint).origin)
    assert.equal(new URL(normalized).pathname, "/v1")
    assert.equal(normalizeModelEndpoint(normalized, customText), normalized)
  }
})

test("RELAY-02: normalization preserves explicit paths, other providers, protocols and image endpoints", () => {
  for (const endpoint of ["https://relay.fixture.invalid/v1", "https://relay.fixture.invalid/v1/", "https://relay.fixture.invalid/api/proxy/v1", "https://relay.fixture.invalid/compatible/"]) {
    assert.equal(normalizeModelEndpoint(endpoint, customText), endpoint)
  }
  const endpoint = "https://relay.fixture.invalid/"
  for (const options of [
    { ...customText, provider: "openai" },
    { ...customText, provider: "deepseek" },
    { ...customText, protocol: "anthropic" },
    { ...customText, kind: "IMAGE" },
  ]) assert.equal(normalizeModelEndpoint(endpoint, options), endpoint)
})
