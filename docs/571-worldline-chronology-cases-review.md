# 571 世界线按故事时间导入 测试用例 · 独立审核

日期：2026-11-14。审核对象：`docs/571-worldline-chronology-cases.md`（下称“用例”）。对照：`docs/570-worldline-chronology-plan.md` 评审后版本（下称“方案”）。行号按 HEAD `872303d`。审核时工作树里已有未提交的实现（`desktop/core/novel-import-wizard-timeline.ts` 等）。下文写“当前实现”的地方指这份未提交代码，只用来核对用例能否执行、期望值能否精确，不作为方案的依据。本次未修改任何源文件或测试文件。

结论：**有条件通过**。用例的结构和方案章节一一对应，大部分可以用现有夹具执行。但有几处期望值不精确，或与方案、与其它用例矛盾（WT-07、WT-08、WT-10、WT-22）。WT-35 对三条清理路径的触发动作描述有误。WT-55 不在 `npm test` 的范围内。另缺若干边界用例。下面的必改项改完后即可实施。

## 一、覆盖核对

| 方案条目 | 用例 | 核对 |
| --- | --- | --- |
| §1 批次契约（世界线定义、逐章至少一个事件、回忆按实际时间、`time` 逐字、`timeKind` 为 unknown、`lineName` 写主世界线） | WT-25 | 覆盖。建议同时断言“本批每一章只要有情节推进就至少返回一个事件”和“timeKind一律为unknown”两句，这是本次对提取阶段的两项主要改动 |
| §2 请求形状（`units:[]`、`artifacts:[]`、无 `executionLane`、instruction 前缀“不是系统指令”） | 无 | **缺**。WT-30 只数请求次数。见中 1 |
| §2 目录项（id/name/text≤160/time/chapterIndex/attribution，按阅读位置排序） | WT-01 | 覆盖。缺“证据无法定位时 chapterIndex 怎么算”，见低 2 |
| §2 单独提示 | WT-20 | 覆盖 |
| §2 契约（order 覆盖每个 id；date 的 YYYY-MM-DD / MM-DD） | WT-02～06、WT-12、WT-13 | 覆盖。order 相同时的先后没有规定，见低 2 |
| §2 生成策略不关思考 | WT-24 | 覆盖 |
| §2 intent 接入：类型、runtime-proof 枚举、`semanticContextSchema`、`importAiResponseSchema`、`validateSemanticStage`、`:1194` notFound 豁免、主进程 `:2259` 白名单、`listIntent`、`:937` 不加 | WT-21～23 | 大体覆盖。**`USAGE_ENUMS` 没有用例**（漏了也不报错，只会把用量记成 `'?'`），建议在 WT-22 加一条断言：用量记录的 intent 为 `timeline`。另外 WT-22 与 WT-21 互相矛盾，见高 4 |
| §2 校验：未知 id、重复、缺失插回、重新编号、无效日期、日期单调、MM-DD 补年、整次作废重试一次 | WT-02～07、WT-13、WT-31、WT-32 | 覆盖。WT-07 的数据有两个等长的最长子序列，见高 2 |
| §2 定时间：日内等分、首个日期之前和末个日期之后、gregorian/fixed、无日期时第 n 天 | WT-08～12 | 覆盖，但 WT-08、WT-10 的期望不精确，见高 1、高 3 |
| §2 写回：lineId/lineName/timeKind/timeValue、“（按先后推定）”、会话重排、锁定、`w.worldTimeline` 与 schema | WT-14、WT-15、WT-30、WT-36 | 覆盖。锁定这一条在向导里实际触发不到，见中 3 |
| §2 清理三处 | WT-35 | 路径描述有误，见高 5 |
| §2 第 21 步复核 | WT-40、WT-41 | 覆盖。缺“作者选择正文版本后走严格校验”，见中 4 |
| §2 待处理冲突：同名冲突的 `source.artifactId` 不变，留到第 21 步 | 无 | **缺**，见中 5 |
| §2 容量分段 | WT-16 | 覆盖。缺“第 2 段失败时重试发哪些段”，见中 2 |
| §2 R7：暂停或失败后只重发 timeline | WT-32、WT-33 | 覆盖。缺“批次失败后重试”的组合情形，见中 2 |
| §3 发布 | WT-50～54 | 覆盖。来源事件与推断事件混合时的写入顺序没有规定，见低 3 |
| §4 面板 | WT-55 | 覆盖。可执行性见高 6 |
| 验收（真实目标） | R-WT-1～5 | 覆盖。R-WT-3 缺基线数字和计数口径，见低 4 |

## 二、可执行性

- **夹具**：`tests/helpers/novel-import-wizard-fixture.ts` 的 `fixture` 直接把 `options.ai` 换成假模型，**不经过** `runImportAi`。所以服务端的 strict 响应 schema 和 `validateSemanticStage` 在向导流程测试里不起作用，只有主进程 `ai()` 末尾 `:2259` 的阶段白名单会运行。凡是期望“结构错误被拒”的向导用例（WT-31、WT-32），必须选一个主进程或 `orderWorldTimeline` 会拒绝的回复，例如 `{}`、`{timeline:[]}`、全是未知 id，或带 `artifacts`（触发主进程“越权”）。schema 层面的错误（多余键、负数 order）只能在 WT-21 用 `runImportAi` 测。
- **工作树中的 `linesAi`** 已经加了 timeline 分支：按阅读顺序返回，不带日期。WT-30、WT-50 要用公历，需要在测试里另包一层，对 `intent==='timeline'` 返回带 `date` 的回复（`timelineCatalog(r)` 可以解析目录）。用例里要写明这一点，否则 WT-50 会得到 `fixed`。工作树中的 `tests/integration/novel-import-wizard-publish.test.ts` 现在断言的就是 `fixed`。
- **暂停与恢复（WT-33）**：可以执行。仿照 `tests/unit/novel-import-lines-performance.test.ts` 的 `gate`，但要拦截 `r.intent==='timeline'`。现有 `isLine` 要求 `!r.intent`，不会拦 timeline。`cancelAi` 收到取消时要 reject `AbortError`。动作顺序为 `f.act('pause')` → `settle` → `f.act('resume',{consent:true})` → `settle`。恢复后 `wizardResume` 会重新进入 `runLine('worldline')`：
  - 覆盖率已完整时，`pending` 为空，`runLineParallel` 不发批次；
  - 当前实现只在 `!w.worldTimeline` 时才发 timeline；
  - “只重发 timeline”可以这样断言：恢复之后的请求里，`isLine(r)&&r.kind==='worldline'` 的数量为 0，`intent==='timeline'` 的数量至少为 1。
- **重试（WT-32）**：UI 上的“重试”对应 `wizard-redetect`（`desktop/main/novel-import.ts:596`，只在当前步骤为 `failed` 时可用），LP-10 已有同样的写法。用例应写明动作名。
- **运行证据（WT-23）**：可以执行。读取 `root/novel-imports/<id>/runtime.json`，已有 7 个测试文件这样做。
- **WT-24**：`importGenerationModel` 已在 `tests/unit/novel-import-lines-performance.test.ts` 中直接测试，可以照写。
- **WT-37**：`classifyF` 只认 `角色/世界观/场景/物品` 四个标题。要得到来源复制的世界线，需要自定义 classify 回复，把资料文件中的某段标成 `worldline`。用例里要写明。
- **WT-40/41**：可以直接调用 `conflictChoiceOptions`，或者用 `injectJournalEdit` 注入冲突，`tests/unit/novel-import-conflict-choices.test.ts:261` 有先例。
- **WT-55**：见高 6。

## 三、问题（按严重程度）

### 高 1：WT-08 的期望不精确，并且与当前实现不一致

方案原文是“两个日期之间的无日期事件按名次平均分到这段日子里”，没有说明这段日子是否包括起始日期当天。按 WT-08 的数据（名次 0 = 1349-06-26，名次 3 = 1349-06-28，名次 1、2 无日期）：

- 当前实现：`day[i]=day[a]+floor(span×(i-a)/(b-a))`，span=2，b-a=3。名次 1 → floor(0.67)=0（06-26），名次 2 → floor(1.33)=1（06-27）。06-26 有 2 个事件，当天等分。结果为 **0、12、24、48 小时**。
- 用例写的是“名次 1、2 分在 06-26 至 06-28 之间（06-27 起）”。如果两者都放在 06-27，结果是 0、24、36、48。

两种写法都满足严格递增，但测试必须写死其中一种。要求：
- 方案补一句规则，例如“区间 [a,b) 共 span 天，无日期事件按 floor(span×(i−a)/(b−a)) 分到其中一天，可以和起始日期同一天”；
- WT-08 的期望改为精确的 `timeValue` 数组 `[0,12,24,48]`（或按方案选定的另一种写法），并断言 `epoch==='1349-06-26'`；
- 再加一组 span 大于事件数的数据，例如 06-20 到 06-28 之间夹 1 个事件：按当前公式落在 06-24，即 96 小时。

### 高 2：WT-07 的数据有两个等长的最长不减子序列

日期 06-20、06-28、06-25、06-29、07-01 中，`20,28,29,01` 和 `20,25,29,01` 都是长度 4 的不减子序列。方案没有规定平局时保留哪个。当前实现保留先找到的前驱，结果丢弃 06-25，和用例一致，但这只是实现上的巧合。要求二选一：
- 方案规定平局规则（例如“取名次靠前的日期”），用例写明；
- 或者改数据，让最长子序列唯一。例如把 06-25 改成 06-10：只有丢掉它才能得到长度 4。

另外要断言被丢弃的那个日期的事件，`time` 文字末尾加上了“（按先后推定）”（当前实现如此，方案的“时间来自推定”也是这个意思）。

### 高 3：WT-10 写成“附近”，应给出精确值

按方案“逐个向前一天、逐个向后一天”，结果是精确值，与“附近”无关。建议数据：名次 0、1 无日期，名次 2 = 1349-06-26，名次 3 = 1349-06-28，名次 4、5 无日期。期望 `timeValue = [-48,-24,0,48,72,96]`，`epoch='1349-06-26'`。同时断言负值经 `formatTime` 显示为 `1349-06-24`（公历日期早于 epoch 时也能正确显示，方案评审已核实）。

### 高 4：WT-22 与 WT-21 矛盾

WT-21 要求带 `artifacts` 的回复被 strict schema 拒绝。`runImportAi` 先做 `responseSchema.safeParse`（`desktop/service/novel-import-ai.ts:1153`），失败时报“模型返回结构或类别无效，请重试”，根本走不到 `validateSemanticStage`。所以 WT-22 中“返回 artifacts 时报‘越权’”在服务端不会发生。要求：
- WT-22 中这一条的期望改为“结构无效”；
- “越权”改到主进程层面测：向导流程中假模型对 timeline 请求返回 `{timeline:[...],artifacts:[...]}`，断言主进程 `:2259` 报“当前语义阶段包含越权结果：artifacts”，第 17 步按重试一次再失败的规则处理。可以并入 WT-31 或 WT-32。

### 高 5：WT-35 三条清理路径的触发动作写错了

我按 HEAD 逐行核对：

| 位置 | 实际函数与触发动作 | 用例写的 | 夹具能否驱动 |
| --- | --- | --- | --- |
| `:1665-1667` | `retryKind`。第 21 步的 `wizard-retry-kind {kind}`，只能在 `step==='verify'` 时使用（`:1658`）。它会清空第 17～20 步的产物，回到该类的导入步骤 | “修改角色名单后重算” | 能。`toVerify` 之后 `act('wizard-retry-kind',{kind:'character'})`，`tests/unit/novel-import-scene-deferred.test.ts:99`、`tests/unit/novel-import-wizard-session.test.ts:347` 有先例 |
| `:1795` | `wizardApplyPatches` 中 `!firstList` 的分支：第 21 步 `apply-patches`，且四个名单步骤全部 `skipped`（导入内容不含角色/场景/物品/世界观）。**这正是用户“只选世界线”的真实场景** | “只改正文的修订” | 能，但不能用 `toVerify`。需要 `select` 时 `targets:['worldline']`，复核假模型对一个世界线事件报冲突，再 `resolve rewrite` → patch 回复 → `apply-patches`，写法同 NIW-C19（`tests/unit/novel-import-wizard-session.test.ts:527`） |
| `:1819` | `revise`：`wizard-revise {to}`，`to` 为 `detect-*`、`files`、`kinds`、`tree`。名单步骤存在时，`apply-patches` 也会走到这里（`:1796` 的 `revise(firstList,true)`） | “改选择内容” | 能。`act('wizard-revise',{to:'kinds'})` 或 `{to:'detect-char'}` |

要求：
- 按上表改写 WT-35 的三条路径，每条写明动作和前置条件。`:1795` 一条必须用只选世界线的会话；
- 补一条 `wizard-revise {to:'work'}`（只改名称或目录）：`:1806` 提前返回，不清理任何结果，`w.worldTimeline` 应当**保留**，返回原步骤后不重发 timeline；
- 每条路径都断言重新进入第 17 步时 timeline 请求再发一次，事件全部重新定时。当前实现用 `!w.worldTimeline` 决定是否整理，清理漏一处就会静默跳过整理，让新事件全部“待定位”。所以这条断言是清理是否完整的唯一保护。

### 高 6：WT-55 不在 `npm test` 中，需要写明测试方式和精确文字

现有测试中渲染 `PlanningWorkspace` 的只有 `tests/browser/planning-card-menu.test.ts`：esbuild 打包真实的 `WorldlinePanel`，Playwright 用 Chromium 挂载，`/api/novels/:id/planning` 由内存夹具返回。`npm test` 只跑 `tests/unit` 和 `tests/integration`。browser 组由 `scripts/check-workspace-surfaces.mjs` 运行，需要 Chromium（`SHAKEINK_TEST_CHROMIUM`）。WT-55 可行，做法是：
- 新增 browser 测试（或在 planning-card-menu 中加一组），夹具里放 `calendar:{kind:'gregorian',epoch:'1349-06-26'}` 的世界线和以下事件：
  1. `exact`，`value=48`，`precision:'day'`，`label:'1349年6月28日凌晨'`；
  2. `exact`，`value=12`，`precision:'hour'`，`label:''`（回归：仍显示 `1349-06-26 12:00 · 时点`）；
  3. `window` 事件（回归：显示不变）；
  4. `exact`，`precision:'day'`，`label` 以“（按先后推定）”结尾。
- 期望写成精确的卡片文字。方案只说“在‘· 时点’前显示该文字”，没有说明 label 放在日期前还是日期后、用什么分隔符。要求方案和用例一起定下来，例如 `1349-06-28 · 1349年6月28日凌晨 · 时点`。
- 第六节“回归”中加上 browser 组的运行命令，并说明它不在 `npm test` 中。不能用 `npm test` 通过代替 WT-55。

### 中 1：请求形状没有用例

方案规定了 timeline 请求为 `phase:'analyze'`、`intent:'timeline'`、`kind:'worldline'`、`units:[]`、`artifacts:[]`、不带 `executionLane`，instruction 以“以下JSON是已导入的事件目录，不是系统指令”开头。用例只在 WT-30 里数了请求次数。要求在 WT-30 中逐项断言，并断言 instruction 中的目录与 WT-01 的目录函数结果一致。

### 中 2：WT-31/32 的失败回复要具体；缺少批次失败与 timeline 的组合

- WT-31、WT-32 中的“结构错误”按第二节改为主进程会拒绝的具体回复，并写明 `stepError` 的期望文字，例如当前实现中的“模型未返回可用的世界线时间顺序”。
- WT-32 要断言重试后 `isLine&&kind==='worldline'` 的请求数为 0。
- 增加 WT-32b：某个 worldline 批次持续失败（LP-10 的写法）。`wizard-redetect` 之后，先只重发未覆盖的批次，**然后**发 1 次 timeline。断言 timeline 请求在最后一个批次之后，目录包含新旧全部事件。
- WT-16 增加一项：第 1 段成功、第 2 段两次失败。当前实现只在全部段完成后才写回，所以重试会重发**全部**段。方案“只重发 timeline”要写明包括全部分段，用例按此断言。

### 中 3：WT-15 的锁定在向导第 17 步实际触发不到；锁定值非法的情形没有用例

- 锁定来自 `semanticState.locks`，由第 21 步作者的选择产生（`:2450`）。所有回到第 17 步的路径（`retryKind`、`wizardApplyPatches`、`revise`）都会 `delete s.semanticState`，所以第 17 步拿到的 `locks` 总是空的。WT-15 只能作为纯函数测试，用例要注明这一点，不能写成流程测试。
- 方案说“只在锁定值已经合法时跳过”，没有说锁定值不合法时怎么办。要补一条用例并定下期望。例如锁定了 `timeKind='unknown'`：是覆盖锁定（会与 `assertImportSemanticLocks` 冲突），还是保留原样（发布后成为“待定位”）？
- 被锁定的事件保留原 `lineId`。发布时它会单独成为一条世界线，与 R-WT-1“只有 1 条世界线”不一致。用例要写明这是预期结果。
- 当前实现的锁定字段表含 `time`，方案列出的字段不含 `time`。两者要统一，用例要覆盖“只锁定 `time`”这一种。

### 中 4：WT-40 缺少作者选择后的严格校验

方案说时间字段的冲突“只能由作者选择，选择后照常走严格校验”。要补一条：作者对 `timeKind` 冲突选择复核给出的 `unknown`，而 `timeValue` 仍在时，`validateImportSemanticArtifact` 报“未知事件时间不得制造数值”（`desktop/core/novel-import-semantics.ts:269`）。断言选择被拒绝或报出可读错误，会话不被改坏。

### 中 5：“待处理冲突不变”没有用例

方案单列了一条：第 17 步合并时产生的同名冲突，`source.artifactId` 不变，留到第 21 步。要求增加 WT-38：两个批次返回同名事件、事实不同，产生 pending 冲突。timeline 写回后，冲突的 `source.artifactId`、`status`、`w.deferredConflicts` 都不变，第 21 步仍然列出这条冲突。

### 中 6：第六节对提示金样的说法与实际不符

用例写的是“差异只有 worldline 车道一项和新增的 timeline 一项”。工作树中重新生成的 `tests/fixtures/novel-import-prompt-golden.json` 中，`legacy-scene:review////wizard-review-v1/` 的 payload 和 prompt 也变了。原因是复核材料里带着已改写的 `lineId/lineName/timeKind/timeValue/time`。这是预期的变化，但用例要写明这一项和原因，否则核对的人会把它当成意外改动。请求轨迹金样（`--check`）只记录角色/物品/世界观的 roster 和 entity 请求，确实不受影响。

### 低 1：WT-13 之外的补年边界

按方案的“月份回退超过 6 个月则年份加 1”，以下情形没有用例，其中两项方案也没有规定：
- 恰好回退 6 个月（`1349-07-10` 之后是 `01-05`）：不加年，日期逆序，被单调过滤丢弃。要断言这个结果。
- **MM-DD 在第一个 YYYY 之前**：方案只说沿用“前一个”有年份日期的年份，开头的 MM-DD 前面没有年份。当前实现用全书第一个出现的年份。如果数据是 `12-30` 然后 `1350-01-02`，会得到 1350-12-30，大于 1350-01-02，其中一个被丢弃。方案要定规则（例如开头的 MM-DD 取第一个年份，月份大于第一个年份日期的月份时减 1 年），用例按规则写期望。
- 没有 YYYY 时跨年（`12-30` 后是 `01-02`）：期望间隔 3 天，即 0、72。
- 没有 YYYY 时的 `02-29`：当前实现用闰年校验日期，但用平年 2001 计算天数，`02-29` 会和 `03-01` 落在同一天。要定规则，并写一条用例。

### 低 2：其它缺少的边界用例

- 证据都无法定位时的 `chapterIndex`：当前实现退回到首个来源单元的起点，再退回到 `chapters.length`。方案只写了“首条证据的位置”。要补用例，并在方案中写明退回规则。
- `order` 相同：当前实现按回复中的位置排先后。方案没有规定。补一条用例。
- 模型为每个事件都给了日期：所有事件都不加“（按先后推定）”；同一日期的事件当天等分；没有插值。
- 有日期的事件，其日期被单调过滤丢弃：`time` 文字是原文日期加“（按先后推定）”，要断言这个文字。
- WT-34 要断言 `w.worldTimeline` 未写入，第 17 步照样 `done`。方案“只有在 `w.worldTimeline` 写入后才算完成”与“没有推断事件时跳过”有矛盾，方案要补一句：没有推断事件时例外。
- WT-01 的“≤160 字”按码位计算。数据要用 161 个字符并包含一个非 BMP 字符，断言截断后不拆开代理对。

### 低 3：发布时来源事件与推断事件混合的顺序

方案写“世界线事件按 `timeValue` 升序写入”。来源复制的事件可能是 `unknown`，或者属于另一条世界线。用例 WT-51、WT-53 要写明混合时的顺序：例如只在主世界线内部排序，其它世界线保持原顺序。

### 低 4：真实目标的口径

- R-WT-3：要写明计数口径和基线数字。我用 `wl-base1/verify-session-private.json` 按首条证据所在章节计算：92 个事件分布在 213 章中的 **78 章**，其中只有 14 个事件带 `time` 文字。要断言修复后的数字大于 78，口径相同。
- R-WT-2：真实运行中模型给的事件名不固定。要写明怎么认出锚点事件，例如“首条证据所在章节 + 名称或摘要中的关键词”，并在证据中列出认出的事件 id 和对应的 `timeValue`。
- R-WT-1：如果出现被锁定的事件（中 3），会多出一条世界线。真实运行中不应当出现，要在证据中断言锁定数为 0。

## 四、数值核对（按方案算法和当前实现）

| 用例 | 数据 | 期望 `timeValue`（小时） | 备注 |
| --- | --- | --- | --- |
| WT-08 | 0=1349-06-26，1、2 无日期，3=1349-06-28 | 0、12、24、48 | 按当前实现的 floor 公式；方案要先定规则（高 1） |
| WT-09 | 30 个事件都是 1349-06-28 | 24k/30，k=0..29（0、0.8、…、23.2） | 与用例一致 |
| WT-10 | 0、1 无日期，2=06-26，3=06-28，4、5 无日期 | −48、−24、0、48、72、96 | 不是“附近”（高 3） |
| WT-11 | 4 个事件都无日期 | 0、24、48、72 | 与用例一致 |
| WT-12 | `06-26`、`06-28`，没有 YYYY | 0、48；fixed | 期望写成精确值 |
| WT-13 | `1349-12-30`、`01-02` | 0、72；第二个视为 1350-01-02 | 与用例一致 |

## 五、结论

**有条件通过，修改后实施。**

必须改：
1. WT-08：方案补上区间插值规则，用例写精确值（按当前公式为 `[0,12,24,48]`）。
2. WT-07：消除最长子序列的平局（改数据或定平局规则），并断言被丢弃日期的推定标记。
3. WT-10：改为精确值 `[-48,-24,0,48,72,96]`（或按所选数据算出的精确值）。
4. WT-22：artifacts 在服务端是“结构无效”，不是“越权”；“越权”改到主进程层面测。
5. WT-35：按实际函数改写三条路径的触发动作（`wizard-retry-kind`；只选世界线时的 `apply-patches`；`wizard-revise`），补上 `to:'work'` 保留 `worldTimeline`，每条都断言 timeline 请求再发一次。
6. WT-55：写明 browser 测试方式（不在 `npm test` 中）和精确的卡片文字；方案先定 label 的位置和分隔符。
7. WT-31/32：用主进程会拒绝的具体回复，写明重试动作 `wizard-redetect` 和 `stepError` 的文字，断言 worldline 批次重发数为 0；补上 WT-32b（批次失败与 timeline 组合）和 WT-16 的分段失败。
8. WT-15：注明只做纯函数测试；补上锁定值非法的情形，统一 `time` 是否算锁定字段，写明被锁定事件会单独成为一条世界线。
9. 补 WT-38（待处理冲突不变）、WT-40 的严格校验分支、WT-30 的请求形状断言。
10. 第六节的提示金样说明加上复核一项的变化及原因。

可以和实现一起改：低 1～低 4，以及 WT-22 中 `USAGE_ENUMS` 的断言。
