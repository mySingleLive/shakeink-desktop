# 539 · 导入校验提速、自动修复与保存作品方案

日期：2026-11-09。用户要求：

1. 修复第21步“校验”的问题（截图：`一致性复核 复核未完成：模型返回结构不完整（conflicts.0.kind）`）。
2. 《诡秘之主》第一卷（小丑，213 章）校验 ≤2 分钟。
3. 校验中出现或发现的错误自动尝试修复 3 次；仍失败的错误项右侧显示 [修复]，点击手动再修复，不限次数。
4. 校验完成后，不论有无错误，[保存作品] 均可点击。
5. 保存后右侧导航出现作品；展开后的设定（主题、文风、世界观、伏笔、爽点/泪点）、角色、场景、物品、世界线、叙事线、大纲、正文与本次成功导入的内容一致。

用户 2026-11-09 选择：复核请求关闭思考（轻量策略）；“设定与正文矛盾”自动修复以正文为准改设定，再复核该设定，自动修改列在校验页。

## 1. 现状与根因

- `runVerify` → `review()`。向导全量目标时 `parallel=s.wizardVersion===1&&sceneReview`，而 `sceneReview` 仅在目标恰为 `['scene']` 时为真，所以全量导入是**串行**：先按 81920 字符装满的正文包（约 10 个），再 `reviewFactPackets` 遍历 `iterateImportReviewTasks`。用 fs-r5 会话离线统计，共 10385 个设定分片任务，证据单元引用 27766 个，原文约 2706 万字符。复核阶段不属于轻量策略，DeepSeek 保留思考；stale-sessions 中的单次复核调用为 192–272 s。整步远超 2 分钟。
- 结构错误：复核响应用严格 schema，`conflicts[].kind` 必须是 `IMPORT_KINDS`。轻量或思考模型常返回“设定”“事件”等自造值，整包被拒，纠错后仍失败，`runVerify` 捕获异常，把一致性复核记为失败，整步只剩“返回修改选择”。
- 保存：`VerifyStep` 在 `bad` 时禁用按钮；`wizardNext('verify')` 在有检查未通过或冲突待处理时抛错；`publish()` 要求冲突全部 resolved、场景归属全部复核；服务端 `assertPlan` 要求冲突 resolved、语义检查点 ready、细纲完整。

## 2. 修改

### 2.1 按章并行的轻量复核通道（仅向导会话）

新增 executionLane `wizard-review-v1`，只用于 `wizardVersion===1` 且不是“仅场景”目标的第21步（仅场景目标保留现有 `reviewWaves`，不改动）。

- **分包**：`wizardLinePlan(workingImportUnits(s),s.chapters,profile,WIZARD_LINE_CONCURRENCY)`，按章对齐，最多 31 包，最长优先。每包用 `requestFits` 检查，放不下就按章（再按单元）对半拆分（复用 `wizardTouchPlan` 的 fit 逻辑）。
- **上下文资料**：本包单元被其 evidence 引用的全部 artifact。每项是精简片段：text 不超过 2000 字符时全文发送，超过则发送前 2000 字符并带 `textRange`；facts 只放值长度 ≤1500 的字段。每个片段配 `createImportReviewProjection(full,fragment,range)`，模型只能就已发送的字段判断，片外内容保持未验证（沿用 `IMPORT_REVIEW_SCOPE_CONTRACT`）。场景片段带 projection 后，`sceneOwnershipReviewKeys` 的 `semanticHash` 比对成立，归属复核照常记账（`creditSceneOwnership`）。
- **不再执行**向导会话的 `reviewFactPackets` 全资料分片遍历（10385 任务）。理由：向导资料逐项从其引用原文导入，与正文的一致性由按章复核覆盖；全资料分片是耗时主因。方案、用例与总结写明这一取舍。
- **轻量策略**：`lightImportGeneration` 加入 `wizardReviewLaneRequest`，即 `executionLane==='wizard-review-v1'&&semanticVersion===1&&phase==='review'&&intent===undefined`。关闭 DeepSeek 思考，在导入通道运行，不占聊天长任务名额。`validateSemanticRequest` 的通道白名单、`USAGE_ENUMS.lane` 同步加入。
- **提示契约**：`wizardReviewContract` 只在该通道附加。内容：本包只是全书的一段章节；只返回 `conflicts`，不返回 `missingTargets`；`kind` 取所指资料的 kind；`type` 用 `setting-body`；`source.artifactId` 是资料 id，`field` 为 `text` 或 facts 中已发送的键，`candidate.value` 为按正文应为的完整字段值；evidence 引用本包单元；无矛盾返回 `{"conflicts":[]}`。
- **回复规范化**：`normalizeReviewReply` 仿照 `normalizeLinesReply`，在 `finishReason==='stop'` 且该通道时运行。只改形状：
  - 根只保留 `conflicts`；
  - `kind` 不合法时取 `source.artifactId` 对应资料的 kind，找不到则丢弃该条；
  - `type` 不合法时，有 artifactId 记为 `setting-body`，否则丢弃；
  - `field` 缺省为 `text`；
  - `source`/`candidate` 缺 text 或 value 时互相补；
  - evidence 只保留能在本包单元中定位的项，一项也没有则丢弃；
  - `id`、`hash`、`status` 缺失时补占位，服务端随后照旧重算 id/hash；
  - 去掉多余键。
  丢弃条数以 `reviewRepairs:{droppedConflicts}` 回传（仿照 `linesRepairs` 的 take 逻辑，越通道即报越权）。
- **调度**：最多 `WIZARD_LINE_CONCURRENCY` 包同时在途（同 `runTouchBatches` 的 worker 池）。单包失败时：中止或授权类错误（`reviewGlobalFailure`）立即停止；其它错误同包重试，共 3 次（`ROSTER_UNIT_ATTEMPTS`）；结构类错误且包含多章时，先对半拆分再重试。3 次后仍失败的包记入 `w.verify.failedPackets`（单元 id 与安全错误文本），不影响其它包。每包结果在 `checkpoint` 内提交：
  - 校验 evidence 属于本包；
  - 校验 `source.artifactId` 属于本包资料；
  - controller 把 `source.value/text` 改写成该资料当前完整字段值（`semanticDecision` 的版本比对依赖它）；
  - `addConflicts`、`creditSceneOwnership`、`coverage.review` 加入本包单元。
- **恢复**：已在 `coverage.review` 中的单元不重发。

### 2.2 自动修复（以正文为准，3 次）

复核包全部结束后，对每个待处理冲突执行：

- **可自动修复的条件**：`type==='setting-body'`，`source.artifactId` 指向 `origin!=='source'` 的资料，field 为 `text` 或 `importFactFields(kind,schema)` 中的字段，且复核时该字段整段发送（text 未截断；fact 值已发送）。不满足的冲突（原资料、正文对正文、来源对来源、截断字段）保持待处理，留给“处理矛盾”。
- **一次尝试**：在克隆上把字段改为 `candidate.value`，合并冲突证据。然后执行 `validateImportSemanticArtifact` 和 `importNativeMappings`，再发一次该资料的定向复核：同通道，证据单元按预算截取，资料为修复后的片段加 projection。复核不再报告该资料同字段的矛盾即成功：写回资料，冲突记为 `resolved`，`resolution:'auto-body'`，并写入 decision（choice `inferred`，explanation `自动修复：以正文为准`），`w.verify.fixed` 记一条 `{label,field}`。校验失败或复核仍报矛盾都计一次失败。
- **次数与并发**：每个冲突最多 3 次（`w.verify.repairs[conflictId].attempts`）；多个冲突并行，同一 worker 池。
- **语义检查点**：写 decision 后在同一 checkpoint 内调用 `createImportSemanticState(s,locks)` 重建，`inputHash` 随 decisionHash 更新，原 locks 保留。
- **结构检查的确定性修复**（只运行一次，结果幂等）：
  - 关系指向未导入角色：去掉 `characterId`，保留关系文字；
  - 设定所属世界未导入：丢弃该设定；
  - 讲述卡引用不存在的事件：去掉该引用；
  - 讲述卡 chapterIndex 越界：丢弃该卡；
  - 伏笔触点无法定位：丢弃该触点（`refreshForeshadowPlan`）；
  - 引用了未选范围或未选清单项：丢弃该资料；
  - 原生映射失败：丢弃该资料。

  每项记入 `w.dropped`（kind `verify`），在校验页列出。
- **细纲缺章**：对缺细纲的章用 `runLineParallel('outline')` 补生成，最多 3 次。仍缺则 outlines 检查失败，显示 [修复]。
- **卷章正文检查失败**：属于完整性错误，不自动修，也不提供 [修复]（实际不会出现；出现时保存会报错，不写入半成品）。

### 2.3 [修复] 按钮

新动作 `wizard-verify-repair`（`importActionSchema`，可变动作）。条件：`w.step==='verify'`、`stepState.verify` 为 `waiting`/`failed`、无在途任务。执行内容：

- 重跑 `failedPackets`，每包重新给 3 次；
- 把仍可自动修复的待处理冲突的尝试次数清零，再做 3 次；
- 重跑缺章细纲（3 次）；
- 重做确定性修复，重算检查。

不限次数。一致性复核行在下列情况显示 [修复]：有失败包，或有可自动修复的待处理冲突（`w.verify.repairable` 为真）。细纲行在缺章时显示 [修复]。“处理矛盾”按钮保留，处理不能自动修复的冲突。复核运行时，`stepState.verify='running'`，按钮禁用，并显示“正在复核”。

### 2.4 保存作品始终可用

- **UI**：`checks.length>0&&stepState.verify!=='running'&&!busy` 时可点击 [保存作品]。提示文字：全部通过时为“全部通过”；有问题时为“仍有未通过项，保存时只保留已成功导入的内容”。
- **`wizardNext('verify')`**：不再因检查失败或待处理冲突抛错，依次执行：
  1. 剩余待处理冲突记为 `resolved`，`resolution:'kept'`，explanation `保存时保留导入结果`，并写入 decision；
  2. 再次执行 2.2 的确定性修复；
  3. `projectOutlines`，向导会话允许缺章；
  4. 重建语义检查点：stage `ready`，`verifiedHash`，omissions 与 repairs 全部完成；
  5. 发布。
- **细纲**：`validateDetailedOutlines` 和 `validateDetailedOutlineAssignments(…,true)` 对向导会话允许缺细纲的章。条件：该章 `outline===''` 且不在 `detailedOutlineIds` 中。已映射的章仍逐项比对。非向导会话不变。
- **场景归属**：`publish()` 对向导会话不再调用 `assertSceneOwnership`；`runVerify` 对向导会话也不再因归属未全复核抛错，归属仍照常记账。非向导会话不变。
- **服务端 `assertPlan`**：冲突 resolved（kept 也是 resolved）、语义检查点等检查保持不变。

### 2.5 视图与文案

- `w.verify`：新增 wizard 状态字段，进入 zod strict schema。内容为 `failedPackets[{unitIds,error,attempts}]`、`repairs[{conflictId,attempts}]`、`fixed[{label,field}]`、`droppedConflicts`、`repairable`，并对数量设上限。
- **一致性复核行 detail**：
  - 全部通过：`资料与正文无未处理矛盾`；
  - 有问题：`N 处矛盾待处理`，以及 `M 段复核未完成：<错误>`。
- **Notice**：
  - “已自动修复 N 处设定”：列出 `资料名·字段`；
  - “复核丢弃 N 条格式无效的矛盾”；
  - “部分结构引用已修正”：列出确定性修复项。

## 3. 计时与验收

- **计时**：从进入 `verify` 起，到 `stepState.verify` 变为 `waiting` 或 `failed` 且 checks 出现止，单调时钟 ≤120000 ms。驱动记录复核调用数、p50/max、失败包、自动修复数、丢弃数。
- **真实 E2E**：
  - 驱动：`/private/tmp/shakeink-verify-539/run-verify.mjs`，复制自 535 驱动，目标为默认 11 类，第一卷，隔离根 `~/shakeink-test-roots/cache-522`，全新会话；
  - 校验结束后保存截图和计时，然后**无条件点击 [保存作品]**，等待 `completed`；
  - 通过应用自身的 `desktop.request` 读取作品各面板接口，与会话 artifacts 逐类比对（数量与名称，正文逐章内容哈希，细纲逐章文本）；
  - 在右侧导航展开作品并截图。
- **单元/集成测试**：
  - 规范化：kind 补全、丢弃、计数；
  - 通道白名单与轻量策略；
  - 并行分包与 3 次重试、失败包记录；
  - 自动修复成功与 3 次失败后 repairable；
  - [修复] 动作；
  - 有失败项时保存成功，发布的作品不含被丢弃项；
  - 细纲缺章允许保存；
  - UI 按钮可用性与 [修复] 显示。
- **全量**：全量 `npm test` 与 `build:desktop` 在 Node 24 下运行。

## 4. 不变项

- 非向导导入路径；仅场景目标的 `reviewWaves`；`assertPlan` 的冲突与检查点门槛；原始材料记录；模型密钥与真实数据不进入源码与证据。
