# 496 · 导入物品提速真实验证记录

日期：2026-11-03。对应 493/494。**未通过：首轮真实运行在第14步出现非瞬时失败，没有完成全部物品，未得到 30 秒成绩。**

## 本地结果

| 检查 | 结果 |
| --- | --- |
| 新增物品性能用例 IP-01…IP-06 + CP-16a/b/c item | 改动前 0/14（`/private/tmp/shakeink-item-493/red-2.txt`），改动后 14/14 |
| 受影响定向组（13 个文件） | 172/173；唯一失败 CP-13a 在干净 HEAD `b26975f` worktree 上同样失败，属既有问题（`cp13a-baseline.txt`） |
| TypeScript `--noEmit`、`build:desktop`、`git diff --check` | 通过 |

## 真实运行 item-perf-r1

macOS Electron（LotmVerification.app）、已配置 DeepSeek、原件只选第一卷（213 章），角色 133、场景 380、物品 133 默认全选，未开启物品图标。私有证据：`/private/tmp/shakeink-item-493/evidence/item-perf-r1/`。

- 第13步识别物品 28112 ms。
- 06:30:05.486 点击“导入 133 个物品”；约 3 s 后 31 路在途（runtime 记录 31 pending）。
- 5232 ms 时任务“钞票”（itemType 货币）失败：`导入语义含未支持的业务字段，不能静默映射`。此前 10 个请求已返回、8 项已落盘。驱动按约定暂停并保留现场，exit 2。

## 原因

`desktop/service/novel-import-ai.ts:378` 只对 character/scene 以 schema 2 校验 entity 结果；item 结果按 v1 字段表校验（`desktop/core/novel-import-semantics.ts:56`，item 只有知识归属字段），`:184-185` 在 strict 模式下拒绝任何其它字段。item 提示词同样只给出 v1 字段表，未告知面板字段 appearance/acquisition/effects/aliases/tags；模型返回了表外字段即整项失败。该错误发生在服务端，`importEntity` 的单次纠错不覆盖（`desktop/main/novel-import.ts:1058`），任务直接失败。

这正是 493 第5节记录的既有风险。关闭 thinking 后模型更可能自行补字段，但本轮未对照 thinking 开启时的行为，不据此断言因果。

## 结论

提速机制在真实环境生效（31 路在途、首批约 3 s 返回），但物品资料契约缺口使整批不能完成。要达到验收，需要让 item entity 使用与角色/场景同类的 schema 2 字段契约（提示词、服务端校验与有限纠错），属于超出 493 范围的资料契约修改，待用户决定后另立方案、先审后改。

## 真实运行 item-perf-r2（497 物品资料契约之后）

同一隔离根、新 session。角色 129、场景 452、物品 123 默认全选，未开启图标。私有证据：`/private/tmp/shakeink-item-493/evidence/item-perf-r2/`。

- 第13步识别物品 25107 ms。07:39:54.101 点击“导入 123 个物品”，约 3 s 后 31 路在途。
- 11029 ms 时已提交 39 项、32 个请求返回成功；任务“占卜家魔药”失败：`模型证据无法定位（no-match）`。驱动暂停并保留现场，exit 2。
- 已提交的 39 项全部带面板字段（aliases 39、appearance 35、acquisition 33、effects 30、tags 26），497 的字段契约在真实模型上生效，r1 的“未支持的业务字段”未再出现。

**原因：** 物品 entity 不提供已核验引文选项，模型自行抄写 quote；`entitySchemaFeedback` 的 no-match 纠错只对 `indexed`（角色/场景）开放（`desktop/main/novel-import.ts:77`），所以物品引文错误直接失败。这是 493 第5节记录的第二项风险。

**结论：** 未通过。按 11 s 完成 39 项的速度，123 项约 35 s，接近但不确定能否在 30 s 内；没有完整轮次，不能判定。

## 真实运行 item-perf-r3（500 物品引文选项之后）——**通过**

同一隔离根、新 session，构建含 493、497、500 全部改动。角色 137、场景 351、物品 128 默认全选，未开启图标。私有证据：`/private/tmp/shakeink-item-493/evidence/item-perf-r3/`。

| 指标 | 结果 |
| --- | --- |
| 点击“导入 128 个物品”至离开 import-item（单调时钟，轮询 500 ms） | **20002 ms（≤30000 ms）** |
| 第13步识别物品（不计入） | 24715 ms |
| 物品数 N | 128（≥90 下限） |
| 任务 | 128 done，0 failed，0 skipped，attempts>0 为 0；无图片任务 |
| 资料 | 128 份 item artifact，ID 集合等于已选候选；全部 schema 2，全部带已核验 evidence 与 sourceUnitIds；evidence 均在所声明单元原文内 |
| 面板字段 | aliases 107、appearance 93、acquisition 93、effects 68、tags 61 |
| 冲突/丢弃 | 0 / 0 |
| 原件与正文 | 原件 hash 不变，workingRevision 0，页面错误 0；下一步进入 import-world |
| 在途 | 约 3 s 后 31 路在途，进度采样最高 35 running（含刚领取未发出的任务） |
| 请求耗时（runtime.json 保留的最近 64 次物品调用） | min 1419、p50 2518、p90 3928、max 7390 ms，全部 fulfilled |

runtime.json 只保留最近若干次调用（`trimWizardRuntimeCalls`），因此 64 是采样口径，不是总调用数；任务 attempts 全为 0，说明没有控制器纠错。生成期纠错次数在 runtime 中不可见，本轮无法单独计数。

**验收口径：** 494 修订节规定取实现后首个完整轮次。r1、r2 均因代码缺陷在中途失败（已据此修复并保留失败记录），r3 是包含全部修复后的首个完整轮次，也是唯一完整轮次，未因速度重跑或挑选。

**结论：** 《诡秘之主》第一卷全部 128 个物品导入耗时 20.0 s，通过 30 s 指标；全部物品完整导入，零失败。
