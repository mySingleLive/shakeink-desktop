# 587 方案独立审核：导入世界线层次、类型与重要度

审核对象：`docs/587-worldline-import-hierarchy-plan.md`，基于 `4d61712`。只读核对源码，没有运行应用或模型。行号均为 `4d61712` 的行号。

结论：方向可行，"在时间整理之后加一个看全卷的归组请求"是合理的切入点。但父事件的发布范围、父事件的语义校验、fixture 与 prompt golden、控制器端的阶段白名单这几处，按现稿实现会让发布失败或让已通过的测试失败，需先修改方案再进入用例审核。

## 必须修改

1. **duration 用浮点相减，父范围检查会偶发失败。**
   `domain.ts:494-513` 的检查是 `child.start <= parent.start + parent.duration`。`applyWorldTimeline` 写入的 `timeValue` 只保留 6 位小数（`novel-import-wizard-timeline.ts:416`），gregorian 时间线的值在 1e7 小时量级。方案 §5 写的 `duration = max(子 timeValue) − 父 timeValue`，回加后可能比子值小 1 ulp。我用同样的取整方式在 ±1e7 范围随机测了 20 万次，`p+(m−p)<m` 出现 2564 次（约 1.3%），例如 `p=-395496.897448, m=275165.821995` 时，`p+d=275165.82199499995`。一个作品有上百个组时，`validatePlanning`（`novel-import-publish.ts:181`）几乎必然报“超出祖先允许范围”，整次发布在事务里回滚。
   修正：计算后校正，`let d=max-p; while(p+d<max) d=nextUp(d)`（或每次加 `Number.EPSILON*Math.abs(max)`），并加单元用例：fixed 与 gregorian 两种量级各做固定种子模糊测试，断言发布出的数据能通过 `validatePlanning`。

2. **父事件缺少 `reliability`，严格语义校验会失败。**
   推断的 worldline 在 strict 模式下必须有 reliability（`novel-import-semantics.ts:241` 调用 `knowledge(f, true)`，`:181` 缺失时报“事件或叙事必须明确可靠性”）。§3.4 列出的 facts 没有 `reliability`。`importNativeMappings` 会在 checkpoint、`fixStructure`（`novel-import.ts:1636`）和发布前（`novel-import-publish.ts:78`）对它报错。`fixStructure` 的回退逻辑 `mappableArtifacts` 会删掉父事件，然后连带删掉所有引用它的子事件（见第 4 条）。
   修正：父事件写 `reliability:'客观事实'`。如果成员中有非客观事实，父事件取 `'客观事实'` 还是跟随成员，需要明确规则：非客观值必须带 `attribution`（`semantics.ts:183`）。WG-02 增加断言：父事件能通过 `validateImportSemanticArtifact(a,'strict')`。

3. **父事件的 `people` 并集可能超过 100，发布时 `eventSchema.parse` 会失败。**
   `domain.ts:44` 规定 `people: z.array(id).max(100)`，而导入侧对人物数组没有上限。一场大型聚会或战役的成员人物并集很容易超过 100，`novel-import-publish.ts:167-169` 会抛错。
   修正：按出现次数排序后截到 100，写进 §3.4，并加用例。

4. **没有处理已经带 `parentId` 或已经有子事件的成员；也没有处理子事件指向失效父事件的情况。**
   - 第 17 步批次契约允许 `parentId` 引用本批事件（`novel-import-ai-payload.ts:76`），`wizardLineIds` 也会改名保留（`novel-import.ts:136`）。`wu91-r2` 中是 0 个，但这不等于不会出现。如果某个成员 M 已经有子事件 C，新父 P 的范围只按 P 的成员计算，C 不在其中。`validatePlanning` 沿祖先链检查（`domain.ts:487-517`）时会要求 C 也落在 P 内，就会失败。如果某个成员已有非锁定的 `parentId`，方案也没说是覆盖还是跳过。
   - 第 21 步删除事件的路径（`fixStructure`、`mappableArtifacts`，`novel-import.ts:1622-1660`，以及冲突处理）删掉父事件后，子事件的 `parentId` 会悬空。`validateImportSemanticReferences` 的 `requireType`（`semantics.ts:316`）会失败，`mappableArtifacts` 于是把子事件全部删掉。`fixStructure` 对 narrative 的 refs 和角色关系都有清除悬空引用的规则（`:1632-1633`），对 worldline 的 `parentId` 没有。`wizardStructureChecks` 的 `lines` 检查（`novel-import-wizard-checks.ts:24`）也不检查 parentId。
   修正：(a) 已有 `parentId` 或已有子事件的事件不进入任何组（最简单），或者把范围按全部后代计算；(b) 在 `fixStructure` 中增加“世界线父事件不存在时去掉 parentId 并记录”，在 `lines` 检查中增加 parentId 可解析的检查；(c) 增加对应用例。

5. **发布时只算 duration 不算起点，第 21 步作者改了子事件时间就会失败。**
   `WIZARD_REVIEW_NO_AUTO_REPAIR` 只禁止自动修改 `timeValue`（`novel-import-conflict-choices.ts:12`），作者仍可在第 21 步改。子事件被改到父 `timeValue` 之前时，`resolved.start >= bound.start` 不成立，发布失败。
   修正：发布时父事件的起点取 `min(自身, 全部子事件)`，duration 取到 `max(全部子事件)`（结合第 1 条做浮点校正）。或者在第 21 步校验时把它作为结构问题处理。增加用例：子事件时间早于父事件时，发布仍能通过。

6. **控制器端的阶段白名单漏改，方案列的 intent 枚举位置不全。**
   方案 §1 列出的位置之外，还有这些：
   - `desktop/main/novel-import.ts:2300`：`this.ai` 里有第二份阶段计算，`request.intent==='roster'||'touches'||'timeline'?request.intent:request.phase`，以及对应的 `allowed` 映射。不改的话，`grouping` 会被当成 `analyze`，允许 `artifacts`，也接受 `notFound`。测试用的模拟 AI 绕过了服务端 schema，这里是唯一的把关。
   - `desktop/service/novel-import-ai.ts:958-959`：`validateSemanticStage` 中除了加 stage，还要把 `groups`/`grades` 加进越权字段清单，让其它阶段返回这两个字段时被拒收。
   - `desktop/core/novel-import-semantics.ts:46`：`ImportSemanticResult` 类型要加 `groups`/`grades`。
   - `desktop/core/novel-import-ai-payload.ts:70`：提示词分派要加 `grouping`，否则会落到 `semanticPrompt`。
   - `desktop/service/novel-import-ai.ts:517`：`importAiResponseSchema` 中 strict schema 的分支。
   - `desktop/service/novel-import-ai.ts:945`：`grouping` 不在这一行的列表里，`units:[]` 才能通过。应在旁边加一条：`grouping` 只用于 `phase:'analyze'`，`kind` 只能是 `worldline`，而且 `artifacts`/`entities` 必须为空。
   修正：§1 的位置清单补齐，WG-10 分别覆盖服务端和控制器端的拒收。

7. **fixture 和 prompt golden 的影响写错了，现有集成测试会失败。**
   - `tests/helpers/novel-import-wizard-fixture.ts:37` 的默认回退返回 `{notFound:true}`，`:172` 只模拟了 `timeline`。加了归组请求后，所有走到第 17 步之后的 fixture（`toVerify`、`worldlineWork`、`linesFixture` 等）都会在归组处失败，或被第 6 条的漏洞放过。fixture 必须增加 `grouping` 的模拟回复。
   - §6 写“prompt golden 只新增一项，其它项不变”，这不成立。golden 记录的是 payload 和 prompt 的 sha（`scripts/capture-novel-import-prompt-golden.ts:19`）。第 18～21 步的 payload 带着世界线事件的 facts 和实体目录（`contextArtifacts`，`novel-import.ts:2651`），只要模拟的归组回复改了任何 category/importance 或者建了父事件，`legacy-scene:analyze//narrative//wizard-lines-v1/`、`outline`、`review` 各项的 sha 都会变。按 WG-06，“既无合法组又无合法分级”算失败，所以模拟回复至少要给出分级。
   - 修正：规定 golden 用的模拟归组回复只原样回写现有分级、不建组，这样下游 payload 字节不变。再用单独的用例覆盖建组后的下游行为。方案里写明：golden 只新增 `legacy-scene:analyze/grouping/worldline///` 一个键，其余键逐字节相同，用 `--check` 前后 diff 验证（脚本写文件用的是 `flag:'wx'`，重新生成要先移走旧文件）。
   - 会受影响的现有用例要列出来：`tests/integration/novel-import-wizard-publish.test.ts:93-94`（WT-30 断言时间整理请求在全部批次之后，并检查请求数）、`tests/unit/novel-import-lines-performance.test.ts:395-450`（WT-31～35 断言请求计数，WT-35b 断言恰好 3 处清理现场），以及 `tests/unit/novel-import-wizard-session.test.ts` 中比较 `f.requests.length` 的用例（`:59/117/357/843/892`）。说明哪些断言需要改，为什么改动不算放宽。

## 建议修改

8. **“旧会话恢复时会补跑归组”的说法不准确。** 第 17 步已经 `done` 的会话不会再进入 `runLine`（`novel-import.ts:698` 会直接跳过已完成的步骤），所以停在第 18～21 步的旧会话不会补跑。这其实更安全：第 18 步的结果引用的是旧事件集合。请把 §4 改成“只有第 17 步尚未完成的旧会话会补跑”，并把 WG-31 限定在这种情况。

9. **实际并发上限是 2，不是 `WIZARD_LINE_CONCURRENCY`。** 归组请求没有 `executionLane`，不属于 `lightImportGeneration`/lane（`novel-import-ai.ts:1103,1116`），会走 `generateText → withLongTask`（`src/lib/ai/generate.ts:91`），受聊天长任务名额限制（`maxConcurrentTasks` 默认 2，`cost-config.ts:9`），还会和聊天抢名额。WG-33 用模拟 AI，看不到这一层。第 1 卷 2 段时没有影响。建议方案注明这一点，WG-R3 记录真实的同时在途请求数。

10. **分段要用归组行的尺寸。** 归组行比时间整理行多了 category 和 importance 两列。`worldTimelineSegments` 的尺寸函数要传入新的 `worldGroupingRowSize`，不能沿用 `worldTimelineRowSize`（`novel-import.ts:1211`）。另外，回复要给每个事件一条 grade，输出长度大致与输入事件数成正比。建议在 WG-R1 记录每段的输出 token 和 finishReason，确认没有截断（`maxOutputTokens` 默认没有设置，`novel-import-ai.ts:755`）。

11. **父 id 格式。** `readableValue` 用 `/\b[a-z]{1,2}-[0-9a-f]{16}\b/` 把冲突中的实体 id 显示成名称（`novel-import-conflict-choices.ts:15,65`）。`wl-grp-…` 不匹配这个模式，第 21 步涉及 parentId 的冲突会显示原始 id。建议使用 `'wl-'+importHash(['grouping',…]).slice(0,16)`，与 `wizardLineIds` 的格式一致。冲突重算沿用 `fresh` 的计数方式。

12. **第 21 步复核会看到父事件，作者处理的冲突会增加。** `reviewMaterials`（`novel-import.ts:1512-1520`）会把父事件放进包含任一成员证据的每个章节包。每个包只看到部分 evidence，`text` 又是跨章概述，复核模型容易报“正文没有写到”。父事件的 `text` 不在 `WIZARD_REVIEW_STRUCTURAL` 中，可能被自动修复改写。建议二选一：(a) 复核材料跳过归组生成的父事件（例如用 `facts.groupedFrom`，或在 `w.worldGrouped` 中记录父 id 列表），因为父事件的事实就是成员事实的概述；(b) 保留复核，但在真实验收中统计父事件相关的冲突数量，作为 WG-R1 的一项指标。

13. **作者可见的丢弃记录。** `worldGrouped.dropped` 只是一个计数。建议像 `recordLinesRepairs` 那样写进 `w.dropped`（kind `lines`），让第 21 步页面能看到“归组丢弃 N 项”。这是现有惯例（`novel-import.ts:1164-1166`）。

14. **验收阈值。**
    - 提示词写了“3 档约一成，2 档约三成”，验收又要求“3 档 ≤ 20%”。这只是在检验模型是否照配额分档，不能说明分级合理。“带父的事件 ≥ 30%”也没有依据，反而可能鼓励过度归组。
    - 建议改为：保留分布统计，作为“事实报告”而不是通过条件。另加两项质量检查：(a) 人工抽查至少 20 个组（只看名称与成员名称，不导出原文），记录明显错归的比例；(b) 检查跨段同名的父事件，以及成员名与父名重复的情况。
    - `其他 < 20%` 可以保留为目标。按记忆中的缓存膨胀规则，阈值只按第一次运行判断。
    - 用户要求 R2 是“可在类型下拉框中看到”。WG-R2 截图要包含一个非“其他”类型的卡片下拉。

15. **缺失的用例（在必须修改各条之外）：**
    - 父事件发布后在 `worldEventsInOrder` 中排在第一个成员之前（§5 依赖排序稳定性，`novel-import-publish.ts:156`）。
    - 被第 21 步 `retryKind`/`revise`/补丁重置（`novel-import.ts:1708/1836/1860`）清掉后，再次走第 17 步会重新归组，父 id 稳定（WG-07 只覆盖了纯函数）。
    - 归组回复中某个成员的 timeValue 锁定（`WORLD_TIMELINE_FIELDS` 锁）时，父范围仍然覆盖它。
    - 批次内长文本被拆成 part（`novel-import-publish.ts:169`）的事件作为成员时，part 的 `parent` 仍指向自身，不被改成父事件。
    - 只选“世界线”、不选角色时（C1），`people` 为空，父事件仍然有效（`semantics.ts:271` 要求 `people` 存在）。

## 可选

16. **备选做法：从成员中选一个作为父事件，而不是新建。** 让模型在每组中指定一个统领事件（例如“调查开始”），把它的时间设为组内最早，其余成员作为子事件。这样不会产生没有自有原文的新实体，第 12 条的复核问题和第 2、3 条的字段补全都会消失，id 与 evidence 也天然合法。代价是父事件的标题和概述是某个具体事件，不是“这件大事”，与用户截图期望的“父事件框”在语义上稍弱。如果用户更看重父事件的概括性，维持现方案即可。

17. **备选做法：把归组并入时间整理请求。** 时间整理已经看全卷、按时间排序，加一个 `group` 字段可以省掉一轮请求。但这会改动已验证的 `timeline` 契约和 golden，并让已经需要 8.5 分钟的请求更重。我同意方案不这样做。

18. 分级回复中没有出现的事件保持原值，这一点合理。也可以把“归组请求是否覆盖了全部 key 的分级”记入 `worldGrouped`（如 `graded:n`），便于真实运行时判断模型有没有漏项。

## 第 2 轮

审核对象：`docs/587-worldline-import-hierarchy-plan.md`（修订 2），仍按 `4d61712` 只读核对源码，没有运行应用、测试或模型。

结论：**不通过**。第 1 轮第 1～7 条的处理方向都对，其中第 2、3、5、6 条按现稿可以实现。但第 7 条的“fixture 原样回写现有分级、不建组”与 WG-06 冲突，按现稿实现时第 17 步会在 fixture 中失败，golden 只新增一键的说法也不成立。第 1 条的 nextUp 校正在多层父子链上仍可能失败。这两处需要先改方案。

### 第 1 轮第 1～7 条逐条核对

| # | 结论 | 依据 |
|---|---|---|
| 1 | 部分解决，见必须修改 2 | 两层父子时成立：`domain.ts:494-513` 对父事件 `duration>0` 取 `bound.end=start+duration`（`domain.ts:345-349`），`while(lo+d<hi)` 保证 `end>=hi`。子事件不带 duration，`resolved.end=start`（eventSchema 默认 0，`domain.ts:46`），可以通过检查。`duration=0` 时父事件终点是 `start+hoursPerDay`（`domain.ts:498-503`），主线的 fixed 与 gregorian 日历都是默认 24（`domain.ts:21`，`novel-import-publish.ts:161` 没有传 hoursPerDay），WG-21 成立。precision 只影响显示（`domain.ts:15`），校验不读它，所以把父事件的 `time.value` 改为 `lo` 与 gregorian 精度不冲突。多层父子链的情况见必须修改 2。另外 JS 没有内置 `Math.nextUp`，需要用 `Float64Array`/`BigInt64Array` 自己实现，并给它单独写用例 |
| 2 | 已解决 | 父 facts 是 `lineId/lineName/timeKind/timeValue/time/people/reliability/category/importance`，都在 `importAcceptedFactFields('worldline')` 中（`semantics.ts:58,98-99`），不会因未支持字段被 strict 拒收。`reliability:'客观事实'` 不需要 attribution（`semantics.ts:181-183`）。strict worldline 要求 `lineId/lineName/people/timeKind`（`semantics.ts:271`），方案都有。evidence 取自成员，成员已经通过 `validateImportEvidence`（`core/novel-import.ts:236-241`；发布前对 `s.units+workingUnits` 复检，`publish.ts:79`），所以引文可以定位。`sourceUnitIds` 取 evidence 单元的并集，与 scope 检查（`wizard-checks.ts:21`、`fixStructure` `novel-import.ts:1626`）一致：成员因越界被删时，父事件引用同一批单元，也会被删。需要注明 `people` 要序列化成 JSON 字符串，`importance` 要写成字符串 `'1'..'3'`（`semantics.ts:276`），因为回复里的 importance 是数字 |
| 3 | 已解决 | 截到 100，与 `domain.ts:44` 一致；有 WG-09 |
| 4 | 已解决 | (a) 已有父或子的事件不入组，所以归组父事件的成员都是叶子。(b) `fixStructure` 在删除阶段之后、`importNativeMappings` 之前做 map（`novel-import.ts:1630-1635`），叙事 refs 的悬空清理就在这里，parentId 的清理放在同处可以实现，而且先于 `mappableArtifacts` 回退，所以不会连带删除子事件。`lines` 检查（`wizard-checks.ts:24`）增加 parentId 可解析的检查，也与 `finishWizardChecks` 在 `fixStructure` 之后调用（`novel-import.ts:1503`、`:1481`）的顺序一致 |
| 5 | 已解决（多层的情况见必须修改 2） | 起点取 `min(自身, 全部后代)`，`resolved.start>=bound.start` 恒成立 |
| 6 | 基本解决，见建议 1 | 逐项核对 `'timeline'` 在源码中的全部出现位置（`payload.ts:70,187`；`runtime-proof.ts:5`；`semantics.ts:48`；`novel-import-ai.ts:517,682,920,958,959,1202`；`main/novel-import.ts:2300`），方案都已列出。`runtime-proof.ts:6` 的 refine 要求非 structure 的 intent 必须是 `phase:'analyze'`，grouping 满足。漏了一处，见建议 1 |
| 7 | 未解决，见必须修改 1 | `fullAi=touchesAi(linesAi(worldsAi(...)))`（`fixture.ts:204`），golden 的两个流程都走 `fullAi`（`capture-…golden.ts:6,20`），所以只在 `linesAi` 中加 grouping 回复就能覆盖 golden、`linesFixture`（`lines-performance.test.ts:30-32`）以及 publish 集成测试（`wizard-publish.test.ts:31,91,108`）。key 计算（`golden.ts:15`）得到 `analyze/grouping/worldline///`，与方案一致。问题在于回复的内容 |

### 必须修改

1. **fixture 的事件没有分级，“原样回写现有分级、不建组”会得到空回复，触发 WG-06 失败。**
   `linesAi` 的世界线批次回复 facts 只有 `lineId/lineName/timeKind/people/reliability`，没有 `category`/`importance`（`fixture.ts:173`）。publish 用例的 `chapterEvents` 也是这样（`wizard-publish.test.ts:76`）。于是“回写现有分级”得到 `{groups:[],grades:[]}`，按 §3.1 和 WG-06（“某段既无合法组又无合法分级时抛错”），第 17 步会在每个走到第 18 步以后的 fixture 中失败。
   如果改成给每个事件回写缺省的 `['eN','其他',1]`，§3.4 会把 `category:'其他'`、`importance:'1'` 写进 facts。第 21 步复核材料带着完整 facts（`novel-import.ts:1515-1516`），`legacy-scene:review////wizard-review-v1/` 的 payload sha 就会变，golden 只新增一键的说法不成立。
   修正（任选一种，写进 §3 和“对已有测试的影响”）：
   (a) 规定分级只在与 `worldlineGradeFromFacts` 的有效值（`worldline-facts.ts:11-14`，缺省为 其他/1）不同时才写入 facts。这样“回写缺省分级”不改字节。fixture 回复全部 key 的 `['eN','其他',1]`，WG-06 也不会触发。
   (b) 或者把 WG-06 改成“回复里所有 key 都非法时才抛错”，允许回复合法地为空。
   我建议用 (a)。同时加一个用例：分级与有效值相同时 artifact 逐字节不变。

2. **§6 的范围计算对多层父子链仍可能差 1 ulp。**
   §6 对“每个有子事件的事件”都计算范围，这包括第 17 步批次自带的 `parentId` 链（`payload.ts:76`，`novel-import.ts:136`），例如 A→B→C。`validatePlanning` 沿祖先链检查 B 是否落在 A 内（`domain.ts:487-516`），B 的 `resolved.end=B.lo+B.d`。B 经过 nextUp 校正后可能比 C 的值大 1 ulp，而 A 的 `hi` 按“全部后代 timeValue 的最大值”计算，等于 C 的值，A 的终点就可能比 B 的终点小 1 ulp，检查报“超出祖先允许范围”。HEAD 上这类链不设 duration，父终点是 `start+24`（`domain.ts:498-503`），子事件在 24 小时内的链能通过；改成 §6 的算法后反而可能失败。
   修正：自底向上计算，`hi=max(每个子事件的发布终点)`，子事件的发布终点是 `value+duration`（有子事件时）或 `value`。WG-22 的模糊测试要加入三层链。

### 建议

1. 控制器 `ai()`（`novel-import.ts:2300`）的越权字段循环 `for(const key of ['classifications',…,'sceneParents'])` 也要加 `groups`、`grades`。否则其它阶段的模拟回复带这两个字段时能通过控制器，只有服务端（`novel-import-ai.ts:959`）会拒收。WG-13 应该覆盖“timeline 阶段返回 groups 被拒”。
2. 子事件在第 21 步被作者改成 `window` 时，`resolved.windowEnd` 也参与检查（`domain.ts:512`）。§6 写的“非 exact 保持原逻辑”会让 `timeEnd` 超出父范围的情况发布失败。建议 `hi` 也计入 window 子事件的 `timeEnd`，unknown 的子事件不计入（`resolveTime` 返回 null，不受检查，`domain.ts:340-341`）。
3. 排序：`worldEventsInOrder` 按 facts 的 `timeValue` 排序，相同时按下标（`publish.ts:156`）。父事件的 `timeValue` 等于成员最小值，“插在第一个成员之前”能保证它排在前面，前提是数组中第一个成员就是时间最小的成员。被 `WORLD_TIMELINE_FIELDS` 锁定的成员保留原位置（`wizard-timeline.ts:409`），不一定满足这个前提。另外，发布时 `lo` 可能小于父事件 facts 的 `timeValue`（WG-23 的情况），按 facts 排序后父事件会排在被提前的子事件之后。`validatePlanning` 不检查顺序，所以不会导致发布失败，但 §6 关于父事件排在前面的说法在这两种情况下不成立。建议在 §3 写明插在时间最小的成员之前，在 §6 写明按发布后的 `lo` 排序，或者删掉这条说法。
4. 候选为空（所有事件都是锁定、非主线或非 exact）时，应该不发请求、直接写入 `worldGrouped={groups:0,…}`，否则每次恢复都会再进入归组。`runWorldTimeline` 在目录为空时直接 return（`novel-import.ts:1204`），但这时也没有 worldTimeline，所以不会进入归组。需要明确的是“有 worldTimeline 但候选为 0”的情况。
5. `worldTimeline.events`（`applyWorldTimeline`，`wizard-timeline.ts:423`）不包括父事件，WT-30 用 `deepEqual(…events:events.length)` 断言（`wizard-publish.test.ts:97`）。fixture 不建组时不受影响，但建组的用例（WG-20、WG-34）不能照抄这条断言，需要在用例中写明。
6. 父事件被 `fixStructure` 去掉全部子事件后，会成为一个独立的概述事件，它的 id 仍留在 `worldGrouped.parents` 中，复核时继续被跳过。建议这种父事件一并删除并记录，或者在方案中说明保留它的理由。
7. 测试用例补充：归组请求暂停与恢复（参照 WT-33）；分级与有效值相同时字节不变（必须修改 1）；三层链与 window 子事件的发布（必须修改 2、建议 2）；控制器拒收其它阶段的 groups（建议 1）；`nextUp` 本身（正数、0、负数、大量级）。

### 其它核对（无问题）

- §4 的三处清理（`novel-import.ts:1708/1836/1860`）都在 WT-35b 匹配的 `delete … lineRepairs` 行上（`lines-performance.test.ts:447-448`），在同一行加 `delete w.worldGrouped` 后，处数仍为 3。
- §5 复核材料跳过父事件：wizard 复核的覆盖率按章节包统计，`reviewFacts` 的投影检查只用于场景（`novel-import.ts:477-479`），所以跳过父事件不影响保存前的覆盖检查。
- `WT-31～35` 只统计 `isTimeline` 和批次（`lines-performance.test.ts:393-443`），不受归组影响。会话测试 `:59/117/843/892` 只计数第 17 步之前的阶段。`:357` 在第 21 步 resolve 之后计数，resolve 不会重跑第 17 步。这些用例都不需要改，但实施时仍要逐条确认。
- 父 id `wl-`+16 位与 `ENTITY_ID`（`conflict-choices.ts:15`）匹配。`precisions` 的上限 5000（`wizard-state.ts:85`）对第 1 卷（约 1000 个事件加上父事件）够用。

## 第 3 轮

审核对象：`docs/587-worldline-import-hierarchy-plan.md`（修订 3），仍按 `4d61712` 只读核对源码。没有运行应用、测试或模型。下面的数值结论来自 `node`/`tsx` 小实验，实验直接调用 HEAD 的 `validatePlanning`，数据是合成的。

结论：**不通过**。第 2 轮必须修改 1 已解决。第 2 轮必须修改 2 对 exact 祖先已解决，但祖先是 window 时仍有一种 HEAD 能发布、新算法会失败的情况（见必须修改 1）。改动很小，方案改正后可以直接进入实施，不需要再审一轮。

### 第 2 轮必须修改 1（分级只在与有效值不同时写入）：已解决

- 有效值：`worldlineGradeFromFacts`（`desktop/core/novel-import-worldline-facts.ts:11-14`）把缺失或非法的 category 当作 `其他`，把 importance 不是 `'2'`/`'3'` 的当作 `1`。fixture 批次回复的 facts 只有 `lineId/lineName/timeKind/people/reliability`（`tests/helpers/novel-import-wizard-fixture.ts:173`，publish 用例的 `chapterEvents` 也一样，`tests/integration/novel-import-wizard-publish.test.ts:76`），所以每个事件的有效值都是 `其他/1`。回写 `["eN","其他",1]` 时，按方案 §3.4（方案 `:62`），facts 不写入新值，artifact 逐字节不变。
- golden 只新增一个键：golden 的两个流程是 `identity-characters`（`passCharacters`，停在第 17 步之前）和 `legacy-scene`（`toVerify`）（`scripts/capture-novel-import-prompt-golden.ts:25`）。只有 `legacy-scene` 会走到第 17 步，`fullAi` 又经过 `linesAi`（`fixture.ts:204`）。key 的算法（`golden.ts:15`）对 `{phase:'analyze',intent:'grouping',kind:'worldline'}`、不带 sceneIdentity、lane 和 parentTargets 的请求，得到 `legacy-scene:analyze/grouping/worldline///`，正好一个新键。其余键不变的依据如下：
  - 下游 payload 只序列化请求字段（`novel-import-ai-payload.ts:43`），不包括 `w.worldGrouped`、`revision`、请求次数。复核 instruction 只带 `s.decisions`（`novel-import.ts:1521`）。所以 artifacts 字节不变，第 18～21 步的 payload 和 prompt sha 就不变。
  - 同一个键下的列表按 prompt 排序（`golden.ts:29`），多出来的请求不会打乱其它键的顺序。
  - 现有 golden 中的世界线相关键只有 `…analyze//worldline//wizard-lines-v1/` 和 `…analyze/timeline/worldline///`，归组在这两类请求之后发送，不影响它们。
- WG-06 不会触发：fixture 回复里每个 key 都带合法分级，“既无合法组又无合法分级”不成立。前提是实现时把“与有效值相同”的分级算作合法、不算丢弃（见建议 1）。
- 其它用到世界线 mock 的向导用例都经过 `linesAi`（`conflict-choices`、`wizard-session`、`lines-performance`、`foreshadow-performance`、`stop-after-save`、`verify-session`、`wizard-publish`、`verify-publish`），所以都能拿到归组回复，不会落到 fixture 默认的 `{notFound:true}`（`fixture.ts:37`）。不经过 `linesAi` 的用例（`semantic-session`、`request-schema`、`novel-import-publish` 等）不是向导流程，不会进入 `runWorldGrouping`。

### 第 2 轮必须修改 2（自底向上计算范围）：exact 祖先已解决，window 祖先未解决

逐项对照 `validatePlanning`（`src/lib/planning/domain.ts:487-517`）与 `resolveTime`（`domain.ts:337-350`）：

- 子事件在祖先检查中的区间是 `[resolved.start, resolved.end ?? resolved.windowEnd ?? resolved.start]`（`domain.ts:510-512`）。exact 且 duration 为 0 时，`resolved.end=start`；window 时，`end` 为 null，取 `windowEnd=timeEnd`。方案 §6 把叶子 exact 定为 `[v,v]`、window 定为 `[v,timeEnd]`、有子事件的定为 `[lo,lo+d]`（方案 `:81`），三者都与源码一致。
- exact 父事件的终点：`duration>0` 时为 `start+duration`；`duration===0` 时为 `start+hoursPerDay`（`domain.ts:499-503`）。发布时的 worldline 都不带 calendar 的 hoursPerDay，取默认值 24（`domain.ts:21`，`novel-import-publish.ts:163`）。`d=0`（子事件时间全相同）时，`while(lo+0<hi)` 不进入循环，duration 保持 0，按 +24 规则通过，WG-21 成立。
- exact 祖先链：任一层的 `lo+d` 都 ≥ 该子树的最大终点，再往上一层取 `max` 后 nextUp，逐层成立。`validatePlanning` 会让孙事件直接对照所有祖先检查（`:489-516` 的 while 循环），这一点也被满足，因为 `[lo,lo+d]` 包含了整个子树。
- 祖先 time 为 unknown：`bound.start` 为 null，HEAD 直接报“父事件范围尚未明确”（`:506-509`），HEAD 本来就发布不了，不算回退。
- anchor：发布写入的 time 不带 anchor（`novel-import-publish.ts:169`，schema 默认 null，`domain.ts:13`），这条分支走不到。

**仍有问题的情况：父事件是 window。** window 父事件的终点固定为 `bound.windowEnd`（`domain.ts:497-498`），不随子事件变化。方案 §6 只对 exact 事件计算范围（方案 `:80`、`:84`），window 父事件的终点仍是它自己的 `timeEnd`。它下面的 exact 子事件 B 如果有子事件 C，而 C 恰好等于 `timeEnd`，那么 B 按新算法得到 `d=nextUp(...)` 后，`B.lo+d` 可能比 `timeEnd` 大 1 ulp，B 对 A 的检查就会失败。HEAD 上 B 不设 duration，`resolved.end=B.start`，C 对 B 的检查按 +24 规则通过，所以 HEAD 能发布。实测：

- `A={kind:'window',value:-19.195661,end:2.495924}`，`B={exact,-16.720715}`，parent 为 A，`C={exact,2.495924}`，parent 为 B。HEAD（B 的 duration=0）`validatePlanning` 通过。新算法得到 `d=19.216639`，`B.end=2.4959240000000016`，报“B 超出祖先 A 允许范围”。
- 在 ±30 量级随机取 6 位小数，HEAD 能通过的 4 例中有 3 例按新算法失败。
- 在 ±1e4 和 ±1e7 量级各取 20 万对 6 位小数，`lo+d===hi` 恰好相等的比例约 2/3，剩下约 1/3 无论怎样调 d 都只能大于 hi（往回退一个 ulp 就会小于 hi，6.7 万例中 0 例能调到恰好相等）。所以在终点固定的祖先下面，只要设了 duration，就无法保证不越界。

这种情况需要先有 window 祖先，而主线事件在第 17 步都被 `applyWorldTimeline` 改成了 exact（`novel-import-wizard-timeline.ts:411-413`）。window 只会来自锁定时间字段的事件、不在主线上的事件，或者第 21 步作者的改动，所以很少见。但它违反 C2，也违反 WG-25 中“含 HEAD 上可发布的 24 小时内情况”的承诺。

### 必须修改

1. **时间跨度在一天内的父事件保留 duration 0，往上一层传的是子树最大终点。**
   §6 改为：对每个有 exact 或 window 子事件的 exact 事件，自底向上计算 `lo=min(自身, 子树各起点)`、`hi=max(自身, 子树各终点)`。
   - 如果 `lo===自身 timeValue` 且 `hi<=lo+hoursPerDay`（即 HEAD 的 +24 规则已经能覆盖），就不改这个事件，duration 保持 0。它对祖先暴露的区间是 `[lo,lo]`，但祖先计算范围时要用整个子树的 `hi`，因为 `validatePlanning` 会让孙事件直接对照祖先检查。
   - 只有超过一天，或者起点需要前移时，才写 `time.value=lo`、`duration=d`，再做 nextUp 校正。这样 HEAD 能发布的链保持 HEAD 的发布结果，不会出现回退。超过一天的链在 HEAD 上本来就发布不了，在 window 祖先下面仍可能差 1 ulp，这种情况可以接受，但要在方案里写明。
   - 归组新建的父事件没有祖先（成员都是叶子，父事件自身没有 parentId），不受这条影响。
   - 用例：WG-25 加入“window A → exact B → exact C，C=A.timeEnd”，用上面的数值作为固定样例，断言 HEAD 能发布的情况新算法也能发布。WG-22 的三层链模糊测试加入 window 根节点。

### 建议

1. 在 §3.1 写明：与有效值相同的分级算作合法、计入 `graded`，只是不写进 facts；不算丢弃，也不让该段被判为“无合法分级”。否则实现者可能先过滤掉“无变化”的分级再判断 WG-06，fixture 就会失败。WG-15 可以同时断言 `graded` 的计数。
2. §6 的标题写“有 exact 子事件的 exact 事件”（方案 `:80`），而下一行又计入了 window 子事件（`:81`）。请统一为“有 exact 或 window 子事件”。另外写明：带子事件的 window 事件不重算，它对祖先暴露的区间仍是 `[v,timeEnd]`。它的子事件超出 `timeEnd` 时，HEAD 也会失败，保持原样即可。
3. §5 删除失去全部子事件的归组父事件时（方案 `:76`），顺手从 `worldGrouped.parents` 和 `worldTimeline.precisions` 中去掉它的 id。留着不会出错，但 WG-38 的“父事件数与 `worldGrouped.groups` 一致”在这种情况下会不成立。可以在用例里写明以哪个为准。

### 第 2 轮建议的处理：全部落实

| 第 2 轮建议 | 修订 3 位置 | 结论 |
|---|---|---|
| 控制器越权字段循环 | 方案 `:38` | 已加 groups/grades |
| window 子事件计入 timeEnd | `:81`、WG-26 | 已处理；措辞见建议 2 |
| 排序说法 | `:86` | 已改为如实说明 |
| 候选为 0 | `:63`、WG-16 | 已处理 |
| WT-30 的计数断言 | WG-38 | 已处理 |
| 父事件失去全部子事件 | `:76`、WG-36 | 已处理；见建议 3 |
| 补充用例 | WG-15/17/25/26/37 | 已补 |

### 其它核对（没有发现新问题）

- `nextUp` 的实现（方案 `:83`）：只用于 `d>=0`，正数的位模式加 1 就是下一个可表示值；`d=0` 返回 `Number.MIN_VALUE`。实测和预期一致。
- 修订 3 没有改第 17 步的批次契约、`applyWorldTimeline` 或 golden 中已有的键。fixture 默认不建组时，`worldlineFamilyRanges` 找不到父子关系，发布结果与 HEAD 相同。所以 WT-30 中 `values.map((_,i)=>i*24)` 的断言（`wizard-publish.test.ts:102`）不受影响。
