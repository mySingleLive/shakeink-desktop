# 516 · 514/515 其他设定导入提速实现 · 独立代码审核

日期：2026-11-05。对象：工作树中 514（以 §3R、§3R2 为准）的未提交实现，对照 515（以“审核后修订”为准）。只看指定 hunk：`desktop/service/novel-import-ai.ts`（生成桥钩子、`takeSettingsRepairs`、`repairSettingsReply`、`repairSettingsItem`、`settingsItemValid`、`lightImportGeneration`），`desktop/main/novel-import.ts`（车道、`repaired`、`recordSettingsRepairs`、`importSettings`、`ai()` 闸门、`retryKind`），`desktop/shared/novel-import.ts`，`desktop/core/novel-import-wizard-state.ts`，`NovelImportWizard.tsx`，以及对应测试。其它人的 hunk（510–513 等）未审。未修改任何源文件或测试文件。

运行（Node v24.18.0）：`node --import tsx --test tests/unit/novel-import-settings-performance.test.ts`：14/14 通过（38.2 s）。浏览器用例 SU-01 未单独运行（全量正在跑）。

## 结论：可合入，需补测试

实现与 3R/3R2 一致，没有发现会导致错误结果、卡死或泄漏的问题。515 列出的若干用例没有落地（第1条），部分断言不能失败（第3、4条）。计数口径有一处重复（第2条），属于文案准确性问题。

## 发现

1. **（中）515 修订版中多条用例没有对应测试。** `tests/unit/novel-import-settings-performance.test.ts` 中没有以下内容：
   - SP-13：含 `kind:'settings'` 的 journal 保存后重新加载，以及旧 journal 兼容。schema 改动在 `desktop/core/novel-import-wizard-state.ts:47`，目前只有 SP-11 间接写入，没有 reload 断言。
   - SP-19′：`settings-batch-fail`、`settings-repairs` 调试行（`desktop/main/novel-import.ts:932`、`:944`）只含 kind、units、attempt、safeError 文本和计数，不含合成原文标记或 quote。全文件没有设置 `SHAKEINK_IMPORT_DEBUG`。
   - SP-12′：`retryKind('world')` 之后没有 settings 记录（实现见 `:1093`）；作者跳过后不写记录。SP-11/12（`:154-170`）只测了失败和单项重试。
   - SP-16b：首次失败后暂停（epoch 变化），不会重跑。
   - SP-15：授权类失败不重跑。SP-14′：名额峰值不变（`:172-184` 没有读取 `peak`）。
   - SP-06′：要求纠错指令逐字一致。`run()` 收集了 `prompts`（`:17-19`），但 `fails()`（`:21`）把它丢掉了，`:73` 只比较最终报错文本。

   修正：补上以上各项。SP-06′ 让 `fails` 返回 prompts，对照组 `executionLane:undefined` 的第2条 prompt 与车道请求逐字 `equal`。SP-19′ 在设置环境变量后捕获 `console.error`，断言 JSON 键集合恰为 `{kind,units,attempt,reason}` 或 `{kind,droppedEvidence,droppedArtifacts,clearedReliability}`，并且不含 fixture 中的“合成设定”、“风声”和 quote 字符串。

2. **（低）最终被丢弃的条目，它的引文和可靠性仍会计入计数，作者看到的数字有重叠。** `desktop/service/novel-import-ai.ts:1172` 在判断整项去留之前，就对每条不可定位引文累加了 `droppedEvidence`，`:1181-1182` 对 `clearedReliability` 也是同样处理。之后 `:1156`、`:1158` 又把整项计入 `droppedArtifacts`。例如 SP-05 中，t-x 唯一的一条坏引文既算 1 条丢弃引文，又算 1 项丢弃条目（`tests/unit/...:66` 断言了 `droppedEvidence:1,droppedArtifacts:3`，把这个口径固定了下来）。第21步显示的是“丢弃 1 条无法定位的原文引文，丢弃 3 项不合规条目”，但实际被丢掉的引文只是被丢弃条目的一部分。
   修正：`repairSettingsItem` 把计数先记在局部变量里，只有该项最终保留时才累加到 `counts`；被丢弃的条目只计 `droppedArtifacts`。SP-05 期望改为 `{droppedEvidence:0,droppedArtifacts:3,clearedReliability:0}`。如果决定保留现有口径，则需要在 514 §3R-3 写明“引文数含被丢弃条目中的引文”。

3. **（低）SP-07 和 SP-08′ 的部分断言不论实现对错都会通过。**
   - `tests/unit/...:81`：带多余根键的输入同时含一条坏引文。即使实现错误地修正了它，`{...root}`（`novel-import-ai.ts:1162`）也会保留 `extra`，严格 schema 仍然会拒绝。也就是说，这条用例证明不了“根结构错误不修正”。
   - `:83`：带车道但 intent、phase、kind 不符的请求，本意是验证 `validateSemanticRequest` 拒绝它。但输入里本身就有不可定位的引文，即使这类请求被放行，也会因为证据错误而失败。`fails()` 不检查报错文本。
   修正：`:81` 改为“多余根键 + 一条可定位、一条不可定位”的输入，并断言 `generations===2`，且第2次 prompt 与非车道对照组一致（即没有被修正）。`:83` 用完全合法的回复，并 `assert.match` 车道拒绝的报错文本。

4. **（低）WP-11′ 在 fixture 下最多只有 4 个设定批次，`settingsPeak<=16` 不可能失败。** `tests/unit/novel-import-world-performance.test.ts:101` 使用的 `worldFixture` 没有调用 `smallBatches`（`:140`）：64 章约 32k 字，默认预算下每类只有 1 批。8→16 的上限只有 SP-18（`novel-import-settings-performance.test.ts:139`）真正覆盖到。这条在 506 时就已经偏弱，这次只改了数字。
   修正：WP-11 调用 `smallBatches(f)`，使批次多于 16，或注明以 SP-18 为准。

5. **（低）`worldEntriesLeft` 的两种边界只影响速度，不影响正确性。** `desktop/main/novel-import.ts:801`：
   - 子世界条目 `dependsOn` 一个已失败的父世界时，会一直保持 `waiting`。在作者处理之前，上限会一直停在 16，即使已经没有可领取的世界条目。
   - 作者重试一个已失败的世界条目后，它在被 worker 认领（`:866` 的 `settledEntries.delete`）之前仍在 `settledEntries` 里。这段时间上限按 31 计算，批次可能占满名额，条目要等某个批次释放后才拿到名额（`entityWaiters` 优先，所以不会饿死）。
   两种情况都满足“总在途 ≤31、不死锁”。建议在条件里加上 `ready(t)`；重试时（`wizardTask` 的 retry 分支不在本 hunk 内）无需改动，记为已知即可。

6. **（低，说明）修正后仍有保留项、但整份回复没有通过严格 schema 时（例如保留项之间身份链接冲突，即 `validateIdentityLinks` 的整体校验），纠错轮看到的是修正后的文本，不是模型原文。** `novel-import-ai.ts:690` 把 `repaired.text` 交给 `generateJSON`。3R2-3 只规定了“一项不剩时原样交回”，没有覆盖这种情况。结果仍然由严格闸门把关，正确性没有问题，只是纠错提示与模型实际输出不一致。建议在 514 §3R2 中写明这是有意为之。

## 已核对、无问题

- **计数只取被接受的那次生成。** `novel-import-ai.ts:688` 每次生成开始时，在车道请求上把 `settingsRepairs` 重置为 `undefined`。`:690` 只有在 `repairSettingsReply` 返回 counts 时才赋值。`:763` 在 `generateJSON` 成功后附加，所以纠错轮会覆盖上一轮，未修正的回复不会残留计数。`finishReason!=='stop'` 时不做修正。
- **未修正时原样交回。** `:1152` 遇到根结构异常或 `artifacts` 为空数组时，`:1161` 在修正后无保留项时，`:1164` 在没有任何变化时，都返回 `undefined`，钩子返回原始 `raw`（`:690`）。因此严格 schema、纠错文本和报错与现状一致（SP-06 的报错对照已断言）。
- **不外溢。** 修正只在 `ordinary && wizardSettingsLaneRequest` 时执行。`takeSettingsRepairs`（`:1138-1144`）对所有请求生效：非车道请求带该字段会报“越权”，字段要求严格对象、非负整数且至少一项非零，校验在 `responseSchema.safeParse` 之前。`deps.generate` 直接返回的坏回复不会被修正（SP-08 `:88`）。主进程 `ai()` 也有二次闸门（`desktop/main/novel-import.ts:1629`，SP-10 已测）。IPC 传递的是纯数字对象，可以结构化克隆。
- **逐项判定。** `settingsItemValid`（`:1188-1196`）依次检查单项严格 schema、trope 的 `tropeKind`、`validateImportEvidence`、`validateImportSemanticArtifact`、`validateSemanticLinks`。同 id 只保留第一个合法项（`:1158`，不合法项不占 id）。`sourceUnitIds` 先保留本批 id，再并入已定位单元（`:1176-1177`）。
- **轻量策略。** `lightImportGeneration`（`:1031`）并入 `wizardSettingsLaneRequest`，普通主题分析、review、reconcile 不受影响（SP-01、WP-03′）。
- **车道。** 名额只在 grant 时扣减。批次路径（`main:941`）的 `acquire` 在 try 外，重跑在同一个名额内进行，`finally` 中 release。`grantNext` 每轮重新计算上限（`:802`）。entity 的 `finally`（`:875`）先记入 `settledEntries`，再在未停止时调用 `grantNext`，因此最后一个条目返回后，排队批次不必等其它批次结束就能拿到名额。SP-18 去掉这段逻辑就会失败。`halt` 后 `acquire` 拒绝，release 时会拒绝全部等待者。
- **重跑。** `:936` 的条件依次是：`worldEntryRerunnable`、尚无批次失败、`halted()`、未跳过。重跑前先 `this.current`。只重跑一次，第二次失败直接抛出。SP-16 中，如果去掉 `halted()`，epoch 不变，请求会再次发出，因此这条用例能够失败。
- **dropped 生命周期。** 只在 `task.state==='done'` 的整体采用路径写入（`:826`、`:950`）。notFound（`:846`）、失败（`:847`）和合并失败都不会留下记录，每个类别先清除再写入，`retryKind('world')`（`:1093`）会一并清除。可跳过的状态里不可能存在记录（done 不能跳过，`owned()` 也不级联到 settings）。enum 只新增了值，旧 journal 兼容。
- **调试行。** `reason` 取自 `safeError`（固定前缀或结构字段名，`desktop/main/novel-import.ts:1519`），计数行只含数字，不含模型输出或原文。
- **界面。** `NovelImportWizard.tsx:192` 只在存在 `kind==='settings'` 记录时显示 Notice，标题和内容格式符合 3R-4。SU-01 正、反两个分支都有断言。

## 处理（主代理）

- 1：补 SP-13（journal 校验正反）、SP-19（调试行；发现 `safeError` 会透传模型字段路径，改为固定失败类别 `settingsFailureClass`）、SP-12b（retryKind 与跳过）、SP-15b/16b（授权失败不重跑、暂停后不重跑）；SP-06 改为逐字比较纠错指令尾部。SP-14′ 名额峰值由 SP-17/18 的峰值断言覆盖。
- 2：只对保留项累加引文与可靠性计数，丢弃项只计一次；SP-05 断言改为 `droppedEvidence:0`。
- 3：SP-07 改为同一可修正条目加多余根键对照；SP-08 改用合法条目并断言“调度通道无效”。
- 4：WP-11′ 保留为回归断言；16 路上限由 SP-18 覆盖（已注明）。
- 5、6：接受为已知边界，记入 514 §3R2 说明。
