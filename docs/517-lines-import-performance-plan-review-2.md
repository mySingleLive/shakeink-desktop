# 517 §3R3 独立审核（review-2）

范围：只审 docs/517 §3R3，对照 519 审核和当前工作树源码：`desktop/main/novel-import.ts`（wizardLineIds :80-90、recordSettingsRepairs :985-990、runLineParallel :1022-1069、ai() 白名单 :1719）、`desktop/service/novel-import-ai.ts`（:688-690、:1092、takeSettingsRepairs :1139-1145、normalizeLinesReply :1209-1263）、`desktop/core/novel-import.ts`（reconcileImportFact :307-321、mergeImportArtifacts :322-）、`desktop/core/novel-import-wizard-state.ts:24,47`、`NovelImportWizard.tsx:192`。依据是读源码，未运行测试或 Electron。

## 高

1. **“讲述者：<原称谓>”写进 attribution 是在补值，不只是改形状，并且绕过了用户选的“保持严格”。** 严格规则是 `reliability!=='客观事实'&&!attribution.trim()` 时拒绝（`core/novel-import-semantics.ts:150`、`service/novel-import-ai.ts:508`）。按 3R3-3 的写法，一个非客观、缺 attribution、带未知 narrator 的叙事点，会因为追加了“讲述者：X”而通过校验。这正是 3R2-7 禁止的“自动填充”。这个做法还违反 3R2-2 的“不改 attribution”。另外，attribution 在界面上显示为“信息来源：…”（`semantics.ts:277,291`），讲述者不一定是信息来源，这是给字段换了语义。
   建议：去掉 narrator 时不写 attribution。如果原称谓不在 text 或 attribution 中，就计入 droppedLinks，对作者可见；不能静默丢掉。如果坚持保留，必须同时满足两个条件：attribution 原本已非空，且规范化后仍执行原有的严格判断（追加不得让条目跨过归属门槛）。再加一条用例：非客观、无 attribution、未知 narrator 的条目仍被拒绝。
2. **丢弃计数“步骤失败或重做时清除”会在恢复后少报。** 按 3R-7，已落盘批次在失败或暂停后保留 coverage，恢复时只重做未覆盖单元。计数如果只在 runLineParallel 内存里汇总、失败就清除，那么恢复后完成的步骤只统计后半部分，作者看到的丢弃数偏小，与 519 高3 的“对作者可见”相悖。设定车道的先例不同：一个 task 原子地成功或失败（`novel-import.ts:863,884`），不存在部分落盘。
   建议：每批的 counts 在该批 `checkpoint` 内与 coverage 一起累加到持久状态（例如 `w.linesRepairs[kind]`）。只有 coverage 被清空（重新检测、取消、重开）时才清零。`w.dropped` 那一条在步骤完成时由累计值生成。失败尝试的 counts 不计入：只有 commit 成功的批次才加。

## 中

3. **拆分上限只限单个原始批次，步骤整体的放大和尾部时长都没有上限。** 叙事线按 62 批规划（`WIZARD_LINE_CONCURRENCY*2`，:1029）。如果出现系统性坏字段，最终叶子重跑失败（第 4 个串行轮次）触发 halt 之前，各批可能已并行发出约 62×7 次请求。成功路径最坏也要 4 个串行轮次，按单次 50–80 s 计，会超过 120 s。终止性本身没问题：拆分时单元数严格递减，halves 在 `active--` 之前入队，worker 不会提前退出；暂停时 `current()` 抛 AbortError，不可重跑，直接 halt；名额 ≤31 也成立。
   建议：再加一个步骤级额外请求预算（例如额外请求数 ≤ 初始批数）。预算耗尽时，下一次失败直接 halt 并给出 stepError。同一失败类与 paths 在不同批中出现 ≥3 次时提前 halt。Job 记录 depth。真实 E2E 每轮记录总请求数、拆分数和最大深度，与时长一起作为验收证据。
4. **order=min 的前提没写明，拆分还会推翻 3R-4 的不变量。** order 按字段调和，只有在整个候选没有冲突时才生效（`core/novel-import.ts:329-`）。所以 chapterIndex 不同的同名叙事点仍是冲突，这一点正确，但方案应写明“仅当 chapterIndex 相同”。另外，单章多单元批次拆分时会退回按单元切片（:1058），同一章因此落在两批；3R-4 “order 不会跨批冲突”的前提不再成立。两半各自从“同批同章显式最大值+1”起编号，会产生同章重复 order。
   建议：写明 min 调和的条件（同 chapterIndex、均为推断、未锁定）。增加用例：单章切片拆分后冲突数为 0，并断言不同名叙事点之间的 order 重复是可接受的边界，记录到风险节。

## 低

5. **id 避让的检查范围要扩大到全部类别。** `mergeImportArtifacts` 的 `collision` 按 id 在全部类别里查（:326），但 3R3-4 只查“同类条目”。避让应改为检查 `s.artifacts` 全部 id 加本批已分配的 id。循环必然终止：已占用 id 是有限集合，最多 |stored|+1 次。建议设一个上限，超出时抛错。
6. **linesRepairs 的护栏要完整照搬设定车道。** 设定车道有三处：每次生成前重置（service :688），严格 schema、非负、合计>0 的 `takeSettingsRepairs`（:1139-1145），以及主进程按车道的白名单（:1719）。3R3-3 只写了“主进程白名单”，应把服务层 schema 和每次生成的重置一并写进方案，并为“非剧情车道带 linesRepairs 被拒”写用例。`dropped.kind` 枚举加入 'lines' 能兼容旧状态（:47），界面 Notice 照 :192 的写法即可。
7. 3R3-1 说“由空闲名额并行发送”，但 worker 数在开始时就固定为 `min(31, 初始批数)`（:1067）。初始批数少时，拆出的半批用不上空闲车道。建议在方案里写明这个限制，或在 wake 时按需补 worker（上限 31）。
8. 唯一角色名改写为 id 时，应使用与 `known` 相同的判定（精确 name、唯一，不用别名）。重名或别名命中的情况仍按丢弃计数，并写用例。

## 已确认

3R3-2 撤销加后缀后，可以回到 :1092 的严格校验，与 518 LP-17 一致。3R3-6 的 people 先转 id 再按 id 去重，可以解决 519 低10。3R3-7、3R3-8 覆盖了 519 中7 和中8。调试行仍只输出固定文本，3R3 没有引入新的模型或原文外泄路径。

## 结论

**有条件通过。** 实现前须修订高1（不得借 narrator 填 attribution）和高2（计数按批随 coverage 持久累计），并把中3 的步骤级预算和中4 的调和条件写进 §3R3。低项可以在实现时一并处理。
