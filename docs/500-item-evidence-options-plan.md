# 500 · 物品引文选项方案

日期：2026-11-03。来源：496 item-perf-r2，“占卜家魔药”以 `模型证据无法定位（no-match）` 失败。用户选择：物品 entity 使用与角色、场景同类的已核验引文选项。

## 1. 已证原因

| 位置 | 事实 |
| --- | --- |
| `desktop/main/novel-import.ts:1040` | 只有 `indexed`（角色/场景）才生成 `evidenceOptions`；物品由模型自行抄写 unitId/quote。 |
| `desktop/main/novel-import.ts:77,1058` | 控制器单次纠错对 no-match 等四类引文错误的白名单只对 `indexed` 开放；物品引文错误直接失败。 |
| `desktop/service/novel-import-ai.ts:374,493-506` | `optionIndex` 线格式、sourceUnitIds 派生只对 `indexedEntityRequest`（角色/场景）启用。 |

角色 r5（docs/246）曾因同类 no-match 失败，增加引文选项与编号引用后解决。

## 2. 修改：物品进入既有 indexed 协议

把物品加入现有“indexed”实体协议，复用角色/场景的同一实现，不新增机制：

1. 服务端 `indexedEntityRequest` 包含 item。由此物品获得：`optionIndex` 线格式（`:493-497`）、sourceUnitIds 由已核验 evidence 派生（`:501-506`）、带编号提示的引文纠错反馈（`:932-933`，“本场景/角色”改为按类别取名）。场景专属分支（`kind==='scene'` 判断）不受影响；角色专属分支用 `characterEntityRequest` 不受影响。497 新增的 `itemEntityRequest` 分支保留，用于 schema 2 资料校验；`semanticResultArtifact` 已覆盖。
2. payload `entityTarget` 选项编号（`novel-import-ai-payload.ts:32`）包含 item。
3. 控制器 `indexed=kind==='character'||kind==='scene'||kind==='item'`：生成 `characterEvidenceOptions`（同一函数，按名称/别名截取最多 8 个真实片段）、开放四类引文错误的单次纠错、纠错提示改为“sourceUnitIds由应用计算”。493 的 `trimmed` 合并回 `indexed`。
4. 提示词：物品 entity 使用与角色相同的引文规则文字（`entitySourceRule`、evidence-options 契约、输出契约中的 `[{optionIndex}]`、sourceUnitIds 由应用计算）。实现为把这几处的 `characterEntity` 条件扩展为 `characterEntity||itemEntity`，角色专属的资料契约与 roleType 文字不扩展。

不改：严格定位器与接受集合（坏 quote 不清洗）、纠错上限、角色/场景/世界及普通分析的提示字节、497/493 改动。

## 3. 验证

先独立审核方案与用例，再 RED/GREEN、代码审核、受影响回归（含 494/498 全部用例，IP-06 关于“不带 evidenceOptions、提示要求复制 sourceUnitIds”的断言按本方案反转）、类型检查与构建，然后新 session 真实重跑。r1、r2 失败结论保留。

## 2R. 独立审核后的修订（以本节为准，覆盖第2节冲突部分）

审核见 `500-item-evidence-options-plan-review.md`。§1 行号更正：引文纠错白名单在 `novel-import.ts:76-78`。

1. **既有用例反转。** `novel-import-character-source-index.test.ts:65-66`（CP-11b）断言物品 `{optionIndex:0}` 被拒绝；本方案后改为正向断言（解析为该选项）。同测试中无选项、普通分析与混用/越界负例保留。498 IC-05 的 optionIndex 负例同样反转（已在测试注释说明，501 列为显式反转）。
2. **物品专用输出契约（覆盖第2节第4条中 `entityOutputContract` 的改法）。** `payload.ts:142` 两个现有分支都含“角色roleType必须等于entityTarget.roleType”。物品 entity 使用第三个分支：与角色分支同样的 `[{optionIndex}]`/`[{unitId,quote}]` 选择和“sourceUnitIds由应用计算”，但不含 roleType 句。角色分支与原非角色分支（场景、世界、普通分析）字节不变。`entitySourceRule`、`evidenceOptionsContract`（`:121`）、`:148` 末尾两句（“每项evidence优先引用提供的optionIndex…”“sourceUnitIds由应用从已核验evidence计算…”）的条件由 `characterEntity` 扩为 `characterEntity||itemEntity`；专用角色提示（`if(characterEntity){…}`）不变。
3. **引文反馈类别名。** `importEvidenceFeedback`（`service:932-933`）“本场景/本角色”改为按 kind 取“场景/物品/角色”。
4. **`semanticResultArtifact`。** 实现后 `||itemEntityRequest(request)` 变为冗余，删除以免两处判定。
