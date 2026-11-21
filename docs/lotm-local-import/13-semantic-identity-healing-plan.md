# 自愈 H05：实体身份冲突的结构化纠错方案/用例

日期：2026-10-28。状态：待独立审核，尚未修改生产代码。仅处理真实大纲分析中的ID冲突，不处理或消除首叶文学问题。

## 真实失败

rev938接纳首个大纲叶包（47 units/1 artifact），随后rev940/failed：`模型实体标识与原类型或父级身份冲突`。失败批次未新增coverage或artifact，正文hash不变。首叶ID为`outline-main`，名称是特定卷/范围的大纲；后续不同大纲若复用该ID，`validateSemanticLinks`会拒绝。

当前ordinary analyze在`runImportAi`完成模型生成和schema解析后才执行`validateSemanticLinks`。因此`generateJSON`已有的一次结构纠错机制看不到这类身份错误，直接终止整个目标。实体全局唯一、同实体kind/name/父级一致的要求必须保留，不能通过接受冲突或覆盖旧实体自愈。

## 最小方案

修改 `desktop/service/novel-import-ai.ts` 的 `importAiResponseSchema`：

- 对ordinary analyze中除worldline/narrative外的目标，在现有response schema上增加superRefine；仅当前面无issue且本批含artifacts时，调用现有`validateSemanticLinks(request,result.artifacts)`。
- worldline/narrative继续使用已有专用校验与反馈，不重复或改变其行为。
- 校验失败只加入固定文案，不输出原ID、名称、正文、模型配置或Key：不同实体不得复用ID；同一实体须保持kind/name及父级身份一致，新章节/片段大纲使用新ID。
- 让现有generateJSON的一次纠错重生成获得该反馈；两次仍无效则维持失败，绝不接纳冲突结果或增加coverage。后处理`validateSemanticLinks`仍保留作最终防线。

## 定向用例

| ID | 必须满足 |
|---|---|
| LOTM-L-ID01 | 已存在`outline-main`时，首轮返回同ID不同name的outline触发schema身份反馈；第二轮使用新ID且证据/结构有效才成功。走真实generateImportAiJson+generateJSON，仅注入两次合成generateText，断言恰好2次且第二prompt的correction增量包含固定身份/结构/引用反馈；旧实体只在request.entities也覆盖 |
| LOTM-L-ID02 | 两轮都复用冲突ID时抛StructuredGenerationError/invalid_schema；error.message/error.feedback/correction增量不含正文、动态ID或Key（首prompt既有原文目录不作为泄漏） |
| LOTM-L-ID03 | 同ID/kind/name且父级身份一致的增补text/evidence被接受；kind/name/parentId/worldId/settingType变化及同批重复ID拒绝；worldline/narrative各一个有效结果和专用错误保持原反馈/调用次数 |
| LOTM-L-ID04 | controller预置首叶及47coverage，连续冲突时失败批不新增artifact/coverage、不覆盖旧实体、正文hash不变；有效新ID恢复只提交目标批次。既有四类证据错误、角色字段错误、invalid_json/incomplete/network/取消保持原行为 |

固定反馈须覆盖完整 `validateSemanticLinks` 的失败范围：ID/kind/name、父级身份、原生结构及类型引用、作者锁定字段，不能只写“ID冲突”。也可以缩小前置范围，但不复制另一套规则；本方案保留完整前置校验，最终后处理不变。

## 顺序

独立审核 → 新用例实际RED → 最小实现 → 定向GREEN和独立代码审核 → 重建 → 同session/同一完整正文恢复，保留47 units既有coverage并从下一批继续。真实恢复后仍须逐叶语义审核和最终全局review/repair，ID01–04通过不代表文学正确或整书完成。
