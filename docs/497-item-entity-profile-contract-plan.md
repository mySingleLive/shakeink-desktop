# 497 · 物品资料契约对齐方案

日期：2026-11-03。来源：496 真实运行 item-perf-r1 中，“钞票”任务以 `导入语义含未支持的业务字段，不能静默映射` 失败。用户选择：物品 entity 使用完整面板字段契约（与角色、场景同类）。

## 1. 已证原因

| 位置 | 事实 |
| --- | --- |
| `desktop/main/novel-import.ts:1050` | 控制器把物品结果写成 `schema:2`，并用 `validateImportSemanticArtifact` 校验；schema 2 允许 appearance/acquisition/effects/aliases/tags（`desktop/core/novel-import-semantics.ts:63`）。 |
| `desktop/service/novel-import-ai.ts:378` | `semanticResultArtifact` 只对 character/scene entity 加 `schema:2`；物品在服务端按 v1 字段表校验，只允许知识归属字段（`novel-import-semantics.ts:56`），`:184-185` strict 模式拒绝表外字段。 |
| `desktop/service/novel-import-ai.ts:842-846,1062` | 生成期 `validateIdentityLinks` 把校验失败的条目移入“仅目录”，不产生纠错反馈；最终 `validateSemanticLinks` 才抛出原始错误，所以既不进入生成纠错，也不进入控制器单次纠错（`novel-import.ts:1058`，`received=false`）。 |
| `desktop/core/novel-import-ai-payload.ts:116` | 提示词只为角色 entity 换用 schema 2 字段表；物品只看到 v1 字段，未被告知面板字段及其 JSON 编码。 |

## 2. 修改（只作用于 semantic v1 / analyze / entity / item）

1. 服务端新增 `itemEntityRequest`。`semanticResultArtifact` 对它同样加私有 `schema:2` 验证副本，返回值不变（控制器继续自行赋 `schema:2`）。
2. 生成期对物品 artifact 增加与场景同类的 `superRefine`：用 schema 2 跑 `validateImportSemanticArtifact`，失败时给出固定中文反馈（允许字段名及 effects/aliases/tags 的 JSON 编码），进入既有生成纠错（不改上限）。不回显模型原文或任意错误文本。
3. 提示词：物品 entity 的 `factFields.item` 用 `importFactFields('item',2)`，并追加 `<item-native-profile-contract>`：appearance/acquisition 为文本；effects 为 `[{name,description}]` 的 JSON 字符串（最多 20 项，description 非空）；aliases、tags 为字符串数组的 JSON 字符串；未知省略，不复制示范作为资料。其它类别与普通分析的提示逐字不变。
4. 不改：`indexed` 相关行为（引文选项、sourceUnitIds 派生、no-match 白名单）、v1/v2 字段表本身、控制器、并发与 493 全部改动。

## 3. 验证

先独立审核本方案及用例，再 RED/GREEN、代码审核、受影响定向回归、类型检查与构建，然后按 494 IP-REAL 新 session 重跑真实计时。item-perf-r1 失败结论保留。

## 2R. 独立审核后的修订（以本节为准）

审核见 `497-item-entity-profile-contract-review.md`。

1. **根因口径。** 证据未保存“钞票”的原始响应，只能确定含表外字段，不能确定是哪个字段（可能是 `itemType` 等非面板键）。补面板字段只减少此类输出；兜底的是新增的生成期纠错。该失败与 493 无关，493 之前同样的响应也会失败；关闭 thinking 是否提高发生率没有证据。
2. **反馈长度与路径。** 生成期每条反馈被截为 250 字、最多 6 条（`src/lib/ai/generate.ts:263`）。物品固定反馈 ≤250 字，路径 `['facts']`；沿用 `if(ctx.issues.length)return` 与 `validateImportSemanticArtifact(semanticResultArtifact(...))`。新检查直接进入生成纠错，无需白名单。
3. **纠错上限。** 物品无 repair，`maxGenerations` 默认 2（`generate.ts:190`），即最多纠错一次。用尽后错误为 `模型返回结构不完整（artifacts.0.facts）`，控制器 `entitySchemaFeedback` 不匹配，不再重试。本方案不扩大上限。
4. **提示上限。** 物品资料契约写明 aliases 最多 10 项每项 ≤50 字、tags 最多 8 项每项 ≤20 字、effects 最多 20 项（超过即拒绝；aliases/tags 超出部分映射时截断）。
