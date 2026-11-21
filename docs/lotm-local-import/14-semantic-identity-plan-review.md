# 自愈 H05 方案独立审核

日期：2026-10-28。审核者：独立子代理 `agent-0`（只读），未修改文件、未运行应用/模型/测试、未读取Key。

## 结论与补强

初审有条件通过。`superRefine → parseJsonOutput.feedback → StructuredGenerationError → 第二次generate correction` 的真实链路可让provider看到身份错误，方向与最小范围正确。必须补强的内容已纳入13：

1. 固定反馈覆盖完整validateSemanticLinks：ID/kind/name、父级身份、原生结构、类型引用及锁定字段，避免用“ID冲突”误导其他失败。
2. ID01/02必须走真实generateImportAiJson+generateJSON的两次生成，检查correction增量；首prompt已有原文/目录不算泄漏，不能错误要求整个prompt无正文。
3. 增加controller层的失败批不接纳与有效恢复断言，service测试本身不能证明coverage不变；可信entities目录与有界provider上下文分开覆盖。
4. 合法同ID/kind/name增补必须被接受，kind/name/parent/worldId/settingType变化及同批重复ID仍拒绝。
5. worldline/narrative有效/专用错误、四类证据错误、角色字段、invalid_json/incomplete/network/取消用具体案例冻结，而非只写“不变”。

满足后可进入RED/TDD；审核不代表真实整书或首叶文学通过。
