# 565 · 进入“导入世界观”时界面卡死 技术方案

日期：2026-11-13。用户要求：导入作品流程刚进入第16步“导入世界观”时，有几十秒到 1 分多钟界面完全无响应（滚轮等所有操作无效），需修复。

## 1. 已证原因

主进程在第16步开始时为四项其它设定（主题、文风、金手指、爽点/泪点）规划批次：`importSettings` → `stageRequests`（`desktop/main/novel-import.ts:2137`）。这四类请求带上下文资料，属于“非单调”阶段，走逐单元规划：每加入一个单元都重新执行一次 `contextArtifacts` 并完整序列化请求（`requestFits` → `serializeImportAiPayload`），直到放不下才产出一批。`importSettings` 只在每产出一批后 `yieldToEventLoop()`（docs/514 之后加入），一批之内全部同步执行。Electron 主进程被占用时，整个窗口（含滚动）都不响应。

测量（只读副本，不发送任何内容）：

| 数据 | 规划总 CPU | 单段同步最长 | 说明 |
| --- | --- | --- | --- |
| 真实草稿 `~/shakeink-test-roots/cache-522/novel-imports/be3cebd1…`（诡秘之主第一卷，760 工作单元，第16步前 630 个实体），`scripts/zz-real-plan.ts`（临时，不提交） | 28.4 s / 40 批 | 1027 ms | 每批约 190 次逐单元试算；CPU 分布：载荷序列化 17.4 s、`contextArtifacts` 9.2 s |
| 合成全书 4.71M 字（`tests/unit/zz-world-freeze-probe.test.ts`，临时） | — | 4337 ms | 第16步期间主进程 79 段 >100 ms 的阻塞，合计 133.9 s；每段约 2.1 s |
| 合成 1.33M 字 | — | 2008 ms | 合计 17.8 s |

段与段之间只有一次 `setImmediate`，四项设定任务同时规划，相互接力，所以作者看到的是连续几十秒的无响应。

既有用例 WR-03（`tests/unit/novel-import-world-step-responsiveness.test.ts`）只用 120 章 × 2.6k 字的小夹具，最长阻塞 529 ms，低于 1500 ms 阈值，未暴露此问题。

## 2. 方案

目标：第16步规划期间主进程单段同步执行 ≤ 约 50 ms（与一次试算同量级），批次划分、请求内容与发送顺序逐字不变。

1. **逐单元规划分片。** `stageRequests` 的逐单元分支改由新的内部生成器 `stagePlan(…, sliceMs?)` 实现；传入 `sliceMs` 时，自上次让出起累计同步时间超过 `sliceMs`，就在下一次试算前产出常量 `PLAN_PAUSE`。`stageRequests` 保持原签名与行为（不传 `sliceMs`，从不产出 `PLAN_PAUSE`），其它调用点不变。
2. **第16步接入。** `importSettings` 用 `stagePlan(…, WIZARD_PLAN_SLICE_MS=12)`；遇 `PLAN_PAUSE` 执行 `await yieldToEventLoop(); this.current(s,epoch)` 后继续。停止/暂停/epoch 变化在每次让出后立即生效（`current` 抛出）。
3. **实体目录缓存。** 现在每次产出后丢弃 `catalog`（调用方可能在产出之间提交结果）。分片让出时同样可能有提交，因此让出后若 `s.artifacts` 引用或 `s.revision` 变化就丢弃 `catalog`，否则保留（每次重建约 27 ms，若每次让出都重建会抵消分片收益）。所有提交（`commit`、冲突处理等）都经 `save()` 使 `revision` 加一，因而能被检测到。批次最终请求取自最后一次试算，其内部一致；与改动前一样，规划完成到发送之间的提交不回溯到已规划请求。
4. **不改：** 批次划分算法（逐单元与贪心路径）、`contextArtifacts`、载荷格式、提示词、并行与名额、其它阶段（角色/场景/物品/世界条目、第17–21步、非向导流程）的规划。

## 3. 取舍

| 方案 | 结论 |
| --- | --- |
| A. 分片让出（采用） | 批次与请求逐字不变（不影响 DeepSeek 前缀缓存与质量，见 lotm-cache-inflation 约定“质量优先”）；总 CPU 不变（真实约 28 s，仍与世界条目并行），但窗口全程可响应。 |
| B. 二分/增量估算减少试算次数 | `contextArtifacts` 随批次文本非单调（超预算时跳过），二分得到的批次可能与逐单元规划不同，改变请求内容；需另行评估质量与缓存，本次不做。 |
| C. 四类设定共用一份规划 | 载荷含 `kind` 字段，长度不同（`goldenFinger` 比 `theme` 多 7 字符），边界批次可能不同；同样改变请求，本次不做。 |
| D. 把规划移到 worker 线程 | 需要序列化整个会话（约 17 MB）并改动规划依赖的控制器状态，改动面大，不做。 |

B/C 可作为后续“缩短第16步设定开始时间”的独立优化，需用户另行决定。

## 4. 验证

- 单元：新 WR-04（全书规模合成夹具，第16步主进程最长阻塞 ≤ 阈值）；新 WR-05（分片前后四类设定的请求序列逐字相同）；新 WR-06（分片让出期间停止导入，之后不再发送任何设定批次）；新 WR-07（让出期间提交新结果后，下一批请求的 entities 含新提交实体）；既有 WR-01..03、设定/世界性能用例不变。
- 全量 `npm test`（Node 24）、typecheck、`build:desktop`。
- 真实数据：用真实草稿只读副本重跑 `zz-real-plan`，单段同步最长 ≤ 50 ms 且请求序列与改前相同（哈希比对）。
- 真实目标：在安装版/构建版应用中用《诡秘之主》第一卷进入第16步，监测主进程事件循环阻塞并实际滚动界面（需真实模型调用，执行前确认余额与用户许可）。

## 3R. 独立审核后的修订（以本节为准）

审核见 `565-world-step-planning-freeze-plan-review.md`，全部采纳。

**基线更正（审核高3）。** HEAD（`bd2f779`）的 `importSettings` 一次同步展开全部批次。工作树中已有上一轮未提交的改动：`yieldToEventLoop`、每批产出后让出一次、`entityCatalog` 拆分与规划期目录缓存（`git diff desktop/main/novel-import.ts`），以及未跟踪的 `tests/unit/novel-import-world-step-responsiveness.test.ts`（WR-01..03）。本方案在其上修改；“请求不变”指与 HEAD 相同。

1. **规划资料在开始时冻结（审核高2，取代第2节第3项与 WR-07）。** HEAD 中四项设定都在第16步开始时同步规划完，世界条目尚无提交，所以请求只依赖步骤开始时的 `s.artifacts`。新实现在 `importSettings` 开始规划时取 `const frozen=s.artifacts`，`contextArtifacts(s,batch,budget,frozen)` 与 `entityCatalog(s,frozen)` 增加可选的资料列表参数（缺省为 `s.artifacts`，其它调用点不变），整项规划只读这份快照。这样批次与请求与 HEAD 逐字相同，与让出次数、提交时机无关；世界条目在规划期间提交的结果像 HEAD 一样不进入本项设定请求。`ai()` 使用规划时已填入的 `entities`，不会重新读取。
2. **单一规划泵（审核高1）。** 控制器级 `planTurn()`：等待者入队，由一个 `setImmediate` 回调每次只放行一个规划器，并在回调内为下一个等待者重新排队。Node 在 check 阶段只执行本阶段开始前已排入的 immediate，所以每个事件循环迭代最多运行一个规划分片，四个规划器之间一定会处理 I/O、IPC 和输入。分片预算 `WIZARD_PLAN_SLICE_MS=8`：自分片开始累计超过 8 ms，就在下一次试算前产出 `PLAN_PAUSE`。真实数据单次试算 15–25 ms（加世界条目后约 30 ms），因此单个迭代由规划占用的时间约为 1–2 次试算。
3. **目录只建一次（审核中1）。** 冻结后目录只依赖 `frozen`，用控制器级 `WeakMap<ImportArtifact[],ImportSemanticEntity[]>` 按数组引用缓存，四项共用（四项冻结的是同一个数组），每次取用时深拷贝 `unitIds`（与现有 `requestSnapshot` 一致）。不再使用 `revision` 判断。该缓存只在设定规划中使用。`resolveWizardReferences`（`:1053`）原地修改资料，但它发生在步骤结束，之后重新进入第16步（`retryKind`）会重新赋值 `s.artifacts`，因此不会读到旧缓存。
4. **让出后检查跳过与停止（审核中3）。** 每次 `PLAN_PAUSE` 让出后依次执行 `this.current(s,epoch)`；`halted()` 或 `task.state==='skipped'` 时抛 `SettingsTaskSkipped`，不再继续规划（worker 的 commit 对已跳过任务和全局停止的处理不变）。
5. **其它调用点（审核低1）。** `stageRequests` 改为 `stagePlan` 的包装，不传分片选项：不产出 `PLAN_PAUSE`，每次真实产出后仍丢弃 `catalog`，行为与现在相同。单调路径不变。
6. **范围说明（审核中2）。** 本次只消除规划造成的连续阻塞。第16步期间仍有一些单段同步执行，未改：每次提交的 `save()` 88–139 ms（另加视图 24–48 ms）、设定任务合并 165–358 ms（每项一次）、世界条目 `ai()` 组包重建目录 40–55 ms（每条一次）。它们是间隔出现的单次停顿，不会连成几十秒；验收会测量并报告全程最长单段阻塞。
7. **目标值。** 规划造成的单次事件循环阻塞 ≤ 100 ms（真实草稿）；第16步全程最长单段阻塞以实测为准并报告。WR-01 的目录构建上限按“每项一次、世界条目每条一次”修订。

## 4R. 验证（取代第4节单元部分）

- WR-04：约 1.3M 字的合成全书，世界条目回复延迟以使提交落在规划中，测量第16步主进程最长事件循环阻塞（阈值见用例文档）。
- WR-05：纯生成器比较：同一冻结状态下，`sliceMs=0`（每次试算都让出）与不分片的规划产出的请求序列 JSON 逐字相同。
- WR-06：规划让出期间跳过该设定任务或停止导入，之后不再发出该项设定批次，也不再继续试算。
- WR-07（新含义）：世界条目在设定规划期间提交，设定请求的 `entities`/`artifacts` 仍等于步骤开始时的资料所得（与不让出的规划相同）。
- WR-08：四项设定同时规划时，两次连续的规划分片之间至少经过一次 I/O 轮次（以 `setTimeout(0)` 计时器在规划期间按时触发为证）。

## 3R2. 用例审核后的调整

- 3R-3 的控制器级 WeakMap 改为每次 `importSettings` 调用内的局部目录缓存（四项各建一次），消除陈旧缓存风险（566 审核）。
- 设定批次请求构建抽为私有方法 `settingsBatchRequest`，供 `importSettings` 和 WR-05 共用。
- 主进程在 `SHAKEINK_IMPORT_DEBUG=1` 下用 `monitorEventLoopDelay` 打印 `loop-delay`，供真实目标验证；默认不启用。
