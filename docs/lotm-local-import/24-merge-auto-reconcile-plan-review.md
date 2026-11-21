# 23号方案（跨批次同实体字段自动合并）独立审核

日期：2026-10-29。审核范围：`desktop/core/novel-import.ts`、`desktop/core/novel-import-semantics.ts`、`desktop/core/novel-import-semantic-state.ts`、`desktop/main/novel-import.ts`、`scripts/continue-lotm-local-import.mjs`、NI-D05；只读检查了真实会话 `7414fd07…/session.json` 的元数据（未输出正文/Key）。

## 结论：有条件接受

方向与用户选择一致，规则范围（仅 v1、仅 inferred-inferred、锁定字段走旧路径）合理。重置路径经核实可行。下列 B1–B4 修正写入方案并补用例后，可以进入 TDD。

## 已核实（无需改动）

- 可靠性与归属：每个候选进入合并前都已通过 `validateImportSemanticArtifact`（main:700），非客观值必带非空 attribution（semantics:123）。较弱一级一定来自某一侧，该侧的 attribution 会被并集保留，因此不会出现“较弱可靠性 + 空归属”。前提是 reliability 与 attribution 一起应用（见 B1）。
- 锁：锁按 `artifactId+field+value` 存储，`assertImportSemanticLocks` 校验值相等（semantic-state:18）。需要传 locks 的只有 main:652 和 main:702 两处。main:506/531 的输入只有 source 产物，main:714 是 outline source，main:750 是旧版（无 semanticVersion），都走不到 inferred-inferred 新分支，不用改。锁对应的是 `current.id`，实现时必须用 current 的 id 判断。
- 语义 hash：现有合并已经会追加 evidence/text，hash 本来就会变化。`conflictBases`（main:554）只针对 pending 冲突，repair 的 baseHash 在 repair 阶段先提交，所以没有新增的“合并结果等于单次模型输出”假设。
- `select` 重置：真实会话为 `phase=paused`、`chapterDetection.mode=manual`、`semanticVersion=1`、`workingRevision=0`、1402 章、章节内容拼接等于正文、无 publication、0 锁、0 决定。`select` 不检查 phase（main:155-160），只要求无在途任务。`invalidate(s,false)` 中 `preserveManual` 成立（main:185），会保留 chapters 并清空 artifacts、coverage、conflicts、analysisGrant、analysisCheckpoint、semanticState。随后 `set-title` 把 phase 从 select 改为 confirm（main:166）。start 时 `canRestoreAnalysis` 为假，会重建 source 产物（main:526-531）。会话中被冲突挡下、未追加的证据也会在重跑中补回，没有更轻的正规途径：逐条 resolve 会产生 56 条决定和锁，代价更大。

## 阻断问题

B1 同一候选“部分冲突、部分自动合并”不原子。在 novel-import.ts:213-221，只要该候选有任一字段冲突（`conflict=true`），evidence、sourceUnitIds、text 就都不追加；但其他字段照样写入（现状是补空值，方案会扩大为并集或降级 reliability）。结果是并集片段或降级后的 reliability 没有对应证据，或者 reliability 已改而 attribution 还卡在冲突/锁定里。要求如下：
- 候选只要有冲突，本候选所有自动合并（并集、降级）都不应用，只保留原有的补空行为。
- 方案中写明：reliability 降级与 attribution 并集一起成败；attribution 被锁时 reliability 也走冲突。

B2 增长会撞上下游预算，运行可以预见会失败。容量上限 5000 万字符只限总量，不限单个实体。主角在 5589 单元中几乎批批出现，personality、relationships、attribution 会持续累加。会失败的下游检查：
- repair 请求会携带完整 facts，受 `assertImportReconcileContextBudget` 的 `budget*2` 约束（ai-payload:67）。
- review/analyze 的 payload 受 `payload ≤ budget*3` 约束（ai-payload:27）。
- `contextArtifacts` 遇到超预算的实体直接跳过（main:770），主角会从上下文消失。

这些都在整书后段或复核阶段才失败闭合，而且失败后无法自动恢复。要求：
- 给单字段设上限，例如描述字段并集后不超过 1500 字符，relationships 不超过 60 项、不超过 8000 字符。超限时不自动合并，回退为冲突，暂停可见，不静默截断。
- 补一条用例：并集达到上限的角色仍能通过 repair 和 review 请求的预算断言。

B3 relationships 身份规则不完整。必须明确并测试以下情况：
- 同一 target 两侧 characterId 不同，或同一 characterId 两侧 target 不同：判冲突，不自动选择。
- 单侧数组内部已有重复 target：合并前先规整，否则判冲突。
- 输出严格只含 `target/description/characterId`（relationshipSchema 带 `.strict()`，semantics:81），characterId 仍须是已知角色（semantic-state 中 prune 处）。
- 序列化保持稳定，同一输入得到逐字节相同的 JSON，以保证幂等和 hash 稳定。

B4 驱动重置步骤与现有断言的衔接没有写清。scripts/continue-lotm-local-import.mjs 中有以下限制：
- `assertSession` 的默认 id 是 `6d7b6180…`（line 20），真实会话是 `7414fd07…`。必须设置 `LOTM_SESSION_ID`，并且不能沿用旧的 `LOTM_RESUME_SN`（line 60 会比对旧的 artifactCount/coverage），即走 `artifacts=0`、`coverage={}` 分支。
- `save()` 使用 `wx` 方式写入（line 15），需要新的 `LOTM_EVIDENCE_LABEL`。
- 重置必须放在初始 phase 断言（line 47）之后、`.ni-task-button` 和继续循环（line 50-55）之前。select 和 set-title 经 `window.desktop.novelImport` 发送，要携带当前 revision 和完整的 `selected/targets/infer`。
- 重置后要立即断言 phase 为 confirm、conflicts 为空、chapters 与 expected 逐章一致，再进入原有流程。

## 非阻断建议

- 按“、；;”拆分再重新拼接会改写原有标点。例如旧值“遇事谨慎、多疑；外冷内热”混用分隔符，重拼后结构会变。建议只把整值当作一个片段：去首尾空白并做 NFKC 规整后比较，已包含则跳过，否则用“；”追加。这样无损、更简单，MG01 的分隔符规则也可以删掉。
- temporalScope 并集后只表示“曾在多个时段出现”，不再对应某一个具体时段。建议在方案里写明这一语义，避免复核模型把它当矛盾。复核阶段仍可能对“温和；冷酷”之类的并集报冲突，属预期，应记入风险。
- 合并应幂等：同一候选合并两次，结果不变。

## 缺失用例

- MG11：同一候选既有冲突字段又有可并集字段时不部分写入（B1）；attribution 被锁时 reliability 不降级。
- MG12：锁定字段遇到不同值时产生冲突而不是抛出“锁定字段发生变化”。分别覆盖 main:652 和 main:702 两个调用点（MG07 目前只覆盖核心函数）。
- MG13：单字段或 relationships 超过上限时回退为冲突；达到上限的角色仍能通过 repair 和 review 预算（B2）。
- MG14：relationships 的 characterId 或 target 交叉不一致、单侧重复、未知 characterId 时结果失败闭合（B3）。
- MG15：幂等，以及空串、仅空白、NFKC 等价值的去重。
- MG16：控制器集成。会话处于 paused、有 pending 冲突、manual 章节时执行 select 和 set-title，章节保留，conflicts、coverage、artifacts 清空，phase 为 confirm，之后 start 可以正常重跑。
