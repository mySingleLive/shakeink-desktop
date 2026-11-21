# 514 其他设定导入提速方案 · 独立审核

日期：2026-11-05。审核对象：`docs/514-settings-import-performance-plan.md`。依据为当前工作树，行号也按工作树。工作树里有 514 的临时 spike（`desktop/main/novel-import.ts:54,924-926`，`desktop/service/novel-import-ai.ts:1029`）。另有他人的未提交改动，不在本次审核范围。真实运行证据取自 `/private/tmp/shakeink-settings-510/evidence/settings-r1`、`settings-r6`。未修改任何源文件。

## 一、第2节事实核对

| 方案声明 | 核对结果 |
| --- | --- |
| r1 当前 HEAD 218016 ms，零错误 | 属实，`settings-r1/events.jsonl` 末行 `durationMs:218016,done:4`。 |
| r4/r6 关思考 + 31 路，p50 约 8 s、max 18 s | 属实。`settings-r6/world-calls-on-failure.json` 有 45 条已结束调用，p50 8.8 s、p90 15.5 s、max 18.2 s。 |
| “约 55 批中 11 批因单条引文无法定位被拒” | **不准确**。`settings-r6/app-stderr.log` 中 `settings-batch-fail` 共 12 行：no-match 5 行，结构错误 4 行（`artifacts.3.facts.reliability`、`artifacts`、空字段，以及 `artifacts.0.evidence.3、artifacts.1.evidence.3、artifacts.1.sourceUnitIds、artifacts.3.evidence.2`），“导入操作已取消” 2 行。最终让整项失败的是 `goldenFinger: 模型返回结构不完整（artifacts.0.facts.reliability）`（`settings-r6/world-import-failed.json`），不是引文问题。见中1。 |

## 二、问题（按严重程度）

### 高1：“在服务层响应结构中丢弃”只改 schema 会和最终闸门冲突，丢弃点必须明确且两处共用同一判定

现状有三道独立检查：
- 生成期 schema：`requestedEvidence` 对每条引文执行 `rebindEvidence`，失败就在 `artifacts.i.evidence.j` 上报 issue（`desktop/service/novel-import-ai.ts:510-513`），数组要求 `.min(1)`（`:520`）。`generateImportAiJson` 的 `.check` 只在全部 issue 都是这类引文 issue 时才设置 `evidenceReason`，并据此生成纠错文本和 `模型证据无法定位（…）`（`:653-671`、`:769`）。
- 最终闸门：`runImportAi` 先用**同一个** `importAiResponseSchema` 再解析一次（`:1069`），然后逐条执行 `rebindEvidence`，失败直接抛错（`:1097`），再执行 `validateImportEvidence`（`:1101`，`desktop/core/novel-import.ts:235-237`：任何一条不在单元原文中就抛错）。
- 主进程：`importSettings.run` 再做一次 `validateImportEvidence`（`desktop/main/novel-import.ts:916`）。

如果只在 schema 里“放过”不可定位条目，坏条目会原样返回，到 `:1097` 仍然被拒，表现和现在一样。如果用 schema 的 transform 删除条目，又需要解决两个问题：transform 的输出会在 `:1069` 再被解析一次；删除数量也无法从 schema 中带出来。

建议：
- 新增一个纯函数 `partitionSettingsEvidence(entries,units)`，内部只调用 `rebindEvidence`，返回 `{kept,dropped}`。
- schema 侧：仅对符合条件的请求（见中2），把 `artifact.evidence` 改成数组级 `superRefine`。`kept.length===0` 时，对**每一条**引文按原 path 和原 `anchorFeedback` 报 issue。这样全部不可定位时，`:653-671` 的 `evidenceReason`、纠错文本和诊断都保持原样。`kept.length>=1` 时不报 issue，也不做 transform。
- 实际丢弃放在 `runImportAi` 的 `:1093-1101` 分支，先于 `rebindEvidence` 映射执行：同一个函数过滤并累计计数，然后照常 rebind 和 `validateImportEvidence`。`:916` 不用改。
- 用例需覆盖三种情况：一条可定位加一条 no-match 时被采用，且 `:1101` 和 `:916` 都通过；全部 no-match 时纠错文本与现状完全相同；单元外 unitId（unknown-unit）同样被丢弃。

### 高2：`evidenceDropped` 的位置会被严格 schema 拒绝，方案没有给出结果形状

`schema`/`semanticSchema` 都是 `.strict()`（`desktop/service/novel-import-ai.ts:36,42`），`artifact` 也是 `.strict()`（`:32`）。如果在 artifact 上或在生成期结果里加 `evidenceDropped`，`:1069` 的 safeParse 会失败，报“模型返回结构或类别无效”。主进程 `ai()` 的阶段白名单（`desktop/main/novel-import.ts:1605`）只检查已知键，所以不会拦截多出来的顶层键。

建议：
- 只在 `runImportAi` 最终解析之后，按高1的计数写入顶层 `result.evidenceDropped`，并在 `ImportAiResult`（`desktop/shared/novel-import.ts:170`）中声明为可选字段。
- 主进程 `ai()` 返回后校验：只有 `wizardSettingsLaneRequest` 请求可以带这个字段，且值为非负安全整数；其他请求带了就按越权处理。
- `importSettings` 的返回值需要改成 `{artifacts,dropped}`，然后由 worker 把计数和 task 一起放进 `results`（`desktop/main/novel-import.ts:864`）。方案第3节第4项只写了“随结果返回”，没有写清这条传递路径。

### 中1：零错误不能只靠引文容错，结构类失败和重跑结果都要有数据

r6 的 9 次非取消失败中有 4 次是结构类失败（见第一节），包括 `facts.reliability`（规则在 `desktop/service/novel-import-ai.ts:504-509`）和单元外 `sourceUnitIds`。这几类只能靠单次纠错和自动重跑碰运气。r6 中同一个 goldenFinger 批次 no-match 两次（`units:84` 出现两行），重跑又失败在 reliability 上。spike 只记录第一次失败（`desktop/main/novel-import.ts:926`），重跑失败的原因没有记录。

建议：
- 第2节如实写明失败分类。
- 调试行同时记录 `attempt:1|2`。
- 对这四类请求，`sourceUnitIds` 中不属于本次单元的 id 也按机械元数据过滤，前提是过滤后仍至少保留一个。理由与 indexed 实体相同（`:530`）。这一点需要用户确认，因为它超出了“只丢引文”的授权。
- E2E 报告每批的生成次数、重跑次数和失败类别。

### 中2：容错必须以 `executionLane:'wizard-settings-v1'` 为条件，不能只看 kind

第3节第4项写的是“仅四项其它设定”。但服务层不知道请求来自哪里。非向导的主题等分析（`importSettings` 无 lane 分支，`desktop/main/novel-import.ts:919`，以及旧流程）也是 `phase:'analyze'`、无 intent、同样的 kind，而且这些路径没有 `wizard.dropped` 可以记录。条件应直接复用 `wizardSettingsLaneRequest`（`desktop/service/novel-import-ai.ts:1027`），并补一条用例：非向导主题分析遇到 no-match 时仍然拒绝。

### 中3：`sourceUnitIds` 规则自相矛盾

“只保留剩余证据所在单元及模型给出的合法单元”：被丢弃引文所在的单元本身也是合法单元，按这句话它仍会保留，规则等于没有改。`requestedArtifact` 只要求 `sourceUnitIds` 非空且全部属于本次单元（`:520`），已有的 rebind 分支只会**追加**被移动引文的单元（`:1097-1099`）。

建议二选一，并写进用例：
- (a) 不删除，`sourceUnitIds` 保持现有语义，只受中1建议的单元外过滤影响；
- (b) 规则为“模型列出的合法单元 ∩ 原有，再并上剩余证据的单元”。

推荐 (a)。它与 `:1099` 的行为一致，也不会让 `sourceUnitIds` 变成空数组。

### 中4：自动重跑没有检查全局停止，停止后可能还会发出请求

spike 在重跑前只检查 `first` 和 `skipped`（`desktop/main/novel-import.ts:926`），没有读取 `runEntities` 内部的 `halt`（`:791`）。只有 `acquire` 时检查 `halt`（`:800`），重跑不会重新 acquire。

一个时序例子：另一个 worker 因来源校验失败调用 `stop()`（`:806`），此时某个批次恰好返回可重跑错误，而这个错误并不是取消引起的。`this.current` 只校验 epoch，不会因此抛错，结果是在停止之后又发出一个请求。这与 WP-12 “全局错误后不再发送排队请求”（`tests/unit/novel-import-world-performance.test.ts:111-122`）的约定冲突。

建议在 lane 对象上增加 `halted():boolean`，在重跑前和第二次 `run` 前检查。WP-12 增加一个变体：正在等待的批次返回可重跑错误时，不再发出新请求。

### 中5：动态车道上限的触发时机和计数口径

第3节第2项“仍有世界条目任务（waiting/running）时上限 16，否则 31”，有三处需要写清楚：
- 上限只在 `grantNext` 中计算（`:797`），而 `grantNext` 只在 acquire 和 release 时调用。最后一个世界条目的 release 发生在 commit 把它标记为 done **之前**（`:868` 先 release，随后 `commit()` 才在 serial 中把任务置为 done，`:818` 起）。这时它仍是 running，上限仍是 16，空出的车道要等下一个批次释放（约 8–18 s）才会分给排队的批次。不会饿死，但会白白浪费一个批次周期。建议在 commit 改变任务状态后调用一次 `grantNext`，或者按“仍有可领取或在途的 entity lane”计算上限，不按 task.state 计算。
- “waiting” 包含因 `dependsOn` 未就绪而等待的世界条目（`:789`），组合轮整个早期上限都是 16。这样做保守、正确，但要在方案中写明。
- 只选设定时，`free` 为 31（`:796`），共 40 批，有 9 批进入第二波。只要 `batchesHeld` 不超过 31，就不会突破 `IMPORT_RUNTIME_MAX_CALLS=32`。设定任务本身占用的是 worker，不占 lane，计数是正确的。用例应断言只选设定时 peak 为 31，组合轮 settingsPeak 不超过 16，且条目 peak 不低于 15。

### 中6：60 s 可达性没有给出估算，余量很薄

按 r6 分布估算，只选设定：40 批，31 路。第一波最慢约 18 s；第二波 9 批在第 5–9 s 陆续开始，最慢约在 26 s 结束。再加上进入步骤前 `stageRequests` 对 760 单元×4 项的规划（506 审核高1指出过非单调序列化的开销），以及来源校验。没有纠错时约 30 s。
- 某批纠错一次：该批约翻倍，约 36–40 s。
- 某批“纠错后失败 → 重跑又纠错”：最多 4 次串行生成（`maxGenerations` 默认 2，`src/lib/ai/generate.ts:190`），按 p90 15 s 计约 60 s，已到上限。

方案应写明这个估算，并说明 E2E 未通过时的下一步（例如按批次大小调整，属于另行变更）。

### 低1：`wizard.dropped` 新增 kind 的持久化与生命周期

- `dropped.kind` 是封闭 enum（`desktop/core/novel-import-wizard-state.ts:24,47`），需要加入 `'evidence'`。旧日志可以被新版读取；但新日志被旧版本读取会整体解析失败。按现有约定这可以接受，方案中应写明。label 和 reason 的上限是 400 字（`:47`），按“类别名”写入没有问题。
- `retryKind('world')` 会删除设定任务和产物（`desktop/main/novel-import.ts:1062-1063`），但只清理 `touch`/`materialRef` 记录（`:1069`），重试后会累积旧的 `'evidence'` 记录。需要同时清理 `kind==='evidence'` 的记录。`wizard-revise` 已经整体清空（`:1212`），不受影响。
- 记录必须在 commit 的 `grouped` 合并成功分支中写入（`:818-822`），失败时随 `before` 回滚，这样才满足“任务失败或重跑时不留记录”。
- `dropped` 会进入 `ImportWizardView`（`desktop/shared/novel-import.ts:165` 没有 Omit 它）和发布记录（`desktop/service/novel-import-publish.ts:41`），但渲染端目前没有任何地方显示 `dropped`（`src/` 中无引用）。方案应写明作者在哪里看到这条记录，或明确目前只用于审计。

### 低2：调试行不能保证是固定文本

spike 输出的是 `error.message.slice(0,200)`（`desktop/main/novel-import.ts:926`）。`StructuredGenerationError` 的文本是固定的，但网络或供应商错误的 message 不一定固定。建议改为输出 `this.safeError(error)`，或者只输出分类名（rerunnable 类别、`cancel`、`other`）。

### 低3：需要修改的既有用例和注释

- `tests/unit/novel-import-world-performance.test.ts:91` WP-03 断言“settings batches keep the saved thinking”，需改为断言走轻量策略，并保留无 lane 的普通主题分析不变的断言。
- `:101-110` WP-11 的 `settingsPeak<=8`、`31-8`，需改为 16 / 15。新增只选设定时 31 路的用例。
- `:123-131` WP-13 假设失败批次只发送一次。spike 的重跑对 `Server Error` 不生效，所以仍然成立，但要补一条可重跑错误的用例。
- `:183` WP-19 已经覆盖世界条目重跑，可以照它新增设定批次的对应用例。
- `desktop/main/novel-import.ts:53` 和 `:792-795` 中“at most WIZARD_SETTINGS_BATCH_LANES”的注释，以及 `desktop/service/novel-import-ai.ts:1025` 中“keeps the saved model options”的注释，需要同步修改。`runImportGenerationLane` 里的 `wizardSettingsLaneRequest` 判断（`:1032`、`:1021`）在新增轻量策略后已经冗余，可以删掉，也可以保留并注明。
- spike 把 `WIZARD_SETTINGS_BATCH_LANES` 改成了常量 31（`desktop/main/novel-import.ts:54`），与方案的“组合 16、单独 31”不一致，实现时需要换成动态上限。

### 低4：对角色/场景/物品/世界条目的回归面

只要按中2使用 lane 条件，对条目的影响只有两点：`lightImportGeneration` 的变化只增加了 `wizardSettingsLaneRequest` 这一分支（`:1029`），条目和 roster 的判定不变；车道上限在组合轮由 8 提到 16，条目可用车道由 23 降到 15。后者会让世界条目的 506 计时变慢，方案要求的组合轮 E2E 应同时记录世界条目耗时，并与 506 基线对比。character/scene/item 步骤不使用 lane（`:799`），不受影响。

## 三、结论

**需修订后再进入用例审核**：
1. 明确丢弃点：schema 只放宽（全部不可定位时报原 issue），实际过滤和计数放在 `runImportAi` 的 `:1093-1101`，两处共用同一个基于 `rebindEvidence` 的判定（高1）。
2. 定义 `evidenceDropped` 为最终解析后的可选顶层字段，主进程只允许设定车道请求带此字段，并写清 `importSettings` 到 commit 的传递路径（高2）。
3. 修正第2节的失败分类；调试行记录重跑；评估单元外 `sourceUnitIds` 的过滤（需用户确认）；写出 60 s 估算（中1、中6）。
4. 容错以 `executionLane` 为条件（中2）；`sourceUnitIds` 采用“不删除”的规则（中3）。
5. 重跑前检查全局 `halt`（中4）；在任务状态变化后重新分配车道，并写明上限的计数口径（中5）。
6. 扩展 `dropped` enum，在 `retryKind` 中清理旧记录，只在合并成功时写入，并说明作者在哪里看到这条记录（低1）；调试行使用安全文本（低2）；按低3更新用例和注释。
