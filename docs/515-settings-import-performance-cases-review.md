# 515 用例 · 独立审核

日期：2026-11-05。对象：`docs/515-settings-import-performance-cases.md`。依据：`docs/514-settings-import-performance-plan.md` 第3R节（已含 514 审核）。代码行号按 HEAD（`git show HEAD:…`）；工作树中 514 的 spike 和他人的未提交改动不在审核范围。未修改任何源文件或测试文件。

## 结论：需修订后再实现

3R 的 9 项都有对应用例，方向正确。界面和真实 E2E 部分没有把模拟结果算作真实通过。问题集中在四处：计数链路两次经过同一 schema 的语义（高1）；SP-14 的调用次数和现有 harness 对不上（高2）；修正后仍会被 schema 之外的闸门整批拒绝（中1）；几处断言写成“或”，或者依赖时序（中4、中5）。

## 发现

1. **（高）SP-02/SP-05/SP-09 没有固定计数从哪一次解析得出，可能计零或重复计数。** 3R-2 让生成期 schema 与 `runImportAi` 的最终 `responseSchema.safeParse(raw)`（`novel-import-ai.ts:1069`）共用同一个 `z.preprocess`。但 `generateJSON` 返回的是已修正的 `.data`（`:761`），最终解析看到的已是干净数据。所以计数如果在最终解析时得出，经过 `generateImportAiJson` 后恒为 0；如果两处都累计，又会重复。建议：SP-02、SP-04、SP-05 各跑两种接法，并断言 `settingsRepairs` 精确相等。(a) `deps.generate` 直接返回原始坏回复；(b) 按 `novel-import-item-performance.test.ts:126` 的方式，用 `generateImportAiJson` 加注入的 `generateText` 返回同一回复。另加一条：把已修正的结果再送入 `importAiResponseSchema(request).parse` 一次，结果不变（幂等）。

2. **（高）SP-14 的“4 次生成（2 次请求 × 每次 1 纠错）”在主进程 harness 下无法成立。** 设定批次在主进程没有纠错轮：`importSettings.run` 只调用一次 `this.ai`（`novel-import.ts:910`）。纠错发生在服务层 `generateJSON` 内部（`maxGenerations` 默认 2，`src/lib/ai/generate.ts:190`）。`f.setAi` 替换的是整个 `ai`，看不到纠错。应拆成两条：
   - 主进程（`gated()`/`f.setAi`）：该批 `ai` 调用恰好 2 次（首发 + 重跑），两次的 `operationId` 不同。重跑期间不释放名额（断言 `settingsPeak` 未增加，结束后总在途回到 0）。
   - 服务层：一次 `runImportAi` 中 `generateText` 恰好调用 2 次（含 1 次纠错）。
   “名额峰值不变”改写为上面这个可断言的形式。

3. **（中）SP-03 与 3R-2 的“`sourceUnitIds` 为空整项丢弃”冲突。** 如果模型只给出本批之外的 id，修剪后为空，按 3R-2 末条整项丢弃。但 3R-2 和中3 又说，已定位证据所在单元会由最终闸门补回。用例要固定下面这个边界：证据可定位、`sourceUnitIds` 全在本批之外，结果为保留该项，`sourceUnitIds` 等于证据所在单元，不计数，不触发纠错。实现时应在 preprocess 内用 rebind 后的证据单元补全，再判断是否为空。

4. **（中）修正后仍会被 schema 之外的闸门整批拒绝，用例没有覆盖。** 以下检查都在解析之后执行，不经过 preprocess，也不触发纠错：`runImportAi` 的 `trope` 缺 `tropeKind`（`:1104`），以及 `模型实体标识重复`（`:1087`）、`validateSemanticLinks`（`:1106`）；主进程 `importSettings` 里的 `validateImportSemanticArtifact`（`novel-import.ts:911`）。3R-2 的“该项的严格 artifact 校验”是否包含这些检查，没有写清。建议在 SP-05 中增加：一项缺 `tropeKind` 的 trope，一项 `validateImportSemanticArtifact` 会拒绝的 artifact，两项 id 相同。分别断言约定的结果：在 preprocess 中丢弃并计入 `droppedArtifacts`，否则至少要进入纠错，不能直接让整批失败。

5. **（中）SP-06 漏了“全部引文不可定位”这条原路径。** 3R-2 和 514 审核高1 要求：全部不可定位时，纠错文本与诊断保持原样（`evidenceReason`，`:653-671`、`:769`），最终报错为 `模型证据无法定位（…）`，而不是 `模型返回结构不完整…`。建议 SP-06 分成三条：
   - 全部 no-match：纠错提示与 HEAD 逐字相同，两轮都失败时 message 以 `模型证据无法定位（no-match）` 开头。
   - 结构类：`模型返回结构不完整…`。
   - `artifacts:[]` 且无 `notFound`：必须在 schema 内报 issue 并触发纠错（`generateText` 调用 2 次）。现状是在 `:1108` 解析之后直接抛错，没有纠错。
   三条都要断言 `worldEntryRerunnable` 为真。

6. **（中）SP-04 分支不全。** 补三项：`reliability` 缺省时不变；非客观值且 `attribution` 非空时不变；清除后不残留空的 `attribution` 键。另加一项：两个字段都被删除后，该项能通过严格 artifact 校验，从而保留（3R-2 末条）。

7. **（中）SP-08/SP-10 的外溢面不够。**
   - 服务层：在 `executionLane:'wizard-settings-v1'` 上逐一叠加以下变化，断言请求被 `导入调度通道无效` 拒绝（`:856`），或按严格规则报错：`intent:'reconcile'`、`phase:'review'`、`kind:'world'`/`'character'`、`semanticVersion` 缺失。
   - 主进程：非向导设定分析（`importSettings` 的 `!lane` 分支，`novel-import.ts:914`，不带 lane）收到同样的坏回复，仍然失败。
   - SP-10：设定车道请求带非法 `settingsRepairs` 时被拒绝。非法值包括负数、小数、多余键、全零对象（3R-3 规定“只在非零时出现”）。

8. **（中）SP-17/SP-18 存在时序依赖，且缺少前置条件。** 把“在下一次 worker 循环内”改为确定性写法：用 `gated()` 加 `smallBatches`（每类约 32 批），不释放任何设定批次，只 resolve 最后一个世界条目，然后 `until(()=>settings in-flight>16)`，断言期间没有任何设定批次被 release。SP-17 要写明如何在不选世界观时到达 `import-world`：现有 `toWorldImport` 会经过 `detect-world`，需要确认或新增 helper。`gated()` 对设定统一返回 `{notFound:true}`，SP-11 类用例需要一个返回合成 artifact 的变体。

9. **（中）重跑缺两个分支（3R-5）。**
   - 首次失败后、重跑前暂停（epoch 改变）：不发出重跑请求，任务为 paused 或 waiting，不是 failed。
   - 重跑成功时，只汇总重跑那一次的 `settingsRepairs`。同时断言 `wizard.dropped` 中该类别只有一条记录（3R-3“重跑时不留记录”）。

10. **（低）SP-11/SP-12 补边界。**
    - 四类各写一条，label 用类别名，包括“爽点/泪点”。
    - `notFound:true` 且丢弃了一项（任务走 `none` 路径，`novel-import.ts:836`）时，是否写 dropped 记录要固定下来。
    - SP-12 中 `retryKind('world')` 当前只过滤 touch 和 materialRef（`:1061`），应断言 settings 记录也被清除，其它 kind 的记录保留。

11. **（低）SP-02 的“quote 原样或经排版恢复”不确定。** 对每个合成输入只写一个期望值：普通引文为原样，换行或空白差异的引文为恢复后的原文。

12. **（低）SP-19 要能证明没有泄露。** 注入的错误 message 带一段合成原文，断言 `settings-batch-fail` 行中不含该原文；重跑失败时出现 `attempt:2`；计数全零时不输出 `settings-repairs` 行。

13. **（低）SP-01 分支不全。** 补“其它模型降为最低思考档”和“无思考档位模型返回同一对象”两项。参照 IP-03（`novel-import-item-performance.test.ts:67-72`），断言 `providerOptions` 深度相等，且不修改入参。

14. **（低）回归范围写窄了。** “不变”只列了 WP-04/05/12/13/14。WP-07b、07c、06、15、16、17、18、19 也会受影响：WP-07b/19 的世界条目重跑与设定重跑共用 `worldEntryRerunnable`；WP-17 涉及领取顺序。应改为整份 `novel-import-world-performance.test.ts`，加上 item/scene/character 性能套件，全部继续通过。WP-03′ 要同时删掉 `assert.equal(importGenerationModel(theme,…),resolved)` 这一断言（`world-performance.test.ts:91`）。

15. **（低）台账。** AGENTS.md 要求把 SP、SU 编号写进 `docs/requirements-traceability.json`，目前没有 514/515 条目。真实 E2E 部分应写明证据路径（`/private/tmp/shakeink-settings-510/evidence/<label>`），并记录每批 attempt 次数和设定在途峰值，供 3R-8 的估算对照。

## 通过项

- SP-13 的旧 journal 兼容：`dropped` enum 在 `desktop/core/novel-import-wizard-state.ts:47`，需要新增 `'settings'`。
- SU-01 的界面范围。
- 真实 E2E 的计时口径与第1节一致，没有把模拟接口记作真实通过。
- SP-16 覆盖了“已有批次失败、跳过、全局停止后不重跑”，可直接在 WP-12/13/15 的写法上扩展。
