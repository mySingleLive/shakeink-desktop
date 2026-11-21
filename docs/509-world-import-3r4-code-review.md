# 509 · 506 §3R3/§3R4 世界观导入实现 · 独立代码审核

日期：2026-11-04。对象：工作树中 506 §3R3、§3R4 的未提交实现（`desktop/main/novel-import.ts` 的 `planEntityTasks`、`runEntities` 的 `next()`、`entitySchemaFeedback`、`wizardTask` 跳过、`WIZARD_WORLD_NODE_CHARACTERS`），以及 WP-01/02、WP-07c、NIW-C26、NIW-C27 的改动。508 已审的部分不重复。未修改任何源文件或测试文件。

运行（Node v24.18.0）：
- `node --import tsx --test tests/unit/novel-import-world-performance.test.ts tests/unit/novel-import-wizard-session.test.ts`：84/84 通过。
- 另写了一个临时复现测试 `tests/unit/tmp-repro-509.test.ts`（复用 world-performance 的 64 设定夹具），跑完已删除。结果见第1条。

## 结论：需修改

跳过世界时连带跳过设定、移除已导入设定，这部分逻辑正确，不会让设定带着未导入的世界进入校验或发布。但设定去掉依赖后，会话里会先出现“世界尚未导入、设定已导入”的中间状态。这时任何重新规划四项其它设定批次的操作都会失败（第1条）。

## 发现

1. **（中）主世界未完成、其设定已提交时，重试或重新开始一项其它设定（主题/文风/金手指/爽点泪点），该任务必定失败，错误为“导入实体引用类型或归属无效”。**
   原因：`importSettings`（`desktop/main/novel-import.ts:901`）在任务开始时调用 `stageRequests`，它对每批调用 `requestSnapshot`（`:1490`）。这些请求不带 `entities`，所以 `:1496` 会对整个 `s.artifacts` 执行 `importNativeMappings`。此时已提交的 world-setting 的 `worldId` 指向尚未导入的主世界，`desktop/core/novel-import-semantic-state.ts` 的 `prune` 判定引用无效，`drop` 遇到非 source 的 artifact 直接抛错。错误被 worker 当作任务失败（`:857` 的 catch）。
   复现：64 设定夹具，targets `['world','theme']`，`smallBatches`。主世界的 entity 请求一直挂起，theme 第一批抛 `Server Error`。等 theme 变为 failed、已提交的 world artifact ≥10 后，对 theme 执行 `wizard-task retry`。结果：`MID failed 导入实体引用类型或归属无效`。放行主世界后 settle，状态为 `{"step":"import-world","theme":"failed","error":"导入实体引用类型或归属无效","states":{"done":65,"failed":1}}`。只有主世界完成后再次重试才会成功。
   同一路径还会在暂停后继续时触发（依据代码推断，未单独跑）。暂停让在途的 theme 以 AbortError 结束，`runEntities` 开头把 paused 改回 waiting，继续后重新 `stageRequests`，只要主世界仍未完成就同样失败。world-r10 中主世界单次请求 27.7 s，其余设定 2–7 s，所以这个窗口在真实导入中约有 20 多秒。
   首次运行不受影响：因为 §3R4-3 让其它设定最先领取，批次在任何设定提交前就已规划完；排队的批次在 `ai()`（`:1575`）里沿用首个快照中的 `entities`，不会重算。
   修正方向（任选其一）：`importSettings` 的请求显式传入不含“孤立设定”的 `entities`；或在 `requestSnapshot` 计算目录时，跳过 `worldId` 尚未导入的 world-setting（相当于 `requestSnapshot` 注释里说的“由步骤末尾的 resolveWizardReferences 整体检查”）。应补用例：主世界挂起、设定已提交时重试 theme，以及同样状态下的暂停/继续，两者都断言 theme 最终为 done。

2. **（低）跳过世界时移除了已导入设定，但没有清理指向这些设定的冲突。** `wizardTask` 的 `skip`（`:479`）只过滤了 `s.artifacts`，`s.conflicts` 与 `w.deferredConflicts` 中 `source.artifactId`/`candidate.artifactId` 指向被移除设定的条目仍是 pending。这些冲突会在校验步骤挡住“继续”（`:492`），处理时 `resolveConflict` 找不到 artifact（`:2035`），只能把它标记为已解决。`revise`（`:1199`）对删除的 artifact 会同步清理冲突。这种情况只在设定与已有同一身份的 world artifact 合并出冲突时出现，实际很少见。建议按 `revise` 的写法同时过滤 `s.conflicts`、`s.decisions`、`w.deferredConflicts`。

3. **（低）其它设定最先领取后，它们的批次失去了世界观上下文。** `contextArtifacts`（`:1932`）给其它设定的分析带上已导入的 world/theme 资料。以前 settings 任务排在任务列表末尾，被领取时大部分世界条目已提交。现在第一批就领取，`requests` 在 `:901` 一次规划，`s.artifacts` 中还没有任何 world 资料。这是用户为提速选择的结果，不影响正确性，但会改变主题/文风等的分析输入。建议在 506 §3R4-3 写明，E2E 对比一次这四项设定的结果质量。

4. **（低）注释与实现不一致。** `:1072-1074` 说“the verify step reports a setting whose world failed or was skipped and offers the world import again”，实际是跳过世界时连带跳过并移除设定，失败的世界会让步骤停在等待作者，校验步骤不会看到这种设定。`:1091` 说 “every setting waits for it”，3R4 之后已经不成立。

5. **（低）用例缺口。**
   - 没有用例验证 §3R4-3 的“其它设定最先领取”。WP-04 只断言批次并行和总数不超过 31。建议在世界条目多于 31 时，断言首批在途请求里包含全部四项设定的批次。
   - NIW-C27 只覆盖“世界失败 → 跳过”。没有覆盖“世界和它的设定都在运行时跳过世界”：这时设定状态是 running，`skip(d,true)` 把它改为 skipped，提交时 `:808` 和 `:818` 丢弃结果。代码正确，但没有测试。
   - 第1条的重试和暂停路径没有测试。

## 已核对、无问题

- **跳过路径（问题 a）。** `skip-failed` 和单项 `skip` 都走 `skip()`。world 任务通过 `owned()` 找到 `parentId` 等于该世界的 world-setting 任务，通过 `dependsOn` 找到子世界，子世界再递归带上它自己的设定。cascade 时 done 的设定从 `s.artifacts` 中移除，运行中的设定改为 skipped，之后提交时丢弃（settings 分组在 `:808`，entity 在 `:818`，失败在 `:836`）。直接跳过已完成项仍然被拒绝（“已完成项不能跳过”）。world-setting 候选的 `parentId` 一定是所属世界（`novel-import-wizard-roster.ts:75`），所以 `owned()` 不会漏掉设定。世界失败但不跳过时，`:868` 判定还有未完成任务，步骤等待作者，不会进入 `resolveWizardReferences` 或 verify。所以没有指向未导入世界的设定能到达 verify 或 publish。worlds 检查（`novel-import-wizard-checks.ts:22`）仍是最后一道保护。
- **重新规划（问题 b）。** `planEntityTasks` 只在任务 id 不存在时新增任务，被跳过的任务保留，不会重新加入。`retryKind('world')` 和 `revise` 会删除全部世界任务、`w.skipped` 记录和世界资料后重建，没有残留。世界观没有图片任务，`:743` 的过滤只用于场景。`w.skipped` 不会出现重复：已 skipped 的任务直接返回。
- **领取顺序与名额（问题 c）。** `next()` 只调整同一批可领取任务的先后。一个 settings 任务占一个 worker 循环但不占名额，批次最多占 8 个名额，等待中的世界条目优先获得名额（`:789`），总在途仍不超过 31。最多 4 个 settings 任务，其余循环继续领取世界条目，不会饿死。`busy()` 和结束判定都不受影响。
- **正则（问题 d）。** `^模型返回结构不完整（artifacts(?:\.0\.(?:facts|evidence|sourceUnitIds)[^）]*)?）$` 新增了只有 `artifacts` 的情况。只在 `quoteOnly`（`kind==='world'`）时生效，只触发已有的一次纠错。含其它字段的组合（例如 `artifacts、xxx`）仍不匹配。没有过宽的问题。
- **3R3。** `budgetChars` 只对 `candidate.kind==='world'` 生效，设定仍用完整预算。WP-16 已断言主世界的单元字数。
- **测试断言（问题 e）。** WP-01/02 断言首批同时有主世界和设定、峰值 31、全部导入。NIW-C26 断言设定无 `dependsOn`、子世界仍依赖上级世界。NIW-C27 断言跳过前设定已 done，跳过后子世界和全部设定都是 skipped、资料已移除、步骤能离开 import-world。WP-07c 的 bare 用例断言恰好一次纠错且带结构提示。这些断言与 3R4 的表述一致。

## 主代理处理（2026-11-04）

1. 中：`requestSnapshot` 在向导会话中计算目录时，略过所属世界尚未导入的推断设定（来源资料不受影响），步骤末尾 `resolveWizardReferences` 仍整体校验。WP-18（主世界挂起、10 项以上设定已提交时重试 theme）修复前失败、修复后通过。暂停后继续走同一 `stageRequests` 路径，由同一处修复覆盖，未单独补用例。
2. 低：跳过世界移除已导入设定时，同步移除指向该设定的 `s.conflicts`、`deferredConflicts` 及对应 `decisions`，写法同 `revise`。
3. 低：506 §3R4-3 补记“其它设定批次在世界资料提交前规划，上下文不含世界设定”；E2E 只核对完成与耗时，质量未单独评估。
4. 低：两处注释已更正。
5. 低：补 WP-17（其它设定首批领取）；运行中跳过世界的路径未单独补用例。

另据 E2E world-r13/r14 的诊断：world 设定的 `facts` 校验失败约九成为 FACTION 的 `relations` 不是字符串，其余为 content 缺失、`text` 为对象、LEVEL_SYSTEM `rules` 非字符串。服务层 world 纠错反馈改为先写具体失败（已知字段名与值类型，不含模型输出内容），再附原结构说明；原说明 337 字超过反馈 250 字截断，具体失败放在前面才能送达模型。共享提示词未改（改动会破坏多组既有提示基线测试）。
