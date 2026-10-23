import type { ModelWire } from "./model-catalog"
import { officialModel, type OfficialCapability } from "./provider-capabilities"

export interface OpenAITextPolicyInput {
  provider: string
  protocol: string
  kind: string
  modelId: string
  wire?: ModelWire
}

/** Explicit custom APIs do not inherit assumptions from an official model name.
 * Missing/auto retains the legacy selection and capability metadata unchanged.
 */
export function resolveOpenAITextPolicy(model: OpenAITextPolicyInput): {
  wire: "chat" | "responses"
  capability?: OfficialCapability
  customExplicit: boolean
} {
  const openaiProtocol = model.protocol === "openai" && ["openai", "custom"].includes(model.provider)
  if (model.provider === "custom" && model.protocol === "openai" && model.kind === "TEXT" && (model.wire === "chat" || model.wire === "responses")) {
    return { wire: model.wire, customExplicit: true }
  }
  const capability = officialModel(openaiProtocol ? "openai" : model.provider, model.modelId)
  return { wire: openaiProtocol && capability?.wire === "responses" ? "responses" : "chat", capability, customExplicit: false }
}
