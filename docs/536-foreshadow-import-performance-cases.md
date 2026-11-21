# 536 · 导入伏笔提速用例

依据 `535-foreshadow-import-performance-plan.md`（以 3R 为准）。测试只用合成数据，不含真实正文或 Key。新测试文件：`tests/unit/novel-import-foreshadow-performance.test.ts`。回归范围：`tests/unit/novel-import-wizard-session.test.ts`、`tests/unit/novel-import-lines-performance.test.ts`、`tests/unit/novel-import-roster-ai.test.ts`、`tests/unit/novel-import-wizard-prompt.test.ts`、`tests/browser/novel-import-wizard.test.ts`、提示词 golden 和请求 trace 检查。

| 编号 | 场景 | 期望 |
| --- | --- | --- |
| FP-01 | 轻量策略（3R 第3节1） | 对 `semanticVersion:1,phase:'analyze',intent:'touches'`，`importGenerationModel` 在 DeepSeek 下关闭思考，其它 providerOptions 保留；`runImportGenerationLane` 让工作运行在长任务上下文中（占满 `longTaskQueue` 也不阻塞）。phase 为 review 或 semanticVersion 缺失时不生效。LP-02 仍成立：touches 不进入 lines 车道。 |
| FP-02 | 分批（3R-1） | 64 章合成正文：首轮请求批数 ≤ `WIZARD_LINE_CONCURRENCY`；批按章对齐，不切章；全部批的单元并集等于全部工作单元，且不重复；最长批最先发出。 |
| FP-03 | 并行与完成 | touches 请求在途峰值 >1 且 ≤31。步骤 done；`coverage.touches` 覆盖全部单元；首个 touches 请求晚于第19步结束；每个请求带 `entities`（worldline）和本批讲述卡 instruction。 |
| FP-04 | 合并顺序确定（3R-8） | 两次运行用相同回复、不同的完成顺序（一次逆序释放，一次正序释放）。同一 key 在多个批中出现、第一条 content 不同时，两次得到的 foreshadow artifacts（id、name、text、touches）完全相同，并等于按书中位置先出现的那条。stash 每项带 `order`。 |
| FP-05 | 可重试失败（3R-5） | 某个多单元批第一次抛 `模型返回结构不完整（touches）`：被拆成两半（单元并集等于原批，且不重复），最终 done。单单元批连续失败 2 次、第 3 次成功：done。单单元批连续失败 3 次：步骤 failed。整步额外请求不超过计划批数。 |
| FP-06 | 不可重试失败 | 某批抛 `模型配置或授权已变化，未采用返回结果`：不再派发新批，在途批结算并提交，步骤 failed，stepError 为该错误。作者点“重试”后只发送未覆盖的单元，最终 done，已提交批的触点不重复。 |
| FP-07 | 暂停（3R-9） | 有在途 touches 请求时暂停：等全部在途请求结束后才返回，步骤不标 failed，在途批不在暂停后写入。恢复后只请求未覆盖的单元。 |
| FP-08 | 来源复核与缓存（3R-4） | 请求以 `verified=true` 调用：一步中 `verify` 调用次数远少于请求数（≤ 请求数/4+2）。scopeHash 缓存：touches 请求的 scopeHash 在同一 epoch 中只计算一次（运行时记录中的 scopeHash 都相同）。来源在步骤中途变化时，步骤报来源变化而失败，与现有行为一致。 |
| FP-09 | 形状修整（3R-5） | touches 回复的 summary 为 260 字、content 为 4100 字：经 schema 修整截到 200 / 4000 字，其它字段不改；quote 超过 200 字时仍按结构不完整拒绝。 |
| FP-10 | 章节归属修复（3R-6） | 模型给的 chapterIndex 是批内序号（错误），evidence 和 quote 位于全书第 k 章且在该章内唯一：触点写入第 k 章，不被丢弃。quote 在推出的章内不唯一：保留模型值，交由原规则丢弃。 |
| FP-11 | 已处理计数（3R-7） | 第20步运行中：视图 `wizard.foreshadowFound` = stash 中不同 `normalizeWizardName(key)` 的数目（`"铜 钥匙"` 与 `"铜钥匙"` 计为 1 个），随批提交递增。暂停时仍给出。其它步骤、步骤 failed 或 done 后不给出。`touchStash` 不进入视图。 |
| FP-12 | 进度（3R-10） | 第20步运行中给出 `lineProgress`，coverage 键为 `touches`，`total` 为章数；完成后 `done===total`。 |
| FP-13 | 提示词（3R-3） | touches prompt 含：“本次只分析全书的一段章节”、同一伏笔使用相同 foreshadowKey、chapterIndex 为全书索引、content 不超过 100 字且同一 key 只在第一条填写、quote 不超过 60 字。roster 和 lines 车道的 prompt 不变。prompt golden 只有 touches 一个键变化。 |
| FP-14 | journal schema（3R-8） | `touchStash` 项带 `order:0..n` 时通过；不带 `order` 的旧会话通过，并按原顺序规划；`order:-1` 或 `1.5` 时 journal 校验拒绝。 |
| FP-15 | 界面文案 | 浏览器夹具：foreshadow 步骤运行中，`foreshadowFound:7` 时 `.ni-progress-hero` 内有 `已处理 7 个伏笔`（`aria-live="polite"`，类名 `ni-w-found`），同时显示章节进度 `已完成 x / y 章`；暂停视图仍显示该计数；失败视图不显示；`foreshadowFound` 缺失时不渲染该行。 |
| FP-16 | 回归 | NIW-C64a、NIW-C62b、RA-08、WP-02、LP 全部，以及 roster、lines、outline 现有用例全部通过；`capture-novel-import-prompt-golden.ts --check` 与 `capture-novel-import-request-trace.ts --check` 通过（golden 已按 FP-13 更新）；`npm test` 全量通过；`npx tsc --noEmit` 通过。 |
| FP-REAL | 真实目标系统 | `launch-foreshadow.mjs` 第一卷：步骤 done，≤120000 ms，页面无错误，`uiSamples` 中至少一条含 `已处理 N 个伏笔`（N>0）；质量满足 3R-2 硬指标（RESOLVED ≥20，多触点 ≥28，跨 ≥4 章 ≥10，伏笔 ≥100，丢弃 ≤10%）；记录 length 次数与输出 token p50/max。连续 3 次运行，至少 2 次达标，且以第一次运行为准（参见缓存口径）。任一质量项不达标即交用户决定。 |

## 3R. 审核修订（依据 536 review，以本节为准）

**夹具（高1）。** `tests/unit/novel-import-foreshadow-performance.test.ts` 自带以下夹具，不改其它测试文件中的 gate：
- `gateTouches(f,inner)`：拦截 `intent==='touches'` 请求并统计在途峰值，可按 operationId 单独 release/reject，也可 `releaseAll`。
- `toForeshadow(f)`：targets 为 `character,worldline,narrative,foreshadow`，推进到 step `foreshadow` 后返回。
- `multiTouchesAi(keyOf)`：对批内每个章 i 返回一个 PLANT。quote 为 `合成渡口${i}旁`（章内唯一），key 为 `keyOf(i)`，content 为 `说明${i}`。

**NIW-C64a 与 golden（高4a）。** 采用方案(a)：`touchesAi` 只在本批含第0章的“青铜钥匙”单元时返回触点，其余批返回 `touches:[]`。NIW-C64a 的断言不变。prompt golden 允许 touches 组的条目内容变化，但只允许这一组变化。

**修订后的用例（取代原表对应行）：**

- FP-02：首轮 touches 请求的单元分组恰好等于 `wizardLinePlan(units,chapters,profile,WIZARD_LINE_CONCURRENCY)`，顺序为最长优先。
- FP-02b：纯函数测试 `wizardTouchPlan(plan, fits)`（新导出）。放不下的多章批按 `wizardLinePlan(batch,…,2)` 对半；只得到一段时按单元从中间切；单单元仍放不下时报 `单个导入任务及完整元数据超过模型预算，请核对设定后重试`。
- FP-03：在途峰值 = min(批数,31)。touches 请求在 `f.requests` 中的下标都大于全部 narrative 请求的下标。每个请求的 instruction 讲述卡集合 = 与本批相交章的 narrative 集合。
- FP-04：两种完成顺序（gate 逐个 release，每次 release 后等 coverage 写盘）。夹具中同 key 只出现在不同批，各批一条，content 不同。两次运行得到的 foreshadow 产物相同，name、text 取批首单元最靠前那一批的值。另设：同一批内同 key 两条，content 取模型顺序第一条非空。
- FP-05：
  - 多章批第一次抛 `模型返回结构不完整（touches）`：两半都按章对齐，单元并集等于原批，最终 done。
  - 单章多单元批失败：按单元从中间切。
  - 单单元批：失败 2 次后第 3 次成功则 done；连续失败 3 次则 failed。
  - `模型输出未完整结束` 与 `模型未返回可解析的 JSON` 同样会拆分。
  - 所有请求都失败：步骤 failed，touches 请求总数 ≤ 2×计划批数。
- FP-06：批 A 抛可重试错误，产生两半。两半在 gate 上排队前，批 B 抛 `模型配置或授权已变化，未采用返回结果`。断言：之后不再发出新请求（A 的两半如尚未发出则不发出）；其余在途批 release 后已写入 coverage；批 B 没有 stash；步骤 failed，stepError 为该文案。传输错误 `模型接口请求失败（HTTP 500）` 同样立即停止。重试只发送未覆盖单元，且最终没有重复触点。
- FP-07：先 release 5 批并等待提交，再暂停。暂停调用在其余在途请求结算后才返回，步骤不标 failed。恢复后请求的单元并集 = 全部单元 − 这 5 批的单元，与这 5 批不相交。
- FP-08：
  - 包装 `f.options.verifySources`，只统计 foreshadow 步骤窗口：stub `Date.now` 不前进时恰好 2 次（首批前一次、apply 前一次）；用阻塞的 verifySources 断言并发峰值为 1。
  - spy `c.ai` 的第4参数，断言 touches 调用的 verified 都为 true。
  - 包装 `runtimeScopeCache.resolve`：第20步内 resolve 次数 = touches 请求数，compute ≤1。
  - 首批前注入来源变化：步骤 failed，stepError 为 `来源` 开头的现有文案，且不存在 schema 2 的 foreshadow 产物。
- FP-09（service 层，对照 roster-ai 测试 `run` 的写法）：
  - summary 260 字、content 4100 字：截到 ≤200 / ≤4000 码元，且 `isWellFormed()`。第 199–200 码元为代理对字符 `𠀀` 时，截断不留孤立代理项。
  - quote 超过 200 时仍报结构不完整。
  - 截断后只生成 1 次。
- FP-10：
  - 模型 chapterIndex = 批内序号，且 quote 不在该章、但在 evidence 推出的章内唯一：stash 中 `touch.chapterIndex` 为推出的章，伏笔保留。
  - chapterIndex 超出章数：同样修正。
  - quote 在推出的章内不唯一：保留模型值，dropped reason 为 `原文引文无法唯一定位`。
  - `SHAKEINK_IMPORT_DEBUG=1` 时，stderr 的 `touches-repairs` 行中 `chapterFixed` 等于修正次数。
- FP-11：首批提交前 `foreshadowFound===0`；之后随提交递增，按 key 规范化去重；暂停时仍给出；failed 时不给出；进入 verify 后不给出。
- FP-12：逐批 release 时 `lineProgress.done` 单调不减，total=64。用 `injectJournalEdit` 把全部单元写入 `coverage.touches` 后，视图 done===total。
- FP-13：新提示词含旧提示词中没有的确切子串：`本次只分析全书的一段章节`、`content不超过100字`、`只在第一条填写content`、`quote不超过60字`、`相同的foreshadowKey`。旧提示词（git HEAD 的 golden）不含这些子串。golden 重生成前先删除旧文件（脚本以 wx 写入），`git diff` 只改动 touches 一组。
- FP-14：`order` 合法 / 缺失 / -1 / 1.5 四种情况。另测混合 stash：无 order 的旧项排在带 order 的项之前。refreshForeshadowPlan（第21步修订）回归一次。
- FP-15：fixture 增加 `foreshadowFound`、`lineProgress` 两个选项。断言 `已处理 7 个伏笔` 与 `已完成 12 / 64 章`。
- FP-16：列出的回归用例在上述夹具修改后全部通过；`npm test`、`npx tsc --noEmit`、两个 golden `--check` 通过。
- FP-REAL：判定只看新会话的第一次运行，要求时长与全部质量项都达标；第 2、3 次只作参考。另需记录：`touches` coverage = 760；chapterFixed；touches 的 `import-usage` lane/思考证据（输出 token 远小于基线）；丢弃率 = 丢弃 /（保留 + 丢弃）。第一次不达标即交用户决定。
- FP-17：台账 NI-16 以文本插入方式写入，带证据路径和质量对比；`git diff --stat` 只显示新增行。
