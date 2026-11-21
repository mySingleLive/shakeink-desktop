# 515 · 其他设定导入提速测试用例

依据：`514-settings-import-performance-plan.md` 第 3R 节。合成数据，不含真实原文或 Key。文件：`tests/unit/novel-import-settings-performance.test.ts`（新建）、`tests/unit/novel-import-world-performance.test.ts`（更新）、`tests/browser/novel-import-wizard.test.ts`（校验步骤提示）。

## 服务层（`settingsTolerantArtifacts` 与 `runImportAi`）

| ID | 内容 |
| --- | --- |
| SP-01 | 设定车道请求走轻量策略（DeepSeek OpenAI 协议 → `thinking:disabled`，其它 providerOptions 保留）；无 `executionLane` 的普通主题分析、review、reconcile 保持原模型选项。 |
| SP-02 | 一项 artifact 有 3 条 evidence，其中 1 条 no-match、1 条 too-short：结果保留该项及 1 条可定位证据（quote 原样或经排版恢复），`settingsRepairs.droppedEvidence=2`；生成只调用一次（不触发纠错）。 |
| SP-03 | `sourceUnitIds` 含本批之外的 id：只保留本批 id，且包含剩余证据所在单元；不计入任何计数，不触发纠错。 |
| SP-04 | `reliability` 为非法值：删除 `reliability` 与 `attribution`，其它 facts 不变，`clearedReliability=1`；`reliability:'人物推测'` 且 `attribution` 为空：同样删除二者；`reliability:'客观事实'` 不变。 |
| SP-05 | 一批 3 项，其中 1 项全部证据不可定位、1 项 `kind` 错误：两项丢弃，`droppedArtifacts=2`，保留第 3 项；不触发纠错。 |
| SP-06 | 修正后一项不剩且未返回 `notFound:true`：首轮报原严格校验错误并进入单次纠错；纠错回复合法时成功。两轮都不合法时抛 `模型返回结构不完整…`。 |
| SP-07 | 根结构错误（多余根键、`artifacts` 非数组）：不修正，走原纠错路径。 |
| SP-08 | 同样的坏输入在非设定车道请求（无 `executionLane` 的 theme，及 character/item/world entity）中仍按原规则报错：容错不外溢。 |
| SP-09 | `settingsRepairs` 只在计数非零时出现；非设定车道请求的结果永不含该字段；artifact 上无多余字段。 |

## 主进程（`importSettings` 与 `runEntities`）

| ID | 内容 |
| --- | --- |
| SP-10 | 主进程 `ai()` 拒绝非设定车道请求返回 `settingsRepairs`（“当前语义阶段返回了越权内容”）。 |
| SP-11 | 设定任务各批 `settingsRepairs` 汇总后，任务 done 时 `wizard.dropped` 恰好一条 `{kind:'settings',label:'主题',reason}`，reason 只列非零项；计数全零不写记录。 |
| SP-12 | 设定任务失败或作者跳过时不写 dropped；任务重试后成功只保留一条新记录；`retryKind('world')` 清除旧的 settings 记录。 |
| SP-13 | 旧会话 journal（dropped 无 `settings` 记录）正常加载；新会话含 `kind:'settings'` 时保存后可重新加载。 |
| SP-14 | 一批首次与单次纠错后都报 `模型证据无法定位（no-match）` 时，同名额重跑一次，重跑成功则任务 done，该批共发出 4 次生成（2 次请求 × 每次 1 纠错），名额峰值不变。 |
| SP-15 | 重跑仍失败：任务 failed，不再重跑第三次；非模型输出类失败（`Server Error`、授权）不重跑。 |
| SP-16 | 首批失败后其它批次不重跑；作者跳过后不重跑；全局停止后（verify 失败）不重跑也不再发出请求。 |
| SP-17 | 只选四项其它设定（无世界条目）：设定批次同时在途可达 31（批次 ≥31 时），总在途 ≤31。 |
| SP-18 | 选世界观+四项：有世界条目 waiting/running 时设定批次 ≤16，世界条目拿到其余名额；最后一个世界条目完成后，排队批次在下一次 worker 循环内拿到名额（不必等待其它批次结束），设定在途上升至 >16。 |
| SP-19 | 调试开关下 `settings-batch-fail` 行仅含 kind、units、attempt、safeError 文本；`settings-repairs` 行仅含计数；无原文或模型输出。 |

## 既有用例更新

| ID | 内容 |
| --- | --- |
| WP-03′ | 设定批次由“保留原模型选项”改为轻量策略（SP-01 同断言）；通道断言不变。 |
| WP-11′ | 上限 8 → 16：有世界条目时设定在途 ≤16，世界条目 ≥31−16。 |
| WP-04/05/12/13/14 | 不变，须继续通过。 |

## 界面

| ID | 内容 |
| --- | --- |
| SU-01 | 第21步“校验”：存在 `kind:'settings'` 的 dropped 时，在“已跳过”提示下方显示 Notice（标题“部分设定条目已修正”，内容“主题：丢弃 …”）；没有时不显示。 |

## 全量与真实验证

全量 `npm test`（与基线对比）、typecheck、`build:desktop`。真实 E2E（《诡秘之主》第一卷，`launch-settings.mjs`）：只选四项，≤60000 ms，4 项 done，零 failed/skipped，页面无错误，记录每请求耗时与 `settings-repairs`；再跑一轮世界观+四项组合，世界观条目全部 done，与 world-r22 世界观计时对比。

## 审核后修订（以本节为准）

审核见 `515-settings-import-performance-cases-review.md`，采纳。接入点改为 514 §3R2。

- SP-02/04/05：经 `generateImportAiJson`+注入 `generateText` 断言计数精确值与 `generateText` 次数；另断言 `deps.generate` 直接返回坏回复时仍按原规则失败（容错只在生成桥）。
- SP-03′：`sourceUnitIds` 全部在本批外时，结果为剩余证据所在单元，不丢该项。
- SP-05′：增加 trope 缺 tropeKind、同 id 重复、`validateImportSemanticArtifact` 失败三种逐项丢弃。
- SP-06′：全部不可定位时纠错指令与报错逐字等于未修正时（对照组：同输入走非车道请求的 feedback）；`artifacts:[]` 无 notFound 时仍抛原错误。
- SP-04′：覆盖 合法客观 / 合法非客观有归属 / 非客观无归属 / 非法值 / 缺省 五个分支。
- SP-08′：带车道但 intent/phase/kind 不符的请求被 `validateSemanticRequest` 拒绝；`settingsRepairs` 为负数、小数、多余键、全零时 `runImportAi` 拒绝。
- SP-14′：主进程断言该批 `ai` 恰 2 次（不同 operationId）、名额峰值不变；服务层纠错次数由 SP-06′ 覆盖。
- SP-14b：重跑成功时只计重跑那次的 repairs，dropped 恰一条。SP-16b：首次失败后暂停，不重跑。
- SP-17′/18′：用 `gated()` 变体（设定返回合成 artifact）+ 小批次，按在途计数断言，不依赖时序。
- SP-11′：四个类别各一条；notFound 路径不写 dropped。SP-12′：`retryKind('world')` 后无 settings 记录。
- SP-19′：调试行断言不含合成原文标记与 quote。SP-01′：补降档与无档位分支（deepEqual）。
- 回归：整份 world-performance、item/scene/character performance 套件；WP-03′ 删除旧 `:91` 断言。
