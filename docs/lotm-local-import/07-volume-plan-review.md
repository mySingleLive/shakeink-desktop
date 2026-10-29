# 自愈 H03 方案独立审核

日期：2026-10-28。审核者：独立子代理 `agent-0`（只读）。未修改文件、未运行模型/应用/测试、未读取 Key。

## 结论与必须补强项

初审为**有条件通过**。真实 `choose → save → encodeImportJournal → importVolumeGroups` 失败定位准确，草稿局部容忍重复未归属、人工只补来源未命名卷、正式 UI 增加卷名输入的方向可行。审核要求三项补强，已纳入 `06-volume-healing-plan.md`：

1. 仅 encode 放宽与发布严格不足，否则无效草稿会先消耗模型请求。`start` 必须在 prepareReviewPolicy、analysisGrant、正文工作副本及任何 AI 调用前进行默认严格分组检查；start/resume/retry 的未解决组 AI=0。
2. 人工新卷不得与任何来源卷或另一人工组重名，覆盖前一个及未来来源卷；否则相邻同名可能被静默合并。组内继承与再次确认不受影响。
3. V01 必须用首次 choose 精确复现修复前仅 `.owner` 无 session 的失败，V04 必须断言“愚者”“番外”进入正确 cut.volume，而非只检查 action 类型。

审核确认：可选开关默认关闭、真实卷名连续性不变、legacy 路径不经过新逻辑、V05 在同一指定原件且11目标分析前执行，均为必要边界。反对全局允许重复 undefined、删除 encode 校验或自动编造卷名。

主代理已补齐上述方案与用例，可以进入定向 RED/TDD；本审核不是修复或实测通过证据。
