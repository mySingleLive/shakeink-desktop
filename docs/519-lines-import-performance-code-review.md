# 519 · 世界线/叙事线导入提速代码审核

范围：仅 docs/517（3R/3R2）与 518 对应改动。依据：源文件阅读；`node --import tsx --test tests/unit/novel-import-lines-performance.test.ts` 18/18 通过（约 29 s）。未运行 Electron。
注意：审核过程中 `runLineParallel` 被改写（注释引用“docs/517 3R3-1”），以下行号以改写后的工作树为准。

## 高

1. **实现与已批准方案/用例不一致（3R3 无出处）。** `desktop/main/novel-import.ts:1047-1059` 改为“多单元批次首次可重跑失败立即对半拆分，单单元才重跑一次”，但 517 只到 3R2，3R2-3 写的是“重跑后仍失败再拆分”；518 LP-08 期望“该批只多发一次”。违反 AGENTS“方案→审核→用例→审核→TDD”顺序。
   建议：补写 517 §3R3（含请求放大上限与质量口径），独立审核；同步 518 LP-08/LP-09/LP-09b 期望，再改测试。
2. **同批重复模型 id 被改名放行，与 LP-17 相反，并产生歧义链接。** `desktop/service/novel-import-ai.ts:1255-1257` 对重复 id 一律加 `-2` 后缀，注释称“被 parentId/ref 引用的 id 留给首项”，但代码并不检查引用，子事件的 `parentId` 会被静默挂到第一项；518 LP-17 要求此时报“模型实体标识重复”（`novel-import-ai.ts:1092`），现在该校验永远触发不到。
   建议：恢复 LP-17 行为（重复 id 交给严格校验 → 纠错/重跑/拆分）；如果确实要保留后缀，就只在该 id 未被本批 `parentId`/`refs.eventId` 引用时才加，并改 518 用例。
3. **规范化会静默丢弃有意义的链接，没有计数，也不对作者可见。** `novel-import-ai.ts:1222`（characterId/sceneId/itemId）、`:1230`（people 中未知人物）、`:1240`（非已知角色的 narrator）、`:1241`（未知 eventId 的 ref、非 id 的 `ref.character`）、`:1249-1252`（不可定位引文）。3R2-2 允许这些丢弃，但代码只假设“名称仍在 text/attribution”，没有验证；narrator 原称谓若只写在 narrator 字段，就直接丢了。设定车道用 `recordSettingsRepairs`（`novel-import.ts:985-990`）把丢弃写进 `w.dropped`，剧情车道没有对应机制，与用户“质量不降”的要求冲突，真实 E2E 质量对比也看不到这部分。
   建议：`normalizeLinesReply` 返回 `{text,counts}`（与 `repairSettingsReply` 同构），主进程写入 `w.dropped`（kind:'lines'），调试行输出计数。`ref.character` 若是唯一角色名，就改写为该角色 id 而不是删除（与 narrator/people 的 `known` 规则一致，属于形状改写）。

## 中

4. **拆分会放大请求量。** 一个 N 单元批次如果总是失败（例如模型稳定输出某个坏字段），会递归拆到单元级并各重跑一次，最多约 3N 次请求，之后才 halt（`novel-import.ts:1057-1059`）。真实 E2E 下可能显著拖长时间和费用。递归本身会终止：单章内回退到 slice 对半，单元数严格递减，`rerun` 只重跑一次。
   建议：给拆分深度或每步额外请求数设上限（例如每批至多拆两层），超出就 halt 并给出 stepError；同时写进 §3R3。
5. **跨批确定性 id 可能与已存条目冲突。** `wizardLineIds`（`novel-import.ts:80-90`）的 id = hash(kind, 首单元, 模型 id)。作者重新检测或重试时，如果覆盖被清空而 artifacts 保留，同一首单元加同一模型 id 会算出与已存不同名条目相同的 id，`mergeImportArtifacts` 报“模型实体标识与不同身份重复”（`core/novel-import.ts:328`），整批失败。
   建议：rename 时若结果 id 已被 `stored` 中不同 key 的条目占用，就加入 workingRevision 或序号重新取 hash；补一条单元测试。
6. **叙事点按名称合并。** 叙事 name 常为章名，拆分后同章两半都会产出同名叙事点：合并后 text 拼接、refs 取并集（`core/novel-import.ts:316`），但 `order` 不同会变成推迟冲突。3R3 拆分会增加此类冲突，测试没有覆盖。
   建议：测试中断言同章拆分后冲突数为 0，或让同章同名叙事点的 order 按并集或最小值调和（需写进方案）。
7. **测试区分力不足。** LP-22（`tests/unit/novel-import-lines-performance.test.ts:231-236`）只断言自己构造的字段，是空测试。LP-08（`:182-189`）的断言“artifacts=sent-1”在“重跑”和“拆分”两种实现下都成立，无法区分。LP-09b 标题仍写“survives the re-run”。缺少：LP-11（暂停→恢复只发未覆盖单元）、LP-21（来源复核次数）、单单元“重跑后仍失败→halt”、规范化丢 narrator 的路径。LP-01 用 `sleep(200)` 竞速，`until()` 超时不失败（`:43`），慢机器上可能误报或漏报。
   建议：LP-22 改为驱动非向导会话，断言在途峰值为 1；LP-08 断言失败批的重发请求单元集合；`until` 超时改为抛错；补齐上述用例。
8. **台账未登记。** `docs/requirements-traceability.json` 里检索不到 LP-/wizard-lines 条目。
   建议：按 AGENTS 要求逐条登记 LP-01…LP-23，并标注真实 E2E 状态。

## 低

9. 规范化补的 `order`（`novel-import-ai.ts:1237`）从 0 起算，可能与同章显式给出的 order 重复。建议从同章已有显式 order 的最大值加 1 开始。
10. `people` 并集（`core/novel-import.ts:314`）可能同时出现同一人物的 id 与唯一名，造成重复。建议合并前把唯一名映射为 id。
11. `-narrative` 后缀只用于叙事线（`novel-import-ai.ts:1243`）。世界线 id 若与目录 id 相同，会被 `validateSemanticLinks` 拒绝后重跑。规则不对称，可以接受，建议在注释里说明。
12. worker 数在开始时固定为 `min(31, 初始批数)`（`novel-import.ts:1066`）。初始批数很少时，拆出的半批无法用到空闲车道。影响小。

## 已确认无问题

- 并发与检查点：校验在 `checkpoint` 外，合并、`wizardLineIds`、coverage 和进度都在串行 `checkpoint` 内基于当前 `s.artifacts` 计算（`novel-import.ts:1033-1042`）。halt 后不再取新批；`wake()` 在 finally 中执行，等待中的 worker 不会死锁；`Promise.allSettled` 等所有在途批次结算后才抛出；暂停经 `current()` 抛出 AbortError，`runLine` 原样上抛，不标记 failed。
- 车道校验：`wizardLinesLaneRequest` 要求 semanticVersion 1、analyze、无 intent、kind 为 worldline/narrative，其余情况一律报“导入调度通道无效”（`novel-import-ai.ts:858,1031`）。轻量策略与导入通道均已接入（`:1023,1033-1036`）。
- 调试行：`lines-batch-fail` 的 paths 只保留 `[a-zA-Z.]`；`lines-facts-reject`/`lines-link-reject` 的 reason 来自校验器固定文案（`core/novel-import-semantics.ts:108-110` 的 label 均为常量）；`entity-catalog-reject` 只输出 zod 路径和 code。未发现模型或原文文本泄漏。
- 时间值迁入 time 标签、空 parentId/冗余 eventId 的处理只改形状；name/text/reliability/attribution 不动；缺 attribution 的非客观事实仍按严格规则拒绝，符合用户选择。
- 面包屑 STAGES（`NovelImportWizard.tsx:16`、`wizard.js:19`）已改为“剧情”，LP-13 有断言。

## 结论

**不通过（需修改后复审）。** 必须先处理高 1–3：补 3R3 方案和用例并审核；恢复或收紧同批重复 id 的处理；剧情车道的丢弃要计数并对作者可见。中 4、5、7 应在真实 E2E 前修复。
