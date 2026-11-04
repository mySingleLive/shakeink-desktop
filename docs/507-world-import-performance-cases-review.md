# 507 用例及 506 第3R节 · 独立审核

日期：2026-11-04。对象：`docs/506-world-import-performance-plan.md` 第3R节、`docs/507-world-import-performance-cases.md`。审核时工作树里已有同伴按 3R 写的未提交实现（`desktop/main/novel-import.ts:774-775,825,867-881`，`desktop/service/novel-import-ai.ts:993-1004`），下面引用的行号以它为准。未修改任何源文件。

## 结论：需修订

3R-1 可以实现，不会破坏任务状态机：settings 任务仍是一个 `WizardTask`，批次只在 `importSettings` 内部并行，task/retry/skip 的状态迁移不变。3R-1 也没有误用 `importRosterModel`（见第8条）。但共享名额的调度方式、停止传播和提交原子性有缺口，用例需要补齐。

## 发现

1. **（高）FIFO 共享名额会让世界设定排在 settings 批次后面，60 s 难以达成。** `novel-import.ts:875` 的 `lane.acquire` 按先来先得排队。`importSettings` 在 `:879` 用 `requests.map` 一次性让全部批次排队（4 项 ×7–60 批，取决于预算）。这时主世界还没完成，200 多个设定任务都还没就绪，所以设定任务的 `acquire`（`:825`）全部排在这些批次后面。settings 批次保留默认思考、输入接近满预算，单批耗时远高于 entity 的约 3 s。若 4×7=28 批同时占用 28 个名额，235 个设定只能共用约 3 个名额，耗时远超 60 s。3R-1 和第6项写的“WORLD 优先”管不到名额队列。要求在方案里明确以下一种做法：settings 批次单独设并发上限（例如 ≤8）；或者名额优先分给 entity；并估算批次数乘单批耗时。用例需新增：settings 批次排队时，就绪的 entity 仍能在规定时间内拿到名额。E2E 记录每项的批次数和每批耗时。
2. **（高）出现全局错误后，排队中的批次仍会继续发请求。** `stop()`（`:779`）只取消在途操作，名额里排队的 waiter 不会被拒绝。在途请求释放名额后，`release` 唤醒下一个 waiter，它照常调用 `this.ai`。暂停时 epoch 已变，`current()` 会抛出，所以暂停没问题。来源校验失败、运行时容量等全局错误不改 epoch，剩余批次会在 halt 之后陆续发出，既在停止后发送数据，也拖慢退出。entity 的 `acquire` 有同样问题：worker 已领取任务、正在等名额，拿到名额后不检查 halt。要求：halt 之后 `acquire` 立即抛出或返回，`run` 之前检查 halt。WP-09 只覆盖暂停，需新增“全局错误后不再发出新请求、名额不泄漏、该步能退出”的用例。
3. **（中）一批失败后，其余批次仍全部跑完。** `:879-880` 的 `Promise.allSettled` 要等全部批次结束才报失败。失败语义正确（WP-05），但剩余批次（含排队的）继续占用名额并带思考调用模型，与第1条叠加。建议第一批失败后，不再发出排队中的批次。WP-05 应断言失败后发出的请求数。
4. **（中）WP-05 的“不提交部分成功”在提交阶段不成立。** `:788-799` 逐个 artifact 合并，状态按 artifact 设置：第 k 个合并失败时任务设为 failed，但前 k-1 个已经写进 `s.artifacts`；之后某个 artifact 合并成功，又会把任务改回 done 并删除 error。这是既有问题，并行后一个任务带回的 artifact 更多，更容易触发。要求同一 settings 任务的 artifact 整体合并（先合并到副本，全部成功再替换），WP-05 补充提交阶段失败的场景（例如容量或校验错误）。
5. **（低）跳过后又被改成 done。** `:804` 处理空结果时没有检查 `task.state==='skipped'`。作者在运行中跳过某个 settings 任务，如果它返回空结果，状态会被改成 done，并写入 `notFound`。并行后运行窗口更长，更容易出现。修正方法与 `:802` 一致。用例补“运行中跳过，结果为空”的场景。跳过时也不会取消该任务的在途批次，会继续占用名额，可以在第3条一并处理。
6. **（中）不要按 3R-1 在任务规划时缓存 `stageRequests`。** 3R-1（506:43）要求批次“在任务规划时一次算出并缓存”。但批次内容取决于 `contextArtifacts` 读到的 `s.artifacts`（`:1890-1892`），以及 `workingRevision` 和授权预算。规划时的缓存在重试时会过期，也违反“重试从头重跑”（WP-05）。现在的实现每次尝试在 `:870` 重新计算，这样是对的，3R-1 的文字应改成“每次尝试开始时计算一次”。另外，有 `budgetPolicy` 时，`stageRequests` 走非单调路径（`:1478` 之后），每个单元都做一次 `requestSnapshot` 和序列化，四项累计约 O(n²)，同步阻塞主进程，期间 31 个 worker 都停住。需要一项单元或 E2E 计时记录这段时间。
7. **（低）3R-3 的“含上级 MAP 设定”在候选模型里无法表达。** `WizardCandidate` 只有一个 `parentId`（`desktop/shared/novel-import-wizard.ts:13`），设定的 `parentId` 就是它的 worldId（`novel-import.ts:145`）。设定之间的上级关系不在候选里，`worldChain`（`:1061`）只能沿 world 链向上。WP-06 应改为“目标、`parentId` 链上的世界、本材料出现的已选项”。否则这一条无法验证，也无从实现。
8. **（通过，需补断言）settings 批次没有误用 `importRosterModel`。** `executionLane:'wizard-settings-v1'` 的请求 `intent` 为空，`lightImportGeneration`（`novel-import-ai.ts:1001`）为假，`importGenerationModel`（`:1002`）返回原始 resolved。`wizardSettingsLaneRequest`（`:999`）只放行 analyze、semantic v1、无 intent、四类 kind 的请求，`:828` 拒绝其它请求携带该 lane。payload 序列化不包含 `executionLane`（`desktop/core/novel-import-ai-payload.ts:34`）。WP-03 应写明可执行的断言：`importGenerationModel` 对这类请求返回同一个对象，`providerOptions` 深度相等；`kind:'world'` 或带 intent 的请求携带此 lane 时被拒绝；非向导路径（`runLine`、`semanticWorkflow`）不带 lane。
9. **（低）WP-07 的覆盖比 3R-2 窄。** 3R-2（506:44）包括四类定位错误（unknown-unit、too-short、ambiguous、no-match）和“JSON 不可解析”。WP-07 只写了 no-match 和“输出未完整结束”。应逐类列出，并断言 world 重试请求仍然不含 `entityTarget.evidenceOptions`，提示不含“sourceUnitIds由应用计算”。
10. **（低）WP-04“总在途 ≤31”必须在混合负载下测。** 断言应在 entity 和 settings 批次同时运行时取全局峰值（包括第2、3条的停止和失败路径），并断言名额在异常后全部归还（`free` 回到 31）。只测 settings 不能证明总数受限。
11. **（低）台账缺项。** `docs/requirements-traceability.json` 里没有 506/507 及 WP/WU 编号，AGENTS.md 要求有台账。506 §5 仍写着“WORLD 先于 SETTING 领取”的验证项，与 3R-4 不一致，应删除或改为只记录不验收。
12. **（通过）UI。** `NovelImportWizard.tsx:25-26` 用 `getTabIcon` 取图标，用 `SETTING_LABELS` 加“世界”作标签。第15步识别树（`:146`）和第16步卡片（`:163`）的显示条件与 3R-6 一致，settings 任务保留 Sparkles，没有修改 `src/stores/tabs.ts`。WU-01、WU-02 可以照写。
