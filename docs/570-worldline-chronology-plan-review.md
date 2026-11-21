# 570 导入作品后世界线没有正确识别 · 独立审核

日期：2026-11-14。审核对象：`docs/570-worldline-chronology-plan.md`。行号按当前工作树（HEAD `872303d`）。本次未修改任何源文件。

结论：**有条件通过**。根因判断正确，“一条主世界线 + 本步末尾整理一次全书时间线”的方向满足用户约束，也比各批次自己给时间可靠。下面的必改项需要先补进方案：新 intent 有两处漏改，会直接让请求失败；`precision` 放错了位置；同日事件的严格递增规则会自相矛盾；第 21 步复核会自动改写推定出的时间；测试夹具和 LP-12 必然失败，方案没有列出。

## 一、根因核对

| 方案声明 | 核对结果 |
| --- | --- |
| 发布时按 `facts.lineId` 生成 `import-world-<lineId>` | 属实，`desktop/service/novel-import-publish.ts:151`（`eventMap`）、`:156`（`worlds.push`）。 |
| `wizardLineIds` 用 `lineName` 哈希生成 `lineId` | 属实，`desktop/main/novel-import.ts:133`，`'line-'+importHash(lineName 去空白)`。 |
| 契约要求写“事件所属的故事线” | 属实，`desktop/core/novel-import-ai-payload.ts:143`。 |
| `normalizeLinesReply` 把非数值时间改成 `unknown`，文字并入 `time` | 属实，`desktop/service/novel-import-ai.ts:1435-1436`。 |
| 面板默认显示第一条世界线；`unknown` 显示“待定位” | 属实，`PlanningWorkspace.tsx:203`（`data.worlds[0]`）、`:2031`、`:2265-2266`（`start===null` 归入 pending）。 |
| 事件按会话数组顺序写入 | 属实，`novel-import-publish.ts:153-159` 按 `byKind('worldline')` 顺序 push，没有排序。 |
| 会话 `28b425e5…`：138 个事件，全部 `unknown`，131 个 `lineName`，每条最多 3 个，`parentId` 0 个 | 我重新读取了该会话，数字一致，共 213 章。另有两项方案没写的数据：138 个事件中只有 46 个带 `time` 文字，只有 16 个含“X月X日”或“X年”；138 个事件分布在 105 章里，有 108 章没有事件。 |

补充：截图中的“时点”来自 `PlanningWorkspace.tsx:2043`（`duration===0`），与时间无关，不需要改。

## 二、新增 intent `timeline` 的完整性

方案“影响文件”列出的位置大体正确，但下面几处必须逐一写进实现清单。标“漏”的方案没有覆盖。

| 位置 | 现状 | 需要的改动 |
| --- | --- | --- |
| `desktop/core/novel-import-semantics.ts:47` `intent` 联合类型 | 无 `timeline` | 加入；`ImportSemanticResult`（`:45`）加 `timeline?:{id,order,date?}[]` |
| `desktop/core/novel-import-runtime-proof.ts:5` `identity.intent` 枚举 | 无 `timeline` | 必须加入。`runtime.invoke` 用它校验调用记录，缺了每次调用都会失败。`refine` 要求有 intent 时 `phase==='analyze'`，与方案一致 |
| `desktop/service/novel-import-ai.ts:912` `semanticContextSchema.intent` | 无 | 加入，否则 `validateSemanticRequest` 报“上下文结构无效” |
| `novel-import-ai.ts:674` `USAGE_ENUMS.intent` | 无 | 加入，否则用量记录为 `'?'`（不报错，但调试行失真） |
| `novel-import-ai.ts:500-509` `importAiResponseSchema` | — | 新分支须放在 `const base=…` 之前，与 `touches` 并列；`semanticSchema` 是 `.strict()`（`:46`），不认识 `timeline` 键 |
| `novel-import-ai.ts:950-951` `validateSemanticStage` | `timeline` 会落入 stage `analyze`，字段检查列表里没有 `timeline` | 加 stage `timeline`，`allowed.timeline=['timeline']`，并把 `timeline` 加入检查列表 |
| **漏**：`novel-import-ai.ts:1194` | `phase==='analyze'` 且 intent 不在 `['reconcile','roster','touches']`，没有 artifacts 也没有 `notFound` 就报“未找到内容时必须明确返回 notFound” | 必须把 `timeline` 加入。否则所有 timeline 回复都会被拒 |
| **漏**：`desktop/main/novel-import.ts:2259` 主进程 `allowed` 表和字段循环 | 同上，`timeline` 落入 stage `analyze` | 加 stage 和字段，与服务端一致 |
| `desktop/core/novel-import-ai-payload.ts:170` `listIntent` | 只有 roster/touches | 加入。否则 `:172` 的 `kindContract` 会要求 `artifact.kind` 等于 `worldline` |
| **漏**：`novel-import-ai-payload.ts:178` 证据指引、`:200` 结尾的 evidence/sourceUnitIds/`semantic-native-contract` | 对所有非 roster 的 analyze 请求都会附加 | timeline 不返回证据，这些文字会和“只返回 timeline”冲突。建议像 `sceneIdentity` 一样在 `legacyImportAiPrompt` 开头单独 `return` 一个 timeline 提示（`:166-168` 已有先例），不拼接通用尾部 |
| `novel-import-ai-payload.ts:186` `contracts.analyze` | — | 如果按上一条单独返回提示，这里不用改 |
| `novel-import-ai.ts:937` | 只对 roster/entity/touches 要求 `units.length>0` | `timeline` **不要**加入此列表，`units:[]` 才能通过 |
| `novel-import-ai.ts:1108` `lightImportGeneration` | — | 方案选择不关思考，不加入，这是对的 |
| `main/novel-import.ts:2256` `scopeHash` 分支 | `timeline` 会走 `importScopeHash(s,'analyze')` 现算 | 可以工作。只请求一次，不必加入缓存分支 |
| `main/novel-import.ts:2188` `monotone` | 只用于 `planRequests` | timeline 不经过 `planRequests`，不用改 |

`units:[]` 的其余检查都能通过：`runImportAi` 的单元唯一性（`novel-import-ai.ts:1139`）对空数组成立；`assertImportPayloadBudget`（`ai-payload.ts:46`）只限制单元数、单元字数和 `payload≤3×budget`；`requestFits`（`main/novel-import.ts:2143`）同样如此；`sharedSourceRequestError` 在没有 `sharedSource` 时直接返回。`requestSnapshot` 会附上全量 `entities` 和 `chapters`（`:2128`），但 `serializeLegacyImportAiPayload` 按正文命中过滤（`ai-payload.ts:32-37`）。`units` 为空时两者在 prompt 中都是空数组，不会把整个目录塞进请求。

## 三、时间分配算法与发布

### 已核实可行的部分

- `formatTime` 的 gregorian 分支用 `Date.parse(calendar.epoch)`（`src/lib/planning/timeline.ts:56`）。`Date.parse('1349-06-28')` 得到 `-19581436800000`，按 UTC 解析；`toISOString` 也按 UTC 显示，所以不会因时区错一天。负值（日期早于 epoch）同样能正确显示。
- `Date.parse('1349-02-29')` 不报错，会滚动成 3 月 1 日；`'1349-13-01'` 得到 `NaN`。方案要求“往返解析一致”，这一点是必需的，写法正确。
- 发布校验只要求推断事件带 `lineId/lineName/timeKind`（`novel-import-publish.ts:155`），`exact`+数值时间能通过；`eventSchema` 允许任意有限数（`domain.ts:10`）。

### 必改

**必改 1：`precision` 不是世界线字段。** `calendarSchema`（`src/lib/planning/domain.ts:17-23`）没有 `precision`，`precision` 在每个事件的 `time` 上（`:14`）。按方案写在世界线上，会被 `worldlineSchema.parse` 静默丢弃。更关键的是 `formatTime` 完全不读 `precision`，而事件卡在 gregorian 日历下固定传 `span=1`（`PlanningWorkspace.tsx:2034-2037`），所以卡片总显示到分钟，例如 `1349-06-28 00:00`。方案要写明：
- `precision:'day'` 写在每个事件的 `time` 上，主要用于编辑面板（`:1551`）；
- 卡片显示到分钟是现有面板行为，本次不改（方案已声明不改面板）；
- 插值时间尽量落在整天上（见必改 2），避免出现 `07:12` 这类时刻。

**必改 2：同日多个事件时，“日期单调不减”和“严格递增”会冲突。** 方案允许两个有日期事件同为 `1349-06-28`，但两者的 `timeValue` 都由日期算出，会相等。“+1 小时”的补丁只作用于插值事件，管不到有日期的事件。同一天事件超过 24 个时，补丁还会越过下一天的有日期事件。建议改成：
- 每个有日期事件取所在日的 0 点作为下界；
- 同一天内共有 k 个事件（含有日期和插值的）时，按名次在当天 24 小时内等分，`timeValue=day+i×24/k`（允许小数）；
- 不同日期之间的无日期事件按整天等距；间隔不足一天时退回到小时等分；
- 测试覆盖：同一天 30 个事件、两个有日期事件之间夹着 0 个和 50 个事件、全部事件都在第一个日期之前。

**必改 3：没有年份的日期怎么处理，要写进契约。** 契约只接受 `YYYY-MM-DD`。正文常只写“6月28日”或“三天后”，年份要靠前文推断。要明确：年份由前文已知日期沿用（模型负责），还是改为允许 `MM-DD`、由应用沿用最近一个已知年份。否则模型要么编造年份，要么省略大部分日期。按上面的会话数据，只有 16/138 个事件的 `time` 含日期，模型能否推出年份决定了 gregorian 和 fixed 两条路径中会走哪一条，验收前要先确认。

**必改 4：“（按先后推定）”写进 `time.label` 后看不到。** 事件卡只在 `window` 时显示 `label`（`PlanningWorkspace.tsx:2041`），`exact` 事件显示不了。作者分不清哪些时间来自原文、哪些是推定的。要么写进 `fact` 末尾，要么在方案中说明这个标注只供数据回读，不在界面显示。后者需要用户接受。

### 建议

- 方案说用 `WIZARD_MAIN_WORLDLINE` 让模型写固定 `lineName`，`wizardLineIds` 再把它哈希成 `line-…`（`main/novel-import.ts:133`），最后 timeline 又改写成 `main-worldline`。三步可以并成一步：提取阶段不要求模型写 `lineName`，由 `normalizeLinesReply` 或 `commit` 补常量，timeline 只写时间。这样 `wizardLineIds` 和 LP-06/LP-07b 都不用动。
- 来源复制的世界线如果也用 `lineId:'main-worldline'`，会与推断事件并入同一条世界线（`publish.ts:156` 按 id 去重）。新 id 建议加不会与用户数据冲突的前缀，例如 `import-inferred-main`。
- 排序只在发布时做。会话里也应按名次重排推断事件，第 18 步的事件目录和第 21 步的复核材料就能按时间顺序呈现，代价很小。

## 四、断点恢复、清理与第 18–21 步

**必改 5：第 21 步复核会自动改写推定出的时间。** 复核材料把每个推断事件的 facts 原样发给模型（`main/novel-import.ts:1471-1476`），其中有 `timeKind/timeValue/time`。`WIZARD_REVIEW_STRUCTURAL`（`desktop/core/novel-import-conflict-choices.ts:11`）只含 `lineId`，不含这三个字段，所以 `autoRepairable`（`main/novel-import.ts:1520-1527`）会接受针对它们的冲突，并“以正文为准”自动改写（用户 2026-11-09 的选择）。推定时间本来就没有原文依据，模型很可能报“原文没有这个时间”。改写后可能出现：
- `timeKind` 被改成 `unknown`，但 `timeValue` 还在，`validateImportSemanticArtifact` 报“未知事件时间不得制造数值”（`novel-import-semantics.ts:269`）；
- 某个事件改成另一个数值，严格递增被破坏。

要求二选一：把 `timeKind/timeValue/timeEnd` 加入 `WIZARD_REVIEW_STRUCTURAL`；或者在 `reviewMaterials` 中去掉这三个字段，只留 `time` 文字。第二种更好，模型看不到推定数值，也就不会去“纠正”它。另外要补一条用例：复核返回针对 `timeValue` 的冲突时，不自动修复，时间线不变。

**必改 6：清理标记的位置要写准确。** `resetLaterSteps`（`main/novel-import.ts:1800-1803`）只重置 `stepState`，不清除任何数据，不是清理点。真正删除 worldline 产物的位置是：
- `retryKind`：`:1665`，删除后在 `:1667` 清 `lineRepairs` 等；
- 名录重建：`:1795`；
- `revise`：`:1819` 清 `lineRepairs`，`:1820` 删除产物。

这三处都要同时删除 `w.worldTimeline`。`importWizardStateSchema` 是 `.strict()`（`novel-import-wizard-state.ts:80`），新字段必须进 schema，否则旧会话读回就会失败（`:87`）。建议在 schema 中把 `epoch` 限为 `YYYY-MM-DD`，并要求 `calendar==='gregorian'` 时必须有 `epoch`。

**必改 7：恢复语义要写明。** 中断可能发生在批次全部提交之后、timeline 之前。这时覆盖率已经完整，`runLineParallel` 的队列为空。方案要写明：`runLine` 在 `!w.worldTimeline` 时一定执行 timeline，`advance` 只在 timeline 提交之后调用，`stepState.worldline` 在这之前不能为 `done`。标记和时间写回放在同一个 checkpoint，这一点方案已有。还要补一条用例：timeline 请求进行中暂停，恢复后只重发 timeline，不重发提取批次。

**第 18–20 步不受影响，已核实**：
- 讲述卡 `refs` 引用事件 id（`publish.ts:166`），世界线换成 `main-worldline` 后，`event.line` 跟着变，引用仍然成立；
- 伏笔 `eventIds` 只看 id（`main/novel-import.ts:1346,1393`）；
- 结构检查 `lines` 只核对 id 是否存在（`novel-import-wizard-checks.ts:24`）。

**建议：timeline 执行时还有未处理的 worldline 冲突怎么办，要写清楚。** 第 17 步合并同名事件时，不同字段会产生延后处理的冲突（`mergeImportArtifacts`，见 LP-16b）。timeline 改写 `time/timeKind` 后，冲突里记录的 `source.value` 会过期，复核时自动修复会因值不符而跳过（`:1526`），作者处理时看到的也是旧值。建议 timeline 跳过带待处理冲突的字段，或在写回后刷新这些冲突。

## 五、风险

**必改 8：现有测试和夹具会失败，方案没有列出。**
- `tests/helpers/novel-import-wizard-fixture.ts:168-200` 的 `linesAi`/`fullAi` 只处理 `!r.intent` 的 worldline 请求。timeline 请求会落到下一层 handler，返回的结构必然无效，第 17 步失败。用到 `fullAi`/`linesAi` 的单元测试有 7 个文件，包括整套向导流程。夹具需要加 timeline 分支，按目录返回顺序。
- LP-12（`tests/unit/novel-import-lines-performance.test.ts:214-219`）断言 lane 提示含“lineName不得等于或改写事件name”，契约改写后一定失败，需要改为断言新文字。
- LP-06/LP-07b（`:84-121`）断言 `lineId` 由 `lineName` 哈希得到。按方案保留 `wizardLineIds` 时，这两条仍然通过；如果采纳第三节第一条建议，也不用改。
- LP-23（`:130-145`）测的是 `normalizeLinesReply`，方案不改它，仍然通过。
- 提示金样：`scripts/capture-novel-import-prompt-golden.ts:38` 写文件用 `flag:'wx'`，必须先删除旧文件再生成。变化不止“worldline 车道一项”：`legacy-scene` 流程会多出一组 `analyze/timeline/worldline//`。方案要按实际 diff 写明这次的预期变化，并说明其它 22 组保持不变。

**容量与思考策略**：
- 第一卷约 140 项，每项约 200 字，输入约 3 万字；输出每项约 30 字符，约 4 KB。一次请求可行。
- 1000 个事件时，分段排序再拼接，跨段的倒叙会放错。例如第三段里的回忆，发生时间其实在第一段之前。方案要把这一点写成已知限制，或改为“先按段排序，再对各段的首尾事件做一次合并排序”。第一卷验收不受影响。
- 不关思考是合理选择。但这次请求不走 lane，`runImportGenerationLane` 直接执行（`novel-import-ai.ts:1112`），超时取模型默认值。思考模型处理 3 万字输入可能要几分钟，方案要给出超时或进度提示的预期，避免界面看起来卡死。

**建议：定序的输入太少。** 每项只给 160 字的 `text` 和 `time`，模型很难判断“这件事是回忆”。建议提取契约给每个事件加一个可选字段，标明它是回忆、日记或转述，并说明所指的发生时间（可复用现有的 `temporalScope`，`novel-import-semantics.ts:57` 已允许），再把它放进目录。

## 六、是否满足用户约束

- “一条世界线、按故事时间排序、每个事件有时间点”：方案做得到，验收第 1–3 条直接对应。
- “**所有**事件”：会话数据显示 213 章里有 108 章没有事件，覆盖不足的问题出在提取，不在排序。方案改了提取契约（“列出每个推动情节的事件”），但验收没有对应检查。建议加一条：第一卷每章至少有一个事件的证据，或者列出没有事件的章节，由人工确认确实没有情节事件。
- “正确的时间点”：只有带日期和能推出日期的事件是原文时间，其余是插值。要按必改 4 让作者能区分；验收第 4 条的锚点要写成具体日期，例如“穿越 = 1349-06-28”，而不只是先后关系。

**更简单的备选**：先只做名次（fixed 日历，`timeValue=名次×24`），不做日期。这样必改 2、3 都可以省掉，但用户看到的是“第 N 天”，不是故事日期，不满足“正确时间点”的字面要求。我认为方案现在的“有日期用公历，否则退回名次”是合适的折中，不建议降级。

## 七、必改清单

1. 新 intent 补齐 `novel-import-ai.ts:1194` 的 notFound 豁免、`main/novel-import.ts:2259` 的阶段白名单，以及 `ai-payload.ts:178,200` 的通用尾部（timeline 单独返回提示）；runtime-proof、semantics、context schema、response schema 按第二节表格逐项改。
2. `precision` 写到事件的 `time` 上；说明卡片显示到分钟是现有行为。
3. 重写严格递增规则：同日事件在当天内等分，跨日按整天，并补对应用例。
4. 契约写明没有年份的日期如何处理。
5. 让作者能看到“按先后推定”（写进 `fact`），或经用户确认只保存在数据中。
6. 第 21 步复核不得自动改写 `timeKind/timeValue/timeEnd`（从复核材料中去掉，或加入 `WIZARD_REVIEW_STRUCTURAL`），并补用例。
7. 清理标记的位置改为 `:1665-1667`、`:1795`、`:1819-1820`；schema 加约束；写明 timeline 之前步骤不算完成，并补暂停恢复用例。
8. 测试清单补上夹具 `linesAi/fullAi`、LP-12 和金样的实际变化范围（含新增分组、`wx` 写入方式）。

建议项：并简 `lineName/lineId` 的处理；新世界线 id 避免冲突；会话内按名次重排；处理 timeline 与待处理冲突；写明分段排序的限制和请求超时；目录加入回忆/转述标记；验收加入逐章覆盖检查和具体日期锚点。
