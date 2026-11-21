# 490 方案独立审核（第一轮）

审核对象：`docs/490-item-roster-category-plan.md`。

## 结论摘要

根因判断正确，主修复方向（让模型逐项分类并丢弃非物品）可行。但有三处设计会让修复失效或误删真实物品，需修订后再进入测试用例阶段：

1. 过滤放在 `runImportAi` 里，按单批次判定，没有跨批投票。
2. 方案计划的控制器测试走不到服务层，测不出 2.1 的过滤。
3. 2.2 的同名比对集合没有排除"已判定不是地点"的场景候选。

另外，方案对旧草稿的处理（"重新识别后生效"）与实际代码行为不符。

## 1. 根因核对

- 属实：`desktop/core/novel-import-ai-payload.ts:136` 的 item 契约只有 `{name,aliases,itemType,important}`，没有写什么算物品。截图里的标签就是 `itemType`（`src/components/desktop/NovelImportWizard.tsx:129`）。
- 属实：`keepWizardItem`（`desktop/core/novel-import-wizard.ts:124`）只要出场 ≥3 章就保留。主角、城市、体系名都满足。
- 方案漏写了一个放大因素：`mergeWizardRoster` 合并时 `g.important||=!!e.important`、`g.itemType??=e.itemType`（`novel-import-wizard.ts:109`）。任何一批标了 `important:true`，整组就保留，`itemType` 取最先出现的那一批。这个"一批说是就算是"的规则，2.1 的 category 会再踩一次（见 2.1）。

## 2. 逐项审核

### 2.1 category 字段与 runImportAi 过滤

- **单批丢弃没有投票，主角这类高频名称很可能仍然漏进清单。** 物品清单按批并发识别（`desktop/main/novel-import.ts:565-585`）。主角、城市每批都出现，只要有一批把它判成 `item`，这一条就进入暂存（stash）。之后 ≥3 章规则会保留它。批次越多，至少一批判错的概率越高。建议：
  - 把 `category` 作为可选字段带进暂存：`novel-import.ts:575` 的字段拷贝、`desktop/core/novel-import-wizard-state.ts:65` 的 strict schema、`desktop/core/novel-import-semantics.ts:40` 的 `ImportRosterEntry`、`novel-import-wizard.ts:79` 的 `WizardRosterEntry` 都要加。
  - 在 `mergeWizardRoster` / `buildWizardCandidates` 里按组计票，例如非 item 票数 ≥ item 票数就丢弃。没有 category 的旧条目视为未知，不参与计票。
  - 这也让"暂存与草稿 schema 不变"这条不再成立，方案要改写这一句。
- **计划中的控制器测试走不到服务层。** `tests/helpers/novel-import-wizard-fixture.ts:39` 注入的 `ai` 直接把假结果交给主进程，不经过 `runImportAi` 和 zod 校验。所以第 4 节"fixture 返回混合类别，第13步只含物品"这条测试，在过滤留在服务层时必然失败。只有把判定移到 core（上一条建议）才测得到。否则只能在服务层用 `runImportAi` 单测覆盖。
- **单批失败会让整个第13步失败。** category 必填且 strict。`generateJSON` 默认 `maxGenerations=2`（`src/lib/ai/generate.ts:190`），两轮内某批仍有一项缺失或取值非法，这批就失败，`stop()` 会让整步变成 failed（`novel-import.ts:584`）。方案要写明接受这个风险，或者改为"非法值走纠错、仍失败的单项按非物品丢弃"。真实验证时要记录失败批次数。
- **主进程阶段白名单不受影响。** 主进程（`novel-import.ts:1515`）和服务层（`desktop/service/novel-import-ai.ts:835-836`）都只允许 `roster` 字段。过滤后清单为空也合法。暂存拷贝是按字段挑选的，带不带 `category` 都不会触发 strict 拒绝。
- **方案担心的几处遗漏调用点都不存在。**
  - 结构化输出：`jsonOutputSchema` 只用于场景清单和结构化场景（`novel-import-ai.ts:595,720`）。item 清单走纯文本 JSON，没有 wire schema 要同步改。
  - 遗漏补全：复核提出的新 item 遗漏直接丢弃（`novel-import.ts:937`）；非向导的补全走 artifacts 路径（`:1737-1748`），不经过 roster。
  - 场景清单整理：`sceneIdentityCleanupPrompt`（`novel-import-ai-payload.ts:72`）和 `sceneRosterPrompt`（`:103`）是独立函数，不受影响。
- **字段错误的标签代码不需要改。** `novel-import-ai.ts:772` 遇到非 character 请求会原样抛出错误，item 现在就这样处理，不是回归。可以按需补 item 标签，不是必须。
- **提示预算余量充足。** 实测 item 清单的固定提示为 5071 字节，上限 65536 − 16384 = 49152 字节。

### 2.2 与已识别角色、场景同名的条目

- **必须排除 `sceneExcluded` 的场景候选。** 场景清单整理的 `drop` 动作语义就是"不是具体地点（人物、组织、物品…）"（`novel-import-ai-payload.ts:73`），对应候选带 `sceneExcluded:true`（`desktop/core/novel-import-scene-identity.ts:11`）。方案要求"不论是否勾选"全部纳入，就会把整理阶段认定为物品的名称拿去排除物品，结果正好相反。建议也排除 `sceneIdentityState==='unresolved'` 的候选。
- **未勾选的角色要不要纳入，需要明确取舍。** 作者取消勾选角色，可能是因为它其实是物品（模型把封印物列成了人物）。方案应写明取舍并给出测试。保守做法是只用已勾选的角色，加上未被排除的场景。
- **别名污染的风险没有写进方案。** 候选的 aliases 来自模型，最多 50 个（`novel-import-wizard.ts:113`）。称号类别名（如"愚者"）与同名物品精确冲突时，物品会被排除。概率低，但应写进风险，并补一条测试。
- **角色或场景步骤被跳过时的行为没有写明。** 未选该类别时，对应 `candidates` 不存在，过滤自然不生效，只靠 2.1。方案应写明这一点并补测试。
- **返回修改选择后比对集合可用，资料来源规则也对。** 返回到 detect-item 时会保留角色和场景候选（`novel-import.ts:1126`），比对集合在。资料来源豁免用 `hits.length>0`，和 `keepWizardItem` 的 fromSource 一致。

### 2.3 旧草稿

- **"第13步重新识别后生效"不成立。** 清单生成后，`roster:item` 的覆盖记录（coverage）仍然完整，暂存已删除（`novel-import.ts:602`）。此时调用 `wizard-redetect`（主进程允许，见 `:439`）会得到空队列和空暂存，清单只剩资料文件条目，正文识别的物品全部丢失。UI 只在失败或清单为空时显示"重新识别"按钮（`NovelImportWizard.tsx:112,117`）。真正能重算的路径是"返回修改选择 → 识别物品"：这一步会删除 item 候选和 `roster:item` 覆盖记录（`novel-import.ts:1133-1135`）。方案应改写这条说明。另外，等待状态下 redetect 清空正文物品是一个已有缺陷，可另开问题记录。
- **识别中途的草稿会混入未过滤条目。** 中断后恢复时，已覆盖批次的旧暂存没有 category，也不会重跑。如果过滤只在服务层，这些条目不会被过滤。改为 core 计票后，可以按"未知"处理，并补一条测试。
- `rosterFound` 进度计数（`desktop/core/novel-import.ts:407`）若改为 core 过滤，应与清单使用同一判定，避免运行中显示的数量与最终清单不一致。

### 测试计划缺口

- `tests/unit/novel-import-roster-ai.test.ts:42-43` 的 RA-07 item 用例没有 category，新 schema 下会失败，需要更新。
- `tests/unit/novel-import-wizard-prompt.test.ts:12` 的 WP-01 要在 item 字段中加入 `category` 和各取值。WP-04（roster 测试文件 `:74`）禁止 roster 固定提示含有 `evidence`、`quote`、`逐字`，新增的物品定义文案要避开这些词。
- 仓库里没有针对角色和世界观清单提示的字节一致性测试。"其它提示不变"要用新测试锁定：改动前捕获 character 和 world 的清单提示，断言改动后完全相等。
- 方案没有提到更新 `docs/requirements-traceability.json`，AGENTS.md 要求更新。

## 结论：需修订

必须修改：

1. 把 category 判定从 `runImportAi` 的单批丢弃改为跨批计票：category 作为可选字段进入暂存和草稿 schema，在 core 合并时按组判定，缺省视为未知。改写"暂存与草稿 schema 不变"。
2. 按第 1 条的落点重写控制器测试。如果坚持服务层过滤，就改为 `runImportAi` 单测，并删除那条注定失败的 fixture 控制器用例。
3. 写明 category 必填导致单批两轮纠错失败、进而整步失败的处理办法（接受或单项降级），并在真实验证中记录。
4. 2.2 的比对集合排除 `sceneExcluded` 和 unresolved 的场景候选，明确未勾选角色的取舍，补充步骤跳过和称号别名冲突的测试。
5. 改写旧草稿说明：生效路径是"返回修改选择 → 识别物品"，不是"重新识别"。补一条中途恢复（暂存缺 category）的测试。
6. 更新 RA-07 和 WP-01，新增 character/world 清单提示的字节一致性测试，新文案避开 WP-04 禁止的词。
7. 在实施步骤中加入 `docs/requirements-traceability.json` 的更新。

我没有修改任何文件。唯一执行的是一个写在 /tmp 的临时脚本，用来测量提示字节数。
