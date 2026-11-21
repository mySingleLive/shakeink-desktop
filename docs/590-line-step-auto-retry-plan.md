# 590 · 导入世界线/叙事线：出错自动重试 5 次 技术方案与测试用例（修订 2）

来源：用户 2026-11-19 修复要求。基于 `c0e98c9` 及工作区未提交的 docs/589 改动（保留，不改其内容）。修订 2 按 `docs/590-line-step-auto-retry-plan-review.md` 修改。

## 用户要求与约束

| # | 内容 |
|---|---|
| R1 | 导入世界线（步骤 17）、导入叙事线（步骤 18）出错时不立即停下等用户点[重试]，先自动重试 |
| C1 | 同一处出错最多自动重试 5 次 |
| C2 | 间隔按二进制退避：第 1 次 0 秒、第 2 次 1 秒、第 3 次 2 秒、第 4 次 4 秒、第 5 次 8 秒（用户 2026-11-19 选定第 5 次为 8 秒，而非原文的 16 秒） |
| C3 | 计数按“同一处”算；这一处重试通过后计数清零，下一处出错从第 1 次重新计 |
| C4 | 同一处 5 次后仍失败：停下并显示[重试]（与现在相同）；点[重试]后同样最多自动重试 5 次，从第 1 次计 |
| C5 | 不破坏已通过的功能与流程（AGENTS.md） |

## 现状

`NovelImportController.runLine`（`desktop/main/novel-import.ts:1178`）依次执行：复制来源条目 → `runLineParallel`（按章分批并发，批内已有“拆半/重跑一次”的局部重试和全步骤额外请求预算）→ 世界线空章补问 → `runWorldTimeline`（每段 2 次）→ `runWorldGrouping`（每段 2 次）→ 记录修复项 → 进入下一步。任一处抛错都进 `catch`（:1199–1203）：`stepState='failed'`、`stepError`、`phase='select'`，界面显示[重试]（`wizard-redetect`，:600，重新 `launch(wizardRun)`；按 coverage/`worldGapsAsked`/`worldTimeline`/`worldGrouped` 只补未完成部分）。

## 方案

### 1 外层循环

步骤 17/18（`kind!=='outline'`）的 `runLine` 把现有 `try` 体抽成 `lineBody(stage)`，外面套重试循环；`catch` 中的失败写入只在放弃重试时执行。中间失败**不写** `stepError`、`stepState`、`phase`，步骤保持 `running`，界面不出现[重试]，等待期间 `wizard-redetect` 也会因 `jobs.size` 被拒（:573）。步骤 19 细纲照旧只跑一次。

重跑安全性（审核已核对）：`copySourceKind` 只加缺失条目；冲突按 id 去重；`lineRepairs` 只在批次提交时累加，`recordLinesRepairs` 先删后写；正文分批只发未覆盖单元；补问、时间整理、归组由各自标记跳过。

### 2 “同一处”的位置键

`lineBody` 用一个 `stage` 变量记录当前阶段，失败时按阶段取键：

| 阶段 | 键 | 清零时机 |
|---|---|---|
| 正文分批 | 本次尝试中**真的发出过请求**（`ai()` 已回调 operationId）且失败的批次的每个单元 `unit:<id>`；没有任何已发出批次失败时（如预算拆分在发请求前失败）为 `lines` | 单元进入 `coverage[kind]` 时删该单元键；分批阶段整段完成时删 `lines` |
| 世界线空章补问 | `gaps` | `worldGapsAsked=true` 写入后 |
| 时间顺序整理 | `timeline` | `worldTimeline` 写入后 |
| 归组分级 | `grouping` | `worldGrouped` 写入后 |
| 其余（复制来源条目、记录修复项、进入下一步） | `step` | 不清零（步骤成功即结束循环） |

“已发出”用 `runLineParallel` 的 `track` 回调判定：给 `runLineParallel` 增加可选参数 `failedUnits:Set<string>`，`runJob` 抛出且本 job 记录过 operationId 时把它的单元加入集合。因此第一个真正失败的批次（它的错误成为 `halt.error`）会计入，`halt` 之后未发出就被拒的批次不计入。

### 3 计数

`runLine` 每次被调用时新建 `tries:Map<string,number>`，所以点[重试]或暂停后继续都从第 1 次计。

- 失败后：本次每个键各自 `+1`（未失败过的键不受影响，重新分批时边界变化也不会把别处的次数带给它）；`n=max(本次各键次数)`。
- `n≤5`：等待 `[0,1,2,4,8][n-1]` 秒后再跑 `lineBody`；`n>5`：按现状失败，错误文案为本次错误。
- 每次尝试结束（成功或失败）都按上表清零。

代价（写明）：多处轮流失败时，总尝试次数上限是 5×出错位置数；每次尝试的批内额外请求预算重新计算，最坏请求数约为现在的 6 倍；时间整理/归组分多段时，重试会重发已成功的段（与现在手动[重试]相同）。

### 4 不自动重试的错误（直接按现状失败）

重试结果不会变、或需要用户处理的错误：

- `reviewGlobalFailure(error)`（:162，含 `AbortError`、授权错误码与 RPC 后只剩文案的授权提示）；`AbortError` 仍按现状向上抛。
- `CandidateCommittedBlocked`、`PdfFileChanged`、`ImportRuntimePersistenceError`。
- 文案前缀：`请重新允许`、`模型配置或授权已变化`、`来源`、`保存`、`导入操作已`、`导入任务正在停止`、`本地服务`、`运行时调用证据容量已满`、`当前导入已结束`、`导入数据根已关闭`、`单个导入任务及完整元数据超过模型预算`、`语义检查点`、`推断设定累计超过本地容量限制`、`导入草稿超过本地保存容量限制`。

传输类（`模型接口请求失败`、`模型结构化输出请求失败`、`模型服务返回`）与模型输出类错误都自动重试。

### 5 等待

按 50 ms 分片等待，每片调用 `this.current(s,epoch)`：暂停/取消/会话变化在 50 ms 内抛 `AbortError`。0 秒等待也调用一次 `current`。调试开关 `SHAKEINK_IMPORT_DEBUG=1` 时输出 `line-step-retry {kind,stage,attempt,delayMs,reason}`（`reason` 用 `settingsFailureClass`，无正文或模型文本）。

测试钩子 `SHAKEINK_LINE_RETRY_UNIT_MS`：仅在 `SHAKEINK_TEST_ROOT` 或 `NODE_TEST_CONTEXT` 下读取，下限 1，默认 1000（“1 秒”的毫秒数）；与 `SHAKEINK_LINES_EARLY_MS` 同一做法。测试文件顶部设为 `1`。

## 测试用例（`tests/unit/novel-import-lines-performance.test.ts`）

“一次尝试”= 一次 `lineBody`。时间整理/归组每次尝试每段 2 个请求（合成书为 1 段）。

| ID | 场景（桩规则） | 期望 |
|---|---|---|
| AR-01 | 时间整理前 6 个请求失败（3 次尝试），之后成功 | 步骤 17 `done`；时间整理请求 7 个；事件批次数与无故障时相同 |
| AR-02 | 时间整理一直失败 | 6 次尝试（12 个请求）后 `failed`，`stepError` 为该错误；点[重试]后再 12 个（共 24），仍 `failed` |
| AR-03 | 退避间隔：钩子 100 ms，时间整理一直失败 | 第 k 次尝试首个时间整理请求与上一次尝试末请求的间隔 ≥ [0,100,200,400,800][k-2] ms |
| AR-04 | 含单元 U 的批次在前 3 次尝试都失败（HTTP 500），之后成功；时间整理前 10 个请求失败 | 步骤 `done`：时间整理请求 11 个（时间整理第 6 次尝试成功；若继承 U 的 3 次，时间整理第 3 次失败后即放弃）；含 U 的批次请求 ≥4 个 |
| AR-05 | 每次尝试失败的批次不同（每次尝试至多新增一个失败批次，共 4 个） | 步骤 `done`；每条 `line-step-retry` 的 attempt 都是 1 |
| AR-06 | 同一次尝试多批同时失败（两个批次各失败 5 次后成功） | 步骤 `done`（各自第 5 次重试成功）；若改为各失败 6 次则 `failed` |
| AR-07 | 空章补问一直失败 | 6 次尝试后 `failed`（不无限重试），`worldGapsAsked` 未写入 |
| AR-08 | 步骤 17 时间整理失败 5 次后成功，步骤 18 某批次一直失败 | 步骤 18 进行 6 次尝试后 `failed`（从 1 计） |
| AR-09 | 等待期间暂停（钩子 2000 ms，时间整理一直失败） | 暂停 < 1 s 完成，等待期间无新请求，步骤非 `failed`；继续后从第 1 次计 |
| AR-10 | 等待期间取消 | 取消 < 1 s 完成，无新请求 |
| AR-11 | 不重试：时间整理抛 `所选模型的密钥不可用，请在设置中重新配置`；另测运行中换模型（`setModels`）导致 `模型配置或授权已变化` | 立即 `failed`，时间整理请求数 = 1 次尝试的数 |
| AR-12 | 叙事线批次一直失败 | 6 次尝试后 `failed`；点[重试]后治愈则 `done`，只补未覆盖单元 |
| AR-13 | 细纲（步骤 19）失败 | 行为同现状（OP 用例不变） |
| AR-14 | 中间失败不外露 | 时间整理失败 3 次期间多次读 `view()`：`stepState.worldline==='running'`、`stepError===undefined`；`wizard-redetect` 被拒 |
| AR-15 | 调试行（`SHAKEINK_IMPORT_DEBUG=1`） | `line-step-retry` 行出现且不含正文片段（“风声”“渡口”） |

既有用例更新：

- WT-32、WG-31/WG-32、WG-13：失败时请求数 2 → 12；WT-32、WG-31/32 点[重试]后 3 → 13。
- LP-08b：单单元批次一直失败；上限改为 6×11 个请求。
- LP-08c：桩改为“每个单元第一次出现在多单元批次时失败一次”，期望改为步骤最终 `done`，且首次尝试仍因预算耗尽未完成（自动重试补齐）。
- LP-10：期望不变；坏批次判定改为 `r.units.some(u=>u.id===bad)`，不依赖分批边界。
- LP-15b：同样改判定；“失败批次未覆盖”改为“失败单元未覆盖”（后续尝试会把该批拆开，另一半可被覆盖）。
- AR-00（新增）：间隔常量、`countLineFailure` 计数/清零、不重试错误清单的纯函数用例。

## 验证

1. `npm test`（Node 24）全量通过，`tsc` 无错误。
2. 真实目标：步骤 17/18 的自然失败（模型偶发错误）无法按需触发，正式代码不加故障注入。真实环境只验证正常导入不回退（LOTM 卷一 lines 驱动）；自动重试路径以单元用例为证，不标为真实通过。
