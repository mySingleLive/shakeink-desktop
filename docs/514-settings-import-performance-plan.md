# 514 · 其他设定导入提速方案

日期：2026-11-05。用户要求：第16步“导入世界观”中的“其他设定”（主题、文风、金手指、爽点/泪点四项）导入在 1 分钟内全部完成，全程无错误；测试数据为《诡秘之主》第一卷（小丑，213 章，741017 字，760 个工作单元）。

## 1. 计时口径

只选四项其它设定（不选世界观、角色等），第一卷，默认推断。从向导进入第16步 import-world 开始，到四项任务全部 done、向导离开 import-world 为止，单调时钟，≤60000 ms，零 failed/skipped，页面无错误。驱动：`/private/tmp/shakeink-settings-510/launch-settings.mjs <label>`（复制自 world-only 驱动，`LOTM_SETTINGS_ONLY=1`）。之后再跑一次世界观+其它设定的组合轮，确认世界观步骤不回退。

## 2. 已证原因（真实 E2E）

| 轮次 | 代码 | 结果 |
| --- | --- | --- |
| settings-r1 | 当前 HEAD | 218016 ms，零错误。40 个请求（每项约 10 批，每批约 82k 字），全部一次通过；单请求 p50 35.0 s、p90 64.6 s、max 86.1 s；最多 8 路并行（`WIZARD_SETTINGS_BATCH_LANES`）。 |
| settings-r4/r6 | 临时：设定批次走轻量策略（关思考）+ 31 路 | 单请求 p50 约 8 s、max 18 s；但约 55 批中 11 批因单条引文无法定位（no-match/too-short）被拒，单次纠错后仍失败，整项设定失败。 |

结论：保留思考时最慢单请求已超过 60 s，提并行不能达标（用户 2026-11-05 选择“关闭思考+提并行”）。关思考后的阻断是个别引文复述而非原文（用户同日选择“丢弃该条引文”）。

## 3. 修改

1. **轻量策略。** `lightImportGeneration` 增加 `wizardSettingsLaneRequest`：向导第16步四项其它设定批次（`executionLane:'wizard-settings-v1'`、analyze、无 intent）与角色/场景/物品/世界条目同用 `importRosterModel`（DeepSeek OpenAI 协议关思考；其它模型降为最低思考档；无思考档位的模型不变）。普通（非向导）主题等分析、review、reconcile 不变。取代 506 §3R-1 “不使用轻量模型策略”。
2. **并行。** 其它设定批次的 8 路上限只在仍有世界条目任务（waiting/running）时生效；没有世界条目可领取时（只选其它设定，或世界条目已全部结束），批次可占满全部 31 路。组合时上限由 8 提为 16：世界条目仍优先领取名额（`entityWaiters` 先于 `batchWaiters`）。
3. **单批自动重跑一次。** 某批在单次纠错后仍失败时，同一名额从头重跑一次；条件与 3R6 世界条目相同（`worldEntryRerunnable`：结构不完整、JSON 不可解析或未完整结束、证据无法定位等模型输出类失败）。已有批次失败、作者跳过、全局停止后不重跑。
4. **引文容错（仅四项其它设定）。** 服务层响应结构中，四项其它设定的 artifact 若 `evidence` 中至少一条可定位，则丢弃无法定位的条目（与 `rebindEvidence` 同一判定：unknown-unit、too-short、ambiguous、no-match）并保留该 artifact；全部不可定位时仍走原严格校验与纠错。丢弃数量以 `evidenceDropped` 计数随结果返回（只允许在这四类请求中出现，非负整数）；设定任务整体采用时，在 `wizard.dropped` 记一条 `{kind:'evidence',label:类别名,reason:'N 条原文引文无法定位，已丢弃该引文'}`，任务失败或重跑时不留记录。角色/场景/物品/世界条目及 review/reconcile 的证据规则不变；`sourceUnitIds` 只保留剩余证据所在单元及模型给出的合法单元。
5. **调试。** `SHAKEINK_IMPORT_DEBUG=1` 下记录 `settings-batch-fail {kind,units,message}`（固定文本，不含模型输出）。

不改：提示词与字段契约、批次规划（`stageRequests`）、上下文资料、任务依赖、暂停/取消/重试语义、世界条目策略。

## 4. 验证

- 单元：设定批次走轻量策略、普通主题分析不走；无世界条目时批次占满 31 路，有世界条目时 ≤16 路且条目拿到其余名额；单批纠错后失败自动重跑一次、跳过/停止后不重跑；引文容错只作用于四类且至少保留一条，全不可定位仍报错；dropped 只在任务采用后记录。
- 全量 `npm test` 与基线对比、typecheck、`build:desktop`。
- 真实 E2E：设定单独轮 ≤60 s 零错误；世界观+设定组合轮世界观步骤全部 done。

## 3R. 独立审核后的修订（以本节为准）

审核见 `514-settings-import-performance-plan-review.md`，全部采纳。用户 2026-11-05 第二次选择：四项其它设定“修正可选字段+丢坏条目”。

**事实更正（审核一）。** settings-r6 共 12 行 `settings-batch-fail`：5 行引文 no-match，4 行结构类（`facts.reliability` 无效、`sourceUnitIds` 不在本批、`artifacts` 根结构），2 行“导入操作已取消”（全局停止的连带结果），1 行 theme 混合（evidence 与 sourceUnitIds）。r2 的唯一失败是 reliability 加 evidence。因此仅丢引文不足以达到零错误，第3节第4项由以下第1–3项取代。

1. **容错范围与条件（中2）。** 仅当 `wizardSettingsLaneRequest(request)` 为真（向导第16步、`executionLane:'wizard-settings-v1'`、analyze、无 intent、kind ∈ 四项）。非向导主题分析、review、reconcile、角色/场景/物品/世界条目完全不变。
2. **条目级修正（服务层，一个纯函数 `settingsTolerantArtifacts(request,raw)` 两处共用，高1）。** 对模型回复 `artifacts` 中每项依次：
   - 丢弃无法按 `rebindEvidence` 定位的 evidence 条目；
   - `sourceUnitIds` 只保留本批单元（中3：已定位证据所在单元总会由最终闸门补回，不另删除）；
   - `reliability` 不在四个合法值内时删除 `reliability` 与 `attribution`；`reliability` 非“客观事实”但 `attribution` 为空时同样删除二者（取消该条的可靠性标注，不改其它内容）；
   - 修正后该项若无 evidence、`sourceUnitIds` 为空，或仍不能通过该项的严格 artifact 校验（kind/origin/facts 字段等），整项丢弃。
   保留项的 `id/kind/name/text/facts` 其余值不变。修正与丢弃在生成期 schema 中通过 `z.preprocess` 执行（这样单次纠错只在“根结构错误或无保留项”时触发），`runImportAi` 的最终 `responseSchema.safeParse(raw)` 走同一 schema，因此两处判定一致；`:1097` 的 `rebindEvidence` 与 `validateImportEvidence` 只看到已可定位的证据。
   根结构不合法（非对象、`artifacts` 非数组、多余根键）或修正后一项都不剩且未返回 `notFound:true` 时，仍报原严格校验错误，走单次纠错与批次重跑。
3. **计数与传递（高2）。** 服务层结果新增可选顶层字段 `settingsRepairs?:{droppedEvidence:number;droppedArtifacts:number;clearedReliability:number}`，只在上述请求且计数非零时出现；不进 artifact。`ImportAiResult` 增加该可选字段；主进程 `ai()` 的阶段白名单只允许设定车道请求带它（否则“越权内容”）。`importSettings` 汇总各批计数，随任务结果交给 commit；设定任务整体采用成功后在 `wizard.dropped` 记一条 `{kind:'settings',label:类别名,reason:'丢弃 X 条无法定位的引文、Y 项不合规条目，Z 项取消可靠性标注'}`（只列非零部分）；任务失败、跳过、重跑或 `retryKind('world')` 时清除该类别的旧记录（低1）。`dropped` schema enum 增加 `'settings'`，旧会话无该值，向后兼容。
4. **作者可见（低1）。** 第21步“校验”在“已跳过”提示下方，`kind==='settings'` 的 dropped 记录以同样的 `Notice` 显示（标题“部分设定条目已修正”，内容为 label：reason），不改其它布局。
5. **重跑（中4）。** 批次单次纠错后仍失败时同名额重跑一次，前提：`worldEntryRerunnable(error)`、无先前批次失败、任务未跳过、且全局未停止。`importSettings` 增加 `halted()` 参数（runEntities 传 `()=>!!halt`）。重跑前后都 `this.current(s,epoch)`。
6. **车道（中5）。** 名额计数：`free` 为全步剩余名额（31）；设定批次上限 `batchCap()`：当 `pending()` 中存在 kind 为 entity 且 state 为 waiting/running 的世界条目时为 `WIZARD_SETTINGS_BATCH_LANES=16`，否则为 `WIZARD_WORLD_CONCURRENCY`（31）。`grantNext()` 除在 acquire/release 时调用外，worker 在任一任务提交（results/failures push）后也调用一次，使最后一个世界条目结束后等待的批次立即拿到名额。总在途仍 ≤31。
7. **调试（中1、低2）。** `settings-batch-fail` 改为 `{kind,units,attempt:1|2,reason}`，reason 为 `this.safeError(error)` 的固定文本；另记 `settings-repairs {kind,droppedEvidence,droppedArtifacts,clearedReliability}`。
8. **60 s 估算（中6）。** settings-r6（关思考）每类约 10 批，单批 2–18 s；只选设定时 40 批分两波（31+9），无失败约 2×18 s≈36 s。容错后批次级失败只剩根结构类（r6 中 1/55）。最坏一批“首发+纠错+重跑+纠错”约 4×15 s=60 s，余量薄；验收以真实 E2E 为准，若仍超时再与用户讨论缩小批次。
9. **测试更新（低3）。** WP-03（设定批次改为轻量策略）、WP-11（上限 8→16，补“无世界条目时可达 31”），按 WP-19 补设定批次重跑；注释同步。组合轮世界条目可用名额 23→15，E2E 组合轮与 506 world-r22 的世界观计时对比（低4）。

## 3R2. 用例审核后的修订（515 审核，取代 3R-2/3R-3 的接入点）

1. **单一修正点（审核高1）。** 修正不放进共享 schema，而放在 `generateImportAiJson` 已有的 `generateText` 包装里：每次生成拿到模型文本后，若请求满足 `wizardSettingsLaneRequest`，用 `parseJsonOutput` 解析为对象，经 `settingsTolerantArtifacts` 修正后重新序列化交给 `generateJSON`，原严格 schema、纠错与最终闸门都不改；计数按“本次生成”记录，纠错轮覆盖上一轮，只有被接受的那次生成的计数随结果返回。`runImportAi` 在 `responseSchema.safeParse` 前取出并校验 `settingsRepairs`（仅设定车道；严格对象、三项非负安全整数、至少一项非零），解析与全部检查通过后再附回。直接由 `deps.generate` 返回的结果不做修正（容错只存在于真实生成桥）。
2. **逐项判定（审核中2）。** 修正字段后，每项单独检查：`importAiResponseSchema(request).safeParse({artifacts:[item]})`（含证据、身份链接）、trope 的 `tropeKind`、`validateImportSemanticArtifact`、`validateSemanticLinks(request,[item])`；同 id 只保留第一项。任一不通过即丢弃该项。
3. **一项不剩时原样交回（审核中3）。** 修正后无保留项（含原本就是 `artifacts:[]`）时，交回模型原文不作任何修改，纠错文本与报错与现状逐字一致。
4. **sourceUnitIds（审核中1）。** 先只保留本批 id，再并入已定位证据所在单元；因此修剪后不会为空。
5. **主进程。** `importSettings` 返回 `{artifacts,repairs}`；runEntities 把 repairs 随设定任务结果交给 commit；非向导 `!lane` 分支不发设定车道请求，行为不变。
6. **已知边界（516 审核 5、6）。** 父世界已失败而子世界仍 waiting 时设定批次上限保持 16；作者重试失败条目到 worker 认领之间上限按 31 计算（总在途仍 ≤31，无死锁）。修正后仍有保留项但整份回复未通过严格校验时，纠错轮看到修正后的文本。
