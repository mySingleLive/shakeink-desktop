# 567 · 进入“导入世界观”时界面卡死 代码审核

日期：2026-11-13。独立审核，只读，未修改源码或测试。

范围：`git diff desktop/main/novel-import.ts`（未提交），未跟踪的 `tests/unit/novel-import-world-step-planning-slices.test.ts`、`tests/unit/novel-import-world-step-responsiveness.test.ts`。依据：`docs/565-world-step-planning-freeze-plan.md`（以 3R/3R2 为准）、`docs/566-world-step-planning-freeze-cases.md`（以 3R 为准）及两份审核。

## 一、执行结果

| 命令（Node v24.18.0） | 结果 |
|---|---|
| `node --import tsx --test tests/unit/novel-import-world-step-responsiveness.test.ts` | 3/3 通过；WR-03 最长阻塞 225 ms |
| `node --import tsx --test tests/unit/novel-import-world-step-planning-slices.test.ts` | 7/7 通过，共约 106 s；WR-04 共 488 个分片，最长 20 ms，第16步最长事件循环阻塞 127 ms；WR-06b 暂停耗时 206 ms |
| `npx tsc --noEmit` | 通过 |

后台正在跑全量 `npm test`，按要求未重复运行全量。

## 二、结论

未发现高严重度问题。实现符合 565 3R/3R2：规划资料在开始时冻结，单一规划泵每个事件循环迭代只放行一个分片，目录每项只建一次，每次让出后检查停止和跳过。其它 `stageRequests` 调用点的行为与改动前相同。下面的中等问题集中在用例的证明力和验收证据上。

## 三、逐项审核

### 1. 其它 `stageRequests` 调用点的行为（无问题）

- `stageRequests`（`desktop/main/novel-import.ts:2148`）调用 `planRequests` 时不传 `sliceMs`（默认 `Infinity`）和 `frozenCatalog`（默认 `undefined`）。所以 `performance.now()-sliceStart>Infinity` 永远不成立，不会产出 `PLAN_PAUSE`。包装层的过滤只是保险。
- 逐单元分支（`:2183-2192`）：真实产出后执行 `if(!frozenCatalog)catalog=undefined`，下一次试算会用当前 `s.artifacts` 重建目录。这与改动前“每次产出后丢弃”相同，调用方在两批之间提交的实体会进入下一批。
- 单调分支（`:2182`）：每次 `yield snapshot(batch)` 后 `catalog=undefined`，与改动前相同。`importStageBatches` 的试算全部在第一次产出前同步完成，目录在这段时间内缓存是正确的，因为期间 `s.artifacts` 不会变化。
- `!s.budgetPolicy` 分支（`:2168`）和单调分支调用 `frozenCatalog?.()`：对普通调用方，这个值是 `undefined`，`requestSnapshot` 会回退到 `this.entityCatalog(s)`（`:2119`），即每批读取当前资料，与改动前相同。对设定规划，返回的是 `settingsPlan` 闭包里只建一次的冻结目录（`:2159`），与冻结设计一致。在单调分支中，`catalog=undefined` 之后由 `catalog??=frozenCatalog()` 拿回同一份缓存，不会重建。**结论：传 `frozenCatalog?.()` 是正确的。** 有一处小瑕疵：`!budgetPolicy` 分支对 `classify` 阶段也会调用 `frozenCatalog`，但只有设定规划会传这个参数，而设定规划从不是 classify 阶段，所以没有实际影响。
- 低（L3）：单调分支和 `!budgetPolicy` 分支会悄悄忽略 `sliceMs`。设定规划不走单调分支（没有 `intent`），所以当前没有影响。如果以后给 roster/touches 阶段传 `sliceMs`，分片不会生效。建议在注释里写明“仅逐单元分支分片”。

### 2. 规划泵（无问题）

`planTurn`/`schedulePlanTurn`（`:2164-2166`）：

- **等待者不会丢失。** `planScheduled` 只在排入 `setImmediate` 时置为 true，并且在回调开头复位。回调先 `shift` 出一个等待者，再为剩下的等待者续排，最后 `resolve`。所以任何时刻只要队列非空，就有一个已排的 immediate。没有哪条路径会让 `planScheduled` 停在 true 却没有回调待执行。`resolve` 不会抛出。
- **不会饿死。** 队列先进先出，四个规划器轮流执行。在回调里续排的 immediate 会落到下一个迭代（Node 的 check 阶段只执行本阶段开始前已排入的回调），被放行的规划器在本次回调之后的微任务里执行一个分片。WR-08 已用迭代计数证明两个分片不会出现在同一个迭代内。
- **暂停、停止、关闭时不会悬挂。** 泵不依赖会话状态。每个等待者都会在之后的某个迭代被放行，然后 `this.current(s,epoch)`（`:1072`，定义在 `:2100`）因 epoch 改变、会话替换或控制器关闭（`assertCandidateOpen`/`assert`）而抛出。Promise 不会永久挂起，`importSettings` 及其 lane 也不会泄漏：规划阶段还没有 `acquire` lane。旧 epoch 的等待者最多再占用 4 个迭代。WR-06b 实测暂停用时 206 ms，之后后台排空（`active===0`）。
- 生成器提前退出时不调用 `plan.return()`。生成器没有 `finally`，所以没有影响。
- **多控制器。** 等待队列是实例字段，每个控制器各自泵送。生产中只有一个控制器（`desktop/main/index.ts:398`）。同一进程里的多个测试控制器在同一迭代内各放行一个分片，不会互相阻塞。已 dispose 的控制器留下的等待者会在 `current()` 处抛出，可以接受。

### 3. `halted()` 时抛出 `SettingsTaskSkipped`（无问题，行为与改动前等价）

- 跳过的情况：worker 在 catch 中（`:1021`）先 `this.current`，然后 `failures.push`。commit 遇到 `task.state==='skipped'` 时 `continue`（`:994`），任务保持 skipped。这与 `:1099` 已有的用法一致。
- 全局停止（`halt` 已设置）的情况：`SettingsTaskSkipped` 进入 `failures`，但 `commit` 在 `halt` 时直接返回（`:964`），所以 failures 不会写入任务。worker 的 `while(!halt)` 退出，外层用 `halt.error` 抛出（`:1029`）。用户看到的是原始停止原因，不是“该项已跳过”，任务也不会被标为 failed。改动前，同步规划结束后会在 `lane.acquire(true)` 被 `failWaiters(error)` 拒绝，同样以 halt 的错误结束。两者结果一致，只是现在停得更早。之后剩下的 running 任务由暂停或重启路径改回 paused/waiting（`:544`、`:935`、`:1769`），与改动前相同。
- 停止或暂停的情况：`current()` 抛出 AbortError，worker 在 catch 中的 `this.current` 重新抛出。与改动前的 `yieldToEventLoop` 路径相同。

### 4. 冻结资料与下游一致性（无问题）

- 冻结点：`settingsPlan(s,kind,…,s.artifacts,…)`（`:1070`）在调用时就对实参求值，取到的是进入 `importSettings` 时的数组。所有提交都通过重新赋值 `s.artifacts` 来更新（`mergeImportArtifacts` 先 `structuredClone`，见 `desktop/core/novel-import.ts:326`；跳过时用 `filter`），不会原地修改冻结数组里的元素。唯一的原地修改 `resolveWizardReferences`（`:1044` 起）发生在步骤结束时，这时规划早已完成。
- `ai()`（`:2242`）会再调用一次 `requestSnapshot`：`request.entities` 已经填好，会被沿用（`:2119`）。`chapters` 已经设置。`transportLocks` 从 `request.artifacts`（冻结的精简副本）计算，与规划时相同。设定请求是 analyze 阶段，不涉及 `reviewProjection`。设定请求不带 `intent`，所以 `sceneRequest` 原样返回（`:447`）。发送的内容就是冻结时规划的内容。
- 规划期间仍会读取一些实时状态：`sceneLedger`、`sceneSources`（在 `contextArtifacts` 中）、`s.semanticState.locks`、`s.targets`、`s.chapters`、`workingImportUnits(s)`、`executionBudget`。在第16步运行期间，这些状态都不会变化，否则 HEAD 的规划同样会受影响。
- 结果的校验（`validateImportEvidence(a,request.units)`）和合并都针对实时 `s.artifacts`。这与 HEAD 相同，HEAD 的请求本来就只依赖步骤开始时的资料。设定类结果不引用世界条目。
- 代价：冻结数组在整个规划期间保留一份旧资料对象，内存上限约为一份 `artifacts`，可以接受。

### 5. 代码细节

- 低（L1）：`importSettings` 中的 `const profile=this.executionBudget(s,'analyze')`（`:1065`）已经不再使用，因为规划改由 `settingsPlan` 自己求预算（`:2158`）。它仍有一个副作用：缺少授权时提前抛出“请重新允许发送本次导入范围”。建议删除，或者加注释说明保留它是为了提前校验。tsc 未开启 `noUnusedLocals`，所以不会报出。
- 低（L2）：`requestSnapshot` 的注释（`:2113`）写的是“from the current s.artifacts”，但现在 `catalog` 也可能来自冻结资料。建议改为“由调用方从同一份资料构建”。
- 观察：每个设定请求的产出也要先等一次 `planTurn`（`:1072`），所以总轮次等于让出数加请求数再加 1。四项轮转时，每项每 4 个迭代推进一次。迭代中还有世界条目的组包（每条 40–55 ms）和保存（88–139 ms），设定规划的墙钟时间会比 HEAD 的约 28 s CPU 更长，四项设定批次的发出时间也会推后。这符合方案目标（以响应性换取规划延后），但目前没有任何证据报告第16步总耗时或首个设定批次的发出时间相对 HEAD 的变化，见 M3。

## 四、用例质量

### 中

- **M1 WR-07 的前提断言太弱**（`tests/unit/novel-import-world-step-planning-slices.test.ts:80-82`）。`sent.some(x=>x.worlds>0)` 只证明某个设定批次是在世界条目提交之后**发出**的。设定批次要等该项全部规划完才发出，所以这个断言证明不了提交发生在**规划期间**。如果提交恰好落在规划结束到发出之间，即使不冻结也会得到相同的请求，测试就会空过。现在 0 延迟加 30 章大概率能覆盖到规划期间，但这一点没有被断言。建议用 `instrument()` 记录每项最后一次 `next()` 的时间，并断言至少一项设定在规划结束前已有世界条目提交（例如在 AI 处理器中记录第一个世界条目返回的时间，与该项最后一个分片的时间比较）。另一种做法是加一个反证：用实时 `s.artifacts` 离线规划，结果应与实际发出的请求不同。
- **M2 缺少 WR-10**（566 3R-8）。方案要求回归覆盖“非向导 `stageRequests` 调用点在两批之间提交后，下一批 entities 含新实体”。在 `tests/unit` 中检索，没有找到对应用例。现有的 `novel-import-scene-planning-yield.test.ts` 只覆盖让出时序。第1项的代码分析表明行为不变，但这是方案明确要求的回归证据，应补上，或者在台账里写明由哪个已有用例覆盖。
- **M3 验收证据不全。** 565 3R2 要求在 `SHAKEINK_IMPORT_DEBUG=1` 下用 `monitorEventLoopDelay` 打印 `loop-delay`，但 `desktop/` 中检索不到。`docs/requirements-traceability.json` 中也还没有 NI-19。WR-R1/R2（与 `bd2f779` 做哈希比对）只存在于未跟踪的 `scripts/zz-real-*.ts`，尚无结果文档。另外，建议在 WR-R3 中同时报告第16步总耗时和首个设定批次发出时间，与 HEAD 比较（见三.5 的观察）。按 AGENTS.md，这些在标记完成前都必须有证据。`scripts/zz-real-*.ts` 是临时脚本，不应提交。

### 低

- **L4 WR-06a**（`:95-101`）的等待循环最多 20 s，结束后没有断言信号已经出现。如果始终没等到 theme 分片，测试照样执行跳过。如果跳过发生在 theme 规划完成之后、等待 lane 的时候，会命中 `:1099` 的旧检查，测试通过却没有覆盖新代码。建议断言跳过时 theme 生成器尚未结束（例如在包装器中记录 `done`）。`probe.yields.count` 统计的是全部设定的让出，不是 theme 的，可以接受。
- **L5 WR-06b**（`:110-115`）同样没有断言等待信号已出现。`calls.next<=after+4` 留了 4 次余量，但暂停返回时作业已经排空，实际应为 0 次，可以收紧为相等。566 3R-5 要求的“暂停后无新的设定批次请求”没有断言，建议记录 AI 请求并加上。
- **L6 WR-08** 只断言了迭代次序。566 3R-6 中“规划期间 `setTimeout` 计时器有触发”没有实现。按 Node 的语义，迭代次序已经隐含 poll 阶段会被执行，补一条断言成本很低。
- **L7 运行时长与并发。** 大夹具文件约 106 s，WR-05、WR-09 各约 21 s。在 `npm test` 并行时会占用 CPU，可能影响其它对时间敏感的文件。本文件的阈值余量足够：最长分片 20 ms，阈值 100 ms，余量 5 倍。WR-05 的让出数断言是确定性的，不会不稳定。建议在用例文档中记录本机耗时，并观察全量运行时其它性能用例是否变得不稳定。
- WR-01 的上限 `4+entities+8`（`novel-import-world-step-responsiveness.test.ts:41`）与 566 3R-9“设定规划不超过 4 次”的口径一致，但 `+8` 余量的来源没有在注释里说明（566 审核低1）。

## 五、汇总

| 严重度 | 编号 | 内容 |
|---|---|---|
| 高 | — | 无 |
| 中 | M1 | WR-07 没有证明提交发生在规划期间，可能空过 |
| 中 | M2 | 缺少 WR-10（非向导调用点两批之间提交后目录更新） |
| 中 | M3 | `loop-delay` 调试输出、NI-19 台账、WR-R1/R2 哈希比对结果尚缺；建议报告第16步总耗时和首个设定批次时间 |
| 低 | L1 | `importSettings` 中 `profile` 未使用（`:1065`） |
| 低 | L2 | `requestSnapshot` 注释过时（`:2113`） |
| 低 | L3 | 单调分支和 `!budgetPolicy` 分支忽略 `sliceMs`，应在注释中写明 |
| 低 | L4–L7 | WR-06a/06b 信号未断言、余量偏松；WR-08 缺计时器断言；大夹具耗时 |

审核的问题 1–4 结论：其它调用点行为不变，传 `frozenCatalog?.()` 正确；规划泵不会丢失或悬挂等待者，`planScheduled` 复位正确，多控制器互不影响；halt 时抛出 `SettingsTaskSkipped` 不会把任务标为 failed，也不会改变用户看到的错误；冻结资料与 `ai()` 重新组包及下游校验一致。
