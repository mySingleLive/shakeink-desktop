# 239 角色识别提速测试用例 独立审核

日期：2026-10-30。审核对象 `docs/239-roster-speed-cases.md`，对照 `docs/238-roster-speed-plan.md`、`desktop/main/novel-import.ts` `runRoster`、`desktop/service/novel-import-ai.ts`、`desktop/core/novel-import-ai-payload.ts` 与现有测试。审核时用 Node 24.18.0 实际运行了 WP/RA/RT/NIW-C21a–C24/RS-01–05，全部通过；批次数用 `splitImportUnits`/`coalesceImportWorkingUnits`/`splitImportBatches` 实算（见第 1 条）。

## 1. 夹具能否产生 ≥16 批：能，但测的是旧预算路径

实算结果：

| 模型上下文 | 预算路径 | 每批字符 | RS 正文（40 章×560 次，179,661 字） |
| --- | --- | --- | --- |
| 1,048,576（夹具默认 `model`） | v2，合并后 201 个工作单元 | 81,920 / 300 单元 | **3 批** |
| 262,144（v2 最小大窗口） | v2 | 16,384 | 12 批 |
| 16,000（现 `rsSmall`） | v1 legacy，无 `budgetPolicy`，240 个单元 | 5,000 / 100 单元 | 40 批，每批恰 1 个名字 |

- 标准夹具 F 在默认模型下只有 1 批，不能用来测并发。现有 RS 用例改用 16k 上下文才得到 40 批。这样走的是 `stageRequests` 的 `!s.budgetPolicy` 分支，不经过 v2 逐单元 `requestFits`，也不经过方案 D 的快速路径，单元也不是 adjacent-1000 合并后的工作单元。真实运行（DeepSeek，v2）走的是另一条路径。
- 建议：在 RS-01 增加一个 v2 变体，用 262,144 上下文、每章约 2,100 次重复（约 64 万字），得到 ≥40 批；或至少 17 批以上，使上限 16 真正起约束。断言 `j.budgetPolicy` 存在，并断言每个请求都带 `executionBudget.version===2`。1,048,576 上下文要 ≥40 批需约 330 万字，单测里不现实；用例文档应写明"用 262,144 上下文触发 v2 多批"，不要写"小预算模型或长正文"这种两可的说法。
- 用例文档应把 `rsSmall`/v2 两种夹具的参数和预期批次数写进步骤，不要让实现者自行选择。

## 2. 暂停/停止竞态覆盖不足

- RS-04 断言偏弱：
  - `covered.length<总数` 不能证明"迟到结果不写入"。建议在 `pause` 前记录 coverage 快照，等暂停完成并放行迟到结果后，断言 coverage **与快照相同**，且 `rosterStash.character` 的条目数也与快照相同（用例写了 stash，测试没有断言）。
  - `cancelled>=inflight-1` 中的 `inflight` 包含已完成的首批，口径不准。建议在处理器里记录"收到 cancel 时仍挂起的 operationId 集合"，断言该集合等于暂停时的在途集合。
- 缺少的竞态用例：
  - 暂停恰好发生在 `flush` 合并保存期间（可在 `checkpoint` 写盘时用钩子延迟）。预期：保存要么完整落盘、要么完全不落；恢复后不重复发送已落盘的单元。
  - 某批失败与暂停同时发生。预期：phase=paused，或步骤 failed（文档须二选一写明），不会出现 failed 但 phase 仍为 running。
  - 迟到结果以 `AbortError` 拒绝（仿 NIW-C33，`cancelAi` 后 reject），与迟到成功分开测。
  - 删除未完成导入（Esc / 放弃，IA-B01 及 `abandon` 循环）发生在 16 路识别期间。`abandon` 最多循环 5 轮，需证明 16 个在途请求下仍能清空并删除草稿。
  - `controller.close()` 发生在识别中途，之后重新 `initialize` 并恢复。预期：只发未覆盖批次，最终候选完整（这同时覆盖"coverage 持久化"）。

## 3. 失败后的迟到结果（RS-03）

- 测试声明了 `cancelled` 计数，但**没有断言**。应断言 `cancelled>0`，并断言它等于失败时仍在途的请求数。
- `assert.ok(covered.length>0)` 太弱。方案和代码注释写的是"失败前及失败期间返回的批次都保留"。建议在处理器里记录每个成功返回的请求的单元，断言失败后 coverage **恰好等于**这些单元的并集：不多（失败批次没有写入），也不少（失败后才返回的成功批次已经写入）。
- 建议补充断言：重新识别后，所有成功请求的单元集合两两不相交，且并集等于全部工作单元。即没有单元被成功处理两次，也没有遗漏。
- 缺少的负例：
  - 中途更换模型或授权（`ai()` 返回后抛"模型配置或授权已变化"）。预期：步骤 failed，其余请求被取消，该批结果不写入。
  - 结束时的 `verify` 抛"来源文件已变化"。预期：不生成候选，步骤（或会话，文档须写明是哪个）失败，已有 coverage 保留。
  - `checkpoint` 写盘失败（代码里有 `save().catch(...)` 分支）。预期：停止取新批，报错，不出现半写入的草稿。

## 4. coverage 持久化

- RS-01 只在完成后检查 coverage，但完成时 stash 已被删除，这时 coverage 恒为全量，说明不了中间状态。
- 建议：识别中途读取 `journal()`，断言 `coverage['roster:character']` 恰好等于 `rosterStash.character` 中条目所属批次的单元并集，两者在同一次保存中一起写入。再配合第 2 条的 close→重启用例。

## 5. rosterFound 的正确性（资料文件参与时）

- 实现中 `rosterFound=mergeWizardRoster(kind, rosterStash)` 只统计正文识别出的条目，不含资料文件条目；最终候选是 `buildWizardCandidates`（正文 + 资料合并，物品还要经过 `keepWizardItem` 过滤）。因此：
  - 角色、场景：资料里独有的名字会让最终候选数大于运行中最后显示的 N。用例 RS-02 只写了"无资料文件时相等"，有资料时的预期没有写。
  - 物品：`keepWizardItem` 会滤掉出场章数少且不重要的物品，最终数可能**小于** N，界面会出现"识别 30 个→列表 25 个"的落差。
- 建议：在文档中明确 N 的定义（"正文已返回的不同名称数，不含资料文件"，或改为包含资料），并增加用例：
  - RF-01：用 `filesF()`（资料含沈砚、林舟），再给资料加一个正文没有的名字。断言运行中 N 不计这个名字（或计入，取决于定义），最终候选包含它。
  - RF-02：物品类别中有一个会被 `keepWizardItem` 滤掉的条目，断言运行中 N 与最终候选数的关系符合文档说明。
  - RF-03：直接对 `toImportView` 做单元测试。步骤 running 时有 `rosterFound`；waiting、failed、非 detect 步骤时没有该字段；视图不泄露 `rosterStash`。
- "单调不减"不是一般性质：后到的条目若以别名把两个已有组连起来，`mergeWizardRoster` 会把它们合并，N 会下降。RS-02 只在每批一个独立名字的夹具里成立。建议文档注明这一点，或增加一个别名桥接的用例，断言此时 N 允许下降，界面不报错。

## 6. 并行引入的结果不确定（缺少回归用例，重要）

- `mergeWizardRoster` 的显示名取组内第一条条目的名字，候选 id 由显示名哈希得到（`wizardCandidateId`）；`evidenceUnitIds` 也按 stash 顺序截取前 200 个。并行后，stash 的顺序取决于各批返回的先后。
- 结果是：同一本书两次识别，可能得到不同的显示名和候选 id（例如一批返回"甲"带别名"甲乙"，另一批返回"甲乙"）。重新识别时 `prior` 按 id 保留作者的勾选和角色类型，id 变了这些就会丢失；实体导入所用的正文单元也可能不同。
- 建议增加 RS-06'：两批分别返回有别名关系的名字，用延迟控制两种返回顺序，断言候选列表（id、name、aliases、evidenceUnitIds）完全相同。实现上可以在合并前按批次序号或单元起点排序。

## 7. 现有用例是否会因去掉引文而失效

- 实测 WP-01（已改为禁止契约含 evidence/quote/逐字摘取）、WP-02/03、RA、RT、NIW-C21a–C24 全部通过。`rosterAi`、`worldsAi`、NIW-C29 的夹具仍返回 `evidence`，由于服务端 schema 改成了可选，不受影响；会话测试直接注入 `options.ai`，不经过服务端校验。`novel-import-request-schema.test.ts` 第 407–409 行只检查 artifacts 的诊断标签，不受影响。
- 漏洞：WP-01/WP-04 只检查 `<phase-output-contract>` 内部。实测 roster 的完整提示词在契约外仍有通用句"每项evidence引用真实输入unitId，quote逐字保留单元内原文……"（`novel-import-ai-payload.ts` 第 74 行模板）。这与方案 B"减少输出、不要求引文"相冲突，模型仍可能输出引文。建议 WP-04 对 roster 检查整段提示词（`<novel-import-data>` 之前的部分）不含 evidence/quote/逐字，并对 touches/entity 断言这句仍然存在。
- 主进程 `runRoster` 依赖 `e.evidence.unitId` 必然存在，这一点由服务端 `locatedRoster` 保证。建议在 RA 中加一条：任意合法输入经 `runImportAi` 后，每个 roster 条目都有 `evidence`，且 `unitId` 属于请求单元。
- RA 缺少的负例：模型 evidence 的 unitId 不存在（`unknown-unit`）、引文过短（`too-short`）时回退到名称定位；名称只以更长词的子串出现（如单字名）时被接受，在文档中作为已知限制写明。

## 8. 思考选项与长任务名额

- RT-03（非 roster 请求的 providerOptions 不变、仍占用全局长任务名额）在测试中**不存在**。建议补上。
- 方案 C"roster 不占全局长任务名额"没有任何用例。建议：将 `longTaskQueue` 限额设为 2，并发发起 3 个以上 roster 生成（替换 `generateImportAiJson` 或 provider 的桩），断言没有排队；非 roster 请求仍然排队。
- RT-01：`provider.ts` 对 deepseek/kimi/zhipu 都用 `createDeepSeek`。建议用例写明 kimi/zhipu 的预期（是否同样发送 `deepseek.thinking.disabled`），避免给不支持的供应商发送无效参数。RT-02 写了 openai，但测试只覆盖 anthropic，应补 openai。
- 文档中的签名 `importRosterModel(resolved)` 与实现 `importRosterModel(resolved, model)` 不一致，应更正。

## 9. 其他

- RS-05：文档写"开始与结束各一次"，测试断言 `checks<=4`，且计数包含识别以外的调用。建议只统计 detect-char 从 running 到 waiting 之间的调用，并断言恰好 2 次。
- SB-01/02 只测试纯函数 `importStageBatches`。建议加一个会话级用例：v2 会话下 roster 请求的批次单元序列与旧逐单元算法相同（可用第 1 条的 262,144 夹具），并且 `requestFits` 的调用次数约等于批次数。文档中的文件位置应改为实际的 `tests/unit/novel-import-stage-batches.test.ts`。
- RB：建议补充 waiting/failed 状态下不显示计数行；物品、世界观的类别文案。
- RR：建议额外记录批次数（预期 59）、实测最大并发、是否出现限流，以及出现限流时"重新识别"的耗时。召回情况只记录名称和计数，不摘录正文。

## 结论

**有条件通过。** 需先补齐以下内容再进入实现验收：

1. 第 1 条：增加 v2 预算的多批变体。
2. 第 3、4 条：失败和暂停后 coverage 与 stash 的精确断言，以及 `cancelled` 断言。
3. 第 5 条：明确 rosterFound 的定义，并补 RF 用例。
4. 第 6 条：合并结果不随返回顺序变化的回归用例。
5. 第 7 条：roster 完整提示词中残留的"逐字引文"要求。
6. 第 8 条：RT-03 与长任务名额用例。

第 2 条列出的其余竞态和第 9 条可在本轮一并补上，不阻塞。
