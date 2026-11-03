# 498 · 物品资料契约对齐用例

日期：2026-11-03，对应 497。合成名称。

- IC-01 真实服务链：`runImportAi` 物品 entity 返回全套合法面板字段（appearance、acquisition、effects、aliases、tags 及知识归属字段），结果 facts、text、evidence 逐值等于模型输出，`schema` 不被服务端写入；经控制器后 `importNativeMappings` 可映射且无警告。
- IC-02 纠错：生成桥前一轮 effects 为非法结构（对象而非数组，或 description 为空），下一轮合法，可恢复，且第二轮请求带固定物品字段反馈；持续非法时在既有上限内失败，不无界重试。
- IC-03 拒绝：表外字段（如 `price`）、非字符串值仍拒绝；不把非法值清洗为通过。
- IC-04 范围：普通 item analyze（无 intent）仍按 v1 字段表，面板字段被拒绝；character/scene/world entity 的服务端行为与提示逐字不变（sha256 对照改动前）。
- IC-05 提示：物品 entity 提示列出 schema 2 物品字段并含 `<item-native-profile-contract>`；不出现 evidenceOptions/optionIndex 与“sourceUnitIds由应用计算”。
- IC-06 回归：494 IP-07 文件组 + `novel-import-wizard-prompt` 全部通过（CP-13a 既有失败单列），TypeScript 与桌面构建通过。
- IC-REAL：按 494 IP-REAL（含修订节）新 session 真实重跑。

## 审核后的修订（以本节为准）

1. **IC-01** 必须经过 `generateImportAiJson`（真实生成桥，注入 `generateText`），不能只调 `runImportAi` 的 generate 替身。
2. **IC-02** 断言：第一轮非法、第二轮合法时恢复，共 2 次生成调用；第二轮提示含完整固定物品反馈；反馈不含模型原值；控制器侧只请求 1 次。持续非法时 2 次后失败，错误为 `模型返回结构不完整（artifacts.0.facts）`。
3. **IC-07（新增）** 第一轮 facts 含非面板字段 `itemType`，第二轮合法，可恢复。
4. **IC-04** character/scene/world 及普通 item 分析的提示 sha256 基线在实现前从当前代码取，写入测试常量。
5. **IC-REAL** 另记纠错次数（生成调用数大于任务数的差额）。

## 代码审核后的测试补强

审核见 `499-item-entity-profile-contract-code-review.md`（结论：生产代码不改，只补测试）。

1. IC-02 断言第二轮新增提示含完整 `artifacts.0.facts: `+固定物品反馈；不含原值的原样或 JSON 转义形式。
2. 新增 “IC-02 controller” 控制器用例：持续非法的物品只请求 1 次 `options.ai`、生成 2 次，任务 failed、attempts 1、错误为 `模型返回结构不完整（artifacts.0.facts）`；其余 63 项经 `importEntity.accept` 落为 schema 2 并原生映射无警告（覆盖低-2）。
3. 497 §2R.4 文字已改为“effects 超过 20 项即拒绝，aliases/tags 截断”（低-4）。低-3 不阻塞，未新增基线。
