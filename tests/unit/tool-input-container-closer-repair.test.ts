import assert from "node:assert/strict"
import { test } from "node:test"
import { asSchema, tool, type ToolSet } from "ai"
import { z } from "zod"
import { normalizeToolInput, repairToolInput } from "../../src/lib/ai/tool-input-repair"
import { operationSchema } from "../../src/lib/planning/domain"

// ============================================================================
// 用例组：工具入参数组字符串化且内层闭合符错乱的容器修复
// 编号 CL-01~CL-35 对应 docs/236-tool-input-container-closer-repair-cases.md
// 夹具全部为合成最小样本，不含任何真实作品内容/密钥/端点。
// ============================================================================

const opsSchema = z.array(operationSchema).min(1).max(200)
const proposeNovelPlanningSchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
  operations: opsSchema,
})

// 真实故障入参的合成等价形态：operations 被字符串化且内层闭合符错乱
function planningInput(operationsText: string) {
  return JSON.stringify({ expectedVersion: 37, operations: operationsText })
}

async function repairWith(name: string, schema: unknown, input: unknown) {
  const tools = { [name]: tool({ inputSchema: schema as never, execute: async () => ({ ok: true }) }) } as unknown as ToolSet
  const repaired = await repairToolInput({
    toolCall: { toolCallId: "call_fixture", toolName: name, input: typeof input === "string" ? input : JSON.stringify(input) },
    tools,
    inputSchema: async ({ toolName }: { toolName: string }) => asSchema((tools as never as Record<string, { inputSchema: never }>)[toolName].inputSchema).jsonSchema as never,
  } as never)
  return repaired ? JSON.parse(repaired.input) : null
}

const arraySchema = { type: "array", items: { type: "object" } }

// ============================================================================
// CL 组：真实故障形态（正例，必须修复）
// ============================================================================

test("CL-01 真实样本形态A：尾部 2 处类型错位+1 多余闭合符，还原并通过 operationSchema", () => {
  // 代表真实 5 样本中形态 A（3/5 份，rewritten=2, dropped=1, padded=0，均为 op 数=1）
  const broken = '[{"kind":"put","collection":"cards","value":{"id":"c1","title":"标题一"}]}}'
  const expected = [{ kind: "put", collection: "cards", value: { id: "c1", title: "标题一" } }]
  const normalized = normalizeToolInput({ operations: broken }, { type: "object", properties: { operations: arraySchema } })
  const ops = (normalized as { operations: unknown[] }).operations
  assert.deepEqual(ops, expected)
  assert.equal(opsSchema.safeParse(ops).success, true)
})

test("CL-02 真实样本形态B：1 处类型错位+缺 1 层闭合，还原并通过 operationSchema", () => {
  // 代表真实 5 样本中形态 B（2/5 份）
  const broken = '[{"kind":"put","collection":"cards","value":{"id":"c1","title":"标题一"}]'
  const expected = [{ kind: "put", collection: "cards", value: { id: "c1", title: "标题一" } }]
  const normalized = normalizeToolInput({ operations: broken }, { type: "object", properties: { operations: arraySchema } })
  const ops = (normalized as { operations: unknown[] }).operations
  assert.deepEqual(ops, expected)
  assert.equal(opsSchema.safeParse(ops).success, true)
})

test("CL-03 类型错位：尾部 }} 写成 ]}", () => {
  const broken = '[{"a":1]}'
  const normalized = normalizeToolInput({ v: broken }, { type: "object", properties: { v: arraySchema } })
  assert.deepEqual((normalized as { v: unknown[] }).v, [{ a: 1 }])
})

test("CL-04 类型错位+多余闭合符组合", () => {
  const broken = '[{"a":1]}]]'
  const normalized = normalizeToolInput({ v: broken }, { type: "object", properties: { v: arraySchema } })
  assert.deepEqual((normalized as { v: unknown[] }).v, [{ a: 1 }])
})

test("CL-05 类型错位+缺失闭合符组合，且修复后递归继续规整数字字符串", () => {
  const broken = '[{"a":{"b":"78"}]'
  const itemSchema = { type: "object", properties: { a: { type: "object", properties: { b: { type: "number" } } } } }
  const schema = { type: "object", properties: { v: { type: "array", items: itemSchema } } }
  const normalized = normalizeToolInput({ v: broken }, schema)
  // 修复后递归规整："78" → 78（normalizeToolInput 递归不中断）
  assert.deepEqual((normalized as { v: unknown[] }).v, [{ a: { b: 78 } }])
})

test("CL-06 内容含中文/转义引号/反斜杠结尾的错乱形态", () => {
  // 对象闭合 } 错写为 ]（类型错位），内容含转义引号与反斜杠结尾
  const broken = '[{"p":"中文内容","q":"a\\"b","r":"C:\\\\"' + ']]'
  const normalized = normalizeToolInput({ v: broken }, { type: "object", properties: { v: arraySchema } })
  assert.deepEqual((normalized as { v: unknown[] }).v, [{ p: "中文内容", q: 'a"b', r: "C:\\" }])
})

test("CL-07 内容含 \\uXXXX 转义的错乱形态（不得误判未闭合）", () => {
  const broken = '[{"p":"\\u4e2d\\u6587"' + ']]'
  const normalized = normalizeToolInput({ v: broken }, { type: "object", properties: { v: arraySchema } })
  assert.deepEqual((normalized as { v: unknown[] }).v, [{ p: "中文" }])
})

test("CL-08 真实故障入参端到端：repairToolInput 还原并过真实 proposeNovelPlanning schema", async () => {
  const broken = '[{"kind":"put","collection":"cards","value":{"id":"c1","title":"标题一"}]}}'
  const input = await repairWith("proposeNovelPlanning", proposeNovelPlanningSchema, planningInput(broken))
  assert.ok(input, "repairToolInput 应返回修复结果")
  const parsed = proposeNovelPlanningSchema.safeParse(input)
  assert.equal(parsed.success, true, `schema 校验应通过：${parsed.success ? "" : JSON.stringify(parsed.error.issues)}`)
})

test("CL-35 双层编码变体：arguments 包裹+operations 字符串化且错乱，解包后仍能修复", async () => {
  const broken = '[{"kind":"put","collection":"cards","value":{"id":"c1","title":"标题一"}]}}'
  const doubleWrapped = JSON.stringify({ arguments: planningInput(broken) })
  const input = await repairWith("proposeNovelPlanning", proposeNovelPlanningSchema, doubleWrapped)
  assert.ok(input, "repairToolInput 应还原双层编码")
  assert.equal(proposeNovelPlanningSchema.safeParse(input).success, true)
})

// ============================================================================
// CL 组：必须不修复（反例，保持原值）
// ============================================================================

test("CL-10 截断在字符串字面量内部：放弃", () => {
  const schema = { type: "object", properties: { v: arraySchema } }
  assert.deepEqual(normalizeToolInput({ v: '[{"a":"正文中途' }, schema), { v: '[{"a":"正文中途' })
})

test("CL-11 截断在数字字面量中间：放弃", () => {
  const schema = { type: "object", properties: { v: { type: "object", properties: { count: { type: "number" } } } } }
  assert.deepEqual(normalizeToolInput({ v: '{"count":123' }, schema), { v: '{"count":123' })
})

test("CL-12 截断在 true/false/null 关键字中间：放弃", () => {
  const schema = { type: "object", properties: { v: arraySchema } }
  assert.deepEqual(normalizeToolInput({ v: '[{"a":tru' }, schema), { v: '[{"a":tru' })
})

test("CL-13 截断在 , 之后 / : 之后：放弃", () => {
  const schema = { type: "object", properties: { v: arraySchema } }
  assert.deepEqual(normalizeToolInput({ v: '[{"a":1},' }, schema), { v: '[{"a":1},' })
  assert.deepEqual(normalizeToolInput({ v: '[{"a":' }, schema), { v: '[{"a":' })
})

test("CL-14 截断在 \\uXXXX 中间 / 转义反斜杠后：放弃", () => {
  const schema = { type: "object", properties: { v: arraySchema } }
  assert.deepEqual(normalizeToolInput({ v: '[{"a":"\\u4' }, schema), { v: '[{"a":"\\u4' })
  assert.deepEqual(normalizeToolInput({ v: '[{"a":"C:\\"' }, schema), { v: '[{"a":"C:\\"' })
})

test("CL-15 仅多余闭合符（rewritten=0）：放弃", () => {
  const schema = { type: "object", properties: { v: arraySchema } }
  assert.deepEqual(normalizeToolInput({ v: '[{"a":1}]]' }, schema), { v: '[{"a":1}]]' })
})

test("CL-16 仅缺失闭合符（rewritten=0, padded=1）：放弃", () => {
  const schema = { type: "object", properties: { v: { type: "object" } } }
  assert.deepEqual(normalizeToolInput({ v: '{"a":1' }, schema), { v: '{"a":1' })
})

test("CL-17 中间缺闭合符（rewritten=0，意图二义）：放弃", () => {
  const schema = { type: "object", properties: { v: arraySchema } }
  assert.deepEqual(normalizeToolInput({ v: '[{"a":{"b":1,"c":2' }, schema), { v: '[{"a":{"b":1,"c":2' })
})

test("CL-18 多层补齐（padded=2）：放弃", () => {
  const schema = { type: "object", properties: { v: arraySchema } }
  // 1 处类型错位 + 尾部缺 2 层闭合（rewritten=1, padded=2）→ 条件 2 拦截
  assert.deepEqual(normalizeToolInput({ v: '[{"a":{"b":1]' }, schema), { v: '[{"a":{"b":1]' })
})

test("CL-19 错乱后容器类型与 schema 不符：放弃", () => {
  const schema = { type: "object", properties: { v: { type: "array", items: { type: "object" } } } }
  // 修出的是 object 而 schema 期望 array → 条件 4 拦截
  assert.deepEqual(normalizeToolInput({ v: '{"a":1]' }, schema), { v: '{"a":1]' })
})

test("CL-20 内层 JSON 合法（#8 场景）：走既有还原路径", () => {
  const schema = { type: "object", properties: { v: arraySchema } }
  assert.deepEqual(normalizeToolInput({ v: '[{"a":1}]' }, schema), { v: [{ a: 1 }] })
})

test("CL-21 普通字符串字段内容像 JSON：不修改", () => {
  const schema = { type: "object", properties: { note: { type: "string" } } }
  const note = '{"a":1'
  assert.deepEqual(normalizeToolInput({ note }, schema), { note })
})

test("CL-22 string|object 联合类型：不修改", () => {
  const schema = { type: "object", properties: { v: { anyOf: [{ type: "string" }, { type: "object" }] } } }
  const v = '{"a":1]'
  assert.deepEqual(normalizeToolInput({ v }, schema), { v })
})

test("CL-23 字符串不以 {/[ 开头：不修复", () => {
  const schema = { type: "object", properties: { v: arraySchema } }
  const v = 'x[{"a":1]'
  assert.deepEqual(normalizeToolInput({ v }, schema), { v })
})

test("CL-24 schema 未声明 object/array：不修复", () => {
  const schema = { type: "object", properties: { v: { type: "string" } } }
  const v = '[{"a":1]'
  assert.deepEqual(normalizeToolInput({ v }, schema), { v })
})

test("CL-31 错位+悬挂 , 截断：修正后 parse 失败被条件 3 拦下", () => {
  const schema = { type: "object", properties: { v: arraySchema } }
  const v = '[{"kind":"put","collection":"cards","value":{"id":"c1"},"x":1,]'
  assert.deepEqual(normalizeToolInput({ v }, schema), { v })
})

test("CL-33 M3 杀伤夹具：字面量内闭合符不得计入 rewritten（rewritten=0 → 拒绝）", () => {
  const schema = { type: "object", properties: { v: arraySchema } }
  const v = '[{"a":"x]y"}'
  assert.deepEqual(normalizeToolInput({ v }, schema), { v })
})

// ============================================================================
// CL 组：已知会放行的形态（如实断言放行，不得写成拒绝）
// ============================================================================

test("CL-25 复合形态（已写错类型+后续截断）：如实放行，op 数少于本意（已知残余）", () => {
  // 依据 docs/235「范围收窄声明」：类型错位与截断原理上不可区分，本形态放行为已知残余，
  // 验证阶段不得把它当 bug 重报；数值截断同类形态（rank:12）一并放行。
  const broken = '[{"kind":"put","collection":"cards","value":{"id":"c1","title":"标题一","content":"正文一"]}'
  const normalized = normalizeToolInput({ v: broken }, { type: "object", properties: { v: arraySchema } })
  const ops = (normalized as { v: unknown[] }).v
  assert.equal(ops.length, 1, "已知残余：解析出的 op 数少于模型本意（本意 2 个）")
  assert.deepEqual(ops[0], { kind: "put", collection: "cards", value: { id: "c1", title: "标题一", content: "正文一" } })
})

test("CL-32 字面量内容含 } 的放行例：字面量内闭合符不得被计入 rewritten", () => {
  // 正确实现 rew=1, pad=1 → 放行；忘记字面量状态的实现会误拒绝
  const broken = '[{"content":"x}y","b":1]'
  const normalized = normalizeToolInput({ v: broken }, { type: "object", properties: { v: arraySchema } })
  assert.deepEqual((normalized as { v: unknown[] }).v, [{ content: "x}y", b: 1 }])
})

// ============================================================================
// CL 组：通用路径覆盖
// ============================================================================

test("CL-26 proposeNovelPlanning.operations（数组）错乱形态可还原", async () => {
  const broken = '[{"kind":"delete","collection":"cards","id":"c9"}}]]'
  const input = await repairWith("proposeNovelPlanning", proposeNovelPlanningSchema, planningInput(broken))
  assert.ok(input)
  assert.deepEqual(input.operations, [{ kind: "delete", collection: "cards", id: "c9" }])
})

test("CL-27 updateCharacter.bigFive（可空对象）错乱形态可还原并规整（生产同源 schema）", async () => {
  const bigFiveSchema = z.object({
    openness: z.number().int().min(0).max(100),
    conscientiousness: z.number().int().min(0).max(100),
  }).nullable()
  const schema = z.object({ characterId: z.string(), bigFive: bigFiveSchema.optional() })
  // 尾部类型错位：object 闭合 } 被写成 ]
  const broken = '{"characterId":"character_1","bigFive":{"openness":"78","conscientiousness":"86"]'
  const input = await repairWith("updateCharacter", schema, JSON.stringify({ characterId: "character_1", bigFive: '{"openness":"78","conscientiousness":"86"]' }))
  assert.ok(input, "repairToolInput 应还原 bigFive")
  // 还原后规整数字字符串
  assert.deepEqual(input.bigFive, { openness: 78, conscientiousness: 86 })
  assert.equal(schema.safeParse(input).success, true)
})

test("CL-28 upsertAttribute.options/targets（数组）错乱形态可还原且元素类型保持", () => {
  const schema = {
    type: "object",
    properties: {
      options: { type: "array", items: { type: "string" } },
      targets: { type: "array", items: { type: "string" } },
    },
  }
  // 数组闭合 ] 错写为 }（类型错位）
  const brokenOptions = '["甲","乙"' + '}'
  const brokenTargets = '["CHARACTER"' + '}'
  const normalized = normalizeToolInput({ options: brokenOptions, targets: brokenTargets }, schema)
  assert.deepEqual(normalized, { options: ["甲", "乙"], targets: ["CHARACTER"] })
})

// ============================================================================
// CL 组：既有行为回归（#8）
// ============================================================================

test("CL-29 既有 9 用例保持通过（复跑关键断言）", () => {
  const bigFive = { openness: 78, conscientiousness: 86, extraversion: 32, agreeableness: 44, neuroticism: 56 }
  // #8 正例：合法字符串化对象仍还原（含全部 5 维字段）
  const schema = { type: "object", properties: { bigFive: { type: "object", properties: { openness: { type: "number" }, conscientiousness: { type: "number" }, extraversion: { type: "number" }, agreeableness: { type: "number" }, neuroticism: { type: "number" } } } } }
  assert.deepEqual(normalizeToolInput({ bigFive: JSON.stringify(bigFive) }, schema), { bigFive })
  // #8 反例：无效 JSON 不臆造（rewritten=0 → 拒绝）
  assert.deepEqual(normalizeToolInput({ bigFive: "{oops" }, schema), { bigFive: "{oops" })
  // #8 反例：联合含 string 不改
  const union = { type: "object", properties: { value: { anyOf: [{ type: "string" }, { type: "object", properties: { a: { type: "number" } } }] } } }
  assert.deepEqual(normalizeToolInput({ value: '{"a":1}' }, union), { value: '{"a":1}' })
})

// ============================================================================
// CL 组：测试期断言（内容未变 / 差分测试）
// ============================================================================

/** 独立参照字面量切分器：逐字符扫描引号/转义、不维护栈、不做补齐。
    与被测栈式扫描器不同构，避免共因盲区；不用 JSON.parse 反推（parse 失败时不可用）。 */
function splitLiterals(text: string): { kind: "literal" | "structure"; text: string }[] {
  const parts: { kind: "literal" | "structure"; text: string }[] = []
  let buffer = "", bufferKind: "literal" | "structure" | null = null
  let inStr = false, escaped = false
  const push = (kind: "literal" | "structure", text: string) => { if (parts.at(-1)?.kind === kind) parts.at(-1)!.text += text; else parts.push({ kind, text }) }
  for (const ch of text) {
    if (inStr) {
      push("literal", ch)
      if (escaped) { escaped = false; continue }
      if (ch === "\\") { escaped = true; continue }
      if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') { inStr = true; push("literal", ch); continue }
    push("structure", ch)
  }
  return parts
}

/** 剔除字面量外的闭合符后得到骨架（结构段只留非闭合符字符）。 */
function skeleton(text: string): string {
  return splitLiterals(text).map(part => part.kind === "literal" ? part.text : part.text.replace(/[{}\[\]]/g, "")).join("")
}

test("CL-30a 内容未变：放行例的字面量段逐字节相同、结构段骨架一致（独立参照切分器）", () => {
  const cases = [
    '[{"kind":"put","collection":"cards","value":{"id":"c1","title":"标题一"}]}}',
    '[{"kind":"put","collection":"cards","value":{"id":"c1","title":"标题一"}]}',
    '[{"content":"x}y","b":1]]',
    '[{"p":"中文内容","q":"a\\"b","r":"C:\\\\"}]',
  ]
  for (const broken of cases) {
    const normalized = normalizeToolInput({ v: broken }, { type: "object", properties: { v: arraySchema } })
    const repaired = (normalized as { v: unknown }).v
    // 字面量段逐字节相同
    assert.deepEqual(
      splitLiterals(broken).filter(p => p.kind === "literal").map(p => p.text),
      splitLiterals(typeof repaired === "string" ? repaired : JSON.stringify(repaired)).filter(p => p.kind === "literal").map(p => p.text),
      `字面量内容被改动：${broken}`,
    )
    // 结构段骨架一致（只允许闭合符差异）
    assert.equal(skeleton(typeof repaired === "string" ? repaired : JSON.stringify(repaired)), skeleton(broken), `结构段内容被改动：${broken}`)
  }
})

test("CL-30b 差分测试：固定种子随机变异，放行例骨架一致且 op 数不增", () => {
  // 固定种子 xorshift32，保证可复现
  let seed = 0x9e3779b9
  const rand = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 0xffffffff }
  const base = '[{"kind":"put","collection":"cards","value":{"id":"c1","title":"标题一","content":"正文一"}},{"kind":"put","collection":"cards","value":{"id":"c2","title":"标题二","content":"正文二"}}]'
  const baseOps = (JSON.parse(base) as unknown[]).length
  const schema = { type: "object", properties: { v: arraySchema } }
  let passed = 0
  for (let i = 0; i < 2000; i++) {
    // 随机注入 1~2 处闭合符变异（替换类型/删除/插入）
    let mutated = base
    const mutations = 1 + Math.floor(rand() * 2)
    for (let m = 0; m < mutations; m++) {
      const pos = Math.floor(rand() * mutated.length)
      const op = Math.floor(rand() * 3)
      if (op === 0) mutated = mutated.slice(0, pos) + (mutated[pos] === "}" ? "]" : "}") + mutated.slice(pos + 1)
      else if (op === 1) mutated = mutated.slice(0, pos) + mutated.slice(pos + 1)
      else mutated = mutated.slice(0, pos) + (rand() < 0.5 ? "}" : "]") + mutated.slice(pos)
    }
    // 仅计入 parse 失败的样本（合法变异走既有 #8 路径）
    try { JSON.parse(mutated); continue } catch {}
    const normalized = normalizeToolInput({ v: mutated }, schema) as { v: unknown }
    const repaired = normalized.v
    if (typeof repaired !== "string") {
      // 放行：骨架一致且 op 数不增
      passed++
      assert.equal(skeleton(JSON.stringify(repaired)), skeleton(mutated), `放行例骨架被改动（变异 #${i}）`)
      assert.ok((repaired as unknown[]).length <= baseOps, `放行例 op 数增加（变异 #${i}）`)
    } else {
      // 拒绝：保持原值
      assert.equal(repaired, mutated, `拒绝例未保持原值（变异 #${i}）`)
    }
  }
  assert.ok(passed > 0, "差分测试出现放行例（下限断言：防删掉新逻辑后空洞通过）")
})

test("CL-30c 元缺陷注入：测试集能抓住三类可观测错误实现", () => {
  // M2 元缺陷（去掉 padded ≤ 1 限制）会被 CL-18 夹具杀死——本测试断言该夹具在 M2 行为下的期望
  // 正确实现下该输入必拒绝（padded=2）；若实现放宽 padded 限制，CL-18 会失败 → 用例集具备判别力
  const m2Killer = '[{"a":{"b":1]'
  const schema = { type: "object", properties: { v: arraySchema } }
  assert.deepEqual(normalizeToolInput({ v: m2Killer }, schema), { v: m2Killer }, "CL-18 夹具必须拒绝（padded=2），M2 放宽实现将在此失败")
  // M1/M3 的杀伤夹具由 CL-32/CL-33 独立用例承担（忘字面量状态 / 字面量内闭合符计入 rewritten）
})
