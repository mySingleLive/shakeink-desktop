# 501 · 物品引文选项用例

日期：2026-11-03，对应 500。合成名称。

- IE-01 选项生成：控制器真实路径，每个物品 entity 请求带 1–8 个 `entityTarget.evidenceOptions`，每项 unitId 属于本次 units 且 quote 是该单元原文连续片段并含物品名或别名。
- IE-02 编号引用：真实生成桥，模型 evidence 只写 `{optionIndex:0}`，结果 evidence 恢复为该选项的 unitId/quote，sourceUnitIds 由应用派生，facts/text 逐值不变。
- IE-03 引文纠错：控制器真实路径，第一轮 evidence 为不存在的 quote（no-match），第二轮编号引用合法，任务 done，请求恰 2 次，第二轮提示含固定引文反馈且要求编号引用；持续 no-match 时在既有上限内失败。
- IE-04 拒绝：越界/小数/字符串 optionIndex、混用 optionIndex 与 quote、伪造 quote 仍拒绝，不被替换为合法引文。
- IE-05 范围：角色、场景、世界 entity 与普通物品分析的提示 sha256 与 497 实现后相同（以本方案实现前取值为基线）；物品 entity 提示含 evidence-options 契约与 `[{optionIndex}]`，不含角色专属资料契约和 roleType 要求。
- IE-06 反转：494 IP-06 中“物品请求不带 evidenceOptions、纠错提示要求复制 sourceUnitIds”的断言改为本方案的预期，其余 IP 用例不变。
- IE-07 回归：494/498 文件组、`novel-import-evidence-batches`、`novel-import-character-*` 全部通过（CP-13a 既有失败单列），TypeScript 与桌面构建通过。
- IE-REAL：按 494 IP-REAL（含修订节）新 session 真实重跑。

## 审核后的修订（以本节为准）

1. **显式反转。** CP-11b 中物品 `{optionIndex:0}` 由拒绝改为解析成功并恢复该选项；498 IC-05 的“物品提示无 optionIndex/无 sourceUnitIds由应用”由 IE-05 取代。
2. **IE-01 补充。** 发给模型的 payload 中 `entityTarget.evidenceOptions[i].optionIndex===i`（经 `serializeImportAiPayload`）。
3. **IE-05 补充。** 物品带选项的提示含 `每项evidence优先引用提供的optionIndex` 与 `sourceUnitIds由应用从已核验evidence计算`，不含 `角色roleType必须等于entityTarget.roleType`。增加两个基线：角色+选项 `e197874f…2476`、场景+选项 `48468a94…71ee`（`/private/tmp/shakeink-item-493/prompt-baseline-500.txt`），连同原 5 个基线逐字不变。
4. **IE-08（新增）服务端反馈。** 物品 no-match 的生成期反馈含“本物品已有核验引用选项”，不含“本角色”。
5. **IE-03 补充。** 断言第二轮请求仍带 evidenceOptions（服务端编号引用对物品生效的前提）。
