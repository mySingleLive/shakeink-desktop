# 499 · 物品资料契约代码审核（497/498）

日期：2026-11-03。范围只含 497：`desktop/service/novel-import-ai.ts`（`itemEntityRequest`、`IMPORT_ITEM_FACT_GUIDANCE`、`semanticResultArtifact`、物品 superRefine）、`desktop/core/novel-import-ai-payload.ts` `semanticPrompt`、`tests/unit/novel-import-item-profile.test.ts`。490/493 改动不在本次审核内。

结论：**需修订（只改测试，生产代码不用改）**。生产代码与 497 §2R 一致，没有发现错误。498 修订节要求的两项断言没有落实，必须补上。

## 已核对、无问题

- **indexed 行为不变。** `indexedEntityRequest` 未改（`novel-import-ai.ts:374`）。物品不满足它，所以 `options` 为 undefined（`:493`），`indexedArtifact` 直接取 `requestedArtifact`（`:501-507`）。物品仍须自己填 `sourceUnitIds`（`min(1)`，且必须属于本次输入，`:498`），应用不派生，也没有 optionIndex。我用临时脚本跑了物品 entity：`sourceUnitIds` 原样返回 `["u-coin"]`，结果里没有 `schema`。`:615/863/881/932` 的场景专用分支仍只认 `indexedEntityRequest`。
- **`semanticResultArtifact`（`:381`）。** 新增的 `itemEntityRequest` 只在 v1 + analyze + entity + item 时为真。review、reconcile、roster、普通 analyze 以及其它类别都走原路径。它的调用点（`:510/513/516/850/870`）只拿结果做校验副本，从不作为返回值。效果是生成期 `validateIdentityLinks`（`:850`）、最终 `validateSemanticLinks`（`:870`）和新 superRefine 都按 schema 2 判断，三处一致。我对普通 item analyze 带面板字段做了探测，仍以原文案“导入语义含未支持的业务字段，不能静默映射”失败。
- **superRefine 分支（`:514-516`）。** 分支沿用 `if(ctx.issues.length)return`，调用同一个校验器，路径为 `['facts']`。反馈是固定字符串，不含模型原值或错误文本。
- **反馈长度与准确性。** `IMPORT_ITEM_FACT_GUIDANCE` 为 231 字符（≤250，`generate.ts:263` 截断上限）。所列 11 个字段等于 `importFactFields('item',2)`，即 v1 知识字段 6 个加 v2 物品字段 5 个（`novel-import-semantics.ts:50-67`）。effects、aliases、tags 的编码描述与 `:175-178` 一致：effects 为 strict `{name,description}`，description trim 后非空；aliases、tags 为字符串数组。
- **提示词契约对照校验器。** effects 最多 20 项，超过时 `max(20)` 拒绝，不会截断；name 允许空串；aliases 最多 10 项每项 ≤50 字、tags 最多 8 项每项 ≤20 字，与 `trimmed` 的静默截断上限一致。提示词比校验器更严，方向正确。契约没有写 name ≤100 字、description ≤2000 字，超限时会进入纠错，可以接受。我在临时副本中执行 `assertImportFixedPromptReserve`，物品 entity 提示通过；契约块 363 字符。
- **控制器与服务一致。** `importEntity` 中 `accept` 给结果加上 `schema:2`，再调用同一个 `validateImportSemanticArtifact`（`desktop/main/novel-import.ts:1050-1055`）。服务端的 schema 2 副本与它字段相同，所以服务端通过时，控制器也一定通过。纠错次数用尽后抛出 `模型返回结构不完整（artifacts.0.facts）`。此时 `received=false`，且 `entitySchemaFeedback`（`:76-87`）不匹配这条消息，控制器不再重试，与 497 §2R.3 一致。控制器对非 indexed 的提示是“sourceUnitIds与evidence.unitId逐字复制”，与物品协议一致。
- **sha256 基线。** 我在临时副本中只回退 497 的 payload 改动（保留 490/493），重算后 5 个哈希与测试常量逐一相同。所以 IC-04 证明了这 5 个提示在 497 前后逐字节相同。注意基线取自“含 490 的 497 前代码”，不是 HEAD：item roster 提示已被 490 修改。这符合本次范围。
- 单文件 6/6 通过，与本地报告的定向回归、tsc、构建结果一致。

## 需修订

### 中-1 IC-02 缺 498 修订节要求的断言（`tests/unit/novel-import-item-profile.test.ts:31-36`）
498 修订节第 2 条要求“第二轮提示含完整固定物品反馈”和“控制器侧只请求 1 次”。
- 现在只断言第二轮提示包含前缀 `物品facts仅允许`（`:34`）。截断或改写反馈不会让测试失败。应改为断言 `prompts[1]` 包含完整的 `facts: `+完整 guidance 字符串（字符串从源复制为测试常量即可）。
- 持续非法时，控制器侧的请求次数和 task `attempts` 没有测试（497 审核中-3 也提出过）。需要补一条控制器级用例：物品 entity 两次生成都失败后，`options.ai` 只被调用 1 次，任务失败，错误文本为固定的结构不完整文案。

### 低-1 “不回显”断言过弱（`:34`）
测试只查未转义的子串 `{"name":"标记"}`。如果原值被 JSON 转义后回显，实际出现的是 `{\"name\":\"标记\"}`，测试查不到。生产代码的反馈是固定串，所以当前没有回显问题，但这条测试证明不了 IC-02 的“无回显”。建议改为在新增部分中断言既不含原值，也不含 `JSON.stringify(原值)` 的转义形式；或者直接断言新增部分等于固定纠错模板。

### 低-2 IC-01 未经过控制器（`:25-29`）
498 IC-01 写的是“经控制器后可映射”。测试是手工加 `schema:2` 后调用 `importNativeMappings`，没有走 `importEntity.accept`。中-1 补控制器用例时，可以一并覆盖成功路径。

### 低-3 IC-04 覆盖面（`:43-53`）
- 基线没有覆盖带 `evidenceOptions` 的角色 entity 提示，也没有覆盖 item review/reconcile 提示。从代码看这些路径不受影响（`itemEntity` 要求 analyze+entity），所以不阻塞。
- 497 审核低-3 要求的“其它类别字段表在物品 entity 提示中逐字不变”没有显式断言。

### 低-4 方案文字与校验器不符（`docs/497-item-entity-profile-contract-plan.md` §2R.4）
§2R.4 写“effects 最多 20 项（超出部分映射时被截断）”。实际上 effects 超过 20 项会被拒绝，只有 aliases/tags 截断。代码和提示都正确，只需改方案文字。
