# 工具入参数组字符串化且内层闭合符错乱 · 测试用例

关联方案：[235-tool-input-container-closer-repair-plan.md](235-tool-input-container-closer-repair-plan.md)（修订 3，终审通过）
关联 issue：https://github.com/mySingleLive/shakeink-desktop/issues/15
执行顺序：用例编写 → [独立用例审核](239-tool-input-container-closer-repair-cases-review.md) → RED（先跑确认全红）→ 实施/GREEN → 独立 code review → 全量验证。

## 被测行为摘要

在 `src/lib/ai/tool-input-repair.ts` 的 `parseEncodedContainer` 内，当字符串以 `{`/`[` 开头但 `JSON.parse` 失败时，执行 `repairContainerClosers`（括号栈修正闭合符）并按 4 条放行条件决定是否采用：

1. 字面量完整性：扫描结束 `inString === false`
2. 错乱信号：`rewritten ≥ 1` 且 `padded ≤ 1`（`dropped` 不参与放行、不设上限）
3. 解析成功
4. 类型一致（沿用 `matchingContainerSchema` 口径）

「内容字符未变」为**测试期断言**（独立参照物、按字面量分段比对），不参与运行时放行。

## 测试文件

- 单元：`tests/unit/tool-input-repair.test.ts`（扩充，既有 9 用例保持不动）
- 单元：`tests/unit/tool-input-container-closer-repair.test.ts`（新增，承载用例 CL-01 至 CL-35 及 CL-30a/b/c）

> 修订记录（2026-10-27）：经[独立用例审核](239-tool-input-container-closer-repair-cases-review.md)有条件通过，已落实 4 处必改（补 CL-31 悬挂逗号反例、补 CL-32/33 元缺陷杀伤夹具、CL-30c 第 2 类元缺陷换成可观测的 M2、CL-30b 增加 parse 失败过滤与放行例数下限断言）与 3 处建议（正例统一补 `deepEqual`、CL-01/02 注明代表真实 5 样本形态、CL-25 扩及数值截断同类形态）。

## 单元用例

### CL 组：真实故障形态（正例，必须修复）

| 编号 | 输入形态 | 断言 |
| --- | --- | --- |
| CL-01 | 真实样本形态 A：尾部 2 处类型错位 + 1 多余闭合符（`rewritten=2, dropped=1, padded=0`）。注：代表真实 5 样本中形态 A（3/5 份，均为 op 数=1） | 还原为合法数组；`operationSchema` 校验通过；op 数 = 1；**`deepEqual` 解析结果与合成期望 ops 数组**（区分「修复正确」与「修复但改了内容」） |
| CL-02 | 真实样本形态 B：1 处类型错位 + 缺 1 层闭合（`rewritten=1, dropped=0, padded=1`）。注：代表真实 5 样本中形态 B（2/5 份） | 还原为合法数组；`operationSchema` 通过；`deepEqual` 与合成期望 |
| CL-03 | 类型错位（尾部 `}}` 写成 `]}`） | 修复并 parse 成功 |
| CL-04 | 类型错位 + 多余闭合符组合 | 修复并 parse 成功；`rewritten ≥ 1`、`padded=0` |
| CL-05 | 类型错位 + 缺失闭合符组合 | 修复并 parse 成功；`padded=1`；还原数组内元素若含数字字符串需继续规整（`deepEqual` 确认修复后 `normalizeToolInput` 递归不中断） |
| CL-06 | 内容含中文、转义引号 `\"`、`\\` 结尾字段的错乱形态 | 修复成功；内容字符完整 |
| CL-07 | 内容含 `\uXXXX` 转义的错乱形态 | 修复成功（不得误判未闭合） |
| CL-08 | 真实故障入参整体（`{"expectedVersion":37,"operations":"<字符串化数组>"}` 经 `repairToolInput` 端到端，含 `parsePlanningToolJson` 入口） | `repairToolInput` 返回修复结果；修复后 `safeParse(真实 proposeNovelPlanning inputSchema)` 通过（用 `planning-tools.ts` 同源 schema 或最小等价 zod schema） |
| CL-35 | 双层编码变体（`{"arguments":"{\"operations\":\"<错乱数组>\"}"}` 包裹）：`parsePlanningToolJson` 解包后仍能修复 | 同 CL-08 端到端断言 |

### CL 组：必须不修复（反例，保持原值）

| 编号 | 输入形态 | 断言 | 拦截条件 |
| --- | --- | --- | --- |
| CL-10 | 截断在字符串字面量内部 | 放弃修复，入参保持原值 | 条件 1 |
| CL-11 | 截断在数字字面量中间（`{"count":123` 原意 12345） | 放弃 | 条件 2（`rewritten=0`） |
| CL-12 | 截断在 `true`/`false`/`null` 关键字中间 | 放弃 | 条件 2/3 |
| CL-13 | 截断在 `,` 之后 / `:` 之后 | 放弃 | 条件 2/3 |
| CL-14 | 截断在 `\uXXXX` 中间 / 转义反斜杠后 | 放弃 | 条件 1 |
| CL-15 | 仅多余闭合符（`rewritten=0, dropped=1`） | 放弃 | 条件 2 |
| CL-16 | 仅缺失闭合符（`rewritten=0, padded=1`） | 放弃 | 条件 2 |
| CL-17 | 中间缺闭合符（`{"a":{"b":1,"c":2` 意图二义） | 放弃 | 条件 2（`rewritten=0`） |
| CL-18 | 多层补齐（`padded=2`） | 放弃 | 条件 2（`padded ≤ 1`） |
| CL-19 | 错乱后容器类型与 schema 不符（schema 期望 array，修出 object） | 放弃 | 条件 4 |
| CL-20 | 内层 JSON 合法（#8 场景，字符串化但可直接 parse） | 走既有还原路径，不触发新逻辑 | 既有前置判据 |
| CL-21 | 普通字符串字段内容像 JSON | 不修改 | 既有前置判据 |
| CL-22 | `string \| object` 联合类型 | 不修改 | 既有前置判据 |
| CL-23 | 字符串不以 `{`/`[` 开头 | 不修复 | 既有前置判据 |
| CL-24 | schema 未声明 object/array | 不修复 | 既有前置判据 |
| CL-31 | 错位 + 悬挂 `,` 截断（如 `[{"kind":"put","collection":"cards","value":{"id":"c1"},"x":1,]`，`rewritten=1, padded=1` 走满条件 1/2 后修正串 parse 失败） | 放弃（终审实测的关键安全网形态：不补出残缺提案） | 条件 3 |

### CL 组：字面量内闭合符夹具（元缺陷杀伤前提）

| 编号 | 输入形态 | 断言 |
| --- | --- | --- |
| CL-32 | 字面量内容含 `}` 字符的**放行例**（如 `[{"content":"x}y","b":1]`，正确实现 `rewritten=1, padded=1` → 放行；若实现忘记字面量状态，字面量内 `}` 会被误计，`rewritten` 变 0 而错误拒绝） | 放行且 `deepEqual` 内容 `x}y` 完整 |
| CL-33 | **M3 杀伤夹具**（如 `[{"a":"x]y"}`，正确实现 `rewritten=0, padded=1` → 拒绝；若实现把字面量内闭合符计入 `rewritten` 则变 1 而错误放行） | 拒绝，入参保持原值 |

### CL 组：已知会放行的形态（如实断言，不写成拒绝）

| 编号 | 输入形态 | 断言 |
| --- | --- | --- |
| CL-25 | 复合形态（已写错类型 + 后续截断），如 `[{"kind":"put",…,"content":"正文一"]}` | **放行**，解析出的 op 数少于模型本意。断言「放行 + `ops.length === 1` + `deepEqual(ops[0], 第一条 op 的期望值)`」（区分「放行且正确重建保留 op」与「放行但内容被改」）。用例注释须引用方案「范围收窄声明」，不得断言为拒绝。注：该家族含**数值截断同类形态**（如 `…"rank":12` + 错位 → 放行且数值与本意不同），验证阶段不得把它误报为新 bug |

### CL 组：通用路径覆盖

| 编号 | 工具 / 字段 | 断言 |
| --- | --- | --- |
| CL-26 | `proposeNovelPlanning.operations`（数组） | 错乱形态经 `repairToolInput` 还原并通过 schema |
| CL-27 | `updateCharacter.bigFive`（可空对象，`{object, null}`） | 错乱形态可还原并规整（schema 构造用**生产同源**方式，规避 zod v4 `toJSONSchema` 偶发缺 key 问题，见方案 235:217） |
| CL-28 | `upsertAttribute.options` / `targets`（数组） | 错乱形态可还原，元素类型保持 |

### CL 组：既有行为回归（#8）

| 编号 | 断言 |
| --- | --- |
| CL-29 | 既有 9 个用例全部保持通过（对象/数组字符串还原、普通字符串不改、无效 JSON 不臆造、联合不改、还原后规整、`repairToolInput` 端到端、错误提示缺失 vs 类型不符、合法输入无提示） |

### CL 组：测试期断言与差分测试

| 编号 | 内容 | 断言 |
| --- | --- | --- |
| CL-30a | 内容未变断言 | 用**独立参照字面量切分器**（测试文件内实现：逐字符扫描引号/转义、不维护栈、不做补齐；与被测栈式扫描器不同构，不得用 `JSON.parse` 反推）把输入与修正串各自切成「字面量段/结构段」交错序列：断言字面量段逐字节相等、结构段差异仅限闭合符位置 |
| CL-30b | 差分测试 | 固定种子随机变异（≥2000 例，注入闭合符替换/删除/插入/截断）。**仅变异后 `JSON.parse` 失败的样本计入语料**（合法变异走既有 #8 路径，不能算新逻辑战绩）。对放行例断言「骨架与原串逐字符一致」+「parse 结果 op 数 ≤ 原 op 数」；对拒绝例断言保持原值。**须加下限断言「放行例数 > 0」**（防「删掉新逻辑也仍绿」的空洞通过；RED 阶段新逻辑未实现时本用例无红信号属预期，实现在即验证） |
| CL-30c | 元缺陷注入 | 语料须包含 CL-32/33 夹具。对错误实现逐一跑测试集断言**每一种都被抓住**：M1 忘记字面量状态（被 CL-32 杀）、M3 字面量内闭合符计入 `rewritten`（被 CL-33 杀）、**M2 去掉 `padded ≤ 1` 限制**（被 CL-18 杀）。注：原「FIFO 补齐」缺陷在任何输入级语料上均**不可杀**（放行要求 `padded ≤ 1`，此时 FIFO≡LIFO，行为不可观测），故替换为可观测的 M2；若要保留 LIFO 顺序验证，用函数级断言：对 `padded ≥ 2` 输入直接断言修正串为 LIFO 顺序（`}}]` 而非 `][]`） |

## 集成与真实系统验证

| 编号 | 层级 | 内容 | 通过标准 |
| --- | --- | --- | --- |
| INT-01 | 集成 | `npm run test`（tests/unit + tests/integration） | 全量通过，无跳过 |
| INT-02 | 类型 | `npm run typecheck` | 通过 |
| SYS-01 | 真实目标系统 | 本机以**本地真实数据根**启动桌面版（标准启动方式，见 build-and-launch skill），让模型修改已接入规划的作品叙事卡，触发 `proposeNovelPlanning` | 不再出现「工具参数无效，本步未执行（operations: 应为数组，实际为字符串）」；提案正常保存为候选（`contentVersion`，targetType=PlanningProposal），当前规划未改变 |
| SYS-02 | 真实目标系统 | SYS-01 之后作者在面板/对话确认采用 | 提案正常落入 `planningDocument`，版本推进 |

## 执行注意

- 用例数据一律为**合成最小样本**（`{"kind":"put","collection":"cards","value":{"id":"c1",…}}` 结构），不得引用真实作品内容、密钥或端点。
- RED 阶段：先写用例跑一遍确认新用例全红（当前代码不修复错乱 JSON），再实施；不得为让用例通过先改实现。
- CL-25 必须如实断言「放行」，这是终审后收窄的已知残余，改写成「拒绝」将复现 235 反例表矛盾（终审 R1）。
- CL-27 的 schema 构造必须与生产路径同源（`tool()` 的 `inputSchema` → SDK 的 `asSchema().jsonSchema`），不得用 `z.toJSONSchema` 直接构造后断言全部字段规整。

## 关联文档

- 方案：[235-tool-input-container-closer-repair-plan.md](235-tool-input-container-closer-repair-plan.md)
- 方案审核链：[237（初审）](237-tool-input-container-closer-repair-plan-review.md) → [238（复审）](238-tool-input-container-closer-repair-plan-review-2.md) → [243（终审）](243-tool-input-container-closer-repair-final-review.md)
- 用例审核：239-tool-input-container-closer-repair-cases-review.md
- 代码审核：240-tool-input-container-closer-repair-code-review.md
- 验证：241-tool-input-container-closer-repair-verification.md
- 总结：242-tool-input-container-closer-repair-summary.md
