# 517 方案独立审核：世界线/叙事线导入提速

审核对象：`docs/517-lines-import-performance-plan.md`。依据：当前工作树源码（只读，未运行测试）。

## 已确认成立

- 叙事线依赖完整世界线目录：`wizardRun` 逐步串行（`desktop/main/novel-import.ts:572-573`），`runLine('worldline')` 全部提交后才进入第18步；叙事批次的 `entities` 在 `requestSnapshot` 时取自 `s.artifacts`（`:1536-1545`），第17步事件已全部在内。并行叙事批次互不依赖，成立。
- 调用证据容量：`ImportRuntimeProofTracker.invoke` 在途上限 `maxTokens=IMPORT_RUNTIME_MAX_CALLS=32`（`desktop/core/novel-import-runtime-proof.ts:3,15,41`），31 并发与角色/场景/世界车道同口径（`novel-import.ts:48-58`）；对半重做串行占同一名额，不超限。runtime.json 上限 64（`novel-import-wizard-runtime.ts:7`）。
- 下游 id 依赖：叙事 `refs.eventId`、伏笔 `eventIds/narrativeId`（`novel-import.ts:988-989,1007-1008`）、发布 `eventMap`（`novel-import-publish.ts:131,142`）、语义关联（`:1775-1776`）均读取已提交 artifact 的 id，不读模型原始 id；冲突在合并后生成。所以合并前重命名、同步 `eventId/parentId` 不破坏下游。

## 高

1. 并行下合并存在丢失更新。现有 `semanticAnalyzeUnits` 在 checkpoint 外基于当时的 `s.artifacts` 算 `merged`，checkpoint 内直接赋值（`novel-import.ts:1907-1908`）。方案只写“再合并提交”。必须写明：`mergeImportArtifacts` 在 `serial` 回调内基于最新 `s.artifacts` 逐批执行；某批合并抛错时只回滚该批、不计 coverage（参照设定任务的 before/restore，`:829-833`）；合并缓冲只缓存已校验结果，不能缓存 merged 快照。测试需覆盖“两批同时返回均被保留”和“缓冲中一批合并失败、其余照常提交”。
2. 标识说明与代码不符，重名风险被低估。`sameEntity` 对 worldline/narrative 按 `kind+name` 判同（`desktop/core/novel-import.ts:267`），不按 id；按 id 的身份只用于语义哈希（`novel-import-semantics.ts:250`）。所以跨批同名事件/叙事点会被合并，`lineId/people/timeKind/order/refs` 不同时生成 `body-body` 冲突（`novel-import.ts:302-306`），向导再推迟到第21步（`:1910`）。基线串行时模型能看到目录，并行后同名重复会明显增多，冲突要作者处理，影响质量和体验。方案需要：(a) 改正“按 id 合并”的表述；(b) 质量指标加“第17/18步新增待处理冲突数 ≤ 基线”；(c) 章内拆批时两批叙事 `order` 都从 0 编，同名叙事点必然冲突，需说明处理（尽量不在章内拆，或由主进程按批次偏移 order）。
3. “与会话已有同 kind 同 id 的条目保持原 id”自相矛盾。并行碰撞恰好是 B 批模型 id 等于 A 批已提交的 id；如果 A 也重命名了，这条只会碰到来源副本或重试前已提交的 id。需写清：只有模型 id 命中目录中已有条目（来源副本/已提交）且名称相同时才保留，否则一律重命名；否则 `:290` 的“标识与不同身份重复”会照旧出现。

## 中

4. 车道模型选项不能照抄设定车道。注释说设定车道“保留模型选项”（`novel-import-ai.ts:1027`），但 `lightImportGeneration` 包含 `wizardSettingsLaneRequest`（`:1031`），`importGenerationModel` 因此对设定车道启用 `importRosterModel`，即关闭/降低思考（`:1032`）。剧情车道要“保留思考”，只能加入 `generate` 的绕名额判断（`:1022`）和 `runImportGenerationLane`（`:1035`），不能加入 `lightImportGeneration`。方案“与设定同”有歧义，应写明，并加测试。另外 `ImportAiRequest.executionLane` 联合类型需要扩展（`desktop/shared/novel-import.ts:169`），`validateSemanticRequest` 需要扩展（`novel-import-ai.ts:858`）。
5. 来源校验频率。`ai(...,verified=true)` 时请求前后都跳过 `verify`（`novel-import.ts:1623,1631`）。方案只在开头校验一次，一波 60 s 以上再加串行对半重做，时间可能很长。应沿用 `runEntities` 的节奏（30 s/16 次复核，`:810`），或在每次合并提交前复核一次。
6. 暂停/失败时的在途请求。方案让失败后在途批次自然结算；`runEntities` 是全局错误后取消在途请求（`:812`）。两种都可以，但要写明：暂停或 epoch 变化时必须 `Promise.allSettled` 等全部在途请求结束才抛出，`runLine` 不能提前返回留下孤儿请求（暂停证明要求 drained，`novel-import-runtime-proof.ts:11`）。缓冲未落盘的结果不计 coverage，恢复后重做。
7. `runtimeScopeCache` 白名单是 `ai()` 里的显式表达式（`novel-import.ts:1628`），需加入 `wizard-lines-v1` 条件。缓存按 epoch/workingRevision/grant 失效（`runtime-proof.ts:31-34`），这样是安全的。
8. 每批都带完整 `entities` 目录（全部角色/场景/物品/世界条目及第18步全部事件）。批次缩到约 2.4 万字后，目录占比上升，`requestFits` 的 `payload ≤ characters*3`（`:1549`）可能迫使批次继续缩小，31 批的估算可能不成立。需要用真实目录先测一次 payload。

## 低

9. `lineId` 规范化只合并同名线，解决不了基线“每个事件一条线”的问题，主要靠提示词。只应作用于 `origin==='inferred'`，来源副本的 `lineId` 不改。同一故事线写法不同（如“主线”和“主线·克莱恩”）仍会分成两条线，应记录为已知边界。
10. “refs>0”太弱，强制写 refs 也可能诱导模型乱挂引用（`validateSemanticLinks` 只保证 id 存在，`novel-import-ai.ts:893`起）。建议抽查 refs 与本章正文是否一致，并保留“确无对应事件可为空”。
11. 重命名的哈希输入需排除不稳定项。`本批首单元id+模型id` 在批次划分变化（重试时 pending 不同）时会变，这可以接受，但同批内两个 artifact 用同一模型 id 时需要先拒绝。

## 测试清单缺漏

并行合并丢失更新；缓冲内单批合并失败只回滚该批；暂停时在途请求 drained、未提交批次重试时重发；剧情车道不走 `importRosterModel`、设定车道行为不变；车道对 outline/非向导/有 intent 被拒（服务层和类型）；跨批同名事件产生的冲突数；章内拆批的叙事 order；真实目录下 payload 能否装入 31 批；复核频率；非向导 `semanticWorkflow` 回归（`:1935-1936`）。

## 结论

有条件通过。方向成立：依赖顺序、并发上限、下游 id 依赖都已核实。实施前需修订高 1–3（合并在串行区内且逐批原子、改正按名判同的表述并加冲突指标、写清重命名规则）和中 4（剧情车道与 `lightImportGeneration` 分开），并补上上面的测试。
