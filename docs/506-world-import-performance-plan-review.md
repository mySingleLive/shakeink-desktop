# 506 世界观导入提速与设定类型标识方案 · 独立审核

日期：2026-11-04。审核对象：`docs/506-world-import-performance-plan.md`。依据为当前工作树（含 503 未提交改动，不审 503 本身），行号按工作树。未修改任何源文件。

## 一、第2节事实核对

| 方案声明 | 核对结果 |
| --- | --- |
| world 用 4 路 | 属实。`desktop/main/novel-import.ts:47` 的 `WIZARD_ENTITY_CONCURRENCY=4`，`:824` 只有 character/scene/item 用 31 路，world 落到 4 路。world 没有图片类型（`desktop/shared/novel-import-wizard.ts:28`），2 个图片 worker 空转。 |
| 轻量策略不含 world | 属实。`desktop/service/novel-import-ai.ts:998` 只放行 roster 和 character/scene/item entity；`:1001` 对其它请求直接 `work()`，随后经 `generateText` 的 `withLongTask` 排队（`src/lib/ai/generate.ts:76`，`src/lib/long-task.ts:47-49`），默认 2 路，可配置，与聊天共用。 |
| scopeHash 缓存不含 world | 属实，`desktop/main/novel-import.ts:1523`。 |
| `coalesced` 不含 world | 属实，`:762`。 |
| world instruction 携带全部已选项 | 属实。`:1045` 的 `indexed` 只对 character/scene/item 为真，`:1047` 于是 `relevant=selected`，`:1049-1050` 把全部约 240 项拼进 instruction。结构化 `entities` 在发送前已按 prose 和 parent/worldId 链裁剪（`desktop/core/novel-import-ai-payload.ts:25-30`），重复传输的只有 instruction 这份目录。 |
| 设定 `dependsOn` 所属世界（`:1018`） | 内容属实，行号应为 `:1025-1028`。子世界还依赖上级世界，所以“主世界 → 子世界 → 子世界设定”是三段串行。 |

结论：第2节的事实都成立，只需修正一处行号。但第2节漏掉了真正的瓶颈，见高1。

## 二、问题（按严重程度）

### 高1：主题/文风/金手指/爽点泪点四项任务在现方案下不可能 60 s 内完成

第1节把这四项计入 60 s，但第3节没有改它们（“同池”是现状，不是改动）。

- `importSettings`（`desktop/main/novel-import.ts:859-868`）对**整卷** `workingImportUnits(s)` 用 `stageRequests` 分批，并在 `for…await` 里**逐批串行**调用。第一卷约 760 个单元（503 第2节），每个单元约 1000 字，按 `profile.characters` 分批：120000 字预算（`desktop/core/novel-import-budget-policy.ts:16`，仅上下文 ≥262144 的模型）至少 7 批；12000 字预算（`:17`）约 60 批。
- 这些请求是 `phase:'analyze'`，`intent` 为空，方案第3节第2项之后仍不属于 `lightImportGeneration`。它们会继续走 2 路长任务队列，并保留默认 thinking。每批输入接近满预算，单批耗时远高于 2.5 s。
- 四项各占一个 worker，每项串行 7–60 次调用。即使只有 7 批、每批 10 s，单项也要约 70 s。这一项单独就超过 60 s。
- 另外 `stageRequests` 的非单调路径（`:1462-1469`）每加一个单元就做一次 `requestSnapshot` 加整包序列化。760 个单元在主进程上会产生约 O(n²) 的序列化开销，四项共四轮，这部分 CPU 时间也算在 60 s 里。

要求方案明确选择以下一种并写出依据：
(a) 让各批并行。`contextArtifacts`（`:1874-1877`）只读 `s.artifacts`，不读前一批的 `found`，所以批次之间相互独立，可以放进导入通道并行。并行时必须和 31 个 entity 共用同一个在途上限，见中3。是否同时关闭 thinking 属于质量取舍，需要用户决定。
(b) 经用户确认后，把这四项移出 60 s 的计时口径。
不做任何处理时，第5节的 E2E 必然不通过。

### 高2：240 项零失败的风险与 496 物品 r1/r2 相同，方案没有对策

- world 不是 `indexed`，`entitySchemaFeedback(error,indexed,kind==='scene')`（`:1067`，`:76-80`）对 world 关闭了 no-match 纠错和“JSON 不可解析/输出未完整结束”纠错。模型自抄 quote 失败、或输出被截断时，任务直接失败。物品 r2 正是在第 39 项因 no-match 失败（`docs/496-item-import-performance-verification.md:36-39`）。world 任务数约是物品的 2 倍，LEVEL_SYSTEM 的 content（levels/pathways）输出更长，关闭 thinking 后更容易被截断。
- 503 新增的 `superRefine`（`desktop/service/novel-import-ai.ts:519-523`）只让 content 结构错误进入纠错，不覆盖上面两类错误。
- 方案第3节写明“不给 world 加 evidenceOptions”，第5节又要求零失败，两者之间缺少保障。要求：至少评估把 no-match 和 JSON 两类错误加入 world 的单次纠错。纠错条件必须单独定义，不能复用 `indexed`，见中1。E2E 记录每个请求的耗时分布、重试次数和失败类别。注意：每次纠错都会让该项耗时翻倍。

### 中1：第5项目录裁剪不能复用 `indexed`

`indexed`（`:1045`）现在包含 item，同时控制 `characterEvidenceOptions`（`:1049`）、纠错白名单（`:1067`）和重试提示里“sourceUnitIds 由应用计算”这句（`:1069`）。服务端只对 `indexedEntityRequest`（`desktop/service/novel-import-ai.ts:374`，不含 world）派生 sourceUnitIds。如果把 world 加进 `indexed`，world 会收到 evidenceOptions，重试提示也会错误地告诉模型不必填 sourceUnitIds，违反方案“不加 evidenceOptions”。要求使用独立条件，并在用例中断言：world 请求不含 `entityTarget.evidenceOptions`，重试提示仍是非 indexed 文本。

裁剪范围还要补一类：MAP 设定的 `parentId` 可以指向另一个 MAP 设定（`desktop/service/novel-import-ai.ts:882`）。“目标的所属世界/上级世界”应改为“目标的 worldId 和 parentId 链（含上级设定）”。

### 中2：主世界是单点关键路径，请求可能很大，方案没有估算

- 主世界的 `hits` 是 `evidenceUnitIds`（最多 200 个，`desktop/core/novel-import-wizard-roster.ts:72`）加上包含名称的单元（`:1039`），再取 `splitImportBatches(...)[0]`（`:1041`）。所以主世界请求会装满一整批预算（最多 120000 字、300 个单元）。
- 200 多个设定都要等主世界 `done`。而 `done` 要等 commit 的 `serial` 和一次完整 journal 写入之后才设置（`:770-786`）；空闲 worker 每 20 ms 检查一次，并强制提交（`:813`）。如果主世界失败，`busy()` 为假，整步停在等待作者处理（`:808`）。
- 第6项（WORLD 优先领取）基本不起作用：开始时可领取的只有各世界任务和四项 settings 任务，31 路会一次全部领取。真正需要的是：E2E 单独记录主世界请求的单元数、字数和耗时，以及子世界链的耗时；如果主世界耗时明显超过平均值，再考虑限制它的单元数（属于 units 选取变更，需另行说明）。

### 中3：并行化以后的运行时证据容量

runtime 在途上限是 `IMPORT_RUNTIME_MAX_CALLS=32`（`desktop/core/novel-import-runtime-proof.ts:3,15`）。31 个 worker 各自只发一个请求时不会超限。如果按高1(a)在 settings 任务内部并行发出各批，在途数会超过 32，触发“运行时调用证据容量已满”，这个错误在 `SCENE_FATAL`（`:74`）中，会终止整步。并行的批次必须占用同一个 31 路名额。另外，runtime.json 只保留最近 64 次调用（496:58），240 多次调用的耗时分布需要驱动另外采集。

### 低1：第5节没有列出必须修改的旧测试

实现后以下断言必然失败，方案应写明改为什么：
- `tests/unit/novel-import-character-performance.test.ts:65`（CP-02）循环含 `{kind:'world'}`，预期返回原对象。
- `tests/unit/novel-import-scene-performance.test.ts:16`（SP-01）含 `{kind:'world'}`。
- `tests/unit/novel-import-item-performance.test.ts:70` 含 `{kind:'world'}`；`:38` 断言 `WIZARD_ENTITY_CONCURRENCY===4`，注释为 “world and other entities keep four”。
另外，改完后 `WIZARD_ENTITY_CONCURRENCY` 在 `:824` 不再有使用者，应删除或说明。`desktop/service/novel-import-ai.ts:1004` 的注释需同步。

### 低2：图标复用应改用已导出的 `getTabIcon`，不必修改 Web 文件

- `SETTING_TYPE_ICONS`（`src/stores/tabs.ts:119`）没有导出。方案要“导出为具名常量”，就得修改一个 Web 来源文件。`getTabIcon` 已经导出（`:134`）：`getTabIcon({type:'world'})` 返回 Globe，`getTabIcon({type:'setting',settingType})` 返回对应图标（`:147-150`），可以直接复用，不改 `tabs.ts`，与工作台树和 tab 条一致。这样更符合 AGENTS.md “复用 Web 真实组件、上游来源不改”的约定。向导属于桌面专属区域，不在必须复用的组件清单里，所以这里没有硬冲突。
- 引入成本：`tabs.ts` 的运行时依赖是 zustand、sonner、lucide 和 `./scene-ui`。`scene-ui` 对 MarkdownEditor、content/types、composer-editor 都只用 `import type`，编译后会被擦除。`NovelImportDialog.tsx:8` 已经引入 `@/stores/tabs`，同一个 bundle 不会变重，路径别名也可用。
- 九种世界设定的图标互不相同，也都不同于 Globe，满足“每种类型不同图标”。
- 标签有分歧：向导的 `SETTING_LABELS`（`NovelImportWizard.tsx:22`）是“概念/地图/势力/地理”，工作台的 `SETTING_TYPE_LABELS`（`src/lib/setting-types.ts:36-48`）是“概念体系/世界地图/势力分布/地理环境”。方案说图标要“与工作台一致”，标签却沿用向导的。应明确选哪一套。用户举例时用的是“势力、概念”，所以保留向导标签也可以，但要写明理由。
- 第15步识别树已经显示类型标签（`:141`），只缺图标。第16步卡片目前只有名称，`hint` 只服务 sceneHint（`:151,158`）。方案应写明卡片上类型标签的位置，以及 world 卡片取图标的条件（`candidate.kind==='world'` 或 `'world-setting'`）。

## 三、60 s 可达性估算

只看 entity 部分，按物品 r3 的数据（p50 2518、p90 3928、max 7390 ms，31 路，`docs/496-item-import-performance-verification.md:58`）推算：
- 首次来源校验加主世界请求：主世界满批输入，估计 3–8 s；有子世界时再加一段。
- 约 235 个设定在 31 路上连续领取：235 × 平均约 3 s / 31 ≈ 23 s，加尾部约 7 s。世界设定的 content 比物品字段长，平均耗时可能更高。
- 来源校验每 16 项触发一次（`:767`），约 15 次。每次都会让全部 worker 等待，需要实测。
- 合计约 35–45 s，在零重试时可以达到。出现一次纠错，该项耗时翻倍，余量就基本没有了。

加上四项 settings 任务后，按现方案不可达（高1）。这是唯一确定的阻断项。主世界请求的大小（中2）和零失败要求（高2）是主要的不确定项。

## 四、第3节逐条结论

1. 31 路：正确。注意 `WIZARD_ENTITY_CONCURRENCY` 会因此失去用途（低1）。
2. 轻量策略加导入通道：对 world entity 正确，`runImportGenerationLane` 用 `runInsideLongTask` 绕过长任务名额（`src/lib/long-task.ts:37-39`）。但它不覆盖 settings 任务（高1）。
3. scopeHash 缓存：正确。world 的两次调用都以 `verified=true` 发出（`:1063,1070`）。
4. 合批提交：正确。world 和 settings 结果仍在 `serial` 内经 `mergeImportArtifacts` 合并，与逐项提交的状态变化相同。合批不改变同名设定按 `artifactKey`（kind+名称）判定冲突的既有行为。
5. 目录裁剪：方向正确，按中1使用独立条件，并补上 parentId 链。
6. WORLD 优先领取：无害，但收益接近零（中2）。

## 五、结论

**需修订**：
1. 处理四项 settings 任务：批次并行进入导入通道（并共用 31 路名额），或经用户确认移出计时口径（高1、中3）。
2. 给出 world 零失败的保障：评估 no-match 和 JSON 两类错误的单次纠错，使用独立条件（高2、中1）；E2E 记录每个请求的耗时分布、重试次数、失败类别，以及主世界请求的规模和耗时（中2）。
3. 目录裁剪不复用 `indexed`，并补上 parentId 链（中1）。
4. 第5节列出 CP-02、SP-01、item-performance `:38,:70` 的断言更新，处理 `WIZARD_ENTITY_CONCURRENCY`，同步 `:1004` 注释（低1）。
5. 图标改用 `getTabIcon`，不修改 `src/stores/tabs.ts`；明确使用哪套标签，以及卡片标签的位置（低2）。
6. 修正 `:1018` → `:1025-1028`。

修订后再进入用例审核。
