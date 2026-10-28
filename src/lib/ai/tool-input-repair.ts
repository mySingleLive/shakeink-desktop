import type { ToolCallRepairFunction, ToolSet } from "ai"
import { z } from "zod"

function completePut(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const operation = value as Record<string, unknown>
  return operation.kind === "put" && typeof operation.collection === "string" && !!operation.value
    && typeof operation.value === "object" && !Array.isArray(operation.value)
    && Object.keys(operation).every(key => ["kind", "collection", "value"].includes(key))
}

/** 只在确定的operations/put/value/tellings边界补闭合符，不改字段、字符串或缺失值。 */
function repairPlanningClosingBoundary(raw: string): string | null {
  let quoted = false, escaped = false
  const stack: { char: string; at: number }[] = []
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i]
    if (quoted) {
      if (escaped) escaped = false
      else if (char === "\\") escaped = true
      else if (char === '"') quoted = false
      continue
    }
    if (char === '"') { quoted = true; continue }
    if (char === "{" || char === "[") { stack.push({ char, at: i }); continue }
    if (char !== "}" && char !== "]") continue
    const top = stack.at(-1)
    if (top?.char === (char === "}" ? "{" : "[")) { stack.pop(); continue }
    if (!top || !/"operations"\s*:\s*$/.test(raw.slice(0, stack[1]?.at))) return null
    if (char === "]" && stack.map(s => s.char).join("") === "{[{") {
      if (!completePut(JSON.parse(raw.slice(top.at, i) + "}"))) return null
      return raw.slice(0, i) + "}" + raw.slice(i)
    }
    if (char === "}" && stack.map(s => s.char).join("") === "{[{{["
      && /"value"\s*:\s*$/.test(raw.slice(0, stack[3].at))
      && /"tellings"\s*:\s*$/.test(raw.slice(0, top.at))) {
      const header = JSON.parse(raw.slice(stack[2].at, stack[3].at) + "null}")
      const tellings = JSON.parse(raw.slice(top.at, i) + "]")
      if (header.kind !== "put" || header.collection !== "cards" || !Array.isArray(tellings) || !tellings.length
        || !tellings.every(t => t && typeof t === "object" && typeof t.id === "string" && Array.isArray(t.refs))) return null
      return raw.slice(0, i) + "]" + raw.slice(i)
    }
    return null
  }
  return null
}

/** 仅补全已完整规划对象的容器闭合符；不修正文案引号或推测缺失值。 */
export function parsePlanningToolJson(raw: string): unknown {
  let candidate = raw, repairs = 0, wrappers = 0
  for (;;) {
    try {
      const parsed = JSON.parse(candidate)
      const wrapped = typeof parsed === "string" ? parsed
        : parsed && typeof parsed === "object" && !Array.isArray(parsed)
          && Object.keys(parsed).length === 1 && typeof parsed.arguments === "string" ? parsed.arguments : null
      if (wrapped !== null) {
        if (wrappers++ >= 4) throw new SyntaxError("规划参数编码层数过多")
        candidate = wrapped
        continue
      }
      return parsed
    }
    catch (error) {
      // 一批最多200个操作，每项可能分别漏tellings与put的闭合符。
      // 修复边界仍逐项严格核验，不能用三次总上限截断合法的大批次修复。
      if (repairs++ >= 403 || !(error instanceof SyntaxError)) throw error
      const trailing = error.message.match(/Unexpected non-whitespace character after JSON at position (\d+)/)
      if (trailing) {
        const position = Number(trailing[1]), suffix = candidate.slice(position)
        const complete = JSON.parse(candidate.slice(0, position))
        if (!/^[\]}\s]{1,8}$/.test(suffix) || !complete || typeof complete !== "object" || Array.isArray(complete)
          || !Number.isInteger(complete.expectedVersion) || !Array.isArray(complete.operations) || !complete.operations.length
          || !complete.operations.every(completePut) || Object.keys(complete).some(key => !["expectedVersion", "operations"].includes(key))) throw error
        candidate = candidate.slice(0, position)
        continue
      }
      const match = error.message.match(/Expected double-quoted property name in JSON at position (\d+)/)
      if (!match) {
        const repaired = repairPlanningClosingBoundary(candidate)
        if (!repaired) throw error
        candidate = repaired
        continue
      }
      const position = Number(match[1])
      if (candidate[position] !== "{") throw error
      let quoted = false, escaped = false
      const stack: { char: string; at: number }[] = []
      for (let i = 0; i < position; i++) {
        const char = candidate[i]
        if (quoted) {
          if (escaped) escaped = false
          else if (char === "\\") escaped = true
          else if (char === '"') quoted = false
        } else if (char === '"') quoted = true
        else if (char === "{" || char === "[") stack.push({ char, at: i })
        else if (char === "}" || char === "]") stack.pop()
      }
      let comma = position - 1
      while (/\s/.test(candidate[comma] ?? "") && comma >= 0) comma--
      if (quoted || stack.length !== 3 || stack.map(item => item.char).join("") !== "{[{" || candidate[comma] !== "," || !/"operations"\s*:\s*$/.test(candidate.slice(0, stack[1].at))) throw error
      const operation = JSON.parse(candidate.slice(stack[2].at, comma) + "}")
      if (!completePut(operation)) throw error
      // 只插入结构分隔符；所有ID、版本与value字节保持原样，完整schema仍由SDK验证。
      candidate = candidate.slice(0, comma) + "}" + candidate.slice(comma)
    }
  }
}

/** 该位置声明的容器类型（anyOf/oneOf 递归展开），用于判断 JSON 字符串该不该还原。 */
function declaredTypes(schema: Record<string, unknown>): Set<string> {
  const types = new Set<string>()
  const add = (type: unknown) => { if (typeof type === "string") types.add(type) }
  add(schema.type)
  if (Array.isArray(schema.type)) schema.type.forEach(add)
  return types
}

function containerTypes(schema: Record<string, unknown>): Set<string> {
  const types = declaredTypes(schema)
  for (const key of ["anyOf", "oneOf"]) {
    const branches = schema[key]
    if (!Array.isArray(branches)) continue
    for (const branch of branches) {
      if (branch && typeof branch === "object") {
        for (const type of containerTypes(branch as Record<string, unknown>)) types.add(type)
      }
    }
  }
  return types
}

/** 还原后的容器继续按命中的分支规整内部字段（如数字字符串）。 */
function matchingContainerSchema(schema: Record<string, unknown>, parsed: Record<string, unknown> | unknown[]): Record<string, unknown> {
  const wantsArray = Array.isArray(parsed)
  const direct = declaredTypes(schema)
  if (wantsArray ? direct.has("array") : direct.has("object")) return schema
  for (const key of ["anyOf", "oneOf"]) {
    const branches = schema[key]
    if (!Array.isArray(branches)) continue
    for (const branch of branches) {
      if (!branch || typeof branch !== "object") continue
      const types = declaredTypes(branch as Record<string, unknown>)
      if (wantsArray ? types.has("array") : types.has("object")) return branch as Record<string, unknown>
    }
  }
  return schema
}

/** 括号栈修正闭合符（issue #15）：仅改写/丢弃/补齐闭合符，不增删任何内容字符。
    转义口径与 repairPlanningClosingBoundary 一致：通用 escaped 标志，任意 \ 后字符被消费。
    返回 null 表示不可修复（字面量未闭合）。 */
function repairContainerClosers(text: string): { value: string; rewritten: number; dropped: number; padded: number } | null {
  const stack: string[] = []
  const out: string[] = []
  let inString = false, escaped = false, rewritten = 0, dropped = 0
  for (const char of text) {
    if (inString) {
      out.push(char)
      if (escaped) { escaped = false; continue }
      if (char === "\\") { escaped = true; continue }
      if (char === '"') inString = false
      continue
    }
    if (char === '"') { inString = true; out.push(char); continue }
    if (char === "{" || char === "[") { stack.push(char); out.push(char); continue }
    if (char === "}" || char === "]") {
      const top = stack.at(-1)
      if (!top) { dropped++; continue }
      const want = top === "{" ? "}" : "]"
      if (char !== want) { out.push(want); rewritten++ } else out.push(char)
      stack.pop()
      continue
    }
    out.push(char)
  }
  // 字面量被切断在内部：结构证据不足，不补齐（防伪造内容）。
  if (inString) return null
  // LIFO 补齐缺失的尾部闭合符（栈顶→栈底）。
  const closing = stack.slice().reverse().map(open => (open === "{" ? "}" : "]")).join("")
  return { value: out.join("") + closing, rewritten, dropped, padded: closing.length }
}

/** 只在 schema 明确期望对象/数组时还原同构 JSON 文本；普通字符串字段不改写。 */
function parseEncodedContainer(value: string, schema: Record<string, unknown>): Record<string, unknown> | unknown[] | undefined {
  const types = containerTypes(schema)
  if (!types.has("object") && !types.has("array")) return undefined
  // 联合同时允许字符串时无法区分作者原文与被编码的容器，保持原样。
  if (types.has("string")) return undefined
  const text = value.trim()
  if (!text.startsWith("{") && !text.startsWith("[")) return undefined
  const accept = (parsed: unknown): Record<string, unknown> | unknown[] | undefined => {
    if (types.has("object") && parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>
    if (types.has("array") && Array.isArray(parsed)) return parsed
    return undefined
  }
  try {
    const parsed: unknown = JSON.parse(text)
    const direct = accept(parsed)
    if (direct !== undefined) return direct
  } catch {
    // 内层 JSON 非法（供应商把闭合符类型/数量写错，issue #15）：按括号栈修正后再试。
    const repaired = repairContainerClosers(text)
    if (!repaired) return undefined
    // 放行条件（docs/235）：模型确实写错闭合符类型（rewritten ≥ 1）才修；
    // 纯尾部缺闭合符/纯多余闭合符（rewritten=0）无法区分真截断，一律放弃。
    if (!(repaired.rewritten >= 1 && repaired.padded <= 1)) return undefined
    let parsed: unknown
    try { parsed = JSON.parse(repaired.value) } catch { return undefined }
    return accept(parsed)
  }
  return undefined
}

/** 仅修复无歧义的编码/类型问题，不补造 ID、版本、内容或作者选择。 */
export function normalizeToolInput(value: unknown, schema: Record<string, unknown>): unknown {
  if (typeof value === "string") {
    const parsed = parseEncodedContainer(value, schema)
    if (parsed !== undefined) return normalizeToolInput(parsed, matchingContainerSchema(schema, parsed))
  }
  const type = schema.type
  if ((type === "number" || type === "integer") && typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value.trim())) return Number(value)
  if (type === "boolean" && (value === "true" || value === "false")) return value === "true"
  if (Array.isArray(value) && schema.items && typeof schema.items === "object") return value.map(item => normalizeToolInput(item, schema.items as Record<string, unknown>))
  if (value && typeof value === "object" && !Array.isArray(value) && schema.properties && typeof schema.properties === "object") {
    const properties = schema.properties as Record<string, Record<string, unknown>>, required = new Set(Array.isArray(schema.required) ? schema.required : [])
    return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
      const property = properties[key]
      if (!property) return [[key, item]]
      const nullable = property.type === "null" || Array.isArray(property.type) && property.type.includes("null") || Array.isArray(property.anyOf) && property.anyOf.some(s => s && typeof s === "object" && "type" in s && s.type === "null")
      if (item === null && !required.has(key) && !nullable) return []
      return [[key, normalizeToolInput(item, property)]]
    }))
  }
  return value
}

export const repairToolInput: ToolCallRepairFunction<ToolSet> = async ({ toolCall, tools, inputSchema }) => {
  if (!Object.hasOwn(tools, toolCall.toolName)) return null
  try {
    const raw = toolCall.input.trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "")
    let input: unknown = toolCall.toolName === "proposeNovelPlanning" ? parsePlanningToolJson(raw) : JSON.parse(raw)
    if (typeof input === "string") input = JSON.parse(input)
    // Some endpoints return labeled options despite the advertised string array.
    // Keep the full wording and order; never infer the author's answer.
    if (toolCall.toolName === "askUserQuestion" && input && typeof input === "object" && "questions" in input && Array.isArray(input.questions)) {
      input = { ...input, questions: input.questions.map(question => {
        if (!question || typeof question !== "object" || !Array.isArray(question.options)) return question
        return { ...question, options: question.options.map((option: unknown) => {
          if (!option || typeof option !== "object" || !("label" in option) || typeof option.label !== "string" || !Object.keys(option).every(key => ["label", "description"].includes(key))) return option
          if ("description" in option && option.description !== undefined && typeof option.description !== "string") return option
          return [option.label, "description" in option ? option.description : undefined].filter(value => typeof value === "string" && value.length > 0).join("：")
        }) }
      }) }
    }
    const repaired = JSON.stringify(normalizeToolInput(input, await inputSchema({ toolName: toolCall.toolName }) as Record<string, unknown>))
    return repaired === toolCall.input ? null : { ...toolCall, input: repaired }
  } catch { return null }
}

/** Zod invalid_type 的 issue.input 对联合分支可能是 undefined，必须按路径回查原值判断是否真的缺失。 */
function valueAtPath(input: unknown, path: PropertyKey[]): { found: boolean; value: unknown } {
  let current = input
  for (const key of path) {
    if (current === null || typeof current !== "object" || !Object.hasOwn(current, key)) return { found: false, value: undefined }
    current = (current as Record<PropertyKey, unknown>)[key]
  }
  return { found: true, value: current }
}

const TYPE_LABELS: Record<string, string> = { object: "对象", array: "数组", string: "字符串", number: "数字", integer: "整数", boolean: "布尔值", null: "null" }

function receivedTypeLabel(value: unknown): string {
  if (value === null) return "null"
  if (Array.isArray(value)) return "数组"
  return TYPE_LABELS[typeof value] ?? typeof value
}

/** 工具入参校验失败时给模型可执行的纠正线索：列出前几个缺失/非法字段，不含参数内容本身。 */
export function toolInputIssueHint(tools: ToolSet, toolName: string, input: unknown): string | null {
  const schema = tools[toolName]?.inputSchema
  if (!schema || typeof schema !== "object" || !("safeParse" in schema) || typeof schema.safeParse !== "function") return null
  const parsed = (schema as unknown as z.ZodType).safeParse(input)
  if (parsed.success) return null
  const issues = parsed.error.issues.slice(0, 3).map(issue => {
    const path = issue.path.join(".") || "(整体)"
    if (issue.code !== "invalid_type") return `${path}: ${issue.message}`
    const { found, value } = valueAtPath(input, issue.path)
    if (!found) return `缺少 ${path}`
    const expected = "expected" in issue && typeof issue.expected === "string" ? TYPE_LABELS[issue.expected] ?? issue.expected : "该类型"
    return `${path}: 应为${expected}，实际为${receivedTypeLabel(value)}`
  })
  return issues.length ? issues.join("；") : null
}
