import assert from "node:assert/strict"
import { test } from "node:test"
import { chatTerminalError, classifyError, classifyWireError, isRetryableNetworkError } from "../../src/lib/ai/error-classification"
import { ContentError } from "../../src/lib/content-errors"
test("DESK-M13: sanitized model network failures retain retry semantics through RPC/SDK wrappers", () => {
  const error = new Error("SDK transport failed", { cause: new Error("MODEL_NETWORK_ERROR") })
  assert.equal(classifyError(error).category, "network")
  assert.equal(isRetryableNetworkError(error), true)
  const revoked = new Error("SDK request failed", { cause: new Error("AUTHORIZATION_REVOKED") })
  assert.equal(classifyError(revoked).category, "model_unavailable")
  assert.equal(classifyError(revoked).retryScope, "none")
})
test("DEFAULT-13: every precise model configuration error survives SDK causes and wire classification without retry", () => {
  for (const code of ["MODEL_NOT_CONFIGURED", "MODEL_NOT_SELECTED", "MODEL_NOT_FOUND", "MODEL_DISABLED", "MODEL_KEY_MISSING", "MODEL_KIND_MISMATCH", "MODEL_THINKING_UNSUPPORTED", "AUTHORIZATION_REVOKED"]) {
    const wrapped = new Error("SDK request failed", { cause: new Error(code) })
    assert.equal(classifyError(wrapped).category, "model_unavailable", code)
    assert.equal(classifyError(wrapped).code, code)
    assert.equal(classifyError(wrapped).retryScope, "none")
    assert.equal(isRetryableNetworkError(wrapped), false)
    assert.equal(classifyWireError(code).category, "model_unavailable")
    assert.equal(classifyWireError(code).retryScope, "none")
  }
})

test("WIRE-07: precise model 401/403 evidence survives nested SDK/RPC failures with fixed nonretrying diagnostics", () => {
  for (const [statusCode, code] of [[401, "MODEL_AUTHENTICATION_FAILED"], [403, "MODEL_PERMISSION_DENIED"]] as const) {
    const machine = `HTTP_${statusCode}`
    for (const error of [
      { statusCode, message: "fixture-vendor-body secret-key https://private.invalid/path" },
      new Error("SDK failed", { cause: { statusCode } }),
      { name: "AI_RetryError", errors: [new Error("generic wrapper"), { cause: { statusCode } }] },
      { lastError: { code: machine } },
      new Error(machine),
      { code, message: "原始供应商内容 secret-key https://private.invalid/path" },
      { statusCode, isRetryable: true, cause: new Error("MODEL_NETWORK_ERROR") },
    ]) {
      const result = classifyError(error)
      assert.equal(result.code, code)
      assert.equal(result.category, "model_unavailable")
      assert.equal(result.retryScope, "none")
      assert.match(result.message, /模型|API Key/)
      assert.doesNotMatch(result.message, /fixture|secret-key|https:|原始供应商/)
      assert.deepEqual(classifyWireError(code, "原始供应商内容 secret-key https://private.invalid/path"), result)
    }
    const terminal = chatTerminalError({ error: new ContentError(code, "原始供应商内容 secret-key https://private.invalid/path") })
    assert.equal(terminal.code, code)
    assert.equal(terminal.message, classifyError({ statusCode }).message)
  }
})

test("WIRE-07/08: arbitrary vendor text is never treated as HTTP evidence, and cyclic causes remain bounded", () => {
  for (const message of ["HTTP_401 vendor text", "vendor denied 403", "无权限 secret-key", "AUTHENTICATION_FAILED string in raw body"]) {
    assert.equal(classifyError(new Error(message)).code, "STREAM_INTERRUPTED")
  }
  const cyclic: { cause?: unknown; errors: unknown[] } = { errors: [{ code: "HTTP_403" }] }
  cyclic.cause = cyclic
  assert.equal(classifyError(cyclic).code, "MODEL_PERMISSION_DENIED")
})

test("WIRE-08: cancellation, revoked authorization and explicit quota keep priority over HTTP auth evidence", () => {
  const auth = { statusCode: 403, message: "fixture private failure" }
  assert.equal(chatTerminalError({ error: auth, aborted: true }).code, "EXECUTION_INTERRUPTED")
  assert.equal(classifyError({ ...auth, cause: new Error("AUTHORIZATION_REVOKED") }).code, "AUTHORIZATION_REVOKED")
  assert.equal(classifyError({ ...auth, cause: { statusCode: 402 } }).category, "quota_provider")
  assert.equal(classifyError({ ...auth, cause: new Error("insufficient_balance") }).category, "quota_provider")
  assert.equal(classifyError({ ...auth, cause: { name: "QuotaExceededError" } }).category, "quota_platform")
  assert.equal(classifyError({ statusCode: 429 }).category, "rate_limited")
  const terminal = chatTerminalError({ error: auth, writeStarted: true })
  assert.equal(terminal.code, "MODEL_PERMISSION_DENIED")
  assert.match(terminal.message, /权限/)
  assert.match(terminal.message, /已提交改动保留/)
})
