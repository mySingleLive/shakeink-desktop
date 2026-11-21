# 493 物品导入提速方案 · 独立审核

日期：2026-11-03。审核对象：`docs/493-item-import-performance-plan.md`。依据为当前工作树（含 490–492 未提交改动），行号按工作树。未修改任何源文件。

## 一、第2节事实核对

| 方案声明 | 核对结果 |
| --- | --- |
| item 用 4 路，角色/场景 31 路 | 属实。`desktop/main/novel-import.ts:47-49` 定义 `WIZARD_ENTITY_CONCURRENCY=4`、`WIZARD_CHARACTER/SCENE_CONCURRENCY=IMPORT_RUNTIME_MAX_CALLS-1`；`:814` 只有 character/scene 用 31 路。`IMPORT_RUNTIME_MAX_CALLS=32` 见 `desktop/core/novel-import-runtime-proof.ts:3`。 |
| 轻量策略不含 item，item 走长任务队列，默认 2 路，继承默认 thinking | 属实。`desktop/service/novel-import-ai.ts:985` 只放行 roster 和 character/scene entity；`:986` 对 item 原样返回 resolved；`:988` 对 item 直接 `work()`，不进入 `runInsideLongTask`。`generateJSON` 调 `generateText`，后者走 `withLongTask`（`src/lib/ai/generate.ts:76`）；`acquireLongTask` 按 `getCostConfig().maxConcurrentTasks` 设限（`src/lib/long-task.ts:40-41`），默认值为 2（`src/lib/ai/cost-config.ts:9`）。需补一句：这个上限可由用户在 1–8 之间配置，并且与聊天共用，所以“最多 2 路”只是默认配置下的上限。 |
| scopeHash 缓存只用于 character/scene entity | 属实。`desktop/main/novel-import.ts:1513` 的条件为 `intent==='entity'&&(kind==='character'||kind==='scene')`，或带 sceneIdentity 的 scene roster；其它请求每次调用 `importScopeHash`。 |
| `coalesced` 只含 character/scene | 属实，见 `desktop/main/novel-import.ts:752`。 |
| item 的 instruction 携带全部已选物品 | 属实，但行号有偏差。`:1037` 在 `indexed` 为假时 `relevant=selected`（`indexed` 只对 character/scene 为真，见 `:1036`）；instruction 拼接在 `:1039-1040`。结构化 payload 已经按 prose 裁剪 entities（`desktop/core/novel-import-ai-payload.ts:25,30`），所以真正重复传输的只有 instruction 里的这份目录。 |

结论：第2节的因果关系全部成立，只需修正 1037→1037/1039 的行号，并说明 2 路来自可配置的默认值。

## 二、问题（按严重程度）

### 中1：第5步不能复用 `indexed` 标志，方案需写明

`indexed`（`desktop/main/novel-import.ts:1036`）同时控制以下几项：
- `prose` 的计算与目录裁剪（`:1036-1037`）
- `characterEvidenceOptions`（`:1039`）
- `entitySchemaFeedback(error,indexed,…)` 的引文 no-match 白名单（`:1062`，`:75-77`）
- 重试提示（`:1064`）。`indexed` 为真时提示写的是“sourceUnitIds由应用计算，模型无需填写”。

服务端只有 `indexedEntityRequest`（`desktop/service/novel-import-ai.ts:374`，只含 character/scene）才派生 sourceUnitIds（`:498-503`）。如果实现时为了裁剪目录把 item 加进 `indexed`，item 会收到 evidenceOptions，重试提示也会错误地告诉模型不必填 sourceUnitIds。这两点都违反方案第3节“不扩展”的约束，并会直接造成校验失败。要求：方案第5步写明使用独立条件（例如 `trimCatalog=indexed||kind==='item'`），只用于 `relevant`。IP-06 增加断言：item 请求不含 `entityTarget.evidenceOptions`，重试提示保持非 indexed 文本。

### 中2：30 秒估算的依据偏弱，零失败的风险没有列全

- 单请求负载不同。场景按归属取材（`sceneOwnedUnits`）；item 用 `splitImportBatches(...,profile.characters,profile.maxUnits)[0]`（`desktop/main/novel-import.ts:1031`），一般会装满一整批预算的正文。按场景 4.4 s/请求推算 item 的耗时并不可靠。约 100 项、31 路需要 4 波，30 s 要求每个请求的最大耗时约 7 s 以内。任何一项触发一次纠错重试（`:1065`），耗时就翻倍，很可能单独越过 30 s。
- 关闭 thinking 以后，失败类型不止 no-match。item 的纠错白名单只包含结构错误（`entitySchemaFeedback` 的 allowEvidence 和 allowScene 都为假）。“模型未返回可解析的 JSON”和“模型输出未完整结束”对 item 不重试（`:78` 仅限 scene），会直接失败。场景 R8 在关闭 thinking 后就出现过这类失败（`docs/253-scene-performance-plan.md` R8 一节）。item 还要由模型自己抄写 sourceUnitIds，角色 r6 在这一点上出现过连续失败（`docs/246-character-performance-plan.md:57`）。
- 要求：第5节补上 JSON 不可解析、输出未结束、sourceUnitIds 抄写这几类风险。第4节的 E2E 增加记录每个请求的耗时分布（p50/p95/max）、重试次数和失败原文类别，这样超时或失败时能定位原因，不用靠推测。

### 低1：第4节没有写出旧测试的更新

以下现有断言把 item 当作“不走轻量策略”，实现后必然失败：
- `tests/unit/novel-import-character-performance.test.ts:65-67`（CP-02）：循环里包含 `{kind:'item'}`，预期为 `output===resolved`。
- `tests/unit/novel-import-scene-performance.test.ts:15`（SP-01）：循环里包含 `{kind:'item'}`，预期原对象。

`docs/494-item-import-performance-cases.md:7`（IP-03）已经提到这两处，但 493 第4节没有写，需补上，并写明 CP-02 的预期改为“roster、scene entity、item entity 返回副本，其余返回原对象”。其它测试经检查不受影响：SI-07a 和 RW04 只涉及 scene；`novel-import-character-scope-cache.test.ts:23` 只覆盖 character 的 unverified 和普通分析；仓库中没有测试断言 item 是 4 路。另外，`desktop/service/novel-import-ai.ts:979` 和 `:991` 的注释写的是“character and scene / Name lists”，需同步改。

### 低2：计时范围包括图片任务

第1节以“全部任务 done”作为计时终点。如果启用了物品图标（`WIZARD_IMAGE_OWNER.icon='item'`，`desktop/shared/novel-import-wizard.ts:28`），`planEntityTasks` 会为每项生成一个 image 任务（`desktop/main/novel-import.ts:1014`）。图片任务仍是 2 路，不受本方案影响，30 s 必然达不到。默认 `images.icon=false`（`desktop/core/novel-import-wizard-state.ts:35`）。方案应写明本次 E2E 不启用物品图片，或把图片任务排除在计时之外，避免到时口径不清。

## 三、专项问题回答

(a) **把 item 纳入合批提交，合并或冲突行为是否改变？** 不改变。`coalesced` 只影响三件事：用 `committing` 等待正在进行的写入后再取当前批次（`:764-766,788`）；取批前检查 epoch（`:766`）；写失败时调用 `stop(error)`（`:789`）。合并逻辑本身与是否合批无关：批内结果在同一个 `serial` 回合里逐项执行 `remaining=s.artifacts.filter(id≠)` → `mergeImportArtifacts`（`:775-779`），与逐项提交时的状态变化相同。结果仍按完成顺序处理，与现状一致。写失败的处理在现状下也会经 worker 的 `.catch(stop)`（`:814`）全局停止，所以 `stop` 只是提前执行。item 的同一身份按 `artifactKey`（kind+规范化名称，`desktop/core/novel-import.ts:264,267`）判定，与合批无关，现有风险不增加也不减少。

(b) **旧测试** 见低1。

(c) **31 路并发与共享状态。** 安全。对 `s.artifacts`、`s.conflicts`、`w.deferredConflicts` 和任务状态的修改都在 `this.serial` 内完成（`:770-786`，`serial` 见 `:234`）。worker 只读任务列表，并用 `claimed` 防止重复领取（`:793-805`）。冲突只会在两个 artifact 的 `artifactKey` 相同时产生（`desktop/core/novel-import.ts:322-337`），出现的概率取决于清单内容，与并发数无关。runtime 证据最多 31 个在途，低于 32 的上限；图片请求不计入 runtime token（`generateWizardImage` 只登记 `imageOperations`，见 `desktop/main/novel-import.ts:1165` 起），因此不会超出上限。

(d) **目录裁剪是否丢失必要信息。** 不会。结构化 `entities` 已经按 `prose.includes(name)` 裁剪（`desktop/core/novel-import-ai-payload.ts:25`）；方案的 instruction 裁剪同时匹配名称和别名，范围不小于前者。目标始终保留。引用校验使用完整的 `request.entities`（`desktop/service/novel-import-ai.ts:874,1059`），不受影响。item 没有 parentId（`wizardEntity`，`desktop/main/novel-import.ts:140`），所以不需要像 scene 那样补齐上级链。唯一的实现风险是中1。

(e) **30 秒目标还缺什么。**
- `verify()` 的频率影响很小：每 30 s 或每 16 项检查一次（`:759`），约 100 项共 6–7 次。首次检查会让 31 个 worker 一起等待，耗时取决于第一卷原件的散列时间，建议在 E2E 中记录。
- 网络重试使用 `maxNetworkRetries` 的默认配置（`src/lib/ai/generate.ts:113`）。31 路下遇到 429 或网络抖动时，单项耗时会变长，应在耗时分布中观察。
- 单请求负载和纠错重试见中2，图片任务见低2。
- runtime.json 的写入在每次调用时串行进行（`recordRuntime`/`writeWizardRuntime`，`:1499-1500`），与场景相同，已验证可在 31 路下工作，不用改。

## 四、第3节逐条结论

1. 31 路：正确，改动最小。
2. 轻量策略并进入导入调度：正确。`lightImportGeneration` 同时决定模型策略和调度通道（`:986,988`），只改一处即可，不影响普通 analyze、review 和 world。
3. scopeHash 缓存：正确。item 的两次请求都以 `verified=true` 调用（`:1061,1065`），失效条件沿用 `ImportRuntimeScopeCache`（`desktop/core/novel-import-runtime-proof.ts:26-36`）。
4. 合批提交：正确且安全，见 (a)。
5. 目录裁剪：方向正确，但必须按中1使用独立条件。

## 五、结论

**需修订**（小修，不需要重新设计）：
1. 第5步写明不复用 `indexed`，IP-06 补充对应断言。
2. 第5节补充 JSON 解析失败、输出未结束、sourceUnitIds 抄写等失败风险；E2E 记录单请求耗时分布、重试次数和失败类别。
3. 第4节写明 CP-02、SP-01 的断言更新，以及 `novel-import-ai.ts:979,991` 的注释同步。
4. 第1节或第4节写明物品图片不启用，或不计入计时。
5. 修正第2节的行号，并说明 2 路来自可配置的默认值。

修订后可直接进入用例审核与 TDD。
