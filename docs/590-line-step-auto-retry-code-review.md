# 590 代码审核：导入世界线/叙事线出错自动重试 5 次

审核对象：`desktop/main/novel-import.ts` 与 `tests/unit/novel-import-lines-performance.test.ts` 中属于 docs/590 的未提交改动。工作区里同时存在 docs/589 的改动（`worldTimelineDateClues`、`timeline-ranked` 调试行、`orderWorldTimeline` 的章数参数等），本文不涉及。依据：`docs/590-line-step-auto-retry-plan.md`（修订 2）和 `docs/590-line-step-auto-retry-plan-review.md`。

我没有修改源码或测试。已运行（Node 24.18.0）：

- `node --import tsx --test --test-name-pattern='^AR-' tests/unit/novel-import-lines-performance.test.ts`：13/13 通过，约 56 s。
- 在 `/tmp/rev590/` 复制测试文件，只加打印语句做探针：AR-05 一次（见第 2 条），LP-08c 一次（见第 6 条）。

行号是当前工作区的行号。

## 结论

主体实现符合方案：重试循环、按处计数、退避间隔、等待期间暂停或取消、中间失败不外露、细纲不重试、每次调用 `runLine` 都新建计数，这些都正确。补问（`gaps`）、时间整理、归组都不会无限重试。正文批次重新拆分后，计数不会传给无关的章。

有一处需要先修：最后一个检查点在内存中执行 `advance` 之后保存失败，自动重试会再执行一次 `advance`，下一步（步骤 18 或 19）会在没运行的情况下被标为 `done`。不重试清单也漏掉了本地草稿存储类错误，这两条要一起修。测试方面，AR-05 实际只制造了一次失败，证明不了它标题里的结论，必须重写。

## 发现（按严重程度）

### 1. 中高：最后一个检查点保存失败后，自动重试会跳过下一步

位置：`desktop/main/novel-import.ts:1241`、`:1208`、`:239`；`checkpoint` 在 `:2235`，`save` 在 `:414`，`advance` 在 `:735`。

`checkpoint` 先在内存中执行 `fn()`，再调用 `save()`。`save` 只在编码失败（`encodeImportJournal`）时回滚内存。`lineBody` 的最后一个检查点在 `fn` 里调用 `this.advance(s)`：`w.step` 从 `worldline` 变为 `narrative`，并把 `stepState.worldline` 设为 `done`。如果接下来的 `save()` 抛出普通文件系统错误（如 `ENOSPC: no space left on device`、`EBUSY`、`EIO`），或抛出 `导入草稿目录身份变化`、`导入草稿归属无效`、`导入草稿中存在未知链接，已保留`，这些错误都不在 `LINE_STEP_FATAL` 里，`lineStepRetryable` 返回 true，于是阶段 `step` 被重试。

再跑一遍 `lineBody(kind='worldline')` 时，前面各阶段因为已覆盖或已有标记都会跳过，接着再次执行 `advance(s)`：这次 `stepState.narrative` 被设为 `done`，`w.step` 变为 `outline`。`runLine` 返回 true，`wizardRun`（`:728`）从细纲继续。步骤 18 的叙事线从未推断，却显示为完成，用户看不到任何提示。从步骤 18 出发时同理，会跳过步骤 19。

改动前，这种情况只会走 catch，把已推进到的步骤标为 `failed`（这是旧行为，不在本次范围），不会跳步。

修正建议（任选一项，建议两项都做）：

- 阶段 `step` 的失败一律不自动重试。方案的“修订 2”与审核都假定这个阶段“几乎只会因保存失败触发（属于不重试）”，但实现只用 `保存` 前缀判断，文件系统错误与 `导入草稿…` 错误不以 `保存` 开头。
- 让 `lineBody` 的推进可重入：例如进入 `lineBody` 时先核对 `w.step===LINE_STEPS[kind]`，不一致就直接返回 true。或者在重试前检查 `w.stepState[kind]==='done'`。

补测试：用桩让最后一次 `save` 抛一次普通 Error（例如在夹具里让 `rename` 失败一次），断言步骤 18 仍会真正发出叙事线请求，或者断言步骤直接 `failed` 而不是跳步。

### 2. 中（测试）：AR-05 只制造了一次失败，不能证明“按处计数”

位置：`tests/unit/novel-import-lines-performance.test.ts:610–618`。

桩的条件是 `failed.size<=lines.length`。`lines` 在 `retryLines` 结束后（`lines=(await out).lines`）才被赋值，运行期间一直是初始的空数组，所以条件只在 `failed.size===0` 时成立，整个用例只有一个批次失败一次。探针输出：`failed=1 retries=1`。断言 `lines.every(l=>l.attempt===1)` 只检查了这一行，即使实现改成全局计数，这个用例也照样通过。

方案审核（修订 2 新发现第 1 条）要求这个用例：用叙事线（62 批，halt 时排队的批次不会发出）；桩写成“发出的批次只要不含已失败过的单元，就失败一次”；并断言步骤尝试数 **> 6** 且最终 `done`。当前实现没有照做，需要按审核要求重写。运行中的失败次数可以从 `retryLines` 内部收集的数组读，或者用桩自己维护的计数器，不要读外层变量。

### 3. 中低：不重试清单仍漏掉确定性的本地错误

位置：`desktop/main/novel-import.ts:239`、`:343`。

除第 1 条的草稿存储错误外，方案审核修订 2 指出的三条确定性预算错误也没有加入：

- `导入请求超过模型预算，请继续分批`（`desktop/core/novel-import-ai-payload.ts:47`）
- `导入固定提示超过模型预算预留`（同文件 `:235`）
- `当前模型上下文预算不足，请选择更大窗口的模型`（`desktop/core/novel-import-budget-policy.ts:18`，在 `lines` 阶段的 `executionBudget` 中抛出）

前两条在 `ai()` 中、`track` 之前抛出，所以 `job.sent` 为 false，计数落在 `lines` 键上：重试 5 次，大约多等 15 s 后才失败，结果不变。不会出错，只是浪费时间。

建议：除了加入这几个前缀，再把带 `code` 的 Node 系统错误（`ErrnoException`）也视为不重试，这样同时覆盖第 1 条的触发条件。补一条 AR-00 式的逐项断言。

### 4. 低（测试）：AR-09 没有证明“继续后从第 1 次计”

位置：测试 `:654–665`。

暂停分支在继续之前设了 `broken=false`，继续后第一次就成功，所以“继续后从第 1 次计”没有任何断言。方案审核要求：继续后时间整理要再发 12 个请求才 `failed`。暂停与取消本身（< 1 s 结束、等待期间不发新请求、不出现 `failed`）的断言有效。我运行通过，耗时约 7 s。

### 5. 低（测试）：AR-14 的 `assert.rejects` 没有核对错误原因

位置：测试 `:680`。

只断言 `wizard-redetect` 被拒，任何原因的拒绝（版本号不符、正在暂停等）都会让它通过。应改为 `assert.rejects(f.act('wizard-redetect'),/当前步骤没有失败/u)`。

### 6. 低（测试）：LP-08c 没有按方案换桩，结果依赖重新分批

位置：测试 `:339–354`。

方案写的是把桩改为“每个单元第一次出现在多单元批次时失败一次”。实现保留了按“完整单元 id 串”记录的 `failedOnce`。重新分批后 id 串会变，新批次又失败一次。探针显示第 1、2 次尝试都失败（`attempt:1`、`attempt:2`），第 3 次才完成。现在用例能通过，但余量只有 5 次中的 2 次，并且依赖 `wizardLinePlan` 的分批结果。按方案改桩后，第 2 次尝试的结果就是确定的。

### 7. 低（与方案的偏差，无功能影响）

- 方案把“复制来源条目”归入 `step` 键，实现单独用了 `copy`（`:233`）。按阶段顺序清零后仍能保证有限次结束，可以保留，但应在方案或注释中写明。
- `lines` 键（发请求前失败）的清零时机：方案写“分批阶段整段完成时删”，实现是“后面阶段失败时才删”（`countLineFailure`，`:243`）。由于阶段只会向前推进，两种做法效果相同。
- LP-15b 留下了未使用的 `batch` 和 `void batch`（测试 `:289–292`），可以删掉。

### 8. 提示（不阻塞）

持续失败时，用户最长要等 15 s 退避，再加 6 次完整尝试，才会看到[重试]，这段时间界面与正常运行没有区别。方案审核已经建议后续加一个只读的“正在自动重试”状态，本次可以不做。

## 逐项核对（无问题）

- **计数与清零**：`countLineFailure` 先清掉已覆盖单元的键和更早阶段的键，再给本次每个键各加 1，返回其中的最大值。补问用 `gaps` 键（`runLineParallel` 不传 `failedUnits`，`:1229`），不会出现方案首轮审核说的无限重试，AR-07 断言 `[gaps,1..5]`。`worldTimeline` 写入后，归组失败会清掉 `timeline` 键。重新分批后各单元单独计数，AR-00 覆盖。
- **一定会结束**：较后阶段的键只会被更晚阶段的失败清掉；而更早阶段一旦通过，就不会在后面再次失败（coverage 只增不减，`worldGapsAsked`/`worldTimeline` 在 `runLine` 内不会被删）。各键次数都有上限，所以循环一定结束，不会无限运行。
- **`failedUnits` 的采集**：`own` 只在 `ai()` 调用 `track` 后才设 `job.sent`（`:1412`、`:2382`）。halt 之后 `call` 抛出的错误不计入。拆半与重跑都生成新的 Job 对象，各自记录；被采用路径之外的那条路径静默返回，不计入。合并失败（LP-15b）在发出请求后发生，会计入。
- **等待中暂停/取消**：等待开始前调用一次 `this.current`，之后每 50 ms 再调用一次（`:1214`）。`stopAction` 使 epoch 加 1 后，下一片等待即抛出 `AbortError`，由 `launch` 静默处理。`CandidateCommittedBlocked` 与 `assert()` 抛出的错误会离开循环，走 `launch` 的原有处理，不会进入重试。AR-09/10 实测通过。
- **中间失败不外露**：只有放弃重试时才写 `stepState`、`stepError`、`phase`（`:1210`），等待期间 `wizard-redetect` 因“当前步骤没有失败”被拒（`:620`）。
- **细纲不重试**：`kind!=='outline'` 时 `attempt=0`，直接失败，与旧行为相同。`tests/unit/novel-import-outline-performance.test.ts` 中断言 `failed` 的用例不受影响。
- **测试钩子**：只在 `SHAKEINK_TEST_ROOT`/`NODE_TEST_CONTEXT` 下读取，下限 1 ms，`0` 或非法值回落到 1000（`:237`）。
- **调试行**：AR-15 断言整行内容精确相等，且不含正文。
- **既有用例的期望值**：WT-32、WG-31/32 为 12，点[重试]后 13；WG-13 为 12；LP-08b 上界 66；LP-10 改用 `some`。均与方案审核核对过的数值一致。
- AR-01（7 个请求）、AR-02（12/24）、AR-03（间隔下限）、AR-04（11 个请求，区分了全局计数与按处计数）、AR-06（5 次通过、6 次失败）、AR-08/12（步骤 18 从第 1 次计，重试只补未覆盖单元）、AR-11（授权错误 2 个请求、换模型 1 个请求）的断言能证明各自的结论。AR-03 只断言间隔下限，按 `setTimeout` 的语义不会偶发失败。

## 小结

| 级别 | 问题 | 位置 |
|---|---|---|
| 中高 | 最后一个检查点在内存中 `advance` 后保存失败，自动重试再 `advance` 一次，跳过下一步并标为 `done` | `novel-import.ts:1241`、`:1208`、`:239` |
| 中 | AR-05 的桩读取的是尚未赋值的 `lines`，只制造了一次失败，证明不了按处计数 | 测试 `:610–618` |
| 中低 | 不重试清单漏掉草稿存储错误、Node 系统错误和三条确定性预算错误 | `novel-import.ts:239`；`novel-import-ai-payload.ts:47`、`:235`；`novel-import-budget-policy.ts:18` |
| 低 | AR-09 没有证明继续后从第 1 次计 | 测试 `:662–663` |
| 低 | AR-14 拒绝原因未核对 | 测试 `:680` |
| 低 | LP-08c 没有按方案换桩，依赖重新分批（实测第 3 次尝试才完成） | 测试 `:343` |
| 低 | `copy` 键与 `lines` 清零时机与方案措辞不同；LP-15b 有残留变量 | `novel-import.ts:233`、`:243`；测试 `:289–292` |

## 修复记录（主代理）

| 项 | 处理 |
|---|---|
| 1 收尾保存失败跳过下一步 | `step` 阶段不自动重试（`runLine` 中 `at.stage!=='step'`）；新增 AR-16：第 17 步进入第 18 步的保存失败一次，第 18 步未发请求、未被标为完成 |
| 2 AR-05 只造出一次失败 | 改为叙事线批次，每次尝试至多新增一个失败批次，断言重试行数等于失败处数且每条 attempt 为 1（全局计数会在第 2 处得到 2） |
| 3 不重试清单漏项 | 增加 `导入草稿`、`导入请求超过模型预算`、`导入固定提示超过模型预算`、`当前模型上下文预算不足` 前缀与带 `errno`/`syscall` 的系统错误；AR-00 补用例 |
| 4 AR-09 未证明继续后从 1 计 | 继续后仍失败，断言再发 12 个时间整理请求后 `failed`，再点[重试]治愈 |
| 5 AR-14 接受任意拒绝 | 匹配 `/导入正在处理|当前步骤没有失败/u` |
| 6 LP-08c 桩 | 改为每个单元首次出现在多单元批次时失败一次 |
| 7 LP-15b 残留 | 删除 `void batch`，改为断言坏批次已发出 |

修复后 `tests/unit/novel-import-lines-performance.test.ts` 59/59 通过（连续两次），`tsc` 通过，全量 `npm test` 44 项失败均为改前 HEAD 基线失败。
