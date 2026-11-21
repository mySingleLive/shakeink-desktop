# 自愈 H03：整书草稿卷分组与人工卷名方案/定向用例

日期：2026-10-28。状态：待独立审核，尚未修改生产代码。仅处理本次指定整书在真实前置流程暴露的卷章缺陷，不扩展到其他导入功能。

## 真实失败与边界

- 原生 macOS 选择器因 `osascript` 无辅助功能权限而阻塞；此项不伪造 PASS。受控回退明确使用实际 Electron 主进程的受控选择结果，只用于继续验证其余链路。
- 受控回退选择指定原文件后，`desktop:novel-import` 在首次 `NovelImportController.choose → save → encodeImportJournal → importVolumeGroups` 失败：`卷归属必须按原文连续排列，不能回到之前的卷`。真实 stderr 见私有 `driver-controlled-2.log`。
- 新草稿 UUID `b61a26f1-aa66-4c15-accd-4b03f966236a` 仅有 `.owner`，无 `session.json`；未进入来源页、未发送模型请求、未发布或写作品数据库。该失败原件保留，不删除冒充成功会话。
- 静态与本次输入另有两项已确认缺口：第八卷缺少显式卷标题；八篇番外标题不形成自动章界。当前 `deriveImportVolumeCuts` 不允许人工补充来源未命名的卷，ChaptersScreen 也没有卷名输入。最终验收仍要求9卷1402章，不能以“导入内容”占位通过。

## 最小技术方案

### 1. 草稿允许重复未归属，发布严格性不变

修改 `desktop/core/novel-import-chapters.ts` 的 `importVolumeGroups`，增加默认关闭的可选 `allowRepeatedUnassigned`：

- 默认行为完全不变，任何重复分组（包括 undefined）仍拒绝。
- 仅 `desktop/main/novel-import.ts` 的 `encodeImportJournal` 在 chapterVersion=2 的检查点结构校验中开启该选项，使自动分类尚未人工核对的多个未归属段可以保存和恢复。
- 重复的真实卷名仍在草稿阶段拒绝。`desktop/service/novel-import-publish.ts` 继续以默认严格模式调用，不开启选项；发布前未解决分组仍按原合同拒绝，不能借草稿容忍进入正式作品。
- `start` 在 `prepareReviewPolicy`、analysisGrant、正文工作副本和任何 AI 调用之前，以默认严格模式检查 chapterVersion=2 分组；`resume/retry` 通往正文分析时仍汇聚到同一门槛。重复未归属可编辑草稿，但不能开始/恢复正文分析，AI 调用数必须为零。

### 2. 人工在明确章界补卷名，正文不动

修改同文件 `deriveImportVolumeCuts`：

- 已检测到的来源卷名仍是权威边界；手工值与来源卷名不同继续拒绝，已有卷标题不得覆盖。
- 对检测值为 undefined 的章界，允许手工提供合法卷名。该显式人工分组从当前章开始，在连续且检测值仍为 undefined 的后续章节继承，直到下一个来源命名卷或下一个人工命名组。
- 进入新的来源命名卷时清除人工继承，避免跨卷泄漏。未提供人工名时保持 undefined 和原诊断，不自动猜第八卷或番外名称。
- 不同人工组的名称不得与任何来源卷名或另一人工组重名，包括前一个或未来来源卷；同组继承及已保存结果的再次确认不受影响，避免相邻同名被静默合并。
- 仍要求手工章界保留所有来源卷边界；非连续返回同名组由严格发布校验拒绝。legacy chapterVersion 的路径与既有指纹不变。

### 3. 正式 UI 可表达人工卷归属

修改 `src/components/desktop/NovelImportDialog.tsx` 的 ChaptersScreen：每章增加可选卷名输入，aria-label 为 `第 N 章卷名`，maxLength=300。用户只需在第八卷首章输入“愚者”、番外首章输入“番外”；提交沿用同一 `set-chapters` action，由核心在提交后传播后续归属。卷章起点、标题、正文切片和现有按钮不变。

## 定向用例（只跑本修复必要回归）

| ID | 必须实现的断言 |
|---|---|
| LOTM-L-V01 | 用首次 `choose` 精确复现 `命名卷 → 未归属 → 命名卷 → 未归属`：修复前保存失败且仅 `.owner` 无 session；修复后同一草稿可 save/reopen；重复真实卷名仍 RED；未解决组 start/resume/retry 不进入分析且 AI=0；发布默认严格分组仍拒绝 |
| LOTM-L-V02 | 缺卷标题的章号重启可人工命名并向后继承；番外自定义章界可命名并继承；遇到下一个来源卷名即停止继承；正文逐字、章界/标题/顺序不变；已保存结果再次提交保持一致 |
| LOTM-L-V03 | 未提供人工名保持原 undefined/诊断；覆盖来源卷名、与前/后来源卷或另一人工组重名、移动/删除来源卷边界、非法卷名及非连续同名组继续拒绝；legacy golden 不变 |
| LOTM-L-V04 | 正式 ChaptersScreen 显示可选卷名，填写的“愚者”“番外”进入正确 cut.volume 并由原 set-chapters 提交；已有人工继承结果原样再次提交保持同组；现有 NI-U01 与 LOTM-V01/V02/V03/V05 必要回归保持 |
| LOTM-L-V05 | 修复后重新选择同一指定 TXT，完成来源/编码/范围核对；自动1394章且番外并章的原始状态保留为 RED，人工9卷1402章提交成功；全程原文件SHA不变 |

## TDD与验收顺序

1. 独立审核本方案与用例。
2. 先新增/调整上述定向测试并实际运行取得 RED；保留旧测试假设，不为转绿删除边界。
3. 最小实现上述三处生产改动，运行 V01–V04 和明确必要的旧卷章/UI回归；执行 `npm run typecheck`。
4. 独立代码审核，重点检查默认严格性、legacy指纹、继承边界、正文不变和UI action。
5. 重建真实 Electron，以同一指定文件重跑 V05；成功后才恢复后续11目标流程。受控回退不计原生选择器通过，原生项仍待权限可用的真实复验。
